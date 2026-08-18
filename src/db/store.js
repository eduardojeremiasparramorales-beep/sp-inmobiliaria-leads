const adapter = require('./adapter');
const { createNewTables } = require('./schema');
const { parseLocalDbTime, SQL_NOW_UTC, nowUTC, rangoUTCDeDiaLocal } = require('../utils/tiempo');

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
  createSchema();
  seedGaleria();
  return adapter.getDB();
}

// Todo el CREATE TABLE IF NOT EXISTS / ensureColumn de la app, separado de initDB()
// para Vid.a V2: aprovisionar un negocio nuevo es correr ESTA función (síncrona, sin
// abrir conexión — eso ya lo hace adapter.js solo, la primera vez que algo consulta
// dentro del tenantContext.run() de esa empresa) dentro del contexto del tenant nuevo.
// Es exactamente "correr initSchema tal cual sobre BD vacía" que pedía el plan.
function createSchema() {
  execSQL(`
    CREATE TABLE IF NOT EXISTS vendedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL UNIQUE,
      email TEXT DEFAULT '',
      estado TEXT DEFAULT 'activo',
      rol TEXT DEFAULT 'vendedor',
      two_fa INTEGER DEFAULT 0,
      total_leads INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      from_number TEXT NOT NULL,
      to_number TEXT NOT NULL,
      body TEXT NOT NULL,
      direction TEXT DEFAULT 'incoming',
      timestamp DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      nombre TEXT,
      rol TEXT DEFAULT 'vendedor',
      vendedor_id INTEGER,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      cuerpo TEXT NOT NULL,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
  // Payload/id del botón que pulsó el cliente en una plantilla (quick-reply o interactive).
  // Se guarda aparte del texto visible para que las automatizaciones puedan condicionar
  // sobre el botón exacto y no sobre la etiqueta traducible que ve el cliente.
  ensureColumn('messages', 'button_payload', 'TEXT');
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
  ensureColumn('leads', 'followup_task_at', 'DATETIME'); // guard del seguimiento automático 24h
  ensureColumn('leads', 'progress_pct', 'INTEGER DEFAULT 0');
  // Conversions API (B3): marca de "ya se envió este evento a Meta" por lead. Sin esto,
  // un vendedor moviendo el lead entre etapas (cita → interesado → cita otra vez)
  // dispararía el mismo evento repetido, inflando el conteo de conversiones que Meta usa
  // para optimizar la campaña — cada evento se manda como máximo una vez por lead.
  ensureColumn('leads', 'capi_cita_sent_at', 'DATETIME');
  ensureColumn('leads', 'capi_vendido_sent_at', 'DATETIME');
  ensureColumn('leads', 'temperatura', 'TEXT');            // calificación IA: caliente|tibio|frio
  ensureColumn('leads', 'temperatura_at', 'DATETIME');     // cuándo se calificó por última vez
  ensureColumn('leads', 'snoozed_until', 'DATETIME');      // posponer chat (C2): baja al fondo hasta esta hora
  ensureColumn('leads', 'awaiting_csat', 'INTEGER DEFAULT 0'); // esperando respuesta de encuesta de satisfacción
  ensureColumn('leads', 'cadencia_activa', 'INTEGER DEFAULT 0'); // inscrito en la cadencia de seguimiento (F3.3)
  ensureColumn('leads', 'cadencia_paso', 'INTEGER DEFAULT 0');   // índice del próximo paso a enviar
  ensureColumn('leads', 'cadencia_inicio', 'DATETIME');          // cuándo se inscribió (base para calcular offsets)
  ensureColumn('leads', 'cadencia_next_at', 'DATETIME');         // cuándo toca el próximo paso
  // Atribución estructurada de campaña (F1) — antes solo se guardaba el headline como texto
  // libre en `origen`; esto captura los IDs reales que Meta manda en `referral` para que
  // reportes pueda agrupar por anuncio/campaña real, no por un texto que puede repetirse.
  ensureColumn('leads', 'ad_id', 'TEXT');
  ensureColumn('leads', 'ad_name', 'TEXT');
  ensureColumn('leads', 'ad_source_url', 'TEXT');
  ensureColumn('leads', 'ctwa_clid', 'TEXT');
  // Asignación por zona geográfica: qué zona cubre cada asesor (CSV de slugs, vacío =
  // sin zona asignada, participa solo del fallback por menor carga) y qué zona se
  // resolvió para cada lead a partir del anuncio de Meta que lo trajo (ver zonas.js).
  ensureColumn('vendedores', 'zonas', 'TEXT');
  ensureColumn('leads', 'zona', 'TEXT');
  ensureColumn('leads', 'zona_fuente', 'TEXT'); // anuncio | manual | fallback
  ensureColumn('messages', 'edited_at', 'DATETIME');
  ensureColumn('messages', 'deleted_for_sender', 'INTEGER DEFAULT 0');
  ensureColumn('messages', 'deleted_for_all', 'INTEGER DEFAULT 0');
  ensureColumn('messages', 'deleted_by', 'TEXT');
  ensureColumn('messages', 'read_at', 'DATETIME');
  ensureColumn('messages', 'error_detail', 'TEXT');
  ensureColumn('messages', 'starred_at', 'DATETIME');       // mensajes destacados ⭐
  ensureColumn('messages', 'transcript', 'TEXT');           // transcripción IA de notas de voz
  ensureColumn('messages', 'translated_body', 'TEXT');      // traducción IA bajo demanda (cache)

  // --- Mensajes programados en SERVIDOR (salen aunque la app esté cerrada) ---
  execSQL(`
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      vendedor_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      send_at DATETIME NOT NULL,
      estado TEXT DEFAULT 'pendiente',
      intentos INTEGER DEFAULT 0,
      last_error TEXT,
      sent_at DATETIME,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_sched_pend ON scheduled_messages(estado, send_at)`);
  // Recordatorios de cita: 'texto' (mensaje normal) o 'template' (plantilla Meta, llega
  // aunque la ventana de 24h esté cerrada). template_* solo se usa en tipo='template'.
  ensureColumn('scheduled_messages', 'tipo', "TEXT DEFAULT 'texto'");
  ensureColumn('scheduled_messages', 'cita_id', 'INTEGER');
  ensureColumn('scheduled_messages', 'template_nombre', 'TEXT');   // nombre de la plantilla en Meta
  ensureColumn('scheduled_messages', 'template_idioma', "TEXT DEFAULT 'es'");
  ensureColumn('scheduled_messages', 'template_params', 'TEXT');   // JSON: valores resueltos {{clave}} → valor

  // --- Cadencia de seguimiento (F3.3): pasos configurables, día (acumulado desde
  // la inscripción) + mensaje. Se aplican a los leads inscritos vía scheduler. ---
  execSQL(`
    CREATE TABLE IF NOT EXISTS cadencia_pasos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden INTEGER NOT NULL,
      dia INTEGER NOT NULL,
      mensaje TEXT NOT NULL
    );
  `);
  // Seed por defecto (solo si está vacía): días 1, 3, 7, 15.
  try {
    const n = one('SELECT COUNT(*) AS c FROM cadencia_pasos');
    if (!n || !n.c) {
      const def = [
        [1, 1, 'Hola {{nombre}}, soy {{asesor}} de Leons Group 👋 ¿Pudiste revisar la información de los lotes? Con gusto te resuelvo cualquier duda.'],
        [2, 3, 'Hola {{nombre}}, te escribo para saber si sigues interesado/a en invertir en lote. Tenemos opciones que se ajustan a tu presupuesto. ¿Agendamos una llamada?'],
        [3, 7, '{{nombre}}, los lotes disponibles se están moviendo rápido. Si quieres asegurar el tuyo con la mejor ubicación, cuéntame y te doy prioridad.'],
        [4, 15, 'Hola {{nombre}}, última vez que te escribo por ahora 🙂 Si más adelante retomas la idea de invertir en tierra, aquí estaré para ayudarte. ¡Un abrazo!'],
      ];
      for (const [orden, dia, mensaje] of def) run('INSERT INTO cadencia_pasos (orden, dia, mensaje) VALUES (?, ?, ?)', [orden, dia, mensaje]);
    }
  } catch (e) { console.error('[CADENCIA] seed:', e.message); }
  execSQL(`CREATE INDEX IF NOT EXISTS idx_leads_cadencia ON leads(cadencia_activa, cadencia_next_at)`);

  // --- Chat interno del equipo (to_vendedor_id NULL = canal general) ---
  execSQL(`
    CREATE TABLE IF NOT EXISTS team_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_vendedor_id INTEGER NOT NULL,
      from_nombre TEXT DEFAULT '',
      to_vendedor_id INTEGER,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  execSQL(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      sender_number TEXT NOT NULL,
      direction TEXT DEFAULT 'incoming',
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
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
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
  // user_agent: capturado solo al crear la sesión (login), no se actualiza después —
  // suficiente para identificar el dispositivo en "Sesiones activas" sin escribir en
  // cada request. last_seen_at si se actualiza en cada request (con throttle, ver
  // touchSessionLastSeen) porque es lo que realmente responde "¿sigue viva de verdad?".
  ensureColumn('sessions', 'user_agent', 'TEXT');
  ensureColumn('sessions', 'last_seen_at', 'INTEGER');
  // Vid.a V3: la sesión de un negocio cliente sabe a qué tenant pertenece (la sesión
  // vive en la BD de ESA empresa; el middleware de index.js usa estas columnas para
  // resolver la conexión correcta a partir del token de la cookie).
  ensureColumn('sessions', 'empresa_id', 'INTEGER');
  ensureColumn('sessions', 'empresa_db_path', 'TEXT');

  execSQL(`
    CREATE TABLE IF NOT EXISTS wa_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      idioma TEXT DEFAULT 'es',
      params TEXT DEFAULT '',
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
  // Gestor de plantillas (creación/edición/borrado desde el CRM, no solo sync de lectura):
  ensureColumn('wa_templates', 'meta_template_id', 'TEXT');   // id real de Meta — clave para editar/borrar y para casar el webhook de estado
  ensureColumn('wa_templates', 'motivo_rechazo', 'TEXT');     // rejected_reason de Meta
  ensureColumn('wa_templates', 'estado_detalle', 'TEXT');     // other_info.title/description del webhook — texto humano del rechazo
  ensureColumn('wa_templates', 'calidad', 'TEXT');            // quality_score.score: GREEN/YELLOW/RED
  ensureColumn('wa_templates', 'spec_json', 'TEXT');          // borrador del constructor tal como lo escribió el admin (Meta normaliza los components al devolverlos)
  ensureColumn('wa_templates', 'creado_por', 'INTEGER');
  ensureColumn('wa_templates', 'creado_en_crm', 'INTEGER DEFAULT 0'); // 1 = nació en el CRM (editable/borrable), 0 = vino del sync
  ensureColumn('wa_templates', 'updated_at', 'DATETIME');
  ensureColumn('wa_templates', 'meta_sync_at', 'DATETIME');

  // Meta permite el MISMO name en varios idiomas (son plantillas distintas, con id
  // distinto) — el UNIQUE inline sobre `nombre` de la creación original de la tabla
  // pisaba una contra otra en upsertWATemplateFull. SQLite no permite quitar un UNIQUE
  // inline sin recrear la tabla; se hace una sola vez, guardado por la existencia del
  // índice compuesto, preservando los `id` (campaigns.template_id los referencia).
  try {
    const yaMigrado = all("PRAGMA index_list('wa_templates')").some(ix => ix.name === 'ux_wa_templates_nombre_idioma');
    if (!yaMigrado) {
      execSQL(`
        BEGIN;
        CREATE TABLE wa_templates_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          idioma TEXT DEFAULT 'es',
          params TEXT DEFAULT '',
          created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          categoria TEXT,
          estado TEXT DEFAULT 'APPROVED',
          componentes TEXT,
          variables TEXT,
          var_mapping TEXT,
          meta_template_id TEXT,
          motivo_rechazo TEXT,
          estado_detalle TEXT,
          calidad TEXT,
          spec_json TEXT,
          creado_por INTEGER,
          creado_en_crm INTEGER DEFAULT 0,
          updated_at DATETIME,
          meta_sync_at DATETIME
        );
        INSERT INTO wa_templates_new (id, nombre, idioma, params, created_at, categoria, estado, componentes, variables, var_mapping, meta_template_id, motivo_rechazo, estado_detalle, calidad, spec_json, creado_por, creado_en_crm, updated_at, meta_sync_at)
          SELECT id, nombre, idioma, params, created_at, categoria, estado, componentes, variables, var_mapping, meta_template_id, motivo_rechazo, estado_detalle, calidad, spec_json, creado_por, creado_en_crm, updated_at, meta_sync_at
          FROM wa_templates;
        DROP TABLE wa_templates;
        ALTER TABLE wa_templates_new RENAME TO wa_templates;
        CREATE UNIQUE INDEX ux_wa_templates_nombre_idioma ON wa_templates(nombre, idioma);
        COMMIT;
      `);
      console.log('[DB] wa_templates migrada: UNIQUE(nombre) → UNIQUE(nombre, idioma)');
    }
  } catch (e) {
    console.error('[DB] Error migrando wa_templates a UNIQUE(nombre, idioma):', e.message);
  }

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
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      started_at DATETIME,
      finished_at DATETIME
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_campaigns_estado ON campaigns(estado)`);
  // Por qué quedó pausada: manual (el admin le dio pausa) | daily_limit (tope diario
  // de Meta) | window (fuera de la ventana horaria configurada) | error (excepción
  // inesperada en el runner). El cron de resumePendingCampaigns() solo reintenta las
  // dos automáticas — nunca reactiva una pausa manual ni una en error sin revisar.
  ensureColumn('campaigns', 'pause_reason', 'TEXT');

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
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
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
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  // Contadores de uso mensual (sección "Uso" de Configuración) — un UPSERT barato por
  // evento en vez de contar filas de otras tablas en caliente cada vez que alguien abre
  // el panel. periodo = 'YYYY-MM', clave = 'mensajes_enviados' | 'mensajes_recibidos' |
  // 'generaciones_ia' | 'campanas_enviadas', etc.
  execSQL(`
    CREATE TABLE IF NOT EXISTS usage_counters (
      periodo TEXT NOT NULL,
      clave TEXT NOT NULL,
      valor INTEGER DEFAULT 0,
      PRIMARY KEY (periodo, clave)
    );
  `);

  execSQL(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendedor_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_vt_vendedor ON vendedor_templates(vendedor_id)`);

  execSQL(`CREATE TABLE IF NOT EXISTS galeria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL DEFAULT 'logos' CHECK (categoria IN ('fondos','logos','banners')),
    filename TEXT NOT NULL,
    activa INTEGER NOT NULL DEFAULT 1,
    orden INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_galeria_cat ON galeria(categoria)`);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_galeria_orden ON galeria(orden)`);

  createNewTables(adapter.getDB());

  // Estas dos van AQUÍ, no antes: apuntan a tablas que recién existen desde la línea
  // anterior (createNewTables). Antes de Vid.a V2 nunca se notó que estuvieran mal
  // ubicadas más arriba porque siempre corrían sobre una BD que ya tenía las tablas
  // de una corrida anterior — solo se rompe (en silencio, ensureColumn atrapa el
  // error) al provisionar un negocio nuevo desde cero por primera vez.
  ensureColumn('campanas_sp_projects', 'proyecto_id', 'INTEGER'); // vínculo con proyectos reales del CRM (F2)
  ensureColumn('conversations', 'last_customer_message_at', 'DATETIME');
  ensureColumn('comisiones', 'notas', "TEXT DEFAULT ''");
  ensureColumn('comisiones', 'updated_at', 'DATETIME');
  ensureColumn('vendedores', 'chat_bg', "TEXT DEFAULT 'leones'"); // fondo de chat — leones por defecto, ver /api/mi-chat-bg

  // Automatizaciones — editor visual (nodos + aristas). trigger_event/conditions/
  // actions (el formato lineal viejo) se conservan intactos; `graph` es la fuente de
  // verdad para el motor v2 una vez migrado — ver migrateWorkflowsToGraph().
  ensureColumn('workflows', 'graph', 'TEXT');
  ensureColumn('workflows', 'updated_at', 'DATETIME');
  // Dueño del flujo: NULL = flujo global de la empresa (admin/jefe); con valor = flujo
  // privado de ese asesor, que solo corre sobre los leads asignados a él.
  ensureColumn('workflows', 'vendedor_id', 'INTEGER');
  execSQL(`
    CREATE TABLE IF NOT EXISTS workflow_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      node_id TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '{}',
      run_at DATETIME NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (workflow_id) REFERENCES workflows(id)
    )
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_workflow_jobs_due ON workflow_jobs(estado, run_at)`);
  migrateWorkflowsToGraph();

  // Puente legacy → multicanal: cada conversación puede apuntar a su lead. En BDs
  // nuevas la columna y el índice único (idx_conversations_lead_id, ver schema.js)
  // ya vienen en el CREATE TABLE; esto es el respaldo idempotente para BDs existentes
  // que arrancaron antes de ese cambio y no tienen ni la columna ni el índice.
  ensureColumn('conversations', 'lead_id', 'INTEGER');
  // Intento de blindaje en BDs existentes: si ya hay lead_id duplicados (arrastre de
  // la doble escritura frágil), la creación falla y queda logueado — se resuelve solo
  // corriendo scripts/reset-leads.js o deduplicando antes del próximo arranque.
  try {
    execSQL(`CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id) WHERE lead_id IS NOT NULL`);
  } catch (e) {
    console.warn('[SCHEMA] No se pudo crear el índice único de conversations.lead_id (hay duplicados pendientes de limpiar):', e.message);
  }
  // Defensivo: en DBs creadas antes de que `progress_pct` estuviera en el CREATE
  // TABLE de schema.js, la columna no existe y syncLeadToConversation() falla
  // silenciosamente (try/catch) en cada INSERT — ninguna conversación se crea.
  ensureColumn('conversations', 'progress_pct', 'INTEGER DEFAULT 5');

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
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_pending_outbound_phone ON pending_outbound(phone)`);
  // Fila de `messages` que representa este envío en el chat (creada con status
  // 'pending'). El flush la actualiza a 'sent' en vez de insertar una burbuja nueva.
  ensureColumn('pending_outbound', 'message_id', 'INTEGER');
  // Intentos de flush fallidos: si el reenvío falla, la fila se conserva y se cuenta.
  ensureColumn('pending_outbound', 'intentos', 'INTEGER DEFAULT 0');

  // Tareas: la tabla existe en schema.js (lead_id, texto, fecha_vencimiento, completada).
  // Columnas nuevas para tareas por vendedor + recordatorios con push:
  ensureColumn('tareas', 'vendedor_id', 'INTEGER');
  ensureColumn('tareas', 'vence_at', 'TEXT'); // ISO — si está, es recordatorio con push
  ensureColumn('tareas', 'notificada', 'INTEGER DEFAULT 0');
  execSQL(`CREATE INDEX IF NOT EXISTS idx_tareas_vendedor ON tareas(vendedor_id, completada)`);

  // Texto libre "Acerca de" del perfil del vendedor (antes vivía solo en localStorage)
  ensureColumn('vendedores', 'about', 'TEXT');
  // Última posición conocida del asesor (espejo del último punto de
  // vendedor_posiciones) y sello del consentimiento de rastreo: sin ese sello el
  // backend rechaza cualquier posición, para que el permiso no dependa solo de la UI.
  // Coordenadas para el mapa del equipo. Los leads las obtienen geocodificando su
  // ciudad/dirección (services/geocode.js); proyectos y zonas se marcan a mano desde
  // sus fichas. `geocode_at` distingue "sin geocodificar todavía" de "no se pudo".
  ensureColumn('leads', 'lat', 'REAL');
  ensureColumn('leads', 'lng', 'REAL');
  ensureColumn('leads', 'geocode_at', 'DATETIME');
  // 'ubicacion' = el cliente compartió su pin por WhatsApp (exacta) · 'geocodificado' =
  // deducida de su ciudad (aproximada, sirve para agrupar pero no para ir a tocar timbre).
  // La distinción se muestra en el mapa: no es lo mismo para un asesor que va a moverse.
  ensureColumn('leads', 'coord_fuente', 'TEXT');
  // Prefiltro geográfico del mapa (caja antes de calcular distancias).
  execSQL('CREATE INDEX IF NOT EXISTS idx_leads_coords ON leads(lat, lng)');
  ensureColumn('proyectos', 'lat', 'REAL');
  ensureColumn('proyectos', 'lng', 'REAL');
  ensureColumn('zonas', 'centro_lat', 'REAL');
  ensureColumn('zonas', 'centro_lng', 'REAL');
  ensureColumn('zonas', 'radio_km', 'REAL');
  ensureColumn('vendedores', 'last_lat', 'REAL');
  ensureColumn('vendedores', 'last_lng', 'REAL');
  ensureColumn('vendedores', 'last_pos_at', 'DATETIME');
  ensureColumn('vendedores', 'ubicacion_consentida_at', 'DATETIME');
  ensureColumn('vendedores', 'two_fa', 'INTEGER DEFAULT 0');

  // Centro de notificaciones persistente (vendedor_id = 0 → admins)
  execSQL(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendedor_id INTEGER NOT NULL DEFAULT 0,
      tipo TEXT NOT NULL DEFAULT 'info',
      titulo TEXT NOT NULL,
      cuerpo TEXT DEFAULT '',
      lead_id INTEGER,
      leida INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_notif_vendedor ON notifications(vendedor_id, leida)`);

  // SP Feed — contenido multimedia de marca (reels, fotos, enlaces) publicado
  // por admin/supervisor. Los archivos subidos viven en data/feed/ (volumen
  // persistente del contenedor) y se sirven por /api/supervisor/feed/media/:id.
  execSQL(`
    CREATE TABLE IF NOT EXISTS sp_feed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      tipo TEXT NOT NULL DEFAULT 'imagen',
      categoria TEXT NOT NULL DEFAULT 'cultura',
      media_url TEXT DEFAULT '',
      media_path TEXT DEFAULT '',
      media_mime TEXT DEFAULT '',
      media_filename TEXT DEFAULT '',
      autor TEXT DEFAULT '',
      creado_por INTEGER,
      activo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
  execSQL('CREATE INDEX IF NOT EXISTS idx_sp_feed_fecha ON sp_feed(activo, created_at)');

  // Chat de equipo: columnas nuevas para directos monitoreados y menciones.
  // (to_vendedor_id ya existía: NULL = canal general; un id = mensaje directo)
  ensureColumn('team_messages', 'mentions', 'TEXT');      // JSON de vendedor_ids mencionados
  ensureColumn('team_messages', 'read_at', 'DATETIME');   // lectura del destinatario en directos
  ensureColumn('team_messages', 'lead_ref', 'INTEGER');   // lead compartido como tarjeta
  ensureColumn('team_messages', 'reply_to_id', 'INTEGER'); // respuesta a otro mensaje
  ensureColumn('team_messages', 'deleted', 'INTEGER');     // soft delete (0=no, 1=borrado)
  ensureColumn('team_messages', 'deleted_by', 'TEXT');     // quién borró
  ensureColumn('team_messages', 'media_type', 'TEXT');     // image, audio, video, document
  ensureColumn('team_messages', 'media_url', 'TEXT');      // URL/base64 del media adjunto
  ensureColumn('team_messages', 'pinned_at', 'DATETIME');  // mensaje fijado
  ensureColumn('team_messages', 'pinned_by', 'INTEGER');   // quién fijó (0=admin)
  ensureColumn('team_messages', 'edited_at', 'DATETIME');  // mensaje editado
  execSQL(`CREATE INDEX IF NOT EXISTS idx_team_conv ON team_messages(from_vendedor_id, to_vendedor_id, id)`);

  // Reacciones del chat interno
  execSQL(`
    CREATE TABLE IF NOT EXISTS team_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      from_vendedor_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(message_id, emoji, from_vendedor_id)
    );
  `);

  // Presencia de asesores (heartbeat)
  execSQL(`
    CREATE TABLE IF NOT EXISTS team_presence (
      vendedor_id INTEGER PRIMARY KEY,
      last_heartbeat DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  // Rastro de ubicación del asesor durante su jornada. Cada fila es un punto; la
  // ÚLTIMA posición se duplica en `vendedores` (last_lat/last_lng/last_pos_at) para
  // que el mapa cargue sin recorrer el histórico. Se purga a los 30 días: un rastro
  // GPS es dato personal y conservarlo sin límite no aporta nada a la operación.
  execSQL(`
    CREATE TABLE IF NOT EXISTS vendedor_posiciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendedor_id INTEGER NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      precision REAL,
      bateria INTEGER,
      ts DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_vpos_vendedor_ts ON vendedor_posiciones(vendedor_id, ts)`);

  // Insignias del asesor (gamificación con datos reales; otorgadas por job diario)
  execSQL(`
    CREATE TABLE IF NOT EXISTS insignias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendedor_id INTEGER NOT NULL,
      codigo TEXT NOT NULL,
      otorgada_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(vendedor_id, codigo)
    );
  `);
  execSQL(`CREATE INDEX IF NOT EXISTS idx_insignias_vendedor ON insignias(vendedor_id)`);
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
  // created_at explícito por la misma razón que en saveMessage()/saveTeamMessage(): no
  // confiar en el DEFAULT de la columna si la tabla en producción es más vieja que el
  // esquema actual (CREATE TABLE IF NOT EXISTS nunca lo actualiza retroactivamente).
  try {
    run('INSERT INTO leads (customer_phone, customer_name, first_message, last_message, unread_count, last_customer_message_at, etiqueta, progress_pct, created_at) VALUES (?, ?, ?, ?, 1, strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'), \'sin_clasificar\', 5, strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'))', [phone, customerName || 'Cliente', messageBody, messageBody]);
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

  const r = one('SELECT id FROM leads WHERE id = last_insert_rowid()');
  if (!r || !r.id) {
    throw new Error('No se pudo obtener ID del lead después de INSERT');
  }
  return { leadId: r.id, isNew: true, wasClosed: false };
}

