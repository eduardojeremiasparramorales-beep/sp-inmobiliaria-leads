/**
 * Meta Ads — Mejoras con seguimiento.
 * Convierte las recomendaciones efímeras del advisor (se recalculan al vuelo y se
 * pierden, ver meta-ads-advisor.js) en una lista viva persistida en
 * meta_ads_mejoras: se detecta, se guarda con estado, y si la condición que la
 * disparó deja de cumplirse en una corrida posterior, se cierra sola como
 * 'resuelta' con fecha — así queda registro real de qué mejoró, no solo un
 * diagnóstico del momento.
 */

const store = require('../db/store');
const metaAds = require('./meta-ads');
const advisor = require('./meta-ads-advisor');
const { getBaseline } = require('./meta-ads-baseline');

function fmtMoney(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }

function claveUnica(tipo, campaignId) {
  return `${tipo}:${campaignId || 'cuenta'}`;
}

/**
 * Reúne todo lo que hoy merece atención: las reglas ya existentes del advisor
 * (ganadora, cpl_alto, sin_resultados, ctr_caida, fatiga, infrautilizada — se
 * importan tal cual, sin reescribirlas) + reglas nuevas contra el baseline
 * histórico de Tocaima ($926 CPL) que el advisor no conocía.
 */
async function detectar() {
  const detected = [];

  const recs = await advisor.getRecommendations();
  for (const r of recs) {
    detected.push({
      claveUnica: claveUnica(r.tipo, r.campaignId),
      tipo: r.tipo, severidad: r.severidad,
      campaignId: r.campaignId, campaignName: r.campaignName,
      mensaje: r.mensaje, metrica: { accion: r.accion },
    });
  }

  if (!metaAds.isConfigured()) return detected;

  const baseline = getBaseline();
  let campaigns = [];
  try { campaigns = await metaAds.getCampaigns(); } catch (e) {
    console.error('[META-ADS-MEJORAS] No se pudo listar campañas:', e.message);
    return detected;
  }
  const active = campaigns.filter(c => c.status === 'ACTIVE' && c.metrics);
  const cplRefPrincipal = baseline.porCampana && baseline.porCampana.principal
    ? baseline.porCampana.principal.cpl : baseline.cplMeta;

  for (const c of active) {
    const m = c.metrics;

    // CPL Meta muy por encima del baseline histórico — comparable de verdad porque
    // ambos usan la misma definición de "lead" (actions de Meta), a diferencia del
    // CPL real del CRM que siempre sale más alto por definición (menos leads contados).
    if (m.leadsMeta > 0 && m.cplMeta >= cplRefPrincipal * 1.5) {
      detected.push({
        claveUnica: claveUnica('cpl_sobre_baseline', c.id),
        tipo: 'cpl_sobre_baseline', severidad: 2,
        campaignId: c.id, campaignName: c.name,
        mensaje: `CPL Meta de ${fmtMoney(m.cplMeta)} — más de 50% sobre el baseline histórico de Tocaima (${fmtMoney(cplRefPrincipal)}).`,
        metrica: { cplMeta: m.cplMeta, cplRefPrincipal },
      });
    }

    // CTR por debajo del mínimo aceptable que ya se vio en el histórico (1.5%).
    if (m.ctr > 0 && m.ctr < baseline.umbrales.ctrMin) {
      detected.push({
        claveUnica: claveUnica('ctr_bajo_baseline', c.id),
        tipo: 'ctr_bajo_baseline', severidad: 1,
        campaignId: c.id, campaignName: c.name,
        mensaje: `CTR de ${m.ctr.toFixed(2)}% — por debajo del mínimo histórico aceptable (${baseline.umbrales.ctrMin}%).`,
        metrica: { ctr: m.ctr, ctrMin: baseline.umbrales.ctrMin },
      });
    }

    // CPM disparado respecto al techo ya observado en el histórico ($15.000).
    if (m.cpm > baseline.umbrales.cpmMax) {
      detected.push({
        claveUnica: claveUnica('cpm_sobre_baseline', c.id),
        tipo: 'cpm_sobre_baseline', severidad: 1,
        campaignId: c.id, campaignName: c.name,
        mensaje: `CPM de ${fmtMoney(m.cpm)} — por encima del techo histórico ($${baseline.umbrales.cpmMax.toLocaleString('es-CO')}).`,
        metrica: { cpm: m.cpm, cpmMax: baseline.umbrales.cpmMax },
      });
    }

    // Atribución rota: Meta reporta conversaciones iniciadas pero ninguna llegó al
    // CRM con ad_id — el `referral` del webhook no está enlazando ese anuncio.
    if (m.spend > 0 && m.leadsMeta > 0 && m.leads === 0) {
      detected.push({
        claveUnica: claveUnica('atribucion_rota', c.id),
        tipo: 'atribucion_rota', severidad: 3,
        campaignId: c.id, campaignName: c.name,
        mensaje: `Meta reporta ${m.leadsMeta} conversaciones iniciadas y ${fmtMoney(m.spend)} gastados, pero 0 leads llegaron al CRM con este anuncio atribuido — revisar el referral del webhook.`,
        metrica: { leadsMeta: m.leadsMeta, leadsCRM: m.leads, spend: m.spend },
      });
    }
  }

  try {
    const pixel = await metaAds.getPixelInfo();
    if (!pixel.configured) {
      detected.push({
        claveUnica: claveUnica('sin_pixel', null),
        tipo: 'sin_pixel', severidad: 2, campaignId: null, campaignName: null,
        mensaje: 'No hay Pixel de Meta configurado — sin retroalimentación de conversiones hacia el algoritmo de entrega.',
        metrica: {},
      });
    }
  } catch (e) { /* getPixelInfo ya maneja sus propios errores internamente */ }

  try {
    const audiences = await metaAds.getCustomAudiences();
    if (!Array.isArray(audiences) || audiences.length === 0) {
      detected.push({
        claveUnica: claveUnica('sin_audiencias', null),
        tipo: 'sin_audiencias', severidad: 1, campaignId: null, campaignName: null,
        mensaje: 'No hay audiencias personalizadas ni Lookalike creadas — no se puede hacer remarketing ni escalar hacia leads similares a los que ya compraron.',
        metrica: {},
      });
    }
  } catch (e) {
    console.error('[META-ADS-MEJORAS] No se pudieron listar audiencias:', e.message);
  }

  return detected;
}

