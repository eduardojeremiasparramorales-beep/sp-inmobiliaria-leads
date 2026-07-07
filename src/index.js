require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const store = require('./db/store');
const { initDB, getLeads, getLeadCount, addVendedor, getVendedores, setVendedorEstado, getLeadsSinRespuesta, incrementEscalation, getDB, deleteVendedor, getAdminInbox, getAdminInboxStats } = store;
const { handleVerification } = require('./webhook/verify');
const { handleMessage } = require('./webhook/messages');
const { sendMessage, sendMessageSmart, uploadMedia, sendMedia } = require('./services/whatsapp');
const mediaStore = require('./services/media');
const { convertToOggOpus, getPlayableAudioPath } = require('./services/audio');

// Sirve un archivo de media. Para audio, lo transcodifica a m4a si hace falta
// (iOS/Safari no reproduce OGG/Opus) y aprovecha el soporte de HTTP Range de sendFile.
async function sendMediaFile(res, filePath, mime, mediaType) {
  const esAudio = mediaType === 'audio' || String(mime || '').startsWith('audio/');
  if (esAudio) {
    try {
      const p = await getPlayableAudioPath(filePath, mime);
      const ct = p.mime || mime || 'audio/mp4';
      // Forzar Content-Type ANTES de sendFile para evitar que Express lo infiera de la extensión
      res.set('Content-Type', ct);
      return res.sendFile(p.path, { headers: { 'Content-Type': ct, 'Accept-Ranges': 'bytes' } });
    } catch (e) {
      console.error('[MEDIA] audio playable falló:', e.message);
    }
  }
  if (mime) res.set('Content-Type', mime);
  res.sendFile(filePath, { headers: { 'Content-Type': mime || 'application/octet-stream' } });
}
const auth = require('./services/auth');
const events = require('./services/events');
const push = require('./services/push');

const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const CFG = require('./config');

const app = express();
app.set('trust proxy', 1);
// Guardar el body crudo para verificar la firma del webhook de Meta
app.use(express.json({
  limit: '30mb',
  verify: (req, res, buf) => { if (req.originalUrl.startsWith('/webhook')) req.rawBody = buf; },
}));
// Twilio envía sus webhooks como application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// Headers de seguridad en todas las respuestas
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'");
  if (req.headers['x-forwarded-proto'] === 'https' || req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Verificación de firma del webhook (X-Hub-Signature-256, requiere APP_SECRET en .env)
function verifyWebhookSignature(req, res, next) {
  const secret = process.env.APP_SECRET || process.env.META_APP_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('ERROR CRÍTICO: APP_SECRET no configurado en producción — rechazando webhook');
      return res.sendStatus(500);
    }
    return next();
  }
  const sig = req.headers['x-hub-signature-256'];
  if (!sig || !req.rawBody) {
    console.warn('Webhook sin firma — rechazado');
    return res.sendStatus(401);
  }
  const esperado = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) {
      console.warn('Webhook con firma inválida — rechazado');
      return res.sendStatus(401);
    }
  } catch (e) { return res.sendStatus(401); }
  next();
}

// Rate limiting: protección básica anti-DoS
const loginLimiter = rateLimit({ windowMs: CFG.LOGIN_WINDOW_MS, max: CFG.LOGIN_MAX_ATTEMPTS, standardHeaders: true, legacyHeaders: false, message: { error: 'demasiados_intentos' } });
const mediaLimiter = rateLimit({ windowMs: 60 * 1000, max: CFG.MEDIA_MAX_PER_MIN, standardHeaders: true, legacyHeaders: false, message: { error: 'demasiadas_peticiones' } });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: CFG.WEBHOOK_MAX_PER_MIN, standardHeaders: false, legacyHeaders: false });
const messageLimiter = rateLimit({ windowMs: 60 * 1000, max: CFG.MESSAGE_MAX_PER_MIN, standardHeaders: true, legacyHeaders: false, message: { error: 'demasiados_mensajes_espera' } });

// SW con versión dinámica (se invalida el caché en cada reinicio del servidor)
const SW_VERSION = `sp-panel-${Date.now()}`;
app.get('/sw.js', (req, res) => {
  try {
    const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8')
      .replace('__SW_VERSION__', SW_VERSION);
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(content);
  } catch (e) {
    res.status(500).send('// sw.js not found');
  }
});

app.use(express.static('public', {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.html') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.includes('icons')) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  },
}));

// Validación de teléfono colombiano (formato: +57 3XX XXX XXXX)
function validarTelefono(phone) {
  return /^\+57\d{10}$/.test(String(phone).replace(/[\s-]/g, ''));
}

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.json({ status: 'ok', service: 'SP OS', version: '1.1.0' }));

app.get('/api/health', (req, res) => {
  const dbOk = (() => { try { return !!store.getDB(); } catch { return false; } })();
  res.json({ status: dbOk ? 'ok' : 'error', timestamp: new Date().toISOString(), db: dbOk ? 'connected' : 'disconnected', uptime: process.uptime() });
});

app.get('/webhook', handleVerification);
app.post('/webhook', webhookLimiter, verifyWebhookSignature, handleMessage);

// ===================== ESTADO DE CANALES =====================

app.get('/api/channels/status', auth.requireAdmin, (req, res) => {
  res.json({
    whatsapp: !!process.env.WHATSAPP_TOKEN,
    messenger: !!process.env.FACEBOOK_PAGE_TOKEN,
    instagram: !!process.env.INSTAGRAM_TOKEN,
  });
});

app.get('/api/channels/:name/test', auth.requireAdmin, async (req, res) => {
  const { name } = req.params;
  try {
    const { getAdapter } = require('./channels');
    const adapter = getAdapter(name);
    if (!adapter) return res.status(404).json({ ok: false, error: 'canal_no_existe' });
    // Verificamos que la config mínima esté presente (levanta error si falta)
    if (name === 'whatsapp') adapter.getApiConfig();
    else adapter.getConfig();
    res.json({ ok: true, canal: name, configurado: true });
  } catch (e) {
    res.json({ ok: false, canal: name, configurado: false, error: e.message });
  }
});

// ===================== IA / COPILOTO (NLP con OpenRouter) =====================

