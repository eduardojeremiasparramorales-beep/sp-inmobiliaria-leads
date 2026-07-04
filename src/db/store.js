const adapter = require('./adapter');
const { createNewTables } = require('./schema');

// Obtener funciones del adapter
let all = (sql, params) => adapter.all(sql, params);
let one = (sql, params) => adapter.one(sql, params);
let run = (sql, params) => adapter.run(sql, params);
let execSQL = (sql) => adapter.exec(sql);

// Añade una columna a una tabla solo si aún no existe (migración segura)
function ensureColumn(table, column, type) {
  try {
    const cols = all(`PRAGMA table_info(${table})`).map(r => r.name);
    if (!cols.includes(column)) {
      execSQL(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  } catch (e) {
    console.error(`ensureColumn ${table}.${column}:`, e.message);
  }
}

async function initDB() {
  await adapter.initDB();

  execSQL(`
    CREATE TABLE IF NOT EXISTS vendedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL UNIQUE,
      email TEXT DEFAULT '',
      estado TEXT DEFAULT 'activo',
      rol TEXT DEFAULT 'vendedor',
      total_leads INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_phone TEXT NOT NULL,
      customer_name TEXT DEFAULT 'Cliente',
      assigned_to_id INTEGER,
      assigned_to_phone TEXT,
      status TEXT DEFAULT 'nuevo',
      messages_count INTEGER DEFAULT 1,
      first_message TEXT,
      last_message TEXT,
      first_response_at DATETIME,
      escalation_level INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      from_number TEXT NOT NULL,
      to_number TEXT NOT NULL,
      body TEXT NOT NULL,
      direction TEXT DEFAULT 'incoming',
      timestamp DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      nombre TEXT,
      rol TEXT DEFAULT 'vendedor',
      vendedor_id INTEGER,
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      cuerpo TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  execSQL(`CREATE INDEX IF NOT EXISTS idx_leads_customer_phone ON leads(customer_phone)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_id ON leads(assigned_to_id)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_phone ON leads(assigned_to_phone)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_vendedores_telefono ON vendedores(telefono)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_vendedores_estado ON vendedores(estado)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_usuarios_vendedor_id ON usuarios(vendedor_id)`);

  ensureColumn('messages', 'media_type', 'TEXT');
  ensureColumn('messages', 'media_id', 'TEXT');
  ensureColumn('messages', 'media_mime', 'TEXT');
  ensureColumn('messages', 'media_filename', 'TEXT');
  ensureColumn('vendedores', 'pin', 'TEXT');
  ensureColumn('leads', 'etiqueta', 'TEXT');
  ensureColumn('leads', 'unread_count', 'INTEGER DEFAULT 0');

  execSQL(`
    CREATE TABLE IF NOT EXISTS lead_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      autor TEXT DEFAULT '',
      nota TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id)`);

  execSQL(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  execSQL(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER,
      vendedor_id INTEGER,
      rol TEXT DEFAULT 'vendedor',
      nombre TEXT DEFAULT '',
      email TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `);

  execSQL(`
    CREATE TABLE IF NOT EXISTS wa_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      idioma TEXT DEFAULT 'es',
      params TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  execSQL(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendedor_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_push_vendedor ON push_subscriptions(vendedor_id)`);

  createNewTables(adapter.getDB());

  // Puente legacy → multicanal: cada conversación puede apuntar a su lead
  ensureColumn('conversations', 'lead_id', 'INTEGER');
  execSQL(`CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id)`);

  // Citas (visitas, llamadas, seguimientos agendados)
  execSQL(`
    CREATE TABLE IF NOT EXISTS citas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      vendedor_id INTEGER,
      titulo TEXT NOT NULL,
      fecha DATETIME NOT NULL,
      notas TEXT DEFAULT '',
      estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'hecha', 'cancelada')),
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_citas_fecha ON citas(fecha)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_citas_vendedor ON citas(vendedor_id)`);

  return adapter.getDB();
}

function getDB() { return adapter.getDB(); }

function saveLead(customerPhone, customerName, messageBody) {
  if (!customerPhone || !messageBody) {
    throw new Error('saveLead: customerPhone y messageBody son obligatorios');
  }

  const existing = one('SELECT id, messages_count, status FROM leads WHERE customer_phone = ? AND status != ?', [customerPhone, 'cerrado']);
  if (existing) {
    run('UPDATE leads SET messages_count = ?, last_message = ?, unread_count = COALESCE(unread_count,0) + 1, updated_at = datetime(\'now\') WHERE id = ?', [existing.messages_count + 1, messageBody, existing.id]);
    return { leadId: existing.id, isNew: false };
  }

  run('INSERT INTO leads (customer_phone, customer_name, first_message, last_message, unread_count) VALUES (?, ?, ?, ?, 1)', [customerPhone, customerName, messageBody, messageBody]);

  const r = one('SELECT id FROM leads WHERE customer_phone = ? ORDER BY id DESC LIMIT 1', [customerPhone]);
  if (!r || !r.id) {
    throw new Error('No se pudo obtener ID del lead después de INSERT');
  }
  return { leadId: r.id, isNew: true };
}

function assignLeadToVendedor(leadId, vendedor) {
  if (!leadId || !vendedor || !vendedor.id || !vendedor.telefono) {
    throw new Error('assignLeadToVendedor: leadId y vendedor (con id y telefono) son obligatorios');
  }

  const leadExists = one('SELECT id FROM leads WHERE id = ?', [leadId]);
  if (!leadExists) throw new Error(`Lead ${leadId} no existe`);

  const vExists = one('SELECT id FROM vendedores WHERE id = ?', [vendedor.id]);
  if (!vExists) throw new Error(`Vendedor ${vendedor.id} no existe`);

  run('UPDATE leads SET assigned_to_id = ?, assigned_to_phone = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?', [vendedor.id, vendedor.telefono, 'asignado', leadId]);
  run('UPDATE vendedores SET total_leads = total_leads + 1 WHERE id = ?', [vendedor.id]);
}

function saveMessage(leadId, from, to, body, direction, media) {
  const m = media || {};
  run('INSERT INTO messages (lead_id, from_number, to_number, body, direction, media_type, media_id, media_mime, media_filename) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    leadId, from, to, body, direction,
    m.media_type || null, m.media_id || null, m.media_mime || null, m.media_filename || null,
  ]);
  const r = one('SELECT id FROM messages WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [leadId]);
  return r ? r.id : null;
}

function getMessageById(id) {
  return one('SELECT * FROM messages WHERE id = ? LIMIT 1', [id]);
}

function getVendedoresActivos() {
  return all(`
    SELECT v.*, COUNT(l.id) as leads_activos
    FROM vendedores v
    LEFT JOIN leads l ON l.assigned_to_id = v.id AND l.status != ?
    WHERE v.estado = ?
    GROUP BY v.id
    ORDER BY leads_activos ASC
  `, ['cerrado', 'activo']);
}

function getLeadById(id) {
  return one('SELECT * FROM leads WHERE id = ?', [id]);
}

function getLeadByCustomerPhone(phone) {
  return one('SELECT * FROM leads WHERE customer_phone = ? AND status != ?', [phone, 'cerrado']);
}

function updateLeadStatus(leadId, status) {
  run('UPDATE leads SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, leadId]);
}

function setFirstResponse(leadId) {
  run('UPDATE leads SET first_response_at = datetime(\'now\') WHERE id = ? AND first_response_at IS NULL', [leadId]);
}

function getLeads() {
  return all(`
    SELECT l.*, v.nombre AS assigned_to_nombre
    FROM leads l
    LEFT JOIN vendedores v ON v.id = l.assigned_to_id
    ORDER BY l.updated_at DESC, l.created_at DESC
  `);
}

// Marcar todos los mensajes de un lead como leídos
function marcarLeido(leadId) {
  run('UPDATE leads SET unread_count = 0 WHERE id = ?', [Number(leadId)]);
}

// Editar el nombre del contacto
function setLeadNombre(leadId, nombre) {
  run('UPDATE leads SET customer_name = ?, updated_at = datetime(\'now\') WHERE id = ?', [String(nombre), Number(leadId)]);
}

function getLeadCount() {
  const r = one('SELECT COUNT(*) as c FROM leads');
  return r ? r.c : 0;
}

function getLeadsSinRespuesta(minutos) {
  return all('SELECT * FROM leads WHERE status = ? AND first_response_at IS NULL AND created_at <= datetime(\'now\', ?)', ['asignado', `-${minutos} minutes`]);
}

function incrementEscalation(leadId) {
  run('UPDATE leads SET escalation_level = escalation_level + 1 WHERE id = ?', [leadId]);
}

function addVendedor(nombre, telefono) {
  run('INSERT OR IGNORE INTO vendedores (nombre, telefono) VALUES (?, ?)', [nombre, telefono]);
  const r = one('SELECT id FROM vendedores WHERE telefono = ? LIMIT 1', [telefono]);
  return r ? r.id : null;
}

// --- Usuarios (login) ---
function createUsuario(email, passwordHash, nombre, rol, vendedorId) {
  run('INSERT INTO usuarios (email, password, nombre, rol, vendedor_id) VALUES (?, ?, ?, ?, ?)', [email, passwordHash, nombre, rol, vendedorId]);
  return one('SELECT * FROM usuarios WHERE email = ? LIMIT 1', [email]);
}

function getUsuarioByEmail(email) {
  return one('SELECT * FROM usuarios WHERE email = ? LIMIT 1', [email]);
}

function getUsuarioById(id) {
  return one('SELECT * FROM usuarios WHERE id = ? LIMIT 1', [id]);
}

function getUsuarios() {
  return all('SELECT id, email, nombre, rol, vendedor_id, created_at FROM usuarios ORDER BY nombre');
}

function countUsuarios() {
  const r = one('SELECT COUNT(*) as c FROM usuarios');
  return r ? r.c : 0;
}

function updateUsuarioPassword(id, passwordHash) {
  run('UPDATE usuarios SET password = ? WHERE id = ?', [passwordHash, id]);
}

// --- Leads y mensajes por vendedor ---
function getLeadsByVendedorId(vendedorId) {
  return all('SELECT * FROM leads WHERE assigned_to_id = ? ORDER BY updated_at DESC', [vendedorId]);
}

function getMessagesByLead(leadId) {
  return all('SELECT * FROM messages WHERE lead_id = ? ORDER BY timestamp ASC, id ASC', [leadId]);
}

// --- Templates (respuestas rápidas) ---
function getTemplates() {
  return all('SELECT * FROM templates ORDER BY titulo');
}

function addTemplate(titulo, cuerpo) {
  run('INSERT INTO templates (titulo, cuerpo) VALUES (?, ?)', [titulo, cuerpo]);
}

function deleteTemplate(id) {
  run('DELETE FROM templates WHERE id = ?', [id]);
}

// --- Suscripciones push ---
function savePushSubscription(vendedorId, sub) {
  const keys = sub.keys || {};
  run('INSERT OR REPLACE INTO push_subscriptions (vendedor_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)', [vendedorId, sub.endpoint, keys.p256dh || '', keys.auth || '']);
}

function getPushSubscriptionsByVendedor(vendedorId) {
  return all('SELECT * FROM push_subscriptions WHERE vendedor_id = ?', [vendedorId]);
}

function deletePushSubscription(endpoint) {
  run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
}

function getVendedores() {
  return all('SELECT * FROM vendedores ORDER BY nombre');
}

function getVendedorByTelefono(telefono) {
  return one('SELECT * FROM vendedores WHERE telefono = ? LIMIT 1', [telefono]);
}

function setVendedorPin(id, pinHash) {
  run('UPDATE vendedores SET pin = ? WHERE id = ?', [pinHash, id]);
}

// --- Sesiones persistentes en DB ---
function createDBSession(token, data) {
  run('INSERT OR REPLACE INTO sessions (token, user_id, vendedor_id, rol, nombre, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    token,
    data.userId != null ? Number(data.userId) : null,
    data.vendedorId != null ? Number(data.vendedorId) : null,
    data.rol || 'vendedor',
    data.nombre || '',
    data.email || '',
    Date.now(),
  ]);
}

function getDBSession(token) {
  return one('SELECT * FROM sessions WHERE token = ? LIMIT 1', [token]);
}

function deleteDBSession(token) {
  run('DELETE FROM sessions WHERE token = ?', [token]);
}

function cleanExpiredSessions(ttlMs) {
  run('DELETE FROM sessions WHERE created_at < ?', [Date.now() - ttlMs]);
}

// --- Configuración general ---
function getConfig(key) {
  const r = one('SELECT value FROM config WHERE key = ? LIMIT 1', [key]);
  return r ? r.value : null;
}

function setConfig(key, value) {
  run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, value]);
}

