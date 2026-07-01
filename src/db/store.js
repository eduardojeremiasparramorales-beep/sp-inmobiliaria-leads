const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'sp-leads.db');

let db;

function q(v) { return `'${String(v).replace(/'/g, "''")}'`; }

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

  // Crear índices para mejorar performance en queries frecuentes
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

  // Migración: columnas de multimedia en messages (añadir si no existen)
  ensureColumn('messages', 'media_type', 'TEXT');
  ensureColumn('messages', 'media_id', 'TEXT');
  ensureColumn('messages', 'media_mime', 'TEXT');
  ensureColumn('messages', 'media_filename', 'TEXT');

  // Migración: PIN para vendedores
  ensureColumn('vendedores', 'pin', 'TEXT');

  // Tabla de sesiones persistentes (30 días, sobrevive reinicios)
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

  // Tabla de suscripciones push (Fase push)
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

function saveDB() {
  if (db) {
    try {
      fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    } catch (error) {
      console.error('ERROR CRÍTICO al guardar base de datos:', error.message);
      console.error('Posibles causas: volumen lleno, permisos insuficientes, ruta inválida');
      console.error('Archivo intentado:', DB_PATH);
      throw error;
    }
  }
}

function getDB() { return db; }

function esc(v) { return String(v).replace(/'/g, "''"); }

function saveLead(customerPhone, customerName, messageBody) {
  const d = getDB();
  if (!customerPhone || !messageBody) {
    throw new Error('saveLead: customerPhone y messageBody son obligatorios');
  }

  const existing = d.exec(`SELECT id, messages_count, status FROM leads WHERE customer_phone = ${q(customerPhone)} AND status != 'cerrado'`);
  if (existing.length > 0 && existing[0].values.length > 0) {
    const r = existing[0].values[0];
    d.run(`UPDATE leads SET messages_count = ${r[1] + 1}, last_message = ${q(messageBody)}, updated_at = datetime('now') WHERE id = ${r[0]}`);
    saveDB();
    return { leadId: r[0], isNew: false };
  }

  d.run(`INSERT INTO leads (customer_phone, customer_name, first_message, last_message) VALUES (${q(customerPhone)}, ${q(customerName)}, ${q(messageBody)}, ${q(messageBody)})`);
  saveDB();

  // Obtener el ID del nuevo lead
  const r = d.exec(`SELECT id FROM leads WHERE customer_phone = ${q(customerPhone)} ORDER BY id DESC LIMIT 1`);
  const leadId = (r.length > 0 && r[0].values.length > 0) ? r[0].values[0][0] : null;
  if (!leadId) {
    throw new Error('No se pudo obtener ID del lead después de INSERT');
  }
  return { leadId, isNew: true };
}

function assignLeadToVendedor(leadId, vendedor) {
  if (!leadId || !vendedor || !vendedor.id || !vendedor.telefono) {
    throw new Error('assignLeadToVendedor: leadId y vendedor (con id y telefono) son obligatorios');
  }

  const d = getDB();

  // Validar que el lead existe
  const leadExists = d.exec(`SELECT id FROM leads WHERE id = ${leadId}`);
  if (leadExists.length === 0 || leadExists[0].values.length === 0) {
    throw new Error(`Lead ${leadId} no existe`);
  }

  // Validar que el vendedor existe
  const vendedorExists = d.exec(`SELECT id FROM vendedores WHERE id = ${vendedor.id}`);
  if (vendedorExists.length === 0 || vendedorExists[0].values.length === 0) {
    throw new Error(`Vendedor ${vendedor.id} no existe`);
  }

  d.run(`UPDATE leads SET assigned_to_id = ${vendedor.id}, assigned_to_phone = ${q(vendedor.telefono)}, status = 'asignado', updated_at = datetime('now') WHERE id = ${leadId}`);
  d.run(`UPDATE vendedores SET total_leads = total_leads + 1 WHERE id = ${vendedor.id}`);
  saveDB();
}

function saveMessage(leadId, from, to, body, direction, media) {
  const d = getDB();
  const m = media || {};
  const mediaType = m.media_type ? q(m.media_type) : 'NULL';
  const mediaId = m.media_id ? q(m.media_id) : 'NULL';
  const mediaMime = m.media_mime ? q(m.media_mime) : 'NULL';
  const mediaFile = m.media_filename ? q(m.media_filename) : 'NULL';
  d.run(`INSERT INTO messages (lead_id, from_number, to_number, body, direction, media_type, media_id, media_mime, media_filename) VALUES (${leadId}, ${q(from)}, ${q(to)}, ${q(body)}, ${q(direction)}, ${mediaType}, ${mediaId}, ${mediaMime}, ${mediaFile})`);
  saveDB();
  const r = d.exec(`SELECT id FROM messages WHERE lead_id = ${Number(leadId)} ORDER BY id DESC LIMIT 1`);
  return (r.length && r[0].values.length) ? r[0].values[0][0] : null;
}

function getMessageById(id) {
  const d = getDB();
  return rowOne(d.exec(`SELECT * FROM messages WHERE id = ${Number(id)} LIMIT 1`));
}

function getVendedoresActivos() {
  const d = getDB();
  const r = d.exec("SELECT * FROM vendedores WHERE estado = 'activo' ORDER BY total_leads ASC");
  if (r.length === 0) return [];
  const cols = r[0].columns;
  return r[0].values.map(row => {
    const o = {};
    cols.forEach((c, i) => { o[c] = row[i]; });
    return o;
  });
}

function getLeadById(id) {
  const d = getDB();
  const r = d.exec(`SELECT * FROM leads WHERE id = ${Number(id)}`);
  if (r.length === 0 || r[0].values.length === 0) return null;
  const cols = r[0].columns;
  const o = {};
  cols.forEach((c, i) => { o[c] = r[0].values[0][i]; });
  return o;
}

function getLeadByCustomerPhone(phone) {
  const d = getDB();
  const r = d.exec(`SELECT * FROM leads WHERE customer_phone = ${q(phone)} AND status != 'cerrado'`);
  if (r.length === 0 || r[0].values.length === 0) return null;
  const cols = r[0].columns;
  const o = {};
  cols.forEach((c, i) => { o[c] = r[0].values[0][i]; });
  return o;
}

function updateLeadStatus(leadId, status) {
  const d = getDB();
  d.run(`UPDATE leads SET status = ${q(status)}, updated_at = datetime('now') WHERE id = ${leadId}`);
  saveDB();
}

function setFirstResponse(leadId) {
  const d = getDB();
  d.run(`UPDATE leads SET first_response_at = datetime('now') WHERE id = ${leadId} AND first_response_at IS NULL`);
  saveDB();
}

function getLeads() {
  const d = getDB();
  const r = d.exec('SELECT * FROM leads ORDER BY created_at DESC');
  if (r.length === 0) return [];
  const cols = r[0].columns;
  return r[0].values.map(row => {
    const o = {};
    cols.forEach((c, i) => { o[c] = row[i]; });
    return o;
  });
}

function getLeadCount() {
  const d = getDB();
  const r = d.exec('SELECT COUNT(*) as c FROM leads');
  return r[0]?.values[0]?.[0] || 0;
}

function getLeadsSinRespuesta(minutos) {
  const d = getDB();
  const r = d.exec(`SELECT * FROM leads WHERE status = 'asignado' AND first_response_at IS NULL AND created_at <= datetime('now', '-${minutos} minutes')`);
  if (r.length === 0) return [];
  const cols = r[0].columns;
  return r[0].values.map(row => {
    const o = {};
    cols.forEach((c, i) => { o[c] = row[i]; });
    return o;
  });
}

function incrementEscalation(leadId) {
  const d = getDB();
  d.run(`UPDATE leads SET escalation_level = escalation_level + 1 WHERE id = ${leadId}`);
  saveDB();
}

function addVendedor(nombre, telefono) {
  const d = getDB();
  d.run(`INSERT OR IGNORE INTO vendedores (nombre, telefono) VALUES (${q(nombre)}, ${q(telefono)})`);
  saveDB();
  const r = d.exec(`SELECT id FROM vendedores WHERE telefono = ${q(telefono)} LIMIT 1`);
  return (r.length > 0 && r[0].values.length > 0) ? r[0].values[0][0] : null;
}

// --- Helper: convierte el resultado de sql.js en array de objetos ---
function rows(result) {
  if (!result || result.length === 0) return [];
  const cols = result[0].columns;
  return result[0].values.map(row => {
    const o = {};
    cols.forEach((c, i) => { o[c] = row[i]; });
    return o;
  });
}

function rowOne(result) {
  const r = rows(result);
  return r.length > 0 ? r[0] : null;
}

// --- Usuarios (login) ---
function createUsuario(email, passwordHash, nombre, rol, vendedorId) {
  const d = getDB();
  d.run(`INSERT INTO usuarios (email, password, nombre, rol, vendedor_id) VALUES (${q(email)}, ${q(passwordHash)}, ${q(nombre)}, ${q(rol)}, ${vendedorId ? Number(vendedorId) : 'NULL'})`);
  saveDB();
  return rowOne(d.exec(`SELECT * FROM usuarios WHERE email = ${q(email)} LIMIT 1`));
}

function getUsuarioByEmail(email) {
  const d = getDB();
  return rowOne(d.exec(`SELECT * FROM usuarios WHERE email = ${q(email)} LIMIT 1`));
}

function getUsuarioById(id) {
  const d = getDB();
  return rowOne(d.exec(`SELECT * FROM usuarios WHERE id = ${Number(id)} LIMIT 1`));
}

function getUsuarios() {
  const d = getDB();
  return rows(d.exec(`SELECT id, email, nombre, rol, vendedor_id, created_at FROM usuarios ORDER BY nombre`));
}

function countUsuarios() {
  const d = getDB();
  const r = d.exec('SELECT COUNT(*) as c FROM usuarios');
  return r[0]?.values[0]?.[0] || 0;
}

function updateUsuarioPassword(id, passwordHash) {
  const d = getDB();
  d.run(`UPDATE usuarios SET password = ${q(passwordHash)} WHERE id = ${Number(id)}`);
  saveDB();
}

// --- Leads y mensajes por vendedor (para el panel) ---
function getLeadsByVendedorId(vendedorId) {
  const d = getDB();
  return rows(d.exec(`SELECT * FROM leads WHERE assigned_to_id = ${Number(vendedorId)} ORDER BY updated_at DESC`));
}

function getMessagesByLead(leadId) {
  const d = getDB();
  return rows(d.exec(`SELECT * FROM messages WHERE lead_id = ${Number(leadId)} ORDER BY timestamp ASC, id ASC`));
}

// --- Templates (respuestas rápidas) ---
function getTemplates() {
  const d = getDB();
  return rows(d.exec('SELECT * FROM templates ORDER BY titulo'));
}

function addTemplate(titulo, cuerpo) {
  const d = getDB();
  d.run(`INSERT INTO templates (titulo, cuerpo) VALUES (${q(titulo)}, ${q(cuerpo)})`);
  saveDB();
}

function deleteTemplate(id) {
  const d = getDB();
  d.run(`DELETE FROM templates WHERE id = ${Number(id)}`);
  saveDB();
}

// --- Suscripciones push ---
function savePushSubscription(vendedorId, sub) {
  const d = getDB();
  const keys = sub.keys || {};
  d.run(`INSERT OR REPLACE INTO push_subscriptions (vendedor_id, endpoint, p256dh, auth) VALUES (${Number(vendedorId)}, ${q(sub.endpoint)}, ${q(keys.p256dh || '')}, ${q(keys.auth || '')})`);
  saveDB();
}

function getPushSubscriptionsByVendedor(vendedorId) {
  const d = getDB();
  return rows(d.exec(`SELECT * FROM push_subscriptions WHERE vendedor_id = ${Number(vendedorId)}`));
}

function deletePushSubscription(endpoint) {
  const d = getDB();
  d.run(`DELETE FROM push_subscriptions WHERE endpoint = ${q(endpoint)}`);
  saveDB();
}

function getVendedores() {
  const d = getDB();
  const r = d.exec('SELECT * FROM vendedores ORDER BY nombre');
  if (r.length === 0) return [];
  const cols = r[0].columns;
  return r[0].values.map(row => {
    const o = {};
    cols.forEach((c, i) => { o[c] = row[i]; });
    return o;
  });
}

function getVendedorByTelefono(telefono) {
  return rowOne(getDB().exec(`SELECT * FROM vendedores WHERE telefono = ${q(telefono)} LIMIT 1`));
}

function setVendedorPin(id, pinHash) {
  getDB().run(`UPDATE vendedores SET pin = ${q(pinHash)} WHERE id = ${Number(id)}`);
  saveDB();
}

// --- Sesiones persistentes en DB ---

function createDBSession(token, data) {
  const d = getDB();
  d.run(`INSERT OR REPLACE INTO sessions (token, user_id, vendedor_id, rol, nombre, email, created_at)
    VALUES (${q(token)}, ${data.userId != null ? Number(data.userId) : 'NULL'}, ${data.vendedorId != null ? Number(data.vendedorId) : 'NULL'}, ${q(data.rol || 'vendedor')}, ${q(data.nombre || '')}, ${q(data.email || '')}, ${Date.now()})`);
  saveDB();
}

function getDBSession(token) {
  return rowOne(getDB().exec(`SELECT * FROM sessions WHERE token = ${q(token)} LIMIT 1`));
}

function deleteDBSession(token) {
  getDB().run(`DELETE FROM sessions WHERE token = ${q(token)}`);
  saveDB();
}

function cleanExpiredSessions(ttlMs) {
  getDB().run(`DELETE FROM sessions WHERE created_at < ${Date.now() - ttlMs}`);
  saveDB();
}

function setVendedorEstado(id, estado) {
  const d = getDB();
  d.run(`UPDATE vendedores SET estado = ${q(estado)} WHERE id = ${Number(id)}`);
  saveDB();
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
};
