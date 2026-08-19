/**
 * Informe Meta Ads — genera un Markdown con la misma estructura del informe
 * histórico de Tocaima (INFORME_TRÁFICO_LOTES_TOCAIMA.md), pero comparando el
 * periodo elegido contra el baseline histórico ($926-972 CPL) y contra la lista
 * viva de mejoras (meta_ads_mejoras).
 *
 * Uso:
 *   node scripts/informe-meta.js --dias 30 > informe-meta.md
 *   node scripts/informe-meta.js --since 2026-07-01 --until 2026-07-31 > informe-meta.md
 */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

function fmtMoney(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }
function fmt(n) { return Number(n || 0).toLocaleString('es-CO'); }

function dateStr(d) { return d.toISOString().split('T')[0]; }

function rangoDesdeAtras(dias) {
  const until = new Date();
  const since = new Date(until.getTime() - (dias - 1) * 86400000);
  return { since: dateStr(since), until: dateStr(until) };
}

function veredictoLabel(v) {
  if (v === 'bien') return '✅ Bien';
  if (v === 'alerta') return '⚠️ Alerta';
  if (v === 'mal') return '❌ Mal';
  return '—';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const store = require('../src/db/store');
  await store.initDB();

  const metaAds = require('../src/services/meta-ads');
  const { getBaseline } = require('../src/services/meta-ads-baseline');
  const mejoras = require('../src/services/meta-ads-mejoras');

  if (!metaAds.isConfigured()) {
    console.error('❌ Meta Ads no está configurado (falta token/cuenta en Configuración → Meta Ads o en .env). No se puede generar el informe.');
    process.exit(1);
  }

  const { since, until } = args.since && args.until
    ? { since: args.since, until: args.until }
    : rangoDesdeAtras(Number(args.dias) || 30);

  const baseline = getBaseline();

  let comparativa;
  try {
    comparativa = await metaAds.comparePeriods({ since, until, vs: 'baseline' });
  } catch (e) {
    console.error('❌ Error consultando Meta Ads:', e.message);
    process.exit(1);
  }

  let campaigns = [];
  try { campaigns = await metaAds.getCampaigns(); } catch (e) {
    console.error('⚠️ No se pudo obtener el desglose por campaña:', e.message);
  }
  const activas = campaigns.filter(c => c.status === 'ACTIVE');

  await mejoras.sincronizar();
  const todas = mejoras.listMejoras();
  const pendientes = todas.filter(m => m.estado === 'pendiente');
  const aplicadas = todas.filter(m => m.estado === 'aplicada');
  const resueltas = todas.filter(m => m.estado === 'resuelta');

  const { actual, deltas, veredictos } = comparativa;

  const lines = [];
  const p = (s = '') => lines.push(s);

  p(`# INFORME DE TRÁFICO Y RENDIMIENTO — META ADS`);
  p(`## Sp Leons Group — asesores Comerciales`);
  p(`### Periodo analizado: ${since} → ${until} (${actual.periodo.dias} días)`);
  p();
  p('---');
  p();
  p('## RESUMEN EJECUTIVO');
  p();
  p('| Métrica | Valor |');
  p('|---------|-------|');
  p(`| Gasto Total | ${fmtMoney(actual.spend)} COP |`);
  p(`| Leads (Meta) | **${fmt(actual.leadsMeta)}** |`);
  p(`| Leads reales (CRM) | **${fmt(actual.leadsCRM)}** |`);
  p(`| CPL Meta | **${actual.cplMeta ? fmtMoney(actual.cplMeta) : '—'}** |`);
  p(`| CPL real CRM | **${actual.cplCRM ? fmtMoney(actual.cplCRM) : '—'}** |`);
  p(`| CTR | ${actual.ctr.toFixed(2)}% |`);
  p(`| CPM | ${fmtMoney(actual.cpm)} |`);
  p(`| Frecuencia | ${actual.frequency ? actual.frequency.toFixed(1) + 'x' : '—'} |`);
  p();
  p('---');
  p();
  p('## DESGLOSE POR CAMPAÑA (activas)');
  p();
  if (!activas.length) {
    p('_No hay campañas activas en este momento._');
  } else {
    p('| Campaña | Gasto | Leads (Meta) | Leads (CRM) | CPL Meta | CPL CRM | CTR | CPM |');
    p('|---------|-------|--------------|-------------|----------|---------|-----|-----|');
    activas.forEach(c => {
      const m = c.metrics || {};
      p(`| ${c.name} | ${fmtMoney(m.spend)} | ${fmt(m.leadsMeta)} | ${fmt(m.leads)} | ${m.cplMeta ? fmtMoney(m.cplMeta) : '—'} | ${m.cpl ? fmtMoney(m.cpl) : '—'} | ${(m.ctr || 0).toFixed(2)}% | ${fmtMoney(m.cpm)} |`);
    });
  }
  p();
  p('---');
  p();
  p(`## EVALUACIÓN CONTRA EL BASELINE HISTÓRICO (${baseline.fuente})`);
  p();
  p(`Baseline: ${baseline.periodo.since} → ${baseline.periodo.until} — ${fmtMoney(baseline.spend)} COP, ${fmt(baseline.leadsMeta)} leads (Meta), CPL ${fmtMoney(baseline.cplMeta)} (principal: ${fmtMoney(baseline.porCampana.principal.cpl)}).`);
  p();
  p('| Métrica | Ahora | Baseline | Δ | Veredicto |');
  p('|---------|-------|----------|---|-----------|');
  p(`| CPL Meta | ${actual.cplMeta ? fmtMoney(actual.cplMeta) : '—'} | ${fmtMoney(baseline.cplMeta)} | ${deltas.cplMeta != null ? deltas.cplMeta.toFixed(1) + '%' : '—'} | ${veredictoLabel(veredictos.cpl)} |`);
  p(`| CTR | ${actual.ctr.toFixed(2)}% | ${baseline.ctr}% | ${deltas.ctr != null ? deltas.ctr.toFixed(1) + '%' : '—'} | ${veredictoLabel(veredictos.ctr)} |`);
  p(`| CPM | ${fmtMoney(actual.cpm)} | ${fmtMoney(baseline.cpm)} | ${deltas.cpm != null ? deltas.cpm.toFixed(1) + '%' : '—'} | ${veredictoLabel(veredictos.cpm)} |`);
  p(`| Frecuencia | ${actual.frequency ? actual.frequency.toFixed(1) + 'x' : '—'} | ${baseline.frecuencia}x | — | ${veredictoLabel(veredictos.frecuencia)} |`);
  p();
  p('_Nota: CPL Meta es comparable directamente con el baseline (misma definición de lead). CPL real CRM no se compara aquí porque el baseline no midió esa cifra — ver [CONFIGURACION_CRM.md] o la sección "Antes vs Ahora" del panel para el porqué de la diferencia._');
  p();
  p('---');
  p();
  p('## MEJORAS CON SEGUIMIENTO');
  p();
  p(`**${pendientes.length} pendientes · ${aplicadas.length} aplicadas · ${resueltas.length} resueltas**`);
  p();
  if (pendientes.length) {
    p('### 🔴 Pendientes');
    pendientes.forEach(m => p(`- **${m.tipo}**${m.campaign_name ? ' (' + m.campaign_name + ')' : ''} — ${m.mensaje}`));
    p();
  }
  if (aplicadas.length) {
    p('### 🟡 Aplicadas (esperando resultado)');
    aplicadas.forEach(m => p(`- **${m.tipo}**${m.campaign_name ? ' (' + m.campaign_name + ')' : ''} — ${m.mensaje}`));
    p();
  }
  if (resueltas.length) {
    p('### ✅ Resueltas recientemente');
    resueltas.slice(0, 10).forEach(m => p(`- **${m.tipo}**${m.campaign_name ? ' (' + m.campaign_name + ')' : ''} — resuelta ${m.resuelta_at ? new Date(m.resuelta_at).toLocaleDateString('es-CO') : ''}`));
    p();
  }
  p('---');
  p();
  p('## PROYECCIONES');
  p();
  p('| Escenario | CPL Meta objetivo | Notas |');
  p('|-----------|--------------------|-------|');
  p(`| Mantener nivel actual | ${actual.cplMeta ? fmtMoney(actual.cplMeta) : '—'} | Gasto/día actual: ${fmtMoney(actual.gastoDia)} |`);
  p(`| Volver al baseline histórico | ${fmtMoney(baseline.cplMeta)} | Referencia: campaña principal a ${fmtMoney(baseline.porCampana.principal.cpl)} |`);
  p();
  p('---');
  p();
  p(`*Informe generado el ${dateStr(new Date())}*`);
  p('*Sp Leons Group — asesores Comerciales*');
  p(`*Datos: Meta Marketing API (rango ${since} → ${until}) + leads reales del CRM*`);

  console.log(lines.join('\n'));
  process.exit(0);
}

main().catch(e => {
  console.error('❌ Error generando el informe:', e.message);
  process.exit(1);
});
