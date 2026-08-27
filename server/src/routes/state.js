const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  if (req.user.isPreview) return res.json({ data: null, updated_at: null, preview: true });
  const row = await db.prepare('SELECT data, updated_at FROM user_state WHERE user_id = ?').get(req.user.id);
  if (!row) return res.json({ data: null, updated_at: null });
  res.json({ data: JSON.parse(row.data), updated_at: row.updated_at });
});

router.put('/', requireAuth, async (req, res) => {
  if (req.user.isPreview) return res.status(403).json({ error: '预览账号不允许保存状态' });
  const data = req.body && req.body.data;
  if (data === undefined) return res.status(400).json({ error: 'data 必填' });
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO user_state (user_id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`)
    .run(req.user.id, JSON.stringify(data), now);
  res.json({ ok: true, updated_at: now });
});

module.exports = router;
