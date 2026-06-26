const express = require('express');
const { initDB, getLeads, getLeadCount, addVendedor, getVendedores, setVendedorEstado, getLeadsSinRespuesta, incrementEscalation } = require('./db/store');
const { handleVerification } = require('./webhook/verify');
const { handleMessage } = require('./webhook/messages');
const { sendMessage } = require('./services/whatsapp');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.json({ status: 'ok', service: 'SP Inmobiliaria CRM', version: '1.0' }));
app.get('/webhook', handleVerification);
app.post('/webhook', handleMessage);

// Dashboard API
app.get('/api/stats', (req, res) => {
  const vendedores = getVendedores();
  res.json({
    totalVendedores: vendedores.length,
    vendedores,
    leadsRegistrados: getLeadCount(),
    vendedoresActivos: vendedores.filter(v => v.estado === 'activo').length,
  });
});

app.get('/api/leads', (req, res) => res.json(getLeads()));

app.get('/api/vendedores', (req, res) => res.json(getVendedores()));

app.post('/api/vendedores', (req, res) => {
  const { nombre, telefono } = req.body;
  if (!nombre || !telefono) return res.status(400).json({ error: 'nombre y telefono requeridos' });
  addVendedor(nombre, telefono);
  res.json({ ok: true });
});

app.post('/api/vendedores/:id/estado', (req, res) => {
  const { estado } = req.body;
  const estadosValidos = ['activo', 'ocupado', 'inactivo', 'vacaciones', 'suspendido'];
  if (!estadosValidos.includes(estado)) return res.status(400).json({ error: 'estado invalido' });
  setVendedorEstado(req.params.id, estado);
  res.json({ ok: true });
});

// Escalation check
async function checkEscalation() {
  try {
    const treinta = getLeadsSinRespuesta(30);
    for (const lead of treinta) {
      if (lead.escalation_level < 1) {
        incrementEscalation(lead.id);
        console.log(`⚠️ Escalation 30min lead ${lead.id}`);
        if (lead.assigned_to_phone) {
          await sendMessage(lead.assigned_to_phone,
            `⚠️ *Alerta SP Inmobiliaria*\nLlevas 30 min sin responder al lead ${lead.customer_name} (${lead.customer_phone}).\nPor favor responde lo antes posible.`
          );
        }
      }
    }
    const sesenta = getLeadsSinRespuesta(60);
    for (const lead of sesenta) {
      if (lead.escalation_level < 2) {
        incrementEscalation(lead.id);
        console.log(`🚨 Escalation 60min lead ${lead.id} — reasignar`);
      }
    }
  } catch (e) {
    console.error('Error en escalation check:', e.message);
  }
}

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`SP Inmobiliaria CRM corriendo en puerto ${PORT}`);
  });
  setInterval(checkEscalation, 60000);
});