// --- Templates de WhatsApp aprobados por Meta ---
function getWATemplates() {
  return all('SELECT * FROM wa_templates ORDER BY nombre');
}

function addWATemplate(nombre, idioma, params) {
  run('INSERT OR REPLACE INTO wa_templates (nombre, idioma, params) VALUES (?, ?, ?)', [nombre, idioma || 'es', params || '']);
}

function deleteWATemplate(id) {
  run('DELETE FROM wa_templates WHERE id = ?', [id]);
}

function setVendedorEstado(id, estado) {
  run('UPDATE vendedores SET estado = ? WHERE id = ?', [estado, id]);
}

// --- Etiqueta de pipeline del lead ---
function setLeadEtiqueta(leadId, etiqueta) {
  run('UPDATE leads SET etiqueta = ?, updated_at = datetime(\'now\') WHERE id = ?', [etiqueta, leadId]);
}

// --- Notas internas por lead ---
function getNotasByLead(leadId) {
  return all('SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC, id DESC', [leadId]);
}

function addNota(leadId, autor, nota) {
  run('INSERT INTO lead_notes (lead_id, autor, nota) VALUES (?, ?, ?)', [leadId, autor || '', nota]);
}

function deleteNota(id) {
  run('DELETE FROM lead_notes WHERE id = ?', [id]);
}

