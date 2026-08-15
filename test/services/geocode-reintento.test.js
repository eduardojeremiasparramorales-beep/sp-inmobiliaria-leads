// Un fallo de red NO puede dar un lead por imposible de ubicar.
//
// `geocode_at` es una decisión definitiva: getLeadsSinCoordenadas() filtra por
// `geocode_at IS NULL`, así que sellarlo saca al lead de la cola de geocodificación para
// siempre y su pin no aparece nunca en el mapa. Eso es correcto cuando el proveedor
// respondió "no conozco ese sitio", y es un error cuando simplemente hubo un timeout.
//
// Caso real que motivó el test: un lead con ciudad "Tocaima" (que existe y Nominatim
// resuelve sin problema) quedó con lat NULL y geocode_at sellado porque la consulta dio
// timeout de 8s. Quedó fuera del mapa de forma permanente.
// `vi`, `describe`, `it` y `expect` son globales (globals: true en vitest.config).
const axios = require('axios');
const store = require('../../src/db/store');
const geocode = require('../../src/services/geocode');

let leadRed, leadFantasma;

beforeAll(async () => {
  await store.initDB();
  store.createSchema();
});

beforeEach(() => { vi.restoreAllMocks(); });

afterAll(() => {
  for (const id of [leadRed, leadFantasma]) {
    try { if (id) store.run('DELETE FROM leads WHERE id = ?', [id]); } catch (e) {}
  }
});

function crearLead(nombre, ciudad) {
  store.run("INSERT INTO leads (customer_name, customer_phone, ciudad, status) VALUES (?, ?, ?, 'nuevo')",
    [nombre, '+5730099' + Math.floor(Math.random() * 100000), ciudad]);
  return store.one('SELECT id FROM leads WHERE customer_name = ? ORDER BY id DESC', [nombre]).id;
}

describe('geocodificación: fallo de red vs. sitio inexistente', () => {
  it('un timeout deja el lead PENDIENTE, no lo marca como imposible', async () => {
    leadRed = crearLead('Lead Timeout Test', 'Tocaima');
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('timeout of 8000ms exceeded'));

    await expect(geocode.geocodificarLead({ id: leadRed, ciudad: 'Tocaima' }))
      .rejects.toBeInstanceOf(geocode.ErrorRedGeocode);

    const fila = store.one('SELECT lat, geocode_at FROM leads WHERE id = ?', [leadRed]);
    expect(fila.lat).toBeNull();
    expect(fila.geocode_at).toBeNull();   // ← lo que estaba mal: se sellaba igual
  });

  it('el lote no quema los leads y los deja para la siguiente pasada', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('ETIMEDOUT'));
    const r = await geocode.geocodificarPendientes(5);
    expect(r.fallosRed).toBeGreaterThan(0);
    expect(r.resueltos).toBe(0);
    // El lead sigue en la cola: es lo que permite que se reintente sola.
    const sigue = store.getLeadsSinCoordenadas(50).some(l => Number(l.id) === Number(leadRed));
    expect(sigue).toBe(true);
  });

  it('una respuesta vacía del proveedor SÍ marca el lead (no existe, no reintentar)', async () => {
    leadFantasma = crearLead('Lead Fantasma Test', 'Ciudad Que No Existe Test');
    vi.spyOn(axios, 'get').mockResolvedValue({ data: [] });   // Nominatim: sin resultados

    const p = await geocode.geocodificarLead({ id: leadFantasma, ciudad: 'Ciudad Que No Existe Test' });
    expect(p).toBeNull();

    const fila = store.one('SELECT lat, geocode_at FROM leads WHERE id = ?', [leadFantasma]);
    expect(fila.lat).toBeNull();
    expect(fila.geocode_at).toBeTruthy();  // definitivo: no vuelve a la cola
  });
});
