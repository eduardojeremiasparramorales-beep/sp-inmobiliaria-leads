// Tests de los helpers que habilitan las acciones de CRM del motor de automatizaciones
// (src/services/workflow.js). Antes el motor solo sabía de mensajería: sus condiciones
// leían campos de la conversación y no del lead, así que no se podía condicionar por
// proyecto, temperatura o por el botón exacto que pulsó el cliente.
const { WorkflowEngine } = require('../../src/services/workflow');

const motor = new WorkflowEngine();
const lead = {
  id: 7, customer_name: 'Jeremías Parra', customer_phone: '+573214617082',
  proyecto: 'Bella Vista', ciudad: 'Tocaima', temperatura: 'caliente',
  assigned_to_nombre: 'Eduardo Parra', status: 'contactado', zona: 'cundinamarca',
};
const ctx = {
  conversation: { id: 1, channel: 'whatsapp', etiqueta: 'interesado', status: 'asignado', priority: 'alta' },
  customer: { name: 'Jeremías Parra' },
  message: { body: 'Sigo Interesado', buttonPayload: 'SIGO_INTERESADO' },
  lead,
};

describe('getFieldValue', () => {
  it('expone el payload del botón pulsado, no solo el texto visible', () => {
    expect(motor.getFieldValue('button_payload', ctx)).toBe('SIGO_INTERESADO');
    expect(motor.getFieldValue('body', ctx)).toBe('Sigo Interesado');
  });

  it('lee campos que viven en el lead, no en la conversación', () => {
    expect(motor.getFieldValue('proyecto', ctx)).toBe('Bella Vista');
    expect(motor.getFieldValue('ciudad', ctx)).toBe('Tocaima');
    expect(motor.getFieldValue('temperatura', ctx)).toBe('caliente');
    expect(motor.getFieldValue('asesor', ctx)).toBe('Eduardo Parra');
    expect(motor.getFieldValue('zona', ctx)).toBe('cundinamarca');
  });

  it('sigue leyendo los campos de la conversación', () => {
    expect(motor.getFieldValue('channel', ctx)).toBe('whatsapp');
    expect(motor.getFieldValue('etiqueta', ctx)).toBe('interesado');
    expect(motor.getFieldValue('priority', ctx)).toBe('alta');
  });

  it('devuelve cadena vacía —no undefined— para campos desconocidos o sin lead', () => {
    expect(motor.getFieldValue('inexistente', ctx)).toBe('');
    expect(motor.getFieldValue('proyecto', { conversation: {} })).toBe('');
  });
});

describe('interpolar', () => {
  it('reemplaza las variables del texto de una acción con datos del lead', () => {
    expect(motor.interpolar('Llamar a {{cliente}} por {{proyecto}}', lead))
      .toBe('Llamar a Jeremías Parra por Bella Vista');
  });

  it('tolera variables sin dato y textos vacíos', () => {
    expect(motor.interpolar('Hola {{cliente}}', {})).toBe('Hola el cliente');
    expect(motor.interpolar(null, lead)).toBe('');
  });
});

describe('exigirLead', () => {
  it('falla con un mensaje legible cuando el disparador no trae lead', () => {
    expect(() => motor.exigirLead({ conversation: {} }, 'crear_tarea'))
      .toThrow(/crear_tarea/);
  });

  it('devuelve el lead del contexto cuando sí existe', () => {
    expect(motor.exigirLead(ctx, 'crear_tarea')).toBe(lead);
  });
});

describe('aplicaAlDueno', () => {
  it('un flujo global de la empresa corre sobre cualquier lead', () => {
    expect(motor.aplicaAlDueno({ id: 1, vendedor_id: null }, ctx)).toBe(true);
  });

  it('un flujo de asesor solo corre sobre los leads asignados a él', () => {
    const conAsesor = { ...ctx, lead: { ...lead, assigned_to_id: 30 } };
    expect(motor.aplicaAlDueno({ id: 2, vendedor_id: 30 }, conAsesor)).toBe(true);
    expect(motor.aplicaAlDueno({ id: 2, vendedor_id: 31 }, conAsesor)).toBe(false);
  });

  it('sin lead ni asignación, un flujo de asesor no se dispara', () => {
    expect(motor.aplicaAlDueno({ id: 3, vendedor_id: 30 }, { conversation: {} })).toBe(false);
  });
});

describe('fechaRelativa', () => {
  it('produce una fecha futura en el formato que guardan tareas y citas', () => {
    const f = motor.fechaRelativa(2);
    expect(f).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(new Date(f.replace(' ', 'T') + 'Z').getTime()).toBeGreaterThan(Date.now());
  });

  it('cae a 24 horas cuando el parámetro no es un número válido', () => {
    const conBasura = new Date(motor.fechaRelativa('abc').replace(' ', 'T') + 'Z').getTime();
    const esperado = Date.now() + 24 * 3600000;
    expect(Math.abs(conBasura - esperado)).toBeLessThan(5000);
  });
});
