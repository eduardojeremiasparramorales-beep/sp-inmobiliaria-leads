const { routeReply, routeIncomingMedia, routeIncomingLocation } = require('../services/assigner');
const { sendMessage, downloadMedia } = require('../services/whatsapp');
const { saveMessageMedia } = require('../services/media');
const store = require('../db/store');
const events = require('../services/events');
const adapter = require('../db/adapter');

const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'];
// Tipos de mensaje entrante que crean una fila nueva en `messages` (dedup aplica solo a estos).
// 'button' = quick-reply de una plantilla; 'interactive' = button_reply/list_reply.
// Ambos son respuestas REALES del cliente y crean fila en `messages` igual que un texto.
const CREATES_MESSAGE_TYPES = ['text', 'location', 'contacts', 'button', 'interactive', ...MEDIA_TYPES];

// Normaliza a { texto, payload } la respuesta del cliente a un botón, venga como
// quick-reply de plantilla ('button') o como mensaje interactivo ('interactive').
// Devuelve null si el payload de Meta no trae nada usable.
function parseBotonRespuesta(msg) {
  if (msg.type === 'button' && msg.button) {
    const texto = msg.button.text || msg.button.payload;
    if (!texto) return null;
    return { texto: String(texto), payload: msg.button.payload || null };
  }
  if (msg.type === 'interactive' && msg.interactive) {
    const it = msg.interactive;
    const r = it.button_reply || it.list_reply;
    if (!r) return null;
    const texto = r.title || r.id;
    if (!texto) return null;
    const desc = it.list_reply && it.list_reply.description ? ` — ${it.list_reply.description}` : '';
    return { texto: String(texto) + desc, payload: r.id || null };
  }
  return null;
}

// Vid.a V3 — resolver el negocio dueño de un webhook de WhatsApp por su
// phone_number_id (registrado en el control plane como canal). Si el número no está
// registrado pero coincide con el PHONE_NUMBER_ID de .env, es la empresa #1 legacy
// (retrocompatibilidad: Leons Group sigue usando variables de entorno, no canales
// cifrados). Cualquier otro número → null (Meta recibe 200 igual, no se procesa nada).
function resolveEmpresaForWebhook(phoneNumberId) {
  if (!phoneNumberId) return null;
  try {
    const platform = require('../db/platform');
    const emp = platform.getEmpresaByCanalId(String(phoneNumberId));
    if (emp) return emp;
    if (String(process.env.PHONE_NUMBER_ID || '') === String(phoneNumberId)) {
      return platform.getEmpresaById(adapter.DEFAULT_EMPRESA_ID);
    }
  } catch (e) {
    console.error('[Webhook] error resolviendo empresa por canal:', e.message);
    // Control plane caído → solo aceptar el número legacy de .env
    if (String(process.env.PHONE_NUMBER_ID || '') === String(phoneNumberId)) {
      return { id: adapter.DEFAULT_EMPRESA_ID, db_path: adapter.DEFAULT_DB_PATH, nombre: 'SP Leons Group' };
    }
  }
  return null;
}

// Espejo de resolveEmpresaForWebhook, pero para eventos de PLANTILLA (message_template_
// status_update / quality_update / template_category_update): esos NO traen
// value.metadata.phone_number_id — el dueño se identifica por entry.id, que es el
// WABA_ID, no el phone_number_id. Sin esta función esos webhooks se descartaban en la
// resolución de arriba (phoneNumberId quedaba undefined) y el CRM nunca se enteraba de
// una aprobación o rechazo de plantilla.
function resolveEmpresaForWaba(wabaId) {
  if (!wabaId) return null;
  try {
    const platform = require('../db/platform');
    const emp = platform.getEmpresaByWabaId(wabaId);
    if (emp) return emp;
  } catch (e) {
    console.error('[Webhook] error resolviendo empresa por WABA_ID:', e.message);
    if (String(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '') === String(wabaId)) {
      return { id: adapter.DEFAULT_EMPRESA_ID, db_path: adapter.DEFAULT_DB_PATH, nombre: 'SP Leons Group' };
    }
  }
  return null;
}

