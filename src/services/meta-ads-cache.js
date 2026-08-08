// Caché en memoria para respuestas GET de la Graph API de Meta Ads.
// Antes cada carga del panel disparaba ~45 llamadas a Graph (una por campaña, más
// insights y ads por adset) — con TTL corto esto absorbe navegaciones/recargas
// repetidas sin pedirle a Meta datos que no cambiaron hace 60 segundos.
// Alcance: proceso único (no compartido entre instancias), suficiente para el
// tamaño de esta cuenta — no vale la pena Redis para esto.

const store = new Map(); // key -> { value, expiresAt }

function makeKey(path, params) {
  const sorted = Object.keys(params || {}).sort().map(k => `${k}=${params[k]}`).join('&');
  return `${path}?${sorted}`;
}

function get(path, params) {
  const key = makeKey(path, params);
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { store.delete(key); return undefined; }
  return entry.value;
}

function set(path, params, value, ttlMs) {
  const key = makeKey(path, params);
  store.set(key, { value, expiresAt: Date.now() + (ttlMs || 60000) });
}

// Invalida todo lo que empiece por un prefijo de ruta — se llama tras cualquier
// mutación (pausar, editar presupuesto, crear campaña...) para que la siguiente
// lectura no sirva datos obsoletos hasta el próximo TTL natural.
function invalidate(pathPrefix) {
  for (const key of store.keys()) {
    if (key.startsWith(pathPrefix)) store.delete(key);
  }
}

function clear() { store.clear(); }

module.exports = { get, set, invalidate, clear };
