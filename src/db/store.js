const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'sp-leads.db');

let db;

function q(v) { return `'${String(v).replace(/'/g, "''")}'`; }

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
  `);
  saveDB();
  return db;
}

function saveDB() {
  if (db) {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  }
}

function getDB() { return db; }

function esc(v) { return String(v).replace(/'/g, "''"); }

function saveLead(customerPhone, customerName, messageBody) {
  const d = getDB();
  const existing = d.exec(`SELECT id, messages_count, status FROM leads WHERE customer_phone = ${q(customerPhone)} AND status != 'cerrado'`);
  if (existing.length > 0 && existing[0].values.length > 0) {
    const r = existing[0].values[0];
    d.run(`UPDATE leads SET messages_count = ${r[1] + 1}, last_message = ${q(messageBody)}, updated_at = datetime('now') WHERE id = ${r[0]}`);
    saveDB();
    return { leadId: r[0], isNew: false };
  }
  d.run(`INSERT INTO leads (customer_phone, customer_name, first_message, last_message) VALUES (${q(customerPhone)}, ${q(customerName)}, ${q(messageBody)}, ${q(messageBody)})`);
  saveDB();
  const r = d.exec('SELECT last_insert_rowid()');
  return { leadId: r[0].values[0][0], isNew: true };
}

function assignLeadToVendedor(leadId, vendedor) {
  const d = getDB();
  d.run(`UPDATE leads SET assigned_to_id = ${vendedor.id}, assigned_to_phone = ${q(vendedor.telefono)}, status = 'asignado', updated_at = datetime('now') WHERE id = ${leadId}`);
  d.run(`UPDATE vendedores SET total_leads = total_leads + 1 WHERE id = ${vendedor.id}`);
  saveDB();
}

function saveMessage(leadId, from, to, body, direction) {
  const d = getDB();
  d.run(`INSERT INTO messages (lead_id, from_number, to_number, body, direction) VALUES (${leadId}, ${q(from)}, ${q(to)}, ${q(body)}, ${q(direction)})`);
  saveDB();
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
  addVendedor, getVendedores, setVendedorEstado,
};
