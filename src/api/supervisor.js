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
// S1 expone ping + me; S2 /dashboard; S3 /equipo, /equipo/leads y /reasignar;
// S4 /conversaciones (el timeline se sirve desde los endpoints existentes, ya
// abiertos al supervisor en index.js). Los demás llegan con cada Sprint;
// mientras tanto, devuelven 501 Not Implemented — así el frontend puede probar
// la existencia de la ruta sin que parezca un bug de auth.

const express = require('express');
const router = express.Router();

const auth = require('../services/auth');
const store = require('../db/store');
const events = require('../services/events');
const { notify } = require('../services/notify');

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
    { id: 'equipo', sprint: 3, activo: true },
    { id: 'conversaciones', sprint: 4, activo: true },
    { id: 'alertas', sprint: 5, activo: true },
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

// --- Helper: IDs de vendedores que NO son asesores (admin/supervisor) ---
// Misma regla que el round-robin de getVendedoresActivos(): el supervisor nunca
// debe ver al admin ni a sí mismo como parte del equipo de asesores.
function idsNoAsesores() {
  const excl = new Set();
  try {
    const r = store.getDB().exec("SELECT vendedor_id FROM usuarios WHERE rol IN ('admin','supervisor') AND vendedor_id IS NOT NULL");
    if (r && r.length) r[0].values.forEach(row => excl.add(Number(row[0])));
  } catch (e) { /* noop */ }
  return excl;
}

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
    const excl = idsNoAsesores();

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
// --- S3: Equipo — listado de asesores con métricas individuales ---
// Cada asesor: contadores de pipeline (insignias), estado, actividad de hoy y
// tasa de respuesta. Ordenado por cierres del mes → cierres totales (ranking).
router.get('/equipo', (req, res) => {
  try {
    const excl = idsNoAsesores();
    // Un solo query de insignias y un join en memoria (evita N+1 por asesor)
    const stats = {};
    (store.getInsigniaStats() || []).forEach(s => { stats[Number(s.vendedor_id)] = s; });

    const asesores = (store.getVendedores() || [])
      .filter(v => !excl.has(Number(v.id)))
      .map(v => {
        const s = stats[Number(v.id)] || {};
        const m = store.getVendedorMetricas(v.id);
        const total = Number(v.total_leads) || 0;
        const vendidos = Number(s.vendidos) || 0;
        return {
          id: v.id,
          nombre: v.nombre,
          telefono: v.telefono,
          estado: v.estado,
          foto: v.foto || null,
          total,
          activos: Number(s.activos) || 0,
          pendientes: Number(s.pendientes) || 0,
          vendidos,
          vendidosMes: Number(s.vendidos_mes) || 0,
          respondidos: Number(s.respondidos) || 0,
          leadsHoy: m.leadsHoy,
          leadsCerrados: m.leadsCerrados,
          tasaRespuesta: m.tasaRespuesta,
          conversion: total ? Math.round((vendidos / total) * 100) : 0,
          ultimaActividad: m.ultimaActividad,
        };
      })
      .sort((a, b) => (b.vendidosMes - a.vendidosMes) || (b.vendidos - a.vendidos) || a.nombre.localeCompare(b.nombre));

    res.json({ asesores, generadoEn: new Date().toISOString() });
  } catch (e) {
    console.error('[SUPERVISOR] equipo error:', e.message);
    res.status(500).json({ error: 'error_equipo', detalle: e.message });
  }
});

// --- S3: Leads activos de un asesor (para el picker de reasignación) ---
// Reusa getAdminInbox del store (el mismo query que el inbox del admin) y filtra
// solo los leads no cerrados. Sin paginación propia: limite 300 es suficiente
// para la operación manual de un supervisor.
router.get('/equipo/leads', (req, res) => {
  try {
    const asesorId = Number(req.query.asesorId);
    if (!asesorId) return res.status(400).json({ error: 'asesor_requerido' });
    const asesor = store.getVendedorById(asesorId);
    if (!asesor) return res.status(404).json({ error: 'asesor_no_existe' });
    const rows = store.getAdminInbox({ vendedorId: asesorId, limite: 300 }) || [];
    res.json({
      asesor: { id: asesor.id, nombre: asesor.nombre },
      leads: rows
        .filter(l => String(l.status || '') !== 'cerrado')
        .map(l => ({
          id: l.id,
          nombre: l.customer_name,
          telefono: l.customer_phone,
          etiqueta: l.etiqueta || 'sin_clasificar',
          status: l.status || 'nuevo',
          unread: Number(l.unread_count) || 0,
          temperatura: l.temperatura || null,
          creado: l.created_at,
          actualizado: l.updated_at,
        })),
    });
  } catch (e) {
    console.error('[SUPERVISOR] equipo/leads error:', e.message);
    res.status(500).json({ error: 'error_equipo_leads', detalle: e.message });
  }
});

