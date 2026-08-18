// Centro Financiero Básico
// Trackea ingresos, egresos, comisiones y P&L por proyecto.
// Las tablas `transacciones` y `comisiones` las crea src/db/schema.js (createNewTables)
// al provisionar cada tenant — este módulo no define su propio DDL.

const store = require('../db/store');
const log = require('../utils/logger');

const TIPOS_TRANSACCION = ['ingreso', 'egreso'];
const ESTADOS_COMISION = ['pendiente', 'pagada', 'cancelada'];

function numeroValido(n) {
  return typeof n === 'number' ? Number.isFinite(n) : Number.isFinite(Number(n)) && String(n).trim() !== '';
}

// --- Transacciones ---
function crearTransaccion(data = {}) {
  const { tipo, categoria, concepto, monto, moneda, proyectoId, leadId, vendedorId, fecha, notas } = data;
  if (!TIPOS_TRANSACCION.includes(tipo)) return { ok: false, error: 'tipo_invalido' };
  if (!concepto || !String(concepto).trim()) return { ok: false, error: 'concepto_requerido' };
  if (!numeroValido(monto) || Number(monto) <= 0) return { ok: false, error: 'monto_invalido' };

  store.run(
    `INSERT INTO transacciones (tipo, categoria, concepto, monto, moneda, proyecto_id, lead_id, vendedor_id, fecha, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tipo, categoria || 'venta', String(concepto).trim(), Number(monto), moneda || 'COP', proyectoId || null, leadId || null, vendedorId || null, fecha || new Date().toISOString().slice(0, 10), notas || '']
  );
  const row = store.one('SELECT id FROM transacciones WHERE id = last_insert_rowid()');
  return { ok: true, id: row ? row.id : null };
}

function actualizarTransaccion(id, data = {}) {
  const actual = store.one('SELECT * FROM transacciones WHERE id = ?', [id]);
  if (!actual) return { ok: false, error: 'no_existe' };

  const { tipo, categoria, concepto, monto, moneda, proyectoId, leadId, vendedorId, fecha, notas } = data;
  if (tipo !== undefined && !TIPOS_TRANSACCION.includes(tipo)) return { ok: false, error: 'tipo_invalido' };
  if (concepto !== undefined && !String(concepto).trim()) return { ok: false, error: 'concepto_requerido' };
  if (monto !== undefined && (!numeroValido(monto) || Number(monto) <= 0)) return { ok: false, error: 'monto_invalido' };

  store.run(
    `UPDATE transacciones SET
       tipo = ?, categoria = ?, concepto = ?, monto = ?, moneda = ?,
       proyecto_id = ?, lead_id = ?, vendedor_id = ?, fecha = ?, notas = ?
     WHERE id = ?`,
    [
      tipo !== undefined ? tipo : actual.tipo,
      categoria !== undefined ? categoria : actual.categoria,
      concepto !== undefined ? String(concepto).trim() : actual.concepto,
      monto !== undefined ? Number(monto) : actual.monto,
      moneda !== undefined ? moneda : actual.moneda,
      proyectoId !== undefined ? (proyectoId || null) : actual.proyecto_id,
      leadId !== undefined ? (leadId || null) : actual.lead_id,
      vendedorId !== undefined ? (vendedorId || null) : actual.vendedor_id,
      fecha !== undefined ? fecha : actual.fecha,
      notas !== undefined ? notas : actual.notas,
      id,
    ]
  );
  return { ok: true };
}

function listarTransacciones(filtros = {}) {
  let where = [];
  let params = [];
  if (filtros.tipo) { where.push('tipo = ?'); params.push(filtros.tipo); }
  if (filtros.categoria) { where.push('categoria = ?'); params.push(filtros.categoria); }
  if (filtros.proyectoId) { where.push('proyecto_id = ?'); params.push(filtros.proyectoId); }
  if (filtros.vendedorId) { where.push('vendedor_id = ?'); params.push(filtros.vendedorId); }
  if (filtros.desde) { where.push('fecha >= ?'); params.push(filtros.desde); }
  if (filtros.hasta) { where.push('fecha <= ?'); params.push(filtros.hasta); }
  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return store.all(
    `SELECT t.*, p.nombre as proyecto_nombre, v.nombre as vendedor_nombre
     FROM transacciones t
     LEFT JOIN proyectos p ON t.proyecto_id = p.id
     LEFT JOIN vendedores v ON t.vendedor_id = v.id
     ${whereStr}
     ORDER BY t.fecha DESC, t.created_at DESC
     LIMIT ?`,
    [...params, filtros.limite || 200]
  );
}

function eliminarTransaccion(id) {
  const r = store.run(`DELETE FROM transacciones WHERE id = ?`, [id]);
  if (!r || !r.changes) return { ok: false, error: 'no_existe' };
  return { ok: true };
}

// --- Comisiones ---
// Crea una comisión: si no se pasa montoComision explícito, se calcula como
// montoVenta * porcentaje/100. Pasar montoComision permite un override manual
// (ej. comisión pactada aparte del % estándar).
function crearComision(data = {}) {
  const { vendedorId, leadId, montoVenta, porcentaje, montoComision, estado, notas } = data;
  if (!vendedorId || !leadId) return { ok: false, error: 'vendedor_y_lead_requeridos' };
  if (!numeroValido(montoVenta) || Number(montoVenta) <= 0) return { ok: false, error: 'monto_venta_invalido' };
  const pct = numeroValido(porcentaje) ? Number(porcentaje) : 5;
  const monto = numeroValido(montoComision) ? Number(montoComision) : Number(montoVenta) * (pct / 100);
  const est = ESTADOS_COMISION.includes(estado) ? estado : 'pendiente';

  store.run(
    `INSERT INTO comisiones (vendedor_id, lead_id, monto_venta, porcentaje, monto_comision, estado, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [vendedorId, leadId, Number(montoVenta), pct, monto, est, notas || '']
  );
  const row = store.one('SELECT id FROM comisiones WHERE id = last_insert_rowid()');
  log.info('FINANZAS', `Comisión creada: $${monto.toLocaleString()} para vendedor ${vendedorId}`);
  return { ok: true, id: row ? row.id : null, monto };
}

function actualizarComision(id, data = {}) {
  const actual = store.one('SELECT * FROM comisiones WHERE id = ?', [id]);
  if (!actual) return { ok: false, error: 'no_existe' };

  const { montoVenta, porcentaje, montoComision, estado, notas } = data;
  if (montoVenta !== undefined && (!numeroValido(montoVenta) || Number(montoVenta) <= 0)) return { ok: false, error: 'monto_venta_invalido' };
  if (estado !== undefined && !ESTADOS_COMISION.includes(estado)) return { ok: false, error: 'estado_invalido' };

  const nuevoMontoVenta = montoVenta !== undefined ? Number(montoVenta) : actual.monto_venta;
  const nuevoPorcentaje = numeroValido(porcentaje) ? Number(porcentaje) : actual.porcentaje;
  // Si mandan un monto_comision explícito se respeta (override manual); si no,
  // y cambió venta o porcentaje, se recalcula; si no cambió nada, se deja como estaba.
  let nuevoMontoComision = actual.monto_comision;
  if (numeroValido(montoComision)) nuevoMontoComision = Number(montoComision);
  else if (montoVenta !== undefined || porcentaje !== undefined) nuevoMontoComision = nuevoMontoVenta * (nuevoPorcentaje / 100);

  const nuevoEstado = estado !== undefined ? estado : actual.estado;
  const nuevaFechaPago = nuevoEstado === 'pagada' ? (actual.fecha_pago || new Date().toISOString().slice(0, 10)) : (nuevoEstado === actual.estado ? actual.fecha_pago : null);

  store.run(
    `UPDATE comisiones SET monto_venta = ?, porcentaje = ?, monto_comision = ?, estado = ?, fecha_pago = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [nuevoMontoVenta, nuevoPorcentaje, nuevoMontoComision, nuevoEstado, nuevaFechaPago, notas !== undefined ? notas : actual.notas, id]
  );
  return { ok: true };
}

function eliminarComision(id) {
  const r = store.run(`DELETE FROM comisiones WHERE id = ?`, [id]);
  if (!r || !r.changes) return { ok: false, error: 'no_existe' };
  return { ok: true };
}

function listarComisiones(filtros = {}) {
  let where = [];
  let params = [];
  if (filtros.vendedorId) { where.push('c.vendedor_id = ?'); params.push(filtros.vendedorId); }
  if (filtros.estado) { where.push('c.estado = ?'); params.push(filtros.estado); }
  if (filtros.desde) { where.push('c.fecha_calculo >= ?'); params.push(filtros.desde); }
  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return store.all(
    `SELECT c.*, v.nombre as vendedor_nombre, l.customer_name as lead_nombre
     FROM comisiones c
     LEFT JOIN vendedores v ON c.vendedor_id = v.id
     LEFT JOIN leads l ON c.lead_id = l.id
     ${whereStr}
     ORDER BY c.created_at DESC
     LIMIT ?`,
    [...params, filtros.limite || 200]
  );
}

function marcarComisionPagada(id) {
  const r = store.run(`UPDATE comisiones SET estado = 'pagada', fecha_pago = date('now'), updated_at = datetime('now') WHERE id = ?`, [id]);
  if (!r || !r.changes) return { ok: false, error: 'no_existe' };
  return { ok: true };
}

// --- Dashboard Financiero ---
function obtenerResumen(filtros = {}) {
  const desde = filtros.desde || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const hasta = filtros.hasta || new Date().toISOString().slice(0, 10);

  const ingresos = store.one(
    `SELECT COALESCE(SUM(monto), 0) as total FROM transacciones WHERE tipo = 'ingreso' AND fecha BETWEEN ? AND ?`,
    [desde, hasta]
  );
  const egresos = store.one(
    `SELECT COALESCE(SUM(monto), 0) as total FROM transacciones WHERE tipo = 'egreso' AND fecha BETWEEN ? AND ?`,
    [desde, hasta]
  );
  const comisionesPendientes = store.one(
    `SELECT COALESCE(SUM(monto_comision), 0) as total FROM comisiones WHERE estado = 'pendiente'`
  );
  const comisionesPagadas = store.one(
    `SELECT COALESCE(SUM(monto_comision), 0) as total FROM comisiones WHERE estado = 'pagada' AND fecha_pago BETWEEN ? AND ?`,
    [desde, hasta]
  );

  // Ingresos por proyecto
  const porProyecto = store.all(
    `SELECT p.nombre, SUM(t.monto) as total
     FROM transacciones t
     LEFT JOIN proyectos p ON t.proyecto_id = p.id
     WHERE t.tipo = 'ingreso' AND t.fecha BETWEEN ? AND ?
     GROUP BY t.proyecto_id
     ORDER BY total DESC`,
    [desde, hasta]
  );

  // Ingresos vs egresos por mes (últimos 6 meses)
  const tendencia = store.all(
    `SELECT strftime('%Y-%m', fecha) as mes,
            SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) as ingresos,
            SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END) as egresos
     FROM transacciones
     WHERE fecha >= date('now', '-6 months')
     GROUP BY mes
     ORDER BY mes`
  );

  // Top vendedores por venta
  const topVendedores = store.all(
    `SELECT v.nombre, COUNT(*) as ventas, SUM(t.monto) as monto_total
     FROM transacciones t
     LEFT JOIN vendedores v ON t.vendedor_id = v.id
     WHERE t.tipo = 'ingreso' AND t.categoria = 'venta' AND t.fecha BETWEEN ? AND ?
     GROUP BY t.vendedor_id
     ORDER BY monto_total DESC
     LIMIT 5`,
    [desde, hasta]
  );

  return {
    periodo: { desde, hasta },
    ingresos: ingresos.total,
    egresos: egresos.total,
    utilidad: ingresos.total - egresos.total,
    margen: ingresos.total > 0 ? (((ingresos.total - egresos.total) / ingresos.total) * 100).toFixed(1) : '0',
    comisionesPendientes: comisionesPendientes.total,
    comisionesPagadas: comisionesPagadas.total,
    porProyecto,
    tendencia,
    topVendedores,
  };
}

module.exports = {
  crearTransaccion,
  actualizarTransaccion,
  listarTransacciones,
  eliminarTransaccion,
  crearComision,
  actualizarComision,
  eliminarComision,
  listarComisiones,
  marcarComisionPagada,
  obtenerResumen,
};
