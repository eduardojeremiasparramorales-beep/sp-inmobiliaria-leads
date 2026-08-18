/**
 * Centro Financiero — Rutas REST
 * Transacciones (ingresos/egresos), resumen y comisiones de vendedores.
 * Todo el router va montado bajo auth.requireAdmin (ver src/index.js).
 */

const express = require('express');
const router = express.Router();
const finance = require('../services/finance');

router.get('/resumen', (req, res) => {
  const { desde, hasta } = req.query;
  res.json(finance.obtenerResumen({ desde, hasta }));
});

router.get('/transacciones', (req, res) => {
  const { tipo, categoria, proyectoId, vendedorId, desde, hasta, limite } = req.query;
  res.json(finance.listarTransacciones({
    tipo, categoria, proyectoId: Number(proyectoId), vendedorId: Number(vendedorId),
    desde, hasta, limite: Number(limite),
  }));
});

router.post('/transacciones', (req, res) => {
  const r = finance.crearTransaccion(req.body || {});
  res.status(r.ok ? 200 : 400).json(r);
});

router.put('/transacciones/:id', (req, res) => {
  const r = finance.actualizarTransaccion(Number(req.params.id), req.body || {});
  res.status(r.ok ? 200 : (r.error === 'no_existe' ? 404 : 400)).json(r);
});

router.delete('/transacciones/:id', (req, res) => {
  const r = finance.eliminarTransaccion(Number(req.params.id));
  res.status(r.ok ? 200 : 404).json(r);
});

router.get('/comisiones', (req, res) => {
  const { vendedorId, estado, desde, limite } = req.query;
  res.json(finance.listarComisiones({
    vendedorId: Number(vendedorId), estado, desde, limite: Number(limite),
  }));
});

// Alta manual de comisión (usada desde "Registrar venta" en la ficha del lead y
// desde "+ Nueva" en Finanzas). Si no se manda montoComision, se calcula como
// montoVenta * porcentaje/100.
router.post('/comisiones', (req, res) => {
  const r = finance.crearComision(req.body || {});
  res.status(r.ok ? 200 : 400).json(r);
});

// Alias histórico de /comisiones — mismo comportamiento, se mantiene por compatibilidad.
router.post('/comisiones/calcular', (req, res) => {
  const { vendedorId, leadId, montoVenta, porcentaje } = req.body || {};
  const r = finance.crearComision({ vendedorId, leadId, montoVenta, porcentaje: porcentaje || 5 });
  res.status(r.ok ? 200 : 400).json(r);
});

router.put('/comisiones/:id', (req, res) => {
  const r = finance.actualizarComision(Number(req.params.id), req.body || {});
  res.status(r.ok ? 200 : (r.error === 'no_existe' ? 404 : 400)).json(r);
});

router.delete('/comisiones/:id', (req, res) => {
  const r = finance.eliminarComision(Number(req.params.id));
  res.status(r.ok ? 200 : 404).json(r);
});

router.post('/comisiones/:id/pagar', (req, res) => {
  const r = finance.marcarComisionPagada(Number(req.params.id));
  res.status(r.ok ? 200 : 404).json(r);
});

module.exports = router;
