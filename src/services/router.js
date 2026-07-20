// MessageRouter — Reemplaza a assigner.js. Router genérico multicanal (WhatsApp, Messenger, Instagram).

const store = require('../db/store');
const { getAdapter } = require('../channels');
const events = require('./events');

// Emite por SSE (events.js). El tipo 'room' era de Socket.IO (eliminado): ningún
// frontend escuchaba rooms y los admins ya reciben el mismo evento por su canal.
function emit(channelType, target, evento, data) {
  try {
    if (channelType === 'vendedor') events.emitToVendedor(target, evento, data);
    else if (channelType === 'admins') events.emitToAdmins(evento, data);
  } catch (e) { /* noop */ }
}

function evaluateWorkflow(triggerEvent, ctx) {
  try {
    const WorkflowEngine = require('./workflow');
    if (WorkflowEngine && typeof WorkflowEngine.evaluate === 'function') {
      WorkflowEngine.evaluate(triggerEvent, ctx).catch(e => console.error('WorkflowEngine.evaluate error:', e.message));
    }
  } catch (e) { /* workflow engine no disponible todavía */ }
}

class MessageRouter {
  static async routeIncoming(channel, fromUserId, messageBody, options = {}) {
    const meta = options.metadata || {};

    // 1. Buscar customer por canal
    let customer = store.findCustomerByChannel(channel, fromUserId);

    // 2. Si no existe, crear customer nuevo y vincular canal
    // Foto de perfil: Meta solo la expone para Messenger/Instagram (WhatsApp Cloud
    // API no da acceso a la foto del cliente), por eso solo llega en meta.profile_pic.
    if (!customer) {
      customer = store.createCustomer(meta.name || 'Cliente', channel === 'whatsapp' ? fromUserId : '', meta.profile_pic || '');
      store.linkChannelToCustomer(customer.id, channel, fromUserId, meta.username || '');
    } else if (meta.profile_pic) {
      store.setCustomerAvatarIfEmpty(customer.id, meta.profile_pic);
    }

    // 3. Buscar conversación activa
    let conversation = store.getConversationByChannelUser(channel, fromUserId);

    // 4. Si no existe, crear conversación
    if (!conversation) {
      conversation = store.createConversation(channel, fromUserId, customer.id);
    }

    // 5. Asignar vendedor si no tiene
    if (!conversation.assigned_to_id) {
      const activos = store.getVendedoresActivos();
      if (activos.length > 0) {
        const siguiente = activos[0];
        require('../db/adapter').run(
          'UPDATE conversations SET assigned_to_id = ?, status = ? WHERE id = ?',
          [siguiente.id, 'asignado', conversation.id]
        );
        conversation = store.getConversationById(conversation.id);
      }
    }

    // 6. Guardar en timeline
    const media = options.media || null;
    const message = store.addTimelineEvent(conversation.id, 'message', {
      channel,
      body: messageBody || '',
      direction: 'incoming',
      from_number: fromUserId,
      to_number: '',
      media_type: media ? (options.type || media.type || null) : null,
      media_id: media ? media.id : null,
      media_mime: media ? media.mime : null,
      media_filename: media ? media.filename : null,
      metadata: meta,
    });

    // Actualizar last_message / unread_count de la conversación
    require('../db/adapter').run(
      'UPDATE conversations SET last_message = ?, last_message_at = datetime(\'now\'), unread_count = COALESCE(unread_count,0) + 1, updated_at = datetime(\'now\') WHERE id = ?',
      [messageBody || '[media]', conversation.id]
    );
    conversation = store.getConversationById(conversation.id);

    // 7-8. Emitir Socket.IO / SSE al vendedor asignado
    const payload = {
      conversationId: conversation.id,
      channel,
      body: messageBody,
      customerName: customer.name,
      ts: Date.now(),
    };
    if (conversation.assigned_to_id) {
      emit('vendedor', conversation.assigned_to_id, 'message:new', payload);
      // Notificación persistente + push (los mensajes de WhatsApp ya notifican
      // por el camino legacy assigner.notificarPanel — no duplicar)
      if (channel !== 'whatsapp') {
        try {
          const canal = channel === 'messenger' ? 'Messenger' : channel === 'instagram' ? 'Instagram' : channel;
          require('./notify').notify({
            vendedorId: conversation.assigned_to_id, tipo: 'mensaje_cliente', leadId: conversation.lead_id || null, push: true,
            titulo: `💬 ${customer.name || 'Cliente'} (${canal})`,
            cuerpo: String(messageBody || '[archivo]').slice(0, 120),
          }).catch(() => {});
        } catch (e) { /* notify opcional */ }
      }
    }
    emit('admins', null, 'message:new', payload);

    // 9. Workflow
    evaluateWorkflow('message:incoming', { conversation, message, customer });

    // 10. Retornar
    return { conversation, message };
  }

