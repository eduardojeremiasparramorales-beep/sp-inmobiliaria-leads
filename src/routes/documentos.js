/**
 * Centro Documental — Rutas REST
 * CRUD de documentos vinculados a leads/proyectos + búsqueda.
 * Todo el router va montado bajo auth.requireAuth (ver src/index.js).
 */

const express = require('express');
const router = express.Router();
const documents = require('../services/documents');

router.get('/', (req, res) => {
  const { tipo, categoria, proyectoId, leadId, busqueda, limite } = req.query;
  res.json(documents.listarDocumentos({
    tipo, categoria, proyectoId: Number(proyectoId), leadId: Number(leadId),
    busqueda, limite: Number(limite),
  }));
});

router.get('/buscar/:query', (req, res) => {
  res.json(documents.buscarDocumentos(req.params.query));
});

router.get('/:id', (req, res) => {
  const doc = documents.obtenerDocumento(Number(req.params.id));
  res.json(doc || { error: 'no_encontrado' });
});

router.post('/', (req, res) => {
  res.json(documents.crearDocumento(req.body || {}));
});

router.put('/:id', (req, res) => {
  res.json(documents.actualizarDocumento(Number(req.params.id), req.body || {}));
});

router.delete('/:id', (req, res) => {
  res.json(documents.eliminarDocumento(Number(req.params.id)));
});

module.exports = router;
