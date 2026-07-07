const { getVendedoresActivos, assignLeadToVendedor, saveMessage, getLeadById, updateLeadStatus, setFirstResponse, getConfig, updateCustomerMessageTimestamp } = require('../db/store');
const { emitToVendedor, emitToAdmins } = require('./events');

const WELCOME_DEFAULT = 'Hola 👋 Gracias por contactar a *SP Inmobiliaria*. Un asesor te atenderá en los próximos minutos. ¡Estamos para ayudarte!';

function getWelcomeMsg() {
  return getConfig('welcome_message') || WELCOME_DEFAULT;
}

// Espeja el movimiento del lead legacy en el inbox multicanal (conversations/timeline)
function syncMulticanal(leadId, data) {
  try {
    const store = require('../db/store');
    const lead = store.getLeadById(leadId);
    if (lead) store.syncLeadToConversation(lead, data);
  } catch (e) { console.error('syncMulticanal:', e.message); }
}

// Notifica al panel del vendedor (y a admins) que hubo movimiento en un lead
function notificarPanel(vendedorId, leadId, tipo) {
  const data = { leadId, tipo, ts: Date.now() };
  if (vendedorId) emitToVendedor(vendedorId, 'nuevo_mensaje', data);
  emitToAdmins('nuevo_mensaje', data);

  // Push al celular solo cuando llega un mensaje de un cliente
  if (vendedorId && tipo === 'mensaje_cliente') {
    try {
      const push = require('./push');
      const store = require('../db/store');
      const lead = store.getLeadById(leadId);
      push.sendToVendedor(vendedorId, {
        title: '💬 Nuevo mensaje',
        body: lead ? `${lead.customer_name || 'Cliente'}: ${(lead.last_message || '').slice(0, 80)}` : 'Tienes un nuevo mensaje de un cliente.',
        leadId,
        tag: 'lead-' + leadId,
      }).catch(e => console.error('Error enviando push notification:', e.message));
    } catch (e) { /* push opcional */ }
  }
}

function assignLead(customerPhone, customerName, messageBody) {
  const { saveLead } = require('../db/store');
  const result = saveLead(customerPhone, customerName, messageBody);

  const activos = getVendedoresActivos();
  if (activos.length === 0) {
    return { leadId: result.leadId, vendedor: null, isNew: result.isNew, error: 'no_hay_vendedores' };
  }

  const vendedor = activos[0];
  assignLeadToVendedor(result.leadId, vendedor);
  saveMessage(result.leadId, customerPhone, vendedor.telefono, messageBody, 'incoming');

  return { leadId: result.leadId, vendedor, isNew: result.isNew };
}

