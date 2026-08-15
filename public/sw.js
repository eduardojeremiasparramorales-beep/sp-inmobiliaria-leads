/* Service Worker — Leons Group Panel
   - Cachea el "app shell" para carga rápida/offline.
   - NUNCA cachea /api/* (datos siempre frescos desde la red).
   - Maneja notificaciones push (Fase 4).
*/
// El servidor reemplaza __SW_VERSION__ en cada reinicio → invalida caché en cada deploy
const CACHE = '__SW_VERSION__';

// Teselas del mapa: caché APARTE y con versión propia, deliberadamente desligada del
// deploy. Si vivieran en CACHE, cada despliegue borraría cientos de piezas que el asesor
// ya descargó — incluidas las que guardó a propósito para trabajar sin señal.
const CACHE_TILES = 'sp-tiles-v1';
const HOSTS_TILES = ['basemaps.cartocdn.com', 'api.mapbox.com', 'tile.openstreetmap.org'];
const MAX_TILES = 1200;   // ~40 MB con teselas @2x; por encima se recorta lo más viejo
const esTesela = (url) => HOSTS_TILES.some((h) => url.hostname.endsWith(h));
const SHELL = [
  '/login.html',
  '/index.html',
  '/m/',
  '/m/index.html',
  '/os/sp-os.css',
  '/sw-reg.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== CACHE_TILES).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Recorte LRU: las claves salen en orden de inserción, así que las primeras son las más
// viejas. Sin esto, la caché de teselas crecería sin techo hasta que el navegador la
// desalojara entera de golpe — y el asesor perdería justo el mapa que había guardado.
async function recortarTeselas(cache) {
  const claves = await cache.keys();
  if (claves.length <= MAX_TILES) return;
  await Promise.all(claves.slice(0, claves.length - MAX_TILES).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  // Teselas del mapa (cross-origin): caché primero y revalidación en segundo plano. Una
  // tesela ya descargada no cambia casi nunca, y servirla del disco es lo que hace que el
  // mapa siga funcionando en una vereda sin señal.
  if (esTesela(url)) {
    event.respondWith(
      caches.open(CACHE_TILES).then((cache) =>
        cache.match(req).then((cached) => {
          const red = fetch(req).then((res) => {
            // Una respuesta opaca (type 'opaque') no se puede validar y engorda la cuota;
            // se sirve pero no se guarda.
            if (res && res.ok && res.type !== 'opaque') {
              cache.put(req, res.clone()).then(() => recortarTeselas(cache)).catch(() => {});
            }
            return res;
          }).catch(() => cached);
          return cached || red;
        })
      )
    );
    return;
  }

  // El resto: solo mismo origen
  if (url.origin !== self.location.origin) return;

  // API y streams: siempre red, nunca caché
  if (url.pathname.startsWith('/api/')) return;

  // Navegación / HTML / JS / CSS: red primero, caché de respaldo
  // (JS/CSS red-primero evita que el shell viejo quede pegado tras un deploy)
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')
      || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Estáticos (iconos, manifest, etc): caché primero
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }))
  );
});

// --- Notificaciones push (Fase 4) ---
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Leons Group';
  const options = {
    body: data.body || 'Tienes un nuevo mensaje de un cliente.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [120, 60, 120],
    tag: data.tag || 'sp-lead',
    renotify: true,
    data: { leadId: data.leadId || null, url: '/m/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const leadId = event.notification.data && event.notification.data.leadId;
  const targetUrl = leadId ? `/m/?lead=${leadId}` : '/m/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ((client.url.includes('/m/')) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'open_lead', leadId });
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
