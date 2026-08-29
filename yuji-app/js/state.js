/* ============================================================
   状态管理（多用户化：配置走后端 / 状态按账号存后端）
   - 配置（家具库 / 种子 / 默认布局 / 解锁 / AI / 每日上限）由 init() 通过 Api.getConfig() 拉取
   - 用户状态由 init() 通过 Api.getState() 读取（按登录账号），未登录则回退 localStorage 离线模式
   - 所有写操作：先写本地缓存，再防抖同步到后端（仅登录态）
   - 内置 FALLBACK_* 常量：后端不可达时仍能单机运行
   ============================================================ */

const State = (() => {
  const STORAGE_KEY = 'yuji_state_v5';

  // 按账号隔离的本地存储 key：
  //   - 已登录 → yuji_state_v5_<userId>
  //   - 未登录（游客）→ 共享的 yuji_state_v5
  // 这样同一台机器切换账号时，各账号的家具位置 / 进度不会互相串号。
  function storageKey() {
    try {
      if (typeof Api !== 'undefined' && Api.isAuthed() && typeof Api.getUser === 'function') {
        const u = Api.getUser();
        if (u && u.id) return STORAGE_KEY + '_' + u.id;
      }
    } catch (_) { /* 取不到就回退游客 key */ }
    return STORAGE_KEY;
  }

  // ============================================================
  // 数据隐私逻辑（集中、写清楚，供 UI 与同步逻辑统一引用）
  // ------------------------------------------------------------
  // 三条核心原则：
  //   1) 私密数据（情绪记录 / 心灵树洞日记 / 自我说明书 / 家具故事等）默认只存在
  //      本机（localStorage），不自动上传云端。
  //   2) 用户可对每个「数据源」单独授权 AI 读取。只有被开启的数据源，才会出现在
  //      喂给 AI 的上下文里；其余数据源的原文绝不出本机。
  //   3) 全部数据源默认关闭（偏向隐私）：要生成小我内容，需逐一打开想让 AI 参考的来源。
  // 开关项（默认值偏向隐私）：
  //   localOnly  true  → 本地存储优先，登录也不自动同步到云端
  //   aiRead     {}    → 各数据源是否允许 AI 读取（见 AI_READ_SOURCES）
  // ============================================================
  // AI 可读取的个人数据源清单（与后端 buildContext 的实际 part 一一对应）
  const AI_READ_SOURCES = [
    { id: 'emotion',   label: '情绪记录',   desc: '此刻 / 心情记录里的情绪标签与文字。' },
    { id: 'stars',     label: '成长星点',   desc: '星迹里的里程碑、自我发现与星点正文。' },
    { id: 'care',      label: '自我照顾打卡', desc: '今日照顾气泡的完成记录。' },
    { id: 'farm',      label: '花园耕作',   desc: '技能农场里种下的种子 / 成长阶段 / 收获纪念。' },
    { id: 'values',    label: '状态数值',   desc: '幸福 / 开心 / 健康 / 舒适四项数值。' },
    { id: 'furniture', label: '家具经历',   desc: '房间里家具被赋予的故事文字。' },
    { id: 'manual',    label: '自我说明书', desc: '说明书已有的五章内容（生成时作为基础）。' },
  ];
  function buildDefaultAiRead() {
    const o = {};
    AI_READ_SOURCES.forEach(s => { o[s.id] = false; });
    return o;
  }
  const PRIVACY_DEFAULTS = {
    localOnly: true,        // 本地存储优先：true=只存本机，不上传云端
    aiRead: buildDefaultAiRead(), // 各数据源是否允许 AI 读取（默认全关）
  };

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
    tab2: 'assets/tab-bg/tab2-1787835559183.jpg',
    tab3: 'assets/tab3-garden-bg.jpg',
    tab4: 'assets/dc4b2caadae673cdc65c3779dd78fd70.png',
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
    { type: 'mirror',   icon: 'assets/pixel/mirror.png',   w: 50, h: 84, name: '镜子',     category: '功能', action: 'mirror', price: 0,  unlockedByDefault: 1 },
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
    { id: 'ri-mirror',   type: 'mirror',   x: 45, y: 44, z: 2, scale: 1,    flip: 0, action: 'mirror' },
  ];

  // Tab2「本心对语」入口木牌（类型与兜底配置；位置/图标由后台 tab2_entry 控制，逻辑与 Tab1 家具一致）
  const TAB2_ENTRY_TYPE = 'tab2_entry';
  const FALLBACK_TAB2_ENTRY = {
    id: 'tab2-entry', type: TAB2_ENTRY_TYPE, x: 18, y: 34, z: 6, scale: 1,
    icon: 'assets/tab2/4f88a23bda43941aab21c7ba15d02900.png',
  };
  let tab2Entry = FALLBACK_TAB2_ENTRY; // 组装后的入口配置（含 {id,type,x,y,z,scale,icon}），缺省用兜底

  // Tab2「心灵树洞」入口木牌（同本心对语模式；用于日记记录与 AI 引导写作）
  const TAB2_TREEHOLE_TYPE = 'treehole_entry';
  const FALLBACK_TREEHOLE_ENTRY = {
    id: 'treehole-entry', type: TAB2_TREEHOLE_TYPE, x: 72, y: 32, z: 6, scale: 1,
    icon: 'assets/tab2/d0c500e16498ab7de1ce28335ef8bef9.png',
  };
  let treeholeEntry = FALLBACK_TREEHOLE_ENTRY;

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
  // 技能农场：未执行 SQL 迁移时的前端兜底（3 品种 + 3x3 菱形 9 格）
  const DEFAULT_FARM_CROP_CATALOG = [
    { key:'wheat',  name:'小麦',   emoji:'🌾',
      stages:[{image:'assets/farm/crops/wheat-s1.png',name:'破土'},{image:'assets/farm/crops/wheat-s2.png',name:'生长'},
             {image:'assets/farm/crops/wheat-s3.png',name:'繁茂'},{image:'assets/farm/crops/wheat-s4.png',name:'成熟'}],
      minutesPerStage: 600, sortOrder: 0 },
    { key:'sunflower', name:'向日葵', emoji:'🌻',
      stages:[{image:'assets/farm/crops/sunflower-s1.png',name:'破土'},{image:'assets/farm/crops/sunflower-s2.png',name:'生长'},
             {image:'assets/farm/crops/sunflower-s3.png',name:'繁茂'},{image:'assets/farm/crops/sunflower-s4.png',name:'成熟'}],
      minutesPerStage: 900, sortOrder: 1 },
    { key:'mushroom',   name:'幻菇',   emoji:'🍄',
      stages:[{image:'assets/farm/crops/mushroom-s1.png',name:'破土'},{image:'assets/farm/crops/mushroom-s2.png',name:'生长'},
             {image:'assets/farm/crops/mushroom-s3.png',name:'繁茂'},{image:'assets/farm/crops/mushroom-s4.png',name:'成熟'}],
      minutesPerStage: 1200, sortOrder: 2 },
  ];
  const DEFAULT_FARM_PLOT_LAYOUT = [
    { id:'p-2-0', x:30, y:22, z:3, scale:1, sortOrder:0 },
    { id:'p-3-0', x:50, y:22, z:3, scale:1, sortOrder:1 },
    { id:'p-4-0', x:70, y:22, z:3, scale:1, sortOrder:2 },
    { id:'p-1-1', x:20, y:45, z:3, scale:1, sortOrder:3 },
    { id:'p-2-1', x:40, y:45, z:3, scale:1, sortOrder:4 },
    { id:'p-3-1', x:60, y:45, z:3, scale:1, sortOrder:5 },
    { id:'p-2-2', x:30, y:68, z:3, scale:1, sortOrder:6 },
    { id:'p-3-2', x:50, y:68, z:3, scale:1, sortOrder:7 },
    { id:'p-4-2', x:70, y:68, z:3, scale:1, sortOrder:8 },
  ];
  let farmCropCatalog = DEFAULT_FARM_CROP_CATALOG;
  let farmPlotLayout = DEFAULT_FARM_PLOT_LAYOUT;
  const DEFAULT_FARM_LAND_CONFIG = {
    id: 'main', image: 'assets/farm/land-v2.png',
    x: 50, y: 50, z: 2, scale: 1, widthPct: 80, heightPct: 65, bgThreshold: 30,
    cropKey: 'wheat',
  };
  let farmLandConfig = DEFAULT_FARM_LAND_CONFIG;
  let farmLandList = [DEFAULT_FARM_LAND_CONFIG];
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
    if (Array.isArray(cfg.furnitureCatalog) && cfg.furnitureCatalog.length) {
      roomCatalog = cfg.furnitureCatalog.filter(f => f.type !== TAB2_ENTRY_TYPE && f.type !== TAB2_TREEHOLE_TYPE);
    }
    if (Array.isArray(cfg.seedCatalog) && cfg.seedCatalog.length) seedCatalog = cfg.seedCatalog;
    // 空数组也要更新：后台清空布局后，预览账号轮询才能检测到指纹变化并刷新房间
    // 空数组不覆盖兜底：后台未配置/清空默认布局时，新号仍使用内置设计默认房间，避免拿到空房间。
    // （早前逻辑在后台返回空数组时会把 FALLBACK_DEFAULT_ROOM_ITEMS 清空，导致新号首屏是空房间、与后台设计对不上）
    if (Array.isArray(cfg.defaultRoomLayout) && cfg.defaultRoomLayout.length > 0) {
      defaultRoomItems = cfg.defaultRoomLayout.filter(r => r.type !== TAB2_ENTRY_TYPE && r.type !== TAB2_TREEHOLE_TYPE);
    }
    // Tab2「本心对语」入口：从家具目录/默认布局中取 tab2_entry，组装成 tab2Entry
    const catEntry = Array.isArray(cfg.furnitureCatalog) ? cfg.furnitureCatalog.find(f => f.type === TAB2_ENTRY_TYPE) : null;
    const layEntry = Array.isArray(cfg.defaultRoomLayout) ? cfg.defaultRoomLayout.find(r => r.type === TAB2_ENTRY_TYPE) : null;
    if (catEntry || layEntry) {
      tab2Entry = {
        id: layEntry && layEntry.id ? layEntry.id : FALLBACK_TAB2_ENTRY.id,
        type: TAB2_ENTRY_TYPE,
        x: layEntry && layEntry.x != null ? layEntry.x : FALLBACK_TAB2_ENTRY.x,
        y: layEntry && layEntry.y != null ? layEntry.y : FALLBACK_TAB2_ENTRY.y,
        z: layEntry && layEntry.z != null ? layEntry.z : FALLBACK_TAB2_ENTRY.z,
        scale: layEntry && layEntry.scale != null ? layEntry.scale : FALLBACK_TAB2_ENTRY.scale,
        icon: catEntry && catEntry.icon ? catEntry.icon : ((layEntry && layEntry.icon) || FALLBACK_TAB2_ENTRY.icon),
      };
    } else {
      tab2Entry = FALLBACK_TAB2_ENTRY; // 后台无 tab2_entry 时用兜底
    }
    // Tab2「心灵树洞」入口：同模式组装 treeholeEntry
    const catTH = Array.isArray(cfg.furnitureCatalog) ? cfg.furnitureCatalog.find(f => f.type === TAB2_TREEHOLE_TYPE) : null;
    const layTH = Array.isArray(cfg.defaultRoomLayout) ? cfg.defaultRoomLayout.find(r => r.type === TAB2_TREEHOLE_TYPE) : null;
    if (catTH || layTH) {
      treeholeEntry = {
        id: layTH && layTH.id ? layTH.id : FALLBACK_TREEHOLE_ENTRY.id,
        type: TAB2_TREEHOLE_TYPE,
        x: layTH && layTH.x != null ? layTH.x : FALLBACK_TREEHOLE_ENTRY.x,
        y: layTH && layTH.y != null ? layTH.y : FALLBACK_TREEHOLE_ENTRY.y,
        z: layTH && layTH.z != null ? layTH.z : FALLBACK_TREEHOLE_ENTRY.z,
        scale: layTH && layTH.scale != null ? layTH.scale : FALLBACK_TREEHOLE_ENTRY.scale,
        icon: catTH && catTH.icon ? catTH.icon : ((layTH && layTH.icon) || FALLBACK_TREEHOLE_ENTRY.icon),
      };
    } else {
      treeholeEntry = FALLBACK_TREEHOLE_ENTRY;
    }
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
        // 仅自定义上传（完整 URL）覆盖代码默认；assets/ 默认路径忽略，保留内置新图
        if (p && !p.startsWith('assets/') && tabBackgrounds[k] !== p) { tabBackgrounds[k] = p; changed = true; }
      }
      // tab1 走 BG_CATALOG[0].src（tab1.js renderBg 读它）
      if (BG_CATALOG[0].src !== tabBackgrounds.tab1) { BG_CATALOG[0].src = tabBackgrounds.tab1; changed = true; }
      // tab2/3/4 走 DOM <img> 直接改 src（首屏 init 时 DOM 可能尚未渲染，预览轮询时已渲染）
      if (changed) applyTabBgToDom();
    }
    // SQL 未执行时 cfg.farmCropCatalog/farmPlotLayout 为空数组 → 保留前端内置兜底
    if (Array.isArray(cfg.farmCropCatalog) && cfg.farmCropCatalog.length)
      farmCropCatalog = cfg.farmCropCatalog;
    if (Array.isArray(cfg.farmPlotLayout) && cfg.farmPlotLayout.length)
      farmPlotLayout = cfg.farmPlotLayout;
    // farmLandList：多地块数组；数据库返回数组才覆盖（保持内置兜底）
    if (Array.isArray(cfg.farmLandList) && cfg.farmLandList.length) {
      farmLandList = cfg.farmLandList;
      farmLandConfig = cfg.farmLandList[0];
    } else if (cfg.farmLandConfig) {
      farmLandConfig = cfg.farmLandConfig;
      farmLandList = [cfg.farmLandConfig];
    }
  }

  // ============================================================
  // 默认状态构造（使用当前配置，便于新用户拿到管理员设定的初始房间）
  // ============================================================
  // 后台默认布局为空（表未配置/被清空）时，回退到内置设计默认房间，保证新号首屏永远有房间
  function effectiveDefaultRoomItems() {
    return (defaultRoomItems && defaultRoomItems.length) ? defaultRoomItems : FALLBACK_DEFAULT_ROOM_ITEMS;
  }
  function buildDefaultState() {
    const items = effectiveDefaultRoomItems().map(it => ({
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
      gardenWarehouse: [],   // 商店购买未摆放的物品（货架 inventory，非农场）
      // 技能农场：单地块（整块土地=1 个种植位，一整块地代表一块地）
      // { skillName, cropKey, progress, sessions:[{date,minutes,note,points}],
      //   goals:[{id,text,points,done,dateDone}], createdAt, matured, stage }
      farmMainPlot: null,
      farmWarehouse: [],     // 成熟收获纪念（{cropKey,skillName,harvestedAt,finalStage,totalMinutes}）
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
      tab2Dialogue: [], // Tab2「本心对语」对话历史：[{role,content,date}]
      treeholeDiaries: [], // Tab2「心灵树洞」日记列表：[{id,title,content,date,mood,tags,aiGuided:boolean,aiQuestions:[{q,a}],aiThoughts:''}]
      selfManual: { chapter1: '还在认识中…', chapter2: '还在认识中…', chapter3: '还在认识中…', chapter4: '还在认识中…', chapter5: '还在认识中…', updatedAt: '' },
      createdAt: new Date().toISOString(),
      visitDates: [],
      // 数据隐私开关（默认值见 PRIVACY_DEFAULTS，偏向隐私）
      privacy: Object.assign({}, PRIVACY_DEFAULTS),
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

  // 给 state 对象动态挂载「farmPlots」兼容 getter：单地块映射为长度 0 或 1 的数组
  // （popups/tab4 等旧代码仍访问 State.state.farmPlots.length）
  function attachFarmCompat(obj) {
    if (!obj || Object.prototype.hasOwnProperty.call(obj, 'farmPlots')) return obj;
    try {
      Object.defineProperty(obj, 'farmPlots', {
        configurable: true, enumerable: false,
        get() { return this.farmMainPlot ? [this.farmMainPlot] : []; },
      });
    } catch (_) { /* ignore */ }
    return obj;
  }

  // 加载（仅本地缓存，用于离线/未登录兜底）
  function load() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return attachFarmCompat(buildDefaultState());
      const saved = JSON.parse(raw);
      const st = attachFarmCompat(deepMerge(buildDefaultState(), saved));
      // 房间为空（老数据/被清空/异常）时回退到后台默认布局，保证首屏一定有房间，
      // 且新号不会因本地存档里的空 roomItems 而显示空房间（与后台设计保持一致）
      if (!st.roomItems || st.roomItems.length === 0) {
        st.roomItems = buildDefaultRoomItems();
      }
      return st;
    } catch (e) {
      console.warn('[State] load failed', e);
      return attachFarmCompat(buildDefaultState());
    }
  }

  // 旧版本所有账号共用 yuji_state_v5（会串号）。升级后改为按账号隔离。
  // 这里做一次迁移：登录账号首次加载时，若账号专属 key 为空而旧共享 key 有数据，
  // 把旧数据搬到该账号专属 key，并删除旧 key（只迁移一次，避免之后再被重复复制）。
  // 注意：房间布局始终以「后台默认布局」为准，迁移时丢弃旧共享状态的旧房间，
  // 避免新号继承旧房间而与后台当前设计不一致（只保留情绪/日记/数值等个人数据）。
  function migrateLegacyIfNeeded() {
    try {
      if (typeof Api === 'undefined' || !Api.isAuthed() || typeof Api.getUser !== 'function') return;
      const u = Api.getUser();
      if (!u || !u.id) return;
      const accKey = STORAGE_KEY + '_' + u.id;
      if (localStorage.getItem(accKey)) return;          // 已有账号数据，不覆盖
      const legacy = localStorage.getItem(STORAGE_KEY);
      if (!legacy) return;                                // 无旧数据可迁移
      let migrated = legacy;
      try {
        const parsed = JSON.parse(legacy);
        // 丢弃房间相关字段，让新号重新套用后台默认布局
        delete parsed.roomItems;
        delete parsed.placements;
        delete parsed.selectedForPlace;
        delete parsed.furnitureInventory;
        delete parsed.gardenWarehouse;
        migrated = JSON.stringify(parsed);
      } catch (_) { /* 解析失败则原样迁移 */ }
      localStorage.setItem(accKey, migrated);
      localStorage.removeItem(STORAGE_KEY);
      console.log('[State] 一次性迁移旧本地数据到账号', u.id, '（房间改用后台默认布局）');
    } catch (_) { /* 迁移失败不影响启动 */ }
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
      state = attachFarmCompat(buildDefaultState());
      startPreviewPolling();
      ensureDaily();
      initialized = true;
      return;
    }
    // 3) 普通账号：数据纯本地存储，不上传云端（按账号隔离）
    if (Api.isAuthed()) {
      migrateLegacyIfNeeded();   // 老用户：把旧共享 key 的数据迁到本账号专属 key
      state = load();            // 读本账号专属 key（无则默认新房间）
    } else {
      state = load();            // 游客：读共享 key
    }
    ensureDaily();
    initialized = true;
  }

  // ---------- 预览账号：实时同步后台 ----------
  // 用当前 defaultRoomItems 生成默认房间物品列表（与 buildDefaultState 内的映射保持一致）
  function buildDefaultRoomItems() {
    return effectiveDefaultRoomItems().map(it => ({
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
      f: farmCropCatalog, p: farmPlotLayout, L: farmLandList,
      th: treeholeEntry, t2: tab2Entry,
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
        // 预览账号：后台配置变更时重置当前正在种的技能（清空单地块）
        if (state.farmMainPlot) state.farmMainPlot = null;
        // 仅在预览账号重置照顾选项（避免普通用户轮询时自己的选项被冲掉）
        if (typeof Api !== 'undefined' && Api.isPreview && Api.isPreview()) {
          const rebuilt = buildDefaultState();
          state.careOptions = rebuilt.careOptions;
        }
        if (typeof Tab1 !== 'undefined' && Tab1.refresh) Tab1.refresh();
        if (typeof Tab2 !== 'undefined' && Tab2.renderEntry) Tab2.renderEntry();
        if (typeof Tab2 !== 'undefined' && Tab2.renderTreeholeEntry) Tab2.renderTreeholeEntry();
        if (typeof Tab3 !== 'undefined' && Tab3.refresh) Tab3.refresh();
      }
    } catch (e) {
      console.warn('[State] 预览轮询失败:', e.message);
    }
  }

  // 保存：只存本地 localStorage，不上传云端（保护隐私）
  function save() {
    try { localStorage.setItem(storageKey(), JSON.stringify(state)); } catch (e) {}
    // 数据纯本地，不调用 scheduleSync()
  }
  let syncTimer = null, syncing = false;
  // 是否允许把数据同步到云端：登录 + 非预览 + 且用户未开启「本地存储优先」
  function shouldSyncToCloud() {
    if (typeof Api === 'undefined' || !Api.isAuthed()) return false;
    if (Api.isPreview()) return false; // 预览账号：不写后端
    const p = state.privacy || PRIVACY_DEFAULTS;
    if (p.localOnly) return false;     // 隐私：本地优先，不上传云端
    return true;
  }
  function scheduleSync(immediate) {
    if (!shouldSyncToCloud()) return; // 隐私：本地优先 / 未登录 / 预览 → 不同步云端
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
    state = attachFarmCompat(buildDefaultState());
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

  // 技能农场（单地块：整块土地 = 1 个种植位；__main__ 单例 plotId）
  const MAIN_PLOT_ID = '__main__';
  function getFarmCrop(key) { return farmCropCatalog.find(c => c.key === key) || null; }
  function getFarmMainPlot() { return state.farmMainPlot || null; }

  function farmStageOf(p) {
    if (!p) return 0;
    const crop = getFarmCrop(p.cropKey);
    if (!crop || !crop.stages.length) return 0;
    return Math.min(Math.floor(p.progress / Math.max(1, crop.minutesPerStage)), crop.stages.length - 1);
  }

  function plantSkill(_ignoredPlotId, skillName, cropKey, goals = []) {
    if (!skillName || !getFarmCrop(cropKey)) return false;
    if (state.farmMainPlot) return false;            // 整块地已在种
    state.farmMainPlot = {
      plotId: MAIN_PLOT_ID, skillName, cropKey, progress: 0,
      sessions: [], goals: goals.map(g => ({ id: Utils.uid(), label: g.label, points: +g.points || 0, completed: false })),
      createdAt: new Date().toISOString(), matured: false,
    };
    save();
    return true;
  }

  function logSession(_ignoredPlotId, minutes, note) {
    const p = state.farmMainPlot; if (!p) return null;
    const m = Math.max(0, +minutes || 0);
    p.sessions.push({ id: Utils.uid(), date: new Date().toISOString(), minutes: m, note: String(note || '') });
    p.progress += m;
    const stage = farmStageOf(p);
    p.matured = stage >= (getFarmCrop(p.cropKey)?.stages.length || 0) - 1;
    p.stage = stage;
    save();
    return { progress: p.progress, stage, matured: p.matured };
  }

  function toggleGoal(_ignoredPlotId, goalId) {
    const p = state.farmMainPlot; if (!p) return null;
    const g = p.goals.find(x => x.id === goalId); if (!g) return null;
    g.completed = !g.completed;
    p.progress += g.completed ? g.points : -g.points;
    const stage = farmStageOf(p);
    p.matured = stage >= (getFarmCrop(p.cropKey)?.stages.length || 0) - 1;
    p.stage = stage;
    save();
    return { progress: p.progress, stage, matured: p.matured };
  }

  function addGoal(_ignoredPlotId, label, points) {
    const p = state.farmMainPlot; if (!p) return null;
    const g = { id: Utils.uid(), label: String(label || ''), points: Math.max(0, +points || 0), completed: false };
    p.goals.push(g);
    save();
    return g;
  }

  function harvestSkill(_ignoredPlotId) {
    const p = state.farmMainPlot; if (!p || !p.matured) return null;
    const crop = getFarmCrop(p.cropKey);
    const totalMinutes = p.sessions.reduce((a,b)=>a+(+b.minutes||0),0);
    const item = {
      id: 'fw-' + Utils.uid(), skillName: p.skillName, cropKey: p.cropKey,
      emoji: crop?.emoji || '🌱', name: p.skillName, source: '技能农场',
      progress: p.progress, createdAt: p.createdAt, harvestedAt: new Date().toISOString(),
      finalStage: farmStageOf(p), totalMinutes,
    };
    state.farmWarehouse.push(item);
    state.farmMainPlot = null;
    save();
    return item;
  }

  function removeSkill(_ignoredPlotId) {
    if (!state.farmMainPlot) return false;
    state.farmMainPlot = null;
    save();
    return true;
  }

  // AI 是否启用（仅看后台智能体配置；隐私授权由 aiReadAny / aiReadAllowed 单独判断）
  function aiEnabled(key) {
    return aiConfig.some(a => a.key === key && a.enabled);
  }
  // 某个数据源是否被授权给 AI 读取
  function aiReadAllowed(source) {
    const p = state.privacy || PRIVACY_DEFAULTS;
    return !!(p.aiRead && p.aiRead[source]);
  }
  // 是否至少开启了一个数据源（用于「功能是否可用」的总开关判断）
  function aiReadAny() {
    const p = state.privacy || PRIVACY_DEFAULTS;
    return !!(p.aiRead && Object.keys(p.aiRead).some(k => p.aiRead[k]));
  }
  // 返回当前已开启的数据源 id 列表（透传给后端，控制上下文里实际包含哪些数据）
  function aiReadSources() {
    const p = state.privacy || PRIVACY_DEFAULTS;
    if (!p.aiRead) return [];
    return Object.keys(p.aiRead).filter(k => p.aiRead[k]);
  }
  // 读取隐私开关（返回对象副本，避免外部误改；aiRead 深合并，兼容旧版 allowAiRead）
  function getPrivacy() {
    const p = state.privacy || PRIVACY_DEFAULTS;
    const merged = Object.assign({}, PRIVACY_DEFAULTS, p);
    merged.aiRead = Object.assign({}, PRIVACY_DEFAULTS.aiRead, (p.aiRead || {}));
    // 兼容旧版：曾全局授权（allowAiRead=true）但还没有细粒度 aiRead 的用户 → 默认全开
    if (p.allowAiRead === true && !p.aiRead) {
      AI_READ_SOURCES.forEach(s => { merged.aiRead[s.id] = true; });
    }
    return merged;
  }
  // 修改隐私开关并保存；localOnly 变 false（放开云端）时立即触发一次同步
  // 支持嵌套（如 { aiRead: { emotion: true } } 只改 emotion，不影响其它数据源）
  function setPrivacy(partial) {
    const p = state.privacy || (state.privacy = Object.assign({}, PRIVACY_DEFAULTS));
    const wasLocalOnly = p.localOnly; // 先记录旧值，再应用变更
    deepMerge(p, partial);
    save();
    if (typeof partial.localOnly === 'boolean' && !partial.localOnly && wasLocalOnly) {
      // 由「本地优先」切到「允许云端同步」：把本机数据上传一次
      scheduleSync(true);
    }
    return getPrivacy();
  }
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
    note:            'dialogue',  // 心灵树洞日记 → 本心对话座
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
    get tab2Entry() { return tab2Entry; },
    get treeholeEntry() { return treeholeEntry; },
    get farmCropCatalog() { return farmCropCatalog; },
    get farmPlotLayout() { return farmPlotLayout; },
    get farmLandConfig() { return farmLandConfig; },
    get farmLandList() { return farmLandList; },
    // 兼容旧多格子代码调用（单地块映射为长度 0 或 1 的数组）
    get farmPlots() { return state.farmMainPlot ? [state.farmMainPlot] : []; },
    get farmMainPlot() { return state.farmMainPlot || null; },
    get defaultRoomItemIds() { return defaultRoomItems.map(i => i.id); },

    isAuthed: () => (typeof Api !== 'undefined' && Api.isAuthed()),
    isPreview: () => (typeof Api !== 'undefined' && Api.isPreview()),
    aiEnabled,
    aiReadAllowed,
    aiReadAny,
    aiReadSources,
    AI_READ_SOURCES,
    getPrivacy,
    setPrivacy,
    shouldSyncToCloud,
    pickCategoryByType,

    getCatalog, getSeed,
    plantSkill, logSession, toggleGoal, addGoal, harvestSkill, removeSkill,
    getFarmCrop, getFarmMainPlot,
    // 兼容旧多格子代码：任何 plotId 都返回唯一地块或 null
    getFarmPlotByPlotId: (_pid) => state.farmMainPlot || null,
    farmStageOf,
    MAIN_PLOT_ID,
  };
})();
