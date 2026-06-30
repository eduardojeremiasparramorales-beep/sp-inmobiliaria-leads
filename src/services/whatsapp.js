const axios = require('axios');

function getApiConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error('Faltan WHATSAPP_TOKEN o PHONE_NUMBER_ID');
  return {
    url: `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
}

async function sendMessage(to, text) {
  const { url, headers } = getApiConfig();
  const res = await axios.post(url, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  }, { headers });
  return res.data;
}

async function sendTemplate(to, templateName, params) {
  const { url, headers } = getApiConfig();
  const components = params ? [{
    type: 'body',
    parameters: params.map(p => ({ type: 'text', text: String(p) })),
  }] : [];
  const res = await axios.post(url, {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: templateName, language: { code: 'es' }, components },
  }, { headers });
  return res.data;
}

async function markAsRead(messageId) {
  const { url, headers } = getApiConfig();
  const res = await axios.post(url, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  }, { headers });
  return res.data;
}

const GRAPH = 'https://graph.facebook.com/v22.0';

// Devuelve la URL temporal y el mime de un media entrante (por su id)
async function getMediaUrl(mediaId) {
  const token = process.env.WHATSAPP_TOKEN;
  const res = await axios.get(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data; // { url, mime_type, sha256, file_size, id }
}

// Descarga el binario de un media entrante. Devuelve { buffer, mime }
async function downloadMedia(mediaId) {
  const token = process.env.WHATSAPP_TOKEN;
  const meta = await getMediaUrl(mediaId);
  const res = await axios.get(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer',
  });
  return { buffer: Buffer.from(res.data), mime: meta.mime_type || 'application/octet-stream' };
}

// Sube un archivo a WhatsApp y devuelve el media id para reenviarlo
async function uploadMedia(buffer, mime, filename) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error('Faltan WHATSAPP_TOKEN o PHONE_NUMBER_ID');

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([buffer], { type: mime }), filename || 'archivo');

  const res = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Error subiendo media: ' + JSON.stringify(data));
  return data.id;
}

// Envía un media (por id) al cliente. type: image|audio|video|document|sticker
async function sendMedia(to, mediaId, type, caption, filename) {
  const { url, headers } = getApiConfig();
  const media = { id: mediaId };
  // audio y sticker no admiten caption
  if (caption && type !== 'audio' && type !== 'sticker') media.caption = caption;
  if (type === 'document' && filename) media.filename = filename;
  const res = await axios.post(url, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type,
    [type]: media,
  }, { headers });
  return res.data;
}

module.exports = { sendMessage, sendTemplate, markAsRead, getMediaUrl, downloadMedia, uploadMedia, sendMedia };
