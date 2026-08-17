const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const config = require('../config');

const router = express.Router();

// Тасдиқи ҳеши Telegram Login Widget
// https://core.telegram.org/widgets/login#checking-authorization
function verifyTelegramAuth(data) {
  if (!data || !data.hash) return null;
  const { hash, ...rest } = data;
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n');

  const secretKey = crypto
    .createHash('sha256')
    .update(config.botToken)
    .digest();
  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  if (hmac !== hash) return null;

  // Мӯҳлати эътимод — 24 соат
  const authDate = Number(data.auth_date);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  return {
    id: Number(data.id),
    first_name: data.first_name || '',
    last_name: data.last_name || '',
    username: data.username || '',
    photo_url: data.photo_url || '',
  };
}

// Telegram Login Widget маълумотро ба ин endpoint мефиристад
router.post('/api/auth/telegram', express.json(), async (req, res) => {
  try {
    const user = verifyTelegramAuth(req.body);
    if (!user) {
      return res
        .status(401)
        .json({ error: 'Тасдиқи Telegram номуваффақ шуд' });
    }

    // Дар users ҷадвал нигоҳ медорем
    await pool.query(
      `INSERT INTO users (id, first_name, last_name, username, photo_url, is_admin, last_login_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (id) DO UPDATE
       SET first_name=EXCLUDED.first_name,
           last_name=EXCLUDED.last_name,
           username=EXCLUDED.username,
           photo_url=EXCLUDED.photo_url,
           last_login_at=NOW()`,
      [
        user.id,
        user.first_name,
        user.last_name,
        user.username,
        user.photo_url,
        config.isAdmin(user.id),
      ]
    );

    req.session.user = {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      photo_url: user.photo_url,
      isAdmin: config.isAdmin(user.id),
    };

    res.json({ ok: true, user: req.session.user });
  } catch (e) {
    console.error('[auth] telegram error:', e);
    res.status(500).json({ error: 'Хатои сервер' });
  }
});

router.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/api/auth/me', (req, res) => {
  res.json({ user: req.session?.user || null });
});

module.exports = router;
