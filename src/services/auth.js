// Autenticación: hash de contraseñas + sesiones por token.
// Usa el módulo crypto nativo de Node (sin dependencias externas).

const crypto = require('crypto');

// --- Hash de contraseñas (scrypt) ---

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

// --- Sesiones en memoria ---
// token -> { userId, vendedorId, rol, nombre, email, createdAt }
const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 horas

function createSession(usuario) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    userId: usuario.id,
    vendedorId: usuario.vendedor_id || null,
    rol: usuario.rol || 'vendedor',
    nombre: usuario.nombre || '',
    email: usuario.email || '',
    createdAt: Date.now(),
  });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  return s;
}

function destroySession(token) {
  if (token) sessions.delete(token);
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
  req.session = session;
  req.token = token;
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
