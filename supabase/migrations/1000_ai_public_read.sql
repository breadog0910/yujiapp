-- 2026-08-29: 让 ai_config 公开字段对所有人可读（未登录用户也能看到哪些 AI 可用）
-- 敏感字段（api_key, base_url）仍仅 admin / Edge Functions (service_role) 可访问

-- 1. 允许所有人读取 ai_config 的公开字段
DROP POLICY IF EXISTS "ai_public_select" ON ai_config;
CREATE POLICY "ai_public_select" ON ai_config
  FOR SELECT
  USING (true);

-- 2. 保留 admin 写入权限
DROP POLICY IF EXISTS "ai_admin_write" ON ai_config;
CREATE POLICY "ai_admin_write" ON ai_config FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