// Palabras de baja reconocidas — se comparan contra el mensaje COMPLETO (no como
// substring) para no confundir "quiero cancelar la cita" con una orden real de baja.
const OPTOUT_KEYWORDS = ['stop', 'baja', 'no molestar', 'no molestes', 'no molestes mas', 'unsubscribe', 'detener'];
function isOptoutMessage(body) {
  const t = String(body || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return OPTOUT_KEYWORDS.includes(t);
}

// Cuando el cliente responde, la ventana de 24h se reabre: se envían los mensajes que
// quedaron encolados por sendMessageSmart mientras estaba cerrada.
async function flushPendingOutbound(phone, entryCtx) {
  // Vid.a V3: fire-and-forget fuera del run del entry — re-entrar al tenant del negocio.
  const run = async () => {
    const pending = store.getPendingOutbound(phone);
    if (!pending.length) return;
    store.clearPendingOutbound(phone);
    for (const p of pending) {
      try {
        const result = await sendMessage(phone, p.body);
        const wamid = result && result.messages && result.messages[0] && result.messages[0].id;
        if (p.lead_id) store.saveMessage(p.lead_id, 'panel', phone, p.body, 'outgoing', null, null, wamid || null, 'sent');
        console.log(`[Webhook] Mensaje encolado enviado a ${phone} tras reapertura de ventana`);
      } catch (e) {
        console.error('[Webhook] Error al enviar mensaje encolado:', e.message);
      }
    }
  };
  if (entryCtx) return adapter.tenantContext.run(entryCtx, run);
  return run();
}

// CSAT (F3.2): si el lead esperaba la encuesta y responde 1-5, registra el evento
// en el timeline (reports.js lo lee) y deja de rutear como mensaje normal.
// Devuelve true si el mensaje fue consumido como respuesta de CSAT.
function tryCaptureCsat(fromPhone, text) {
  try {
    const lead = store.getLeadByCustomerPhone(fromPhone);
    if (!lead || !lead.awaiting_csat) return false;
    store.setAwaitingCsat(lead.id, 0); // en cualquier caso deja de esperar
    const m = String(text || '').trim().match(/^[1-5]$/);
    if (!m) return false; // no era 1-5 → seguir como mensaje normal
    const score = Number(m[0]);
    const conv = store.getOrCreateConversationForLead(lead.id);
    if (conv) store.addTimelineEvent(conv.id, 'csat', { metadata: { score } });
    sendMessage(fromPhone, '¡Gracias por tu calificación! 🙏 En Leons Group siempre buscamos mejorar.').catch(() => {});
    console.log(`[CSAT] Lead ${lead.id} calificó con ${score}`);
    return true;
  } catch (e) { console.error('[CSAT] capture:', e.message); return false; }
}

// Auto-calificación de temperatura (F3.2): una sola vez, cuando ya hay contexto.
// Fire-and-forget; degrada limpio sin API key de IA.
function autoScoreLead(fromPhone, entryCtx) {
  try {
    const nlp = require('../services/nlp');
    if (!nlp.isAIEnabled()) return;
    const lead = store.getLeadByCustomerPhone(fromPhone);
    if (!lead || lead.temperatura_at) return; // ya calificado antes
    const msgs = store.getMessagesByLead(lead.id) || [];
    if (msgs.filter(m => m.direction === 'incoming').length < 2) return; // esperar contexto
    const history = msgs.map(m => ({ role: m.direction === 'incoming' ? 'customer' : 'seller', text: m.body }));
    nlp.analyzeLead(history, lead.nombre, lead.etiqueta).then(a => {
      const p = Number(a && a.closeProbability) || 0;
      // El .then corre fuera del run del entry — re-entrar al tenant del negocio.
      const save = () => store.setLeadTemperatura(lead.id, p >= 66 ? 'caliente' : p >= 33 ? 'tibio' : 'frio');
      if (entryCtx) adapter.tenantContext.run(entryCtx, save); else save();
    }).catch(e => console.error('[AUTOSCORE]', e.message));
  } catch (e) { console.error('[AUTOSCORE]', e.message); }
}

function handleMessage(req, res) {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (!body || body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      if (!entry || !Array.isArray(entry.changes)) continue;

      // Los eventos de ciclo de vida de plantilla (aprobación/rechazo/calidad/categoría)
      // no traen value.metadata — se resuelven por entry.id (el WABA_ID) ANTES de la
      // resolución por phone_number_id de abajo, o el entry se descartaría entero sin
      // que el CRM se enterara nunca de una aprobación.
      const CAMPOS_PLANTILLA = ['message_template_status_update', 'message_template_quality_update', 'template_category_update'];
      const cambiosTpl = (entry.changes || []).filter(c => c && CAMPOS_PLANTILLA.includes(c.field));
      if (cambiosTpl.length) {
        const empTpl = resolveEmpresaForWaba(entry.id);
        if (empTpl) {
          const ctxTpl = { empresaId: empTpl.id, dbPath: empTpl.db_path };
          adapter.tenantContext.run(ctxTpl, () => {
            try { require('../services/wa-templates').handleTemplateWebhook(cambiosTpl, ctxTpl); }
            catch (e) { console.error('[Webhook] handleTemplateWebhook:', e.message); }
          });
        } else {
          console.log(`[Webhook] WABA_ID ${entry.id} no registrado — evento de plantilla ignorado (200 ya respondido a Meta)`);
        }
        if (cambiosTpl.length === (entry.changes || []).length) continue; // el entry era solo de plantillas
      }

      // Vid.a V3 — cada entry de Meta pertenece a UNA WABA concreta: su metadata lleva
      // phone_number_id, que resuelve al negocio dueño (control plane, fallback .env
      // para empresa #1). Todo el procesamiento del entry corre en el tenant de ESE negocio.
      const firstValue = (entry.changes || []).find(c => c && c.value && c.value.metadata);
      const phoneNumberId = firstValue && firstValue.value.metadata.phone_number_id;
      const empresa = resolveEmpresaForWebhook(phoneNumberId);
      if (!empresa) {
        console.log(`[Webhook] phone_number_id ${phoneNumberId || '(sin metadata)'} no registrado — entrada ignorada (200 ya respondido a Meta)`);
        continue;
      }
      const entryCtx = { empresaId: empresa.id, dbPath: empresa.db_path };
      adapter.tenantContext.run(entryCtx, () => processEntry(entry, entryCtx));
    }
  } catch (error) {
    console.error('Error en handleMessage:', error.message);
  }
}

