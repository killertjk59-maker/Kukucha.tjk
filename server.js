const express = require('express');
const session = require('express-session');
const path = require('path');
const { db, q, hashPassword, verifyPassword, fmtMoney } = require('./db.js');

const app = express();
const PORT = process.env.PORT || 3001;
const SESSION_SECRET = process.env.SESSION_SECRET || 'kukucha-secret-2026';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, httpOnly: true },
}));

// ---------- middleware ----------
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    req.session.afterLogin = req.originalUrl;
    return res.redirect('/login');
  }
  const user = q.userById.get(req.session.userId);
  if (!user) { req.session.destroy(); return res.redirect('/login'); }
  req.user = user;
  res.locals.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).render('error', { title: 'Дастрасӣ манъ аст', code: 403, message: 'Ба ин саҳифа танҳо админ ворид шуда метавонад.' });
  }
  next();
}

function flash(req, type, text) {
  req.session.flash = req.session.flash || [];
  req.session.flash.push({ type, text });
}

app.use((req, res, next) => {
  res.locals.appName = 'Kukucha';
  res.locals.path = req.path;
  res.locals.flash = req.session.flash || [];
  req.session.flash = [];
  res.locals.fmt = fmtMoney;
  res.locals.categories = q.categoriesPublished.all();
  res.locals.cartCount = req.session.cartCount || 0;
  res.locals.activeCat = null;
  res.locals.qs = '';
  res.locals.user = req.session.userId ? (q.userById.get(req.session.userId) || null) : null;
  next();
});

// ---------- product helpers ----------
function productView(p) {
  const sizes = q.sizesByProduct.all(p.id).filter(s => s.stock > 0);
  const totalStock = p.has_sizes ? sizes.reduce((a, s) => a + s.stock, 0) : p.stock;
  return { ...p, sizes, totalStock, discount: p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0 };
}

function catalogProducts({ category, qs, sort, min, max }) {
  let sql = 'SELECT * FROM products WHERE is_published=1';
  const params = [];
  if (category) { sql += ' AND category_id=?'; params.push(category); }
  if (min) { sql += ' AND price>=?'; params.push(Number(min)); }
  if (max) { sql += ' AND price<=?'; params.push(Number(max)); }
  const order = {
    'new': 'ORDER BY created_at DESC, id DESC',
    'price_asc': 'ORDER BY price ASC',
    'price_desc': 'ORDER BY price DESC',
    'rating': 'ORDER BY rating DESC',
  }[sort] || 'ORDER BY created_at DESC, id DESC';
  sql += ' ' + order;
  let items = db.prepare(sql).all(...params);
  // Unicode-safe search (SQLite LIKE is ASCII-only for case folding)
  if (qs) {
    const ql = qs.toLowerCase();
    items = items.filter(p =>
      (p.title || '').toLowerCase().includes(ql) ||
      (p.description || '').toLowerCase().includes(ql)
    );
  }
  return items;
}

function cartFromSession(req) {
  const items = req.session.cart || [];
  return items.map(it => {
    const p = q.productById.get(it.productId);
    if (!p) return null;
    return {
      ...it,
      product: p,
      sizeLabel: it.size || 'Стандарт',
      lineTotal: p.price * it.qty,
    };
  }).filter(Boolean);
}

function cartTotals(items) {
  const subtotal = items.reduce((a, i) => a + i.lineTotal, 0);
  return { subtotal, count: items.reduce((a, i) => a + i.qty, 0) };
}

// ---------- public: home ----------
app.get('/', (req, res) => {
  const featured = q.productsFeatured.all().map(productView);
  const newArrivals = q.productsPublished.all().slice(0, 8).map(productView);
  const cats = q.categoriesPublished.all().map(c => ({
    ...c,
    count: q.productCountByCategory.get(c.id).c,
  }));
  res.render('shop/home', { title: 'Бозичаҳо ва либоси кӯдакона — Kukucha', featured, newArrivals, cats });
});

// ---------- catalog ----------
app.get('/catalog', (req, res) => {
  const category = parseInt(req.query.category) || null;
  const qs = (req.query.q || '').trim();
  const sort = req.query.sort || 'new';
  const min = req.query.min || '';
  const max = req.query.max || '';
  const items = catalogProducts({ category, qs, sort, min, max }).map(productView);
  const cats = q.categoriesPublished.all().map(c => ({ ...c, count: q.productCountByCategory.get(c.id).c }));
  const activeCat = category ? q.categoryById.get(category) : null;
  res.render('shop/catalog', { title: qs ? `Ҷустуҷӯ: ${qs}` : 'Каталог', items, cats, activeCat, qs, sort, min, max });
});

