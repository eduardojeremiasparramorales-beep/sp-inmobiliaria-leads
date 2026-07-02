/**
 * 📧 Integración Email Tracking
 * Enviar propuestas por email y trackear opens/clicks
 */

const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST,
  port: process.env.EMAIL_SMTP_PORT,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

/**
 * Generar token único para tracking
 */
function generateTrackingToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Enviar email con tracking
 */
async function sendTrackedEmail(leadId, leadEmail, leadName, subject, htmlContent) {
  try {
    if (!process.env.EMAIL_USER) {
      return { error: 'Email no configurado' };
    }

    const trackingToken = generateTrackingToken();
    const trackingPixel = `<img src="${process.env.APP_URL}/api/tracking/pixel/${trackingToken}" width="1" height="1" style="display:none;">`;

    const finalHtml = `${htmlContent}${trackingPixel}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: leadEmail,
      subject,
      html: finalHtml,
      headers: {
        'X-Lead-ID': leadId,
        'X-Tracking-Token': trackingToken,
      },
    };

    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      trackingToken,
      sentTo: leadEmail,
      sentAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Error sending tracked email:', err.message);
    return { error: err.message };
  }
}

/**
 * Registrar apertura de email
 */
function trackEmailOpen(trackingToken) {
  // Guardar en base de datos
  const store = require('../../db/store');
  const db = store.getDB();

  try {
    db.run(`
      INSERT INTO email_tracking (tracking_token, event_type, tracked_at)
      VALUES (?, ?, ?)
    `, [trackingToken, 'OPENED', new Date().toISOString()]);

    return { success: true, event: 'email_opened' };
  } catch (err) {
    console.error('Error tracking email open:', err.message);
    return { error: err.message };
  }
}

/**
 * Registrar click en link de email
 */
function trackEmailClick(trackingToken, linkUrl) {
  const store = require('../../db/store');
  const db = store.getDB();

  try {
    db.run(`
      INSERT INTO email_tracking (tracking_token, event_type, link_url, tracked_at)
      VALUES (?, ?, ?, ?)
    `, [trackingToken, 'CLICKED', linkUrl, new Date().toISOString()]);

    return { success: true, event: 'email_clicked' };
  } catch (err) {
    console.error('Error tracking email click:', err.message);
    return { error: err.message };
  }
}

/**
 * Obtener estadísticas de un email
 */
function getEmailStats(trackingToken) {
  const store = require('../../db/store');
  const db = store.getDB();

  try {
    const result = db.exec(`
      SELECT event_type, COUNT(*) as count, MAX(tracked_at) as last_event
      FROM email_tracking
      WHERE tracking_token = ?
      GROUP BY event_type
    `, [trackingToken]);

    if (!result.length) {
      return {
        trackingToken,
        opened: false,
        clicks: 0,
        lastActivity: null,
      };
    }

    const stats = {
      trackingToken,
      opened: false,
      clicks: 0,
      lastActivity: null,
    };

    result[0].values.forEach(([eventType, count, lastEvent]) => {
      if (eventType === 'OPENED') stats.opened = true;
      if (eventType === 'CLICKED') stats.clicks = count;
      stats.lastActivity = lastEvent;
    });

    return stats;
  } catch (err) {
    console.error('Error getting email stats:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  sendTrackedEmail,
  trackEmailOpen,
  trackEmailClick,
  getEmailStats,
};
