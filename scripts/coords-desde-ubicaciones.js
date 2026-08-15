/**
 * Recupera coordenadas EXACTAS de los leads a partir de las ubicaciones que sus clientes
 * ya habían compartido por WhatsApp.
 *
 * Esos pines llevaban tiempo guardándose en `messages` (media_type='location') sin que
 * nadie los aprovechara: el mapa pintaba a todo el mundo en el centroide de su ciudad,
 * aunque hubiera un punto real disponible. Esta pasada lo corrige de una vez para el
 * histórico; de aquí en adelante se guarda solo, al recibir el mensaje (assigner.js).
 *
 * La geocodificación por ciudad NO pisa lo que escribe este script: la precedencia vive
 * en store.setLeadCoords().
 *
 * Uso:
 *   node scripts/coords-desde-ubicaciones.js          # hasta 1000 leads
 *   node scripts/coords-desde-ubicaciones.js 5000     # tope explícito
 */
require('dotenv').config();
const store = require('../src/db/store');

(async () => {
  await store.initDB();
  store.createSchema();

  const limite = Number(process.argv[2]) || 1000;
  console.log('[COORDS] Buscando ubicaciones compartidas en el histórico de mensajes…');
  const r = store.backfillCoordsDesdeUbicaciones(limite);
  console.log(`[COORDS] ${r.aplicados}/${r.revisados} leads con coordenadas exactas recuperadas.`);
  if (r.revisados === 0) {
    console.log('[COORDS] Ningún cliente ha compartido su ubicación todavía — nada que recuperar.');
  }
  process.exit(0);
})().catch((e) => { console.error('[COORDS] Falló:', e.message); process.exit(1); });
