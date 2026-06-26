const { saveLead, saveMessage } = require('../db/store');

let currentIndex = 0;

function getVendedores() {
  return (process.env.VENDEDORES || '').split(',').map(v => v.trim()).filter(Boolean);
}

function nextVendedor() {
  const vendedores = getVendedores();
  if (vendedores.length === 0) return null;
  const v = vendedores[currentIndex % vendedores.length];
  currentIndex++;
  return v;
}

function assignLead(customerPhone, messageBody) {
  const vendedor = nextVendedor();
  const result = saveLead(customerPhone, vendedor, messageBody);

  if (result.isNew) {
    saveMessage(result.leadId, customerPhone, vendedor, messageBody, 'incoming');
  }

  return {
    leadId: result.leadId,
    vendedor,
    isNew: result.isNew,
  };
}

function getLeadCount() {
  const { getLeadCount } = require('../db/store');
  return getLeadCount();
}

function getLeads() {
  const { getLeads } = require('../db/store');
  return getLeads();
}

function resetAssigner() {
  currentIndex = 0;
}

module.exports = { assignLead, getLeadCount, getLeads, resetAssigner };