// ---------- product page ----------
app.get('/product/:id', (req, res) => {
  const p = q.productById.get(parseInt(req.params.id));
  if (!p || !p.is_published) return res.status(404).render('error', { title: 'Ёфт нашуд', code: 404, message: 'Маҳсулот ёфт нашуд.' });
  const product = productView(p);
  const similar = q.productsPublished.all().filter(x => x.category_id === p.category_id && x.id !== p.id).slice(0, 4).map(productView);
  const cat = q.categoryById.get(p.category_id);
  res.render('shop/product', { title: p.title, product, similar, cat });
});

// ---------- cart ----------
app.get('/cart', (req, res) => {
  const items = cartFromSession(req);
  const totals = cartTotals(items);
  res.render('shop/cart', { title: 'Сабади харид', items, totals });
});

// ---------- API: cart ----------
app.post('/api/cart', (req, res) => {
  const { productId, size, qty } = req.body;
  const p = q.productById.get(parseInt(productId));
  if (!p || !p.is_published) return res.json({ ok: false, error: 'Маҳсулот ёфт нашуд' });
  const n = Math.max(1, parseInt(qty) || 1);

  // stock check
  let available = p.stock;
  if (p.has_sizes) {
    const s = q.sizesByProduct.all(p.id).find(x => x.size === size);
    if (!s || s.stock <= 0) return res.json({ ok: false, error: 'Ин андоза мавҷуд нест' });
    available = s.stock;
  }
  if (available <= 0) return res.json({ ok: false, error: 'Мол тамом шудааст' });

  req.session.cart = req.session.cart || [];
  const existing = req.session.cart.find(i => i.productId === p.id && (i.size || '') === (size || ''));
  const newQty = Math.min((existing ? existing.qty : 0) + n, available);
  if (existing) existing.qty = newQty;
  else req.session.cart.push({ productId: p.id, size: size || '', qty: newQty });

  req.session.cartCount = req.session.cart.reduce((a, i) => a + i.qty, 0);
  res.json({ ok: true, cartCount: req.session.cartCount });
});

app.post('/api/cart/update', (req, res) => {
  const { productId, size, qty } = req.body;
  const items = req.session.cart || [];
  const it = items.find(i => i.productId === parseInt(productId) && (i.size || '') === (size || ''));
  if (it) {
    const n = parseInt(qty);
    if (n <= 0) {
      req.session.cart = items.filter(i => i !== it);
    } else {
      it.qty = n;
    }
    req.session.cartCount = req.session.cart.reduce((a, i) => a + i.qty, 0);
  }
  res.json({ ok: true, cartCount: req.session.cartCount });
});

// ---------- checkout ----------
app.get('/checkout', requireAuth, (req, res) => {
  const items = cartFromSession(req);
  if (items.length === 0) return res.redirect('/cart');
  const totals = cartTotals(items);
  res.render('shop/checkout', { title: 'Тасдиқи фармоиш', items, totals, user: req.user });
});

app.post('/checkout', requireAuth, (req, res) => {
  const items = cartFromSession(req);
  if (items.length === 0) { flash(req, 'error', 'Сабад холӣ аст.'); return res.redirect('/cart'); }

  const name = (req.body.customer_name || '').trim();
  const phone = (req.body.phone || '').trim();
  const city = (req.body.city || 'Хуҷанд').trim();
  const address = (req.body.address || '').trim();
  const comment = (req.body.comment || '').trim();
  const delivery = req.body.delivery_method === 'pickup' ? 'pickup' : 'courier';
  const payment = ['cash', 'card', 'terminal'].includes(req.body.payment_method) ? req.body.payment_method : 'cash';

  if (!name || !phone || !address) {
    flash(req, 'error', 'Ном, телефон ва суроға ҳатмист.');
    return res.redirect('/checkout');
  }

  // re-validate stock before order
  for (const it of items) {
    const p = q.productById.get(it.productId);
    if (!p) { flash(req, 'error', `Маҳсулот «${it.product ? it.product.title : ''}» дигар мавҷуд нест.`); return res.redirect('/cart'); }
    let avail = p.stock;
    if (p.has_sizes) {
      const s = q.sizesByProduct.all(p.id).find(x => x.size === it.size);
      avail = s ? s.stock : 0;
    }
    if (avail < it.qty) {
      flash(req, 'error', `Барои «${it.product.title}» танҳо ${avail} дона мондааст. Миқдорро кам кунед.`);
      return res.redirect('/cart');
    }
  }

  const totals = cartTotals(items);
  const deliveryFee = delivery === 'courier' ? 15 : 0;
  const total = totals.subtotal + deliveryFee;

  const tx = db.transaction(() => {
    const info = q.insertOrder.run(req.user.id, name, phone, city, address, comment, delivery, payment, totals.subtotal, deliveryFee, total, 'new');
    const orderId = info.lastInsertRowid;
    for (const it of items) {
      q.insertOrderItem.run(orderId, it.productId, it.product.title, it.product.price, it.size || '', it.qty, it.product.image);
      if (it.product.has_sizes) q.decrementSizeStock.run(it.qty, it.productId, it.size);
      else q.decrementProductStock.run(it.qty, it.productId);
    }
    return orderId;
  });

  const orderId = tx();
  req.session.cart = [];
  req.session.cartCount = 0;
  res.redirect(`/order/success/${orderId}`);
});

