/**
 * Meta Ads — Marketing API integration
 * Gestiona campañas, audiencias y métricas de Meta Ads desde el CRM.
 *
 * Requiere en .env:
 *   META_MARKETING_API_TOKEN  — Token permanente con ads_management + ads_read
 *   META_AD_ACCOUNT_ID        — ID de cuenta de anuncios (act_XXXXXXXXX)
 *   META_PIXEL_ID             — ID del Pixel de Meta (opcional, para tracking)
 */

const store = require('../db/store');
const cache = require('./meta-ads-cache');

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const REQUEST_TIMEOUT_MS = 15000;

// ─── Configuración ───────────────────────────────────────────
// Prioridad: credenciales guardadas desde la UI (Configuración → Meta Ads, cifradas
// con crypto-vault) > variables de entorno. Así se puede rotar el token o cambiar de
// cuenta sin editar .env ni redesplegar — antes era la única forma de configurarlo.
function getConfig() {
  let token = process.env.META_MARKETING_API_TOKEN || '';
  let accountId = process.env.META_AD_ACCOUNT_ID || '';
  let pixelId = process.env.META_PIXEL_ID || '';
  let pageId = process.env.FACEBOOK_PAGE_ID || '';
  try {
    const encToken = store.getConfig('meta_ads_token_enc');
    if (encToken) token = require('./crypto-vault').decrypt(encToken);
    const storedAccount = store.getConfig('meta_ads_account_id');
    if (storedAccount) accountId = storedAccount;
    const storedPixel = store.getConfig('meta_ads_pixel_id');
    if (storedPixel) pixelId = storedPixel;
    const storedPage = store.getConfig('meta_ads_page_id');
    if (storedPage) pageId = storedPage;
  } catch (e) {
    // VIDA_MASTER_KEY ausente u otro fallo del vault — cae silenciosamente a env,
    // que es el comportamiento de siempre antes de que existiera esta opción.
  }
  return { token, accountId, pixelId, pageId };
}

function isConfigured() {
  const { token, accountId } = getConfig();
  return !!(token && accountId);
}

// ─── Errores tipados de la Graph API ──────────────────────────
// Antes cualquier fallo (token vencido, rate limit, cuenta suspendida, timeout de
// red) llegaba al cliente como un 500 genérico con el mensaje crudo de Meta. Con esto
// las rutas pueden mapear cada caso a un código HTTP con sentido y un mensaje que el
// panel puede mostrar tal cual.
class MetaApiError extends Error {
  constructor(message, { code, error_subcode, error_user_msg, fbtrace_id, httpStatus } = {}) {
    super(message);
    this.name = 'MetaApiError';
    this.code = code;
    this.error_subcode = error_subcode;
    this.error_user_msg = error_user_msg;
    this.fbtrace_id = fbtrace_id;
    this.httpStatus = httpStatus;
  }
}

// ─── HTTP helper ─────────────────────────────────────────────

async function fetchWithTimeout(url, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new MetaApiError('Timeout esperando respuesta de Meta (15s)', { httpStatus: 504 });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function parseGraphResponse(res) {
  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new MetaApiError(`Meta API respondió ${res.status} sin JSON válido`, { httpStatus: res.status || 502 });
  }
  if (json.error) {
    const err = json.error;
    throw new MetaApiError(err.message || 'Error de Meta API', {
      code: err.code, error_subcode: err.error_subcode,
      error_user_msg: err.error_user_msg, fbtrace_id: err.fbtrace_id,
      httpStatus: res.status,
    });
  }
  if (!res.ok) throw new MetaApiError(`Meta API respondió ${res.status}`, { httpStatus: res.status });
  return json;
}

// opts.cacheTtlMs > 0 activa caché en memoria para esta lectura (invalidada por
// cualquier mutación vía cache.invalidate). opts.fresh=true la ignora.
async function graphGet(path, params = {}, opts = {}) {
  const { token } = getConfig();
  if (!token) throw new MetaApiError('META_MARKETING_API_TOKEN no configurado', { httpStatus: 503 });
  if (opts.cacheTtlMs && !opts.fresh) {
    const hit = cache.get(path, params);
    if (hit !== undefined) return hit;
  }
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetchWithTimeout(url.toString());
  const json = await parseGraphResponse(res);
  if (opts.cacheTtlMs) cache.set(path, params, json, opts.cacheTtlMs);
  return json;
}

