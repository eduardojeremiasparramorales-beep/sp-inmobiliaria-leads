// Autenticación: hash de contraseñas + sesiones persistentes en DB.
// Usa el módulo crypto nativo de Node (sin dependencias externas).

const crypto = require('crypto');

// --- Hash de contraseñas/PINs (scrypt) ---

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// --- Sesiones persistentes en DB (30 días) ---
const CFG = require('../config');
const SESSION_TTL_MS = CFG.SESSION_TTL_MS;

function createSession(data) {
  const token = crypto.randomBytes(32).toString('hex');
  const store = require('../db/store');
  // Vid.a V3: la sesión nace DENTRO del contexto del tenant activo (un request de login
  // envuelto por el middleware de index.js ya resuelve la empresa del negocio cliente).
  // Guardar ese tenant en la sesión es lo que permite al middleware de requests futuros
  // saber en qué BD buscar la sesión (y en qué BD vive el vendedor).
  let empresaId = data.empresaId != null ? data.empresaId : null;
  let empresaDbPath = data.empresaDbPath || null;
  // Grupo del asesor (Red de externos). Si el llamador no lo pasa, se resuelve del
  // vendedor una sola vez aquí (login/rotación de token) y queda cacheado en la sesión.
  let grupoId = data.grupoId != null ? Number(data.grupoId) : null;
  if (grupoId == null && (data.vendedor_id || data.vendedorId)) {
    try {
      const v = store.getVendedorById(data.vendedor_id || data.vendedorId);
      if (v && v.grupo_id != null) grupoId = Number(v.grupo_id);
    } catch (e) { /* sin grupo → Leons por defecto en las lecturas */ }
  }
  try {
    const adapter = require('../db/adapter');
    const ctx = adapter.tenantContext.getStore();
    if (ctx && ctx.empresaId != null) {
      empresaId = ctx.empresaId;
      empresaDbPath = ctx.dbPath || adapter.DEFAULT_DB_PATH;
    }
  } catch (e) { /* sin contexto → empresa #1 (default) */ }
  store.createDBSession(token, {
    userId: data.id || data.userId || null,
    vendedorId: data.vendedor_id || data.vendedorId || null,
    rol: data.rol || 'vendedor',
    nombre: data.nombre || '',
    email: data.email || '',
    userAgent: data.userAgent || '',
    empresaId,
    empresaDbPath,
    grupoId,
  });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const store = require('../db/store');
  const s = store.getDBSession(token);
  if (!s) return null;
  if (Date.now() - s.created_at > SESSION_TTL_MS) {
    store.deleteDBSession(token);
    return null;
  }
  return {
    userId: s.user_id,
    vendedorId: s.vendedor_id,
    rol: s.rol,
    nombre: s.nombre,
    email: s.email || '',
    empresaId: s.empresa_id != null ? Number(s.empresa_id) : null,
    empresaDbPath: s.empresa_db_path || null,
    grupoId: s.grupo_id != null ? Number(s.grupo_id) : (s.vendedor_id ? 1 : null),
  };
}

function destroySession(token) {
  if (!token) return;
  const store = require('../db/store');
  store.deleteDBSession(token);
}

// --- Lectura del token desde la petición (cookie o header) ---

function getTokenFromReq(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  const cookie = req.headers['cookie'];
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)sp_session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

// --- Middlewares ---

