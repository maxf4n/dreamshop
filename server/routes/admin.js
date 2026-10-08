const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAdmin,
} = require('../middleware/auth');

const router = express.Router();

/* ---------- Login / logout ---------- */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа, попробуйте позже' },
});

router.post('/login', loginLimiter, (req, res) => {
  const schema = z.object({ password: z.string().min(1).max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    console.error('[admin] ADMIN_PASSWORD не задан в .env');
    return res.status(500).json({ error: 'Админ-пароль не настроен на сервере' });
  }

  if (parsed.data.password !== expected) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }

  const token = signToken({ userId: 0, username: 'admin', role: 'admin' });
  setAuthCookie(res, token);
  res.json({ ok: true, role: 'admin' });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAdmin, (req, res) => {
  res.json({ role: 'admin' });
});

/* ---------- Всё, что ниже, требует admin ---------- */
router.use(requireAdmin);

/* ---------- Cities ---------- */

const citySchema = z.object({
  name: z.string().trim().min(1, 'Название обязательно').max(100),
  is_active: z.boolean().optional().default(true),
});

router.get('/cities', (req, res) => {
  const rows = db
    .prepare('SELECT id, name, is_active, created_at FROM cities ORDER BY name COLLATE NOCASE')
    .all();
  res.json(rows);
});

router.post('/cities', (req, res) => {
  const parsed = citySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.issues });
  }
  const { name, is_active } = parsed.data;
  try {
    const info = db
      .prepare('INSERT INTO cities (name, is_active) VALUES (?, ?)')
      .run(name, is_active ? 1 : 0);
    const row = db.prepare('SELECT * FROM cities WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Не удалось создать город' });
  }
});

router.put('/cities/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Некорректный id' });
  }
  const parsed = citySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.issues });
  }
  const exists = db.prepare('SELECT id FROM cities WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Город не найден' });

  const { name, is_active } = parsed.data;
  db.prepare('UPDATE cities SET name = ?, is_active = ? WHERE id = ?').run(
    name,
    is_active ? 1 : 0,
    id
  );
  const row = db.prepare('SELECT * FROM cities WHERE id = ?').get(id);
  res.json(row);
});

router.delete('/cities/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Некорректный id' });
  }
  const exists = db.prepare('SELECT id FROM cities WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Город не найден' });

  // Проверим, нет ли заказов, ссылающихся на этот город (FK не имеет ON DELETE CASCADE для orders)
  const orderRef = db
    .prepare('SELECT id FROM orders WHERE city_id = ? LIMIT 1')
    .get(id);
  if (orderRef) {
    return res
      .status(409)
      .json({ error: 'Нельзя удалить город — есть заказы, ссылающиеся на него' });
  }

  db.prepare('DELETE FROM cities WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* ---------- Districts ---------- */

const districtSchema = z.object({
  city_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(100),
  is_active: z.boolean().optional().default(true),
});

router.get('/districts', (req, res) => {
  const cityId = req.query.city_id ? Number(req.query.city_id) : null;
  let rows;
  if (cityId) {
    rows = db
      .prepare(
        `SELECT d.id, d.name, d.is_active, d.city_id, c.name AS city_name, d.created_at
         FROM districts d
         JOIN cities c ON c.id = d.city_id
         WHERE d.city_id = ?
         ORDER BY d.name COLLATE NOCASE`
      )
      .all(cityId);
  } else {
    rows = db
      .prepare(
        `SELECT d.id, d.name, d.is_active, d.city_id, c.name AS city_name, d.created_at
         FROM districts d
         JOIN cities c ON c.id = d.city_id
         ORDER BY c.name COLLATE NOCASE, d.name COLLATE NOCASE`
      )
      .all();
  }
  res.json(rows);
});

router.post('/districts', (req, res) => {
  const parsed = districtSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.issues });
  }
  const { city_id, name, is_active } = parsed.data;
  const city = db.prepare('SELECT id FROM cities WHERE id = ?').get(city_id);
  if (!city) return res.status(400).json({ error: 'Город не найден' });

  const info = db
    .prepare('INSERT INTO districts (city_id, name, is_active) VALUES (?, ?, ?)')
    .run(city_id, name, is_active ? 1 : 0);
  const row = db.prepare('SELECT * FROM districts WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/districts/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Некорректный id' });
  }
  const parsed = districtSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.issues });
  }
  const exists = db.prepare('SELECT id FROM districts WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Район не найден' });

  const city = db.prepare('SELECT id FROM cities WHERE id = ?').get(parsed.data.city_id);
  if (!city) return res.status(400).json({ error: 'Город не найден' });

  db.prepare('UPDATE districts SET city_id = ?, name = ?, is_active = ? WHERE id = ?').run(
    parsed.data.city_id,
    parsed.data.name,
    parsed.data.is_active ? 1 : 0,
    id
  );
  const row = db.prepare('SELECT * FROM districts WHERE id = ?').get(id);
  res.json(row);
});

