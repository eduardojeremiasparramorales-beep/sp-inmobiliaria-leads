// Motor de envío de campañas masivas: procesa destinatarios uno a uno respetando un
// rate limit configurable y el tier diario de mensajería de Meta (compartido entre
// todas las campañas del negocio), con reintentos ante errores transitorios (429/500)
// y trazabilidad completa por destinatario para conciliar con los statuses del webhook.

const store = require('../db/store');

const DEFAULT_MPS = 5; // mensajes por segundo — conservador por defecto, configurable
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

// Evita que dos ejecuciones concurrentes de la misma campaña se pisen (p. ej. doble
// clic en "Iniciar" o un reinicio del proceso mientras ya estaba corriendo).
const runningCampaigns = new Set();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getMps() {
  const cfg = Number(store.getConfig('campaign_mps'));
  return cfg > 0 ? cfg : DEFAULT_MPS;
}

function getDailyLimit() {
  const cfg = Number(store.getConfig('campaign_daily_limit'));
  // 250 = el tier inicial de Meta; el admin lo sube en Configuración a medida que
  // WhatsApp aumenta el límite del número por volumen + calidad + verificación.
  return cfg > 0 ? cfg : 250;
}

// Ventana horaria de envío (hora local del server — America/Bogota, ver Dockerfile) —
// por defecto 08:00-20:00. Fuera de ese rango el runner se pausa en vez de disparar
// mensajes de madrugada.
function getWindow() {
  const start = Number(store.getConfig('campaign_window_start'));
  const end = Number(store.getConfig('campaign_window_end'));
  return {
    start: (Number.isInteger(start) && start >= 0 && start <= 23) ? start : 8,
    end: (Number.isInteger(end) && end >= 1 && end <= 24) ? end : 20,
  };
}
function dentroDeVentana() {
  const { start, end } = getWindow();
  const h = new Date().getHours();
  return h >= start && h < end;
}

// Cuenta destinatarios únicos alcanzados HOY por cualquier campaña — el tier diario
// de Meta es compartido por todo el número, no por campaña individual. Es un
// COUNT(DISTINCT ...) sobre toda la tabla — costoso para llamarlo antes de CADA
// mensaje; el loop de runCampaign lo cachea en memoria y solo re-sincroniza cada
// cierto número de envíos (ver sentTodayTracker más abajo).
function sentToday() {
  const adapter = require('../db/adapter');
  const r = adapter.one(`SELECT COUNT(DISTINCT phone) as c FROM campaign_recipients
    WHERE estado IN ('sent','delivered','read','failed') AND date(sent_at) = date('now')`);
  return (r && r.c) || 0;
}

// Contador en memoria del envío diario: se inicializa una vez desde la BD y se
// incrementa localmente por cada resultado (éxito o fallo cuentan igual para el tier
// de Meta), re-sincronizando con la BD cada RESYNC_EVERY envíos para no acumular
// drift si hay otra campaña corriendo en paralelo.
const RESYNC_EVERY = 50;
function makeSentTodayTracker() {
  let count = sentToday();
  let sinceSync = 0;
  return {
    get: () => count,
    bump: () => {
      count++;
      sinceSync++;
      if (sinceSync >= RESYNC_EVERY) { count = sentToday(); sinceSync = 0; }
    },
  };
}

// Formato de teléfono aceptable para la Cloud API: solo dígitos, 10-15 caracteres
// (E.164 sin el '+'). Falla rápido sin gastar la llamada a Meta.
function telefonoValido(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return /^\d{10,15}$/.test(digits);
}