app.get('/order/success/:id', requireAuth, (req, res) => {
  const order = q.orderById.get(parseInt(req.params.id));
  if (!order || order.user_id !== req.user.id) return res.redirect('/orders');
  const items = q.orderItems.all(order.id);
  res.render('shop/success', { title: 'Фармоиш қабул шуд!', order, items });
});

// ---------- orders (customer) ----------
app.get('/orders', requireAuth, (req, res) => {
  const orders = q.ordersByUser.all(req.user.id).map(o => ({ ...o, items: q.orderItems.all(o.id) }));
  res.render('shop/orders', { title: 'Фармоишҳои ман', orders });
});

app.get('/order/:id', requireAuth, (req, res) => {
  const order = q.orderById.get(parseInt(req.params.id));
  if (!order || order.user_id !== req.user.id) return res.redirect('/orders');
  const items = q.orderItems.all(order.id);
  res.render('shop/order-detail', { title: `Фармоиш №${order.id}`, order, items });
});

// ---------- auth ----------
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('auth/login', { title: 'Воридшавӣ' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = q.userByUsername.get((username || '').trim().toLowerCase());
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    flash(req, 'error', 'Логин ё парол нодуруст аст.');
    return res.redirect('/login');
  }
  req.session.userId = user.id;
  const dest = req.session.afterLogin || (user.role === 'admin' ? '/admin' : '/');
  req.session.afterLogin = null;
  flash(req, 'success', `Хуш омадед, ${user.full_name}! 👋`);
  res.redirect(dest);
});

app.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('auth/register', { title: 'Бақайдгирӣ' });
});

app.post('/register', (req, res) => {
  const full_name = (req.body.full_name || '').trim();
  const phone = (req.body.phone || '').trim();
  const username = (req.body.username || '').trim().toLowerCase();
  const password = req.body.password || '';
  const password2 = req.body.password2 || '';

  if (!full_name || !username || !password) { flash(req, 'error', 'Ҳамаи майдонҳоро пур кунед.'); return res.redirect('/register'); }
  if (!/^[a-z0-9_]{3,20}$/.test(username)) { flash(req, 'error', 'Логин: 3-20 аломати лотинӣ, рақам, _'); return res.redirect('/register'); }
  if (password.length < 6) { flash(req, 'error', 'Парол на кам аз 6 аломат.'); return res.redirect('/register'); }
  if (password !== password2) { flash(req, 'error', 'Паролҳо мувофиқ нестанд.'); return res.redirect('/register'); }
  if (q.userByUsername.get(username)) { flash(req, 'error', 'Ин логин аллакай мавҷуд аст.'); return res.redirect('/register'); }

  q.createUser.run(full_name, phone, username, hashPassword(password), 'customer');
  const user = q.userByUsername.get(username);
  req.session.userId = user.id;
  flash(req, 'success', 'Бақайдгирӣ гузашт! Хуш омадед! 🎉');
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- profile ----------
app.get('/profile', requireAuth, (req, res) => {
  res.render('auth/profile', { title: 'Профили ман' });
});

app.post('/profile', requireAuth, (req, res) => {
  const full_name = (req.body.full_name || '').trim();
  const phone = (req.body.phone || '').trim();
  if (!full_name) { flash(req, 'error', 'Ном холӣ набошад.'); return res.redirect('/profile'); }
  q.updateProfile.run(full_name, phone, req.user.id);
  flash(req, 'success', 'Профил нав карда шуд.');
  res.redirect('/profile');
});

app.post('/profile/password', requireAuth, (req, res) => {
  const { old_password, new_password, new_password2 } = req.body;
  const user = q.userById.get(req.user.id);
  if (!verifyPassword(old_password || '', user.password_hash)) { flash(req, 'error', 'Пароли куҳна нодуруст.'); return res.redirect('/profile'); }
  if (!new_password || new_password.length < 6) { flash(req, 'error', 'Пароли нав на кам аз 6 аломат.'); return res.redirect('/profile'); }
  if (new_password !== new_password2) { flash(req, 'error', 'Паролҳо мувофиқ нестанд.'); return res.redirect('/profile'); }
  q.updatePassword.run(hashPassword(new_password), req.user.id);
  flash(req, 'success', 'Парол иваз шуд!');
  res.redirect('/profile');
});

// ============================================================
// ==================== ADMIN PANEL ============================
// ============================================================
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const stats = {
    products: q.statsProducts.get().c,
    orders: q.statsOrders.get().c,
    revenue: q.statsRevenue.get().s,
    newOrders: q.statsNewOrders.get().c,
    customers: q.customerCount.get().c,
  };
  const revenueByDay = q.revenueByDay.all().reverse();
  const lowStock = q.lowStockProducts.all().map(productView);
  const recentOrders = q.recentOrders.all();
  const recentCustomers = q.recentCustomers.all();
  const statusCounts = q.statusCounts.all();
  res.render('admin/dashboard', { title: 'Админ-панел', stats, revenueByDay, lowStock, recentOrders, recentCustomers, statusCounts });
});

