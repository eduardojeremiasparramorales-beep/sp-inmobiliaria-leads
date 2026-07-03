// Presencia de vendedores conectados vía Socket.IO

const conectados = new Map(); // vendedorId -> { count, estado }

function vendedorConectado(vendedorId) {
  const id = Number(vendedorId);
  const actual = conectados.get(id) || { count: 0, estado: 'activo' };
  actual.count += 1;
  conectados.set(id, actual);
  emitPresence();
}

function vendedorDesconectado(vendedorId) {
  const id = Number(vendedorId);
  const actual = conectados.get(id);
  if (!actual) return;
  actual.count -= 1;
  if (actual.count <= 0) {
    conectados.delete(id);
  } else {
    conectados.set(id, actual);
  }
  emitPresence();
}

function setEstado(vendedorId, estado) {
  const id = Number(vendedorId);
  const actual = conectados.get(id) || { count: 0, estado: 'activo' };
  actual.estado = estado;
  conectados.set(id, actual);
  emitPresence();
}

function getEstado(vendedorId) {
  const actual = conectados.get(Number(vendedorId));
  return actual ? actual.estado : 'desconectado';
}

function getConectados() {
  return Array.from(conectados.entries()).map(([vendedorId, data]) => ({
    vendedorId,
    estado: data.estado,
  }));
}

function emitPresence() {
  try {
    const { getIO } = require('./server');
    const io = getIO();
    if (io) io.emit('presence', { conectados: getConectados(), ts: Date.now() });
  } catch (e) { /* server aún no inicializado */ }
}

module.exports = { vendedorConectado, vendedorDesconectado, setEstado, getEstado, getConectados };
