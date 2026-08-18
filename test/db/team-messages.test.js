// Tests de src/db/store.js para el chat interno (team_messages), contra una BD SQLite
// aislada (mismo patrón que test/db/store.test.js) — nunca contra data/sp-leads.db.
//
// Cubren el bug real que dejaba "no carga ningún chat" en /os/equipo-interno.html:
// src/index.js llamaba getTeamDirectMessages(0, withId, limit) con 3 argumentos, pero
// la firma real es (vendedorA, vendedorB, beforeId, limit) — el "limit" se colaba como
// "beforeId" y la query quedaba `AND tm.id < 100`, vaciando cualquier conversación con
// mensajes de id >= 100. Con menos de 100 mensajes de prueba nunca se hubiera notado.
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbAdapter = require('../../src/db/adapter');
const store = require('../../src/db/store');

let tmpDbPath;
let seq = 0;

function nuevoTenant() {
  seq += 1;
  const empresaId = 920000 + seq;
  tmpDbPath = path.join(os.tmpdir(), `sp-test-team-msgs-${Date.now()}-${seq}.db`);
  return { empresaId, dbPath: tmpDbPath };
}

async function conTenant(fn) {
  const ctx = nuevoTenant();
  return dbAdapter.tenantContext.run(ctx, async () => {
    await store.initDB();
    return fn();
  });
}

afterEach(() => {
  try { if (tmpDbPath && fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath); } catch (e) {}
});

describe('getTeamDirectMessages — bug de argumentos desalineados', () => {
  it('con más de 100 mensajes en team_messages, un DM sigue devolviendo sus mensajes (antes se vaciaba)', async () => {
    await conTenant(() => {
      // Relleno de mensajes en el canal general para empujar los ids del DM por encima
      // de 100 — así es como se manifestaba el bug en producción, nunca en pruebas con
      // pocos mensajes.
      for (let i = 0; i < 105; i++) store.saveTeamMessage(0, 'Admin', `relleno ${i}`);
      store.saveTeamMessage(0, 'Admin', 'Hola asesor', { toVendedorId: 7 });
      store.saveTeamMessage(7, 'Eduardo', 'Hola admin', { toVendedorId: 0 });

      // Llamada correcta (4 args, beforeId=null): así debe invocarse desde el endpoint.
      const dm = store.getTeamDirectMessages(0, 7, null, 100);
      expect(dm.length).toBe(2);
      expect(dm.map(m => m.body)).toEqual(['Hola asesor', 'Hola admin']);
    });
  });

  it('demuestra el bug original: pasar el limit en la posición de beforeId vacía el DM', async () => {
    await conTenant(() => {
      for (let i = 0; i < 105; i++) store.saveTeamMessage(0, 'Admin', `relleno ${i}`);
      store.saveTeamMessage(0, 'Admin', 'Hola asesor', { toVendedorId: 7 });
      store.saveTeamMessage(7, 'Eduardo', 'Hola admin', { toVendedorId: 0 });

      // Firma vieja y rota: getTeamDirectMessages(0, withId, limit) — limit=100 entra
      // como beforeId, y como los mensajes del DM tienen id > 100, la query los excluye.
      const roto = store.getTeamDirectMessages(0, 7, 100);
      expect(roto).toEqual([]);
    });
  });

  it('funciona en ambos sentidos del par sin importar quién sea "a" y quién "b"', async () => {
    await conTenant(() => {
      store.saveTeamMessage(3, 'Asesor 3', 'Oye', { toVendedorId: 9 });
      store.saveTeamMessage(9, 'Asesor 9', 'Dime', { toVendedorId: 3 });
      expect(store.getTeamDirectMessages(3, 9, null, 50)).toHaveLength(2);
      expect(store.getTeamDirectMessages(9, 3, null, 50)).toHaveLength(2);
    });
  });
});

describe('getAdminTeamConversations — DMs entre dos asesores y badges de no leídos', () => {
  it('incluye conversaciones asesor↔asesor, no solo admin↔asesor', async () => {
    await conTenant(() => {
      store.saveTeamMessage(3, 'Asesor 3', 'Nos vemos en el lote', { toVendedorId: 9 });
      const convs = store.getAdminTeamConversations();
      const par = convs.dms.find(d => d.pair.includes(3) && d.pair.includes(9));
      expect(par).toBeTruthy();
      expect(par.last_message).toBe('Nos vemos en el lote');
    });
  });

  it('el badge del canal general cuenta no leídos del admin, no el histórico completo', async () => {
    await conTenant(() => {
      for (let i = 0; i < 5; i++) store.saveTeamMessage(3, 'Asesor 3', `msg ${i}`);
      let convs = store.getAdminTeamConversations();
      expect(convs.general.msg_count).toBe(5); // nada marcado leído todavía

      const ultimo = store.one('SELECT MAX(id) as id FROM team_messages WHERE to_vendedor_id IS NULL');
      store.markTeamGeneralRead(0, ultimo.id);
      convs = store.getAdminTeamConversations();
      expect(convs.general.msg_count).toBe(0); // admin ya leyó todo

      store.saveTeamMessage(3, 'Asesor 3', 'uno nuevo');
      convs = store.getAdminTeamConversations();
      expect(convs.general.msg_count).toBe(1); // solo el que falta por leer
    });
  });

  it('el badge de un DM admin↔asesor cuenta solo lo no leído por el admin', async () => {
    await conTenant(() => {
      store.saveTeamMessage(3, 'Asesor 3', 'primero', { toVendedorId: 0 });
      store.saveTeamMessage(3, 'Asesor 3', 'segundo', { toVendedorId: 0 });
      let convs = store.getAdminTeamConversations();
      let par = convs.dms.find(d => d.pair.includes(3));
      expect(par.count).toBe(2);

      store.markTeamDirectRead(0, 3); // el admin lee su bandeja con el asesor 3
      convs = store.getAdminTeamConversations();
      par = convs.dms.find(d => d.pair.includes(3));
      expect(par.count).toBe(0);
    });
  });

  it('un DM asesor↔asesor no aporta al badge del admin (no es destinatario)', async () => {
    await conTenant(() => {
      store.saveTeamMessage(3, 'Asesor 3', 'hola', { toVendedorId: 9 });
      store.saveTeamMessage(9, 'Asesor 9', 'hola de vuelta', { toVendedorId: 3 });
      const convs = store.getAdminTeamConversations();
      const par = convs.dms.find(d => d.pair.includes(3) && d.pair.includes(9));
      expect(par.count).toBe(0);
    });
  });
});
