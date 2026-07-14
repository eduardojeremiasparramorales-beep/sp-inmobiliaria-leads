const adapter = require('./adapter');
const { createNewTables } = require('./schema');

// Obtener funciones del adapter
let all = (sql, params) => adapter.all(sql, params);
let one = (sql, params) => adapter.one(sql, params);
let run = (sql, params) => adapter.run(sql, params);
let execSQL = (sql) => adapter.exec(sql);

// Añade una columna a una tabla solo si aún no existe (migración segura)
function ensureColumn(table, column, type) {
  try {
    const cols = all(`PRAGMA table_info(${table})`).map(r => r.name);
    if (!cols.includes(column)) {
      execSQL(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  } catch (e) {
    console.error(`ensureColumn ${table}.${column}:`, e.message);
  }
}

async function initDB() {
  await adapter.initDB();

  execSQL(`
    CREATE TABLE IF NOT EXISTS vendedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL UNIQUE,
      email TEXT DEFAULT '',
      estado TEXT DEFAULT 'activo',
      rol TEXT DEFAULT 'vendedor',
      total_leads INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_phone TEXT NOT NULL,
      customer_name TEXT DEFAULT 'Cliente',
      assigned_to_id INTEGER,
      assigned_to_phone TEXT,
      status TEXT DEFAULT 'nuevo',
      messages_count INTEGER DEFAULT 1,
      first_message TEXT,
      last_message TEXT,
      first_response_at DATETIME,
      escalation_level INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      from_number TEXT NOT NULL,
      to_number TEXT NOT NULL,
      body TEXT NOT NULL,
      direction TEXT DEFAULT 'incoming',
      timestamp DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      nombre TEXT,
      rol TEXT DEFAULT 'vendedor',
      vendedor_id INTEGER,
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      cuerpo TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  execSQL(`CREATE INDEX IF NOT EXISTS idx_leads_customer_phone ON leads(customer_phone)`);
  try {
    execSQL(`CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_active_phone ON leads(customer_phone) WHERE status != 'cerrado'`);
  } catch (e) {
    // Ya hay 2+ leads activos con el mismo teléfono (datos legacy) — el índice no puede
    // crearse hasta fusionarlos. Se auto-fusiona con la misma lógica de scripts/deduplicar.js
    // para que la regla de negocio (1 número = 1 lead activo) quede protegida sin intervención manual.
    console.error('[DB] UNIQUE INDEX de leads activos falló (hay duplicados) — fusionando automáticamente...', e.message);
    try {
      const groups = getDuplicateGroups();
      for (const g of groups) {
        const sorted = [...g.leads].sort((a, b) => {
          if (a.vendedorId && !b.vendedorId) return -1;
          if (!a.vendedorId && b.vendedorId) return 1;
          if (a.status !== 'cerrado' && b.status === 'cerrado') return -1;
          if (a.status === 'cerrado' && b.status !== 'cerrado') return 1;
          return (b.mensajes || 0) - (a.mensajes || 0);
        });
        const primary = sorted[0];
        for (const dup of sorted.slice(1)) {
          try { mergeLeads(primary.id, dup.id); } catch (e2) { console.error('[DB] Auto-merge falló para lead', dup.id, e2.message); }
        }
      }
      execSQL(`CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_active_phone ON leads(customer_phone) WHERE status != 'cerrado'`);
      console.log('[DB] Duplicados fusionados automáticamente y UNIQUE INDEX creado.');
    } catch (e2) {
      console.error('[DB] No se pudo auto-fusionar ni crear el UNIQUE INDEX — revisar manualmente en /os/deduplicar.html:', e2.message);
    }
  }
  execSQL(`CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_id ON leads(assigned_to_id)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_phone ON leads(assigned_to_phone)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_vendedores_telefono ON vendedores(telefono)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_vendedores_estado ON vendedores(estado)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_usuarios_vendedor_id ON usuarios(vendedor_id)`);

  ensureColumn('messages', 'media_type', 'TEXT');
  ensureColumn('messages', 'media_id', 'TEXT');
  ensureColumn('messages', 'media_mime', 'TEXT');
  ensureColumn('messages', 'media_filename', 'TEXT');
  ensureColumn('messages', 'reply_to_id', 'INTEGER');
  ensureColumn('messages', 'wamid', 'TEXT');
  try { execSQL(`CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wamid ON messages(wamid) WHERE wamid IS NOT NULL`); } catch (e) { console.error('[DB] No se pudo crear UNIQUE INDEX en messages.wamid (puede haber duplicados):', e.message); }
  ensureColumn('messages', 'status', 'TEXT DEFAULT \'sent\'');
  ensureColumn('vendedores', 'pin', 'TEXT');
  ensureColumn('vendedores', 'foto', 'TEXT');
  ensureColumn('leads', 'etiqueta', 'TEXT');
  ensureColumn('leads', 'unread_count', 'INTEGER DEFAULT 0');
  ensureColumn('leads', 'last_customer_message_at', 'DATETIME');
  ensureColumn('leads', 'proyecto', 'TEXT');
  ensureColumn('leads', 'origen', 'TEXT');
  ensureColumn('leads', 'ciudad', 'TEXT');
  ensureColumn('leads', 'presupuesto', 'TEXT');
  ensureColumn('leads', 'pinned_at', 'DATETIME');
  ensureColumn('leads', 'muted_at', 'DATETIME');
  ensureColumn('leads', 'progress_pct', 'INTEGER DEFAULT 0');
  ensureColumn('messages', 'edited_at', 'DATETIME');
  ensureColumn('messages', 'deleted_for_sender', 'INTEGER DEFAULT 0');
  ensureColumn('messages', 'deleted_for_all', 'INTEGER DEFAULT 0');
  ensureColumn('messages', 'deleted_by', 'TEXT');
  ensureColumn('messages', 'read_at', 'DATETIME');
  ensureColumn('messages', 'error_detail', 'TEXT');
  ensureColumn('conversations', 'last_customer_message_at', 'DATETIME');

  execSQL(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      sender_number TEXT NOT NULL,
      direction TEXT DEFAULT 'incoming',
      created_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(message_id, emoji, sender_number),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );
  `);

  execSQL(`
    CREATE TABLE IF NOT EXISTS lead_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      autor TEXT DEFAULT '',
      nota TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id)`);

  execSQL(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  execSQL(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER,
      vendedor_id INTEGER,
      rol TEXT DEFAULT 'vendedor',
      nombre TEXT DEFAULT '',
      email TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `);

  execSQL(`
    CREATE TABLE IF NOT EXISTS wa_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      idioma TEXT DEFAULT 'es',
      params TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);
  // Columnas del catálogo real de plantillas de Meta (sincronizado, no escrito a mano):
  // categoria/estado como los reporta Graph API, componentes = estructura completa
  // (header/body/botones), variables = placeholders detectados, var_mapping = qué
  // variable del CRM (template-vars.js) llena cada placeholder.
  ensureColumn('wa_templates', 'categoria', 'TEXT');
  ensureColumn('wa_templates', 'estado', "TEXT DEFAULT 'APPROVED'");
  ensureColumn('wa_templates', 'componentes', 'TEXT');
  ensureColumn('wa_templates', 'variables', 'TEXT');
  ensureColumn('wa_templates', 'var_mapping', 'TEXT');

  // --- Campañas masivas (broadcast) ---
  execSQL(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      template_id INTEGER NOT NULL,
      segmento TEXT DEFAULT '{}',
      overrides TEXT DEFAULT '{}',
      estado TEXT DEFAULT 'draft',
      programado_para DATETIME,
      creado_por INTEGER,
      total_destinatarios INTEGER DEFAULT 0,
      total_enviados INTEGER DEFAULT 0,
      total_entregados INTEGER DEFAULT 0,
      total_leidos INTEGER DEFAULT 0,
      total_fallidos INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      started_at DATETIME,
      finished_at DATETIME
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_campaigns_estado ON campaigns(estado)`);

  execSQL(`
    CREATE TABLE IF NOT EXISTS campaign_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      lead_id INTEGER,
      phone TEXT NOT NULL,
      variables TEXT DEFAULT '{}',
      estado TEXT DEFAULT 'queued',
      error_detail TEXT,
      wamid TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      sent_at DATETIME,
      delivered_at DATETIME,
      read_at DATETIME,
      failed_at DATETIME,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_camprec_campaign ON campaign_recipients(campaign_id)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_camprec_estado ON campaign_recipients(campaign_id, estado)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_camprec_wamid ON campaign_recipients(wamid)`);

  // Opt-out: quien pide no recibir más mensajes queda excluido de TODAS las campañas
  // futuras, sin importar el segmento — se comprueba en cada envío, no solo al crear.
  execSQL(`
    CREATE TABLE IF NOT EXISTS optout (
      phone TEXT PRIMARY KEY,
      canal TEXT DEFAULT 'whatsapp',
      motivo TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  execSQL(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendedor_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_push_vendedor ON push_subscriptions(vendedor_id)`);
  // 'webpush' (VAPID, navegador/PWA) o 'fcm' (app nativa Android vía Capacitor)
  ensureColumn('push_subscriptions', 'tipo', "TEXT DEFAULT 'webpush'");

  execSQL(`CREATE TABLE IF NOT EXISTS vendedor_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendedor_id INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    cuerpo TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now'))
  )`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_vt_vendedor ON vendedor_templates(vendedor_id)`);

  execSQL(`CREATE TABLE IF NOT EXISTS propiedades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    ciudad TEXT DEFAULT '',
    precio REAL DEFAULT 0,
    m2 REAL DEFAULT 0,
    tipo TEXT DEFAULT 'lote',
    estado TEXT DEFAULT 'disponible' CHECK (estado IN ('disponible','reservado','vendido')),
    imagen_url TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now'))
  )`);

  createNewTables(adapter.getDB());

  // Puente legacy → multicanal: cada conversación puede apuntar a su lead
  ensureColumn('conversations', 'lead_id', 'INTEGER');
  execSQL(`CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id)`);

  // Citas (visitas, llamadas, seguimientos agendados)
  execSQL(`
    CREATE TABLE IF NOT EXISTS citas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      vendedor_id INTEGER,
      titulo TEXT NOT NULL,
      fecha DATETIME NOT NULL,
      notas TEXT DEFAULT '',
      estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'hecha', 'cancelada')),
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_citas_fecha ON citas(fecha)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_citas_vendedor ON citas(vendedor_id)`);

  execSQL(`
    CREATE TABLE IF NOT EXISTS pending_outbound (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      phone TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_pending_outbound_phone ON pending_outbound(phone)`);

  return adapter.getDB();
}

function getDB() { return adapter.getDB(); }

function normalizePhone(phone) {
  if (!phone) return phone;
  let s = String(phone).trim();
  // Quitar +57 o 57 del inicio si ya viene con código de país
  const digits = s.replace(/[^\d]/g, '');
  if (digits.length === 12 && digits.startsWith('57')) return '+' + digits;
  if (digits.length === 11 && digits.startsWith('57')) return '+' + digits;
  if (digits.length === 10) return '+57' + digits;
  // Si ya tiene + y formato raro, limpiar y normalizar
  if (s.startsWith('+')) {
    const d = s.replace(/[^\d]/g, '');
    if (d.length >= 12) return '+' + d.slice(0, 13);
    if (d.length === 10) return '+57' + d;
  }
  return s;
}

function saveLead(customerPhone, customerName, messageBody) {
  if (!customerPhone || !messageBody) {
    throw new Error('saveLead: customerPhone y messageBody son obligatorios');
  }

  const phone = normalizePhone(customerPhone);

  // Buscar en TODOS los leads (incluso cerrados) para NUNCA crear duplicados del mismo teléfono.
  // Prioriza un lead ACTIVO sobre uno cerrado: si por datos legacy coexisten ambos, reabrir el
  // cerrado dejaría dos leads activos con el mismo número (viola la regla de negocio y el índice único).
  const allMatches = all("SELECT id, messages_count, status, assigned_to_id FROM leads WHERE customer_phone = ? ORDER BY (status != 'cerrado') DESC, id DESC", [phone]);

  if (allMatches.length > 0) {
    const existing = allMatches[0];
    const wasClosed = existing.status === 'cerrado';
    reopenOrUpdateLead(existing.id, wasClosed, messageBody);
    return { leadId: existing.id, isNew: false, wasClosed };
  }

  // No existe ningún lead con este teléfono → insertar nuevo
  try {
    run('INSERT INTO leads (customer_phone, customer_name, first_message, last_message, unread_count, last_customer_message_at, etiqueta, progress_pct) VALUES (?, ?, ?, ?, 1, datetime(\'now\'), \'sin_clasificar\', 5)', [phone, customerName || 'Cliente', messageBody, messageBody]);
  } catch (e) {
    // Condición de carrera: otro webhook concurrente insertó/reabrió este teléfono entre
    // el SELECT y el INSERT (o el UNIQUE INDEX lo bloqueó). Se trata como actualización
    // del lead ya existente en vez de propagar el error al webhook.
    const race = one("SELECT id, status FROM leads WHERE customer_phone = ? ORDER BY (status != 'cerrado') DESC, id DESC LIMIT 1", [phone]);
    if (!race) throw e;
    const wasClosed = race.status === 'cerrado';
    reopenOrUpdateLead(race.id, wasClosed, messageBody);
    return { leadId: race.id, isNew: false, wasClosed };
  }

  const r = one('SELECT id FROM leads WHERE customer_phone = ? ORDER BY id DESC LIMIT 1', [phone]);
  if (!r || !r.id) {
    throw new Error('No se pudo obtener ID del lead después de INSERT');
  }
  return { leadId: r.id, isNew: true, wasClosed: false };
}

function reopenOrUpdateLead(leadId, wasClosed, messageBody) {
  if (wasClosed) {
    run('UPDATE leads SET status = ?, first_response_at = NULL, escalation_level = 0, messages_count = messages_count + 1, last_message = ?, unread_count = COALESCE(unread_count,0) + 1, updated_at = datetime(\'now\'), last_customer_message_at = datetime(\'now\') WHERE id = ?', ['asignado', messageBody, leadId]);
  } else {
    run('UPDATE leads SET messages_count = messages_count + 1, last_message = ?, unread_count = COALESCE(unread_count,0) + 1, updated_at = datetime(\'now\'), last_customer_message_at = datetime(\'now\') WHERE id = ?', [messageBody, leadId]);
  }
}

function assignLeadToVendedor(leadId, vendedor) {
  if (!leadId || !vendedor || !vendedor.id || !vendedor.telefono) {
    throw new Error('assignLeadToVendedor: leadId y vendedor (con id y telefono) son obligatorios');
  }

  const leadExists = one('SELECT id FROM leads WHERE id = ?', [leadId]);
  if (!leadExists) throw new Error(`Lead ${leadId} no existe`);

  const vExists = one('SELECT id FROM vendedores WHERE id = ?', [vendedor.id]);
  if (!vExists) throw new Error(`Vendedor ${vendedor.id} no existe`);

  run('UPDATE leads SET assigned_to_id = ?, assigned_to_phone = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?', [vendedor.id, vendedor.telefono, 'asignado', leadId]);
  run('UPDATE vendedores SET total_leads = total_leads + 1 WHERE id = ?', [vendedor.id]);
}

function saveMessage(leadId, from, to, body, direction, media, replyToId, wamid, status) {
  const m = media || {};
  const st = status || (direction === 'outgoing' ? 'sent' : null);
  run('INSERT INTO messages (lead_id, from_number, to_number, body, direction, media_type, media_id, media_mime, media_filename, reply_to_id, wamid, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    leadId, from, to, body, direction,
    m.media_type || null, m.media_id || null, m.media_mime || null, m.media_filename || null,
    replyToId ? Number(replyToId) : null, wamid || null, st,
  ]);
  run('UPDATE leads SET last_message = ?, updated_at = datetime(\'now\') WHERE id = ?', [String(body).slice(0, 255), leadId]);
  // Incrementar unread_count para mensajes entrantes del cliente
  if (direction === 'incoming') {
    run('UPDATE leads SET unread_count = COALESCE(unread_count,0) + 1 WHERE id = ?', [leadId]);
  }
  const r = one('SELECT id FROM messages WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [leadId]);
  return r ? r.id : null;
}

function updateMessageStatus(wamid, status) {
  run('UPDATE messages SET status = ? WHERE wamid = ?', [status, wamid]);
}

function setMessageError(wamid, detail) {
  run('UPDATE messages SET error_detail = ? WHERE wamid = ?', [detail, wamid]);
}

function markMessageAsRead(messageId) {
  run("UPDATE messages SET status = 'read', read_at = datetime('now') WHERE id = ? AND status != 'read'", [messageId]);
}

function markLeadMessagesAsRead(leadId, fromNumber) {
  run("UPDATE messages SET status = 'read', read_at = datetime('now') WHERE lead_id = ? AND from_number = ? AND (status IS NULL OR status != 'read')", [leadId, fromNumber]);
}

function getMessageById(id) {
  return one('SELECT * FROM messages WHERE id = ? LIMIT 1', [id]);
}

// --- Reacciones emoji ---
function addReaction(messageId, emoji, senderNumber, direction) {
  try {
    run('INSERT OR IGNORE INTO message_reactions (message_id, emoji, sender_number, direction) VALUES (?, ?, ?, ?)',
      [messageId, emoji, senderNumber, direction || 'incoming']);
    return true;
  } catch (e) { return false; }
}
function removeReaction(messageId, emoji, senderNumber) {
  run('DELETE FROM message_reactions WHERE message_id = ? AND emoji = ? AND sender_number = ?', [messageId, emoji, senderNumber]);
}
function getReactionsForMessage(messageId) {
  return all('SELECT * FROM message_reactions WHERE message_id = ?', [messageId]);
}
function getReactionsForMessages(messageIds) {
  if (!messageIds.length) return {};
  const ids = messageIds.map(Number).filter(Boolean);
  if (!ids.length) return {};
  const placeholders = ids.map(() => '?').join(',');
  const rows = all(`SELECT * FROM message_reactions WHERE message_id IN (${placeholders})`, ids);
  const map = {};
  for (const r of rows) {
    if (!map[r.message_id]) map[r.message_id] = [];
    map[r.message_id].push(r);
  }
  return map;
}

// --- Editar mensaje ---
function editMessage(messageId, newBody) {
  run("UPDATE messages SET body = ?, edited_at = datetime('now') WHERE id = ?", [String(newBody).trim(), messageId]);
}

// --- Borrar para mí ---
function softDeleteMessage(messageId, senderNumber) {
  if (senderNumber) {
    run("UPDATE messages SET body = '', deleted_for_sender = 1 WHERE id = ? AND from_number = ?", [messageId, senderNumber]);
  } else {
    run("UPDATE messages SET body = '', deleted_for_sender = 1 WHERE id = ?", [messageId]);
  }
}

// --- Eliminar para todos (solo dentro del CRM; la API de WhatsApp no permite borrar en el teléfono del cliente) ---
function markDeletedForAll(messageId, byName) {
  run("UPDATE messages SET deleted_for_all = 1, deleted_by = ? WHERE id = ?", [byName || '', messageId]);
}

// El cliente eliminó un mensaje para todos: se marca pero se CONSERVA el body (anti-delete)
function markDeletedByClientWamid(wamid) {
  run("UPDATE messages SET deleted_for_all = 1, deleted_by = 'cliente' WHERE wamid = ?", [wamid]);
  return one('SELECT * FROM messages WHERE wamid = ? LIMIT 1', [wamid]);
}

function getMessageByWamid(wamid) {
  return one('SELECT * FROM messages WHERE wamid = ? LIMIT 1', [wamid]);
}

// --- Pin de lead ---
function pinLead(leadId, pinned) {
  if (pinned) {
    run("UPDATE leads SET pinned_at = datetime('now') WHERE id = ?", [leadId]);
  } else {
    run("UPDATE leads SET pinned_at = NULL WHERE id = ?", [leadId]);
  }
}

// --- Mute lead ---
function clearLeadMessages(leadId) {
  run('DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE lead_id = ?)', [leadId]);
  run('UPDATE messages SET body = ?, deleted_for_sender = 1 WHERE lead_id = ?', ['', leadId]);
}

function muteLead(leadId, muted) {
  if (muted) {
    run("UPDATE leads SET muted_at = datetime('now') WHERE id = ?", [leadId]);
  } else {
    run("UPDATE leads SET muted_at = NULL WHERE id = ?", [leadId]);
  }
}

// === 24-HOUR WINDOW TRACKING ===

function updateCustomerMessageTimestamp(leadId) {
  run('UPDATE leads SET last_customer_message_at = datetime(\'now\') WHERE id = ?', [leadId]);
  try {
    const lead = one('SELECT lead_id FROM conversations WHERE lead_id = ?', [leadId]);
    if (lead) {
      run('UPDATE conversations SET last_customer_message_at = datetime(\'now\') WHERE lead_id = ?', [leadId]);
    }
  } catch (e) { /* conversación puede no existir aún */ }
}

function isWindowOpen(leadId) {
  const lead = one('SELECT last_customer_message_at FROM leads WHERE id = ?', [leadId]);
  if (!lead || !lead.last_customer_message_at) return false;
  const lastMsg = new Date(lead.last_customer_message_at + 'Z');
  const now = new Date();
  const hoursDiff = (now - lastMsg) / (1000 * 60 * 60);
  return hoursDiff < 24;
}

function getWindowExpiresAt(leadId) {
  const lead = one('SELECT last_customer_message_at FROM leads WHERE id = ?', [leadId]);
  if (!lead || !lead.last_customer_message_at) return null;
  const lastMsg = new Date(lead.last_customer_message_at + 'Z');
  return new Date(lastMsg.getTime() + 24 * 60 * 60 * 1000);
}

function getVendedoresActivos() {
  // El admin NO recibe clientes: se excluye a cualquier vendedor vinculado a un usuario con rol 'admin'.
  return all(`
    SELECT v.*, COUNT(l.id) as leads_activos
    FROM vendedores v
    LEFT JOIN leads l ON l.assigned_to_id = v.id AND l.status != ?
    WHERE v.estado = ?
      AND v.id NOT IN (SELECT vendedor_id FROM usuarios WHERE rol = 'admin' AND vendedor_id IS NOT NULL)
    GROUP BY v.id
    ORDER BY leads_activos ASC
  `, ['cerrado', 'activo']);
}

function getLeadById(id) {
  return one('SELECT * FROM leads WHERE id = ?', [id]);
}

function getLeadByCustomerPhone(phone) {
  return one('SELECT * FROM leads WHERE customer_phone = ? AND status != ?', [normalizePhone(phone), 'cerrado']);
}

function updateLeadStatus(leadId, status) {
  run('UPDATE leads SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, leadId]);
}

function resetLead(leadId) {
  run(`UPDATE leads SET
    status = 'nuevo',
    first_response_at = NULL,
    escalation_level = 0,
    unread_count = 0,
    updated_at = datetime('now')
  WHERE id = ?`, [leadId]);
}

function setFirstResponse(leadId) {
  run('UPDATE leads SET first_response_at = datetime(\'now\') WHERE id = ? AND first_response_at IS NULL', [leadId]);
}

function getDuplicateGroups() {
  const dupMap = {};
  const rows = all("SELECT id, customer_phone, status, assigned_to_id, customer_name, messages_count, created_at FROM leads ORDER BY id");
  rows.forEach(l => {
    const norm = normalizePhone(l.customer_phone);
    if (!dupMap[norm]) dupMap[norm] = [];
    dupMap[norm].push(l);
  });
  const groups = [];
  for (const [phone, leads] of Object.entries(dupMap)) {
    if (leads.length > 1) {
      groups.push({ phone, leads: leads.map(l => ({
        id: l.id, status: l.status, vendedorId: l.assigned_to_id,
        nombre: l.customer_name, mensajes: l.messages_count,
        creado: l.created_at
      }))});
    }
  }
  return groups;
}

function mergeLeads(keepLeadId, removeLeadId) {
  const keep = one('SELECT * FROM leads WHERE id = ?', [keepLeadId]);
  const remove = one('SELECT * FROM leads WHERE id = ?', [removeLeadId]);
  if (!keep || !remove) throw new Error('Uno de los leads no existe');

  // Mover mensajes
  const msgs = all('SELECT id FROM messages WHERE lead_id = ?', [removeLeadId]);
  if (msgs.length > 0) {
    const ids = msgs.map(m => m.id).join(',');
    run(`UPDATE messages SET lead_id = ? WHERE id IN (${ids})`, [keepLeadId]);
  }

  // Mover notas
  try {
    const notes = all('SELECT id FROM lead_notes WHERE lead_id = ?', [removeLeadId]);
    if (notes.length > 0) {
      const ids = notes.map(n => n.id).join(',');
      run(`UPDATE lead_notes SET lead_id = ? WHERE id IN (${ids})`, [keepLeadId]);
    }
  } catch(e) {}

  // Mover conversaciones al lead conservado y cerrar las del lead eliminado
  try {
    const convs = all('SELECT id FROM conversations WHERE lead_id = ?', [removeLeadId]);
    if (convs.length > 0) {
      const ids = convs.map(c => c.id).join(',');
      run(`UPDATE conversations SET lead_id = ?, assigned_to_id = ?, status = 'cerrado', updated_at = datetime('now') WHERE id IN (${ids})`, [keepLeadId, keep.assigned_to_id]);
    }
  } catch(e) {}

  // Cerrar el lead duplicado
  run("UPDATE leads SET status = 'cerrado' WHERE id = ?", [removeLeadId]);

  return { keepId: keepLeadId, removedId: removeLeadId, messagesMoved: msgs.length };
}

function closeOrphanConversations() {
  const orphans = all(`
    SELECT conv.id FROM conversations conv
    LEFT JOIN leads l ON l.id = conv.lead_id
    WHERE l.id IS NULL OR l.status = 'cerrado'
  `);
  orphans.forEach(o => {
    run("UPDATE conversations SET status = 'cerrado', updated_at = datetime('now') WHERE id = ?", [o.id]);
  });
  return { closed: orphans.length };
}

// Decora leads con su lead score (0-100, en vivo — ver computeLeadScore en progress.js).
// Se calcula al leer, no se persiste, porque su factor de recencia cambia con el
// simple paso del tiempo y una columna guardada se desactualizaría sin un cron.
function withLeadScore(leads) {
  const { computeLeadScore } = require('../services/progress');
  return leads.map(l => ({ ...l, score: computeLeadScore(l) }));
}

function getLeads(includeCerrado) {
  if (includeCerrado) {
    return withLeadScore(all(`
      SELECT l.*, v.nombre AS assigned_to_nombre
      FROM leads l
      LEFT JOIN vendedores v ON v.id = l.assigned_to_id
      ORDER BY l.updated_at DESC, l.created_at DESC
    `));
  }
  return withLeadScore(all(`
    SELECT l.*, v.nombre AS assigned_to_nombre
    FROM leads l
    LEFT JOIN vendedores v ON v.id = l.assigned_to_id
    WHERE l.status != 'cerrado'
    ORDER BY l.updated_at DESC, l.created_at DESC
  `));
}

// Marcar todos los mensajes de un lead como leídos
function marcarLeido(leadId) {
  run('UPDATE leads SET unread_count = 0 WHERE id = ?', [Number(leadId)]);
}

function setUnreadCount(leadId, count) {
  run('UPDATE leads SET unread_count = ? WHERE id = ?', [Number(count), Number(leadId)]);
}

// Editar el nombre del contacto
function setLeadNombre(leadId, nombre) {
  run('UPDATE leads SET customer_name = ?, updated_at = datetime(\'now\') WHERE id = ?', [String(nombre), Number(leadId)]);
}

function setLeadOrigen(leadId, origen) {
  run('UPDATE leads SET origen = ? WHERE id = ?', [String(origen).slice(0, 255), Number(leadId)]);
}

function getLeadCount() {
  const r = one("SELECT COUNT(*) as c FROM leads WHERE status != 'cerrado'");
  return r ? r.c : 0;
}

function getLeadsSinRespuesta(minutos) {
  return all('SELECT * FROM leads WHERE status = ? AND first_response_at IS NULL AND created_at <= datetime(\'now\', ?)', ['asignado', `-${minutos} minutes`]);
}

function incrementEscalation(leadId) {
  run('UPDATE leads SET escalation_level = escalation_level + 1 WHERE id = ?', [leadId]);
}

function addVendedor(nombre, telefono) {
  let t = String(telefono).replace(/[\s-]/g, '');
  if (t.startsWith('57') && !t.startsWith('+')) t = '+' + t;
  run('INSERT OR IGNORE INTO vendedores (nombre, telefono) VALUES (?, ?)', [nombre, t]);
  const r = one('SELECT id FROM vendedores WHERE telefono = ? LIMIT 1', [t]);
  return r ? r.id : null;
}

// --- Usuarios (login) ---
function createUsuario(email, passwordHash, nombre, rol, vendedorId) {
  run('INSERT INTO usuarios (email, password, nombre, rol, vendedor_id) VALUES (?, ?, ?, ?, ?)', [email, passwordHash, nombre, rol, vendedorId]);
  return one('SELECT * FROM usuarios WHERE email = ? LIMIT 1', [email]);
}

function getUsuarioByEmail(email) {
  return one('SELECT * FROM usuarios WHERE email = ? LIMIT 1', [email]);
}

function getUsuarioById(id) {
  return one('SELECT * FROM usuarios WHERE id = ? LIMIT 1', [id]);
}

function getUsuarioByVendedorId(vendedorId) {
  return one('SELECT * FROM usuarios WHERE vendedor_id = ? LIMIT 1', [vendedorId]);
}

function getUsuarios() {
  return all('SELECT id, email, nombre, rol, vendedor_id, created_at FROM usuarios ORDER BY nombre');
}

function countUsuarios() {
  const r = one('SELECT COUNT(*) as c FROM usuarios');
  return r ? r.c : 0;
}

function updateUsuarioPassword(id, passwordHash) {
  run('UPDATE usuarios SET password = ? WHERE id = ?', [passwordHash, id]);
}

function updateUsuarioVendedorId(id, vendedorId) {
  run('UPDATE usuarios SET vendedor_id = ? WHERE id = ?', [vendedorId, id]);
}

// --- Leads y mensajes por vendedor ---
function getLeadsByVendedorId(vendedorId) {
  return withLeadScore(all("SELECT l.*, v.nombre AS assigned_to_nombre FROM leads l LEFT JOIN vendedores v ON l.assigned_to_id = v.id WHERE l.assigned_to_id = ? AND l.status != ? ORDER BY l.pinned_at DESC, l.updated_at DESC", [vendedorId, 'cerrado']));
}

function getArchivedLeadsByVendedorId(vendedorId) {
  return all("SELECT l.*, v.nombre AS assigned_to_nombre FROM leads l LEFT JOIN vendedores v ON l.assigned_to_id = v.id WHERE l.assigned_to_id = ? AND l.status = ? ORDER BY l.updated_at DESC", [vendedorId, 'cerrado']);
}

function getMessagesByLead(leadId) {
  return all(`
    SELECT m.*, r.body AS reply_to_body, r.direction AS reply_to_direction, r.media_type AS reply_to_media_type
    FROM messages m
    LEFT JOIN messages r ON r.id = m.reply_to_id
    WHERE m.lead_id = ?
    ORDER BY m.timestamp ASC, m.id ASC
  `, [leadId]);
}

// --- Templates (respuestas rápidas) ---
function getTemplates() {
  return all('SELECT * FROM templates ORDER BY titulo');
}

function addTemplate(titulo, cuerpo) {
  run('INSERT INTO templates (titulo, cuerpo) VALUES (?, ?)', [titulo, cuerpo]);
}

function deleteTemplate(id) {
  run('DELETE FROM templates WHERE id = ?', [id]);
}

// --- Templates del vendedor (respuestas rápidas personalizadas) ---
function getVendedorTemplates(vendedorId) {
  return all('SELECT * FROM vendedor_templates WHERE vendedor_id = ? ORDER BY titulo', [vendedorId]);
}
function addVendedorTemplate(vendedorId, titulo, cuerpo) {
  run('INSERT INTO vendedor_templates (vendedor_id, titulo, cuerpo) VALUES (?, ?, ?)', [vendedorId, titulo, cuerpo]);
}
function deleteVendedorTemplate(id) {
  run('DELETE FROM vendedor_templates WHERE id = ?', [id]);
}

// --- Estadísticas semanales del vendedor ---
function getStatsSemanales(vendedorId) {
  const semana = "datetime('now', '-7 days')";
  const anterior = "datetime('now', '-14 days')";
  const nuevos = one(`SELECT COUNT(*) as c FROM leads WHERE assigned_to_id = ? AND created_at >= ${semana}`, [vendedorId]);
  const anteriores = one(`SELECT COUNT(*) as c FROM leads WHERE assigned_to_id = ? AND created_at >= ${anterior} AND created_at < ${semana}`, [vendedorId]);
  const respondidos = one(`SELECT COUNT(*) as c FROM leads WHERE assigned_to_id = ? AND first_response_at IS NOT NULL AND first_response_at >= ${semana}`, [vendedorId]);
  const respondidosAnt = one(`SELECT COUNT(*) as c FROM leads WHERE assigned_to_id = ? AND first_response_at IS NOT NULL AND first_response_at >= ${anterior} AND first_response_at < ${semana}`, [vendedorId]);
  const cerrados = one(`SELECT COUNT(*) as c FROM leads WHERE assigned_to_id = ? AND status = 'cerrado' AND updated_at >= ${semana}`, [vendedorId]);
  const cerradosAnt = one(`SELECT COUNT(*) as c FROM leads WHERE assigned_to_id = ? AND status = 'cerrado' AND updated_at >= ${anterior} AND updated_at < ${semana}`, [vendedorId]);
  const tprom = one(`SELECT AVG((julianday(first_response_at) - julianday(created_at)) * 1440) as c FROM leads WHERE assigned_to_id = ? AND first_response_at IS NOT NULL AND first_response_at >= ${semana}`, [vendedorId]);
  const tpromAnt = one(`SELECT AVG((julianday(first_response_at) - julianday(created_at)) * 1440) as c FROM leads WHERE assigned_to_id = ? AND first_response_at IS NOT NULL AND first_response_at >= ${anterior} AND first_response_at < ${semana}`, [vendedorId]);
  return {
    nuevos: nuevos ? nuevos.c : 0, nuevosAnt: anteriores ? anteriores.c : 0,
    respondidos: respondidos ? respondidos.c : 0, respondidosAnt: respondidosAnt ? respondidosAnt.c : 0,
    cerrados: cerrados ? cerrados.c : 0, cerradosAnt: cerradosAnt ? cerradosAnt.c : 0,
    tiempoPromedio: tprom ? Math.round(tprom.c) : 0,
    tiempoPromedioAnt: tpromAnt ? Math.round(tpromAnt.c) : 0,
  };
}

// --- Propiedades (lotes / inmuebles) ---
function getPropiedades() {
  return all('SELECT * FROM propiedades ORDER BY created_at DESC');
}
function getPropiedadById(id) {
  return one('SELECT * FROM propiedades WHERE id = ?', [id]);
}
function createPropiedad(data) {
  run('INSERT INTO propiedades (nombre, descripcion, ciudad, precio, m2, tipo, estado, imagen_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [data.nombre, data.descripcion||'', data.ciudad||'', data.precio||0, data.m2||0, data.tipo||'lote', data.estado||'disponible', data.imagen_url||'']);
  return one('SELECT * FROM propiedades WHERE id = (SELECT last_insert_rowid())');
}
function updatePropiedad(id, data) {
  run('UPDATE propiedades SET nombre=?, descripcion=?, ciudad=?, precio=?, m2=?, tipo=?, estado=?, imagen_url=? WHERE id=?',
    [data.nombre, data.descripcion||'', data.ciudad||'', data.precio||0, data.m2||0, data.tipo||'lote', data.estado||'disponible', data.imagen_url||'', id]);
}
function deletePropiedad(id) {
  run('DELETE FROM propiedades WHERE id = ?', [id]);
}

// --- Suscripciones push ---
function savePushSubscription(vendedorId, sub) {
  const keys = sub.keys || {};
  run('INSERT OR REPLACE INTO push_subscriptions (vendedor_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)', [vendedorId, sub.endpoint, keys.p256dh || '', keys.auth || '']);
}

// Token FCM de la app nativa (Capacitor). Se guarda en la misma tabla reutilizando
// `endpoint` como el token — p256dh/auth solo aplican a Web Push, quedan vacíos.
function saveFcmToken(vendedorId, token) {
  run('INSERT OR REPLACE INTO push_subscriptions (vendedor_id, endpoint, p256dh, auth, tipo) VALUES (?, ?, ?, ?, ?)', [vendedorId, token, '', '', 'fcm']);
}

function getPushSubscriptionsByVendedor(vendedorId) {
  return all('SELECT * FROM push_subscriptions WHERE vendedor_id = ?', [vendedorId]);
}

function deletePushSubscription(endpoint) {
  run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
}

function getVendedores() {
  return all('SELECT * FROM vendedores ORDER BY nombre');
}

function getVendedorByTelefono(telefono) {
  return one('SELECT * FROM vendedores WHERE telefono = ? LIMIT 1', [telefono]);
}

function getVendedorById(id) {
  return one('SELECT * FROM vendedores WHERE id = ? LIMIT 1', [id]);
}

function setVendedorPin(id, pinHash) {
  run('UPDATE vendedores SET pin = ? WHERE id = ?', [pinHash, id]);
}

// --- Sesiones persistentes en DB ---
function createDBSession(token, data) {
  run('INSERT OR REPLACE INTO sessions (token, user_id, vendedor_id, rol, nombre, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    token,
    data.userId != null ? Number(data.userId) : null,
    data.vendedorId != null ? Number(data.vendedorId) : null,
    data.rol || 'vendedor',
    data.nombre || '',
    data.email || '',
    Date.now(),
  ]);
}

function getDBSession(token) {
  return one('SELECT * FROM sessions WHERE token = ? LIMIT 1', [token]);
}

function deleteDBSession(token) {
  run('DELETE FROM sessions WHERE token = ?', [token]);
}

function refreshSession(token) {
  run('UPDATE sessions SET created_at = ? WHERE token = ?', [Date.now(), token]);
}

function cleanExpiredSessions(ttlMs) {
  run('DELETE FROM sessions WHERE created_at < ?', [Date.now() - ttlMs]);
}

// --- Configuración general ---
function getConfig(key) {
  const r = one('SELECT value FROM config WHERE key = ? LIMIT 1', [key]);
  return r ? r.value : null;
}

function setConfig(key, value) {
  run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, value]);
}

// --- Templates de WhatsApp aprobados por Meta ---
function getWATemplates() {
  return all('SELECT * FROM wa_templates ORDER BY nombre');
}

function addWATemplate(nombre, idioma, params) {
  run('INSERT OR REPLACE INTO wa_templates (nombre, idioma, params) VALUES (?, ?, ?)', [nombre, idioma || 'es', params || '']);
}

function deleteWATemplate(id) {
  run('DELETE FROM wa_templates WHERE id = ?', [id]);
}

function getWATemplateById(id) {
  return one('SELECT * FROM wa_templates WHERE id = ?', [id]);
}

function getWATemplateByName(nombre) {
  return one('SELECT * FROM wa_templates WHERE nombre = ?', [nombre]);
}

// Guarda/actualiza una plantilla tal como la reporta Meta (sync real, no entrada manual).
// Usa nombre como clave: si Meta reporta el mismo nombre en dos idiomas, la última
// sincronizada sobrescribe — limitación aceptada mientras el negocio opera en un solo idioma.
function upsertWATemplateFull(t) {
  const existing = getWATemplateByName(t.nombre);
  if (existing) {
    run('UPDATE wa_templates SET idioma = ?, categoria = ?, estado = ?, componentes = ?, variables = ? WHERE id = ?',
      [t.idioma || 'es', t.categoria || '', t.estado || 'APPROVED', t.componentes || '[]', t.variables || '[]', existing.id]);
    return existing.id;
  }
  run('INSERT INTO wa_templates (nombre, idioma, categoria, estado, componentes, variables) VALUES (?, ?, ?, ?, ?, ?)',
    [t.nombre, t.idioma || 'es', t.categoria || '', t.estado || 'APPROVED', t.componentes || '[]', t.variables || '[]']);
  return one('SELECT id FROM wa_templates WHERE nombre = ?', [t.nombre]).id;
}

function setWATemplateMapping(id, mappingJson) {
  run('UPDATE wa_templates SET var_mapping = ? WHERE id = ?', [mappingJson, id]);
}

// ═══════════════════════ Campañas masivas (broadcast) ═══════════════════════

function createCampaign({ nombre, templateId, segmento, overrides, creadoPor }) {
  run('INSERT INTO campaigns (nombre, template_id, segmento, overrides, creado_por) VALUES (?, ?, ?, ?, ?)',
    [nombre, templateId, JSON.stringify(segmento || {}), JSON.stringify(overrides || {}), creadoPor || null]);
  return one('SELECT * FROM campaigns WHERE id = (SELECT last_insert_rowid())');
}

function getCampaigns() {
  return all('SELECT * FROM campaigns ORDER BY created_at DESC');
}

function getCampaignById(id) {
  return one('SELECT * FROM campaigns WHERE id = ?', [id]);
}

function updateCampaignEstado(id, estado) {
  const timestampCol = estado === 'running' ? ', started_at = datetime(\'now\')'
    : (estado === 'done' || estado === 'failed') ? ', finished_at = datetime(\'now\')' : '';
  run(`UPDATE campaigns SET estado = ?, updated_at = datetime('now')${timestampCol} WHERE id = ?`, [estado, id]);
}

function deleteCampaign(id) {
  run('DELETE FROM campaign_recipients WHERE campaign_id = ?', [id]);
  run('DELETE FROM campaigns WHERE id = ?', [id]);
}

function addCampaignRecipients(campaignId, recipients) {
  for (const r of recipients) {
    run('INSERT INTO campaign_recipients (campaign_id, lead_id, phone, variables) VALUES (?, ?, ?, ?)',
      [campaignId, r.leadId || null, r.phone, JSON.stringify(r.variables || {})]);
  }
  run('UPDATE campaigns SET total_destinatarios = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ?) WHERE id = ?', [campaignId, campaignId]);
}

function getCampaignRecipients(campaignId, estado) {
  if (estado) return all('SELECT * FROM campaign_recipients WHERE campaign_id = ? AND estado = ? ORDER BY id ASC', [campaignId, estado]);
  return all('SELECT * FROM campaign_recipients WHERE campaign_id = ? ORDER BY id ASC', [campaignId]);
}

function updateCampaignRecipient(id, fields) {
  const sets = [], vals = [];
  const colByEstado = { sent: 'sent_at', delivered: 'delivered_at', read: 'read_at', failed: 'failed_at' };
  if (fields.estado) {
    sets.push('estado = ?'); vals.push(fields.estado);
    const col = colByEstado[fields.estado];
    if (col) sets.push(`${col} = datetime('now')`);
  }
  if (fields.wamid !== undefined) { sets.push('wamid = ?'); vals.push(fields.wamid); }
  if (fields.errorDetail !== undefined) { sets.push('error_detail = ?'); vals.push(fields.errorDetail); }
  if (!sets.length) return;
  vals.push(id);
  run(`UPDATE campaign_recipients SET ${sets.join(', ')} WHERE id = ?`, vals);
}

function getCampaignRecipientByWamid(wamid) {
  return one('SELECT * FROM campaign_recipients WHERE wamid = ?', [wamid]);
}

// Recalcula los contadores agregados de la campaña desde sus destinatarios —
// la fuente de verdad es siempre campaign_recipients, nunca un contador que se
// pueda desincronizar por una actualización parcial.
function recalcCampaignStats(campaignId) {
  const stats = one(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN estado IN ('sent','delivered','read') THEN 1 ELSE 0 END) as enviados,
    SUM(CASE WHEN estado IN ('delivered','read') THEN 1 ELSE 0 END) as entregados,
    SUM(CASE WHEN estado = 'read' THEN 1 ELSE 0 END) as leidos,
    SUM(CASE WHEN estado = 'failed' THEN 1 ELSE 0 END) as fallidos
    FROM campaign_recipients WHERE campaign_id = ?`, [campaignId]);
  run('UPDATE campaigns SET total_destinatarios = ?, total_enviados = ?, total_entregados = ?, total_leidos = ?, total_fallidos = ? WHERE id = ?',
    [stats.total || 0, stats.enviados || 0, stats.entregados || 0, stats.leidos || 0, stats.fallidos || 0, campaignId]);
}

// --- Opt-out: exclusión permanente de campañas ---
function isOptedOut(phone) {
  return !!one('SELECT phone FROM optout WHERE phone = ?', [phone]);
}

function addOptout(phone, canal, motivo) {
  run('INSERT OR REPLACE INTO optout (phone, canal, motivo) VALUES (?, ?, ?)', [phone, canal || 'whatsapp', motivo || '']);
}

function getOptouts() {
  return all('SELECT * FROM optout ORDER BY created_at DESC');
}

// --- Segmentación de audiencia para campañas ---
// Construye el WHERE dinámicamente a partir de filtros opcionales. Excluye SIEMPRE
// los leads con status='cerrado' (no se hace broadcast a leads inactivos) y los
// teléfonos en optout, sin importar qué combinación de filtros se use.
function buildSegmentWhere(filters) {
  const f = filters || {};
  const where = ["l.status != 'cerrado'"];
  const params = [];
  if (f.etiqueta) { where.push('l.etiqueta = ?'); params.push(f.etiqueta); }
  if (f.proyecto) { where.push('l.proyecto = ?'); params.push(f.proyecto); }
  if (f.ciudad) { where.push('l.ciudad = ?'); params.push(f.ciudad); }
  if (f.vendedorId) { where.push('l.assigned_to_id = ?'); params.push(f.vendedorId); }
  if (f.contactadoAntesDe) { where.push('l.last_customer_message_at IS NOT NULL AND l.last_customer_message_at < ?'); params.push(f.contactadoAntesDe); }
  if (f.contactadoDespuesDe) { where.push('l.last_customer_message_at IS NOT NULL AND l.last_customer_message_at > ?'); params.push(f.contactadoDespuesDe); }
  where.push('NOT EXISTS (SELECT 1 FROM optout o WHERE o.phone = l.customer_phone)');
  return { whereSql: where.join(' AND '), params };
}

function countSegment(filters) {
  const { whereSql, params } = buildSegmentWhere(filters);
  const r = one(`SELECT COUNT(*) as c FROM leads l WHERE ${whereSql}`, params);
  return r ? r.c : 0;
}

function segmentLeads(filters) {
  const { whereSql, params } = buildSegmentWhere(filters);
  return all(`SELECT l.* FROM leads l WHERE ${whereSql} ORDER BY l.id ASC`, params);
}

// Valores reales existentes para poblar los filtros del constructor de segmentos
// (evita que el admin escriba "Tocaima" cuando en la DB está guardado "tocaima").
function getSegmentOptions() {
  const proyectos = all("SELECT DISTINCT proyecto FROM leads WHERE proyecto IS NOT NULL AND proyecto != '' ORDER BY proyecto").map(r => r.proyecto);
  const ciudades = all("SELECT DISTINCT ciudad FROM leads WHERE ciudad IS NOT NULL AND ciudad != '' ORDER BY ciudad").map(r => r.ciudad);
  return { proyectos, ciudades };
}

function setVendedorEstado(id, estado) {
  run('UPDATE vendedores SET estado = ? WHERE id = ?', [estado, id]);
}

function setVendedorTelefono(id, telefono) {
  run('UPDATE vendedores SET telefono = ? WHERE id = ?', [telefono, id]);
}

function setVendedorNombre(id, nombre) {
  run('UPDATE vendedores SET nombre = ? WHERE id = ?', [nombre, id]);
}

function setVendedorFoto(id, fotoBase64) {
  run('UPDATE vendedores SET foto = ? WHERE id = ?', [fotoBase64, id]);
}

function getVendedorMetricas(id) {
  const a = one("SELECT COUNT(*) as c FROM leads WHERE assigned_to_id = ? AND status != ?", [id, 'cerrado']);
  const h = one("SELECT COUNT(*) as c FROM leads WHERE assigned_to_id = ? AND date(created_at) = date('now')", [id]);
  const cer = one("SELECT COUNT(*) as c FROM leads WHERE assigned_to_id = ? AND status = ?", [id, 'cerrado']);
  const res = one("SELECT COUNT(*) as c FROM leads WHERE assigned_to_id = ? AND first_response_at IS NOT NULL", [id]);
  const tot = one("SELECT COUNT(*) as c FROM leads WHERE assigned_to_id = ?", [id]);
  const ua = one("SELECT MAX(timestamp) as t FROM messages WHERE direction = ? AND lead_id IN (SELECT id FROM leads WHERE assigned_to_id = ?)", ['outgoing', id]);
  return {
    leadsActivos: a ? a.c : 0,
    leadsHoy: h ? h.c : 0,
    leadsCerrados: cer ? cer.c : 0,
    tasaRespuesta: tot && tot.c > 0 ? Math.round((res.c / tot.c) * 100) : 0,
    ultimaActividad: ua ? ua.t : null,
  };
}

const PROGRESS_MAP = { sin_clasificar: 5, interesado: 30, negociacion: 60, cita: 85, vendido: 100, no_interesado: 5 };

// --- Etiqueta de pipeline del lead ---
function setLeadEtiqueta(leadId, etiqueta) {
  const pct = PROGRESS_MAP[etiqueta] || 0;
  run('UPDATE leads SET etiqueta = ?, progress_pct = ?, updated_at = datetime(\'now\') WHERE id = ?', [etiqueta, pct, leadId]);
}

function updateLeadProgress(leadId, pct) {
  const clamped = Math.max(0, Math.min(100, pct));
  run('UPDATE leads SET progress_pct = ?, updated_at = datetime(\'now\') WHERE id = ?', [clamped, leadId]);
}

// --- Notas internas por lead ---
function getNotasByLead(leadId) {
  return all('SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC, id DESC', [leadId]);
}

function addNota(leadId, autor, nota) {
  run('INSERT INTO lead_notes (lead_id, autor, nota) VALUES (?, ?, ?)', [leadId, autor || '', nota]);
}

function deleteNota(id) {
  run('DELETE FROM lead_notes WHERE id = ?', [id]);
}

// --- Reasignación de un lead (admin o automática) ---
function reassignLead(leadId, vendedor, vendedorAnteriorId) {
  run('UPDATE leads SET assigned_to_id = ?, assigned_to_phone = ?, updated_at = datetime(\'now\') WHERE id = ?', [vendedor.id, vendedor.telefono, leadId]);
  run('UPDATE vendedores SET total_leads = total_leads + 1 WHERE id = ?', [vendedor.id]);
  if (vendedorAnteriorId) {
    run('UPDATE vendedores SET total_leads = MAX(0, total_leads - 1) WHERE id = ?', [vendedorAnteriorId]);
  }
}

// --- Eliminar vendedor y reasignar sus leads ---
function deleteVendedor(id) {
  const activos = all("SELECT * FROM vendedores WHERE estado = ? AND id != ? AND id NOT IN (SELECT vendedor_id FROM usuarios WHERE rol = 'admin' AND vendedor_id IS NOT NULL) ORDER BY total_leads ASC LIMIT 1", ['activo', id]);
  const leadsReasignar = all('SELECT id FROM leads WHERE assigned_to_id = ? AND status != ?', [id, 'cerrado']);

  if (activos.length > 0) {
    const siguiente = activos[0];
    leadsReasignar.forEach(lead => {
      run('UPDATE leads SET assigned_to_id = ?, assigned_to_phone = ?, updated_at = datetime(\'now\') WHERE id = ?', [siguiente.id, siguiente.telefono, lead.id]);
      run('UPDATE vendedores SET total_leads = total_leads + 1 WHERE id = ?', [siguiente.id]);
    });
  } else {
    // No hay vendedores activos: marcar leads como huérfanos (sin asignar) y cambiar status a 'nuevo' para que round-robin los reasigne
    leadsReasignar.forEach(lead => {
      run('UPDATE leads SET assigned_to_id = NULL, assigned_to_phone = NULL, status = ?, updated_at = datetime(\'now\') WHERE id = ?', ['nuevo', lead.id]);
    });
  }

  run('DELETE FROM push_subscriptions WHERE vendedor_id = ?', [id]);
  run('DELETE FROM sessions WHERE vendedor_id = ?', [id]);
  run('DELETE FROM usuarios WHERE vendedor_id = ?', [id]);
  run('DELETE FROM vendedores WHERE id = ?', [id]);
  return activos.length > 0 ? activos[0] : null;
}

// --- Inbox global admin: lista de conversaciones con filtros ---
function getAdminInbox({ busqueda, etiqueta, vendedorId, limite, offset } = {}) {
  const conditions = [];
  const params = [];
  if (busqueda) {
    conditions.push('(l.customer_name LIKE ? OR l.customer_phone LIKE ?)');
    params.push(`%${busqueda}%`, `%${busqueda}%`);
  }
  if (etiqueta && etiqueta !== 'todos') {
    if (etiqueta === 'remarketing') {
      conditions.push("l.etiqueta IN ('no_interesado', 'sin_clasificar')");
    } else {
      conditions.push('l.etiqueta = ?');
      params.push(etiqueta);
    }
  }
  if (vendedorId) {
    conditions.push('l.assigned_to_id = ?');
    params.push(Number(vendedorId));
  }
  const whereStr = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const lim = Number(limite) || 50;
  const off = Number(offset) || 0;
  return all(`
    SELECT l.*, v.nombre as vendedor_nombre, v.estado as vendedor_estado,
      (SELECT COUNT(*) FROM messages m WHERE m.lead_id = l.id) as total_mensajes,
      (SELECT COUNT(*) FROM messages m WHERE m.lead_id = l.id AND m.direction = ? AND m.timestamp > COALESCE(
        (SELECT MAX(m2.timestamp) FROM messages m2 WHERE m2.lead_id = l.id AND m2.direction = ?), ?)) as sin_leer
    FROM leads l
    LEFT JOIN vendedores v ON v.id = l.assigned_to_id
    ${whereStr}
    ORDER BY l.updated_at DESC, l.id DESC
    LIMIT ? OFFSET ?
  `, [...params, 'incoming', 'outgoing', '2000-01-01', lim, off]);
}

function getAdminInboxStats() {
  const total = one('SELECT COUNT(*) as c FROM leads');
  const sinResponder = one("SELECT COUNT(*) as c FROM leads WHERE status IN (?, ?)", ['nuevo', 'asignado']);
  const hoy = one("SELECT COUNT(*) as c FROM leads WHERE date(created_at) = date('now')");
  return {
    total: total ? total.c : 0,
    sinResponder: sinResponder ? sinResponder.c : 0,
    hoy: hoy ? hoy.c : 0,
  };
}

// =====================================================================
// NUEVO SCHEMA MULTICANAL: customers, customer_channels, conversations, timeline
// =====================================================================

// --- Customers ---
function createCustomer(name, phone) {
  run('INSERT INTO customers (name, phone) VALUES (?, ?)', [name || 'Cliente', phone || '']);
  return one('SELECT * FROM customers WHERE id = (SELECT last_insert_rowid())');
}

function getCustomerById(id) {
  return one('SELECT * FROM customers WHERE id = ?', [id]);
}

function findCustomerByChannel(channel, userId) {
  return one(`
    SELECT c.*
    FROM customer_channels cc
    JOIN customers c ON c.id = cc.customer_id
    WHERE cc.channel = ? AND cc.channel_user_id = ?
    LIMIT 1
  `, [channel, userId]);
}

// --- Customer Channels ---
function linkChannelToCustomer(customerId, channel, channelUserId, username) {
  run('INSERT OR IGNORE INTO customer_channels (customer_id, channel, channel_user_id, channel_username) VALUES (?, ?, ?, ?)',
    [customerId, channel, channelUserId, username || '']);
}

function getCustomerChannels(customerId) {
  return all('SELECT * FROM customer_channels WHERE customer_id = ?', [customerId]);
}

function getCustomers({ busqueda, limite, offset } = {}) {
  const conditions = [];
  const params = [];
  if (busqueda) {
    conditions.push('(name LIKE ? OR phone LIKE ?)');
    params.push(`%${busqueda}%`, `%${busqueda}%`);
  }
  const whereStr = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const lim = Number(limite) || 50;
  const off = Number(offset) || 0;
  return all(`SELECT * FROM customers ${whereStr} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, lim, off]);
}

function updateCustomer(id, data) {
  const actual = getCustomerById(id);
  if (!actual) return null;
  run('UPDATE customers SET name = ?, email = ?, phone = ?, notes = ?, tags = ? WHERE id = ?', [
    data.name !== undefined ? data.name : actual.name,
    data.email !== undefined ? data.email : actual.email,
    data.phone !== undefined ? data.phone : actual.phone,
    data.notes !== undefined ? data.notes : actual.notes,
    data.tags !== undefined ? JSON.stringify(data.tags) : actual.tags,
    id,
  ]);
  return getCustomerById(id);
}

function deleteCustomer(id) {
  run('DELETE FROM customer_channels WHERE customer_id = ?', [id]);
  run('DELETE FROM customers WHERE id = ?', [id]);
}

function getActiveConversationsByCustomer(customerId) {
  return all('SELECT * FROM conversations WHERE customer_id = ? AND status != \'cerrado\'', [customerId]);
}

// --- Conversations ---
function createConversation(channel, channelConversationId, customerId) {
  run('INSERT INTO conversations (channel, channel_conversation_id, customer_id) VALUES (?, ?, ?)',
    [channel, channelConversationId || '', customerId]);
  return one('SELECT * FROM conversations WHERE id = (SELECT last_insert_rowid())');
}

function getConversationById(id) {
  return one(`
    SELECT conv.*, v.nombre AS assigned_to_nombre
    FROM conversations conv
    LEFT JOIN vendedores v ON v.id = conv.assigned_to_id
    WHERE conv.id = ?
  `, [id]);
}

function getConversationsByVendedorId(vendedorId) {
  return all(`
    SELECT conv.*, c.name AS customer_name, c.phone AS customer_phone
    FROM conversations conv
    LEFT JOIN customers c ON c.id = conv.customer_id
    WHERE conv.assigned_to_id = ?
    ORDER BY conv.updated_at DESC
  `, [vendedorId]);
}

function getConversationByChannelUser(channel, userId) {
  return one(`
    SELECT conv.*
    FROM customer_channels cc
    JOIN conversations conv ON conv.customer_id = cc.customer_id AND conv.channel = cc.channel
    WHERE cc.channel = ? AND cc.channel_user_id = ? AND conv.status != 'cerrado'
    ORDER BY conv.id DESC LIMIT 1
  `, [channel, userId]);
}

function updateConversationStatus(id, status) {
  run('UPDATE conversations SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, id]);
}

function updateConversationTag(id, etiqueta) {
  const pct = PROGRESS_MAP[etiqueta] || 0;
  run('UPDATE conversations SET etiqueta = ?, progress_pct = ?, updated_at = datetime(\'now\') WHERE id = ?', [etiqueta, pct, id]);
}

function updateConversationPriority(id, priority) {
  run('UPDATE conversations SET priority = ?, updated_at = datetime(\'now\') WHERE id = ?', [priority, id]);
}

function getConversations({ channel, status, etiqueta, busqueda, vendedorId, limite, offset } = {}) {
  const conditions = [];
  const params = [];
  if (channel) { conditions.push('conv.channel = ?'); params.push(channel); }
  if (status) { conditions.push('conv.status = ?'); params.push(status); }
  if (etiqueta && etiqueta !== 'todos') { conditions.push('conv.etiqueta = ?'); params.push(etiqueta); }
  if (busqueda) {
    conditions.push('(c.name LIKE ? OR c.phone LIKE ?)');
    params.push(`%${busqueda}%`, `%${busqueda}%`);
  }
  if (vendedorId) { conditions.push('conv.assigned_to_id = ?'); params.push(Number(vendedorId)); }
  const whereStr = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const lim = Number(limite) || 50;
  const off = Number(offset) || 0;
  return all(`
    SELECT conv.*, c.name AS customer_name, c.phone AS customer_phone, v.nombre AS assigned_to_nombre
    FROM conversations conv
    LEFT JOIN customers c ON c.id = conv.customer_id
    LEFT JOIN vendedores v ON v.id = conv.assigned_to_id
    ${whereStr}
    ORDER BY conv.updated_at DESC, conv.id DESC
    LIMIT ? OFFSET ?
  `, [...params, lim, off]);
}

function getConversationCount() {
  const r = one('SELECT COUNT(*) as c FROM conversations');
  return r ? r.c : 0;
}

// --- Citas ---
function getCitas({ vendedorId, desde, hasta } = {}) {
  const conditions = [];
  const params = [];
  if (vendedorId) { conditions.push('c.vendedor_id = ?'); params.push(Number(vendedorId)); }
  if (desde) { conditions.push('c.fecha >= ?'); params.push(desde); }
  if (hasta) { conditions.push('c.fecha <= ?'); params.push(hasta); }
  const whereStr = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return all(`
    SELECT c.*, l.customer_name, l.customer_phone, v.nombre AS vendedor_nombre
    FROM citas c
    LEFT JOIN leads l ON l.id = c.lead_id
    LEFT JOIN vendedores v ON v.id = c.vendedor_id
    ${whereStr}
    ORDER BY c.fecha ASC
  `, params);
}

function getCitaById(id) {
  return one('SELECT * FROM citas WHERE id = ?', [id]);
}

function createCita({ leadId, vendedorId, titulo, fecha, notas }) {
  run('INSERT INTO citas (lead_id, vendedor_id, titulo, fecha, notas) VALUES (?, ?, ?, ?, ?)', [
    leadId || null, vendedorId || null, String(titulo), String(fecha), notas || '',
  ]);
  return one('SELECT * FROM citas WHERE id = (SELECT last_insert_rowid())');
}

function updateCita(id, data) {
  const actual = getCitaById(id);
  if (!actual) return null;
  run('UPDATE citas SET titulo = ?, fecha = ?, notas = ?, estado = ?, vendedor_id = ? WHERE id = ?', [
    data.titulo !== undefined ? String(data.titulo) : actual.titulo,
    data.fecha !== undefined ? String(data.fecha) : actual.fecha,
    data.notas !== undefined ? String(data.notas) : actual.notas,
    data.estado !== undefined ? String(data.estado) : actual.estado,
    data.vendedorId !== undefined ? (data.vendedorId || null) : actual.vendedor_id,
    id,
  ]);
  return getCitaById(id);
}

function deleteCita(id) {
  run('DELETE FROM citas WHERE id = ?', [id]);
}

// --- Puente legacy → multicanal ---
// Sincroniza un lead (tabla legacy) hacia customers/conversations/timeline
// para que el inbox multicanal del admin refleje TODO el movimiento de WhatsApp.
// data: { direction: 'incoming'|'outgoing', body, media, fromNumber, toNumber, messageId }
function syncLeadToConversation(lead, data = {}) {
  try {
    if (!lead || !lead.id) return null;
    const phone = lead.customer_phone || '';

    // 1. Conversación existente ligada a este lead
    let conv = one('SELECT * FROM conversations WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [lead.id]);

    if (!conv) {
      // 2. Customer por canal whatsapp/teléfono (o crearlo)
      let customer = findCustomerByChannel('whatsapp', phone);
      if (!customer) {
        customer = createCustomer(lead.customer_name || 'Cliente', phone);
        linkChannelToCustomer(customer.id, 'whatsapp', phone, lead.customer_name || '');
      }
      const pct = PROGRESS_MAP[lead.etiqueta || 'sin_clasificar'] || 5;
      run('INSERT INTO conversations (channel, channel_conversation_id, customer_id, lead_id, assigned_to_id, status, etiqueta, progress_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['whatsapp', phone, customer.id, lead.id, lead.assigned_to_id || null, lead.status === 'cerrado' ? 'cerrado' : (lead.assigned_to_id ? 'asignado' : 'nuevo'), lead.etiqueta || 'sin_clasificar', pct]);
      conv = one('SELECT * FROM conversations WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [lead.id]);
    }
    if (!conv) return null;

    // 3. Mantener asignación/etiqueta/estado en espejo con el lead
    const eta = lead.etiqueta || conv.etiqueta || 'sin_clasificar';
    const convPct = PROGRESS_MAP[eta] || 5;
    run('UPDATE conversations SET assigned_to_id = ?, etiqueta = ?, progress_pct = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?', [
      lead.assigned_to_id || null,
      eta, convPct,
      lead.status === 'cerrado' ? 'cerrado' : (lead.assigned_to_id ? 'asignado' : 'nuevo'),
      conv.id,
    ]);

    // 4. Evento en el timeline (si hay mensaje)
    if (data.body || data.media) {
      const m = data.media || {};
      addTimelineEvent(conv.id, 'message', {
        channel: 'whatsapp',
        body: data.body || '',
        direction: data.direction || 'incoming',
        from_number: data.fromNumber || '',
        to_number: data.toNumber || '',
        media_type: m.media_type || null,
        media_id: m.media_id || null,
        media_mime: m.media_mime || null,
        media_filename: m.media_filename || null,
        metadata: data.messageId ? { legacy_message_id: data.messageId } : undefined,
      });
      const inc = data.direction === 'incoming' ? 1 : 0;
      run('UPDATE conversations SET last_message = ?, last_message_at = datetime(\'now\'), unread_count = CASE WHEN ? = 1 THEN COALESCE(unread_count,0) + 1 ELSE unread_count END, updated_at = datetime(\'now\') WHERE id = ?',
        [String(data.body || `[${(data.media || {}).media_type || 'media'}]`).slice(0, 200), inc, conv.id]);
    }
    return conv;
  } catch (e) {
    console.error('syncLeadToConversation:', e.message);
    return null;
  }
}

// --- Timeline ---
function addTimelineEvent(conversationId, eventType, data = {}) {
  const d = data || {};
  run(`
    INSERT INTO timeline (
      conversation_id, event_type, channel, body, direction,
      from_number, to_number, media_type, media_id, media_mime, media_filename, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    conversationId, eventType || 'message', d.channel || '', d.body || '', d.direction || 'incoming',
    d.from_number || '', d.to_number || '', d.media_type || null, d.media_id || null,
    d.media_mime || null, d.media_filename || null, d.metadata ? JSON.stringify(d.metadata) : '{}',
  ]);
  return one('SELECT * FROM timeline WHERE id = (SELECT last_insert_rowid())');
}

function getTimelineByConversation(conversationId) {
  return all('SELECT * FROM timeline WHERE conversation_id = ? ORDER BY created_at ASC, id ASC', [conversationId]);
}

function getLastMessageByConversation(conversationId) {
  return one('SELECT * FROM timeline WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', [conversationId]);
}

// --- Inbox unificado: legacy leads + nuevo schema ---
function getUnlinkedLeads() {
  return all(`
    SELECT l.*, v.nombre AS assigned_to_nombre
    FROM leads l
    LEFT JOIN vendedores v ON v.id = l.assigned_to_id
    WHERE l.id NOT IN (SELECT lead_id FROM conversations WHERE lead_id IS NOT NULL)
    ORDER BY l.updated_at DESC, l.id DESC
  `);
}

function getOrCreateConversationForLead(leadId) {
  const lead = one('SELECT * FROM leads WHERE id = ?', [leadId]);
  if (!lead) return null;
  let conv = one('SELECT * FROM conversations WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [lead.id]);
  if (conv) return getConversationById(conv.id);
  const phone = lead.customer_phone || '';
  let customer = findCustomerByChannel('whatsapp', phone);
  if (!customer) {
    customer = createCustomer(lead.customer_name || 'Cliente', phone);
    linkChannelToCustomer(customer.id, 'whatsapp', phone, lead.customer_name || '');
  }
  run('INSERT INTO conversations (channel, channel_conversation_id, customer_id, lead_id, assigned_to_id, status, etiqueta, last_message, last_message_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['whatsapp', phone, customer.id, lead.id, lead.assigned_to_id || null,
     lead.status === 'cerrado' ? 'cerrado' : (lead.assigned_to_id ? 'asignado' : 'nuevo'),
     lead.etiqueta || 'sin_clasificar',
     lead.last_message || '', lead.updated_at || lead.created_at, lead.updated_at || lead.created_at]);
  conv = one('SELECT * FROM conversations WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [lead.id]);
  if (!conv) return null;
  const msgs = getMessagesByLead(lead.id);
  msgs.forEach(m => {
    addTimelineEvent(conv.id, 'message', {
      channel: 'whatsapp',
      body: m.body || '',
      direction: m.direction || 'incoming',
      from_number: m.from_number || '',
      to_number: m.to_number || '',
      media_type: m.media_type || null,
      media_id: m.media_id || null,
      media_mime: m.media_mime || null,
      media_filename: m.media_filename || null,
      metadata: JSON.stringify({ legacy_message_id: m.id }),
    });
  });
  return getConversationById(conv.id);
}

function getUnifiedConversations({ busqueda, vendedorId, limite } = {}) {
  const lim = Number(limite) || 200;
  const convs = getConversations({ busqueda, vendedorId, limite: lim });
  const unified = convs.map(c => ({ ...c, _type: 'conversation' }));
  const leads = getUnlinkedLeads();
  leads.forEach(l => {
    if (busqueda) {
      const q = busqueda.toLowerCase();
      if (!(String(l.customer_name || '')).toLowerCase().includes(q) && !(String(l.customer_phone || '')).includes(q)) return;
    }
    if (vendedorId && Number(l.assigned_to_id) !== Number(vendedorId)) return;
    unified.push({
      _type: 'lead',
      id: l.id, channel: 'whatsapp',
      customer_name: l.customer_name, customer_phone: l.customer_phone,
      assigned_to_id: l.assigned_to_id, assigned_to_nombre: l.assigned_to_nombre,
      status: l.status, unread_count: l.unread_count || 0,
      last_message: l.last_message, last_message_at: l.updated_at || l.created_at,
      etiqueta: l.etiqueta, lead_id: l.id,
      updated_at: l.updated_at || l.created_at, created_at: l.created_at,
    });
  });
  unified.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
  return unified;
}

// --- Workflows (automatización IF/THEN) ---
function getAllWorkflows({ activo } = {}) {
  if (activo === true) return all('SELECT * FROM workflows WHERE activo = 1 ORDER BY id');
  if (activo === false) return all('SELECT * FROM workflows WHERE activo = 0 ORDER BY id');
  return all('SELECT * FROM workflows ORDER BY id');
}

function getWorkflowById(id) {
  return one('SELECT * FROM workflows WHERE id = ?', [id]);
}

function createWorkflow(data) {
  run('INSERT INTO workflows (nombre, activo, trigger_event, conditions, actions) VALUES (?, ?, ?, ?, ?)', [
    data.nombre, data.activo === false ? 0 : 1, data.trigger_event,
    JSON.stringify(data.conditions || []), JSON.stringify(data.actions || []),
  ]);
  return one('SELECT * FROM workflows WHERE id = (SELECT last_insert_rowid())');
}

function updateWorkflow(id, data) {
  const actual = getWorkflowById(id);
  if (!actual) return null;
  run('UPDATE workflows SET nombre = ?, activo = ?, trigger_event = ?, conditions = ?, actions = ? WHERE id = ?', [
    data.nombre !== undefined ? data.nombre : actual.nombre,
    data.activo !== undefined ? (data.activo ? 1 : 0) : actual.activo,
    data.trigger_event !== undefined ? data.trigger_event : actual.trigger_event,
    data.conditions !== undefined ? JSON.stringify(data.conditions) : actual.conditions,
    data.actions !== undefined ? JSON.stringify(data.actions) : actual.actions,
    id,
  ]);
  return getWorkflowById(id);
}

function deleteWorkflow(id) {
  run('DELETE FROM workflows WHERE id = ?', [id]);
}

function addWorkflowLog(workflowId, conversationId, triggerEvent, result) {
  run('INSERT INTO workflow_logs (workflow_id, conversation_id, trigger_event, result) VALUES (?, ?, ?, ?)', [
    workflowId, conversationId || null, triggerEvent, JSON.stringify(result || {}),
  ]);
}

function getWorkflowLogs(workflowId) {
  return all('SELECT * FROM workflow_logs WHERE workflow_id = ? ORDER BY created_at DESC, id DESC', [workflowId]);
}

// --- Tareas por lead ---
function getTareas(leadId) {
  return all('SELECT * FROM tareas WHERE lead_id = ? ORDER BY completada ASC, created_at DESC', [leadId]);
}

function addTarea(leadId, texto, fechaVencimiento) {
  run('INSERT INTO tareas (lead_id, texto, fecha_vencimiento) VALUES (?, ?, ?)', [leadId, texto, fechaVencimiento || '']);
  return one('SELECT * FROM tareas WHERE id = last_insert_rowid()');
}

function toggleTarea(id) {
  const t = one('SELECT completada FROM tareas WHERE id = ?', [id]);
  if (!t) return null;
  run('UPDATE tareas SET completada = ? WHERE id = ?', [t.completada ? 0 : 1, id]);
  return one('SELECT * FROM tareas WHERE id = ?', [id]);
}

function deleteTarea(id) {
  run('DELETE FROM tareas WHERE id = ?', [id]);
}

// --- Ubicaciones guardadas ---
function getUbicacionesGuardadas(vendedorId) {
  return all('SELECT * FROM ubicaciones_guardadas WHERE vendedor_id = ? ORDER BY created_at DESC', [vendedorId]);
}

function saveUbicacionGuardada(vendedorId, nombre, direccion, lat, lng) {
  run('INSERT INTO ubicaciones_guardadas (vendedor_id, nombre, direccion, lat, lng) VALUES (?, ?, ?, ?, ?)',
    [vendedorId, nombre, direccion || '', lat, lng]);
  return one('SELECT * FROM ubicaciones_guardadas WHERE id = last_insert_rowid()');
}

function deleteUbicacionGuardada(id) {
  run('DELETE FROM ubicaciones_guardadas WHERE id = ?', [id]);
}

// --- Cola de mensajes pendientes por ventana de 24h cerrada ---
// Un template de reactivación ENTREGADO no reabre la ventana de servicio de WhatsApp
// (solo lo hace una respuesta del cliente). El mensaje original del vendedor se guarda
// aquí y se envía cuando el webhook detecta esa respuesta (ver flushPendingOutbound).
function queuePendingOutbound(leadId, phone, body) {
  run('INSERT INTO pending_outbound (lead_id, phone, body) VALUES (?, ?, ?)', [leadId || null, phone, body]);
}
function getPendingOutbound(phone) {
  return all('SELECT * FROM pending_outbound WHERE phone = ? ORDER BY id ASC', [phone]);
}
function clearPendingOutbound(phone) {
  run('DELETE FROM pending_outbound WHERE phone = ?', [phone]);
}

module.exports = {
  initDB, getDB, saveLead, assignLeadToVendedor, saveMessage,
  getVendedoresActivos, getLeadById, getLeadByCustomerPhone,
  updateLeadStatus, setFirstResponse, resetLead,
  getLeads, getLeadCount, getLeadsSinRespuesta, incrementEscalation,
  marcarLeido, setUnreadCount, setLeadNombre, setLeadOrigen,
  addVendedor, getVendedores, setVendedorEstado, setVendedorTelefono, setVendedorNombre, setVendedorFoto, getVendedorMetricas, getVendedorByTelefono, getVendedorById, setVendedorPin,
  createUsuario, getUsuarioByEmail, getUsuarioById, getUsuarioByVendedorId, getUsuarios,
  countUsuarios, updateUsuarioPassword, updateUsuarioVendedorId,
  getLeadsByVendedorId, getArchivedLeadsByVendedorId, getMessagesByLead, getMessageById, updateMessageStatus, setMessageError,
  getTemplates, addTemplate, deleteTemplate,
  getVendedorTemplates, addVendedorTemplate, deleteVendedorTemplate, getStatsSemanales,
  getPropiedades, getPropiedadById, createPropiedad, updatePropiedad, deletePropiedad,
  savePushSubscription, getPushSubscriptionsByVendedor, deletePushSubscription, saveFcmToken,
  createDBSession, getDBSession, deleteDBSession, refreshSession, cleanExpiredSessions,
  getConfig, setConfig,
  getWATemplates, addWATemplate, deleteWATemplate, getWATemplateById, getWATemplateByName, upsertWATemplateFull, setWATemplateMapping,
  createCampaign, getCampaigns, getCampaignById, updateCampaignEstado, deleteCampaign,
  addCampaignRecipients, getCampaignRecipients, updateCampaignRecipient, getCampaignRecipientByWamid, recalcCampaignStats,
  isOptedOut, addOptout, getOptouts, countSegment, segmentLeads, getSegmentOptions,
  setLeadEtiqueta, updateLeadProgress, getNotasByLead, addNota, deleteNota, reassignLead,
  deleteVendedor, getAdminInbox, getAdminInboxStats,
  updateCustomerMessageTimestamp, isWindowOpen, getWindowExpiresAt,
  queuePendingOutbound, getPendingOutbound, clearPendingOutbound,
  // Nuevo schema multicanal
  createCustomer, getCustomerById, findCustomerByChannel,
  linkChannelToCustomer, getCustomerChannels, getCustomers, updateCustomer, deleteCustomer,
  getActiveConversationsByCustomer,
  createConversation, getConversationById, getConversationsByVendedorId,
  getConversationByChannelUser, updateConversationStatus, updateConversationTag,
  updateConversationPriority, getConversations, getConversationCount,
  addTimelineEvent, getTimelineByConversation, getLastMessageByConversation,
  syncLeadToConversation,
  getOrCreateConversationForLead, getUnifiedConversations,
  getCitas, getCitaById, createCita, updateCita, deleteCita,
  getAllWorkflows, getWorkflowById, createWorkflow, updateWorkflow, deleteWorkflow,
  addWorkflowLog, getWorkflowLogs,
  addReaction, removeReaction, getReactionsForMessage, getReactionsForMessages,
  editMessage, softDeleteMessage, pinLead, muteLead, clearLeadMessages,
  markMessageAsRead, markLeadMessagesAsRead,
  markDeletedForAll, markDeletedByClientWamid, getMessageByWamid,
  getDuplicateGroups, mergeLeads, closeOrphanConversations,
  getTareas, addTarea, toggleTarea, deleteTarea,
  getUbicacionesGuardadas, saveUbicacionGuardada, deleteUbicacionGuardada,
};