// Chequeo previo al envío masivo. Meta responde 400 (y el destinatario queda 'failed')
// cuando la plantilla no está aprobada o cuando alguna variable va en blanco — dos cosas
// que se pueden detectar ANTES de quemar destinatarios y de dejar la campaña en rojo.
// Devuelve { ok, errores[], avisos[] }: los errores bloquean el arranque, los avisos no.
function preflightCampaign(campaignId) {
  const { resolveTemplateValues } = require('./wa-templates');
  const errores = [];
  const avisos = [];

  const campaign = store.getCampaignById(campaignId);
  if (!campaign) return { ok: false, errores: ['La campaña no existe.'], avisos };
  const tpl = store.getWATemplateById(campaign.template_id);
  if (!tpl) return { ok: false, errores: ['La plantilla de la campaña ya no existe. Sincroniza las plantillas desde Meta.'], avisos };

  const estado = String(tpl.estado || '').toUpperCase();
  if (estado !== 'APPROVED') {
    errores.push(`La plantilla "${tpl.nombre}" está en estado ${estado || 'desconocido'}, no APPROVED. Meta rechaza cualquier envío con ella.`);
  }
  if (String(tpl.calidad || '').toUpperCase() === 'RED') {
    avisos.push(`La plantilla "${tpl.nombre}" tiene calidad RED: Meta puede pausarla en cualquier momento.`);
  }

  let baseOverrides = {};
  try { baseOverrides = JSON.parse(campaign.overrides || '{}'); } catch (e) {}

  const destinatarios = store.getCampaignRecipients(campaignId, 'queued');
  if (!destinatarios.length) {
    errores.push('La campaña no tiene destinatarios pendientes.');
    return { ok: errores.length === 0, errores, avisos };
  }

  // Se revisan TODOS los destinatarios: una variable que se resuelve bien para el
  // primero puede quedar vacía para el resto (p. ej. "proyecto" solo en algunos leads).
  const vaciasPorVar = new Map();
  let sinTelefono = 0;
  let optOut = 0;
  for (const rec of destinatarios) {
    if (!telefonoValido(rec.phone)) sinTelefono++;
    if (store.isOptedOut(rec.phone)) optOut++;
    const lead = rec.lead_id ? store.getLeadById(rec.lead_id) : null;
    const vendedor = lead && lead.assigned_to_id ? store.getVendedorById(lead.assigned_to_id) : null;
    let recipientVars = {};
    try { recipientVars = JSON.parse(rec.variables || '{}'); } catch (e) {}
    const values = resolveTemplateValues(tpl, lead, vendedor, { ...baseOverrides, ...recipientVars });
    for (const [k, v] of Object.entries(values)) {
      if (['headerMediaUrl', 'buttonUrlSuffix'].includes(k)) continue;
      if (String(v ?? '').trim() === '') vaciasPorVar.set(k, (vaciasPorVar.get(k) || 0) + 1);
    }
  }

  for (const [variable, cuantos] of vaciasPorVar) {
    errores.push(`La variable "${variable}" queda vacía en ${cuantos} de ${destinatarios.length} destinatarios. Meta rechaza los parámetros en blanco: dale un valor fijo en la campaña o mapéala a un dato que todos los leads tengan.`);
  }
  if (sinTelefono) avisos.push(`${sinTelefono} destinatario(s) tienen un teléfono con formato inválido y se marcarán como fallidos.`);
  if (optOut) avisos.push(`${optOut} destinatario(s) pidieron baja y serán omitidos.`);
  if (!dentroDeVentana()) {
    const { start, end } = getWindow();
    avisos.push(`Estás fuera de la ventana de envío (${start}h-${end}h): la campaña se pausará y el sistema la reanudará sola dentro del horario.`);
  }

  return { ok: errores.length === 0, errores, avisos };
}

// Envía UN mensaje de prueba de la campaña a un número concreto, por el mismo camino
// exacto que usa el envío masivo (misma plantilla, mismos overrides, misma resolución
// de variables) — para validar antes de disparar el lote completo.
async function sendCampaignTest(campaignId, phone) {
  const campaign = store.getCampaignById(campaignId);
  if (!campaign) throw new Error('La campaña no existe.');
  const tpl = store.getWATemplateById(campaign.template_id);
  if (!tpl) throw new Error('La plantilla de la campaña ya no existe.');
  if (!telefonoValido(phone)) throw new Error('El número de prueba no tiene un formato válido.');

  let baseOverrides = {};
  try { baseOverrides = JSON.parse(campaign.overrides || '{}'); } catch (e) {}

  // Se usa el lead real del número si existe, para que la prueba resuelva las mismas
  // variables que resolvería en el envío de verdad.
  const lead = store.getLeadByCustomerPhone(phone) || null;
  const vendedor = lead && lead.assigned_to_id ? store.getVendedorById(lead.assigned_to_id) : null;
  const { sendResolvedTemplate } = require('./wa-templates');
  const result = await sendResolvedTemplate(phone, tpl, lead, vendedor, baseOverrides);
  const wamid = result && result.messages && result.messages[0] && result.messages[0].id;
  return { wamid: wamid || null, template: tpl.nombre };
}

// Texto tal como lo ve el cliente (BODY de la plantilla con las variables ya resueltas),
// para dejarlo en el chat del lead. Si la plantilla no tiene BODY legible, degrada al
// nombre entre corchetes, que es lo que se guardaba antes.
function textoCampana(tpl, lead, vendedor, overrides) {
  try {
    const { resolveTemplateValues, recordatorioTextoPlano } = require('./wa-templates');
    const values = resolveTemplateValues(tpl, lead, vendedor, overrides);
    const texto = recordatorioTextoPlano(tpl, values);
    if (texto && texto.trim()) return texto;
  } catch (e) { /* degrada al fallback */ }
  return `[Campaña: ${tpl.nombre}]`;
}

