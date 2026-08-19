// Tests de la comparativa "Antes vs Ahora" (meta-ads.js comparePeriods/summarizeRange),
// la validación de la ruta /api/meta-ads/comparativa, y el ciclo de vida de las
// mejoras con seguimiento (meta-ads-mejoras.js sincronizar). Contra una BD SQLite
// aislada por tenant (mismo patrón que test/services/finance.test.js) — nunca contra
// data/sp-leads.db de producción. El acceso real a Meta se mockea vía global.fetch;
// nunca debe llegar tráfico de red real durante estos tests.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

const dbAdapter = require('../src/db/adapter');
const store = require('../src/db/store');
const metaAds = require('../src/services/meta-ads');
const metaAdsCache = require('../src/services/meta-ads-cache');
const advisor = require('../src/services/meta-ads-advisor');
const mejoras = require('../src/services/meta-ads-mejoras');
const metaAdsRouter = require('../src/routes/meta-ads');
const { DEFAULT_BASELINE } = require('../src/services/meta-ads-baseline');

let seq = 0;
function nuevoTenant() {
  seq += 1;
  const empresaId = 920000 + seq;
  const dbPath = path.join(os.tmpdir(), `sp-test-metaads-${Date.now()}-${seq}.db`);
  return { empresaId, dbPath };
}
async function conTenant(fn) {
  const ctx = nuevoTenant();
  return dbAdapter.tenantContext.run(ctx, async () => {
    await store.initDB();
    return fn();
  });
}

function jsonResponse(data) {
  return { ok: true, status: 200, json: async () => data };
}
function mockFetchByPath(handlers) {
  return async (urlStr) => {
    const url = new URL(urlStr);
    for (const h of handlers) {
      if (h.test(url)) return jsonResponse(h.respond(url));
    }
    throw new Error('URL no mockeada en el test: ' + urlStr);
  };
}

function seedLead(phone, adId, createdAtIso) {
  store.run(
    `INSERT INTO leads (customer_phone, ad_id, created_at, status) VALUES (?, ?, ?, 'nuevo')`,
    [phone, adId, createdAtIso]
  );
}

beforeAll(() => {
  process.env.META_MARKETING_API_TOKEN = 'test-token';
  process.env.META_AD_ACCOUNT_ID = 'act_test123';
});

afterAll(() => {
  delete process.env.META_MARKETING_API_TOKEN;
  delete process.env.META_AD_ACCOUNT_ID;
});

// ────────────────────────────────────────────────────────────────
// comparePeriods / summarizeRange — cálculo de deltas y guardas
// ────────────────────────────────────────────────────────────────
describe('comparePeriods — deltas y guardas de división por cero', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    metaAdsCache.clear();
  });

  it('calcula CPL Meta, CPL real CRM y los deltas vs el baseline correctamente', async () => {
    await conTenant(async () => {
      metaAdsCache.clear();
      vi.stubGlobal('fetch', mockFetchByPath([
        {
          test: (u) => u.pathname.endsWith('/insights'),
          respond: () => ({
            data: [{
              spend: '500000', impressions: '50000', clicks: '1000', reach: '20000',
              frequency: '2', ctr: '2.0', cpc: '500', cpm: '10000',
              actions: [{ action_type: 'onsite_conversion.messaging_first_reply', value: '100' }],
            }],
          }),
        },
        { test: (u) => u.pathname.endsWith('/ads'), respond: () => ({ data: [{ id: 'ad_1' }] }) },
      ]));

      for (let i = 0; i < 20; i++) {
        seedLead(`300000${String(i).padStart(4, '0')}`, 'ad_1', '2026-07-15T12:00:00.000Z');
      }

      const result = await metaAds.comparePeriods({ since: '2026-07-01', until: '2026-07-31', vs: 'baseline' });

      expect(result.actual.spend).toBe(500000);
      expect(result.actual.leadsMeta).toBe(100);
      expect(result.actual.cplMeta).toBeCloseTo(5000);
      expect(result.actual.leadsCRM).toBe(20);
      expect(result.actual.cplCRM).toBeCloseTo(25000);
      // CPL Meta (5000) muy por encima del baseline (972) -> veredicto 'mal'
      expect(result.veredictos.cpl).toBe('mal');
      expect(result.deltas.cplMeta).toBeCloseTo(((5000 - DEFAULT_BASELINE.cplMeta) / DEFAULT_BASELINE.cplMeta) * 100, 0);
      expect(result.referencia.esBaseline).toBe(true);
    });
  });

  it('cuando el periodo de referencia no tuvo gasto, el delta es null (no Infinity/NaN)', async () => {
    await conTenant(async () => {
      metaAdsCache.clear();
      vi.stubGlobal('fetch', async (urlStr) => {
        const url = new URL(urlStr);
        if (url.pathname.endsWith('/ads')) return jsonResponse({ data: [] });
        if (url.pathname.endsWith('/insights')) {
          const tr = JSON.parse(url.searchParams.get('time_range'));
          if (tr.since === '2026-07-01') {
            return jsonResponse({
              data: [{ spend: '300000', impressions: '10000', clicks: '200', reach: '5000', frequency: '1.5', ctr: '2.0', cpc: '1500', cpm: '30000', actions: [] }],
            });
          }
          return jsonResponse({ data: [] }); // periodo anterior: sin datos
        }
        throw new Error('URL no mockeada: ' + urlStr);
      });

      const result = await metaAds.comparePeriods({ since: '2026-07-01', until: '2026-07-31', vs: 'anterior' });

      expect(result.referencia.spend).toBe(0);
      expect(result.deltas.spend).toBeNull();
      // sin leads Meta -> cplMeta debe quedar en 0, nunca NaN/Infinity
      expect(result.actual.leadsMeta).toBe(0);
      expect(Number.isFinite(result.actual.cplMeta)).toBe(true);
      expect(result.actual.cplMeta).toBe(0);
      // sin leadsMeta no hay señal suficiente para veredicto de CPL
      expect(result.veredictos.cpl).toBeNull();
    });
  });
});

