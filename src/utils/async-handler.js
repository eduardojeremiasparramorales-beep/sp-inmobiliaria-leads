// Envuelve un handler Express async para que una excepción no capturada llegue al
// middleware de error (Express 4 no reenvía rechazos de promesa automáticamente — sin
// esto, un throw dentro de un handler async cuelga la request hasta el timeout del
// cliente en vez de responder con el error).
function asyncH(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { asyncH };
