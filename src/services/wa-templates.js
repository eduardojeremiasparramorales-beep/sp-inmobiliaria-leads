// Catálogo de plantillas de WhatsApp: sincroniza las plantillas APROBADAS desde Meta
// (en vez de que el admin las escriba a mano, propenso a errores de nombre/idioma) y
// arma el payload real de la Graph API (header/body/botones) a partir de las variables
// del CRM (template-vars.js), en vez del envío ciego de parámetros posicionales.

const axios = require('axios');
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';

async function fetchApprovedTemplatesFromMeta() {
  // Vid.a V3: tenant-aware — el token del canal del negocio activo (env para #1).
  const { token } = require('./whatsapp').getAuth();
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!token) throw new Error('Falta token de canal');
  if (!wabaId) throw new Error('Falta WHATSAPP_BUSINESS_ACCOUNT_ID');

  const templates = [];
  let url = `https://graph.facebook.com/${API_VERSION}/${wabaId}/message_templates`;
  let params = { limit: 100 };
  while (url) {
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, params });
    templates.push(...(res.data.data || []));
    url = (res.data.paging && res.data.paging.next) || null;
    params = undefined; // la URL "next" ya trae los query params
  }
  return templates;
}

// Extrae los placeholders {{1}}, {{2}}... o {{nombre}} de un componente BODY.
function extractVariables(components) {
  const body = (components || []).find(c => c.type === 'BODY');
  if (!body || !body.text) return [];
  const matches = body.text.match(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/[{}]/g, '').trim()))];
}

async function syncTemplatesFromMeta() {
  const store = require('../db/store');
  const remote = await fetchApprovedTemplatesFromMeta();
  let synced = 0;
  for (const t of remote) {
    if (t.status !== 'APPROVED') continue; // solo se pueden usar plantillas aprobadas
    store.upsertWATemplateFull({
      nombre: t.name,
      idioma: t.language,
      categoria: t.category,
      estado: t.status,
      componentes: JSON.stringify(t.components || []),
      variables: JSON.stringify(extractVariables(t.components)),
    });
    synced++;
  }
  return { synced, total: remote.length };
}

// Arma los `components` reales de la Graph API a partir de la plantilla guardada y los
// valores ya resueltos por placeholder (ver resolveTemplateValues). Soporta header de
// texto o media, body con variables, y un botón URL con sufijo dinámico (el patrón más
// común en recordatorios de cita / catálogo).
function buildTemplateComponents(templateRecord, resolvedValues) {
  const meta = JSON.parse(templateRecord.componentes || '[]');
  const values = resolvedValues || {};
  const out = [];

  for (const c of meta) {
    if (c.type === 'HEADER') {
      if (c.format === 'TEXT' && /\{\{\s*[a-zA-Z0-9_]+\s*\}\}/.test(c.text || '')) {
        out.push({ type: 'header', parameters: [{ type: 'text', text: String(values.header || '') }] });
      } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format) && values.headerMediaUrl) {
        const key = c.format.toLowerCase();
        out.push({ type: 'header', parameters: [{ type: key, [key]: { link: values.headerMediaUrl } }] });
      }
    } else if (c.type === 'BODY') {
      const names = extractVariables([c]);
      if (names.length) {
        out.push({ type: 'body', parameters: names.map(name => ({ type: 'text', text: String(values[name] ?? '') })) });
      }
    } else if (c.type === 'BUTTONS' && values.buttonUrlSuffix) {
      const idx = (c.buttons || []).findIndex(b => b.type === 'URL' && /\{\{\s*[a-zA-Z0-9_]+\s*\}\}/.test(b.url || ''));
      if (idx >= 0) {
        out.push({ type: 'button', sub_type: 'url', index: String(idx), parameters: [{ type: 'text', text: String(values.buttonUrlSuffix) }] });
      }
    }
  }
  return out;
}

