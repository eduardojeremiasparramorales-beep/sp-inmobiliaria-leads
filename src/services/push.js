// Notificaciones push al celular del vendedor aunque el panel esté cerrado.
// Dos canales según cómo esté instalado el panel:
// - Web Push (VAPID): PWA en navegador / instalada desde Chrome.
// - FCM (Firebase Cloud Admin): app nativa empaquetada con Capacitor (más confiable
//   en Android que Web Push, que Android puede matar en segundo plano).
const webpush = require('web-push');
const store = require('../db/store');

let enabled = false;
let fcmEnabled = false;

function init() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@spinmobiliaria.com';
  if (!pub || !priv) {
    console.warn('Web Push deshabilitado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');
  } else {
    webpush.setVapidDetails(subject, pub, priv);
    enabled = true;
  }

  // FCM: opcional. Requiere un service account de Firebase (Project Settings →
  // Service Accounts → Generate new private key), pegado como JSON en la variable
  // de entorno FCM_SERVICE_ACCOUNT_JSON. Sin esto, la app nativa simplemente no
  // recibe push (el resto del CRM sigue funcionando igual).
  const saJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (saJson) {
    try {
      const admin = require('firebase-admin');
      const serviceAccount = JSON.parse(saJson);
      if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      fcmEnabled = true;
    } catch (e) {
      console.error('FCM deshabilitado: FCM_SERVICE_ACCOUNT_JSON inválido —', e.message);
    }
  }
}

function isEnabled() { return enabled; }
function isFcmEnabled() { return fcmEnabled; }

function getPublicKey() { return process.env.VAPID_PUBLIC_KEY || ''; }

// Envía una notificación a todas las suscripciones de un vendedor, sin importar el
// canal (Web Push y/o FCM) — un vendedor puede tener ambas si usa el panel web y la app.
async function sendToVendedor(vendedorId, payload) {
  if (!vendedorId) return;
  const subs = store.getPushSubscriptionsByVendedor(vendedorId);
  for (const s of subs) {
    if (s.tipo === 'fcm') {
      await sendFcm(s, payload);
    } else {
      await sendWebPush(s, payload);
    }
  }
}

async function sendWebPush(s, payload) {
  if (!enabled) return;
  const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) store.deletePushSubscription(s.endpoint);
    else console.error('Error Web Push:', e.statusCode || e.message);
  }
}

async function sendFcm(s, payload) {
  if (!fcmEnabled) return;
  try {
    const admin = require('firebase-admin');
    await admin.messaging().send({
      token: s.endpoint, // el token FCM se guarda en la columna endpoint (ver store.saveFcmToken)
      notification: { title: payload.title || 'SP CRM', body: payload.body || '' },
      data: Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])),
    });
  } catch (e) {
    // Token inválido/desinstalado → eliminarlo, igual que una suscripción Web Push expirada
    if (e.code === 'messaging/registration-token-not-registered' || e.code === 'messaging/invalid-registration-token') {
      store.deletePushSubscription(s.endpoint);
    } else {
      console.error('Error FCM:', e.code || e.message);
    }
  }
}

module.exports = { init, isEnabled, isFcmEnabled, getPublicKey, sendToVendedor };
