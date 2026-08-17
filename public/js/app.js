/* =========================================================
   kukucha.tj — Фронтенд-барнома
   ========================================================= */
const API = '';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ====== Ҳолати сабад дар localStorage ======
const CART_KEY = 'kukucha_cart';
let cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
let productsCache = [];
let paymentInfo = { phone: '988757967', owner: 'Душанбе Сити' };
let appConfig = { botUsername: '', user: null, paymentPhone: '', paymentOwner: '' };
let currentUser = null;
let chatState = {
  open: false,
  lastId: 0,
  polling: false,
};

// Telegram Login Widget callback (бояд глобалӣ бошад)
window.onTelegramAuth = async function (user) {
  try {
    const r = await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Хато');
    currentUser = data.user;
    closeAuthModal();
    toast(`Хуш омадед, ${currentUser.first_name || 'дӯст'}! 👋`, 'success');
    renderUserArea();
    render();
    if (chatState.open) initChat();
  } catch (e) {
    toast(e.message, 'error');
  }
};

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}
function updateCartBadge() {
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const el = $('#cartCount');
  if (el) {
    el.textContent = count;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
}
function addToCart(product, size = null, color = null, qty = 1) {
  const key = `${product.id}__${size || ''}__${color || ''}`;
  const existing = cart.find((c) => c.key === key);
  if (existing) existing.qty += qty;
  else cart.push({ key, id: product.id, name: product.name, price: Number(product.price), size, color, qty, image: `/api/products/${product.id}/image` });
  saveCart();
  toast(`«${product.name}» ба сабад илова шуд 🛒`, 'success');
}
function removeFromCart(key) {
  cart = cart.filter((c) => c.key !== key);
  saveCart();
  render();
}
function changeQty(key, delta) {
  const item = cart.find((c) => c.key === key);
  if (!item) return;
  item.qty += delta;
  if (item.qty < 1) item.qty = 1;
  saveCart();
  render();
}
function cartTotal() {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}

// ====== Toast ======
let toastTimer;
function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 2800);
}

// ====== Modal ======
function openModal(html) {
  const m = $('#modal');
  $('#modalContent').innerHTML = html;
  m.classList.add('open');
}
function closeModal() {
  $('#modal').classList.remove('open');
}
window.closeModal = closeModal;

// ====== Конфиг + корбар ======
async function loadConfig() {
  try {
    const r = await fetch('/api/config');
    appConfig = await r.json();
    currentUser = appConfig.user;
    paymentInfo = {
      phone: appConfig.paymentPhone || '988757967',
      owner: appConfig.paymentOwner || 'Душанбе Сити',
    };
  } catch {}
}

async function refreshMe() {
  try {
    const r = await fetch('/api/auth/me');
    const data = await r.json();
    currentUser = data.user;
  } catch {}
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

function renderUserArea() {
  const area = $('#userArea');
  if (!area) return;
  if (!currentUser) {
    area.innerHTML = `
      <button class="login-btn" onclick="openAuthModal()">Войти</button>
      <a href="#/admin" class="admin-link" title="Админ">⚙️</a>`;
    return;
  }
  const avatar = currentUser.photo_url
    ? `<img src="${currentUser.photo_url}" alt="" referrerpolicy="no-referrer"/>`
    : `<span class="user-initial">${initials(currentUser.first_name || currentUser.username)}</span>`;
  area.innerHTML = `
    <div style="position:relative">
      <div class="user-chip" id="userChip">
        ${avatar}
        <span>${(currentUser.first_name || currentUser.username || 'Корбар').slice(0, 14)}</span>
        <span style="opacity:.5">▾</span>
      </div>
      <div class="user-menu" id="userMenu" style="display:none">
        ${currentUser.isAdmin ? `<button onclick="location.hash='#/admin'">⚙️ Панели админ</button>` : ''}
        <button onclick="document.getElementById('chatFab').click()">💬 Сӯҳбат</button>
        <button onclick="logout()">🚠 Баромадан</button>
      </div>
    </div>`;
  $('#userChip').addEventListener('click', (e) => {
    e.stopPropagation();
    const m = $('#userMenu');
    m.style.display = m.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', () => {
    const m = $('#userMenu');
    if (m) m.style.display = 'none';
  }, { once: true });
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  toast('Шумо баромадед');
  renderUserArea();
  if (location.hash.startsWith('#/admin') || location.hash.startsWith('#/checkout')) {
    location.hash = '/';
  } else {
    render();
  }
}

// ====== Модали воридшавӣ бо Telegram ======
let telegramScriptLoaded = false;
function loadTelegramScript() {
  if (telegramScriptLoaded) return;
  telegramScriptLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://telegram.org/js/telegram-widget.js?22';
  document.body.appendChild(s);
}

function openAuthModal(returnTo) {
  const m = $('#authModal');
  const c = $('#authModalContent');
  if (!appConfig.botUsername) {
    c.innerHTML = `
      <button class="auth-modal-close" onclick="closeAuthModal()">×</button>
      <h2>⚠️ Танзимоти бот нопурра</h2>
      <p>Лутфан BOT_USERNAME-ро дар Variables-и Railway муайян кунед.</p>`;
    m.classList.add('open');
    return;
  }
  c.innerHTML = `
    <button class="auth-modal-close" onclick="closeAuthModal()">×</button>
    <div style="font-size:3rem">🔐</div>
    <h2>Вуруд ба kukucha.tj</h2>
    <p>Бо Telegram ворид шавед — тез, бехатар ва бидуни парол</p>
    <div class="telegram-login-wrap">
      <script async
        src="https://telegram.org/js/telegram-widget.js?22"
        data-telegram-login="${appConfig.botUsername}"
        data-size="large"
        data-userpic="true"
        data-radius="12"
        data-onauth="onTelegramAuth(user)"
        data-request-access="write"></script>
    </div>
    <p class="auth-note">
      ⚙️ Бояд домени сайтро дар @BotFather танзим кунед:<br>
      <code>/setdomain</code> → ботро интихоб → домени худро фиристед
    </p>`;
  m.classList.add('open');
}
function closeAuthModal() {
  $('#authModal').classList.remove('open');
}
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.logout = logout;

// ====== Боргирии борҳо ======
async function fetchProducts(category) {
  const url = category && category !== 'all' ? `/api/products?category=${category}` : '/api/products';
  const r = await fetch(url);
  return r.json();
}

// ====== РОУТЕРИ ОДДӢ (hash) ======
function parseRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return { path, params };
}

