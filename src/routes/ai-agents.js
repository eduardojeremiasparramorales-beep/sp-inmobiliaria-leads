/**
 * Motor IA Especializado — Rutas REST
 * Todo el router va montado bajo auth.requireAuth (ver src/index.js).
 */

const express = require('express');
const router = express.Router();
const aiAgents = require('../services/ai-agents');
const { asyncH } = require('../utils/async-handler');

router.get('/', (req, res) => {
  res.json(aiAgents.listarAgentes());
});

router.post('/:id/chat', asyncH(async (req, res) => {
  const { mensaje, leadId, vendedorId } = req.body || {};
  if (!mensaje) return res.status(400).json({ error: 'mensaje requerido' });
  const r = await aiAgents.chatConAgente(req.params.id, mensaje, { leadId, vendedorId });
  res.json(r);
}));

module.exports = router;
