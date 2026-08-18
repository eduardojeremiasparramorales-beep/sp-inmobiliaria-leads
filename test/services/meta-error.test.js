// Tests de describeMetaError (src/services/wa-templates.js). Contexto: las campañas
// masivas guardaban err.message de axios — siempre "Request failed with status code
// 400" — y el motivo real de Meta (error_user_msg, código y subcódigo) se perdía, así
// que en el panel solo se veía un FAILED sin explicación.
const { describeMetaError, normalizeMetaError, describeWebhookError } = require('../../src/services/wa-templates');

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

// Los fallos que llegan por webhook (statuses[].errors[0]) traen en `title` una etiqueta
// opaca — "Re-engagement message" — y el motivo real en error_data.details. El panel
// mostraba el title, así que el asesor solo veía "[131047] Re-engagement message".
describe('describeWebhookError', () => {
  const errWebhook = {
    code: 131047,
    title: 'Re-engagement message',
    error_data: { details: 'Message failed to send because more than 24 hours have passed since the customer last replied to this number.' },
  };

  it('usa error_data.details en vez del title opaco', () => {
    const d = describeWebhookError(errWebhook);
    expect(d.detalle).toContain('24 hours');
    expect(d.detalle).toContain('131047');
  });

  it('da al asesor una frase accionable en español, sin jerga de Meta', () => {
    const d = describeWebhookError(errWebhook);
    expect(d.humano).toContain('plantilla');
    expect(d.humano).not.toContain('Re-engagement');
  });

  it('degrada al title cuando Meta no manda details', () => {
    const d = describeWebhookError({ code: 131026, title: 'Message undeliverable' });
    expect(d.detalle).toContain('131026');
    expect(d.humano).toContain('WhatsApp');
  });

  it('devuelve null si no hay error', () => {
    expect(describeWebhookError(null)).toBeNull();
  });
});
