require('dotenv').config();
process.env.TZ = process.env.TZ || 'America/Bogota';

const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const store = require('./db/store');
const { parseLocalDbTime, hoyBogota } = require('./utils/tiempo');
const { initDB, getLeads, getLeadCount, addVendedor, getVendedores, getVendedoresActivos, setVendedorEstado, getLeadsSinRespuesta, incrementEscalation, getDB, deleteVendedor, getAdminInbox, getAdminInboxStats } = store;
const { handleVerification } = require('./webhook/verify');
const { handleMessage } = require('./webhook/messages');
const { sendMessage, sendMessageSmart, uploadMedia, sendMedia, sendLocation } = require('./services/whatsapp');
const multer = require('multer');
const mediaStore = require('./services/media');
const { convertToOggOpus, convertToM4A, getPlayableAudioPath } = require('./services/audio');

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
const { notify } = require('./services/notify');

const rateLimit = require('express-rate-limit');
// ipKeyGenerator normaliza la IP (colapsa el prefijo /56 en IPv6). express-rate-limit v8
// exige usarlo dentro de cualquier keyGenerator propio que incluya la IP.
const { ipKeyGenerator } = require('express-rate-limit');
const crypto = require('crypto');
const CFG = require('./config');

const app = express();
app.set('trust proxy', 1);

// Fase 4: movido a src/utils/async-handler.js (compartido con los routers extraídos
// de este archivo, p. ej. routes/ai-agents.js) — mismo comportamiento, sin duplicar.
const { asyncH } = require('./utils/async-handler');

// Vid.a V1 — cada request corre dentro del contexto del tenant activo (hoy siempre
// empresa #1 hardcodeada; V2 es quien resolverá el tenant real por dominio/canal).
// Va primero, antes que cualquier otro middleware, para que TODO lo que siga
// (parseo de body, rutas, auth) tenga acceso a la conexión de BD correcta.
const dbAdapter = require('./db/adapter');

// Vid.a V3 — cada request corre en el contexto del tenant al que pertenece la sesión
// (o empresa #1 si no hay sesión: login, páginas públicas, webhook — el webhook se
// re-resuelve por phone_number_id dentro de webhook/messages.js). La sesión vive en la
// BD de SU empresa y lleva empresa_id + empresa_db_path (ver services/auth.js), así que
// resolver el tenant = leer el token → saber en qué BD buscar. Cache en memoria para no
// escanear BD de todos los negocios por cada request; el escaneo solo ocurre tras un
// arranque o un login nuevo (miss de cache).
const sessionTenants = new Map();      // token → {empresaId, dbPath} | null (negativo)
const sessionTenantsAt = new Map();    // token → ts del último lookup
const SESSION_TENANT_TTL_MS = 10 * 60 * 1000;
const SESSION_TENANT_NEG_TTL_MS = 45 * 1000;
function resolveTenantForSession(token) {
  if (!token) return null;
  const now = Date.now();
  const ts = sessionTenantsAt.get(token);
  if (ts && now - ts < (sessionTenants.has(token) ? SESSION_TENANT_TTL_MS : SESSION_TENANT_NEG_TTL_MS)) {
    return sessionTenants.get(token) || null;
  }
  // Miss de cache: escanear sesión — primero empresa #1 (el caso común y el más barato),
  // y solo si no está, las demás empresas activas (token indexado, una consulta por BD).
  const scan = (empresaId, dbPath) => {
    let found = null;
    try {
      dbAdapter.tenantContext.run({ empresaId, dbPath }, () => { found = store.getDBSession(token); });
    } catch (e) { found = null; }
    return found;
  };
  let s = scan(dbAdapter.DEFAULT_EMPRESA_ID, dbAdapter.DEFAULT_DB_PATH);
  if (!s) {
    try {
      const platform = require('./db/platform');
      for (const e of platform.getEmpresas() || []) {
        if (!e.activo || Number(e.id) === dbAdapter.DEFAULT_EMPRESA_ID) continue;
        s = scan(e.id, e.db_path);
        if (s) break;
      }
    } catch (e) { /* control plane no disponible → sesión solo en empresa #1 */ }
  }
  const res = s ? {
    empresaId: s.empresa_id != null ? Number(s.empresa_id) : dbAdapter.DEFAULT_EMPRESA_ID,
    dbPath: s.empresa_db_path || dbAdapter.DEFAULT_DB_PATH,
  } : null;
  sessionTenants.set(token, res);
  sessionTenantsAt.set(token, now);
  return res;
}

app.use((req, res, next) => {
  const ten = resolveTenantForSession(auth.getTokenFromReq(req));
  dbAdapter.tenantContext.run(ten || { empresaId: dbAdapter.DEFAULT_EMPRESA_ID, dbPath: dbAdapter.DEFAULT_DB_PATH }, next);
});

// Guardar el body crudo para verificar la firma del webhook de Meta.
// Límite de payload por tipo de ruta: las de media (base64) aceptan hasta 25mb;
// el resto 1mb — evita que un JSON gigante presione la RAM del contenedor (700MB).
const esRutaMedia = (req) => /\/(responder-media|media|campaigns\/whatsapp|meta-ads\/media\/images)$/.test(req.path);
const jsonMedia = express.json({ limit: '25mb' });
const jsonNormal = express.json({
  limit: '1mb',
  verify: (req, res, buf) => { if (req.originalUrl.startsWith('/webhook')) req.rawBody = buf; },
});
app.use((req, res, next) => (esRutaMedia(req) ? jsonMedia : jsonNormal)(req, res, next));
// Twilio envía sus webhooks como application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// Headers de seguridad en todas las respuestas
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // geolocation=(self): el CRM sí necesita GPS propio — enviar la ubicación a un
  // cliente y compartir la posición del asesor durante la jornada. Estaba en `()`, que
  // lo bloquea incluso para el propio sitio, así que el navegador negaba el permiso
  // aunque el usuario lo hubiera concedido. Sigue vedado para iframes de terceros.
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=(self)');
  // Fuentes auto-hospedadas en /fonts/ (Fase 1.3, docs/AUDITORIA_2026-08.md) — ya no se
  // depende de Google Fonts en tiempo de ejecución, así que font-src/style-src vuelven
  // a 'self'.
  // Mapas: las teselas y los geocodificadores son los ÚNICOS orígenes externos que se
  // permiten. Sin esto, `img-src 'self'` bloqueaba en silencio todas las teselas —el
  // picker de ubicación del asesor, los mini-mapas del inbox y el mapa del equipo se
  // veían en gris— y `connect-src 'self'` tumbaba la búsqueda de lugares.
  // cartocdn es el proveedor de teselas oscuras por defecto (no necesita token); va
  // también en connect-src porque la descarga de mapas para uso sin señal las pide por
  // fetch, no por <img>.
  const ORIGENES_MAPA_IMG = 'https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://api.mapbox.com';
  const ORIGENES_MAPA_API = 'https://*.basemaps.cartocdn.com https://nominatim.openstreetmap.org https://api.mapbox.com';
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
    `font-src 'self'; img-src 'self' data: blob: ${ORIGENES_MAPA_IMG}; media-src 'self' blob:; ` +
    `connect-src 'self' ${ORIGENES_MAPA_API}`);
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
// Login: la clave es teléfono+IP y solo cuentan los intentos FALLIDOS. Contar por IP a secas
// bloqueaba a todo el equipo: varios vendedores salen por el mismo WiFi (o por el CGNAT del
// operador móvil), así que los 10 intentos se agotaban entre todos y nadie podía volver a entrar
// tras cerrar sesión. Con la clave por número, equivocarse de PIN solo te afecta a ti.
const loginLimiter = rateLimit({
  windowMs: CFG.LOGIN_WINDOW_MS,
  max: CFG.LOGIN_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // entrar bien no consume cupo — cerrar sesión y volver nunca bloquea
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req);
    const tel = req.body && req.body.telefono ? String(req.body.telefono).trim() : '';
    const email = req.body && req.body.email ? String(req.body.email).toLowerCase().trim() : '';
    const id = tel || email;
    return id ? `login:${id}` : `login-ip:${ip}`;
  },
  message: { error: 'demasiados_intentos' },
});
const mediaLimiter = rateLimit({ windowMs: 60 * 1000, max: CFG.MEDIA_MAX_PER_MIN, standardHeaders: true, legacyHeaders: false, message: { error: 'demasiadas_peticiones' } });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: CFG.WEBHOOK_MAX_PER_MIN, standardHeaders: false, legacyHeaders: false });
const messageLimiter = rateLimit({ windowMs: 60 * 1000, max: CFG.MESSAGE_MAX_PER_MIN, standardHeaders: true, legacyHeaders: false, message: { error: 'demasiados_mensajes_espera' } });
// Registro público de asesores (sin sesión) — límite estricto anti-abuso, no reutiliza loginLimiter
// porque es una acción de escritura (crea filas), no solo intentos de autenticación.
// Fase 4: registroLimiter movido a routes/vendedores.js (único lugar que lo usaba)
// Catálogo público (sin sesión): lectura, pero expuesto a internet. Límite generoso
// para navegación normal, pero acotado para frenar scraping masivo.
const catalogoLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'demasiadas_peticiones' } });
// Paraguas general para el resto de /api/* (login/media/webhook/responder ya tienen el suyo propio,
// más estricto). No aplica a /api/stream: es una sola conexión SSE de larga duración, no ráfagas.
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: CFG.API_MAX_PER_MIN, standardHeaders: true, legacyHeaders: false, skip: (req) => req.path === '/stream' || req.path === '/login', message: { error: 'demasiadas_peticiones' } });

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
    if (filePath.endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

// Validación de teléfono colombiano (formato: +57 3XX XXX XXXX)
// Fase 4: movido a src/utils/validar-telefono.js (lo comparte routes/vendedores.js)
const { validarTelefono } = require('./utils/validar-telefono');

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Leons Group', version: '1.1.0' }));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'privacy.html')));

app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => {
  const dbOk = (() => { try { return !!store.getDB(); } catch { return false; } })();
  res.json({ status: dbOk ? 'ok' : 'error', timestamp: new Date().toISOString(), db: dbOk ? 'connected' : 'disconnected', uptime: process.uptime() });
});

// Versión publicada de la app Android (auto-actualización in-app).
// Sin auth: el update-gate corre antes del login. version.json lo genera
// `npm run release:apk` — nunca se edita a mano. El APK se sirve por
// express.static desde public/descargas/ (HTTP Range gratis, sin rate limit).
app.get('/api/app/version', (req, res) => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'public', 'descargas', 'version.json'), 'utf8');
    res.set('Cache-Control', 'no-store');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(404).json({ error: 'sin_version_publicada' });
  }
});

app.get('/webhook', handleVerification);
app.post('/webhook', webhookLimiter, verifyWebhookSignature, handleMessage);

// ===================== ESTADO DE CANALES =====================

app.get('/api/channels/status', auth.requireAdmin, (req, res) => {
  res.json({
    whatsapp: !!process.env.WHATSAPP_TOKEN,
    messenger: !!(store.getConfig('channel_messenger_token') || process.env.FACEBOOK_PAGE_TOKEN),
    instagram: !!(store.getConfig('channel_instagram_token') || process.env.INSTAGRAM_TOKEN),
  });
});

// Mapa honesto del sistema (sección "Capacidades") — consolida checks que hoy están
// dispersos en varios servicios/endpoints, para no tener que adivinar "¿esto está
// encendido?" función por función. status: 'on' | 'warn' | 'off'.
app.get('/api/capacidades', auth.requireAdmin, (req, res) => {
  const nlp = require('./services/nlp');
  const push = require('./services/push');
  const transcribe = require('./services/transcribe');
  const campanasSp = require('./services/campanas-sp');

  const whatsappOk = !!process.env.WHATSAPP_TOKEN;
  const messengerOk = !!(store.getConfig('channel_messenger_token') || process.env.FACEBOOK_PAGE_TOKEN);
  const instagramOk = !!(store.getConfig('channel_instagram_token') || process.env.INSTAGRAM_TOKEN);
  const iaOk = nlp.isAIEnabled();
  const transcribeOk = transcribe.isEnabled();
  const pushInfo = { enabled: push.isEnabled(), fcm: push.isFcmEnabled() };
  const cadenciaOn = store.getConfig('cadencia_auto') === '1';
  const pythonOk = campanasSp.pythonAvailable();
  const geminiOk = campanasSp.aiEnabled();

  res.json([
    { id: 'whatsapp', label: 'WhatsApp', status: whatsappOk ? 'on' : 'off', detail: whatsappOk ? 'Token configurado' : 'Falta WHATSAPP_TOKEN', link: '/os/integraciones.html' },
    { id: 'messenger', label: 'Messenger', status: messengerOk ? 'on' : 'off', detail: messengerOk ? 'Conectado' : 'No conectado', link: '/os/integraciones.html' },
    { id: 'instagram', label: 'Instagram', status: instagramOk ? 'on' : 'off', detail: instagramOk ? 'Conectado' : 'No conectado', link: '/os/integraciones.html' },
    { id: 'ia_copiloto', label: 'IA Copiloto', status: iaOk ? 'on' : 'off', detail: iaOk ? 'Proveedor configurado' : 'Sin proveedor con API Key', link: '/os/configuracion.html' },
    { id: 'transcripcion', label: 'Transcripción de voz', status: transcribeOk ? 'on' : 'off', detail: transcribeOk ? 'Whisper disponible' : 'Requiere proveedor Groq/OpenAI en IA Copiloto', link: '/os/configuracion.html' },
    { id: 'push', label: 'Notificaciones push', status: pushInfo.enabled ? 'on' : 'off', detail: pushInfo.enabled ? (pushInfo.fcm ? 'Web Push + FCM nativo' : 'Web Push (sin FCM nativo)') : 'Sin credenciales VAPID', link: null },
    { id: 'catalogo', label: 'Catálogo público', status: 'on', detail: 'Activo — proyectos en preventa/venta se publican automáticamente', link: '/catalogo/' },
    { id: 'cadencia', label: 'Cadencia automática', status: cadenciaOn ? 'on' : 'warn', detail: cadenciaOn ? 'Activa' : 'Apagada (opt-in)', link: '/os/automatizaciones.html' },
    { id: 'campanas_sp', label: 'Generador de creativos', status: pythonOk ? (geminiOk ? 'on' : 'warn') : 'off', detail: !pythonOk ? 'Python no disponible en el contenedor' : (geminiOk ? 'Python + IA Gemini' : 'Python OK, sin GOOGLE_API_KEY (fondos IA desactivados, cae a Pillow)'), link: '/os/campanas-sp.html' },
    { id: 'meta_ads', label: 'Meta Ads', status: (process.env.META_MARKETING_API_TOKEN && process.env.META_AD_ACCOUNT_ID) ? 'on' : 'off', detail: (process.env.META_MARKETING_API_TOKEN && process.env.META_AD_ACCOUNT_ID) ? 'Marketing API conectada' : 'Falta META_MARKETING_API_TOKEN o META_AD_ACCOUNT_ID', link: '/os/meta-ads.html' },
    { id: 'calendario', label: 'Calendario', status: 'on', detail: 'Activo', link: '/os/calendario.html' },
    { id: 'insignias', label: 'Insignias', status: 'on', detail: 'Activo', link: '/os/equipo.html' },
    { id: 'webhook_firma', label: 'Firma del webhook', status: process.env.APP_SECRET ? 'on' : 'off', detail: process.env.APP_SECRET ? 'Verificación de firma activa (APP_SECRET configurado)' : 'Sin APP_SECRET — el webhook acepta requests sin verificar firma', link: null },
  ]);
});

function tamanoMediaDir() {
  try {
    const { MEDIA_DIR } = require('./services/media');
    if (!fs.existsSync(MEDIA_DIR)) return 0;
    return fs.readdirSync(MEDIA_DIR).reduce((sum, f) => {
      try { return sum + fs.statSync(path.join(MEDIA_DIR, f)).size; } catch (e) { return sum; }
    }, 0);
  } catch (e) { return 0; }
}

// Sección "Uso" — mes en curso + serie de 6 meses para el mini-gráfico.
app.get('/api/uso', auth.requireAdmin, async (req, res) => {
  const claves = ['mensajes_enviados', 'mensajes_recibidos', 'generaciones_ia', 'campanas_enviadas'];
  const actual = store.getUsage();
  const serie = store.getUsageRange(claves, 6);
  const campaignRunner = require('./services/campaign-runner');

  let tierWhatsapp = null;
  try {
    const q = await require('./services/whatsapp').getPhoneQuality();
    tierWhatsapp = { calidad: q.quality_rating, tier: q.messaging_limit_tier };
  } catch (e) { /* Meta puede estar caída/sin credenciales — el resto de "Uso" no depende de esto */ }

  res.json({
    periodo: new Date().toISOString().slice(0, 7),
    mensajes_enviados: actual.mensajes_enviados || 0,
    mensajes_recibidos: actual.mensajes_recibidos || 0,
    generaciones_ia: actual.generaciones_ia || 0,
    campanas_enviadas: actual.campanas_enviadas || 0,
    conversaciones_activas: store.getLeadCount ? store.getLeadCount() : null,
    almacenamiento_media_bytes: tamanoMediaDir(),
    campanas_hoy: campaignRunner.sentToday(),
    campanas_limite_diario: campaignRunner.getDailyLimit(),
    whatsapp_tier: tierWhatsapp,
    serie_6_meses: serie,
  });
});

// Guarda el token (+ id de página/cuenta) de un canal desde la UI de Integraciones,
// sin tener que editar el .env del servidor. Se persiste en la tabla config.
const CHANNEL_TOKEN_FIELDS = {
  messenger: { tokenKey: 'channel_messenger_token', idKey: 'channel_messenger_page_id', idField: 'pageId' },
  instagram: { tokenKey: 'channel_instagram_token', idKey: 'channel_instagram_user_id', idField: 'igUserId' },
};
app.post('/api/channels/:name/token', auth.requireAdmin, async (req, res) => {
  const { name } = req.params;
  const cfg = CHANNEL_TOKEN_FIELDS[name];
  if (!cfg) return res.status(404).json({ error: 'canal_no_soporta_token_ui' });
  const { token, pageId, igUserId } = req.body || {};
  const id = pageId || igUserId;
  if (!token || !String(token).trim()) return res.status(400).json({ error: 'token_requerido' });
  if (!id || !String(id).trim()) return res.status(400).json({ error: 'id_requerido' });

  // Validar token + id contra Graph API antes de guardar: evita tokens inválidos
  // (ej. tokens legacy de Instagram que Meta rechaza con error 190).
  try {
    const axios = require('axios');
    const resp = await axios.get(`https://graph.facebook.com/v22.0/${String(id).trim()}`, {
      params: { fields: 'id', access_token: String(token).trim() },
      timeout: 15000,
    });
    if (!resp.data || !resp.data.id) throw new Error('La API no devolvió el id solicitado');
  } catch (e) {
    const detalle = (e.response && e.response.data && e.response.data.error && e.response.data.error.message) || e.message;
    return res.status(400).json({ error: 'token_invalido', detalle: String(detalle).slice(0, 300) });
  }

  store.setConfig(cfg.tokenKey, String(token).trim());
  if (id && String(id).trim()) store.setConfig(cfg.idKey, String(id).trim());
  res.json({ ok: true });
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

// Calificación de temperatura del lead (A2): deriva 🔥/🌤️/❄️ de la probabilidad
// de cierre que estima la IA y la guarda en el lead.
function tempFromProb(p) { const n = Number(p) || 0; return n >= 66 ? 'caliente' : n >= 33 ? 'tibio' : 'frio'; }
app.post('/api/leads/:id/calificar', auth.requireAuth, async (req, res) => {
  try {
    const nlp = require('./services/nlp');
    const lead = store.getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'no_existe' });
    if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
      return res.status(403).json({ error: 'sin_permiso' });
    }
    if (!nlp.isAIEnabled()) return res.json({ ok: true, temperatura: lead.temperatura || null, analysis: null, aiOff: true });
    const mensajes = store.getMessagesByLead(lead.id) || [];
    const history = mensajes.map(m => ({ role: m.direction === 'incoming' ? 'customer' : 'seller', text: m.body }));
    const analysis = await nlp.analyzeLead(history, lead.nombre, lead.etiqueta);
    const temperatura = tempFromProb(analysis && analysis.closeProbability);
    store.setLeadTemperatura(lead.id, temperatura);
    res.json({ ok: true, temperatura, analysis });
  } catch (e) {
    console.error('[NLP] calificar error:', e.message);
    res.json({ ok: true, temperatura: null, analysis: null });
  }
});

// Resumen "Ponme al día" (A5): resume la conversación para ponerse al corriente rápido.
app.post('/api/leads/:id/resumen', auth.requireAuth, async (req, res) => {
  try {
    const nlp = require('./services/nlp');
    const lead = store.getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'no_existe' });
    if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
      return res.status(403).json({ error: 'sin_permiso' });
    }
    if (!nlp.isAIEnabled()) return res.json({ ok: true, resumen: null, aiOff: true });
    const mensajes = store.getMessagesByLead(lead.id) || [];
    const history = mensajes.map(m => ({ role: m.direction === 'incoming' ? 'customer' : 'seller', text: m.body }));
    const resumen = await nlp.summarizeConversation(history, lead.nombre);
    res.json({ ok: true, resumen });
  } catch (e) {
    console.error('[NLP] resumen error:', e.message);
    res.json({ ok: true, resumen: null });
  }
});

// Posponer / reactivar un chat (C2). Body: { minutos } o { until: ISO } o {} para reactivar.
app.post('/api/leads/:id/snooze', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const { minutos, until } = req.body || {};
  let iso = null;
  if (until) iso = new Date(until).toISOString();
  else if (minutos) iso = new Date(Date.now() + Number(minutos) * 60000).toISOString();
  store.setLeadSnooze(lead.id, iso);
  res.json({ ok: true, snoozed_until: iso });
});

// Transcripción on-demand de una nota de voz (A3): reencola si aún no tiene texto.
app.post('/api/messages/:id/transcribir', auth.requireAuth, (req, res) => {
  const msg = store.getMessageById(req.params.id);
  if (!msg) return res.status(404).json({ error: 'no_existe' });
  if (msg.transcript) return res.json({ ok: true, transcript: msg.transcript });
  if (msg.media_type !== 'audio') return res.status(400).json({ error: 'no_es_audio' });
  const nlp = require('./services/nlp');
  if (!nlp.isAIEnabled()) return res.json({ ok: true, queued: false, aiOff: true });
  require('./services/transcribe').enqueue({ wamid: msg.wamid, filename: msg.media_filename, mime: msg.media_mime });
  res.json({ ok: true, queued: true });
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
    const result = await nlp.chatText(
      `Eres Copiloto SP, el asistente IA de Leons Group, una firma colombiana de inversión en lotes.
      Ayudas a los vendedores del equipo a mejorar sus ventas, redactar mensajes, analizar leads, y resolver dudas.
      Responde de forma clara, profesional y en español.`,
      `${ctx ? 'Contexto:\n' + ctx + '\n\n' : ''}Mensaje: ${message}`,
      45000,
      { providerId, model }
    );
    res.json({ ok: true, reply: result.text, model: result.model || model || nlp.getModel() });
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

// ===================== PIXEL CONFIG (público) =====================
app.get('/api/pixel-config', (req, res) => {
  res.json({ pixelId: process.env.META_PIXEL_ID || '' });
});

// ===================== META ADS DEBUG (solo admin) =====================
app.get('/api/meta-ads-debug', auth.requireAdmin, (req, res) => {
  // Fase 1.3 (docs/AUDITORIA_2026-08.md): consistente con /api/seed, /api/test-webhook y
  // /api/test-reply — endpoint de diagnóstico de desarrollo, no debe existir en producción
  // (expone tokenPrefix, los primeros 10 caracteres del token de Meta Ads).
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'no_disponible' });
  const token = process.env.META_MARKETING_API_TOKEN || '';
  const accountId = process.env.META_AD_ACCOUNT_ID || '';
  const pixelId = process.env.META_PIXEL_ID || '';
  res.json({
    tokenSet: !!token,
    tokenLength: token.length,
    tokenPrefix: token ? token.substring(0, 10) : '',
    accountIdSet: !!accountId,
    accountId,
    pixelIdSet: !!pixelId,
    pixelId,
    nodeEnv: process.env.NODE_ENV || 'unknown',
  });
});

app.get('/os/meta-ads.html', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, '..', 'public', 'os', 'meta-ads.html'));
});

app.use('/api/v2', require('./api/v2'));

// ===================== SUPERVISOR CENTER API =====================
// Toda la API del rol supervisor vive aquí abajo. El middleware requireSupervisorOrAdmin
// aplica al router entero (supervisor + admin: el admin es superset y publica al SP Feed).
// Endpoints de solo lectura (dashboard/equipo) o de acciones operativas (reasignar)
// reusan store.js sin duplicar queries. Sprints 2-8 van llenando los stubs 501 que el
// router expone.
app.use('/api/supervisor', auth.requireSupervisorOrAdmin, require('./api/supervisor'));

// ===================== META ADS (Marketing API) =====================
app.use('/api/meta-ads', auth.requireAdmin, require('./routes/meta-ads'));

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
    // Agregados 100% en SQL — no carga todos los leads a memoria (escala con volumen)
    const agg = store.getLeadAggregates();
    const { total, porEtiqueta, porEstado, porVendedor, respondidos, sumaRespuestaMin } = agg;
    const vendidosTotal = porEtiqueta['vendido'] || 0;
    let sinResponder = 0;
    try {
      const r = store.one("SELECT COUNT(*) as c FROM leads WHERE first_response_at IS NULL AND COALESCE(status,'') != 'cerrado'");
      sinResponder = r ? Number(r.c) : 0;
    } catch (e) { /* noop */ }

    // Conteo total de mensajes (entrantes + salientes) del número principal
    let totalMensajes = 0, mensajesEntrantes = 0;
    try {
      const rm = store.one('SELECT COUNT(*) as c FROM messages');
      totalMensajes = rm ? Number(rm.c) : 0;
      const ri = store.one("SELECT COUNT(*) as c FROM messages WHERE direction = 'incoming'");
      mensajesEntrantes = ri ? Number(ri.c) : 0;
    } catch (e) { /* noop */ }

    res.json({
      total,
      totalMensajes,
      mensajesEntrantes,
      vendidos: vendidosTotal,
      conversionGlobal: total ? Math.round((vendidosTotal / total) * 100) : 0,
      tiempoRespuestaPromedio: respondidos ? Math.round(sumaRespuestaMin / respondidos) : null,
      respondidos,
      sinResponder,
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
    const all = getLeads(true, 2000);
    const vendedores = getVendedores();

    // Leads por día (últimos 30)
    const leadsDiarios = store.all(`
      SELECT date(created_at) as dia, COUNT(*) as total
      FROM leads WHERE created_at >= datetime('now', '-30 days')
      GROUP BY dia ORDER BY dia
    `).map(r => ({ dia: r.dia, total: r.total }));

    // Mensajes por día (últimos 30)
    const msgsDiarios = store.all(`
      SELECT date(timestamp) as dia, COUNT(*) as total
      FROM messages WHERE timestamp >= datetime('now', '-30 days')
      GROUP BY dia ORDER BY dia
    `).map(r => ({ dia: r.dia, total: r.total }));

    // Origen
    const origen = {};
    all.forEach(l => { const o = l.origen || 'desconocido'; origen[o] = (origen[o] || 0) + 1; });

    // Leads por hora
    const horaDist = store.all(`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) as h, COUNT(*) as total
      FROM leads GROUP BY h ORDER BY h
    `).map(r => ({ h: r.h, total: r.total }));

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

// ===================== VENDEDORES ===================== (Fase 4: extraído a
// src/routes/vendedores.js. La ruta /api/vendedores/:id/zonas sigue abajo, ligada al
// feature de zonas geográficas que vive en otra rama de trabajo.)
// Sin auth.requireAuth a nivel de mount: POST /registro es público a propósito
// (auto-registro sin sesión previa) — cada ruta declara su propio nivel adentro.
app.use('/api/vendedores', require('./routes/vendedores'));

// ===================== AUTENTICACIÓN =====================

app.post('/api/login', loginLimiter, (req, res) => {
  try {
  const { email, password, telefono, pin } = req.body || {};
  const secure = (process.env.SECURE_COOKIES === 'true' || req.headers['x-forwarded-proto'] === 'https' || req.secure) ? '; Secure' : '';
  const MAX_AGE = CFG.SESSION_TTL_MS / 1000; // 30 días en segundos

  // Vid.a V3 — selector manual de empresa para negocios clientes (por dominio es V4).
  // Sin `empresa`, el login valida contra empresa #1 (comportamiento histórico intacto).
  let loginTenant = null;
  const empresaSlug = req.body && req.body.empresa ? String(req.body.empresa).trim() : '';
  if (empresaSlug) {
    try {
      const platform = require('./db/platform');
      const emp = platform.getEmpresaBySlug(empresaSlug.toLowerCase());
      if (!emp) return res.status(401).json({ error: 'empresa_no_existe' });
      loginTenant = { empresaId: emp.id, dbPath: emp.db_path, empresa: emp };
    } catch (e) {
      console.error('[LOGIN] error resolviendo empresa:', e.message);
      return res.status(500).json({ error: 'error_empresa' });
    }
  }
  // El resto del login (buscar vendedor, validar PIN, crear sesión) corre dentro del
  // tenant resuelto — createSession guarda ese tenant en la sesión (ver auth.js).
  const runLogin = (fn) => (loginTenant ? dbAdapter.tenantContext.run(loginTenant, fn) : fn());

  // Destruir sesión anterior si existe (session fixation prevention)
  const oldToken = auth.getTokenFromReq(req);
  if (oldToken) auth.destroySession(oldToken);

  // Teléfono + PIN (vendedor o admin)
  if (telefono && pin) {
    return runLogin(() => {
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
    if (vendedor.estado === 'pendiente') {
      console.log('[LOGIN] Cuenta pendiente de aprobación:', vendedor.nombre, vendedor.id);
      return res.status(403).json({ error: 'cuenta_pendiente_aprobacion' });
    }
    if (!auth.verifyPassword(String(pin), vendedor.pin)) {
      console.log('[LOGIN] PIN incorrecto para:', vendedor.nombre, vendedor.id);
      return res.status(401).json({ error: 'credenciales_invalidas' });
    }
    // Verificar si tiene usuario asociado (admin o supervisor); sin usuario, es vendedor puro.
    const usuario = store.getUsuarioByVendedorId(vendedor.id);
    let rol = 'vendedor';
    if (usuario && ['admin', 'supervisor', 'jefe'].includes(usuario.rol)) rol = usuario.rol;
    const token = auth.createSession({ vendedorId: vendedor.id, userId: usuario ? usuario.id : null, rol, nombre: vendedor.nombre, userAgent: req.headers['user-agent'] });
    res.setHeader('Set-Cookie', `sp_session=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`);
    // PIN de fábrica: obligar a cambiarlo antes de usar el panel
    const mustChange = String(pin) === '0000';
    return res.json({ ok: true, token, must_change: mustChange, usuario: { nombre: vendedor.nombre, rol, vendedorId: vendedor.id }, empresa: loginTenant ? { id: loginTenant.empresaId, nombre: loginTenant.empresa.nombre, slug: loginTenant.empresa.slug } : undefined });
    });
  }

  // Email + contraseña (legacy admin)
  if (email && password) {
    const usuario = store.getUsuarioByEmail(String(email).toLowerCase().trim());
    if (!usuario || !auth.verifyPassword(password, usuario.password)) {
      return res.status(401).json({ error: 'credenciales_invalidas' });
    }
    const token = auth.createSession({ ...usuario, userAgent: req.headers['user-agent'] });
    res.setHeader('Set-Cookie', `sp_session=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`);
    const mustChange = ['changeme123', 'cambiar123'].includes(String(password));
    return res.json({ ok: true, token, must_change: mustChange, usuario: { nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, vendedorId: usuario.vendedor_id } });
  }

  return res.status(400).json({ error: 'credenciales_requeridas' });
  } catch (err) {
    console.error('[LOGIN] ERROR INTERNO:', err && err.stack ? err.stack : err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'error_interno' });
    }
  }
});

