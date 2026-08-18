// Tests de src/db/store.js para las plantillas del vendedor (vendedor_templates),
// contra una BD SQLite aislada (mismo patrón que test/db/store.test.js).
//
// Cubre el IDOR real que había en producción: DELETE /api/mis-templates/:id llamaba
// store.deleteVendedorTemplate(id) sin comprobar dueño, y la query era
// `DELETE FROM vendedor_templates WHERE id = ?` sin `AND vendedor_id = ?` — cualquier
// asesor autenticado podía borrar la plantilla de otro adivinando el id.
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbAdapter = require('../../src/db/adapter');
const store = require('../../src/db/store');

let tmpDbPath;
let seq = 0;

function nuevoTenant() {
  seq += 1;
  const empresaId = 930000 + seq;
  tmpDbPath = path.join(os.tmpdir(), `sp-test-vt-${Date.now()}-${seq}.db`);
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

describe('deleteVendedorTemplate — IDOR cerrado', () => {
  it('con el vendedorId correcto, borra la plantilla', async () => {
    await conTenant(() => {
      const v1 = store.addVendedor('Eduardo Parra', '+573214617082', 'activo');
      store.addVendedorTemplate(v1, 'Saludo', 'Hola, ¿en qué te ayudo?');
      const [tpl] = store.getVendedorTemplates(v1);
      store.deleteVendedorTemplate(tpl.id, v1);
      expect(store.getVendedorTemplates(v1)).toHaveLength(0);
    });
  });

  it('con el vendedorId de OTRO asesor, no borra nada (antes sí lo hacía)', async () => {
    await conTenant(() => {
      const v1 = store.addVendedor('Eduardo Parra', '+573214617082', 'activo');
      const v2 = store.addVendedor('Sergio Parra', '+573224312518', 'activo');
      store.addVendedorTemplate(v1, 'Saludo', 'Hola, ¿en qué te ayudo?');
      const [tpl] = store.getVendedorTemplates(v1);

      store.deleteVendedorTemplate(tpl.id, v2); // v2 intenta borrar la plantilla de v1

      expect(store.getVendedorTemplates(v1)).toHaveLength(1); // sigue ahí
      expect(store.getVendedorTemplateById(tpl.id)).toBeTruthy();
    });
  });
});

describe('updateTemplate / updateVendedorTemplate — edición que antes no existía', () => {
  it('updateTemplate (global, admin) cambia título y cuerpo', async () => {
    await conTenant(() => {
      store.addTemplate('Saludo', 'Hola');
      const [tpl] = store.getTemplates();
      store.updateTemplate(tpl.id, 'Saludo editado', 'Hola, buenas');
      const actualizado = store.getTemplateById(tpl.id);
      expect(actualizado.titulo).toBe('Saludo editado');
      expect(actualizado.cuerpo).toBe('Hola, buenas');
    });
  });

  it('updateVendedorTemplate cambia título y cuerpo de una plantilla propia', async () => {
    await conTenant(() => {
      const v1 = store.addVendedor('Eduardo Parra', '+573214617082', 'activo');
      store.addVendedorTemplate(v1, 'Precio', 'Desde $50M');
      const [tpl] = store.getVendedorTemplates(v1);
      store.updateVendedorTemplate(tpl.id, 'Precio 2026', 'Desde $55M');
      const actualizado = store.getVendedorTemplateById(tpl.id);
      expect(actualizado.titulo).toBe('Precio 2026');
      expect(actualizado.cuerpo).toBe('Desde $55M');
    });
  });
});
