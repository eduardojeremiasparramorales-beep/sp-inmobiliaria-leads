/* ============================================================================
   SP Mapa — núcleo compartido de mapas (window.SPMapa)
   ----------------------------------------------------------------------------
   Un solo sitio para lo que antes estaba copiado en cuatro: la carga perezosa de
   Leaflet, el proveedor de teselas, el buscador de lugares y la geocodificación
   inversa vivían duplicados en public/m/app.js, public/os/mapa-core.js,
   public/os/inbox.html y public/os/equipo-interno.html — con derivas entre copias
   (una tenía el fallback claro, otra no; los colores no coincidían con la marca).

   Script CLÁSICO, no módulo ES: lo cargan tanto las páginas de /os/ (que usan
   <script> sueltos, sin bundler) como public/m/app.js (que se minifica con esbuild
   en modo bundle:false y depende de que las globales sigan siendo globales).

   No depende de SPOS, SPS ni de las globales del panel móvil: su única llamada
   propia es GET /api/mapa/config, que se resuelve con fetch + cookie de sesión.
   Esa independencia es justo lo que permite cargarlo en las tres superficies.
   ============================================================================ */
(function () {
  'use strict';

  var LEAFLET_CSS = '/vendor/leaflet/leaflet.css';
  var LEAFLET_JS = '/vendor/leaflet/leaflet.js';
  var MAPA_CSS = '/shared/mapa.css';

  /* ══════════════════ Carga perezosa de Leaflet ══════════════════ */
  // Memoizada: varias vistas pueden pedirla a la vez (el inbox tiene un minimapa por
  // mensaje) y Leaflet solo debe inyectarse una vez.
  var _leafletP = null;

  function cargarCSS(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }

  function cargarLeaflet() {
    if (_leafletP) return _leafletP;
    _leafletP = new Promise(function (res, rej) {
      if (window.L) { cargarCSS(LEAFLET_CSS); cargarCSS(MAPA_CSS); return res(window.L); }
      // El ORDEN importa: mapa.css tiene que ir DESPUÉS de leaflet.css para ganar la
      // cascada a igualdad de especificidad. Por eso el tema no vive en sp-os.css, que
      // se carga estático en el <head> y por tanto queda siempre por debajo.
      cargarCSS(LEAFLET_CSS);
      cargarCSS(MAPA_CSS);
      var s = document.createElement('script');
      s.src = LEAFLET_JS;
      s.onload = function () { res(window.L); };
      s.onerror = function () { _leafletP = null; rej(new Error('leaflet_no_cargo')); };
      document.head.appendChild(s);
    });
    return _leafletP;
  }

  /* ══════════════════ Configuración del proveedor ══════════════════ */
  var _cfgP = null;

  function getConfig() {
    if (_cfgP) return _cfgP;
    _cfgP = fetch('/api/mapa/config', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (c) { return c || { proveedor: 'carto', token: '', pais: 'co' }; });
    return _cfgP;
  }

  /* ══════════════════ Tokens de color del sistema de diseño ══════════════════
     Leaflet pinta polilíneas y circleMarker sobre SVG/Canvas mediante ATRIBUTOS de
     color: ahí `var(--gold)` no se resuelve, hay que pasar el literal. Dentro del
     HTML de un L.divIcon sí funciona var(), porque eso es DOM real.
     Antes esto se resolvía escribiendo '#C8A45A' a mano, que además ni siquiera era
     el oro de la marca (--gold es #FFD76A) y se descolgaba del tema claro. */
  var _tokens = {};

  function token(nombre) {
    if (_tokens[nombre]) return _tokens[nombre];
    var v = '';
    try { v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim(); } catch (e) {}
    _tokens[nombre] = v || '#FFD76A';
    return _tokens[nombre];
  }

  function temaActual() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  /* ══════════════════ Teselas ══════════════════ */
  // CARTO por defecto: da un mapa OSCURO sin token ni cuenta, que es lo que la marca
  // pide. Antes, sin token de Mapbox se caía a OpenStreetMap CLARO sobre una interfaz
  // negra. Mapbox sigue teniendo prioridad si hay token configurado, porque su
  // cobertura de nombres en Colombia es mejor.
  var TILES = {
    mapbox: function (cfg, oscuro) {
      return {
        url: 'https://api.mapbox.com/styles/v1/mapbox/' + (oscuro ? 'dark-v11' : 'light-v11') +
             '/tiles/512/{z}/{x}/{y}@2x?access_token=' + encodeURIComponent(cfg.token),
        opts: { maxZoom: 19, tileSize: 512, zoomOffset: -1, attribution: '© Mapbox © OpenStreetMap' },
      };
    },
    carto: function (cfg, oscuro) {
      return {
        url: 'https://{s}.basemaps.cartocdn.com/' + (oscuro ? 'dark_all' : 'light_all') + '/{z}/{x}/{y}{r}.png',
        opts: { maxZoom: 20, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO' },
      };
    },
  };

  function capaTiles(cfg, opciones) {
    var o = opciones || {};
    var oscuro = o.tema ? o.tema === 'dark' : temaActual() === 'dark';
    var def = (cfg && cfg.proveedor === 'mapbox' && cfg.token) ? TILES.mapbox(cfg, oscuro) : TILES.carto(cfg, oscuro);
    var opts = Object.assign({}, def.opts, {
      // No es cosmético: sin crossOrigin la respuesta es opaca, y una respuesta opaca no
      // se puede inspeccionar ni cachear en el Service Worker sin devorar la cuota.
      crossOrigin: 'anonymous',
      // Un tile que falla deja un hueco transparente por el que se ve el fondo del
      // contenedor (ya oscuro por mapa.css), en vez del cuadro blanco del navegador.
      errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    });
    return L.tileLayer(def.url, opts);
  }

  // Cambia la capa base en vivo cuando el usuario alterna claro/oscuro. Devuelve la capa
  // nueva para que quien la llame conserve la referencia.
  function aplicarTema(map, capaVieja, cfg) {
    if (capaVieja) { try { map.removeLayer(capaVieja); } catch (e) {} }
    var nueva = capaTiles(cfg);
    nueva.addTo(map);
    if (nueva.bringToBack) nueva.bringToBack();
    return nueva;
  }

  /* ══════════════════ Búsqueda de lugares ══════════════════ */
  // Mismo shape de salida venga de donde venga, para que la UI no distinga proveedores.
  // `cerca` sesga los resultados: buscar "el centro" debe proponer primero el de la
  // ciudad que el asesor está mirando, no el de Bogotá.
  function buscarLugares(q, cerca) {
    return getConfig().then(function (cfg) {
      if (cfg.proveedor === 'mapbox' && cfg.token) {
        var prox = cerca ? '&proximity=' + cerca.lng + ',' + cerca.lat : '';
        var url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + encodeURIComponent(q) + '.json'
          + '?access_token=' + encodeURIComponent(cfg.token)
          + '&country=' + (cfg.pais || 'co') + '&language=es&limit=6&autocomplete=true' + prox;
        return fetch(url).then(function (r) {
          if (!r.ok) throw new Error('mapbox_' + r.status);
          return r.json();
        }).then(function (d) {
          return (d.features || []).map(function (f) {
            return { nombre: f.text || '', direccion: f.place_name || '', lat: f.center[1], lng: f.center[0] };
          });
        });
      }
      return fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&q=' + encodeURIComponent(q)
        + '&limit=6&countrycodes=co&accept-language=es').then(function (r) {
        if (!r.ok) throw new Error('nominatim_' + r.status);
        return r.json();
      }).then(function (d) {
        return (d || []).map(function (x) {
          return { nombre: x.name || '', direccion: x.display_name || '', lat: parseFloat(x.lat), lng: parseFloat(x.lon) };
        });
      });
    });
  }

  function geocodInverso(lat, lng) {
    return getConfig().then(function (cfg) {
      if (cfg.proveedor === 'mapbox' && cfg.token) {
        return fetch('https://api.mapbox.com/geocoding/v5/mapbox.places/' + lng + ',' + lat + '.json'
          + '?access_token=' + encodeURIComponent(cfg.token) + '&language=es&limit=1')
          .then(function (r) { if (!r.ok) throw new Error('mapbox_' + r.status); return r.json(); })
          .then(function (d) {
            var f = (d.features || [])[0];
            return { nombre: (f && f.text) || '', direccion: (f && f.place_name) || '' };
          });
      }
      return fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + lat + '&lon=' + lng
        + '&accept-language=es')
        .then(function (r) { if (!r.ok) throw new Error('nominatim_' + r.status); return r.json(); })
        .then(function (d) { return { nombre: (d && d.name) || '', direccion: (d && d.display_name) || '' }; });
    });
  }

  /* ══════════════════ Geometría y tiempo ══════════════════ */
  function distanciaMetros(a, b) {
    if (!a || !b) return Infinity;
    var R = 6371000, rad = function (x) { return x * Math.PI / 180; };
    var dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    var s = Math.pow(Math.sin(dLat / 2), 2)
      + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // "1,2 km" / "340 m" — a un asesor le sirve la magnitud, no seis decimales.
  function distanciaLegible(m) {
    if (!isFinite(m)) return '';
    return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
  }

  // Todo se guarda en UTC y se muestra en hora de Bogotá, sin importar el reloj del
  // dispositivo — misma convención que el resto del CRM (src/utils/tiempo.js).
  function horaCorta(ts) {
    if (!ts) return '';
    var s = String(ts);
    var d = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(s) ? new Date(s) : new Date(s.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
  }

  // El día de HOY según el calendario de Bogotá. new Date().toISOString().slice(0,10)
  // devuelve el día equivocado a partir de las 19:00 hora local (ya es el día siguiente
  // en UTC) — que es exactamente el bug que se arregló en el recorrido del asesor.
  function hoyBogota() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  }

  /* ══════════════════ Frescura de una posición ══════════════════
     La diferencia entre informar y engañar: la app del asesor solo reporta con la
     pantalla encendida, así que un marcador NUNCA debe pintarse como "en vivo" si su
     última posición es de hace media hora. */
  var MIN_FRESCO = 5, MIN_TIBIO = 30;

  function frescura(ts) {
    if (!ts) return { clase: 'fria', label: 'sin datos', color: token('--text-3') };
    var s = String(ts);
    var d = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(s) ? new Date(s) : new Date(s.replace(' ', 'T') + 'Z');
    var min = (Date.now() - d.getTime()) / 60000;
    if (isNaN(min)) return { clase: 'fria', label: 'sin datos', color: token('--text-3') };
    if (min < MIN_FRESCO) return { clase: 'viva', label: 'en vivo', color: token('--green') };
    if (min < MIN_TIBIO) return { clase: 'tibia', label: 'hace ' + Math.round(min) + ' min', color: token('--gold') };
    if (min < 60 * 24) return { clase: 'fria', label: 'hace ' + Math.round(min / 60) + ' h', color: token('--text-3') };
    return { clase: 'fria', label: 'hace más de un día', color: token('--text-3') };
  }

  /* ══════════════════ Etapas del pipeline ══════════════════
     Un solo diccionario para el color de los pines de cliente. Antes vivía suelto en
     mapa-core.js y el panel móvil tenía su propio juego de clases CSS: al añadir una
     etapa había que acordarse de tocar los dos. Se define por función (no como objeto
     literal) porque los colores salen de los tokens del tema, que cambian en vivo. */
  var ETAPAS = {
    sin_clasificar: { label: 'Nuevo', tk: '--text-3' },
    nuevo: { label: 'Nuevo', tk: '--text-3' },
    interesado: { label: 'Interesado', tk: '--gold' },
    cita: { label: 'Cita', tk: '--blue' },
    negociacion: { label: 'Negociación', tk: '--amber' },
    vendido: { label: 'Vendido', tk: '--green' },
    perdido: { label: 'Perdido', tk: '--red' },
    no_interesado: { label: 'No interesado', tk: '--red' },
  };

  function etapa(clave) {
    var e = ETAPAS[clave] || ETAPAS.sin_clasificar;
    return { label: e.label, color: token(e.tk) };
  }

  function etapasDisponibles() {
    // Sin duplicar los alias ('nuevo' es lo mismo que 'sin_clasificar' en la práctica).
    return ['sin_clasificar', 'interesado', 'cita', 'negociacion', 'vendido', 'no_interesado']
      .map(function (k) { return Object.assign({ clave: k }, etapa(k)); });
  }

  // Punto de color estándar para clientes, proyectos y cualquier capa de puntos.
  function pinPunto(color, opciones) {
    var o = opciones || {};
    var d = o.tam || 14;
    var borde = o.punteado
      ? '2px dashed var(--text-3)'   // coordenada aproximada (deducida de la ciudad)
      : '2px solid var(--bg-0)';     // coordenada exacta compartida por el cliente
    return L.divIcon({
      className: 'mapa-pin',
      html: '<span style="display:block;width:' + d + 'px;height:' + d + 'px;border-radius:50%;'
        + 'background:' + color + ';border:' + borde + ';box-shadow:0 1px 5px rgba(0,0,0,.6)"></span>',
      iconSize: [d, d], iconAnchor: [d / 2, d / 2],
    });
  }

  /* ══════════════════ Navegación externa ══════════════════ */
  // Universal links https, no esquemas propietarios (waze:// / comgooglemaps://): los
  // https abren la app nativa si está instalada y caen al navegador si no, sin tener que
  // declarar esquemas ni adivinar qué tiene el asesor en el celular.
  function urlNavegacion(prov, lat, lng, label) {
    if (prov === 'waze') return 'https://waze.com/ul?ll=' + lat + ',' + lng + '&navigate=yes';
    if (prov === 'geo') return 'geo:' + lat + ',' + lng + '?q=' + lat + ',' + lng + '(' + encodeURIComponent(label || '') + ')';
    return 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng + '&travelmode=driving';
  }

  function abrirNavegacion(lat, lng, label, prov) {
    var url = urlNavegacion(prov || 'google', lat, lng, label);
    var w = null;
    try { w = window.open(url, '_blank', 'noopener'); } catch (e) {}
    // Algunos WebViews devuelven null aunque vayan a abrir el Intent; se da un margen
    // antes de navegar en la propia ventana para no duplicar la apertura.
    if (!w) setTimeout(function () { try { location.href = url; } catch (e) {} }, 400);
  }

  /* ══════════════════ Agrupación de pines por rejilla ══════════════════
     Alternativa propia a Leaflet.markercluster: son ~35 KB más un CSS con colores
     fijos que habría que volver a sobrescribir, y nuestros conjuntos son de ≤500
     puntos — dos órdenes de magnitud por debajo de donde markercluster compensa.

     puntos: [{ lat, lng, ...datos }]
     opts: { celdaPx, crearPin(punto) -> L.Layer, alClicCluster(bounds, items) }
     Devuelve un controlador con { capa, actualizar(), destruir() }. */
  function agrupar(map, puntos, opts) {
    var o = opts || {};
    var celda = o.celdaPx || 64;
    var capa = L.layerGroup().addTo(map);
    var timer = null;

    function pinCluster(n) {
      var d = n > 99 ? 44 : n > 9 ? 38 : 32;
      return L.divIcon({
        className: 'sp-cluster',
        html: '<span style="display:grid;place-items:center;width:' + d + 'px;height:' + d + 'px;border-radius:50%;'
          + 'background:var(--gold-soft);border:1.5px solid var(--gold-line);color:var(--gold);'
          + 'font:600 ' + (n > 99 ? 12 : 13) + 'px/1 var(--f-ui,Inter,sans-serif);'
          + 'backdrop-filter:blur(3px);box-shadow:0 2px 10px rgba(0,0,0,.45)">' + n + '</span>',
        iconSize: [d, d], iconAnchor: [d / 2, d / 2],
      });
    }

    function pintar() {
      capa.clearLayers();
      if (!puntos || !puntos.length) return;
      var z = map.getZoom();
      // pad(0.2): se agrupa un poco más allá del borde para que al arrastrar no aparezcan
      // pines "saltando" de cluster a suelto justo en el filo de la pantalla.
      var vista = map.getBounds().pad(0.2);
      var grupos = {};
      for (var i = 0; i < puntos.length; i++) {
        var p = puntos[i];
        if (p.lat == null || p.lng == null) continue;
        var ll = L.latLng(p.lat, p.lng);
        if (!vista.contains(ll)) continue;
        var xy = map.project(ll, z);
        var k = Math.floor(xy.x / celda) + ':' + Math.floor(xy.y / celda);
        (grupos[k] || (grupos[k] = [])).push(p);
      }
      Object.keys(grupos).forEach(function (k) {
        var items = grupos[k];
        if (items.length === 1) { var capaPin = o.crearPin(items[0]); if (capaPin) capa.addLayer(capaPin); return; }
        var lat = 0, lng = 0;
        items.forEach(function (p) { lat += p.lat; lng += p.lng; });
        var centro = [lat / items.length, lng / items.length];
        var m = L.marker(centro, { icon: pinCluster(items.length) });
        m.on('click', function () {
          var b = L.latLngBounds(items.map(function (p) { return [p.lat, p.lng]; }));
          if (o.alClicCluster) o.alClicCluster(b, items);
          else map.fitBounds(b.pad(0.3), { maxZoom: 17 });
        });
        capa.addLayer(m);
      });
    }

    function programar() { clearTimeout(timer); timer = setTimeout(pintar, 120); }

    map.on('zoomend moveend', programar);
    pintar();

    return {
      capa: capa,
      actualizar: function (nuevos) { if (nuevos) puntos = nuevos; pintar(); },
      destruir: function () {
        clearTimeout(timer);
        map.off('zoomend moveend', programar);
        try { map.removeLayer(capa); } catch (e) {}
      },
    };
  }

  /* ══════════════════ Selector de ubicación ══════════════════
     Minimapa con buscador y marcador arrastrable. Es el mismo gesto en tres sitios
     distintos (marcar un proyecto, marcar una zona, enviar una ubicación a un cliente),
     así que se escribe una vez.

     el: contenedor · opts: { lat, lng, zoom, radioKm, onCambio({lat,lng,nombre,direccion}) }
     Devuelve { map, mover(lat,lng), setRadio(km), destruir() }. */
  function pickerUbicacion(el, opciones) {
    var o = opciones || {};
    var estado = { lat: o.lat != null ? o.lat : 4.7110, lng: o.lng != null ? o.lng : -74.0721, nombre: '', direccion: '' };
    var map = null, marcador = null, circulo = null, buscador = null, resultados = null;

    var lienzo = document.createElement('div');
    lienzo.style.cssText = 'height:' + (o.alto || '260px') + ';border-radius:14px;overflow:hidden;background:var(--bg-3)';
    var caja = document.createElement('div');
    caja.style.cssText = 'position:relative;margin-bottom:8px';
    buscador = document.createElement('input');
    buscador.placeholder = 'Buscar dirección, barrio o ciudad…';
    buscador.autocomplete = 'off';
    buscador.style.cssText = 'width:100%;height:38px;border-radius:12px;border:1px solid var(--border);background:var(--bg-4);color:var(--text);padding:0 12px;font-size:13px;font-family:inherit';
    resultados = document.createElement('div');
    resultados.style.cssText = 'display:none;position:absolute;top:41px;left:0;right:0;z-index:900;background:var(--bg-2);border:1px solid var(--border);border-radius:12px;overflow:hidden;max-height:200px;overflow-y:auto';
    caja.appendChild(buscador); caja.appendChild(resultados);
    el.innerHTML = '';
    el.appendChild(caja); el.appendChild(lienzo);

    function avisar() { if (o.onCambio) o.onCambio(Object.assign({}, estado)); }

    function mover(lat, lng, extra) {
      estado.lat = lat; estado.lng = lng;
      if (extra) { estado.nombre = extra.nombre || ''; estado.direccion = extra.direccion || ''; }
      if (marcador) marcador.setLatLng([lat, lng]);
      if (circulo) circulo.setLatLng([lat, lng]);
      if (map) map.setView([lat, lng], map.getZoom() < 12 ? 14 : map.getZoom());
      avisar();
      // La dirección se resuelve después de avisar: quien escucha ya tiene las
      // coordenadas (que es lo que se guarda) sin esperar a la red.
      if (!extra) {
        geocodInverso(lat, lng).then(function (g) {
          estado.nombre = g.nombre; estado.direccion = g.direccion; avisar();
        }).catch(function () {});
      }
    }

    cargarLeaflet().then(function () {
      return getConfig();
    }).then(function (cfg) {
      if (!el.isConnected) return;   // el modal pudo cerrarse mientras cargaba
      map = L.map(lienzo, { zoomControl: true, attributionControl: true }).setView([estado.lat, estado.lng], o.zoom || 13);
      capaTiles(cfg).addTo(map);
      marcador = L.marker([estado.lat, estado.lng], { draggable: true }).addTo(map);
      marcador.on('dragend', function () { var p = marcador.getLatLng(); mover(p.lat, p.lng); });
      map.on('click', function (e) { mover(e.latlng.lat, e.latlng.lng); });
      if (o.radioKm != null) setRadio(o.radioKm);
      setTimeout(function () { if (map) map.invalidateSize(); }, 150);
    }).catch(function () {
      lienzo.innerHTML = '<div style="display:grid;place-items:center;height:100%;color:var(--text-3);font-size:12px">No se pudo cargar el mapa</div>';
    });

    function setRadio(km) {
      if (!map) return;
      var r = Number(km) > 0 ? Number(km) * 1000 : 0;
      if (!circulo) {
        circulo = L.circle([estado.lat, estado.lng], { radius: r, color: token('--gold'), weight: 1, fillColor: token('--gold'), fillOpacity: .08 }).addTo(map);
      } else circulo.setRadius(r);
    }

    var t = null;
    buscador.oninput = function () {
      clearTimeout(t);
      var q = buscador.value.trim();
      if (q.length < 3) { resultados.style.display = 'none'; return; }
      t = setTimeout(function () {
        buscarLugares(q, { lat: estado.lat, lng: estado.lng }).then(function (data) {
          if (!el.isConnected) return;
          if (!data || !data.length) { resultados.style.display = 'none'; return; }
          resultados.innerHTML = data.map(function (p, i) {
            return '<button data-i="' + i + '" style="display:block;width:100%;padding:9px 11px;background:none;border:none;border-bottom:1px solid var(--border-soft);color:var(--text);cursor:pointer;font-size:12.5px;text-align:left;font-family:inherit">📍 ' +
              String(p.direccion || p.nombre).replace(/[<>&]/g, '') + '</button>';
          }).join('');
          resultados.style.display = 'block';
          Array.prototype.forEach.call(resultados.querySelectorAll('[data-i]'), function (b) {
            b.onclick = function () {
              var p = data[Number(b.dataset.i)];
              resultados.style.display = 'none';
              buscador.value = p.direccion || p.nombre;
              mover(p.lat, p.lng, { nombre: p.nombre, direccion: p.direccion });
              if (map) map.setView([p.lat, p.lng], 15);
            };
          });
        }).catch(function () { resultados.style.display = 'none'; });
      }, 420);
    };

    return {
      get map() { return map; },
      estado: estado,
      mover: mover,
      setRadio: setRadio,
      destruir: function () { clearTimeout(t); destruir(map); map = null; },
    };
  }

  /* ══════════════════ Destrucción segura ══════════════════ */
  // Quitar el <div> del DOM NO destruye el mapa: Leaflet deja listeners de window y
  // temporizadores de animación vivos, y a la siguiente apertura se crea otra instancia
  // encima. Hay que llamar remove() explícitamente.
  function destruir(map) {
    if (!map) return;
    try { map.off(); } catch (e) {}
    try { map.remove(); } catch (e) {}
  }

  /* ══════════════════ Refresco de tokens al cambiar el tema ══════════════════ */
  document.addEventListener('vida:theme-changed', function () { _tokens = {}; });

  window.SPMapa = {
    cargarLeaflet: cargarLeaflet,
    getConfig: getConfig,
    capaTiles: capaTiles,
    aplicarTema: aplicarTema,
    buscarLugares: buscarLugares,
    geocodInverso: geocodInverso,
    distanciaMetros: distanciaMetros,
    distanciaLegible: distanciaLegible,
    horaCorta: horaCorta,
    hoyBogota: hoyBogota,
    frescura: frescura,
    etapa: etapa,
    etapasDisponibles: etapasDisponibles,
    pinPunto: pinPunto,
    token: token,
    temaActual: temaActual,
    urlNavegacion: urlNavegacion,
    abrirNavegacion: abrirNavegacion,
    agrupar: agrupar,
    pickerUbicacion: pickerUbicacion,
    destruir: destruir,
  };
})();
