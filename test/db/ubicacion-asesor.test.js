// Tests del rastreo de ubicación del asesor (src/db/store.js). Lo que se protege aquí
// no es "que guarde puntos", sino las dos reglas que hacen aceptable el rastreo:
//   1. Sin consentimiento sellado en BD no se guarda NADA, aunque el cliente lo mande.
//   2. Revocar el consentimiento borra el rastro anterior, no solo apaga la captura.
const store = require('../../src/db/store');

let vendedorId;

beforeAll(async () => {
  await store.initDB();
  store.createSchema();
  vendedorId = store.addVendedor('Asesor Ubicacion Test', '+573009990001');
});

afterAll(() => {
  try { store.revocarConsentimientoUbicacion(vendedorId); } catch (e) {}
  try { store.deleteVendedor(vendedorId); } catch (e) {}
});

describe('consentimiento de ubicación', () => {
  it('rechaza guardar posiciones mientras el asesor no haya aceptado', () => {
    expect(store.tieneConsentimientoUbicacion(vendedorId)).toBe(false);
    const r = store.guardarPosicionVendedor(vendedorId, { lat: 4.71, lng: -74.07 });
    expect(r).toEqual({ ok: false, error: 'sin_consentimiento' });
    expect(store.getRecorridoVendedor(vendedorId, new Date().toISOString().slice(0, 10))).toHaveLength(0);
  });

  it('guarda posiciones una vez aceptado y las expone como recorrido del día', () => {
    store.setConsentimientoUbicacion(vendedorId);
    expect(store.tieneConsentimientoUbicacion(vendedorId)).toBe(true);
    expect(store.guardarPosicionVendedor(vendedorId, { lat: 4.1420, lng: -73.7580, precision: 12, bateria: 80 }).ok).toBe(true);
    expect(store.guardarPosicionVendedor(vendedorId, { lat: 4.1451, lng: -73.7549 }).ok).toBe(true);

    const hoy = new Date().toISOString().slice(0, 10);
    const puntos = store.getRecorridoVendedor(vendedorId, hoy);
    expect(puntos).toHaveLength(2);
    expect(puntos[0].lat).toBeCloseTo(4.1420, 4); // orden cronológico, no de inserción inversa
    expect(puntos[1].lat).toBeCloseTo(4.1451, 4);
  });

  it('deja la última posición accesible sin recorrer el histórico', () => {
    const fila = store.getUltimasPosiciones().find(v => Number(v.id) === Number(vendedorId));
    expect(fila).toBeTruthy();
    expect(fila.last_lat).toBeCloseTo(4.1451, 4);
    expect(fila.last_pos_at).toBeTruthy();
  });

  it('no devuelve el recorrido de un día en el que no hubo movimiento', () => {
    expect(store.getRecorridoVendedor(vendedorId, '2020-01-01')).toHaveLength(0);
  });

  it('revocar borra el rastro completo, no solo apaga la captura', () => {
    store.revocarConsentimientoUbicacion(vendedorId);
    expect(store.tieneConsentimientoUbicacion(vendedorId)).toBe(false);
    expect(store.getRecorridoVendedor(vendedorId, new Date().toISOString().slice(0, 10))).toHaveLength(0);
    expect(store.getUltimasPosiciones().find(v => Number(v.id) === Number(vendedorId))).toBeFalsy();
    // Y vuelve a rechazar posiciones nuevas
    expect(store.guardarPosicionVendedor(vendedorId, { lat: 1, lng: 1 }).ok).toBe(false);
  });
});

describe('purga del histórico', () => {
  it('borra solo lo más viejo que la ventana de retención', () => {
    store.setConsentimientoUbicacion(vendedorId);
    store.guardarPosicionVendedor(vendedorId, { lat: 4.60, lng: -74.08 });
    // Un punto antiguo, insertado con fecha explícita para simular el paso del tiempo
    store.run(`INSERT INTO vendedor_posiciones (vendedor_id, lat, lng, ts)
               VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now','-40 days'))`, [vendedorId, 4.50, -74.10]);

    const borrados = store.purgarPosicionesAntiguas(30);
    expect(borrados).toBeGreaterThanOrEqual(1);
    // El punto de hoy sobrevive
    expect(store.getRecorridoVendedor(vendedorId, new Date().toISOString().slice(0, 10)).length).toBeGreaterThan(0);
  });
});
