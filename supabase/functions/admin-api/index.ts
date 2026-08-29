import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { requireAdmin, logAdmin } from '../_shared/auth.ts';

const supabase = getServiceClient();

// 辅助：通用 JSON 响应
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// 辅助：获取请求体
async function body(req: Request) {
  return req.json().catch(() => ({}));
}

// ===== 概览统计 =====
async function getOverview(_req: Request, user: any) {
  const [usersRes, adminsRes, furnRes, layoutRes, shopRes, seedsRes, aiRes] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'user'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
    supabase.from('furniture_catalog').select('type', { count: 'exact', head: true }),
    supabase.from('default_room_layout').select('id', { count: 'exact', head: true }),
    supabase.from('shop_items').select('id', { count: 'exact', head: true }),
    supabase.from('seed_catalog').select('key', { count: 'exact', head: true }),
    supabase.from('ai_config').select('key', { count: 'exact', head: true }),
  ]);

  return json({
    users: usersRes.count || 0,
    admins: adminsRes.count || 0,
    furniture: furnRes.count || 0,
    layoutPieces: layoutRes.count || 0,
    shopItems: shopRes.count || 0,
    seeds: seedsRes.count || 0,
    aiAgents: aiRes.count || 0,
  });
}

// ===== 用户管理 =====
async function listUsers(_req: Request, user: any) {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, role, must_change_pw, is_preview, created_at')
    .order('role', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) return json({ error: error.message }, 500);
  return json(data.map((r: any) => ({ ...r, isPreview: r.is_preview })));
}

async function createUser(req: Request, admin: any) {
  const { username, password, role } = await body(req);
  if (!username || !password) return json({ error: '用户名和密码必填' }, 400);
  if (String(password).length < 6) return json({ error: '密码至少 6 位' }, 400);

  // 检查用户名是否已存在（public.users）
  const { data: exist } = await supabase.from('users').select('id').eq('username', username).single();
  if (exist) return json({ error: '用户名已存在' }, 409);

  // 通过 Supabase Auth 创建用户
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: `${username}@yujiapp.local`,
    password,
    email_confirm: true,
    user_metadata: { username, role: role === 'admin' ? 'admin' : 'user' },
  });

  if (authError || !authData.user) {
    return json({ error: authError?.message || '创建用户失败' }, 500);
  }

  // 更新 public.users 的 role（trigger 已创建，但 role 可能不对）
  await supabase.from('users').update({
    role: role === 'admin' ? 'admin' : 'user',
    must_change_pw: false,
  }).eq('id', authData.user.id);

  await logAdmin(supabase, admin.id, 'user.create', username, role || 'user');
  return json({ ok: true, id: authData.user.id });
}

async function updateUserRole(req: Request, admin: any, userId: string) {
  const { role } = await body(req);
  if (!['user', 'admin'].includes(role)) return json({ error: 'role 非法' }, 400);
  if (userId === admin.id && role !== 'admin') return json({ error: '不能取消自己的管理员权限' }, 400);

  await supabase.from('users').update({ role }).eq('id', userId);
  await logAdmin(supabase, admin.id, 'user.role', userId, role);
  return json({ ok: true });
}

async function updateUserPreview(req: Request, admin: any, userId: string) {
  const { isPreview } = await body(req);
  await supabase.from('users').update({ is_preview: !!isPreview }).eq('id', userId);
  await logAdmin(supabase, admin.id, 'user.preview', userId, !!isPreview ? 'on' : 'off');
  return json({ ok: true });
}

async function deleteUser(_req: Request, admin: any, userId: string) {
  if (userId === admin.id) return json({ error: '不能删除自己' }, 400);
  // 删除 auth 用户（级联删除 public.users 和 user_state）
  await supabase.auth.admin.deleteUser(userId);
  await logAdmin(supabase, admin.id, 'user.delete', userId, '');
  return json({ ok: true });
}

// ===== 日志 =====
async function listLogs(_req: Request, user: any) {
  const { data, error } = await supabase
    .from('admin_log')
    .select('*, users!inner(username)')
    .order('id', { ascending: false })
    .limit(200);
  if (error) return json({ error: error.message }, 500);
  return json(data.map((r: any) => ({
    ...r,
    admin_name: r.users?.username || '',
    users: undefined,
  })));
}

// ===== AI 配置管理 =====
async function listAI(_req: Request, _admin: any) {
  const { data, error } = await supabase
    .from('ai_config')
    .select('*')
    .order('key');
  if (error) return json({ error: error.message }, 500);
  return json(data);
}

async function updateAI(req: Request, admin: any, key: string) {
  const updates = await body(req);
  const allowed = ['name','provider','base_url','api_key','model','temperature','system_prompt','enabled'];
  const set: any = {};
  for (const k of allowed) {
    if (updates[k] !== undefined) set[k] = updates[k];
  }
  if (Object.keys(set).length === 0) return json({ error: '无有效字段' }, 400);
  set.updated_at = new Date().toISOString();

  const { error } = await supabase.from('ai_config').update(set).eq('key', key);
  if (error) return json({ error: error.message }, 500);
  await logAdmin(supabase, admin.id, 'ai.update', key, JSON.stringify(set));
  return json({ ok: true });
}

// ===== 路由分发 =====
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const admin = await requireAdmin(req);
    const url = new URL(req.url);
    const parts = url.pathname.replace(/.*\/admin-api\/?/, '').split('/').filter(Boolean);
    const resource = parts[0] || '';
    const id = parts[1] || '';
    const action = parts[2] || '';

    switch (resource) {
      case 'overview':
        return await getOverview(req, admin);
      case 'users':
        if (req.method === 'GET') return await listUsers(req, admin);
        if (req.method === 'POST') return await createUser(req, admin);
        if (id && req.method === 'PUT') {
          if (action === 'role') return await updateUserRole(req, admin, id);
          if (action === 'preview') return await updateUserPreview(req, admin, id);
        }
        if (id && req.method === 'DELETE') return await deleteUser(req, admin, id);
        return json({ error: '未知操作' }, 400);
      case 'logs':
        return await listLogs(req, admin);
      case 'ai':
        if (req.method === 'GET') return await listAI(req, admin);
        if (id && req.method === 'PUT') return await updateAI(req, admin, id);
        return json({ error: '未知操作' }, 400);
      default:
        return json({ error: '未知资源' }, 404);
    }
  } catch (e: any) {
    console.error('[admin-api] error', e.message);
    const status = e.message.includes('未登录') ? 401 : e.message.includes('管理员') ? 403 : 500;
    return json({ error: e.message }, status);
  }
});
