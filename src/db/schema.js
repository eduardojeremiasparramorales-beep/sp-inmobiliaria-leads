// Nuevo schema multicanal: customers, customer_channels, conversations, timeline, workflows, workflow_logs
// createNewTables(db) recibe una instancia de better-sqlite3 (o compatible con .exec)

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
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (assigned_to_id) REFERENCES vendedores(id)
    );

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
