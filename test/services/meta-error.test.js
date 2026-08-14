// Tests de describeMetaError (src/services/wa-templates.js). Contexto: las campañas
// masivas guardaban err.message de axios — siempre "Request failed with status code
// 400" — y el motivo real de Meta (error_user_msg, código y subcódigo) se perdía, así
// que en el panel solo se veía un FAILED sin explicación.
const { describeMetaError, normalizeMetaError } = require('../../src/services/wa-templates');

// Error de axios tal como llega: message inútil, el detalle real en response.data.error.
const errAxios = (error) => ({
  message: 'Request failed with status code 400',
  response: { status: 400, data: { error } },
});

describe('describeMetaError', () => {
  it('extrae código y mensaje de usuario de Meta en vez del message de axios', () => {
    const d = describeMetaError(errAxios({ code: 132007, message: 'Param invalid', error_user_msg: 'El parámetro está vacío' }));
    expect(d).toContain('132007');
    expect(d).toContain('El parámetro está vacío');
    expect(d).not.toContain('Request failed');
  });

  it('agrega la sugerencia accionable para una variable vacía (132007)', () => {
    expect(describeMetaError(errAxios({ code: 132007, message: 'x' }))).toContain('vacía');
  });

  it('incluye el subcódigo cuando Meta lo manda', () => {
    expect(describeMetaError(errAxios({ code: 100, error_subcode: 2388024, message: 'dup' }))).toContain('100/2388024');
  });

  it('degrada al message del error cuando no hay respuesta de Meta (fallo de red)', () => {
    expect(describeMetaError({ message: 'socket hang up' })).toContain('socket hang up');
  });

  it('nunca devuelve un detalle desmedido para guardar en la columna', () => {
    const largo = 'x'.repeat(2000);
    expect(describeMetaError(errAxios({ code: 1, message: largo })).length).toBeLessThanOrEqual(400);
  });
});

describe('normalizeMetaError', () => {
  it('reconoce la ventana de 24h cerrada (131047)', () => {
    const n = normalizeMetaError(errAxios({ code: 131047, message: 'Re-engagement message' }));
    expect(n.codigo).toBe(131047);
    expect(n.sugerencia).toContain('plantilla');
  });
});
