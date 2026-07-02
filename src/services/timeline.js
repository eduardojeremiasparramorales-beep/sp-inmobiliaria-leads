/**
 * ⏰ Sistema de Timeline de Interacciones
 * Registro detallado de todas las acciones por lead para auditoría y análisis
 */

const store = require('../db/store');

/**
 * Agregar evento al timeline
 */
function addTimelineEvent(leadId, eventType, data = {}) {
  try {
    const db = store.getDB();
    const timestamp = new Date().toISOString();

    db.run(`
      INSERT INTO timeline (lead_id, event_type, data, created_at)
      VALUES (?, ?, ?, ?)
    `, [leadId, eventType, JSON.stringify(data), timestamp]);

    return { success: true, timestamp };
  } catch (err) {
    console.error('Error adding timeline event:', err.message);
    return { error: err.message };
  }
}

/**
 * Obtener timeline completo de un lead
 */
function getLeadTimeline(leadId, limit = 100) {
  try {
    const db = store.getDB();
    const result = db.exec(`
      SELECT id, lead_id, event_type, data, created_at
      FROM timeline
      WHERE lead_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [leadId, limit]);

    if (!result.length || !result[0].values.length) return [];

    return result[0].values.map(row => ({
      id: row[0],
      lead_id: row[1],
      event_type: row[2],
      data: JSON.parse(row[3] || '{}'),
      created_at: row[4],
    }));
  } catch (err) {
    console.error('Error getting timeline:', err.message);
    return [];
  }
}

/**
 * Tipos de eventos predefinidos
 */
const EVENT_TYPES = {
  MESSAGE_RECEIVED: 'message:received',
  MESSAGE_SENT: 'message:sent',
  STATUS_CHANGED: 'status:changed',
  ASSIGNED: 'assigned',
  REASSIGNED: 'reassigned',
  ESCALATED: 'escalated',
  TAGGED: 'tagged',
  NOTE_ADDED: 'note:added',
  MEDIA_UPLOADED: 'media:uploaded',
  CALL_MADE: 'call:made',
  MEETING_SCHEDULED: 'meeting:scheduled',
  CLOSED: 'closed',
};

/**
 * Obtener resumen de actividad (últimas 24h, últimas 7d)
 */
function getActivitySummary(leadId) {
  try {
    const db = store.getDB();
    const now = Date.now();
    const last24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    const result = db.exec(`
      SELECT
        COUNT(CASE WHEN created_at >= ? THEN 1 END) as activity_24h,
        COUNT(CASE WHEN created_at >= ? THEN 1 END) as activity_7d,
        COUNT(CASE WHEN event_type LIKE 'message:%' THEN 1 END) as total_messages,
        COUNT(CASE WHEN event_type = 'message:received' THEN 1 END) as received_messages,
        COUNT(CASE WHEN event_type = 'message:sent' THEN 1 END) as sent_messages,
        MAX(created_at) as last_activity
      FROM timeline
      WHERE lead_id = ?
    `, [last24h, last7d, leadId]);

    if (!result.length || !result[0].values.length) {
      return {
        activity_24h: 0,
        activity_7d: 0,
        total_messages: 0,
        received_messages: 0,
        sent_messages: 0,
        last_activity: null,
      };
    }

    const row = result[0].values[0];
    return {
      activity_24h: row[0],
      activity_7d: row[1],
      total_messages: row[2],
      received_messages: row[3],
      sent_messages: row[4],
      last_activity: row[5],
    };
  } catch (err) {
    console.error('Error getting activity summary:', err.message);
    return {};
  }
}

/**
 * Obtener milestones importantes
 */
function getMilestones(leadId) {
  try {
    const db = store.getDB();
    const result = db.exec(`
      SELECT event_type, created_at, data
      FROM timeline
      WHERE lead_id = ? AND event_type IN ('assigned', 'status:changed', 'escalated', 'closed', 'meeting:scheduled')
      ORDER BY created_at ASC
    `, [leadId]);

    if (!result.length || !result[0].values.length) return [];

    return result[0].values.map(row => ({
      type: row[0],
      timestamp: row[1],
      details: JSON.parse(row[2] || '{}'),
    }));
  } catch (err) {
    console.error('Error getting milestones:', err.message);
    return [];
  }
}

module.exports = {
  addTimelineEvent,
  getLeadTimeline,
  getActivitySummary,
  getMilestones,
  EVENT_TYPES,
};