// Resuelve cada placeholder de la plantilla a un valor final: primero un override
// explícito (lo que el vendedor escribió/editó en el formulario), luego el mapeo
// configurado (placeholder → variable del catálogo) resuelto contra el lead/vendedor,
// y si nada aplica, cadena vacía.
function resolveTemplateValues(templateRecord, lead, vendedor, overrides) {
  const { resolveLeadVariables } = require('./template-vars');
  const mapping = JSON.parse(templateRecord.var_mapping || '{}');
  const placeholders = JSON.parse(templateRecord.variables || '[]');
  const leadVars = resolveLeadVariables(lead, vendedor);
  const ov = overrides || {};

  const values = {};
  for (const ph of placeholders) {
    if (ov[ph] !== undefined && ov[ph] !== null && String(ov[ph]).trim() !== '') {
      values[ph] = String(ov[ph]);
    } else {
      const catalogKey = mapping[ph] || ph; // fallback: placeholder es igual a una clave del catálogo
      values[ph] = (catalogKey && leadVars[catalogKey]) || ov[ph] || '';
    }
  }
  if (ov.header !== undefined) values.header = ov.header;
  if (ov.headerMediaUrl) values.headerMediaUrl = ov.headerMediaUrl;
  if (ov.buttonUrlSuffix) values.buttonUrlSuffix = ov.buttonUrlSuffix;
  return values;
}

// Envía una plantilla ya sincronizada, resolviendo sus variables desde el lead/vendedor
// más los overrides manuales. Es el punto de entrada único usado por "iniciar
// conversación" (Fase 1.4) y, más adelante, por el motor de campañas (Fase 2).
async function sendResolvedTemplate(to, templateRecord, lead, vendedor, overrides) {
  const { sendTemplate } = require('./whatsapp');
  const values = resolveTemplateValues(templateRecord, lead, vendedor, overrides);
  const components = buildTemplateComponents(templateRecord, values);
  return sendTemplate(to, templateRecord.nombre, components, templateRecord.idioma);
}

// Recordatorio de cita: arma los values finales para la plantilla con los datos del
// LEAD (nombre, etc.) más la fecha/hora de la CITA en español legible (Colombia).
// El texto plano resultante sirve para el registro en el chat y para canales que no
// soportan plantillas Meta (Messenger/Instagram lo envían como mensaje normal).
function buildCitaRecordatorioValues(templateRecord, lead, vendedor, cita) {
  const values = resolveTemplateValues(templateRecord, lead, vendedor, {});
  const fec = new Date(String(cita && cita.fecha).replace(' ', 'T'));
  const valido = !isNaN(fec.getTime());
  const fechaTxt = valido ? fec.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const horaTxt = valido ? fec.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
  values.fecha_cita = fechaTxt;
  values.hora_cita = horaTxt;
  values.hora_cita_12 = valido ? fec.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
  // Si la plantilla tiene {{1}}, {{2}}… posicionales, se completa el primero con el
  // nombre del cliente como patrón mínimo (el remitente debe mapear el resto en Config).
  return values;
}

function buildCitaRecordatorioComponents(templateRecord, values) {
  return buildTemplateComponents(templateRecord, values);
}

// Texto plano del recordatorio (para registrar en el chat y para canales sin plantillas)
function recordatorioTextoPlano(templateRecord, values) {
  try {
    const meta = JSON.parse(templateRecord.componentes || '[]');
    const body = (Array.isArray(meta) ? meta : []).find(c => (c.type || '').toUpperCase() === 'BODY');
    if (body && body.text) {
      return String(body.text).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => String(values[k] ?? ''));
    }
  } catch (e) { /* cae al fallback */ }
  return '';
}

module.exports = {
  fetchApprovedTemplatesFromMeta, syncTemplatesFromMeta, extractVariables,
  buildTemplateComponents, resolveTemplateValues, sendResolvedTemplate,
  buildCitaRecordatorioValues, buildCitaRecordatorioComponents, recordatorioTextoPlano,
};
