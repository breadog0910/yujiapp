const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const db = require('../db');
const { requireAdmin, logAdmin } = require('../auth');
const { mapFurniture, mapLayout, mapShop, mapSeed } = require('./config-shared');
const { GAME_DIR } = require('../config');

const router = express.Router();

router.use(requireAdmin);

const DEFAULT_TAB_BG = {
  tab1: 'assets/tab1beijing.png',
  tab2: 'assets/tab2-forest.png',
  tab3: 'assets/tab3-garden-bg.jpg',
  tab4: 'assets/tab4-stars.png',
};
const TAB_BG_NAME = {
  tab1: '此刻·家',
  tab2: '遇见·内心森林',
  tab3: '生长·像素田地',
  tab4: '星迹·个人宇宙',
};

const TAB_BG_DIR = path.join(GAME_DIR, 'assets', 'tab-bg');
fs.mkdirSync(TAB_BG_DIR, { recursive: true });
const tabBgStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TAB_BG_DIR),
  filename: (req, file, cb) => {
    const tabKey = (req.params && req.params.tabKey) || 'tab';
    const ext = (file.originalname.match(/\.(png|jpg|jpeg|gif|webp)$/i) || ['.png'])[0].toLowerCase();
    cb(null, `${tabKey}-${Date.now()}${ext}`);
  },
});
const tabBgUpload = multer({
  storage: tabBgStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpeg|gif|webp)$/i.test(file.mimetype)) {
      return cb(new Error('只允许 png/jpg/gif/webp 图片'));
    }
    cb(null, true);
  },
});

function isCustomTabBgPath(p) {
  return typeof p === 'string' && p.startsWith('assets/tab-bg/');
}
function safeDeleteGameFile(relPath) {
  if (!relPath) return;
  if (!isCustomTabBgPath(relPath)) return;
  const abs = path.join(GAME_DIR, relPath.replace(/^assets\//, 'assets/'));
  try { if (fs.existsSync(abs) && fs.statSync(abs).size <= 16 * 1024 * 1024) fs.unlinkSync(abs); } catch (_) {}
}

const MATTING_SCRIPT = path.join(__dirname, '..', 'matting_worker.py');

function runMatting(inputPath, outputPath, opts = {}) {
  const alphaMatting = !!opts.alphaMatting;
  const timeoutMs = opts.timeoutMs || 90000;
  return new Promise((resolve) => {
    if (!fs.existsSync(MATTING_SCRIPT)) {
      resolve({ ok: false, fallback: true, error: `抠图脚本不存在: ${MATTING_SCRIPT}` });
      return;
    }
    const args = [MATTING_SCRIPT, inputPath, outputPath];
    if (alphaMatting) args.push('--alpha-matting');
    let child;
    try {
      child = spawn('python', args, { windowsHide: true });
    } catch (e) {
      resolve({ ok: false, fallback: true, error: `无法启动 python: ${e.message}` });
      return;
    }
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += String(d); });
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch (_) {}
      resolve({ ok: false, fallback: true, error: '抠图超时（> ' + (timeoutMs / 1000) + 's）', stderr });
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, fallback: true, error: `spawn error: ${e.message}`, stderr });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        resolve({ ok: true, usedOutputPath: outputPath });
      } else {
        resolve({
          ok: false,
          fallback: true,
          error: stderr ? stderr.trim().split('\n').pop() : `抠图脚本退出 code=${code}`,
          stderr,
        });
      }
    });
  });
}

async function maybeRunMattingOnUploaded(req) {
  const wantMatting = (req.body && (req.body.matting === '1' || req.body.matting === 'true' || req.body.matting === true));
  const out = { wasMattled: false, isFallback: false, outputPath: req.file.path, outputSize: req.file.size };
  if (!wantMatting) return out;
  const tmpOut = path.join(
    path.dirname(req.file.path),
    path.basename(req.file.path, path.extname(req.file.path)) + '.tmp-matting.png'
  );
  let cleanupDone = false;
  const cleanup = () => {
    if (cleanupDone) return;
    cleanupDone = true;
    try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch (_) {}
  };
  try {
    out.wasMattled = true;
    const alphaMatting = (req.body && (req.body.alphaMatting === '1' || req.body.alphaMatting === 'true'));
    const r = await runMatting(req.file.path, tmpOut, { alphaMatting });
    if (r.ok) {
      fs.copyFileSync(tmpOut, req.file.path);
      const stat = fs.statSync(req.file.path);
      out.outputSize = stat.size;
      out.outputPath = req.file.path;
    } else {
      out.isFallback = true;
      out.mattingError = r.error || '抠图失败';
    }
  } catch (e) {
    out.isFallback = true;
    out.mattingError = e.message || String(e);
  } finally {
    cleanup();
  }
  return out;
}

