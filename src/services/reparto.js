// Reparto de leads entre GRUPOS (Red de externos vs equipo Leons) y, dentro de cada
// grupo, entre asesores según su carga efectiva (ponderada por nivel de gamificación).
//
// Es el complemento de services/zonas.js: zonas.elegirVendedor() sigue siendo el punto
// único de decisión de asesor para toda la app, pero delega en este módulo dos cosas
// nuevas — (1) a qué grupo va el lead según la cuota configurable, y (2) cómo pesa el
// nivel del asesor en el reparto interno. Con la Red en cuota_pct=0 y todos los pesos en
// 1 (sin gamificación aún), el comportamiento es idéntico al histórico.

// Peso de nivel del asesor en el reparto. Un Diamante con peso 2.0 recibe el doble que un
// Bronce (peso 1.0) a igualdad de todo lo demás, pero nadie queda en cero — es la carga
// EFECTIVA (= leads_activos / peso) la que se minimiza, no el conteo crudo. niveles.js
// (Fase 3) provee el peso real; hasta entonces todos pesan 1 y nada cambia.
function pesoNivel(vendedor) {
  try {
    const niveles = require('./niveles');
    if (niveles && typeof niveles.pesoDeVendedor === 'function') {
      const p = Number(niveles.pesoDeVendedor(vendedor));
      if (p > 0) return p;
    }
  } catch (e) { /* niveles aún no existe → peso neutro */ }
  return 1;
}

function grupoDe(vendedor) {
  return Number(vendedor && vendedor.grupo_id != null ? vendedor.grupo_id : 1);
}

// Grupos que HOY pueden recibir leads: activos, con cuota>0, y con al menos un asesor
// elegible en el pool (`activos` ya excluye externos sin suscripción vigente).
function gruposElegibles(activos) {
  const store = require('../db/store');
  let grupos;
  try { grupos = store.getGrupos(); } catch (e) { return []; }
  const conAsesores = new Set((activos || []).map(grupoDe));
  return (grupos || []).filter(g => g.activo && Number(g.cuota_pct) > 0 && conAsesores.has(Number(g.id)));
}

// Elige el grupo destino de un lead NUEVO según la cuota, con reparto de mayor resto
// (Hamilton) sobre un cursor persistido en config: determinista, reproducible y auditable.
// Con Leons=60/Red=40, de cada 10 leads exactamente 6 caen en Leons y 4 en la Red.
function elegirGrupo(activos) {
  const store = require('../db/store');
  const elegibles = gruposElegibles(activos);

  // Ningún grupo con cuota>0 tiene asesores disponibles → degradar a cualquiera con
  // asesores para NO perder el lead (p. ej. Red al 100% pero todos sin pagar).
  if (elegibles.length === 0) {
    const algun = (activos && activos.length) ? grupoDe(activos[0]) : 1;
    return { grupoId: algun, degradado: true };
  }
  if (elegibles.length === 1) return { grupoId: Number(elegibles[0].id), degradado: false };

  let cursor;
  try { cursor = JSON.parse(store.getConfig('reparto_cursor_json') || '{}'); } catch (e) { cursor = {}; }
  const asignados = cursor.asignados || {};
  const total = Number(cursor.total || 0);
  const sumaCuota = elegibles.reduce((s, g) => s + Number(g.cuota_pct), 0) || 1;

  let mejor = elegibles[0], mejorDeficit = -Infinity;
  for (const g of elegibles) {
    const objetivo = (Number(g.cuota_pct) / sumaCuota) * (total + 1);
    const deficit = objetivo - Number(asignados[g.id] || 0);
    if (deficit > mejorDeficit) { mejorDeficit = deficit; mejor = g; }
  }
  asignados[mejor.id] = Number(asignados[mejor.id] || 0) + 1;
  try { store.setConfig('reparto_cursor_json', JSON.stringify({ asignados, total: total + 1 })); } catch (e) {}
  return { grupoId: Number(mejor.id), degradado: false };
}

// Dentro de un grupo: reordena por carga efectiva (leads_activos / peso_nivel) ascendente
// y delega el desempate por especialización a pickVendedorInteligente (proyecto/ciudad/
// origen). Con todos los pesos en 1 el orden es idéntico al de getVendedoresActivos.
function pickPorCargaEfectiva(pool, hints) {
  if (!pool || !pool.length) return null;
  const conPeso = pool.map((v, i) => ({ v, i, ef: (Number(v.leads_activos) || 0) / pesoNivel(v) }));
  conPeso.sort((a, b) => a.ef - b.ef || a.i - b.i);
  const ordenado = conPeso.map(x => x.v);
  const { pickVendedorInteligente } = require('./assigner');
  return pickVendedorInteligente(ordenado, hints);
}

// Registro best-effort de una degradación de cuota (el grupo que tocaba no tenía asesores
// y el lead pasó al otro mundo) — para que se vea en /os/salud.html.
function registrarDegradacion(grupoIdEsperado, activos) {
  try {
    const store = require('../db/store');
    const g = store.getGrupoById(grupoIdEsperado);
    require('./timeline').registrarEvento({
      tipo: 'reparto_degradado', categoria: 'alertas', entidad: 'grupo', entidadId: grupoIdEsperado,
      titulo: 'Lead reasignado fuera de su grupo por cuota',
      descripcion: `El grupo ${g ? g.nombre : grupoIdEsperado} no tenía asesores disponibles; el lead pasó a otro grupo para no perderse.`,
      datos: { grupoEsperado: grupoIdEsperado, asesoresDisponibles: (activos || []).length },
    });
  } catch (e) { /* logging opcional */ }
}

module.exports = { pesoNivel, grupoDe, gruposElegibles, elegirGrupo, pickPorCargaEfectiva, registrarDegradacion };
