import { getServiceClient } from './supabase.ts';

export function getJwtFromHeader(req: Request): string | null {
  const h = req.headers.get('authorization') || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

export async function getUser(jwt: string) {
  if (!jwt) return null;
  const supabase = getServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return null;

  // 获取扩展信息（role, is_preview 等）
  const { data: profile } = await supabase
    .from('users')
    .select('role, must_change_pw, is_preview')
    .eq('id', user.id)
    .single();

  return {
    id: user.id,
    email: user.email,
    username: profile?.role ? (user.user_metadata?.username || user.email || user.id) : (user.user_metadata?.username || user.email || user.id),
    role: profile?.role || 'user',
    must_change_pw: profile?.must_change_pw || false,
    is_preview: profile?.is_preview || false,
  };
}

export async function requireAuth(req: Request) {
  const jwt = getJwtFromHeader(req);
  if (!jwt) throw new Error('未登录或会话已过期');
  const user = await getUser(jwt);
  if (!user) throw new Error('未登录或会话已过期');
  return user;
}

export async function optionalAuth(req: Request) {
  const jwt = getJwtFromHeader(req);
  if (!jwt) return null;
  return await getUser(jwt);
}

export async function requireAdmin(req: Request) {
  const user = await requireAuth(req);
  if (user.role !== 'admin') throw new Error('需要管理员权限');
  return user;
}

export async function logAdmin(supabase: any, adminId: string, action: string, target: string, detail: string) {
  try {
    await supabase.from('admin_log').insert({
      admin_id: adminId,
      action,
      target: target || '',
      detail: detail || '',
      created_at: new Date().toISOString(),
    });
  } catch (_e) {
    // ignore
  }
}
