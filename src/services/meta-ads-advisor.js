// Servicio inteligente de Meta Ads: analiza campañas activas y devuelve
// recomendaciones accionables — CPL alto, caída de CTR, fatiga creativa, gasto sin
// resultados, infrautilización de presupuesto y campañas "ganadoras" candidatas a
// escalar. Nunca actúa solo: el panel decide si aplica cada acción, siempre con
// confirmación del admin.
const metaAds = require('./meta-ads');
const store = require('../db/store');

// Con menos de esto no hay señal suficiente — evita opinar sobre "ruido" de
// campañas recién creadas o con gasto insignificante.
const MIN_IMPRESSIONS = 1000;
const MIN_DAYS = 3;

function median(arr) {
  const a = arr.filter(n => typeof n === 'number' && n > 0).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
function avg(arr) {
  const a = arr.filter(n => typeof n === 'number' && !isNaN(n));
  return a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0;
}
function fmtMoney(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }

async function getRecommendations() {
  if (!metaAds.isConfigured()) return [];
  const campaigns = await metaAds.getCampaigns();
  const active = campaigns.filter(c => c.status === 'ACTIVE' && c.metrics);
  if (!active.length) return [];

  const cplObjetivo = Number(store.getConfig('meta_ads_cpl_objetivo')) || null;
  const medianCpl = median(active.filter(c => c.metrics.leads > 0).map(c => c.metrics.cpl));

  const recs = [];
  for (const c of active) {
    const m = c.metrics;
    if (m.impressions < MIN_IMPRESSIONS) continue; // "aprendiendo" — sin datos suficientes

    let daily = [];
    try { daily = await metaAds.getCampaignInsights(c.id, 14); } catch (e) { daily = []; }
    if (daily.length < MIN_DAYS) continue;

    const last7 = daily.slice(-7), prev7 = daily.slice(-14, -7);
    const ctrLast7 = avg(last7.map(d => d.ctr));
    const ctrPrev7 = avg(prev7.map(d => d.ctr));
    const ctrDropPct = ctrPrev7 > 0 ? ((ctrPrev7 - ctrLast7) / ctrPrev7) * 100 : 0;
    const avgFreqLast7 = avg(last7.map(d => d.frequency));

    // Campaña ganadora: CPL muy por debajo de la mediana de la cuenta.
    if (medianCpl && m.cpl > 0 && m.cpl < medianCpl * 0.6) {
      recs.push({
        campaignId: c.id, campaignName: c.name, tipo: 'ganadora', severidad: 1,
        mensaje: `CPL real de ${fmtMoney(m.cpl)} — más de 40% por debajo de la mediana de la cuenta (${fmtMoney(medianCpl)}). Buena candidata para escalar presupuesto o duplicar.`,
        accion: { type: 'duplicate', params: { campaignId: c.id } },
      });
    }

    // CPL más del doble del objetivo configurado.
    if (cplObjetivo && m.leads > 0 && m.cpl > cplObjetivo * 2) {
      recs.push({
        campaignId: c.id, campaignName: c.name, tipo: 'cpl_alto', severidad: 2,
        mensaje: `CPL real de ${fmtMoney(m.cpl)} — más del doble del objetivo (${fmtMoney(cplObjetivo)}).`,
        accion: { type: 'review', params: { campaignId: c.id } },
      });
    }

    // Gasto significativo sin ningún lead real atribuido.
    const umbralSinResultados = (cplObjetivo || 30000) * 2;
    if (m.leads === 0 && m.spend > umbralSinResultados) {
      recs.push({
        campaignId: c.id, campaignName: c.name, tipo: 'sin_resultados', severidad: 3,
        mensaje: `${fmtMoney(m.spend)} gastados en 30 días sin ningún lead real registrado en el CRM.`,
        accion: { type: 'pause', params: { campaignId: c.id } },
      });
    }

    // Caída de CTR semana vs semana anterior.
    if (ctrPrev7 > 0 && ctrDropPct >= 25) {
      recs.push({
        campaignId: c.id, campaignName: c.name, tipo: 'ctr_caida', severidad: 2,
        mensaje: `El CTR cayó ${ctrDropPct.toFixed(0)}% esta semana (${ctrLast7.toFixed(2)}% vs ${ctrPrev7.toFixed(2)}% la semana previa).`,
        accion: { type: 'review', params: { campaignId: c.id } },
      });
    }

    // Fatiga creativa: la misma audiencia ya vio el anuncio muchas veces Y el CTR
    // está cayendo — la combinación es lo que distingue fatiga real de una campaña
    // que simplemente satura poco a poco sin perder rendimiento.
    if (avgFreqLast7 > 3 && ctrDropPct >= 15) {
      recs.push({
        campaignId: c.id, campaignName: c.name, tipo: 'fatiga', severidad: 2,
        mensaje: `Frecuencia promedio de ${avgFreqLast7.toFixed(1)} con el CTR cayendo — la audiencia ya vio el anuncio muchas veces. Considera refrescar el creativo.`,
        accion: { type: 'review', params: { campaignId: c.id } },
      });
    }

    // Infrautilización: solo aplica a presupuesto diario a nivel de campaña (CBO) —
    // el presupuesto a nivel de conjunto exigiría otra llamada por campaña para leer
    // fechas de inicio/fin y no vale el costo extra en esta primera versión.
    if (c.daily_budget && Number(c.daily_budget) > 0) {
      const avgSpendLast7 = avg(last7.map(d => d.spend));
      if (avgSpendLast7 < Number(c.daily_budget) * 0.7) {
        recs.push({
          campaignId: c.id, campaignName: c.name, tipo: 'infrautilizada', severidad: 1,
          mensaje: `Gastando en promedio ${fmtMoney(avgSpendLast7)}/día de un presupuesto de ${fmtMoney(c.daily_budget)}/día — Meta no está entregando todo el presupuesto disponible.`,
          accion: { type: 'review', params: { campaignId: c.id } },
        });
      }
    }
  }

  return recs.sort((a, b) => b.severidad - a.severidad);
}

// Series diarias de varias campañas en paralelo — para comparar lado a lado
// (gasto/CTR/leads por día) en la vista de comparación del panel.
async function compare(ids) {
  const results = {};
  await Promise.all(ids.map(async (id) => {
    try { results[id] = await metaAds.getCampaignInsights(id, 30); }
    catch (e) { results[id] = []; }
  }));
  return results;
}

module.exports = { getRecommendations, compare };