const PIXEL_DIR = path.join(GAME_DIR, 'assets', 'pixel');
fs.mkdirSync(PIXEL_DIR, { recursive: true });
const _uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PIXEL_DIR),
  filename: (req, file, cb) => {
    const overrideName = req.body && req.body.forceName;
    let name = (overrideName || file.originalname || 'upload').replace(/\\/g, '/').split('/').pop();
    name = name.replace(/\s+/g, '-').replace(/[^\w.\-]/g, '');
    if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(name)) name += '.png';
    cb(null, name);
  },
});
const upload = multer({
  storage: _uploadStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpeg|gif|webp)$/i.test(file.mimetype)) {
      return cb(new Error('只允许 png/jpg/gif/webp 图片'));
    }
    cb(null, true);
  },
});

router.post('/furniture/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  const m = await maybeRunMattingOnUploaded(req);
  const filename = path.basename(m.outputPath);
  const relPath = `assets/pixel/${filename}`;
  await logAdmin(
    req.user.id, 'furniture.upload', req.body.forceName || '-',
    `${filename} wasMattled=${m.wasMattled} isFallback=${m.isFallback}${m.mattingError ? ' err=' + m.mattingError : ''}`
  );
  res.json({
    path: relPath,
    filename,
    size: m.outputSize,
    wasMattled: m.wasMattled,
    isFallback: !!m.isFallback,
    mattingError: m.mattingError || undefined,
  });
});

