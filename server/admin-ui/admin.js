/* ============================================================
   予己 · 管理后台前端（原生 JS）
   ============================================================ */
const TOKEN_KEY = 'yuji_admin_token';
let token = localStorage.getItem(TOKEN_KEY) || '';
let catalogMap = {};        // type -> 家具元数据
let layoutPieces = [];      // 默认房间布局
let selectedId = null;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function authHeader() { return token ? { Authorization: 'Bearer ' + token } : {}; }
async function api(method, path, body) {
  // body:  普通对象 → JSON；FormData → multipart（不加 Content-Type，让浏览器自动补 boundary）
  const opt = { method, headers: { ...authHeader() } };
  if (body instanceof FormData) {
    opt.body = body;
  } else if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const res = await fetch(path, opt);
  if (res.status === 401) { logout(); throw new Error('会话已过期，请重新登录'); }
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || ('请求失败 ' + res.status));
  return data;
}

/**
 * 上传单个图片文件（multipart/form-data）
 * @param {string} url   上传地址
 * @param {File}   file  File 对象
 * @param {Object} extra 额外表单字段（会被 append 到 FormData）
 */
async function uploadImage(url, file, extra = {}) {
  const fd = new FormData();
  fd.append('file', file);
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null) continue;
    fd.append(k, String(v));
  }
  return await api('POST', url, fd);
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
    $('#who').textContent = r.user.username + (r.user.role === 'admin' ? '（管理员）' : '');
    if (r.user.must_change_pw) {
      const np = prompt('首次登录，请设置新密码（≥6 位）：');
      if (np && np.length >= 6) { await api('POST', '/api/auth/change-password', { newPassword: np }); toast('密码已更新'); }
      else { logout(); return; }
    }
    showApp(); switchPanel('dashboard');
  } catch (err) { $('#login-err').textContent = err.message; }
});
$('#logout-btn').addEventListener('click', logout);
function logout() { token = ''; localStorage.removeItem(TOKEN_KEY); showLogin(); }

/* ===================== 导航 ===================== */
const loaders = {
  dashboard: loadDashboard, layout: loadLayout, unlock: loadUnlock,
  furniture: loadFurniture, shop: loadShop, seeds: loadSeeds,
  tabbg: loadTabBg, defcare: loadDefaultCare, ai: loadAI, users: loadUsers, logs: loadLogs,
};
function switchPanel(sec) {
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.sec === sec));
  $$('.panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== sec));
  (loaders[sec] || (() => {}))();
}
$$('#nav button').forEach(b => b.addEventListener('click', () => switchPanel(b.dataset.sec)));

