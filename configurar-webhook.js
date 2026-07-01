#!/usr/bin/env node

/**
 * SP CRM — Script de Configuración Webhook Meta
 *
 * Este script automatiza:
 * 1. Lectura de variables de entorno
 * 2. Validación de estructura
 * 3. Generación de instrucciones para webhook
 * 4. Almacenamiento de configuración
 */

const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

const log = {
    info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
    section: (msg) => console.log(`\n${colors.bright}${colors.cyan}═══ ${msg} ═══${colors.reset}\n`),
};

// Cargar .env
function loadEnv() {
    const envPath = path.join(__dirname, '.env');

    if (!fs.existsSync(envPath)) {
        log.error('.env no existe');
        process.exit(1);
    }

    const content = fs.readFileSync(envPath, 'utf-8');
    const env = {};

    content.split('\n').forEach((line) => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
            const [key, ...valueParts] = line.split('=');
            if (key) {
                env[key.trim()] = valueParts.join('=').trim();
            }
        }
    });

    return env;
}

function main() {
    console.clear();
    log.section('SP CRM — Configurador de Webhook Meta');

    const env = loadEnv();

    // Validar credenciales
    log.info('Validando credenciales...\n');

    const required = ['WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_ACCOUNT_ID', 'VERIFY_TOKEN'];
    let allValid = true;

    required.forEach((key) => {
        if (env[key]) {
            log.success(`${key}: Presente`);
        } else {
            log.error(`${key}: FALTA`);
            allValid = false;
        }
    });

    if (!allValid) {
        log.error('Faltan credenciales. Ejecuta validate-env.js primero.');
        process.exit(1);
    }

    log.section('Instrucciones para Webhook Meta');

    console.log(`
${colors.bright}RAILWAY DOMAIN:${colors.reset}

Antes de continuar, necesitas obtener tu dominio de Railway.

1. Ve a: https://railway.app
2. Abre proyecto: sp-inmobiliaria-leads
3. Haz clic en servicio "main"
4. Ve a "Deployments"
5. Copia la URL pública (ej: https://sp-crm-xxx.railway.app)

Una vez que tengas la URL, cópiala abajo:

`);

    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question(`${colors.cyan}Ingresa tu Railway URL (sin /webhook):${colors.reset} `, (railwayUrl) => {
        railwayUrl = railwayUrl.trim();

        if (!railwayUrl.startsWith('https://')) {
            railwayUrl = 'https://' + railwayUrl;
        }

        if (railwayUrl.endsWith('/')) {
            railwayUrl = railwayUrl.slice(0, -1);
        }

        const webhookUrl = railwayUrl + '/webhook';

        log.section('Información de Webhook');

        console.log(`
${colors.bright}Webhook URL:${colors.reset}
${colors.cyan}${webhookUrl}${colors.reset}

${colors.bright}Verify Token:${colors.reset}
${colors.cyan}${env.VERIFY_TOKEN}${colors.reset}

${colors.bright}Eventos a suscribirse:${colors.reset}
☑ messages
☐ message_template_status_update

`);

        log.section('Próximos Pasos en Meta');

        console.log(`
1. Ve a: https://developers.facebook.com
2. Tu App → WhatsApp → Configuración
3. Busca sección "Webhook"
4. Completa los campos:

   Campo 1 — Webhook URL:
   ${webhookUrl}

   Campo 2 — Verify Token:
   ${env.VERIFY_TOKEN}

   Campo 3 — Suscribirse a:
   ☑ messages

5. Haz clic en "Save" o "Guardar"
6. Espera a que valide (5-10 segundos)
7. Verifica que diga "✓ Webhook verified"

`);

        log.section('Verificación');

        console.log(`
Una vez que hayas guardado en Meta:

1. Ve a Railway dashboard
2. Servicio "main" → Logs
3. Busca: "✓ Webhook verificado por Meta"
4. Si lo ves, ¡TODO ESTÁ LISTO! 🚀

`);

        // Guardar configuración
        const config = {
            webhookUrl,
            verifyToken: env.VERIFY_TOKEN,
            railwayUrl,
            timestamp: new Date().toISOString(),
            status: 'Pendiente vincular en Meta',
        };

        const configPath = path.join(__dirname, 'webhook-config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        log.success(`Configuración guardada en: webhook-config.json`);

        console.log(`
${colors.green}════════════════════════════════════════════${colors.reset}
${colors.bright}Estás a 3 pasos de tener el CRM 100% operativo${colors.reset}
${colors.green}════════════════════════════════════════════${colors.reset}

`);

        rl.close();
    });
}

main();