app.post('/api/nlp/test', auth.requireAdmin, async (req, res) => {
  try {
    const nlp = require('./services/nlp');
    if (!nlp.isAIEnabled()) return res.status(400).json({ ok: false, error: 'IA desactivada. Configura una API Key en Ajustes → IA Copiloto.' });
    const texto = (req.body && req.body.texto) || 'Hola, me interesan los lotes';
    const [sentiment, intent] = await Promise.all([
      nlp.analyzeSentiment(texto),
      nlp.classifyIntent(texto),
    ]);
    res.json({ ok: true, texto, sentiment, intent, model: nlp.getModel() });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.post('/api/nlp/suggest-response', auth.requireAuth, async (req, res) => {
  try {
    const nlp = require('./services/nlp');
    if (!nlp.isAIEnabled()) return res.json({ ok: true, suggestions: [] });
    const { leadId, customerName } = req.body || {};
    if (!leadId) return res.status(400).json({ error: 'leadId requerido' });

    const lead = store.getLeadById(leadId);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    const mensajes = store.getMessagesByLead(leadId) || [];
    const history = mensajes.map(m => ({ role: m.direction === 'incoming' ? 'customer' : 'seller', text: m.body }));
    const name = customerName || lead.nombre;

    const suggestions = await nlp.suggestResponse(history, name);
    res.json({ ok: true, suggestions, model: nlp.getModel() });
  } catch (e) {
    console.error('[NLP] suggest-response error:', e.message);
    res.json({ ok: true, suggestions: [] });
  }
});

app.post('/api/nlp/analyze-lead', auth.requireAuth, async (req, res) => {
  try {
    const nlp = require('./services/nlp');
    if (!nlp.isAIEnabled()) return res.json({ ok: true, analysis: null });
    const { leadId, customerName } = req.body || {};
    if (!leadId) return res.status(400).json({ error: 'leadId requerido' });

    const lead = store.getLeadById(leadId);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    const mensajes = store.getMessagesByLead(leadId) || [];
    const history = mensajes.map(m => ({ role: m.direction === 'incoming' ? 'customer' : 'seller', text: m.body }));
    const name = customerName || lead.nombre;

    const analysis = await nlp.analyzeLead(history, name, lead.etiqueta);
    res.json({ ok: true, analysis, model: nlp.getModel() });
  } catch (e) {
    console.error('[NLP] analyze-lead error:', e.message);
    res.json({ ok: true, analysis: null });
  }
});

app.post('/api/nlp/daily-briefing', auth.requireAuth, async (req, res) => {
  try {
    const nlp = require('./services/nlp');
    if (!nlp.isAIEnabled()) return res.json({ ok: true, briefing: null });
    const session = req.session;
    const vs = store.getVendedores().find(v => v.id === session.vendedorId);
    const misLeads = store.getLeadsByVendedorId(session.vendedorId) || [];
    const sinRespuesta = (store.getLeadsSinRespuesta() || []).filter(l => l.assigned_to_id === session.vendedorId);
    const stats = {
      activos: misLeads.length,
      sinResponder: sinRespuesta.length,
      ventas: misLeads.filter(l => l.etiqueta === 'vendido').length,
    };
    const briefing = await nlp.dailyBriefing(vs || { nombre: session.nombre }, stats);
    res.json({ ok: true, briefing, stats, model: nlp.getModel() });
  } catch (e) {
    console.error('[NLP] daily-briefing error:', e.message);
    res.json({ ok: true, briefing: null, stats: {} });
  }
});

// ===================== CHAT IA (ChatGPT-style) =====================

app.post('/api/nlp/chat', auth.requireAuth, async (req, res) => {
  try {
    const nlp = require('./services/nlp');
    if (!nlp.isAIEnabled()) return res.status(400).json({ error: 'IA desactivada. Configura una API Key en el panel de Chat IA → Proveedores.' });
    const { message, history, providerId, model } = req.body || {};
    if (!message || !message.trim()) return res.status(400).json({ error: 'Mensaje requerido' });
    const ctx = (history || []).map(m => `${m.role}: ${m.content}`).join('\n');
    const reply = await nlp.chatText(
      `Eres Copiloto SP, el asistente IA de SP Inmobiliaria, una firma colombiana de inversión en lotes.
      Ayudas a los vendedores del equipo a mejorar sus ventas, redactar mensajes, analizar leads, y resolver dudas.
      Responde de forma clara, profesional y en español.`,
      `${ctx ? 'Contexto:\n' + ctx + '\n\n' : ''}Mensaje: ${message}`,
      45000,
      { providerId, model }
    );
    res.json({ ok: true, reply, model: model || nlp.getModel() });
  } catch (e) {
    console.error('[NLP] chat error:', e.message);
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ── Proveedores de IA (admin): multi-proveedor, cada uno con su base URL + API key ──
const AI_PRESETS = {
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  groq: { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
};

app.get('/api/ai/providers', auth.requireAdmin, (req, res) => {
  const nlp = require('./services/nlp');
  const providers = nlp.getProviders().map(p => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    hasKey: !!p.apiKey,
    keyMask: p.apiKey ? '••••••' + String(p.apiKey).slice(-4) : '',
    models: p.models || [],
  }));
  res.json({ providers, defaultId: nlp.getDefaultProviderId(), presets: AI_PRESETS });
});

app.post('/api/ai/providers', auth.requireAdmin, (req, res) => {
  const nlp = require('./services/nlp');
  const { providers, defaultId } = req.body || {};
  if (!Array.isArray(providers)) return res.status(400).json({ error: 'providers debe ser un arreglo' });
  const existing = nlp.getProviders();
  const clean = providers.map(p => {
    let apiKey = String(p.apiKey || '').trim();
    // Si la key viene vacía o enmascarada, conservar la existente de ese proveedor.
    if (!apiKey || apiKey.startsWith('••••')) {
      const prev = existing.find(x => x.id === p.id);
      apiKey = prev ? prev.apiKey : '';
    }
    const id = String(p.id || p.name || 'prov').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'prov';
    return {
      id,
      name: String(p.name || p.id || 'Proveedor').slice(0, 60),
      baseUrl: String(p.baseUrl || '').trim(),
      apiKey,
      models: Array.isArray(p.models) ? p.models.map(m => String(m).trim()).filter(Boolean).slice(0, 100) : [],
    };
  }).filter(p => p.baseUrl);
  nlp.saveProviders(clean, defaultId);
  res.json({ ok: true });
});

app.get('/api/ai/models', auth.requireAdmin, async (req, res) => {
  const nlp = require('./services/nlp');
  try {
    const models = await nlp.fetchModels(req.query.providerId);
    res.json({ ok: true, models });
  } catch (e) {
    res.json({ ok: false, models: [], error: e.message });
  }
});

// ===================== API PÚBLICA v2 =====================
app.use('/api/v2', require('./api/v2'));

// ===================== WEBHOOKS MULTICANAL =====================
const channels = require('./channels');
channels.bootstrapChannels();

app.get('/webhook/messenger', require('./channels/messenger').handleMessengerVerification);
app.get('/webhook/instagram', require('./channels/instagram').handleInstagramVerification);
app.post('/webhook/:channel', webhookLimiter, channels.webhookReceiver);

// API stats
app.get('/api/stats', auth.requireAuth, (req, res) => {
  const vendedores = getVendedores();
  res.json({
    totalVendedores: vendedores.length,
    vendedores,
    leadsRegistrados: getLeadCount(),
    vendedoresActivos: vendedores.filter(v => v.estado === 'activo').length,
  });
});

app.get('/api/leads', auth.requireAdmin, (req, res) => {
  const { limite, offset, busqueda, etiqueta, vendedorId } = req.query;
  if (limite || offset || busqueda || etiqueta || vendedorId) {
    return res.json(store.getAdminInbox({ busqueda, etiqueta, vendedorId, limite, offset }));
  }
  return res.json(getLeads());
});

// Métricas reales para el dashboard (admin)
app.get('/api/metricas', auth.requireAdmin, (req, res) => {
  try {
    const leads = getLeads();
    const vendedores = getVendedores();
    const total = leads.length;

    const porEtiqueta = {};
    ['sin_clasificar', 'interesado', 'negociacion', 'cita', 'vendido', 'no_interesado'].forEach(e => porEtiqueta[e] = 0);
    const porEstado = {};
    let respondidos = 0, sumaRespuestaMin = 0;
    leads.forEach(l => {
      const etq = l.etiqueta || 'sin_clasificar';
      porEtiqueta[etq] = (porEtiqueta[etq] || 0) + 1;
      const st = l.status || 'nuevo';
      porEstado[st] = (porEstado[st] || 0) + 1;
      if (l.first_response_at && l.created_at) {
        const t0 = new Date(l.created_at.replace(' ', 'T') + 'Z').getTime();
        const t1 = new Date(l.first_response_at.replace(' ', 'T') + 'Z').getTime();
        if (t1 >= t0) { respondidos++; sumaRespuestaMin += (t1 - t0) / 60000; }
      }
    });

    const porVendedor = vendedores.map(v => {
      const suyos = leads.filter(l => Number(l.assigned_to_id) === Number(v.id));
      const vendidos = suyos.filter(l => (l.etiqueta || '') === 'vendido').length;
      const activos = suyos.filter(l => (l.status || '') !== 'cerrado').length;
      return {
        id: v.id, nombre: v.nombre, estado: v.estado,
        total: suyos.length, activos, vendidos,
        conversion: suyos.length ? Math.round((vendidos / suyos.length) * 100) : 0,
      };
    }).sort((a, b) => b.total - a.total);

    const vendidosTotal = porEtiqueta['vendido'] || 0;

    // Conteo total de mensajes (entrantes + salientes) del número principal
    let totalMensajes = 0, mensajesEntrantes = 0;
    try {
      const dbx = getDB();
      const rm = dbx.exec('SELECT COUNT(*) FROM messages');
      totalMensajes = (rm.length && rm[0].values.length) ? rm[0].values[0][0] : 0;
      const ri = dbx.exec("SELECT COUNT(*) FROM messages WHERE direction = 'incoming'");
      mensajesEntrantes = (ri.length && ri[0].values.length) ? ri[0].values[0][0] : 0;
    } catch (e) { /* noop */ }

    res.json({
      total,
      totalMensajes,
      mensajesEntrantes,
      vendidos: vendidosTotal,
      conversionGlobal: total ? Math.round((vendidosTotal / total) * 100) : 0,
      tiempoRespuestaPromedio: respondidos ? Math.round(sumaRespuestaMin / respondidos) : null,
      respondidos,
      sinResponder: leads.filter(l => !l.first_response_at && (l.status || '') !== 'cerrado').length,
      porEtiqueta,
      porEstado,
      porVendedor,
    });
  } catch (e) {
    console.error('Error en /api/metricas:', e.message);
    res.status(500).json({ error: 'error_metricas' });
  }
});

// Reportes detallados (admin)
app.get('/api/reportes', auth.requireAdmin, (req, res) => {
  try {
    const dbx = getDB();
    const all = getLeads(true);
    const vendedores = getVendedores();

    // Leads por día (últimos 30)
    const leadsPorDia = dbx.exec(`
      SELECT date(created_at) as dia, COUNT(*) as total
      FROM leads WHERE created_at >= datetime('now', '-30 days')
      GROUP BY dia ORDER BY dia
    `);
    const leadsDiarios = (leadsPorDia[0] && leadsPorDia[0].values) ? leadsPorDia[0].values.map(r => ({ dia: r[0], total: r[1] })) : [];

    // Mensajes por día (últimos 30)
    const msgsPorDia = dbx.exec(`
      SELECT date(timestamp) as dia, COUNT(*) as total
      FROM messages WHERE timestamp >= datetime('now', '-30 days')
      GROUP BY dia ORDER BY dia
    `);
    const msgsDiarios = (msgsPorDia[0] && msgsPorDia[0].values) ? msgsPorDia[0].values.map(r => ({ dia: r[0], total: r[1] })) : [];

    // Origen
    const origen = {};
    all.forEach(l => { const o = l.origen || 'desconocido'; origen[o] = (origen[o] || 0) + 1; });

    // Leads por hora
    const porHora = dbx.exec(`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) as h, COUNT(*) as total
      FROM leads GROUP BY h ORDER BY h
    `);
    const horaDist = (porHora[0] && porHora[0].values) ? porHora[0].values.map(r => ({ h: r[0], total: r[1] })) : [];

    // Rendimiento detallado por vendedor
    const vendData = vendedores.map(v => {
      const suyos = all.filter(l => Number(l.assigned_to_id) === Number(v.id));
      const vendidos = suyos.filter(l => l.etiqueta === 'vendido').length;
      const activos = suyos.filter(l => l.status !== 'cerrado').length;
      const respondidos = suyos.filter(l => l.first_response_at).length;
      const tot = suyos.length;
      let tiempoResp = null;
      if (tot && respondidos) {
        let suma = 0, count = 0;
        suyos.forEach(l => {
          if (l.first_response_at && l.created_at) {
            const t0 = new Date(l.created_at.replace(' ', 'T') + 'Z').getTime();
            const t1 = new Date(l.first_response_at.replace(' ', 'T') + 'Z').getTime();
            if (t1 >= t0) { suma += (t1 - t0) / 60000; count++; }
          }
        });
        tiempoResp = count ? Math.round(suma / count) : null;
      }
      return { id: v.id, nombre: v.nombre, estado: v.estado, total: tot, activos, vendidos, respondidos, conversion: tot ? Math.round((vendidos / tot) * 100) : 0, tiempoRespuesta: tiempoResp };
    }).sort((a, b) => b.total - a.total);

    // Etiquetas distribución
    const porEtiqueta = { sin_clasificar: 0, interesado: 0, negociacion: 0, cita: 0, vendido: 0 };
    all.forEach(l => { const e = l.etiqueta || 'sin_clasificar'; if (porEtiqueta[e] !== undefined) porEtiqueta[e]++; });

    res.json({
      leadsDiarios, msgsDiarios, origen, horaDist,
      porEtiqueta, vendData,
      totalLeads: all.length,
      totalVendidos: porEtiqueta.vendido || 0,
    });
  } catch (e) {
    console.error('Error en /api/reportes:', e.message);
    res.status(500).json({ error: 'error_reportes' });
  }
});

app.get('/api/vendedores', auth.requireAuth, (req, res) => res.json(getVendedores()));

app.get('/api/vendedores/:id', auth.requireAdmin, (req, res) => {
  const v = store.getVendedorById(req.params.id);
  if (!v) return res.status(404).json({ error: 'no_encontrado' });
  const u = store.getUsuarioByVendedorId(v.id);
  res.json({
    id: v.id, nombre: v.nombre, telefono: v.telefono, estado: v.estado,
    tienePin: !!v.pin, usuarioId: u ? u.id : null, usuarioEmail: u ? u.email : null,
  });
});

app.post('/api/vendedores', auth.requireAdmin, (req, res) => {
  const { nombre, telefono, pin } = req.body;
  if (!nombre || !telefono) return res.status(400).json({ error: 'nombre y telefono requeridos' });
  if (!validarTelefono(telefono)) return res.status(400).json({ error: 'formato_telefono_invalido_debe_ser_57' });
  const vendedorId = addVendedor(nombre.trim(), telefono.replace(/[\s-]/g, ''));
  if (pin && String(pin).length === 4 && /^\d{4}$/.test(String(pin))) {
    store.setVendedorPin(vendedorId, auth.hashPassword(String(pin)));
  }
  res.json({ ok: true, vendedorId });
});

app.post('/api/vendedores/:id/pin', auth.requireAdmin, (req, res) => {
  const { pin } = req.body || {};
  if (!pin || !/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'PIN debe ser 4 dígitos' });
  store.setVendedorPin(req.params.id, auth.hashPassword(String(pin)));
  res.json({ ok: true });
});

app.post('/api/vendedores/:id/telefono', auth.requireAdmin, (req, res) => {
  const { telefono } = req.body || {};
  if (!telefono) return res.status(400).json({ error: 'telefono_requerido' });
  let t = String(telefono).replace(/[\s-]/g, '');
  if (t.startsWith('57') && !t.startsWith('+')) t = '+' + t;
  if (!/^\+57\d{10}$/.test(t)) return res.status(400).json({ error: 'formato_invalido_debe_ser_57_10_digitos' });
  store.setVendedorTelefono(req.params.id, t);
  res.json({ ok: true, telefono: t });
});

app.post('/api/vendedores/:id/estado', auth.requireAuth, (req, res) => {
  const { estado } = req.body;
  const estadosValidos = ['activo', 'ocupado', 'inactivo', 'vacaciones', 'suspendido'];
  if (!estadosValidos.includes(estado)) return res.status(400).json({ error: 'estado invalido' });
  // Un vendedor solo puede cambiar su propio estado; el admin, el de cualquiera
  if (req.session.rol !== 'admin' && Number(req.params.id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  setVendedorEstado(req.params.id, estado);
  res.json({ ok: true });
});

// ===================== AUTENTICACIÓN =====================

app.post('/api/login', loginLimiter, (req, res) => {
  const { email, password, telefono, pin } = req.body || {};
  const secure = (process.env.SECURE_COOKIES === 'true' || req.headers['x-forwarded-proto'] === 'https' || req.secure) ? '; Secure' : '';
  const MAX_AGE = CFG.SESSION_TTL_MS / 1000; // 30 días en segundos

  // Destruir sesión anterior si existe (session fixation prevention)
  const oldToken = auth.getTokenFromReq(req);
  if (oldToken) auth.destroySession(oldToken);

  // Teléfono + PIN (vendedor o admin)
  if (telefono && pin) {
    const tel = String(telefono).trim();
    let vendedor = store.getVendedorByTelefono(tel);
    // Fallback: buscar sin prefijo + (por si se almacenó sin él)
    if (!vendedor && tel.startsWith('+57')) {
      vendedor = store.getVendedorByTelefono(tel.replace('+', ''));
    }
    if (!vendedor) {
      console.log('[LOGIN] Vendedor no encontrado para teléfono:', tel);
      return res.status(401).json({ error: 'credenciales_invalidas' });
    }
    if (!vendedor.pin) {
      console.log('[LOGIN] Vendedor sin PIN:', vendedor.nombre, vendedor.id);
      return res.status(401).json({ error: 'credenciales_invalidas' });
    }
    if (!auth.verifyPassword(String(pin), vendedor.pin)) {
      console.log('[LOGIN] PIN incorrecto para:', vendedor.nombre, vendedor.id);
      return res.status(401).json({ error: 'credenciales_invalidas' });
    }
    // Verificar si tiene rol admin
    const usuario = store.getUsuarioByVendedorId(vendedor.id);
    const rol = usuario && usuario.rol === 'admin' ? 'admin' : 'vendedor';
    const token = auth.createSession({ vendedorId: vendedor.id, userId: usuario ? usuario.id : null, rol, nombre: vendedor.nombre });
    res.setHeader('Set-Cookie', `sp_session=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`);
    return res.json({ ok: true, token, usuario: { nombre: vendedor.nombre, rol, vendedorId: vendedor.id } });
  }

  // Email + contraseña (legacy admin)
  if (email && password) {
    const usuario = store.getUsuarioByEmail(String(email).toLowerCase().trim());
    if (!usuario || !auth.verifyPassword(password, usuario.password)) {
      return res.status(401).json({ error: 'credenciales_invalidas' });
    }
    const token = auth.createSession(usuario);
    res.setHeader('Set-Cookie', `sp_session=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`);
    return res.json({ ok: true, token, usuario: { nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, vendedorId: usuario.vendedor_id } });
  }

  return res.status(400).json({ error: 'credenciales_requeridas' });
});

app.post('/api/logout', auth.requireAuth, (req, res) => {
  auth.destroySession(req.token);
  const secure = (process.env.SECURE_COOKIES === 'true' || req.headers['x-forwarded-proto'] === 'https' || req.secure) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sp_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`);
  res.json({ ok: true });
});

app.get('/api/me', auth.requireAuth, (req, res) => {
  const v = req.session.vendedorId ? store.getVendedorById(req.session.vendedorId) : null;
  res.json({
    nombre: req.session.nombre, email: req.session.email,
    rol: req.session.rol, vendedorId: req.session.vendedorId,
    telefono: v ? v.telefono : null,
    foto: v ? v.foto : null,
    estado: v ? v.estado : null,
  });
});

app.post('/api/me/nombre', auth.requireAuth, (req, res) => {
  const { nombre } = req.body || {};
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'nombre_requerido' });
  if (!req.session.vendedorId) return res.status(400).json({ error: 'sin_vendedor' });
  store.setVendedorNombre(req.session.vendedorId, String(nombre).trim());
  if (req.session.userId) {
    try { const a = require('./db/adapter'); a.run('UPDATE usuarios SET nombre = ? WHERE id = ?', [String(nombre).trim(), req.session.userId]); } catch (e) {}
  }
  req.session.nombre = String(nombre).trim();
  res.json({ ok: true, nombre: String(nombre).trim() });
});

app.post('/api/me/foto', auth.requireAuth, (req, res) => {
  const { foto } = req.body || {};
  if (!foto) return res.status(400).json({ error: 'foto_requerida' });
  if (!req.session.vendedorId) return res.status(400).json({ error: 'sin_vendedor' });
  store.setVendedorFoto(req.session.vendedorId, String(foto));
  res.json({ ok: true });
});

app.get('/api/me/metricas', auth.requireAuth, (req, res) => {
  const vendedorId = req.session.vendedorId;
  if (!vendedorId) return res.json({ leadsActivos: 0, leadsHoy: 0, leadsCerrados: 0, tasaRespuesta: 0, ultimaActividad: null });
  res.json(store.getVendedorMetricas(vendedorId));
});

// ===================== PANEL DEL VENDEDOR =====================

// Leads asignados al vendedor logueado (admin ve todos)
app.get('/api/mis-leads', auth.requireAuth, (req, res) => {
  if (req.session.rol === 'admin') return res.json(getLeads());
  if (!req.session.vendedorId) return res.json([]);
  const leads = store.getLeadsByVendedorId(req.session.vendedorId);
  const limite = Math.min(Number(req.query.limite) || leads.length, 200);
  res.json(leads.slice(0, limite));
});

app.get('/api/mis-leads/archivados', auth.requireAuth, (req, res) => {
  if (!req.session.vendedorId) return res.json([]);
  res.json(store.getArchivedLeadsByVendedorId(req.session.vendedorId));
});

// Historial de mensajes de un lead (solo si le pertenece o es admin)
app.get('/api/leads/:id/mensajes', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const mensajes = store.getMessagesByLead(lead.id);
  // Adjuntar reacciones a cada mensaje
  const msgIds = mensajes.map(m => m.id);
  const reactionsMap = store.getReactionsForMessages(msgIds);
  const mensajesConReacciones = mensajes.map(m => ({
    ...m,
    reactions: reactionsMap[m.id] || [],
  }));
  res.json({ lead, mensajes: mensajesConReacciones });
});

// Estado de la ventana de 24h de WhatsApp para un lead
app.get('/api/leads/:id/window-status', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  const isOpen = store.isWindowOpen(lead.id);
  const expiresAt = store.getWindowExpiresAt(lead.id);
  const templateName = store.getConfig('reengagement_template') || '';
  res.json({ open: isOpen, expiresAt, templateName });
});

// ===================== INBOX MULTICANAL (Nuevo Schema) =====================

app.get('/api/inbox/conversations', auth.requireAuth, (req, res) => {
  if (req.session.rol === 'admin') return res.json(store.getConversations({ limite: 200 }));
  if (!req.session.vendedorId) return res.json([]);
  res.json(store.getConversationsByVendedorId(req.session.vendedorId));
});

app.get('/api/inbox/conversations/:id/timeline', auth.requireAuth, (req, res) => {
  const conv = store.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  if (req.session.rol !== 'admin' && Number(conv.assigned_to_id) !== Number(req.session.vendedorId))
    return res.status(403).json({ error: 'sin_permiso' });
  res.json({ conversation: conv, messages: store.getTimelineByConversation(conv.id) });
});

app.post('/api/inbox/conversations/:id/send', auth.requireAuth, async (req, res) => {
  const { mensaje } = req.body || {};
  if (!mensaje || !String(mensaje).trim()) return res.status(400).json({ error: 'mensaje_vacio' });
  const conv = store.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  if (req.session.rol !== 'admin' && Number(conv.assigned_to_id) !== Number(req.session.vendedorId))
    return res.status(403).json({ error: 'sin_permiso' });
  try {
    const MessageRouter = require('./services/router');
    await MessageRouter.routeOutgoing(conv.id, req.session.vendedorId, String(mensaje).trim());
    // Espejo hacia el lead legacy para que el vendedor lo vea en su panel
    if (conv.lead_id) {
      try {
        const lead = store.getLeadById(conv.lead_id);
        if (lead) {
          store.saveMessage(lead.id, 'panel', lead.customer_phone, String(mensaje).trim(), 'outgoing');
          store.setFirstResponse(lead.id);
          if (lead.status === 'nuevo' || lead.status === 'asignado') store.updateLeadStatus(lead.id, 'contactado');
          events.emitToVendedor(lead.assigned_to_id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
        }
      } catch (e) { console.error('send espejo lead:', e.message); }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('Error enviando por inbox:', e.message);
    res.status(502).json({ error: 'error_envio', detalle: e.message });
  }
});

app.get('/api/inbox/conversations/:id/leido', auth.requireAuth, async (req, res) => {
  const conv = store.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  const adapter = require('./db/adapter'); adapter.run('UPDATE conversations SET unread_count = 0 WHERE id = ?', [conv.id]);
  res.json({ ok: true });
});

app.get('/api/inbox/unified-conversations', auth.requireAuth, (req, res) => {
  if (req.session.rol !== 'admin') return res.json([]);
  const { busqueda, vendedorId, limite } = req.query;
  res.json(store.getUnifiedConversations({ busqueda, vendedorId, limite }));
});

app.post('/api/inbox/leads/:id/open', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId))
    return res.status(403).json({ error: 'sin_permiso' });
  const conversation = store.getOrCreateConversationForLead(lead.id);
  if (!conversation) return res.status(500).json({ error: 'error_conversion' });
  res.json({ conversation });
});

app.post('/api/inbox/conversations/:id/etiqueta', auth.requireAuth, (req, res) => {
  const { etiqueta } = req.body || {};
  const conv = store.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  if (etiqueta) {
    store.updateConversationTag(conv.id, etiqueta);
    if (conv.lead_id) { try { store.setLeadEtiqueta(conv.lead_id, etiqueta); } catch (e) { } }
  }
  res.json({ ok: true });
});

app.post('/api/inbox/conversations/:id/notas', auth.requireAuth, (req, res) => {
  const { nota } = req.body || {};
  if (!nota || !nota.trim()) return res.status(400).json({ error: 'nota_vacia' });
  const conv = store.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  store.addTimelineEvent(conv.id, 'note', {
    body: nota.trim(),
    direction: 'system',
    channel: conv.channel,
  });
  res.json({ ok: true });
});

app.get('/api/inbox/conversations/:id/notas', auth.requireAuth, (req, res) => {
  const conv = store.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  const notas = store.getTimelineByConversation(conv.id)
    .filter(m => m.event_type === 'note')
    .map(m => ({ id: m.id, nota: m.body, created_at: m.created_at }));
  res.json(notas);
});

// Asignar/reasignar una conversación a un vendedor (solo admin)
app.post('/api/inbox/conversations/:id/assign', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const conv = store.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  const { vendedorId } = req.body || {};
  if (!vendedorId) return res.status(400).json({ error: 'vendedorId_requerido' });
  const vendedor = store.getVendedores().find(v => Number(v.id) === Number(vendedorId));
  if (!vendedor) return res.status(400).json({ error: 'vendedor_no_existe' });

  const adapter = require('./db/adapter');
  adapter.run('UPDATE conversations SET assigned_to_id = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?', [vendedor.id, 'asignado', conv.id]);
  // Espejo hacia el lead legacy si existe
  if (conv.lead_id) {
    try { store.reassignLead(conv.lead_id, vendedor); } catch (e) { console.error('assign espejo lead:', e.message); }
  }
  events.emitToVendedor(vendedor.id, 'nuevo_mensaje', { conversationId: conv.id, leadId: conv.lead_id || null, tipo: 'asignacion', ts: Date.now() });
  res.json({ ok: true, conversation: store.getConversationById(conv.id) });
});

// Enviar un archivo (imagen/audio/video/documento) desde el inbox multicanal
app.post('/api/inbox/conversations/:id/media', auth.requireAuth, mediaLimiter, async (req, res) => {
  const { mime, filename, dataBase64, caption } = req.body || {};
  if (!mime || !dataBase64) return res.status(400).json({ error: 'mime y dataBase64 requeridos' });
  const conv = store.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  if (req.session.rol !== 'admin' && Number(conv.assigned_to_id) !== Number(req.session.vendedorId))
    return res.status(403).json({ error: 'sin_permiso' });

  const customer = store.getCustomerById(conv.customer_id);
  const to = (customer && customer.phone) || conv.channel_conversation_id;
  if (!to) return res.status(400).json({ error: 'cliente_sin_telefono' });

  let tipo = 'document';
  if (mime.startsWith('image/')) tipo = 'image';
  else if (mime.startsWith('audio/')) tipo = 'audio';
  else if (mime.startsWith('video/')) tipo = 'video';

  try {
    let buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > CFG.MAX_FILE_SIZE) return res.status(413).json({ error: 'archivo_muy_grande_max_18mb' });
    let sendMime = mime, sendFilename = filename;
    if (tipo === 'audio' && conv.channel === 'whatsapp') {
      const conv2 = await convertToOggOpus(buffer, mime);
      buffer = conv2.buffer; sendMime = conv2.mime; sendFilename = 'nota-voz.ogg';
    }
    const storedFilename = mediaStore.saveOutgoingMedia(buffer, sendMime, sendFilename);

    let mediaId = null;
    if (conv.channel === 'whatsapp') {
      mediaId = await uploadMedia(buffer, sendMime, sendFilename);
      await sendMedia(to, mediaId, tipo, caption, sendFilename);
    } else {
      const { getAdapter } = require('./channels');
      const chAdapter = getAdapter(conv.channel);
      if (!chAdapter || typeof chAdapter.sendMedia !== 'function') {
        return res.status(400).json({ error: 'canal_no_soporta_media' });
      }
      const publicUrl = `${req.protocol}://${req.get('host')}/api/public/media/${storedFilename}`;
      const result = await chAdapter.sendMedia(to, publicUrl, tipo, caption || '');
      mediaId = (result && result.message_id) || publicUrl;
    }

    store.addTimelineEvent(conv.id, 'message', {
      channel: conv.channel, body: caption || `[${tipo}]`, direction: 'outgoing',
      from_number: 'panel', to_number: to,
      media_type: tipo, media_id: mediaId, media_mime: sendMime, media_filename: storedFilename,
    });
    const adapter = require('./db/adapter');
    adapter.run('UPDATE conversations SET last_message = ?, last_message_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?', [caption || `[${tipo}]`, conv.id]);
    if (conv.lead_id) {
      try {
        store.saveMessage(conv.lead_id, 'panel', to, caption || `[${tipo}]`, 'outgoing', {
          media_type: tipo, media_id: mediaId, media_mime: sendMime, media_filename: storedFilename,
        });
      } catch (e) { console.error('media espejo lead:', e.message); }
    }
    events.emitToVendedor(conv.assigned_to_id, 'nuevo_mensaje', { conversationId: conv.id, leadId: conv.lead_id || null, tipo: 'respuesta_panel', ts: Date.now() });
    events.emitToAdmins('nuevo_mensaje', { conversationId: conv.id, leadId: conv.lead_id || null, tipo: 'respuesta_panel', ts: Date.now() });
    res.json({ ok: true });
  } catch (e) {
    console.error('Error enviando media desde inbox:', e.message);
    res.status(502).json({ error: 'error_envio_media', detalle: e.message });
  }
});

// Servir media de un evento del timeline multicanal (valida permiso por conversación)
app.get('/api/inbox/media/:timelineId', auth.requireAuth, async (req, res) => {
  const adapter = require('./db/adapter');
  const ev = adapter.one('SELECT * FROM timeline WHERE id = ? LIMIT 1', [req.params.timelineId]);
  if (!ev || !ev.media_filename) return res.status(404).json({ error: 'media_no_existe' });
  const conv = store.getConversationById(ev.conversation_id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  if (req.session.rol !== 'admin' && Number(conv.assigned_to_id) !== Number(req.session.vendedorId))
    return res.status(403).json({ error: 'sin_permiso' });
  const filePath = mediaStore.getMediaPath(ev.media_filename);
  if (!require('fs').existsSync(filePath)) return res.status(404).json({ error: 'archivo_no_encontrado' });
  await sendMediaFile(res, filePath, ev.media_mime, ev.media_type);
});

// Ruta pública para servir media a canales externos (Messenger, Instagram)
app.get('/api/public/media/:filename', async (req, res) => {
  const filename = req.params.filename;
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'filename_invalido' });
  }
  const filePath = mediaStore.getMediaPath(filename);
  if (!require('fs').existsSync(filePath)) return res.status(404).json({ error: 'archivo_no_encontrado' });
  const ext = require('path').extname(filename).toLowerCase();
  const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
  const mime = mimeMap[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(filePath);
});

// ===================== RESPONDER (OLD) =====================

// Responder a un cliente DESDE EL PANEL → se envía por el número oficial
app.post('/api/leads/:id/responder', auth.requireAuth, messageLimiter, async (req, res) => {
  const { mensaje, replyTo } = req.body || {};
  if (!mensaje || !String(mensaje).trim()) return res.status(400).json({ error: 'mensaje_vacio' });
  if (String(mensaje).length > CFG.MAX_MESSAGE_LENGTH) return res.status(400).json({ error: 'mensaje_muy_largo' });

  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }

  try {
    const nombreVendedor = req.session.nombre || 'Asesor';
    const compania = store.getConfig('company_name') || 'Sp Leons Group';
    const mensajeConFirma = `${String(mensaje)}\n\n____________________\n*${nombreVendedor}*\n_Asesor · ${compania}_`;
    const smartResult = await sendMessageSmart(lead.customer_phone, mensajeConFirma, lead.id);
    const fromNumber = lead.assigned_to_phone || req.session.email || 'panel';
    const replyToId = replyTo ? Number(replyTo) : null;
    const wamid = smartResult.data && smartResult.data.messages && smartResult.data.messages[0] ? smartResult.data.messages[0].id : null;
    store.saveMessage(lead.id, fromNumber, lead.customer_phone, String(mensaje), 'outgoing', null, replyToId, wamid, 'sent');
    store.setFirstResponse(lead.id);
    if (lead.status === 'nuevo' || lead.status === 'asignado') {
      store.updateLeadStatus(lead.id, 'contactado');
    }
    store.syncLeadToConversation(store.getLeadById(lead.id), { direction: 'outgoing', body: String(mensaje), fromNumber, toNumber: lead.customer_phone });
    events.emitToVendedor(lead.assigned_to_id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    events.emitToAdmins('nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    res.json({ ok: true, templateSent: smartResult.templateSent || false });
  } catch (e) {
    console.error('Error enviando respuesta desde panel:', e.message);
    const detail = e.windowClosed ? 'window_closed_no_template' : e.message;
    res.status(502).json({ error: 'error_whatsapp', detalle: detail });
  }
});

// Servir un archivo multimedia de un mensaje (validando propiedad del lead)
app.get('/api/media/:messageId', auth.requireAuth, async (req, res) => {
  const msg = store.getMessageById(req.params.messageId);
  if (!msg || !msg.media_filename) return res.status(404).json({ error: 'media_no_existe' });
  const lead = store.getLeadById(msg.lead_id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const filePath = mediaStore.getMediaPath(msg.media_filename);
  if (!require('fs').existsSync(filePath)) return res.status(404).json({ error: 'archivo_no_encontrado' });
  await sendMediaFile(res, filePath, msg.media_mime, msg.media_type);
});

// Link preview: fetch OG tags from a URL
app.post('/api/preview', auth.requireAuth, (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url_requerida' });
  try {
    const parsed = new URL(url);
    const fetcher = parsed.protocol === 'https:' ? https : http;
    const req_ = fetcher.get(parsed.href, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SPCBot/1.0)' } }, (resp_) => {
      let data = '';
      resp_.on('data', chunk => { data += chunk; if (data.length > 32768) { req_.destroy(); } });
      resp_.on('end', () => {
        const og = { title: '', description: '', image: '', site_name: '', url };
        const extract = (pattern) => { const m = data.match(pattern); return m ? m[1].replace(/['"]/g, '') : ''; };
        og.title = extract(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i) || extract(/<meta[^>]+name="twitter:title"[^>]+content="([^"]*)"/i) || extract(/<title[^>]*>([^<]*)<\/title>/i);
        og.description = extract(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i) || extract(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i) || extract(/<meta[^>]+name="twitter:description"[^>]+content="([^"]*)"/i);
        og.image = extract(/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i) || extract(/<meta[^>]+name="twitter:image"[^>]+content="([^"]*)"/i);
        og.site_name = extract(/<meta[^>]+property="og:site_name"[^>]+content="([^"]*)"/i);
        res.json({ ok: true, og });
      });
    });
    req_.on('error', () => res.json({ ok: true, og: { title: '', description: '', image: '', site_name: '', url } }));
    req_.on('timeout', () => { req_.destroy(); res.json({ ok: true, og: { title: '', description: '', image: '', site_name: '', url } }); });
  } catch (e) {
    res.json({ ok: true, og: { title: '', description: '', image: '', site_name: '', url } });
  }
});

// Responder a un cliente con un archivo (imagen/audio/video/documento) desde el panel.
// Body JSON: { mime, filename, dataBase64, caption }
app.post('/api/leads/:id/responder-media', auth.requireAuth, mediaLimiter, messageLimiter, async (req, res) => {
  const { mime, filename, dataBase64, caption, replyTo } = req.body || {};
  if (!mime || !dataBase64) return res.status(400).json({ error: 'mime y dataBase64 requeridos' });

  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }

  let tipo = 'document';
  if (mime.startsWith('image/')) tipo = 'image';
  else if (mime.startsWith('audio/')) tipo = 'audio';
  else if (mime.startsWith('video/')) tipo = 'video';

  try {
    let buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > CFG.MAX_FILE_SIZE) return res.status(413).json({ error: 'archivo_muy_grande_max_18mb' });
    let displayMime = mime, displayFilename = filename, sendMime = mime, sendFilename = filename;
    if (tipo === 'audio') {
      // Guardar el formato ORIGINAL del navegador (webm/mp4) para reproducción en el CRM
      // WhatsApp solo acepta OGG/Opus; convertimos solo para el envío
      displayFilename = mediaStore.saveOutgoingMedia(buffer, mime, filename);
      const conv2 = await convertToOggOpus(buffer, mime);
      buffer = conv2.buffer; sendMime = conv2.mime; sendFilename = 'nota-voz.ogg';
      displayMime = mime; // El CRM reproduce el formato original del navegador
    }
    const displayBody = caption || `[${tipo}]`;
    const storedFilename = tipo === 'audio' ? displayFilename : mediaStore.saveOutgoingMedia(buffer, sendMime, sendFilename);
    const mediaId = await uploadMedia(buffer, sendMime, sendFilename);
    if (!mediaId) return res.status(502).json({ error: 'error_upload', detalle: 'WhatsApp no retornó media ID' });
    await new Promise(r => setTimeout(r, CFG.MEDIA_PROPAGATION_DELAY));
    const mediaResult = await sendMedia(lead.customer_phone, mediaId, tipo, caption, sendFilename);
    if (!mediaResult || !mediaResult.messages || !mediaResult.messages[0]) {
      console.error('sendMedia no retornó wamid:', JSON.stringify(mediaResult));
      return res.status(502).json({ error: 'error_envio_whatsapp' });
    }
    const wamid = mediaResult.messages[0].id;

    const fromNumber = lead.assigned_to_phone || req.session.email || 'panel';
    const replyToId = replyTo ? Number(replyTo) : null;
    store.saveMessage(lead.id, fromNumber, lead.customer_phone, displayBody, 'outgoing', {
      media_type: tipo, media_id: mediaId, media_mime: displayMime, media_filename: storedFilename,
    }, replyToId, wamid, 'sent');
    store.setFirstResponse(lead.id);
    if (lead.status === 'nuevo' || lead.status === 'asignado') store.updateLeadStatus(lead.id, 'contactado');
    store.syncLeadToConversation(store.getLeadById(lead.id), {
      direction: 'outgoing', body: displayBody, fromNumber, toNumber: lead.customer_phone,
      media: { media_type: tipo, media_id: mediaId, media_mime: displayMime, media_filename: storedFilename },
    });
    events.emitToVendedor(lead.assigned_to_id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    events.emitToAdmins('nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    res.json({ ok: true });
  } catch (e) {
    console.error('Error enviando media desde panel:', e.message);
    res.status(502).json({ error: 'error_whatsapp', detalle: e.message });
  }
});

// ===================== MENSAJES: reacciones, editar, borrar =====================

// Reaccionar a un mensaje (toggle)
app.post('/api/messages/:id/react', auth.requireAuth, (req, res) => {
  const msgId = req.params.id;
  const { emoji } = req.body || {};
  if (!msgId || isNaN(Number(msgId)) || !emoji) return res.status(400).json({ error: 'id_y_emoji_requeridos' });
  const store = require('./db/store');
  const row = store.getMessageById(msgId);
  if (!row) return res.status(404).json({ error: 'mensaje_no_existe' });
  const lead = store.getLeadById(row.lead_id);
  if (req.session.rol !== 'admin' && (!lead || Number(lead.assigned_to_id) !== Number(req.session.vendedorId))) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const sender = req.session.telefono || 'self';
  const dir = row.direction === 'outgoing' ? 'outgoing' : 'incoming';
  // Toggle: si ya existe, la quita
  const existing = store.getReactionsForMessage(msgId);
  const found = existing.find(r => r.emoji === emoji && r.sender_number === sender);
  if (found) store.removeReaction(msgId, emoji, sender);
  else store.addReaction(msgId, emoji, sender, dir);
  // Enviar la reacción real a WhatsApp (el cliente la ve sobre su mensaje)
  if (row.wamid && lead && lead.customer_phone) {
    const { sendReaction } = require('./services/whatsapp');
    sendReaction(lead.customer_phone, row.wamid, found ? '' : emoji)
      .catch(e => console.error('[REACT] Error enviando reacción a WhatsApp:', e.message));
  }
  const reactions = store.getReactionsForMessage(msgId);
  res.json({ ok: true, reactions });
});

// Editar mensaje enviado (solo outgoing y reciente)
app.put('/api/messages/:id', auth.requireAuth, (req, res) => {
  const msgId = req.params.id;
  const { body: newBody } = req.body || {};
  if (!msgId || isNaN(Number(msgId)) || !newBody || !String(newBody).trim()) return res.status(400).json({ error: 'id_y_body_requeridos' });
  const store = require('./db/store');
  const row = store.getMessageById(msgId);
  if (!row) return res.status(404).json({ error: 'mensaje_no_existe' });
  if (row.direction !== 'outgoing') return res.status(400).json({ error: 'solo_mensajes_enviados' });
  const lead = store.getLeadById(row.lead_id);
  if (req.session.rol !== 'admin' && (!lead || Number(lead.assigned_to_id) !== Number(req.session.vendedorId))) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.editMessage(msgId, newBody.trim());
  // Intentar editar en WhatsApp si hay wamid y ventana abierta
  const { editMessage: editWA } = require('./services/whatsapp');
  if (row.wamid && store.isWindowOpen(row.lead_id)) {
    editWA(lead.customer_phone, row.wamid, newBody.trim()).catch(e => console.error('Error editando mensaje en WhatsApp:', e.message));
  }
  const updated = store.getMessageById(msgId);
  res.json({ ok: true, message: { ...updated, reactions: store.getReactionsForMessage(msgId) } });
});

// Borrar mensaje (para mí / para todos)
app.post('/api/messages/:id/delete', auth.requireAuth, async (req, res) => {
  const msgId = req.params.id;
  const { mode } = req.body || {};
  if (!msgId || isNaN(Number(msgId)) || !mode) return res.status(400).json({ error: 'id_y_mode_requeridos' });
  if (!['me', 'everyone'].includes(mode)) return res.status(400).json({ error: 'mode_invalido' });
  const store = require('./db/store');
  const adapter = require('./db/adapter');
  const row = store.getMessageById(msgId);
  if (!row) return res.status(404).json({ error: 'mensaje_no_existe' });
  const lead = store.getLeadById(row.lead_id);
  if (req.session.rol !== 'admin' && (!lead || Number(lead.assigned_to_id) !== Number(req.session.vendedorId))) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  if (mode === 'me') {
    store.softDeleteMessage(msgId, req.session.telefono || 'self');
    return res.json({ ok: true, mode: 'me' });
  }
  // mode === 'everyone' — soft delete sincronizado en el CRM.
  // La API de WhatsApp no permite borrar en el teléfono del cliente.
  if (row.media_filename) {
    try {
      const mediaPath = require('path').join(__dirname, '..', 'data', 'media', String(row.media_filename));
      if (require('fs').existsSync(mediaPath)) require('fs').unlinkSync(mediaPath);
    } catch (e) { /* ignorar */ }
  }
  store.markDeletedForAll(msgId, req.session.nombre || 'Asesor');
  if (lead) {
    events.emitToVendedor(lead.assigned_to_id, 'mensaje_eliminado', { leadId: lead.id, messageId: Number(msgId), ts: Date.now() });
    events.emitToAdmins('mensaje_eliminado', { leadId: lead.id, messageId: Number(msgId), ts: Date.now() });
  }
  res.json({ ok: true, mode: 'everyone' });
});

// Pin / unpin lead
app.post('/api/leads/:id/pin', auth.requireAuth, (req, res) => {
  const { pinned } = req.body || {};
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.pinLead(lead.id, !!pinned);
  res.json({ ok: true, pinned: !!pinned });
});

app.post('/api/leads/:id/mute', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const { muted } = req.body || {};
  store.muteLead(lead.id, !!muted);
  res.json({ ok: true, muted: !!muted });
});

// ===================== CITAS =====================

// Listar citas: admin ve todas (o filtra por vendedor); vendedor solo las suyas
app.get('/api/citas', auth.requireAuth, (req, res) => {
  const { desde, hasta } = req.query;
  const vendedorId = req.session.rol === 'admin' ? req.query.vendedorId : req.session.vendedorId;
  res.json(store.getCitas({ vendedorId, desde, hasta }));
});

// Crear cita — vendedor solo puede agendarse a sí mismo
app.post('/api/citas', auth.requireAuth, (req, res) => {
  const { leadId, titulo, fecha, notas, vendedorId } = req.body || {};
  if (!titulo || !String(titulo).trim()) return res.status(400).json({ error: 'titulo_requerido' });
  if (!fecha) return res.status(400).json({ error: 'fecha_requerida' });
  let vId = req.session.rol === 'admin' ? (vendedorId || null) : req.session.vendedorId;
  if (leadId) {
    const lead = store.getLeadById(leadId);
    if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
    if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
      return res.status(403).json({ error: 'sin_permiso' });
    }
    if (!vId) vId = lead.assigned_to_id || null;
  }
  const cita = store.createCita({ leadId: leadId || null, vendedorId: vId, titulo: String(titulo).trim(), fecha, notas });
  res.json({ ok: true, cita });
});

