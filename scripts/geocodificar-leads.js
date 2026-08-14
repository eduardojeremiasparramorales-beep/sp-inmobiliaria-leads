/**
 * Relleno de coordenadas para los leads que ya estaban en la BD.
 *
 * El cron del servidor geocodifica 25 leads por hora, suficiente para el goteo diario
 * pero lento para una base histórica. Este script hace la pasada completa de una vez.
 *
 * Uso:
 *   node scripts/geocodificar-leads.js            # todos los pendientes
 *   node scripts/geocodificar-leads.js 200        # como mucho 200
 *
 * Nota: sin MAPBOX_TOKEN usa Nominatim, que exige ~1 petición por segundo — una base
 * de 500 leads tarda unos 10 minutos. Con token de Mapbox, menos de un minuto.
 */
require('dotenv').config();
const store = require('../src/db/store');
const geocode = require('../src/services/geocode');

const LOTE = 25;

(async () => {
  await store.initDB();
  store.createSchema();

  const tope = Number(process.argv[2]) || Infinity;
  let procesados = 0, resueltos = 0;

  console.log('[GEOCODE] Iniciando relleno de coordenadas de leads…');
  for (;;) {
    if (procesados >= tope) break;
    const r = await geocode.geocodificarPendientes(Math.min(LOTE, tope - procesados));
    if (!r.procesados) break; // no queda nada pendiente
    procesados += r.procesados;
    resueltos += r.resueltos;
    console.log(`[GEOCODE] Progreso: ${resueltos}/${procesados} resueltos`);
  }

  console.log(`[GEOCODE] Terminado. ${resueltos} de ${procesados} leads quedaron ubicados en el mapa.`);
  if (procesados > resueltos) {
    console.log('[GEOCODE] Los no resueltos no tenían ciudad utilizable: no se les inventa una posición, simplemente no aparecen en el mapa.');
  }
  process.exit(0);
})().catch(e => { console.error('[GEOCODE] Error fatal:', e.message); process.exit(1); });
