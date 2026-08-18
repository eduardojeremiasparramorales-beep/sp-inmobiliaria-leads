// Tests de src/services/wa-alertas.js — reemplaza al SSE 'sistema_alerta' que se
// emitía en whatsapp.js y webhook/messages.js pero no tenía ni un solo listener en
// todo el repo (código muerto: si el dueño no tenía el panel abierto en ese instante
// exacto, nunca se enteraba de que la cuenta había dejado de enviar).
// El proyecto es CJS puro y wa-alertas.js usa require() diferido (require('./notify')
// dentro de la función, no al top del archivo) para evitar el ciclo con whatsapp.js —
// vi.mock() no intercepta ese patrón de forma confiable en este setup, así que se
// espía directamente sobre el objeto exportado real (require() de Node cachea la
// misma instancia, así que el spy queda vigente cuando wa-alertas.js hace su propio
// require() del mismo módulo).
const notify = require('../../src/services/notify');
const logger = require('../../src/services/logger');
const { alertarCuenta, _ultima } = require('../../src/services/wa-alertas');

let notifySpy, logErrorSpy;
beforeEach(() => {
  _ultima.clear();
  notifySpy = vi.spyOn(notify, 'notify').mockResolvedValue(undefined);
  logErrorSpy = vi.spyOn(logger, 'logError').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('alertarCuenta', () => {
  it('avisa al dueño (vendedorId 0, push) y registra en el logger', async () => {
    const ok = await alertarCuenta({ codigo: 131031, humano: 'La cuenta está restringida', detalle: '[131031] restricted', origen: 'webhook' });
    expect(ok).toBe(true);
    expect(notifySpy).toHaveBeenCalledTimes(1);
    const call = notifySpy.mock.calls[0][0];
    expect(call.vendedorId).toBe(0);
    expect(call.push).toBe(true);
    expect(call.cuerpo).toContain('restringida');
    expect(logErrorSpy).toHaveBeenCalledTimes(1);
    expect(logErrorSpy.mock.calls[0][0]).toBe('whatsapp_cuenta');
  });

  it('el mismo código dos veces seguidas NO manda un segundo push (dedupe)', async () => {
    await alertarCuenta({ codigo: 131031, humano: 'x' });
    await alertarCuenta({ codigo: 131031, humano: 'x' });
    expect(notifySpy).toHaveBeenCalledTimes(1);
  });

  it('dos códigos distintos SÍ mandan dos push — no es un dedupe global', async () => {
    await alertarCuenta({ codigo: 131031, humano: 'cuenta restringida' });
    await alertarCuenta({ codigo: 190, humano: 'token expirado' });
    expect(notifySpy).toHaveBeenCalledTimes(2);
  });

  it('un fallo de notify() no revienta la llamada (best-effort)', async () => {
    notifySpy.mockRejectedValueOnce(new Error('push caído'));
    await expect(alertarCuenta({ codigo: 368, humano: 'x' })).resolves.toBe(true);
  });
});
