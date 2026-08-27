const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// 拉取当前玩家的游戏状态（多用户核心，后续前端接入时使用）
router.get('/', requireAuth, (req, res) => {
  // 预览账号：永远当作"新用户"（不读存档，永远返回 null → 前端按默认布局初始化）
  if (req.user.isPreview) return res.json({ data: null, updated_at: null, preview: true });
  const row = db.prepare('SELECT data, updated_at FROM user_state WHERE user_id = ?').get(req.user.id);
  if (!row) return res.json({ data: null, updated_at: null });
  res.json({ data: JSON.parse(row.data), updated_at: row.updated_at });
});

// 保存（全量覆盖）当前玩家状态
router.put('/', requireAuth, (req, res) => {
  // 预览账号：禁止写入存档（实时反映后端默认布局，不累积自有进度）
  if (req.user.isPreview) return res.status(403).json({ error: '预览账号不允许保存状态' });
  const data = req.body && req.body.data;
  if (data === undefined) return res.status(400).json({ error: 'data 必填' });
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO user_state (user_id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(req.user.id, JSON.stringify(data), now);
  res.json({ ok: true, updated_at: now });
});

module.exports = router;