async function sendOneWithRetry(to, tpl, lead, vendedor, overrides) {
  const { sendResolvedTemplate } = require('./wa-templates');
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const r = await sendResolvedTemplate(to, tpl, lead, vendedor, overrides);
      try { store.bumpUsage('campanas_enviadas'); } catch (e) {}
      return r;
    } catch (err) {
      lastErr = err;
      const status = err.response && err.response.status;
      const retryable = status === 429 || (status >= 500 && status < 600);
      if (!retryable || attempt === MAX_RETRIES) throw err;
      await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt)); // backoff exponencial
    }
  }
  throw lastErr;
}

// Dispara 'campana:finalizada' una vez por cada lead al que sí se le entregó el mensaje.
// Los que fallaron quedan fuera a propósito: encadenar seguimiento sobre un envío que
// nunca llegó produciría tareas y etiquetas basadas en algo que el cliente no vio.
function dispararCampanaFinalizada(campaignId, nombreCampana) {
  try {
    const { triggerWorkflow } = require('./assigner');
    const alcanzados = store.getCampaignRecipients(campaignId)
      .filter(r => ['sent', 'delivered', 'read'].includes(String(r.estado)) && r.lead_id);
    for (const rec of alcanzados) {
      triggerWorkflow('campana:finalizada', rec.lead_id, nombreCampana || '', { campaignId, estadoEnvio: rec.estado });
    }
    if (alcanzados.length) console.log(`[Campaign ${campaignId}] Disparado campana:finalizada para ${alcanzados.length} lead(s).`);
  } catch (e) {
    console.error(`[Campaign ${campaignId}] error disparando campana:finalizada:`, e.message);
  }
}

// Procesa la cola de una campaña. Se lanza en segundo plano (no se espera desde el
// endpoint HTTP) — puede tardar minutos/horas según el tamaño y el rate limit.
async function runCampaign(campaignId) {
  if (runningCampaigns.has(campaignId)) return;
  runningCampaigns.add(campaignId);
  try {
    const campaign = store.getCampaignById(campaignId);
    if (!campaign) return;
    const tpl = store.getWATemplateById(campaign.template_id);
    if (!tpl) { store.updateCampaignEstado(campaignId, 'failed'); return; }

    let baseOverrides = {};
    try { baseOverrides = JSON.parse(campaign.overrides || '{}'); } catch (e) {}

    store.updateCampaignEstado(campaignId, 'running');
    const mps = getMps();
    const dailyLimit = getDailyLimit();
    const sentTracker = makeSentTodayTracker();

    const pendientes = store.getCampaignRecipients(campaignId, 'queued');
    for (const rec of pendientes) {
      // Se relee el estado en cada vuelta: si el admin pausó la campaña desde el
      // panel mientras corría, se detiene ANTES del siguiente envío, no después.
      const fresh = store.getCampaignById(campaignId);
      if (!fresh || fresh.estado !== 'running') break;

      if (!dentroDeVentana()) {
        const { start, end } = getWindow();
        console.log(`[Campaign ${campaignId}] Fuera de la ventana horaria (${start}h-${end}h) — pausando, el cron la reanuda dentro del horario.`);
        store.updateCampaignEstado(campaignId, 'paused', 'window');
        break;
      }

      if (store.isOptedOut(rec.phone)) {
        store.updateCampaignRecipient(rec.id, { estado: 'failed', errorDetail: 'opt_out' });
        continue;
      }
      if (!telefonoValido(rec.phone)) {
        store.updateCampaignRecipient(rec.id, { estado: 'failed', errorDetail: 'telefono_invalido' });
        continue;
      }
      if (sentTracker.get() >= dailyLimit) {
        console.log(`[Campaign ${campaignId}] Límite diario de mensajería alcanzado (${dailyLimit}) — pausando campaña, el cron la reanuda cuando haya cupo.`);
        store.updateCampaignEstado(campaignId, 'paused', 'daily_limit');
        break;
      }

      const lead = rec.lead_id ? store.getLeadById(rec.lead_id) : null;
      const vendedor = lead && lead.assigned_to_id ? store.getVendedorById(lead.assigned_to_id) : null;
      let recipientVars = {};
      try { recipientVars = JSON.parse(rec.variables || '{}'); } catch (e) {}
      const overrides = { ...baseOverrides, ...recipientVars };

      try {
        const result = await sendOneWithRetry(rec.phone, tpl, lead, vendedor, overrides);
        const wamid = result && result.messages && result.messages[0] && result.messages[0].id;
        store.updateCampaignRecipient(rec.id, { estado: 'sent', wamid: wamid || null });
        // Se guarda con el mismo wamid que en campaign_recipients: así el status que
        // llegue por webhook (delivered/read/failed) actualiza AMBOS lugares —la
        // conversación del lead en el CRM y el dashboard de la campaña— con un solo evento.
        // Se guarda el texto REAL que recibió el cliente (variables ya resueltas), no
        // solo el nombre de la plantilla: si no, el asesor abre el chat y no sabe qué
        // le dijimos, y no puede darle continuidad a la respuesta.
        if (lead) store.saveMessage(lead.id, 'sistema', rec.phone, textoCampana(tpl, lead, vendedor, overrides), 'outgoing', null, null, wamid || null, 'sent');
      } catch (err) {
        // err.message de axios es siempre "Request failed with status code 400", inútil
        // para diagnosticar: el motivo real de Meta viaja en err.response.data.error.
        // describeMetaError lo traduce a código + mensaje + sugerencia accionable.
        const { describeMetaError } = require('./wa-templates');
        const detalle = describeMetaError(err);
        console.error(`[Campaign ${campaignId}] Falló ${rec.phone}: ${detalle}`);
        store.updateCampaignRecipient(rec.id, { estado: 'failed', errorDetail: detalle });
      }
      sentTracker.bump();
      store.recalcCampaignStats(campaignId);
      await sleep(1000 / mps);
    }

    const finalState = store.getCampaignById(campaignId);
    if (finalState && finalState.estado === 'running') {
      const remaining = store.getCampaignRecipients(campaignId, 'queued');
      const terminada = !remaining.length;
      store.updateCampaignEstado(campaignId, terminada ? 'done' : 'paused');
      // Al cerrar la campaña, cada lead alcanzado puede encadenar seguimiento automático
      // (etiquetar, crear tarea al asesor, iniciar cadencia) sin trabajo manual.
      if (terminada) dispararCampanaFinalizada(campaignId, campaign.nombre);
    }
    store.recalcCampaignStats(campaignId);
  } catch (e) {
    console.error(`[Campaign ${campaignId}] Error inesperado:`, e.message);
    store.updateCampaignEstado(campaignId, 'paused', 'error');
  } finally {
    runningCampaigns.delete(campaignId);
  }
}

