const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { notifyNewOrder } = require('../services/telegram');
const cryptoService = require('../services/crypto');

const router = express.Router();

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const quantitySchema = z
  .number()
  .positive('Quantity must be positive')
  .refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9, {
    message: 'Precision is limited to 0.1 g',
  });

const createOrderSchema = z.object({
  city_id: z.number().int().positive(),
  district_id: z.number().int().positive(),
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        quantity_grams: quantitySchema,
      })
    )
    .min(1, 'Cart is empty')
    .max(50, 'Too many items'),
});

function round2(x) {
  return Math.round(x * 100) / 100;
}

router.post('/', requireAuth, orderLimiter, async (req, res, next) => {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid data', details: parsed.error.issues });
    }
    const { city_id, district_id, items } = parsed.data;

    const city = db
      .prepare('SELECT id, name FROM cities WHERE id = ? AND is_active = 1')
      .get(city_id);
    if (!city) return res.status(400).json({ error: 'City not found' });

    const district = db
      .prepare('SELECT id, name, city_id FROM districts WHERE id = ? AND is_active = 1')
      .get(district_id);
    if (!district || district.city_id !== city_id) {
      return res.status(400).json({ error: 'District not found in the selected city' });
    }

    const user = db
      .prepare('SELECT id, username FROM users WHERE id = ?')
      .get(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const productIds = [...new Set(items.map((i) => i.product_id))];
    const placeholders = productIds.map(() => '?').join(',');
    const products = db
      .prepare(
        `SELECT id, name, price_per_gram, min_grams, is_active
         FROM products WHERE id IN (${placeholders})`
      )
      .all(...productIds);

    const productMap = new Map(products.map((p) => [p.id, p]));

    let total = 0;
    const enrichedItems = [];

    for (const item of items) {
      const p = productMap.get(item.product_id);
      if (!p || !p.is_active) {
        return res.status(400).json({ error: `Product ${item.product_id} is unavailable` });
      }
      if (item.quantity_grams + 1e-9 < Number(p.min_grams)) {
        return res.status(400).json({
          error: `Minimum quantity for "${p.name}" is ${p.min_grams} g`,
        });
      }
      if (item.quantity_grams > 100000) {
        return res.status(400).json({ error: 'Quantity is too large' });
      }

      const amount = round2(Number(p.price_per_gram) * item.quantity_grams);
      total += amount;
      enrichedItems.push({
        product_id: p.id,
        product_name_snapshot: p.name,
        price_per_gram_snapshot: Number(p.price_per_gram),
        quantity_grams: item.quantity_grams,
        amount,
      });
    }
    total = round2(total);

    const tx = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO orders (user_id, city_id, district_id, total_amount, status)
           VALUES (?, ?, ?, ?, 'unpaid')`
        )
        .run(user.id, city.id, district.id, total);
      const orderId = info.lastInsertRowid;

      const insertItem = db.prepare(
        `INSERT INTO order_items
          (order_id, product_id, product_name_snapshot, price_per_gram_snapshot, quantity_grams, amount)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const it of enrichedItems) {
        insertItem.run(
          orderId,
          it.product_id,
          it.product_name_snapshot,
          it.price_per_gram_snapshot,
          it.quantity_grams,
          it.amount
        );
      }
      return orderId;
    });

    const orderId = tx();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

    notifyNewOrder(order, enrichedItems, user, city, district).catch((e) =>
      console.error('[orders] notifyNewOrder error:', e)
    );

    res.status(201).json({
      id: order.id,
      total_amount: order.total_amount,
      status: order.status,
      items: enrichedItems,
      city: city.name,
      district: district.name,
      created_at: order.created_at,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/my', requireAuth, (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.id, o.total_amount, o.status, o.payment_method, o.created_at, o.updated_at,
              o.crypto_network_id, o.crypto_network_label, o.crypto_address, o.crypto_amount,
              c.name AS city_name, d.name AS district_name
       FROM orders o
       JOIN cities c ON c.id = o.city_id
       JOIN districts d ON d.id = o.district_id
       WHERE o.user_id = ?
       ORDER BY o.id DESC`
    )
    .all(req.user.userId);

  const getItems = db.prepare(
    `SELECT product_name_snapshot, price_per_gram_snapshot, quantity_grams, amount
     FROM order_items WHERE order_id = ?`
  );

  const result = orders.map((o) => ({ ...o, items: getItems.all(o.id) }));
  res.json(result);
});

router.get('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const order = db
    .prepare(
      `SELECT o.*, c.name AS city_name, d.name AS district_name
       FROM orders o
       JOIN cities c ON c.id = o.city_id
       JOIN districts d ON d.id = o.district_id
       WHERE o.id = ?`
    )
    .get(id);

  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.user_id !== req.user.userId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const items = db
    .prepare(
      `SELECT product_name_snapshot, price_per_gram_snapshot, quantity_grams, amount
       FROM order_items WHERE order_id = ?`
    )
    .all(order.id);

  res.json({ ...order, items });
});

/* ---------------- Telegram manager ---------------- */

router.post('/:id/pay/telegram', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.user_id !== req.user.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.prepare(
    `UPDATE orders
     SET payment_method = 'telegram', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(id);

  res.json({
    ok: true,
    telegramManagerLink: process.env.TELEGRAM_MANAGER_LINK || '',
  });
});

