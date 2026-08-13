# Auditoría exhaustiva — CRM SP Leons Group
**Fecha:** 2026-08-10 · **Alcance:** lectura de código + esquema real de `data/sp-leads.db`. Ningún archivo de producción fue modificado para producir este informe.

---

## ⚠️ ADDENDUM (2026-08-13) — bug real reportado por el jefe + limpieza de esquema legacy

El jefe (rol `jefe`) reportó chat siempre vacío en Supervisión y no poder ver los chats de los asesores.
Diagnóstico: **tres bugs concretos**, no un problema de "sincronización" — ver detalle y fix en cada uno:

- `abSuperChat()` en `public/m/app.js` trataba la respuesta de `/api/leads/:id/mensajes` (un objeto
  `{lead, mensajes, ...}`) como si fuera un array — `msgs.length` era siempre `undefined`, así que el
  chat se pintaba vacío el 100% de las veces. **Corregido**, bifurcando por `_type` igual que ya hacía
  correctamente `public/supervisor/conversaciones.html`.
- El id usado para pedir mensajes (`conv.lead_id || conv.id`) podía apuntar al lead equivocado cuando la
  conversación no tenía `lead_id` — exactamente la clase de bug que describe 2.4 más abajo. **Corregido**
  desambiguando por `_type` antes de pedir nada.
- Varios endpoints comprobaban `rol === 'admin'` a pelo en vez del helper `esAccesoGlobal` (admin ∪
  supervisor ∪ jefe), devolviendo 403 a jefe/supervisor. **Corregido**, moviendo `esAccesoGlobal` a
  `src/services/auth.js` como fuente única y reemplazando los chequeos sueltos.

**Esquema legacy — Etapas 0 y 2 del plan de retiro completadas** (ver 2.4 y 1.7 para el diagnóstico
original):
- `conversations.lead_id` ahora está en el `CREATE TABLE` de `src/db/schema.js` con
  `UNIQUE INDEX ... WHERE lead_id IS NOT NULL` — una conversación duplicada para el mismo lead ya no
  puede insertarse, sin importar qué falle arriba.
- El backfill de arranque (`[INBOX-BACKFILL]`, replicaba hasta 500 mensajes por lead huérfano en cada
  reinicio) quedó apagado por defecto detrás de `INBOX_BACKFILL=1`; el arranque ahora solo *reporta*
  huérfanos (`[LEGACY-CHECK]`) sin mutar la BD.
- `getOrCreateConversationForLead()` quedó envuelto en una transacción (`BEGIN`/`COMMIT`/`ROLLBACK`): o
  se crea la conversación completa con todo su backfill, o no se crea nada — antes un fallo a mitad de
  camino dejaba una conversación a medias, indistinguible de una nueva.
- `syncLeadToConversation()` ahora relanza el error en desarrollo (`NODE_ENV !== 'production'`) en vez de
  tragarlo siempre; en producción se sigue registrando en `data/errors.log` y en `/api/admin/salud`.
- Scripts redundantes o peligrosos eliminados: `src/db/migrate.js`, `scripts/migrate-legacy-to-os.js`,
  `src/scripts/migrate-legacy-to-multichannel.js` (las tres migraciones legacy→multicanal, ninguna
  rellenaba `lead_id`), `scripts/limpiar.js` (SQL interpolado, sin backup), `scripts/reset-datos.js`
  (redundante con `reset-leads.js`), `scripts/reopen-lead.js` (caso puntual ya resuelto) y
  `scripts/migrar-horario.js` (confirmado en el addendum de 2026-08-11 que nunca corrió en producción;
  aplicarlo hoy habría corrompido datos).
- Nuevo `scripts/escanear-bd.js`, de solo lectura: reporta duplicados por teléfono, leads sin
  conversación, conversaciones con `lead_id` NULL o duplicado, conversaciones huérfanas, mensajes en
  `messages` sin espejo en `timeline`, y columnas de tiempo sin sufijo `Z`.

**Pendiente, deliberadamente fuera de esta tanda** (Etapas 3–5 del diseño completo): hacer de `timeline`
la única escritura de mensajes (retirar `syncLeadToConversation` y la tabla `messages`), y colapsar
`getUnifiedConversations()`/el marcador `_type`. Tocan el camino crítico de WhatsApp y el panel móvil (0
tests dedicados todavía), así que conviene abordarlas en una tanda propia con tests de contrato previos.
Tampoco se tocó `parseDbTimeUTC()` ni se normalizaron timestamps — sigue siendo un frente aparte, ver 1.7.

---

## ⚠️ ADDENDUM (2026-08-11) — corrección verificada contra la VM real, leer antes de tocar 1.1/1.7

Este informe se escribió leyendo la copia **local** de `data/sp-leads.db` (la del portátil), sin acceso todavía
a la VM de producción. El **2026-08-11** conseguí acceso SSH real a `sp-crm-server` y verifiqué los hechos
directamente contra la base en vivo. Hay una corrección importante a la sección 1.1:

**La migración `+5h` en dirección contraria (`migrar-horario.js`) NUNCA corrió contra producción.**
Verificado: `SELECT * FROM config` en la BD real de la VM tiene 18 filas y **ninguna es
`migracion_horario_utc5`** — esa marca solo existe en la copia local. Producción nunca sufrió el
doble-corrimiento (+10h) descrito en 1.1. **No apliques la "corrección dirigida por corte de fecha
(-5h/-10h)" de 1.1 contra producción tal como está escrita — partía de una premisa falsa y corrompería
datos que hoy están bien.**

