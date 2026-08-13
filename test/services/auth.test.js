// Tests de esAccesoGlobal (src/services/auth.js) — el criterio único que decide si
// una sesión puede ver/operar conversaciones y leads de cualquier asesor, no solo los
// propios. Antes de unificarlo, varios endpoints comprobaban `rol === 'admin'` a pelo
// y dejaban afuera a supervisor/jefe, causando 403 en el inbox y en Supervisión del
// panel móvil (ver docs/AUDITORIA_2026-08.md y el fix de public/m/app.js abSuperChat).
const { esAccesoGlobal } = require('../../src/services/auth');

const conRol = (rol) => ({ session: { rol } });

describe('esAccesoGlobal', () => {
  it('admin tiene acceso global', () => {
    expect(esAccesoGlobal(conRol('admin'))).toBe(true);
  });

  it('supervisor tiene acceso global', () => {
    expect(esAccesoGlobal(conRol('supervisor'))).toBe(true);
  });

  it('jefe tiene acceso global (además de trabajar sus propios leads)', () => {
    expect(esAccesoGlobal(conRol('jefe'))).toBe(true);
  });

  it('un vendedor normal NO tiene acceso global', () => {
    expect(esAccesoGlobal(conRol('vendedor'))).toBe(false);
  });

  it('sin rol en sesión, no hay acceso global', () => {
    expect(esAccesoGlobal({ session: {} })).toBe(false);
  });
});
