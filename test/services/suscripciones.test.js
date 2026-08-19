// Tests del ciclo de suscripción de la Red: activar, renovar (acumula), vencer, y su
// efecto en el pool de reparto (getVendedoresActivos). BD aislada por tenant.
const os = require('os');
const path = require('path');
const fs = require('fs');
const dbAdapter = require('../../src/db/adapter');
const store = require('../../src/db/store');

let tmpDbPath, seq = 0;
function nuevoTenant() { seq++; tmpDbPath = path.join(os.tmpdir(), `sp-test-susc-${Date.now()}-${seq}.db`); return { empresaId: 960000 + seq, dbPath: tmpDbPath }; }
async function conTenant(fn) { const ctx = nuevoTenant(); return dbAdapter.tenantContext.run(ctx, async () => { await store.initDB(); return fn(); }); }
afterEach(() => { try { if (tmpDbPath && fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath); } catch (e) {} });

describe('suscripciones', () => {
  it('un externo nace pendiente y fuera del pool; al aprobar el pago entra', async () => {
    await conTenant(() => {
      store.updateGrupo(2, { cuota_pct: 100 });
      const ext = store.addVendedor('Ext', '573000000021', 'pendiente', 2);
      store.crearSuscripcionPendiente(ext);
      expect(store.getVendedoresActivos().some(v => v.id === ext)).toBe(false);
      // simular pago aprobado
      const pago = store.crearPago(ext, { metodo: 'comprobante' });
      store.aprobarPago(pago.id, 1);
      const vend = store.getVendedorById(ext);
      expect(vend.estado).toBe('activo'); // aprobar reactiva al asesor
      expect(store.getVendedoresActivos().some(v => v.id === ext)).toBe(true);
      const sub = store.getSuscripcionByVendedor(ext);
      expect(sub.estado).toBe('activa');
      expect(sub.vence_at).toBeTruthy();
    });
  });

  it('conserva sus leads al vencer, pero deja de recibir nuevos', async () => {
    await conTenant(() => {
      store.updateGrupo(2, { cuota_pct: 100 });
      const ext = store.addVendedor('Ext', '573000000022', 'activo', 2);
      store.crearSuscripcionPendiente(ext);
      store.activarSuscripcion(ext);
      // asignarle un lead
      const { leadId } = store.saveLead('573111111111', 'Cliente', 'hola');
      store.assignLeadToVendedor(leadId, store.getVendedorById(ext));
      // vencer la suscripción a mano
      const sub = store.getSuscripcionByVendedor(ext);
      store.run("UPDATE suscripciones SET vence_at = datetime('now','-1 day') WHERE id = ?", [sub.id]);
      // fuera del pool
      expect(store.getVendedoresActivos().some(v => v.id === ext)).toBe(false);
      // pero el lead sigue siendo suyo
      const lead = store.getLeadById(leadId);
      expect(Number(lead.assigned_to_id)).toBe(ext);
      expect(Number(lead.grupo_id)).toBe(2); // sellado a la Red
    });
  });

  it('renovar acumula sobre el tiempo restante (no lo pierde)', async () => {
    await conTenant(() => {
      const ext = store.addVendedor('Ext', '573000000023', 'activo', 2);
      store.crearSuscripcionPendiente(ext);
      store.activarSuscripcion(ext, null, 30);
      const v1 = store.getSuscripcionByVendedor(ext).vence_at;
      store.activarSuscripcion(ext, null, 30); // renovar
      const v2 = store.getSuscripcionByVendedor(ext).vence_at;
      expect(Date.parse(v2 + 'Z')).toBeGreaterThan(Date.parse(v1 + 'Z'));
    });
  });
});

describe('XP y niveles', () => {
  const niveles = require('../../src/services/niveles');
  it('XP no baja el peso de un asesor de Leons (grupo 1 siempre pesa 1)', () => {
    expect(niveles.pesoDeVendedor({ grupo_id: 1, xp: 5000 })).toBe(1);
  });
  it('un externo con más XP pesa más en el reparto', () => {
    expect(niveles.pesoDeVendedor({ grupo_id: 2, xp: 0 })).toBe(1.0);
    expect(niveles.pesoDeVendedor({ grupo_id: 2, xp: 3500 })).toBe(2.0);
  });
  it('venta confirmada otorga +100 XP idempotente por venta', async () => {
    await conTenant(() => {
      const ext = store.addVendedor('Ext', '573000000024', 'activo', 2);
      store.addXpEvento(ext, 'venta_confirmada', 100, 77);
      store.addXpEvento(ext, 'venta_confirmada', 100, 77); // misma venta → no duplica
      expect(store.getXpTotal(ext)).toBe(100);
      store.addXpEvento(ext, 'venta_confirmada', 100, 78); // otra venta
      expect(store.getXpTotal(ext)).toBe(200);
    });
  });
});

describe('chat: aislamiento de sala', () => {
  it('un mensaje de la Red no aparece en el canal de Leons y viceversa', async () => {
    await conTenant(() => {
      const leon = store.addVendedor('Leon', '573000000031', 'activo', 1);
      const ext = store.addVendedor('Ext', '573000000032', 'activo', 2);
      store.saveTeamMessage(leon, 'Leon', 'hola leons', { sala: 'leons' });
      store.saveTeamMessage(ext, 'Ext', 'hola red', { sala: 'red' });
      const leons = store.getTeamMessages(null, 50, 'leons');
      const red = store.getTeamMessages(null, 50, 'red');
      expect(leons.some(m => m.body === 'hola leons')).toBe(true);
      expect(leons.some(m => m.body === 'hola red')).toBe(false);
      expect(red.some(m => m.body === 'hola red')).toBe(true);
      expect(red.some(m => m.body === 'hola leons')).toBe(false);
    });
  });
});