// --- Reasignación manual de un lead ---
function reassignLead(leadId, vendedor) {
  run('UPDATE leads SET assigned_to_id = ?, assigned_to_phone = ?, updated_at = datetime(\'now\') WHERE id = ?', [vendedor.id, vendedor.telefono, leadId]);
  run('UPDATE vendedores SET total_leads = total_leads + 1 WHERE id = ?', [vendedor.id]);
}

// --- Eliminar vendedor y reasignar sus leads ---
function deleteVendedor(id) {
  const activos = all('SELECT * FROM vendedores WHERE estado = ? AND id != ? ORDER BY total_leads ASC LIMIT 1', ['activo', id]);
  const leadsReasignar = all('SELECT id FROM leads WHERE assigned_to_id = ? AND status != ?', [id, 'cerrado']);

  if (activos.length > 0) {
    const siguiente = activos[0];
    leadsReasignar.forEach(lead => {
      run('UPDATE leads SET assigned_to_id = ?, assigned_to_phone = ?, updated_at = datetime(\'now\') WHERE id = ?', [siguiente.id, siguiente.telefono, lead.id]);
      run('UPDATE vendedores SET total_leads = total_leads + 1 WHERE id = ?', [siguiente.id]);
    });
  } else {
    // No hay vendedores activos: marcar leads como huérfanos (sin asignar) y cambiar status a 'nuevo' para que round-robin los reasigne
    leadsReasignar.forEach(lead => {
      run('UPDATE leads SET assigned_to_id = NULL, assigned_to_phone = NULL, status = ?, updated_at = datetime(\'now\') WHERE id = ?', ['nuevo', lead.id]);
    });
  }

  run('DELETE FROM push_subscriptions WHERE vendedor_id = ?', [id]);
  run('DELETE FROM sessions WHERE vendedor_id = ?', [id]);
  run('DELETE FROM usuarios WHERE vendedor_id = ?', [id]);
  run('DELETE FROM vendedores WHERE id = ?', [id]);
  return activos.length > 0 ? activos[0] : null;
}

