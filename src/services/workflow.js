// Motor de automatización IF/THEN
const axios = require('axios');
const store = require('../db/store');
const { getAdapter } = require('../channels');

class WorkflowEngine {
  constructor() {
    this.rules = [];
    this.router = null;
    this.customActions = {};
  }

  init(routerInstance) {
    this.router = routerInstance;
    this.loadRules();
  }

  loadRules() {
    try {
      this.rules = store.getAllWorkflows({ activo: true });
    } catch (e) {
      console.error('WorkflowEngine.loadRules error:', e.message);
      this.rules = [];
    }
  }

  registerAction(type, handler) {
    this.customActions[type] = handler;
  }

  getFieldValue(field, context) {
    const { conversation, customer } = context;
    switch (field) {
      case 'body': return context.message ? context.message.body : '';
      case 'channel': return conversation ? conversation.channel : '';
      case 'customer_name': return customer ? customer.name : '';
      case 'etiqueta': return conversation ? conversation.etiqueta : '';
      case 'status': return conversation ? conversation.status : '';
      case 'priority': return conversation ? conversation.priority : '';
      default: return '';
    }
  }

  evaluateCondition(condition, context) {
    const { field, operator, value } = condition;
    const actual = this.getFieldValue(field, context);
    const actualStr = actual == null ? '' : String(actual);

    switch (operator) {
      case 'contains':
        return actualStr.toLowerCase().includes(String(value).toLowerCase());
      case 'equals':
        return actualStr === String(value);
      case 'not_equals':
        return actualStr !== String(value);
      case 'in':
        return Array.isArray(value) && value.map(String).includes(actualStr);
      case 'regex':
        try { return new RegExp(value, 'i').test(actualStr); } catch (e) { return false; }
      default:
        return false;
    }
  }

  async executeAction(action, context) {
    const { conversation } = context;
    const type = action.type;
    const params = action.params || {};

    try {
      switch (type) {
        case 'tag':
          store.updateConversationTag(conversation.id, params.value);
          break;
        case 'assign':
          if (this.router) await this.router.assignVendedor(conversation.id);
          break;
        case 'send_template': {
          const adapter = getAdapter(conversation.channel);
          if (adapter && adapter.sendTemplate) {
            const customer = store.getCustomerById(conversation.customer_id);
            const channels = store.getCustomerChannels(conversation.customer_id)
              .filter(c => c.channel === conversation.channel);
            const to = channels.length > 0 ? channels[0].channel_user_id : (customer ? customer.phone : null);
            await adapter.sendTemplate(to, params.name, params.params || null);
          }
          break;
        }
        case 'send_message':
          if (this.router) await this.router.routeOutgoing(conversation.id, null, params.text);
          break;
        case 'notify_admin': {
          try {
            const ws = require('../ws');
            if (ws && ws.emitToAdmins) ws.emitToAdmins('notification', { message: params.message, conversationId: conversation.id, ts: Date.now() });
          } catch (e) { /* ws no disponible */ }
          break;
        }
        case 'webhook':
          if (params.url) await axios.post(params.url, { conversation, ...params.payload });
          break;
        default:
          if (this.customActions[type]) await this.customActions[type](action, context);
          break;
      }
      return { ok: true, type };
    } catch (e) {
      return { ok: false, type, error: e.message };
    }
  }

  async evaluate(triggerEvent, context) {
    const matching = this.rules.filter(r => r.trigger_event === triggerEvent);
    if (matching.length === 0) return;

    for (const rule of matching) {
      let conditions = [];
      let actions = [];
      try { conditions = JSON.parse(rule.conditions || '[]'); } catch (e) { conditions = []; }
      try { actions = JSON.parse(rule.actions || '[]'); } catch (e) { actions = []; }

      const cumpleTodas = conditions.every(c => this.evaluateCondition(c, context));
      if (!cumpleTodas) continue;

      const results = [];
      for (const action of actions) {
        const r = await this.executeAction(action, context);
        results.push(r);
      }

      try {
        store.addWorkflowLog(rule.id, context.conversation ? context.conversation.id : null, triggerEvent, { results });
      } catch (e) { /* noop */ }
    }
  }
}

const instance = new WorkflowEngine();
instance.loadRules();

module.exports = instance;
module.exports.WorkflowEngine = WorkflowEngine;
