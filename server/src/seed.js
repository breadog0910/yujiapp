const db = require('./db');
const { hashPassword } = require('./auth');
const { ADMIN_DEFAULT_PW, DEFAULT_DAILY_COIN_CAP } = require('./config');

const insFurniture = db.prepare(
  `INSERT INTO furniture_catalog (type,name,category,icon,w,h,is_floor,action,unlocked_by_default,price)
   VALUES (@type,@name,@category,@icon,@w,@h,@is_floor,@action,@unlocked_by_default,@price)
   ON CONFLICT (type) DO NOTHING`
);

const insLayout = db.prepare(
  `INSERT INTO default_room_layout (id,type,x,y,z,scale,flip,rot,tilt,action,sort_order)
   VALUES (@id,@type,@x,@y,@z,@scale,@flip,@rot,@tilt,@action,@sort_order)
   ON CONFLICT (id) DO NOTHING`
);

const insShop = db.prepare(
  `INSERT INTO shop_items (id,kind,emoji,name,price,bonus,desc,unlocked,sort_order)
   VALUES (@id,@kind,@emoji,@name,@price,@bonus,@desc,@unlocked,@sort_order)
   ON CONFLICT (id) DO NOTHING`
);

const insSeed = db.prepare(
  `INSERT INTO seed_catalog (key,emoji,name,dir,desc,feed_on,stages,yield,sort_order)
   VALUES (@key,@emoji,@name,@dir,@desc,@feed_on,@stages,@yield,@sort_order)
   ON CONFLICT (key) DO NOTHING`
);

const insAi = db.prepare(
  `INSERT INTO ai_config (key,name,provider,base_url,api_key,model,temperature,system_prompt,enabled,updated_at)
   VALUES (@key,@name,@provider,@base_url,@api_key,@model,@temperature,@system_prompt,@enabled,@updated_at)
   ON CONFLICT (key) DO NOTHING`
);

const insSetting = db.prepare(
  `INSERT INTO site_settings (key,value,updated_at) VALUES (?,?,?)
   ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`
);

const insTabBg = db.prepare(
  `INSERT INTO tab_backgrounds (tab_key,bg_path,updated_at) VALUES (?,?,?)
   ON CONFLICT (tab_key) DO UPDATE SET bg_path=EXCLUDED.bg_path, updated_at=EXCLUDED.updated_at`
);

const insDefCare = db.prepare(
  `INSERT INTO default_care_options (id,emoji,label,mode,reward,sort_order)
   VALUES (@id,@emoji,@label,@mode,@reward,@sort_order)
   ON CONFLICT (id) DO NOTHING`
);

const TAB_BG = [
  { tab_key: 'tab1', bg_path: 'assets/tab1beijing.png' },
  { tab_key: 'tab2', bg_path: 'assets/tab2-forest.png' },
  { tab_key: 'tab3', bg_path: 'assets/tab3-garden-bg.jpg' },
  { tab_key: 'tab4', bg_path: 'assets/tab4-stars.png' },
];

const DEF_CARE = [
  { id: 'water',     emoji: '💧', label: '喝水',     mode: 'recurring', reward: 3 },
  { id: 'breath',    emoji: '🌬️', label: '深呼吸',   mode: 'daily',     reward: 3 },
  { id: 'walk',      emoji: '🚶', label: '散步',     mode: 'daily',     reward: 3 },
  { id: 'space',     emoji: '🫧', label: '放空',     mode: 'daily',     reward: 3 },
  { id: 'sleep',     emoji: '🛌', label: '好好睡觉', mode: 'daily',     reward: 3 },
  { id: 'encourage', emoji: '💪', label: '自我鼓励', mode: 'daily',     reward: 3 },
];

