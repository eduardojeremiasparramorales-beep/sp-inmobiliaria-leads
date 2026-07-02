/**
 * 📊 Integración Mixpanel Analytics
 * Tracking de comportamiento de usuarios, funnels
 */

const Mixpanel = require('mixpanel');

/**
 * Inicializar cliente de Mixpanel
 */
function getMixpanelClient() {
  if (!process.env.MIXPANEL_TOKEN) {
    console.warn('Mixpanel no configurado');
    return null;
  }

  return Mixpanel.init(process.env.MIXPANEL_TOKEN);
}

/**
 * Rastrear evento de usuario
 */
function trackEvent(userId, eventName, properties = {}) {
  try {
    const mp = getMixpanelClient();
    if (!mp) return { error: 'Mixpanel no configurado' };

    mp.track(eventName, {
      distinct_id: userId,
      ...properties,
      timestamp: new Date().toISOString(),
    });

    return { success: true, event: eventName };
  } catch (err) {
    console.error('Error tracking event:', err.message);
    return { error: err.message };
  }
}

/**
 * Eventos comunes del CRM
 */
const EVENTS = {
  LEAD_CREATED: 'Lead Created',
  LEAD_ASSIGNED: 'Lead Assigned',
  MESSAGE_SENT: 'Message Sent',
  MESSAGE_RECEIVED: 'Message Received',
  LEAD_CLOSED: 'Lead Closed',
  CALL_MADE: 'Call Made',
  MEETING_SCHEDULED: 'Meeting Scheduled',
  RESPONSE_SENT: 'Response Sent',
  LEAD_ESCALATED: 'Lead Escalated',
};

/**
 * Rastrear acciones específicas del CRM
 */
function trackLeadAction(vendorId, leadId, actionType, metadata = {}) {
  return trackEvent(vendorId, actionType, {
    leadId,
    ...metadata,
  });
}

/**
 * Rastrear interacción de vendedor
 */
function trackVendorAction(vendorId, action, details = {}) {
  return trackEvent(vendorId, action, {
    role: 'vendor',
    ...details,
  });
}

/**
 * Obtener funnel de conversión
 */
async function getFunnelAnalytics(startDate, endDate) {
  try {
    const mp = getMixpanelClient();
    if (!mp) return { error: 'Mixpanel no configurado' };

    // Usar Mixpanel data export API (requiere config adicional)
    return {
      success: true,
      funnel: 'leads_created → messages_sent → meeting_scheduled → lead_closed',
      note: 'Usar Mixpanel dashboard para visualización completa',
      startDate,
      endDate,
    };
  } catch (err) {
    console.error('Error getting funnel analytics:', err.message);
    return { error: err.message };
  }
}

/**
 * Obtener métricas por vendedor
 */
async function getVendorMetrics(vendorId, days = 30) {
  try {
    const store = require('../../db/store');
    const db = store.getDB();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Calcular métricas locales
    const result = db.exec(`
      SELECT
        COUNT(DISTINCT l.id) as total_leads,
        COUNT(DISTINCT CASE WHEN l.status = 'closed' THEN l.id END) as closed_leads,
        SUM(CASE WHEN l.last_message >= ? THEN 1 ELSE 0 END) as active_leads,
        AVG(l.lead_score) as avg_score
      FROM leads l
      WHERE l.assigned_to = ? AND l.created_at >= ?
    `, [new Date().toISOString(), vendorId, startDate.toISOString()]);

    if (!result.length || !result[0].values.length) {
      return {
        vendorId,
        period: `últimos ${days} días`,
        metrics: {
          totalLeads: 0,
          closedLeads: 0,
          activeLeads: 0,
          avgScore: 0,
        },
      };
    }

    const [totalLeads, closedLeads, activeLeads, avgScore] = result[0].values[0];

    return {
      vendorId,
      period: `últimos ${days} días`,
      metrics: {
        totalLeads,
        closedLeads,
        activeLeads,
        avgScore: parseFloat(avgScore || 0).toFixed(2),
        closureRate: totalLeads > 0 ? ((closedLeads / totalLeads) * 100).toFixed(2) : '0',
      },
    };
  } catch (err) {
    console.error('Error getting vendor metrics:', err.message);
    return { error: err.message };
  }
}

/**
 * Rastrear propiedades de usuario
 */
function setUserProperties(userId, properties) {
  try {
    const mp = getMixpanelClient();
    if (!mp) return { error: 'Mixpanel no configurado' };

    mp.people.set(userId, {
      ...properties,
      last_seen: new Date().toISOString(),
    });

    return { success: true };
  } catch (err) {
    console.error('Error setting user properties:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  trackEvent,
  trackLeadAction,
  trackVendorAction,
  getFunnelAnalytics,
  getVendorMetrics,
  setUserProperties,
  EVENTS,
};
