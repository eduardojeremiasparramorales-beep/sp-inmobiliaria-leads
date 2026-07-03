const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'sp-leads.db');

let db;
let usingBetterSqlite3 = false;

async function initDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  try {
    // Intentar usar better-sqlite3 (producción)
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    usingBetterSqlite3 = true;
    console.log('[DB] Usando better-sqlite3');
  } catch (e) {
    // Fallback a sql.js (desarrollo)
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      db = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
      db = new SQL.Database();
    }
    usingBetterSqlite3 = false;
    console.log('[DB] Usando sql.js (development fallback)');
  }

  return db;
}

function all(sql, params = []) {
  if (!db) return [];
  if (usingBetterSqlite3) {
    return db.prepare(sql).all(...params);
  } else {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }
}

function one(sql, params = []) {
  if (!db) return null;
  if (usingBetterSqlite3) {
    return db.prepare(sql).get(...params) || null;
  } else {
    const rows = all(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }
}

function run(sql, params = []) {
  if (!db) return;
  if (usingBetterSqlite3) {
    db.prepare(sql).run(...params);
  } else {
    db.run(sql, params);
    scheduleSave();
  }
}

function exec(sql) {
  if (!db) return;
  if (usingBetterSqlite3) {
    db.exec(sql);
  } else {
    db.run(sql);
  }
}

function saveDBIfNeeded() {
  if (!db || usingBetterSqlite3) return; // better-sqlite3 persiste automáticamente
  // sql.js necesita guardar manualmente
  try {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  } catch (error) {
    console.error('ERROR CRÍTICO al guardar base de datos:', error.message);
  }
}

// Auto-save cada 500ms para sql.js
let _saveTimer = null;
function scheduleSave() {
  if (usingBetterSqlite3) return; // No necesario en better-sqlite3
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveDBIfNeeded, 500);
}

module.exports = {
  initDB,
  all,
  one,
  run,
  exec,
  getDB: () => db,
  saveDBIfNeeded,
  scheduleSave,
  isBetterSqlite3: () => usingBetterSqlite3,
};
