const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('./config');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
-- 账号：普通玩家 + 管理员
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  must_change_pw INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

-- 登录会话
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 家具 / 物件目录（类型元数据）。unlocked_by_default 控制新用户初始是否解锁该类型
CREATE TABLE IF NOT EXISTS furniture_catalog (
  type             TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  category         TEXT,
  icon             TEXT,
  w                INTEGER DEFAULT 56,
  h                INTEGER DEFAULT 56,
  is_floor         INTEGER DEFAULT 0,
  action           TEXT,
  unlocked_by_default INTEGER DEFAULT 1,
  price            INTEGER DEFAULT 0   -- 购置该家具所需的予己金币（0 表示免费）
);

-- 默认房间初始布局（管理员拖拽摆放的结果，作为每个新用户的初始房间）
CREATE TABLE IF NOT EXISTS default_room_layout (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  x          REAL NOT NULL,   -- 左% 0-100
  y          REAL NOT NULL,   -- 离地% 0-100（越大越靠上）
  z          INTEGER NOT NULL DEFAULT 3,  -- 层次 1-6，越大越靠前
  scale      REAL DEFAULT 1,
  flip       INTEGER DEFAULT 0,
  action     TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (type) REFERENCES furniture_catalog(type)
);

-- 商店商品（实体 / 精神）
CREATE TABLE IF NOT EXISTS shop_items (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,   -- 'physical' | 'spirit'
  emoji      TEXT,
  name       TEXT NOT NULL,
  price      INTEGER NOT NULL,
  bonus      TEXT,            -- JSON {happiness,health}
  desc       TEXT,
  unlocked   INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  icon       TEXT DEFAULT ''
);

-- 花园种子目录
CREATE TABLE IF NOT EXISTS seed_catalog (
  key        TEXT PRIMARY KEY,
  emoji      TEXT,
  name       TEXT NOT NULL,
  dir        TEXT,
  desc       TEXT,
  feed_on    TEXT,            -- JSON array
  stages     TEXT,            -- JSON array
  yield      TEXT,            -- JSON {emoji,name,bonus}
  sort_order INTEGER DEFAULT 0
);

-- AI 智能体 / 接口配置（多智能体）
CREATE TABLE IF NOT EXISTS ai_config (
  key            TEXT PRIMARY KEY,    -- 'letter' | 'self_manual' | 'insight'
  name           TEXT NOT NULL,
  provider       TEXT,               -- 'openai' | 'custom'
  base_url       TEXT,
  api_key        TEXT,
  model          TEXT,
  temperature    REAL DEFAULT 0.7,
  system_prompt  TEXT,
  enabled        INTEGER DEFAULT 0,
  updated_at     TEXT
);

-- 站点全局设置（每日金币上限等）
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT
);

-- 4 个 Tab 页面背景图（管理员可上传自定义）
CREATE TABLE IF NOT EXISTS tab_backgrounds (
  tab_key    TEXT PRIMARY KEY,    -- 'tab1' | 'tab2' | 'tab3' | 'tab4'
  bg_path    TEXT,                 -- 相对路径，如 assets/tab-bg/tab1-1700000000000.png
  updated_at TEXT
);

-- 新用户初始「每日自我照顾」选项（管理员配置 → 新用户创建时作为 careOptions 模板）
CREATE TABLE IF NOT EXISTS default_care_options (
  id         TEXT PRIMARY KEY,    -- 英文唯一 id，如 water、sleep
  emoji      TEXT NOT NULL,        -- 图标 emoji，如 💧
  label      TEXT NOT NULL,        -- 中文展示名，如 喝水
  mode       TEXT NOT NULL DEFAULT 'daily',  -- 'daily' 每日重置 | 'recurring' 可持续完成
  reward     INTEGER NOT NULL DEFAULT 3,     -- 完成一次给的金币
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 管理员操作日志
CREATE TABLE IF NOT EXISTS admin_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES users(id)
);

-- 每个玩家的游戏状态（多用户核心，后续接入前端时使用）
CREATE TABLE IF NOT EXISTS user_state (
  user_id    INTEGER PRIMARY KEY,
  data       TEXT NOT NULL,   -- JSON 全量状态
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`;

db.exec(SCHEMA);

// 迁移：为已存在的数据库补列（furniture_catalog.price）
try {
  const cols = db.pragma('table_info(furniture_catalog)').map(c => c.name);
  if (!cols.includes('price')) {
    db.exec('ALTER TABLE furniture_catalog ADD COLUMN price INTEGER NOT NULL DEFAULT 0');
    console.log('[db] 已为 furniture_catalog 补列 price');
  }
} catch (e) {
  console.warn('[db] 家具价格列迁移失败：', e.message);
}

// 迁移：默认房间布局增加 rot / tilt（3D 转向 / 2D 倾斜），列已存在则忽略
try {
  const cols = db.pragma('table_info(default_room_layout)').map(c => c.name);
  if (!cols.includes('rot')) {
    db.exec('ALTER TABLE default_room_layout ADD COLUMN rot REAL DEFAULT 0');
    console.log('[db] 已为 default_room_layout 补列 rot');
  }
  if (!cols.includes('tilt')) {
    db.exec('ALTER TABLE default_room_layout ADD COLUMN tilt REAL DEFAULT 0');
    console.log('[db] 已为 default_room_layout 补列 tilt');
  }
} catch (e) {
  console.warn('[db] 房间布局 rot/tilt 列迁移失败：', e.message);
}

// 迁移：users 表增加 is_preview（预览账号标记：不写入存档、实时反映后端默认布局）
try {
  const cols = db.pragma('table_info(users)').map(c => c.name);
  if (!cols.includes('is_preview')) {
    db.exec('ALTER TABLE users ADD COLUMN is_preview INTEGER NOT NULL DEFAULT 0');
    console.log('[db] 已为 users 补列 is_preview');
  }
} catch (e) {
  console.warn('[db] users.is_preview 列迁移失败：', e.message);
}

// 迁移：shop_items 增加 icon 列（图片路径）
try {
  const cols = db.pragma('table_info(shop_items)').map(c => c.name);
  if (!cols.includes('icon')) {
    db.exec('ALTER TABLE shop_items ADD COLUMN icon TEXT DEFAULT \'\'');
    console.log('[db] 已为 shop_items 补列 icon');
  }
} catch (e) {
  console.warn('[db] shop_items.icon 列迁移失败：', e.message);
}

module.exports = db;
