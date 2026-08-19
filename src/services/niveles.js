// Niveles de gamificación de la Red: traduce el XP acumulado del asesor en un nivel con
// nombre, y — clave para el negocio — en un PESO de reparto (el que más vende sube de
// nivel y recibe más leads, ver services/reparto.js). Umbrales y pesos configurables en
// la tabla config ('niveles_json'); si no hay override, se usan los del catálogo default.
const store = require('../db/store');

// Catálogo por defecto: umbral = XP acumulado mínimo; peso = multiplicador de reparto.
// Nadie baja de 1.0, el tope es 2.0 (un Diamante recibe el doble que un Bronce, jamás
// deja a nadie en cero — es la carga EFECTIVA la que se minimiza, no el conteo crudo).
const CATALOGO_DEFAULT = [
  { nivel: 1, slug: 'bronce',   nombre: 'Bronce',   emoji: '🥉', umbral: 0,    peso: 1.0 },
  { nivel: 2, slug: 'plata',    nombre: 'Plata',    emoji: '🥈', umbral: 200,  peso: 1.25 },
  { nivel: 3, slug: 'oro',      nombre: 'Oro',      emoji: '🥇', umbral: 600,  peso: 1.5 },
  { nivel: 4, slug: 'platino',  nombre: 'Platino',  emoji: '💠', umbral: 1500, peso: 1.75 },
  { nivel: 5, slug: 'diamante', nombre: 'Diamante', emoji: '💎', umbral: 3500, peso: 2.0 },
];

// Puntos por evento verificable (nada auto-declarado — el asesor no puede inflar su nivel
// marcando 'vendido' en su propio chat; solo cuenta la venta confirmada en Finanzas).
const PUNTOS = {
  venta_confirmada: 100,
  respuesta_rapida: 5,   // primer respuesta en < 5 min
  lead_atendido:    2,   // lead respondido y cerrado sin abandono
  lead_abandonado: -10,  // escalado por no responder
};

function getCatalogo() {
  try {
    const raw = store.getConfig('niveles_json');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.slice().sort((a, b) => a.umbral - b.umbral);
      }
    }
  } catch (e) { /* config corrupta → catálogo default */ }
  return CATALOGO_DEFAULT;
}

// Nivel correspondiente a un XP acumulado, con progreso al siguiente nivel.
function nivelDeXp(xp) {
  const cat = getCatalogo();
  const x = Number(xp) || 0;
  let actual = cat[0];
  for (const n of cat) { if (x >= n.umbral) actual = n; else break; }
  const idx = cat.findIndex(n => n.nivel === actual.nivel);
  const siguiente = cat[idx + 1] || null;
  return {
    ...actual,
    xp: x,
    xpSiguiente: siguiente ? siguiente.umbral : null,
    faltanXp: siguiente ? Math.max(0, siguiente.umbral - x) : 0,
    progreso: siguiente ? Math.min(1, (x - actual.umbral) / (siguiente.umbral - actual.umbral)) : 1,
    siguienteNombre: siguiente ? siguiente.nombre : null,
  };
}

// Peso de reparto de un asesor. Usa vendedor.xp si el pool ya lo trae (getVendedoresActivos
// lo incluye) para no disparar una consulta por asesor; si no, lo calcula.
function pesoDeVendedor(vendedor) {
  if (!vendedor) return 1;
  // El peso por nivel es un mecanismo de la RED (grupo 2). El equipo Leons (grupo 1)
  // conserva su reparto por carga pura — no se le cambia el comportamiento histórico.
  const grupo = Number(vendedor.grupo_id != null ? vendedor.grupo_id : 1);
  if (grupo !== 2) return 1;
  let xp = vendedor.xp;
  if (xp == null && vendedor.id != null) {
    try { xp = store.getXpTotal(vendedor.id); } catch (e) { xp = 0; }
  }
  return nivelDeXp(xp).peso;
}

// Otorga XP a un asesor por un evento verificable. Best-effort: no debe tumbar el flujo
// de negocio que lo dispara (registrar una venta, cerrar un lead) si algo falla.
function otorgar(vendedorId, tipo, refId) {
  const puntos = PUNTOS[tipo];
  if (puntos == null) return false;
  return store.addXpEvento(vendedorId, tipo, puntos, refId != null ? refId : null);
}

module.exports = { CATALOGO_DEFAULT, PUNTOS, getCatalogo, nivelDeXp, pesoDeVendedor, otorgar };
