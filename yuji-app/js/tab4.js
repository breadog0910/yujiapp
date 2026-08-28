/* ============================================================
   Tab4 星迹·个人宇宙（v2 — 6 星座连线 + 混合星星生成）
   ============================================================ */

const Tab4 = (() => {

  // ========== 1. 星座定义：固定坐标 + 中文名 ==========
  const CONSTELLATIONS = {
    selfcare:    { key: 'selfcare',    name: '自我照顾座',   cx: 18, cy: 62, color: '#FFB199' },
    emotion:     { key: 'emotion',     name: '情绪觉察座',   cx: 22, cy: 30, color: '#B497FF' },
    hearttalk:   { key: 'hearttalk',   name: '本心对话座',   cx: 50, cy: 20, color: '#FFC9DE' },
    growth:      { key: 'growth',      name: '成长耕作座',   cx: 78, cy: 64, color: '#9EE493' },
    milestone:   { key: 'milestone',   name: '成就里程碑座', cx: 80, cy: 28, color: '#FFE066' },
    deepdiscover:{ key: 'deepdiscover',name: '深度发现座',   cx: 50, cy: 50, color: '#7FD4FF' },
  };
  const CONS_ORDER = ['selfcare','emotion','hearttalk','growth','milestone','deepdiscover'];

  // AI 节流：6 小时
  const AI_THROTTLE_MS = 6 * 60 * 60 * 1000;
  // 每类星座最多保留 5 颗前端普通星（超过替换最旧）
  const MAX_MINED_PER_CAT = 5;

  // ========== 2. 对外接口 ==========
  function init() {
    // 首次访问：确保至少有一颗欢迎星
    ensureWelcomeStar();
    // 跑一轮前端模板挖掘
    runMiningPass();
    // 渲染
    renderAll();
    // 事件绑定
    bindEvents();
    // 异步尝试 AI 挖掘（节流控制）
    maybeRunAiMiner().catch(err => console.warn('[Tab4] AI miner skipped:', err.message));
  }

  function refresh() {
    // 切换到 tab4 时再跑一次挖掘（可能有新数据）
    runMiningPass();
    renderAll();
    maybeRunAiMiner().catch(err => console.warn('[Tab4] AI miner skipped:', err.message));
  }

  // ========== 3. 欢迎星（首次进入仅 1 颗）==========
  function ensureWelcomeStar() {
    const pts = State.state.starPoints;
    if (!pts || pts.length === 0) {
      pts.push({
        id: Utils.uid(),
        date: Utils.nowTs(),
        type: 'mined_welcome',
        category: 'deepdiscover',
        title: '🌟 欢迎来到你的个人宇宙',
        desc: '这里是属于你独一无二的星空。每一次自我照顾、情绪记录、本心对话、技能耕作，都会点亮一颗星。慢慢来，星光会越来越多。',
        importance: 3,
        source: '系统欢迎',
        collected: false,
      });
      State.save();
    }
  }

  // ========== 4. 前端模板挖掘（80% 普通小星星）==========
  function runMiningPass() {
    const S = State.state;
    const meta = S.generatedStarsMeta || { generated: {} };
    if (!meta.generated) meta.generated = {};
    S.generatedStarsMeta = meta;

    const newStars = [];

    // 4.1 自我照顾座 ← bubbleRecords
    (S.bubbleRecords || []).forEach((rec, idx) => {
      const sid = `sc_bubble_${rec.id || rec.date || idx}`;
      if (meta.generated[sid]) return;
      meta.generated[sid] = true;
      newStars.push({
        id: Utils.uid(),
        date: rec.date || Utils.nowTs(),
        type: 'mined_bubble',
        category: 'selfcare',
        title: `${rec.activityName || '一次打卡'}，第${rec.sessionNo || 1}次`,
        desc: `你陪小我完成了「${rec.activityName || '日常打卡'}」。这件小事背后，是你愿意善待自己的温柔。`,
        importance: 1,
        source: `打卡 · ${rec.activityName || '日常'}`,
        collected: false,
      });
    });

    // 4.2 情绪觉察座 ← emotionRecords
    (S.emotionRecords || []).forEach((rec, idx) => {
      const sid = `em_rec_${rec.id || rec.date || idx}`;
      if (meta.generated[sid]) return;
      meta.generated[sid] = true;
      const mood = rec.mood ? `「${emojiOf(rec.mood)} ${rec.mood}」` : '一次情绪记录';
      newStars.push({
        id: Utils.uid(),
        date: rec.date || Utils.nowTs(),
        type: 'mined_emotion',
        category: 'emotion',
        title: `${mood}被你看见了`,
        desc: rec.note
          ? `你写着：「${truncate(rec.note, 60)}」—— 能承认这份情绪，本身就是力量。`
          : '即便只是简单记录，你也在练习与自己的感受共处。',
        importance: 1,
        source: '情绪记录',
        collected: false,
      });
    });

    // 4.3 本心对话座 ← chatHistory (whisper)
    (S.chatHistory || []).forEach((msg, idx) => {
      if (!msg || msg.role !== 'user') return;
      const sid = `ht_chat_${msg.id || msg.ts || idx}`;
      if (meta.generated[sid]) return;
      meta.generated[sid] = true;
      newStars.push({
        id: Utils.uid(),
        date: msg.ts || Utils.nowTs(),
        type: 'mined_hearttalk',
        category: 'hearttalk',
        title: '与小我的一次谈心',
        desc: `你说：「${truncate(msg.content || '', 60)}」—— 愿意说出来，就是把光照进心里。`,
        importance: 1,
        source: '本心对话 · whisper',
        collected: false,
      });
    });

    // 4.4 成长耕作座 ← farmPlots / farmWarehouse
    (S.farmWarehouse || []).forEach((item, idx) => {
      const sid = `gr_wh_${item.id || item.harvestedAt || idx}`;
      if (meta.generated[sid]) return;
      meta.generated[sid] = true;
      newStars.push({
        id: Utils.uid(),
        date: item.harvestedAt || Utils.nowTs(),
        type: 'mined_farm_harvest',
        category: 'growth',
        title: `🌾 收获了「${item.skillName || '技能之果'}」`,
        desc: `你用了 ${item.sessions || '若干'} 次耕作，把「${item.skillName || '一项新技能'}」从种子养到成熟。坚持的痕迹都算数。`,
        importance: 2,
        source: '技能农场 · 收获',
        collected: false,
      });
    });
    (S.farmPlots || []).forEach((plot, idx) => {
      const sid = `gr_plot_${plot.plotId || idx}`;
      if (meta.generated[sid]) return;
      if (!plot.matured) return; // 只记录已成熟的
      meta.generated[sid] = true;
      newStars.push({
        id: Utils.uid(),
        date: plot.maturedAt || plot.createdAt || Utils.nowTs(),
        type: 'mined_farm_plot',
        category: 'growth',
        title: `🌱「${plot.skillName || '技能'}」的耕作`,
        desc: `进度 ${(plot.progress || 0)}%，目标：${truncate((plot.goals||[]).join('、') || '持续练习', 40)}。`,
        importance: 1,
        source: '技能农场 · 耕作',
        collected: false,
      });
    });

    // 4.5 成就里程碑座 ← milestones / 连续打卡 / 其他累计数据
    (S.milestones || []).forEach((m, idx) => {
      const sid = `ms_${m.id || m.date || idx}`;
      if (meta.generated[sid]) return;
      meta.generated[sid] = true;
      newStars.push({
        id: Utils.uid(),
        date: m.date || Utils.nowTs(),
        type: 'mined_milestone',
        category: 'milestone',
        title: m.title || '一个值得纪念的里程碑',
        desc: m.desc || '你在某一刻做得很好，值得被记住。',
        importance: m.importance || 2,
        source: '里程碑',
        collected: false,
      });
    });
    // 额外：累计打卡 N 次成就
    const bubbleCount = (S.bubbleRecords || []).length;
    if (bubbleCount >= 5) {
      const sid = `ms_bubble5_${bubbleCount}`;
      if (!meta.generated[sid]) {
        meta.generated[sid] = true;
        newStars.push({
          id: Utils.uid(),
          date: Utils.nowTs(),
          type: 'mined_bubble_5',
          category: 'milestone',
          title: `✨ 已完成 ${bubbleCount} 次自我照顾`,
          desc: `连续或累计 ${bubbleCount} 次打卡，你在用行动证明：我值得被好好对待。`,
          importance: 2,
          source: '打卡累计成就',
          collected: false,
        });
      }
    }

    // 4.6 深度发现座 ← growthNotes / selfManual 已完成章节
    (S.growthNotes || []).forEach((n, idx) => {
      const sid = `dd_note_${n.id || n.date || idx}`;
      if (meta.generated[sid]) return;
      meta.generated[sid] = true;
      newStars.push({
        id: Utils.uid(),
        date: n.date || Utils.nowTs(),
        type: 'mined_note',
        category: 'deepdiscover',
        title: n.title || '一次关于自己的发现',
        desc: truncate(n.content || '你写下了对自己新的理解。', 80),
        importance: 2,
        source: '成长笔记',
        collected: false,
      });
    });
    // selfManual 章节
    const sm = S.selfManual || {};
    Object.keys(sm).forEach(k => {
      if (!k.startsWith('chapter')) return;
      const v = sm[k] || '';
      if (!v || v.includes('还在认识中')) return;
      const sid = `dd_sm_${k}`;
      if (meta.generated[sid]) return;
      meta.generated[sid] = true;
      newStars.push({
        id: Utils.uid(),
        date: sm.updatedAt || Utils.nowTs(),
        type: 'mined_selfmanual',
        category: 'deepdiscover',
        title: `自我手册 ${cnChapter(k)} 已完成`,
        desc: truncate(v, 80),
        importance: 2,
        source: '自我手册',
        collected: false,
      });
    });

    // 4.7 把新星写入 state.starPoints，并按星座裁剪普通星
    if (newStars.length > 0) {
      (S.starPoints || (S.starPoints = [])).push(...newStars);
    }
    // 裁剪：每星座内 mined_* 最多 MAX_MINED_PER_CAT（保留最新的）
    pruneMinedStars();

    State.save();
  }

  // 按星座裁剪 mined_* 普通星（超过 MAX_MINED_PER_CAT 则丢弃最旧的；但珍藏/AI/旧数据都保留）
  function pruneMinedStars() {
    const S = State.state;
    const pts = S.starPoints || [];
    const buckets = {};
    CONS_ORDER.forEach(k => buckets[k] = []);
    const keepOthers = [];
    pts.forEach(p => {
      const cat = resolveCategory(p);
      const isMined = String(p.type || '').startsWith('mined_');
      const isCollected = !!(p.collected || p.pinned);
      if (isMined && !isCollected) {
        buckets[cat].push(p);
      } else {
        keepOthers.push(p);
      }
    });
    const finalArr = keepOthers.slice();
    CONS_ORDER.forEach(k => {
      const arr = buckets[k];
      // 按 date 升序 → 保留最新的 N 个
      arr.sort((a,b) => (a.date||'').localeCompare(b.date||''));
      const keep = arr.slice(-MAX_MINED_PER_CAT);
      finalArr.push(...keep);
    });
    S.starPoints = finalArr;
  }

  // ========== 5. AI 大星星（20%，star-miner Edge Function）==========
  async function maybeRunAiMiner() {
    const S = State.state;
    const meta = S.generatedStarsMeta || { generated: {}, lastAiRunAt: '' };
    if (!meta.generated) meta.generated = {};
    S.generatedStarsMeta = meta;

    const last = meta.lastAiRunAt ? new Date(meta.lastAiRunAt).getTime() : 0;
    const now = Date.now();
    if (last && (now - last) < AI_THROTTLE_MS) {
      console.log(`[Tab4] AI miner 节流中，剩余 ${Math.round((AI_THROTTLE_MS - (now-last))/60000)} 分钟`);
      return;
    }

    // 凑够至少 3 条普通星才调用 AI，避免空上下文
    const minedCount = (S.starPoints || []).filter(p => String(p.type||'').startsWith('mined_')).length;
    if (minedCount < 3) {
      console.log('[Tab4] AI miner 跳过：普通星不足 3 颗');
      return;
    }

    console.log('[Tab4] 触发 star-miner AI 调用…');
    let resp;
    try {
      resp = await Api.callStarMiner();
    } catch (e) {
      console.warn('[Tab4] callStarMiner 失败：', e.message);
      return;
    }

    if (!resp || !Array.isArray(resp.stars) || resp.stars.length === 0) {
      console.log('[Tab4] AI 返回为空，跳过');
      // 依旧标记时间，避免反复失败重试
      meta.lastAiRunAt = Utils.nowTs();
      State.save();
      return;
    }

    resp.stars.forEach(ai => {
      (S.starPoints || (S.starPoints = [])).push({
        id: Utils.uid(),
        date: Utils.nowTs(),
        type: 'ai_' + (ai.strategy || 'insight'),
        category: ai.category && CONSTELLATIONS[ai.category] ? ai.category : 'deepdiscover',
        title: ai.title || 'AI 深度发现',
        desc: ai.desc || '关于你的一个闪光点。',
        importance: ai.importance || 3,
        source: `AI 深度挖掘 · ${ai.strategyLabel || ai.strategy || 'insight'}`,
        collected: false,
      });
    });

    meta.lastAiRunAt = Utils.nowTs();
    State.save();
    renderAll();
  }

  // ========== 6. 渲染总入口 ==========
  function renderAll() {
    renderConstellationLabels();
    renderStars();
    renderSvgLines();
  }

  // 渲染 6 个星座浮标
  function renderConstellationLabels() {
    const box = document.getElementById('consLabels');
    if (!box) return;
    box.innerHTML = '';
    CONS_ORDER.forEach(key => {
      const c = CONSTELLATIONS[key];
      const count = starsInCategory(key).length;
      const locked = count === 0 && !hasCategoryData(key);
      const el = document.createElement('div');
      el.className = 'cons-label' + (locked ? ' locked' : '');
      el.style.left = c.cx + '%';
      el.style.top = c.cy + '%';
      el.dataset.cons = key;
      el.innerHTML = `
        <span class="cons-dot" style="--cc:${c.color}"></span>
        <span class="cons-name">${c.name}</span>
        <span class="cons-count">${count}</span>
      `;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (locked) {
          Utils.toast(`还没有数据哦～快去完成${hintAction(key)}，点亮这个星座 ✨`);
        } else {
          Popups.open('constellationSummary', { category: key });
        }
      });
      box.appendChild(el);
    });
  }

  // 渲染星星（按星座中心 + 黄金角螺旋分布）
  function renderStars() {
    const box = document.getElementById('starsLayer');
    if (!box) return;
    box.innerHTML = '';

    // 把 starPoints 先映射 category，确保旧数据也能用
    const pts = (State.state.starPoints || []).slice();
    pts.forEach(p => { p.category = resolveCategory(p); });

    CONS_ORDER.forEach(key => {
      const c = CONSTELLATIONS[key];
      const list = pts.filter(p => p.category === key);
      list.forEach((star, i) => {
        const pos = goldenAngle(i, c.cx, c.cy, Math.max(5, Math.min(14, list.length * 1.2 + 4)));
        const el = document.createElement('div');
        const sizeCls = star.importance >= 3 ? ' huge'
          : star.importance === 2 ? ' big'
          : String(star.type||'').startsWith('ai_') ? ' big' : '';
        el.className = 'stars-v2' + sizeCls;
        if (String(star.type||'').startsWith('ai_')) el.classList.add('ai-star');
        if (star.collected) el.classList.add('collected');
        el.style.left = pos.x + '%';
        el.style.top = pos.y + '%';
        el.style.setProperty('--sc', c.color);
        el.style.animationDelay = ((i % 10) * 0.18) + 's';
        el.title = star.title || '';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          Popups.open('starCard', { id: star.id });
        });
        box.appendChild(el);
      });
    });
  }

  // 渲染 SVG 连线：每颗星 → 对应星座中心
  function renderSvgLines() {
    const svg = document.getElementById('consSvg');
    if (!svg) return;
    svg.innerHTML = '';
    const pts = (State.state.starPoints || []).slice();
    pts.forEach(p => { p.category = resolveCategory(p); });

    CONS_ORDER.forEach(key => {
      const c = CONSTELLATIONS[key];
      const list = pts.filter(p => p.category === key);
      list.forEach((star, i) => {
        const pos = goldenAngle(i, c.cx, c.cy, Math.max(5, Math.min(14, list.length * 1.2 + 4)));
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', c.cx + '%');
        line.setAttribute('y1', c.cy + '%');
        line.setAttribute('x2', pos.x + '%');
        line.setAttribute('y2', pos.y + '%');
        // 全图统一金黄色连线（星座颜色不再单独区分）
        line.setAttribute('stroke', '#FFD86B');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-dasharray', '3 4');
        line.setAttribute('stroke-opacity', String(star.importance >= 3 ? 0.72 : 0.48));
        svg.appendChild(line);
      });
    });
  }

  // 事件绑定（空容器占位，以后扩展）
  function bindEvents() {
    // 目前每个星星/标签单独绑事件
  }

  // ========== 7. 辅助工具 ==========

  // 黄金角螺旋：把第 i 个点围绕 (cx,cy) 均匀分布，rSpan 控制半径范围（%）
  function goldenAngle(i, cx, cy, rSpan) {
    const PHI = Math.PI * (3 - Math.sqrt(5)); // 黄金角
    const r = (rSpan / 100) * Math.sqrt(i + 0.5);
    const theta = i * PHI;
    // 把极坐标 → 相对 cx/cy 的 % 偏移。半径按百分比 * 0.6 横向/ * 0.5 纵向压缩
    const dx = Math.cos(theta) * r * 0.6;
    const dy = Math.sin(theta) * r * 0.5;
    return {
      x: clamp(cx + dx * 10, 4, 96),
      y: clamp(cy + dy * 10, 8, 92),
    };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function resolveCategory(p) {
    if (p && p.category && CONSTELLATIONS[p.category]) return p.category;
    return State.pickCategoryByType ? State.pickCategoryByType(p.type) : 'milestone';
  }

  function starsInCategory(key) {
    return (State.state.starPoints || []).filter(p => resolveCategory(p) === key);
  }

  // 判断星座是否「有潜在数据」（即便还没挖掘也不显示 locked）
  function hasCategoryData(key) {
    const S = State.state;
    switch (key) {
      case 'selfcare':     return (S.bubbleRecords||[]).length > 0;
      case 'emotion':      return (S.emotionRecords||[]).length > 0;
      case 'hearttalk':    return (S.chatHistory||[]).some(m => m && m.role === 'user');
      case 'growth':       return (S.farmWarehouse||[]).length>0 || (S.farmPlots||[]).some(p => p && p.matured);
      case 'milestone':    return (S.milestones||[]).length>0 || (S.bubbleRecords||[]).length>=5;
      case 'deepdiscover': return (S.growthNotes||[]).length>0
        || Object.values(S.selfManual||{}).some(v => typeof v==='string' && !v.includes('还在认识中'));
    }
    return false;
  }

  function hintAction(key) {
    return ({
      selfcare: '一次自我照顾打卡',
      emotion: '一次情绪记录',
      hearttalk: '一次和小我的本心对话',
      growth: '一块技能农场田地',
      milestone: '一次里程碑或 5 次以上打卡',
      deepdiscover: '一次成长笔记或自我手册章节',
    })[key] || '一些活动';
  }

  function emojiOf(mood) {
    const m = String(mood || '').toLowerCase();
    if (['开心','高兴','快乐','happy','joy'].some(k => m.includes(k))) return '😊';
    if (['难过','伤心','悲伤','sad'].some(k => m.includes(k))) return '😢';
    if (['愤怒','生气','angry'].some(k => m.includes(k))) return '😠';
    if (['焦虑','紧张','anxious','worry'].some(k => m.includes(k))) return '😰';
    if (['平静','放松','peaceful','calm'].some(k => m.includes(k))) return '😌';
    return '💭';
  }

  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function cnChapter(k) {
    const map = { chapter1:'第一章', chapter2:'第二章', chapter3:'第三章', chapter4:'第四章', chapter5:'第五章' };
    return map[k] || k;
  }

  // 手动添加星点（对外预留）
  function addStarPoint({ title, desc, importance = 1, category = 'milestone', type = 'manual' }) {
    State.state.starPoints = State.state.starPoints || [];
    State.state.starPoints.push({
      id: Utils.uid(),
      date: Utils.nowTs(),
      type,
      category: CONSTELLATIONS[category] ? category : 'milestone',
      title,
      desc,
      importance,
      source: '手动添加',
      collected: false,
    });
    State.save();
    renderAll();
  }

  return { init, refresh, renderAll, addStarPoint };
})();