/* ===================== 看板 ===================== */
async function loadDashboard() {
  const c = await api('GET', '/api/admin/overview');
  const cards = [
    ['玩家数', c.users], ['管理员', c.admins], ['家具类型', c.furniture],
    ['布局家具', c.layoutPieces], ['商店商品', c.shopItems], ['种子', c.seeds], ['AI 智能体', c.aiAgents],
  ];
  $('#overview').innerHTML = cards.map(([l, n]) => `<div class="card"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
}

/* ===================== 默认房间布局（拖拽，与游戏前台视觉/交互一致）===================== */
// 家具尺寸 / 旋转 的范围与步进（与 tab1.js 一致）
const A_SCALE_MIN = 0.5, A_SCALE_MAX = 4.0, A_SCALE_STEP = 0.1;
const A_ROT_MIN = -75, A_ROT_MAX = 75, A_ROT_STEP = 15;     // Y 轴 3D 转向（侧身/转面）
const A_TILT_MIN = -20, A_TILT_MAX = 20, A_TILT_STEP = 5;   // 2D 平面倾斜

async function loadLayout() {
  const [furn, lay] = await Promise.all([api('GET', '/api/admin/furniture'), api('GET', '/api/admin/room-layout')]);
  catalogMap = {}; furn.forEach(f => catalogMap[f.type] = f);
  layoutPieces = lay.map(p => ({ ...p, rot: p.rot || 0, tilt: p.tilt || 0 }));
  selectedId = null;
  renderPalette(furn); renderRoom(); $('#piece-props').classList.add('hidden');
}
function renderPalette(furn) {
  $('#palette-list').innerHTML = furn.map(f =>
    `<div class="palette-item" data-type="${esc(f.type)}"><img src="/${esc(f.icon)}" draggable="false"><span>${esc(f.name)}</span></div>`
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
        <span class="ri-sprite"><img src="/${esc(f.icon)}" alt="${esc(f.name)}" draggable="false"></span>
        <span class="ri-shadow"></span>
        <span class="ri-badge del" data-badge="del" title="删除">✕</span>
      </span>
      <span class="ri-label">${esc(f.name)}</span>`;
    stage.appendChild(el);
    bindItemEvents(el, p, f);
  });
}
// 仅更新变换相关 CSS 变量（不重建元素，避免拖拽/调节时闪烁与卡顿）
function applyElTransform(el, p, f) {
  el.style.setProperty('--ri-w', (f.w || 56) + 'px');
  el.style.setProperty('--ri-h', (f.h || 56) + 'px');
  el.style.setProperty('--ri-scale', p.scale);
  el.style.setProperty('--ri-flip', p.flip ? '-1' : '1');
  el.style.setProperty('--ri-rot', (p.rot || 0) + 'deg');
  el.style.setProperty('--ri-tilt', (p.tilt || 0) + 'deg');
}
function bindItemEvents(el, p, f) {
  // 删除徽章
  el.querySelector('.ri-badge.del').addEventListener('click', e => {
    e.stopPropagation();
    layoutPieces = layoutPieces.filter(x => x.id !== p.id);
    if (selectedId === p.id) { selectedId = null; $('#piece-props').classList.add('hidden'); }
    renderRoom();
  });
  // 拖动（与 tab1.js 同一坐标系：以 #room-furniture 为基准，纵轴锚点为底边 → 与前台 roomFurniture 完全 WYSIWYG）
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
// 仅更新选中态（不高频重渲染，保证拖动流畅）
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
      <img src="/${esc(f.icon)}">
      <div class="nm">${esc(f.name)}</div>
      <label><input type="checkbox" data-type="${esc(f.type)}" ${f.unlockedByDefault ? 'checked' : ''}/> 初始解锁</label>
    </div>`).join('');
  $$('#unlock-grid input[type=checkbox]').forEach(cb => cb.addEventListener('change', async () => {
    try { await api('PUT', '/api/admin/furniture/' + cb.dataset.type, { unlockedByDefault: cb.checked }); toast('已更新：' + cb.dataset.type); }
    catch (err) { toast(err.message); cb.checked = !cb.checked; }
  }));
}

/* ===================== 家具库 ===================== */
let _pendingUploadType = null;   // 通用上传 input 点击前暂存的家具 type

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
          <img class="ic-thumb" src="${f.icon ? '/' + esc(f.icon) : ''}" alt="" onerror="this.style.opacity=0"/>
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
/** 绑定每行「📤 上传图片」按钮 → 调用通用隐藏 file input */
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
/** 通用 file input：选好文件后触发上传（强制保存为 {type}.png，覆盖旧图） */
$('#furn-upload-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  const type = _pendingUploadType;
  _pendingUploadType = null;
  if (!file || !type) return;
  const mattingCb = document.querySelector(`#furn-table input.row-matting[data-type="${CSS.escape(type)}"]`);
  const matting = !mattingCb || mattingCb.checked; // 默认抠图
  try {
    toast(`上传中${matting ? '（抠图模式，首次可能要下载模型≈176MB）' : ''}…`);
    const r = await uploadImage('/api/admin/furniture/upload', file, { forceName: type, matting: matting ? '1' : '0' });
    const tr = document.querySelector('#furn-table tbody tr[data-type="' + type + '"]');
    if (tr) {
      const iconInput = tr.querySelector('[data-f=icon]');
      const thumb = tr.querySelector('.ic-thumb');
      if (iconInput) iconInput.value = r.path;
      if (thumb) { thumb.src = '/' + r.path + '?t=' + Date.now(); thumb.style.opacity = 1; }
    }
    let msg = `✓ 已上传：${r.filename}（${fmtSize(r.size)}）`;
    if (r.wasMattled) {
      if (r.isFallback) msg = `⚠ 上传成功，但抠图失败：${r.mattingError || '原因未知'}。已用原图降级，可取消抠图选项后再传一次`;
      else msg = `✓ 已上传并抠图：${r.filename}（${fmtSize(r.size)}）`;
    }
    msg += '；记得点「保存」写入数据库 icon 路径';
    toast(msg);
  } catch (err) { toast(err.message); }
});

/* ===== 新增家具：打开模态框 ===== */
$('#furn-add').addEventListener('click', openAddFurnModal);
$('#furn-add-close').addEventListener('click', closeAddFurnModal);
$('#fa-cancel').addEventListener('click', closeAddFurnModal);
$('#furn-add-modal').addEventListener('click', (e) => { if (e.target.id === 'furn-add-modal') closeAddFurnModal(); });

