/* ============================================================
   Tab2 遇见·内心森林 —— 本心对语
   用户点击森林木牌，与"小我"通信：倾诉烦恼、心事、情绪，
   小我不定时回信，结合近期自我照顾事例给鼓励与陪伴
   ============================================================ */

const Tab2 = (() => {

  // 入口木牌：按后台 tab2Entry 配置渲染（位置/缩放/图标，逻辑同 Tab1 家具）
  function renderEntry() {
    const btn = document.getElementById('dialogueEntry');
    if (!btn) return;
    const e = (State.tab2Entry) || {};
    const img = btn.querySelector('.tab2-entry-img');
    if (img && e.icon) img.src = e.icon;
    btn.style.left = (e.x != null ? e.x : 18) + '%';
    btn.style.bottom = (e.y != null ? e.y : 34) + '%';
    btn.style.zIndex = 10 + (e.z != null ? e.z : 6);
    if (e.scale) btn.style.setProperty('--entry-scale', e.scale);
  }

  function init() {
    renderEntry();
    // 森林萤火氛围
    Utils.spawnParticles(document.getElementById('forestMotes'), {
      count: 14,
      color: 'rgba(200, 250, 210, 0.6)',
      size: 5,
      rise: 70,
    });
    // 点击木牌 → 打开「本心对语」
    document.getElementById('dialogueEntry')?.addEventListener('click', () => {
      Popups.open('dialogue');
    });
  }

  return { init, renderEntry };
})();