/* ============================================================
   Tab2 遇见·内心森林
   ============================================================ */

const Tab2 = (() => {

  function init() {
    bindEvents();
    // 森林萤火氛围
    Utils.spawnParticles(document.getElementById('forestMotes'), {
      count: 14,
      color: 'rgba(200, 250, 210, 0.6)',
      size: 5,
      rise: 70,
    });
  }

  function bindEvents() {
    document.querySelectorAll('.forest-objects .fobj').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.popup;
        Popups.open(p);
      });
    });
  }

  return { init };
})();
