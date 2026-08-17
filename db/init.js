const pool = require('./pool');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT DEFAULT '',
  price        NUMERIC(12,2) NOT NULL,
  category     TEXT NOT NULL DEFAULT 'libos',
  sizes        JSONB NOT NULL DEFAULT '[]'::jsonb,
  colors       JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_data   BYTEA,
  image_type   TEXT,
  stock        INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id              BIGINT PRIMARY KEY,
  first_name      TEXT,
  last_name       TEXT,
  username        TEXT,
  photo_url       TEXT,
  is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  order_code     TEXT UNIQUE NOT NULL,
  user_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  customer_name  TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  address        TEXT NOT NULL,
  comment        TEXT DEFAULT '',
  items          JSONB NOT NULL,
  total          NUMERIC(12,2) NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  receipt_data   BYTEA,
  receipt_type   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_admin  BOOLEAN NOT NULL DEFAULT FALSE,
  admin_id    BIGINT,
  text        TEXT NOT NULL,
  read_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  read_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, created_at);
`;

// SVG-и оддӣ барои намуна (рангҳо вобаста ба категория)
function placeholderSvg(label, bg, fg) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='${bg}'/>
      <stop offset='1' stop-color='${fg}'/>
    </linearGradient></defs>
    <rect width='600' height='600' fill='url(#g)'/>
    <circle cx='300' cy='230' r='90' fill='rgba(255,255,255,0.25)'/>
    <text x='300' y='360' font-family='Arial, sans-serif' font-size='52'
      font-weight='bold' fill='#fff' text-anchor='middle'>${label}</text>
  </svg>`;
  return Buffer.from(svg);
}

const SAMPLES = [
  {
    name: 'Куртаи кӯдакона «Хирсак»',
    description: 'Куртаи пахтагини нарм, барои кӯдакони 1–3 сола. Рангҳои гуногун.',
    price: 85.0,
    category: 'libos',
    sizes: JSON.stringify(['1–2 сол', '2–3 сол', '3–4 сол']),
    colors: JSON.stringify(['Гулобӣ', 'Кабуд', 'Зард']),
    stock: 20,
    img: placeholderSvg('Курта', '#ff9a9e', '#fad0c4'),
    type: 'image/svg+xml',
  },
  {
    name: 'Плюшеви хирсаки калон',
    description: 'Бозичаи мулоим ва бехатар, баландиаш 60 см.',
    price: 220.0,
    category: 'bozicha',
    sizes: JSON.stringify(['60 см']),
    colors: JSON.stringify(['Қаҳваранг', 'Сафед']),
    stock: 15,
    img: placeholderSvg('Хирсак', '#a18cd1', '#fbc2eb'),
    type: 'image/svg+xml',
  },
  {
    name: 'Маҷмӯи футболӣ',
    description: 'Маҷмӯи варзишӣ барои кӯдакон, маводи нафасгир.',
    price: 130.0,
    category: 'libos',
    sizes: JSON.stringify(['4–5 сол', '5–6 сол', '6–7 сол']),
    colors: JSON.stringify(['Сурх', 'Кабуд']),
    stock: 10,
    img: placeholderSvg('Футбол', '#84fab0', '#8fd3f4'),
    type: 'image/svg+xml',
  },
  {
    name: 'Мошини бозича (RC)',
    description: 'Мошини идорашавандаи дурдаст, суръаташ баланд.',
    price: 310.0,
    category: 'bozicha',
    sizes: JSON.stringify(['Стандарт']),
    colors: JSON.stringify(['Сурх', 'Сиёҳ']),
    stock: 8,
    img: placeholderSvg('Мошин', '#f6d365', '#fda085'),
    type: 'image/svg+xml',
  },
  {
    name: 'Пижамаи шабона',
    description: 'Пижамаи нарм бо расмҳои зебо, 100% пахта.',
    price: 95.0,
    category: 'libos',
    sizes: JSON.stringify(['2–3 сол', '3–4 сол', '4–5 сол']),
    colors: JSON.stringify(['Кабуд', 'Гулобӣ']),
    stock: 25,
    img: placeholderSvg('Пижама', '#667eea', '#764ba2'),
    type: 'image/svg+xml',
  },
  {
    name: 'Конструктор 1000 дона',
    description: 'Конструктори ранга, тафаккури кӯдакро инкишоф медиҳад.',
    price: 180.0,
    category: 'bozicha',
    sizes: JSON.stringify(['1000 дона']),
    colors: JSON.stringify(['Омехта']),
    stock: 12,
    img: placeholderSvg('Конструктор', '#43e97b', '#38f9d7'),
    type: 'image/svg+xml',
  },
];

async function ensureColumn(table, column, definition) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name=$1 AND column_name=$2`,
    [table, column]
  );
  if (!rows.length) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[db] Сутуни ${table}.${column} илова шуд`);
  }
}

async function initDb() {
  await pool.query(SCHEMA);

  // Муҳоҷират барои базаҳои кӯҳна
  await ensureColumn('orders', 'user_id', 'BIGINT REFERENCES users(id) ON DELETE SET NULL');

  // Ҷадвали сессияҳо барои connect-pg-simple
  try {
    const pgSession = require('connect-pg-simple');
    const session = require('express-session');
    const PgStore = pgSession(session);
    // store-ро месозем — connect-pg-simple ҷадвалро дар сурати набудан месозад
    new PgStore({ pool, createTableIfMissing: true });
  } catch (e) {
    // сарфи назар — дар server.js дубора истифода мешавад
  }

  // Борҳои намуна, агар холи бошад
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM products');
  if (rows[0].n === 0) {
    for (const p of SAMPLES) {
      await pool.query(
        `INSERT INTO products
          (name, description, price, category, sizes, colors, image_data, image_type, stock)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)`,
        [
          p.name,
          p.description,
          p.price,
          p.category,
          p.sizes,
          p.colors,
          p.img,
          p.type,
          p.stock,
        ]
      );
    }
    console.log(`[db] ${SAMPLES.length} бори намуна илова шуд`);
  }

  console.log('[db] Пойгоҳи додаҳо омода аст');
}

module.exports = { initDb, pool };

if (require.main === module) {
  initDb()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
