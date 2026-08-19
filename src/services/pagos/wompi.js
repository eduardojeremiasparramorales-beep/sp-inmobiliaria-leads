// Proveedor de pago "wompi": STUB. Enganche listo para la pasarela colombiana (Nequi/
// PSE/tarjeta) cuando la cuenta de comercio esté aprobada. Hoy no está cableado: activar
// con PAGOS_PROVEEDOR=wompi y completar crearIntento/verificarWebhook con las llaves reales.
module.exports = {
  nombre: 'wompi',
  async crearIntento(/* { vendedorId, plan } */) {
    // TODO(wompi): crear el link/transacción con la API de Wompi y devolver la URL de pago.
    return { ok: false, error: 'wompi_no_configurado', pendiente: true };
  },
  // TODO(wompi): validar firma del evento (integridad) y devolver { ok, aprobado, referencia, vendedorId }.
  verificarWebhook(/* req */) {
    return { ok: false, error: 'wompi_no_configurado' };
  },
};