// ────────────────────────────────────────────────────────────────
// summarizeRange — offset Bogotá (UTC-5) en los bordes del rango
// ────────────────────────────────────────────────────────────────
describe('summarizeRange — offset Bogotá en los bordes del rango', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    metaAdsCache.clear();
  });

  it('cuenta leads del CRM usando el día calendario de Bogotá (UTC-5), no UTC', async () => {
    await conTenant(async () => {
      metaAdsCache.clear();
      vi.stubGlobal('fetch', mockFetchByPath([
        { test: (u) => u.pathname.endsWith('/insights'), respond: () => ({ data: [] }) },
        { test: (u) => u.pathname.endsWith('/ads'), respond: () => ({ data: [{ id: 'ad_1' }] }) },
      ]));

      seedLead('3100000001', 'ad_1', '2026-07-01T04:59:00.000Z'); // 2026-06-30 23:59 Bogotá -> FUERA
      seedLead('3100000002', 'ad_1', '2026-07-01T05:00:01.000Z'); // 2026-07-01 00:00:01 Bogotá -> DENTRO
      seedLead('3100000003', 'ad_1', '2026-07-02T04:59:00.000Z'); // 2026-07-01 23:59 Bogotá -> DENTRO
      seedLead('3100000004', 'ad_1', '2026-07-02T05:00:01.000Z'); // 2026-07-02 00:00:01 Bogotá -> FUERA

      const r = await metaAds.summarizeRange('2026-07-01', '2026-07-01');
      expect(r.leadsCRM).toBe(2);
    });
  });
});

