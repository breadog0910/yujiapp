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

  // 先恢复 Supabase 会话（若有）
  try { await Api.init(); } catch (e) {
    console.error('[boot] Api.init 失败:', e);
  }

  // 多用户初始化：拉配置 + 拉账号状态（未登录则离线兜底）
  try {
    await State.init();
  } catch (e) {
    console.warn('[boot] State.init 失败', e);
  }
  bootMask.remove();

  // 未登录 → 显示登录/注册遮罩；成功登录后原地重新初始化（不刷新页面，避免 session 丢失）
  if (!State.isAuthed()) {
    Account.showLogin(async () => {
      // 登录后 session 已在 Supabase 客户端内存中，无需刷新页面
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
        if (tabId === 'tab3') Tab3.renderPlots();
        if (tabId === 'tab4') Tab4.refresh();
      }
      Utils.toast('登录成功！');
    });
    // 仍初始化 Tab（登录遮罩下不可见，但保证登录后能直接渲染）
    bootApp();
    return;
  }

  Account.renderChip();
  bootApp();

  function bootApp() {
    // Tab 切换
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    function switchTab(target) {
      tabBtns.forEach(b => b.classList.toggle('active', b.dataset.target === target));
      tabPanels.forEach(p => p.classList.toggle('active', p.id === target));
      // 触发各 Tab 的 refresh
      if (target === 'tab1') Tab1.refresh();
      if (target === 'tab3') Tab3.renderPlots();
      if (target === 'tab4') Tab4.refresh();
    }

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.target));
    });

    // 各 Tab 初始化
    Tab1.init();
    Tab2.init();
    Tab3.init();
    Tab4.init();

    // 首次访问欢迎
    const s = State.state;
    if (s.visitDates.length <= 1) {
      setTimeout(() => Utils.toast('欢迎来到「予己」 · 好好爱自己，慢慢成为自己'), 400);
    } else {
      setTimeout(() => Utils.toast('你回来啦。不用急着做什么，先看看现在的自己就好。'), 400);
    }

    // 帮助按钮 (双击屏幕中央触发)
    let tapCount = 0;
    let tapTimer = null;
    document.getElementById('app').addEventListener('click', e => {
      // 只在非交互区域触发
      if (e.target.closest('button, .care-opt, .seed-item, .shop-item, .timeline-item, .obj, .fobj, .sobj, .plot, .xiaowo, .popup')) return;
      tapCount++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => tapCount = 0, 600);
      if (tapCount >= 3) {
        tapCount = 0;
        // 三击屏幕中央：打开成长档案
        Popups.open('archive');
      }
    });

    // 调试用：双击底部 logo 区域可重置数据
    document.querySelector('.status-bar')?.addEventListener('dblclick', () => {
      if (confirm('确定要重置所有数据吗？')) {
        State.reset();
        location.reload();
      }
    });

    // 控制台签名
    console.log('%c予己 v0.1', 'font-size:18px;color:#d4a574;font-weight:bold;');
    console.log('好好爱自己，慢慢成为自己。');
  }

})();
