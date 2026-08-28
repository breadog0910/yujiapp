-- ============================================================
-- 《予己》003 技能农场 schema + RLS + 种子数据
-- 执行方式：在 001/002 之后于 Supabase SQL Editor 执行
-- ============================================================

-- 1. 作物品种库
CREATE TABLE IF NOT EXISTS farm_crop_catalog (
  key               TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  emoji             TEXT,
  stages            TEXT NOT NULL,            -- JSON: [{image,name}, ...]
  minutes_per_stage INTEGER NOT NULL DEFAULT 600,
  sort_order        INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ
);

-- 2. 土地格子位置
CREATE TABLE IF NOT EXISTS farm_plot_layout (
  id          TEXT PRIMARY KEY,
  x           REAL NOT NULL,                  -- 百分比 0-100
  y           REAL NOT NULL,
  z           INTEGER DEFAULT 3,
  scale       REAL DEFAULT 1,
  sort_order  INTEGER DEFAULT 0
);

-- 3. RLS（幂等：重复执行同一迁移不会因 policy 已存在报 42710）
ALTER TABLE farm_crop_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_plot_layout  ENABLE ROW LEVEL SECURITY;
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

-- 4. Storage 桶
INSERT INTO storage.buckets (id, name, public)
VALUES ('farm-images', 'farm-images', true)
ON CONFLICT (id) DO NOTHING;

-- 扩展现有 storage 策略的 bucket 白名单（重建含 farm-images 的版本）
DROP POLICY IF EXISTS storage_public_read ON storage.objects;
DROP POLICY IF EXISTS storage_auth_upload ON storage.objects;
DROP POLICY IF EXISTS storage_auth_update ON storage.objects;
DROP POLICY IF EXISTS storage_auth_delete ON storage.objects;
CREATE POLICY storage_public_read ON storage.objects FOR SELECT
  USING (bucket_id IN ('furniture-images','shop-images','tab-backgrounds','farm-images'));
CREATE POLICY storage_auth_upload ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('furniture-images','shop-images','tab-backgrounds','farm-images') AND auth.role() = 'authenticated');
CREATE POLICY storage_auth_update ON storage.objects FOR UPDATE
  USING (bucket_id IN ('furniture-images','shop-images','tab-backgrounds','farm-images') AND auth.role() = 'authenticated');
CREATE POLICY storage_auth_delete ON storage.objects FOR DELETE
  USING (bucket_id IN ('furniture-images','shop-images','tab-backgrounds','farm-images') AND auth.role() = 'authenticated');

-- 5. 种子数据：作物品种（阶段图复用 assets/field/crop-s1..s4.png 与 crop-h1.png）
INSERT INTO farm_crop_catalog (key, name, emoji, stages, minutes_per_stage, sort_order, updated_at)
VALUES
  ('wheat',     '小麦',   '🌾', '[{"image":"assets/field/crop-s1.png","name":"破土"},{"image":"assets/field/crop-s2.png","name":"生长"},{"image":"assets/field/crop-s3.png","name":"繁茂"},{"image":"assets/field/crop-h1.png","name":"成熟"}]', 600, 0, NOW()),
  ('flower',    '向日葵', '🌻', '[{"image":"assets/field/crop-s1.png","name":"破土"},{"image":"assets/field/crop-s2.png","name":"生长"},{"image":"assets/field/crop-s3.png","name":"繁茂"},{"image":"assets/field/crop-h1.png","name":"成熟"}]', 900, 1, NOW()),
  ('tree',      '果树',   '🌳', '[{"image":"assets/field/crop-s1.png","name":"破土"},{"image":"assets/field/crop-s2.png","name":"生长"},{"image":"assets/field/crop-s3.png","name":"繁茂"},{"image":"assets/field/crop-h1.png","name":"成熟"}]', 1200, 2, NOW())
ON CONFLICT (key) DO NOTHING;

-- 6. 种子数据：默认格子位置（旧 PLOT_LAYOUT 像素 / 容器 331x290 → 百分比近似；3x3 菱形）
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

-- 7. 土地底图更新为农场土地照片
INSERT INTO tab_backgrounds (tab_key, bg_path, updated_at)
VALUES ('tab3', 'assets/farm/land.png', NOW())
ON CONFLICT (tab_key) DO UPDATE SET bg_path = EXCLUDED.bg_path, updated_at = EXCLUDED.updated_at;