// --- Inbox global admin: lista de conversaciones con filtros ---
function getAdminInbox({ busqueda, etiqueta, vendedorId, limite, offset } = {}) {
  const conditions = [];
  const params = [];
  if (busqueda) {
    conditions.push('(l.customer_name LIKE ? OR l.customer_phone LIKE ?)');
    params.push(`%${busqueda}%`, `%${busqueda}%`);
  }
  if (etiqueta && etiqueta !== 'todos') {
    if (etiqueta === 'remarketing') {
      conditions.push("l.etiqueta IN ('no_interesado', 'sin_clasificar')");
    } else {
      conditions.push('l.etiqueta = ?');
      params.push(etiqueta);
    }
  }
  if (vendedorId) {
    conditions.push('l.assigned_to_id = ?');
    params.push(Number(vendedorId));
  }
  const whereStr = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const lim = Number(limite) || 50;
  const off = Number(offset) || 0;
  return all(`
    SELECT l.*, v.nombre as vendedor_nombre, v.estado as vendedor_estado,
      (SELECT COUNT(*) FROM messages m WHERE m.lead_id = l.id) as total_mensajes,
      (SELECT COUNT(*) FROM messages m WHERE m.lead_id = l.id AND m.direction = ? AND m.timestamp > COALESCE(
        (SELECT MAX(m2.timestamp) FROM messages m2 WHERE m2.lead_id = l.id AND m2.direction = ?), ?)) as sin_leer
    FROM leads l
    LEFT JOIN vendedores v ON v.id = l.assigned_to_id
    ${whereStr}
    ORDER BY l.updated_at DESC, l.id DESC
    LIMIT ? OFFSET ?
  `, [...params, 'incoming', 'outgoing', '2000-01-01', lim, off]);
}

