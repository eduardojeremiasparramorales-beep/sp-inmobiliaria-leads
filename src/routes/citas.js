/**
 * Citas + recordatorio de cita — Rutas REST
 * Todo el router va montado bajo auth.requireAuth (ver src/index.js).
 * El recordatorio es un mensaje programado tipo 'template': aunque la ventana de 24h
 * se cierre antes de la cita, la plantilla de Meta llega igual (ese es el punto).
 */

const express = require('express');
const router = express.Router();
const store = require('../db/store');

// Listar citas: admin ve todas (o filtra por vendedor); vendedor solo las suyas
router.get('/', (req, res) => {
  const { desde, hasta } = req.query;
  const vendedorId = req.session.rol === 'admin' ? req.query.vendedorId : req.session.vendedorId;
  res.json(store.getCitas({ vendedorId, desde, hasta }));
});

// Crear cita — vendedor solo puede agendarse a sí mismo
router.post('/', (req, res) => {
  const { leadId, titulo, fecha, notas, vendedorId } = req.body || {};
  if (!titulo || !String(titulo).trim()) return res.status(400).json({ error: 'titulo_requerido' });
  if (!fecha) return res.status(400).json({ error: 'fecha_requerida' });
  let vId = req.session.rol === 'admin' ? (vendedorId || null) : req.session.vendedorId;
  if (leadId) {
    const lead = store.getLeadById(leadId);
    if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
    if (req.session.rol !== 'admin' && Number(lead.assigned_to_id) !== Number(req.session.vendedorId)) {
      return res.status(403).json({ error: 'sin_permiso' });
    }
    if (!vId) vId = lead.assigned_to_id || null;
  }
  const cita = store.createCita({ leadId: leadId || null, vendedorId: vId, titulo: String(titulo).trim(), fecha, notas });
  res.json({ ok: true, cita });
});

