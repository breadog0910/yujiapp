/* ============================================================
   主入口 / Tab 导航
   ============================================================ */

(async function init() {

  // ============================================================
  // 应用容器自适应：已移除手机壳缩放，仅保留移动端检测
  // ============================================================
  function fitPhone() {
    // 旧版 --frame-scale 已不再使用；保留函数供未来扩展
    document.documentElement.style.setProperty('--frame-scale', '1');
  }
  window.addEventListener('resize', fitPhone);
  window.addEventListener('orientationchange', () => setTimeout(fitPhone, 200));
  fitPhone();

  // 启动遮罩（配置 + 状态加载期间）
  const bootMask = document.createElement('div');
  bootMask.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:#f5e8d4;color:#b9824e;font-size:15px;font-family:system-ui,sans-serif;';
  bootMask.textContent = '正在准备你的小屋…';
  document.body.appendChild(bootMask);

  // 8 秒兜底超时：Supabase 网络 hang 住时强制移除 bootMask，避免永久卡死
  let bootMaskRemoved = false;
  const bootTimeout = setTimeout(() => {
    if (bootMaskRemoved) return;
    bootMaskRemoved = true;
    try { bootMask.remove(); } catch (_) {}
    console.warn('[boot] 初始化超时（8s），已强制移除启动遮罩');
  }, 8000);
  function removeBootMask() {
    if (bootMaskRemoved) return;
    bootMaskRemoved = true;
    clearTimeout(bootTimeout);
    try { bootMask.remove(); } catch (_) {}
  }

  // 先恢复 Supabase 会话（若有）
  try { await Api.init(); } catch (e) {
    console.error('[boot] Api.init 失败:', e);
  }

  // 未登录 → 显示登录/注册遮罩；成功登录后原地重新初始化
  if (!State.isAuthed()) {
    Account.showLogin(async () => {
      try {
        await State.init();
      } catch (e) {
        console.warn('[boot] 登录后 State.init 失败', e);
      }
      Account.renderChip();
      // 刷新当前可见 Tab
      const activeTab = document.querySelector('.tab-panel.active');
      if (activeTab) {
        const tabId = activeTab.id;
        if (tabId === 'tab1') Tab1.refresh();
        if (tabId === 'tab3') Tab3.refresh();
        if (tabId === 'tab4') Tab4.refresh();
      }
      Utils.toast('登录成功！');
    });
    // 仍初始化 Tab（登录遮罩下不可见，但保证登录后能直接渲染）
    bootApp();
    removeBootMask();
    return;
  }

  // 多用户初始化：拉配置 + 状态加载
  try {
    await State.init();
  } catch (e) {
    console.warn('[boot] State.init 失败', e);
  }
  removeBootMask();

  bootApp();
  Account.renderChip();

  // 预览模式：显示持久标识 + 提示
  if (Api.isPreview()) {
    showPreviewBadge();
    setTimeout(() => Utils.toast('🔄 预览模式 · 后台改布置会自动同步到此页面'), 600);
  }

  bootApp();

  function showPreviewBadge() {
    const badge = document.createElement('div');
    badge.id = 'yujiPreviewBadge';
    badge.textContent = '🔄 预览';
    badge.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9990;'
      + 'background:rgba(95,160,120,.92);color:#fff;font-size:12px;font-family:system-ui,sans-serif;'
      + 'padding:3px 14px;border-radius:0 0 10px 10px;box-shadow:0 2px 8px rgba(0,0,0,.18);'
      + 'pointer-events:none;letter-spacing:1px;font-weight:600;';
    document.body.appendChild(badge);
  }

  function bootApp() {
    try {
      // Tab 切换（先绑定 tab-bar，即使下面某个 Tab.init 抛异常，tab 键也能正常点）
      const tabBtns = document.querySelectorAll('.tab-btn');
      const tabPanels = document.querySelectorAll('.tab-panel');
      function switchTab(target) {
        tabBtns.forEach(b => b.classList.toggle('active', b.dataset.target === target));
        tabPanels.forEach(p => p.classList.toggle('active', p.id === target));
        // 账号菜单按钮（右上角齿轮）只在 tab1 显示
        const acctFab = document.getElementById('yujiAcctFab');
        const acctMenu = document.getElementById('yujiAcctMenu');
        if (acctFab) acctFab.style.display = (target === 'tab1') ? '' : 'none';
        if (target !== 'tab1' && acctMenu) acctMenu.style.display = 'none';
        // 触发各 Tab 的 refresh（单项 try/catch：坏掉一个 Tab 不影响别的切换）
        try {
          if (target === 'tab1') { if (typeof Tab1 !== 'undefined') Tab1.refresh(); }
          if (target === 'tab2') {
            if (typeof Tab2 !== 'undefined') {
              try { Tab2.renderEntry(); } catch (e) { console.warn('[switchTab] Tab2.renderEntry 失败:', e); }
              try { Tab2.renderTreeholeEntry(); } catch (e) { console.warn('[switchTab] Tab2.renderTreeholeEntry 失败:', e); }
            }
          }
          if (target === 'tab3') { if (typeof Tab3 !== 'undefined' && Tab3.refresh) Tab3.refresh(); }
          if (target === 'tab4') { if (typeof Tab4 !== 'undefined') Tab4.refresh(); }
        } catch (e) { console.warn('[switchTab] refresh 异常（已忽略）：', e); }
      }
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          try { switchTab(btn.dataset.target); }
          catch (e) { console.warn('[tab] click 异常：', e); }
        });
      });

      // 各 Tab 初始化（单项 try/catch：一项挂不影响剩余，也不影响 tab 已绑定好的切换）
      try { if (typeof Tab1 !== 'undefined') Tab1.init(); } catch (e) { console.error('[Tab1.init 失败]', e); }
      try { if (typeof Tab2 !== 'undefined') Tab2.init(); } catch (e) { console.error('[Tab2.init 失败]', e); }
      try { if (typeof Tab3 !== 'undefined') Tab3.init(); } catch (e) { console.error('[Tab3.init 失败]', e); }
      try { if (typeof Tab4 !== 'undefined') Tab4.init(); } catch (e) { console.error('[Tab4.init 失败]', e); }

      // 首次访问欢迎
      try {
        const s = State.state;
        if (s && s.visitDates && s.visitDates.length <= 1) {
          setTimeout(() => Utils.toast('欢迎来到「予己」 · 好好爱自己，慢慢成为自己'), 400);
        } else {
          setTimeout(() => Utils.toast('你回来啦。不用急着做什么，先看看现在的自己就好。'), 400);
        }
      } catch (_) {}

      // 调试用：双击底部 tab-bar 区域可重置数据
      try {
        document.querySelector('.tab-bar')?.addEventListener('dblclick', () => {
          if (confirm('确定要重置所有数据吗？')) { State.reset(); location.reload(); }
        });
      } catch (_) {}

      // 控制台签名
      console.log('%c予己 v0.1', 'font-size:18px;color:#d4a574;font-weight:bold;');
      console.log('好好爱自己，慢慢成为自己。');
    } catch (e) {
      console.error('[bootApp] 致命错误（tab 切换已尽量保证）：', e);
    }
  }
})();
