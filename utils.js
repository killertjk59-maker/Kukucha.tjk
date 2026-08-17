// Асбобҳои ёрирасон

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Рамзи тасодуфӣ барои фармоишҳо ва кодҳои воридшавӣ
function randomCode(len = 8) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

function orderCode() {
  const d = new Date();
  const ymd =
    d.getFullYear().toString().slice(2) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  return `KK-${ymd}-${randomCode(5)}`;
}

// HTML-экранирование барои нишон додани матн (харидор)
function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Формати нарх бо сомонӣ
function money(n) {
  const num = Number(n || 0);
  return num.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' сомонӣ';
}

function formatItems(items = []) {
  return items
    .map((it, i) => {
      const opts = [];
      if (it.size) opts.push(`размер: ${it.size}`);
      if (it.color) opts.push(`ранг: ${it.color}`);
      return `${i + 1}) ${it.name} — ${it.qty} дона × ${money(it.price)}${
        opts.length ? ' (' + opts.join(', ') + ')' : ''
      }`;
    })
    .join('\n');
}

module.exports = { randomCode, orderCode, esc, money, formatItems };
