/**
 * Usuarios (cuentas admin/vendedor/jefe con login por email+password) — Rutas REST
 * Todo el router va montado bajo auth.requireAdmin (ver src/index.js).
 */

const express = require('express');
const router = express.Router();
const store = require('../db/store');
const auth = require('../services/auth');
const { validarTelefono } = require('../utils/validar-telefono');

router.get('/', (req, res) => res.json(store.getUsuarios()));

// Crea un usuario (vendedor o admin) + vendedor + PIN en un solo paso
router.post('/', (req, res) => {
  const { nombre, telefono, email, password, pin, rol } = req.body || {};
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'nombre, email y password requeridos' });
  }
  if (telefono && !validarTelefono(telefono)) {
    return res.status(400).json({ error: 'formato_telefono_invalido_debe_ser_57' });
  }
  const emailNorm = String(email).toLowerCase().trim();
  if (store.getUsuarioByEmail(emailNorm)) {
    return res.status(409).json({ error: 'email_ya_existe' });
  }
  const rolFinal = rol === 'admin' ? 'admin' : (rol === 'jefe' ? 'jefe' : 'vendedor');
  let vendedorId = null;

  // Para vendedores: teléfono es obligatorio
  if (rolFinal === 'vendedor' && !telefono) {
    return res.status(400).json({ error: 'telefono requerido para vendedores' });
  }

  // Crear registro en vendedores si se proporciona teléfono (vendedor o admin con PIN)
  if (telefono) {
    vendedorId = store.addVendedor(nombre, telefono);
    const pinFinal = pin || (/^\d{4}$/.test(String(password)) ? String(password) : null);
    if (pinFinal && /^\d{4}$/.test(String(pinFinal))) {
      store.setVendedorPin(vendedorId, auth.hashPassword(String(pinFinal)));
    }
  }

  store.createUsuario(emailNorm, auth.hashPassword(password), nombre, rolFinal, vendedorId);
  res.json({ ok: true, vendedorId });
});

module.exports = router;