// Cambiar el PIN propio (obligatorio tras primer login con PIN de fábrica 0000)
app.post('/api/mi-pin', auth.requireAuth, (req, res) => {
  const { pin } = req.body || {};
  if (!/^\d{4}$/.test(String(pin || ''))) return res.status(400).json({ error: 'pin_invalido' });
  if (String(pin) === '0000') return res.status(400).json({ error: 'pin_debil' });
  if (!req.session.vendedorId) return res.status(400).json({ error: 'sin_vendedor' });
  store.setVendedorPin(req.session.vendedorId, auth.hashPassword(String(pin)));
  console.log(`[PIN] Vendedor ${req.session.vendedorId} cambió su PIN`);
  res.json({ ok: true });
});

// Etiqueta legible de dispositivo a partir del User-Agent — no es un parser completo
// (no hace falta una librería para esto), solo lo suficiente para que la lista de
// sesiones diga "Chrome en Windows" en vez de pegar el user-agent crudo.
function dispositivoLegible(ua) {
  ua = String(ua || '');
  if (!ua) return 'Dispositivo desconocido';
  let so = 'Dispositivo';
  if (/iPhone/.test(ua)) so = 'iPhone';
  else if (/iPad/.test(ua)) so = 'iPad';
  else if (/Android/.test(ua)) so = 'Android';
  else if (/Windows/.test(ua)) so = 'Windows';
  else if (/Macintosh|Mac OS X/.test(ua)) so = 'Mac';
  else if (/Linux/.test(ua)) so = 'Linux';
  let nav = '';
  if (/EdgA|Edge\//.test(ua)) nav = 'Edge';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) nav = 'Chrome';
  else if (/CriOS/.test(ua)) nav = 'Chrome';
  else if (/Firefox\//.test(ua)) nav = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) nav = 'Safari';
  return nav ? `${nav} en ${so}` : so;
}

app.get('/api/me/sesiones', auth.requireAuth, (req, res) => {
  const rows = store.getSessionsByOwner(req.session.vendedorId, req.session.vendedorId ? null : req.session.userId);
  res.json(rows.map(s => ({
    token: s.token,
    dispositivo: dispositivoLegible(s.user_agent),
    ultima_actividad: s.last_seen_at || s.created_at,
    actual: s.token === req.token,
  })));
});

app.delete('/api/me/sesiones/:token', auth.requireAuth, (req, res) => {
  const target = store.getDBSession(req.params.token);
  // Nunca cerrar una sesión ajena: el token debe pertenecer a la misma cuenta que pide el cierre.
  const esMia = target && (
    (req.session.vendedorId != null && target.vendedor_id === req.session.vendedorId) ||
    (req.session.vendedorId == null && target.user_id === req.session.userId)
  );
  if (!esMia) return res.status(404).json({ error: 'sesion_no_encontrada' });
  store.deleteDBSession(req.params.token);
  res.json({ ok: true });
});

app.post('/api/me/cerrar-todas', auth.requireAuth, (req, res) => {
  const n = store.deleteOtherSessions(req.token, req.session.vendedorId, req.session.vendedorId ? null : req.session.userId);
  res.json({ ok: true, cerradas: n });
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
    about: v ? (v.about || '') : '',
    foto: v ? v.foto : null,
    estado: v ? v.estado : null,
    two_fa: v ? (v.two_fa ? true : false) : false,
  });
});

app.post('/api/me/2fa', auth.requireAuth, (req, res) => {
  const { enable } = req.body || {};
  if (!req.session.vendedorId) return res.status(400).json({ error: 'sin_vendedor' });
  store.setVendedor2FA(req.session.vendedorId, Boolean(enable));
  res.json({ ok: true, two_fa: Boolean(enable) });
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

// "Mi Día": seguimientos vencidos, citas de hoy, leads calientes y fríos (datos reales)
app.get('/api/me/mi-dia', auth.requireAuth, (req, res) => {
  const vendedorId = req.session.vendedorId;
  if (!vendedorId) return res.json({ tareasVencidas: [], citasHoy: [], calientes: [], frios: [] });
  try { res.json(store.getMiDia(vendedorId)); }
  catch (e) { console.error('[MI-DIA] error:', e.message); res.json({ tareasVencidas: [], citasHoy: [], calientes: [], frios: [] }); }
});

// Insignias del asesor logueado + catálogo completo (para mostrar bloqueadas/desbloqueadas)
app.get('/api/me/insignias', auth.requireAuth, (req, res) => {
  const { CATALOGO } = require('./services/insignias');
  const vendedorId = req.session.vendedorId;
  const ganadas = vendedorId ? store.getInsignias(vendedorId) : [];
  res.json({ catalogo: CATALOGO, ganadas });
});

// GET /api/vendedores/:id/perfil — Fase 4: movido a routes/vendedores.js

// Ranking del equipo (para asesores y admin): ventas y tasa de respuesta, datos reales.
app.get('/api/equipo/ranking', auth.requireAuth, (req, res) => {
  try {
    const stats = store.getInsigniaStats();
    const ranking = stats.map(s => ({
      vendedorId: s.vendedor_id, nombre: s.nombre,
      vendidos: Number(s.vendidos) || 0, vendidosMes: Number(s.vendidos_mes) || 0, activos: Number(s.activos) || 0,
    })).sort((a, b) => b.vendidosMes - a.vendidosMes || b.vendidos - a.vendidos);
    res.json(ranking);
  } catch (e) { console.error('[RANKING] error:', e.message); res.json([]); }
});

// Recalcular insignias manualmente (admin) — el scheduler lo hace a diario de todos modos
app.post('/api/admin/recalcular-insignias', auth.requireAdmin, (req, res) => {
  const { recomputeAll } = require('./services/insignias');
  res.json(recomputeAll());
});

// ===================== PANEL DEL VENDEDOR =====================

// Leads asignados al vendedor logueado (admin/supervisor ven todos; el jefe además
// trabaja los suyos como cualquier asesor — ver getVendedoresActivos en store.js).
app.get('/api/mis-leads', auth.requireAuth, (req, res) => {
  if (req.session.rol === 'admin' || req.session.rol === 'supervisor') return res.json(getLeads());
  if (req.session.rol === 'jefe') return res.json(store.getLeadsByVendedorId(req.session.vendedorId));
  if (!req.session.vendedorId) return res.json([]);
  const leads = store.getLeadsByVendedorId(req.session.vendedorId);
  const limite = Math.min(Number(req.query.limite) || leads.length, 200);
  res.json(leads.slice(0, limite));
});

app.get('/api/mis-leads/archivados', auth.requireAuth, (req, res) => {
  if (!req.session.vendedorId) return res.json([]);
  res.json(store.getArchivedLeadsByVendedorId(req.session.vendedorId));
});

// Un solo lead (para refresco incremental del panel — evita recargar toda la lista)
app.get('/api/leads/:id(\\d+)', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (!esAccesoGlobal(req) && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  res.json(lead);
});

// Historial de mensajes de un lead (solo si le pertenece, es admin o supervisor)
app.get('/api/leads/:id/mensajes', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (!esAccesoGlobal(req) && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  // Paginado: por defecto los últimos 100; ?before_id=N trae la página anterior
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const beforeId = req.query.before_id ? Number(req.query.before_id) : null;
  const mensajes = store.getMessagesByLead(lead.id, { limit, beforeId });
  // Adjuntar reacciones a cada mensaje
  const msgIds = mensajes.map(m => m.id);
  const reactionsMap = store.getReactionsForMessages(msgIds);
  const mensajesConReacciones = mensajes.map(m => ({
    ...m,
    reactions: reactionsMap[m.id] || [],
  }));
  const total = store.countMessagesByLead(lead.id);
  res.json({ lead, mensajes: mensajesConReacciones, total, hay_mas: mensajes.length === limit && total > mensajes.length });
});

// Estado de la ventana de 24h de WhatsApp para un lead
app.get('/api/leads/:id/window-status', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (!esAccesoGlobal(req) && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const isOpen = store.isWindowOpen(lead.id);
  const expiresAt = store.getWindowExpiresAt(lead.id);
  const templateName = store.getConfig('reengagement_template') || '';
  res.json({ open: isOpen, expiresAt, templateName });
});

// ===================== INBOX MULTICANAL (Nuevo Schema) =====================

app.get('/api/inbox/conversations', auth.requireAuth, (req, res) => {
  if (esAccesoGlobal(req)) return res.json(store.getConversations({ limite: 200 }));
  if (!req.session.vendedorId) return res.json([]);
  res.json(store.getConversationsByVendedorId(req.session.vendedorId));
});

// Devuelve true si la sesión puede operar sobre esta conversación (admin o vendedor asignado).
// Si no puede, ya envía el 403 y el caller debe hacer `return`.
function assertConvAccess(req, res, conv) {
  if (esAccesoGlobal(req) || Number(conv.assigned_to_id) === Number(req.session.vendedorId)) return true;
  res.status(403).json({ error: 'sin_permiso' });
  return false;
}

// ¿La sesión ve/opera conversaciones de cualquier asesor? (admin, supervisor o jefe)
// Fuente única — también exportada vía auth.esAccesoGlobal para src/api/v2/* y
// cualquier otro router que necesite el mismo criterio sin duplicarlo.
const esAccesoGlobal = auth.esAccesoGlobal;

app.get('/api/inbox/conversations/:id/timeline', auth.requireAuth, (req, res) => {
  let conv = store.getConversationById(req.params.id);
  // Fallback: si el id corresponde a un lead legacy sin conversación (item _type:'lead'
  // del inbox unificado), crearla al vuelo con su historial en lugar de dar 404.
  if (!conv) conv = store.getOrCreateConversationForLead(req.params.id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  if (!esAccesoGlobal(req) && Number(conv.assigned_to_id) !== Number(req.session.vendedorId))
    return res.status(403).json({ error: 'sin_permiso' });
  const messages = store.getTimelineByConversation(conv.id);
  // Enriquecer con reacciones: buscar mensajes en la tabla messages que coincidan
  // con los eventos de timeline (por wamid/mid en metadata) y adjuntar sus reacciones
  const msgIds = [];
  for (const m of messages) {
    if (m.event_type !== 'message') continue;
    try {
      const md = m.metadata ? JSON.parse(m.metadata) : {};
      // Buscar por wamid (WhatsApp) o mid (Messenger)
      const lookup = md.wamid || md.mid || null;
      if (lookup) {
        const msg = store.getMessageByWamid(lookup);
        if (msg) { msgIds.push(msg.id); m._msgId = msg.id; }
      }
    } catch (e) { /* skip */ }
  }
  // Agregar reacciones a cada mensaje
  if (msgIds.length > 0) {
    const reactionsMap = store.getReactionsForMessages(msgIds);
    for (const m of messages) {
      if (m._msgId && reactionsMap[m._msgId]) {
        m.reactions = reactionsMap[m._msgId];
      }
    }
  }
  res.json({ conversation: conv, messages });
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
    try {
      const leadMirror = conv.lead_id ? store.getLeadById(conv.lead_id) : null;
      require('./services/activity').logRespuesta({
        leadId: conv.lead_id || null, conversationId: conv.id,
        vendedorId: req.session.vendedorId, vendedorNombre: req.session.nombre,
        customerName: leadMirror ? leadMirror.customer_name : (conv.customer ? conv.customer.name : null),
      });
    } catch (e) { /* feed opcional */ }
    res.json({ ok: true });
  } catch (e) {
    console.error('Error enviando por inbox:', e.message);
    res.status(502).json({ error: 'error_envio', detalle: e.message });
  }
});

app.post('/api/inbox/conversations/:id/leido', auth.requireAuth, asyncH(async (req, res) => {
  const conv = store.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  if (!assertConvAccess(req, res, conv)) return;
  const adapter = require('./db/adapter'); adapter.run('UPDATE conversations SET unread_count = 0 WHERE id = ?', [conv.id]);
  res.json({ ok: true });
}));

app.get('/api/inbox/unified-conversations', auth.requireAuth, (req, res) => {
  if (!esAccesoGlobal(req)) return res.json([]);
  const { busqueda, vendedorId, limite } = req.query;
  res.json(store.getUnifiedConversations({ busqueda, vendedorId, limite }));
});

app.post('/api/inbox/leads/:id/open', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (!esAccesoGlobal(req) && Number(lead.assigned_to_id) !== Number(req.session.vendedorId))
    return res.status(403).json({ error: 'sin_permiso' });
  const conversation = store.getOrCreateConversationForLead(lead.id);
  if (!conversation) return res.status(500).json({ error: 'error_conversion' });
  res.json({ conversation });
});

app.post('/api/inbox/conversations/:id/etiqueta', auth.requireAuth, (req, res) => {
  const { etiqueta } = req.body || {};
  const conv = store.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  if (!assertConvAccess(req, res, conv)) return;
  if (etiqueta) {
    const anterior = conv.etiqueta || 'sin_clasificar';
    store.updateConversationTag(conv.id, etiqueta);
    if (conv.lead_id) {
      try {
        const lead = store.getLeadById(conv.lead_id);
        if (lead) {
          store.setLeadEtiqueta(conv.lead_id, etiqueta);
          try {
            require('./services/activity').logEtapa({
              leadId: lead.id, customerName: lead.customer_name,
              de: anterior, a: etiqueta,
              actorId: req.session.vendedorId, actorNombre: req.session.nombre,
            });
          } catch (e) { /* feed opcional */ }
        }
      } catch (e) { }
    }
  }
  res.json({ ok: true });
});

app.post('/api/inbox/conversations/:id/notas', auth.requireAuth, (req, res) => {
  const { nota } = req.body || {};
  if (!nota || !nota.trim()) return res.status(400).json({ error: 'nota_vacia' });
  const conv = store.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  if (!assertConvAccess(req, res, conv)) return;
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
  if (!assertConvAccess(req, res, conv)) return;
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
  notify({ vendedorId: vendedor.id, tipo: 'lead_asignado', leadId: conv.lead_id || null, push: true,
    titulo: '🆕 Conversación asignada a ti', cuerpo: 'Un admin te asignó una conversación. Revísala en tu panel.' }).catch(() => {});
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
    } else if (tipo === 'audio') {
      const conv2 = await convertToM4A(buffer, mime);
      buffer = conv2.buffer; sendMime = conv2.mime; sendFilename = 'nota-voz.m4a';
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
      const mediaToken = mediaStore.signMediaToken(storedFilename);
      const publicUrl = `${req.protocol}://${req.get('host')}/api/public/media/${storedFilename}?token=${mediaToken}`;
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
app.get('/api/inbox/media/:timelineId', auth.requireAuth, asyncH(async (req, res) => {
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
}));

// Ruta pública para servir media a canales externos (Messenger, Instagram).
// Meta debe poder descargarla sin sesión, así que la protección es un token firmado
// (HMAC + expiración) atado al filename exacto, generado solo al construir la URL de envío.
app.get('/api/public/media/:filename', asyncH(async (req, res) => {
  const filename = req.params.filename;
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'filename_invalido' });
  }
  if (!mediaStore.verifyMediaToken(filename, req.query.token)) {
    return res.status(403).json({ error: 'token_invalido_o_expirado' });
  }
  const filePath = mediaStore.getMediaPath(filename);
  if (!require('fs').existsSync(filePath)) return res.status(404).json({ error: 'archivo_no_encontrado' });
  const ext = require('path').extname(filename).toLowerCase();
  const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
  const mime = mimeMap[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(filePath);
}));

// ===================== RESPONDER (OLD) =====================

// Responder a un cliente DESDE EL PANEL → se envía por el número oficial
// Firma del asesor al pie de cada mensaje saliente. Compartida entre el envío
// manual (/responder) y el scheduler de mensajes programados en servidor.
function buildMensajeConFirma(mensaje, nombreVendedor) {
  const nombre = nombreVendedor || 'Asesor';
  const compania = store.getConfig('company_name') || 'Sp Leons Group';
  const separator = '_____________________________';
  const padding = Math.floor((separator.length - nombre.length) / 2);
  const centrado = padding > 0 ? ' '.repeat(padding) : ' ';
  return `${mensaje}\n\n${separator}\n${centrado}*_${nombre}_*\n\`Asesor · ${compania}\``;
}

app.post('/api/leads/:id/responder', auth.requireAuth, messageLimiter, async (req, res) => {
  const { mensaje, replyTo } = req.body || {};
  if (!mensaje || !String(mensaje).trim()) return res.status(400).json({ error: 'mensaje_vacio' });
  if (String(mensaje).length > CFG.MAX_MESSAGE_LENGTH) return res.status(400).json({ error: 'mensaje_muy_largo' });

  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }

  // Auto-reabrir lead archivado cuando el asesor escribe
  let reopened = false;
  if (lead.status === 'cerrado') {
    store.reopenLead(lead.id);
    reopened = true;
    console.log(`[RESponder] Lead ${lead.id} reabierto automáticamente por vendedor ${req.session.vendedorId}`);
  }

  // Detectar el canal del lead: buscar la conversación asociada
  let conversation = store.getConversationByLeadId ? store.getConversationByLeadId(lead.id) : null;
  let channel = conversation ? conversation.channel : 'whatsapp';

  // Fallback: si no hay conversación vinculada, detectar por el prefijo del teléfono
  if (!conversation && lead.customer_phone) {
    if (lead.customer_phone.startsWith('messenger_')) channel = 'messenger';
    else if (lead.customer_phone.startsWith('instagram_')) channel = 'instagram';
  }
  console.log(`[RESponder] lead=${lead.id} channel=${channel} convId=${conversation ? conversation.id : 'N/A'}`);

  try {
    const fromNumber = lead.assigned_to_phone || req.session.email || 'panel';
    const replyToId = replyTo ? Number(replyTo) : null;
    const textoParaEnviar = String(mensaje);
    let smartResult = null;

    if (channel === 'whatsapp') {
      // WhatsApp: usar sendMessageSmart (ventana 24h + template auto)
      const mensajeConFirma = buildMensajeConFirma(textoParaEnviar, req.session.nombre);
      smartResult = await sendMessageSmart(lead.customer_phone, mensajeConFirma, lead.id);
      const wamid = smartResult.data && smartResult.data.messages && smartResult.data.messages[0] ? smartResult.data.messages[0].id : null;
      store.saveMessage(lead.id, fromNumber, lead.customer_phone, textoParaEnviar, 'outgoing', null, replyToId, wamid, 'sent');
    } else {
      // Messenger / Instagram: usar el adapter del canal
      const { getAdapter } = require('./channels');
      const adapter = getAdapter(channel);
      if (!adapter) throw new Error(`Canal ${channel} no configurado`);

      const channelUserId = store.getChannelUserIdForLead ? store.getChannelUserIdForLead(lead.id, channel) : null;
      console.log(`[RESPONDER] lead=${lead.id} channel=${channel}`);
      if (!channelUserId) throw new Error(`No se encontró ID de usuario para ${channel}`);

      try {
        const result = await adapter.sendMessage(channelUserId, textoParaEnviar);
        const outgoingMid = result && result.message_id ? result.message_id : null;
        console.log(`[RESPONDER] Enviado OK por ${channel} mid=${outgoingMid}`);
        store.saveMessage(lead.id, fromNumber, lead.customer_phone, textoParaEnviar, 'outgoing', null, replyToId, outgoingMid, 'sent');
      } catch (e) {
        const errDetail = e.response ? JSON.stringify(e.response.data) : e.message;
        console.error(`[RESPONDER] Error enviando por ${channel}:`, errDetail);
        throw e;
      }
    }

    store.setFirstResponse(lead.id);
    if (lead.status === 'nuevo' || lead.status === 'asignado') {
      store.updateLeadStatus(lead.id, 'contactado');
    }
    store.syncLeadToConversation(store.getLeadById(lead.id), { direction: 'outgoing', body: textoParaEnviar, fromNumber, toNumber: lead.customer_phone });
    events.emitToVendedor(lead.assigned_to_id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    events.emitToAdmins('nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    try {
      require('./services/activity').logRespuesta({
        leadId: lead.id, conversationId: conversation ? conversation.id : null,
        vendedorId: req.session.vendedorId, vendedorNombre: req.session.nombre,
        customerName: lead.customer_name,
      });
    } catch (e) { /* feed opcional */ }
    res.json({ ok: true, reopened, templateSent: smartResult ? !!smartResult.templateSent : false, queued: smartResult ? !!smartResult.queued : false });
  } catch (e) {
    console.error('Error enviando respuesta desde panel:', e.message);
    const detail = e.windowClosed ? 'window_closed_no_template' : e.message;
    res.status(502).json({ error: 'error_envio', detalle: detail });
  }
});

// Servir un archivo multimedia de un mensaje (validando propiedad del lead)
app.get('/api/media/:messageId', auth.requireAuth, asyncH(async (req, res) => {
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
}));

// Link preview: fetch OG tags from a URL
const dns = require('dns');
function esIpPrivada(ip) {
  if (!ip) return true;
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1' || ip.toLowerCase().startsWith('fe80') || ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) return true;
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(isNaN)) return ip.includes(':') ? false : true;
  return p[0] === 127 || p[0] === 10 || p[0] === 0
    || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
    || (p[0] === 192 && p[1] === 168)
    || (p[0] === 169 && p[1] === 254)
    || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}
app.post('/api/preview', auth.requireAuth, (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url_requerida' });
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return res.status(400).json({ error: 'url_invalida' });
    const puerto = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
    if (puerto !== 80 && puerto !== 443) return res.status(400).json({ error: 'url_invalida' });
    dns.lookup(parsed.hostname, { all: true }, (dnsErr, addrs) => {
      if (dnsErr || !addrs || !addrs.length || addrs.some(a => esIpPrivada(a.address))) {
        return res.status(400).json({ error: 'url_invalida' });
      }
      fetchPreview(parsed, res, url);
    });
  } catch (e) {
    res.json({ ok: true, og: { title: '', description: '', image: '', site_name: '', url } });
  }
});
function fetchPreview(parsed, res, url) {
  try {
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
}

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

  // Detectar canal
  let conversation = store.getConversationByLeadId ? store.getConversationByLeadId(lead.id) : null;
  let channel = conversation ? conversation.channel : 'whatsapp';
  if (!conversation && lead.customer_phone) {
    if (lead.customer_phone.startsWith('messenger_')) channel = 'messenger';
    else if (lead.customer_phone.startsWith('instagram_')) channel = 'instagram';
  }

  let tipo = 'document';
  if (mime.startsWith('image/')) tipo = 'image';
  else if (mime.startsWith('audio/')) tipo = 'audio';
  else if (mime.startsWith('video/')) tipo = 'video';
  if (req.body.sticker === true && mime === 'image/webp') tipo = 'sticker';

  try {
    let buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > CFG.MAX_FILE_SIZE) return res.status(413).json({ error: 'archivo_muy_grande_max_18mb' });
    const displayBody = caption || `[${tipo}]`;
    const fromNumber = lead.assigned_to_phone || req.session.email || 'panel';
    const replyToId = replyTo ? Number(replyTo) : null;
    let syncedFilename = null;

    if (channel === 'whatsapp') {
      let displayMime = mime, displayFilename = filename, sendMime = mime, sendFilename = filename;
      if (tipo === 'audio') {
        displayFilename = mediaStore.saveOutgoingMedia(buffer, mime, filename);
        const conv2 = await convertToOggOpus(buffer, mime);
        buffer = conv2.buffer; sendMime = conv2.mime; sendFilename = 'nota-voz.ogg';
        displayMime = mime;
      }
      const storedFilename = tipo === 'audio' ? displayFilename : mediaStore.saveOutgoingMedia(buffer, sendMime, sendFilename);
      syncedFilename = storedFilename;
      const mediaId = await uploadMedia(buffer, sendMime, sendFilename);
      if (!mediaId) return res.status(502).json({ error: 'error_upload', detalle: 'WhatsApp no retornó media ID' });
      await new Promise(r => setTimeout(r, CFG.MEDIA_PROPAGATION_DELAY));
      const mediaResult = await sendMedia(lead.customer_phone, mediaId, tipo, caption, sendFilename);
      if (!mediaResult || !mediaResult.messages || !mediaResult.messages[0]) {
        return res.status(502).json({ error: 'error_envio_whatsapp' });
      }
      const wamid = mediaResult.messages[0].id;
      store.saveMessage(lead.id, fromNumber, lead.customer_phone, displayBody, 'outgoing', {
        media_type: tipo, media_id: mediaId, media_mime: displayMime, media_filename: storedFilename,
      }, replyToId, wamid, 'sent');
    } else {
      // Messenger / Instagram: usar adapter
      const { getAdapter } = require('./channels');
      const adapter = getAdapter(channel);
      if (!adapter) throw new Error(`Canal ${channel} no configurado`);
      const channelUserId = store.getChannelUserIdForLead(lead.id, channel);
      if (!channelUserId) throw new Error(`No se encontró ID de usuario para ${channel}`);

      // Subir media: Messenger/Instagram aceptan URLs, no media_ids como WhatsApp.
      // Guardamos en disco y servimos vía URL pública firmada.
      let msBuffer = buffer, msMime = mime, msFilename = filename || `media-${Date.now()}`;
      if (tipo === 'audio') {
        const conv2 = await convertToM4A(buffer, mime);
        msBuffer = conv2.buffer; msMime = conv2.mime; msFilename = `audio-${Date.now()}.m4a`;
      }
      const storedFilename = mediaStore.saveOutgoingMedia(msBuffer, msMime, msFilename);
      syncedFilename = storedFilename;
      const publicUrl = `${process.env.BASE_URL || 'https://spcrm.duckdns.org'}/api/public/media/${storedFilename}?token=${mediaStore.signMediaToken(storedFilename)}`;
      await adapter.sendMedia(channelUserId, publicUrl, tipo, caption);
      store.saveMessage(lead.id, fromNumber, lead.customer_phone, displayBody, 'outgoing', {
        media_type: tipo, media_id: null, media_mime: mime, media_filename: storedFilename,
      }, replyToId, null, 'sent');
    }

    store.setFirstResponse(lead.id);
    if (lead.status === 'nuevo' || lead.status === 'asignado') store.updateLeadStatus(lead.id, 'contactado');
    store.syncLeadToConversation(store.getLeadById(lead.id), {
      direction: 'outgoing', body: displayBody, fromNumber, toNumber: lead.customer_phone,
      media: { media_type: tipo, media_id: null, media_mime: mime, media_filename: syncedFilename },
    });
    events.emitToVendedor(lead.assigned_to_id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    events.emitToAdmins('nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    res.json({ ok: true });
  } catch (e) {
    console.error('Error enviando media desde panel:', e.message);
    res.status(502).json({ error: 'error_envio', detalle: e.message });
  }
});

