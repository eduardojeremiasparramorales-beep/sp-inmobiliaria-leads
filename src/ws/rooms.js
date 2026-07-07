// Gestiona qué vendedores están viendo cada conversación (rooms conv:{id})

const roomsPorConversacion = new Map(); // convId -> Set<vendedorId>

function joinConversation(convId, vendedorId) {
  const id = Number(convId);
  if (!roomsPorConversacion.has(id)) roomsPorConversacion.set(id, new Set());
  roomsPorConversacion.get(id).add(Number(vendedorId));
}

function leaveConversation(convId, vendedorId) {
  const id = Number(convId);
  const set = roomsPorConversacion.get(id);
  if (!set) return;
  set.delete(Number(vendedorId));
  if (set.size === 0) roomsPorConversacion.delete(id);
}

function leaveAllConversations(vendedorId) {
  const id = Number(vendedorId);
  for (const [convId, set] of roomsPorConversacion.entries()) {
    set.delete(id);
    if (set.size === 0) roomsPorConversacion.delete(convId);
  }
}

function getPresence(convId) {
  const set = roomsPorConversacion.get(Number(convId));
  return set ? Array.from(set) : [];
}

module.exports = { joinConversation, leaveConversation, leaveAllConversations };
