const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'app.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
db.exec(schema);

// ---------- Миграции (идемпотентные) ----------
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[db] added column ${table}.${column}`);
  }
}

ensureColumn('orders', 'crypto_network_id', 'TEXT');
ensureColumn('orders', 'crypto_network_label', 'TEXT');
ensureColumn('orders', 'crypto_address', 'TEXT');
ensureColumn('orders', 'crypto_amount', 'REAL');
ensureColumn('orders', 'crypto_rate', 'REAL');
ensureColumn('orders', 'crypto_marked_paid_at', 'DATETIME');


module.exports = db;