// Actualizar cita (estado, fecha, notas)
router.put('/:id', (req, res) => {
  const cita = store.getCitaById(req.params.id);
  if (!cita) return res.status(404).json({ error: 'no_existe' });
  if (req.session.rol !== 'admin' && Number(cita.vendedor_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const { titulo, fecha, notas, estado, vendedorId } = req.body || {};
  if (estado && !['pendiente', 'hecha', 'cancelada'].includes(estado)) return res.status(400).json({ error: 'estado_invalido' });
  // Al cerrar la cita (hecha/cancelada) el recordatorio pendiente pierde sentido.
  if (estado && estado !== 'pendiente') store.cancelarRecordatorioByCitaCierre(cita.id);
  const actualizada = store.updateCita(cita.id, { titulo, fecha, notas, estado, vendedorId: req.session.rol === 'admin' ? vendedorId : undefined });
  // Si se movió la fecha y hay recordatorio pendiente, se reprograma con la misma antelación.
  if (fecha && fecha !== cita.fecha) {
    const rec = store.getRecordatorioCita(cita.id);
    if (rec) {
      const citaNueva = store.getCitaById(cita.id);
      const antelacionMs = new Date(cita.fecha.replace(' ', 'T')).getTime() - new Date(rec.send_at.replace(' ', 'T')).getTime();
      if (antelacionMs > 0) {
        const nuevoSendAt = new Date(new Date(citaNueva.fecha.replace(' ', 'T')).getTime() - antelacionMs);
        store.updateScheduled(rec.id, { send_at: nuevoSendAt.toISOString().slice(0, 19).replace('T', ' ') });
      }
    }
  }
  res.json({ ok: true, cita: actualizada });
});

// Eliminar cita
router.delete('/:id', (req, res) => {
  const cita = store.getCitaById(req.params.id);
  if (!cita) return res.status(404).json({ error: 'no_existe' });
  if (req.session.rol !== 'admin' && Number(cita.vendedor_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.cancelarRecordatorioByCitaCierre(cita.id);
  store.deleteCita(cita.id);
  res.json({ ok: true });
});

// Estado actual del recordatorio de la cita
router.get('/:id/recordatorio', (req, res) => {
  const cita = store.getCitaById(req.params.id);
  if (!cita) return res.status(404).json({ error: 'no_existe' });
  if (req.session.rol !== 'admin' && Number(cita.vendedor_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  const rec = store.getRecordatorioCita(cita.id);
  res.json({
    ok: true,
    programado: !!rec,
    recordatorio: rec ? {
      id: rec.id,
      send_at: rec.send_at,
      template_nombre: rec.template_nombre,
      vendedor_id: rec.vendedor_id,
    } : null,
    template_configurado: !!store.getConfig('recordatorio_template'),
  });
});

// Crear / re-programar el recordatorio. body: { antelacionHoras: 1|3|6|24|48 }
// Se envía `antelacionHoras` horas ANTES de la cita con la plantilla configurada.
router.post('/:id/recordatorio', (req, res) => {
  try {
    const cita = store.getCitaById(req.params.id);
    if (!cita) return res.status(404).json({ error: 'no_existe' });
    if (req.session.rol !== 'admin' && Number(cita.vendedor_id) !== Number(req.session.vendedorId)) {
      return res.status(403).json({ error: 'sin_permiso' });
    }
    if (!cita.lead_id) return res.status(400).json({ error: 'cita_sin_lead' });
    const lead = store.getLeadById(cita.lead_id);
    if (!lead) return res.status(404).json({ error: 'lead_no_existe' });
    const antelacionHoras = Number((req.body || {}).antelacionHoras);
    if (![1, 3, 6, 24, 48].includes(antelacionHoras)) return res.status(400).json({ error: 'antelacion_invalida', valido: [1, 3, 6, 24, 48] });

    const templateName = store.getConfig('recordatorio_template');
    if (!templateName) return res.status(400).json({ error: 'sin_template', detalle: 'Configura el template de recordatorio en Configuración.' });
    const tpl = store.getWATemplateByName(templateName);
    if (!tpl) return res.status(400).json({ error: 'template_no_sincronizado', detalle: `La plantilla "${templateName}" no está en el catálogo. Sincroniza desde Meta.` });

    const vendedor = cita.vendedor_id ? store.getVendedorById(cita.vendedor_id) : null;
    const wa = require('../services/wa-templates');
    const values = wa.buildCitaRecordatorioValues(tpl, lead, vendedor, cita);
    const components = wa.buildCitaRecordatorioComponents(tpl, values);
    const textoPlano = wa.recordatorioTextoPlano(tpl, values);

    const citaMs = new Date(cita.fecha.replace(' ', 'T')).getTime();
    if (isNaN(citaMs)) return res.status(400).json({ error: 'fecha_cita_invalida' });
    const sendAtMs = citaMs - antelacionHoras * 3600000;
    const sendAt = new Date(sendAtMs).toISOString().slice(0, 19).replace('T', ' ');

    // Reemplaza el recordatorio anterior si existía
    store.cancelarRecordatorioCita(cita.id);
    const id = store.createRecordatorioCita({
      citaId: cita.id,
      leadId: lead.id,
      vendedorId: cita.vendedor_id || req.session.vendedorId || 0,
      sendAt,
      body: textoPlano || `Recordatorio: ${cita.titulo}`,
      templateNombre: tpl.nombre,
      templateIdioma: tpl.idioma || 'es',
      templateParams: JSON.stringify(components),
    });
    res.json({ ok: true, id, send_at: sendAt, template_nombre: tpl.nombre, texto: textoPlano });
  } catch (e) {
    console.error('[CITAS] Error creando recordatorio:', e.message);
    res.status(500).json({ error: 'error_interno', detalle: e.message });
  }
});

// Cancelar el recordatorio de la cita
router.delete('/:id/recordatorio', (req, res) => {
  const cita = store.getCitaById(req.params.id);
  if (!cita) return res.status(404).json({ error: 'no_existe' });
  if (req.session.rol !== 'admin' && Number(cita.vendedor_id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.cancelarRecordatorioCita(cita.id);
  res.json({ ok: true });
});

module.exports = router;