router.post('/furniture/with-image', upload.single('file'), async (req, res) => {
  const b = req.body || {};
  const type = String(b.type || '').trim();
  const name = String(b.name || '').trim();
  if (!type || !name) return res.status(400).json({ error: 'type 和 name 必填' });
  if (!req.file) return res.status(400).json({ error: '请选择图片文件' });
  const exists = await db.prepare('SELECT type FROM furniture_catalog WHERE type = ?').get(type);
  if (exists) return res.status(409).json({ error: '该 type 已存在' });
  const m = await maybeRunMattingOnUploaded(req);
  const filename = path.basename(m.outputPath);
  const icon = `assets/pixel/${filename}`;
  await db.prepare(`INSERT INTO furniture_catalog (type,name,category,icon,w,h,is_floor,action,unlocked_by_default,price)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    type, name, b.category || '家具', icon,
    Number(b.w) || 56, Number(b.h) || 56,
    b.isFloor ? 1 : 0, b.action || null,
    b.unlockedByDefault === 'false' || b.unlockedByDefault === false ? 0 : 1,
    Number(b.price) || 0);
  await logAdmin(
    req.user.id, 'furniture.create-with-image', type,
    `${name} -> ${icon} wasMattled=${m.wasMattled} isFallback=${m.isFallback}${m.mattingError ? ' err=' + m.mattingError : ''}`
  );
  res.json({
    ok: true,
    icon,
    wasMattled: m.wasMattled,
    isFallback: !!m.isFallback,
    mattingError: m.mattingError || undefined,
  });
});

router.get('/overview', async (req, res) => {
  const counts = {
    users: (await db.prepare("SELECT COUNT(*) c FROM users WHERE role='user'").get()).c,
    admins: (await db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get()).c,
    furniture: (await db.prepare('SELECT COUNT(*) c FROM furniture_catalog').get()).c,
    layoutPieces: (await db.prepare('SELECT COUNT(*) c FROM default_room_layout').get()).c,
    shopItems: (await db.prepare('SELECT COUNT(*) c FROM shop_items').get()).c,
    seeds: (await db.prepare('SELECT COUNT(*) c FROM seed_catalog').get()).c,
    aiAgents: (await db.prepare('SELECT COUNT(*) c FROM ai_config').get()).c,
  };
  res.json(counts);
});

router.get('/furniture', async (req, res) => {
  res.json((await db.prepare('SELECT * FROM furniture_catalog ORDER BY category, type').all()).map(mapFurniture));
});
router.post('/furniture', async (req, res) => {
  const b = req.body || {};
  if (!b.type || !b.name) return res.status(400).json({ error: 'type 和 name 必填' });
  const exists = await db.prepare('SELECT type FROM furniture_catalog WHERE type = ?').get(b.type);
  if (exists) return res.status(409).json({ error: '该 type 已存在' });
  await db.prepare(`INSERT INTO furniture_catalog (type,name,category,icon,w,h,is_floor,action,unlocked_by_default,price)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    b.type, b.name, b.category || '家具', b.icon || '', b.w || 56, b.h || 56,
    b.isFloor ? 1 : 0, b.action || null, b.unlockedByDefault === false ? 0 : 1, Number(b.price) || 0);
  await logAdmin(req.user.id, 'furniture.create', b.type, b.name);
  res.json({ ok: true });
});
router.put('/furniture/:type', async (req, res) => {
  const b = req.body || {};
  const cur = await db.prepare('SELECT * FROM furniture_catalog WHERE type = ?').get(req.params.type);
  if (!cur) return res.status(404).json({ error: '未找到' });
  await db.prepare(`UPDATE furniture_catalog SET name=?, category=?, icon=?, w=?, h=?, is_floor=?, action=?, unlocked_by_default=?, price=?
    WHERE type=?`).run(
    b.name ?? cur.name, b.category ?? cur.category, b.icon ?? cur.icon, b.w ?? cur.w, b.h ?? cur.h,
    b.isFloor === undefined ? cur.is_floor : (b.isFloor ? 1 : 0),
    b.action === undefined ? cur.action : b.action,
    b.unlockedByDefault === undefined ? cur.unlocked_by_default : (b.unlockedByDefault ? 1 : 0),
    b.price === undefined ? cur.price : (Number(b.price) || 0),
    req.params.type);
  await logAdmin(req.user.id, 'furniture.update', req.params.type, JSON.stringify(b));
  res.json({ ok: true });
});
router.delete('/furniture/:type', async (req, res) => {
  await db.prepare('DELETE FROM furniture_catalog WHERE type = ?').run(req.params.type);
  await logAdmin(req.user.id, 'furniture.delete', req.params.type, '');
  res.json({ ok: true });
});

