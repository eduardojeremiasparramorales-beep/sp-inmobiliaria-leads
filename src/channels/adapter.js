// Clase base para adaptadores de canal (WhatsApp, Messenger, Instagram)
//
// Formato normalizado de parseWebhookPayload:
// {
//   channel: string,
//   from: string,
//   type: 'text' | 'image' | 'audio' | 'video' | 'document',
//   body: string | null,
//   media: { id, mime, filename } | null,
//   metadata: { name, username, campaign_id, ad_id, ad_name }
// }

class ChannelAdapter {
  constructor(name) {
    this.name = name; // 'whatsapp' | 'messenger' | 'instagram'
  }

  async sendMessage(to, text) {
    throw new Error(`${this.name}: sendMessage not implemented`);
  }

  async sendMedia(to, mediaId, type, caption) {
    throw new Error(`${this.name}: sendMedia not implemented`);
  }

  async sendTemplate(to, name, params) {
    throw new Error(`${this.name}: sendTemplate not implemented`);
  }

  parseWebhookPayload(body) {
    throw new Error(`${this.name}: parseWebhookPayload not implemented`);
  }

  verifySignature(req) {
    return true;
  }
}

module.exports = ChannelAdapter;
