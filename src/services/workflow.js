// Motor de automatización — ejecuta el grafo {nodes,edges} que arma el editor visual.
// Compatible con los workflows migrados desde el formato lineal viejo (ver
// store.migrateWorkflowsToGraph): el grafo migrado produce exactamente el mismo
// comportamiento (trigger → condiciones AND → acciones en cadena) que el motor v1.
const axios = require('axios');
const dns = require('dns').promises;
const store = require('../db/store');
const adapter = require('../db/adapter');
const { getAdapter } = require('../channels');

const MAX_NODES_PER_RUN = 20; // corta cualquier ejecución que se salga de control
const LOOP_GUARD_TTL_MS = 60 * 1000; // mismo workflow + misma conversación no re-dispara antes de esto

// ─── Seguridad del nodo webhook (antes: axios.post sin allowlist, sin timeout, sin
// bloqueo de IPs privadas — un admin, o cualquiera con acceso a crear workflows,
// podía mandar datos de conversaciones a cualquier IP, incluida la metadata interna
// de la VM) ──────────────────────────────────────────────────────────────────────
function esIpPrivada(ip) {
  if (!ip) return true;
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1' || ip.toLowerCase().startsWith('fe80') || ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) return true;
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(isNaN)) return ip.includes(':') ? false : true;
  return p[0] === 127 || p[0] === 10 || p[0] === 0
    || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
    || (p[0] === 192 && p[1] === 168)
    || (p[0] === 169 && p[1] === 254)
    || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}

async function isWebhookUrlAllowed(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch (e) { return { ok: false, reason: 'url_invalida' }; }
  if (u.protocol !== 'https:') return { ok: false, reason: 'solo_https' };
  const allowlistRaw = store.getConfig('workflow_webhook_allowlist') || '';
  const allowlist = allowlistRaw.split(',').map(s => s.trim()).filter(Boolean);
  if (allowlist.length && !allowlist.some(domain => u.hostname === domain || u.hostname.endsWith('.' + domain))) {
    return { ok: false, reason: 'dominio_no_permitido' };
  }
  try {
    const addrs = await dns.resolve4(u.hostname).catch(() => dns.resolve6(u.hostname));
    for (const ip of (addrs || [])) {
      if (esIpPrivada(ip)) return { ok: false, reason: 'ip_privada' };
    }
  } catch (e) { /* si no resuelve, axios fallará solo después — no bloquear por esto */ }
  return { ok: true };
}

class WorkflowEngine {
  constructor() {
    // Vid.a: caché de reglas POR EMPRESA — antes era un array único reusado sin
    // importar qué tenant disparó el evento; con más de un negocio, las reglas del
    // último que tocara el CRUD se evaluaban para los mensajes de todos los demás.
    this.rulesByTenant = new Map();
    this.router = null;
    this.customActions = {};
    this._loopGuard = new Map(); // "ruleId:convId" -> timestamp del último disparo
    this._firedToday = new Set(); // "schedule:ruleId:YYYY-MM-DD" — dedupe de triggers diarios
    this._today = null;
  }

  init(routerInstance) {
    this.router = routerInstance;
    this.loadRules();
  }

  currentEmpresaId() {
    const ctx = adapter.tenantContext.getStore();
    return (ctx && ctx.empresaId != null) ? Number(ctx.empresaId) : adapter.DEFAULT_EMPRESA_ID;
  }

  loadRules() {
    const empresaId = this.currentEmpresaId();
    try {
      this.rulesByTenant.set(empresaId, store.getAllWorkflows({ activo: true }));
    } catch (e) {
      console.error('WorkflowEngine.loadRules error:', e.message);
      this.rulesByTenant.set(empresaId, []);
    }
  }

  getRules() {
    const empresaId = this.currentEmpresaId();
    if (!this.rulesByTenant.has(empresaId)) this.loadRules();
    return this.rulesByTenant.get(empresaId) || [];
  }

  registerAction(type, handler) {
    this.customActions[type] = handler;
  }

  // ─── Anti-loop ────────────────────────────────────────────
  recentlyRan(key, ttlMs) {
    const last = this._loopGuard.get(key);
    return !!(last && (Date.now() - last) < (ttlMs || LOOP_GUARD_TTL_MS));
  }
  markRan(key) {
    this._loopGuard.set(key, Date.now());
    if (this._loopGuard.size > 1000) {
      const oldest = this._loopGuard.keys().next().value;
      this._loopGuard.delete(oldest);
    }
  }

