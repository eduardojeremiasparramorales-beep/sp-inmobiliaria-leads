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

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

// ─── Configuración ───────────────────────────────────────────

function getConfig() {
  const token = process.env.META_MARKETING_API_TOKEN || '';
  const accountId = process.env.META_AD_ACCOUNT_ID || '';
  const pixelId = process.env.META_PIXEL_ID || '';
  return { token, accountId, pixelId };
}

function isConfigured() {
  const { token, accountId } = getConfig();
  return !!(token && accountId);
}

// ─── HTTP helper ─────────────────────────────────────────────

async function graphGet(path, params = {}) {
  const { token } = getConfig();
  if (!token) throw new Error('META_MARKETING_API_TOKEN no configurado');
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.error) throw new Error(`Meta API: ${json.error.message}`);
  return json;
}

async function graphPost(path, body = {}) {
  const { token } = getConfig();
  if (!token) throw new Error('META_MARKETING_API_TOKEN no configurado');
  const url = `${GRAPH_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Meta API: ${json.error.message}`);
  return json;
}

// ─── Campañas ────────────────────────────────────────────────

/**
 * Listar todas las campañas de la cuenta con métricas básicas.
 */
async function getCampaigns() {
  const { accountId } = getConfig();
  const data = await graphGet(`/${accountId}/campaigns`, {
    fields: 'id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time',
    limit: 100,
  });

  const campaigns = data.data || [];

  // Obtener métricas de las campañas activas
  const enriched = await Promise.all(campaigns.map(async (c) => {
    try {
      const insights = await graphGet(`/${c.id}/insights`, {
        fields: 'impressions,clicks,spend,actions,ctr,cpc,cpm',
        date_preset: 'last_30d',
        limit: 1,
      });
      const metrics = (insights.data && insights.data[0]) || {};
      const leadsMeta = extractLeads(metrics.actions);
      const spend = parseFloat(metrics.spend || 0);
      // leads/cpl "oficiales" = conteo REAL del CRM (ad_id atribuido vía referral del
      // webhook), no lo que Meta reporta en `actions` — es la cifra que debe guiar
      // presupuesto. leadsMeta/cplMeta quedan como referencia/comparación.
      let leads = leadsMeta;
      try {
        const real = await getCampaignRealLeads(c.id, 30);
        leads = real.leadsCRM;
      } catch (e) {
        console.error(`[META-ADS] No se pudo cruzar leads reales del CRM para ${c.id}:`, e.message);
      }
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
          impressions: parseInt(metrics.impressions || 0),
          clicks: parseInt(metrics.clicks || 0),
          spend,
          leads,
          leadsMeta,
          ctr: parseFloat(metrics.ctr || 0),
          cpc: parseFloat(metrics.cpc || 0),
          cpm: parseFloat(metrics.cpm || 0),
          cpl: leads > 0 ? spend / leads : 0,
          cplMeta: leadsMeta > 0 ? spend / leadsMeta : 0,
        },
      };
    } catch (e) {
      console.error(`[META-ADS] Error obteniendo métricas de campaña ${c.id}:`, e.message);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        daily_budget: c.daily_budget,
        lifetime_budget: c.lifetime_budget,
        created_time: c.created_time,
        updated_time: c.updated_time,
        metrics: null,
      };
    }
  }));

  return enriched;
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
  const data = await graphGet(`/${accountId}/customaudiences`, {
    fields: 'id,name,description,approximate_count,tag,status,delivery_info',
    limit: 100,
  });
  return data.data || [];
}

/**
 * Crear audiencia personalizada subiendo teléfonos de leads.
 * @param {string} name - Nombre de la audiencia
 * @param {Array<{phone: string, email?: string}>} leads - Leads a subir
 * @returns {object} - { id, name, approximate_count }
 */
async function createCustomAudience(name, leads) {
  const { accountId } = getConfig();

  // 1. Crear audiencia vacía
  const audience = await graphPost(`/${accountId}/customaudiences`, {
    name,
    description: `Audiencia creada desde SP CRM — ${leads.length} leads`,
    subtype: 'CUSTOMER_LIST',
    data_source: { type: 'MANUALLY_ENTERED' },
  });

  // 2. Subir leads (schema: phone, email)
  const schema = ['PHONE', 'EMAIL'];
  const data = leads.map(l => {
    const row = [];
    if (l.phone) row.push(normalizePhone(l.phone));
    if (l.email) row.push(l.email.toLowerCase().trim());
    else row.push('');
    return row;
  });

  await graphPost(`/${audience.id}/users`, {
    schema,
    data,
  });

  return {
    id: audience.id,
    name: audience.name || name,
    approximate_count: leads.length,
    status: 'READY',
  };
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
    const data = await graphGet(`/${pixelId}`, {
      fields: 'id,name,code,last_fired_event',
    });
    return { configured: true, ...data };
  } catch (e) {
    return { configured: true, id: pixelId, error: e.message };
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
  const leads = store.getLeads ? store.getLeads() : [];
  const activeLeads = leads.filter(l => l.status !== 'cerrado');
  const mapped = activeLeads.map(l => ({
    phone: l.telefono || l.customer_phone,
    email: l.email || '',
  })).filter(l => l.phone);

  if (mapped.length === 0) return { synced: 0, audienceId };

  await addToAudience(audienceId, mapped);
  return { synced: mapped.length, audienceId };
}

// ─── Resumen de estado ───────────────────────────────────────

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
    const campaigns = await getCampaigns();
    let totalSpend = 0;
    let totalLeads = 0;
    campaigns.forEach(c => {
      if (c.metrics) {
        totalSpend += c.metrics.spend;
        totalLeads += c.metrics.leads;
      }
    });

    const pixel = await getPixelInfo();

    return {
      configured: true,
      accountId: getConfig().accountId,
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
  // Campañas
  getCampaigns,
  getCampaignById,
  getCampaignInsights,
  pauseCampaign,
  resumeCampaign,
  // Ad Sets
  getAdSets,
  getAds,
  // Audiencias
  getCustomAudiences,
  createCustomAudience,
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
};
