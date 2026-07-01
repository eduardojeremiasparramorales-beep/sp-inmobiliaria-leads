#!/usr/bin/env node

/**
 * SP CRM — Agregar Vendedor
 *
 * Uso: node agregar-vendedor.js
 *
 * Este script agrega un vendedor directamente a la base de datos SQLite
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function main() {
  try {
    console.log('\n🚀 Agregando vendedor de prueba...\n');

    // Cargar sql.js
    const SQL = await initSqlJs();

    // Ruta de la base de datos
    const dbPath = path.join(__dirname, 'data', 'database.sqlite');

    // Si no existe la carpeta data, crearla
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
      fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    }

    // Leer base de datos existente o crear nueva
    let filebuffer;
    if (fs.existsSync(dbPath)) {
      filebuffer = fs.readFileSync(dbPath);
    } else {
      filebuffer = null;
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

    // Datos del vendedor de prueba
    const vendedor = {
      nombre: 'Vendedor Prueba',
      telefono: '+57 300 123 4567',
      email: 'vendedor.test@spinmobiliaria.com',
      estado: 'activo'
    };

    // Insertar vendedor
    try {
      db.run(
        `INSERT INTO vendedores (nombre, telefono, email, estado)
         VALUES (?, ?, ?, ?)`,
        [vendedor.nombre, vendedor.telefono, vendedor.email, vendedor.estado]
      );

      // Guardar base de datos
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);

      console.log('✅ Vendedor agregado exitosamente!\n');
      console.log('Datos del vendedor:');
      console.log(`  Nombre: ${vendedor.nombre}`);
      console.log(`  Teléfono: ${vendedor.telefono}`);
      console.log(`  Email: ${vendedor.email}`);
      console.log(`  Estado: ${vendedor.estado}`);
      console.log('\n✓ Base de datos actualizada\n');

    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        console.log('⚠️  Vendedor ya existe');
        console.log('   Teléfono: +57 300 123 4567\n');
      } else {
        throw err;
      }
    }

    db.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nAsegúrate de tener sql.js instalado:');
    console.error('  npm install sql.js\n');
    process.exit(1);
  }
}

main();
