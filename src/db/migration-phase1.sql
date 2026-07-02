-- 🔄 Migración Fase 1: Nuevas tablas para sistema avanzado
-- Ejecutar: node scripts/run-migration.js src/db/migration-phase1.sql

-- ⏰ Tabla: Timeline de interacciones
CREATE TABLE IF NOT EXISTS timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  data TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  INDEX(lead_id),
  INDEX(event_type),
  INDEX(created_at)
);

-- 📝 Tabla: Notas colaborativas
CREATE TABLE IF NOT EXISTS collaborative_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  user_name TEXT NOT NULL,
  note_text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  INDEX(lead_id),
  INDEX(user_id),
  INDEX(created_at)
);

-- 🎯 Tabla: Scoring y predicción de leads
CREATE TABLE IF NOT EXISTS lead_scoring (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL UNIQUE,
  score INTEGER DEFAULT 0,
  classification TEXT,
  recency_points INTEGER DEFAULT 0,
  engagement_points INTEGER DEFAULT 0,
  keyword_points INTEGER DEFAULT 0,
  response_time_points INTEGER DEFAULT 0,
  state_points INTEGER DEFAULT 0,
  predicted_close_probability REAL DEFAULT 0.0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  INDEX(score),
  INDEX(predicted_close_probability)
);

-- 🚀 Tabla: Log de escaladas
CREATE TABLE IF NOT EXISTS escalation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  escalation_level INTEGER NOT NULL,
  from_vendor_id INTEGER,
  to_vendor_id INTEGER,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  INDEX(lead_id),
  INDEX(escalation_level),
  INDEX(created_at)
);

-- 📊 Tabla: Estadísticas de vendedor
CREATE TABLE IF NOT EXISTS vendor_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL UNIQUE,
  total_leads INTEGER DEFAULT 0,
  active_leads INTEGER DEFAULT 0,
  closed_leads INTEGER DEFAULT 0,
  avg_response_time_minutes INTEGER DEFAULT 0,
  conversion_rate REAL DEFAULT 0.0,
  avg_score REAL DEFAULT 0.0,
  last_activity DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(vendor_id) REFERENCES vendedores(id) ON DELETE CASCADE
);

-- 🔔 Tabla: Alertas y notificaciones
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  vendor_id INTEGER,
  alert_type TEXT NOT NULL,
  message TEXT,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME,
  FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY(vendor_id) REFERENCES vendedores(id),
  INDEX(vendor_id),
  INDEX(is_read),
  INDEX(created_at)
);

-- 💾 Tabla: Cache de conversaciones (para offline-first)
CREATE TABLE IF NOT EXISTS conversation_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  message_id TEXT UNIQUE,
  direction TEXT,
  body TEXT,
  media_type TEXT,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  INDEX(lead_id),
  INDEX(cached_at)
);

-- 📋 Tabla: Automatizaciones personalizadas
CREATE TABLE IF NOT EXISTS custom_automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger_type TEXT,
  condition_json TEXT,
  action_json TEXT,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0.0
);

-- 🔐 Tabla: Audit trail (quién hizo qué)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_name TEXT,
  action TEXT,
  resource_type TEXT,
  resource_id INTEGER,
  changes_json TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX(user_id),
  INDEX(resource_type),
  INDEX(resource_id),
  INDEX(created_at)
);

-- 🎁 Tabla: Referrals/Recomendaciones
CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_lead_id INTEGER,
  referred_lead_id INTEGER,
  referrer_vendor_id INTEGER,
  status TEXT DEFAULT 'pending',
  commission_amount REAL DEFAULT 0.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_lead_id) REFERENCES leads(id),
  FOREIGN KEY(referred_lead_id) REFERENCES leads(id),
  FOREIGN KEY(referrer_vendor_id) REFERENCES vendedores(id)
);

-- Índices adicionales para performance
CREATE INDEX IF NOT EXISTS idx_leads_score ON lead_scoring(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status, assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_timeline_lead_type ON timeline(lead_id, event_type);

-- Actualizar tabla leads si no tiene estas columnas
ALTER TABLE leads ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS marked_as_critical INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_response_at DATETIME;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;
