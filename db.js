const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('admin','customer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🧸',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  old_price REAL,
  image TEXT NOT NULL DEFAULT '',
  rating REAL NOT NULL DEFAULT 5,
  rating_count INTEGER NOT NULL DEFAULT 1,
  has_sizes INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_sizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  UNIQUE(product_id, size)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Хуҷанд',
  address TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  delivery_method TEXT NOT NULL DEFAULT 'courier',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  subtotal REAL NOT NULL DEFAULT 0,
  delivery_fee REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','confirmed','shipped','delivered','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  price REAL NOT NULL,
  size TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL DEFAULT 1,
  image TEXT NOT NULL DEFAULT ''
);
`);

// ---------- helpers ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(pw, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calc, 'hex'));
}
function fmtMoney(n) {
  return Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' сом';
}

const q = {
  userByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  createUser: db.prepare('INSERT INTO users (full_name, phone, username, password_hash, role) VALUES (?,?,?,?,?)'),
  updateProfile: db.prepare('UPDATE users SET full_name=?, phone=? WHERE id=?'),
  updatePassword: db.prepare('UPDATE users SET password_hash=? WHERE id=?'),
  updateRole: db.prepare('UPDATE users SET role=? WHERE id=?'),
  deleteUser: db.prepare('DELETE FROM users WHERE id=?'),
  allUsers: db.prepare('SELECT * FROM users ORDER BY created_at DESC'),
  customerCount: db.prepare("SELECT COUNT(*) c FROM users WHERE role='customer'"),
  orderCountByUser: db.prepare('SELECT COUNT(*) c FROM orders WHERE user_id=?'),

  categoriesAll: db.prepare('SELECT * FROM categories ORDER BY sort_order, id'),
  categoriesPublished: db.prepare('SELECT * FROM categories WHERE is_published=1 ORDER BY sort_order, id'),
  categoryById: db.prepare('SELECT * FROM categories WHERE id=?'),
  insertCategory: db.prepare('INSERT INTO categories (name, icon, sort_order, is_published) VALUES (?,?,?,?)'),
  updateCategory: db.prepare('UPDATE categories SET name=?, icon=?, sort_order=?, is_published=? WHERE id=?'),
  deleteCategory: db.prepare('DELETE FROM categories WHERE id=?'),
  nextCategoryOrder: db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 o FROM categories'),

  productsAll: db.prepare('SELECT * FROM products ORDER BY created_at DESC, id DESC'),
  productsPublished: db.prepare('SELECT * FROM products WHERE is_published=1 ORDER BY created_at DESC, id DESC'),
  productsFeatured: db.prepare('SELECT * FROM products WHERE is_published=1 AND is_featured=1 ORDER BY id DESC'),
  productById: db.prepare('SELECT * FROM products WHERE id=?'),
  insertProduct: db.prepare('INSERT INTO products (category_id, title, description, price, old_price, image, rating, rating_count, has_sizes, stock, is_featured, is_published) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'),
  updateProduct: db.prepare('UPDATE products SET category_id=?, title=?, description=?, price=?, old_price=?, image=?, has_sizes=?, stock=?, is_featured=?, is_published=? WHERE id=?'),
  deleteProduct: db.prepare('DELETE FROM products WHERE id=?'),

  sizesByProduct: db.prepare('SELECT * FROM product_sizes WHERE product_id=? ORDER BY id'),
  insertSize: db.prepare('INSERT OR REPLACE INTO product_sizes (product_id, size, stock) VALUES (?,?,?)'),
  deleteSizes: db.prepare('DELETE FROM product_sizes WHERE product_id=?'),
  stockOf: db.prepare('SELECT COALESCE(SUM(stock),0) s FROM product_sizes WHERE product_id=?'),
  productCountByCategory: db.prepare('SELECT COUNT(*) c FROM products WHERE category_id=?'),

  orderById: db.prepare('SELECT * FROM orders WHERE id=?'),
  orderItems: db.prepare('SELECT * FROM order_items WHERE order_id=?'),
  ordersAll: db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC'),
  ordersByUser: db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC, id DESC'),
  ordersByStatus: db.prepare('SELECT * FROM orders WHERE status=? ORDER BY created_at DESC'),
  insertOrder: db.prepare('INSERT INTO orders (user_id, customer_name, phone, city, address, comment, delivery_method, payment_method, subtotal, delivery_fee, total, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'),
  insertOrderItem: db.prepare('INSERT INTO order_items (order_id, product_id, title, price, size, qty, image) VALUES (?,?,?,?,?,?,?)'),
  updateOrderStatus: db.prepare('UPDATE orders SET status=? WHERE id=?'),
  decrementProductStock: db.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id=?'),
  decrementSizeStock: db.prepare('UPDATE product_sizes SET stock = MAX(stock - ?, 0) WHERE product_id=? AND size=?'),
  searchProducts: db.prepare("SELECT * FROM products WHERE is_published=1 AND (LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?)) ORDER BY created_at DESC, id DESC"),

  statsProducts: db.prepare('SELECT COUNT(*) c FROM products'),
  statsOrders: db.prepare('SELECT COUNT(*) c FROM orders'),
  statsRevenue: db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE status != 'cancelled'"),
  statsNewOrders: db.prepare("SELECT COUNT(*) c FROM orders WHERE status='new'"),
  revenueByDay: db.prepare("SELECT date(created_at) d, SUM(total) s, COUNT(*) c FROM orders WHERE status!='cancelled' GROUP BY date(created_at) ORDER BY d DESC LIMIT 14"),
  lowStockProducts: db.prepare('SELECT * FROM products WHERE is_published=1 ORDER BY stock LIMIT 8'),
  recentOrders: db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 8'),
  recentCustomers: db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 6'),
  statusCounts: db.prepare("SELECT status, COUNT(*) c FROM orders GROUP BY status"),
};

module.exports = { db, q, hashPassword, verifyPassword, fmtMoney };
