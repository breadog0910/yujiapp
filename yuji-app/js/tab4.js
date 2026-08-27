/* ============================================================
   Tab4 星迹·个人宇宙
   ============================================================ */

const Tab4 = (() => {

  function init() {
    renderStars();
    bindEvents();
  }

  function bindEvents() {
    document.querySelectorAll('.stars-objects .sobj').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.popup;
        Popups.open(p);
      });
    });
  }

  // 渲染星点（基于 state.starPoints）
  function renderStars() {
    const overlay = document.getElementById('starsOverlay');
    if (!overlay) return;
    overlay.innerHTML = '';
    const points = State.state.starPoints;
    // 限制数量避免拥挤
    const visible = points.slice(-30);
    visible.forEach((p, i) => {
      const star = document.createElement('div');
      star.className = 'star' + (p.importance >= 3 ? ' huge' : p.importance === 2 ? ' big' : '');
      // 撒点位置：避开中心标题和物件
      const x = 8 + Math.random() * 84;
      const y = 8 + Math.random() * 80;
      star.style.left = x + '%';
      star.style.top = y + '%';
      star.style.animationDelay = (Math.random() * 3) + 's';
      star.title = p.title;
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        Popups.open('starDetail', { id: p.id });
      });
      overlay.appendChild(star);
    });
  }

  function refresh() {
    renderStars();
  }

  // 手动创建星点
  function addStarPoint({ title, desc, importance = 1 }) {
    State.state.starPoints.push({
      id: Utils.uid(),
      date: Utils.nowTs(),
      type: 'manual',
      title,
      desc,
      importance,
    });
    State.save();
    renderStars();
  }

  return { init, refresh, addStarPoint, renderStars };
})();
