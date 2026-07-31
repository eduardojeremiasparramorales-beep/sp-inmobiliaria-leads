// Supervisor Center — API del rol supervisor.
//
// Montado en index.js como `app.use('/api/supervisor', auth.requireSupervisor, require('./api/supervisor'))`,
// por lo que TODA ruta aquí abajo exige sesión con rol='supervisor' (no se mezcla con
// endpoints admin ni con vendedor). El supervisor reusa los servicios/store existentes
// — este router solo expresa endpoints agregados nuevos que no existen hoy:
//   - GET  /api/supervisor/                (S1: ping para verificar que la auth funciona)
//   - GET  /api/supervisor/me              (S1: sesión del supervisor + resumen de capacidades)
//   - GET  /api/supervisor/dashboard        (S2: métricas globales del equipo)
//   - GET  /api/supervisor/equipo           (S3: listado de asesores con métricas)
//   - POST /api/supervisor/reasignar/:leadId (S3: delega en store.assignLeadToVendedor)
//   - GET  /api/supervisor/conversaciones    (S4: inbox del equipo con filtros)
//   - GET  /api/supervisor/alertas           (S5: histórico de alertas del escalado)
//   - GET  /api/supervisor/feed              (S6: feed multimedia — Sprint 6)
//   - GET  /api/supervisor/analitica         (S8: embudo + series — Sprint 8)
//
// S1 expone solo los 2 primeros (ping + me) para verificar el cableado. Los demás
// llegan con cada Sprint; mientras tanto, devuelven 501 Not Implemented — así el
// frontend puede probar la existencia de la ruta sin que parezca un bug de auth.

const express = require('express');
const router = express.Router();

const auth = require('../services/auth');
const store = require('../db/store');

// --- S1: ping de cableado ---
// Útil para verificar, desde el frontend o con curl, que la cookie sp_session
// autentica al supervisor correctamente (response.ok=204 → todo el cableado S1 anda).
router.get('/', (req, res) => {
  res.json({
    ok: true,
    rol: req.session.rol,
    vendedorId: req.session.vendedorId,
    nombre: req.session.nombre,
    sprints: ['me', 'dashboard', 'equipo', 'conversaciones', 'alertas', 'feed', 'analitica'],
  });
});

// --- S1: quién soy + listar mis capacidades ---
// Mismos datos que /api/me pero contextualizados al supervisor: lista las secciones
// del Supervisor Center que están activas en este despliegue (las que ya tienen su
// propio Sprint implementado). El frontend lo usa para habilitar/deshabilitar tabs.
router.get('/me', (req, res) => {
  const v = req.session.vendedorId ? store.getVendedorById(req.session.vendedorId) : null;
  const capacidades = [
    { id: 'me', sprint: 1, activo: true },
    { id: 'dashboard', sprint: 2, activo: false },
    { id: 'equipo', sprint: 3, activo: false },
    { id: 'conversaciones', sprint: 4, activo: false },
    { id: 'alertas', sprint: 5, activo: false },
    { id: 'feed', sprint: 6, activo: false },
    { id: 'ia', sprint: 7, activo: false },
    { id: 'analitica', sprint: 8, activo: false },
  ];
  res.json({
    nombre: req.session.nombre,
    rol: req.session.rol,
    vendedorId: req.session.vendedorId,
    telefono: v ? v.telefono : null,
    foto: v ? (v.foto || null) : null,
    estado: v ? v.estado : null,
    capacidades,
  });
});

// --- Stubs para próximos sprints (501 hasta que el Sprint correspondiente los implemente) ---
const stub = (id, sprint) => (req, res) => res.status(501).json({ error: 'no_implementado', seccion: id, sprint });
router.get('/dashboard', stub('dashboard', 2));
router.get('/equipo', stub('equipo', 3));
router.post('/reasignar/:leadId', stub('reasignar', 3));
router.get('/conversaciones', stub('conversaciones', 4));
router.get('/alertas', stub('alertas', 5));
router.get('/feed', stub('feed', 6));
router.get('/analitica', stub('analitica', 8));

module.exports = router;