// Actualizar cita (estado, fecha, notas)
app.put('/api/citas/:id', auth.requireAuth, (req, res) => {
  const cita = store.getCitaById(req.params.id);
  if (!cita) return res.status(404).json({ error: 'no_existe' });
  if (req.session.rol !== 'admin' && Number(cita.vendedor_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const { titulo, fecha, notas, estado, vendedorId } = req.body || {};
  if (estado && !['pendiente', 'hecha', 'cancelada'].includes(estado)) return res.status(400).json({ error: 'estado_invalido' });
  const actualizada = store.updateCita(cita.id, { titulo, fecha, notas, estado, vendedorId: req.session.rol === 'admin' ? vendedorId : undefined });
  res.json({ ok: true, cita: actualizada });
});

// Eliminar cita
app.delete('/api/citas/:id', auth.requireAuth, (req, res) => {
  const cita = store.getCitaById(req.params.id);
  if (!cita) return res.status(404).json({ error: 'no_existe' });
  if (req.session.rol !== 'admin' && Number(cita.vendedor_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.deleteCita(cita.id);
  res.json({ ok: true });
});

// ===================== PROPIEDADES =====================
app.get('/api/propiedades', auth.requireAuth, (req, res) => {
  res.json(store.getPropiedades());
});
app.get('/api/propiedades/:id', auth.requireAuth, (req, res) => {
  const p = store.getPropiedadById(req.params.id);
  if (!p) return res.status(404).json({ error: 'no_existe' });
  res.json(p);
});
app.post('/api/propiedades', auth.requireAdmin, (req, res) => {
  const { nombre, descripcion, ciudad, precio, m2, tipo, estado, imagen_url } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'nombre_requerido' });
  const p = store.createPropiedad({ nombre, descripcion, ciudad, precio, m2, tipo, estado, imagen_url });
  res.json({ ok: true, propiedad: p });
});
app.put('/api/propiedades/:id', auth.requireAdmin, (req, res) => {
  const existente = store.getPropiedadById(req.params.id);
  if (!existente) return res.status(404).json({ error: 'no_existe' });
  const d = req.body || {};
  store.updatePropiedad(req.params.id, {
    nombre: d.nombre || existente.nombre,
    descripcion: d.descripcion !== undefined ? d.descripcion : existente.descripcion,
    ciudad: d.ciudad !== undefined ? d.ciudad : existente.ciudad,
    precio: d.precio !== undefined ? d.precio : existente.precio,
    m2: d.m2 !== undefined ? d.m2 : existente.m2,
    tipo: d.tipo || existente.tipo,
    estado: d.estado || existente.estado,
    imagen_url: d.imagen_url !== undefined ? d.imagen_url : existente.imagen_url,
  });
  res.json({ ok: true });
});
app.delete('/api/propiedades/:id', auth.requireAdmin, (req, res) => {
  store.deletePropiedad(req.params.id);
  res.json({ ok: true });
});

// Recomendar propiedades para un lead (match scoring)
app.post('/api/propiedades/recomendar', auth.requireAuth, async (req, res) => {
  try {
    const { leadId } = req.body || {};
    if (!leadId) return res.status(400).json({ error: 'leadId requerido' });

    const lead = store.getLeadById(leadId);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    const mensajes = store.getMessagesByLead(leadId) || [];
    const textoCompleto = mensajes.map(m => m.body).filter(Boolean).join(' ').toLowerCase();

    // Extraer entidades: vía IA si está disponible, si no con regex local
    let entidades = { locations: [], prices: [], propertyTypes: [] };
    try {
      const nlp = require('./services/nlp');
      if (nlp.isAIEnabled()) {
        entidades = await nlp.extractEntities(textoCompleto);
      }
    } catch (e) { /* fallback a regex */ }

    if (!entidades.locations.length) {
      const ciudades = ['tocaima', 'girardot', 'melgar', 'bogotá', 'bogota', 'cundinamarca', 'tolima', 'ica', 'huila', 'meta', 'anapoima', 'la mesa', 'villeta', 'facatativá', 'facatativa', 'mosquera', 'madrid', 'funza'];
      entidades.locations = ciudades.filter(c => textoCompleto.includes(c));
    }
    if (!entidades.prices.length) {
      const nums = textoCompleto.match(/\b(\d{5,})\b/g);
      if (nums) entidades.prices = nums.map(Number);
    }
    if (!entidades.propertyTypes.length) {
      if (/lote|terreno|parcela/i.test(textoCompleto)) entidades.propertyTypes.push('lote');
      if (/casa|vivienda/i.test(textoCompleto)) entidades.propertyTypes.push('casa');
      if (/apartamento|apto/i.test(textoCompleto)) entidades.propertyTypes.push('apartamento');
    }

    const propiedades = store.getPropiedades();
    const precioRef = entidades.prices.length ? Math.min(...entidades.prices) : 0;
    const ciudadRef = entidades.locations[0] || '';

    const recomendadas = propiedades.filter(p => p.estado === 'disponible').map(p => {
      let match = 50;

      // Ciudad (50%)
      const pCiudad = (p.ciudad || '').toLowerCase();
      if (ciudadRef && pCiudad.includes(ciudadRef) || ciudadRef && entidades.locations.some(l => pCiudad.includes(l))) {
        match += 30;
      } else if (ciudadRef && entidades.locations.some(l => pCiudad.includes(l))) {
        match += 25;
      }

      // Precio (25%)
      if (precioRef > 0 && p.precio > 0) {
        const diff = Math.abs(p.precio - precioRef) / Math.max(p.precio, precioRef);
        match += Math.round(25 * Math.max(0, 1 - diff));
      }

      // Tipo (15%)
      if (entidades.propertyTypes.length && entidades.propertyTypes.includes(p.tipo || 'lote')) {
        match += 15;
      } else if (entidades.propertyTypes.length) {
        match += 5;
      } else {
        match += 8;
      }

      // m² (10%)
      if (p.m2 > 0) {
        const m2Ratio = Math.min(p.m2 / 500, 1);
        match += Math.round(10 * m2Ratio);
      }

      return {
        id: p.id,
        nombre: p.nombre,
        ciudad: p.ciudad || '',
        precio: p.precio || 0,
        m2: p.m2 || 0,
        tipo: p.tipo || 'lote',
        estado: p.estado || 'disponible',
        imagen_url: p.imagen_url || '',
        match: Math.min(99, match),
      };
    }).sort((a, b) => b.match - a.match);

    res.json({ ok: true, propiedades: recomendadas, entidades });
  } catch (e) {
    console.error('[PROPS] recomendar error:', e.message);
    res.json({ ok: false, propiedades: [], error: e.message });
  }
});

// Marcar mensaje(s) como leídos
app.post('/api/messages/:id/read-receipt', auth.requireAuth, (req, res) => {
  const msgId = req.params.id;
  if (!msgId || isNaN(Number(msgId))) return res.status(400).json({ error: 'id_invalido' });
  store.markMessageAsRead(Number(msgId));
  res.json({ ok: true });
});

// Marcar todos los mensajes de un lead como leídos (usado al abrir chat)
app.post('/api/leads/:id/mark-all-read', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.markLeadMessagesAsRead(lead.id, lead.customer_phone);
  res.json({ ok: true });
});

// Cerrar un lead (mantenido por compatibilidad, pero la UI ya no lo usa)
app.post('/api/leads/:id/cerrar', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const adapter = require('./db/adapter');
  adapter.run("UPDATE leads SET status = ?, updated_at = created_at WHERE id = ?", ['cerrado', lead.id]);
  res.json({ ok: true });
});

