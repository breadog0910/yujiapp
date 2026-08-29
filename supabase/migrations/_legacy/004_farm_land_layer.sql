-- ============================================================
-- 《予己》004 技能农场：土地图层配置（管理员可拖拽的覆盖层）
-- 执行方式：在 003 之后于 Supabase SQL Editor 执行（完全幂等）
-- 说明：
--   tab3 的整体背景（草地/天空）继续由 tab_backgrounds.tab3 控制
--   土地照片是一张独立"图层"，通过下表控制在 tab3 背景上的位置/大小/缩放，
--   格子（farm_plot_layout）按全屏百分比叠在最上面，可自由放置。
-- ============================================================

-- 1. 表结构
CREATE TABLE IF NOT EXISTS farm_land_config (
  id          TEXT PRIMARY KEY,              -- 固定 'main'（单例）
  image       TEXT NOT NULL,                 -- 图层图片 URL，默认 'assets/farm/land.png'
  x           REAL NOT NULL DEFAULT 50,      -- 中心 X 百分比（0-100）
  y           REAL NOT NULL DEFAULT 50,      -- 中心 Y 百分比（0-100）
  z           INTEGER NOT NULL DEFAULT 2,    -- 层级：1=背景之下，2=格子之下
  scale       REAL NOT NULL DEFAULT 1,       -- 缩放倍数
  width_pct   REAL NOT NULL DEFAULT 80,      -- 宽度百分比（相对 tab3 容器）
  height_pct  REAL NOT NULL DEFAULT 65       -- 高度百分比（相对 tab3 容器）
);

-- 2. RLS（幂等）
ALTER TABLE farm_land_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "flc_read_all" ON farm_land_config;
CREATE POLICY "flc_read_all" ON farm_land_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "flc_admin_wr" ON farm_land_config;
CREATE POLICY "flc_admin_wr" ON farm_land_config FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3. 种子数据：默认居中土地
INSERT INTO farm_land_config (id, image, x, y, z, scale, width_pct, height_pct)
VALUES ('main', 'assets/farm/land.png', 50, 50, 2, 1, 80, 65)
ON CONFLICT (id) DO NOTHING;
