// Un error de ÁMBITO CUENTA (ver normalizeMetaError en wa-templates.js) significa que
// TODOS los envíos de WhatsApp están fallando, no solo uno. Antes esto se emitía por
// el evento SSE 'sistema_alerta', que no tiene ni un solo listener en todo el repo —
// código muerto: si el dueño no tenía el panel abierto en ese instante exacto, nunca
// se enteraba. Este módulo hace lo que sí funciona: persistir (para /os/salud.html)
// y mandar push (para que llegue con la app cerrada), con dedupe para no repetirse.
const VENTANA_MS = 60 * 60 * 1000; // 1h — un error de cuenta no se cura en 10 minutos
const _ultima = new Map(); // `${empresaId}:${codigo}` -> timestamp del último aviso

function empresaActual() {
  try {
    const ctx = require('../db/adapter').tenantContext.getStore();
    return ctx && ctx.empresaId != null ? ctx.empresaId : 1;
  } catch (e) { return 1; }
}

// { codigo, subcodigo, humano, detalle, origen } — origen es solo para depurar
// ('webhook' | 'graph' | 'poll'), no cambia el comportamiento.
async function alertarCuenta({ codigo, subcodigo, humano, detalle, origen }) {
  const empresaId = empresaActual();
  const clave = `${empresaId}:${codigo}`;
  const ahora = Date.now();
  if (ahora - (_ultima.get(clave) || 0) < VENTANA_MS) return false;
  _ultima.set(clave, ahora);

  try {
    require('./logger').logError('whatsapp_cuenta', new Error(detalle || humano || 'Error de cuenta de WhatsApp'), { codigo, subcodigo, origen, empresaId });
  } catch (e) { /* el aviso al dueño es lo prioritario, el logger no debe bloquearlo */ }

  try {
    await require('./notify').notify({
      vendedorId: 0, tipo: 'wa_cuenta', push: true,
      titulo: '🛑 WhatsApp: la cuenta no puede enviar',
      cuerpo: String(humano || detalle || 'Meta bloqueó los envíos de WhatsApp.').slice(0, 160),
    });
  } catch (e) { console.error('[wa-alertas] notify:', e.message); }

  return true;
}

module.exports = { alertarCuenta, _ultima };