function openAddFurnModal() {
  // 清空
  ['fa-type','fa-name','fa-action','fa-category'].forEach(id => $('#' + id).value = '');
  $('#fa-category').value = '家具';
  $('#fa-w').value = 56; $('#fa-h').value = 56; $('#fa-price').value = 0;
  $('#fa-floor').checked = false; $('#fa-unlocked').checked = true;
  $('#fa-matting').checked = true; // 默认抠图
  $('#fa-alpha').checked = false;  // 精修边缘默认关（慢）
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
    // 根据图片尺寸自动填 w/h（不覆盖用户已经手工改的值，除非是默认 56）
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
  const matting = $('#fa-matting').checked;
  const alpha = $('#fa-alpha').checked;
  const fd = new FormData();
  fd.append('file', _addFurnSelectedFile, _addFurnSelectedFile.name);
  // 新增家具时，图片强制按 {type}.png 保存，后续覆盖也很方便
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
  fd.append('matting', matting ? '1' : '0');
  fd.append('alphaMatting', alpha ? '1' : '0');
  try {
    toast(`创建中${matting ? '（抠图模式，首次可能需要下载模型约176MB，请耐心等待）' : ''}…`);
    const r = await api('POST', '/api/admin/furniture/with-image', fd);
    let msg = `✓ 已创建家具「${name}」· icon=${r.icon}`;
    if (r.wasMattled) {
      if (r.isFallback) {
        msg = `⚠ 家具「${name}」已创建，但抠图失败：${r.mattingError || '原因未知'}。已退回原图模式；可在家具库行里重新点「📤 上传图片」再试（可选取消抠图，或先把图片手动抠好）`;
      } else {
        msg = `✓ 已创建家具「${name}」并完成抠图 · icon=${r.icon}`;
      }
    }
    toast(msg);
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
        ${s.icon ? `<img src="/${esc(s.icon)}?t=${Date.now()}" class="ic-thumb" style="opacity:1" />` : `<span class="ic-thumb ic-placeholder">📷</span>`}
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
/** 绑定每行「📤 上传图片」按钮 */
function bindShopUpload() {
  $$('#shop-table button[data-act=shop-upload]').forEach(btn => {
    btn.addEventListener('click', () => {
      _pendingShopUploadId = btn.dataset.id;
      $('#shop-upload-input').value = '';
      $('#shop-upload-input').click();
    });
  });
}
/** 通用 file input：选好文件后触发上传（强制保存为 {id}.png，覆盖旧图） */
$('#shop-upload-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  const id = _pendingShopUploadId;
  _pendingShopUploadId = null;
  if (!file || !id) return;
  try {
    toast('上传中（抠图模式，首次可能要下载模型≈176MB）…');
    const r = await uploadImage('/api/admin/shop/upload', file, { forceName: id, matting: '1' });
    // 更新行内 icon 字段和缩略图
    const tr = document.querySelector('#shop-table tbody tr[data-id="' + id + '"]');
    if (tr) {
      const iconInput = tr.querySelector('[data-f=icon]');
      const thumb = tr.querySelector('.ic-thumb');
      if (iconInput) iconInput.value = r.path;
      if (thumb) { thumb.src = '/' + r.path + '?t=' + Date.now(); thumb.style.opacity = 1; thumb.classList.remove('ic-placeholder'); }
    }
    let msg = `✓ 已上传：${r.filename}（${fmtSize(r.size)}）`;
    if (r.wasMattled) {
      if (r.isFallback) msg = `⚠ 上传成功，但抠图失败：${r.mattingError || '原因未知'}。已用原图降级`;
      else msg = `✓ 已上传并抠图：${r.filename}（${fmtSize(r.size)}）`;
    }
    msg += '；记得点「保存」写入数据库 icon 路径';
    toast(msg);
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
  const matting = $('#sa-matting').checked;
  const fd = new FormData();
  fd.append('file', _addShopFile, _addShopFile.name);
  fd.append('id', id);
  fd.append('name', name);
  fd.append('kind', kind);
  fd.append('price', $('#sa-price').value);
  fd.append('bonus', $('#sa-bonus').value.trim() || '{}');
  fd.append('desc', $('#sa-desc').value.trim());
  fd.append('unlocked', $('#sa-unlocked').checked ? '1' : '0');
  fd.append('matting', matting ? '1' : '0');
  try {
    toast(`创建中${matting ? '（抠图模式，首次可能需要下载模型约176MB，请耐心等待）' : ''}…`);
    const r = await api('POST', '/api/admin/shop/with-image', fd);
    let msg = `✓ 已创建商品「${name}」· icon=${r.icon}`;
    if (r.wasMattled) {
      if (r.isFallback) {
        msg = `⚠ 商品「${name}」已创建，但抠图失败：${r.mattingError || '原因未知'}。已退回原图；可重新上传再试`;
      } else {
        msg = `✓ 已创建商品「${name}」并完成抠图 · icon=${r.icon}`;
      }
    }
    toast(msg);
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
let _pendingTabBgKey = null;   // 上传时暂存的 tabKey

async function loadTabBg() {
  const list = await api('GET', '/api/admin/tab-backgrounds');
  $('#tabbg-grid').innerHTML = list.map(t => `
    <div class="tabbg-card" data-tabkey="${esc(t.tabKey)}">
      <div class="tb-head">
        <div class="tb-title">${esc(t.name)} <small style="color:var(--muted)">(${esc(t.tabKey)})</small></div>
        <span class="tb-tag ${t.isCustom ? 'custom' : ''}">${t.isCustom ? '自定义' : '默认'}</span>
      </div>
      <div class="tb-thumb">
        ${t.bgPath ? `<img src="/${esc(t.bgPath)}?t=${encodeURIComponent(t.updatedAt || '')}" alt="${esc(t.name)}背景" />` : `<div class="tb-empty">暂无背景</div>`}
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

// 通用 file input：选好文件后上传到对应 Tab
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

  // 拖拽排序
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

    // 删除按钮
    const delBtn = $('[data-act=del]', row);
    if (delBtn) delBtn.onclick = () => {
      const total = wrap.querySelectorAll('.defcare-row').length;
      if (total <= 1) { toast('至少保留一个选项'); return; }
      if (!confirm(`确认删除「${row.querySelector('[data-f=label]').value || row.dataset.id}」？`)) return;
      row.remove();
      if (wrap.querySelectorAll('.defcare-row').length === 0) $('#defcare-empty').classList.remove('hidden');
    };

    // 输入 emoji 时同步刷新大图标
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

// 新增一行
$('#defcare-add').addEventListener('click', () => {
  const cur = _collectDefcare();
  // 生成一个不重复的临时 id
  let n = cur.length + 1; let id;
  while (true) {
    id = 'option-' + n;
    if (!cur.find(c => c.id === id)) break;
    n++;
  }
  cur.push({ id, emoji: '✨', label: '新选项', mode: 'daily', reward: 3 });
  _renderDefcare(cur);
  // 滚到底并聚焦到 label
  setTimeout(() => {
    const rows = document.querySelectorAll('#defcare-list .defcare-row');
    const last = rows[rows.length - 1];
    if (last) last.querySelector('[data-f=label]').focus();
  }, 30);
});

// 保存全部（整体覆盖）
$('#defcare-save-all').addEventListener('click', async () => {
  const list = _collectDefcare();
  if (list.length === 0) { toast('至少保留一个选项'); return; }
  // 前端校验
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(o.id)) { toast(`第 ${i + 1} 项：ID 格式不正确（须 1-32 位英文/数字/下划线/短横线）`); return; }
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

// 恢复默认 6 项
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
  const users = await api('GET', '/api/admin/users');
  $('#user-table').innerHTML = `<table><thead><tr><th>ID</th><th>用户名</th><th>角色</th><th>预览</th><th>强制改密</th><th>创建时间</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr data-id="${u.id}">
      <td>${u.id}</td><td>${esc(u.username)}</td>
      <td><select data-f="role"><option value="user" ${u.role === 'user' ? 'selected' : ''}>玩家</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>管理员</option></select></td>
      <td><label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" data-f="preview" ${u.isPreview ? 'checked' : ''}/><span style="font-size:11px;color:${u.isPreview ? 'var(--brand2)' : 'var(--muted)'};">${u.isPreview ? '🔄 是' : '否'}</span></label></td>
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
}

/* ===================== 日志 ===================== */
async function loadLogs() {
  const logs = await api('GET', '/api/admin/logs');
  $('#log-table').innerHTML = `<table><thead><tr><th>时间</th><th>管理员</th><th>动作</th><th>目标</th><th>详情</th></tr></thead><tbody>
    ${logs.map(l => `<tr><td>${esc((l.created_at || '').slice(0, 19))}</td><td>${esc(l.admin_name)}</td><td>${esc(l.action)}</td><td>${esc(l.target)}</td><td>${esc(l.detail)}</td></tr>`).join('')}
    </tbody></table>`;
  if (!logs.length) $('#log-table').innerHTML = '<p class="hint">暂无操作记录。</p>';
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
