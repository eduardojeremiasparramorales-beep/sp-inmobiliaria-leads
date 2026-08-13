/**
 * Propiedades (catálogo de inmuebles) — Rutas REST
 * Lectura y recomendación requieren solo sesión; crear/editar/borrar es admin.
 * Cada ruta declara su propio nivel — este router NO va montado con auth a nivel base.
 */

const express = require('express');
const router = express.Router();
const store = require('../db/store');
const auth = require('../services/auth');

router.get('/', auth.requireAuth, (req, res) => {
  res.json(store.getPropiedades());
});

router.get('/:id', auth.requireAuth, (req, res) => {
  const p = store.getPropiedadById(req.params.id);
  if (!p) return res.status(404).json({ error: 'no_existe' });
  res.json(p);
});

router.post('/', auth.requireAdmin, (req, res) => {
  const { nombre, descripcion, ciudad, precio, m2, tipo, estado, imagen_url } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'nombre_requerido' });
  const p = store.createPropiedad({ nombre, descripcion, ciudad, precio, m2, tipo, estado, imagen_url });
  res.json({ ok: true, propiedad: p });
});

router.put('/:id', auth.requireAdmin, (req, res) => {
  const existente = store.getPropiedadById(req.params.id);
  if (!existente) return res.status(404).json({ error: 'no_existe' });
  const d = req.body || {};
  store.updatePropiedad(req.params.id, {
    nombre: d.nombre || existente.nombre,
    descripcion: d.descripcion !== undefined ? d.descripcion : existente.descripcion,
    ciudad: d.ciudad !== undefined ? d.ciudad : existente.ciudad,
    precio: d.precio !== undefined ? d.precio : existente.precio,
    m2: d.m2 !== undefined ? d.m2 : existente.m2,
    tipo: d.tipo || existente.tipo,
    estado: d.estado || existente.estado,
    imagen_url: d.imagen_url !== undefined ? d.imagen_url : existente.imagen_url,
  });
  res.json({ ok: true });
});

router.delete('/:id', auth.requireAdmin, (req, res) => {
  store.deletePropiedad(req.params.id);
  res.json({ ok: true });
});

// Recomendar propiedades para un lead (match scoring) — extrae ciudad/precio/tipo de
// la conversación (vía IA si está disponible, si no con regex local) y puntúa el
// catálogo disponible contra esas señales.
router.post('/recomendar', auth.requireAuth, async (req, res) => {
  try {
    const { leadId } = req.body || {};
    if (!leadId) return res.status(400).json({ error: 'leadId requerido' });

    const lead = store.getLeadById(leadId);
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

    const mensajes = store.getMessagesByLead(leadId) || [];
    const textoCompleto = mensajes.map(m => m.body).filter(Boolean).join(' ').toLowerCase();

    // Extraer entidades: vía IA si está disponible, si no con regex local
    let entidades = { locations: [], prices: [], propertyTypes: [] };
    try {
      const nlp = require('../services/nlp');
      if (nlp.isAIEnabled()) {
        entidades = await nlp.extractEntities(textoCompleto);
      }
    } catch (e) { /* fallback a regex */ }

    if (!entidades.locations.length) {
      const ciudades = ['tocaima', 'girardot', 'melgar', 'bogotá', 'bogota', 'cundinamarca', 'tolima', 'ica', 'huila', 'meta', 'anapoima', 'la mesa', 'villeta', 'facatativá', 'facatativa', 'mosquera', 'madrid', 'funza'];
      entidades.locations = ciudades.filter(c => textoCompleto.includes(c));
    }
    if (!entidades.prices.length) {
      const nums = textoCompleto.match(/\b(\d{5,})\b/g);
      if (nums) entidades.prices = nums.map(Number);
    }
    if (!entidades.propertyTypes.length) {
      if (/lote|terreno|parcela/i.test(textoCompleto)) entidades.propertyTypes.push('lote');
      if (/casa|vivienda/i.test(textoCompleto)) entidades.propertyTypes.push('casa');
      if (/apartamento|apto/i.test(textoCompleto)) entidades.propertyTypes.push('apartamento');
    }

    const propiedades = store.getPropiedades();
    const precioRef = entidades.prices.length ? Math.min(...entidades.prices) : 0;
    const ciudadRef = entidades.locations[0] || '';

    const recomendadas = propiedades.filter(p => p.estado === 'disponible').map(p => {
      let match = 50;

      // Ciudad (50%)
      const pCiudad = (p.ciudad || '').toLowerCase();
      if (ciudadRef && pCiudad.includes(ciudadRef) || ciudadRef && entidades.locations.some(l => pCiudad.includes(l))) {
        match += 30;
      } else if (ciudadRef && entidades.locations.some(l => pCiudad.includes(l))) {
        match += 25;
      }

      // Precio (25%)
      if (precioRef > 0 && p.precio > 0) {
        const diff = Math.abs(p.precio - precioRef) / Math.max(p.precio, precioRef);
        match += Math.round(25 * Math.max(0, 1 - diff));
      }

      // Tipo (15%)
      if (entidades.propertyTypes.length && entidades.propertyTypes.includes(p.tipo || 'lote')) {
        match += 15;
      } else if (entidades.propertyTypes.length) {
        match += 5;
      } else {
        match += 8;
      }

      // m² (10%)
      if (p.m2 > 0) {
        const m2Ratio = Math.min(p.m2 / 500, 1);
        match += Math.round(10 * m2Ratio);
      }

      return {
        id: p.id,
        nombre: p.nombre,
        ciudad: p.ciudad || '',
        precio: p.precio || 0,
        m2: p.m2 || 0,
        tipo: p.tipo || 'lote',
        estado: p.estado || 'disponible',
        imagen_url: p.imagen_url || '',
        match: Math.min(99, match),
      };
    }).sort((a, b) => b.match - a.match);

    res.json({ ok: true, propiedades: recomendadas, entidades });
  } catch (e) {
    console.error('[PROPS] recomendar error:', e.message);
    res.json({ ok: false, propiedades: [], error: e.message });
  }
});

module.exports = router;
