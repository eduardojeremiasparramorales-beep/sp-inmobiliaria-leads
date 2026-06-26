const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'leads.db');

let db;

async function initDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_phone TEXT NOT NULL,
      customer_name TEXT DEFAULT '',
      assigned_to TEXT DEFAULT '',
      status TEXT DEFAULT 'nuevo',
      messages_count INTEGER DEFAULT 1,
      first_message TEXT,
      last_message TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );
  `);
  db.run(`
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
  `);

  saveDB();
  return db;
}

function saveDB() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getDB() {
  return db;
}

function saveLead(customerPhone, vendedor, messageBody) {
  const d = getDB();
  const existing = d.exec(
    `SELECT id, messages_count FROM leads WHERE customer_phone = '${customerPhone.replace(/'/g, "''")}'`
  );

  if (existing.length > 0 && existing[0].values.length > 0) {
    const row = existing[0].values[0];
    const id = row[0];
    const count = row[1];
    d.run(
      `UPDATE leads SET messages_count = ${count + 1}, last_message = '${messageBody.replace(/'/g, "''")}', updated_at = datetime('now') WHERE id = ${id}`
    );
    saveDB();
    return { leadId: id, isNew: false };
  }

  const escPhone = customerPhone.replace(/'/g, "''");
  const escMsg = messageBody.replace(/'/g, "''");
  d.run(
    `INSERT INTO leads (customer_phone, assigned_to, first_message, last_message) VALUES ('${escPhone}', '${vendedor.replace(/'/g, "''")}', '${escMsg}', '${escMsg}')`
  );
  saveDB();

  const result = d.exec('SELECT last_insert_rowid() as id');
  const leadId = result[0].values[0][0];
  return { leadId, isNew: true };
}

function saveMessage(leadId, from, to, body, direction) {
  const d = getDB();
  d.run(
    `INSERT INTO messages (lead_id, from_number, to_number, body, direction) VALUES (${leadId}, '${from.replace(/'/g, "''")}', '${to.replace(/'/g, "''")}', '${body.replace(/'/g, "''")}', '${direction}')`
  );
  saveDB();
}

function getLeads() {
  const d = getDB();
  const result = d.exec('SELECT * FROM leads ORDER BY created_at DESC');
  if (result.length === 0) return [];
  const cols = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function getLeadCount() {
  const d = getDB();
  const result = d.exec('SELECT COUNT(*) as count FROM leads');
  if (result.length === 0) return 0;
  return result[0].values[0][0];
}

module.exports = { initDB, saveLead, saveMessage, getLeads, getLeadCount };
