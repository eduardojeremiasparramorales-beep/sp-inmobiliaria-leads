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
// S1 expone ping + me; S2 agrega /dashboard (auto-contenido, reusa store).
// Los demás llegan con cada Sprint; mientras tanto, devuelven 501 Not Implemented
// — así el frontend puede probar la existencia de la ruta sin que parezca un bug de auth.

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
    { id: 'dashboard', sprint: 2, activo: true },
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

// --- S2: Dashboard global del equipo ---
// Devuelve una snapshot agregada lista para pintar el dashboard del supervisor:
//   - KPIs globales (leads totales, activos, sin responder, vendidos, conversion)
//   - Embudo (porEtiqueta: sin_clasificar → vendido, distribución de la pipeline)
//   - Ranking de asesores (usando getInsigniaStats, que ya ordena por ventas del mes)
//   - Alertas vivas (leads sin responder hace 30+ minutos y 60+ minutos)
// Reusa store.js — cero SQL nueva. Datos del mismo tenant que el request (multi-tenant
// ya cableado por el middleware de index.js vía AsyncLocalStorage del adapter).
router.get('/dashboard', (req, res) => {
  try {
    const agg = store.getLeadAggregates();
    const { total, porEtiqueta, porEstado, porVendedor, respondidos, sumaRespuestaMin } = agg;
    const vendidosTotal = porEtiqueta['vendido'] || 0;
    const activosTotal = total - (porEstado['cerrado'] || 0);

    // Alertas vivas (los mismos dos cortes que el scheduler de escalado del admin)
    let sinResponder = 0;
    try {
      const r = store.getDB().exec("SELECT COUNT(*) FROM leads WHERE first_response_at IS NULL AND COALESCE(status,'') != 'cerrado'");
      sinResponder = (r && r.length && r[0].values.length) ? Number(r[0].values[0][0]) : 0;
    } catch (e) { /* noop */ }

    // IDs a excluir del "equipo" del supervisor: vendedores que en realidad son
    // admin o supervisor (misma regla que el round-robin de getVendedoresActivos).
    const excl = new Set();
    try {
      const r = store.getDB().exec("SELECT vendedor_id FROM usuarios WHERE rol IN ('admin','supervisor') AND vendedor_id IS NOT NULL");
      if (r && r.length) r[0].values.forEach(row => excl.add(Number(row[0])));
    } catch (e) { /* noop */ }

    // Ranking por asesor desde getInsigniaStats (ya mapeado y ordenado en store.js)
    let ranking = [];
    try {
      const stats = store.getInsigniaStats() || [];
      ranking = stats.filter(s => !excl.has(Number(s.vendedor_id))).map(s => ({
        vendedorId: s.vendedor_id,
        nombre: s.nombre,
        vendidos: Number(s.vendidos) || 0,
        vendidosMes: Number(s.vendidos_mes) || 0,
        activos: Number(s.activos) || 0,
      })).sort((a, b) => (b.vendidosMes - a.vendidosMes) || (b.vendidos - a.vendidos));
    } catch (e) { /* getInsigniaStats podría no tener datos */ }

    // Por vendedor con métricas individuales (rico para la vista de Equipo en S3)
    const equipo = (porVendedor || []).filter(v => !excl.has(Number(v.id))).map(v => ({
      id: v.id, nombre: v.nombre, estado: v.estado,
      total: v.total, activos: v.activos, vendidos: v.vendidos,
      conversion: v.conversion,
    }));

    // Tiempo de respuesta promedio del negocio (en minutos, redondeado)
    const tiempoRespuestaPromedio = respondidos ? Math.round(sumaRespuestaMin / respondidos) : null;

    res.json({
      kpis: {
        totalLeads: total,
        leadsActivos: activosTotal,
        leadsSinResponder: sinResponder,
        vendidos: vendidosTotal,
        conversionGlobal: total ? Math.round((vendidosTotal / total) * 100) : 0,
        tiempoRespuestaPromedio,
        respondidos,
        totalAsesores: equipo.length,
      },
      embudo: {
        sin_clasificar: porEtiqueta['sin_clasificar'] || 0,
        interesado: porEtiqueta['interesado'] || 0,
        negociacion: porEtiqueta['negociacion'] || 0,
        cita: porEtiqueta['cita'] || 0,
        vendido: vendidosTotal,
        no_interesado: porEtiqueta['no_interesado'] || 0,
      },
      equipo,
      ranking,
      generadoEn: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[SUPERVISOR] dashboard error:', e.message);
    res.status(500).json({ error: 'error_dashboard', detalle: e.message });
  }
});
// --- Stubs para próximos sprints (501 hasta que el Sprint correspondiente los implemente) ---
const stub = (id, sprint) => (req, res) => res.status(501).json({ error: 'no_implementado', seccion: id, sprint });
router.get('/equipo', stub('equipo', 3));
router.post('/reasignar/:leadId', stub('reasignar', 3));
router.get('/conversaciones', stub('conversaciones', 4));
router.get('/alertas', stub('alertas', 5));
router.get('/feed', stub('feed', 6));
router.get('/analitica', stub('analitica', 8));

module.exports = router;