// Procesa un entry (mensajes + statuses) dentro del contexto del tenant ya resuelto.
// Los fire-and-forget async (flushPendingOutbound, media, autoscore, callbacks) reciben
// el ctx y se re-envuelven adentro — sin esto, sus store calls caerían a empresa #1.
function processEntry(entry, entryCtx) {
  const re = (fn) => { try { return adapter.tenantContext.run(entryCtx, fn); } catch (e) { return fn(); } };

  for (const change of entry.changes || []) {
    if (!change || change.field !== 'messages') continue;

    const value = change.value;
    if (!value) continue;

    const messages = value.messages || [];
    const contacts = value.contacts || [];

    for (const msg of messages) {
      if (!msg) continue;
      const fromPhone = msg.from;
      if (!fromPhone) continue;

      try { store.bumpUsage('mensajes_recibidos'); } catch (e) {}
      flushPendingOutbound(fromPhone, entryCtx).catch(e => console.error('[Webhook] flushPendingOutbound:', e.message));

      // Meta reintenta webhooks si el 200 tarda o hay errores de red: si ya guardamos
      // este wamid, es un reintento del mismo mensaje — se ignora para no duplicar.
      if (msg.id && CREATES_MESSAGE_TYPES.includes(msg.type) && store.getMessageByWamid(msg.id)) {
        console.log(`[Webhook] Mensaje duplicado ignorado (wamid ya procesado): ${msg.id}`);
        continue;
      }

      const contact = contacts.find(c => c && c.wa_id === fromPhone);
      const customerName = (contact?.profile?.name) || 'Cliente';

      // --- Mensajes de TEXTO ---
      if (msg.type === 'text') {
        const messageBody = msg.text && msg.text.body;
        if (!messageBody) continue;

        // Baja explícita: se registra y NO se enruta como conversación normal —
        // es una orden al sistema, no un mensaje de venta.
        if (isOptoutMessage(messageBody)) {
          store.addOptout(fromPhone, 'whatsapp', messageBody);
          console.log(`[Webhook] Opt-out registrado: ${fromPhone} ("${messageBody}")`);
          sendMessage(fromPhone, 'Listo, no volverás a recibir mensajes promocionales de nuestra parte. Si necesitas algo, escríbenos cuando quieras.')
            .catch(e => console.error('Error confirmando opt-out:', e.message));
          continue;
        }

        // CSAT (F3.2): si es la respuesta a la encuesta de satisfacción, se consume aquí.
        if (tryCaptureCsat(fromPhone, messageBody)) continue;

        // F-zonas: el referral se pasa DENTRO de routeReply (no después) para que la
        // zona del anuncio se resuelva antes de elegir asesor — antes esto corría
        // después de asignar, así que el lead ya había caído en el asesor equivocado
        // para cuando se sabía de qué anuncio/zona venía (ver services/zonas.js).
        routeReply(fromPhone, messageBody, customerName, msg.id || null, msg.referral || null, (err, result) => re(() => {
          if (err) { console.error('Error routing message:', err.message); return; }
          if (result.forwarded) console.log(`Mensaje reenviado a ${result.to}`);
          if (result.message === 'no_hay_vendedores') {
            sendMessage(fromPhone,
              '👋 Gracias por contactar a Leons Group. ' +
              'Todos nuestros asesores están ocupados en este momento. ' +
              'Te responderemos lo antes posible. ¡Gracias por tu paciencia!'
            ).catch(e => console.error('Error enviando mensaje de espera:', e.message));
          }
        }));

        // Para un lead RECIÉN creado, routeReply/assigner.js ya guardó esta misma
        // atribución antes de asignar (con la zona resuelta a tiempo). Este bloque queda
        // como red de seguridad para el caso de un lead YA EXISTENTE que recibe un
        // referral por primera vez (p.ej. un cliente que vuelve a escribir desde un
        // anuncio distinto) — los guards de abajo hacen que sea no-op si ya se guardó.
        if (msg.referral) {
          try {
            const origen = msg.referral.headline || msg.referral.body || msg.referral.source_url || null;
            const lead = store.getLeadByCustomerPhone(fromPhone);
            if (lead) {
              if (origen && !lead.origen) store.setLeadOrigen(lead.id, origen);
              // F1: además del texto libre de arriba, guarda los IDs estructurados que
              // Meta manda en referral — es lo que permite a reportes agrupar por
              // anuncio/campaña real (source_id) en vez de por un headline repetible.
              // Solo la primera vez (guard dentro de setLeadAdAttribution vía !lead.ad_id
              // se hace aquí para no pisar la atribución original de un lead reabierto).
              if (!lead.ad_id) {
                store.setLeadAdAttribution(lead.id, {
                  adId: msg.referral.source_id,
                  adName: msg.referral.headline,
                  sourceUrl: msg.referral.source_url,
                  ctwaClid: msg.referral.ctwa_clid,
                });
              }
            }
          } catch (e) { console.error('Error guardando origen de referral:', e.message); }
        }
        // El cliente respondió → detener la cadencia de seguimiento (F3.3).
        try { const lcc = store.getLeadByCustomerPhone(fromPhone); if (lcc && lcc.cadencia_activa) store.stopCadencia(lcc.id); } catch (e) {}
        autoScoreLead(fromPhone, entryCtx); // F3.2: califica la temperatura una sola vez cuando hay contexto
        continue;
      }

      // --- El cliente PULSÓ UN BOTÓN (quick-reply de plantilla o mensaje interactivo) ---
      // Antes estos dos tipos caían fuera de todos los handlers y se descartaban en
      // silencio: el cliente tocaba "Sigo interesado" y ni el asesor ni el admin se
      // enteraban, pese a que la ventana de 24h sí quedaba abierta del lado de Meta.
      // Se normalizan a texto y se rutean como un mensaje normal, así heredan dedup,
      // asignación, SSE, push y disparo de automatizaciones.
      if (msg.type === 'button' || msg.type === 'interactive') {
        const btn = parseBotonRespuesta(msg);
        if (!btn) {
          console.log(`[Webhook] Mensaje ${msg.type} de ${fromPhone} sin contenido reconocible — ignorado`);
          continue;
        }
        if (isOptoutMessage(btn.texto)) {
          store.addOptout(fromPhone, 'whatsapp', btn.texto);
          console.log(`[Webhook] Opt-out registrado desde botón: ${fromPhone} ("${btn.texto}")`);
          sendMessage(fromPhone, 'Listo, no volverás a recibir mensajes promocionales de nuestra parte. Si necesitas algo, escríbenos cuando quieras.')
            .catch(e => console.error('Error confirmando opt-out:', e.message));
          continue;
        }
        if (tryCaptureCsat(fromPhone, btn.texto)) continue;

        console.log(`[Webhook] ${fromPhone} pulsó el botón "${btn.texto}"${btn.payload ? ` (payload: ${btn.payload})` : ''}`);
        routeReply(fromPhone, btn.texto, customerName, msg.id || null, msg.referral || null, (err, result) => re(() => {
          if (err) { console.error('Error routing button reply:', err.message); return; }
          if (result && result.forwarded) console.log(`Respuesta de botón reenviada a ${result.to}`);
          // El payload se anota DESPUÉS porque el mensaje lo crea routeReply.
          if (msg.id && btn.payload) {
            try { store.setMessageButtonPayload(msg.id, btn.payload); } catch (e) { console.error('[Webhook] setMessageButtonPayload:', e.message); }
          }
        }));
        // Pulsar un botón es responder: corta la cadencia y cuenta para la calificación.
        try { const lcb = store.getLeadByCustomerPhone(fromPhone); if (lcb && lcb.cadencia_activa) store.stopCadencia(lcb.id); } catch (e) {}
        autoScoreLead(fromPhone, entryCtx);
        continue;
      }

      // --- Ubicación entrante ---
      if (msg.type === 'location') {
        const loc = msg.location;
        if (!loc) continue;
        routeIncomingLocation(fromPhone, customerName, { latitude: loc.latitude, longitude: loc.longitude, name: loc.name || '', address: loc.address || '' }, msg.id || null, msg.referral || null, (err, result) => re(() => {
          if (err) { console.error('Error routing location:', err.message); return; }
          if (result && result.forwarded) console.log(`Ubicación reenviada a ${result.to}`);
        }));
        continue;
      }

      // --- Tarjetas de CONTACTO compartidas por el cliente ---
      // Antes caían fuera de todos los handlers y se perdían en silencio; se guardan
      // como texto legible para que el vendedor vea el dato en el chat.
      if (msg.type === 'contacts' && Array.isArray(msg.contacts) && msg.contacts.length) {
        const tarjetas = msg.contacts.map(c => {
          const nombre = (c.name && (c.name.formatted_name || [c.name.first_name, c.name.last_name].filter(Boolean).join(' '))) || 'Sin nombre';
          const tels = Array.isArray(c.phones) ? c.phones.map(p => p.phone || p.wa_id).filter(Boolean).join(', ') : '';
          return `📇 Contacto: ${nombre}${tels ? ' — ' + tels : ''}`;
        }).join('\n');
        routeReply(fromPhone, tarjetas, customerName, msg.id || null, (err, result) => re(() => {
          if (err) { console.error('Error routing contact card:', err.message); return; }
          if (result && result.forwarded) console.log(`Tarjeta de contacto reenviada a ${result.to}`);
        }));
        continue;
      }

      // --- Mensajes MULTIMEDIA ---
      if (MEDIA_TYPES.includes(msg.type)) {
        handleMediaMessage(msg, fromPhone, customerName, entryCtx)
          .catch(e => console.error('Error procesando media entrante:', e.message));
        continue;
      }

      // --- REACCIÓN del cliente a un mensaje ---
      if (msg.type === 'reaction' && msg.reaction && msg.reaction.message_id) {
        const target = store.getMessageByWamid(msg.reaction.message_id);
        if (target) {
          const emoji = msg.reaction.emoji || '';
          if (emoji) store.addReaction(target.id, emoji, fromPhone, 'incoming');
          else {
            // Sin emoji = el cliente quitó su reacción
            for (const r of store.getReactionsForMessage(target.id)) {
              if (r.sender_number === fromPhone) store.removeReaction(target.id, r.emoji, fromPhone);
            }
          }
          const lead = store.getLeadById(target.lead_id);
          if (lead) {
            events.emitToVendedor(lead.assigned_to_id, 'reaccion', { leadId: lead.id, messageId: target.id, emoji, ts: Date.now() });
            events.emitToAdmins('reaccion', { leadId: lead.id, messageId: target.id, emoji, ts: Date.now() });
          }
          console.log(`[Webhook] Reacción de ${fromPhone}: ${emoji || '(quitada)'} → msg ${target.id}`);
        }
        continue;
      }

      // --- El cliente ELIMINÓ un mensaje para todos (anti-delete: se conserva el texto) ---
      if (msg.type === 'revoke' && msg.revoke && msg.revoke.original_message_id) {
        const revoked = store.markDeletedByClientWamid(msg.revoke.original_message_id);
        if (revoked) {
          const lead = store.getLeadById(revoked.lead_id);
          if (lead) {
            events.emitToVendedor(lead.assigned_to_id, 'mensaje_eliminado', { leadId: lead.id, messageId: revoked.id, byClient: true, ts: Date.now() });
            events.emitToAdmins('mensaje_eliminado', { leadId: lead.id, messageId: revoked.id, byClient: true, ts: Date.now() });
          }
          console.log(`[Webhook] Cliente ${fromPhone} eliminó mensaje ${revoked.id} (texto conservado)`);
        }
        continue;
      }
    }

    const statuses = value.statuses || [];
    for (const st of statuses) {
      if (!st || !st.id || !st.status) continue;
      console.log(`[Webhook] Status update: ${st.id} → ${st.status}`);
      const wasRead = st.status === 'read';
      const isFailed = st.status === 'failed';
      store.updateMessageStatus(st.id, st.status);

      // Un status 'failed' trae el motivo en errors[] (número no en WhatsApp, ventana
      // cerrada, plantilla rechazada, etc.). Antes se descartaba: el vendedor creía que
      // el mensaje se envió y nadie se enteraba de por qué no llegó.
      let errDetail = null;
      if (isFailed && Array.isArray(st.errors) && st.errors[0]) {
        const e0 = st.errors[0];
        errDetail = `[${e0.code || '?'}] ${e0.title || e0.message || 'Error desconocido'}`;
        store.setMessageError(st.id, errDetail);
        console.error(`[Webhook] Mensaje ${st.id} FALLÓ: ${errDetail}`);
      }

      // Notificar al panel para actualizar el checkmark en vivo
      const m = store.getMessageByWamid(st.id);
      if (m) {
        const lead = store.getLeadById(m.lead_id);
        if (lead) {
          events.emitToVendedor(lead.assigned_to_id, 'status_update', { leadId: lead.id, messageId: m.id, status: st.status, error: errDetail, ts: Date.now() });
          events.emitToAdmins('status_update', { leadId: lead.id, messageId: m.id, status: st.status, error: errDetail, ts: Date.now() });
          if (isFailed) {
            events.emitToVendedor(lead.assigned_to_id, 'sistema_alerta', { tipo: 'mensaje_fallido', leadId: lead.id, messageId: m.id, mensaje: `No se pudo entregar un mensaje a ${lead.customer_name || lead.customer_phone}: ${errDetail}`, ts: Date.now() });
            // El SSE solo llega si el panel está abierto: un mensaje que no se entregó
            // tiene que alcanzar al asesor aunque tenga la app cerrada.
            try {
              require('../services/notify').notify({
                vendedorId: lead.assigned_to_id, tipo: 'mensaje_fallido', leadId: lead.id, push: true,
                titulo: '⚠️ Mensaje no entregado',
                cuerpo: `${lead.customer_name || lead.customer_phone}: ${errDetail || 'Meta rechazó el envío'}`.slice(0, 120),
              }).catch(e => console.error('Error notify mensaje_fallido:', e.message));
            } catch (e) { /* notify opcional */ }
          }
          if (wasRead && m.direction === 'outgoing') {
            try { require('../services/progress').evaluateRead(lead.id).catch(()=>{}); } catch(e){}
          }
        }
      }

      // Conciliación con el dashboard de campañas: si este wamid pertenece a un
      // envío masivo, su estado (sent/delivered/read/failed) se refleja ahí también.
      const camp = store.getCampaignRecipientByWamid(st.id);
      if (camp) {
        store.updateCampaignRecipient(camp.id, { estado: st.status, errorDetail: errDetail || undefined });
        store.recalcCampaignStats(camp.campaign_id);
      }
    }
  }
}

