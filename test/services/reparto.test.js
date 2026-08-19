// Tests del reparto por cuota entre grupos (Red de externos vs Leons) y del filtro de
// suscripción en getVendedoresActivos. BD aislada por tenant, mismo patrón que store.test.js.
const os = require('os');
const path = require('path');
const fs = require('fs');
const dbAdapter = require('../../src/db/adapter');
const store = require('../../src/db/store');
const reparto = require('../../src/services/reparto');
const { elegirVendedor } = require('../../src/services/zonas');

let tmpDbPath, seq = 0;
function nuevoTenant() {
  seq += 1;
  tmpDbPath = path.join(os.tmpdir(), `sp-test-reparto-${Date.now()}-${seq}.db`);
  return { empresaId: 970000 + seq, dbPath: tmpDbPath };
}
async function conTenant(fn) {
  const ctx = nuevoTenant();
  return dbAdapter.tenantContext.run(ctx, async () => { await store.initDB(); return fn(); });
}
afterEach(() => { try { if (tmpDbPath && fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath); } catch (e) {} });

// Alta de un externo con suscripción ya activa (salta el flujo de pago para el test).
function altaExternoActivo(nombre, tel) {
  const id = store.addVendedor(nombre, tel, 'activo', 2);
  store.crearSuscripcionPendiente(id);
  store.activarSuscripcion(id);
  return id;
}

describe('grupos: seed y sellado', () => {
  it('siembra grupo 1 (Leons, 100%) y grupo 2 (Red, 0%)', async () => {
    await conTenant(() => {
      const g1 = store.getGrupoById(1), g2 = store.getGrupoById(2);
      expect(g1.tipo).toBe('interno');
      expect(g1.cuota_pct).toBe(100);
      expect(g2.tipo).toBe('externo');
      expect(g2.cuota_pct).toBe(0);
    });
  });

  it('con la Red en 0, todo lead nuevo cae en Leons (comportamiento idéntico al de hoy)', async () => {
    await conTenant(() => {
      const leons = store.addVendedor('Leon 1', '573000000001', 'activo', 1);
      altaExternoActivo('Ext 1', '573000000002'); // existe pero cuota Red=0 → no recibe
      const activos = store.getVendedoresActivos();
      let leonsCount = 0;
      for (let i = 0; i < 10; i++) {
        const { grupo } = elegirVendedor(activos, {});
        if (grupo === 1) leonsCount++;
      }
      expect(leonsCount).toBe(10);
      expect(store.getGrupoById(1)).toBeTruthy();
      // el asesor elegido siempre es de Leons
      const { vendedor } = elegirVendedor(activos, {});
      expect(vendedor.id).toBe(leons);
    });
  });
});

describe('reparto por cuota 60/40', () => {
  it('de 100 leads, ~60 a Leons y ~40 a la Red (mayor resto, determinista)', async () => {
    await conTenant(() => {
      store.updateGrupo(1, { cuota_pct: 60 });
      store.updateGrupo(2, { cuota_pct: 40 });
      store.addVendedor('Leon 1', '573000000001', 'activo', 1);
      altaExternoActivo('Ext 1', '573000000002');
      const activos = store.getVendedoresActivos();
      const cuenta = { 1: 0, 2: 0 };
      for (let i = 0; i < 100; i++) {
        const { grupoId } = reparto.elegirGrupo(activos);
        cuenta[grupoId]++;
      }
      expect(cuenta[1]).toBe(60);
      expect(cuenta[2]).toBe(40);
    });
  });

  it('si el grupo que toca no tiene asesores, degrada al otro (no se pierde el lead)', async () => {
    await conTenant(() => {
      store.updateGrupo(1, { cuota_pct: 50 });
      store.updateGrupo(2, { cuota_pct: 50 });
      store.addVendedor('Leon 1', '573000000001', 'activo', 1);
      // Red con cuota 50 pero SIN asesores con suscripción → todos los leads van a Leons
      const activos = store.getVendedoresActivos();
      let leons = 0;
      for (let i = 0; i < 20; i++) {
        const { vendedor, grupo } = elegirVendedor(activos, {});
        expect(vendedor).toBeTruthy();
        if (grupo === 1) leons++;
      }
      expect(leons).toBe(20);
    });
  });
});

describe('suscripción: filtro en getVendedoresActivos', () => {
  it('un externo SIN suscripción vigente no está en el pool; al activarla, entra', async () => {
    await conTenant(() => {
      store.updateGrupo(2, { cuota_pct: 100 });
      const ext = store.addVendedor('Ext 1', '573000000009', 'activo', 2);
      store.crearSuscripcionPendiente(ext);
      // pendiente → fuera del pool
      expect(store.getVendedoresActivos().some(v => v.id === ext)).toBe(false);
      // activar → dentro
      store.activarSuscripcion(ext);
      expect(store.getVendedoresActivos().some(v => v.id === ext)).toBe(true);
      // vencer a mano → fuera de nuevo
      const sub = store.getSuscripcionByVendedor(ext);
      store.run("UPDATE suscripciones SET vence_at = datetime('now','-1 day') WHERE id = ?", [sub.id]);
      expect(store.getVendedoresActivos().some(v => v.id === ext)).toBe(false);
    });
  });

  it('un asesor de Leons nunca pasa por el filtro de suscripción', async () => {
    await conTenant(() => {
      const leon = store.addVendedor('Leon 1', '573000000001', 'activo', 1);
      expect(store.getVendedoresActivos().some(v => v.id === leon)).toBe(true);
    });
  });
});