function reopenOrUpdateLead(leadId, wasClosed, messageBody) {
  if (wasClosed) {
    run('UPDATE leads SET status = ?, first_response_at = NULL, escalation_level = 0, messages_count = messages_count + 1, last_message = ?, unread_count = COALESCE(unread_count,0) + 1, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'), last_customer_message_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', ['asignado', messageBody, leadId]);
  } else {
    run('UPDATE leads SET messages_count = messages_count + 1, last_message = ?, unread_count = COALESCE(unread_count,0) + 1, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'), last_customer_message_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [messageBody, leadId]);
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

  const prev = one('SELECT assigned_to_id, customer_name FROM leads WHERE id = ?', [leadId]);
  const esAsignacionInicial = !prev || prev.assigned_to_id == null || Number(prev.assigned_to_id) === 0;

  run('UPDATE leads SET assigned_to_id = ?, assigned_to_phone = ?, status = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [vendedor.id, vendedor.telefono, 'asignado', leadId]);
  run('UPDATE vendedores SET total_leads = total_leads + 1 WHERE id = ?', [vendedor.id]);

  // SP Feed: publicar "nuevo lead asignado" solo en la asignación inicial (las
  // reasignaciones las publican sus propios endpoints). Carga lazy para no
  // crear ciclo store ↔ activity en el arranque.
  if (esAsignacionInicial) {
    try {
      require('../services/activity').logLeadAsignado({
        leadId, vendedor,
        customerName: prev ? prev.customer_name : 'Cliente',
      });
    } catch (e) { console.error('[ASSIGN] feed log error:', e.message); }
  }
}

function saveMessage(leadId, from, to, body, direction, media, replyToId, wamid, status) {
  const m = media || {};
  const st = status || (direction === 'outgoing' ? 'sent' : null);
  // `timestamp` se fija EXPLÍCITAMENTE aquí, en UTC con sufijo 'Z' (nunca ambiguo), sin
  // depender del DEFAULT de la columna — CREATE TABLE IF NOT EXISTS nunca reescribe una
  // tabla que ya existe, así que el DEFAULT real de producción puede no coincidir con lo
  // que diga el CREATE de este archivo. Ver docs/AUDITORIA_2026-08.md secciones 1.1/1.7.
  run('INSERT INTO messages (lead_id, from_number, to_number, body, direction, media_type, media_id, media_mime, media_filename, reply_to_id, wamid, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'))', [
    leadId, from, to, body, direction,
    m.media_type || null, m.media_id || null, m.media_mime || null, m.media_filename || null,
    replyToId ? Number(replyToId) : null, wamid || null, st,
  ]);
  run('UPDATE leads SET last_message = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [String(body).slice(0, 255), leadId]);
  // Incrementar unread_count para mensajes entrantes del cliente
  if (direction === 'incoming') {
    run('UPDATE leads SET unread_count = COALESCE(unread_count,0) + 1 WHERE id = ?', [leadId]);
  }
  const r = one('SELECT id FROM messages WHERE id = last_insert_rowid()');
  return r ? r.id : null;
}

function updateMessageStatus(wamid, status) {
  run('UPDATE messages SET status = ? WHERE wamid = ?', [status, wamid]);
}

function setMessageError(wamid, detail) {
  run('UPDATE messages SET error_detail = ? WHERE wamid = ?', [detail, wamid]);
}

// --- Mensajes en espera de que se reabra la ventana de 24h ---
// Estos NO tienen wamid todavía (no salieron a Meta), así que se direccionan por id.
function markMessageSent(messageId, wamid) {
  run("UPDATE messages SET wamid = ?, status = 'sent', error_detail = NULL WHERE id = ?", [wamid || null, messageId]);
}
function setMessageErrorById(messageId, detail) {
  run('UPDATE messages SET error_detail = ? WHERE id = ?', [detail, messageId]);
}

// Marca un mensaje entrante como "el cliente pulsó este botón de la plantilla".
// El texto visible ya lo guardó saveMessage vía routeReply; esto solo anota el
// payload/id, que es el identificador estable con el que trabajan los workflows.
function setMessageButtonPayload(wamid, payload) {
  if (!wamid || !payload) return;
  run('UPDATE messages SET button_payload = ? WHERE wamid = ?', [String(payload), wamid]);
}

function markMessageAsRead(messageId) {
  run("UPDATE messages SET status = 'read', read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status != 'read'", [messageId]);
}

function markLeadMessagesAsRead(leadId, fromNumber) {
  run("UPDATE messages SET status = 'read', read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lead_id = ? AND from_number = ? AND (status IS NULL OR status != 'read')", [leadId, fromNumber]);
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
  run("UPDATE messages SET body = ?, edited_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [String(newBody).trim(), messageId]);
}

// --- Mensajes destacados ⭐ ---
function toggleStarMessage(messageId) {
  const m = one('SELECT starred_at FROM messages WHERE id = ?', [messageId]);
  if (!m) return null;
  const nuevo = !m.starred_at;
  run(nuevo
    ? "UPDATE messages SET starred_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    : 'UPDATE messages SET starred_at = NULL WHERE id = ?', [messageId]);
  return nuevo;
}
function getStarredMessages(vendedorId, isAdmin) {
  return all(`
    SELECT m.id, m.lead_id, m.body, m.direction, m.timestamp, m.media_type, m.starred_at,
           l.customer_name, l.customer_phone
    FROM messages m JOIN leads l ON l.id = m.lead_id
    WHERE m.starred_at IS NOT NULL AND (? OR l.assigned_to_id = ?)
    ORDER BY m.starred_at DESC LIMIT 100`, [isAdmin ? 1 : 0, vendedorId || 0]);
}

// --- Búsqueda global de mensajes (por vendedor; admin ve todos) ---
function searchMessages(q, vendedorId, isAdmin) {
  const term = '%' + String(q).replace(/[\\%_]/g, c => '\\' + c) + '%';
  return all(`
    SELECT m.id, m.lead_id, m.body, m.direction, m.timestamp, l.customer_name
    FROM messages m JOIN leads l ON l.id = m.lead_id
    WHERE (? OR l.assigned_to_id = ?)
      AND COALESCE(m.deleted_for_all,0) = 0 AND COALESCE(m.deleted_for_sender,0) = 0
      AND m.body LIKE ? ESCAPE '\\'
    ORDER BY m.timestamp DESC LIMIT 50`, [isAdmin ? 1 : 0, vendedorId || 0, term]);
}

// --- IA: transcripción y traducción ---
function setTranscript(messageId, text) {
  run('UPDATE messages SET transcript = ? WHERE id = ?', [String(text).slice(0, 4000), messageId]);
}
function setTranslation(messageId, text) {
  run('UPDATE messages SET translated_body = ? WHERE id = ?', [String(text).slice(0, 4000), messageId]);
}

// --- Mensajes programados en servidor ---
function createScheduled(leadId, vendedorId, body, sendAt) {
  run('INSERT INTO scheduled_messages (lead_id, vendedor_id, body, send_at) VALUES (?, ?, ?, ?)',
    [leadId, vendedorId, body, sendAt]);
  const r = one('SELECT id FROM scheduled_messages WHERE id = last_insert_rowid()');
  return r ? r.id : null;
}
function getScheduledByVendedor(vendedorId, isAdmin) {
  return all(`
    SELECT s.*, l.customer_name FROM scheduled_messages s
    JOIN leads l ON l.id = s.lead_id
    WHERE (? OR s.vendedor_id = ?) AND s.estado = 'pendiente'
    ORDER BY s.send_at ASC LIMIT 100`, [isAdmin ? 1 : 0, vendedorId || 0]);
}
function getScheduledById(id) {
  return one('SELECT * FROM scheduled_messages WHERE id = ?', [id]);
}
function getScheduledDue() {
  return all(`SELECT * FROM scheduled_messages WHERE estado = 'pendiente' AND send_at <= datetime('now') ORDER BY send_at ASC LIMIT 20`);
}
function updateScheduled(id, fields) {
  const sets = [], vals = [];
  for (const [k, v] of Object.entries(fields)) { sets.push(`${k} = ?`); vals.push(v); }
  if (!sets.length) return;
  vals.push(id);
  run(`UPDATE scheduled_messages SET ${sets.join(', ')} WHERE id = ?`, vals);
}

// --- Chat interno del equipo ---
// toVendedorId NULL/undefined = canal general; un id = mensaje directo (monitoreado por admin).
function saveTeamMessage(fromVendedorId, fromNombre, body, opts = {}) {
  const to = opts.toVendedorId != null ? Number(opts.toVendedorId) : null;
  const mentions = Array.isArray(opts.mentions) && opts.mentions.length ? JSON.stringify(opts.mentions) : null;
  const leadRef = opts.leadRef != null ? Number(opts.leadRef) : null;
  const replyTo = opts.replyToId != null ? Number(opts.replyToId) : null;
  const mediaType = opts.mediaType || null;
  const mediaUrl = opts.mediaUrl || null;
  // created_at explícito por la misma razón que en saveMessage() — no confiar en el
  // DEFAULT de la columna si la tabla en producción es más vieja que el esquema actual.
  run('INSERT INTO team_messages (from_vendedor_id, from_nombre, to_vendedor_id, body, mentions, lead_ref, reply_to_id, media_type, media_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'))',
    [fromVendedorId, fromNombre || '', to, String(body).slice(0, 2000), mentions, leadRef, replyTo, mediaType, mediaUrl]);
  return one('SELECT tm.*, rt.body AS reply_to_body, rt.from_nombre AS reply_to_from FROM team_messages tm LEFT JOIN team_messages rt ON rt.id = tm.reply_to_id ORDER BY tm.id DESC LIMIT 1');
}
// Canal general (to_vendedor_id IS NULL)
function getTeamMessages(beforeId, limit) {
  const lim = Math.min(Number(limit) || 50, 500);
  const base = `SELECT tm.*, rt.body AS reply_to_body, rt.from_nombre AS reply_to_from, rt.deleted AS reply_deleted
    FROM team_messages tm LEFT JOIN team_messages rt ON rt.id = tm.reply_to_id WHERE tm.to_vendedor_id IS NULL AND (tm.deleted IS NULL OR tm.deleted = 0)`;
  if (beforeId) {
    return all(base + ' AND tm.id < ? ORDER BY tm.id DESC LIMIT ?', [beforeId, lim]).reverse();
  }
  return all(base + ' ORDER BY tm.id DESC LIMIT ?', [lim]).reverse();
}
// Conversación directa entre dos asesores (ambos sentidos)
function getTeamDirectMessages(vendedorA, vendedorB, beforeId, limit) {
  const lim = Math.min(Number(limit) || 60, 500);
  const base = `SELECT tm.*, rt.body AS reply_to_body, rt.from_nombre AS reply_to_from, rt.deleted AS reply_deleted
     FROM team_messages tm LEFT JOIN team_messages rt ON rt.id = tm.reply_to_id
     WHERE ((tm.from_vendedor_id = ? AND tm.to_vendedor_id = ?) OR (tm.from_vendedor_id = ? AND tm.to_vendedor_id = ?))
       AND (tm.deleted IS NULL OR tm.deleted = 0)`;
  if (beforeId) {
    return all(base + ` AND tm.id < ? ORDER BY tm.id DESC LIMIT ?`,
      [vendedorA, vendedorB, vendedorB, vendedorA, beforeId, lim]
    ).reverse();
  }
  return all(base + ` ORDER BY tm.id DESC LIMIT ?`,
    [vendedorA, vendedorB, vendedorB, vendedorA, lim]
  ).reverse();
}
// Lista de hilos directos de un asesor (con el otro interlocutor y último mensaje)
function getTeamDirectThreads(vendedorId) {
  return all(
    `SELECT tm.*,
            CASE WHEN tm.from_vendedor_id = ? THEN tm.to_vendedor_id ELSE tm.from_vendedor_id END AS otro_id
     FROM team_messages tm
     WHERE tm.to_vendedor_id IS NOT NULL AND (tm.from_vendedor_id = ? OR tm.to_vendedor_id = ?)
     ORDER BY tm.id DESC`,
    [vendedorId, vendedorId, vendedorId]
  );
}
function markTeamDirectRead(vendedorId, otroId) {
  // Devuelve los from_vendedor_id de los mensajes que se marcaron como leídos,
  // para poder emitir SSE `equipo_read` al emisor y que vea ✓✓ en tiempo real.
  const unread = all("SELECT DISTINCT from_vendedor_id FROM team_messages WHERE to_vendedor_id = ? AND from_vendedor_id = ? AND read_at IS NULL", [vendedorId, otroId]);
  run("UPDATE team_messages SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE to_vendedor_id = ? AND from_vendedor_id = ? AND read_at IS NULL", [vendedorId, otroId]);
  return unread.map(r => r.from_vendedor_id);
}
function markTeamGeneralRead(vendedorId, lastMessageId) {
  const r = one('SELECT value FROM config WHERE key = ?', ['eq_general_last_read_' + vendedorId]);
  if (r) run('UPDATE config SET value = ? WHERE key = ?', [String(lastMessageId), 'eq_general_last_read_' + vendedorId]);
  else run('INSERT INTO config (key, value) VALUES (?, ?)', ['eq_general_last_read_' + vendedorId, String(lastMessageId)]);
}
function getTeamGeneralLastRead(vendedorId) {
  const r = one('SELECT value FROM config WHERE key = ?', ['eq_general_last_read_' + vendedorId]);
  return r ? Number(r.value) || 0 : 0;
}
function countTeamUnread(vendedorId) {
  const r = one('SELECT COUNT(*) AS n FROM team_messages WHERE to_vendedor_id = ? AND read_at IS NULL', [vendedorId]);
  return r ? Number(r.n) : 0;
}
// Monitoreo admin: TODAS las conversaciones (general + directas), solo lectura
function getAllTeamMessagesForAdmin(limit) {
  const lim = Math.min(Number(limit) || 200, 500);
  return all(
    `SELECT tm.*, vf.nombre AS from_nombre_full, vt.nombre AS to_nombre
     FROM team_messages tm
     LEFT JOIN vendedores vf ON tm.from_vendedor_id = vf.id
     LEFT JOIN vendedores vt ON tm.to_vendedor_id = vt.id
     ORDER BY tm.id DESC LIMIT ?`,
    [lim]
  ).reverse();
}

// Admin: todas las conversaciones del chat interno (general + DMs) con metadata
function getAdminTeamConversations() {
  // msg_count/count son "no leídos para el admin (vendedor 0)", no el total histórico —
  // antes contaban TODOS los mensajes y el badge parecía tener cientos de pendientes
  // permanentemente.
  const lastReadGeneral = getTeamGeneralLastRead(0);
  const generalLast = one(
    `SELECT tm.*, (SELECT COUNT(*) FROM team_messages WHERE to_vendedor_id IS NULL AND id > ?) AS msg_count
     FROM team_messages tm WHERE tm.to_vendedor_id IS NULL ORDER BY tm.id DESC LIMIT 1`,
    [lastReadGeneral]
  );
  const dms = all(
    `SELECT tm.*,
            CASE WHEN tm.from_vendedor_id = 0 THEN tm.to_vendedor_id
                 WHEN tm.to_vendedor_id = 0 THEN tm.from_vendedor_id
                 ELSE MIN(tm.from_vendedor_id, tm.to_vendedor_id) END AS pair_a,
            CASE WHEN tm.from_vendedor_id = 0 THEN tm.from_vendedor_id
                 WHEN tm.to_vendedor_id = 0 THEN tm.to_vendedor_id
                 ELSE MAX(tm.from_vendedor_id, tm.to_vendedor_id) END AS pair_b,
            vf.nombre AS from_nombre_full,
            vt.nombre AS to_nombre
     FROM team_messages tm
     LEFT JOIN vendedores vf ON tm.from_vendedor_id = vf.id
     LEFT JOIN vendedores vt ON tm.to_vendedor_id = vt.id
     WHERE tm.to_vendedor_id IS NOT NULL
     ORDER BY tm.id DESC`
  );
  const dmMap = {};
  dms.forEach(m => {
    const key = `${m.pair_a}_${m.pair_b}`;
    if (!dmMap[key]) {
      dmMap[key] = {
        pair: [m.pair_a, m.pair_b],
        names: [m.from_nombre_full, m.to_nombre].filter(Boolean),
        last_message: m.body,
        last_at: m.created_at,
        last_from: m.from_nombre_full,
        count: 0 // no leídos PARA EL ADMIN — queda en 0 en un DM asesor↔asesor (el admin no es destinatario ahí)
      };
    }
    if (Number(m.to_vendedor_id) === 0 && !m.read_at) dmMap[key].count++;
  });
  return {
    general: generalLast ? {
      last_message: generalLast.body,
      last_from: generalLast.from_nombre,
      last_at: generalLast.created_at,
      msg_count: generalLast.msg_count || 0
    } : { last_message: null, msg_count: 0 },
    dms: Object.values(dmMap)
  };
}

