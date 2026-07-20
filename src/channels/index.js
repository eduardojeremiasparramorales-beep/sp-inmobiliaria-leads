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
  console.log(`[WEBHOOK ${channel}] Recibido POST — Body:`, JSON.stringify(req.body).slice(0, 300));
  const adapter = getAdapter(channel);

  if (!adapter) {
    return res.sendStatus(404);
  }

  if (typeof adapter.verifySignature === 'function') {
    const valid = adapter.verifySignature(req);
    if (!valid) {
      console.warn(`[WEBHOOK ${channel}] Firma inválida — rechazado`);
      return res.sendStatus(401);
    }
  }

  // Responder inmediatamente a Meta/Twilio para evitar reintentos
  res.sendStatus(200);

  try {
    const payload = adapter.parseWebhookPayload(req.body);
    if (!payload) {
      console.warn(`[WEBHOOK ${channel}] Payload nulo — ignorado`);
      return;
    }
    console.log(`[WEBHOOK ${channel}] Payload OK — from: ${payload.from}, type: ${payload.type}, body: ${payload.body}`);

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
        payload.metadata.profile_pic = profile.profile_pic;
      } catch (e) {
        console.warn(`[${payload.channel}] No se pudo obtener perfil:`, e.message);
      }
    }

    // Media entrante de Messenger/Instagram: llega como URL del CDN de Meta, que
    // EXPIRA en horas. Se descarga y guarda en disco de inmediato para no perderla.
    if (payload.media && payload.media.id && /^https?:\/\//.test(String(payload.media.id))) {
      try {
        const axios = require('axios');
        const mediaStore = require('../services/media');
        const resp = await axios.get(payload.media.id, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 25 * 1024 * 1024 });
        const mime = resp.headers['content-type'] || 'application/octet-stream';
        const ext = (mime.split('/')[1] || 'bin').split(';')[0];
        const filename = mediaStore.saveOutgoingMedia(Buffer.from(resp.data), mime, `${payload.channel}-${Date.now()}.${ext}`);
        payload.media = { id: null, mime, filename };
      } catch (e) {
        console.error(`[WEBHOOK ${channel}] No se pudo descargar media entrante:`, e.message);
      }
    }

    const MessageRouter = require('../services/router');
    console.log(`[WEBHOOK ${channel}] Enrutando mensaje de ${payload.from}...`);
    await MessageRouter.routeIncoming(payload.channel, payload.from, payload.body, {
      media: payload.media,
      metadata: payload.metadata,
      type: payload.type,
    });
    console.log(`[WEBHOOK ${channel}] Mensaje enrutado correctamente`);
  } catch (e) {
    console.error(`Error procesando webhook de ${channel}:`, e.message);
  }
}

module.exports = { registerAdapter, getAdapter, bootstrapChannels, webhookReceiver };