const SQL_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/**
 * Corre la detección y sincroniza contra la tabla — upsert por clave_unica (no
 * duplica si ya está pendiente/aplicada/descartada) y cierra automáticamente como
 * 'resuelta' cualquier pendiente/aplicada cuya condición ya no se detecta. Las
 * descartadas por el admin nunca se reabren solas — solo un cambio de estado manual
 * las puede mover.
 */
async function sincronizar() {
  const detected = await detectar();
  const detectedKeys = new Set(detected.map(d => d.claveUnica));

  for (const d of detected) {
    const metricaJson = JSON.stringify(d.metrica || {});
    store.run(`
      INSERT INTO meta_ads_mejoras (clave_unica, tipo, severidad, campaign_id, campaign_name, mensaje, metrica_json, estado, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ${SQL_NOW}, ${SQL_NOW})
      ON CONFLICT(clave_unica) DO UPDATE SET
        severidad = excluded.severidad,
        campaign_name = excluded.campaign_name,
        mensaje = excluded.mensaje,
        metrica_json = excluded.metrica_json,
        updated_at = ${SQL_NOW},
        estado = CASE WHEN meta_ads_mejoras.estado = 'resuelta' THEN 'pendiente' ELSE meta_ads_mejoras.estado END,
        resuelta_at = CASE WHEN meta_ads_mejoras.estado = 'resuelta' THEN NULL ELSE meta_ads_mejoras.resuelta_at END
    `, [d.claveUnica, d.tipo, d.severidad, d.campaignId, d.campaignName, d.mensaje, metricaJson]);
  }

  const abiertas = store.all(`SELECT id, clave_unica FROM meta_ads_mejoras WHERE estado IN ('pendiente','aplicada')`);
  let cerradas = 0;
  for (const row of abiertas) {
    if (!detectedKeys.has(row.clave_unica)) {
      store.run(`UPDATE meta_ads_mejoras SET estado='resuelta', resuelta_at=${SQL_NOW}, updated_at=${SQL_NOW} WHERE id=?`, [row.id]);
      cerradas++;
    }
  }

  const pendientes = store.one(`SELECT COUNT(*) as c FROM meta_ads_mejoras WHERE estado='pendiente'`);
  return { detectadas: detected.length, cerradas, pendientes: pendientes ? pendientes.c : 0 };
}

