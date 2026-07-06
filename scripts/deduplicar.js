const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

async function main() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '..', 'data', 'sp-leads.db');
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  // Backup
  const backupPath = path.join(__dirname, '..', 'data', 'sp-leads-backup-before-dedup.db');
  fs.writeFileSync(backupPath, buffer);
  console.log('✅ Backup created at data/sp-leads-backup-before-dedup.db');

  function p(sql, params) {
    db.run(sql, params);
  }

  function q(sql) {
    const r = db.exec(sql);
    if (r.length === 0) return [];
    const cols = r[0].columns;
    return r[0].values.map(row => {
      const o = {};
      cols.forEach((c, i) => { o[c] = row[i]; });
      return o;
    });
  }

  // Find duplicate groups by normalized phone (only non-cerrado leads)
  const allActive = q("SELECT id, customer_phone, assigned_to_id FROM leads WHERE status != 'cerrado' ORDER BY id");
  const groups = {};
  allActive.forEach(l => {
    const digits = String(l.customer_phone || '').replace(/[^\d]/g, '');
    let norm;
    if (digits.length === 12 && digits.startsWith('57')) norm = '+' + digits;
    else if (digits.length === 10) norm = '+57' + digits;
    else norm = l.customer_phone;
    if (!groups[norm]) groups[norm] = [];
    groups[norm].push(l);
  });

  let mergedCount = 0;
  const dupLog = [];

  for (const [normPhone, leads] of Object.entries(groups)) {
    if (leads.length <= 1) continue;

    console.log(`\n📌 Processing ${normPhone} (${leads.length} leads):`);
    leads.forEach(l => console.log(`   Lead ID ${l.id}: ${l.customer_phone} → vendedor ${l.assigned_to_id}`));

    // Get message counts to determine primary
    const msgCounts = {};
    leads.forEach(l => {
      const r = q(`SELECT COUNT(*) as cnt FROM messages WHERE lead_id = ${l.id}`);
      msgCounts[l.id] = r[0].cnt;
    });
    console.log('   Message counts:', msgCounts);

    // Sort leads: primary = one with "+" prefix or most messages or oldest
    leads.sort((a, b) => {
      const aHasPlus = a.customer_phone.startsWith('+') ? 1 : 0;
      const bHasPlus = b.customer_phone.startsWith('+') ? 1 : 0;
      if (aHasPlus !== bHasPlus) return bHasPlus - aHasPlus;
      return (msgCounts[b.id] || 0) - (msgCounts[a.id] || 0);
    });

    const primary = leads[0];
    const duplicates = leads.slice(1);
    console.log(`   ✅ Primary: Lead ID ${primary.id} (${primary.customer_phone}, ${msgCounts[primary.id]} msgs)`);

    for (const dup of duplicates) {
      console.log(`   Merging Lead ID ${dup.id} → Lead ID ${primary.id}`);

      // 1. Move messages
      const dupMsgs = q(`SELECT id FROM messages WHERE lead_id = ${dup.id}`);
      if (dupMsgs.length > 0) {
        const ids = dupMsgs.map(m => m.id).join(',');
        p(`UPDATE messages SET lead_id = ${primary.id} WHERE id IN (${ids})`);
        console.log(`      → Moved ${dupMsgs.length} messages`);
      }

      // 2. Move timeline entries (by conversation_id)
      try {
        const timeline = q(`SELECT t.id, t.conversation_id FROM timeline t JOIN conversations c ON c.id = t.conversation_id WHERE c.lead_id = ${dup.id}`);
        if (timeline.length > 0) {
          const ids = timeline.map(t => t.id).join(',');
          p(`UPDATE timeline SET conversation_id = (SELECT id FROM conversations WHERE lead_id = ${primary.id} LIMIT 1) WHERE id IN (${ids})`);
          console.log(`      → Moved ${timeline.length} timeline entries`);
        }
      } catch(e) { /* no timeline table */ }

      // 3. Move lead_notes
      try {
        const notes = q(`SELECT id FROM lead_notes WHERE lead_id = ${dup.id}`);
        if (notes.length > 0) {
          const ids = notes.map(n => n.id).join(',');
          p(`UPDATE lead_notes SET lead_id = ${primary.id} WHERE id IN (${ids})`);
        }
      } catch(e) { /* no lead_notes table */ }

      // 4. Move conversation to primary customer
      const dupCust = q(`SELECT id FROM customers WHERE phone = '${dup.customer_phone.replace(/'/g, "''")}'`);
      const primaryCust = q(`SELECT id FROM customers WHERE phone = '${primary.customer_phone.replace(/'/g, "''")}'`);

      if (dupCust.length > 0 && primaryCust.length > 0) {
        const dupCustId = dupCust[0].id;
        const primaryCustId = primaryCust[0].id;

        // Move conversation
        const convs = q(`SELECT id FROM conversations WHERE customer_id = ${dupCustId}`);
        if (convs.length > 0) {
          const ids = convs.map(c => c.id).join(',');
          p(`UPDATE conversations SET customer_id = ${primaryCustId}, lead_id = ${primary.id} WHERE id IN (${ids})`);
          console.log(`      → Updated ${convs.length} conversation(s) to customer ${primaryCustId}, lead ${primary.id}`);

          // Update assigned_to_id to the primary's vendedor
          convs.forEach(c => {
            p(`UPDATE conversations SET assigned_to_id = ${primary.assigned_to_id} WHERE id = ${c.id}`);
          });
        }

        // Move customer_channels
        try {
          const chans = q(`SELECT id FROM customer_channels WHERE customer_id = ${dupCustId}`);
          if (chans.length > 0) {
            const ids = chans.map(ch => ch.id).join(',');
            p(`UPDATE customer_channels SET customer_id = ${primaryCustId} WHERE id IN (${ids})`);
          }
        } catch(e) {}

        // Delete duplicate customer after moving resources
        p(`DELETE FROM customer_channels WHERE customer_id = ${dupCustId}`);
        p(`DELETE FROM customers WHERE id = ${dupCustId}`);
        console.log(`      → Deleted duplicate customer ${dupCustId}`);
      }

      // 5. Mark duplicate lead as cerrado
      p(`UPDATE leads SET status = 'cerrado', customer_phone = '${normPhone}' WHERE id = ${dup.id}`);
      console.log(`      → Marked Lead ID ${dup.id} as cerrado`);

      dupLog.push({ dupId: dup.id, primaryId: primary.id, phone: normPhone });
      mergedCount++;
    }

    // 6. Normalize primary phone
    p(`UPDATE leads SET customer_phone = '${normPhone}' WHERE id = ${primary.id}`);

    // 7. Normalize customer phone
    try {
      const pc = q(`SELECT id FROM customers WHERE phone = '${primary.customer_phone.replace(/'/g, "''")}'`);
      if (pc.length > 0) {
        p(`UPDATE customers SET phone = '${normPhone}' WHERE id = ${pc[0].id}`);
      }
    } catch(e) {}
  }

  // Verify
  console.log('\n=== VERIFICATION ===');
  const leads = q("SELECT id, customer_phone, status, assigned_to_id FROM leads ORDER BY id");
  leads.forEach(l => console.log(`${l.id} | ${l.customer_phone} | ${l.status} | assigned_to: ${l.assigned_to_id}`));

  const msgs = q("SELECT lead_id, COUNT(*) as cnt FROM messages GROUP BY lead_id ORDER BY lead_id");
  console.log('\n=== MESSAGES PER LEAD ===');
  msgs.forEach(m => console.log(`lead_id: ${m.lead_id} | count: ${m.cnt}`));

  const convs = q("SELECT id, customer_id, lead_id, assigned_to_id, status, channel FROM conversations ORDER BY id");
  console.log('\n=== CONVERSATIONS ===');
  convs.forEach(c => console.log(`${c.id} | customer:${c.customer_id} | lead:${c.lead_id} | assigned:${c.assigned_to_id} | ${c.status} | ${c.channel}`));

  // Add UNIQUE INDEX after cleanup
  try {
    p("CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_active_phone ON leads(customer_phone) WHERE status != 'cerrado'");
    console.log('\n✅ UNIQUE INDEX created.');
  } catch(e) { console.log('⚠️ Could not create UNIQUE INDEX:', e.message); }

  // Save
  const modified = db.export();
  fs.writeFileSync(dbPath, modified);
  console.log(`\n✅ DB saved. Merged ${mergedCount} duplicate(s).`);
  if (dupLog.length > 0) {
    console.log('\n📋 Merge log:');
    dupLog.forEach(d => console.log(`   Lead ${d.dupId} → ${d.primaryId} (${d.phone})`));
  }

  db.close();
}
main();