app.post('/api/leads/:id/clear-messages', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.clearLeadMessages(lead.id);
  res.json({ ok: true });
});

app.post('/api/leads/:id/desarchivar', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.updateLeadStatus(lead.id, 'asignado');
  res.json({ ok: true });
});

// Resetear un lead (dejarlo como nuevo, sin borrar historial)
app.post('/api/leads/:id/reset', auth.requireAdmin, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  store.resetLead(lead.id);
  res.json({ ok: true });
});

// Etiquetas válidas del pipeline
const ETIQUETAS_VALIDAS = ['sin_clasificar', 'interesado', 'negociacion', 'cita', 'vendido', 'no_interesado'];

// Cambiar la etiqueta de pipeline de un lead
app.post('/api/leads/:id/etiqueta', auth.requireAuth, (req, res) => {
  const { etiqueta } = req.body || {};
  if (!ETIQUETAS_VALIDAS.includes(etiqueta)) return res.status(400).json({ error: 'etiqueta_invalida' });
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.setLeadEtiqueta(lead.id, etiqueta);
  events.emitToAdmins('lead_actualizado', { leadId: lead.id, etiqueta, ts: Date.now() });
  res.json({ ok: true });
});

// Marcar conversación como leída (al abrir el chat)
app.post('/api/leads/:id/leido', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.marcarLeido(lead.id);
  // Read receipt real: el cliente ve ✓✓ azul en su WhatsApp
  const adapter = require('./db/adapter');
  const last = adapter.one("SELECT wamid FROM messages WHERE lead_id = ? AND direction = 'incoming' AND wamid IS NOT NULL ORDER BY id DESC LIMIT 1", [lead.id]);
  if (last && last.wamid) {
    const { markAsRead } = require('./services/whatsapp');
    markAsRead(last.wamid).catch(e => console.error('[LEIDO] markAsRead WhatsApp:', e.message));
  }
  res.json({ ok: true });
});

