const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// Гирифтани рӯйхати борҳо (иҷозат дода шудаанд)
router.get('/api/products', async (req, res) => {
  try {
    const { category, q } = req.query;
    const params = [];
    let where = 'WHERE is_active = TRUE';
    if (category && category !== 'all') {
      params.push(category);
      where += ` AND category = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND name ILIKE $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT id, name, description, price, category, sizes, colors, stock
       FROM products ${where} ORDER BY id DESC`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Хатои сервер' });
  }
});

// Гирифтани як бор
router.get('/api/products/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, price, category, sizes, colors, stock
       FROM products WHERE id=$1 AND is_active=TRUE`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Ёфт нашуд' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Хатои сервер' });
  }
});

// Гирифтани акси бор
router.get('/api/products/:id/image', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT image_data, image_type FROM products WHERE id=$1',
      [req.params.id]
    );
    if (!rows[0] || !rows[0].image_data) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Type', rows[0].image_type || 'image/png');
    res.send(rows[0].image_data);
  } catch (e) {
    res.status(500).end();
  }
});

module.exports = router;