Lo que sí es real en producción (diagnosticado y ya corregido para `leads`, ver detalle abajo): el bug
"DEFAULT congelado en UTC vs. cuándo se agregó el INSERT explícito con `datetime('now','localtime')`"
— un desfase simple de **+5h** (no +10h), y el corte no es una fecha única para todas las tablas: cada
columna tiene su propio momento de fix (verifiqué que `messages.timestamp` y `leads.created_at` se
arreglaron en commits distintos, con varias horas de diferencia entre sí). No hay atajo: hay que medir
cada tabla por separado comparando contra un ancla confiable (ver método abajo), no asumir un único
`WHERE created_at < 'X'` global.

**Ya corregido en producción, con backup previo verificado (`sp-leads-PRE-fix-horario-20260811-220857.db`
en `~/backup-fix-horario/` en la VM):** `leads.created_at` para los ids 1–17 (los únicos con el bug —
confirmado comparando contra el primer mensaje real de cada lead, que sirvió de ancla). Verificación
posterior: los 29 leads alinean con diferencia 0.0h contra su primer mensaje. `leads.updated_at` no se
tocó — se reescribe en cada UPDATE por rutas que ya usan `'localtime'` explícito, así que no tiene este
bug. `messages.timestamp` tampoco se tocó — la evidencia sobre su corte exacto fue contradictoria entre
el historial de git y el patrón real de los datos, así que se dejó intacta hasta tener certeza (ver
sección "Pendiente" abajo).

**Riesgo nuevo detectado en el trabajo de unificación (1.7) que ya está en curso:** el nuevo
`parseDbTimeUTC()` en `src/utils/tiempo.js` asume "sin sufijo `Z` → es UTC". Esa regla es correcta para
las ~34 tablas que siguen en el DEFAULT congelado (`timeline`, `citas`, `notificaciones`, `tareas`,
`conversations`, `feed_events`, etc.) pero **incorrecta** para `messages.timestamp`, `leads.created_at`/
`updated_at`/`last_customer_message_at` y `team_messages.created_at` — esas columnas ya guardan hora
Bogotá correcta sin `Z` desde antes (vía INSERT/UPDATE explícito con `'localtime'`). Si `parseDbTimeUTC`/
`formatBogota` se conectan al frontend sin distinguir estas dos familias de columnas, los mensajes del
chat (el síntoma original reportado) van a mostrarse **5 horas antes** de lo real — el mismo tipo de bug,
en dirección contraria. **Antes de wire-up al frontend:** o bien (a) migrar también estas columnas al
nuevo formato UTC+`Z` como parte del mismo cambio (reescribiendo su historial, con backup), o (b) hacer
que `parseDbTimeUTC` distinga explícitamente estas columnas como "ya UTC-5, no reinterpretar".

**Pendiente de resolver con más certeza:** el corte exacto de `messages.timestamp` (cuándo pasó de usar
el DEFAULT viejo a la escritura explícita correcta). El historial de git sugiere una fecha, el patrón
horario real de los mensajes sugiere otra — no hay ancla independiente (WhatsApp no expone su timestamp
crudo en el webhook actual, `msg.timestamp` nunca se lee, y los logs de Docker no alcanzan tan atrás).
Antes de tocar esta tabla, confirmar con un asesor 2-3 horas reales de mensajes viejos concretos
(anteriores al 8 de agosto), o aceptar dejar esas ~130 filas antiguas sin corregir dado el bajo volumen.

---

## 0. Resumen ejecutivo

Reportaste dos síntomas: **la hora no es la real** (un mensaje de las 3 p.m. aparece a las 12 a.m.) y **los chats no siempre se sincronizan**. Ambos están diagnosticados con evidencia concreta. En orden de lo que conviene atacar primero:

1. **[1.1] Un script de migración corrigió la hora en la dirección contraria** y ya corrió en producción (2026-08-07). Es la causa directa de tu síntoma — explica el desfase de ~10h, no de 5h. **Esto es lo primero que hay que resolver**, y antes de tocar nada más hay que *medir* qué tan contaminados quedaron los datos (sección 1, script de diagnóstico incluido).
2. **[1.2]** Conviven **tres convenciones de zona horaria** en la misma base de datos según qué parte del código escribió el dato. Mientras no se unifique, cualquier arreglo puntual va a seguir generando estos desfases en otro lugar.
3. **[1.3]/[1.4]** Por eso mismo, el inbox de admin y el panel del vendedor **muestran horas distintas** para el mismo mensaje, y en el chat **los mensajes se pueden pintar fuera de orden**.
4. **[2.1]/[2.2]** Los chats "no sincronizan" porque el navegador no refresca al volver de segundo plano y la reconexión en tiempo real **no recupera lo que se perdió** mientras estuvo caída.
5. **[3.1]** El proceso del servidor **no se reinicia solo ante un error no controlado** — puede quedar semi-vivo sirviendo mal en vez de que Docker lo reinicie.

Todo lo demás (secciones 3–6) es una auditoría completa de robustez, escala, seguridad y producto para planear el resto del año, no bloqueante para lo urgente.

---

## 1. El problema de la hora

### 1.1 — 🔴 CRÍTICO — `migrar-horario.js` corrigió la hora en la dirección contraria