const FURNITURE = [
  { type: 'bed',      name: '小床',   category: '家具', icon: 'assets/pixel/bed.png',      w: 64, h: 52, is_floor: 0, action: null, price: 40, unlockedByDefault: 1 },
  { type: 'bed-big',  name: '大床',   category: '家具', icon: 'assets/pixel/bed-big.png',  w: 96, h: 64, is_floor: 0, action: null, price: 75, unlockedByDefault: 1 },
  { type: 'sofa',     name: '沙发',   category: '家具', icon: 'assets/pixel/sofa.png',     w: 60, h: 44, is_floor: 0, action: null, price: 35, unlockedByDefault: 1 },
  { type: 'chair',    name: '小椅',   category: '家具', icon: 'assets/pixel/chair.png',    w: 36, h: 52, is_floor: 0, action: null, price: 12, unlockedByDefault: 1 },
  { type: 'table',    name: '小木桌', category: '家具', icon: 'assets/pixel/table.png',    w: 48, h: 40, is_floor: 0, action: null, price: 15, unlockedByDefault: 1 },
  { type: 'shelf',    name: '置物架', category: '家具', icon: 'assets/pixel/shelf.png',    w: 56, h: 56, is_floor: 0, action: 'shelf', price: 20, unlockedByDefault: 1 },
  { type: 'window',   name: '小窗',   category: '家具', icon: 'assets/pixel/window.png',   w: 44, h: 48, is_floor: 0, action: null, price: 18, unlockedByDefault: 1 },
  { type: 'lamp',     name: '台灯',   category: '灯光', icon: 'assets/pixel/lamp.png',     w: 36, h: 56, is_floor: 0, action: null, price: 12, unlockedByDefault: 1 },
  { type: 'candle',   name: '烛台',   category: '灯光', icon: 'assets/pixel/candle.png',   w: 28, h: 44, is_floor: 0, action: null, price: 14, unlockedByDefault: 0 },
  { type: 'plant',    name: '盆栽',   category: '绿植', icon: 'assets/pixel/plant.png',    w: 44, h: 60, is_floor: 0, action: null, price: 16, unlockedByDefault: 1 },
  { type: 'flowers',  name: '花束',   category: '绿植', icon: 'assets/pixel/flowers.png',  w: 36, h: 52, is_floor: 0, action: null, price: 18, unlockedByDefault: 0 },
  { type: 'painting', name: '画框',   category: '装饰', icon: 'assets/pixel/painting.png', w: 48, h: 40, is_floor: 0, action: null, price: 22, unlockedByDefault: 1 },
  { type: 'clock',    name: '小钟',   category: '装饰', icon: 'assets/pixel/clock.png',    w: 36, h: 36, is_floor: 0, action: null, price: 20, unlockedByDefault: 1 },
  { type: 'basket',   name: '小篮',   category: '装饰', icon: 'assets/pixel/basket.png',   w: 44, h: 36, is_floor: 0, action: null, price: 10, unlockedByDefault: 0 },
  { type: 'rug',      name: '小地毯', category: '装饰', icon: 'assets/pixel/rug.png',      w: 80, h: 40, is_floor: 1, action: null, price: 25, unlockedByDefault: 1 },
  { type: 'teddy',    name: '玩偶',   category: '陪伴', icon: 'assets/pixel/teddy.png',    w: 44, h: 48, is_floor: 0, action: null, price: 15, unlockedByDefault: 1 },
  { type: 'cat',      name: '小猫',   category: '陪伴', icon: 'assets/pixel/cat.png',      w: 48, h: 40, is_floor: 0, action: null, price: 30, unlockedByDefault: 1 },
  { type: 'books',    name: '书堆',   category: '陪伴', icon: 'assets/pixel/books.png',    w: 44, h: 36, is_floor: 0, action: null, price: 12, unlockedByDefault: 1 },
  { type: 'radio',    name: '收音机', category: '陪伴', icon: 'assets/pixel/radio.png',    w: 44, h: 40, is_floor: 0, action: null, price: 24, unlockedByDefault: 0 },
  { type: 'tea',      name: '茶杯',   category: '陪伴', icon: 'assets/pixel/tea.png',      w: 32, h: 36, is_floor: 0, action: null, price: 8,  unlockedByDefault: 0 },
  { type: 'letter',   name: '小我的信', category: '陪伴', icon: 'assets/pixel/letter.png', w: 40, h: 32, is_floor: 0, action: 'letter', price: 12, unlockedByDefault: 1 },
  { type: 'piggy',    name: '存钱罐', category: '功能', icon: 'assets/pixel/piggy.png',    w: 40, h: 44, is_floor: 0, action: 'shop', price: 28, unlockedByDefault: 1 },
];