// Indicador "escribiendo…" en el WhatsApp del cliente (también marca leído)
app.post('/api/leads/:id/typing', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const adapter = require('./db/adapter');
  const last = adapter.one("SELECT wamid FROM messages WHERE lead_id = ? AND direction = 'incoming' AND wamid IS NOT NULL ORDER BY id DESC LIMIT 1", [lead.id]);
  if (last && last.wamid) {
    const { sendTyping } = require('./services/whatsapp');
    sendTyping(last.wamid).catch(e => console.error('[TYPING]', e.message));
  }
  res.json({ ok: true });
});

app.post('/api/leads/:id/marcar-no-leido', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.setUnreadCount(lead.id, 1);
  res.json({ ok: true });
});

// Editar el nombre del contacto
app.post('/api/leads/:id/nombre', auth.requireAuth, (req, res) => {
  const { nombre } = req.body || {};
  const limpio = String(nombre || '').trim();
  if (!limpio || limpio.length > 100) return res.status(400).json({ error: 'nombre_invalido' });
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.setLeadNombre(lead.id, limpio);
  events.emitToAdmins('lead_actualizado', { leadId: lead.id, ts: Date.now() });
  res.json({ ok: true });
});

// Exportar leads a CSV (solo admin)
app.get('/api/leads/export.csv', auth.requireAdmin, (req, res) => {
  const leads = getLeads(true);
  const cab = ['id', 'nombre', 'telefono', 'estado', 'etiqueta', 'vendedor', 'mensajes', 'creado', 'actualizado'];
  const csvCell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const filas = leads.map(l => [
    l.id, l.customer_name, l.customer_phone, l.status, l.etiqueta || 'sin_clasificar',
    l.assigned_to_nombre || l.assigned_to_phone || '', l.messages_count, l.created_at, l.updated_at,
  ].map(csvCell).join(';'));
  const csv = '﻿' + cab.join(';') + '\n' + filas.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-sp-leons.csv"');
  res.send(csv);
});

