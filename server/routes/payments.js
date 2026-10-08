const express = require('express');
const db = require('../db');
const { verifyIpnSignature } = require('../services/crypto');
const { notifyPaymentReceived } = require('../services/telegram');

const router = express.Router();

// Webhook принимает raw body, т.к. подпись считается от сырого JSON.
router.post(
  '/crypto',
  express.raw({ type: '*/*', limit: '200kb' }),
  (req, res) => {
    const signature = req.header('x-nowpayments-sig');
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

    if (!raw) {
      console.warn('[webhook] empty body');
      return res.status(400).send('Bad Request');
    }

    if (!verifyIpnSignature(raw, signature)) {
      console.warn('[webhook] invalid signature');
      return res.status(401).send('Invalid signature');
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).send('Bad JSON');
    }

    const { order_id, payment_status, price_amount, pay_amount, pay_currency } = payload || {};

    console.log('[webhook] crypto event:', {
      order_id,
      payment_status,
      price_amount,
      pay_amount,
      pay_currency,
    });

    if (!order_id) return res.status(200).send('ok');

    const orderIdNum = Number(order_id);
    if (!Number.isInteger(orderIdNum) || orderIdNum <= 0) {
      return res.status(200).send('ok');
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderIdNum);
    if (!order) {
      console.warn('[webhook] order not found:', orderIdNum);
      return res.status(200).send('ok');
    }

    // NOWPayments присылает статусы: waiting, confirming, confirmed, sending,
    // partially_paid, finished, failed, refunded, expired.
    const paidStatuses = new Set(['confirmed', 'finished']);

    if (paidStatuses.has(payment_status) && order.status !== 'paid') {
      db.prepare(
        `UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(order.id);

      const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
      notifyPaymentReceived(updated).catch((e) =>
        console.error('[webhook] notifyPaymentReceived error:', e)
      );
    }

    res.status(200).send('ok');
  }
);

module.exports = router;