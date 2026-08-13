/**
 * Vendedores — Rutas REST
 * CRUD, registro público (auto-registro pendiente de aprobación), PIN, teléfono,
 * rol, estado, perfil público, eliminación.
 *
 * IMPORTANTE: este router NO va montado con auth.requireAuth a nivel base — POST
 * /registro es deliberadamente público (un asesor se auto-registra desde /login.html
 * sin sesión previa, solo protegido por rate limit). Cada ruta declara su propio nivel
 * de auth individualmente, igual que en el bloque original de index.js.
 *
 * NO incluye POST /api/vendedores/:id/zonas — esa ruta sigue en index.js, ligada al
 * feature de zonas geográficas (services/zonas.js) que vive en otra rama de trabajo.
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const store = require('../db/store');
const auth = require('../services/auth');
const events = require('../services/events');
const logger = require('../services/logger');
const { validarTelefono } = require('../utils/validar-telefono');

const registroLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'demasiados_intentos_intenta_mas_tarde' } });

router.get('/', auth.requireAuth, (req, res) => res.json(store.getVendedores()));

router.get('/:id', auth.requireAdmin, (req, res) => {
  const v = store.getVendedorById(req.params.id);
  if (!v) return res.status(404).json({ error: 'no_encontrado' });
  const u = store.getUsuarioByVendedorId(v.id);
  res.json({
    id: v.id, nombre: v.nombre, telefono: v.telefono, estado: v.estado,
    tienePin: !!v.pin, usuarioId: u ? u.id : null, usuarioEmail: u ? u.email : null,
  });
});

router.post('/', auth.requireAdmin, (req, res) => {
  const { nombre, telefono, pin } = req.body;
  if (!nombre || !telefono) return res.status(400).json({ error: 'nombre y telefono requeridos' });
  if (!validarTelefono(telefono)) return res.status(400).json({ error: 'formato_telefono_invalido_debe_ser_57' });
  const vendedorId = store.addVendedor(nombre.trim(), telefono.replace(/[\s-]/g, ''));
  if (pin && String(pin).length === 4 && /^\d{4}$/.test(String(pin))) {
    store.setVendedorPin(vendedorId, auth.hashPassword(String(pin)));
  }
  res.json({ ok: true, vendedorId });
});

// Registro público: un asesor o supervisor se auto-registra desde /login.html sin
// admin de por medio. Queda en estado 'pendiente' (bloqueado en login) hasta que un
// admin lo apruebe en Equipo → Pendientes. El campo `rol` optativo distingue
// 'asesor' (default, sin fila en usuarios) de 'supervisor' (crea una fila en
// usuarios.rol='supervisor' vinculada al vendedor — es la marca que después el login
// respeta para no colapsarlo a 'vendedor'). Sin cédula/fecha de nacimiento — la
// biometría se configura después, en el dispositivo.
router.post('/registro', registroLimiter, (req, res) => {
  const { nombre, telefono, pin, foto, rol } = req.body || {};
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'nombre_requerido' });
  if (!telefono || !validarTelefono(telefono)) return res.status(400).json({ error: 'formato_telefono_invalido_debe_ser_57' });
  if (!pin || !/^\d{4}$/.test(String(pin)) || String(pin) === '0000') return res.status(400).json({ error: 'pin_invalido' });
  // El rol del registro es acotado: solo 'asesor' (default histórico) o 'supervisor'.
  // Cualquier otro valor (incluido 'admin') se rechaza — el admin nunca se auto-crea.
  const rolRegistro = String(rol || 'asesor').toLowerCase();
  if (!['asesor', 'supervisor', 'jefe'].includes(rolRegistro)) return res.status(400).json({ error: 'rol_invalido' });
  const tel = String(telefono).replace(/[\s-]/g, '');
  if (store.getVendedorByTelefono(tel)) return res.status(409).json({ error: 'telefono_ya_registrado' });
  if (foto && String(foto).length > 3 * 1024 * 1024) return res.status(400).json({ error: 'foto_demasiado_grande' });
  const vendedorId = store.addVendedor(String(nombre).trim(), tel, 'pendiente');
  store.setVendedorPin(vendedorId, auth.hashPassword(String(pin)));
  if (foto && /^data:image\//.test(String(foto))) store.setVendedorFoto(vendedorId, String(foto));
  // Supervisor: crear la fila en usuarios para que el login respete el rol.
  // El email queda vacío (el supervisor se autentica por teléfono+PIN, no por email);
  // el password queda null (no se usa en la rama teléfono+PIN). El vínculo
  // vendedor_id es lo que hace que getUsuarioByVendedorId() lo encuentre en el login.
  if (rolRegistro === 'supervisor') {
    const emailSupervisor = `supervisor+${vendedorId}@spinmobiliaria.com`;
    store.createUsuario(emailSupervisor, null, String(nombre).trim(), 'supervisor', vendedorId);
  } else if (rolRegistro === 'jefe') {
    const emailJefe = `jefe+${vendedorId}@spinmobiliaria.com`;
    store.createUsuario(emailJefe, null, String(nombre).trim(), 'jefe', vendedorId);
  }
  const label = rolRegistro === 'supervisor' ? 'supervisor' : rolRegistro === 'jefe' ? 'jefe' : 'asesor';
  console.log(`[REGISTRO] Nuevo ${label} pendiente de aprobación: ${nombre} (${tel})`);
  events.emitToAdmins('vendedor_pendiente', { vendedorId, nombre: String(nombre).trim(), rol: rolRegistro, ts: Date.now() });
  try {
    require('../services/activity').logAsesorConectado({
      vendedorId, nombre: String(nombre).trim(), rol: rolRegistro,
    });
  } catch (e) { /* feed opcional */ }
  res.json({ ok: true, vendedorId, estado: 'pendiente', rol: rolRegistro });
});

