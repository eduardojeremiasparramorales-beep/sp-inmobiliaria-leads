const server = require('./server');

module.exports = {
  createWsServer: server.createWsServer,
  getIO: server.getIO,
  emitToVendedor: server.emitToVendedor,
  emitToAdmins: server.emitToAdmins,
  emitToRoom: server.emitToConversation,
};
