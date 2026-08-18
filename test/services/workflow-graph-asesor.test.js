// El editor móvil de "Mis automatizaciones" (public/m/app.js, _autoConstruirGrafo)
// antes solo podía armar UNA condición fija ("el mensaje contiene X") y UNA acción —
// se rediseñó para admitir varias condiciones (AND), un retardo opcional y varias
// acciones en secuencia. Este archivo no puede importar app.js (es un script de
// navegador, no un módulo CommonJS), así que valida el CONTRATO: que la forma exacta
// de grafo {nodes,edges} que ese editor arma es la misma que el motor real
// (WorkflowEngine.runGraph) sabe recorrer correctamente.
const { WorkflowEngine } = require('../../src/services/workflow');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dbAdapter = require('../../src/db/adapter');
const store = require('../../src/db/store');

// Espejo exacto de _autoConstruirGrafo en public/m/app.js — misma forma de nodos/edges.
function construirGrafo({ trigger, condiciones, delay, acciones }) {
  const nodes = [];
  const pasos = [];
  if (condiciones && condiciones.length) {
    pasos.push({ id: 'n_cond', type: 'condition', params: { logic: 'and', conditions: condiciones } });
  }
  if (delay && Number(delay.amount) > 0) {
    pasos.push({ id: 'n_delay', type: 'delay', params: { amount: Number(delay.amount), unit: delay.unit || 'minutes' } });
  }
  (acciones || []).forEach((a, i) => pasos.push({ id: 'n_accion_' + i, type: 'action', subtype: a.tipo, params: a.params || {} }));

  nodes.push({ id: 'n_trigger', type: 'trigger', subtype: trigger, params: {}, x: 60, y: 60 });
  const edges = [];
  let previo = 'n_trigger';
  let y = 180;
  pasos.forEach((paso, i) => {
    nodes.push({ ...paso, x: 60, y });
    const previoEsCondicion = i > 0 && pasos[i - 1].type === 'condition';
    edges.push({ from: previo, to: paso.id, ...(previoEsCondicion ? { branch: 'true' } : {}) });
    previo = paso.id;
    y += 120;
  });
  return { nodes, edges };
}

const ctxBase = { conversation: { id: 1, channel: 'whatsapp' }, customer: { name: 'Cliente' }, message: { body: 'hola, precio del lote?' } };
const rule = { id: 99 };

describe('grafo del editor móvil — condición simple', () => {
  it('la acción corre si la condición se cumple', async () => {
    const motor = new WorkflowEngine();
    let corrio = false;
    motor.registerAction('marcador', async () => { corrio = true; });
    const graph = construirGrafo({
      trigger: 'message:incoming',
      condiciones: [{ field: 'body', operator: 'contains', value: 'precio' }],
      delay: null,
      acciones: [{ tipo: 'marcador', params: {} }],
    });
    await motor.runGraph(rule, graph, ctxBase, 'n_trigger');
    expect(corrio).toBe(true);
  });

  it('la acción NO corre si la condición no se cumple', async () => {
    const motor = new WorkflowEngine();
    let corrio = false;
    motor.registerAction('marcador', async () => { corrio = true; });
    const graph = construirGrafo({
      trigger: 'message:incoming',
      condiciones: [{ field: 'body', operator: 'contains', value: 'financiación' }],
      delay: null,
      acciones: [{ tipo: 'marcador', params: {} }],
    });
    const trace = await motor.runGraph(rule, graph, ctxBase, 'n_trigger');
    expect(corrio).toBe(false);
    expect(trace.find(t => t.type === 'condition').branch).toBe('false');
  });
});

describe('grafo del editor móvil — varias condiciones (AND)', () => {
  it('exige TODAS las condiciones, no basta con una', async () => {
    const motor = new WorkflowEngine();
    let corrio = false;
    motor.registerAction('marcador', async () => { corrio = true; });
    const graph = construirGrafo({
      trigger: 'message:incoming',
      condiciones: [
        { field: 'body', operator: 'contains', value: 'precio' },
        { field: 'channel', operator: 'equals', value: 'instagram' }, // ctxBase es whatsapp → falla
      ],
      delay: null,
      acciones: [{ tipo: 'marcador', params: {} }],
    });
    await motor.runGraph(rule, graph, ctxBase, 'n_trigger');
    expect(corrio).toBe(false);
  });

  it('corre cuando las dos condiciones se cumplen', async () => {
    const motor = new WorkflowEngine();
    let corrio = false;
    motor.registerAction('marcador', async () => { corrio = true; });
    const graph = construirGrafo({
      trigger: 'message:incoming',
      condiciones: [
        { field: 'body', operator: 'contains', value: 'precio' },
        { field: 'channel', operator: 'equals', value: 'whatsapp' },
      ],
      delay: null,
      acciones: [{ tipo: 'marcador', params: {} }],
    });
    await motor.runGraph(rule, graph, ctxBase, 'n_trigger');
    expect(corrio).toBe(true);
  });
});

