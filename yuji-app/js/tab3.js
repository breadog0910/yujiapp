/* ============================================================
   Tab3 生长·像素田地 - 逻辑 (3x3 九宫格版)
   与原花园完全一致：3×3 田垄、4 阶段生长、行动驱动、收获入仓库
   视觉：field-base-9grid.png 作底图（一张连续 2.5D 九宫格土壤田），
         crop-*.png 用绝对定位叠加在各自格子上
   ============================================================ */

const Tab3 = (() => {

  const PLOT_COUNT = 9;
  const ROWS = 3;
  const COLS = 3;

  // 素材路径
  const ASSET = 'assets/field/';

  // 阶段名
  const STAGE_NAMES = ['破土', '生长', '繁茂', '成熟'];

  // 根据生长阶段返回作物 sprite 路径
  // stage: 0=破土(s1), 1=生长(s2), 2=繁茂(s3), 3=成熟前(s4); >= maxStage 用 h1(带果实)
  function fieldSprite(seedKey, stage) {
    const seed = State.getSeed(seedKey);
    const maxStage = seed ? seed.stages.length - 1 : 3;
    if (stage >= maxStage) return `${ASSET}crop-h1.png`;
    const n = Math.max(1, Math.min(4, stage + 1));
    return `${ASSET}crop-s${n}.png`;
  }

  let lastStages = {};

  // ---------- 格子位置查表（绝对定位叠加在 field-base-9grid 上） ----------
  // 位置来源：cutout_field_userimg_v4.py 按用户自定义田图抠图后实测
  // 容器 331x290，每块田 ~84x30
  const CONTAINER_W = 331;
  const CONTAINER_H = 290;

  const PLOT_LAYOUT = [
    { left:  123.4, top:   74.4, width:  83.8, height:  30.1 },  // idx 0 最顶端
    { left:   70.8, top:  105.6, width:  83.8, height:  30.1 },  // idx 1 左上
    { left:  179.7, top:  105.6, width:  83.8, height:  30.1 },  // idx 2 右上
    { left:   20.7, top:  142.3, width:  83.8, height:  30.1 },  // idx 3 最左
    { left:  123.4, top:  141.9, width:  83.8, height:  30.1 },  // idx 4 正中
    { left:  231.6, top:  142.3, width:  83.8, height:  30.1 },  // idx 5 最右
    { left:   70.8, top:  180.4, width:  83.8, height:  30.1 },  // idx 6 左下
    { left:  179.7, top:  180.4, width:  83.8, height:  30.1 },  // idx 7 右下
    { left:  123.4, top:  216.7, width:  83.8, height:  30.1 },  // idx 8 最底端
  ];

  function plotPosition(idx) { return PLOT_LAYOUT[idx]; }

  function init() {
    renderPlots();
    bindEvents();
    Utils.spawnParticles(document.getElementById('gardenButterflies'), {
      count: 5,
      cls: 'butterfly',
      emoji: true,
      chars: ['✨', '🐝', '🍃'],
      size: 16,
      rise: 130,
    });
    Utils.spawnParticles(document.getElementById('gardenPollen'), {
      count: 10,
      cls: 'pollen',
      color: 'rgba(255, 230, 160, 0.55)',
      size: 5,
      rise: 90,
    });
  }

  function bindEvents() {
    const container = document.getElementById('gardenPlots');
    if (container) {
      container.addEventListener('click', e => {
        const plot = e.target.closest('.plot');
        if (!plot) return;
        handlePlotClick(+plot.dataset.idx);
      });
    }
    document.getElementById('gardenJournalBtn')?.addEventListener('click', () => {
      Popups.open('cottage');
    });
  }

  function handlePlotClick(idx) {
    const s = State.state;
    const plant = s.plots[idx];
    if (!plant) {
      Popups.open('seedSelect', { idx });
      return;
    }
    const seed = State.getSeed(plant.seedKey);
    if (!seed) return;
    const maxStage = seed.stages.length - 1;
    if (plant.stage >= maxStage) {
      Popups.open('harvest', { idx });
    } else {
      const remain = State.FEED_PER_STAGE - plant.feed;
      Utils.toast(
        `${seed.emoji} ${seed.name} · ${STAGE_NAMES[plant.stage]}阶` +
        `（再 ${remain} 次养料进入下一阶）\n养料来源：${seed.desc}`
      );
    }
  }

  // ---------- 渲染 9 块田（绝对定位叠加在底图上） ----------
  function renderPlots() {
    const container = document.getElementById('gardenPlots');
    if (!container) return;
    const s = State.state;
    container.innerHTML = '';
    const nextStages = {};
    let plantedCount = 0;

    for (let idx = 0; idx < PLOT_COUNT; idx++) {
      const plant = s.plots[idx];
      const seed = plant ? State.getSeed(plant.seedKey) : null;
      const pos = plotPosition(idx);

      const div = document.createElement('div');
      div.dataset.idx = idx;

      // 绝对定位：每个格子放在大田底图对应位置
      div.style.left = pos.left + 'px';
      div.style.top  = pos.top + 'px';
      div.style.width  = pos.width + 'px';
      div.style.height = pos.height + 'px';

      if (plant && seed) {
        plantedCount++;
        const maxStage = seed.stages.length - 1;
        const sprite = fieldSprite(plant.seedKey, plant.stage);
        const mature = plant.stage >= maxStage;
        div.className = 'plot ' + (mature ? 'mature' : 'planted');
        div.title = `${seed.name} · ${STAGE_NAMES[Math.min(plant.stage, 3)]}`;
        div.innerHTML = `
          <img class="plot-img" src="${sprite}" alt="${seed.name}" />
          ${mature ? '<span class="plot-sparkle">✨</span>' : ''}
        `;
        nextStages[idx] = plant.stage;
        const prev = lastStages[idx];
        if (prev === undefined || prev < plant.stage) div.classList.add('pop');
      } else {
        div.className = 'plot empty';
        div.title = '空田地 · 点击种下种子';
        div.innerHTML = `<img class="plot-img" src="${ASSET}crop-s1.png" alt="" />`;
      }

      container.appendChild(div);
    }

    lastStages = nextStages;

    const hint = document.getElementById('gardenHint');
    if (hint) hint.classList.toggle('hidden', plantedCount > 0);
  }

  // ---------- 对外操作（供 popups 调用）—— 与原花园逻辑一致 ----------

  function plantSeed(idx, seedKey) {
    const ok = State.plantSeed(idx, seedKey);
    if (ok) {
      renderPlots();
      document.getElementById('app')?.dispatchEvent(new CustomEvent('yuji:plant'));
    }
    return ok;
  }

  function harvestPlot(idx, toHome = false) {
    const s = State.state;
    const plant = s.plots[idx];
    const seed = plant ? State.getSeed(plant.seedKey) : null;
    if (!plant || !seed) return null;

    const item = State.harvestPlot(idx);
    if (!item) return null;

    if (toHome) {
      s.placements.push(item);
      State.addHappiness(item.bonus.happiness || 0);
      State.addHealth(item.bonus.health || 0);
      Utils.recalcComfort();
      Tab1.refresh();
    } else {
      s.gardenWarehouse.push(item);
    }

    s.starPoints.push({
      id: Utils.uid(),
      date: Utils.nowTs(),
      type: 'harvest',
      title: `收获了「${item.name}」`,
      desc: `从「${seed.name}」长成的果实，来到了你身边。`,
      importance: 2,
    });
    State.save();
    renderPlots();
    Tab4.refresh();
    return item;
  }

  return { init, renderPlots, plantSeed, harvestPlot, fieldSprite };
})();