router.delete('/districts/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Некорректный id' });
  }
  const exists = db.prepare('SELECT id FROM districts WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Район не найден' });

  const orderRef = db.prepare('SELECT id FROM orders WHERE district_id = ? LIMIT 1').get(id);
  if (orderRef) {
    return res
      .status(409)
      .json({ error: 'Нельзя удалить район — есть заказы, ссылающиеся на него' });
  }

  db.prepare('DELETE FROM districts WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* ---------- Products ---------- */

const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional().default(''),
  price_per_gram: z.number().positive('Цена должна быть > 0').max(1_000_000),
  min_grams: z
    .number()
    .positive('Мин. количество > 0')
    .max(1_000_000)
    .refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9, {
      message: 'Точность — не более 0.1 г',
    }),
  is_active: z.boolean().optional().default(true),
});

router.get('/products', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, description, price_per_gram, min_grams, is_active, created_at
       FROM products ORDER BY name COLLATE NOCASE`
    )
    .all();
  res.json(rows);
});

router.post('/products', (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.issues });
  }
  const { name, description, price_per_gram, min_grams, is_active } = parsed.data;
  const info = db
    .prepare(
      `INSERT INTO products (name, description, price_per_gram, min_grams, is_active)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name, description, price_per_gram, min_grams, is_active ? 1 : 0);
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Некорректный id' });
  }
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.issues });
  }
  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Товар не найден' });

  const { name, description, price_per_gram, min_grams, is_active } = parsed.data;
  db.prepare(
    `UPDATE products
     SET name = ?, description = ?, price_per_gram = ?, min_grams = ?, is_active = ?
     WHERE id = ?`
  ).run(name, description, price_per_gram, min_grams, is_active ? 1 : 0, id);
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.json(row);
});

router.delete('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Некорректный id' });
  }
  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Товар не найден' });

  // order_items хранит product_id без FK, поэтому удаление безопасно исторически.
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* ---------- Orders ---------- */

const ALLOWED_STATUSES = ['unpaid', 'paid', 'security_deposit_required'];

router.get('/orders', (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  let rows;
    const baseSelect = `
    SELECT o.id, o.user_id, o.city_id, o.district_id,
           o.total_amount, o.status, o.payment_method,
           o.crypto_network_id, o.crypto_network_label,
           o.crypto_address, o.crypto_amount, o.crypto_rate,
           o.crypto_marked_paid_at,
           o.created_at, o.updated_at,
           u.username AS username,
           c.name AS city_name,
           d.name AS district_name
    FROM orders o
    JOIN users u ON u.id = o.user_id
    JOIN cities c ON c.id = o.city_id
    JOIN districts d ON d.id = o.district_id
  `;
  if (status && ALLOWED_STATUSES.includes(status)) {
    rows = db.prepare(`${baseSelect} WHERE o.status = ? ORDER BY o.id DESC`).all(status);
  } else {
    rows = db.prepare(`${baseSelect} ORDER BY o.id DESC`).all();
  }
  res.json(rows);
});

router.get('/orders/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Некорректный id' });
  }
  const order = db
    .prepare(
      `SELECT o.*, u.username AS username,
              c.name AS city_name, d.name AS district_name
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN cities c ON c.id = o.city_id
       JOIN districts d ON d.id = o.district_id
       WHERE o.id = ?`
    )
    .get(id);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });

  const items = db
    .prepare(
      `SELECT product_id, product_name_snapshot, price_per_gram_snapshot, quantity_grams, amount
       FROM order_items WHERE order_id = ?`
    )
    .all(id);

  res.json({ ...order, items });
});

router.patch('/orders/:id/status', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Некорректный id' });
  }
  const schema = z.object({ status: z.enum(ALLOWED_STATUSES) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Некорректный статус',
      allowed: ALLOWED_STATUSES,
    });
  }
  const exists = db.prepare('SELECT id FROM orders WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Заказ не найден' });

  db.prepare(
    `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(parsed.data.status, id);

  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  res.json(row);
});

/* ---------- Users ---------- */

router.get('/users', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.created_at,
              (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders_count
       FROM users u
       ORDER BY u.id DESC`
    )
    .all();
  res.json(rows);
});

/* ---------- Stats (бонус: сводка для дашборда) ---------- */

router.get('/stats', (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const orders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  const paid = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'paid'").get().c;
  const unpaid = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'unpaid'").get().c;
  const deposit = db
    .prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'security_deposit_required'")
    .get().c;
  const revenueRow = db
    .prepare("SELECT COALESCE(SUM(total_amount), 0) AS s FROM orders WHERE status = 'paid'")
    .get();

  res.json({
    users,
    orders,
    paid,
    unpaid,
    security_deposit_required: deposit,
    revenue_paid: Number(revenueRow.s || 0),
  });
});

module.exports = router;