// Enviar ubicación a un cliente desde el panel
app.post('/api/leads/:id/send-location', auth.requireAuth, async (req, res) => {
  const { latitude, longitude, name, address } = req.body || {};
  if (latitude == null || longitude == null) return res.status(400).json({ error: 'latitude_y_longitude_requeridos' });

  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }

  try {
    const fromNumber = lead.assigned_to_phone || req.session.email || 'panel';
    const locData = { latitude: Number(latitude), longitude: Number(longitude), name: String(name || ''), address: String(address || '') };
    const locBody = JSON.stringify(locData);
    const displayBody = `📍 [Ubicación]${name ? ' ' + name : ''}${address ? ' - ' + address : ''}`;

    // Detectar canal
    let convLoc = store.getConversationByLeadId ? store.getConversationByLeadId(lead.id) : null;
    let channelLoc = convLoc ? convLoc.channel : 'whatsapp';
    if (!convLoc && lead.customer_phone) {
      if (lead.customer_phone.startsWith('messenger_')) channelLoc = 'messenger';
      else if (lead.customer_phone.startsWith('instagram_')) channelLoc = 'instagram';
    }

    if (channelLoc === 'whatsapp') {
      await sendLocation(lead.customer_phone, Number(latitude), Number(longitude), name, address);
    } else {
      // Messenger/Instagram: enviar ubicación como attachment nativo
      const { getAdapter } = require('./channels');
      const adapter = getAdapter(channelLoc);
      if (!adapter) throw new Error(`Canal ${channelLoc} no configurado`);
      const channelUserId = store.getChannelUserIdForLead(lead.id, channelLoc);
      if (!channelUserId) throw new Error(`No se encontró ID de usuario para ${channelLoc}`);
      if (typeof adapter.sendLocation === 'function') {
        await adapter.sendLocation(channelUserId, latitude, longitude);
      } else {
        await adapter.sendMessage(channelUserId, displayBody);
      }
    }
    store.saveMessage(lead.id, fromNumber, lead.customer_phone, locBody, 'outgoing', {
      media_type: 'location', media_id: null, media_mime: null, media_filename: null,
    }, null, null, 'sent');
    store.setFirstResponse(lead.id);
    if (lead.status === 'nuevo' || lead.status === 'asignado') store.updateLeadStatus(lead.id, 'contactado');
    store.syncLeadToConversation(store.getLeadById(lead.id), {
      direction: 'outgoing', body: displayBody, fromNumber, toNumber: lead.customer_phone,
      media: { media_type: 'location' },
    });
    events.emitToVendedor(lead.assigned_to_id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    events.emitToAdmins('nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    res.json({ ok: true });
  } catch (e) {
    console.error('Error enviando ubicación:', e.message);
    res.status(502).json({ error: 'error_envio', detalle: e.message });
  }
});

// ===================== MENSAJES: reacciones, editar, borrar =====================

// Reaccionar a un mensaje (toggle) — multi-canal
app.post('/api/messages/:id/react', auth.requireAuth, (req, res) => {
  const msgId = req.params.id;
  const { emoji } = req.body || {};
  if (!msgId || isNaN(Number(msgId)) || !emoji) return res.status(400).json({ error: 'id_y_emoji_requeridos' });
  const store2 = require('./db/store');
  const row = store2.getMessageById(msgId);
  if (!row) return res.status(404).json({ error: 'mensaje_no_existe' });
  const lead = store2.getLeadById(row.lead_id);
  if (req.session.rol !== 'admin' && (!lead || Number(lead.assigned_to_id) !== Number(req.session.vendedorId))) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const sender = req.session.telefono || 'self';
  const dir = row.direction === 'outgoing' ? 'outgoing' : 'incoming';
  // Toggle: si ya existe, la quita
  const existing = store2.getReactionsForMessage(msgId);
  const found = existing.find(r => r.emoji === emoji && r.sender_number === sender);
  if (found) store2.removeReaction(msgId, emoji, sender);
  else store2.addReaction(msgId, emoji, sender, dir);

  // Determinar canal del lead
  const phone = (lead && lead.customer_phone) || '';
  let channel = 'whatsapp';
  if (phone.startsWith('messenger_')) channel = 'messenger';
  else if (phone.startsWith('instagram_')) channel = 'instagram';

  // Enviar la reacción real al canal
  if (channel === 'whatsapp' && row.wamid && lead && lead.customer_phone) {
    const { sendReaction } = require('./services/whatsapp');
    sendReaction(lead.customer_phone, row.wamid, found ? '' : emoji)
      .catch(e => console.error('[REACT] Error enviando reacción a WhatsApp:', e.message));
  } else if (channel === 'messenger' && row.wamid && lead && lead.customer_phone) {
    // Para mensajes entrantes de Messenger, row.wamid contiene el mid de Facebook
    const { getAdapter } = require('./channels');
    const adapter = getAdapter('messenger');
    if (adapter && typeof adapter.sendReaction === 'function') {
      const channelUserId = store2.getChannelUserIdForLead(lead.id, 'messenger');
      if (channelUserId) {
        adapter.sendReaction(channelUserId, row.wamid, found ? '' : emoji)
          .catch(e => console.error('[REACT] Error enviando reacción a Messenger:', e.message));
      }
    }
  } else if (channel === 'instagram') {
    console.log('[REACT] Instagram: reaccion guardada en DB (API no soporta envio)');
  }

  const reactions = store2.getReactionsForMessage(msgId);
  res.json({ ok: true, reactions });
});

// Destacar/quitar destacado de un mensaje ⭐ (toggle)
app.post('/api/messages/:id/star', auth.requireAuth, (req, res) => {
  const msgId = req.params.id;
  if (!msgId || isNaN(Number(msgId))) return res.status(400).json({ error: 'id_requerido' });
  const row = store.getMessageById(msgId);
  if (!row) return res.status(404).json({ error: 'mensaje_no_existe' });
  const lead = store.getLeadById(row.lead_id);
  if (req.session.rol !== 'admin' && (!lead || Number(lead.assigned_to_id) !== Number(req.session.vendedorId))) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const starred = store.toggleStarMessage(msgId);
  res.json({ ok: true, starred });
});

// Lista de mensajes destacados del vendedor (admin: todos)
app.get('/api/mensajes/destacados', auth.requireAuth, (req, res) => {
  res.json(store.getStarredMessages(req.session.vendedorId, req.session.rol === 'admin'));
});

// Búsqueda global en el contenido de los mensajes
app.get('/api/mensajes/buscar', auth.requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.status(400).json({ error: 'minimo_3_caracteres' });
  res.json(store.searchMessages(q, req.session.vendedorId, req.session.rol === 'admin'));
});

