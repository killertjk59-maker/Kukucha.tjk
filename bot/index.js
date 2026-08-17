const TelegramBot = require('node-telegram-bot-api');
const pool = require('../db/pool');
const config = require('../config');
const { randomCode, formatItems, money, esc } = require('../utils');

let bot = null;

// Кӯтоҳмуддат нигоҳ доштани кодҳои воридшавӣ (5 дақиқа) — эҳтиёт
const loginCodes = new Map(); // code -> { telegramId, expiresAt }
// Идҳо дар ҳолати ҷавобдиҳӣ ба харидори муайян
const replyMode = new Map(); // adminId -> { userId, name }

setInterval(() => {
  const now = Date.now();
  for (const [code, v] of loginCodes.entries()) {
    if (v.expiresAt < now) loginCodes.delete(code);
  }
}, 60 * 1000);

function startBot() {
  if (!config.botToken) {
    console.warn('[bot] BOT_TOKEN муайян нашудааст — бот кор намекунад');
    return null;
  }

  bot = new TelegramBot(config.botToken, { polling: true });

  bot.onText(/\/start/, async (msg) => {
    const id = msg.from.id;
    const isAdmin = config.isAdmin(id);
    const text = isAdmin
      ? `Салом, админ! 👋\n\nШумо ҳамчун *админ/менеҷер* эътироф шудед.\n\nФармоишҳо ва паёмҳои харидорон ба ин ҷо меоянд.\nДастурҳо:\n/myid — ID-и Telegram-и шумо\n/chats — 10 сӯҳбати охир\n/cancel — бекор кардани ҷавоб\n\nБарои ҷавоб додан тугмаи "💬 Ҷавоб"-ро зер кунед ва паём нависед.`
      : `Салом! 👋\nИн боти расмии мағозаи *kukucha.tj* мебошад.\nШумо метавонед:\n• дар сайт тавассути Telegram ворид шавед\n• бо менеҷери мо 24/7 сӯҳбат кунед (тугмаи 💬 дар кунҷи рост)\n• вазъи фармоишро пайгирӣ кунед`;
    bot.sendMessage(id, text, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/myid/, (msg) => {
    bot.sendMessage(
      msg.from.id,
      `ID-и Telegram-и шумо: *${msg.from.id}*`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.onText(/\/login/, (msg) => {
    if (!config.isAdmin(msg.from.id)) {
      bot.sendMessage(msg.from.id, 'Ин фармон танҳо барои админ аст.');
      return;
    }
    const code = randomCode(6);
    loginCodes.set(code, {
      telegramId: msg.from.id,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    bot.sendMessage(
      msg.from.id,
      `🔐 Рамзи воридшавӣ ба панели админ:\n\n*${code}*\n\nДар муддати 5 дақиқа эътибор дорад.`
    );
  });

  bot.onText(/\/cancel/, (msg) => {
    if (replyMode.has(msg.from.id)) {
      replyMode.delete(msg.from.id);
      bot.sendMessage(msg.from.id, 'Ҳолати ҷавоб бекор карда шуд.');
    }
  });

  bot.onText(/\/chats/, async (msg) => {
    if (!config.isAdmin(msg.from.id)) return;
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (cm.user_id)
         cm.user_id, cm.text, cm.created_at,
         u.first_name, u.last_name, u.username
       FROM chat_messages cm
       JOIN users u ON u.id = cm.user_id
       ORDER BY cm.user_id, cm.id DESC
       LIMIT 10`
    );
    if (!rows.length) {
      return bot.sendMessage(msg.from.id, 'Сӯҳбатҳо нестанд.');
    }
    for (const r of rows) {
      const name =
        [r.first_name, r.last_name].filter(Boolean).join(' ') ||
        (r.username ? '@' + r.username : `ID${r.user_id}`);
      const keyboard = {
        inline_keyboard: [
          [{ text: '💬 Ҷавоб', callback_data: `reply:${r.user_id}` }],
        ],
      };
      bot.sendMessage(
        msg.from.id,
        `👤 *${name}*\n📝 ${r.text.slice(0, 200)}\n🕒 ${new Date(
          r.created_at
        ).toLocaleString('tg-TJ')}`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    }
  });

  // Тугмаҳои inline
  bot.on('callback_query', async (query) => {
    const data = query.data || '';

    // Бекор кардани ҳолати ҷавоб
    if (data === 'cancelreply') {
      replyMode.delete(query.from.id);
      bot.answerCallbackQuery(query.id, { text: 'Ҳолати ҷавоб бекор шуд' });
      try {
        bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          }
        );
      } catch (e) {}
      return;
    }

    const [action, rawId] = data.split(':');
    const id = Number(rawId);

    if (!config.isAdmin(query.from.id)) {
      bot.answerCallbackQuery(query.id, {
        text: 'Шумо админ нестед!',
        show_alert: true,
      });
      return;
    }

    if (action === 'reply') {
      const userId = id;
      const { rows } = await pool.query(
        'SELECT first_name, last_name, username FROM users WHERE id=$1',
        [userId]
      );
      const u = rows[0] || {};
      const name =
        [u.first_name, u.last_name].filter(Boolean).join(' ') ||
        (u.username ? '@' + u.username : `ID${userId}`);
      replyMode.set(query.from.id, { userId, name });
      bot.answerCallbackQuery(query.id, {
        text: `Ҷавоб ба ${name} — паём нависед`,
        show_alert: false,
      });
      bot.sendMessage(
        query.from.id,
        `✍️ Шумо дар ҳолати ҷавоб ба *${name}* ҳастед.\nПаёми ҷавобиро нависед. Барои бекоркунӣ /cancel.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (action !== 'confirm' && action !== 'reject') return;
    if (!id) return;

    try {
      const { rows } = await pool.query(
        'SELECT * FROM orders WHERE id=$1',
        [id]
      );
      if (!rows[0]) {
        bot.answerCallbackQuery(query.id, { text: 'Фармоиш ёфт нашуд' });
        return;
      }
      const order = rows[0];
      if (order.status !== 'pending') {
        bot.answerCallbackQuery(query.id, {
          text: `Ин фармоиш аллакай "${order.status}" шудааст`,
          show_alert: true,
        });
        return;
      }

      const newStatus = action === 'confirm' ? 'confirmed' : 'rejected';

      // Агар рад шавад — stock-ро барқарор мекунем
      if (newStatus === 'rejected' && Array.isArray(order.items)) {
        for (const it of order.items) {
          if (it.id && it.qty) {
            await pool.query(
              'UPDATE products SET stock = stock + $1 WHERE id = $2',
              [Number(it.qty) || 0, it.id]
            );
          }
        }
      }

      await pool.query(
        'UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2',
        [newStatus, id]
      );

      bot.answerCallbackQuery(query.id, {
        text: action === 'confirm' ? '✅ Тасдиқ шуд' : '❌ Рад шуд',
      });

      try {
        bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          }
        );
        const tag = action === 'confirm' ? '✅ *ТАСДИҚ ШУД*' : '❌ *РАД ШУД*';
        bot.editMessageText(`${tag}\n\n${query.message.text || ''}`, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
        });
      } catch (e) {}

      // Огоҳ кардани харидор
      if (order.user_id) {
        sendOrderStatusToCustomer(order, newStatus).catch(() => {});
      }
    } catch (e) {
      console.error('[bot] callback error:', e);
      bot.answerCallbackQuery(query.id, {
        text: 'Хато рух дод',
        show_alert: true,
      });
    }
  });

  // Паёмҳои матнӣ
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    const fromId = msg.from.id;

    // Агар админ дар ҳолати ҷавоб бошад
    if (replyMode.has(fromId)) {
      const { userId, name } = replyMode.get(fromId);
      const text = msg.text.trim();
      try {
        // Нест кардани тугмаи "ҷавоб" дар паёми аслии ин админ (агар бошад)
        // Сабт ба база
        await pool.query(
          `INSERT INTO chat_messages (user_id, from_admin, admin_id, text, read_by_user)
           VALUES ($1, TRUE, $2, $3, FALSE)`,
          [userId, fromId, text]
        );
        // Фиристодан ба харидор дар Telegram, агар имкон бошад
        try {
          await bot.sendMessage(
            userId,
            `💬 *Менеҷер:*\n\n${text}`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {
          // Харидор ботро оғоз накардааст — дар сайт хабарро мебинад
        }
        bot.sendMessage(
          fromId,
          `✅ Ҷавоб ба ${name} фиристода шуд.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Бекор кардани ҳолат', callback_data: 'cancelreply' }],
              ],
            },
          }
        );
      } catch (e) {
        console.error('[bot] reply error', e);
        bot.sendMessage(fromId, 'Хато ҳангоми фиристодани ҷавоб.');
      }
      return;
    }

    // Агар харидор бошад — паёмро ба админҳо мефиристем
    if (!config.isAdmin(fromId)) {
      const user = msg.from;
      const text = msg.text.trim();
      // Боварӣ ҳосил мекунем, ки корбар дар база ҳаст
      await pool.query(
        `INSERT INTO users (id, first_name, last_name, username, is_admin)
         VALUES ($1,$2,$3,$4,FALSE)
         ON CONFLICT (id) DO UPDATE SET
           first_name=EXCLUDED.first_name,
           last_name=EXCLUDED.last_name,
           username=EXCLUDED.username`,
        [user.id, user.first_name || '', user.last_name || '', user.username || '']
      );
      await pool.query(
        `INSERT INTO chat_messages (user_id, from_admin, text)
         VALUES ($1, FALSE, $2) RETURNING id`,
        [user.id, text]
      );
      const name =
        [user.first_name, user.last_name].filter(Boolean).join(' ') ||
        (user.username ? '@' + user.username : `ID${user.id}`);
      notifyAdminsChatMessage({
        userId: user.id,
        name,
        username: user.username,
        text,
      }).catch(() => {});
      bot.sendMessage(
        fromId,
        '✅ Паёми шумо ба менеҷер фиристода шуд. Дар кӯтоҳтарин фурсат ҷавоб медиҳем.'
      );
    }
  });

  console.log('[bot] Telegram-бот оғоз ёфт');
  return bot;
}

// Фиристодани фармоиши нав ба ҲАМАИ админҳо
async function sendOrderToAdmin(order) {
  if (!bot || !config.adminIds.length) {
    console.warn('[bot] Бот ё ADMIN_TELEGRAM_ID танзим нашудааст');
    return false;
  }

  const caption =
    `🛒 *Фармоиши нав!* ${order.order_code}\n\n` +
    `👤 *Ном:* ${order.customer_name}\n` +
    `📞 *Телефон:* ${order.customer_phone}\n` +
    `📍 *Суроға:* ${order.address}\n` +
    (order.comment ? `💬 *Шарҳ:* ${order.comment}\n` : '') +
    `\n📦 *Борҳо:*\n${formatItems(order.items)}\n` +
    `\n💰 *Ҷамъ:* ${money(order.total)}\n` +
    `📅 *Сана:* ${new Date(order.created_at).toLocaleString('tg-TJ')}`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Тасдиқ', callback_data: `confirm:${order.id}` },
        { text: '❌ Рад', callback_data: `reject:${order.id}` },
      ],
      order.user_id
        ? [{ text: '💬 Сӯҳбат бо харидор', callback_data: `reply:${order.user_id}` }]
        : [],
    ].filter((r) => r.length),
  };

  const errors = [];
  for (const adminId of config.adminIds) {
    try {
      if (order.receipt_data) {
        await bot.sendPhoto(
          adminId,
          order.receipt_data,
          {
            caption: `🧾 *Чеки пардохт*\n\n${caption}`,
            parse_mode: 'Markdown',
            reply_markup: keyboard,
          },
          {
            filename: 'receipt.jpg',
            contentType: order.receipt_type || 'image/jpeg',
          }
        );
      } else {
        await bot.sendMessage(adminId, caption, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }
    } catch (e) {
      errors.push(e);
      console.error(`[bot] Хато ҳангоми фиристодан ба админ ${adminId}:`, e.message);
    }
  }
  return errors.length === 0;
}

// Огоҳ кардани ҳамаи админҳо дар бораи паёми нави харидор
async function notifyAdminsChatMessage({ userId, name, username, text }) {
  if (!bot || !config.adminIds.length) return;
  const keyboard = {
    inline_keyboard: [
      [
        { text: '💬 Ҷавоб', callback_data: `reply:${userId}` },
        username
          ? { text: '👤 Профил', url: `https://t.me/${username}` }
          : { text: '🆔 ID', callback_data: `showid:${userId}` },
      ],
    ],
  };
  const msg =
    `💬 *Паёми нав аз харидор!*\n\n` +
    `👤 *${name}*${username ? ' (@' + username + ')' : ''}\n` +
    `🆔 ID: \`${userId}\`\n\n` +
    `📝 ${text.slice(0, 1500)}`;
  await Promise.all(
    config.adminIds.map((id) =>
      bot.sendMessage(id, msg, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }).catch(() => {})
    )
  );
}

async function sendOrderStatusToCustomer(order, status) {
  if (!bot || !order.user_id) return;
  const text =
    status === 'confirmed'
      ? `✅ *Фармоиши шумо тасдиқ шуд!*\n\nРамз: *${order.order_code}*\nМаблағ: ${money(order.total)}\n\nБа зудӣ бо шумо тамос мегирем. Ташаккур! 🎉`
      : `❌ *Мутаассифона, фармоиш рад шуд.*\n\nРамз: *${order.order_code}*\nЛутфан бо мо тамос гиред, то сабабро фаҳмонем.`;
  try {
    await bot.sendMessage(order.user_id, text, { parse_mode: 'Markdown' });
  } catch (e) {
    console.warn('[bot] Огоҳинома ба харидор нарафт:', e.message);
  }
}

function verifyLoginCode(code) {
  const v = loginCodes.get(code);
  if (!v) return null;
  if (v.expiresAt < Date.now()) {
    loginCodes.delete(code);
    return null;
  }
  loginCodes.delete(code);
  return v;
}

module.exports = {
  startBot,
  sendOrderToAdmin,
  sendOrderStatusToCustomer,
  notifyAdminsChatMessage,
  verifyLoginCode,
  getBot: () => bot,
};