function getAdminInboxStats() {
  const total = one('SELECT COUNT(*) as c FROM leads');
  const sinResponder = one("SELECT COUNT(*) as c FROM leads WHERE status IN (?, ?)", ['nuevo', 'asignado']);
  const hoy = one("SELECT COUNT(*) as c FROM leads WHERE date(created_at) = date('now')");
  return {
    total: total ? total.c : 0,
    sinResponder: sinResponder ? sinResponder.c : 0,
    hoy: hoy ? hoy.c : 0,
  };
}

// =====================================================================
// NUEVO SCHEMA MULTICANAL: customers, customer_channels, conversations, timeline
// =====================================================================

// --- Customers ---
function createCustomer(name, phone) {
  run('INSERT INTO customers (name, phone) VALUES (?, ?)', [name || 'Cliente', phone || '']);
  return one('SELECT * FROM customers WHERE id = (SELECT last_insert_rowid())');
}

function getCustomerById(id) {
  return one('SELECT * FROM customers WHERE id = ?', [id]);
}

function findCustomerByChannel(channel, userId) {
  return one(`
    SELECT c.*
    FROM customer_channels cc
    JOIN customers c ON c.id = cc.customer_id
    WHERE cc.channel = ? AND cc.channel_user_id = ?
    LIMIT 1
  `, [channel, userId]);
}

// --- Customer Channels ---
function linkChannelToCustomer(customerId, channel, channelUserId, username) {
  run('INSERT OR IGNORE INTO customer_channels (customer_id, channel, channel_user_id, channel_username) VALUES (?, ?, ?, ?)',
    [customerId, channel, channelUserId, username || '']);
}

function getCustomerChannels(customerId) {
  return all('SELECT * FROM customer_channels WHERE customer_id = ?', [customerId]);
}