// --- Reacciones del chat interno ---
function saveTeamReaction(messageId, emoji, fromVendedorId) {
  try {
    run('INSERT OR IGNORE INTO team_reactions (message_id, emoji, from_vendedor_id) VALUES (?, ?, ?)',
      [messageId, emoji, fromVendedorId]);
    return true;
  } catch (e) { return false; }
}
function removeTeamReaction(messageId, emoji, fromVendedorId) {
  run('DELETE FROM team_reactions WHERE message_id = ? AND emoji = ? AND from_vendedor_id = ?',
    [messageId, emoji, fromVendedorId]);
}
function getTeamReactionsForMessages(messageIds) {
  if (!messageIds || !messageIds.length) return {};
  const ids = messageIds.map(Number).filter(Boolean);
  if (!ids.length) return {};
  const placeholders = ids.map(() => '?').join(',');
  const rows = all(`SELECT * FROM team_reactions WHERE message_id IN (${placeholders})`, ids);
  const map = {};
  for (const r of rows) {
    if (!map[r.message_id]) map[r.message_id] = [];
    map[r.message_id].push(r);
  }
  return map;
}

// --- Delete de team messages ---
function deleteTeamMessage(messageId, byName, mode) {
  if (mode === 'everyone') {
    run('UPDATE team_messages SET deleted = 1, deleted_by = ? WHERE id = ?', [byName || '', messageId]);
  }
  return one('SELECT * FROM team_messages WHERE id = ?', [messageId]);
}

// --- Pin de mensajes del equipo ---
function pinTeamMessage(messageId, vendedorId) {
  const msg = one('SELECT * FROM team_messages WHERE id = ?', [messageId]);
  if (!msg) return null;
  if (msg.pinned_at) {
    run('UPDATE team_messages SET pinned_at = NULL, pinned_by = NULL WHERE id = ?', [messageId]);
    return { pinned: false };
  }
  run("UPDATE team_messages SET pinned_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), pinned_by = ? WHERE id = ?", [vendedorId || 0, messageId]);
  return { pinned: true };
}
function getPinnedTeamMessage(channel) {
  if (channel === 'general') {
    return one('SELECT tm.*, vf.nombre AS from_nombre_full FROM team_messages tm LEFT JOIN vendedores vf ON tm.from_vendedor_id = vf.id WHERE tm.to_vendedor_id IS NULL AND tm.pinned_at IS NOT NULL AND (tm.deleted IS NULL OR tm.deleted = 0) ORDER BY tm.pinned_at DESC LIMIT 1');
  }
  // DM: channel = "a_b" where a and b are vendedor IDs
  if (channel && channel.includes('_')) {
    const [a, b] = channel.split('_').map(Number);
    return one('SELECT tm.*, vf.nombre AS from_nombre_full FROM team_messages tm LEFT JOIN vendedores vf ON tm.from_vendedor_id = vf.id WHERE tm.to_vendedor_id IS NOT NULL AND ((tm.from_vendedor_id = ? AND tm.to_vendedor_id = ?) OR (tm.from_vendedor_id = ? AND tm.to_vendedor_id = ?)) AND tm.pinned_at IS NOT NULL AND (tm.deleted IS NULL OR tm.deleted = 0) ORDER BY tm.pinned_at DESC LIMIT 1', [a, b, b, a]);
  }
  return null;
}

// --- Editar mensaje del equipo ---
function editTeamMessage(messageId, vendedorId, newBody) {
  const msg = one('SELECT * FROM team_messages WHERE id = ?', [messageId]);
  if (!msg) return null;
  if (Number(msg.from_vendedor_id) !== vendedorId && vendedorId !== 0) return null; // solo autor o admin
  run("UPDATE team_messages SET body = ?, edited_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [String(newBody).slice(0, 2000), messageId]);
  return one('SELECT tm.*, rt.body AS reply_to_body, rt.from_nombre AS reply_to_from FROM team_messages tm LEFT JOIN team_messages rt ON rt.id = tm.reply_to_id WHERE tm.id = ?', [messageId]);
}

// --- Buscar mensajes del equipo ---
function searchTeamMessages(query, vendedorId, channel) {
  if (!query || !String(query).trim()) return [];
  const q = '%' + String(query).trim() + '%';
  let base = `SELECT tm.*, vf.nombre AS from_nombre_full FROM team_messages tm LEFT JOIN vendedores vf ON tm.from_vendedor_id = vf.id WHERE (tm.deleted IS NULL OR tm.deleted = 0) AND (tm.body LIKE ? OR tm.from_nombre LIKE ?)`;
  const params = [q, q];
  if (channel === 'general') {
    base += ' AND tm.to_vendedor_id IS NULL';
  } else if (channel && channel.includes('_')) {
    const [a, b] = channel.split('_').map(Number);
    base += ' AND tm.to_vendedor_id IS NOT NULL AND ((tm.from_vendedor_id = ? AND tm.to_vendedor_id = ?) OR (tm.from_vendedor_id = ? AND tm.to_vendedor_id = ?))';
    params.push(a, b, b, a);
  }
  base += ' ORDER BY tm.id DESC LIMIT 50';
  return all(base, params);
}

// --- Reenviar mensaje a otro canal ---
function forwardTeamMessage(messageId, toVendedorId, fromVendedorId, fromNombre) {
  const msg = one('SELECT * FROM team_messages WHERE id = ?', [messageId]);
  if (!msg) return null;
  return saveTeamMessage(fromVendedorId, fromNombre, msg.body, {
    toVendedorId: toVendedorId || null,
    mediaType: msg.media_type,
    mediaUrl: msg.media_url,
  });
}

// --- Presencia ---
function updatePresence(vendedorId) {
  run('INSERT OR REPLACE INTO team_presence (vendedor_id, last_heartbeat) VALUES (?, strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'))', [vendedorId]);
}
function getPresenceMap() {
  const rows = all('SELECT vendedor_id, last_heartbeat FROM team_presence');
  const map = {};
  const now = Date.now();
  for (const r of rows) {
    const hbDate = r.last_heartbeat ? parseLocalDbTime(r.last_heartbeat) : null;
    const hb = hbDate ? hbDate.getTime() : 0;
    map[r.vendedor_id] = { last_heartbeat: r.last_heartbeat, online: (now - hb) < 60000 };
  }
  return map;
}

// --- Ubicación del asesor (rastreo de jornada) ---

// Sella el consentimiento de rastreo. Sin esta marca, guardarPosicionVendedor() se
// niega a registrar nada: el permiso vive en la BD, no en la UI del celular.
function setConsentimientoUbicacion(vendedorId) {
  run("UPDATE vendedores SET ubicacion_consentida_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND ubicacion_consentida_at IS NULL", [vendedorId]);
  return one('SELECT ubicacion_consentida_at FROM vendedores WHERE id = ?', [vendedorId]);
}

function tieneConsentimientoUbicacion(vendedorId) {
  const v = one('SELECT ubicacion_consentida_at FROM vendedores WHERE id = ?', [vendedorId]);
  return !!(v && v.ubicacion_consentida_at);
}

// Revocar borra además el rastro: si el asesor retira el consentimiento, conservar sus
// posiciones anteriores sería seguir tratando un dato sin permiso.
function revocarConsentimientoUbicacion(vendedorId) {
  run('UPDATE vendedores SET ubicacion_consentida_at = NULL, last_lat = NULL, last_lng = NULL, last_pos_at = NULL WHERE id = ?', [vendedorId]);
  run('DELETE FROM vendedor_posiciones WHERE vendedor_id = ?', [vendedorId]);
}

