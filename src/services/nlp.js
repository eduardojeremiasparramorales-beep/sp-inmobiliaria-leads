const store = require('../db/store');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';
const TIMEOUT_DEFAULT = 15000;

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCache(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getConfig(key, fallback = '') {
  return store.getConfig(key) || process.env[`OPENROUTER_${key}`] || process.env[`OPENAI_${key}`] || fallback;
}

function isAIEnabled() {
  const enabled = store.getConfig('ai_enabled');
  if (enabled === 'false' || enabled === '0') return false;
  const apiKey = getApiKey();
  return !!apiKey;
}

function getApiKey() {
  return store.getConfig('openrouter_api_key') || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';
}

function getModel() {
  return store.getConfig('openrouter_model') || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

function getSiteUrl() {
  return store.getConfig('openrouter_site_url') || process.env.OPENROUTER_SITE_URL || 'https://spcrm.duckdns.org';
}

function getAppName() {
  return store.getConfig('openrouter_app_name') || process.env.OPENROUTER_APP_NAME || 'SP CRM';
}

function getClient() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No hay API key configurada para IA. Ve a Configuración → IA Copiloto.');
  const OpenAI = require('openai');
  return new OpenAI({
    baseURL: OPENROUTER_BASE,
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': getSiteUrl(),
      'X-Title': getAppName(),
    },
  });
}

async function chatJSON(systemPrompt, userText, timeoutMs) {
  const client = getClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || TIMEOUT_DEFAULT);
  try {
    const completion = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      response_format: { type: 'json_object' },
    }, { signal: controller.signal });
    clearTimeout(timer);
    const content = completion.choices[0].message.content;
    if (!content) throw new Error('Respuesta vacía del modelo');
    return JSON.parse(content);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function chatText(systemPrompt, userText, timeoutMs) {
  const client = getClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || TIMEOUT_DEFAULT);
  try {
    const completion = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
    }, { signal: controller.signal });
    clearTimeout(timer);
    return completion.choices[0].message.content || '';
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function analyzeSentiment(text) {
  const cacheKey = `sentiment:${text}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  try {
    const result = await chatJSON(
      "Analiza el sentimiento de este mensaje de un cliente inmobiliario. Responde SOLO con JSON: { score: -1..1, label: 'positivo'|'neutral'|'negativo', keywords: [] }",
      text, 10000
    );
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    console.error('analyzeSentiment error:', e.message);
    return { score: 0, label: 'neutral', keywords: [] };
  }
}

async function classifyIntent(text) {
  const cacheKey = `intent:${text}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  try {
    const result = await chatJSON(
      'Clasifica la intención de este mensaje inmobiliario. Opciones: precio, ubicacion, visita, queja, info_general. Responde JSON: { intent, confidence: 0-1 }',
      text, 8000
    );
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    console.error('classifyIntent error:', e.message);
    return { intent: 'info_general', confidence: 0 };
  }
}

async function suggestResponse(conversationHistory, customerName) {
  try {
    const historyText = (conversationHistory || []).slice(-6).map(m => `${m.role === 'customer' ? 'Cliente' : 'Vendedor'}: ${m.text}`).join('\n');
    const result = await chatJSON(
      'Eres asesor inmobiliario de SP Inmobiliaria, una firma colombiana de lotes de inversión. Genera 3 respuestas profesionales y persuasivas para responder al cliente. Cada respuesta debe ser natural, no sonar a robot. Responde SOLO JSON: { suggestions: [string, string, string] }',
      `Cliente: ${customerName || 'Cliente'}\n\nHistorial:\n${historyText || 'Sin historial previo. Es el primer mensaje.'}`,
      15000
    );
    return result.suggestions || [];
  } catch (e) {
    console.error('suggestResponse error:', e.message);
    return [];
  }
}

async function analyzeLead(conversationHistory, customerName, leadStage) {
  try {
    const historyText = (conversationHistory || []).slice(-10).map(m => `${m.role === 'customer' ? 'Cliente' : 'Vendedor'}: ${m.text}`).join('\n');
    const result = await chatJSON(
      `Eres un analista inmobiliario experto. Analiza este lead de SP Inmobiliaria (venta de lotes en Colombia).
      Responde SOLO JSON con esta estructura exacta:
      {
        "summary": "resumen de 1-2 líneas del lead",
        "sentiment": "positivo|neutral|negativo",
        "sentimentScore": número entre -1 y 1,
        "intent": "precio|ubicacion|visita|queja|info_general",
        "objections": ["objeción 1", "objeción 2"],
        "closeProbability": número entre 0 y 100,
        "nextAction": "recomendación de siguiente acción",
        "suggestedResponse": "respuesta sugerida para el vendedor"
      }`,
      `Cliente: ${customerName || 'Cliente'}\nEtapa actual: ${leadStage || 'nuevo'}\n\nHistorial:\n${historyText || 'Sin historial todavía'}`,
      20000
    );
    return result;
  } catch (e) {
    console.error('analyzeLead error:', e.message);
    return {
      summary: 'No se pudo analizar el lead',
      sentiment: 'neutral',
      sentimentScore: 0,
      intent: 'info_general',
      objections: [],
      closeProbability: 50,
      nextAction: 'Contactar al cliente',
      suggestedResponse: ''
    };
  }
}

async function extractEntities(text) {
  const cacheKey = `entities:${text}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  try {
    const result = await chatJSON(
      'Extrae entidades de este mensaje inmobiliario. Responde JSON: { locations: [], prices: [], propertyTypes: [] }',
      text, 8000
    );
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    console.error('extractEntities error:', e.message);
    return { locations: [], prices: [], propertyTypes: [] };
  }
}

async function shouldAutoRespond(text) {
  try {
    const { intent, confidence } = await classifyIntent(text);
    const contieneQueja = /queja|reclamo|molesto|problema|malo/i.test(text);
    if (intent === 'info_general' && confidence > 0.9 && !contieneQueja) return true;
    return false;
  } catch (e) {
    return false;
  }
}

async function dailyBriefing(vendedor, stats) {
  try {
    const result = await chatJSON(
      `Eres un coach de ventas inmobiliarias. Genera un briefing diario para un vendedor.
      Responde SOLO JSON:
      {
        "tip": "consejo de venta personalizado de 1 línea",
        "priorityAction": "qué debería hacer ahora mismo",
        "fraseDelDia": "frase motivacional corta"
      }`,
      `Vendedor: ${vendedor.nombre || 'Vendedor'}\nLeads activos: ${stats.activos || 0}\nSin responder: ${stats.sinResponder || 0}\nVentas: ${stats.ventas || 0}`,
      12000
    );
    return result;
  } catch (e) {
    return {
      tip: 'Prioriza los leads sin responder — la velocidad de respuesta define la venta.',
      priorityAction: 'Revisa tus leads pendientes',
      fraseDelDia: 'El éxito es la suma de pequeños esfuerzos repetidos día tras día.'
    };
  }
}

module.exports = {
  analyzeSentiment, classifyIntent, suggestResponse, extractEntities, shouldAutoRespond,
  analyzeLead, dailyBriefing, chatText, chatJSON, isAIEnabled, getModel, getApiKey,
};
