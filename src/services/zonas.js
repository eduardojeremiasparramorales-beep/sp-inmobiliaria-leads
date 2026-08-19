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

// Punto único de decisión de asesor para toda la app. hints: { zona, proyecto, origen,
// grupo }. Devuelve { vendedor, fuente, grupo, degradado } — fuente 'zona' | 'fallback'.
//
// Orden de decisión: (1) grupo destino — si el lead ya trae grupo sellado (reapertura o
// reasignación) se respeta y NUNCA cruza de mundo; si no, la cuota configurable decide
// (services/reparto.js). (2) se filtra el pool al grupo; si nadie del grupo puede tomarlo
// se degrada al resto para no perder el lead. (3) dentro del grupo: zona primero, luego
// menor carga EFECTIVA (ponderada por nivel de gamificación).
function elegirVendedor(activos, hints) {
  if (!activos || !activos.length) return { vendedor: null, fuente: null };
  hints = hints || {};
  const { zona } = hints;
  const reparto = require('./reparto');

  // 1) Grupo destino
  let grupoDestino = hints.grupo != null ? Number(hints.grupo) : null;
  let degradado = false;
  if (grupoDestino == null) {
    const r = reparto.elegirGrupo(activos);
    grupoDestino = r.grupoId; degradado = r.degradado;
  }

  // 2) Filtrar al grupo destino; degradar si nadie del grupo está disponible
  let pool = activos.filter(v => reparto.grupoDe(v) === grupoDestino);
  if (!pool.length) {
    reparto.registrarDegradacion(grupoDestino, activos);
    pool = activos;
    degradado = true;
  }

  // 3) Zona primero (F-zonas), luego carga efectiva por nivel
  const porZona = pickVendedorPorZona(pool, zona);
  if (porZona) return { vendedor: porZona, fuente: 'zona', grupo: grupoDestino, degradado };

  const vendedor = reparto.pickPorCargaEfectiva(pool, hints);
  return { vendedor, fuente: zona ? 'fallback' : null, grupo: grupoDestino, degradado };
}

module.exports = {
  resolverZonaDesdeReferral,
  vendedorCubreZona,
  pickVendedorPorZona,
  elegirVendedor,
  invalidateReglasCache,
};
