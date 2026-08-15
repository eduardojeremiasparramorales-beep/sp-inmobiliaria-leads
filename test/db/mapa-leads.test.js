// Coordenadas de los leads para el mapa. Lo que se protege aquí es la jerarquía del
// dato: un pin que el cliente compartió por WhatsApp vale más que el centroide de su
// ciudad, y el cron de geocodificación —que corre cada hora— no puede degradarlo.
const store = require('../../src/db/store');

let vendedorA, vendedorB, leadA, leadB;

beforeAll(async () => {
  await store.initDB();
  store.createSchema();
  vendedorA = store.addVendedor('Asesor Mapa A', '+573009991001');
  vendedorB = store.addVendedor('Asesor Mapa B', '+573009991002');
  leadA = store.saveLead('+573001112221', 'Cliente A', 'hola').leadId;
  leadB = store.saveLead('+573001112222', 'Cliente B', 'hola').leadId;
  store.run('UPDATE leads SET assigned_to_id = ? WHERE id = ?', [vendedorA, leadA]);
  store.run('UPDATE leads SET assigned_to_id = ? WHERE id = ?', [vendedorB, leadB]);
});

afterAll(() => {
  [leadA, leadB].forEach(id => { try { store.run('DELETE FROM leads WHERE id = ?', [id]); } catch (e) {} });
  [vendedorA, vendedorB].forEach(id => { try { store.deleteVendedor(id); } catch (e) {} });
});

function coordsDe(leadId) {
  return store.one('SELECT lat, lng, coord_fuente FROM leads WHERE id = ?', [leadId]);
}

describe('precedencia de coordenadas', () => {
  it('guarda la ubicación compartida como fuente exacta', () => {
    expect(store.setLeadCoordsDesdeUbicacion(leadA, 4.1420, -73.7580)).toBe(true);
    const c = coordsDe(leadA);
    expect(c.lat).toBeCloseTo(4.1420, 4);
    expect(c.coord_fuente).toBe('ubicacion');
  });

  it('la geocodificación por ciudad NO pisa una ubicación compartida', () => {
    store.setLeadCoords(leadA, 4.7110, -74.0721, 'geocodificado'); // centroide de Bogotá
    const c = coordsDe(leadA);
    expect(c.lat).toBeCloseTo(4.1420, 4);   // sigue siendo el pin real del cliente
    expect(c.coord_fuente).toBe('ubicacion');
  });

  it('pero sí escribe cuando el lead no tenía nada', () => {
    store.setLeadCoords(leadB, 4.7110, -74.0721, 'geocodificado');
    expect(coordsDe(leadB).coord_fuente).toBe('geocodificado');
  });

  it('una ubicación compartida sí puede sobrescribir una coordenada geocodificada', () => {
    expect(store.setLeadCoordsDesdeUbicacion(leadB, 5.0689, -75.5174)).toBe(true);
    const c = coordsDe(leadB);
    expect(c.lat).toBeCloseTo(5.0689, 4);
    expect(c.coord_fuente).toBe('ubicacion');
  });

  it('rechaza coordenadas fuera de rango en vez de mandar el pin a otro planeta', () => {
    expect(store.setLeadCoordsDesdeUbicacion(leadB, 95, -75)).toBe(false);
    expect(store.setLeadCoordsDesdeUbicacion(leadB, 4, 200)).toBe(false);
    expect(store.setLeadCoordsDesdeUbicacion(leadB, null, undefined)).toBe(false);
    expect(coordsDe(leadB).lat).toBeCloseTo(5.0689, 4); // intacto
  });
});

describe('backfill desde mensajes de ubicación', () => {
  it('recupera el último pin del histórico e ignora los bodies corruptos', () => {
    const leadC = store.saveLead('+573001112223', 'Cliente C', 'hola').leadId;
    const leadD = store.saveLead('+573001112224', 'Cliente D', 'hola').leadId;
    const loc = (leadId, body) => store.saveMessage(leadId, '+57300', '+57301', body, 'incoming',
      { media_type: 'location', media_id: null, media_mime: null, media_filename: null });

    loc(leadC, JSON.stringify({ latitude: 4.00, longitude: -74.00 }));
    loc(leadC, JSON.stringify({ latitude: 4.50, longitude: -74.50 })); // el más reciente gana
    loc(leadD, '{esto no es json');

    const r = store.backfillCoordsDesdeUbicaciones(100);
    expect(r.aplicados).toBeGreaterThanOrEqual(1);
    expect(coordsDe(leadC).lat).toBeCloseTo(4.50, 4);
    expect(coordsDe(leadD).lat).toBeNull(); // el corrupto no escribe nada, y no revienta

    store.run('DELETE FROM leads WHERE id IN (?, ?)', [leadC, leadD]);
  });
});

describe('getLeadsConCoordenadas', () => {
  it('aísla por asesor: cada uno ve solo su cartera', () => {
    const deA = store.getLeadsConCoordenadas({ vendedorId: vendedorA });
    expect(deA.every(l => Number(l.assigned_to_id) === Number(vendedorA))).toBe(true);
    expect(deA.some(l => Number(l.id) === Number(leadB))).toBe(false);
  });

  it('el prefiltro por caja deja fuera lo que está lejos', () => {
    // Caja estrecha alrededor de Villavicencio (donde está leadA), lejos de Manizales.
    const caja = { minLat: 4.0, maxLat: 4.3, minLng: -73.9, maxLng: -73.6 };
    const ids = store.getLeadsConCoordenadas({ caja }).map(l => Number(l.id));
    expect(ids).toContain(Number(leadA));
    expect(ids).not.toContain(Number(leadB));
  });

  it('filtra por varias etapas a la vez', () => {
    store.setLeadEtiqueta(leadA, 'cita');
    store.setLeadEtiqueta(leadB, 'vendido');
    const ids = store.getLeadsConCoordenadas({ etiqueta: 'cita,vendido' }).map(l => Number(l.id));
    expect(ids).toEqual(expect.arrayContaining([Number(leadA), Number(leadB)]));
    const soloCita = store.getLeadsConCoordenadas({ etiqueta: 'cita' }).map(l => Number(l.id));
    expect(soloCita).not.toContain(Number(leadB));
  });

  it('expone coord_fuente para que el mapa distinga pin exacto de aproximado', () => {
    const l = store.getLeadsConCoordenadas({ vendedorId: vendedorA })[0];
    expect(l).toHaveProperty('coord_fuente');
  });
});