// Notas internas de un lead (equipo, no se envían al cliente)
app.get('/api/leads/:id/notas', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  res.json(store.getNotasByLead(lead.id));
});

app.post('/api/leads/:id/notas', auth.requireAuth, (req, res) => {
  const { nota } = req.body || {};
  if (!nota || !String(nota).trim()) return res.status(400).json({ error: 'nota_vacia' });
  if (String(nota).length > 500) return res.status(400).json({ error: 'nota_muy_larga' });
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.addNota(lead.id, req.session.nombre || 'Equipo', String(nota).trim());
  res.json({ ok: true });
});

app.delete('/api/leads/:leadId/notas/:notaId', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.leadId);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.deleteNota(req.params.notaId);
  res.json({ ok: true });
});

// ===================== TAREAS =====================
app.get('/api/leads/:id/tareas', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  res.json(store.getTareas(lead.id));
});

app.post('/api/leads/:id/tareas', auth.requireAuth, (req, res) => {
  const { texto, fecha_vencimiento } = req.body || {};
  if (!texto || !String(texto).trim()) return res.status(400).json({ error: 'texto_requerido' });
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const tarea = store.addTarea(lead.id, String(texto).trim(), fecha_vencimiento || '');
  res.json({ ok: true, tarea });
});

app.put('/api/leads/:id/tareas/:taskId', auth.requireAuth, (req, res) => {
  const tarea = store.toggleTarea(req.params.taskId);
  if (!tarea) return res.status(404).json({ error: 'tarea_no_existe' });
  res.json({ ok: true, tarea });
});

app.delete('/api/leads/:id/tareas/:taskId', auth.requireAuth, (req, res) => {
  store.deleteTarea(req.params.taskId);
  res.json({ ok: true });
});

// Reasignar un lead a otro vendedor (solo admin)
app.post('/api/leads/:id/reasignar', auth.requireAdmin, (req, res) => {
  const { vendedorId } = req.body || {};
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  const vendedor = getVendedores().find(v => Number(v.id) === Number(vendedorId));
  if (!vendedor) return res.status(400).json({ error: 'vendedor_no_existe' });
  const anteriorId = lead.assigned_to_id;
  store.reassignLead(lead.id, vendedor, anteriorId);
  // Notificar a ambos vendedores y admins para refrescar sus listas
  events.emitToVendedor(vendedor.id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'reasignado', ts: Date.now() });
  if (anteriorId) events.emitToVendedor(anteriorId, 'nuevo_mensaje', { leadId: lead.id, tipo: 'reasignado', ts: Date.now() });
  events.emitToAdmins('lead_actualizado', { leadId: lead.id, tipo: 'reasignado', ts: Date.now() });
  res.json({ ok: true, vendedor: { id: vendedor.id, nombre: vendedor.nombre } });
});

// ===================== LEAD PROACTIVO (iniciar chat sin que el cliente escriba) =====================

app.post('/api/leads/proactive', auth.requireAuth, async (req, res) => {
  const { phone, name, message, templateName } = req.body || {};
  if (!phone || !String(phone).trim()) return res.status(400).json({ error: 'telefono_requerido' });
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'mensaje_requerido' });

  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  if (cleanPhone.length < 10) return res.status(400).json({ error: 'telefono_invalido' });

  try {
    // 1. Crear lead en la BD
    const result = store.saveLead(cleanPhone, name || 'Cliente', String(message).trim());
    const lead = store.getLeadById(result.leadId);

    // 2. Asignar vendedor por round-robin
    const activos = store.getVendedoresActivos();
    if (activos.length > 0) {
      store.assignLeadToVendedor(lead.id, activos[0]);
    }

    // 3. Enviar template si se especificó, luego el mensaje
    const { sendTemplate: sendT, sendMessageSmart } = require('./services/whatsapp');
    const tpl = templateName || store.getConfig('reengagement_template');
    if (tpl) {
      await sendT(cleanPhone, tpl);
      await new Promise(r => setTimeout(r, 3000));
    }
    await sendMessageSmart(cleanPhone, String(message).trim(), lead.id);

    // 4. Guardar mensaje outgoing
    store.saveMessage(lead.id, 'sistema', cleanPhone, String(message).trim(), 'outgoing');
    store.syncLeadToConversation(store.getLeadById(lead.id), {
      direction: 'outgoing', body: String(message).trim(), fromNumber: 'sistema', toNumber: cleanPhone,
    });

    // 5. Notificar
    if (activos.length > 0) {
      events.emitToVendedor(activos[0].id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'lead_proactivo', ts: Date.now() });
    }
    events.emitToAdmins('lead_actualizado', { leadId: lead.id, tipo: 'lead_proactivo', ts: Date.now() });

    res.json({ ok: true, leadId: lead.id });
  } catch (e) {
    console.error('Error creando lead proactivo:', e.message);
    res.status(502).json({ error: 'error_whatsapp', detalle: e.message });
  }
});

// ===================== TIEMPO REAL (SSE) =====================

