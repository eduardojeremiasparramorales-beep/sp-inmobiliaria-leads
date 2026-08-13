// Formato de teléfono colombiano esperado en toda la app: +57 seguido de 10 dígitos.
function validarTelefono(phone) {
  return /^\+57\d{10}$/.test(String(phone).replace(/[\s-]/g, ''));
}

module.exports = { validarTelefono };