/* ---------------- Crypto — options ---------------- */

router.get('/:id/crypto/options', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const order = db
      .prepare(
        `SELECT o.*, c.name AS city_name, d.name AS district_name
         FROM orders o
         JOIN cities c ON c.id = o.city_id
         JOIN districts d ON d.id = o.district_id
         WHERE o.id = ?`
      )
      .get(id);

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const items = db
      .prepare(
        `SELECT product_name_snapshot, price_per_gram_snapshot, quantity_grams, amount
         FROM order_items WHERE order_id = ?`
      )
      .all(order.id);

    const { rates, options, fiat } = await cryptoService.getPaymentOptions(
      Number(order.total_amount)
    );

    const enriched = options.map((o) => ({
      ...o,
      qrPayload: cryptoService.buildQrPayload(o),
    }));

    res.json({
      order: {
        id: order.id,
        total_amount: order.total_amount,
        status: order.status,
        created_at: order.created_at,
        payment_method: order.payment_method,
        crypto_network_id: order.crypto_network_id,
        crypto_network_label: order.crypto_network_label,
        crypto_address: order.crypto_address,
        crypto_amount: order.crypto_amount,
        crypto_rate: order.crypto_rate,
        crypto_marked_paid_at: order.crypto_marked_paid_at,
        city_name: order.city_name,
        district_name: order.district_name,
        items,
      },
      fiat,
      rates,
      options: enriched,
      paymentWindowMinutes: cryptoService.paymentWindowMinutes,
    });
  } catch (e) {
    next(e);
  }
});

/* ---------------- Crypto — select network ---------------- */

router.post('/:id/crypto/select', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const schema = z.object({ network_id: z.string().min(1).max(64) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (order.status === 'paid') {
      return res.status(400).json({ error: 'Order is already paid' });
    }

    const { options } = await cryptoService.getPaymentOptions(Number(order.total_amount));
    const opt = options.find((o) => o.id === parsed.data.network_id);
    if (!opt) return res.status(400).json({ error: 'Network not found' });

    db.prepare(
      `UPDATE orders
       SET payment_method = 'crypto',
           crypto_network_id = ?,
           crypto_network_label = ?,
           crypto_address = ?,
           crypto_amount = ?,
           crypto_rate = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      opt.id,
      `${opt.coin} · ${opt.networkLabel}`,
      opt.address,
      opt.amount,
      opt.rate,
      id
    );

    res.json({ ok: true, option: { ...opt, qrPayload: cryptoService.buildQrPayload(opt) } });
  } catch (e) {
    next(e);
  }
});

/* ---------------- Crypto — user clicked "I have paid" ---------------- */

router.post('/:id/crypto/mark-paid', requireAuth, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.prepare(
      `UPDATE orders
       SET crypto_marked_paid_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(id);

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;