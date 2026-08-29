/* ============================================================
   前端通信层：Supabase + 本地模式 双支持
   - 本地模式：走 Express 后端 (/api/*)
   - Supabase 模式：走 Supabase Auth + Edge Functions
   ============================================================ */

const Api = (() => {
  // ---------- 模式检测 ----------
  const LOCAL_MODE = !!window.YUJI_LOCAL_MODE;

  // ---------- Supabase 配置 ----------
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
  function toEmail(username) { return encodeURIComponent(username.trim().toLowerCase()) + '@yujiapp.local'; }
  function fromEmail(email) {
    if (!email) return '';
    const localPart = email.replace(/@yujiapp\.local$/i, '');
    try { return decodeURIComponent(localPart); } catch { return localPart; }
  }

  // ---------- 本地模式辅助 ----------
  const LOCAL_TOKEN_KEY = 'yuji_local_token';
  let _localUser = null;

  function getLocalToken() {
    try { return localStorage.getItem(LOCAL_TOKEN_KEY); } catch (e) { return null; }
  }
  function setLocalToken(t) {
    try { if (t) localStorage.setItem(LOCAL_TOKEN_KEY, t); else localStorage.removeItem(LOCAL_TOKEN_KEY); } catch (e) {}
  }

  async function localFetch(path, opts = {}) {
    const token = getLocalToken();
    const headers = { ...(opts.headers || {}) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)
        ? JSON.stringify(opts.body) : opts.body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
    return data;
  }

  // ---------- 记住我 ----------
  const REMEMBER_KEY = 'yuji_remember';
  function saveRemember(username, password) {
    try { localStorage.setItem(REMEMBER_KEY, JSON.stringify({ u: username, p: password })); } catch (e) {}
  }
  function clearRemember() {
    try { localStorage.removeItem(REMEMBER_KEY); } catch (e) {}
  }
  function getRemember() {
    try {
      const raw = localStorage.getItem(REMEMBER_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }
  async function tryAutoLogin() {
    const cred = getRemember();
    if (!cred || !cred.u || !cred.p) return false;
    try { await login(cred.u, cred.p, true); return true; }
    catch (e) { clearRemember(); return false; }
  }

  // ---------- 当前用户缓存 ----------
  let _user = null;
  function getUser() { return LOCAL_MODE ? _localUser : _user; }
  function isPreview() {
    const u = getUser();
    return !!(u && u.isPreview);
  }
  function _setUser(u) {
    if (LOCAL_MODE) _localUser = u || null;
    else _user = u || null;
  }

  // ---------- 认证 ----------
  async function login(username, password, remember = false) {
    if (LOCAL_MODE) {
      const data = await localFetch('/auth/login', { method: 'POST', body: { username, password } });
      setLocalToken(data.token);
      _localUser = {
        id: String(data.user.id), username: data.user.username, role: data.user.role || 'user',
        must_change_pw: !!data.user.must_change_pw, isPreview: !!data.user.is_preview,
      };
      if (remember) saveRemember(username, password); else clearRemember();
      return { user: _localUser };
    }

    const { data, error } = await getClient().auth.signInWithPassword({
      email: toEmail(username), password,
    });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? '用户名或密码错误' : error.message);
    if (!data.user) throw new Error('登录失败：该账号可能未验证邮箱或已被禁用');
    await _hydrateUser(data.user);
    if (remember) saveRemember(username, password); else clearRemember();
    return { user: _user };
  }

  async function register(username, password) {
    if (LOCAL_MODE) {
      const data = await localFetch('/auth/register', { method: 'POST', body: { username, password } });
      setLocalToken(data.token);
      _localUser = {
        id: String(data.user.id), username: data.user.username, role: data.user.role || 'user',
        must_change_pw: !!data.user.must_change_pw, isPreview: !!data.user.is_preview,
      };
      return { user: _localUser };
    }

    const { data, error } = await getClient().auth.signUp({
      email: toEmail(username), password,
      options: { data: { username } },
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('注册失败：请检查 Supabase Auth 是否关闭了邮箱验证');
    await _hydrateUser(data.user);
    return { user: _user };
  }

  async function logout() {
    if (LOCAL_MODE) {
      try { await localFetch('/auth/logout', { method: 'POST' }); } catch (e) {}
      setLocalToken(null);
      _localUser = null;
      clearRemember();
      return;
    }
    clearRemember();
    await getClient().auth.signOut();
    _setUser(null);
  }

  async function me() {
    if (LOCAL_MODE) {
      const token = getLocalToken();
      if (!token) { _localUser = null; return { user: null }; }
      try {
        const data = await localFetch('/auth/me');
        _localUser = {
          id: String(data.user.id), username: data.user.username, role: data.user.role || 'user',
          must_change_pw: !!data.user.must_change_pw, isPreview: !!data.user.is_preview,
        };
        return { user: _localUser };
      } catch (e) {
        setLocalToken(null);
        _localUser = null;
        return { user: null };
      }
    }

    const { data: { user } } = await getClient().auth.getUser();
    if (!user) { _setUser(null); return { user: null }; }
    await _hydrateUser(user);
    return { user: _user };
  }

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
    } catch (e) { console.warn('[Api] 读取 users 表失败:', e.message); }

    _setUser({
      id: authUser.id,
      username: authUser.user_metadata?.username || fromEmail(authUser.email) || authUser.id,
      email: authUser.email,
      role: profile?.role || 'user',
      must_change_pw: profile?.must_change_pw || false,
      is_preview: profile?.is_preview || false,
    });
    console.log('[Api] 用户信息:', { username: _user?.username, role: _user?.role, is_preview: _user?.is_preview });
  }

  async function init() {
    const autoOk = await tryAutoLogin();
    if (autoOk) return;

    if (LOCAL_MODE) {
      const token = getLocalToken();
      if (token) {
        try { await me(); } catch (e) { setLocalToken(null); }
      }
      return;
    }

    const { data: { session } } = await getClient().auth.getSession();
    if (session && session.user) { await _hydrateUser(session.user); }
    else { _setUser(null); }
  }

  function isAuthed() {
    if (LOCAL_MODE) return !!_localUser;
    return !!_user;
  }

  // ---------- 配置聚合查询 ----------
  async function getConfig() {
    if (LOCAL_MODE) {
      const data = await localFetch('/config');
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
      const mapFarmCrop = (r) => ({
        key: r.key, name: r.name, emoji: r.emoji,
        stages: JSON.parse(r.stages || '[]'),
        minutesPerStage: r.minutes_per_stage || 600,
        sortOrder: r.sort_order,
      });
      const mapFarmPlot = (r) => ({
        id: r.id, x: r.x, y: r.y, z: r.z, scale: r.scale, sortOrder: r.sort_order,
      });
      const mapFarmLand = (r) => ({
        id: r.id, image: r.image, x: r.x, y: r.y, z: r.z, scale: r.scale,
        widthPct: r.width_pct, heightPct: r.height_pct,
        bgThreshold: r.bg_threshold != null ? r.bg_threshold : 30,
      });
      const tabBackgrounds = {
        tab1: 'assets/tab1beijing.png',
        tab2: 'assets/tab-bg/tab2-1787835559183.jpg',
        tab3: 'assets/tab3-garden-bg.jpg',
        tab4: 'assets/dc4b2caadae673cdc65c3779dd78fd70.png',
      };
      (data.tabBackgrounds || []).forEach((r) => {
        if (tabBackgrounds[r.tab_key] !== undefined) {
          const p = r.bg_path;
          if (p && !p.startsWith('assets/')) tabBackgrounds[r.tab_key] = p;
        }
      });
      return {
        appName: data.appName || '予己',
        dailyCoinCap: parseInt(data.dailyCoinCap || '20', 10),
        furnitureCatalog: (data.furnitureCatalog || []).map(mapFurniture),
        defaultRoomLayout: (data.defaultRoomLayout || []).map(mapLayout),
        shopItems: (data.shopItems || []).map(mapShop),
        seedCatalog: (data.seedCatalog || []).map(mapSeed),
        farmCropCatalog: (data.farmCropCatalog || []).map(mapFarmCrop),
        farmPlotLayout: (data.farmPlotLayout || []).map(mapFarmPlot),
        farmLandList: (data.farmLandList || []).map(mapFarmLand),
        farmLandConfig: (data.farmLandList || []).map(mapFarmLand)[0] || null,
        aiConfig: (data.aiConfig || []).map((a) => ({ key: a.key, name: a.name, provider: a.provider, model: a.model, enabled: !!a.enabled })),
        tabBackgrounds,
        defaultCareOptions: (data.defaultCareOptions || []).map((r) => ({
          id: r.id, emoji: r.emoji, label: r.label,
          mode: r.mode, reward: r.reward, sortOrder: r.sort_order,
        })),
        unlockedTypes: (data.furnitureCatalog || []).filter((f) => f.unlocked_by_default).map((f) => f.type),
        serverTime: new Date().toISOString(),
      };
    }

    // Supabase 模式（原逻辑）
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
      { data: farmCrops, error: e9 },
      { data: farmPlots, error: e10 },
      { data: farmLandRows, error: e11 },
    ] = await Promise.all([
      client.from('furniture_catalog').select('*').order('category').order('type'),
      client.from('default_room_layout').select('*').order('sort_order'),
      client.from('shop_items').select('*').order('kind').order('sort_order'),
      client.from('seed_catalog').select('*').order('sort_order'),
      client.from('site_settings').select('key, value'),
      client.from('tab_backgrounds').select('tab_key, bg_path, updated_at'),
      client.from('default_care_options').select('*').order('sort_order').order('id'),
      client.from('ai_config').select('key, name, provider, model, enabled').order('key'),
      client.from('farm_crop_catalog').select('*').order('sort_order'),
      client.from('farm_plot_layout').select('*').order('sort_order'),
      client.from('farm_land_config').select('*').order('sort_order'),
    ]);

    if (e1) console.warn('[Api] furniture_catalog 查询失败', e1.message);
    if (e9) console.warn('[Api] farm_crop_catalog 查询失败', e9.message);

    const settings = {};
    (settingsRows || []).forEach((s) => { settings[s.key] = s.value; });

    const tabBackgrounds = {
      tab1: 'assets/tab1beijing.png',
      tab2: 'assets/tab-bg/tab2-1787835559183.jpg',
      tab3: 'assets/tab3-garden-bg.jpg',
      tab4: 'assets/dc4b2caadae673cdc65c3779dd78fd70.png',
    };
    (tabBgRows || []).forEach((r) => {
      if (tabBackgrounds[r.tab_key] !== undefined) {
        const p = r.bg_path;
        if (p && !p.startsWith('assets/')) tabBackgrounds[r.tab_key] = p;
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
    const mapFarmCrop = (r) => ({
      key: r.key, name: r.name, emoji: r.emoji,
      stages: JSON.parse(r.stages || '[]'),
      minutesPerStage: r.minutes_per_stage || 600,
      sortOrder: r.sort_order,
    });
    const mapFarmPlot = (r) => ({
      id: r.id, x: r.x, y: r.y, z: r.z, scale: r.scale, sortOrder: r.sort_order,
    });
    const mapFarmLand = (r) => ({
      id: r.id, image: r.image, x: r.x, y: r.y, z: r.z, scale: r.scale,
      widthPct: r.width_pct, heightPct: r.height_pct,
      bgThreshold: r.bg_threshold != null ? r.bg_threshold : 30,
    });

    if (e8) console.warn('[Api] ai_config 查询失败', e8.message);

    const defaultAIConfig = [
      { key: 'letter',      name: '小我信件',     provider: 'openai', model: 'gpt-4o-mini', enabled: true },
      { key: 'self_manual', name: '自我说明书',   provider: 'openai', model: 'gpt-4o-mini', enabled: true },
      { key: 'insight',     name: '自我洞察',     provider: 'openai', model: 'gpt-4o-mini', enabled: true },
      { key: 'furni_story', name: '家具经历',     provider: 'openai', model: 'gpt-4o-mini', enabled: true },
      { key: 'diaryguide',  name: '日记引导',     provider: 'openai', model: 'gpt-4o-mini', enabled: true },
      { key: 'whisper',     name: '本心对语',     provider: 'openai', model: 'gpt-4o-mini', enabled: true },
    ];

    const aiConfig = (aiRows && aiRows.length > 0)
      ? aiRows.map((a) => ({ key: a.key, name: a.name, provider: a.provider, model: a.model, enabled: !!a.enabled }))
      : defaultAIConfig;

    return {
      appName: settings.appName || '予己',
      dailyCoinCap: parseInt(settings.dailyCoinCap || '20', 10),
      furnitureCatalog: (furniture || []).map(mapFurniture),
      defaultRoomLayout: (layout || []).map(mapLayout),
      shopItems: (shop || []).map(mapShop),
      seedCatalog: (seeds || []).map(mapSeed),
      farmCropCatalog: (farmCrops || []).map(mapFarmCrop),
      farmPlotLayout: (farmPlots || []).map(mapFarmPlot),
      farmLandList: (farmLandRows || []).map(mapFarmLand),
      farmLandConfig: (farmLandRows || []).map(mapFarmLand)[0] || null,
      aiConfig,
      tabBackgrounds,
      defaultCareOptions: (careRows || []).map((r) => ({
        id: r.id, emoji: r.emoji, label: r.label,
        mode: r.mode, reward: r.reward, sortOrder: r.sort_order,
      })),
      unlockedTypes: (furniture || []).filter((f) => f.unlocked_by_default).map((f) => f.type),
      serverTime: new Date().toISOString(),
    };
  }

  // ---------- 用户状态 ----------
  async function getState() {
    if (LOCAL_MODE) {
      try {
        const data = await localFetch('/state');
        return { data: data.data, updated_at: data.updated_at };
      } catch (e) {
        return { data: null, updated_at: null };
      }
    }
    const { data, error } = await getClient().from('user_state').select('data, updated_at').maybeSingle();
    if (error) throw new Error(error.message);
    return { data: data ? JSON.parse(data.data) : null, updated_at: data?.updated_at };
  }

  async function saveState(state) {
    if (LOCAL_MODE) {
      return await localFetch('/state', { method: 'PUT', body: { data: state } });
    }
    const { data: { user } } = await getClient().auth.getUser();
    if (!user) throw new Error('未登录');
    const { error } = await getClient().from('user_state').upsert({
      user_id: user.id, data: JSON.stringify(state), updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  // ---------- AI ----------
  // sources: 允许 AI 读取的数据源 id 列表（前端隐私开关）。透传给后端 getContext 做过滤。
  async function callAI(agent, messages, temperature, sources) {
    if (LOCAL_MODE) {
      const body = { messages };
      if (temperature !== undefined) body.temperature = temperature;
      if (sources) body.sources = sources;
      return await localFetch('/ai/' + agent, { method: 'POST', body });
    }
    const body = { messages };
    if (temperature !== undefined) body.temperature = temperature;
    if (sources) body.sources = sources;
    const { data, error } = await getClient().functions.invoke('ai-agent/' + agent, { body });
    if (error) throw new Error(error.message || 'AI 调用失败');
    return data;
  }

  async function getChains() {
    if (LOCAL_MODE) {
      return await localFetch('/ai/chains');
    }
    return {
      chains: [
        { key: 'insight_letter', name: '洞察写信', description: '先分析用户的情绪记录生成洞察，再用洞察结果辅助写一封温暖的信' },
        { key: 'insight_manual', name: '洞察更新说明书', description: '分析用户近期记录，用洞察更新《自我说明书》各章节内容' },
      ],
    };
  }

  async function callChain(chainName, messages, sources, temperature) {
    if (LOCAL_MODE) {
      const body = { chain: chainName };
      if (messages) body.messages = messages;
      if (sources) body.sources = sources;
      if (temperature !== undefined) body.temperature = temperature;
      return await localFetch('/ai/chain', { method: 'POST', body });
    }
    const body = { chain: chainName };
    if (messages) body.messages = messages;
    if (sources) body.sources = sources;
    if (temperature !== undefined) body.temperature = temperature;
    const { data, error } = await getClient().functions.invoke('ai-chain', { body });
    if (error) throw new Error(error.message || '编排链调用失败');
    return data;
  }

  // ---------- Storage ----------
  async function uploadFile(bucket, filePath, file) {
    if (LOCAL_MODE) {
      throw new Error('本地模式暂不支持文件上传');
    }
    const { data, error } = await getClient().storage.from(bucket).upload(filePath, file, { upsert: true });
    if (error) throw new Error(error.message);
    const { data: urlData } = getClient().storage.from(bucket).getPublicUrl(data.path);
    return { path: data.path, publicUrl: urlData.publicUrl };
  }

  // ---------- Tab4: star-miner ----------
  async function callStarMiner() {
    if (LOCAL_MODE) {
      console.warn('[Api] star-miner 在本地模式下未实现');
      return { stars: [] };
    }
    const { data: sessionData } = await getClient().auth.getSession();
    if (!sessionData?.session?.access_token) throw new Error('未登录，无法挖掘星星');
    const { data, error } = await getClient().functions.invoke('star-miner', { body: {} });
    if (error) throw new Error(error.message || 'star-miner 调用失败');
    return data || { stars: [] };
  }

  // ---------- 导出 ----------
  return {
    init, getClient,
    isAuthed, isPreview,
    getUser,
    login, register, logout, me,
    getConfig, getState, saveState,
    callAI, getChains, callChain,
    callStarMiner,
    uploadFile,
  };
})();
