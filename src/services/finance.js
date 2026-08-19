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

// Ojo: Math.max(1, Number(x)||0) NO sirve para exigir este campo — con x=undefined
// da 1 igual (NaN||0 = 0, Math.max(1,0) = 1) y la validación de "obligatorio" nunca
// dispara. Hay que rechazar explícitamente antes de aplicar cualquier default.
function numCuotasValidas(n) {
  return numeroValido(n) && Number(n) >= 1;
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

// --- Ventas ---
// Fuente de verdad de una venta: de acá nacen automáticamente la comisión del asesor
// y el ingreso real de Leons Group (dos filas separadas — comisiones y transacciones),
// más el plan de cuotas si el cliente no pagó de contado. Nunca se capturan a mano por
// separado: así el Resumen jamás confunde el 100% del lote con el 5% que de verdad
// entra a la empresa.
const FORMAS_PAGO = ['contado', 'financiado'];
// Bogotá es UTC-5: 14:00 UTC = 9:00am hora local — hora fija y razonable para el
// recordatorio de cobro (misma convención horaria que ya usa el resto del CRM).
const HORA_RECORDATORIO_UTC = 'T14:00:00.000Z';

// Suma n meses a una fecha 'YYYY-MM-DD' fijando el día al último día del mes destino
// si se desborda (31 ene + 1 mes -> 28/29 feb, no 3 mar).
function sumarMeses(fechaISO, n) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + n, 1));
  const ultimoDia = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, ultimoDia));
  return base.toISOString().slice(0, 10);
}

// Cada cuota trae su propia tarea de recordatorio (store.createTarea) — el barrido de
// vencidas que ya existe la notifica sola, no hace falta un cronjob nuevo.
function generarCuotas(ventaId, montoVenta, numCuotas, fechaVenta, vendedorId, leadId) {
  const n = Math.max(1, Number(numCuotas) || 1);
  const base = Math.floor(montoVenta / n);
  for (let i = 1; i <= n; i++) {
    const monto = i === n ? (montoVenta - base * (n - 1)) : base; // la última se lleva el redondeo
    const fechaVenc = sumarMeses(fechaVenta, i); // primera cuota al mes siguiente de la venta
    store.run(
      `INSERT INTO venta_cuotas (venta_id, numero, monto, fecha_vencimiento) VALUES (?, ?, ?, ?)`,
      [ventaId, i, monto, fechaVenc]
    );
    const cuota = store.one('SELECT id FROM venta_cuotas WHERE id = last_insert_rowid()');
    const tarea = store.createTarea({
      vendedorId,
      leadId: leadId || null,
      texto: `Cobrar cuota ${i}/${n} de la venta #${ventaId} — $${monto.toLocaleString('es-CO')}`,
      venceAt: fechaVenc + HORA_RECORDATORIO_UTC,
    });
    if (tarea && cuota) store.run('UPDATE venta_cuotas SET tarea_id = ? WHERE id = ?', [tarea.id, cuota.id]);
  }
}

// Solo se llama cuando ya se confirmó que ninguna cuota está pagada (ver
// actualizarVenta/eliminarVenta) — si alguna ya se cobró, el plan queda bloqueado.
function borrarCuotasDeVenta(ventaId) {
  const cuotas = store.all('SELECT tarea_id FROM venta_cuotas WHERE venta_id = ?', [ventaId]);
  for (const c of cuotas) {
    if (c.tarea_id) store.run('DELETE FROM tareas WHERE id = ?', [c.tarea_id]);
  }
  store.run('DELETE FROM venta_cuotas WHERE venta_id = ?', [ventaId]);
}