  static async routeOutgoing(conversationId, vendedorId, text) {
    // 1. Buscar conversation
    const conversation = store.getConversationById(conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} no existe`);

    const customer = store.getCustomerById(conversation.customer_id);
    const channels = store.getCustomerChannels(conversation.customer_id)
      .filter(c => c.channel === conversation.channel);
    const channelUserId = channels.length > 0 ? channels[0].channel_user_id : (customer ? customer.phone : null);
    if (!channelUserId) throw new Error('No se encontró channel_user_id para la conversación');

    // 2. Obtener adapter del canal
    const adapter = getAdapter(conversation.channel);
    if (!adapter) throw new Error(`Adapter no registrado para canal ${conversation.channel}`);

    // 3. Enviar mensaje (smart: detecta ventana 24h y envía template si está cerrada)
    let templateSent = false;
    if (conversation.channel === 'whatsapp') {
      const { sendMessageSmart } = require('./whatsapp');
      const leadId = conversation.lead_id || null;
      const smartResult = await sendMessageSmart(channelUserId, text, leadId);
      templateSent = smartResult.templateSent || false;
    } else {
      await adapter.sendMessage(channelUserId, text);
    }

    // 4. Guardar en timeline
    const message = store.addTimelineEvent(conversation.id, 'message', {
      channel: conversation.channel,
      body: text,
      direction: 'outgoing',
      from_number: '',
      to_number: channelUserId,
    });

    require('../db/adapter').run(
      'UPDATE conversations SET last_message = ?, last_message_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?',
      [text, conversation.id]
    );

    // 5. Actualizar status
    if (conversation.status === 'nuevo' || conversation.status === 'asignado') {
      store.updateConversationStatus(conversation.id, 'contactado');
    }

    // 6. Emitir SSE
    const payload = { conversationId: conversation.id, channel: conversation.channel, body: text, ts: Date.now() };
    emit('admins', null, 'message:new', payload);

    // 6b. Notificar push al admin cuando el vendedor responde
    try {
      require('./notify').notify({
        vendedorId: 0, tipo: 'respuesta_vendedor', leadId: conversation.lead_id || null, push: true,
        titulo: '📤 ' + (customer ? customer.name : 'Vendedor') + ' respondió',
        cuerpo: String(text || '').slice(0, 120),
      }).catch(() => {});
    } catch (e) { /* notify opcional */ }

    // 7. Workflow
    evaluateWorkflow('message:outgoing', { conversation, message });

    return message;
  }

  static async assignVendedor(conversationId) {
    const conversation = store.getConversationById(conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} no existe`);

    const activos = store.getVendedoresActivos();
    if (activos.length === 0) return conversation;

    const siguiente = activos[0];
    require('../db/adapter').run(
      'UPDATE conversations SET assigned_to_id = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [siguiente.id, 'asignado', conversation.id]
    );

    const updated = store.getConversationById(conversationId);
    emit('vendedor', siguiente.id, 'conversation:assigned', { conversationId, ts: Date.now() });
    emit('admins', null, 'conversation:assigned', { conversationId, vendedorId: siguiente.id, ts: Date.now() });
    try {
      require('./notify').notify({
        vendedorId: siguiente.id, tipo: 'lead_asignado', leadId: updated.lead_id || null, push: true,
        titulo: '🆕 Conversación asignada a ti', cuerpo: 'Tienes una nueva conversación. Revísala en tu panel.',
      }).catch(() => {});
    } catch (e) { /* notify opcional */ }
    evaluateWorkflow('conversation:assigned', { conversation: updated });

    return updated;
  }

  static async closeConversation(conversationId) {
    store.updateConversationStatus(conversationId, 'cerrado');
    const conversation = store.getConversationById(conversationId);

    emit('admins', null, 'conversation:closed', { conversationId, ts: Date.now() });
    if (conversation && conversation.assigned_to_id) {
      emit('vendedor', conversation.assigned_to_id, 'conversation:closed', { conversationId, ts: Date.now() });
    }

    evaluateWorkflow('conversation:closed', { conversation });

    return conversation;
  }
}

module.exports = MessageRouter;