function routeReply(fromPhone, messageBody, customerName, wamid, callback) {
  // customerName y wamid son opcionales
  if (typeof customerName === 'function') { callback = customerName; customerName = undefined; wamid = null; }
  if (typeof wamid === 'function') { callback = wamid; wamid = null; }
  const { getLeadByCustomerPhone, getVendedores, saveLead, assignLeadToVendedor, getLeadById } = require('../db/store');

  const vendedores = getVendedores();
  const vendedor = vendedores.find(v => v.telefono === fromPhone);

  if (vendedor) {
    const leads = require('../db/store').getLeads();
    const activeLead = leads.find(l => l.assigned_to_id === vendedor.id && l.status !== 'cerrado');

    if (activeLead) {
      saveMessage(activeLead.id, fromPhone, activeLead.customer_phone, messageBody, 'outgoing');
      setFirstResponse(activeLead.id);
      updateLeadStatus(activeLead.id, 'contactado');
      syncMulticanal(activeLead.id, { direction: 'outgoing', body: messageBody, fromNumber: fromPhone, toNumber: activeLead.customer_phone });
      notificarPanel(vendedor.id, activeLead.id, 'respuesta_vendedor');

      const { sendMessage } = require('./whatsapp');
      sendMessage(activeLead.customer_phone, messageBody)
        .then(() => callback(null, { forwarded: true, to: activeLead.customer_phone }))
        .catch(callback);
      return;
    }
  }

  const lead = getLeadByCustomerPhone(fromPhone);
  if (lead) {
    console.log(`[routeReply] Lead existente #${lead.id} de ${fromPhone} — ${lead.customer_name}`);
    const activos = getVendedoresActivos();
    if (activos.length === 0) {
      callback(null, { message: 'cliente_espera' });
      return;
    }
    // Verificar que el vendedor asignado siga activo; si no, reasignar al primero disponible
    let v = lead.assigned_to_id
      ? vendedores.find(vd => vd.id === lead.assigned_to_id && vd.estado === 'activo')
      : null;
    if (!v) v = activos[0];

    saveMessage(lead.id, fromPhone, v.telefono, messageBody, 'incoming', null, null, wamid || null);
    updateCustomerMessageTimestamp(lead.id);
    syncMulticanal(lead.id, { direction: 'incoming', body: messageBody, fromNumber: fromPhone, toNumber: v.telefono });
    notificarPanel(v.id, lead.id, 'mensaje_cliente');

    const { sendMessage } = require('./whatsapp');
    const prefix = lead.messages_count <= 1
      ? `🆕 Nuevo lead\nCliente: ${lead.customer_name}\nTel: ${fromPhone}\n\n`
      : `↩️ Respuesta de ${lead.customer_name}\n\n`;

    sendMessage(v.telefono, prefix + messageBody)
      .then(() => callback(null, { forwarded: true, to: v.telefono }))
      .catch(callback);
    return;
  }

  const { saveLead: saveL } = require('../db/store');
  const r = saveL(fromPhone, customerName || 'Cliente', messageBody);
  const a = getVendedoresActivos();
  const { sendMessageSmart, sendMessage } = require('./whatsapp');

  // Enviar mensaje de bienvenida automático al nuevo lead
  const welcome = getWelcomeMsg();
  sendMessageSmart(fromPhone, welcome, r.leadId)
    .then(() => saveMessage(r.leadId, 'sistema', fromPhone, welcome, 'outgoing'))
    .catch(e => console.error('Error enviando bienvenida:', e.message));

  if (a.length > 0) {
    const vendedorAsignado = a[0];
    try {
      assignLeadToVendedor(r.leadId, vendedorAsignado);
    } catch (e) {
      console.error('Error asignando lead:', e.message);
    }
    saveMessage(r.leadId, fromPhone, vendedorAsignado.telefono, messageBody, 'incoming', null, null, wamid || null);
    updateCustomerMessageTimestamp(r.leadId);
    syncMulticanal(r.leadId, { direction: 'incoming', body: messageBody, fromNumber: fromPhone, toNumber: vendedorAsignado.telefono });
    notificarPanel(vendedorAsignado.id, r.leadId, 'mensaje_cliente');
    sendMessage(vendedorAsignado.telefono, `🆕 Nuevo lead\nCliente: ${customerName || 'Cliente'}\nTel: ${fromPhone}\n\n${messageBody}`)
      .then(() => callback(null, { forwarded: true, to: vendedorAsignado.telefono }))
      .catch(callback);
  } else {
    syncMulticanal(r.leadId, { direction: 'incoming', body: messageBody, fromNumber: fromPhone });
    callback(null, { message: 'no_hay_vendedores' });
  }
}

// Enruta un mensaje multimedia entrante de un cliente: guarda el lead/mensaje con
// la referencia del archivo, avisa al panel y notifica al vendedor asignado.
function routeIncomingMedia(fromPhone, customerName, mediaData, wamid, callback) {
  if (typeof wamid === 'function') { callback = wamid; wamid = null; }
  const store = require('../db/store');
  const { sendMessage } = require('./whatsapp');

  const etiquetas = { image: 'una imagen', audio: 'un audio', video: 'un video', document: 'un archivo', sticker: 'un sticker', voice: 'una nota de voz' };
  const label = etiquetas[mediaData.media_type] || 'un archivo';
  const body = mediaData.caption || `[${mediaData.media_type}]`;

  // Buscar lead activo del cliente o crear uno nuevo
  let lead = store.getLeadByCustomerPhone(fromPhone);
  let vendedor;
  const activos = store.getVendedoresActivos();

  if (lead && lead.assigned_to_id) {
    const vendedores = store.getVendedores();
    vendedor = vendedores.find(v => v.id === lead.assigned_to_id) || activos[0];
  } else {
    const r = store.saveLead(fromPhone, customerName || 'Cliente', body);
    lead = store.getLeadById(r.leadId);
    if (activos.length === 0) { callback(null, { message: 'no_hay_vendedores' }); return; }
    vendedor = activos[0];
    try { store.assignLeadToVendedor(lead.id, vendedor); } catch (e) { console.error('Error asignando lead media:', e.message); }
  }

  store.saveMessage(lead.id, fromPhone, vendedor ? vendedor.telefono : '', body, 'incoming', mediaData, null, wamid || null);
  updateCustomerMessageTimestamp(lead.id);
  syncMulticanal(lead.id, { direction: 'incoming', body, media: mediaData, fromNumber: fromPhone, toNumber: vendedor ? vendedor.telefono : '' });
  notificarPanel(vendedor ? vendedor.id : null, lead.id, 'mensaje_cliente');

  if (vendedor) {
    sendMessage(vendedor.telefono, `📎 ${customerName || 'Cliente'} te envió ${label}. Ábrelo en tu panel.`)
      .then(() => callback(null, { forwarded: true, to: vendedor.telefono }))
      .catch(() => callback(null, { forwarded: false }));
  } else {
    callback(null, { forwarded: false });
  }
}

function getLeadCount() {
  return require('../db/store').getLeadCount();
}

function getLeads() {
  return require('../db/store').getLeads();
}

module.exports = { assignLead, routeReply, routeIncomingMedia, getLeadCount, getLeads };