function getCustomers({ busqueda, limite, offset } = {}) {
  const conditions = [];
  const params = [];
  if (busqueda) {
    conditions.push('(name LIKE ? OR phone LIKE ?)');
    params.push(`%${busqueda}%`, `%${busqueda}%`);
  }
  const whereStr = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const lim = Number(limite) || 50;
  const off = Number(offset) || 0;
  return all(`SELECT * FROM customers ${whereStr} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, lim, off]);
}

function updateCustomer(id, data) {
  const actual = getCustomerById(id);
  if (!actual) return null;
  run('UPDATE customers SET name = ?, email = ?, phone = ?, notes = ?, tags = ? WHERE id = ?', [
    data.name !== undefined ? data.name : actual.name,
    data.email !== undefined ? data.email : actual.email,
    data.phone !== undefined ? data.phone : actual.phone,
    data.notes !== undefined ? data.notes : actual.notes,
    data.tags !== undefined ? JSON.stringify(data.tags) : actual.tags,
    id,
  ]);
  return getCustomerById(id);
}

function deleteCustomer(id) {
  run('DELETE FROM customer_channels WHERE customer_id = ?', [id]);
  run('DELETE FROM customers WHERE id = ?', [id]);
}

function getActiveConversationsByCustomer(customerId) {
  return all('SELECT * FROM conversations WHERE customer_id = ? AND status != \'cerrado\'', [customerId]);
}

// --- Conversations ---
function createConversation(channel, channelConversationId, customerId) {
  run('INSERT INTO conversations (channel, channel_conversation_id, customer_id) VALUES (?, ?, ?)',
    [channel, channelConversationId || '', customerId]);
  return one('SELECT * FROM conversations WHERE id = (SELECT last_insert_rowid())');
}

function getConversationById(id) {
  return one(`
    SELECT conv.*, v.nombre AS assigned_to_nombre
    FROM conversations conv
    LEFT JOIN vendedores v ON v.id = conv.assigned_to_id
    WHERE conv.id = ?
  `, [id]);
}

function getConversationsByVendedorId(vendedorId) {
  return all(`
    SELECT conv.*, c.name AS customer_name, c.phone AS customer_phone
    FROM conversations conv
    LEFT JOIN customers c ON c.id = conv.customer_id
    WHERE conv.assigned_to_id = ?
    ORDER BY conv.updated_at DESC
  `, [vendedorId]);
}

function getConversationByChannelUser(channel, userId) {
  return one(`
    SELECT conv.*
    FROM customer_channels cc
    JOIN conversations conv ON conv.customer_id = cc.customer_id AND conv.channel = cc.channel
    WHERE cc.channel = ? AND cc.channel_user_id = ? AND conv.status != 'cerrado'
    ORDER BY conv.id DESC LIMIT 1
  `, [channel, userId]);
}

function updateConversationStatus(id, status) {
  run('UPDATE conversations SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, id]);
}

function updateConversationTag(id, etiqueta) {
  run('UPDATE conversations SET etiqueta = ?, updated_at = datetime(\'now\') WHERE id = ?', [etiqueta, id]);
}

function updateConversationPriority(id, priority) {
  run('UPDATE conversations SET priority = ?, updated_at = datetime(\'now\') WHERE id = ?', [priority, id]);
}

function getConversations({ channel, status, etiqueta, busqueda, vendedorId, limite, offset } = {}) {
  const conditions = [];
  const params = [];
  if (channel) { conditions.push('conv.channel = ?'); params.push(channel); }
  if (status) { conditions.push('conv.status = ?'); params.push(status); }
  if (etiqueta && etiqueta !== 'todos') { conditions.push('conv.etiqueta = ?'); params.push(etiqueta); }
  if (busqueda) {
    conditions.push('(c.name LIKE ? OR c.phone LIKE ?)');
    params.push(`%${busqueda}%`, `%${busqueda}%`);
  }
  if (vendedorId) { conditions.push('conv.assigned_to_id = ?'); params.push(Number(vendedorId)); }
  const whereStr = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const lim = Number(limite) || 50;
  const off = Number(offset) || 0;
  return all(`
    SELECT conv.*, c.name AS customer_name, c.phone AS customer_phone, v.nombre AS assigned_to_nombre
    FROM conversations conv
    LEFT JOIN customers c ON c.id = conv.customer_id
    LEFT JOIN vendedores v ON v.id = conv.assigned_to_id
    ${whereStr}
    ORDER BY conv.updated_at DESC, conv.id DESC
    LIMIT ? OFFSET ?
  `, [...params, lim, off]);
}

function getConversationCount() {
  const r = one('SELECT COUNT(*) as c FROM conversations');
  return r ? r.c : 0;
}

// --- Citas ---
function getCitas({ vendedorId, desde, hasta } = {}) {
  const conditions = [];
  const params = [];
  if (vendedorId) { conditions.push('c.vendedor_id = ?'); params.push(Number(vendedorId)); }
  if (desde) { conditions.push('c.fecha >= ?'); params.push(desde); }
  if (hasta) { conditions.push('c.fecha <= ?'); params.push(hasta); }
  const whereStr = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return all(`
    SELECT c.*, l.customer_name, l.customer_phone, v.nombre AS vendedor_nombre
    FROM citas c
    LEFT JOIN leads l ON l.id = c.lead_id
    LEFT JOIN vendedores v ON v.id = c.vendedor_id
    ${whereStr}
    ORDER BY c.fecha ASC
  `, params);
}

function getCitaById(id) {
  return one('SELECT * FROM citas WHERE id = ?', [id]);
}

function createCita({ leadId, vendedorId, titulo, fecha, notas }) {
  run('INSERT INTO citas (lead_id, vendedor_id, titulo, fecha, notas) VALUES (?, ?, ?, ?, ?)', [
    leadId || null, vendedorId || null, String(titulo), String(fecha), notas || '',
  ]);
  return one('SELECT * FROM citas WHERE id = (SELECT last_insert_rowid())');
}

function updateCita(id, data) {
  const actual = getCitaById(id);
  if (!actual) return null;
  run('UPDATE citas SET titulo = ?, fecha = ?, notas = ?, estado = ?, vendedor_id = ? WHERE id = ?', [
    data.titulo !== undefined ? String(data.titulo) : actual.titulo,
    data.fecha !== undefined ? String(data.fecha) : actual.fecha,
    data.notas !== undefined ? String(data.notas) : actual.notas,
    data.estado !== undefined ? String(data.estado) : actual.estado,
    data.vendedorId !== undefined ? (data.vendedorId || null) : actual.vendedor_id,
    id,
  ]);
  return getCitaById(id);
}

function deleteCita(id) {
  run('DELETE FROM citas WHERE id = ?', [id]);
}

// --- Puente legacy → multicanal ---
// Sincroniza un lead (tabla legacy) hacia customers/conversations/timeline
// para que el inbox multicanal del admin refleje TODO el movimiento de WhatsApp.
// data: { direction: 'incoming'|'outgoing', body, media, fromNumber, toNumber, messageId }
function syncLeadToConversation(lead, data = {}) {
  try {
    if (!lead || !lead.id) return null;
    const phone = lead.customer_phone || '';

    // 1. Conversación existente ligada a este lead
    let conv = one('SELECT * FROM conversations WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [lead.id]);

    if (!conv) {
      // 2. Customer por canal whatsapp/teléfono (o crearlo)
      let customer = findCustomerByChannel('whatsapp', phone);
      if (!customer) {
        customer = createCustomer(lead.customer_name || 'Cliente', phone);
        linkChannelToCustomer(customer.id, 'whatsapp', phone, lead.customer_name || '');
      }
      run('INSERT INTO conversations (channel, channel_conversation_id, customer_id, lead_id, assigned_to_id, status, etiqueta) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['whatsapp', phone, customer.id, lead.id, lead.assigned_to_id || null, lead.status === 'cerrado' ? 'cerrado' : (lead.assigned_to_id ? 'asignado' : 'nuevo'), lead.etiqueta || 'sin_clasificar']);
      conv = one('SELECT * FROM conversations WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [lead.id]);
    }
    if (!conv) return null;

    // 3. Mantener asignación/etiqueta/estado en espejo con el lead
    run('UPDATE conversations SET assigned_to_id = ?, etiqueta = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?', [
      lead.assigned_to_id || null,
      lead.etiqueta || conv.etiqueta || 'sin_clasificar',
      lead.status === 'cerrado' ? 'cerrado' : (lead.assigned_to_id ? 'asignado' : 'nuevo'),
      conv.id,
    ]);

    // 4. Evento en el timeline (si hay mensaje)
    if (data.body || data.media) {
      const m = data.media || {};
      addTimelineEvent(conv.id, 'message', {
        channel: 'whatsapp',
        body: data.body || '',
        direction: data.direction || 'incoming',
        from_number: data.fromNumber || '',
        to_number: data.toNumber || '',
        media_type: m.media_type || null,
        media_id: m.media_id || null,
        media_mime: m.media_mime || null,
        media_filename: m.media_filename || null,
        metadata: data.messageId ? { legacy_message_id: data.messageId } : undefined,
      });
      const inc = data.direction === 'incoming' ? 1 : 0;
      run('UPDATE conversations SET last_message = ?, last_message_at = datetime(\'now\'), unread_count = CASE WHEN ? = 1 THEN COALESCE(unread_count,0) + 1 ELSE unread_count END, updated_at = datetime(\'now\') WHERE id = ?',
        [String(data.body || `[${(data.media || {}).media_type || 'media'}]`).slice(0, 200), inc, conv.id]);
    }
    return conv;
  } catch (e) {
    console.error('syncLeadToConversation:', e.message);
    return null;
  }
}

// --- Timeline ---
function addTimelineEvent(conversationId, eventType, data = {}) {
  const d = data || {};
  run(`
    INSERT INTO timeline (
      conversation_id, event_type, channel, body, direction,
      from_number, to_number, media_type, media_id, media_mime, media_filename, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    conversationId, eventType || 'message', d.channel || '', d.body || '', d.direction || 'incoming',
    d.from_number || '', d.to_number || '', d.media_type || null, d.media_id || null,
    d.media_mime || null, d.media_filename || null, d.metadata ? JSON.stringify(d.metadata) : '{}',
  ]);
  return one('SELECT * FROM timeline WHERE id = (SELECT last_insert_rowid())');
}

