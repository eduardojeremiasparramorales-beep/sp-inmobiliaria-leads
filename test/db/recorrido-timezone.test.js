// El recorrido del día es lo que el jefe mira para saber dónde estuvo un asesor, así que
// "el día" tiene que ser el día del asesor (Bogotá), no el del reloj UTC del servidor.
//
// El bug que fija este archivo: `vendedor_posiciones.ts` se guarda en UTC, y el filtro
// original era `date(ts) = date(?)` contra una fecha local. Como Bogotá es UTC-5, todo
// punto registrado entre las 19:00 y la medianoche hora local tiene fecha UTC del día
// SIGUIENTE — o sea, el tramo final de la jornada desaparecía del recorrido y reaparecía
// al día siguiente, mezclado con la mañana. Justo las horas de las visitas de cierre.
const store = require('../../src/db/store');
const { rangoUTCDeDiaLocal, hoyBogota } = require('../../src/utils/tiempo');

let vendedorId;

// Un día cualquiera, fijo, para que el test no dependa de cuándo se ejecute.
const DIA = '2026-08-14';

beforeAll(async () => {
  await store.initDB();
  store.createSchema();
  vendedorId = store.addVendedor('Asesor Recorrido TZ', '+573009990009');
  store.setConsentimientoUbicacion(vendedorId);
});

afterAll(() => {
  try { store.revocarConsentimientoUbicacion(vendedorId); } catch (e) {}
  try { store.deleteVendedor(vendedorId); } catch (e) {}
});

// Inserta con `ts` explícito: es la única forma de simular una hora concreta del día.
function punto(tsUTC, lat) {
  store.run('INSERT INTO vendedor_posiciones (vendedor_id, lat, lng, ts) VALUES (?, ?, ?, ?)',
    [vendedorId, lat, -74.07, tsUTC]);
}

describe('rangoUTCDeDiaLocal', () => {
  it('abarca las 24 horas del día de Bogotá, desplazadas 5 horas en UTC', () => {
    expect(rangoUTCDeDiaLocal(DIA)).toEqual(['2026-08-14T05:00:00.000Z', '2026-08-15T05:00:00.000Z']);
  });

  it('devuelve null ante una fecha inservible en vez de un rango inventado', () => {
    expect(rangoUTCDeDiaLocal('no-es-fecha')).toBeNull();
  });
});

describe('hoyBogota', () => {
  it('devuelve un día del calendario en formato YYYY-MM-DD', () => {
    expect(hoyBogota()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getRecorridoVendedor: el día es el del asesor, no el de UTC', () => {
  beforeAll(() => {
    punto('2026-08-14T13:00:00.000Z', 4.10); // 08:00 Bogotá — mañana del 14
    punto('2026-08-15T02:30:00.000Z', 4.20); // 21:30 Bogotá del 14 — el caso que se perdía
    punto('2026-08-15T04:59:59.999Z', 4.30); // 23:59:59 Bogotá del 14 — última milésima
    punto('2026-08-15T05:00:00.000Z', 4.40); // 00:00 Bogotá del 15 — ya es otro día
    punto('2026-08-14T04:59:59.999Z', 4.00); // 23:59:59 Bogotá del 13 — todavía no es el 14
  });

  it('incluye el tramo nocturno que caía en el día UTC siguiente', () => {
    const puntos = store.getRecorridoVendedor(vendedorId, DIA);
    expect(puntos.map(p => p.lat)).toEqual([4.10, 4.20, 4.30]);
  });

  it('excluye la medianoche del día siguiente y el final del anterior', () => {
    expect(store.getRecorridoVendedor(vendedorId, '2026-08-15').map(p => p.lat)).toEqual([4.40]);
    expect(store.getRecorridoVendedor(vendedorId, '2026-08-13').map(p => p.lat)).toEqual([4.00]);
  });

  it('devuelve los puntos en orden cronológico', () => {
    const ts = store.getRecorridoVendedor(vendedorId, DIA).map(p => p.ts);
    expect(ts).toEqual([...ts].sort());
  });

  it('no revienta con una fecha inválida: devuelve vacío', () => {
    expect(store.getRecorridoVendedor(vendedorId, 'ayer')).toHaveLength(0);
  });
});
