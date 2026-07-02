/**
 * 💳 Integración Stripe/Mercado Pago
 * Procesar pagos dentro del CRM (depósitos, anticipo)
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Crear intención de pago
 */
async function createPaymentIntent(leadId, amount, description) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return { error: 'Stripe no configurado' };
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // convertir a centavos
      currency: 'cop',
      description,
      metadata: { leadId, type: 'lead_payment' },
    });

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount,
    };
  } catch (err) {
    console.error('Error creating payment intent:', err.message);
    return { error: err.message };
  }
}

/**
 * Procesar pago (después que cliente confirme en frontend)
 */
async function confirmPayment(paymentIntentId) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      return {
        success: true,
        paymentIntentId,
        status: 'succeeded',
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        receiptUrl: paymentIntent.charges.data[0]?.receipt_url,
      };
    }

    return {
      success: false,
      status: paymentIntent.status,
      message: 'Pago en proceso o fallido',
    };
  } catch (err) {
    console.error('Error confirming payment:', err.message);
    return { error: err.message };
  }
}

/**
 * Crear factura recurrente (cuotas)
 */
async function createRecurringPayment(customerId, amount, description, intervalDays) {
  try {
    // Crear plan de precio
    const product = await stripe.products.create({
      name: description,
      type: 'service',
    });

    const price = await stripe.prices.create({
      product: product.id,
      amount: Math.round(amount * 100),
      currency: 'cop',
      recurring: {
        interval: 'day',
        interval_count: intervalDays,
      },
    });

    // Crear suscripción
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    return {
      success: true,
      subscriptionId: subscription.id,
      priceId: price.id,
      status: subscription.status,
    };
  } catch (err) {
    console.error('Error creating recurring payment:', err.message);
    return { error: err.message };
  }
}

/**
 * Obtener historial de pagos de un cliente
 */
async function getPaymentHistory(customerId) {
  try {
    const charges = await stripe.charges.list({
      customer: customerId,
      limit: 100,
    });

    return {
      customerId,
      totalCharges: charges.data.length,
      charges: charges.data.map(c => ({
        chargeId: c.id,
        amount: c.amount / 100,
        currency: c.currency,
        status: c.status,
        date: new Date(c.created * 1000).toISOString(),
        description: c.description,
      })),
    };
  } catch (err) {
    console.error('Error getting payment history:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  createPaymentIntent,
  confirmPayment,
  createRecurringPayment,
  getPaymentHistory,
};
