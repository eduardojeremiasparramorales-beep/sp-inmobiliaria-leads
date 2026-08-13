// Catálogo único de variables disponibles para plantillas de WhatsApp — reutilizado
// tanto por el envío 1-a-1 (iniciar conversación) como por el motor de campañas masivas,
// para que ambos flujos resuelvan las mismas variables de la misma forma.

const CATALOG = [
  { key: 'nombre_cliente', label: 'Nombre del cliente' },
  { key: 'telefono', label: 'Teléfono del cliente' },
  { key: 'proyecto', label: 'Proyecto / lote de interés' },
  { key: 'ciudad', label: 'Ciudad' },
  { key: 'precio', label: 'Precio / presupuesto' },
  { key: 'vendedor_nombre', label: 'Nombre del vendedor' },
  { key: 'vendedor_telefono', label: 'Teléfono del vendedor' },
  { key: 'link_ubicacion', label: 'Link de ubicación del lote' },
  { key: 'link_catalogo', label: 'Link al catálogo de propiedades' },
  { key: 'empresa', label: 'Nombre de la empresa' },
  { key: 'fecha_cita', label: 'Fecha de la cita' },
  { key: 'hora_cita', label: 'Hora de la cita' },
];

// Formateo compartido de fecha/hora de cita en español (Colombia) — usado tanto para
// {{fecha_cita}}/{{hora_cita}} de cualquier plantilla (resolveLeadVariables) como para
// el flujo específico de recordatorio de cita (wa-templates.js buildCitaRecordatorioValues),
// para no tener dos formateos que puedan divergir.
function formatearFechaHoraCita(fechaRaw) {
  const fec = new Date(String(fechaRaw || '').replace(' ', 'T'));
  const valido = !isNaN(fec.getTime());
  return {
    valido,
    fechaTxt: valido ? fec.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }) : '',
    horaTxt: valido ? fec.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '',
    horaTxt12: valido ? fec.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }) : '',
  };
}

// Resuelve los valores reales de cada variable del catálogo a partir de un lead
// (y opcionalmente su vendedor asignado). Campos que el lead no tiene aún quedan
// en '' — el remitente los completa a mano antes de enviar (ver Fase 1.4).
function resolveLeadVariables(lead, vendedor) {
  const store = require('../db/store');
  // fecha_cita/hora_cita: antes quedaban SIEMPRE vacías fuera del flujo específico de
  // "recordatorio de cita" — cualquier plantilla de reactivación mapeada a ellas moría
  // con 400 variables_vacias. Se resuelven desde la próxima cita agendada del lead.
  let fechaCita = '', horaCita = '';
  try {
    const proxima = lead && lead.id ? store.getProximaCitaByLead(lead.id) : null;
    if (proxima) {
      const f = formatearFechaHoraCita(proxima.fecha);
      fechaCita = f.fechaTxt;
      horaCita = f.horaTxt;
    }
  } catch (e) { /* sin cita agendada o error de BD — queda vacío, el remitente lo completa */ }

  return {
    nombre_cliente: (lead && lead.customer_name) || 'Cliente',
    telefono: (lead && lead.customer_phone) || '',
    proyecto: (lead && lead.proyecto) || '',
    ciudad: (lead && lead.ciudad) || '',
    precio: (lead && lead.presupuesto) || '',
    vendedor_nombre: (vendedor && vendedor.nombre) || '',
    vendedor_telefono: (vendedor && vendedor.telefono) || '',
    link_ubicacion: (lead && lead.link_ubicacion) || '',
    // Antes apuntaba a /os/propiedades.html — panel admin protegido por sesión: un cliente
    // que recibiera este link por WhatsApp caía en el login. El catálogo público real
    // (sin sesión, OG tags para preview en WhatsApp) vive en /catalogo/.
    link_catalogo: `${process.env.BASE_URL || ''}/catalogo/`,
    empresa: store.getConfig('company_name') || 'Leons Group',
    fecha_cita: fechaCita,
    hora_cita: horaCita,
  };
}

module.exports = { CATALOG, resolveLeadVariables, formatearFechaHoraCita };
