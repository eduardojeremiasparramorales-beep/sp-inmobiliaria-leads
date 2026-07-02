// Servicio de IA (NLP) usando OpenAI API

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TIMEOUT_DEFAULT = Number(process.env.OPENAI_TIMEOUT) || 10000;

// Cache simple con TTL 5 minutos: Map<key, { value, expiresAt }>
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

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY');
  const OpenAI = require('openai');
  return new OpenAI({ apiKey });
}

async function chatJSON(systemPrompt, userText, timeoutMs) {
  const client = getClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      response_format: { type: 'json_object' },
    }, { signal: controller.signal });
    clearTimeout(timer);
    const content = completion.choices[0].message.content;
    return JSON.parse(content);
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
      text,
      10000
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
      text,
      8000
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
    const historyText = (conversationHistory || [])
      .slice(-5)
      .map(m => `${m.role === 'customer' ? 'Cliente' : 'Vendedor'}: ${m.text}`)
      .join('\n');

    const client = getClient();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'Eres asesor inmobiliario de SP Inmobiliaria. Genera 3 respuestas profesionales para responder al cliente. Responde JSON: { suggestions: [string, string, string] }',
          },
          { role: 'user', content: `Cliente: ${customerName || 'Cliente'}\n\nHistorial:\n${historyText}` },
        ],
        response_format: { type: 'json_object' },
      }, { signal: controller.signal });
      clearTimeout(timer);
      const parsed = JSON.parse(completion.choices[0].message.content);
      return parsed.suggestions || [];
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  } catch (e) {
    console.error('suggestResponse error:', e.message);
    return [];
  }
}

async function extractEntities(text) {
  const cacheKey = `entities:${text}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  try {
    const result = await chatJSON(
      'Extrae entidades de este mensaje inmobiliario. Responde JSON: { locations: [], prices: [], propertyTypes: [] }',
      text,
      8000
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

module.exports = {
  analyzeSentiment, classifyIntent, suggestResponse, extractEntities, shouldAutoRespond,
};