// Reenviar un mensaje (texto o MEDIA) a otro lead — server-side.
// Media: reusa el media_id de WhatsApp (~30 días de vida); si Graph lo rechaza,
// re-sube el archivo desde disco y reintenta con el id fresco.
app.post('/api/messages/:id/forward', auth.requireAuth, messageLimiter, async (req, res) => {
  const msgId = req.params.id;
  const { toLeadId } = req.body || {};
  if (!msgId || isNaN(Number(msgId)) || !toLeadId) return res.status(400).json({ error: 'id_y_toLeadId_requeridos' });
  const row = store.getMessageById(msgId);
  if (!row) return res.status(404).json({ error: 'mensaje_no_existe' });
  const leadOrigen = store.getLeadById(row.lead_id);
  const leadDest = store.getLeadById(toLeadId);
  if (!leadDest) return res.status(404).json({ error: 'lead_destino_no_existe' });
  const esAdmin = req.session.rol === 'admin';
  const vid = Number(req.session.vendedorId);
  if (!esAdmin && ((!leadOrigen || Number(leadOrigen.assigned_to_id) !== vid) || Number(leadDest.assigned_to_id) !== vid)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  // Detectar canal del lead destino (multicanal)
  const destPhone = (leadDest && leadDest.customer_phone) || '';
  let destChannel = 'whatsapp';
  if (destPhone.startsWith('messenger_')) destChannel = 'messenger';
  else if (destPhone.startsWith('instagram_')) destChannel = 'instagram';
  try {
    const fromNumber = leadDest.assigned_to_phone || req.session.email || 'panel';
    let wamid = null;
    let media = null;
    // El body de media sin caption guarda el placeholder interno '[image]'/'[video]'/…
    // (assigner.js) — jamás debe llegarle al cliente como caption literal.
    const esPlaceholder = /^\[(image|audio|video|document|sticker|location)\]$/.test(String(row.body || '').trim());
    if (row.media_type === 'location') {
      // Las ubicaciones se guardan como JSON en body (media_id NULL): reenviar
      // como pin de WhatsApp real, no como texto con coordenadas crudas.
      let loc = null;
      try { loc = JSON.parse(row.body); } catch (e) { }
      const lat = Number(loc && loc.latitude), lng = Number(loc && loc.longitude);
      if (!loc || isNaN(lat) || isNaN(lng)) {
        return res.status(422).json({ error: 'ubicacion_invalida' });
      }
      const { getAdapter: _ga } = require('./channels');
      const destAdapter = _ga(destChannel);
      let result;
      if (destChannel === 'whatsapp') {
        result = await sendLocation(leadDest.customer_phone, lat, lng, loc.name || '', loc.address || '');
      } else if (destAdapter && typeof destAdapter.sendLocation === 'function') {
        const cuid = destPhone.replace(/^(messenger_|instagram_)/, '');
        result = await destAdapter.sendLocation(cuid, lat, lng);
      } else {
        const cuid = destPhone.replace(/^(messenger_|instagram_)/, '');
        result = await destAdapter.sendMessage(cuid, 'Ubicacion: ' + lat + ', ' + lng);
      }
      wamid = result && result.messages && result.messages[0] ? result.messages[0].id : null;
      media = { media_type: 'location', media_id: null, media_mime: null, media_filename: null };
      store.saveMessage(leadDest.id, fromNumber, leadDest.customer_phone, row.body, 'outgoing', media, null, wamid, 'sent');
    } else if (row.media_type && row.media_id) {
      const caption = !esPlaceholder && row.body ? row.body : '';
      let result;
      let mediaIdVigente = row.media_id;
      try {
        if (destChannel === 'whatsapp') {
          result = await sendMedia(leadDest.customer_phone, mediaIdVigente, row.media_type, caption);
        } else {
          const { getAdapter: _ga2 } = require('./channels');
          const da2 = _ga2(destChannel);
          const cuid2 = destPhone.replace(/^(messenger_|instagram_)/, '');
          result = await da2.sendMedia(cuid2, mediaIdVigente, row.media_type, caption);
        }
      } catch (e) {
        // media_id caducado → re-subir desde disco y reintentar
        if (!row.media_filename) throw e;
        const fp = path.join(__dirname, '..', 'data', 'media', String(row.media_filename));
        if (!fs.existsSync(fp)) throw e;
        mediaIdVigente = await uploadMedia(fs.readFileSync(fp), row.media_mime || 'application/octet-stream', row.media_filename);
        result = await sendMedia(leadDest.customer_phone, mediaIdVigente, row.media_type, caption);
      }
      wamid = result && result.messages && result.messages[0] ? result.messages[0].id : null;
      // Persistir el media_id VIGENTE (si se re-subió, el viejo está muerto)
      media = { media_type: row.media_type, media_id: mediaIdVigente, media_mime: row.media_mime, media_filename: row.media_filename };
      store.saveMessage(leadDest.id, fromNumber, leadDest.customer_phone, row.body || '', 'outgoing', media, null, wamid, 'sent');
    } else {
      const texto = '✉️ Reenviado: ' + (row.body || '');
      if (destChannel === 'whatsapp') {
        const smart = await sendMessageSmart(leadDest.customer_phone, texto, leadDest.id);
        wamid = smart.data && smart.data.messages && smart.data.messages[0] ? smart.data.messages[0].id : null;
        store.saveMessage(leadDest.id, fromNumber, leadDest.customer_phone, texto, 'outgoing', null, null, wamid, 'sent');
      } else {
        const { getAdapter: _ga3 } = require('./channels');
        const da3 = _ga3(destChannel);
        const cuid3 = destPhone.replace(/^(messenger_|instagram_)/, '');
        await da3.sendMessage(cuid3, texto);
        store.saveMessage(leadDest.id, fromNumber, leadDest.customer_phone, texto, 'outgoing', null, null, null, 'sent');
      }
    }
    store.syncLeadToConversation(store.getLeadById(leadDest.id), { direction: 'outgoing', body: row.body || `[${row.media_type}]`, fromNumber, toNumber: leadDest.customer_phone });
    events.emitToVendedor(leadDest.assigned_to_id, 'nuevo_mensaje', { leadId: leadDest.id, tipo: 'respuesta_panel', ts: Date.now() });
    events.emitToAdmins('nuevo_mensaje', { leadId: leadDest.id, tipo: 'respuesta_panel', ts: Date.now() });
    res.json({ ok: true });
  } catch (e) {
    console.error('Error reenviando mensaje:', e.message);
    res.status(502).json({ error: 'error_whatsapp', detalle: e.message });
  }
});

// Traducir un mensaje con IA (cachea en translated_body — no se paga dos veces)
app.post('/api/mensajes/:id/traducir', auth.requireAuth, async (req, res) => {
  const msgId = req.params.id;
  if (!msgId || isNaN(Number(msgId)))  return res.status(400).json({ error: 'id_requerido' });
  const row = store.getMessageById(msgId);
  if (!row || !row.body) return res.status(404).json({ error: 'mensaje_sin_texto' });
  const lead = store.getLeadById(row.lead_id);
  if (req.session.rol !== 'admin' && (!lead || Number(lead.assigned_to_id) !== Number(req.session.vendedorId))) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  // '[object Object]' = cache envenenada por un bug previo (se guardó el objeto en vez de .text) — re-traducir
  if (row.translated_body && row.translated_body !== '[object Object]') {
    return res.json({ ok: true, traduccion: row.translated_body, cache: true });
  }
  try {
    const nlp = require('./services/nlp');
    if (!nlp.isAIEnabled()) return res.status(503).json({ error: 'ia_no_configurada' });
    const lang = String((req.body || {}).a || 'español');
    const r = await nlp.chatText(
      `Eres un traductor profesional. Traduce el mensaje del usuario al ${lang} manteniendo el tono. Devuelve SOLO la traducción, sin explicaciones.`,
      row.body, 15000);
    // chatText devuelve { text, model } (no un string)
    const traduccion = typeof r === 'string' ? r : (r && r.text);
    if (!traduccion || typeof traduccion !== 'string') return res.status(502).json({ error: 'traduccion_fallida' });
    store.setTranslation(msgId, traduccion);
    res.json({ ok: true, traduccion });
  } catch (e) {
    console.error('Error traduciendo mensaje:', e.message);
    res.status(502).json({ error: 'traduccion_fallida' });
  }
});

// ===================== MENSAJES PROGRAMADOS (servidor) =====================
// Salen aunque la app esté cerrada — los envía src/services/scheduler.js

app.get('/api/programados', auth.requireAuth, (req, res) => {
  res.json(store.getScheduledByVendedor(req.session.vendedorId, req.session.rol === 'admin'));
});

// messageLimiter: sin él, programar N mensajes con sendAt inmediato saltaba el
// rate limit de envíos que /responder y /forward sí respetan.
app.post('/api/programados', auth.requireAuth, messageLimiter, (req, res) => {
  const { leadId, body, sendAt } = req.body || {};
  if (!leadId || !body || !String(body).trim() || !sendAt) return res.status(400).json({ error: 'leadId_body_sendAt_requeridos' });
  if (String(body).length > CFG.MAX_MESSAGE_LENGTH) return res.status(400).json({ error: 'mensaje_muy_largo' });
  const lead = store.getLeadById(leadId);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const fecha = new Date(sendAt);
  if (isNaN(fecha.getTime()) || fecha.getTime() < Date.now() - 60000) return res.status(400).json({ error: 'fecha_invalida_o_pasada' });
  const sendAtSQL = fecha.toISOString().slice(0, 19).replace('T', ' ');
  const id = store.createScheduled(Number(leadId), Number(req.session.vendedorId) || 0, String(body).trim(), sendAtSQL);
  res.json({ ok: true, id });
});

app.put('/api/programados/:id', auth.requireAuth, (req, res) => {
  const s = store.getScheduledById(req.params.id);
  if (!s) return res.status(404).json({ error: 'no_existe' });
  if (s.estado !== 'pendiente') return res.status(400).json({ error: 'solo_pendientes' });
  if (req.session.rol !== 'admin' && Number(s.vendedor_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const { body, sendAt } = req.body || {};
  const fields = {};
  if (body && String(body).trim()) {
    if (String(body).length > CFG.MAX_MESSAGE_LENGTH) return res.status(400).json({ error: 'mensaje_muy_largo' });
    fields.body = String(body).trim();
  }
  if (sendAt) {
    const fecha = new Date(sendAt);
    // Misma regla que el POST: editar a una fecha pasada convertiría la edición en envío inmediato
    if (isNaN(fecha.getTime()) || fecha.getTime() < Date.now() - 60000) return res.status(400).json({ error: 'fecha_invalida_o_pasada' });
    fields.send_at = fecha.toISOString().slice(0, 19).replace('T', ' ');
  }
  store.updateScheduled(s.id, fields);
  res.json({ ok: true });
});

app.delete('/api/programados/:id', auth.requireAuth, (req, res) => {
  const s = store.getScheduledById(req.params.id);
  if (!s) return res.status(404).json({ error: 'no_existe' });
  if (s.estado !== 'pendiente') return res.status(400).json({ error: 'solo_pendientes' });
  if (req.session.rol !== 'admin' && Number(s.vendedor_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.updateScheduled(s.id, { estado: 'cancelado' });
  res.json({ ok: true });
});

// ===================== CHAT INTERNO DEL EQUIPO =====================

app.get('/api/equipo/mensajes', auth.requireAuth, (req, res) => {
  // ?con=<vendedorId> → hilo directo; sin él → canal general
  const con = req.query.con ? Number(req.query.con) : null;
  const yo = req.session.rol === 'admin' ? 0 : Number(req.session.vendedorId) || 0;
  let msgs;
  if (con != null) {
    const readSenders = store.markTeamDirectRead(yo, con);
    // Notificar a los emisores que sus mensajes fueron leídos (✓✓ en tiempo real)
    if (readSenders && readSenders.length) {
      const senderIds = [...new Set(readSenders)];
      for (const senderId of senderIds) {
        events.emitToVendedor(senderId, 'equipo_read', { by: yo, con: con });
      }
    }
    msgs = store.getTeamDirectMessages(yo, con, req.query.before_id ? Number(req.query.before_id) : null, 200);
  } else {
    msgs = store.getTeamMessages(req.query.before_id ? Number(req.query.before_id) : null, 200);
  }
  // Enriquecer con reacciones
  if (Array.isArray(msgs) && msgs.length) {
    const ids = msgs.map(m => m.id).filter(Boolean);
    const reactionsMap = store.getTeamReactionsForMessages(ids);
    msgs.forEach(m => { m.reactions = reactionsMap[m.id] || []; });
  }
  res.json(msgs || []);
});

// Lista de hilos directos + contador de no leídos (para la bandeja del asesor)
app.get('/api/equipo/directos', auth.requireAuth, (req, res) => {
  const yo = req.session.rol === 'admin' ? 0 : Number(req.session.vendedorId) || 0;
  res.json({ threads: store.getTeamDirectThreads(yo), unread: store.countTeamUnread(yo) });
});

app.post('/api/equipo/mensajes', auth.requireAuth, (req, res) => {
  const { body, to, mentions, leadRef, replyTo, media_type, media_url } = req.body || {};
  if (!body && !media_type) return res.status(400).json({ error: 'body_requerido' });
  const fromId = req.session.rol === 'admin' ? 0 : Number(req.session.vendedorId) || 0;
  const nombre = req.session.rol === 'admin' ? 'Admin' : (req.session.nombre || 'Asesor');
  const toVendedorId = (to != null && to !== '') ? Number(to) : null;
  const menciones = Array.isArray(mentions) ? mentions.map(Number).filter(Boolean) : [];
  const replyToId = replyTo ? Number(replyTo) : null;
  const msg = store.saveTeamMessage(fromId, nombre, String(body || '').trim(), { toVendedorId, mentions: menciones, leadRef, replyToId, mediaType: media_type || null, mediaUrl: media_url || null });

  if (toVendedorId != null) {
    // Directo: al destinatario y a los admins (monitoreo transparente)
    events.emitToVendedor(toVendedorId, 'equipo_directo', msg);
    events.emitToVendedor(fromId, 'equipo_directo', msg);
    events.emitToAdmins('equipo_directo', msg);
    try {
      const push = require('./services/push');
      const r = push.sendToVendedor(toVendedorId, { title: `💬 ${nombre}`, body: String(body || '').slice(0, 120), tipo: 'equipo_directo', from: String(fromId) });
      r.then(ok => console.log(`[EQUIPO-PUSH] DM enviado a vendor ${toVendedorId}`)).catch(e => console.error(`[EQUIPO-PUSH] DM fallo a vendor ${toVendedorId}:`, e.message || e));
    } catch (e) { console.error('[EQUIPO-PUSH] DM setup fallo:', e.message); }
  } else {
    events.emitToTodos('equipo_mensaje', msg);
    // Push a TODO el equipo del canal general (excepto remitente y mencionados — los
    // mencionados reciben una push dedicada más abajo con título "te mencionó").
    // OJO: getVendedoresActivos() es la lista del round-robin de leads — excluye
    // 'suspendido' y a admin/supervisor/jefe. Usarla aquí dejaba a la mitad del equipo
    // (5 de 12 vendedores 'suspendido') sin notificaciones del chat interno aunque
    // tuvieran el push perfectamente configurado: el canal general es para que TODOS
    // estén al día, no solo quienes reciben leads nuevos. getVendedores() trae a todos.
    try {
      const push = require('./services/push');
      const activos = store.getVendedores();
      const mencionSet = new Set(menciones.map(Number));
      for (const v of activos) {
        if (Number(v.id) !== fromId && !mencionSet.has(Number(v.id))) {
          const label = media_type ? `📎 ${nombre}` : `🦁 ${nombre}`;
          const r = push.sendToVendedor(v.id, { title: label, body: String(body || '').slice(0, 120), tipo: 'equipo_general', from: String(fromId) });
          r.then(ok => console.log(`[EQUIPO-PUSH] general enviado a vendor ${v.id}`)).catch(e => console.error(`[EQUIPO-PUSH] general fallo a vendor ${v.id}:`, e.message || e));
        }
      }
      // Push al admin (vendedorId=0) en canal general
      const rAdmin = push.sendToVendedor(0, { title: media_type ? `📎 ${nombre}` : `🦁 ${nombre}`, body: String(body || '').slice(0, 120), tipo: 'equipo_general', from: String(fromId) });
      rAdmin.then(ok => console.log(`[EQUIPO-PUSH] general enviado a admin`)).catch(e => console.error(`[EQUIPO-PUSH] general fallo a admin:`, e.message || e));
    } catch (e) { console.error('[EQUIPO-PUSH] general setup fallo:', e.message); }
    // Push a los mencionados en el canal general (con título "te mencionó")
    if (menciones.length) {
      try {
        const push = require('./services/push');
        for (const vid of menciones) {
          if (vid !== fromId) {
            const r = push.sendToVendedor(vid, { title: `📣 ${nombre} te mencionó`, body: String(body || '').slice(0, 120), tipo: 'equipo_mencion' });
            r.then(ok => console.log(`[EQUIPO-PUSH] mencion enviado a vendor ${vid}`)).catch(e => console.error(`[EQUIPO-PUSH] mencion fallo a vendor ${vid}:`, e.message || e));
          }
        }
      } catch (e) { console.error('[EQUIPO-PUSH] mencion setup fallo:', e.message); }
    }
  }
  res.json({ ok: true, mensaje: msg });
});

// Marcar canal general como leído hasta un mensaje (para tracking en DB)
app.post('/api/equipo/general/leido', auth.requireAuth, (req, res) => {
  const yo = req.session.rol === 'admin' ? 0 : Number(req.session.vendedorId) || 0;
  const lastId = req.body && req.body.last_id ? Number(req.body.last_id) : 0;
  if (yo != null && lastId > 0) store.markTeamGeneralRead(yo, lastId);
  res.json({ ok: true });
});

// Devuelve el último id leído en canal general
app.get('/api/equipo/general/unread', auth.requireAuth, (req, res) => {
  const yo = req.session.rol === 'admin' ? 0 : Number(req.session.vendedorId) || 0;
  const lastRead = store.getTeamGeneralLastRead(yo);
  // contar no leídos desde lastRead
  const row = store.one('SELECT COUNT(*) AS n FROM team_messages WHERE to_vendedor_id IS NULL AND (deleted IS NULL OR deleted = 0) AND id > ?', [lastRead]);
  res.json({ lastRead, unread: row ? Number(row.n) : 0 });
});

// Monitoreo admin: todas las conversaciones internas (solo lectura)
app.get('/api/equipo/monitor', auth.requireAdmin, (req, res) => {
  res.json(store.getAllTeamMessagesForAdmin(req.query.limit ? Number(req.query.limit) : 200));
});

// ── Typing indicator para chat interno ──
const _equipoTyping = new Map(); // fromId -> { nombre, to, ts }
app.post('/api/equipo/typing', auth.requireAuth, (req, res) => {
  const fromId = req.session.rol === 'admin' ? 0 : Number(req.session.vendedorId) || 0;
  const nombre = req.session.rol === 'admin' ? 'Admin' : (req.session.nombre || 'Asesor');
  const to = req.body && req.body.to != null ? Number(req.body.to) : null;
  _equipoTyping.set(fromId, { nombre, to, ts: Date.now() });
  const payload = { from_id: fromId, from_nombre: nombre, to };
  if (to != null) {
    events.emitToVendedor(to, 'equipo_typing', payload);
    events.emitToVendedor(fromId, 'equipo_typing', payload);
    events.emitToAdmins('equipo_typing', payload);
  } else {
    events.emitToTodos('equipo_typing', payload);
  }
  res.json({ ok: true });
});

// Admin: lista de conversaciones del chat interno para inbox
app.get('/api/equipo/admin/conversations', auth.requireAdmin, (req, res) => {
  const convs = store.getAdminTeamConversations();
  res.json(convs);
});

// Admin: mensajes de cualquier conversación interna
app.get('/api/equipo/admin/messages', auth.requireAdmin, (req, res) => {
  const type = req.query.type || 'general';
  const withId = req.query.with ? Number(req.query.with) : null;
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  if (type === 'dm' && withId != null) {
    return res.json(store.getTeamDirectMessages(0, withId, limit));
  }
  res.json(store.getTeamMessages(null, limit));
});

// ── Reacciones del chat interno ──
app.post('/api/equipo/messages/:id/react', auth.requireAuth, (req, res) => {
  const msgId = Number(req.params.id);
  const { emoji } = req.body || {};
  if (!msgId || !emoji) return res.status(400).json({ error: 'id_y_emoji_requeridos' });
  const fromId = req.session.rol === 'admin' ? 0 : Number(req.session.vendedorId) || 0;
  // Verificar que el mensaje existe
  const msg = store.one ? store.one('SELECT * FROM team_messages WHERE id = ?', [msgId]) : null;
  if (!msg) return res.status(404).json({ error: 'mensaje_no_existe' });
  // Toggle reacción
  const existing = store.getTeamReactionsForMessages([msgId])[msgId] || [];
  const found = existing.find(r => r.emoji === emoji && r.from_vendedor_id === fromId);
  if (found) store.removeTeamReaction(msgId, emoji, fromId);
  else store.saveTeamReaction(msgId, emoji, fromId);
  const reactions = store.getTeamReactionsForMessages([msgId])[msgId] || [];
  // Emitir a todos
  const payload = { messageId: msgId, reactions, from_id: fromId, emoji, action: found ? 'remove' : 'add' };
  events.emitToTodos('equipo_reaction', payload);
  res.json({ ok: true, reactions });
});

// ── Borrar mensaje del chat interno ──
app.post('/api/equipo/messages/:id/delete', auth.requireAuth, (req, res) => {
  const msgId = Number(req.params.id);
  const { mode } = req.body || {};
  if (!msgId || !mode || !['me', 'everyone'].includes(mode)) return res.status(400).json({ error: 'id_y_mode_requeridos' });
  const fromId = req.session.rol === 'admin' ? 0 : Number(req.session.vendedorId) || 0;
  const nombre = req.session.rol === 'admin' ? 'Admin' : (req.session.nombre || 'Asesor');
  const msg = store.one ? store.one('SELECT * FROM team_messages WHERE id = ?', [msgId]) : null;
  if (!msg) return res.status(404).json({ error: 'mensaje_no_existe' });
  if (mode === 'everyone' && Number(msg.from_vendedor_id) !== fromId && req.session.rol !== 'admin') {
    return res.status(403).json({ error: 'solo_puedes_borrar_tus_mensajes' });
  }
  if (mode === 'everyone') {
    store.deleteTeamMessage(msgId, nombre, 'everyone');
    events.emitToTodos('equipo_message_deleted', { messageId: msgId, by: nombre });
  }
  res.json({ ok: true, mode });
});

// ── Fijar/desfijar mensaje del chat interno ──
app.post('/api/equipo/messages/:id/pin', auth.requireAuth, (req, res) => {
  const msgId = Number(req.params.id);
  if (!msgId) return res.status(400).json({ error: 'id_requerido' });
  const fromId = req.session.rol === 'admin' ? 0 : Number(req.session.vendedorId) || 0;
  const result = store.pinTeamMessage(msgId, fromId);
  if (!result) return res.status(404).json({ error: 'mensaje_no_existe' });
  events.emitToTodos('equipo_message_pinned', { messageId: msgId, pinned: result.pinned, by: fromId });
  res.json({ ok: true, pinned: result.pinned });
});

// Mensaje fijado de un canal
app.get('/api/equipo/pinned', auth.requireAuth, (req, res) => {
  const channel = req.query.channel || 'general';
  const msg = store.getPinnedTeamMessage(channel);
  res.json(msg || null);
});

// ── Editar mensaje del equipo ──
app.put('/api/equipo/messages/:id', auth.requireAuth, (req, res) => {
  const msgId = Number(req.params.id);
  const { body: newBody } = req.body || {};
  if (!msgId || !newBody || !String(newBody).trim()) return res.status(400).json({ error: 'id_y_body_requeridos' });
  const fromId = req.session.rol === 'admin' ? 0 : Number(req.session.vendedorId) || 0;
  const updated = store.editTeamMessage(msgId, fromId, String(newBody).trim());
  if (!updated) return res.status(404).json({ error: 'mensaje_no_existe_o_sin_permiso' });
  events.emitToTodos('equipo_message_edited', { messageId: msgId, body: updated.body, edited_at: updated.edited_at });
  res.json({ ok: true, message: updated });
});

// ── Buscar mensajes del equipo ──
app.get('/api/equipo/search', auth.requireAuth, (req, res) => {
  const q = req.query.q || '';
  const channel = req.query.channel || null;
  const results = store.searchTeamMessages(q, 0, channel);
  res.json(results || []);
});

// ── Reenviar mensaje del equipo ──
app.post('/api/equipo/messages/:id/forward', auth.requireAuth, (req, res) => {
  const msgId = Number(req.params.id);
  const { to } = req.body || {};
  if (!msgId) return res.status(400).json({ error: 'id_requerido' });
  const fromId = req.session.rol === 'admin' ? 0 : Number(req.session.vendedorId) || 0;
  const nombre = req.session.rol === 'admin' ? 'Admin' : (req.session.nombre || 'Asesor');
  const toVendedorId = (to != null && to !== '') ? Number(to) : null;
  const newMsg = store.forwardTeamMessage(msgId, toVendedorId, fromId, nombre);
  if (!newMsg) return res.status(404).json({ error: 'mensaje_no_existe' });
  if (toVendedorId != null) {
    events.emitToVendedor(toVendedorId, 'equipo_directo', newMsg);
    events.emitToVendedor(fromId, 'equipo_directo', newMsg);
    events.emitToAdmins('equipo_directo', newMsg);
  } else {
    events.emitToTodos('equipo_mensaje', newMsg);
  }
  res.json({ ok: true, mensaje: newMsg });
});

// ── Presencia de asesores ──
app.post('/api/equipo/presence', auth.requireAuth, (req, res) => {
  const fromId = req.session.rol === 'admin' ? 0 : Number(req.session.vendedorId) || 0;
  store.updatePresence(fromId);
  const events = require('./services/events');
  events.emitToTodos('equipo_presence', { vendedor_id: fromId, online: true, last_seen: new Date().toISOString() });
  res.json({ ok: true });
});

app.get('/api/equipo/presence', auth.requireAuth, (req, res) => {
  res.json(store.getPresenceMap());
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

// ===================== CITAS ===================== (Fase 4: extraído a src/routes/citas.js)
app.use('/api/citas', auth.requireAuth, require('./routes/citas'));

// ===================== PROPIEDADES ===================== (Fase 4: extraído a
// src/routes/propiedades.js, incluye POST /recomendar)
app.use('/api/propiedades', require('./routes/propiedades'));

// ===================== GALERIA DE MARCA ===================== (Fase 4: extraído a
// src/routes/galeria.js, incluido GALERIA_PATH/ensureDir/uploadGaleria)
app.use('/api/galeria', require('./routes/galeria'));

// ===================== PROYECTOS / LOTES =====================
function emitLote(proyectoId, loteId, tipo) {
  events.emitToAdmins('lote_actualizado', { proyectoId: Number(proyectoId), loteId: loteId ? Number(loteId) : null, tipo: tipo || 'update', ts: Date.now() });
}

app.get('/api/proyectos', auth.requireAuth, (req, res) => {
  res.json(store.getProyectos());
});
app.get('/api/proyectos/:id', auth.requireAuth, (req, res) => {
  const p = store.getProyectoById(req.params.id);
  if (!p) return res.status(404).json({ error: 'no_existe' });
  res.json(p);
});
app.get('/api/proyectos/:id/stats', auth.requireAuth, (req, res) => {
  if (!store.getProyectoById(req.params.id)) return res.status(404).json({ error: 'no_existe' });
  res.json(store.getProyectoStats(req.params.id));
});
app.get('/api/proyectos/:id/lotes', auth.requireAuth, (req, res) => {
  if (!store.getProyectoById(req.params.id)) return res.status(404).json({ error: 'no_existe' });
  res.json(store.getLotesByProyecto(req.params.id));
});

// ===================== CATÁLOGO PÚBLICO (sin sesión) =====================
// Para compartir el inventario con clientes por link (WhatsApp), sin exponer
// datos internos. Solo lectura, saneado en el store, con rate-limit propio.
const WA_PUBLIC_NUMBER = (process.env.WHATSAPP_PUBLIC_NUMBER || '573214625618').replace(/\D/g, '');
app.get('/api/publico/config', catalogoLimiter, (req, res) => {
  res.json({ whatsapp: WA_PUBLIC_NUMBER, empresa: 'Leons Group' });
});
app.get('/api/publico/proyectos', catalogoLimiter, (req, res) => {
  res.json(store.getProyectosPublicos());
});
app.get('/api/publico/proyecto/:id', catalogoLimiter, (req, res) => {
  const p = store.getProyectoPublicoById(req.params.id);
  if (!p) return res.status(404).json({ error: 'no_existe' });
  res.json(p);
});
// Servir fotos de catálogo (públicas y permanentes) — solo archivos con prefijo cat_,
// nunca los medios privados de los chats.
app.get('/api/publico/foto/:filename', catalogoLimiter, (req, res) => {
  const filename = req.params.filename;
  if (!mediaStore.isCatalogFile(filename)) return res.status(404).end();
  const filePath = mediaStore.getMediaPath(filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});
// Subir la foto principal de un proyecto (admin). Guarda en data/media con prefijo
// cat_ y deja imagen_url apuntando a la ruta pública same-origin.
app.post('/api/proyectos/:id/foto', auth.requireAdmin, (req, res) => {
  const proyecto = store.getProyectoById(req.params.id);
  if (!proyecto) return res.status(404).json({ error: 'no_existe' });
  const { dataBase64, mime } = req.body || {};
  if (!dataBase64) return res.status(400).json({ error: 'sin_imagen' });
  if (!/^image\//.test(mime || '')) return res.status(400).json({ error: 'tipo_invalido' });
  let buffer;
  try { buffer = Buffer.from(dataBase64, 'base64'); } catch (e) { return res.status(400).json({ error: 'base64_invalido' }); }
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'tamano_invalido' });
  const filename = mediaStore.saveCatalogMedia(buffer, mime, null);
  const url = `/api/publico/foto/${filename}`;
  store.updateProyecto(proyecto.id, { imagen_url: url });
  res.json({ ok: true, imagen_url: url });
});
// Landing de un proyecto con OG tags dinámicos → al pegar el link en WhatsApp
// sale tarjeta con foto + nombre + precio. Sirve el mismo catálogo con <head> inyectado.
app.get('/catalogo/p/:id', catalogoLimiter, (req, res) => {
  let html;
  try { html = fs.readFileSync(path.join(__dirname, '..', 'public', 'catalogo', 'index.html'), 'utf8'); }
  catch (e) { return res.redirect('/catalogo/'); }
  const p = store.getProyectoPublicoById(req.params.id);
  if (p) {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const base = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`;
    const loc = [p.ciudad, p.departamento].filter(Boolean).join(', ') || 'Colombia';
    let og = `\n<meta property="og:type" content="website">
<meta property="og:title" content="${esc(p.nombre)} · Leons Group">
<meta property="og:description" content="${esc('Lotes disponibles en ' + loc + '. Inversión en tierra a nivel nacional.')}">
<meta property="og:url" content="${base}/catalogo/p/${p.id}">`;
    if (p.imagen_url) {
      const img = /^https?:\/\//.test(p.imagen_url) ? p.imagen_url : base + p.imagen_url;
      og += `\n<meta property="og:image" content="${esc(img)}">\n<meta name="twitter:card" content="summary_large_image">`;
    }
    og += `\n<script>window.__CATALOG_PID=${Number(p.id)};</script>`;
    html = html.replace('</head>', og + '\n</head>');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});
app.post('/api/proyectos', auth.requireAdmin, (req, res) => {
  const d = req.body || {};
  if (!d.nombre) return res.status(400).json({ error: 'nombre_requerido' });
  const p = store.createProyecto(d);
  res.json({ ok: true, proyecto: p });
});
app.put('/api/proyectos/:id', auth.requireAdmin, (req, res) => {
  const p = store.updateProyecto(req.params.id, req.body || {});
  if (!p) return res.status(404).json({ error: 'no_existe' });
  res.json({ ok: true, proyecto: p });
});
app.delete('/api/proyectos/:id', auth.requireAdmin, (req, res) => {
  if (!store.getProyectoById(req.params.id)) return res.status(404).json({ error: 'no_existe' });
  store.deleteProyecto(req.params.id);
  res.json({ ok: true });
});
// Volcado masivo de lotes (trazado del plano)
app.post('/api/proyectos/:id/lotes/bulk', auth.requireAdmin, (req, res) => {
  if (!store.getProyectoById(req.params.id)) return res.status(404).json({ error: 'no_existe' });
  const lotes = Array.isArray(req.body && req.body.lotes) ? req.body.lotes : [];
  const n = store.bulkCreateLotes(req.params.id, lotes);
  emitLote(req.params.id, null, 'bulk');
  res.json({ ok: true, creados: n });
});

// ===================== ZONAS (asignación de leads por zona geográfica) =====================
// Un municipio/región con uno o varios asesores asignados (vendedores.zonas, CSV de
// slugs). Las reglas mapean el anuncio de Meta que trajo el lead (ad_id/ad_name/
// source_url) a una zona; la resolución y elección de asesor viven en services/zonas.js.
app.get('/api/zonas', auth.requireAuth, (req, res) => res.json(store.getZonas()));

app.post('/api/zonas', auth.requireAdmin, (req, res) => {
  const { nombre } = req.body || {};
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'nombre_requerido' });
  const z = store.createZona(nombre);
  if (!z) return res.status(400).json({ error: 'nombre_invalido' });
  res.json({ ok: true, zona: z });
});

app.put('/api/zonas/:id', auth.requireAdmin, (req, res) => {
  const z = store.updateZona(req.params.id, req.body || {});
  if (!z) return res.status(404).json({ error: 'no_existe' });
  res.json({ ok: true, zona: z });
});

app.delete('/api/zonas/:id', auth.requireAdmin, (req, res) => {
  const r = store.deleteZona(req.params.id);
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok: true });
});

app.get('/api/zonas/:id/reglas', auth.requireAdmin, (req, res) => res.json(store.getReglasByZona(req.params.id)));

app.post('/api/zonas/:id/reglas', auth.requireAdmin, (req, res) => {
  const regla = store.addZonaRegla(req.params.id, req.body || {});
  if (!regla) return res.status(400).json({ error: 'regla_invalida' });
  require('./services/zonas').invalidateReglasCache();
  res.json({ ok: true, regla });
});

app.delete('/api/zonas/reglas/:reglaId', auth.requireAdmin, (req, res) => {
  store.deleteZonaRegla(req.params.reglaId);
  require('./services/zonas').invalidateReglasCache();
  res.json({ ok: true });
});

// Anuncios que ya trajeron leads — para que el admin los mapee a una zona sin adivinar
// el nombre exacto de la campaña.
app.get('/api/zonas/anuncios-detectados', auth.requireAdmin, (req, res) => res.json(store.getAnunciosDetectados()));

app.post('/api/vendedores/:id/zonas', auth.requireAdmin, (req, res) => {
  const { zonas } = req.body || {};
  if (!Array.isArray(zonas)) return res.status(400).json({ error: 'zonas_debe_ser_array' });
  const v = store.getVendedorById(req.params.id);
  if (!v) return res.status(404).json({ error: 'vendedor_no_existe' });
  store.setVendedorZonas(req.params.id, zonas);
  res.json({ ok: true });
});

// Corrección manual de la zona de un lead — un asesor puede corregir la de sus propios
// leads; el admin, la de cualquiera. `reasignar` reenruta de inmediato al asesor que
// cubra la nueva zona (si nadie la cubre, no mueve el lead, solo etiqueta zona_fuente).
app.post('/api/leads/:id/zona', auth.requireAuth, (req, res) => {
  const { zona, reasignar } = req.body || {};
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const zonaRecord = zona ? store.getZonaBySlug(String(zona)) : null;
  if (zona && !zonaRecord) return res.status(400).json({ error: 'zona_no_existe' });
  store.setLeadZona(lead.id, zonaRecord ? zonaRecord.slug : null, 'manual', zonaRecord ? zonaRecord.nombre : null);
  if (reasignar && zonaRecord) {
    const activos = store.getVendedoresActivos();
    const { elegirVendedor } = require('./services/zonas');
    const { vendedor: elegido, fuente } = elegirVendedor(activos, { zona: zonaRecord.slug });
    if (elegido) {
      store.reassignLead(lead.id, elegido, lead.assigned_to_id);
      if (fuente === 'fallback') store.setLeadZonaFuente(lead.id, 'fallback');
    }
  }
  res.json({ ok: true, lead: store.getLeadById(lead.id) });
});

app.get('/api/lotes/:id', auth.requireAuth, (req, res) => {
  const l = store.getLoteById(req.params.id);
  if (!l) return res.status(404).json({ error: 'no_existe' });
  res.json({ lote: l, historial: store.getLoteHistorial(l.id) });
});
app.post('/api/proyectos/:id/lotes', auth.requireAdmin, (req, res) => {
  if (!store.getProyectoById(req.params.id)) return res.status(404).json({ error: 'no_existe' });
  const l = store.createLote(req.params.id, req.body || {});
  emitLote(req.params.id, l && l.id, 'create');
  res.json({ ok: true, lote: l });
});
app.put('/api/lotes/:id', auth.requireAdmin, (req, res) => {
  const l = store.updateLote(req.params.id, req.body || {});
  if (!l) return res.status(404).json({ error: 'no_existe' });
  emitLote(l.proyecto_id, l.id, 'update');
  res.json({ ok: true, lote: l });
});
app.post('/api/lotes/:id/estado', auth.requireAdmin, (req, res) => {
  const { estado, cliente_id, asesor_id } = req.body || {};
  const estados = ['disponible','separado','vendido','reservado','bloqueado','negociacion'];
  if (!estados.includes(estado)) return res.status(400).json({ error: 'estado_invalido' });
  const l = store.updateLoteEstado(req.params.id, estado, { cliente_id, asesor_id, autor: req.session.nombre || '' });
  if (!l) return res.status(404).json({ error: 'no_existe' });
  emitLote(l.proyecto_id, l.id, 'estado');
  res.json({ ok: true, lote: l });
});
app.post('/api/lotes/:id/precio', auth.requireAdmin, (req, res) => {
  const l = store.setLotePrecio(req.params.id, Number(req.body && req.body.precio) || 0, req.session.nombre || '');
  if (!l) return res.status(404).json({ error: 'no_existe' });
  emitLote(l.proyecto_id, l.id, 'precio');
  res.json({ ok: true, lote: l });
});
app.post('/api/lotes/:id/observacion', auth.requireAdmin, (req, res) => {
  const l = store.setLoteObservacion(req.params.id, (req.body && req.body.texto) || '', req.session.nombre || '');
  if (!l) return res.status(404).json({ error: 'no_existe' });
  emitLote(l.proyecto_id, l.id, 'observacion');
  res.json({ ok: true, lote: l });
});
// Documentos y fotografías: recibe { item } (URL o data URL ya subido por el cliente)
app.post('/api/lotes/:id/documentos', auth.requireAdmin, (req, res) => {
  const l = store.addLoteMedia(req.params.id, 'documentos', (req.body && req.body.item) || '');
  if (!l) return res.status(404).json({ error: 'no_existe' });
  emitLote(l.proyecto_id, l.id, 'documentos');
  res.json({ ok: true, lote: l });
});
app.post('/api/lotes/:id/fotos', auth.requireAdmin, (req, res) => {
  const l = store.addLoteMedia(req.params.id, 'fotografias', (req.body && req.body.item) || '');
  if (!l) return res.status(404).json({ error: 'no_existe' });
  emitLote(l.proyecto_id, l.id, 'fotos');
  res.json({ ok: true, lote: l });
});
app.delete('/api/lotes/:id', auth.requireAdmin, (req, res) => {
  const l = store.getLoteById(req.params.id);
  if (!l) return res.status(404).json({ error: 'no_existe' });
  store.deleteLote(req.params.id);
  emitLote(l.proyecto_id, null, 'delete');
  res.json({ ok: true });
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
  if (!esAccesoGlobal(req) && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const adapter = require('./db/adapter');
  adapter.run("UPDATE leads SET status = ?, updated_at = created_at WHERE id = ?", ['cerrado', lead.id]);
  // conversation:closed solo se emitía desde el router multicanal — el cierre de un
  // lead de WhatsApp (el canal dominante) nunca lo disparaba.
  try { require('./services/assigner').triggerWorkflow('conversation:closed', lead.id, ''); } catch (e) { /* workflow opcional */ }
  res.json({ ok: true });
});

// Enviar encuesta de satisfacción (CSAT, F3.2). El asesor la dispara (ej. tras cerrar
// una venta); la respuesta 1-5 la captura el webhook. No se auto-envía en cada archivado.
app.post('/api/leads/:id/encuesta', auth.requireAuth, async (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const { sendMessageSmart } = require('./services/whatsapp');
  const texto = 'Nos encantaría conocer tu opinión 🙏\n¿Cómo calificas la atención de tu asesor en Leons Group? Responde con un número del *1 al 5* (5 = excelente).';
  try {
    await sendMessageSmart(lead.customer_phone, texto, lead.id);
    store.setAwaitingCsat(lead.id, 1);
    res.json({ ok: true });
  } catch (e) {
    console.error('[CSAT] enviar encuesta:', e.message);
    res.status(500).json({ error: 'no_enviado' });
  }
});

// Inscribir / detener la cadencia de seguimiento de un lead (F3.3).
app.post('/api/leads/:id/cadencia', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const activar = !(req.body && req.body.activar === false);
  if (activar) {
    const ok = store.enrollCadencia(lead.id);
    if (!ok) return res.status(400).json({ error: 'sin_pasos_configurados' });
    return res.json({ ok: true, cadencia_activa: 1 });
  }
  store.stopCadencia(lead.id);
  res.json({ ok: true, cadencia_activa: 0 });
});

// Ver / editar los pasos de la cadencia (admin edita, cualquiera puede ver).
app.get('/api/cadencia/pasos', auth.requireAuth, (req, res) => {
  res.json(store.getCadenciaPasos());
});
app.post('/api/cadencia/pasos', auth.requireAdmin, (req, res) => {
  const pasos = Array.isArray(req.body && req.body.pasos) ? req.body.pasos : [];
  res.json({ ok: true, pasos: store.setCadenciaPasos(pasos) });
});
// Interruptor de auto-inscripción (opt-in, apagado por defecto).
app.get('/api/cadencia/config', auth.requireAuth, (req, res) => {
  res.json({ auto: store.getConfig('cadencia_auto') === '1' });
});
app.post('/api/cadencia/config', auth.requireAdmin, (req, res) => {
  store.setConfig('cadencia_auto', (req.body && req.body.auto) ? '1' : '0');
  res.json({ ok: true, auto: (req.body && req.body.auto) ? true : false });
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
  const anterior = lead.etiqueta || 'sin_clasificar';
  store.setLeadEtiqueta(lead.id, etiqueta);
  events.emitToAdmins('lead_actualizado', { leadId: lead.id, etiqueta, ts: Date.now() });
  try {
    require('./services/activity').logEtapa({
      leadId: lead.id, customerName: lead.customer_name,
      de: anterior, a: etiqueta,
      actorId: req.session.vendedorId, actorNombre: req.session.nombre,
    });
  } catch (e) { /* feed opcional */ }
  // Dispara automatizaciones con trigger 'lead:tag_changed' (p. ej. mover a "cita" → notificar admin)
  try {
    const conversation = store.getOrCreateConversationForLead(lead.id);
    if (conversation) {
      require('./services/workflow').evaluate('lead:tag_changed', { conversation, customer: conversation.customer_id ? store.getCustomerById(conversation.customer_id) : null })
        .catch(e => console.error('WorkflowEngine.evaluate error:', e.message));
    }
  } catch (e) { /* workflow engine opcional */ }
  // Conversions API (B3): avisa a Meta del lado del servidor cuando el lead llega a una
  // etapa que de verdad importa para optimizar la campaña (agendó cita, compró). No
  // bloquea la respuesta — es tracking, no algo de lo que el vendedor deba esperar.
  // markCapiEventSent es atómico (WHERE ... IS NULL): garantiza que el evento se manda
  // como máximo una vez por lead aunque lo muevan de etapa varias veces.
  if ((etiqueta === 'cita' || etiqueta === 'vendido') && store.markCapiEventSent(lead.id, etiqueta)) {
    require('./services/meta-ads').sendConversionEvent(etiqueta, lead)
      .catch(e => console.error('[META-CAPI] fallo inesperado:', e.message));
  }
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

// Indicador "escribiendo…" en el WhatsApp/Messenger del cliente (también marca leído)
app.post('/api/leads/:id/typing', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  // Determinar canal del lead
  const phone = lead.customer_phone || '';
  let channel = 'whatsapp';
  if (phone.startsWith('messenger_')) channel = 'messenger';
  else if (phone.startsWith('instagram_')) channel = 'instagram';

  const { getAdapter } = require('./channels');
  const adapter = getAdapter(channel);

  if (channel === 'whatsapp') {
    const adapter2 = require('./db/adapter');
    const last = adapter2.one("SELECT wamid FROM messages WHERE lead_id = ? AND direction = 'incoming' AND wamid IS NOT NULL ORDER BY id DESC LIMIT 1", [lead.id]);
    if (last && last.wamid) {
      const { sendTyping } = require('./services/whatsapp');
      sendTyping(last.wamid).catch(e => console.error('[TYPING]', e.message));
    }
  } else if (adapter && typeof adapter.sendTyping === 'function') {
    // Messenger/Instagram: usar sender action con el PSID del customer
    const psid = phone.replace(/^(messenger_|instagram_)/, '');
    if (psid) {
      adapter.sendTyping(psid).catch(e => console.error('[TYPING]', channel, e.message));
    }
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

// ===================== UBICACIONES GUARDADAS ===================== (Fase 4: extraído
// a src/routes/ubicaciones-guardadas.js)
app.use('/api/ubicaciones-guardadas', auth.requireAuth, require('./routes/ubicaciones-guardadas'));

// ═══════════════════ UBICACIÓN DE ASESORES (rastreo de jornada) ═══════════════════
//
// El asesor comparte su posición mientras trabaja con la app abierta; admin y jefe la
// ven en el mapa. Dos reglas que no se negocian y por eso viven en el servidor:
//   1. Sin consentimiento sellado en BD, no se guarda ni un punto.
//   2. El histórico se purga a los 30 días (job de limpieza más abajo).

// Máximo un punto cada 20s por sesión: un cliente en bucle no puede inundar la tabla.
const ubicacionLimiter = rateLimit({
  windowMs: 20 * 1000, max: 2, standardHeaders: true, legacyHeaders: false,
  message: { error: 'demasiadas_posiciones' },
});

// El asesor acepta el aviso de rastreo. Devuelve la fecha del sello para que la UI
// pueda mostrar desde cuándo comparte.
app.post('/api/me/consentimiento-ubicacion', auth.requireAuth, (req, res) => {
  if (!req.session.vendedorId) return res.status(400).json({ error: 'sin_vendedor_asociado' });
  const r = store.setConsentimientoUbicacion(req.session.vendedorId);
  console.log(`[UBICACION] Consentimiento aceptado por vendedor ${req.session.vendedorId} (${req.session.nombre || '—'})`);
  res.json({ ok: true, desde: r ? r.ubicacion_consentida_at : null });
});

// Retirar el consentimiento borra también el rastro guardado.
app.delete('/api/me/consentimiento-ubicacion', auth.requireAuth, (req, res) => {
  if (!req.session.vendedorId) return res.status(400).json({ error: 'sin_vendedor_asociado' });
  store.revocarConsentimientoUbicacion(req.session.vendedorId);
  console.log(`[UBICACION] Consentimiento revocado por vendedor ${req.session.vendedorId}`);
  res.json({ ok: true });
});

app.get('/api/me/consentimiento-ubicacion', auth.requireAuth, (req, res) => {
  if (!req.session.vendedorId) return res.json({ consentido: false });
  res.json({ consentido: store.tieneConsentimientoUbicacion(req.session.vendedorId) });
});

app.post('/api/mi-ubicacion', auth.requireAuth, ubicacionLimiter, (req, res) => {
  if (!req.session.vendedorId) return res.status(400).json({ error: 'sin_vendedor_asociado' });
  const { lat, lng, precision, bateria } = req.body || {};
  const latN = Number(lat), lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN) || Math.abs(latN) > 90 || Math.abs(lngN) > 180) {
    return res.status(400).json({ error: 'coordenadas_invalidas' });
  }
  const r = store.guardarPosicionVendedor(req.session.vendedorId, { lat: latN, lng: lngN, precision, bateria });
  if (!r.ok) return res.status(403).json({ error: r.error });

  // El mapa del admin/jefe se mueve solo: sin esto habría que recargar la página.
  events.emitToAdmins('ubicacion_asesor', {
    vendedorId: req.session.vendedorId, nombre: req.session.nombre || '',
    lat: latN, lng: lngN, precision: precision != null ? Number(precision) : null,
    bateria: bateria != null ? Number(bateria) : null, ts: Date.now(),
  });
  res.json({ ok: true });
});

// Mapa del equipo: última posición conocida de cada asesor + su carga de trabajo.
app.get('/api/mapa/asesores', auth.requireSupervisorOrAdmin, (req, res) => {
  const presencia = store.getPresenceMap();
  const asesores = store.getUltimasPosiciones().map(v => {
    const m = store.getVendedorMetricas(v.id) || {};
    const p = presencia[v.id] || {};
    return {
      id: v.id, nombre: v.nombre, telefono: v.telefono, estado: v.estado, foto: v.foto || null,
      lat: v.last_lat, lng: v.last_lng, ts: v.last_pos_at,
      online: !!p.online,
      leadsActivos: m.leadsActivos, leadsHoy: m.leadsHoy, tasaRespuesta: m.tasaRespuesta,
      ultimaActividad: m.ultimaActividad,
    };
  });
  res.json({ asesores, generadoEn: new Date().toISOString() });
});

// Rastro de un asesor en un día concreto, para dibujar su recorrido. Sin ?fecha se asume
// HOY en el calendario de Bogotá — no el día UTC, que desde las 19:00 hora local ya es el
// siguiente y devolvería un recorrido vacío en plena jornada.
app.get('/api/mapa/asesores/:id/recorrido', auth.requireSupervisorOrAdmin, (req, res) => {
  const fecha = String(req.query.fecha || '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? req.query.fecha
    : hoyBogota();
  res.json({ fecha, puntos: store.getRecorridoVendedor(req.params.id, fecha) });
});

// ── Capas del mapa: clientes, proyectos y zonas ──
// Los clientes se pintan con la ubicación que compartieron por WhatsApp si la hay, y si
// no con la geocodificación de su ciudad (services/geocode.js). Un lead sin ninguna de
// las dos NO aparece: mejor ausente que en el sitio equivocado.
//
// requireAuth, no requireSupervisorOrAdmin: el asesor necesita ver SUS clientes en su
// propio mapa. El aislamiento se hace aquí abajo, no en el middleware.
app.get('/api/mapa/leads', auth.requireAuth, (req, res) => {
  const { etiqueta, cerca, radio, limit } = req.query;
  const esMando = auth.esAccesoGlobal(req);

  // Regla de aislamiento: solo admin/supervisor/jefe pueden pedir los leads de otro. Al
  // asesor se le IGNORA el parámetro y se le fuerza el suyo — pasar ?vendedorId=<otro>
  // no puede ser una forma de leer la cartera del compañero.
  let filtroVendedor;
  if (esMando) {
    filtroVendedor = req.query.vendedorId || null;
  } else {
    if (!req.session.vendedorId) return res.json({ leads: [], total: 0 });
    filtroVendedor = req.session.vendedorId;
  }

  // ?cerca=lat,lng&radio=km → los más próximos a un punto, ordenados por distancia.
  // El prefiltro por caja se resuelve en SQL (con índice); el círculo exacto, en JS con
  // Haversine. La caja siempre contiene al círculo, así que el filtro fino no pierde
  // nada. No se usa trigonometría en SQL a propósito: las funciones matemáticas de
  // SQLite son opcionales en compilación y aquí conviven better-sqlite3 y sql.js.
  let punto = null;
  const radioKm = Number(radio) > 0 ? Number(radio) : 5;
  if (cerca) {
    const [la, ln] = String(cerca).split(',').map(Number);
    if (Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180) {
      punto = { lat: la, lng: ln };
    }
  }

  let leads = store.getLeadsConCoordenadas({
    etiqueta, vendedorId: filtroVendedor,
    caja: punto ? cajaAlrededor(punto, radioKm) : null,
  });

  if (punto) {
    const { distanciaMetros } = require('./services/geocode');
    const radioM = radioKm * 1000;
    leads = leads
      .map(l => ({ ...l, distancia_m: distanciaMetros(punto, { lat: l.lat, lng: l.lng }) }))
      .filter(l => l.distancia_m <= radioM)
      .sort((a, b) => a.distancia_m - b.distancia_m);
  }

  // Tope duro: un `limit` desmedido no puede convertir esto en una descarga de toda la BD.
  const tope = Math.min(Number(limit) > 0 ? Number(limit) : 500, 1000);
  res.json({ leads: leads.slice(0, tope), total: leads.length, truncado: leads.length > tope });
});

// Caja geográfica que contiene un círculo de `radioKm` alrededor de un punto. A las
// latitudes de Colombia la aproximación equirectangular es más que suficiente para un
// prefiltro (el filtro exacto va después, con Haversine).
function cajaAlrededor({ lat, lng }, radioKm) {
  const dLat = radioKm / 111.32;
  const cos = Math.cos(lat * Math.PI / 180);
  // Cerca de los polos cos→0 y el margen se dispararía; se acota para no generar una
  // caja que dé la vuelta al mundo. En Colombia nunca se llega a este caso.
  const dLng = radioKm / (111.32 * Math.max(Math.abs(cos), 0.01));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

app.get('/api/mapa/proyectos', auth.requireAuth, (req, res) => res.json({ proyectos: store.getProyectosConCoordenadas() }));
app.get('/api/mapa/zonas', auth.requireAuth, (req, res) => res.json({ zonas: store.getZonasConCoordenadas() }));

// Marcar en el mapa un proyecto o una zona (se hace una vez, a mano, desde su ficha).
app.post('/api/mapa/proyectos/:id/coords', auth.requireAdmin, (req, res) => {
  const { lat, lng } = req.body || {};
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return res.status(400).json({ error: 'coordenadas_invalidas' });
  store.setProyectoCoords(req.params.id, Number(lat), Number(lng));
  res.json({ ok: true });
});

app.post('/api/mapa/zonas/:id/coords', auth.requireAdmin, (req, res) => {
  const { lat, lng, radioKm } = req.body || {};
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return res.status(400).json({ error: 'coordenadas_invalidas' });
  store.setZonaCoords(req.params.id, { lat: Number(lat), lng: Number(lng), radioKm });
  res.json({ ok: true });
});

// Fuerza una pasada de geocodificación (el cron ya la hace sola cada hora).
app.post('/api/mapa/geocodificar', auth.requireAdmin, asyncH(async (req, res) => {
  const r = await require('./services/geocode').geocodificarPendientes(Number(req.body && req.body.limite) || 25);
  res.json({ ok: true, ...r });
}));

// Recupera coordenadas exactas del histórico: clientes que ya habían compartido su
// ubicación por WhatsApp antes de que el CRM la guardara en el lead.
app.post('/api/mapa/coords-desde-ubicaciones', auth.requireAdmin, (req, res) => {
  res.json({ ok: true, ...store.backfillCoordsDesdeUbicaciones(Number(req.body && req.body.limite) || 1000) });
});

// El propio asesor consulta su recorrido (no el de sus compañeros).
app.get('/api/mi-recorrido', auth.requireAuth, (req, res) => {
  if (!req.session.vendedorId) return res.json({ puntos: [] });
  const fecha = String(req.query.fecha || '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? req.query.fecha
    : hoyBogota();
  res.json({ fecha, puntos: store.getRecorridoVendedor(req.session.vendedorId, fecha) });
});

// Config del mapa. El token público de Mapbox (pk.*) está pensado para viajar al
// navegador; conviene restringirlo por URL desde el panel de Mapbox.
// Sin token el front usa CARTO Dark Matter para las teselas (oscuro, gratuito y sin
// credenciales, acorde a la marca) y Nominatim para buscar lugares — o sea, el mapa
// nunca queda ni claro ni caído por falta de credenciales.
app.get('/api/mapa/config', auth.requireAuth, (req, res) => {
  const token = process.env.MAPBOX_TOKEN || store.getConfig('mapbox_token') || '';
  res.json({
    proveedor: token ? 'mapbox' : 'carto',
    token,
    pais: 'co',
  });
});

// Reasignar un lead a otro vendedor (admin, supervisor o jefe — quien tiene visión
// global del equipo; el jefe reasigna igual que el admin, ver esAccesoGlobal)
app.post('/api/leads/:id/reasignar', auth.requireSupervisorOrAdmin, (req, res) => {
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
  try {
    require('./services/activity').logReasignacion({
      leadId: lead.id, customerName: lead.customer_name,
      de: anteriorId ? (getVendedores().find(v => Number(v.id) === Number(anteriorId)) || {}).nombre : null,
      a: vendedor.nombre, actorNombre: req.session.nombre,
    });
  } catch (e) { /* feed opcional */ }
  notify({ vendedorId: vendedor.id, tipo: 'lead_asignado', leadId: lead.id, push: true,
    titulo: '🆕 Lead asignado a ti', cuerpo: `${lead.customer_name} (${lead.customer_phone})` }).catch(() => {});
  if (anteriorId && Number(anteriorId) !== Number(vendedor.id)) {
    notify({ vendedorId: anteriorId, tipo: 'lead_reasignado', leadId: lead.id, push: true,
      titulo: '🔄 Lead reasignado', cuerpo: `${lead.customer_name} pasó a ${vendedor.nombre}.` }).catch(() => {});
  }
  res.json({ ok: true, vendedor: { id: vendedor.id, nombre: vendedor.nombre } });
});

// ===================== LEAD PROACTIVO (iniciar chat sin que el cliente escriba) =====================

app.post('/api/leads/proactive', auth.requireAuth, async (req, res) => {
  const { phone, name, message, templateName, templateId, templateVars, zona } = req.body || {};
  if (!phone || !String(phone).trim()) return res.status(400).json({ error: 'telefono_requerido' });
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'mensaje_requerido' });

  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  if (cleanPhone.length < 10) return res.status(400).json({ error: 'telefono_invalido' });

  try {
    // 1. Crear lead en la BD
    const result = store.saveLead(cleanPhone, name || 'Cliente', String(message).trim());
    const lead = store.getLeadById(result.leadId);

    // 2. Asignar vendedor — si el admin eligió zona en el modal (F-zonas), se prefiere
    // un asesor que la cubra; si no, o si nadie la cubre, cae al reparto por menor carga.
    const zonaRecord = zona ? store.getZonaBySlug(String(zona)) : null;
    if (zonaRecord) store.setLeadZona(lead.id, zonaRecord.slug, 'manual', zonaRecord.nombre);
    const activos = store.getVendedoresActivos();
    const { elegirVendedor } = require('./services/zonas');
    const { vendedor: elegido, fuente } = elegirVendedor(activos, { zona: zonaRecord ? zonaRecord.slug : null });
    const vendedorAsignado = elegido || (activos.length > 0 ? activos[0] : null);
    if (fuente === 'fallback') store.setLeadZonaFuente(lead.id, 'fallback');
    if (vendedorAsignado) {
      store.assignLeadToVendedor(lead.id, vendedorAsignado);
    }

    // 3. Un número que nunca escribió antes tiene la ventana de 24h cerrada por
    // definición: Meta exige que el PRIMER contacto sea con una plantilla aprobada.
    // Se resuelve una sola plantilla (templateId > templateName > la de reactivación
    // configurada) y se envía UNA sola vez — antes se enviaba aquí y otra vez dentro
    // de sendMessageSmart si fallaba el free-form, llegándole dos plantillas distintas
    // al mismo cliente.
    const { sendMessageSmart } = require('./services/whatsapp');
    let tplSent = false;
    if (templateId) {
      const tpl = store.getWATemplateById(templateId);
      if (!tpl) return res.status(404).json({ error: 'template_no_existe' });
      const vendedor = vendedorAsignado;
      const { sendResolvedTemplate } = require('./services/wa-templates');
      await sendResolvedTemplate(cleanPhone, tpl, lead, vendedor, templateVars || {});
      tplSent = true;
    } else {
      const tplName = templateName || store.getConfig('reengagement_template');
      if (tplName) {
        const tplRecord = store.getWATemplateByName(tplName);
        const vendedor = vendedorAsignado;
        if (tplRecord) {
          const { sendResolvedTemplate: sendRT } = require('./services/wa-templates');
          await sendRT(cleanPhone, tplRecord, lead, vendedor, templateVars || {});
        } else {
          const { sendTemplate: sendT } = require('./services/whatsapp');
          await sendT(cleanPhone, tplName);
        }
        tplSent = true;
      }
    }

    if (tplSent) {
      // La plantilla no abre la ventana de inmediato (solo lo hace la respuesta del
      // cliente) — el mensaje real se encola y se envía cuando el webhook detecte esa
      // respuesta (mismo mecanismo que sendMessageSmart usa para leads existentes).
      store.queuePendingOutbound(lead.id, cleanPhone, String(message).trim());
    } else {
      await sendMessageSmart(cleanPhone, String(message).trim(), lead.id);
    }

    // 4. Guardar mensaje outgoing
    store.saveMessage(lead.id, 'sistema', cleanPhone, String(message).trim(), 'outgoing');
    store.syncLeadToConversation(store.getLeadById(lead.id), {
      direction: 'outgoing', body: String(message).trim(), fromNumber: 'sistema', toNumber: cleanPhone,
    });

    // 5. Notificar
    if (vendedorAsignado) {
      events.emitToVendedor(vendedorAsignado.id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'lead_proactivo', ts: Date.now() });
    }
    events.emitToAdmins('lead_actualizado', { leadId: lead.id, tipo: 'lead_proactivo', ts: Date.now() });

    res.json({ ok: true, leadId: lead.id, queued: tplSent });
  } catch (e) {
    console.error('Error creando lead proactivo:', e.message);
    res.status(502).json({ error: 'error_whatsapp', detalle: e.message });
  }
});

// ===================== TIEMPO REAL (SSE) =====================

app.get('/api/stream', auth.requireAuth, (req, res) => {
  // Admin y supervisor escuchan el canal 0 (alertas del equipo); el vendedor en su propio id.
  const esGlobal = req.session.rol === 'admin' || req.session.rol === 'supervisor' || req.session.rol === 'jefe';
  const canal = esGlobal ? 0 : req.session.vendedorId;
  // Sin canal 0 = admins. Un rol no-global sin vendedorId caería ahí por Number(null||undefined)
  // y vería los eventos de todos los leads — cerrar la conexión en vez de exponer ese canal.
  if (!esGlobal && (canal === null || canal === undefined)) {
    return res.status(403).json({ error: 'sin_vendedor_asociado' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write(`event: conectado\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  events.addClient(canal, res);

  // Heartbeat para mantener viva la conexión
  const hb = setInterval(() => {
    try { res.write(': hb\n\n'); } catch (e) { clearInterval(hb); events.removeClient(canal, res); }
  }, CFG.SSE_HEARTBEAT);
  res.on('close', () => { clearInterval(hb); events.removeClient(canal, res); });
});

// ===================== NOTIFICACIONES PUSH ===================== (Fase 4: extraído
// a src/routes/push.js)
app.use('/api/push', require('./routes/push'));

// ===================== SALUD DEL SISTEMA (admin) =====================
const logger = require('./services/logger');
const BOOT_AT = Date.now();

app.get('/api/admin/salud', auth.requireAdmin, (req, res) => {
  let dbSize = 0;
  try { dbSize = fs.statSync(path.join(__dirname, '..', 'data', 'sp-leads.db')).size; } catch (e) { /* noop */ }
  const mem = process.memoryUsage();
  res.json({
    uptime_seg: Math.round((Date.now() - BOOT_AT) / 1000),
    memoria_mb: Math.round(mem.rss / 1024 / 1024),
    heap_mb: Math.round(mem.heapUsed / 1024 / 1024),
    db_mb: Math.round(dbSize / 1024 / 1024 * 10) / 10,
    errores_ultima_hora: logger.erroresUltimaHora(),
    node: process.version,
  });
});

// ===================== TAREAS / RECORDATORIOS ===================== (Fase 4: extraído
// a src/routes/tareas.js — el barrido de vencidos que manda push se queda en index.js)
app.use('/api/tareas', auth.requireAuth, require('./routes/tareas'));

// Guardar el "Acerca de" del perfil (persistido en el servidor, cross-device)
app.post('/api/mi-about', auth.requireAuth, (req, res) => {
  if (!req.session.vendedorId) return res.status(400).json({ error: 'sin_vendedor' });
  store.setVendedorAbout(req.session.vendedorId, (req.body || {}).texto || '');
  res.json({ ok: true });
});

// Barrido de recordatorios: cada 60s, push a los vencidos (funciona con la app cerrada)
function checkRecordatorios() {
  try {
    const vencidas = store.getTareasVencidasSinNotificar(new Date().toISOString());
    if (!vencidas.length) return;
    // Los admins escuchan SSE/push por el canal 0 (no por su vendedor_id):
    // si la tarea es de un vendedor vinculado a un usuario admin, notificar al canal 0.
    const adminVendedorIds = new Set(store.getUsuarios().filter(u => u.rol === 'admin' && u.vendedor_id).map(u => Number(u.vendedor_id)));
    for (const t of vencidas) {
      store.markTareaNotificada(t.id);
      const canal = adminVendedorIds.has(Number(t.vendedor_id)) ? 0 : t.vendedor_id;
      notify({
        vendedorId: canal, tipo: 'recordatorio', leadId: t.lead_id || null, push: true,
        titulo: '🔔 Recordatorio', cuerpo: t.texto,
      }).catch(() => {});
      // Una tarea vencida también puede encadenar automatizaciones (avisar al jefe si
      // el asesor no la cerró, mover el lead, etc.).
      if (t.lead_id) {
        try { require('./services/assigner').triggerWorkflow('tarea:vencida', t.lead_id, t.texto, { tareaId: t.id }); }
        catch (e) { console.error('trigger tarea:vencida:', e.message); }
      }
    }
  } catch (e) {
    console.error('checkRecordatorios:', e.message);
  }
}

// ===================== CENTRO DE NOTIFICACIONES =====================
// Admin usa el canal 0 (misma convención que SSE y push); vendedor su propio id.
// ===================== NOTIFICACIONES ===================== (Fase 4: extraído a
// src/routes/notificaciones.js)
app.use('/api/notificaciones', auth.requireAuth, require('./routes/notificaciones'));

// ===================== CONFIGURACIÓN (admin) =====================

// ===================== CONFIG ===================== (Fase 4: extraído a
// src/routes/config.js, incluido CONFIG_KEYS)
app.use('/api/config', auth.requireAdmin, require('./routes/config'));

// ===================== PLANTILLAS WHATSAPP (Meta aprobadas) =====================

// Sin ?estado, solo las APROBADAS (las únicas enviables) — mantiene el contrato que ya
// consumen inbox.html, campanas.html, configuracion.html y el panel vendedor, que no
// filtran por estado en cliente y ahora sí podrían recibir PENDING/REJECTED si no se
// defendiera aquí. ?estado=todos o un estado concreto para el gestor admin.
app.get('/api/wa-templates', auth.requireAuth, (req, res) => {
  const estado = req.query.estado;
  if (!estado || estado === 'APPROVED') return res.json(store.getWATemplatesAprobadas());
  if (estado === 'todos') return res.json(store.getWATemplates());
  res.json(store.getWATemplates().filter(t => t.estado === estado));
});

// Diagnóstico rápido sin llamar a Meta — primer sitio donde mirar cuando "no se puede
// enviar" (ej. reengagement_template ausente en `config`, causa raíz real del bug
// reportado: el motor de envío ya sabe reactivar, solo le faltaba el nombre configurado).
// Registrado ANTES de /:id para que Express no lo capture como un id.
app.get('/api/wa-templates/salud', auth.requireAdmin, (req, res) => {
  const todas = store.getWATemplates();
  const porEstado = {};
  todas.forEach(t => { porEstado[t.estado || 'desconocido'] = (porEstado[t.estado || 'desconocido'] || 0) + 1; });
  let wabaIdPresente = false;
  try { wabaIdPresente = !!require('./services/whatsapp').getAuth().wabaId; } catch (e) { /* sin canal configurado */ }
  res.json({
    reengagement_template: store.getConfig('reengagement_template') || '',
    recordatorio_template: store.getConfig('recordatorio_template') || '',
    total: todas.length,
    aprobadas: porEstado.APPROVED || 0,
    pendientes: (porEstado.PENDING || 0) + (porEstado.IN_APPEAL || 0),
    rechazadas: porEstado.REJECTED || 0,
    porEstado,
    waba_id_presente: wabaIdPresente,
    token_presente: !!(process.env.WHATSAPP_TOKEN || wabaIdPresente),
  });
});

// Valida un borrador del constructor SIN llamar a Meta — el constructor la usa con
// debounce mientras el admin escribe, para no gastar round-trips por cada error tipeable.
// Registrado ANTES de /:id por la misma razón que /salud.
app.post('/api/wa-templates/validar', auth.requireAdmin, (req, res) => {
  const { spec, excludeId } = req.body || {};
  try {
    const wa = require('./services/wa-templates');
    const validacion = wa.validateTemplateSpec(spec || {}, { excludeId: excludeId ? Number(excludeId) : undefined });
    let payload = null, variables = [];
    if (validacion.ok) { const built = wa.buildMetaTemplatePayload(spec); payload = built.payload; variables = built.variables; }
    res.json({ ...validacion, payload, variables });
  } catch (e) {
    res.status(400).json({ ok: false, errores: [{ campo: 'general', mensaje: e.message }], advertencias: [] });
  }
});

// Sincroniza el catálogo real de plantillas desde Meta (Graph API) — TODOS los estados,
// no solo aprobadas, para que una plantilla en revisión sea visible en el gestor y no
// desaparezca sin explicación.
app.post('/api/wa-templates/sync', auth.requireAdmin, async (req, res) => {
  try {
    const { syncTemplatesFromMeta } = require('./services/wa-templates');
    const result = await syncTemplatesFromMeta();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('Error sincronizando plantillas de Meta:', e.message);
    res.status(502).json({ error: 'error_sync', detalle: e.message });
  }
});

// Bandeja de aprobación interna (admin y jefes). Va ANTES de /:id: si no, Express la
// resolvería como una plantilla con id "revision".
app.get('/api/wa-templates/revision', auth.requireSupervisorOrAdmin, (req, res) => {
  res.json(store.getWATemplatesEnRevision());
});

// Detalle de una plantilla con variables/componentes/spec ya parseados, para construir
// el formulario de variables o reabrir el constructor (evita repetir JSON.parse en cada cliente).
app.get('/api/wa-templates/:id', auth.requireAuth, (req, res) => {
  const t = store.getWATemplateById(req.params.id);
  if (!t) return res.status(404).json({ error: 'no_existe' });
  let variables = [], componentes = [], mapping = {}, spec = null;
  try { variables = JSON.parse(t.variables || '[]'); } catch (e) {}
  try { componentes = JSON.parse(t.componentes || '[]'); } catch (e) {}
  try { mapping = JSON.parse(t.var_mapping || '{}'); } catch (e) {}
  try { spec = t.spec_json ? JSON.parse(t.spec_json) : null; } catch (e) {}
  res.json({ ...t, variables, componentes, mapping, spec });
});

// Crea una plantilla real en Meta desde el constructor del admin. Reemplaza el alta
// manual legacy (0 consumidores en public/ — solo escribía nombre/idioma sin componentes,
// quedaba fuera del motor de variables y del filtro estado==='APPROVED' del envío).
app.post('/api/wa-templates', auth.requireAdmin, async (req, res) => {
  const { spec } = req.body || {};
  if (!spec) return res.status(400).json({ error: 'spec_requerido' });
  const wa = require('./services/wa-templates');
  const validacion = wa.validateTemplateSpec(spec);
  if (!validacion.ok) return res.status(400).json({ error: 'validacion', errores: validacion.errores });
  try {
    const { payload, variables } = wa.buildMetaTemplatePayload(spec);
    const metaResult = await wa.createTemplateInMeta(spec);
    // El CRM crea siempre en NAMED con las claves del catálogo como placeholders — el
    // mapping sale identidad (cada {{clave}} ya ES la clave del catálogo), sin que el
    // admin tenga que configurar nada después.
    const mapping = {}; variables.forEach(v => { mapping[v] = v; });
    const id = store.insertWATemplateBorrador({
      nombre: validacion.nombreSlug, idioma: spec.idioma || 'es', categoria: spec.categoria,
      componentes: JSON.stringify(payload.components), variables: JSON.stringify(variables),
      specJson: JSON.stringify(spec), creadoPor: req.session.vendedorId || null,
      metaTemplateId: metaResult.id, estado: metaResult.status || 'PENDING',
    });
    store.setWATemplateMapping(id, JSON.stringify(mapping));
    res.status(201).json({ ok: true, id, metaId: metaResult.id, estado: metaResult.status || 'PENDING' });
  } catch (e) {
    if (e.validacion) return res.status(400).json({ error: 'validacion', errores: e.validacion.errores });
    const norm = wa.normalizeMetaError(e);
    console.error('[wa-templates] crear:', e.response ? JSON.stringify(e.response.data) : e.message);
    res.status(502).json({ error: 'error_meta', detalle: norm.mensaje, sugerencia: norm.sugerencia, codigo: norm.codigo, subcodigo: norm.subcodigo });
  }
});

// ───────────── Plantillas propuestas por asesores (revisión interna) ─────────────
// Un asesor puede redactar su plantilla, pero NO se manda a Meta hasta que el admin o
// un jefe la aprueba: cada plantilla rechazada por Meta castiga la calidad del número
// de toda la empresa, así que el filtro humano va antes.

app.get('/api/mis-plantillas', auth.requireAuth, (req, res) => {
  if (!req.session.vendedorId) return res.json([]);
  res.json(store.getWATemplatesByAutor(req.session.vendedorId));
});

app.post('/api/mis-plantillas', auth.requireAuth, (req, res) => {
  if (!req.session.vendedorId) return res.status(400).json({ error: 'sin_vendedor_asociado' });
  const { spec } = req.body || {};
  if (!spec) return res.status(400).json({ error: 'spec_requerido' });
  const wa = require('./services/wa-templates');
  const validacion = wa.validateTemplateSpec(spec);
  if (!validacion.ok) return res.status(400).json({ error: 'validacion', errores: validacion.errores });
  try {
    const { payload, variables } = wa.buildMetaTemplatePayload(spec);
    const id = store.insertWATemplatePropuesta({
      nombre: validacion.nombreSlug, idioma: spec.idioma || 'es', categoria: spec.categoria,
      componentes: JSON.stringify(payload.components), variables: JSON.stringify(variables),
      specJson: JSON.stringify(spec), creadoPor: req.session.vendedorId,
    });
    // Aviso a quien puede aprobarla (canal 0 = admins/jefes).
    notify({ vendedorId: 0, tipo: 'plantilla_revision', push: true,
      titulo: '📋 Plantilla por revisar',
      cuerpo: `${req.session.nombre || 'Un asesor'} propuso la plantilla "${validacion.nombreSlug}".` }).catch(() => {});
    res.status(201).json({ ok: true, id, estado: 'EN_REVISION' });
  } catch (e) {
    if (e.validacion) return res.status(400).json({ error: 'validacion', errores: e.validacion.errores });
    res.status(500).json({ error: 'error_guardando', detalle: e.message });
  }
});

// Editar la propia propuesta mientras siga sin salir a Meta (en revisión o devuelta
// con correcciones). Una vez enviada a Meta, la edición pasa por el flujo de admin.
app.put('/api/mis-plantillas/:id', auth.requireAuth, (req, res) => {
  const t = store.getWATemplateById(req.params.id);
  if (!t) return res.status(404).json({ error: 'no_existe' });
  if (Number(t.creado_por) !== Number(req.session.vendedorId)) return res.status(403).json({ error: 'sin_permiso' });
  if (!store.ESTADOS_INTERNOS.includes(String(t.estado))) {
    return res.status(409).json({ error: 'ya_enviada', detalle: 'Esta plantilla ya salió a revisión de Meta; pídele el cambio a un administrador.' });
  }
  const { spec } = req.body || {};
  if (!spec) return res.status(400).json({ error: 'spec_requerido' });
  const wa = require('./services/wa-templates');
  const validacion = wa.validateTemplateSpec(spec, { excludeId: t.id });
  if (!validacion.ok) return res.status(400).json({ error: 'validacion', errores: validacion.errores });
  const { payload, variables } = wa.buildMetaTemplatePayload(spec);
  store.updateWATemplateSpec(t.id, {
    componentes: JSON.stringify(payload.components), variables: JSON.stringify(variables),
    specJson: JSON.stringify(spec), estado: 'EN_REVISION', // vuelve a la cola de revisión
  });
  res.json({ ok: true, estado: 'EN_REVISION' });
});

app.delete('/api/mis-plantillas/:id', auth.requireAuth, (req, res) => {
  const t = store.getWATemplateById(req.params.id);
  if (!t) return res.status(404).json({ error: 'no_existe' });
  if (Number(t.creado_por) !== Number(req.session.vendedorId)) return res.status(403).json({ error: 'sin_permiso' });
  if (!store.ESTADOS_INTERNOS.includes(String(t.estado))) return res.status(409).json({ error: 'ya_enviada' });
  store.deleteWATemplate(t.id);
  res.json({ ok: true });
});

// Aprobar internamente = recién ahí se crea en Meta.
app.post('/api/wa-templates/:id/aprobar', auth.requireSupervisorOrAdmin, async (req, res) => {
  const t = store.getWATemplateById(req.params.id);
  if (!t) return res.status(404).json({ error: 'no_existe' });
  if (!store.ESTADOS_INTERNOS.includes(String(t.estado))) return res.status(409).json({ error: 'estado_invalido', detalle: `La plantilla está en estado ${t.estado}.` });
  const wa = require('./services/wa-templates');
  let spec;
  try { spec = JSON.parse(t.spec_json || '{}'); } catch (e) { spec = null; }
  if (!spec) return res.status(409).json({ error: 'sin_spec' });
  // El admin puede corregir el contenido antes de aprobar, sin devolvérsela al asesor.
  if (req.body && req.body.spec) spec = req.body.spec;
  const validacion = wa.validateTemplateSpec(spec, { excludeId: t.id });
  if (!validacion.ok) return res.status(400).json({ error: 'validacion', errores: validacion.errores });
  try {
    const { payload, variables } = wa.buildMetaTemplatePayload(spec);
    const metaResult = await wa.createTemplateInMeta(spec);
    const mapping = {}; variables.forEach(v => { mapping[v] = v; });
    store.updateWATemplateSpec(t.id, { componentes: JSON.stringify(payload.components), variables: JSON.stringify(variables), specJson: JSON.stringify(spec) });
    store.setWATemplateMapping(t.id, JSON.stringify(mapping));
    store.marcarWATemplateEnviadaAMeta(t.id, metaResult.id, metaResult.status || 'PENDING');
    if (t.creado_por) {
      notify({ vendedorId: t.creado_por, tipo: 'plantilla_aprobada', push: true,
        titulo: '✅ Tu plantilla fue aprobada',
        cuerpo: `"${t.nombre}" ya está en revisión de Meta. Te avisamos cuando la habiliten.` }).catch(() => {});
    }
    res.json({ ok: true, estado: metaResult.status || 'PENDING', metaId: metaResult.id });
  } catch (e) {
    const norm = wa.normalizeMetaError(e);
    console.error('[wa-templates] aprobar:', e.response ? JSON.stringify(e.response.data) : e.message);
    res.status(502).json({ error: 'error_meta', detalle: norm.mensaje, sugerencia: norm.sugerencia });
  }
});

// Devolver al asesor con comentarios, sin gastar una revisión de Meta.
app.post('/api/wa-templates/:id/devolver', auth.requireSupervisorOrAdmin, (req, res) => {
  const t = store.getWATemplateById(req.params.id);
  if (!t) return res.status(404).json({ error: 'no_existe' });
  if (!store.ESTADOS_INTERNOS.includes(String(t.estado))) return res.status(409).json({ error: 'estado_invalido' });
  const motivo = String((req.body && req.body.motivo) || '').trim();
  if (!motivo) return res.status(400).json({ error: 'motivo_requerido', detalle: 'Escribe qué debe corregir el asesor.' });
  store.setWATemplateEstado(t.id, { estado: 'CORRECCION', motivo, detalle: `Devuelta por ${req.session.nombre || 'la administración'}` });
  if (t.creado_por) {
    notify({ vendedorId: t.creado_por, tipo: 'plantilla_correccion', push: true,
      titulo: '✏️ Tu plantilla necesita cambios',
      cuerpo: `"${t.nombre}": ${motivo}`.slice(0, 160) }).catch(() => {});
  }
  res.json({ ok: true, estado: 'CORRECCION' });
});

// Solo se puede cambiar `components`/`category` (Meta ignora name/language en edición).
// Editar una APPROVED la devuelve a PENDING — límite de Meta: 10 ediciones/30 días, 1/24h en aprobadas.
app.put('/api/wa-templates/:id', auth.requireAdmin, async (req, res) => {
  const t = store.getWATemplateById(req.params.id);
  if (!t) return res.status(404).json({ error: 'no_existe' });
  if (!t.meta_template_id) return res.status(409).json({ error: 'no_editable', detalle: 'Esta plantilla no tiene un id de Meta asociado — sincronízala primero.' });
  const { spec } = req.body || {};
  if (!spec) return res.status(400).json({ error: 'spec_requerido' });
  const wa = require('./services/wa-templates');
  const validacion = wa.validateTemplateSpec(spec, { excludeId: t.id });
  if (!validacion.ok) return res.status(400).json({ error: 'validacion', errores: validacion.errores });
  try {
    const { payload, variables } = wa.buildMetaTemplatePayload(spec);
    await wa.updateTemplateInMeta(t.meta_template_id, spec, t.id);
    const mapping = {}; variables.forEach(v => { mapping[v] = v; });
    store.updateWATemplateSpec(t.id, { componentes: JSON.stringify(payload.components), variables: JSON.stringify(variables), specJson: JSON.stringify(spec), estado: 'PENDING' });
    store.setWATemplateMapping(t.id, JSON.stringify(mapping));
    res.json({ ok: true, estado: 'PENDING' });
  } catch (e) {
    if (e.validacion) return res.status(400).json({ error: 'validacion', errores: e.validacion.errores });
    const norm = wa.normalizeMetaError(e);
    console.error('[wa-templates] editar:', e.response ? JSON.stringify(e.response.data) : e.message);
    res.status(502).json({ error: 'error_meta', detalle: norm.mensaje, sugerencia: norm.sugerencia, codigo: norm.codigo, subcodigo: norm.subcodigo });
  }
});

// Clona el spec de una plantilla creada en el CRM bajo un nombre/idioma nuevo (ej. la
// versión en inglés). No hay endpoint de "duplicar" en Meta — es crear de cero.
app.post('/api/wa-templates/:id/duplicar', auth.requireAdmin, async (req, res) => {
  const t = store.getWATemplateById(req.params.id);
  if (!t) return res.status(404).json({ error: 'no_existe' });
  if (!t.spec_json) return res.status(409).json({ error: 'sin_spec', detalle: 'Esta plantilla no tiene un borrador guardado (no se creó desde el CRM) — no se puede duplicar.' });
  const { nombre, idioma } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'nombre_requerido' });
  const wa = require('./services/wa-templates');
  let spec;
  try { spec = { ...JSON.parse(t.spec_json), nombre, idioma: idioma || t.idioma }; } catch (e) { return res.status(500).json({ error: 'spec_corrupto' }); }
  const validacion = wa.validateTemplateSpec(spec);
  if (!validacion.ok) return res.status(400).json({ error: 'validacion', errores: validacion.errores });
  try {
    const { payload, variables } = wa.buildMetaTemplatePayload(spec);
    const metaResult = await wa.createTemplateInMeta(spec);
    const mapping = {}; variables.forEach(v => { mapping[v] = v; });
    const id = store.insertWATemplateBorrador({
      nombre: validacion.nombreSlug, idioma: spec.idioma, categoria: spec.categoria,
      componentes: JSON.stringify(payload.components), variables: JSON.stringify(variables),
      specJson: JSON.stringify(spec), creadoPor: req.session.vendedorId || null,
      metaTemplateId: metaResult.id, estado: metaResult.status || 'PENDING',
    });
    store.setWATemplateMapping(id, JSON.stringify(mapping));
    res.status(201).json({ ok: true, id, metaId: metaResult.id, estado: metaResult.status || 'PENDING' });
  } catch (e) {
    if (e.validacion) return res.status(400).json({ error: 'validacion', errores: e.validacion.errores });
    const norm = wa.normalizeMetaError(e);
    res.status(502).json({ error: 'error_meta', detalle: norm.mensaje, sugerencia: norm.sugerencia, codigo: norm.codigo, subcodigo: norm.subcodigo });
  }
});

// Borra en Meta (SIEMPRE con hsm_id — sin él se lleva todos los idiomas del mismo name
// por delante) y localmente. ?soloLocal=1 para huérfanas que ya no existen en Meta.
app.delete('/api/wa-templates/:id', auth.requireAdmin, async (req, res) => {
  const t = store.getWATemplateById(req.params.id);
  if (!t) return res.status(404).json({ error: 'no_existe' });
  if (store.getConfig('reengagement_template') === t.nombre) {
    return res.status(409).json({ error: 'en_uso', detalle: 'Es la plantilla de reactivación configurada — cambia esa configuración antes de borrarla.' });
  }
  if (store.getConfig('recordatorio_template') === t.nombre) {
    return res.status(409).json({ error: 'en_uso', detalle: 'Es la plantilla de recordatorio de citas configurada — cambia esa configuración antes de borrarla.' });
  }
  const enCampanaActiva = (store.getCampaignsByEstado('running') || []).some(c => Number(c.template_id) === t.id);
  if (enCampanaActiva) return res.status(409).json({ error: 'en_uso', detalle: 'Una campaña activa está usando esta plantilla — pausa la campaña antes de borrarla.' });

  const soloLocal = req.query.soloLocal === '1';
  try {
    if (!soloLocal && t.meta_template_id) {
      await require('./services/wa-templates').deleteTemplateInMeta(t.nombre, t.meta_template_id);
    }
    store.deleteWATemplate(t.id);
    res.json({ ok: true });
  } catch (e) {
    const norm = require('./services/wa-templates').normalizeMetaError(e);
    console.error('[wa-templates] borrar:', e.response ? JSON.stringify(e.response.data) : e.message);
    res.status(502).json({ error: 'error_meta', detalle: norm.mensaje, sugerencia: norm.sugerencia, codigo: norm.codigo, subcodigo: norm.subcodigo });
  }
});

// Refresco puntual contra Meta (botón "Comprobar estado") — no espera al webhook ni al poller de 15 min.
app.post('/api/wa-templates/:id/refrescar', auth.requireAdmin, async (req, res) => {
  const t = store.getWATemplateById(req.params.id);
  if (!t) return res.status(404).json({ error: 'no_existe' });
  if (!t.meta_template_id) return res.status(409).json({ error: 'sin_meta_id', detalle: 'Esta plantilla no tiene un id de Meta asociado.' });
  try {
    const wa = require('./services/wa-templates');
    const remoto = await wa.fetchTemplateFromMeta(t.meta_template_id);
    store.setWATemplateEstado(t.id, {
      estado: remoto.status,
      motivo: remoto.rejected_reason && remoto.rejected_reason !== 'NONE' ? remoto.rejected_reason : null,
      calidad: remoto.quality_score && remoto.quality_score.score || null,
    });
    if (remoto.components) {
      store.updateWATemplateSpec(t.id, { componentes: JSON.stringify(remoto.components), variables: JSON.stringify(wa.extractVariables(remoto.components)) });
    }
    res.json({ ok: true, estado: remoto.status });
  } catch (e) {
    const norm = require('./services/wa-templates').normalizeMetaError(e);
    res.status(502).json({ error: 'error_meta', detalle: norm.mensaje, sugerencia: norm.sugerencia });
  }
});

// Guarda qué variable del CRM (ver /api/template-vars) llena cada placeholder de la plantilla.
app.put('/api/wa-templates/:id/mapping', auth.requireAdmin, (req, res) => {
  const { mapping } = req.body || {};
  if (!mapping || typeof mapping !== 'object') return res.status(400).json({ error: 'mapping_invalido' });
  store.setWATemplateMapping(req.params.id, JSON.stringify(mapping));
  res.json({ ok: true });
});

// Texto ya resuelto con los datos de un lead concreto (o sin lead, para el constructor)
// — burbuja estilo WhatsApp lista para pintar en el cliente, sin reimplementar el
// catálogo de variables ni el mapping en el frontend (ver public/m/index.html Fase 6).
app.get('/api/wa-templates/:id/preview', auth.requireAuth, (req, res) => {
  const t = store.getWATemplateById(req.params.id);
  if (!t) return res.status(404).json({ error: 'no_existe' });
  const wa = require('./services/wa-templates');
  const { CATALOG } = require('./services/template-vars');
  const labelPorClave = {}; CATALOG.forEach(c => { labelPorClave[c.key] = c.label; });

  const lead = req.query.leadId ? store.getLeadById(req.query.leadId) : null;
  const vendedor = lead && lead.assigned_to_id
    ? store.getVendedorById(lead.assigned_to_id)
    : (req.session.vendedorId ? store.getVendedorById(req.session.vendedorId) : null);

  let mapping = {}, componentes = [];
  try { mapping = JSON.parse(t.var_mapping || '{}'); } catch (e) {}
  try { componentes = JSON.parse(t.componentes || '[]'); } catch (e) {}
  const placeholders = wa.extractVariables(componentes);
  const values = wa.resolveTemplateValues(t, lead, vendedor, {});
  const variables = placeholders.map(ph => ({ ph, label: labelPorClave[mapping[ph] || ph] || ph, valor: values[ph] || '' }));
  const falta = variables.filter(v => !v.valor).map(v => v.ph);

  const sustituir = (texto) => String(texto || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => (values[k] != null ? String(values[k]) : m));
  const header = componentes.find(c => c.type === 'HEADER');
  const body = componentes.find(c => c.type === 'BODY');
  const footer = componentes.find(c => c.type === 'FOOTER');
  const botonesComp = componentes.find(c => c.type === 'BUTTONS');

  res.json({
    nombre: t.nombre, idioma: t.idioma, categoria: t.categoria, estado: t.estado,
    header: header ? (header.format === 'TEXT' ? { tipo: 'TEXT', texto: sustituir(header.text) } : { tipo: header.format }) : null,
    body: sustituir(body && body.text),
    footer: footer ? footer.text : null,
    botones: botonesComp ? (botonesComp.buttons || []).map(b => ({ tipo: b.type, texto: b.text, url: b.url ? sustituir(b.url) : undefined, telefono: b.phone_number })) : [],
    variables, falta,
  });
});

// Catálogo de variables disponibles para mapear/editar en plantillas (1-a-1 y campañas).
app.get('/api/template-vars', auth.requireAuth, (req, res) => {
  res.json(require('./services/template-vars').CATALOG);
});

// Variables ya resueltas del lead — reemplaza la reimplementación cliente en
// public/m/index.html (le faltaban link_ubicacion/link_catalogo/fecha_cita/hora_cita y
// tenía `empresa` hardcodeado, rompiendo Vid.a multiempresa).
app.get('/api/leads/:id/template-vars', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  const vendedor = lead.assigned_to_id ? store.getVendedorById(lead.assigned_to_id) : null;
  res.json(require('./services/template-vars').resolveLeadVariables(lead, vendedor));
});

// Enviar template aprobado de Meta a un lead. Soporta dos formas:
// - templateId: usa el motor de variables (mapeo + valores del lead + overrides editados a mano).
// - nombre + params (legacy): array de strings posicionales, retrocompatible.
app.post('/api/leads/:id/enviar-template', auth.requireAuth, async (req, res) => {
  const { nombre, templateId, params, overrides } = req.body || {};
  if (!nombre && !templateId) return res.status(400).json({ error: 'nombre o templateId requerido' });
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  // Proteger validación contra vendedorId nulo o NaN
  const vendedorId = Number(req.session.vendedorId);
  if (req.session.rol !== 'admin' && (!vendedorId || Number(lead.assigned_to_id) !== vendedorId)) {
    console.log(`[enviar-template] Permiso denegado: rol=${req.session.rol} vendedorId=${vendedorId} lead.assigned_to_id=${lead.assigned_to_id}`);
    return res.status(403).json({ error: 'sin_permiso' });
  }
  // Detectar un teléfono corrupto ANTES de gastar una llamada a Meta — se dio un caso
  // real de un lead con customer_phone = "AQUI_NUMERO_CORRECTO" (dato corrupto, no un
  // bug de código: no existe ningún endpoint que edite este campo tras crear el lead).
  // Sin esta validación, eso llega crudo hasta Meta y sale como un error de la Graph
  // API ("(#131009) Parameter value is not valid") que no dice nada sobre la causa real.
  const esWhatsApp = !/^(messenger_|instagram_)/.test(lead.customer_phone || '');
  if (esWhatsApp && !/^\+?\d{10,15}$/.test(String(lead.customer_phone || '').replace(/[\s-]/g, ''))) {
    console.error(`[enviar-template] Teléfono corrupto en lead ${lead.id}: ${JSON.stringify(lead.customer_phone)}`);
    return res.status(400).json({ error: 'telefono_invalido', detalle: `El número de este lead ("${lead.customer_phone}") no tiene un formato válido — corrígelo antes de enviar.` });
  }

  // Auto-reabrir lead archivado cuando el asesor envía plantilla
  let reopened = false;
  if (lead.status === 'cerrado') {
    store.reopenLead(lead.id);
    reopened = true;
    console.log(`[enviar-template] Lead ${lead.id} reabierto automáticamente por vendedor ${req.session.vendedorId}`);
  }

  // Detectar canal del lead (multicanal)
  const leadPhone = (lead && lead.customer_phone) || '';
  let leadChannel = 'whatsapp';
  if (leadPhone.startsWith('messenger_')) leadChannel = 'messenger';
  else if (leadPhone.startsWith('instagram_')) leadChannel = 'instagram';

  // Buscar conversación asociada
  let conversation = null;
  try { conversation = store.getConversationByLeadId ? store.getConversationByLeadId(lead.id) : null; } catch (e) { /* opcional */ }

  const fromNumber = lead.assigned_to_phone || req.session.email || 'panel';
  const setFirstResponseAndStatus = () => {
    store.setFirstResponse(lead.id);
    if (lead.status === 'nuevo' || lead.status === 'asignado') {
      store.updateLeadStatus(lead.id, 'contactado');
    }
  };
  const syncAndEmit = (body) => {
    store.syncLeadToConversation(store.getLeadById(lead.id), { direction: 'outgoing', body, fromNumber, toNumber: lead.customer_phone });
    events.emitToVendedor(lead.assigned_to_id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    events.emitToAdmins('nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
  };
  const logActivity = () => {
    try {
      require('./services/activity').logRespuesta({
        leadId: lead.id, conversationId: conversation ? conversation.id : null,
        vendedorId: req.session.vendedorId, vendedorNombre: req.session.nombre,
        customerName: lead.customer_name,
      });
    } catch (e) { /* feed opcional */ }
  };

  try {
    let tplNombre = nombre;
    let templateResult = null;

    // Para Instagram/Messenger: resolver template como texto plano y enviar como mensaje normal
    if (leadChannel !== 'whatsapp') {
      const { getAdapter: _gaTpl } = require('./channels');
      const tplAdapter = _gaTpl(leadChannel);
      const channelUserId = leadPhone.replace(/^(messenger_|instagram_)/, '');
      if (tplAdapter && channelUserId) {
        let textoResolver = nombre || 'Hola, queremos retomar tu solicitud. Escríbenos y con gusto te atendemos.';
        if (templateId) {
          const tpl = store.getWATemplateById(templateId);
          if (tpl) { textoResolver = tplAdapter.resolveTemplateText ? tplAdapter.resolveTemplateText(templateId, params) : tpl.nombre || textoResolver; }
        }
        templateResult = await tplAdapter.sendMessage(channelUserId, textoResolver);
        const body = '[Template: ' + (tplNombre || templateId) + ']';
        store.saveMessage(lead.id, fromNumber, leadPhone, body, 'outgoing');
        setFirstResponseAndStatus();
        syncAndEmit(body);
        logActivity();
        return res.json({ ok: true, reopened, warning: 'template_sent_as_text' });
      }
    }

    if (templateId) {
      const tpl = store.getWATemplateById(templateId);
      if (!tpl) return res.status(404).json({ error: 'template_no_existe' });
      if (tpl.estado !== 'APPROVED') return res.status(400).json({ error: 'template_no_aprobado', detalle: `Template "${tpl.nombre}" tiene estado "${tpl.estado}" — solo APPROVED se puede enviar` });
      const vendedor = lead.assigned_to_id ? store.getVendedorById(lead.assigned_to_id) : null;
      const { resolveTemplateValues, extractVariables } = require('./services/wa-templates');
      const placeholders = extractVariables(JSON.parse(tpl.componentes || '[]'));
      if (placeholders.length) {
        const values = resolveTemplateValues(tpl, lead, vendedor, overrides || {});
        const emptyVars = placeholders.filter(ph => !values[ph] || String(values[ph]).trim() === '');
        if (emptyVars.length) {
          return res.status(400).json({ error: 'variables_vacias', detalle: `Faltan valores para: ${emptyVars.join(', ')}. El vendedor debe completar estos campos.` });
        }
      }
      const { sendResolvedTemplate } = require('./services/wa-templates');
      templateResult = await sendResolvedTemplate(lead.customer_phone, tpl, lead, vendedor, overrides || {});
      tplNombre = tpl.nombre;
    } else {
      const { sendTemplate } = require('./services/whatsapp');
      templateResult = await sendTemplate(lead.customer_phone, nombre, params || null);
    }

    // Capturar wamid de la respuesta de Meta
    const wamid = templateResult && templateResult.messages && templateResult.messages[0] ? templateResult.messages[0].id : null;
    const messageStatus = wamid ? 'sent' : 'pending';
    const body = `[Template: ${tplNombre}]`;

    store.saveMessage(lead.id, fromNumber, lead.customer_phone, body, 'outgoing', null, null, wamid, messageStatus);
    setFirstResponseAndStatus();
    syncAndEmit(body);
    logActivity();

    console.log(`[enviar-template] OK — lead=${lead.id} template=${tplNombre} channel=${leadChannel} wamid=${wamid || 'no_wamid'}`);
    res.json({ ok: true, reopened, wamid, messageStatus });
  } catch (e) {
    const errData = e.response && e.response.data && e.response.data.error;
    const detail = errData
      ? (errData.error_user_msg || errData.message || JSON.stringify(e.response.data))
      : e.message;
    console.error('[enviar-template] ERROR:', e.response ? JSON.stringify(e.response.data) : e.message);
    res.status(502).json({ error: 'error_whatsapp', detalle: detail });
  }
});

// ===================== CAMPAÑAS MASIVAS (broadcast) =====================

app.get('/api/campaigns', auth.requireAdmin, (req, res) => {
  res.json(store.getCampaigns());
});

// Valores reales (proyecto/ciudad) para poblar los filtros del segmento.
app.get('/api/campaigns/segment-options', auth.requireAdmin, (req, res) => {
  res.json(store.getSegmentOptions());
});

// Conteo en vivo de cuántos leads caen en un segmento, sin crear nada — para que el
// admin vea el tamaño de la audiencia mientras ajusta los filtros.
app.get('/api/campaigns/segment-preview', auth.requireAdmin, (req, res) => {
  const { etiqueta, proyecto, ciudad, vendedorId } = req.query;
  const count = store.countSegment({ etiqueta, proyecto, ciudad, vendedorId });
  res.json({ count });
});

app.get('/api/campaigns/:id', auth.requireAdmin, (req, res) => {
  const c = store.getCampaignById(req.params.id);
  if (!c) return res.status(404).json({ error: 'no_existe' });
  res.json(c);
});

app.get('/api/campaigns/:id/recipients', auth.requireAdmin, (req, res) => {
  const c = store.getCampaignById(req.params.id);
  if (!c) return res.status(404).json({ error: 'no_existe' });
  res.json(store.getCampaignRecipients(req.params.id, req.query.estado || null));
});

// Crea la campaña en borrador y materializa sus destinatarios a partir del segmento —
// una vez creados quedan fijos (si el segmento cambia después, no afecta esta campaña).
app.post('/api/campaigns', auth.requireAdmin, (req, res) => {
  const { nombre, templateId, segmento, overrides } = req.body || {};
  if (!nombre || !templateId) return res.status(400).json({ error: 'nombre_y_templateId_requeridos' });
  const tpl = store.getWATemplateById(templateId);
  if (!tpl) return res.status(404).json({ error: 'template_no_existe' });
  try {
    const campaign = store.createCampaign({ nombre, templateId, segmento, overrides, creadoPor: req.session.userId });
    const leads = store.segmentLeads(segmento || {});
    store.addCampaignRecipients(campaign.id, leads.map(l => ({ leadId: l.id, phone: l.customer_phone, variables: {} })));
    res.json({ ok: true, campaign: store.getCampaignById(campaign.id) });
  } catch (e) {
    res.status(500).json({ error: 'error_creando_campana', detalle: e.message });
  }
});

// Muestra cómo se vería el mensaje para hasta 3 destinatarios reales del segmento,
// sin enviar nada — para revisar antes de comprometerse a un envío masivo.
app.get('/api/campaigns/:id/preview', auth.requireAdmin, (req, res) => {
  const c = store.getCampaignById(req.params.id);
  if (!c) return res.status(404).json({ error: 'no_existe' });
  const tpl = store.getWATemplateById(c.template_id);
  if (!tpl) return res.status(404).json({ error: 'template_no_existe' });
  const { resolveTemplateValues } = require('./services/wa-templates');
  let overrides = {}; try { overrides = JSON.parse(c.overrides || '{}'); } catch (e) {}
  const sample = store.getCampaignRecipients(c.id).slice(0, 3).map(rec => {
    const lead = rec.lead_id ? store.getLeadById(rec.lead_id) : null;
    const vendedor = lead && lead.assigned_to_id ? store.getVendedorById(lead.assigned_to_id) : null;
    return { phone: rec.phone, nombre: lead ? lead.customer_name : '', valores: resolveTemplateValues(tpl, lead, vendedor, overrides) };
  });
  res.json({ template: tpl.nombre, sample });
});

// Diagnóstico previo al envío: plantilla aprobada, variables sin valor, teléfonos
// inválidos, opt-outs y horario. Se puede consultar solo, y /start lo aplica.
app.get('/api/campaigns/:id/preflight', auth.requireAdmin, (req, res) => {
  const c = store.getCampaignById(req.params.id);
  if (!c) return res.status(404).json({ error: 'no_existe' });
  const { preflightCampaign } = require('./services/campaign-runner');
  res.json(preflightCampaign(c.id));
});

// Enviar UNA prueba a un número antes de disparar el lote.
app.post('/api/campaigns/:id/test', auth.requireAdmin, async (req, res) => {
  const c = store.getCampaignById(req.params.id);
  if (!c) return res.status(404).json({ error: 'no_existe' });
  const telefono = store.normalizePhone(String((req.body && req.body.telefono) || '').trim());
  if (!telefono) return res.status(400).json({ error: 'telefono_requerido' });
  try {
    const { sendCampaignTest } = require('./services/campaign-runner');
    const r = await sendCampaignTest(c.id, telefono);
    res.json({ ok: true, ...r });
  } catch (e) {
    const { describeMetaError } = require('./services/wa-templates');
    res.status(400).json({ error: 'envio_fallido', detalle: e.response ? describeMetaError(e) : e.message });
  }
});

app.post('/api/campaigns/:id/start', auth.requireAdmin, (req, res) => {
  const c = store.getCampaignById(req.params.id);
  if (!c) return res.status(404).json({ error: 'no_existe' });
  if (!['draft', 'paused'].includes(c.estado)) return res.status(400).json({ error: 'estado_invalido', detalle: `La campaña está en estado "${c.estado}"` });
  // Sin esto, una plantilla no aprobada o una variable vacía se descubría solo después
  // de quemar la lista entera con 400s opacos (ver preflightCampaign).
  const { preflightCampaign } = require('./services/campaign-runner');
  const chequeo = preflightCampaign(c.id);
  if (!chequeo.ok && !req.body?.forzar) {
    return res.status(400).json({ error: 'preflight_fallido', errores: chequeo.errores, avisos: chequeo.avisos });
  }
  const { runCampaign } = require('./services/campaign-runner');
  runCampaign(c.id).catch(e => console.error(`[Campaign ${c.id}] error:`, e.message));
  res.json({ ok: true, estado: 'running' });
});

app.post('/api/campaigns/:id/pause', auth.requireAdmin, (req, res) => {
  const c = store.getCampaignById(req.params.id);
  if (!c) return res.status(404).json({ error: 'no_existe' });
  // El runner relee el estado antes de cada envío y se detiene solo — no hace falta
  // matar ningún proceso ni interval, solo cambiar el estado que él mismo vigila.
  store.updateCampaignEstado(c.id, 'paused');
  res.json({ ok: true });
});

app.delete('/api/campaigns/:id', auth.requireAdmin, (req, res) => {
  const c = store.getCampaignById(req.params.id);
  if (!c) return res.status(404).json({ error: 'no_existe' });
  if (c.estado === 'running') return res.status(400).json({ error: 'no_se_puede_borrar_en_ejecucion' });
  store.deleteCampaign(c.id);
  res.json({ ok: true });
});

// Fase 4: extraído a src/routes/optouts.js
app.use('/api/optouts', auth.requireAdmin, require('./routes/optouts'));

// Exportar mis datos (Privacidad) — ZIP con leads (reutiliza reports.getExportCSV,
// el más completo de los 3 export de leads que hay en el sistema), notas internas y
// plantillas de respuesta rápida. archiver arma el ZIP como stream directo a la
// response — nada se escribe a disco temporal.
app.post('/api/privacidad/exportar', auth.requireAdmin, async (req, res) => {
  try {
    const archiver = require('archiver');
    const leadsCsv = require('./services/reports').getExportCSV();

    const notas = store.getAllNotas();
    const notasCsv = ['ID,Lead,Cliente,Telefono,Autor,Nota,Fecha']
      .concat(notas.map(n => [n.id, n.lead_id, n.customer_name || '', n.customer_phone || '', n.autor || '', String(n.nota || '').replace(/"/g, '""'), n.created_at]
        .map(v => `"${v}"`).join(',')))
      .join('\n');

    const plantillas = store.getWATemplates ? store.getWATemplates() : [];
    const plantillasJson = JSON.stringify(plantillas, null, 2);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="exportacion-datos-sp.zip"');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (e) => { console.error('[EXPORT] archiver:', e.message); if (!res.headersSent) res.status(500).end(); });
    archive.pipe(res);
    archive.append(leadsCsv, { name: 'leads.csv' });
    archive.append(notasCsv, { name: 'notas.csv' });
    archive.append(plantillasJson, { name: 'plantillas.json' });
    archive.append(`Exportación generada: ${new Date().toISOString()}\nSolicitada por: ${req.session.nombre || req.session.email || 'admin'}\n`, { name: 'README.txt' });
    await archive.finalize();
  } catch (e) {
    console.error('[EXPORT] Error generando ZIP:', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'error_exportando' });
  }
});

// Calidad y tier del número — el admin lo revisa antes de lanzar campañas grandes.
app.get('/api/campaigns/meta/quality', auth.requireAdmin, async (req, res) => {
  try {
    const { getPhoneQuality } = require('./services/whatsapp');
    const data = await getPhoneQuality();
    res.json({ ok: true, ...data, dailyLimitConfigurado: require('./services/campaign-runner').getDailyLimit() });
  } catch (e) {
    res.status(502).json({ error: 'error_meta', detalle: e.message });
  }
});

// ===================== CAMPAÑAS SP =====================

const campanasSp = require('./services/campanas-sp');

app.get('/api/campanas-sp/projects', auth.requireAdmin, (req, res) => {
  res.json(store.getCampanasSpProjects());
});

app.get('/api/campanas-sp/projects/dirs', auth.requireAdmin, (req, res) => {
  const { slug } = req.query;
  const dir = slug ? campanasSp.getProjectDir(slug) : campanasSp.detectRoot();
  const images = slug ? campanasSp.scanProjectImages(slug) : [];
  res.json({ root: campanasSp.detectRoot(), projectDir: dir, images });
});

app.post('/api/campanas-sp/projects', auth.requireAdmin, (req, res) => {
  let p = store.createCampanasSpProject(req.body);
  // Si viene vinculado a un proyecto real del CRM, copiar sus fotos (portada + lotes) para
  // no tener que resubirlas a mano. Nunca bloquea la creación: si falla, el proyecto queda
  // creado igual, solo sin fotos pre-cargadas (el admin puede subirlas manualmente después).
  if (req.body && req.body.proyecto_id) {
    try {
      const imgDir = path.join(campanasSp.getProjectDir(p.slug), 'images');
      const copiadas = campanasSp.copyRealProjectPhotos(req.body.proyecto_id, imgDir);
      if (copiadas > 0 && !p.images_dir) {
        p = store.updateCampanasSpProject(p.id, { images_dir: imgDir });
      }
    } catch (e) { console.error('[CAMPANAS-SP] copia de fotos del CRM falló:', e.message); }
  }
  res.json(p);
});

app.get('/api/campanas-sp/projects/:id', auth.requireAdmin, (req, res) => {
  const p = store.getCampanasSpProject(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'not_found' });
  res.json(p);
});

app.put('/api/campanas-sp/projects/:id', auth.requireAdmin, (req, res) => {
  const p = store.updateCampanasSpProject(Number(req.params.id), req.body);
  if (!p) return res.status(404).json({ error: 'not_found' });
  res.json(p);
});

app.delete('/api/campanas-sp/projects/:id', auth.requireAdmin, (req, res) => {
  store.deleteCampanasSpProject(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/campanas-sp/projects/:id/generate', auth.requireAdmin, async (req, res) => {
  try {
    const result = await campanasSp.generateAssets(Number(req.params.id));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Límites unificados: antes /analyze-images topaba en 10 archivos mientras upload-images
// permitía 50 — una carpeta real de fotos (>10) hacía que multer abortara TODA la petición
// con LIMIT_UNEXPECTED_FILE, que caía al handler global de errores como un 500 opaco
// "error_interno". diskStorage (en vez de memoryStorage) evita además acumular hasta
// 50×20MB en RAM contra un contenedor de 700MB (riesgo real de OOM).
const CAMPANAS_UPLOAD_MAX_FILES = 50;
const CAMPANAS_UPLOAD_MAX_SIZE = 20 * 1024 * 1024;

function requireCampanasSpProject(req, res, next) {
  const p = store.getCampanasSpProject(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'not_found' });
  req.campanasSpProject = p;
  next();
}

// Envuelve un middleware de multer para traducir sus errores a códigos claros en español
// en vez de dejarlos caer al handler global (que los colapsa a 500 "error_interno" sin
// explicar si el problema fue el tamaño, la cantidad de archivos, o algo interno.
function handleMulterErrors(uploadMiddleware) {
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'archivo_muy_grande', detalle: 'Cada imagen debe pesar menos de 20MB.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ error: 'demasiados_archivos', detalle: `Máximo ${CAMPANAS_UPLOAD_MAX_FILES} imágenes por carga.` });
        }
        return res.status(400).json({ error: 'error_subida', detalle: err.message });
      }
      console.error('[CAMPANAS-SP] error de subida:', err.message);
      res.status(500).json({ error: 'error_interno' });
    });
  };
}

function campanasFilename(originalname) {
  return Date.now() + '-' + originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Escribe directo en la carpeta persistida del proyecto (data/campanas-projects/<slug>/images
// — ver campanas-sp.js getProjectDir) — requireCampanasSpProject ya corrió antes, así que
// req.campanasSpProject está disponible dentro del callback destination.
const uploadImagesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(campanasSp.getProjectDir(req.campanasSpProject.slug), 'images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, campanasFilename(file.originalname)),
});
const uploadImages = multer({ storage: uploadImagesStorage, limits: { fileSize: CAMPANAS_UPLOAD_MAX_SIZE, files: CAMPANAS_UPLOAD_MAX_FILES } });

app.post('/api/campanas-sp/projects/:id/upload-images', auth.requireAdmin, requireCampanasSpProject, handleMulterErrors(uploadImages.array('images', CAMPANAS_UPLOAD_MAX_FILES)), asyncH(async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'no_files' });
  const p = req.campanasSpProject;
  const imgDir = path.join(campanasSp.getProjectDir(p.slug), 'images');
  const saved = req.files.map((f) => f.filename);
  // Actualizar images_dir si está vacío
  if (!p.images_dir) {
    store.updateCampanasSpProject(p.id, { images_dir: imgDir });
  }
  res.json({ ok: true, saved, count: saved.length, dir: imgDir });
}));

app.get('/api/campanas-sp/projects/:id/assets', auth.requireAdmin, (req, res) => {
  const p = store.getCampanasSpProject(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'not_found' });
  const assets = campanasSp.getAssetsBaseUrl(p);
  res.json(assets);
});

// Sirve un archivo generado individual (imagen o reel.mp4) — antes no existía NINGUNA
// forma de ver los 27 assets ni el reel desde el navegador, solo quedaban en disco.
// category/filename vienen de la URL (no confiar): regex estricto + Express sendFile
// con {root} como segunda capa de protección contra path traversal.
const CSP_FILE_SAFE = /^[a-zA-Z0-9_.-]+$/;
app.get('/api/campanas-sp/projects/:id/file/:category/:filename', auth.requireAdmin, (req, res) => {
  const p = store.getCampanasSpProject(Number(req.params.id));
  if (!p || !p.output_dir) return res.status(404).json({ error: 'not_found' });
  const { category, filename } = req.params;
  if (!CSP_FILE_SAFE.test(category) || !CSP_FILE_SAFE.test(filename)) return res.status(400).json({ error: 'nombre_invalido' });
  const root = path.resolve(p.output_dir);
  res.sendFile(path.join(category, filename), { root }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'archivo_no_encontrado' });
  });
});

