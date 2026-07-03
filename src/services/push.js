// Notificaciones Web Push (VAPID). Envía avisos al celular del vendedor
// aunque el panel esté cerrado (si está instalado como PWA / con permiso).
const webpush = require('web-push');
const store = require('../db/store');

let enabled = false;

function init() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@spinmobiliaria.com';
  if (!pub || !priv) {
    console.warn('Push deshabilitado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');
    return;
  }
  webpush.setVapidDetails(subject, pub, priv);
  enabled = true;
}

function isEnabled() { return enabled; }

function getPublicKey() { return process.env.VAPID_PUBLIC_KEY || ''; }

// Envía una notificación a todas las suscripciones de un vendedor
async function sendToVendedor(vendedorId, payload) {
  if (!enabled || !vendedorId) return;
  const subs = store.getPushSubscriptionsByVendedor(vendedorId);
  const data = JSON.stringify(payload);
  for (const s of subs) {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(subscription, data);
    } catch (e) {
      // Suscripción expirada o inválida → eliminarla
      if (e.statusCode === 404 || e.statusCode === 410) {
        store.deletePushSubscription(s.endpoint);
      } else {
        console.error('Error push:', e.statusCode || e.message);
      }
    }
  }
}

module.exports = { init, isEnabled, getPublicKey, sendToVendedor };