async function render() {
  const { path, params } = parseRoute();
  window.scrollTo(0, 0);

  // Навсозии навигатсия
  $$('.nav-link').forEach((a) => a.classList.remove('active'));
  const activeLink = $(`.nav-link[data-route="${path}${params.cat ? '?cat=' + params.cat : ''}"]`);
  if (activeLink) activeLink.classList.add('active');

  // Hero танҳо дар саҳифаи асосӣ
  $('#hero').style.display = path === '/' ? '' : 'none';

  const app = $('#app');
  app.innerHTML = '';

  // Роутҳои муҳофизатшавандаи админ
  if (path.startsWith('/admin') || path === '/login') {
    const isAdmin = await checkAdmin();
    if (path === '/login') {
      if (isAdmin) return (location.hash = '/admin');
      return renderLogin(app);
    }
    if (!isAdmin) return (location.hash = '/login');
    return renderAdmin(app, params);
  }

  if (path === '/' || path === '/shop') return renderShop(app, params);
  if (path === '/cart') return renderCart(app);
  if (path === '/checkout') return renderCheckout(app);
  if (path === '/order') return renderOrderSuccess(app, params);
  if (path === '/track') return renderTrack(app);
  return renderShop(app, {});
}

async function checkAdmin() {
  try {
    const r = await fetch('/api/admin/me');
    return r.ok;
  } catch {
    return false;
  }
}

// ====== САҲИФАИ МАҒОЗА ======
async function renderShop(app, params) {
  const activeCat = params.cat || 'all';
  productsCache = await fetchProducts(activeCat);

  const catMap = {
    all: { emoji: '🛍️', name: 'Ҳамаи борҳо', cls: 'all' },
    libos: { emoji: '👕', name: 'Либосҳо', cls: 'libos' },
    bozicha: { emoji: '🧸', name: 'Бозичаҳо', cls: 'bozicha' },
  };

  app.innerHTML = `
    <section class="section">
      <div class="container">
        <div class="cat-grid reveal" id="catGrid">
          <div class="cat-card all" data-cat="all"><span class="cat-icon">🛍️</span>Ҳамаи борҳо<small>Намоиши ҳама</small></div>
          <div class="cat-card libos" data-cat="libos"><span class="cat-icon">👕</span>Либосҳо<small>Барои кӯдакон</small></div>
          <div class="cat-card bozicha" data-cat="bozicha"><span class="cat-icon">🧸</span>Бозичаҳо<small>Шодӣ ва рушд</small></div>
        </div>
      </div>
    </section>

    <section class="section" style="padding-top:0">
      <div class="container">
        <div class="section-head reveal">
          <h2 class="section-title">${catMap[activeCat]?.emoji || ''} ${catMap[activeCat]?.name || 'Борҳо'}</h2>
          <p class="section-sub">Беҳтарин борҳоро интихоб кунед</p>
        </div>
        <div class="filters reveal">
          <button class="filter-chip ${activeCat === 'all' ? 'active' : ''}" data-cat="all">Ҳама</button>
          <button class="filter-chip ${activeCat === 'libos' ? 'active' : ''}" data-cat="libos">👕 Либосҳо</button>
          <button class="filter-chip ${activeCat === 'bozicha' ? 'active' : ''}" data-cat="bozicha">🧸 Бозичаҳо</button>
        </div>
        <div class="products-grid" id="productsGrid"></div>
      </div>
    </section>
  `;

  $$('#catGrid .cat-card, .filter-chip').forEach((el) =>
    el.addEventListener('click', () => {
      const cat = el.dataset.cat;
      location.hash = cat === 'all' ? '/' : `/?cat=${cat}`;
    })
  );

  renderProducts(productsCache);
  observeReveals();
}

