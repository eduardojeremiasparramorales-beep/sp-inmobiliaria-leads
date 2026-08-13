/**
 * Reservas de lotes — Rutas REST
 * Todo el router va montado bajo auth.requireAuth (ver src/index.js).
 */

const express = require('express');
const router = express.Router();
const reservas = require('../services/reservas');

router.get('/', (req, res) => {
  const { estado } = req.query;
  res.json(reservas.listarReservas(estado));
});

router.get('/:leadId', (req, res) => {
  const r = reservas.obtenerReserva(Number(req.params.leadId));
  res.json(r || { activa: false });
});

router.post('/', (req, res) => {
  const { leadId, horas, loteId, proyectoId } = req.body || {};
  if (!leadId) return res.status(400).json({ error: 'leadId requerido' });
  const r = reservas.crearReserva(leadId, {
    horas: horas || 48,
    loteId, proyectoId,
    vendedorId: req.session && req.session.vendedorId,
  });
  res.json(r);
});

router.post('/:id/confirmar', (req, res) => {
  res.json(reservas.confirmarVenta(Number(req.params.id)));
});

router.post('/:id/extender', (req, res) => {
  const { horas } = req.body || {};
  res.json(reservas.extenderReserva(Number(req.params.id), horas || 24));
});

router.post('/:id/cancelar', (req, res) => {
  res.json(reservas.cancelarReserva(Number(req.params.id)));
});

module.exports = router;