// ----- products -----
app.get('/admin/products', requireAuth, requireAdmin, (req, res) => {
  const products = q.productsAll.all().map(productView);
  const cats = q.categoriesAll.all();
  res.render('admin/products', { title: 'Маҳсулотҳо', products, cats });
});

app.get('/admin/products/new', requireAuth, requireAdmin, (req, res) => {
  res.render('admin/product-form', { title: 'Маҳсулоти нав', product: null, cats: q.categoriesAll.all() });
});

app.get('/admin/products/:id/edit', requireAuth, requireAdmin, (req, res) => {
  const product = q.productById.get(parseInt(req.params.id));
  if (!product) return res.redirect('/admin/products');
  const sizes = q.sizesByProduct.all(product.id);
  res.render('admin/product-form', { title: 'Таҳрири маҳсулот', product: productView(product), sizes, cats: q.categoriesAll.all() });
});

app.post('/admin/products', requireAuth, requireAdmin, (req, res) => {
  const title = (req.body.title || '').trim();
  const categoryId = parseInt(req.body.category_id);
  if (!title || !categoryId) { flash(req, 'error', 'Ном ва категория лозим аст.'); return res.redirect('/admin/products/new'); }

  const price = parseFloat(req.body.price) || 0;
  const old_price = req.body.old_price ? parseFloat(req.body.old_price) : null;
  const has_sizes = req.body.has_sizes ? 1 : 0;
  const stock = has_sizes ? 0 : (parseInt(req.body.stock) || 0);
  const is_featured = req.body.is_featured ? 1 : 0;
  const is_published = req.body.is_published ? 1 : 0;

  const isEdit = req.body.product_id;
  if (isEdit) {
    q.updateProduct.run(categoryId, title, (req.body.description || '').trim(), price, old_price, req.body.image || '', has_sizes, stock, is_featured, is_published, parseInt(isEdit));
    const pid = parseInt(isEdit);
    q.deleteSizes.run(pid);
    if (has_sizes) {
      const sizes = req.body.size || [];
      const stocks = req.body.size_stock || [];
      for (let i = 0; i < sizes.length; i++) {
        const s = (sizes[i] || '').trim();
        if (s) q.insertSize.run(pid, s, parseInt(stocks[i]) || 0);
      }
    }
    flash(req, 'success', 'Маҳсулот нав карда шуд.');
    res.redirect('/admin/products');
  } else {
    const info = q.insertProduct.run(categoryId, title, (req.body.description || '').trim(), price, old_price, req.body.image || '', 5, 1, has_sizes, stock, is_featured, is_published);
    const pid = info.lastInsertRowid;
    if (has_sizes) {
      const sizes = req.body.size || [];
      const stocks = req.body.size_stock || [];
      for (let i = 0; i < sizes.length; i++) {
        const s = (sizes[i] || '').trim();
        if (s) q.insertSize.run(pid, s, parseInt(stocks[i]) || 0);
      }
    }
    flash(req, 'success', 'Маҳсулот сохта шуд!');
    res.redirect('/admin/products');
  }
});

