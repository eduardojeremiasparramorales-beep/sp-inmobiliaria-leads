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

module.exports = { parseLocalDbTime };