app.get('/api/stream', auth.requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write(`event: conectado\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  // Admin escucha en el canal 0; vendedor en su propio id
  const canal = req.session.rol === 'admin' ? 0 : req.session.vendedorId;
  events.addClient(canal, res);

  // Heartbeat para mantener viva la conexión
  const hb = setInterval(() => {
    try { res.write(': hb\n\n'); } catch (e) { clearInterval(hb); events.removeClient(canal, res); }
  }, CFG.SSE_HEARTBEAT);
  res.on('close', () => { clearInterval(hb); events.removeClient(canal, res); });
});

// ===================== NOTIFICACIONES PUSH =====================

app.get('/api/push/clave', auth.requireAuth, (req, res) => {
  res.json({ publicKey: push.getPublicKey(), enabled: push.isEnabled() });
});

app.post('/api/push/suscribir', auth.requireAuth, (req, res) => {
  const sub = req.body && req.body.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'subscription requerida' });
  const vendedorId = req.session.rol === 'admin' ? 0 : req.session.vendedorId;
  if (!vendedorId && vendedorId !== 0) return res.status(400).json({ error: 'sin_vendedor' });
  store.savePushSubscription(vendedorId, sub);
  res.json({ ok: true });
});

// ===================== CONFIGURACIÓN (admin) =====================

const CONFIG_KEYS = [
  'welcome_message',
  'company_name',
  'reengagement_template',
  'twilio_account_sid', 'twilio_auth_token', 'twilio_numero',
  'slack_webhook', 'gcal_client_id', 'mp_public_key', 'mp_access_token',
  'openrouter_api_key', 'openrouter_model', 'openrouter_site_url', 'openrouter_app_name', 'ai_enabled',
  'escalation_alerta_min', 'escalation_reasignar_min', 'escalation_admin_min', 'escalation_asentado_horas',
];

app.get('/api/config', auth.requireAdmin, (req, res) => {
  const cfg = {};
  CONFIG_KEYS.forEach(key => { cfg[key] = store.getConfig(key) || ''; });
  res.json(cfg);
});

app.post('/api/config', auth.requireAdmin, (req, res) => {
  const body = req.body || {};
  CONFIG_KEYS.forEach(key => {
    if (body[key] !== undefined) store.setConfig(key, String(body[key]));
  });
  res.json({ ok: true });
});

// ===================== PLANTILLAS WHATSAPP (Meta aprobadas) =====================

app.get('/api/wa-templates', auth.requireAuth, (req, res) => res.json(store.getWATemplates()));

app.post('/api/wa-templates', auth.requireAdmin, (req, res) => {
  const { nombre, idioma, params } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
  store.addWATemplate(nombre.trim(), idioma || 'es', params || '');
  res.json({ ok: true });
});

app.delete('/api/wa-templates/:id', auth.requireAdmin, (req, res) => {
  store.deleteWATemplate(req.params.id);
  res.json({ ok: true });
});

// Enviar template aprobado de Meta a un lead
app.post('/api/leads/:id/enviar-template', auth.requireAuth, async (req, res) => {
  const { nombre, idioma, params } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'nombre de template requerido' });
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  try {
    const { sendTemplate } = require('./services/whatsapp');
    await sendTemplate(lead.customer_phone, nombre, params || null);
    store.saveMessage(lead.id, 'sistema', lead.customer_phone, `[Template: ${nombre}]`, 'outgoing');
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: 'error_whatsapp', detalle: e.message });
  }
});

// ===================== REPORTES Y ANALYTICS =====================

app.get('/api/reports/team-performance', auth.requireAdmin, (req, res) => {
  const { from, to } = req.query;
  res.json(require('./services/reports').getTeamPerformance(from, to));
});

app.get('/api/reports/pipeline-conversion', auth.requireAdmin, (req, res) => {
  const { from, to } = req.query;
  res.json(require('./services/reports').getPipelineConversion(from, to));
});

app.get('/api/reports/channel-distribution', auth.requireAdmin, (req, res) => {
  const { from, to } = req.query;
  res.json(require('./services/reports').getChannelDistribution(from, to));
});

app.get('/api/reports/response-times', auth.requireAuth, (req, res) => {
  const { from, to, vendedorId } = req.query;
  res.json(require('./services/reports').getResponseTimes(from, to, vendedorId));
});

app.get('/api/reports/csat', auth.requireAuth, (req, res) => {
  const { from, to, vendedorId } = req.query;
  res.json(require('./services/reports').getCSAT(from, to, vendedorId));
});

app.get('/api/reports/lead-sources', auth.requireAdmin, (req, res) => {
  const { from, to } = req.query;
  res.json(require('./services/reports').getLeadSources(from, to));
});

app.get('/api/reports/hourly-distribution', auth.requireAdmin, (req, res) => {
  const { from, to } = req.query;
  res.json(require('./services/reports').getHourlyDistribution(from, to));
});

app.get('/api/reports/export.csv', auth.requireAdmin, (req, res) => {
  const { from, to, channel, vendedorId } = req.query;
  const csv = require('./services/reports').getExportCSV(from, to, { channel, vendedorId });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="reporte-sp.csv"');
  res.send(csv);
});

// ===================== LLAMADAS (Twilio Voice, click-to-call) =====================

app.post('/api/calls/initiate', auth.requireAuth, async (req, res) => {
  const { conversationId, vendedorPhone, customerPhone } = req.body || {};
  if (!conversationId || !vendedorPhone || !customerPhone) {
    return res.status(400).json({ error: 'conversationId, vendedorPhone y customerPhone requeridos' });
  }
  try {
    const voice = require('./services/voice');
    const call = await voice.initiateCall(conversationId, vendedorPhone, customerPhone);
    res.json({ ok: true, callSid: call.sid });
  } catch (e) {
    console.error('Error iniciando llamada:', e.message);
    res.status(502).json({ error: 'error_llamada', detalle: e.message });
  }
});

// Webhook de Twilio (con validación de firma + rate limiting)
function verifyTwilioSignature(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) { return next(); }
  const signature = req.headers['x-twilio-signature'];
  if (!signature) { console.warn('[TWILIO] Sin firma — rechazado'); return res.sendStatus(401); }
  try {
    const twilio = require('twilio');
    const url = (req.headers['x-forwarded-proto'] || 'http') + '://' + req.headers.host + req.originalUrl;
    const valid = twilio.validateRequest(authToken, signature, url, req.body);
    if (!valid) { console.warn('[TWILIO] Firma inválida — rechazado'); return res.sendStatus(401); }
  } catch (e) { console.error('[TWILIO] Error validando firma:', e.message); return res.sendStatus(401); }
  next();
}
const twilioWebhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: false, legacyHeaders: false });
app.post('/webhook/twilio/status', twilioWebhookLimiter, verifyTwilioSignature, async (req, res) => {
  try {
    const voice = require('./services/voice');
    await voice.handleStatusWebhook(req);
  } catch (e) {
    console.error('Error en webhook Twilio status:', e.message);
  }
  res.sendStatus(200);
});

app.get('/api/calls/:conversationId/logs', auth.requireAuth, async (req, res) => {
  try {
    const voice = require('./services/voice');
    const logs = await voice.getCallLogs(req.params.conversationId);
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: 'error_logs' });
  }
});

// ===================== WORKFLOWS (automatización IF/THEN) =====================

app.get('/api/workflows', auth.requireAdmin, (req, res) => res.json(store.getAllWorkflows()));

app.post('/api/workflows', auth.requireAdmin, (req, res) => {
  const { nombre, activo, trigger_event, conditions, actions } = req.body || {};
  if (!nombre || !trigger_event) return res.status(400).json({ error: 'nombre y trigger_event requeridos' });
  const workflow = store.createWorkflow({ nombre, activo, trigger_event, conditions, actions });
  require('./services/workflow').loadRules();
  res.json(workflow);
});

app.put('/api/workflows/:id', auth.requireAdmin, (req, res) => {
  const workflow = store.updateWorkflow(req.params.id, req.body || {});
  if (!workflow) return res.status(404).json({ error: 'workflow_no_existe' });
  require('./services/workflow').loadRules();
  res.json(workflow);
});

app.delete('/api/workflows/:id', auth.requireAdmin, (req, res) => {
  store.deleteWorkflow(req.params.id);
  require('./services/workflow').loadRules();
  res.json({ ok: true });
});

app.get('/api/workflows/:id/logs', auth.requireAdmin, (req, res) => {
  res.json(store.getWorkflowLogs(req.params.id));
});

// ===================== TEMPLATES (respuestas rápidas) =====================

app.get('/api/templates', auth.requireAuth, (req, res) => res.json(store.getTemplates()));

app.post('/api/templates', auth.requireAdmin, (req, res) => {
  const { titulo, cuerpo } = req.body || {};
  if (!titulo || !cuerpo) return res.status(400).json({ error: 'titulo y cuerpo requeridos' });
  store.addTemplate(titulo, cuerpo);
  res.json({ ok: true });
});

app.delete('/api/templates/:id', auth.requireAdmin, (req, res) => {
  store.deleteTemplate(req.params.id);
  res.json({ ok: true });
});

// ===================== TEMPLATES DEL VENDEDOR (mis respuestas) =====================
app.get('/api/mis-templates', auth.requireAuth, (req, res) => {
  const vendedorId = req.session.vendedorId;
  if (!vendedorId) return res.status(400).json({ error: 'sin_vendedor' });
  res.json(store.getVendedorTemplates(vendedorId));
});
app.post('/api/mis-templates', auth.requireAuth, (req, res) => {
  const { titulo, cuerpo } = req.body || {};
  if (!titulo || !cuerpo) return res.status(400).json({ error: 'titulo y cuerpo requeridos' });
  const vendedorId = req.session.vendedorId;
  if (!vendedorId) return res.status(400).json({ error: 'sin_vendedor' });
  store.addVendedorTemplate(vendedorId, titulo, cuerpo);
  res.json({ ok: true });
});
app.delete('/api/mis-templates/:id', auth.requireAuth, (req, res) => {
  store.deleteVendedorTemplate(req.params.id);
  res.json({ ok: true });
});

// ===================== ESTADÍSTICAS SEMANALES =====================
app.get('/api/me/stats-semanales', auth.requireAuth, (req, res) => {
  const vendedorId = req.session.vendedorId;
  if (!vendedorId) return res.status(400).json({ error: 'sin_vendedor' });
  res.json(store.getStatsSemanales(vendedorId));
});

// ===================== USUARIOS (admin) =====================

app.get('/api/usuarios', auth.requireAdmin, (req, res) => res.json(store.getUsuarios()));

// Crea un usuario (vendedor o admin) + vendedor + PIN en un solo paso
app.post('/api/usuarios', auth.requireAdmin, (req, res) => {
  const { nombre, telefono, email, password, pin, rol } = req.body || {};
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'nombre, email y password requeridos' });
  }
  if (telefono && !validarTelefono(telefono)) {
    return res.status(400).json({ error: 'formato_telefono_invalido_debe_ser_57' });
  }
  const emailNorm = String(email).toLowerCase().trim();
  if (store.getUsuarioByEmail(emailNorm)) {
    return res.status(409).json({ error: 'email_ya_existe' });
  }
  const rolFinal = rol === 'admin' ? 'admin' : 'vendedor';
  let vendedorId = null;

  // Para vendedores: teléfono es obligatorio
  if (rolFinal === 'vendedor' && !telefono) {
    return res.status(400).json({ error: 'telefono requerido para vendedores' });
  }

  // Crear registro en vendedores si se proporciona teléfono (vendedor o admin con PIN)
  if (telefono) {
    vendedorId = store.addVendedor(nombre, telefono);
    const pinFinal = pin || (/^\d{4}$/.test(String(password)) ? String(password) : null);
    if (pinFinal && /^\d{4}$/.test(String(pinFinal))) {
      store.setVendedorPin(vendedorId, auth.hashPassword(String(pinFinal)));
    }
  }

  store.createUsuario(emailNorm, auth.hashPassword(password), nombre, rolFinal, vendedorId);
  res.json({ ok: true, vendedorId });
});

// Seed vendedores de prueba (solo en desarrollo)
app.post('/api/seed', auth.requireAdmin, (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'no_disponible' });
  const demo = [
    ['Carlos Méndez', '+573001234561'],
    ['María Fernanda López', '+573001234562'],
    ['Andrés García', '+573001234563'],
    ['Valentina Ríos', '+573001234564'],
    ['Javier Ortiz', '+573001234565'],
  ];
  demo.forEach(([n, t]) => addVendedor(n, t));
  res.json({ ok: true, vendedoresCreados: demo.length });
});

// ===================== DEDUPLICACIÓN =====================

app.get('/api/admin/duplicates', auth.requireAdmin, (req, res) => {
  try {
    const groups = store.getDuplicateGroups();
    res.json({ ok: true, groups });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/admin/duplicates/merge', auth.requireAdmin, (req, res) => {
  try {
    const { keepLeadId, removeLeadId } = req.body || {};
    if (!keepLeadId || !removeLeadId) return res.status(400).json({ error: 'keepLeadId y removeLeadId requeridos' });
    const result = store.mergeLeads(keepLeadId, removeLeadId);
    console.log(`[DEDUP] Fusionado lead ${removeLeadId} → ${keepLeadId} (${result.messagesMoved} mensajes)`);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Limpiar conversaciones huérfanas (conversaciones de leads cerrados)
app.post('/api/admin/cleanup-orphans', auth.requireAdmin, (req, res) => {
  try {
    const result = store.closeOrphanConversations();
    console.log(`[CLEANUP] Cerradas ${result.closed} conversaciones huérfanas`);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Test webhook simulator (solo en desarrollo)
app.post('/api/test-webhook', auth.requireAdmin, (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'no_disponible' });
  const { phone, name, message } = req.body;
  const customerPhone = phone || '+573001234500';
  const customerName = name || 'Cliente Prueba';
  const messageBody = message || 'Hola, me interesa recibir información sobre los lotes.';

  const fakePayload = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: process.env.PHONE_NUMBER_ID },
          contacts: [{ profile: { name: customerName }, wa_id: customerPhone }],
          messages: [{
            from: customerPhone,
            id: 'test_' + Date.now(),
            type: 'text',
            text: { body: messageBody },
          }],
        },
      }],
    }],
  };

  req.body = fakePayload;
  handleMessage(req, res);
});

// Test vendedor reply simulator (solo en desarrollo)
app.post('/api/test-reply', auth.requireAdmin, (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'no_disponible' });
  if (!vendedorPhone) return res.status(400).json({ error: 'vendedorPhone requerido' });

  const fakePayload = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: process.env.PHONE_NUMBER_ID },
          contacts: [{ profile: { name: 'Vendedor' }, wa_id: vendedorPhone }],
          messages: [{
            from: vendedorPhone,
            id: 'test_reply_' + Date.now(),
            type: 'text',
            text: { body: message || '¡Hola! Claro, con gusto te ayudo. ¿Te puedo llamar?' },
          }],
        },
      }],
    }],
  };

  req.body = fakePayload;
  handleMessage(req, res);
});

// Logs
app.get('/api/logs', auth.requireAdmin, (req, res) => {
  const d = getDB();
  if (!d) return res.json([]);
  const r = d.exec('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50');
  if (r.length === 0) return res.json([]);
  const cols = r[0].columns;
  res.json(r[0].values.map(row => {
    const o = {};
    cols.forEach((c, i) => { o[c] = row[i]; });
    return o;
  }));
});

// ===================== ADMIN INBOX GLOBAL =====================

// Lista de conversaciones para el inbox del admin (con filtros)
app.get('/api/admin/inbox', auth.requireAdmin, (req, res) => {
  const { busqueda, etiqueta, vendedorId, limite, offset } = req.query;
  const leads = getAdminInbox({ busqueda, etiqueta, vendedorId, limite, offset });
  res.json(leads);
});

// Estadísticas del inbox admin
app.get('/api/admin/inbox/stats', auth.requireAdmin, (req, res) => {
  res.json(getAdminInboxStats());
});

// El admin puede responder desde el inbox global (mismo endpoint que el vendedor)
// ya cubierto por /api/leads/:id/responder (admin tiene permiso automático)

// ===================== GESTIÓN DE VENDEDORES (eliminar) =====================

app.delete('/api/vendedores/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const vendedor = getVendedores().find(v => Number(v.id) === id);
  if (!vendedor) return res.status(404).json({ error: 'vendedor_no_existe' });
  const reasignadoA = deleteVendedor(id);
  events.emitToAdmins('vendedor_eliminado', { vendedorId: id, reasignadoA: reasignadoA ? reasignadoA.nombre : null, ts: Date.now() });
  res.json({ ok: true, reasignadoA: reasignadoA ? { id: reasignadoA.id, nombre: reasignadoA.nombre } : null });
});

// ===================== EXPORTAR LEADS (CSV) =====================

app.get('/api/admin/export/leads', auth.requireAdmin, (req, res) => {
  const leads = getLeads(true);
  const vendedores = getVendedores();
  const vMap = {};
  vendedores.forEach(v => { vMap[v.id] = v.nombre; });
  const header = 'ID,Nombre,Telefono,Vendedor,Estado,Etiqueta,Mensajes,Fecha\n';
  const rows = leads.map(l => [
    l.id,
    `"${(l.customer_name || '').replace(/"/g, '""')}"`,
    l.customer_phone || '',
    `"${(vMap[l.assigned_to_id] || 'Sin asignar').replace(/"/g, '""')}"`,
    l.status || '',
    l.etiqueta || '',
    l.messages_count || 0,
    (l.created_at || '').slice(0, 10),
  ].join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-sp.csv"');
  res.send('﻿' + header + rows);
});