async function handleMediaMessage(msg, fromPhone, customerName, entryCtx) {
  const type = msg.type;            // image|audio|video|document|sticker
  const mediaObj = msg[type] || {};
  const mediaId = mediaObj.id;
  if (!mediaId) return;

  // Vid.a V3: el proceso completo (descarga, guardado, ruteo, transcripción) re-entra
  // al tenant del negocio — downloadMedia/getMediaUrl ahora resuelven el token del canal
  // del negocio y saveMessageMedia guarda en la carpeta de media de ESE negocio.
  await adapter.tenantContext.run(entryCtx, async () => {
    // Descargar el binario desde WhatsApp y guardarlo en disco
    const { buffer, mime } = await downloadMedia(mediaId);
    const filename = saveMessageMedia(mediaId, buffer, mime, mediaObj.filename);

    const mediaData = {
      media_type: type,
      media_id: mediaId,
      media_mime: mime,
      media_filename: filename,
      caption: mediaObj.caption || '',
    };

    routeIncomingMedia(fromPhone, customerName, mediaData, msg.id || null, msg.referral || null, (err, result) => {
      // Re-entrar al tenant por si el callback se invoca con el contexto ya desmontado.
      adapter.tenantContext.run(entryCtx, () => {
        if (err) { console.error('Error routing media:', err.message); return; }
        if (result && result.forwarded) console.log(`Media (${type}) avisado a ${result.to}`);
        // Transcripción IA de notas de voz (async, no bloquea el webhook; no-op sin proveedor)
        if (type === 'audio') {
          try {
            require('../services/transcribe').enqueue({ wamid: msg.id, filename, mime });
          } catch (e) { console.error('Error encolando transcripción:', e.message); }
        }
      });
    });
  });
}

// parseBotonRespuesta se exporta para poder testear el parseo de los payloads de Meta
// sin levantar el webhook entero.
module.exports = { handleMessage, parseBotonRespuesta };
