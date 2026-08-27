const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');

// Supabase / PostgreSQL 连接（优先环境变量 DATABASE_URL）
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase')
    ? { rejectUnauthorized: false }
    : undefined,
});

const txStorage = new AsyncLocalStorage();

function getClient() {
  return txStorage.getStore() || pool;
}

function convertSql(sql) {
  const paramNames = [];
  // 先处理命名参数 @name
  let converted = sql.replace(/@(\w+)/g, (match, name) => {
    paramNames.push(name);
    return `$${paramNames.length}`;
  });
  // 再处理匿名参数 ?
  let n = paramNames.length;
  converted = converted.replace(/\?/g, () => `$${++n}`);
  return { sql: converted, paramNames };
}

function prepare(sqlRaw) {
  const { sql, paramNames } = convertSql(sqlRaw);

  function buildValues(args) {
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
      if (paramNames.length > 0) {
        return paramNames.map(name => args[0][name]);
      }
      return Object.values(args[0]);
    }
    return args;
  }

  return {
    run: async function (...args) {
      const values = buildValues(args);
      const client = getClient();
      const result = await client.query(sql, values);
      return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount };
    },
    get: async function (...args) {
      const values = buildValues(args);
      const client = getClient();
      const result = await client.query(sql, values);
      return result.rows[0] || null;
    },
    all: async function (...args) {
      const values = buildValues(args);
      const client = getClient();
      const result = await client.query(sql, values);
      return result.rows;
    },
  };
}

function transaction(fn) {
  return async function (...args) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await txStorage.run(client, async () => {
        await fn(...args);
      });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  };
}

// 兼容：直接查询
async function query(text, params) {
  const client = getClient();
  return client.query(text, params);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  must_change_pw INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  is_preview    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

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
  price            INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS default_room_layout (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL REFERENCES furniture_catalog(type),
  x          REAL NOT NULL,
  y          REAL NOT NULL,
  z          INTEGER NOT NULL DEFAULT 3,
  scale      REAL DEFAULT 1,
  flip       INTEGER DEFAULT 0,
  rot        REAL DEFAULT 0,
  tilt       REAL DEFAULT 0,
  action     TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shop_items (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  emoji      TEXT,
  name       TEXT NOT NULL,
  price      INTEGER NOT NULL,
  bonus      TEXT,
  desc       TEXT,
  unlocked   INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  icon       TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS seed_catalog (
  key        TEXT PRIMARY KEY,
  emoji      TEXT,
  name       TEXT NOT NULL,
  dir        TEXT,
  desc       TEXT,
  feed_on    TEXT,
  stages     TEXT,
  yield      TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_config (
  key            TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  provider       TEXT,
  base_url       TEXT,
  api_key        TEXT,
  model          TEXT,
  temperature    REAL DEFAULT 0.7,
  system_prompt  TEXT,
  enabled        INTEGER DEFAULT 0,
  updated_at     TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tab_backgrounds (
  tab_key    TEXT PRIMARY KEY,
  bg_path    TEXT,
  updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS default_care_options (
  id         TEXT PRIMARY KEY,
  emoji      TEXT NOT NULL,
  label      TEXT NOT NULL,
  mode       TEXT NOT NULL DEFAULT 'daily',
  reward     INTEGER NOT NULL DEFAULT 3,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_log (
  id         SERIAL PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_state (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

async function initSchema() {
  await pool.query(SCHEMA);

  // 迁移：补列（PostgreSQL 中不存在才添加）
  const migrations = [
    { table: 'furniture_catalog', col: 'price', sql: 'ALTER TABLE furniture_catalog ADD COLUMN IF NOT EXISTS price INTEGER NOT NULL DEFAULT 0' },
    { table: 'default_room_layout', col: 'rot', sql: 'ALTER TABLE default_room_layout ADD COLUMN IF NOT EXISTS rot REAL DEFAULT 0' },
    { table: 'default_room_layout', col: 'tilt', sql: 'ALTER TABLE default_room_layout ADD COLUMN IF NOT EXISTS tilt REAL DEFAULT 0' },
    { table: 'users', col: 'is_preview', sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_preview INTEGER NOT NULL DEFAULT 0' },
    { table: 'shop_items', col: 'icon', sql: 'ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT \'\'' },
  ];

  for (const m of migrations) {
    try {
      await pool.query(m.sql);
    } catch (e) {
      console.warn(`[db] 迁移 ${m.table}.${m.col} 失败：`, e.message);
    }
  }
}

module.exports = {
  pool,
  prepare,
  transaction,
  query,
  initSchema,
};
