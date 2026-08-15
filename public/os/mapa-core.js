/* ============================================================================
   Mapa del equipo — núcleo compartido
   Lo usan /os/mapa.html (admin) y /supervisor/mapa.html (jefe). Ambos paneles
   necesitan exactamente la misma vista, así que la implementación vive aquí una
   sola vez y cada página solo aporta su shell (SPOS.mount o SPS.mount).

   Fuentes de datos:
     GET  /api/mapa/asesores                      última posición + carga de cada asesor
     GET  /api/mapa/asesores/:id/recorrido?fecha  rastro de un día
     GET  /api/mapa/config                        proveedor de teselas (Mapbox u OSM)
     SSE  'ubicacion_asesor'                      mueve los marcadores sin recargar

   Nota sobre "en vivo": la app del asesor es un WebView y solo reporta con la app
   abierta. Por eso cada marcador muestra SIEMPRE la hora de su última posición y se
   apaga visualmente al enfriarse — nunca se pinta como en vivo algo que no lo está.
   ============================================================================ */
(function () {
  'use strict';

  let map = null;
  let cfgMapa = null;
  let capaBase = null;
  let asesores = [];
  let marcadores = new Map();   // vendedorId -> L.marker
  let capaRecorrido = null;
  let seleccionado = null;
  let api = null, toast = null, esc = null;

  // Carga de Leaflet, teselas, frescura y hora vienen del núcleo compartido
  // (/shared/mapa-base.js) — antes estaban duplicadas aquí, en el panel móvil, en el
  // inbox y en el chat interno, con derivas entre copias.
  const { cargarLeaflet, frescura, horaCorta: hora, token: tk } = window.SPMapa;

  function iniciales(n) {
    return String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  function iconoAsesor(a) {
    const f = frescura(a.ts);
    const cuerpo = a.foto
      ? `<img src="${a.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : `<span style="font-size:12px;font-weight:700;color:var(--bg-0)">${iniciales(a.nombre)}</span>`;
    // Dentro de un divIcon sí se puede usar var(): es DOM real, no un atributo SVG.
    return L.divIcon({
      className: 'mapa-asesor',
      html: `<div style="width:38px;height:38px;border-radius:50%;background:var(--gold);display:grid;place-items:center;
             border:3px solid ${f.color};box-shadow:0 2px 10px rgba(0,0,0,.5);overflow:hidden">${cuerpo}</div>
             ${f.clase === 'viva' ? '<span style="position:absolute;top:-2px;right:-2px;width:11px;height:11px;border-radius:50%;background:var(--green);border:2px solid var(--bg-0)"></span>' : ''}`,
      iconSize: [38, 38], iconAnchor: [19, 19],
    });
  }

  /* ── Marcadores ── */
  function pintarAsesores() {
    const vistos = new Set();
    asesores.forEach(a => {
      if (a.lat == null || a.lng == null) return;
      vistos.add(Number(a.id));
      let m = marcadores.get(Number(a.id));
      if (m) {
        m.setLatLng([a.lat, a.lng]);
        m.setIcon(iconoAsesor(a));
      } else {
        m = L.marker([a.lat, a.lng], { icon: iconoAsesor(a), title: a.nombre }).addTo(map);
        m.on('click', () => seleccionarAsesor(Number(a.id)));
        marcadores.set(Number(a.id), m);
      }
      m.bindTooltip(`${esc(a.nombre)} · ${frescura(a.ts).label}`, { direction: 'top', offset: [0, -18] });
    });
    // Quitar del mapa a quien dejó de reportar (p. ej. revocó el permiso).
    for (const [id, m] of marcadores) {
      if (!vistos.has(id)) { map.removeLayer(m); marcadores.delete(id); }
    }
    const contador = document.getElementById('mapaContador');
    if (contador) {
      const vivos = asesores.filter(a => frescura(a.ts).clase === 'viva').length;
      contador.textContent = `${asesores.length} con ubicación · ${vivos} en vivo`;
    }
  }

  function encuadrar() {
    const puntos = asesores.filter(a => a.lat != null).map(a => [a.lat, a.lng]);
    if (puntos.length) map.fitBounds(L.latLngBounds(puntos).pad(0.25), { maxZoom: 15 });
    else map.setView([4.7110, -74.0721], 6); // Colombia, cuando nadie reporta todavía
  }

  /* ── Panel lateral ── */
  function seleccionarAsesor(id) {
    seleccionado = asesores.find(a => Number(a.id) === Number(id));
    if (!seleccionado) return;
    const a = seleccionado;
    const f = frescura(a.ts);
    const tel = String(a.telefono || '').replace(/[^\d+]/g, '');
    const panel = document.getElementById('mapaPanel');
    panel.style.display = 'block';
    panel.innerHTML = `
      <div class="u-between" style="align-items:flex-start;gap:8px">
        <div>
          <div style="font-weight:600;font-size:15px">${esc(a.nombre)}</div>
          <div style="font-size:12px;color:${f.color}">● Ubicación ${f.label}</div>
        </div>
        <button class="btn btn--ghost btn--sm" id="mapaCerrarPanel">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0">
        <div style="background:var(--bg-3);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:18px;font-weight:700">${a.leadsActivos != null ? a.leadsActivos : '—'}</div>
          <div style="font-size:10px;color:var(--text-3)">Leads activos</div></div>
        <div style="background:var(--bg-3);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:18px;font-weight:700">${a.leadsHoy != null ? a.leadsHoy : '—'}</div>
          <div style="font-size:10px;color:var(--text-3)">Leads hoy</div></div>
        <div style="background:var(--bg-3);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:18px;font-weight:700">${a.tasaRespuesta != null ? a.tasaRespuesta + '%' : '—'}</div>
          <div style="font-size:10px;color:var(--text-3)">Tasa resp.</div></div>
        <div style="background:var(--bg-3);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:18px;font-weight:700">${a.online ? 'Sí' : 'No'}</div>
          <div style="font-size:10px;color:var(--text-3)">Conectado</div></div>
      </div>
      <div class="u-row u-gap2" style="flex-wrap:wrap;margin-bottom:10px">
        ${tel ? `<a class="btn btn--ghost btn--sm" href="tel:${esc(tel)}">Llamar</a>
                 <a class="btn btn--ghost btn--sm" href="https://wa.me/${esc(tel.replace(/^\+/, ''))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        <button class="btn btn--ghost btn--sm" id="mapaRecorrido">Ver recorrido de hoy</button>
        <button class="btn btn--ghost btn--sm" id="mapaCentrar">Centrar</button>
      </div>
      <div id="mapaRecorridoInfo" style="font-size:12px;color:var(--text-3)"></div>
      <div id="mapaLeadsCerca" style="margin-top:12px"></div>`;

    document.getElementById('mapaCerrarPanel').onclick = () => { panel.style.display = 'none'; limpiarRecorrido(); };
    document.getElementById('mapaCentrar').onclick = () => map.setView([a.lat, a.lng], 16);
    document.getElementById('mapaRecorrido').onclick = () => dibujarRecorrido(a);
    cargarLeadsCerca(a);
  }

  function limpiarRecorrido() {
    if (capaRecorrido) { map.removeLayer(capaRecorrido); capaRecorrido = null; }
  }

  async function dibujarRecorrido(a) {
    limpiarRecorrido();
    const info = document.getElementById('mapaRecorridoInfo');
    const fecha = (document.getElementById('mapaFecha') || {}).value || window.SPMapa.hoyBogota();
    info.textContent = 'Cargando recorrido…';
    const r = await api(`/api/mapa/asesores/${a.id}/recorrido?fecha=${encodeURIComponent(fecha)}`);
    const puntos = (r && r.puntos) || [];
    if (puntos.length < 2) {
      info.textContent = puntos.length === 1
        ? 'Solo hay una posición registrada ese día — no alcanza para dibujar un recorrido.'
        : 'Sin posiciones registradas ese día.';
      return;
    }
    const coords = puntos.map(p => [p.lat, p.lng]);
    // Aquí sí hace falta el literal: Leaflet pinta la polilínea y los circleMarker sobre
    // SVG mediante atributos de color, donde var(--gold) no se resuelve.
    const oro = tk('--gold');
    capaRecorrido = L.layerGroup([
      L.polyline(coords, { color: oro, weight: 3, opacity: .8 }),
      ...puntos.map(p => L.circleMarker([p.lat, p.lng], { radius: 3, color: oro, fillOpacity: 1 })
        .bindTooltip(hora(p.ts), { direction: 'top' })),
    ]).addTo(map);
    map.fitBounds(L.latLngBounds(coords).pad(0.2));
    info.textContent = `${puntos.length} posiciones · de ${hora(puntos[0].ts)} a ${hora(puntos[puntos.length - 1].ts)}`;
  }

  /* ── Leads cercanos + reasignación en un toque ──
     La gracia del mapa es aprovechar que el asesor YA está en la zona: se listan sus
     leads más próximos y los de otros asesores que estén cerca de él, para poder
     pasárselos sin salir de aquí. Requiere leads geocodificados (Fase B); mientras
     tanto el bloque explica por qué está vacío en vez de aparecer roto. */
  async function cargarLeadsCerca(a) {
    const box = document.getElementById('mapaLeadsCerca');
    if (!box) return;
    const r = await api(`/api/mapa/leads?cerca=${a.lat},${a.lng}&radio=5&limit=8`);
    if (!r || !Array.isArray(r.leads)) {
      box.innerHTML = '<div style="font-size:12px;color:var(--text-3)">Los clientes todavía no tienen coordenadas guardadas, así que no se pueden listar por cercanía.</div>';
      return;
    }
    if (!r.leads.length) { box.innerHTML = '<div style="font-size:12px;color:var(--text-3)">Sin clientes a menos de 5 km.</div>'; return; }
    box.innerHTML = `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:6px">Clientes cerca</div>` +
      r.leads.map(l => `<div class="u-between" style="gap:8px;padding:8px 0;border-bottom:1px solid var(--border-soft)">
        <div style="min-width:0">
          <div style="font-size:13px;font-weight:500">${esc(l.customer_name || 'Cliente')}</div>
          <div style="font-size:11px;color:var(--text-3)">${Math.round(l.distancia_m || 0)} m · ${esc(l.assigned_to_nombre || 'sin asesor')}</div>
        </div>
        ${Number(l.assigned_to_id) === Number(a.id) ? '' : `<button class="btn btn--ghost btn--sm" data-pasar="${l.id}">Pasárselo</button>`}
      </div>`).join('');
    box.querySelectorAll('[data-pasar]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      const res = await api(`/api/supervisor/reasignar/${b.dataset.pasar}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendedorId: a.id }),
      });
      if (res && res.ok) { toast(`Chat reasignado a ${a.nombre}`, 'ok'); cargarLeadsCerca(a); }
      else { b.disabled = false; toast((res && (res.detalle || res.error)) || 'No se pudo reasignar', 'err'); }
    });
  }

  /* ── Capas: clientes por etapa, proyectos y zonas ──
     Se cargan una vez y se muestran/ocultan con las casillas de la barra. Los clientes
     dependen de la geocodificación: los que no tengan dirección utilizable no salen. */
  const capas = { leads: null, proyectos: null, zonas: null };
  const { etapa, pinPunto } = window.SPMapa;

  async function cargarCapa(nombre) {
    if (capas[nombre]) return capas[nombre];
    if (nombre === 'leads') {
      const r = await api('/api/mapa/leads?limit=500');
      const items = (r && r.leads) || [];
      capas.leads = L.layerGroup(items.map(l => {
        const e = etapa(l.etiqueta);
        // Punteado = coordenada deducida de la ciudad, no compartida por el cliente. El
        // asesor que se desplaza a un pin necesita saber cuál de las dos está mirando.
        const aprox = l.coord_fuente !== 'ubicacion';
        return L.marker([l.lat, l.lng], { icon: pinPunto(e.color, { punteado: aprox }) })
          .bindPopup(`<b>${esc(l.customer_name || 'Cliente')}</b><br>${esc(e.label)}<br>
                      <span style="color:var(--text-3)">${esc(l.assigned_to_nombre || 'sin asesor')}</span>
                      ${aprox ? '<br><span style="color:var(--text-3);font-size:11px">Ubicación aproximada (ciudad)</span>' : ''}`);
      }));
      const aviso = document.getElementById('mapaAvisoLeads');
      if (aviso) aviso.textContent = items.length
        ? `${items.length} ${items.length === 1 ? 'cliente ubicado' : 'clientes ubicados'}`
        : 'Ningún cliente tiene coordenadas todavía — se calculan solas a partir de su ciudad.';
    } else if (nombre === 'proyectos') {
      const r = await api('/api/mapa/proyectos');
      capas.proyectos = L.layerGroup(((r && r.proyectos) || []).map(p =>
        L.marker([p.lat, p.lng], { icon: pinPunto(tk('--text'), { tam: 16 }) })
          .bindPopup(`<b>${esc(p.nombre)}</b><br>${esc(p.ciudad || '')} ${esc(p.departamento || '')}`)));
    } else if (nombre === 'zonas') {
      const r = await api('/api/mapa/zonas');
      const oro = tk('--gold');
      capas.zonas = L.layerGroup(((r && r.zonas) || []).map(z =>
        L.circle([z.centro_lat, z.centro_lng], {
          radius: (Number(z.radio_km) > 0 ? Number(z.radio_km) : 10) * 1000,
          color: oro, weight: 1, fillColor: oro, fillOpacity: .07,
        }).bindTooltip(esc(z.nombre))));
    }
    return capas[nombre];
  }

  async function alternarCapa(nombre, visible) {
    const capa = await cargarCapa(nombre);
    if (!capa) return;
    if (visible) capa.addTo(map); else map.removeLayer(capa);
  }

  /* ── Datos + tiempo real ── */
  async function refrescar() {
    const r = await api('/api/mapa/asesores');
    asesores = (r && r.asesores) || [];
    pintarAsesores();
    renderListaLateral();
  }

  function renderListaLateral() {
    const box = document.getElementById('mapaEquipo');
    if (!box) return;
    if (!asesores.length) {
      box.innerHTML = `<div style="font-size:12.5px;color:var(--text-3);line-height:1.6">
        Ningún asesor está compartiendo ubicación todavía.<br>
        Cada uno debe aceptar el aviso en su panel (Perfil → Compartir ubicación) y tener la app abierta.</div>`;
      return;
    }
    box.innerHTML = asesores
      .slice()
      .sort((x, y) => new Date(y.ts || 0) - new Date(x.ts || 0))
      .map(a => {
        const f = frescura(a.ts);
        return `<button class="mapa-item" data-ver="${a.id}" style="display:flex;align-items:center;gap:8px;width:100%;text-align:left;
                background:transparent;border:none;border-bottom:1px solid var(--border-soft);padding:10px 4px;cursor:pointer;color:var(--text)">
          <span style="width:30px;height:30px;border-radius:50%;background:var(--gold);color:var(--bg-0);display:grid;place-items:center;font-size:11px;font-weight:700;flex:none">${iniciales(a.nombre)}</span>
          <span style="flex:1;min-width:0">
            <span style="display:block;font-size:13px;font-weight:500">${esc(a.nombre)}</span>
            <span style="font-size:11px;color:${f.color}">● ${f.label}</span>
          </span>
        </button>`;
      }).join('');
    box.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => {
      const a = asesores.find(x => String(x.id) === b.dataset.ver);
      if (a && a.lat != null) { map.setView([a.lat, a.lng], 16); seleccionarAsesor(Number(a.id)); }
    });
  }

  // Un punto nuevo llega por SSE: se mueve el marcador sin volver a pedir todo.
  function onUbicacionAsesor(ev) {
    let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
    const i = asesores.findIndex(a => Number(a.id) === Number(d.vendedorId));
    if (i >= 0) {
      asesores[i] = { ...asesores[i], lat: d.lat, lng: d.lng, ts: new Date().toISOString() };
      pintarAsesores();
      renderListaLateral();
      if (seleccionado && Number(seleccionado.id) === Number(d.vendedorId)) seleccionarAsesor(Number(d.vendedorId));
    } else {
      refrescar(); // asesor que empieza a reportar ahora: hace falta su ficha completa
    }
  }

  /* ── Arranque ──
     opts: { content, api, toast, esc, onStream(fn) } — cada shell pasa sus helpers,
     porque /os/ y /supervisor/ tienen APIs distintas para lo mismo. */
  async function montar(opts) {
    api = opts.api; toast = opts.toast; esc = opts.esc;
    const hoy = window.SPMapa.hoyBogota();

    opts.content.innerHTML = `
      <div class="os-content__max">
        <div class="u-between" style="flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <div>
            <div class="t-h3">Equipo en el mapa</div>
            <div class="t-dim3" style="font-size:12px" id="mapaContador">Cargando…</div>
          </div>
          <div class="u-row u-gap2" style="align-items:center">
            <input type="date" class="input" id="mapaFecha" value="${hoy}" max="${hoy}" style="width:auto">
            <button class="btn btn--ghost btn--sm" id="mapaRefrescar">Refrescar</button>
            <button class="btn btn--ghost btn--sm" id="mapaEncuadrar">Ver todos</button>
          </div>
        </div>
        <div class="u-row u-gap2" style="flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:12.5px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="capaLeads"> Clientes</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="capaProyectos"> Proyectos</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="capaZonas"> Zonas</label>
          <span class="t-dim3" id="mapaAvisoLeads" style="font-size:11.5px"></span>
        </div>
        <div style="display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:12px;align-items:start" id="mapaGrid">
          <div class="card" style="overflow:hidden;position:relative">
            <div id="mapaLienzo" style="height:min(70vh,620px);width:100%"></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="card card--pad">
              <div class="t-h3" style="font-size:14px;margin-bottom:8px">Asesores</div>
              <div id="mapaEquipo"></div>
            </div>
            <div class="card card--pad" id="mapaPanel" style="display:none"></div>
          </div>
        </div>
        <div class="t-dim3" style="font-size:11.5px;margin-top:10px;line-height:1.6">
          La ubicación se comparte solo mientras el asesor tiene la app abierta y únicamente si aceptó el aviso.
          Cada marcador muestra la hora de su última posición; el recorrido se conserva 30 días.
        </div>
      </div>`;

    // Una columna en pantallas angostas: el mapa no puede quedar en 200 px de ancho.
    const aplicarResponsive = () => {
      const g = document.getElementById('mapaGrid');
      if (g) g.style.gridTemplateColumns = window.innerWidth < 900 ? 'minmax(0,1fr)' : 'minmax(0,1fr) 300px';
    };
    aplicarResponsive();
    window.addEventListener('resize', aplicarResponsive);

    await cargarLeaflet();
    cfgMapa = await window.SPMapa.getConfig();
    // attributionControl SÍ: las teselas de CARTO/OSM exigen crédito visible por licencia.
    // mapa.css lo integra al tema en vez de dejarlo como una etiqueta blanca pegada.
    map = L.map('mapaLienzo', { zoomControl: true, attributionControl: true }).setView([4.7110, -74.0721], 6);
    capaBase = window.SPMapa.capaTiles(cfgMapa);
    capaBase.addTo(map);
    setTimeout(() => map.invalidateSize(), 150);

    // Si el usuario alterna claro/oscuro, la capa base tiene que seguirlo: con teselas
    // oscuras sobre una interfaz clara (o al revés) el mapa se lee mal.
    document.addEventListener('vida:theme-changed', () => {
      capaBase = window.SPMapa.aplicarTema(map, capaBase, cfgMapa);
    });

    document.getElementById('mapaRefrescar').onclick = refrescar;
    document.getElementById('mapaEncuadrar').onclick = () => { limpiarRecorrido(); encuadrar(); };
    document.getElementById('mapaFecha').onchange = () => { if (seleccionado) dibujarRecorrido(seleccionado); };
    document.getElementById('capaLeads').onchange = (e) => alternarCapa('leads', e.target.checked);
    document.getElementById('capaProyectos').onchange = (e) => alternarCapa('proyectos', e.target.checked);
    document.getElementById('capaZonas').onchange = (e) => alternarCapa('zonas', e.target.checked);

    await refrescar();
    encuadrar();
    if (typeof opts.onStream === 'function') opts.onStream(onUbicacionAsesor);
  }

  window.MapaEquipo = { montar };
})();
