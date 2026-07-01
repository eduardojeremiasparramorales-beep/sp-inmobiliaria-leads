#!/usr/bin/env node

/**
 * Script para RESETEAR la base de datos
 * Elimina todos los leads pero mantiene los vendedores
 */

const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'sp-leads.db');

async function reset() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              RESETEAR BASE DE DATOS                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const SQL = await initSqlJs();

  if (!fs.existsSync(DB_PATH)) {
    console.log('ℹ️  Base de datos no existe. Creando nueva...\n');
  } else {
    console.log('🗑️  Eliminando base de datos antigua...');
    try {
      fs.unlinkSync(DB_PATH);
      console.log('✅ Base de datos eliminada\n');
    } catch (e) {
      console.log('⚠️  No se pudo eliminar la BD antigua. Continuando...\n');
    }
  }

  // Crear nueva base de datos
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE vendedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL UNIQUE,
      email TEXT DEFAULT '',
      estado TEXT DEFAULT 'activo',
      rol TEXT DEFAULT 'vendedor',
      total_leads INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE leads (
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
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      from_number TEXT NOT NULL,
      to_number TEXT NOT NULL,
      body TEXT NOT NULL,
      direction TEXT DEFAULT 'incoming',
      timestamp DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      nombre TEXT,
      rol TEXT DEFAULT 'vendedor',
      vendedor_id INTEGER,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  // Crear índices
  db.run(`CREATE INDEX idx_leads_customer_phone ON leads(customer_phone)`);
  db.run(`CREATE INDEX idx_leads_assigned_to_id ON leads(assigned_to_id)`);
  db.run(`CREATE INDEX idx_leads_assigned_to_phone ON leads(assigned_to_phone)`);
  db.run(`CREATE INDEX idx_leads_status ON leads(status)`);
  db.run(`CREATE INDEX idx_leads_created_at ON leads(created_at)`);
  db.run(`CREATE INDEX idx_messages_lead_id ON messages(lead_id)`);
  db.run(`CREATE INDEX idx_vendedores_telefono ON vendedores(telefono)`);
  db.run(`CREATE INDEX idx_vendedores_estado ON vendedores(estado)`);

  // Agregar vendedor
  db.run(`INSERT INTO vendedores (nombre, telefono, estado) VALUES ('Vendedor Principal', '573214312518', 'activo')`);

  // Guardar
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

  console.log('✅ Base de datos RESETEADA\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📋 ESTADO ACTUAL');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Vendedores:');
  console.log('   ✅ Vendedor Principal (+57 3214312518) - ACTIVO\n');

  console.log('Leads:');
  console.log('   ✅ Limpios - listos para recibir nuevos\n');

  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('Próximos pasos:');
  console.log('   1. npm start');
  console.log('   2. Envía un mensaje a +57 3214625618');
  console.log('   3. Ejecuta: node diagnostico-asignacion.js');
  console.log('   4. Verifica que el lead está asignado\n');
}

reset().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
