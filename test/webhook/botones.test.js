// Tests del parseo de respuestas a botones de WhatsApp (src/webhook/messages.js).
// Contexto: los tipos 'button' (quick-reply de plantilla) e 'interactive'
// (button_reply / list_reply) NO estaban contemplados en el webhook — el cliente
// pulsaba "Sigo interesado" y el mensaje se descartaba en silencio: ni el asesor ni el
// admin se enteraban, y el lead quedaba marcado como "sin responder" aunque la ventana
// de 24h sí se había reabierto del lado de Meta.
const { parseBotonRespuesta } = require('../../src/webhook/messages');

describe('parseBotonRespuesta', () => {
  it('lee el texto y el payload de un quick-reply de plantilla', () => {
    const msg = { type: 'button', button: { text: 'Sigo Interesado', payload: 'SIGO_INTERESADO' } };
    expect(parseBotonRespuesta(msg)).toEqual({ texto: 'Sigo Interesado', payload: 'SIGO_INTERESADO' });
  });

  it('cae al payload cuando el botón no trae texto visible', () => {
    const msg = { type: 'button', button: { payload: 'CONFIRMAR_CITA' } };
    expect(parseBotonRespuesta(msg)).toEqual({ texto: 'CONFIRMAR_CITA', payload: 'CONFIRMAR_CITA' });
  });

  it('lee un button_reply interactivo (title + id)', () => {
    const msg = { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'btn_precio', title: 'Ver precios' } } };
    expect(parseBotonRespuesta(msg)).toEqual({ texto: 'Ver precios', payload: 'btn_precio' });
  });

  it('lee un list_reply e incorpora la descripción al texto visible', () => {
    const msg = { type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'lote_12', title: 'Lote 12', description: '250 m² · Tocaima' } } };
    expect(parseBotonRespuesta(msg)).toEqual({ texto: 'Lote 12 — 250 m² · Tocaima', payload: 'lote_12' });
  });

  it('devuelve null si el payload de Meta no trae nada usable', () => {
    expect(parseBotonRespuesta({ type: 'button', button: {} })).toBeNull();
    expect(parseBotonRespuesta({ type: 'interactive', interactive: {} })).toBeNull();
    expect(parseBotonRespuesta({ type: 'interactive' })).toBeNull();
    expect(parseBotonRespuesta({ type: 'text', text: { body: 'hola' } })).toBeNull();
  });
});