// ────────────────────────────────────────────────────────────────
// Ruta REST — validación de rango
// ────────────────────────────────────────────────────────────────
describe('GET /api/meta-ads/comparativa — validación de la ruta', () => {
  let server, baseUrl;
  let isConfiguredSpy, comparePeriodsSpy;

  beforeAll(async () => {
    isConfiguredSpy = vi.spyOn(metaAds, 'isConfigured').mockReturnValue(true);
    comparePeriodsSpy = vi.spyOn(metaAds, 'comparePeriods').mockImplementation(async (opts) => ({ __opts: opts }));

    const app = express();
    app.use(express.json());
    app.use('/api/meta-ads', metaAdsRouter);
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/meta-ads`;
  });

  afterAll(async () => {
    isConfiguredSpy.mockRestore();
    comparePeriodsSpy.mockRestore();
    await new Promise((resolve) => server.close(resolve));
  });

  it('rechaza fechas con formato inválido', async () => {
    const res = await fetch(`${baseUrl}/comparativa?since=01-07-2026&until=2026-07-31&vs=baseline`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('fechas_invalidas');
  });

  it('rechaza un rango invertido (since > until)', async () => {
    const res = await fetch(`${baseUrl}/comparativa?since=2026-08-01&until=2026-07-01&vs=baseline`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('rango_invertido');
  });

  it('rechaza un rango de más de 365 días', async () => {
    const res = await fetch(`${baseUrl}/comparativa?since=2024-01-01&until=2026-06-01&vs=baseline`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('rango_muy_amplio');
  });

  it('acepta un rango válido y pasa vs=anterior tal cual a comparePeriods', async () => {
    const res = await fetch(`${baseUrl}/comparativa?since=2026-07-01&until=2026-07-31&vs=anterior`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.__opts).toEqual({ since: '2026-07-01', until: '2026-07-31', vs: 'anterior' });
  });

  it('un vs desconocido cae a "baseline" por defecto', async () => {
    const res = await fetch(`${baseUrl}/comparativa?since=2026-07-01&until=2026-07-31&vs=lo-que-sea`);
    const body = await res.json();
    expect(body.__opts.vs).toBe('baseline');
  });
});

// ────────────────────────────────────────────────────────────────
// meta-ads-mejoras.sincronizar — idempotencia y cierre automático
// ────────────────────────────────────────────────────────────────
describe('sincronizar — idempotencia y cierre automático', () => {
  let spies;

  function mockDeteccion({ campanaConCplAlto, conAudiencias }) {
    spies = [
      vi.spyOn(metaAds, 'isConfigured').mockReturnValue(true),
      vi.spyOn(advisor, 'getRecommendations').mockResolvedValue([]),
      vi.spyOn(metaAds, 'getPixelInfo').mockResolvedValue({ configured: true }),
      vi.spyOn(metaAds, 'getCustomAudiences').mockResolvedValue(conAudiencias ? [{ id: 'aud_1' }] : []),
      vi.spyOn(metaAds, 'getCampaigns').mockResolvedValue(campanaConCplAlto ? [{
        id: 'camp_1', name: 'Campaña Test', status: 'ACTIVE',
        metrics: { leadsMeta: 100, cplMeta: 5000, ctr: 2.0, cpm: 8000, spend: 500000, leads: 50 },
      }] : []),
    ];
  }

  afterEach(() => {
    (spies || []).forEach((s) => s.mockRestore());
    spies = null;
  });

  it('dos corridas seguidas con el mismo detectado no duplican filas', async () => {
    await conTenant(async () => {
      mockDeteccion({ campanaConCplAlto: true, conAudiencias: true });
      await mejoras.sincronizar();
      await mejoras.sincronizar();
      const rows = store.all(`SELECT * FROM meta_ads_mejoras WHERE tipo='cpl_sobre_baseline' AND campaign_id='camp_1'`);
      expect(rows.length).toBe(1);
      expect(rows[0].estado).toBe('pendiente');
    });
  });

  it('una mejora pendiente cuya condición desaparece queda resuelta con resuelta_at', async () => {
    await conTenant(async () => {
      mockDeteccion({ campanaConCplAlto: true, conAudiencias: true });
      await mejoras.sincronizar();
      let row = store.one(`SELECT * FROM meta_ads_mejoras WHERE tipo='cpl_sobre_baseline' AND campaign_id='camp_1'`);
      expect(row.estado).toBe('pendiente');
      expect(row.resuelta_at).toBeFalsy();

      // La condición desaparece: el CPL de la campaña vuelve a estar sano.
      metaAds.getCampaigns.mockResolvedValue([{
        id: 'camp_1', name: 'Campaña Test', status: 'ACTIVE',
        metrics: { leadsMeta: 100, cplMeta: 500, ctr: 2.0, cpm: 8000, spend: 50000, leads: 50 },
      }]);
      await mejoras.sincronizar();

      row = store.one(`SELECT * FROM meta_ads_mejoras WHERE tipo='cpl_sobre_baseline' AND campaign_id='camp_1'`);
      expect(row.estado).toBe('resuelta');
      expect(row.resuelta_at).toBeTruthy();
    });
  });

  it('detecta "sin_audiencias" cuando la cuenta no tiene ninguna, y no la detecta si sí las tiene', async () => {
    await conTenant(async () => {
      mockDeteccion({ campanaConCplAlto: false, conAudiencias: false });
      await mejoras.sincronizar();
      let row = store.one(`SELECT * FROM meta_ads_mejoras WHERE tipo='sin_audiencias'`);
      expect(row).toBeTruthy();
      expect(row.estado).toBe('pendiente');

      metaAds.getCustomAudiences.mockResolvedValue([{ id: 'aud_1' }]);
      await mejoras.sincronizar();
      row = store.one(`SELECT * FROM meta_ads_mejoras WHERE tipo='sin_audiencias'`);
      expect(row.estado).toBe('resuelta');
    });
  });

  it('una mejora descartada por el admin no se reabre sola aunque la condición siga presente', async () => {
    await conTenant(async () => {
      mockDeteccion({ campanaConCplAlto: true, conAudiencias: true });
      await mejoras.sincronizar();
      const row = store.one(`SELECT * FROM meta_ads_mejoras WHERE tipo='cpl_sobre_baseline' AND campaign_id='camp_1'`);
      mejoras.setEstado(row.id, 'descartada', 'ya lo revisamos, es intencional');

      // La condición sigue exactamente igual -> no debe reaparecer como pendiente.
      await mejoras.sincronizar();
      const after = store.one(`SELECT * FROM meta_ads_mejoras WHERE id=?`, [row.id]);
      expect(after.estado).toBe('descartada');
    });
  });
});
