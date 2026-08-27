/* ============================================================
   工具函数
   ============================================================ */

const Utils = (() => {

  // Toast
  let toastTimer = null;
  function toast(text, duration = 1800) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  // 时间格式
  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function nowTs() {
    return new Date().toISOString();
  }

  function formatDate(iso) {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}-${day}`;
  }

  function formatFullDate(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${formatDate(iso)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // ID
  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  // 随机 ID 短码
  function shortId() {
    return Math.random().toString(36).slice(2, 6);
  }

  // 数组随机
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // 数字千分位
  function fmt(n) {
    return String(n);
  }

  // 计算舒适值（合成）
  function recalcComfort() {
    const s = State.state;
    s.comfortValue = Math.floor((s.healthValue + s.happinessValue) / 2);
    State.save();
  }

  // ============================================================
  // 环境粒子生成器：给场景层加氛围（光点/尘埃/蝴蝶/萤火）
  // opts: { count, cls, color, size, emoji, chars, rise }
  // ============================================================
  function spawnParticles(container, opts = {}) {
    if (!container) return;
    const {
      count = 10,
      cls = 'mote',
      color = 'rgba(255,240,200,0.6)',
      size = 6,
      emoji = false,
      chars = null,
      rise = 90,
    } = opts;
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'env-particle ' + cls;
      el.style.left = (Math.random() * 96 + 2) + '%';
      el.style.top = (Math.random() * 90 + 5) + '%';
      el.style.animationDelay = (Math.random() * 10) + 's';
      el.style.animationDuration = (7 + Math.random() * 8) + 's';
      el.style.setProperty('--rise', '-' + (rise * (0.7 + Math.random() * 0.6)) + 'px');
      if (emoji) {
        el.textContent = chars ? Utils.pick(chars) : '✦';
        el.style.width = el.style.height = (size * (0.8 + Math.random() * 0.5)) + 'px';
        el.style.fontSize = el.style.width;
        el.style.lineHeight = el.style.height;
        el.style.background = 'none';
        el.style.opacity = 0.4 + Math.random() * 0.6;
      } else {
        const s = size * (0.6 + Math.random() * 0.9);
        el.style.width = el.style.height = s + 'px';
        el.style.background = color;
        el.style.opacity = 0.2 + Math.random() * 0.5;
      }
      container.appendChild(el);
    }
  }

  return {
    toast,
    today,
    nowTs,
    formatDate,
    formatFullDate,
    uid,
    shortId,
    pick,
    fmt,
    recalcComfort,
    spawnParticles,
  };
})();
