// Tests del helper de tiempo (src/utils/tiempo.js) — la convención unificada de la
// Fase 1.1 del plan de modernización (docs/AUDITORIA_2026-08.md 1.1/1.7). Este es
// exactamente el test que habría atrapado el bug de scripts/migrar-horario.js: sumó
// +5h en vez de restarlas al "corregir" UTC → Bogotá.
const { nowUTC, parseDbTimeUTC, formatBogota, SQL_NOW_UTC } = require('../../src/utils/tiempo');

describe('nowUTC', () => {
  it('devuelve un ISO 8601 con sufijo Z', () => {
    const s = nowUTC();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('es parseable y representa el instante actual (±1s)', () => {
    const before = Date.now();
    const s = nowUTC();
    const after = Date.now();
    const parsed = new Date(s).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(after + 1000);
  });
});

describe('parseDbTimeUTC', () => {
  it('parsea un valor con sufijo Z directo, sin desplazar la hora', () => {
    const d = parseDbTimeUTC('2026-08-11T15:00:00.000Z');
    expect(d.toISOString()).toBe('2026-08-11T15:00:00.000Z');
  });

  it('parsea un valor legado sin sufijo asumiéndolo UTC (no resta ni suma horas de más)', () => {
    // Este es el caso exacto que rompió migrar-horario.js: un texto "YYYY-MM-DD HH:MM:SS"
    // sin zona explícita. La convención elegida (ver auditoría 1.7) es asumir UTC —
    // coincide con el DEFAULT congelado de la mayoría de tablas de producción.
    const d = parseDbTimeUTC('2026-08-11 15:00:00');
    expect(d.toISOString()).toBe('2026-08-11T15:00:00.000Z');
  });

  it('parsea offsets explícitos distintos de Z', () => {
    const d = parseDbTimeUTC('2026-08-11T10:00:00-05:00');
    expect(d.toISOString()).toBe('2026-08-11T15:00:00.000Z');
  });

  it('devuelve null para valores vacíos o inválidos', () => {
    expect(parseDbTimeUTC(null)).toBeNull();
    expect(parseDbTimeUTC('')).toBeNull();
    expect(parseDbTimeUTC('no-es-una-fecha')).toBeNull();
  });
});

describe('formatBogota', () => {
  it('convierte UTC a Bogotá (UTC-5), no a UTC+5 — el bug exacto de migrar-horario.js', () => {
    // 15:00 UTC debe verse como 10:00 a.m. en Bogotá. Si alguna vez alguien reintroduce
    // el error de sumar en vez de restar, este test falla mostrando 20:00 (8:00 p.m.).
    const hora = formatBogota('2026-08-11T15:00:00.000Z', { hour: '2-digit', minute: '2-digit', hour12: false });
    expect(hora).toBe('10:00');
  });

  it('un mensaje de las 3pm Bogotá (20:00 UTC) se muestra como 15:00, nunca como 00:00 o 01:00', () => {
    // Caso real reportado: un mensaje de las 3pm se veía a las 12-1am — desfase de ~10h.
    const hora = formatBogota('2026-08-11T20:00:00.000Z', { hour: '2-digit', minute: '2-digit', hour12: false });
    expect(hora).toBe('15:00');
    expect(hora).not.toBe('00:00');
    expect(hora).not.toBe('01:00');
  });

  it('formatea legado (sin Z) igual que un timestamp UTC equivalente', () => {
    const conZ = formatBogota('2026-08-11T15:00:00.000Z');
    const sinZ = formatBogota('2026-08-11 15:00:00');
    expect(sinZ).toBe(conZ);
  });

  it('devuelve — para valores vacíos', () => {
    expect(formatBogota(null)).toBe('—');
    expect(formatBogota('')).toBe('—');
  });

  it('modo fecha y modo completo no lanzan y difieren del modo hora', () => {
    const hora = formatBogota('2026-08-11T15:00:00.000Z', { modo: 'hora' });
    const fecha = formatBogota('2026-08-11T15:00:00.000Z', { modo: 'fecha' });
    const completo = formatBogota('2026-08-11T15:00:00.000Z', { modo: 'completo' });
    expect(fecha).not.toBe(hora);
    expect(completo.length).toBeGreaterThan(hora.length);
  });
});

describe('SQL_NOW_UTC', () => {
  it('es la expresión strftime esperada, con sufijo Z explícito', () => {
    expect(SQL_NOW_UTC).toBe("strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  });
});