function renderProducts(products) {
  const grid = $('#productsGrid');
  if (!products.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span class="emoji">🔍</span><h3>Бор ёфт нашуд</h3></div>`;
    return;
  }
  grid.innerHTML = products
    .map(
      (p) => `
      <div class="product-card reveal" data-id="${p.id}">
        <div class="product-image">
          <span class="product-tag">${p.category === 'libos' ? '👕 Либос' : '🧸 Бозича'}</span>
          <img src="/api/products/${p.id}/image" alt="${p.name}" loading="lazy"
               onerror="this.style.display='none';this.parentElement.innerHTML+='<div style=&quot;font-size:4rem&quot;>📦</div>'" />
        </div>
        <div class="product-body">
          <div class="product-cat">${p.category === 'libos' ? 'Либос' : 'Бозича'}</div>
          <h3 class="product-name">${p.name}</h3>
          <div class="product-colors">
            ${(p.colors || []).slice(0, 4).map((c) => `<span class="color-dot" title="${c}" style="background:${colorToHex(c)}"></span>`).join('')}
          </div>
          <div class="product-price">${Number(p.price).toLocaleString('ru-RU')} сомонӣ</div>
          <button class="add-btn" data-add="${p.id}">🛒 Ба сабад</button>
        </div>
      </div>`
    )
    .join('');

  $$('.product-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) return;
      const id = Number(card.dataset.id);
      openProductModal(id);
    });
  });
  $$('[data-add]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.add);
      const p = products.find((x) => x.id === id);
      // Агар бор як размер/ранг дошта бошад, бевосита меандозем
      const sizes = p.sizes || [];
      const colors = p.colors || [];
      if (sizes.length <= 1 && colors.length <= 1) {
        addToCart(p, sizes[0] || null, colors[0] || null);
      } else {
        openProductModal(id);
      }
    })
  );
  observeReveals();
}

function colorToHex(name) {
  const map = {
    сурх: '#e74c3c', кабуд: '#3498db', зард: '#f1c40f', сабз: '#27ae60',
    сиёҳ: '#2c3e50', сафед: '#ecf0f1', гулобӣ: '#ff9ec7', қаҳваранг: '#8b5a2b',
    норинҷӣ: '#e67e22', бунафш: '#9b59b6', хокистарӣ: '#95a5a6',
  };
  return map[String(name).toLowerCase()] || '#ddd';
}

async function openProductModal(id) {
  const r = await fetch(`/api/products/${id}`);
  const p = await r.json();
  let selectedSize = (p.sizes || [])[0] || null;
  let selectedColor = (p.colors || [])[0] || null;

  openModal(`
    <div class="product-detail">
      <div class="pd-image">
        <img src="/api/products/${p.id}/image" alt="${p.name}"
          onerror="this.style.display='none';this.parentElement.innerHTML+='<div style=&quot;font-size:5rem&quot;>📦</div>'" />
      </div>
      <div class="pd-info">
        <span class="close" onclick="closeModal()" style="position:absolute;top:16px;right:20px;font-size:1.6rem;cursor:pointer">✕</span>
        <div class="product-cat">${p.category === 'libos' ? 'Либос' : 'Бозича'}</div>
        <h2>${p.name}</h2>
        <p class="pd-desc">${p.description || ''}</p>
        <div class="pd-price">${Number(p.price).toLocaleString('ru-RU')} сомонӣ</div>
        ${(p.sizes || []).length ? `
          <div class="form-group">
            <label>Размер</label>
            <div class="option-chips" id="sizeChips">
              ${p.sizes.map((s, i) => `<button type="button" class="option-chip ${i === 0 ? 'selected' : ''}" data-size="${s}">${s}</button>`).join('')}
            </div>
          </div>` : ''}
        ${(p.colors || []).length ? `
          <div class="form-group">
            <label>Ранг</label>
            <div class="option-chips" id="colorChips">
              ${p.colors.map((c, i) => `<button type="button" class="option-chip ${i === 0 ? 'selected' : ''}" data-color="${c}">${c}</button>`).join('')}
            </div>
          </div>` : ''}
        <button class="btn btn-primary btn-block btn-lg" id="modalAdd">🛒 Ба сабад илова кардан</button>
      </div>
    </div>
  `);

  $$('#sizeChips .option-chip').forEach((c) =>
    c.addEventListener('click', () => {
      $$('#sizeChips .option-chip').forEach((x) => x.classList.remove('selected'));
      c.classList.add('selected');
      selectedSize = c.dataset.size;
    })
  );
  $$('#colorChips .option-chip').forEach((c) =>
    c.addEventListener('click', () => {
      $$('#colorChips .option-chip').forEach((x) => x.classList.remove('selected'));
      c.classList.add('selected');
      selectedColor = c.dataset.color;
    })
  );
  $('#modalAdd').addEventListener('click', () => {
    addToCart(p, selectedSize, selectedColor);
    closeModal();
  });
}

// ====== САБАД ======
function renderCart(app) {
  if (!cart.length) {
    app.innerHTML = `
      <section class="section"><div class="container">
        <div class="empty-state">
          <span class="emoji">🛒</span>
          <h3>Сабади шумо холӣ аст</h3>
          <p>Ба мағоза равед ва борҳои дилхоҳатонро интихоб кунед</p>
          <a href="#/" class="btn btn-primary btn-lg">Ба мағоза →</a>
        </div>
      </div></section>`;
    return;
  }

  app.innerHTML = `
    <section class="section"><div class="container">
      <h1 class="section-title" style="margin-bottom:30px">🛒 Сабади харид</h1>
      <div class="cart-layout">
        <div class="cart-items" id="cartItems"></div>
        <div class="cart-summary">
          <h3>Ҷамъбаст</h3>
          <div class="summary-row"><span>Маблағи борҳо:</span><span id="sumSubtotal">0</span></div>
          <div class="summary-row"><span>Расондан:</span><span>Баъд аз тамос</span></div>
          <div class="summary-row total"><span>Ҷамъ:</span><span id="sumTotal">0</span></div>
          <a href="#/checkout" class="btn btn-primary btn-block btn-lg" style="margin-top:16px">Сабт кардан →</a>
          <a href="#/" class="btn btn-ghost btn-block" style="margin-top:8px">Баргаштан ба харид</a>
        </div>
      </div>
    </div></section>`;

  const itemsEl = $('#cartItems');
  itemsEl.innerHTML = cart
    .map(
      (i) => `
      <div class="cart-item">
        <img src="${i.image}" alt="${i.name}" onerror="this.style.display='none'" />
        <div>
          <h4>${i.name}</h4>
          <div class="cart-item-meta">
            ${i.size ? `📏 ${i.size}` : ''}${i.size && i.color ? ' · ' : ''}${i.color ? `🎨 ${i.color}` : ''}
          </div>
          <div class="qty-control">
            <button data-dec="${i.key}">−</button>
            <span>${i.qty}</span>
            <button data-inc="${i.key}">+</button>
          </div>
          <a class="remove-btn" data-rm="${i.key}">Нест кардан</a>
        </div>
        <div class="cart-item-price">${(i.price * i.qty).toLocaleString('ru-RU')} c.</div>
      </div>`
    )
    .join('');

  $$('[data-inc]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.inc, 1)));
  $$('[data-dec]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.dec, -1)));
  $$('[data-rm]').forEach((b) => b.addEventListener('click', () => removeFromCart(b.dataset.rm)));

  const total = cartTotal();
  $('#sumSubtotal').textContent = total.toLocaleString('ru-RU') + ' сомонӣ';
  $('#sumTotal').textContent = total.toLocaleString('ru-RU') + ' сомонӣ';
}

// ====== CHECKOUT ======
function renderCheckout(app) {
  if (!cart.length) return (location.hash = '/cart');
  if (!currentUser) {
    app.innerHTML = `
      <section class="section"><div class="container">
        <div class="form-card" style="text-align:center">
          <div style="font-size:3rem">🔐</div>
          <h2>Барои идома вуруд лозим аст</h2>
          <p style="color:var(--muted);margin:10px 0 20px">
            Лутфан пеш аз сабти фармоиш бо Telegram ворид шавед.
          </p>
          <button class="btn btn-primary btn-lg" onclick="openAuthModal()">Ворид шудан бо Telegram</button>
          <a href="#/cart" class="btn btn-ghost btn-lg" style="margin-left:8px">Баргаштан</a>
        </div>
      </div></section>`;
    openAuthModal();
    return;
  }
  const total = cartTotal();

  app.innerHTML = `
    <section class="section"><div class="container">
      <h1 class="section-title" style="margin-bottom:30px">📦 Сабти фармоиш</h1>
      <form class="form-card" id="orderForm">
        <h3 style="margin-bottom:18px">Маълумоти шумо</h3>
        <div class="form-group">
          <label>Ному насаб *</label>
          <input name="customer_name" required placeholder="Масалан: Аҳмадҷон Каримов"
                 value="${currentUser ? (currentUser.first_name + ' ' + (currentUser.last_name || '')).trim() : ''}" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Рақами телефон *</label>
            <input name="customer_phone" required placeholder="+992 ..." />
          </div>
          <div class="form-group">
            <label>Шаҳр/ноҳия *</label>
            <input name="address" required placeholder="Душанбе, кӯчаи ..." />
          </div>
        </div>
        <div class="form-group">
          <label>Шарҳ (ихтиёрӣ)</label>
          <textarea name="comment" rows="2" placeholder="Масалан: соати 16:00–18:00 занг занед"></textarea>
        </div>

        <div class="payment-box">
          <h4>💳 Тарзи пардохт</h4>
          <p>Маблағро ба ҳамёни зерин гузаронед ва квитансияро замима кунед:</p>
          <div class="payment-phone">📞 ${paymentInfo.phone}</div>
          <p style="text-align:center;font-size:.9rem;color:#856404">${paymentInfo.owner}</p>
          <p style="font-size:.85rem;margin-top:8px"><strong>Маблағ:</strong> ${total.toLocaleString('ru-RU')} сомонӣ</p>
        </div>

        <div class="form-group">
          <label>Чеки пардохт (акс) *</label>
          <label class="upload-zone" id="uploadZone">
            <input type="file" name="receipt" accept="image/*" required id="receiptInput" />
            <div id="uploadText">
              <div style="font-size:2.5rem">📤</div>
              <p><strong>Сурати чекро бор кунед</strong></p>
              <p style="font-size:.85rem;color:var(--muted)">JPG, PNG ё WEBP (то 8 МБ)</p>
            </div>
          </label>
        </div>

        <button type="submit" class="btn btn-primary btn-block btn-lg" id="submitBtn">
          ✅ Фармоишро фиристодан
        </button>
      </form>
    </div></section>`;

  const input = $('#receiptInput');
  input.addEventListener('change', () => {
    if (input.files[0]) {
      $('#uploadZone').classList.add('has-file');
      const reader = new FileReader();
      reader.onload = (e) => {
        $('#uploadText').innerHTML = `
          <img src="${e.target.result}" class="upload-preview" />
          <p style="margin-top:8px;font-weight:700;color:var(--mint)">✓ ${input.files[0].name}</p>
          <p style="font-size:.85rem;color:var(--muted)">Барои иваз кардан клик кунед</p>`;
      };
      reader.readAsDataURL(input.files[0]);
    }
  });

  $('#orderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#submitBtn');
    btn.disabled = true;
    btn.textContent = 'Фиристода мешавад...';

    try {
      const fd = new FormData(e.target);
      // Аввал фармоишро эҷод мекунем
      const orderData = new FormData();
      orderData.append('customer_name', fd.get('customer_name'));
      orderData.append('customer_phone', fd.get('customer_phone'));
      orderData.append('address', fd.get('address'));
      orderData.append('comment', fd.get('comment') || '');
      orderData.append('items', JSON.stringify(cart.map((c) => ({ id: c.id, qty: c.qty, size: c.size, color: c.color, name: c.name, price: c.price }))));

      const r = await fetch('/api/orders', { method: 'POST', body: orderData });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || 'Хато');

      // Акнун чекро бор мекунем
      const recData = new FormData();
      recData.append('receipt', fd.get('receipt'));
      const r2 = await fetch(`/api/orders/${result.order.id}/receipt`, { method: 'POST', body: recData });
      const res2 = await r2.json();
      if (!r2.ok) throw new Error(res2.error || 'Хато ҳангоми боркунии чек');

      cart = [];
      saveCart();
      location.hash = `#/order?code=${result.order.order_code}`;
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = '✅ Фармоишро фиристодан';
    }
  });
}

