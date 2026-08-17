const express = require('express');
const pool = require('../db/pool');
const upload = require('../middleware/upload');
const { orderCode } = require('../utils');
const { sendOrderToAdmin } = require('../bot');

const router = express.Router();

// Эҷоди фармоиш (бе чек — ҳолати "ақд")
router.post('/api/orders', upload.none(), async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_name, customer_phone, address, comment, items } =
      req.body;
    if (!customer_name || !customer_phone || !address || !items) {
      return res.status(400).json({ error: 'Ҳама майдонҳои зарурӣ пур кунед' });
    }

    let parsedItems;
    try {
      parsedItems = JSON.parse(items);
    } catch {
      return res.status(400).json({ error: 'Формати сабад нодуруст аст' });
    }
    if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
      return res.status(400).json({ error: 'Сабад холӣ аст' });
    }

    await client.query('BEGIN');

    // Ҳисоб кардани ҷамъ + санҷиши stock (нарх ва stock аз DB)
    let total = 0;
    for (const it of parsedItems) {
      const { rows } = await client.query(
        'SELECT id, name, price, stock FROM products WHERE id=$1 AND is_active=TRUE FOR UPDATE',
        [it.id]
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res
          .status(400)
          .json({ error: `Бори ID=${it.id} дастрас нест` });
      }
      const product = rows[0];
      it.price = Number(product.price);
      it.qty = Math.max(1, Number(it.qty) || 1);
      it.name = it.name || product.name;

      if (product.stock < it.qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `«${product.name}» — боқимонда танҳо ${product.stock} дона аст`,
        });
      }

      // Кам кардани stock
      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2',
        [it.qty, it.id]
      );

      total += it.price * it.qty;
    }

    const code = orderCode();
    const userId = req.session?.user?.id || null;

    const { rows } = await client.query(
      `INSERT INTO orders
        (order_code, user_id, customer_name, customer_phone, address, comment, items, total, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'pending')
       RETURNING *`,
      [
        code,
        userId,
        customer_name,
        customer_phone,
        address,
        comment || '',
        JSON.stringify(parsedItems),
        total,
      ]
    );

    await client.query('COMMIT');
    res.json({ order: rows[0], total });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error(e);
    res.status(500).json({ error: 'Хатои сервер' });
  } finally {
    client.release();
  }
});

// Боркунии чек ва фиристодан ба админ
router.post('/api/orders/:id/receipt', upload.single('receipt'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1', [
      req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Фармоиш ёфт нашуд' });
    if (rows[0].status !== 'pending') {
      return res.status(400).json({
        error: 'Ин фармоиш аллакай коркард шудааст',
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Чекро замима кунед' });
    }

    const updated = await pool.query(
      `UPDATE orders SET receipt_data=$1, receipt_type=$2, updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [req.file.buffer, req.file.mimetype, req.params.id]
    );

    // Фиристодан ба Telegram
    const sent = await sendOrderToAdmin(updated.rows[0]);

    res.json({
      ok: true,
      sent,
      order_code: updated.rows[0].order_code,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Хатои сервер' });
  }
});

// Санҷидани вазъи фармоиш бо код (барои харидор)
router.get('/api/orders/status/:code', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT order_code, status, total, created_at, updated_at FROM orders WHERE order_code=$1',
      [req.params.code.toUpperCase()]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Ёфт нашуд' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Хатои сервер' });
  }
});

module.exports = router;
