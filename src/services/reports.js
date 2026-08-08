// Servicio de analytics y reportes
const adapter = require('../db/adapter');

function dateFilter(alias, from, to) {
  const conditions = [];
  const params = [];
  if (from) { conditions.push(`${alias}.created_at >= ?`); params.push(from); }
  if (to) { conditions.push(`${alias}.created_at <= ?`); params.push(to); }
  return { conditions, params };
}

// --- Origen de leads (campañas Meta Ads) ---
// F1: la fuente principal es `leads.ad_id` (poblado por el webhook /webhook, el que
// realmente recibe tráfico de WhatsApp — ver messages.js). Antes esta función solo leía
// `timeline.metadata`, que depende del webhook multicanal /webhook/:channel y en producción
// estaba prácticamente siempre vacía para el número principal. Se suma Messenger/Instagram
// desde `timeline` (sí usan ese flujo) filtrando fuera 'whatsapp' para no contar dos veces.
function getLeadSources(from, to) {
  const { conditions, params } = dateFilter('l', from, to);
  const whereStr = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const leads = adapter.all(`SELECT ad_id, ad_name, etiqueta FROM leads l ${whereStr}`, params);

  const campanas = {}; // ad_id/nombre -> { campaign, leads, vendidos }
  let organico = 0;
  let pagado = 0;
  const bump = (key, nombre, vendido) => {
    if (!campanas[key]) campanas[key] = { campaign: nombre || 'Anuncio sin nombre', leads: 0, vendidos: 0 };
    campanas[key].leads++;
    if (vendido) campanas[key].vendidos++;
  };

  for (const l of leads) {
    if (l.ad_id) {
      pagado++;
      bump(l.ad_id, l.ad_name, l.etiqueta === 'vendido');
    } else {
      organico++;
    }
  }

  // Messenger/Instagram (flujo multicanal) — mismo criterio, sin duplicar WhatsApp.
  try {
    const { conditions: cc, params: cp } = dateFilter('conv', from, to);
    cc.push(`conv.channel != 'whatsapp'`);
    cc.push(`conv.id IN (SELECT DISTINCT conversation_id FROM timeline WHERE direction = 'incoming')`);
    const convs = adapter.all(`SELECT conv.id FROM conversations conv WHERE ${cc.join(' AND ')}`, cp);
    for (const c of convs) {
      const primerMsg = adapter.one(
        `SELECT metadata FROM timeline WHERE conversation_id = ? AND direction = 'incoming' ORDER BY created_at ASC LIMIT 1`,
        [c.id]
      );
      if (!primerMsg) continue;
      let meta = {};
      try { meta = JSON.parse(primerMsg.metadata || '{}'); } catch (e) { meta = {}; }
      if (meta.ad_id) {
        pagado++;
        bump(meta.ad_id, meta.campaign_name || meta.ad_name, false); // sin cruce de venta en este flujo aún
      } else {
        organico++;
      }
    }
  } catch (e) { /* multicanal sin datos aún — no bloquea el resto del reporte */ }

  const campanasList = Object.values(campanas).map((c) => ({
    ...c,
    conversion_pct: c.leads ? Math.round((c.vendidos / c.leads) * 100) : 0,
  })).sort((a, b) => b.leads - a.leads);

  return { campanas: campanasList, organico, pagado };
}

// --- Exportar CSV ---
function getExportCSV(from, to, filters = {}) {
  const { conditions, params } = dateFilter('conv', from, to);
  if (filters.channel) { conditions.push('conv.channel = ?'); params.push(filters.channel); }
  if (filters.vendedorId) { conditions.push('conv.assigned_to_id = ?'); params.push(Number(filters.vendedorId)); }
  const whereStr = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const rows = adapter.all(`
    SELECT conv.*, c.name AS customer_name, c.phone AS customer_phone, v.nombre AS vendedor_nombre
    FROM conversations conv
    LEFT JOIN customers c ON c.id = conv.customer_id
    LEFT JOIN vendedores v ON v.id = conv.assigned_to_id
    ${whereStr}
    ORDER BY conv.created_at DESC
  `, params);

  const csvCell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const header = ['ID', 'Cliente', 'Teléfono', 'Canal', 'Vendedor', 'Estado', 'Etiqueta', 'Mensajes', 'Creado', 'Cerrado', 'CSAT'];

  const dataRows = rows.map(r => {
    const mensajesCount = adapter.one('SELECT COUNT(*) as c FROM timeline WHERE conversation_id = ?', [r.id]);
    const csatRow = adapter.one(
      `SELECT metadata FROM timeline WHERE conversation_id = ? AND event_type = 'csat' ORDER BY created_at DESC LIMIT 1`,
      [r.id]
    );
    let csat = '';
    if (csatRow) {
      try { csat = JSON.parse(csatRow.metadata || '{}').score || ''; } catch (e) { csat = ''; }
    }
    return [
      r.id, r.customer_name || '', r.customer_phone || '', r.channel,
      r.vendedor_nombre || 'Sin asignar', r.status, r.etiqueta || 'sin_clasificar',
      mensajesCount ? mensajesCount.c : 0, r.created_at,
      r.status === 'cerrado' ? r.updated_at : '', csat,
    ].map(csvCell).join(';');
  });

  return '﻿' + header.join(';') + '\n' + dataRows.join('\n');
}

module.exports = {
  getLeadSources, getExportCSV,
};