app.post('/admin/products/:id/delete', requireAuth, requireAdmin, (req, res) => {
  q.deleteProduct.run(parseInt(req.params.id));
  flash(req, 'success', 'Маҳсулот нест карда шуд.');
  res.redirect('/admin/products');
});

app.post('/admin/products/:id/toggle', requireAuth, requireAdmin, (req, res) => {
  const p = q.productById.get(parseInt(req.params.id));
  if (p) db.prepare('UPDATE products SET is_published=? WHERE id=?').run(p.is_published ? 0 : 1, p.id);
  res.redirect('/admin/products');
});

// ----- categories -----
app.get('/admin/categories', requireAuth, requireAdmin, (req, res) => {
  const cats = q.categoriesAll.all().map(c => ({ ...c, count: q.productCountByCategory.get(c.id).c }));
  res.render('admin/categories', { title: 'Категорияҳо', cats });
});

app.post('/admin/categories', requireAuth, requireAdmin, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) { flash(req, 'error', 'Номи категория лозим.'); return res.redirect('/admin/categories'); }
  const order = q.nextCategoryOrder.get().o;
  q.insertCategory.run(name, req.body.icon || '🧸', order, req.body.is_published ? 1 : 0);
  flash(req, 'success', 'Категория сохта шуд.');
  res.redirect('/admin/categories');
});

app.post('/admin/categories/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  q.updateCategory.run((req.body.name || '').trim(), req.body.icon || '🧸', parseInt(req.body.sort_order) || 0, req.body.is_published ? 1 : 0, id);
  flash(req, 'success', 'Категория нав карда шуд.');
  res.redirect('/admin/categories');
});

app.post('/admin/categories/:id/delete', requireAuth, requireAdmin, (req, res) => {
  q.deleteCategory.run(parseInt(req.params.id));
  flash(req, 'success', 'Категория нест карда шуд.');
  res.redirect('/admin/categories');
});

// ----- orders -----
app.get('/admin/orders', requireAuth, requireAdmin, (req, res) => {
  const status = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'].includes(req.query.status) ? req.query.status : null;
  const orders = (status ? q.ordersByStatus.all(status) : q.ordersAll.all()).map(o => ({ ...o, items: q.orderItems.all(o.id) }));
  res.render('admin/orders', { title: 'Фармоишҳо', orders, status });
});

app.get('/admin/orders/:id', requireAuth, requireAdmin, (req, res) => {
  const order = q.orderById.get(parseInt(req.params.id));
  if (!order) return res.redirect('/admin/orders');
  const items = q.orderItems.all(order.id);
  const customer = order.user_id ? q.userById.get(order.user_id) : null;
  res.render('admin/order-detail', { title: `Фармоиш №${order.id}`, order, items, customer });
});

app.post('/admin/orders/:id/status', requireAuth, requireAdmin, (req, res) => {
  const status = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'].includes(req.body.status) ? req.body.status : 'new';
  q.updateOrderStatus.run(status, parseInt(req.params.id));
  flash(req, 'success', 'Ҳолати фармоиш иваз карда шуд.');
  res.redirect(`/admin/orders/${req.params.id}`);
});

// ----- users -----
app.get('/admin/users', requireAuth, requireAdmin, (req, res) => {
  const users = q.allUsers.all().map(u => ({
    ...u,
    orders: q.orderCountByUser.get(u.id).c,
  }));
  res.render('admin/users', { title: 'Истифодабарандагон', users });
});

app.post('/admin/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) { flash(req, 'error', 'Нақши худро иваз карда наметавонед.'); return res.redirect('/admin/users'); }
  q.updateRole.run(req.body.role === 'admin' ? 'admin' : 'customer', id);
  flash(req, 'success', 'Нақш иваз шуд.');
  res.redirect('/admin/users');
});

app.post('/admin/users/:id/delete', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) { flash(req, 'error', 'Худи худро нест карда наметавонед.'); return res.redirect('/admin/users'); }
  q.deleteUser.run(id);
  flash(req, 'success', 'Истифодабаранда нест шуд.');
  res.redirect('/admin/users');
});

app.use((req, res) => res.status(404).render('error', { title: 'Ёфт нашуд', code: 404, message: 'Саҳифа ёфт нашуд.' }));

// ---------- start ----------
const { seed } = require('./seed/seed.js');
seed();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🧸 Kukucha running at http://0.0.0.0:${PORT}`);
});
