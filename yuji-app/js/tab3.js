/* ============================================================
 * Tab3 生长·技能农场（多地块版）
 *
 * - Tab3 背景（底层）= tab3 背景（草地/天空）
 * - 多块土地图层（来自 State.farmLandList）：每块可独立设置位置/大小/缩放，
 *   由后台「技能农场」面板复制、摆放、保存
 * - 每块土地的作物：优先显示后台「该土地的作物」设置；若该作物与用户已种的技能
 *   一致，则显示对应生长阶段；否则显示破土预览
 * - 点击整块土地 → 未种→farmPlant，已种→farmLog
 * - 像素小人（garden-character）已从 index.html 移除
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

  // 土地图加载 + 自定义图抠图（写入 <img>.src）
  function applyLandImage(imgEl, url, threshold) {
    const u = url || 'assets/farm/land-v2.png';
    const thr = threshold != null ? threshold : 30;
    const cacheKey = u + '|t=' + thr;
    if (imgEl.dataset.cacheKey === cacheKey) return;
    imgEl.src = u;                       // 先立即显示原图（不阻塞首屏）
    imgEl.dataset.cacheKey = cacheKey + '|pending';
    if (isBuiltinLand(u)) { imgEl.dataset.cacheKey = cacheKey; return; }
    const runAt = (typeof requestIdleCallback === 'function') ? requestIdleCallback : (cb) => setTimeout(cb, 40);
    runAt(() => {
      const tmp = new Image();
      tmp.crossOrigin = 'anonymous';
      tmp.onload = () => {
        try {
          const d = floodFillRemoveBg(tmp, thr);
          if (d && imgEl.dataset.cacheKey === cacheKey + '|pending') imgEl.src = d;
        } catch (e) {
          console.warn('[Tab3] 自定义土地抠图失败，保留原图：', e.message);
        }
        imgEl.dataset.cacheKey = cacheKey;
      };
      tmp.onerror = () => { imgEl.dataset.cacheKey = cacheKey; };
      tmp.src = u;
    }, { timeout: 300 });
  }

  // 渲染全部土地图层（每位独立位置/大小/缩放）+ 作物叠图
  function renderLands() {
    const wrap = document.getElementById('farmLandsLayer');
    if (!wrap) return;
    wrap.innerHTML = '';
    const lands = (State.farmLandList && State.farmLandList.length) ? State.farmLandList : [State.farmLandConfig];
    const userPlot = State.getFarmMainPlot();
    lands.forEach(land => {
      if (!land) return;
      const el = document.createElement('div');
      el.className = 'farm-land clickable';
      el.style.position = 'absolute';
      el.style.left = (land.x != null ? land.x : 50) + '%';
      el.style.top = (land.y != null ? land.y : 50) + '%';
      el.style.width = (land.widthPct || 80) + '%';
      el.style.height = (land.heightPct || 65) + '%';
      el.style.zIndex = (land.z != null ? land.z : 2);
      el.style.transform = 'translate(-50%, -50%) scale(' + (land.scale || 1) + ')';
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.style.userSelect = 'none';
      el.style.setProperty('--land-scale', land.scale || 1);
      el.alt = '土地';
      el.title = '点击这块土地，种下一个想学的技能🌱';

      // 土地图（带白底抠图 filter）
      const landImg = document.createElement('img');
      landImg.className = 'fl-land';
      landImg.alt = '土地';
      landImg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;image-rendering:pixelated;pointer-events:none;display:block;';
      el.appendChild(landImg);
      applyLandImage(landImg, land.image, land.bgThreshold);

      // 作物叠图：后台「该土地的作物」设置；与用户已种技能一致则显示生长阶段
      const cropKey = land.cropKey || null;
      const crop = cropKey ? State.getFarmCrop(cropKey) : null;
      if (crop && crop.stages && crop.stages.length) {
        let stageIdx = 0;
        if (userPlot && userPlot.cropKey === cropKey) stageIdx = State.farmStageOf(userPlot);
        const stageObj = crop.stages[stageIdx] || crop.stages[crop.stages.length - 1];
        if (stageObj && stageObj.image) {
          const cropEl = document.createElement('img');
          cropEl.className = 'farm-crop-overlay';
          cropEl.src = stageObj.image;
          cropEl.alt = '';
          cropEl.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-62%);width:62%;height:auto;object-fit:contain;image-rendering:pixelated;pointer-events:none;user-select:none;z-index:3;';
          el.appendChild(cropEl);
        }
      }
      wrap.appendChild(el);
    });
  }

  function bindEvents() {
    const wrap = document.getElementById('farmLandsLayer');
    if (wrap) wrap.addEventListener('click', (e) => {
      const land = e.target.closest('.farm-land');
      if (!land) return;
      const p = State.getFarmMainPlot();
      if (p) Popups.open('farmLog'); else Popups.open('farmPlant');
    });
    const journal = document.getElementById('gardenJournalBtn');
    if (journal) journal.addEventListener('click', () => Popups.open('cottage'));
  }

  function renderHint() {
    const hint = document.getElementById('gardenHint');
    if (!hint) return;
    const p = State.getFarmMainPlot();
    if (!p) {
      hint.textContent = '点击任意一块土地，种下一个想学的技能🌱';
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
  }

  function init() {
    renderLands();
    renderHint();
    bindEvents();
    Utils.spawnParticles(document.getElementById('gardenButterflies'), {
      count: 5, cls: 'butterfly', emoji: true, chars: ['✨', '🐝', '🍃'], size: 16, rise: 130,
    });
    Utils.spawnParticles(document.getElementById('gardenPollen'), {
      count: 10, cls: 'pollen', color: 'rgba(255, 230, 160, 0.55)', size: 5, rise: 90,
    });
  }

  // 供 popups 调用 / 后台预览同步：全部土地 + 作物图 + hint 全重绘
  function refresh() { renderLands(); renderHint(); }

  return { init, refresh, renderLands };
})();