// ====== ФАРМОИШИ МУВАФФАҚ ======
function renderOrderSuccess(app, params) {
  const code = params.code;
  app.innerHTML = `
    <section class="section"><div class="container">
      <div class="success-card">
        <div class="success-icon">✓</div>
        <h1 class="section-title">Ташаккур!</h1>
        <p style="color:var(--muted);margin-bottom:20px">Фармоиши шумо қабул шуд ва ба админ фиристода шуд. Дар кӯтоҳтарин фурсат бо шумо тамос мегирем.</p>
        <p>Рамзи пайгирии фармоиш:</p>
        <div class="order-code-box">${code}</div>
        <p style="font-size:.9rem;color:var(--muted)">Ин рамзро нигоҳ доред — бо он метавонед вазъи фармоишро пайгирӣ кунед.</p>
        <div style="margin-top:24px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <a href="#/track" class="btn btn-secondary">Пайгирии фармоиш</a>
          <a href="#/" class="btn btn-ghost">Ба мағоза</a>
        </div>
      </div>
    </div></section>`;
}

// ====== ПАЙГИРӢ ======
function renderTrack(app) {
  app.innerHTML = `
    <section class="section"><div class="container">
      <div class="form-card">
        <h2 style="margin-bottom:8px">🔍 Пайгирии фармоиш</h2>
        <p style="color:var(--muted);margin-bottom:20px">Рамзи фармоиши худро ворид кунед (масалан: KK-260815-AB3XQ)</p>
        <form id="trackForm">
          <div class="form-group">
            <label>Рамзи фармоиш</label>
            <input name="code" required placeholder="KK-XXXXXX-XXXXX" style="text-transform:uppercase" />
          </div>
          <button class="btn btn-primary btn-block btn-lg" type="submit">Санҷидан</button>
        </form>
        <div id="trackResult" style="margin-top:20px"></div>
      </div>
    </div></section>`;

  $('#trackForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get('code').trim();
    const r = await fetch(`/api/orders/status/${code}`);
    const data = await r.json();
    const resEl = $('#trackResult');
    if (!r.ok) {
      resEl.innerHTML = `<div class="status-badge status-rejected">${data.error || 'Ёфт нашуд'}</div>`;
      return;
    }
    const labels = {
      pending: { text: 'Дар интизорӣ — чек қабул шуд, админ баррасӣ мекунад', cls: 'status-pending', icon: '⏳' },
      confirmed: { text: 'Тасдиқ шуд! Фармоиши шумо омода карда мешавад', cls: 'status-confirmed', icon: '✅' },
      rejected: { text: 'Фармоиш рад шуд. Лутфан бо мо тамос гиред', cls: 'status-rejected', icon: '❌' },
    };
    const s = labels[data.status] || labels.pending;
    resEl.innerHTML = `
      <div style="text-align:center;padding:20px;background:var(--bg);border-radius:var(--radius)">
        <div style="font-size:2.5rem">${s.icon}</div>
        <div class="status-badge ${s.cls}">${s.text}</div>
        <p style="margin-top:12px;color:var(--muted)">Рамз: <strong>${data.order_code}</strong></p>
        <p style="color:var(--muted)">Маблағ: <strong>${Number(data.total).toLocaleString('ru-RU')} сомонӣ</strong></p>
        <p style="color:var(--muted)">Сана: ${new Date(data.created_at).toLocaleString('tg-TJ')}</p>
      </div>`;
  });
}