async function graphPost(path, body = {}) {
  const { token } = getConfig();
  if (!token) throw new MetaApiError('META_MARKETING_API_TOKEN no configurado', { httpStatus: 503 });
  const url = `${GRAPH_BASE}${path}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  const json = await parseGraphResponse(res);
  // Cualquier mutación puede volver obsoleta la caché de campañas/adsets/ads/cuenta —
  // el prefijo vacío invalida todo; es barato (la cuenta es pequeña) y a prueba de
  // olvidos de invalidar la ruta exacta que cambió.
  cache.clear();
  return json;
}

// Como graphPost pero para multipart/form-data (subida de video) — la Graph API no
// acepta el body de video como JSON.
async function graphPostForm(path, formData) {
  const { token } = getConfig();
  if (!token) throw new MetaApiError('META_MARKETING_API_TOKEN no configurado', { httpStatus: 503 });
  formData.append('access_token', token);
  const url = `${GRAPH_BASE}${path}`;
  const res = await fetchWithTimeout(url, { method: 'POST', body: formData });
  const json = await parseGraphResponse(res);
  cache.clear();
  return json;
}

async function graphDelete(path) {
  const { token } = getConfig();
  if (!token) throw new MetaApiError('META_MARKETING_API_TOKEN no configurado', { httpStatus: 503 });
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set('access_token', token);
  const res = await fetchWithTimeout(url.toString(), { method: 'DELETE' });
  const json = await parseGraphResponse(res);
  cache.clear();
  return json;
}

// ─── Campañas ────────────────────────────────────────────────

/**
 * Listar todas las campañas de la cuenta con métricas básicas.
 * Antes esto hacía 1 llamada por campaña para insights + otra ronda de adsets/ads
 * por campaña para cruzar leads reales (~45 llamadas a Graph con 5 campañas) — ahora
 * son 3 llamadas fijas sin importar cuántas campañas haya: la lista, los insights
 * agregados de toda la cuenta en un solo request (level=campaign), y los ads de toda
 * la cuenta con su campaign_id para cruzar contra los leads reales del CRM en una
 * única consulta SQL agrupada.
 */
async function getCampaigns() {
  const { accountId } = getConfig();
  const data = await graphGet(`/${accountId}/campaigns`, {
    fields: 'id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time',
    limit: 100,
  }, { cacheTtlMs: 60000 });
  const campaigns = data.data || [];
  if (!campaigns.length) return [];

  let insightsByCampaign = {};
  try {
    const insightsData = await graphGet(`/${accountId}/insights`, {
      level: 'campaign',
      fields: 'campaign_id,impressions,clicks,spend,actions,ctr,cpc,cpm',
      date_preset: 'last_30d',
      limit: 200,
    }, { cacheTtlMs: 60000 });
    (insightsData.data || []).forEach(row => { insightsByCampaign[row.campaign_id] = row; });
  } catch (e) {
    console.error('[META-ADS] Error obteniendo insights agregados:', e.message);
  }

  // leads/cpl "oficiales" = conteo REAL del CRM (ad_id atribuido vía referral del
  // webhook), no lo que Meta reporta en `actions` — es la cifra que debe guiar
  // presupuesto. leadsMeta/cplMeta quedan como referencia/comparación.
  let leadsByCampaign = {};
  try {
    const adsData = await graphGet(`/${accountId}/ads`, {
      fields: 'id,campaign_id',
      limit: 500,
    }, { cacheTtlMs: 60000 });
    const campaignIdByAdId = {};
    (adsData.data || []).forEach(ad => { campaignIdByAdId[ad.id] = ad.campaign_id; });
    const leadCountsByAdId = store.getLeadCountsByAdIds(Object.keys(campaignIdByAdId), 30);
    for (const [adId, count] of Object.entries(leadCountsByAdId)) {
      const campId = campaignIdByAdId[adId];
      if (campId) leadsByCampaign[campId] = (leadsByCampaign[campId] || 0) + count;
    }
  } catch (e) {
    console.error('[META-ADS] No se pudo cruzar leads reales del CRM:', e.message);
  }

  return campaigns.map(c => {
    const m = insightsByCampaign[c.id] || {};
    const leadsMeta = extractLeads(m.actions);
    const spend = parseFloat(m.spend || 0);
    const leads = leadsByCampaign[c.id] || 0;
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      daily_budget: c.daily_budget,
      lifetime_budget: c.lifetime_budget,
      created_time: c.created_time,
      updated_time: c.updated_time,
      metrics: {
        impressions: parseInt(m.impressions || 0),
        clicks: parseInt(m.clicks || 0),
        spend,
        leads,
        leadsMeta,
        ctr: parseFloat(m.ctr || 0),
        cpc: parseFloat(m.cpc || 0),
        cpm: parseFloat(m.cpm || 0),
        cpl: leads > 0 ? spend / leads : 0,
        cplMeta: leadsMeta > 0 ? spend / leadsMeta : 0,
      },
    };
  });
}

/**
 * Obtener detalle de una campaña con métricas.
 */
async function getCampaignById(campaignId) {
  const data = await graphGet(`/${campaignId}`, {
    fields: 'id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time,adsets{name,status,daily_budget,targeting}',
  });

  let metrics = null;
  try {
    const insights = await graphGet(`/${campaignId}/insights`, {
      fields: 'impressions,clicks,spend,actions,ctr,cpc,cpm,reach,frequency',
      date_preset: 'last_30d',
      limit: 1,
    });
    const m = (insights.data && insights.data[0]) || {};
    const leadsMeta = extractLeads(m.actions);
    const spend = parseFloat(m.spend || 0);
    let leads = leadsMeta;
    try {
      const real = await getCampaignRealLeads(campaignId, 30);
      leads = real.leadsCRM;
    } catch (e) {
      console.error(`[META-ADS] No se pudo cruzar leads reales del CRM para ${campaignId}:`, e.message);
    }
    metrics = {
      impressions: parseInt(m.impressions || 0),
      clicks: parseInt(m.clicks || 0),
      reach: parseInt(m.reach || 0),
      frequency: parseFloat(m.frequency || 0),
      spend,
      leads,
      leadsMeta,
      ctr: parseFloat(m.ctr || 0),
      cpc: parseFloat(m.cpc || 0),
      cpm: parseFloat(m.cpm || 0),
      cpl: leads > 0 ? spend / leads : 0,
      cplMeta: leadsMeta > 0 ? spend / leadsMeta : 0,
    };
  } catch (e) {
    console.error(`[META-ADS] Error métricas campaña ${campaignId}:`, e.message);
  }

  return { ...data, metrics };
}

/**
 * Obtener métricas diarias de una campaña (últimos N días).
 */
async function getCampaignInsights(campaignId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];
  const untilStr = new Date().toISOString().split('T')[0];

  const data = await graphGet(`/${campaignId}/insights`, {
    fields: 'impressions,clicks,spend,actions,ctr,cpc,cpm,reach,frequency',
    time_range: JSON.stringify({ since: sinceStr, until: untilStr }),
    time_increment: 1,
    limit: days + 5,
  });

  return (data.data || []).map(d => {
    const leads = extractLeads(d.actions);
    const spend = parseFloat(d.spend || 0);
    return {
      date: d.date_start,
      impressions: parseInt(d.impressions || 0),
      clicks: parseInt(d.clicks || 0),
      reach: parseInt(d.reach || 0),
      frequency: parseFloat(d.frequency || 0),
      spend,
      leads,
      ctr: parseFloat(d.ctr || 0),
      cpc: parseFloat(d.cpc || 0),
      cpm: parseFloat(d.cpm || 0),
      cpl: leads > 0 ? spend / leads : 0,
    };
  });
}

/**
 * Pausar una campaña.
 */
async function pauseCampaign(campaignId) {
  return graphPost(`/${campaignId}`, { status: 'PAUSED' });
}

/**
 * Reanudar una campaña.
 */
async function resumeCampaign(campaignId) {
  return graphPost(`/${campaignId}`, { status: 'ACTIVE' });
}

// ─── Drill-down completo: campaña → adsets → ads en 1 llamada ─
// Antes no existía ninguna vista de conjuntos de anuncios ni de anuncios individuales
// en el panel — getAdSets()/getAds() estaban listos en el backend pero nadie los
// llamaba. Esto arma el árbol completo con el field-expansion anidado de la propia
// Graph API (adsets.limit(50){...ads.limit(50){...}}), así que es 1 sola llamada de
// red para toda la campaña en vez de 1 (adsets) + N (ads por adset).
async function getCampaignFull(campaignId) {
  const data = await graphGet(`/${campaignId}`, {
    fields: 'id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time,' +
      'adsets.limit(50){id,name,status,daily_budget,lifetime_budget,targeting,optimization_goal,billing_event,start_time,end_time,' +
      'ads.limit(50){id,name,status,creative{image_url,thumbnail_url,title,body}}}',
  }, { cacheTtlMs: 30000 });

  let metrics = null;
  try {
    const insights = await graphGet(`/${campaignId}/insights`, {
      fields: 'impressions,clicks,spend,actions,ctr,cpc,cpm,reach,frequency',
      date_preset: 'last_30d',
      limit: 1,
    }, { cacheTtlMs: 60000 });
    const m = (insights.data && insights.data[0]) || {};
    const leadsMeta = extractLeads(m.actions);
    const spend = parseFloat(m.spend || 0);
    let leads = leadsMeta;
    try {
      const real = await getCampaignRealLeads(campaignId, 30);
      leads = real.leadsCRM;
    } catch (e) { /* deja leads = leadsMeta como fallback */ }
    metrics = {
      impressions: parseInt(m.impressions || 0), clicks: parseInt(m.clicks || 0),
      reach: parseInt(m.reach || 0), frequency: parseFloat(m.frequency || 0),
      spend, leads, leadsMeta,
      ctr: parseFloat(m.ctr || 0), cpc: parseFloat(m.cpc || 0), cpm: parseFloat(m.cpm || 0),
      cpl: leads > 0 ? spend / leads : 0, cplMeta: leadsMeta > 0 ? spend / leadsMeta : 0,
    };
  } catch (e) {
    console.error(`[META-ADS] Error métricas campaña ${campaignId}:`, e.message);
  }

  const { adsets, ...campaignFields } = data;
  return { ...campaignFields, adsets: (adsets && adsets.data) || [], metrics };
}

/**
 * Edita nombre/estado/presupuesto de una campaña. El presupuesto es CBO-aware: si la
 * cuenta usa Advantage Campaign Budget (el presupuesto vive en la campaña misma —
 * detectable porque daily_budget/lifetime_budget vienen no-nulos en el objeto
 * campaign), se edita ahí; si no, Meta lo tiene en el adset y hay que editarlo ahí
 * (se aplica al primero — hoy el flujo de creación solo genera un adset por
 * campaña; si hay más de uno se avisa en el log para no editar a ciegas).
 */
async function updateCampaign(campaignId, fields) {
  const body = {};
  if (fields.name !== undefined) body.name = fields.name;
  if (fields.status !== undefined) body.status = fields.status;

  if (fields.dailyBudget !== undefined || fields.lifetimeBudget !== undefined) {
    const camp = await graphGet(`/${campaignId}`, { fields: 'daily_budget,lifetime_budget' }, { fresh: true });
    const hasCBO = camp.daily_budget != null || camp.lifetime_budget != null;
    if (hasCBO) {
      if (fields.dailyBudget !== undefined) body.daily_budget = fields.dailyBudget;
      if (fields.lifetimeBudget !== undefined) body.lifetime_budget = fields.lifetimeBudget;
    } else {
      const adsets = await getAdSets(campaignId);
      if (!adsets.length) throw new MetaApiError('La campaña no tiene conjuntos de anuncios para aplicar el presupuesto', { httpStatus: 400 });
      const adsetBody = {};
      if (fields.dailyBudget !== undefined) adsetBody.daily_budget = fields.dailyBudget;
      if (fields.lifetimeBudget !== undefined) adsetBody.lifetime_budget = fields.lifetimeBudget;
      await graphPost(`/${adsets[0].id}`, adsetBody);
      if (adsets.length > 1) {
        console.warn(`[META-ADS] Campaña ${campaignId} tiene ${adsets.length} adsets sin CBO — solo se actualizó el presupuesto del primero (${adsets[0].id})`);
      }
    }
  }

  if (Object.keys(body).length) await graphPost(`/${campaignId}`, body);
  return { ok: true };
}

/** Duplica una campaña completa (adsets + ads + creativos) — siempre en PAUSED. */
async function duplicateCampaign(campaignId) {
  return graphPost(`/${campaignId}/copies`, { deep_copy: true, status_option: 'PAUSED' });
}

/** Archiva una campaña (recuperable desde Ads Manager). */
async function archiveCampaign(campaignId) {
  return graphPost(`/${campaignId}`, { status: 'ARCHIVED' });
}

/** Borra una campaña (cascada: adsets y ads quedan DELETED también). */
async function deleteCampaign(campaignId) {
  return graphPost(`/${campaignId}`, { status: 'DELETED' });
}

// ─── Ad Set / Ad individual: detalle y edición ────────────────

async function getAdSetById(adsetId) {
  const data = await graphGet(`/${adsetId}`, {
    fields: 'id,name,status,daily_budget,lifetime_budget,targeting,optimization_goal,billing_event,promoted_object,start_time,end_time,campaign_id',
  });
  let metrics = null;
  try {
    const insights = await graphGet(`/${adsetId}/insights`, {
      fields: 'impressions,clicks,spend,actions,ctr,cpc,cpm,reach,frequency', date_preset: 'last_30d', limit: 1,
    });
    const m = (insights.data && insights.data[0]) || {};
    const leads = extractLeads(m.actions);
    const spend = parseFloat(m.spend || 0);
    metrics = {
      impressions: parseInt(m.impressions || 0), clicks: parseInt(m.clicks || 0),
      reach: parseInt(m.reach || 0), frequency: parseFloat(m.frequency || 0),
      spend, leads, ctr: parseFloat(m.ctr || 0), cpc: parseFloat(m.cpc || 0), cpm: parseFloat(m.cpm || 0),
      cpl: leads > 0 ? spend / leads : 0,
    };
  } catch (e) {
    console.error(`[META-ADS] Error métricas adset ${adsetId}:`, e.message);
  }
  return { ...data, metrics };
}

/** Edita nombre/estado/presupuesto/targeting/fecha de fin de un conjunto de anuncios. */
async function updateAdSet(adsetId, fields) {
  const body = {};
  if (fields.name !== undefined) body.name = fields.name;
  if (fields.status !== undefined) body.status = fields.status;
  if (fields.dailyBudget !== undefined) body.daily_budget = fields.dailyBudget;
  if (fields.lifetimeBudget !== undefined) body.lifetime_budget = fields.lifetimeBudget;
  if (fields.endTime !== undefined) body.end_time = fields.endTime;
  if (fields.targeting !== undefined) body.targeting = fields.targeting;
  if (!Object.keys(body).length) throw new MetaApiError('Nada que actualizar', { httpStatus: 400 });
  return graphPost(`/${adsetId}`, body);
}

/** Edita nombre/estado de un anuncio individual. */
async function updateAd(adId, fields) {
  const body = {};
  if (fields.name !== undefined) body.name = fields.name;
  if (fields.status !== undefined) body.status = fields.status;
  if (!Object.keys(body).length) throw new MetaApiError('Nada que actualizar', { httpStatus: 400 });
  return graphPost(`/${adId}`, body);
}

/** Preview real del anuncio tal como lo vería el usuario final (iframe de Meta). */
async function getAdPreview(adId, adFormat) {
  const data = await graphGet(`/${adId}/previews`, { ad_format: adFormat || 'MOBILE_FEED_STANDARD' });
  return (data.data && data.data[0]) || null;
}

// ─── Creación de campañas Click-to-WhatsApp ───────────────────
// Todo lo que sigue crea objetos SIEMPRE en status:'PAUSED' — nunca se manda 'ACTIVE'
// desde ningún punto de este bloque, ni se acepta como parámetro. Activar gasto real
// es una decisión que toma el admin a mano en Meta Ads Manager (o con resumeCampaign,
// ya arriba) después de revisar que quedó bien armado — no algo que este código decida.

function getAccountInfo() {
  const { accountId } = getConfig();
  // min_daily_budget faltaba aquí — el front lo lee para mostrar el mínimo permitido
  // en el wizard de creación, pero como nunca se pedía, el hint nunca aparecía.
  return graphGet(`/${accountId}`, { fields: 'name,account_status,currency,spend_cap,amount_spent,min_daily_budget' }, { cacheTtlMs: 60000 });
}

/**
 * Crea la campaña (nivel superior). Objetivo fijo OUTCOME_LEADS + destino WhatsApp,
 * que es el único tipo de campaña que usa hoy esta cuenta — no un creador genérico de
 * cualquier objetivo de Meta Ads.
 * special_ad_categories: [] es correcto para Colombia — esa restricción (HOUSING/CREDIT/
 * EMPLOYMENT) es una exigencia legal de EE.UU., no aplica a targeting solo-Colombia. Si
 * algún día se targetea EE.UU. con estos lotes, esto hay que revisarlo.
 */
async function createCampaign({ name }) {
  const { accountId } = getConfig();
  if (!name || !name.trim()) throw new Error('Falta el nombre de la campaña');
  return graphPost(`/${accountId}/campaigns`, {
    name: name.trim(),
    objective: 'OUTCOME_LEADS',
    status: 'PAUSED',
    special_ad_categories: [],
  });
}

/**
 * Construye el bloque `targeting` a partir de ciudades ya resueltas por buscarUbicaciones()
 * (necesitan `key` + `radius`, no solo el nombre — Meta exige el ID geográfico exacto).
 */
function buildTargeting({ cities, ageMin, ageMax }) {
  if (!Array.isArray(cities) || !cities.length) throw new Error('Selecciona al menos una ciudad');
  return {
    age_min: ageMin || 18,
    age_max: ageMax || 65,
    geo_locations: {
      cities: cities.map(c => ({ key: c.key, radius: c.radius || 17, distance_unit: 'kilometer' })),
      location_types: ['frequently_in', 'home', 'recent'],
    },
    targeting_automation: { advantage_audience: 1 },
  };
}

/**
 * Busca ciudades/ubicaciones por nombre para el paso de segmentación del asistente —
 * el admin escribe "Girardot" y esto devuelve las coincidencias con su `key` real, que
 * es lo que exige `buildTargeting()`. Sin esto no hay forma de armar el targeting bien:
 * un nombre de ciudad escrito a mano no sirve, Meta necesita el ID geográfico.
 */
async function buscarUbicaciones(q) {
  if (!q || q.trim().length < 2) return [];
  const data = await graphGet('/search', {
    type: 'adgeolocation', location_types: JSON.stringify(['city']), q: q.trim(), limit: 12,
  });
  return (data.data || []).map(d => ({ key: d.key, name: d.name, region: d.region, country: d.country_code }));
}

/**
 * Busca intereses para el targeting avanzado (typeahead del wizard) — antes el
 * creador de campañas solo aceptaba ciudad + edad, sin ninguna forma de segmentar
 * por interés. El `id` devuelto es lo que espera `targeting.flexible_spec`.
 */
async function searchInterests(q) {
  if (!q || q.trim().length < 2) return [];
  const data = await graphGet('/search', {
    type: 'adinterest', q: q.trim(), limit: 15,
  });
  return (data.data || []).map(d => ({ id: d.id, name: d.name, audience_size: d.audience_size_lower_bound || d.audience_size }));
}

/**
 * Alcance estimado en vivo para el targeting armado hasta el momento — el paso de
 * segmentación del wizard antes no tenía ninguna señal de si el público elegido era
 * razonable (ni un número) hasta después de crear la campaña.
 */
async function estimateReach(targeting, optimizationGoal) {
  const { accountId } = getConfig();
  const data = await graphGet(`/${accountId}/delivery_estimate`, {
    optimization_goal: optimizationGoal || 'CONVERSATIONS',
    targeting_spec: JSON.stringify(targeting),
  });
  const est = (data.data && data.data[0]) || null;
  if (!est) return { available: false };
  return {
    available: true,
    usersLower: est.estimate_dau_lower_bound || est.estimate_mau_lower_bound || null,
    usersUpper: est.estimate_dau_upper_bound || est.estimate_mau_upper_bound || null,
  };
}

/**
 * Conjunto de anuncios con destino WhatsApp — `promoted_object.page_id` y
 * `destination_type: 'WHATSAPP'` son lo que le dice a Meta "manda a la gente a escribir
 * por WhatsApp", el mismo patrón que ya usan los adsets reales de esta cuenta
 * (AS01/AS02 con targeting por ciudad — ver getAdSets() de una campaña real).
 *
 * Presupuesto: confirmado contra la cuenta real (GET /act_.../?fields=currency,
 * min_daily_budget → currency: COP, min_daily_budget: 3233) que Meta NO multiplica el
 * peso colombiano por 100 como hace con USD/EUR — el valor que se manda es la cifra en
 * pesos tal cual, sin transformar. Confirmado también con los adsets reales de esta
 * cuenta, que tienen `lifetime_budget: "125000"` — 125.000 COP totales, coherente con el
 * gasto real observado ($41.578 acumulado), no 12,5 millones (lo que daría si estuviera
 * ×100). Por eso `budgetCOP` abajo se manda directo, sin escalar.
 *
 * Los adsets reales de esta cuenta (AS01...8D, AS02...7D) usan LIFETIME budget con fecha
 * de fin — un presupuesto total para un número de días fijo, no un gasto diario
 * indefinido — así que ese es el modo por defecto aquí. `daily_budget` sigue disponible
 * para quien prefiera una campaña sin fecha de fin (`durationDays` en null/0).
 */
async function createAdSet({ campaignId, name, budgetCOP, durationDays, targeting, pageId }) {
  const { accountId } = getConfig();
  const fbPageId = pageId || getConfig().pageId;
  if (!campaignId) throw new Error('Falta campaignId');
  if (!name || !name.trim()) throw new Error('Falta el nombre del conjunto de anuncios');
  if (!budgetCOP || budgetCOP <= 0) throw new Error('Presupuesto inválido');
  if (!fbPageId) throw new Error('Falta el Page ID (Configuración → Meta Ads o FACEBOOK_PAGE_ID en .env) — el destino WhatsApp lo necesita');

  const body = {
    name: name.trim(),
    campaign_id: campaignId,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'CONVERSATIONS',
    destination_type: 'WHATSAPP',
    promoted_object: { page_id: fbPageId },
    targeting,
    status: 'PAUSED',
  };
  if (durationDays && Number(durationDays) > 0) {
    // lifetime_budget EXIGE start_time/end_time — sin fecha de fin Meta lo rechaza
    // (un presupuesto "total" no significa nada sin saber en cuántos días se reparte).
    const start = new Date();
    const end = new Date(start.getTime() + Number(durationDays) * 24 * 60 * 60 * 1000);
    body.lifetime_budget = budgetCOP;
    body.start_time = start.toISOString();
    body.end_time = end.toISOString();
  } else {
    body.daily_budget = budgetCOP;
  }
  return graphPost(`/${accountId}/adsets`, body);
}

/**
 * Sube una imagen (base64, sin el prefijo data:...) al catálogo de imágenes de la cuenta
 * — devuelve el `hash` que necesita createAdCreative(). Paso obligatorio previo: Meta no
 * acepta una imagen "suelta" en el creativo, solo un hash ya subido o una URL pública.
 */
async function uploadAdImage(base64Data, filename) {
  const { accountId } = getConfig();
  if (!base64Data) throw new Error('Falta la imagen');
  const data = await graphPost(`/${accountId}/adimages`, {
    bytes: base64Data,
  });
  // La respuesta trae { images: { "<filename>": { hash, url, ... } } } — la key es el
  // nombre que Meta le asignó internamente, no necesariamente el que mandamos.
  const images = data.images || {};
  const first = Object.values(images)[0];
  if (!first) throw new Error('Meta no devolvió la imagen subida — respuesta: ' + JSON.stringify(data));
  return { hash: first.hash, url: first.url };
}

/** Sube varias imágenes de una — necesario para el carrusel (2-10 tarjetas). */
async function uploadAdImages(imagesBase64) {
  const results = [];
  for (const b64 of imagesBase64) {
    results.push(await uploadAdImage(b64));
  }
  return results;
}

// ─── Video (advideos) ──────────────────────────────────────────
// Antes no existía NINGUNA forma de subir video — solo imagen estática. Simple para
// archivos pequeños (multipart directo); por encima de SIMPLE_UPLOAD_MAX_BYTES, la
// API exige el protocolo resumable de 3 fases (start/transfer/finish) que Meta
// documenta para /advideos — sin esto Meta rechaza el archivo completo de un golpe.
const SIMPLE_UPLOAD_MAX_BYTES = 50 * 1024 * 1024; // 50MB
const VIDEO_CHUNK_BYTES = 4 * 1024 * 1024; // 4MB por chunk

async function uploadAdVideoSimple(buffer, filename) {
  const { accountId } = getConfig();
  const form = new FormData();
  form.append('source', new Blob([buffer]), filename || 'video.mp4');
  const data = await graphPostForm(`/${accountId}/advideos`, form);
  return { videoId: data.id };
}

async function uploadAdVideoChunked(buffer, filename) {
  const { accountId } = getConfig();

  let form = new FormData();
  form.append('upload_phase', 'start');
  form.append('file_size', String(buffer.length));
  let resp = await graphPostForm(`/${accountId}/advideos`, form);
  const uploadSessionId = resp.upload_session_id;
  const videoId = resp.video_id;
  let start = Number(resp.start_offset), end = Number(resp.end_offset);

  // Bucle de transferencia: Meta indica en cada respuesta el siguiente rango exacto
  // que espera (start_offset/end_offset) — no es un tamaño de chunk fijo garantizado.
  while (start < end) {
    const chunk = buffer.subarray(start, end);
    form = new FormData();
    form.append('upload_phase', 'transfer');
    form.append('upload_session_id', uploadSessionId);
    form.append('start_offset', String(start));
    form.append('video_file_chunk', new Blob([chunk]), filename || 'video.mp4');
    resp = await graphPostForm(`/${accountId}/advideos`, form);
    start = Number(resp.start_offset);
    end = Number(resp.end_offset);
  }

  form = new FormData();
  form.append('upload_phase', 'finish');
  form.append('upload_session_id', uploadSessionId);
  await graphPostForm(`/${accountId}/advideos`, form);
  return { videoId };
}

/** Sube un video — simple si cabe en un solo request, resumable si no. */
async function uploadAdVideo(buffer, filename) {
  if (!buffer || !buffer.length) throw new Error('Falta el video');
  return buffer.length <= SIMPLE_UPLOAD_MAX_BYTES
    ? uploadAdVideoSimple(buffer, filename)
    : uploadAdVideoChunked(buffer, filename);
}

/** Meta procesa el video de forma asíncrona — el front hace polling con esto hasta 'ready'. */
async function getVideoStatus(videoId) {
  const data = await graphGet(`/${videoId}`, { fields: 'status,picture' }, { fresh: true });
  const st = data.status && data.status.video_status;
  return {
    status: st || 'unknown',
    ready: st === 'ready',
    processingProgress: data.status && data.status.processing_progress,
    thumbnailUrl: data.picture,
  };
}

/** Preview del anuncio ANTES de crear nada — paso de revisión del wizard. */
async function generatePreview(creativeSpec, adFormat) {
  const { accountId } = getConfig();
  const data = await graphGet(`/${accountId}/generatepreviews`, {
    creative: JSON.stringify(creativeSpec),
    ad_format: adFormat || 'MOBILE_FEED_STANDARD',
  }, { fresh: true });
  return (data.data && data.data[0]) || null;
}

/**
 * Creativo con el botón "Enviar mensaje" hacia WhatsApp — mismo patrón documentado por
 * Meta para Click-to-WhatsApp Ads (call_to_action WHATSAPP_MESSAGE + app_destination).
 */
async function createAdCreative({ name, message, imageHash, pageId }) {
  const { accountId } = getConfig();
  const fbPageId = pageId || getConfig().pageId;
  if (!fbPageId) throw new Error('Falta el Page ID (Configuración → Meta Ads o FACEBOOK_PAGE_ID en .env)');
  if (!message || !message.trim()) throw new Error('Falta el texto del anuncio');
  return graphPost(`/${accountId}/adcreatives`, {
    name: name || 'Creativo SP Leons',
    object_story_spec: {
      page_id: fbPageId,
      link_data: {
        message: message.trim(),
        link: 'https://www.facebook.com/' + fbPageId,
        image_hash: imageHash || undefined,
        call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } },
      },
    },
  });
}

/** El anuncio final que junta adset + creativo. Siempre PAUSED — ver nota arriba del bloque. */
async function createAd({ name, adsetId, creativeId }) {
  const { accountId } = getConfig();
  if (!adsetId) throw new Error('Falta adsetId');
  if (!creativeId) throw new Error('Falta creativeId');
  return graphPost(`/${accountId}/ads`, {
    name: name || 'Anuncio SP Leons',
    adset_id: adsetId,
    creative: { creative_id: creativeId },
    status: 'PAUSED',
  });
}

/**
 * Orquesta el flujo completo del asistente: campaña → adset → imagen → creativo → anuncio.
 * Si un paso falla a mitad de camino, NO se hace rollback de lo ya creado — queda en Meta
 * como un objeto PAUSED huérfano, visible y borrable a mano en Ads Manager (nunca gasta
 * nada estando pausado). Se devuelve qué se alcanzó a crear para que quede claro qué
 * limpiar si algo salió mal, en vez de perder el rastro del error.
 */
async function createWhatsAppCampaign(input) {
  const result = { campaign: null, adset: null, image: null, creative: null, ad: null };
  result.campaign = await createCampaign({ name: input.campaignName });
  const targeting = buildTargeting(input.targeting);
  result.adset = await createAdSet({
    campaignId: result.campaign.id,
    name: input.adsetName || input.campaignName + ' · AdSet',
    budgetCOP: input.budgetCOP,
    durationDays: input.durationDays,
    targeting,
    pageId: input.pageId,
  });
  if (input.imageBase64) {
    result.image = await uploadAdImage(input.imageBase64);
  }
  result.creative = await createAdCreative({
    name: input.campaignName + ' · Creativo',
    message: input.adMessage,
    imageHash: result.image ? result.image.hash : null,
    pageId: input.pageId,
  });
  result.ad = await createAd({
    name: input.campaignName + ' · Anuncio',
    adsetId: result.adset.id,
    creativeId: result.creative.id,
  });
  return result;
}

// ─── Creación avanzada (Fase 2/3): objetivo elegible, targeting completo, ─────
// ─── imagen/video/carrusel, rollback real si algo falla a mitad de camino ─────

/**
 * Arma el bloque `targeting` completo a partir del payload del wizard avanzado —
 * a diferencia de buildTargeting() (solo ciudad+edad, usado por el flujo legacy de
 * WhatsApp), esto soporta género, intereses, custom audiences (incluidas
 * exclusiones) y placements manuales.
 */
function buildAdvancedTargeting(t) {
  if (!t || !Array.isArray(t.cities) || !t.cities.length) throw new Error('Selecciona al menos una ciudad');
  const targeting = {
    age_min: t.ageMin || 18,
    age_max: t.ageMax || 65,
    geo_locations: {
      cities: t.cities.map(c => ({ key: c.key, radius: c.radius || 17, distance_unit: 'kilometer' })),
      location_types: ['frequently_in', 'home', 'recent'],
    },
  };
  if (Array.isArray(t.genders) && t.genders.length) targeting.genders = t.genders;
  if (Array.isArray(t.interests) && t.interests.length) {
    targeting.flexible_spec = [{ interests: t.interests.map(i => ({ id: i.id, name: i.name })) }];
  }
  if (Array.isArray(t.customAudienceIds) && t.customAudienceIds.length) {
    targeting.custom_audiences = t.customAudienceIds.map(id => ({ id }));
  }
  if (Array.isArray(t.excludedCustomAudienceIds) && t.excludedCustomAudienceIds.length) {
    targeting.excluded_custom_audiences = t.excludedCustomAudienceIds.map(id => ({ id }));
  }
  if (Array.isArray(t.publisherPlatforms) && t.publisherPlatforms.length) {
    targeting.publisher_platforms = t.publisherPlatforms;
  } else {
    // Sin selección manual, dejar que Advantage+ optimice placements automáticamente
    // (mismo comportamiento que el flujo legacy).
    targeting.targeting_automation = { advantage_audience: 1 };
  }
  return targeting;
}

/** El object_story_spec según el tipo de creativo — imagen, video o carrusel. */
function buildCreativeSpec({ creative, pageId, destination }) {
  const fbPageId = pageId || getConfig().pageId;
  if (!fbPageId) throw new Error('Falta el Page ID (Configuración → Meta Ads o FACEBOOK_PAGE_ID en .env)');
  const cta = { type: creative.cta || (destination === 'whatsapp' ? 'WHATSAPP_MESSAGE' : 'LEARN_MORE') };
  if (destination === 'whatsapp') cta.value = { app_destination: 'WHATSAPP' };
  else if (creative.linkUrl) cta.value = { link: creative.linkUrl };

  const base = {
    message: creative.primaryText || '',
    name: creative.headline || undefined,
    description: creative.description || undefined,
    call_to_action: cta,
  };
  if (destination !== 'whatsapp') base.link = creative.linkUrl || ('https://www.facebook.com/' + fbPageId);
  else base.link = 'https://www.facebook.com/' + fbPageId;

  if (creative.type === 'video') {
    if (!creative.videoId) throw new Error('Falta el video (videoId)');
    return {
      page_id: fbPageId,
      video_data: {
        video_id: creative.videoId,
        image_hash: creative.thumbnailHash || undefined,
        title: creative.headline || undefined,
        message: creative.primaryText || '',
        call_to_action: cta,
      },
    };
  }
  if (creative.type === 'carousel') {
    if (!Array.isArray(creative.cards) || creative.cards.length < 2) throw new Error('El carrusel necesita al menos 2 tarjetas');
    return {
      page_id: fbPageId,
      link_data: {
        ...base,
        child_attachments: creative.cards.map(c => ({
          link: base.link, image_hash: c.imageHash, name: c.headline, description: c.description,
        })),
      },
    };
  }
  // imagen (default)
  if (!Array.isArray(creative.imageHashes) || !creative.imageHashes.length) throw new Error('Falta la imagen');
  return { page_id: fbPageId, link_data: { ...base, image_hash: creative.imageHashes[0] } };
}

/**
 * Creador avanzado: objetivo elegible, presupuesto diario o total, targeting
 * completo, creativo imagen/video/carrusel con CTA/titular/descripción propios.
 * Todo PAUSED. Si algún paso posterior a la creación de la campaña falla, se hace
 * ROLLBACK REAL (status:'DELETED' en cascada) — a diferencia de createWhatsAppCampaign
 * (el flujo legacy, que deja el objeto huérfano a propósito documentado), aquí el
 * usuario nunca ve un rastro parcial en su cuenta que tenga que limpiar a mano.
 */
async function createAdvancedCampaign(input) {
  const { accountId } = getConfig();
  if (!input.campaignName || !input.campaignName.trim()) throw new Error('Falta el nombre de la campaña');
  if (!input.budgetCOP || Number(input.budgetCOP) <= 0) throw new Error('Presupuesto inválido');

  const created = { campaign: null, adset: null, creative: null, ad: null };
  let rollback = null;
  try {
    created.campaign = await graphPost(`/${accountId}/campaigns`, {
      name: input.campaignName.trim(),
      objective: input.objective || 'OUTCOME_LEADS',
      status: 'PAUSED',
      special_ad_categories: [],
    });

    const targeting = buildAdvancedTargeting(input.targeting);
    const isWhatsapp = input.destination !== 'web';
    const adsetBody = {
      name: (input.adsetName || input.campaignName + ' · AdSet').trim(),
      campaign_id: created.campaign.id,
      billing_event: 'IMPRESSIONS',
      optimization_goal: isWhatsapp ? 'CONVERSATIONS' : 'LINK_CLICKS',
      targeting,
      status: 'PAUSED',
    };
    if (isWhatsapp) {
      const fbPageId = input.pageId || getConfig().pageId;
      if (!fbPageId) throw new Error('Falta el Page ID para destino WhatsApp');
      adsetBody.destination_type = 'WHATSAPP';
      adsetBody.promoted_object = { page_id: fbPageId };
    }
    if (input.budgetMode === 'lifetime' && input.durationDays) {
      const start = input.startTime ? new Date(input.startTime) : new Date();
      const end = new Date(start.getTime() + Number(input.durationDays) * 24 * 60 * 60 * 1000);
      adsetBody.lifetime_budget = input.budgetCOP;
      adsetBody.start_time = start.toISOString();
      adsetBody.end_time = end.toISOString();
    } else {
      adsetBody.daily_budget = input.budgetCOP;
    }
    created.adset = await graphPost(`/${accountId}/adsets`, adsetBody);

    const creativeSpec = buildCreativeSpec({ creative: input.creative, pageId: input.pageId, destination: isWhatsapp ? 'whatsapp' : 'web' });
    created.creative = await graphPost(`/${accountId}/adcreatives`, {
      name: (input.campaignName + ' · Creativo').trim(),
      object_story_spec: creativeSpec,
    });

    created.ad = await graphPost(`/${accountId}/ads`, {
      name: (input.campaignName + ' · Anuncio').trim(),
      adset_id: created.adset.id,
      creative: { creative_id: created.creative.id },
      status: 'PAUSED',
    });

    return { ok: true, created, rollback: null };
  } catch (e) {
    if (created.campaign && created.campaign.id) {
      try {
        await deleteCampaign(created.campaign.id);
        rollback = 'done';
      } catch (rollbackErr) {
        console.error(`[META-ADS] Rollback falló para campaña ${created.campaign.id} — quedó parcial en Meta, revisar a mano:`, rollbackErr.message);
        rollback = 'failed';
      }
    }
    const err = new MetaApiError(e.message, e instanceof MetaApiError ? e : {});
    err.created = created;
    err.rollback = rollback;
    throw err;
  }
}

// ─── Ad Sets ─────────────────────────────────────────────────

/**
 * Listar conjuntos de anuncios de una campaña.
 */
async function getAdSets(campaignId) {
  const data = await graphGet(`/${campaignId}/adsets`, {
    fields: 'id,name,status,daily_budget,targeting,created_time',
    limit: 100,
  });
  return data.data || [];
}

// ─── Anuncios ────────────────────────────────────────────────

/**
 * Listar anuncios de un conjunto de anuncios.
 */
async function getAds(adSetId) {
  const data = await graphGet(`/${adSetId}/ads`, {
    fields: 'id,name,status,creative{image_url,thumbnail_url,title,body},created_time',
    limit: 100,
  });
  return data.data || [];
}

// ─── Audiencias personalizadas ───────────────────────────────

/**
 * Listar audiencias personalizadas de la cuenta.
 */
async function getCustomAudiences() {
  const { accountId } = getConfig();
  // Meta renombró approximate_count (causaba "Tried accessing nonexisting field" y
  // tumbaba TODA la página de Meta Ads, no solo el tab de audiencias — ver
  // renderAudiences() en meta-ads.html, que asumía array y explotaba con el error
  // crudo). Ahora viene como rango — se normaliza al punto medio para no tocar el
  // resto del código que ya espera un solo número `approximate_count`.
  const data = await graphGet(`/${accountId}/customaudiences`, {
    fields: 'id,name,description,approximate_count_lower_bound,approximate_count_upper_bound,tag,status,delivery_info',
    limit: 100,
  });
  return (data.data || []).map(a => ({
    ...a,
    approximate_count: Math.round(((Number(a.approximate_count_lower_bound) || 0) + (Number(a.approximate_count_upper_bound) || 0)) / 2),
  }));
}

/**
 * Crear audiencia personalizada subiendo teléfonos de leads.
 * @param {string} name - Nombre de la audiencia
 * @param {Array<{phone: string, email?: string}>} leads - Leads a subir
 * @returns {object} - { id, name, approximate_count }
 */
async function createCustomAudience(name, leads) {
  const { accountId } = getConfig();
  const validLeads = Array.isArray(leads) ? leads.filter(l => l && (l.phone || l.email)) : [];

  // 1. Crear audiencia vacía
  const audience = await graphPost(`/${accountId}/customaudiences`, {
    name,
    description: `Audiencia creada desde SP CRM — ${validLeads.length} leads`,
    subtype: 'CUSTOMER_LIST',
    data_source: { type: 'MANUALLY_ENTERED' },
  });

  // 2. Subir leads (schema: phone, email) — SOLO si hay alguno. Antes esto se llamaba
  // siempre, incluso con data:[] (leads vacío o no enviado), y Meta rechaza un POST
  // /users con el array vacío → 500 con la audiencia YA creada en Meta, huérfana, sin
  // ningún lead. Si el intento de subir SÍ falla teniendo leads reales, se hace
  // rollback borrando la audiencia recién creada para no dejar basura en la cuenta.
  if (validLeads.length) {
    const schema = ['PHONE', 'EMAIL'];
    const data = validLeads.map(l => {
      const row = [];
      if (l.phone) row.push(normalizePhone(l.phone));
      if (l.email) row.push(l.email.toLowerCase().trim());
      else row.push('');
      return row;
    });
    try {
      await graphPost(`/${audience.id}/users`, { schema, data });
    } catch (e) {
      console.error(`[META-ADS] Falló la subida de leads a la audiencia ${audience.id} — borrándola para no dejarla huérfana:`, e.message);
      try { await deleteCustomAudience(audience.id); } catch (rollbackErr) {
        console.error(`[META-ADS] Rollback también falló — la audiencia ${audience.id} quedó huérfana en Meta, borrar a mano:`, rollbackErr.message);
      }
      throw e;
    }
  }

  return {
    id: audience.id,
    name: audience.name || name,
    approximate_count: validLeads.length,
    status: 'READY',
  };
}

/** Borra una audiencia — usado para el rollback de arriba y disponible como acción directa. */
async function deleteCustomAudience(audienceId) {
  return graphDelete(`/${audienceId}`);
}

/**
 * Agregar leads a una audiencia existente.
 */
async function addToAudience(audienceId, leads) {
  const data = leads.map(l => {
    const row = [];
    if (l.phone) row.push(normalizePhone(l.phone));
    if (l.email) row.push(l.email.toLowerCase().trim());
    else row.push('');
    return row;
  });

  return graphPost(`/${audienceId}/users`, {
    schema: ['PHONE', 'EMAIL'],
    data,
  });
}

/**
 * Eliminar leads de una audiencia (para leads vendidos).
 */
async function removeFromAudience(audienceId, leads) {
  const data = leads.map(l => {
    const row = [];
    if (l.phone) row.push(normalizePhone(l.phone));
    if (l.email) row.push(l.email.toLowerCase().trim());
    else row.push('');
    return row;
  });

  return graphPost(`/${audienceId}/deleteusers`, {
    schema: ['PHONE', 'EMAIL'],
    data,
  });
}

/**
 * Crear audiencia Lookalike basada en una audiencia existente.
 */
async function createLookalike(sourceAudienceId, country = 'CO', ratio = 0.01) {
  const { accountId } = getConfig();
  return graphPost(`/${accountId}/customaudiences`, {
    name: `Lookalike ${country} ${(ratio * 100).toFixed(0)}% — ${new Date().toISOString().split('T')[0]}`,
    subtype: 'LOOKALIKE',
    origin: [{ id: sourceAudienceId, type: 'CUSTOM_AUDIENCE' }],
    country,
    ratio,
  });
}

// ─── Pixel ───────────────────────────────────────────────────

/**
 * Obtener información del Pixel configurado.
 */
async function getPixelInfo() {
  const { pixelId } = getConfig();
  if (!pixelId) return { configured: false };
  try {
    // last_fired_event (y last_fire_time) ya no existen en el objeto Pixel — pedirlos
    // hacía que este endpoint fallara siempre con "(#100) Tried accessing
    // nonexisting field", confirmado en vivo contra la cuenta real. id/name son
    // campos base que cualquier nodo de Graph API soporta.
    const data = await graphGet(`/${pixelId}`, {
      fields: 'id,name',
    }, { cacheTtlMs: 60000 });
    return { configured: true, ...data };
  } catch (e) {
    return { configured: true, id: pixelId, error: e.message };
  }
}

// ─── Conversions API (B3) ─────────────────────────────────────
// Manda a Meta, del lado del servidor, que un lead avanzó a una etapa que de verdad
// importa (agendó cita, compró) — para que optimice la campaña hacia gente que se
// convierte en cliente real, no solo hacia quien hace clic. El Pixel del navegador no
// puede ver esto: la conversación pasa entera por WhatsApp, nunca vuelve al sitio web.
const crypto = require('crypto');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// Meta exige el teléfono en E.164 sin '+', normalizado, antes de hashear — un mismatch
// de formato hace que el hash nunca calce con la identidad real del usuario en Meta.
function normalizePhoneForCapi(phone) {
  let p = String(phone || '').replace(/[^\d]/g, '');
  if (p.length === 10) p = '57' + p; // 10 dígitos sin indicativo -> asumir Colombia
  return p;
}

const CAPI_EVENTOS = { cita: 'Schedule', vendido: 'Purchase' };

// eventKey: 'cita' | 'vendido' — mapea a los eventos estándar de Meta (Schedule/Purchase)
// para que el algoritmo de Meta los reconozca sin configuración extra en Events Manager.
async function sendConversionEvent(eventKey, lead) {
  const { token, pixelId } = getConfig();
  const eventName = CAPI_EVENTOS[eventKey];
  if (!token || !pixelId || !eventName) return { skipped: true };

  const phoneHash = sha256(normalizePhoneForCapi(lead.customer_phone));
  const userData = { ph: [phoneHash] };
  if (lead.ctwa_clid) userData.ctwa_clid = lead.ctwa_clid; // liga el evento al clic del anuncio real

  const body = {
    data: [{
      event_name: eventName,
      // event_time en segundos (epoch) — Meta lo rechaza si viene en milisegundos.
      event_time: Math.floor(Date.now() / 1000),
      // event_id estable: si este envío se reintenta por un error de red, Meta deduplica
      // en vez de contar la conversión dos veces.
      event_id: `lead_${lead.id}_${eventKey}`,
      action_source: 'business_messaging',
      messaging_channel: 'whatsapp',
      user_data: userData,
    }],
  };
  try {
    const data = await graphPost(`/${pixelId}/events`, body);
    console.log(`[META-CAPI] ${eventName} enviado para lead ${lead.id} — respuesta:`, JSON.stringify(data));
    return { ok: true, data };
  } catch (e) {
    console.error(`[META-CAPI] Error enviando ${eventName} para lead ${lead.id}:`, e.message);
    return { ok: false, error: e.message };
  }
}

// ─── Utilidades ──────────────────────────────────────────────

// Suma todas las `actions` que la Graph API reconoce como "el cliente se convirtió en
// lead", sea cual sea el objetivo de la campaña. Un Lead Ads clásico reporta 'lead' u
// 'offsite_conversion.fb_pixel_lead', pero una campaña de Click-to-WhatsApp (como la que
// corre hoy) reporta el inicio de conversación bajo un action_type de mensajería —
// omitirlos es lo que hacía que toda campaña de WhatsApp mostrara "0 leads" sin importar
// cuánta gente escribiera de verdad. Esto es el número que Meta CREE que generó — el
// número que el CRM sabe que generó de verdad se calcula aparte, ver getCampaignAdIds()
// + store.countLeadsByAdIds(), y es el que hay que mirar para decidir presupuesto.
const LEAD_ACTION_TYPES = new Set([
  'lead',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.lead_grouped',
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
  'onsite_conversion.total_messaging_connection',
]);
function extractLeads(actions) {
  if (!actions || !Array.isArray(actions)) return 0;
  return actions
    .filter(a => LEAD_ACTION_TYPES.has(a.action_type))
    .reduce((sum, a) => sum + (parseInt(a.value || 0) || 0), 0);
}

// Resuelve los ad_id de todos los anuncios que pertenecen a una campaña (recorre sus
// adsets). Es lo que permite cruzar el gasto/alcance que reporta Meta contra los leads
// REALES que el CRM ya tiene atribuidos por ad_id (capturados del `referral` del webhook
// de WhatsApp — ver setLeadAdAttribution en db/store.js, eso ya funciona bien).
async function getCampaignAdIds(campaignId) {
  const adsets = await getAdSets(campaignId);
  const adsPorAdset = await Promise.all(adsets.map(as => getAds(as.id).catch(() => [])));
  return adsPorAdset.flat().map(ad => ad.id).filter(Boolean);
}

// Leads y CPL calculados con datos REALES del CRM (no lo que Meta reporta) — cruza los
// ad_id de la campaña contra `leads.ad_id`. Esta es la métrica que debe guiar decisiones
// de presupuesto; `extractLeads()` de arriba queda solo como referencia/comparación.
async function getCampaignRealLeads(campaignId, days) {
  const store = require('../db/store');
  const adIds = await getCampaignAdIds(campaignId);
  return { adIds, leadsCRM: store.countLeadsByAdIds(adIds, days) };
}

function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/[\s\-\(\)\+]/g, '');
  if (p.startsWith('57') && p.length === 12) return p;
  if (p.length === 10) return '57' + p;
  return p;
}

/**
 * Sincronizar leads del CRM como audiencia personalizada.
 * Busca leads activos y los sube a Meta.
 */
async function syncLeadsToAudience(audienceId) {
  // getLeads(false, 2000): activos (status != 'cerrado', ya filtrado por la query) y
  // sin el tope de 500 del default — antes se llamaba sin argumentos y silenciosamente
  // se quedaba corto en cuentas con más de 500 leads. `telefono` tampoco es una
  // columna real de `leads` (es `customer_phone`) — esa rama nunca encontraba nada.
  const leads = store.getLeads ? store.getLeads(false, 2000) : [];
  const mapped = leads.map(l => ({
    phone: l.customer_phone,
    email: l.email || '',
  })).filter(l => l.phone);

  if (mapped.length === 0) return { synced: 0, audienceId };

  await addToAudience(audienceId, mapped);
  return { synced: mapped.length, audienceId };
}

// ─── Comparativa de periodos (Antes vs Ahora) ─────────────────
// El resto del archivo tiene date_preset:'last_30d' clavado en todas partes — esto
// generaliza a un rango [since, until] explícito, reutilizando el mismo shape de
// `metrics` que ya devuelven getCampaigns()/getCampaignFull() para no inventar un
// formato nuevo que el front tenga que aprender aparte.
async function getInsightsRange({ since, until, level } = {}) {
  const { accountId } = getConfig();
  if (!since || !until) throw new Error('Faltan since/until');
  const data = await graphGet(`/${accountId}/insights`, {
    level: level || 'account',
    fields: 'impressions,clicks,spend,actions,ctr,cpc,cpm,reach,frequency',
    time_range: JSON.stringify({ since, until }),
    limit: 200,
  }, { cacheTtlMs: 60000 });
  return data.data || [];
}

// Nota de huso horario: Graph interpreta since/until en el huso de la cuenta
// publicitaria (Bogotá, UTC-5 para esta cuenta); leads.created_at en el CRM se
// guarda en UTC (convención del proyecto — ver CLAUDE.md). Por eso al cruzar contra
// el CRM se traslada el borde del rango +5h antes de comparar contra created_at, o
// los días de borde quedan descuadrados hasta 5 horas.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
function dateOnlyToUtcIso(dateStr, endOfDay) {
  // dateStr: 'YYYY-MM-DD' en horario de Bogotá. endOfDay=true -> 23:59:59.999 local.
  const localMs = Date.parse(dateStr + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'));
  return new Date(localMs + BOGOTA_OFFSET_MS).toISOString();
}

function addDays(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().split('T')[0];
}

function daysBetween(since, until) {
  const a = new Date(since + 'T00:00:00.000Z');
  const b = new Date(until + 'T00:00:00.000Z');
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

// Suma insights (cuenta o por campaña) de un rango + cruza leads reales del CRM por
// ad_id — mismo criterio "fuente de verdad" que getCampaigns()/getCampaignById().
async function summarizeRange(since, until) {
  const { accountId } = getConfig();
  const [insights, adsData] = await Promise.all([
    getInsightsRange({ since, until, level: 'account' }),
    graphGet(`/${accountId}/ads`, { fields: 'id', limit: 500 }, { cacheTtlMs: 60000 }).catch(() => ({ data: [] })),
  ]);
  const m = insights[0] || {};
  const spend = parseFloat(m.spend || 0);
  const impressions = parseInt(m.impressions || 0);
  const clicks = parseInt(m.clicks || 0);
  const reach = parseInt(m.reach || 0);
  const frequency = parseFloat(m.frequency || 0);
  const ctr = parseFloat(m.ctr || 0);
  const cpc = parseFloat(m.cpc || 0);
  const cpm = parseFloat(m.cpm || 0);
  const leadsMeta = extractLeads(m.actions);

  const adIds = (adsData.data || []).map(a => a.id).filter(Boolean);
  const sinceUtc = dateOnlyToUtcIso(since, false);
  const untilUtc = dateOnlyToUtcIso(until, true);
  let leadsCRM = 0;
  try {
    leadsCRM = store.countLeadsByAdIdsRange(adIds, sinceUtc, untilUtc);
  } catch (e) {
    console.error('[META-ADS] No se pudo cruzar leads reales del CRM para el rango:', e.message);
  }

  const dias = daysBetween(since, until);
  return {
    periodo: { since, until, dias },
    spend, impressions, clicks, reach, frequency, ctr, cpc, cpm,
    leadsMeta, leadsCRM,
    cplMeta: leadsMeta > 0 ? spend / leadsMeta : 0,
    cplCRM: leadsCRM > 0 ? spend / leadsCRM : 0,
    gastoDia: dias > 0 ? spend / dias : 0,
    leadsDia: dias > 0 ? leadsCRM / dias : 0,
  };
}

function pctDelta(actual, referencia) {
  if (!referencia) return null;
  return ((actual - referencia) / referencia) * 100;
}

// veredicto por métrica: 'bien' | 'alerta' | 'mal' — comparado contra los umbrales
// del baseline (ver meta-ads-baseline.js), no contra el periodo de referencia elegido
// (baseline o anterior) — el semáforo siempre mide contra la vara histórica fija.
function evaluarVeredictos(actual, umbrales) {
  const v = {};
  if (actual.leadsMeta > 0) {
    v.cpl = actual.cplMeta <= umbrales.cplBueno ? 'bien' : (actual.cplMeta <= umbrales.cplAlerta ? 'alerta' : 'mal');
  } else {
    v.cpl = null;
  }
  v.ctr = actual.ctr >= umbrales.ctrMin ? 'bien' : 'mal';
  v.cpm = actual.cpm <= umbrales.cpmMax ? 'bien' : 'mal';
  v.frecuencia = actual.frequency <= umbrales.frecuenciaMax ? 'bien' : (actual.frequency > 0 ? 'alerta' : null);
  return v;
}

/**
 * Compara un rango [since, until] contra el baseline histórico de Tocaima o contra
 * el periodo inmediatamente anterior de igual duración. Devuelve ambas definiciones
 * de CPL (Meta y CRM real) lado a lado — nunca se mezclan ni se sustituyen una por
 * otra, porque el baseline se midió con la métrica de Meta (ver meta-ads-baseline.js).
 */
async function comparePeriods({ since, until, vs }) {
  const baseline = require('./meta-ads-baseline').getBaseline();
  const actual = await summarizeRange(since, until);

  let referencia;
  if (vs === 'anterior') {
    const dias = daysBetween(since, until);
    const prevUntil = addDays(since, -1);
    const prevSince = addDays(prevUntil, -(dias - 1));
    referencia = await summarizeRange(prevSince, prevUntil);
    referencia.esBaseline = false;
  } else {
    referencia = {
      periodo: baseline.periodo,
      spend: baseline.spend, impressions: baseline.impressions, reach: baseline.reach,
      frequency: baseline.frecuencia, ctr: baseline.ctr, cpm: baseline.cpm,
      clicks: null, cpc: null,
      leadsMeta: baseline.leadsMeta, leadsCRM: null,
      cplMeta: baseline.cplMeta, cplCRM: null,
      gastoDia: baseline.periodo.dias > 0 ? baseline.spend / baseline.periodo.dias : 0,
      leadsDia: baseline.periodo.dias > 0 ? baseline.leadsMeta / baseline.periodo.dias : 0,
      esBaseline: true, fuente: baseline.fuente, definicionLead: baseline.definicionLead,
    };
  }

  const deltas = {
    spend: pctDelta(actual.spend, referencia.spend),
    cplMeta: pctDelta(actual.cplMeta, referencia.cplMeta),
    ctr: pctDelta(actual.ctr, referencia.ctr),
    cpm: pctDelta(actual.cpm, referencia.cpm),
    leadsMeta: pctDelta(actual.leadsMeta, referencia.leadsMeta),
  };

  return {
    vs: vs === 'anterior' ? 'anterior' : 'baseline',
    actual, referencia, deltas,
    veredictos: evaluarVeredictos(actual, baseline.umbrales),
    umbrales: baseline.umbrales,
  };
}

// ─── Resumen de estado ───────────────────────────────────────

// Antes llamaba a getCampaigns() completo (que a su vez ya hacía sus propias 3
// llamadas) solo para sumar spend/leads — duplicaba todo ese trabajo en cada carga
// de página, ya que el front pide /status Y /campaigns por separado. Ahora usa
// insights a nivel de cuenta (1 llamada) en vez de recorrer campañas.
async function getStatus() {
  if (!isConfigured()) {
    return {
      configured: false,
      campaigns: 0,
      totalSpend: 0,
      totalLeads: 0,
      pixelInstalled: false,
    };
  }

  try {
    const { accountId } = getConfig();
    const [account, campaignsData, pixel] = await Promise.all([
      graphGet(`/${accountId}`, { fields: 'name,account_status,currency,min_daily_budget' }, { cacheTtlMs: 60000 }),
      graphGet(`/${accountId}/campaigns`, { fields: 'id,status', limit: 200 }, { cacheTtlMs: 60000 }),
      getPixelInfo(),
    ]);
    const campaigns = campaignsData.data || [];

    let totalSpend = 0, totalLeads = 0;
    try {
      const acctInsights = await graphGet(`/${accountId}/insights`, {
        fields: 'spend,actions', date_preset: 'last_30d', limit: 1,
      }, { cacheTtlMs: 60000 });
      const m = (acctInsights.data && acctInsights.data[0]) || {};
      totalSpend = parseFloat(m.spend || 0);
      totalLeads = extractLeads(m.actions); // cifra de Meta — el detalle por campaña cruza contra el CRM
    } catch (e) {
      console.error('[META-ADS] Error obteniendo insights de cuenta:', e.message);
    }

    return {
      configured: true,
      accountId,
      accountName: account.name,
      currency: account.currency,
      minDailyBudget: account.min_daily_budget,
      campaigns: campaigns.length,
      activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
      totalSpend,
      totalLeads,
      pixelInstalled: pixel.configured,
    };
  } catch (e) {
    console.error('[META-ADS] Error obteniendo estado:', e.message);
    return {
      configured: true,
      error: e.message,
      userMessage: e.error_user_msg || null,
      campaigns: 0,
      totalSpend: 0,
      totalLeads: 0,
      pixelInstalled: false,
    };
  }
}

module.exports = {
  isConfigured,
  getConfig,
  getStatus,
  MetaApiError,
  // Campañas
  getCampaigns,
  getCampaignById,
  getCampaignFull,
  getCampaignInsights,
  pauseCampaign,
  resumeCampaign,
  updateCampaign,
  duplicateCampaign,
  archiveCampaign,
  deleteCampaign,
  // Ad Sets
  getAdSets,
  getAdSetById,
  updateAdSet,
  // Ads
  getAds,
  updateAd,
  getAdPreview,
  // Audiencias
  getCustomAudiences,
  createCustomAudience,
  deleteCustomAudience,
  addToAudience,
  removeFromAudience,
  createLookalike,
  syncLeadsToAudience,
  // Pixel
  getPixelInfo,
  // Utilidades
  normalizePhone,
  extractLeads,
  getCampaignAdIds,
  getCampaignRealLeads,
  // Conversions API
  sendConversionEvent,
  // Comparativa de periodos
  getInsightsRange,
  comparePeriods,
  summarizeRange,
  // Creación de campañas (flujo legacy WhatsApp)
  getAccountInfo,
  createCampaign,
  buildTargeting,
  buscarUbicaciones,
  createAdSet,
  uploadAdImage,
  createAdCreative,
  createAd,
  createWhatsAppCampaign,
  // Targeting avanzado
  searchInterests,
  estimateReach,
  // Medios
  uploadAdImages,
  uploadAdVideo,
  getVideoStatus,
  generatePreview,
  buildCreativeSpec,
  // Creación avanzada (Fase 2/3)
  createAdvancedCampaign,
};
