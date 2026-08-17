const config = require('../config');

// Муҳофизати роутҳои админ:
// 1) Telegram Widget login → session.user + isAdmin
// 2) Коди /login аз бот → session.isAdmin + session.telegramId
function requireAdmin(req, res, next) {
  const isAdminViaUser =
    req.session &&
    req.session.user &&
    config.isAdmin(req.session.user.id);

  const isAdminViaCode =
    req.session &&
    req.session.isAdmin === true &&
    req.session.telegramId &&
    config.isAdmin(req.session.telegramId);

  if (isAdminViaUser || isAdminViaCode) {
    return next();
  }

  if (req.path.startsWith('/api/admin') || (req.originalUrl || '').startsWith('/api/admin')) {
    return res.status(401).json({ error: 'Танҳо барои админ' });
  }
  return res.redirect('/login');
}

// Илова кардани маълумоти ҷории корбар ба res.locals
function attachUser(req, res, next) {
  res.locals.currentUser = req.session?.user || null;
  next();
}

module.exports = { requireAdmin, attachUser };
