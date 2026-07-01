#!/usr/bin/env node

/**
 * SP CRM — Agregar Vendedor Real
 *
 * Script para agregar vendedores a la base de datos SQLite
 * sin necesidad de API
 */

const fs = require('fs');
const path = require('path');

async function main() {
  try {
    // Intentar usar sql.js si está instalado
    let initSqlJs;
    try {
      initSqlJs = require('sql.js');
    } catch (e) {
      console.error('❌ sql.js no instalado');
      console.error('Ejecuta: npm install sql.js\n');
      process.exit(1);
    }

    const SQL = await initSqlJs();

    // Ruta de la base de datos
    const dataDir = path.join(__dirname, 'data');
    const dbPath = path.join(dataDir, 'database.sqlite');

    // Crear carpeta data si no existe
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Leer base de datos existente o crear nueva
    let filebuffer;
    if (fs.existsSync(dbPath)) {
      filebuffer = fs.readFileSync(dbPath);
    }

    const db = new SQL.Database(filebuffer);

    // Crear tabla de vendedores si no existe
    db.run(`
      CREATE TABLE IF NOT EXISTS vendedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        telefono TEXT NOT NULL UNIQUE,
        email TEXT UNIQUE,
        estado TEXT DEFAULT 'activo',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Vendedores a agregar
    const vendedores = [
      {
        nombre: 'Vendedor Principal',
        telefono: '+57 3224312518',
        email: 'principal@spinmobiliaria.com',
        estado: 'activo'
      }
    ];

    console.log('\n🚀 Agregando vendedores...\n');

    let agregados = 0;
    let existentes = 0;

    for (const vendedor of vendedores) {
      try {
        db.run(
          `INSERT INTO vendedores (nombre, telefono, email, estado)
           VALUES (?, ?, ?, ?)`,
          [vendedor.nombre, vendedor.telefono, vendedor.email, vendedor.estado]
        );

        console.log(`✅ ${vendedor.nombre}`);
        console.log(`   Teléfono: ${vendedor.telefono}`);
        console.log(`   Email: ${vendedor.email}`);
        console.log(`   Estado: ${vendedor.estado}\n`);

        agregados++;

      } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          console.log(`⚠️  ${vendedor.nombre} ya existe`);
          console.log(`   Teléfono: ${vendedor.telefono}\n`);
          existentes++;
        } else {
          console.error(`❌ Error al agregar ${vendedor.nombre}:`);
          console.error(`   ${err.message}\n`);
        }
      }
    }

    // Guardar base de datos
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);

    console.log('═══════════════════════════════════════════');
    console.log(`✓ Vendedores agregados: ${agregados}`);
    console.log(`⚠ Vendedores existentes: ${existentes}`);
    console.log('═══════════════════════════════════════════\n');

    console.log('📍 Base de datos actualizada');
    console.log(`   Ubicación: ${dbPath}\n`);

    db.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nSolución:');
    console.error('  npm install sql.js\n');
    process.exit(1);
  }
}

main();
