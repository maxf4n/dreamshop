require('dotenv').config();
const db = require('../db');

const citiesCount = db.prepare('SELECT COUNT(*) AS c FROM cities').get().c;
if (citiesCount === 0) {
  const insertCity = db.prepare('INSERT INTO cities (name) VALUES (?)');
  const insertDistrict = db.prepare('INSERT INTO districts (city_id, name) VALUES (?, ?)');

  const london = insertCity.run('London').lastInsertRowid;
  insertDistrict.run(london, 'Central');
  insertDistrict.run(london, 'North');
  insertDistrict.run(london, 'South');

  const berlin = insertCity.run('Berlin').lastInsertRowid;
  insertDistrict.run(berlin, 'Mitte');
  insertDistrict.run(berlin, 'Prenzlauer Berg');

  console.log('Seed cities/districts done');
}

const productsCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
if (productsCount === 0) {
  const insert = db.prepare(
    'INSERT INTO products (name, description, price_per_gram, min_grams) VALUES (?, ?, ?, ?)'
  );
  insert.run('Dream Gold', 'Premium grade. Smooth, deep flavor.', 12.5, 0.5);
  insert.run('Dream Silver', 'Classic grade. Balanced.', 8.0, 1.0);
  insert.run('Dream Elite', 'Elite grade. Limited batches.', 25.0, 0.1);
  insert.run('Dream Green', 'Light and fresh.', 6.5, 0.2);
  console.log('Seed products done');
}

console.log('Seeding finished.');