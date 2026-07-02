/**
 * 📞 Integración Twilio VoIP
 * Llamadas directas desde el CRM
 */

const twilio = require('twilio');

/**
 * Inicializar cliente de Twilio
 */
function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('Twilio no configurado');
    return null;
  }

  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Iniciar llamada
 */
async function makeCall(toNumber, fromNumber, recordCall = false) {
  try {
    const client = getTwilioClient();
    if (!client) return { error: 'Twilio no configurado' };

    const call = await client.calls.create({
      to: toNumber,
      from: fromNumber || process.env.TWILIO_PHONE_NUMBER,
      url: `${process.env.APP_URL}/api/twilio/twiml`, // TwiML callback
      record: recordCall,
      statusCallback: `${process.env.APP_URL}/api/twilio/status`,
      statusCallbackMethod: 'POST',
    });

    return {
      success: true,
      callSid: call.sid,
      to: call.to,
      from: call.from,
      status: call.status,
      startTime: call.dateCreated,
    };
  } catch (err) {
    console.error('Error making call:', err.message);
    return { error: err.message };
  }
}

/**
 * Terminar llamada
 */
async function endCall(callSid) {
  try {
    const client = getTwilioClient();
    if (!client) return { error: 'Twilio no configurado' };

    const call = await client.calls(callSid).update({ status: 'completed' });

    return {
      success: true,
      callSid: call.sid,
      status: call.status,
      duration: call.duration,
    };
  } catch (err) {
    console.error('Error ending call:', err.message);
    return { error: err.message };
  }
}

/**
 * Obtener detalles de una llamada
 */
async function getCallDetails(callSid) {
  try {
    const client = getTwilioClient();
    if (!client) return { error: 'Twilio no configurado' };

    const call = await client.calls(callSid).fetch();

    return {
      callSid: call.sid,
      to: call.to,
      from: call.from,
      status: call.status,
      duration: call.duration,
      startTime: call.dateCreated,
      endTime: call.dateUpdated,
      recordingUrl: call.recordingSid ? `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${call.recordingSid}.mp3` : null,
    };
  } catch (err) {
    console.error('Error getting call details:', err.message);
    return { error: err.message };
  }
}

/**
 * Registrar llamada en CRM
 */
function logCallToCRM(leadId, callSid, callData) {
  try {
    const store = require('../../db/store');
    const db = store.getDB();

    db.run(`
      INSERT INTO call_logs (lead_id, call_sid, phone_from, phone_to, duration, recording_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      leadId,
      callSid,
      callData.from,
      callData.to,
      callData.duration || 0,
      callData.recordingUrl || null,
      new Date().toISOString(),
    ]);

    // Agregar a timeline
    const timeline = require('../timeline');
    timeline.addTimelineEvent(leadId, timeline.EVENT_TYPES.CALL_MADE, {
      callSid,
      duration: callData.duration,
      recordingUrl: callData.recordingUrl,
    });

    return { success: true };
  } catch (err) {
    console.error('Error logging call:', err.message);
    return { error: err.message };
  }
}

/**
 * Obtener historial de llamadas de un lead
 */
function getCallHistory(leadId) {
  try {
    const store = require('../../db/store');
    const db = store.getDB();

    const result = db.exec(`
      SELECT call_sid, phone_from, phone_to, duration, recording_url, created_at
      FROM call_logs
      WHERE lead_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `, [leadId]);

    if (!result.length || !result[0].values.length) {
      return { leadId, calls: [] };
    }

    const calls = result[0].values.map(row => ({
      callSid: row[0],
      from: row[1],
      to: row[2],
      duration: row[3],
      recordingUrl: row[4],
      date: row[5],
    }));

    return {
      leadId,
      totalCalls: calls.length,
      calls,
    };
  } catch (err) {
    console.error('Error getting call history:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  makeCall,
  endCall,
  getCallDetails,
  logCallToCRM,
  getCallHistory,
};
