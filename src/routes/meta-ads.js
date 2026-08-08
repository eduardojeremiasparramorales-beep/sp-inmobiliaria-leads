/**
 * Meta Ads — Rutas REST
 * Endpoints para gestionar campañas, audiencias, medios y métricas de Meta Ads.
 * Todo el router va montado bajo auth.requireAdmin (ver src/index.js).
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const metaAds = require('../services/meta-ads');
const metaAdsCache = require('../services/meta-ads-cache');
const store = require('../db/store');

// ─── Middleware: verificar configuración ──────────────────────

function requireConfig(req, res, next) {
  if (!metaAds.isConfigured()) {
    return res.status(503).json({
      error: 'meta_ads_no_configurado',
      message: 'Configura el token y la cuenta de Meta Ads en Configuración → Meta Ads, o vía .env',
    });
  }
  next();
}

// Mapeo homogéneo de errores: antes cualquier fallo (token vencido, rate limit,
// timeout de red, cuenta suspendida) llegaba al cliente como 500 genérico con el
// mensaje crudo de Meta. Con MetaApiError el código HTTP tiene sentido y el panel
// puede mostrar userMessage (el texto que Meta ya traduce para el usuario final).
function handleError(res, e) {
  if (e instanceof metaAds.MetaApiError) {
    let status = e.httpStatus && e.httpStatus >= 400 ? e.httpStatus : 502;
    let error = 'error_meta_api';
    if (e.code === 190) { status = 401; error = 'token_invalido'; }
    else if ([17, 4, 80004].includes(e.code)) { status = 429; error = 'rate_limit'; }
    else if (status === 503) { error = 'meta_ads_no_configurado'; }
    else if (status === 504) { error = 'timeout'; }
    return res.status(status).json({
      error, detalle: e.message,
      userMessage: e.error_user_msg || null,
      fbtrace_id: e.fbtrace_id || null,
    });
  }
  console.error('[META-ADS]', e.message);
  res.status(500).json({ error: 'error_interno', detalle: e.message });
}

function wrap(fn) {
  return async (req, res) => {
    try { await fn(req, res); } catch (e) { handleError(res, e); }
  };
}

// ─── Configuración de credenciales (desde la UI) ──────────────
// No van detrás de requireConfig — son justamente para configurarlo por primera vez
// o rotar el token sin tocar .env ni redesplegar.

router.get('/config', (req, res) => {
  const cfg = metaAds.getConfig();
  res.json({
    tokenSet: !!cfg.token,
    tokenMasked: cfg.token ? '••••' + cfg.token.slice(-4) : '',
    accountId: cfg.accountId,
    pixelId: cfg.pixelId,
    pageId: cfg.pageId,
    source: store.getConfig('meta_ads_token_enc') ? 'ui' : 'env',
  });
});

router.post('/config', (req, res) => {
  try {
    const { token, accountId, pixelId, pageId } = req.body || {};
    if (token) {
      const vault = require('../services/crypto-vault');
      store.setConfig('meta_ads_token_enc', vault.encrypt(token));
    }
    if (accountId !== undefined) store.setConfig('meta_ads_account_id', String(accountId).trim());
    if (pixelId !== undefined) store.setConfig('meta_ads_pixel_id', String(pixelId).trim());
    if (pageId !== undefined) store.setConfig('meta_ads_page_id', String(pageId).trim());
    metaAdsCache.clear();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'error_guardando_config', detalle: e.message });
  }
});

router.post('/config/test', wrap(async (req, res) => {
  if (!metaAds.isConfigured()) return res.status(503).json({ error: 'meta_ads_no_configurado' });
  const info = await metaAds.getAccountInfo();
  res.json({ ok: true, accountName: info.name, currency: info.currency, accountStatus: info.account_status });
}));

// ─── Estado general ──────────────────────────────────────────

router.get('/status', wrap(async (req, res) => {
  res.json(await metaAds.getStatus());
}));

// ─── Campañas ────────────────────────────────────────────────

router.get('/campaigns', requireConfig, wrap(async (req, res) => {
  res.json(await metaAds.getCampaigns());
}));

router.get('/campaigns/:id', requireConfig, wrap(async (req, res) => {
  res.json(await metaAds.getCampaignById(req.params.id));
}));

// Árbol completo campaña → adsets → ads en 1 llamada — antes no existía ninguna
// vista de drill-down, solo la lista plana de campañas.
router.get('/campaigns/:id/full', requireConfig, wrap(async (req, res) => {
  res.json(await metaAds.getCampaignFull(req.params.id));
}));

router.get('/campaigns/:id/insights', requireConfig, wrap(async (req, res) => {
  // Acotado 1-90: sin esto, ?days=100000 generaba un time_range absurdo contra Graph.
  const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));
  res.json(await metaAds.getCampaignInsights(req.params.id, days));
}));

router.put('/campaigns/:id/pause', requireConfig, wrap(async (req, res) => {
  const result = await metaAds.pauseCampaign(req.params.id);
  res.json({ ok: true, result });
}));

router.put('/campaigns/:id/resume', requireConfig, wrap(async (req, res) => {
  const result = await metaAds.resumeCampaign(req.params.id);
  res.json({ ok: true, result });
}));

// Edita nombre/estado/presupuesto — CBO-aware (ver updateCampaign en el servicio).
router.put('/campaigns/:id', requireConfig, wrap(async (req, res) => {
  const { name, status, dailyBudget, lifetimeBudget } = req.body || {};
  const result = await metaAds.updateCampaign(req.params.id, { name, status, dailyBudget, lifetimeBudget });
  res.json(result);
}));

router.post('/campaigns/:id/duplicate', requireConfig, wrap(async (req, res) => {
  const result = await metaAds.duplicateCampaign(req.params.id);
  res.json({ ok: true, result });
}));

router.post('/campaigns/:id/archive', requireConfig, wrap(async (req, res) => {
  await metaAds.archiveCampaign(req.params.id);
  res.json({ ok: true });
}));

router.delete('/campaigns/:id', requireConfig, wrap(async (req, res) => {
  await metaAds.deleteCampaign(req.params.id);
  res.json({ ok: true });
}));

// ─── Creación de campañas Click-to-WhatsApp (legacy) ──────────

router.get('/account', requireConfig, wrap(async (req, res) => {
  res.json(await metaAds.getAccountInfo());
}));

router.get('/locations', requireConfig, wrap(async (req, res) => {
  res.json(await metaAds.buscarUbicaciones(req.query.q));
}));

// Crea campaña + adset + (imagen) + creativo + anuncio en un solo paso, todo en PAUSED.
// El body es intencionalmente el mismo shape que espera createWhatsAppCampaign() —
// sin transformación intermedia, para que lo que ve el admin en el asistente sea
// exactamente lo que se manda a Meta.
router.post('/campaigns/whatsapp', requireConfig, wrap(async (req, res) => {
  // budgetCOP: pesos colombianos directos, SIN multiplicar por 100 — confirmado contra
  // la cuenta real (min_daily_budget:3233, adsets reales con lifetime_budget:"125000").
  const { campaignName, adsetName, budgetCOP, durationDays, targeting, adMessage, imageBase64, pageId } = req.body || {};
  if (!campaignName || !String(campaignName).trim()) return res.status(400).json({ error: 'falta_nombre_campana' });
  if (!budgetCOP || Number(budgetCOP) <= 0) return res.status(400).json({ error: 'presupuesto_invalido' });
  if (!targeting || !Array.isArray(targeting.cities) || !targeting.cities.length) return res.status(400).json({ error: 'falta_segmentacion' });
  if (!adMessage || !String(adMessage).trim()) return res.status(400).json({ error: 'falta_texto_anuncio' });
  try {
    const result = await metaAds.createWhatsAppCampaign({
      campaignName, adsetName, budgetCOP: Number(budgetCOP), durationDays: durationDays ? Number(durationDays) : null,
      targeting, adMessage, imageBase64, pageId,
    });
    console.log(`[META-ADS] Campaña creada PAUSED: ${result.campaign.id} — revisar en Ads Manager antes de activar`);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[META-ADS] Error creando campaña (puede haber quedado algo parcial en Meta):', e.message);
    handleError(res, e);
  }
}));

// Creación avanzada: objetivo elegible, targeting completo, imagen/video/carrusel,
// con rollback real si algo falla a mitad de camino (ver createAdvancedCampaign).
router.post('/campaigns/advanced', requireConfig, wrap(async (req, res) => {
  const input = req.body || {};
  if (!input.campaignName || !String(input.campaignName).trim()) return res.status(400).json({ error: 'falta_nombre_campana' });
  if (!input.budgetCOP || Number(input.budgetCOP) <= 0) return res.status(400).json({ error: 'presupuesto_invalido' });
  if (!input.targeting || !Array.isArray(input.targeting.cities) || !input.targeting.cities.length) return res.status(400).json({ error: 'falta_segmentacion' });
  if (!input.creative) return res.status(400).json({ error: 'falta_creativo' });
  try {
    const result = await metaAds.createAdvancedCampaign({ ...input, budgetCOP: Number(input.budgetCOP) });
    console.log(`[META-ADS] Campaña avanzada creada PAUSED: ${result.created.campaign.id}`);
    res.json(result);
  } catch (e) {
    console.error('[META-ADS] Error creando campaña avanzada:', e.message, e.rollback ? `(rollback: ${e.rollback})` : '');
    if (e instanceof metaAds.MetaApiError) {
      const status = e.httpStatus && e.httpStatus >= 400 ? e.httpStatus : 502;
      return res.status(status).json({
        error: 'error_creando_campana', detalle: e.message,
        userMessage: e.error_user_msg || null,
        created: e.created || null, rollback: e.rollback || null,
      });
    }
    res.status(500).json({ error: 'error_creando_campana', detalle: e.message });
  }
}));

// ─── Targeting avanzado ────────────────────────────────────────

router.get('/targeting/search', requireConfig, wrap(async (req, res) => {
  const type = req.query.type || 'interest';
  if (type === 'interest') return res.json(await metaAds.searchInterests(req.query.q));
  return res.status(400).json({ error: 'tipo_no_soportado' });
}));

router.post('/targeting/estimate', requireConfig, wrap(async (req, res) => {
  const { targeting, optimizationGoal } = req.body || {};
  if (!targeting) return res.status(400).json({ error: 'falta_targeting' });
  res.json(await metaAds.estimateReach(targeting, optimizationGoal));
}));

// ─── Medios: imágenes y video ──────────────────────────────────

router.post('/media/images', requireConfig, wrap(async (req, res) => {
  const { images } = req.body || {};
  if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: 'faltan_imagenes' });
  if (images.length > 10) return res.status(400).json({ error: 'maximo_10_imagenes' });
  const result = await metaAds.uploadAdImages(images);
  res.json({ ok: true, images: result });
}));

const uploadVideo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
function handleVideoUploadErrors(mw) {
  return (req, res, next) => mw(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'video_muy_grande', detalle: 'Máximo 500MB.' });
      return res.status(400).json({ error: 'error_subida', detalle: err.message });
    }
    res.status(500).json({ error: 'error_interno', detalle: err.message });
  });
}

router.post('/media/videos', requireConfig, handleVideoUploadErrors(uploadVideo.single('video')), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta_video' });
  const result = await metaAds.uploadAdVideo(req.file.buffer, req.file.originalname);
  res.json({ ok: true, ...result });
}));

router.get('/media/videos/:id/status', requireConfig, wrap(async (req, res) => {
  res.json(await metaAds.getVideoStatus(req.params.id));
}));

// Preview del anuncio ANTES de crearlo — paso de revisión del wizard. Recibe el mismo
// shape simplificado que POST /campaigns/advanced (creative + destination + pageId),
// arma el object_story_spec real con buildCreativeSpec y pide la previsualización a
// Meta con ese spec exacto — así lo que el admin ve en la revisión es pixel a pixel
// lo que se crearía si confirma.
router.post('/preview', requireConfig, wrap(async (req, res) => {
  const { creative, destination, pageId, adFormat } = req.body || {};
  if (!creative) return res.status(400).json({ error: 'falta_creativo' });
  const spec = metaAds.buildCreativeSpec({ creative, pageId, destination: destination === 'web' ? 'web' : 'whatsapp' });
  res.json(await metaAds.generatePreview(spec, adFormat));
}));

// ─── Ad Sets ─────────────────────────────────────────────────

router.get('/campaigns/:id/adsets', requireConfig, wrap(async (req, res) => {
  res.json(await metaAds.getAdSets(req.params.id));
}));

router.get('/adsets/:id', requireConfig, wrap(async (req, res) => {
  res.json(await metaAds.getAdSetById(req.params.id));
}));

router.put('/adsets/:id', requireConfig, wrap(async (req, res) => {
  const { name, status, dailyBudget, lifetimeBudget, endTime, targeting } = req.body || {};
  const result = await metaAds.updateAdSet(req.params.id, { name, status, dailyBudget, lifetimeBudget, endTime, targeting });
  res.json({ ok: true, result });
}));

// ─── Anuncios ────────────────────────────────────────────────

router.get('/adsets/:id/ads', requireConfig, wrap(async (req, res) => {
  res.json(await metaAds.getAds(req.params.id));
}));

router.put('/ads/:id', requireConfig, wrap(async (req, res) => {
  const { name, status } = req.body || {};
  const result = await metaAds.updateAd(req.params.id, { name, status });
  res.json({ ok: true, result });
}));

router.get('/ads/:id/preview', requireConfig, wrap(async (req, res) => {
  const preview = await metaAds.getAdPreview(req.params.id, req.query.format);
  res.json(preview);
}));

// ─── Audiencias personalizadas ───────────────────────────────

router.get('/audiences', requireConfig, wrap(async (req, res) => {
  res.json(await metaAds.getCustomAudiences());
}));

router.post('/audiences', requireConfig, wrap(async (req, res) => {
  const { name, leads } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name_requerido' });
  const audience = await metaAds.createCustomAudience(name, Array.isArray(leads) ? leads : []);
  res.json(audience);
}));

router.delete('/audiences/:id', requireConfig, wrap(async (req, res) => {
  await metaAds.deleteCustomAudience(req.params.id);
  res.json({ ok: true });
}));

router.post('/audiences/:id/add', requireConfig, wrap(async (req, res) => {
  const { leads } = req.body || {};
  if (!leads || !Array.isArray(leads)) return res.status(400).json({ error: 'leads (array) requerido' });
  const result = await metaAds.addToAudience(req.params.id, leads);
  res.json({ ok: true, result });
}));

router.post('/audiences/:id/remove', requireConfig, wrap(async (req, res) => {
  const { leads } = req.body || {};
  if (!leads || !Array.isArray(leads)) return res.status(400).json({ error: 'leads (array) requerido' });
  const result = await metaAds.removeFromAudience(req.params.id, leads);
  res.json({ ok: true, result });
}));

// Sube los leads activos del CRM directamente — antes el front tenía que armar la
// lista y mandarla, y si mandaba vacía (bug real) la audiencia quedaba huérfana.
router.post('/audiences/:id/sync-leads', requireConfig, wrap(async (req, res) => {
  res.json(await metaAds.syncLeadsToAudience(req.params.id));
}));

router.post('/audiences/:id/lookalike', requireConfig, wrap(async (req, res) => {
  const { country, ratio } = req.body || {};
  const audience = await metaAds.createLookalike(req.params.id, country || 'CO', ratio || 0.01);
  res.json(audience);
}));

// ─── Pixel ───────────────────────────────────────────────────

router.get('/pixel', requireConfig, wrap(async (req, res) => {
  res.json(await metaAds.getPixelInfo());
}));

module.exports = router;
