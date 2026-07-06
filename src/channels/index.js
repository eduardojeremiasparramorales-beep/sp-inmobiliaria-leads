// Registro de channel adapters + webhookReceiver unificado

const adapters = {};

function registerAdapter(name, adapterInstance) {
  adapters[name] = adapterInstance;
}

function getAdapter(name) {
  return adapters[name];
}

function bootstrapChannels() {
  const WhatsAppAdapter = require('./whatsapp');
  const MessengerAdapter = require('./messenger');
  const InstagramAdapter = require('./instagram');

  registerAdapter('whatsapp', new WhatsAppAdapter());
  registerAdapter('messenger', new MessengerAdapter());
  registerAdapter('instagram', new InstagramAdapter());
}

async function webhookReceiver(req, res) {
  const channel = req.params.channel || 'whatsapp';
  const adapter = getAdapter(channel);

  if (!adapter) {
    return res.sendStatus(404);
  }

  if (typeof adapter.verifySignature === 'function') {
    const valid = adapter.verifySignature(req);
    if (!valid) {
      console.warn(`Webhook ${channel}: firma inválida — rechazado`);
      return res.sendStatus(401);
    }
  }

  // Responder inmediatamente a Meta/Twilio para evitar reintentos
  res.sendStatus(200);

  try {
    const payload = adapter.parseWebhookPayload(req.body);
    if (!payload) return;

    // Obtener nombre real del cliente desde Facebook/Instagram
    if (payload.channel === 'messenger' && typeof adapter.getUserName === 'function') {
      try {
        const profile = await adapter.getUserName(payload.from);
        payload.metadata.name = profile.name;
        payload.metadata.profile_pic = profile.profile_pic;
      } catch (e) {
        console.warn(`[${payload.channel}] No se pudo obtener perfil:`, e.message);
      }
    } else if (payload.channel === 'instagram' && typeof adapter.getUserProfile === 'function') {
      try {
        const profile = await adapter.getUserProfile(payload.from);
        payload.metadata.name = profile.name;
        payload.metadata.username = profile.username;
      } catch (e) {
        console.warn(`[${payload.channel}] No se pudo obtener perfil:`, e.message);
      }
    }

    const MessageRouter = require('../services/router');
    await MessageRouter.routeIncoming(payload.channel, payload.from, payload.body, {
      media: payload.media,
      metadata: payload.metadata,
      type: payload.type,
    });
  } catch (e) {
    console.error(`Error procesando webhook de ${channel}:`, e.message);
  }
}

module.exports = { registerAdapter, getAdapter, bootstrapChannels, webhookReceiver };
