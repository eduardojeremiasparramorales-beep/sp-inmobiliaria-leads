// Tests de src/services/finance.js contra una BD SQLite aislada (mismo patrón que
// test/db/store.test.js) — nunca contra data/sp-leads.db de producción.
// Antes de este archivo el módulo tenía cero cobertura y dos bugs reales en producción:
// lastInsertRowid siempre undefined (adapter.run solo devuelve {changes}) y varias
// rutas devolvían {ok:true} aunque el id no existiera.
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbAdapter = require('../../src/db/adapter');
const store = require('../../src/db/store');
const finance = require('../../src/services/finance');

let tmpDbPath;
let seq = 0;

function nuevoTenant() {
  seq += 1;
  const empresaId = 910000 + seq;
  tmpDbPath = path.join(os.tmpdir(), `sp-test-finance-${Date.now()}-${seq}.db`);
  return { empresaId, dbPath: tmpDbPath };
}

async function conTenant(fn) {
  const ctx = nuevoTenant();
  return dbAdapter.tenantContext.run(ctx, async () => {
    await store.initDB();
    return fn();
  });
}

afterEach(() => {
  try { if (tmpDbPath && fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath); } catch (e) {}
});

describe('crearTransaccion / actualizarTransaccion / eliminarTransaccion', () => {
  it('crea una transacción y devuelve el id real (no undefined)', async () => {
    await conTenant(() => {
      const r = finance.crearTransaccion({ tipo: 'ingreso', concepto: 'Venta lote 14', monto: 5000000 });
      expect(r.ok).toBe(true);
      expect(r.id).toEqual(expect.any(Number));
      const fila = store.one('SELECT * FROM transacciones WHERE id = ?', [r.id]);
      expect(fila.concepto).toBe('Venta lote 14');
      expect(fila.monto).toBe(5000000);
    });
  });

  it('rechaza body inválido con {ok:false} en vez de reventar contra el NOT NULL', async () => {
    await conTenant(() => {
      expect(finance.crearTransaccion({}).ok).toBe(false);
      expect(finance.crearTransaccion({ tipo: 'ingreso' }).ok).toBe(false); // sin concepto
      expect(finance.crearTransaccion({ tipo: 'ingreso', concepto: 'x', monto: 0 }).ok).toBe(false); // monto <= 0
      expect(finance.crearTransaccion({ tipo: 'invalido', concepto: 'x', monto: 10 }).ok).toBe(false);
    });
  });

  it('actualiza solo los campos enviados y conserva el resto', async () => {
    await conTenant(() => {
      const { id } = finance.crearTransaccion({ tipo: 'egreso', concepto: 'Publicidad', monto: 100000, categoria: 'marketing' });
      const r = finance.actualizarTransaccion(id, { monto: 150000 });
      expect(r.ok).toBe(true);
      const fila = store.one('SELECT * FROM transacciones WHERE id = ?', [id]);
      expect(fila.monto).toBe(150000);
      expect(fila.concepto).toBe('Publicidad'); // no se tocó
      expect(fila.categoria).toBe('marketing'); // no se tocó
    });
  });

  it('actualizar/eliminar un id inexistente devuelve {ok:false}, no {ok:true} falso', async () => {
    await conTenant(() => {
      expect(finance.actualizarTransaccion(999999, { monto: 10 })).toEqual({ ok: false, error: 'no_existe' });
      expect(finance.eliminarTransaccion(999999)).toEqual({ ok: false, error: 'no_existe' });
    });
  });

  it('elimina una transacción existente', async () => {
    await conTenant(() => {
      const { id } = finance.crearTransaccion({ tipo: 'ingreso', concepto: 'x', monto: 10 });
      expect(finance.eliminarTransaccion(id)).toEqual({ ok: true });
      expect(store.one('SELECT * FROM transacciones WHERE id = ?', [id])).toBeNull();
    });
  });
});