// ====== ВОРИДШАВӢ (АДМИН) — Telegram Widget ======
function renderLogin(app) {
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card" id="loginCard">
        <div class="logo"><span class="logo-emoji">🧸</span> kukucha<span class="logo-dot">.tj</span></div>
        <h2>Панели админ</h2>
        <p style="color:var(--muted);margin-bottom:16px">Бо Telegram ворид шавед</p>
        <div class="telegram-login-wrap" id="tgLoginWrap"></div>
        <p class="auth-note">
          ⚙️ Боварӣ ҳосил кунед, ки домени сайт дар @BotFather бо <code>/setdomain</code> танзим шудааст.
        </p>
      </div>
    </div>`;
  // Telegram widget-ро динамикӣ илова мекунем
  if (appConfig.botUsername) {
    const wrap = $('#tgLoginWrap');
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.setAttribute('data-telegram-login', appConfig.botUsername);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-userpic', 'true');
    s.setAttribute('data-radius', '12');
    s.setAttribute('data-onauth', 'onTelegramAuth(user)');
    s.setAttribute('data-request-access', 'write');
    wrap.appendChild(s);
  }
}

// ====== АДМИН-ПАНЕЛ ======
let adminTab = 'orders';
async function renderAdmin(app) {
  app.innerHTML = `
    <section class="section" style="padding-top:20px"><div class="container">
      <div class="admin-layout">
        <aside class="admin-sidebar">
          <div style="font-weight:900;font-size:1.1rem;margin-bottom:10px">⚙️ Идоракунӣ</div>
          <div class="admin-tab ${adminTab === 'orders' ? 'active' : ''}" data-tab="orders">📦 Фармоишҳо</div>
          <div class="admin-tab ${adminTab === 'products' ? 'active' : ''}" data-tab="products">🛍️ Борҳо</div>
          <div class="admin-tab ${adminTab === 'stats' ? 'active' : ''}" data-tab="stats">📊 Омор</div>
          <h3>Ҳисоб</h3>
          <div class="admin-tab" id="logoutBtn">🚪 Баромадан</div>
        </aside>
        <div class="admin-main" id="adminMain"></div>
      </div>
    </div></section>`;

  $$('.admin-tab[data-tab]').forEach((t) =>
    t.addEventListener('click', () => {
      adminTab = t.dataset.tab;
      renderAdmin(app);
    })
  );
  $('#logoutBtn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    location.hash = '/login';
  });

  if (adminTab === 'orders') renderAdminOrders($('#adminMain'));
  if (adminTab === 'products') renderAdminProducts($('#adminMain'));
  if (adminTab === 'stats') renderAdminStats($('#adminMain'));
}

async function renderAdminStats(el) {
  const r = await fetch('/api/admin/stats');
  const s = await r.json();
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-num">${s.products}</div><div class="stat-label">Борҳо</div></div>
      <div class="stat-card"><div class="stat-num">${s.orders}</div><div class="stat-label">Ҳамаи фармоишҳо</div></div>
      <div class="stat-card"><div class="stat-num" style="color:#cc7a00">${s.pending}</div><div class="stat-label">Дар интизорӣ</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--mint)">${s.revenue.toLocaleString('ru-RU')}</div><div class="stat-label">Даромади тасдиқшуда (сом.)</div></div>
    </div>`;
}

