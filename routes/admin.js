const express = require('express');
const pool = require('../db/pool');
const upload = require('../middleware/upload');
const { requireAdmin } = require('../middleware/auth');
const { verifyLoginCode, getBot, sendOrderStatusToCustomer } = require('../bot');
const { money } = require('../utils');

const router = express.Router();

// ====== Воридшавӣ бо коди Telegram ======
router.post('/api/admin/login', upload.none(), async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Рамз ворид кунед' });

  const v = verifyLoginCode(String(code).trim().toUpperCase());
  if (!v) {
    return res.status(401).json({ error: 'Рамз нодуруст ё мӯҳлаташ гузаштааст' });
  }

  req.session.isAdmin = true;
  req.session.telegramId = v.telegramId;

  // Барои мувофиқат бо requireAdmin ва фронт session.user-ро низ мегузорем
  try {
    const { rows } = await pool.query(
      'SELECT id, first_name, last_name, username, photo_url FROM users WHERE id=$1',
      [v.telegramId]
    );
    const u = rows[0] || {};
    req.session.user = {
      id: v.telegramId,
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      username: u.username || '',
      photo_url: u.photo_url || '',
      isAdmin: true,
    };
  } catch (e) {
    req.session.user = {
      id: v.telegramId,
      first_name: '',
      last_name: '',
      username: '',
      photo_url: '',
      isAdmin: true,
    };
  }

  res.json({ ok: true, user: req.session.user });
});

router.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ isAdmin: true, user: req.session.user });
});

// ====== Борҳо ======
router.get('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, price, category, sizes, colors, stock, is_active, created_at
       FROM products ORDER BY id DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Хатои сервер' });
  }
});

router.post(
  '/api/admin/products',
  requireAdmin,
  upload.single('image'),
  async (req, res) => {
    try {
      const {
        name,
        description,
        price,
        category,
        sizes,
        colors,
        stock,
        is_active,
      } = req.body;

      if (!name || !price) {
        return res.status(400).json({ error: 'Ном ва нарх ҳатмист' });
      }

      let sizeArr = [];
      let colorArr = [];
      try {
        if (sizes) sizeArr = JSON.parse(sizes);
        if (colors) colorArr = JSON.parse(colors);
      } catch {
        return res.status(400).json({ error: 'Ранг/размер нодуруст' });
      }

      const { rows } = await pool.query(
        `INSERT INTO products
          (name, description, price, category, sizes, colors, image_data, image_type, stock, is_active)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10)
         RETURNING id, name, price, category, stock`,
        [
          name,
          description || '',
          price,
          category || 'libos',
          JSON.stringify(sizeArr),
          JSON.stringify(colorArr),
          req.file ? req.file.buffer : null,
          req.file ? req.file.mimetype : null,
          Number(stock) || 0,
          is_active === 'true' || is_active === 'on' || is_active === true,
        ]
      );
      res.json(rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Хатои сервер' });
    }
  }
);

router.put(
  '/api/admin/products/:id',
  requireAdmin,
  upload.single('image'),
  async (req, res) => {
    try {
      const id = req.params.id;
      const {
        name,
        description,
        price,
        category,
        sizes,
        colors,
        stock,
        is_active,
      } = req.body;

      let sizeArr = [],
        colorArr = [];
      try {
        if (sizes) sizeArr = JSON.parse(sizes);
        if (colors) colorArr = JSON.parse(colors);
      } catch {
        return res.status(400).json({ error: 'Ранг/размер нодуруст' });
      }

      const existing = await pool.query(
        'SELECT * FROM products WHERE id=$1',
        [id]
      );
      if (!existing.rows[0])
        return res.status(404).json({ error: 'Ёфт нашуд' });
      const p = existing.rows[0];

      const isActive =
        is_active === undefined
          ? p.is_active
          : is_active === 'true' || is_active === 'on' || is_active === true;

      const result = await pool.query(
        `UPDATE products SET
          name=$1, description=$2, price=$3, category=$4,
          sizes=$5::jsonb, colors=$6::jsonb,
          image_data=COALESCE($7, image_data),
          image_type=COALESCE($8, image_type),
          stock=$9, is_active=$10
         WHERE id=$11 RETURNING id`,
        [
          name || p.name,
          description ?? p.description,
          price ?? p.price,
          category || p.category,
          JSON.stringify(sizeArr.length ? sizeArr : p.sizes),
          JSON.stringify(colorArr.length ? colorArr : p.colors),
          req.file ? req.file.buffer : null,
          req.file ? req.file.mimetype : null,
          stock !== undefined ? Number(stock) : p.stock,
          isActive,
          id,
        ]
      );
      res.json({ ok: true, id: result.rows[0].id });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Хатои сервер' });
    }
  }
);

router.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Хатои сервер' });
  }
});