function getTimelineByConversation(conversationId) {
  return all('SELECT * FROM timeline WHERE conversation_id = ? ORDER BY created_at ASC, id ASC', [conversationId]);
}

function getLastMessageByConversation(conversationId) {
  return one('SELECT * FROM timeline WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', [conversationId]);
}

// --- Workflows (automatización IF/THEN) ---
function getAllWorkflows({ activo } = {}) {
  if (activo === true) return all('SELECT * FROM workflows WHERE activo = 1 ORDER BY id');
  if (activo === false) return all('SELECT * FROM workflows WHERE activo = 0 ORDER BY id');
  return all('SELECT * FROM workflows ORDER BY id');
}

function getWorkflowById(id) {
  return one('SELECT * FROM workflows WHERE id = ?', [id]);
}

function createWorkflow(data) {
  run('INSERT INTO workflows (nombre, activo, trigger_event, conditions, actions) VALUES (?, ?, ?, ?, ?)', [
    data.nombre, data.activo === false ? 0 : 1, data.trigger_event,
    JSON.stringify(data.conditions || []), JSON.stringify(data.actions || []),
  ]);
  return one('SELECT * FROM workflows WHERE id = (SELECT last_insert_rowid())');
}

function updateWorkflow(id, data) {
  const actual = getWorkflowById(id);
  if (!actual) return null;
  run('UPDATE workflows SET nombre = ?, activo = ?, trigger_event = ?, conditions = ?, actions = ? WHERE id = ?', [
    data.nombre !== undefined ? data.nombre : actual.nombre,
    data.activo !== undefined ? (data.activo ? 1 : 0) : actual.activo,
    data.trigger_event !== undefined ? data.trigger_event : actual.trigger_event,
    data.conditions !== undefined ? JSON.stringify(data.conditions) : actual.conditions,
    data.actions !== undefined ? JSON.stringify(data.actions) : actual.actions,
    id,
  ]);
  return getWorkflowById(id);
}