const LAYOUT = [
  { id: 'ri-window',   type: 'window',   x: 8,  y: 34, z: 2, scale: 1,    flip: 0, rot: 0, tilt: 0, action: null },
  { id: 'ri-painting', type: 'painting', x: 30, y: 36, z: 2, scale: 0.9,  flip: 0, rot: 0, tilt: 0, action: null },
  { id: 'ri-clock',    type: 'clock',    x: 60, y: 38, z: 2, scale: 0.85, flip: 0, rot: 0, tilt: 0, action: null },
  { id: 'ri-lamp',     type: 'lamp',     x: 84, y: 30, z: 3, scale: 1,    flip: 0, rot: 0, tilt: 0, action: null },
  { id: 'ri-plant',    type: 'plant',    x: 92, y: 16, z: 3, scale: 1,    flip: 0, rot: 0, tilt: 0, action: null },
  { id: 'ri-shelf',    type: 'shelf',    x: 10, y: 18, z: 4, scale: 1,    flip: 0, rot: 0, tilt: 0, action: 'shelf' },
  { id: 'ri-books',    type: 'books',    x: 18, y: 10, z: 5, scale: 1,    flip: 0, rot: 0, tilt: 0, action: null },
  { id: 'ri-rug',      type: 'rug',      x: 40, y: 8,  z: 4, scale: 1.4,  flip: 0, rot: 0, tilt: 0, action: null },
  { id: 'ri-cat',      type: 'cat',      x: 56, y: 12, z: 5, scale: 1,    flip: 0, rot: 0, tilt: 0, action: null },
  { id: 'ri-teddy',    type: 'teddy',    x: 70, y: 14, z: 5, scale: 1,    flip: 0, rot: 0, tilt: 0, action: null },
  { id: 'ri-piggy',    type: 'piggy',    x: 88, y: 10, z: 6, scale: 1,    flip: 0, rot: 0, tilt: 0, action: 'shop' },
  { id: 'ri-letter',   type: 'letter',   x: 48, y: 44, z: 6, scale: 0.95, flip: 0, rot: 0, tilt: 0, action: 'letter' },
];

const SHOP = [
  { id: 'teddy',  kind: 'physical', emoji: '🧸', name: '小熊玩偶', price: 15, bonus: { happiness: 2, health: 1 },  desc: '', unlocked: 1 },
  { id: 'cake',   kind: 'physical', emoji: '🎂', name: '小蛋糕',   price: 25, bonus: { happiness: 3, health: 2 },  desc: '', unlocked: 1 },
  { id: 'lamp',   kind: 'physical', emoji: '💡', name: '小台灯',   price: 12, bonus: { happiness: 1, health: 1 },  desc: '', unlocked: 1 },
  { id: 'carpet', kind: 'physical', emoji: '🟫', name: '小地毯',   price: 20, bonus: { happiness: 2, health: 1 },  desc: '', unlocked: 1 },
  { id: 'cushion',kind: 'physical', emoji: '🛋️', name: '抱枕',     price: 18, bonus: { happiness: 2 },            desc: '', unlocked: 1 },
  { id: 'toy',    kind: 'physical', emoji: '🪀', name: '像素玩具', price: 10, bonus: { happiness: 1 },            desc: '', unlocked: 1 },
  { id: 'movie',  kind: 'spirit',   emoji: '🎬', name: '看一场电影',   price: 30, bonus: { happiness: 5 },  desc: '房间灯光调暗，小我坐下观看', unlocked: 1 },
  { id: 'feast',  kind: 'spirit',   emoji: '🍰', name: '享用美食大餐', price: 40, bonus: { happiness: 8 },  desc: '小我享用美食动画',         unlocked: 1 },
  { id: 'travel', kind: 'spirit',   emoji: '🏕️', name: '短途外出冒险', price: 50, bonus: { happiness: 6 },  desc: '短暂切换简易户外像素片段', unlocked: 1 },
  { id: 'birth',  kind: 'spirit',   emoji: '🎉', name: '生日时刻',     price: 80, bonus: { happiness: 10 }, desc: '弹出蛋糕动画，小我暖心独白', unlocked: 1 },
];

