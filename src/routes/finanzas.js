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
  res.json(r);
});

router.delete('/transacciones/:id', (req, res) => {
  res.json(finance.eliminarTransaccion(Number(req.params.id)));
});

router.get('/comisiones', (req, res) => {
  const { vendedorId, estado, desde, limite } = req.query;
  res.json(finance.listarComisiones({
    vendedorId: Number(vendedorId), estado, desde, limite: Number(limite),
  }));
});

router.post('/comisiones/calcular', (req, res) => {
  const { vendedorId, leadId, montoVenta, porcentaje } = req.body || {};
  if (!vendedorId || !leadId || !montoVenta) return res.status(400).json({ error: 'faltan_datos' });
  res.json(finance.calcularComision(vendedorId, leadId, montoVenta, porcentaje || 5));
});

router.post('/comisiones/:id/pagar', (req, res) => {
  res.json(finance.marcarComisionPagada(Number(req.params.id)));
});

module.exports = router;