function parseRow(row) {
  let metrica = {};
  try { metrica = JSON.parse(row.metrica_json || '{}'); } catch (e) { /* deja {} si quedó corrupto */ }
  return { ...row, metrica_json: undefined, metrica };
}

function listMejoras(estado) {
  const orden = "CASE estado WHEN 'pendiente' THEN 0 WHEN 'aplicada' THEN 1 WHEN 'resuelta' THEN 2 ELSE 3 END, severidad DESC, updated_at DESC";
  const rows = estado
    ? store.all(`SELECT * FROM meta_ads_mejoras WHERE estado=? ORDER BY ${orden}`, [estado])
    : store.all(`SELECT * FROM meta_ads_mejoras ORDER BY ${orden}`);
  return rows.map(parseRow);
}

const ESTADOS_VALIDOS = ['pendiente', 'aplicada', 'descartada', 'resuelta'];

function setEstado(id, estado, nota) {
  if (!ESTADOS_VALIDOS.includes(estado)) throw new Error('Estado inválido: ' + estado);
  const resueltaAtExpr = estado === 'resuelta' ? SQL_NOW : 'NULL';
  store.run(`UPDATE meta_ads_mejoras SET estado=?, nota=?, updated_at=${SQL_NOW}, resuelta_at=${resueltaAtExpr} WHERE id=?`,
    [estado, nota || '', Number(id)]);
  const row = store.one(`SELECT * FROM meta_ads_mejoras WHERE id=?`, [Number(id)]);
  return row ? parseRow(row) : null;
}

/**
 * Snapshot diario a nivel de cuenta — Meta no conserva histórico eterno vía Graph
 * API y sin esto no se puede dibujar una serie propia para medir el antes/después
 * de una mejora aplicada. Se sobrescribe el mismo día si ya corrió antes (los
 * insights de "hoy" son acumulativos, así que la última corrida del día es la más
 * precisa) — no crea una fila nueva por cada corrida del scheduler.
 */
async function guardarSnapshotDiario() {
  if (!metaAds.isConfigured()) return null;
  const hoy = new Date().toISOString().split('T')[0];
  let r;
  try {
    r = await metaAds.summarizeRange(hoy, hoy);
  } catch (e) {
    console.error('[META-ADS-MEJORAS] No se pudo obtener el resumen del día para el snapshot:', e.message);
    return null;
  }

  const existente = store.one(`SELECT id FROM meta_ads_snapshots WHERE fecha=? AND ambito='cuenta'`, [hoy]);
  const campos = [r.spend, r.impressions, r.clicks, r.reach, r.frequency, r.leadsMeta, r.leadsCRM, r.ctr, r.cpm, r.cplMeta, r.cplCRM];
  if (existente) {
    store.run(`UPDATE meta_ads_snapshots SET spend=?, impressions=?, clicks=?, reach=?, frequency=?, leads_meta=?, leads_crm=?, ctr=?, cpm=?, cpl_meta=?, cpl_crm=? WHERE id=?`,
      [...campos, existente.id]);
  } else {
    store.run(`INSERT INTO meta_ads_snapshots (fecha, ambito, campaign_id, spend, impressions, clicks, reach, frequency, leads_meta, leads_crm, ctr, cpm, cpl_meta, cpl_crm)
               VALUES (?, 'cuenta', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [hoy, ...campos]);
  }
  return r;
}

module.exports = { detectar, sincronizar, listMejoras, setEstado, guardarSnapshotDiario, claveUnica };
