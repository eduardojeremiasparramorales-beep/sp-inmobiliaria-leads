const express = require('express');
const { initDB } = require('./db/store');
const { handleVerification } = require('./webhook/verify');
const { handleMessage } = require('./webhook/messages');
const { getLeadCount, getLeads, resetAssigner } = require('./services/assigner');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', service: 'SP Inmobiliaria Leads' }));

// GET /webhook — Meta verification
app.get('/webhook', handleVerification);

// POST /webhook — Incoming WhatsApp messages
app.post('/webhook', handleMessage);

// Dashboard API
app.get('/api/stats', (req, res) => {
  const vendedores = (process.env.VENDEDORES || '').split(',').filter(Boolean);
  res.json({
    totalVendedores: vendedores.length,
    vendedores,
    leadsRegistrados: getLeadCount(),
  });
});

app.get('/api/leads', (req, res) => {
  res.json(getLeads());
});

app.post('/api/reset', (req, res) => {
  resetAssigner();
  res.json({ ok: true });
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`SP Inmobiliaria Leads corriendo en puerto ${PORT}`);
  });
});
