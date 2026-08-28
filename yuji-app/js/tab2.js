/* ============================================================
   Tab2 遇见·内心森林 —— 本心对语 + 心灵树洞
   - 本心对语：点击森林木牌，与"小我"通信：倾诉烦恼、心事、情绪
   - 心灵树洞：点击心灵树洞木牌，记录日记；可勾选 AI 引导，通过问题引导写作并附上 AI 回应
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

  // 心灵树洞入口木牌（同本心对语模式）
  function renderTreeholeEntry() {
    const btn = document.getElementById('treeholeEntry');
    if (!btn) return;
    const e = (State.treeholeEntry) || {};
    const img = btn.querySelector('.tab2-entry-img');
    if (img && e.icon) img.src = e.icon;
    btn.style.left = (e.x != null ? e.x : 72) + '%';
    btn.style.bottom = (e.y != null ? e.y : 32) + '%';
    btn.style.zIndex = 10 + (e.z != null ? e.z : 6);
    if (e.scale) btn.style.setProperty('--entry-scale', e.scale);
  }

  function init() {
    renderEntry();
    renderTreeholeEntry();
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
    // 点击心灵树洞 → 打开「心灵树洞」日记面板
    document.getElementById('treeholeEntry')?.addEventListener('click', () => {
      Popups.open('treehole');
    });
  }

  return { init, renderEntry, renderTreeholeEntry };
})();