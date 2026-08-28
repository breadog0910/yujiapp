-- ============================================================
-- 《予己》006 技能农场：单地块改造（删除 9 格子 + 土地图层加抠图阈值 + 强制改土地图URL去缓存）
-- 执行方式：在 Supabase SQL Editor 执行（完全幂等）
-- ============================================================

-- 1. 给 farm_land_config 加 bg_threshold 字段（前端 canvas flood fill 的色差阈值）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farm_land_config' AND column_name = 'bg_threshold'
  ) THEN
    ALTER TABLE farm_land_config ADD COLUMN bg_threshold INTEGER NOT NULL DEFAULT 30;
  END IF;
END $$;

-- 2. 覆盖种子：bg_threshold 设默认值，并且强制把土地图路径换为 land-v2.png（避免 land.png 被浏览器缓存）
INSERT INTO farm_land_config (id, image, x, y, z, scale, width_pct, height_pct, bg_threshold)
VALUES ('main', 'assets/farm/land-v2.png', 50, 50, 2, 1, 80, 65, 30)
ON CONFLICT (id) DO UPDATE SET
  image = EXCLUDED.image,
  bg_threshold = COALESCE(farm_land_config.bg_threshold, EXCLUDED.bg_threshold);

-- 3. 清理旧 farm_plot_layout（不再使用，保留表以免旧代码报错）
--    如需彻底删除表请在确认无引用后手动执行：
--    DROP TABLE IF EXISTS farm_plot_layout;