// Puente Campañas SP → Meta Ads: sube assets YA GENERADOS directo desde el disco del
// servidor a la cuenta de anuncios (adimages/advideos), sin que el navegador tenga que
// bajarlos y volver a subirlos. Antes no existía ningún puente entre el generador de
// creativos y el creador de campañas — cada uno vivía aislado.
app.post('/api/meta-ads/media/from-project', auth.requireAdmin, asyncH(async (req, res) => {
  const { projectId, files } = req.body || {};
  if (!projectId || !Array.isArray(files) || !files.length) {
    return res.status(400).json({ error: 'faltan_projectId_o_files' });
  }
  if (files.length > 12) return res.status(400).json({ error: 'maximo_12_archivos' });
  const p = store.getCampanasSpProject(Number(projectId));
  if (!p || !p.output_dir) return res.status(404).json({ error: 'proyecto_no_encontrado' });

  const metaAdsSvc = require('./services/meta-ads');
  const root = path.resolve(p.output_dir);
  const results = [];
  for (const f of files) {
    const category = String(f.category || ''), filename = String(f.filename || '');
    if (!CSP_FILE_SAFE.test(category) || !CSP_FILE_SAFE.test(filename)) {
      results.push({ category, filename, error: 'nombre_invalido' });
      continue;
    }
    const filePath = path.join(root, category, filename);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      results.push({ category, filename, error: 'archivo_no_encontrado' });
      continue;
    }
    try {
      if (/\.(mp4|mov)$/i.test(filename)) {
        const buffer = fs.readFileSync(filePath);
        const up = await metaAdsSvc.uploadAdVideo(buffer, filename);
        results.push({ category, filename, type: 'video', videoId: up.videoId });
      } else {
        const base64 = fs.readFileSync(filePath).toString('base64');
        const up = await metaAdsSvc.uploadAdImage(base64);
        results.push({ category, filename, type: 'image', hash: up.hash, url: up.url });
      }
    } catch (e) {
      results.push({ category, filename, error: e.message });
    }
  }
  res.json({ ok: true, results });
}));

