require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const store = require('./db/store');
const { initDB, getLeads, getLeadCount, addVendedor, getVendedores, setVendedorEstado, getLeadsSinRespuesta, incrementEscalation, getDB, deleteVendedor, getAdminInbox, getAdminInboxStats } = store;
const { handleVerification } = require('./webhook/verify');
const { handleMessage } = require('./webhook/messages');
const { sendMessage, sendMessageSmart, uploadMedia, sendMedia } = require('./services/whatsapp');
const mediaStore = require('./services/media');
const auth = require('./services/auth');
const events = require('./services/events');
const push = require('./services/push');

const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

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
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'demasiados_intentos' } });
const mediaLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'demasiadas_peticiones' } });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: false, legacyHeaders: false });

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

// ===================== PRUEBA DE IA (NLP) =====================

app.post('/api/nlp/test', auth.requireAdmin, async (req, res) => {
  try {
    const nlp = require('./services/nlp');
    const texto = (req.body && req.body.texto) || 'Hola, me interesan los lotes';
    const [sentiment, intent] = await Promise.all([
      nlp.analyzeSentiment(texto),
      nlp.classifyIntent(texto),
    ]);
    res.json({ ok: true, texto, sentiment, intent });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
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

app.get('/api/leads', auth.requireAuth, (req, res) => {
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
  const MAX_AGE = 60 * 60 * 24 * 30; // 30 días en segundos

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
  res.json({ lead, mensajes: store.getMessagesByLead(lead.id) });
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
  if (conv.channel !== 'whatsapp') return res.status(400).json({ error: 'canal_no_soporta_media' });

  const customer = store.getCustomerById(conv.customer_id);
  const telefono = (customer && customer.phone) || conv.channel_conversation_id;
  if (!telefono) return res.status(400).json({ error: 'cliente_sin_telefono' });

  let tipo = 'document';
  if (mime.startsWith('image/')) tipo = 'image';
  else if (mime.startsWith('audio/')) tipo = 'audio';
  else if (mime.startsWith('video/')) tipo = 'video';

  try {
    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > 18 * 1024 * 1024) return res.status(413).json({ error: 'archivo_muy_grande_max_18mb' });
    const storedFilename = mediaStore.saveOutgoingMedia(buffer, mime, filename);
    const mediaId = await uploadMedia(buffer, mime, filename);
    await sendMedia(telefono, mediaId, tipo, caption, filename);

    store.addTimelineEvent(conv.id, 'message', {
      channel: 'whatsapp', body: caption || `[${tipo}]`, direction: 'outgoing',
      from_number: 'panel', to_number: telefono,
      media_type: tipo, media_id: mediaId, media_mime: mime, media_filename: storedFilename,
    });
    const adapter = require('./db/adapter');
    adapter.run('UPDATE conversations SET last_message = ?, last_message_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?', [caption || `[${tipo}]`, conv.id]);
    // Espejo hacia el lead legacy para que el vendedor lo vea en su panel
    if (conv.lead_id) {
      try {
        store.saveMessage(conv.lead_id, 'panel', telefono, caption || `[${tipo}]`, 'outgoing', {
          media_type: tipo, media_id: mediaId, media_mime: mime, media_filename: storedFilename,
        });
      } catch (e) { console.error('media espejo lead:', e.message); }
    }
    events.emitToVendedor(conv.assigned_to_id, 'nuevo_mensaje', { conversationId: conv.id, leadId: conv.lead_id || null, tipo: 'respuesta_panel', ts: Date.now() });
    events.emitToAdmins('nuevo_mensaje', { conversationId: conv.id, leadId: conv.lead_id || null, tipo: 'respuesta_panel', ts: Date.now() });
    res.json({ ok: true });
  } catch (e) {
    console.error('Error enviando media desde inbox:', e.message);
    res.status(502).json({ error: 'error_whatsapp', detalle: e.message });
  }
});

// Servir media de un evento del timeline multicanal (valida permiso por conversación)
app.get('/api/inbox/media/:timelineId', auth.requireAuth, (req, res) => {
  const adapter = require('./db/adapter');
  const ev = adapter.one('SELECT * FROM timeline WHERE id = ? LIMIT 1', [req.params.timelineId]);
  if (!ev || !ev.media_filename) return res.status(404).json({ error: 'media_no_existe' });
  const conv = store.getConversationById(ev.conversation_id);
  if (!conv) return res.status(404).json({ error: 'no_existe' });
  if (req.session.rol !== 'admin' && Number(conv.assigned_to_id) !== Number(req.session.vendedorId))
    return res.status(403).json({ error: 'sin_permiso' });
  const filePath = mediaStore.getMediaPath(ev.media_filename);
  if (!require('fs').existsSync(filePath)) return res.status(404).json({ error: 'archivo_no_encontrado' });
  if (ev.media_mime) res.setHeader('Content-Type', ev.media_mime);
  res.sendFile(filePath);
});

// ===================== RESPONDER (OLD) =====================

// Responder a un cliente DESDE EL PANEL → se envía por el número oficial
app.post('/api/leads/:id/responder', auth.requireAuth, async (req, res) => {
  const { mensaje, replyTo } = req.body || {};
  if (!mensaje || !String(mensaje).trim()) return res.status(400).json({ error: 'mensaje_vacio' });
  if (String(mensaje).length > 4096) return res.status(400).json({ error: 'mensaje_muy_largo' });

  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }

  try {
    const nombreVendedor = req.session.nombre || 'Asesor SP';
    const mensajeConPrefijo = `*${nombreVendedor}:* ${String(mensaje)}`;
    const smartResult = await sendMessageSmart(lead.customer_phone, mensajeConPrefijo, lead.id);
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
app.get('/api/media/:messageId', auth.requireAuth, (req, res) => {
  const msg = store.getMessageById(req.params.messageId);
  if (!msg || !msg.media_filename) return res.status(404).json({ error: 'media_no_existe' });
  const lead = store.getLeadById(msg.lead_id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const filePath = mediaStore.getMediaPath(msg.media_filename);
  if (!require('fs').existsSync(filePath)) return res.status(404).json({ error: 'archivo_no_encontrado' });
  if (msg.media_mime) res.setHeader('Content-Type', msg.media_mime);
  res.sendFile(filePath);
});

// Responder a un cliente con un archivo (imagen/audio/video/documento) desde el panel.
// Body JSON: { mime, filename, dataBase64, caption }
app.post('/api/leads/:id/responder-media', auth.requireAuth, mediaLimiter, async (req, res) => {
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
    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > 18 * 1024 * 1024) return res.status(413).json({ error: 'archivo_muy_grande_max_18mb' });
    const nombreVendedor = req.session.nombre || 'Asesor SP';
    const captionConPrefijo = caption ? `*${nombreVendedor}:* ${caption}` : '';
    const displayBody = caption ? captionConPrefijo : `[${tipo}]`;
    const storedFilename = mediaStore.saveOutgoingMedia(buffer, mime, filename);
    const mediaId = await uploadMedia(buffer, mime, filename);
    const mediaResult = await sendMedia(lead.customer_phone, mediaId, tipo, captionConPrefijo, filename);
    const wamid = mediaResult && mediaResult.messages && mediaResult.messages[0] ? mediaResult.messages[0].id : null;

    const fromNumber = lead.assigned_to_phone || req.session.email || 'panel';
    const replyToId = replyTo ? Number(replyTo) : null;
    store.saveMessage(lead.id, fromNumber, lead.customer_phone, displayBody, 'outgoing', {
      media_type: tipo, media_id: mediaId, media_mime: mime, media_filename: storedFilename,
    }, replyToId, wamid, 'sent');
    store.setFirstResponse(lead.id);
    if (lead.status === 'nuevo' || lead.status === 'asignado') store.updateLeadStatus(lead.id, 'contactado');
    store.syncLeadToConversation(store.getLeadById(lead.id), {
      direction: 'outgoing', body: displayBody, fromNumber, toNumber: lead.customer_phone,
      media: { media_type: tipo, media_id: mediaId, media_mime: mime, media_filename: storedFilename },
    });
    events.emitToVendedor(lead.assigned_to_id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    events.emitToAdmins('nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    res.json({ ok: true });
  } catch (e) {
    console.error('Error enviando media desde panel:', e.message);
    res.status(502).json({ error: 'error_whatsapp', detalle: e.message });
  }
});

// Eliminar un mensaje
app.delete('/api/messages/:id', auth.requireAuth, (req, res) => {
  const msgId = req.params.id;
  if (!msgId || isNaN(Number(msgId))) return res.status(400).json({ error: 'id_invalido' });
  try {
    const store = require('./db/store');
    const adapter = require('./db/adapter');
    // Verificar que el mensaje pertenezca a un lead del vendedor
    const row = adapter.get('SELECT lead_id, media_type, media_filename FROM messages WHERE id = ?', [Number(msgId)]);
    if (!row) return res.status(404).json({ error: 'mensaje_no_existe' });
    if (req.session.rol !== 'admin') {
      const lead = store.getLeadById(row.lead_id);
      if (!lead || Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
        return res.status(403).json({ error: 'sin_permiso' });
      }
    }
    // Eliminar archivo de media si existe
    if (row.media_filename) {
      try {
        const mediaPath = require('path').join(__dirname, '..', 'data', 'media', String(row.media_filename));
        if (require('fs').existsSync(mediaPath)) require('fs').unlinkSync(mediaPath);
      } catch (e) { /* ignorar */ }
    }
    adapter.run('DELETE FROM messages WHERE id = ?', [Number(msgId)]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Error eliminando mensaje:', e.message);
    res.status(500).json({ error: 'error_interno' });
  }
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

app.post('/api/leads/:id/desarchivar', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.updateLeadStatus(lead.id, 'asignado');
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
  const leads = getLeads();
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

// Reasignar un lead a otro vendedor (solo admin)
app.post('/api/leads/:id/reasignar', auth.requireAdmin, (req, res) => {
  const { vendedorId } = req.body || {};
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  const vendedor = getVendedores().find(v => Number(v.id) === Number(vendedorId));
  if (!vendedor) return res.status(400).json({ error: 'vendedor_no_existe' });
  const anteriorId = lead.assigned_to_id;
  store.reassignLead(lead.id, vendedor);
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
  }, 25000);
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
  'reengagement_template',
  'twilio_account_sid', 'twilio_auth_token', 'twilio_numero',
  'slack_webhook', 'gcal_client_id', 'mp_public_key', 'mp_access_token',
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

// Webhook de Twilio (sin auth, validado por firma de Twilio en el propio Twilio)
app.post('/webhook/twilio/status', async (req, res) => {
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
  const vendedorId = req.user.vendedorId;
  if (!vendedorId) return res.status(400).json({ error: 'sin_vendedor' });
  res.json(store.getVendedorTemplates(vendedorId));
});
app.post('/api/mis-templates', auth.requireAuth, (req, res) => {
  const { titulo, cuerpo } = req.body || {};
  if (!titulo || !cuerpo) return res.status(400).json({ error: 'titulo y cuerpo requeridos' });
  const vendedorId = req.user.vendedorId;
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
  const vendedorId = req.user.vendedorId;
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

// Seed vendedores de prueba
app.post('/api/seed', auth.requireAdmin, (req, res) => {
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

// Test webhook simulator
app.post('/api/test-webhook', auth.requireAdmin, (req, res) => {
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

// Test vendedor reply simulator
app.post('/api/test-reply', auth.requireAdmin, (req, res) => {
  const { vendedorPhone, message } = req.body;
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
app.get('/api/logs', auth.requireAuth, (req, res) => {
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
  const leads = getLeads();
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

// Escalation check
async function checkEscalation() {
  try {
    const treinta = getLeadsSinRespuesta(30);
    for (const lead of treinta) {
      if (lead.escalation_level < 1) {
        incrementEscalation(lead.id);
        console.log(`Escalation 30min lead ${lead.id}`);
        if (lead.assigned_to_phone) {
          await sendMessage(lead.assigned_to_phone,
            `Alerta SP Inmobiliaria\nLlevas 30 min sin responder al lead ${lead.customer_name} (${lead.customer_phone}).`
          ).catch(() => {});
        }
      }
    }
    const sesenta = getLeadsSinRespuesta(60);
    for (const lead of sesenta) {
      if (lead.escalation_level < 2) {
        incrementEscalation(lead.id);
        console.log(`Escalation 60min lead ${lead.id} — reasignar`);
        // Reasignar al vendedor con menos leads activos
        const siguientes = store.getVendedoresActivos();
        if (siguientes.length > 0) {
          const siguiente = siguientes[0];
          const vendedorActual = getVendedores().find(v => Number(v.id) === Number(lead.assigned_to_id));
          store.reassignLead(lead.id, siguiente);
          // Notificar al vendedor original
          if (vendedorActual && vendedorActual.telefono) {
            await sendMessage(vendedorActual.telefono,
              `Notificación SP Inmobiliaria\nEl lead ${lead.customer_name} (${lead.customer_phone}) ha sido reasignado por falta de respuesta.`
            ).catch(() => {});
          }
          events.emitToAdmins('lead_actualizado', { leadId: lead.id, tipo: 'reasignado_escalation', ts: Date.now() });
        }
      }
    }
  } catch (e) {
    console.error('Error en escalation check:', e.message);
  }
}

// Crea el usuario administrador inicial + vendedor admin con teléfono oficial y PIN 0000
function ensureAdminUser() {
  const ADMIN_PHONE = '+573214625618';
  const ADMIN_PIN = '0000';
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
  setInterval(checkEscalation, 60000);
  // Limpiar sesiones expiradas (>30 días) cada 24 horas
  setInterval(() => store.cleanExpiredSessions(1000 * 60 * 60 * 24 * 30), 1000 * 60 * 60 * 24);
})();
