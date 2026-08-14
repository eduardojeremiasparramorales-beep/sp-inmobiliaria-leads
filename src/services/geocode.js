/**
 * Geocodificación de direcciones → coordenadas, para poder pintar los clientes en el
 * mapa del equipo.
 *
 * Los leads del CRM no traen coordenadas: llegan de WhatsApp con, como mucho, una
 * ciudad y una zona en texto libre. Este servicio convierte ese texto en un punto.
 *
 * Dos decisiones que evitan gastar de más y ensuciar el mapa:
 *  - Caché por texto normalizado: "Tocaima" se resuelve UNA vez, no una por lead.
 *    La mayoría de leads comparten un puñado de ciudades, así que el ahorro es enorme.
 *  - Un lead que no se puede resolver queda marcado como intentado y SIN pin. Antes de
 *    inventarle una posición aproximada, es preferible que no aparezca: un pin en el
 *    lugar equivocado hace que un asesor se desplace en vano.
 */

const axios = require('axios');
const store = require('../db/store');

const CACHE = new Map();          // texto normalizado -> { lat, lng } | null
const MAX_CACHE = 500;
const PAIS = 'co';

function tokenMapbox() {
  return process.env.MAPBOX_TOKEN || store.getConfig('mapbox_token') || '';
}

function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Texto de búsqueda de un lead: lo más específico que tengamos. La ciudad manda; la
// zona y el proyecto solo aportan si no hay ciudad, porque son nombres internos
// ("bella_vista") que ningún geocodificador conoce.
function textoDeLead(lead) {
  const partes = [];
  if (lead.ciudad) partes.push(lead.ciudad);
  else if (lead.proyecto) partes.push(String(lead.proyecto).replace(/[_-]+/g, ' '));
  else if (lead.zona) partes.push(String(lead.zona).replace(/[_-]+/g, ' '));
  if (!partes.length) return null;
  return partes.join(', ') + ', Colombia';
}

/** Resuelve un texto a { lat, lng }, o null si no hay resultado utilizable. */
async function geocodificar(texto) {
  const clave = normalizar(texto);
  if (!clave) return null;
  if (CACHE.has(clave)) return CACHE.get(clave);

  let punto = null;
  try {
    const token = tokenMapbox();
    if (token) {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(texto)}.json`;
      const r = await axios.get(url, { params: { access_token: token, country: PAIS, language: 'es', limit: 1 }, timeout: 8000 });
      const f = (r.data && r.data.features && r.data.features[0]) || null;
      if (f && Array.isArray(f.center)) punto = { lat: f.center[1], lng: f.center[0] };
    } else {
      // Sin token de Mapbox se usa Nominatim, que es gratuito pero pide identificarse y
      // limita a ~1 petición por segundo (ver pausa en geocodificarPendientes).
      const r = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q: texto, format: 'jsonv2', limit: 1, countrycodes: PAIS, 'accept-language': 'es' },
        headers: { 'User-Agent': 'SpLeonsCRM/1.0 (contacto@spleons.co)' }, timeout: 8000,
      });
      const f = (r.data && r.data[0]) || null;
      if (f) punto = { lat: parseFloat(f.lat), lng: parseFloat(f.lon) };
    }
  } catch (e) {
    console.error('[GEOCODE] error resolviendo', texto, '—', e.message);
    return null; // no se cachea el fallo de red: puede ser transitorio
  }

  if (CACHE.size >= MAX_CACHE) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(clave, punto);
  return punto;
}

/** Geocodifica un lead concreto. Devuelve el punto o null. */
async function geocodificarLead(lead) {
  const texto = textoDeLead(lead);
  if (!texto) { store.marcarLeadSinGeocodificar(lead.id); return null; }
  const punto = await geocodificar(texto);
  if (punto) store.setLeadCoords(lead.id, punto.lat, punto.lng);
  else store.marcarLeadSinGeocodificar(lead.id);
  return punto;
}

/**
 * Pasada por lotes sobre los leads sin coordenadas. Se llama desde el cron y desde el
 * script de relleno. `limite` acota cuántos por pasada para no bloquear el proceso ni
 * disparar el rate limit del proveedor.
 */
async function geocodificarPendientes(limite = 25) {
  const pendientes = store.getLeadsSinCoordenadas(limite);
  if (!pendientes.length) return { procesados: 0, resueltos: 0 };
  const conToken = !!tokenMapbox();
  let resueltos = 0;
  for (const lead of pendientes) {
    const p = await geocodificarLead(lead);
    if (p) resueltos++;
    // Nominatim exige como máximo 1 petición por segundo; Mapbox aguanta mucho más.
    await new Promise(r => setTimeout(r, conToken ? 120 : 1100));
  }
  console.log(`[GEOCODE] ${resueltos}/${pendientes.length} leads geocodificados`);
  return { procesados: pendientes.length, resueltos };
}

/** Distancia en metros entre dos puntos (Haversine) — la usa el filtro "leads cerca". */
function distanciaMetros(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

module.exports = { geocodificar, geocodificarLead, geocodificarPendientes, distanciaMetros, textoDeLead };
