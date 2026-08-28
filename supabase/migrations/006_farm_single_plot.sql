-- ============================================================
-- 《予己》006 技能农场：单地块改造（删除 9 格子 + 土地图层加抠图阈值）
-- 执行方式：在 005 之后于 Supabase SQL Editor 执行（完全幂等）
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

-- 2. 确保种子里 bg_threshold 有默认值（幂等）
UPDATE farm_land_config SET bg_threshold = 30 WHERE id = 'main' AND bg_threshold IS NULL;

-- 3. 清理旧 farm_plot_layout（不再使用，保留表以免旧代码报错）
--    如需彻底删除表请在确认无引用后手动执行：
--    DROP TABLE IF EXISTS farm_plot_layout;
