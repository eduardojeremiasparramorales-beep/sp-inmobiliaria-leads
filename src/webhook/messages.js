const { assignLead } = require('../services/assigner');
const { sendMessage } = require('../services/whatsapp');
const { saveMessage } = require('../db/store');

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
      const metadata = value.metadata || {};

      for (const msg of messages) {
        if (msg.type === 'text') {
          const customerPhone = msg.from;
          const messageBody = msg.text.body;
          const customerName = contacts.find(c => c.wa_id === customerPhone)?.profile?.name || 'Cliente';

          const { leadId, vendedor, isNew } = assignLead(customerPhone, messageBody);

          saveMessage(leadId, customerPhone, vendedor, messageBody, 'incoming');

          const prefix = isNew
            ? `🆕 *Nuevo Lead SP Inmobiliaria*\nCliente: ${customerName}\nTeléfono: ${customerPhone}\n\n`
            : `↩️ *Respuesta de ${customerName}*\n\n`;

          const notif = `${prefix}${messageBody}`;

          sendMessage(vendedor, notif).catch(err =>
            console.error('Error enviando notificación a vendedor:', err.message)
          );

          if (isNew) {
            const bienvenida = `👋 ¡Hola ${customerName}! Gracias por contactar a SP Inmobiliaria. Uno de nuestros asesores te atenderá en breve.`;

            sendMessage(customerPhone, bienvenida).catch(err =>
              console.error('Error enviando bienvenida:', err.message)
            );
          }
        }
      }
    }
  }
}

module.exports = { handleMessage };
