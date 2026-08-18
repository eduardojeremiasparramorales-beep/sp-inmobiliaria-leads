// Cola de mensajes que esperan a que se reabra la ventana de 24h de WhatsApp.
//
// El bug que fija este archivo: cuando un asesor escribía a un lead con más de 24 h sin
// responder, Meta rechazaba el texto libre (131047) y el CRM mandaba la plantilla de
// reactivación, encolando el texto. Pero (a) guardaba el wamid DE LA PLANTILLA en la fila
// del texto del asesor, así que el webhook de fallo marcaba como "no entregado" el mensaje
// equivocado, y (b) el flush vaciaba la cola ANTES de enviar, de modo que un fallo de red
// borraba el mensaje del asesor para siempre y sin avisar a nadie.
const store = require('../../src/db/store');

let vendedorId, leadId;
const TEL = '+573001119999';

beforeAll(async () => {
  await store.initDB();
  store.createSchema();
  vendedorId = store.addVendedor('Asesor Cola', '+573009991010');
  leadId = store.saveLead(TEL, 'Cliente Cola', 'hola').leadId;
  store.run('UPDATE leads SET assigned_to_id = ? WHERE id = ?', [vendedorId, leadId]);
});

afterEach(() => {
  store.clearPendingOutbound(TEL);
  store.run('DELETE FROM messages WHERE lead_id = ?', [leadId]);
});

afterAll(() => {
  try { store.run('DELETE FROM leads WHERE id = ?', [leadId]); } catch (e) {}
  try { store.deleteVendedor(vendedorId); } catch (e) {}
});

describe('cola de mensajes en espera', () => {
  it('vincula la fila encolada con la burbuja pendiente del chat', () => {
    const pendingId = store.queuePendingOutbound(leadId, TEL, 'Hola, ¿sigue interesado?');
    const msgId = store.saveMessage(leadId, 'panel', TEL, 'Hola, ¿sigue interesado?', 'outgoing', null, null, null, 'pending');
    store.attachPendingMessage(pendingId, msgId);

    const [fila] = store.getPendingOutbound(TEL);
    expect(fila.message_id).toBe(msgId);
    // Sin wamid: el texto no salió a Meta, así que ningún webhook puede atribuirle un fallo.
    expect(store.one('SELECT wamid, status FROM messages WHERE id = ?', [msgId])).toMatchObject({ wamid: null, status: 'pending' });
  });

  it('marca la burbuja como enviada al vaciarse, sin crear una segunda', () => {
    const pendingId = store.queuePendingOutbound(leadId, TEL, 'Mensaje en espera');
    const msgId = store.saveMessage(leadId, 'panel', TEL, 'Mensaje en espera', 'outgoing', null, null, null, 'pending');
    store.attachPendingMessage(pendingId, msgId);

    store.markMessageSent(msgId, 'wamid_real_del_texto');
    store.deletePendingOutbound(pendingId);

    expect(store.getPendingOutbound(TEL)).toHaveLength(0);
    expect(store.one('SELECT wamid, status FROM messages WHERE id = ?', [msgId])).toMatchObject({ wamid: 'wamid_real_del_texto', status: 'sent' });
    // Una sola burbuja: antes el flush insertaba otra fila y el asesor veía el texto dos veces.
    expect(store.all('SELECT id FROM messages WHERE lead_id = ?', [leadId])).toHaveLength(1);
  });

  it('conserva el mensaje en la cola cuando el reenvío falla', () => {
    const pendingId = store.queuePendingOutbound(leadId, TEL, 'No se pudo reenviar');
    const msgId = store.saveMessage(leadId, 'panel', TEL, 'No se pudo reenviar', 'outgoing', null, null, null, 'pending');
    store.attachPendingMessage(pendingId, msgId);

    // Lo que hace el catch del flush: contar el intento y dejar el error a la vista.
    store.bumpPendingOutboundIntento(pendingId);
    store.setMessageErrorById(msgId, '[131047] Ventana de 24h cerrada');

    const [fila] = store.getPendingOutbound(TEL);
    expect(fila).toBeDefined(); // el mensaje del asesor NO se perdió
    expect(fila.intentos).toBe(1);
    expect(store.one('SELECT error_detail FROM messages WHERE id = ?', [msgId]).error_detail).toContain('131047');
  });

  it('borra solo la fila que ya salió, no la cola entera', () => {
    const a = store.queuePendingOutbound(leadId, TEL, 'Primero');
    store.queuePendingOutbound(leadId, TEL, 'Segundo');

    store.deletePendingOutbound(a);

    const restantes = store.getPendingOutbound(TEL);
    expect(restantes).toHaveLength(1);
    expect(restantes[0].body).toBe('Segundo');
  });
});
