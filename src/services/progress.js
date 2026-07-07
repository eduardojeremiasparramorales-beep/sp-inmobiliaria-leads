const PROGRESS_MAP = { sin_clasificar: 5, interesado: 30, negociacion: 60, cita: 85, vendido: 100, no_interesado: 5 };

const KEYWORD_RULES = [
  { keywords: ['visita', 'agendar', 'cita', 'conocer', 'ir a ver', 'recorrer', 'mostrar', 'ver el lote', 'visitar'], etiqueta: 'cita', minConfidence: 1 },
  { keywords: ['precio', 'cuánto', 'cuesta', 'valor', 'financiación', 'cuota inicial', 'crédito', 'mensualidad', 'cuota', 'cuotas', 'abono', 'separar'], etiqueta: 'interesado', minConfidence: 1 },
  { keywords: ['negociar', 'descuento', 'oferta', 'propuesta', 'mejor precio', 'regatear', 'rebaja'], etiqueta: 'negociacion', minConfidence: 1 },
  { keywords: ['no me interesa', 'no gracias', 'gracias pero', 'ya compré', 'no quiero', 'no gracias', 'ya no'], etiqueta: 'no_interesado', minConfidence: 1 },
];

const ORDER = ['sin_clasificar', 'interesado', 'negociacion', 'cita', 'vendido'];

function detectKeywordEtiqueta(body) {
  const t = (body || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some(kw => t.includes(kw))) return rule.etiqueta;
  }
  return null;
}

function calcActivityBonus(lead, flags) {
  let bonus = 0;
  if (lead.first_response_at) bonus += 10;
  if ((lead.messages_count || 0) >= 8) bonus += 10;
  else if ((lead.messages_count || 0) >= 4) bonus += 5;
  if (flags.hasMedia) bonus += 10;
  if (flags.sentLocation) bonus += 15;
  if (flags.wasRead) bonus += 5;
  if (lead.messages_count >= 2 && lead.first_response_at) bonus += 5;
  return Math.min(bonus, 30);
}

function shouldUpgrade(currentEtq, newEtq) {
  if (newEtq === 'no_interesado') return true;
  if (currentEtq === 'vendido') return false;
  if (currentEtq === 'no_interesado' && newEtq !== 'no_interesado') return true;
  const ci = ORDER.indexOf(currentEtq);
  const ni = ORDER.indexOf(newEtq);
  return ni > ci;
}

async function evaluateFromMessage(leadId, messageBody, flags) {
  const store = require('../db/store');
  const lead = store.getLeadById(leadId);
  if (!lead) return;

  const currentEtq = lead.etiqueta || 'sin_clasificar';
  const currentPct = lead.progress_pct || PROGRESS_MAP.sin_clasificar;

  let kwEtq = detectKeywordEtiqueta(messageBody);
  let nlpEtq = null;

  // Try NLP only if no keyword matched or if confidence check needed
  if (!kwEtq) {
    try {
      const nlp = require('./nlp');
      const { intent, confidence } = await nlp.classifyIntent(messageBody);
      if (confidence >= 0.6) {
        const intentMap = { visita: 'cita', precio: 'interesado', ubicacion: 'interesado', queja: 'no_interesado' };
        nlpEtq = intentMap[intent] || null;
      }
    } catch (e) { /* NLP not available */ }
  }

  const targetEtq = kwEtq || nlpEtq || null;

  if (targetEtq && shouldUpgrade(currentEtq, targetEtq)) {
    store.setLeadEtiqueta(leadId, targetEtq);
    return;
  }

  const bonus = calcActivityBonus(lead, flags || {});
  if (bonus > 0) {
    const base = PROGRESS_MAP[currentEtq] || 5;
    const pct = Math.min(base + bonus, 99);
    if (pct > currentPct) store.updateLeadProgress(leadId, pct);
  }
}

async function evaluateRead(leadId) {
  const store = require('../db/store');
  const lead = store.getLeadById(leadId);
  if (!lead || lead.progress_pct >= 80) return;
  store.updateLeadProgress(leadId, Math.min((lead.progress_pct || 5) + 5, 80));
}

module.exports = { evaluateFromMessage, evaluateRead, PROGRESS_MAP, KEYWORD_RULES, ORDER };
