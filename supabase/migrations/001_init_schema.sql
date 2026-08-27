-- ============================================================
-- 《予己》Supabase 全迁移 - 初始化 schema + RLS + 触发器
-- 执行方式：在 Supabase Dashboard → SQL Editor 中逐段执行
-- ============================================================

-- -----------------------------------------------------------
-- 1. 扩展用户表（与 Supabase Auth 同步）
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  must_change_pw BOOLEAN NOT NULL DEFAULT false,
  is_preview    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.users IS '扩展 Supabase Auth 的用户信息';

-- Auth 用户注册时自动同步到 public.users
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

-- 触发器：在 auth.users 插入后自动创建 public.users 记录
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 已有 auth 用户的回填（如果表已存在数据）
INSERT INTO public.users (id, username, role, must_change_pw, is_preview)
SELECT id, COALESCE(raw_user_meta_data->>'username', email, id::text), 'user', false, false
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------
-- 2. 业务表（全部启用 RLS）
-- -----------------------------------------------------------

-- 家具目录（公开只读）
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

-- 默认房间布局（公开只读）
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

-- 商店物品（公开只读）
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

-- 种子目录（公开只读）
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

-- AI 配置（前端不可访问，仅 Edge Functions 通过 service_role 读写）
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

-- 站点设置（公开只读）
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ
);

-- Tab 背景（公开只读）
CREATE TABLE IF NOT EXISTS tab_backgrounds (
  tab_key    TEXT PRIMARY KEY,
  bg_path    TEXT,
  updated_at TIMESTAMPTZ
);

-- 默认照顾选项（公开只读）
CREATE TABLE IF NOT EXISTS default_care_options (
  id         TEXT PRIMARY KEY,
  emoji      TEXT NOT NULL,
  label      TEXT NOT NULL,
  mode       TEXT NOT NULL DEFAULT 'daily',
  reward     INTEGER NOT NULL DEFAULT 3,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 管理员日志（仅 admin 可读写）
CREATE TABLE IF NOT EXISTS admin_log (
  id         SERIAL PRIMARY KEY,
  admin_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 用户状态（仅本人可读写）
CREATE TABLE IF NOT EXISTS user_state (
  user_id    UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------
-- 3. 启用 RLS
-- -----------------------------------------------------------
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

-- -----------------------------------------------------------
-- 4. RLS 策略
-- -----------------------------------------------------------

-- 辅助函数：判断当前用户是否为管理员
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- furniture_catalog：所有人可读，仅 admin 可写
CREATE POLICY "fc_read_all" ON furniture_catalog FOR SELECT USING (true);
CREATE POLICY "fc_admin_write" ON furniture_catalog FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- default_room_layout：所有人可读，仅 admin 可写
CREATE POLICY "rl_read_all" ON default_room_layout FOR SELECT USING (true);
CREATE POLICY "rl_admin_write" ON default_room_layout FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- shop_items：所有人可读，仅 admin 可写
CREATE POLICY "si_read_all" ON shop_items FOR SELECT USING (true);
CREATE POLICY "si_admin_write" ON shop_items FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- seed_catalog：所有人可读，仅 admin 可写
CREATE POLICY "sc_read_all" ON seed_catalog FOR SELECT USING (true);
CREATE POLICY "sc_admin_write" ON seed_catalog FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ai_config：管理员可读写（admin 面板直接操作），前端仍不可访问
CREATE POLICY "ai_admin_select" ON ai_config FOR SELECT USING (public.is_admin());
CREATE POLICY "ai_admin_write" ON ai_config FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- site_settings：所有人可读，仅 admin 可写
CREATE POLICY "ss_read_all" ON site_settings FOR SELECT USING (true);
CREATE POLICY "ss_admin_write" ON site_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- tab_backgrounds：所有人可读，仅 admin 可写
CREATE POLICY "tb_read_all" ON tab_backgrounds FOR SELECT USING (true);
CREATE POLICY "tb_admin_write" ON tab_backgrounds FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- default_care_options：所有人可读，仅 admin 可写
CREATE POLICY "dc_read_all" ON default_care_options FOR SELECT USING (true);
CREATE POLICY "dc_admin_write" ON default_care_options FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- admin_log：仅 admin 可读写
CREATE POLICY "al_admin_all" ON admin_log FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- user_state：仅本人可读写
CREATE POLICY "us_owner_select" ON user_state FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "us_owner_insert" ON user_state FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "us_owner_update" ON user_state FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "us_owner_delete" ON user_state FOR DELETE USING (user_id = auth.uid());

-- public.users：本人可读，管理员可读写
CREATE POLICY "u_self_select" ON public.users FOR SELECT USING (id = auth.uid());
CREATE POLICY "u_admin_all" ON public.users FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------
-- 5. Storage 桶（公开读取，认证用户可上传）
-- -----------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('furniture-images', 'furniture-images', true),
  ('shop-images', 'shop-images', true),
  ('tab-backgrounds', 'tab-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS：匿名可读，认证用户可上传
CREATE POLICY "storage_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('furniture-images', 'shop-images', 'tab-backgrounds'));

CREATE POLICY "storage_auth_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id IN ('furniture-images', 'shop-images', 'tab-backgrounds')
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "storage_auth_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id IN ('furniture-images', 'shop-images', 'tab-backgrounds')
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "storage_auth_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id IN ('furniture-images', 'shop-images', 'tab-backgrounds')
    AND auth.role() = 'authenticated'
  );
