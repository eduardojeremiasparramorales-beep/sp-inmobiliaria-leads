const { getVendedoresActivos, assignLeadToVendedor, saveMessage, getLeadById, updateLeadStatus, setFirstResponse } = require('../db/store');

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

function routeReply(fromPhone, messageBody, callback) {
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

      const { sendMessage } = require('./whatsapp');
      sendMessage(activeLead.customer_phone, messageBody)
        .then(() => callback(null, { forwarded: true, to: activeLead.customer_phone }))
        .catch(callback);
      return;
    }
  }

  const lead = getLeadByCustomerPhone(fromPhone);
  if (lead) {
    const activos = getVendedoresActivos();
    if (activos.length === 0) {
      callback(null, { message: 'cliente_espera' });
      return;
    }
    const v = lead.assigned_to_id
      ? vendedores.find(vd => vd.id === lead.assigned_to_id) || activos[0]
      : activos[0];

    saveMessage(lead.id, fromPhone, v.telefono, messageBody, 'incoming');

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
  const r = saveL(fromPhone, 'Cliente', messageBody);
  const a = getVendedoresActivos();
  if (a.length > 0) {
    assignLeadToVendedor(r.leadId, a[0]);
    saveMessage(r.leadId, fromPhone, a[0].telefono, messageBody, 'incoming');
    const { sendMessage } = require('./whatsapp');
    sendMessage(a[0].telefono, `🆕 Nuevo lead\nTel: ${fromPhone}\n\n${messageBody}`)
      .then(() => callback(null, { forwarded: true, to: a[0].telefono }))
      .catch(callback);
  } else {
    callback(null, { message: 'no_hay_vendedores' });
  }
}

function getLeadCount() {
  return require('../db/store').getLeadCount();
}

function getLeads() {
  return require('../db/store').getLeads();
}

module.exports = { assignLead, routeReply, getLeadCount, getLeads };
