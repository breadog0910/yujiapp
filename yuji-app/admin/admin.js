/* ============================================================
   予己 · 管理后台前端（Supabase 迁移版）
   - 认证：Supabase Auth（username 映射为 email）
   - 配置数据：直接读写 PostgreSQL（RLS 保护，admin 可写）
   - 用户管理：调用 admin-api Edge Function（需 service_role）
   - 文件上传：Supabase Storage（不再提供 rembg 抠图）
   ============================================================ */

// ---------- Supabase 配置 ----------
const SUPABASE_URL = window.YUJI_SUPABASE_URL || 'https://你的-project-ref.supabase.co';
const SUPABASE_ANON_KEY = window.YUJI_SUPABASE_ANON_KEY || '你的-anon-public-key-从-supabase-dashboard-复制';

let supabase = null;
function getClient() {
  if (!supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return supabase;
}

function toEmail(username) { return username.trim().toLowerCase() + '@yujiapp.local'; }

// ---------- 状态 ----------
const TOKEN_KEY = 'yuji_admin_token';
let _user = null;
let token = localStorage.getItem(TOKEN_KEY) || '';
let catalogMap = {};
let layoutPieces = [];
let selectedId = null;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// 图片路径：相对路径补前导 /，绝对 URL 保持不变
function iconUrl(icon) {
  if (!icon) return '';
  if (icon.startsWith('http')) return icon;
  return '/' + icon;
}

function fmtSize(n) {
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'KB';
  return (n / 1024 / 1024).toFixed(2) + 'MB';
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 2200);
}
function showLogin() { $('#login-view').classList.remove('hidden'); $('#app-view').classList.add('hidden'); }
function showApp() { $('#login-view').classList.add('hidden'); $('#app-view').classList.remove('hidden'); }

// ---------- 字段映射：snake_case ↔ camelCase ----------
function mapFurniture(r) {
  return {
    type: r.type, name: r.name, category: r.category, icon: r.icon,
    w: r.w, h: r.h, isFloor: !!r.is_floor, action: r.action,
    unlockedByDefault: !!r.unlocked_by_default, price: r.price || 0
  };
}
function mapLayout(r) {
  return {
    id: r.id, type: r.type, x: r.x, y: r.y, z: r.z,
    scale: r.scale, flip: r.flip, rot: r.rot || 0, tilt: r.tilt || 0,
    action: r.action || null, sortOrder: r.sort_order
  };
}
function mapShop(r) {
  return {
    id: r.id, kind: r.kind, emoji: r.emoji, name: r.name,
    price: r.price, bonus: JSON.parse(r.bonus || '{}'), desc: r.desc || '',
    unlocked: !!r.unlocked, icon: r.icon || ''
  };
}
function mapSeed(r) {
  return {
    key: r.key, emoji: r.emoji, name: r.name, dir: r.dir, desc: r.desc,
    feedOn: JSON.parse(r.feed_on || '[]'), stages: JSON.parse(r.stages || '[]'),
    yield: JSON.parse(r.yield || '{}')
  };
}
function mapFarmCrop(r) {
  return {
    key: r.key, name: r.name, emoji: r.emoji,
    stages: JSON.parse(r.stages || '[]'),
    minutesPerStage: r.minutes_per_stage, sortOrder: r.sort_order,
  };
}
function mapFarmPlot(r) {
  return { id: r.id, x: r.x, y: r.y, z: r.z, scale: r.scale, sortOrder: r.sort_order };
}
function mapTabBg(r) {
  return {
    tabKey: r.tab_key, bgPath: r.bg_path, updatedAt: r.updated_at,
    name: r.tab_key, isCustom: !!(r.bg_path && !r.bg_path.startsWith('assets/'))
  };
}
function mapCare(r) {
  return {
    id: r.id, emoji: r.emoji, label: r.label,
    mode: r.mode, reward: r.reward, sortOrder: r.sort_order
  };
}
function mapAI(r) {
  return {
    key: r.key, name: r.name, provider: r.provider,
    base_url: r.base_url, api_key: r.api_key, model: r.model,
    temperature: r.temperature, system_prompt: r.system_prompt,
    enabled: !!r.enabled
  };
}
function mapUser(r) {
  return {
    id: r.id, username: r.username, role: r.role,
    must_change_pw: r.must_change_pw, isPreview: !!r.is_preview,
    created_at: r.created_at
  };
}

