const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/cities', (req, res) => {
  const rows = db
    .prepare('SELECT id, name FROM cities WHERE is_active = 1 ORDER BY name COLLATE NOCASE')
    .all();
  res.json(rows);
});

router.get('/cities/:cityId/districts', (req, res) => {
  const cityId = Number(req.params.cityId);
  if (!Number.isInteger(cityId) || cityId <= 0) {
    return res.status(400).json({ error: 'Invalid city id' });
  }
  const rows = db
    .prepare(
      'SELECT id, name FROM districts WHERE city_id = ? AND is_active = 1 ORDER BY name COLLATE NOCASE'
    )
    .all(cityId);
  res.json(rows);
});

router.get('/products', (req, res) => {
  const rows = db
    .prepare(
      'SELECT id, name, description, price_per_gram, min_grams FROM products WHERE is_active = 1 ORDER BY name COLLATE NOCASE'
    )
    .all();
  res.json(rows);
});

router.get('/settings/public', (req, res) => {
  res.json({
    brandName: process.env.BRAND_NAME || 'DreamShop',
    telegramManagerLink: process.env.TELEGRAM_MANAGER_LINK || '',
  });
});

module.exports = router;