function guardarPosicionVendedor(vendedorId, { lat, lng, precision, bateria }) {
  if (!tieneConsentimientoUbicacion(vendedorId)) return { ok: false, error: 'sin_consentimiento' };
  run('INSERT INTO vendedor_posiciones (vendedor_id, lat, lng, precision, bateria) VALUES (?, ?, ?, ?, ?)',
    [vendedorId, lat, lng, precision != null ? Number(precision) : null, bateria != null ? Number(bateria) : null]);
  run("UPDATE vendedores SET last_lat = ?, last_lng = ?, last_pos_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    [lat, lng, vendedorId]);
  return { ok: true };
}

// Últimas posiciones conocidas del equipo, para pintar el mapa de un solo golpe.
function getUltimasPosiciones() {
  return all(`SELECT id, nombre, telefono, estado, foto, rol, last_lat, last_lng, last_pos_at
              FROM vendedores WHERE last_lat IS NOT NULL AND last_lng IS NOT NULL`);
}

// Rastro de un asesor en un día concreto del calendario de Bogotá ('YYYY-MM-DD'), que es
// el día que el asesor entiende por "hoy". Se ordena por hora para dibujar la polilínea.
//
// Filtrar con `date(ts) = date(?)` era incorrecto: `ts` se guarda en UTC (SQL_NOW_UTC) y
// `date()` devuelve la fecha UTC, así que toda posición registrada entre las 19:00 y la
// medianoche hora local caía en el día siguiente y desaparecía del recorrido — justo el
// tramo final de la jornada. Se compara contra el rango UTC del día local.
function getRecorridoVendedor(vendedorId, fecha) {
  const rango = rangoUTCDeDiaLocal(fecha);
  if (!rango) return [];
  return all(`SELECT lat, lng, precision, bateria, ts FROM vendedor_posiciones
              WHERE vendedor_id = ? AND ts >= ? AND ts < ? ORDER BY ts ASC`,
    [vendedorId, rango[0], rango[1]]);
}

// Purga del histórico. Se llama desde el cron de limpieza diaria.
function purgarPosicionesAntiguas(dias) {
  const d = Number(dias) > 0 ? Number(dias) : 30;
  const r = run(`DELETE FROM vendedor_posiciones WHERE ts < strftime('%Y-%m-%dT%H:%M:%fZ','now',?)`, [`-${d} days`]);
  return (r && r.changes) || 0;
}

// --- Coordenadas de leads, proyectos y zonas (capas del mapa) ---

// `fuente`: 'ubicacion' (pin compartido por el cliente) o 'geocodificado' (deducido de
// la ciudad). REGLA: la geocodificación NUNCA pisa una ubicación compartida. Es la única
// coordenada en la que se puede confiar para desplazarse, y perderla porque una pasada
// del cron resolvió "Tocaima" al centro del pueblo sería un retroceso silencioso.
function setLeadCoords(leadId, lat, lng, fuente) {
  const f = fuente === 'ubicacion' ? 'ubicacion' : 'geocodificado';
  const guarda = f === 'geocodificado' ? " AND COALESCE(coord_fuente,'') != 'ubicacion'" : '';
  run(`UPDATE leads SET lat = ?, lng = ?, coord_fuente = ?,
       geocode_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?${guarda}`,
    [lat != null ? Number(lat) : null, lng != null ? Number(lng) : null, f, leadId]);
}

// Un cliente compartió su ubicación por WhatsApp. Se valida el rango antes de escribir:
// el body llega de un webhook externo y un valor absurdo mandaría el pin a otro planeta.
function setLeadCoordsDesdeUbicacion(leadId, lat, lng) {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
  setLeadCoords(leadId, la, ln, 'ubicacion');
  return true;
}

// Rellena coordenadas exactas a partir del histórico de mensajes de ubicación ya
// recibidos (antes de que existiera coord_fuente nadie los aprovechaba).
// MAX(id) y no MAX(timestamp): el id es monotónico e inequívoco ante empates, mientras
// que timestamp convive con formatos mixtos heredados.
function backfillCoordsDesdeUbicaciones(limite) {
  const filas = all(`SELECT m.lead_id AS leadId, m.body AS body
                     FROM messages m
                     JOIN (SELECT lead_id, MAX(id) AS mid FROM messages
                           WHERE media_type = 'location' AND lead_id IS NOT NULL
                           GROUP BY lead_id) u ON u.mid = m.id
                     LIMIT ?`, [Number(limite) > 0 ? Number(limite) : 1000]);
  let aplicados = 0;
  for (const f of filas) {
    let loc = null;
    // Un body corrupto no puede tumbar la pasada completa.
    try { loc = JSON.parse(f.body); } catch (e) { continue; }
    if (!loc) continue;
    if (setLeadCoordsDesdeUbicacion(f.leadId, loc.latitude, loc.longitude)) aplicados++;
  }
  return { revisados: filas.length, aplicados };
}

// Marca el intento fallido para no reintentar el mismo lead en cada pasada: sin esto,
// un lead con dirección imposible se geocodificaría una y otra vez contra Mapbox.
function marcarLeadSinGeocodificar(leadId) {
  run("UPDATE leads SET geocode_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [leadId]);
}

// Leads pendientes de geocodificar: los que nunca se intentaron y tienen algún dato de
// ubicación con el que trabajar.
function getLeadsSinCoordenadas(limite) {
  return all(`SELECT id, customer_name, ciudad, zona, proyecto FROM leads
              WHERE lat IS NULL AND geocode_at IS NULL
                AND (COALESCE(ciudad,'') != '' OR COALESCE(zona,'') != '' OR COALESCE(proyecto,'') != '')
              ORDER BY updated_at DESC LIMIT ?`, [Number(limite) > 0 ? Number(limite) : 50]);
}

// `etiqueta` acepta una o varias separadas por coma (filtro por etapa del pipeline).
// `caja` es el prefiltro geográfico: acota en SQL antes de calcular distancias en JS, en
// vez de traer todos los leads geocodificados a memoria en cada consulta.
function getLeadsConCoordenadas({ etiqueta, vendedorId, caja } = {}) {
  const cond = ['l.lat IS NOT NULL', "l.status != 'cerrado'"];
  const args = [];
  if (etiqueta) {
    const etqs = String(etiqueta).split(',').map(s => s.trim()).filter(Boolean);
    if (etqs.length) {
      cond.push(`l.etiqueta IN (${etqs.map(() => '?').join(',')})`);
      args.push(...etqs);
    }
  }
  if (vendedorId) { cond.push('l.assigned_to_id = ?'); args.push(Number(vendedorId)); }
  if (caja) {
    cond.push('l.lat BETWEEN ? AND ?', 'l.lng BETWEEN ? AND ?');
    args.push(caja.minLat, caja.maxLat, caja.minLng, caja.maxLng);
  }
  return all(`SELECT l.id, l.customer_name, l.customer_phone, l.etiqueta, l.status, l.lat, l.lng,
                     l.coord_fuente, l.assigned_to_id, v.nombre AS assigned_to_nombre,
                     l.ciudad, l.proyecto, l.last_customer_message_at
              FROM leads l LEFT JOIN vendedores v ON v.id = l.assigned_to_id
              WHERE ${cond.join(' AND ')}`, args);
}

function setProyectoCoords(proyectoId, lat, lng) {
  run("UPDATE proyectos SET lat = ?, lng = ? WHERE id = ?", [lat, lng, proyectoId]);
}

function getProyectosConCoordenadas() {
  return all("SELECT id, nombre, ciudad, departamento, estado, lat, lng FROM proyectos WHERE lat IS NOT NULL");
}

function setZonaCoords(zonaId, { lat, lng, radioKm }) {
  run('UPDATE zonas SET centro_lat = ?, centro_lng = ?, radio_km = ? WHERE id = ?',
    [lat, lng, radioKm != null ? Number(radioKm) : null, zonaId]);
}

function getZonasConCoordenadas() {
  return all("SELECT id, nombre, slug, centro_lat, centro_lng, radio_km FROM zonas WHERE centro_lat IS NOT NULL AND activo = 1");
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
    run("UPDATE leads SET pinned_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [leadId]);
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
    run("UPDATE leads SET muted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [leadId]);
  } else {
    run("UPDATE leads SET muted_at = NULL WHERE id = ?", [leadId]);
  }
}

// === 24-HOUR WINDOW TRACKING ===

function updateCustomerMessageTimestamp(leadId) {
  // Al responder el cliente, se limpia el guard para que pueda generarse un nuevo
  // seguimiento automático si el asesor vuelve a quedar como último en escribir.
  run('UPDATE leads SET last_customer_message_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'), followup_task_at = NULL WHERE id = ?', [leadId]);
  try {
    const lead = one('SELECT lead_id FROM conversations WHERE lead_id = ?', [leadId]);
    if (lead) {
      run('UPDATE conversations SET last_customer_message_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE lead_id = ?', [leadId]);
    }
  } catch (e) { /* conversación puede no existir aún */ }
}

function isWindowOpen(leadId) {
  const lead = one('SELECT last_customer_message_at FROM leads WHERE id = ?', [leadId]);
  if (!lead || !lead.last_customer_message_at) return false;
  const lastMsg = parseLocalDbTime(lead.last_customer_message_at);
  if (!lastMsg) return false;
  const now = new Date();
  const hoursDiff = (now - lastMsg) / (1000 * 60 * 60);
  return hoursDiff < 24;
}

function getWindowExpiresAt(leadId) {
  const lead = one('SELECT last_customer_message_at FROM leads WHERE id = ?', [leadId]);
  if (!lead || !lead.last_customer_message_at) return null;
  const lastMsg = parseLocalDbTime(lead.last_customer_message_at);
  if (!lastMsg) return null;
  return new Date(lastMsg.getTime() + 24 * 60 * 60 * 1000);
}

function getVendedoresActivos() {
  // El admin y el supervisor NO reciben clientes del round-robin: el supervisor es
  // un rol operativo (observa y reasigna), no un asesor de captación. El jefe SÍ recibe
  // leads (decisión explícita del dueño del negocio, 2026-08-08) — a diferencia del
  // supervisor, el jefe también trabaja leads como cualquier asesor además de supervisar.
  // Se excluye solo a quien esté vinculado a un usuario con rol 'admin' o 'supervisor'.
  return all(`
    SELECT v.*, COUNT(l.id) as leads_activos
    FROM vendedores v
    LEFT JOIN leads l ON l.assigned_to_id = v.id AND l.status != ?
    WHERE v.estado = ?
      AND v.id NOT IN (SELECT vendedor_id FROM usuarios WHERE vendedor_id IS NOT NULL AND rol IN ('admin','supervisor'))
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
  run('UPDATE leads SET status = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [status, leadId]);
}

function resetLead(leadId) {
  run(`UPDATE leads SET
    status = 'nuevo',
    first_response_at = NULL,
    escalation_level = 0,
    unread_count = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = ?`, [leadId]);
}

function reopenLead(leadId) {
  run(`UPDATE leads SET 
    status = 'asignado',
    first_response_at = NULL,
    escalation_level = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = ? AND status = 'cerrado'`, [leadId]);
}

function setFirstResponse(leadId) {
  run('UPDATE leads SET first_response_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ? AND first_response_at IS NULL', [leadId]);
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
      run(`UPDATE conversations SET lead_id = ?, assigned_to_id = ?, status = 'cerrado', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN (${ids})`, [keepLeadId, keep.assigned_to_id]);
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
    run("UPDATE conversations SET status = 'cerrado', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [o.id]);
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

function getLeads(includeCerrado, limit) {
  const lim = Math.min(Number(limit) || 500, 2000);
  if (includeCerrado) {
    return withLeadScore(all(`
      SELECT l.*, v.nombre AS assigned_to_nombre
      FROM leads l
      LEFT JOIN vendedores v ON v.id = l.assigned_to_id
      ORDER BY l.updated_at DESC, l.created_at DESC
      LIMIT ?
    `, [lim]));
  }
  return withLeadScore(all(`
    SELECT l.*, v.nombre AS assigned_to_nombre
    FROM leads l
    LEFT JOIN vendedores v ON v.id = l.assigned_to_id
    WHERE l.status != 'cerrado'
    ORDER BY l.updated_at DESC, l.created_at DESC
    LIMIT ?
  `, [lim]));
}

// Agregados SQL para dashboard/métricas — no carga todos los leads en JS
function getLeadAggregates() {
  const total = one('SELECT COUNT(*) AS n FROM leads');
  const porEtiqueta = {};
  ['sin_clasificar', 'interesado', 'negociacion', 'cita', 'vendido', 'no_interesado'].forEach(e => porEtiqueta[e] = 0);
  all("SELECT COALESCE(NULLIF(etiqueta,''),'sin_clasificar') AS e, COUNT(*) AS n FROM leads GROUP BY e").forEach(r => { porEtiqueta[r.e] = (porEtiqueta[r.e] || 0) + Number(r.n); });
  const porEstado = {};
  all("SELECT COALESCE(NULLIF(status,''),'nuevo') AS s, COUNT(*) AS n FROM leads GROUP BY s").forEach(r => { porEstado[r.s] = Number(r.n); });
  const resp = one(`
    SELECT COUNT(*) AS respondidos,
      COALESCE(SUM((julianday(first_response_at) - julianday(created_at)) * 1440), 0) AS sumaMin
    FROM leads
    WHERE first_response_at IS NOT NULL AND created_at IS NOT NULL AND first_response_at >= created_at
  `);
  const porVendedor = all(`
    SELECT v.id, v.nombre, v.estado, v.foto,
      COUNT(l.id) AS total,
      SUM(CASE WHEN l.status != 'cerrado' THEN 1 ELSE 0 END) AS activos,
      SUM(CASE WHEN l.etiqueta = 'vendido' THEN 1 ELSE 0 END) AS vendidos
    FROM vendedores v
    LEFT JOIN leads l ON l.assigned_to_id = v.id
    GROUP BY v.id
    ORDER BY total DESC
  `).map(r => ({
    id: r.id, nombre: r.nombre, estado: r.estado, foto: r.foto || null,
    total: Number(r.total) || 0, activos: Number(r.activos) || 0, vendidos: Number(r.vendidos) || 0,
    conversion: r.total ? Math.round((Number(r.vendidos) / Number(r.total)) * 100) : 0,
  }));
  return {
    total: total ? Number(total.n) : 0,
    porEtiqueta, porEstado, porVendedor,
    respondidos: resp ? Number(resp.respondidos) : 0,
    sumaRespuestaMin: resp ? Number(resp.sumaMin) : 0,
  };
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
  run('UPDATE leads SET customer_name = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [String(nombre), Number(leadId)]);
}

function setLeadOrigen(leadId, origen) {
  run('UPDATE leads SET origen = ? WHERE id = ?', [String(origen).slice(0, 255), Number(leadId)]);
}

// Atribución estructurada del anuncio que trajo el lead (F1). Solo escribe los campos que
// vengan con valor — un mensaje sin ctwa_clid no debe borrar uno que ya se había guardado.
function setLeadAdAttribution(leadId, { adId, adName, sourceUrl, ctwaClid } = {}) {
  const sets = [], params = [];
  if (adId) { sets.push('ad_id = ?'); params.push(String(adId).slice(0, 255)); }
  if (adName) { sets.push('ad_name = ?'); params.push(String(adName).slice(0, 255)); }
  if (sourceUrl) { sets.push('ad_source_url = ?'); params.push(String(sourceUrl).slice(0, 500)); }
  if (ctwaClid) { sets.push('ctwa_clid = ?'); params.push(String(ctwaClid).slice(0, 255)); }
  if (!sets.length) return;
  params.push(Number(leadId));
  run(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`, params);
}

// Cuenta leads REALES del CRM atribuidos a un conjunto de ad_id (los anuncios de una
// campaña de Meta), opcionalmente acotado a los últimos N días. Es la fuente de verdad
// para "cuántos leads trajo esta campaña" — más confiable que las `actions` que reporta
// la Graph API, cuyo action_type varía según el objetivo de la campaña (un Lead Ads
// reporta 'lead', pero una campaña de mensajes a WhatsApp usa otro tipo de acción que
// meta-ads.js no siempre reconoce). Cuenta TODOS los leads con ese ad_id, no solo los
// activos, para no subestimar el CPL con leads que ya se cerraron.
function countLeadsByAdIds(adIds, days) {
  const ids = (adIds || []).filter(Boolean).map(String);
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  let sql = `SELECT COUNT(*) as c FROM leads WHERE ad_id IN (${placeholders})`;
  const params = [...ids];
  if (days) { sql += ` AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now',?)`; params.push(`-${Number(days)} days`); }
  const r = one(sql, params);
  return r ? r.c : 0;
}

// Igual que countLeadsByAdIds pero agrupado por ad_id — una sola query para TODOS los
// anuncios de la cuenta en vez de una consulta por campaña (ver meta-ads.js getCampaigns:
// antes hacía 1 llamada a Graph + 1 query de conteo POR campaña; con esto el caller junta
// los ad_id que le pertenecen a cada campaña y suma desde este único mapa).
function getLeadCountsByAdIds(adIds, days) {
  const ids = (adIds || []).filter(Boolean).map(String);
  if (!ids.length) return {};
  const placeholders = ids.map(() => '?').join(',');
  let sql = `SELECT ad_id, COUNT(*) as c FROM leads WHERE ad_id IN (${placeholders})`;
  const params = [...ids];
  if (days) { sql += ` AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now',?)`; params.push(`-${Number(days)} days`); }
  sql += ' GROUP BY ad_id';
  const rows = all(sql, params);
  const map = {};
  rows.forEach(r => { map[r.ad_id] = r.c; });
  return map;
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

function addVendedor(nombre, telefono, estado) {
  let t = String(telefono).replace(/[\s-]/g, '');
  if (t.startsWith('57') && !t.startsWith('+')) t = '+' + t;
  run('INSERT OR IGNORE INTO vendedores (nombre, telefono, estado) VALUES (?, ?, ?)', [nombre, t, estado || 'activo']);
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

// Cambiar el rol de un usuario existente ('admin' | 'supervisor' | 'vendedor').
// Usado por ensureSupervisor() (promoción vía .env) y, futuro, por el admin desde Equipo.
function updateUsuarioRol(id, rol) {
  run('UPDATE usuarios SET rol = ? WHERE id = ?', [rol, id]);
}

// "Nos dejó en visto": el último mensaje del chat es nuestro y Meta confirmó que el
// cliente lo leyó, pero no contestó. Se calcula como subconsulta para que la lista de
// chats lo pueda marcar sin pedir el historial de cada lead.
const SQL_VISTO_SIN_RESPONDER = `(SELECT CASE WHEN m.direction = 'outgoing' AND m.status = 'read' THEN 1 ELSE 0 END
    FROM messages m WHERE m.lead_id = l.id ORDER BY m.id DESC LIMIT 1) AS visto_sin_responder`;

// --- Leads y mensajes por vendedor ---
function getLeadsByVendedorId(vendedorId) {
  return withLeadScore(all(`SELECT l.*, v.nombre AS assigned_to_nombre, ${SQL_VISTO_SIN_RESPONDER} FROM leads l LEFT JOIN vendedores v ON l.assigned_to_id = v.id WHERE l.assigned_to_id = ? AND l.status != ? ORDER BY l.pinned_at DESC, l.updated_at DESC`, [vendedorId, 'cerrado']));
}

function getArchivedLeadsByVendedorId(vendedorId) {
  return all("SELECT l.*, v.nombre AS assigned_to_nombre FROM leads l LEFT JOIN vendedores v ON l.assigned_to_id = v.id WHERE l.assigned_to_id = ? AND l.status = ? ORDER BY l.updated_at DESC", [vendedorId, 'cerrado']);
}

// Paginado: por defecto los ÚLTIMOS `limit` mensajes (los más recientes),
// devueltos en orden cronológico. `beforeId` trae la página anterior (scroll arriba).
function getMessagesByLead(leadId, opts = {}) {
  const limit = Math.min(Number(opts.limit) || 100, 500);
  const beforeId = opts.beforeId ? Number(opts.beforeId) : null;
  const rows = all(`
    SELECT m.*, r.body AS reply_to_body, r.direction AS reply_to_direction, r.media_type AS reply_to_media_type
    FROM messages m
    LEFT JOIN messages r ON r.id = m.reply_to_id
    WHERE m.lead_id = ?${beforeId ? ' AND m.id < ?' : ''}
    ORDER BY m.id DESC
    LIMIT ?
  `, beforeId ? [leadId, beforeId, limit] : [leadId, limit]);
  return rows.reverse();
}

function countMessagesByLead(leadId) {
  const r = one('SELECT COUNT(*) AS n FROM messages WHERE lead_id = ?', [leadId]);
  return r ? Number(r.n) : 0;
}

// --- Templates (respuestas rápidas) ---
function getTemplates() {
  return all('SELECT * FROM templates ORDER BY titulo');
}

function getTemplateById(id) {
  return one('SELECT * FROM templates WHERE id = ?', [id]);
}

function addTemplate(titulo, cuerpo) {
  run('INSERT INTO templates (titulo, cuerpo) VALUES (?, ?)', [titulo, cuerpo]);
}

function updateTemplate(id, titulo, cuerpo) {
  run('UPDATE templates SET titulo = ?, cuerpo = ? WHERE id = ?', [titulo, cuerpo, id]);
}

function deleteTemplate(id) {
  run('DELETE FROM templates WHERE id = ?', [id]);
}

// --- Templates del vendedor (respuestas rápidas personalizadas) ---
function getVendedorTemplates(vendedorId) {
  return all('SELECT * FROM vendedor_templates WHERE vendedor_id = ? ORDER BY titulo', [vendedorId]);
}
function getVendedorTemplateById(id) {
  return one('SELECT * FROM vendedor_templates WHERE id = ?', [id]);
}
function addVendedorTemplate(vendedorId, titulo, cuerpo) {
  run('INSERT INTO vendedor_templates (vendedor_id, titulo, cuerpo) VALUES (?, ?, ?)', [vendedorId, titulo, cuerpo]);
}
function updateVendedorTemplate(id, titulo, cuerpo) {
  run('UPDATE vendedor_templates SET titulo = ?, cuerpo = ? WHERE id = ?', [titulo, cuerpo, id]);
}
// AND vendedor_id = ? es la defensa real: sin ella, cualquier asesor autenticado podía
// borrar la plantilla de otro con solo adivinar/enumerar el id (IDOR). La ruta además
// verifica dueño antes de llamar acá para poder devolver 403 en vez de un 200 mudo.
function deleteVendedorTemplate(id, vendedorId) {
  run('DELETE FROM vendedor_templates WHERE id = ? AND vendedor_id = ?', [id, vendedorId]);
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

function getAllPushSubscriptions() {
  return all('SELECT vendedor_id, tipo, substr(endpoint,1,30) as endpoint_preview, created_at FROM push_subscriptions ORDER BY created_at DESC');
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
  const now = Date.now();
  run('INSERT OR REPLACE INTO sessions (token, user_id, vendedor_id, rol, nombre, email, created_at, user_agent, last_seen_at, empresa_id, empresa_db_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    token,
    data.userId != null ? Number(data.userId) : null,
    data.vendedorId != null ? Number(data.vendedorId) : null,
    data.rol || 'vendedor',
    data.nombre || '',
    data.email || '',
    now,
    String(data.userAgent || '').slice(0, 255),
    now,
    data.empresaId != null ? Number(data.empresaId) : null,
    data.empresaDbPath || null,
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

// Deja una sesión con un tiempo de vida restante corto (periodo de gracia tras rotar el token)
function expireSessionSoon(token, graceMs) {
  const CFG = require('../config');
  run('UPDATE sessions SET created_at = ? WHERE token = ?', [Date.now() - CFG.SESSION_TTL_MS + graceMs, token]);
}

function cleanExpiredSessions(ttlMs) {
  run('DELETE FROM sessions WHERE created_at < ?', [Date.now() - ttlMs]);
}

// Todas las sesiones activas de la cuenta que pide la lista ("Sesiones activas" en
// Cuenta) — se filtra por vendedor_id o user_id, lo que corresponda a esa cuenta.
function getSessionsByOwner(vendedorId, userId) {
  if (vendedorId != null) return all('SELECT * FROM sessions WHERE vendedor_id = ? ORDER BY last_seen_at DESC', [Number(vendedorId)]);
  if (userId != null) return all('SELECT * FROM sessions WHERE user_id = ? AND vendedor_id IS NULL ORDER BY last_seen_at DESC', [Number(userId)]);
  return [];
}

// Throttled: evita un UPDATE en cada request — solo escribe si pasaron >5 min desde
// el último touch. last_seen_at es lo que se muestra como "última actividad" en la UI.
function touchSessionLastSeen(token) {
  const s = one('SELECT last_seen_at FROM sessions WHERE token = ?', [token]);
  if (!s) return;
  const now = Date.now();
  if (now - (s.last_seen_at || 0) > 5 * 60 * 1000) run('UPDATE sessions SET last_seen_at = ? WHERE token = ?', [now, token]);
}

// Pánico: cerrar todo excepto la sesión actual. Acotado por vendedor_id/user_id — nunca
// puede borrar sesiones de otra cuenta aunque alguien manipule el body del request.
// run() de este adapter no devuelve conteo de filas (a diferencia de better-sqlite3
// crudo) — se cuenta antes de borrar en vez de leer .changes.
function deleteOtherSessions(currentToken, vendedorId, userId) {
  let where = null, params = null;
  if (vendedorId != null) { where = 'vendedor_id = ? AND token != ?'; params = [Number(vendedorId), currentToken]; }
  else if (userId != null) { where = 'user_id = ? AND vendedor_id IS NULL AND token != ?'; params = [Number(userId), currentToken]; }
  else return 0;
  const n = (one(`SELECT COUNT(*) as c FROM sessions WHERE ${where}`, params) || {}).c || 0;
  run(`DELETE FROM sessions WHERE ${where}`, params);
  return n;
}

// --- Tareas / recordatorios (por vendedor; lead_id = 0 → tarea suelta) ---
function getTareasByVendedor(vendedorId) {
  return all('SELECT * FROM tareas WHERE vendedor_id = ? ORDER BY completada ASC, COALESCE(vence_at, created_at) ASC LIMIT 200', [Number(vendedorId)]);
}

function createTarea({ vendedorId, texto, leadId, venceAt }) {
  run('INSERT INTO tareas (lead_id, texto, vendedor_id, vence_at, fecha_vencimiento) VALUES (?, ?, ?, ?, ?)', [
    leadId != null ? Number(leadId) : 0, String(texto), Number(vendedorId), venceAt || null, venceAt || '',
  ]);
  return one('SELECT * FROM tareas WHERE rowid = last_insert_rowid()');
}

function updateTarea(id, vendedorId, data) {
  const t = one('SELECT * FROM tareas WHERE id = ? AND vendedor_id = ?', [Number(id), Number(vendedorId)]);
  if (!t) return null;
  if (data.completada != null) run('UPDATE tareas SET completada = ? WHERE id = ?', [data.completada ? 1 : 0, t.id]);
  if (data.texto) run('UPDATE tareas SET texto = ? WHERE id = ?', [String(data.texto), t.id]);
  if (data.venceAt !== undefined) run('UPDATE tareas SET vence_at = ?, notificada = 0 WHERE id = ?', [data.venceAt || null, t.id]);
  return one('SELECT * FROM tareas WHERE id = ?', [t.id]);
}

function deleteTarea(id, vendedorId) {
  run('DELETE FROM tareas WHERE id = ? AND vendedor_id = ?', [Number(id), Number(vendedorId)]);
}

// Recordatorios vencidos aún no notificados (para el barrido de push cada minuto)
function getTareasVencidasSinNotificar(nowISO) {
  return all("SELECT * FROM tareas WHERE vence_at IS NOT NULL AND vence_at != '' AND vence_at <= ? AND notificada = 0 AND completada = 0 AND vendedor_id IS NOT NULL", [nowISO]);
}

function markTareaNotificada(id) {
  run('UPDATE tareas SET notificada = 1 WHERE id = ?', [Number(id)]);
}

function setVendedorAbout(id, texto) {
  run('UPDATE vendedores SET about = ? WHERE id = ?', [String(texto || '').slice(0, 300), Number(id)]);
}

const CHAT_BG_VALIDOS = ['leones', 'none'];
function setVendedorChatBg(id, valor) {
  run('UPDATE vendedores SET chat_bg = ? WHERE id = ?', [CHAT_BG_VALIDOS.includes(valor) ? valor : 'leones', Number(id)]);
}

// --- Centro de notificaciones ---
function createNotification({ vendedorId, tipo, titulo, cuerpo, leadId }) {
  run('INSERT INTO notifications (vendedor_id, tipo, titulo, cuerpo, lead_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    Number(vendedorId) || 0, tipo || 'info', titulo || '', cuerpo || '', leadId != null ? Number(leadId) : null, Date.now(),
  ]);
  // Retención: borrar notificaciones de más de 30 días (barato, sin cron)
  run('DELETE FROM notifications WHERE created_at < ?', [Date.now() - 30 * 24 * 60 * 60 * 1000]);
  const r = one('SELECT * FROM notifications WHERE rowid = last_insert_rowid()');
  return r || null;
}

function getNotifications(vendedorId, limit = 30) {
  return all('SELECT * FROM notifications WHERE vendedor_id = ? ORDER BY created_at DESC LIMIT ?', [Number(vendedorId) || 0, Math.min(Number(limit) || 30, 100)]);
}

function countUnreadNotifications(vendedorId) {
  const r = one('SELECT COUNT(*) AS n FROM notifications WHERE vendedor_id = ? AND leida = 0', [Number(vendedorId) || 0]);
  return r ? Number(r.n) : 0;
}

function markNotificationRead(id, vendedorId) {
  run('UPDATE notifications SET leida = 1 WHERE id = ? AND vendedor_id = ?', [Number(id), Number(vendedorId) || 0]);
}

function markAllNotificationsRead(vendedorId) {
  run('UPDATE notifications SET leida = 1 WHERE vendedor_id = ?', [Number(vendedorId) || 0]);
}

// --- SP Feed ---
function createFeedItem({ titulo, descripcion = '', tipo = 'imagen', categoria = 'cultura', mediaUrl = '', mediaPath = '', mediaMime = '', mediaFilename = '', autor = '', creadoPor = null }) {
  run('INSERT INTO sp_feed (titulo, descripcion, tipo, categoria, media_url, media_path, media_mime, media_filename, autor, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    String(titulo), String(descripcion), String(tipo), String(categoria),
    String(mediaUrl), String(mediaPath), String(mediaMime), String(mediaFilename),
    String(autor), creadoPor != null ? Number(creadoPor) : null,
  ]);
  return one('SELECT * FROM sp_feed WHERE id = last_insert_rowid()');
}

function getFeedItems({ categoria, tipo, busqueda, limite } = {}) {
  const conditions = ['activo = 1'];
  const params = [];
  if (categoria && categoria !== 'todas') { conditions.push('categoria = ?'); params.push(categoria); }
  if (tipo && tipo !== 'todos') { conditions.push('tipo = ?'); params.push(tipo); }
  if (busqueda) {
    conditions.push('(titulo LIKE ? OR descripcion LIKE ? OR autor LIKE ?)');
    params.push(`%${busqueda}%`, `%${busqueda}%`, `%${busqueda}%`);
  }
  const lim = Math.min(Number(limite) || 50, 100);
  return all(`SELECT * FROM sp_feed WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`, [...params, lim]);
}

function getFeedItemById(id) {
  return one('SELECT * FROM sp_feed WHERE id = ?', [Number(id)]);
}

function deleteFeedItem(id) {
  const item = one('SELECT id FROM sp_feed WHERE id = ?', [Number(id)]);
  if (!item) return false;
  run('UPDATE sp_feed SET activo = 0 WHERE id = ?', [Number(id)]);
  return true;
}

// --- Analítica (S8) ---
// Serie temporal por día: entrantes / vendidos / cerrados en los últimos N días.
function getLeadSeries({ dias = 30, vendedorId } = {}) {
  const params = [`-${Number(dias) || 30} days`];
  let extra = '';
  if (vendedorId) { extra = ' AND assigned_to_id = ?'; params.push(Number(vendedorId)); }
  return all(`
    SELECT date(created_at) AS dia,
      COUNT(*) AS entrantes,
      SUM(CASE WHEN etiqueta = 'vendido' THEN 1 ELSE 0 END) AS vendidos,
      SUM(CASE WHEN COALESCE(status, '') = 'cerrado' THEN 1 ELSE 0 END) AS cerrados
    FROM leads
    WHERE created_at >= datetime('now', ?)
    ${extra}
    GROUP BY dia ORDER BY dia
  `, params);
}

// Distribución por canal (conversaciones multicanal).
function getCanalDistribution() {
  return all('SELECT channel, COUNT(*) AS n FROM conversations GROUP BY channel ORDER BY n DESC');
}

// Leads del período con asesor — para CSV de export.
function getLeadsExport({ dias = 30, vendedorId } = {}) {
  const params = [`-${Number(dias) || 30} days`];
  let extra = '';
  if (vendedorId) { extra = ' AND l.assigned_to_id = ?'; params.push(Number(vendedorId)); }
  return all(`
    SELECT l.id, l.created_at, l.customer_name, l.customer_phone, l.etiqueta, l.status,
      l.first_response_at, l.updated_at, v.nombre AS asesor
    FROM leads l
    LEFT JOIN vendedores v ON v.id = l.assigned_to_id
    WHERE l.created_at >= datetime('now', ?)
    ${extra}
    ORDER BY l.created_at DESC
  `, params);
}

// --- SP Feed en Tiempo Real (actividad operativa) ---
// feed_events: un registro por evento del negocio (lead asignado, respuesta, etapa,
// venta, reasignación, alerta, asesor conectado, post de capacitación). El Supervisor
// Center lo consume como un feed social cronológico con filtros por categoria.
function createFeedEvent({ tipo, categoria = 'operaciones', actorId = null, actorNombre = '', leadId = null, conversationId = null, entidadTipo = '', entidadId = null, titulo, descripcion = '', payload = {} }) {
  run('INSERT INTO feed_events (tipo, categoria, actor_id, actor_nombre, lead_id, conversation_id, entidad_tipo, entidad_id, titulo, descripcion, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    String(tipo), String(categoria),
    actorId != null ? Number(actorId) : null, String(actorNombre || ''),
    leadId != null ? Number(leadId) : null, conversationId != null ? Number(conversationId) : null,
    String(entidadTipo || ''), entidadId != null ? Number(entidadId) : null,
    String(titulo), String(descripcion || ''), JSON.stringify(payload || {}),
  ]);
  return one('SELECT * FROM feed_events WHERE id = last_insert_rowid()');
}

function getFeedEvents({ categoria = '', antesId = null, limite = 50 } = {}) {
  const conditions = [];
  const params = [];
  if (categoria && categoria !== 'todos' && categoria !== 'todas') { conditions.push('categoria = ?'); params.push(categoria); }
  if (antesId) { conditions.push('id < ?'); params.push(Number(antesId)); }
  const lim = Math.min(Number(limite) || 50, 100);
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  return all(`SELECT * FROM feed_events ${where} ORDER BY id DESC LIMIT ?`, [...params, lim]);
}

function getFeedEventById(id) {
  return one('SELECT * FROM feed_events WHERE id = ?', [Number(id)]);
}

function purgeOldFeedEvents(dias = 90) {
  try {
    run("DELETE FROM feed_events WHERE created_at < datetime('now', ?)", [`-${dias} days`]);
  } catch (e) { /* noop */ }
}

function addFeedReaction(feedId, vendedorId, nombre, emoji) {
  try {
    run('INSERT OR IGNORE INTO feed_reactions (feed_id, vendedor_id, nombre, emoji) VALUES (?, ?, ?, ?)',
      [Number(feedId), Number(vendedorId), String(nombre || ''), String(emoji)]);
    return true;
  } catch (e) { return false; }
}

function getFeedReactionsForEvent(feedId) {
  return all('SELECT * FROM feed_reactions WHERE feed_id = ? ORDER BY id ASC', [Number(feedId)]);
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

// Solo las que se pueden enviar de verdad — es el filtro que usan por defecto los
// consumidores que no distinguen estado (inbox, campañas, panel vendedor).
function getWATemplatesAprobadas() {
  return all("SELECT * FROM wa_templates WHERE estado = 'APPROVED' ORDER BY nombre");
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

// Ambigua a propósito por compatibilidad (la usa sendMessageSmart para la reactivación,
// que solo conoce un nombre configurado en `config`, no un idioma) — prioriza APPROVED
// y español cuando hay varias filas con el mismo nombre en distintos idiomas.
function getWATemplateByName(nombre) {
  return one(
    "SELECT * FROM wa_templates WHERE nombre = ? ORDER BY (estado = 'APPROVED') DESC, (idioma = 'es') DESC LIMIT 1",
    [nombre]
  );
}

function getWATemplateByNameIdioma(nombre, idioma) {
  return one('SELECT * FROM wa_templates WHERE nombre = ? AND idioma = ?', [nombre, idioma || 'es']);
}

function getWATemplateByMetaId(metaId) {
  return one('SELECT * FROM wa_templates WHERE meta_template_id = ?', [String(metaId)]);
}

// Guarda/actualiza una plantilla tal como la reporta Meta (sync real, no entrada manual).
// Clave = (nombre, idioma): Meta permite el mismo name en varios idiomas — son plantillas
// distintas, cada una con su propio meta_template_id.
function upsertWATemplateFull(t) {
  const existing = getWATemplateByNameIdioma(t.nombre, t.idioma);
  const now = nowUTC();
  if (existing) {
    run(`UPDATE wa_templates SET categoria = ?, estado = ?, componentes = ?, variables = ?,
           meta_template_id = COALESCE(?, meta_template_id), motivo_rechazo = ?, estado_detalle = ?,
           calidad = ?, updated_at = ?, meta_sync_at = ? WHERE id = ?`,
      [t.categoria || '', t.estado || 'APPROVED', t.componentes || '[]', t.variables || '[]',
       t.metaTemplateId || null, t.motivoRechazo || null, t.estadoDetalle || null,
       t.calidad || null, now, now, existing.id]);
    return existing.id;
  }
  run(`INSERT INTO wa_templates (nombre, idioma, categoria, estado, componentes, variables,
         meta_template_id, motivo_rechazo, estado_detalle, calidad, updated_at, meta_sync_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [t.nombre, t.idioma || 'es', t.categoria || '', t.estado || 'APPROVED', t.componentes || '[]', t.variables || '[]',
     t.metaTemplateId || null, t.motivoRechazo || null, t.estadoDetalle || null, t.calidad || null, now, now]);
  return getWATemplateByNameIdioma(t.nombre, t.idioma).id;
}

// Casa por meta_template_id cuando existe (es la clave real de Meta) — el webhook de
// estado y el refresco puntual traen el id, no siempre el (nombre, idioma) exacto.
function upsertWATemplateByMetaId(t) {
  const existing = t.metaTemplateId ? getWATemplateByMetaId(t.metaTemplateId) : null;
  if (existing) {
    const now = nowUTC();
    run(`UPDATE wa_templates SET nombre = ?, idioma = ?, categoria = ?, estado = ?, componentes = ?,
           variables = ?, motivo_rechazo = ?, estado_detalle = ?, calidad = ?, updated_at = ?, meta_sync_at = ?
         WHERE id = ?`,
      [t.nombre, t.idioma || 'es', t.categoria || '', t.estado || 'APPROVED', t.componentes || '[]',
       t.variables || '[]', t.motivoRechazo || null, t.estadoDetalle || null, t.calidad || null, now, now, existing.id]);
    return existing.id;
  }
  return upsertWATemplateFull(t);
}

function setWATemplateMapping(id, mappingJson) {
  run('UPDATE wa_templates SET var_mapping = ? WHERE id = ?', [mappingJson, id]);
}

// Actualiza el estado tras un webhook o un refresco puntual (message_template_status_update).
function setWATemplateEstado(id, { estado, motivo, detalle, calidad } = {}) {
  run(`UPDATE wa_templates SET estado = COALESCE(?, estado), motivo_rechazo = ?, estado_detalle = ?,
         calidad = COALESCE(?, calidad), updated_at = ? WHERE id = ?`,
    [estado || null, motivo || null, detalle || null, calidad || null, nowUTC(), id]);
}

// Alta de un borrador creado en el constructor del CRM (antes de que Meta confirme):
// queda como PENDING con el spec crudo hasta que el webhook (o el POST de creación) lo
// actualice con lo que Meta normalizó.
function insertWATemplateBorrador({ nombre, idioma, categoria, componentes, variables, specJson, creadoPor, metaTemplateId, estado }) {
  const now = nowUTC();
  run(`INSERT INTO wa_templates (nombre, idioma, categoria, estado, componentes, variables, spec_json,
         creado_por, creado_en_crm, meta_template_id, updated_at, meta_sync_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [nombre, idioma || 'es', categoria || '', estado || 'PENDING', componentes || '[]', variables || '[]',
     specJson || '{}', creadoPor || null, metaTemplateId || null, now, now]);
  return getWATemplateByNameIdioma(nombre, idioma || 'es').id;
}

// ── Revisión interna de plantillas (antes de Meta) ──
// Un asesor propone una plantilla y esta NO viaja a Meta hasta que el admin o un jefe
// la aprueba: EN_REVISION → (aprobada) PENDING en Meta → APPROVED/REJECTED, o
// EN_REVISION → CORRECCION (con comentario) → el asesor la corrige y la reenvía.
const ESTADOS_INTERNOS = ['EN_REVISION', 'CORRECCION'];

function getWATemplatesEnRevision() {
  return all(`SELECT t.*, v.nombre AS autor_nombre FROM wa_templates t
              LEFT JOIN vendedores v ON v.id = t.creado_por
              WHERE t.estado IN ('EN_REVISION','CORRECCION') ORDER BY t.updated_at DESC`);
}

function getWATemplatesByAutor(vendedorId) {
  return all('SELECT * FROM wa_templates WHERE creado_por = ? ORDER BY updated_at DESC', [Number(vendedorId)]);
}

// Propuesta del asesor: se guarda el spec crudo, sin id de Meta, en estado EN_REVISION.
function insertWATemplatePropuesta({ nombre, idioma, categoria, componentes, variables, specJson, creadoPor }) {
  const now = nowUTC();
  run(`INSERT INTO wa_templates (nombre, idioma, categoria, estado, componentes, variables, spec_json,
         creado_por, creado_en_crm, updated_at)
       VALUES (?, ?, ?, 'EN_REVISION', ?, ?, ?, ?, 1, ?)`,
    [nombre, idioma || 'es', categoria || '', componentes || '[]', variables || '[]', specJson || '{}', creadoPor || null, now]);
  const t = getWATemplateByNameIdioma(nombre, idioma || 'es');
  return t ? t.id : null;
}

// Tras aprobarla internamente y crearla en Meta: queda con su id real y el estado que
// devolvió Meta (normalmente PENDING).
function marcarWATemplateEnviadaAMeta(id, metaTemplateId, estado) {
  run(`UPDATE wa_templates SET meta_template_id = ?, estado = ?, motivo_rechazo = NULL,
         updated_at = ?, meta_sync_at = ? WHERE id = ?`,
    [metaTemplateId || null, estado || 'PENDING', nowUTC(), nowUTC(), id]);
}

function updateWATemplateSpec(id, { componentes, variables, specJson, estado }) {
  run(`UPDATE wa_templates SET componentes = COALESCE(?, componentes), variables = COALESCE(?, variables),
         spec_json = COALESCE(?, spec_json), estado = COALESCE(?, estado), updated_at = ? WHERE id = ?`,
    [componentes || null, variables || null, specJson || null, estado || null, nowUTC(), id]);
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

function updateCampaignEstado(id, estado, pauseReason) {
  const timestampCol = estado === 'running' ? ', started_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')'
    : (estado === 'done' || estado === 'failed') ? ', finished_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')' : '';
  // pause_reason solo tiene sentido mientras está paused — se limpia en cualquier otra
  // transición (running/done/failed/draft) para no dejar rastro viejo confundiendo al cron.
  const reason = estado === 'paused' ? (pauseReason || 'manual') : null;
  run(`UPDATE campaigns SET estado = ?, pause_reason = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')${timestampCol} WHERE id = ?`, [estado, reason, id]);
}

// Campañas colgadas en 'running' por un reinicio del servidor, o pausadas por el
// runner mismo (tope diario / fuera de ventana) — candidatas a reanudar sin que un
// admin tenga que tocar nada.
function getCampaignsByEstado(estado) {
  return all('SELECT * FROM campaigns WHERE estado = ?', [estado]);
}
function getCampaignsPausadasAutomaticas() {
  return all("SELECT * FROM campaigns WHERE estado = 'paused' AND pause_reason IN ('daily_limit','window')");
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
    if (col) sets.push(`${col} = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
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

// Revertir un opt-out manual (el cliente pidió que lo reactiven, o fue un error).
function deleteOptout(phone) {
  run('DELETE FROM optout WHERE phone = ?', [phone]);
}

// --- Contadores de uso (sección "Uso") ---
function periodoActual() { return new Date().toISOString().slice(0, 7); } // 'YYYY-MM'

// UPSERT +1 (o +n). Nunca debe romper el flujo que lo llama (enviar un mensaje no
// puede fallar porque falló un contador) — quien llame esto en un punto de negocio
// real debe envolverlo en try/catch, igual que el resto de la telemetría del sistema.
function bumpUsage(clave, n = 1) {
  const periodo = periodoActual();
  run(`INSERT INTO usage_counters (periodo, clave, valor) VALUES (?, ?, ?)
       ON CONFLICT(periodo, clave) DO UPDATE SET valor = valor + excluded.valor`, [periodo, clave, n]);
}

function getUsage(periodo) {
  const rows = all('SELECT clave, valor FROM usage_counters WHERE periodo = ?', [periodo || periodoActual()]);
  const out = {};
  rows.forEach(r => { out[r.clave] = r.valor; });
  return out;
}

// Últimos N periodos (para el mini-gráfico de 6 meses) — incluye meses en cero, no
// solo los que tienen filas, para que el gráfico no salte periodos vacíos.
function getUsageRange(claves, meses = 6) {
  const out = [];
  const d = new Date();
  for (let i = meses - 1; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const periodo = dt.toISOString().slice(0, 7);
    const rows = all('SELECT clave, valor FROM usage_counters WHERE periodo = ? AND clave IN (' + claves.map(() => '?').join(',') + ')', [periodo, ...claves]);
    const punto = { periodo };
    claves.forEach(c => { punto[c] = 0; });
    rows.forEach(r => { punto[r.clave] = r.valor; });
    out.push(punto);
  }
  return out;
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

function setVendedor2FA(id, enabled) {
  run('UPDATE vendedores SET two_fa = ? WHERE id = ?', [enabled ? 1 : 0, Number(id)]);
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
  run('UPDATE leads SET etiqueta = ?, progress_pct = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [etiqueta, pct, leadId]);
}

// Marca atómicamente "evento CAPI enviado" para un lead — devuelve true solo la primera
// vez (WHERE ...IS NULL en el UPDATE), así dos requests casi simultáneos para el mismo
// lead no pueden mandar el evento dos veces a Meta.
function markCapiEventSent(leadId, eventKey) {
  const col = eventKey === 'vendido' ? 'capi_vendido_sent_at' : 'capi_cita_sent_at';
  const r = run(`UPDATE leads SET ${col} = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND ${col} IS NULL`, [leadId]);
  return r && r.changes > 0;
}

function updateLeadProgress(leadId, pct) {
  const clamped = Math.max(0, Math.min(100, pct));
  run('UPDATE leads SET progress_pct = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [clamped, leadId]);
}

// Calificación IA de temperatura del lead (caliente|tibio|frio).
function setLeadTemperatura(leadId, temp) {
  if (!['caliente', 'tibio', 'frio'].includes(temp)) return;
  run('UPDATE leads SET temperatura = ?, temperatura_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [temp, leadId]);
}

// Posponer chat (C2): guarda hasta cuándo queda pospuesto (ISO o null para reactivar).
function setLeadSnooze(leadId, untilIso) {
  run('UPDATE leads SET snoozed_until = ? WHERE id = ?', [untilIso || null, leadId]);
}

// CSAT: marcar/desmarcar que el lead está esperando la respuesta de la encuesta.
function setAwaitingCsat(leadId, val) {
  run('UPDATE leads SET awaiting_csat = ? WHERE id = ?', [val ? 1 : 0, leadId]);
}

// --- Cadencia de seguimiento (F3.3) ---
function getCadenciaPasos() {
  return all('SELECT id, orden, dia, mensaje FROM cadencia_pasos ORDER BY orden ASC, dia ASC');
}
function setCadenciaPasos(pasos) {
  const arr = Array.isArray(pasos) ? pasos : [];
  run('DELETE FROM cadencia_pasos');
  arr.forEach((p, i) => {
    if (!p || !p.mensaje) return;
    run('INSERT INTO cadencia_pasos (orden, dia, mensaje) VALUES (?, ?, ?)', [i + 1, Number(p.dia) || (i + 1), String(p.mensaje)]);
  });
  return getCadenciaPasos();
}
function enrollCadencia(leadId) {
  const pasos = getCadenciaPasos();
  if (!pasos.length) return false;
  const inicio = new Date();
  const next = new Date(inicio.getTime() + (Number(pasos[0].dia) || 1) * 86400000);
  const iso = d => d.toISOString().slice(0, 19).replace('T', ' ');
  run('UPDATE leads SET cadencia_activa = 1, cadencia_paso = 0, cadencia_inicio = ?, cadencia_next_at = ? WHERE id = ?',
    [iso(inicio), iso(next), leadId]);
  return true;
}
function stopCadencia(leadId) {
  run('UPDATE leads SET cadencia_activa = 0 WHERE id = ?', [leadId]);
}
function getCadenciaDue() {
  return all(`SELECT * FROM leads WHERE cadencia_activa = 1 AND COALESCE(status, '') != 'cerrado'
              AND cadencia_next_at IS NOT NULL AND cadencia_next_at <= datetime('now')`);
}
function updateCadenciaLead(leadId, { paso, nextAt, activa } = {}) {
  const sets = [], params = [];
  if (paso != null) { sets.push('cadencia_paso = ?'); params.push(paso); }
  if (nextAt !== undefined) { sets.push('cadencia_next_at = ?'); params.push(nextAt); }
  if (activa != null) { sets.push('cadencia_activa = ?'); params.push(activa ? 1 : 0); }
  if (!sets.length) return;
  params.push(leadId);
  run(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`, params);
}
// Auto-inscripción: leads asignados, abiertos, NUNCA inscritos antes (cadencia_inicio
// nulo → una cadencia por lead en su vida) y fríos (el asesor mandó el último mensaje
// hace +24h sin respuesta del cliente). Modelado en getLeadsNecesitanSeguimiento.
function getLeadsParaAutoCadencia(limit = 50) {
  return all(
    `SELECT l.id, l.customer_name, l.assigned_to_id,
            (SELECT direction FROM messages m WHERE m.lead_id = l.id ORDER BY m.id DESC LIMIT 1) AS last_dir,
            (SELECT timestamp FROM messages m WHERE m.lead_id = l.id ORDER BY m.id DESC LIMIT 1) AS last_ts
     FROM leads l
     WHERE COALESCE(l.status, '') != 'cerrado' AND l.assigned_to_id IS NOT NULL
       AND l.cadencia_inicio IS NULL AND COALESCE(l.cadencia_activa, 0) = 0`,
    []
  ).filter(l => l.last_dir === 'outgoing' && l.last_ts &&
      (Date.now() - new Date(String(l.last_ts).replace(' ', 'T')).getTime()) > 24 * 3600 * 1000)
   .slice(0, limit);
}

// --- Notas internas por lead ---
function getNotasByLead(leadId) {
  return all('SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC, id DESC', [leadId]);
}

// Todas las notas del negocio, con el teléfono/nombre del lead — usado en la
// exportación de datos de Privacidad, no en la UI normal de un lead individual.
function getAllNotas() {
  return all(`SELECT n.id, n.lead_id, l.customer_name, l.customer_phone, n.autor, n.nota, n.created_at
              FROM lead_notes n LEFT JOIN leads l ON l.id = n.lead_id
              ORDER BY n.created_at DESC`);
}

function addNota(leadId, autor, nota) {
  run('INSERT INTO lead_notes (lead_id, autor, nota) VALUES (?, ?, ?)', [leadId, autor || '', nota]);
}

function deleteNota(id) {
  run('DELETE FROM lead_notes WHERE id = ?', [id]);
}

// --- Reasignación de un lead (admin o automática) ---
function reassignLead(leadId, vendedor, vendedorAnteriorId) {
  run('UPDATE leads SET assigned_to_id = ?, assigned_to_phone = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [vendedor.id, vendedor.telefono, leadId]);
  run('UPDATE vendedores SET total_leads = total_leads + 1 WHERE id = ?', [vendedor.id]);
  if (vendedorAnteriorId) {
    run('UPDATE vendedores SET total_leads = MAX(0, total_leads - 1) WHERE id = ?', [vendedorAnteriorId]);
  }
}

// --- Eliminar vendedor y reasignar sus leads ---
function deleteVendedor(id) {
  const activos = all("SELECT * FROM vendedores WHERE estado = ? AND id != ? AND id NOT IN (SELECT vendedor_id FROM usuarios WHERE rol = 'admin' AND vendedor_id IS NOT NULL) ORDER BY total_leads ASC", ['activo', id]);
  const leadsReasignar = all('SELECT id, zona FROM leads WHERE assigned_to_id = ? AND status != ?', [id, 'cerrado']);

  if (activos.length > 0) {
    const siguiente = activos[0];
    // Por lead: si tiene zona resuelta, se prefiere un asesor que la cubra (mismo
    // criterio que el resto de la app, F-zonas) antes que el fallback global de menor
    // carga — evita que los leads huérfanos de Mariquita caigan en un asesor de Tocaima
    // solo porque quedó con menos leads en el momento del borrado.
    const { vendedorCubreZona } = require('../services/zonas');
    leadsReasignar.forEach(lead => {
      const destino = (lead.zona && activos.find(v => vendedorCubreZona(v, lead.zona))) || siguiente;
      run('UPDATE leads SET assigned_to_id = ?, assigned_to_phone = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [destino.id, destino.telefono, lead.id]);
      run('UPDATE vendedores SET total_leads = total_leads + 1 WHERE id = ?', [destino.id]);
    });
    // Reasignar también las conversaciones del schema multicanal — tienen su propia
    // FK (conversations.assigned_to_id → vendedores.id) independiente de `leads`, y
    // si no se limpia primero, DELETE FROM vendedores revienta con "FOREIGN KEY
    // constraint failed" en cuanto el vendedor tiene una sola conversación asignada.
    run('UPDATE conversations SET assigned_to_id = ? WHERE assigned_to_id = ?', [siguiente.id, id]);
  } else {
    // No hay vendedores activos: marcar leads como huérfanos (sin asignar) y cambiar status a 'nuevo' para que round-robin los reasigne
    leadsReasignar.forEach(lead => {
      run('UPDATE leads SET assigned_to_id = NULL, assigned_to_phone = NULL, status = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', ['nuevo', lead.id]);
    });
    run('UPDATE conversations SET assigned_to_id = NULL, status = ? WHERE assigned_to_id = ?', ['nuevo', id]);
  }

  // Otras FK reales hacia vendedores.id que deleteVendedor debe liberar antes de
  // borrar la fila padre, o SQLite rechaza el DELETE con FOREIGN KEY constraint failed.
  run('UPDATE lotes SET asesor_id = NULL WHERE asesor_id = ?', [id]);
  run('DELETE FROM ubicaciones_guardadas WHERE vendedor_id = ?', [id]);
  // Sin FK declarada, pero quedaría huérfana (NOT NULL vendedor_id) sin dueño posible.
  run('DELETE FROM vendedor_templates WHERE vendedor_id = ?', [id]);

  run('DELETE FROM push_subscriptions WHERE vendedor_id = ?', [id]);
  run('DELETE FROM sessions WHERE vendedor_id = ?', [id]);
  run('DELETE FROM usuarios WHERE vendedor_id = ?', [id]);
  run('DELETE FROM feed_reactions WHERE vendedor_id = ?', [id]);
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
  `, ['incoming', 'outgoing', '2000-01-01', ...params, lim, off]);
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
function createCustomer(name, phone, avatarUrl) {
  run('INSERT INTO customers (name, phone, avatar_url) VALUES (?, ?, ?)', [name || 'Cliente', phone || '', avatarUrl || '']);
  return one('SELECT * FROM customers WHERE id = (SELECT last_insert_rowid())');
}

// Backfill del avatar del cliente (solo lo llenamos si aún está vacío — WhatsApp
// nunca lo tendrá porque la Graph API no expone foto de perfil de clientes).
function setCustomerAvatarIfEmpty(customerId, avatarUrl) {
  if (!avatarUrl) return;
  run("UPDATE customers SET avatar_url = ? WHERE id = ? AND (avatar_url IS NULL OR avatar_url = '')", [avatarUrl, customerId]);
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
    SELECT conv.*, v.nombre AS assigned_to_nombre, v.foto AS assigned_to_foto
    FROM conversations conv
    LEFT JOIN vendedores v ON v.id = conv.assigned_to_id
    WHERE conv.id = ?
  `, [id]);
}

function getConversationsByVendedorId(vendedorId) {
  return all(`
    SELECT conv.*, c.name AS customer_name, c.phone AS customer_phone, c.avatar_url AS customer_avatar
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

function getConversationByLeadId(leadId) {
  return one('SELECT * FROM conversations WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [leadId]);
}

function getChannelUserIdForLead(leadId, channel) {
  const lead = one('SELECT customer_phone FROM leads WHERE id = ?', [leadId]);
  if (!lead) return null;
  // Primero buscar en customer_channels por el canal específico
  const ch = one(`
    SELECT cc.channel_user_id
    FROM conversations conv
    JOIN customer_channels cc ON cc.customer_id = conv.customer_id AND cc.channel = conv.channel
    WHERE conv.lead_id = ? AND conv.channel = ?
    LIMIT 1
  `, [leadId, channel]);
  if (ch) return ch.channel_user_id;
  // Fallback: buscar directamente en customer_channels sin depender de conversations.lead_id
  if (lead.customer_phone && lead.customer_phone.startsWith('messenger_')) {
    const psid = lead.customer_phone.replace('messenger_', '');
    if (psid) return psid;
  }
  if (lead.customer_phone && lead.customer_phone.startsWith('instagram_')) {
    const igId = lead.customer_phone.replace('instagram_', '');
    if (igId) return igId;
  }
  // Fallback: si el canal es whatsapp, usar el teléfono del lead
  if (channel === 'whatsapp') return lead.customer_phone;
  return null;
}

function updateConversationStatus(id, status) {
  run('UPDATE conversations SET status = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [status, id]);
}

function updateConversationTag(id, etiqueta) {
  const pct = PROGRESS_MAP[etiqueta] || 0;
  run('UPDATE conversations SET etiqueta = ?, progress_pct = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [etiqueta, pct, id]);
}

function updateConversationPriority(id, priority) {
  run('UPDATE conversations SET priority = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [priority, id]);
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
    SELECT conv.*, c.name AS customer_name, c.phone AS customer_phone, c.avatar_url AS customer_avatar, v.nombre AS assigned_to_nombre, v.foto AS assigned_to_foto,
      CASE WHEN l.id IS NOT NULL THEN l.unread_count ELSE conv.unread_count END AS unread_count,
      l.status AS lead_status
    FROM conversations conv
    LEFT JOIN customers c ON c.id = conv.customer_id
    LEFT JOIN vendedores v ON v.id = conv.assigned_to_id
    LEFT JOIN leads l ON l.id = conv.lead_id
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
    SELECT c.*, l.customer_name, l.customer_phone, v.nombre AS vendedor_nombre,
      (SELECT sm.send_at FROM scheduled_messages sm
        WHERE sm.cita_id = c.id AND sm.tipo = 'template' AND sm.estado = 'pendiente'
        ORDER BY sm.id DESC LIMIT 1) AS recordatorio_send_at
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

// Próxima cita futura del lead (o null) — usada para resolver {{fecha_cita}}/{{hora_cita}}
// en plantillas fuera del flujo específico de "recordatorio de cita" (ver template-vars.js).
function getProximaCitaByLead(leadId) {
  return one(
    "SELECT * FROM citas WHERE lead_id = ? AND estado != 'cancelada' AND fecha >= datetime('now') ORDER BY fecha ASC LIMIT 1",
    [Number(leadId)]
  );
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

// --- Recordatorio de cita (mensaje programado tipo 'template') ---
// Se guarda en scheduled_messages con tipo='template' y cita_id. El scheduler lo envía
// con la plantilla de Meta aunque la ventana de 24h esté cerrada (eso es lo que hace
// robusto el recordatorio). body = texto plano que registra el chat; template_* = plantilla.
function getRecordatorioCita(citaId) {
  return one(`SELECT * FROM scheduled_messages WHERE cita_id = ? AND tipo = 'template' AND estado = 'pendiente' ORDER BY id DESC LIMIT 1`, [citaId]);
}

function createRecordatorioCita({ citaId, leadId, vendedorId, sendAt, body, templateNombre, templateIdioma, templateParams }) {
  run(`INSERT INTO scheduled_messages (lead_id, vendedor_id, body, send_at, tipo, cita_id, template_nombre, template_idioma, template_params)
       VALUES (?, ?, ?, ?, 'template', ?, ?, ?, ?)`,
    [leadId, vendedorId || 0, body || '', sendAt, citaId, templateNombre, templateIdioma || 'es', templateParams || '[]']);
  const r = one('SELECT id FROM scheduled_messages WHERE cita_id = ? ORDER BY id DESC LIMIT 1', [citaId]);
  return r ? r.id : null;
}

function cancelarRecordatorioCita(citaId) {
  run(`UPDATE scheduled_messages SET estado = 'cancelado', last_error = 'recordatorio_cancelado'
       WHERE cita_id = ? AND tipo = 'template' AND estado = 'pendiente'`, [citaId]);
}

function cancelarRecordatorioByCitaCierre(citaId) {
  // Al marcar la cita como hecha/cancelada o al borrarla, su recordatorio pendiente muere.
  cancelarRecordatorioCita(citaId);
}

// --- Puente legacy → multicanal ---
// Sincroniza un lead (tabla legacy) hacia customers/conversations/timeline
// para que el inbox multicanal del admin refleje TODO el movimiento de WhatsApp.
// data: { direction: 'incoming'|'outgoing', body, media, fromNumber, toNumber, messageId }
function syncLeadToConversation(lead, data = {}) {
  try {
    if (!lead || !lead.id) return null;
    const phone = lead.customer_phone || '';

    // Detectar canal real desde el prefijo del teléfono del lead
    let channel = 'whatsapp';
    if (phone.startsWith('messenger_')) channel = 'messenger';
    else if (phone.startsWith('instagram_')) channel = 'instagram';

    // 1. Conversación existente ligada a este lead
    let conv = one('SELECT * FROM conversations WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [lead.id]);

    if (!conv) {
      // 2. Customer por canal (o crearlo)
      const channelUserId = channel === 'whatsapp' ? phone : phone.replace(/^(messenger_|instagram_)/, '');
      let customer = findCustomerByChannel(channel, channelUserId);
      if (!customer) {
        customer = createCustomer(lead.customer_name || 'Cliente', channel === 'whatsapp' ? phone : '');
        linkChannelToCustomer(customer.id, channel, channelUserId, lead.customer_name || '');
      }
      const pct = PROGRESS_MAP[lead.etiqueta || 'sin_clasificar'] || 5;
      run('INSERT INTO conversations (channel, channel_conversation_id, customer_id, lead_id, assigned_to_id, status, etiqueta, progress_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [channel, channelUserId, customer.id, lead.id, lead.assigned_to_id || null, lead.status === 'cerrado' ? 'cerrado' : (lead.assigned_to_id ? 'asignado' : 'nuevo'), lead.etiqueta || 'sin_clasificar', pct]);
      conv = one('SELECT * FROM conversations WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [lead.id]);
    }
    if (!conv) return null;

    // 3. Mantener asignación/etiqueta/estado en espejo con el lead
    const eta = lead.etiqueta || conv.etiqueta || 'sin_clasificar';
    const convPct = PROGRESS_MAP[eta] || 5;
    run('UPDATE conversations SET assigned_to_id = ?, etiqueta = ?, progress_pct = ?, status = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [
      lead.assigned_to_id || null,
      eta, convPct,
      lead.status === 'cerrado' ? 'cerrado' : (lead.assigned_to_id ? 'asignado' : 'nuevo'),
      conv.id,
    ]);

    // 4. Evento en el timeline (si hay mensaje)
    if (data.body || data.media) {
      const m = data.media || {};
      addTimelineEvent(conv.id, 'message', {
        channel: channel,
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
      run('UPDATE conversations SET last_message = ?, last_message_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'), unread_count = CASE WHEN ? = 1 THEN COALESCE(unread_count,0) + 1 ELSE unread_count END, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?',
        [String(data.body || `[${(data.media || {}).media_type || 'media'}]`).slice(0, 200), inc, conv.id]);
    }
    return conv;
  } catch (e) {
    // Fase 4 (docs/AUDITORIA_2026-08.md 2.4): antes solo console.error — un fallo de
    // sincronización entre el esquema legacy (leads/messages) y el multicanal
    // (customers/conversations/timeline) quedaba solo en logs de proceso, sin que nadie
    // se enterara hasta que un usuario reportaba el síntoma (el bug de media_filename
    // fue exactamente así). logger.logError() lo deja en data/errors.log Y lo suma al
    // contador que /api/admin/salud expone en el panel de Salud del Sistema — un fallo
    // de sync ahora es visible sin esperar a que alguien note el dato desalineado.
    try {
      require('../services/logger').logError('syncLeadToConversation', e, {
        leadId: lead && lead.id, direction: data && data.direction,
      });
    } catch (logErr) { console.error('syncLeadToConversation:', e.message); }
    // En desarrollo, propagar en vez de tragar: un fallo aquí es exactamente el tipo
    // de desincronización legacy↔multicanal que se quiere detectar temprano, antes de
    // que llegue a producción como "el chat no aparece en el inbox del admin".
    if (process.env.NODE_ENV !== 'production') throw e;
    return null;
  }
}

// --- Timeline ---
function addTimelineEvent(conversationId, eventType, data = {}) {
  const d = data || {};
  // created_at se fija explícito en UTC (nowUTC()) en vez de dejar que decida el DEFAULT
  // de la columna — ese DEFAULT quedó congelado en UTC sin sufijo 'Z' en la BD real de
  // producción (creada antes de unificar la convención), y depender de él es exactamente
  // lo que causaba que el inbox admin (lee timeline) y el panel móvil (lee messages, que
  // sí fija timestamp explícito) mostraran horas distintas para el mismo mensaje.
  // Ver docs/AUDITORIA_2026-08.md sección 1.3.
  run(`
    INSERT INTO timeline (
      conversation_id, event_type, channel, body, direction,
      from_number, to_number, media_type, media_id, media_mime, media_filename, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    conversationId, eventType || 'message', d.channel || '', d.body || '', d.direction || 'incoming',
    d.from_number || '', d.to_number || '', d.media_type || null, d.media_id || null,
    d.media_mime || null, d.media_filename || null, d.metadata ? JSON.stringify(d.metadata) : '{}', nowUTC(),
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
    SELECT l.*, v.nombre AS assigned_to_nombre, v.foto AS assigned_to_foto, ${SQL_VISTO_SIN_RESPONDER}
    FROM leads l
    LEFT JOIN vendedores v ON v.id = l.assigned_to_id
    WHERE l.id NOT IN (SELECT lead_id FROM conversations WHERE lead_id IS NOT NULL)
    ORDER BY l.updated_at DESC, l.id DESC
  `);
}

// Único camino de creación de una conversación a partir de un lead legacy. Antes el
// INSERT de `conversations`, el backfill de mensajes al timeline y sus updates iban
// sueltos — si algo fallaba a la mitad (p.ej. un addTimelineEvent con datos corruptos),
// la conversación quedaba a medias: creada pero sin todos sus mensajes, indistinguible
// de una nueva a ojos del siguiente arranque. Envuelto en una transacción: o se crea
// completa, o no se crea nada. El índice único de conversations.lead_id (schema.js)
// sigue siendo la última línea de defensa contra la carrera de dos requests concurrentes
// intentando crear la misma conversación a la vez.
function getOrCreateConversationForLead(leadId) {
  const lead = one('SELECT * FROM leads WHERE id = ?', [leadId]);
  if (!lead) return null;
  let conv = one('SELECT * FROM conversations WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [lead.id]);
  if (conv) return getConversationById(conv.id);

  const adapter = require('./adapter');
  adapter.exec('BEGIN');
  try {
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
    if (!conv) throw new Error('conversación no se pudo insertar');
    const msgs = getMessagesByLead(lead.id, { limit: 500 }); // backfill: hasta 500 mensajes recientes
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
    adapter.exec('COMMIT');
  } catch (e) {
    try { adapter.exec('ROLLBACK'); } catch (rbErr) { /* nada que revertir si BEGIN nunca aplicó */ }
    try { require('../services/logger').logError('getOrCreateConversationForLead', e, { leadId }); }
    catch (logErr) { console.error('getOrCreateConversationForLead:', e.message); }
    return null;
  }
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
        assigned_to_id: l.assigned_to_id, assigned_to_nombre: l.assigned_to_nombre, assigned_to_foto: l.assigned_to_foto || null,
        status: l.status, unread_count: l.unread_count || 0,
        last_message: l.last_message, last_message_at: l.updated_at || l.created_at,
        etiqueta: l.etiqueta, lead_id: l.id,
        visto_sin_responder: l.visto_sin_responder || 0,
        updated_at: l.updated_at || l.created_at, created_at: l.created_at,
      });
  });
  unified.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
  return unified;
}

// Convierte el formato lineal viejo ({trigger_event, conditions[], actions[]}) al
// grafo {nodes,edges} que usa el editor visual y el motor v2 — trigger → (if, si hay
// condiciones) → acciones en cadena. Solo toca filas sin graph todavía, así que
// llamarla en cada arranque es seguro y barato (nada que migrar de la segunda vez
// en adelante). Sin esto, los flujos creados antes del editor visual quedarían
// invisibles/rotos en el canvas nuevo.
function migrateWorkflowsToGraph() {
  let rows;
  try { rows = all("SELECT * FROM workflows WHERE graph IS NULL OR graph = ''"); }
  catch (e) { return; } // defensivo: provisioning nuevo antes de que exista la tabla
  for (const row of rows) {
    let conditions = [], actions = [];
    try { conditions = JSON.parse(row.conditions || '[]'); } catch (e) {}
    try { actions = JSON.parse(row.actions || '[]'); } catch (e) {}

    const nodes = [{ id: 'n1', type: 'trigger', subtype: row.trigger_event, params: {}, x: 80, y: 60 }];
    const edges = [];
    let prevId = 'n1', prevBranch = null, seq = 2;

    if (conditions.length) {
      const condId = 'n' + (seq++);
      nodes.push({ id: condId, type: 'condition', subtype: 'if', params: { logic: 'and', conditions }, x: 80, y: 190 });
      edges.push({ from: prevId, to: condId, branch: null });
      prevId = condId; prevBranch = 'true';
    }

    actions.forEach((action, i) => {
      const actId = 'n' + (seq++);
      nodes.push({ id: actId, type: 'action', subtype: action.type, params: action.params || {}, x: 80, y: 190 + 130 * (i + (conditions.length ? 1 : 0)) });
      edges.push({ from: prevId, to: actId, branch: prevBranch });
      prevId = actId; prevBranch = null;
    });

    run('UPDATE workflows SET graph = ? WHERE id = ?', [JSON.stringify({ nodes, edges }), row.id]);
  }
  if (rows.length) console.log(`[WORKFLOWS] ${rows.length} flujo(s) migrado(s) al formato de grafo`);
}

// --- Workflows (automatización IF/THEN — editor visual de nodos) ---
// vendedor_id = NULL → flujo global de la empresa (lo crea el admin/jefe).
// vendedor_id = N    → flujo privado de ese asesor: solo corre sobre SUS leads.
// `vendedorId` filtra a los de un asesor; `soloGlobales` a los de la empresa.
function getAllWorkflows({ activo, vendedorId, soloGlobales } = {}) {
  const cond = [];
  const args = [];
  if (activo === true) cond.push('w.activo = 1');
  if (activo === false) cond.push('w.activo = 0');
  if (vendedorId != null) { cond.push('w.vendedor_id = ?'); args.push(Number(vendedorId)); }
  else if (soloGlobales) cond.push('w.vendedor_id IS NULL');
  const where = cond.length ? ' WHERE ' + cond.join(' AND ') : '';
  return all(`SELECT w.*, v.nombre AS vendedor_nombre FROM workflows w
              LEFT JOIN vendedores v ON v.id = w.vendedor_id${where} ORDER BY w.id`, args);
}

function getWorkflowById(id) {
  return one('SELECT * FROM workflows WHERE id = ?', [id]);
}

// data.graph, si viene, ya es un objeto {nodes,edges} — se guarda serializado. Si no
// viene (creación vieja vía trigger_event/conditions/actions), migrateWorkflowsToGraph()
// lo completa en el próximo arranque; no hace falta duplicar esa lógica aquí.
// `conditions`/`actions` NO se escriben más: el motor (runGraph) solo lee `graph` desde
// hace tiempo, y seguir serializándolas ahí era trabajo muerto que además podía sugerir,
// erróneamente, que esas columnas seguían siendo la fuente de verdad. Las columnas se
// dejan en el schema (DEFAULT '[]') solo para que migrateWorkflowsToGraph() siga
// pudiendo leer filas viejas que nunca tuvieron graph.
function createWorkflow(data) {
  run('INSERT INTO workflows (nombre, activo, trigger_event, graph, vendedor_id, updated_at) VALUES (?, ?, ?, ?, ?, strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'))', [
    data.nombre, data.activo === false ? 0 : 1, data.trigger_event || (data.graph && inferTriggerFromGraph(data.graph)) || '',
    data.graph ? JSON.stringify(data.graph) : null,
    data.vendedorId != null ? Number(data.vendedorId) : null,
  ]);
  return one('SELECT * FROM workflows WHERE id = (SELECT last_insert_rowid())');
}

function updateWorkflow(id, data) {
  const actual = getWorkflowById(id);
  if (!actual) return null;
  const graph = data.graph !== undefined ? data.graph : null;
  run('UPDATE workflows SET nombre = ?, activo = ?, trigger_event = ?, graph = COALESCE(?, graph), updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?', [
    data.nombre !== undefined ? data.nombre : actual.nombre,
    data.activo !== undefined ? (data.activo ? 1 : 0) : actual.activo,
    data.trigger_event !== undefined ? data.trigger_event : (graph ? inferTriggerFromGraph(graph) : actual.trigger_event),
    graph ? JSON.stringify(graph) : null,
    id,
  ]);
  return getWorkflowById(id);
}

function deleteWorkflow(id) {
  run('DELETE FROM workflow_jobs WHERE workflow_id = ?', [id]);
  run('DELETE FROM workflow_logs WHERE workflow_id = ?', [id]);
  run('DELETE FROM workflows WHERE id = ?', [id]);
}

// El nodo 'trigger' del grafo manda sobre trigger_event — es lo que el motor usa para
// indexar qué flujos evaluar en cada evento (evita escanear el grafo completo de
// CADA workflow en CADA mensaje).
function inferTriggerFromGraph(graph) {
  const g = typeof graph === 'string' ? JSON.parse(graph) : graph;
  const t = (g.nodes || []).find(n => n.type === 'trigger');
  return t ? t.subtype : '';
}

function addWorkflowLog(workflowId, conversationId, triggerEvent, result) {
  run('INSERT INTO workflow_logs (workflow_id, conversation_id, trigger_event, result) VALUES (?, ?, ?, ?)', [
    workflowId, conversationId || null, triggerEvent, JSON.stringify(result || {}),
  ]);
}

function getWorkflowLogs(workflowId) {
  return all('SELECT * FROM workflow_logs WHERE workflow_id = ? ORDER BY created_at DESC, id DESC', [workflowId]);
}

// --- Workflow jobs: delays persistentes (nodo 'delay' del grafo) ---
// Un delay corta la ejecución y agenda su reanudación aquí — sobrevive un reinicio
// del servidor a mitad de un flujo con espera (antes de esto, un delay solo podía
// vivir en memoria y se perdía sin avisar si el proceso se reiniciaba).
function createWorkflowJob(workflowId, nodeId, context, runAt) {
  run('INSERT INTO workflow_jobs (workflow_id, node_id, context, run_at) VALUES (?, ?, ?, ?)', [
    workflowId, nodeId, JSON.stringify(context || {}), runAt,
  ]);
}

function getDueWorkflowJobs() {
  return all("SELECT * FROM workflow_jobs WHERE estado = 'pending' AND run_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now') ORDER BY run_at ASC LIMIT 100");
}

function markWorkflowJobDone(id) {
  run("UPDATE workflow_jobs SET estado = 'done' WHERE id = ?", [id]);
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
function queuePendingOutbound(leadId, phone, body, messageId) {
  run('INSERT INTO pending_outbound (lead_id, phone, body, message_id) VALUES (?, ?, ?, ?)', [leadId || null, phone, body, messageId || null]);
  const r = one('SELECT id FROM pending_outbound WHERE id = last_insert_rowid()');
  return r ? r.id : null;
}
// El caller (p.ej. POST /responder) crea la burbuja 'pending' DESPUÉS de encolar;
// esto la vincula para que el flush actualice esa fila en vez de duplicarla.
function attachPendingMessage(pendingId, messageId) {
  if (!pendingId || !messageId) return;
  run('UPDATE pending_outbound SET message_id = ? WHERE id = ?', [messageId, pendingId]);
}
function getPendingOutbound(phone) {
  return all('SELECT * FROM pending_outbound WHERE phone = ? ORDER BY id ASC', [phone]);
}
function clearPendingOutbound(phone) {
  run('DELETE FROM pending_outbound WHERE phone = ?', [phone]);
}
// Borrado por fila: el flush solo descarta lo que YA salió. Vaciar la cola entera
// antes de enviar perdía el mensaje del asesor cuando el reenvío fallaba.
function deletePendingOutbound(id) {
  run('DELETE FROM pending_outbound WHERE id = ?', [id]);
}
function bumpPendingOutboundIntento(id) {
  run('UPDATE pending_outbound SET intentos = COALESCE(intentos,0) + 1 WHERE id = ?', [id]);
}

// ===================== PROYECTOS / LOTES =====================

// Devuelve proyectos con conteos agregados por estado de sus lotes.
function getProyectos() {
  return all(`
    SELECT p.*,
      (SELECT COUNT(*) FROM lotes l WHERE l.proyecto_id = p.id) AS total_lotes,
      (SELECT COUNT(*) FROM lotes l WHERE l.proyecto_id = p.id AND l.estado = 'disponible') AS disponibles,
      (SELECT COUNT(*) FROM lotes l WHERE l.proyecto_id = p.id AND l.estado = 'separado') AS separados,
      (SELECT COUNT(*) FROM lotes l WHERE l.proyecto_id = p.id AND l.estado = 'vendido') AS vendidos,
      (SELECT COUNT(*) FROM lotes l WHERE l.proyecto_id = p.id AND l.estado = 'reservado') AS reservados,
      (SELECT COUNT(*) FROM lotes l WHERE l.proyecto_id = p.id AND l.estado = 'bloqueado') AS bloqueados,
      (SELECT COUNT(*) FROM lotes l WHERE l.proyecto_id = p.id AND l.estado = 'negociacion') AS negociacion,
      (SELECT MIN(l.precio) FROM lotes l WHERE l.proyecto_id = p.id AND l.precio > 0) AS precio_min,
      (SELECT MAX(l.precio) FROM lotes l WHERE l.proyecto_id = p.id) AS precio_max,
      (SELECT COUNT(DISTINCT l.asesor_id) FROM lotes l WHERE l.proyecto_id = p.id AND l.asesor_id IS NOT NULL) AS asesores_activos
    FROM proyectos p
    ORDER BY p.created_at DESC
  `);
}

function getProyectoById(id) {
  return one('SELECT * FROM proyectos WHERE id = ?', [id]);
}

function createProyecto(d = {}) {
  run(`INSERT INTO proyectos (nombre, ciudad, departamento, descripcion, imagen_url, estado, fecha_inicio, plano_url, plano_bounds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.nombre, d.ciudad || '', d.departamento || '', d.descripcion || '', d.imagen_url || '',
     d.estado || 'en_venta', d.fecha_inicio || '', d.plano_url || '', d.plano_bounds || '']);
  return one('SELECT * FROM proyectos WHERE id = (SELECT last_insert_rowid())');
}

function updateProyecto(id, d = {}) {
  const p = getProyectoById(id);
  if (!p) return null;
  run(`UPDATE proyectos SET nombre=?, ciudad=?, departamento=?, descripcion=?, imagen_url=?, estado=?, fecha_inicio=?, plano_url=?, plano_bounds=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
    [d.nombre ?? p.nombre, d.ciudad ?? p.ciudad, d.departamento ?? p.departamento, d.descripcion ?? p.descripcion,
     d.imagen_url ?? p.imagen_url, d.estado ?? p.estado, d.fecha_inicio ?? p.fecha_inicio,
     d.plano_url ?? p.plano_url, d.plano_bounds ?? p.plano_bounds, id]);
  return getProyectoById(id);
}

function deleteProyecto(id) {
  run('DELETE FROM lote_historial WHERE lote_id IN (SELECT id FROM lotes WHERE proyecto_id = ?)', [id]);
  run('DELETE FROM lotes WHERE proyecto_id = ?', [id]);
  run('DELETE FROM proyectos WHERE id = ?', [id]);
}

function getLotesByProyecto(proyectoId) {
  return all(`
    SELECT l.*, v.nombre AS asesor_nombre, c.name AS cliente_nombre
    FROM lotes l
    LEFT JOIN vendedores v ON v.id = l.asesor_id
    LEFT JOIN customers c ON c.id = l.cliente_id
    WHERE l.proyecto_id = ?
    ORDER BY l.id ASC
  `, [proyectoId]);
}

function getLoteById(id) {
  return one(`
    SELECT l.*, v.nombre AS asesor_nombre, c.name AS cliente_nombre, c.phone AS cliente_telefono
    FROM lotes l
    LEFT JOIN vendedores v ON v.id = l.asesor_id
    LEFT JOIN customers c ON c.id = l.cliente_id
    WHERE l.id = ?
  `, [id]);
}

// ===== Catálogo PÚBLICO (sin sesión) =====
// Devuelve SOLO datos vendibles. Nunca expone cliente_id, lead_id, asesor,
// observaciones internas, documentos ni historial. Solo proyectos comercializables.
function getProyectosPublicos() {
  return all(`
    SELECT p.id, p.nombre, p.ciudad, p.departamento, p.descripcion, p.imagen_url, p.estado,
      (SELECT COUNT(*) FROM lotes l WHERE l.proyecto_id = p.id AND l.estado = 'disponible') AS disponibles,
      (SELECT MIN(l.precio) FROM lotes l WHERE l.proyecto_id = p.id AND l.estado = 'disponible' AND l.precio > 0) AS precio_min,
      (SELECT MAX(l.precio) FROM lotes l WHERE l.proyecto_id = p.id AND l.estado = 'disponible') AS precio_max
    FROM proyectos p
    WHERE p.estado IN ('preventa','en_venta')
    ORDER BY p.created_at DESC
  `);
}

function getProyectoPublicoById(id) {
  const p = one(`SELECT id, nombre, ciudad, departamento, descripcion, imagen_url, estado, plano_url, plano_bounds
                 FROM proyectos WHERE id = ? AND estado IN ('preventa','en_venta')`, [id]);
  if (!p) return null;
  // Solo lotes disponibles, sin datos internos.
  p.lotes = all(`
    SELECT id, numero, manzana, area, dimensiones, precio, estado, poligono, fotografias
    FROM lotes WHERE proyecto_id = ? AND estado = 'disponible'
    ORDER BY manzana ASC, numero ASC
  `, [id]);
  return p;
}

function _loteInsert(proyectoId, d = {}) {
  run(`INSERT INTO lotes (proyecto_id, numero, manzana, area, dimensiones, precio, estado, cliente_id, lead_id, asesor_id, poligono, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [proyectoId, d.numero || '', d.manzana || '', d.area || 0, d.dimensiones || '', d.precio || 0,
     d.estado || 'disponible', d.cliente_id || null, d.lead_id || null, d.asesor_id || null,
     typeof d.poligono === 'string' ? d.poligono : JSON.stringify(d.poligono || []), d.observaciones || '']);
}

function createLote(proyectoId, d = {}) {
  _loteInsert(proyectoId, d);
  return getLoteById(one('SELECT last_insert_rowid() AS id').id);
}

function bulkCreateLotes(proyectoId, lotes = []) {
  let n = 0;
  for (const l of lotes) { _loteInsert(proyectoId, l); n++; }
  return n;
}

function updateLote(id, d = {}) {
  const l = getLoteById(id);
  if (!l) return null;
  run(`UPDATE lotes SET numero=?, manzana=?, area=?, dimensiones=?, precio=?, cliente_id=?, asesor_id=?, poligono=?, observaciones=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
    [d.numero ?? l.numero, d.manzana ?? l.manzana, d.area ?? l.area, d.dimensiones ?? l.dimensiones,
     d.precio ?? l.precio, d.cliente_id ?? l.cliente_id, d.asesor_id ?? l.asesor_id,
     d.poligono != null ? (typeof d.poligono === 'string' ? d.poligono : JSON.stringify(d.poligono)) : l.poligono,
     d.observaciones ?? l.observaciones, id]);
  return getLoteById(id);
}

function addLoteHistorial(loteId, evento, detalle, autor) {
  run('INSERT INTO lote_historial (lote_id, evento, detalle, autor) VALUES (?, ?, ?, ?)',
    [loteId, evento || '', detalle || '', autor || '']);
}

function getLoteHistorial(loteId) {
  return all('SELECT * FROM lote_historial WHERE lote_id = ? ORDER BY created_at DESC, id DESC', [loteId]);
}

// Cambia el estado del lote, ajusta fechas de separación/venta y registra historial.
function updateLoteEstado(id, estado, opts = {}) {
  const l = getLoteById(id);
  if (!l) return null;
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
  let sets = ['estado = ?', "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"];
  const params = [estado];
  if (opts.cliente_id !== undefined) { sets.push('cliente_id = ?'); params.push(opts.cliente_id || null); }
  if (opts.asesor_id !== undefined) { sets.push('asesor_id = ?'); params.push(opts.asesor_id || null); }
  if (estado === 'separado' && !l.fecha_separacion) sets.push(`fecha_separacion = ${now}`);
  if (estado === 'vendido') sets.push(`fecha_venta = ${now}`);
  params.push(id);
  run(`UPDATE lotes SET ${sets.join(', ')} WHERE id = ?`, params);
  addLoteHistorial(id, 'estado', `${l.estado} → ${estado}`, opts.autor || '');
  return getLoteById(id);
}

function setLoteObservacion(id, texto, autor) {
  const l = getLoteById(id);
  if (!l) return null;
  run(`UPDATE lotes SET observaciones = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, [texto || '', id]);
  addLoteHistorial(id, 'observacion', texto || '', autor || '');
  return getLoteById(id);
}

function setLotePrecio(id, precio, autor) {
  const l = getLoteById(id);
  if (!l) return null;
  run(`UPDATE lotes SET precio = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, [precio || 0, id]);
  addLoteHistorial(id, 'precio', `$${l.precio} → $${precio}`, autor || '');
  return getLoteById(id);
}

// Agrega un item (url/objeto) al array JSON de documentos o fotografias.
function addLoteMedia(id, campo, item) {
  const l = getLoteById(id);
  if (!l || (campo !== 'documentos' && campo !== 'fotografias')) return null;
  let arr = [];
  try { arr = JSON.parse(l[campo] || '[]'); } catch (e) { arr = []; }
  arr.push(item);
  run(`UPDATE lotes SET ${campo} = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, [JSON.stringify(arr), id]);
  return getLoteById(id);
}

function deleteLote(id) {
  run('DELETE FROM lote_historial WHERE lote_id = ?', [id]);
  run('DELETE FROM lotes WHERE id = ?', [id]);
}

function getProyectoStats(proyectoId) {
  const base = one(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN estado='disponible' THEN 1 ELSE 0 END) AS disponibles,
      SUM(CASE WHEN estado='separado' THEN 1 ELSE 0 END) AS separados,
      SUM(CASE WHEN estado='vendido' THEN 1 ELSE 0 END) AS vendidos,
      SUM(CASE WHEN estado='reservado' THEN 1 ELSE 0 END) AS reservados,
      SUM(CASE WHEN estado='bloqueado' THEN 1 ELSE 0 END) AS bloqueados,
      SUM(CASE WHEN estado='negociacion' THEN 1 ELSE 0 END) AS negociacion,
      SUM(CASE WHEN estado='vendido' THEN precio ELSE 0 END) AS ingresos,
      MIN(CASE WHEN precio > 0 THEN precio END) AS precio_min,
      MAX(precio) AS precio_max,
      COUNT(DISTINCT asesor_id) AS asesores,
      COUNT(DISTINCT cliente_id) AS clientes
    FROM lotes WHERE proyecto_id = ?
  `, [proyectoId]) || {};
  const ventasHoy = (one(`SELECT COUNT(*) AS n FROM lotes WHERE proyecto_id = ? AND estado='vendido' AND date(fecha_venta) = date('now')`, [proyectoId]) || {}).n || 0;
  const ventasMes = (one(`SELECT COUNT(*) AS n FROM lotes WHERE proyecto_id = ? AND estado='vendido' AND strftime('%Y-%m', fecha_venta) = strftime('%Y-%m','now')`, [proyectoId]) || {}).n || 0;
  const sepMes = (one(`SELECT COUNT(*) AS n FROM lotes WHERE proyecto_id = ? AND fecha_separacion != '' AND strftime('%Y-%m', fecha_separacion) = strftime('%Y-%m','now')`, [proyectoId]) || {}).n || 0;
  const tprom = (one(`SELECT AVG(julianday(fecha_venta) - julianday(created_at)) AS d FROM lotes WHERE proyecto_id = ? AND estado='vendido' AND fecha_venta != ''`, [proyectoId]) || {}).d || 0;
  const total = base.total || 0;
  const pct_vendido = total ? Math.round(((base.vendidos || 0) / total) * 100) : 0;
  return {
    ...base, total,
    ventas_hoy: ventasHoy, ventas_mes: ventasMes, separaciones_mes: sepMes,
    tiempo_promedio_dias: Math.round(tprom || 0), pct_vendido,
  };
}

// ─────────────────────────────────────────────────────────────
// Zonas geográficas — asignación de leads por municipio/región.
// La lógica de resolución (qué zona le toca a un lead, qué asesor la cubre) vive en
// services/zonas.js; aquí solo el acceso a datos.
// ─────────────────────────────────────────────────────────────
function getZonas() {
  return all(`
    SELECT z.*,
      (SELECT COUNT(*) FROM vendedores v WHERE v.estado != 'pendiente' AND (',' || REPLACE(COALESCE(v.zonas,''),' ','') || ',') LIKE ('%,' || z.slug || ',%')) AS total_asesores,
      (SELECT COUNT(*) FROM leads l WHERE l.zona = z.slug AND l.status != 'cerrado') AS leads_activos
    FROM zonas z ORDER BY z.nombre
  `);
}

function getZonaById(id) {
  return one('SELECT * FROM zonas WHERE id = ? LIMIT 1', [id]);
}

function getZonaBySlug(slug) {
  return one('SELECT * FROM zonas WHERE slug = ? LIMIT 1', [slug]);
}

function slugify(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // quita tildes
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function createZona(nombre) {
  const slug = slugify(nombre);
  if (!slug) return null;
  run('INSERT OR IGNORE INTO zonas (nombre, slug) VALUES (?, ?)', [String(nombre).trim(), slug]);
  return getZonaBySlug(slug);
}

function updateZona(id, { nombre, activo } = {}) {
  const z = getZonaById(id);
  if (!z) return null;
  const sets = [], params = [];
  if (nombre != null) { sets.push('nombre = ?'); params.push(String(nombre).trim()); }
  if (activo != null) { sets.push('activo = ?'); params.push(activo ? 1 : 0); }
  if (!sets.length) return z;
  params.push(id);
  run(`UPDATE zonas SET ${sets.join(', ')} WHERE id = ?`, params);
  return getZonaById(id);
}

// Bloquea el borrado si algún asesor sigue cubriendo la zona — evita dejar reglas
// huérfanas apuntando a una zona que ya no existe.
function deleteZona(id) {
  const z = getZonaById(id);
  if (!z) return { ok: false, error: 'zona_no_existe' };
  const enUso = (one(`SELECT COUNT(*) AS n FROM vendedores WHERE (',' || REPLACE(COALESCE(zonas,''),' ','') || ',') LIKE ('%,' || ? || ',%')`, [z.slug]) || {}).n || 0;
  if (enUso > 0) return { ok: false, error: 'zona_en_uso', asesores: enUso };
  run('DELETE FROM zona_reglas WHERE zona_id = ?', [id]);
  run('DELETE FROM zonas WHERE id = ?', [id]);
  return { ok: true };
}

function getReglasByZona(zonaId) {
  return all('SELECT * FROM zona_reglas WHERE zona_id = ? ORDER BY prioridad DESC, id ASC', [zonaId]);
}

function getReglasActivas() {
  return all(`
    SELECT r.*, z.slug AS zona_slug, z.nombre AS zona_nombre
    FROM zona_reglas r JOIN zonas z ON z.id = r.zona_id
    WHERE z.activo = 1
    ORDER BY r.prioridad DESC, r.id ASC
  `);
}

function addZonaRegla(zonaId, { campo, operador, valor, prioridad } = {}) {
  if (!['ad_id', 'ad_name', 'source_url'].includes(campo)) return null;
  if (!['equals', 'contains'].includes(operador)) return null;
  if (!valor || !String(valor).trim()) return null;
  run('INSERT INTO zona_reglas (zona_id, campo, operador, valor, prioridad) VALUES (?, ?, ?, ?, ?)',
    [zonaId, campo, operador, String(valor).trim(), Number(prioridad) || 0]);
  return one('SELECT * FROM zona_reglas WHERE id = (SELECT last_insert_rowid())');
}

function deleteZonaRegla(reglaId) {
  run('DELETE FROM zona_reglas WHERE id = ?', [reglaId]);
}

// Anuncios que ya trajeron leads, para que el admin los mapee a una zona sin tener
// que adivinar el nombre exacto de la campaña.
function getAnunciosDetectados() {
  return all(`
    SELECT ad_id, ad_name, COUNT(*) AS total_leads, MAX(created_at) AS ultimo_lead
    FROM leads WHERE ad_id IS NOT NULL AND ad_id != ''
    GROUP BY ad_id ORDER BY ultimo_lead DESC
  `);
}

function setVendedorZonas(vendedorId, zonasSlugs) {
  const csv = Array.isArray(zonasSlugs) ? zonasSlugs.filter(Boolean).join(',') : '';
  run('UPDATE vendedores SET zonas = ? WHERE id = ?', [csv, vendedorId]);
}

// fuente: 'anuncio' | 'manual' | 'fallback'. Además de leads.zona escribe leads.ciudad
// con el nombre display de la zona, para que segmentación y {{ciudad}} (ya cableadas)
// se enciendan sin trabajo extra.
function setLeadZona(leadId, zonaSlug, fuente, zonaNombre) {
  run('UPDATE leads SET zona = ?, zona_fuente = ?, ciudad = COALESCE(?, ciudad) WHERE id = ?',
    [zonaSlug || null, fuente || null, zonaNombre || null, Number(leadId)]);
}

// Solo actualiza la procedencia (p.ej. degradar a 'fallback' cuando nadie cubre la zona
// ya detectada) sin tocar la zona/ciudad ya guardadas.
function setLeadZonaFuente(leadId, fuente) {
  run('UPDATE leads SET zona_fuente = ? WHERE id = ?', [fuente || null, Number(leadId)]);
}

// ─────────────────────────────────────────────────────────────
// "Mi Día" del asesor — todo derivado de datos reales, sin inventar.
// ─────────────────────────────────────────────────────────────
function getMiDia(vendedorId) {
  // Seguimientos/recordatorios vencidos hoy
  const tareasVencidas = all(
    `SELECT id, texto, vence_at FROM tareas
     WHERE vendedor_id = ? AND (completada IS NULL OR completada = 0)
       AND vence_at IS NOT NULL AND datetime(vence_at) <= datetime('now')
     ORDER BY vence_at ASC LIMIT 20`,
    [vendedorId]
  );
  // Citas de hoy pendientes
  const citasHoy = all(
    `SELECT id, lead_id, titulo, fecha FROM citas
     WHERE vendedor_id = ? AND estado = 'pendiente'
       AND date(fecha) = date('now','localtime')
     ORDER BY fecha ASC`,
    [vendedorId]
  );
  // Leads calientes sin responder (unread > 0), etiqueta de alto interés primero
  const calientes = all(
    `SELECT id, customer_name, etiqueta, unread_count, last_customer_message_at
     FROM leads
     WHERE assigned_to_id = ? AND status != 'cerrado' AND COALESCE(unread_count,0) > 0
     ORDER BY (etiqueta IN ('negociacion','cita')) DESC, last_customer_message_at ASC LIMIT 20`,
    [vendedorId]
  );
  // Leads fríos: sin contacto (del cliente) hace +48h y sin cerrar
  const frios = all(
    `SELECT id, customer_name, etiqueta, updated_at, last_customer_message_at
     FROM leads
     WHERE assigned_to_id = ? AND status != 'cerrado' AND COALESCE(unread_count,0) = 0
       AND datetime(COALESCE(last_customer_message_at, updated_at, created_at)) <= datetime('now','-48 hours')
     ORDER BY COALESCE(last_customer_message_at, updated_at, created_at) ASC LIMIT 20`,
    [vendedorId]
  );
  return { tareasVencidas, citasHoy, calientes, frios };
}

// Leads que necesitan seguimiento: el asesor mandó el último mensaje y el cliente
// no responde hace +24h (para crear recordatorio automático desde el scheduler).
function getLeadsNecesitanSeguimiento() {
  return all(
    `SELECT l.id, l.customer_name, l.assigned_to_id,
            (SELECT direction FROM messages m WHERE m.lead_id = l.id ORDER BY m.id DESC LIMIT 1) AS last_dir,
            (SELECT timestamp FROM messages m WHERE m.lead_id = l.id ORDER BY m.id DESC LIMIT 1) AS last_ts
     FROM leads l
     WHERE l.status != 'cerrado' AND l.assigned_to_id IS NOT NULL AND l.followup_task_at IS NULL`,
    []
  ).filter(l => l.last_dir === 'outgoing' && l.last_ts && (Date.now() - new Date(String(l.last_ts).replace(' ', 'T')).getTime()) > 24 * 3600 * 1000);
}
function setFollowupCreated(leadId) {
  run("UPDATE leads SET followup_task_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [leadId]);
}

// ─────────────────────────────────────────────────────────────
// Insignias
// ─────────────────────────────────────────────────────────────
function getInsignias(vendedorId) {
  return all('SELECT codigo, otorgada_at FROM insignias WHERE vendedor_id = ? ORDER BY otorgada_at DESC', [vendedorId]);
}
// Agregados por asesor para calcular insignias (todo derivado de datos reales)
function getInsigniaStats() {
  return all(
    `SELECT v.id AS vendedor_id, v.nombre,
       (SELECT COUNT(*) FROM leads l WHERE l.assigned_to_id = v.id AND l.etiqueta = 'vendido') AS vendidos,
       (SELECT COUNT(*) FROM leads l WHERE l.assigned_to_id = v.id AND l.etiqueta = 'vendido'
          AND strftime('%Y-%m', COALESCE(l.updated_at, l.created_at)) = strftime('%Y-%m','now')) AS vendidos_mes,
       (SELECT COUNT(*) FROM leads l WHERE l.assigned_to_id = v.id AND l.status != 'cerrado') AS activos,
       (SELECT COUNT(*) FROM leads l WHERE l.assigned_to_id = v.id AND l.status != 'cerrado' AND COALESCE(l.unread_count,0) > 0) AS pendientes,
       (SELECT COUNT(*) FROM leads l WHERE l.assigned_to_id = v.id AND l.first_response_at IS NOT NULL) AS respondidos
     FROM vendedores v WHERE v.estado = 'activo'`,
    []
  );
}
function getInsigniasAll() {
  const rows = all('SELECT vendedor_id, codigo, otorgada_at FROM insignias', []);
  const map = {};
  for (const r of rows) { (map[r.vendedor_id] = map[r.vendedor_id] || []).push(r.codigo); }
  return map;
}
function awardInsignia(vendedorId, codigo) {
  try {
    run('INSERT OR IGNORE INTO insignias (vendedor_id, codigo) VALUES (?, ?)', [vendedorId, codigo]);
    return true;
  } catch (e) { console.error('[INSIGNIAS] award falló', vendedorId, codigo, e.message); return false; }
}
function revokeInsignia(vendedorId, codigo) {
  run('DELETE FROM insignias WHERE vendedor_id = ? AND codigo = ?', [vendedorId, codigo]);
}

// ===================== CAMPAÑAS SP =====================

function createCampanasSpProject(d = {}) {
  const slug = d.slug || d.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proyecto-' + Date.now();
  run(`INSERT INTO campanas_sp_projects (name, slug, location, description, price, price_currency, area,
       features, highlights, whatsapp, cta, images_dir, output_dir, template, status, assets_result, error, proyecto_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.name || '', slug, d.location || '', d.description || '', d.price || '', d.price_currency || 'COP',
     d.area || '', JSON.stringify(d.features || []), JSON.stringify(d.highlights || []),
     d.whatsapp || '+57 321 462 5618', d.cta || 'SOLICITA INFORMACIÓN',
     d.images_dir || '', d.output_dir || '', d.template || 'premium', d.status || 'draft', '{}', '',
     d.proyecto_id || null]);
  return one('SELECT * FROM campanas_sp_projects WHERE id = (SELECT last_insert_rowid())');
}

function getCampanasSpProjects() {
  return all('SELECT * FROM campanas_sp_projects ORDER BY created_at DESC');
}

function getCampanasSpProject(id) {
  return one('SELECT * FROM campanas_sp_projects WHERE id = ?', [id]);
}

function getCampanasSpProjectBySlug(slug) {
  return one('SELECT * FROM campanas_sp_projects WHERE slug = ?', [slug]);
}

function updateCampanasSpProject(id, d = {}) {
  const p = getCampanasSpProject(id);
  if (!p) return null;
  // features/highlights llegan como array desde el frontend — se guardan serializados,
  // igual que en createCampanasSpProject (antes se excluían aquí y quedaban sin poder editarse).
  const input = { ...d };
  if (input.features !== undefined) input.features = JSON.stringify(input.features || []);
  if (input.highlights !== undefined) input.highlights = JSON.stringify(input.highlights || []);
  const fields = ['name', 'slug', 'location', 'description', 'price', 'price_currency', 'area',
    'features', 'highlights', 'whatsapp', 'cta', 'images_dir', 'output_dir', 'template', 'status',
    'assets_result', 'error', 'proyecto_id'];
  const sets = fields.filter(f => input[f] !== undefined).map(f => `${f}=?`).join(', ');
  if (!sets) return p;
  const vals = fields.filter(f => input[f] !== undefined).map(f => input[f]);
  run(`UPDATE campanas_sp_projects SET ${sets}, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`, [...vals, id]);
  const updated = one('SELECT * FROM campanas_sp_projects WHERE id = ?', [id]);
  return updated;
}

function deleteCampanasSpProject(id) {
  run('DELETE FROM campanas_sp_projects WHERE id = ?', [id]);
}

// --- Galería de activos de marca ---
function getGaleria(categoria) {
  if (categoria && categoria !== 'all') {
    return all('SELECT * FROM galeria WHERE activa = 1 AND categoria = ? ORDER BY orden, created_at DESC', [categoria]);
  }
  return all('SELECT * FROM galeria WHERE activa = 1 ORDER BY orden, created_at DESC');
}
function getGaleriaAll() {
  return all('SELECT * FROM galeria ORDER BY categoria, orden, created_at DESC');
}
function getGaleriaById(id) {
  return one('SELECT * FROM galeria WHERE id = ?', [id]);
}
function createGaleriaItem(data) {
  run('INSERT INTO galeria (nombre, categoria, filename, activa, orden) VALUES (?, ?, ?, ?, ?)',
    [data.nombre, data.categoria, data.filename, data.activa !== undefined ? data.activa : 1, data.orden || 0]);
  return one('SELECT * FROM galeria WHERE id = (SELECT last_insert_rowid())');
}
function updateGaleriaItem(id, data) {
  if (data.nombre !== undefined) run('UPDATE galeria SET nombre = ? WHERE id = ?', [data.nombre, id]);
  if (data.categoria !== undefined) run('UPDATE galeria SET categoria = ? WHERE id = ?', [data.categoria, id]);
  if (data.filename !== undefined) run('UPDATE galeria SET filename = ? WHERE id = ?', [data.filename, id]);
  if (data.activa !== undefined) run('UPDATE galeria SET activa = ? WHERE id = ?', [data.activa ? 1 : 0, id]);
  if (data.orden !== undefined) run('UPDATE galeria SET orden = ? WHERE id = ?', [data.orden, id]);
  return one('SELECT * FROM galeria WHERE id = ?', [id]);
}
function deleteGaleriaItem(id) {
  run('DELETE FROM galeria WHERE id = ?', [id]);
}
function seedGaleria() {
  const count = one('SELECT COUNT(*) as c FROM galeria');
  if (count && count.c > 0) return;
  const assets = [
    { nombre: 'Fondo de pantalla asesores', categoria: 'fondos', filename: 'Fondo de pantalla asesores.png', orden: 0 },
    { nombre: 'Fondo mensaje', categoria: 'fondos', filename: 'Fondo mensaje.png', orden: 1 },
    { nombre: 'Logo SP Leons Group', categoria: 'logos', filename: 'logo Sp Leons Group.png', orden: 0 },
    { nombre: 'Logo Alexandra', categoria: 'logos', filename: 'Logo Alexandra.png', orden: 1 },
    { nombre: 'SP Logo', categoria: 'logos', filename: 'SPLogo.jpg', orden: 2 },
    { nombre: 'Icono SP Leons', categoria: 'logos', filename: 'icono.png', orden: 3 },
    { nombre: 'Banner SP Leons Group', categoria: 'banners', filename: 'Banner Sp Leons Group.png', orden: 0 },
    { nombre: 'Bienvenida SP Leons Group', categoria: 'banners', filename: 'Bienvenida Sp Leons Group.png', orden: 1 },
    { nombre: 'SM Banner', categoria: 'banners', filename: 'sm1.png', orden: 2 },
  ];
  for (const a of assets) {
    run('INSERT INTO galeria (nombre, categoria, filename, activa, orden) VALUES (?, ?, ?, 1, ?)',
      [a.nombre, a.categoria, a.filename, a.orden]);
  }
}

module.exports = {
  initDB, createSchema, getDB, saveLead, assignLeadToVendedor, saveMessage,
  all, one, run, execSQL,
  getVendedoresActivos, getLeadById, getLeadByCustomerPhone,
  updateLeadStatus, setFirstResponse, resetLead, reopenLead,
  getLeads, getLeadCount, getLeadsSinRespuesta, incrementEscalation,
  marcarLeido, setUnreadCount, setLeadNombre, setLeadOrigen, setLeadAdAttribution, countLeadsByAdIds,
  addVendedor, getVendedores, setVendedorEstado, setVendedorTelefono, setVendedorNombre, setVendedorFoto, getVendedorMetricas, getVendedorByTelefono, getVendedorById, setVendedorPin, setVendedor2FA,
  createUsuario, getUsuarioByEmail, getUsuarioById, getUsuarioByVendedorId, getUsuarios,
  countUsuarios, updateUsuarioPassword, updateUsuarioVendedorId, updateUsuarioRol,
  getLeadsByVendedorId, getArchivedLeadsByVendedorId, getMessagesByLead, getMessageById, updateMessageStatus, setMessageError, setMessageErrorById, markMessageSent, setMessageButtonPayload,
  getTemplates, getTemplateById, addTemplate, updateTemplate, deleteTemplate,
  getVendedorTemplates, getVendedorTemplateById, addVendedorTemplate, updateVendedorTemplate, deleteVendedorTemplate, getStatsSemanales,
  savePushSubscription, getPushSubscriptionsByVendedor, deletePushSubscription, saveFcmToken, getAllPushSubscriptions,
  createDBSession, getDBSession, deleteDBSession, refreshSession, expireSessionSoon, cleanExpiredSessions,
  getSessionsByOwner, touchSessionLastSeen, deleteOtherSessions,
  createNotification, getNotifications, countUnreadNotifications, markNotificationRead, markAllNotificationsRead,
  getTareasByVendedor, createTarea, updateTarea, deleteTarea, getTareasVencidasSinNotificar, markTareaNotificada, setVendedorAbout, setVendedorChatBg,
  countMessagesByLead, getLeadAggregates, getLeadCountsByAdIds,
  getConfig, setConfig, normalizePhone,
  getWATemplates, getWATemplatesAprobadas, addWATemplate, deleteWATemplate, getWATemplateById, getWATemplateByName,
  getWATemplateByNameIdioma, getWATemplateByMetaId, upsertWATemplateFull, upsertWATemplateByMetaId, setWATemplateMapping,
  setWATemplateEstado, insertWATemplateBorrador, updateWATemplateSpec,
  ESTADOS_INTERNOS, getWATemplatesEnRevision, getWATemplatesByAutor,
  insertWATemplatePropuesta, marcarWATemplateEnviadaAMeta,
  createCampaign, getCampaigns, getCampaignById, updateCampaignEstado, deleteCampaign,
  getCampaignsByEstado, getCampaignsPausadasAutomaticas,
  addCampaignRecipients, getCampaignRecipients, updateCampaignRecipient, getCampaignRecipientByWamid, recalcCampaignStats,
  isOptedOut, addOptout, getOptouts, deleteOptout, countSegment, segmentLeads, getSegmentOptions,
  bumpUsage, getUsage, getUsageRange,
  setLeadEtiqueta, markCapiEventSent, updateLeadProgress, setLeadTemperatura, setLeadSnooze, setAwaitingCsat, getNotasByLead, getAllNotas, addNota, deleteNota, reassignLead,
  getCadenciaPasos, setCadenciaPasos, enrollCadencia, stopCadencia, getCadenciaDue, updateCadenciaLead, getLeadsParaAutoCadencia,
  deleteVendedor, getAdminInbox, getAdminInboxStats,
  updateCustomerMessageTimestamp, isWindowOpen, getWindowExpiresAt,
  queuePendingOutbound, getPendingOutbound, clearPendingOutbound, deletePendingOutbound, bumpPendingOutboundIntento, attachPendingMessage,
  // Nuevo schema multicanal
  createCustomer, getCustomerById, findCustomerByChannel, setCustomerAvatarIfEmpty,
  linkChannelToCustomer, getCustomerChannels, getCustomers, updateCustomer, deleteCustomer,
  getActiveConversationsByCustomer,
  createConversation, getConversationById, getConversationsByVendedorId,
   getConversationByChannelUser, getConversationByLeadId, getChannelUserIdForLead, updateConversationStatus, updateConversationTag,
  updateConversationPriority, getConversations, getConversationCount,
  addTimelineEvent, getTimelineByConversation, getLastMessageByConversation,
  syncLeadToConversation,
  getUnlinkedLeads, getOrCreateConversationForLead, getUnifiedConversations,
  getCitas, getCitaById, getProximaCitaByLead, createCita, updateCita, deleteCita,
  getRecordatorioCita, createRecordatorioCita, cancelarRecordatorioCita, cancelarRecordatorioByCitaCierre,
  getAllWorkflows, getWorkflowById, createWorkflow, updateWorkflow, deleteWorkflow,
  addWorkflowLog, getWorkflowLogs,
  createWorkflowJob, getDueWorkflowJobs, markWorkflowJobDone,
  addReaction, removeReaction, getReactionsForMessage, getReactionsForMessages,
  editMessage, softDeleteMessage, pinLead, muteLead, clearLeadMessages,
  markMessageAsRead, markLeadMessagesAsRead,
  markDeletedForAll, markDeletedByClientWamid, getMessageByWamid,
  getDuplicateGroups, mergeLeads, closeOrphanConversations,
  getTareas, addTarea, toggleTarea, deleteTarea,
  getUbicacionesGuardadas, saveUbicacionGuardada, deleteUbicacionGuardada,
  // Proyectos / Lotes
  getProyectos, getProyectoById, createProyecto, updateProyecto, deleteProyecto, getProyectoStats,
  getLotesByProyecto, getLoteById, createLote, bulkCreateLotes, updateLote, updateLoteEstado, deleteLote,
  setLoteObservacion, setLotePrecio, addLoteMedia, addLoteHistorial, getLoteHistorial,
  getProyectosPublicos, getProyectoPublicoById,
  // Zonas geográficas
  getZonas, getZonaById, getZonaBySlug, createZona, updateZona, deleteZona,
  getReglasByZona, getReglasActivas, addZonaRegla, deleteZonaRegla,
  getAnunciosDetectados, setVendedorZonas, setLeadZona, setLeadZonaFuente,
  // Chat Pro / IA / programados / equipo
  toggleStarMessage, getStarredMessages, searchMessages,
  setTranscript, setTranslation,
  createScheduled, getScheduledByVendedor, getScheduledById, getScheduledDue, updateScheduled,
  saveTeamMessage, getTeamMessages, getTeamDirectMessages, getTeamDirectThreads, markTeamDirectRead, markTeamGeneralRead, getTeamGeneralLastRead, countTeamUnread, getAllTeamMessagesForAdmin, getAdminTeamConversations,
  saveTeamReaction, removeTeamReaction, getTeamReactionsForMessages, deleteTeamMessage, updatePresence, getPresenceMap,
  setConsentimientoUbicacion, tieneConsentimientoUbicacion, revocarConsentimientoUbicacion,
  guardarPosicionVendedor, getUltimasPosiciones, getRecorridoVendedor, purgarPosicionesAntiguas,
  setLeadCoords, setLeadCoordsDesdeUbicacion, backfillCoordsDesdeUbicaciones,
  marcarLeadSinGeocodificar, getLeadsSinCoordenadas, getLeadsConCoordenadas,
  setProyectoCoords, getProyectosConCoordenadas, setZonaCoords, getZonasConCoordenadas,
  pinTeamMessage, getPinnedTeamMessage, editTeamMessage, searchTeamMessages, forwardTeamMessage,
  getMiDia, getLeadsNecesitanSeguimiento, setFollowupCreated,
  getInsignias, getInsigniasAll, getInsigniaStats, awardInsignia, revokeInsignia,
  // Campañas SP
  createCampanasSpProject, getCampanasSpProjects, getCampanasSpProject, getCampanasSpProjectBySlug,
  updateCampanasSpProject, deleteCampanasSpProject,
  // SP Feed (S6)
  createFeedItem, getFeedItems, getFeedItemById, deleteFeedItem,
  getLeadSeries, getCanalDistribution, getLeadsExport,
  // SP Feed en Tiempo Real (actividad)
  createFeedEvent, getFeedEvents, getFeedEventById, purgeOldFeedEvents,
  addFeedReaction, getFeedReactionsForEvent,
  // Galería
  getGaleria, getGaleriaAll, getGaleriaById, createGaleriaItem, updateGaleriaItem, deleteGaleriaItem, seedGaleria,
};
