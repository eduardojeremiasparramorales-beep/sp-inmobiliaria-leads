/**
 * 🚀 API de Características Avanzadas - Fase 1 + Fase 2
 * Endpoints para: scoring, escalada, timeline, notas, automatización, integraciones
 */

const express = require('express');
const router = express.Router();
const auth = require('../../services/auth');
const scoring = require('../../services/scoring');
const escalation = require('../../services/escalation');
const timeline = require('../../services/timeline');
const notes = require('../../services/collaborative-notes');
const automation = require('../../services/automation');
const store = require('../../db/store');

// Fase 2 - Integraciones
const googleCalendar = require('../../services/integrations/google-calendar');
const stripePayments = require('../../services/integrations/stripe-payments');
const googleMaps = require('../../services/integrations/google-maps');
const emailTracking = require('../../services/integrations/email-tracking');
const smsReminders = require('../../services/integrations/sms-reminders');
const notionSync = require('../../services/integrations/notion-sync');
const pdfReports = require('../../services/integrations/pdf-reports');
const referrals = require('../../services/integrations/referrals');
const twilioVoip = require('../../services/integrations/twilio-voip');
const mixpanelAnalytics = require('../../services/integrations/mixpanel-analytics');

// ===================== SCORING =====================

/**
 * GET /api/v2/leads/:id/score
 * Obtener score completo de un lead
 */
