// Runner de mensajes programados en SERVIDOR: los envía al vencer aunque el
// vendedor tenga la app cerrada (antes vivían en localStorage y solo salían
// con la app abierta). Ver tabla scheduled_messages en store.js.
const store = require('../db/store');
const { sendMessageSmart } = require('./whatsapp');
const events = require('./events');
const { notify } = require('./notify');

const TICK_MS = 45000;
const MAX_INTENTOS = 3;

let _corriendo = false;
let _buildFirma = null; // inyectada desde index.js (comparte la firma del asesor)

async function tick() {
  if (_corriendo) return; // anti-solape si un tick anterior sigue enviando
  _corriendo = true;
  try {
    const due = store.getScheduledDue();
    for (const s of due) {
      await enviarUno(s);
    }
  } catch (e) {
    console.error('[SCHEDULER] tick:', e.message);
  } finally {
    _corriendo = false;
  }
}

async function enviarUno(s) {
  // Releer la fila: la tanda se procesa en serie (~segundos por envío) y el vendedor
  // pudo cancelarla DESPUÉS del getScheduledDue() — sin esto se enviaría igual y el
  // 'enviado' pisaría el 'cancelado'.
  const fresh = store.getScheduledById(s.id);
  if (!fresh || fresh.estado !== 'pendiente') return;
  const lead = store.getLeadById(s.lead_id);
  if (!lead || lead.status === 'cerrado') {
    store.updateScheduled(s.id, { estado: 'cancelado', last_error: 'lead_no_disponible' });
    return;
  }
  // Lead reasignado a otro vendedor: no enviar un texto firmado por el vendedor
  // original a una conversación que ya no es suya (regla: un lead = un vendedor).
  if (s.vendedor_id && Number(lead.assigned_to_id) !== Number(s.vendedor_id)) {
    store.updateScheduled(s.id, { estado: 'cancelado', last_error: 'lead_reasignado' });
    try {
      notify({ vendedorId: s.vendedor_id, tipo: 'programado_cancelado', titulo: 'Mensaje programado cancelado', cuerpo: `El lead ${lead.customer_name || lead.customer_phone} fue reasignado; tu mensaje programado no se envió.`, leadId: lead.id, push: true });
    } catch (e2) { }
    return;
  }
  try {
    const vendedor = s.vendedor_id ? store.getVendedorById(s.vendedor_id) : null;
    const nombre = vendedor ? vendedor.nombre : 'Asesor';
    const cuerpo = _buildFirma ? _buildFirma(s.body, nombre) : s.body;
    const smart = await sendMessageSmart(lead.customer_phone, cuerpo, lead.id);
    // Marcar 'enviado' INMEDIATAMENTE tras aceptar Meta el envío: si la contabilidad
    // de abajo fallara (disco lleno, deploy que mata el proceso), el peor caso es un
    // mensaje sin registrar — nunca un cliente recibiendo el mismo texto duplicado.
    store.updateScheduled(s.id, { estado: 'enviado', sent_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    try {
      if (!smart.queued) {
        // Envío free-form real → registrar en el chat.
        // Con ventana cerrada (queued=true) NO se guarda aquí: el cuerpo quedó en
        // pending_outbound y flushPendingOutbound hará el saveMessage cuando el
        // cliente responda — guardarlo dos veces duplicaba la burbuja.
        const wamid = smart.data && smart.data.messages && smart.data.messages[0] ? smart.data.messages[0].id : null;
        const fromNumber = lead.assigned_to_phone || 'panel';
        store.saveMessage(lead.id, fromNumber, lead.customer_phone, s.body, 'outgoing', null, null, wamid, 'sent');
        store.syncLeadToConversation(store.getLeadById(lead.id), { direction: 'outgoing', body: s.body, fromNumber, toNumber: lead.customer_phone });
        events.emitToVendedor(lead.assigned_to_id, 'nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
        events.emitToAdmins('nuevo_mensaje', { leadId: lead.id, tipo: 'respuesta_panel', ts: Date.now() });
      }
      events.emitToVendedor(s.vendedor_id, 'programado_enviado', { id: s.id, leadId: lead.id, viaTemplate: !!smart.queued, ts: Date.now() });
    } catch (e2) {
      console.error(`[SCHEDULER] Programado #${s.id} enviado pero falló la contabilidad:`, e2.message);
    }
    console.log(`[SCHEDULER] Programado #${s.id} enviado a lead ${lead.id}${smart.templateSent ? ' (via template, ventana cerrada — saldrá al responder el cliente)' : ''}`);
  } catch (e) {
    const intentos = (s.intentos || 0) + 1;
    if (intentos >= MAX_INTENTOS) {
      store.updateScheduled(s.id, { estado: 'fallido', intentos, last_error: e.message });
      events.emitToVendedor(s.vendedor_id, 'programado_fallido', { id: s.id, leadId: lead.id, error: e.message, ts: Date.now() });
      try {
        notify({ vendedorId: s.vendedor_id, tipo: 'programado_fallido', titulo: 'Mensaje programado falló', cuerpo: `No se pudo enviar el mensaje programado a ${lead.customer_name || lead.customer_phone}: ${e.message}`, leadId: lead.id, push: true });
      } catch (e2) { }
      console.error(`[SCHEDULER] Programado #${s.id} FALLÓ definitivamente:`, e.message);
    } else {
      // Reintento: retrasar 2 min para no martillar en el mismo tick
      store.updateScheduled(s.id, {
        intentos, last_error: e.message,
        send_at: new Date(Date.now() + 120000).toISOString().slice(0, 19).replace('T', ' '),
      });
      console.warn(`[SCHEDULER] Programado #${s.id} falló (intento ${intentos}/${MAX_INTENTOS}), reintento en 2 min:`, e.message);
    }
  }
}

function start(buildFirmaFn) {
  _buildFirma = buildFirmaFn || null;
  setInterval(tick, TICK_MS);
  console.log('[SCHEDULER] Mensajes programados en servidor: activo (tick ' + TICK_MS / 1000 + 's)');
}

module.exports = { start };
