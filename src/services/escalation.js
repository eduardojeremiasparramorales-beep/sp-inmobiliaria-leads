/**
 * 🚀 Sistema de Auto-Escalada Inteligente
 * Escalación automática con reglas de negocio
 * - Sin respuesta >15min = alerta
 * - Sin respuesta >30min = reasignación
 * - Sin respuesta >1h = escalación a gerente
 */

const store = require('../db/store');
const events = require('./events');

const ESCALATION_RULES = {
  ALERT_15M: { minutes: 15, action: 'alert', description: 'Alerta: lead sin respuesta' },
  REASSIGN_30M: { minutes: 30, action: 'reassign', description: 'Reasignación: vendedor no responde' },
  MANAGER_60M: { minutes: 60, action: 'manager', description: 'Escalación a gerente: lead crítico' },
};

/**
 * Verificar y ejecutar escaladas pendientes
 */
async function processEscalations() {
  try {
    const db = store.getDB();

    // Obtener leads sin respuesta
    const noResponse = db.exec(`
      SELECT l.*, v.nombre as vendedor_nombre
      FROM leads l
      LEFT JOIN vendedores v ON l.assigned_to_id = v.id
      WHERE l.status IN ('nuevo', 'asignado')
        AND l.created_at IS NOT NULL
        AND l.first_response_at IS NULL
    `);

    if (!noResponse.length || !noResponse[0].values.length) return { processed: 0 };

    const leads = noResponse[0].values.map(row => ({
      id: row[0],
      customer_name: row[1],
      customer_phone: row[2],
      assigned_to_id: row[3],
      assigned_to_phone: row[4],
      created_at: row[6],
      first_response_at: row[7],
      escalation_level: row[11],
      vendedor_nombre: row[row.length - 2],
    }));

    let processed = 0;
    let alerts = 0;
    let reassignments = 0;
    let managers = 0;

    for (const lead of leads) {
      const minutesSinceCreation = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 60000);

      // 🟠 Regla 1: Alerta después de 15 minutos
      if (minutesSinceCreation >= 15 && minutesSinceCreation < 30 && lead.escalation_level < 1) {
        db.run(`UPDATE leads SET escalation_level = 1 WHERE id = ?`, [lead.id]);
        events.emit('lead:escalated', {
          leadId: lead.id,
          level: 1,
          action: 'alert',
          customer: lead.customer_name,
          vendedor: lead.vendedor_nombre,
        });
        alerts++;
        processed++;
      }

      // 🔴 Regla 2: Reasignación después de 30 minutos
      if (minutesSinceCreation >= 30 && minutesSinceCreation < 60 && lead.escalation_level < 2) {
        const nextVendor = findNextAvailableVendor(db, lead.assigned_to_id);
        if (nextVendor) {
          db.run(`UPDATE leads SET escalation_level = 2, assigned_to_id = ?, assigned_to_phone = ? WHERE id = ?`,
            [nextVendor.id, nextVendor.telefono, lead.id]);
          events.emit('lead:reassigned', {
            leadId: lead.id,
            fromVendor: lead.vendedor_nombre,
            toVendor: nextVendor.nombre,
            reason: 'no_response_30m',
          });
          reassignments++;
          processed++;
        }
      }

      // ⚫ Regla 3: Escalación a gerente después de 1 hora
      if (minutesSinceCreation >= 60 && lead.escalation_level < 3) {
        db.run(`UPDATE leads SET escalation_level = 3, marked_as_critical = 1 WHERE id = ?`, [lead.id]);
        events.emit('lead:critical', {
          leadId: lead.id,
          customer: lead.customer_name,
          minutesSinceCreation,
          vendor: lead.vendedor_nombre,
        });
        managers++;
        processed++;
      }
    }

    return {
      processed,
      alerts,
      reassignments,
      managers,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Error en auto-escalada:', err.message);
    return { error: err.message, processed: 0 };
  }
}

/**
 * Encontrar el siguiente vendedor disponible (round-robin)
 */
function findNextAvailableVendor(db, currentVendorId) {
  try {
    const result = db.exec(`
      SELECT id, nombre, telefono, COUNT(l.id) as lead_count
      FROM vendedores v
      LEFT JOIN leads l ON v.id = l.assigned_to_id AND l.status IN ('nuevo', 'asignado')
      WHERE v.estado = 'activo' AND v.id != ?
      GROUP BY v.id
      ORDER BY lead_count ASC, v.id ASC
      LIMIT 1
    `, [currentVendorId]);

    if (!result.length || !result[0].values.length) return null;

    const row = result[0].values[0];
    return {
      id: row[0],
      nombre: row[1],
      telefono: row[2],
      leadCount: row[3],
    };
  } catch (err) {
    console.error('Error finding next vendor:', err.message);
    return null;
  }
}

/**
 * Obtener leads en estado crítico
 */
function getCriticalLeads(db) {
  try {
    const result = db.exec(`
      SELECT id, customer_name, customer_phone, assigned_to_phone,
             created_at, escalation_level, first_response_at
      FROM leads
      WHERE marked_as_critical = 1 OR escalation_level >= 3
      ORDER BY created_at ASC
    `);

    if (!result.length || !result[0].values.length) return [];

    return result[0].values.map(row => ({
      id: row[0],
      customer_name: row[1],
      customer_phone: row[2],
      assigned_to_phone: row[3],
      created_at: row[4],
      escalation_level: row[5],
      first_response_at: row[6],
      minutesSinceCreation: Math.floor((Date.now() - new Date(row[4]).getTime()) / 60000),
    }));
  } catch (err) {
    console.error('Error getting critical leads:', err.message);
    return [];
  }
}

/**
 * Resetear escalación cuando lead es contactado
 */
function resetEscalation(db, leadId) {
  try {
    db.run(`
      UPDATE leads
      SET escalation_level = 0, marked_as_critical = 0, first_response_at = ?
      WHERE id = ?
    `, [new Date().toISOString(), leadId]);

    events.emit('lead:escalation_reset', { leadId });
    return true;
  } catch (err) {
    console.error('Error resetting escalation:', err.message);
    return false;
  }
}

module.exports = {
  processEscalations,
  findNextAvailableVendor,
  getCriticalLeads,
  resetEscalation,
  ESCALATION_RULES,
};
