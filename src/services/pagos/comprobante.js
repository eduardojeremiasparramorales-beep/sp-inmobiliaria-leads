// Proveedor de pago "comprobante": el asesor sube una imagen/PDF de su transferencia o
// Nequi y el admin la aprueba a mano. Es el modo por defecto mientras no haya pasarela.
// No hay webhook automático — la aprobación la hace el admin en /os/red.html.
module.exports = {
  nombre: 'comprobante',
  // No crea intento de cobro en línea: el pago ya se hizo por fuera; esto solo lo registra.
  async crearIntento(/* { vendedorId, plan } */) {
    return { ok: true, tipo: 'manual', mensaje: 'Sube tu comprobante; el equipo lo verifica y activa tu cuenta.' };
  },
  // Sin webhook: nunca llega una confirmación automática de un tercero.
  verificarWebhook() {
    return { ok: false, error: 'comprobante_no_usa_webhook' };
  },
};
