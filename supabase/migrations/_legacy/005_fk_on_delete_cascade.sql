-- ============================================================
-- 005_fk_on_delete_cascade.sql
-- 修复后台删家具/作物时被外键约束拦截的问题
--
-- 报错模式：
--   update or delete on table "furniture_catalog" violates foreign key
--   constraint "default_room_layout_type_fkey" on table "default_room_layout"
--
-- 原约束：ON DELETE NO ACTION（PostgreSQL 默认），父表记录被子表引用时
-- 禁止删除。后台管理中"删家具"必须先把默认布局里引用该家具的行清掉，
-- 即使 JS 层做了兜底，任何直接 SQL 删除 / service_role 批量清理路径
-- 仍会被 FK 挡住。
--
-- 策略：改为 ON DELETE CASCADE，删父记录时 DB 自动清理子表引用行。
-- 仅对"配置表/字典表 → 引用布局表"的归属关系启用 CASCADE（业务归属
-- 关系明确，级联不会误删数据）；users 等个人数据归属仍保持原模式。
-- ============================================================

-- 1. default_room_layout.type → furniture_catalog.type  （家具删除 → 默认布局自动清理）
ALTER TABLE default_room_layout
  DROP CONSTRAINT IF EXISTS default_room_layout_type_fkey,
  ADD CONSTRAINT default_room_layout_type_fkey
    FOREIGN KEY (type) REFERENCES furniture_catalog(type)
    ON DELETE CASCADE ON UPDATE CASCADE;
