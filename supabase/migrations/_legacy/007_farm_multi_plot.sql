-- ============================================================
-- 《予己》007 技能农场：多地块 + 每块土地作物设置
-- 执行方式：在 Supabase SQL Editor 执行（完全幂等）
-- 说明：
--   farm_land_config 的 id 已是唯一主键（非固定单值），本就支持多行，
--   因此只需新增 crop_key 列（该土地种的作物品种 key，NULL = 空地），
--   并把「单地块」约定升级为「多地块列表」：管理员可在后台复制多块土地、
--   分别拖拽摆放、分别设置作物，统一保存。
--   RLS 策略（flc_read_all / flc_admin_wr）作用于整张表，多行自动继承。
-- ============================================================

-- 1. 新增 crop_key 列（该土地种的作物品种 key；NULL=空地）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farm_land_config' AND column_name = 'crop_key'
  ) THEN
    ALTER TABLE farm_land_config ADD COLUMN crop_key TEXT DEFAULT NULL;
  END IF;
END $$;

-- 2. 确保 sort_order 列存在（多地块排序用；004 建表时未加）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farm_land_config' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE farm_land_config ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 3. 给原单地块行补一个 sort_order（保持它在最前）
UPDATE farm_land_config SET sort_order = 0 WHERE id = 'main' AND sort_order = 0;

-- 4. 演示用：再补 2 块默认土地，呈现「多地块」布局（已存在则跳过）
INSERT INTO farm_land_config (id, image, x, y, z, scale, width_pct, height_pct, bg_threshold, crop_key, sort_order)
VALUES
  ('land-2', 'assets/farm/land-v2.png', 26, 42, 2, 0.9, 46, 38, 30, NULL, 1),
  ('land-3', 'assets/farm/land-v2.png', 74, 42, 2, 0.9, 46, 38, 30, NULL, 2)
ON CONFLICT (id) DO NOTHING;