router.post('/:id/pin', auth.requireAdmin, (req, res) => {
  const { pin } = req.body || {};
  if (!pin || !/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'PIN debe ser 4 dígitos' });
  store.setVendedorPin(req.params.id, auth.hashPassword(String(pin)));
  res.json({ ok: true });
});

router.post('/:id/telefono', auth.requireAdmin, (req, res) => {
  const { telefono } = req.body || {};
  if (!telefono) return res.status(400).json({ error: 'telefono_requerido' });
  let t = String(telefono).replace(/[\s-]/g, '');
  if (t.startsWith('57') && !t.startsWith('+')) t = '+' + t;
  if (!/^\+57\d{10}$/.test(t)) return res.status(400).json({ error: 'formato_invalido_debe_ser_57_10_digitos' });
  store.setVendedorTelefono(req.params.id, t);
  res.json({ ok: true, telefono: t });
});

router.post('/:id/rol', auth.requireAdmin, (req, res) => {
  const { rol } = req.body || {};
  const rolesValidos = ['vendedor', 'supervisor', 'jefe'];
  if (!rolesValidos.includes(String(rol))) return res.status(400).json({ error: 'rol_invalido' });
  const v = store.getVendedorById(req.params.id);
  if (!v) return res.status(404).json({ error: 'vendedor_no_existe' });
  const usuario = store.getUsuarioByVendedorId(v.id);
  if (usuario && usuario.rol === 'admin') return res.status(400).json({ error: 'no_se_puede_cambiar_el_rol_de_un_admin' });
  const rolFinal = String(rol);
  if (rolFinal === 'vendedor') {
    // Degradar: sin rol especial → el login lo trata como vendedor puro.
    if (usuario) store.updateUsuarioRol(usuario.id, 'vendedor');
  } else {
    if (usuario) {
      store.updateUsuarioRol(usuario.id, rolFinal);
    } else {
      // Vendedor sin fila en usuarios (solo teléfono+PIN): crear la fila marcando el rol.
      const email = `${rolFinal}+${v.id}@spinmobiliaria.com`;
      store.createUsuario(email, null, v.nombre, rolFinal, v.id);
    }
  }
  console.log(`[ADMIN] ${req.session.nombre} cambió el rol de ${v.nombre} a ${rolFinal}`);
  res.json({ ok: true, rol: rolFinal, vendedorId: Number(v.id) });
});

router.post('/:id/estado', auth.requireAuth, (req, res) => {
  const { estado } = req.body;
  const estadosValidos = ['activo', 'ocupado', 'inactivo', 'vacaciones', 'suspendido'];
  if (!estadosValidos.includes(estado)) return res.status(400).json({ error: 'estado invalido' });
  // Un vendedor solo puede cambiar su propio estado; el admin, el de cualquiera
  if (req.session.rol !== 'admin' && Number(req.params.id) !== Number(req.session.vendedorId)) {
    return res.status(403).json({ error: 'sin_permiso' });
  }
  store.setVendedorEstado(req.params.id, estado);
  res.json({ ok: true });
});

// Perfil público interno de un asesor (para compañeros/admin): SOLO datos no sensibles.
router.get('/:id/perfil', auth.requireAuth, (req, res) => {
  const v = store.getVendedorById(req.params.id);
  if (!v) return res.status(404).json({ error: 'no_existe' });
  const { CATALOGO } = require('../services/insignias');
  const m = store.getVendedorMetricas(v.id) || {};
  res.json({
    id: v.id, nombre: v.nombre, foto: v.foto || null, rol: v.rol, estado: v.estado, about: v.about || '',
    metricas: { leadsActivos: m.leadsActivos || 0, leadsCerrados: m.leadsCerrados || 0, tasaRespuesta: m.tasaRespuesta || 0 },
    insignias: store.getInsignias(v.id),
    catalogo: CATALOGO,
  });
});

router.delete('/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const vendedor = store.getVendedores().find(v => Number(v.id) === id);
  if (!vendedor) return res.status(404).json({ error: 'vendedor_no_existe' });
  // No permitir borrar tu propia cuenta ni la de otro admin: deleteVendedor() borra
  // también su fila en `usuarios` y sus sesiones, así que el admin quedaría deslogueado
  // y bloqueado del sistema de inmediato.
  if (Number(req.session.vendedorId) === id) {
    return res.status(400).json({ error: 'no_puedes_eliminar_tu_propia_cuenta' });
  }
  const usuarioVinculado = store.getUsuarioByVendedorId(id);
  if (usuarioVinculado && usuarioVinculado.rol === 'admin') {
    return res.status(400).json({ error: 'no_se_puede_eliminar_una_cuenta_admin' });
  }
  try {
    const reasignadoA = store.deleteVendedor(id);
    events.emitToAdmins('vendedor_eliminado', { vendedorId: id, reasignadoA: reasignadoA ? reasignadoA.nombre : null, ts: Date.now() });
    res.json({ ok: true, reasignadoA: reasignadoA ? { id: reasignadoA.id, nombre: reasignadoA.nombre } : null });
  } catch (e) {
    logger.logError('delete-vendedor', e, { vendedorId: id });
    res.status(500).json({ error: 'error_interno', detalle: e.message });
  }
});

module.exports = router;
