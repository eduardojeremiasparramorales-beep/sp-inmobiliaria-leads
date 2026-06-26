const axios = require('axios');

function getApiConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error('Faltan WHATSAPP_TOKEN o PHONE_NUMBER_ID en las variables de entorno');
  }

  return {
    url: `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}

async function sendMessage(to, text) {
  const { url, headers } = getApiConfig();

  const response = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    },
    { headers }
  );

  return response.data;
}

module.exports = { sendMessage };
