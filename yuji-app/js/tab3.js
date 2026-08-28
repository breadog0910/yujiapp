/* ============================================================
 * Tab3 生长·技能农场（单地块版）
 *
 * - Tab3 背景（底层）= assets/farm/tab3-bg.png（草地/天空）
 * - 土地图层（中景，整块地=1 个按钮）= assets/farm/land.png，位置/大小来自
 *   State.farmLandConfig。前端运行时 canvas flood fill 去四边沿的白/浅灰 → 透明
 * - 已种状态：在土地上方叠当前阶段的作物大图（阶段越往后越大）
 * - 点击整块土地 → 未种→farmPlant，已种→farmLog
 * - 日志按钮 → cottage 弹窗
 * - 生长算法：progress = Σ sessions.minutes + Σ completed_goal.points
 *             stage    = min(floor(progress / minutesPerStage), stages.length-1)
 *   ============================================================ */

const Tab3 = (() => {
  const ASSET_FALLBACK = 'assets/field/crop-s1.png';

  // 白底抠图：四边沿 BFS flood fill，把颜色距离白 < threshold 的像素 alpha=0
  function floodFillRemoveBg(imageEl, threshold = 30) {
    const src = imageEl.naturalWidth || imageEl.width;
    const sH = imageEl.naturalHeight || imageEl.height;
    if (!src || !sH) return null;
    const canvas = document.createElement('canvas');
    canvas.width = src; canvas.height = sH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageEl, 0, 0, src, sH);
    const img = ctx.getImageData(0, 0, src, sH);
    const data = img.data;
    const W = src, H = sH;

    const visited = new Uint8Array(W * H);
    const queue = [];
    const thr2 = threshold * threshold * 3; // 近似色差不用开方
    for (let x = 0; x < W; x++) {
      queue.push([x, 0]); queue.push([x, H - 1]);
    }
    for (let y = 1; y < H - 1; y++) {
      queue.push([0, y]); queue.push([W - 1, y]);
    }
    while (queue.length) {
      const [x, y] = queue.pop();
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x);
      if (visited[i]) continue;
      visited[i] = 1;
      const p = i * 4;
      if (data[p + 3] === 0) continue; // 已透明
      const dr = 255 - data[p];
      const dg = 255 - data[p + 1];
      const db = 255 - data[p + 2];
      // 同时兼容浅灰白格 (212,212,212)：色差对纯白或 212 灰取最小
      const distW = dr * dr + dg * dg + db * db;
      const drG = 212 - data[p];
      const dgG = 212 - data[p + 1];
      const dbG = 212 - data[p + 2];
      const distG = drG * drG + dgG * dgG + dbG * dbG;
      if (distW < thr2 || distG < thr2) {
        data[p + 3] = 0; // 透明
        queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }

  // 拿 State.farmLandConfig.bgThreshold，缺省 30
  function getThreshold() {
    const cfg = State.farmLandConfig || {};
    return cfg.bgThreshold != null ? +cfg.bgThreshold : 30;
  }

  // 渲染土地图层（位置/大小/缩放 + 白底抠图 + 点击按钮）
  function renderLandLayer() {
    const el = document.getElementById('farmLandLayer');
    if (!el) return;
    const cfg = State.farmLandConfig;
    if (!cfg) return;
    // 定位（百分比 + 中心锚点）
    el.style.display = 'block';
    el.style.width = (cfg.widthPct || 80) + '%';
    el.style.height = (cfg.heightPct || 65) + '%';
    el.style.left = (cfg.x || 50) + '%';
    el.style.top = (cfg.y || 50) + '%';
    el.style.zIndex = cfg.z || 2;
    const s = cfg.scale || 1;
    el.style.setProperty('--land-scale', s);  // CSS var：hover/active 中复用
    el.style.transform = `translate(-50%, -50%) scale(${s})`;
    el.style.pointerEvents = 'auto';   // 关键：土地作为按钮可点
    el.classList.add('clickable');
    el.style.cursor = 'pointer';
    el.style.userSelect = 'none';
    el.style.objectFit = 'contain';
    el.style.imageRendering = 'pixelated';

    // 图片加载 → flood fill 去白底（带缓存 key = imgURL + threshold）
    const url = cfg.image || 'assets/farm/land.png';
    const threshold = getThreshold();
    const cacheKey = url + '|t=' + threshold;
    if (el.dataset.cacheKey !== cacheKey) {
      const tmp = new Image();
      tmp.crossOrigin = 'anonymous';
      tmp.onload = () => {
        try {
          const dataUrl = floodFillRemoveBg(tmp, threshold);
          if (dataUrl) el.src = dataUrl;
        } catch (e) {
          console.warn('[Tab3] 土地抠图失败，显示原图：', e.message);
          el.src = url;
        }
        el.dataset.cacheKey = cacheKey;
      };
      tmp.onerror = () => { el.src = url; el.dataset.cacheKey = cacheKey; };
      tmp.src = url;
    }
  }

  // 在土地上方叠当前阶段作物大图（已种状态）
  function renderCropLayer() {
    const landEl = document.getElementById('farmLandLayer');
    if (!landEl) return;
    let stageEl = document.getElementById('farmCropStage');
    if (!stageEl) {
      stageEl = document.createElement('img');
      stageEl.id = 'farmCropStage';
      stageEl.alt = '作物阶段图';
      stageEl.style.cssText = `
        position:absolute; pointer-events:none; user-select:none;
        left:50%; transform: translate(-50%, -65%);
        object-fit: contain; image-rendering: pixelated; z-index: 6;
        display: none;
      `;
      landEl.parentElement.appendChild(stageEl);
    }
    const p = State.getFarmMainPlot();
    if (!p) { stageEl.style.display = 'none'; return; }
    const crop = State.getFarmCrop(p.cropKey);
    if (!crop) { stageEl.style.display = 'none'; return; }
    const stage = State.farmStageOf(p);
    const stageObj = crop.stages[stage] || crop.stages[crop.stages.length - 1];
    stageEl.src = stageObj?.image || ASSET_FALLBACK;
    stageEl.title = `${p.skillName} · ${stageObj?.name || (stage+1)+'阶'}`;
    const landCfg = State.farmLandConfig;
    const landW = (landCfg?.widthPct || 80);
    // 阶段越往后，作物越大：s1 25% → s4 62%（相对土地宽）
    const stagesCount = crop.stages.length || 4;
    const ratio = stagesCount === 1 ? 1 : stage / (stagesCount - 1);
    const sizePct = 22 + ratio * 50;  // 22% … 72% landWidth
    // stageEl 以页面宽为基准，但土地是 widthPct 页面宽；所以 stageEl width = sizePct * landW / 100
    stageEl.style.width = ((sizePct * landW) / 100) + '%';
    stageEl.style.height = 'auto';
    // stageEl 相对 tab3 容器（position:relative）定位：
    // 垂直方向：和土地一样基于 left%/top% 中心，但作物要在土地偏上方（65% 土地上方高度的地方）
    // 所以 top = land.y - (landCfg.heightPct * 0.35) （向上偏移 35% landHeight）
    stageEl.style.left = (landCfg?.x || 50) + '%';
    const landTopPct = landCfg?.y || 50;
    const landHeightPct = landCfg?.heightPct || 65;
    stageEl.style.top = Math.max(5, landTopPct - landHeightPct * 0.38) + '%';
    stageEl.style.transform = 'translate(-50%, -50%) scale(' + (1 + ratio * 0.2) + ')';
    stageEl.style.display = 'block';
  }

  function bindEvents() {
    const land = document.getElementById('farmLandLayer');
    if (land) {
      land.addEventListener('click', () => {
        const p = State.getFarmMainPlot();
        if (p) Popups.open('farmLog');
        else Popups.open('farmPlant');
      });
    }
    const journal = document.getElementById('gardenJournalBtn');
    if (journal) journal.addEventListener('click', () => Popups.open('cottage'));
  }

  function renderHint() {
    const hint = document.getElementById('gardenHint');
    if (!hint) return;
    const p = State.getFarmMainPlot();
    if (!p) {
      hint.textContent = '点击这块土地，种下一个想学的技能🌱';
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
  }

  function init() {
    renderLandLayer();
    renderCropLayer();
    renderHint();
    bindEvents();
    Utils.spawnParticles(document.getElementById('gardenButterflies'), {
      count: 5, cls: 'butterfly', emoji: true, chars: ['✨', '🐝', '🍃'], size: 16, rise: 130,
    });
    Utils.spawnParticles(document.getElementById('gardenPollen'), {
      count: 10, cls: 'pollen', color: 'rgba(255, 230, 160, 0.55)', size: 5, rise: 90,
    });
  }

  // 供 popups 调用 / 后台预览同步：土地图层 + 作物图 + hint 全重绘
  function refresh() { renderLandLayer(); renderCropLayer(); renderHint(); }

  return { init, refresh, renderLandLayer, renderCropLayer };
})();
