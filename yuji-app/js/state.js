/* ============================================================
   状态管理（多用户化：配置走后端 / 状态按账号存后端）
   - 配置（家具库 / 种子 / 默认布局 / 解锁 / AI / 每日上限）由 init() 通过 Api.getConfig() 拉取
   - 用户状态由 init() 通过 Api.getState() 读取（按登录账号），未登录则回退 localStorage 离线模式
   - 所有写操作：先写本地缓存，再防抖同步到后端（仅登录态）
   - 内置 FALLBACK_* 常量：后端不可达时仍能单机运行
   ============================================================ */

const State = (() => {
  const STORAGE_KEY = 'yuji_state_v5';

  // ============================================================
  // 内置兜底常量（后端不可达时使用，保证单机可玩）
  // ============================================================

  // 房间背景（仅保留白昼一张底图）。src 会被 applyConfig() 用后端下发的 tab1 背景覆盖
  const BG_CATALOG = [
    { id: 'day', name: '白昼', src: 'assets/tab1beijing.png', custom: false, time: 'morning' },
  ];

  // 4 个 Tab 当前背景路径（applyConfig 用后端下发值填充；缺省回退到内置默认）
  // tab1 单独走 BG_CATALOG[0].src（tab1.js renderBg 读它），tab2/3/4 走 DOM <img> 直接改 src
  let tabBackgrounds = {
    tab1: 'assets/tab1beijing.png',
    tab2: 'assets/tab2-forest.png',
    tab3: 'assets/tab3-garden-bg.jpg',
    tab4: 'assets/tab4-stars.png',
  };
  const TAB_BG_DOM_SEL = {
    tab2: '.tab2-bg',
    tab3: '.tab3-bg',
    tab4: '.tab4-bg',
  };
  // 把 tabBackgrounds 应用到 DOM（tab2/3/4 的 <img> src）；tab1 由 tab1.js renderBg 渲染
  function applyTabBgToDom() {
    for (const k of Object.keys(TAB_BG_DOM_SEL)) {
      const img = document.querySelector(TAB_BG_DOM_SEL[k]);
      if (img) img.src = tabBackgrounds[k];
    }
  }

  const FALLBACK_ROOM_CATALOG = [
    { type: 'bed',      icon: 'assets/pixel/bed.png',      w: 64, h: 52, name: '小床',     category: '家具', price: 40, unlockedByDefault: 1 },
    { type: 'bed-big',  icon: 'assets/pixel/bed-big.png',  w: 80, h: 64, name: '大床',     category: '家具', price: 60, unlockedByDefault: 1 },
    { type: 'sofa',     icon: 'assets/pixel/sofa.png',     w: 60, h: 44, name: '沙发',     category: '家具', price: 35, unlockedByDefault: 1 },
    { type: 'chair',    icon: 'assets/pixel/chair.png',    w: 36, h: 52, name: '小椅',     category: '家具', price: 12, unlockedByDefault: 1 },
    { type: 'table',    icon: 'assets/pixel/table.png',    w: 48, h: 40, name: '小木桌',   category: '家具', price: 15, unlockedByDefault: 1 },
    { type: 'shelf',    icon: 'assets/pixel/shelf.png',    w: 56, h: 56, name: '置物架',   category: '家具', action: 'shelf', price: 20, unlockedByDefault: 1 },
    { type: 'window',   icon: 'assets/pixel/window.png',   w: 44, h: 48, name: '小窗',     category: '家具', price: 18, unlockedByDefault: 1 },
    { type: 'lamp',     icon: 'assets/pixel/lamp.png',     w: 36, h: 56, name: '台灯',     category: '灯光', price: 12, unlockedByDefault: 1 },
    { type: 'candle',   icon: 'assets/pixel/candle.png',   w: 28, h: 44, name: '烛台',     category: '灯光', price: 14, unlockedByDefault: 0 },
    { type: 'plant',    icon: 'assets/pixel/plant.png',    w: 44, h: 60, name: '盆栽',     category: '绿植', price: 16, unlockedByDefault: 1 },
    { type: 'flowers',  icon: 'assets/pixel/flowers.png',  w: 36, h: 52, name: '花束',     category: '绿植', price: 18, unlockedByDefault: 0 },
    { type: 'painting', icon: 'assets/pixel/painting.png', w: 48, h: 40, name: '画框',     category: '装饰', price: 22, unlockedByDefault: 1 },
    { type: 'clock',    icon: 'assets/pixel/clock.png',    w: 36, h: 36, name: '小钟',     category: '装饰', price: 20, unlockedByDefault: 1 },
    { type: 'basket',   icon: 'assets/pixel/basket.png',    w: 44, h: 36, name: '小篮',     category: '装饰', price: 10, unlockedByDefault: 0 },
    { type: 'rug',      icon: 'assets/pixel/rug.png',      w: 80, h: 40, name: '小地毯',   category: '装饰', isFloor: true, price: 25, unlockedByDefault: 1 },
    { type: 'teddy',    icon: 'assets/pixel/teddy.png',    w: 44, h: 48, name: '玩偶',     category: '陪伴', price: 15, unlockedByDefault: 1 },
    { type: 'cat',      icon: 'assets/pixel/cat.png',      w: 48, h: 40, name: '小猫',     category: '陪伴', price: 30, unlockedByDefault: 1 },
    { type: 'books',    icon: 'assets/pixel/books.png',    w: 44, h: 36, name: '书堆',     category: '陪伴', price: 12, unlockedByDefault: 1 },
    { type: 'radio',    icon: 'assets/pixel/radio.png',    w: 44, h: 40, name: '收音机',   category: '陪伴', price: 24, unlockedByDefault: 0 },
    { type: 'tea',      icon: 'assets/pixel/tea.png',      w: 32, h: 36, name: '茶杯',     category: '陪伴', price: 8,  unlockedByDefault: 0 },
    { type: 'letter',   icon: 'assets/pixel/letter.png',   w: 40, h: 32, name: '小我的信', category: '陪伴', action: 'letter', price: 12, unlockedByDefault: 1 },
    { type: 'piggy',    icon: 'assets/pixel/piggy.png',    w: 40, h: 44, name: '存钱罐',   category: '功能', action: 'shop', price: 28, unlockedByDefault: 1 },
  ];

  const FALLBACK_SEED_CATALOG = [
    { key: 'selfcare', emoji: '🌿', name: '练习好好休息', dir: '自我照顾', desc: '在「此刻」完成自我照顾，会为它输送养料', feedOn: ['selfcare', 'habit'], stages: ['seed-selfcare-s1', 'seed-selfcare-s2', 'seed-selfcare-s3', 'seed-selfcare-s4'], yield: { emoji: '🪴', name: '治愈盆栽', bonus: { happiness: 2, health: 2 } } },
    { key: 'emotion',  emoji: '🌱', name: '练习情绪觉察', dir: '情绪能力', desc: '在「遇见」记录一次情绪，会为它输送养料', feedOn: ['emotion'], stages: ['seed-emotion-s1', 'seed-emotion-s2', 'seed-emotion-s3', 'seed-emotion-s4'], yield: { emoji: '🌸', name: '觉察之花', bonus: { happiness: 3 } } },
    { key: 'action',   emoji: '🌵', name: '练习立刻行动', dir: '行动力', desc: '完成一件小事并记下，会为它输送养料', feedOn: ['action', 'selfcare'], stages: ['seed-action-s1', 'seed-action-s2', 'seed-action-s3', 'seed-action-s4'], yield: { emoji: '🌼', name: '行动小花', bonus: { happiness: 2, health: 1 } } },
    { key: 'interest', emoji: '🌻', name: '探索一个爱好', dir: '兴趣探索', desc: '尝试新事物、记录新发现，会为它输送养料', feedOn: ['interest', 'express'], stages: ['seed-interest-s1', 'seed-interest-s2', 'seed-interest-s3', 'seed-interest-s4'], yield: { emoji: '🎨', name: '灵感之花', bonus: { happiness: 3 } } },
    { key: 'express',  emoji: '💐', name: '练习主动表达', dir: '表达能力', desc: '写下自我鼓励、表达真实想法，会为它输送养料', feedOn: ['express', 'emotion'], stages: ['seed-express-s1', 'seed-express-s2', 'seed-express-s3', 'seed-express-s4'], yield: { emoji: '💐', name: '勇气花束', bonus: { happiness: 2 } } },
    { key: 'habit',    emoji: '🌾', name: '养成小习惯', dir: '生活习惯', desc: '坚持一次好习惯（喝水/睡觉/散步…），会为它输送养料', feedOn: ['habit', 'selfcare'], stages: ['seed-habit-s1', 'seed-habit-s2', 'seed-habit-s3', 'seed-habit-s4'], yield: { emoji: '🌾', name: '丰收麦穗', bonus: { health: 3 } } },
  ];

  const FALLBACK_DEFAULT_ROOM_ITEMS = [
    { id: 'ri-window',   type: 'window',   x: 8,  y: 34, z: 2, scale: 1,    flip: 0 },
    { id: 'ri-painting', type: 'painting', x: 30, y: 36, z: 2, scale: 0.9,  flip: 0 },
    { id: 'ri-clock',    type: 'clock',    x: 60, y: 38, z: 2, scale: 0.85, flip: 0 },
    { id: 'ri-lamp',     type: 'lamp',     x: 84, y: 30, z: 3, scale: 1,    flip: 0 },
    { id: 'ri-plant',    type: 'plant',    x: 92, y: 16, z: 3, scale: 1,    flip: 0 },
    { id: 'ri-shelf',    type: 'shelf',    x: 10, y: 18, z: 4, scale: 1,    flip: 0, action: 'shelf' },
    { id: 'ri-books',    type: 'books',    x: 18, y: 10, z: 5, scale: 1,    flip: 0 },
    { id: 'ri-rug',      type: 'rug',      x: 40, y: 8,  z: 4, scale: 1.4,  flip: 0 },
    { id: 'ri-cat',      type: 'cat',      x: 56, y: 12, z: 5, scale: 1,    flip: 0 },
    { id: 'ri-teddy',    type: 'teddy',    x: 70, y: 14, z: 5, scale: 1,    flip: 0 },
    { id: 'ri-piggy',    type: 'piggy',    x: 88, y: 10, z: 6, scale: 1,    flip: 0, action: 'shop' },
    { id: 'ri-letter',   type: 'letter',   x: 48, y: 44, z: 6, scale: 0.95, flip: 0, action: 'letter' },
  ];

  // ============================================================
  // 动态配置（由 init() 填充；默认取兜底值）
  // ============================================================
  let roomCatalog = FALLBACK_ROOM_CATALOG;       // 家具库
  let seedCatalog = FALLBACK_SEED_CATALOG;       // 种子目录
  let defaultRoomItems = FALLBACK_DEFAULT_ROOM_ITEMS; // 默认房间布局
  let FEED_PER_STAGE = 3;
  let DAILY_COIN_CAP = 20;
  let unlockedTypes = [];                        // 初始解锁的家具类型（新用户可用）
  let aiConfig = [];                            // 公开 AI 配置（不含密钥）：[{key,name,provider,model,enabled}]
  let farmCropCatalog = [];
  let farmPlotLayout = [];
  let meta = { appName: '予己' };

  // 新用户初始「每日自我照顾」选项（applyConfig 用后端值填充；缺省回退内置默认 6 项）
  const FALLBACK_DEF_CARE = [
    { id: 'water',     emoji: '💧', label: '喝水',     mode: 'recurring', reward: 3 },
    { id: 'breath',    emoji: '🌬️', label: '深呼吸',   mode: 'daily',     reward: 3 },
    { id: 'walk',      emoji: '🚶', label: '散步',     mode: 'daily',     reward: 3 },
    { id: 'space',     emoji: '🫧', label: '放空',     mode: 'daily',     reward: 3 },
    { id: 'sleep',     emoji: '🛌', label: '好好睡觉', mode: 'daily',     reward: 3 },
    { id: 'encourage', emoji: '💪', label: '自我鼓励', mode: 'daily',     reward: 3 },
  ];
  let defaultCareOptions = FALLBACK_DEF_CARE.slice();

  function applyConfig(cfg) {
    if (!cfg) return;
    if (Array.isArray(cfg.furnitureCatalog) && cfg.furnitureCatalog.length) roomCatalog = cfg.furnitureCatalog;
    if (Array.isArray(cfg.seedCatalog) && cfg.seedCatalog.length) seedCatalog = cfg.seedCatalog;
    if (Array.isArray(cfg.defaultRoomLayout) && cfg.defaultRoomLayout.length) defaultRoomItems = cfg.defaultRoomLayout;
    if (cfg.dailyCoinCap) DAILY_COIN_CAP = parseInt(cfg.dailyCoinCap, 10) || 20;
    if (Array.isArray(cfg.unlockedTypes) && cfg.unlockedTypes.length) unlockedTypes = cfg.unlockedTypes;
    else unlockedTypes = roomCatalog.filter(f => f.unlockedByDefault).map(f => f.type);
    if (Array.isArray(cfg.aiConfig)) aiConfig = cfg.aiConfig;
    if (cfg.appName) meta.appName = cfg.appName;
    // 新用户初始照顾选项
    if (Array.isArray(cfg.defaultCareOptions) && cfg.defaultCareOptions.length) {
      defaultCareOptions = cfg.defaultCareOptions.map(o => ({
        id: o.id, emoji: o.emoji, label: o.label,
        mode: (o.mode === 'recurring' ? 'recurring' : 'daily'),
        reward: parseInt(o.reward, 10) || 0,
      }));
    }
    // 4 个 Tab 背景：后端下发 { tab1: {path, updatedAt}, ... }；缺省回退内置默认
    if (cfg.tabBackgrounds && typeof cfg.tabBackgrounds === 'object') {
      let changed = false;
      for (const k of Object.keys(tabBackgrounds)) {
        const t = cfg.tabBackgrounds[k];
        const p = typeof t === 'string' ? t : (t && t.path ? t.path : tabBackgrounds[k]);
        if (tabBackgrounds[k] !== p) { tabBackgrounds[k] = p; changed = true; }
      }
      // tab1 走 BG_CATALOG[0].src（tab1.js renderBg 读它）
      if (BG_CATALOG[0].src !== tabBackgrounds.tab1) { BG_CATALOG[0].src = tabBackgrounds.tab1; changed = true; }
      // tab2/3/4 走 DOM <img> 直接改 src（首屏 init 时 DOM 可能尚未渲染，预览轮询时已渲染）
      if (changed) applyTabBgToDom();
    }
    if (Array.isArray(cfg.farmCropCatalog)) farmCropCatalog = cfg.farmCropCatalog;
    if (Array.isArray(cfg.farmPlotLayout)) farmPlotLayout = cfg.farmPlotLayout;
  }

  // ============================================================
  // 默认状态构造（使用当前配置，便于新用户拿到管理员设定的初始房间）
  // ============================================================
  function buildDefaultState() {
    const items = defaultRoomItems.map(it => ({
      id: it.id, type: it.type, x: it.x, y: it.y, z: it.z,
      scale: it.scale != null ? it.scale : 1, flip: it.flip || 0,
      rot: it.rot || 0, tilt: it.tilt || 0,
      action: it.action || null,
      obtainedAt: null, source: '初始资产', story: '',
    }));
    // 从 defaultCareOptions（后端下发 / 兜底常量）构建用户初始 careOptions
    const careOpts = (defaultCareOptions.length > 0 ? defaultCareOptions : FALLBACK_DEF_CARE).map(o => ({
      id: o.id,
      emoji: o.emoji,
      label: o.label,
      done: false,
      mode: (o.mode === 'recurring' ? 'recurring' : 'daily'),
      pinned: false,
      skipped: false,
      reward: parseInt(o.reward, 10) || 0,
    }));
    return {
      careValue: 0, healthValue: 0, happinessValue: 0, comfortValue: 0,
      coin: 0, dailyCoin: 0, lastCoinDate: '',
      careOptions: careOpts,
      customCareOptions: [],
      roomItems: items,
      furnitureInventory: [], // 已获得但未摆放的家具（家具库展示这里）
      placements: [],
      selectedForPlace: [],
      roomBg: 'day',
      emotionRecords: [],
      farmPlots: [],          // 技能农场：每个已占格子一条 {plotId,skillName,cropKey,progress,sessions,goals,createdAt,matured}
      farmWarehouse: [],     // 成熟收获纪念
      shopItems: {
        physical: [
          { id: 'teddy',  emoji: '🧸', name: '小熊玩偶', price: 15, bonus: { happiness: 2, health: 1 }, owned: false },
          { id: 'cake',   emoji: '🎂', name: '小蛋糕',   price: 25, bonus: { happiness: 3, health: 2 }, owned: false },
          { id: 'lamp',   emoji: '💡', name: '小台灯',   price: 12, bonus: { happiness: 1, health: 1 }, owned: false },
          { id: 'carpet', emoji: '🟫', name: '小地毯',   price: 20, bonus: { happiness: 2, health: 1 }, owned: false },
          { id: 'cushion',emoji: '🛋️', name: '抱枕',     price: 18, bonus: { happiness: 2 },         owned: false },
          { id: 'toy',    emoji: '🪀', name: '像素玩具', price: 10, bonus: { happiness: 1 },         owned: false },
        ],
        spirit: [
          { id: 'movie',  emoji: '🎬', name: '看一场电影',  price: 30, bonus: { happiness: 5 }, desc: '房间灯光调暗，小我坐下观看' },
          { id: 'feast',  emoji: '🍰', name: '享用美食大餐', price: 40, bonus: { happiness: 8 }, desc: '小我享用美食动画' },
          { id: 'travel', emoji: '🏕️', name: '短途外出冒险', price: 50, bonus: { happiness: 6 }, desc: '短暂切换简易户外像素片段' },
          { id: 'birth',  emoji: '🎉', name: '生日时刻',    price: 80, bonus: { happiness: 10 }, desc: '弹出蛋糕动画，小我暖心独白' },
        ],
      },
      starPoints: [],
      generatedStarsMeta: {
        generated: {},       // { sourceId: true } — 前端模板星 dedup 标记
        lastAiRunAt: '',     // 上一次 star-miner 成功调用的 ISO ts
      },
      letterRead: [],
      letters: [],
      selfManual: { chapter1: '还在认识中…', chapter2: '还在认识中…', chapter3: '还在认识中…', chapter4: '还在认识中…', chapter5: '还在认识中…', updatedAt: '' },
      createdAt: new Date().toISOString(),
      visitDates: [],
    };
  }

  // 工具
  function deepMerge(target, src) {
    for (const k in src) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
        target[k] = deepMerge(target[k] || {}, src[k]);
      } else {
        target[k] = src[k];
      }
    }
    return target;
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  // 加载（仅本地缓存，用于离线/未登录兜底）
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return buildDefaultState();
      const saved = JSON.parse(raw);
      return deepMerge(buildDefaultState(), saved);
    } catch (e) {
      console.warn('[State] load failed', e);
      return buildDefaultState();
    }
  }

  // 初始状态（先兜底，init() 再按配置/账号刷新）
  let state = load();

  // ---------- 多用户初始化 ----------
  let initialized = false;
  async function init() {
    // 1) 公开配置
    try {
      const cfg = await Api.getConfig();
      applyConfig(cfg);
    } catch (e) {
      console.warn('[State] 配置拉取失败，使用内置默认：', e.message);
    }
    // 2) 预览账号：永远按当前默认房间初始化，不写后端，启动轮询实时同步后台改动
    if (Api.isPreview()) {
      console.log('[State] 预览账号检测到，启动实时同步轮询');
      state = buildDefaultState();
      startPreviewPolling();
      ensureDaily();
      initialized = true;
      return;
    }
    // 3) 普通账号
    if (Api.isAuthed()) {
      try {
        const r = await Api.getState();
        if (r && r.data) {
          state = deepMerge(buildDefaultState(), r.data);
        } else {
          state = buildDefaultState();
          // 新账号：先落一份初始状态到后端
          scheduleSync(true);
        }
      } catch (e) {
        console.warn('[State] 状态拉取失败，使用本地缓存：', e.message);
        state = load();
      }
    } else {
      // 未登录：离线单机模式，重新 load 一次以应用刚拉取到的后端默认布局
      // （模块加载时 state = load() 用的还是本地 FALLBACK；applyConfig 后 defaultRoomItems 已更新为后端值）
      state = load();
    }
    ensureDaily();
    initialized = true;
  }

  // ---------- 预览账号：实时同步后台 ----------
  // 用当前 defaultRoomItems 生成默认房间物品列表（与 buildDefaultState 内的映射保持一致）
  function buildDefaultRoomItems() {
    return defaultRoomItems.map(it => ({
      id: it.id, type: it.type, x: it.x, y: it.y, z: it.z,
      scale: it.scale != null ? it.scale : 1, flip: it.flip || 0,
      rot: it.rot || 0, tilt: it.tilt || 0,
      action: it.action || null,
      obtainedAt: null, source: '初始资产', story: '',
    }));
  }
  function currentConfigFingerprint() {
    return JSON.stringify({
      l: defaultRoomItems, u: unlockedTypes, c: DAILY_COIN_CAP,
      k: roomCatalog.map(f => f.type).join(','),
      b: tabBackgrounds,
      d: defaultCareOptions,
      f: farmCropCatalog, p: farmPlotLayout,
    });
  }
  let previewTimer = null;
  function startPreviewPolling() {
    if (previewTimer) return;
    console.log('[State] 预览轮询已启动（2.5s 间隔）');
    previewTimer = setInterval(pollPreviewConfig, 2500);
  }
  async function pollPreviewConfig() {
    try {
      const cfg = await Api.getConfig();
      const before = currentConfigFingerprint();
      applyConfig(cfg);
      const after = currentConfigFingerprint();
      if (after !== before) {
        console.log('[State] 预览轮询：检测到后台配置变更，刷新房间');
        // 后端配置变更：重建房间为最新默认布局，重置照顾选项，通知 Tab1 重渲染
        state.roomItems = buildDefaultRoomItems();
        state.farmPlots = [];   // 预览账号：后台格子变更后重置农场为空（始终反映最新格子布局）
        // 仅在预览账号重置照顾选项（避免普通用户轮询时自己的选项被冲掉）
        if (typeof Api !== 'undefined' && Api.isPreview && Api.isPreview()) {
          const rebuilt = buildDefaultState();
          state.careOptions = rebuilt.careOptions;
        }
        if (typeof Tab1 !== 'undefined' && Tab1.refresh) Tab1.refresh();
      }
    } catch (e) {
      console.warn('[State] 预览轮询失败:', e.message);
    }
  }

  // 保存：本地缓存 + 防抖同步后端（仅登录态；预览账号不同步后端）
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    scheduleSync();
  }
  let syncTimer = null, syncing = false;
  function scheduleSync(immediate) {
    if (typeof Api === 'undefined' || !Api.isAuthed()) return;
    if (Api.isPreview()) return; // 预览账号：不写后端（实时反映后台默认布局，不累积自有进度）
    if (immediate) { doSync(); return; }
    clearTimeout(syncTimer);
    syncTimer = setTimeout(doSync, 800);
  }
  async function doSync() {
    if (syncing) return;
    syncing = true;
    try { await Api.saveState(state); }
    catch (e) { console.warn('[State] 状态同步失败：', e.message); }
    finally { syncing = false; }
  }

  // 每日重置
  function ensureDaily() {
    const today = new Date().toISOString().slice(0, 10);
    if (state.lastCoinDate !== today) {
      state.dailyCoin = 0;
      state.lastCoinDate = today;
      const allCare = [...(state.careOptions || []), ...(state.customCareOptions || [])];
      allCare.forEach(o => {
        o.done = false;
        o.skipped = false;
        if (o.pinned === 'today') o.pinned = false;
      });
      if (!state.visitDates.includes(today)) state.visitDates.push(today);
      save();
    }
  }

  // 数值变更
  function addCare(n = 1) { state.careValue += n; save(); }
  function addHealth(n = 1) { state.healthValue += n; save(); }
  function addHappiness(n = 1) { state.happinessValue += n; save(); }
  function addComfort(n = 1) { state.comfortValue += n; save(); }

  function addCoin(n) {
    const remain = Math.max(0, DAILY_COIN_CAP - state.dailyCoin);
    const real = Math.min(n, remain);
    state.coin += real;
    state.dailyCoin += real;
    save();
    return real;
  }

  function reset() {
    state = buildDefaultState();
    save();
  }

  // 家具库 / 种子
  function getCatalog(type) { return roomCatalog.find(c => c.type === type) || null; }
  function getSeed(key) { return seedCatalog.find(c => c.key === key) || null; }

  // 写信（供 AI 写信功能调用）
  function addLetter(content, opts = {}) {
    state.letters.push({
      id: Utils.uid(),
      date: Utils.nowTs(),
      content: String(content),
      read: false,
      ai: !!opts.ai,
    });
    save();
    return state.letters[state.letters.length - 1];
  }

  // 技能农场
  function getFarmCrop(key) { return farmCropCatalog.find(c => c.key === key) || null; }
  function getFarmPlotByPlotId(plotId) { return state.farmPlots.find(p => p.plotId === plotId) || null; }

  function farmStageOf(p) {
    const crop = getFarmCrop(p.cropKey);
    if (!crop || !crop.stages.length) return 0;
    return Math.min(Math.floor(p.progress / Math.max(1, crop.minutesPerStage)), crop.stages.length - 1);
  }

  function plantSkill(plotId, skillName, cropKey, goals = []) {
    if (!plotId || !skillName || !getFarmCrop(cropKey)) return false;
    if (getFarmPlotByPlotId(plotId)) return false;           // 格子已占
    state.farmPlots.push({
      plotId, skillName, cropKey, progress: 0,
      sessions: [], goals: goals.map(g => ({ id: Utils.uid(), label: g.label, points: +g.points || 0, completed: false })),
      createdAt: new Date().toISOString(), matured: false,
    });
    save();
    return true;
  }

  function logSession(plotId, minutes, note) {
    const p = getFarmPlotByPlotId(plotId); if (!p) return null;
    const m = Math.max(0, +minutes || 0);
    p.sessions.push({ id: Utils.uid(), date: new Date().toISOString(), minutes: m, note: String(note || '') });
    p.progress += m;
    const stage = farmStageOf(p);
    p.matured = stage >= (getFarmCrop(p.cropKey)?.stages.length || 0) - 1;
    save();
    return { progress: p.progress, stage, matured: p.matured };
  }

  function toggleGoal(plotId, goalId) {
    const p = getFarmPlotByPlotId(plotId); if (!p) return null;
    const g = p.goals.find(x => x.id === goalId); if (!g) return null;
    g.completed = !g.completed;
    p.progress += g.completed ? g.points : -g.points;
    const stage = farmStageOf(p);
    p.matured = stage >= (getFarmCrop(p.cropKey)?.stages.length || 0) - 1;
    save();
    return { progress: p.progress, stage, matured: p.matured };
  }

  function addGoal(plotId, label, points) {
    const p = getFarmPlotByPlotId(plotId); if (!p) return null;
    const g = { id: Utils.uid(), label: String(label || ''), points: Math.max(0, +points || 0), completed: false };
    p.goals.push(g);
    save();
    return g;
  }

  function harvestSkill(plotId) {
    const p = getFarmPlotByPlotId(plotId); if (!p || !p.matured) return null;
    const crop = getFarmCrop(p.cropKey);
    const item = {
      id: 'fw-' + Utils.uid(), skillName: p.skillName, cropKey: p.cropKey,
      emoji: crop?.emoji || '🌱', name: p.skillName, source: '技能农场',
      progress: p.progress, createdAt: p.createdAt, harvestedAt: new Date().toISOString(),
    };
    state.farmWarehouse.push(item);
    state.farmPlots = state.farmPlots.filter(x => x.plotId !== plotId);
    save();
    return item;
  }

  function removeSkill(plotId) {
    const before = state.farmPlots.length;
    state.farmPlots = state.farmPlots.filter(x => x.plotId !== plotId);
    if (state.farmPlots.length !== before) { save(); return true; }
    return false;
  }

  // AI 是否启用
  function aiEnabled(key) { return aiConfig.some(a => a.key === key && a.enabled); }

  // ===== starPoints type → 星座 key 映射 =====
  // 老类型 + 新 mined_* + ai_* 全部归到 6 星座
  const TYPE_TO_CONS = {
    // 前端新挖掘
    mined_emotion:   'emotion',
    mined_dialogue:  'dialogue',
    mined_milestone: 'milestone',
    mined_selfcare:  'selfcare',
    mined_garden:    'garden',
    // AI 大星
    ai_deep:         'mirror',
    ai_breakthrough: 'mirror',
    ai_pattern:      'mirror',
    // 老类型
    emotion:         'emotion',
    letter:          'dialogue',
    milestone:       'milestone',
    spirit:          'milestone',
    care:            'selfcare',
    harvest:         'garden',
    manual:          'mirror',
    discovery:       'mirror',
  };
  function pickCategoryByType(type) {
    return TYPE_TO_CONS[type] || 'milestone';
  }

  return {
    get state() { return state; },
    get initialized() { return initialized; },
    init, save, load, reset, ensureDaily,

    addCare, addHealth, addHappiness, addComfort, addCoin,
    addLetter,

    // 配置相关（动态）
    get roomCatalog() { return roomCatalog; },
    get seedCatalog() { return seedCatalog; },
    get bgCatalog() { return BG_CATALOG; },
    get tabBackgrounds() { return tabBackgrounds; },
    get FEED_PER_STAGE() { return FEED_PER_STAGE; },
    get DAILY_COIN_CAP() { return DAILY_COIN_CAP; },
    get unlockedTypes() { return unlockedTypes; },
    get aiConfig() { return aiConfig; },
    get appName() { return meta.appName; },
    get farmCropCatalog() { return farmCropCatalog; },
    get farmPlotLayout() { return farmPlotLayout; },
    get defaultRoomItemIds() { return defaultRoomItems.map(i => i.id); },

    isAuthed: () => (typeof Api !== 'undefined' && Api.isAuthed()),
    isPreview: () => (typeof Api !== 'undefined' && Api.isPreview()),
    aiEnabled,
    pickCategoryByType,

    getCatalog, getSeed,
    plantSkill, logSession, toggleGoal, addGoal, harvestSkill, removeSkill,
    getFarmCrop, getFarmPlotByPlotId, farmStageOf,
  };
})();
