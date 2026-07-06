const { routeReply, routeIncomingMedia } = require('../services/assigner');
const { sendMessage, downloadMedia } = require('../services/whatsapp');
const { saveMessageMedia } = require('../services/media');
const store = require('../db/store');
const events = require('../services/events');

const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'];

function handleMessage(req, res) {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (!body || body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      if (!entry || !Array.isArray(entry.changes)) continue;

      for (const change of entry.changes || []) {
        if (!change || change.field !== 'messages') continue;

        const value = change.value;
        if (!value) continue;

        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (const msg of messages) {
          if (!msg) continue;
          const fromPhone = msg.from;
          if (!fromPhone) continue;

          const contact = contacts.find(c => c && c.wa_id === fromPhone);
          const customerName = (contact?.profile?.name) || 'Cliente';

          // --- Mensajes de TEXTO ---
          if (msg.type === 'text') {
            const messageBody = msg.text && msg.text.body;
            if (!messageBody) continue;

            routeReply(fromPhone, messageBody, customerName, msg.id || null, (err, result) => {
              if (err) { console.error('Error routing message:', err.message); return; }
              if (result.forwarded) console.log(`Mensaje reenviado a ${result.to}`);
              if (result.message === 'no_hay_vendedores') {
                sendMessage(fromPhone,
                  '👋 Gracias por contactar a SP Inmobiliaria. ' +
                  'Todos nuestros asesores están ocupados en este momento. ' +
                  'Te responderemos lo antes posible. ¡Gracias por tu paciencia!'
                ).catch(e => console.error('Error enviando mensaje de espera:', e.message));
              }
            });
            continue;
          }

          // --- Mensajes MULTIMEDIA ---
          if (MEDIA_TYPES.includes(msg.type)) {
            handleMediaMessage(msg, fromPhone, customerName)
              .catch(e => console.error('Error procesando media entrante:', e.message));
            continue;
          }

          // --- REACCIÓN del cliente a un mensaje ---
          if (msg.type === 'reaction' && msg.reaction && msg.reaction.message_id) {
            const target = store.getMessageByWamid(msg.reaction.message_id);
            if (target) {
              const emoji = msg.reaction.emoji || '';
              if (emoji) store.addReaction(target.id, emoji, fromPhone, 'incoming');
              else {
                // Sin emoji = el cliente quitó su reacción
                for (const r of store.getReactionsForMessage(target.id)) {
                  if (r.sender_number === fromPhone) store.removeReaction(target.id, r.emoji, fromPhone);
                }
              }
              const lead = store.getLeadById(target.lead_id);
              if (lead) {
                events.emitToVendedor(lead.assigned_to_id, 'reaccion', { leadId: lead.id, messageId: target.id, emoji, ts: Date.now() });
                events.emitToAdmins('reaccion', { leadId: lead.id, messageId: target.id, emoji, ts: Date.now() });
              }
              console.log(`[Webhook] Reacción de ${fromPhone}: ${emoji || '(quitada)'} → msg ${target.id}`);
            }
            continue;
          }

          // --- El cliente ELIMINÓ un mensaje para todos (anti-delete: se conserva el texto) ---
          if (msg.type === 'revoke' && msg.revoke && msg.revoke.original_message_id) {
            const revoked = store.markDeletedByClientWamid(msg.revoke.original_message_id);
            if (revoked) {
              const lead = store.getLeadById(revoked.lead_id);
              if (lead) {
                events.emitToVendedor(lead.assigned_to_id, 'mensaje_eliminado', { leadId: lead.id, messageId: revoked.id, byClient: true, ts: Date.now() });
                events.emitToAdmins('mensaje_eliminado', { leadId: lead.id, messageId: revoked.id, byClient: true, ts: Date.now() });
              }
              console.log(`[Webhook] Cliente ${fromPhone} eliminó mensaje ${revoked.id} (texto conservado)`);
            }
            continue;
          }
        }

        const statuses = value.statuses || [];
        for (const st of statuses) {
          if (!st || !st.id || !st.status) continue;
          console.log(`[Webhook] Status update: ${st.id} → ${st.status}`);
          store.updateMessageStatus(st.id, st.status);
          // Notificar al panel para actualizar el checkmark en vivo
          const m = store.getMessageByWamid(st.id);
          if (m) {
            const lead = store.getLeadById(m.lead_id);
            if (lead) {
              events.emitToVendedor(lead.assigned_to_id, 'status_update', { leadId: lead.id, messageId: m.id, status: st.status, ts: Date.now() });
              events.emitToAdmins('status_update', { leadId: lead.id, messageId: m.id, status: st.status, ts: Date.now() });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error en handleMessage:', error.message);
  }
}

async function handleMediaMessage(msg, fromPhone, customerName) {
  const type = msg.type;            // image|audio|video|document|sticker
  const mediaObj = msg[type] || {};
  const mediaId = mediaObj.id;
  if (!mediaId) return;

  // Descargar el binario desde WhatsApp y guardarlo en disco
  const { buffer, mime } = await downloadMedia(mediaId);
  const filename = saveMessageMedia(mediaId, buffer, mime, mediaObj.filename);

  const mediaData = {
    media_type: type,
    media_id: mediaId,
    media_mime: mime,
    media_filename: filename,
    caption: mediaObj.caption || '',
  };

  routeIncomingMedia(fromPhone, customerName, mediaData, msg.id || null, (err, result) => {
    if (err) { console.error('Error routing media:', err.message); return; }
    if (result && result.forwarded) console.log(`Media (${type}) avisado a ${result.to}`);
  });
}

module.exports = { handleMessage };
