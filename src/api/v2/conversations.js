const express = require('express');
const router = express.Router();
const auth = require('../../services/auth');
const store = require('../../db/store');

router.use(auth.requireAuth);

// GET / → lista filtrable
router.get('/', (req, res) => {
  const { channel, status, etiqueta, vendedorId, busqueda, limite, offset } = req.query;
  const lim = Number(limite) || 50;
  const off = Number(offset) || 0;

  const data = store.getConversations({ channel, status, etiqueta, busqueda, vendedorId, limite: lim, offset: off });
  const total = store.getConversationCount();

  res.json({
    data,
    meta: { total, page: Math.floor(off / lim) + 1, limit: lim },
    error: null,
  });
});

// GET /:id → detalle + customer + últimos 20 timeline events
router.get('/:id', (req, res) => {
  const conversation = store.getConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ data: null, error: 'conversation_no_existe' });

  const customer = store.getCustomerById(conversation.customer_id);
  const timeline = store.getTimelineByConversation(conversation.id).slice(-20);

  res.json({ data: { conversation, customer, timeline }, error: null });
});

// PUT /:id → update status, etiqueta, priority
router.put('/:id', (req, res) => {
  const conversation = store.getConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ data: null, error: 'conversation_no_existe' });

  const { status, etiqueta, priority } = req.body || {};
  if (status !== undefined) store.updateConversationStatus(conversation.id, status);
  if (etiqueta !== undefined) store.updateConversationTag(conversation.id, etiqueta);
  if (priority !== undefined) store.updateConversationPriority(conversation.id, priority);

  res.json({ data: store.getConversationById(conversation.id), error: null });
});

// POST /:id/assign { vendedorId }
router.post('/:id/assign', async (req, res) => {
  const conversation = store.getConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ data: null, error: 'conversation_no_existe' });

  const { vendedorId } = req.body || {};
  if (!vendedorId) return res.status(400).json({ data: null, error: 'vendedorId_requerido' });

  const vendedor = store.getVendedores().find(v => Number(v.id) === Number(vendedorId));
  if (!vendedor) return res.status(400).json({ data: null, error: 'vendedor_no_existe' });

  require('../../db/adapter').run(
    'UPDATE conversations SET assigned_to_id = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?',
    [vendedor.id, 'asignado', conversation.id]
  );

  res.json({ data: store.getConversationById(conversation.id), error: null });
});

// POST /:id/close
router.post('/:id/close', async (req, res) => {
  const conversation = store.getConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ data: null, error: 'conversation_no_existe' });

  const MessageRouter = require('../../services/router');
  const updated = await MessageRouter.closeConversation(conversation.id);

  res.json({ data: updated, error: null });
});

// DELETE /:id → cerrar (no borrar físicamente)
router.delete('/:id', async (req, res) => {
  const conversation = store.getConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ data: null, error: 'conversation_no_existe' });

  const MessageRouter = require('../../services/router');
  const updated = await MessageRouter.closeConversation(conversation.id);

  res.json({ data: updated, error: null });
});

module.exports = router;
