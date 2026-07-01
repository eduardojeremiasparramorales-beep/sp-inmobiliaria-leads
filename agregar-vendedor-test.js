#!/usr/bin/env node

/**
 * Script para agregar vendedor de prueba al CRM
 */

const fetch = require('node-fetch');

// URL del servidor (obtén de Railway)
const RAILWAY_URL = 'https://main-production-063e.up.railway.app';
const API_TOKEN = 'sp_api_secret_2026_secure_token_xyz_cryptographic';

// Datos del vendedor de prueba
const vendedorTest = {
  nombre: "Vendedor Prueba",
  telefono: "+57 300 123 4567",
  email: "vendedor.test@spinmobiliaria.com",
  estado: "activo"
};

async function agregarVendedor() {
  try {
    console.log('\n🚀 Agregando vendedor de prueba...\n');

    const response = await fetch(`${RAILWAY_URL}/api/vendedores`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(vendedorTest)
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Vendedor agregado exitosamente!\n');
      console.log('Datos del vendedor:');
      console.log(`  Nombre: ${vendedorTest.nombre}`);
      console.log(`  Teléfono: ${vendedorTest.telefono}`);
      console.log(`  Email: ${vendedorTest.email}`);
      console.log(`  Estado: ${vendedorTest.estado}`);
      console.log(`\n✓ ID: ${data.id}\n`);
    } else {
      console.log('❌ Error al agregar vendedor:');
      console.log(data);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

agregarVendedor();