describe('crearComision / actualizarComision / eliminarComision', () => {
  function fixture() {
    const vendedorId = store.addVendedor('Eduardo Parra', '3214617082', 'activo');
    const { leadId } = store.saveLead('3000000000', 'Cliente Test', 'Hola');
    return { vendedorId, leadId };
  }

  it('calcula monto_comision a partir del porcentaje cuando no se pasa explícito', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const r = finance.crearComision({ vendedorId, leadId, montoVenta: 10000000, porcentaje: 5 });
      expect(r.ok).toBe(true);
      expect(r.id).toEqual(expect.any(Number));
      expect(r.monto).toBe(500000);
      const fila = store.one('SELECT * FROM comisiones WHERE id = ?', [r.id]);
      expect(fila.estado).toBe('pendiente');
    });
  });

  it('respeta un monto_comision manual (override) en vez de recalcularlo', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const r = finance.crearComision({ vendedorId, leadId, montoVenta: 10000000, porcentaje: 5, montoComision: 800000 });
      expect(r.monto).toBe(800000);
    });
  });

  it('exige vendedor, lead y un monto de venta válido', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      expect(finance.crearComision({ leadId, montoVenta: 100 }).ok).toBe(false); // sin vendedor
      expect(finance.crearComision({ vendedorId, montoVenta: 100 }).ok).toBe(false); // sin lead
      expect(finance.crearComision({ vendedorId, leadId, montoVenta: 0 }).ok).toBe(false); // monto inválido
    });
  });

  it('marcarComisionPagada pone fecha_pago y falla limpio si el id no existe', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const { id } = finance.crearComision({ vendedorId, leadId, montoVenta: 1000000 });
      expect(finance.marcarComisionPagada(id)).toEqual({ ok: true });
      const fila = store.one('SELECT * FROM comisiones WHERE id = ?', [id]);
      expect(fila.estado).toBe('pagada');
      expect(fila.fecha_pago).toBeTruthy();
      expect(finance.marcarComisionPagada(999999)).toEqual({ ok: false, error: 'no_existe' });
    });
  });

  it('actualizarComision recalcula el monto si cambia venta o porcentaje', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const { id } = finance.crearComision({ vendedorId, leadId, montoVenta: 10000000, porcentaje: 5 });
      const r = finance.actualizarComision(id, { porcentaje: 10 });
      expect(r.ok).toBe(true);
      const fila = store.one('SELECT * FROM comisiones WHERE id = ?', [id]);
      expect(fila.monto_comision).toBe(1000000); // 10% de 10M
      expect(fila.updated_at).toBeTruthy();
    });
  });

  it('eliminarComision borra de verdad y falla limpio si no existe', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const { id } = finance.crearComision({ vendedorId, leadId, montoVenta: 1000000 });
      expect(finance.eliminarComision(id)).toEqual({ ok: true });
      expect(store.one('SELECT * FROM comisiones WHERE id = ?', [id])).toBeNull();
      expect(finance.eliminarComision(id)).toEqual({ ok: false, error: 'no_existe' });
    });
  });

  it('listarComisiones filtra por vendedor — así funciona /api/mis-comisiones', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const otroVendedorId = store.addVendedor('Sergio Parra', '3224312518', 'activo');
      finance.crearComision({ vendedorId, leadId, montoVenta: 1000000 });
      finance.crearComision({ vendedorId: otroVendedorId, leadId, montoVenta: 2000000 });
      const propias = finance.listarComisiones({ vendedorId });
      expect(propias).toHaveLength(1);
      expect(propias[0].vendedor_id).toBe(vendedorId);
    });
  });
});

describe('obtenerResumen', () => {
  it('no revienta sin datos y agrega ingresos/egresos del período', async () => {
    await conTenant(() => {
      finance.crearTransaccion({ tipo: 'ingreso', concepto: 'Venta', monto: 1000000 });
      finance.crearTransaccion({ tipo: 'egreso', concepto: 'Publicidad', monto: 300000 });
      const r = finance.obtenerResumen({});
      expect(r.ingresos).toBe(1000000);
      expect(r.egresos).toBe(300000);
      expect(r.utilidad).toBe(700000);
    });
  });
});