function deleteWorkflow(id) {
  run('DELETE FROM workflows WHERE id = ?', [id]);
}

function addWorkflowLog(workflowId, conversationId, triggerEvent, result) {
  run('INSERT INTO workflow_logs (workflow_id, conversation_id, trigger_event, result) VALUES (?, ?, ?, ?)', [
    workflowId, conversationId || null, triggerEvent, JSON.stringify(result || {}),
  ]);
}

function getWorkflowLogs(workflowId) {
  return all('SELECT * FROM workflow_logs WHERE workflow_id = ? ORDER BY created_at DESC, id DESC', [workflowId]);
}

module.exports = {
  initDB, getDB, saveLead, assignLeadToVendedor, saveMessage,
  getVendedoresActivos, getLeadById, getLeadByCustomerPhone,
  updateLeadStatus, setFirstResponse,
  getLeads, getLeadCount, getLeadsSinRespuesta, incrementEscalation,
  marcarLeido, setLeadNombre,
  addVendedor, getVendedores, setVendedorEstado, getVendedorByTelefono, setVendedorPin,
  createUsuario, getUsuarioByEmail, getUsuarioById, getUsuarios,
  countUsuarios, updateUsuarioPassword,
  getLeadsByVendedorId, getMessagesByLead, getMessageById,
  getTemplates, addTemplate, deleteTemplate,
  savePushSubscription, getPushSubscriptionsByVendedor, deletePushSubscription,
  createDBSession, getDBSession, deleteDBSession, cleanExpiredSessions,
  getConfig, setConfig,
  getWATemplates, addWATemplate, deleteWATemplate,
  setLeadEtiqueta, getNotasByLead, addNota, deleteNota, reassignLead,
  deleteVendedor, getAdminInbox, getAdminInboxStats,
  // Nuevo schema multicanal
  createCustomer, getCustomerById, findCustomerByChannel,
  linkChannelToCustomer, getCustomerChannels, getCustomers, updateCustomer, deleteCustomer,
  getActiveConversationsByCustomer,
  createConversation, getConversationById, getConversationsByVendedorId,
  getConversationByChannelUser, updateConversationStatus, updateConversationTag,
  updateConversationPriority, getConversations, getConversationCount,
  addTimelineEvent, getTimelineByConversation, getLastMessageByConversation,
  syncLeadToConversation,
  getCitas, getCitaById, createCita, updateCita, deleteCita,
  getAllWorkflows, getWorkflowById, createWorkflow, updateWorkflow, deleteWorkflow,
  addWorkflowLog, getWorkflowLogs,
};
