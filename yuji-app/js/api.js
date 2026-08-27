/* ============================================================
   前端通信层：账号 / 配置 / 状态 / AI
   - 游戏前端多用户化的唯一网络出口
   - token 存于 localStorage；所有请求自动带 Bearer
   ============================================================ */
const Api = (() => {
  const TOKEN_KEY = 'yuji_token';
  const API_BASE = ''; // 同源：浏览器自动用当前 origin

  // ---------- token ----------
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }
  function isAuthed() { return !!getToken(); }

  // ---------- 当前用户（login/register/me 时填充） ----------
  let _user = null;
  function getUser() { return _user; }
  function isPreview() { return !!(getToken() && _user && _user.isPreview); }
  function _setUser(u) { _user = u || null; }

  // ---------- 通用请求 ----------
  async function request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const t = getToken();
      if (!t) throw new Error('未登录');
      headers['Authorization'] = 'Bearer ' + t;
    }
    let res;
    try {
      res = await fetch(API_BASE + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      // fetch 网络层失败（服务挂了 / 网络隔离 / CORS / Mixed content）
      console.error('[Api] fetch 失败', method, path, e && (e.message || e));
      throw new Error('网络请求失败（服务可能未启动或网络被拦截）：' + (e && e.message || e));
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* 可能无 body */ }
    if (!res.ok) {
      const msg = (data && data.error) || ('请求失败 ' + res.status);
      console.warn('[Api] 业务错误', method, path, res.status, msg);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- 账号 ----------
  async function login(username, password) {
    const d = await request('/api/auth/login', { method: 'POST', body: { username, password }, auth: false });
    if (d.token) setToken(d.token);
    _setUser(d.user);
    return d;
  }
  async function register(username, password) {
    const d = await request('/api/auth/register', { method: 'POST', body: { username, password }, auth: false });
    if (d.token) setToken(d.token);
    _setUser(d.user);
    return d;
  }
  async function logout() {
    try { await request('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    setToken('');
    _setUser(null);
  }
  async function me() {
    const d = await request('/api/auth/me', { method: 'GET' });
    _setUser(d && d.user);
    return d;
  }

  // ---------- 配置（公开） ----------
  async function getConfig() {
    return request('/api/config', { method: 'GET', auth: false });
  }

  // ---------- 用户状态（多用户核心） ----------
  async function getState() {
    return request('/api/state', { method: 'GET' });
  }
  async function saveState(state) {
    return request('/api/state', { method: 'PUT', body: { data: state } });
  }

  // ---------- AI（按配置调用外部模型） ----------
  async function callAI(agent, messages, temperature) {
    const body = { messages };
    if (temperature !== undefined) body.temperature = temperature;
    return request('/api/ai/' + agent, { method: 'POST', body });
  }

  // ---------- 多智能体编排 ----------
  /** 获取可用编排链列表 */
  async function getChains() {
    return request('/api/ai/chains', { method: 'GET' });
  }
  /** 执行编排链，自动串联多个智能体 */
  async function callChain(chainName, messages, temperature) {
    const body = { chain: chainName };
    if (messages) body.messages = messages;
    if (temperature !== undefined) body.temperature = temperature;
    return request('/api/ai/chain', { method: 'POST', body });
  }

  return {
    getToken, setToken, isAuthed,
    getUser, isPreview,
    request,
    login, register, logout, me,
    getConfig, getState, saveState,
    callAI,
    getChains, callChain,
  };
})();