function crearVenta(data = {}) {
  const { vendedorId, leadId, montoVenta, porcentajeAsesor, porcentajeEmpresa, formaPago, numCuotas, fecha, notas } = data;
  if (!vendedorId) return { ok: false, error: 'vendedor_requerido' };
  if (!numeroValido(montoVenta) || Number(montoVenta) <= 0) return { ok: false, error: 'monto_venta_invalido' };
  const fPago = FORMAS_PAGO.includes(formaPago) ? formaPago : 'contado';
  if (fPago === 'financiado' && !numCuotasValidas(numCuotas)) return { ok: false, error: 'num_cuotas_invalido' };
  const nCuotas = fPago === 'financiado' ? Math.floor(Number(numCuotas)) : null;

  const monto = Number(montoVenta);
  const pctAsesor = numeroValido(porcentajeAsesor) ? Number(porcentajeAsesor) : 10;
  const pctEmpresa = numeroValido(porcentajeEmpresa) ? Number(porcentajeEmpresa) : 5;
  const montoComisionAsesor = monto * (pctAsesor / 100);
  const montoIngresoEmpresa = monto * (pctEmpresa / 100);
  const fechaVenta = fecha || new Date().toISOString().slice(0, 10);

  store.run(
    `INSERT INTO ventas (lead_id, vendedor_id, monto_venta, porcentaje_asesor, monto_comision_asesor, porcentaje_empresa, monto_ingreso_empresa, forma_pago, num_cuotas, notas, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [leadId || null, vendedorId, monto, pctAsesor, montoComisionAsesor, pctEmpresa, montoIngresoEmpresa, fPago, nCuotas, notas || '', fechaVenta]
  );
  const ventaId = store.one('SELECT id FROM ventas WHERE id = last_insert_rowid()').id;

  // comisiones.lead_id es NOT NULL: una venta sin lead (venta directa que nunca pasó
  // por el CRM) es válida, pero entonces no genera fila de comisión — solo el ingreso.
  let comisionId = null;
  if (leadId) {
    const rc = crearComision({ vendedorId, leadId, montoVenta: monto, porcentaje: pctAsesor, montoComision: montoComisionAsesor });
    if (rc.ok) comisionId = rc.id;
  }

  const vendedor = store.getVendedorById(vendedorId);
  const lead = leadId ? store.getLeadById(leadId) : null;
  const rt = crearTransaccion({
    tipo: 'ingreso',
    categoria: 'comision_agencia',
    concepto: `Comisión Leons Group (${pctEmpresa}%) — venta a ${lead ? (lead.customer_name || lead.customer_phone) : 'cliente'} (${vendedor ? vendedor.nombre : 'asesor #' + vendedorId})`,
    monto: montoIngresoEmpresa,
    leadId: leadId || null,
    vendedorId,
    fecha: fechaVenta,
  });
  const transaccionId = rt.ok ? rt.id : null;

  store.run('UPDATE ventas SET comision_id = ?, transaccion_id = ? WHERE id = ?', [comisionId, transaccionId, ventaId]);
  if (fPago === 'financiado') generarCuotas(ventaId, monto, nCuotas, fechaVenta, vendedorId, leadId);

  // Gamificación de la Red: la venta CONFIRMADA por el admin (esta función es la única
  // fuente) otorga XP al asesor. Idempotente por ref_id=ventaId — reguardar la misma
  // venta no duplica puntos. Best-effort: nunca tumba el registro de la venta.
  try { require('./niveles').otorgar(vendedorId, 'venta_confirmada', ventaId); }
  catch (e) { console.error('[XP] venta_confirmada:', e.message); }

  log.info('FINANZAS', `Venta #${ventaId}: total $${monto.toLocaleString()}, comisión asesor $${montoComisionAsesor.toLocaleString()}, ingreso Leons $${montoIngresoEmpresa.toLocaleString()}`);
  return { ok: true, id: ventaId, montoComisionAsesor, montoIngresoEmpresa, comisionId, transaccionId };
}

function actualizarVenta(id, data = {}) {
  const actual = store.one('SELECT * FROM ventas WHERE id = ?', [id]);
  if (!actual) return { ok: false, error: 'no_existe' };

  const { montoVenta, porcentajeAsesor, porcentajeEmpresa, formaPago, numCuotas, notas } = data;
  if (montoVenta !== undefined && (!numeroValido(montoVenta) || Number(montoVenta) <= 0)) return { ok: false, error: 'monto_venta_invalido' };
  if (formaPago !== undefined && !FORMAS_PAGO.includes(formaPago)) return { ok: false, error: 'forma_pago_invalida' };
  const nuevaFormaPago = formaPago !== undefined ? formaPago : actual.forma_pago;
  const numCuotasEfectivo = numCuotas !== undefined ? numCuotas : actual.num_cuotas;
  if (nuevaFormaPago === 'financiado' && !numCuotasValidas(numCuotasEfectivo)) return { ok: false, error: 'num_cuotas_invalido' };

  // Tocar el plan de cuotas (forma de pago, número de cuotas, o el monto total cuando
  // ya es financiado) queda bloqueado en cuanto el cliente pagó al menos una cuota —
  // editar el plan a esta altura dejaría el cobro inconsistente con lo ya recibido.
  const cambiaPlan = (formaPago !== undefined && formaPago !== actual.forma_pago)
    || (numCuotas !== undefined && Number(numCuotas) !== actual.num_cuotas)
    || (montoVenta !== undefined && Number(montoVenta) !== actual.monto_venta && actual.forma_pago === 'financiado');
  if (cambiaPlan) {
    const hayPagadas = store.one("SELECT COUNT(*) as n FROM venta_cuotas WHERE venta_id = ? AND estado = 'pagada'", [id]);
    if (hayPagadas && hayPagadas.n > 0) return { ok: false, error: 'cuotas_con_pagos' };
  }

  const nuevoMonto = montoVenta !== undefined ? Number(montoVenta) : actual.monto_venta;
  const nuevoPctAsesor = numeroValido(porcentajeAsesor) ? Number(porcentajeAsesor) : actual.porcentaje_asesor;
  const nuevoPctEmpresa = numeroValido(porcentajeEmpresa) ? Number(porcentajeEmpresa) : actual.porcentaje_empresa;
  const nuevaComisionAsesor = nuevoMonto * (nuevoPctAsesor / 100);
  const nuevoIngresoEmpresa = nuevoMonto * (nuevoPctEmpresa / 100);
  const nuevoNumCuotas = nuevaFormaPago === 'financiado' ? Math.floor(Number(numCuotasEfectivo)) : null;

  store.run(
    `UPDATE ventas SET monto_venta = ?, porcentaje_asesor = ?, monto_comision_asesor = ?, porcentaje_empresa = ?, monto_ingreso_empresa = ?, forma_pago = ?, num_cuotas = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [nuevoMonto, nuevoPctAsesor, nuevaComisionAsesor, nuevoPctEmpresa, nuevoIngresoEmpresa, nuevaFormaPago, nuevoNumCuotas, notas !== undefined ? notas : actual.notas, id]
  );

  if (actual.comision_id) actualizarComision(actual.comision_id, { montoVenta: nuevoMonto, porcentaje: nuevoPctAsesor, montoComision: nuevaComisionAsesor });
  if (actual.transaccion_id) actualizarTransaccion(actual.transaccion_id, { monto: nuevoIngresoEmpresa });

  if (cambiaPlan) {
    borrarCuotasDeVenta(id);
    if (nuevaFormaPago === 'financiado') generarCuotas(id, nuevoMonto, nuevoNumCuotas, actual.fecha, actual.vendedor_id, actual.lead_id);
  }

  return { ok: true };
}

function eliminarVenta(id) {
  const actual = store.one('SELECT * FROM ventas WHERE id = ?', [id]);
  if (!actual) return { ok: false, error: 'no_existe' };
  borrarCuotasDeVenta(id);
  if (actual.comision_id) store.run('DELETE FROM comisiones WHERE id = ?', [actual.comision_id]);
  if (actual.transaccion_id) store.run('DELETE FROM transacciones WHERE id = ?', [actual.transaccion_id]);
  store.run('DELETE FROM ventas WHERE id = ?', [id]);
  return { ok: true };
}

function listarVentas(filtros = {}) {
  let where = [];
  let params = [];
  if (filtros.vendedorId) { where.push('v.vendedor_id = ?'); params.push(filtros.vendedorId); }
  if (filtros.desde) { where.push('v.fecha >= ?'); params.push(filtros.desde); }
  if (filtros.hasta) { where.push('v.fecha <= ?'); params.push(filtros.hasta); }
  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return store.all(
    `SELECT v.*, ve.nombre as vendedor_nombre, l.customer_name as lead_nombre, c.estado as comision_estado
     FROM ventas v
     LEFT JOIN vendedores ve ON v.vendedor_id = ve.id
     LEFT JOIN leads l ON v.lead_id = l.id
     LEFT JOIN comisiones c ON v.comision_id = c.id
     ${whereStr}
     ORDER BY v.created_at DESC
     LIMIT ?`,
    [...params, filtros.limite || 200]
  );
}

function listarCuotasPorVenta(ventaId) {
  return store.all('SELECT * FROM venta_cuotas WHERE venta_id = ? ORDER BY numero ASC', [ventaId]);
}

function marcarCuotaPagada(cuotaId) {
  const cuota = store.one('SELECT * FROM venta_cuotas WHERE id = ?', [cuotaId]);
  if (!cuota) return { ok: false, error: 'no_existe' };
  store.run(`UPDATE venta_cuotas SET estado = 'pagada', fecha_pago = date('now') WHERE id = ?`, [cuotaId]);
  // La tarea de recordatorio ya cumplió su función — se cierra directo por SQL (no vía
  // store.updateTarea, que exige vendedor_id en el WHERE para proteger al endpoint del
  // asesor; acá es el admin cerrando el ciclo de cobro, no el dueño de la tarea).
  if (cuota.tarea_id) store.run('UPDATE tareas SET completada = 1 WHERE id = ?', [cuota.tarea_id]);
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
  crearVenta,
  actualizarVenta,
  eliminarVenta,
  listarVentas,
  listarCuotasPorVenta,
  marcarCuotaPagada,
  obtenerResumen,
};
