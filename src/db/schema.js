// Nuevo schema multicanal: customers, customer_channels, conversations, timeline, workflows, workflow_logs
// createNewTables(db) recibe una instancia de better-sqlite3 (o compatible con .exec)
//
// Convención de tiempo (Fase 1.1, ver docs/AUDITORIA_2026-08.md 1.7): todos los DEFAULT
// usan datetime('now') en UTC, nunca 'localtime'. El código que hace INSERT explícito
// del timestamp usa src/utils/tiempo.js::SQL_NOW_UTC (con sufijo 'Z') — el DEFAULT de
// columna es solo un respaldo que nunca debería dispararse en la práctica. IMPORTANTE:
// CREATE TABLE IF NOT EXISTS nunca reescribe una tabla ya creada, así que este cambio
// solo aplica a instalaciones nuevas desde cero — no corrige el DEFAULT de tablas de
// producción existentes (por eso el código nunca debe depender de él).

function createNewTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      custom_fields TEXT DEFAULT '{}',
      tags TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'messenger', 'instagram')),
      channel_user_id TEXT NOT NULL,
      channel_username TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      UNIQUE (channel, channel_user_id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'messenger', 'instagram')),
      channel_conversation_id TEXT DEFAULT '',
      customer_id INTEGER NOT NULL,
      assigned_to_id INTEGER,
      status TEXT DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'asignado', 'contactado', 'cerrado')),
      unread_count INTEGER DEFAULT 0,
      priority TEXT DEFAULT 'normal' CHECK (priority IN ('baja', 'normal', 'alta', 'urgente')),
      last_message TEXT DEFAULT '',
      last_message_at DATETIME,
      etiqueta TEXT DEFAULT 'sin_clasificar',
      progress_pct INTEGER DEFAULT 5,
      -- Puente al esquema legacy (leads). Antes solo llegaba vía ensureColumn en
      -- store.js, sin restricción — una conversación podía crearse sin lead_id y el
      -- backfill de arranque (getOrCreateConversationForLead) le creaba una SEGUNDA
      -- conversación duplicando el timeline. El UNIQUE de abajo hace eso imposible.
      lead_id INTEGER,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (assigned_to_id) REFERENCES vendedores(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id) WHERE lead_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      event_type TEXT DEFAULT 'message',
      channel TEXT DEFAULT '',
      body TEXT DEFAULT '',
      direction TEXT DEFAULT 'incoming' CHECK (direction IN ('incoming', 'outgoing', 'system')),
      from_number TEXT DEFAULT '',
      to_number TEXT DEFAULT '',
      media_type TEXT,
      media_id TEXT,
      media_mime TEXT,
      media_filename TEXT,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      activo INTEGER DEFAULT 1,
      trigger_event TEXT NOT NULL,
      conditions TEXT DEFAULT '[]',
      actions TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      conversation_id INTEGER,
      trigger_event TEXT DEFAULT '',
      result TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (workflow_id) REFERENCES workflows(id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS tareas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      texto TEXT NOT NULL,
      fecha_vencimiento TEXT DEFAULT '',
      completada INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE TABLE IF NOT EXISTS ubicaciones_guardadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendedor_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      direccion TEXT DEFAULT '',
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
    );

    CREATE TABLE IF NOT EXISTS proyectos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      ciudad TEXT DEFAULT '',
      departamento TEXT DEFAULT '',
      descripcion TEXT DEFAULT '',
      imagen_url TEXT DEFAULT '',
      estado TEXT DEFAULT 'en_venta' CHECK (estado IN ('planeacion','preventa','en_venta','entregado','pausado')),
      fecha_inicio TEXT DEFAULT '',
      plano_url TEXT DEFAULT '',
      plano_bounds TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zonas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      activo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zona_reglas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zona_id INTEGER NOT NULL,
      campo TEXT NOT NULL CHECK (campo IN ('ad_id','ad_name','source_url')),
      operador TEXT NOT NULL CHECK (operador IN ('equals','contains')),
      valor TEXT NOT NULL,
      prioridad INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (zona_id) REFERENCES zonas(id)
    );

    CREATE TABLE IF NOT EXISTS lotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proyecto_id INTEGER NOT NULL,
      numero TEXT DEFAULT '',
      manzana TEXT DEFAULT '',
      area REAL DEFAULT 0,
      dimensiones TEXT DEFAULT '',
      precio REAL DEFAULT 0,
      estado TEXT DEFAULT 'disponible' CHECK (estado IN ('disponible','separado','vendido','reservado','bloqueado','negociacion')),
      cliente_id INTEGER,
      lead_id INTEGER,
      asesor_id INTEGER,
      poligono TEXT DEFAULT '[]',
      observaciones TEXT DEFAULT '',
      documentos TEXT DEFAULT '[]',
      fotografias TEXT DEFAULT '[]',
      fecha_separacion TEXT DEFAULT '',
      fecha_venta TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
      FOREIGN KEY (cliente_id) REFERENCES customers(id),
      FOREIGN KEY (asesor_id) REFERENCES vendedores(id)
    );

    CREATE TABLE IF NOT EXISTS lote_historial (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lote_id INTEGER NOT NULL,
      evento TEXT DEFAULT '',
      detalle TEXT DEFAULT '',
      autor TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (lote_id) REFERENCES lotes(id)
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_customer_channels_channel_userid ON customer_channels(channel, channel_user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_customer_channels_customer_id ON customer_channels(customer_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to_id ON conversations(assigned_to_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_channel_status ON conversations(channel, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_timeline_conversation_id ON timeline(conversation_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_timeline_created_at ON timeline(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tareas_lead_id ON tareas(lead_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ubicaciones_guardadas_vendedor ON ubicaciones_guardadas(vendedor_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_zona_reglas_zona ON zona_reglas(zona_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lotes_proyecto ON lotes(proyecto_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lotes_estado ON lotes(estado)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lote_hist_lote ON lote_historial(lote_id)`);

  // Campañas SP — tabla de proyectos publicitarios
  db.exec(`
    CREATE TABLE IF NOT EXISTS campanas_sp_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL UNIQUE DEFAULT '',
      location TEXT DEFAULT '',
      description TEXT DEFAULT '',
      price TEXT DEFAULT '',
      price_currency TEXT DEFAULT 'COP',
      area TEXT DEFAULT '',
      features TEXT DEFAULT '[]',
      highlights TEXT DEFAULT '[]',
      whatsapp TEXT DEFAULT '+57 321 462 5618',
      cta TEXT DEFAULT 'SOLICITA INFORMACIÓN',
      images_dir TEXT DEFAULT '',
      output_dir TEXT DEFAULT '',
      template TEXT DEFAULT 'premium' CHECK (template IN ('premium','moderna','clasica')),
      status TEXT DEFAULT 'draft' CHECK (status IN ('draft','generating','ready','error')),
      assets_result TEXT DEFAULT '{}',
      error TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  // Feed en Tiempo Real (SP Feed) — actividad de la empresa como publicaciones.
  // Cada evento operativo del negocio (lead asignado, respuesta, cambio de etapa,
  // venta, reasignación, alerta, asesor conectado, post de capacitación) se persiste
  // aquí para que el Supervisor Center lo muestre en orden cronológico sin depender
  // del SSE (que es volátil). `categoria` alimenta los filtros del feed.
  db.exec(`
    CREATE TABLE IF NOT EXISTS feed_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'operaciones',
      actor_id INTEGER,
      actor_nombre TEXT DEFAULT '',
      lead_id INTEGER,
      conversation_id INTEGER,
      entidad_tipo TEXT DEFAULT '',
      entidad_id INTEGER,
      titulo TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      payload TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE TABLE IF NOT EXISTS feed_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL,
      vendedor_id INTEGER NOT NULL,
      nombre TEXT DEFAULT '',
      emoji TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (feed_id) REFERENCES feed_events(id),
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_feed_events_created_at ON feed_events(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_feed_events_categoria ON feed_events(categoria)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_feed_events_lead ON feed_events(lead_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_feed_reactions_feed ON feed_reactions(feed_id)`);

  // Fase 1 — Reservas con countdown
  db.exec(`
    CREATE TABLE IF NOT EXISTS reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL UNIQUE,
      lote_id INTEGER,
      proyecto_id INTEGER,
      vendedor_id INTEGER,
      horas_limite INTEGER DEFAULT 48,
      fecha_inicio DATETIME DEFAULT (datetime('now')),
      fecha_vence DATETIME,
      estado TEXT DEFAULT 'activa' CHECK (estado IN ('activa', 'vencida', 'completada', 'cancelada')),
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (lote_id) REFERENCES lotes(id),
      FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
    );
    CREATE INDEX IF NOT EXISTS idx_reservas_estado ON reservas(estado);
    CREATE INDEX IF NOT EXISTS idx_reservas_lead ON reservas(lead_id);
    CREATE INDEX IF NOT EXISTS idx_reservas_vence ON reservas(fecha_vence);
  `);

  // Fase 1 — Lead Scoring
  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL UNIQUE,
      score INTEGER DEFAULT 0,
      factors TEXT DEFAULT '{}',
      calculated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );
    CREATE INDEX IF NOT EXISTS idx_lead_scores_lead ON lead_scores(lead_id);
    CREATE INDEX IF NOT EXISTS idx_lead_scores_score ON lead_scores(score DESC);
  `);

  // Fase 1 — Timeline de eventos del sistema
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'operaciones',
      entidad TEXT DEFAULT '',
      entidad_id INTEGER,
      actor_id INTEGER,
      actor_nombre TEXT DEFAULT '',
      titulo TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      datos TEXT DEFAULT '{}',
      leido INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (actor_id) REFERENCES vendedores(id)
    );
    CREATE INDEX IF NOT EXISTS idx_system_events_tipo ON system_events(tipo);
    CREATE INDEX IF NOT EXISTS idx_system_events_categoria ON system_events(categoria);
    CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON system_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_system_events_leido ON system_events(leido);
  `);

  // Fase 2 — Centro Financiero
  db.exec(`
    CREATE TABLE IF NOT EXISTS transacciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
      categoria TEXT NOT NULL DEFAULT 'venta',
      concepto TEXT NOT NULL,
      monto REAL NOT NULL DEFAULT 0,
      moneda TEXT DEFAULT 'COP',
      proyecto_id INTEGER,
      lead_id INTEGER,
      vendedor_id INTEGER,
      fecha TEXT DEFAULT (date('now')),
      notas TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
    );

    CREATE TABLE IF NOT EXISTS comisiones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendedor_id INTEGER NOT NULL,
      lead_id INTEGER NOT NULL,
      monto_venta REAL NOT NULL,
      porcentaje REAL NOT NULL DEFAULT 5,
      monto_comision REAL NOT NULL,
      estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada', 'cancelada')),
      fecha_calculo TEXT DEFAULT (date('now')),
      fecha_pago TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE INDEX IF NOT EXISTS idx_transacciones_tipo ON transacciones(tipo);
    CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON transacciones(fecha);
    CREATE INDEX IF NOT EXISTS idx_transacciones_proyecto ON transacciones(proyecto_id);
    CREATE INDEX IF NOT EXISTS idx_comisiones_vendedor ON comisiones(vendedor_id);
    CREATE INDEX IF NOT EXISTS idx_comisiones_estado ON comisiones(estado);

    -- Una venta es la fuente de verdad: de ahí nacen automáticamente la comisión del
    -- asesor (comision_id) y el ingreso real de Leons Group (transaccion_id) — dos
    -- efectos derivados de un mismo evento de negocio, nunca capturados a mano por
    -- separado (así el dashboard de Resumen jamás confunde el 100% de la venta del
    -- lote con el 5% que de verdad entra a la empresa).
    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      vendedor_id INTEGER NOT NULL,
      monto_venta REAL NOT NULL,
      porcentaje_asesor REAL NOT NULL DEFAULT 10,
      monto_comision_asesor REAL NOT NULL,
      porcentaje_empresa REAL NOT NULL DEFAULT 5,
      monto_ingreso_empresa REAL NOT NULL,
      forma_pago TEXT NOT NULL DEFAULT 'contado' CHECK (forma_pago IN ('contado', 'financiado')),
      num_cuotas INTEGER,
      comision_id INTEGER,
      transaccion_id INTEGER,
      notas TEXT DEFAULT '',
      fecha TEXT DEFAULT (date('now')),
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME,
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
      FOREIGN KEY (comision_id) REFERENCES comisiones(id),
      FOREIGN KEY (transaccion_id) REFERENCES transacciones(id)
    );

    -- Plan de cobro del cliente (contado no genera filas acá). Cada cuota nace con una
    -- tarea propia (tarea_id) en el sistema de tareas del asesor que ya vence/notifica
    -- solo — no hay un cronjob nuevo, se reusa el que ya existe.
    CREATE TABLE IF NOT EXISTS venta_cuotas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      numero INTEGER NOT NULL,
      monto REAL NOT NULL,
      fecha_vencimiento TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada', 'vencida')),
      fecha_pago TEXT,
      tarea_id INTEGER,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (venta_id) REFERENCES ventas(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ventas_vendedor ON ventas(vendedor_id);
    CREATE INDEX IF NOT EXISTS idx_ventas_lead ON ventas(lead_id);
    CREATE INDEX IF NOT EXISTS idx_cuotas_venta ON venta_cuotas(venta_id);
    CREATE INDEX IF NOT EXISTS idx_cuotas_estado ON venta_cuotas(estado);
  `);

  // Fase 3 — Centro Documental
  db.exec(`
    CREATE TABLE IF NOT EXISTS documentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      tipo TEXT NOT NULL DEFAULT 'otro' CHECK (tipo IN (
        'escritura', 'contrato', 'render', 'plano', 'licencia',
        'foto', 'video', 'pdf', 'link', 'otro'
      )),
      categoria TEXT DEFAULT 'general' CHECK (categoria IN (
        'general', 'legal', 'ventas', 'marketing', 'financiero', 'proyecto', 'lead'
      )),
      archivo_nombre TEXT DEFAULT '',
      archivo_path TEXT DEFAULT '',
      archivo_mime TEXT DEFAULT '',
      archivo_size INTEGER DEFAULT 0,
      url_externa TEXT DEFAULT '',
      proyecto_id INTEGER,
      lead_id INTEGER,
      vendedor_id INTEGER,
      tags TEXT DEFAULT '[]',
      visible INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
    );
    CREATE INDEX IF NOT EXISTS idx_docs_tipo ON documentos(tipo);
    CREATE INDEX IF NOT EXISTS idx_docs_categoria ON documentos(categoria);
    CREATE INDEX IF NOT EXISTS idx_docs_proyecto ON documentos(proyecto_id);
    CREATE INDEX IF NOT EXISTS idx_docs_lead ON documentos(lead_id);
  `);

  // Fase 3 — Reputación (NPS + Referidos)
  db.exec(`
    CREATE TABLE IF NOT EXISTS encuestas_satisfaccion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      vendedor_id INTEGER,
      tipo TEXT DEFAULT 'nps' CHECK (tipo IN ('nps', 'csat', 'cierre')),
      puntuacion INTEGER DEFAULT 0,
      comentario TEXT DEFAULT '',
      enviada_at DATETIME DEFAULT (datetime('now')),
      respondida_at DATETIME,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
    );

    CREATE TABLE IF NOT EXISTS referidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referidor_lead_id INTEGER NOT NULL,
      referido_nombre TEXT NOT NULL,
      referido_telefono TEXT NOT NULL,
      referido_email TEXT DEFAULT '',
      estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'contactado', 'convertido', 'rechazado')),
      lead_creado_id INTEGER,
      vendedor_asignado_id INTEGER,
      recompensa TEXT DEFAULT '',
      notas TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (referidor_lead_id) REFERENCES leads(id),
      FOREIGN KEY (lead_creado_id) REFERENCES leads(id),
      FOREIGN KEY (vendedor_asignado_id) REFERENCES vendedores(id)
    );

    CREATE INDEX IF NOT EXISTS idx_encuestas_lead ON encuestas_satisfaccion(lead_id);
    CREATE INDEX IF NOT EXISTS idx_encuestas_tipo ON encuestas_satisfaccion(tipo);
    CREATE INDEX IF NOT EXISTS idx_referidos_estado ON referidos(estado);
  `);

  // Fase 3 — Dashboard Builder
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_dashboards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      widgets TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboards_usuario ON user_dashboards(usuario_id);
  `);
}

function dropNewTables(db) {
  db.exec(`
    DROP TABLE IF EXISTS workflow_logs;
    DROP TABLE IF EXISTS workflows;
    DROP TABLE IF EXISTS timeline;
    DROP TABLE IF EXISTS conversations;
    DROP TABLE IF EXISTS customer_channels;
    DROP TABLE IF EXISTS customers;
  `);
}

module.exports = { createNewTables, dropNewTables };
