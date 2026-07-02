/* ============================================================================
   SP OS — Shell runtime
   Provee: iconos, navegación, guard de sesión, helper de API (con fallback demo),
   toasts, y montaje del workspace de 3 zonas. Un solo producto, un solo lenguaje.
   ============================================================================ */
(function () {
  'use strict';

  /* --- Íconos (stroke, 24x24) --- */
  const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    dashboard: P('<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z"/>'),
    inbox: P('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6z"/>'),
    leads: P('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    pipeline: P('<path d="M3 3v18h18"/><rect x="7" y="9" width="3" height="8" rx="1"/><rect x="13" y="5" width="3" height="12" rx="1"/>'),
    clients: P('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>'),
    properties: P('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>'),
    projects: P('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16"/>'),
    campaigns: P('<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>'),
    automations: P('<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H15a3 3 0 0 1 3 3v6M6 8.5V15a3 3 0 0 0 3 3h6.5"/>'),
    calendar: P('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    analytics: P('<path d="M3 3v18h18"/><path d="M7 14l3-4 3 3 4-6"/>'),
    team: P('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>'),
    billing: P('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'),
    marketplace: P('<path d="M4 8h16l-1 12H5z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
    ai: P('<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M18.5 15.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z"/>'),
    settings: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.9 1.13V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 6 19.4a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 6 6a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 12 3.6a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 18 6a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.4 12H21a2 2 0 1 1 0 4z"/>'),
    activity: P('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
    logs: P('<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
    api: P('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
    notifications: P('<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
    search: P('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
    logout: P('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'),
    plus: P('<path d="M12 5v14M5 12h14"/>'),
    up: P('<path d="M7 17 17 7M7 7h10v10"/>'),
    down: P('<path d="M7 7 17 17M17 7v10H7"/>'),
    check: P('<path d="M20 6 9 17l-5-5"/>'),
    clock: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    msg: P('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    flame: P('<path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 .5-2S6 10 6 14a6 6 0 0 0 12 0c0-5-6-12-6-12z"/>'),
    spark: P('<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/>'),
    menu: P('<path d="M3 6h18M3 12h18M3 18h18"/>'),
    money: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5a2.5 2 0 0 1 5 0c0 2.5-5 1-5 3.5a2.5 2 0 0 0 5 0"/>'),
    target: P('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
  };

  /* --- Navegación (una sola verdad) --- */
  const M = (k) => '/os/module.html?m=' + k;   // módulos aún en construcción
  const NAV = [
    { title: 'Operación', items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/os/dashboard.html' },
      { id: 'inbox', label: 'Inbox', icon: 'inbox', href: '/os/inbox.html', badge: 'live' },
      { id: 'crm', label: 'CRM · Leads', icon: 'leads', href: '/os/crm.html' },
      { id: 'pipeline', label: 'Pipeline', icon: 'pipeline', href: '/os/pipeline.html' },
      { id: 'clients', label: 'Clientes', icon: 'clients', href: M('clients') },
    ]},
    { title: 'Negocio', items: [
      { id: 'properties', label: 'Propiedades', icon: 'properties', href: M('properties') },
      { id: 'campaigns', label: 'Campañas', icon: 'campaigns', href: M('campaigns') },
      { id: 'automations', label: 'Automatizaciones', icon: 'automations', href: M('automations') },
      { id: 'calendar', label: 'Calendario', icon: 'calendar', href: M('calendar') },
      { id: 'analytics', label: 'Analytics', icon: 'analytics', href: '/os/analytics.html' },
    ]},
    { title: 'Organización', items: [
      { id: 'team', label: 'Equipo', icon: 'team', href: '/os/equipo.html', admin: true },
      { id: 'billing', label: 'Facturación', icon: 'billing', href: M('billing'), admin: true },
      { id: 'marketplace', label: 'Marketplace', icon: 'marketplace', href: M('marketplace') },
      { id: 'settings', label: 'Configuración', icon: 'settings', href: M('settings') },
    ]},
  ];

  /* --- API helper: usa el backend real; si no responde, cae a demo --- */
  async function api(path, opts) {
    try {
      const res = await fetch(path, Object.assign({
        headers: { 'Accept': 'application/json' }, credentials: 'include'
      }, opts || {}));
      if (res.status === 401) { SPOS._demo = true; return null; }
      if (!res.ok) throw new Error('http_' + res.status);
      return await res.json();
    } catch (e) {
      SPOS._demo = true;
      return null;
    }
  }

  /* --- Toast --- */
  function toast(msg, kind) {
    let host = document.querySelector('.os-toasts');
    if (!host) { host = document.createElement('div'); host.className = 'os-toasts'; document.body.appendChild(host); }
    const t = document.createElement('div');
    t.className = 'os-toast' + (kind === 'ok' ? ' os-toast--ok' : kind === 'err' ? ' os-toast--err' : '');
    t.innerHTML = (kind === 'ok' ? ICONS.check : kind === 'err' ? ICONS.notifications : ICONS.spark).replace('<svg ', '<svg style="width:15px;height:15px" ') + '<span>' + msg + '</span>';
    host.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s, transform .3s'; t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; setTimeout(() => t.remove(), 320); }, 2600);
  }

  const AV = ['#C8A45A', '#4E7B46', '#5B8DEF', '#B0763C', '#8C6BB0', '#3F8E8E'];
  const avatarColor = (s) => AV[(String(s || '?').charCodeAt(0) + String(s || '?').length) % AV.length];
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

  /* --- Montaje del shell --- */
  async function mount(opts) {
    opts = opts || {};
    const active = opts.active || 'dashboard';
    let me = await api('/api/me');
    const demo = !me;
    if (!me) me = { nombre: 'Sergio Parra', email: 'sergio@sp.os', rol: 'admin' };

    // Vendedor no-admin fuera de /os → mándalo a su panel clásico (no rompemos su flujo)
    if (!demo && me.rol !== 'admin' && opts.adminOnly) { location.href = '/vendedor.html'; return null; }

    const navHTML = NAV.map(group => {
      const items = group.items.filter(it => !(it.admin && !demo && me.rol !== 'admin')).map(it => `
        <a class="os-nav__item${it.id === active ? ' active' : ''}" href="${it.href}">
          ${ICONS[it.icon] || ''}<span>${it.label}</span>
          ${it.badge === 'live' ? '<span class="os-nav__badge" id="navBadgeInbox">•</span>' : ''}
        </a>`).join('');
      return `<div class="os-nav__group"><div class="os-nav__title">${group.title}</div>${items}</div>`;
    }).join('');

    const shell = document.createElement('div');
    shell.className = 'os-app' + (opts.panel ? ' has-panel' : '');
    shell.innerHTML = `
      <aside class="os-nav" id="osNav">
        <div class="os-brand">
          <div class="os-brand__mark">SP</div>
          <div><div class="os-brand__name">SP&nbsp;OS</div><div class="os-brand__sub">Enterprise</div></div>
        </div>
        <div class="os-workspace" title="Cambiar workspace">
          <div class="os-workspace__logo">🏡</div>
          <div class="u-grow"><div class="os-workspace__name">SP Inmobiliaria</div><div class="os-workspace__plan">Plan Enterprise</div></div>
          ${P('<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>').replace('<svg ', '<svg style="width:14px;height:14px;opacity:.4" ')}
        </div>
        <div class="os-nav__scroll">${navHTML}</div>
        <div class="os-nav__foot">
          <div class="os-nav__item" id="osLogout">${ICONS.logout}<span>Cerrar sesión</span></div>
        </div>
      </aside>
      <main class="os-main">
        <header class="os-topbar">
          <button class="btn btn--icon btn--quiet u-hide" id="osMenuBtn" style="margin-left:-8px">${ICONS.menu}</button>
          <div><div class="os-topbar__title">${opts.title || 'Dashboard'}</div>${opts.crumb ? `<div class="os-topbar__crumb">${opts.crumb}</div>` : ''}</div>
          <div class="u-grow"></div>
          <label class="os-search">${ICONS.search}<input placeholder="Buscar en SP OS…" id="osSearch"><kbd>⌘K</kbd></label>
          <button class="btn btn--icon btn--ghost" title="Notificaciones">${ICONS.notifications}</button>
          <div class="avatar avatar--sm" style="background:${avatarColor(me.nombre)}" title="${me.nombre}">${initials(me.nombre)}</div>
          ${opts.action || ''}
        </header>
        <div class="os-content${opts.padded ? ' os-content--pad' : ''}" id="osContent"></div>
      </main>
      ${opts.panel ? '<aside class="os-panel" id="osPanel"></aside>' : ''}`;

    document.body.innerHTML = '';
    document.body.appendChild(shell);

    // AI Copilot dock (siempre presente = un solo producto)
    const dock = document.createElement('div');
    dock.className = 'ai-dock';
    dock.innerHTML = `<div class="ai-dock__spark">${ICONS.spark.replace('<svg ', '<svg style="width:16px;height:16px" ')}</div><span class="ai-dock__label">Copiloto SP</span><span class="ai-dock__hint">⌘J</span>`;
    dock.addEventListener('click', () => toast('El Copiloto SP se activará en la Fase IA', 'ok'));
    document.body.appendChild(dock);

    // Eventos
    document.getElementById('osLogout').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
      location.href = '/login.html';
    });
    const nav = document.getElementById('osNav');
    const mb = document.getElementById('osMenuBtn');
    if (window.innerWidth <= 720 && mb) { mb.classList.remove('u-hide'); mb.addEventListener('click', () => nav.classList.toggle('open')); }
    window.addEventListener('keydown', (e) => { if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); document.getElementById('osSearch').focus(); } });

    if (demo) badgeDemo();
    return { me, demo, content: document.getElementById('osContent'), panel: document.getElementById('osPanel') };
  }

  function badgeDemo() {
    const b = document.createElement('div');
    b.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:95;background:var(--gold-soft);color:var(--gold);border:1px solid var(--gold-line);padding:5px 14px;border-radius:999px;font-size:11.5px;font-weight:600;letter-spacing:.03em';
    b.textContent = 'MODO DEMO · sin sesión activa';
    document.body.appendChild(b);
  }

  window.SPOS = { ICONS, NAV, api, toast, mount, avatarColor, initials, _demo: false,
    fmt: {
      n: (v) => (v == null ? '—' : Number(v).toLocaleString('es-CO')),
      money: (v) => (v == null ? '—' : '$' + Number(v).toLocaleString('es-CO')),
      pct: (v) => (v == null ? '—' : v + '%'),
    }
  };
})();
