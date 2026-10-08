require('dotenv').config();
const db = require('../db');

const citiesCount = db.prepare('SELECT COUNT(*) AS c FROM cities').get().c;
if (citiesCount === 0) {
  const insertCity = db.prepare('INSERT INTO cities (name) VALUES (?)');
  const insertDistrict = db.prepare('INSERT INTO districts (city_id, name) VALUES (?, ?)');

  const msk = insertCity.run('Москва').lastInsertRowid;
  insertDistrict.run(msk, 'Центральный');
  insertDistrict.run(msk, 'Северный');
  insertDistrict.run(msk, 'Южный');

  const spb = insertCity.run('Санкт-Петербург').lastInsertRowid;
  insertDistrict.run(spb, 'Адмиралтейский');
  insertDistrict.run(spb, 'Петроградский');

  console.log('Seed cities/districts done');
}

const productsCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
if (productsCount === 0) {
  const insert = db.prepare(
    'INSERT INTO products (name, description, price_per_gram, min_grams) VALUES (?, ?, ?, ?)'
  );
  insert.run('Dream Gold', 'Премиальный сорт. Мягкий, глубокий вкус.', 12.5, 0.5);
  insert.run('Dream Silver', 'Классический сорт. Сбалансированный.', 8.0, 1.0);
  insert.run('Dream Elite', 'Элитный сорт. Ограниченные партии.', 25.0, 0.1);
  insert.run('Dream Green', 'Лёгкий и свежий.', 6.5, 0.2);
  console.log('Seed products done');
}

console.log('Seeding finished.');