// Puente Campañas SP → mensajes masivos: header de imagen en una plantilla de
// WhatsApp. La Cloud API exige una URL PÚBLICA para el header (no un archivo servido
// tras sesión de admin, que WhatsApp no puede autenticar) — reusa el mismo mecanismo
// de token firmado que ya usan Messenger/Instagram (ver mediaStore.signMediaToken),
// solo que firmando un identificador compuesto en vez de un filename de MEDIA_DIR.
app.get('/api/campanas-sp/projects/:id/public-url', auth.requireAdmin, (req, res) => {
  const p = store.getCampanasSpProject(Number(req.params.id));
  if (!p || !p.output_dir) return res.status(404).json({ error: 'not_found' });
  const category = String(req.query.category || ''), filename = String(req.query.filename || '');
  if (!CSP_FILE_SAFE.test(category) || !CSP_FILE_SAFE.test(filename)) return res.status(400).json({ error: 'nombre_invalido' });
  if (!fs.existsSync(path.join(path.resolve(p.output_dir), category, filename))) return res.status(404).json({ error: 'archivo_no_encontrado' });
  const resourceId = `campanas-sp/${p.id}/${category}/${filename}`;
  const token = mediaStore.signMediaToken(resourceId);
  const base = process.env.BASE_URL || 'https://spcrm.duckdns.org';
  res.json({ url: `${base}/api/public/campanas-sp-media/${p.id}/${encodeURIComponent(category)}/${encodeURIComponent(filename)}?token=${token}` });
});

