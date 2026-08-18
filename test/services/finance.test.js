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

// Modelo real del negocio: Leons Group es intermediario, no dueño del lote. De cada
// venta el asesor se lleva 10%, Leons Group 5% (su ingreso real) y el resto (85%) es
// plata del proyecto/oficina que nunca entra al CRM. crearVenta es la fuente de verdad
// que genera esos dos efectos (comisión + ingreso) como filas separadas y trazables.
describe('crearVenta / actualizarVenta / eliminarVenta / cuotas', () => {
  function fixture() {
    const vendedorId = store.addVendedor('Eduardo Parra', '3214617082', 'activo');
    const { leadId } = store.saveLead('3000000000', 'Cliente Test', 'Hola');
    return { vendedorId, leadId };
  }

  it('de contado: aplica 10%/5% por defecto, genera comisión + ingreso ligados, sin cuotas', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const r = finance.crearVenta({ vendedorId, leadId, montoVenta: 100000000 });
      expect(r.ok).toBe(true);
      expect(r.montoComisionAsesor).toBe(10000000); // 10%
      expect(r.montoIngresoEmpresa).toBe(5000000); // 5% — esto es lo que de verdad gana Leons Group

      const venta = store.one('SELECT * FROM ventas WHERE id = ?', [r.id]);
      expect(venta.forma_pago).toBe('contado');
      expect(venta.comision_id).toBe(r.comisionId);
      expect(venta.transaccion_id).toBe(r.transaccionId);

      const comision = store.one('SELECT * FROM comisiones WHERE id = ?', [r.comisionId]);
      expect(comision.monto_comision).toBe(10000000);
      expect(comision.porcentaje).toBe(10);

      // La transacción de ingreso NO es el monto total del lote — es solo el 5%. Esta
      // es la corrección concreta que pidió el dueño del negocio.
      const transaccion = store.one('SELECT * FROM transacciones WHERE id = ?', [r.transaccionId]);
      expect(transaccion.monto).toBe(5000000);
      expect(transaccion.tipo).toBe('ingreso');
      expect(transaccion.categoria).toBe('comision_agencia');

      expect(finance.listarCuotasPorVenta(r.id)).toHaveLength(0);

      // El Resumen ahora refleja el ingreso real de la empresa, no el 100% del lote.
      const resumen = finance.obtenerResumen({});
      expect(resumen.ingresos).toBe(5000000);
    });
  });

  it('permite ajustar los porcentajes por venta en vez de forzar siempre 10/5', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const r = finance.crearVenta({ vendedorId, leadId, montoVenta: 50000000, porcentajeAsesor: 8, porcentajeEmpresa: 6 });
      expect(r.montoComisionAsesor).toBe(4000000);
      expect(r.montoIngresoEmpresa).toBe(3000000);
    });
  });

  it('financiado: genera N cuotas que suman exacto el total, fechas mensuales, y una tarea de cobro por cuota', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const r = finance.crearVenta({ vendedorId, leadId, montoVenta: 10000000, formaPago: 'financiado', numCuotas: 3, fecha: '2026-01-15' });
      expect(r.ok).toBe(true);

      const cuotas = finance.listarCuotasPorVenta(r.id);
      expect(cuotas).toHaveLength(3);
      expect(cuotas.reduce((s, c) => s + c.monto, 0)).toBe(10000000); // sin perder el residuo del redondeo
      expect(cuotas.map(c => c.fecha_vencimiento)).toEqual(['2026-02-15', '2026-03-15', '2026-04-15']);
      expect(cuotas.every(c => c.estado === 'pendiente')).toBe(true);

      const tareas = store.getTareasByVendedor(vendedorId);
      expect(tareas).toHaveLength(3);
      expect(tareas.map(t => t.texto).join(' ')).toMatch(/Cobrar cuota 1\/3/);
    });
  });

  it('rechaza financiado sin número de cuotas', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      expect(finance.crearVenta({ vendedorId, leadId, montoVenta: 1000000, formaPago: 'financiado' }).ok).toBe(false);
    });
  });

  it('sin lead: genera el ingreso de la empresa pero no comisión (comisiones.lead_id es obligatorio)', async () => {
    await conTenant(() => {
      const vendedorId = store.addVendedor('Eduardo Parra', '3214617082', 'activo');
      const r = finance.crearVenta({ vendedorId, montoVenta: 20000000 });
      expect(r.ok).toBe(true);
      expect(r.comisionId).toBeNull();
      expect(r.transaccionId).toEqual(expect.any(Number));
    });
  });

  it('actualizarVenta recalcula comisión e ingreso ligados cuando cambia el monto', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const r = finance.crearVenta({ vendedorId, leadId, montoVenta: 10000000 });
      expect(finance.actualizarVenta(r.id, { montoVenta: 20000000 })).toEqual({ ok: true });

      const comision = store.one('SELECT * FROM comisiones WHERE id = ?', [r.comisionId]);
      expect(comision.monto_comision).toBe(2000000); // 10% de 20M
      const transaccion = store.one('SELECT * FROM transacciones WHERE id = ?', [r.transaccionId]);
      expect(transaccion.monto).toBe(1000000); // 5% de 20M
    });
  });

  it('bloquea cambiar el plan de cuotas en cuanto una cuota ya está pagada', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const r = finance.crearVenta({ vendedorId, leadId, montoVenta: 9000000, formaPago: 'financiado', numCuotas: 3 });
      const cuotas = finance.listarCuotasPorVenta(r.id);
      expect(finance.marcarCuotaPagada(cuotas[0].id)).toEqual({ ok: true });

      const bloqueo = finance.actualizarVenta(r.id, { numCuotas: 6 });
      expect(bloqueo).toEqual({ ok: false, error: 'cuotas_con_pagos' });

      // Pero sí puede seguir editando lo que no toca el plan (p.ej. notas).
      expect(finance.actualizarVenta(r.id, { notas: 'cliente al día' })).toEqual({ ok: true });
    });
  });

  it('sin pagos, regenerar el número de cuotas borra las tareas viejas y crea las nuevas', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const r = finance.crearVenta({ vendedorId, leadId, montoVenta: 9000000, formaPago: 'financiado', numCuotas: 3 });
      expect(store.getTareasByVendedor(vendedorId)).toHaveLength(3);

      expect(finance.actualizarVenta(r.id, { numCuotas: 2 })).toEqual({ ok: true });
      expect(finance.listarCuotasPorVenta(r.id)).toHaveLength(2);
      expect(store.getTareasByVendedor(vendedorId)).toHaveLength(2); // las 3 viejas se borraron, no quedan huérfanas
    });
  });

  it('marcarCuotaPagada pone fecha_pago y completa la tarea de recordatorio', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const r = finance.crearVenta({ vendedorId, leadId, montoVenta: 6000000, formaPago: 'financiado', numCuotas: 2 });
      const cuota = finance.listarCuotasPorVenta(r.id)[0];
      expect(finance.marcarCuotaPagada(cuota.id)).toEqual({ ok: true });

      const fila = store.one('SELECT * FROM venta_cuotas WHERE id = ?', [cuota.id]);
      expect(fila.estado).toBe('pagada');
      expect(fila.fecha_pago).toBeTruthy();
      const tarea = store.one('SELECT * FROM tareas WHERE id = ?', [fila.tarea_id]);
      expect(tarea.completada).toBe(1);

      expect(finance.marcarCuotaPagada(999999)).toEqual({ ok: false, error: 'no_existe' });
    });
  });

  it('eliminarVenta borra en cascada la comisión, la transacción y las cuotas', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const r = finance.crearVenta({ vendedorId, leadId, montoVenta: 9000000, formaPago: 'financiado', numCuotas: 3 });
      expect(finance.eliminarVenta(r.id)).toEqual({ ok: true });

      expect(store.one('SELECT * FROM ventas WHERE id = ?', [r.id])).toBeNull();
      expect(store.one('SELECT * FROM comisiones WHERE id = ?', [r.comisionId])).toBeNull();
      expect(store.one('SELECT * FROM transacciones WHERE id = ?', [r.transaccionId])).toBeNull();
      expect(finance.listarCuotasPorVenta(r.id)).toHaveLength(0);
      expect(store.getTareasByVendedor(vendedorId)).toHaveLength(0);
    });
  });

  it('listarVentas filtra por vendedor', async () => {
    await conTenant(() => {
      const { vendedorId, leadId } = fixture();
      const otroVendedorId = store.addVendedor('Sergio Parra', '3224312518', 'activo');
      finance.crearVenta({ vendedorId, leadId, montoVenta: 1000000 });
      finance.crearVenta({ vendedorId: otroVendedorId, leadId, montoVenta: 2000000 });
      const propias = finance.listarVentas({ vendedorId });
      expect(propias).toHaveLength(1);
      expect(propias[0].vendedor_id).toBe(vendedorId);
    });
  });
});