// --- S3: Reasignar un lead entre asesores ---
// Espejo del endpoint admin /api/leads/:id/reasignar pero restringido a asesores
// reales (excluye admin/supervisor) y con los mismos efectos secundarios:
// reassignLead() en store + SSE a ambos vendedores y admins + notificación push.
router.post('/reasignar/:leadId', (req, res) => {
  try {
    const lead = store.getLeadById(req.params.leadId);
    if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
    if (String(lead.status || '') === 'cerrado') return res.status(400).json({ error: 'lead_cerrado' });

    const excl = idsNoAsesores();
    const vendedorId = Number((req.body || {}).vendedorId);
    const vendedor = (store.getVendedores() || []).find(v => Number(v.id) === vendedorId && !excl.has(Number(v.id)));
    if (!vendedor) return res.status(400).json({ error: 'vendedor_no_existe' });
    if (String(vendedor.estado) !== 'activo') return res.status(400).json({ error: 'vendedor_inactivo' });
    if (Number(lead.assigned_to_id) === Number(vendedor.id)) return res.status(400).json({ error: 'mismo_asesor' });

    const anteriorId = lead.assigned_to_id;
    store.reassignLead(lead.id, vendedor, anteriorId);

    events.emitToVendedor(vendedor.id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'reasignado', ts: Date.now() });
    if (anteriorId) events.emitToVendedor(anteriorId, 'nuevo_mensaje', { leadId: lead.id, tipo: 'reasignado', ts: Date.now() });
    events.emitToAdmins('lead_actualizado', { leadId: lead.id, tipo: 'reasignado', ts: Date.now() });
    notify({ vendedorId: vendedor.id, tipo: 'lead_asignado', leadId: lead.id, push: true,
      titulo: '🆕 Lead asignado a ti', cuerpo: `${lead.customer_name} (${lead.customer_phone})` }).catch(() => {});
    if (anteriorId && Number(anteriorId) !== Number(vendedor.id)) {
      notify({ vendedorId: anteriorId, tipo: 'lead_reasignado', leadId: lead.id, push: true,
        titulo: '🔄 Lead reasignado', cuerpo: `${lead.customer_name} pasó a ${vendedor.nombre}.` }).catch(() => {});
    }

    console.log(`[SUPERVISOR] Reasignado lead ${lead.id} (${lead.customer_name}): vendedor ${anteriorId || '—'} → ${vendedor.id} por ${req.session.nombre}`);
    res.json({ ok: true, leadId: lead.id, vendedor: { id: vendedor.id, nombre: vendedor.nombre } });
  } catch (e) {
    console.error('[SUPERVISOR] reasignar error:', e.message);
    res.status(500).json({ error: 'error_reasignar', detalle: e.message });
  }
});

