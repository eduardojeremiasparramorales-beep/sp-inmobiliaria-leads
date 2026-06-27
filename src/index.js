const express = require('express');
const { initDB, getLeads, getLeadCount, addVendedor, getVendedores, setVendedorEstado, getLeadsSinRespuesta, incrementEscalation, getDB } = require('./db/store');
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

// API stats
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

// Seed vendedores de prueba
app.post('/api/seed', (req, res) => {
  const demo = [
    ['Carlos Méndez', '+5218112345601'],
    ['María Fernanda López', '+5218112345602'],
    ['Andrés García', '+5218112345603'],
    ['Valentina Ríos', '+5218112345604'],
    ['Javier Ortiz', '+5218112345605'],
  ];
  demo.forEach(([n, t]) => addVendedor(n, t));
  res.json({ ok: true, vendedoresCreados: demo.length });
});

// Test webhook simulator
app.post('/api/test-webhook', (req, res) => {
  const { phone, name, message } = req.body;
  const customerPhone = phone || '+5218112345000';
  const customerName = name || 'Cliente Prueba';
  const messageBody = message || 'Hola, me interesa recibir información sobre los lotes.';

  const fakePayload = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: '1224496694078803' },
          contacts: [{ profile: { name: customerName }, wa_id: customerPhone }],
          messages: [{
            from: customerPhone,
            id: 'test_' + Date.now(),
            type: 'text',
            text: { body: messageBody },
          }],
        },
      }],
    }],
  };

  req.body = fakePayload;
  handleMessage(req, res);
});

// Test vendedor reply simulator
app.post('/api/test-reply', (req, res) => {
  const { vendedorPhone, message } = req.body;
  if (!vendedorPhone) return res.status(400).json({ error: 'vendedorPhone requerido' });

  const fakePayload = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: '1224496694078803' },
          contacts: [{ profile: { name: 'Vendedor' }, wa_id: vendedorPhone }],
          messages: [{
            from: vendedorPhone,
            id: 'test_reply_' + Date.now(),
            type: 'text',
            text: { body: message || '¡Hola! Claro, con gusto te ayudo. ¿Te puedo llamar?' },
          }],
        },
      }],
    }],
  };

  req.body = fakePayload;
  handleMessage(req, res);
});

// Logs
app.get('/api/logs', (req, res) => {
  const d = getDB();
  if (!d) return res.json([]);
  const r = d.exec('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50');
  if (r.length === 0) return res.json([]);
  const cols = r[0].columns;
  res.json(r[0].values.map(row => {
    const o = {};
    cols.forEach((c, i) => { o[c] = row[i]; });
    return o;
  }));
});

// Escalation check
async function checkEscalation() {
  try {
    const treinta = getLeadsSinRespuesta(30);
    for (const lead of treinta) {
      if (lead.escalation_level < 1) {
        incrementEscalation(lead.id);
        console.log(`Escalation 30min lead ${lead.id}`);
        if (lead.assigned_to_phone) {
          await sendMessage(lead.assigned_to_phone,
            `Alerta SP Inmobiliaria\nLlevas 30 min sin responder al lead ${lead.customer_name} (${lead.customer_phone}).`
          ).catch(() => {});
        }
      }
    }
    const sesenta = getLeadsSinRespuesta(60);
    for (const lead of sesenta) {
      if (lead.escalation_level < 2) {
        incrementEscalation(lead.id);
        console.log(`Escalation 60min lead ${lead.id} — reasignar`);
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