// ---------- 通用 API（自动路由） ----------
async function api(method, path, body) {
  const client = getClient();

  // ===== 认证 =====
  if (path === '/api/auth/login') {
    const { data, error } = await client.auth.signInWithPassword({
      email: toEmail(body.username), password: body.password
    });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? '用户名或密码错误' : error.message);
    const authUser = data.user;
    const { data: profile } = await client.from('users').select('*').eq('id', authUser.id).single();
    const role = profile?.role || 'user';
    if (role !== 'admin') {
      await client.auth.signOut();
      throw new Error('该账号不是管理员（当前角色: ' + role + '，请在 Supabase Table Editor → public.users 表中将 role 改为 admin）');
    }
    _user = mapUser(profile || { id: authUser.id, username: body.username, role: 'admin' });
    token = data.session.access_token;
    localStorage.setItem(TOKEN_KEY, token);
    return { user: _user, token };
  }

  if (path === '/api/auth/me') {
    const { data: { user: authUser }, error } = await client.auth.getUser();
    if (error || !authUser) throw new Error('未登录');
    const { data: profile } = await client.from('users').select('*').eq('id', authUser.id).single();
    const role = profile?.role || 'user';
    if (role !== 'admin') throw new Error('该账号不是管理员（当前角色: ' + role + '）');
    _user = mapUser(profile || { id: authUser.id, username: '', role: 'admin' });
  }

  if (path === '/api/auth/change-password') {
    const { error } = await client.auth.updateUser({ password: body.newPassword });
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  // ===== 用户管理 / 概览 / 日志 → Edge Function（fetch 直接调用，支持 GET/PUT/DELETE） =====
  if (path.startsWith('/api/admin/users') || path === '/api/admin/overview' || path === '/api/admin/logs') {
    const efPath = path.replace('/api/admin/', '');
    const session = (await client.auth.getSession()).data.session;
    if (!session) throw new Error('未登录');
    const url = `${SUPABASE_URL}/functions/v1/admin-api/${efPath}`;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
    return data;
  }

  // ===== 文件上传 → Storage =====
  if (body instanceof FormData) {
    return await handleUpload(method, path, body);
  }

  // ===== 配置数据 → 直接读写数据库 =====
  const match = path.match(/^\/api\/admin\/([^\/]+)(?:\/(.+))?$/);
  if (!match) throw new Error('未知接口: ' + path);
  const resource = match[1];
  const id = decodeURIComponent(match[2] || '');

  const resources = {
    'furniture': {
      table: 'furniture_catalog', idField: 'type', sortField: 'type', mapper: mapFurniture,
      mapBack: r => ({
        type: r.type, name: r.name, category: r.category, icon: r.icon,
        w: r.w, h: r.h, is_floor: r.isFloor ? 1 : 0, action: r.action,
        unlocked_by_default: r.unlockedByDefault ? 1 : 0, price: r.price
      })
    },
    'room-layout': {
      table: 'default_room_layout', idField: 'id', sortField: 'sort_order', mapper: mapLayout,
      mapBack: r => ({
        id: r.id, type: r.type, x: r.x, y: r.y, z: r.z,
        scale: r.scale, flip: r.flip, rot: r.rot || 0, tilt: r.tilt || 0,
        action: r.action || null, sort_order: r.sortOrder || 0
      })
    },
    'shop': {
      table: 'shop_items', idField: 'id', sortField: 'sort_order', mapper: mapShop,
      mapBack: r => ({
        id: r.id, kind: r.kind, emoji: r.emoji, name: r.name,
        price: r.price, bonus: JSON.stringify(r.bonus || '{}'), desc: r.desc || '',
        unlocked: r.unlocked ? 1 : 0, icon: r.icon || ''
      })
    },
    'seeds': {
      table: 'seed_catalog', idField: 'key', sortField: 'sort_order', mapper: mapSeed,
      mapBack: r => ({
        key: r.key, emoji: r.emoji, name: r.name, dir: r.dir, desc: r.desc,
        feed_on: JSON.stringify(r.feedOn || '[]'), stages: JSON.stringify(r.stages || '[]'),
        yield: JSON.stringify(r.yield || '{}')
      })
    },
    'farm-crops': {
      table: 'farm_crop_catalog', idField: 'key', sortField: 'sort_order', mapper: mapFarmCrop,
      mapBack: r => ({
        key: r.key, name: r.name, emoji: r.emoji,
        stages: JSON.stringify(r.stages || '[]'),
        minutes_per_stage: r.minutesPerStage || 600, sort_order: r.sortOrder || 0,
        updated_at: new Date().toISOString(),
      })
    },
    'farm-plots': {
      table: 'farm_plot_layout', idField: 'id', sortField: 'sort_order', mapper: mapFarmPlot,
      mapBack: r => ({ id: r.id, x: r.x, y: r.y, z: r.z, scale: r.scale, sort_order: r.sortOrder || 0 })
    },
    'tab-backgrounds': {
      table: 'tab_backgrounds', idField: 'tab_key', sortField: 'tab_key', mapper: mapTabBg,
      mapBack: r => ({
        tab_key: r.tabKey, bg_path: r.bgPath, updated_at: r.updatedAt
      })
    },
    'default-care-options': {
      table: 'default_care_options', idField: 'id', sortField: 'sort_order', mapper: mapCare,
      mapBack: r => ({
        id: r.id, emoji: r.emoji, label: r.label,
        mode: r.mode, reward: r.reward, sort_order: r.sortOrder || 0
      })
    },
    'ai': {
      table: 'ai_config', idField: 'key', sortField: 'key', mapper: mapAI,
      mapBack: r => ({
        key: r.key, name: r.name, provider: r.provider,
        base_url: r.base_url, api_key: r.api_key, model: r.model,
        temperature: r.temperature, system_prompt: r.system_prompt,
        enabled: r.enabled ? 1 : 0
      })
    },
  };

  const cfg = resources[resource];
  if (!cfg) throw new Error('未知资源: ' + resource);

  // 特殊：恢复默认照顾选项
  if (resource === 'default-care-options' && id === 'restore-defaults') {
    await client.from(cfg.table).delete().neq('id', '');
    const defaults = [
      { id: 'water', emoji: '💧', label: '喝水', mode: 'recurring', reward: 3, sort_order: 0 },
      { id: 'breath', emoji: '🌬️', label: '深呼吸', mode: 'daily', reward: 3, sort_order: 1 },
      { id: 'walk', emoji: '🚶', label: '散步', mode: 'daily', reward: 3, sort_order: 2 },
      { id: 'space', emoji: '🫧', label: '放空', mode: 'daily', reward: 3, sort_order: 3 },
      { id: 'sleep', emoji: '🛌', label: '好好睡觉', mode: 'daily', reward: 3, sort_order: 4 },
      { id: 'encourage', emoji: '💪', label: '自我鼓励', mode: 'daily', reward: 3, sort_order: 5 },
    ];
    const { error } = await client.from(cfg.table).insert(defaults);
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  if (method === 'GET') {
    if (id) {
      const { data, error } = await client.from(cfg.table).select('*').eq(cfg.idField, id).single();
      if (error) throw new Error(error.message);
      return cfg.mapper(data);
    } else {
      const { data, error } = await client.from(cfg.table).select('*').order(cfg.sortField);
      if (error) throw new Error(error.message);
      return (data || []).map(cfg.mapper);
    }
  }

  if (method === 'POST') {
    const row = cfg.mapBack(body);
    const { data, error } = await client.from(cfg.table).insert(row).select();
    if (error) throw new Error(error.message);
    return cfg.mapper(data[0]);
  }

  if (method === 'PUT') {
    if (resource === 'room-layout') {
      const items = body.items || [];
      await client.from(cfg.table).delete().neq('id', '');
      if (items.length) {
        const rows = items.map(cfg.mapBack);
        const { error } = await client.from(cfg.table).insert(rows);
        if (error) throw new Error(error.message);
      }
      return { ok: true };
    }
    if (resource === 'farm-plots') {
      const items = body.items || [];
      await client.from(cfg.table).delete().neq('id', '');
      if (items.length) {
        const rows = items.map(cfg.mapBack);
        const { error } = await client.from(cfg.table).insert(rows);
        if (error) throw new Error(error.message);
      }
      return { ok: true };
    }
    if (resource === 'default-care-options' && !id) {
      const items = body || [];
      await client.from(cfg.table).delete().neq('id', '');
      if (items.length) {
        const rows = items.map(cfg.mapBack);
        const { error } = await client.from(cfg.table).insert(rows);
        if (error) throw new Error(error.message);
      }
      return { ok: true };
    }
    const row = cfg.mapBack({ ...body, [cfg.idField]: id });
    delete row[cfg.idField]; // update 时不需要 id
    const { error } = await client.from(cfg.table).update(row).eq(cfg.idField, id);
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  if (method === 'DELETE') {
    if (resource === 'tab-backgrounds') {
      // 重置为默认：把 bg_path 设为 null，让前端回退到 assets/
      const { error } = await client.from(cfg.table).update({ bg_path: null }).eq(cfg.idField, id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await client.from(cfg.table).delete().eq(cfg.idField, id);
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  throw new Error('不支持的 method: ' + method);
}

// ---------- Storage 上传处理 ----------
async function handleUpload(method, path, fd) {
  const client = getClient();
  const file = fd.get('file');
  if (!file) throw new Error('未选择文件');

  // 家具上传（行内 / 新增）
  if (path.includes('/furniture')) {
    const type = fd.get('type') || fd.get('forceName') || file.name;
    const filePath = (type + '.png').replace(/\//g, '-');
    const { data, error } = await client.storage.from('furniture-images').upload(filePath, file, { upsert: true });
    if (error) throw new Error(error.message);
    const { data: urlData } = client.storage.from('furniture-images').getPublicUrl(data.path);

    // 如果是 with-image（新增家具），还要写入数据库
    if (path.includes('/with-image')) {
      const record = {
        type: fd.get('type'),
        name: fd.get('name'),
        category: fd.get('category') || '家具',
        icon: urlData.publicUrl,
        w: parseInt(fd.get('w')) || 56,
        h: parseInt(fd.get('h')) || 56,
        is_floor: fd.get('isFloor') === '1' ? 1 : 0,
        action: fd.get('action') || null,
        unlocked_by_default: fd.get('unlockedByDefault') === 'true' ? 1 : 0,
        price: parseInt(fd.get('price')) || 0,
      };
      const { error: dbErr } = await client.from('furniture_catalog').insert(record);
      if (dbErr) throw new Error(dbErr.message);
      return { ...record, icon: urlData.publicUrl, wasMattled: false };
    }
    // 普通行内上传
    return { path: urlData.publicUrl, filename: file.name, size: file.size, wasMattled: false };
  }

  // 农场品种阶段图上传
  if (path.includes('/farm-crops/with-image')) {
    const forceName = fd.get('forceName') || ('farm-' + file.name);
    const filePath = (forceName + '.png').replace(/\//g,'-');
    const { data, error } = await client.storage.from('farm-images').upload(filePath, file, { upsert: true });
    if (error) throw new Error(error.message);
    const { data: urlData } = client.storage.from('farm-images').getPublicUrl(data.path);
    // 返回相对路径入库（去掉公共 URL 前缀，保留 storage path 对应的 assets-friendly 路径）
    // 约定：farm-images 桶公共 URL 形如 https://<proj>.supabase.co/storage/v1/object/public/farm-images/<file>
    // 前端用绝对 URL 即可（iconUrl 保留 http 开头）
    return { path: urlData.publicUrl };
  }

  // 商店上传
  if (path.includes('/shop')) {
    const id = fd.get('id') || fd.get('forceName') || file.name;
    const filePath = (id + '.png').replace(/\//g, '-');
    const { data, error } = await client.storage.from('shop-images').upload(filePath, file, { upsert: true });
    if (error) throw new Error(error.message);
    const { data: urlData } = client.storage.from('shop-images').getPublicUrl(data.path);

    if (path.includes('/with-image')) {
      const record = {
        id: fd.get('id'),
        kind: fd.get('kind') || 'physical',
        emoji: '',
        name: fd.get('name'),
        price: parseInt(fd.get('price')) || 0,
        bonus: fd.get('bonus') || '{}',
        desc: fd.get('desc') || '',
        unlocked: fd.get('unlocked') === '1' ? 1 : 0,
        icon: urlData.publicUrl,
      };
      const { error: dbErr } = await client.from('shop_items').insert(record);
      if (dbErr) throw new Error(dbErr.message);
      return { ...record, icon: urlData.publicUrl, wasMattled: false };
    }
    return { path: urlData.publicUrl, filename: file.name, size: file.size, wasMattled: false };
  }

  // Tab 背景上传
  if (path.includes('/tab-backgrounds')) {
    const tabKey = path.split('/').pop();
    const filePath = (tabKey + '.png').replace(/\//g, '-');
    const { data, error } = await client.storage.from('tab-backgrounds').upload(filePath, file, { upsert: true });
    if (error) throw new Error(error.message);
    const { data: urlData } = client.storage.from('tab-backgrounds').getPublicUrl(data.path);
    // 更新数据库
    const { error: dbErr } = await client.from('tab_backgrounds').update({ bg_path: urlData.publicUrl, updated_at: new Date().toISOString() }).eq('tab_key', tabKey);
    if (dbErr) throw new Error(dbErr.message);
    return { bgPath: urlData.publicUrl, size: file.size };
  }

  throw new Error('未知上传目标: ' + path);
}

// ---------- 上传图片辅助（兼容旧代码调用签名） ----------
async function uploadImage(url, file, extra = {}) {
  const fd = new FormData();
  fd.append('file', file);
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null) continue;
    fd.append(k, String(v));
  }
  return await api('POST', url, fd);
}

/* ===================== 登录 ===================== */
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-err').textContent = '';
  try {
    const r = await api('POST', '/api/auth/login', {
      username: $('#login-user').value.trim(),
      password: $('#login-pass').value,
    });
    token = r.token; localStorage.setItem(TOKEN_KEY, token);
    $('#who').textContent = r.user.username + '（管理员）';
    if (r.user.must_change_pw) {
      const np = prompt('首次登录，请设置新密码（≥6 位）：');
      if (np && np.length >= 6) { await api('POST', '/api/auth/change-password', { newPassword: np }); toast('密码已更新'); }
      else { logout(); return; }
    }
    showApp(); switchPanel('dashboard');
  } catch (err) { $('#login-err').textContent = err.message; }
});
$('#logout-btn').addEventListener('click', logout);
function logout() {
  token = ''; localStorage.removeItem(TOKEN_KEY);
  getClient().auth.signOut().catch(() => {});
  showLogin();
}

/* ===================== 导航 ===================== */
const loaders = {
  dashboard: loadDashboard, layout: loadLayout, unlock: loadUnlock,
  furniture: loadFurniture, shop: loadShop, seeds: loadSeeds,
  tabbg: loadTabBg, defcare: loadDefaultCare, ai: loadAI, users: loadUsers, logs: loadLogs,
  farm: loadFarm,
};
function switchPanel(sec) {
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.sec === sec));
  $$('.panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== sec));
  const loader = (loaders[sec] || (() => {}));
  const result = loader();
  if (result && typeof result.catch === 'function') {
    result.catch(e => console.error('[admin] panel load error:', sec, e));
  }
}
$$('#nav button').forEach(b => b.addEventListener('click', () => switchPanel(b.dataset.sec)));

/* ===================== 看板 ===================== */
async function loadDashboard() {
  try {
    const c = await api('GET', '/api/admin/overview');
    const cards = [
      ['玩家数', c.users], ['管理员', c.admins], ['家具类型', c.furniture],
      ['布局家具', c.layoutPieces], ['商店商品', c.shopItems], ['种子', c.seeds], ['AI 智能体', c.aiAgents],
    ];
    $('#overview').innerHTML = cards.map(([l, n]) => `<div class="card"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
  } catch (e) {
    $('#overview').innerHTML = `<p class="hint">⚠️ 看板数据加载失败（Edge Function 可能未部署）：${esc(e.message)}</p>`;
  }
}

/* ===================== 默认房间布局 ===================== */
const A_SCALE_MIN = 0.5, A_SCALE_MAX = 4.0, A_SCALE_STEP = 0.1;
const A_ROT_MIN = -75, A_ROT_MAX = 75, A_ROT_STEP = 15;
const A_TILT_MIN = -20, A_TILT_MAX = 20, A_TILT_STEP = 5;

async function loadLayout() {
  const [furn, lay] = await Promise.all([api('GET', '/api/admin/furniture'), api('GET', '/api/admin/room-layout')]);
  catalogMap = {}; furn.forEach(f => catalogMap[f.type] = f);
  layoutPieces = lay.map(p => ({ ...p, rot: p.rot || 0, tilt: p.tilt || 0 }));
  selectedId = null;
  renderPalette(furn); renderRoom(); $('#piece-props').classList.add('hidden');
}
function renderPalette(furn) {
  $('#palette-list').innerHTML = furn.map(f =>
    `<div class="palette-item" data-type="${esc(f.type)}"><img src="${iconUrl(f.icon)}" draggable="false"><span>${esc(f.name)}</span></div>`
  ).join('');
  $$('#palette-list .palette-item').forEach(el => el.addEventListener('click', () => addPiece(el.dataset.type)));
}
function addPiece(type) {
  const f = catalogMap[type]; if (!f) return;
  const id = 'ri-' + type + '-' + Date.now().toString(36);
  layoutPieces.push({ id, type, x: 50, y: 45, z: 3, scale: 1, flip: 0, rot: 0, tilt: 0, action: f.action || null });
  selectedId = id; renderRoom(); setSelectedUI();
}
function depthOf(z) {
  if (z <= 3) return 'far';
  if (z <= 4) return 'mid';
  return 'near';
}
function renderRoom() {
  const stage = $('#room-furniture');
  $$('.room-item', stage).forEach(e => e.remove());
  const items = [...layoutPieces].sort((a, b) => a.z - b.z);
  items.forEach(p => {
    const f = catalogMap[p.type];
    if (!f) return;
    const el = document.createElement('div');
    el.className = 'room-item'
      + (p.id === selectedId ? ' selected' : '')
      + (f.action ? ' has-action' : '')
      + (f.isFloor ? ' is-floor' : '');
    el.dataset.id = p.id;
    el.dataset.depth = depthOf(p.z);
    el.dataset.type = p.type;
    el.style.left = p.x + '%';
    el.style.bottom = p.y + '%';
    el.style.zIndex = 10 + p.z;
    applyElTransform(el, p, f);
    el.innerHTML = `
      <span class="ri-visual">
        <span class="ri-sprite"><img src="${iconUrl(f.icon)}" alt="${esc(f.name)}" draggable="false"></span>
        <span class="ri-shadow"></span>
        <span class="ri-badge del" data-badge="del" title="删除">✕</span>
      </span>
      <span class="ri-label">${esc(f.name)}</span>`;
    stage.appendChild(el);
    bindItemEvents(el, p, f);
  });
}
function applyElTransform(el, p, f) {
  el.style.setProperty('--ri-w', (f.w || 56) + 'px');
  el.style.setProperty('--ri-h', (f.h || 56) + 'px');
  el.style.setProperty('--ri-scale', p.scale);
  el.style.setProperty('--ri-flip', p.flip ? '-1' : '1');
  el.style.setProperty('--ri-rot', (p.rot || 0) + 'deg');
  el.style.setProperty('--ri-tilt', (p.tilt || 0) + 'deg');
}
function bindItemEvents(el, p, f) {
  el.querySelector('.ri-badge.del').addEventListener('click', e => {
    e.stopPropagation();
    layoutPieces = layoutPieces.filter(x => x.id !== p.id);
    if (selectedId === p.id) { selectedId = null; $('#piece-props').classList.add('hidden'); }
    renderRoom();
  });
  el.addEventListener('pointerdown', (e) => {
    if (e.target.dataset.badge) return;
    e.preventDefault();
    e.stopPropagation();
    selectedId = p.id; setSelectedUI();
    const stage = $('#room-furniture');
    const rect = stage.getBoundingClientRect();
    const anchorX = rect.left + (p.x / 100) * rect.width;
    const anchorY = rect.bottom - (p.y / 100) * rect.height;
    const offX = e.clientX - anchorX;
    const offY = e.clientY - anchorY;
    el.classList.add('dragging');
    const move = ev => {
      const nx = (ev.clientX - rect.left - offX) / rect.width * 100;
      const ny = (rect.bottom - ev.clientY + offY) / rect.height * 100;
      p.x = Math.max(2, Math.min(98, nx));
      p.y = Math.max(2, Math.min(98, ny));
      el.style.left = p.x + '%';
      el.style.bottom = p.y + '%';
    };
    const up = () => {
      el.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}
function setSelectedUI() {
  $$('#room-canvas .room-item').forEach(node => node.classList.toggle('selected', node.dataset.id === selectedId));
  if (selectedId) showProps(layoutPieces.find(p => p.id === selectedId));
  else $('#piece-props').classList.add('hidden');
}
function itemEl(id) { return document.querySelector('#room-canvas .room-item[data-id="' + id + '"]'); }
function showProps(p) {
  const box = $('#piece-props'); box.classList.remove('hidden');
  $('#pp-z').value = p.z; $('#pp-z-v').textContent = p.z;
  $('#pp-scale').value = p.scale; $('#pp-scale-v').textContent = (+p.scale).toFixed(1) + '×';
  $('#pp-rot-v').textContent = (p.rot || 0) + '°';
  $('#pp-tilt-v').textContent = (p.tilt || 0) + '°';
  $('#pp-flip').checked = !!p.flip;
  $('#pp-z').oninput = () => { p.z = +$('#pp-z').value; $('#pp-z-v').textContent = p.z; const e = itemEl(p.id); if (e) e.style.zIndex = 10 + p.z; };
  $('#pp-scale').oninput = () => { p.scale = +$('#pp-scale').value; $('#pp-scale-v').textContent = p.scale.toFixed(1) + '×'; const e = itemEl(p.id); if (e) applyElTransform(e, p, catalogMap[p.type]); };
  $('#pp-flip').onchange = () => { p.flip = $('#pp-flip').checked ? 1 : 0; const e = itemEl(p.id); if (e) applyElTransform(e, p, catalogMap[p.type]); };
  $('#pp-rot-l').onclick = () => nudge(p, 'rot', -A_ROT_STEP);
  $('#pp-rot-r').onclick = () => nudge(p, 'rot', A_ROT_STEP);
  $('#pp-tilt-l').onclick = () => nudge(p, 'tilt', -A_TILT_STEP);
  $('#pp-tilt-r').onclick = () => nudge(p, 'tilt', A_TILT_STEP);
  $('#pp-del').onclick = () => { layoutPieces = layoutPieces.filter(x => x.id !== p.id); selectedId = null; renderRoom(); box.classList.add('hidden'); };
}
function nudge(p, key, d) {
  const min = key === 'rot' ? A_ROT_MIN : A_TILT_MIN;
  const max = key === 'rot' ? A_ROT_MAX : A_TILT_MAX;
  const v = Math.max(min, Math.min(max, (p[key] || 0) + d));
  p[key] = v;
  const e = itemEl(p.id);
  if (e) applyElTransform(e, p, catalogMap[p.type]);
  if (key === 'rot') $('#pp-rot-v').textContent = v + '°';
  else $('#pp-tilt-v').textContent = v + '°';
}
$('#room-canvas').addEventListener('pointerdown', (e) => {
  if (e.target.closest('.room-item')) return;
  selectedId = null; setSelectedUI();
});
$('#layout-save').addEventListener('click', async () => {
  try { await api('PUT', '/api/admin/room-layout', { items: layoutPieces }); toast('布局已保存（作为新用户初始房间）'); }
  catch (err) { toast(err.message); }
});
$('#layout-clear').addEventListener('click', () => { if (confirm('确认清空默认布局？')) { layoutPieces = []; selectedId = null; renderRoom(); $('#piece-props').classList.add('hidden'); } });

/* ===================== 初始解锁家具 ===================== */
async function loadUnlock() {
  const furn = await api('GET', '/api/admin/furniture');
  $('#unlock-grid').innerHTML = furn.map(f => `
    <div class="cell">
      <img src="${iconUrl(f.icon)}">
      <div class="nm">${esc(f.name)}</div>
      <label><input type="checkbox" data-type="${esc(f.type)}" ${f.unlockedByDefault ? 'checked' : ''}/> 初始解锁</label>
    </div>`).join('');
  $$('#unlock-grid input[type=checkbox]').forEach(cb => cb.addEventListener('change', async () => {
    try { await api('PUT', '/api/admin/furniture/' + cb.dataset.type, { unlockedByDefault: cb.checked }); toast('已更新：' + cb.dataset.type); }
    catch (err) { toast(err.message); cb.checked = !cb.checked; }
  }));
}

/* ===================== 家具库 ===================== */
let _pendingUploadType = null;

async function loadFurniture() {
  const furn = await api('GET', '/api/admin/furniture');
  $('#furn-table').innerHTML = `<table><thead><tr>
    <th>类型</th><th>名称</th><th>分类</th><th style="min-width:230px">图标 / 上传</th><th>宽</th><th>高</th><th>落地</th><th>价格</th><th>动作</th><th></th></tr></thead><tbody>
    ${furn.map(f => `<tr data-type="${esc(f.type)}">
      <td><input value="${esc(f.type)}" disabled></td>
      <td><input data-f="name" value="${esc(f.name)}"></td>
      <td><input data-f="category" value="${esc(f.category)}"></td>
      <td class="furn-icon-cell">
        <div class="ic-wrap">
          <img class="ic-thumb" src="${iconUrl(f.icon)}" alt="" onerror="this.style.opacity=0"/>
          <input data-f="icon" value="${esc(f.icon)}" placeholder="assets/pixel/xxx.png"/>
          <div class="upload-stack">
            <label class="matting-toggle" title="勾选后上传会自动抠除白底/实景背景（rembg，首次下载模型稍慢）">
              <input type="checkbox" class="row-matting" data-type="${esc(f.type)}" checked />
              <span>抠图</span>
            </label>
            <button type="button" class="mini upload-btn" data-act="upload" data-type="${esc(f.type)}">📤 上传图片</button>
          </div>
        </div>
      </td>
      <td><input data-f="w" type="number" value="${f.w}"></td>
      <td><input data-f="h" type="number" value="${f.h}"></td>
      <td><input data-f="isFloor" type="checkbox" ${f.isFloor ? 'checked' : ''}></td>
      <td><input data-f="price" type="number" min="0" value="${f.price || 0}"></td>
      <td><input data-f="action" value="${esc(f.action || '')}"></td>
      <td class="row-actions"><button class="mini" data-act="save">保存</button><button class="mini del" data-act="del">删</button></td>
    </tr>`).join('')}
    </tbody></table>`;
  bindRowOps('#furn-table', '/api/admin/furniture/', 'type', ['name', 'category', 'icon', 'w', 'h', 'isFloor', 'price', 'action']);
  bindFurnUpload();
}
function bindFurnUpload() {
  $$('#furn-table button[data-act=upload]').forEach(btn => {
    btn.addEventListener('click', () => {
      _pendingUploadType = btn.dataset.type;
      const inp = $('#furn-upload-input');
      inp.value = '';
      inp.click();
    });
  });
}
$('#furn-upload-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  const type = _pendingUploadType;
  _pendingUploadType = null;
  if (!file || !type) return;
  try {
    toast('上传中…');
    const r = await uploadImage('/api/admin/furniture/upload', file, { forceName: type });
    const tr = document.querySelector('#furn-table tbody tr[data-type="' + type + '"]');
    if (tr) {
      const iconInput = tr.querySelector('[data-f=icon]');
      const thumb = tr.querySelector('.ic-thumb');
      if (iconInput) iconInput.value = r.path;
      if (thumb) { thumb.src = r.path; thumb.style.opacity = 1; }
    }
    toast('✓ 已上传：' + r.filename + '；记得点「保存」写入数据库');
  } catch (err) { toast(err.message); }
});

/* ===== 新增家具：打开模态框 ===== */
$('#furn-add').addEventListener('click', openAddFurnModal);
$('#furn-add-close').addEventListener('click', closeAddFurnModal);
$('#fa-cancel').addEventListener('click', closeAddFurnModal);
$('#furn-add-modal').addEventListener('click', (e) => { if (e.target.id === 'furn-add-modal') closeAddFurnModal(); });

function openAddFurnModal() {
  ['fa-type','fa-name','fa-action','fa-category'].forEach(id => $('#' + id).value = '');
  $('#fa-category').value = '家具';
  $('#fa-w').value = 56; $('#fa-h').value = 56; $('#fa-price').value = 0;
  $('#fa-floor').checked = false; $('#fa-unlocked').checked = true;
  $('#fa-matting').checked = true;
  $('#fa-alpha').checked = false;
  $('#fa-submit').disabled = false;
  _addFurnSelectedFile = null;
  $('#fa-file').value = '';
  $('#fa-filename').textContent = '未选择文件（建议 PNG，白底或实景，≤8MB；会自动抠除背景）';
  $('#fa-preview').classList.add('hidden');
  $('#fa-preview-img').src = '';
  $('#fa-info').textContent = '';
  $('#furn-add-modal').classList.remove('hidden');
  setTimeout(() => $('#fa-type').focus(), 30);
}
function closeAddFurnModal() {
  $('#furn-add-modal').classList.add('hidden');
  _addFurnSelectedFile = null;
}
$('#fa-pick-btn').addEventListener('click', () => $('#fa-file').click());
let _addFurnSelectedFile = null;
$('#fa-file').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  _addFurnSelectedFile = f;
  $('#fa-filename').textContent = `${f.name} · ${fmtSize(f.size)}`;
  const url = URL.createObjectURL(f);
  const img = $('#fa-preview-img');
  img.onload = () => {
    $('#fa-preview').classList.remove('hidden');
    $('#fa-info').textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
    const wEl = $('#fa-w'), hEl = $('#fa-h');
    if (wEl.value === '56' && img.naturalWidth) wEl.value = Math.max(1, Math.round(img.naturalWidth));
    if (hEl.value === '56' && img.naturalHeight) hEl.value = Math.max(1, Math.round(img.naturalHeight));
    URL.revokeObjectURL(url);
  };
  img.src = url;
});
$('#fa-submit').addEventListener('click', async () => {
  const type = $('#fa-type').value.trim();
  const name = $('#fa-name').value.trim();
  if (!type || !name) return toast('type 和 名称 必填');
  if (!_addFurnSelectedFile) return toast('请选择家具图片');
  const btn = $('#fa-submit');
  btn.disabled = true;
  const fd = new FormData();
  fd.append('file', _addFurnSelectedFile, _addFurnSelectedFile.name);
  fd.append('forceName', type);
  fd.append('type', type);
  fd.append('name', name);
  fd.append('category', $('#fa-category').value.trim() || '家具');
  fd.append('w', $('#fa-w').value);
  fd.append('h', $('#fa-h').value);
  fd.append('isFloor', $('#fa-floor').checked ? '1' : '');
  fd.append('action', $('#fa-action').value.trim());
  fd.append('unlockedByDefault', $('#fa-unlocked').checked ? 'true' : 'false');
  fd.append('price', $('#fa-price').value);
  try {
    toast('创建中…');
    const r = await api('POST', '/api/admin/furniture/with-image', fd);
    toast(`✓ 已创建家具「${name}」· icon=${r.icon}`);
    closeAddFurnModal();
    loadFurniture();
  } catch (err) { toast(err.message); } finally { btn.disabled = false; }
});

/* ===================== 商店 ===================== */
let _pendingShopUploadId = null;
async function loadShop() {
  const shop = await api('GET', '/api/admin/shop');
  $('#shop-table').innerHTML = `<table><thead><tr>
    <th>ID</th><th>类别</th><th>图标</th><th>名称</th><th>价格</th><th>加成(JSON)</th><th>描述</th><th>上架</th><th></th></tr></thead><tbody>
    ${shop.map(s => `<tr data-id="${esc(s.id)}">
      <td><input value="${esc(s.id)}" disabled></td>
      <td><input data-f="kind" value="${esc(s.kind)}"></td>
      <td class="ic-cell">
        ${s.icon ? `<img src="${iconUrl(s.icon)}?t=${Date.now()}" class="ic-thumb" style="opacity:1" />` : `<span class="ic-thumb ic-placeholder">📷</span>`}
        <input data-f="icon" value="${esc(s.icon || '')}" hidden />
        <button class="mini" data-act="shop-upload" data-id="${esc(s.id)}" title="上传图片">📤</button>
      </td>
      <td><input data-f="name" value="${esc(s.name)}"></td>
      <td><input data-f="price" type="number" value="${s.price}"></td>
      <td><input data-f="bonus" value="${esc(JSON.stringify(s.bonus))}"></td>
      <td><input data-f="desc" value="${esc(s.desc || '')}"></td>
      <td><input data-f="unlocked" type="checkbox" ${s.unlocked ? 'checked' : ''}></td>
      <td class="row-actions"><button class="mini" data-act="save">保存</button><button class="mini del" data-act="del">删</button></td>
    </tr>`).join('')}
    </tbody></table>`;
  bindRowOps('#shop-table', '/api/admin/shop/', 'id', ['kind', 'icon', 'name', 'price', 'bonus', 'desc', 'unlocked']);
  bindShopUpload();
}
function bindShopUpload() {
  $$('#shop-table button[data-act=shop-upload]').forEach(btn => {
    btn.addEventListener('click', () => {
      _pendingShopUploadId = btn.dataset.id;
      $('#shop-upload-input').value = '';
      $('#shop-upload-input').click();
    });
  });
}
$('#shop-upload-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  const id = _pendingShopUploadId;
  _pendingShopUploadId = null;
  if (!file || !id) return;
  try {
    toast('上传中…');
    const r = await uploadImage('/api/admin/shop/upload', file, { forceName: id });
    const tr = document.querySelector('#shop-table tbody tr[data-id="' + id + '"]');
    if (tr) {
      const iconInput = tr.querySelector('[data-f=icon]');
      const thumb = tr.querySelector('.ic-thumb');
      if (iconInput) iconInput.value = r.path;
      if (thumb) { thumb.src = r.path + '?t=' + Date.now(); thumb.style.opacity = 1; thumb.classList.remove('ic-placeholder'); }
    }
    toast('✓ 已上传：' + r.filename + '；记得点「保存」写入数据库');
  } catch (err) { toast(err.message); }
});

/* ===== 新增商品：模态框 ===== */
$('#shop-add').addEventListener('click', openAddShopModal);
$('#shop-add-close').addEventListener('click', closeAddShopModal);
$('#sa-cancel').addEventListener('click', closeAddShopModal);
$('#shop-add-modal').addEventListener('click', (e) => { if (e.target.id === 'shop-add-modal') closeAddShopModal(); });

let _addShopFile = null;
function openAddShopModal() {
  $('#sa-id').value = ''; $('#sa-name').value = '';
  $('#sa-kind').value = 'physical';
  $('#sa-price').value = 0; $('#sa-bonus').value = '';
  $('#sa-desc').value = '';
  $('#sa-unlocked').checked = true; $('#sa-matting').checked = true;
  $('#sa-submit').disabled = false;
  _addShopFile = null;
  $('#sa-file').value = '';
  $('#sa-filename').textContent = '未选择文件（建议 PNG，≤8MB）';
  $('#sa-preview').classList.add('hidden');
  $('#sa-preview-img').src = '';
  $('#sa-info').textContent = '';
  $('#shop-add-modal').classList.remove('hidden');
  setTimeout(() => $('#sa-id').focus(), 30);
}
function closeAddShopModal() {
  $('#shop-add-modal').classList.add('hidden');
  _addShopFile = null;
}
$('#sa-pick-btn').addEventListener('click', () => $('#sa-file').click());
$('#sa-file').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  _addShopFile = f;
  $('#sa-filename').textContent = `${f.name} · ${fmtSize(f.size)}`;
  const url = URL.createObjectURL(f);
  const img = $('#sa-preview-img');
  img.onload = () => {
    $('#sa-preview').classList.remove('hidden');
    $('#sa-info').textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
    URL.revokeObjectURL(url);
  };
  img.src = url;
});
$('#sa-submit').addEventListener('click', async () => {
  const id = $('#sa-id').value.trim();
  const name = $('#sa-name').value.trim();
  const kind = $('#sa-kind').value;
  if (!id || !name) return toast('ID 和 名称 必填');
  if (!_addShopFile) return toast('请选择商品图片');
  const btn = $('#sa-submit');
  btn.disabled = true;
  const fd = new FormData();
  fd.append('file', _addShopFile, _addShopFile.name);
  fd.append('id', id);
  fd.append('name', name);
  fd.append('kind', kind);
  fd.append('price', $('#sa-price').value);
  fd.append('bonus', $('#sa-bonus').value.trim() || '{}');
  fd.append('desc', $('#sa-desc').value.trim());
  fd.append('unlocked', $('#sa-unlocked').checked ? '1' : '0');
  try {
    toast('创建中…');
    const r = await api('POST', '/api/admin/shop/with-image', fd);
    toast(`✓ 已创建商品「${name}」· icon=${r.icon}`);
    closeAddShopModal();
    loadShop();
  } catch (err) { toast(err.message); } finally { btn.disabled = false; }
});

/* ===================== 种子 ===================== */
async function loadSeeds() {
  const seeds = await api('GET', '/api/admin/seeds');
  $('#seed-table').innerHTML = `<table><thead><tr>
    <th>key</th><th>图标</th><th>名称</th><th>方向</th><th>描述</th><th>feedOn(csv)</th><th>stages(csv)</th><th>yield(JSON)</th><th></th></tr></thead><tbody>
    ${seeds.map(s => `<tr data-id="${esc(s.key)}">
      <td><input value="${esc(s.key)}" disabled></td>
      <td><input data-f="emoji" value="${esc(s.emoji || '')}" style="width:40px"></td>
      <td><input data-f="name" value="${esc(s.name)}"></td>
      <td><input data-f="dir" value="${esc(s.dir || '')}"></td>
      <td><input data-f="desc" value="${esc(s.desc || '')}"></td>
      <td><input data-f="feedOn" value="${esc(s.feedOn.join(','))}"></td>
      <td><input data-f="stages" value="${esc(s.stages.join(','))}"></td>
      <td><input data-f="yield" value="${esc(JSON.stringify(s.yield))}"></td>
      <td class="row-actions"><button class="mini" data-act="save">保存</button><button class="mini del" data-act="del">删</button></td>
    </tr>`).join('')}
    </tbody></table>`;
  bindRowOps('#seed-table', '/api/admin/seeds/', 'key', ['emoji', 'name', 'dir', 'desc', 'feedOn', 'stages', 'yield'],
    { feedOn: v => v.split(',').map(x => x.trim()).filter(Boolean), stages: v => v.split(',').map(x => x.trim()).filter(Boolean), yield: v => JSON.parse(v || '{}') });
}
$('#seed-add').addEventListener('click', async () => {
  const key = prompt('新种子 key（英文）：'); if (!key) return;
  try { await api('POST', '/api/admin/seeds', { key, name: key }); loadSeeds(); toast('已新增'); }
  catch (err) { toast(err.message); }
});

/* ===================== Tab 页面背景 ===================== */
let _pendingTabBgKey = null;

async function loadTabBg() {
  const list = await api('GET', '/api/admin/tab-backgrounds');
  $('#tabbg-grid').innerHTML = list.map(t => `
    <div class="tabbg-card" data-tabkey="${esc(t.tabKey)}">
      <div class="tb-head">
        <div class="tb-title">${esc(t.name)} <small style="color:var(--muted)">(${esc(t.tabKey)})</small></div>
        <span class="tb-tag ${t.isCustom ? 'custom' : ''}">${t.isCustom ? '自定义' : '默认'}</span>
      </div>
      <div class="tb-thumb">
        ${t.bgPath ? `<img src="${iconUrl(t.bgPath)}?t=${encodeURIComponent(t.updatedAt || '')}" alt="${esc(t.name)}背景" />` : `<div class="tb-empty">暂无背景</div>`}
      </div>
      <div class="tb-path">${esc(t.bgPath || '(无)')}</div>
      <div class="tb-actions">
        <button class="mini" data-act="upload">📤 上传图片</button>
        <button class="mini del" data-act="reset" ${t.isCustom ? '' : 'disabled'}>↺ 重置默认</button>
      </div>
    </div>`).join('');
  $$('#tabbg-grid .tabbg-card').forEach(card => {
    const tabKey = card.dataset.tabkey;
    $('[data-act=upload]', card).onclick = () => {
      _pendingTabBgKey = tabKey;
      const inp = $('#tabbg-upload-input');
      inp.value = '';
      inp.click();
    };
    $('[data-act=reset]', card).onclick = async () => {
      if (!confirm(`确认将「${tabKey}」背景重置为默认？`)) return;
      try { await api('DELETE', '/api/admin/tab-backgrounds/' + tabKey); toast('已重置为默认'); loadTabBg(); }
      catch (err) { toast(err.message); }
    };
  });
}

$('#tabbg-upload-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  const tabKey = _pendingTabBgKey;
  _pendingTabBgKey = null;
  if (!file || !tabKey) return;
  try {
    toast(`上传中（${file.name} · ${fmtSize(file.size)}）…`);
    const r = await uploadImage('/api/admin/tab-backgrounds/' + tabKey, file);
    toast(`✓ 已更新「${tabKey}」背景：${r.bgPath}（${fmtSize(r.size)}）`);
    loadTabBg();
  } catch (err) { toast(err.message); }
});

/* ===================== 每日照顾选项 ===================== */
let _defcareDragId = null;

function _renderDefcare(list) {
  const wrap = $('#defcare-list');
  if (!list || list.length === 0) {
    wrap.innerHTML = '';
    $('#defcare-empty').classList.remove('hidden');
    return;
  }
  $('#defcare-empty').classList.add('hidden');
  wrap.innerHTML = list.map((o, i) => `
    <div class="defcare-row" data-id="${esc(o.id)}" draggable="true">
      <div class="dc-drag" title="拖动调整顺序">⋮⋮</div>
      <div class="dc-emoji">${esc(o.emoji || '❔')}</div>
      <input class="dc-id" type="text" data-f="id" value="${esc(o.id)}" placeholder="英文ID" title="英文唯一ID，如 water" />
      <input type="text" data-f="label" value="${esc(o.label || '')}" placeholder="中文名，如 喝水" />
      <select data-f="mode" title="模式：daily 每日一次 / recurring 可持续">
        <option value="daily"     ${o.mode === 'daily'     ? 'selected' : ''}>每日 · daily</option>
        <option value="recurring" ${o.mode === 'recurring' ? 'selected' : ''}>循环 · recurring</option>
      </select>
      <input type="number" data-f="reward" min="0" max="100" value="${esc(o.reward ?? 3)}" title="完成一次奖励金币" />
      <input type="text" data-f="emoji" value="${esc(o.emoji || '')}" placeholder="emoji，如 💧" />
      <button type="button" class="dc-del" data-act="del" title="删除该选项">🗑️</button>
    </div>
  `).join('');

  $$('#defcare-list .defcare-row').forEach(row => {
    row.addEventListener('dragstart', (e) => {
      _defcareDragId = row.dataset.id;
      row.classList.add('dragging');
      try { e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      _defcareDragId = null;
      $$('#defcare-list .defcare-row').forEach(r => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (row.dataset.id !== _defcareDragId) row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      if (!_defcareDragId || _defcareDragId === row.dataset.id) return;
      const rows = [...wrap.querySelectorAll('.defcare-row')];
      const from = rows.findIndex(r => r.dataset.id === _defcareDragId);
      const to = rows.findIndex(r => r === row);
      if (from < 0 || to < 0) return;
      const cur = _collectDefcare();
      const [moved] = cur.splice(from, 1);
      cur.splice(to, 0, moved);
      _renderDefcare(cur);
    });

    const delBtn = $('[data-act=del]', row);
    if (delBtn) delBtn.onclick = () => {
      const total = wrap.querySelectorAll('.defcare-row').length;
      if (total <= 1) { toast('至少保留一个选项'); return; }
      if (!confirm(`确认删除「${row.querySelector('[data-f=label]').value || row.dataset.id}」？`)) return;
      row.remove();
      if (wrap.querySelectorAll('.defcare-row').length === 0) $('#defcare-empty').classList.remove('hidden');
    };

    const emojiInput = row.querySelector('[data-f=emoji]');
    const emojiBox = row.querySelector('.dc-emoji');
    if (emojiInput && emojiBox) {
      emojiInput.addEventListener('input', () => {
        emojiBox.textContent = emojiInput.value || '❔';
      });
    }
  });
}

function _collectDefcare() {
  const rows = [...document.querySelectorAll('#defcare-list .defcare-row')];
  return rows.map(r => {
    const id =    r.querySelector('[data-f=id]').value.trim();
    const emoji = r.querySelector('[data-f=emoji]').value.trim();
    const label = r.querySelector('[data-f=label]').value.trim();
    const mode =  r.querySelector('[data-f=mode]').value;
    const reward = parseInt(r.querySelector('[data-f=reward]').value, 10);
    return { id, emoji, label, mode, reward: isNaN(reward) ? 0 : reward };
  });
}

async function loadDefaultCare() {
  try {
    const list = await api('GET', '/api/admin/default-care-options');
    _renderDefcare(list);
  } catch (err) { toast(err.message); }
}

$('#defcare-add').addEventListener('click', () => {
  const cur = _collectDefcare();
  let n = cur.length + 1; let id;
  while (true) {
    id = 'option-' + n;
    if (!cur.find(c => c.id === id)) break;
    n++;
  }
  cur.push({ id, emoji: '✨', label: '新选项', mode: 'daily', reward: 3 });
  _renderDefcare(cur);
  setTimeout(() => {
    const rows = document.querySelectorAll('#defcare-list .defcare-row');
    const last = rows[rows.length - 1];
    if (last) last.querySelector('[data-f=label]').focus();
  }, 30);
});

$('#defcare-save-all').addEventListener('click', async () => {
  const list = _collectDefcare();
  if (list.length === 0) { toast('至少保留一个选项'); return; }
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(o.id)) { toast(`第 ${i + 1} 项：ID 格式不正确`); return; }
    if (seen.has(o.id)) { toast(`第 ${i + 1} 项：重复的 ID "${o.id}"`); return; }
    seen.add(o.id);
    if (!o.emoji) { toast(`第 ${i + 1} 项：emoji 必填`); return; }
    if (!o.label || o.label.length > 20) { toast(`第 ${i + 1} 项：label 必填且长度 ≤ 20`); return; }
    if (o.mode !== 'daily' && o.mode !== 'recurring') { toast(`第 ${i + 1} 项：mode 必须是 daily 或 recurring`); return; }
    if (isNaN(o.reward) || o.reward < 0 || o.reward > 100) { toast(`第 ${i + 1} 项：reward 须为 0-100 整数`); return; }
  }
  try {
    await api('PUT', '/api/admin/default-care-options', list);
    toast(`✓ 已保存 ${list.length} 项每日照顾选项`);
    loadDefaultCare();
  } catch (err) { toast(err.message); }
});

$('#defcare-restore').addEventListener('click', async () => {
  if (!confirm('确认恢复为内置 6 个默认选项？当前编辑会被覆盖。')) return;
  try {
    await api('POST', '/api/admin/default-care-options/restore-defaults');
    toast('已恢复为默认 6 项');
    loadDefaultCare();
  } catch (err) { toast(err.message); }
});

/* 通用：表格行 保存/删除 绑定 */
function bindRowOps(sel, base, idField, fields, transforms) {
  transforms = transforms || {};
  $$(sel + ' tbody tr').forEach(tr => {
    const id = tr.dataset[idField];
    const saveBtn = $('[data-act=save]', tr), delBtn = $('[data-act=del]', tr);
    saveBtn.onclick = async () => {
      const body = {};
      fields.forEach(f => {
        const el = $('[data-f=' + f + ']', tr);
        if (!el) return;
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (transforms[f]) v = transforms[f](el.value);
        body[f] = v;
      });
      try { await api('PUT', base + id, body); toast('已保存'); } catch (err) { toast(err.message); }
    };
    delBtn.onclick = async () => {
      if (!confirm('确认删除？')) return;
      try { await api('DELETE', base + id); toast('已删除'); $(sel).dispatchEvent(new Event('reload')); }
      catch (err) { toast(err.message); }
    };
  });
}

/* ===================== AI 接口 ===================== */
async function loadAI() {
  const list = await api('GET', '/api/admin/ai');
  $('#ai-list').innerHTML = list.map(a => `
    <div class="ai-card" data-key="${esc(a.key)}">
      <h3>${esc(a.name)} <small style="color:var(--muted)">(${esc(a.key)})</small></h3>
      <div class="row"><label>启用</label><input type="checkbox" data-f="enabled" ${a.enabled ? 'checked' : ''}></div>
      <div class="row"><label>供应商</label>
        <select data-f="provider"><option value="openai" ${a.provider === 'openai' ? 'selected' : ''}>OpenAI 兼容</option><option value="custom" ${a.provider === 'custom' ? 'selected' : ''}>自定义</option></select></div>
      <div class="row"><label>Base URL</label><input data-f="base_url" value="${esc(a.base_url || '')}"></div>
      <div class="row"><label>API Key</label>
        <div class="secret-wrap"><input type="password" data-f="api_key" value="${esc(a.api_key || '')}" placeholder="留空则不修改"><button type="button" class="mini" data-act="show">显示</button></div></div>
      <div class="row"><label>模型</label><input data-f="model" value="${esc(a.model || '')}"></div>
      <div class="row"><label>温度</label><input data-f="temperature" type="number" step="0.1" min="0" max="2" value="${a.temperature ?? 0.7}"></div>
      <div class="row"><label>系统提示词</label><textarea data-f="system_prompt">${esc(a.system_prompt || '')}</textarea></div>
      <div class="actions"><button class="primary" data-act="save">保存</button></div>
    </div>`).join('');
  $$('#ai-list .ai-card').forEach(card => {
    const key = card.dataset.key;
    const showBtn = $('[data-act=show]', card);
    showBtn.onclick = () => { const i = $('[data-f=api_key]', card); i.type = i.type === 'password' ? 'text' : 'password'; showBtn.textContent = i.type === 'password' ? '显示' : '隐藏'; };
    $('[data-act=save]', card).onclick = async () => {
      const body = {};
      ['enabled', 'provider', 'base_url', 'api_key', 'model', 'temperature', 'system_prompt'].forEach(f => {
        const el = $('[data-f=' + f + ']', card);
        body[f] = el.type === 'checkbox' ? el.checked : el.value;
      });
      try { await api('PUT', '/api/admin/ai/' + key, body); toast('AI 配置已保存：' + key); }
      catch (err) { toast(err.message); }
    };
  });
}

/* ===================== 账号 ===================== */
$('#user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('POST', '/api/admin/users', { username: $('#u-user').value.trim(), password: $('#u-pass').value, role: $('#u-role').value });
    $('#u-user').value = ''; $('#u-pass').value = ''; toast('账号已创建'); loadUsers();
  } catch (err) { toast(err.message); }
});
async function loadUsers() {
  try {
    const users = await api('GET', '/api/admin/users');
    $('#user-table').innerHTML = `<table><thead><tr><th>ID</th><th>用户名</th><th>角色</th><th>预览</th><th>强制改密</th><th>创建时间</th><th></th></tr></thead><tbody>
      ${users.map(u => `<tr data-id="${u.id}">
        <td>${u.id}</td><td>${esc(u.username)}</td>
        <td><select data-f="role"><option value="user" ${u.role === 'user' ? 'selected' : ''}>玩家</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>管理员</option></select></td>
        <td><label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" data-f="preview" ${u.isPreview ? 'checked' : ''}/><span style="font-size:11px;color:${u.isPreview ? 'var(--brand2)' : 'var(--muted)'}">${u.isPreview ? '🔄 是' : '否'}</span></label></td>
        <td>${u.must_change_pw ? '是' : '否'}</td><td>${esc((u.created_at || '').slice(0, 19))}</td>
        <td class="row-actions"><button class="mini" data-act="role">改角色</button><button class="mini del" data-act="del">删</button></td>
      </tr>`).join('')}
      </tbody></table>`;
    $$('#user-table tbody tr').forEach(tr => {
      const id = tr.dataset.id;
      $('[data-act=role]', tr).onclick = async () => {
        const role = $('[data-f=role]', tr).value;
        try { await api('PUT', '/api/admin/users/' + id + '/role', { role }); toast('角色已更新'); loadUsers(); }
        catch (err) { toast(err.message); }
      };
      $('[data-act=del]', tr).onclick = async () => {
        if (!confirm('确认删除该账号？')) return;
        try { await api('DELETE', '/api/admin/users/' + id); toast('已删除'); loadUsers(); }
        catch (err) { toast(err.message); }
      };
      $('[data-f=preview]', tr).onchange = async () => {
        const isPreview = $('[data-f=preview]', tr).checked;
        try { await api('PUT', '/api/admin/users/' + id + '/preview', { isPreview }); toast('预览已' + (isPreview ? '开启' : '关闭')); }
        catch (err) { toast(err.message); $('[data-f=preview]', tr).checked = !isPreview; }
      };
    });
  } catch (e) {
    $('#user-table').innerHTML = `<p class="hint">⚠️ 账号管理需要部署 Edge Function（admin-api）：${esc(e.message)}</p>`;
  }
}

/* ===================== 日志 ===================== */
async function loadLogs() {
  try {
    const logs = await api('GET', '/api/admin/logs');
    $('#log-table').innerHTML = `<table><thead><tr><th>时间</th><th>管理员</th><th>动作</th><th>目标</th><th>详情</th></tr></thead><tbody>
      ${logs.map(l => `<tr><td>${esc((l.created_at || '').slice(0, 19))}</td><td>${esc(l.admin_name)}</td><td>${esc(l.action)}</td><td>${esc(l.target)}</td><td>${esc(l.detail)}</td></tr>`).join('')}
      </tbody></table>`;
    if (!logs.length) $('#log-table').innerHTML = '<p class="hint">暂无操作记录。</p>';
  } catch (e) {
    $('#log-table').innerHTML = `<p class="hint">⚠️ 日志需要部署 Edge Function（admin-api）：${esc(e.message)}</p>`;
  }
}

/* ===================== 启动 ===================== */
(async function init() {
  if (!token) { showLogin(); return; }
  try {
    const me = await api('GET', '/api/auth/me');
    if (me.user.role !== 'admin') { logout(); showLogin(); $('#login-err').textContent = '该账号不是管理员'; return; }
    $('#who').textContent = me.user.username + '（管理员）';
    showApp(); switchPanel('dashboard');
  } catch (e) { showLogin(); }
})();

/* ===================== 技能农场 ===================== */
let farmPlots = [];
let farmSelectedId = null;

async function loadFarm() {
  const [crops, plots, tabbg] = await Promise.all([
    api('GET', '/api/admin/farm-crops'),
    api('GET', '/api/admin/farm-plots'),
    api('GET', '/api/admin/tab-backgrounds'),
  ]);
  const t3 = tabbg.find(t => t.tabKey === 'tab3');
  $('#farm-land-bg').src = t3 && t3.bgPath ? iconUrl(t3.bgPath) : '/assets/farm/land.png';
  farmPlots = plots.map(p => ({ ...p }));
  farmSelectedId = null;
  renderFarmCrops(crops);
  renderFarmPlots();
  $('#farm-plot-props').classList.add('hidden');
}

function renderFarmCrops(crops) {
  $('#farm-crop-table').innerHTML = `<table><thead><tr>
    <th>key</th><th>emoji</th><th>名称</th><th>阶段数</th><th>每阶分钟</th><th></th></tr></thead><tbody>
    ${crops.map(c => `<tr data-id="${esc(c.key)}">
      <td>${esc(c.key)}</td>
      <td>${esc(c.emoji||'')}</td>
      <td>${esc(c.name)}</td>
      <td>${c.stages.length}</td>
      <td>${c.minutesPerStage}</td>
      <td class="row-actions">
        <button class="mini" data-act="edit" data-key="${esc(c.key)}">编辑</button>
        <button class="mini del" data-act="del" data-key="${esc(c.key)}">删</button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;
  bindRowOps('#farm-crop-table', '/api/admin/farm-crops/', 'key',
    ['emoji','name','stages','minutesPerStage','sortOrder'],
    { stages: v => JSON.parse(v||'[]'), minutesPerStage: v=>+v||600, sortOrder: v=>+v||0 });
  $$('#farm-crop-table [data-act="edit"]').forEach(b => b.addEventListener('click', () => openFarmCropModal(b.dataset.key)));
}

// ---- 格子拖拽画布（镜像 room-layout） ----
function renderFarmPlots() {
  const stage = $('#farm-plots-stage');
  $$('.farm-plot-item', stage).forEach(e => e.remove());
  [...farmPlots].sort((a,b)=>a.z-b.z).forEach(p => {
    const el = document.createElement('div');
    el.className = 'room-item farm-plot-item' + (p.id===farmSelectedId?' selected':'');
    el.dataset.id = p.id;
    el.style.left = p.x + '%';
    el.style.bottom = p.y + '%';
    el.style.zIndex = 10 + p.z;
    el.style.setProperty('--ri-w','48px');
    el.style.setProperty('--ri-h','32px');
    el.style.setProperty('--ri-scale', p.scale || 1);
    el.innerHTML = `<span class="ri-visual"><span class="ri-sprite" style="background:rgba(120,80,40,.35);border:2px dashed #6b4a22;border-radius:6px;display:block;width:100%;height:100%;"></span><span class="ri-badge del" data-badge="del" title="删除">✕</span></span>`;
    stage.appendChild(el);
    bindFarmPlotEvents(el, p);
  });
}
function bindFarmPlotEvents(el, p) {
  el.querySelector('.ri-badge.del').addEventListener('click', e => {
    e.stopPropagation();
    farmPlots = farmPlots.filter(x => x.id !== p.id);
    if (farmSelectedId === p.id) { farmSelectedId = null; $('#farm-plot-props').classList.add('hidden'); }
    renderFarmPlots();
  });
  el.addEventListener('pointerdown', e => {
    if (e.target.dataset.badge) return;
    e.preventDefault(); e.stopPropagation();
    farmSelectedId = p.id; setSelectedFarmUI();
    const stage = $('#farm-plots-stage');
    const rect = stage.getBoundingClientRect();
    const anchorX = rect.left + (p.x/100)*rect.width;
    const anchorY = rect.bottom - (p.y/100)*rect.height;
    const offX = e.clientX - anchorX, offY = e.clientY - anchorY;
    el.classList.add('dragging');
    const move = ev => {
      const nx = (ev.clientX-rect.left-offX)/rect.width*100;
      const ny = (rect.bottom-ev.clientY+offY)/rect.height*100;
      p.x = Math.max(2, Math.min(98, nx));
      p.y = Math.max(2, Math.min(98, ny));
      el.style.left = p.x+'%'; el.style.bottom = p.y+'%';
    };
    const up = () => { el.classList.remove('dragging'); window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
}
function setSelectedFarmUI() {
  $$('#farm-canvas .farm-plot-item').forEach(n => n.classList.toggle('selected', n.dataset.id===farmSelectedId));
  if (farmSelectedId) {
    const p = farmPlots.find(x=>x.id===farmSelectedId); if(!p) return;
    const box = $('#farm-plot-props'); box.classList.remove('hidden');
    $('#fpp-z').value = p.z; $('#fpp-z-v').textContent = p.z;
    $('#fpp-scale').value = p.scale; $('#fpp-scale-v').textContent = (+p.scale).toFixed(1)+'×';
    $('#fpp-z').oninput = () => { p.z = +$('#fpp-z').value; $('#fpp-z-v').textContent = p.z; const e = farmEl(p.id); if(e) e.style.zIndex = 10+p.z; };
    $('#fpp-scale').oninput = () => { p.scale = +$('#fpp-scale').value; $('#fpp-scale-v').textContent = p.scale.toFixed(1)+'×'; const e = farmEl(p.id); if(e) e.style.setProperty('--ri-scale', p.scale); };
    $('#fpp-del').onclick = () => { farmPlots = farmPlots.filter(x=>x.id!==p.id); farmSelectedId=null; renderFarmPlots(); box.classList.add('hidden'); };
  } else $('#farm-plot-props').classList.add('hidden');
}
function farmEl(id){ return document.querySelector('#farm-canvas .farm-plot-item[data-id="'+id+'"]'); }

$('#farm-plot-add').addEventListener('click', () => {
  const id = 'fp-' + Date.now().toString(36);
  farmPlots.push({ id, x:50, y:45, z:3, scale:1, sortOrder: farmPlots.length });
  farmSelectedId = id; renderFarmPlots(); setSelectedFarmUI();
});
$('#farm-plot-save').addEventListener('click', async () => {
  try { await api('PUT','/api/admin/farm-plots',{ items: farmPlots }); toast('格子布局已保存（预览账号 2.5s 同步）'); }
  catch(err){ toast(err.message); }
});
$('#farm-plot-clear').addEventListener('click', () => { if(confirm('清空所有格子？')){ farmPlots=[]; farmSelectedId=null; renderFarmPlots(); $('#farm-plot-props').classList.add('hidden'); } });
$('#farm-canvas').addEventListener('pointerdown', e => { if (e.target === $('#farm-land-bg')) { farmSelectedId=null; setSelectedFarmUI(); } });

// ---- 品种模态框（含阶段图上传） ----
let _fcEditingKey = null;
let _fcStages = [];   // [{image,name}]
$('#farm-crop-add').addEventListener('click', () => openFarmCropModal(null));
async function openFarmCropModal(key) {
  _fcEditingKey = key || null;
  $('#fc-modal-title').textContent = key ? '编辑品种' : '新增品种';
  if (key) {
    const crops = await api('GET','/api/admin/farm-crops');
    const c = crops.find(x=>x.key===key) || {};
    $('#fc-key').value = c.key||''; $('#fc-key').disabled = true;
    $('#fc-name').value = c.name||'';
    $('#fc-emoji').value = c.emoji||'';
    $('#fc-mps').value = c.minutesPerStage||600;
    _fcStages = (c.stages||[]).map(s=>({image:s.image||'',name:s.name||''}));
  } else {
    $('#fc-key').value=''; $('#fc-key').disabled=false;
    $('#fc-name').value=''; $('#fc-emoji').value=''; $('#fc-mps').value=600;
    _fcStages = [{image:'',name:'破土'},{image:'',name:'成熟'}];
  }
  renderFcStages();
  $('#farm-crop-modal').classList.remove('hidden');
}
function renderFcStages() {
  $('#fc-stages').innerHTML = _fcStages.map((s,i)=>`
    <div class="fc-stage" data-i="${i}" style="display:flex;gap:6px;align-items:center;margin-top:4px;">
      <input class="fc-stage-name" type="text" value="${esc(s.name)}" placeholder="阶段名" style="width:90px;" />
      <button type="button" class="mini" data-up="${i}">选图</button>
      <span class="fc-stage-img" style="width:40px;height:28px;background:url('${iconUrl(s.image)}') center/contain no-repeat;border:1px solid #ccc;display:inline-block;"></span>
      <button type="button" class="mini del" data-rm="${i}">✕</button>
    </div>`).join('');
  $$('#fc-stages .fc-stage-name').forEach(i => i.oninput = e => _fcStages[+i.dataset.i].name = e.target.value);
  $$('#fc-stages [data-up]').forEach(b => b.onclick = () => pickFcStageImage(+b.dataset.up));
  $$('#fc-stages [data-rm]').forEach(b => b.onclick = () => { _fcStages.splice(+b.dataset.rm,1); renderFcStages(); });
}
$('#fc-add-stage').addEventListener('click', () => { _fcStages.push({image:'',name:''}); renderFcStages(); });
function pickFcStageImage(i) {
  const inp = $('#fc-upload-input');
  inp.onchange = async () => {
    const file = inp.files[0]; if(!file) return;
    try {
      const fd = new FormData(); fd.append('file', file);
      fd.append('forceName', 'farm-' + Date.now().toString(36) + '-' + i);
      const r = await api('POST','/api/admin/farm-crops/with-image', fd);
      _fcStages[i].image = r.path; renderFcStages();
    } catch(err){ toast(err.message); }
    inp.value='';
  };
  inp.click();
}
$('#fc-close').addEventListener('click', () => $('#farm-crop-modal').classList.add('hidden'));
$('#fc-cancel').addEventListener('click', () => $('#farm-crop-modal').classList.add('hidden'));
$('#fc-submit').addEventListener('click', async () => {
  const key = $('#fc-key').value.trim(); const name = $('#fc-name').value.trim();
  if (!key || !name) return toast('key 与名称必填');
  const body = {
    key, name, emoji: $('#fc-emoji').value, minutesPerStage: +$('#fc-mps').value||600,
    stages: _fcStages, sortOrder: 0,
  };
  try {
    if (_fcEditingKey) await api('PUT', `/api/admin/farm-crops/${encodeURIComponent(_fcEditingKey)}`, body);
    else await api('POST','/api/admin/farm-crops', body);
    $('#farm-crop-modal').classList.add('hidden');
    const crops = await api('GET','/api/admin/farm-crops'); renderFarmCrops(crops);
    toast('已保存');
  } catch(err){ toast(err.message); }
});