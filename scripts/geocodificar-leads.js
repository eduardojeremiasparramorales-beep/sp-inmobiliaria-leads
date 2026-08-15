/**
 * Relleno de coordenadas para los leads que ya estaban en la BD.
 *
 * El cron del servidor geocodifica 25 leads por hora, suficiente para el goteo diario
 * pero lento para una base histórica. Este script hace la pasada completa de una vez.
 *
 * Uso:
 *   node scripts/geocodificar-leads.js            # todos los pendientes
 *   node scripts/geocodificar-leads.js 200        # como mucho 200
 *   node scripts/geocodificar-leads.js --reintentar   # además, reencola los fallidos
 *
 * Nota: sin MAPBOX_TOKEN usa Nominatim, que exige ~1 petición por segundo — una base
 * de 500 leads tarda unos 10 minutos. Con token de Mapbox, menos de un minuto.
 *
 * Sobre --reintentar: hasta el arreglo de services/geocode.js, un timeout de red sellaba
 * `geocode_at` igual que un "esa ciudad no existe", y getLeadsSinCoordenadas() filtra por
 * `geocode_at IS NULL` — así que esos leads quedaron fuera del mapa DE FORMA PERMANENTE.
 * Ya no vuelve a ocurrir, pero los que se quemaron antes siguen marcados y hay que
 * devolverlos a la cola a mano. Después del hecho no se puede distinguir un fallo de red
 * de una ciudad inventada, así que se reencolan todos los que no tienen coordenadas: el
 * peor caso es un intento de más por lead, y el mejor es recuperar clientes reales.
 */
require('dotenv').config();
const store = require('../src/db/store');
const geocode = require('../src/services/geocode');

const LOTE = 25;

(async () => {
  await store.initDB();
  store.createSchema();

  const args = process.argv.slice(2);
  const reintentar = args.includes('--reintentar');
  const tope = Number(args.find(a => /^\d+$/.test(a))) || Infinity;
  let procesados = 0, resueltos = 0;

  if (reintentar) {
    const r = store.run('UPDATE leads SET geocode_at = NULL WHERE lat IS NULL AND geocode_at IS NOT NULL');
    console.log(`[GEOCODE] ${(r && r.changes) || 0} leads sin coordenadas devueltos a la cola.`);
  }

  console.log('[GEOCODE] Iniciando relleno de coordenadas de leads…');
  for (;;) {
    if (procesados >= tope) break;
    const r = await geocode.geocodificarPendientes(Math.min(LOTE, tope - procesados));
    if (!r.procesados) break; // no queda nada pendiente
    // Un lote que falla entero por red deja los leads en la cola a propósito (para que se
    // reintenten luego), así que la siguiente vuelta pediría exactamente los mismos: sin
    // este corte el bucle no termina nunca mientras el proveedor esté caído.
    if (r.fallosRed && !r.resueltos) {
      console.error('[GEOCODE] El proveedor no responde. Se corta aquí; los leads siguen pendientes y se reintentan en la próxima ejecución.');
      break;
    }
    procesados += r.procesados;
    resueltos += r.resueltos;
    console.log(`[GEOCODE] Progreso: ${resueltos}/${procesados} resueltos`);
  }

  console.log(`[GEOCODE] Terminado. ${resueltos} de ${procesados} leads quedaron ubicados en el mapa.`);
  if (procesados > resueltos) {
    console.log('[GEOCODE] Los no resueltos no tenían ciudad utilizable: no se les inventa una posición, simplemente no aparecen en el mapa.');
  }
  // En producción manda better-sqlite3, que persiste solo. En desarrollo el fallback es
  // sql.js, que vuelca a disco con un auto-guardado de 500 ms: salir de inmediato se lleva
  // por delante todo lo que acaba de geocodificar. Hay que forzar el volcado antes de irse.
  try { require('../src/db/adapter').flushAll(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error('[GEOCODE] Error fatal:', e.message); process.exit(1); });