async function renderAdminOrders(el) {
  const r = await fetch('/api/admin/orders');
  const orders = await r.json();
  const statusMap = {
    pending: { text: '⏳ Дар интизорӣ', cls: 'status-pending' },
    confirmed: { text: '✅ Тасдиқшуда', cls: 'status-confirmed' },
    rejected: { text: '❌ Радшуда', cls: 'status-rejected' },
  };
  el.innerHTML = `
    <div class="admin-panel">
      <div class="admin-panel-head">
        <h2>📦 Фармоишҳо (${orders.length})</h2>
        <select id="orderFilter" class="form-control" style="padding:8px 14px;border-radius:10px;border:2px solid var(--border)">
          <option value="all">Ҳама</option>
          <option value="pending">Дар интизорӣ</option>
          <option value="confirmed">Тасдиқшуда</option>
          <option value="rejected">Радшуда</option>
        </select>
      </div>
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr>
          <th>Рамз</th><th>Харидор</th><th>Телефон</th><th>Борҳо</th>
          <th>Маблағ</th><th>Вазъ</th><th>Сана</th><th>Амалҳо</th>
        </tr></thead>
        <tbody id="ordersTbody"></tbody>
      </table></div>
    </div>`;

  function draw(filter = 'all') {
    const list = filter === 'all' ? orders : orders.filter((o) => o.status === filter);
    $('#ordersTbody').innerHTML = list
      .map((o) => {
        const items = (o.items || [])
          .map((i) => `${i.name}${i.size ? ' (' + i.size + ')' : ''} ×${i.qty}`)
          .join('<br>');
        return `<tr>
          <td><strong>${o.order_code}</strong></td>
          <td>${o.customer_name}<br><small style="color:var(--muted)">${o.address}</small></td>
          <td><a href="tel:${o.customer_phone}">${o.customer_phone}</a></td>
          <td style="font-size:.85rem">${items}</td>
          <td><strong>${Number(o.total).toLocaleString('ru-RU')} c.</strong></td>
          <td><span class="status-badge ${statusMap[o.status].cls}">${statusMap[o.status].text}</span></td>
          <td style="font-size:.8rem;color:var(--muted)">${new Date(o.created_at).toLocaleString('tg-TJ')}</td>
          <td class="admin-actions">
            ${o.has_receipt ? `<button class="icon-btn" data-receipt="${o.id}" title="Чек">🧾</button>` : ''}
            ${o.status === 'pending' ? `
              <button class="icon-btn" data-confirm="${o.id}" title="Тасдиқ">✅</button>
              <button class="icon-btn" data-reject="${o.id}" title="Рад">❌</button>` : ''}
          </td>
        </tr>`;
      })
      .join('');

    $$('[data-receipt]').forEach((b) =>
      b.addEventListener('click', () => window.open(`/api/admin/orders/${b.dataset.receipt}/receipt`, '_blank'))
    );
    $$('[data-confirm]').forEach((b) =>
      b.addEventListener('click', async () => {
        await setOrderStatus(b.dataset.confirm, 'confirmed');
        toast('Тасдиқ шуд', 'success');
        renderAdminOrders(el);
      })
    );
    $$('[data-reject]').forEach((b) =>
      b.addEventListener('click', async () => {
        await setOrderStatus(b.dataset.reject, 'rejected');
        toast('Рад шуд', 'error');
        renderAdminOrders(el);
      })
    );
  }
  draw();
  $('#orderFilter').addEventListener('change', (e) => draw(e.target.value));
}

