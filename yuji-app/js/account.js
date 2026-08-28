/* ============================================================
   账号 UI：登录 / 注册 / 退出
   - 未登录时显示全屏遮罩；登录成功回调（main 里 reload）
   - 已登录时在 .app-container 右上角放一个浮层齿轮按钮
     （绝对定位、明显可见，点开显示用户名 + 退出菜单）
   ============================================================ */
const Account = (() => {
  // 注入样式（一次）
  let styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    const css = `
    /* ========== 登录/注册遮罩 ========== */
    .yuji-auth-mask{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
      background:radial-gradient(circle at 50% 30%, #fbeede, #e9d3b3);font-family:'ZCOOL KuaiLe',system-ui,sans-serif;}
    .yuji-auth-card{width:340px;max-width:90vw;background:#fffaf2;border:3px solid #e3c79c;border-radius:18px;
      box-shadow:0 12px 40px rgba(150,110,60,.25);padding:26px 24px;}
    .yuji-auth-logo{text-align:center;font-size:22px;color:#b9824e;margin-bottom:4px;}
    .yuji-auth-sub{text-align:center;font-size:13px;color:#9a7b54;margin-bottom:18px;}
    .yuji-auth-tabs{display:flex;gap:8px;margin-bottom:16px;}
    .yuji-auth-tabs button{flex:1;padding:8px 0;border:2px solid #e3c79c;background:#fff;color:#9a7b54;
      border-radius:10px;cursor:pointer;font-family:inherit;font-size:14px;}
    .yuji-auth-tabs button.active{background:#f3e0c2;color:#7a5530;border-color:#d4a574;}
    .yuji-auth-card input{width:100%;box-sizing:border-box;padding:11px 12px;margin-bottom:12px;border:2px solid #ecdcc0;
      border-radius:10px;font-family:inherit;font-size:15px;background:#fffdf9;color:#5a3a20;}
    .yuji-auth-card input:focus{outline:none;border-color:#d4a574;}
    .yuji-auth-card .err{color:#c0492f;font-size:13px;min-height:18px;margin:-6px 0 10px;text-align:center;}
    .yuji-remember-row{display:flex;align-items:center;gap:6px;margin:-6px 0 12px;cursor:pointer;font-size:13px;color:#7a5530;user-select:none;}
    .yuji-remember-row input{width:16px;height:16px;margin:0;accent-color:#d4a574;cursor:pointer;}
    .yuji-auth-card button.primary{width:100%;padding:12px;border:none;border-radius:12px;background:#d4a574;color:#fff;
      font-family:inherit;font-size:16px;cursor:pointer;box-shadow:0 4px 0 #b9824e;}
    .yuji-auth-card button.primary:active{transform:translateY(2px);box-shadow:0 2px 0 #b9824e;}
    .yuji-auth-hint{text-align:center;font-size:12px;color:#a98a63;margin-top:14px;}

    /* ========== 浮层账号菜单（右上角齿轮） ========== */
    /* 附在 .app-container 上，绝对定位在状态栏下面右侧 */
    .yuji-acct-fab{
      position:absolute;top:32px;right:14px;z-index:50;
      width:36px;height:36px;border-radius:50%;
      background:rgba(255,251,242,.92);border:1.5px solid rgba(180,140,90,.55);
      box-shadow:0 2px 6px rgba(120,80,30,.18);
      display:flex;align-items:center;justify-content:center;
      font-size:18px;cursor:pointer;
      font-family:'ZCOOL KuaiLe',system-ui,sans-serif;
      color:#7a5530;line-height:1;
      /* 关键：脱离 #app 的 pointer-events:none */
      pointer-events:auto;
    }
    .yuji-acct-fab:hover{background:#fff;border-color:#d4a574;}
    .yuji-acct-fab:active{transform:scale(.92);}
    .yuji-acct-fab .badge{
      position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;
      background:#3f7a5a;border:2px solid #fffaf2;font-size:0;
    }
    .yuji-acct-fab.preview{background:rgba(220,240,225,.92);border-color:rgba(95,160,120,.55);}

    /* 下拉菜单 */
    .yuji-acct-menu{
      position:absolute;top:74px;right:14px;z-index:60;
      width:200px;background:#fffaf2;border:2px solid #e3c79c;border-radius:14px;
      box-shadow:0 8px 24px rgba(120,80,30,.22);padding:10px 12px;
      font-family:'ZCOOL KuaiLe',system-ui,sans-serif;
      pointer-events:auto;
    }
    .yuji-acct-menu .who{
      display:flex;align-items:center;gap:8px;padding:6px 4px 10px;
      border-bottom:1px dashed #e3c79c;margin-bottom:8px;color:#5a3a20;font-size:14px;
    }
    .yuji-acct-menu .who .pv{
      font-size:11px;color:#3f7a5a;background:rgba(143,196,160,.25);padding:2px 6px;border-radius:6px;
      border:1px solid rgba(95,160,120,.4);font-weight:600;
    }
    .yuji-acct-menu .who b{flex:1;font-weight:600;word-break:break-all;}
    .yuji-acct-menu button.go{
      width:100%;padding:9px;border:none;border-radius:10px;
      background:#d4a574;color:#fff;cursor:pointer;font-size:14px;font-family:inherit;
      box-shadow:0 3px 0 #b9824e;
    }
    .yuji-acct-menu button.go:hover{background:#e0b17e;}
    .yuji-acct-menu button.go:active{transform:translateY(2px);box-shadow:0 1px 0 #b9824e;}
    .yuji-acct-menu .meta{font-size:11px;color:#a98a63;margin-top:8px;line-height:1.4;text-align:center;}
    `;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }

  // 登录/注册遮罩
  function showLogin(onSuccess) {
    injectStyle();
    const mask = document.createElement('div');
    mask.className = 'yuji-auth-mask';
    mask.id = 'yujiAuthMask';
    mask.innerHTML = `
      <div class="yuji-auth-card">
        <div class="yuji-auth-logo">予己 · 好好爱自己</div>
        <div class="yuji-auth-sub">登录后即可在不同设备继续你的小屋</div>
        <div class="yuji-auth-tabs">
          <button data-mode="login" class="active">登录</button>
          <button data-mode="register">注册</button>
        </div>
        <input id="yujiUser" type="text" placeholder="用户名（≥2 字）" maxlength="20" autocomplete="username" />
        <input id="yujiPwd" type="password" placeholder="密码（≥6 位）" maxlength="40" autocomplete="current-password" />
        <label class="yuji-remember-row">
          <input type="checkbox" id="yujiRemember" checked />
          <span>记住我（下次自动登录）</span>
        </label>
        <div class="err" id="yujiErr"></div>
        <button class="primary" id="yujiSubmit">登 录</button>
        <div class="yuji-auth-hint">还没有账号？点上方「注册」即可创建</div>
      </div>
    `;
    document.body.appendChild(mask);

    let mode = 'login';
    const userEl = mask.querySelector('#yujiUser');
    const pwdEl = mask.querySelector('#yujiPwd');
    const errEl = mask.querySelector('#yujiErr');
    const submitEl = mask.querySelector('#yujiSubmit');
    const rememberEl = mask.querySelector('#yujiRemember');

    mask.querySelectorAll('.yuji-auth-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode;
        mask.querySelectorAll('.yuji-auth-tabs button').forEach(b => b.classList.toggle('active', b === btn));
        submitEl.textContent = mode === 'login' ? '登 录' : '注 册';
        errEl.textContent = '';
      });
    });

    async function doSubmit() {
      const username = userEl.value.trim();
      const password = pwdEl.value;
      const remember = rememberEl.checked;
      errEl.textContent = '';
      if (username.length < 2) { errEl.textContent = '用户名至少 2 个字符'; return; }
      if (password.length < 6) { errEl.textContent = '密码至少 6 位'; return; }
      submitEl.disabled = true;
      try {
        if (mode === 'login') await Api.login(username, password, remember);
        else await Api.register(username, password);
        mask.remove();
        if (typeof onSuccess === 'function') onSuccess();
      } catch (e) {
        errEl.textContent = e.message || '操作失败';
      } finally {
        submitEl.disabled = false;
      }
    }
    submitEl.addEventListener('click', doSubmit);
    [userEl, pwdEl].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') doSubmit(); }));
    userEl.focus();
  }

  // ======== 浮层账号按钮（右上角齿轮，状态栏之下） ========
  async function renderChip() {
    if (!Api.isAuthed()) return;
    injectStyle();

    // 已有则先清掉
    document.getElementById('yujiAcctFab')?.remove();
    document.getElementById('yujiAcctMenu')?.remove();

    let info = { user: { username: '我' } };
    try { info = await Api.me(); } catch (e) { /* 取不到就走默认 */ }
    const isPreview = !!(info.user && info.user.isPreview);

    // 容器加 position:relative（FAB 绝对定位需要）
    const root = document.querySelector('.app-container');
    if (!root) return;
    if (getComputedStyle(root).position === 'static') {
      root.style.position = 'relative';
    }

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'yujiAcctFab';
    fab.className = 'yuji-acct-fab' + (isPreview ? ' preview' : '');
    fab.setAttribute('aria-label', '账号菜单');
    fab.title = isPreview ? '预览账号 · 点开看账号 / 退出' : '账号菜单';
    fab.textContent = '⚙';
    if (isPreview) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.title = '预览账号';
      fab.appendChild(badge);
    }
    root.appendChild(fab);

    const menu = document.createElement('div');
    menu.id = 'yujiAcctMenu';
    menu.className = 'yuji-acct-menu';
    menu.style.display = 'none';
    menu.innerHTML = `
      <div class="who">
        ${isPreview ? '<span class="pv">🔄 预览</span>' : ''}
        <b>${escapeHtml(info.user.username || '我')}</b>
      </div>
      <button type="button" class="go" id="yujiGoLogout">退出登录</button>
      <div class="meta">
        ${isPreview ? '预览账号：永远反映后台默认房间，<br>不保存个人进度。'
                    : '当前账号的操作进度会同步到云端。'}
      </div>
    `;
    root.appendChild(menu);

    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.style.display = (menu.style.display === 'none') ? 'block' : 'none';
    });
    menu.querySelector('#yujiGoLogout').addEventListener('click', async (e) => {
      e.stopPropagation();
      // 直接退出；失败也没关系——本地会清掉
      try { await Api.logout(); } catch (err) { console.warn('[Account] 后端 logout 失败：', err); }
      location.reload();
    });
    // 点其它地方收起菜单
    document.addEventListener('click', () => { menu.style.display = 'none'; });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { showLogin, renderChip };
})();
