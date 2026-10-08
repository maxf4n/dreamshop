const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} = require('../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

const credentialsSchema = z.object({
  username: z
    .string()
    .min(3, 'At least 3 characters')
    .max(32, 'At most 32 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, digits and underscore'),
  password: z.string().min(6, 'At least 6 characters').max(100),
});

router.post('/register', authLimiter, (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
  }
  const { username, password } = parsed.data;

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'This username is already taken' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, hash);

  const userId = info.lastInsertRowid;
  const token = signToken({ userId, username, role: 'user' });
  setAuthCookie(res, token);

  res.json({ id: userId, username, role: 'user' });
});

router.post('/login', authLimiter, (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data' });
  }
  const { username, password } = parsed.data;

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

  const token = signToken({ userId: user.id, username: user.username, role: 'user' });
  setAuthCookie(res, token);

  res.json({ id: user.id, username: user.username, role: 'user' });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    id: req.user.userId,
    username: req.user.username,
    role: req.user.role,
  });
});

module.exports = router;