// Al arrancar el server: campañas que quedaron en 'running' son las que el proceso
// anterior dejó a mitad de envío (crash, docker restart, deploy) — sin esto se
// quedan colgadas para siempre, ni continúan ni se pueden borrar (el DELETE rechaza
// estado 'running'). Se relanzan; runCampaign retoma desde los destinatarios 'queued'.
async function resumePendingCampaigns() {
  const colgadas = store.getCampaignsByEstado('running');
  for (const c of colgadas) {
    console.log(`[Campaign ${c.id}] Reanudando tras reinicio del servidor (quedó en 'running').`);
    runCampaign(c.id).catch(e => console.error(`[Campaign ${c.id}] error al reanudar:`, e.message));
  }
  return colgadas.length;
}

// Cron periódico: campañas que el propio runner pausó por tope diario o por estar
// fuera de la ventana horaria se reintentan solas en cuanto vuelven a ser elegibles —
// antes había que entrar al panel y pulsar "Iniciar" manualmente cada día.
async function reanudarCampanasAutomaticas() {
  const candidatas = store.getCampaignsPausadasAutomaticas();
  if (!candidatas.length) return 0;
  if (!dentroDeVentana()) return 0; // ninguna automática puede arrancar fuera de horario
  const dailyLimit = getDailyLimit();
  if (sentToday() >= dailyLimit) return 0; // el tope diario es compartido por el número
  let reanudadas = 0;
  for (const c of candidatas) {
    if (isCampaignRunning(c.id)) continue;
    console.log(`[Campaign ${c.id}] Reanudando automáticamente (pausada por '${c.pause_reason}').`);
    runCampaign(c.id).catch(e => console.error(`[Campaign ${c.id}] error al reanudar:`, e.message));
    reanudadas++;
  }
  return reanudadas;
}

function isCampaignRunning(campaignId) { return runningCampaigns.has(campaignId); }

module.exports = {
  runCampaign, isCampaignRunning, sentToday, getDailyLimit, getMps,
  resumePendingCampaigns, reanudarCampanasAutomaticas, getWindow,
  preflightCampaign, sendCampaignTest,
};
