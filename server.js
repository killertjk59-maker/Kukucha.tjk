require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const compression = require('compression');

const pool = require('./db/pool');
const { getDebugInfo } = require('./db/pool');
const config = require('./config');
const { initDb } = require('./db/init');
const { startBot } = require('./bot');
const { attachUser } = require('./middleware/auth');

const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');
const adminRouter = require('./routes/admin');
const authRouter = require('./routes/auth');
const chatRouter = require('./routes/chat');

const app = express();

app.set('trust proxy', 1);
app.use(compression());

// Helmet-ро нарм мекунем, то Telegram Widget ва услубҳои мо кор кунанд
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://telegram.org',
          'https://oauth.telegram.org',
          'https://*.telegram.org',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        connectSrc: ["'self'", 'https://*.telegram.org', 'https://oauth.telegram.org'],
        frameSrc: ["'self'", 'https://oauth.telegram.org', 'https://telegram.org'],
      },
    },
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Сессияҳо дар PostgreSQL
app.use(
  session({
    store: new pgSession({
      pool,
      createTableIfMissing: true,
      tableName: 'session',
    }),
    name: 'kukucha.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
    },
  })
);

app.use(attachUser);

// API-роутҳо
app.use(productsRouter);
app.use(ordersRouter);
app.use(adminRouter);
app.use(authRouter);
app.use(chatRouter);

// Маълумоти ҷамъиятӣ барои фронт
app.get('/api/config', (req, res) => {
  res.json({
    botUsername: config.botUsername,
    paymentPhone: config.paymentPhone,
    paymentOwner: config.paymentOwner,
    user: req.session?.user || null,
  });
});

// Ташхис — кумак мекунад фаҳмем чаро база пайваст намешавад
app.get('/api/debug/db', async (req, res) => {
  try {
    const r = await pool.query('SELECT NOW() AS now, current_database() AS db, current_user AS usr');
    res.json({ ok: true, db: r.rows[0], config: getDebugInfo() });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message,
      code: e.code,
      config: getDebugInfo(),
    });
  }
});

// Файлҳои статикӣ
app.use(express.static(path.join(__dirname, 'public')));

// SPA-саҳифаҳо
app.get(
  [
    '/',
    '/cart',
    '/checkout',
    '/order/:code',
    '/track',
    '/login',
    '/admin',
  ],
  (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
);

app.use((err, req, res, next) => {
  console.error(err);
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Ҳаҷми акс аз 8 МБ зиёд аст' });
  }
  res.status(500).json({ error: 'Хатои сервер' });
});

const { testConnection } = require('./db/pool');

testConnection()
  .then(() => initDb())
  .then(() => {
    startBot();
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`[server] kukucha.tj дар порти ${config.port} кор мекунад`);
    });
  })
  .catch((e) => {
    console.error('[server] Хато ҳангоми оғоз:', e.message);
    console.error(
      '\n========================================================\n' +
        'ДАСТУР: Дар Railway:\n' +
        '  1) New → Database → Add PostgreSQL (агар набошад)\n' +
        '  2) PostgreSQL-ро интихоб → "Add Service" → сервиси худро интихоб кунед\n' +
        '  3) Дар Variables-и сервис DATABASE_URL бояд пайдо шавад\n' +
        '  4) Deploy/Redeploy-ро пахш кунед\n' +
        '========================================================\n'
    );
    // Серверро намебандем, то Railway логи кӯмакро нишон диҳад
    setTimeout(() => process.exit(1), 5000);
  });
