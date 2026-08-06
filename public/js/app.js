/* ============================================================
   KUKUCHA.TJ — frontend JS
   theme toggle, cart (session API), animations, toasts
   ============================================================ */
(function () {
  'use strict';

  /* ---------- theme ---------- */
  const THEME_KEY = 'kukucha-theme';
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
  }
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));
    const btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------- toasts ---------- */
  function toast(msg, ic) {
    let wrap = document.getElementById('toasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="t-ic">${ic || '✅'}</span><span>${msg}</span>`;
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2600);
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  }
  function bumpCart(n) {
    const el = document.getElementById('cartCount');
    if (!el) return;
    el.textContent = n;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    if (n <= 0) el.style.display = 'none'; else el.style.display = 'grid';
  }

  /* ---------- add to cart (quick buttons) ---------- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    const productId = btn.dataset.add;
    const size = btn.dataset.size || '';
    post('/api/cart', { productId, size, qty: 1 }).then(r => {
      if (r.ok) {
        bumpCart(r.cartCount);
        btn.classList.add('added');
        btn.innerHTML = '✓';
        toast('Ба сабад илова шуд! 🛒', '🛒');
        setTimeout(() => { btn.classList.remove('added'); btn.innerHTML = '🛒'; }, 1200);
      } else {
        toast(r.error || 'Хатогӣ', '⚠️');
      }
    });
  });

  /* ---------- product page: size + qty + buy ---------- */
  function initProductPage() {
    const sizeBtns = document.querySelectorAll('.size-btn');
    const qtyInput = document.getElementById('qtyInput');
    const qtyMinus = document.getElementById('qtyMinus');
    const qtyPlus = document.getElementById('qtyPlus');
    const btnAdd = document.getElementById('btnAddCart');
    const btnBuy = document.getElementById('btnBuyNow');
    const stockInfo = document.getElementById('stockInfo');
    if (!sizeBtns.length && !qtyInput) return;

    let selectedSize = null;
    let qty = 1;
    const productId = document.getElementById('productData')?.dataset.id;
    const hasSizes = document.getElementById('productData')?.dataset.sizes === '1';

    const stockOf = (s) => {
      const btn = [...sizeBtns].find(b => b.dataset.size === s);
      return btn ? parseInt(btn.dataset.stock) : 0;
    };
    const maxQty = () => {
      if (!hasSizes) return parseInt(document.getElementById('productData')?.dataset.stock || 0);
      return selectedSize ? stockOf(selectedSize) : 0;
    };
    const updateQty = () => {
      if (qtyInput) qtyInput.value = qty;
      if (stockInfo) {
        const m = maxQty();
        if (!hasSizes) stockInfo.textContent = m > 0 ? `Дар анбор: ${m} дона` : 'Мол тамом шуд';
        else if (!selectedSize) stockInfo.textContent = 'Андозаро интихоб кунед';
        else stockInfo.textContent = `Андозаи ${selectedSize}: ${m} дона`;
      }
    };

    sizeBtns.forEach(b => {
      b.addEventListener('click', () => {
        sizeBtns.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        selectedSize = b.dataset.size;
        qty = 1;
        updateQty();
      });
    });
    if (qtyMinus) qtyMinus.addEventListener('click', () => { qty = Math.max(1, qty - 1); updateQty(); });
    if (qtyPlus) qtyPlus.addEventListener('click', () => { qty = Math.min(Math.max(maxQty(), 1), qty + 1); updateQty(); });
    if (qtyInput) qtyInput.addEventListener('change', () => {
      qty = Math.max(1, Math.min(maxQty() || 999, parseInt(qtyInput.value) || 1));
      updateQty();
    });

    const doAdd = (redirect) => {
      if (hasSizes && !selectedSize) { toast('Аввал андозаро интихоб кунед!', '📏'); return; }
      post('/api/cart', { productId, size: selectedSize || '', qty }).then(r => {
        if (!r.ok) { toast(r.error || 'Хатогӣ', '⚠️'); return; }
        bumpCart(r.cartCount);
        toast('Ба сабад илова шуд! 🛒', '🛒');
        if (redirect) window.location.href = '/cart';
      });
    };
    if (btnAdd) btnAdd.addEventListener('click', () => doAdd(false));
    if (btnBuy) btnBuy.addEventListener('click', () => doAdd(true));
    updateQty();
  }

  /* ---------- cart page ---------- */
  function initCartPage() {
    document.querySelectorAll('.qty button[data-dir]').forEach(b => {
      b.addEventListener('click', () => {
        const row = b.closest('.cart-item');
        const input = row.querySelector('.qty input');
        const pid = row.dataset.pid;
        const size = row.dataset.size || '';
        const dir = b.dataset.dir === 'plus' ? 1 : -1;
        const n = Math.max(0, parseInt(input.value) + dir);
        post('/api/cart/update', { productId: pid, size, qty: n }).then(r => {
          if (r.ok) {
            bumpCart(r.cartCount);
            if (n === 0) { row.style.opacity = '0'; setTimeout(() => location.reload(), 250); }
            else location.reload();
          }
        });
      });
    });
    document.querySelectorAll('.ci-remove').forEach(b => {
      b.addEventListener('click', () => {
        const row = b.closest('.cart-item');
        post('/api/cart/update', { productId: row.dataset.pid, size: row.dataset.size || '', qty: 0 }).then(r => {
          if (r.ok) { bumpCart(r.cartCount); row.style.opacity = '0'; setTimeout(() => location.reload(), 250); }
        });
      });
    });
  }

  /* ---------- checkout: delivery/payment select ---------- */
  function initCheckout() {
    document.querySelectorAll('.deliv-opt input').forEach(inp => {
      inp.addEventListener('change', () => {
        document.querySelectorAll('.deliv-opt').forEach(o => o.classList.toggle('active', o.querySelector('input').checked));
        const fee = inp.value === 'courier' ? 15 : 0;
        const feeEl = document.getElementById('deliveryFee');
        const totalEl = document.getElementById('totalSum');
        if (feeEl) feeEl.textContent = fee === 0 ? 'Ройгон' : '+ ' + fee + ' сом';
        if (totalEl) {
          const subtotal = parseFloat(totalEl.dataset.subtotal);
          totalEl.textContent = (subtotal + fee).toLocaleString('ru-RU') + ' сом';
        }
      });
    });
    document.querySelectorAll('.pay-opt input').forEach(inp => {
      inp.addEventListener('change', () => {
        document.querySelectorAll('.pay-opt').forEach(o => o.classList.toggle('active', o.querySelector('input').checked));
      });
    });
  }

  /* ---------- tabs (product page) ---------- */
  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        document.querySelectorAll('.tab-pane').forEach(p => {
          p.style.display = p.id === b.dataset.tab ? 'block' : 'none';
        });
      });
    });
  }

  /* ---------- reveal on scroll ---------- */
  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('visible')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    els.forEach(e => io.observe(e));
  }

  /* ---------- button ripple ---------- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const r = document.createElement('span');
    r.className = 'ripple';
    const size = Math.max(rect.width, rect.height);
    r.style.width = r.style.height = size + 'px';
    r.style.left = (e.clientX - rect.left - size / 2) + 'px';
    r.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(r);
    setTimeout(() => r.remove(), 650);
  });

  /* ---------- admin: add size row ---------- */
  window.addSizeRow = function () {
    const wrap = document.getElementById('sizesWrap');
    if (!wrap) return;
    const row = document.createElement('div');
    row.className = 'size-row';
    row.innerHTML = `
      <input class="form-control" name="size[]" placeholder="Андоза (мас. 110, S)">
      <input class="form-control" type="number" name="size_stock[]" min="0" placeholder="Анбор">
      <button class="rm-size" type="button">✕</button>`;
    row.querySelector('.rm-size').addEventListener('click', () => row.remove());
    wrap.appendChild(row);
    row.querySelector('input').focus();
  };
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.rm-size').forEach(b => b.addEventListener('click', () => b.closest('.size-row')?.remove()));
  });

  /* ---------- boot ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initProductPage();
    initCartPage();
    initCheckout();
    initTabs();
    initReveal();
  });
})();
