/**
 * Red de Asesores Externos — Rutas REST
 *
 * Dos audiencias:
 *  - Asesor externo (grupo 2): su suscripción, subir comprobante, su nivel, ranking.
 *  - Admin: aprobar pagos, cuota de reparto, marca del grupo, resumen de la Red.
 *
 * Este router NO va montado con auth a nivel base — cada ruta declara su nivel. El acceso
 * de asesor exige además pertenecer a la Red (requireExterno), para que un asesor de Leons
 * nunca toque el flujo de suscripción/ranking de externos.
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const store = require('../db/store');
const auth = require('../services/auth');
const niveles = require('../services/niveles');

const COMPROBANTES_DIR = path.join(__dirname, '..', '..', 'data', 'comprobantes');

// Solo asesores de la Red (grupo 2). Admin/supervisor/jefe NO entran aquí — tienen su
// propio panel (/os/red.html); estos endpoints son la vista del propio asesor externo.
function requireExterno(req, res, next) {
  auth.requireAuth(req, res, () => {
    if (!auth.esExterno(req)) return res.status(403).json({ error: 'solo_asesores_red' });
    next();
  });
}

// ───────────────── ASESOR EXTERNO ─────────────────

// Estado de su suscripción + plan (la pantalla de suscripción del móvil se apoya en esto).
router.get('/mi-suscripcion', requireExterno, (req, res) => {
  const vid = req.session.vendedorId;
  const vigente = store.getSuscripcionVigente(vid);
  const ultima = store.getSuscripcionByVendedor(vid);
  const plan = ultima && ultima.plan_id ? store.getPlanById(ultima.plan_id) : store.getPlanPorDefecto();
  const pagoPendiente = store.getPagosByVendedor(vid).find(p => p.estado === 'pendiente') || null;
  res.json({
    activa: !!vigente,
    estado: (vigente || ultima || {}).estado || 'ninguna',
    vence_at: (vigente || ultima || {}).vence_at || null,
    plan: plan ? { id: plan.id, nombre: plan.nombre, precio: plan.precio, moneda: plan.moneda, dias_vigencia: plan.dias_vigencia } : null,
    pagoPendiente: pagoPendiente ? { id: pagoPendiente.id, estado: pagoPendiente.estado, created_at: pagoPendiente.created_at } : null,
    metodo: require('../services/pagos').proveedorActivo().nombre,
  });
});

router.get('/planes', requireExterno, (req, res) => res.json(store.getPlanes()));

// Subir comprobante de pago (imagen/PDF). Crea un pago 'pendiente' que el admin aprueba.
const uploadComprobante = multer({ storage: multer.diskStorage({
  destination: async (req, file, cb) => { try { await fs.promises.mkdir(COMPROBANTES_DIR, { recursive: true }); } catch (e) {} cb(null, COMPROBANTES_DIR); },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
    cb(null, 'c_' + req.session.vendedorId + '_' + Date.now() + (ext || '.jpg'));
  },
}), limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^(image\/|application\/pdf)/.test(file.mimetype)),
}).single('comprobante');

router.post('/pago/comprobante', requireExterno, (req, res) => {
  uploadComprobante(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'upload_fallido', detail: err.message });
    if (!req.file) return res.status(400).json({ error: 'sin_archivo' });
    const vid = req.session.vendedorId;
    const referencia = String((req.body && req.body.referencia) || '').slice(0, 120);
    const pago = store.crearPago(vid, { metodo: 'comprobante', referencia, comprobanteUrl: req.file.filename });
    try {
      require('../services/events').emitToAdmins('red_pago_pendiente', { vendedorId: vid, nombre: req.session.nombre, pagoId: pago.id, ts: Date.now() });
    } catch (e) {}
    res.json({ ok: true, pago: { id: pago.id, estado: pago.estado } });
  });
});

// Nivel del asesor: XP, nivel actual, progreso al siguiente, desglose por tipo de evento.
router.get('/nivel', requireExterno, (req, res) => {
  const vid = req.session.vendedorId;
  const xp = store.getXpTotal(vid);
  const nivel = niveles.nivelDeXp(xp);
  res.json({ xp, nivel, desglose: store.getXpDesglose(vid), puntos: niveles.PUNTOS });
});

// Ranking global de la Red (todos los externos). Incluye la posición del propio asesor.
router.get('/ranking', requireExterno, (req, res) => {
  const filas = store.getRankingGrupo(2).map((r, i) => ({
    puesto: i + 1,
    vendedorId: r.vendedor_id,
    nombre: r.nombre,
    foto: r.foto || null,
    xp: Number(r.xp) || 0,
    nivel: niveles.nivelDeXp(r.xp),
    vendidos: Number(r.vendidos) || 0,
    vendidosMes: Number(r.vendidos_mes) || 0,
    activos: Number(r.activos) || 0,
    yo: Number(r.vendedor_id) === Number(req.session.vendedorId),
  }));
  res.json(filas);
});

// ───────────────── ADMIN ─────────────────

router.get('/admin/asesores', auth.requireAdmin, (req, res) => {
  const externos = store.getVendedores({ grupoId: 2 });
  res.json(externos.map(v => {
    const xp = store.getXpTotal(v.id);
    const sub = store.getSuscripcionByVendedor(v.id);
    const vig = store.getSuscripcionVigente(v.id);
    return {
      id: v.id, nombre: v.nombre, telefono: v.telefono, estado: v.estado, foto: v.foto || null,
      xp, nivel: niveles.nivelDeXp(xp),
      suscripcion: sub ? { estado: sub.estado, vence_at: sub.vence_at, vigente: !!vig } : { estado: 'ninguna', vigente: false },
      terminos_at: v.terminos_at || null,
    };
  }));
});

router.get('/admin/pagos', auth.requireAdmin, (req, res) => res.json(store.getPagosPendientes()));

// Servir el archivo de comprobante — SOLO admin (los comprobantes son privados).
router.get('/admin/comprobante/:file', auth.requireAdmin, (req, res) => {
  const file = path.basename(String(req.params.file)); // anti path traversal
  const fp = path.join(COMPROBANTES_DIR, file);
  if (!fp.startsWith(COMPROBANTES_DIR) || !fs.existsSync(fp)) return res.status(404).json({ error: 'no_existe' });
  res.sendFile(fp);
});

router.post('/admin/pagos/:id/aprobar', auth.requireAdmin, (req, res) => {
  const pago = store.getPagoById(Number(req.params.id));
  if (!pago) return res.status(404).json({ error: 'pago_no_existe' });
  const actualizado = store.aprobarPago(pago.id, req.session.vendedorId || req.session.userId);
  try {
    const sub = store.getSuscripcionByVendedor(pago.vendedor_id);
    require('../services/events').emitToVendedor(pago.vendedor_id, 'red_suscripcion', { estado: 'activa', vence_at: sub ? sub.vence_at : null, ts: Date.now() });
    require('../services/notify').notify({ vendedorId: pago.vendedor_id, tipo: 'red_pago_aprobado', push: true,
      titulo: '✅ Pago aprobado', cuerpo: 'Tu suscripción está activa. Ya empezarás a recibir clientes.' }).catch(() => {});
  } catch (e) {}
  res.json({ ok: true, pago: actualizado });
});

router.post('/admin/pagos/:id/rechazar', auth.requireAdmin, (req, res) => {
  const pago = store.getPagoById(Number(req.params.id));
  if (!pago) return res.status(404).json({ error: 'pago_no_existe' });
  const notas = String((req.body && req.body.notas) || '').slice(0, 300);
  const actualizado = store.rechazarPago(pago.id, req.session.vendedorId || req.session.userId, notas);
  try {
    require('../services/events').emitToVendedor(pago.vendedor_id, 'red_suscripcion', { estado: 'rechazado', ts: Date.now() });
    require('../services/notify').notify({ vendedorId: pago.vendedor_id, tipo: 'red_pago_rechazado', push: true,
      titulo: '⚠️ Comprobante rechazado', cuerpo: notas || 'Revisa tu comprobante y vuelve a enviarlo.' }).catch(() => {});
  } catch (e) {}
  res.json({ ok: true, pago: actualizado });
});

router.get('/admin/grupos', auth.requireAdmin, (req, res) => res.json(store.getGrupos()));

router.put('/admin/grupos/:id', auth.requireAdmin, (req, res) => {
  const g = store.getGrupoById(Number(req.params.id));
  if (!g) return res.status(404).json({ error: 'grupo_no_existe' });
  const { nombre, cuota_pct, marca_nombre, marca_logo, activo } = req.body || {};
  const actualizado = store.updateGrupo(g.id, { nombre, cuota_pct, marca_nombre, marca_logo, activo });
  res.json({ ok: true, grupo: actualizado });
});

// Resumen del panel admin de la Red.
router.get('/admin/resumen', auth.requireAdmin, (req, res) => {
  const externos = store.getVendedores({ grupoId: 2 });
  const activos = externos.filter(v => v.estado === 'activo' && store.getSuscripcionVigente(v.id));
  const porVencer = store.getSuscripcionesPorVencer(5);
  const pagosPendientes = store.getPagosPendientes().length;
  const grupos = store.getGrupos();
  res.json({
    totalExternos: externos.length,
    activos: activos.length,
    porVencer: porVencer.length,
    pagosPendientes,
    cuota: grupos.map(g => ({ id: g.id, nombre: g.nombre, tipo: g.tipo, cuota_pct: g.cuota_pct })),
  });
});

module.exports = router;
