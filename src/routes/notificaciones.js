/**
 * Notificaciones internas — Rutas REST
 * Todo el router va montado bajo auth.requireAuth (ver src/index.js).
 */

const express = require('express');
const router = express.Router();
const store = require('../db/store');

// Canal 0 = admins/supervisores/jefe (comparten bandeja); cualquier otro = el propio vendedor.
function canalNotif(req) {
  return (req.session.rol === 'admin' || req.session.rol === 'supervisor' || req.session.rol === 'jefe') ? 0 : Number(req.session.vendedorId);
}

router.get('/', (req, res) => {
  const canal = canalNotif(req);
  res.json({
    notificaciones: store.getNotifications(canal, req.query.limit || 30),
    sin_leer: store.countUnreadNotifications(canal),
  });
});

router.post('/leer-todas', (req, res) => {
  store.markAllNotificationsRead(canalNotif(req));
  res.json({ ok: true });
});

router.post('/:id/leer', (req, res) => {
  store.markNotificationRead(req.params.id, canalNotif(req));
  res.json({ ok: true });
});

module.exports = router;
