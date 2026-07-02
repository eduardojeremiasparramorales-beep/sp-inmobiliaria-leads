/**
 * 🎯 Sistema de Scoring Inteligente de Leads
 * Calificación automática basada en interacción, tiempo de respuesta y palabras clave
 * Usa puntuación de 0-100 para predecir probabilidad de cierre
 */

const keywords = {
  'hot': ['cuándo', 'cuanto', 'disponible', 'hoy', 'urgente', 'compro', 'comprar', 'contado', 'efectivo'],
  'warm': ['interesado', 'información', 'fotos', 'ubicación', 'precio', 'características', 'consulta'],
  'cold': ['hola', 'buenas', 'gracias', 'ok', 'de acuerdo'],
};

/**
 * Calcular score de lead basado en múltiples factores
 */
function calculateLeadScore(lead) {
  let score = 0;
  const factors = {};

  // 1️⃣ Factor: Tiempo desde primer mensaje (0-20 pts)
  const minutesAgo = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 60000);
  if (minutesAgo < 5) factors.recency = 20;
  else if (minutesAgo < 15) factors.recency = 15;
  else if (minutesAgo < 60) factors.recency = 10;
  else if (minutesAgo < 1440) factors.recency = 5;
  else factors.recency = 0;
  score += factors.recency;

  // 2️⃣ Factor: Cantidad de mensajes (0-20 pts)
  const msgCount = lead.messages_count || 0;
  if (msgCount >= 10) factors.engagement = 20;
  else if (msgCount >= 5) factors.engagement = 15;
  else if (msgCount >= 3) factors.engagement = 10;
  else if (msgCount >= 1) factors.engagement = 5;
  else factors.engagement = 0;
  score += factors.engagement;

  // 3️⃣ Factor: Palabras clave en último mensaje (0-25 pts)
  const lastMsg = (lead.last_message || '').toLowerCase();
  factors.keywords = detectKeywordType(lastMsg);
  if (factors.keywords === 'hot') factors.keywordScore = 25;
  else if (factors.keywords === 'warm') factors.keywordScore = 15;
  else factors.keywordScore = 5;
  score += factors.keywordScore;

  // 4️⃣ Factor: Tiempo de respuesta del vendedor (0-15 pts)
  if (lead.first_response_at) {
    const respSeconds = Math.floor((new Date(lead.first_response_at).getTime() - new Date(lead.created_at).getTime()) / 1000);
    if (respSeconds < 120) factors.responseTime = 15; // respuesta <2min = excelente
    else if (respSeconds < 600) factors.responseTime = 12; // <10min
    else if (respSeconds < 1800) factors.responseTime = 8; // <30min
    else if (respSeconds < 3600) factors.responseTime = 4; // <1h
    else factors.responseTime = 0;
  } else {
    factors.responseTime = 0;
  }
  score += factors.responseTime;

  // 5️⃣ Factor: Estado del lead (0-20 pts)
  const stateScores = {
    'vendido': 100, // ya cerrado
    'cita': 20,
    'negociacion': 18,
    'interesado': 15,
    'contactado': 10,
    'asignado': 5,
    'nuevo': 0,
    'no_interesado': -5,
  };
  factors.state = stateScores[lead.etiqueta || 'nuevo'] || 0;
  // Pero cap en 20 para que no domine todo
  factors.state = Math.min(factors.state, 20);
  score += factors.state;

  // Clamping a 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    score: Math.round(score),
    factors,
    probability: `${Math.round(score)}%`,
    classification: classifyScore(score),
  };
}

/**
 * Detectar tipo de palabra clave en texto
 */
function detectKeywordType(text) {
  if (keywords.hot.some(k => text.includes(k))) return 'hot';
  if (keywords.warm.some(k => text.includes(k))) return 'warm';
  return 'cold';
}

/**
 * Clasificar score en categoría
 */
function classifyScore(score) {
  if (score >= 80) return '🔥 HOT - Alto potencial de cierre';
  if (score >= 60) return '🔆 WARM - Potencial moderado';
  if (score >= 40) return '⚪ LUKEWARM - Seguimiento requerido';
  if (score >= 20) return '❄️ COLD - Bajo potencial';
  return '🚫 DEAD - No responder';
}

/**
 * Obtener leads ordenados por score (para dashboard)
 */
function rankLeadsByScore(leads) {
  return leads
    .map(lead => ({
      ...lead,
      scoring: calculateLeadScore(lead),
    }))
    .sort((a, b) => b.scoring.score - a.scoring.score);
}

/**
 * Calcular health score del equipo (promedio de leads activos)
 */
function calculateTeamHealthScore(leads) {
  const activeLeads = leads.filter(l => l.status !== 'cerrado' && l.status !== 'no_interesado');
  if (activeLeads.length === 0) return { score: 0, message: 'Sin leads activos' };

  const scores = activeLeads.map(l => calculateLeadScore(l).score);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  return {
    score: avg,
    activeLeads: activeLeads.length,
    hotCount: scores.filter(s => s >= 80).length,
    warmCount: scores.filter(s => s >= 60 && s < 80).length,
    coldCount: scores.filter(s => s < 60).length,
  };
}

module.exports = {
  calculateLeadScore,
  detectKeywordType,
  classifyScore,
  rankLeadsByScore,
  calculateTeamHealthScore,
};
