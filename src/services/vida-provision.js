// Vid.a V2 — Aprovisionar un negocio nuevo: fila en el control plane, carpeta de
// medios propia, y su base de datos con el schema completo (store.createSchema(),
// la misma función que usa la empresa #1 — "correr initSchema tal cual sobre BD
// vacía", nada nuevo que mantener en paralelo).
const path = require('path');
const fs = require('fs');
const platform = require('../db/platform');
const adapter = require('../db/adapter');
const store = require('../db/store');
const auth = require('./auth');

function slugify(nombre) {
  return String(nombre || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'negocio-' + Date.now();
}

function getEmpresaDbPath(slug) {
  return path.join(platform.DATA_DIR, 'empresas', `${slug}.db`);
}
function getEmpresaMediaDir(slug) {
  return path.join(platform.DATA_DIR, 'media', slug);
}

// admin: { telefono, pin, nombre } — el primer admin del negocio nuevo, mismo patrón
// phone+PIN que ya usa todo el resto del sistema (nunca email+password para esto).
async function provisionEmpresa(nombre, adminData) {
  const baseSlug = slugify(nombre);
  let slug = baseSlug, n = 1;
  while (platform.getEmpresaBySlug(slug)) { slug = `${baseSlug}-${++n}`; } // slug único, reintentando con sufijo

  const dbPath = getEmpresaDbPath(slug);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(getEmpresaMediaDir(slug), { recursive: true });

  const empresa = platform.createEmpresa(nombre, slug, dbPath);

  // Todo lo que sigue corre DENTRO del contexto de tenant de la empresa nueva — la
  // primera consulta abre la conexión sola (ver adapter.js), no hace falta "crearla" antes.
  await adapter.tenantContext.run({ empresaId: empresa.id, dbPath }, () => {
    store.createSchema();
    const vId = store.addVendedor(adminData.nombre || 'Administrador', adminData.telefono);
    store.setVendedorPin(vId, auth.hashPassword(adminData.pin));
    store.createUsuario(`admin@${slug}.vida`, auth.hashPassword(crypto_randomPassword()), adminData.nombre || 'Administrador', 'admin', vId);
  });

  return empresa;
}

function crypto_randomPassword() {
  return require('crypto').randomBytes(16).toString('hex'); // nunca se usa para iniciar sesión (login es phone+PIN) — solo llena la columna NOT NULL de usuarios
}

module.exports = { provisionEmpresa, slugify, getEmpresaDbPath, getEmpresaMediaDir };