const SEEDS = [
  { key: 'selfcare', emoji: '🌿', name: '练习好好休息', dir: '自我照顾', desc: '在「此刻」完成自我照顾，会为它输送养料', feed_on: ['selfcare','habit'], stages: ['seed-selfcare-s1','seed-selfcare-s2','seed-selfcare-s3','seed-selfcare-s4'], yield: { emoji: '🪴', name: '治愈盆栽', bonus: { happiness: 2, health: 2 } } },
  { key: 'emotion',  emoji: '🌱', name: '练习情绪觉察', dir: '情绪能力', desc: '在「遇见」记录一次情绪，会为它输送养料', feed_on: ['emotion'], stages: ['seed-emotion-s1','seed-emotion-s2','seed-emotion-s3','seed-emotion-s4'], yield: { emoji: '🌸', name: '觉察之花', bonus: { happiness: 3 } } },
  { key: 'action',   emoji: '🌵', name: '练习立刻行动', dir: '行动力',   desc: '完成一件小事并记下，会为它输送养料', feed_on: ['action','selfcare'], stages: ['seed-action-s1','seed-action-s2','seed-action-s3','seed-action-s4'], yield: { emoji: '🌼', name: '行动小花', bonus: { happiness: 2, health: 1 } } },
  { key: 'interest', emoji: '🌻', name: '探索一个爱好', dir: '兴趣探索', desc: '尝试新事物、记录新发现，会为它输送养料', feed_on: ['interest','express'], stages: ['seed-interest-s1','seed-interest-s2','seed-interest-s3','seed-interest-s4'], yield: { emoji: '🎨', name: '灵感之花', bonus: { happiness: 3 } } },
  { key: 'express',  emoji: '💐', name: '练习主动表达', dir: '表达能力', desc: '写下自我鼓励、表达真实想法，会为它输送养料', feed_on: ['express','emotion'], stages: ['seed-express-s1','seed-express-s2','seed-express-s3','seed-express-s4'], yield: { emoji: '💐', name: '勇气花束', bonus: { happiness: 2 } } },
  { key: 'habit',    emoji: '🌾', name: '养成小习惯',   dir: '生活习惯', desc: '坚持一次好习惯（喝水/睡觉/散步…），会为它输送养料', feed_on: ['habit','selfcare'], stages: ['seed-habit-s1','seed-habit-s2','seed-habit-s3','seed-habit-s4'], yield: { emoji: '🌾', name: '丰收麦穗', bonus: { health: 3 } } },
];

const AI = [
  {
    key: 'letter', name: '小我信件', provider: 'openai', base_url: 'https://api.openai.com/v1',
    api_key: '', model: 'gpt-4o-mini', temperature: 0.8,
    system_prompt: '你是用户内在“小我”的温柔观察者，不是心理医生、老师或监督者。用观察式、不评判、不诊断的口吻，给用户写一封简短温暖的信件，引导ta看见并接纳自己。禁止输出“你应该”“你必须”等压迫式指令，禁止诊断心理疾病。',
    enabled: 0,
  },
  {
    key: 'self_manual', name: '自我说明书', provider: 'openai', base_url: 'https://api.openai.com/v1',
    api_key: '', model: 'gpt-4o-mini', temperature: 0.5,
    system_prompt: '你是温柔的自我观察者。基于用户的全部记录，持续迭代更新《自我说明书》五章（我是怎样的人 / 我的优势 / 我的雷区 / 怎样好好对待我 / 适合我的成长方式）。不下死标签、不贴人格定义，用观察式语气输出。',
    enabled: 0,
  },
  {
    key: 'insight', name: '自我洞察', provider: 'openai', base_url: 'https://api.openai.com/v1',
    api_key: '', model: 'gpt-4o-mini', temperature: 0.7,
    system_prompt: '你是温柔的自我观察者。基于用户的情绪与行为记录，提炼洞察、提出自我提问，引导觉察。严禁评判、诊断、制造焦虑。',
    enabled: 0,
  },
  {
    key: 'furni_story', name: '家具经历', provider: 'openai', base_url: 'https://api.openai.com/v1',
    api_key: '', model: 'gpt-4o-mini', temperature: 0.9,
    system_prompt: '你是用户的“小我”——住在用户房间里、默默陪伴ta的像素小人。语气温暖克制，像朋友写信，不要说教、不要诊断、不要用“你应该/必须”。你只输出一段 80–160 字的中文小故事，不使用列表、不加标题。',
    enabled: 0,
  },
];

