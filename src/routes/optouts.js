/**
 * Optouts (clientes que pidieron no recibir más mensajes) — Rutas REST
 * Todo el router va montado bajo auth.requireAdmin (ver src/index.js).
 */

const express = require('express');
const router = express.Router();
const store = require('../db/store');

router.get('/', (req, res) => {
  res.json(store.getOptouts());
});

router.delete('/:phone', (req, res) => {
  store.deleteOptout(req.params.phone);
  res.json({ ok: true });
});

module.exports = router;
