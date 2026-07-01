#!/usr/bin/env node

/**
 * Script para simular un lead REAL con asignación a vendedor
 * Esto simula exactamente lo que hace Meta Ads
 */

const http = require('http');

// Este es el teléfono de tu vendedor principal
const VENDEDOR_TELEFONO = '573214312518';

const leadData = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'entry-' + Date.now(),
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: VENDEDOR_TELEFONO,
              phone_number_id: '119056413747250',
              business_account_id: '2292669058229593'
            },
            contacts: [
              {
                profile: {
                  name: 'Juan García - Cliente Real'
                },
                wa_id: '573105551234'  // Teléfono del cliente
              }
            ],
            messages: [
              {
                from: '573105551234',  // Cliente enviando mensaje
                id: 'wamid.real-' + Date.now(),
                timestamp: Math.floor(Date.now() / 1000).toString(),
                type: 'text',
                text: {
                  body: 'Hola, me interesa un lote en la urbanización. ¿Cuál es el precio?'
                }
              }
            ]
          }
        }
      ]
    }
  ]
};

const payload = JSON.stringify(leadData);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('   🚀 SIMULANDO LEAD REAL CON ASIGNACIÓN A VENDEDOR');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('📊 Datos del lead:');
console.log(`   Cliente: Juan García - Cliente Real`);
console.log(`   Teléfono cliente: +57 310 555 1234`);
console.log(`   Mensaje: "Hola, me interesa un lote en la urbanización. ¿Cuál es el precio?"`);
console.log(`   Asignado a: Vendedor Principal (+57 ${VENDEDOR_TELEFONO})`);
console.log(`\n   Enviando a: http://localhost:3000/webhook\n`);

const req = http.request(options, (res) => {
  console.log(`✅ Servidor respondió: ${res.statusCode}\n`);

  res.on('data', (d) => {
    process.stdout.write(d);
  });

  res.on('end', () => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('   ✅ LEAD ENVIADO Y PROCESADO');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('📍 VERIFICA EN EL DASHBOARD AHORA:');
    console.log('   1. Abre: http://localhost:3000/dashboard');
    console.log('   2. Haz clic en "Bandeja de Leads"');
    console.log('   3. Deberías ver:');
    console.log('      ✓ Nuevo lead');
    console.log('      ✓ Cliente: Juan García - Cliente Real');
    console.log('      ✓ Teléfono: +57 310 555 1234');
    console.log('      ✓ Mensaje: "Hola, me interesa un lote..."');
    console.log('      ✓ Estado: "Nuevo" (verde)');
    console.log('      ✓ Vendedor asignado: "Vendedor Principal"');
    console.log('      ✓ Botón "Contactar" disponible\n');

    console.log('🎯 SI VES TODO ESTO = ✅ SISTEMA 100% FUNCIONANDO\n');
    console.log('📱 PARA PRUEBAS REALES:');
    console.log('   Cuando envíes leads desde Meta Ads, aparecerán igual');
    console.log('   que este lead de prueba, pero con datos reales del cliente.\n');
  });
});

req.on('error', (e) => {
  console.error(`\n❌ Error: ${e.message}`);
  console.error('\nSolución:');
  console.error('   1. Asegúrate de que npm start está corriendo');
  console.error('   2. Abre otra terminal en la misma carpeta');
  console.error('   3. Intenta nuevamente: node test-lead-real.js\n');
  process.exit(1);
});

req.write(payload);
req.end();
