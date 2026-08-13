/**
 * Galería de marca (logos, banners, fondos) — Rutas REST
 * GET / y GET /:id son públicas a propósito (assets de marca que también consume
 * contenido público, p. ej. /catalogo/). El resto requiere admin — cada ruta declara
 * su propio nivel, este router NO va montado con auth a nivel base.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const store = require('../db/store');
const auth = require('../services/auth');

const GALERIA_PATH = path.join(__dirname, '..', '..', 'public', 'galeria', 'assets');

async function ensureDir(dir) {
  try { await fs.promises.mkdir(dir, { recursive: true }); } catch (e) { /* ok */ }
}

// Upload de archivo a /public/galeria/assets/ — solo admin
const uploadGaleria = multer({ storage: multer.diskStorage({
  destination: async (req, file, cb) => { await ensureDir(GALERIA_PATH); cb(null, GALERIA_PATH); },
  filename: (req, file, cb) => {
    const orig = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const safe = orig.replace(/[^a-zA-Z0-9À-ÿ () _ . -]/g, '').replace(/\s+/g, '_');
    cb(null, Date.now() + '_' + safe);
  }
}), limits: { fileSize: 20 * 1024 * 1024 } }).single('file');

router.post('/upload', auth.requireAdmin, (req, res) => {
  uploadGaleria(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'upload_fallido', detail: err.message });
    if (!req.file) return res.status(400).json({ error: 'sin_archivo' });
    res.json({ ok: true, filename: req.file.filename, originalname: req.file.originalname });
  });
});

router.get('/', (req, res) => {
  const cat = req.query.categoria || 'all';
  res.json(store.getGaleria(cat === 'all' ? null : cat));
});

router.get('/admin', auth.requireAdmin, (req, res) => {
  res.json(store.getGaleriaAll());
});

router.get('/:id', (req, res) => {
  const item = store.getGaleriaById(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'no_existe' });
  res.json(item);
});

router.post('/', auth.requireAdmin, (req, res) => {
  const { nombre, categoria, filename, activa, orden } = req.body || {};
  if (!nombre || !filename) return res.status(400).json({ error: 'nombre_y_filename_requeridos' });
  const item = store.createGaleriaItem({ nombre, categoria: categoria || 'logos', filename, activa, orden });
  res.json({ ok: true, item });
});

router.put('/:id', auth.requireAdmin, (req, res) => {
  const existente = store.getGaleriaById(Number(req.params.id));
  if (!existente) return res.status(404).json({ error: 'no_existe' });
  store.updateGaleriaItem(Number(req.params.id), req.body || {});
  res.json({ ok: true, item: store.getGaleriaById(Number(req.params.id)) });
});

router.delete('/:id', auth.requireAdmin, (req, res) => {
  const item = store.getGaleriaById(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'no_existe' });
  if (item.filename) {
    try {
      const fp = path.join(GALERIA_PATH, item.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (e) { /* archivo ya no existe o no se puede borrar */ }
  }
  store.deleteGaleriaItem(Number(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
