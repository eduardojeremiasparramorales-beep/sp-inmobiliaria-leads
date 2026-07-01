#!/usr/bin/env node

/**
 * Script para simular un lead de prueba
 * Envía un mensaje de prueba al webhook local
 */

const http = require('http');

const leadData = {
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '573224312518',
              phone_number_id: '119056413747250'
            },
            contacts: [
              {
                profile: {
                  name: 'Cliente Prueba'
                },
                wa_id: '573001234567'
              }
            ],
            messages: [
              {
                from: '573001234567',
                id: 'wamid.test-' + Date.now(),
                timestamp: Math.floor(Date.now() / 1000).toString(),
                type: 'text',
                text: {
                  body: 'Hola, me interesa un lote en Tocaima'
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

console.log('\n🚀 Enviando lead de prueba a http://localhost:3000/webhook\n');

const req = http.request(options, (res) => {
  console.log(`✅ Respuesta del servidor: ${res.statusCode}\n`);

  res.on('data', (d) => {
    process.stdout.write(d);
  });

  res.on('end', () => {
    console.log('\n\n✅ Lead enviado correctamente!');
    console.log('\n📍 Próximos pasos:');
    console.log('   1. Abre el dashboard: http://localhost:3000/dashboard');
    console.log('   2. Deberías ver un nuevo lead:');
    console.log('      - Teléfono: +57 300 123 4567');
    console.log('      - Mensaje: "Hola, me interesa un lote en Tocaima"');
    console.log('      - Asignado a: Vendedor Principal (+57 3224312518)');
    console.log('      - Estado: Activo\n');
  });
});

req.on('error', (e) => {
  console.error(`❌ Error: ${e.message}`);
  console.error('\nAsegúrate de que el servidor está corriendo:');
  console.error('   npm start\n');
  process.exit(1);
});

req.write(payload);
req.end();
