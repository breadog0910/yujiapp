/* ============================================================
   前端通信层：Supabase 全迁移版
   - Auth：Supabase Auth（邮箱/密码，username 映射为 email）
   - Database：supabase-js 直接读写 PostgreSQL（RLS 保护）
   - AI：Supabase Edge Functions（ai-agent / ai-chain）
   ============================================================ */

const Api = (() => {
  // ---------- Supabase 配置（部署后替换为真实值） ----------
  const SUPABASE_URL = window.YUJI_SUPABASE_URL || 'https://your-project.supabase.co';
  const SUPABASE_ANON_KEY = window.YUJI_SUPABASE_ANON_KEY || 'your-anon-key';

  let supabase = null;
  function getClient() {
    if (!supabase) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
    }
    return supabase;
  }

  // ---------- 辅助：username ↔ email ----------
  function toEmail(username) { return username.trim().toLowerCase() + '@yujiapp.local'; }
  function fromEmail(email) {
    if (!email) return '';
    return email.replace(/@yujiapp\.local$/i, '');
  }

  // ---------- 当前用户缓存 ----------
  let _user = null;
  function getUser() { return _user; }
  function isPreview() { return !!(_user && _user.isPreview); }
  function _setUser(u) { _user = u || null; }

  // ---------- 认证 ----------
  async function login(username, password) {
    const { data, error } = await getClient().auth.signInWithPassword({
      email: toEmail(username),
      password,
    });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? '用户名或密码错误' : error.message);
    if (!data.user) throw new Error('登录失败：该账号可能未验证邮箱或已被禁用');
    await _hydrateUser(data.user);
    return { user: _user };
  }

  async function register(username, password) {
    const { data, error } = await getClient().auth.signUp({
      email: toEmail(username),
      password,
      options: { data: { username } },
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('注册失败：请检查 Supabase Auth 是否关闭了邮箱验证');
    await _hydrateUser(data.user);
    return { user: _user };
  }

  async function logout() {
    await getClient().auth.signOut();
    _setUser(null);
  }

  async function me() {
    const { data: { user } } = await getClient().auth.getUser();
    if (!user) { _setUser(null); return { user: null }; }
    await _hydrateUser(user);
    return { user: _user };
  }

  // 从 auth.user 填充 _user（含 public.users 扩展字段）
  async function _hydrateUser(authUser) {
    if (!authUser) { _setUser(null); return; }
    let profile = null;
    try {
      const { data } = await getClient()
        .from('users')
        .select('role, must_change_pw, is_preview')
        .eq('id', authUser.id)
        .single();
      profile = data;
    } catch (e) {
      console.warn('[Api] 读取 users 表失败:', e.message);
    }

    _setUser({
      id: authUser.id,
      username: authUser.user_metadata?.username || fromEmail(authUser.email) || authUser.id,
      email: authUser.email,
      role: profile?.role || 'user',
      must_change_pw: profile?.must_change_pw || false,
      is_preview: profile?.is_preview || false,
    });
  }

  async function init() {
    const { data: { session } } = await getClient().auth.getSession();
    if (session && session.user) {
      await _hydrateUser(session.user);
    }
  }

  function isAuthed() { return !!_user; }

  // ---------- 配置聚合查询（并行） ----------
  async function getConfig() {
    const client = getClient();
    const [
      { data: furniture, error: e1 },
      { data: layout, error: e2 },
      { data: shop, error: e3 },
      { data: seeds, error: e4 },
      { data: settingsRows, error: e5 },
      { data: tabBgRows, error: e6 },
      { data: careRows, error: e7 },
      { data: aiRows, error: e8 },
    ] = await Promise.all([
      client.from('furniture_catalog').select('*').order('category').order('type'),
      client.from('default_room_layout').select('*').order('sort_order'),
      client.from('shop_items').select('*').order('kind').order('sort_order'),
      client.from('seed_catalog').select('*').order('sort_order'),
      client.from('site_settings').select('key, value'),
      client.from('tab_backgrounds').select('tab_key, bg_path, updated_at'),
      client.from('default_care_options').select('*').order('sort_order').order('id'),
      client.from('ai_config').select('key, name, provider, model, enabled').order('key'),
    ]);

    if (e1) console.warn('[Api] furniture_catalog 查询失败', e1.message);
    if (e2) console.warn('[Api] default_room_layout 查询失败', e2.message);

    const settings = {};
    (settingsRows || []).forEach((s) => { settings[s.key] = s.value; });

    const tabBackgrounds = {
      tab1: 'assets/tab1beijing.png',
      tab2: 'assets/tab2-forest.png',
      tab3: 'assets/tab3-garden-bg.jpg',
      tab4: 'assets/tab4-stars.png',
    };
    (tabBgRows || []).forEach((r) => {
      if (tabBackgrounds[r.tab_key] !== undefined) {
        tabBackgrounds[r.tab_key] = r.bg_path || tabBackgrounds[r.tab_key];
      }
    });

    const mapFurniture = (r) => ({
      type: r.type, name: r.name, category: r.category, icon: r.icon,
      w: r.w, h: r.h, isFloor: !!r.is_floor, action: r.action || null,
      unlockedByDefault: !!r.unlocked_by_default, price: r.price || 0,
    });
    const mapLayout = (r) => ({
      id: r.id, type: r.type, x: r.x, y: r.y, z: r.z,
      scale: r.scale, flip: r.flip, rot: r.rot || 0, tilt: r.tilt || 0,
      action: r.action || null, sortOrder: r.sort_order,
    });
    const mapShop = (r) => ({
      id: r.id, kind: r.kind, emoji: r.emoji, name: r.name, price: r.price,
      bonus: JSON.parse(r.bonus || '{}'), desc: r.desc || '', unlocked: !!r.unlocked,
    });
    const mapSeed = (r) => ({
      key: r.key, emoji: r.emoji, name: r.name, dir: r.dir, desc: r.desc,
      feedOn: JSON.parse(r.feed_on || '[]'), stages: JSON.parse(r.stages || '[]'),
      yield: JSON.parse(r.yield || '{}'),
    });

    return {
      appName: settings.appName || '予己',
      dailyCoinCap: parseInt(settings.dailyCoinCap || '20', 10),
      furnitureCatalog: (furniture || []).map(mapFurniture),
      defaultRoomLayout: (layout || []).map(mapLayout),
      shopItems: (shop || []).map(mapShop),
      seedCatalog: (seeds || []).map(mapSeed),
      aiConfig: (aiRows || []).map((a) => ({ key: a.key, name: a.name, provider: a.provider, model: a.model, enabled: !!a.enabled })),
      tabBackgrounds,
      defaultCareOptions: (careRows || []).map((r) => ({
        id: r.id, emoji: r.emoji, label: r.label,
        mode: r.mode, reward: r.reward, sortOrder: r.sort_order,
      })),
      unlockedTypes: (furniture || []).filter((f) => f.unlocked_by_default).map((f) => f.type),
      serverTime: new Date().toISOString(),
    };
  }

  // ---------- 用户状态（直接读写 user_state 表） ----------
  async function getState() {
    const { data, error } = await getClient()
      .from('user_state')
      .select('data, updated_at')
      .single();
    if (error) throw new Error(error.message);
    return { data: data ? JSON.parse(data.data) : null, updated_at: data?.updated_at };
  }

  async function saveState(state) {
    const { data: { user } } = await getClient().auth.getUser();
    if (!user) throw new Error('未登录');
    const { error } = await getClient()
      .from('user_state')
      .upsert({
        user_id: user.id,
        data: JSON.stringify(state),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  // ---------- AI（Edge Functions） ----------
  async function callAI(agent, messages, temperature) {
    const body = { messages };
    if (temperature !== undefined) body.temperature = temperature;
    const { data, error } = await getClient().functions.invoke('ai-agent/' + agent, { body });
    if (error) throw new Error(error.message || 'AI 调用失败');
    return data;
  }

  async function getChains() {
    return {
      chains: [
        { key: 'insight_letter', name: '洞察写信', description: '先分析用户的情绪记录生成洞察，再用洞察结果辅助写一封温暖的信' },
        { key: 'insight_manual', name: '洞察更新说明书', description: '分析用户近期记录，用洞察更新《自我说明书》各章节内容' },
      ],
    };
  }

  async function callChain(chainName, messages, temperature) {
    const body = { chain: chainName };
    if (messages) body.messages = messages;
    if (temperature !== undefined) body.temperature = temperature;
    const { data, error } = await getClient().functions.invoke('ai-chain', { body });
    if (error) throw new Error(error.message || '编排链调用失败');
    return data;
  }

  // ---------- Storage 文件上传 ----------
  async function uploadFile(bucket, filePath, file) {
    const { data, error } = await getClient().storage
      .from(bucket)
      .upload(filePath, file, { upsert: true });
    if (error) throw new Error(error.message);
    const { data: urlData } = getClient().storage.from(bucket).getPublicUrl(data.path);
    return { path: data.path, publicUrl: urlData.publicUrl };
  }

  // ---------- 导出 ----------
  return {
    getClient,
    isAuthed, isPreview,
    getUser,
    login, register, logout, me,
    getConfig, getState, saveState,
    callAI, getChains, callChain,
    uploadFile,
  };
})();