async function seed() {
  const run = db.transaction(async () => {
    for (const f of FURNITURE) {
      await insFurniture.run({
        type: f.type, name: f.name, category: f.category, icon: f.icon,
        w: f.w, h: f.h, is_floor: f.is_floor ? 1 : 0, action: f.action,
        unlocked_by_default: f.unlockedByDefault ? 1 : 0, price: f.price || 0,
      });
    }
    // 为已存在（ON CONFLICT DO NOTHING 未覆盖）的行回填默认价格
    const updFurnPrice = db.prepare('UPDATE furniture_catalog SET price = ? WHERE type = ? AND (price IS NULL OR price = 0)');
    for (const f of FURNITURE) await updFurnPrice.run(f.price || 0, f.type);

    for (let i = 0; i < LAYOUT.length; i++) {
      const it = LAYOUT[i];
      await insLayout.run({
        id: it.id, type: it.type, x: it.x, y: it.y, z: it.z, scale: it.scale, flip: it.flip,
        rot: it.rot || 0, tilt: it.tilt || 0, action: it.action, sort_order: i,
      });
    }

    for (let i = 0; i < SHOP.length; i++) {
      const it = SHOP[i];
      await insShop.run({
        id: it.id, kind: it.kind, emoji: it.emoji, name: it.name, price: it.price,
        bonus: JSON.stringify(it.bonus), desc: it.desc, unlocked: it.unlocked, sort_order: i,
      });
    }

    for (let i = 0; i < SEEDS.length; i++) {
      const it = SEEDS[i];
      await insSeed.run({
        key: it.key, emoji: it.emoji, name: it.name, dir: it.dir, desc: it.desc,
        feed_on: JSON.stringify(it.feed_on), stages: JSON.stringify(it.stages), yield: JSON.stringify(it.yield), sort_order: i,
      });
    }

    const now = new Date().toISOString();
    for (const a of AI) {
      await insAi.run({
        key: a.key, name: a.name, provider: a.provider, base_url: a.base_url, api_key: a.api_key,
        model: a.model, temperature: a.temperature, system_prompt: a.system_prompt, enabled: a.enabled, updated_at: now,
      });
    }

    await insSetting.run('dailyCoinCap', String(DEFAULT_DAILY_COIN_CAP), now);
    await insSetting.run('appName', '予己', now);

    for (const t of TAB_BG) {
      await insTabBg.run(t.tab_key, t.bg_path, now);
    }

    for (let i = 0; i < DEF_CARE.length; i++) {
      const it = DEF_CARE[i];
      await insDefCare.run({
        id: it.id, emoji: it.emoji, label: it.label, mode: it.mode, reward: it.reward, sort_order: i,
      });
    }

    // 种子管理员
    const exists = await db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    if (!exists) {
      await db.prepare('INSERT INTO users (username, password_hash, role, must_change_pw, created_at) VALUES (?, ?, ?, ?, ?)')
        .run('admin', hashPassword(ADMIN_DEFAULT_PW), 'admin', 1, now);
      console.log(`[seed] 已创建管理员账号 admin / ${ADMIN_DEFAULT_PW}（首次登录需修改密码）`);
    }
  });

  await run();
  console.log('[seed] 配置种子写入完成。');
}

if (require.main === module) {
  const { initSchema } = require('./db');
  (async () => {
    await initSchema();
    await seed();
    process.exit(0);
  })();
}

module.exports = { seed };