app.get('/api/public/campanas-sp-media/:id/:category/:filename', asyncH(async (req, res) => {
  const { id, category, filename } = req.params;
  if (!CSP_FILE_SAFE.test(category) || !CSP_FILE_SAFE.test(filename)) return res.status(400).json({ error: 'nombre_invalido' });
  const resourceId = `campanas-sp/${id}/${category}/${filename}`;
  if (!mediaStore.verifyMediaToken(resourceId, req.query.token)) return res.status(403).json({ error: 'token_invalido_o_expirado' });
  const p = store.getCampanasSpProject(Number(id));
  if (!p || !p.output_dir) return res.status(404).json({ error: 'not_found' });
  const root = path.resolve(p.output_dir);
  res.sendFile(path.join(category, filename), { root }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'archivo_no_encontrado' });
  });
}));

// Carpeta de escaneo temporal (fuera del proyecto — solo sirve para que Gemini categorice
// una muestra antes de guardar nada). Usa detectRoot() en vez de process.cwd(): el proceso
// puede arrancar desde un cwd distinto según cómo se lance (ver wrappers de desarrollo),
// mientras que detectRoot() siempre resuelve la raíz real de la app.
function analyzeUploadsDir() {
  return path.join(campanasSp.detectRoot(), 'data', 'uploads');
}
const uploadAnalyzeStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = analyzeUploadsDir();
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, campanasFilename(file.originalname)),
});
const uploadAnalyze = multer({ storage: uploadAnalyzeStorage, limits: { fileSize: CAMPANAS_UPLOAD_MAX_SIZE, files: CAMPANAS_UPLOAD_MAX_FILES } });

// Envía un asset ya generado (imagen o el reel.mp4) directo al chat de un lead — antes el
// botón "Compartir al chat" era solo un toast que no hacía nada. Solo WhatsApp por ahora
// (Messenger/Instagram necesitan servir el archivo por URL pública en vez de media_id; se
// añade cuando haga falta, sin bloquear esto).
app.post('/api/campanas-sp/projects/:id/share-asset', auth.requireAdmin, mediaLimiter, messageLimiter, async (req, res) => {
  const { leadId, category, filename } = req.body || {};
  if (!leadId || !category || !filename) return res.status(400).json({ error: 'faltan_datos' });
  if (!CSP_FILE_SAFE.test(category) || !CSP_FILE_SAFE.test(filename)) return res.status(400).json({ error: 'nombre_invalido' });

  const p = store.getCampanasSpProject(Number(req.params.id));
  if (!p || !p.output_dir) return res.status(404).json({ error: 'not_found' });

  const lead = store.getLeadById(leadId);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });

  const conversation = store.getConversationByLeadId ? store.getConversationByLeadId(lead.id) : null;
  const channel = conversation ? conversation.channel : 'whatsapp';
  if (channel !== 'whatsapp') {
    return res.status(400).json({ error: 'solo_whatsapp_por_ahora', detalle: 'Compartir al chat solo soporta WhatsApp por ahora.' });
  }

  const root = path.resolve(p.output_dir);
  const fp = path.join(root, category, filename);
  if (!fp.startsWith(root) || !fs.existsSync(fp)) return res.status(404).json({ error: 'archivo_no_encontrado' });

  try {
    const buffer = fs.readFileSync(fp);
    const mime = /\.mp4$/i.test(filename) ? 'video/mp4' : /\.png$/i.test(filename) ? 'image/png' : 'image/jpeg';
    const tipo = mime.startsWith('video/') ? 'video' : 'image';
    const caption = `${p.name} — Sp Leons Group`;
    const fromNumber = lead.assigned_to_phone || req.session.email || 'panel';

    const storedFilename = mediaStore.saveOutgoingMedia(buffer, mime, filename);
    const mediaId = await uploadMedia(buffer, mime, filename);
    if (!mediaId) return res.status(502).json({ error: 'error_upload', detalle: 'WhatsApp no retornó media ID' });
    await new Promise((r) => setTimeout(r, CFG.MEDIA_PROPAGATION_DELAY));
    const mediaResult = await sendMedia(lead.customer_phone, mediaId, tipo, caption, filename);
    if (!mediaResult || !mediaResult.messages || !mediaResult.messages[0]) {
      return res.status(502).json({ error: 'error_envio_whatsapp' });
    }
    const wamid = mediaResult.messages[0].id;
    store.saveMessage(lead.id, fromNumber, lead.customer_phone, caption, 'outgoing', {
      media_type: tipo, media_id: mediaId, media_mime: mime, media_filename: storedFilename,
    }, null, wamid, 'sent');
    store.setFirstResponse(lead.id);
    if (lead.status === 'nuevo' || lead.status === 'asignado') store.updateLeadStatus(lead.id, 'contactado');
    store.syncLeadToConversation(store.getLeadById(lead.id), {
      direction: 'outgoing', body: caption, fromNumber, toNumber: lead.customer_phone,
      media: { media_type: tipo, media_id: null, media_mime: mime, media_filename: null },
    });
    events.emitToVendedor(lead.assigned_to_id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    events.emitToAdmins('nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    res.json({ ok: true });
  } catch (e) {
    console.error('[CAMPANAS-SP] compartir al chat falló:', e.message);
    res.status(502).json({ error: 'error_envio', detalle: e.message });
  }
});

app.post('/api/campanas-sp/analyze-images', auth.requireAdmin, handleMulterErrors(uploadAnalyze.array('images', CAMPANAS_UPLOAD_MAX_FILES)), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'no_files' });
  try {
    // Alcanza con una muestra — ai_generator.py ya trunca a las primeras 5 igual (analyze
    // solo sirve para sugerir nombre/ubicación/categorías, no para el set completo).
    const sample = req.files.slice(0, 5).map((f) => f.path);
    const result = await campanasSp.analyzeImages(sample);
    res.json(result);
  } catch (e) {
    console.error('[VISION]', e.message);
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/campanas-sp/auto-fill/:proyectoId', auth.requireAdmin, (req, res) => {
  const data = campanasSp.autoFillFromCRM(req.params.proyectoId);
  res.json(data);
});

// ===================== REPORTES Y ANALYTICS =====================
// team-performance/pipeline-conversion/channel-distribution/response-times/csat/
// hourly-distribution se quitaron: 0 referencias en el frontend, nunca se consumían
// (confirmado por grep sobre public/). lead-sources sí lo usa dashboard.html — se
// conserva. El export de leads quedó unificado en /api/leads/export.csv (usado por
// reportes.html); getExportCSV() de este servicio la reutiliza /api/privacidad/exportar.

app.get('/api/reports/lead-sources', auth.requireAdmin, (req, res) => {
  const { from, to } = req.query;
  res.json(require('./services/reports').getLeadSources(from, to));
});

// La familia /api/calls/* (click-to-call por Twilio) y su webhook de status se
// quitaron — 0 referencias en el frontend, ningún botón del panel llegó a llamarla.
// Bloqueada además en VIDA_ESTADO_Y_PLAN.md ("Llamadas de WhatsApp — BLOQUEADO por
// Meta"), así que tampoco había un plan activo de conectarla.

// ===================== WORKFLOWS (automatización IF/THEN) =====================

// Admin/jefe ven todos los flujos: los globales de la empresa y, como registro, los
// privados de cada asesor (?vendedorId=N para filtrar por uno, ?soloGlobales=1 para
// esconder los de asesores).
app.get('/api/workflows', auth.requireSupervisorOrAdmin, (req, res) => res.json(store.getAllWorkflows({
  vendedorId: req.query.vendedorId != null && req.query.vendedorId !== '' ? Number(req.query.vendedorId) : undefined,
  soloGlobales: req.query.soloGlobales === '1',
})));

app.get('/api/workflows/:id', auth.requireAdmin, (req, res) => {
  const workflow = store.getWorkflowById(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'workflow_no_existe' });
  res.json(workflow);
});

// Acepta el grafo del editor visual ({nodes,edges}) o, para compatibilidad con
// integraciones viejas, el formato lineal (trigger_event/conditions/actions) —
// createWorkflow() infiere trigger_event desde el nodo trigger del grafo si no
// viene explícito.
app.post('/api/workflows', auth.requireAdmin, (req, res) => {
  const { nombre, activo, trigger_event, conditions, actions, graph } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'nombre_requerido' });
  if (!trigger_event && !(graph && Array.isArray(graph.nodes) && graph.nodes.some(n => n.type === 'trigger'))) {
    return res.status(400).json({ error: 'falta_disparador', message: 'El flujo necesita un trigger_event o un nodo de disparador en el grafo' });
  }
  const workflow = store.createWorkflow({ nombre, activo, trigger_event, conditions, actions, graph });
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

// Admin y jefe consultan el historial de cualquier flujo, incluidos los de los asesores
// (es el registro que pidió el negocio); el asesor solo el de los suyos.
app.get('/api/workflows/:id/logs', auth.requireAuth, (req, res) => {
  const wf = store.getWorkflowById(req.params.id);
  if (!wf) return res.status(404).json({ error: 'workflow_no_existe' });
  if (!auth.esAccesoGlobal(req) && Number(wf.vendedor_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  res.json(store.getWorkflowLogs(req.params.id));
});

// ───────────── Automatizaciones PROPIAS del asesor ─────────────
// Cada asesor arma sus reglas desde el celular. Solo corren sobre SUS leads (guard
// aplicaAlDueno en el motor) y solo con acciones que no salen de su ámbito: nada de
// webhooks, reasignar a terceros ni notificar a toda la empresa.
const ACCIONES_ASESOR = [
  'send_message', 'send_template', 'tag', 'set_etapa', 'crear_tarea', 'crear_cita',
  'nota_interna', 'marcar_temperatura', 'posponer', 'iniciar_cadencia', 'detener_cadencia',
  'notificar_asesor',
];
const TRIGGERS_ASESOR = [
  'message:incoming', 'message:outgoing', 'conversation:assigned', 'conversation:closed',
  'lead:tag_changed', 'lead:inactive', 'button:clicked', 'cita:creada', 'tarea:vencida',
  'lead:caliente', 'campana:finalizada',
];

// Valida que un grafo de asesor no use acciones fuera de su ámbito. Devuelve el motivo
// del rechazo, o null si está bien.
function validarGrafoAsesor(graph, triggerEvent) {
  if (triggerEvent && !TRIGGERS_ASESOR.includes(triggerEvent)) {
    return `El disparador "${triggerEvent}" no está disponible para automatizaciones personales.`;
  }
  const nodos = (graph && Array.isArray(graph.nodes)) ? graph.nodes : [];
  for (const n of nodos) {
    if (n.type === 'trigger' && !TRIGGERS_ASESOR.includes(n.subtype)) {
      return `El disparador "${n.subtype}" no está disponible para automatizaciones personales.`;
    }
    if (n.type === 'action' && !ACCIONES_ASESOR.includes(n.subtype)) {
      return `La acción "${n.subtype}" solo la puede usar un administrador.`;
    }
    // Un asesor no puede dirigir acciones a otro asesor: se fuerza al dueño del lead.
    if (n.type === 'action' && n.params) delete n.params.vendedorId;
  }
  return null;
}

app.get('/api/mis-automatizaciones', auth.requireAuth, (req, res) => {
  if (!req.session.vendedorId) return res.json([]);
  res.json(store.getAllWorkflows({ vendedorId: req.session.vendedorId }));
});

app.post('/api/mis-automatizaciones', auth.requireAuth, (req, res) => {
  if (!req.session.vendedorId) return res.status(400).json({ error: 'sin_vendedor_asociado' });
  const { nombre, activo, trigger_event, graph } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'nombre_requerido' });
  const trigger = trigger_event || (graph && (graph.nodes || []).find(n => n.type === 'trigger') || {}).subtype;
  if (!trigger) return res.status(400).json({ error: 'falta_disparador' });
  const motivo = validarGrafoAsesor(graph, trigger);
  if (motivo) return res.status(400).json({ error: 'accion_no_permitida', detalle: motivo });
  const workflow = store.createWorkflow({ nombre, activo, trigger_event: trigger, graph, vendedorId: req.session.vendedorId });
  require('./services/workflow').loadRules();
  res.json(workflow);
});

app.put('/api/mis-automatizaciones/:id', auth.requireAuth, (req, res) => {
  const wf = store.getWorkflowById(req.params.id);
  if (!wf) return res.status(404).json({ error: 'workflow_no_existe' });
  if (Number(wf.vendedor_id) !== Number(req.session.vendedorId)) return res.status(403).json({ error: 'sin_permiso' });
  const { graph, trigger_event } = req.body || {};
  const motivo = validarGrafoAsesor(graph, trigger_event);
  if (motivo) return res.status(400).json({ error: 'accion_no_permitida', detalle: motivo });
  const workflow = store.updateWorkflow(wf.id, req.body || {});
  require('./services/workflow').loadRules();
  res.json(workflow);
});

app.delete('/api/mis-automatizaciones/:id', auth.requireAuth, (req, res) => {
  const wf = store.getWorkflowById(req.params.id);
  if (!wf) return res.status(404).json({ error: 'workflow_no_existe' });
  if (Number(wf.vendedor_id) !== Number(req.session.vendedorId)) return res.status(403).json({ error: 'sin_permiso' });
  store.deleteWorkflow(wf.id);
  require('./services/workflow').loadRules();
  res.json({ ok: true });
});

// Dry-run: corre el grafo con un contexto de ejemplo (o el que mande el editor) SIN
// ejecutar efectos reales — el botón "Probar" del canvas colorea los nodos con esta
// traza antes de que el admin active el flujo de verdad.
app.post('/api/workflows/:id/test', auth.requireAdmin, asyncH(async (req, res) => {
  const workflow = store.getWorkflowById(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'workflow_no_existe' });
  const contextIn = req.body && req.body.context;
  const context = contextIn && contextIn.conversation ? contextIn : {
    conversation: { id: 0, channel: 'whatsapp', etiqueta: 'interesado', status: 'asignado', priority: 'normal', assigned_to_id: null, lead_id: null, customer_id: null },
    customer: { name: 'Cliente de prueba' },
    // Lead simulado: las acciones de CRM (etapa, tarea, cita, nota) exigen uno, y sin
    // esto el dry-run de cualquier flujo nuevo fallaba con "necesita un lead".
    lead: { id: 0, customer_name: 'Cliente de prueba', customer_phone: '+573000000000', etiqueta: 'interesado', proyecto: 'Proyecto de prueba', assigned_to_id: null, assigned_to_nombre: 'Asesor de prueba' },
    message: { body: (contextIn && contextIn.body) || 'Mensaje de prueba', buttonPayload: (contextIn && contextIn.buttonPayload) || '' },
  };
  const result = await require('./services/workflow').dryRun(workflow, context);
  res.json(result);
}));

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

// ===================== USUARIOS (admin) ===================== (Fase 4: extraído a
// src/routes/usuarios.js)
app.use('/api/usuarios', auth.requireAdmin, require('./routes/usuarios'));

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
  const { phone, name, message, referral } = req.body;
  const customerPhone = phone || '+573001234500';
  const customerName = name || 'Cliente Prueba';
  const messageBody = message || 'Hola, me interesa recibir información sobre los lotes.';

  const fakeMessage = {
    from: customerPhone,
    id: 'test_' + Date.now(),
    type: 'text',
    text: { body: messageBody },
  };
  // referral (F1, solo pruebas): simula un clic en anuncio de Meta Ads para verificar la
  // atribución sin esperar tráfico real. { ad_id, ad_name, source_url, ctwa_clid } opcionales.
  if (referral) {
    fakeMessage.referral = {
      source_id: referral.ad_id,
      headline: referral.ad_name,
      source_url: referral.source_url,
      ctwa_clid: referral.ctwa_clid,
    };
  }

  const fakePayload = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: process.env.PHONE_NUMBER_ID },
          contacts: [{ profile: { name: customerName }, wa_id: customerPhone }],
          messages: [fakeMessage],
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
  const { vendedorPhone, message } = req.body || {};
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
  res.json(store.all('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50'));
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

// DELETE /api/vendedores/:id — Fase 4: movido a routes/vendedores.js

// /api/admin/export/leads se quitó — duplicaba /api/leads/export.csv (el que sí
// usa reportes.html) sin ningún botón propio en el frontend.

// Escalation check — sistema inteligente
// Meta Ads: recomendaciones de severidad 3 (gasto sin resultados) — las únicas lo
// bastante urgentes como para interrumpir al admin sin que las pida. El resto
// (ganadora, CPL alto, fatiga, infrautilizada) solo se ven al entrar al panel.
async function checkMetaAdsAlertas() {
  const metaAds = require('./services/meta-ads');
  if (!metaAds.isConfigured()) return;
  const recs = await require('./services/meta-ads-advisor').getRecommendations();
  const criticas = recs.filter(r => r.severidad === 3);
  for (const r of criticas) {
    await notify({
      vendedorId: 0, tipo: 'meta_ads_alerta', push: true,
      titulo: `Meta Ads: ${r.campaignName}`,
      cuerpo: r.mensaje,
    });
    try {
      require('./services/activity').log({
        tipo: 'meta_ads_alerta', categoria: 'marketing',
        titulo: `Alerta en "${r.campaignName}"`, descripcion: r.mensaje,
        entidadTipo: 'meta_ads_campaign', entidadId: r.campaignId,
        payload: { tipo: r.tipo, accion: r.accion },
      });
    } catch (e) { /* feed opcional */ }
  }
}

