/**
 * 📱 Integración SMS Recordatorios
 * Enviar SMS de recordatorios y follow-ups
 */

const axios = require('axios');

/**
 * Enviar SMS vía Twilio
 */
async function sendSMS(phoneNumber, message) {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return { error: 'Twilio no configurado' };
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;

    const response = await axios.post(
      twilioUrl,
      {
        From: process.env.TWILIO_PHONE_NUMBER,
        To: phoneNumber,
        Body: message,
      },
      {
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN,
        },
      }
    );

    return {
      success: true,
      messageSid: response.data.sid,
      sentTo: phoneNumber,
      sentAt: new Date().toISOString(),
      status: response.data.status,
    };
  } catch (err) {
    console.error('Error sending SMS:', err.message);
    return { error: err.message };
  }
}

/**
 * Agendar recordatorio SMS
 */
async function scheduleReminder(leadId, phoneNumber, message, delayMinutes) {
  try {
    const store = require('../../db/store');
    const db = store.getDB();

    const scheduledTime = new Date(Date.now() + delayMinutes * 60000);

    db.run(`
      INSERT INTO sms_reminders (lead_id, phone_number, message, scheduled_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [leadId, phoneNumber, message, scheduledTime.toISOString(), new Date().toISOString()]);

    return {
      success: true,
      leadId,
      scheduledFor: scheduledTime.toISOString(),
      delayMinutes,
    };
  } catch (err) {
    console.error('Error scheduling SMS reminder:', err.message);
    return { error: err.message };
  }
}

/**
 * Enviar recordatorio después de X minutos sin respuesta
 */
async function sendFollowUpReminder(leadId, phoneNumber, vendorName) {
  const followUpTemplate = `
Hola! Vuelvo a contactarte respecto al lote que consultaste.
${vendorName} está disponible para resolver tus dudas. ¿Te interesa agendar una cita?
Responde "SI" para continuar.
  `.trim();

  return sendSMS(phoneNumber, followUpTemplate);
}

/**
 * Procesar recordatorios pendientes (cron job)
 */
async function processScheduledReminders() {
  try {
    const store = require('../../db/store');
    const db = store.getDB();

    const now = new Date().toISOString();

    // Obtener recordatorios pendientes
    const result = db.exec(`
      SELECT id, lead_id, phone_number, message, scheduled_at
      FROM sms_reminders
      WHERE scheduled_at <= ? AND sent_at IS NULL
      LIMIT 50
    `, [now]);

    if (!result.length || !result[0].values.length) {
      return { processed: 0 };
    }

    const reminders = result[0].values;
    let processed = 0;

    for (const reminder of reminders) {
      const [id, leadId, phoneNumber, message, scheduledAt] = reminder;

      const sendResult = await sendSMS(phoneNumber, message);

      if (sendResult.success) {
        db.run(`
          UPDATE sms_reminders
          SET sent_at = ?, status = 'sent'
          WHERE id = ?
        `, [new Date().toISOString(), id]);

        processed++;
      }
    }

    return { processed, total: reminders.length };
  } catch (err) {
    console.error('Error processing scheduled reminders:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  sendSMS,
  scheduleReminder,
  sendFollowUpReminder,
  processScheduledReminders,
};
