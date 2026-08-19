/**
 * Configuración general del negocio (clave/valor) — Rutas REST
 * Todo el router va montado bajo auth.requireAdmin (ver src/index.js).
 */

const express = require('express');
const router = express.Router();
const store = require('../db/store');

const CONFIG_KEYS = [
  'welcome_message',
  'company_name',
  'reengagement_template',
  'recordatorio_template',
  'twilio_account_sid', 'twilio_auth_token', 'twilio_numero',
  'slack_webhook', 'gcal_client_id', 'mp_public_key', 'mp_access_token',
  'openrouter_api_key', 'openrouter_model', 'openrouter_site_url', 'openrouter_app_name', 'ai_enabled',
  'escalation_alerta_min', 'escalation_reasignar_min', 'escalation_admin_min', 'escalation_asentado_horas',
  'campaign_mps', 'campaign_daily_limit',
  'meta_ads_cpl_objetivo', 'meta_ads_baseline_json',
  // Token público de Mapbox (pk.*) para el mapa y el buscador de lugares del panel
  // del asesor. Vacío = el mapa cae a OpenStreetMap + Nominatim.
  'mapbox_token',
  // Parte 3B — General
  'timezone', 'currency_format', 'default_theme', 'company_logo',
  // Parte 3B — Privacidad
  'media_retention_enabled', 'media_retention_days',
  // Parte 3B — Facturación (estructura lista, cobro real desactivado — ver Parte 3B del plan)
  'billing_razon_social', 'billing_nit', 'billing_direccion', 'billing_email',
];

router.get('/', (req, res) => {
  const cfg = {};
  CONFIG_KEYS.forEach(key => { cfg[key] = store.getConfig(key) || ''; });
  res.json(cfg);
});

router.post('/', (req, res) => {
  const body = req.body || {};
  CONFIG_KEYS.forEach(key => {
    if (body[key] !== undefined) store.setConfig(key, String(body[key]));
  });
  res.json({ ok: true });
});

module.exports = router;
