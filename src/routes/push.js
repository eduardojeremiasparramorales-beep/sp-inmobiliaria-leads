/**
 * Notificaciones push (Web Push + Firebase FCM) — Rutas REST
 * Suscripción y clave pública requieren solo sesión; diagnóstico y prueba son admin.
 * Cada ruta declara su propio nivel — este router NO va montado con auth a nivel base.
 */

const express = require('express');
const router = express.Router();
const store = require('../db/store');
const auth = require('../services/auth');
const push = require('../services/push');

router.get('/clave', auth.requireAuth, (req, res) => {
  res.json({ publicKey: push.getPublicKey(), enabled: push.isEnabled(), fcmEnabled: push.isFcmEnabled() });
});

router.post('/suscribir', auth.requireAuth, (req, res) => {
  const sub = req.body && req.body.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'subscription requerida' });
  const vendedorId = req.session.rol === 'admin' ? 0 : req.session.vendedorId;
  if (!vendedorId && vendedorId !== 0) return res.status(400).json({ error: 'sin_vendedor' });
  store.savePushSubscription(vendedorId, sub);
  res.json({ ok: true });
});

// Registro de token FCM desde la app nativa (Capacitor) — canal separado de Web Push.
router.post('/suscribir-fcm', auth.requireAuth, (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token requerido' });
  const vendedorId = req.session.rol === 'admin' ? 0 : req.session.vendedorId;
  if (!vendedorId && vendedorId !== 0) return res.status(400).json({ error: 'sin_vendedor' });
  store.saveFcmToken(vendedorId, token);
  res.json({ ok: true });
});

// Diagnóstico de push (admin) — muestra suscripciones FCM y Web Push
router.get('/diagnostico', auth.requireAdmin, (req, res) => {
  try {
    const allSubs = store.getAllPushSubscriptions();
    const fcmCount = allSubs.filter(s => s.tipo === 'fcm').length;
    const webpushCount = allSubs.filter(s => s.tipo !== 'fcm').length;
    res.json({
      fcmEnabled: push.isFcmEnabled(),
      webpushEnabled: push.isEnabled(),
      totalSubscriptions: allSubs.length,
      fcmSubscriptions: fcmCount,
      webpushSubscriptions: webpushCount,
      subscriptions: allSubs,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Enviar push de prueba al admin (admin)
router.post('/test', auth.requireAdmin, async (req, res) => {
  try {
    const adminId = 0;
    await push.sendToVendedor(adminId, {
      title: '🔔 Prueba Leons Group',
      body: 'Si ves esta notificación, las push notifications están funcionando correctamente.',
      tipo: 'test',
      tag: 'test-push-' + Date.now(),
    });
    res.json({ ok: true, mensaje: 'Push de prueba enviado al admin (vendedorId=0)' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