async function setOrderStatus(id, status) {
  await fetch(`/api/admin/orders/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

async function renderAdminProducts(el) {
  const r = await fetch('/api/admin/products');
  const products = await r.json();
  el.innerHTML = `
    <div class="admin-panel">
      <div class="admin-panel-head">
        <h2>🛍️ Борҳо (${products.length})</h2>
        <button class="btn btn-primary" id="addProductBtn">+ Иловаи бор</button>
      </div>
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>Акс</th><th>Ном</th><th>Категория</th><th>Нарх</th><th>Боқимонда</th><th>Вазъ</th><th>Амалҳо</th></tr></thead>
        <tbody>
          ${products
            .map(
              (p) => `<tr>
            <td><img src="/api/products/${p.id}/image" class="thumb" onerror="this.style.display='none'"/></td>
            <td><strong>${p.name}</strong></td>
            <td>${p.category === 'libos' ? '👕 Либос' : '🧸 Бозича'}</td>
            <td>${Number(p.price).toLocaleString('ru-RU')} c.</td>
            <td>${p.stock}</td>
            <td><span class="badge ${p.is_active ? 'badge-active' : 'badge-inactive'}">${p.is_active ? 'Фаъол' : 'Хомӯш'}</span></td>
            <td class="admin-actions">
              <button class="icon-btn" data-edit="${p.id}" title="Таҳрир">✏️</button>
              <button class="icon-btn" data-del="${p.id}" title="Нест кардан">🗑️</button>
            </td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table></div>
    </div>`;

  $('#addProductBtn').addEventListener('click', () => openProductEditor(null));
  $$('[data-edit]').forEach((b) =>
    b.addEventListener('click', async () => {
      const id = b.dataset.edit;
      const r = await fetch(`/api/products/${id}`);
      const p = await r.json();
      openProductEditor(p);
    })
  );
  $$('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Ин бор нест карда шавад?')) return;
      await fetch(`/api/admin/products/${b.dataset.del}`, { method: 'DELETE' });
      renderAdminProducts(el);
    })
  );
}

