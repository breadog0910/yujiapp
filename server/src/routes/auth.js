const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, createSession, destroySession, requireAuth } = require('../auth');

const router = express.Router();

// 注册（默认玩家角色）
router.post('/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  if (String(username).length < 2) return res.status(400).json({ error: '用户名至少 2 个字符' });
  if (String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  const exist = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exist) return res.status(409).json({ error: '用户名已存在' });
  const now = new Date().toISOString();
  const info = db.prepare('INSERT INTO users (username, password_hash, role, must_change_pw, created_at) VALUES (?, ?, ?, 0, ?)')
    .run(username, hashPassword(password), 'user', now);
  const token = createSession(info.lastInsertRowid);
  res.json({ token, user: { id: info.lastInsertRowid, username, role: 'user', must_change_pw: 0, isPreview: false } });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = createSession(user.id);
  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, must_change_pw: user.must_change_pw, isPreview: !!user.is_preview },
  });
});

// 退出
router.post('/logout', requireAuth, (req, res) => {
  destroySession(require('../auth').tokenFromReq(req));
  res.json({ ok: true });
});

// 当前用户
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// 首次登录强制改密
router.post('/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (oldPassword && !verifyPassword(oldPassword, user.password_hash)) {
    return res.status(400).json({ error: '原密码不正确' });
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?')
    .run(hashPassword(newPassword), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
