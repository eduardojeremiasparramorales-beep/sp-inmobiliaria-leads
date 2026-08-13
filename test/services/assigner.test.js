// Tests de la distribución inteligente de leads (src/services/assigner.js). Cubre
// pickVendedorInteligente: función pura, no toca la BD directamente — solo entra al
// camino de "especialista por hints" cuando hay ciudad/proyecto/origen y más de un
// candidato dentro de la tolerancia de carga; si no, cae al de menor carga.
const { pickVendedorInteligente } = require('../../src/services/assigner');

const v = (id, leads_activos) => ({ id, nombre: `Vendedor ${id}`, leads_activos });

describe('pickVendedorInteligente', () => {
  it('devuelve null si no hay vendedores activos', () => {
    expect(pickVendedorInteligente([], {})).toBeNull();
    expect(pickVendedorInteligente(null, {})).toBeNull();
  });

  it('con un solo activo, lo devuelve sin más', () => {
    const solo = v(1, 5);
    expect(pickVendedorInteligente([solo], { ciudad: 'Tocaima' })).toBe(solo);
  });

  it('sin hints (ciudad/proyecto/origen), reparte por menor carga — el primero de la lista', () => {
    // getVendedoresActivos() ya entrega la lista ordenada ASC por leads_activos, así
    // que "el primero" es el round-robin real.
    const activos = [v(1, 2), v(2, 5), v(3, 8)];
    expect(pickVendedorInteligente(activos, {})).toBe(activos[0]);
    expect(pickVendedorInteligente(activos, undefined)).toBe(activos[0]);
  });

  it('fuera de la tolerancia de carga (>2), ignora la especialización y respeta el reparto por carga', () => {
    const activos = [v(1, 0), v(2, 10)]; // diferencia de 10, muy por encima de TOLERANCIA_CARGA=2
    expect(pickVendedorInteligente(activos, { ciudad: 'Tocaima' })).toBe(activos[0]);
  });
});
