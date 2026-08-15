// Todas las columnas DATETIME de la BD se escriben con datetime('now','localtime') —
// es decir, ya vienen en hora de Bogotá como texto plano "YYYY-MM-DD HH:MM:SS", sin
// indicador de zona. Parsearlas con `new Date(texto + 'Z')` (patrón que se copió y pegó
// en varios archivos) le dice a JavaScript "esto es UTC", y como Bogotá es UTC-5, calcula
// un instante 5 horas antes del real. Comparado contra Date.now()/new Date() (que SÍ
// representan el momento real) cualquier "¿pasaron ya N horas?" se dispara 5 horas antes
// de lo que corresponde — ventanas de WhatsApp que se ven cerradas estando abiertas,
// vendedores que se ven desconectados estando activos, cadencias y escalamientos que
// disparan antes de tiempo.
//
// El contenedor corre con TZ=America/Bogota (ver docker-compose.yml), así que basta con
// NO decirle a JS que es UTC: sin el sufijo 'Z', new Date() interpreta el texto en la
// zona horaria del proceso — que ya es Bogotá.
//
// Comparar dos columnas de este tipo ENTRE SÍ (p. ej. first_response_at - created_at)
// no tiene este problema: el mismo error se aplica a ambos lados y se cancela en la
// resta. El problema es solo al comparar contra la hora actual real.
function parseLocalDbTime(str) {
  if (!str) return null;
  const d = new Date(String(str).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

// --- Convención unificada (Fase 1.1 del plan de modernización) ---------------------
// Guardar SIEMPRE en UTC con sufijo 'Z' explícito, mostrar SIEMPRE con timeZone fijo
// 'America/Bogota'. Elimina la ambigüedad de fondo: un texto sin sufijo puede venir de
// código legado que escribió hora local (`datetime('now','localtime')`) o del DEFAULT
// congelado de una tabla vieja (`datetime('now')`, UTC) — dos convenciones distintas
// indistinguibles a simple vista. A partir de aquí, todo dato nuevo lleva 'Z' y no deja
// dudas. Ver docs/AUDITORIA_2026-08.md secciones 1.2 y 1.7 para el diagnóstico completo.

// SQL a usar en INSERT/UPDATE en vez de datetime('now') o datetime('now','localtime'):
// ISO 8601 UTC con milisegundos y 'Z' explícito — nunca ambiguo.
const SQL_NOW_UTC = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// Para fijar el valor desde JS (cuando no se puede usar SQL_NOW_UTC directo en la query).
function nowUTC() {
  return new Date().toISOString(); // ya es "YYYY-MM-DDTHH:mm:ss.sssZ"
}

// Parsea cualquier timestamp que pueda venir de la BD: con 'Z'/offset explícito (dato
// nuevo, UTC) o sin sufijo (dato legado — se asume UTC porque es la convención con la que
// quedó congelado el DEFAULT de la mayoría de tablas de producción; ver auditoría 1.2).
function parseDbTimeUTC(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (!s) return null;
  const withOffset = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(s);
  const d = new Date(withOffset ? s : s.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

// Formatea un timestamp de BD (cualquier convención, ver parseDbTimeUTC) en hora de
// Bogotá, sin importar la zona horaria configurada en el dispositivo del usuario —
// así todos ven el mismo reloj real, igual que WhatsApp.
function formatBogota(fechaUTC, opciones = {}) {
  const d = fechaUTC instanceof Date ? fechaUTC : parseDbTimeUTC(fechaUTC);
  if (!d) return '—';
  const { modo = 'hora', ...opts } = opciones;
  const base = { timeZone: 'America/Bogota' };
  if (modo === 'hora') return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', ...base, ...opts });
  if (modo === 'fecha') return d.toLocaleDateString('es-CO', { ...base, ...opts });
  return d.toLocaleString('es-CO', { ...base, ...opts }); // modo === 'completo'
}

// Colombia no aplica horario de verano: el offset es fijo desde 1993, así que no hace
// falta una librería de zonas horarias para convertir un día local a su rango UTC.
const OFFSET_CO = '-05:00';

// Traduce un día del calendario de Bogotá ('YYYY-MM-DD') al rango [desde, hasta) en UTC
// que lo contiene. Es lo que hay que usar para filtrar columnas escritas con SQL_NOW_UTC:
// `date(ts)` en SQLite devuelve la fecha UTC, así que comparar contra un día local pierde
// todo lo ocurrido entre las 19:00 y la medianoche (cae ya en el día UTC siguiente).
// Devolver un rango en vez de una fecha tiene además la ventaja de que la comparación es
// sobre texto ISO —lexicográficamente ordenable— y puede usar el índice, mientras que
// `date(ts) = ?` obliga a evaluar una función por fila.
function rangoUTCDeDiaLocal(fecha) {
  const desde = new Date(`${String(fecha).slice(0, 10)}T00:00:00.000${OFFSET_CO}`);
  if (isNaN(desde.getTime())) return null;
  return [desde.toISOString(), new Date(desde.getTime() + 86400000).toISOString()];
}

// El día de hoy según el calendario de Bogotá, no según UTC. `new Date().toISOString()`
// devuelve el día equivocado entre las 19:00 y la medianoche hora local.
function hoyBogota() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // en-CA → YYYY-MM-DD
}

module.exports = {
  parseLocalDbTime, nowUTC, parseDbTimeUTC, formatBogota, SQL_NOW_UTC,
  rangoUTCDeDiaLocal, hoyBogota, OFFSET_CO,
};
