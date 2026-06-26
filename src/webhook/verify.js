function handleVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.VERIFY_TOKEN || 'spInmobiliaria2026';

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('Webhook verificado correctamente por Meta');
    res.status(200).send(challenge);
  } else {
    console.warn('Intento de verificación fallido:', { mode, token });
    res.sendStatus(403);
  }
}

module.exports = { handleVerification };
