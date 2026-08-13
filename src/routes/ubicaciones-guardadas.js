/**
 * Ubicaciones guardadas del vendedor (direcciones frecuentes para citas/visitas) — Rutas REST
 * Todo el router va montado bajo auth.requireAuth (ver src/index.js).
 */

const express = require('express');
const router = express.Router();
const store = require('../db/store');

router.get('/', (req, res) => {
  const vId = req.session.vendedorId;
  if (!vId) return res.status(401).json({ error: 'no_autenticado' });
  const ubicaciones = store.getUbicacionesGuardadas(vId);
  res.json(ubicaciones);
});

router.post('/', (req, res) => {
  const vId = req.session.vendedorId;
  if (!vId) return res.status(401).json({ error: 'no_autenticado' });
  const { nombre, direccion, lat, lng } = req.body || {};
  if (!nombre || lat == null || lng == null) return res.status(400).json({ error: 'nombre_lat_lng_requeridos' });
  const ubicacion = store.saveUbicacionGuardada(vId, nombre, direccion, Number(lat), Number(lng));
  res.json({ ok: true, ubicacion });
});

router.delete('/:id', (req, res) => {
  store.deleteUbicacionGuardada(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
