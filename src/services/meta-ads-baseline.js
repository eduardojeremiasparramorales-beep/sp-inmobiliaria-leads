/**
 * Meta Ads — Baseline histórico (Tocaima, 11 feb → 8 jun 2026).
 * Referencia dura para saber si lo que corre hoy va mejor o peor que cuando el
 * lead costaba $926-972 COP. Ver INFORME_TRÁFICO_LOTES_TOCAIMA.md (raíz del repo).
 *
 * IMPORTANTE — definicionLead: 'meta'. El informe original contó leads con la
 * métrica que reporta Meta (`actions` de mensajería vía extractLeads() en
 * meta-ads.js), NO con el conteo real del CRM por ad_id. Comparar el CPL real del
 * CRM de hoy contra este baseline sin aclarar la diferencia da una caída falsa —
 * por eso todo lo que consume este baseline debe mostrar CPL Meta y CPL CRM aparte.
 */

const store = require('../db/store');

const DEFAULT_BASELINE = {
  periodo: { since: '2026-02-11', until: '2026-06-08', dias: 117 },
  fuente: 'INFORME_TRÁFICO_LOTES_TOCAIMA.md',
  definicionLead: 'meta',
  spend: 2885297,
  leadsMeta: 2968,
  cplMeta: 972,
  impressions: 267182,
  reach: 107780,
  ctr: 2.0,
  cpm: 10334,
  frecuencia: 2.5,
  porCampana: {
    principal: { spend: 2425894, leads: 2619, cpl: 926, ctr: 2.0, cpm: 10334 },
    remarketing: { spend: 417206, leads: 344, cpl: 1213, ctr: 3.0, cpm: 13890 },
  },
  // Umbrales de semáforo — sobrescribibles desde config sin tocar código.
  umbrales: {
    cplBueno: 1000,
    cplAlerta: 2000,
    ctrMin: 1.5,
    cpmMax: 15000,
    frecuenciaMax: 3,
  },
};

/**
 * Devuelve el baseline efectivo — el guardado en config (meta_ads_baseline_json,
 * editable desde Configuración → Meta Ads) tiene prioridad sobre el default de este
 * archivo, mismo patrón que meta_ads_cpl_objetivo en meta-ads-advisor.js.
 */
function getBaseline() {
  try {
    const raw = store.getConfig('meta_ads_baseline_json');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_BASELINE, ...parsed };
    }
  } catch (e) {
    console.error('[META-ADS-BASELINE] meta_ads_baseline_json inválido, usando default:', e.message);
  }
  return DEFAULT_BASELINE;
}

module.exports = { getBaseline, DEFAULT_BASELINE };
