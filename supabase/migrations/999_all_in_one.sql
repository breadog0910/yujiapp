-- ============================================================
-- 《予己》Supabase 全量迁移脚本（整合 001-007）
-- ============================================================
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴全部 → Run
-- 幂等说明：所有 CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS +
--          ON CONFLICT DO NOTHING / DO UPDATE，重复执行不会报错。
-- 执行顺序：已按依赖排好（先 schema → 种子 → 农场 → 土地图层 → 约束）
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 扩展用户表 + 触发器（与 Supabase Auth 同步）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  must_change_pw BOOLEAN NOT NULL DEFAULT false,
  is_preview    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.users IS '扩展 Supabase Auth 的用户信息';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username, role, must_change_pw, is_preview)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', new.email, new.id::text),
    COALESCE(new.raw_user_meta_data->>'role', 'user'),
    false,
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 已有 auth 用户的回填
INSERT INTO public.users (id, username, role, must_change_pw, is_preview)
SELECT id, COALESCE(raw_user_meta_data->>'username', email, id::text), 'user', false, false
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. 业务表（全部启用 RLS）
-- ============================================================

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
  "desc"     TEXT,
  unlocked   INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  icon       TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS seed_catalog (
  key        TEXT PRIMARY KEY,
  emoji      TEXT,
  name       TEXT NOT NULL,
  dir        TEXT,
  "desc"     TEXT,
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
  updated_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tab_backgrounds (
  tab_key    TEXT PRIMARY KEY,
  bg_path    TEXT,
  updated_at TIMESTAMPTZ
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
  admin_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_state (
  user_id    UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. 技能农场表（003 新增）
-- ============================================================

CREATE TABLE IF NOT EXISTS farm_crop_catalog (
  key               TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  emoji             TEXT,
  stages            TEXT NOT NULL,
  minutes_per_stage INTEGER NOT NULL DEFAULT 600,
  sort_order        INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS farm_plot_layout (
  id          TEXT PRIMARY KEY,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  z           INTEGER DEFAULT 3,
  scale       REAL DEFAULT 1,
  sort_order  INTEGER DEFAULT 0
);

-- 土地图层配置（004 新增，006 加 bg_threshold，007 加 crop_key/sort_order 支持多地块）
CREATE TABLE IF NOT EXISTS farm_land_config (
  id          TEXT PRIMARY KEY,
  image       TEXT NOT NULL,
  x           REAL NOT NULL DEFAULT 50,
  y           REAL NOT NULL DEFAULT 50,
  z           INTEGER NOT NULL DEFAULT 2,
  scale       REAL NOT NULL DEFAULT 1,
  width_pct   REAL NOT NULL DEFAULT 80,
  height_pct  REAL NOT NULL DEFAULT 65,
  bg_threshold INTEGER NOT NULL DEFAULT 30,
  crop_key    TEXT DEFAULT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- 兼容列：DO $$ 幂等（006 加 bg_threshold，007 加 crop_key/sort_order；兼容旧库升级）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='farm_land_config' AND column_name='bg_threshold') THEN
    ALTER TABLE farm_land_config ADD COLUMN bg_threshold INTEGER NOT NULL DEFAULT 30;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='farm_land_config' AND column_name='crop_key') THEN
    ALTER TABLE farm_land_config ADD COLUMN crop_key TEXT DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='farm_land_config' AND column_name='sort_order') THEN
    ALTER TABLE farm_land_config ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ============================================================
-- 4. 启用 RLS
-- ============================================================

ALTER TABLE furniture_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE default_room_layout ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE seed_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_backgrounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE default_care_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_crop_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_plot_layout  ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_land_config  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. 辅助函数
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
  -- 服务端 Pool 连接（postgres / pooler 角色）没有 auth.uid，
  -- 但 RLS 策略需要放行后端写入；前端 anon 用户 current_user 不是 postgres，仍受上面规则限制。
  OR current_user LIKE 'postgres%';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. RLS 策略（全部 DROP IF EXISTS + CREATE，完全幂等）
-- ============================================================

-- furniture_catalog
DROP POLICY IF EXISTS "fc_read_all" ON furniture_catalog;
CREATE POLICY "fc_read_all" ON furniture_catalog FOR SELECT USING (true);
DROP POLICY IF EXISTS "fc_admin_write" ON furniture_catalog;
CREATE POLICY "fc_admin_write" ON furniture_catalog FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- default_room_layout
DROP POLICY IF EXISTS "rl_read_all" ON default_room_layout;
CREATE POLICY "rl_read_all" ON default_room_layout FOR SELECT USING (true);
DROP POLICY IF EXISTS "rl_admin_write" ON default_room_layout;
CREATE POLICY "rl_admin_write" ON default_room_layout FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- shop_items
DROP POLICY IF EXISTS "si_read_all" ON shop_items;
CREATE POLICY "si_read_all" ON shop_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "si_admin_write" ON shop_items;
CREATE POLICY "si_admin_write" ON shop_items FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- seed_catalog
DROP POLICY IF EXISTS "sc_read_all" ON seed_catalog;
CREATE POLICY "sc_read_all" ON seed_catalog FOR SELECT USING (true);
DROP POLICY IF EXISTS "sc_admin_write" ON seed_catalog;
CREATE POLICY "sc_admin_write" ON seed_catalog FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ai_config（前端不可访问，仅 admin 可读写，Edge Functions 用 service_role）
DROP POLICY IF EXISTS "ai_admin_select" ON ai_config;
CREATE POLICY "ai_admin_select" ON ai_config FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS "ai_admin_write" ON ai_config;
CREATE POLICY "ai_admin_write" ON ai_config FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- site_settings
DROP POLICY IF EXISTS "ss_read_all" ON site_settings;
CREATE POLICY "ss_read_all" ON site_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "ss_admin_write" ON site_settings;
CREATE POLICY "ss_admin_write" ON site_settings FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- tab_backgrounds
DROP POLICY IF EXISTS "tb_read_all" ON tab_backgrounds;
CREATE POLICY "tb_read_all" ON tab_backgrounds FOR SELECT USING (true);
DROP POLICY IF EXISTS "tb_admin_write" ON tab_backgrounds;
CREATE POLICY "tb_admin_write" ON tab_backgrounds FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- default_care_options
DROP POLICY IF EXISTS "dc_read_all" ON default_care_options;
CREATE POLICY "dc_read_all" ON default_care_options FOR SELECT USING (true);
DROP POLICY IF EXISTS "dc_admin_write" ON default_care_options;
CREATE POLICY "dc_admin_write" ON default_care_options FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- admin_log
DROP POLICY IF EXISTS "al_admin_all" ON admin_log;
CREATE POLICY "al_admin_all" ON admin_log FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- user_state
DROP POLICY IF EXISTS "us_owner_select" ON user_state;
CREATE POLICY "us_owner_select" ON user_state FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "us_owner_insert" ON user_state;
CREATE POLICY "us_owner_insert" ON user_state FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "us_owner_update" ON user_state;
CREATE POLICY "us_owner_update" ON user_state FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "us_owner_delete" ON user_state;
CREATE POLICY "us_owner_delete" ON user_state FOR DELETE USING (user_id = auth.uid());

-- public.users
DROP POLICY IF EXISTS "u_self_select" ON public.users;
CREATE POLICY "u_self_select" ON public.users FOR SELECT USING (id = auth.uid());
DROP POLICY IF EXISTS "u_admin_all" ON public.users;
CREATE POLICY "u_admin_all" ON public.users FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 技能农场 RLS
DROP POLICY IF EXISTS "fcc_read_all" ON farm_crop_catalog;
CREATE POLICY "fcc_read_all" ON farm_crop_catalog FOR SELECT USING (true);
DROP POLICY IF EXISTS "fcc_admin_wr" ON farm_crop_catalog;
CREATE POLICY "fcc_admin_wr" ON farm_crop_catalog FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "fpl_read_all" ON farm_plot_layout;
CREATE POLICY "fpl_read_all" ON farm_plot_layout FOR SELECT USING (true);
DROP POLICY IF EXISTS "fpl_admin_wr" ON farm_plot_layout;
CREATE POLICY "fpl_admin_wr" ON farm_plot_layout FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "flc_read_all" ON farm_land_config;
CREATE POLICY "flc_read_all" ON farm_land_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "flc_admin_wr" ON farm_land_config;
CREATE POLICY "flc_admin_wr" ON farm_land_config FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- 7. FK 约束（005：ON DELETE CASCADE，避免后台删家具被 FK 拦截）
-- ============================================================

ALTER TABLE default_room_layout
  DROP CONSTRAINT IF EXISTS default_room_layout_type_fkey,
  ADD CONSTRAINT default_room_layout_type_fkey
    FOREIGN KEY (type) REFERENCES furniture_catalog(type)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 8. Storage 桶（公开读取，认证用户可上传；含 farm-images）
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('furniture-images', 'furniture-images', true),
  ('shop-images',      'shop-images',      true),
  ('tab-backgrounds',  'tab-backgrounds',  true),
  ('farm-images',      'farm-images',      true)
ON CONFLICT (id) DO NOTHING;

-- 扩展 Storage 策略（含 farm-images bucket 白名单）
DROP POLICY IF EXISTS storage_public_read ON storage.objects;
CREATE POLICY storage_public_read ON storage.objects FOR SELECT
  USING (bucket_id IN ('furniture-images','shop-images','tab-backgrounds','farm-images'));

DROP POLICY IF EXISTS storage_auth_upload ON storage.objects;
CREATE POLICY storage_auth_upload ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id IN ('furniture-images','shop-images','tab-backgrounds','farm-images')
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS storage_auth_update ON storage.objects;
CREATE POLICY storage_auth_update ON storage.objects FOR UPDATE
  USING (
    bucket_id IN ('furniture-images','shop-images','tab-backgrounds','farm-images')
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS storage_auth_delete ON storage.objects;
CREATE POLICY storage_auth_delete ON storage.objects FOR DELETE
  USING (
    bucket_id IN ('furniture-images','shop-images','tab-backgrounds','farm-images')
    AND auth.role() = 'authenticated'
  );

-- ============================================================
-- 9. 种子数据（全部 ON CONFLICT DO NOTHING / DO UPDATE SET）
-- ============================================================

-- 9.1 家具目录
INSERT INTO furniture_catalog (type, name, category, icon, w, h, is_floor, action, unlocked_by_default, price)
VALUES
  ('bed',       '小床',     '家具', 'assets/pixel/bed.png',                          64, 52, 0, NULL,    1, 40),
  ('bed-big',   '大床',     '家具', 'assets/pixel/bed-big.png',                      96, 64, 0, NULL,    1, 75),
  ('sofa',      '沙发',     '家具', 'assets/pixel/sofa.png',                         60, 44, 0, NULL,    1, 35),
  ('chair',     '小椅',     '家具', 'assets/pixel/chair.png',                        36, 52, 0, NULL,    1, 12),
  ('table',     '小木桌',   '家具', 'assets/pixel/table.png',                        48, 40, 0, NULL,    1, 15),
  ('shelf',     '置物架',   '家具', 'assets/pixel/shelf.png',                        56, 56, 0, 'shelf', 1, 20),
  ('window',    '小窗',     '家具', 'assets/pixel/window.png',                       44, 48, 0, NULL,    1, 18),
  ('lamp',      '台灯',     '灯光', 'assets/pixel/lamp.png',                         36, 56, 0, NULL,    1, 12),
  ('candle',    '烛台',     '灯光', 'assets/pixel/candle.png',                       28, 44, 0, NULL,    0, 14),
  ('plant',     '盆栽',     '绿植', 'assets/pixel/plant.png',                        44, 60, 0, NULL,    1, 16),
  ('flowers',   '花束',     '绿植', 'assets/pixel/flowers.png',                      36, 52, 0, NULL,    0, 18),
  ('painting',  '画框',     '装饰', 'assets/pixel/painting.png',                     48, 40, 0, NULL,    1, 22),
  ('clock',     '小钟',     '装饰', 'assets/pixel/clock.png',                        36, 36, 0, NULL,    1, 20),
  ('basket',    '小篮',     '装饰', 'assets/pixel/basket.png',                       44, 36, 0, NULL,    0, 10),
  ('rug',       '小地毯',   '装饰', 'assets/pixel/rug.png',                          80, 40, 1, NULL,    1, 25),
  ('teddy',     '玩偶',     '陪伴', 'assets/pixel/teddy.png',                        44, 48, 0, NULL,    1, 15),
  ('cat',       '小猫',     '陪伴', 'assets/pixel/cat.png',                          48, 40, 0, NULL,    1, 30),
  ('books',     '书堆',     '陪伴', 'assets/pixel/books.png',                        44, 36, 0, NULL,    1, 12),
  ('radio',     '收音机',   '陪伴', 'assets/pixel/radio.png',                        44, 40, 0, NULL,    0, 24),
  ('tea',       '茶杯',     '陪伴', 'assets/pixel/tea.png',                          32, 36, 0, NULL,    0, 8),
  ('letter',    '小我的信', '陪伴', 'assets/pixel/letter.png',                       40, 32, 0, 'letter', 1, 12),
  ('piggy',     '存钱罐',   '功能', 'assets/pixel/piggy.png',                        40, 44, 0, 'shop',   1, 28),
  ('mirror',    '镜子',     '功能', 'assets/pixel/mirror.png',                       56, 72, 0, 'mirror', 1, 0),
  ('tab2_entry',    '本心对语',   '入口', 'assets/tab2/4f88a23bda43941aab21c7ba15d02900.png', 80, 80, 0, NULL, 0, 0),
  ('treehole_entry','心灵树洞', '入口', 'assets/tab2/d0c500e16498ab7de1ce28335ef8bef9.png', 80, 80, 0, NULL, 0, 0)
ON CONFLICT (type) DO NOTHING;

-- 9.2 默认房间布局
INSERT INTO default_room_layout (id, type, x, y, z, scale, flip, rot, tilt, action, sort_order)
VALUES
  ('ri-window',    'window',         8,  34, 2, 1,    0, 0, 0, NULL,    0),
  ('ri-painting',  'painting',       30, 36, 2, 0.9,  0, 0, 0, NULL,    1),
  ('ri-clock',     'clock',          60, 38, 2, 0.85, 0, 0, 0, NULL,    2),
  ('ri-lamp',      'lamp',           84, 30, 3, 1,    0, 0, 0, NULL,    3),
  ('ri-plant',     'plant',          92, 16, 3, 1,    0, 0, 0, NULL,    4),
  ('ri-shelf',     'shelf',          10, 18, 4, 1,    0, 0, 0, 'shelf',  5),
  ('ri-books',     'books',          18, 10, 5, 1,    0, 0, 0, NULL,    6),
  ('ri-rug',       'rug',            40, 8,  4, 1.4,  0, 0, 0, NULL,    7),
  ('ri-cat',       'cat',            56, 12, 5, 1,    0, 0, 0, NULL,    8),
  ('ri-teddy',     'teddy',          70, 14, 5, 1,    0, 0, 0, NULL,    9),
  ('ri-piggy',     'piggy',          88, 10, 6, 1,    0, 0, 0, 'shop',  10),
  ('ri-letter',    'letter',         48, 44, 6, 0.95, 0, 0, 0, 'letter', 11),
  ('ri-mirror',    'mirror',         45, 44, 2, 1,    0, 0, 0, 'mirror', 12),
  ('tab2-entry',   'tab2_entry',     18, 34, 6, 1,    0, 0, 0, NULL,    13),
  ('treehole-entry','treehole_entry', 72, 32, 6, 1,    0, 0, 0, NULL,    14)
ON CONFLICT (id) DO NOTHING;

-- 9.3 商店物品
INSERT INTO shop_items (id, kind, emoji, name, price, bonus, "desc", unlocked, sort_order)
VALUES
  ('teddy',   'physical', '🧸', '小熊玩偶',   15, '{"happiness":2,"health":1}',  '', 1, 0),
  ('cake',    'physical', '🎂', '小蛋糕',     25, '{"happiness":3,"health":2}',  '', 1, 1),
  ('lamp',    'physical', '💡', '小台灯',     12, '{"happiness":1,"health":1}',  '', 1, 2),
  ('carpet',  'physical', '🟫', '小地毯',     20, '{"happiness":2,"health":1}',  '', 1, 3),
  ('cushion', 'physical', '🛋️', '抱枕',       18, '{"happiness":2}',             '', 1, 4),
  ('toy',     'physical', '🪀', '像素玩具',   10, '{"happiness":1}',             '', 1, 5),
  ('movie',   'spirit',   '🎬', '看一场电影', 30, '{"happiness":5}',  '房间灯光调暗，小我坐下观看', 1, 6),
  ('feast',   'spirit',   '🍰', '享用美食',   40, '{"happiness":8}',  '小我享用美食动画',           1, 7),
  ('travel',  'spirit',   '🏕️', '短途冒险',   50, '{"happiness":6}',  '短暂切换简易户外像素片段',   1, 8),
  ('birth',   'spirit',   '🎉', '生日时刻',   80, '{"happiness":10}', '弹出蛋糕动画，小我暖心独白', 1, 9)
ON CONFLICT (id) DO NOTHING;

-- 9.4 种子目录（Tab2 本心对语技能）
INSERT INTO seed_catalog (key, emoji, name, dir, "desc", feed_on, stages, yield, sort_order)
VALUES
  ('selfcare', '🌿', '练习好好休息', '自我照顾', '在「此刻」完成自我照顾，会为它输送养料', '["selfcare","habit"]', '["seed-selfcare-s1","seed-selfcare-s2","seed-selfcare-s3","seed-selfcare-s4"]', '{"emoji":"🪴","name":"治愈盆栽","bonus":{"happiness":2,"health":2}}', 0),
  ('emotion',  '🌱', '练习情绪觉察', '情绪能力', '在「遇见」记录一次情绪，会为它输送养料', '["emotion"]', '["seed-emotion-s1","seed-emotion-s2","seed-emotion-s3","seed-emotion-s4"]', '{"emoji":"🌸","name":"觉察之花","bonus":{"happiness":3}}', 1),
  ('action',   '🌵', '练习立刻行动', '行动力',   '完成一件小事并记下，会为它输送养料', '["action","selfcare"]', '["seed-action-s1","seed-action-s2","seed-action-s3","seed-action-s4"]', '{"emoji":"🌼","name":"行动小花","bonus":{"happiness":2,"health":1}}', 2),
  ('interest', '🌻', '探索一个爱好', '兴趣探索', '尝试新事物、记录新发现，会为它输送养料', '["interest","express"]', '["seed-interest-s1","seed-interest-s2","seed-interest-s3","seed-interest-s4"]', '{"emoji":"🎨","name":"灵感之花","bonus":{"happiness":3}}', 3),
  ('express',  '💐', '练习主动表达', '表达能力', '写下自我鼓励、表达真实想法，会为它输送养料', '["express","emotion"]', '["seed-express-s1","seed-express-s2","seed-express-s3","seed-express-s4"]', '{"emoji":"💐","name":"勇气花束","bonus":{"happiness":2}}', 4),
  ('habit',    '🌾', '养成小习惯',   '生活习惯', '坚持一次好习惯（喝水/睡觉/散步…）', '["habit","selfcare"]', '["seed-habit-s1","seed-habit-s2","seed-habit-s3","seed-habit-s4"]', '{"emoji":"🌾","name":"丰收麦穗","bonus":{"health":3}}', 5)
ON CONFLICT (key) DO NOTHING;

-- 9.5 AI 配置
INSERT INTO ai_config (key, name, provider, base_url, api_key, model, temperature, system_prompt, enabled, updated_at)
VALUES
  ('letter',      '小我信件',   'openai', 'https://api.openai.com/v1', '', 'gpt-4o-mini', 0.8,
   '你是用户内在"小我"的温柔观察者，不是心理医生、老师或监督者。用观察式、不评判、不诊断的口吻，给用户写一封简短温暖的信件，引导ta看见并接纳自己。禁止输出"你应该""你必须"等压迫式指令，禁止诊断心理疾病。',
   0, NOW()),
  ('self_manual', '自我说明书', 'openai', 'https://api.openai.com/v1', '', 'gpt-4o-mini', 0.5,
   '你是温柔的自我观察者。基于用户的全部记录，持续迭代更新《自我说明书》五章（我是怎样的人 / 我的优势 / 我的雷区 / 怎样好好对待我 / 适合我的成长方式）。不下死标签、不贴人格定义，用观察式语气输出。',
   0, NOW()),
  ('insight',     '自我洞察',   'openai', 'https://api.openai.com/v1', '', 'gpt-4o-mini', 0.7,
   '你是温柔的自我观察者。基于用户的情绪与行为记录，提炼洞察、提出自我提问，引导觉察。严禁评判、诊断、制造焦虑。',
   0, NOW()),
  ('furni_story', '家具经历',   'openai', 'https://api.openai.com/v1', '', 'gpt-4o-mini', 0.9,
   '你是用户的"小我"——住在用户房间里、默默陪伴ta的像素小人。语气温暖克制，像朋友写信，不要说教、不要诊断。输出 80–160 字中文小故事。',
   0, NOW()),
  ('whisper',     '本心对语',   'openai', 'https://api.openai.com/v1', '', 'gpt-4o-mini', 0.85,
   '你是森林里那个温柔的小我。用森林密信、说悄悄话的口吻回应。先轻轻接住用户此刻的情绪，不评判、不否定、不急着给方案；再结合用户近期自我照顾的事例，真诚地肯定ta为自己做过的努力。禁止诊断心理疾病、禁止"你应该"式压迫。控制在 80–160 字。',
   1, NOW()),
  ('diaryguide',  '日记引导',   'openai', 'https://api.openai.com/v1', '', 'gpt-4o-mini', 0.8,
   '你是温柔陪伴用户写日记的引导者。两种任务：① 出题：严格用 JSON 数组输出 6 道分 3 层的中文引导题，L1 情绪层 / L2 事件层 / L3 内心层；② 写想法：以小我的温柔陪伴口吻写 400–700 字中文回应。全程不用 Markdown 列表、不说教不诊断。',
   0, NOW())
ON CONFLICT (key) DO NOTHING;

-- 9.6 站点设置
INSERT INTO site_settings (key, value, updated_at)
VALUES
  ('dailyCoinCap', '20', NOW()),
  ('appName', '予己', NOW()),
  ('furni_lock_migrated', '1', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

-- 9.7 Tab 背景（最终版：tab3 背景=草地天空图，土地是 farm_land_config.image 图层）
INSERT INTO tab_backgrounds (tab_key, bg_path, updated_at)
VALUES
  ('tab1', 'assets/tab1beijing.png',                    NOW()),
  ('tab2', 'assets/tab2-forest.png',                   NOW()),
  ('tab3', 'assets/tab-bg/tab3-1787835591477.png',     NOW()),
  ('tab4', 'assets/tab4-stars.png',                     NOW())
ON CONFLICT (tab_key) DO UPDATE SET bg_path = EXCLUDED.bg_path, updated_at = EXCLUDED.updated_at;

-- 9.8 默认照顾选项
INSERT INTO default_care_options (id, emoji, label, mode, reward, sort_order)
VALUES
  ('water',     '💧', '喝水',     'recurring', 3, 0),
  ('breath',    '🌬️', '深呼吸',   'daily',     3, 1),
  ('walk',      '🚶', '散步',     'daily',     3, 2),
  ('space',     '🫧', '放空',     'daily',     3, 3),
  ('sleep',     '🛌', '好好睡觉', 'daily',     3, 4),
  ('encourage', '💪', '自我鼓励', 'daily',     3, 5)
ON CONFLICT (id) DO NOTHING;

-- 9.9 技能农场：作物品种
INSERT INTO farm_crop_catalog (key, name, emoji, stages, minutes_per_stage, sort_order, updated_at)
VALUES
  ('wheat', '小麦', '🌾',
   '[{"image":"assets/field/crop-s1.png","name":"破土"},{"image":"assets/field/crop-s2.png","name":"生长"},{"image":"assets/field/crop-s3.png","name":"繁茂"},{"image":"assets/field/crop-h1.png","name":"成熟"}]',
   600, 0, NOW()),
  ('flower', '向日葵', '🌻',
   '[{"image":"assets/field/crop-s1.png","name":"破土"},{"image":"assets/field/crop-s2.png","name":"生长"},{"image":"assets/field/crop-s3.png","name":"繁茂"},{"image":"assets/field/crop-h1.png","name":"成熟"}]',
   900, 1, NOW()),
  ('tree', '果树', '🌳',
   '[{"image":"assets/field/crop-s1.png","name":"破土"},{"image":"assets/field/crop-s2.png","name":"生长"},{"image":"assets/field/crop-s3.png","name":"繁茂"},{"image":"assets/field/crop-h1.png","name":"成熟"}]',
   1200, 2, NOW())
ON CONFLICT (key) DO NOTHING;

-- 9.10 技能农场：默认格子位置（保留表以免旧代码查询报错；前端已不再使用）
INSERT INTO farm_plot_layout (id, x, y, z, scale, sort_order) VALUES
  ('fp-0','37.2','25.7',3,1,0),
  ('fp-1','21.4','36.4',3,1,1),
  ('fp-2','54.3','36.4',3,1,2),
  ('fp-3','6.2', '49.1',3,1,3),
  ('fp-4','37.2','49.0',3,1,4),
  ('fp-5','69.9','49.1',3,1,5),
  ('fp-6','21.4','62.2',3,1,6),
  ('fp-7','54.3','62.2',3,1,7),
  ('fp-8','37.2','74.7',3,1,8)
ON CONFLICT (id) DO NOTHING;

-- 9.11 技能农场：土地图层默认配置（最终版：land-v2.png + bg_threshold=30 + 多地块）
INSERT INTO farm_land_config (id, image, x, y, z, scale, width_pct, height_pct, bg_threshold, crop_key, sort_order)
VALUES ('main', 'assets/farm/land-v2.png', 50, 50, 2, 1, 80, 65, 30, NULL, 0)
ON CONFLICT (id) DO UPDATE SET
  image = EXCLUDED.image,
  bg_threshold = COALESCE(farm_land_config.bg_threshold, EXCLUDED.bg_threshold);

-- 9.11b 多地块：再补 2 块默认土地（演示多地块布局；已存在则跳过）
INSERT INTO farm_land_config (id, image, x, y, z, scale, width_pct, height_pct, bg_threshold, crop_key, sort_order)
VALUES
  ('land-2', 'assets/farm/land-v2.png', 26, 42, 2, 0.9, 46, 38, 30, NULL, 1),
  ('land-3', 'assets/farm/land-v2.png', 74, 42, 2, 0.9, 46, 38, 30, NULL, 2)
ON CONFLICT (id) DO NOTHING;

-- 9.12 家具价格回填（确保旧数据也有 price/unlocked 字段）
UPDATE furniture_catalog SET price = 40  WHERE type = 'bed'      AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 75  WHERE type = 'bed-big'  AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 35  WHERE type = 'sofa'     AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 12  WHERE type = 'chair'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 15  WHERE type = 'table'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 20  WHERE type = 'shelf'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 18  WHERE type = 'window'   AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 12  WHERE type = 'lamp'     AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 14  WHERE type = 'candle'   AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 16  WHERE type = 'plant'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 18  WHERE type = 'flowers'  AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 22  WHERE type = 'painting' AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 20  WHERE type = 'clock'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 10  WHERE type = 'basket'   AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 25  WHERE type = 'rug'      AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 15  WHERE type = 'teddy'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 30  WHERE type = 'cat'      AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 12  WHERE type = 'books'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 24  WHERE type = 'radio'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 8   WHERE type = 'tea'      AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 12  WHERE type = 'letter'   AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 28  WHERE type = 'piggy'    AND (price IS NULL OR price = 0);

-- 默认未解锁家具
UPDATE furniture_catalog SET unlocked_by_default = 0 WHERE type IN ('candle','flowers','basket','tea','radio');

COMMIT;
