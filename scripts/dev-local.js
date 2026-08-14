/**
 * Arranque LOCAL SEGURO del CRM.
 *
 * El .env del proyecto tiene credenciales de producción: levantar el servidor tal cual
 * en la máquina de desarrollo activa los crons de campañas y de cadencia, que pueden
 * enviar WhatsApps REALES a clientes reales desde el portátil. Este arranque neutraliza
 * las credenciales salientes antes de cargar la app, así que el CRM funciona completo
 * (panel, BD, SSE, mapas) pero cualquier intento de envío falla sin salir a Meta.
 *
 * Uso: node scripts/dev-local.js   (puerto 3010 por defecto)
 */
process.env.PORT = process.env.PORT || '3010';
process.env.NODE_ENV = 'development';

// Credenciales de salida anuladas ANTES de que dotenv las cargue: dotenv no pisa las
// variables que ya existen, así que esto gana.
process.env.WHATSAPP_TOKEN = '';
process.env.FACEBOOK_PAGE_TOKEN = '';
process.env.INSTAGRAM_TOKEN = '';
process.env.META_ADS_TOKEN = '';

console.log('[DEV-LOCAL] Arrancando con credenciales de envío anuladas — no se enviará ningún mensaje real.');
require('../src/index.js');
