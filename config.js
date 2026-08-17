// Танзимоти марказӣ (аз муҳити корӣ)
require('dotenv').config();

const botToken = process.env.BOT_TOKEN || '';
const botUsername = (process.env.BOT_USERNAME || '').replace(/^@/, '');

// Якчанд ID-ҳои админ/менеҷер (бо вергул ҷудо)
const adminIds = [
  ...new Set(
    [
      process.env.ADMIN_TELEGRAM_ID,
      ...(process.env.ADMIN_TELEGRAM_IDS || '').split(','),
    ]
      .filter(Boolean)
      .map((s) => Number(String(s).trim()))
      .filter((n) => !Number.isNaN(n))
  ),
];

module.exports = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  publicUrl: process.env.PUBLIC_URL || '',
  botToken,
  botUsername,
  adminIds,
  isAdmin: (id) => adminIds.includes(Number(id)),
  paymentPhone: process.env.PAYMENT_PHONE || '988757967',
  paymentOwner: process.env.PAYMENT_OWNER || 'Душанбе Сити',
  sessionSecret:
    process.env.SESSION_SECRET ||
    (process.env.NODE_ENV === 'production'
      ? (() => {
          console.error(
            '[config] ХАТАР: SESSION_SECRET дар production гузошта нашудааст! Рамзи муваққатӣ истифода мешавад.'
          );
          return require('crypto').randomBytes(32).toString('hex');
        })()
      : 'dev-secret-change-me'),
};
