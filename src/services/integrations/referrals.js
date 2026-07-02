/**
 * 🤝 Sistema de Referencias/Referral
 * Tracking de leads que vienen de recomendación
 */

/**
 * Crear código de referral único
 */
function generateReferralCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Registrar nuevo referral para un cliente
 */
function createReferralCode(clientPhone, clientName) {
  try {
    const store = require('../../db/store');
    const db = store.getDB();

    const code = generateReferralCode();

    db.run(`
      INSERT INTO referrals (code, referrer_phone, referrer_name, created_at)
      VALUES (?, ?, ?, ?)
    `, [code, clientPhone, clientName, new Date().toISOString()]);

    return {
      success: true,
      code,
      referrerPhone: clientPhone,
      referrerName: clientName,
      link: `${process.env.APP_URL}/?ref=${code}`,
    };
  } catch (err) {
    console.error('Error creating referral code:', err.message);
    return { error: err.message };
  }
}

/**
 * Registrar lead que viene de referral
 */
function registerReferredLead(leadId, referralCode) {
  try {
    const store = require('../../db/store');
    const db = store.getDB();

    // Obtener info del referral
    const referralResult = db.exec(
      'SELECT id, referrer_phone, referrer_name FROM referrals WHERE code = ?',
      [referralCode]
    );

    if (!referralResult.length || !referralResult[0].values.length) {
      return { error: 'Código de referral inválido' };
    }

    const [referralId, referrerPhone, referrerName] = referralResult[0].values[0];

    // Actualizar lead
    db.run(`
      UPDATE leads SET referred_by = ?, referral_code = ? WHERE id = ?
    `, [referralId, referralCode, leadId]);

    // Registrar en tabla de referrals
    db.run(`
      UPDATE referrals
      SET referred_lead_id = ?, referred_at = ?
      WHERE code = ?
    `, [leadId, new Date().toISOString(), referralCode]);

    return {
      success: true,
      leadId,
      referrerId: referralId,
      referrerName,
      referrerPhone,
    };
  } catch (err) {
    console.error('Error registering referred lead:', err.message);
    return { error: err.message };
  }
}

/**
 * Obtener estadísticas de referrals de un cliente
 */
function getReferralStats(clientPhone) {
  try {
    const store = require('../../db/store');
    const db = store.getDB();

    const result = db.exec(`
      SELECT
        code,
        COUNT(CASE WHEN referred_lead_id IS NOT NULL THEN 1 END) as total_referred,
        COUNT(CASE WHEN referred_lead_id IS NOT NULL AND referred_at >= date('now', '-30 days') THEN 1 END) as referred_last_30days,
        MAX(referred_at) as last_referral
      FROM referrals
      WHERE referrer_phone = ?
      GROUP BY code
    `, [clientPhone]);

    if (!result.length || !result[0].values.length) {
      return {
        clientPhone,
        totalReferrals: 0,
        referralsLast30Days: 0,
        codes: [],
      };
    }

    const rows = result[0].values;
    return {
      clientPhone,
      totalReferrals: rows.reduce((sum, r) => sum + (r[1] || 0), 0),
      referralsLast30Days: rows.reduce((sum, r) => sum + (r[2] || 0), 0),
      codes: rows.map(r => ({
        code: r[0],
        totalReferred: r[1],
        referredLast30Days: r[2],
        lastReferral: r[3],
      })),
    };
  } catch (err) {
    console.error('Error getting referral stats:', err.message);
    return { error: err.message };
  }
}

/**
 * Obtener comisiones por referral (si aplica)
 */
function getReferralCommissions(clientPhone) {
  try {
    const store = require('../../db/store');
    const db = store.getDB();

    // Asumir comisión de $100.000 por referral exitoso (cerrado)
    const COMMISSION_PER_CLOSED = 100000;

    const result = db.exec(`
      SELECT
        r.referrer_phone,
        r.referrer_name,
        COUNT(CASE WHEN l.status = 'closed' THEN 1 END) as closed_leads,
        COUNT(CASE WHEN l.status = 'closed' THEN 1 END) * ? as total_commission
      FROM referrals r
      LEFT JOIN leads l ON r.referred_lead_id = l.id
      WHERE r.referrer_phone = ?
      GROUP BY r.referrer_phone
    `, [COMMISSION_PER_CLOSED, clientPhone]);

    if (!result.length || !result[0].values.length) {
      return {
        clientPhone,
        closedLeads: 0,
        totalCommission: 0,
      };
    }

    const [phone, name, closedLeads, totalCommission] = result[0].values[0];
    return {
      clientPhone: phone,
      clientName: name,
      closedLeads,
      totalCommission,
      commissionPerLead: COMMISSION_PER_CLOSED,
    };
  } catch (err) {
    console.error('Error getting referral commissions:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  generateReferralCode,
  createReferralCode,
  registerReferredLead,
  getReferralStats,
  getReferralCommissions,
};
