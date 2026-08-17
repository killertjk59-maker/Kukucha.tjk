const express = require('express');
const pool = require('../db/pool');
const { notifyAdminsChatMessage } = require('../bot');

const router = express.Router();

function requireLogin(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).json({ error: 'Логин лозим аст' });
}

// Фиристодани паём аз харидор
router.post('/api/chat/send', requireLogin, express.json(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const text = String(req.body.text || '').trim().slice(0, 3000);
    if (!text) return res.status(400).json({ error: 'Матн холӣ аст' });

    const { rows } = await pool.query(
      `INSERT INTO chat_messages (user_id, from_admin, text)
       VALUES ($1, FALSE, $2)
       RETURNING id, from_admin, text, created_at`,
      [userId, text]
    );

    const { rows: userRows } = await pool.query(
      'SELECT first_name, last_name, username FROM users WHERE id=$1',
      [userId]
    );
    const u = userRows[0];
    const name =
      [u.first_name, u.last_name].filter(Boolean).join(' ') ||
      (u.username ? '@' + u.username : `ID${userId}`);

    // Ба админҳо дар Telegram
    notifyAdminsChatMessage({
      userId,
      name,
      username: u.username,
      text,
    }).catch((e) => console.error('[chat] notify error', e));

    res.json({ ok: true, message: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Хатои сервер' });
  }
});

// Гирифтани таърихи сӯҳбат (long-polling)
router.get('/api/chat/history', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const afterId = Number(req.query.after) || 0;
    const deadline = Date.now() + 25000; // 25 сония long-polling

    const check = async () => {
      const { rows } = await pool.query(
        `SELECT id, from_admin, text, created_at
         FROM chat_messages
         WHERE user_id=$1 AND id > $2
         ORDER BY id ASC`,
        [userId, afterId]
      );
      if (rows.length > 0 || Date.now() > deadline) return rows;
      await new Promise((r) => setTimeout(r, 1200));
      return check();
    };

    const rows = await check();
    // Ҳамаи паёмҳои админ ҳамчун хондашуда қайд мешаванд
    if (rows.length) {
      await pool.query(
        `UPDATE chat_messages SET read_by_user=TRUE
         WHERE user_id=$1 AND from_admin=TRUE AND read_by_user=FALSE`,
        [userId]
      );
    }
    res.json({ messages: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Хатои сервер' });
  }
});

// Гирифтани шумораи паёмҳои нохондаи харидор
router.get('/api/chat/unread', requireLogin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int n FROM chat_messages
     WHERE user_id=$1 AND from_admin=TRUE AND read_by_user=FALSE`,
    [req.session.user.id]
  );
  res.json({ unread: rows[0].n });
});

module.exports = router;
