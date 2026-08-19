// Bus de eventos en tiempo real (Server-Sent Events).
// Permite que el panel de cada vendedor reciba avisos instantáneos
// cuando llega un mensaje nuevo de un cliente, sin recargar la página.

// Mapa: vendedorId -> Set de respuestas HTTP (conexiones SSE abiertas)
const clients = new Map();

function addClient(vendedorId, res) {
  const id = Number(vendedorId);
  if (!clients.has(id)) clients.set(id, new Set());
  clients.get(id).add(res);

  // Limpiar al cerrar la conexión
  res.on('close', () => removeClient(id, res));
}

function removeClient(vendedorId, res) {
  const id = Number(vendedorId);
  const set = clients.get(id);
  if (set) {
    set.delete(res);
    if (set.size === 0) clients.delete(id);
  }
}

// --- Fase 1.2 (docs/AUDITORIA_2026-08.md 2.2): numerar eventos + buffer de replay ---
// SSE sin numeración no puede distinguir "no pasó nada mientras estuvo caída" de "se
// perdieron N eventos" — el único remedio hoy es un refetch completo al reconectar. Con
// un id monotónico creciente por evento y un buffer corto por vendedor, un cliente que
// reconecta puede pedir "todo lo que pasó desde el id X" (Last-Event-ID, estándar SSE)
// en vez de siempre traer todo de nuevo. El buffer es en memoria y por proceso — se
// pierde en un restart del servidor, lo cual es aceptable: en ese caso el cliente ya
// hace un refetch completo igual (ver `conectado` en el frontend).
let _nextEventId = 1;
const MAX_BUFFER_PER_CLIENT = 200; // suficiente para cubrir minutos de actividad normal
const _buffer = new Map(); // vendedorId -> [{id, evento, data}]

function _pushToBuffer(vendedorId, entry) {
  const id = Number(vendedorId);
  if (!_buffer.has(id)) _buffer.set(id, []);
  const arr = _buffer.get(id);
  arr.push(entry);
  if (arr.length > MAX_BUFFER_PER_CLIENT) arr.shift();
}

// Eventos recientes de un vendedor con id > sinceId — usado al reconectar con
// Last-Event-ID para no perder lo que llegó durante la desconexión.
function getEventsSince(vendedorId, sinceId) {
  const arr = _buffer.get(Number(vendedorId)) || [];
  const since = Number(sinceId) || 0;
  return arr.filter(e => e.id > since);
}

// Enviar un evento a TODAS las conexiones abiertas de un vendedor
function emitToVendedor(vendedorId, evento, data) {
  const id = Number(vendedorId);
  const eventId = _nextEventId++;
  _pushToBuffer(id, { id: eventId, evento, data });

  const set = clients.get(id);
  if (!set || set.size === 0) return;

  const payload = `id: ${eventId}\nevent: ${evento}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch (e) {
      removeClient(id, res);
    }
  }
}

// Enviar a todos los administradores conectados (vendedorId = 0 reservado)
function emitToAdmins(evento, data) {
  emitToVendedor(0, evento, data);
}

// Enviar a TODOS los conectados (vendedores + admins) — chat de equipo
function emitToTodos(evento, data) {
  for (const id of clients.keys()) emitToVendedor(id, evento, data);
}

// Enviar solo a los asesores de un grupo (Red vs Leons) + admins (vendedor 0, que
// monitorea ambos mundos). Aísla el chat de la Red del SSE del equipo interno: un
// mensaje de la sala 'red' no debe llegar a los paneles de Leons.
function emitToGrupo(grupoId, evento, data) {
  let ids;
  try {
    const store = require('../db/store');
    ids = store.getVendedores({ grupoId: Number(grupoId) }).map(v => Number(v.id));
  } catch (e) { ids = []; }
  const set = new Set(ids);
  set.add(0); // admin siempre recibe (monitoreo transparente)
  for (const id of set) if (clients.has(id)) emitToVendedor(id, evento, data);
}

module.exports = { addClient, removeClient, emitToVendedor, emitToAdmins, emitToTodos, emitToGrupo, getEventsSince };
