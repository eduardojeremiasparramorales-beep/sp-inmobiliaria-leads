require('dotenv').config();

const express = require('express');
const store = require('./db/store');
const { initDB, getLeads, getLeadCount, addVendedor, getVendedores, setVendedorEstado, getLeadsSinRespuesta, incrementEscalation, getDB } = store;
const { handleVerification } = require('./webhook/verify');
const { handleMessage } = require('./webhook/messages');
const { sendMessage, uploadMedia, sendMedia } = require('./services/whatsapp');
const mediaStore = require('./services/media');
const auth = require('./services/auth');
const events = require('./services/events');
const push = require('./services/push');

const app = express();
app.use(express.json({ limit: '30mb' }));
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.json({ status: 'ok', service: 'SP Inmobiliaria CRM', version: '1.0' }));
app.get('/webhook', handleVerification);
app.post('/webhook', handleMessage);

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

app.get('/api/leads', auth.requireAuth, (req, res) => res.json(getLeads()));

app.get('/api/vendedores', auth.requireAuth, (req, res) => res.json(getVendedores()));

app.post('/api/vendedores', auth.requireAdmin, (req, res) => {
  const { nombre, telefono, pin } = req.body;
  if (!nombre || !telefono) return res.status(400).json({ error: 'nombre y telefono requeridos' });
  const vendedorId = addVendedor(nombre, telefono);
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

app.post('/api/login', (req, res) => {
  const { email, password, telefono, pin } = req.body || {};
  const secure = process.env.SECURE_COOKIES === 'true' ? '; Secure' : '';
  const MAX_AGE = 60 * 60 * 24 * 30; // 30 días en segundos

  // Modo vendedor: teléfono + PIN de 4 dígitos
  if (telefono && pin) {
    const vendedor = store.getVendedorByTelefono(String(telefono).trim());
    if (!vendedor || !vendedor.pin || !auth.verifyPassword(String(pin), vendedor.pin)) {
      return res.status(401).json({ error: 'credenciales_invalidas' });
    }
    const token = auth.createSession({ vendedorId: vendedor.id, rol: 'vendedor', nombre: vendedor.nombre });
    res.setHeader('Set-Cookie', `sp_session=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`);
    return res.json({ ok: true, token, usuario: { nombre: vendedor.nombre, rol: 'vendedor', vendedorId: vendedor.id } });
  }

  // Modo admin: email + contraseña
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
  const secure = process.env.SECURE_COOKIES === 'true' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sp_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`);
  res.json({ ok: true });
});

app.get('/api/me', auth.requireAuth, (req, res) => {
  res.json({
    nombre: req.session.nombre, email: req.session.email,
    rol: req.session.rol, vendedorId: req.session.vendedorId,
  });
});

// ===================== PANEL DEL VENDEDOR =====================

// Leads asignados al vendedor logueado (admin ve todos)
app.get('/api/mis-leads', auth.requireAuth, (req, res) => {
  if (req.session.rol === 'admin') return res.json(getLeads());
  if (!req.session.vendedorId) return res.json([]);
  res.json(store.getLeadsByVendedorId(req.session.vendedorId));
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

// Responder a un cliente DESDE EL PANEL → se envía por el número oficial
app.post('/api/leads/:id/responder', auth.requireAuth, async (req, res) => {
  const { mensaje } = req.body || {};
  if (!mensaje || !String(mensaje).trim()) return res.status(400).json({ error: 'mensaje_vacio' });

  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }

  try {
    await sendMessage(lead.customer_phone, String(mensaje));
    const fromNumber = lead.assigned_to_phone || req.session.email || 'panel';
    store.saveMessage(lead.id, fromNumber, lead.customer_phone, String(mensaje), 'outgoing');
    store.setFirstResponse(lead.id);
    if (lead.status === 'nuevo' || lead.status === 'asignado') {
      store.updateLeadStatus(lead.id, 'contactado');
    }
    events.emitToVendedor(lead.assigned_to_id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    events.emitToAdmins('nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    res.json({ ok: true });
  } catch (e) {
    console.error('Error enviando respuesta desde panel:', e.message);
    res.status(502).json({ error: 'error_whatsapp', detalle: e.message });
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
app.post('/api/leads/:id/responder-media', auth.requireAuth, async (req, res) => {
  const { mime, filename, dataBase64, caption } = req.body || {};
  if (!mime || !dataBase64) return res.status(400).json({ error: 'mime y dataBase64 requeridos' });

  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }

  // Determinar el tipo de WhatsApp según el mime
  let tipo = 'document';
  if (mime.startsWith('image/')) tipo = 'image';
  else if (mime.startsWith('audio/')) tipo = 'audio';
  else if (mime.startsWith('video/')) tipo = 'video';

  try {
    const buffer = Buffer.from(dataBase64, 'base64');
    const storedFilename = mediaStore.saveOutgoingMedia(buffer, mime, filename);
    const mediaId = await uploadMedia(buffer, mime, filename);
    await sendMedia(lead.customer_phone, mediaId, tipo, caption, filename);

    const fromNumber = lead.assigned_to_phone || req.session.email || 'panel';
    store.saveMessage(lead.id, fromNumber, lead.customer_phone, caption || `[${tipo}]`, 'outgoing', {
      media_type: tipo, media_id: mediaId, media_mime: mime, media_filename: storedFilename,
    });
    store.setFirstResponse(lead.id);
    if (lead.status === 'nuevo' || lead.status === 'asignado') store.updateLeadStatus(lead.id, 'contactado');
    events.emitToVendedor(lead.assigned_to_id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    events.emitToAdmins('nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
    res.json({ ok: true });
  } catch (e) {
    console.error('Error enviando media desde panel:', e.message);
    res.status(502).json({ error: 'error_whatsapp', detalle: e.message });
  }
});

// Cerrar un lead
app.post('/api/leads/:id/cerrar', auth.requireAuth, (req, res) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
  if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.updateLeadStatus(lead.id, 'cerrado');
  res.json({ ok: true });
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
    try { res.write(': hb\n\n'); } catch (e) { clearInterval(hb); }
  }, 25000);
  res.on('close', () => clearInterval(hb));
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

app.get('/api/config', auth.requireAdmin, (req, res) => {
  res.json({
    welcome_message: store.getConfig('welcome_message') || '',
  });
});

app.post('/api/config', auth.requireAdmin, (req, res) => {
  const { welcome_message } = req.body || {};
  if (welcome_message !== undefined) store.setConfig('welcome_message', String(welcome_message));
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

// ===================== USUARIOS (admin) =====================

app.get('/api/usuarios', auth.requireAdmin, (req, res) => res.json(store.getUsuarios()));

// Crea un vendedor + su usuario de login en un solo paso
app.post('/api/usuarios', auth.requireAdmin, (req, res) => {
  const { nombre, telefono, email, password, rol } = req.body || {};
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'nombre, email y password requeridos' });
  }
  const emailNorm = String(email).toLowerCase().trim();
  if (store.getUsuarioByEmail(emailNorm)) {
    return res.status(409).json({ error: 'email_ya_existe' });
  }
  let vendedorId = null;
  const rolFinal = rol === 'admin' ? 'admin' : 'vendedor';
  if (rolFinal === 'vendedor') {
    if (!telefono) return res.status(400).json({ error: 'telefono requerido para vendedores' });
    vendedorId = store.addVendedor(nombre, telefono);
  }
  store.createUsuario(emailNorm, auth.hashPassword(password), nombre, rolFinal, vendedorId);
  res.json({ ok: true, vendedorId });
});

// Seed vendedores de prueba
app.post('/api/seed', auth.requireAdmin, (req, res) => {
  const demo = [
    ['Carlos Méndez', '+5218112345601'],
    ['María Fernanda López', '+5218112345602'],
    ['Andrés García', '+5218112345603'],
    ['Valentina Ríos', '+5218112345604'],
    ['Javier Ortiz', '+5218112345605'],
  ];
  demo.forEach(([n, t]) => addVendedor(n, t));
  res.json({ ok: true, vendedoresCreados: demo.length });
});

// Test webhook simulator
app.post('/api/test-webhook', auth.requireAdmin, (req, res) => {
  const { phone, name, message } = req.body;
  const customerPhone = phone || '+5218112345000';
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
      }
    }
  } catch (e) {
    console.error('Error en escalation check:', e.message);
  }
}

// Crea el usuario administrador inicial si no existe ninguno
function ensureAdminUser() {
  if (store.countUsuarios() > 0) return;
  const email = (process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || 'admin@spinmobiliaria.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'changeme123';
  store.createUsuario(email, auth.hashPassword(password), 'Administrador', 'admin', null);
  console.log('===========================================');
  console.log('Usuario ADMIN inicial creado:');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log('  (cámbialo en .env: ADMIN_EMAIL / ADMIN_PASSWORD)');
  console.log('===========================================');
}

initDB().then(() => {
  ensureAdminUser();
  push.init();
  app.listen(PORT, () => {
    console.log(`SP Inmobiliaria CRM corriendo en puerto ${PORT}`);
  });
  setInterval(checkEscalation, 60000);
  // Limpiar sesiones expiradas (>30 días) cada 24 horas
  setInterval(() => store.cleanExpiredSessions(1000 * 60 * 60 * 24 * 30), 1000 * 60 * 60 * 24);
});
