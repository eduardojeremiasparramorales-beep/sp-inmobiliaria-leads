const { assignLead, routeReply } = require('../services/assigner');
const { sendMessage } = require('../services/whatsapp');

function handleMessage(req, res) {
  res.sendStatus(200);

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;

      const value = change.value;
      const messages = value.messages || [];
      const contacts = value.contacts || [];

      for (const msg of messages) {
        if (msg.type !== 'text') continue;

        const fromPhone = msg.from;
        const messageBody = msg.text.body;
        const contact = contacts.find(c => c.wa_id === fromPhone);
        const customerName = contact?.profile?.name || 'Cliente';

        routeReply(fromPhone, messageBody, (err, result) => {
          if (err) {
            console.error('Error routing message:', err.message);
            return;
          }

          if (result.forwarded) {
            console.log(`Mensaje reenviado a ${result.to}`);
          }

          if (result.message === 'no_hay_vendedores') {
            sendMessage(fromPhone,
              '👋 Gracias por contactar a SP Inmobiliaria. ' +
              'Todos nuestros asesores están ocupados en este momento. ' +
              'Te responderemos lo antes posible. ¡Gracias por tu paciencia!'
            ).catch(e => console.error('Error:', e.message));
          }
        });
      }
    }
  }
}

module.exports = { handleMessage };
