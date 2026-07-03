const { Server } = require('socket.io');
const auth = require('../services/auth');
const rooms = require('./rooms');
const presence = require('./presence');

let io = null;

function getTokenFromSocket(socket) {
  const authHeader = socket.handshake.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  const cookie = socket.handshake.headers['cookie'];
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)sp_session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  if (socket.handshake.auth && socket.handshake.auth.token) return socket.handshake.auth.token;
  return null;
}

function createWsServer(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });

  // Middleware de autenticación
  io.use((socket, next) => {
    const token = getTokenFromSocket(socket);
    const session = auth.getSession(token);
    if (!session) return next(new Error('no_autenticado'));
    socket.data = {
      vendedorId: session.rol === 'admin' ? 0 : session.vendedorId,
      rol: session.rol,
      nombre: session.nombre,
    };
    next();
  });

  io.on('connection', (socket) => {
    const { vendedorId, rol, nombre } = socket.data;
    const room = `vendedor:${vendedorId}`;
    socket.join(room);

    if (rol !== 'admin') presence.vendedorConectado(vendedorId);
    io.emit('presence:update', { vendedorId, rol, conectado: true, ts: Date.now() });

    socket.on('join:conversation', (convId) => {
      if (!convId) return;
      socket.join(`conv:${convId}`);
      rooms.joinConversation(convId, vendedorId);
    });

    socket.on('leave:conversation', (convId) => {
      if (!convId) return;
      socket.leave(`conv:${convId}`);
      rooms.leaveConversation(convId, vendedorId);
    });

    socket.on('typing', ({ conversationId } = {}) => {
      if (!conversationId) return;
      socket.to(`conv:${conversationId}`).emit('typing', { vendedorId, nombre, conversationId, ts: Date.now() });
    });

    socket.on('disconnect', () => {
      rooms.leaveAllConversations(vendedorId);
      if (rol !== 'admin') presence.vendedorDesconectado(vendedorId);
      io.emit('presence:update', { vendedorId, rol, conectado: false, ts: Date.now() });
    });
  });

  return io;
}

function getIO() {
  return io;
}

function emitToVendedor(vendedorId, event, data) {
  if (!io) return;
  io.to(`vendedor:${vendedorId}`).emit(event, data);
}

function emitToAdmins(event, data) {
  if (!io) return;
  io.to('vendedor:0').emit(event, data);
}

function emitToConversation(convId, event, data) {
  if (!io) return;
  io.to(`conv:${convId}`).emit(event, data);
}

module.exports = {
  createWsServer, getIO,
  emitToVendedor, emitToAdmins, emitToConversation,
};
