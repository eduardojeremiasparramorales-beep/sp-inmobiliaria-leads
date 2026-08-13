// Escáner de solo lectura de data/sp-leads.db — no borra ni modifica nada. Pensado
// para correr después de scripts/reset-leads.js (BD limpia) y periódicamente después,
// para detectar exactamente el tipo de desalineación entre el esquema legacy
// (leads/messages) y el multicanal (customers/conversations/timeline) que causaba
// "faltan sincronizaciones" — ver docs/AUDITORIA_2026-08.md.
//
// Uso:
//   node scripts/escanear-bd.js
//
// En la VM:
//   cd /home/ubuntu/sp-crm/app && docker compose exec sp-crm node scripts/escanear-bd.js

const adapter = require('../src/db/adapter');
const store = require('../src/db/store');

function seccion(titulo) {
  console.log('\n=== ' + titulo + ' ===');
}

async function main() {
  await adapter.initDB();

  seccion('Leads duplicados por teléfono (regla CLAUDE.md: sin clientes cruzados)');
  const dupGroups = store.getDuplicateGroups();
  if (!dupGroups.length) console.log('  ninguno');
  else dupGroups.forEach(g => {
    console.log(`  ${g.phone}: ${g.leads.length} leads — ids [${g.leads.map(l => l.id).join(', ')}]`);
  });

  seccion('Leads sin conversación en el esquema multicanal');
  const unlinked = store.getUnlinkedLeads();
  if (!unlinked.length) console.log('  ninguno');
  else unlinked.forEach(l => console.log(`  lead #${l.id} (${l.customer_name || 'sin nombre'}, ${l.customer_phone})`));

  seccion('Conversaciones con lead_id NULL (huérfanas del puente legacy)');
  const convsSinLead = adapter.all("SELECT id, channel, customer_id, created_at FROM conversations WHERE lead_id IS NULL");
  if (!convsSinLead.length) console.log('  ninguna');
  else convsSinLead.forEach(c => console.log(`  conversación #${c.id} (${c.channel}, customer #${c.customer_id}, creada ${c.created_at})`));

  seccion('Conversaciones duplicadas por lead_id (no debería pasar — índice único desde Fase 2)');
  const dupConvs = adapter.all(`
    SELECT lead_id, COUNT(*) AS n FROM conversations
    WHERE lead_id IS NOT NULL GROUP BY lead_id HAVING COUNT(*) > 1
  `);
  if (!dupConvs.length) console.log('  ninguna');
  else dupConvs.forEach(d => console.log(`  lead_id ${d.lead_id}: ${d.n} conversaciones`));

  seccion('Conversaciones huérfanas (customer_id sin fila en customers)');
  const convsSinCustomer = adapter.all(`
    SELECT c.id, c.channel, c.lead_id FROM conversations c
    LEFT JOIN customers cu ON cu.id = c.customer_id
    WHERE cu.id IS NULL
  `);
  if (!convsSinCustomer.length) console.log('  ninguna');
  else convsSinCustomer.forEach(c => console.log(`  conversación #${c.id} (${c.channel}, lead_id=${c.lead_id ?? 'null'})`));

  seccion('Mensajes en `messages` (legacy) que no llegaron al timeline');
  // Heurística: un mensaje legacy de un lead CON conversación debería tener un evento
  // en timeline con metadata.legacy_message_id apuntando a su id. No es 100% exacto
  // (JSON en texto plano), pero suficiente para detectar huecos grandes.
  const leadsConConv = adapter.all("SELECT id, lead_id FROM conversations WHERE lead_id IS NOT NULL");
  let mensajesSinTimeline = 0;
  for (const conv of leadsConConv) {
    const totalMsgs = adapter.one("SELECT COUNT(*) AS n FROM messages WHERE lead_id = ?", [conv.lead_id]);
    const totalTimeline = adapter.one(
      "SELECT COUNT(*) AS n FROM timeline WHERE conversation_id = ? AND event_type = 'message'",
      [conv.id]
    );
    if ((totalMsgs?.n || 0) > (totalTimeline?.n || 0)) {
      mensajesSinTimeline += (totalMsgs.n - totalTimeline.n);
      console.log(`  lead #${conv.lead_id}: ${totalMsgs.n} en messages vs ${totalTimeline.n} en timeline (faltan ${totalMsgs.n - totalTimeline.n})`);
    }
  }
  if (!mensajesSinTimeline) console.log('  ninguno');

  seccion('Timestamps sin sufijo Z (riesgo de desfase de horario — ver AUDITORIA_2026-08.md §1.7)');
  const tablasConTiempo = [
    ['leads', 'created_at'], ['leads', 'updated_at'],
    ['messages', 'timestamp'],
    ['conversations', 'created_at'], ['conversations', 'updated_at'],
    ['timeline', 'created_at'],
  ];
  for (const [tabla, col] of tablasConTiempo) {
    let r;
    try { r = adapter.one(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${col} IS NOT NULL AND ${col} NOT LIKE '%Z'`); }
    catch (e) { continue; } // tabla/columna no existe en esta instalación
    if (r && r.n > 0) console.log(`  ${tabla}.${col}: ${r.n} fila(s) sin 'Z'`);
  }

  seccion('Resumen');
  const totalLeads = adapter.one('SELECT COUNT(*) AS n FROM leads');
  const totalConvs = adapter.one('SELECT COUNT(*) AS n FROM conversations');
  const totalCustomers = adapter.one('SELECT COUNT(*) AS n FROM customers');
  console.log(`  leads: ${totalLeads.n} · conversations: ${totalConvs.n} · customers: ${totalCustomers.n}`);
  console.log('\nEscaneo de solo lectura — no se modificó nada.');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
