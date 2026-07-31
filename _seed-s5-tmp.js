const adapter = require('./src/db/adapter');
const store = require('./src/db/store');
const auth = require('./src/services/auth');

(async () => {
  await store.initDB();

  // Limpiar notificaciones previas y vendedor/usuario supervisor viejo
  adapter.run('DELETE FROM notifications');
  adapter.run('DELETE FROM usuarios WHERE id != 1');
  adapter.run('DELETE FROM vendedores WHERE id != 1');

  const vs = store.addVendedor('Sup Test', '+573006661133', 'activo');
  store.setVendedorPin(vs, auth.hashPassword('3333'));
  store.createUsuario(null, '+573006661133', 'Sup Test', 'supervisor', vs);

  const now = Date.now();

  const notifs = [
    { tipo: 'lead_asignado',      titulo: 'Lead asignado a Eduardo',      cuerpo: 'Cliente Uno (+573111222333) recibido de Meta Ads',   ts: now - 120000, leida: 1 },
    { tipo: 'escalamiento_critico', titulo: 'Lead sin respuesta > 30 min', cuerpo: 'Cliente Dos (+573111222444) no ha recibido respuesta', ts: now - 180000, leida: 0 },
    { tipo: 'mensaje_cliente',    titulo: 'Nuevo mensaje de cliente',     cuerpo: 'Cliente Tres (+573111222555): "¿El lote tiene escrituras?"', ts: now - 300000, leida: 1 },
    { tipo: 'respuesta_vendedor', titulo: 'Eduardo respondió a Cliente Tres', cuerpo: 'Eduardo Parra respondió a Cliente Tres en 4 minutos', ts: now - 360000, leida: 1 },
    { tipo: 'lead_reasignado',    titulo: 'Lead reasignado',              cuerpo: 'Cliente Uno reasignado de Eduardo a Sergio', ts: now - 600000, leida: 1 },
    { tipo: 'error_sistema',      titulo: 'WhatsApp API error',           cuerpo: 'Error 500 al enviar template a +573009998877', ts: now - 900000, leida: 1 },
    { tipo: 'seguimiento',        titulo: 'Seguimiento pendiente',        cuerpo: 'Cliente Cinco lleva +24h sin responder', ts: now - 3600000, leida: 1 },
    { tipo: 'programado_fallido',  titulo: 'Mensaje programado falló',   cuerpo: 'No se pudo enviar mensaje a Cliente Seis', ts: now - 7200000, leida: 1 },
  ];

  for (const n of notifs) {
    adapter.run(
      'INSERT INTO notifications (vendedor_id, tipo, titulo, cuerpo, lead_id, leida, created_at) VALUES (0, ?, ?, ?, NULL, ?, ?)',
      [n.tipo, n.titulo, n.cuerpo, n.leida, n.ts]
    );
  }

  adapter.saveDBIfNeeded();
  console.log('SEED OK vs=' + vs);
  process.exit(0);
})().catch(e => { console.error('SEED ERROR', e.message); process.exit(1); });