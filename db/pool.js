const { Pool } = require('pg');
const config = require('../config');
const { URL } = require('url');

// Муайян кардани URL — кӯшиш бо тартиби авлавият
const rawUrl =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.PG_URL ||
  process.env.POSTGRES_URL ||
  'postgresql://postgres:password@localhost:5432/kukucha';

// Муҳофизат: агар касе PGHOST=localhost гузошта бошад ва DATABASE_URL набошад,
// мо онро нодида мегирем ва ба URL-и боло такя мекунем.
function maskUrl(u) {
  try {
    const p = new URL(u);
    if (p.password) p.password = '***';
    return p.toString().replace(/:(\*\*\*)@/, ':***@');
  } catch {
    return u;
  }
}

const isLocal = /localhost|127\.0\.0\.1|::1/i.test(rawUrl);

console.log(`[db] Истифодаи URL: ${maskUrl(rawUrl)}`);
console.log(`[db] Локалӣ: ${isLocal ? 'ҲА (localhost)' : 'НЕ (абр)'}`);

// Конфигро аз URL хориҷ мекунем, то ягон PGHOST-и муҳит онро вайрон накунад
let poolConfig;
try {
  const p = new URL(rawUrl);
  poolConfig = {
    connectionString: rawUrl,
    host: p.hostname,
    port: p.port ? Number(p.port) : 5432,
    user: decodeURIComponent(p.username || 'postgres'),
    password: decodeURIComponent(p.password || ''),
    database: (p.pathname || '/postgres').slice(1),
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    max: 10,
  };
} catch (e) {
  console.error('[db] URL-и база нодуруст аст:', e.message);
  poolConfig = {
    connectionString: rawUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[pg] Хатои ғайричашмдошт:', err.message);
});

async function testConnection() {
  let lastErr;
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const c = await pool.connect();
      const res = await c.query('SELECT NOW() AS now, current_database() AS db');
      c.release();
      console.log(
        `[db] ✅ Пайваст барқарор шуд (кӯшиши ${attempt}) — база: ${res.rows[0].db}`
      );
      return;
    } catch (e) {
      lastErr = e;
      console.warn(
        `[db] ⚠️ Кӯшиши ${attempt}/15 ноком: ${e.code || ''} ${e.message}`
      );
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error(
    `Ба PostgreSQL пайваст шуда нашуд: ${lastErr?.code || ''} ${lastErr?.message}.\n` +
      `URL-и истифодашуда: ${maskUrl(rawUrl)}\n` +
      `Агар ин "localhost" бошад — DATABASE_URL-и сервис нодуруст аст.`
  );
}

// Барои ташхис аз фронт
function getDebugInfo() {
  return {
    url_masked: maskUrl(rawUrl),
    isLocal,
    host: poolConfig.host,
    port: poolConfig.port,
    database: poolConfig.database,
    user: poolConfig.user,
    env_keys: Object.keys(process.env).filter((k) =>
      /^PG|DATABASE|POSTGRES/i.test(k)
    ),
  };
}

module.exports = pool;
module.exports.testConnection = testConnection;
module.exports.getDebugInfo = getDebugInfo;