function openProductEditor(p) {
  const isEdit = !!p;
  const sizes = isEdit ? (p.sizes || []).join(', ') : '';
  const colors = isEdit ? (p.colors || []).join(', ') : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="position:relative">
      <span class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</span>
      <h2>${isEdit ? 'Таҳрири бор' : 'Бори нав'}</h2>
      <form id="prodForm" style="margin-top:18px">
        <div class="form-group">
          <label>Ном *</label>
          <input name="name" value="${p?.name || ''}" required />
        </div>
        <div class="form-group">
          <label>Тавсиф</label>
          <textarea name="description" rows="2">${p?.description || ''}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Нарх (сомонӣ) *</label>
            <input name="price" type="number" step="0.01" value="${p?.price || ''}" required />
          </div>
          <div class="form-group">
            <label>Боқимонда</label>
            <input name="stock" type="number" value="${p?.stock || 0}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Категория</label>
            <select name="category">
              <option value="libos" ${p?.category === 'libos' ? 'selected' : ''}>👕 Либос</option>
              <option value="bozicha" ${p?.category === 'bozicha' ? 'selected' : ''}>🧸 Бозича</option>
            </select>
          </div>
          <div class="form-group">
            <label>Фаъол</label>
            <select name="is_active">
              <option value="true" ${p?.is_active !== false ? 'selected' : ''}>Бале</option>
              <option value="false" ${p?.is_active === false ? 'selected' : ''}>Не</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Размерҳо (бо вергул ҷудо кунед)</label>
          <input name="sizes" value="${sizes}" placeholder="Масалан: 1-2 сол, 2-3 сол, 3-4 сол" />
        </div>
        <div class="form-group">
          <label>Рангҳо (бо вергул ҷудо кунед)</label>
          <input name="colors" value="${colors}" placeholder="Масалан: Сурх, Кабуд, Зард" />
        </div>
        <div class="form-group">
          <label>Акс ${isEdit ? '(агар иваз накунед, холӣ монед)' : '*'}</label>
          <input type="file" name="image" accept="image/*" ${isEdit ? '' : 'required'} />
        </div>
        <button type="submit" class="btn btn-primary btn-block btn-lg">${isEdit ? 'Сабт кардан' : 'Илова кардан'}</button>
      </form>
    </div>`;
  document.body.appendChild(overlay);

  $('#prodForm', overlay).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const sizes = (fd.get('sizes') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const colors = (fd.get('colors') || '').split(',').map((s) => s.trim()).filter(Boolean);
    fd.set('sizes', JSON.stringify(sizes));
    fd.set('colors', JSON.stringify(colors));

    const url = isEdit ? `/api/admin/products/${p.id}` : '/api/admin/products';
    const method = isEdit ? 'PUT' : 'POST';
    const r = await fetch(url, { method, body: fd });
    const data = await r.json();
    if (!r.ok) {
      toast(data.error || 'Хато', 'error');
      return;
    }
    toast('Бор сабт шуд', 'success');
    overlay.remove();
    renderAdminProducts($('#adminMain'));
  });
}

// ====== Reveal on scroll ======
let io;
function observeReveals() {
  if (!io) {
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('visible');
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.1 }
    );
  }
  $$('.reveal').forEach((el) => {
    if (!el.classList.contains('visible')) io.observe(el);
  });
}

// ====== Чат бо менеҷер ======
function toggleChat() {
  chatState.open = !chatState.open;
  $('#chatWidget').classList.toggle('open', chatState.open);
  if (chatState.open) initChat();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function addChatMessage(text, who) {
  const body = $('#chatBody');
  if (!body) return;
  const div = document.createElement('div');
  div.className = `chat-msg ${who === 'me' ? 'me' : who === 'them' ? 'them' : 'system'}`;
  div.innerHTML = `${escapeHtml(text)}<time>${new Date().toLocaleTimeString('tg-TJ', { hour: '2-digit', minute: '2-digit' })}</time>`;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function renderChatLogin() {
  $('#chatBody').innerHTML = `
    <div class="chat-login-prompt">
      <div class="emoji">🔐</div>
      <p><strong>Барои сӯҳбат ворид шавед</strong></p>
      <p style="color:var(--muted);font-size:.88rem;margin:8px 0 14px">
        Бо Telegram ворид шавед, то бо менеҷер сӯҳбат кунед.
      </p>
      <button class="btn btn-primary" onclick="openAuthModal()">Ворид шудан</button>
    </div>`;
}

async function initChat() {
  if (!currentUser) {
    renderChatLogin();
    return;
  }
  if (chatState.polling) return;
  chatState.polling = true;

  // Бор кардани таърих
  try {
    const r = await fetch('/api/chat/history?after=0');
    const data = await r.json();
    if (!r.ok) throw new Error();
    $('#chatBody').innerHTML =
      '<div class="chat-msg system">Салом! 👋 Паёми худро нависед, менеҷер ҷавоб медиҳад.</div>';
    (data.messages || []).forEach((m) =>
      addChatMessage(m.text, m.from_admin ? 'them' : 'me')
    );
    if (data.messages.length) chatState.lastId = data.messages[data.messages.length - 1].id;
  } catch {
    $('#chatBody').innerHTML =
      '<div class="chat-msg system">Хато ҳангоми боркунии сӯҳбат</div>';
  }

  // Long-polling барои паёмҳои нав
  pollChat();
}

async function pollChat() {
  while (chatState.open && currentUser) {
    try {
      const r = await fetch(`/api/chat/history?after=${chatState.lastId}`);
      const data = await r.json();
      if (!r.ok) throw new Error();
      (data.messages || []).forEach((m) => {
        addChatMessage(m.text, m.from_admin ? 'them' : 'me');
        chatState.lastId = m.id;
        if (m.from_admin) {
          // Бонги визуалӣ
          if (!document.hasFocus()) toast('💬 Паёми нав аз менеҷер', 'success');
        }
      });
      if (data.messages?.some((m) => m.from_admin)) updateUnreadBadge();
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  chatState.polling = false;
}

async function updateUnreadBadge() {
  try {
    if (!currentUser) return;
    const r = await fetch('/api/chat/unread');
    const data = await r.json();
    const badge = $('#chatUnread');
    if (data.unread > 0) {
      badge.style.display = 'flex';
      badge.textContent = data.unread;
    } else {
      badge.style.display = 'none';
    }
  } catch {}
}

async function sendChatMessage(e) {
  e.preventDefault();
  const input = $('#chatText');
  const text = input.value.trim();
  if (!text || !currentUser) return;
  input.value = '';
  addChatMessage(text, 'me');
  try {
    const r = await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) throw new Error();
  } catch {
    toast('Хато ҳангоми фиристодани паём', 'error');
  }
}

// ====== Ибтидо ======
window.addEventListener('hashchange', render);
window.addEventListener('scroll', () => {
  $('#header').classList.toggle('scrolled', window.scrollY > 10);
});

(async function init() {
  await loadConfig();
  renderUserArea();
  updateCartBadge();

  // Чат
  $('#chatFab').addEventListener('click', toggleChat);
  $('#chatClose').addEventListener('click', toggleChat);
  $('#chatForm').addEventListener('submit', sendChatMessage);
  if (currentUser) updateUnreadBadge();
  setInterval(() => { if (currentUser) updateUnreadBadge(); }, 15000);

  await render();
  observeReveals();
  setTimeout(() => $('#loader').classList.add('hidden'), 400);
})();