// ====== Фармоишҳо ======
router.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let where = '';
    const params = [];
    if (status && status !== 'all') {
      params.push(status);
      where = `WHERE status = $1`;
    }
    const { rows } = await pool.query(
      `SELECT id, order_code, customer_name, customer_phone, address,
              comment, items, total, status, created_at, updated_at,
              (receipt_data IS NOT NULL) AS has_receipt
       FROM orders ${where} ORDER BY id DESC LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Хатои сервер' });
  }
});

router.get('/api/admin/orders/:id/receipt', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT receipt_data, receipt_type FROM orders WHERE id=$1',
      [req.params.id]
    );
    if (!rows[0] || !rows[0].receipt_data) return res.status(404).end();
    res.setHeader('Content-Type', rows[0].receipt_type || 'image/jpeg');
    res.send(rows[0].receipt_data);
  } catch (e) {
    res.status(500).end();
  }
});

router.post('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { status } = req.body;
    if (!['pending', 'confirmed', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Вазъият нодуруст' });
    }

    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      'SELECT * FROM orders WHERE id=$1 FOR UPDATE',
      [req.params.id]
    );
    if (!existing[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ёфт нашуд' });
    }
    const prev = existing[0];

    // Агар аз pending ба rejected гузарем — stock-ро барқарор мекунем
    if (prev.status === 'pending' && status === 'rejected' && Array.isArray(prev.items)) {
      for (const it of prev.items) {
        if (it.id && it.qty) {
          await client.query(
            'UPDATE products SET stock = stock + $1 WHERE id = $2',
            [Number(it.qty) || 0, it.id]
          );
        }
      }
    }

    const { rows } = await client.query(
      'UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );

    await client.query('COMMIT');

    // Огоҳ кардани харидор дар Telegram, агар логин бошад
    if (rows[0].user_id) {
      sendOrderStatusToCustomer(rows[0], status).catch((e) =>
        console.error('[admin] notify customer failed', e)
      );
    }
    res.json(rows[0]);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error(e);
    res.status(500).json({ error: 'Хатои сервер' });
  } finally {
    client.release();
  }
});

// ====== Сӯҳбатҳо (барои админ) ======
router.get('/api/admin/chats', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (cm.user_id)
        cm.user_id,
        cm.from_admin,
        cm.text AS last_text,
        cm.created_at,
        u.first_name, u.last_name, u.username, u.photo_url,
        COUNT(*) FILTER (WHERE NOT cm.read_by_admin AND NOT cm.from_admin)
          OVER (PARTITION BY cm.user_id) AS unread_count
      FROM chat_messages cm
      JOIN users u ON u.id = cm.user_id
      ORDER BY cm.user_id, cm.id DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Хатои сервер' });
  }
});

router.get('/api/admin/chats/:userId', requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { rows } = await pool.query(
      `SELECT id, from_admin, text, created_at
       FROM chat_messages WHERE user_id=$1 ORDER BY id ASC LIMIT 500`,
      [userId]
    );
    await pool.query(
      `UPDATE chat_messages SET read_by_admin=TRUE
       WHERE user_id=$1 AND from_admin=FALSE AND read_by_admin=FALSE`,
      [userId]
    );
    res.json({ messages: rows });
  } catch (e) {
    res.status(500).json({ error: 'Хатои сервер' });
  }
});

// ====== Омор ======
router.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [products, pending, orders, revenue] = await Promise.all([
      pool.query('SELECT COUNT(*)::int n FROM products'),
      pool.query("SELECT COUNT(*)::int n FROM orders WHERE status='pending'"),
      pool.query('SELECT COUNT(*)::int n FROM orders'),
      pool.query(
        "SELECT COALESCE(SUM(total),0) s FROM orders WHERE status='confirmed'"
      ),
    ]);
    res.json({
      products: products.rows[0].n,
      pending: pending.rows[0].n,
      orders: orders.rows[0].n,
      revenue: Number(revenue.rows[0].s),
    });
  } catch (e) {
    res.status(500).json({ error: 'Хатои сервер' });
  }
});

module.exports = router;
