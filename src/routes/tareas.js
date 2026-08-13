/**
 * Tareas / recordatorios — Rutas REST
 * Cada usuario (vendedor o admin con vendedor asociado) gestiona SUS tareas. Una tarea
 * con vence_at es un recordatorio: el barrido en index.js manda push al vencer.
 * Todo el router va montado bajo auth.requireAuth (ver src/index.js).
 */

const express = require('express');
const router = express.Router();
const store = require('../db/store');

router.get('/', (req, res) => {
  if (!req.session.vendedorId) return res.json([]);
  res.json(store.getTareasByVendedor(req.session.vendedorId));
});

router.post('/', (req, res) => {
  const { texto, leadId, venceAt } = req.body || {};
  if (!texto || !String(texto).trim()) return res.status(400).json({ error: 'texto_requerido' });
  if (!req.session.vendedorId) return res.status(400).json({ error: 'sin_vendedor' });
  const t = store.createTarea({ vendedorId: req.session.vendedorId, texto: String(texto).trim().slice(0, 300), leadId, venceAt });
  res.json({ ok: true, tarea: t });
});

router.put('/:id', (req, res) => {
  const t = store.updateTarea(req.params.id, req.session.vendedorId, req.body || {});
  if (!t) return res.status(404).json({ error: 'no_existe' });
  res.json({ ok: true, tarea: t });
});

router.delete('/:id', (req, res) => {
  store.deleteTarea(req.params.id, req.session.vendedorId);
  res.json({ ok: true });
});

module.exports = router;
