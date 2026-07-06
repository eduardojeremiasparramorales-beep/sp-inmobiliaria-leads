const axios = require('axios');

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';
const WINDOW_CLOSED_CODE = 131047;

function getApiConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error('Faltan WHATSAPP_TOKEN o PHONE_NUMBER_ID');
  return {
    url: `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
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

// Envío inteligente: si la ventana de 24h está cerrada, envía template automáticamente
async function sendMessageSmart(to, text, leadId) {
  try {
    const result = await sendMessage(to, text);
    return { data: result, templateSent: false, reopenedWindow: false };
  } catch (err) {
    const errData = err.response && err.response.data && err.response.data.error;
    const errCode = errData && (errData.code || errData.error_subcode);
    const isWindowClosed = errCode === WINDOW_CLOSED_CODE ||
      (errData && errData.message && errData.message.includes('free-form'));

    if (!isWindowClosed) throw err;

    // Ventana cerrada: buscar template de reactivación configurado
    let store;
    try { store = require('../db/store'); } catch (e) { throw err; }
    const templateName = store.getConfig('reengagement_template');
    if (!templateName) {
      const e2 = new Error('Ventana de 24h cerrada. Configura un template de reactivación en Configuración.');
      e2.windowClosed = true;
      throw e2;
    }

    console.log(`[WhatsApp] Ventana cerrada para ${to} — enviando template "${templateName}" para reabrir`);
    await sendTemplate(to, templateName);

    // Esperar 3 segundos para que Meta procese el template
    await new Promise(r => setTimeout(r, 3000));

    const result = await sendMessage(to, text);
    return { data: result, templateSent: true, reopenedWindow: true };
  }
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

// Marca leído Y muestra "escribiendo…" en el WhatsApp del cliente (dura 25s o hasta responder)
async function sendTyping(messageId) {
  const { url, headers } = getApiConfig();
  const res = await axios.post(url, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
    typing_indicator: { type: 'text' },
  }, { headers });
  return res.data;
}

// Envía (emoji) o quita (emoji='') una reacción sobre un mensaje del cliente
async function sendReaction(to, wamid, emoji) {
  const { url, headers } = getApiConfig();
  const res = await axios.post(url, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'reaction',
    reaction: { message_id: wamid, emoji: emoji || '' },
  }, { headers });
  return res.data;
}

const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

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

  const FormData = require('form-data');
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', buffer, { filename: filename || 'archivo', contentType: mime });

  const res = await axios.post(`${GRAPH}/${phoneNumberId}/media`, form, {
    headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return res.data.id;
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

// WhatsApp Business API no expone edición ni revocación directa.
// editMessage: marca como editado en nuestro DB y opcionalmente envía un nuevo mensaje con la corrección.
async function editMessage(to, wamid, newText) {
  try {
    // Envía un nuevo mensaje indicando que es una corrección
    const msg = `✏️ *Editado:* ${newText}`;
    return await sendMessage(to, msg);
  } catch (e) {
    throw e;
  }
}

// revokeMessage: no podemos borrar de WhatsApp real, pero eliminamos del DB.
async function revokeMessage(to, wamid) {
  try {
    // Opcional: enviar un mensaje indicando eliminación
    // await sendMessage(to, '🚫 Este mensaje fue eliminado');
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { sendMessage, sendMessageSmart, sendTemplate, markAsRead, sendTyping, sendReaction, getMediaUrl, downloadMedia, uploadMedia, sendMedia, editMessage, revokeMessage };
