const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'sp-leads.db');

let db;

// Helper: ejecuta SELECT y devuelve array de objetos (parameterizado)
function all(sql, params = []) {
  if (!db) return [];
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function one(sql, params = []) {
  const rows = all(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function run(sql, params = []) {
  if (!db) return;
  db.run(sql, params);
}

// Añade una columna a una tabla solo si aún no existe (migración segura)
function ensureColumn(table, column, type) {
  try {
    const info = db.exec(`PRAGMA table_info(${table})`);
    const cols = info.length ? info[0].values.map(r => r[1]) : [];
    if (!cols.includes(column)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  } catch (e) {
    console.error(`ensureColumn ${table}.${column}:`, e.message);
  }
}

async function initDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run(`
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

  db.run(`CREATE INDEX IF NOT EXISTS idx_leads_customer_phone ON leads(customer_phone)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_id ON leads(assigned_to_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_phone ON leads(assigned_to_phone)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_vendedores_telefono ON vendedores(telefono)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_vendedores_estado ON vendedores(estado)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usuarios_vendedor_id ON usuarios(vendedor_id)`);

  ensureColumn('messages', 'media_type', 'TEXT');
  ensureColumn('messages', 'media_id', 'TEXT');
  ensureColumn('messages', 'media_mime', 'TEXT');
  ensureColumn('messages', 'media_filename', 'TEXT');
  ensureColumn('vendedores', 'pin', 'TEXT');
  ensureColumn('leads', 'etiqueta', 'TEXT');

  db.run(`
    CREATE TABLE IF NOT EXISTS lead_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      autor TEXT DEFAULT '',
      nota TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS wa_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      idioma TEXT DEFAULT 'es',
      params TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendedor_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_push_vendedor ON push_subscriptions(vendedor_id)`);

  saveDB();
  return db;
}

let _saveTimer = null;

function saveDB() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    saveDBImmediate();
  }, 500);
}

function saveDBImmediate() {
  if (!db) return;
  try {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  } catch (error) {
    console.error('ERROR CRÍTICO al guardar base de datos:', error.message);
    console.error('Archivo intentado:', DB_PATH);
    throw error;
  }
}

function getDB() { return db; }

function saveLead(customerPhone, customerName, messageBody) {
  if (!customerPhone || !messageBody) {
    throw new Error('saveLead: customerPhone y messageBody son obligatorios');
  }

  const existing = one('SELECT id, messages_count, status FROM leads WHERE customer_phone = ? AND status != ?', [customerPhone, 'cerrado']);
  if (existing) {
    run('UPDATE leads SET messages_count = ?, last_message = ?, updated_at = datetime(\'now\') WHERE id = ?', [existing.messages_count + 1, messageBody, existing.id]);
    saveDB();
    return { leadId: existing.id, isNew: false };
  }

  run('INSERT INTO leads (customer_phone, customer_name, first_message, last_message) VALUES (?, ?, ?, ?)', [customerPhone, customerName, messageBody, messageBody]);
  saveDB();

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
  saveDB();
}

function saveMessage(leadId, from, to, body, direction, media) {
  const m = media || {};
  run('INSERT INTO messages (lead_id, from_number, to_number, body, direction, media_type, media_id, media_mime, media_filename) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    leadId, from, to, body, direction,
    m.media_type || null, m.media_id || null, m.media_mime || null, m.media_filename || null,
  ]);
  saveDB();
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
  saveDB();
}

function setFirstResponse(leadId) {
  run('UPDATE leads SET first_response_at = datetime(\'now\') WHERE id = ? AND first_response_at IS NULL', [leadId]);
  saveDB();
}

function getLeads() {
  return all('SELECT * FROM leads ORDER BY created_at DESC');
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
  saveDB();
}

function addVendedor(nombre, telefono) {
  run('INSERT OR IGNORE INTO vendedores (nombre, telefono) VALUES (?, ?)', [nombre, telefono]);
  saveDB();
  const r = one('SELECT id FROM vendedores WHERE telefono = ? LIMIT 1', [telefono]);
  return r ? r.id : null;
}

// --- Usuarios (login) ---
function createUsuario(email, passwordHash, nombre, rol, vendedorId) {
  run('INSERT INTO usuarios (email, password, nombre, rol, vendedor_id) VALUES (?, ?, ?, ?, ?)', [email, passwordHash, nombre, rol, vendedorId]);
  saveDB();
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
  saveDB();
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
  saveDB();
}

function deleteTemplate(id) {
  run('DELETE FROM templates WHERE id = ?', [id]);
  saveDB();
}

// --- Suscripciones push ---
function savePushSubscription(vendedorId, sub) {
  const keys = sub.keys || {};
  run('INSERT OR REPLACE INTO push_subscriptions (vendedor_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)', [vendedorId, sub.endpoint, keys.p256dh || '', keys.auth || '']);
  saveDB();
}

function getPushSubscriptionsByVendedor(vendedorId) {
  return all('SELECT * FROM push_subscriptions WHERE vendedor_id = ?', [vendedorId]);
}

function deletePushSubscription(endpoint) {
  run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
  saveDB();
}

function getVendedores() {
  return all('SELECT * FROM vendedores ORDER BY nombre');
}

function getVendedorByTelefono(telefono) {
  return one('SELECT * FROM vendedores WHERE telefono = ? LIMIT 1', [telefono]);
}

function setVendedorPin(id, pinHash) {
  run('UPDATE vendedores SET pin = ? WHERE id = ?', [pinHash, id]);
  saveDB();
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
  saveDB();
}

function getDBSession(token) {
  return one('SELECT * FROM sessions WHERE token = ? LIMIT 1', [token]);
}

function deleteDBSession(token) {
  run('DELETE FROM sessions WHERE token = ?', [token]);
  saveDB();
}

function cleanExpiredSessions(ttlMs) {
  run('DELETE FROM sessions WHERE created_at < ?', [Date.now() - ttlMs]);
  saveDB();
}

// --- Configuración general ---
function getConfig(key) {
  const r = one('SELECT value FROM config WHERE key = ? LIMIT 1', [key]);
  return r ? r.value : null;
}

function setConfig(key, value) {
  run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, value]);
  saveDB();
}

// --- Templates de WhatsApp aprobados por Meta ---
function getWATemplates() {
  return all('SELECT * FROM wa_templates ORDER BY nombre');
}

function addWATemplate(nombre, idioma, params) {
  run('INSERT OR REPLACE INTO wa_templates (nombre, idioma, params) VALUES (?, ?, ?)', [nombre, idioma || 'es', params || '']);
  saveDB();
}

function deleteWATemplate(id) {
  run('DELETE FROM wa_templates WHERE id = ?', [id]);
  saveDB();
}

function setVendedorEstado(id, estado) {
  run('UPDATE vendedores SET estado = ? WHERE id = ?', [estado, id]);
  saveDB();
}

// --- Etiqueta de pipeline del lead ---
function setLeadEtiqueta(leadId, etiqueta) {
  run('UPDATE leads SET etiqueta = ?, updated_at = datetime(\'now\') WHERE id = ?', [etiqueta, leadId]);
  saveDB();
}

// --- Notas internas por lead ---
function getNotasByLead(leadId) {
  return all('SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC, id DESC', [leadId]);
}

function addNota(leadId, autor, nota) {
  run('INSERT INTO lead_notes (lead_id, autor, nota) VALUES (?, ?, ?)', [leadId, autor || '', nota]);
  saveDB();
}

function deleteNota(id) {
  run('DELETE FROM lead_notes WHERE id = ?', [id]);
  saveDB();
}

// --- Reasignación manual de un lead ---
function reassignLead(leadId, vendedor) {
  run('UPDATE leads SET assigned_to_id = ?, assigned_to_phone = ?, updated_at = datetime(\'now\') WHERE id = ?', [vendedor.id, vendedor.telefono, leadId]);
  run('UPDATE vendedores SET total_leads = total_leads + 1 WHERE id = ?', [vendedor.id]);
  saveDB();
}

// --- Eliminar vendedor y reasignar sus leads ---
function deleteVendedor(id) {
  const activos = all('SELECT * FROM vendedores WHERE estado = ? AND id != ? ORDER BY total_leads ASC LIMIT 1', ['activo', id]);
  if (activos.length > 0) {
    const siguiente = activos[0];
    const leadsReasignar = all('SELECT id FROM leads WHERE assigned_to_id = ? AND status != ?', [id, 'cerrado']);
    leadsReasignar.forEach(lead => {
      run('UPDATE leads SET assigned_to_id = ?, assigned_to_phone = ?, updated_at = datetime(\'now\') WHERE id = ?', [siguiente.id, siguiente.telefono, lead.id]);
      run('UPDATE vendedores SET total_leads = total_leads + 1 WHERE id = ?', [siguiente.id]);
    });
  }
  run('DELETE FROM push_subscriptions WHERE vendedor_id = ?', [id]);
  run('DELETE FROM sessions WHERE vendedor_id = ?', [id]);
  run('DELETE FROM usuarios WHERE vendedor_id = ?', [id]);
  run('DELETE FROM vendedores WHERE id = ?', [id]);
  saveDB();
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

module.exports = {
  initDB, getDB, saveLead, assignLeadToVendedor, saveMessage,
  getVendedoresActivos, getLeadById, getLeadByCustomerPhone,
  updateLeadStatus, setFirstResponse,
  getLeads, getLeadCount, getLeadsSinRespuesta, incrementEscalation,
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
};
