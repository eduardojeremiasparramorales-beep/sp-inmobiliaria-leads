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

  // ambito clasifica quién tiene que actuar — lo consume services/wa-alertas.js para
  // decidir si esto merece despertar al dueño del negocio (solo 'cuenta' lo merece).
  it.each([190, 131031, 131042, 131048, 133010, 368])('código %i de cuenta cae en ambito "cuenta"', (code) => {
    expect(normalizeMetaError(errAxios({ code, message: 'x' })).ambito).toBe('cuenta');
  });

  it.each([131026, 131047, 131049, 131050, 131056, 130472])('código %i de contacto cae en ambito "contacto"', (code) => {
    expect(normalizeMetaError(errAxios({ code, message: 'x' })).ambito).toBe('contacto');
  });

  it.each([132001, 132007, 132015])('código %i de plantilla cae en ambito "plantilla"', (code) => {
    expect(normalizeMetaError(errAxios({ code, message: 'x' })).ambito).toBe('plantilla');
  });

  it.each([133004, 131000])('código %i pasajero cae en ambito "temporal"', (code) => {
    expect(normalizeMetaError(errAxios({ code, message: 'x' })).ambito).toBe('temporal');
  });

  it('el subcódigo 80007 también cae en temporal aunque el código no sea 4', () => {
    expect(normalizeMetaError(errAxios({ code: 999, error_subcode: 80007, message: 'x' })).ambito).toBe('temporal');
  });

  it('un código/subcódigo específico (200/10) gana sobre la entrada genérica del código', () => {
    const n = normalizeMetaError(errAxios({ code: 200, error_subcode: 10, message: 'x' }));
    expect(n.ambito).toBe('cuenta');
    expect(n.sugerencia).toContain('whatsapp_business_management');
  });

  // Este es el caso que causó el bug real: un código sin traducir devolvía
  // sugerencia:null, y quien lo consumía (describeWebhookError) caía al inglés de Meta.
  it('un código desconocido nunca deja sugerencia en null — cae a un texto en español con el código', () => {
    const n = normalizeMetaError(errAxios({ code: 999888, message: 'Some brand new English error' }));
    expect(n.sugerencia).toBeTruthy();
    expect(n.sugerencia).toContain('999888');
    expect(n.sugerencia).not.toContain('Some brand new');
    expect(n.ambito).toBe('desconocido');
  });

  it('sin respuesta de Meta (fallo de red) el ambito es "desconocido" y no revienta', () => {
    expect(normalizeMetaError({ message: 'socket hang up' }).ambito).toBe('desconocido');
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

  it('propaga ambito y codigo para que wa-alertas.js sepa si hay que avisar al dueño', () => {
    const d = describeWebhookError({ code: 131048, title: 'Rate limit', error_data: { details: 'x' } });
    expect(d.ambito).toBe('cuenta');
    expect(d.codigo).toBe(131048);
  });

  // El bug real de producción: un asesor recibió un push en inglés crudo
  // ("Message failed to send because your WhatsApp Business account...") porque el
  // código real (131031/131048, cuenta restringida) no estaba en la tabla y el
  // fallback devolvía humano = el texto de Meta sin traducir. Este test es el que
  // habría cazado ese bug antes de que llegara a producción.
  it('un código sin traducir nunca deja pasar inglés crudo en `humano`', () => {
    const d = describeWebhookError({
      code: 131099, title: 'Unknown',
      error_data: { details: 'Message failed to send because your WhatsApp Business account is restricted' },
    });
    expect(d.humano).not.toContain('Message failed');
    expect(d.humano).not.toContain('WhatsApp Business account');
    expect(d.humano).toContain('131099');
    // El inglés SÍ se conserva en `detalle` — va a BD/logs para poder depurar, nunca al asesor.
    expect(d.detalle).toContain('Message failed');
  });
});
