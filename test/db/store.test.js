// Tests de store.js contra una BD SQLite aislada en un directorio temporal — nunca
// contra data/sp-leads.db de producción. Usa el mismo patrón multi-tenant que ya trae
// adapter.js (tenantContext.run) para dirigir cada conexión a su propio archivo.
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbAdapter = require('../../src/db/adapter');
const store = require('../../src/db/store');

let tmpDbPath;
let empresaId;
let seq = 0;

// Cada test corre en su propio "tenant" (empresaId + archivo temporal distinto) para
// no compartir estado entre tests — más simple y robusto que limpiar tablas a mano.
function nuevoTenant() {
  seq += 1;
  empresaId = 900000 + seq;
  tmpDbPath = path.join(os.tmpdir(), `sp-test-store-${Date.now()}-${seq}.db`);
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

describe('isWindowOpen / getWindowExpiresAt (ventana de 24h de WhatsApp)', () => {
  it('sin mensajes del cliente, la ventana está cerrada y no hay expiración', async () => {
    await conTenant(() => {
      const { leadId } = store.saveLead('573000000010', 'Sin mensajes', 'primer mensaje');
      // saveLead ya cuenta como "mensaje del cliente" (fija last_customer_message_at),
      // así que para probar el caso "sin actividad" hay que limpiarlo aparte.
      const adapter = require('../../src/db/adapter');
      adapter.run('UPDATE leads SET last_customer_message_at = NULL WHERE id = ?', [leadId]);
      expect(store.isWindowOpen(leadId)).toBe(false);
      expect(store.getWindowExpiresAt(leadId)).toBeNull();
    });
  });

  it('con un mensaje reciente del cliente, la ventana está abierta y expira en ~24h', async () => {
    await conTenant(() => {
      const { leadId } = store.saveLead('573000000011', 'Recién escribió', 'hola');
      expect(store.isWindowOpen(leadId)).toBe(true);
      const expira = store.getWindowExpiresAt(leadId);
      const horas = (expira.getTime() - Date.now()) / 36e5;
      expect(horas).toBeGreaterThan(23.9);
      expect(horas).toBeLessThanOrEqual(24.0);
    });
  });

  it('con el último mensaje de hace más de 24h, la ventana está cerrada', async () => {
    await conTenant(() => {
      const { leadId } = store.saveLead('573000000012', 'Escribió ayer', 'hola');
      const adapter = require('../../src/db/adapter');
      const hace25h = new Date(Date.now() - 25 * 36e5).toISOString();
      adapter.run('UPDATE leads SET last_customer_message_at = ? WHERE id = ?', [hace25h, leadId]);
      expect(store.isWindowOpen(leadId)).toBe(false);
    });
  });

  it('con el último mensaje de hace 23h, la ventana sigue abierta (al filo)', async () => {
    await conTenant(() => {
      const { leadId } = store.saveLead('573000000013', 'Al filo', 'hola');
      const adapter = require('../../src/db/adapter');
      const hace23h = new Date(Date.now() - 23 * 36e5).toISOString();
      adapter.run('UPDATE leads SET last_customer_message_at = ? WHERE id = ?', [hace23h, leadId]);
      expect(store.isWindowOpen(leadId)).toBe(true);
    });
  });
});

describe('saveLead — regla anti-duplicados (CLAUDE.md: sin clientes cruzados)', () => {
  it('el mismo teléfono no crea dos leads activos — reutiliza el existente', async () => {
    await conTenant(() => {
      const primero = store.saveLead('573000000020', 'Cliente Uno', 'primer mensaje');
      expect(primero.isNew).toBe(true);
      const segundo = store.saveLead('573000000020', 'Cliente Uno (otro nombre)', 'segundo mensaje');
      expect(segundo.isNew).toBe(false);
      expect(segundo.leadId).toBe(primero.leadId);

      const adapter = require('../../src/db/adapter');
      const count = adapter.one(
        "SELECT COUNT(*) AS n FROM leads WHERE customer_phone LIKE ?",
        ['%573000000020%']
      );
      expect(count.n).toBe(1);
    });
  });

  it('reabre un lead cerrado en vez de crear uno nuevo', async () => {
    await conTenant(() => {
      const { leadId } = store.saveLead('573000000021', 'Cliente Cerrado', 'hola');
      store.updateLeadStatus(leadId, 'cerrado');

      const reabierto = store.saveLead('573000000021', 'Cliente Cerrado', 'volvió a escribir');
      expect(reabierto.leadId).toBe(leadId);
      expect(reabierto.wasClosed).toBe(true);

      const lead = store.getLeadById(leadId);
      expect(lead.status).not.toBe('cerrado');
    });
  });

  it('teléfonos distintos crean leads distintos', async () => {
    await conTenant(() => {
      const a = store.saveLead('573000000022', 'Cliente A', 'hola');
      const b = store.saveLead('573000000023', 'Cliente B', 'hola');
      expect(a.leadId).not.toBe(b.leadId);
    });
  });
});