  // El motor trabaja sobre `conversation`, pero casi todo el CRM (etapas, notas,
  // tareas, citas, temperatura, cadencia) vive en `leads` — este es el único salto.
  leadDe(context) {
    try {
      if (context && context.lead) return context.lead;
      const conv = context && context.conversation;
      if (conv && conv.lead_id) return store.getLeadById(conv.lead_id);
    } catch (e) { /* sin lead */ }
    return null;
  }

  // ─── Condiciones ──────────────────────────────────────────
  getFieldValue(field, context) {
    const { conversation, customer } = context;
    switch (field) {
      case 'body': return context.message ? context.message.body : '';
      case 'channel': return conversation ? conversation.channel : '';
      case 'customer_name': return customer ? customer.name : '';
      case 'etiqueta': return conversation ? conversation.etiqueta : '';
      case 'status': return conversation ? conversation.status : '';
      case 'priority': return conversation ? conversation.priority : '';
      // Identificador del botón que pulsó el cliente — estable, a diferencia de la
      // etiqueta visible que puede cambiar al editar la plantilla.
      case 'button_payload': return (context.message && context.message.buttonPayload) || '';
      default: break;
    }
    // Campos que viven en el lead legacy (zona, proyecto, temperatura, etc.)
    const CAMPOS_LEAD = {
      zona: 'zona', proyecto: 'proyecto', ciudad: 'ciudad', origen: 'origen',
      presupuesto: 'presupuesto', temperatura: 'temperatura', lead_status: 'status',
      asesor: 'assigned_to_nombre',
    };
    if (CAMPOS_LEAD[field]) {
      const lead = this.leadDe(context);
      return (lead && lead[CAMPOS_LEAD[field]]) || '';
    }
    return '';
  }

  evaluateCondition(condition, context) {
    const { field, operator, value } = condition;
    const actual = this.getFieldValue(field, context);
    const actualStr = actual == null ? '' : String(actual);
    switch (operator) {
      case 'contains': return actualStr.toLowerCase().includes(String(value).toLowerCase());
      case 'equals': return actualStr === String(value);
      case 'not_equals': return actualStr !== String(value);
      case 'in': return Array.isArray(value) && value.map(String).includes(actualStr);
      case 'regex': try { return new RegExp(value, 'i').test(actualStr); } catch (e) { return false; }
      default: return false;
    }
  }

