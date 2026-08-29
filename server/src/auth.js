const crypto = require('crypto');
const db = require('./db');
const { SESSION_TTL_DAYS } = require('./config');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const verify = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(verify, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_DAYS * 86400000);
  await db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, now.toISOString(), expires.toISOString());
  return token;
}

async function destroySession(token) {
  if (token) await db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

async function getUserByToken(token) {
  if (!token) return null;
  const sess = await db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!sess) return null;
  if (new Date(sess.expires_at).getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }
  const row = await db.prepare('SELECT id, username, role, must_change_pw, is_preview, created_at FROM users WHERE id = ?').get(sess.user_id);
  if (!row) return null;
  row.isPreview = !!row.is_preview;
  return row;
}

function tokenFromReq(req) {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

async function requireAuth(req, res, next) {
  const user = await getUserByToken(tokenFromReq(req));
  if (!user) return res.status(401).json({ error: '未登录或会话已过期' });
  req.user = user;
  next();
}

async function requireAdmin(req, res, next) {
  const user = await getUserByToken(tokenFromReq(req));
  if (!user) return res.status(401).json({ error: '未登录或会话已过期' });
  if (user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  req.user = user;
  next();
}

async function logAdmin(adminId, action, target, detail) {
  try {
    await db.prepare(
      'INSERT INTO admin_log (admin_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(adminId, action, target || '', detail || '', new Date().toISOString());
  } catch (e) {
    console.warn('[logAdmin] failed', e.message);
  }
}

async function optionalAuth(req, res, next) {
  const user = await getUserByToken(tokenFromReq(req));
  req.user = user || null;
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getUserByToken,
  tokenFromReq,
  requireAuth,
  optionalAuth,
  requireAdmin,
  logAdmin,
};
