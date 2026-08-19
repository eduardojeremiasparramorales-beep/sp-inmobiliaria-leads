(function(){
'use strict';

/* ════════ Iconos (path-data → <path>) ════════ */
function I(d,s){ s=s||24; const inner = (d && String(d).trim().charAt(0)==='<') ? d : `<path d="${d}"/>`; return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="${s}" height="${s}">${inner}</svg>`; }
const SVG = {
  search:'M11 17.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5zM16 16l3.5 3.5',
  bell:'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  plus:'M12 5v14M5 12h14', back:'m15 18-6-6 6-6',
  chat:'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  home:'m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  check:'M20 6 9 17l-5-5', checkSquare:'m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  sparkles:'m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z',
  user:'M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  phone:'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  video:'m23 7-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z',
  mapPin:'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  image:'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  mic:'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  send:'m22 2-7 20-4-9-9-4ZM22 2 11 13', x:'M18 6 6 18M6 6l12 12', dots:'M12 12h.01M19 12h.01M5 12h.01',
  clip:'m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48',
  file:'M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3ZM15 3v6h6',
  zap:'M13 2 3 14h9l-1 8 10-12h-9l1-8z', copy:'<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  contact:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87',
  calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2', reply:'M4 12h11a4 4 0 0 1 4 4v2M4 12l4-4M4 12l4 4', tag:'M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01',
  archive:'M21 8v13H3V8M1 3h22v5H1zM10 12h4', building:'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4',
  target:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  megaphone:'m3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6', facebook:'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z',
  filter:'M22 3H2l8 9.46V19l4 2v-8.54z',   settings:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  lock:'M12 2a5 5 0 0 0-5 5v3H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2V7a5 5 0 0 0-5-5zM9 10V7a3 3 0 0 1 6 0v3',
  arrowUp:'M12 5v14M5 12l7-7 7 7',
  trash:'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  pin:'M12 2l3 7h7l-5.5 5 2 8L12 17l-6.5 4 2-8L2 9h7z',
  smile:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  edit:'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  info:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  download:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  eye:'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  refresh:'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
};

/* ════════ Estado / helpers ════════ */
const DEMO = new URLSearchParams(location.search).get('demo') === '1';
const $ = s => document.querySelector(s);
const app = document.getElementById('app');
let me = null, leads = [], filtro = 'todos', term = '', tab = 'chats', ordenPrioridad = false;
let _chatBg = localStorage.getItem('sp_chat_bg') || 'leones'; // caché offline; la fuente real es me.chat_bg (servidor)
let hotScores = new Map(); // lead_id -> score (lead scoring, solo visible para admin — ver /api/leads/calientes)
let current = null, currentMsgs = [], metricas = null;
let _templates = [];
let showArchivados = false, archivadosCount = 0, archivedLeads = [], replyTo = null;
let _audioPlayers = {};

const ETQ = { sin_clasificar:{t:'Nuevo',cls:'sin_clasificar'}, interesado:{t:'Interesado',cls:'interesado'}, negociacion:{t:'Negociación',cls:'negociacion'}, cita:{t:'Cita',cls:'cita'}, vendido:{t:'Vendido',cls:'vendido'}, no_interesado:{t:'No int.',cls:'no_interesado'} };
const etqLabel = v => (ETQ[v]||{t:v}).t;
const estadoColores = { activo:{bg:'rgba(87,193,104,.15)',fg:'#57C168',bd:'rgba(87,193,104,.3)'}, ocupado:{bg:'rgba(200,164,90,.15)',fg:'#D4AF37',bd:'rgba(200,164,90,.3)'}, inactivo:{bg:'rgba(109,109,109,.15)',fg:'#6D6D6D',bd:'rgba(109,109,109,.3)'}, vacaciones:{bg:'rgba(91,139,236,.15)',fg:'#5B8BEC',bd:'rgba(91,139,236,.3)'} };
const AV = ['#D4AF37','#4E7B46','#5B8DEF','#B0763C','#8C6BB0','#3F8E8E'];
const avatarColor = n => AV[(String(n||'').length + String(n||'').charCodeAt(0)||0) % AV.length];
const initials = n => String(n||'C').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
const money = v => v==null?'—':'$'+Number(v).toLocaleString('es-CO');
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function haptic(p){ if(localStorage.getItem('sp_notif_vibrate')==='false') return; try{ navigator.vibrate && navigator.vibrate(p); }catch(e){} }
// Fondo de leones — la clase vive en el contenedor ESTÁTICO de cada pantalla (#scChat,
// #scEquipo), que renderChat()/renderEquipo() nunca recrean (solo reemplazan su
// contenido interno). Así se aplica UNA vez y sobrevive a cualquier re-render, a
// diferencia de aplicarla sobre #cMsgs (que sí se recrea en cada mensaje/selección).
function aplicarFondoChat(){
  const on = _chatBg === 'leones';
  document.getElementById('scChat')?.classList.toggle('chat-bg-patron', on);
  document.getElementById('scEquipo')?.classList.toggle('chat-bg-patron', on);
}
function toast(m,type){ const t=$('#toast'); t.textContent=m; t.className=type==='err'?'show toast-err':'show'; clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'),type==='err'?4000:2200); }
function playNotifSound(){
  if(localStorage.getItem('sp_notif_sound')==='false') return;
  const custom=localStorage.getItem('sp_notif_sound_custom');
  if(custom){ try{ new Audio(custom).play(); }catch(e){} return; }
  try{
    const ac=new(window.AudioContext||window.webkitAudioContext)();
    const g=ac.createGain(); g.connect(ac.destination);
    g.gain.setValueAtTime(.25,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.01,ac.currentTime+.25);
    const o=ac.createOscillator(); o.type='sine';
    o.frequency.setValueAtTime(800,ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(1100,ac.currentTime+.12);
    o.connect(g); o.start(); o.stop(ac.currentTime+.25);
  }catch(e){}
}
function urlBase64ToUint8Array(b){
  const s=b.replace(/-/g,'+').replace(/_/g,'/');
  const r=atob(s); const u=new Uint8Array(r.length);
  for(let i=0;i<r.length;i++) u[i]=r.charCodeAt(i);
  return u;
}
async function suscribirPush(){
  // App nativa (Capacitor): FCM es más confiable en Android que Web Push (que el
  // sistema puede matar en segundo plano). Se registra AUTOMÁTICAMENTE al abrir,
  // salvo que el vendedor lo haya apagado desde Perfil (opt-out). La disponibilidad
  // del plugin se verifica con isPluginAvailable + try/catch para no tumbar la app
  // si Firebase no está configurado en este build.
  if(esNativo()){
    if(localStorage.getItem('sp_push_fcm_enabled')==='false') return; // opt-out explícito
    try{
      const cap=window.Capacitor;
      if(cap && typeof cap.isPluginAvailable==='function' && !cap.isPluginAvailable('PushNotifications')) return;
      return suscribirPushNativo();
    }catch(e){ return; }
  }
  if(!('Notification'in window)||!('serviceWorker'in navigator)) return;
  if(Notification.permission==='denied') return;
  if(Notification.permission==='default'){
    const p=await Notification.requestPermission();
    if(p!=='granted') return;
  }
  try{
    const reg=await navigator.serviceWorker.ready;
    const kr=await api('/api/push/clave');
    if(!kr||!kr.publicKey) return console.warn('suscribirPush: sin clave pública');
    if(!kr.enabled) return console.warn('suscribirPush: push deshabilitado en backend');
    const key=urlBase64ToUint8Array(kr.publicKey);
    const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    await api('/api/push/suscribir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:sub})});
  }catch(e){ console.error('suscribirPush:', e.message); }
}
async function suscribirPushNativo(){
  try{
    const { PushNotifications } = window.Capacitor.Plugins;
    const perm = await PushNotifications.requestPermissions();
    if(perm.receive!=='granted') return;
    await PushNotifications.addListener('registration', async token=>{
      try{ await api('/api/push/suscribir-fcm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token.value})}); console.log('[FCM] Token registrado:',token.value.slice(0,20)+'...'); }catch(e){ console.error('[FCM] Error registrando token:',e.message); }
    });
    await PushNotifications.addListener('registrationError', err=>console.error('[FCM] Registration error:', err));
    // Notificación recibida con app en foreground — mostrar toast local
    await PushNotifications.addListener('pushNotificationReceived', action=>{
      try{
        const n=action.notification||{};
        const tipo=n.data&&n.data.tipo;
        if(tipo==='equipo_directo'||tipo==='equipo_general'||tipo==='equipo_mencion'){
          toast((n.title||'Equipo')+': '+((n.body||'').slice(0,60))); haptic([60,30,60]); playNotifSound();
        }
      }catch(e){}
    });
    // Tocar la notificación con la app en background debe abrir el lead correspondiente
    await PushNotifications.addListener('pushNotificationActionPerformed', action=>{
      try{
        const data=action.notification&&action.notification.data;
        const leadId=data&&data.leadId;
        const tipo=data&&data.tipo;
        if(leadId) abrirChat(Number(leadId));
        else if(tipo&&tipo.startsWith('equipo')){ /* TODO: abrir chat de equipo */ }
      }catch(e){}
    });
    await PushNotifications.register();
  }catch(e){ console.error('suscribirPushNativo:', e.message); }
}
async function limpiarCache(){
  if('caches'in window){ const k=await caches.keys(); await Promise.all(k.map(x=>caches.delete(x))); }
  ['sp_notif_sound_custom'].forEach(k=>localStorage.removeItem(k));
  toast('Caché limpiado');
}

// Convención unificada de tiempo (Fase 1.1, docs/AUDITORIA_2026-08.md 1.7): el backend
// guarda SIEMPRE en UTC. Un texto con sufijo 'Z'/offset es un dato nuevo y se parsea
// directo; sin sufijo se asume UTC (dato legado, coincide con el DEFAULT congelado de la
// mayoría de las tablas de producción). Todo lo que se MUESTRA usa timeZone:'America/Bogota'
// fijo, para que el asesor vea la misma hora real sin importar la config. de su teléfono.
function parseDbDate(ts){
  if(!ts) return null;
  const s=String(ts).trim(); if(!s) return null;
  const conOffset=/[Zz]$|[+-]\d{2}:?\d{2}$/.test(s);
  const d=new Date(conOffset?s:s.replace(' ','T')+'Z');
  return isNaN(d.getTime())?null:d;
}
function horaCorta(ts){ const d=parseDbDate(ts); if(!d) return ''; const h=new Date(); const sd=d.toDateString()===h.toDateString(); return sd? d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'}) : d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',timeZone:'America/Bogota'}); }
function soloHora(ts){ const d=parseDbDate(ts); return d?d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'}):''; }
function dateLabel(ts){ const d=parseDbDate(ts); if(!d) return ''; const h=new Date(), a=new Date(); a.setDate(h.getDate()-1); const sd=(x,y)=>x.toDateString()===y.toDateString(); if(sd(d,h)) return 'Hoy'; if(sd(d,a)) return 'Ayer'; return d.toLocaleDateString('es-CO',{day:'2-digit',month:'long',timeZone:'America/Bogota'}); }

function estado(l){ const e=l.etiqueta||'sin_clasificar'; if(['interesado','negociacion','cita'].includes(e)) return {cls:'st-caliente',label:'Lead caliente'}; const ref=l.updated_at||l.created_at; const refD=parseDbDate(ref); const dias=refD?(Date.now()-refD.getTime())/864e5:0; if(dias>7) return {cls:'st-inactivo',label:'Inactivo'}; if(Number(l.unread_count||0)>0) return {cls:'st-esperando',label:'Esperando respuesta'}; return {cls:'st-disponible',label:'Disponible'}; }
// Solo WhatsApp soporta plantillas Meta / llamadas — Messenger e Instagram usan sus propios canales.
function esWhatsAppLead(l){ const p=(l&&l.customer_phone)||''; return !p.startsWith('instagram_')&&!p.startsWith('messenger_'); }
function leadScore(l){ let s=40; const e=l.etiqueta||''; if(e==='negociacion')s=88; else if(e==='cita')s=80; else if(e==='interesado')s=66; else if(e==='vendido')s=100; s+=Math.min(20,(l.messages_count||0)); return Math.min(99,s); }

/* ════════ API ════════ */
// api.lastStatus queda con el código HTTP de la última llamada que falló (o 0 si fue
// error de red). Antes cualquier !r.ok (incluido 403 "sin_permiso") se tragaba como
// null indistinguible de "no hay datos" — el chat se veía vacío en vez de avisar que
// era un problema de permisos. Los callers que quieran distinguir leen api.lastStatus
// justo después del await; los que no, siguen funcionando igual que antes.
async function api(url, opts){
  try{
    const r = await fetch(url, Object.assign({credentials:'include', headers:{'Accept':'application/json'}}, opts||{}));
    if(r.status===401){ if(!location.pathname.startsWith('/login')) location.replace('/login.html'); api.lastStatus=401; return null; }
    if(!r.ok){ api.lastStatus=r.status; return null; }
    api.lastStatus=0;
    const ct=r.headers.get('content-type')||''; return ct.includes('json')? r.json() : r.text();
  }
  catch(e){ api.lastStatus=0; return null; }
}
// --- Cola offline de mensajes salientes (Fase 1.2, docs/AUDITORIA_2026-08.md 2.3) ---
// Si el dispositivo pierde señal justo al enviar, el mensaje no se descarta: se guarda
// en localStorage y se reintenta solo al volver la conexión ('online') o al reabrir la
// app. Solo se encola cuando el fetch falla por RED (fetch lanza TypeError) — un rechazo
// real del servidor (400/500, r.ok===false) NO se encola, para no esconder un error real
// detrás de un "ya se va a enviar" falso.
const OUTBOX_KEY = 'sp_outbox_msgs_v1';
function outboxGet(){ try{ return JSON.parse(localStorage.getItem(OUTBOX_KEY)||'[]'); }catch(e){ return []; } }
function outboxSet(arr){ try{ localStorage.setItem(OUTBOX_KEY, JSON.stringify(arr)); }catch(e){} }
function outboxAdd(item){ const arr=outboxGet(); arr.push(item); outboxSet(arr); }
function outboxRemove(tempId){ outboxSet(outboxGet().filter(x=>x.tempId!==tempId)); }
function outboxPendingCount(){ return outboxGet().length; }

// POST normal; si falla por falta de red (no por rechazo del servidor), encola y
// devuelve {queued:true} en vez de null.
async function postOrQueue(url, payload, tempId, leadId){
  try{
    const r = await fetch(url, {method:'POST', credentials:'include', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify(payload)});
    if(r.status===401){ if(!location.pathname.startsWith('/login')) location.replace('/login.html'); return null; }
    if(!r.ok) return null; // rechazo real del servidor — no se encola, error visible como siempre
    const ct=r.headers.get('content-type')||'';
    return ct.includes('json')? await r.json() : await r.text();
  }catch(e){
    outboxAdd({tempId, leadId, url, payload, ts:Date.now()});
    return {queued:true};
  }
}

// Reintenta lo pendiente en orden. Se detiene en el primer fallo (probablemente sigue
// sin red) en vez de recorrer todo — el próximo evento 'online' retoma desde ahí.
let _outboxFlushing=false;
async function outboxFlush(){
  if(_outboxFlushing) return; _outboxFlushing=true;
  try{
    const pendientes=outboxGet();
    if(!pendientes.length) return;
    let huboExito=false;
    for(const item of pendientes){
      try{
        const r=await fetch(item.url,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(item.payload)});
        if(r.ok){ outboxRemove(item.tempId); huboExito=true; } else break;
      }catch(e){ break; }
    }
    if(huboExito){
      toast('Mensajes pendientes enviados');
      if(current){ const d=await api(`/api/leads/${current.id}/mensajes`); if(d){ currentMsgs=d.mensajes; const c=$('#cMsgs'); if(c){ c.innerHTML=msgsHTML(currentMsgs); c.scrollTop=c.scrollHeight; } } }
      cargar();
    }
  } finally { _outboxFlushing=false; }
}
window.addEventListener('online', outboxFlush);

async function apiDetailed(url, opts){
  try{
    const r = await fetch(url, Object.assign({credentials:'include', headers:{'Accept':'application/json'}}, opts||{}));
    if(r.status===401){ if(!location.pathname.startsWith('/login')) location.replace('/login.html'); return null; }
    const ct=r.headers.get('content-type')||'';
    const body=ct.includes('json')? await r.json() : await r.text();
    // Se conserva el body completo (no solo error/detalle): las validaciones de
    // plantillas vienen en `errores[]` y son lo único accionable para el asesor.
    if(!r.ok) return Object.assign({}, body, { _error:true, error:(body&&body.error)||'http_'+r.status, detalle:(body&&body.detalle)||'' });
    return body;
  }
  catch(e){ return null; }
}

/* ════════ Upload with progress ════════ */
function showProgressBar(){
  const div=document.createElement('div'); div.className='up-bar';
  div.innerHTML='<div class="up-bar__track"><div class="up-bar__fill" id="upFill"></div></div><span class="up-bar__label">Subiendo...</span>';
  document.body.appendChild(div);
  return div;
}
function apiUpload(url, body, pb){
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type','application/json');
    xhr.withCredentials=true;
    xhr.upload.onprogress=e=>{ if(e.lengthComputable&&pb){ const f=pb.querySelector('#upFill'); if(f) f.style.width=Math.round(e.loaded/e.total*100)+'%'; } };
    xhr.onload=()=>{ try{ const r=JSON.parse(xhr.responseText); resolve(r); }catch(e){ resolve(null); } };
    xhr.onerror=()=>reject(new Error('upload failed'));
    xhr.send(JSON.stringify(body));
  });
}
/* ════════ Datos demo ════════ */
function demoLeads(){ const now=new Date().toISOString(); return [
  {id:1,customer_name:'Juan Díaz',customer_phone:'+573001234567',etiqueta:'negociacion',status:'activo',updated_at:now,created_at:now,unread_count:3,last_message:'¿Cuál es el precio del lote de 250m²?',messages_count:14,assigned_to_nombre:'Asesor Test'},
  {id:2,customer_name:'María Gómez',customer_phone:'+573019876543',etiqueta:'interesado',status:'activo',updated_at:now,created_at:now,unread_count:0,last_message:'Perfecto, quedo atenta 🙏',messages_count:6,assigned_to_nombre:'Asesor Test'},
  {id:3,customer_name:'Pedro Ruiz',customer_phone:'+573025551122',etiqueta:'cita',status:'activo',updated_at:'2026-07-02 10:00:00',created_at:'2026-06-19 09:00:00',unread_count:1,last_message:'Nos vemos el sábado en el proyecto',messages_count:22,assigned_to_nombre:'Asesor Test'},
  {id:4,customer_name:'Laura Ortiz',customer_phone:'+573036667788',etiqueta:'sin_clasificar',status:'nuevo',updated_at:now,created_at:now,unread_count:2,last_message:'Hola, vi el anuncio en Facebook',messages_count:2,assigned_to_nombre:'Asesor Test'},
  {id:5,customer_name:'Andrés Peña',customer_phone:'+573041239876',etiqueta:'vendido',status:'cerrado',updated_at:'2026-06-10 12:00:00',created_at:'2026-05-01 09:00:00',unread_count:0,last_message:'¡Muchas gracias por todo!',messages_count:40,assigned_to_nombre:'Asesor Test'},
]; }
function demoMsgs(){ const now=new Date().toISOString(); return [
  {id:101,body:'Hola, vi el anuncio de los lotes en Tocaima.',direction:'incoming',timestamp:now},
  {id:102,body:'¡Hola Juan! Con gusto te ayudo. ¿Buscas para vivienda o inversión?',direction:'outgoing',timestamp:now},
  {id:103,body:'Para inversión. ¿Qué precios manejan?',direction:'incoming',timestamp:now},
  {id:104,body:null,direction:'outgoing',timestamp:now,media_type:'image',media_filename:'plano-lote.jpg'},
  {id:105,body:'¿Cuál es el precio del lote de 250m²?',direction:'incoming',timestamp:now},
]; }

/* ════════ Auto-actualización de la app (estilo Free Fire) ════════
   La web es OTA por sí sola (la app carga el sitio remoto); esto actualiza el
   APK NATIVO: detecta versión nueva vía /api/app/version, descarga con progreso
   (Filesystem) y lanza el instalador encima (ApkInstaller, misma firma). */
let _updInfo=null, _updApkPath=null, _updDescargando=false;

async function checkAppUpdate(){
  if(!esNativo()) return false;
  try{
    const info = await window.Capacitor.Plugins.App.getInfo();      // build = versionCode instalado
    const v = await api('/api/app/version');
    if(!v || !v.versionCode) return false;
    const instalado = Number(info.build)||0;
    if(v.versionCode <= instalado) return false;
    _updInfo = v;
    if(!v.obligatoria){
      try{
        const { Preferences } = window.Capacitor.Plugins;
        const skip = await Preferences.get({key:'sp_upd_skip'});
        if(Number(skip.value) === v.versionCode){ mostrarUpdBanner(v); return false; }
      }catch(e){}
    }
    mostrarPantallaUpdate(v);
    return !!v.obligatoria; // obligatoria = bloquear el resto del init
  }catch(e){ console.error('checkAppUpdate', e); return false; }
}

function mostrarPantallaUpdate(v){
  $('#updVer').textContent = 'Leons Group '+v.versionName;
  $('#updNotas').textContent = v.notas || '';
  $('#updBar').hidden = true; $('#updFill').style.width='0%'; $('#updPct').textContent='';
  const btn=$('#updBtn'); btn.disabled=false; btn.textContent = _updApkPath ? 'Instalar' : 'Actualizar ahora';
  btn.onclick = ()=>{ haptic(10); ejecutarUpdate(v); };
  const later=$('#updLater');
  later.hidden = !!v.obligatoria;
  later.onclick = async ()=>{
    try{ await window.Capacitor.Plugins.Preferences.set({key:'sp_upd_skip', value:String(v.versionCode)}); }catch(e){}
    $('#scUpdate').classList.remove('show'); mostrarUpdBanner(v);
  };
  $('#scUpdate').classList.add('show');
}

async function ejecutarUpdate(v){
  if(_updDescargando) return;
  const cap = window.Capacitor;
  // APK viejo sin los plugins nuevos: transición única vía descarga del navegador
  if(!cap.isPluginAvailable('ApkInstaller') || !cap.isPluginAvailable('Filesystem')){
    toast('Descargando… instala el APK desde tus descargas');
    window.open(location.origin + v.apkUrl, '_blank');
    return;
  }
  const { Filesystem, ApkInstaller } = cap.Plugins;
  try{
    const can = await ApkInstaller.canInstall();
    if(!can.value){
      toast('Autoriza "Instalar apps desconocidas" y vuelve a intentar');
      await ApkInstaller.openInstallSettings();
      return;
    }
    // Ya descargado (canceló el instalador antes): reinstalar directo
    if(_updApkPath){ await ApkInstaller.install({ path:_updApkPath }); return; }

    _updDescargando = true;
    const btn=$('#updBtn'); btn.disabled=true; btn.textContent='Descargando…';
    $('#updBar').hidden=false;
    const sub = await Filesystem.addListener('progress', p=>{
      const pct = p.contentLength ? Math.min(100, Math.round(p.bytes/p.contentLength*100)) : 0;
      $('#updFill').style.width = pct+'%';
      $('#updPct').textContent = pct+'%' + (p.contentLength ? '  ('+(p.bytes/1048576).toFixed(1)+' MB)' : '');
    });
    try{
      const r = await Filesystem.downloadFile({
        url: location.origin + v.apkUrl,
        path: 'leons-group-'+v.versionCode+'.apk',
        directory: 'CACHE',
        progress: true,
      });
      _updApkPath = r.path;
      $('#updFill').style.width='100%'; $('#updPct').textContent='Abriendo instalador…';
      await ApkInstaller.install({ path: r.path });
      btn.textContent='Instalar'; btn.disabled=false; // por si el usuario cancela el instalador
    } finally {
      try{ sub.remove(); }catch(e){}
      _updDescargando = false;
    }
  }catch(e){
    console.error('ejecutarUpdate', e);
    _updDescargando = false;
    const btn=$('#updBtn'); btn.disabled=false; btn.textContent='Reintentar';
    $('#updPct').textContent='Error al descargar. Revisa tu conexión.';
  }
}

function mostrarUpdBanner(v){
  const b=$('#updBanner'); if(!b) return;
  $('#updBannerTxt').textContent = _updApkPath
    ? 'Actualización descargada — toca para instalar'
    : 'Nueva versión '+v.versionName+' disponible';
  $('#updBannerBtn').onclick = ()=>{ haptic(10); mostrarPantallaUpdate(v); };
  const x=$('#updBannerX');
  if(x) x.onclick = async ()=>{
    haptic(8);
    try{ await window.Capacitor.Plugins.Preferences.set({key:'sp_upd_skip', value:String(v.versionCode)}); }catch(e){}
    b.hidden = true;
  };
  b.hidden=false;
}

function initUpdateResume(){
  if(!esNativo()) return;
  try{
    window.Capacitor.Plugins.App.addListener('resume', async ()=>{
      if(!_updInfo) return;
      try{
        const info = await window.Capacitor.Plugins.App.getInfo();
        if(Number(info.build) >= _updInfo.versionCode){
          // Ya se actualizó — limpiar restos
          _updInfo=null; _updApkPath=null;
          $('#scUpdate').classList.remove('show'); $('#updBanner').hidden=true;
          location.reload();
        } else if(_updInfo.obligatoria){
          mostrarPantallaUpdate(_updInfo);
        } else if(_updApkPath){
          mostrarUpdBanner(_updInfo);
        }
      }catch(e){}
    });
  }catch(e){}
}

/* ════════ Chat interno Equipo Leons (canal general + directos, SSE) ════════ */
let teamMsgs=[], _eqAbierto=false, _eqCon=null, _eqAsesores=[], _eqPresence={}, _eqReplyTo=null;
const EQ_COLORS=['#2E7D46','#5B7B8C','#7C6BB0','#8C4A4A','#4A7A8C','#6B8C4A','#8C6B2A','#4A5B8C','#8C4A6B','#5B8C4A'];
function eqColor(id){ return EQ_COLORS[Number(id||0) % EQ_COLORS.length]; }
function miId(){ return me?(me.rol==='admin'?0:Number(me.vendedorId)):null; }
function esMio(m){
  if(!me) return false;
  if(me.rol==='admin') return Number(m.from_vendedor_id)===0;
  return Number(m.from_vendedor_id)===Number(me.vendedorId);
}
function eqReactionsHTML(msgId, reactions){
  if(!reactions||!reactions.length) return '';
  const counts={}; const mineSet=new Set();
  reactions.forEach(r=>{
    counts[r.emoji]=(counts[r.emoji]||0)+1;
    if(Number(r.from_vendedor_id)===Number(miId())) mineSet.add(r.emoji);
  });
  return '<div class="bub-reactions">'+Object.entries(counts).map(([emoji,cnt])=>`<span class="bub-reaction${mineSet.has(emoji)?' mine':''}" data-emoji="${esc(emoji)}" data-msgid="${msgId}">${emoji}${cnt>1?`<span class="r-count">${cnt}</span>`:''}</span>`).join('')+'</div>';
}
function eqQuoteHTML(m){
  if(!m.reply_to_body||m.reply_deleted) return '';
  const label=m.reply_to_from||'Asesor';
  return `<div style="margin-bottom:4px;border-left:3px solid var(--gold);padding:4px 8px;font-size:11.5px;color:var(--text-3);background:rgba(200,164,90,.06);border-radius:4px"><span style="color:var(--gold);font-weight:600">${esc(label)}</span><br>${esc((m.reply_to_body||'').slice(0,100))}</div>`;
}
function eqMediaHTML(m){
  if(!m.media_type||!m.media_url) return '';
  if(m.media_type==='location'){
    let lat,lng,name,address;
    try{ const d=JSON.parse(m.body||m.media_url||'{}'); lat=d.latitude; lng=d.longitude; name=d.name; address=d.address; }catch(e){ return '<div style="margin-top:4px;padding:8px 12px;background:rgba(200,164,90,.1);border-radius:10px;font-size:12px;color:var(--gold)">📍 Ubicación</div>'; }
    const mapsUrl=`https://www.google.com/maps?q=${lat},${lng}`;
    const label=[name,address].filter(Boolean).join(' — ')||'Ubicación';
    const mapId='eqm_'+((m.id||Math.random().toString(36).slice(2,8)));
    return `<div style="margin-top:4px;border-radius:10px;overflow:hidden;border:1px solid var(--border-soft);cursor:pointer" onclick="window.open('${mapsUrl}','_blank')"><div class="leaflet-map" id="${mapId}" data-lat="${lat}" data-lng="${lng}" style="height:120px;width:100%"></div><div style="padding:8px 10px;display:flex;align-items:center;gap:6px"><span>📍</span><div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(label)}</div><div style="font-size:10px;color:var(--text-3)">${lat.toFixed(5)}, ${lng.toFixed(5)}</div></div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14" style="flex-shrink:0;color:var(--gold)"><path d="M7 17l9.2-9.2M17 17V7H7"/></svg></div></div>`;
  }
  if(m.media_type==='sticker'){
    const src=m.id?`/api/media/${m.id}`:(m.media_url||'');
    return src?`<div style="margin-top:4px"><img src="${esc(src)}" style="max-width:160px;border-radius:8px;display:block" loading="lazy"></div>`:'';
  }
  if(m.media_type==='audio'){
    const src=m.id?`/api/media/${m.id}`:(m.media_url||'');
    return src?eqRenderAudioPlayer(m.id,src):'';
  }
  if(m.media_type==='image'){
    const src=m.id?`/api/media/${m.id}`:(m.media_url||'');
    return src?`<div style="margin-top:4px;cursor:pointer" onclick="eqOpenLB('${esc(src)}')"><img src="${esc(src)}" style="max-width:210px;border-radius:10px;display:block" loading="lazy"></div>`:'';
  }
  if(m.media_type==='video'){
    const src=m.id?`/api/media/${m.id}`:(m.media_url||'');
    return src?`<div style="margin-top:4px"><video src="${esc(src)}" controls style="max-width:210px;border-radius:10px;display:block"></video></div>`:'';
  }
  if(m.media_type==='document'){
    const src=m.id?`/api/media/${m.id}`:(m.media_url||'');
    return `<a href="${esc(src)}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;margin-top:4px;padding:8px 12px;background:rgba(200,164,90,.1);border:1px solid var(--gold);border-radius:10px;color:var(--gold);font-size:12px;text-decoration:none">📄 ${esc(m.media_filename||'Documento')}</a>`;
  }
  return '';
}
function eqGenerateWaveform(id){let h=0;const s=String(id);for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}const b=[];for(let i=0;i<20;i++){b.push(Math.round(Math.abs(Math.sin(h*(i+1)*137.5))*18+4));}return b;}
let _eqAudioPlayers={};
window.eqTogglePlay=function(id){
  const btn=document.getElementById(id+'_eqbtn');const wave=document.getElementById(id+'_eqwave');const timeEl=document.getElementById(id+'_eqtime');
  if(!btn||!wave)return;const container=btn.closest('.eq-audio-player');if(!container)return;const src=container.dataset.src;if(!src)return;
  Object.keys(_eqAudioPlayers).forEach(k=>{if(k!==id&&_eqAudioPlayers[k]&&!_eqAudioPlayers[k].paused){_eqAudioPlayers[k].pause();const ob=document.getElementById(k+'_eqbtn');if(ob)ob.classList.remove('playing');}});
  if(_eqAudioPlayers[id]){if(!_eqAudioPlayers[id].paused){_eqAudioPlayers[id].pause();btn.classList.remove('playing');return;}_eqAudioPlayers[id].play().then(()=>btn.classList.add('playing')).catch(()=>{});return;}
  const a=new Audio();a.preload='auto';a.src=src;a.playbackRate=Number(localStorage.getItem('sp_audio_rate'))||1;
  a.addEventListener('timeupdate',()=>{if(a.duration){const bars=wave.querySelectorAll('.eq-ap-bar');bars.forEach((bar,i)=>bar.classList.toggle('active',i<Math.floor((a.currentTime/a.duration)*bars.length)));}if(timeEl)timeEl.textContent=Math.floor(a.currentTime/60)+':'+String(Math.floor(a.currentTime%60)).padStart(2,'0');});
  a.addEventListener('ended',()=>{btn.classList.remove('playing');if(wave)wave.querySelectorAll('.eq-ap-bar').forEach(b=>b.classList.remove('active'));});
  _eqAudioPlayers[id]=a;a.play().then(()=>btn.classList.add('playing')).catch(()=>{delete _eqAudioPlayers[id];});
};
function eqRenderAudioPlayer(id,src){
  const bars=eqGenerateWaveform(id);
  return `<div class="eq-audio-player" id="${id}_eqwrap" data-src="${src}" style="margin-top:4px;display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(200,164,90,.08);border-radius:12px;max-width:220px">
    <button class="eq-ap-btn" id="${id}_eqbtn" onclick="eqTogglePlay('${id}')" style="width:30px;height:30px;border-radius:50%;border:none;background:var(--gold);color:#0A0A0A;display:grid;place-items:center;cursor:pointer;flex-shrink:0"><svg viewBox="0 0 24 24" width="14" height="14"><polygon points="6,3 20,12 6,21" fill="currentColor"/></svg></button>
    <div class="eq-ap-wave" id="${id}_eqwave" style="display:flex;align-items:center;gap:2px;flex:1">${bars.map(h=>`<div class="eq-ap-bar" style="height:${h}px;width:3px;border-radius:2px;background:var(--gold);opacity:.35"></div>`).join('')}</div>
    <span id="${id}_eqtime" style="font-size:10px;color:var(--text-3);min-width:30px;text-align:right">0:00</span>
  </div>`;
}
function eqLinkify(text){
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" style="color:var(--gold);text-decoration:underline">$1</a>');
}
function eqFindVendedor(id){
  if(Number(id)===0) return {nombre:'Admin',foto:null};
  return _eqAsesores.find(v=>Number(v.id)===Number(id))||{nombre:'Asesor',foto:null};
}
function eqHexToRgba(hex,a){
  const c=hex.replace('#','');
  const r=parseInt(c.substring(0,2),16);
  const g=parseInt(c.substring(2,4),16);
  const b=parseInt(c.substring(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}
function eqDayLabel(ts){
  const d=parseDbDate(ts); if(!d) return '';
  const now=new Date(), y=new Date(now); y.setDate(y.getDate()-1);
  if(d.toDateString()===now.toDateString()) return 'Hoy';
  if(d.toDateString()===y.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-CO',{day:'numeric',month:'long',timeZone:'America/Bogota'});
}
function eqMsgHTML(m, idx, arr){
  const mio=esMio(m);
  const hora=horaCorta(m.created_at);
  if(m.deleted) return `<div class="eq-msg-row ${mio?'mio':'otro'}"><div class="bub bub--${mio?'out':'in'}" style="max-width:75%;opacity:.5;font-style:italic"><span class="bub-body">Mensaje eliminado</span><div class="bub__t">${hora}</div></div></div>`;
  const prev=arr[idx-1];
  const grouped=prev && !prev.deleted && prev.from_vendedor_id===m.from_vendedor_id && (parseDbDate(m.created_at)-parseDbDate(prev.created_at))<120000;
  const v=eqFindVendedor(m.from_vendedor_id);
  const avatarBg=v.foto?'':`background:${eqColor(m.from_vendedor_id)}`;
  const avatarContent=v.foto?`<img src="${esc(v.foto)}" alt="">`:initials(v.nombre);
  const pinIcon=m.pinned_at?' 📌':'';
  const editIcon=m.edited_at?'<span style="font-size:9px;color:var(--text-3);font-style:italic;margin-left:3px">editado</span>':'';
  const readCheck=m.to_vendedor_id&&mio?(m.read_at?'<span style="font-size:9px;color:var(--gold);margin-left:3px">✓✓</span>':'<span style="font-size:9px;color:var(--text-3);margin-left:3px;opacity:.5">✓</span>'):'';
  const vc=eqColor(m.from_vendedor_id);
  const bubBg=mio?'':`background:${eqHexToRgba(vc,.15)};border-left:3px solid ${vc};`;
  return `<div class="eq-msg-row ${mio?'mio':'otro'}${grouped?' eq-msg-grouped':''}" data-msgid="${m.id}">
    ${!mio?`<div class="eq-avatar" style="${avatarBg}">${avatarContent}</div>`:''}
    <div class="bub bub--${mio?'out':'in'}" style="max-width:75%;${bubBg}">
      ${!mio&&!grouped?`<div style="font-size:10.5px;font-weight:700;color:${vc};margin-bottom:2px">${esc(v.nombre)}</div>`:''}
      ${eqQuoteHTML(m)}
      ${eqMediaHTML(m)}
      ${m.body?`<span class="bub-body">${eqLinkify(m.body)}${pinIcon}${editIcon}</span>`:''}
      <div class="bub__t">${hora}${readCheck}</div>
      ${eqReactionsHTML(m.id, m.reactions)}
    </div></div>`;
}
function renderEquipo(){
  const box=$('#eqMsgs'); if(!box) return;
  if(!teamMsgs.length){ box.innerHTML='<div class="m-empty" style="min-height:200px"><p>Envía el primer mensaje al equipo 🦁</p></div>'; return; }
  let html=''; let lastDay='';
  teamMsgs.forEach((m,i)=>{
    const day=eqDayLabel(m.created_at);
    if(day&&day!==lastDay){ html+=`<div class="eq-daysep">${day}</div>`; lastDay=day; }
    html+=eqMsgHTML(m,i,teamMsgs);
  });
  box.innerHTML=html;
  box.scrollTop=box.scrollHeight;
  initLocationMaps();
}
// Event delegation para el chat del equipo — se una sola vez
(function(){
  const box=$('#eqMsgs'); if(!box) return;
  let pressTimer=null, dragX0=0, dragging=false;
  box.addEventListener('touchstart',e=>{
    const wrap=e.target.closest('.eq-msg-row[data-msgid]');
    const bub=wrap&&wrap.querySelector('.bub');
    if(!bub) return;
    dragX0=e.touches[0].clientX; dragging=false;
    const msgId=Number(wrap.dataset.msgid);
    const msg=teamMsgs.find(x=>x.id===msgId);
    pressTimer=setTimeout(()=>{ haptic(15); eqShowMsgActions(msgId,msg); },500);
  },{passive:true});
  box.addEventListener('touchmove',e=>{
    clearTimeout(pressTimer);
    const dx=Math.max(0,e.touches[0].clientX-dragX0);
    if(dx>50&&!dragging){ dragging=true; const wrap=e.target.closest('.eq-msg-row[data-msgid]'); const bub=wrap&&wrap.querySelector('.bub'); if(bub){ bub.style.transition='transform .25s var(--spring)'; bub.style.transform='translateX(0)'; } const msgId=wrap?Number(wrap.dataset.msgid):null; const msg=msgId?teamMsgs.find(x=>x.id===msgId):null; if(msgId) eqSetReply(msgId,msg); }
  },{passive:true});
  box.addEventListener('touchend',e=>{
    clearTimeout(pressTimer); dragging=false;
    const bub=e.target.closest('.bub');
    if(bub){ bub.style.transition='transform .3s var(--spring)'; bub.style.transform='translateX(0)'; }
  });
  box.addEventListener('click',e=>{
    const el=e.target.closest('.bub-reaction[data-emoji]');
    if(el) eqToggleReaction(Number(el.dataset.msgid),el.dataset.emoji);
  });
})();
function eqShowMsgActions(msgId,msg){
  const isMio=msg&&esMio(msg);
  const isAdmin=me&&me.rol==='admin';
  const isPinned=msg&&msg.pinned_at;
  const items=[
    `<div class="ctx-item primary" data-eqact="reply"><div class="ctx-ic">💬</div><div>Responder</div></div>`,
    `<div class="ctx-item" data-eqact="react"><div class="ctx-ic">👍</div><div>Reaccionar</div></div>`,
    `<div class="ctx-item" data-eqact="emoji"><div class="ctx-ic">😊</div><div>Emoji</div></div>`,
    `<div class="ctx-item" data-eqact="copy"><div class="ctx-ic">📋</div><div>Copiar texto</div></div>`,
    `<div class="ctx-item" data-eqact="forward"><div class="ctx-ic">↪️</div><div>Reenviar</div></div>`,
  ];
  if(isMio||isAdmin) items.push(`<div class="ctx-item" data-eqact="edit"><div class="ctx-ic">✏️</div><div>Editar</div></div>`);
  if(isMio||isAdmin) items.push(`<div class="ctx-item" data-eqact="pin"><div class="ctx-ic">${isPinned?'📌':'📍'}</div><div>${isPinned?'Desfijar':'Fijar mensaje'}</div></div>`);
  if(isMio) items.push(`<div class="ctx-item danger" data-eqact="delete_everyone"><div class="ctx-ic">🗑️</div><div>Eliminar para todos</div></div>`);
  items.push(`<div class="ctx-item danger" data-eqact="delete_me"><div class="ctx-ic">🗑️</div><div>Eliminar para mí</div></div>`);
  openSheet('Acciones',`<div style="padding:6px 0">${items.join('')}</div>`);
  setTimeout(()=>{
    document.querySelectorAll('[data-eqact]').forEach(el=>{
      el.addEventListener('click',()=>{
        const act=el.dataset.eqact;
        closeSheet();
        if(act==='reply') eqSetReply(msgId,msg);
        else if(act==='react') eqToggleReaction(msgId,'👍');
        else if(act==='emoji') eqShowEmojiPicker(msgId);
        else if(act==='pin') eqTogglePin(msgId);
        else if(act==='edit') eqStartEdit(msgId,msg);
        else if(act==='forward') eqForwardMsg(msgId);
        else if(act==='copy') eqCopyMsg(msgId);
        else if(act==='delete_everyone') eqDeleteMsg(msgId,'everyone');
        else if(act==='delete_me') eqDeleteMsg(msgId,'me');
      });
    });
  },50);
}
const EQ_EMOJIS=['👍','❤️','😂','😮','👎','🔥','✅','💯','👏','🙌','😎','🤝'];
function eqShowEmojiPicker(msgId){
  const html=`<div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 0">${EQ_EMOJIS.map(e=>`<button class="eq-emoji-btn" data-eqemoji="${e}" style="width:40px;height:40px;border-radius:10px;border:1px solid var(--border-soft);background:var(--bg-3);font-size:22px;cursor:pointer;display:grid;place-items:center">${e}</button>`).join('')}</div>`;
  openSheet('Reaccionar',html);
  setTimeout(()=>{
    document.querySelectorAll('[data-eqemoji]').forEach(el=>{
      el.addEventListener('click',()=>{ closeSheet(); eqToggleReaction(msgId,el.dataset.eqemoji); });
    });
  },50);
}
async function eqTogglePin(msgId){
  const r=await api('/api/equipo/messages/'+msgId+'/pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
  if(r&&r.ok){ toast(r.pinned?'Mensaje fijado':'Mensaje desfijado'); eqLoadPinned(); }
}
let _eqEditingId=null;
function eqStartEdit(msgId,msg){
  if(!msg)return;
  _eqEditingId=msgId;
  const inp=$('#eqInput');if(inp){inp.value=msg.body||'';inp.focus();}
}
function eqCancelEdit(){_eqEditingId=null;}
async function eqForwardMsg(msgId){
  const items=_eqAsesores.map(a=>`<div class="ctx-item" data-eqfwd="${a.id}"><div class="ctx-ic">↪️</div><div>${esc(a.nombre)}</div></div>`).join('');
  openSheet('Reenviar a…',`<div style="padding:6px 0"><div class="ctx-item" data-eqfwd="general"><div class="ctx-ic">🦁</div><div>Canal General</div></div>${items}</div>`);
  setTimeout(()=>{
    document.querySelectorAll('[data-eqfwd]').forEach(el=>{
      el.addEventListener('click',async()=>{
        const to=el.dataset.eqfwd==='general'?null:Number(el.dataset.eqfwd);
        closeSheet();
        const r=await api('/api/equipo/messages/'+msgId+'/forward',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to})});
        if(r&&r.mensaje){toast('↪️ Reenviado');}
        else toast('Error','err');
      });
    });
  },50);
}
function eqCopyMsg(msgId){
  const msg=teamMsgs.find(x=>x.id===msgId);if(!msg)return;
  navigator.clipboard.writeText(msg.body||'').then(()=>toast('📋 Copiado')).catch(()=>{});
}
window.eqOpenLB=function(src){
  const lb=document.getElementById('eqLB');if(!lb)return;
  document.getElementById('eqLBImg').src=src;lb.classList.add('show');
};
function eqSetReply(msgId,msg){
  if(!msg) return; _eqReplyTo=msg; haptic(12);
  const bar=$('#eqReplyBar'); if(bar) bar.classList.add('show');
  const lbl=$('#eqReplyLabel'); const prev=$('#eqReplyPreview');
  if(lbl) lbl.textContent='Respondiendo a '+(msg.from_nombre||'Asesor');
  if(prev) prev.textContent=(msg.body||'').slice(0,80);
  const inp=$('#eqInput'); if(inp) inp.focus();
}
function eqCancelReply(){ _eqReplyTo=null; const bar=$('#eqReplyBar'); if(bar) bar.classList.remove('show'); }

// ── Pinned message ──
let _eqPinned=null;
async function eqLoadPinned(){
  const ch=_eqCon!=null?String(_eqCon):'general';
  const r=await api('/api/equipo/pinned?channel='+encodeURIComponent(ch));
  _eqPinned=r;
  const banner=$('#eqPinBanner');
  if(!banner) return;
  if(r){
    const from=r.from_nombre_full||r.from_nombre||'Asesor';
    banner.innerHTML=`<span class="eq-pin-banner__icon">📌</span><div class="eq-pin-banner__text"><div class="eq-pin-banner__label">Fijado por ${esc(from)}</div><div class="eq-pin-banner__body">${esc((r.body||'').slice(0,80))}</div></div><button class="eq-pin-banner__clear" onclick="eqUnpin()">✕</button>`;
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
}
window.eqUnpin=async function(){
  if(!_eqPinned) return;
  await api('/api/equipo/messages/'+_eqPinned.id+'/pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
  _eqPinned=null;
  const banner=$('#eqPinBanner'); if(banner) banner.classList.remove('show');
};

// ── Scroll to bottom button ──
function eqInitScrollBtn(){
  const btn=$('#eqScrollBtn'); const box=$('#eqMsgs'); if(!btn||!box) return;
  btn.innerHTML=I(SVG.arrowUp,18); // el HTML estático nunca interpolaba esto — quedaba el texto literal del template
  box.addEventListener('scroll',()=>{
    const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<100;
    btn.classList.toggle('show',!nearBottom);
  });
  btn.onclick=()=>{ box.scrollTo({top:box.scrollHeight,behavior:'smooth'}); };
}

// ── Audio recording for team chat ──
let _eqRec=null,_eqRecChunks=[],_eqRecTimer=null,_eqRecStart=0;
function eqInitAudio(){
  const micBtn=$('#eqMicBtn'); const inp=$('#eqInput'); if(!micBtn) return;
  micBtn.onclick=async()=>{
    if(_eqRec&&_eqRec.state==='recording'){ eqStopRec(); return; }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mt=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isSupported&&MediaRecorder.isTypeSupported(t))||'';
      _eqRec=new MediaRecorder(stream,{mimeType:mt||undefined});
      _eqRecChunks=[];
      _eqRec.ondataavailable=e=>{ if(e.data.size>0) _eqRecChunks.push(e.data); };
      _eqRec.onstop=()=>{ stream.getTracks().forEach(t=>t.stop()); eqSendAudio(); };
      _eqRec.start();
      _eqRecStart=Date.now();
      const bar=$('#eqRecBar'); if(bar) bar.classList.add('show');
      _eqRecTimer=setInterval(()=>{
        const s=Math.floor((Date.now()-_eqRecStart)/1000);
        const t=$('#eqRecTime'); if(t) t.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
      },1000);
      if(inp) inp.style.display='none';
    }catch(e){ toast('No se pudo acceder al micrófono','err'); }
  };
  const cancelBtn=$('#eqRecCancel');
  if(cancelBtn) cancelBtn.onclick=()=>{ if(_eqRec&&_eqRec.state==='recording') _eqRec.stop(); _eqRecChunks=[]; eqCleanRec(); };
  const sendBtn=$('#eqRecSend');
  if(sendBtn){ sendBtn.innerHTML=I(SVG.send,16); sendBtn.onclick=()=>{ if(_eqRec&&_eqRec.state==='recording') eqStopRec(); }; }
}
function eqStopRec(){ if(_eqRec&&_eqRec.state==='recording') _eqRec.stop(); clearInterval(_eqRecTimer); }
function eqCleanRec(){ clearInterval(_eqRecTimer); _eqRec=null; _eqRecChunks=[]; const bar=$('#eqRecBar'); if(bar) bar.classList.remove('show'); const inp=$('#eqInput'); if(inp) inp.style.display=''; }
async function eqSendAudio(){
  if(!_eqRecChunks.length){ eqCleanRec(); return; }
  const blob=new Blob(_eqRecChunks,{type:_eqRecChunks[0]?.type||'audio/webm'});
  if(blob.size<100){ eqCleanRec(); toast('Audio muy corto'); return; }
  const reader=new FileReader();
  reader.onload=async()=>{
    const dataUrl=reader.result;
    const payload={body:'',media_type:'audio',media_url:dataUrl};
    if(_eqCon!=null) payload.to=_eqCon;
    eqCleanRec();
    const r=await api('/api/equipo/mensajes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(r&&r.mensaje){ if(!teamMsgs.find(m=>m.id===r.mensaje.id)) teamMsgs.push(r.mensaje); renderEquipo(); marcarEquipoLeido(); }
    else toast('Error al enviar audio','err');
  };
  reader.readAsDataURL(blob);
}

// ── Adjuntos del chat de equipo ──
function eqAbrirAdjuntos(){
  const items=[['image','Imagen',SVG.image],['video','Video',SVG.video],['sticker','Sticker',SVG.smile],['file','Documento',SVG.file],['location','Ubicación',SVG.mapPin]];
  openSheet('Adjuntar', `<div class="att-grid">${items.map(([k,l,ic])=>`<button class="att-i" data-eqatt="${k}"><span class="ic">${I(ic,24)}</span>${l}</button>`).join('')}</div>`);
  $('#sheetBody').querySelectorAll('[data-eqatt]').forEach(b=>b.onclick=()=>{ haptic(10); const k=b.dataset.eqatt; closeSheet();
    if(k==='image'){ const fi=$('#eqFileInput'); if(fi){ fi.removeAttribute('capture'); fi.accept='image/*'; fi.click(); } }
    else if(k==='video'){ const fi=$('#eqFileInput'); if(fi){ fi.removeAttribute('capture'); fi.accept='video/*'; fi.click(); } }
    else if(k==='file'){ const fi=$('#eqFileInput'); if(fi){ fi.removeAttribute('capture'); fi.accept='.pdf,.doc,.docx,.xls,.xlsx,.txt'; fi.click(); } }
    else if(k==='sticker') eqAbrirStickers();
    else if(k==='location') eqAbrirUbicacion();
  });
}
function eqInitFileInput(){
  const fi=document.createElement('input'); fi.type='file'; fi.id='eqFileInput'; fi.style.display='none'; fi.accept='image/*,video/*,.pdf,.doc,.docx';
  fi.onchange=async()=>{ const file=fi.files[0]; if(!file) return; fi.value=''; haptic(10); closeSheet();
    if((file.type||'').startsWith('image/')){ eqAbrirEditorImagen(file); return; }
    const toBase64=f=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(f); });
    const dataBase64=await toBase64(file); const mime=file.type||'application/octet-stream';
    await eqEnviarArchivo(dataBase64, mime, file.name);
  };
  document.body.appendChild(fi);
}
async function eqEnviarArchivo(dataBase64, mime, filename, caption){
  const payload={body:'',media_type:mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'document',media_url:'data:'+mime+';base64,'+dataBase64};
  if(caption) payload.body=caption;
  if(_eqCon!=null) payload.to=_eqCon;
  toast('Enviando…');
  const r=await api('/api/equipo/mensajes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(r&&r.mensaje){ if(!teamMsgs.find(m=>m.id===r.mensaje.id)) teamMsgs.push(r.mensaje); renderEquipo(); marcarEquipoLeido(); toast('Enviado'); }
  else toast('Error al enviar archivo','err');
}
function eqAbrirEditorImagen(file){
  const reader=new FileReader();
  reader.onload=()=>{
    const dataUrl=reader.result;
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;z-index:300;background:rgba(10,10,10,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px';
    ov.innerHTML=`<div style="position:relative;width:100%;max-width:400px;max-height:60vh;overflow:hidden;border-radius:12px"><img id="eqIeImg" src="${dataUrl}" style="width:100%;display:block;object-fit:contain"></div>
      <textarea id="eqIeCaption" placeholder="Agregar caption…" rows="2" style="width:100%;max-width:400px;padding:10px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:14px;font-family:inherit;resize:none;outline:none"></textarea>
      <div style="display:flex;gap:10px;width:100%;max-width:400px">
        <button id="eqIeCancel" style="flex:1;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:14px;cursor:pointer">Cancelar</button>
        <button id="eqIeSend" style="flex:1;padding:12px;border-radius:12px;border:none;background:var(--gold);color:#0A0A0A;font-size:14px;font-weight:700;cursor:pointer">Enviar</button>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#eqIeCancel').onclick=()=>ov.remove();
    ov.querySelector('#eqIeSend').onclick=async()=>{
      ov.remove(); toast('Procesando imagen…');
      const toBase64=url=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(url); });
      // Redimensionar a max 1280px
      const img=new Image();
      img.onload=async()=>{
        const maxDim=1280; let w=img.width,h=img.height;
        if(w>maxDim||h>maxDim){ const ratio=Math.min(maxDim/w,maxDim/h); w=Math.round(w*ratio); h=Math.round(h*ratio); }
        const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.9));
        const dataBase64=await new Promise((res,rej)=>{ const reader2=new FileReader(); reader2.onload=()=>res(reader2.result.split(',')[1]); reader2.onerror=rej; reader2.readAsDataURL(blob); });
        const caption=ov.querySelector('#eqIeCaption')?.value||'';
        await eqEnviarArchivo(dataBase64,'image/jpeg','foto.jpg',caption);
      };
      img.src=dataUrl;
    };
  };
  reader.readAsDataURL(file);
}
async function eqAbrirStickers(){
  let lista=[];
  try{ const r=await fetch('/stickers/index.json',{credentials:'include'}); if(r.ok) lista=await r.json(); }catch(e){}
  if(!Array.isArray(lista)||!lista.length){ toast('Sin stickers disponibles aún'); return; }
  openSheet('Stickers', `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:6px 0">${lista.map(f=>`<button data-eqstk="${esc(f)}" style="border:none;background:var(--bg-3);border-radius:14px;padding:8px;cursor:pointer"><img src="/stickers/${esc(f)}" style="width:100%;aspect-ratio:1;object-fit:contain"></button>`).join('')}</div>`);
  $('#sheetBody').querySelectorAll('[data-eqstk]').forEach(b=>b.onclick=async()=>{
    haptic(10); closeSheet(); toast('Enviando sticker…');
    try{
      const resp=await fetch('/stickers/'+b.dataset.eqstk,{credentials:'include'});
      const blob=await resp.blob();
      const dataBase64=await new Promise((res,rej)=>{ const r2=new FileReader(); r2.onload=()=>res(r2.result.split(',')[1]); r2.onerror=rej; r2.readAsDataURL(blob); });
      const payload={body:'',media_type:'image',media_url:'data:image/webp;base64,'+dataBase64};
      if(_eqCon!=null) payload.to=_eqCon;
      const r=await api('/api/equipo/mensajes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(r&&r.mensaje){ if(!teamMsgs.find(m=>m.id===r.mensaje.id)) teamMsgs.push(r.mensaje); renderEquipo(); marcarEquipoLeido(); toast('Sticker enviado'); }
      else toast('Error al enviar sticker');
    }catch(e){ toast('Error al enviar sticker'); }
  });
}
function eqAbrirUbicacion(){
  const DEFAULT_POS={lat:4.7110,lng:-74.0721};
  let picker={lat:DEFAULT_POS.lat,lng:DEFAULT_POS.lng,name:'',address:''};
  let pMap=null,pMarker=null;
  const formHtml=`<div class="loc-picker-map" id="eqLocMap"><button class="loc-picker-locate" id="eqLocateBtn" title="Mi ubicación">${I(SVG.target,18)}</button></div>
    <div class="loc-picker-hint">Toca el mapa o arrastra el pin</div>
    <div class="loc-picker-info"><span class="loc-ic">📍</span><span class="loc-picker-addr" id="eqLocAddr">Obteniendo ubicación…</span></div>
    <button class="loc-picker-send" id="eqLocSend">${I(SVG.send,15)} Enviar ubicación</button>
    <div class="loc-search-wrap"><input id="eqLocSearch" placeholder="Buscar lugar…" autocomplete="off"><div class="loc-results" id="eqLocResults"></div></div>`;
  openSheet('Enviar ubicación', formHtml);
  const addrEl=$('#eqLocAddr');
  const setAddr=(txt)=>{ if(addrEl) addrEl.textContent=txt; };
  const movePicker=async(lat,lng,{name='',address='',skipGeocode=false}={})=>{
    picker={lat,lng,name,address};
    if(pMarker) pMarker.setLatLng([lat,lng]);
    if(pMap) pMap.setView([lat,lng],pMap.getZoom()<14?15:pMap.getZoom());
    if(address){setAddr(name?`${name} — ${address}`:address);return;}
    if(skipGeocode)return;
    setAddr('Buscando dirección…');
    try{ const g=await reverseGeocodeUbic(lat,lng); picker.name=g.name; picker.address=g.address; setAddr(g.address||`${lat.toFixed(5)}, ${lng.toFixed(5)}`); }
    catch(e){ setAddr(`${lat.toFixed(5)}, ${lng.toFixed(5)}`); }
  };
  (async()=>{
    const mapEl=$('#eqLocMap'); if(!mapEl)return;
    try{ await cargarLeaflet(); }catch(e){ if(mapEl) mapEl.innerHTML='<div style="display:grid;place-items:center;height:100%;color:var(--text-3);font-size:12px">No se pudo cargar el mapa</div>'; return; }
    if(!$('#eqLocMap'))return;
    pMap=L.map(mapEl,{zoomControl:false,attributionControl:false}).setView([picker.lat,picker.lng],12);
    capaTilesMapa(await getMapaConfig()).addTo(pMap);
    pMarker=L.marker([picker.lat,picker.lng],{draggable:true}).addTo(pMap);
    pMarker.on('dragend',()=>{const p=pMarker.getLatLng();movePicker(p.lat,p.lng);});
    pMap.on('click',e=>movePicker(e.latlng.lat,e.latlng.lng));
    setTimeout(()=>pMap&&pMap.invalidateSize(),150);
    try{ const pos=await obtenerPosicionActual(); if($('#eqLocMap')){movePicker(pos.latitude,pos.longitude);pMap.setView([pos.latitude,pos.longitude],16);} }
    catch(e){ setAddr('Activa GPS o marca el punto en el mapa'); }
  })();
  const locateBtn=$('#eqLocateBtn');
  if(locateBtn) locateBtn.onclick=async()=>{
    haptic(8); setAddr('Obteniendo tu ubicación…');
    try{ const pos=await obtenerPosicionActual(); movePicker(pos.latitude,pos.longitude); if(pMap)pMap.setView([pos.latitude,pos.longitude],16); }
    catch(e){ setAddr('No se pudo obtener GPS — marca en el mapa'); toast('GPS no disponible','err'); }
  };
  const sendBtn=$('#eqLocSend');
  if(sendBtn) sendBtn.onclick=async()=>{
    sendBtn.disabled=true;
    const{lat,lng,name,address}=picker;
    closeSheet();
    const locBody=JSON.stringify({latitude:lat,longitude:lng,name,address});
    const payload={body:locBody,media_type:'location',media_url:locBody};
    if(_eqCon!=null) payload.to=_eqCon;
    toast('Enviando ubicación…');
    const r=await api('/api/equipo/mensajes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(r&&r.mensaje){ if(!teamMsgs.find(m=>m.id===r.mensaje.id)) teamMsgs.push(r.mensaje); renderEquipo(); marcarEquipoLeido(); toast('📍 Ubicación enviada'); }
    else toast('Error al enviar ubicación','err');
  };
  let searchTimer;
  const searchInput=$('#eqLocSearch');const resultsEl=$('#eqLocResults');
  if(searchInput){
    searchInput.oninput=()=>{
      clearTimeout(searchTimer);
      const q=searchInput.value.trim();
      if(q.length<3){resultsEl.style.display='none';return;}
      searchTimer=setTimeout(async()=>{
        try{
          const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=5&accept-language=es`);
          if(!r.ok)throw new Error('err');
          const data=await r.json();
          if(!resultsEl)return;
          if(data&&data.length){
            resultsEl.innerHTML=data.map((res,i)=>`<button class="loc-result" data-idx="${i}"><span class="loc-r-icon">📍</span><span>${esc(res.display_name)}</span></button>`).join('');
            resultsEl.style.display='block';
            resultsEl.querySelectorAll('.loc-result').forEach(btn=>btn.onclick=()=>{
              const r2=data[parseInt(btn.dataset.idx)];resultsEl.style.display='none';searchInput.value=r2.display_name;
              movePicker(parseFloat(r2.lat),parseFloat(r2.lon),{name:r2.name||'',address:r2.display_name||''});
            });
          }else{resultsEl.innerHTML='<div class="loc-result" style="cursor:default">Sin resultados</div>';resultsEl.style.display='block';}
        }catch(e){toast('Error al buscar','err');}
      },400);
    };
    document.addEventListener('click',e=>{if(resultsEl&&!resultsEl.contains(e.target)&&e.target!==searchInput)resultsEl.style.display='none';});
  }
}

// ── Browser Notifications for team chat ──
function eqNotifyGeneral(fromNombre, body){
  if(!_eqAbierto||_eqCon!=null) return; // solo si NO está viendo el canal general
  if('Notification' in window && Notification.permission==='granted'){
    try{ new Notification('🦁 '+fromNombre,{body:String(body).slice(0,100),icon:'/icons/logo.png',tag:'eq-general',renotify:true}); }catch(e){}
  }
}
function eqNotifyDM(fromNombre, body){
  if(!_eqAbierto) return;
  if('Notification' in window && Notification.permission==='granted'){
    try{ new Notification('💬 '+fromNombre,{body:String(body).slice(0,100),icon:'/icons/logo.png',tag:'eq-dm',renotify:true}); }catch(e){}
  }
}
function eqRequestNotifPermission(){
  if('Notification' in window && Notification.permission==='default'){
    Notification.requestPermission();
  }
}
async function eqToggleReaction(msgId,emoji){
  const r=await api('/api/equipo/messages/'+msgId+'/react',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({emoji})});
  if(r&&r.ok){ const idx=teamMsgs.findIndex(x=>x.id===msgId); if(idx>=0) teamMsgs[idx].reactions=r.reactions; renderEquipo(); }
}
async function eqDeleteMsg(msgId,mode){
  if(!confirm(mode==='everyone'?'¿Eliminar para todos?':'¿Eliminar para ti?')) return;
  const r=await api('/api/equipo/messages/'+msgId+'/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})});
  if(r&&r.ok){ if(mode==='everyone'){ const idx=teamMsgs.findIndex(x=>x.id===msgId); if(idx>=0) teamMsgs[idx].deleted=1; renderEquipo(); } toast('Mensaje eliminado'); }
}
function eqSendPresence(){ api('/api/equipo/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}); }
let _eqPresenceInterval=null;
function eqStartPresence(){ eqSendPresence(); if(_eqPresenceInterval) clearInterval(_eqPresenceInterval); _eqPresenceInterval=setInterval(eqSendPresence,30000); }
async function eqLoadPresence(){ const d=await api('/api/equipo/presence'); if(d) _eqPresence=d; updateEqPresenceDots(); }
function updateEqPresenceDots(){
  document.querySelectorAll('.eq-presence-dot').forEach(dot=>{
    const vid=Number(dot.dataset.vid);
    const p=_eqPresence[vid];
    const online=p&&(Date.now()-new Date(p.last_seen).getTime()<60000);
    dot.classList.toggle('on',!!online);
    dot.classList.toggle('off',!online);
  });
}
async function cargarEquipo(){
  const url=_eqCon!=null?`/api/equipo/mensajes?con=${_eqCon}`:'/api/equipo/mensajes';
  const d=await api(url);
  if(Array.isArray(d)) teamMsgs=d;
}
async function cargarAsesoresEquipo(){
  if(_eqAsesores.length) return;
  const v=await api('/api/vendedores'); if(Array.isArray(v)) _eqAsesores=v.filter(x=>Number(x.id)!==Number(miId()));
}
function renderEqTabs(){
  const box=$('#eqTabs'); if(!box) return;
  const chip=(id,label)=>`<button class="eq-chip${(_eqCon===id)?' on':''}" data-con="${id===null?'':id}" style="flex-shrink:0;padding:6px 12px;border-radius:999px;border:1px solid ${_eqCon===id?'var(--gold)':'var(--border)'};background:${_eqCon===id?'var(--gold-soft,rgba(200,164,90,.12))':'var(--bg-3)'};color:${_eqCon===id?'var(--gold)':'var(--text-2)'};font-size:12px;font-family:inherit;white-space:nowrap">${label}</button>`;
  box.innerHTML=chip(null,'🦁 General')+_eqAsesores.map(a=>chip(Number(a.id), esc(a.nombre.split(' ')[0]))).join('');
  box.querySelectorAll('[data-con]').forEach(b=>b.onclick=async()=>{ _eqCon=b.dataset.con===''?null:Number(b.dataset.con); haptic(6); renderEqTabs(); updateEqHeader(); await cargarEquipo(); renderEquipo(); eqLoadPinned(); });
}
function renderEqBanner(){
  const box=$('#eqBannerContent'); if(!box) return;
  if(_eqCon==null){
    const maxShow=5;
    const avs=_eqAsesores.slice(0,maxShow);
    const extra=_eqAsesores.length-maxShow;
    box.innerHTML=
      '<div class="eq-banner__logo"><img src="'+((me&&me.externo&&me.grupo&&me.grupo.marca_logo)||'/icons/logo.png')+'" alt=""></div>'+
      '<div class="eq-banner__brand">'+((me&&me.externo)?('COMUNIDAD '+String(marcaNombre()).toUpperCase()):'EQUIPO LEONS')+'</div>'+
      '<div class="eq-banner__sub">'+((me&&me.externo)?'Comunidad de asesores — los clientes no la ven':'Chat interno — los clientes no lo ven')+'</div>'+
      '<div class="eq-banner__team">'+
        avs.map(a=>{ const p=_eqPresence[a.id]; const online=p&&(Date.now()-new Date(p.last_seen).getTime()<60000); return `<div class="av" style="background:${avatarColor(a.nombre)};overflow:hidden;position:relative">${a.foto?`<img src="${esc(a.foto)}" style="width:100%;height:100%;object-fit:cover">`:initials(a.nombre)}<div class="eq-presence-dot ${online?'on':'off'}" data-vid="${a.id}"></div></div>`; }).join('')+
        (extra>0?`<div class="eq-banner__more">+${extra}</div>`:'')+
      '</div>'+
      '<div class="eq-banner__line"></div>';
  } else {
    const a=_eqAsesores.find(x=>Number(x.id)===Number(_eqCon));
    const nombre=a?a.nombre:'Directo';
    const foto=a&&a.foto;
    const p=_eqPresence[a?a.id:null]; const online=p&&(Date.now()-new Date(p.last_seen).getTime()<60000);
    box.innerHTML=
      `<div class="eq-banner__dm-logo" style="background:${avatarColor(nombre)}">${foto?`<img src="${esc(foto)}" style="width:100%;height:100%;object-fit:cover">`:initials(nombre)}</div>`+
      `<div class="eq-banner__dm-status"><div class="eq-banner__dm-dot" style="background:${online?'var(--gold)':'var(--text-3)'}"></div><span>${online?'En línea':'Desconectado'}</span></div>`+
      `<div class="eq-banner__dm-name">${esc(nombre)}</div>`+
      '<div class="eq-banner__sub">Mensaje directo</div>'+
      '<div class="eq-banner__line"></div>';
  }
}
function updateEqHeader(){
  renderEqBanner();
}
function marcarEquipoLeido(){
  if(teamMsgs.length) localStorage.setItem('sp_equipo_last_read', String(teamMsgs[teamMsgs.length-1].id));
}
async function abrirEquipo(){
  haptic(8); _eqAbierto=true; _eqCon=null; cerrarChat();
  $('#scEquipo').classList.add('show');
  await cargarAsesoresEquipo(); renderEqTabs(); updateEqHeader();
  await cargarEquipo(); renderEquipo(); marcarEquipoLeido(); renderList();
  eqStartPresence(); eqLoadPresence(); eqLoadPinned(); eqInitScrollBtn(); eqInitAudio(); eqRequestNotifPermission();
}
function cerrarEquipo(){ _eqAbierto=false; $('#scEquipo').classList.remove('show'); marcarEquipoLeido(); renderList(); if(_eqRec&&_eqRec.state==='recording') _eqRec.stop(); eqCleanRec(); }
async function enviarEquipo(){
  const inp=$('#eqInput'); const body=(inp.value||'').trim(); if(!body&&!_eqEditingId) return;
  inp.value=''; haptic([10,20]);
  if(_eqEditingId){
    const r=await api('/api/equipo/messages/'+_eqEditingId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({body})});
    eqCancelEdit();
    if(r&&r.message){const idx=teamMsgs.findIndex(x=>x.id===_eqEditingId);if(idx>=0)teamMsgs[idx]=r.message;renderEquipo();}
    else toast('Error al editar','err');
    return;
  }
  const mentions=[]; _eqAsesores.forEach(a=>{ const f=(a.nombre||'').split(' ')[0]; if(f && new RegExp('@'+f,'i').test(body)) mentions.push(Number(a.id)); });
  const payload={body}; if(_eqCon!=null) payload.to=_eqCon; if(mentions.length) payload.mentions=mentions;
  if(_eqReplyTo){ payload.replyTo=_eqReplyTo.id; eqCancelReply(); }
  const r=await api('/api/equipo/mensajes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(r&&r.mensaje){ if(!teamMsgs.find(m=>m.id===r.mensaje.id)) teamMsgs.push(r.mensaje); renderEquipo(); marcarEquipoLeido(); hideEqTyping(); }
  else toast('Error al enviar');
}
let _eqTypingLast=0;
function enviarEqTyping(){
  const now=Date.now(); if(now-_eqTypingLast<3000) return; _eqTypingLast=now;
  api('/api/equipo/typing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:_eqCon})});
}
function showEqTyping(nombre){
  const el=$('#eqTyping'),nm=$('#eqTypingName');
  if(el) el.classList.add('show');
  if(nm) nm.textContent=nombre+' está escribiendo…';
}
function hideEqTyping(){ const el=$('#eqTyping'); if(el) el.classList.remove('show'); }
function initEquipo(){
  const back=$('#eqBack'); if(back){ back.innerHTML=I(SVG.back,22); back.onclick=cerrarEquipo; }
  const send=$('#eqSend'); if(send){ send.innerHTML=I(SVG.send,19); send.onclick=enviarEquipo; }
  const mic=$('#eqMicBtn'); if(mic) mic.innerHTML=I(SVG.mic,18);
  const clip=$('#eqClipBtn'); if(clip){ clip.innerHTML=I(SVG.clip,18); clip.onclick=eqAbrirAdjuntos; }
  eqInitFileInput();
  eqInitAudio();
  const inp=$('#eqInput');
  if(inp){
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); enviarEquipo(); } });
    inp.addEventListener('input',()=>{ enviarEqTyping(); });
  }
  cargarEquipo().then(renderList);
}

/* ════════ Bloqueo con huella (Biometric native + WebAuthn web) ════════ */
const BIO_KEY='sp_bio_lock';
const BIO_UNLOCK_KEY='sp_bio_last_unlock';
const BIO_UNLOCK_INTERVAL=15*60*1000; // 15 minutos
let _bioUnlocking=false;
function bioLockVisible(){ const el=$('#bioLock'); return el&&el.style.display!=='none'; }
function bioLockShow(){ const el=$('#bioLock'); if(el) el.style.display='flex'; }
function bioLockHide(){ const el=$('#bioLock'); if(el) el.style.display='none'; }
function bioShouldUnlock(){
  const last=Number(localStorage.getItem(BIO_UNLOCK_KEY)||0);
  return !last||(Date.now()-last>=BIO_UNLOCK_INTERVAL);
}
function bioMarkUnlocked(){ localStorage.setItem(BIO_UNLOCK_KEY,String(Date.now())); }
async function bioDisponible(){
  try{
    if(esNativo()&&window.Capacitor.isPluginAvailable('BiometricLock')){
      const r=await window.Capacitor.Plugins.BiometricLock.isAvailable();
      if(r.value) return true;
    }
    if(window.PublicKeyCredential&&typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable==='function')
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  }catch(e){}
  return false;
}
async function bioActivado(){
  try{
    if(esNativo()&&window.Capacitor.isPluginAvailable('Preferences')){
      const r=await window.Capacitor.Plugins.Preferences.get({key:BIO_KEY});
      if(r.value==='1') return true;
    }
    return localStorage.getItem(BIO_KEY)==='1';
  }catch(e){ return localStorage.getItem(BIO_KEY)==='1'; }
}
async function bioSetActivado(v){
  try{
    if(esNativo()&&window.Capacitor.isPluginAvailable('Preferences'))
      await window.Capacitor.Plugins.Preferences.set({key:BIO_KEY,value:v?'1':'0'});
    localStorage.setItem(BIO_KEY,v?'1':'0');
  }catch(e){ localStorage.setItem(BIO_KEY,v?'1':'0'); }
}
function _bioCredKey(){ return 'sp_bio_cred_'+(me&&me.vendedorId||'unknown'); }
function getBioCredId(){
  try{ const r=localStorage.getItem(_bioCredKey()); return r?Uint8Array.from(JSON.parse(r)):null; }catch(e){ return null; }
}
function setBioCredId(id){
  localStorage.setItem(_bioCredKey(),JSON.stringify(Array.from(id)));
}
async function bioVerificar(){
  if(esNativo()&&window.Capacitor.isPluginAvailable('BiometricLock')){
    await window.Capacitor.Plugins.BiometricLock.authenticate();
  }else if(window.PublicKeyCredential){
    let credId=getBioCredId();
    if(!credId){
      const uid=new Uint8Array(16);
      const vid=String(me&&me.vendedorId||0);
      for(let i=0;i<16;i++) uid[i]=vid.charCodeAt(i%vid.length);
      const cred=await navigator.credentials.create({publicKey:{
        challenge:crypto.getRandomValues(new Uint8Array(32)),
        rp:{name:'SP CRM',id:window.location.hostname},
        user:{id:uid,name:'vendedor_'+vid,displayName:'Leons Group'},
        pubKeyCredParams:[{alg:-7,type:'public-key'}],
        authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required'},
      }});
      if(cred){ setBioCredId(cred.rawId); credId=cred.rawId; }
      else throw new Error('no_register');
    }
    await navigator.credentials.get({publicKey:{
      challenge:crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials:[{type:'public-key',id:credId}],
      userVerification:'required',
    }});
  }
}
async function pedirDesbloqueo(){
  if(_bioUnlocking) return;
  _bioUnlocking=true;
  const ov=$('#bioLock'); if(!ov){ _bioUnlocking=false; return; }
  const errEl=$('#bioError'); if(errEl) errEl.style.display='none';
  bioLockShow();
  const intentar=async()=>{
    try{
      if(esNativo()&&window.Capacitor.isPluginAvailable('BiometricLock')){
        await window.Capacitor.Plugins.BiometricLock.authenticate();
      }else if(window.PublicKeyCredential){
        let credId=getBioCredId();
        if(!credId){
          const uid=new Uint8Array(16);
          const vid=String(me&&me.vendedorId||0);
          for(let i=0;i<16;i++) uid[i]=vid.charCodeAt(i%vid.length);
          const cred=await navigator.credentials.create({publicKey:{
            challenge:crypto.getRandomValues(new Uint8Array(32)),
            rp:{name:'SP CRM',id:window.location.hostname},
            user:{id:uid,name:'vendedor_'+vid,displayName:'Leons Group'},
            pubKeyCredParams:[{alg:-7,type:'public-key'}],
            authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required'},
          }});
          if(cred){ setBioCredId(cred.rawId); credId=cred.rawId; }
          else throw new Error('no_register');
        }
        await navigator.credentials.get({publicKey:{
          challenge:crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials:[{type:'public-key',id:credId}],
          userVerification:'required',
        }});
      }
      bioMarkUnlocked();
      bioLockHide(); _bioUnlocking=false; haptic([10,20]);
    }catch(e){
      _bioUnlocking=false;
      if(e.name==='NotAllowedError') return;
      const errEl=$('#bioError');
      if(errEl){ errEl.textContent='No se pudo verificar. Toca para reintentar.'; errEl.style.display='block'; }
      toast('No se pudo verificar la huella');
    }
  };
  $('#bioUnlock').onclick=intentar;
  intentar();
}
async function initBioLock(){
  if(await bioActivado()&&await bioDisponible()&&bioShouldUnlock()) pedirDesbloqueo();
  try{
    if(esNativo()&&window.Capacitor.isPluginAvailable('App'))
      window.Capacitor.Plugins.App.addListener('resume',async()=>{
        if(!_bioUnlocking&&await bioActivado()&&await bioDisponible()&&bioShouldUnlock()&&!bioLockVisible()) pedirDesbloqueo();
      });
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden&&!_bioUnlocking) (async()=>{ if(await bioActivado()&&await bioDisponible()&&bioShouldUnlock()&&!bioLockVisible()) pedirDesbloqueo(); })();
    });
  }catch(e){}
}

/* ════════ Permisos del dispositivo ════════ */
const PERMISOS=[
  {k:'mic',   ic:'🎙️', nombre:'Micrófono',      desc:'Grabar y enviar notas de voz a tus clientes', query:'microphone'},
  {k:'cam',   ic:'📷', nombre:'Cámara',          desc:'Tomar fotos de lotes y documentos desde el chat', query:'camera'},
  {k:'geo',   ic:'📍', nombre:'Ubicación',       desc:'Compartir la ubicación de proyectos y citas', query:'geolocation'},
  {k:'notif', ic:'🔔', nombre:'Notificaciones',  desc:'Enterarte al instante cuando llega un lead o mensaje', query:'notifications'},
];
async function estadoPermiso(query){
  const P=(window.Capacitor&&window.Capacitor.Plugins)||{};
  if(esNativo()){
    // 1) Plugin propio Permisos (APK v4+): estado REAL de Android via checkSelfPermission
    try{
      if(window.Capacitor.isPluginAvailable&&window.Capacitor.isPluginAvailable('Permisos')){
        const r=await P.Permisos.estado();
        const st=r[{microphone:'mic',camera:'cam',geolocation:'geo',notifications:'notif'}[query]];
        if(st) return st;
      }
    }catch(e){}
    // 2) checkPermissions de los plugins oficiales (disponibles desde v3)
    try{
      if(query==='camera'&&P.Camera){ const st=await P.Camera.checkPermissions(); return st.camera==='granted'?'granted':st.camera==='denied'?'denied':'prompt'; }
      if(query==='geolocation'&&P.Geolocation){ const st=await P.Geolocation.checkPermissions(); return st.location==='granted'?'granted':st.location==='denied'?'denied':'prompt'; }
      if(query==='notifications'&&P.PushNotifications){ const st=await P.PushNotifications.checkPermissions(); return st.receive==='granted'?'granted':st.receive==='denied'?'denied':'prompt'; }
    }catch(e){}
  }
  if(query==='notifications'){
    if('Notification' in window) return Notification.permission==='default'?'prompt':Notification.permission;
    return 'desconocido';
  }
  // 3) Permissions API del navegador. OJO WebView Android: para mic/cam devuelve
  // 'prompt' PARA SIEMPRE aunque ya esté concedido (la concesión la resuelve
  // Capacitor a nivel nativo por cada request) — por eso el flag local de respaldo
  // que se marca cuando un pedido real tuvo éxito.
  try{
    const st=await navigator.permissions.query({name:query});
    if(st.state==='granted'){ localStorage.setItem('sp_perm_ok_'+query,'1'); return 'granted'; }
    if(st.state==='prompt'&&localStorage.getItem('sp_perm_ok_'+query)==='1') return 'granted';
    return st.state;
  }catch(e){
    return localStorage.getItem('sp_perm_ok_'+query)==='1'?'granted':'desconocido';
  }
}
async function estadoPermisos(){
  const out={};
  for(const p of PERMISOS) out[p.k]=await estadoPermiso(p.query);
  return out;
}
async function pedirPermiso(k){
  try{
    if(k==='mic'){ const s=await navigator.mediaDevices.getUserMedia({audio:true}); s.getTracks().forEach(t=>t.stop()); localStorage.setItem('sp_perm_ok_microphone','1'); }
    else if(k==='cam'){ const s=await navigator.mediaDevices.getUserMedia({video:true}); s.getTracks().forEach(t=>t.stop()); localStorage.setItem('sp_perm_ok_camera','1'); }
    else if(k==='geo'){
      if(esNativo() && window.Capacitor.Plugins.Geolocation){ await window.Capacitor.Plugins.Geolocation.requestPermissions(); }
      else{ await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{timeout:8000})); localStorage.setItem('sp_perm_ok_geolocation','1'); }
    }
    else if(k==='notif'){
      if(esNativo()) await suscribirPushNativo();
      else{ await Notification.requestPermission(); suscribirPush(); }
    }
  }catch(e){
    const st=await estadoPermiso((PERMISOS.find(p=>p.k===k)||{}).query);
    if(k==='mic' && esNativo() && st==='prompt'){
      // APK viejo sin RECORD_AUDIO en el manifest: Android deniega sin diálogo y el estado sigue en 'prompt'
      mostrarAyudaPermiso('Tu versión de la app no incluye el permiso de micrófono. Descarga e instala la última versión de Leons Group para poder grabar notas de voz.');
    } else if(st==='denied'){
      mostrarAyudaPermiso('El permiso está bloqueado por el sistema. Actívalo manualmente en: Ajustes › Aplicaciones › Leons Group › Permisos.');
    }
  }
  await refrescarPermSheet();
  actualizarPermBanner();
}
function mostrarAyudaPermiso(msg){
  const box=$('#permHelp'); if(box){ box.textContent=msg; box.hidden=false; } else toast(msg);
}
function permRowHTML(p,st){
  const accion = st==='granted' ? `<span class="perm-ok">✓ Activo</span>`
    : st==='denied' ? `<button class="perm-act" data-perm="${p.k}">Reintentar</button>`
    : `<button class="perm-act" data-perm="${p.k}">Activar</button>`;
  return `<div class="perm-row"><span class="perm-ic">${p.ic}</span><div class="perm-info"><b>${p.nombre}</b><small>${p.desc}</small></div>${accion}</div>`;
}
async function refrescarPermSheet(){
  const body=$('#permRows'); if(!body) return;
  const st=await estadoPermisos();
  body.innerHTML=PERMISOS.map(p=>permRowHTML(p,st[p.k])).join('');
  body.querySelectorAll('.perm-act').forEach(b=>b.onclick=()=>{ haptic(10); pedirPermiso(b.dataset.perm); });
}
async function abrirPermisos(){
  openSheet('Permisos de la app', `
    <div style="font-size:12.5px;color:var(--text-3);line-height:1.4;margin-bottom:6px">Para que todo funcione, la app necesita estos permisos del teléfono. Actívalos uno por uno:</div>
    <div id="permRows"></div>
    <div class="perm-help" id="permHelp" hidden></div>`);
  await refrescarPermSheet();
}
async function actualizarPermBanner(){
  const b=$('#permBanner'); if(!b) return;
  const dismiss=Number(localStorage.getItem('sp_perm_banner_dismiss')||0);
  if(Date.now()-dismiss < 3*24*60*60*1000){ b.hidden=true; return; }
  const st=await estadoPermisos();
  const falta=PERMISOS.filter(p=>st[p.k]==='prompt'||st[p.k]==='denied');
  if(!falta.length){ b.hidden=true; return; }
  const mic=falta.find(p=>p.k==='mic');
  const p=mic||falta[0];
  $('#permBannerTxt').textContent = mic
    ? 'Activa el micrófono para enviar notas de voz'
    : `Activa ${falta.length>1?'los permisos de la app':p.nombre.toLowerCase()} para usar todas las funciones`;
  b.querySelector('.ic').textContent=p.ic;
  b.hidden=false;
}
function initPermisos(){
  const btn=$('#permBannerBtn'), x=$('#permBannerX');
  if(btn) btn.onclick=()=>{ haptic(10); abrirPermisos(); };
  if(x) x.onclick=()=>{ localStorage.setItem('sp_perm_banner_dismiss',String(Date.now())); $('#permBanner').hidden=true; haptic(6); };
  actualizarPermBanner();
  if(localStorage.getItem('spPermOnboarded')!=='1'){
    localStorage.setItem('spPermOnboarded','1');
    setTimeout(abrirPermisos, 1200);
  }
}

/* ════════ Init ════════ */
async function init(){
  // Skeleton inmediato en la lista de chats: sin esto, entre el primer pintado y que
  // /api/me + /api/mis-leads respondan (dos round-trips seguidos, ver más abajo) el
  // asesor veía la pantalla casi vacía con solo un spinner diminuto — en datos móviles
  // lentos, varios segundos donde la app se ve "vacía" o rota antes de que aparezcan
  // sus chats reales. skeletonCards() ya existe y se usa en otras pantallas del panel.
  const listEl = document.getElementById('list');
  if (listEl) listEl.innerHTML = skeletonCards(5) + '<div class="m-ptr" id="ptr"><span class="spin"></span></div>';
  // Glass-lite: en gama baja los backdrop-filter causan jank (regla en sp-os.css §19)
  try{ if(navigator.deviceMemory && navigator.deviceMemory<4) document.body.classList.add('glass-lite'); }catch(e){}
  // Auto-actualización: si hay versión OBLIGATORIA nueva, bloquea la app hasta actualizar
  initUpdateResume();
  const updBloqueado = await checkAppUpdate();
  if(updBloqueado) return;
  document.getElementById('icSearch').innerHTML = I(SVG.search,17);
  $('#btnNotif').insertAdjacentHTML('afterbegin', I(SVG.bell,19));
  $('#fab').innerHTML = I(SVG.plus,26);
  $('#sheetX').innerHTML = I(SVG.x,14);
  // Estado base de historial: garantiza que siempre haya una entrada que
  // consumir en popstate, para que el back nunca se salga de la app al login.
  if(!history.state || !history.state.base) history.replaceState({ base:true }, '');
  renderNav();
  if(DEMO){ me={nombre:'Asesor Test',rol:'vendedor'}; leads=demoLeads(); renderFilters(); renderList(); }
  else {
    me = await api('/api/me');
    if(!me){ location.replace('/login.html'); return; }
    // Red de externos: sin suscripción vigente, la app NO muestra leads — solo la pantalla
    // de suscripción (subir comprobante). El gate se apoya en /api/me.suscripcion.vigente.
    if(me.externo && me.suscripcion && !me.suscripcion.vigente){ renderSuscripcionGate(); return; }
    _chatBg = me.chat_bg === 'none' ? 'none' : 'leones';
    localStorage.setItem('sp_chat_bg', _chatBg);
    aplicarFondoChat();
    renderNav();
    const meAv = document.getElementById('meAvatar');
    if (meAv) {
      meAv.style.background = me.foto ? '' : avatarColor(me.nombre);
      meAv.innerHTML = me.foto ? `<img src="${esc(me.foto)}" style="width:100%;height:100%;object-fit:cover">` : initials(me.nombre);
      meAv.title = me.nombre || ''; // el HTML estático nunca lo corregía — quedaba con el texto literal del template sin interpolar
    }
    metricas = await api('/api/me/metricas');
    // Lead scoring (solo admin puede consultar /api/leads/calientes — para el resto
    // de asesores no pasa nada, simplemente no se muestra el badge de score).
    if(me.rol==='admin'){ const cal=await api('/api/leads/calientes?limite=100'); if(Array.isArray(cal)) cal.forEach(c=>hotScores.set(Number(c.lead_id),c.score)); }
    renderFilters();
    await cargar();
    await cargarArchivados();
    conectarStream();
    eqStartPresence();
    if(outboxPendingCount()>0) outboxFlush(); // mensajes que quedaron pendientes de una sesión sin red anterior
    // Capacitor 'resume' (vuelta desde segundo plano en la app nativa) no siempre coincide
    // con visibilitychange dentro del WebView — se engancha aparte para no depender de uno solo.
    if(esNativo()){ try{ window.Capacitor.Plugins.App.addListener('resume', resyncStream); }catch(e){} }
  }
  wire();
  initFileInput();
  if(!DEMO) initScheduled();
  initRecordatorios();
  if(!DEMO) cargarNotifBadge();
  if(!DEMO) initPermisos();
  if(!DEMO) initEquipo();
  initBioLock();
  setTimeout(suscribirPush, 3000);
  // Re-registrar token FCM cuando la app vuelve al foreground (Capacitor)
  // FCM tokens pueden expirar/rotar en segundo plano — esto asegura que siempre
  // haya un token válido guardado en el servidor.
  if(esNativo()){
    try{
      const App=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.App;
      if(App&&typeof App.addListener==='function'){
        App.addListener('appStateChange',({isActive})=>{ if(isActive) setTimeout(()=>{ try{suscribirPushNativo();}catch(e){} },2000); });
      }
    }catch(e){}
  }
  if(!DEMO) initTemplates();
  if(!DEMO) initUbicacionJornada();
  const openLead = new URLSearchParams(location.search).get('lead');
  if(openLead && leads.find(l=>l.id===Number(openLead))) abrirChat(Number(openLead));
  window.addEventListener('popstate', (e) => {
    if ($('#scChat') && $('#scChat').classList.contains('show')) {
      cerrarChat();
    }
  });
  if(!DEMO) mostrarOnboardingSiCorresponde();
}

async function cargar(){ const d = await api('/api/mis-leads'); if(d) leads = d; else if(!leads.length) toast('Sin conexión. Reintentando...'); renderList(); }
async function cargarArchivados(){ const d = await api('/api/mis-leads/archivados'); archivedLeads = d || []; archivadosCount = archivedLeads.length; }
function leadsActivos(){ return leadsFiltrados(); }
function leadsArchivados(){ let a = archivedLeads; if(term){ const t=term.toLowerCase(); a=a.filter(l=>(l.customer_name||'').toLowerCase().includes(t)||(l.customer_phone||'').includes(t)); } return a.sort((x,y)=>new Date(y.updated_at||y.created_at)-new Date(x.updated_at||x.created_at)); }

/* ════════ Filtros ════════ */
const FILTROS = [['todos','Todos'],['sin_clasificar','Nuevos'],['interesado','Interesados'],['negociacion','Negociación'],['cita','Citas'],['vendido','Vendidos']];
function renderFilters(){ $('#filters').innerHTML = FILTROS.map(([k,l])=>{ const n = k==='todos'?leads.length:leads.filter(x=>(x.etiqueta||'sin_clasificar')===k).length; return `<button class="m-chip ${k===filtro?'active':''}" data-f="${k}">${l}${n?` <b>${n}</b>`:''}</button>`; }).join(''); }

function estaPospuesto(l){ return l.snoozed_until && new Date(l.snoozed_until)>new Date(); }
function leadsFiltrados(){ let a=leads; if(filtro!=='todos') a=a.filter(l=>(l.etiqueta||'sin_clasificar')===filtro); if(term){ const t=term.toLowerCase(); a=a.filter(l=>(l.customer_name||'').toLowerCase().includes(t)||(l.customer_phone||'').includes(t)||(l.last_message||'').toLowerCase().includes(t)); }
  const base=ordenPrioridad?(x,y)=>(y.score||0)-(x.score||0):(x,y)=>new Date(y.updated_at||y.created_at)-new Date(x.updated_at||x.created_at);
  // Los pospuestos (C2) bajan al fondo, sin ocultarse — nunca se pierde un lead.
  return a.sort((x,y)=>{ const sx=estaPospuesto(x)?1:0, sy=estaPospuesto(y)?1:0; if(sx!==sy) return sx-sy; return base(x,y); }); }

/* ════════ Lista ════════ */
let _msgResults=[];
function msgResultsHTML(){
  if(term.length<3||!_msgResults.length) return '';
  const t=term.toLowerCase();
  return `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);padding:12px 18px 6px">Mensajes</div>`+
    _msgResults.map(r=>{
      const body=String(r.body||''); const i=body.toLowerCase().indexOf(t);
      const frag=i>=0?esc(body.slice(Math.max(0,i-25),i))+'<b style="color:var(--gold)">'+esc(body.slice(i,i+term.length))+'</b>'+esc(body.slice(i+term.length,i+term.length+45)):esc(body.slice(0,70));
      return `<div class="m-card" data-msgres="${r.lead_id}" style="margin:0 14px 8px;padding:10px 14px;gap:10px;display:flex;align-items:center;cursor:pointer">
        <div class="m-avatar" style="width:34px;height:34px;border-radius:10px;font-size:11px;flex-shrink:0;background:${avatarColor(r.customer_name||'')}">${initials(r.customer_name)}</div>
        <div style="min-width:0;flex:1"><div style="font-size:13px;font-weight:600">${esc(r.customer_name||'Cliente')} <span style="font-weight:400;color:var(--text-3);font-size:11px">· ${horaCorta(r.timestamp)}</span></div>
        <div style="font-size:12px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.direction==='outgoing'?'Tú: ':''}${frag}</div></div></div>`;
    }).join('');
}
function wireMsgResults(box){
  box.querySelectorAll('[data-msgres]').forEach(el=>el.onclick=async()=>{
    haptic(8); const leadId=Number(el.dataset.msgres); const q=term;
    await abrirChat(leadId);
    setTimeout(()=>{ const s=$('#cSearch'); const i=$('#cSearchInput'); if(s&&i){ s.classList.add('show'); i.value=q; i.dispatchEvent(new Event('input')); } },400);
  });
}
function equipoRowHTML(){
  if(showArchivados||DEMO) return '';
  const lastRead=Number(localStorage.getItem('sp_equipo_last_read')||0);
  const unread=teamMsgs.filter(m=>m.id>lastRead&&!esMio(m)).length;
  const last=teamMsgs.length?teamMsgs[teamMsgs.length-1]:null;
  return `<div class="m-row" style="padding:0"><div class="m-card" id="equipoRow" style="cursor:pointer;border-color:var(--gold-line)">
    <div class="m-avatar" style="background:var(--grad-gold-deep);color:#0A0A0A;font-size:15px">🦁</div>
    <div class="m-card__body">
      <div class="m-card__l1"><span class="m-card__name" style="color:var(--gold)">Equipo Leons</span><span class="m-card__time">${last?horaCorta(last.created_at):''}</span></div>
      <div class="m-card__l2"><span class="m-card__msg">${last?esc((last.from_nombre?last.from_nombre+': ':'')+last.body).slice(0,60):'Chat interno del equipo'}</span>${unread?`<span class="m-badge">${unread>9?'9+':unread}</span>`:''}</div>
    </div>
  </div></div>`;
}
function renderList(){ renderFilters(); const box=$('#list'); const ptr='<div class="m-ptr" id="ptr"><span class="spin"></span></div>';
  const items = showArchivados ? leadsArchivados() : leadsFiltrados();
  const archBtn = archivadosCount > 0 ? `<div class="m-arch-btn" id="archToggle">${I(SVG.archive,17)}<span>Archivados</span><span class="badge">${archivadosCount}</span></div>` : '';
  const equipoRow = term ? '' : equipoRowHTML();
  const msgRes = msgResultsHTML();
  if(!items.length && showArchivados){
    box.innerHTML = ptr + archBtn + `<div class="m-empty"><div class="ic">${I(SVG.archive,28)}</div><h3>Sin archivados</h3><p>Los leads que archives aparecerán aquí.</p></div>`;
    const at = document.getElementById('archToggle'); if(at) at.onclick=toggleArchivados;
    return;
  }
  if(!items.length){
    box.innerHTML = ptr + equipoRow + archBtn + `<div class="m-empty"><div class="ic">${I(SVG.chat,28)}</div><h3>Sin conversaciones</h3><p>${leads.length?'No hay resultados para este filtro.':'Aquí aparecerán tus leads asignados.'}</p></div>` + msgRes;
    const at = document.getElementById('archToggle'); if(at) at.onclick=toggleArchivados;
    const eq=document.getElementById('equipoRow'); if(eq) eq.onclick=abrirEquipo;
    wireMsgResults(box);
    return;
  }
  box.innerHTML = ptr + equipoRow + archBtn + items.map((l,idx)=>cardHTML(l,idx)).join('') + msgRes;
  box.querySelectorAll('.m-row[data-id]').forEach(row=>wireCard(row));
  const at = document.getElementById('archToggle'); if(at) at.onclick=toggleArchivados;
  const eq=document.getElementById('equipoRow'); if(eq) eq.onclick=abrirEquipo;
  wireMsgResults(box);
}
function updateCardBadges(){ document.querySelectorAll('.m-row').forEach(row=>{ const id=Number(row.dataset.id); const l=findLead(id); if(!l) return; const card=row.querySelector('.m-card'); if(!card) return; const unread=Number(l.unread_count||0); card.classList.toggle('unread',unread>0); const prio=card.querySelector('.m-card__prio'); if(prio) prio.style.background=unread?'var(--gold)':'transparent'; const badge=card.querySelector('.m-badge'); if(badge) badge.textContent=unread>9?'9+':unread||''; const dot=card.querySelector('.m-unread-dot'); if(dot) dot.style.display=unread?'':'none'; }); }

function toggleArchivados(){ haptic(8); showArchivados = !showArchivados; renderList(); }
// Badge de temperatura del lead (A2) — calificación IA 🔥/🌤️/❄️
function tempBadge(t){
  if(!t) return '';
  const map={caliente:['🔥','Caliente','rgba(220,80,50,.16)','#e08a6b'],tibio:['🌤️','Tibio','rgba(200,164,90,.16)','var(--gold)'],frio:['❄️','Frío','rgba(90,140,200,.14)','#7fa8d8']};
  const c=map[t]; if(!c) return '';
  return `<span class="m-temp" title="${c[1]}" style="font-size:10px;padding:1px 6px;border-radius:999px;background:${c[2]};color:${c[3]};display:inline-flex;align-items:center;gap:2px;flex-shrink:0">${c[0]}</span>`;
}
// C3: llama por el marcador nativo Y registra la llamada como nota en el timeline,
// con opción rápida de anotar el resultado (contestó / no contestó / agendó).
function llamarYRegistrar(phone, leadId){
  const p=(phone||'').replace(/[^\d+]/g,'');
  if(!p){ toast('Sin número'); return; }
  const hora=new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'});
  if(leadId){
    openSheet('Registrar llamada', `<div style="font-size:13px;color:var(--text-3);margin-bottom:12px">Iniciando llamada… cuando termines, marca cómo te fue:</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${[['contestó','✅ Contestó'],['no contestó','📵 No contestó'],['agendó cita','📅 Agendó cita'],['','No registrar']].map(([k,l])=>`<button class="lp-cell wide" data-callres="${k}" style="text-align:left;width:100%;color:var(--text)">${l}</button>`).join('')}
      </div>`);
    $('#sheetBody').querySelectorAll('[data-callres]').forEach(b=>b.onclick=()=>{
      const res=b.dataset.callres; closeSheet();
      if(!res) return;
      api('/api/leads/'+leadId+'/notas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nota:'📞 Llamada saliente '+hora+' — '+res})}).then(r=>{ if(r) toast('Llamada registrada'); });
    });
  }
  location.href='tel:'+p;
}
function cardHTML(l,idx){
  const nombre=l.customer_name||'Cliente'; const unread=Number(l.unread_count||0); const st=estado(l); const e=ETQ[l.etiqueta||'sin_clasificar']||ETQ.sin_clasificar; const pct=l.progress_pct!=null?l.progress_pct:leadScore(l); const prio=unread?'var(--gold)':pct>=85?'var(--red)':pct>=60?'var(--gold)':'transparent';
  const archived=showArchivados;
  const greenDot=unread&&!archived?'<span class="m-unread-dot"></span>':'';
  return `<div class="m-row" data-id="${l.id}" data-phone="${esc(l.customer_phone||'')}">
    <div class="swipe-bg swipe-bg--right">${I(SVG.phone,19)}<span>Llamar</span></div>
    <div class="swipe-bg swipe-bg--left">${I(archived?SVG.refresh:SVG.archive,19)}<span>${archived?'Restaurar':'Archivar'}</span></div>
    <div class="m-card ${unread?'unread':''}${archived?' archived':''}" data-open="${l.id}" style="animation:bubIn .3s var(--spring) ${Math.min(idx*30,300)}ms both">
      <span class="m-card__prio" style="background:${prio}"></span>
      ${l.pinned_at?`<span class="m-card__pin">${I(SVG.pin,11)} Fijado</span>`:''}
      ${estaPospuesto(l)?`<span class="m-card__pin" style="color:var(--text-3)">😴 Pospuesto ${horaCorta(l.snoozed_until)}</span>`:''}
      ${l.muted_at?`<span class="m-card__mute"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.56 2.9A7 7 0 0 1 19 9v4l4 7H4.8"/><path d="M2 2l20 20"/><path d="M12 22a2 2 0 0 1-2-2"/><path d="M14.5 6.5a2.5 2.5 0 0 0-3.26-1.12"/></svg> Silenciado</span>`:''}
      <div class="m-avatar" style="background:${avatarColor(nombre)}">${initials(nombre)}${unread&&!archived?greenDot:''}<span class="m-avatar__st ${st.cls}"></span></div>
      <div class="m-card__body">
        <div class="m-card__l1"><span class="m-card__name">${esc(nombre)}</span>${(()=>{const ch=(l.customer_phone||'').startsWith('instagram_')?'\ud83d\udfe3 IG':(l.customer_phone||'').startsWith('messenger_')?'\ud83d\udd35 M':'\ud83d\udfe2 WA';return ch?`<span style="font-size:9px;padding:1px 4px;border-radius:4px;background:rgba(255,255,255,.08);color:var(--text-3);margin-left:3px">${ch}</span>`:'';})()}${tempBadge(l.temperatura)}${hotScores.has(Number(l.id))?`<span style="font-size:9px;padding:1px 5px;border-radius:999px;background:rgba(200,164,90,.16);color:var(--gold);margin-left:3px" title="Score de lead caliente">🔥 ${hotScores.get(Number(l.id))}</span>`:''}<span class="m-tag t-${e.cls} m-tag--etq" data-etq-lead="${l.id}">${e.t}</span><span class="m-card__time">${horaCorta(l.updated_at||l.created_at)}</span></div>
        <div class="m-card__l2"><span class="m-card__msg">${(()=>{ let dr=''; try{ dr=localStorage.getItem('sp_draft_'+l.id)||''; }catch(e){} return dr?`<span style="color:var(--gold);font-weight:600">Borrador:</span> ${esc(dr.slice(0,40))}`:esc(l.last_message||l.first_message||'—'); })()}</span>${unread?`<span class="m-badge">${unread>9?'9+':unread}</span>`:''}</div>
        <div class="m-card__l3">
          <span class="m-meta">${I(SVG.building,11)} ${l.proyecto||'—'}</span>
          <span class="m-meta">${I(SVG.facebook,11)} ${l.origen||'—'}</span>
          ${Number(l.visto_sin_responder||0)&&!unread?`<span class="m-meta" style="color:var(--gold)" title="El cliente leyó tu último mensaje y no ha contestado">👀 Te dejó en visto</span>`:''}
        </div>
        <div class="m-card__progress">
          <span class="sp-pbar"><i style="width:${pct}%"></i></span>
          <span class="sp-pct">${pct}%</span>
        </div>
      </div>
    </div>
  </div>`;
}

/* ════════ Tarjetas: long-press + swipe lateral (estilo WhatsApp) ════════
   Antes solo existía el long-press: archivar o llamar costaban 450ms de espera + un tap
   en el sheet. El swipe reutiliza swipeAction() tal cual — misma lógica que el menú
   largo, solo un segundo gesto más rápido para las dos acciones más usadas. */
function wireCard(row){
  const card=row.querySelector('.m-card'); if(!card) return;
  const tagEl=card.querySelector('.m-tag--etq');
  if(tagEl) tagEl.addEventListener('click',e=>{ e.stopPropagation(); haptic(8); abrirEtapaPara(findLead(Number(tagEl.dataset.etqLead))); });
  let lpTimer=null, lpFired=false, sx=0, sy=0;
  let dragging=false, dx=0, dragFired=false;
  const MAX_SWIPE=96, COMMIT=64;
  const abrirMenu=()=>{ lpTimer=null; lpFired=true; setTimeout(()=>{ lpFired=false; },600); haptic(18); cardMenu(Number(row.dataset.id)); };
  card.addEventListener('touchstart',e=>{
    sx=e.touches[0].clientX; sy=e.touches[0].clientY; lpFired=false; dragging=false; dx=0;
    lpTimer=setTimeout(abrirMenu,450);
  },{passive:true});
  card.addEventListener('touchmove',e=>{
    const cx=e.touches[0].clientX, cy=e.touches[0].clientY;
    const ddx=cx-sx, ddy=cy-sy;
    if(!dragging){
      if(Math.abs(ddx)>10 && Math.abs(ddx)>Math.abs(ddy)){ dragging=true; if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } }
      else if(Math.abs(ddx)>10||Math.abs(ddy)>10){ if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } }
    }
    if(dragging){
      dx=Math.max(-MAX_SWIPE,Math.min(MAX_SWIPE,ddx));
      card.style.transition='none';
      card.style.transform=`translateX(${dx}px)`;
    }
  },{passive:true});
  const soltar=()=>{
    if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; }
    if(dragging){
      const commit=Math.abs(dx)>=COMMIT;
      card.style.transition='transform .28s var(--spring)';
      card.style.transform='translateX(0)';
      if(commit){
        dragFired=true; setTimeout(()=>{ dragFired=false; },400);
        haptic(14);
        const accion=dx>0?'call':(showArchivados?'unarch':'arch');
        setTimeout(()=>swipeAction(accion,row),80);
      }
      dragging=false; dx=0;
    }
  };
  card.addEventListener('touchend',soltar);
  card.addEventListener('touchcancel',soltar);
  card.addEventListener('contextmenu',e=>{ e.preventDefault(); abrirMenu(); }); // desktop: click derecho
  card.addEventListener('click',()=>{ if(lpFired||dragFired){ lpFired=false; dragFired=false; return; } abrirChat(Number(card.dataset.open)); });
}
function cardMenu(id){
  const l=findLead(id); if(!l) return;
  const archived=showArchivados;
  const items=[
    ['call','Llamar',SVG.phone,''],
    ...(archived?[['unarch','Restaurar a bandeja',SVG.archive,'primary']]:[
      ['note','Agregar nota',SVG.file,''],
      ['tag','Cambiar etapa',SVG.tag,''],
      ['unread','Marcar no leído',SVG.chat||SVG.tag,''],
      ['pin',l.pinned_at?'Quitar fijado':'Fijar',SVG.pin,''],
      ['mute',l.muted_at?'Activar notificaciones':'Silenciar',SVG.bell,''],
      ['snooze',estaPospuesto(l)?'Reactivar chat':'Posponer',SVG.clock,''],
      ['arch','Archivar',SVG.archive,'danger'],
    ]),
  ];
  openSheet(esc(l.customer_name||'Cliente'), `<div style="padding:6px 0">${items.map(([a,label,ic,cls])=>`<div class="ctx-item ${cls}" data-cm="${a}"><div class="ctx-ic">${I(ic,18)}</div><div>${label}</div></div>`).join('')}</div>`);
  document.querySelectorAll('[data-cm]').forEach(el=>el.onclick=()=>{ closeSheet(); swipeAction(el.dataset.cm, {dataset:{id:String(l.id), phone:l.customer_phone||''}}); });
}
function swipeAction(a,row){ const id=Number(row.dataset.id); const phone=(row.dataset.phone||'').replace(/[^\d+]/g,''); const l=findLead(id); haptic(12);
  if(a==='call'){ llamarYRegistrar(phone, id); }
  else if(a==='note'){ current=l; abrirNota(); }
  else if(a==='tag'){ current=l; abrirEtapa(); }
  else if(a==='arch'){
    if(l){ toast('Archivando...'); api(`/api/leads/${id}/cerrar`,{method:'POST'}).then(async()=>{ toast('Archivado'); await cargarArchivados(); if(!showArchivados) cargar(); else renderList(); }); }
  }
  else if(a==='unread'){
    if(l){ api(`/api/leads/${id}/marcar-no-leido`,{method:'POST'}).then(()=>{ l.unread_count=1; renderList(); toast('Marcado como no leído'); }); }
  }
  else if(a==='unarch'){
    if(l){ toast('Restaurando...'); api(`/api/leads/${id}/desarchivar`,{method:'POST'}).then(async()=>{ await cargarArchivados(); if(showArchivados) renderList(); else { cargar(); } toast('Restaurado a bandeja principal'); }); }
  }
  else if(a==='pin'){ togglePinLead(id); }
  else if(a==='mute'){ current=l; toggleMuteLead(); }
  else if(a==='snooze'){ abrirSnooze(l); }
}
// Posponer un chat (C2): baja al fondo hasta la hora elegida; o reactivar si ya está pospuesto.
function abrirSnooze(l){
  if(!l) return;
  if(estaPospuesto(l)){
    api('/api/leads/'+l.id+'/snooze',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>{ if(r){ l.snoozed_until=null; renderList(); toast('Chat reactivado'); } });
    return;
  }
  const opts=[['60','En 1 hora'],['180','En 3 horas'],['mañana','Mañana 8:00 a.m.']];
  openSheet('Posponer chat', `<div style="display:flex;flex-direction:column;gap:8px">${opts.map(([k,t])=>`<button class="lp-cell wide" data-snz="${k}" style="text-align:left;width:100%;color:var(--text)">😴 ${t}</button>`).join('')}</div>`);
  $('#sheetBody').querySelectorAll('[data-snz]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.snz; closeSheet();
    let body;
    if(k==='mañana'){ const d=new Date(); d.setDate(d.getDate()+1); d.setHours(8,0,0,0); body={until:d.toISOString()}; }
    else body={minutos:Number(k)};
    api('/api/leads/'+l.id+'/snooze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>{ if(r&&r.snoozed_until){ l.snoozed_until=r.snoozed_until; renderList(); toast('Pospuesto'); haptic(10); } });
  });
}
function findLead(id){ return leads.find(x=>x.id===id) || archivedLeads.find(x=>x.id===id); }

/* ════════ Chat ════════ */
let _hayMasMsgs=false;
// Cargar página anterior de mensajes (paginación del historial)
document.addEventListener('click',async e=>{
  const btn=e.target.closest('#cargarAnteriores'); if(!btn||!current) return;
  btn.disabled=true; btn.textContent='Cargando…';
  const primerId=currentMsgs.length?currentMsgs[0].id:null;
  const d=await api(`/api/leads/${current.id}/mensajes?before_id=${primerId||''}`);
  if(d&&d.mensajes){
    const cont=$('#cMsgs'); const alturaAntes=cont.scrollHeight;
    currentMsgs=d.mensajes.concat(currentMsgs); _hayMasMsgs=!!d.hay_mas; _audioPlayers={};
    cont.innerHTML=(_hayMasMsgs?btn.outerHTML.replace('Cargando…','↑ Cargar mensajes anteriores'):'')+msgsHTML(currentMsgs);
    const nuevoBtn=cont.querySelector('#cargarAnteriores'); if(nuevoBtn) nuevoBtn.disabled=false;
    cont.scrollTop=cont.scrollHeight-alturaAntes; // mantener la posición visual
  } else { btn.disabled=false; btn.textContent='↑ Cargar mensajes anteriores'; }
});
async function abrirChat(id){ let l; let msgs;
  try{ clearSelection(); cancelEdit(); _editingMsg=null; haptic(10); cerrarEquipo(); }catch(e){ console.error('abrirChat/init',e); }
  try{ l=findLead(id); }catch(e){ console.error('abrirChat/find',e); }
  try{ current=l||{id,customer_name:'Cliente',customer_phone:''}; }catch(e){ current={id,customer_name:'Cliente',customer_phone:''}; }
  try{
    if(DEMO){ msgs=demoMsgs(); } else {
      const d=await api(`/api/leads/${id}/mensajes`);
      if(d&&d.lead){
        current=d.lead; msgs=d.mensajes||[]; _hayMasMsgs=!!d.hay_mas;
        api(`/api/leads/${id}/leido`,{method:'POST'});
        api(`/api/leads/${id}/mark-all-read`,{method:'POST'});
        if(l) l.unread_count=0;
      } else if(api.lastStatus===403){ msgs=[]; toast('No tienes permiso para ver este chat','err'); }
      else { msgs=[]; toast('No se pudo cargar la conversación. Desliza para reintentar.'); }
    }
  }catch(e){ console.error('abrirChat/api',e); msgs=msgs||[]; }
  try{
    currentMsgs=msgs||[]; renderChat(current,currentMsgs);
    $('#scChat').classList.add('show');
    history.pushState({ chat: id }, '');
    if(!DEMO) checkWindowStatus(current.id);
  }catch(e){ console.error('abrirChat/render',e); toast('Error al abrir'); return; }
  try{ if(l){ l.unread_count=0; renderList(); } }catch(e){ console.error('abrirChat/list',e); }
}
function cerrarChat(){ clearSelection(); $('#scChat').classList.remove('show'); haptic(6); }
function renderChat(l,msgs){ const nombre=l.customer_name||'Cliente'; const st=estado(l);
  $('#scChat').innerHTML = `
    <header class="c-head">
      <button class="c-back" id="cBack">${I(SVG.back,22)}</button>
      <div class="c-id" id="cId"><div class="m-avatar" style="background:${avatarColor(nombre)}">${initials(nombre)}</div><div style="min-width:0"><div class="c-name">${esc(nombre)}</div><div class="c-sub"><span class="m-avatar__st ${st.cls}" style="position:static;width:8px;height:8px;border:none"></span>${st.label}</div></div></div>
      <div class="c-acts">
        <button class="c-act" data-ca="call">${I(SVG.phone,20)}</button>
        ${esWhatsAppLead(l)?`<button class="c-act" data-ca="tpl" title="Plantillas de WhatsApp">${I(SVG.megaphone,20)}</button>`:''}
        <button class="c-act" data-ca="search">${I(SVG.search,20)}</button>
        <button class="c-act" data-ca="more">${I(SVG.dots,20)}</button>
      </div>
    </header>
    <div class="c-window-badge" id="cWindowBadge"></div>
    <div class="c-search" id="cSearch">
      <input id="cSearchInput" placeholder="Buscar en el chat…" autocomplete="off">
      <button class="c-search__x" id="cSearchX">${I(SVG.x,16)}</button>
    </div>
    <div class="c-msgs" id="cMsgs">${_hayMasMsgs?'<button id="cargarAnteriores" style="display:block;margin:6px auto 10px;padding:7px 16px;border-radius:999px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:12px;font-family:inherit;cursor:pointer">↑ Cargar mensajes anteriores</button>':''}${msgsHTML(msgs)}</div>
    <div class="c-reply" id="cReply">
      <div class="c-reply__line"></div>
      <div class="c-reply__info">
        <div class="c-reply__label" id="replyLabel"></div>
        <div class="c-reply__preview" id="replyPreview"></div>
      </div>
      <button class="c-reply__x" id="replyX">${I(SVG.x,16)}</button>
    </div>
    <div class="sel-bar" id="selBar">
      <span class="sel-count" id="selCount">1 seleccionado</span>
      <button class="sel-act" data-sel="copy" title="Copiar">${I(SVG.copy,19)}</button>
      <button class="sel-act danger" data-sel="delete" title="Eliminar">${I(SVG.trash,19)}</button>
      <button class="sel-act" data-sel="forward" title="Reenviar">${I(SVG.send,19)}</button>
      <button class="sel-act" data-sel="share" title="Compartir">${I(SVG.arrowUp,19)}</button>
      <button class="sel-act x" data-sel="clear" title="Cancelar">${I(SVG.x,18)}</button>
    </div>
    <div class="c-input">
      <div class="c-quick" id="cQuick">${(_templates.length?_templates:QUICK).map(q=>`<button data-q="${esc(q.body||q.cuerpo)}">${esc(q.t||q.titulo)}</button>`).join('')}<button data-mas-plantillas>➕ Más</button></div>
      <div class="rec-bar" id="recBar">
        <span class="rec-dot" id="recDot"></span>
        <span class="rec-time" id="recTime">0:00</span>
        <span class="rec-swipe" id="recSwipe">${I(SVG.arrowUp,14)} Desliza para cancelar</span>
        <button class="rec-cancel" title="Cancelar">${I(SVG.x,17)}</button>
        <button class="rec-send" title="Enviar audio">${I(SVG.send,16)}</button>
      </div>
      <div class="c-input__row" id="cInput__row">
        <button class="c-plus" id="cPlus">${I(SVG.plus,22)}</button>
        <button class="c-emoji" id="cEmoji">😊</button>
        <div class="c-emoji-pop" id="cEmojiPop"></div>
        <div class="c-pill"><textarea id="cInput" rows="1" placeholder="Mensaje…"></textarea></div>
        <button class="c-send" id="cSend">${I(SVG.mic,21)}</button>
      </div>
    </div>`;
  const box=$('#cMsgs'); box.scrollTop=box.scrollHeight;
  // MutationObserver: limpia _audioPlayers en cada re-render del chat automáticamente
  if(window._audioObs) window._audioObs.disconnect();
  if(box){ window._audioObs=new MutationObserver(()=>{ _audioPlayers={}; }); window._audioObs.observe(box,{childList:true}); }
  // Link preview: detect URLs and fetch previews
  setTimeout(()=>{ linkPreviews(); }, 300);
  // Wire message swipe (reply)
  // Reaction click — toggle reaction
  const msgsBox=$('#cMsgs');
  if(msgsBox) msgsBox.addEventListener('click',e=>{
    const react=e.target.closest('.bub-reaction');
    if(react){ const wrap=react.closest('.msg-wrap'); if(wrap) toggleReaction(wrap.dataset.msgid, react.dataset.emoji); return; }
    if(selMode){
      if(e.target===msgsBox) clearSelection();
      const check=e.target.closest('.sel-check');
      if(check){ const wrap=check.closest('.msg-wrap'); if(wrap) toggleSel(wrap.dataset.msgid); return; }
    }
    // Ver más toggle
    const moreBtn=e.target.closest('.bub__more');
    if(moreBtn){
      const span=moreBtn.closest('.bub-body--trunc');
      if(span){ span.innerHTML=esc(span.dataset.full); span.classList.remove('bub-body--trunc'); }
      return;
    }
    // Tap en el motivo de un mensaje no entregado → detalle + reintentar escribiendo.
    // Va ANTES del handler genérico de .bub (copiar texto), si no el tap copiaría en
    // vez de abrir el detalle.
    const fail=e.target.closest('.bub-fail');
    if(fail){
      const m=currentMsgs.find(x=>String(x.id)===String(fail.dataset.fail));
      if(m) openSheet('Mensaje no entregado', `
        <div style="font-size:13px;line-height:1.55;color:var(--text-2);margin-bottom:14px">${esc(m.error_humano||'Meta rechazó el envío sin dar un motivo legible.')}</div>
        <div style="font-size:11px;color:var(--text-3);font-family:var(--f-num);word-break:break-word;margin-bottom:16px">${esc(m.error_detail||'')}</div>
        <button id="failReenviar" style="width:100%;height:46px;border:none;border-radius:12px;background:var(--grad-gold);color:#0A0A0A;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer">Volver a escribirlo</button>`);
      const rb=document.getElementById('failReenviar');
      if(rb&&m) rb.onclick=()=>{ closeSheet(); const i=$('#cInput'); i.value=m.body||''; i.focus(); updateSend(); haptic(6); };
      return;
    }
    // Transcribir nota de voz on-demand (A3) — el resultado llega por SSE 'transcripcion'
    const trBtn=e.target.closest('[data-transcribe]');
    if(trBtn){
      const mid=trBtn.dataset.transcribe; trBtn.textContent='⏳ Transcribiendo…'; trBtn.disabled=true; haptic(8);
      api('/api/messages/'+mid+'/transcribir',{method:'POST'}).then(r=>{
        if(!r){ trBtn.textContent='📝 Transcribir'; trBtn.disabled=false; return; }
        if(r.transcript){ const m=currentMsgs.find(x=>String(x.id)===String(mid)); if(m){ m.transcript=r.transcript; _audioPlayers={}; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); } }
        else if(r.aiOff){ toast('IA no configurada para transcribir'); trBtn.textContent='📝 Transcribir'; trBtn.disabled=false; }
        else if(!r.queued){ trBtn.textContent='📝 Transcribir'; trBtn.disabled=false; }
      });
      return;
    }
    // Tap text body → copy
    const bub=e.target.closest('.bub');
    if(bub&&!e.target.closest('.bub__t')&&!e.target.closest('.bub-reactions')&&!e.target.closest('button')&&!e.target.closest('img')&&!e.target.closest('video')&&!e.target.closest('audio')&&!e.target.closest('a')&&!e.target.closest('.link-preview')){
      const wrap=bub.closest('.msg-wrap');
      if(wrap){
        const m=currentMsgs.find(x=>String(x.id)===String(wrap.dataset.msgid));
        if(m&&m.body&&!m.deleted_for_sender){ navigator.clipboard.writeText(m.body).then(()=>toast('Copiado')).catch(()=>{}); }
      }
    }
  });
  setTimeout(()=>{ document.querySelectorAll('.msg-wrap').forEach(w=>{ wireMsgSwipe(w); wireMsgLongPress(w); }); }, 100);
  // Selection bar
  const selBar=$('#selBar');
  if(selBar){ selBar.querySelectorAll('[data-sel]').forEach(b=>b.onclick=()=>{
    const a=b.dataset.sel;
    if(a==='copy') selCopy();
    else if(a==='delete') selDelete(null);
    else if(a==='forward') selForward(null);
    else if(a==='share') selShare();
    else if(a==='clear') clearSelection();
  }); }
  updateSelBar();
  $('#cBack').onclick=()=>{ if(history.state && history.state.chat) history.back(); else cerrarChat(); };
  $('#cId').onclick=()=>abrirPerfil();
  $('#scChat').querySelectorAll('.c-act').forEach(b=>b.onclick=()=>chatAccion(b.dataset.ca));
  $('#cPlus').onclick=()=>{ $('#cPlus').classList.toggle('open'); abrirAdjuntos(); };
  $('#cEmoji').onclick=()=>toggleComposeEmojiPicker();
  $('#cQuick').querySelectorAll('button[data-q]').forEach(b=>b.onclick=()=>{ const i=$('#cInput'); i.value=b.dataset.q; i.focus(); updateSend(); haptic(6); });
  const btnMasPlantillas=$('#cQuick').querySelector('[data-mas-plantillas]');
  if(btnMasPlantillas) btnMasPlantillas.onclick=()=>{ haptic(6); abrirPlantillas(); };
  const inp=$('#cInput');
  // Borrador por chat: restaurar el texto no enviado al abrir
  try{ const dr=current&&localStorage.getItem(draftKey(current.id)); if(dr){ inp.value=dr; inp.style.height='auto'; inp.style.height=Math.min(inp.scrollHeight,110)+'px'; } }catch(e){}
  inp.addEventListener('input',()=>{ inp.style.height='auto'; inp.style.height=Math.min(inp.scrollHeight,110)+'px'; updateSend(); notifyTyping(); saveDraft(); });
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter'&&(localStorage.getItem('sp_chat_enter_sends')!=='false')&&!e.shiftKey){ e.preventDefault(); enviar(); } });
  $('#cSend').onclick=()=>{ try{
    if(_recTouch) return; // en móvil el hold-to-record maneja todo; ignorar el click fantasma post-touch
    const t=($('#cInput').value||'').trim();
    if(t.length>0) enviar();
    else if(_rec) enviarGrabacion(); // desktop: segundo click detiene y envía
    else startGrabacion();           // desktop: primer click inicia grabación
  }catch(e){ console.error('cSend',e); haptic(12); toast('Error'); } };
  wireHoldRecord($('#cSend'));
  // Botones de respaldo en la barra de grabación (delegación: sobrevive al innerHTML de wireHoldRecord)
  $('#recBar').addEventListener('click',e=>{
    if(e.target.closest('.rec-cancel')){ cancelarGrabacion(); toast('Grabación cancelada'); }
    else if(e.target.closest('.rec-send')){ enviarGrabacion(); }          // detiene y muestra preview
    else if(e.target.closest('.rec-discard')){ descartarPreviewAudio(); } // descarta la nota en preview
    else if(e.target.closest('.rec-confirm')){ subirAudioPendiente(); }   // envía la nota en preview
  });
  $('#replyX').onclick=cancelarReply;
  // Chat search
  const cSearch=$('#cSearchInput'); const cSearchX=$('#cSearchX');
  if(cSearch) cSearch.addEventListener('input',()=>{ if(!current) return; const b=$('#cMsgs'); if(b) b.innerHTML=msgsHTML(currentMsgs); });
  if(cSearchX) cSearchX.addEventListener('click',()=>{ $('#cSearch').classList.remove('show'); if(cSearch) cSearch.value=''; if(current&&$('#cMsgs')) $('#cMsgs').innerHTML=msgsHTML(currentMsgs); });
  updateSend();
}
function updateSend(){ const b=$('#cSend'); if(!b) return; const hay=($('#cInput').value||'').trim().length>0; b.innerHTML=I(hay?SVG.send:SVG.mic,21); }

/* ════════ Swipe to reply ──── */
function wireMsgSwipe(wrap){ if(wrap._swipe) return; wrap._swipe=true;
  const bub=wrap.querySelector('.bub'); if(!bub) return;
  let x0=0,dx=0,drag=false,arrow=null;
  const mkArrow=()=>{
    const a=document.createElement('div');
    a.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h11a4 4 0 0 1 4 4v2M4 12l4-4M4 12l4 4"/></svg>';
    a.style.cssText='position:absolute;left:0;top:0;bottom:0;width:40px;display:flex;align-items:center;justify-content:center;color:var(--gold);opacity:0;pointer-events:none;z-index:2;';
    bub.insertAdjacentElement('beforebegin',a); return a;
  };
  bub.addEventListener('touchstart',e=>{ x0=e.touches[0].clientX; dx=0; drag=true; bub.style.transition='none'; wrap.style.overflow='visible'; if(!arrow) arrow=mkArrow(); },{passive:true});
  bub.addEventListener('touchmove',e=>{ if(!drag) return; dx=Math.max(0,e.touches[0].clientX-x0); if(arrow) arrow.style.opacity=Math.min(1,dx/40); if(dx>50){ dx=56; drag=false; bub.style.transition='transform .25s var(--spring)'; bub.style.transform='translateX(56px)'; haptic(8); const t=setTimeout(()=>{ bub.style.transition='transform .3s var(--spring)'; bub.style.transform='translateX(0)'; if(arrow){ arrow.remove(); arrow=null; } clearTimeout(t); },600); setReply(wrap.dataset.msgid); return; } bub.style.transform='translateX('+dx+'px)'; },{passive:true});
  bub.addEventListener('touchend',()=>{ if(!drag) return; drag=false; bub.style.transition='transform .3s var(--spring)'; bub.style.transform='translateX(0)'; if(arrow){ arrow.remove(); arrow=null; } });
}
function setReply(msgId){
  const m = currentMsgs.find(x=>String(x.id)===String(msgId)||String(x.id)===('temp_'+msgId));
  if(!m) return; replyTo=m; haptic(12);
  const bar=document.getElementById('cReply'); const lbl=document.getElementById('replyLabel'); const prev=document.getElementById('replyPreview');
  if(!bar||!lbl||!prev) return;
  const sender = m.direction!=='incoming' ? 'Tú' : (current?current.customer_name||'Cliente':'Cliente');
  let preview= m.reply_to_body ? '↳ '+(m.body||'') : (m.body||'');
  if(m.media_type){ const icons={'image':'🖼️','video':'🎬','audio':'🎙️','document':'📄'}; preview=icons[m.media_type]||'📎'; }
  lbl.textContent='Respondiendo a '+sender; prev.textContent=preview.slice(0,100); bar.classList.add('show');
  const inp=document.getElementById('cInput'); if(inp) inp.focus();
}
function cancelarReply(){ replyTo=null; const bar=document.getElementById('cReply'); if(bar) bar.classList.remove('show'); }

/* ════════ Voice Recording — WhatsApp style (hold-to-record) ════════ */
let _rec=null, _recChunks=[], _recTimer=null, _recSec=0, _recCancelling=false, _recTouch=false, _recLocked=false;
function startGrabacion(){
  if(_rec) return; window._sending=false;
  _recSec=0; _recChunks=[]; _recCancelling=false; _recLocked=false;
  try{
    navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{
      localStorage.setItem('sp_perm_ok_microphone','1'); // la hoja de permisos lee este flag (WebView no reporta mic via permissions.query)
      const mt=['audio/ogg;codecs=opus','audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t))||'';
      _rec=new MediaRecorder(s, mt?{mimeType:mt}:{});
      _rec.ondataavailable=e=>{ if(e.data.size>0) _recChunks.push(e.data); };
      _rec.onstop=()=>{ s.getTracks().forEach(t=>t.stop()); };
      _rec.start(200); haptic(20); // timeslice: los chunks llegan durante la grabación (sin esto quedan vacíos al soltar)
      $('#recBar').classList.add('show'); $('#cInput__row').classList.add('recording');
      _recTimer=setInterval(()=>{ _recSec++; const m=Math.floor(_recSec/60); const seg=String(_recSec%60).padStart(2,'0'); const t=$('#recTime'); if(t) t.textContent=m+':'+seg; },1000);
    }).catch(()=>{ toast('Permiso de micrófono requerido'); console.error('getUserMedia fail'); });
  }catch(e){ console.error('startGrabacion',e); toast('Grabación no disponible'); }
}
function detenerGrabacion(){ if(!_rec) return; _rec.stop(); clearInterval(_recTimer); _rec=null; }
function cancelarGrabacion(){ _recCancelling=true; detenerGrabacion(); _recChunks=[]; _recSec=0; limpiarRecUI(); }
let _pendingAudio=null; // { blob, recMime, ext, url, dur } — nota grabada a la espera de confirmación
// C1: al soltar/enviar, detiene la grabación y muestra un PREVIEW (reproducir/descartar/enviar)
// en vez de mandar de una — evita audios enviados por error o vacíos.
async function enviarGrabacion(){ if(!_rec) return; haptic([10,20]);
  const secs=_recSec;
  clearInterval(_recTimer); _recTimer=null;
  const recMime=_rec.mimeType||'audio/webm';
  try{
    await new Promise(r=>{
      if(_rec.state!=='recording'){ r(); return; }
      const orig=_rec.onstop; _rec.onstop=()=>{ if(orig) orig(); r(); }; _rec.stop();
    });
  }catch(e){ console.error('enviarGrabacion stop',e); limpiarRecUI(); toast('Error al detener la grabación'); return; }
  const blob=new Blob(_recChunks,{type:recMime});
  _rec=null;
  if(_recChunks.length===0||blob.size<100){ limpiarRecUI(); toast('Audio muy corto — mantén presionado para grabar'); return; }
  const ext=recMime.includes('ogg')?'ogg':recMime.includes('mp4')?'m4a':'webm';
  if(_pendingAudio&&_pendingAudio.url){ try{ URL.revokeObjectURL(_pendingAudio.url); }catch(e){} }
  _pendingAudio={ blob, recMime, ext, url:URL.createObjectURL(blob), dur:secs };
  mostrarPreviewAudio();
}
function mmss(s){ const m=Math.floor(s/60); return m+':'+String(s%60).padStart(2,'0'); }
function mostrarPreviewAudio(){
  const bar=$('#recBar'); if(!bar||!_pendingAudio) return;
  bar.classList.add('show'); $('#cInput__row').classList.add('recording');
  bar.innerHTML=`<button class="rec-play" id="recPlay" title="Reproducir" style="background:none;border:none;color:var(--gold);display:flex;align-items:center">${I(SVG.play||SVG.mic,20)}</button>
    <span class="rec-time" id="recPrevTime">${mmss(_pendingAudio.dur)}</span>
    <span style="flex:1;height:3px;background:var(--bg-4);border-radius:2px;overflow:hidden;margin:0 4px"><i id="recPrevProg" style="display:block;height:100%;width:0;background:var(--gold);transition:width .1s linear"></i></span>
    <button class="rec-discard" id="recDiscard" title="Descartar" style="background:none;border:none;color:var(--red);display:flex;align-items:center">${I(SVG.trash||SVG.x,18)}</button>
    <button class="rec-confirm" id="recConfirm" title="Enviar" style="background:var(--gold);border:none;color:#1a1400;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center">${I(SVG.send,16)}</button>`;
  const audio=new Audio(_pendingAudio.url); _pendingAudio.audio=audio;
  const playBtn=$('#recPlay'), prog=$('#recPrevProg');
  audio.ontimeupdate=()=>{ if(prog&&audio.duration) prog.style.width=(audio.currentTime/audio.duration*100)+'%'; };
  const pauseIco='<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  audio.onended=()=>{ if(playBtn) playBtn.innerHTML=I(SVG.play,20); if(prog) prog.style.width='0'; };
  if(playBtn) playBtn.onclick=()=>{ if(audio.paused){ audio.play(); playBtn.innerHTML=pauseIco; } else { audio.pause(); playBtn.innerHTML=I(SVG.play,20); } haptic(6); };
}
function descartarPreviewAudio(){ if(_pendingAudio){ try{ _pendingAudio.audio&&_pendingAudio.audio.pause(); URL.revokeObjectURL(_pendingAudio.url); }catch(e){} } _pendingAudio=null; limpiarRecUI(); haptic(8); }
async function subirAudioPendiente(){
  if(!_pendingAudio||!current){ limpiarRecUI(); return; }
  const p=_pendingAudio; try{ p.audio&&p.audio.pause(); }catch(e){}
  const btn=$('#recConfirm'); if(btn){ btn.disabled=true; btn.innerHTML='…'; }
  const toBase64=f=>new Promise((res,rej)=>{ const r2=new FileReader(); r2.onload=()=>res(r2.result.split(',')[1]); r2.onerror=rej; r2.readAsDataURL(f); });
  const dataBase64=await toBase64(p.blob); const mediaBody={mime:p.recMime,filename:'nota-voz.'+p.ext,dataBase64,caption:''};
  if(replyTo) mediaBody.replyTo=replyTo.id;
  const r=await api(`/api/leads/${current.id}/responder-media`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mediaBody)});
  try{ URL.revokeObjectURL(p.url); }catch(e){} _pendingAudio=null;
  cancelarReply(); _recChunks=[]; _recSec=0; limpiarRecUI();
  if(r!==null){ const d=await api(`/api/leads/${current.id}/mensajes`); if(d){ currentMsgs=d.mensajes; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); const b=$('#cMsgs'); b.scrollTop=b.scrollHeight; } cargar(); toast('Audio enviado'); }
  else{ toast('Error al enviar — reintenta','err'); }
}
function limpiarRecUI(){ _rec=null; _recChunks=[]; _recSec=0; _recCancelling=false; _recLocked=false; $('#recBar').classList.remove('show'); $('#cInput__row').classList.remove('recording'); if(_recTimer){ clearInterval(_recTimer); _recTimer=null; } }
// Hold-to-record en el botón de micrófono (solo cuando no hay texto)
function wireHoldRecord(btn){
  let holdTimer=null, started=false, startY=0, moved=false;
  const isMic=()=>!($('#cInput').value||'').trim().length>0;
  function onTouchStart(e){
    if(!isMic()||_rec||window._sending) return;
    _recTouch=true; // el hold-to-record toma el control: ignorar el click fantasma posterior
    moved=false; startY=e.touches[0].clientY;
    holdTimer=setTimeout(()=>{
      holdTimer=null; started=true;
      startGrabacion();
      const bar=$('#recBar');
      if(bar){ bar.innerHTML=`<span class="rec-dot" id="recDot"></span><span class="rec-time" id="recTime">0:00</span><span class="rec-swipe" id="recSwipe">${I(SVG.arrowUp,14)} Desliza para cancelar</span><button class="rec-cancel" title="Cancelar">${I(SVG.x,17)}</button><button class="rec-send" title="Enviar audio">${I(SVG.send,16)}</button>`; }
    },200);
  }
  function onTouchMove(e){
    if(holdTimer&&!started){ clearTimeout(holdTimer); holdTimer=null; return; }
    if(!started||!_rec) return;
    const dy=startY-e.touches[0].clientY;
    if(dy>40&&!_recCancelling){
      _recCancelling=true; haptic(12);
      const sw=$('#recSwipe'); if(sw) sw.innerHTML=`${I(SVG.x,16)} Cancelar`;
      const lk=$('#recLock'); if(lk) lk.style.opacity='.3';
    } else if(dy<20&&_recCancelling){
      _recCancelling=false;
      const sw=$('#recSwipe'); if(sw) sw.innerHTML=`${I(SVG.arrowUp,14)} Desliza para cancelar`;
      const lk=$('#recLock'); if(lk) lk.style.opacity='1';
    }
  }
  function onTouchEnd(){
    setTimeout(()=>{ _recTouch=false; },500); // libera después del click fantasma del navegador
    if(holdTimer){ clearTimeout(holdTimer); holdTimer=null; started=false; toast('Mantén presionado para grabar'); return; }
    if(!started||!_rec) return;
    started=false;
    if(_recCancelling){ _recCancelling=false; cancelarGrabacion(); toast('Grabación cancelada'); }
    else enviarGrabacion();
  }
  function onTouchCancel(){
    setTimeout(()=>{ _recTouch=false; },500);
    if(holdTimer){ clearTimeout(holdTimer); holdTimer=null; started=false; return; }
    if(!started||!_rec) return;
    started=false;
    // El sistema interrumpió el touch (llamada, gesto, etc.) — enviar para no perder el audio
    enviarGrabacion();
  }
  btn.addEventListener('touchstart',onTouchStart,{passive:true});
  btn.addEventListener('touchmove',onTouchMove,{passive:true});
  btn.addEventListener('touchend',onTouchEnd);
  btn.addEventListener('touchcancel',onTouchCancel);
}

let _editingMsg=null;
/* ════════ Selection Mode ════════ */
let selMode=false, selIds=new Set();
function enterSelMode(msgId){
  selMode=true; selIds.add(String(msgId)); haptic(12);
  if(current) renderChat(current,currentMsgs);
  else $('#cMsgs').innerHTML=msgsHTML(currentMsgs);
  updateSelBar();
}
function toggleSel(msgId){
  const id=String(msgId);
  if(selIds.has(id)) selIds.delete(id);
  else selIds.add(id);
  haptic(6);
  if(selIds.size===0){ selMode=false; }
  const wrap=document.getElementById('msg_'+id);
  if(wrap){ wrap.classList.toggle('selected'); if(selMode) wrap.classList.add('sel-mode'); else wrap.classList.remove('sel-mode'); }
  updateSelBar();
}
function clearSelection(){
  selMode=false; selIds.clear();
  document.querySelectorAll('.msg-wrap.selected,.msg-wrap.sel-mode').forEach(w=>{ w.classList.remove('selected','sel-mode'); });
  updateSelBar();
}
function updateSelBar(){
  const bar=$('#selBar'); const ct=$('#selCount');
  if(!bar) return;
  if(selIds.size>0){ bar.classList.add('show'); if(ct) ct.textContent=selIds.size+' seleccionado'+(selIds.size>1?'s':''); }
  else bar.classList.remove('show');
}
function getSelTexts(){ return currentMsgs.filter(m=>selIds.has(String(m.id))).map(m=>m.body||'').filter(Boolean); }
async function selCopy(texts){
  const t=texts||getSelTexts();
  if(!t.length){ toast('Sin texto para copiar'); return; }
  try{ await navigator.clipboard.writeText(t.join('\n\n')); toast('Copiado'); }catch(e){ toast('No se pudo copiar'); }
  if(!texts) clearSelection();
}
async function selShare(texts){
  const t=texts||getSelTexts();
  if(!t.length){ toast('Sin contenido'); return; }
  if(navigator.share){ try{ await navigator.share({text:t.join('\n\n')}); }catch(e){} }
  else await selCopy(t);
  if(!texts) clearSelection();
}
async function selDelete(msgId, mode){
  if(!msgId) {
    // Desde selección múltiple — borrar para todos cada uno
    if(!selIds.size) return;
    const ids=[...selIds];
    for(const id of ids){
      await api('/api/messages/'+id+'/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'everyone'})});
    }
    if(current){ const d=await api(`/api/leads/${current.id}/mensajes`); if(d){ currentMsgs=d.mensajes; } }
    clearSelection();
    if(current){ renderChat(current,currentMsgs); const b=$('#cMsgs'); if(b) b.scrollTop=b.scrollHeight; }
    toast('Eliminado'+(ids.length>1?'s':''));
    return;
  }
  // Desde menú contextual
  const r=await api('/api/messages/'+msgId+'/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})});
  if(r){ 
    if(current){ const d=await api(`/api/leads/${current.id}/mensajes`); if(d){ currentMsgs=d.mensajes; renderChat(current,currentMsgs); } }
    toast(mode==='me'?'Eliminado para ti':'Eliminado para todos');
  } else toast('Error');
}
function showDeleteOptions(msgId){
  const isOut=currentMsgs.find(m=>String(m.id)===String(msgId))?.direction==='outgoing';
  openSheet('Eliminar mensaje', `
    <div style="padding:6px 0">
      <div class="ctx-item" id="delMe"><div class="ctx-ic">${I(SVG.trash,18)}</div><div>Eliminar para mí</div></div>
      ${isOut?`<div class="ctx-item danger" id="delAll"><div class="ctx-ic">${I(SVG.trash,18)}</div><div>Eliminar para todos</div></div>`:''}
    </div>`);
  $('#delMe').onclick=()=>{ closeSheet(); selDelete(msgId,'me'); };
  if(isOut) $('#delAll').onclick=()=>{ closeSheet(); selDelete(msgId,'everyone'); };
}
async function selForward(msgId){
  // Reenvío server-side: soporta TEXTO y MEDIA (fotos, audios, videos, docs)
  let ids=[];
  if(msgId){ ids=[msgId]; }
  else ids=[...selIds];
  const validos=ids.map(id=>currentMsgs.find(x=>String(x.id)===String(id))).filter(m=>m&&(m.body||m.media_type)&&String(m.id).indexOf('temp_')!==0);
  if(!validos.length){ toast('Sin contenido'); clearSelection(); return; }
  const destinos=leads.filter(l=>l.id!==(current?current.id:null));
  openSheet('Reenviar a…', `<div style="max-height:300px;overflow-y:auto">${destinos.length?destinos.map(l=>`<div class="m-row" style="padding:0;border:none"><div class="m-card" style="border:none;padding:10px 14px;gap:10px" data-fwd="${l.id}"><div class="m-avatar" style="width:36px;height:36px;border-radius:10px;font-size:12px;background:${avatarColor(l.customer_name||'')}">${initials(l.customer_name)}</div><div style="font-size:14px;font-weight:500">${esc(l.customer_name||'Cliente')}</div></div></div>`).join(''):'<div style="text-align:center;color:var(--text-3);padding:20px">Sin otros leads disponibles</div>'}</div>`);
  document.querySelectorAll('[data-fwd]').forEach(el=>el.addEventListener('click',async()=>{
    const destId=Number(el.dataset.fwd); closeSheet(); toast('Reenviando...');
    let ok=0;
    for(const m of validos){
      const r=await api(`/api/messages/${m.id}/forward`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({toLeadId:destId})});
      if(r) ok++;
    }
    if(!msgId) clearSelection();
    toast(ok===validos.length?'Reenviado':ok?'Reenviado parcialmente':'Error al reenviar');
  }));
}
/* ════════ Context menu (long-press) ════════ */
function showCtxMenu(msgId){
  const m=currentMsgs.find(x=>String(x.id)===String(msgId));
  if(!m) return;
  const out=m.direction==='outgoing';
  const hasText=!!(m.body||'');
  const isImg=m.media_type==='image'||m.media_type==='sticker';
  const C=(ic,label,id,cls)=>`<div class="ctx-item${cls?' '+cls:''}" id="${id}"><div class="ctx-ic">${ic}</div><div>${label}</div></div>`;
  openSheet('Opciones', `<div style="padding:6px 0">
    ${C(I(SVG.smile,18),'Reaccionar','ctxReact')}
    ${out&&hasText?C(I(SVG.edit,18),'Editar','ctxEdit'):''}
    ${hasText?C(I(SVG.copy,18),'Copiar texto','ctxCopy'):''}
    ${C(I(SVG.send,18),'Reenviar','ctxForward')}
    ${C('<span style="font-size:16px">⭐</span>', m.starred_at?'Quitar destacado':'Destacar','ctxStar')}
    ${hasText&&m.direction==='incoming'?C('<span style="font-size:15px">🌐</span>','Traducir','ctxTranslate'):''}
    ${C(I(SVG.arrowUp,18),'Compartir','ctxShare')}
    ${isImg?C(I(SVG.download,18),'Guardar imagen','ctxSaveImg'):''}
    ${out?C(I(SVG.info||'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',18),'Info del mensaje','ctxInfo'):''}
    ${C(I(SVG.reply,18),'Responder','ctxReply')}
    ${C(I(SVG.trash,18),'Borrar','ctxDelete','danger')}
    ${C(I(SVG.checkSquare,18),'Seleccionar','ctxSelect')}
  </div>`);
  $('#ctxReact').onclick=()=>{ closeSheet(); openEmojiPicker(msgId); };
  if(out&&hasText){ $('#ctxEdit').onclick=()=>{ closeSheet(); startEditMsg(msgId); }; }
  if(hasText){ $('#ctxCopy').onclick=()=>{ closeSheet(); selCopy([m.body]); }; }
  $('#ctxForward').onclick=()=>{ closeSheet(); selForward(msgId); };
  $('#ctxStar').onclick=async()=>{ closeSheet(); const r=await api('/api/messages/'+msgId+'/star',{method:'POST'}); if(r){ m.starred_at=r.starred?new Date().toISOString():null; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); toast(r.starred?'Mensaje destacado ⭐':'Destacado quitado'); } };
  const ctxTr=$('#ctxTranslate');
  if(ctxTr) ctxTr.onclick=async()=>{ closeSheet(); toast('Traduciendo…'); const r=await api('/api/mensajes/'+msgId+'/traducir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({a:'español'})}); if(r&&r.traduccion){ m.translated_body=r.traduccion; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); } else toast('No se pudo traducir'); };
  $('#ctxShare').onclick=()=>{ closeSheet(); selShare([m.body||'']); };
  if($('#ctxSaveImg')) $('#ctxSaveImg').onclick=async()=>{ closeSheet(); await saveImg(m); };
  if(out){ $('#ctxInfo').onclick=()=>{ closeSheet(); showMsgInfo(msgId); }; }
  $('#ctxReply').onclick=()=>{ closeSheet(); setReply(msgId); };
  $('#ctxDelete').onclick=()=>{ closeSheet(); showDeleteOptions(msgId); };
  $('#ctxSelect').onclick=()=>{ closeSheet(); enterSelMode(msgId); };
}
/* ════════ Guardar imagen (Galería en app nativa + Web Share + descarga) ════════ */
async function saveImg(m){
  const src=m.id?`/api/media/${m.id}`:'';
  if(!src){ toast('Sin imagen','err'); return; }
  const filename=(m.media_filename||'imagen.jpg').replace(/[^\w.()-]/g,'_');
  toast('Descargando…');
  try{
    const r=await fetch(src,{credentials:'include'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const blob=await r.blob();
    // 1) App nativa (APK Capacitor): guardar directo en la Galería del teléfono.
    //    El WebView ignora <a download>, así que usamos los plugins nativos.
    if(esNativo()){
      const P=window.Capacitor.Plugins||{};
      if(P.Filesystem){
        try{
          const toBase64=f=>new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result.split(',')[1]); fr.onerror=rej; fr.readAsDataURL(f); });
          const dataBase64=await toBase64(blob);
          const w=await P.Filesystem.writeFile({path:'sp-leons/'+filename,data:dataBase64,directory:'CACHE'});
          if(P.Media&&P.Media.savePhoto){
            await P.Media.savePhoto({path:w.uri,album:'Sp Leons'});
            toast('Guardada en Galería');
            return;
          }
          if(P.Share&&P.Share.share){
            await P.Share.share({files:[w.uri],title:filename,useSystemSharingController:true});
            return;
          }
        }catch(e){
          console.error('[saveImg nativo]',e);
          // si falla, cae al flujo web de abajo
        }
      }
    }
    // 2) Web Share API con files (mejor en navegador móvil — abre hoja de compartir nativa)
    if(navigator.canShare && navigator.canShare({files:[new File([blob],filename,{type:blob.type||'image/jpeg'})]}) ){
      try{
        await navigator.share({files:[new File([blob],filename,{type:blob.type||'image/jpeg'})], title:filename});
        return;
      }catch(e){ if(e && e.name==='AbortError') return; /* si cancela o falla, seguir al fallback */ }
    }
    // 3) Fallback: <a download> programático
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=filename; a.target='_blank';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  }catch(e){
    console.error('[saveImg]',e);
    // 3) Último recurso: abrir en pestaña nueva y que el usuario guarde a mano
    try{ window.open(src,'_blank'); toast('Abre la imagen y guárdala a mano','err'); }
    catch(e2){ toast('No se pudo descargar','err'); }
  }
}
/* ════════ Emoji Picker ════════ */
const EMOJIS=['👍','❤️','😂','😮','😢','🙏','🔥','🎉','💯','⭐','👏','💪'];
function openEmojiPicker(msgId){
  const m=currentMsgs.find(x=>String(x.id)===String(msgId));
  const existingReactions=m?.reactions||[];
  const myNumber=me?.telefono||'self';
  const getCount=emoji=>existingReactions.filter(r=>r.emoji===emoji).length;
  const iHave=emoji=>existingReactions.some(r=>r.emoji===emoji&&r.sender_number===myNumber);
  openSheet('Reaccionar', `<div class="emoji-grid">${EMOJIS.map(e=>`<button data-emoji="${e}" class="${iHave(e)?'active':''}">${e}${getCount(e)>0?`<span class="e-count">${getCount(e)}</span>`:''}</button>`).join('')}</div>`);
  document.querySelectorAll('.emoji-grid button').forEach(b=>b.onclick=async()=>{
    const emoji=b.dataset.emoji; closeSheet();
    await toggleReaction(msgId,emoji);
  });
}

/* ════════ Emoji picker de composición (barra de chat) ════════ */
const COMPOSE_EMOJIS=[
  ['Frecuentes',['👍','❤️','😂','🙏','🔥','🎉','💯','😊']],
  ['Caritas',['😀','😁','😅','😊','🙂','😉','😍','🥰','😘','😎','🤔','😐','😴','🥳','😢','😭','😡','😱','🤗','🙌']],
  ['Gestos',['👋','👏','🙏','💪','👌','✌️','🤝','👆','👇','🤞']],
  ['Negocio',['🏠','🏡','🏘️','📍','📅','💰','💵','📈','✅','❌','⏰','📞','📩','📄','🔑','🚗']],
];
function toggleComposeEmojiPicker(){
  const pop=$('#cEmojiPop'); if(!pop) return;
  if(pop.classList.contains('show')){ pop.classList.remove('show'); return; }
  if(!pop.innerHTML){
    pop.innerHTML=COMPOSE_EMOJIS.map(([cat,list])=>`<div class="c-emoji-pop__cat">${cat}</div><div class="c-emoji-pop__grid">${list.map(e=>`<button type="button" data-e="${e}">${e}</button>`).join('')}</div>`).join('');
    pop.querySelectorAll('button[data-e]').forEach(b=>b.onclick=()=>insertEmojiEnInput(b.dataset.e));
  }
  pop.classList.add('show');
  document.addEventListener('click', _closeComposeEmojiOnOutside, true);
}
function _closeComposeEmojiOnOutside(e){
  const pop=$('#cEmojiPop'); const btn=$('#cEmoji');
  if(!pop) return;
  if(pop.contains(e.target)||e.target===btn) return;
  pop.classList.remove('show');
  document.removeEventListener('click', _closeComposeEmojiOnOutside, true);
}
function insertEmojiEnInput(emoji){
  const inp=$('#cInput'); if(!inp) return;
  const start=inp.selectionStart??inp.value.length, end=inp.selectionEnd??inp.value.length;
  inp.value=inp.value.slice(0,start)+emoji+inp.value.slice(end);
  const pos=start+emoji.length;
  inp.focus(); inp.setSelectionRange(pos,pos);
  inp.dispatchEvent(new Event('input',{bubbles:true}));
  haptic(6);
}
async function toggleReaction(msgId,emoji){
  const r=await api('/api/messages/'+msgId+'/react',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({emoji})});
  if(r&&r.reactions!==undefined){
    if(current){ const d=await api(`/api/leads/${current.id}/mensajes`); if(d){ currentMsgs=d.mensajes; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); } }
  }
}
/* ════════ Info del mensaje ════════ */
function showMsgInfo(msgId){
  const m=currentMsgs.find(x=>String(x.id)===String(msgId));
  if(!m) return;
  const fInfo={weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'};
  const ts=m.timestamp?parseDbDate(m.timestamp).toLocaleString('es-CO',fInfo):'—';
  const readTs=m.read_at?parseDbDate(m.read_at).toLocaleString('es-CO',fInfo):'—';
  const editTs=m.edited_at?parseDbDate(m.edited_at).toLocaleString('es-CO',fInfo):null;
  openSheet('Info del mensaje', `<div class="msg-info">
    <div class="mi-row"><span class="mi-l">Enviado</span><span class="mi-v">${esc(ts)}</span></div>
    ${m.status==='read'?`<div class="mi-row"><span class="mi-l">Visto</span><span class="mi-v">${esc(readTs)}</span></div>`:''}
    ${editTs?`<div class="mi-row"><span class="mi-l">Editado</span><span class="mi-v">${esc(editTs)}</span></div>`:''}
    <div class="mi-row"><span class="mi-l">Tipo</span><span class="mi-v">${m.media_type||'Texto'}</span></div>
  </div>`);
}
/* ════════ Editar mensaje ════════ */
function startEditMsg(msgId){
  const m=currentMsgs.find(x=>String(x.id)===String(msgId));
  if(!m||!m.body) return;
  _editingMsg=msgId;
  const inp=$('#cInput'); if(!inp) return;
  inp.value=m.body; inp.style.height='auto'; inp.style.height=Math.min(inp.scrollHeight,110)+'px';
  inp.focus(); updateSend();
  // Mostrar indicador de edición
  const replyBar=$('#cReply');
  if(replyBar){
    replyBar.innerHTML=`<div class="c-reply__line"></div><div class="c-reply__info"><div class="c-reply__label" style="color:var(--gold)">Editando mensaje</div><div class="c-reply__preview">${esc(String(m.body).slice(0,60))}</div></div><button class="c-reply__x" id="editCancel">${I(SVG.x,16)}</button>`;
    replyBar.classList.add('show');
    $('#editCancel').onclick=cancelEdit;
  }
}
function cancelEdit(){
  _editingMsg=null;
  const bar=$('#cReply');
  if(bar){ bar.innerHTML=`<div class="c-reply__line"></div><div class="c-reply__info"><div class="c-reply__label" id="replyLabel"></div><div class="c-reply__preview" id="replyPreview"></div></div><button class="c-reply__x" id="replyX">${I(SVG.x,16)}</button>`; bar.classList.remove('show'); }
  $('#replyX').onclick=cancelarReply;
  const inp=$('#cInput'); if(inp){ inp.value=''; inp.style.height='auto'; updateSend(); }
}
/* ════════ Pin lead (desde swipe) ════════ */
async function togglePinLead(leadId){
  const l=findLead(leadId); if(!l) return;
  const pin=!l.pinned_at;
  const r=await api('/api/leads/'+leadId+'/pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pinned:pin})});
  if(r){ l.pinned_at=pin?new Date().toISOString():null; cargar(); toast(pin?'Fijado arriba':'Quitado de fijados'); }
}
async function toggleMuteLead(){
  if(!current) return;
  const muted=!current.muted_at;
  const r=await api('/api/leads/'+current.id+'/mute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({muted})});
  if(r){ current.muted_at=muted?new Date().toISOString():null; toast(muted?'Silenciado':'Sonido activado'); closeSheet(); abrirPerfil(); }
}
/* ════════ Wire Long Press (reemplaza enterSelMode directo) ════════ */
function wireMsgLongPress(wrap){
  if(wrap._lp) return; wrap._lp=true;
  const bub=wrap.querySelector('.bub'); if(!bub) return;
  let timer=null, sx=0,sy=0;
  function onStart(e){
    if(selMode){ toggleSel(wrap.dataset.msgid); return; }
    if(_editingMsg) return; // no abrir menú mientras se edita
    const touch=e.touches[0]; sx=touch.clientX; sy=touch.clientY;
    timer=setTimeout(()=>{
      timer=null; haptic(12); showCtxMenu(wrap.dataset.msgid);
    },400);
  }
  function onMove(e){
    if(timer){ const dx=Math.abs(e.touches[0].clientX-sx),dy=Math.abs(e.touches[0].clientY-sy); if(dx>10||dy>10){ clearTimeout(timer); timer=null; } }
  }
  function onEnd(){
    if(timer){ clearTimeout(timer); timer=null; }
  }
  bub.addEventListener('touchstart',onStart,{passive:true});
  bub.addEventListener('touchmove',onMove,{passive:true});
  bub.addEventListener('touchend',onEnd);
}
/* ════════ Scheduled Messages — en SERVIDOR (salen aunque la app esté cerrada) ════════ */
function abrirProgramar(){
  if(!current){ toast('Abre un chat primero'); return; }
  openSheet('Mensaje programado', `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="font-size:12px;color:var(--text-3)">Se enviará automáticamente aunque cierres la app 🚀</div>
      <textarea id="schBody" placeholder="Mensaje a enviar..." style="width:100%;min-height:70px;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:14px;font-family:inherit;outline:none;resize:none"></textarea>
      <input type="datetime-local" id="schDate" style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:14px;font-family:inherit;outline:none">
      <button class="cop-use" id="schSave">Programar</button>
      <div style="margin-top:8px"><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Programados</div>
      <div class="rec-list" id="schList"></div></div>
    </div>`);
  renderSchList();
  $('#schSave').onclick=async()=>{
    const body=($('#schBody').value||'').trim(); const dt=$('#schDate').value;
    if(!body||!dt){ toast('Completa mensaje y fecha'); return; }
    const r=await api('/api/programados',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leadId:current.id,body,sendAt:new Date(dt).toISOString()})});
    if(r){ $('#schBody').value=''; $('#schDate').value=''; renderSchList(); toast('Programado en el servidor ✓'); haptic([10,20]); }
    else toast('Error al programar');
  };
}
async function renderSchList(){
  const box=$('#schList'); if(!box) return;
  const s=await api('/api/programados')||[];
  if(!s.length){ box.innerHTML='<div style="font-size:13px;color:var(--text-3);text-align:center;padding:12px">Sin mensajes programados</div>'; return; }
  box.innerHTML=s.map(m=>`<div class="sch-item"><span class="sch-time">${parseDbDate(m.send_at).toLocaleString('es-CO',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})}</span><span class="sch-body">${m.customer_name?esc(m.customer_name)+': ':''}${esc(m.body)}</span><button class="sch-del" data-sch="${m.id}">${I(SVG.x,14)}</button></div>`).join('');
  box.querySelectorAll('[data-sch]').forEach(b=>b.onclick=async()=>{ const r=await api('/api/programados/'+b.dataset.sch,{method:'DELETE'}); if(r){ renderSchList(); toast('Cancelado'); } });
}
// Migración one-shot: programados viejos de localStorage → servidor
async function initScheduled(){
  try{
    const s=JSON.parse(localStorage.getItem('sp_scheduled')||'[]');
    if(!s.length){ localStorage.removeItem('sp_scheduled'); return; }
    let migrados=0;
    for(const m of s){
      if(!m.leadId||!m.body||!m.dt) continue;
      const r=await api('/api/programados',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leadId:m.leadId,body:m.body,sendAt:new Date(m.dt).toISOString()})});
      if(r) migrados++;
    }
    localStorage.removeItem('sp_scheduled');
    if(migrados) toast(migrados+' programado'+(migrados>1?'s':'')+' migrado'+(migrados>1?'s':'')+' al servidor');
  }catch(e){ console.error('initScheduled migración',e); }
}

/* ════════ Stickers ════════ */
async function abrirStickers(){
  if(!current){ toast('Abre un chat primero'); return; }
  let lista=[];
  try{ const r=await fetch('/stickers/index.json',{credentials:'include'}); if(r.ok) lista=await r.json(); }catch(e){}
  if(!Array.isArray(lista)||!lista.length){ toast('Sin stickers disponibles aún'); return; }
  openSheet('Stickers', `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:6px 0">${lista.map(f=>`<button data-stk="${esc(f)}" style="border:none;background:var(--bg-3);border-radius:14px;padding:8px;cursor:pointer"><img src="/stickers/${esc(f)}" style="width:100%;aspect-ratio:1;object-fit:contain"></button>`).join('')}</div>`);
  $('#sheetBody').querySelectorAll('[data-stk]').forEach(b=>b.onclick=async()=>{
    haptic(10); closeSheet(); toast('Enviando sticker…');
    try{
      const resp=await fetch('/stickers/'+b.dataset.stk,{credentials:'include'});
      const blob=await resp.blob();
      const dataBase64=await new Promise((res,rej)=>{ const r2=new FileReader(); r2.onload=()=>res(r2.result.split(',')[1]); r2.onerror=rej; r2.readAsDataURL(blob); });
      const r=await api(`/api/leads/${current.id}/responder-media`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mime:'image/webp',filename:b.dataset.stk,dataBase64,sticker:true})});
      if(r){ const d=await api(`/api/leads/${current.id}/mensajes`); if(d){ currentMsgs=d.mensajes; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); const bx=$('#cMsgs'); bx.scrollTop=bx.scrollHeight; } toast('Sticker enviado'); }
      else toast('Error al enviar sticker');
    }catch(e){ toast('Error al enviar sticker'); }
  });
}

function msgsHTML(msgs){ if(!msgs||!msgs.length) return '<div class="m-empty" style="min-height:200px"><p>Sin mensajes todavía.</p></div>'; let h='',last='';
  const searchTerm=$('#cSearchInput')&&$('#cSearchInput').value.trim().toLowerCase(); let filtered=msgs; if(searchTerm) filtered=msgs.filter(m=>m.body&&m.body.toLowerCase().includes(searchTerm)); for(const m of filtered){ const f=dateLabel(m.timestamp); if(f&&f!==last){ h+=`<div class="c-date">${f}</div>`; last=f; } const out=m.direction!=='incoming'; const wrapId='msg_'+m.id; const st=m.status||'sent'; const chk=out?chkHTML(st,m.read_at):''; const hl=searchTerm&&m.body&&m.body.toLowerCase().includes(searchTerm)?' highlight':''; const sel=selIds.has(String(m.id))?' selected':''; const addedit=m.edited_at?'<span class="bub__edited">editado</span>':''; const reacHTML=renderReactions(m.reactions); const deleted=m.deleted_for_sender?'<div class="bub-deleted">Eliminaste este mensaje</div>':''; const bodyHTML=deleted||(m.media_type?renderMedia(m):esc(m.body||'')); const failTxt=(out&&st==='failed')?(m.error_humano||'No se pudo entregar. Toca para ver el detalle.'):''; const failHTML=failTxt?`<div class="bub-fail" data-fail="${m.id}">⚠️ ${esc(failTxt.length>90?failTxt.slice(0,90)+'…':failTxt)}</div>`:''; h+=`<div class="msg-wrap${selMode?' sel-mode':''}${sel}" data-msgid="${m.id}" id="${wrapId}"><div class="sel-check"></div><!-- msg-reply-act eliminado --><div class="bub bub--${out?'out':'in'}${hl}">${msgInner(m)}<div class="bub__t">${addedit}${soloHora(m.timestamp)}${chk}</div>${failHTML}${reacHTML}</div></div>`; }
  return h;
}
function renderReactions(reactions){
  if(!reactions||!reactions.length) return '';
  const counts={}; const mine=reactions.filter(r=>r.sender_number===me?.telefono||r.direction==='outgoing');
  for(const r of reactions){ counts[r.emoji]=(counts[r.emoji]||0)+1; }
  const mineSet=new Set(mine.map(r=>r.emoji));
  return '<div class="bub-reactions">'+Object.entries(counts).map(([emoji,cnt])=>`<span class="bub-reaction${mineSet.has(emoji)?' mine':''}" data-emoji="${esc(emoji)}">${emoji}${cnt>1?`<span class="r-count">${cnt}</span>`:''}</span>`).join('')+'</div>';
}
function msgInner(m){
  if(m.deleted_for_all){
    const byClient=m.deleted_by==='cliente';
    if(byClient){
      // Anti-delete: el cliente lo borró pero el CRM conserva el texto
      const original=m.body?`<div class="bub-antidelete">${esc(m.body)}</div>`:'';
      return `<div class="bub-deleted">🚫 El cliente eliminó este mensaje</div>${original}`;
    }
    return `<div class="bub-deleted">🚫 Mensaje eliminado${m.deleted_by?' · '+esc(m.deleted_by):''}</div>`;
  }
  if(m.deleted_for_sender) return '<div class="bub-deleted">Eliminaste este mensaje</div>';
  let quoteHTML='';
  if(m.reply_to_id && m.reply_to_body){ const icon=m.reply_to_media_type?{'image':'🖼️','video':'🎬','audio':'🎙️','document':'📄'}[m.reply_to_media_type]||'📎':''; const preview=icon+(m.reply_to_body||'').slice(0,80); const label=m.reply_to_direction!=='incoming'?'Tú':'Cliente'; quoteHTML=`<div class="bub-quote"><span>${esc(label)}</span>${esc(preview)}</div>`; }
  const starHTML=m.starred_at?'<span class="bub-star" style="font-size:10px;margin-left:4px;opacity:.85">⭐</span>':'';
  const transHTML=m.translated_body?`<div class="bub-translated" style="margin-top:5px;padding-top:5px;border-top:1px solid var(--border-soft);font-size:12.5px;font-style:italic;color:var(--text-2)"><span style="font-size:9.5px;font-style:normal;text-transform:uppercase;letter-spacing:.06em;color:var(--gold);display:block;margin-bottom:1px">Traducción</span>${esc(m.translated_body)}</div>`:'';
  if(m.media_type){
    let transcriptHTML='';
    if(m.media_type==='audio'){
      if(m.transcript){
        transcriptHTML=`<div class="audio-transcript" style="margin-top:5px;font-size:12px;color:var(--text-3);line-height:1.4"><span style="font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--gold);display:block;margin-bottom:1px">Transcripción</span>${esc(m.transcript)}</div>`;
      } else {
        transcriptHTML=`<button class="audio-transcribe-btn" data-transcribe="${m.id}" style="margin-top:5px;font-size:11px;color:var(--gold);background:none;border:none;padding:2px 0;display:flex;align-items:center;gap:4px;cursor:pointer">📝 Transcribir</button>`;
      }
    }
    return quoteHTML+renderMedia(m)+transcriptHTML+starHTML;
  }
  const body=m.body||''; const long=body.length>200;
  const content=long?`<span class="bub-body bub-body--trunc" data-full="${esc(body)}">${esc(body.slice(0,200))}<button class="bub__more">Ver más</button></span>`:`<span class="bub-body">${esc(body)}</span>`;
  return quoteHTML+content+starHTML+transHTML;
}
/* ════════ Link Preview ════════ */
function linkPreviews(){
  document.querySelectorAll('.bub .bub-body').forEach(el=>{
    if(el.dataset._lp) return; el.dataset._lp='1';
    const txt=el.textContent||'';
    const urlM=txt.match(/(https?:\/\/[^\s<>"]+)/gi);
    if(!urlM) return;
    const url=urlM[0];
    fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),credentials:'include'})
      .then(r=>r.json()).then(d=>{
        if(!d.ok||!d.og||!d.og.title) return;
        const wrap=el.closest('.msg-wrap');
        if(!wrap||wrap.querySelector('.link-preview')) return;
        const div=document.createElement('div'); div.className='link-preview';
        div.innerHTML=`${d.og.image?`<div class="lp-img"><img src="${esc(d.og.image)}" onerror="this.style.display='none'"></div>`:''}<div class="lp-body"><div class="lp-site">${esc(d.og.site_name||new URL(url).hostname)}</div><div class="lp-title">${esc(d.og.title)}</div>${d.og.description?`<div class="lp-desc">${esc(d.og.description)}</div>`:''}</div>`;
        div.onclick=()=>window.open(url,'_blank');
        el.after(div);
      }).catch(()=>{});
  });
}
function chkHTML(st,readAt){
  if(st==='queued') return '<span class="chk chk-queued" title="Sin conexión — se enviará solo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>';
  // 'pending' = ventana de 24h cerrada: el texto NO salió a WhatsApp, espera a que el
  // cliente conteste la plantilla. Marcarlo como enviado hacía creer que ya llegó.
  if(st==='pending') return '<span class="chk chk-pending" title="WhatsApp no permite enviarlo hasta que el cliente responda"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg> En espera</span>';
  // Meta rechazó el envío: antes caía al ✓ genérico de abajo y el asesor creía que el
  // cliente lo había recibido. El motivo en español va bajo la burbuja (ver .bub-fail
  // en msgsHTML) — este check solo avisa que hay que mirar ahí.
  if(st==='failed') return '<span class="chk chk-failed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 16.5v.01"/></svg> No entregado</span>';
  const visto=readAt?` <span class="chk-visto">Visto ${soloHora(readAt)}</span>`:'';
  if(st==='read') return `<span class="chk chk-read"><svg viewBox="0 0 22 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="17" height="10"><path d="M2 6l4 4L10 2"/><path d="M8 6l4 4L20 2"/></svg></span>${visto}`;
  if(st==='delivered') return `<span class="chk chk-delivered"><svg viewBox="0 0 22 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="17" height="10"><path d="M2 6l4 4L10 2"/><path d="M8 6l4 4L20 2"/></svg></span>`;
  return `<span class="chk chk-sent"><svg viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="14" height="10"><path d="M2 7l4 4L14 3"/></svg></span>`;
}
function renderMedia(m){
  if(m.media_type==='location'){
    let lat,lng,name,address;
    try{ const d=JSON.parse(m.body); lat=d.latitude; lng=d.longitude; name=d.name; address=d.address; }catch(e){ return '📍 Ubicación'; }
    const mapsUrl=`https://www.google.com/maps?q=${lat},${lng}`;
    const label=[name,address].filter(Boolean).join(' - ')||'Ubicación';
    const mapId='lm_'+((m.id||Math.random().toString(36).slice(2,8)));
    return `<div class="loc-card" onclick="window.open('${mapsUrl}','_blank')"><div class="leaflet-map" id="${mapId}" data-lat="${lat}" data-lng="${lng}"></div><div class="loc-body"><span class="loc-ic">📍</span><div class="loc-info"><div class="loc-tit">${esc(label)}</div><div class="loc-sub">${lat}, ${lng}</div></div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="flex-shrink:0;color:var(--gold)"><path d="M7 17l9.2-9.2M17 17V7H7"/></svg></div></div>`;
  }
  const src=m.id?`/api/media/${m.id}`:'';
  if(m.media_type==='image'||m.media_type==='sticker') return src?`<a class="img-tap" href="#" onclick="event.preventDefault();abrirLB('${src}')" data-msg="${m.id}"><img src="${src}" loading="lazy"></a>`:'🖼️ Imagen';
  if(m.media_type==='video') return src?`<video src="${src}" controls></video>`:'🎬 Video';
  if(m.media_type==='audio') return src?renderAudioPlayer(m.id,src):'🎙️ Audio';
  return `<a class="file" href="${src}" target="_blank">📄 ${esc(m.media_filename||'archivo')}</a>`;
}
// Leaflet lazy: solo se descarga (local, /vendor) la primera vez que hay un mapa en
// pantalla. La carga, el proveedor de teselas y los geocodificadores viven en
// /shared/mapa-base.js (window.SPMapa), compartidos con el panel admin — antes cada
// superficie tenía su propia copia y se fueron desincronizando.
const cargarLeaflet = (...a) => SPMapa.cargarLeaflet(...a);
async function initLocationMaps(){
  const els=document.querySelectorAll('.leaflet-map:not(.leaflet-container)');
  if(!els.length) return;
  let cfg;
  try{ await cargarLeaflet(); cfg=await SPMapa.getConfig(); }catch(e){ return; }
  els.forEach(el=>{
    const lat=parseFloat(el.dataset.lat); const lng=parseFloat(el.dataset.lng);
    if(isNaN(lat)||isNaN(lng)) return;
    try{
      const map=L.map(el,{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,touchZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false}).setView([lat,lng],15);
      SPMapa.capaTiles(cfg).addTo(map);
      L.marker([lat,lng]).addTo(map);
      setTimeout(()=>map.invalidateSize(),100);
    }catch(e){ console.error('Leaflet error:',e.message); }
  });
}
function generateWaveform(id){ let h=0; const s=String(id); for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } const b=[]; for(let i=0;i<20;i++){ b.push(Math.round(Math.abs(Math.sin(h*(i+1)*137.5))*18+4)); } return b; }
function formatDuration(s){ const m=Math.floor(s/60); const sec=Math.floor(s%60); return m+':'+(sec<10?'0':'')+sec; }
function togglePlay(id){ const btn=document.getElementById(id+'_btn'); const wave=document.getElementById(id+'_wave'); const timeEl=document.getElementById(id+'_time'); const errEl=document.getElementById(id+'_err'); const dlEl=document.getElementById(id+'_dl'); if(!btn||!wave) return; const container=btn.closest('.audio-player'); if(!container) return; const src=container.dataset.src; if(!src) return; Object.keys(_audioPlayers).forEach(k=>{ if(k!==id&&_audioPlayers[k]&&!_audioPlayers[k].paused){ _audioPlayers[k].pause(); const ob=document.getElementById(k+'_btn'); if(ob) ob.classList.remove('playing'); } }); if(_audioPlayers[id]){ if(!_audioPlayers[id].paused){ _audioPlayers[id].pause(); btn.classList.remove('playing'); return; } _audioPlayers[id].play().then(()=>btn.classList.add('playing')).catch(()=>{}); return; } if(errEl) errEl.style.display='none'; if(dlEl) dlEl.style.display='none'; const a=new Audio(); a.preload='auto'; a.src=src; a.playbackRate=Number(localStorage.getItem('sp_audio_rate'))||1; a.addEventListener('timeupdate',()=>{ if(a.duration){ const bars=wave.querySelectorAll('.audio-player__bar'); bars.forEach((bar,i)=>bar.classList.toggle('active',i<Math.floor((a.currentTime/a.duration)*bars.length))); } if(timeEl) timeEl.textContent=formatDuration(a.currentTime); }); a.addEventListener('ended',()=>{ btn.classList.remove('playing'); if(timeEl&&isFinite(a.duration)) timeEl.textContent=formatDuration(a.duration||0); wave.querySelectorAll('.audio-player__bar').forEach(b=>b.classList.remove('active')); }); a.addEventListener('loadedmetadata',()=>{ if(timeEl&&isFinite(a.duration)) timeEl.textContent=formatDuration(a.duration||0); }); a.addEventListener('error',()=>{ btn.classList.remove('playing'); delete _audioPlayers[id]; if(errEl) errEl.style.display='inline'; if(dlEl) dlEl.style.display='inline'; revealNativeAudio(id,false); if(typeof toast==='function') toast('No se pudo cargar el audio'); }); _audioPlayers[id]=a; a.play().then(()=>btn.classList.add('playing')).catch(()=>{ btn.classList.remove('playing'); delete _audioPlayers[id]; if(errEl) errEl.style.display='inline'; if(dlEl) dlEl.style.display='inline'; revealNativeAudio(id,true); if(typeof toast==='function') toast('Reproduciendo con el control nativo'); }); }
// Respaldo iOS/Safari: si el reproductor con onda falla, muestra el control <audio> nativo (que reproduce m4a de forma confiable).
function revealNativeAudio(id,tryPlay){ const nat=document.getElementById(id+'_native'); const cp=document.getElementById(id+'_cp'); if(!nat) return; nat.style.display='block'; if(cp) cp.style.display='none'; if(tryPlay){ try{ const pr=nat.play(); if(pr&&pr.catch) pr.catch(()=>{}); }catch(e){} } }
function renderAudioPlayer(id,src){ const bars=generateWaveform(id); return `<div class="audio-wrap" id="${id}_wrap"><div class="audio-player" id="${id}_cp" data-src="${src}" data-id="${id}"><button class="audio-player__btn" id="${id}_btn" onclick="togglePlay('${id}')"><svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21"/></svg></button><div class="audio-player__wave" id="${id}_wave">${bars.map(h=>`<div class="audio-player__bar" style="height:${h}px"></div>`).join('')}</div><span class="audio-player__time" id="${id}_time">0:00</span><button class="audio-player__rate" data-rate-btn onclick="cycleRate()" style="border:1px solid var(--gold-line);background:var(--gold-soft, rgba(200,164,90,.12));color:var(--gold);font-family:inherit;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;margin-left:6px;cursor:pointer">${(Number(localStorage.getItem('sp_audio_rate'))||1)}x</button><a href="${src}" target="_blank" download class="audio-player__dl" id="${id}_dl" style="display:none;font-size:13px;color:var(--gold);margin-left:6px;text-decoration:none" title="Descargar audio">⬇</a><span class="audio-player__err" id="${id}_err" style="display:none;font-size:10px;color:#ff5050;margin-left:4px">Error</span></div><audio id="${id}_native" controls preload="none" src="${src}" style="display:none;width:100%;max-width:240px;margin-top:6px"></audio></div>`; }
// Velocidad de reproducción de notas de voz: cicla 1x → 1.5x → 2x → 1x.
// Aplica a los players activos y persiste la preferencia para los siguientes.
function cycleRate(){
  const actual=Number(localStorage.getItem('sp_audio_rate'))||1;
  const nuevo=actual===1?1.5:actual===1.5?2:1;
  localStorage.setItem('sp_audio_rate', String(nuevo));
  Object.values(_audioPlayers).forEach(a=>{ try{ a.playbackRate=nuevo; }catch(e){} });
  document.querySelectorAll('[data-rate-btn]').forEach(b=>b.textContent=nuevo+'x');
  haptic(6);
}
// El script va envuelto en un IIFE, así que togglePlay no es global. El botón de audio usa onclick inline → hay que exponerla o el clic no hace nada.
window.togglePlay = togglePlay;
window.cycleRate = cycleRate;

// El cliente ve "escribiendo…" en su WhatsApp (Meta lo muestra 25s; throttle de 20s)
let _typingLast=0;
function notifyTyping(){
  if(!current) return;
  const v=($('#cInput')&&$('#cInput').value||'').trim(); if(!v) return;
  const now=Date.now(); if(now-_typingLast<20000) return;
  _typingLast=now;
  api(`/api/leads/${current.id}/typing`,{method:'POST'});
}

/* ════════ Borradores por chat (texto no enviado, estilo WhatsApp) ════════ */
function draftKey(id){ return 'sp_draft_'+id; }
function saveDraft(){ if(!current) return; const inp=$('#cInput'); if(!inp) return; const v=(inp.value||''); try{ if(v.trim()) localStorage.setItem(draftKey(current.id), v); else localStorage.removeItem(draftKey(current.id)); }catch(e){} }
function clearDraft(id){ try{ localStorage.removeItem(draftKey(id)); }catch(e){} }

async function enviar(){ const inp=$('#cInput'); const msg=(inp.value||'').trim(); if(!msg||!current||window._sending) return; window._sending=true; haptic([10,20,10]);
  clearDraft(current.id);
  const sendBtn=$('#cSend'); if(sendBtn) sendBtn.disabled=true;
  if(_editingMsg){
    // Modo edición
    const r=await api('/api/messages/'+_editingMsg,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:msg})});
    if(r){
      const d=await api(`/api/leads/${current.id}/mensajes`);
      if(d){ currentMsgs=d.mensajes; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); const b=$('#cMsgs'); b.scrollTop=b.scrollHeight; }
      toast('Mensaje editado');
    } else toast('Error al editar');
    cancelEdit(); inp.value=''; inp.style.height='auto'; updateSend(); cancelarReply(); window._sending=false; if(sendBtn) sendBtn.disabled=false; return;
  }
  if(DEMO){ currentMsgs.push({id:Date.now(),body:msg,direction:'outgoing',timestamp:new Date().toISOString()}); inp.value=''; inp.style.height='auto'; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); const b=$('#cMsgs'); b.scrollTop=b.scrollHeight; updateSend(); window._sending=false; if(sendBtn) sendBtn.disabled=false; return; }
  // Optimistic — mostrar mensaje inmediatamente
  const tempId = 'temp_'+Date.now();
  const tempMsg = {id:tempId,body:msg,direction:'outgoing',timestamp:new Date().toISOString()};
  currentMsgs.push(tempMsg);
  inp.value=''; inp.style.height='auto'; updateSend();
  $('#cMsgs').innerHTML=msgsHTML(currentMsgs); const b=$('#cMsgs'); b.scrollTop=b.scrollHeight;
  const body = replyTo ? {mensaje:msg, replyTo:replyTo.id} : {mensaje:msg};
  const r=await postOrQueue(`/api/leads/${current.id}/responder`, body, tempId, current.id);
  cancelarReply();
  // OJO: `queued` llega de dos sitios distintos. postOrQueue devuelve {queued:true} SIN
  // `ok` cuando no hay red; el servidor devuelve {ok:true, queued:true} cuando la ventana
  // de 24h está cerrada. Confundirlos mostraba "Sin conexión" con la señal perfecta.
  if(r && r.queued && !r.ok){
    // Sin red: el mensaje optimista se queda en pantalla marcado como pendiente,
    // se reintenta solo al volver la conexión (outboxFlush, evento 'online').
    tempMsg.status='queued';
    $('#cMsgs').innerHTML=msgsHTML(currentMsgs); b.scrollTop=b.scrollHeight;
    toast('Sin conexión — se enviará cuando vuelva la señal');
  } else if(r!==null){
    // Si el lead estaba archivado, moverlo de archivados a activos
    if(r.reopened){
      const idx=archivedLeads.findIndex(l=>l.id===current.id);
      if(idx>=0){
        const [reopenedLead]=archivedLeads.splice(idx,1);
        reopenedLead.status='asignado';
        leads.unshift(reopenedLead);
        archivadosCount=archivedLeads.length;
      }
      toast(r.queued?'Conversación reabierta — plantilla enviada, tu mensaje queda en espera':'Conversación reabierta');
    } else if(r.templateSent){
      toast('Pasaron más de 24 h: se envió la plantilla. Tu mensaje se enviará en cuanto el cliente responda.');
    }
    const d=await api(`/api/leads/${current.id}/mensajes`);
    if(d){ currentMsgs=d.mensajes; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); b.scrollTop=b.scrollHeight; }
    // La ventana pasó a cerrada justo ahora: refrescar el banner sin reabrir el chat.
    if(r.queued) checkWindowStatus(current.id);
    cargar();
  } else {
    // Falló — quitar mensaje optimista y restaurar texto
    currentMsgs = currentMsgs.filter(m => m.id !== tempId);
    inp.value = msg; inp.style.height='auto'; updateSend();
    $('#cMsgs').innerHTML=msgsHTML(currentMsgs); b.scrollTop=b.scrollHeight;
    toast('Error al enviar. Toca enviar para reintentar.');
  }
  window._sending=false; if(sendBtn) sendBtn.disabled=false;
}
function chatAccion(a){ haptic(10); const p=(current.customer_phone||'').replace(/[^\d+]/g,'');
  if(a==='call'){ if(current&&!esWhatsAppLead(current)){ toast('Llamadas no disponibles para este canal'); return; } llamarYRegistrar(p, current&&current.id); }
  else if(a==='tpl'){ abrirPlantillaMeta(); }
  else if(a==='search'){ const s=$('#cSearch'); if(s){ s.classList.toggle('show'); if(s.classList.contains('show')){ const i=$('#cSearchInput'); if(i){ i.focus(); i.value=''; } } else { const i=$('#cSearchInput'); if(i) i.value=''; if($('#cMsgs')) $('#cMsgs').innerHTML=msgsHTML(currentMsgs||[]); } } }
  else if(a==='more'){ abrirPerfil(); }
}

/* ════════ Bottom Sheets ════════ */
function openSheet(title,html){ $('#sheetTitle').textContent=title; $('#sheetBody').innerHTML=html; $('#sheetBg').classList.add('show'); $('#sheet').classList.add('show'); haptic(8); }
function closeSheet(){ $('#sheetBg').classList.remove('show'); $('#sheet').classList.remove('show'); }
// Arrastrar hacia abajo para cerrar — antes .sheet__grab era puramente decorativo (cero
// listeners de touch), la única forma de cerrar era el botón ✕ o tocar el fondo.
function wireSheetDrag(){
  const sheet=$('#sheet'); if(!sheet) return;
  const zonas=[sheet.querySelector('.sheet__grab'),sheet.querySelector('.sheet__head')].filter(Boolean);
  let startY=0, dy=0, dragging=false;
  const onStart=e=>{ startY=e.touches[0].clientY; dy=0; dragging=true; sheet.style.transition='none'; };
  const onMove=e=>{
    if(!dragging) return;
    dy=Math.max(0, e.touches[0].clientY-startY);
    sheet.style.transform=`translateY(${dy}px)`;
  };
  const onEnd=()=>{
    if(!dragging) return; dragging=false;
    if(dy>100){
      haptic(10);
      sheet.style.transition='transform .22s var(--ease)';
      sheet.style.transform='translateY(100%)';
      setTimeout(()=>{ $('#sheetBg').classList.remove('show'); sheet.classList.remove('show'); sheet.style.transition=''; sheet.style.transform=''; },220);
    } else {
      sheet.style.transition='transform .3s var(--spring)';
      sheet.style.transform='';
    }
  };
  zonas.forEach(el=>{
    el.addEventListener('touchstart',onStart,{passive:true});
    el.addEventListener('touchmove',onMove,{passive:true});
    el.addEventListener('touchend',onEnd);
    el.addEventListener('touchcancel',onEnd);
  });
}

const QUICK=[
  {t:'Saludo',body:'¡Hola! Soy tu asesor de Sergio Parra Inversiones & Finca Raíz. ¿En qué proyecto estás interesado? 😊'},
  {t:'Precio',body:'Con gusto te comparto precios y formas de pago. ¿Te muestro las opciones dentro de tu presupuesto?'},
  {t:'Ubicación',body:'Te comparto la ubicación exacta del proyecto. ¿Deseas el punto en el mapa?'},
  {t:'Agenda',body:'¿Te gustaría agendar una visita? Cuéntame qué día y hora te conviene. 📅'},
  {t:'Financiación',body:'Manejamos financiación directa y con aliados. ¿Te calculo una cuota según tu inicial?'},
  {t:'Catálogo',body:'Te envío el catálogo con lotes disponibles. ¿Para vivienda o inversión?'},
  {t:'Despedida',body:'¡Gracias por tu tiempo! Quedo atento a cualquier duda. 🙌'},
];

function abrirAdjuntos(){
  const items=[...(current&&esWhatsAppLead(current)?[['metaTpl','Plantilla Meta',SVG.megaphone]]:[]),['camera','Cámara',SVG.image],['image','Imagen',SVG.image],['video','Video',SVG.video],['audio','Audio',SVG.mic||SVG.megaphone],['proyecto','Proyecto',SVG.building],['sticker','Sticker',SVG.smile],['file','Documento',SVG.file],['location','Ubicación',SVG.mapPin],['tpl','Plantilla',SVG.zap],['clock','Programar',SVG.clock],['ia','Copiloto',SVG.sparkles]];
  openSheet('Adjuntar', `<div class="att-grid">${items.map(([k,l,ic])=>`<button class="att-i" data-att="${k}"><span class="ic">${I(ic,24)}</span>${l}</button>`).join('')}</div>`);
  $('#sheetBody').querySelectorAll('.att-i').forEach(b=>b.onclick=()=>{ haptic(10); const k=b.dataset.att; closeSheet(); if(k==='tpl') abrirPlantillas(); else if(k==='metaTpl') abrirPlantillaMeta(); else if(k==='sticker') abrirStickers(); else if(k==='ia') abrirCopiloto(); else if(k==='clock') abrirProgramar(); else if(k==='camera') tomarFotoNativa(); else if(k==='proyecto') abrirCompartirProyecto(); else if(k==='image'){ const fi=$('#fileInput'); if(fi){ fi.removeAttribute('capture'); fi.accept='image/*'; fi.click(); } } else if(k==='video'){ const fi=$('#fileInput'); if(fi){ fi.removeAttribute('capture'); fi.accept='video/*'; fi.click(); } } else if(k==='audio'){ const fi=$('#fileInput'); if(fi){ fi.removeAttribute('capture'); fi.accept='audio/*'; fi.click(); } } else if(k==='file'){ const fi=$('#fileInput'); if(fi){ fi.removeAttribute('capture'); fi.accept='.pdf,.doc,.docx,.xls,.xlsx,.txt'; fi.click(); } } else if(k==='location') abrirEnviarUbicacion(); else toast('Adjuntar '+b.textContent+' — próximamente'); });
}

// Compartir una ficha de proyecto/lote directo al chat (conecta el catálogo con la venta)
async function abrirCompartirProyecto(){
  if(!current){ toast('Selecciona un lead primero'); return; }
  const proyectos=await api('/api/proyectos');
  if(!proyectos||!proyectos.length){ toast('No hay proyectos cargados aún','err'); return; }
  const linkBase=(location.origin||'https://spcrm.duckdns.org');
  openSheet('Compartir proyecto', `
    <button id="shareCatalogoFull" class="lp-cell wide" style="display:flex;align-items:center;gap:12px;text-align:left;width:100%;padding:12px;background:var(--gold-soft,rgba(200,164,90,.12));border:1px solid var(--gold);border-radius:14px;color:var(--gold);margin-bottom:10px;font-weight:600">
      <span style="width:40px;height:40px;border-radius:12px;background:rgba(200,164,90,.18);display:grid;place-items:center;flex-shrink:0">${I(SVG.link||SVG.building,20)}</span>
      <span style="flex:1">Enviar catálogo completo<span style="display:block;font-size:12px;color:var(--text-3);font-weight:400">Link a todos los proyectos disponibles</span></span>
    </button>
    <div id="shareProjList" style="display:flex;flex-direction:column;gap:8px">${proyectos.map(p=>`
    <button class="lp-cell wide" data-sp="${p.id}" style="display:flex;align-items:center;gap:12px;text-align:left;width:100%;padding:12px;background:var(--bg-3);border:1px solid var(--border-soft);border-radius:14px;color:var(--text)">
      <span style="width:40px;height:40px;border-radius:12px;background:var(--gold-soft,rgba(200,164,90,.12));display:grid;place-items:center;color:var(--gold);flex-shrink:0">${I(SVG.building,20)}</span>
      <span style="flex:1;min-width:0"><span style="display:block;font-weight:600;font-size:14px">${esc(p.nombre)}</span><span style="display:block;font-size:12px;color:var(--text-3)">${esc(p.ciudad||p.ubicacion||'')} · ${p.disponibles||0} disponibles${p.precio_min?' · desde '+money(p.precio_min):''}</span></span>
    </button>`).join('')}</div>`);
  const btnFull=$('#shareCatalogoFull');
  if(btnFull) btnFull.onclick=()=>{
    haptic(10); closeSheet();
    const msg=`🏡 *Leons Group — Catálogo de lotes*\n\nMira nuestros proyectos disponibles con fotos, ubicación y precios aquí:\n${linkBase}/catalogo/\n\n¿Cuál te interesa? Con gusto te doy más detalles.`;
    const inp=$('#cInput'); if(inp){ inp.value=msg; inp.dispatchEvent(new Event('input')); }
    enviar();
  };
  $('#shareProjList').querySelectorAll('[data-sp]').forEach(b=>b.onclick=async()=>{
    const p=proyectos.find(x=>Number(x.id)===Number(b.dataset.sp)); if(!p) return;
    haptic(10); closeSheet();
    // Ficha en texto + link al catálogo público del proyecto (deep-link ?p=id)
    let msg=`🏡 *${p.nombre}*\n📍 ${p.ciudad||p.ubicacion||'Colombia'}`;
    if(p.precio_min) msg+=`\n💰 Lotes desde ${money(p.precio_min)}`;
    if(p.disponibles) msg+=`\n✅ ${p.disponibles} lotes disponibles`;
    if(p.descripcion) msg+=`\n\n${String(p.descripcion).slice(0,200)}`;
    msg+=`\n\n👉 Ver fotos y lotes: ${linkBase}/catalogo/p/${p.id}`;
    msg+=`\n\n¿Te gustaría más información o agendar una visita?`;
    const inp=$('#cInput'); if(inp){ inp.value=msg; inp.dispatchEvent(new Event('input')); }
    enviar();
  });
}

// Estado de la ventana de 24h de WhatsApp para el lead abierto — badge + CTA de reactivación
async function checkWindowStatus(leadId){
  const badge=$('#cWindowBadge'); if(!badge) return;
  if(current && !esWhatsAppLead(current)){ badge.style.display='none'; badge.innerHTML=''; return; }
  try{
    const st=await api(`/api/leads/${leadId}/window-status`);
    if(!st || st.open){ badge.style.display='none'; badge.innerHTML=''; return; }
    badge.style.display='flex';
    if(st.templateProblema){
      // Sin plantilla válida no sale NADA hacia este cliente: es un problema de
      // configuración que solo el admin puede resolver, no un fallo del asesor.
      badge.innerHTML=`<span>${I(SVG.clock,14)} Pasaron más de 24 h. ${esc(st.templateProblema)} Avisa al admin.</span>`;
      return;
    }
    badge.innerHTML=`<span>${I(SVG.clock,14)} Pasaron más de 24 h sin respuesta: WhatsApp solo permite enviarle una plantilla</span><button id="cReactivarBtn">Reactivar</button>`;
    const btn=$('#cReactivarBtn'); if(btn) btn.onclick=()=>abrirPlantillaMeta(st.templateName||null);
  }catch(e){ badge.style.display='none'; }
}

// Enviar una plantilla de WhatsApp aprobada por Meta al lead actual (primer contacto o
// reactivación post-24h) — siempre disponible, no solo cuando la ventana está cerrada.
// Paso 1: buscador + lista con el texto ya resuelto con los datos del lead.
async function abrirPlantillaMeta(prefillName){
  if(!current){ toast('Selecciona un lead primero'); return; }
  const leadId=current.id;
  let waTemplates=[], leadVars={};
  try{
    const [tpls, vars]=await Promise.all([api('/api/wa-templates'), api(`/api/leads/${leadId}/template-vars`)]);
    waTemplates=tpls||[]; leadVars=vars||{};
  }catch(e){}
  if(!waTemplates.length){ toast('No hay plantillas aprobadas. Pídele al admin que las cree en Plantillas de WhatsApp.','err'); return; }

  // Snippet local (sin ir al servidor por cada plantilla): sustituye {{ph}} con el
  // mapping guardado → variables ya resueltas del lead. Coherente con resolveTemplateValues.
  const snippetDe=(tpl)=>{
    let componentes=[]; try{ componentes=JSON.parse(tpl.componentes||'[]'); }catch(e){}
    const body=(componentes||[]).find(c=>c.type==='BODY');
    if(!body||!body.text) return '';
    let mapping={}; try{ mapping=JSON.parse(tpl.var_mapping||'{}'); }catch(e){}
    return body.text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,(m,k)=>{
      const clave=mapping[k]||k; const v=leadVars[clave];
      return (v!=null&&v!=='')?v:`[${k}]`;
    });
  };

  const renderLista=(filtro)=>{
    const f=(filtro||'').toLowerCase().trim();
    let lista=waTemplates.map(t=>({t,snippet:snippetDe(t)}));
    if(f) lista=lista.filter(({t,snippet})=>t.nombre.toLowerCase().includes(f)||snippet.toLowerCase().includes(f));
    if(prefillName) lista.sort((a,b)=>(b.t.nombre===prefillName?1:0)-(a.t.nombre===prefillName?1:0));
    if(!lista.length) return `<div style="padding:24px 8px;text-align:center;color:var(--text-3);font-size:13px">Ninguna plantilla coincide con la búsqueda.</div>`;
    return lista.map(({t,snippet})=>`
      <button class="lp-cell wide" data-tplid="${t.id}" style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;width:100%;padding:12px 14px;background:var(--bg-3);border:1px solid var(--border-soft);border-radius:14px;color:var(--text);margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;width:100%">
          <span style="font-weight:600;font-size:14px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.nombre)}</span>
          ${t.categoria?`<span style="font-size:10px;padding:2px 8px;border-radius:999px;background:var(--gold-soft,rgba(200,164,90,.12));color:var(--gold);flex-shrink:0">${esc(t.categoria)}</span>`:''}
        </div>
        <span style="font-size:12px;color:var(--text-3);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(snippet)}</span>
      </button>`).join('');
  };

  openSheet('Plantillas de WhatsApp', `
    <input id="mtSearch" placeholder="Buscar plantilla…" autocomplete="off" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:14px;font-family:inherit;outline:none;margin-bottom:10px">
    <div id="mtLista">${renderLista('')}</div>`);
  const wireLista=()=>{ $('#mtLista')?.querySelectorAll('[data-tplid]').forEach(b=>b.onclick=()=>abrirDetallePlantilla(Number(b.dataset.tplid), leadId, waTemplates)); };
  wireLista();
  const search=$('#mtSearch');
  if(search){ search.oninput=()=>{ const l=$('#mtLista'); if(l) l.innerHTML=renderLista(search.value); wireLista(); }; if(!prefillName) search.focus(); }
}

// Paso 2: detalle de una plantilla — burbuja estilo WhatsApp con el texto ya resuelto
// por el servidor (GET .../preview) + un input editable por variable, re-renderizando la
// burbuja en vivo. El envío queda deshabilitado mientras falte alguna variable, para no
// dejar que el asesor descubra el error recién al enviar (antes tiraba 400 variables_vacias).
async function abrirDetallePlantilla(templateId, leadId, waTemplates){
  haptic(8);
  const tpl=waTemplates.find(t=>Number(t.id)===Number(templateId));
  const preview=await api(`/api/wa-templates/${templateId}/preview?leadId=${leadId}`);
  if(!tpl||!preview){ toast('No se pudo cargar la plantilla','err'); return; }
  let componentes=[]; try{ componentes=JSON.parse(tpl.componentes||'[]'); }catch(e){}
  const headerC=componentes.find(c=>c.type==='HEADER');
  const bodyC=componentes.find(c=>c.type==='BODY');
  const footerC=componentes.find(c=>c.type==='FOOTER');
  const botonesC=componentes.find(c=>c.type==='BUTTONS');

  const valores={}; (preview.variables||[]).forEach(v=>{ valores[v.ph]=v.valor||''; });

  const sustituir=(txt)=>String(txt||'').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,(m,k)=>{
    const v=valores[k];
    return v?esc(v):`<span style="color:#ffb4b4">{{${esc(k)}}}</span>`;
  });

  const pintarBurbuja=()=>{
    const box=$('#mtBubble'); if(!box) return;
    box.innerHTML=`${headerC&&headerC.format==='TEXT'?`<div style="font-weight:700;margin-bottom:4px">${sustituir(headerC.text)}</div>`:''}
      <div style="white-space:pre-wrap">${sustituir(bodyC&&bodyC.text)}</div>
      ${footerC?`<div style="opacity:.7;font-size:11px;margin-top:6px">${esc(footerC.text)}</div>`:''}
      ${botonesC?`<div style="border-top:1px solid rgba(255,255,255,.25);margin-top:8px;padding-top:6px;display:flex;flex-direction:column;gap:4px">${(botonesC.buttons||[]).map(b=>`<div style="text-align:center;font-size:12.5px;color:#53bdeb">${esc(b.text)}</div>`).join('')}</div>`:''}`;
  };

  const actualizarBotonEnviar=()=>{
    const btn=$('#mtEnviarBtn'); if(!btn) return;
    const faltan=(preview.variables||[]).some(v=>!valores[v.ph]||!String(valores[v.ph]).trim());
    btn.disabled=faltan; btn.style.opacity=faltan?'.5':'1';
  };

  const camposHtml=(preview.variables||[]).map(v=>`
    <div style="margin-bottom:10px">
      <label style="font-size:11px;color:var(--text-3);display:block;margin-bottom:4px">${esc(v.label)}</label>
      <input type="text" data-var="${esc(v.ph)}" value="${esc(v.valor||'')}" placeholder="Completa este dato" style="width:100%;padding:11px 13px;border-radius:11px;border:1px solid ${v.valor?'var(--border)':'var(--gold,#c8a45a)'};background:var(--bg-3);color:var(--text);font-size:14px;font-family:inherit;outline:none">
    </div>`).join('') || `<div style="font-size:12px;color:var(--text-3);margin-bottom:10px">Esta plantilla no tiene variables.</div>`;

  openSheet(tpl.nombre, `
    <div id="mtBubble" style="background:#005c4b;color:#fff;border-radius:12px 12px 12px 2px;padding:11px 13px;font-size:13.5px;line-height:1.45;margin-bottom:16px"></div>
    <div id="mtCampos">${camposHtml}</div>
    <button id="mtBackBtn" type="button" style="background:none;border:none;color:var(--text-3);font-size:13px;padding:6px 0;text-align:left;font-family:inherit">← Elegir otra plantilla</button>
    <button id="mtEnviarBtn" class="cop-use" style="margin-top:8px;width:100%">${I(SVG.send,16)} Enviar plantilla</button>`);

  pintarBurbuja();
  actualizarBotonEnviar();

  $('#mtCampos')?.querySelectorAll('[data-var]').forEach(inp=>{
    inp.oninput=()=>{ valores[inp.dataset.var]=inp.value; inp.style.borderColor=inp.value.trim()?'var(--border)':'var(--gold,#c8a45a)'; pintarBurbuja(); actualizarBotonEnviar(); };
  });
  const backBtn=$('#mtBackBtn'); if(backBtn) backBtn.onclick=()=>abrirPlantillaMeta();

  const enviarBtn=$('#mtEnviarBtn');
  if(enviarBtn) enviarBtn.onclick=async()=>{
    if(window._sending||enviarBtn.disabled) return;
    const overrides={...valores};
    window._sending=true;
    haptic(10); closeSheet(); toast('Enviando plantilla…');
    try{
      const r=await apiDetailed(`/api/leads/${leadId}/enviar-template`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({templateId,overrides})});
      if(r&&r.ok){
        toast('Plantilla enviada');
        const d=await api(`/api/leads/${leadId}/mensajes`);
        if(d&&current&&current.id===leadId){ currentMsgs=d.mensajes||[]; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); const b=$('#cMsgs'); if(b) b.scrollTop=b.scrollHeight; }
        cargar();
        if(current&&current.id===leadId) checkWindowStatus(leadId);
      } else {
        const errMsg=(r&&r.detalle)||(r&&r.error)||'Error desconocido';
        toast('Error: '+errMsg,'err');
      }
    }catch(e){ toast('Error de conexión','err'); }
    finally{ window._sending=false; }
  };
}
// Reverse geocoding con manejo de error visible (antes se tragaba silenciosamente).
// La implementación (Mapbox si hay token, Nominatim si no) vive en SPMapa; aquí solo se
// adapta el nombre de los campos al que ya usaba el picker de este archivo.
async function reverseGeocodeUbic(lat,lng){
  const g = await SPMapa.geocodInverso(lat,lng);
  return { name: g.nombre || (g.direccion ? g.direccion.split(',')[0] : ''), address: g.direccion || '' };
}

/* ════════ Compartir ubicación durante la jornada ════════
   El asesor acepta UNA vez un aviso que explica qué se comparte y con quién; a partir
   de ahí, mientras tenga la app abierta, el panel manda su posición cada 90 s y solo
   si se movió más de 40 m (batería, datos y una tabla que no se llena de puntos
   idénticos). Al pasar a segundo plano se detiene: el WebView pierde el GPS de todos
   modos, así que es mejor pararlo explícitamente que fingir que sigue vivo.

   Importante: el aviso NO reemplaza al permiso del sistema. Son dos cosas — el aviso
   es el consentimiento que queda registrado en el servidor (sin él, el backend rechaza
   las posiciones); el permiso del sistema es lo que deja al navegador leer el GPS. */
const UBIC_INTERVALO_MS = 90 * 1000;
const UBIC_DISTANCIA_MIN_M = 40;
const UBIC_AVISO_KEY = 'sp_ubicacion_aviso_v1';
let _ubicTimer = null, _ubicUltima = null, _ubicUltimoEnvio = null, _ubicActiva = false;
let _ubicAppListener = null;   // handle del listener de Capacitor, para poder quitarlo

// Distancia en metros entre dos puntos (Haversine). Se usa para decidir si vale la
// pena mandar una posición nueva o el asesor sigue prácticamente donde estaba.
function distanciaMetros(a, b){
  if(!a || !b) return Infinity;
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function nivelBateria(){
  try{
    if(navigator.getBattery){ const b = await navigator.getBattery(); return Math.round(b.level * 100); }
  }catch(e){}
  return null;
}

async function initUbicacionJornada(){
  const estado = await api('/api/me/consentimiento-ubicacion');
  if(estado && estado.consentido){ arrancarRastreo(); return; }
  // Aviso una sola vez por dispositivo: si el asesor lo cerró sin aceptar, no se le
  // vuelve a insistir en cada arranque.
  try{ if(localStorage.getItem(UBIC_AVISO_KEY)) return; }catch(e){}
  setTimeout(mostrarAvisoUbicacion, 4000); // que no compita con el splash ni con el push
}

function mostrarAvisoUbicacion(){
  openSheet('Compartir tu ubicación', `
    <div style="font-size:13.5px;line-height:1.65;color:var(--text-2)">
      <p style="margin:0 0 10px">Para coordinar visitas y repartir los clientes por cercanía, Leons Group necesita ver tu ubicación <b>mientras trabajas con la app abierta</b>.</p>
      <ul style="margin:0 0 10px;padding-left:18px">
        <li>Se comparte tu posición aproximada cada pocos minutos.</li>
        <li>La ven solo la administración y los jefes, nunca los clientes.</li>
        <li>Al cerrar o minimizar la app, deja de compartirse.</li>
        <li>El recorrido se guarda 30 días y luego se borra solo.</li>
      </ul>
      <p style="margin:0 0 14px">Puedes retirar el permiso cuando quieras desde <b>Perfil → Compartir ubicación</b>.</p>
      <button id="ubicAceptar" style="width:100%;height:48px;border-radius:14px;border:none;background:var(--gold);color:#0A0A0A;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">Aceptar y compartir</button>
      <button id="ubicAhoraNo" style="width:100%;height:44px;margin-top:8px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:14px;cursor:pointer;font-family:inherit">Ahora no</button>
    </div>`);
  const ac = document.getElementById('ubicAceptar');
  if(ac) ac.onclick = async () => {
    try{ localStorage.setItem(UBIC_AVISO_KEY, '1'); }catch(e){}
    const r = await api('/api/me/consentimiento-ubicacion', { method:'POST' });
    closeSheet();
    if(!r){ toast('No se pudo guardar tu respuesta','err'); return; }
    toast('Gracias — ya estás compartiendo tu ubicación');
    arrancarRastreo();
  };
  const no = document.getElementById('ubicAhoraNo');
  if(no) no.onclick = () => { try{ localStorage.setItem(UBIC_AVISO_KEY, '1'); }catch(e){} closeSheet(); };
}

async function enviarPosicionActual(){
  try{
    const pos = await obtenerPosicionActual();
    const punto = { lat: pos.latitude, lng: pos.longitude };
    // Filtro de movimiento: si sigue donde estaba, no se manda nada (salvo el primer
    // envío, que sí interesa para que aparezca en el mapa apenas abre la app).
    if(_ubicUltimoEnvio && distanciaMetros(_ubicUltimoEnvio, punto) < UBIC_DISTANCIA_MIN_M) return;
    const r = await api('/api/mi-ubicacion', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ...punto, precision: pos.accuracy || null, bateria: await nivelBateria() }),
    });
    if(r){
      _ubicUltimoEnvio = punto; _ubicUltima = Date.now(); actualizarIndicadorUbicacion();
      // Si el asesor está mirando el mapa, su punto se mueve solo: enterarse de que hay
      // que salir y volver al tab para verse actualizado sería una mala sorpresa.
      if(tab === 'mapa' && _mapaTab) pintarMiRecorrido(fechaMapaSeleccionada());
    }
    else if(api.lastStatus === 403){ detenerRastreo(); } // consentimiento revocado en el servidor
  }catch(e){
    // Permiso del sistema denegado o GPS sin señal: se reintenta en el próximo ciclo,
    // sin molestar al asesor con un toast cada 90 segundos.
    console.warn('[UBICACION]', e.message);
  }
}

function arrancarRastreo(){
  if(_ubicTimer) return;
  _ubicActiva = true;
  enviarPosicionActual();
  _ubicTimer = setInterval(enviarPosicionActual, UBIC_INTERVALO_MS);
  // En segundo plano el WebView pierde el GPS: se para el ciclo y se retoma al volver.
  document.addEventListener('visibilitychange', onVisibilidadUbicacion);
  if(esNativo() && !_ubicAppListener){
    try{
      const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if(App && typeof App.addListener === 'function'){
        // Se guarda el handle: sin esto, cada ciclo activar→desactivar→activar dejaba un
        // listener más colgando, y todos seguían llamando a pausar/reanudarRastreo.
        _ubicAppListener = App.addListener('appStateChange', ({ isActive }) => { if(isActive) reanudarRastreo(); else pausarRastreo(); });
      }
    }catch(e){}
  }
  actualizarIndicadorUbicacion();
}

function onVisibilidadUbicacion(){ document.hidden ? pausarRastreo() : reanudarRastreo(); }
function pausarRastreo(){ if(_ubicTimer){ clearInterval(_ubicTimer); _ubicTimer = null; } actualizarIndicadorUbicacion(); }
function reanudarRastreo(){ if(!_ubicActiva || _ubicTimer) return; enviarPosicionActual(); _ubicTimer = setInterval(enviarPosicionActual, UBIC_INTERVALO_MS); actualizarIndicadorUbicacion(); }
function detenerRastreo(){
  _ubicActiva = false;
  if(_ubicTimer){ clearInterval(_ubicTimer); _ubicTimer = null; }
  document.removeEventListener('visibilitychange', onVisibilidadUbicacion);
  if(_ubicAppListener){
    // El handle de Capacitor puede llegar como promesa según versión del plugin.
    try{ Promise.resolve(_ubicAppListener).then(h => h && h.remove && h.remove()).catch(()=>{}); }catch(e){}
    _ubicAppListener = null;
  }
  actualizarIndicadorUbicacion();
}

// El asesor tiene que ver siempre que está compartiendo, no descubrirlo.
function actualizarIndicadorUbicacion(){
  const el = document.getElementById('ubicEstado');
  if(!el) return;
  if(!_ubicActiva){ el.textContent = 'Desactivado'; el.style.color = 'var(--text-3)'; return; }
  if(!_ubicTimer){ el.textContent = 'En pausa (app en segundo plano)'; el.style.color = 'var(--text-3)'; return; }
  el.textContent = _ubicUltima ? 'Compartiendo · ' + horaCorta(new Date(_ubicUltima).toISOString()) : 'Compartiendo';
  el.style.color = '#4E7B46';
}

/* ════════════════════════ MAPA DEL ASESOR (tab) ════════════════════════
   El mapa de trabajo del asesor: dónde está él, por dónde anduvo hoy, dónde están sus
   clientes, los proyectos de la empresa y sus puntos guardados. Tocar un cliente abre su
   chat, lo llama o lanza la navegación — que es la razón de tener un mapa y no una lista.

   Reemplaza a la vieja pantalla "Mi mapa" (solo lectura, escondida en Perfil), que además
   nunca destruía su instancia de Leaflet al cerrarse.

   Ciclo de vida: mostrarLista() destruye #tabScreen en CADA cambio de tab, así que el
   mapa se recrea al entrar (cuesta ~10 ms; las teselas ya están en caché) y lo que se
   conserva entre visitas es el ESTADO, que es lo que el asesor percibe: encuadre, capas
   activas y filtro de etapas. */

const MAPA_CAPAS_KEY = 'sp_mapa_capas_v1';
let _mapaTab = null, _mapaTabRO = null, _mapaTabBase = null, _mapaTabCluster = null;
let _mapaTabVista = null;              // {center, zoom} — sobrevive al cambio de tab
let _mapaTabYo = null;                 // capa de "mi posición + recorrido"
let _mapaTabCapasG = {};               // nombre -> L.layerGroup
let _mapaTabDatos = { clientes: [], guardadas: [], proyectos: [], zonas: [] };
let _mapaTabSel = null;                // pin seleccionado (para la ficha inferior)
let _mapaTabEtapas = null;             // Set de etapas visibles; null = todas
let _mapaTabCapas = { clientes: true, guardadas: true, proyectos: true, zonas: false };
try { Object.assign(_mapaTabCapas, JSON.parse(localStorage.getItem(MAPA_CAPAS_KEY) || '{}')); } catch (e) {}

function guardarCapasMapa(){ try{ localStorage.setItem(MAPA_CAPAS_KEY, JSON.stringify(_mapaTabCapas)); }catch(e){} }

function plantillaMapaTab(){
  const hoy = SPMapa.hoyBogota();
  return `
    <div id="mapaLienzoM" style="position:absolute;inset:0;background:var(--bg-3)"></div>

    <div style="position:absolute;top:10px;left:10px;right:10px;z-index:500;display:flex;flex-direction:column;gap:8px;pointer-events:none">
      <div style="position:relative;pointer-events:auto">
        <input id="mapaBuscar" placeholder="Buscar cliente, lugar o ciudad…" autocomplete="off"
          style="width:100%;height:42px;border-radius:14px;border:1px solid var(--glass-border);background:var(--bg-2);color:var(--text);padding:0 14px;font-size:14px;font-family:inherit;box-shadow:0 4px 18px rgba(0,0,0,.4)">
        <div id="mapaResultados" style="display:none;position:absolute;top:46px;left:0;right:0;background:var(--bg-2);border:1px solid var(--border);border-radius:14px;overflow:hidden;max-height:46vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,.6)"></div>
      </div>
      <div id="mapaChips" style="display:flex;gap:6px;overflow-x:auto;pointer-events:auto;padding-bottom:2px;-webkit-overflow-scrolling:touch"></div>
    </div>

    <div style="position:absolute;right:10px;bottom:96px;z-index:500;display:flex;flex-direction:column;gap:8px">
      <button id="mapaCentrar" title="Centrar en mí" style="width:44px;height:44px;border-radius:50%;border:1px solid var(--glass-border);background:var(--bg-2);color:var(--gold);display:grid;place-items:center;box-shadow:0 4px 18px rgba(0,0,0,.45);cursor:pointer">${I(SVG.target,20)}</button>
      <button id="mapaOpciones" title="Capas y filtros" style="width:44px;height:44px;border-radius:50%;border:1px solid var(--glass-border);background:var(--bg-2);color:var(--text-2);display:grid;place-items:center;box-shadow:0 4px 18px rgba(0,0,0,.45);cursor:pointer">${I(SVG.filter,19)}</button>
    </div>

    <div id="mapaFechaWrap" style="position:absolute;left:10px;bottom:96px;z-index:500;display:none">
      <input type="date" id="mapaFecha" value="${hoy}" max="${hoy}"
        style="background:var(--bg-2);border:1px solid var(--glass-border);border-radius:12px;color:var(--text);padding:8px 10px;font-size:12px;font-family:inherit;box-shadow:0 4px 18px rgba(0,0,0,.45)">
    </div>

    <div id="mapaFicha" style="position:absolute;left:10px;right:10px;bottom:12px;z-index:600;display:none;
      background:var(--bg-2);border:1px solid var(--gold-line);border-radius:18px;padding:14px;box-shadow:0 -4px 40px rgba(0,0,0,.6)"></div>

    <div id="mapaEstado" style="position:absolute;left:0;right:0;bottom:12px;z-index:400;text-align:center;font-size:12px;color:var(--text-3);pointer-events:none"></div>`;
}

function estadoMapa(txt){ const e=document.getElementById('mapaEstado'); if(e) e.textContent=txt||''; }

async function montarMapaTab(){
  const el = document.getElementById('mapaLienzoM');
  if(!el) return;
  estadoMapa('Cargando mapa…');
  let cfg;
  try{ await cargarLeaflet(); cfg = await SPMapa.getConfig(); }
  catch(e){ estadoMapa('No se pudo cargar el mapa.'); return; }
  if(!document.getElementById('mapaLienzoM')) return;  // se cambió de tab mientras cargaba

  const vista = _mapaTabVista || { center: [4.7110,-74.0721], zoom: 6 };
  _mapaTab = L.map(el, { zoomControl:false, attributionControl:true }).setView(vista.center, vista.zoom);
  _mapaTabBase = SPMapa.capaTiles(cfg);
  _mapaTabBase.addTo(_mapaTab);
  _mapaTabCapasG = {};
  _mapaTabSel = null;

  // El contenedor mide 0 en el primer frame (el layout flex aún no resolvió), y Leaflet
  // pintaría un mapa de 0x0 —la tesela suelta en la esquina—. Doble rAF + observador de
  // tamaño, que además cubre el teclado, el giro y el cambio de safe-area.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ if(_mapaTab) _mapaTab.invalidateSize(); }));
  if(window.ResizeObserver){
    let t=null;
    _mapaTabRO = new ResizeObserver(()=>{ clearTimeout(t); t=setTimeout(()=>{ if(_mapaTab) _mapaTab.invalidateSize(); },80); });
    _mapaTabRO.observe(el);
  }

  _tabTeardown = destruirMapaTab;

  document.getElementById('mapaCentrar').onclick = centrarEnMi;
  document.getElementById('mapaOpciones').onclick = abrirOpcionesMapa;
  document.getElementById('mapaFecha').onchange = (e)=>pintarMiRecorrido(e.target.value);
  cablearBuscadorMapa();
  renderChipsMapa();

  await Promise.all([cargarCapaClientes(), cargarCapaGuardadas(), cargarCapaProyectos(), cargarCapaZonas()]);
  await pintarMiRecorrido(SPMapa.hoyBogota());

  // Solo se encuadra la primera vez: si el asesor ya movió el mapa, volver a encuadrar en
  // cada entrada al tab le quitaría el sitio que estaba mirando.
  if(!_mapaTabVista) encuadrarMapaTab();
  actualizarEstadoMapa();
}

function destruirMapaTab(){
  if(_mapaTabRO){ try{ _mapaTabRO.disconnect(); }catch(e){} _mapaTabRO=null; }
  if(_mapaTabCluster){ try{ _mapaTabCluster.destruir(); }catch(e){} _mapaTabCluster=null; }
  if(_mapaTab){
    try{ _mapaTabVista = { center:_mapaTab.getCenter(), zoom:_mapaTab.getZoom() }; }catch(e){}
    SPMapa.destruir(_mapaTab);
    _mapaTab=null;
  }
  _mapaTabCapasG={}; _mapaTabYo=null; _mapaTabBase=null; _mapaTabSel=null;
}

/* ── Capas ── */
function capaVisible(nombre){ return _mapaTabCapas[nombre] !== false; }

function ponerCapa(nombre, capa){
  if(_mapaTabCapasG[nombre]){ try{ _mapaTab.removeLayer(_mapaTabCapasG[nombre]); }catch(e){} }
  _mapaTabCapasG[nombre] = capa;
  if(capa && capaVisible(nombre)) capa.addTo(_mapaTab);
}

// Clientes del asesor. El backend ya fuerza que sean los suyos: aunque este panel pidiera
// los de otro, no se los daría.
async function cargarCapaClientes(){
  const r = await api('/api/mapa/leads?limit=500');
  _mapaTabDatos.clientes = (r && r.leads) || [];
  redibujarClientes();
}

function clientesVisibles(){
  return _mapaTabDatos.clientes.filter(l =>
    l.lat != null && (!_mapaTabEtapas || _mapaTabEtapas.has(l.etiqueta || 'sin_clasificar')));
}

function redibujarClientes(){
  if(!_mapaTab) return;
  if(_mapaTabCluster){ _mapaTabCluster.destruir(); _mapaTabCluster=null; }
  if(!capaVisible('clientes')) return;
  // Agrupación por rejilla: en una ciudad los clientes se apilan y el mapa se vuelve una
  // mancha de pines. Al acercar, los grupos se abren solos.
  _mapaTabCluster = SPMapa.agrupar(_mapaTab, clientesVisibles(), {
    crearPin: (l) => {
      const e = SPMapa.etapa(l.etiqueta);
      const aprox = l.coord_fuente !== 'ubicacion';
      return L.marker([l.lat,l.lng], { icon: SPMapa.pinPunto(e.color, { tam:16, punteado:aprox }) })
        .on('click', ()=>mostrarFichaCliente(l));
    },
  });
}

async function cargarCapaGuardadas(){
  const g = await api('/api/ubicaciones-guardadas') || [];
  _mapaTabDatos.guardadas = g;
  ponerCapa('guardadas', L.layerGroup(g.map(p =>
    L.marker([p.lat,p.lng], { icon: SPMapa.pinPunto(SPMapa.token('--gold2'), { tam:12 }) })
      .bindTooltip('📍 ' + esc(p.nombre||''), { direction:'top' }))));
}

async function cargarCapaProyectos(){
  const r = await api('/api/mapa/proyectos');
  const ps = (r && r.proyectos) || [];
  _mapaTabDatos.proyectos = ps;
  ponerCapa('proyectos', L.layerGroup(ps.map(p =>
    L.marker([p.lat,p.lng], { icon: SPMapa.pinPunto(SPMapa.token('--text'), { tam:18 }) })
      .on('click', ()=>mostrarFichaProyecto(p)))));
}

async function cargarCapaZonas(){
  const r = await api('/api/mapa/zonas');
  const zs = (r && r.zonas) || [];
  _mapaTabDatos.zonas = zs;
  const oro = SPMapa.token('--gold');
  ponerCapa('zonas', L.layerGroup(zs.map(z =>
    L.circle([z.centro_lat,z.centro_lng], {
      radius:(Number(z.radio_km)>0?Number(z.radio_km):10)*1000,
      color:oro, weight:1, fillColor:oro, fillOpacity:.06,
    }).bindTooltip(esc(z.nombre)))));
}

/* ── Mi posición y mi recorrido ── */
async function pintarMiRecorrido(fecha){
  if(!_mapaTab) return;
  if(_mapaTabYo){ try{ _mapaTab.removeLayer(_mapaTabYo); }catch(e){} _mapaTabYo=null; }
  const r = await api('/api/mi-recorrido?fecha=' + encodeURIComponent(fecha||SPMapa.hoyBogota()));
  const puntos = (r && r.puntos) || [];
  const capas = [];
  const oro = SPMapa.token('--gold'), verde = SPMapa.token('--green');
  if(puntos.length){
    const coords = puntos.map(p=>[p.lat,p.lng]);
    if(coords.length>1) capas.push(L.polyline(coords, { color:oro, weight:3, opacity:.75 }));
    coords.slice(0,-1).forEach((c,i)=>capas.push(
      L.circleMarker(c, { radius:3, color:oro, fillOpacity:1 }).bindTooltip(SPMapa.horaCorta(puntos[i].ts))));
    const ult = puntos[puntos.length-1];
    if(ult.precision) capas.push(L.circle([ult.lat,ult.lng], { radius:Number(ult.precision), color:verde, weight:1, fillColor:verde, fillOpacity:.10 }));
    capas.push(L.circleMarker([ult.lat,ult.lng], { radius:8, color:verde, fillColor:verde, fillOpacity:1, weight:2 })
      .bindTooltip('Tu última posición · ' + SPMapa.horaCorta(ult.ts), { direction:'top' }));
  }
  _mapaTabYo = L.layerGroup(capas).addTo(_mapaTab);
  actualizarEstadoMapa(puntos);
}

function actualizarEstadoMapa(puntos){
  const n = clientesVisibles().length;
  if(!_ubicActiva){
    estadoMapa(n ? `${n} ${n===1?'cliente':'clientes'} · tu ubicación está desactivada` : 'Tu ubicación está desactivada — actívala en Perfil');
    return;
  }
  if(puntos && !puntos.length){ estadoMapa(`${n} ${n===1?'cliente':'clientes'} · sin recorrido ese día`); return; }
  estadoMapa(n ? `${n} ${n===1?'cliente ubicado':'clientes ubicados'}` : 'Todavía ningún cliente tiene ubicación');
}

async function centrarEnMi(){
  haptic(8);
  estadoMapa('Buscando tu ubicación…');
  try{
    const pos = await obtenerPosicionActual();
    if(_mapaTab) _mapaTab.setView([pos.latitude,pos.longitude], 16);
    // Se aprovecha el GPS recién obtenido para refrescar el punto en el servidor, en vez
    // de esperar al siguiente ciclo de 90 s del rastreo.
    if(_ubicActiva) enviarPosicionActual().then(()=>pintarMiRecorrido(fechaMapaSeleccionada()));
    else actualizarEstadoMapa();
  }catch(e){
    toast(/denegado|denied/i.test(e && e.message || '') ? 'Activa el permiso de ubicación en Ajustes' : 'No se pudo obtener el GPS','err');
    actualizarEstadoMapa();
  }
}

function fechaMapaSeleccionada(){
  const f = document.getElementById('mapaFecha');
  return (f && f.value) || SPMapa.hoyBogota();
}

function encuadrarMapaTab(){
  if(!_mapaTab) return;
  const pts = [
    ...clientesVisibles().map(l=>[l.lat,l.lng]),
    ..._mapaTabDatos.guardadas.map(g=>[g.lat,g.lng]),
  ];
  if(!pts.length) return;
  const b = L.latLngBounds(pts);
  if(b.isValid()) _mapaTab.fitBounds(b.pad(0.25), { maxZoom:15 });
}

/* ── Fichas (tarjeta inferior, no popup: en móvil el popup tapa el mapa) ── */
function cerrarFichaMapa(){
  const f = document.getElementById('mapaFicha');
  if(f){ f.style.display='none'; f.innerHTML=''; }
  _mapaTabSel = null;
}

function distanciaAMi(lat,lng){
  if(!_ubicUltimoEnvio) return '';
  return SPMapa.distanciaLegible(SPMapa.distanciaMetros(_ubicUltimoEnvio, { lat, lng }));
}

function mostrarFichaCliente(l){
  haptic(8);
  _mapaTabSel = l;
  const f = document.getElementById('mapaFicha');
  if(!f) return;
  const e = SPMapa.etapa(l.etiqueta);
  const dist = distanciaAMi(l.lat,l.lng);
  const aprox = l.coord_fuente !== 'ubicacion';
  const tel = String(l.customer_phone||'').replace(/[^\d+]/g,'');
  f.style.display='block';
  f.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px">
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.customer_name||'Cliente')}</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:2px">
          <span style="color:${e.color}">● ${esc(e.label)}</span>${l.ciudad?' · '+esc(l.ciudad):''}${dist?' · a '+dist:''}
        </div>
        <div style="font-size:11px;color:var(--text-3);margin-top:3px">${aprox?'Ubicación aproximada (su ciudad)':'Ubicación exacta que compartió'}</div>
      </div>
      <button id="fichaX" style="background:none;border:none;color:var(--text-3);cursor:pointer;padding:2px">${I(SVG.x,18)}</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      <button id="fichaChat" class="mapa-accion">${I(SVG.chat,17)}<span>Chat</span></button>
      ${tel?`<a href="tel:${esc(tel)}" class="mapa-accion">${I(SVG.phone,17)}<span>Llamar</span></a>`:''}
      <button id="fichaIr" class="mapa-accion">${I(SVG.mapPin,17)}<span>Cómo llegar</span></button>
    </div>`;
  document.getElementById('fichaX').onclick = cerrarFichaMapa;
  document.getElementById('fichaChat').onclick = ()=>abrirChat(l.id);
  document.getElementById('fichaIr').onclick = ()=>menuNavegacion(l.lat,l.lng,l.customer_name||'Cliente');
}

function mostrarFichaProyecto(p){
  haptic(8);
  const f = document.getElementById('mapaFicha');
  if(!f) return;
  const dist = distanciaAMi(p.lat,p.lng);
  f.style.display='block';
  f.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px">
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:600">${esc(p.nombre)}</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:2px">${esc(p.ciudad||'')}${p.departamento?', '+esc(p.departamento):''}${dist?' · a '+dist:''}</div>
      </div>
      <button id="fichaX" style="background:none;border:none;color:var(--text-3);cursor:pointer;padding:2px">${I(SVG.x,18)}</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <button id="fichaIr" class="mapa-accion">${I(SVG.mapPin,17)}<span>Cómo llegar</span></button>
    </div>`;
  document.getElementById('fichaX').onclick = cerrarFichaMapa;
  document.getElementById('fichaIr').onclick = ()=>menuNavegacion(p.lat,p.lng,p.nombre);
}

// Waze o Google Maps: se pregunta en vez de imponer, porque en Colombia el reparto entre
// las dos apps está muy repartido y adivinar mal cuesta un toque extra cada vez.
function menuNavegacion(lat,lng,label){
  openSheet('Cómo llegar', `<div style="display:grid;gap:8px;padding:4px 0">
    <button data-nav="google" class="mapa-nav-btn">Google Maps</button>
    <button data-nav="waze" class="mapa-nav-btn">Waze</button>
  </div>`);
  $('#sheetBody').querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{
    closeSheet();
    SPMapa.abrirNavegacion(lat,lng,label,b.dataset.nav);
  });
}

/* ── Chips de capa y hoja de opciones ── */
const CAPAS_MAPA = [['clientes','Clientes'],['guardadas','Guardados'],['proyectos','Proyectos'],['zonas','Zonas']];

function renderChipsMapa(){
  const c = document.getElementById('mapaChips');
  if(!c) return;
  c.innerHTML = CAPAS_MAPA.map(([k,l])=>{
    const on = capaVisible(k);
    return `<button data-capa="${k}" style="flex:none;height:30px;padding:0 12px;border-radius:999px;font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap;
      border:1px solid ${on?'var(--gold-line)':'var(--border)'};background:${on?'var(--gold-soft)':'var(--bg-2)'};color:${on?'var(--gold)':'var(--text-3)'}">${l}</button>`;
  }).join('');
  c.querySelectorAll('[data-capa]').forEach(b=>b.onclick=()=>alternarCapaMapa(b.dataset.capa));
}

function alternarCapaMapa(nombre){
  haptic(6);
  _mapaTabCapas[nombre] = !capaVisible(nombre);
  guardarCapasMapa();
  if(nombre==='clientes'){ redibujarClientes(); }
  else {
    const capa=_mapaTabCapasG[nombre];
    if(capa){ if(capaVisible(nombre)) capa.addTo(_mapaTab); else _mapaTab.removeLayer(capa); }
  }
  renderChipsMapa();
  actualizarEstadoMapa();
}

function abrirOpcionesMapa(){
  haptic(8);
  const etapas = SPMapa.etapasDisponibles();
  openSheet('Capas y filtros', `
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:8px">Etapa del cliente</div>
    <div id="mapaEtapas" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
      ${etapas.map(e=>{
        const on = !_mapaTabEtapas || _mapaTabEtapas.has(e.clave);
        return `<button data-etapa="${e.clave}" style="height:32px;padding:0 12px;border-radius:999px;font-size:12px;font-family:inherit;cursor:pointer;
          border:1px solid ${on?e.color:'var(--border)'};background:${on?'var(--bg-3)':'var(--bg-2)'};color:${on?e.color:'var(--text-3)'}">${e.label}</button>`;
      }).join('')}
    </div>
    <button id="mapaEtapasTodas" style="width:100%;height:38px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:13px;font-family:inherit;cursor:pointer;margin-bottom:16px">Ver todas las etapas</button>

    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:8px">Recorrido</div>
    <button id="mapaVerRecorrido" style="width:100%;height:42px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:14px;font-family:inherit;cursor:pointer;margin-bottom:16px">Elegir día del recorrido</button>

    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:8px">Sin señal</div>
    <button id="mapaDescargar" style="width:100%;height:42px;border-radius:12px;border:1px solid var(--gold-line);background:var(--gold-soft);color:var(--gold);font-size:14px;font-weight:600;font-family:inherit;cursor:pointer">Descargar esta zona del mapa</button>
    <div style="font-size:11.5px;color:var(--text-3);margin-top:8px;line-height:1.5">Guarda en el celular lo que estás viendo, para que el mapa siga funcionando donde no hay datos.</div>`);

  $('#sheetBody').querySelectorAll('[data-etapa]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.etapa;
    if(!_mapaTabEtapas) _mapaTabEtapas = new Set(SPMapa.etapasDisponibles().map(e=>e.clave));
    if(_mapaTabEtapas.has(k)) _mapaTabEtapas.delete(k); else _mapaTabEtapas.add(k);
    // Quedarse sin ninguna etapa marcada dejaría el mapa vacío sin explicación: equivale
    // a no filtrar.
    if(!_mapaTabEtapas.size) _mapaTabEtapas = null;
    redibujarClientes(); actualizarEstadoMapa(); closeSheet(); abrirOpcionesMapa();
  });
  document.getElementById('mapaEtapasTodas').onclick = ()=>{ _mapaTabEtapas=null; redibujarClientes(); actualizarEstadoMapa(); closeSheet(); };
  document.getElementById('mapaVerRecorrido').onclick = ()=>{
    closeSheet();
    const w=document.getElementById('mapaFechaWrap');
    if(w){ w.style.display='block'; const f=document.getElementById('mapaFecha'); if(f&&f.showPicker) try{ f.showPicker(); }catch(e){} }
  };
  document.getElementById('mapaDescargar').onclick = ()=>{ closeSheet(); descargarZonaMapa(); };
}

/* ── Buscador: mezcla clientes propios con lugares del mundo ── */
function cablearBuscadorMapa(){
  const input = document.getElementById('mapaBuscar');
  const box = document.getElementById('mapaResultados');
  if(!input || !box) return;
  let t=null;
  const fila = (icono,titulo,sub,attrs) => `<button ${attrs} style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;background:none;border:none;border-bottom:1px solid var(--border-soft);color:var(--text);cursor:pointer;text-align:left;font-family:inherit">
    <span style="flex:none">${icono}</span><span style="flex:1;min-width:0">
      <span style="display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${titulo}</span>
      ${sub?`<span style="display:block;font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</span>`:''}
    </span></button>`;

  input.oninput = ()=>{
    clearTimeout(t);
    const q = input.value.trim();
    if(q.length < 2){ box.style.display='none'; return; }
    // Los clientes propios se filtran en memoria y salen al instante; los lugares del
    // geocodificador van con retardo para no disparar una petición por tecla.
    const propios = _mapaTabDatos.clientes
      .filter(l => (l.customer_name||'').toLowerCase().includes(q.toLowerCase()) || String(l.customer_phone||'').includes(q))
      .slice(0,5);
    box.innerHTML = propios.map((l,i)=>fila('👤', esc(l.customer_name||'Cliente'), esc(l.ciudad||''), `data-cli="${i}"`)).join('')
      || '<div style="padding:10px 12px;font-size:12px;color:var(--text-3)">Buscando lugares…</div>';
    box.style.display='block';
    box.querySelectorAll('[data-cli]').forEach(b=>b.onclick=()=>{
      const l=propios[Number(b.dataset.cli)];
      box.style.display='none'; input.blur();
      _mapaTab.setView([l.lat,l.lng], 16); mostrarFichaCliente(l);
    });

    if(q.length < 3) return;
    t = setTimeout(async()=>{
      let lugares=[];
      try{
        const centro=_mapaTab.getCenter();
        lugares = await SPMapa.buscarLugares(q, { lat:centro.lat, lng:centro.lng });
      }catch(e){ lugares=[]; }
      if(!document.getElementById('mapaResultados')) return;
      box.innerHTML = propios.map((l,i)=>fila('👤', esc(l.customer_name||'Cliente'), esc(l.ciudad||''), `data-cli="${i}"`)).join('')
        + lugares.map((p,i)=>fila('📍', esc(p.nombre||p.direccion), esc(p.direccion||''), `data-lug="${i}"`)).join('');
      if(!propios.length && !lugares.length) box.innerHTML='<div style="padding:10px 12px;font-size:12px;color:var(--text-3)">Sin resultados</div>';
      box.style.display='block';
      box.querySelectorAll('[data-cli]').forEach(b=>b.onclick=()=>{
        const l=propios[Number(b.dataset.cli)];
        box.style.display='none'; input.blur();
        _mapaTab.setView([l.lat,l.lng], 16); mostrarFichaCliente(l);
      });
      box.querySelectorAll('[data-lug]').forEach(b=>b.onclick=()=>{
        const p=lugares[Number(b.dataset.lug)];
        box.style.display='none'; input.blur(); input.value=p.nombre||p.direccion;
        _mapaTab.setView([p.lat,p.lng], 15);
      });
    }, 420);
  };
  // Tocar el mapa cierra los resultados y la ficha: el gesto natural para "quitar esto".
  _mapaTab.on('click', ()=>{ box.style.display='none'; cerrarFichaMapa(); });
}

/* ── Descarga de teselas para trabajar sin señal ──
   El caso real: el asesor descarga Tocaima antes de salir de cobertura. Se guardan los
   tres niveles de zoom siguientes al actual, con tope duro para no llenarle el celular
   ni castigar al proveedor de teselas. */
async function descargarZonaMapa(){
  if(!_mapaTab || !('caches' in window)){ toast('Tu navegador no permite guardar el mapa','err'); return; }
  const z0 = Math.round(_mapaTab.getZoom());
  const b = _mapaTab.getBounds();
  const urls = [];
  const cfg = await SPMapa.getConfig();
  const plantilla = SPMapa.capaTiles(cfg)._url;
  const subs = 'abcd';
  for(let z=z0; z<=z0+2 && z<=19; z++){
    const nw = _mapaTab.project(b.getNorthWest(), z).divideBy(256).floor();
    const se = _mapaTab.project(b.getSouthEast(), z).divideBy(256).floor();
    for(let x=nw.x; x<=se.x; x++) for(let y=nw.y; y<=se.y; y++){
      urls.push(plantilla
        .replace('{s}', subs[(x+y)%subs.length]).replace('{z}',z).replace('{x}',x).replace('{y}',y)
        .replace('{r}', window.devicePixelRatio>1?'@2x':''));
    }
  }
  const TOPE = 400;
  if(urls.length > TOPE){ toast(`Zona demasiado grande (${urls.length} piezas) — acerca un poco el mapa`,'err'); return; }
  if(!urls.length){ toast('Nada que descargar'); return; }

  estadoMapa(`Descargando 0/${urls.length}…`);
  const cache = await caches.open('sp-tiles-v1');
  let hechas = 0, fallos = 0;
  // De 8 en 8: en paralelo total el WebView del celular se atraganta y el proveedor
  // empieza a rechazar peticiones.
  for(let i=0; i<urls.length; i+=8){
    await Promise.all(urls.slice(i,i+8).map(async u=>{
      try{
        const res = await fetch(u, { mode:'cors' });
        if(res.ok) await cache.put(u, res.clone());
        else fallos++;
      }catch(e){ fallos++; }
      hechas++;
    }));
    estadoMapa(`Descargando ${hechas}/${urls.length}…`);
  }
  toast(fallos ? `Mapa guardado (${fallos} piezas fallaron)` : 'Mapa guardado para usar sin señal');
  actualizarEstadoMapa();
}

// Control del asesor sobre su propio rastreo: activar si lo rechazó antes, o retirarlo
// (que borra además el recorrido guardado en el servidor).
function abrirAjusteUbicacion(){
  const activo = _ubicActiva;
  openSheet('Compartir ubicación', `
    <div style="font-size:13.5px;line-height:1.6;color:var(--text-2)">
      <p style="margin:0 0 12px">${activo
        ? 'Estás compartiendo tu ubicación mientras usas la app. La administración y los jefes la ven en el mapa del equipo.'
        : 'No estás compartiendo tu ubicación. Actívala para que el equipo pueda coordinar visitas y repartir clientes por cercanía.'}</p>
      ${activo
        ? `<button id="ubicQuitar" style="width:100%;height:48px;border-radius:14px;border:1px solid rgba(229,72,77,.35);background:rgba(229,72,77,.08);color:var(--red);font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">Dejar de compartir y borrar mi recorrido</button>`
        : `<button id="ubicActivar" style="width:100%;height:48px;border-radius:14px;border:none;background:var(--gold);color:#0A0A0A;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">Activar</button>`}
    </div>`);
  const q = document.getElementById('ubicQuitar');
  if(q) q.onclick = async () => {
    if(!confirm('¿Dejar de compartir tu ubicación? También se borrará el recorrido guardado.')) return;
    const r = await api('/api/me/consentimiento-ubicacion', { method:'DELETE' });
    closeSheet();
    if(r){ detenerRastreo(); toast('Ya no compartes tu ubicación'); }
    else toast('No se pudo desactivar','err');
  };
  const a = document.getElementById('ubicActivar');
  if(a) a.onclick = async () => {
    const r = await api('/api/me/consentimiento-ubicacion', { method:'POST' });
    closeSheet();
    if(r){ arrancarRastreo(); toast('Ubicación activada'); }
    else toast('No se pudo activar','err');
  };
}

/* ════════ Proveedor de mapa ════════
   Teselas oscuras (CARTO sin token, Mapbox si está configurado) y buscador de lugares.
   El asesor tiene que poder mandar la ubicación de otra ciudad sin estar allí ("estoy en
   Tocaima y necesito mandar Mariquita"), así que el buscador importa tanto como el mapa.
   Todo vive en /shared/mapa-base.js; aquí solo quedan los alias que ya usaba el archivo. */
const getMapaConfig = () => SPMapa.getConfig();
const capaTilesMapa = (cfg) => SPMapa.capaTiles(cfg);
const buscarLugares = (q, cerca) => SPMapa.buscarLugares(q, cerca);

// Hoja de envío de ubicación con minimapa interactivo (marcador arrastrable, tipo WhatsApp)
function abrirEnviarUbicacion(){
  if(!current){ toast('Selecciona un lead primero'); return; }
  const DEFAULT_POS={lat:4.7110,lng:-74.0721}; // Bogotá — centro por defecto si no hay GPS
  let picker={lat:DEFAULT_POS.lat,lng:DEFAULT_POS.lng,name:'',address:'',fromSaved:false};
  let pMap=null, pMarker=null;

  api('/api/ubicaciones-guardadas').then(async saved=>{
    const savedList = (saved&&saved.length) ? saved.map(p=>
      `<div style="display:flex;align-items:center;gap:6px"><button class="loc-preset-btn loc-preset-saved" data-sid="${p.id}" style="flex:1"><span class="loc-preset-icon">📍</span><span><strong>${esc(p.nombre)}</strong>${p.direccion ? ' — '+esc(p.direccion) : ''}</span></button><button class="loc-del-saved" data-sid="${p.id}" style="background:none;border:none;color:var(--text-3);font-size:16px;cursor:pointer;padding:4px">✕</button></div>`
    ).join('') : '<div style="color:var(--text-3);font-size:13px;text-align:center;padding:8px 0">Aún no tienes ubicaciones guardadas</div>';

    // El buscador va ARRIBA del mapa: mandar la ubicación de otra ciudad (buscar
    // "Mariquita" estando en Tocaima) es el caso normal, no el excepcional.
    const formHtml = `
      <div class="loc-search-wrap"><input id="locSearch" placeholder="Buscar ciudad, barrio o lugar…" autocomplete="off"><div class="loc-results" id="locResults"></div></div>
      <div class="loc-picker-map" id="locPickerMap"><button class="loc-picker-locate" id="locLocateBtn" title="Mi ubicación">${I(SVG.target,18)}</button></div>
      <div class="loc-picker-hint">Busca un lugar arriba, o toca el mapa y arrastra el pin para ajustarlo</div>
      <div class="loc-picker-info" id="locPickerInfo"><span class="loc-ic">📍</span><span class="loc-picker-addr" id="locPickerAddr">Ubicando…</span></div>
      <button class="loc-picker-send" id="locSendBtn">${I(SVG.send,15)} Enviar esta ubicación</button>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin:10px 0 6px">Guardadas</div>
      <div class="loc-preset" id="locSavedList">${savedList}</div>`;
    openSheet('Enviar ubicación', formHtml);

    const addrEl=$('#locPickerAddr');
    const setAddr=(txt)=>{ if(addrEl) addrEl.textContent=txt; };

    const movePicker=async(lat,lng,{name='',address='',fromSaved=false,skipGeocode=false}={})=>{
      picker={lat,lng,name,address,fromSaved};
      if(pMarker) pMarker.setLatLng([lat,lng]);
      if(pMap) pMap.setView([lat,lng], pMap.getZoom()<14?15:pMap.getZoom());
      if(address){ setAddr(name?`${name} — ${address}`:address); return; }
      if(skipGeocode) return;
      setAddr('Buscando dirección…');
      try{
        const g=await reverseGeocodeUbic(lat,lng);
        picker.name=g.name; picker.address=g.address;
        setAddr(g.address||`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }catch(e){
        setAddr(`${lat.toFixed(5)}, ${lng.toFixed(5)} (sin dirección — ${e.message==='nominatim_429'?'límite alcanzado':'error de red'})`);
      }
    };

    // --- Minimapa interactivo ---
    (async()=>{
      const mapEl=$('#locPickerMap'); if(!mapEl) return;
      try{ await cargarLeaflet(); }catch(e){ if(mapEl) mapEl.innerHTML='<div style="display:grid;place-items:center;height:100%;color:var(--text-3);font-size:12px">No se pudo cargar el mapa</div>'; return; }
      if(!$('#locPickerMap')) return; // la hoja pudo cerrarse mientras cargaba
      pMap=L.map(mapEl,{zoomControl:false,attributionControl:false}).setView([picker.lat,picker.lng],12);
      capaTilesMapa(await getMapaConfig()).addTo(pMap);
      pMarker=L.marker([picker.lat,picker.lng],{draggable:true}).addTo(pMap);
      pMarker.on('dragend',()=>{ const p=pMarker.getLatLng(); movePicker(p.lat,p.lng); });
      pMap.on('click', e=>movePicker(e.latlng.lat,e.latlng.lng));
      setTimeout(()=>pMap&&pMap.invalidateSize(),150);
      // Centrar en el GPS real al abrir. El estado por defecto (Bogotá) es solo un placeholder
      // mientras se obtiene la ubicación; NO se envía como si fuera la posición del usuario.
      setAddr('Obteniendo tu ubicación…');
      try{
        const pos=await obtenerPosicionActual();
        if($('#locPickerMap')){ movePicker(pos.latitude, pos.longitude); pMap.setView([pos.latitude,pos.longitude],16); }
      }catch(e){
        // Sin permiso/GPS: dejamos el mapa en el centro por defecto PERO avisamos claramente.
        if($('#locPickerAddr')){
          const denegado=/denegado|denied/i.test(e&&e.message||'');
          setAddr(denegado
            ? 'Activa el permiso de ubicación y toca 📍, o marca el punto en el mapa'
            : 'No pudimos obtener tu ubicación — toca 📍 para reintentar o marca el punto en el mapa');
        }
        if($('#locLocateBtn')) $('#locLocateBtn').classList.add('needs-gps');
      }
    })();

    // --- Botón "Mi ubicación" (reintento explícito) ---
    const locateBtn=$('#locLocateBtn');
    if(locateBtn) locateBtn.onclick=async()=>{
      haptic(8);
      locateBtn.classList.add('loading'); setAddr('Obteniendo tu ubicación…');
      try{
        const pos=await obtenerPosicionActual();
        movePicker(pos.latitude, pos.longitude);
        if(pMap) pMap.setView([pos.latitude,pos.longitude],16);
        locateBtn.classList.remove('needs-gps');
      }catch(err){
        const denegado=/denegado|denied/i.test(err&&err.message||'');
        setAddr(denegado ? 'Permiso de ubicación denegado — actívalo en Ajustes' : 'No se pudo obtener el GPS — marca el punto en el mapa');
        toast(denegado ? 'Activa el permiso de ubicación en Ajustes' : 'No se pudo obtener el GPS','err');
      } finally { locateBtn.classList.remove('loading'); }
    };

    // --- Enviar ---
    const sendBtn=$('#locSendBtn');
    if(sendBtn) sendBtn.onclick=async()=>{
      sendBtn.disabled=true;
      const {lat,lng,name,address,fromSaved}=picker;
      closeSheet();
      const ok=await enviarUbicacion(current.id, lat, lng, name, address);
      if(ok&&!fromSaved&&name&&confirm(`¿Guardar "${name}" en tus ubicaciones?`)){
        await api('/api/ubicaciones-guardadas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:name,direccion:address,lat,lng})});
        toast('📍 Ubicación guardada','ok');
      }
    };

    // --- Búsqueda ---
    let searchTimer;
    const searchInput=$('#locSearch');
    const resultsEl=$('#locResults');
    if(searchInput){
      searchInput.oninput=()=>{
        clearTimeout(searchTimer);
        const q=searchInput.value.trim();
        if(q.length<3){ resultsEl.style.display='none'; return; }
        searchTimer=setTimeout(async()=>{
          try{
            // Los resultados se sesgan al punto donde está el pin: buscar "el centro"
            // debe proponer primero el de la ciudad que el asesor está mirando.
            const data=await buscarLugares(q, { lat:picker.lat, lng:picker.lng });
            if(!resultsEl) return;
            if(data&&data.length){
              resultsEl.innerHTML=data.map((res,i)=>`<button class="loc-result" data-idx="${i}"><span class="loc-r-icon">📍</span><span>${esc(res.direccion||res.nombre)}</span></button>`).join('');
              resultsEl.style.display='block';
              resultsEl.querySelectorAll('.loc-result').forEach(btn=>btn.onclick=()=>{
                const r2=data[parseInt(btn.dataset.idx)];
                resultsEl.style.display='none'; searchInput.value=r2.direccion||r2.nombre;
                movePicker(r2.lat,r2.lng,{name:r2.nombre,address:r2.direccion});
              });
            } else { resultsEl.innerHTML='<div class="loc-result" style="cursor:default">Sin resultados</div>'; resultsEl.style.display='block'; }
          }catch(e){ toast('Error al buscar: '+e.message,'err'); if(resultsEl) resultsEl.style.display='none'; }
        },400);
      };
      document.addEventListener('click',e=>{ if(resultsEl&&!resultsEl.contains(e.target)&&e.target!==searchInput) resultsEl.style.display='none'; });
    }

    // --- Guardadas: seleccionar (mueve el pin, no envía directo) ---
    $('#sheetBody').querySelectorAll('.loc-preset-saved').forEach(b=>b.onclick=()=>{
      const s=saved.find(x=>String(x.id)===b.dataset.sid);
      if(!s) return;
      haptic(8);
      movePicker(s.lat, s.lng, {name:s.nombre, address:s.direccion||'', fromSaved:true});
    });

    // --- Guardadas: eliminar ---
    $('#sheetBody').querySelectorAll('.loc-del-saved').forEach(b=>b.onclick=async()=>{
      const sid=b.dataset.sid;
      if(!confirm('¿Eliminar esta ubicación guardada?')) return;
      await api('/api/ubicaciones-guardadas/'+sid,{method:'DELETE'});
      b.closest('div').remove();
      toast('Ubicación eliminada');
    });
  }).catch(()=>toast('No se pudieron cargar tus ubicaciones guardadas','err'));
}

async function enviarUbicacion(leadId, lat, lng, name, address){
  haptic(10);
  try{
    const r=await api(`/api/leads/${leadId}/send-location`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({latitude:lat,longitude:lng,name,address})});
    if(r!==null){
      const d=await api(`/api/leads/${leadId}/mensajes`);
      if(d){ currentMsgs=d.mensajes; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); const b=$('#cMsgs'); b.scrollTop=b.scrollHeight; }
      cargar();
      toast('📍 Ubicación enviada');
      return true;
    } else { toast('Error al enviar ubicación','err'); return false; }
  }catch(e){ toast('Error al enviar ubicación','err'); return false; }
}

// Envía un archivo ya codificado en base64 al lead actual — usado tanto por el
// input de archivo (galería/documentos) como por la cámara nativa (Capacitor).
async function enviarArchivoBase64(dataBase64, mime, filename, caption){
  if(!current) return;
  const pb=showProgressBar();
  const mediaBody = {mime,filename:filename||'archivo',dataBase64,caption:caption||''}; if(replyTo) mediaBody.replyTo=replyTo.id;
  try{
    const r=await apiUpload(`/api/leads/${current.id}/responder-media`,mediaBody,pb);
    cancelarReply();
    if(r!==null){ const d=await api(`/api/leads/${current.id}/mensajes`); if(d){ currentMsgs=d.mensajes; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); const b=$('#cMsgs'); b.scrollTop=b.scrollHeight; } cargar(); toast('Enviado'); } else toast('Error al enviar archivo');
  }catch(e){ toast('Error al enviar archivo'); }
  pb.remove();
}

// File input for media uploads
function initFileInput(){
  const fi=document.createElement('input'); fi.type='file'; fi.id='fileInput'; fi.style.display='none'; fi.accept='image/*,video/*,.pdf,.doc,.docx';
  fi.onchange=async()=>{ const file=fi.files[0]; if(!file||!current) return; fi.value=''; haptic(10);
    closeSheet();
    // Las imágenes pasan por el editor (recortar, dibujar, texto, caption) antes de enviar.
    if((file.type||'').startsWith('image/')){ abrirEditorImagen(file); return; }
    const toBase64=f=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(f); });
    const dataBase64=await toBase64(file); const mime=file.type||'application/octet-stream';
    await enviarArchivoBase64(dataBase64, mime, file.name);
  };
  document.body.appendChild(fi);
}

// ════════ Editor de imagen antes de enviar (canvas nativo, sin librerías) ════════
// Recortar/rotar no destructivo por transform; dibujar a mano alzada; texto; caption;
// marca de agua opcional. Al enviar re-encodea el canvas a JPEG y usa el flujo normal.
function abrirEditorImagen(file){
  const url=URL.createObjectURL(file);
  const img=new Image();
  img.onload=()=>{ montarEditor(img,url,file.name||'foto.jpg'); };
  img.onerror=()=>{ toast('No se pudo abrir la imagen','err'); URL.revokeObjectURL(url); };
  img.src=url;
}
function montarEditor(img,url,filename){
  const ov=document.createElement('div'); ov.className='img-editor';
  ov.innerHTML=`
    <div class="ie-top">
      <button class="ie-btn" id="ieCancel" title="Cancelar">${I(SVG.x,20)}</button>
      <div class="ie-tools">
        <button class="ie-btn" id="ieRotate" title="Rotar">${I(SVG.refresh||SVG.clock,19)}</button>
        <button class="ie-btn" id="ieDraw" title="Dibujar">✏️</button>
        <button class="ie-btn" id="ieText" title="Texto">🅰️</button>
        <button class="ie-btn" id="ieMark" title="Marca de agua">💧</button>
      </div>
      <button class="ie-btn ie-done" id="ieSend" title="Enviar">${I(SVG.send,20)}</button>
    </div>
    <div class="ie-stage" id="ieStage"><canvas id="ieCanvas"></canvas></div>
    <div class="ie-colors" id="ieColors" style="display:none">
      ${['#C8A45A','#E5484D','#57C168','#5B8DEF','#FFFFFF','#0A0A0A'].map((c,i)=>`<button class="ie-color${i===0?' on':''}" data-c="${c}" style="background:${c}"></button>`).join('')}
    </div>
    <div class="ie-caption"><input id="ieCaption" placeholder="Añade un pie de foto…" autocomplete="off"></div>`;
  document.body.appendChild(ov);

  const canvas=ov.querySelector('#ieCanvas'); const ctx=canvas.getContext('2d');
  let rotation=0, mode=null, color='#C8A45A', watermark=false;
  const strokes=[]; const texts=[];
  let drawing=false, cur=null;

  // Dimensiones de trabajo (máx 1280 en el lado mayor para peso razonable)
  const MAXW=1280; let baseW=img.width, baseH=img.height;
  if(Math.max(baseW,baseH)>MAXW){ const s=MAXW/Math.max(baseW,baseH); baseW=Math.round(baseW*s); baseH=Math.round(baseH*s); }

  function repaint(){
    const rot=rotation%360; const swap=(rot===90||rot===270);
    const cw=swap?baseH:baseW, ch=swap?baseW:baseH;
    canvas.width=cw; canvas.height=ch;
    ctx.save();
    ctx.translate(cw/2,ch/2); ctx.rotate(rot*Math.PI/180); ctx.drawImage(img,-baseW/2,-baseH/2,baseW,baseH); ctx.restore();
    // strokes (en coords del canvas visible)
    for(const s of strokes){ ctx.strokeStyle=s.color; ctx.lineWidth=s.w; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath(); s.pts.forEach((p,i)=>{ i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y); }); ctx.stroke(); }
    // texts
    for(const t of texts){ ctx.font=`bold ${t.size}px Inter,system-ui,sans-serif`; ctx.textBaseline='middle'; ctx.lineWidth=Math.max(3,t.size/8); ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.fillStyle=t.color; ctx.strokeText(t.txt,t.x,t.y); ctx.fillText(t.txt,t.x,t.y); }
    // watermark
    if(watermark){ const s=Math.max(14,cw*0.028); ctx.font=`700 ${s}px Cinzel,serif`; ctx.textBaseline='bottom'; ctx.fillStyle='rgba(255,255,255,.82)'; ctx.strokeStyle='rgba(0,0,0,.4)'; ctx.lineWidth=2; ctx.strokeText('LEONS GROUP', 14, ch-12); ctx.fillText('LEONS GROUP', 14, ch-12); }
  }
  repaint();

  function canvasPos(e){ const r=canvas.getBoundingClientRect(); const t=(e.touches&&e.touches[0])||e; return { x:(t.clientX-r.left)*(canvas.width/r.width), y:(t.clientY-r.top)*(canvas.height/r.height) }; }
  function onDown(e){ if(mode!=='draw') return; e.preventDefault(); drawing=true; cur={color,w:Math.max(4,canvas.width*0.008),pts:[canvasPos(e)]}; strokes.push(cur); }
  function onMove(e){ if(!drawing||mode!=='draw') return; e.preventDefault(); cur.pts.push(canvasPos(e)); repaint(); }
  function onUp(){ drawing=false; cur=null; }
  canvas.addEventListener('mousedown',onDown); canvas.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp);
  canvas.addEventListener('touchstart',onDown,{passive:false}); canvas.addEventListener('touchmove',onMove,{passive:false}); canvas.addEventListener('touchend',onUp);

  const colorsBar=ov.querySelector('#ieColors');
  ov.querySelector('#ieRotate').onclick=()=>{ rotation=(rotation+90)%360; repaint(); haptic(6); };
  ov.querySelector('#ieDraw').onclick=()=>{ mode=(mode==='draw')?null:'draw'; colorsBar.style.display=mode==='draw'?'flex':'none'; ov.querySelector('#ieDraw').classList.toggle('on',mode==='draw'); haptic(6); };
  ov.querySelector('#ieMark').onclick=()=>{ watermark=!watermark; ov.querySelector('#ieMark').classList.toggle('on',watermark); repaint(); haptic(6); };
  ov.querySelector('#ieText').onclick=()=>{ const txt=prompt('Texto sobre la imagen:'); if(txt&&txt.trim()){ texts.push({txt:txt.trim(),x:canvas.width*0.1,y:canvas.height*0.5,size:Math.max(22,canvas.width*0.06),color}); repaint(); } };
  colorsBar.querySelectorAll('.ie-color').forEach(b=>b.onclick=()=>{ color=b.dataset.c; colorsBar.querySelectorAll('.ie-color').forEach(x=>x.classList.remove('on')); b.classList.add('on'); });

  const cerrar=()=>{ try{ URL.revokeObjectURL(url); }catch(e){} ov.remove(); };
  ov.querySelector('#ieCancel').onclick=()=>{ cerrar(); haptic(6); };
  ov.querySelector('#ieSend').onclick=async()=>{
    haptic([10,20]);
    const caption=(ov.querySelector('#ieCaption').value||'').trim();
    canvas.toBlob(async(blob)=>{
      cerrar();
      if(!blob){ toast('No se pudo procesar la imagen','err'); return; }
      const dataBase64=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(blob); });
      await enviarArchivoBase64(dataBase64,'image/jpeg',(filename||'foto').replace(/\.\w+$/,'')+'.jpg',caption);
    },'image/jpeg',0.9);
  };
}

function esNativo(){ return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }

// Ubicación: usa el plugin nativo (maneja el permiso en tiempo de ejecución de forma
// más confiable que el prompt del WebView) cuando corre empaquetada; si no, cae a la
// API web estándar (comportamiento sin cambios para el uso normal en navegador).
async function obtenerPosicionActual(){
  if(esNativo()){
    const { Geolocation } = window.Capacitor.Plugins;
    // Asegurar el permiso runtime ANTES de pedir la posición: si no se solicita,
    // getCurrentPosition falla en silencio y el mapa se quedaba en el fallback (Bogotá).
    try{
      let perm = await Geolocation.checkPermissions();
      if(perm && perm.location !== 'granted' && perm.coarseLocation !== 'granted'){
        perm = await Geolocation.requestPermissions({ permissions:['location'] });
      }
      if(perm && perm.location === 'denied' && perm.coarseLocation === 'denied'){
        throw new Error('Permiso de ubicación denegado');
      }
    }catch(e){ if(/denegado|denied/i.test(e.message||'')) throw e; /* checkPermissions no soportado: seguimos */ }
    // Alta precisión primero; si expira, reintento con baja precisión (red/celda).
    try{
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy:true, timeout:10000 });
      return { latitude:pos.coords.latitude, longitude:pos.coords.longitude, accuracy:pos.coords.accuracy };
    }catch(e){
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy:false, timeout:15000 });
      return { latitude:pos.coords.latitude, longitude:pos.coords.longitude, accuracy:pos.coords.accuracy };
    }
  }
  // Navegador: alta precisión y, si falla por timeout, reintento con baja precisión.
  const pedir=(opts)=>new Promise((resolve,reject)=>{
    if(!navigator.geolocation){ reject(new Error('GPS no disponible')); return; }
    navigator.geolocation.getCurrentPosition(
      pos=>resolve({ latitude:pos.coords.latitude, longitude:pos.coords.longitude, accuracy:pos.coords.accuracy }),
      reject, opts);
  });
  try{ return await pedir({ enableHighAccuracy:true, timeout:10000 }); }
  catch(e){
    if(e && e.code===1) throw new Error('Permiso de ubicación denegado'); // PERMISSION_DENIED: no reintentar
    return await pedir({ enableHighAccuracy:false, timeout:15000 });
  }
}

// Cámara nativa (Capacitor): en la app empaquetada abre la cámara directamente sin
// pasar por el selector del sistema operativo. En navegador normal (PWA/web) cae al
// input de archivo con capture=environment, que la mayoría de móviles interpreta
// igual como "abrir cámara".
async function tomarFotoNativa(){
  if(!current){ toast('Selecciona un lead primero'); return; }
  if(esNativo()){
    try{
      const { Camera } = window.Capacitor.Plugins;
      const photo = await Camera.getPhoto({ quality:80, resultType:'base64', source:'CAMERA', saveToGallery:false });
      if(photo && photo.base64String){
        closeSheet(); haptic(10);
        await enviarArchivoBase64(photo.base64String, 'image/'+(photo.format||'jpeg'), 'foto.'+(photo.format||'jpg'));
      }
    }catch(e){ if(String(e.message||'').toLowerCase().indexOf('cancel')===-1) toast('No se pudo abrir la cámara'); }
  } else {
    // Cada punto de entrada a #fileInput fija accept/capture explícitamente antes de
    // click() (ver abrirAdjuntos) — no se restaura aquí para evitar una carrera con
    // la apertura del selector del sistema operativo.
    const fi=$('#fileInput'); if(!fi) return;
    fi.accept='image/*'; fi.capture='environment'; fi.click();
  }
}

// Sustituye variables de plantilla con datos reales del lead/asesor al insertar.
// Soporta {{nombre}} (cliente), {{asesor}} (usuario logueado) y {{proyecto}}.
function aplicarVars(txt){
  if(!txt) return txt;
  const primerNombre=s=>String(s||'').trim().split(/\s+/)[0]||'';
  const cli=primerNombre(current&&current.customer_name)||'estimado';
  const ase=primerNombre(me&&me.nombre)||'';
  return String(txt)
    .replace(/\{\{\s*nombre\s*\}\}/gi, cli)
    .replace(/\{\{\s*asesor\s*\}\}/gi, ase)
    .replace(/\{\{\s*proyecto\s*\}\}/gi, (current&&current.proyecto_nombre)||'nuestro proyecto');
}

function abrirPlantillas(){
  const cats=[['Saludos',['Saludo']],['Precio',['Precio']],['Ubicación',['Ubicación']],['Agenda',['Agenda']],['Financiación',['Financiación']],['Catálogo',['Catálogo']],['Despedida',['Despedida']]];
  const qs = QUICK;
  openSheet('Respuestas rápidas', cats.map(([c,keys])=>{ const q=qs.find(x=>x.t===keys[0]); return `<div style="margin-bottom:8px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--text-3);margin-bottom:4px">${c}</div><button class="lp-cell wide" style="text-align:left;width:100%;color:var(--text-2)" data-tpl="${esc(q.body)}">${esc(q.body)}</button></div>`; }).join('') );
  // Cargar plantillas del servidor (admin) y mis templates
  Promise.all([api('/api/templates'), api('/api/mis-templates')]).then(([tpls, mis])=>{
    const h=document.createElement('div');
    let extra='';
    if(mis&&mis.length){
      extra+='<div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--text-3);margin-bottom:6px;margin-top:12px">Mis respuestas</div>';
      extra+=mis.map(t=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><button class="lp-cell wide" style="flex:1;text-align:left;color:var(--text-2)" data-tpl="${esc(t.cuerpo)}">${esc(t.titulo)}: ${esc(t.cuerpo)}</button></div>`).join('');
    }
    if(tpls&&tpls.length){
      extra+='<div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--text-3);margin-bottom:6px;margin-top:12px">Plantillas del sistema</div>';
      extra+=tpls.map(t=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><button class="lp-cell wide" style="flex:1;text-align:left;color:var(--text-2)" data-tpl="${esc(t.cuerpo)}">${esc(t.titulo)}: ${esc(t.cuerpo)}</button></div>`).join('');
    }
    if(extra){ h.innerHTML='<div style="border-top:1px solid var(--bg-4);padding-top:10px;margin-top:8px">'+extra+'</div>'; $('#sheetBody').appendChild(h); }
    $('#sheetBody').querySelectorAll('[data-tpl]').forEach(b=>b.onclick=()=>{ const i=$('#cInput'); i.value=aplicarVars(b.dataset.tpl); updateSend(); closeSheet(); haptic(8); i.focus(); });
  });
  $('#sheetBody').querySelectorAll('[data-tpl]').forEach(b=>b.onclick=()=>{ const i=$('#cInput'); i.value=aplicarVars(b.dataset.tpl); updateSend(); closeSheet(); haptic(8); i.focus(); });
}

function abrirPerfil(){ const l=current; const nombre=l.customer_name||'Cliente'; const st=estado(l); const pct=l.progress_pct!=null?l.progress_pct:leadScore(l); const stageDots=[0,25,50,75,100].map(t=>`<span${pct>=t?' class="done"':''}></span>`).join('');
  openSheet('Perfil del lead', `
    <div class="lp-head">
      <div class="m-avatar" style="background:${avatarColor(nombre)}">${initials(nombre)}</div>
      <div><div class="lp-name">${esc(nombre)}</div><div class="c-sub" style="justify-content:center">${esc(l.customer_phone||'')}</div></div>
      <div class="lp-actions">
        <button data-lp="call">${I(SVG.phone,21)}</button>
        <button data-lp="cal">${I(SVG.calendar,21)}</button>
        <button data-lp="tl">${I(SVG.clock,21)}</button>
        <button data-lp="mute" style="color:${l.muted_at?'var(--gold)':'var(--text-3)'}">${l.muted_at?I('<path d="M8.56 2.9A7 7 0 0 1 19 9v4l4 7H4.8"/><path d="M2 2l20 20"/><path d="M12 22a2 2 0 0 1-2-2"/>',21):I(SVG.bell,21)}</button>
      </div>
    </div>
    <div class="sp-progress-lg">
      <div class="sp-progress-lg__top"><span>Pipeline</span><span class="sp-progress-lg__num">${pct}%</span></div>
      <span class="sp-progress-lg__track"><i style="width:${pct}%"></i></span>
      <div class="sp-progress-lg__stages">${stageDots}</div>
    </div>
    <div class="lp-grid">
      <div class="lp-cell"><span>Estado</span><strong style="color:var(--gold)">${etqLabel(l.etiqueta||'sin_clasificar')}</strong></div>
      <div class="lp-cell"><span>Proyecto</span><strong>${l.proyecto || '—'}</strong></div>
      <div class="lp-cell"><span>${l.ad_name?'Anuncio de origen':'Origen'}</span><strong${l.ad_name?' style="color:var(--gold)" title="Este lead llegó desde este anuncio de Meta Ads"':''}>${esc(l.ad_name || l.origen || '—')}</strong></div>
      <div class="lp-cell"><span>Asesor</span><strong>${esc(l.assigned_to_nombre||me.nombre||'—')}</strong></div>
      <div class="lp-cell"><span>Mensajes</span><strong>${(currentMsgs||[]).filter(m=>m.direction==='incoming').length}</strong></div>
      <div class="lp-cell"><span>Creado</span><strong>${horaCorta(l.created_at)}</strong></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="cop-use" style="flex:1" data-lp="cop">${I(SVG.sparkles,16)} Copiloto SP</button>
      <button class="cop-use" style="flex:1;background:var(--bg-3);color:var(--text)" data-lp="resumen">${I(SVG.chat,16)} Ponme al día</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="cop-use" style="flex:1;background:var(--bg-3);color:var(--text)" data-lp="tl2">${I(SVG.clock,16)} Timeline</button>
      <button class="cop-use" style="flex:1;background:var(--bg-3);color:var(--text)" data-lp="export">${I(SVG.arrowUp,16)} Exportar</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="cop-use" style="flex:1;background:var(--bg-3);color:${l.cadencia_activa?'var(--gold)':'var(--text)'}" data-lp="cadencia">${I(SVG.clock,16)} ${l.cadencia_activa?'Seguimiento ON':'Seguimiento auto'}</button>
      <button class="cop-use" style="flex:1;background:var(--bg-3);color:var(--text)" data-lp="encuesta">${I(SVG.star||SVG.check,16)} Enviar encuesta</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="cop-use" style="flex:1;background:var(--bg-3);color:var(--red)" data-lp="clear">${I(SVG.trash,16)} Vaciar</button>
    </div>`);
  $('#sheetBody').querySelectorAll('[data-lp]').forEach(b=>b.onclick=()=>{ const k=b.dataset.lp; const p=(l.customer_phone||'').replace(/[^\d+]/g,''); haptic(10);
    if(k==='call'){ closeSheet(); llamarYRegistrar(p, l&&l.id); } else if(k==='cal'){ closeSheet(); abrirModalCita(null, current); } else if(k==='tl'||k==='tl2') abrirTimeline(); else if(k==='cop') abrirCopiloto(); else if(k==='resumen') abrirResumen(); else if(k==='mute') toggleMuteLead(); else if(k==='export') exportarConversacion(); else if(k==='clear') vaciarConversacion();
    else if(k==='encuesta'){ closeSheet(); api('/api/leads/'+(l&&l.id)+'/encuesta',{method:'POST'}).then(r=>{ if(r&&r.ok) toast('Encuesta enviada al cliente'); else toast('No se pudo enviar','err'); }); }
    else if(k==='cadencia'){ closeSheet(); const activar=!l.cadencia_activa; api('/api/leads/'+(l&&l.id)+'/cadencia',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({activar})}).then(r=>{ if(r&&r.ok){ l.cadencia_activa=r.cadencia_activa; toast(r.cadencia_activa?'Seguimiento automático activado':'Seguimiento detenido'); } else toast('No se pudo','err'); }); } });
}

// "Ponme al día" (A5): resumen IA rápido de la conversación para retomarla.
async function abrirResumen(){
  const l=current; if(!l){ toast('Selecciona un lead'); return; }
  openSheet('Ponme al día', `<div id="resLoad" style="text-align:center;padding:26px;color:var(--text-3)"><div class="spin" style="margin:0 auto 12px"></div>Resumiendo la conversación…</div>`);
  let d=null;
  try{ const r=await fetch('/api/leads/'+l.id+'/resumen',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:'{}'}); d=await r.json(); }catch(e){}
  const body=$('#sheetBody'); if(!body) return;
  if(!d || d.aiOff){ body.innerHTML=`<div class="cop-card"><h5>${I(SVG.sparkles,14)} IA no configurada</h5><p style="font-size:13px">Pide al admin conectar una API de IA en Chat IA → Proveedores para usar el resumen automático.</p></div>`; return; }
  const r=d.resumen||{};
  const puntos=(r.puntos&&r.puntos.length)?`<div class="cop-card"><h5>${I(SVG.target,14)} Puntos clave</h5>${r.puntos.map(p=>`<div class="cop-obj">${esc(p)}</div>`).join('')}</div>`:'';
  const pend=r.pendiente?`<div class="cop-card"><h5>${I(SVG.zap,14)} Qué hacer ahora</h5><p style="font-size:13px">${esc(r.pendiente)}</p></div>`:'';
  body.innerHTML=`
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px"><span style="font-size:10px;padding:3px 10px;border-radius:999px;background:var(--gold-soft);color:var(--gold)">IA activa</span></div>
    <div class="cop-card"><h5>${I(SVG.user,14)} Resumen</h5><p>${esc(r.resumen||'Sin datos suficientes.')}</p></div>
    ${puntos}${pend}`;
}

function abrirTimeline(){ const l=current;
  const msgs=currentMsgs||[];
  const ev=msgs.map(m=>({ic:'chat',t:(m.direction==='incoming'?'Cliente: ':'Tú: ')+esc(m.body||'[media]'),s:horaCorta(m.timestamp)}));
  if(!ev.length) ev.push({ic:'chat',t:'Sin actividad aún',s:''});
  openSheet('Timeline', `<div class="tl">${ev.map(({ic,t,s})=>`<div class="tl-i"><div class="tl-dot">${I(SVG[ic]||SVG.chat,15)}</div><div class="tl-txt"><strong>${t}</strong><span>${s}</span></div></div>`).join('')}</div>`);
}

async function abrirCopiloto(){ const l=current; const nombre=l.customer_name||'Cliente';
  openSheet('Copiloto SP', `<div id="copilotLoading" style="text-align:center;padding:24px;color:var(--text-3)">Analizando lead...</div>`);
  let analysis = null;
  try {
    // calificar = analyze-lead + persiste la temperatura 🔥/🌤️/❄️ en el lead
    const rAna = await fetch('/api/leads/'+l.id+'/calificar', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:'{}' });
    const dAna = await rAna.json();
    analysis = dAna.ok ? dAna.analysis : null;
    if(dAna.temperatura && current && current.id===l.id){ current.temperatura=dAna.temperatura; }
  } catch(e) {}
  const isAI = analysis && analysis.summary;
  const score = isAI ? Math.round(Math.max(0,Math.min(100,(analysis.closeProbability||50)))) : (l.progress_pct!=null?l.progress_pct:leadScore(l));
  const sug = isAI && analysis.suggestedResponse ? analysis.suggestedResponse : `Hola ${nombre}, con gusto te resuelvo lo de la financiación: manejamos cuota inicial baja y plazos flexibles. ¿Agendamos una visita esta semana?`;
  const sentIcon = analysis?.sentiment === 'positivo' ? SVG.check : analysis?.sentiment === 'negativo' ? SVG.zap : SVG.target;
  const sentLabel = analysis?.sentiment ? (analysis.sentiment.charAt(0).toUpperCase()+analysis.sentiment.slice(1)) : '—';
  const body = $('#sheetBody'); if(!body) return;
  body.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">${isAI ? `<span style="font-size:10px;padding:3px 10px;border-radius:999px;background:var(--gold-soft);color:var(--gold)">IA activa</span>` : `<span class="cop-badge">${I(SVG.sparkles,11)} Sin conexión IA</span>`}</div>
    ${isAI ? `
    <div class="cop-card"><h5>${I(SVG.user,14)} Resumen</h5><p>${esc(analysis.summary||'')}</p></div>
    <div class="cop-card"><h5>${I(SVG.target,14)} Sentimiento</h5><p class="cop-sent">${I(sentIcon,14)} ${sentLabel} · score ${analysis.sentimentScore || 0}</p></div>
    ${analysis.objections?.length ? `<div class="cop-card"><h5>${I(SVG.zap,14)} Objeciones</h5>${analysis.objections.map(o=>`<div class="cop-obj">${esc(o)}</div>`).join('')}</div>` : ''}
    <div class="sp-progress-lg" style="margin:12px 0">
      <div class="sp-progress-lg__top"><span>Pipeline</span><span class="sp-progress-lg__num">${score}%</span></div>
      <span class="sp-progress-lg__track"><i style="width:${score}%"></i></span>
      <div class="sp-progress-lg__stages">${[0,25,50,75,100].map(t=>`<span${score>=t?' class="done"':''}></span>`).join('')}</div>
    </div>
    <div class="cop-card"><h5>${I(SVG.chat,14)} Próxima acción</h5><p style="font-size:13px">${esc(analysis.nextAction||'')}</p></div>
    ` : `
    <div class="cop-card"><h5>${I(SVG.user,14)} ${esc(nombre)}</h5><p>${l.messages_count||0} mensajes. Conecta con el cliente para mantener la conversación activa.</p></div>
    <div class="cop-card"><h5>${I(SVG.chat,14)} Respuesta sugerida</h5><p id="copSug">${esc(sug)}</p></div>
    `}
    <div class="cop-card"><h5>${I(SVG.chat,14)} Respuesta sugerida</h5><p id="copSug2">${esc(sug)}</p><button class="cop-use" id="copUse">${I(SVG.sparkles,16)} Usar esta respuesta</button></div>
`;
  $('#copUse').onclick=()=>{ if($('#scChat').classList.contains('show')){ const i=$('#cInput'); const sugText = ($('#copSug2')?.textContent || $('#copSug')?.textContent || '').trim(); if(sugText) i.value=sugText; updateSend(); } closeSheet(); haptic([10,20,10]); toast('Respuesta lista'); };
}
function exportarConversacion(){
  if(!current||!currentMsgs||!currentMsgs.length){ toast('Sin mensajes'); return; }
  const nombre=current.customer_name||'Cliente';
  const lines=currentMsgs.filter(m=>!m.deleted_for_sender).map(m=>{
    const who=m.direction==='incoming'?'Cliente':'Tú';
    const ts=m.timestamp?parseDbDate(m.timestamp).toLocaleString('es-CO',{timeZone:'America/Bogota'}):'';
    const body=m.media_type?`[${m.media_type}]`:m.body||'';
    return `[${ts}] ${who}: ${body}`;
  });
  const txt='Conversación con '+nombre+'\n'+'='.repeat(30)+'\n\n'+lines.join('\n');
  try{ navigator.clipboard.writeText(txt); toast('Copiado al portapapeles'); }catch(e){ toast('No se pudo exportar'); }
}
function vaciarConversacion(){
  if(!current) return;
  if(!confirm('¿Vaciar esta conversación? Esto eliminará los mensajes para ti.')) return;
  api('/api/leads/'+current.id+'/clear-messages',{method:'POST'}).then(async()=>{
    const d=await api(`/api/leads/${current.id}/mensajes`); if(d){ currentMsgs=d.mensajes; renderChat(current,currentMsgs); }
    toast('Conversación vaciada');
  });
}
function abrirNota(){ openSheet('Nota rápida', `<textarea id="ntx" class="c-pill" style="width:100%;min-height:120px;padding:14px;color:var(--text);background:var(--bg-3);border:1px solid var(--border);border-radius:14px;outline:none" placeholder="Ej: Llamar después de las 6 PM. Quiere financiación…"></textarea><button class="cop-use" id="ntok" style="margin-top:12px">Guardar nota</button>`);
  $('#ntok').onclick=async()=>{ const v=$('#ntx').value.trim(); if(!v) return; if(!DEMO&&current) await api(`/api/leads/${current.id}/notas`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nota:v})}); haptic([10,20,10]); closeSheet(); toast('Nota guardada'); };
}
// Antes solo se podía cambiar la etapa DENTRO del chat abierto (abrirEtapa, sobre
// `current`). abrirEtapaPara(l) generaliza lo mismo para poder tocarla también desde
// el chip de la tarjeta en la lista, sin abrir el chat primero.
function abrirEtapaPara(l){
  if(!l) return;
  openSheet('Cambiar etapa', Object.entries(ETQ).map(([v,e])=>`<button class="lp-cell wide" style="display:flex;align-items:center;gap:10px;text-align:left;width:100%;margin-bottom:8px;color:var(--text)" data-etq="${v}"><span class="m-tag t-${e.cls}">${e.t}</span>${(l.etiqueta||'sin_clasificar')===v?'<span style="margin-left:auto;color:var(--gold)">✓</span>':''}</button>`).join(''));
  $('#sheetBody').querySelectorAll('[data-etq]').forEach(b=>b.onclick=async()=>{ const v=b.dataset.etq; if(!DEMO){ await api(`/api/leads/${l.id}/etiqueta`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({etiqueta:v})}); } l.etiqueta=v; haptic([10,20,10]); closeSheet(); renderList(); if(!DEMO) cargar(); toast('Etapa actualizada'); });
}
function abrirEtapa(){ abrirEtapaPara(current); }

async function abrirNuevoLead(){
  const waTemplates = await api('/api/wa-templates') || [];
  openSheet('Nueva conversación', `
    <form id="nlForm" style="display:flex;flex-direction:column;gap:12px">
      <input name="phone" placeholder="Teléfono +573XXXXXXXXX" required inputmode="tel" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:15px;font-family:inherit;outline:none">
      <input name="name" placeholder="Nombre del cliente" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:15px;font-family:inherit;outline:none">
      <textarea name="message" placeholder="Mensaje inicial (opcional)" style="width:100%;min-height:60px;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:15px;font-family:inherit;outline:none;resize:none"></textarea>
      ${waTemplates.length ? `
      <div style="font-size:12px;color:var(--text-3)">Plantilla — obligatoria si el número nunca te ha escrito (WhatsApp exige plantilla aprobada para el primer contacto)</div>
      <select name="templateId" id="nlTemplate" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:15px;font-family:inherit;outline:none">
        <option value="">Sin plantilla</option>
        ${waTemplates.map(t=>`<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}
      </select>
      <div id="nlVarFields"></div>` : `<div style="font-size:12px;color:var(--text-3)">No hay plantillas sincronizadas — pídele al admin que sincronice en Configuración antes de contactar números nuevos.</div>`}
      <button type="submit" class="cop-use" style="margin-top:4px">${I(SVG.send,16)} Iniciar conversación</button>
    </form>`);
  const renderVarFields=()=>{
    const box=$('#nlVarFields'); if(!box) return;
    const sel=$('#nlTemplate'); const tpl=waTemplates.find(t=>String(t.id)===sel.value);
    if(!tpl){ box.innerHTML=''; return; }
    let vars=[]; try{ vars=JSON.parse(tpl.variables||'[]'); }catch(e){}
    let mapping={}; try{ mapping=JSON.parse(tpl.var_mapping||'{}'); }catch(e){}
    if(!vars.length){ box.innerHTML='<div style="font-size:12px;color:var(--text-3)">Esta plantilla no tiene variables.</div>'; return; }
    const nameVal=$('#nlForm [name="name"]')?.value.trim()||'';
    box.innerHTML=vars.map(ph=>{
      const prefill=mapping[ph]==='nombre_cliente'?esc(nameVal):'';
      return `<input type="text" data-var="${esc(ph)}" placeholder="{{${esc(ph)}}}${mapping[ph]?' — '+esc(mapping[ph]):' (sin asignar)'}" value="${prefill}" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:14px;font-family:inherit;outline:none;margin-bottom:4px">`;
    }).join('');
  };
  $('#nlTemplate')?.addEventListener('change', renderVarFields);
  $('#nlForm').addEventListener('submit', async e=>{
    e.preventDefault(); const fd=new FormData(e.target); const phone=fd.get('phone').trim(); const name=fd.get('name').trim(); const message=fd.get('message').trim();
    const templateId=fd.get('templateId')||'';
    const templateVars={}; $('#nlVarFields')?.querySelectorAll('[data-var]').forEach(inp=>{ templateVars[inp.dataset.var]=inp.value.trim(); });
    if(!phone){ toast('Teléfono requerido'); return; }
    haptic(10); closeSheet(); toast('Creando lead...');
    const r=await api('/api/leads/proactive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,name:name||'Cliente',message:message||'Hola, me interesan sus proyectos',templateId:templateId||undefined,templateVars})});
    if(r&&r.leadId){ toast('Lead creado'); cargar(); } else toast('Error al crear lead: '+((r&&r.error)||'desconocido'));
  });
}

function abrirEditarPerfil(){
  const n = me || {};
  openSheet('Editar perfil', `
    <form id="editPerfilForm" style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
        <div class="m-avatar" id="editFotoPreview" style="width:80px;height:80px;border-radius:22px;font-size:30px;background:${avatarColor(n.nombre)};cursor:pointer;position:relative;overflow:hidden">
          ${n.foto ? `<img src="${n.foto}" alt="">` : initials(n.nombre)}
          <div style="position:absolute;inset:0;background:rgba(0,0,0,.4);display:grid;place-items:center;opacity:0;transition:opacity .2s;font-size:22px">📷</div>
        </div>
        <label style="font-size:12px;color:var(--text-3);cursor:pointer">Toca para cambiar foto
          <input type="file" id="editFotoInput" accept="image/*" style="display:none">
        </label>
      </div>
      <label style="font-size:12px;color:var(--text-3);font-weight:500">Nombre</label>
      <input name="nombre" value="${esc(n.nombre||'')}" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:15px;font-family:inherit;outline:none" required>
      <button type="submit" class="cop-use" style="margin-top:4px">${I(SVG.check,16)} Guardar cambios</button>
    </form>`);
  // Preview foto al seleccionar
  const fi = document.getElementById('editFotoInput');
  if (fi) fi.addEventListener('change', function() {
    const file = this.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = function(e) {
      const prev = document.getElementById('editFotoPreview');
      if (prev) prev.innerHTML = '<img src="'+e.target.result+'" alt="">';
    };
    r.readAsDataURL(file);
  });
  // Submit
  const form = document.getElementById('editPerfilForm');
  if (form) form.addEventListener('submit', async function(e) {
    e.preventDefault(); haptic(10);
    const fd = new FormData(this);
    const nombre = fd.get('nombre').trim();
    if (!nombre) { toast('Nombre requerido','err'); return; }
    let ok = true;
    // Cambiar nombre
    const r = await api('/api/me/nombre', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ nombre }) });
    if (r) { me.nombre = nombre; toast('Nombre actualizado'); } else { ok = false; toast('Error al actualizar nombre','err'); }
    // Subir foto si se seleccionó
    const fotoFile = document.getElementById('editFotoInput').files[0];
    if (fotoFile && ok) {
      const toBase64 = f => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(f); });
      const base64 = await toBase64(fotoFile);
      const fr = await api('/api/me/foto', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ foto:'data:image/jpeg;base64,'+base64 }) });
      if (fr) { me.foto = 'data:image/jpeg;base64,'+base64; toast('Foto actualizada'); } else { ok = false; toast('Error al subir foto','err'); }
    }
    closeSheet();
    if (ok) { irTab('perfil'); }
  });
}

/* ════════ Cuenta y seguridad (avanzado) ════════ */
function abrirCambiarPin(){
  openSheet('Cambiar PIN', `
    <form id="pinForm" style="display:flex;flex-direction:column;gap:14px">
      <label style="font-size:12px;color:var(--text-3);font-weight:500">Nuevo PIN (4 dígitos)</label>
      <input id="pinNuevo" type="password" inputmode="numeric" maxlength="4" placeholder="••••" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:18px;text-align:center;letter-spacing:.5em;font-family:inherit;outline:none">
      <label style="font-size:12px;color:var(--text-3);font-weight:500">Confirmar PIN</label>
      <input id="pinConfirm" type="password" inputmode="numeric" maxlength="4" placeholder="••••" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:18px;text-align:center;letter-spacing:.5em;font-family:inherit;outline:none">
      <button type="submit" class="cop-use" style="margin-top:4px">${I(SVG.check,16)} Guardar PIN</button>
    </form>`);
  const form = document.getElementById('pinForm');
  if(form) form.addEventListener('submit', async function(e){
    e.preventDefault(); haptic(10);
    const p1 = document.getElementById('pinNuevo').value.trim();
    const p2 = document.getElementById('pinConfirm').value.trim();
    if(!/^\d{4}$/.test(p1)){ toast('El PIN debe tener 4 dígitos','err'); return; }
    if(p1 === '0000'){ toast('Elige un PIN distinto a 0000','err'); return; }
    if(p1 !== p2){ toast('Los PIN no coinciden','err'); return; }
    const r = await api('/api/mi-pin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ pin: p1 }) });
    if(r){ closeSheet(); toast('PIN actualizado'); }
    else toast('No se pudo cambiar el PIN','err');
  });
}
/* ════════ Mis automatizaciones (reglas propias del asesor) ════════
   El editor de grafo del admin no cabe en un celular: acá el asesor arma la regla en
   lenguaje llano ("Cuando… si… entonces…") y el cliente la traduce al mismo grafo
   {nodes,edges} que ejecuta el motor. Solo corren sobre SUS leads (el backend lo
   fuerza con vendedor_id) y solo con acciones de su ámbito. */
// Mismo catálogo de disparadores que el backend permite para reglas de asesor
// (TRIGGERS_ASESOR en src/index.js) — antes faltaban message:outgoing y
// conversation:closed, así que esos dos disparadores solo eran alcanzables desde el
// editor de grafo del admin, nunca desde acá.
const AUTO_TRIGGERS = [
  ['message:incoming', 'Un cliente me escribe'],
  ['message:outgoing', 'Yo le respondo a un cliente'],
  ['button:clicked', 'Un cliente pulsa un botón de plantilla'],
  ['conversation:assigned', 'Me asignan un chat nuevo'],
  ['conversation:closed', 'Cierro una conversación'],
  ['lead:inactive', 'Un cliente lleva horas sin responder'],
  ['lead:caliente', 'Un lead se califica como caliente'],
  ['cita:creada', 'Agendo una cita'],
  ['tarea:vencida', 'Se me vence una tarea'],
  ['lead:tag_changed', 'Cambia la etapa de un lead'],
  ['campana:finalizada', 'Termina una campaña masiva'],
];
// Mismo catálogo que ACCIONES_ASESOR en src/index.js — antes faltaba send_template.
const AUTO_ACCIONES = [
  ['crear_tarea', 'Crearme una tarea', 'texto', 'Texto de la tarea', 'Dar seguimiento a {{cliente}}'],
  ['nota_interna', 'Dejar una nota interna', 'texto', 'Nota', ''],
  ['set_etapa', 'Mover el lead de etapa', 'etapa', 'Nueva etapa', 'interesado'],
  ['tag', 'Ponerle una etiqueta', 'etapa', 'Etiqueta', 'interesado'],
  ['marcar_temperatura', 'Marcar la temperatura', 'temp', 'Temperatura', 'caliente'],
  ['send_message', 'Responderle al cliente', 'texto', 'Mensaje a enviar', ''],
  ['send_template', 'Enviarle una plantilla de WhatsApp', 'texto', 'Nombre exacto de la plantilla', ''],
  ['crear_cita', 'Agendarme una cita', 'texto', 'Título de la cita', 'Cita con {{cliente}}'],
  ['posponer', 'Posponer el chat', 'horas', 'Posponer (horas)', '24'],
  ['iniciar_cadencia', 'Iniciar la cadencia de seguimiento', null, '', ''],
  ['detener_cadencia', 'Detener la cadencia de seguimiento', null, '', ''],
  ['notificar_asesor', 'Avisarme por notificación', 'texto', 'Aviso', 'Revisa el chat de {{cliente}}'],
];
const AUTO_ETAPAS = [['sin_clasificar','Sin clasificar'],['interesado','Interesado'],['cita','Cita'],['negociacion','Negociación'],['vendido','Vendido'],['perdido','Perdido']];
// Mismos 14 campos y 5 operadores que el editor de grafo del admin (CAMPOS/OPERADORES
// en public/os/automatizaciones.html) — antes el editor del asesor solo podía condicionar
// por "el mensaje contiene X", el resto (etiqueta, proyecto, temperatura, asesor…) era
// inalcanzable desde el celular.
const AUTO_CAMPOS = [['body','Texto del mensaje'],['button_payload','Botón pulsado (id)'],['channel','Canal'],['customer_name','Nombre del cliente'],['etiqueta','Etiqueta'],['status','Estado'],['priority','Prioridad'],['zona','Zona del lead'],['proyecto','Proyecto'],['ciudad','Ciudad'],['origen','Origen del lead'],['presupuesto','Presupuesto'],['temperatura','Temperatura'],['asesor','Asesor asignado']];
const AUTO_OPERADORES = [['contains','contiene'],['equals','es igual a'],['not_equals','es distinto de'],['in','está en (lista)'],['regex','coincide (regex)']];

function _autoOverlay(html){
  const ov = document.createElement('div');
  ov.id = 'autoOverlay';
  ov.className = 'm-overlay';
  ov.innerHTML = html;
  document.body.appendChild(ov);
  return ov;
}
function _autoCerrar(){ const ov = document.getElementById('autoOverlay'); if(ov && ov.parentNode) ov.parentNode.removeChild(ov); }

async function abrirMisAutomatizaciones(){
  const ov = _autoOverlay(`<div style="display:flex;align-items:center;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:12px">
      <button id="autoBack" style="background:none;border:none;color:var(--gold);font-size:24px;padding:0 4px;cursor:pointer;line-height:1">←</button>
      <div style="min-width:0;flex:1"><div style="font-weight:600;font-size:15px">Mis automatizaciones</div>
      <div style="font-size:11px;color:var(--text-3)">Solo se aplican a tus chats</div></div>
      <button id="autoNueva" style="border:1px solid rgba(200,164,90,.4);background:rgba(200,164,90,.08);color:var(--gold);border-radius:10px;padding:8px 14px;font-size:12px;cursor:pointer;font-family:inherit">+ Nueva</button>
    </div>
    <div id="autoLista">${skeletonCards(2)}</div>`);
  document.getElementById('autoBack').onclick = _autoCerrar;
  document.getElementById('autoNueva').onclick = () => abrirEditorAutomatizacion(null);
  await _autoRenderLista();
}

async function _autoRenderLista(){
  const box = document.getElementById('autoLista');
  if(!box) return;
  const reglas = await api('/api/mis-automatizaciones') || [];
  if(!reglas.length){
    box.innerHTML = `<div style="text-align:center;color:var(--text-3);padding:34px 16px;font-size:13px;line-height:1.6">
      Todavía no tienes automatizaciones.<br>Crea una para que el CRM trabaje por ti:<br>
      <span style="color:var(--text-2)">“Cuando un cliente pulsa <b>Sigo interesado</b> → créame una tarea”.</span></div>`;
    return;
  }
  box.innerHTML = reglas.map(r => {
    const g = _autoParse(r.graph);
    const trg = (AUTO_TRIGGERS.find(t => t[0] === r.trigger_event) || [null, r.trigger_event])[1];
    const accLabels = g.acciones.map(a => (AUTO_ACCIONES.find(x => x[0] === a.tipo) || [null, a.tipo])[1]);
    const acc = accLabels.length > 2 ? `${accLabels[0]} + ${accLabels.length - 1} más` : (accLabels.join(' + ') || '—');
    const condTxt = g.condiciones.length === 1
      ? ` y ${(AUTO_CAMPOS.find(c=>c[0]===g.condiciones[0].field)||[null,g.condiciones[0].field])[1]} ${(AUTO_OPERADORES.find(o=>o[0]===g.condiciones[0].operator)||[null,''])[1]} “${esc(g.condiciones[0].value)}”`
      : g.condiciones.length > 1 ? ` y ${g.condiciones.length} condiciones` : '';
    const delayTxt = g.delay ? `, espera ${g.delay.amount} ${({minutes:'min',hours:'h',days:'d'})[g.delay.unit]||g.delay.unit}` : '';
    return `<div style="background:var(--bg-2);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <b style="flex:1;font-size:14px">${esc(r.nombre)}</b>
        <button class="autoTog" data-id="${r.id}" data-a="${r.activo?0:1}" style="border:none;background:${r.activo?'rgba(78,123,70,.18)':'rgba(255,255,255,.06)'};color:${r.activo?'#4E7B46':'var(--text-3)'};border-radius:999px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit">${r.activo?'Activa':'Pausada'}</button>
      </div>
      <div style="font-size:12px;color:var(--text-2);margin-top:6px;line-height:1.5">Cuando <b>${esc(trg)}</b>${condTxt}${delayTxt} → <b>${esc(acc)}</b></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="autoEdit" data-id="${r.id}" style="flex:1;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);border-radius:10px;padding:8px;font-size:12px;cursor:pointer;font-family:inherit">Editar</button>
        <button class="autoDel" data-id="${r.id}" style="border:1px solid rgba(229,72,77,.3);background:rgba(229,72,77,.08);color:var(--red);border-radius:10px;padding:8px 14px;font-size:12px;cursor:pointer;font-family:inherit">Borrar</button>
      </div>
    </div>`;
  }).join('');

  box.querySelectorAll('.autoTog').forEach(b => b.onclick = async () => {
    const r = await api('/api/mis-automatizaciones/' + b.dataset.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ activo: b.dataset.a === '1' }) });
    if(r) _autoRenderLista(); else toast('No se pudo cambiar','err');
  });
  box.querySelectorAll('.autoEdit').forEach(b => b.onclick = () => {
    abrirEditorAutomatizacion(reglas.find(x => String(x.id) === b.dataset.id));
  });
  box.querySelectorAll('.autoDel').forEach(b => b.onclick = async () => {
    if(!confirm('¿Borrar esta automatización?')) return;
    const r = await api('/api/mis-automatizaciones/' + b.dataset.id, { method:'DELETE' });
    if(r) _autoRenderLista(); else toast('No se pudo borrar','err');
  });
}

// Lee del grafo guardado los tres datos que maneja el editor móvil (trigger, condición
// de texto y acción). Los grafos que el admin haya hecho más complejos se muestran igual,
// pero editarlos desde aquí los simplifica — por eso el aviso al abrir el editor.
function _autoParse(graphStr){
  try{
    const g = typeof graphStr === 'string' ? JSON.parse(graphStr) : graphStr;
    const nodes = (g && g.nodes) || [];
    const cond = nodes.find(n => n.type === 'condition');
    const delayNode = nodes.find(n => n.type === 'delay');
    return {
      trigger: nodes.find(n => n.type === 'trigger') || null,
      condiciones: cond && cond.params && Array.isArray(cond.params.conditions) ? cond.params.conditions.map(c=>({...c})) : [],
      delay: delayNode ? { amount:(delayNode.params&&delayNode.params.amount)||30, unit:(delayNode.params&&delayNode.params.unit)||'minutes' } : null,
      acciones: nodes.filter(n => n.type === 'action').map(n => ({ tipo:n.subtype, params:{...(n.params||{})} })),
    };
  }catch(e){ return { trigger:null, condiciones:[], delay:null, acciones:[] }; }
}

// Nombre del parámetro que espera el motor para cada acción (ver executeAction en
// src/services/workflow.js).
function _autoClaveParam(accion){
  return { crear_tarea:'texto', nota_interna:'texto', set_etapa:'etiqueta', tag:'value',
    marcar_temperatura:'temperatura', send_message:'text', send_template:'name', crear_cita:'titulo',
    posponer:'enHoras', notificar_asesor:'message' }[accion] || 'texto';
}

function _autoParamHTML(def, val){
  if(!def || !def[2]) return '<div class="auto-hint">Esta acción no necesita más datos.</div>';
  const [, , tipo, label] = def;
  if(tipo === 'etapa'){
    return `<label class="auto-label">${label}</label><select class="aParamInput">${AUTO_ETAPAS.map(([v,l])=>`<option value="${v}" ${String(val)===v?'selected':''}>${l}</option>`).join('')}</select>`;
  }
  if(tipo === 'temp'){
    return `<label class="auto-label">${label}</label><select class="aParamInput">${[['caliente','Caliente'],['tibio','Tibio'],['frio','Frío']].map(([v,l])=>`<option value="${v}" ${String(val)===v?'selected':''}>${l}</option>`).join('')}</select>`;
  }
  if(tipo === 'horas'){
    return `<label class="auto-label">${label}</label><input class="aParamInput" type="number" min="1" value="${esc(String(val||24))}">`;
  }
  return `<label class="auto-label">${label}</label><textarea class="aParamInput" rows="2" placeholder="Puedes usar {{cliente}} y {{proyecto}}">${esc(String(val||''))}</textarea>`;
}

// Traduce la regla del formulario al grafo {nodes,edges} del motor. Ahora admite varias
// condiciones (antes solo "el mensaje contiene X"), un retardo opcional entre el
// disparador y las acciones, y varias acciones en secuencia (antes como máximo una) —
// mismo motor, mismo formato de grafo que ya ejecuta src/services/workflow.js.
function _autoConstruirGrafo({ trigger, horas, condiciones, delay, acciones }){
  const nodes = [];
  const pasos = [];
  if(condiciones && condiciones.length){
    pasos.push({ id:'n_cond', type:'condition', params:{ logic:'and', conditions:condiciones } });
  }
  if(delay && Number(delay.amount) > 0){
    pasos.push({ id:'n_delay', type:'delay', params:{ amount:Number(delay.amount), unit:delay.unit||'minutes' } });
  }
  (acciones||[]).forEach((a,i) => pasos.push({ id:'n_accion_'+i, type:'action', subtype:a.tipo, params:a.params||{} }));

  const tParams = trigger === 'lead:inactive' ? { hours: Number(horas) || 24 } : {};
  nodes.push({ id:'n_trigger', type:'trigger', subtype:trigger, params:tParams, x:60, y:60 });

  const edges = [];
  let previo = 'n_trigger';
  let y = 180;
  pasos.forEach((paso, i) => {
    nodes.push({ ...paso, x:60, y });
    // Solo la rama VERDADERA de una condición continúa — si no se cumple, la regla no
    // hace nada (no hay "si no" en este editor simplificado).
    const previoEsCondicion = i > 0 && pasos[i-1].type === 'condition';
    edges.push({ from:previo, to:paso.id, ...(previoEsCondicion?{branch:'true'}:{}) });
    previo = paso.id;
    y += 120;
  });
  return { nodes, edges };
}

function abrirEditorAutomatizacion(regla){
  const g = regla ? _autoParse(regla.graph) : { trigger:null, condiciones:[], delay:null, acciones:[] };
  const triggerActual = regla ? regla.trigger_event : 'message:incoming';
  let condiciones = g.condiciones.map(c=>({...c}));
  let delayActivo = !!g.delay;
  let delayAmount = g.delay ? g.delay.amount : 30;
  let delayUnit = g.delay ? g.delay.unit : 'minutes';
  let acciones = g.acciones.length ? g.acciones.map(a=>({...a, params:{...a.params}})) : [{ tipo:'crear_tarea', params:{} }];

  _autoCerrar();
  _autoOverlay(`<div style="display:flex;align-items:center;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:14px">
      <button id="autoBack" style="background:none;border:none;color:var(--gold);font-size:24px;padding:0 4px;cursor:pointer;line-height:1">←</button>
      <div style="font-weight:600;font-size:15px">${regla?'Editar':'Nueva'} automatización</div>
    </div>
    <label style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Nombre</label>
    <input id="autoNombre" value="${esc(regla?regla.nombre:'')}" placeholder="Ej: Avisarme cuando confirmen interés" style="width:100%;height:44px;background:var(--bg-3);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:0 12px;font-size:14px;font-family:inherit;margin:6px 0 14px">

    <label style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Cuando…</label>
    <select id="autoTrigger" style="width:100%;height:44px;background:var(--bg-3);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:0 10px;font-size:14px;font-family:inherit;margin:6px 0 14px">
      ${AUTO_TRIGGERS.map(([v,l]) => `<option value="${v}" ${triggerActual===v?'selected':''}>${l}</option>`).join('')}
    </select>
    <div id="autoTriggerExtra"></div>

    <label style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Condiciones (opcional)</label>
    <div id="condList" style="margin-top:6px"></div>
    <button type="button" class="auto-add-btn" id="btnAddCond">+ Agregar condición</button>

    <label class="auto-toggle-row"><input type="checkbox" id="delayToggle"> Esperar antes de actuar</label>
    <div id="delayBox"></div>

    <label style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Entonces…</label>
    <div id="accList" style="margin-top:6px"></div>
    <button type="button" class="auto-add-btn" id="btnAddAcc">+ Agregar otra acción</button>

    <button id="autoGuardar" style="width:100%;height:48px;margin-top:8px;border-radius:14px;border:none;background:var(--gold);color:#0A0A0A;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">Guardar</button>`);

  document.getElementById('autoBack').onclick = () => { _autoCerrar(); abrirMisAutomatizaciones(); };

  const selTrigger = document.getElementById('autoTrigger');
  function pintarExtraTrigger(){
    const box = document.getElementById('autoTriggerExtra');
    const horas = (g.trigger && g.trigger.params && g.trigger.params.hours) || 24;
    box.innerHTML = selTrigger.value === 'lead:inactive'
      ? `<label style="font-size:11px;color:var(--text-3)">Horas sin responder</label>
         <input id="autoHoras" type="number" min="1" value="${horas}" style="width:100%;height:44px;background:var(--bg-3);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:0 12px;font-size:14px;font-family:inherit;margin:6px 0 14px">`
      : '';
  }
  selTrigger.onchange = pintarExtraTrigger;
  pintarExtraTrigger();

  // ── Condiciones (0..N) ──
  function renderCondiciones(){
    const box = document.getElementById('condList');
    if(!condiciones.length){ box.innerHTML = '<div class="auto-hint">Sin condiciones — se ejecuta siempre que ocurra el disparador.</div>'; return; }
    box.innerHTML = condiciones.map((c,i) => `
      <div class="auto-row" data-i="${i}">
        <select class="cCampo">${AUTO_CAMPOS.map(([v,l])=>`<option value="${v}" ${c.field===v?'selected':''}>${l}</option>`).join('')}</select>
        <select class="cOp">${AUTO_OPERADORES.map(([v,l])=>`<option value="${v}" ${c.operator===v?'selected':''}>${l}</option>`).join('')}</select>
        <input class="cVal" value="${esc(c.value||'')}" placeholder="valor">
        <button type="button" class="auto-del-btn" data-del>✕</button>
      </div>`).join('');
    box.querySelectorAll('.auto-row').forEach(row => {
      const i = Number(row.dataset.i);
      row.querySelector('.cCampo').onchange = e => { condiciones[i].field = e.target.value; };
      row.querySelector('.cOp').onchange = e => { condiciones[i].operator = e.target.value; };
      row.querySelector('.cVal').oninput = e => { condiciones[i].value = e.target.value; };
      row.querySelector('[data-del]').onclick = () => { condiciones.splice(i,1); renderCondiciones(); };
    });
  }
  document.getElementById('btnAddCond').onclick = () => { condiciones.push({ field:'body', operator:'contains', value:'' }); renderCondiciones(); };
  renderCondiciones();

  // ── Retardo opcional ──
  function renderDelay(){
    document.getElementById('delayBox').innerHTML = delayActivo ? `
      <div class="auto-row">
        <input id="delayAmount" type="number" min="1" value="${delayAmount}">
        <select id="delayUnit">
          <option value="minutes" ${delayUnit==='minutes'?'selected':''}>minutos</option>
          <option value="hours" ${delayUnit==='hours'?'selected':''}>horas</option>
          <option value="days" ${delayUnit==='days'?'selected':''}>días</option>
        </select>
      </div>` : '';
    if(delayActivo){
      document.getElementById('delayAmount').oninput = e => { delayAmount = e.target.value; };
      document.getElementById('delayUnit').onchange = e => { delayUnit = e.target.value; };
    }
  }
  const delayToggle = document.getElementById('delayToggle');
  delayToggle.checked = delayActivo;
  delayToggle.onchange = e => { delayActivo = e.target.checked; renderDelay(); };
  renderDelay();

  // ── Acciones (1..N) ──
  function renderAcciones(){
    const box = document.getElementById('accList');
    box.innerHTML = acciones.map((a,i) => {
      const def = AUTO_ACCIONES.find(x => x[0] === a.tipo) || AUTO_ACCIONES[0];
      const clave = _autoClaveParam(a.tipo);
      const val = a.params[clave] != null ? a.params[clave] : (def[4]||'');
      return `<div class="auto-row--stack" data-i="${i}">
        <div class="auto-row__head">
          <select class="aTipo">${AUTO_ACCIONES.map(([v,l])=>`<option value="${v}" ${a.tipo===v?'selected':''}>${l}</option>`).join('')}</select>
          ${acciones.length>1?'<button type="button" class="auto-del-btn" data-del>✕</button>':''}
        </div>
        <div class="aParamBox">${_autoParamHTML(def, val)}</div>
      </div>`;
    }).join('');
    box.querySelectorAll('.auto-row--stack').forEach(row => {
      const i = Number(row.dataset.i);
      row.querySelector('.aTipo').onchange = e => { acciones[i] = { tipo:e.target.value, params:{} }; renderAcciones(); };
      const pInput = row.querySelector('.aParamInput');
      if(pInput) pInput.oninput = pInput.onchange = e => { acciones[i].params[_autoClaveParam(acciones[i].tipo)] = e.target.value; };
      const del = row.querySelector('[data-del]');
      if(del) del.onclick = () => { acciones.splice(i,1); renderAcciones(); };
    });
  }
  document.getElementById('btnAddAcc').onclick = () => { acciones.push({ tipo:'crear_tarea', params:{} }); renderAcciones(); };
  renderAcciones();

  document.getElementById('autoGuardar').onclick = async () => {
    const nombre = document.getElementById('autoNombre').value.trim();
    if(!nombre){ toast('Ponle un nombre a la regla','err'); return; }
    if(!acciones.length){ toast('Agrega al menos una acción','err'); return; }
    const horasInp = document.getElementById('autoHoras');
    const condicionesLimpias = condiciones.filter(c => c.value !== '' && c.value != null);
    const cuerpo = {
      nombre,
      trigger_event: selTrigger.value,
      graph: _autoConstruirGrafo({
        trigger: selTrigger.value,
        horas: horasInp ? Number(horasInp.value) : null,
        condiciones: condicionesLimpias,
        delay: delayActivo ? { amount:delayAmount, unit:delayUnit } : null,
        acciones,
      }),
    };
    const r = regla
      ? await apiDetailed('/api/mis-automatizaciones/' + regla.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cuerpo) })
      : await apiDetailed('/api/mis-automatizaciones', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cuerpo) });
    if(r && !r._error){ toast('Automatización guardada'); _autoCerrar(); abrirMisAutomatizaciones(); }
    else toast((r && (r.detalle || r.error)) || 'No se pudo guardar','err');
  };
}

/* ════════ Mis plantillas de WhatsApp (propuestas del asesor) ════════
   El asesor redacta la plantilla y queda EN REVISIÓN: no viaja a Meta hasta que el
   admin o un jefe la aprueba. Cada rechazo de Meta castiga la calidad del número de
   toda la empresa, por eso el filtro humano va primero. */
const TPL_ESTADOS = {
  EN_REVISION: { t:'En revisión interna', c:'#C8A45A' },
  CORRECCION:  { t:'Necesita cambios',    c:'#E5484D' },
  PENDING:     { t:'En revisión de Meta', c:'#C8A45A' },
  APPROVED:    { t:'Aprobada',            c:'#4E7B46' },
  REJECTED:    { t:'Rechazada por Meta',  c:'#E5484D' },
  PAUSED:      { t:'Pausada por Meta',    c:'#E5484D' },
};

async function abrirMisPlantillasWA(){
  const ov = _autoOverlay(`<div style="display:flex;align-items:center;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:12px">
      <button id="autoBack" style="background:none;border:none;color:var(--gold);font-size:24px;padding:0 4px;cursor:pointer;line-height:1">←</button>
      <div style="min-width:0;flex:1"><div style="font-weight:600;font-size:15px">Mis plantillas</div>
      <div style="font-size:11px;color:var(--text-3)">Las revisa un jefe antes de mandarlas a Meta</div></div>
      <button id="tplNueva" style="border:1px solid rgba(200,164,90,.4);background:rgba(200,164,90,.08);color:var(--gold);border-radius:10px;padding:8px 14px;font-size:12px;cursor:pointer;font-family:inherit">+ Nueva</button>
    </div>
    <div id="tplLista">${skeletonCards(2)}</div>`);
  document.getElementById('autoBack').onclick = _autoCerrar;
  document.getElementById('tplNueva').onclick = () => abrirEditorPlantillaWA(null);
  await _tplRenderLista();
}

async function _tplRenderLista(){
  const box = document.getElementById('tplLista');
  if(!box) return;
  const lista = await api('/api/mis-plantillas') || [];
  if(!lista.length){
    box.innerHTML = `<div style="text-align:center;color:var(--text-3);padding:34px 16px;font-size:13px;line-height:1.6">
      Todavía no has propuesto ninguna plantilla.<br>Escribe la tuya y un jefe la revisa antes de enviarla a WhatsApp.</div>`;
    return;
  }
  box.innerHTML = lista.map(t => {
    const est = TPL_ESTADOS[String(t.estado)] || { t: t.estado || '—', c:'var(--text-3)' };
    const editable = ['EN_REVISION','CORRECCION'].includes(String(t.estado));
    let cuerpo = '';
    try { const s = JSON.parse(t.spec_json||'{}'); cuerpo = (s.body && s.body.texto) || ''; } catch(e){}
    return `<div style="background:var(--bg-2);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <b style="flex:1;font-size:14px">${esc(t.nombre)}</b>
        <span style="font-size:11px;color:${est.c}">${esc(est.t)}</span>
      </div>
      <div style="font-size:12px;color:var(--text-2);margin-top:6px;line-height:1.5">${esc(cuerpo.slice(0,140))}</div>
      ${t.motivo_rechazo?`<div style="margin-top:8px;background:rgba(229,72,77,.1);border:1px solid rgba(229,72,77,.25);border-radius:10px;padding:8px;font-size:11.5px;color:var(--text-2)">✏️ ${esc(t.motivo_rechazo)}</div>`:''}
      ${editable?`<div style="display:flex;gap:8px;margin-top:10px">
        <button class="tplEdit" data-id="${t.id}" style="flex:1;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);border-radius:10px;padding:8px;font-size:12px;cursor:pointer;font-family:inherit">Editar</button>
        <button class="tplDel" data-id="${t.id}" style="border:1px solid rgba(229,72,77,.3);background:rgba(229,72,77,.08);color:var(--red);border-radius:10px;padding:8px 14px;font-size:12px;cursor:pointer;font-family:inherit">Borrar</button>
      </div>`:''}
    </div>`;
  }).join('');

  box.querySelectorAll('.tplEdit').forEach(b => b.onclick = () => abrirEditorPlantillaWA(lista.find(x => String(x.id) === b.dataset.id)));
  box.querySelectorAll('.tplDel').forEach(b => b.onclick = async () => {
    if(!confirm('¿Borrar esta propuesta?')) return;
    const r = await api('/api/mis-plantillas/' + b.dataset.id, { method:'DELETE' });
    if(r) _tplRenderLista(); else toast('No se pudo borrar','err');
  });
}

function abrirEditorPlantillaWA(tpl){
  let spec = { categoria:'MARKETING', idioma:'es', body:{ texto:'', ejemplos:{} }, footer:{ texto:'' } };
  try { if(tpl && tpl.spec_json) spec = Object.assign(spec, JSON.parse(tpl.spec_json)); } catch(e){}

  _autoCerrar();
  _autoOverlay(`<div style="display:flex;align-items:center;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:14px">
      <button id="autoBack" style="background:none;border:none;color:var(--gold);font-size:24px;padding:0 4px;cursor:pointer;line-height:1">←</button>
      <div style="font-weight:600;font-size:15px">${tpl?'Editar':'Nueva'} plantilla</div>
    </div>
    ${tpl && tpl.motivo_rechazo?`<div style="background:rgba(229,72,77,.1);border:1px solid rgba(229,72,77,.25);border-radius:12px;padding:10px;font-size:12px;color:var(--text-2);margin-bottom:12px">✏️ Corrección pedida: ${esc(tpl.motivo_rechazo)}</div>`:''}

    <label style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Nombre interno</label>
    <input id="tplNombre" value="${esc(tpl?tpl.nombre:'')}" ${tpl?'disabled':''} placeholder="ej: seguimiento_lote" style="width:100%;height:44px;background:var(--bg-3);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:0 12px;font-size:14px;font-family:inherit;margin:6px 0 4px">
    <div style="font-size:11px;color:var(--text-3);margin-bottom:14px">Solo minúsculas, números y guion bajo. No se puede cambiar después.</div>

    <label style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Tipo</label>
    <select id="tplCategoria" style="width:100%;height:44px;background:var(--bg-3);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:0 10px;font-size:14px;font-family:inherit;margin:6px 0 14px">
      <option value="MARKETING" ${spec.categoria==='MARKETING'?'selected':''}>Marketing (promociones, reenganche)</option>
      <option value="UTILITY" ${spec.categoria==='UTILITY'?'selected':''}>Utilidad (confirmaciones, recordatorios)</option>
    </select>

    <label style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Mensaje</label>
    <textarea id="tplCuerpo" rows="6" placeholder="Hola {{nombre_cliente}}, te escribo por el proyecto..." style="width:100%;background:var(--bg-3);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:10px 12px;font-size:14px;font-family:inherit;margin:6px 0 4px;resize:vertical">${esc((spec.body&&spec.body.texto)||'')}</textarea>
    <div style="font-size:11px;color:var(--text-3);margin-bottom:14px">Puedes usar variables como <span style="color:var(--gold)">{{nombre_cliente}}</span> o <span style="color:var(--gold)">{{proyecto}}</span>. No empieces ni termines el mensaje con una variable.</div>

    <div id="tplEjemplos"></div>

    <label style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Pie (opcional)</label>
    <input id="tplPie" value="${esc((spec.footer&&spec.footer.texto)||'')}" maxlength="60" placeholder="Sp Leons Group" style="width:100%;height:44px;background:var(--bg-3);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:0 12px;font-size:14px;font-family:inherit;margin:6px 0 14px">

    <button id="tplGuardar" style="width:100%;height:48px;margin-top:8px;border-radius:14px;border:none;background:var(--gold);color:#0A0A0A;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">Enviar a revisión</button>
    <div id="tplErrores" style="margin-top:12px"></div>`);

  document.getElementById('autoBack').onclick = () => { _autoCerrar(); abrirMisPlantillasWA(); };

  // Meta exige un valor de ejemplo por variable: se piden a medida que el asesor
  // las escribe, en vez de rechazarle la plantilla al final sin explicación.
  const cuerpoEl = document.getElementById('tplCuerpo');
  function pintarEjemplos(){
    const box = document.getElementById('tplEjemplos');
    const vars = [...new Set((cuerpoEl.value.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)||[]).map(v => v.replace(/[{}\s]/g,'')))];
    if(!vars.length){ box.innerHTML=''; return; }
    const prev = (spec.body && spec.body.ejemplos) || {};
    box.innerHTML = `<label style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Ejemplos para WhatsApp</label>
      <div style="font-size:11px;color:var(--text-3);margin:4px 0 8px">Meta pide un valor de muestra por cada variable.</div>` +
      vars.map(v => `<div style="margin-bottom:8px"><div style="font-size:11px;color:var(--gold);margin-bottom:4px">{{${esc(v)}}}</div>
        <input class="tplEj" data-v="${esc(v)}" value="${esc(prev[v]||'')}" placeholder="ej: Jeremías" style="width:100%;height:40px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:0 12px;font-size:13px;font-family:inherit"></div>`).join('');
  }
  cuerpoEl.addEventListener('input', pintarEjemplos);
  pintarEjemplos();

  document.getElementById('tplGuardar').onclick = async () => {
    const ejemplos = {};
    document.querySelectorAll('.tplEj').forEach(i => { ejemplos[i.dataset.v] = i.value.trim(); });
    const nuevoSpec = {
      nombre: tpl ? tpl.nombre : document.getElementById('tplNombre').value.trim(),
      idioma: 'es',
      categoria: document.getElementById('tplCategoria').value,
      body: { texto: cuerpoEl.value, ejemplos },
      footer: { texto: document.getElementById('tplPie').value.trim() },
    };
    const r = tpl
      ? await apiDetailed('/api/mis-plantillas/' + tpl.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ spec:nuevoSpec }) })
      : await apiDetailed('/api/mis-plantillas', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ spec:nuevoSpec }) });
    const errBox = document.getElementById('tplErrores');
    if(r && !r._error){ toast('Enviada a revisión'); _autoCerrar(); abrirMisPlantillasWA(); return; }
    // Los errores de validación son la parte útil: se listan tal cual los devuelve el
    // validador, que ya habla en términos de lo que Meta acepta.
    const errores = (r && r.errores) || [];
    errBox.innerHTML = `<div style="background:rgba(229,72,77,.1);border:1px solid rgba(229,72,77,.25);border-radius:12px;padding:10px;font-size:12px;color:var(--text-2)">
      ${errores.length ? errores.map(e => '• ' + esc(e.mensaje || String(e))).join('<br>') : esc((r && (r.detalle||r.error)) || 'No se pudo guardar')}</div>`;
  };
}

function abrirSesiones(){
  openSheet('Sesiones activas', '<div id="sesList" style="max-height:340px;overflow-y:auto"><div style="text-align:center;color:var(--text-3);padding:24px;font-size:13px">Cargando…</div></div>');
  (async()=>{
    const list = await api('/api/me/sesiones') || [];
    const box = document.getElementById('sesList');
    if(!box) return;
    if(!list.length){ box.innerHTML = '<div style="text-align:center;color:var(--text-3);padding:24px;font-size:13px">Sin sesiones activas</div>'; return; }
    box.innerHTML = list.map(s=>`<div class="ctx-item" data-ses="${encodeURIComponent(s.token)}"><div style="min-width:0;flex:1"><div style="font-size:13px;font-weight:600">${esc(s.dispositivo||'Dispositivo')}${s.actual?' <span style="color:var(--gold);font-size:11px;font-weight:500">· este dispositivo</span>':''}</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">${fmtTs(s.ultima_actividad)}</div></div>${s.actual?'':'<span style="flex-shrink:0;color:var(--red);font-size:12px">Cerrar</span>'}</div>`).join('') +
      '<button id="btnCerrarTodas" style="width:100%;height:44px;margin-top:10px;border-radius:12px;border:1px solid rgba(229,72,77,.3);background:rgba(229,72,77,.08);color:var(--red);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Cerrar sesiones de otros dispositivos</button>';
    box.querySelectorAll('[data-ses]').forEach(el=>el.onclick=async()=>{
      const tok = decodeURIComponent(el.dataset.ses);
      const r = await api('/api/me/sesiones/'+tok, { method:'DELETE' });
      if(r){ toast('Sesión cerrada'); abrirSesiones(); }
      else toast('No se pudo cerrar la sesión','err');
    });
    const ct = document.getElementById('btnCerrarTodas');
    if(ct) ct.onclick = async ()=>{
      const r = await api('/api/me/cerrar-todas', { method:'POST' });
      if(r){ toast('Sesiones cerradas'); abrirSesiones(); }
      else toast('No se pudo cerrar','err');
    };
  })();
}
function exportarPerfil(){
  (async()=>{
    if(!me || !me.vendedorId){ toast('Sin cuenta asociada','err'); return; }
    const data = await api('/api/vendedores/'+me.vendedorId+'/perfil');
    if(!data){ toast('No se pudo exportar','err'); return; }
    const blob = new Blob([JSON.stringify(data,null,2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mi-perfil-'+me.vendedorId+'.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
    toast('Perfil exportado');
  })();
}
function fmtTs(ts){
  if(!ts) return '—';
  const n = typeof ts === 'number' ? (ts > 1e12 ? ts : ts*1000) : new Date(ts).getTime();
  if(!n || isNaN(n)) return '—';
  const d = new Date(n);
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return d.getDate()+' '+meses[d.getMonth()]+' · '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function cargarVersionApp(){
  api('/api/app/version').then(v=>{
    const lbl = document.getElementById('lblVersion');
    if(lbl && v && v.versionName) lbl.textContent = v.versionName;
  });
}

/* ════════ Onboarding — antes no existía nada que le enseñara la app a un asesor
   nuevo (crítico para asesores de otros grupos que van a entrar sin que nadie los
   capacite). Se muestra solo una vez por dispositivo; desde Perfil → Ayuda se puede
   volver a ver cuando quiera. ════════ */
function mostrarOnboardingSiCorresponde(){
  if(localStorage.getItem('sp_onboarding_visto')) return;
  abrirOnboarding();
}
function abrirOnboarding(){
  let paso = 0;
  const pasos = [
    { icon:'👋', titulo:`Bienvenido${me&&me.nombre?', '+me.nombre.split(' ')[0]:''}`, texto:'Este panel es tu herramienta de trabajo: acá hablas con tus clientes, agendas visitas y cierras ventas. Te mostramos rápido cómo se usa — toma menos de un minuto.' },
    { icon:'💬', titulo:'Chats', texto:'Acá llegan los clientes que te asignan. Mantén presionada una tarjeta para llamar, archivar, cambiar de etapa o posponer. Dentro del chat, desliza un mensaje para responderlo y mantenlo presionado para más opciones (copiar, destacar, reenviar).' },
    { icon:'🗺️', titulo:'Mapa y Tareas', texto:'El Mapa te ubica a ti y a tus clientes por zona, y guarda tu recorrido del día. Tareas son tus recordatorios personales — te avisan aunque tengas la app cerrada.' },
    { icon:'⚙️', titulo:'Perfil', texto:'Ahí ves tus métricas y tus comisiones, y puedes crear tus propias respuestas rápidas y automatizaciones. Si alguna vez te pierdes, vuelve a esta guía tocando "Cómo usar la app" en Ayuda.' },
  ];
  function render(){
    const p = pasos[paso];
    const esUltimo = paso === pasos.length-1;
    let ov = document.getElementById('onbOverlay');
    if(!ov){ ov = document.createElement('div'); ov.id = 'onbOverlay'; ov.className = 'm-overlay m-overlay--center'; ov.style.zIndex = '7000'; document.body.appendChild(ov); }
    ov.innerHTML = `
      <div style="font-size:52px;margin-bottom:18px">${p.icon}</div>
      <div style="font-size:19px;font-weight:700;margin-bottom:10px">${esc(p.titulo)}</div>
      <div style="font-size:14px;color:var(--text-2);line-height:1.6;max-width:320px;margin-bottom:28px">${esc(p.texto)}</div>
      <div style="display:flex;gap:6px;margin-bottom:24px">${pasos.map((_,i)=>`<div style="width:${i===paso?18:6}px;height:6px;border-radius:3px;background:${i===paso?'var(--gold)':'var(--border)'};transition:all .2s"></div>`).join('')}</div>
      <button id="onbNext" style="width:100%;max-width:280px;height:48px;border-radius:14px;border:none;background:var(--gold);color:#0A0A0A;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;margin-bottom:10px">${esUltimo?'Empezar':'Siguiente'}</button>
      ${!esUltimo?'<button id="onbSaltar" style="background:none;border:none;color:var(--text-3);font-size:13px;cursor:pointer;font-family:inherit">Saltar</button>':''}`;
    document.getElementById('onbNext').onclick = () => { haptic(8); if(esUltimo){ cerrar(); } else { paso++; render(); } };
    const saltar = document.getElementById('onbSaltar');
    if(saltar) saltar.onclick = cerrar;
  }
  function cerrar(){
    localStorage.setItem('sp_onboarding_visto','1');
    const ov = document.getElementById('onbOverlay');
    if(ov) ov.remove();
  }
  render();
}

/* ════════ Mis comisiones (solo lectura — el alta/edición es del admin en /os/finanzas) ════════ */
const COMISION_COLOR = { pendiente: 'var(--gold)', pagada: 'var(--green)', cancelada: 'var(--red)' };
const COMISION_LABEL = { pendiente: 'Pendiente', pagada: 'Pagada', cancelada: 'Cancelada' };
async function abrirMisComisiones(){
  const ov = _autoOverlay(`<div style="display:flex;align-items:center;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:12px">
      <button id="finBack" style="background:none;border:none;color:var(--gold);font-size:24px;padding:0 4px;cursor:pointer;line-height:1">←</button>
      <div style="min-width:0;flex:1"><div style="font-weight:600;font-size:15px">Mis comisiones</div>
      <div style="font-size:11px;color:var(--text-3)">Las registra el admin al cerrar una venta</div></div>
    </div>
    <div id="finResumen" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px"></div>
    <div id="finLista">${skeletonCards(2)}</div>`);
  document.getElementById('finBack').onclick = _autoCerrar;
  await _finRenderLista();
}
async function _finRenderLista(){
  const box = document.getElementById('finLista');
  const resBox = document.getElementById('finResumen');
  if(!box) return;
  const lista = await api('/api/mis-comisiones') || [];
  if(resBox){
    const pendiente = lista.filter(c=>c.estado==='pendiente').reduce((s,c)=>s+Number(c.monto_comision||0),0);
    const pagada = lista.filter(c=>c.estado==='pagada').reduce((s,c)=>s+Number(c.monto_comision||0),0);
    resBox.innerHTML = `
      <div style="background:var(--bg-2);border-radius:14px;padding:14px;text-align:center">
        <div style="font-size:18px;font-weight:700;color:var(--gold)">${money(pendiente)}</div>
        <div style="font-size:11px;color:var(--text-3);margin-top:2px">Por cobrar</div>
      </div>
      <div style="background:var(--bg-2);border-radius:14px;padding:14px;text-align:center">
        <div style="font-size:18px;font-weight:700;color:var(--green)">${money(pagada)}</div>
        <div style="font-size:11px;color:var(--text-3);margin-top:2px">Ya pagado</div>
      </div>`;
  }
  if(!lista.length){
    box.innerHTML = `<div style="text-align:center;color:var(--text-3);padding:34px 16px;font-size:13px;line-height:1.6">
      Todavía no tienes comisiones registradas.<br>Aparecen aquí cuando el admin registra una venta tuya en Finanzas.</div>`;
    return;
  }
  box.innerHTML = lista.map(c => `
    <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <b style="flex:1;font-size:14px">${esc(c.lead_nombre||'Cliente')}</b>
        <span style="border-radius:999px;padding:4px 10px;font-size:11px;font-weight:600;background:${COMISION_COLOR[c.estado]||'var(--text-3)'}22;color:${COMISION_COLOR[c.estado]||'var(--text-3)'}">${COMISION_LABEL[c.estado]||c.estado}</span>
      </div>
      <div style="font-size:12px;color:var(--text-2);margin-top:6px">Venta ${money(c.monto_venta)} · ${c.porcentaje}%</div>
      <div style="display:flex;align-items:baseline;gap:6px;margin-top:6px">
        <span style="font-size:19px;font-weight:700;color:var(--gold)">${money(c.monto_comision)}</span>
        <span style="font-size:11px;color:var(--text-3)">${c.fecha_calculo||''}</span>
      </div>
    </div>`).join('');
}

/* ════════ Bottom Nav / tabs ════════
   Cinco tabs fijos + "Más". Con el mapa serían siete (ocho para el jefe), y a 45 px por
   slot en un celular de 360 px las etiquetas quedan ilegibles. Los tres menos usados
   viven en una hoja: siguen a un toque de distancia, pero no comprimen la barra. */
function getTabsPrincipales(){ return [
  ['chats','Chats',SVG.chat], ['mapa','Mapa',SVG.mapPin],
  ['tareas','Tareas',SVG.checkSquare], ['perfil','Perfil',SVG.user],
]; }
function getTabsSecundarios(){ return [
  ...((me && me.rol==='jefe')?[['supervision','Supervisión',SVG.eye]]:[]),
  // Ranking global de la Red: solo para asesores externos (gamificación de la Red).
  ...((me && me.externo)?[['ranking','Ranking',SVG.star]]:[]),
  ['calendario','Calendario',SVG.calendar], ['copiloto','Copiloto',SVG.sparkles],
]; }
function getTABS(){ return [...getTabsPrincipales(), ...getTabsSecundarios()]; }
const esTabSecundario = k => getTabsSecundarios().some(x=>x[0]===k);

function renderNav(){
  const secundarioActivo = esTabSecundario(tab) ? getTabsSecundarios().find(x=>x[0]===tab) : null;
  $('#nav').innerHTML = getTabsPrincipales().map(([k,l,ic])=>`<button class="m-nav__i ${k===tab?'active':''}" data-tab="${k}">${I(ic,23)}<span>${l}</span>${k==='chats'?'<span class="m-nav__dot" id="navDot" style="display:none"></span>':''}</button>`).join('')
    // El botón "Más" toma el nombre del tab activo cuando el asesor está dentro de uno de
    // los secundarios: si no, la barra no mostraría dónde está parado.
    + `<button class="m-nav__i ${secundarioActivo?'active':''}" data-mas="1">${I(secundarioActivo?secundarioActivo[2]:SVG.dots,23)}<span>${secundarioActivo?secundarioActivo[1]:'Más'}</span></button>`;
  $('#nav').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>irTab(b.dataset.tab));
  const mas = $('#nav').querySelector('[data-mas]');
  if(mas) mas.onclick = abrirMasTabs;
}

function abrirMasTabs(){
  haptic(8);
  openSheet('Más', `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:4px 0">
    ${getTabsSecundarios().map(([k,l,ic])=>`<button data-ir="${k}" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 8px;border-radius:16px;border:1px solid ${k===tab?'var(--gold-line)':'var(--border)'};background:${k===tab?'var(--gold-soft)':'var(--bg-2)'};color:${k===tab?'var(--gold)':'var(--text)'};font-size:12px;font-family:inherit;cursor:pointer">${I(ic,24)}<span>${l}</span></button>`).join('')}
  </div>`);
  $('#sheetBody').querySelectorAll('[data-ir]').forEach(b=>b.onclick=()=>{ closeSheet(); irTab(b.dataset.ir); });
}

// Tabs donde el FAB tiene una acción de "crear" con sentido — en el resto (mapa, perfil,
// copiloto, supervisión) no hay un "nuevo X" evidente, así que se sigue ocultando ahí.
const FAB_TABS = ['chats','tareas','calendario'];
async function irTab(t){ tab=t; haptic(8);
  renderNav();  // repinta para que el botón "Más" refleje si el tab activo es secundario
  $('#fab').classList.toggle('hidden', !FAB_TABS.includes(t));
  if(t==='chats'){ showArchivados=false; $('#navTitle').childNodes[0].nodeValue='Conversaciones'; $('#navSub').textContent=marcaNombre(); renderList(); mostrarLista(true); }
  else { mostrarLista(false);
    const entrada = getTABS().find(x=>x[0]===t);
    if(!entrada) return;               // tab desconocido: no reventar con undefined
    const label = entrada[1];
    if(t==='perfil'){ const m = await api('/api/me/metricas'); if(m) metricas=m; }
    pantallaTab(t,label);
  }
}

// Teardown de la pantalla saliente. Sin esto, un mapa Leaflet dentro de #tabScreen se
// queda con el contenedor arrancado del DOM pero sus listeners y temporizadores vivos, y
// a la siguiente entrada se crea otra instancia encima.
let _tabTeardown = null;
function mostrarLista(v){
  $('#list').style.display=v?'':'none'; $('#filters').style.display=v?'':'none';
  if(_tabTeardown){ try{ _tabTeardown(); }catch(e){} _tabTeardown=null; }
  let ph=$('#tabScreen'); if(ph) ph.remove();
}
// Skeleton de tarjetas (para estados de carga, en vez de "Cargando…" plano)
function skeletonCards(n){ let h=''; for(let i=0;i<(n||3);i++){ h+=`<div class="sk-card"><div class="sk" style="width:44px;height:44px;border-radius:14px;flex-shrink:0"></div><div style="flex:1"><div class="sk sk-line" style="width:60%;margin-bottom:8px"></div><div class="sk sk-line" style="width:90%;margin-bottom:8px"></div><div class="sk sk-line" style="width:40%"></div></div></div>`; } return h; }
function pantallaTab(t,label){ $('#navTitle').childNodes[0].nodeValue=label; $('#navSub').textContent=marcaNombre();
  const box=document.createElement('div'); box.id='tabScreen'; box.className='m-scroll'; box.style.cssText='display:flex;flex-direction:column;';
  // Insertar el contenedor en el DOM ANTES de construir cada rama, para que los
  // loaders (cargarTareas) que consultan el DOM antes de su primer
  // await encuentren su elemento y no salgan con return silencioso ("Cargando" eterno).
  $('#scHome').insertBefore(box, $('#fab'));
  if(t==='perfil'){
    const n=me||{nombre:'Asesor',rol:'vendedor',estado:'activo'};
    const m=metricas||{leadsActivos:0,leadsHoy:0,leadsCerrados:0,tasaRespuesta:0,ultimaActividad:null};
    const ec=estadoColores[n.estado||'activo']||estadoColores.activo;
    box.innerHTML=`
      <div style="padding:24px 18px;width:100%;max-width:400px;margin:0 auto">
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:28px">
          <div class="m-avatar" style="width:76px;height:76px;border-radius:24px;font-size:28px;background:${avatarColor(n.nombre)};position:relative">
            ${n.foto ? `<img src="${n.foto}" alt="">` : initials(n.nombre)}
          </div>
          <div style="font-size:18px;font-weight:600;text-align:center">${esc(n.nombre)}</div>
          <div style="font-size:13px;color:var(--text-2)">${esc(n.telefono||n.email||'')}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="m-tag" style="text-transform:uppercase;letter-spacing:.08em;font-size:11px">${n.rol}</span>
            <span class="m-tag" style="background:${ec.bg};color:${ec.fg};border:1px solid ${ec.bd}">${(n.estado||'activo').toUpperCase()}</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
          <div style="background:var(--bg-2);border-radius:14px;padding:14px;text-align:center"><div style="font-size:22px;font-weight:700">${m.leadsActivos}</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">Activos</div></div>
          <div style="background:var(--bg-2);border-radius:14px;padding:14px;text-align:center"><div style="font-size:22px;font-weight:700">${m.leadsHoy}</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">Hoy</div></div>
          <div style="background:var(--bg-2);border-radius:14px;padding:14px;text-align:center"><div style="font-size:22px;font-weight:700">${m.tasaRespuesta}%</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">Tasa resp.</div></div>
          <div style="background:var(--bg-2);border-radius:14px;padding:14px;text-align:center"><div style="font-size:22px;font-weight:700">${m.leadsCerrados}</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">Cerrados</div></div>
        </div>
        <div style="text-align:center;margin-bottom:20px">
          <div style="font-size:12px;color:var(--text-3);margin-bottom:5px">Última actividad</div>
          <div style="font-size:14px;color:var(--text-2);font-weight:500">${m.ultimaActividad ? horaCorta(m.ultimaActividad) : '—'}</div>
        </div>

        <div class="sec">
          <div class="sec-label">Mis insignias</div>
          <div class="sec-body"><div id="perfilInsignias" style="padding:6px 2px"><span style="font-size:12px;color:var(--text-3)">Cargando…</span></div></div>
        </div>

        <div class="sec">
          <div class="sec-label">Ranking del equipo</div>
          <div class="sec-body"><div id="perfilRanking" style="padding:6px 2px"><span style="font-size:12px;color:var(--text-3)">Cargando…</span></div></div>
        </div>

        <div class="sec">
          <div class="sec-label">Acerca de</div>
          <div class="sec-body"><div class="sec-row">
            <input id="inpAbout" placeholder="¿Qué haces ahora?" value="${esc((me&&me.about)||localStorage.getItem('sp_about_text')||'')}">
          </div></div>
        </div>

        <div class="sec">
          <div class="sec-label">Mi trabajo</div>
          <div class="sec-body">
            <div class="sec-row" id="rowMisComisiones"><label>💰 Mis comisiones</label><button class="sec-btn" style="width:auto;color:var(--gold);flex:none">Abrir</button></div>
            <div class="sec-row" id="rowAutomatizaciones"><label>⚙️ Mis automatizaciones</label><button class="sec-btn" style="width:auto;color:var(--gold);flex:none">Abrir</button></div>
            <div class="sec-row" id="rowMisPlantillas"><label>📋 Mis plantillas de WhatsApp</label><button class="sec-btn" style="width:auto;color:var(--gold);flex:none">Abrir</button></div>
            <div class="sec-row" id="rowMiMapa"><label>🗺️ Mi mapa y recorrido</label><button class="sec-btn" style="width:auto;color:var(--gold);flex:none">Abrir</button></div>

            <div class="sec-row" id="rowUbicacion"><label>📍 Compartir ubicación</label><span id="ubicEstado" style="font-size:12.5px;color:var(--text-3)">—</span></div>
            <div class="sec-row" style="font-size:11px;color:var(--text-3);padding-top:0">Solo mientras tienes la app abierta. La ven la administración y los jefes, nunca los clientes.</div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-label">Ayuda</div>
          <div class="sec-body">
            <div class="sec-row" id="rowOnboarding"><label>❓ Cómo usar la app</label><button class="sec-btn" style="width:auto;color:var(--gold);flex:none">Ver guía</button></div>
            <div class="sec-row" style="cursor:default;flex-direction:column;align-items:flex-start;gap:6px">
              <label style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em">Atajos rápidos</label>
              <div style="font-size:12.5px;color:var(--text-2);line-height:1.8">
                📌 Mantén presionada una tarjeta de chat → llamar, archivar, cambiar etapa, posponer<br>
                👉 Desliza un mensaje hacia la derecha → responderlo<br>
                ✋ Mantén presionado un mensaje → copiar, destacar, reenviar, eliminar<br>
                🎙️ Mantén presionado el micrófono → grabar nota de voz
              </div>
            </div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-label">Cuenta y seguridad</div>
          <div class="sec-body">
            <div class="sec-row" id="rowCambiarPin"><label>🔒 Cambiar PIN</label><button class="sec-btn" style="width:auto;color:var(--gold);flex:none">Cambiar</button></div>
            <div class="sec-row" id="rowSesiones"><label>📱 Sesiones activas</label><button class="sec-btn" style="width:auto;color:var(--gold);flex:none">Ver</button></div>
            <div class="sec-row" id="rowExportar"><label>⬇️ Exportar mi perfil</label><button class="sec-btn" style="width:auto;color:var(--gold);flex:none">JSON</button></div>
            <div class="sec-row"><label>🛡️ Verificación en 2 pasos</label><span style="color:var(--text-3);font-size:12.5px">Próximamente</span></div>
            <div class="sec-row" style="font-size:11px;color:var(--text-3);padding-top:0">Aún no disponible. Por ahora, protege tu cuenta con un PIN que solo tú conozcas.</div>
            <div class="sec-row"><label>ℹ️ Versión de la app</label><span id="lblVersion" style="color:var(--text-2);font-size:12.5px">…</span></div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-label">Notificaciones</div>
          <div class="sec-body">
            <div class="sec-row"><label>Sonido</label><button class="toggle-sw${localStorage.getItem('sp_notif_sound')!=='false'?' on':''}" data-key="sp_notif_sound"></button></div>
            <div class="sec-row"><label>Vibración</label><button class="toggle-sw${localStorage.getItem('sp_notif_vibrate')!=='false'?' on':''}" data-key="sp_notif_vibrate"></button></div>
            <div class="sec-row"><label>Tono personalizado</label><button class="sec-btn" id="btnCustomSound" style="width:auto;color:var(--gold);flex:none">${localStorage.getItem('sp_notif_sound_custom')?'Cambiar':'Subir'}</button></div>
            ${localStorage.getItem('sp_notif_sound_custom')?'<div class="sec-row"><button class="sec-btn danger" id="btnRemoveSound">Eliminar tono</button></div>':''}
            ${esNativo()?`<div class="sec-row"><label>Notificaciones push nativas</label><button class="toggle-sw${localStorage.getItem('sp_push_fcm_enabled')!=='false'?' on':''}" data-key="sp_push_fcm_enabled" id="togglePushFcm"></button></div>
            <div class="sec-row" style="font-size:11px;color:var(--text-3);padding-top:0">Activadas por defecto — te avisan aunque la app esté cerrada.</div>`:''}
          </div>
        </div>

        <div class="sec">
          <div class="sec-label">Apariencia</div>
          <div class="sec-body">
            <div style="display:flex;gap:8px;padding:6px 16px 10px">
              ${[
                ['system','Sistema','<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'],
                ['light','Claro','<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
                ['dark','Oscuro','<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'],
              ].map(([v,label,path]) => `
              <div class="bg-opt m-theme-opt" data-theme-opt="${v}">
                <div class="bg-preview" style="display:grid;place-items:center;background:var(--bg-2)">${I(path,20)}</div>
                <span>${label}</span>
              </div>`).join('')}
            </div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-label">Permisos</div>
          <div class="sec-body">
            <div class="sec-row" id="rowPermisos"><label>Permisos de la app</label><button class="sec-btn" style="width:auto;color:var(--gold);flex:none">Revisar</button></div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-label">Chat Pro</div>
          <div class="sec-body">
            <div class="sec-row" id="rowDestacados"><label>⭐ Mensajes destacados</label><button class="sec-btn" style="width:auto;color:var(--gold);flex:none">Ver</button></div>
            <div class="sec-row" id="rowBioLock" style="display:none"><label>🔒 Bloquear con huella</label><button class="toggle-sw" id="toggleBio"></button></div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-label">Chat</div>
          <div class="sec-body">
            <div class="sec-row"><label>Enter envía mensaje</label><button class="toggle-sw${localStorage.getItem('sp_chat_enter_sends')!=='false'?' on':''}" data-key="sp_chat_enter_sends"></button></div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-label">Fondo de chat</div>
          <div class="sec-body">
            <div style="display:flex;gap:8px;padding:6px 16px 10px">
              <div class="bg-opt${_chatBg==='none'?' active':''}" data-bg="none">
                <div class="bg-preview bg-preview--none"></div>
                <span>Ninguno</span>
              </div>
              <div class="bg-opt${_chatBg==='leones'?' active':''}" data-bg="leones">
                <div class="bg-preview bg-preview--leones"></div>
                <span>Leones</span>
              </div>
            </div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-label">Mis respuestas</div>
          <div class="sec-body" id="secMisTpl">
            <div style="padding:10px 16px;text-align:center;color:var(--text-3);font-size:13px">Cargando...</div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-label">Recordatorios</div>
          <div class="sec-body" id="secRecordatorios">
            <div class="sec-row"><input id="recTxt" placeholder="Ej: Llamar a Juan a las 5 PM"></div>
            <div class="sec-row">
              <input type="datetime-local" id="recDt" style="flex:1;width:auto">
              <button class="sec-btn" style="width:auto;color:var(--gold);flex:none" id="recAdd">Agregar</button>
            </div>
            <div id="recList" style="max-height:180px;overflow-y:auto"></div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-label">Estadísticas semanales</div>
          <div class="sec-body" id="secStats">
            <div style="padding:14px 16px;text-align:center;color:var(--text-3);font-size:13px">Cargando...</div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-label">Almacenamiento</div>
          <div class="sec-body">
            <div class="sec-row"><button class="sec-btn" id="btnClearCache">${I(SVG.trash||'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',14)} Limpiar caché de medios</button></div>
            <div class="sec-row"><button class="sec-btn" id="btnReregisterPush" style="border-color:rgba(200,164,90,.3);color:var(--gold)">🔔 Re-registrar notificaciones push</button></div>
          </div>
        </div>

        <button id="btnLogout" style="width:100%;height:48px;border-radius:12px;border:1px solid rgba(229,72,77,.3);background:rgba(229,72,77,.08);color:var(--red);font-size:15px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px;font-family:inherit">${I('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',18)} Cerrar sesión</button>
        <div style="display:flex;gap:8px;margin-bottom:24px">
          <button id="btnEditarPerfil" style="flex:1;height:44px;border-radius:12px;border:1px solid var(--border-strong);background:var(--bg-2);color:var(--text);font-size:14px;font-weight:500;cursor:pointer;font-family:inherit">${I(SVG.settings,16)} Editar</button>
          <select id="selEstado" style="flex:1;height:44px;border-radius:12px;border:1px solid var(--border-strong);background:var(--bg-2);color:var(--text);font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;padding:0 10px;outline:none;appearance:none;-webkit-appearance:none">
            ${['activo','ocupado','inactivo','vacaciones'].map(s => `<option value="${s}" ${n.estado===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
          </select>
        </div>
      </div>`;
    // Wire estado selector + secciones
    setTimeout(() => {
      // Excluye los toggles sin data-key (p.ej. #toggleBio) — esos tienen su propio handler
      // dedicado más abajo. Antes este selector genérico también capturaba el de huella, y
      // como se registra primero, cada tap disparaba AMBOS handlers: este lo prendía, el de
      // huella (que lee el estado ya cambiado) lo volvía a apagar — se anulaban entre sí en
      // cada toque, y el toggle nunca podía quedar en "activado".
      document.querySelectorAll('.toggle-sw[data-key]').forEach(b=>b.addEventListener('click',function(){
        const key=this.dataset.key; const cur=this.classList.contains('on');
        this.classList.toggle('on'); localStorage.setItem(key,cur?'false':'true'); haptic(6);
        if(key==='sp_push_fcm_enabled'&&!cur) suscribirPushNativo();
      }));
      document.querySelectorAll('.bg-opt').forEach(el=>el.addEventListener('click',function(){
        const bg=this.dataset.bg;
        document.querySelectorAll('.bg-opt').forEach(x=>x.classList.remove('active'));
        this.classList.add('active');
        _chatBg=bg;
        localStorage.setItem('sp_chat_bg',bg);
        aplicarFondoChat();
        haptic(6);
        api('/api/mi-chat-bg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valor:bg})});
      }));
      // Apariencia: Sistema/Claro/Oscuro — motor real en /os/theme.js
      const marcarThemeActivo=()=>{
        const actual=window.VidaTheme?window.VidaTheme.get():'system';
        document.querySelectorAll('.m-theme-opt').forEach(x=>x.classList.toggle('active',x.dataset.themeOpt===actual));
      };
      marcarThemeActivo();
      document.querySelectorAll('.m-theme-opt').forEach(el=>el.addEventListener('click',function(){
        if(!window.VidaTheme) return;
        window.VidaTheme.set(this.dataset.themeOpt);
        marcarThemeActivo();
        haptic(6);
      }));
      const inp=document.getElementById('inpAbout');
      if(inp) inp.addEventListener('change',function(){
        const v=this.value;
        api('/api/mi-about',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto:v})}).then(r=>{ if(r){ if(me) me.about=v; toast('Guardado'); } });
        haptic(6);
      });
      const csBtn=document.getElementById('btnCustomSound');
      if(csBtn) csBtn.addEventListener('click',function(){
        const fi=document.createElement('input'); fi.type='file'; fi.accept='audio/*';
        fi.onchange=function(){ const f=this.files[0]; if(!f) return;
          const r=new FileReader(); r.onload=function(e){ localStorage.setItem('sp_notif_sound_custom',e.target.result); toast('Tono guardado'); irTab('perfil'); }; r.readAsDataURL(f);
        }; fi.click();
      });
      const rsBtn=document.getElementById('btnRemoveSound');
      if(rsBtn) rsBtn.addEventListener('click',function(){ localStorage.removeItem('sp_notif_sound_custom'); toast('Tono eliminado'); irTab('perfil'); });
      const ccBtn=document.getElementById('btnClearCache');
      if(ccBtn) ccBtn.addEventListener('click',limpiarCache);
      const rrBtn=document.getElementById('btnReregisterPush');
      if(rrBtn) rrBtn.addEventListener('click',async()=>{ haptic([20,40,20]); toast('Re-registrando token FCM...'); try{ await suscribirPushNativo(); toast('✅ Token FCM re-registrado'); }catch(e){ toast('❌ Error: '+e.message,'err'); } });
      const permRow=document.getElementById('rowPermisos');
      if(permRow) permRow.addEventListener('click',()=>{ haptic(8); abrirPermisos(); });
      // ⭐ Mensajes destacados
      const destRow=document.getElementById('rowDestacados');
      if(destRow) destRow.addEventListener('click',async()=>{
        haptic(8);
        const lista=await api('/api/mensajes/destacados')||[];
        openSheet('Mensajes destacados', lista.length
          ? `<div style="max-height:340px;overflow-y:auto">${lista.map(m=>`<div class="ctx-item" data-dst="${m.lead_id}"><div style="min-width:0;flex:1"><div style="font-size:13px;font-weight:600;color:var(--gold)">${esc(m.customer_name||'Cliente')} <span style="font-weight:400;color:var(--text-3);font-size:11px">· ${horaCorta(m.timestamp)}</span></div><div style="font-size:12.5px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.media_type?'📎 '+(m.media_type||''):''} ${esc((m.body||'').slice(0,70))}</div></div><span style="flex-shrink:0">⭐</span></div>`).join('')}</div>`
          : '<div style="text-align:center;color:var(--text-3);padding:24px;font-size:13px">Mantén presionado un mensaje y toca ⭐ Destacar para guardarlo aquí.</div>');
        $('#sheetBody').querySelectorAll('[data-dst]').forEach(el=>el.onclick=()=>{ closeSheet(); irTab('chats'); abrirChat(Number(el.dataset.dst)); });
      });
      // 🔒 Bloqueo con huella (nativo + web vía WebAuthn)
      bioDisponible().then(async disp=>{
        const row=document.getElementById('rowBioLock'); if(!row||!disp) return;
        row.style.display='';
        const tg=document.getElementById('toggleBio');
        if(await bioActivado()) tg.classList.add('on');
        tg.addEventListener('click',async function(){
          const on=this.classList.contains('on');
          if(!on){
            try{ await bioVerificar(); }
            catch(e){ toast('No se pudo verificar tu huella'); return; }
          }
          this.classList.toggle('on');
          await bioSetActivado(!on);
          toast(on?'Bloqueo con huella desactivado':'Bloqueo con huella activado'); haptic(8);
        });
      });
      const sel = document.getElementById('selEstado');
      if (sel) sel.addEventListener('change', async function() {
        if (!me || !me.vendedorId) return;
        haptic(8);
        await api('/api/vendedores/'+me.vendedorId+'/estado', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ estado: this.value }) });
        me.estado = this.value;
        toast('Estado actualizado');
      });
      const edBtn = document.getElementById('btnEditarPerfil');
      if (edBtn) edBtn.addEventListener('click', () => abrirEditarPerfil());
      const onbRow = document.getElementById('rowOnboarding');
      if (onbRow) onbRow.addEventListener('click', () => { haptic(8); abrirOnboarding(); });
      // Cuenta y seguridad
      const pinRow = document.getElementById('rowCambiarPin');
      if (pinRow) pinRow.addEventListener('click', () => { haptic(8); abrirCambiarPin(); });
      const sesRow = document.getElementById('rowSesiones');
      if (sesRow) sesRow.addEventListener('click', () => { haptic(8); abrirSesiones(); });
      const expRow = document.getElementById('rowExportar');
      if (expRow) expRow.addEventListener('click', () => { haptic(8); exportarPerfil(); });
      const finRow = document.getElementById('rowMisComisiones');
      if (finRow) finRow.addEventListener('click', () => { haptic(8); abrirMisComisiones(); });
      const autoRow = document.getElementById('rowAutomatizaciones');
      if (autoRow) autoRow.addEventListener('click', () => { haptic(8); abrirMisAutomatizaciones(); });
      const tplRow = document.getElementById('rowMisPlantillas');
      if (tplRow) tplRow.addEventListener('click', () => { haptic(8); abrirMisPlantillasWA(); });
      actualizarIndicadorUbicacion();
      const ubicRow = document.getElementById('rowUbicacion');
      if (ubicRow) ubicRow.addEventListener('click', () => { haptic(8); abrirAjusteUbicacion(); });
      // El mapa dejó de ser una pantalla escondida en el perfil: ahora es un tab propio.
      // La fila se conserva como atajo para quien ya la conocía.
      const miMapaRow = document.getElementById('rowMiMapa');
      if (miMapaRow) miMapaRow.addEventListener('click', () => { haptic(8); irTab('mapa'); });
      cargarVersionApp();
      // Mis respuestas
      cargarMisTpl();
      // Recordatorios
      renderRecordatorios();
      document.getElementById('recAdd')&&document.getElementById('recAdd').addEventListener('click',async()=>{
        const txt=document.getElementById('recTxt').value.trim(); const dt=document.getElementById('recDt').value;
        if(!txt||!dt){ toast('Completa texto y fecha'); return; }
        const r=await api('/api/tareas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto:txt,venceAt:new Date(dt).toISOString()})});
        if(r){ document.getElementById('recTxt').value=''; renderRecordatorios(); toast('Recordatorio creado — te avisaremos'); }
        else toast('Error al guardar');
      });
      // Estadísticas semanales
      cargarStats();
      // Insignias + ranking (datos reales)
      cargarInsigniasPerfil();
      cargarRankingPerfil();
    }, 50);
  } else if (t === 'mapa') {
    // El mapa va a sangre: el contenedor se vuelve un marco sin scroll y el lienzo lo
    // llena por completo (position:absolute), en vez de depender de una altura en vh que
    // se descuadra al abrir el teclado o girar el celular.
    box.style.cssText = 'position:relative;overflow:hidden;padding:0;flex:1';
    box.innerHTML = plantillaMapaTab();
    montarMapaTab();
  } else if (t === 'calendario') {
    box.innerHTML = `<div style="padding:14px 14px 0;width:100%;max-width:400px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <button class="cal-nav" id="calPrev" style="background:var(--bg-3);border:1px solid var(--border);color:var(--text-2);width:32px;height:32px;border-radius:10px;font-size:16px;cursor:pointer">‹</button>
        <h3 id="calMes" style="flex:1;font-family:var(--f-title);font-size:16px;font-weight:600;text-align:center;text-transform:capitalize"></h3>
        <button class="cal-nav" id="calNext" style="background:var(--bg-3);border:1px solid var(--border);color:var(--text-2);width:32px;height:32px;border-radius:10px;font-size:16px;cursor:pointer">›</button>
      </div>
      <div id="calGrid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px"></div>
      <div style="margin-top:16px;display:flex;gap:8px">
        <button id="calHoy" style="flex:1;height:36px;border-radius:10px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);font-size:12px;cursor:pointer;font-family:inherit">Hoy</button>
        <button id="calNueva" style="flex:2;height:36px;border-radius:10px;background:var(--gold);color:#0A0A0A;border:none;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">+ Nueva cita</button>
      </div>
      <div style="margin-top:18px"><div class="t-label" style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Próximas</div><div id="calProx"></div></div>
    </div>`;
    cargarCalendario();
  } else if (t === 'tareas') {
    const ec = estadoColores[me?.estado||'activo']||estadoColores.activo;
    box.innerHTML = `<div style="padding:18px;width:100%;max-width:400px;margin:0 auto">
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
        <div style="display:flex;gap:8px">
          <input id="taskTxt" placeholder="Nueva tarea..." style="flex:1;height:40px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);padding:0 14px;font-size:14px;outline:none">
          <button id="taskAdd" style="height:40px;padding:0 16px;border-radius:12px;background:var(--gold);color:#0A0A0A;border:none;font-weight:600;font-size:13px">Agregar</button>
        </div>
        <input type="datetime-local" id="taskDt" title="Recordatorio (opcional): te avisamos con notificación" style="height:38px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);padding:0 14px;font-size:13px;outline:none">
      </div>
      <div id="taskList">${skeletonCards(3)}</div>
    </div>`;
    cargarTareas();
  } else if (t === 'supervision') {
    box.innerHTML = `<div style="padding:8px 12px;width:100%;max-width:450px;margin:0 auto">
      <div id="superKPIs" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px"></div>
      <a href="/supervisor/" style="display:flex;align-items:center;gap:10px;text-decoration:none;background:linear-gradient(135deg,rgba(200,164,90,.16),rgba(200,164,90,.05));border:1px solid rgba(200,164,90,.35);border-radius:14px;padding:14px;margin-bottom:14px">
        <span style="font-size:20px">🛡️</span>
        <span style="flex:1"><b style="display:block;color:#C8A45A;font-size:14px">Centro de Supervisión</b>
        <span style="font-size:11px;color:var(--text-3)">Equipo, analítica, alertas y conversaciones — todo en una sola página</span></span>
        <span style="color:#C8A45A;font-size:20px">›</span>
      </a>
      <div style="margin-bottom:14px">
        <h3 style="font-size:13px;font-weight:600;color:#C8A45A;margin:0 0 6px;text-transform:uppercase;letter-spacing:.06em">📋 Inbox General</h3>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;background:rgba(10,10,10,0.4);padding:8px;border-radius:10px">
          <div style="display:flex;gap:6px">
            <select id="superFiltroVendedor" style="flex:1;height:38px;border-radius:10px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);padding:0 8px;font-size:12px"><option value="">Todos los asesores</option></select>
            <select id="superFiltroEtiqueta" style="flex:1;height:38px;border-radius:10px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);padding:0 8px;font-size:12px"><option value="">Todas las etapas</option>${Object.entries(ETQ).map(([k,v])=>`<option value="${k}">${v.t}</option>`).join('')}</select>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="superFiltroCanal" style="flex:1;height:38px;border-radius:10px;border:1px solid var(--border);background:var(--bg-3);color:var(--text-2);padding:0 8px;font-size:12px"><option value="">Todos los canales</option><option value="whatsapp">WhatsApp</option><option value="messenger">Messenger</option><option value="instagram">Instagram</option></select>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2);white-space:nowrap"><input type="checkbox" id="superSinResp"> Sin responder</label>
          </div>
        </div>
        <div id="superInboxList" style="display:flex;flex-direction:column;gap:2px;max-height:60vh;overflow-y:auto">${skeletonCards(3)}</div>
        <div id="superInboxMore" style="display:none;text-align:center;margin-top:8px"><button style="padding:8px 24px;border-radius:10px;border:1px solid rgba(200,164,90,.3);background:rgba(200,164,90,.08);color:#C8A45A;cursor:pointer;font-size:12px;font-family:inherit">Cargar más</button></div>
      </div>
      <div style="margin-bottom:14px">
        <h3 style="font-size:13px;font-weight:600;color:#C8A45A;margin:0 0 6px;text-transform:uppercase;letter-spacing:.06em">👥 Equipo</h3>
        <div id="superEquipo" style="display:flex;flex-direction:column;gap:6px">${skeletonCards(2)}</div>
      </div>
      <div style="margin-bottom:14px">
        <h3 style="font-size:13px;font-weight:600;color:#C8A45A;margin:0 0 6px;text-transform:uppercase;letter-spacing:.06em">⚠️ Alertas</h3>
        <div id="superAlertas" style="display:flex;flex-direction:column;gap:6px"><div style="text-align:center;color:var(--text-3);padding:12px;font-size:12px">Cargando...</div></div>
      </div>
    </div>`;
    cargarSupervision();
  } else if (t === 'ranking') {
    box.innerHTML = `<div style="padding:18px;width:100%;max-width:440px;margin:0 auto">
      <div id="rankMiNivel" style="margin-bottom:16px">${skeletonCards(1)}</div>
      <h3 style="font-size:13px;font-weight:600;color:var(--gold);margin:0 0 10px;text-transform:uppercase;letter-spacing:.06em">🏆 Ranking de la Red</h3>
      <div id="rankLista">${skeletonCards(4)}</div>
    </div>`;
    cargarRankingRed();
  } else if (t === 'copiloto') {
    const act = leads.filter(l => l.status !== 'cerrado');
    const sinResp = leads.filter(l => Number(l.unread_count||0) > 0);
    const hot = act.filter(l => l.etiqueta === 'negociacion' || l.etiqueta === 'cita').slice(0,5);
    // Fetch briefing async and update
    const briefBox = document.createElement('div');
    briefBox.innerHTML = `<div style="padding:18px;width:100%;max-width:400px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div class="m-avatar" style="width:42px;height:42px;border-radius:14px;background:${avatarColor(me?.nombre||'')};font-size:16px">${initials(me?.nombre||'')}</div>
        <div><div style="font-size:16px;font-weight:600">Copiloto SP</div><div style="font-size:11px;color:var(--text-3)">Inteligencia de ventas</div></div>
        <span id="copBadge" class="cop-badge" style="margin-left:auto">${I(SVG.sparkles,11)} Cargando...</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div class="cop-card" style="margin:0;text-align:center;padding:14px"><div style="font-size:22px;font-weight:700">${act.length}</div><div style="font-size:10px;color:var(--text-3)">Activos</div></div>
        <div class="cop-card" style="margin:0;text-align:center;padding:14px"><div style="font-size:22px;font-weight:700">${sinResp.length}</div><div style="font-size:10px;color:var(--text-3)">Sin respuesta</div></div>
      </div>
      <div class="cop-card"><h5>${I(SVG.target,14)} Próxima acción recomendada</h5>
        <p id="copAccion">Analizando tus leads…</p>
      </div>
      <div class="cop-card" id="miDiaCard"><h5>${I(SVG.sun||SVG.zap,14)} Mi Día</h5>
        <div id="miDiaBody"><p style="font-size:13px;color:var(--text-3)">Cargando tu día…</p></div>
      </div>
      <div class="cop-card"><h5>${I(SVG.zap,14)} Leads calientes</h5>
        <div id="copHot">${hot.length ? hot.map(l => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-soft)"><div class="m-avatar" style="width:28px;height:28px;border-radius:8px;font-size:10px;background:${avatarColor(l.customer_name||'')}">${initials(l.customer_name)}</div><div style="flex:1;font-size:13px">${esc(l.customer_name||'Cliente')}</div><span class="m-tag t-${(l.etiqueta||'sin_clasificar')}">${etqLabel(l.etiqueta)}</span></div>`).join('') : '<p style="font-size:13px;color:var(--text-3)">Sin leads en negociación.</p>'}
      </div>
      <div class="cop-card" id="copFraseCard" style="display:none"><h5>${I(SVG.megaphone,14)} Consejo del día (IA)</h5>
        <p id="copFrase"></p>
      </div>
    </div>`;
    box.innerHTML = briefBox.innerHTML;
    // Mi Día: seguimientos vencidos + leads fríos (datos reales del servidor)
    (async()=>{
      const body=document.getElementById('miDiaBody'); if(!body) return;
      const d=await api('/api/me/mi-dia');
      if(!d){ body.innerHTML='<p style="font-size:13px;color:var(--text-3)">No disponible.</p>'; return; }
      const chip=(n,label,color)=>`<div style="flex:1;text-align:center;background:var(--bg-3);border-radius:12px;padding:10px 6px"><div style="font-size:20px;font-weight:700;color:${color}">${n}</div><div style="font-size:10px;color:var(--text-3);margin-top:2px">${label}</div></div>`;
      const nv=(d.tareasVencidas||[]).length, nc=(d.calientes||[]).length, nf=(d.frios||[]).length, nci=(d.citasHoy||[]).length;
      let html=`<div style="display:flex;gap:8px;margin-bottom:10px">${chip(nv,'Vencidos','var(--red)')}${chip(nci,'Citas hoy','var(--gold)')}${chip(nc,'Calientes','#57C168')}${chip(nf,'Fríos','var(--text-2)')}</div>`;
      const filas=[];
      (d.tareasVencidas||[]).slice(0,3).forEach(t=>filas.push(`<div class="mi-dia-row" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-soft)"><span style="color:var(--red)">${I(SVG.clock,15)}</span><span style="flex:1;font-size:13px">${esc(t.texto||'Seguimiento')}</span></div>`));
      (d.frios||[]).slice(0,4).forEach(l=>filas.push(`<div class="mi-dia-row" data-lead="${l.id}" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-soft);cursor:pointer"><div class="m-avatar" style="width:26px;height:26px;border-radius:8px;font-size:10px;background:${avatarColor(l.customer_name||'')}">${initials(l.customer_name||'?')}</div><span style="flex:1;font-size:13px">${esc(l.customer_name||'Cliente')}</span><span style="font-size:11px;color:var(--text-3)">frío · retómalo</span></div>`));
      html += filas.length?filas.join(''):'<p style="font-size:13px;color:#57C168">¡Todo al día! Sin pendientes urgentes.</p>';
      body.innerHTML=html;
      body.querySelectorAll('.mi-dia-row[data-lead]').forEach(r=>r.onclick=()=>{ const id=Number(r.dataset.lead); irTab('chats'); setTimeout(()=>abrirChat(id),120); });
    })();
    // Próxima acción HONESTA: derivada de reglas reales sobre tus datos
    // (lead más antiguo sin responder → cita de hoy → tarea vencida → negociaciones)
    (async()=>{
      const accion=document.getElementById('copAccion'); if(!accion) return;
      let msg=null;
      if(sinResp.length){
        const masViejo=[...sinResp].sort((a,b)=>new Date(a.last_customer_message_at||a.updated_at||a.created_at)-new Date(b.last_customer_message_at||b.updated_at||b.created_at))[0];
        msg=`Responde a <b>${esc(masViejo.customer_name||'Cliente')}</b> — es el lead que más tiempo lleva esperando (${sinResp.length} sin responder en total).`;
      } else {
        const citas=await api('/api/citas'); const hoy=new Date().toDateString();
        const citaHoy=(citas||[]).find(c=>c.estado==='pendiente'&&parseDbDate(c.fecha)&&parseDbDate(c.fecha).toDateString()===hoy);
        if(citaHoy) msg=`Hoy tienes cita: <b>${esc(citaHoy.titulo)}</b> a las ${parseDbDate(citaHoy.fecha).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})}.`;
        else {
          const tareas=await api('/api/tareas');
          const vencida=(tareas||[]).find(t=>Number(t.completada)!==1&&t.vence_at&&new Date(t.vence_at)<new Date());
          if(vencida) msg=`Tienes una tarea vencida: <b>${esc(vencida.texto)}</b>.`;
          else if(hot.length) msg=`Todo al día. Empuja tus ${hot.length} lead(s) en negociación/cita hacia el cierre.`;
          else msg='Todo al día. Buen momento para crear un lead nuevo o hacer seguimiento a clientes antiguos.';
        }
      }
      accion.innerHTML=msg;
    })();
    // El "consejo del día" SOLO aparece si la IA responde de verdad — sin frases fingidas
    fetch('/api/nlp/daily-briefing', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include' })
      .then(r=>r.json()).then(d=>{
        const badge = document.getElementById('copBadge');
        if(d.ok && d.briefing) {
          const b = d.briefing;
          if(badge) { badge.textContent = 'IA activa'; badge.style.background = 'var(--gold-soft)'; badge.style.color = 'var(--gold)'; }
          if(b.priorityAction){ const accion = document.getElementById('copAccion'); if(accion) accion.textContent = b.priorityAction; }
          if(b.fraseDelDia){ const card=document.getElementById('copFraseCard'); const frase=document.getElementById('copFrase'); if(card&&frase){ frase.textContent=`"${b.fraseDelDia}"`; card.style.display=''; } }
        } else if(badge) { badge.textContent = 'IA no configurada'; badge.style.background = 'var(--bg-3)'; badge.style.color = 'var(--text-3)'; }
      }).catch(()=>{ const badge=document.getElementById('copBadge'); if(badge) { badge.textContent='IA no configurada'; badge.style.background='var(--bg-3)'; badge.style.color='var(--text-3)'; } });
  }
}

/* ════════ Interacciones globales ════════ */
function wire(){
  $('#q').addEventListener('input',e=>{
    term=e.target.value.trim(); renderList();
    // Búsqueda global en el CONTENIDO de todos los mensajes (3+ caracteres, debounce)
    clearTimeout(window._qDeb);
    if(term.length>=3&&!DEMO){
      const q=term;
      window._qDeb=setTimeout(async()=>{
        const r=await api('/api/mensajes/buscar?q='+encodeURIComponent(q));
        if(q===term){ _msgResults=Array.isArray(r)?r:[]; renderList(); }
      },300);
    } else { _msgResults=[]; }
  });
  $('#filters').addEventListener('click',e=>{ const b=e.target.closest('[data-f]'); if(!b) return; filtro=b.dataset.f; haptic(8); renderList(); });
  $('#fab').onclick=()=>{
    if(tab==='tareas'){ const inp=document.getElementById('taskTxt'); if(inp){ inp.scrollIntoView({block:'center',behavior:'smooth'}); inp.focus(); } else abrirNuevoLead(); }
    else if(tab==='calendario'){ if(typeof abrirModalCita==='function') abrirModalCita(); else abrirNuevoLead(); }
    else abrirNuevoLead();
  };
  $('#btnNotif').onclick=()=>abrirNotificaciones();
  const meAvatarEl = document.getElementById('meAvatar'); if (meAvatarEl) meAvatarEl.onclick = () => { const pn = document.querySelector('[data-tab="perfil"]'); if (pn) pn.click(); };
  $('#btnPrioridad').onclick=()=>{ ordenPrioridad=!ordenPrioridad; $('#btnPrioridad').classList.toggle('active',ordenPrioridad); haptic(8); toast(ordenPrioridad?'Ordenando por prioridad':'Orden por más reciente'); renderList(); };
  $('#sheetX').onclick=closeSheet; $('#sheetBg').onclick=closeSheet;
  wireSheetDrag();
  // Logout desde tab Perfil (long-press)
  const perfNav=$('[data-tab="perfil"]');
  if(perfNav){ let pt; perfNav.addEventListener('touchstart',()=>{ pt=setTimeout(()=>{ pt=null; $('#btnLogout')?.click(); },600); },{passive:true}); perfNav.addEventListener('touchend',()=>{ if(pt){ clearTimeout(pt); pt=null; } },{passive:true}); perfNav.addEventListener('touchmove',()=>{ if(pt){ clearTimeout(pt); pt=null; } },{passive:true}); }
  // Logout
  document.addEventListener('click', e=>{
    const btn=e.target.closest('#btnLogout');
    if(btn){ haptic(12); openSheet('Cerrar sesión', `
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:40px;margin-bottom:10px">${I('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',32)}</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:6px">¿Cerrar sesión?</div>
        <div style="font-size:13px;color:var(--text-3);margin-bottom:20px">Volverás a la pantalla de inicio</div>
        <div style="display:flex;gap:10px">
          <button class="cop-use" style="flex:1;background:var(--bg-3);color:var(--text);border:1px solid var(--border)" id="logoutCancel">Cancelar</button>
          <button class="cop-use" style="flex:1;background:var(--red);color:#fff" id="logoutConfirm">Salir</button>
        </div>
      </div>`);
      $('#logoutCancel').onclick=closeSheet;
      $('#logoutConfirm').onclick=()=>{ closeSheet(); fetch('/api/logout',{method:'POST',credentials:'include'}).catch(()=>{}); if('caches'in window)caches.keys().then(k=>Promise.all(k.map(x=>caches.delete(x)))).catch(()=>{}); navigator.serviceWorker&&navigator.serviceWorker.getRegistrations().then(r=>r.forEach(reg=>reg.unregister())).catch(()=>{}); location.replace('/login.html'); };
    }
  });
  // Pull to refresh
  const sc=$('#list'); let sy=0,pull=0,at=false;
  sc.addEventListener('touchstart',e=>{ at=sc.scrollTop<=0; sy=e.touches[0].clientY; pull=0; },{passive:true});
  sc.addEventListener('touchmove',e=>{ if(!at) return; pull=Math.max(0,Math.min(70,e.touches[0].clientY-sy)); const p=$('#ptr'); if(p&&pull>0) p.style.height=pull+'px'; },{passive:true});
  sc.addEventListener('touchend',async()=>{ if(pull>50){ haptic(12); await (DEMO?Promise.resolve():cargar()); } const p=$('#ptr'); if(p) p.style.height='0'; pull=0; });
  // Flash animation cleanup
  document.addEventListener('animationend',e=>{ if(e.target.classList.contains('flash-new')) e.target.classList.remove('flash-new'); });
}

/* Centro de notificaciones real: persistente en el servidor + tiempo real por SSE */
function setNotifBadge(n){
  const b=document.getElementById('notifBadge'); if(!b) return;
  if(n>0){ b.textContent=n>99?'99+':String(n); b.style.display='block'; }
  else { b.style.display='none'; b.textContent=''; }
}
function tiempoRel(ts){ const s=Math.floor((Date.now()-Number(ts))/1000); if(s<60) return 'ahora'; if(s<3600) return Math.floor(s/60)+' min'; if(s<86400) return Math.floor(s/3600)+' h'; return Math.floor(s/86400)+' d'; }
async function cargarNotifBadge(){ const d=await api('/api/notificaciones?limit=1'); if(d) setNotifBadge(d.sin_leer||0); }
async function abrirNotificaciones(){ haptic(8);
  const d=await api('/api/notificaciones?limit=30');
  const items=(d&&d.notificaciones)||[];
  const html = items.length
    ? items.map(n=>`<div class="tl-i notif-item" data-nid="${n.id}" data-lead="${n.lead_id||''}" style="padding-bottom:14px;${n.leida?'opacity:.55':''};cursor:pointer"><div class="tl-dot" style="color:var(--gold)">${I(SVG.bell,15)}</div><div class="tl-txt"><strong>${esc(n.titulo||'')}</strong><span>${esc(n.cuerpo||'')}</span><span style="font-size:10px;color:var(--text-4)">${tiempoRel(n.created_at)}</span></div></div>`).join('')
      + '<button class="cop-use" id="notifLeerTodas" style="width:100%;margin-top:6px;background:var(--bg-3);color:var(--text);border:1px solid var(--border)">Marcar todas como leídas</button>'
    : `<div class="tl-i" style="padding-bottom:14px"><div class="tl-dot" style="color:var(--text-3)">${I(SVG.bell,15)}</div><div class="tl-txt"><strong>Sin notificaciones</strong><span></span></div></div>`;
  openSheet('Notificaciones', html);
  const lt=document.getElementById('notifLeerTodas');
  if(lt) lt.onclick=async()=>{ await api('/api/notificaciones/leer-todas',{method:'POST'}); setNotifBadge(0); closeSheet(); };
  document.querySelectorAll('.notif-item').forEach(el=>el.onclick=async()=>{
    const nid=el.dataset.nid, leadId=el.dataset.lead;
    if(nid) api(`/api/notificaciones/${nid}/leer`,{method:'POST'}).then(cargarNotifBadge);
    if(leadId){ closeSheet(); const l=leads.find(x=>Number(x.id)===Number(leadId)); if(l) abrirChat(Number(leadId)); }
  });
}

/* ════════ Mis respuestas en perfil ════════ */
async function initTemplates(){ try{ const d=await api('/api/mis-templates'); if(d&&d.length) _templates=d; else{ const g=await api('/api/templates'); if(g&&g.length) _templates=g; } }catch(e){} }
async function cargarMisTpl(){
  const box=document.getElementById('secMisTpl'); if(!box) return;
  const data=await api('/api/mis-templates');
  if(data&&data.length) _templates=data;
  if(!data||!data.length){
    box.innerHTML='<div class="sec-row"><button class="sec-btn" id="btnAddTpl" style="color:var(--gold)">+ Agregar respuesta</button></div>';
  } else {
    box.innerHTML=data.map(t=>`<div class="tpl-edit" data-id="${t.id}" style="display:flex;align-items:center;gap:6px;padding:10px 16px;border-bottom:1px solid var(--border-soft);cursor:pointer"><div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:var(--gold)">${esc(t.titulo)}</div><div style="font-size:12px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.cuerpo)}</div></div><button class="tpl-del" data-id="${t.id}" style="width:28px;height:28px;border-radius:50%;background:none;border:none;color:var(--red);display:grid;place-items:center">${I(SVG.x,14)}</button></div>`).join('')+
      '<div style="padding:8px 16px"><button class="sec-btn" id="btnAddTpl" style="color:var(--gold)">+ Agregar respuesta</button></div>';
  }
  function abrirFormTpl(existente){
    openSheet(existente?'Editar respuesta':'Nueva respuesta', `
      <div style="display:flex;flex-direction:column;gap:10px">
        <input id="ntTitulo" placeholder="Título (Ej: Precio lote)" value="${existente?esc(existente.titulo):''}" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:14px;outline:none">
        <textarea id="ntCuerpo" placeholder="Mensaje de respuesta..." style="width:100%;min-height:80px;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:14px;outline:none;resize:none">${existente?esc(existente.cuerpo):''}</textarea>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          <span style="font-size:11px;color:var(--text-3)">Insertar:</span>
          ${['{{nombre}}','{{asesor}}','{{proyecto}}'].map(v=>`<button type="button" class="nt-var" data-var="${v}" style="font-size:12px;padding:5px 10px;border-radius:999px;border:1px solid var(--gold);background:var(--gold-soft,rgba(200,164,90,.12));color:var(--gold)">${v}</button>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--text-3);margin-top:-2px">Se reemplazan con el nombre real del cliente y tuyo al enviar.</div>
        <button class="cop-use" id="ntSave">Guardar</button>
      </div>`);
    $('#sheetBody').querySelectorAll('.nt-var').forEach(b=>b.onclick=()=>{
      const ta=$('#ntCuerpo'); if(!ta) return;
      const s=ta.selectionStart||ta.value.length, e=ta.selectionEnd||ta.value.length;
      ta.value=ta.value.slice(0,s)+b.dataset.var+ta.value.slice(e);
      ta.focus(); ta.selectionStart=ta.selectionEnd=s+b.dataset.var.length; haptic(6);
    });
    $('#ntSave').onclick=async()=>{
      const titulo=$('#ntTitulo').value.trim(); const cuerpo=$('#ntCuerpo').value.trim();
      if(!titulo||!cuerpo){ toast('Completa título y mensaje'); return; }
      const url=existente?`/api/mis-templates/${existente.id}`:'/api/mis-templates';
      const r=await api(url,{method:existente?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({titulo,cuerpo})});
      if(r&&r.ok){ toast(existente?'Respuesta actualizada':'Respuesta guardada'); closeSheet(); cargarMisTpl(); } else toast('Error');
    };
  }
  const addBtn=document.getElementById('btnAddTpl');
  if(addBtn) addBtn.onclick=()=>abrirFormTpl(null);
  box.querySelectorAll('.tpl-edit').forEach(row=>row.onclick=(ev)=>{
    if(ev.target.closest('.tpl-del')) return;
    const existente=data.find(t=>String(t.id)===row.dataset.id);
    if(existente) abrirFormTpl(existente);
  });
  box.querySelectorAll('.tpl-del').forEach(b=>b.onclick=async(ev)=>{
    ev.stopPropagation();
    const id=b.dataset.id; const r=await api(`/api/mis-templates/${id}`,{method:'DELETE'});
    if(r){ toast('Eliminada'); cargarMisTpl(); } else toast('Error');
  });
}
/* ════════ Recordatorios — ahora viven en el SERVIDOR (/api/tareas con vence_at).
   El push llega aunque la app esté cerrada; el barrido lo hace el backend cada 60s. ════════ */
async function renderRecordatorios(){
  const box=document.getElementById('recList'); if(!box) return;
  const d=await api('/api/tareas');
  const r=(d||[]).filter(t=>t.vence_at&&Number(t.completada)!==1);
  if(!r.length){ box.innerHTML='<div style="font-size:12px;color:var(--text-3);text-align:center;padding:10px">Sin recordatorios</div>'; return; }
  box.innerHTML=r.map(x=>`<div class="sch-item"><span class="sch-time">${parseDbDate(x.vence_at).toLocaleString('es-CO',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'})}</span><span class="sch-body">${esc(x.texto)}</span><button class="sch-del" data-rec="${x.id}">${I(SVG.x,14)}</button></div>`).join('');
  box.querySelectorAll('[data-rec]').forEach(b=>b.onclick=async()=>{ await api('/api/tareas/'+b.dataset.rec,{method:'DELETE'}); renderRecordatorios(); });
}
function initRecordatorios(){
  // Migración one-shot: recordatorios viejos de localStorage → servidor
  try{
    const viejos=JSON.parse(localStorage.getItem('sp_records')||'[]');
    if(viejos.length){
      Promise.all(viejos.map(x=>api('/api/tareas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto:x.txt,venceAt:new Date(x.dt).toISOString()})})))
        .then(()=>localStorage.removeItem('sp_records'));
    }
  }catch(e){}
}
/* ════════ Estadísticas semanales ════════ */
async function cargarInsigniasPerfil(){
  const box=document.getElementById('perfilInsignias'); if(!box) return;
  const d=await api('/api/me/insignias');
  if(!d||!d.catalogo){ box.innerHTML='<span style="font-size:12px;color:var(--text-3)">No disponible</span>'; return; }
  const ganadas=new Set((d.ganadas||[]).map(g=>g.codigo));
  const cats=Object.entries(d.catalogo);
  box.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:8px">${cats.map(([cod,c])=>{
    const on=ganadas.has(cod);
    return `<div title="${esc(c.desc)}" style="display:flex;flex-direction:column;align-items:center;gap:3px;width:64px;opacity:${on?1:.32};filter:${on?'none':'grayscale(1)'}">
      <div style="width:44px;height:44px;border-radius:14px;display:grid;place-items:center;font-size:22px;background:${on?'var(--gold-soft,rgba(200,164,90,.14))':'var(--bg-3)'};border:1px solid ${on?'var(--gold)':'var(--border-soft)'}">${c.emoji}</div>
      <span style="font-size:9.5px;color:var(--text-3);text-align:center;line-height:1.1">${esc(c.label)}</span>
    </div>`;
  }).join('')}</div><div style="font-size:11px;color:var(--text-3);margin-top:8px">${ganadas.size} de ${cats.length} desbloqueadas</div>`;
}
// Ranking global de la Red (asesores externos): nivel del propio asesor con barra de
// progreso + podio/lista de toda la Red, resaltando la posición propia.
async function cargarRankingRed(){
  const miBox=document.getElementById('rankMiNivel');
  const lista=document.getElementById('rankLista');
  const [nivelData, rank]=await Promise.all([api('/api/red/nivel'), api('/api/red/ranking')]);
  if(miBox && nivelData && nivelData.nivel){
    const n=nivelData.nivel;
    const pct=Math.round((n.progreso||0)*100);
    const falta=n.faltanXp||0;
    miBox.innerHTML=`<div style="background:var(--bg-2);border:1px solid var(--gold-line,rgba(200,164,90,.3));border-radius:18px;padding:18px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:34px">${n.emoji||'🥉'}</div>
        <div style="flex:1">
          <div style="font-size:17px;font-weight:800;color:var(--gold)">${esc(n.nombre||'Bronce')}</div>
          <div style="font-size:12px;color:var(--text-3)">${nivelData.xp||0} XP acumulado</div>
        </div>
      </div>
      <div style="margin-top:12px;height:9px;border-radius:999px;background:var(--bg-4,rgba(255,255,255,.08));overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--grad-gold);border-radius:999px"></div>
      </div>
      <div style="font-size:11px;color:var(--text-3);margin-top:6px">${n.siguienteNombre?`Faltan ${falta} XP para ${esc(n.siguienteNombre)}`:'¡Nivel máximo alcanzado! 💎'}</div>
    </div>`;
  } else if(miBox){ miBox.innerHTML=''; }
  if(!lista) return;
  if(!Array.isArray(rank)||!rank.length){ lista.innerHTML='<div style="text-align:center;color:var(--text-3);padding:24px;font-size:13px">Aún no hay ranking. ¡Cierra ventas para escalar!</div>'; return; }
  const medal=i=>i===0?'🥇':i===1?'🥈':i===2?'🥉':`<span style="color:var(--text-3);font-size:13px;width:22px;display:inline-block;text-align:center">${i+1}</span>`;
  lista.innerHTML=rank.map((v,i)=>`<div style="display:flex;align-items:center;gap:11px;padding:11px 10px;border-radius:12px;margin-bottom:6px;${v.yo?'background:var(--gold-soft,rgba(200,164,90,.1));border:1px solid var(--gold-line,rgba(200,164,90,.3))':'border-bottom:1px solid var(--border-soft)'}">
    <span style="width:26px;text-align:center;font-size:16px">${medal(i)}</span>
    <div class="m-avatar" style="width:36px;height:36px;border-radius:12px;font-size:13px;background:${v.foto?'':avatarColor(v.nombre)};overflow:hidden">${v.foto?`<img src="${esc(v.foto)}" style="width:100%;height:100%;object-fit:cover">`:initials(v.nombre)}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:14px;font-weight:${v.yo?700:500};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(v.nombre)}${v.yo?' <span style=\"font-size:10px;color:var(--gold)\">(tú)</span>':''}</div>
      <div style="font-size:11px;color:var(--text-3)">${(v.nivel&&v.nivel.emoji)||'🥉'} ${esc((v.nivel&&v.nivel.nombre)||'Bronce')} · ${v.vendidos} ${v.vendidos===1?'venta':'ventas'}</div>
    </div>
    <div style="font-size:13px;color:var(--gold);font-weight:700">${v.xp} XP</div>
  </div>`).join('');
}
async function cargarRankingPerfil(){
  const box=document.getElementById('perfilRanking'); if(!box) return;
  const r=await api('/api/equipo/ranking');
  if(!r||!r.length){ box.innerHTML='<span style="font-size:12px;color:var(--text-3)">Sin datos aún</span>'; return; }
  const medal=i=>i===0?'🥇':i===1?'🥈':i===2?'🥉':`<span style="color:var(--text-3);font-size:12px">${i+1}.</span>`;
  const yo=(me&&me.vendedorId)||(me&&me.id);
  box.innerHTML=r.slice(0,8).map((v,i)=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-soft);${Number(v.vendedorId)===Number(yo)?'background:var(--gold-soft,rgba(200,164,90,.08));border-radius:10px;padding-left:8px;padding-right:8px':''}">
    <span style="width:22px;text-align:center">${medal(i)}</span>
    <span style="flex:1;font-size:13px;font-weight:${Number(v.vendedorId)===Number(yo)?600:400}">${esc(v.nombre||'Asesor')}</span>
    <span style="font-size:12px;color:var(--gold);font-weight:600">${v.vendidosMes} ${v.vendidosMes===1?'venta':'ventas'}</span>
  </div>`).join('');
}
async function cargarStats(){
  const box=document.getElementById('secStats'); if(!box) return;
  const d=await api('/api/me/stats-semanales');
  if(!d){
    box.innerHTML='<div style="padding:14px 16px;text-align:center;color:var(--text-3);font-size:13px">No disponible</div>'; return;
  }
  const diff=n=>n>0?`<span style="color:#57C168">+${n}</span>`:n<0?`<span style="color:var(--red)">${n}</span>`:`<span style="color:var(--text-4)">0</span>`;
  box.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border-soft)">
      <div style="background:var(--bg-2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:700">${d.nuevos}</div><div style="font-size:10px;color:var(--text-3)">Nuevos<span style="margin-left:4px;font-size:10px">${diff(d.nuevos-d.nuevosAnt)}</span></div></div>
      <div style="background:var(--bg-2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:700">${d.respondidos}</div><div style="font-size:10px;color:var(--text-3)">Respond.<span style="margin-left:4px;font-size:10px">${diff(d.respondidos-d.respondidosAnt)}</span></div></div>
      <div style="background:var(--bg-2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:700">${d.cerrados}</div><div style="font-size:10px;color:var(--text-3)">Cerrados<span style="margin-left:4px;font-size:10px">${diff(d.cerrados-d.cerradosAnt)}</span></div></div>
      <div style="background:var(--bg-2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:700">${d.tiempoPromedio}<span style="font-size:10px;color:var(--text-3);font-weight:400"> min</span></div><div style="font-size:10px;color:var(--text-3)">Tiempo resp.<span style="margin-left:4px;font-size:10px">${diff(d.tiempoPromedioAnt?d.tiempoPromedio-d.tiempoPromedioAnt:0)}</span></div></div>
    </div>`;
}

/* ════════ Calendario tab ════════ */
let _citasCal = [], _vistaCal = new Date();
const DIAS_CAL = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const MESES_CAL = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function fechaLocalCal(ts){ return parseDbDate(ts); }
function mismoDiaCal(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function fmtFechaCal(d){ return d.toLocaleDateString('es-CO',{day:'2-digit',month:'short',timeZone:'America/Bogota'})+' · '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'}); }
async function cargarCalendario(){
  _vistaCal.setDate(1);
  const d=await api('/api/citas'); _citasCal=Array.isArray(d)?d:[];
  renderCalendario();
  document.getElementById('calPrev').onclick=()=>{ _vistaCal.setMonth(_vistaCal.getMonth()-1); renderCalendario(); };
  document.getElementById('calNext').onclick=()=>{ _vistaCal.setMonth(_vistaCal.getMonth()+1); renderCalendario(); };
  document.getElementById('calHoy').onclick=()=>{ _vistaCal=new Date(); _vistaCal.setDate(1); renderCalendario(); };
  document.getElementById('calNueva').onclick=()=>abrirModalCita();
}
function renderCalendario(){
  document.getElementById('calMes').textContent=MESES_CAL[_vistaCal.getMonth()]+' '+_vistaCal.getFullYear();
  const grid=document.getElementById('calGrid'); const hoy=new Date();
  const pd=new Date(_vistaCal); const off=(pd.getDay()+6)%7;
  const inicio=new Date(pd); inicio.setDate(1-off); const dia=new Date(inicio);
  let html=DIAS_CAL.map(d=>`<div style="font-size:9px;color:var(--text-3);text-align:center;padding:3px 0;text-transform:uppercase;letter-spacing:.08em">${d}</div>`).join('');
  for(let i=0;i<42;i++){
    const esMes=dia.getMonth()===_vistaCal.getMonth();
    const esHoy=mismoDiaCal(dia,hoy);
    const delDia=_citasCal.filter(c=>{const f=fechaLocalCal(c.fecha); return f&&mismoDiaCal(f,dia);});
    const pend=delDia.filter(c=>c.estado==='pendiente').length;
    html+=`<div class="cal-day" style="${esMes?'':'opacity:.25'};min-height:46px;padding:4px;border-radius:8px;background:${esHoy?'var(--gold-soft)':'var(--bg-1)'};border:1px solid ${esHoy?'var(--gold-line)':'var(--border-soft)'}" data-fecha="${dia.getFullYear()}-${String(dia.getMonth()+1).padStart(2,'0')}-${String(dia.getDate()).padStart(2,'0')}">
      <div style="font-size:10px;font-weight:600;color:${esHoy?'var(--gold)':'var(--text-3)'};text-align:center">${dia.getDate()}</div>
      ${pend?`<div style="font-size:8px;color:var(--gold);text-align:center;background:rgba(200,164,90,.12);border-radius:4px;padding:1px 0;margin-top:2px">${pend} cita${pend>1?'s':''}</div>`:''}
    </div>`;
    dia.setDate(dia.getDate()+1);
  }
  grid.innerHTML=html;
  grid.querySelectorAll('.cal-day').forEach(el=>el.onclick=()=>{
    const f=el.dataset.fecha; abrirModalCita(f);
  });
  // Próximas
  const ahora=new Date(); const prox=_citasCal.filter(c=>{ if(c.estado!=='pendiente') return false; const f=fechaLocalCal(c.fecha); return f&&f>=new Date(ahora.getFullYear(),ahora.getMonth(),ahora.getDate()); }).slice(0,10);
  const px=document.getElementById('calProx');
  if(!prox.length){ px.innerHTML='<div style="font-size:12px;color:var(--text-3);text-align:center;padding:8px">Sin citas pendientes</div>'; return; }
  px.innerHTML=prox.map(c=>{
    const f=fechaLocalCal(c.fecha);
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-soft)">
      <div style="width:4px;height:4px;border-radius:50%;background:var(--gold);flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500">${esc(c.titulo)}</div>
        <div style="font-size:10px;color:var(--text-3);margin-top:1px">${f?fmtFechaCal(f):'—'}${c.customer_name?' · '+esc(c.customer_name):''}</div>
        ${c.recordatorio_send_at?`<div style="font-size:9px;color:var(--gold);margin-top:2px">🔔 Recordatorio ${c.lead_id?'programado':'—'}</div>`:''}
      </div>
      ${c.lead_id?`<button class="cal-rec" data-id="${c.id}" data-rec="${c.recordatorio_send_at?'1':'0'}" style="width:26px;height:26px;border-radius:6px;background:none;border:1.5px solid ${c.recordatorio_send_at?'var(--gold)':'var(--border-strong)'};color:${c.recordatorio_send_at?'var(--gold)':'var(--text-3)'};display:grid;place-items:center" title="Recordatorio WhatsApp">${I(SVG.bell,12)}</button>`:''}
      <button class="cal-hecha" data-id="${c.id}" style="width:26px;height:26px;border-radius:6px;background:none;border:1.5px solid var(--border-strong);color:var(--green);display:grid;place-items:center">${I(SVG.check,12)}</button>
      <button class="cal-cancel" data-id="${c.id}" style="width:26px;height:26px;border-radius:6px;background:none;border:none;color:var(--text-3);display:grid;place-items:center">${I(SVG.x,12)}</button>
    </div>`;
  }).join('');
  px.querySelectorAll('.cal-rec').forEach(b=>b.onclick=()=>abrirRecordatorio(Number(b.dataset.id),b.dataset.rec==='1',b));
  px.querySelectorAll('.cal-hecha').forEach(b=>b.onclick=async()=>{
    await api('/api/citas/'+b.dataset.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({estado:'hecha'})});
    toast('Cita completada'); cargarCalendario();
  });
  px.querySelectorAll('.cal-cancel').forEach(b=>b.onclick=async()=>{
    await api('/api/citas/'+b.dataset.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({estado:'cancelada'})});
    toast('Cita cancelada'); cargarCalendario();
  });
}
function abrirModalCita(fechaPref, lead){
  const d=fechaPref?new Date(fechaPref+'T'+(new Date().toTimeString().slice(0,5))):new Date();
  d.setHours(d.getHours()+1,0,0,0);
  const iso=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  const tituloPref = lead ? 'Cita: '+(lead.customer_name||'Cliente') : '';
  openSheet('Nueva cita',`<div style="display:flex;flex-direction:column;gap:10px">
    <input id="calTitulo" placeholder="Título de la cita" value="${tituloPref}" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:14px;outline:none">
    <input id="calFecha" type="datetime-local" value="${iso}" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:14px;outline:none">
    <input id="calNotas" placeholder="Notas (opcional)" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:14px;outline:none">
    <button class="cop-use" id="calGuardar" style="margin-top:4px">Agendar</button>
  </div>`);
  setTimeout(()=>document.getElementById('calTitulo').focus(),100);
  document.getElementById('calGuardar').onclick=async()=>{
    const titulo=document.getElementById('calTitulo').value.trim();
    const fecha=document.getElementById('calFecha').value;
    const notas=document.getElementById('calNotas').value.trim();
    if(!titulo||!fecha){ toast('Completa título y fecha','err'); return; }
    const r=await api('/api/citas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({titulo,fecha:fecha.replace('T',' ')+':00',notas,leadId:lead?.id||null})});
    if(r&&r.ok){ toast('Cita agendada'); closeSheet(); cargarCalendario(); }
    else toast('Error al agendar','err');
  };
}

/* Recordatorio automático de cita — mensaje programado con template de WhatsApp.
   Se envía ANTES de la cita (antelación configurable) y llega aunque la ventana de
   24h esté cerrada, porque va como plantilla aprobada de Meta. */
const ANTELACIONES_REC=[['1','1 hora'],['3','3 horas'],['6','6 horas'],['24','1 día'],['48','2 días']];
async function abrirRecordatorio(citaId, yaProgramado, btnEl){
  haptic(8);
  const rec=await api(`/api/citas/${citaId}/recordatorio`);
  const estado=rec&&rec.ok?rec:null;
  const tiene=estado&&estado.programado;
  const sinTpl=estado&&!estado.template_configurado;
  const chips=ANTELACIONES_REC.map(([h,label])=>`<button data-ah="${h}" style="flex:1;padding:9px 0;border-radius:10px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);font-size:12px;font-family:inherit;cursor:pointer">${label}</button>`).join('');
  openSheet('🔔 Recordatorio de cita',`<div style="display:flex;flex-direction:column;gap:10px">
    <div style="font-size:12px;color:var(--text-3);line-height:1.5">El cliente recibirá un mensaje automático de WhatsApp con la <b style="color:var(--text)">plantilla de recordatorio</b> antes de la cita. Como va como plantilla, llega incluso si la ventana de 24h ya está cerrada (ej. cita del domingo).</div>
    ${tiene?`<div style="font-size:12px;color:var(--gold);background:rgba(200,164,90,.1);border:1px solid rgba(200,164,90,.3);border-radius:10px;padding:9px 11px">✓ Recordatorio programado ${estado.recordatorio&&estado.recordatorio.send_at?'para '+parseDbDate(estado.recordatorio.send_at).toLocaleString('es-CO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'}):''}</div>`:''}
    ${sinTpl?`<div style="font-size:12px;color:var(--red);border:1px solid var(--red);border-radius:10px;padding:9px 11px">El admin aún no configura el template de recordatorio (Configuración → Template de recordatorio de citas).</div>`:''}
    <div style="font-size:11px;color:var(--text-3);margin-top:2px">Antelación del recordatorio:</div>
    <div style="display:flex;gap:6px">${chips}</div>
    ${tiene?`<button class="cop-use" id="recCancelar" style="background:var(--bg-3);color:var(--red)">Cancelar recordatorio</button>`:''}
  </div>`);
  document.querySelectorAll('[data-ah]').forEach(b=>b.onclick=async()=>{
    const h=b.dataset.ah;
    const r=await api(`/api/citas/${citaId}/recordatorio`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({antelacionHoras:Number(h)})});
    if(r&&r.ok){ toast('Recordatorio programado 🔔'); closeSheet(); cargarCalendario(); }
    else{
      const msg=r&&r.error==='sin_template'?'Falta configurar el template de recordatorio':'No se pudo programar';
      toast(msg,'err');
      if(r&&r.error==='sin_template'&&btnEl) btnEl.style.display='none';
    }
  });
  document.getElementById('recCancelar')?.addEventListener('click',async()=>{
    const r=await api(`/api/citas/${citaId}/recordatorio`,{method:'DELETE'});
    if(r&&r.ok){ toast('Recordatorio cancelado'); closeSheet(); cargarCalendario(); }
    else toast('Error al cancelar','err');
  });
}

/* ════════ Tareas tab — tareas REALES (/api/tareas), separadas de las citas ════════ */
async function cargarTareas(){
  const box=document.getElementById('taskList'); if(!box) return;
  const d=await api('/api/tareas');
  if(!d||!d.length){ box.innerHTML='<div style="text-align:center;color:var(--text-3);padding:20px">Sin tareas pendientes</div>'; } else {
    box.innerHTML=d.map(t=>{
      const done=Number(t.completada)===1;
      const cuando=t.vence_at?parseDbDate(t.vence_at).toLocaleString('es-CO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'}):'';
      const vencida=!done&&t.vence_at&&new Date(t.vence_at)<new Date();
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-soft)"><button class="task-toggle" data-id="${t.id}" style="width:24px;height:24px;border-radius:6px;border:2px solid ${done?'var(--green)':'var(--border-strong)'};background:${done?'var(--green)':'transparent'};display:grid;place-items:center;flex-shrink:0;color:#0A0A0A;${done?'':'color:transparent'}">${I(SVG.check,14)}</button><div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:500;${done?'text-decoration:line-through;opacity:.5':''}">${esc(t.texto)}</div>${cuando?`<div style="font-size:11px;color:${vencida?'var(--red)':'var(--text-3)'};margin-top:2px">🔔 ${cuando}${Number(t.lead_id)?' · Lead #'+t.lead_id:''}</div>`:(Number(t.lead_id)?`<div style="font-size:11px;color:var(--text-3);margin-top:2px">Lead #${t.lead_id}</div>`:'')}</div><button class="task-del" data-id="${t.id}" style="width:28px;height:28px;border-radius:50%;background:none;border:none;color:var(--text-3);display:grid;place-items:center">${I(SVG.x,14)}</button></div>`;
    }).join('');
    box.querySelectorAll('.task-toggle').forEach(b=>b.onclick=async()=>{
      const id=b.dataset.id; const t=d.find(x=>String(x.id)===String(id)); if(!t) return;
      await api('/api/tareas/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({completada:Number(t.completada)!==1})}); haptic(8); cargarTareas();
    });
    box.querySelectorAll('.task-del').forEach(b=>b.onclick=async()=>{ await api('/api/tareas/'+b.dataset.id,{method:'DELETE'}); cargarTareas(); });
  }
  const addBtn=document.getElementById('taskAdd');
  if(addBtn) addBtn.onclick=async()=>{
    const txt=document.getElementById('taskTxt').value.trim(); if(!txt) return;
    const venceAt=document.getElementById('taskDt')&&document.getElementById('taskDt').value?new Date(document.getElementById('taskDt').value).toISOString():null;
    await api('/api/tareas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto:txt,venceAt})});
    document.getElementById('taskTxt').value=''; if(document.getElementById('taskDt')) document.getElementById('taskDt').value='';
    cargarTareas(); toast(venceAt?'Recordatorio creado — te avisaremos':'Tarea creada');
  };
  document.getElementById('taskTxt')&&document.getElementById('taskTxt').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); document.getElementById('taskAdd')&&document.getElementById('taskAdd').click(); } });
}

/* ════════ Tiempo real ════════ */
// Refresco INCREMENTAL: al llegar un mensaje se actualiza SOLO ese lead
// (1 request pequeño) en vez de recargar /api/mis-leads completo por cada evento.
let _fullRefreshPend=null;
async function refrescarLead(leadId){
  if(!leadId){ // sin leadId en el evento → refresco completo con debounce de 2s
    clearTimeout(_fullRefreshPend);
    _fullRefreshPend=setTimeout(async()=>{ const d=await api('/api/mis-leads'); if(d) leads=d; renderList(); },2000);
    return;
  }
  const l=await api('/api/leads/'+leadId);
  if(!l){ // el lead ya no es mío (reasignado/archivado) → sacarlo de la lista
    leads=leads.filter(x=>Number(x.id)!==Number(leadId)); renderList(); return;
  }
  const idx=leads.findIndex(x=>Number(x.id)===Number(leadId));
  if(idx>=0) {
    leads[idx]=Object.assign({},leads[idx],l);
  } else if(Number(l.assigned_to_id)===Number(miId()) || miId()===0) {
    leads.unshift(l);
  }
  leads.sort((a,b)=>parseDbDate(b.updated_at||b.created_at)-parseDbDate(a.updated_at||a.created_at));
}
let _primeraConexion=true;

/* ════════ Supervisión (tab exclusivo rol = jefe) ════════ */
let _superData = {kpis:null, conversaciones:[], _offset:0, _total:0, equipo:[], alertasCount:0, currentPage:0, perPage:30};

async function cargarSupervision(){
  const pkp = document.getElementById('superKPIs'); if(!pkp) return;
  // Cargar en paralelo
  try{ _superData.kpis = await api('/api/supervisor/dashboard'); }
  catch(e){ _superData.kpis = {kpis:{leadsActivos:0, leadsSinResponder:0, vendidos:0, conversionGlobal:0}}; }
  try{ _superData.alertasCount = (await api('/api/supervisor/alertas/sin-leer') || {}).count || 0; }
  catch(e){ _superData.alertasCount = 0; }
  _superRenderKPIs();
  cargarSuperConversaciones(false);
  cargarSuperEquipo();
  cargarSuperAlertas();
  // Cargar lista de asesores para el filtro
  try{
    const res = await api('/api/supervisor/equipo');
    const eq = (res && res.asesores) || res;
    const sel = document.getElementById('superFiltroVendedor');
    if(sel && Array.isArray(eq)){ for(const a of eq){ let o = document.createElement('option'); o.value = a.id; o.textContent = a.nombre; sel.appendChild(o); } }
  }catch(e){}
  // Cargar canales para el selector
  const selC = document.getElementById('superFiltroCanal');
  if(selC&&!selC.querySelector('option[value="whatsapp"]')){ selC.innerHTML='<option value="">Todos los canales</option><option value="whatsapp">WhatsApp</option><option value="messenger">Messenger</option><option value="instagram">Instagram</option>'; }
  // Setup filtros
  _superSetupFilters();
}
// Refresco ligero SSE: solo KPIs + inbox (sin reconstruir filtros/equipo completo)
async function cargarSuperVisionRefresh(){
  if(!document.getElementById('superKPIs')) return;
  try{ _superData.kpis = await api('/api/supervisor/dashboard'); }catch(e){}
  try{ _superData.alertasCount = (await api('/api/supervisor/alertas/sin-leer') || {}).count || 0; }catch(e){}
  _superRenderKPIs();
  cargarSuperConversaciones(false);
  try{ cargarSuperAlertas(); }catch(e){}
}
function _superRenderKPIs(){
  const k = (_superData.kpis&&_superData.kpis.kpis)||{};
  const kp = k.kpis||k;
  const box = document.getElementById('superKPIs'); if(!box) return;
  box.innerHTML = `<div style="background:rgba(200,164,90,.06);border:1px solid rgba(200,164,90,.12);border-radius:14px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#C8A45A">${kp.leadsActivos||kp.activos||0}</div><div style="font-size:10px;color:#6D6D6D;margin-top:2px;text-transform:uppercase;letter-spacing:.04em">Activos</div></div>`+
    `<div style="background:rgba(200,164,90,.06);border:1px solid rgba(229,72,77,.25);border-radius:14px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#E5484D">${kp.leadsSinResponder||kp.sinRespuesta||_superData.alertasCount||0}</div><div style="font-size:10px;color:#6D6D6D;margin-top:2px;text-transform:uppercase;letter-spacing:.04em">Sin resp.</div></div>`+
    `<div style="background:rgba(200,164,90,.06);border:1px solid rgba(200,164,90,.12);border-radius:14px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#C8A45A">${kp.vendidos||0}</div><div style="font-size:10px;color:#6D6D6D;margin-top:2px;text-transform:uppercase;letter-spacing:.04em">Vendidos</div></div>`+
    `<div style="background:rgba(200,164,90,.06);border:1px solid rgba(200,164,90,.12);border-radius:14px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#C8A45A">${kp.conversionGlobal||kp.conversion||'0'}%</div><div style="font-size:10px;color:#6D6D6D;margin-top:2px;text-transform:uppercase;letter-spacing:.04em">Conver.</div></div>`;
}

function _superInbConversacion(a){ var n=a.customer_name||'Cliente'; var ini=initials(n);
  // El backend emite assigned_to_nombre (ver store.getUnifiedConversations); leer
  // assigned_to_name dejaba TODAS las filas en "Sin asesor" aunque el chat sí lo mostrara.
  var col=avatarColor(n); var ms = (a.last_message||'').slice(0,60); var as=a.assigned_to_nombre||a.assigned_to_name||'Sin asesor';
  return `<div class="super-card" data-cid="${a.id}" data-lid="${a.lead_id||''}" style="display:flex;align-items:center;gap:8px;padding:12px;border-bottom:0.5px solid var(--border);cursor:pointer">
    <div style="width:42px;height:42px;border-radius:13px;display:grid;place-items:center;color:#fff;font-weight:600;font-size:13px;position:relative;overflow:hidden;background:${col};min-width:42px"><span>${ini}</span></div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:14px">${esc(n)}</b><span style="font-size:11px;color:#6D6D6D">${soloHora(a.updated_at||a.created_at)}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px"><span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-2)">${esc(ms)}</span><span style="font-size:10px;color:#C8A45A">${esc(as)}</span></div>
      ${a.etiqueta?`<span style="display:inline-block;margin-top:3px;font-size:9px;padding:2px 6px;border-radius:5px;background:rgba(200,164,90,.13);color:#C8A45A;text-transform:uppercase;letter-spacing:.04em">${(ETQ[a.etiqueta]||{t:a.etiqueta}).t}</span>`:''}
      ${Number(a.visto_sin_responder||0)&&!Number(a.unread_count||0)?`<span style="display:inline-block;margin-top:3px;margin-left:4px;font-size:9px;padding:2px 6px;border-radius:5px;background:rgba(200,164,90,.13);color:#C8A45A">👀 EN VISTO</span>`:''}
    </div>
  </div>`;
}

function cargarSuperConversaciones(append){
  const fVd = document.getElementById('superFiltroVendedor');
  const fEtq = document.getElementById('superFiltroEtiqueta');
  const fCh = document.getElementById('superFiltroCanal');
  const fSr = document.getElementById('superSinResp');
  let params = new URLSearchParams();
  if(fVd && fVd.value) params.set('vendedorId', fVd.value);
  if(fEtq && fEtq.value) params.set('etiqueta', fEtq.value);
  if(fCh && fCh.value) params.set('canal', fCh.value);
  if(fSr && fSr.checked) params.set('soloSinResponder','1');
  params.set('limit','30');
  if(append) params.set('offset', _superData._offset);
  api('/api/supervisor/conversaciones?' + params.toString()).then(resp=>{
    const conv = (resp&&resp.conversaciones)||resp;
    if(!conv){ return; }
    _superData._total = (resp && resp.total != null) ? Number(resp.total) : conv.length;
    if(append){ _superData.conversaciones = _superData.conversaciones.concat(conv); _superData._offset += conv.length; }
    else { _superData.conversaciones = conv || []; _superData._offset = conv.length; }
    _superRenderConversaciones();
  }).catch(()=>{});
}

function _superRenderConversaciones(){
  var box = document.getElementById('superInboxList'); if(!box) return;
  var convs = _superData.conversaciones;
  if(!convs.length){ box.innerHTML = '<div style="text-align:center;color:#6D6D6D;padding:20px 0;font-size:12px;font-style:italic">No hay conversaciones</div>'; return; }
  box.innerHTML = convs.map(c=>_superInbConversacion(c)).join('');
  // Click en cada card
  box.querySelectorAll('[data-cid]').forEach(el=>el.addEventListener('click', ()=>{
    var conv = _superData.conversaciones.find(c=> String(c.id) === String(el.dataset.cid));
    if(conv) abSuperChat(conv);
  }));
  var moreBtn = document.getElementById('superInboxMore');
  if(moreBtn){
    moreBtn.style.display = (_superData._total > 0 && _superData.conversaciones.length < _superData._total) ? 'block' : 'none';
    moreBtn.querySelector('button').onclick = ()=> cargarSuperConversaciones(true);
  }
}

function cargarSuperEquipo(){
  api('/api/supervisor/equipo').then(res=>{
    var eq = (res && res.asesores) || res;
    var box = document.getElementById('superEquipo'); if(!box) return;
    if(!eq||!eq.length){ box.innerHTML = '<div style="text-align:center;color:#6D6D6D;padding:20px 0;font-size:12px;font-style:italic">Sin asesores</div>'; return; }
    box.innerHTML = eq.map(a=>{
      var col=avatarColor(a.nombre);
      return `<div style="display:flex;align-items:center;gap:8px;padding:10px;border-bottom:0.5px solid var(--border);font-size:13px">
        <div style="width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:12px;font-weight:600;background:${col};overflow:hidden;min-width:34px">${a.foto?`<img src="${a.foto}" style="width:100%;height:100%;object-fit:cover">`:initials(a.nombre)}</div>
        <div style="flex:1;min-width:0"><b>${esc(a.nombre)}</b><div style="font-size:11px;color:#6D6D6D">Activos: ${a.activos||a.leadsActivos||0} · Pendientes: ${a.pendientes||a.leadsPendientes||0}</div></div>
        <span style="font-size:10px;color:#C8A45A">${a.conversion||'0'}%</span>
      </div>`;
    }).join('');
  }).catch(()=>{});
}

function cargarSuperAlertas(){
  api('/api/supervisor/alertas?limit=5').then(resp=>{
    const al = (resp&&resp.alertas)||resp;
    var box = document.getElementById('superAlertas'); if(!box) return;
    if(!al||!al.length){ box.innerHTML = '<div style="text-align:center;color:#6D6D6D;padding:12px;font-size:12px">Sin alertas críticas</div>'; return; }
    box.innerHTML = al.map(a=>`<div style="padding:8px 12px;background:rgba(200,164,90,.04);border-radius:8px;font-size:12px">
      <div style="font-weight:600;color:#C8A45A">${esc(a.titulo||'')}</div>
      <div style="color:var(--text-2);margin-top:2px">${esc(a.cuerpo||a.descripcion||'')}</div>
    </div>`).join('');
  }).catch(()=>{});
}

function _superSetupFilters(){
  var ffV = document.getElementById('superFiltroVendedor');
  var ffE = document.getElementById('superFiltroEtiqueta');
  var ffC = document.getElementById('superFiltroCanal');
  var ffS = document.getElementById('superSinResp');
  [ffV, ffE, ffC].forEach(function(sel){ if(sel) sel.addEventListener('change', function(){ cargarSuperConversaciones(false); }); });
  if(ffS) ffS.addEventListener('change', function(){ cargarSuperConversaciones(false); });
}

// Chat de Supervisión actualmente abierto (o null). El handler SSE 'nuevo_mensaje' lo
// usa para saber si debe refrescar este overlay en vivo — antes solo el chat normal
// (#scChat) escuchaba el stream; Supervisión se quedaba con la foto del momento en que
// se abrió hasta que el jefe cerraba y volvía a entrar.
let _superChatAbierto = null;

// Recarga el timeline del chat de Supervisión abierto. Se usa tanto al abrirlo como
// al llegar un evento en vivo que le pertenece — mismo bifurcado por _type que
// public/supervisor/conversaciones.html, porque legacy (/mensajes) y multicanal
// (/timeline) devuelven formas distintas ({lead,mensajes,...} vs {messages:[...]}).
function _superCargarTimeline(){
  if(!_superChatAbierto) return;
  var conv = _superChatAbierto;
  var tc = document.getElementById('superChatTimeline');
  if(!tc) return;
  var loadMsgs = conv.isLead
    ? api('/api/leads/'+conv.id+'/mensajes').then(function(d){ return (d && d.mensajes) || []; })
    : api('/api/inbox/conversations/'+conv.id+'/timeline').then(function(d){
        return (d && d.messages || []).filter(function(m){ return m.event_type === 'message'; })
          .map(function(m){ return { body: m.body, direction: m.direction, timestamp: m.created_at }; });
      });
  loadMsgs.then(function(msgs) {
    if(!_superChatAbierto || _superChatAbierto !== conv) return; // se cerró o cambió mientras cargaba
    if(!msgs || !msgs.length) { tc.innerHTML = '<div style="text-align:center;color:#6D6D6D;padding:30px">Sin mensajes</div>'; return; }
    var html = '';
    for(var i=0; i<msgs.length; i++){
      var m = msgs[i];
      var isOut = m.direction === 'outgoing';
      var h = soloHora(m.timestamp);
      html += `<div style="display:flex;flex-direction:column;align-items:${isOut?'flex-end':'flex-start'};margin-bottom:8px">
        <div style="max-width:80%;padding:10px 14px;border-radius:16px;background:${isOut?'rgba(200,164,90,.12)':'var(--bg-2)'};font-size:14px;line-height:1.4;color:var(--text);word-break:break-word">${esc(m.body||'')}</div>
        <span style="font-size:10px;color:#6D6D6D;margin-top:2px">${h}</span>
      </div>`;
    }
    tc.innerHTML = html;
    setTimeout(function(){ tc.scrollTop = tc.scrollHeight; }, 100);
  }).catch(function(){ if(tc) tc.innerHTML = '<div style="text-align:center;color:#6D6D6D;padding:30px">Error cargando mensajes (¿sin permiso?)</div>'; });
}

function abSuperChat(conv){
  // conv puede venir de getUnifiedConversations(): mezcla ids de `conversations` y
  // de `leads` legacy en el mismo campo `id`, distinguidos por _type. No asumir
  // nunca que conv.id es un lead_id — hay que desambiguar antes de pedir mensajes.
  var isLead = conv._type === 'lead';
  if(!isLead && !conv.lead_id) { toast('No se pudo abrir esta conversación','err'); return; }
  var loading = document.createElement('div');
  loading.id = 'superChatOverlay';
  loading.style.cssText = 'position:fixed;inset:0;background:#0A0A0A;z-index:6000;overflow-y:auto;color:var(--text)';
  loading.innerHTML = `<div style="padding:12px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 0;border-bottom:1px solid var(--border)">
    <button id="superBackBtn" style="background:none;border:none;color:#C8A45A;font-size:24px;padding:0 4px;cursor:pointer;line-height:1;margin-top:-3px">←</button>
    <div style="min-width:0"><div style="font-weight:600;font-size:14px">${esc(conv.customer_name||'Cliente')}</div><div style="font-size:10px;color:#6D6D6D">${esc(conv.assigned_to_nombre||'Sin asesor')}</div></div>
    <button id="superReassignBtn" style="margin-left:auto;border:1px solid rgba(200,164,90,.4);padding:8px 14px;border-radius:10px;color:#C8A45A;background:rgba(200,164,90,.06);font-size:12px;cursor:pointer;font-family:inherit">Reasignar ↻</button>
  </div>
  <div id="superChatTimeline" style="display:flex;flex-direction:column;gap:8px"><div style="text-align:center;color:#6D6D6D;padding:30px"><div style="animation:spin 1s linear infinite;width:24px;height:24px;border:2px solid #C8A45A;border-top-color:transparent;border-radius:50%;margin:0 auto 12px"></div><p>Cargando...</p></div></div></div>`;
  document.body.appendChild(loading);
  // leadId siempre resuelto de antemano (no en cada refresco) para que el handler SSE
  // pueda comparar contra x.leadId en O(1) sin repetir la lógica de desambiguación.
  _superChatAbierto = { isLead: isLead, id: conv.id, leadId: isLead ? conv.id : (conv.lead_id || null) };
  // Back button
  document.getElementById('superBackBtn').addEventListener('click', function(){
    _superChatAbierto = null;
    document.body.removeChild(loading);
  });
  // Reassign button
  var reasBtn = document.getElementById('superReassignBtn');
  if(reasBtn) reasBtn.addEventListener('click', async ()=>{
    // Load available asesores and show selector
    try{
    const vend = await api('/api/vendedores');
    // El jefe puede mover el chat a CUALQUIERA: se muestran todos (incluidos suspendidos
    // y otros jefes) con su estado a la vista, en vez de listar opciones que el backend
    // rechazaba con un error genérico.
    var candidatos = (vend||[]).filter(v=>Number(v.id)!==Number(conv.assigned_to_id));
    function _reasignFila(v){
      var suspendido = String(v.estado||'') !== 'activo';
      return `<button class="reasign-opt" data-vid="${v.id}" data-nombre="${esc(String(v.nombre||'').toLowerCase())}"
        style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:var(--bg-3);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:8px;color:var(--text);cursor:pointer;font-family:inherit;font-size:14px">
        <span style="width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:#fff;font-weight:600;font-size:12px;background:${avatarColor(v.nombre||'')}">${initials(v.nombre||'')}</span>
        <span style="flex:1;min-width:0"><b style="display:block">${esc(v.nombre||'Sin nombre')}</b>
        <span style="font-size:11px;color:${suspendido?'#E5484D':'#6D6D6D'}">${suspendido?'Suspendido':'Activo'}${v.rol&&v.rol!=='vendedor'&&v.rol!=='asesor'?' · '+esc(v.rol):''}</span></span>
      </button>`;
    }
    var opts = candidatos.map(_reasignFila).join('');
    var modal = document.createElement('div');
    modal.id = 'reasignModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10001;background:#0A0A0A;padding:8px;overflow-y:auto';
    modal.innerHTML = `<div style="margin-top:40px">
      <h3 style="color:#C8A45A;margin-bottom:4px">Reasignar a</h3>
      <p style="color:#6D6D6D;font-size:11px;margin-bottom:12px">${esc(conv.customer_name||'Cliente')} · hoy: ${esc(conv.assigned_to_nombre||'sin asesor')}</p>
      ${candidatos.length>6?`<input id="reasignBuscar" placeholder="Buscar asesor..." style="width:100%;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;padding:10px 12px;color:var(--text);font-family:inherit;font-size:14px;margin-bottom:10px">`:''}
      <div id="reasignLista">${opts||'<p style="color:#6D6D6D">No hay nadie más a quien asignar</p>'}</div>
      </div><button id="reasignCancel" style="margin:10px 0 30px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;padding:10px 20px;color:var(--text-2);cursor:pointer;font-family:inherit">Cancelar</button>`;
    document.body.appendChild(modal);
    var buscador = document.getElementById('reasignBuscar');
    if(buscador) buscador.addEventListener('input', function(){
      var q = this.value.trim().toLowerCase();
      modal.querySelectorAll('.reasign-opt').forEach(function(b){ b.style.display = (!q || b.dataset.nombre.indexOf(q)>=0) ? 'flex' : 'none'; });
    });
    var ERRORES_REASIGNAR = {
      lead_no_existe: 'Ese chat ya no existe.',
      vendedor_no_existe: 'Ese asesor ya no existe en el equipo.',
      mismo_asesor: 'Ese chat ya está asignado a esa persona.',
    };
    modal.querySelectorAll('.reasign-opt').forEach(br=>br.onclick = async()=>{
      var vid = br.dataset.vid;
      br.disabled = true; br.style.opacity = '.5';
      var reasignLeadId = isLead ? conv.id : conv.lead_id;
      var r = await apiDetailed('/api/supervisor/reasignar/'+reasignLeadId, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vendedorId: parseInt(vid)})});
      if(r&&r.ok){ toast('Chat reasignado a '+(r.vendedor&&r.vendedor.nombre||'')); document.body.removeChild(modal); _superChatAbierto=null; document.body.removeChild(loading); cargarSuperConversaciones(false); }
      else {
        br.disabled = false; br.style.opacity = '1';
        // Mostrar el motivo real del backend en vez de un "no se pudo" a ciegas.
        toast((r&&(ERRORES_REASIGNAR[r.error]||r.detalle||r.error))||'No se pudo reasignar','err');
      }
    });
    document.getElementById('reasignCancel').onclick = ()=> modal.parentNode && modal.parentNode.removeChild(modal);
    }catch(e){ toast('No se pudo cargar el equipo','err'); }
  });
  _superCargarTimeline();
}

let _es=null, _esReconnectDelay=2000;
function conectarStream(){ try{ const es=new EventSource('/api/stream'); _es=es;
  // Al (re)conectar: refresco completo una vez — pudo perderse algo mientras no había stream.
  // Si además hay un chat abierto, sus mensajes también se refrescan — lo que haya llegado
  // mientras la conexión estuvo caída (SSE no tiene replay: eventos perdidos, perdidos).
  es.addEventListener('conectado',async()=>{ _esReconnectDelay=2000; if(_primeraConexion){ _primeraConexion=false; return; }
    const d=await api('/api/mis-leads'); if(d){ leads=d; renderFilters(); updateCardBadges(); renderList(); }
    if(current&&$('#scChat').classList.contains('show')){ const dm=await api(`/api/leads/${current.id}/mensajes`); if(dm){ currentMsgs=dm.mensajes; _audioPlayers={}; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); const b=$('#cMsgs'); b.scrollTop=b.scrollHeight; } }
  });
  // Red de externos: aprobación/rechazo de la suscripción en vivo. Si el asesor está en la
  // pantalla de suscripción y le aprueban el pago, la app se recarga sola con acceso pleno.
  es.addEventListener('red_suscripcion',async ev=>{ let x={}; try{x=JSON.parse(ev.data);}catch(e){}
    if(x.estado==='activa'){ toast('✅ ¡Suscripción activada!'); setTimeout(()=>location.reload(),1200); }
    else if(x.estado==='rechazado'){ toast('Tu comprobante fue rechazado. Vuelve a enviarlo.'); }
    else if(x.estado==='vencida'){ toast('Tu suscripción venció. Renueva para seguir recibiendo clientes.'); }
  });
  es.addEventListener('nuevo_mensaje',async ev=>{ let x={}; try{x=JSON.parse(ev.data);}catch(e){}
    await refrescarLead(x.leadId);
    if(tab==='supervision'){ try{ cargarSuperVisionRefresh(); }catch(e){} }
    const dot=$('#navDot'); const totalUnread=leads.reduce((s,l)=>s+Number(l.unread_count||0),0); if(dot) dot.style.display=totalUnread>0?'':'none'; try{ navigator.setAppBadge&&navigator.setAppBadge(totalUnread); }catch(e){}
    if(current&&$('#scChat').classList.contains('show')){ const dm=await api(`/api/leads/${current.id}/mensajes`); if(dm){ currentMsgs=dm.mensajes; _audioPlayers={}; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); const b=$('#cMsgs'); b.scrollTop=b.scrollHeight; } } else { renderFilters(); updateCardBadges(); renderList(); }
    if(_superChatAbierto&&_superChatAbierto.leadId&&Number(_superChatAbierto.leadId)===Number(x.leadId)) _superCargarTimeline();
    try{ if(x.tipo==='mensaje_cliente'){ haptic([100,50,100]); playNotifSound(); } }catch(e){} });
  es.addEventListener('lead_actualizado',async ev=>{ let x={}; try{x=JSON.parse(ev.data);}catch(e){} await refrescarLead(x.leadId); if(current&&$('#scChat').classList.contains('show')){ const dm=await api(`/api/leads/${current.id}/mensajes`); if(dm){ currentMsgs=dm.mensajes; _audioPlayers={}; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); const b=$('#cMsgs'); b.scrollTop=b.scrollHeight; } } else { renderFilters(); updateCardBadges(); renderList(); }
    if(_superChatAbierto&&_superChatAbierto.leadId&&Number(_superChatAbierto.leadId)===Number(x.leadId)) _superCargarTimeline(); });
  // Checkmark en vivo cuando el cliente recibe/lee (sin re-render del chat)
  es.addEventListener('status_update',ev=>{ try{ const x=JSON.parse(ev.data); if(!current||Number(x.leadId)!==Number(current.id)) return;
    const m=currentMsgs.find(mm=>Number(mm.id)===Number(x.messageId));
    // Guardar el motivo en memoria: msgsHTML() se re-ejecuta sin refetch en varios
    // sitios (buscador, "Ver más", destacar, traducir) y sin esto el aviso de fallo
    // desaparecería solo en el siguiente render.
    if(m){ m.status=x.status; if(x.error!==undefined) m.error_detail=x.error||null; if(x.errorHumano!==undefined) m.error_humano=x.errorHumano||null; }
    if(x.status==='failed'){
      // 'failed' necesita insertar un nodo nuevo (.bub-fail), no solo cambiar el
      // check — el reemplazo quirúrgico de abajo no alcanza para eso.
      if(m){ const cm=$('#cMsgs'); if(cm) cm.innerHTML=msgsHTML(currentMsgs); }
      haptic([120,60,120]); toast(x.errorHumano||'Un mensaje no se entregó','err');
      return;
    }
    const wrap=document.getElementById('msg_'+x.messageId); if(wrap){ const t=wrap.querySelector('.bub__t'); if(t){ const old=t.querySelector('.chk'); if(old){ const tmp=document.createElement('span'); tmp.innerHTML=chkHTML(x.status,null); old.replaceWith(tmp.firstChild); } } } }catch(e){} });
  // Mensaje eliminado (por un asesor o por el cliente — anti-delete)
  es.addEventListener('mensaje_eliminado',async ev=>{ try{ const x=JSON.parse(ev.data); if(current&&Number(x.leadId)===Number(current.id)&&$('#scChat').classList.contains('show')){ const dm=await api(`/api/leads/${current.id}/mensajes`); if(dm){ currentMsgs=dm.mensajes; _audioPlayers={}; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); } if(x.byClient) toast('El cliente eliminó un mensaje — texto conservado'); }
    if(_superChatAbierto&&_superChatAbierto.leadId&&Number(_superChatAbierto.leadId)===Number(x.leadId)) _superCargarTimeline(); }catch(e){} });
  // Reacción del cliente en vivo
  es.addEventListener('reaccion',async ev=>{ try{ const x=JSON.parse(ev.data); if(current&&Number(x.leadId)===Number(current.id)&&$('#scChat').classList.contains('show')){ const dm=await api(`/api/leads/${current.id}/mensajes`); if(dm){ currentMsgs=dm.mensajes; _audioPlayers={}; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); } }
    if(_superChatAbierto&&_superChatAbierto.leadId&&Number(_superChatAbierto.leadId)===Number(x.leadId)) _superCargarTimeline(); }catch(e){} });
  // Notificación del centro (asignaciones, escalamientos, recordatorios…)
  es.addEventListener('notificacion',ev=>{ try{ const x=JSON.parse(ev.data); const b=document.getElementById('notifBadge'); const cur=b?Number(b.textContent)||0:0; setNotifBadge(cur+1); if(x.tipo!=='mensaje_cliente'){ toast('🔔 '+(x.titulo||'Notificación')); haptic([80,40,80]); playNotifSound(); } }catch(e){} });
  // Chat interno del equipo en vivo
  es.addEventListener('equipo_mensaje',ev=>{ try{ const m=JSON.parse(ev.data); if(teamMsgs.find(x=>x.id===m.id)) return; hideEqTyping();
    if(_eqAbierto&&_eqCon==null){ teamMsgs.push(m); renderEquipo(); marcarEquipoLeido(); }
    else if(!esMio(m)){ renderList(); toast('🦁 '+esc(m.from_nombre||'Equipo')+': '+esc(String(m.body).slice(0,40))); haptic([60,30,60]); playNotifSound(); eqNotifyGeneral(m.from_nombre,m.body); } }catch(e){} });
  // Mensaje directo entre asesores (o del admin monitoreando)
  es.addEventListener('equipo_directo',ev=>{ try{ const m=JSON.parse(ev.data); hideEqTyping();
    const otro = Number(m.from_vendedor_id)===Number(miId()) ? Number(m.to_vendedor_id) : Number(m.from_vendedor_id);
    if(_eqAbierto&&Number(_eqCon)===otro){ if(!teamMsgs.find(x=>x.id===m.id)){ teamMsgs.push(m); renderEquipo(); marcarEquipoLeido(); } }
    else if(!esMio(m)){ toast('💬 '+esc(m.from_nombre||'Asesor')+': '+esc(String(m.body).slice(0,40))); haptic([60,30,60]); playNotifSound(); eqNotifyDM(m.from_nombre,m.body); } }catch(e){} });
  // Typing indicator del equipo
  es.addEventListener('equipo_typing',ev=>{ try{ const t=JSON.parse(ev.data);
    if(Number(t.from_id)===Number(miId())) return;
    const canalGeneral=t.to==null&&_eqCon==null;
    const directo=t.to!=null&&Number(_eqCon)===Number(t.from_id);
    if(_eqAbierto&&(canalGeneral||directo)){ showEqTyping(t.from_nombre); setTimeout(hideEqTyping,5000); }
  }catch(e){} });
  // Reacciones del equipo en vivo
  es.addEventListener('equipo_reaction',ev=>{ try{ const r=JSON.parse(ev.data); const idx=teamMsgs.findIndex(x=>x.id===r.messageId); if(idx>=0){ teamMsgs[idx].reactions=r.reactions; if(_eqAbierto) renderEquipo(); } }catch(e){} });
  // Mensaje del equipo eliminado en vivo
  es.addEventListener('equipo_message_deleted',ev=>{ try{ const d=JSON.parse(ev.data); const idx=teamMsgs.findIndex(x=>x.id===d.messageId); if(idx>=0){ teamMsgs[idx].deleted=1; if(_eqAbierto) renderEquipo(); } }catch(e){} });
  // Mensaje fijado/desfijado en vivo
  es.addEventListener('equipo_message_pinned',ev=>{ try{ if(_eqAbierto) eqLoadPinned(); }catch(e){} });
  // ✓✓ Leído en tiempo real — el receptor abrió el DM y el emisor ve los doble checks
  es.addEventListener('equipo_read',ev=>{ try{ const x=JSON.parse(ev.data);
    // x.by = quien leyó, x.con = con quién está chatiendo (el emisor original)
    // Si yo soy el emisor (x.con === miId()), actualizar read_at de mis mensajes
    if(Number(x.con)===Number(miId())){ teamMsgs.forEach(m=>{ if(Number(m.from_vendedor_id)===Number(miId())&&Number(m.to_vendedor_id)===Number(x.by)&&!m.read_at) m.read_at=new Date().toISOString().replace('T',' ').slice(0,19); }); if(_eqAbierto) renderEquipo(); }
  }catch(e){} });
  // Presencia del equipo en vivo
  es.addEventListener('equipo_presence',ev=>{ try{ const p=JSON.parse(ev.data); _eqPresence[p.vendedor_id]={online:p.online,last_seen:p.last_seen}; updateEqPresenceDots(); if(_eqAbierto) renderEqBanner(); }catch(e){} });
  // Transcripción IA lista para una nota de voz
  es.addEventListener('transcripcion',ev=>{ try{ const x=JSON.parse(ev.data); if(!current||Number(x.leadId)!==Number(current.id)) return; const m=currentMsgs.find(mm=>Number(mm.id)===Number(x.messageId)); if(m){ m.transcript=x.transcript; _audioPlayers={}; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); } }catch(e){} });
  // Programados del servidor
  es.addEventListener('programado_enviado',async ev=>{ try{ const x=JSON.parse(ev.data); toast('⏰ Mensaje programado enviado'); if(current&&Number(x.leadId)===Number(current.id)&&$('#scChat').classList.contains('show')){ const dm=await api(`/api/leads/${current.id}/mensajes`); if(dm){ currentMsgs=dm.mensajes; _audioPlayers={}; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); const b2=$('#cMsgs'); b2.scrollTop=b2.scrollHeight; } } }catch(e){} });
  es.addEventListener('programado_fallido',ev=>{ try{ const x=JSON.parse(ev.data); toast('⚠️ Un mensaje programado no se pudo enviar'); haptic([80,40,80]); }catch(e){} });
  // Backoff exponencial (2s, 4s, 8s… tope 30s): un reintento fijo de 5s hace que todos los
  // clientes conectados golpeen al servidor a la vez si cae — esto lo espacia.
  es.onerror=()=>{ es.close(); setTimeout(conectarStream,_esReconnectDelay); _esReconnectDelay=Math.min(_esReconnectDelay*2,30000); };
  }catch(e){} }

// Resincronización al volver de segundo plano: Android puede congelar el WebView y matar
// la conexión SSE sin disparar onerror de forma confiable — sin esto, la app se queda
// mostrando datos viejos hasta que el usuario hace pull-to-refresh a mano.
async function resyncStream(){
  if(outboxPendingCount()>0) outboxFlush();
  if(!_es || _es.readyState!==EventSource.OPEN) conectarStream();
  const d=await api('/api/mis-leads'); if(d){ leads=d; renderFilters(); updateCardBadges(); renderList(); }
  if(current&&$('#scChat').classList.contains('show')){ const dm=await api(`/api/leads/${current.id}/mensajes`); if(dm){ currentMsgs=dm.mensajes; _audioPlayers={}; $('#cMsgs').innerHTML=msgsHTML(currentMsgs); const b=$('#cMsgs'); b.scrollTop=b.scrollHeight; } }
}
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) resyncStream(); });

/* ════════ Lightbox preview ════════ */
let _lbMsgs=[],_lbIdx=0;
window.abrirLB=function(src){
  const wraps=document.querySelectorAll('.bub a.img-tap img');
  _lbMsgs=Array.from(wraps).map(i=>i.src);
  _lbIdx=_lbMsgs.indexOf(src);
  if(_lbIdx<0)_lbMsgs=[src],_lbIdx=0;
  document.getElementById('lbImg').src=src;
  _lbUpdateCounter();
  document.getElementById('lb').classList.add('show');
};
function _lbUpdateCounter(){
  const el=document.getElementById('lbCounter');
  if(el) el.textContent=_lbMsgs.length>1?`${_lbIdx+1} / ${_lbMsgs.length}`:'';
}
function _lbClose(){document.getElementById('lb').classList.remove('show');}
document.getElementById('lbClose').addEventListener('click',_lbClose);
document.getElementById('lb').addEventListener('click',e=>{if(e.target===document.getElementById('lb'))_lbClose();});
let _lbSX=0;
document.getElementById('lb').addEventListener('touchstart',e=>{_lbSX=e.touches[0].clientX;},{passive:true});
document.getElementById('lb').addEventListener('touchend',e=>{
  const dx=e.changedTouches[0].clientX-_lbSX;
  if(Math.abs(dx)>50){
    _lbIdx+=dx<0?1:-1;
    if(_lbIdx<0)_lbIdx=_lbMsgs.length-1;
    if(_lbIdx>=_lbMsgs.length)_lbIdx=0;
    document.getElementById('lbImg').src=_lbMsgs[_lbIdx];
    _lbUpdateCounter();
  }
},{passive:true});
document.addEventListener('keydown',e=>{
  if(!document.getElementById('lb').classList.contains('show'))return;
  if(e.key==='Escape')_lbClose();
  if(e.key==='ArrowRight'){_lbIdx=(_lbIdx+1)%_lbMsgs.length;document.getElementById('lbImg').src=_lbMsgs[_lbIdx];_lbUpdateCounter();}
  if(e.key==='ArrowLeft'){_lbIdx=(_lbIdx-1+_lbMsgs.length)%_lbMsgs.length;document.getElementById('lbImg').src=_lbMsgs[_lbIdx];_lbUpdateCounter();}
});

/* ════════ Arranque (tras declarar todas las const) ════════ */
init();
// Autoinicializar mapas Leaflet cuando cambian los mensajes
const _chatObs=new MutationObserver(()=>initLocationMaps());
const _chatEl=$('#cMsgs');
if(_chatEl) _chatObs.observe(_chatEl,{childList:true,subtree:false});

/* ════════ Red de externos: marca del grupo + pantalla de suscripción ════════ */
function marcaNombre(){ return (me && me.grupo && me.grupo.marca_nombre) || 'Leons Group'; }

// Pantalla que reemplaza toda la app cuando un asesor externo aún no tiene suscripción
// vigente: explica el plan y deja subir el comprobante de pago (Nequi/transferencia).
async function renderSuscripcionGate(){
  const nav=$('#nav'); if(nav) nav.style.display='none';
  const fab=$('#fab'); if(fab) fab.style.display='none';
  const home=$('#scHome'); if(!home) return;
  home.querySelector('.m-scroll')?.remove();
  const s=(me&&me.suscripcion)||{};
  let info=null; try{ info=await api('/api/red/mi-suscripcion'); }catch(e){}
  const plan=(info&&info.plan)||null;
  const pendiente=(info&&info.pagoPendiente)||null;
  const money=n=>'$'+(Number(n)||0).toLocaleString('es-CO');
  const box=document.createElement('div');
  box.className='m-scroll';
  box.style.cssText='padding:24px 20px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:16px';
  const estadoTxt = s.estado==='vencida' ? 'Tu suscripción venció' : s.estado==='pendiente' ? 'Tu pago está en revisión' : 'Activa tu cuenta';
  const sub = pendiente
    ? 'Recibimos tu comprobante. El equipo lo verifica y activamos tu cuenta muy pronto — te avisaremos.'
    : 'Para empezar a recibir clientes, activa tu suscripción con un pago mensual. Sube tu comprobante y lo aprobamos.';
  box.innerHTML=`
    <div style="width:80px;height:80px;border-radius:24px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.4)"><img src="${(me.grupo&&me.grupo.marca_logo)||'/icons/logo.png'}" style="width:100%;height:100%;object-fit:cover" alt=""></div>
    <div style="font-family:var(--f-title);font-size:20px;color:var(--gold)">${esc(marcaNombre())}</div>
    <div style="font-size:17px;font-weight:700">${esc(estadoTxt)}</div>
    <div style="font-size:13px;color:var(--text-2);line-height:1.6;max-width:340px">${esc(sub)}</div>
    ${plan?`<div style="background:var(--bg-2);border:1px solid var(--gold-line,rgba(200,164,90,.3));border-radius:16px;padding:18px;width:100%;max-width:340px">
      <div style="font-size:13px;color:var(--text-3)">${esc(plan.nombre)}</div>
      <div style="font-size:26px;font-weight:800;color:var(--gold);margin:4px 0">${money(plan.precio)}<span style="font-size:13px;color:var(--text-3);font-weight:400"> / ${plan.dias_vigencia} días</span></div>
    </div>`:''}
    ${pendiente?`<div style="background:var(--gold-soft,rgba(200,164,90,.1));border-radius:12px;padding:12px 16px;font-size:12px;color:var(--gold);max-width:340px">⏳ Comprobante enviado — en revisión</div>`:`
    <label style="width:100%;max-width:340px;display:flex;flex-direction:column;gap:10px">
      <input type="file" id="gateFile" accept="image/*,application/pdf" style="display:none">
      <button id="gatePick" style="height:52px;border-radius:14px;border:1px dashed var(--gold);background:var(--gold-soft,rgba(200,164,90,.08));color:var(--gold);font-size:14px;font-weight:600;cursor:pointer">📎 Elegir comprobante (foto o PDF)</button>
      <div id="gateFileName" style="font-size:12px;color:var(--text-3)"></div>
      <input id="gateRef" placeholder="Referencia (opcional: Nequi, #transf.)" style="height:46px;border-radius:12px;border:1px solid var(--border);background:var(--bg-3);color:var(--text);padding:0 14px;font-size:14px;font-family:inherit">
      <button id="gateSend" disabled style="height:52px;border-radius:14px;border:none;background:var(--grad-gold);color:#0A0A0A;font-size:15px;font-weight:700;cursor:pointer;opacity:.5">Enviar comprobante</button>
    </label>`}
    <button id="gateLogout" style="margin-top:10px;background:none;border:none;color:var(--text-3);font-size:13px;text-decoration:underline;cursor:pointer">Cerrar sesión</button>
  `;
  home.insertBefore(box, home.querySelector('.m-fab'));
  // Wiring
  $('#gateLogout')?.addEventListener('click', async()=>{ try{ await api('/api/logout',{method:'POST'}); }catch(e){} location.replace('/login.html'); });
  const file=$('#gateFile'), pick=$('#gatePick'), send=$('#gateSend'), name=$('#gateFileName');
  if(pick&&file){
    pick.addEventListener('click', ()=>file.click());
    file.addEventListener('change', ()=>{ if(file.files[0]){ name.textContent=file.files[0].name; send.disabled=false; send.style.opacity='1'; } });
    send.addEventListener('click', async()=>{
      if(!file.files[0]) return;
      send.disabled=true; send.textContent='Enviando…';
      const fd=new FormData(); fd.append('comprobante', file.files[0]); fd.append('referencia', ($('#gateRef')?.value||''));
      try{
        const res=await fetch('/api/red/pago/comprobante',{method:'POST',body:fd,credentials:'include'});
        if(res.ok){ toast('¡Comprobante enviado! Te avisamos al aprobarlo.'); setTimeout(()=>location.reload(), 1400); }
        else { toast('No se pudo enviar. Intenta de nuevo.'); send.disabled=false; send.textContent='Enviar comprobante'; }
      }catch(e){ toast('Error de conexión'); send.disabled=false; send.textContent='Enviar comprobante'; }
    });
  }
  // Escuchar la aprobación en vivo (SSE) sin obligar al asesor a recargar a mano.
  try{ conectarStream && conectarStream(); }catch(e){}
}

})();
