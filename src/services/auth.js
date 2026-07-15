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
  store.createDBSession(token, {
    userId: data.id || data.userId || null,
    vendedorId: data.vendedor_id || data.vendedorId || null,
    rol: data.rol || 'vendedor',
    nombre: data.nombre || '',
    email: data.email || '',
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

module.exports = {
  hashPassword, verifyPassword,
  createSession, getSession, destroySession, getTokenFromReq,
  requireAuth, requireAdmin,
};