  // ─── Acciones ─────────────────────────────────────────────
  async executeAction(action, context, opts = {}) {
    const { conversation } = context;
    const type = action.type;
    const params = action.params || {};
    if (opts.dry) return { ok: true, type, dry: true };

    try {
      switch (type) {
        case 'tag':
          store.updateConversationTag(conversation.id, params.value);
          break;
        case 'assign':
          if (this.router) await this.router.assignVendedor(conversation.id);
          break;
        case 'send_template': {
          const chAdapter = getAdapter(conversation.channel);
          if (chAdapter && chAdapter.sendTemplate) {
            const customer = store.getCustomerById(conversation.customer_id);
            const channels = store.getCustomerChannels(conversation.customer_id).filter(c => c.channel === conversation.channel);
            const to = channels.length > 0 ? channels[0].channel_user_id : (customer ? customer.phone : null);
            await chAdapter.sendTemplate(to, params.name, params.params || null, conversation.lead_id || null);
          }
          break;
        }
        case 'send_message':
          if (this.router) await this.router.routeOutgoing(conversation.id, null, params.text);
          break;
        case 'notify_admin': {
          try {
            const { notify } = require('./notify');
            await notify({
              vendedorId: 0, tipo: 'workflow', leadId: conversation.lead_id || null, push: true,
              titulo: '⚙️ Automatización', cuerpo: String(params.message || 'Un flujo automatizado se disparó.'),
            });
          } catch (e) { /* notify opcional */ }
          break;
        }
        case 'webhook': {
          if (!params.url) break;
          const allowed = await isWebhookUrlAllowed(params.url);
          if (!allowed.ok) throw new Error(`Webhook bloqueado (${allowed.reason}): ${params.url}`);
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);
          try {
            await axios.post(params.url, { conversation, ...params.payload }, { signal: controller.signal, maxRedirects: 0, timeout: 10000 });
          } finally { clearTimeout(timer); }
          break;
        }
        // ─── Acciones sobre el CRM (no solo mensajería) ────────────────────────
        // Todas trabajan sobre el lead de la conversación; si no hay lead (p.ej. un
        // flujo 'schedule' global), fallan explícitamente en vez de romper el grafo.
        case 'set_etapa': {
          const lead = this.exigirLead(context, type);
          store.setLeadEtiqueta(lead.id, String(params.etiqueta || ''));
          this.avisarPanel(lead, 'etapa_cambiada');
          break;
        }
        case 'crear_tarea': {
          const lead = this.exigirLead(context, type);
          const destino = Number(params.vendedorId) || lead.assigned_to_id;
          if (!destino) throw new Error('El lead no tiene asesor al que asignarle la tarea');
          store.createTarea({
            vendedorId: destino,
            texto: this.interpolar(params.texto || 'Dar seguimiento', lead),
            leadId: lead.id,
            venceAt: this.fechaRelativa(params.enHoras),
          });
          break;
        }
        case 'crear_cita': {
          const lead = this.exigirLead(context, type);
          const destino = Number(params.vendedorId) || lead.assigned_to_id;
          if (!destino) throw new Error('El lead no tiene asesor al que agendarle la cita');
          store.createCita({
            leadId: lead.id, vendedorId: destino,
            titulo: this.interpolar(params.titulo || 'Cita con el cliente', lead),
            fecha: this.fechaRelativa(params.enHoras || 24),
            notas: this.interpolar(params.notas || '', lead),
          });
          break;
        }
        case 'nota_interna': {
          const lead = this.exigirLead(context, type);
          store.addNota(lead.id, 'automatización', this.interpolar(params.texto || '', lead));
          break;
        }
        case 'reasignar': {
          const lead = this.exigirLead(context, type);
          const vendedor = (store.getVendedores() || []).find(v => Number(v.id) === Number(params.vendedorId));
          if (!vendedor) throw new Error('El asesor configurado en la acción ya no existe');
          store.reassignLead(lead.id, vendedor, lead.assigned_to_id);
          this.avisarPanel(lead, 'reasignado', vendedor.id);
          break;
        }
        case 'marcar_temperatura': {
          const lead = this.exigirLead(context, type);
          store.setLeadTemperatura(lead.id, String(params.temperatura || 'caliente'));
          break;
        }
        case 'cerrar_lead': {
          const lead = this.exigirLead(context, type);
          store.updateLeadStatus(lead.id, 'cerrado');
          this.avisarPanel(lead, 'cerrado');
          break;
        }
        case 'reabrir_lead': {
          const lead = this.exigirLead(context, type);
          store.updateLeadStatus(lead.id, 'contactado');
          this.avisarPanel(lead, 'reabierto');
          break;
        }
        case 'posponer': {
          const lead = this.exigirLead(context, type);
          store.setLeadSnooze(lead.id, this.fechaRelativa(params.enHoras || 24));
          break;
        }
        case 'iniciar_cadencia': {
          const lead = this.exigirLead(context, type);
          if (!store.enrollCadencia(lead.id)) throw new Error('No hay pasos de cadencia configurados');
          break;
        }
        case 'detener_cadencia': {
          const lead = this.exigirLead(context, type);
          store.stopCadencia(lead.id);
          break;
        }
        case 'notificar_asesor': {
          const lead = this.exigirLead(context, type);
          const destino = Number(params.vendedorId) || lead.assigned_to_id;
          if (!destino) throw new Error('No hay asesor a quien notificar');
          const { notify } = require('./notify');
          await notify({
            vendedorId: destino, tipo: 'workflow', leadId: lead.id, push: true,
            titulo: '⚙️ ' + (params.titulo || 'Automatización'),
            cuerpo: this.interpolar(params.message || params.texto || 'Revisa este chat.', lead).slice(0, 160),
          });
          break;
        }
        default:
          if (this.customActions[type]) await this.customActions[type](action, context);
          break;
      }
      return { ok: true, type };
    } catch (e) {
      if (type === 'send_template' || type === 'send_message') {
        try {
          const { notify } = require('./notify');
          const destino = conversation && conversation.assigned_to_id ? conversation.assigned_to_id : 0;
          notify({
            vendedorId: destino, tipo: 'fallo_envio', leadId: (conversation && conversation.lead_id) || null, push: true,
            titulo: '⚠️ No se pudo enviar un mensaje automático',
            cuerpo: `Canal ${conversation ? conversation.channel : '?'}: ${e.message}`.slice(0, 160),
          }).catch(() => {});
        } catch (err) { /* notify opcional */ }
      }
      return { ok: false, type, error: e.message };
    }
  }

  // Las acciones de CRM necesitan sí o sí un lead; sin él la acción no tiene sentido
  // y es mejor un error legible en el log del flujo que un fallo silencioso.
  exigirLead(context, tipoAccion) {
    const lead = this.leadDe(context);
    if (!lead) throw new Error(`La acción "${tipoAccion}" necesita un lead y el disparador no trajo ninguno`);
    return lead;
  }

  // Fecha ISO a N horas de ahora, en el formato que usan tareas/citas del store.
  fechaRelativa(horas) {
    const h = Number(horas);
    const ms = Date.now() + (Number.isFinite(h) && h > 0 ? h : 24) * 3600000;
    return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  }

  // Variables simples en los textos de las acciones, con los mismos nombres que ya usa
  // el resto del CRM ({{cliente}}, {{asesor}}, {{proyecto}}).
  interpolar(texto, lead) {
    return String(texto || '')
      .replace(/\{\{\s*cliente\s*\}\}/gi, (lead && lead.customer_name) || 'el cliente')
      .replace(/\{\{\s*telefono\s*\}\}/gi, (lead && lead.customer_phone) || '')
      .replace(/\{\{\s*asesor\s*\}\}/gi, (lead && lead.assigned_to_nombre) || '')
      .replace(/\{\{\s*proyecto\s*\}\}/gi, (lead && lead.proyecto) || '');
  }

  // Refresca los paneles abiertos tras una acción que cambia el estado del lead —
  // si no, el asesor no ve el movimiento hasta que recarga.
  avisarPanel(lead, tipo, vendedorExtraId) {
    try {
      const events = require('./events');
      const data = { leadId: lead.id, tipo, ts: Date.now() };
      if (lead.assigned_to_id) events.emitToVendedor(lead.assigned_to_id, 'lead_actualizado', data);
      if (vendedorExtraId) events.emitToVendedor(vendedorExtraId, 'nuevo_mensaje', data);
      events.emitToAdmins('lead_actualizado', data);
    } catch (e) { /* SSE opcional */ }
  }

  // ─── Duración de un nodo delay: {unit:'minutes'|'hours'|'days', amount:N} ──
  delayToMs(params) {
    const amount = Number(params && params.amount) || 0;
    const unit = (params && params.unit) || 'minutes';
    const mult = { minutes: 60000, hours: 3600000, days: 86400000 }[unit] || 60000;
    return Math.max(amount, 1) * mult;
  }

  // ─── Ejecutor de grafo: desde startNodeId, sigue edges hasta agotar el camino,
  // cortar en un delay, o llegar al tope de nodos. Con opts.dry=true no ejecuta
  // efectos reales (usado por el dry-run del botón "Probar"). ──────────────────
  async runGraph(rule, graph, context, startNodeId, opts = {}) {
    const nodesById = {}; (graph.nodes || []).forEach(n => { nodesById[n.id] = n; });
    const edgesFrom = {};
    (graph.edges || []).forEach(e => { (edgesFrom[e.from] = edgesFrom[e.from] || []).push(e); });

    const trace = [];
    let currentId = startNodeId;
    let steps = 0;

    while (currentId && steps < MAX_NODES_PER_RUN) {
      steps++;
      const node = nodesById[currentId];
      if (!node) break;

      if (node.type === 'trigger') {
        trace.push({ nodeId: currentId, type: 'trigger', subtype: node.subtype, ok: true });
        const next = (edgesFrom[currentId] || [])[0];
        currentId = next ? next.to : null;
        continue;
      }

      if (node.type === 'condition') {
        const logic = node.params && node.params.logic === 'or' ? 'or' : 'and';
        const conds = (node.params && node.params.conditions) || [];
        const result = conds.length === 0 ? true : (logic === 'or'
          ? conds.some(c => this.evaluateCondition(c, context))
          : conds.every(c => this.evaluateCondition(c, context)));
        trace.push({ nodeId: currentId, type: 'condition', ok: true, result, branch: result ? 'true' : 'false' });
        const branch = result ? 'true' : 'false';
        const next = (edgesFrom[currentId] || []).find(e => e.branch === branch);
        currentId = next ? next.to : null;
        continue;
      }

      if (node.type === 'delay') {
        const next = (edgesFrom[currentId] || [])[0];
        if (next && !opts.dry) {
          const ms = this.delayToMs(node.params);
          const runAt = new Date(Date.now() + ms).toISOString().replace('T', ' ').slice(0, 19);
          store.createWorkflowJob(rule.id, next.to, {
            conversationId: context.conversation ? context.conversation.id : null,
          }, runAt);
          trace.push({ nodeId: currentId, type: 'delay', ok: true, scheduledFor: runAt, nextNode: next.to });
        } else {
          trace.push({ nodeId: currentId, type: 'delay', ok: true, dry: !!opts.dry, wouldSchedule: !!next });
        }
        currentId = null; // corta acá — se reanuda por el tick de jobs, o simulado en dry-run
        break;
      }

      if (node.type === 'action') {
        const result = await this.executeAction({ type: node.subtype, params: node.params }, context, opts);
        trace.push({ nodeId: currentId, type: 'action', subtype: node.subtype, ok: result.ok, error: result.error, dry: !!opts.dry });
        const next = (edgesFrom[currentId] || [])[0];
        currentId = next ? next.to : null;
        continue;
      }

      trace.push({ nodeId: currentId, type: node.type, ok: false, error: 'tipo_de_nodo_desconocido' });
      break;
    }

    if (steps >= MAX_NODES_PER_RUN) trace.push({ ok: false, error: `Se alcanzó el máximo de ${MAX_NODES_PER_RUN} nodos por ejecución` });
    return trace;
  }

  parseGraph(rule) {
    if (!rule || !rule.graph) return null;
    try { const g = JSON.parse(rule.graph); return (g && g.nodes && g.nodes.length) ? g : null; }
    catch (e) { return null; }
  }

  // Un flujo con vendedor_id es privado de ese asesor: solo puede correr sobre leads
  // asignados a él. Sin este guard, un asesor podría crear una regla que mueva o
  // notifique chats de todo el equipo — justo lo que sus automatizaciones no deben tocar.
  aplicaAlDueno(rule, context) {
    if (!rule.vendedor_id) return true; // flujo global de la empresa
    const lead = this.leadDe(context);
    const asignado = lead ? lead.assigned_to_id : (context.conversation && context.conversation.assigned_to_id);
    return Number(asignado) === Number(rule.vendedor_id);
  }

  // ─── Evento en vivo (message:incoming, conversation:assigned, etc.) ────────
  async evaluate(triggerEvent, context) {
    const rules = this.getRules().filter(r => r.trigger_event === triggerEvent);
    if (!rules.length) return;

    for (const rule of rules) {
      if (!this.aplicaAlDueno(rule, context)) continue;
      const graph = this.parseGraph(rule);
      if (!graph) continue; // sin grafo válido — nada que correr

      const convId = context.conversation ? context.conversation.id : null;
      const loopKey = `${rule.id}:${convId || 'global'}`;
      if (this.recentlyRan(loopKey)) continue;
      this.markRan(loopKey);

      const triggerNode = graph.nodes.find(n => n.type === 'trigger');
      if (!triggerNode) continue;

      const trace = await this.runGraph(rule, graph, context, triggerNode.id);
      try { store.addWorkflowLog(rule.id, convId, triggerEvent, { trace }); } catch (e) { /* noop */ }
    }
  }

  // ─── Dry-run: mismo motor, sin efectos reales — para el botón "Probar" del editor.
  async dryRun(rule, context) {
    const graph = this.parseGraph(rule);
    if (!graph) return { ok: false, error: 'El flujo no tiene un grafo válido' };
    const triggerNode = graph.nodes.find(n => n.type === 'trigger');
    if (!triggerNode) return { ok: false, error: 'El flujo no tiene nodo de disparador' };
    const trace = await this.runGraph(rule, graph, context, triggerNode.id, { dry: true });
    return { ok: true, trace };
  }

  // ─── Tick periódico (cada 30s, llamado desde el scheduler central) ─────────
  // 1) reanuda los workflow_jobs (delays) que ya vencieron
  // 2) dispara triggers 'schedule' (una vez al día, a la hora configurada)
  // 3) dispara triggers 'lead:inactive' (conversación sin mensajes del cliente hace X horas)
  async tick() {
    await this.processDueJobs();
    this.checkScheduledTriggers();
    await this.checkInactiveTriggers();
  }

  async processDueJobs() {
    let jobs = [];
    try { jobs = store.getDueWorkflowJobs(); } catch (e) { return; }
    for (const job of jobs) {
      store.markWorkflowJobDone(job.id); // primero marcar — si algo falla abajo, no se reprocesa en bucle
      try {
        const rule = store.getWorkflowById(job.workflow_id);
        if (!rule || !rule.activo) continue;
        const graph = this.parseGraph(rule);
        if (!graph) continue;
        let saved = {};
        try { saved = JSON.parse(job.context || '{}'); } catch (e) {}
        const context = {};
        if (saved.conversationId) {
          context.conversation = store.getConversationById(saved.conversationId);
          if (context.conversation && context.conversation.customer_id) {
            context.customer = store.getCustomerById(context.conversation.customer_id);
          }
        }
        const trace = await this.runGraph(rule, graph, context, job.node_id);
        try { store.addWorkflowLog(rule.id, context.conversation ? context.conversation.id : null, 'delay:resume', { trace }); } catch (e) {}
      } catch (e) {
        console.error('[WORKFLOW] processDueJobs error:', e.message);
      }
    }
  }

  checkScheduledTriggers() {
    const today = new Date().toISOString().slice(0, 10);
    if (this._today !== today) { this._today = today; this._firedToday.clear(); }
    const hhmm = new Date().toTimeString().slice(0, 5);

    const rules = this.getRules().filter(r => r.trigger_event === 'schedule');
    for (const rule of rules) {
      const graph = this.parseGraph(rule);
      if (!graph) continue;
      const trigger = graph.nodes.find(n => n.type === 'trigger');
      const at = trigger && trigger.params && trigger.params.at;
      if (!at || at !== hhmm) continue;
      const fireKey = `schedule:${rule.id}:${today}`;
      if (this._firedToday.has(fireKey)) continue;
      this._firedToday.add(fireKey);
      this.runGraph(rule, graph, {}, trigger.id).then(trace => {
        try { store.addWorkflowLog(rule.id, null, 'schedule', { trace }); } catch (e) {}
      });
    }
  }

  async checkInactiveTriggers() {
    const rules = this.getRules().filter(r => r.trigger_event === 'lead:inactive');
    if (!rules.length) return;
    for (const rule of rules) {
      const graph = this.parseGraph(rule);
      if (!graph) continue;
      const trigger = graph.nodes.find(n => n.type === 'trigger');
      const hours = (trigger && trigger.params && Number(trigger.params.hours)) || 24;
      let convs = [];
      try {
        convs = adapter.all(
          `SELECT id, lead_id, customer_id FROM conversations
           WHERE status != 'cerrado' AND last_customer_message_at IS NOT NULL
           AND last_customer_message_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now',?)`,
          [`-${hours} hours`]
        );
      } catch (e) { continue; }
      for (const c of convs) {
        const key = `inactive:${rule.id}:${c.id}`;
        if (this.recentlyRan(key, hours * 3600 * 1000)) continue;
        this.markRan(key);
        const conversation = store.getConversationById(c.id);
        const customer = c.customer_id ? store.getCustomerById(c.customer_id) : null;
        if (!this.aplicaAlDueno(rule, { conversation })) continue; // flujo de asesor: solo sus leads
        this.runGraph(rule, graph, { conversation, customer }, trigger.id).then(trace => {
          try { store.addWorkflowLog(rule.id, c.id, 'lead:inactive', { trace }); } catch (e) {}
        });
      }
    }
  }
}

const instance = new WorkflowEngine();
instance.loadRules();

module.exports = instance;
module.exports.WorkflowEngine = WorkflowEngine;
