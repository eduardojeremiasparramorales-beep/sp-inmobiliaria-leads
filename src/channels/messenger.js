const axios = require('axios');
const crypto = require('crypto');
const ChannelAdapter = require('./adapter');
const store = require('../db/store');

const API_VERSION = 'v22.0';
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

class MessengerAdapter extends ChannelAdapter {
  constructor() {
    super('messenger');
  }

  // Prioridad: token guardado desde la UI (Integraciones → tabla config) > .env.
  // Así el admin puede conectar el canal sin tocar el servidor.
  getConfig() {
    const token = store.getConfig('channel_messenger_token') || process.env.FACEBOOK_PAGE_TOKEN;
    const pageId = store.getConfig('channel_messenger_page_id') || process.env.FACEBOOK_PAGE_ID;
    if (!token || !pageId) throw new Error('Faltan FACEBOOK_PAGE_TOKEN o FACEBOOK_PAGE_ID');
    return { token, pageId };
  }

  async sendMessage(to, text) {
    const { token, pageId } = this.getConfig();
    const res = await axios.post(`${GRAPH}/${pageId}/messages`, {
      recipient: { id: to },
      messaging_type: 'RESPONSE',
      message: { text },
    }, { params: { access_token: token } });
    return res.data;
  }

  async sendMedia(to, mediaId, type, caption) {
    const { token, pageId } = this.getConfig();
    const res = await axios.post(`${GRAPH}/${pageId}/messages`, {
      recipient: { id: to },
      messaging_type: 'RESPONSE',
      message: { attachment: { type, payload: { url: mediaId } } },
    }, { params: { access_token: token } });
    return res.data;
  }

  async getUserName(userId) {
    const { token } = this.getConfig();
    try {
      const res = await axios.get(`${GRAPH}/${userId}`, {
        params: { fields: 'name,profile_pic', access_token: token },
      });
      return { name: res.data.name || 'Cliente', profile_pic: res.data.profile_pic || null };
    } catch (e) {
      return { name: 'Cliente', profile_pic: null };
    }
  }

  parseWebhookPayload(body) {
    if (!body || body.object !== 'page') return null;

    const entry = (body.entry || [])[0];
    if (!entry) return null;
    const messaging = (entry.messaging || [])[0];
    if (!messaging || !messaging.sender) return null;

    const from = messaging.sender.id;
    const message = messaging.message || {};
    let type = 'text';
    let text = message.text || null;
    let media = null;

    if (Array.isArray(message.attachments) && message.attachments.length > 0) {
      const att = message.attachments[0];
      type = att.type || 'document';
      media = { id: att.payload && att.payload.url, mime: null, filename: null };
    }

    return {
      channel: 'messenger',
      from,
      type,
      body: text,
      media,
      metadata: {
        name: null, // se obtiene aparte con getUserName(from)
        username: null,
        campaign_id: null,
        ad_id: (messaging.referral && messaging.referral.ad_id) || null,
        ad_name: null,
      },
    };
  }

  verifySignature(req) {
    const secret = process.env.APP_SECRET || process.env.META_APP_SECRET;
    if (!secret) return process.env.NODE_ENV !== 'production';
    const sig = req.headers['x-hub-signature-256'];
    if (!sig || !req.rawBody) return false;
    const esperado = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado));
    } catch (e) {
      return false;
    }
  }
}

// Verificación GET /webhook/messenger (hub.mode, hub.verify_token, hub.challenge)
function handleMessengerVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.MESSENGER_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

module.exports = MessengerAdapter;
module.exports.handleMessengerVerification = handleMessengerVerification;
