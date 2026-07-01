#!/usr/bin/env node

/**
 * Script de DIAGNÓSTICO — Verifica por qué no se asigna
 */

const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'sp-leads.db');

async function diagnose() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║           DIAGNÓSTICO DE ASIGNACIÓN DE LEADS                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const SQL = await initSqlJs();

  if (!fs.existsSync(DB_PATH)) {
    console.log('❌ Base de datos NO EXISTE');
    console.log(`   Path: ${DB_PATH}\n`);
    return;
  }

  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  // 1. Verificar vendedores
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('1️⃣  VENDEDORES REGISTRADOS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const vendedores = db.exec('SELECT * FROM vendedores');
  if (vendedores.length === 0 || vendedores[0].values.length === 0) {
    console.log('❌ NO HAY VENDEDORES REGISTRADOS');
    console.log('   Solución: Ejecuta node agregar-vendedor-correcto.js\n');
  } else {
    const cols = vendedores[0].columns;
    const rows = vendedores[0].values;
    console.log(`✅ Total vendedores: ${rows.length}\n`);
    rows.forEach((row, idx) => {
      console.log(`   Vendedor ${idx + 1}:`);
      cols.forEach((col, i) => {
        const val = row[i];
        if (col === 'telefono') {
          console.log(`      ${col}: +57 ${val.slice(2).replace(/(\d{3})(?=\d)/g, '$1 ')} (formato DB: ${val})`);
        } else {
          console.log(`      ${col}: ${val}`);
        }
      });
      console.log('');
    });
  }

  // 2. Verificar estado de vendedores activos
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('2️⃣  VENDEDORES ACTIVOS (Por asignar leads)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const activos = db.exec("SELECT * FROM vendedores WHERE estado = 'activo'");
  if (activos.length === 0 || activos[0].values.length === 0) {
    console.log('❌ NO HAY VENDEDORES ACTIVOS');
    console.log('   Problema: Aunque hay vendedores, NINGUNO está marcado como "activo"\n');
    console.log('   Los leads NO se asignarán hasta que haya vendedores activos.\n');
  } else {
    const cols = activos[0].columns;
    const rows = activos[0].values;
    console.log(`✅ Total activos: ${rows.length}\n`);
    rows.forEach((row, idx) => {
      console.log(`   ${row[1]} (${row[2]}) - Estado: ${row[4]}`);
    });
    console.log('');
  }

  // 3. Verificar leads
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('3️⃣  LEADS RECIBIDOS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const leads = db.exec('SELECT * FROM leads ORDER BY created_at DESC');
  if (leads.length === 0 || leads[0].values.length === 0) {
    console.log('❌ NO HAY LEADS RECIBIDOS\n');
    console.log('   Problema posible:');
    console.log('   • Meta no está enviando al webhook');
    console.log('   • El webhook no está recibiendo mensajes\n');
  } else {
    const cols = leads[0].columns;
    const rows = leads[0].values;
    console.log(`✅ Total leads: ${rows.length}\n`);

    rows.slice(0, 5).forEach((row, idx) => {
      const leadObj = {};
      cols.forEach((col, i) => { leadObj[col] = row[i]; });

      console.log(`   Lead #${leadObj.id}:`);
      console.log(`      Cliente: ${leadObj.customer_name} (${leadObj.customer_phone})`);
      console.log(`      Mensaje: "${leadObj.first_message}"`);
      console.log(`      Estado: ${leadObj.status}`);
      console.log(`      Asignado a: ${leadObj.assigned_to_id ? `Vendedor ID ${leadObj.assigned_to_id}` : '❌ NO ASIGNADO'}`);
      console.log(`      Teléfono vendedor: ${leadObj.assigned_to_phone || '❌ SIN TELÉFONO'}`);
      console.log('');
    });

    if (rows.length > 5) {
      console.log(`   ... y ${rows.length - 5} leads más\n`);
    }
  }

  // 4. Resumen
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 RESUMEN DIAGNÓSTICO');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const vendedoresCount = vendedores.length > 0 ? vendedores[0].values.length : 0;
  const activosCount = activos.length > 0 ? activos[0].values.length : 0;
  const leadsCount = leads.length > 0 ? leads[0].values.length : 0;

  console.log(`Vendedores registrados:  ${vendedoresCount > 0 ? '✅ ' + vendedoresCount : '❌ 0'}`);
  console.log(`Vendedores activos:      ${activosCount > 0 ? '✅ ' + activosCount : '❌ 0'}`);
  console.log(`Leads recibidos:         ${leadsCount > 0 ? '✅ ' + leadsCount : '❌ 0'}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔍 ANÁLISIS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (vendedoresCount === 0) {
    console.log('❌ PROBLEMA #1: No hay vendedores\n');
    console.log('Solución:');
    console.log('  1. Ejecuta: node agregar-vendedor-correcto.js\n');
  }

  if (activosCount === 0 && vendedoresCount > 0) {
    console.log('❌ PROBLEMA #2: Hay vendedores pero NINGUNO está activo\n');
    console.log('Los leads no se asignan si no hay vendedores activos.\n');
    console.log('Solución:');
    console.log('  1. Ve al dashboard y marca el vendedor como "activo"');
    console.log('  2. O usa el endpoint API para cambiar estado\n');
  }

  if (leadsCount === 0) {
    console.log('❌ PROBLEMA #3: No hay leads\n');
    console.log('El webhook no está recibiendo mensajes de Meta.\n');
    console.log('Solución:');
    console.log('  1. Verifica que Meta está configurado correctamente');
    console.log('  2. Verifica la URL del webhook en Meta: https://main-production-063e.up.railway.app/webhook');
    console.log('  3. Verifica el Verify Token');
    console.log('  4. Prueba enviando un mensaje a +57 3214625618\n');
  }

  if (leadsCount > 0 && activosCount > 0) {
    const leadNoAsignado = leads[0].values.some(row => !row[3]); // assigned_to_id es índice 3
    if (leadNoAsignado) {
      console.log('❌ PROBLEMA #4: Hay leads pero algunos NO están asignados\n');
      console.log('Esto es raro porque hay vendedores activos.\n');
      console.log('Solución:');
      console.log('  1. Revisa los logs del servidor');
      console.log('  2. Busca errores en assignLeadToVendedor\n');
    } else {
      console.log('✅ TODO PARECE ESTAR FUNCIONANDO CORRECTAMENTE\n');
      console.log('Todos los leads están asignados a vendedores activos.\n');
    }
  }

  if (vendedoresCount > 0 && activosCount > 0 && leadsCount > 0) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ SISTEMA OPERATIVO');
    console.log('═══════════════════════════════════════════════════════════════\n');
  }
}

diagnose().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
