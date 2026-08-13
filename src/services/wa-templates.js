// Catálogo de plantillas de WhatsApp: sincroniza las plantillas APROBADAS desde Meta
// (en vez de que el admin las escriba a mano, propenso a errores de nombre/idioma) y
// arma el payload real de la Graph API (header/body/botones) a partir de las variables
// del CRM (template-vars.js), en vez del envío ciego de parámetros posicionales.

const axios = require('axios');
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';

// Una columna JSON corrupta (edición manual en BD, migración a medias) no debe tumbar
// TODO el envío de plantillas/campañas — cae al fallback y sigue.
function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v === null || v === undefined ? fallback : v;
  } catch (e) {
    console.error('[wa-templates] JSON inválido en plantilla, usando fallback:', e.message);
    return fallback;
  }
}

async function fetchApprovedTemplatesFromMeta() {
  // Vid.a V3: tenant-aware — el WABA_ID y el token del canal del negocio activo
  // (env para #1, extra_json.waba_id para los demás — ver whatsapp.js getAuth/getGraphConfig).
  const { headers, wabaId, base } = require('./whatsapp').getGraphConfig();

  const templates = [];
  let url = `${base}/${wabaId}/message_templates`;
  let params = { limit: 100 };
  while (url) {
    const res = await axios.get(url, { headers, params });
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

// Meta le da "hello_world" a TODA cuenta de WhatsApp Business como plantilla de
// ejemplo — sincroniza como APPROVED igual que las reales, pero Meta la rechaza
// siempre que se intenta mandar desde un número real de negocio: "(#131058) Hello
// World templates can only be sent from the Public Test Numbers". No es un error de
// configuración, es una restricción permanente de Meta. Como el CRM la mostraba
// igual que 'reengagement' en el panel de reactivar, sin ninguna advertencia, un
// asesor la eligió por error creyendo que serviría — nunca puede funcionar, así que
// se excluye de la sincronización para que ni siquiera aparezca como opción.
const PLANTILLAS_META_NO_ENVIABLES = new Set(['hello_world']);

// Candidata razonable para auto-configurar `reengagement_template` cuando el admin
// nunca la eligió — causa raíz real de "no se puede reactivar a un cliente": el motor
// de envío (sendMessageSmart) ya sabe usarla, solo le faltaba el nombre en `config`.
// Nunca sobrescribe una elección existente del admin (ver llamada más abajo).
function elegirCandidataReactivacion(aprobadas) {
  const usables = aprobadas.filter(t => t.categoria !== 'AUTHENTICATION');
  const pocasVariables = usables.filter(t => {
    try { return (JSON.parse(t.variables || '[]') || []).length <= 1; } catch (e) { return true; }
  });
  const porNombre = (lista) => lista.find(t => /reengage|reactiv|bienvenid/i.test(t.nombre));
  return porNombre(pocasVariables) || porNombre(usables) || pocasVariables[0] || usables[0] || null;
}

async function syncTemplatesFromMeta() {
  const store = require('../db/store');
  const remote = await fetchApprovedTemplatesFromMeta();
  let synced = 0;
  const porEstado = {};
  const vistosMetaIds = new Set();

  // Purga la que ya haya quedado guardada de una sincronización anterior — excluirla
  // de aquí en adelante no la saca de la BD por sí solo, solo evita que vuelva a entrar.
  for (const nombre of PLANTILLAS_META_NO_ENVIABLES) {
    const existente = store.getWATemplateByName(nombre);
    if (existente) store.deleteWATemplate(existente.id);
  }

  for (const t of remote) {
    if (PLANTILLAS_META_NO_ENVIABLES.has(t.name)) continue;
    // A diferencia de la versión original, se guardan TODOS los estados (no solo
    // APPROVED) — una plantilla en revisión o rechazada tiene que ser visible en el
    // gestor, no desaparecer sin explicación. El filtro a "solo enviables" vive en
    // getWATemplatesAprobadas() / GET /api/wa-templates (default estado=APPROVED).
    store.upsertWATemplateByMetaId({
      nombre: t.name,
      idioma: t.language,
      categoria: t.category,
      estado: t.status,
      componentes: JSON.stringify(t.components || []),
      variables: JSON.stringify(extractVariables(t.components)),
      metaTemplateId: t.id,
      motivoRechazo: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null,
      calidad: t.quality_score && t.quality_score.score || null,
    });
    if (t.id) vistosMetaIds.add(String(t.id));
    porEstado[t.status] = (porEstado[t.status] || 0) + 1;
    synced++;
  }

  // Reconciliación: una plantilla que teníamos guardada (con meta_template_id, es
  // decir que vino de un sync anterior) y ya no aparece en la respuesta de Meta fue
  // borrada allá — se marca DELETED en vez de borrarla localmente porque
  // campaigns.template_id puede seguir referenciándola.
  for (const local of store.getWATemplates()) {
    if (local.meta_template_id && !vistosMetaIds.has(String(local.meta_template_id)) && local.estado !== 'DELETED') {
      store.setWATemplateEstado(local.id, { estado: 'DELETED' });
    }
  }

  // Auto-configurar la plantilla de reactivación solo si el admin nunca eligió una —
  // ver elegirCandidataReactivacion(). Idempotente: no hace nada en syncs siguientes.
  if (!store.getConfig('reengagement_template')) {
    const candidata = elegirCandidataReactivacion(store.getWATemplatesAprobadas());
    if (candidata) {
      store.setConfig('reengagement_template', candidata.nombre);
      console.log(`[wa-templates] reengagement_template auto-configurado → "${candidata.nombre}"`);
    }
  }

  return { synced, total: remote.length, porEstado };
}

// Una plantilla usa parámetros CON NOMBRE ({{nombre_variable}}) o POSICIONALES ({{1}},
// {{2}}...) — nunca mezcla los dos estilos en el mismo componente. Meta lo señala en el
// propio componente guardado: trae `example.body_text_named_params` (o
// `header_text_named_params`) solo cuando es con nombre. La Cloud API exige un shape de
// parámetro distinto según el caso — mandar el que no toca lo rechaza en silencio desde
// el punto de vista del CRM (responde 400, pero si no se lee `detalle` se ve como que
// "no pasó nada"), que es justo lo que le pasaba a "reengagement" con su {{name}}.
function isNamedParams(component) {
  const ex = component && component.example;
  return !!(ex && (ex.body_text_named_params || ex.header_text_named_params));
}

function buildTextParam(name, value, named) {
  const text = String(value ?? '');
  return named ? { type: 'text', parameter_name: name, text } : { type: 'text', text };
}

// Arma los `components` reales de la Graph API a partir de la plantilla guardada y los
// valores ya resueltos por placeholder (ver resolveTemplateValues). Soporta header de
// texto o media, body con variables (posicionales o con nombre), y un botón URL con
// sufijo dinámico (el patrón más común en recordatorios de cita / catálogo).
function buildTemplateComponents(templateRecord, resolvedValues) {
  const meta = safeParse(templateRecord.componentes, []);
  const values = resolvedValues || {};
  const out = [];

  for (const c of meta) {
    if (c.type === 'HEADER') {
      if (c.format === 'TEXT' && /\{\{\s*[a-zA-Z0-9_]+\s*\}\}/.test(c.text || '')) {
        const names = extractVariables([{ type: 'BODY', text: c.text }]);
        const named = isNamedParams(c);
        const name = named ? names[0] : undefined;
        out.push({ type: 'header', parameters: [buildTextParam(name, values.header, named)] });
      } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format) && values.headerMediaUrl) {
        const key = c.format.toLowerCase();
        out.push({ type: 'header', parameters: [{ type: key, [key]: { link: values.headerMediaUrl } }] });
      }
    } else if (c.type === 'BODY') {
      const names = extractVariables([c]);
      if (names.length) {
        const named = isNamedParams(c);
        out.push({ type: 'body', parameters: names.map(name => buildTextParam(name, values[name], named)) });
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
  const mapping = safeParse(templateRecord.var_mapping, {});
  const placeholders = safeParse(templateRecord.variables, []);
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
  const { formatearFechaHoraCita } = require('./template-vars');
  const f = formatearFechaHoraCita(cita && cita.fecha);
  values.fecha_cita = f.fechaTxt;
  values.hora_cita = f.horaTxt;
  values.hora_cita_12 = f.horaTxt12;
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

// ═══════════════════════ Gestor de plantillas (crear/editar/borrar en Meta) ═══════════════════════
//
// spec = { nombre, idioma, categoria, parameterFormat: 'NAMED'|'POSITIONAL',
//          header: { tipo:'ninguno'|'texto'|'imagen'|'video'|'documento', texto, ejemplos:{} },
//          body: { texto, ejemplos:{} },      // ejemplos: { nombre_variable: 'valor de ejemplo' }
//          footer: { texto },
//          botones: [{ tipo:'QUICK_REPLY'|'URL'|'PHONE_NUMBER', texto, url, telefono, ejemplo }] }
// El constructor del CRM siempre crea en NAMED, usando como placeholders las claves del
// catálogo de template-vars.js — así var_mapping sale auto-rellenado (ver createTemplateInMeta).

function slugificarNombre(raw) {
  return String(raw || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 512);
}

// Validación pura (sin red) — la misma función corre en el servidor (obligatoria, antes
// de llamar a Meta) y se expone vía POST /api/wa-templates/validar para que el
// constructor la use con debounce mientras el admin escribe. opts.excludeId: al editar,
// no marcar como duplicado el nombre/idioma de la propia plantilla.
function validateTemplateSpec(spec, opts = {}) {
  const store = require('../db/store');
  const errores = [];
  const advertencias = [];
  const s = spec || {};

  // --- Nombre ---
  const nombreSlug = slugificarNombre(s.nombre);
  if (!nombreSlug) {
    errores.push({ campo: 'nombre', mensaje: 'El nombre es obligatorio.' });
  } else if (!/^[a-z0-9_]{1,512}$/.test(nombreSlug)) {
    errores.push({ campo: 'nombre', mensaje: 'El nombre solo puede tener minúsculas, números y guion bajo.' });
  } else {
    const idioma = s.idioma || 'es';
    const existente = store.getWATemplateByNameIdioma(nombreSlug, idioma);
    if (existente && existente.id !== opts.excludeId) {
      errores.push({ campo: 'nombre', mensaje: `Ya existe una plantilla "${nombreSlug}" en idioma "${idioma}".` });
    }
  }

  // --- Categoría ---
  if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(s.categoria)) {
    errores.push({ campo: 'categoria', mensaje: 'Elige una categoría: Marketing, Utilidad o Autenticación.' });
  }

  // --- Header ---
  if (s.header && ['imagen', 'video', 'documento'].includes(s.header.tipo)) {
    errores.push({ campo: 'header', mensaje: 'Los encabezados de imagen/video/documento aún no están disponibles desde el CRM — próximamente.' });
  } else if (s.header && s.header.tipo === 'texto') {
    const texto = s.header.texto || '';
    if (!texto.trim()) errores.push({ campo: 'header', mensaje: 'El texto del encabezado no puede estar vacío.' });
    if (texto.length > 60) errores.push({ campo: 'header', mensaje: `El encabezado no puede superar 60 caracteres (tiene ${texto.length}).` });
    const names = extractVariables([{ type: 'BODY', text: texto }]);
    if (names.length > 1) errores.push({ campo: 'header', mensaje: 'El encabezado admite máximo 1 variable.' });
    else if (names.length === 1) {
      const ejemplo = (s.header.ejemplos && s.header.ejemplos[names[0]]) || '';
      if (!String(ejemplo).trim()) errores.push({ campo: 'header', mensaje: `Falta el ejemplo de {{${names[0]}}} en el encabezado.` });
    }
  }

  // --- Body (obligatorio) ---
  const bodyTexto = (s.body && s.body.texto) || '';
  const bodyTrim = bodyTexto.trim();
  if (!bodyTrim) errores.push({ campo: 'body', mensaje: 'El cuerpo del mensaje es obligatorio.' });
  if (bodyTexto.length > 1024) errores.push({ campo: 'body', mensaje: `El cuerpo no puede superar 1024 caracteres (tiene ${bodyTexto.length}).` });
  if (/^\{\{\s*[a-zA-Z0-9_]+\s*\}\}/.test(bodyTrim)) errores.push({ campo: 'body', mensaje: 'El cuerpo no puede empezar con una variable.' });
  if (/\{\{\s*[a-zA-Z0-9_]+\s*\}\}$/.test(bodyTrim)) errores.push({ campo: 'body', mensaje: 'El cuerpo no puede terminar con una variable.' });
  if (/\}\}\s*\{\{/.test(bodyTexto)) errores.push({ campo: 'body', mensaje: 'No puede haber dos variables seguidas.' });

  const bodyNames = extractVariables([{ type: 'BODY', text: bodyTexto }]);
  const bodyEjemplos = (s.body && s.body.ejemplos) || {};
  const numericos = bodyNames.filter(n => /^\d+$/.test(n)).map(Number).sort((a, b) => a - b);
  if (numericos.length) {
    for (let i = 0; i < numericos.length; i++) {
      if (numericos[i] !== i + 1) {
        errores.push({ campo: 'body', mensaje: 'Las variables posicionales deben numerarse consecutivamente desde {{1}}, sin saltos.' });
        break;
      }
    }
  }
  bodyNames.forEach(n => {
    const ej = bodyEjemplos[n];
    if (!ej || !String(ej).trim()) errores.push({ campo: 'body', mensaje: `Falta el valor de ejemplo de {{${n}}}.` });
  });
  if (bodyNames.length) {
    const palabras = bodyTexto.split(/\s+/).filter(Boolean).length;
    if (bodyNames.length > palabras / 3) {
      advertencias.push({ campo: 'body', mensaje: 'El cuerpo tiene muchas variables en relación al texto — Meta puede rechazarlo por parecer spam.' });
    }
  }

  // --- Footer ---
  if (s.footer && s.footer.texto) {
    if (s.footer.texto.length > 60) errores.push({ campo: 'footer', mensaje: `El pie no puede superar 60 caracteres (tiene ${s.footer.texto.length}).` });
    if (/\{\{/.test(s.footer.texto)) errores.push({ campo: 'footer', mensaje: 'El pie no puede tener variables.' });
  }

  // --- Botones ---
  const botones = Array.isArray(s.botones) ? s.botones : [];
  if (botones.length > 10) errores.push({ campo: 'botones', mensaje: 'Máximo 10 botones en total.' });
  if (botones.filter(b => b.tipo === 'PHONE_NUMBER').length > 1) errores.push({ campo: 'botones', mensaje: 'Máximo 1 botón de teléfono.' });
  if (botones.filter(b => b.tipo === 'URL').length > 2) errores.push({ campo: 'botones', mensaje: 'Máximo 2 botones de URL.' });

  const tipos = botones.map(b => (b.tipo === 'QUICK_REPLY' ? 'Q' : 'C'));
  const primeraC = tipos.indexOf('C'), ultimaC = tipos.lastIndexOf('C');
  const primeraQ = tipos.indexOf('Q'), ultimaQ = tipos.lastIndexOf('Q');
  if (primeraQ !== -1 && primeraC !== -1) {
    const qAntesDeC = ultimaQ < primeraC;
    const cAntesDeQ = ultimaC < primeraQ;
    if (!qAntesDeC && !cAntesDeQ) {
      errores.push({ campo: 'botones', mensaje: 'Los botones de respuesta rápida no se pueden intercalar con los de URL/teléfono — deben ir todos juntos, al principio o al final.' });
    }
  }

  const textosVistos = new Set();
  botones.forEach((b, i) => {
    const texto = (b.texto || '').trim();
    if (!texto) errores.push({ campo: 'botones', mensaje: `El botón #${i + 1} necesita un texto.` });
    else if (texto.length > 25) errores.push({ campo: 'botones', mensaje: `El texto del botón "${texto}" no puede superar 25 caracteres.` });
    else if (textosVistos.has(texto.toLowerCase())) errores.push({ campo: 'botones', mensaje: `Hay dos botones con el mismo texto: "${texto}".` });
    textosVistos.add(texto.toLowerCase());

    if (b.tipo === 'URL') {
      const url = b.url || '';
      if (!url.trim()) errores.push({ campo: 'botones', mensaje: `Falta la URL del botón "${texto}".` });
      if (url.length > 2000) errores.push({ campo: 'botones', mensaje: `La URL de "${texto}" supera 2000 caracteres.` });
      const urlNames = extractVariables([{ type: 'BODY', text: url }]);
      if (urlNames.length > 1) errores.push({ campo: 'botones', mensaje: `La URL de "${texto}" admite máximo 1 variable.` });
      else if (urlNames.length === 1) {
        if (!/\{\{\s*[a-zA-Z0-9_]+\s*\}\}\s*$/.test(url.trim())) errores.push({ campo: 'botones', mensaje: `La variable de la URL de "${texto}" debe ir al final.` });
        if (!(b.ejemplo && String(b.ejemplo).trim())) errores.push({ campo: 'botones', mensaje: `Falta el ejemplo de la URL de "${texto}".` });
      }
    }
    if (b.tipo === 'PHONE_NUMBER' && !/^\+[1-9]\d{6,14}$/.test(String(b.telefono || '').trim())) {
      errores.push({ campo: 'botones', mensaje: `El teléfono de "${texto}" debe estar en formato internacional (+573001234567).` });
    }
  });

  return { ok: errores.length === 0, errores, advertencias, nombreSlug };
}

// Traduce el spec del constructor a los `components` reales de la Graph API (mayúsculas,
// shape distinto al de buildTemplateComponents — ese arma el ENVÍO, este arma la CREACIÓN).
// Devuelve también la lista de variables detectadas, para auto-rellenar var_mapping.
function buildMetaTemplatePayload(spec) {
  const s = spec || {};
  const nombre = slugificarNombre(s.nombre);
  const idioma = s.idioma || 'es';
  const parameterFormat = s.parameterFormat === 'POSITIONAL' ? 'POSITIONAL' : 'NAMED';
  const named = parameterFormat === 'NAMED';
  const components = [];
  const variables = [];

  if (s.header && s.header.tipo === 'texto' && s.header.texto) {
    const names = extractVariables([{ type: 'BODY', text: s.header.texto }]);
    const comp = { type: 'HEADER', format: 'TEXT', text: s.header.texto };
    if (names.length) {
      const name = names[0];
      variables.push(name);
      const ejemplo = (s.header.ejemplos && s.header.ejemplos[name]) || '';
      comp.example = named
        ? { header_text_named_params: [{ param_name: name, example: ejemplo }] }
        : { header_text: [ejemplo] };
    }
    components.push(comp);
  }

  const bodyTexto = (s.body && s.body.texto) || '';
  const bodyNames = extractVariables([{ type: 'BODY', text: bodyTexto }]);
  const bodyComp = { type: 'BODY', text: bodyTexto };
  if (bodyNames.length) {
    const ejemplos = (s.body && s.body.ejemplos) || {};
    bodyNames.forEach(n => variables.push(n));
    bodyComp.example = named
      ? { body_text_named_params: bodyNames.map(n => ({ param_name: n, example: ejemplos[n] || '' })) }
      : { body_text: [bodyNames.map(n => ejemplos[n] || '')] }; // array DE arrays — shape exigido por Meta en posicional
  }
  components.push(bodyComp);

  if (s.footer && s.footer.texto) {
    components.push({ type: 'FOOTER', text: s.footer.texto });
  }

  if (Array.isArray(s.botones) && s.botones.length) {
    const buttons = s.botones.map(b => {
      if (b.tipo === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.texto };
      if (b.tipo === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.texto, phone_number: b.telefono };
      if (b.tipo === 'URL') {
        const btn = { type: 'URL', text: b.texto, url: b.url };
        if (extractVariables([{ type: 'BODY', text: b.url || '' }]).length) btn.example = [b.ejemplo || ''];
        return btn;
      }
      return null;
    }).filter(Boolean);
    if (buttons.length) components.push({ type: 'BUTTONS', buttons });
  }

  const payload = { name: nombre, language: idioma, category: s.categoria, parameter_format: parameterFormat, components };
  return { payload, variables: [...new Set(variables)] };
}

async function createTemplateInMeta(spec) {
  const validacion = validateTemplateSpec(spec);
  if (!validacion.ok) { const e = new Error('spec_invalido'); e.validacion = validacion; throw e; }
  const { payload } = buildMetaTemplatePayload(spec);
  const { headers, wabaId, base } = require('./whatsapp').getGraphConfig();
  try {
    const res = await axios.post(`${base}/${wabaId}/message_templates`, payload, { headers });
    return res.data; // { id, status, category }
  } catch (err) {
    try { require('./whatsapp').reportGraphError(err); } catch (e) { /* alerta opcional */ }
    throw err;
  }
}

// No se puede cambiar `name` ni `language` en una edición — Meta los ignora si vienen en
// el body, así que solo se envían components (y category, que Meta acepta mientras la
// plantilla siga PENDING). Límite de Meta: 10 ediciones/30 días, 1/24h en aprobadas —
// editar una APPROVED la devuelve a PENDING.
async function updateTemplateInMeta(metaId, spec, excludeId) {
  const validacion = validateTemplateSpec(spec, { excludeId });
  if (!validacion.ok) { const e = new Error('spec_invalido'); e.validacion = validacion; throw e; }
  const { payload } = buildMetaTemplatePayload(spec);
  const { headers, base } = require('./whatsapp').getGraphConfig();
  try {
    const res = await axios.post(`${base}/${metaId}`, { category: payload.category, components: payload.components }, { headers });
    return res.data;
  } catch (err) {
    try { require('./whatsapp').reportGraphError(err); } catch (e) { /* alerta opcional */ }
    throw err;
  }
}

// SIEMPRE con hsm_id — sin él, Meta borra TODOS los idiomas que compartan ese `name`.
async function deleteTemplateInMeta(nombre, metaId) {
  const { headers, wabaId, base } = require('./whatsapp').getGraphConfig();
  try {
    const res = await axios.delete(`${base}/${wabaId}/message_templates`, { headers, params: { hsm_id: metaId, name: nombre } });
    return res.data;
  } catch (err) {
    try { require('./whatsapp').reportGraphError(err); } catch (e) { /* alerta opcional */ }
    throw err;
  }
}

// Refresco puntual de una plantilla concreta (botón "Comprobar estado" y respaldo del
// scheduler si el webhook no llega).
async function fetchTemplateFromMeta(metaId) {
  const { headers, base } = require('./whatsapp').getGraphConfig();
  const res = await axios.get(`${base}/${metaId}`, {
    headers, params: { fields: 'name,language,category,status,components,quality_score,rejected_reason' },
  });
  return res.data;
}

// Traduce un error de la Graph API a algo accionable en español, sin perder el código
// original (para depurar) ni el mensaje de Meta (a veces es el más preciso posible).
function normalizeMetaError(err) {
  const errData = err.response && err.response.data && err.response.data.error;
  if (!errData) return { codigo: null, subcodigo: null, mensaje: err.message, sugerencia: null };
  const codigo = errData.code;
  const subcodigo = errData.error_subcode;
  const base = { codigo, subcodigo, mensaje: errData.error_user_msg || errData.message || 'Error desconocido de Meta', sugerencia: null };

  if (codigo === 100 && subcodigo === 2388024) return { ...base, sugerencia: 'Ya existe una plantilla con ese nombre en ese idioma. Cambia el nombre o edita la existente.' };
  if (codigo === 100 && subcodigo === 2388043) return { ...base, sugerencia: 'Falta un valor de ejemplo para alguna variable.' };
  if (codigo === 190) return { ...base, sugerencia: 'El token de WhatsApp expiró o fue revocado. Renueva el token del canal.' };
  if (codigo === 200 && subcodigo === 10) return { ...base, sugerencia: 'El token no tiene el permiso whatsapp_business_management. Genera uno nuevo con ese scope en Meta.' };
  if (codigo === 4 || subcodigo === 80007) return { ...base, sugerencia: 'Meta está limitando las peticiones. Reintenta en unos minutos.' };
  return base;
}

// ═══════════════════════ Ciclo de vida (webhook de estado) ═══════════════════════
//
// Procesa los `changes` de message_template_status_update / quality_update /
// category_update que engancha src/webhook/messages.js (ANTES de la resolución por
// phone_number_id — estos eventos identifican al dueño por entry.id = WABA_ID).
// Ya corre dentro del tenantContext del negocio dueño (ver ctxTpl en messages.js).
async function handleTemplateWebhook(changes) {
  const store = require('../db/store');
  for (const change of changes || []) {
    const v = change && change.value;
    if (!v) continue;

    if (change.field === 'message_template_status_update') {
      const fila = localizarFilaWebhook(v.message_template_id, v.message_template_name, v.message_template_language);
      if (!fila) { console.log(`[wa-templates] webhook de estado para plantilla desconocida: ${v.message_template_name}/${v.message_template_language}`); continue; }
      const motivo = v.reason && v.reason !== 'NONE' ? v.reason : null;
      const detalle = v.other_info ? [v.other_info.title, v.other_info.description].filter(Boolean).join(' — ') : null;
      store.setWATemplateEstado(fila.id, { estado: v.event, motivo, detalle });
      console.log(`[wa-templates] webhook ${v.event} — "${fila.nombre}" (${fila.idioma})${motivo ? ` motivo=${motivo}` : ''}`);

      // Si se aprobó y la creamos aquí (spec_json, sin componentes normalizados aún),
      // traer de Meta los components ya normalizados y recalcular variables.
      if (v.event === 'APPROVED' && fila.creado_en_crm && fila.meta_template_id && (!fila.componentes || fila.componentes === '[]')) {
        try {
          const remoto = await fetchTemplateFromMeta(fila.meta_template_id);
          store.updateWATemplateSpec(fila.id, {
            componentes: JSON.stringify(remoto.components || []),
            variables: JSON.stringify(extractVariables(remoto.components)),
          });
        } catch (e) { console.error('[wa-templates] refresco tras aprobación:', e.message); }
      }

      await notificarEstadoPlantilla(fila.nombre, v.event, motivo, detalle);
      try { require('./events').emitToAdmins('plantilla_estado', { id: fila.id, nombre: fila.nombre, estado: v.event, motivo, detalle }); } catch (e) { /* SSE opcional */ }

    } else if (change.field === 'message_template_quality_update') {
      const fila = localizarFilaWebhook(v.message_template_id, v.message_template_name, v.message_template_language);
      if (!fila) continue;
      const calidad = v.new_quality_score || null;
      store.setWATemplateEstado(fila.id, { calidad });
      if (calidad === 'RED') await notificarEstadoPlantilla(fila.nombre, 'CALIDAD_BAJA', null, 'La calidad bajó a RED — Meta puede pausarla automáticamente.');
      try { require('./events').emitToAdmins('plantilla_estado', { id: fila.id, nombre: fila.nombre, calidad }); } catch (e) { /* SSE opcional */ }

    } else if (change.field === 'template_category_update') {
      const fila = localizarFilaWebhook(v.message_template_id, v.message_template_name, v.message_template_language);
      if (!fila) continue;
      store.upsertWATemplateByMetaId({ nombre: fila.nombre, idioma: fila.idioma, categoria: v.new_category, estado: fila.estado, componentes: fila.componentes, variables: fila.variables, metaTemplateId: fila.meta_template_id });
      await notificarEstadoPlantilla(fila.nombre, 'CATEGORIA_CAMBIADA', null, `Meta recategorizó la plantilla a ${v.new_category}.`);
    }
  }
}

function localizarFilaWebhook(metaTemplateId, nombre, idioma) {
  const store = require('../db/store');
  if (metaTemplateId) {
    const porId = store.getWATemplateByMetaId(metaTemplateId);
    if (porId) return porId;
  }
  if (nombre && idioma) {
    const porNombreIdioma = store.getWATemplateByNameIdioma(nombre, idioma);
    if (porNombreIdioma) return porNombreIdioma;
  }
  return nombre ? store.getWATemplateByName(nombre) : null;
}

async function notificarEstadoPlantilla(nombre, evento, motivo, detalle) {
  const copy = {
    APPROVED: { titulo: '✅ Plantilla aprobada', cuerpo: `"${nombre}" fue aprobada por Meta — ya se puede enviar.` },
    REJECTED: { titulo: '❌ Plantilla rechazada', cuerpo: `"${nombre}" fue rechazada${motivo ? `: ${motivo}` : ''}.${detalle ? ` ${detalle}` : ''}` },
    PAUSED: { titulo: '⚠️ Plantilla pausada', cuerpo: `Meta pausó "${nombre}" por baja calidad. Deja de usarse en campañas.` },
    DISABLED: { titulo: '⛔ Plantilla deshabilitada', cuerpo: `Meta deshabilitó "${nombre}".${detalle ? ` ${detalle}` : ''}` },
    CALIDAD_BAJA: { titulo: '⚠️ Calidad en rojo', cuerpo: `"${nombre}": ${detalle}` },
    CATEGORIA_CAMBIADA: { titulo: '🔄 Categoría actualizada', cuerpo: `"${nombre}": ${detalle}` },
  }[evento];
  if (!copy) return; // PENDING, IN_APPEAL, FLAGGED, etc. — sin acción del admin, no molestar
  try {
    await require('./notify').notify({ vendedorId: 0, tipo: 'plantilla_estado', push: true, ...copy });
  } catch (e) { console.error('[wa-templates] notify:', e.message); }
}

// Respaldo por si el webhook no llega (app no suscrita, downtime de Meta): refresca las
// plantillas en revisión contra la Graph API. Coste bajo — normalmente 0-2 filas.
async function refrescarEstadosPendientes() {
  const store = require('../db/store');
  const pendientes = store.getWATemplates().filter(t => ['PENDING', 'IN_APPEAL'].includes(t.estado) && t.meta_template_id);
  for (const t of pendientes) {
    try {
      const remoto = await fetchTemplateFromMeta(t.meta_template_id);
      if (remoto.status && remoto.status !== t.estado) {
        store.setWATemplateEstado(t.id, {
          estado: remoto.status,
          motivo: remoto.rejected_reason && remoto.rejected_reason !== 'NONE' ? remoto.rejected_reason : null,
        });
        if (remoto.components) store.updateWATemplateSpec(t.id, { componentes: JSON.stringify(remoto.components), variables: JSON.stringify(extractVariables(remoto.components)) });
        await notificarEstadoPlantilla(t.nombre, remoto.status);
        try { require('./events').emitToAdmins('plantilla_estado', { id: t.id, nombre: t.nombre, estado: remoto.status }); } catch (e) { /* SSE opcional */ }
      }
    } catch (e) { console.error(`[wa-templates] refrescarEstadosPendientes(${t.nombre}):`, e.message); }
  }
}

module.exports = {
  fetchApprovedTemplatesFromMeta, syncTemplatesFromMeta, extractVariables,
  buildTemplateComponents, resolveTemplateValues, sendResolvedTemplate,
  buildCitaRecordatorioValues, buildCitaRecordatorioComponents, recordatorioTextoPlano,
  slugificarNombre, validateTemplateSpec, buildMetaTemplatePayload,
  createTemplateInMeta, updateTemplateInMeta, deleteTemplateInMeta, fetchTemplateFromMeta,
  normalizeMetaError, handleTemplateWebhook, refrescarEstadosPendientes,
};