function requireAuth(req, res, next) {
  const token = getTokenFromReq(req);
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'no_autenticado' });
  // Sliding expiration con rotación de token: si la sesión tiene más de la mitad
  // de su vida (15 días), se emite un token NUEVO (cookie) y el viejo queda con
  // 5 minutos de gracia para requests en vuelo. Solo rota cuando el token vino
  // por cookie — los clientes con Bearer (app nativa) guardan el token y no
  // pueden recibir uno nuevo de forma transparente.
  if (token) {
    const store = require('../db/store');
    const raw = store.getDBSession(token);
    if (raw && Date.now() - raw.created_at > SESSION_TTL_MS / 2) {
      const esCookie = !(req.headers['authorization'] || '').startsWith('Bearer ');
      if (esCookie) {
        const nuevo = createSession({
          userId: raw.user_id, vendedorId: raw.vendedor_id,
          rol: raw.rol, nombre: raw.nombre, email: raw.email,
          grupoId: raw.grupo_id != null ? Number(raw.grupo_id) : undefined, // preservar el grupo al rotar
          userAgent: raw.user_agent || req.headers['user-agent'] || '', // preservar el dispositivo al rotar el token
        });
        // El token viejo expira en 5 min (created_at retrocedido a TTL-5min)
        store.expireSessionSoon(token, 5 * 60 * 1000);
        const secure = (process.env.SECURE_COOKIES === 'true' || req.headers['x-forwarded-proto'] === 'https' || req.secure) ? '; Secure' : '';
        res.setHeader('Set-Cookie', `sp_session=${nuevo}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax${secure}`);
        req.token = nuevo;
      } else {
        store.refreshSession(token);
      }
    }
    // "Última actividad" en Sesiones activas — throttled dentro de touchSessionLastSeen,
    // así que esto no agrega un UPDATE por request, solo cuando ya pasó rato.
    try { store.touchSessionLastSeen(token); } catch (e) {}
  }
  req.session = session;
  if (!req.token) req.token = token;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.session.rol !== 'admin') {
      return res.status(403).json({ error: 'requiere_admin' });
    }
    next();
  });
}

function requireSupervisor(req, res, next) {
  requireAuth(req, res, () => {
    if (req.session.rol !== 'supervisor') {
      return res.status(403).json({ error: 'requiere_supervisor' });
    }
    next();
  });
}

function requireSupervisorOrAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!esAccesoGlobal(req)) {
      return res.status(403).json({ error: 'requiere_supervisor_o_admin' });
    }
    next();
  });
}

// ¿La sesión ve/opera datos de cualquier asesor (no solo los propios)? admin,
// supervisor y jefe comparten este criterio en todo el backend — fuente única para
// no repetir `rol === 'admin'` sueltos que dejan afuera a supervisor/jefe por error
// (fue la causa de que el jefe recibiera 403 en varios endpoints del inbox).
function esAccesoGlobal(req) {
  return req.session.rol === 'admin' || req.session.rol === 'supervisor' || req.session.rol === 'jefe';
}

// Grupo de la sesión actual (Red de externos): NULL/ausente cuenta como Leons (grupo 1),
// que es lo correcto para toda cuenta preexistente a la Red.
function grupoDeSesion(req) {
  const g = req.session && req.session.grupoId;
  return g != null ? Number(g) : 1;
}

// ¿La sesión pertenece a la Red de externos (grupo 2)? Los flujos de suscripción,
// ranking de la Red y sala de chat 'red' se activan solo para estos asesores.
function esExterno(req) {
  return grupoDeSesion(req) === 2;
}

// ¿El recurso (lead, asesor, mensaje…) es del mismo grupo que la sesión? El acceso global
// (admin/supervisor/jefe) siempre pasa — ven ambos mundos. Un recurso sin grupo (NULL)
// cuenta como Leons. Es defensa en profundidad para las vistas de LISTA y referencias
// cruzadas; el acceso a un lead individual ya está aislado por assigned_to_id.
function mismoGrupo(req, recursoGrupoId) {
  if (esAccesoGlobal(req)) return true;
  const g = recursoGrupoId != null ? Number(recursoGrupoId) : 1;
  return g === grupoDeSesion(req);
}

module.exports = {
  hashPassword, verifyPassword,
  createSession, getSession, destroySession, getTokenFromReq,
  requireAuth, requireAdmin, requireSupervisor, requireSupervisorOrAdmin,
  esAccesoGlobal, grupoDeSesion, esExterno, mismoGrupo,
};