router.get('/room-layout', async (req, res) => {
  res.json((await db.prepare('SELECT * FROM default_room_layout ORDER BY sort_order').all()).map(mapLayout));
});
router.put('/room-layout', async (req, res) => {
  const items = req.body && req.body.items;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items 必须是数组' });
  const tx = db.transaction(async () => {
    await db.prepare('DELETE FROM default_room_layout').run();
    const ins = db.prepare(`INSERT INTO default_room_layout (id,type,x,y,z,scale,flip,rot,tilt,action,sort_order)
      VALUES (@id,@type,@x,@y,@z,@scale,@flip,@rot,@tilt,@action,@sort_order)`);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.id || !it.type) continue;
      await ins.run({
        id: it.id, type: it.type, x: Number(it.x), y: Number(it.y), z: Number(it.z) || 3,
        scale: Number(it.scale) || 1, flip: it.flip ? 1 : 0,
        rot: Number(it.rot) || 0, tilt: Number(it.tilt) || 0,
        action: it.action || null, sort_order: i,
      });
    }
  });
  await tx();
  await logAdmin(req.user.id, 'room-layout.save', 'default', `${items.length} 件`);
  res.json({ ok: true, count: items.length });
});
router.post('/room-layout', async (req, res) => {
  const b = req.body || {};
  if (!b.type) return res.status(400).json({ error: 'type 必填' });
  const id = b.id || ('ri-' + b.type + '-' + Date.now().toString(36));
  const max = (await db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM default_room_layout').get()).m;
  await db.prepare(`INSERT INTO default_room_layout (id,type,x,y,z,scale,flip,rot,tilt,action,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT (id) DO UPDATE SET type=EXCLUDED.type, x=EXCLUDED.x, y=EXCLUDED.y, z=EXCLUDED.z, scale=EXCLUDED.scale, flip=EXCLUDED.flip, rot=EXCLUDED.rot, tilt=EXCLUDED.tilt, action=EXCLUDED.action, sort_order=EXCLUDED.sort_order`).run(
    id, b.type, Number(b.x ?? 50), Number(b.y ?? 20), Number(b.z ?? 3),
    Number(b.scale ?? 1), b.flip ? 1 : 0, Number(b.rot ?? 0), Number(b.tilt ?? 0),
    b.action || null, max + 1);
  await logAdmin(req.user.id, 'room-layout.add', id, b.type);
  res.json({ ok: true, id });
});
router.delete('/room-layout/:id', async (req, res) => {
  await db.prepare('DELETE FROM default_room_layout WHERE id = ?').run(req.params.id);
  await logAdmin(req.user.id, 'room-layout.delete', req.params.id, '');
  res.json({ ok: true });
});

router.get('/shop', async (req, res) => {
  res.json((await db.prepare('SELECT * FROM shop_items ORDER BY kind, sort_order').all()).map(mapShop));
});
router.post('/shop', async (req, res) => {
  const b = req.body || {};
  if (!b.id || !b.name || !b.kind) return res.status(400).json({ error: 'id/name/kind 必填' });
  const max = (await db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM shop_items').get()).m;
  await db.prepare(`INSERT INTO shop_items (id,kind,emoji,name,price,bonus,desc,unlocked,sort_order,icon)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT (id) DO NOTHING`).run(
    b.id, b.kind, b.emoji || '', b.name, Number(b.price) || 0, JSON.stringify(b.bonus || {}),
    b.desc || '', b.unlocked === false ? 0 : 1, max + 1, b.icon || '');
  await logAdmin(req.user.id, 'shop.create', b.id, b.name);
  res.json({ ok: true });
});
router.put('/shop/:id', async (req, res) => {
  const b = req.body || {};
  const cur = await db.prepare('SELECT * FROM shop_items WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: '未找到' });
  await db.prepare(`UPDATE shop_items SET emoji=?, name=?, price=?, bonus=?, desc=?, unlocked=?, kind=?, icon=?
    WHERE id=?`).run(
    b.emoji ?? cur.emoji, b.name ?? cur.name, b.price ?? cur.price, b.bonus ? JSON.stringify(b.bonus) : cur.bonus,
    b.desc ?? cur.desc, b.unlocked === undefined ? cur.unlocked : (b.unlocked ? 1 : 0),
    b.kind ?? cur.kind, b.icon ?? cur.icon, req.params.id);
  await logAdmin(req.user.id, 'shop.update', req.params.id, JSON.stringify(b));
  res.json({ ok: true });
});
router.delete('/shop/:id', async (req, res) => {
  await db.prepare('DELETE FROM shop_items WHERE id = ?').run(req.params.id);
  await logAdmin(req.user.id, 'shop.delete', req.params.id, '');
  res.json({ ok: true });
});
router.post('/shop/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  const m = await maybeRunMattingOnUploaded(req);
  const filename = path.basename(m.outputPath);
  const relPath = `assets/pixel/${filename}`;
  await logAdmin(
    req.user.id, 'shop.upload', req.body.forceName || '-',
    `${filename} wasMattled=${m.wasMattled} isFallback=${m.isFallback}${m.mattingError ? ' err=' + m.mattingError : ''}`
  );
  res.json({
    path: relPath,
    filename,
    size: m.outputSize,
    wasMattled: m.wasMattled,
    isFallback: !!m.isFallback,
    mattingError: m.mattingError || undefined,
  });
});
router.post('/shop/with-image', upload.single('file'), async (req, res) => {
  const b = req.body || {};
  const id = String(b.id || '').trim();
  const name = String(b.name || '').trim();
  if (!id || !name || !b.kind) return res.status(400).json({ error: 'id/name/kind 必填' });
  if (!req.file) return res.status(400).json({ error: '请选择图片文件' });
  const exists = await db.prepare('SELECT id FROM shop_items WHERE id = ?').get(id);
  if (exists) return res.status(409).json({ error: '该商品 ID 已存在' });
  const m = await maybeRunMattingOnUploaded(req);
  const filename = path.basename(m.outputPath);
  const icon = `assets/pixel/${filename}`;
  const max = (await db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM shop_items').get()).m;
  await db.prepare(`INSERT INTO shop_items (id,kind,emoji,name,price,bonus,desc,unlocked,sort_order,icon)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    id, b.kind, b.emoji || '', name, Number(b.price) || 0, JSON.stringify(b.bonus || {}),
    b.desc || '', b.unlocked === false ? 0 : 1, max + 1, icon);
  await logAdmin(
    req.user.id, 'shop.create-with-image', id,
    `${name} -> ${icon} wasMattled=${m.wasMattled} isFallback=${m.isFallback}${m.mattingError ? ' err=' + m.mattingError : ''}`
  );
  res.json({
    ok: true,
    icon,
    wasMattled: m.wasMattled,
    isFallback: !!m.isFallback,
    mattingError: m.mattingError || undefined,
  });
});

router.get('/seeds', async (req, res) => {
  res.json((await db.prepare('SELECT * FROM seed_catalog ORDER BY sort_order').all()).map(mapSeed));
});
router.post('/seeds', async (req, res) => {
  const b = req.body || {};
  if (!b.key || !b.name) return res.status(400).json({ error: 'key/name 必填' });
  const max = (await db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM seed_catalog').get()).m;
  await db.prepare(`INSERT INTO seed_catalog (key,emoji,name,dir,desc,feed_on,stages,yield,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT (key) DO NOTHING`).run(
    b.key, b.emoji || '', b.name, b.dir || '', b.desc || '',
    JSON.stringify(b.feedOn || []), JSON.stringify(b.stages || []), JSON.stringify(b.yield || {}), max + 1);
  await logAdmin(req.user.id, 'seed.create', b.key, b.name);
  res.json({ ok: true });
});
router.put('/seeds/:key', async (req, res) => {
  const b = req.body || {};
  const cur = await db.prepare('SELECT * FROM seed_catalog WHERE key = ?').get(req.params.key);
  if (!cur) return res.status(404).json({ error: '未找到' });
  await db.prepare(`UPDATE seed_catalog SET emoji=?, name=?, dir=?, desc=?, feed_on=?, stages=?, yield=? WHERE key=?`).run(
    b.emoji ?? cur.emoji, b.name ?? cur.name, b.dir ?? cur.dir, b.desc ?? cur.desc,
    b.feedOn ? JSON.stringify(b.feedOn) : cur.feed_on,
    b.stages ? JSON.stringify(b.stages) : cur.stages,
    b.yield ? JSON.stringify(b.yield) : cur.yield, req.params.key);
  await logAdmin(req.user.id, 'seed.update', req.params.key, JSON.stringify(b));
  res.json({ ok: true });
});
router.delete('/seeds/:key', async (req, res) => {
  await db.prepare('DELETE FROM seed_catalog WHERE key = ?').run(req.params.key);
  await logAdmin(req.user.id, 'seed.delete', req.params.key, '');
  res.json({ ok: true });
});

router.get('/ai', async (req, res) => {
  const rows = (await db.prepare('SELECT * FROM ai_config ORDER BY key').all()).map(a => ({
    key: a.key, name: a.name, provider: a.provider, base_url: a.base_url, api_key: a.api_key,
    model: a.model, temperature: a.temperature, system_prompt: a.system_prompt, enabled: !!a.enabled,
    updated_at: a.updated_at,
  }));
  res.json(rows);
});
router.put('/ai/:key', async (req, res) => {
  const b = req.body || {};
  const cur = await db.prepare('SELECT * FROM ai_config WHERE key = ?').get(req.params.key);
  if (!cur) return res.status(404).json({ error: '未找到' });
  let apiKey = cur.api_key;
  if (b.api_key !== undefined && b.api_key !== '') apiKey = b.api_key;
  await db.prepare(`UPDATE ai_config SET name=?, provider=?, base_url=?, api_key=?, model=?, temperature=?, system_prompt=?, enabled=?, updated_at=?
    WHERE key=?`).run(
    b.name ?? cur.name, b.provider ?? cur.provider, b.base_url ?? cur.base_url, apiKey,
    b.model ?? cur.model, b.temperature ?? cur.temperature, b.system_prompt ?? cur.system_prompt,
    b.enabled === undefined ? cur.enabled : (b.enabled ? 1 : 0), new Date().toISOString(), req.params.key);
  await logAdmin(req.user.id, 'ai.update', req.params.key, b.name || req.params.key);
  res.json({ ok: true });
});

router.get('/settings', async (req, res) => {
  const s = {};
  (await db.prepare('SELECT key, value FROM site_settings').all()).forEach(r => { s[r.key] = r.value; });
  res.json(s);
});
router.put('/settings', async (req, res) => {
  const b = req.body || {};
  const tx = db.transaction(async () => {
    for (const k of Object.keys(b)) {
      await db.prepare('INSERT INTO site_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at')
        .run(k, String(b[k]), new Date().toISOString());
    }
  });
  await tx();
  await logAdmin(req.user.id, 'settings.update', '', JSON.stringify(b));
  res.json({ ok: true });
});

router.get('/users', async (req, res) => {
  const rows = await db.prepare("SELECT id, username, role, must_change_pw, is_preview, created_at FROM users ORDER BY role DESC, id").all();
  res.json(rows.map(r => ({ ...r, isPreview: !!r.is_preview })));
});
router.post('/users', async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  if (String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  const exist = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exist) return res.status(409).json({ error: '用户名已存在' });
  const r = await db.prepare("INSERT INTO users (username, password_hash, role, must_change_pw, created_at) VALUES (?, ?, ?, 0, ?) RETURNING id")
    .run(username, require('../auth').hashPassword(password), role === 'admin' ? 'admin' : 'user', new Date().toISOString());
  await logAdmin(req.user.id, 'user.create', username, role || 'user');
  res.json({ ok: true, id: r.lastInsertRowid });
});
router.put('/users/:id/role', async (req, res) => {
  const { role } = req.body || {};
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'role 非法' });
  if (Number(req.params.id) === req.user.id && role !== 'admin') {
    return res.status(400).json({ error: '不能取消自己的管理员权限' });
  }
  await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  await logAdmin(req.user.id, 'user.role', req.params.id, role);
  res.json({ ok: true });
});
router.put('/users/:id/preview', async (req, res) => {
  const v = !!(req.body && req.body.isPreview);
  await db.prepare('UPDATE users SET is_preview = ? WHERE id = ?').run(v ? 1 : 0, req.params.id);
  await logAdmin(req.user.id, 'user.preview', req.params.id, v ? 'on' : 'off');
  res.json({ ok: true });
});
router.delete('/users/:id', async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  await db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  await logAdmin(req.user.id, 'user.delete', req.params.id, '');
  res.json({ ok: true });
});

router.get('/logs', async (req, res) => {
  const rows = await db.prepare(`SELECT l.*, u.username AS admin_name FROM admin_log l
    LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 200`).all();
  res.json(rows);
});

router.get('/tab-backgrounds', async (req, res) => {
  const rows = await db.prepare('SELECT * FROM tab_backgrounds').all();
  const byKey = {};
  rows.forEach(r => { byKey[r.tab_key] = r; });
  const list = Object.keys(DEFAULT_TAB_BG).map(k => {
    const r = byKey[k];
    const bgPath = (r && r.bg_path) || DEFAULT_TAB_BG[k];
    return {
      tabKey: k,
      name: TAB_BG_NAME[k],
      bgPath,
      defaultPath: DEFAULT_TAB_BG[k],
      isCustom: isCustomTabBgPath(bgPath),
      updatedAt: r ? r.updated_at : null,
    };
  });
  res.json(list);
});

router.post('/tab-backgrounds/:tabKey', tabBgUpload.single('file'), async (req, res) => {
  const tabKey = req.params.tabKey;
  if (!DEFAULT_TAB_BG[tabKey]) return res.status(400).json({ error: '未知 tabKey' });
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  const filename = path.basename(req.file.path);
  const relPath = `assets/tab-bg/${filename}`;
  const cur = await db.prepare('SELECT bg_path FROM tab_backgrounds WHERE tab_key = ?').get(tabKey);
  if (cur && isCustomTabBgPath(cur.bg_path)) safeDeleteGameFile(cur.bg_path);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO tab_backgrounds (tab_key, bg_path, updated_at) VALUES (?,?,?)
    ON CONFLICT(tab_key) DO UPDATE SET bg_path=EXCLUDED.bg_path, updated_at=EXCLUDED.updated_at`)
    .run(tabKey, relPath, now);
  await logAdmin(req.user.id, 'tab-bg.upload', tabKey, `${relPath} (${req.file.size}B)`);
  res.json({ ok: true, tabKey, bgPath: relPath, size: req.file.size, updatedAt: now });
});

router.delete('/tab-backgrounds/:tabKey', async (req, res) => {
  const tabKey = req.params.tabKey;
  if (!DEFAULT_TAB_BG[tabKey]) return res.status(400).json({ error: '未知 tabKey' });
  const cur = await db.prepare('SELECT bg_path FROM tab_backgrounds WHERE tab_key = ?').get(tabKey);
  if (cur && isCustomTabBgPath(cur.bg_path)) safeDeleteGameFile(cur.bg_path);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO tab_backgrounds (tab_key, bg_path, updated_at) VALUES (?,?,?)
    ON CONFLICT(tab_key) DO UPDATE SET bg_path=EXCLUDED.bg_path, updated_at=EXCLUDED.updated_at`)
    .run(tabKey, DEFAULT_TAB_BG[tabKey], now);
  await logAdmin(req.user.id, 'tab-bg.reset', tabKey, DEFAULT_TAB_BG[tabKey]);
  res.json({ ok: true, tabKey, bgPath: DEFAULT_TAB_BG[tabKey], updatedAt: now });
});

const CARE_FIELDS = ['id', 'emoji', 'label', 'mode', 'reward', 'sort_order'];
const VALID_MODES = new Set(['daily', 'recurring']);

function validateCare(body, { requireId = true } = {}) {
  const errors = [];
  if (requireId) {
    if (!body.id || typeof body.id !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(body.id)) {
      errors.push('id 必须为 1-32 位英文/数字/下划线/短横线');
    }
  }
  if (!body.emoji || typeof body.emoji !== 'string') errors.push('emoji 必填');
  if (!body.label || typeof body.label !== 'string' || body.label.length > 20) {
    errors.push('label 必填且长度 ≤ 20');
  }
  if (!VALID_MODES.has(body.mode)) errors.push('mode 必须是 daily 或 recurring');
  const reward = parseInt(body.reward, 10);
  if (isNaN(reward) || reward < 0 || reward > 100) errors.push('reward 必须为 0-100 的整数');
  const sortOrder = parseInt(body.sort_order ?? body.sortOrder ?? 0, 10);
  return { errors, reward, sortOrder };
}

router.get('/default-care-options', async (req, res) => {
  const rows = await db.prepare('SELECT * FROM default_care_options ORDER BY sort_order ASC, id ASC').all();
  res.json(rows.map(r => ({
    id: r.id, emoji: r.emoji, label: r.label,
    mode: r.mode, reward: r.reward, sortOrder: r.sort_order,
  })));
});

router.post('/default-care-options', async (req, res) => {
  const v = validateCare(req.body || {}, { requireId: true });
  if (v.errors.length) return res.status(400).json({ error: v.errors.join('；') });
  const exists = await db.prepare('SELECT id FROM default_care_options WHERE id = ?').get(req.body.id);
  if (exists) return res.status(400).json({ error: '该 id 已存在' });
  await db.prepare(`INSERT INTO default_care_options (id,emoji,label,mode,reward,sort_order)
    VALUES (?,?,?,?,?,?)`)
    .run(req.body.id, req.body.emoji, req.body.label, req.body.mode, v.reward, v.sortOrder);
  await logAdmin(req.user.id, 'defcare.create', req.body.id, `${req.body.emoji}${req.body.label}`);
  res.json({ ok: true });
});

router.put('/default-care-options/:id', async (req, res) => {
  const id = req.params.id;
  const cur = await db.prepare('SELECT * FROM default_care_options WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: '选项不存在' });
  const v = validateCare(req.body || {}, { requireId: false });
  if (v.errors.length) return res.status(400).json({ error: v.errors.join('；') });
  await db.prepare(`UPDATE default_care_options SET emoji=?, label=?, mode=?, reward=?, sort_order=? WHERE id=?`)
    .run(req.body.emoji, req.body.label, req.body.mode, v.reward, v.sortOrder, id);
  await logAdmin(req.user.id, 'defcare.update', id, `${req.body.emoji}${req.body.label}`);
  res.json({ ok: true });
});

router.put('/default-care-options', async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : [];
  if (list.length === 0) return res.status(400).json({ error: '至少保留一个选项' });
  if (list.length > 30) return res.status(400).json({ error: '最多 30 个选项' });
  for (let i = 0; i < list.length; i++) {
    const v = validateCare({ ...list[i], sort_order: i }, { requireId: true });
    if (v.errors.length) return res.status(400).json({ error: `第 ${i + 1} 项：${v.errors.join('；')}` });
  }
  const ids = new Set();
  for (const it of list) {
    if (ids.has(it.id)) return res.status(400).json({ error: `重复 id: ${it.id}` });
    ids.add(it.id);
  }
  const now = new Date().toISOString();
  const runTx = db.transaction(async () => {
    await db.prepare('DELETE FROM default_care_options').run();
    const ins = db.prepare(`INSERT INTO default_care_options (id,emoji,label,mode,reward,sort_order)
      VALUES (?,?,?,?,?,?)`);
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const reward = parseInt(it.reward, 10);
      await ins.run(it.id, it.emoji, it.label, it.mode, reward, i);
    }
    await logAdmin(req.user.id, 'defcare.save-all', '', `共 ${list.length} 项`);
  });
  await runTx();
  res.json({ ok: true });
});

router.delete('/default-care-options/:id', async (req, res) => {
  const id = req.params.id;
  const cur = await db.prepare('SELECT * FROM default_care_options WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: '选项不存在' });
  const count = (await db.prepare('SELECT COUNT(*) AS c FROM default_care_options').get()).c;
  if (count <= 1) return res.status(400).json({ error: '至少保留一个选项' });
  await db.prepare('DELETE FROM default_care_options WHERE id = ?').run(id);
  await logAdmin(req.user.id, 'defcare.delete', id, `${cur.emoji}${cur.label}`);
  res.json({ ok: true });
});

router.post('/default-care-options/restore-defaults', async (req, res) => {
  const DEFAULTS = [
    { id: 'water',     emoji: '💧', label: '喝水',     mode: 'recurring', reward: 3 },
    { id: 'breath',    emoji: '🌬️', label: '深呼吸',   mode: 'daily',     reward: 3 },
    { id: 'walk',      emoji: '🚶', label: '散步',     mode: 'daily',     reward: 3 },
    { id: 'space',     emoji: '🫧', label: '放空',     mode: 'daily',     reward: 3 },
    { id: 'sleep',     emoji: '🛌', label: '好好睡觉', mode: 'daily',     reward: 3 },
    { id: 'encourage', emoji: '💪', label: '自我鼓励', mode: 'daily',     reward: 3 },
  ];
  const runTx = db.transaction(async () => {
    await db.prepare('DELETE FROM default_care_options').run();
    const ins = db.prepare(`INSERT INTO default_care_options (id,emoji,label,mode,reward,sort_order)
      VALUES (?,?,?,?,?,?)`);
    for (let i = 0; i < DEFAULTS.length; i++) {
      const it = DEFAULTS[i];
      await ins.run(it.id, it.emoji, it.label, it.mode, it.reward, i);
    }
    await logAdmin(req.user.id, 'defcare.restore', '', `恢复内置 ${DEFAULTS.length} 项`);
  });
  await runTx();
  res.json({ ok: true });
});

module.exports = router;