async function checkEscalation() {
  try {
    const ESC_ALERTA_MIN = Number(process.env.ESC_ALERTA_MIN || store.getConfig('escalation_alerta_min') || 15);
    const ESC_REASIGNAR_MIN = Number(process.env.ESC_REASIGNAR_MIN || store.getConfig('escalation_reasignar_min') || 30);
    const ESC_ADMIN_MIN = Number(process.env.ESC_ADMIN_MIN || store.getConfig('escalation_admin_min') || 60);
    const ESC_ASENTADO_HORAS = Number(process.env.ESC_ASENTADO_HORAS || store.getConfig('escalation_asentado_horas') || 24);
    const ahora = Date.now();
    const leadsSinRespuesta = getLeadsSinRespuesta(0); // todos los sin respuesta

    for (const lead of leadsSinRespuesta) {
      // Determinar tipo de lead
      const esNuevo = !lead.first_response_at;
      const creadoEnDate = parseLocalDbTime(lead.created_at);
      const creadoEn = creadoEnDate ? creadoEnDate.getTime() : ahora;
      const minutosDesdeCreacion = (ahora - creadoEn) / 60000;
      const horasDesdeCreacion = minutosDesdeCreacion / 60;
      const esAsentado = horasDesdeCreacion >= ESC_ASENTADO_HORAS;

      // Saltar leads asentados (más de 24h con el mismo vendedor) — no se reasignan
      if (esAsentado && lead.escalation_level > 0) continue;

      // ===== 15 min (o configurable) — ALERTA al vendedor =====
      if (minutosDesdeCreacion >= ESC_ALERTA_MIN && lead.escalation_level < 1) {
        incrementEscalation(lead.id);
        console.log(`[ESCALADO] Alerta ${ESC_ALERTA_MIN}min lead ${lead.id} (${lead.customer_name})`);
        try {
          require('./services/activity').logTiempoObjetivo({
            leadId: lead.id, customerName: lead.customer_name, minutos: ESC_ALERTA_MIN, tipo: 'escalamiento',
          });
        } catch (e) { /* feed opcional */ }
        if (lead.assigned_to_id) {
          notify({
            vendedorId: lead.assigned_to_id, tipo: 'escalamiento_alerta', leadId: lead.id, push: true,
            titulo: '⏰ Lead sin responder',
            cuerpo: `Llevas ${ESC_ALERTA_MIN} min sin responder a ${lead.customer_name}.`,
          }).catch(() => {});
        }
        if (lead.assigned_to_phone) {
          await sendMessage(lead.assigned_to_phone,
            `⏰ Alerta Leons Group\nLlevas ${ESC_ALERTA_MIN} min sin responder a ${lead.customer_name} (${lead.customer_phone}).\nPor favor responde lo antes posible.`
          ).catch(e => console.error('[ESCALADO] Error al enviar alerta 15min:', e.message));
        }
        continue;
      }

      // ===== 30 min (o configurable) — REASIGNAR solo leads NUEVOS =====
      if (minutosDesdeCreacion >= ESC_REASIGNAR_MIN && lead.escalation_level < 2) {
        incrementEscalation(lead.id);
        if (esNuevo && !esAsentado) {
          console.log(`[ESCALADO] Reasignando lead ${lead.id} (${lead.customer_name}) — ${ESC_REASIGNAR_MIN} min sin respuesta`);
          const activos = getVendedoresActivos().filter(v => v.id !== lead.assigned_to_id);
          // Prefiere un vendedor que cubra la zona del lead (F-zonas); si nadie la cubre,
          // cae en preferir al que ya atiende el mismo proyecto/ciudad/origen (si la carga
          // está casi empatada) en vez de repartir estrictamente por menor carga.
          const { vendedor: otroVendedor, fuente: fuenteReasig } = require('./services/zonas').elegirVendedor(activos, { zona: lead.zona, proyecto: lead.proyecto, ciudad: lead.ciudad, origen: lead.origen });
          if (fuenteReasig === 'fallback') store.setLeadZonaFuente(lead.id, 'fallback');
          if (otroVendedor && lead.assigned_to_id) {
            const vendedorAnterior = lead.assigned_to_id;
            store.reassignLead(lead.id, otroVendedor, vendedorAnterior);
            // Notificar a AMBOS vendedores
            events.emitToVendedor(otroVendedor.id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'reasignado_automatico', ts: Date.now() });
            events.emitToVendedor(vendedorAnterior, 'nuevo_mensaje', { leadId: lead.id, tipo: 'reasignado_automatico', ts: Date.now() });
            events.emitToAdmins('lead_actualizado', { leadId: lead.id, tipo: 'reasignado_automatico', ts: Date.now() });
            try {
              require('./services/activity').logReasignacion({
                leadId: lead.id, customerName: lead.customer_name,
                de: vendedorAnterior ? (getVendedores().find(v => Number(v.id) === Number(vendedorAnterior)) || {}).nombre : null,
                a: otroVendedor.nombre, automatica: true,
              });
            } catch (e) { /* feed opcional */ }
            notify({ vendedorId: otroVendedor.id, tipo: 'lead_reasignado', leadId: lead.id, push: true,
              titulo: '🆕 Lead reasignado a ti', cuerpo: `${lead.customer_name} (${lead.customer_phone}) — responde lo antes posible.` }).catch(() => {});
            notify({ vendedorId: vendedorAnterior, tipo: 'lead_reasignado', leadId: lead.id, push: true,
              titulo: '🔄 Lead reasignado', cuerpo: `${lead.customer_name} pasó a otro asesor por falta de respuesta.` }).catch(() => {});
            notify({ vendedorId: 0, tipo: 'lead_reasignado', leadId: lead.id,
              titulo: '🔄 Reasignación automática', cuerpo: `${lead.customer_name} pasó a ${otroVendedor.nombre} (${ESC_REASIGNAR_MIN} min sin respuesta).` }).catch(() => {});
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
            try {
              require('./services/activity').logTiempoObjetivo({
                leadId: lead.id, customerName: lead.customer_name, minutos: ESC_REASIGNAR_MIN, tipo: 'sin_vendedores',
              });
            } catch (e) { /* feed opcional */ }
            notify({ vendedorId: 0, tipo: 'escalamiento_critico', leadId: lead.id, push: true,
              titulo: '⚠️ Lead sin atender', cuerpo: `${lead.customer_name} lleva ${ESC_REASIGNAR_MIN} min esperando y no hay otros asesores disponibles.` }).catch(() => {});
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
              `⚠️ ALERTA Leons Group\n${lead.customer_name} (${lead.customer_phone}) lleva ${ESC_REASIGNAR_MIN} min sin respuesta.\nEs un cliente recurrente — prioriza su atención.`
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
        try {
          require('./services/activity').logTiempoObjetivo({
            leadId: lead.id, customerName: lead.customer_name,
            minutos: Math.round(minutosDesdeCreacion), tipo: 'admin',
          });
        } catch (e) { /* feed opcional */ }
        notify({ vendedorId: 0, tipo: 'escalamiento_admin', leadId: lead.id, push: true,
          titulo: '🚨 Escalamiento a admin', cuerpo: `${lead.customer_name} lleva ${Math.round(minutosDesdeCreacion)} min sin respuesta.` }).catch(() => {});
        // Si es nuevo y no se reasignó antes, intentar reasignar ahora
        if (esNuevo && !esAsentado) {
          const activos = getVendedoresActivos().filter(v => v.id !== lead.assigned_to_id);
          const { vendedor: otroVendedor, fuente: fuenteReasig } = require('./services/zonas').elegirVendedor(activos, { zona: lead.zona, proyecto: lead.proyecto, ciudad: lead.ciudad, origen: lead.origen });
          if (fuenteReasig === 'fallback') store.setLeadZonaFuente(lead.id, 'fallback');
          if (otroVendedor && lead.assigned_to_id) {
            const vendedorAnterior = lead.assigned_to_id;
            store.reassignLead(lead.id, otroVendedor, vendedorAnterior);
            events.emitToVendedor(otroVendedor.id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'reasignado_automatico', ts: Date.now() });
            events.emitToVendedor(vendedorAnterior, 'nuevo_mensaje', { leadId: lead.id, tipo: 'reasignado_automatico', ts: Date.now() });
            events.emitToAdmins('lead_actualizado', { leadId: lead.id, tipo: 'reasignado_automatico', ts: Date.now() });
            try {
              require('./services/activity').logReasignacion({
                leadId: lead.id, customerName: lead.customer_name,
                de: vendedorAnterior ? (getVendedores().find(v => Number(v.id) === Number(vendedorAnterior)) || {}).nombre : null,
                a: otroVendedor.nombre, automatica: true,
              });
            } catch (e) { /* feed opcional */ }
            notify({ vendedorId: otroVendedor.id, tipo: 'lead_reasignado', leadId: lead.id, push: true,
              titulo: '🆕 Lead reasignado a ti (urgente)', cuerpo: `${lead.customer_name} — ya pasaron ${ESC_ADMIN_MIN} min sin respuesta.` }).catch(() => {});
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
function isValidPinHash(pin) {
  if (!pin || typeof pin !== 'string') return false;
  const idx = pin.indexOf(':');
  if (idx < 1) return false;
  const salt = pin.slice(0, idx);
  const hash = pin.slice(idx + 1);
  return salt.length === 32 && hash.length === 128 && /^[0-9a-f]+$/i.test(salt) && /^[0-9a-f]+$/i.test(hash);
}

function sanitizeAllPins() {
  const DEFAULT_PIN = '0000';
  const vendedores = store.getVendedores ? store.getVendedores() : [];
  let fixed = 0;
  for (const v of vendedores) {
    if (!v.pin) {
      store.setVendedorPin(v.id, auth.hashPassword(DEFAULT_PIN));
      console.log(`[PIN-SANITIZE] ${v.nombre} (${v.telefono}) — sin PIN, reseteado al PIN por defecto`);
      fixed++;
    } else if (!isValidPinHash(v.pin)) {
      store.setVendedorPin(v.id, auth.hashPassword(DEFAULT_PIN));
      console.log(`[PIN-SANITIZE] ${v.nombre} (${v.telefono}) — PIN corrupto, reseteado al PIN por defecto`);
      fixed++;
    }
  }
  if (fixed > 0) console.log(`[PIN-SANITIZE] ${fixed} PIN(s) corregidos al arrancar`);
}

function ensureAdminUser() {
  const ADMIN_PHONE = process.env.ADMIN_PHONE || '+573214625618';
  const ADMIN_PIN = process.env.ADMIN_PIN || '0000';
  const email = (process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || 'admin@spinmobiliaria.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'changeme123';
  if (['changeme123', 'cambiar123'].includes(password)) {
    console.warn('⚠ ADMIN_PASSWORD sigue en el valor por defecto — cámbialo en .env (el panel exigirá cambio al iniciar sesión)');
  }

  // Crear admin user si no existe ninguno
  if (store.countUsuarios() === 0) {
    store.createUsuario(email, auth.hashPassword(password), 'Administrador', 'admin', null);
    console.log('===========================================');
    console.log('Usuario ADMIN inicial creado:');
    console.log(`  Email:    ${email}`);
    console.log('  Password: (ver ADMIN_PASSWORD en .env)');
    console.log('  (cámbialo en .env: ADMIN_EMAIL / ADMIN_PASSWORD)');
    console.log('===========================================');
  }

  // Asegurar vendedor admin con el número oficial + PIN 0000
  let vendedorAdmin = store.getVendedorByTelefono(ADMIN_PHONE);
  if (!vendedorAdmin) {
    const vId = store.addVendedor('Administrador', ADMIN_PHONE);
    store.setVendedorPin(vId, auth.hashPassword(ADMIN_PIN));
    vendedorAdmin = store.getVendedorByTelefono(ADMIN_PHONE);
    console.log(`Vendedor admin creado: ${ADMIN_PHONE} (ver ADMIN_PIN en .env)`);
  } else if (!isValidPinHash(vendedorAdmin.pin)) {
    store.setVendedorPin(vendedorAdmin.id, auth.hashPassword(ADMIN_PIN));
    console.log('PIN reset para admin (formato inválido) — ver ADMIN_PIN en .env');
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

// Crea el usuario supervisor inicial + vendedor supervisor (opcional, vía .env).
// Patrón idéntico a ensureAdminUser(): lee SUPERVISOR_PHONE / SUPERVISOR_PIN / SUPERVISOR_NAME
// del entorno. Si SUPERVISOR_PHONE no está definido, esta función no hace nada — el flujo
// principal de creación de supervisores es el autoregistro desde /login.html con aprobación
// del admin. Este bootstrap solo existe para tener un primer supervisor listo el día del
// despliegue sin depender de ese flujo (útil para pruebas iniciales del Sprint 1).
function ensureSupervisor() {
  const SUPERVISOR_PHONE = process.env.SUPERVISOR_PHONE;
  const SUPERVISOR_PIN = process.env.SUPERVISOR_PIN || '0000';
  const SUPERVISOR_NAME = process.env.SUPERVISOR_NAME || 'Supervisor';
  if (!SUPERVISOR_PHONE) return; // No hay bootstrap de supervisor por .env — ok.
  if (!/^\+57\d{10}$/.test(SUPERVISOR_PHONE)) {
    console.warn('⚠ SUPERVISOR_PHONE malformado (esperado +57 + 10 dígitos) — se omite el bootstrap de supervisor');
    return;
  }
  let vendedorSup = store.getVendedorByTelefono(SUPERVISOR_PHONE);
  if (!vendedorSup) {
    const vId = store.addVendedor(SUPERVISOR_NAME, SUPERVISOR_PHONE);
    store.setVendedorPin(vId, auth.hashPassword(SUPERVISOR_PIN));
    vendedorSup = store.getVendedorByTelefono(SUPERVISOR_PHONE);
    console.log(`Vendedor supervisor creado: ${SUPERVISOR_PHONE} (ver SUPERVISOR_PIN en .env — cambiar tras primer login)`);
  } else if (!vendedorSup.pin) {
    store.setVendedorPin(vendedorSup.id, auth.hashPassword(SUPERVISOR_PIN));
    console.log('PIN reset para supervisor — ver SUPERVISOR_PIN en .env');
  }
  // Crear la fila en usuarios.rol='supervisor' vinculada al vendedor, si no existe ya.
  const usuarioSup = store.getUsuarioByVendedorId(vendedorSup.id);
  if (!usuarioSup) {
    const emailSup = `supervisor+${vendedorSup.id}@spinmobiliaria.com`;
    store.createUsuario(emailSup, null, SUPERVISOR_NAME, 'supervisor', vendedorSup.id);
    console.log(`Usuario supervisor creado y vinculado a vendedor ID ${vendedorSup.id}`);
  } else if (usuarioSup.rol !== 'supervisor') {
    // Promover si ya existía como vendedor puro (sin rol especial).
    store.updateUsuarioRol(usuarioSup.id, 'supervisor');
    console.log(`Vendedor ID ${vendedorSup.id} promovido a supervisor`);
  }
}

// Crea el usuario jefe inicial (Sergio Parra) vía .env, mismo patrón que ensureSupervisor.
function ensureJefe() {
  const JEFE_PHONE = process.env.JEFE_PHONE;
  const JEFE_PIN = process.env.JEFE_PIN || '0000';
  const JEFE_NAME = process.env.JEFE_NAME || 'Sergio Parra';
  if (!JEFE_PHONE) return;
  if (!/^\+57\d{10}$/.test(JEFE_PHONE)) {
    console.warn('⚠ JEFE_PHONE malformado (esperado +57 + 10 dígitos) — se omite el bootstrap de jefe');
    return;
  }
  let vendedorJefe = store.getVendedorByTelefono(JEFE_PHONE);
  if (!vendedorJefe) {
    const vId = store.addVendedor(JEFE_NAME, JEFE_PHONE);
    store.setVendedorPin(vId, auth.hashPassword(JEFE_PIN));
    vendedorJefe = store.getVendedorByTelefono(JEFE_PHONE);
    console.log(`Vendedor jefe creado: ${JEFE_PHONE} (ver JEFE_PIN en .env — cambiar tras primer login)`);
  } else if (!vendedorJefe.pin) {
    store.setVendedorPin(vendedorJefe.id, auth.hashPassword(JEFE_PIN));
    console.log('PIN reset para jefe — ver JEFE_PIN en .env');
  }
  const usuarioJefe = store.getUsuarioByVendedorId(vendedorJefe.id);
  if (!usuarioJefe) {
    const emailJefe = `jefe+${vendedorJefe.id}@spinmobiliaria.com`;
    store.createUsuario(emailJefe, null, JEFE_NAME, 'jefe', vendedorJefe.id);
    console.log(`Usuario jefe creado y vinculado a vendedor ID ${vendedorJefe.id}`);
  } else if (usuarioJefe.rol !== 'jefe') {
    store.updateUsuarioRol(usuarioJefe.id, 'jefe');
    console.log(`Vendedor ID ${vendedorJefe.id} promovido a jefe`);
  }
}

// ===================== FASE 1 — RESERVAS, LEAD SCORING, TIMELINE =====================
const reservas = require('./services/reservas');
const leadScoring = require('./services/lead-scoring');
const timeline = require('./services/timeline');

// --- Reservas --- (Fase 4: rutas extraídas a src/routes/reservas.js; el require de
// arriba se queda porque el scheduler de más abajo también usa reservas.verificarVencidas())
app.use('/api/reservas', auth.requireAuth, require('./routes/reservas'));

// --- Lead Scoring ---
app.get('/api/leads/:id/score', auth.requireAuth, (req, res) => {
  const s = leadScoring.obtenerScore(Number(req.params.id));
  res.json(s || { score: 0, factors: {} });
});

app.get('/api/leads/calientes', auth.requireAdmin, (req, res) => {
  const limite = Number(req.query.limite) || 20;
  res.json(leadScoring.leadsCalientes(limite));
});

app.post('/api/leads/recalcular-scores', auth.requireAdmin, (req, res) => {
  const count = leadScoring.recalcularTodos();
  res.json({ ok: true, recalculados: count });
});

// --- Timeline / Centro de Notificaciones ---
app.get('/api/events', auth.requireAuth, (req, res) => {
  const { tipo, categoria, entidad, desde, limite, soloNoLeidos } = req.query;
  res.json(timeline.obtenerEventos({
    tipo, categoria, entidad, desde,
    limite: Number(limite) || 50,
    soloNoLeidos: soloNoLeidos === '1',
  }));
});

app.get('/api/events/unread-count', auth.requireAuth, (req, res) => {
  res.json({ count: timeline.contarNoLeidos() });
});

app.post('/api/events/:id/read', auth.requireAuth, (req, res) => {
  timeline.marcarLeido(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/events/read-all', auth.requireAuth, (req, res) => {
  timeline.marcarTodosLeidos();
  res.json({ ok: true });
});

// ===================== FASE 2 — SP INTELLIGENCE, WORKFLOWS, FINANZAS =====================
const intelligence = require('./services/intelligence');

// --- SP Intelligence ---
app.get('/api/intelligence/insights', auth.requireAdmin, async (req, res) => {
  try {
    const r = await intelligence.obtenerInsights();
    res.json(r);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/intelligence/datos', auth.requireAdmin, (req, res) => {
  res.json({
    operacion: intelligence.getDatosOperacion(),
    vendedores: intelligence.getDatosVendedores(),
  });
});

// /api/workflows/:id/executions se quitó — duplicaba exactamente /api/workflows/:id/logs
// (misma tabla, misma query). El editor visual usa /logs.

// --- Centro Financiero --- (Fase 4: extraído a src/routes/finanzas.js, mismo patrón
// que routes/meta-ads.js — sin cambiar comportamiento, solo mover y montar con app.use)
app.use('/api/finanzas', auth.requireAdmin, require('./routes/finanzas'));

// ===================== FASE 3 — DOCS, IA AGENTS =====================
// (Fase 4: ambos extraídos a src/routes/ — mismo patrón que routes/meta-ads.js)
app.use('/api/documentos', auth.requireAuth, require('./routes/documentos'));
app.use('/api/ai-agents', auth.requireAuth, require('./routes/ai-agents'));

// El Centro de Reputación (/api/reputacion/*) y el Dashboard Builder (/api/dashboard/*)
// se quitaron — 0 referencias en el frontend, ninguna pantalla los llegó a consumir.

// ===================== VID.A — PANEL DE PLATAFORMA (V2) =====================
// Separado a propósito de la autenticación de cada negocio (auth.js/sessions): un
// platform_admin puede ver/crear/suspender TODOS los negocios, así que su sesión NO
// puede vivir en la misma tabla que usa cualquier admin de un solo negocio.
const platformDb = require('./db/platform');
const vidaProvision = require('./services/vida-provision');
const PLATFORM_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días — panel de uso esporádico

function requirePlatformAdmin(req, res, next) {
  const cookie = req.headers['cookie'] || '';
  const match = cookie.match(/(?:^|;\s*)sp_platform_session=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;
  const session = token ? platformDb.getPlatformSession(token) : null;
  if (!session || Date.now() - session.created_at > PLATFORM_SESSION_TTL_MS) {
    return res.status(401).json({ error: 'no_autenticado' });
  }
  req.platformAdminId = session.admin_id;
  next();
}

app.post('/api/plataforma/login', (req, res) => {
  const { email, password } = req.body || {};
  const admin = email ? platformDb.getPlatformAdminByEmail(email) : null;
  if (!admin || !auth.verifyPassword(password, admin.password)) {
    return res.status(401).json({ error: 'credenciales_invalidas' });
  }
  const token = require('crypto').randomBytes(32).toString('hex');
  platformDb.createPlatformSession(token, admin.id);
  const secure = (process.env.SECURE_COOKIES === 'true' || req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sp_platform_session=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(PLATFORM_SESSION_TTL_MS / 1000)}; SameSite=Lax${secure}`);
  res.json({ ok: true, nombre: admin.nombre });
});

app.post('/api/plataforma/logout', requirePlatformAdmin, (req, res) => {
  const cookie = req.headers['cookie'] || '';
  const match = cookie.match(/(?:^|;\s*)sp_platform_session=([^;]+)/);
  if (match) platformDb.deletePlatformSession(decodeURIComponent(match[1]));
  res.setHeader('Set-Cookie', 'sp_platform_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  res.json({ ok: true });
});

// Lista de negocios + salud básica (último mensaje, tamaño de BD) — sin credenciales.
app.get('/api/plataforma/empresas', requirePlatformAdmin, (req, res) => {
  const empresas = platformDb.getEmpresas();
  const conSalud = empresas.map(e => {
    let dbSizeBytes = 0;
    try { dbSizeBytes = fs.statSync(e.db_path).size; } catch (err) { /* aún no tiene .db propio (no debería pasar tras provisionar) */ }
    return { ...e, db_size_bytes: dbSizeBytes };
  });
  res.json(conSalud);
});

app.post('/api/plataforma/empresas', requirePlatformAdmin, async (req, res) => {
  const { nombre, admin_telefono, admin_pin, admin_nombre } = req.body || {};
  if (!nombre || !admin_telefono || !/^\d{4}$/.test(String(admin_pin || ''))) {
    return res.status(400).json({ error: 'faltan_datos', detalle: 'nombre, admin_telefono y admin_pin (4 dígitos) son requeridos' });
  }
  try {
    const empresa = await vidaProvision.provisionEmpresa(nombre, { telefono: admin_telefono, pin: admin_pin, nombre: admin_nombre });
    res.json({ ok: true, empresa });
  } catch (e) {
    console.error('[PLATAFORMA] Error aprovisionando empresa:', e.message);
    res.status(500).json({ error: 'error_aprovisionando', detalle: e.message });
  }
});

app.post('/api/plataforma/empresas/:id/estado', requirePlatformAdmin, (req, res) => {
  platformDb.setEmpresaActivo(req.params.id, !!(req.body && req.body.activo));
  res.json({ ok: true });
});

// Conectar un canal (WhatsApp/Messenger/Instagram) a un negocio — el token se cifra
// antes de tocar disco, nunca se guarda en claro (ver services/crypto-vault).
app.post('/api/plataforma/empresas/:id/canales', requirePlatformAdmin, (req, res) => {
  const { canal, canal_id, token, extra } = req.body || {};
  if (!canal || !canal_id || !token) return res.status(400).json({ error: 'faltan_datos' });
  try {
    const cryptoVault = require('./services/crypto-vault');
    platformDb.addEmpresaCanal(req.params.id, canal, canal_id, cryptoVault.encrypt(token), extra);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'error_guardando', detalle: e.message });
  }
});

app.get('/api/plataforma/empresas/:id/canales', requirePlatformAdmin, (req, res) => {
  res.json(platformDb.getCanalesByEmpresa(req.params.id)); // sin token — solo metadata
});

app.get('/api/plataforma/me', requirePlatformAdmin, (req, res) => {
  res.json({ ok: true, adminId: req.platformAdminId });
});

// Bootstrap: primer platform_admin, igual de patrón que ensureAdminUser() pero en su
// propia tabla — VIDA_PLATFORM_EMAIL/VIDA_PLATFORM_PASSWORD en .env, o un default con
// warning (mismo espíritu que ADMIN_PASSWORD).
function ensurePlatformAdmin() {
  if (platformDb.countPlatformAdmins() > 0) return;
  const email = (process.env.VIDA_PLATFORM_EMAIL || 'fundador@vida.app').toLowerCase();
  const password = process.env.VIDA_PLATFORM_PASSWORD || 'cambiar-vida-123';
  if (password === 'cambiar-vida-123') {
    console.warn('⚠ VIDA_PLATFORM_PASSWORD sigue en el valor por defecto — cámbialo en .env');
  }
  platformDb.createPlatformAdmin(email, auth.hashPassword(password), 'Fundador');
  console.log('===========================================');
  console.log('Platform admin (Vid.a) inicial creado:');
  console.log(`  Email:    ${email}`);
  console.log('  Password: (ver VIDA_PLATFORM_PASSWORD en .env)');
  console.log('===========================================');
}

(async () => {
  await initDB();
  await platformDb.initPlatformDB(); // Vid.a V2 — control plane, BD separada
  ensurePlatformAdmin();
  ensureAdminUser();
  sanitizeAllPins();
  ensureSupervisor(); // opcional vía .env (SUPERVISOR_PHONE/NAME/PIN)
  ensureJefe(); // opcional vía .env (JEFE_PHONE/NAME/PIN)
  // Backfill inbox: re-vincular leads legacy que no tienen conversación en el schema
  // multicanal. APAGADO por defecto (poner INBOX_BACKFILL=1 en .env para reactivarlo
  // puntualmente) — con conversations.lead_id ahora UNIQUE (src/db/schema.js), correr
  // esto en cada arranque ya no puede duplicar conversaciones, pero sigue sin tener
  // sentido re-migrar 500 mensajes por lead en cada reinicio si no hay huérfanos
  // reales. Si aparecen huérfanos (p.ej. un script viejo los dejó sueltos), el chequeo
  // de salud de abajo los reporta sin tocar la BD; re-vincularlos es una acción manual.
  try {
    const huerfanos = store.getUnlinkedLeads();
    if (huerfanos.length) console.log(`[LEGACY-CHECK] ${huerfanos.length} lead(s) sin conversación en el inbox multicanal`);
    if (process.env.INBOX_BACKFILL === '1') {
      let revinculados = 0;
      for (const lead of huerfanos) {
        if (store.getOrCreateConversationForLead(lead.id)) revinculados++;
      }
      if (huerfanos.length) console.log(`[INBOX-BACKFILL] ${revinculados}/${huerfanos.length} leads re-vinculados al inbox`);
    }
  } catch (e) {
    console.error('[INBOX-BACKFILL] error:', e.message);
  }
  push.init();
  try {
    const MessageRouter = require('./services/router');
    require('./services/workflow').init(MessageRouter);
  } catch (e) {
    console.error('No se pudo iniciar WorkflowEngine:', e.message);
  }
  // Campañas masivas que quedaron en 'running' de un reinicio anterior (crash, deploy,
  // docker restart) no se reanudan solas — sin esto se quedan colgadas para siempre.
  try {
    const resumidas = await require('./services/campaign-runner').resumePendingCampaigns();
    if (resumidas) console.log(`[CAMPAIGNS] ${resumidas} campaña(s) reanudada(s) tras el reinicio.`);
  } catch (e) {
    console.error('[CAMPAIGNS] error reanudando campañas colgadas:', e.message);
  }
  // Middleware de error de Express (después de todas las rutas): registra y responde 500
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'json_invalido' });
    }
    logger.logError('express', err, { ruta: req.method + ' ' + req.originalUrl });
    res.status(500).json({ error: 'error_interno' });
  });
  // unhandledRejection: se registra pero no tumba el proceso — una promesa rechazada
  // sin catch no deja el proceso en un estado inconsistente, solo indica un bug a corregir.
  process.on('unhandledRejection', (err) => logger.logError('unhandledRejection', err));
  // uncaughtException: Node ya no garantiza que el proceso esté en un estado consistente
  // después de esto (recursos a medio liberar, listeners colgados). Registrar y salir —
  // Docker (restart: unless-stopped + healthcheck) lo reinicia limpio en segundos.
  process.on('uncaughtException', (err) => { logger.logError('uncaughtException', err); process.exit(1); });

  const http = require('http');
  const httpServer = http.createServer(app);
  httpServer.listen(PORT, () => {
    console.log(`Leons Group CRM corriendo en puerto ${PORT}`);
  });

  // docker stop / restart mandan SIGTERM: el fallback sql.js guarda en disco con
  // debounce (hasta 500ms-5s de retraso, ver adapter.scheduleSave) — sin este flush,
  // lo que quedó pendiente de guardar en ese instante se pierde. better-sqlite3 no lo
  // necesita (persiste solo en cada escritura) pero flushAll() es un no-op ahí.
  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} recibido — cerrando conexiones y guardando BD…`);
    try { dbAdapter.flushAll(); } catch (e) { console.error('[shutdown] error en flushAll:', e.message); }
    httpServer.close(() => process.exit(0));
    // Si algo deja conexiones HTTP colgadas (SSE en particular), no esperar para siempre.
    setTimeout(() => process.exit(0), 3000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  // Vid.a V3 — estos jobs corren por setInterval, fuera de cualquier request — sin
  // contexto de tenant perderían acceso a la BD (adapter.js resuelve la conexión por
  // contexto). runForAllTenants() itera TODAS las empresas activas del control plane
  // (incluida #1) y corre el job dentro del contexto de cada una, secuencialmente.
  // Si el control plane no está disponible, cae a empresa #1 (comportamiento histórico).
  const platform = require('./db/platform');
  const runForAllTenants = async (fn) => {
    let empresas = [];
    try {
      empresas = (platform.getEmpresas() || []).filter(e => e.activo);
    } catch (e) { empresas = []; }
    if (!empresas.length) empresas = [{ id: dbAdapter.DEFAULT_EMPRESA_ID, db_path: dbAdapter.DEFAULT_DB_PATH }];
    for (const e of empresas) {
      await dbAdapter.tenantContext.run({ empresaId: e.id, dbPath: e.db_path || dbAdapter.DEFAULT_DB_PATH }, () => fn(e));
    }
  };
  setInterval(() => { runForAllTenants(() => checkEscalation()).catch(e => console.error('[SCHED] checkEscalation:', e.message)); }, CFG.ESCALATION_CHECK_INTERVAL);
  setInterval(() => { runForAllTenants(() => checkRecordatorios()).catch(e => console.error('[SCHED] checkRecordatorios:', e.message)); }, 60000);
  setInterval(() => { runForAllTenants(() => store.cleanExpiredSessions(CFG.SESSION_TTL_MS)).catch(e => console.error('[SCHED] cleanExpiredSessions:', e.message)); }, CFG.SESSION_CLEANUP_INTERVAL);
  setInterval(() => { runForAllTenants(() => store.purgeOldFeedEvents(90)).catch(e => console.error('[SCHED] purgeOldFeedEvents:', e.message)); }, 6 * 60 * 60 * 1000);
  // Rastro GPS de los asesores: se conserva 30 días y se purga solo. Es dato personal;
  // guardarlo indefinidamente sería un pasivo sin ningún uso operativo.
  setInterval(() => { runForAllTenants(() => store.purgarPosicionesAntiguas(30)).catch(e => console.error('[SCHED] purgarPosiciones:', e.message)); }, 12 * 60 * 60 * 1000);
  // Geocodificación de los leads nuevos, en lotes pequeños para no golpear al proveedor.
  setInterval(() => { runForAllTenants(() => require('./services/geocode').geocodificarPendientes(25)).catch(e => console.error('[SCHED] geocode:', e.message)); }, 60 * 60 * 1000);
  // Reservas: verificar vencimientos cada 5 min
  setInterval(() => { runForAllTenants(() => reservas.verificarVencidas()).catch(e => console.error('[SCHED] reservas:', e.message)); }, 5 * 60 * 1000);
  // Lead scoring: recalcular scores cada 10 min
  setInterval(() => { runForAllTenants(() => leadScoring.recalcularTodos()).catch(e => console.error('[SCHED] leadScoring:', e.message)); }, 10 * 60 * 1000);
  // Campañas masivas pausadas por tope diario o fuera de ventana horaria: reintentar
  // cada 10 min sin que un admin tenga que reabrir el panel y pulsar "Iniciar".
  setInterval(() => { runForAllTenants(() => require('./services/campaign-runner').reanudarCampanasAutomaticas()).catch(e => console.error('[SCHED] campañas auto-resume:', e.message)); }, 10 * 60 * 1000);
  // Meta Ads: recomendaciones de severidad alta (gasto sin resultados) avisan solas
  // al admin — antes había que entrar al panel a mirar campaña por campaña.
  setInterval(() => { runForAllTenants(() => checkMetaAdsAlertas()).catch(e => console.error('[SCHED] meta-ads alertas:', e.message)); }, 6 * 60 * 60 * 1000);
  // Automatizaciones: reanuda delays vencidos + evalúa triggers 'schedule' y
  // 'lead:inactive'. Antes un delay solo podía vivir en memoria; con el proceso
  // reiniciándose en cada deploy, cualquier flujo con espera nunca llegaba a la acción.
  setInterval(() => { runForAllTenants(() => require('./services/workflow').tick()).catch(e => console.error('[SCHED] workflow tick:', e.message)); }, 30 * 1000);
  // Respaldo del webhook message_template_status_update (app no suscrita, downtime de
  // Meta): refresca las plantillas en revisión contra la Graph API. Coste bajo — normalmente 0-2 filas.
  setInterval(() => { runForAllTenants(() => require('./services/wa-templates').refrescarEstadosPendientes()).catch(e => console.error('[SCHED] plantillas pendientes:', e.message)); }, 15 * 60 * 1000);
  // Mensajes programados en servidor (comparten la firma del asesor del envío manual)
  require('./services/scheduler').start(buildMensajeConFirma, runForAllTenants);
})();
