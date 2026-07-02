/**
 * 🚀 API de Características Avanzadas - Fase 1
 * Endpoints para: scoring, escalada, timeline, notas, automatización
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

module.exports = router;