// --- S4: Conversaciones en vivo — inbox del equipo con filtros ---
// Reusa getUnifiedConversations (legacy leads + multicanal) y filtra en memoria:
//   - busqueda: nombre o teléfono del cliente
//   - vendedorId: solo las de un asesor
//   - etiqueta: etapa del pipeline ('todos' = sin filtro)
//   - soloSinResponder=1: solo conversaciones con mensajes entrantes sin leer
//   - canal: whatsapp | messenger | instagram
// El timeline de cada ítem lo consume el frontend desde los endpoints ya existentes
// (/api/leads/:id/mensajes y /api/inbox/conversations/:id/timeline), abiertos al
// supervisor en index.js (lectura global + cerrar leads).
router.get('/conversaciones', (req, res) => {
  try {
    const { busqueda, vendedorId, etiqueta, soloSinResponder, canal } = req.query;
    const items = store.getUnifiedConversations({ busqueda, vendedorId, limite: 300 }) || [];
    const conversaciones = items.filter(it => {
      if (String(it.status || '') === 'cerrado') return false;
      if (String(it.lead_status || '') === 'cerrado') return false;
      if (etiqueta && etiqueta !== 'todos' && String(it.etiqueta || 'sin_clasificar') !== String(etiqueta)) return false;
      if (soloSinResponder === '1' && Number(it.unread_count || 0) === 0) return false;
      if (canal && String(it.channel || 'whatsapp') !== String(canal)) return false;
      return true;
    });
    res.json({ conversaciones, generadoEn: new Date().toISOString() });
  } catch (e) {
    console.error('[SUPERVISOR] conversaciones error:', e.message);
    res.status(500).json({ error: 'error_conversaciones', detalle: e.message });
  }
});

// ── S5: Alertas — panel de monitoreo de eventos del equipo ─────────────────
// Notificaciones del canal de supervisión (vendedor_id = 0) generadas por el
// sistema (asignaciones, escalamientos, mensajes programados, errores, etc.).
// El supervisor NO puede crear alertas manuales — solo administradores.
// ────────────────────────────────────────────────────────────────────────────

// GET /api/supervisor/alertas — historial paginado con filtros
router.get('/alertas', (req, res) => {
  try {
    const tipos = (req.query.tipo || '')
      .split(',')
      .map(s => String(s).trim())
      .filter(Boolean);
    const soloSinLeer = req.query.leidas === '0';
    const leerLeidas = req.query.leidas === '1';
    const desde = Number(req.query.desde) || 0;
    const limit = Math.min(Number(req.query.limite) || 50, 100);

    const todas = store.getNotifications(0, 200);
    let filtradas = todas.filter(n => Number(n.created_at) >= desde);

    if (leerLeidas) filtradas = filtradas.filter(n => n.leida);
    else if (soloSinLeer) filtradas = filtradas.filter(n => !n.leida);

    if (tipos.length > 0) filtradas = filtradas.filter(n => tipos.includes(String(n.tipo)));

    // Resumen por tipo (conteos de todas, no filtradas)
    const conteo = {};
    for (const n of todas) conteo[n.tipo] = (conteo[n.tipo] || 0) + 1;

    res.json({
      alertas: filtradas.slice(0, limit),
      total: filtradas.length,
      limite: limit,
      conteoPorTipo: conteo,
      generadoEn: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[SUPERVISOR] alertas error:', e.message);
    res.status(500).json({ error: 'error_alertas', detalle: e.message });
  }
});

// GET /api/supervisor/alertas/sin-leer — conteo para badge del NAV
router.get('/alertas/sin-leer', (_req, res) => {
  try {
    const n = store.countUnreadNotifications(0);
    res.json({ sin_leer: n });
  } catch (e) {
    console.error('[SUPERVISOR] alertas/sin-leer error:', e.message);
    res.status(500).json({ error: 'error_sin_leer', detalle: e.message });
  }
});

// POST /api/supervisor/alertas/marcar-todas
router.post('/alertas/marcar-todas', (_req, res) => {
  try {
    store.markAllNotificationsRead(0);
    res.json({ ok: true });
  } catch (e) {
    console.error('[SUPERVISOR] alertas/marcar-todas error:', e.message);
    res.status(500).json({ error: 'error_marcar_todas', detalle: e.message });
  }
});

// POST /api/supervisor/alertas/:id/leer
router.post('/alertas/:id/leer', (req, res) => {
  try {
    store.markNotificationRead(req.params.id, 0);
    res.json({ ok: true });
  } catch (e) {
    console.error('[SUPERVISOR] alertas/leer error:', e.message);
    res.status(500).json({ error: 'error_leer', detalle: e.message });
  }
});

// --- Stubs para próximos sprints (501 hasta que el Sprint correspondiente los implemente) ---
const stub = (id, sprint) => (req, res) => res.status(501).json({ error: 'no_implementado', seccion: id, sprint });
router.get('/feed', stub('feed', 6));
router.get('/analitica', stub('analitica', 8));

module.exports = router;
