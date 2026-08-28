/* ============================================================
   Tab3 生长·技能农场
   - 土地底图：State.tabBackgrounds.tab3（<img class="tab3-bg">）
   - 格子槽位：State.farmPlotLayout（百分比绝对定位叠加在土地上）
   - 作物阶段图：State.farmCropCatalog[key].stages[stage].image
   - 成长：progress = Σsessions.minutes + Σ(completed goals).points
           stage = min(floor(progress/minutesPerStage), stages.length-1)
   - 交互：空格子→farmPlant；已占→farmLog
   ============================================================ */

const Tab3 = (() => {
  const ASSET_FALLBACK = 'assets/field/crop-s1.png';
  let lastStages = {};

  function renderLandLayer() {
    const el = document.getElementById('farmLandLayer');
    if (!el) return;
    const cfg = State.farmLandConfig;
    if (!cfg) return;
    el.src = cfg.image;
    el.style.display = 'block';
    // 用中心百分比定位 + 宽高百分比 + scale，和 admin 画布拖拽一致
    el.style.width = (cfg.widthPct || 80) + '%';
    el.style.height = (cfg.heightPct || 65) + '%';
    el.style.left = (cfg.x || 50) + '%';
    el.style.top = (cfg.y || 50) + '%';
    el.style.zIndex = cfg.z || 2;
    const s = cfg.scale || 1;
    // 用 translate(-50%,-50%) 实现"中心锚点"，再加 scale
    el.style.transform = `translate(-50%, -50%) scale(${s})`;
  }

  function init() {
    renderLandLayer();
    renderPlots();
    bindEvents();
    Utils.spawnParticles(document.getElementById('gardenButterflies'), {
      count: 5, cls: 'butterfly', emoji: true, chars: ['✨', '🐝', '🍃'], size: 16, rise: 130,
    });
    Utils.spawnParticles(document.getElementById('gardenPollen'), {
      count: 10, cls: 'pollen', color: 'rgba(255, 230, 160, 0.55)', size: 5, rise: 90,
    });
  }

  function bindEvents() {
    const container = document.getElementById('gardenPlots');
    container?.addEventListener('click', e => {
      const plot = e.target.closest('.plot');
      if (!plot) return;
      const plotId = plot.dataset.plotid;
      const occupied = State.getFarmPlotByPlotId(plotId);
      if (occupied) Popups.open('farmLog', { plotId });
      else Popups.open('farmPlant', { plotId });
    });
    document.getElementById('gardenJournalBtn')?.addEventListener('click', () => {
      Popups.open('cottage');  // 复用为农场日志（见 Task7 重写 cottage）
    });
  }

  function cropStageImage(cropKey, stage) {
    const crop = State.getFarmCrop(cropKey);
    if (!crop || !crop.stages.length) return ASSET_FALLBACK;
    return crop.stages[Math.min(stage, crop.stages.length - 1)].image || ASSET_FALLBACK;
  }

  function renderPlots() {
    const container = document.getElementById('gardenPlots');
    if (!container) return;
    const layouts = State.farmPlotLayout;
    container.innerHTML = '';
    const nextStages = {};
    let plantedCount = 0;

    layouts.forEach(layout => {
      const p = State.getFarmPlotByPlotId(layout.id);
      const crop = p ? State.getFarmCrop(p.cropKey) : null;
      const div = document.createElement('div');
      div.dataset.plotid = layout.id;
      div.style.left = layout.x + '%';
      div.style.top = layout.y + '%';
      div.style.width = (62 * (layout.scale || 1)) + 'px';
      div.style.height = (46 * (layout.scale || 1)) + 'px';
      div.style.zIndex = 10 + (layout.z || 3);

      if (p && crop) {
        plantedCount++;
        const stage = State.farmStageOf(p);
        const mature = p.matured || stage >= crop.stages.length - 1;
        div.className = 'plot ' + (mature ? 'mature' : 'planted');
        div.title = `${crop.emoji} ${p.skillName} · ${crop.stages[Math.min(stage, crop.stages.length-1)].name || ''}`;
        div.innerHTML = `
          <img class="plot-img" src="${cropStageImage(p.cropKey, stage)}" alt="${p.skillName}" />
          ${mature ? '<span class="plot-sparkle">✨</span>' : ''}
        `;
        nextStages[layout.id] = stage;
        const prev = lastStages[layout.id];
        if (prev === undefined || prev < stage) div.classList.add('pop');
      } else {
        div.className = 'plot empty';
        div.title = '空格子 · 点击种下一个想学的技能';
        div.innerHTML = `<img class="plot-img" src="${ASSET_FALLBACK}" alt="" />`;
      }
      container.appendChild(div);
    });

    lastStages = nextStages;
    const hint = document.getElementById('gardenHint');
    if (hint) hint.classList.toggle('hidden', plantedCount > 0);
  }

  // 供 popups 调用：种下/记录/收获后刷新；预览后台同步时调用 renderLandLayer
  function refresh() { renderLandLayer(); renderPlots(); }

  return { init, renderPlots, renderLandLayer, refresh };
})();