router.get('/leads/:id/score', auth.requireAuth, (req, res) => {
  try {
    const db = store.getDB();
    const result = db.exec(`SELECT * FROM leads WHERE id = ?`, [req.params.id]);

    if (!result.length || !result[0].values.length) {
      return res.status(404).json({ error: 'Lead no encontrado' });
    }

    const row = result[0].values[0];
    const lead = {
      id: row[0],
      customer_name: row[1],
      customer_phone: row[2],
      created_at: row[6],
      last_message: row[9],
      messages_count: row[10],
      status: row[5],
      etiqueta: row[11],
      first_response_at: row[7],
    };

    const scoreData = scoring.calculateLeadScore(lead);
    return res.json({
      leadId: lead.id,
      customerName: lead.customer_name,
      ...scoreData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v2/leads/ranking
 * Obtener todos los leads ordenados por score
 */
router.get('/leads/ranking', auth.requireAuth, (req, res) => {
  try {
    const db = store.getDB();
    const leads = store.getLeads();
    const ranked = scoring.rankLeadsByScore(leads);

    return res.json({
      total: ranked.length,
      leads: ranked.slice(0, 50).map(l => ({
        id: l.id,
        name: l.customer_name,
        phone: l.customer_phone,
        score: l.scoring.score,
        classification: l.scoring.classification,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v2/team/health-score
 * Obtener health score del equipo
 */
router.get('/team/health-score', auth.requireAdmin, (req, res) => {
  try {
    const leads = store.getLeads();
    const health = scoring.calculateTeamHealthScore(leads);

    return res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== TIMELINE =====================

/**
 * GET /api/v2/leads/:id/timeline
 * Obtener timeline completo de un lead
 */
router.get('/leads/:id/timeline', auth.requireAuth, (req, res) => {
  try {
    const timelineEvents = timeline.getLeadTimeline(req.params.id, 100);
    const summary = timeline.getActivitySummary(req.params.id);
    const milestones = timeline.getMilestones(req.params.id);

    return res.json({
      leadId: req.params.id,
      summary,
      milestones,
      events: timelineEvents,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== NOTAS COLABORATIVAS =====================

/**
 * GET /api/v2/leads/:id/notes
 * Obtener todas las notas de un lead
 */
router.get('/leads/:id/notes', auth.requireAuth, (req, res) => {
  try {
    const leadNotes = notes.getLeadNotes(req.params.id);
    const stats = notes.getNoteStats(req.params.id);

    return res.json({
      leadId: req.params.id,
      stats,
      notes: leadNotes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/leads/:id/notes
 * Agregar nueva nota colaborativa
 */
router.post('/leads/:id/notes', auth.requireAuth, (req, res) => {
  try {
    const { noteText } = req.body;
    if (!noteText) return res.status(400).json({ error: 'Nota vacía' });

    const result = notes.addNote(
      req.params.id,
      req.user?.id || 0,
      req.user?.nombre || 'Sistema',
      noteText
    );

    if (result.error) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/v2/notes/:noteId
 * Actualizar nota (solo propietario o admin)
 */
router.put('/notes/:noteId', auth.requireAuth, (req, res) => {
  try {
    const { noteText } = req.body;
    const result = notes.updateNote(req.params.noteId, req.user?.id || 0, noteText);

    if (result.error) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== AUTOMATIZACIÓN =====================

/**
 * POST /api/v2/messages/suggest-response
 * Obtener respuesta sugerida para un mensaje
 */
router.post('/messages/suggest-response', auth.requireAuth, async (req, res) => {
  try {
    const { messageText, leadInfo } = req.body;

    // Detectar tipo de pregunta
    const detection = await automation.detectQuestionType(messageText);
    const suggestion = automation.getSuggestedResponse(detection.type);
    const nextAction = automation.suggestNextAction(messageText, detection.type);

    return res.json({
      detection,
      suggestion,
      nextAction,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/messages/generate-response
 * Generar respuesta personalizada con IA
 */
router.post('/messages/generate-response', auth.requireAuth, async (req, res) => {
  try {
    const { messageText, leadInfo } = req.body;

    const generated = await automation.generatePersonalizedResponse(messageText, leadInfo);

    if (!generated) {
      return res.status(503).json({ error: 'IA no disponible' });
    }

    return res.json(generated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== ESCALACIÓN =====================

/**
 * GET /api/v2/leads/critical
 * Obtener leads en estado crítico
 */
router.get('/leads/critical', auth.requireAdmin, (req, res) => {
  try {
    const db = store.getDB();
    const critical = escalation.getCriticalLeads(db);

    return res.json({
      total: critical.length,
      leads: critical,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v2/escalation/process
 * Procesar escaladas pendientes (normalmente llamado por cron cada 5 min)
 */
router.post('/escalation/process', auth.requireAdmin, async (req, res) => {
  try {
    const result = await escalation.processEscalations();
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== FASE 2: INTEGRACIONES =====================

// ---- Google Calendar ----
router.post('/calendar/events', auth.requireAuth, async (req, res) => {
  try {
    const result = await googleCalendar.createCalendarEvent(req.body);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/calendar/availability/:email', auth.requireAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const result = await googleCalendar.getVendorAvailability(
      req.params.email,
      startDate,
      endDate
    );
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Stripe Payments ----
router.post('/payments/intent', auth.requireAuth, async (req, res) => {
  try {
    const { leadId, amount, description } = req.body;
    const result = await stripePayments.createPaymentIntent(leadId, amount, description);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/payments/:paymentIntentId/status', auth.requireAuth, async (req, res) => {
  try {
    const result = await stripePayments.confirmPayment(req.params.paymentIntentId);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Google Maps ----
router.post('/maps/geocode', auth.requireAuth, async (req, res) => {
  try {
    const result = await googleMaps.geocodeAddress(req.body.address);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/maps/distance', auth.requireAuth, async (req, res) => {
  try {
    const result = await googleMaps.getDistance(req.query.origin, req.query.destination);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Email Tracking ----
router.post('/email/send-tracked', auth.requireAuth, async (req, res) => {
  try {
    const { leadId, leadEmail, subject, htmlContent } = req.body;
    const db = store.getDB();
    const leadResult = db.exec('SELECT customer_name FROM leads WHERE id = ?', [leadId]);
    const leadName = leadResult[0]?.values[0]?.[0] || 'Cliente';

    const result = await emailTracking.sendTrackedEmail(
      leadId,
      leadEmail,
      leadName,
      subject,
      htmlContent
    );
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/email/tracking/:token', auth.requireAuth, (req, res) => {
  try {
    const result = emailTracking.getEmailStats(req.params.token);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pixel de tracking (público, sin auth)
router.get('/tracking/pixel/:token', (req, res) => {
  emailTracking.trackEmailOpen(req.params.token);
  res.type('image/gif').send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
});

// ---- SMS Reminders ----
router.post('/sms/send', auth.requireAuth, async (req, res) => {
  try {
    const result = await smsReminders.sendSMS(req.body.phoneNumber, req.body.message);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sms/schedule-reminder', auth.requireAuth, async (req, res) => {
  try {
    const result = await smsReminders.scheduleReminder(
      req.body.leadId,
      req.body.phoneNumber,
      req.body.message,
      req.body.delayMinutes
    );
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Notion/Airtable ----
router.post('/sync/notion', auth.requireAuth, async (req, res) => {
  try {
    const result = await notionSync.syncLeadToNotion(req.body.lead);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync/airtable', auth.requireAuth, async (req, res) => {
  try {
    const result = await notionSync.syncLeadToAirtable(req.body.lead);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- PDF Reports ----
router.post('/reports/proposal-pdf', auth.requireAuth, async (req, res) => {
  try {
    const { leadId, leadName, phoneNumber, lotDetails } = req.body;
    const lead = { id: leadId, customer_name: leadName, customer_phone: phoneNumber };
    const result = await pdfReports.generateLeadProposal(lead, lotDetails);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reports/vendor-report', auth.requireAdmin, async (req, res) => {
  try {
    const { vendorId, startDate, endDate } = req.body;
    const result = await pdfReports.generateVendorReport(vendorId, startDate, endDate);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Referral System ----
router.post('/referrals/create-code', auth.requireAuth, (req, res) => {
  try {
    const result = referrals.createReferralCode(req.body.phoneNumber, req.body.name);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/referrals/register', auth.requireAuth, (req, res) => {
  try {
    const result = referrals.registerReferredLead(req.body.leadId, req.body.referralCode);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/referrals/stats/:phone', auth.requireAuth, (req, res) => {
  try {
    const result = referrals.getReferralStats(req.params.phone);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/referrals/commissions/:phone', auth.requireAuth, (req, res) => {
  try {
    const result = referrals.getReferralCommissions(req.params.phone);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Twilio VoIP ----
router.post('/calls/make', auth.requireAuth, async (req, res) => {
  try {
    const result = await twilioVoip.makeCall(req.body.toNumber, req.body.fromNumber, req.body.recordCall);
    if (result.success) {
      twilioVoip.logCallToCRM(req.body.leadId, result.callSid, result);
    }
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/calls/history/:leadId', auth.requireAuth, (req, res) => {
  try {
    const result = twilioVoip.getCallHistory(req.params.leadId);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Mixpanel Analytics ----
router.post('/analytics/track', auth.requireAuth, (req, res) => {
  try {
    const result = mixpanelAnalytics.trackEvent(req.user?.id, req.body.event, req.body.properties);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics/vendor/:vendorId', auth.requireAdmin, async (req, res) => {
  try {
    const result = await mixpanelAnalytics.getVendorMetrics(req.params.vendorId, 30);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
