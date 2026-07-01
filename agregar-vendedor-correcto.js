#!/usr/bin/env node

/**
 * Script para agregar el vendedor CON EL TELÉFONO EXACTO
 * Esto es crítico — el número debe ser EXACTAMENTE igual al que usas en WhatsApp
 */

const path = require('path');
const fs = require('fs');

// Cargar la base de datos
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const initSqlJs = require('sql.js');
const DB_PATH = path.join(DATA_DIR, 'sp-leads.db');

async function addVendedor() {
  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
    // Crear tablas si no existen
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
    `);
  }

  // Tu número exacto
  const TELEFONO = '573214312518';  // ⚠️ SIN +57, SIN espacios, SIN caracteres especiales
  const NOMBRE = 'Vendedor Principal';

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('   📞 AGREGANDO VENDEDOR');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Nombre:      ${NOMBRE}`);
  console.log(`Teléfono:    +57 ${TELEFONO.slice(2).replace(/(\d{3})(?=\d)/g, '$1 ')}`);
  console.log(`Formato DB:  ${TELEFONO}\n`);

  try {
    // Verificar si ya existe
    const existing = db.exec(`SELECT * FROM vendedores WHERE telefono = '${TELEFONO}'`);
    if (existing.length > 0 && existing[0].values.length > 0) {
      console.log('❌ Este vendedor ya existe en la base de datos:\n');
      const cols = existing[0].columns;
      const row = existing[0].values[0];
      cols.forEach((col, i) => {
        console.log(`   ${col}: ${row[i]}`);
      });
      console.log('\n✅ No se agregó (ya existe)');
      return;
    }

    // Insertar nuevo vendedor
    db.run(`INSERT INTO vendedores (nombre, telefono, estado) VALUES ('${NOMBRE}', '${TELEFONO}', 'activo')`);

    // Guardar base de datos
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

    console.log('✅ Vendedor agregado exitosamente!\n');

    // Verificar que quedó bien
    const verificar = db.exec(`SELECT * FROM vendedores WHERE telefono = '${TELEFONO}'`);
    if (verificar.length > 0 && verificar[0].values.length > 0) {
      console.log('📋 Datos guardados en base de datos:');
      const cols = verificar[0].columns;
      const row = verificar[0].values[0];
      cols.forEach((col, i) => {
        console.log(`   ${col}: ${row[i]}`);
      });
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('   ✅ LISTO PARA RECIBIR LEADS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('Próximos pasos:');
    console.log('   1. Configura el webhook en Meta');
    console.log('   2. Envía un mensaje a +57 3214625618');
    console.log('   3. Deberías recibir el mensaje en +57 3214312518');
    console.log('   4. Responde desde ese número');
    console.log('   5. El cliente recibirá tu respuesta\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

addVendedor();