describe('grafo del editor móvil — varias acciones en secuencia', () => {
  it('ejecuta las 3 acciones en orden (antes el editor solo permitía 1)', async () => {
    const motor = new WorkflowEngine();
    const orden = [];
    motor.registerAction('paso1', async () => { orden.push(1); });
    motor.registerAction('paso2', async () => { orden.push(2); });
    motor.registerAction('paso3', async () => { orden.push(3); });
    const graph = construirGrafo({
      trigger: 'message:incoming',
      condiciones: [],
      delay: null,
      acciones: [{ tipo: 'paso1', params: {} }, { tipo: 'paso2', params: {} }, { tipo: 'paso3', params: {} }],
    });
    await motor.runGraph(rule, graph, ctxBase, 'n_trigger');
    expect(orden).toEqual([1, 2, 3]);
  });
});

describe('grafo del editor móvil — retardo opcional', () => {
  let tmpDbPath;
  function nuevoTenant() {
    const empresaId = 940000 + Math.floor(Math.random() * 100000);
    tmpDbPath = path.join(os.tmpdir(), `sp-test-wf-graph-${Date.now()}-${empresaId}.db`);
    return { empresaId, dbPath: tmpDbPath };
  }
  async function conTenant(fn) {
    const ctx = nuevoTenant();
    return dbAdapter.tenantContext.run(ctx, async () => { await store.initDB(); return fn(); });
  }
  afterEach(() => { try { if (tmpDbPath && fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath); } catch (e) {} });

  it('condición → espera → acción: agenda un job y NO corre la acción de inmediato', async () => {
    await conTenant(async () => {
      const motor = new WorkflowEngine();
      let corrioDeInmediato = false;
      motor.registerAction('marcador', async () => { corrioDeInmediato = true; });
      const graph = construirGrafo({
        trigger: 'message:incoming',
        condiciones: [{ field: 'body', operator: 'contains', value: 'precio' }],
        delay: { amount: 30, unit: 'minutes' },
        acciones: [{ tipo: 'marcador', params: {} }],
      });
      const wf = store.createWorkflow({ nombre: 'Test delay', trigger_event: 'message:incoming', graph, vendedorId: 1 });
      const trace = await motor.runGraph(wf, graph, ctxBase, 'n_trigger');

      expect(corrioDeInmediato).toBe(false);
      const delayStep = trace.find(t => t.type === 'delay');
      expect(delayStep.ok).toBe(true);
      expect(delayStep.nextNode).toBe('n_accion_0');

      const jobs = store.all('SELECT * FROM workflow_jobs WHERE workflow_id = ?', [wf.id]);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].node_id).toBe('n_accion_0');
    });
  });
});

describe('createWorkflow / updateWorkflow — ya no escriben conditions/actions', () => {
  let tmpDbPath;
  function nuevoTenant() {
    const empresaId = 950000 + Math.floor(Math.random() * 100000);
    tmpDbPath = path.join(os.tmpdir(), `sp-test-wf-nozombie-${Date.now()}-${empresaId}.db`);
    return { empresaId, dbPath: tmpDbPath };
  }
  async function conTenant(fn) {
    const ctx = nuevoTenant();
    return dbAdapter.tenantContext.run(ctx, async () => { await store.initDB(); return fn(); });
  }
  afterEach(() => { try { if (tmpDbPath && fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath); } catch (e) {} });

  it('createWorkflow guarda el graph y deja conditions/actions en su default, no los pisa con basura nueva', async () => {
    await conTenant(() => {
      const graph = construirGrafo({ trigger: 'message:incoming', condiciones: [], delay: null, acciones: [{ tipo: 'marcador', params: {} }] });
      const wf = store.createWorkflow({ nombre: 'Sin columnas zombis', trigger_event: 'message:incoming', graph, vendedorId: 1 });
      expect(JSON.parse(wf.graph)).toEqual(graph);
      expect(wf.conditions).toBe('[]');
      expect(wf.actions).toBe('[]');
    });
  });
});
