// Asignación de leads por zona geográfica — el negocio creció a varios municipios
// (Tocaima, Mariquita, ...) con asesores distintos por zona, y el reparto por menor
// carga a secas cruzaba clientes entre municipios. Este módulo resuelve la zona de un
// lead nuevo a partir del anuncio de Meta que lo trajo (msg.referral) y elige, dentro
// de los asesores que cubren esa zona, al de menor carga. Si nadie la cubre, degrada
// al reparto global existente (ver assigner.js) marcando el lead como "fuera de zona".
//
// Caché de reglas en memoria por tenant — mismo patrón que WorkflowEngine.rulesByTenant
// (services/workflow.js) — invalidada en cada escritura sobre zona_reglas/zonas.
const adapter = require('../db/adapter');

const reglasCacheByTenant = new Map();

function currentEmpresaId() {
  const ctx = adapter.tenantContext.getStore();
  return (ctx && ctx.empresaId != null) ? Number(ctx.empresaId) : adapter.DEFAULT_EMPRESA_ID;
}

function invalidateReglasCache() {
  reglasCacheByTenant.delete(currentEmpresaId());
}

function getReglasCacheadas() {
  const eid = currentEmpresaId();
  if (!reglasCacheByTenant.has(eid)) {
    const store = require('../db/store');
    reglasCacheByTenant.set(eid, store.getReglasActivas());
  }
  return reglasCacheByTenant.get(eid);
}

function matchRegla(regla, valorCampo) {
  if (!valorCampo) return false;
  const a = String(valorCampo).toLowerCase();
  const b = String(regla.valor).toLowerCase();
  return regla.operador === 'equals' ? a === b : a.includes(b);
}

// referral viene tal cual lo manda Meta en el primer mensaje de un Click-to-WhatsApp ad:
// { source_id, headline, source_url, ctwa_clid, body }. Primera regla que matchee gana
// (ya vienen ordenadas por prioridad DESC).
function resolverZonaDesdeReferral(referral) {
  if (!referral) return null;
  const reglas = getReglasCacheadas();
  if (!reglas || !reglas.length) return null;

  const valores = {
    ad_id: referral.source_id || null,
    ad_name: referral.headline || null,
    source_url: referral.source_url || null,
  };
  for (const regla of reglas) {
    if (matchRegla(regla, valores[regla.campo])) {
      return { slug: regla.zona_slug, nombre: regla.zona_nombre };
    }
  }
  return null;
}

function vendedorCubreZona(vendedor, zonaSlug) {
  if (!vendedor || !zonaSlug) return false;
  const csv = vendedor.zonas || '';
  if (!csv) return false;
  return csv.split(',').map(s => s.trim()).filter(Boolean).includes(zonaSlug);
}

// `activos` debe venir ya ordenado por leads_activos ASC (getVendedoresActivos lo hace).
// Se conserva ese orden dentro del filtro: el primero que cubre la zona es el de menor
// carga ENTRE los que la cubren.
function pickVendedorPorZona(activos, zonaSlug) {
  if (!zonaSlug || !activos || !activos.length) return null;
  return activos.find(v => vendedorCubreZona(v, zonaSlug)) || null;
}

// Punto único de decisión de asesor para toda la app. hints: { zona, proyecto, origen }.
// Devuelve { vendedor, fuente } — fuente 'zona' | 'fallback' (útil para marcar el lead
// como fuera de zona cuando nadie cubre la que le tocaba).
function elegirVendedor(activos, hints) {
  if (!activos || !activos.length) return { vendedor: null, fuente: null };
  const { zona } = hints || {};

  const porZona = pickVendedorPorZona(activos, zona);
  if (porZona) return { vendedor: porZona, fuente: 'zona' };

  // Nadie cubre la zona (o no hay zona) → mismo comportamiento de siempre: menor carga
  // global, con preferencia por especialización de proyecto/ciudad/origen si aplica.
  const { pickVendedorInteligente } = require('./assigner');
  const vendedor = pickVendedorInteligente(activos, hints);
  return { vendedor, fuente: zona ? 'fallback' : null };
}

module.exports = {
  resolverZonaDesdeReferral,
  vendedorCubreZona,
  pickVendedorPorZona,
  elegirVendedor,
  invalidateReglasCache,
};