**Evidencia:** [`scripts/migrar-horario.js:147-158`](../scripts/migrar-horario.js#L147-L158)

```js
const sql =
  "UPDATE \"" + table + "\" SET \"" + column + "\" = datetime(\"" + column + "\", '+5 hours') WHERE ..."
```

Este script se ejecutó contra la base de producción y quedó registrado como completado:

```
config.migracion_horario_utc5 = "2026-08-07 00:14:04"
```

Es **idempotente** (revisa esa marca al arrancar y se niega a correr dos veces), así que no se repitió por error, pero tampoco puede revertirse solo — hay que deshacerla a mano.

**Por qué está mal:** Bogotá es **UTC−5**. Convertir de UTC a hora de Bogotá significa **restar** 5 horas, no sumarlas. El commit que introdujo este script (`4a3b3ff`) sí tenía el diagnóstico correcto en otro lado — el propio commit posterior `eea426c` lo confirma con un caso real ("25.25h calculadas vs 20.25h reales, diferencia de 5h exactas"). El script de migración, sin embargo, sumó en vez de restar.

**Impacto medido en tu caso:** un mensaje real de las 15:00 sigue esta cadena:

| Paso | Hora |
|---|---|
| Hora real del mensaje (Bogotá) | 15:00 |
| Guardado en la BD (columnas con DEFAULT UTC — ver 1.2) | 20:00 |
| Después de `migrar-horario.js` (+5h en la dirección incorrecta) | **01:00 del día siguiente** |
| Lo que ve el asesor en el panel | "12–1 a.m." para un mensaje de las 3 de la tarde |

Desfase total: **+10 horas**, no +5. Coincide exactamente con lo que describiste.

**Qué tablas y filas quedaron afectadas:** todas las filas con columnas `DATETIME` **anteriores** al 2026-08-07 00:14, en todas las tablas — el script no distinguió entre columnas que ya estaban en UTC (correctas de guardar tal cual) y las que estaban ya en hora local (que si acaso necesitaban –5h). Sumó +5h a ambos grupos por igual, salvo la lista corta de exclusiones (`sessions.created_at`, `notifications.created_at` como epoch, y fechas-sólo como `fecha_venta`).

**Antes de corregir nada, medir el daño real.** No se debe aplicar otra corrección a ciegas — sería el mismo error dos veces. Este script de solo lectura, corrido contra una **copia** de `data/sp-leads.db` (nunca contra producción directamente), da el desfase real fila por fila comparando contra `messages.timestamp` como referencia (esa columna se fija explícita en cada INSERT, ver 1.2):

```sql
-- Diagnóstico read-only: compara timeline.created_at (tabla espejo, UTC) contra
-- messages.timestamp (tabla legacy, ya corregida a hora local) para el mismo lead.
-- Una diferencia sistemática de +5h o +10h confirma qué filas de timeline
-- quedaron mal y por cuánto.
SELECT
  l.id AS lead_id,
  m.timestamp AS messages_ts,
  t.created_at AS timeline_ts,
  ROUND((julianday(t.created_at) - julianday(m.timestamp)) * 24, 2) AS diff_horas
FROM messages m
JOIN leads l ON l.id = m.lead_id
JOIN conversations c ON c.lead_id = l.id
JOIN timeline t ON t.conversation_id = c.id AND t.body = m.body
ORDER BY m.id DESC
LIMIT 200;
```

**Corrección recomendada (dos fases, no una):**
1. **Fase de medición** (script anterior + variantes por tabla) para saber exactamente qué filas y qué magnitud de error tiene cada una — puede no ser uniforme si hubo escrituras nuevas después del 2026-08-07 que ya usan `localtime` correctamente.
2. **Fase de corrección dirigida**, tabla por tabla y con corte por fecha (`WHERE created_at < '2026-08-07 00:14:04'`), no un `UPDATE` global — y con backup verificado antes de tocar nada (`deploy/backup.sh` ya hace checkpoint de WAL, ver sección 3).

---

### 1.2 — 🔴 CRÍTICO — Tres convenciones de tiempo conviven en la misma base de datos

| Origen | Convención | Evidencia |
|---|---|---|
| DEFAULT de columna en 37 tablas de la BD **real** de producción | `datetime('now')` → **UTC**, congelado | Confirmado leyendo el `sqlite_master` real: `vendedores`, `leads`, `messages`, `conversations`, `timeline`, `citas`, `tareas`, `notifications`, `feed_events` y 28 más tienen el DEFAULT viejo aunque el código fuente ya diga `'localtime'` |
| INSERT explícito en rutas parcheadas recientemente | `datetime('now','localtime')` → **Bogotá** | [`store.js:709`](../src/db/store.js#L709) (`saveMessage`), `saveLead`, `saveTeamMessage` |
| Lo que manda el frontend | `.toISOString()` → **UTC con sufijo Z** | `scheduled_messages.send_at` ([`index.js:2089`](../src/index.js#L2089)), `tareas.vence_at` |

**Por qué el DEFAULT quedó congelado:** `CREATE TABLE IF NOT EXISTS` en SQLite **nunca reescribe una tabla que ya existe** — solo la crea si falta. [`src/db/schema.js`](../src/db/schema.js) y [`src/db/store.js`](../src/db/store.js) ya tienen `'localtime'` en el código fuente desde el commit `4a3b3ff`, pero eso solo aplica a instalaciones **nuevas** desde cero. La base de producción real, creada antes de ese commit, sigue con el DEFAULT antiguo — verificado directamente contra el archivo:

```
vendedores, leads, usuarios, templates, lead_notes, wa_templates, push_subscriptions,
customers, customer_channels, conversations, timeline, workflows, workflow_logs,
message_reactions, vendedor_templates, propiedades, citas, tareas,
ubicaciones_guardadas, proyectos, lotes, lote_historial, pending_outbound, campaigns,
campaign_recipients, optout, scheduled_messages, team_messages, insignias,
campanas_sp_projects, team_reactions, team_presence, feed_events, feed_reactions,
sp_feed, galeria, messages
```

**Nota ya documentada correctamente en el código** (y confirmada aquí, no hace falta tocarla): `cadencia_inicio`/`cadencia_next_at` en `scheduler.js` es la única columna que usa `.toISOString()` consistentemente en ambos lados (INSERT y comparación SQL), así que ese caso puntual **no tiene bug** — está documentado en el comentario de `eea426c` para que nadie lo "corrija" mal después. Se menciona aquí para que la corrección de fondo (1.7) no lo toque por error.

**Consecuencia:** dos filas de la misma columna, insertadas por rutas de código distintas, pueden estar en zonas horarias distintas sin ninguna forma de saber cuál es cuál con solo mirar el dato — el texto `"2026-08-10 15:00:00"` es ambiguo: puede ser UTC o Bogotá dependiendo de qué endpoint la escribió.

---

### 1.3 — 🟠 ALTO — El inbox de admin y el panel móvil muestran horas distintas para el mismo mensaje

**Evidencia:**
- Panel móvil lee la tabla legacy `messages`, que fija `timestamp` explícito en Bogotá: [`store.js:709`](../src/db/store.js#L709).
- Inbox admin lee la tabla `timeline` (esquema multicanal nuevo), cuyo `created_at` **no se fija explícito** al insertar: [`store.js:2683-2687`](../src/db/store.js#L2683-L2687) deja que el DEFAULT de la columna decida — y ese DEFAULT sigue en UTC (ver 1.2).

**Impacto:** el mismo mensaje, mirado desde `/os/inbox.html` (admin) y desde `/m/index.html` (vendedor), difiere en 5 horas. Un admin y un vendedor discutiendo sobre "cuándo llegó este mensaje" van a ver relojes distintos.

**Corrección:** una vez unificada la convención (1.7), fijar `created_at` explícito en `addTimelineEvent` igual que ya se hace en `saveMessage` — no depender del DEFAULT de la columna en ningún INSERT nuevo, sea cual sea la tabla de producción real.

---

### 1.4 — 🟠 ALTO — Los mensajes del chat se pueden pintar fuera de orden

**Evidencia:** [`getMessagesByLead`, store.js:1494-1501](../src/db/store.js#L1494-L1501)

```sql
ORDER BY m.timestamp DESC, m.id DESC
LIMIT ?
```

**Por qué falla:** con timestamps de zonas mezcladas conviviendo en la misma columna (1.2), dos mensajes consecutivos en el tiempo real pueden tener valores de `timestamp` que no respetan ese orden — uno guardado en UTC "salta" 5h hacia adelante respecto a uno guardado en hora local. El `ORDER BY timestamp` los intercala mal. Con la paginación de 100 mensajes (`LIMIT`), en el peor caso un mensaje corrupto puede incluso **desplazar mensajes recientes fuera de la primera página**, hasta que el asesor haga scroll hacia atrás para encontrarlos.

**Corrección recomendada:** ordenar por `id` (autoincremental, monotónico por construcción — inmune a cualquier problema de zona horaria) en vez de por `timestamp`:

```sql
ORDER BY m.id DESC
```

`id` refleja el orden real de inserción sin depender de ningún reloj. El campo `timestamp` sigue sirviendo para *mostrar* la hora, solo no para *ordenar*. Aplica el mismo razonamiento a cualquier otro `ORDER BY … timestamp/created_at` que compare filas de tablas con el problema de 1.2 (revisar `store.js:804` y similares).

---

### 1.5 — 🟡 MEDIO — Los mensajes programados se muestran 5h adelantados en el móvil

**Evidencia:** el backend normaliza correctamente al guardar — [`index.js:2087-2089`](../src/index.js#L2087-L2089):

```js
const fecha = new Date(sendAt);
...
const sendAtSQL = fecha.toISOString().slice(0, 19).replace('T', ' ');
```

Esto guarda **UTC sin sufijo**. Pero el móvil lo renderiza asumiendo hora local — [`m/index.html:2949`](../public/m/index.html#L2949):

```js
new Date(m.send_at.replace(' ','T')).toLocaleString('es-CO', {...})
```

Al no tener sufijo `Z`, `new Date()` interpreta el texto como si ya estuviera en la zona del dispositivo — pero es UTC. El asesor ve la hora del recordatorio 5h adelantada respecto a cuándo realmente se enviará.

**Nota:** la lógica de *envío* (`scheduler.js`, que compara contra `datetime('now')` sin `'localtime'`) sí es coherente con cómo se guardó — es un fallo puramente de visualización, el mensaje sale a la hora correcta, solo se muestra mal en pantalla.

**Corrección:** aplicar el mismo tratamiento que a las demás fechas UTC del frontend (ver 1.7) — no usar `replace(' ','T')` sobre columnas que vienen en UTC.

---

### 1.6 — 🟡 MEDIO — La hora se renderiza según la zona del celular, no la de Colombia

**Evidencia:** patrón repetido decenas de veces en `public/m/index.html` y otros archivos del frontend:

```js
d.toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'})
```

Sin el parámetro `timeZone`. `toLocaleString` con solo un locale (`'es-CO'`) controla el **formato** (idioma, orden día/mes) pero no la **zona horaria** — esa la toma del sistema operativo del dispositivo.

**Impacto:** si el teléfono de un asesor tiene la hora, la fecha o la zona horaria mal configuradas (algo común en Android con "hora automática" desactivada, o roaming), va a ver horas equivocadas **aunque la base de datos esté perfectamente corregida**. WhatsApp no tiene este problema porque siempre ancla el instante real (epoch) y lo formatea con la zona horaria del dispositivo de forma consistente — la diferencia aquí es que el *dato guardado* ya es ambiguo (1.2), así que ni siquiera con un dispositivo bien configurado se resuelve solo.

**Corrección:** una vez el backend siempre entregue UTC real (1.7), formatear siempre con zona explícita:

```js
d.toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit', timeZone: 'America/Bogota'})
```

Esto hace que **todos los usuarios vean la misma hora real de Colombia sin importar la configuración de su teléfono** — que es exactamente el comportamiento tipo WhatsApp que pediste.

---

### 1.7 — La recomendación de fondo

**Adoptar una sola convención: guardar siempre UTC, formatear siempre con `timeZone: 'America/Bogota'`.**

Por qué esta opción y no "todo en hora Bogotá": 37 de las tablas de producción **ya** tienen su DEFAULT en UTC (1.2) — congelado, sí, pero UTC. Consolidar hacia UTC significa migrar **menos filas** que consolidar hacia Bogotá (que exigiría además el truco delicado de reescribir el DEFAULT de esas 37 tablas, algo que SQLite no soporta con un simple `ALTER TABLE`). Es también el estándar de la industria: si el negocio alguna vez opera fuera de Colombia, o cambia el horario de verano en algún país vecino, UTC en la base de datos nunca se ve afectado — solo cambia el formateo.

**Plan de migración por fases (a ejecutar en una ronda de trabajo separada, con aprobación explícita antes de tocar producción):**

1. **Medir** (script de 1.1) contra una copia de la BD de producción — nunca directo.
2. **Backend:** un único helper `src/utils/tiempo.js` (ya existe el archivo, hoy solo tiene `parseLocalDbTime` — se reemplaza/extiende) con dos funciones: `nowUTC()` para guardar y `formatBogota(fechaUTC, opciones)` para mostrar. Todo INSERT/UPDATE con fecha pasa a usar `datetime('now')` sin `'localtime'` (o mejor, `strftime('%Y-%m-%dT%H:%M:%fZ','now')` para dejar explícito el sufijo `Z` y eliminar cualquier ambigüedad futura).
3. **Frontend:** un único helper compartido `fmtHora(ts)` / `fmtFecha(ts)` que todos los `toLocaleString`/`toLocaleTimeString`/`toLocaleDateString` del proyecto usan, con `timeZone: 'America/Bogota'` siempre fijo — se elimina la repetición de `replace(' ','T')` dispersa en 22 archivos distintos (ver conteo de ocurrencias más abajo).
4. **Migración de datos históricos**, dirigida y con corte de fecha, no un `UPDATE` masivo (como fue el error de 1.1).
5. **Verificación:** correr el script de diagnóstico de 1.1 de nuevo tras la migración — debe dar `diff_horas ≈ 0` para todas las filas comparadas.

`replace(' ','T')` o construcciones equivalentes para parsear fechas de la BD aparecen en **55 ocurrencias en 22 archivos** (`public/m/index.html`, `public/os/inbox.html`, `public/os/equipo-interno.html`, `public/supervisor/*`, `src/services/scheduler.js`, `src/services/wa-templates.js`, `src/services/progress.js`, entre otros) — todos son candidatos a reemplazar por el helper único del paso 3.

---

## 2. Sincronización de los chats

### 2.1 — 🟠 ALTO — No hay refetch al volver de segundo plano

**Evidencia:** [`m/index.html:1885`](../public/m/index.html#L1885) — el único listener de `visibilitychange` en todo el archivo está dedicado al desbloqueo biométrico, no a refrescar datos:

```js
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&!_bioUnlocking) (async()=>{ if(await bioActivado()...) pedirDesbloqueo(); })();
});
```

**Impacto:** cuando Android congela el WebView en segundo plano (algo que el sistema operativo hace agresivamente para ahorrar batería), la conexión `EventSource` del SSE muere sin que se dispare `onerror` de forma confiable. Al volver a primer plano, la app sigue mostrando los datos que tenía antes de congelarse, hasta que el asesor hace un pull-to-refresh manual — que es exactamente la queja de "no siempre sincroniza".

**Corrección:** agregar un segundo listener de `visibilitychange` que, al volver visible, (a) verifique si el `EventSource` sigue en estado `OPEN` y si no, lo reconecte inmediatamente, y (b) dispare un refetch completo de `cargar()` + los mensajes del chat abierto (`current`), igual que ya hace el handler `conectado` del SSE tras una reconexión real.

---

### 2.2 — 🟠 ALTO — Reconexión SSE sin backoff ni recuperación de eventos perdidos

**Evidencia:** [`m/index.html:5174`](../public/m/index.html#L5174):

```js
es.onerror=()=>{ es.close(); setTimeout(conectarStream,5000); };
```

**Dos problemas:**
1. **Intervalo fijo de 5s sin backoff exponencial.** Si el servidor cae o hay un pico de carga, todos los clientes conectados reintentan simultáneamente cada 5s — una pequeña tormenta de reconexión que puede agravar el problema justo cuando el servidor más lo necesita evitar.
2. **No hay recuperación de lo perdido durante la desconexión.** El estándar SSE soporta el header `Last-Event-ID` para que el servidor reenvíe lo que el cliente se perdió, pero ni el cliente lo usa ni el servidor lo implementa ([`events.js`](../src/services/events.js) no numera eventos ni los guarda en buffer). Al reconectar, el handler `conectado` solo recarga la **lista** de leads (`/api/mis-leads`) — no los **mensajes** del chat que el asesor tiene abierto en ese momento. Si la desconexión ocurrió mientras el cliente le escribía al lead abierto, esos mensajes no aparecen hasta que el asesor cierre y reabra el chat.

**Corrección:**
- Backoff exponencial con techo (p. ej. 2s, 4s, 8s, 16s, tope en 30s) en vez de 5s fijos.
- Al reconectar, si hay un chat abierto (`current`), refrescar también sus mensajes — no solo la lista.
- Evaluar a mediano plazo numerar los eventos server-side y soportar `Last-Event-ID` para no depender de un refetch completo cada vez.

---

### 2.3 — 🟡 MEDIO — Sin cola offline para mensajes salientes

**Evidencia:** no existe ningún `outbox`, `localStorage` de pendientes, ni listener de `navigator.onLine` en el proyecto (búsqueda exhaustiva sin resultados). El envío optimista existente (mencionado en `CLAUDE.md`, protección `window._sending`) evita el doble envío, pero si el dispositivo pierde señal en el momento de enviar, el mensaje simplemente falla y depende del reintento manual del asesor.

**Corrección:** cola local (IndexedDB o `localStorage`) que reintente automáticamente al detectar `navigator.onLine === true` o al recibir el evento `online`.

---

### 2.4 — 🟡 MEDIO — La doble escritura legacy ↔ multicanal es frágil

**Evidencia:** [`syncLeadToConversation`, store.js:2615-2676](../src/db/store.js#L2615-L2676) espeja a mano cada campo entre la tabla legacy `leads`/`messages` y el esquema nuevo `conversations`/`timeline`, y el manejo de error es silencioso:

```js
} catch (e) {
  console.error('syncLeadToConversation:', e.message);
  return null;
}
```

Si algo falla a mitad de la sincronización, el error solo queda en logs — nadie se entera en el momento y las dos tablas quedan desalineadas. **El cambio que tienes sin commitear en tu working tree** (`syncedFilename` en [`index.js:1737-1786`](../src/index.js#L1737-L1786)) es exactamente un ejemplo de esta fragilidad: `media_filename` se estaba guardando en la tabla legacy pero llegaba `null` a la tabla espejo `timeline` porque nadie lo estaba propagando — un adjunto enviado desde el panel no aparecía con su archivo en el inbox admin. El fix ya está bien hecho, solo lo señalo como síntoma del patrón de fondo.

**Recomendación:** no es urgente resolverlo de raíz ahora, pero conviene decidir a mediano plazo si el esquema legacy (`leads`/`messages`) se retira en favor del multicanal (`conversations`/`timeline`/`customers`) — mantener dos fuentes de verdad sincronizadas a mano seguirá generando bugs de este tipo cada vez que se agregue un campo nuevo.

**Actualización 2026-08-13 — parcialmente atacado, ver addendum arriba:** se blindó la mitad estructural
del problema (índice único en `conversations.lead_id`, creación transaccional, `syncLeadToConversation`
ya no traga errores en desarrollo). El retiro completo de `messages`/`syncLeadToConversation` en favor de
`timeline` como única fuente de mensajes sigue pendiente — es la recomendación de este párrafo, sin
cambios en su fondo.

---

### 2.5 — 🔵 BAJO — Leads sin asignar no notifican en tiempo real

**Evidencia:** `emitToVendedor(lead.assigned_to_id, ...)` en los distintos puntos de emisión de eventos — si `assigned_to_id` es `null` (lead recién llegado, aún no repartido por el round-robin), solo el canal de admins (`emitToAdmins`, canal 0) recibe el evento. No es necesariamente un bug — puede ser el diseño esperado — pero vale la pena confirmar que es intencional.

---

## 3. Estabilidad y robustez

### 3.1 — 🟠 ALTO → ✅ RESUELTO — `uncaughtException` no termina el proceso

**Estado 2026-08-13:** ya corregido. [`index.js:4862`](../src/index.js#L4862) llama `process.exit(1)` tras
loguear, dejando que `restart: unless-stopped` de Docker reinicie limpio. Se deja el hallazgo original
como referencia histórica.

**Evidencia original (ya no aplica):**

```js
process.on('unhandledRejection', (err) => logger.logError('unhandledRejection', err));
process.on('uncaughtException', (err) => { logger.logError('uncaughtException', err); });
```

**Impacto:** Node.js, por diseño, considera un `uncaughtException` un estado en el que el proceso ya no puede garantizarse consistente (recursos a medio liberar, promesas colgadas, listeners en estado indefinido). Lo correcto es loguear y luego **terminar el proceso** (`process.exit(1)`), dejando que el `restart: unless-stopped` de Docker (`docker-compose.yml`) y el `HEALTHCHECK` lo reinicien limpio. Tal como está hoy, el servidor puede seguir "vivo" pero sirviendo en un estado corrupto — potencialmente sirviendo peor que si se hubiera caído y reiniciado.

**Corrección:**
```js
process.on('uncaughtException', (err) => {
  logger.logError('uncaughtException', err);
  process.exit(1); // dejar que Docker reinicie limpio — no hay estado del que confiar
});
```

---

### 3.2 — 🟡 MEDIO — Recuperar el id insertado por `SELECT ... ORDER BY id DESC LIMIT 1` en vez de `last_insert_rowid()`

**Evidencia:** [`saveMessage`, store.js:709-719](../src/db/store.js#L709-L719):

```js
run('INSERT INTO messages (...) VALUES (...)', [...]);
...
const r = one('SELECT id FROM messages WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [leadId]);
return r ? r.id : null;
```

Y el mismo patrón en `createScheduled` ([`store.js:816-820`](../src/db/store.js#L816-L820)) y 8 sitios más que sí usan la forma correcta (`last_insert_rowid()`) en otras funciones — la inconsistencia sugiere que no fue intencional.

**Por qué es una condición de carrera:** si dos requests concurrentes insertan un mensaje para el **mismo** `leadId` casi al mismo tiempo (plausible: el webhook de WhatsApp entrante y una respuesta del vendedor pueden coincidir en milisegundos), el `SELECT ... ORDER BY id DESC LIMIT 1` puede devolver el id del mensaje del *otro* request, no el propio. El id retornado se usa después para adjuntar reacciones, marcar como leído, referenciar en respuestas (`reply_to_id`) — un id equivocado ahí es un bug silencioso y difícil de reproducir.

**Corrección:** usar `last_insert_rowid()` (SQLite) igual que ya hacen `createTarea`, `addTarea`, `createCita`, etc. — patrón ya establecido en el propio archivo, solo falta aplicarlo aquí.

---

### 3.3 — 🔵 BAJO — Backups solo viven en la misma VM

**Evidencia:** [`deploy/backup.sh`](../deploy/backup.sh) está bien construido — hace `PRAGMA wal_checkpoint(TRUNCATE)` antes de copiar (evita perder escrituras recientes que solo viven en el `-wal`), incluye la carpeta `media/` completa, y tiene retención de 30 días / 60 backups. Pero todo el proceso escribe a `/home/ubuntu/backups` — en el mismo disco de la misma instancia e2-micro.

**Impacto:** si se pierde la VM (fallo de disco, borrado accidental, problema de facturación en Google Cloud), se pierde la base de datos **y** todos sus backups al mismo tiempo.

**Corrección sugerida:** agregar un paso final al script que suba el `.gz` más reciente a un bucket de Google Cloud Storage (gratis hasta cierto volumen, y ya están en el ecosistema GCP) o a cualquier almacenamiento externo — unas pocas líneas con `gsutil cp` o `rclone`.

---

### 3.4 — 🔵 BAJO → parcialmente resuelto — Cobertura de tests todavía delgada

**Estado 2026-08-13:** ya no es cero. Existe `vitest` (`npm test`, corre en CI) con 4 archivos —
`test/db/store.test.js` (ventana de 24h, anti-duplicados de leads, y desde esta tanda la no-duplicación
de `conversations` por `lead_id`), `test/services/assigner.test.js` (round-robin), `test/utils/tiempo.test.js`
y `test/services/auth.test.js` (nuevo — `esAccesoGlobal`), 30 tests en total. Cubre exactamente las
funciones que esta auditoría recomendaba priorizar (`isWindowOpen`, el round-robin, y ahora el helper de
tiempo y de roles).

**Sigue faltando:** ningún test de nivel HTTP/endpoint (no hay `supertest` ni equivalente) y cero
cobertura del panel móvil (`public/m/app.js`, ~4900 líneas) ni del webhook de WhatsApp — los dos caminos
más críticos y menos probados del sistema. Antes de tocar `syncLeadToConversation`/`messages` a fondo
(ver 2.4), conviene añadir tests de contrato para `getMessagesByLead`/`getTimelineByConversation` que
congelen la forma del objeto que devuelven.

---

## 4. Rendimiento y escala

### 4.1 — Monolitos grandes

| Archivo | Tamaño |
|---|---|
| `src/index.js` | 5.369 líneas |
| `src/db/store.js` | 3.432 líneas, 167 KB |
| `public/m/index.html` | 5.224 líneas, **392 KB en un solo archivo** |
| `public/os/meta-ads.html` | 96 KB |
| `public/os/inbox.html` | 88 KB |

**Impacto concreto en `public/m/index.html`:** se sirve con cabecera `Cache-Control: no-cache, no-store, must-revalidate` ([`index.js:220`](../src/index.js#L220)) — decisión correcta para que los cambios lleguen sin necesidad de una nueva versión del APK (documentado en `CLAUDE.md`), pero como consecuencia **cada apertura de la app re-descarga los 392 KB completos** sobre la red móvil del asesor en campo, sin ningún tipo de división en módulos ni compresión adicional más allá de gzip/brotli del servidor. En zonas con señal débil (parte del público objetivo, ventas de lotes rurales/nacionales) esto es una fuente directa de lentitud percibida al abrir el panel.

**Recomendación:** no es necesario un rediseño arquitectónico para resolver esto — dividir `index.html` en un HTML base pequeño + 3-4 bundles JS por tab (Chats, Equipo, Supervisión, etc.) cargados de forma diferida ya reduciría sustancialmente la descarga inicial, manteniendo la misma estrategia de `no-cache` solo en los bundles que cambian con frecuencia.

### 4.2 — Techo de la instancia

- e2-micro: 1 GB de RAM total, `mem_limit: 700m` para el contenedor (dejando margen para SO + Caddy + Docker, documentado y correcto en `docker-compose.yml`).
- SQLite con WAL — buena elección para esta escala (lecturas concurrentes sin bloqueo), pero **de un solo escritor**: si el volumen de leads/mensajes crece mucho, las escrituras concurrentes (webhook entrante + varios vendedores respondiendo a la vez) empiezan a serializarse. El `busy_timeout = 5000` ([`db/adapter.js:37`](../src/db/adapter.js#L37)) amortigua esto, no lo elimina.
- **No hay una señal de alarma temprana** (métricas de uso de RAM/CPU/latencia expuestas) más allá del healthcheck binario de `/api/health`. Con el equipo actual (3 vendedores) no es urgente, pero conviene decidir de antemano en qué volumen de leads/mensajes por día conviene migrar a una instancia con más RAM, antes de que el síntoma sea "el CRM se cae en hora pico".

### 4.3 — Índices

Se revisaron los índices existentes contra las consultas reales del inbox y panel móvil (`getLeadsByVendedorId`, `getMessagesByLead`, `getLeads`): están bien cubiertos — `idx_leads_assigned_to_id`, `idx_leads_status`, `idx_messages_lead_id`, `idx_conversations_lead_id`, `idx_timeline_conversation_id` cubren los `WHERE`/`JOIN` más frecuentes. Sin hallazgos de índices faltantes en esta ronda.

---

## 5. Seguridad

**Lo que ya está bien implementado** (verificado, no solo asumido):
- Verificación de firma `X-Hub-Signature-256` con `timingSafeEqual` en el webhook de Meta ([`index.js:145-166`](../src/index.js#L145-L166)), y falla cerrado en producción si falta `APP_SECRET`.
- PINs y contraseñas con `scrypt` + salt aleatorio + comparación de tiempo constante ([`auth.js`](../src/services/auth.js)).
- Sesiones persistidas en base de datos (no solo cookie firmada), con expiración de 30 días revisada en cada request.
- Rate limiting diferenciado por endpoint (login por teléfono+IP, media, mensajes, webhook, catálogo público) — bien pensado, incluso documentado el motivo de cada elección en comentarios.
- Cabeceras de seguridad completas: CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `HSTS` condicional a HTTPS, `Permissions-Policy` restringiendo cámara/geolocalización por defecto.
- Tokens firmados para acceso a media (`signMediaToken`), no URLs públicas sin control.
- Middleware de autorización por rol (`requireAuth`, `requireAdmin`, `esAccesoGlobal`) aplicado consistentemente en las rutas revisadas.

**Puntos a vigilar, no necesariamente a cambiar ya:**
- **PIN de 4 dígitos** (10.000 combinaciones): mitigado por el rate limit de 10 intentos/15min por teléfono ([`config.js`](../src/config.js)), lo cual hace inviable un ataque de fuerza bruta online. Aceptable para el modelo de amenaza actual (equipo pequeño, acceso por teléfono conocido), pero si el equipo de vendedores crece mucho o el acceso se expone más públicamente, valdría la pena subir a PIN de 6 dígitos o considerar 2FA para el rol admin específicamente.
- **Sesiones de 30 días sin rotación de token:** razonable para UX (nadie quiere loguearse cada semana en un panel móvil de trabajo), pero significa que un token robado (dispositivo perdido, por ejemplo) sigue siendo válido por hasta 30 días. Si no existe ya, conviene una opción en el panel admin de "cerrar sesión en todos los dispositivos" por vendedor.

Sin hallazgos críticos de seguridad en esta ronda.

---

## 6. Mejoras de producto y próximos pasos

Del propio `CLAUDE.md`, estado "⏳ Pendiente" ya documentado por el equipo — se listan aquí solo para que queden junto al resto de la priorización:
- Tabs de **Propiedades, Tareas, Copiloto** en el panel móvil siguen en placeholder "Próximamente".
- **Calling API de WhatsApp** bloqueada por Meta hasta alcanzar el límite de 2.000 destinatarios únicos/día.
- **n8n** para automatizaciones aún no integrado (aunque `automatizaciones.html` ya tiene un editor visual propio estilo n8n, según el último commit del historial).
- Primera campaña real de Meta Ads para recibir el primer lead de producción, según el estado documentado.

### Tabla de priorización (impacto × esfuerzo)

| # | Hallazgo | Impacto | Esfuerzo | Prioridad |
|---|---|---|---|---|
| 1.1 | Migración de horario en dirección contraria | Muy alto (causa raíz de tu síntoma) | Medio (medir antes de corregir) | **1 — ya** |
| 1.4 | Orden de mensajes por `id` en vez de `timestamp` | Alto | Muy bajo (una línea) | **2 — ya** |
| 3.1 | `uncaughtException` no termina el proceso | Alto (estabilidad) | Muy bajo (dos líneas) | **2 — ya** |
| 2.1 | Refetch al volver de segundo plano | Alto (síntoma directo de "no sincroniza") | Bajo | **3 — próxima ronda** |
| 2.2 | Backoff + recuperación SSE | Alto | Medio | **3 — próxima ronda** |
| 1.7 | Unificar convención de tiempo (UTC + helper) | Muy alto (resuelve 1.2–1.6 de raíz) | Alto (toca muchos archivos) | **3 — próxima ronda, planeada aparte** |
| 3.2 | `last_insert_rowid()` en vez de SELECT | Medio | Muy bajo | **4** |
| 2.3 | Cola offline | Medio | Medio | **4** |
| 3.3 | Backup fuera de la VM | Medio (riesgo de desastre total) | Bajo | **4** |
| 4.1 | Dividir `m/index.html` en bundles | Medio (percepción de velocidad) | Medio-alto | **5** |
| 3.4 | Tests de regresión para fechas/asignación | Alto a largo plazo | Medio, continuo | **5, arrancar pronto** |

---

## Cómo seguir desde aquí

Este documento no modifica nada — es la base para decidir. Sugerencia concreta de arranque cuando quieras avanzar:

1. Correr el script de diagnóstico de la sección 1.1 contra una **copia** de la base de datos de producción, para tener el número real de filas afectadas y su magnitud antes de decidir la corrección.
2. Aplicar 1.4 y 3.1 — son cambios triviales y de bajo riesgo con alto impacto inmediato.
3. Planear en una ronda de trabajo aparte la unificación de tiempo (1.7) — es la que realmente cierra el problema de raíz, pero toca muchos archivos y merece su propio plan revisado contigo antes de tocar código.
