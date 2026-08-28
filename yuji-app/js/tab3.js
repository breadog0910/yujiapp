/* ============================================================
 * Tab3 生长·技能农场（单地块版）
 *
 * - Tab3 背景（底层）= assets/farm/tab3-bg.png（草地/天空）
 * - 土地图层（中景，整块地=1 个按钮）= assets/farm/land-v2.png，位置/大小来自
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
  // ⚠️ 超大图（> 1M 像素）会阻塞主线程数秒，因此：
  //   1) 默认 land-v2.png / land.png 已用 PIL 做永久资源级抠图 + alpha 二值化，直接跳过
  //   2) 仅管理员自定义的非内置土地图才跑；超大图用降采样 + requestIdleCallback 异步兜底
  function floodFillRemoveBg(imageEl, threshold = 30) {
    const src = imageEl.naturalWidth || imageEl.width;
    const sH = imageEl.naturalHeight || imageEl.height;
    if (!src || !sH) return null;
    // 降采样：超过 25 万像素先缩到 ~25 万像素（长宽 sqrt(n/250000) 倍缩小），
    // 避免 1326×1009≈1.34M 像素同步 BFS 把主线程卡死数秒
    const totalPxs = src * sH;
    let W = src, H = sH;
    let inCanvas = document.createElement('canvas');
    if (totalPxs > 250000) {
      const ratio = Math.sqrt(250000 / totalPxs);
      W = Math.max(64, Math.round(src * ratio));
      H = Math.max(64, Math.round(sH * ratio));
    }
    inCanvas.width = W; inCanvas.height = H;
    const ctx = inCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(imageEl, 0, 0, W, H);
    const img = ctx.getImageData(0, 0, W, H);
    const data = img.data;

    const visited = new Uint8Array(W * H);
    // flat queue: 存 x + y*W，比 [x,y] 数组分配便宜 4 倍
    const queue = new Int32Array(W * H * 2);
    let qHead = 0, qTail = 0;
    const push = (x, y) => { queue[qTail++] = x | 0; queue[qTail++] = y | 0; };
    const pop = () => { const x = queue[qHead++]; const y = queue[qHead++]; return [x, y]; };
    const thr2 = threshold * threshold * 3;
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (let y = 1; y < H - 1; y++) { push(0, y); push(W - 1, y); }
    // 保险：最坏情况下不超过 WH*5 步，防止极端配置进入死循环卡住页面
    let steps = 0;
    const STEPS_MAX = W * H * 5;
    while (qHead < qTail && steps < STEPS_MAX) {
      steps++;
      const [x, y] = pop();
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x);
      if (visited[i]) continue;
      visited[i] = 1;
      const p = i * 4;
      if (data[p + 3] === 0) continue;
      const dr = 255 - data[p];
      const dg = 255 - data[p + 1];
      const db = 255 - data[p + 2];
      const distW = dr * dr + dg * dg + db * db;
      const drG = 212 - data[p];
      const dgG = 212 - data[p + 1];
      const dbG = 212 - data[p + 2];
      const distG = drG * drG + dgG * dgG + dbG * dbG;
      if (distW < thr2 || distG < thr2) {
        data[p + 3] = 0;
        push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
      }
    }
    ctx.putImageData(img, 0, 0);
    return ctx.canvas.toDataURL('image/png');
  }

  // PIL 已做永久抠图的内置土地图 URL 白名单：跳过同步 canvas flood fill，直接显示原图
  // （SVG filter #alpha-hard-edge 做浏览器端 alpha 二值化兜底，足够对付残余半透像素）
  function isBuiltinLand(url) {
    if (!url) return true;
    const u = String(url).toLowerCase();
    return u.includes('assets/farm/land-v2.png') || u.includes('assets/farm/land.png');
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

    // 图片加载 → 抠图策略：
    //   * 内置 land-v2.png（资源级 PIL 已去白底）：直接显示，0 额外卡顿
    //   * 自定义图：降采样后再 flood fill；onload 不阻塞 paint（renderLandLayer 先让 el.src=url 展示原图，
    //     再异步替换成抠图版，避免 Tab3 白屏等待）
    const url = cfg.image || 'assets/farm/land-v2.png';
    const threshold = getThreshold();
    const cacheKey = url + '|t=' + threshold;
    if (el.dataset.cacheKey === cacheKey) return; // 已处理过，不重复跑

    // 先立即显示原图（用户切 Tab3 时能立刻看到整块土地，不被 BFS 卡住）
    el.src = url;
    el.dataset.cacheKey = cacheKey + '|pending';

    if (isBuiltinLand(url)) {
      el.dataset.cacheKey = cacheKey; // 内置图直接标处理完成
      return;
    }
    // 自定义图：在下一个 rAF + requestIdleCallback 后处理（避免卡死首屏）
    const runAt = (typeof requestIdleCallback === 'function') ? requestIdleCallback : (cb) => setTimeout(cb, 40);
    runAt(() => {
      const tmp = new Image();
      tmp.crossOrigin = 'anonymous';
      tmp.onload = () => {
        try {
          const dataUrl = floodFillRemoveBg(tmp, threshold);
          if (dataUrl && el.dataset.cacheKey === cacheKey + '|pending') {
            el.src = dataUrl;
          }
        } catch (e) {
          console.warn('[Tab3] 自定义土地抠图失败，保留原图：', e.message);
        }
        el.dataset.cacheKey = cacheKey;
      };
      tmp.onerror = () => { el.dataset.cacheKey = cacheKey; };
      tmp.src = url;
    }, { timeout: 300 });
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
