// Selector de proveedor de pago para la Red de externos. La app trabaja siempre contra
// esta interfaz — { nombre, crearIntento, verificarWebhook } — y nunca contra un
// proveedor concreto, así que pasar de comprobante manual a Wompi es cambiar una variable
// de entorno (PAGOS_PROVEEDOR) y completar el stub, sin tocar rutas ni UI.
const comprobante = require('./comprobante');
const wompi = require('./wompi');

const PROVEEDORES = { comprobante, wompi };

function proveedorActivo() {
  const key = String(process.env.PAGOS_PROVEEDOR || 'comprobante').toLowerCase();
  return PROVEEDORES[key] || comprobante;
}

function getProveedor(nombre) {
  if (!nombre) return proveedorActivo();
  return PROVEEDORES[String(nombre).toLowerCase()] || null;
}

module.exports = { proveedorActivo, getProveedor, PROVEEDORES };