// Escalation check — sistema inteligente
const ESC_ALERTA_MIN = Number(process.env.ESC_ALERTA_MIN || store.getConfig('escalation_alerta_min') || 15);
const ESC_REASIGNAR_MIN = Number(process.env.ESC_REASIGNAR_MIN || store.getConfig('escalation_reasignar_min') || 30);
const ESC_ADMIN_MIN = Number(process.env.ESC_ADMIN_MIN || store.getConfig('escalation_admin_min') || 60);
const ESC_ASENTADO_HORAS = Number(process.env.ESC_ASENTADO_HORAS || store.getConfig('escalation_asentado_horas') || 24);

async function checkEscalation() {
  try {
    const ahora = Date.now();
    const leadsSinRespuesta = getLeadsSinRespuesta(0); // todos los sin respuesta

    for (const lead of leadsSinRespuesta) {
      // Determinar tipo de lead
      const esNuevo = !lead.first_response_at;
      const creadoEn = new Date(lead.created_at.replace(' ', 'T') + 'Z').getTime();
      const minutosDesdeCreacion = (ahora - creadoEn) / 60000;
      const horasDesdeCreacion = minutosDesdeCreacion / 60;
      const esAsentado = horasDesdeCreacion >= ESC_ASENTADO_HORAS;

      // Saltar leads asentados (más de 24h con el mismo vendedor) — no se reasignan
      if (esAsentado && lead.escalation_level > 0) continue;

      // ===== 15 min (o configurable) — ALERTA al vendedor =====
      if (minutosDesdeCreacion >= ESC_ALERTA_MIN && lead.escalation_level < 1) {
        incrementEscalation(lead.id);
        console.log(`[ESCALADO] Alerta ${ESC_ALERTA_MIN}min lead ${lead.id} (${lead.customer_name})`);
        if (lead.assigned_to_phone) {
          await sendMessage(lead.assigned_to_phone,
            `⏰ Alerta SP Inmobiliaria\nLlevas ${ESC_ALERTA_MIN} min sin responder a ${lead.customer_name} (${lead.customer_phone}).\nPor favor responde lo antes posible.`
          ).catch(e => console.error('[ESCALADO] Error al enviar alerta 15min:', e.message));
        }
        continue;
      }

      // ===== 30 min (o configurable) — REASIGNAR solo leads NUEVOS =====
      if (minutosDesdeCreacion >= ESC_REASIGNAR_MIN && lead.escalation_level < 2) {
        incrementEscalation(lead.id);
        if (esNuevo && !esAsentado) {
          console.log(`[ESCALADO] Reasignando lead ${lead.id} (${lead.customer_name}) — ${ESC_REASIGNAR_MIN} min sin respuesta`);
          const activos = getVendedoresActivos();
          // Buscar un vendedor diferente al actual
          const otroVendedor = activos.find(v => v.id !== lead.assigned_to_id);
          if (otroVendedor && lead.assigned_to_id) {
            const vendedorAnterior = lead.assigned_to_id;
            store.reassignLead(lead.id, otroVendedor, vendedorAnterior);
            // Notificar a AMBOS vendedores
            events.emitToVendedor(otroVendedor.id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'reasignado_automatico', ts: Date.now() });
            events.emitToVendedor(vendedorAnterior, 'nuevo_mensaje', { leadId: lead.id, tipo: 'reasignado_automatico', ts: Date.now() });
            events.emitToAdmins('lead_actualizado', { leadId: lead.id, tipo: 'reasignado_automatico', ts: Date.now() });
            // Notificar al vendedor anterior
            if (lead.assigned_to_phone) {
              await sendMessage(lead.assigned_to_phone,
                `🔄 Reasignación automática\nEl lead ${lead.customer_name} (${lead.customer_phone}) ha sido reasignado a otro vendedor por falta de respuesta.`
              ).catch(e => console.error('[ESCALADO] Error notificando vendedor anterior:', e.message));
            }
            // Notificar al nuevo vendedor
            await sendMessage(otroVendedor.telefono,
              `🆕 Lead reasignado automáticamente\nCliente: ${lead.customer_name}\nTel: ${lead.customer_phone}\nMensajes previos en el historial.\nPor favor responde lo antes posible.`
            ).catch(e => console.error('[ESCALADO] Error notificando nuevo vendedor:', e.message));
          } else {
            // No hay otro vendedor disponible — alerta fuerte
            events.emitToAdmins('lead_actualizado', { leadId: lead.id, tipo: 'escalado_sin_vendedores', ts: Date.now() });
            if (lead.assigned_to_phone) {
              await sendMessage(lead.assigned_to_phone,
                `⚠️ ALERTA CRÍTICA\n${lead.customer_name} (${lead.customer_phone}) lleva ${ESC_REASIGNAR_MIN} min esperando.\nNo hay otros vendedores disponibles. RESPUESTA INMEDIATA REQUERIDA.`
              ).catch(e => console.error('[ESCALADO] Error enviando alerta crítica:', e.message));
            }
          }
        } else {
          // Lead recurrente — solo alerta más fuerte
          if (lead.assigned_to_phone) {
            await sendMessage(lead.assigned_to_phone,
              `⚠️ ALERTA SP Inmobiliaria\n${lead.customer_name} (${lead.customer_phone}) lleva ${ESC_REASIGNAR_MIN} min sin respuesta.\nEs un cliente recurrente — prioriza su atención.`
            ).catch(e => console.error('[ESCALADO] Error enviando alerta recurrente:', e.message));
          }
        }
        continue;
      }

      // ===== 60 min (o configurable) — NOTIFICAR ADMIN =====
      if (minutosDesdeCreacion >= ESC_ADMIN_MIN && lead.escalation_level < 3) {
        incrementEscalation(lead.id);
        console.log(`[ESCALADO] Admin notificado — lead ${lead.id} lleva ${ESC_ADMIN_MIN} min sin respuesta`);
        events.emitToAdmins('lead_actualizado', { leadId: lead.id, tipo: 'escalado_admin', minutos: Math.round(minutosDesdeCreacion), ts: Date.now() });
        // Si es nuevo y no se reasignó antes, intentar reasignar ahora
        if (esNuevo && !esAsentado) {
          const activos = getVendedoresActivos();
          const otroVendedor = activos.find(v => v.id !== lead.assigned_to_id);
          if (otroVendedor && lead.assigned_to_id) {
            const vendedorAnterior = lead.assigned_to_id;
            store.reassignLead(lead.id, otroVendedor, vendedorAnterior);
            events.emitToVendedor(otroVendedor.id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'reasignado_automatico', ts: Date.now() });
            events.emitToVendedor(vendedorAnterior, 'nuevo_mensaje', { leadId: lead.id, tipo: 'reasignado_automatico', ts: Date.now() });
            events.emitToAdmins('lead_actualizado', { leadId: lead.id, tipo: 'reasignado_automatico', ts: Date.now() });
            await sendMessage(otroVendedor.telefono,
              `🆕 Lead reasignado (urgente)\nCliente: ${lead.customer_name}\nTel: ${lead.customer_phone}\n⚠️ Ya pasaron ${ESC_ADMIN_MIN} min sin respuesta.\nTodo el historial está disponible.`
            ).catch(e => console.error('[ESCALADO] Error enviando reasignación urgente:', e.message));
          }
        }
        continue;
      }
    }
  } catch (e) {
    console.error('Error en escalation check:', e.message);
  }
}

// Crea el usuario administrador inicial + vendedor admin
function ensureAdminUser() {
  const ADMIN_PHONE = process.env.ADMIN_PHONE || '+573214625618';
  const ADMIN_PIN = process.env.ADMIN_PIN || '0000';
  const email = (process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || 'admin@spinmobiliaria.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'changeme123';

  // Crear admin user si no existe ninguno
  if (store.countUsuarios() === 0) {
    store.createUsuario(email, auth.hashPassword(password), 'Administrador', 'admin', null);
    console.log('===========================================');
    console.log('Usuario ADMIN inicial creado:');
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password}`);
    console.log('  (cámbialo en .env: ADMIN_EMAIL / ADMIN_PASSWORD)');
    console.log('===========================================');
  }

  // Asegurar vendedor admin con el número oficial + PIN 0000
  let vendedorAdmin = store.getVendedorByTelefono(ADMIN_PHONE);
  if (!vendedorAdmin) {
    const vId = store.addVendedor('Administrador', ADMIN_PHONE);
    store.setVendedorPin(vId, auth.hashPassword(ADMIN_PIN));
    vendedorAdmin = store.getVendedorByTelefono(ADMIN_PHONE);
    console.log(`Vendedor admin creado: ${ADMIN_PHONE} · PIN: ${ADMIN_PIN}`);
  } else if (!vendedorAdmin.pin) {
    store.setVendedorPin(vendedorAdmin.id, auth.hashPassword(ADMIN_PIN));
    console.log(`PIN reset para admin: ${ADMIN_PIN}`);
  }

  // Vincular con el usuario admin si no lo está
  if (vendedorAdmin) {
    const usuarios = store.getUsuarios();
      const adminUser = usuarios.find(u => u.rol === 'admin');
      if (adminUser && !adminUser.vendedor_id) {
        store.updateUsuarioVendedorId(adminUser.id, vendedorAdmin.id);
      console.log(`Admin vinculado a vendedor ID ${vendedorAdmin.id}`);
    }
  }
}

(async () => {
  await initDB();
  ensureAdminUser();
  push.init();
  try {
    const MessageRouter = require('./services/router');
    require('./services/workflow').init(MessageRouter);
  } catch (e) {
    console.error('No se pudo iniciar WorkflowEngine:', e.message);
  }
  const http = require('http');
  const httpServer = http.createServer(app);
  try {
    const { createWsServer } = require('./ws');
    createWsServer(httpServer);
  } catch (e) {
    console.error('No se pudo iniciar Socket.IO:', e.message);
  }
  httpServer.listen(PORT, () => {
    console.log(`SP Inmobiliaria CRM corriendo en puerto ${PORT}`);
  });
  setInterval(checkEscalation, CFG.ESCALATION_CHECK_INTERVAL);
  setInterval(() => store.cleanExpiredSessions(CFG.SESSION_TTL_MS), CFG.SESSION_CLEANUP_INTERVAL);
})();
