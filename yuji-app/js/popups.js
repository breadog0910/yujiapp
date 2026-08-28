/* ============================================================
   弹窗系统
   ============================================================ */

const Popups = (() => {

  const root = () => document.getElementById('popupRoot');

  // 弹窗打开计数（防止滚动穿透）
  let depth = 0;
  function lockScroll(lock) {
    if (lock) {
      depth++;
      document.body.style.overflow = 'hidden';
    } else {
      depth = Math.max(0, depth - 1);
      if (depth === 0) document.body.style.overflow = '';
    }
  }

  function close() {
    root().innerHTML = '';
    lockScroll(false);
  }

  function open(name, data = {}) {
    const builder = builders[name];
    if (!builder) {
      console.warn('Unknown popup:', name);
      return;
    }
    const html = builder(data);
    root().innerHTML = `
      <div class="popup-backdrop" data-close="1">
        <div class="popup" onclick="event.stopPropagation()">
          ${html}
        </div>
      </div>
    `;
    lockScroll(true);

    // 绑定关闭
    root().querySelector('[data-close]')?.addEventListener('click', e => {
      if (e.target.dataset.close === '1') close();
    });
    root().querySelectorAll('.popup-close').forEach(btn => {
      btn.addEventListener('click', close);
    });

    // 弹窗内自定义初始化
    const init = inits[name];
    if (init) init(data);
  }

  // 弹窗内容生成器
  const builders = {

    // ============ 情绪记录 ============
    emotion() {
      const s = State.state;
      const todayRecords = s.emotionRecords.filter(r => r.date.slice(0,10) === Utils.today());
      return `
        <div class="popup-head">
          <div class="popup-title">🌸 此刻心情</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="hint">不用写得很完整，简单记一下就好</div>
          <div style="margin-top:8px;">选几个符合的词：</div>
          <div class="popup-tags" id="emoTags">
            ${['开心','平静','疲惫','焦虑','难过','迷茫','专注','温暖','烦躁','放松','感动','无力'].map(t => `
              <span class="popup-tag" data-tag="${t}">${t}</span>
            `).join('')}
          </div>
          <textarea class="popup-textarea" id="emoText" placeholder="想说点什么…（可选）" maxlength="300"></textarea>
          ${todayRecords.length > 0 ? `
            <div class="hint" style="margin-top:12px;">今天已经记录了 ${todayRecords.length} 次</div>
          ` : ''}
        </div>
        <div class="popup-foot">
          <button class="popup-btn" data-act="cancel">再想想</button>
          <button class="popup-btn primary" data-act="save">记下来</button>
        </div>
      `;
    },

    // ============ 商店 ============
    shop() {
      return `
        <div class="popup-head">
          <div class="popup-title">💰 予己商店</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="hint">善待自己之后，可以收获金币用来犒劳房间里的小我。<br>没有必须要买的东西。</div>
          <div class="shop-tabs" style="margin-top:10px;">
            <div class="shop-tab active" data-tab="physical">🏠 实体物件</div>
            <div class="shop-tab" data-tab="spirit">✨ 精神体验</div>
            <div class="shop-tab" data-tab="furniture">🛋️ 房间布置</div>
          </div>
          <div id="shopContent"></div>
        </div>
      `;
    },

    // ============ 家具库（仅展示已获得、未摆放的家具）============
    furniture() {
      const inv = (State.state.furnitureInventory || []);
      const catOf = t => State.getCatalog(t) || { name: t, icon: '', category: '家具' };
      const groups = {};
      inv.forEach(it => {
        const c = catOf(it.type);
        (groups[c.category] = groups[c.category] || []).push(it);
      });
      const listHtml = Object.keys(groups).length ? `
        <div class="furni-list">
          ${Object.entries(groups).map(([cat, items]) => `
            <div class="furni-cat">
              <div class="furni-cat-title">${cat}</div>
              <div class="furni-grid">
                ${items.map(it => {
                  const c = catOf(it.type);
                  return `
                    <div class="furni-item in-inv" data-id="${it.id}" title="${c.name}">
                      <span class="fi-sprite"><img src="${c.icon}" alt="${c.name}" draggable="false" /></span>
                      <span class="fi-name">${c.name}</span>
                      <span class="fi-badge">未摆放</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="timeline-empty">
          <span class="emoji">🪑</span>
          家具库还是空的哦。<br>去商店逛逛，用金币把喜欢的小家具带回家。
        </div>
      `;
      return `
        <div class="popup-head">
          <div class="popup-title">家具库 · 我的家具</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="hint">这里只放「已经获得、还没摆进房间」的家具。<br>点一下就能摆进房间；想添置新家具，去商店看看。</div>
          ${listHtml}
          <button class="more-furni-btn" data-act="moreFurniture">🛒 更多家具（去商店）</button>
        </div>
      `;
    },

    // ============ 信件 ============
    letter() {
      const s = State.state;
      // AI 写信按钮（仅当管理后台开启了 letter 智能体）
      const aiBtn = State.aiEnabled('letter')
        ? `<button class="popup-btn ghost" data-act="aiLetter" style="margin-top:10px;">✨ 让小我写一封信</button>`
        : '';
      if (s.letters.length === 0) {
        return `
          <div class="popup-head">
            <div class="popup-title">✉️ 来自小我的信</div>
            <button class="popup-close" aria-label="关闭">✕</button>
          </div>
          <div class="popup-body">
            <div class="timeline-empty">
              <span class="emoji">💌</span>
              现在还没有信哦。<br>当你的状态有了一些变化，<br>小我会写一封信给你。
            </div>
            ${aiBtn}
          </div>
        `;
      }
      const latest = s.letters[s.letters.length - 1];
      return `
        <div class="popup-head">
          <div class="popup-title">✉️ 来自小我的信</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="chapter" style="background:rgba(255,240,220,0.6);">
            <div class="chapter-content" style="font-size:14px; line-height:1.9; color:#5a3a20;">
              "${latest.content}"
            </div>
            <div class="chapter-title" style="margin-top:10px; text-align:right;">
              —— ${Utils.formatDate(latest.date)} · 小我
            </div>
          </div>
          <div class="hint" style="margin-top:14px;">已收到 ${s.letters.length} 封信</div>
          ${aiBtn}
        </div>
        <div class="popup-foot">
          <button class="popup-btn primary" data-act="close">收下了</button>
        </div>
      `;
    },

    // ============ 置物架 ============
    shelf() {
      const s = State.state;
      return `
        <div class="popup-head">
          <div class="popup-title">🪴 置物架 · 记忆锚点</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="hint">把田地收获的、商店买的物件摆放在这里。<br>它们代表你走过的路。</div>
          <div style="margin-top:12px;">
            <div class="chapter-title">正在摆放（${s.placements.length}）</div>
            ${s.placements.length === 0 ? `
              <div class="hint" style="padding:8px 0;">还没有摆件。去田地收获，或去商店逛逛吧。</div>
            ` : `
              <div class="shop-grid" style="margin-top:6px;">
                ${s.placements.map(p => `
                  <div class="shop-item owned" data-id="${p.id}" data-act="removeFromShelf">
                    <div class="shop-item-emoji">${p.emoji}</div>
                    <div class="shop-item-name">${p.name}</div>
                    <div style="font-size:10px;color:#88b8a0;">已摆放</div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
          <div style="margin-top:14px;">
            <div class="chapter-title">仓库（${s.gardenWarehouse.length}）</div>
            ${s.gardenWarehouse.length === 0 ? `
              <div class="hint" style="padding:8px 0;">仓库空空的。</div>
            ` : `
              <div class="shop-grid" style="margin-top:6px;">
                ${s.gardenWarehouse.map(p => `
                  <div class="shop-item" data-id="${p.id}" data-act="moveToShelf">
                    <div class="shop-item-emoji">${p.emoji}</div>
                    <div class="shop-item-name">${p.name}</div>
                    <div style="font-size:10px;color:#b89868;">点击摆放</div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      `;
    },

    // ============ 本心对语 - 与森林里的小我通信 ============
    dialogue() {
      const s = State.state;
      const msgs = s.tab2Dialogue || [];
      return `
        <div class="popup-head">
          <div class="popup-title">🌿 本心对语</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body dialogue-body">
          <div class="dialogue-hint">把烦恼、心事、悄悄话留在这里。<br>森林里的小我会时常回信，通常 <b>1 – 3 分钟</b> 内慢慢送到。</div>
          <div class="dialogue-thread" id="diaThread">${dialogueThreadHtml(msgs)}</div>
          <div class="dialogue-input">
            <textarea class="popup-textarea" id="diaText" placeholder="和小我说两句悄悄话…" maxlength="500"></textarea>
            <button class="popup-btn primary" data-act="diaSend">寄出</button>
          </div>
        </div>
      `;
    },

    // ============ 心灵树洞 - 日记记录（含 AI 引导写作）============
    treehole(data = {}) {
      const s = State.state;
      const diaries = s.treeholeDiaries || [];
      // 当前模式：列表 / 新建 / 编辑
      const mode = data.mode || 'list';
      const editId = data.editId || null;

      // ===== 列表视图 =====
      if (mode === 'list') {
        const sorted = [...diaries].sort((a, b) => new Date(b.date) - new Date(a.date));
        const listHtml = sorted.length === 0
          ? `<div class="timeline-empty"><span class="emoji">🕳️</span>心灵树洞还是空的。<br/>写第一篇日记，把今天的感受放进来吧～</div>`
          : `<div class="treehole-list">${sorted.map(d => `
              <div class="treehole-card" data-id="${d.id}" data-act="thEdit">
                <div class="th-card-head">
                  <div class="th-card-title">${escHtml(d.title || '（无标题）')}</div>
                  <div class="th-card-date">${Utils.formatDate(d.date)}</div>
                </div>
                <div class="th-card-mood">
                  ${d.mood ? `<span class="popup-tag mood-tag">${escHtml(d.mood)}</span>` : ''}
                  ${d.aiGuided ? `<span class="popup-tag ai-tag">✨ AI 引导写作</span>` : ''}
                  ${(d.tags || []).slice(0, 3).map(t => `<span class="popup-tag">${escHtml(t)}</span>`).join('')}
                </div>
                <div class="th-card-preview">${escHtml(String(d.content || '').slice(0, 80))}${(d.content || '').length > 80 ? '…' : ''}</div>
                <button class="th-card-del" data-id="${d.id}" data-act="thDel" title="删除">🗑️</button>
              </div>
            `).join('')}</div>`;
        return `
          <div class="popup-head">
            <div class="popup-title">🕳️ 心灵树洞 · 我的日记</div>
            <button class="popup-close" aria-label="关闭">✕</button>
          </div>
          <div class="popup-body">
            <div class="hint">把心事、情绪、碎碎念都写进这里。只有你能看到。<br/>不知道怎么下笔？写新日记时勾选「让 AI 引导我」，AI 会一步步陪你写。</div>
            <button class="popup-btn primary" data-act="thNew" style="width:100%;margin-top:10px;">📝 写新日记</button>
            <div class="chapter-title" style="margin-top:16px;">过往日记（${diaries.length}）</div>
            ${listHtml}
          </div>
        `;
      }

      // ===== 新建 / 编辑视图 =====
      const editDiary = editId ? diaries.find(d => d.id === editId) : null;
      if (editId && !editDiary) {
        return `<div class="popup-body"><div class="hint">日记不见了…</div><div class="popup-foot"><button class="popup-btn primary" data-act="thBack">返回列表</button></div></div>`;
      }
      const d = editDiary || {};
      const aiGuided = d.aiGuided === true;
      const aiQuestions = Array.isArray(d.aiQuestions) ? d.aiQuestions : [];
      const aiThoughts = d.aiThoughts || '';
      return `
        <div class="popup-head">
          <div class="popup-title">🕳️ ${editDiary ? '编辑日记' : '写新日记'}</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body treehole-edit-body">
          <div class="cfg-group">
            <div class="cfg-label">标题</div>
            <input class="popup-input" id="thTitle" placeholder="今天的一句话…" maxlength="50" value="${escHtml(d.title || '')}" />
          </div>
          <div class="cfg-group">
            <div class="cfg-label">今天的心情</div>
            <div class="popup-tags" id="thMoodTags">
              ${['开心','平静','疲惫','焦虑','难过','迷茫','温暖','烦躁','放松','感动','无力'].map(m => `
                <span class="popup-tag mood-tag-pick ${d.mood === m ? 'selected' : ''}" data-mood="${m}">${m}</span>
              `).join('')}
            </div>
          </div>
          <div class="cfg-group">
            <label class="cfg-check">
              <input type="checkbox" id="thAIGuide" ${aiGuided ? 'checked' : ''} />
              <span><b>让 AI 引导我写</b>（不知道怎么写的时候勾我～AI 会问你 3 层问题：今天的情绪→发生的事→内心/哲学的思考，最后 AI 也会写下它的想法）</span>
            </label>
          </div>

          <!-- AI 引导区（勾选时显示） -->
          <div id="thAIGuideArea" style="display:${aiGuided ? 'block' : 'none'};">
            <div class="chapter-title" style="margin-top:6px;">🌱 AI 引导提问</div>
            <div class="hint" style="font-size:12px;">从浅到深，一层一层回答。不一定全答，想写的写就好。</div>
            <div id="thAIQuestionsList">${aiQuestionsHtml(aiQuestions)}</div>
            ${State.aiEnabled('diaryguide') ? `
              <div class="th-ai-row">
                <button class="popup-btn ghost" data-act="thGenQuestions" id="thGenQBtn">✨ 让 AI 重新出引导题</button>
                <button class="popup-btn" data-act="thGenThoughts" id="thGenTBtn">💭 让 AI 写下它的想法</button>
              </div>
            ` : `
              <div class="hint" style="font-size:12px;color:#b98a4a;">💡 后台未开启「日记引导」AI 智能体。当前使用内置引导题；如需 AI 出题 + AI 想法，可在管理后台 → AI 配置 → 启用 <code>diaryguide</code>。</div>
              <div class="th-ai-row">
                <button class="popup-btn ghost" data-act="thDefaultQuestions">🔄 使用另一组内置引导题</button>
              </div>
            `}
            <!-- AI 想法展示区 -->
            ${aiThoughts ? `
              <div class="chapter" style="background:rgba(230,244,255,0.7);margin-top:12px;">
                <div class="chapter-title">💭 AI 的一点想法</div>
                <div class="chapter-content" id="thAIThoughtsText" style="line-height:1.9;">${escHtml(aiThoughts).replace(/\n/g,'<br/>')}</div>
              </div>
            ` : `<div id="thAIThoughtsWrap"></div>`}
          </div>

          <div class="cfg-group" style="margin-top:10px;">
            <div class="cfg-label">日记正文${aiGuided ? '（AI 会把上面的问答整理进来，你也可以自己再润色）' : ''}</div>
            <textarea class="popup-textarea" id="thContent" placeholder="把今天想记录的一切写在这里…" maxlength="5000" style="min-height:160px;">${escHtml(d.content || '')}</textarea>
          </div>
        </div>
        <div class="popup-foot">
          <button class="popup-btn" data-act="thBack">← 返回列表</button>
          <button class="popup-btn primary" data-act="thSave" data-edit-id="${editId || ''}">💾 保存日记</button>
        </div>
      `;
    },

    // ============ 农场：种下技能（整块地 = 1 个种植位）============
    farmPlant() {
      const crops = State.farmCropCatalog;
      return `
        <div class="popup-head">
          <div class="popup-title">🌱 种下一个想学的技能</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <input class="popup-input" id="fp-name" type="text" placeholder="技能名，如：学吉他" maxlength="20" />
          <div class="hint" style="margin-top:10px;">选一种作物代表它（每 ${'<span id="fp-mps"></span>'} 分钟长一阶）：</div>
          <div class="seed-list" id="fp-crops" style="margin-top:6px;">
            ${crops.map(c => `
              <div class="seed-item" data-crop="${c.key}">
                <div class="seed-emoji">${c.emoji}</div>
                <div class="seed-info">
                  <div class="seed-name">${c.name}</div>
                  <div class="seed-desc">${c.stages.length} 阶生长 · 每阶 ${c.minutesPerStage} 分钟</div>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="hint" style="margin-top:12px;">可选：设一个阶段性小目标（完成后 +积分 推进生长）</div>
          <div class="popup-row" style="margin-top:6px;">
            <input class="popup-input" id="fp-goal-label" type="text" placeholder="目标名，如：能弹一首歌" maxlength="24" style="flex:2;" />
            <input class="popup-input" id="fp-goal-pts" type="number" placeholder="积分" min="0" style="flex:1;" />
          </div>
        </div>
        <div class="popup-foot">
          <button class="popup-btn" data-act="cancel">再想想</button>
          <button class="popup-btn primary" data-act="plant">种下</button>
        </div>
      `;
    },

    // ============ 农场：记录学习 / 管理目标 / 收获（单地块）============
    farmLog() {
      const p = State.getFarmMainPlot();
      if (!p) return `<div class="popup-body">这块地还没种东西，点击土地种下一个技能吧。</div>`;
      const crop = State.getFarmCrop(p.cropKey);
      if (!crop) return `<div class="popup-body">作物配置丢失…</div>`;
      const stage = State.farmStageOf(p);
      const stageName = crop.stages[Math.min(stage, crop.stages.length-1)].name || '';
      const next = stage < crop.stages.length - 1 ? crop.minutesPerStage * (stage + 1) : null;
      const remain = next ? Math.max(0, next - p.progress) : 0;
      return `
        <div class="popup-head">
          <div class="popup-title">${crop.emoji} ${p.skillName}</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div style="text-align:center;">
            <img src="${crop.stages[Math.min(stage,crop.stages.length-1)].image}" alt="${stageName}" style="width:96px;height:72px;object-fit:contain;image-rendering:pixelated;" />
          </div>
          <div style="text-align:center;font-size:13px;color:#5a3a20;margin-top:4px;">${stageName}阶（${stage+1}/${crop.stages.length}）· 累计 ${p.progress} 分钟</div>
          ${next ? `<div class="hint" style="text-align:center;">距下一阶还差 ${remain}（分钟/积分）</div>` : `<div class="hint" style="text-align:center;color:#c7742a;">✨ 已成熟，可收获纪念</div>`}

          <div class="chapter-title" style="margin-top:14px;">⏱️ 记录今天的学习</div>
          <div class="popup-row" style="margin-top:6px;">
            <input class="popup-input" id="fl-min" type="number" placeholder="分钟" min="0" style="flex:1;" />
            <input class="popup-input" id="fl-note" type="text" placeholder="学了什么" maxlength="60" style="flex:2;" />
          </div>
          <button class="popup-btn primary" data-act="log" style="width:100%;margin-top:6px;">记一笔</button>

          <div class="chapter-title" style="margin-top:14px;">🎯 阶段性小目标</div>
          <div class="seed-list" style="margin-top:6px;">
            ${p.goals.length === 0 ? `<div class="hint" style="padding:6px 0;">还没设小目标。</div>` : p.goals.map(g => `
              <div class="seed-item" data-goal="${g.id}" style="cursor:pointer;">
                <div class="seed-emoji">${g.completed ? '✅' : '⬜'}</div>
                <div class="seed-info">
                  <div class="seed-name">${g.label}</div>
                  <div class="seed-desc">+${g.points} 积分 · 点击切换完成</div>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="popup-row" style="margin-top:6px;">
            <input class="popup-input" id="fl-goal-label" type="text" placeholder="新目标名" maxlength="24" style="flex:2;" />
            <input class="popup-input" id="fl-goal-pts" type="number" placeholder="积分" min="0" style="flex:1;" />
            <button class="popup-btn" data-act="addgoal">＋</button>
          </div>

          <div style="margin-top:14px;">
            <button class="popup-btn ghost" data-act="remove" style="width:100%;">移除这块作物（不收获）</button>
            ${p.matured || stage >= crop.stages.length-1 ? `<button class="popup-btn primary" data-act="harvest" style="width:100%;margin-top:6px;">🎁 收获纪念</button>` : ''}
          </div>
        </div>
      `;
    },

    // ============ 农场日志（单技能 + 仓库）============
    cottage() {
      const s = State.state;
      const p = s.farmMainPlot;
      return `
        <div class="popup-head">
          <div class="popup-title">📔 农场日志</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="chapter-title">🌱 正在耕作的技能</div>
          ${!p ? `<div class="hint" style="padding:8px 0;">去点击土地种下一个想学的技能吧。</div>` : (() => {
            const crop = State.getFarmCrop(p.cropKey); if (!crop) return '';
            const stage = State.farmStageOf(p);
            const mature = p.matured || stage >= crop.stages.length - 1;
            const name = crop.stages[Math.min(stage,crop.stages.length-1)].name || '';
            return `
              <div class="seed-item" data-act="openPlot" style="cursor:pointer;">
                <div class="seed-emoji">${crop.emoji}</div>
                <div class="seed-info">
                  <div class="seed-name">${p.skillName}</div>
                  <div class="seed-desc">${mature ? '✨ 已成熟' : `${name}阶 · 累计 ${p.progress}/${crop.minutesPerStage*(stage+1)}`}</div>
                </div>
              </div>
            `;
          })()}
          <div class="chapter-title" style="margin-top:14px;">📦 收获纪念（${s.farmWarehouse.length}）</div>
          ${s.farmWarehouse.length === 0 ? `<div class="hint" style="padding:8px 0;">空空的。</div>` : `
            <div class="seed-list" style="margin-top:6px;">
              ${s.farmWarehouse.map(w => `
                <div class="seed-item" style="cursor:default;">
                  <div class="seed-emoji">${w.emoji}</div>
                  <div class="seed-info">
                    <div class="seed-name">${w.name}</div>
                    <div class="seed-desc">${w.source} · 累计 ${w.totalMinutes ?? w.progress} 分钟</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `;
    },

    // ============ 时间轴 ============
    timeline() {
      const points = [...State.state.starPoints].sort((a,b) => new Date(b.date) - new Date(a.date));
      return `
        <div class="popup-head">
          <div class="popup-title">🌌 成长时间轴</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="hint">每颗星都是你走过的路。</div>
          <div style="margin-top:14px;">
            <button class="popup-btn" data-act="addStar" style="width:100%;">＋ 点亮一颗新星</button>
          </div>
          ${points.length === 0 ? `
            <div class="timeline-empty">
              <span class="emoji">✨</span>
              还没有星点。<br>去做点照顾自己的小事，<br>小我会帮你记下第一颗。
            </div>
          ` : `
            <div class="timeline" style="margin-top:14px;">
              ${points.map(p => `
                <div class="timeline-item" data-id="${p.id}" data-act="starDetail" style="cursor:pointer;">
                  <div class="timeline-content">
                    <div class="timeline-title">${p.title}</div>
                    <div class="timeline-meta">${Utils.formatFullDate(p.date)} · ${typeLabel(p.type)}</div>
                    ${p.desc ? `<div class="timeline-desc">${p.desc}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `;
    },

    // ============ 成长档案 ============
    archive() {
      const s = State.state;
      return `
        <div class="popup-head">
          <div class="popup-title">📚 星之浮书 · 成长档案</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="hint">你走过的每一个足迹，都悄悄长成了现在的你。</div>
          <div class="stat-row"><span class="stat-label">💗 关爱值</span><span class="stat-value">${s.careValue}</span></div>
          <div class="stat-row"><span class="stat-label">🪙 予己金币</span><span class="stat-value">${s.coin}</span></div>
          <div class="stat-row"><span class="stat-label">💪 健康值</span><span class="stat-value">${s.healthValue}</span></div>
          <div class="stat-row"><span class="stat-label">🌸 开心值</span><span class="stat-value">${s.happinessValue}</span></div>
          <div class="stat-row"><span class="stat-label">🛋️ 舒适值</span><span class="stat-value">${s.comfortValue}</span></div>
          <div class="stat-row"><span class="stat-label">✉️ 收到的信</span><span class="stat-value">${s.letters.length}</span></div>
          <div class="stat-row"><span class="stat-label">🌱 成长目标</span><span class="stat-value">${s.farmPlots.length}</span></div>
          <div class="stat-row"><span class="stat-label">⭐ 星点数</span><span class="stat-value">${s.starPoints.length}</span></div>
          <div class="stat-row"><span class="stat-label">📅 陪伴天数</span><span class="stat-value">${s.visitDates.length}</span></div>
        </div>
      `;
    },

    // ============ 星点详情 ============
    starDetail(data) {
      const p = State.state.starPoints.find(s => s.id === data.id);
      if (!p) return `<div class="popup-body">星点已消失</div>`;
      return `
        <div class="popup-head">
          <div class="popup-title">⭐ ${typeLabel(p.type)}</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="chapter" style="background:rgba(255,240,220,0.6);">
            <div class="chapter-title">${p.title}</div>
            <div class="chapter-content">${p.desc || ''}</div>
            <div class="chapter-title" style="margin-top:10px; text-align:right; font-size:10px;">
              ${Utils.formatFullDate(p.date)}
            </div>
          </div>
        </div>
        <div class="popup-foot">
          <button class="popup-btn primary" data-act="close">收下了</button>
        </div>
      `;
    },

    // ============ 新建星点 ============
    newStar() {
      return `
        <div class="popup-head">
          <div class="popup-title">✨ 点亮新星</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="hint">写下你此刻的卡点、顿悟，或一个重要时刻。<br>它会静静挂在你的星迹里。</div>
          <div style="margin-top:14px;">
            <div class="chapter-title">想记住的是…</div>
            <input class="popup-input" id="newStarTitle" placeholder="一句话标题" maxlength="40" />
            <textarea class="popup-textarea" id="newStarDesc" placeholder="想记下来的内容…" style="margin-top:8px;"></textarea>
            <div class="popup-tags" id="newStarImp" style="margin-top:8px;">
              <span class="popup-tag" data-tag="1">普通</span>
              <span class="popup-tag" data-tag="2">重要</span>
              <span class="popup-tag" data-tag="3">✨ 顿悟</span>
            </div>
          </div>
        </div>
        <div class="popup-foot">
          <button class="popup-btn" data-act="cancel">再想想</button>
          <button class="popup-btn primary" data-act="saveStar">点亮</button>
        </div>
      `;
    },

    // ============ 照顾任务设置 ============
    careConfig(data = {}) {
      const id = data.id;
      const opt = State.state.careOptions.find(o => o.id === id)
               || State.state.customCareOptions.find(o => o.id === id);
      if (!opt) return '<div class="popup-body"><div class="hint">任务不存在</div></div>';
      const mode = opt.mode || 'daily';
      const pinned = opt.pinned || false;
      const skipped = opt.skipped || false;
      return `
        <div class="popup-head">
          <div class="popup-title">${opt.emoji} ${opt.label}</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="cfg-group">
            <div class="cfg-label">出现方式</div>
            <div class="cfg-seg" id="cfgMode">
              <span class="cfg-opt ${mode === 'daily' ? 'selected' : ''}" data-val="daily">每天一次</span>
              <span class="cfg-opt ${mode === 'recurring' ? 'selected' : ''}" data-val="recurring">一直出现</span>
            </div>
            <div class="cfg-desc">「一直出现」像喝水一样，完成后会沉到底部，可以再做一次。</div>
          </div>
          <div class="cfg-group">
            <div class="cfg-label">置顶</div>
            <div class="cfg-seg" id="cfgPin">
              <span class="cfg-opt ${!pinned ? 'selected' : ''}" data-val="false">不置顶</span>
              <span class="cfg-opt ${pinned === 'today' ? 'selected' : ''}" data-val="today">今日置顶</span>
              <span class="cfg-opt ${pinned === 'always' ? 'selected' : ''}" data-val="always">一直置顶</span>
            </div>
          </div>
          <div class="cfg-group">
            <div class="cfg-label">今天状态</div>
            <div class="cfg-seg" id="cfgSkip">
              <span class="cfg-opt ${!skipped ? 'selected' : ''}" data-val="false">正常</span>
              <span class="cfg-opt ${skipped ? 'selected' : ''}" data-val="true">跳过今天</span>
            </div>
          </div>
        </div>
        <div class="popup-foot">
          <button class="popup-btn danger" data-act="delCare">删除</button>
          <button class="popup-btn" data-act="cancel">取消</button>
          <button class="popup-btn primary" data-act="save">保存</button>
        </div>
      `;
    },

    // ============ 家具"获取记录"面板 ============
    furniInfo(data = {}) {
      const it = State.state.roomItems.find(r => r.id === data.id);
      if (!it) return '<div class="popup-body"><div class="hint">家具不见了…</div></div>';
      const cat = State.getCatalog(it.type) || { name: it.type, icon: '' };
      const acq = Tab1.acquisitionOf(it);
      const obtainedTxt = acq.obtainedAt
        ? Utils.formatFullDate(acq.obtainedAt)
        : '陪你很久了';
      const hasCustomStory = !!(it.story && String(it.story).trim());
      const storyToShow = hasCustomStory ? it.story : acq.story;
      const storyTitle = hasCustomStory ? '你记下的故事' : '它陪你的经历';
      const SOURCE_TAGS = ['初始资产', '亲手布置', '购置', '礼物', '其它'];
      const sourceEsc = (acq.source || '').replace(/"/g, '&quot;');
      const aiBtn = State.aiEnabled('furni_story')
        ? `<button type="button" class="popup-btn ghost" id="furniAiBtn" style="margin-top:8px;" data-id="${it.id}">✨ 让小我根据近况写一段经历</button>`
        : '';
      return `
        <div class="popup-head">
          <div class="popup-title">
            <span class="fi-sprite" style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;margin-right:6px;vertical-align:middle;">
              <img src="${cat.icon}" alt="${cat.name}" draggable="false" style="width:100%;height:100%;object-fit:contain;" />
            </span>${cat.name}
          </div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="chapter" style="background:rgba(255,240,220,0.7); margin-bottom:14px;">
            <div class="chapter-title">💮 ${storyTitle}</div>
            <div class="chapter-content" id="furniStoryPreview" style="line-height:1.9; font-size:14px; color:#5a3a20;">
              ${storyToShow.replace(/\n/g, '<br/>').replace(/</g,'&lt;').replace(/"/g,'&quot;')}
            </div>
            ${!hasCustomStory ? `<div class="hint" style="margin-top:8px; text-align:right; font-size:10px;">（可以在下面改成你自己的故事）</div>` : ''}
          </div>

          <div class="cfg-group">
            <div class="cfg-label">获得于</div>
            <div class="chapter-content">📅 ${obtainedTxt}</div>
          </div>

          <div class="cfg-group">
            <div class="cfg-label">怎么来到你身边的</div>
            <div class="popup-tags" id="furniSourceTags">
              ${SOURCE_TAGS.map(t => `<span class="popup-tag ${acq.source === t ? 'selected' : ''}" data-tag="${t}">${t}</span>`).join('')}
            </div>
            <input class="popup-input" id="furniSource" value="${sourceEsc}" placeholder="或自己写一个，比如：朋友送的 / 从老家带来的…" maxlength="24" style="margin-top:6px;" />
          </div>

          <div class="cfg-group">
            <div class="cfg-label">和它的故事${hasCustomStory ? '（已写）' : ''}</div>
            <textarea class="popup-textarea" id="furniStory" placeholder="写一句它对你的意义，或它陪你走过的日子…" maxlength="400">${(it.story || '').replace(/</g,'&lt;')}</textarea>
            ${aiBtn}
          </div>
        </div>
        <div class="popup-foot">
          <button class="popup-btn" data-act="cancel">关闭</button>
          <button class="popup-btn primary" data-act="saveFurni" data-id="${it.id}">记下来</button>
        </div>
      `;
    },

    // ============ 添加自定义照顾任务 ============
    addCare(data = {}) {
      return `
        <div class="popup-head">
          <div class="popup-title">＋ 添加照顾任务</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="cfg-group">
            <div class="cfg-label">图标</div>
            <input class="popup-input" id="addCareEmoji" placeholder="选一个 emoji，比如 🍵" maxlength="10" />
          </div>
          <div class="cfg-group">
            <div class="cfg-label">名称</div>
            <input class="popup-input" id="addCareLabel" placeholder="比如：泡一杯茶" maxlength="20" />
          </div>
          <div class="cfg-group">
            <div class="cfg-label">出现方式</div>
            <div class="cfg-seg" id="addCareMode">
              <span class="cfg-opt selected" data-val="daily">每天一次</span>
              <span class="cfg-opt" data-val="recurring">一直出现</span>
            </div>
          </div>
        </div>
        <div class="popup-foot">
          <button class="popup-btn" data-act="cancel">取消</button>
          <button class="popup-btn primary" data-act="save">添加</button>
        </div>
      `;
    },

    // ============ 星星详情卡片（Tab4 新星座） ============
    starCard(data) {
      const p = State.state.starPoints.find(s => s.id === data.id);
      if (!p) return `<div class="popup-body"><div class="hint">这颗星不见了…</div></div>`;
      const cat = State.pickCategoryByType(p.type);
      const CONS_META = {
        emotion:      { emoji: '🌸', name: '情绪觉察座' },
        hearttalk:    { emoji: '💌', name: '本心对话座' },
        milestone:    { emoji: '✨', name: '成就里程碑座' },
        selfcare:     { emoji: '🪴', name: '自我照顾座' },
        deepdiscover: { emoji: '🪞', name: '深度发现座' },
        growth:       { emoji: '🌱', name: '成长耕作座' },
      };
      const meta = CONS_META[cat] || CONS_META.milestone;
      const impGlyph = '✦'.repeat(Math.max(1, Math.min(3, p.importance || 1)));
      const ev = p.evidence || {};
      const isAI = typeof p.type === 'string' && p.type.startsWith('ai_');
      let srcHtml = '';
      if (isAI) {
        srcHtml = `🤖 <b>AI 深度挖掘</b><br/>基于你授权过的真实数据整理 · ${Utils.formatFullDate(p.date)}`;
      } else if (p.source) {
        srcHtml = `🔗 <b>源自你的真实记录</b><br/>📅 ${Utils.formatFullDate(p.date)} · ${escHtml(p.source)}`;
      } else if (ev.kind || ev.date || ev.ref) {
        const dateLine = ev.date ? `📅 ${Utils.formatFullDate(ev.date)} · ` : '';
        const kindLine = ev.kind ? `${escHtml(ev.kind)}` : '';
        const refLine  = ev.ref  ? `<br/>📝 ${escHtml(String(ev.ref).slice(0, 40))}` : '';
        srcHtml = `🔗 <b>源自你的真实记录</b><br/>${dateLine}${kindLine}${refLine}`;
      } else {
        srcHtml = `📅 ${Utils.formatFullDate(p.date)} · ${escHtml(typeLabel(p.type))}`;
      }
      const collected = !!(p.collected || p.pinned);
      return `
        <div class="popup-head">
          <div class="popup-title">${meta.emoji} ${meta.name}<span class="star-card-imp">${impGlyph}</span></div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="star-card-title">${escHtml(p.title)}</div>
          <div class="star-card-body">${escHtml(p.desc || '').replace(/\n/g,'<br/>')}</div>
          ${srcHtml ? `<div class="star-card-source">${srcHtml}</div>` : ''}
        </div>
        <div class="popup-foot">
          <button class="popup-btn ${collected ? '' : 'ghost'}"
                  data-act="togglePin" data-id="${p.id}" ${collected ? 'disabled' : ''}>
            ${collected ? '⭐ 已珍藏' : '⭐ 珍藏这颗星'}
          </button>
          <button class="popup-btn primary" data-act="close">关闭</button>
        </div>
      `;
    },

    // ============ 星座总结卡片（点击星座标签打开） ============
    constellationSummary(data) {
      const cat = data.category || data.cat || 'milestone';
      const CONS_META = {
        emotion:      { emoji: '🌸', name: '情绪觉察座',   tips:['多记录几次情绪','愿意写出此刻烦躁/平静的那一瞬间','同一天记录 3 次以上会出大星'] },
        hearttalk:    { emoji: '💌', name: '本心对话座',   tips:['第一次对小我说出心里话','累计 10 轮对话会出大星','小我回你的话里也许藏着一句答案'] },
        milestone:    { emoji: '✨', name: '成就里程碑座', tips:['陪自己 7 天会亮一颗大星','累计 5 次以上自我照顾会亮大星','回头看，你的星越来越多'] },
        selfcare:     { emoji: '🪴', name: '自我照顾座',   tips:['给今天的自己选一件小事做','同一件坚持 3 天会亮大星','加一件自定义照顾也会亮'] },
        deepdiscover: { emoji: '🪞', name: '深度发现座',   tips:['完成「自我手册」章节就亮星','写一篇成长笔记就亮星','每 6 小时 AI 会挖出 1 颗大星'] },
        growth:       { emoji: '🌱', name: '成长耕作座',   tips:['种下第一颗技能种子就亮一颗','种子进入成熟期会亮大星','技能收获后也算一段耕作'] },
      };
      const m = CONS_META[cat] || CONS_META.milestone;
      const points = State.state.starPoints.filter(p => State.pickCategoryByType(p.type) === cat);
      const pointsSorted = [...points].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
      const latest = pointsSorted[0];
      const collectedCount = points.filter(p => p.collected || p.pinned).length;
      // 简易"锁态"：一颗星也没有 + 对应数据源也空着 → 提示去做更多行为亮星
      const S = State.state;
      const EMPTY_MARK = {
        emotion:      { empty: !(S.emotionRecords||[]).length,                                               tip: '去「此刻」记录一次心情，这里会亮起' },
        hearttalk:    { empty: !(S.chatHistory||[]).some(x => x && x.role==='user'),                         tip: '去「遇见」和森林里的小我聊一句，这里会亮起' },
        milestone:    { empty: !(S.milestones||[]).length && (S.bubbleRecords||[]).length < 5,               tip: '完成 5 次自我照顾或添加一条里程碑，这里会亮起' },
        selfcare:     { empty: !(S.bubbleRecords||[]).length,                                                tip: '完成一次自我照顾打卡，这里会亮起' },
        deepdiscover: { empty: !(S.growthNotes||[]).length && !(S.starPoints||[]).filter(p => String(p.type||'').startsWith('ai_')).length && !Object.values(S.selfManual||{}).some(v => typeof v==='string' && !v.includes('还在认识中')), tip: '写一篇成长笔记 / 完成自我手册，AI 之后会挖出你没发现过的自己' },
        growth:       { empty: !(S.farmPlots||[]).length && !(S.farmWarehouse||[]).length,                   tip: '去「生长」种下一颗种子或技能，这里会亮起' },
      };
      const mark = EMPTY_MARK[cat] || { empty:false, tip:'' };
      const locked = points.length === 0 && mark.empty;
      return `
        <div class="popup-head">
          <div class="popup-title">${m.emoji} ${m.name}</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          ${locked
            ? `<div class="chapter" style="background:rgba(250,230,210,0.7);">
                 <div class="chapter-title">🔒 还没有亮星</div>
                 <div class="chapter-content">${escHtml(mark.tip)}</div>
               </div>`
            : `<div class="stat-row"><span class="stat-label">✦ 已点亮</span><span class="stat-value"><b>${points.length}</b> 颗${collectedCount ? `（珍藏 ${collectedCount}）` : ''}</span></div>`
          }
          ${latest && !locked ? `
            <div style="margin-top:14px;">
              <div class="chapter-title">最近一颗 · ${Utils.formatDate(latest.date)}</div>
              <div class="chapter" style="background:rgba(255,244,224,0.7); margin-top:6px;">
                <div class="chapter-content" style="line-height:1.8;">
                  <b>${escHtml(latest.title)}</b><br/>
                  <span style="color:#7a5035;">${escHtml(String(latest.desc||'').slice(0,50))}${latest.desc && latest.desc.length > 50 ? '…' : ''}</span>
                </div>
              </div>
            </div>
          ` : ''}
          ${!locked ? `
            <div style="margin-top:16px;">
              <div class="chapter-title">💡 想点亮更多星？</div>
              <ul style="margin:6px 0 0 16px; padding:0; line-height:2; font-family:var(--font-body); font-size:13px; color:#6a4030;">
                ${m.tips.map(t => `<li>${escHtml(t)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
        <div class="popup-foot">
          <button class="popup-btn primary" data-act="close">好的</button>
        </div>
      `;
    },

    // ============ 自我洞察说明书（镜子家具弹窗）============
    selfManual() {
      return `
        <div class="popup-head">
          <div class="popup-title">🪞 自我洞察说明书</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="manual-version">
            <span class="hint">版本更新于：<span id="manualUpdatedAt"></span></span>
          </div>
          <div class="manual-chapters">
            <div class="manual-chapter">
              <div class="manual-chapter-title">🌸 第一章 · 我是怎样的人</div>
              <div class="manual-chapter-body manual-ch1"></div>
            </div>
            <div class="manual-chapter">
              <div class="manual-chapter-title">✨ 第二章 · 我的优势</div>
              <div class="manual-chapter-body manual-ch2"></div>
            </div>
            <div class="manual-chapter">
              <div class="manual-chapter-title">⚠️ 第三章 · 我的雷区</div>
              <div class="manual-chapter-body manual-ch3"></div>
            </div>
            <div class="manual-chapter">
              <div class="manual-chapter-title">🤍 第四章 · 怎样好好对待我</div>
              <div class="manual-chapter-body manual-ch4"></div>
            </div>
            <div class="manual-chapter">
              <div class="manual-chapter-title">🌱 第五章 · 适合我的成长方式</div>
              <div class="manual-chapter-body manual-ch5"></div>
            </div>
          </div>
          <div class="manual-sources" style="margin-top:14px;">
            <button class="popup-btn ghost" data-act="toggleSources" style="width:100%;justify-content:flex-start;">
              <span class="chev">›</span> 查看小我读取了哪些数据来生成这份说明书
            </button>
            <div class="sources-detail hidden">
              <div class="hint" style="margin-top:8px;">
                说明书内容综合来源于你记录并授权给小我的以下六类数据：<br>
                · 🌸 情绪记录（此刻 · 心情标签 + 文字）<br>
                · 💧 自我照顾打卡（今日照顾气泡完成记录）<br>
                · 🌌 成长星点（星迹 · 里程碑、自我发现、星点正文）<br>
                · 🌻 花园耕作（生长 · 种下的种子 / 成长阶段 / 收获纪念）<br>
                · 🌲 本心对语（遇见 · 与小我的对话历史）<br>
                · ✉️ 小我信件（房间 · 小我的写给你的所有信）
              </div>
            </div>
          </div>
        </div>
        <div class="popup-foot">
          <div id="aiDisabledHint" class="hint hidden" style="flex:1 1 100%;margin-bottom:8px;">
            当前未配置 AI 智能体，请在后台开启「洞察」+「自我说明书」智能体后使用重新总结功能。
          </div>
          <button class="popup-btn" data-act="closeManual">完成</button>
          <button id="aiRegenBtn" class="popup-btn primary" data-act="regen">✨ 让 AI 重新总结我</button>
        </div>
      `;
    },
  };

  function typeLabel(t) {
    if (typeof t === 'string' && t.startsWith('mined_')) {
      const sub = t.replace('mined_', '');
      return ({
        // 新 6 星座 key
        emotion: '情绪记录', hearttalk: '本心对话', milestone: '成就挖掘',
        selfcare: '自我照顾', growth: '技能耕作', deepdiscover: '深度发现',
        welcome: '系统欢迎',
        bubble: '打卡记录', bubble_5: '累计打卡成就',
        emotion_record: '情绪记录', chat: '本心对话',
        farm_harvest: '技能收获', farm_plot: '技能耕作',
        note: '成长笔记', selfmanual: '自我手册',
        // 兼容旧 key
        dialogue: '本心挖掘', garden: '耕作挖掘',
      })[sub] || '模板挖掘';
    }
    if (typeof t === 'string' && t.startsWith('ai_')) return 'AI 深度挖掘';
    return ({
      letter: '小我的信',
      emotion: '情绪记录',
      discovery: '自我发现',
      farmPlant: '种下技能',
      farmLog: '技能记录',
      cottage: '农场日志',
      manual: '手动记录',
      spirit: '精神体验',
      care: '自我照顾',
      milestone: '里程碑',
      manual_star: '手动星',
      note: '心灵树洞',
    })[t] || '记录';
  }

  // HTML 转义：防止用户输入 / starPoints 文本直接插到模板里引起 XSS 或 DOM 错位
  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }

  // 弹窗内交互初始化
  const inits = {

    // 信件：AI 写信（管理员在后台开启 letter 智能体后可用）
    letter() {
      const btn = root().querySelector('[data-act="aiLetter"]');
      if (!btn) return;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const old = btn.textContent;
        btn.textContent = '小我在写…';
        try {
          const s = State.state;
          const ctx = [];
          if (s.careValue != null) {
            ctx.push(`用户目前：关爱值 ${s.careValue}、开心值 ${s.happinessValue}、健康值 ${s.healthValue}。`);
          }
          const recent = (s.emotionRecords || []).slice(-3)
            .map(r => `${(r.tags || []).join('/')}${r.text ? '：' + r.text : ''}`).join('；');
          if (recent) ctx.push('最近的情绪记录：' + recent);
          const messages = [{
            role: 'user',
            content: '请给这位正在学习「好好爱自己」的用户写一封温暖、不评判、像老朋友一样的信，'
              + '语气轻柔，不要说教，点到即止。'
              + (ctx.length ? ('\n参考背景：' + ctx.join(' ')) : ''),
          }];
          const r = await Api.callAI('letter', messages);
          State.addLetter(r.text, { ai: true });
          Utils.toast('小我写了一封信给你 ✉️');
          Popups.open('letter'); // 重新渲染，展示新信
        } catch (e) {
          Utils.toast(e.message || '写信失败了');
          btn.disabled = false;
          btn.textContent = old;
        }
      });
    },

    emotion() {
      // 标签选择
      root().querySelectorAll('#emoTags .popup-tag').forEach(t => {
        t.addEventListener('click', () => t.classList.toggle('selected'));
      });
      // 按钮
      bindAct('save', () => {
        const tags = Array.from(root().querySelectorAll('#emoTags .popup-tag.selected')).map(t => t.dataset.tag);
        const text = root().querySelector('#emoText').value.trim();
        if (tags.length === 0 && !text) {
          Utils.toast('可以选个词，或写一句话');
          return;
        }
        const s = State.state;
        s.emotionRecords.push({
          id: Utils.uid(),
          date: Utils.nowTs(),
          tags,
          text,
        });
        State.addCare(1);
        const got = State.addCoin(2);
        if (got > 0) {
          State.addHappiness(1);
          Utils.recalcComfort();
        }
        // 触发小我动画
        document.getElementById('xiaowo')?.classList.add('mood-happy');
        setTimeout(() => document.getElementById('xiaowo')?.classList.remove('mood-happy'), 1500);
        // 达到关爱值门槛 → 自动生成信件
        maybeGenerateLetter();
        // 添加星点
        s.starPoints.push({
          id: Utils.uid(),
          date: Utils.nowTs(),
          type: 'emotion',
          title: '记下了一刻心情',
          desc: tags.length ? `关键词：${tags.join('、')}` : text.slice(0, 30),
          importance: 1,
        });
        State.save();
        Tab1.refresh();
        Tab4.refresh();
        let msg = `记下了 · +1 关爱值${got > 0 ? ` +${got} 金币` : ''}`;
        Utils.toast(msg);
        close();
      });
      bindAct('cancel', close);
    },

    shop(data = {}) {
      const renderShop = (tab) => {
        const s = State.state;
        // 房间布置：直接读家具目录（带价格），每件都是独立可购买
        const items = tab === 'furniture'
          ? (State.roomCatalog || []).map(c => ({ id: c.type, type: c.type, name: c.name, price: c.price || 0, icon: c.icon }))
          : (tab === 'physical' ? s.shopItems.physical : s.shopItems.spirit);
        const content = root().querySelector('#shopContent');
        content.innerHTML = `
          <div class="shop-grid">
            ${items.map(it => {
              const isFurni = tab === 'furniture';
              return `
                <div class="shop-item ${isFurni ? 'furni' : (it.owned ? 'owned' : '')}" data-id="${it.id}" data-tab="${tab}">
                  ${isFurni
                    ? `<div class="shop-item-img"><img src="${it.icon}" alt="${it.name}" draggable="false" /></div>`
                    : `<div class="shop-item-emoji">${it.emoji}</div>`}
                  <div class="shop-item-name">${it.name}</div>
                  <div class="shop-item-price">🪙 ${it.price}</div>
                  ${!isFurni && it.desc ? `<div style="font-size:10px;color:#8b7d6b;margin-top:2px;">${it.desc}</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `;
        content.querySelectorAll('.shop-item').forEach(el => {
          el.addEventListener('click', () => {
            const id = el.dataset.id;
            const item = items.find(x => x.id === id);
            if (!item) return;
            // 房间布置：购买后进入「家具库」（已获得、未摆放）
            if (tab === 'furniture') {
              const price = item.price || 0;
              if (price > 0 && s.coin < price) {
                Utils.toast('金币还不够，再照顾自己几天吧～');
                return;
              }
              if (price > 0) {
                s.coin -= price;
                const coinEl = document.getElementById('coinDisplay');
                if (coinEl) coinEl.textContent = '金币 ' + s.coin;
              }
              s.furnitureInventory.push({
                id: 'fi-' + Utils.uid(),
                type: item.type,
                obtainedAt: Utils.nowTs(),
                source: '购置',
              });
              s.starPoints.push({
                id: Utils.uid(),
                date: Utils.nowTs(),
                type: 'care',
                title: `购置了「${item.name}」`,
                desc: '用金币把一件新家具带回了家。',
                importance: 2,
              });
              State.save();
              Tab1.refresh();
              Tab4.refresh();
              Utils.toast(`已收入家具库 · 🪙${price} 「${item.name}」`);
              renderShop(tab);
              return;
            }
            if (item.owned && tab === 'physical') {
              Utils.toast('已经在仓库里了～');
              return;
            }
            if (s.coin < item.price) {
              Utils.toast('金币还不够，再照顾自己几天吧～');
              return;
            }
            if (tab === 'physical') {
              s.coin -= item.price;
              item.owned = true;
              s.gardenWarehouse.push({
                type: 'shop',
                id: Utils.uid(),
                itemId: item.id,
                name: item.name,
                emoji: item.emoji,
                source: '予己商店',
                bonus: item.bonus,
              });
              s.starPoints.push({
                id: Utils.uid(),
                date: Utils.nowTs(),
                type: 'care',
                title: `犒劳了「${item.name}」`,
                desc: '善待自己之后，给自己一个小礼物。',
                importance: 2,
              });
              State.addHappiness(item.bonus.happiness || 0);
              State.addHealth(item.bonus.health || 0);
              Utils.recalcComfort();
              State.save();
              Tab1.refresh();
              Tab4.refresh();
              Utils.toast(`已收入仓库 · +${item.bonus.happiness || 0}开心 +${item.bonus.health || 0}健康`);
              renderShop(tab);
            } else {
              // 精神体验
              s.coin -= item.price;
              State.addHappiness(item.bonus.happiness || 0);
              Utils.recalcComfort();
              s.starPoints.push({
                id: Utils.uid(),
                date: Utils.nowTs(),
                type: 'spirit',
                title: `体验了「${item.name}」`,
                desc: item.desc || '',
                importance: 3,
              });
              State.save();
              Tab1.refresh();
              Tab4.refresh();
              Utils.toast(`✨ ${item.name} · 开心值 +${item.bonus.happiness || 0}`);
              close();
            }
          });
        });
      };
      // tab 切换
      root().querySelectorAll('.shop-tab').forEach(t => {
        t.addEventListener('click', () => {
          root().querySelectorAll('.shop-tab').forEach(x => x.classList.remove('active'));
          t.classList.add('active');
          renderShop(t.dataset.tab);
        });
      });
      const startTab = data && data.tab ? data.tab : 'physical';
      const startEl = root().querySelector('.shop-tab[data-tab="' + startTab + '"]');
      if (startEl) {
        root().querySelectorAll('.shop-tab').forEach(x => x.classList.remove('active'));
        startEl.classList.add('active');
      }
      renderShop(startTab);
    },

    furniture() {
      root().querySelectorAll('.furni-item').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.dataset.id;
          if (typeof Tab1.placeFromInventory !== 'function') return;
          const ok = Tab1.placeFromInventory(id);
          if (ok) {
            // 该件已移出库存，重开家具库刷新列表（addRoomItem 已提示）
            Popups.close();
            Popups.open('furniture');
          }
        });
      });
      const more = root().querySelector('[data-act="moreFurniture"]');
      if (more) more.addEventListener('click', () => {
        Popups.close();
        Popups.open('shop', { tab: 'furniture' });
      });
    },

    letter() {
      bindAct('close', close);
    },

    shelf() {
      bindAct('removeFromShelf', e => {
        const id = e.currentTarget.dataset.id;
        const s = State.state;
        const idx = s.placements.findIndex(p => p.id === id);
        if (idx >= 0) {
          const item = s.placements[idx];
          s.placements.splice(idx, 1);
          s.gardenWarehouse.push(item);
          State.save();
          Utils.toast('已收回仓库');
          open('shelf');
        }
      });
      bindAct('moveToShelf', e => {
        const id = e.currentTarget.dataset.id;
        const s = State.state;
        const idx = s.gardenWarehouse.findIndex(p => p.id === id);
        if (idx >= 0) {
          const item = s.gardenWarehouse[idx];
          s.gardenWarehouse.splice(idx, 1);
          s.placements.push(item);
          State.addHappiness(item.bonus?.happiness || 0);
          State.addHealth(item.bonus?.health || 0);
          Utils.recalcComfort();
          State.save();
          Utils.toast('已摆到置物架');
          open('shelf');
        }
      });
    },

    // ============ 本心对语 - 寄出与回信 ============
    dialogue() {
      root().querySelector('#diaText')?.focus();
      bindAct('diaSend', sendDialogueMsg);
      bindAct('cancel', close);
      // Enter 发送（Shift+Enter 换行）
      root().querySelector('#diaText')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendDialogueMsg();
        }
      });
    },

    // ============ 心灵树洞：列表 + 新建/编辑（含 AI 引导）============
    treehole(data = {}) {
      const s = State.state;
      const mode = data.mode || 'list';
      const _tmpMood = { val: data.mood || '' };
      const _tmpGuide = { val: data.guided };

      // ===== 列表模式绑定 =====
      if (mode === 'list') {
        bindAct('thNew', () => {
          Popups.close();
          setTimeout(() => Popups.open('treehole', { mode: 'edit' }), 50);
        });
        bindAct('thEdit', (e) => {
          const id = e.currentTarget.dataset.id;
          Popups.close();
          setTimeout(() => Popups.open('treehole', { mode: 'edit', editId: id }), 50);
        });
        bindAct('thDel', async (e) => {
          e.stopPropagation();
          const id = e.currentTarget.dataset.id;
          if (!confirm('确认删除这篇日记？删了就找不回来啦～')) return;
          const arr = s.treeholeDiaries || [];
          const idx = arr.findIndex(x => x.id === id);
          if (idx >= 0) { arr.splice(idx, 1); State.save(); Utils.toast('已删除'); }
          Popups.close();
          setTimeout(() => Popups.open('treehole', { mode: 'list' }), 50);
        });
        return;
      }

      // ===== 编辑模式绑定 =====
      // 心情标签
      const tagWrap = root().querySelector('#thMoodTags');
      if (tagWrap) {
        // 恢复 data 中暂存的 mood（AI 出题切回可能丢失）
        if (_tmpMood.val) {
          tagWrap.querySelectorAll('.mood-tag-pick').forEach(el => {
            el.classList.toggle('selected', el.dataset.mood === _tmpMood.val);
          });
        }
        tagWrap.querySelectorAll('.mood-tag-pick').forEach(t => {
          t.addEventListener('click', () => {
            tagWrap.querySelectorAll('.mood-tag-pick').forEach(x => x.classList.remove('selected'));
            t.classList.add('selected');
            _tmpMood.val = t.dataset.mood;
          });
        });
      }
      // AI 引导开关
      const cb = root().querySelector('#thAIGuide');
      const area = root().querySelector('#thAIGuideArea');
      if (cb && area) {
        cb.addEventListener('change', () => {
          area.style.display = cb.checked ? 'block' : 'none';
          _tmpGuide.val = cb.checked;
          if (cb.checked) {
            const list = root().querySelector('#thAIQuestionsList');
            if (list && !list.children.length) {
              list.innerHTML = aiQuestionsHtml(defaultGuideQuestions());
            }
          }
        });
      }
      // 换一组内置引导题
      bindAct('thDefaultQuestions', () => {
        const list = root().querySelector('#thAIQuestionsList');
        if (!list) return;
        const qs = collectTHQuestions();
        // 记录已有回答（按问题文本匹配）
        const ansMap = {};
        qs.forEach(x => { if ((x.a || '').trim()) ansMap[x.q] = x.a; });
        const next = defaultGuideQuestions(Math.floor(Math.random() * GUIDE_QUESTION_SETS.length));
        // 恢复相同问题的回答
        next.forEach(x => { if (ansMap[x.q]) x.a = ansMap[x.q]; });
        list.innerHTML = aiQuestionsHtml(next);
      });
      // AI 出题（替换引导题）
      bindAct('thGenQuestions', async () => {
        const btn = root().querySelector('#thGenQBtn');
        if (!btn) return;
        btn.disabled = true; const old = btn.textContent; btn.textContent = 'AI 出题中…';
        try {
          const title = root().querySelector('#thTitle')?.value.trim() || '';
          const mood = _tmpMood.val || (root().querySelector('#thMoodTags .mood-tag-pick.selected')?.dataset.mood) || '';
          const sys = '你是一个温柔陪伴用户写日记的引导者。请生成 6 个中文引导问题，严格分 3 层（每层 2 题）：L1 情绪层（关于用户今天的心情/感受）、L2 事件层（关于今天发生了什么）、L3 内心/哲学层（关于内心需求/价值观/人生视角）。请用 JSON 返回，格式固定为数组，每个元素形如 {"tier":"L1 · 情绪层","tierEmoji":"🌸","q":"问题文本"}，不要加多余文字或 Markdown 包裹。';
          const user = `用户想写一篇日记${title ? '，标题意向：「' + title + '」' : ''}${mood ? '，当前心情：' + mood : ''}。请据此生成 6 道最能帮 TA 打开话匣子的引导题。`;
          const r = await Api.callAI('diaryguide', [
            { role: 'system', content: sys },
            { role: 'user', content: user },
          ]);
          if (!r || !r.text) throw new Error('AI 没返回结果');
          // 解析 JSON：可能被 ```json 包裹
          let txt = r.text.trim();
          const m = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (m) txt = m[1].trim();
          let parsed = null;
          try { parsed = JSON.parse(txt); } catch(_) { parsed = null; }
          if (!Array.isArray(parsed)) {
            // 降级：用默认题
            throw new Error('AI 返回格式无法解析，换用内置引导题');
          }
          const qs = parsed.map(x => ({
            tier: x.tier || 'L?',
            tierEmoji: x.tierEmoji || '🌿',
            q: String(x.q || '').trim(),
            a: '',
          })).filter(x => x.q);
          if (!qs.length) throw new Error('AI 没出题目');
          const list = root().querySelector('#thAIQuestionsList');
          if (list) list.innerHTML = aiQuestionsHtml(qs);
          Utils.toast('✨ AI 已为你定制了 6 道引导题');
        } catch (e) {
          Utils.toast(e.message || '出题失败，换一组内置题给你');
          const list = root().querySelector('#thAIQuestionsList');
          if (list) list.innerHTML = aiQuestionsHtml(defaultGuideQuestions());
        } finally {
          btn.disabled = false; btn.textContent = old;
        }
      });
      // AI 写想法
      bindAct('thGenThoughts', async () => {
        const btn = root().querySelector('#thGenTBtn');
        if (!btn) return;
        const qs = collectTHQuestions();
        const hasAnswer = qs.some(x => (x.a || '').trim());
        if (!hasAnswer) { Utils.toast('先至少回答一道题吧～'); return; }
        btn.disabled = true; const old = btn.textContent; btn.textContent = 'AI 思考中…';
        const wrap = root().querySelector('#thAIThoughtsWrap') || (() => {
          const existing = root().querySelector('#thAIThoughtsText');
          return existing ? existing.parentElement : null;
        })();
        // 先显示"思考中"占位
        let box = root().querySelector('#thThoughtsBox');
        if (!box) {
          box = document.createElement('div');
          box.id = 'thThoughtsBox';
          box.className = 'chapter';
          box.style.cssText = 'background:rgba(230,244,255,0.7);margin-top:12px;';
          box.innerHTML = `<div class="chapter-title">💭 AI 的一点想法</div><div class="chapter-content" id="thAIThoughtsText" style="line-height:1.9;">（AI 正在静静写下它的话…）</div>`;
          if (wrap && wrap.tagName) wrap.parentNode.insertBefore(box, wrap.nextSibling);
          else {
            const listNode = root().querySelector('#thAIQuestionsList');
            if (listNode) listNode.insertAdjacentElement('afterend', box);
          }
        }
        try {
          const title = root().querySelector('#thTitle')?.value.trim() || '';
          const mood = _tmpMood.val || (root().querySelector('#thMoodTags .mood-tag-pick.selected')?.dataset.mood) || '';
          const sys = '你是用户内在那个温柔的、陪伴型的小我的声音。用户通过回答引导题写了一篇日记的问答素材，请你基于问答，用 400-700 字写一段你的想法：第一，帮 TA 看见 TA 自己都没发现的闪光点或温柔；第二，不需要说教，像一个老朋友坐在旁边说悄悄话；第三，可以点出 1-2 句你觉得最动人的回答，回应它；第四，最后留一句轻轻的小祝愿。直接输出中文正文，不要用 Markdown 列表，不要加标题。';
          const lines = [];
          if (title) lines.push('日记标题：' + title);
          if (mood) lines.push('心情：' + mood);
          qs.forEach((x, i) => {
            if ((x.a || '').trim()) lines.push(`Q${i+1}(${x.tier}): ${x.q} → A: ${x.a.trim()}`);
          });
          const r = await Api.callAI('diaryguide', [
            { role: 'system', content: sys },
            { role: 'user', content: lines.join('\n') },
          ]);
          if (!r || !r.text) throw new Error('AI 没返回内容');
          const textNode = root().querySelector('#thAIThoughtsText');
          if (textNode) textNode.innerHTML = escHtml(r.text).replace(/\n/g, '<br/>');
          // 自动整理到正文（若正文还空）
          const ta = root().querySelector('#thContent');
          if (ta && !ta.value.trim()) {
            ta.value = composeFromQA(qs, r.text);
          } else if (ta) {
            // 追加一段引导
            if (confirm('要不要把这次的问答 + AI 想法整理到正文下面（可继续润色）？')) {
              const piece = '\n\n——— AI 引导补充 ———\n' + composeFromQA(qs, r.text);
              ta.value = (ta.value || '') + piece;
            }
          }
          Utils.toast('💭 AI 写下了一段话，去看看吧～');
        } catch (e) {
          const textNode = root().querySelector('#thAIThoughtsText');
          if (textNode) textNode.innerHTML = '（暂时无法生成想法，稍后再试：' + escHtml(e.message || '未知错误') + '）';
          Utils.toast(e.message || 'AI 暂时无法回应');
        } finally {
          btn.disabled = false; btn.textContent = old;
        }
      });
      // 返回列表
      bindAct('thBack', () => {
        Popups.close();
        setTimeout(() => Popups.open('treehole', { mode: 'list' }), 50);
      });
      // 保存日记
      bindAct('thSave', (e) => {
        const editId = e.currentTarget.dataset.editId || null;
        const title = root().querySelector('#thTitle')?.value.trim() || '';
        const content = root().querySelector('#thContent')?.value || '';
        const mood = _tmpMood.val || (root().querySelector('#thMoodTags .mood-tag-pick.selected')?.dataset.mood) || '';
        const guided = !!(root().querySelector('#thAIGuide')?.checked);
        const questions = guided ? collectTHQuestions() : [];
        const thoughtsNode = root().querySelector('#thAIThoughtsText');
        let thoughts = '';
        if (thoughtsNode) {
          // innerHTML 包含 <br/>，转回换行
          thoughts = thoughtsNode.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
          if (thoughts.includes('静静写下') || thoughts.includes('暂时无法生成')) thoughts = '';
        }
        if (!title && !content.trim()) {
          Utils.toast('至少写点标题或内容吧～'); return;
        }
        const arr = s.treeholeDiaries = (s.treeholeDiaries || []);
        let target = editId ? arr.find(x => x.id === editId) : null;
        if (target) {
          // 更新已有
          target.title = title;
          target.content = content;
          target.mood = mood;
          target.aiGuided = guided;
          target.aiQuestions = questions;
          target.aiThoughts = thoughts;
          target.updatedAt = Utils.nowTs();
          Utils.toast('✓ 日记已更新');
        } else {
          // 新增
          arr.push({
            id: Utils.uid(),
            title: title || Utils.formatFullDate(Utils.nowTs()) + ' 的日记',
            content: content,
            mood: mood,
            tags: [],
            aiGuided: guided,
            aiQuestions: questions,
            aiThoughts: thoughts,
            date: Utils.nowTs(),
          });
          // 触发奖励
          State.addCare(1);
          const got = State.addCoin(3);
          if (got > 0) State.addHappiness(1);
          // 亮星
          s.starPoints.push({
            id: Utils.uid(),
            date: Utils.nowTs(),
            type: 'note',
            title: `在心灵树洞写了日记：${title || '无题'}`,
            desc: content.trim().slice(0, 60) || mood || '',
            importance: guided ? 2 : 1,
            source: '心灵树洞 · Tab2',
          });
          Utils.toast(`✓ 已收进树洞 · +1 关爱值${got > 0 ? ` +${got} 金币` : ''}`);
        }
        State.save();
        Tab1.refresh && Tab1.refresh();
        Tab4.refresh && Tab4.refresh();
        Popups.close();
        setTimeout(() => Popups.open('treehole', { mode: 'list' }), 50);
      });
    },

    farmPlant() {
      let chosen = null;
      const updateMps = () => {
        const c = State.farmCropCatalog.find(x => x.key === chosen);
        $('#fp-mps') && ($('#fp-mps').textContent = c ? c.minutesPerStage : '');
      };
      $$('#fp-crops .seed-item').forEach(el => el.addEventListener('click', () => {
        $$('#fp-crops .seed-item').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected'); chosen = el.dataset.crop; updateMps();
      }));
      bindAct('plant', () => {
        const name = $('#fp-name').value.trim();
        if (!name) return toast('请填技能名');
        if (!chosen) return toast('请选一种作物');
        const gLabel = $('#fp-goal-label').value.trim();
        const gPts = +$('#fp-goal-pts').value || 0;
        const goals = gLabel ? [{ label: gLabel, points: gPts }] : [];
        if (State.plantSkill(null, name, chosen, goals)) {
          Tab3.refresh(); close();
        } else toast('这块地已经在种一个技能了，先收获或移除吧');
      });
    },
    farmLog() {
      bindAct('log', () => {
        const min = +$('#fl-min').value || 0;
        const note = $('#fl-note').value.trim();
        if (min <= 0 && !note) return toast('填点分钟或笔记吧');
        State.logSession(null, min, note);
        Tab3.refresh(); open('farmLog');  // 刷新弹窗
      });
      root().querySelectorAll('[data-goal]').forEach(el => el.addEventListener('click', () => {
        State.toggleGoal(null, el.dataset.goal);
        Tab3.refresh(); open('farmLog');
      }));
      bindAct('addgoal', () => {
        const label = $('#fl-goal-label').value.trim();
        const pts = +$('#fl-goal-pts').value || 0;
        if (!label) return toast('填目标名');
        State.addGoal(null, label, pts);
        open('farmLog');
      });
      bindAct('remove', () => {
        if (!confirm('移除这块作物？已记录的进度会丢失。')) return;
        State.removeSkill(null); Tab3.refresh(); close();
      });
      bindAct('harvest', () => {
        State.harvestSkill(null); Tab3.refresh(); close();
      });
    },
    cottage() {
      // openPlot：整块地只有一个 plot，点击直接打开 farmLog
      root().querySelectorAll('[data-act="openPlot"]').forEach(el => el.addEventListener('click', () => {
        close(); open('farmLog');
      }));
    },

    timeline() {
      bindAct('addStar', () => {
        close();
        setTimeout(() => open('newStar'), 200);
      });
      bindAct('starDetail', e => {
        const id = e.currentTarget.dataset.id;
        close();
        setTimeout(() => open('starDetail', { id }), 200);
      });
    },

    archive() {},

    starDetail() {
      bindAct('close', close);
    },

    newStar() {
      let imp = 1;
      root().querySelectorAll('#newStarImp .popup-tag').forEach(t => {
        t.addEventListener('click', () => {
          root().querySelectorAll('#newStarImp .popup-tag').forEach(x => x.classList.remove('selected'));
          t.classList.add('selected');
          imp = +t.dataset.tag;
        });
      });
      // 默认选中第一个
      root().querySelector('#newStarImp .popup-tag')?.classList.add('selected');
      bindAct('saveStar', () => {
        const title = root().querySelector('#newStarTitle').value.trim() || '一颗新星';
        const desc = root().querySelector('#newStarDesc').value.trim();
        Tab4.addStarPoint({ title, desc, importance: imp });
        Utils.toast('✨ 星点已点亮');
        close();
      });
      bindAct('cancel', close);
    },

    // ============ 照顾任务设置 ============
    careConfig(data = {}) {
      const id = data.id;
      const opt = State.state.careOptions.find(o => o.id === id)
               || State.state.customCareOptions.find(o => o.id === id);
      if (!opt) return;

      const pick = (segId) => {
        const seg = root().querySelector('#' + segId);
        if (!seg) return;
        seg.querySelectorAll('.cfg-opt').forEach(el => {
          el.addEventListener('click', () => {
            seg.querySelectorAll('.cfg-opt').forEach(x => x.classList.remove('selected'));
            el.classList.add('selected');
          });
        });
      };
      pick('cfgMode');
      pick('cfgPin');
      pick('cfgSkip');

      bindAct('save', () => {
        const mode = root().querySelector('#cfgMode .cfg-opt.selected')?.dataset.val || 'daily';
        const pinnedRaw = root().querySelector('#cfgPin .cfg-opt.selected')?.dataset.val || 'false';
        const skipRaw = root().querySelector('#cfgSkip .cfg-opt.selected')?.dataset.val || 'false';
        opt.mode = mode;
        opt.pinned = pinnedRaw === 'false' ? false : pinnedRaw;
        const wasSkipped = opt.skipped;
        opt.skipped = skipRaw === 'true';
        if (opt.skipped && !wasSkipped) opt.done = false;
        State.save();
        Utils.toast('已更新照顾方式');
        if (typeof data.onSave === 'function') data.onSave();
        close();
      });
      bindAct('cancel', close);
      bindAct('delCare', () => {
        if (!confirm('删除这个照顾任务吗？')) return;
        let idx = State.state.careOptions.findIndex(o => o.id === id);
        if (idx >= 0) {
          State.state.careOptions.splice(idx, 1);
        } else {
          idx = State.state.customCareOptions.findIndex(o => o.id === id);
          if (idx >= 0) State.state.customCareOptions.splice(idx, 1);
        }
        State.save();
        Utils.toast('已删除照顾任务');
        if (typeof data.onSave === 'function') data.onSave();
        close();
      });
    },

    // ============ 家具"获取记录"面板 ============
    furniInfo(data = {}) {
      // 快捷来源标签：点击把内容同步进输入框，并高亮
      root().querySelectorAll('#furniSourceTags .popup-tag').forEach(t => {
        t.addEventListener('click', () => {
          root().querySelectorAll('#furniSourceTags .popup-tag').forEach(x => x.classList.remove('selected'));
          t.classList.add('selected');
          const inputEl = root().querySelector('#furniSource');
          if (inputEl) inputEl.value = t.dataset.tag;
        });
      });
      // 如果用户手动改写了输入框内容、且与某个标签一致，则同步高亮该标签
      const srcInputEl = root().querySelector('#furniSource');
      if (srcInputEl) {
        srcInputEl.addEventListener('input', () => {
          const v = srcInputEl.value.trim();
          root().querySelectorAll('#furniSourceTags .popup-tag').forEach(t => {
            t.classList.toggle('selected', t.dataset.tag === v);
          });
        });
      }
      bindAct('saveFurni', e => {
        const id = e.currentTarget.dataset.id;
        const it = State.state.roomItems.find(r => r.id === id);
        if (!it) { close(); return; }
        const srcEl = root().querySelector('#furniSource');
        const storyEl = root().querySelector('#furniStory');
        if (srcEl) it.source = srcEl.value.trim() || it.source;
        if (storyEl) it.story = storyEl.value.trim();
        State.save();
        Utils.toast('记下来了');
        close();
      });
      bindAct('cancel', close);

      // AI 生成经历：按用户近期动态（情绪记录/星点/完成的自我照顾/田地进展）+ 家具信息，写一段小故事
      const aiBtn = root().querySelector('#furniAiBtn');
      if (aiBtn) {
        aiBtn.addEventListener('click', async () => {
          const id = aiBtn.dataset.id;
          const it = State.state.roomItems.find(r => r.id === id);
          if (!it) return;
          const cat = State.getCatalog(it.type) || { name: it.type, icon: '' };
          const acq = Tab1.acquisitionOf(it);
          const storyEl = root().querySelector('#furniStory');
          const previewEl = root().querySelector('#furniStoryPreview');
          const titleEl = previewEl?.parentElement?.querySelector('.chapter-title');
          const oldText = aiBtn.textContent;
          aiBtn.disabled = true;
          aiBtn.textContent = '小我的笔动起来了…';
          try {
            const s = State.state;
            // 构造上下文：情绪、星点、照顾、田地
            const emo = (s.emotionRecords || []).slice(-5).map(r => {
              const parts = [];
              if (r.tags && r.tags.length) parts.push(r.tags.join('/'));
              if (r.text) parts.push('"' + r.text + '"');
              return parts.length ? `[${Utils.formatDate(r.date)}] ${parts.join(' ')}` : null;
            }).filter(Boolean);
            const stars = (s.starPoints || []).slice(-8).map(p =>
              `[${Utils.formatDate(p.date)}] (${typeLabel(p.type)}) ${p.title}${p.desc ? '：' + p.desc : ''}`
            );
            const cares = [];
            (s.careOptions || []).forEach(c => {
              if (c.done) cares.push(`完成了「${c.label}」`);
            });
            (s.customCareOptions || []).forEach(c => {
              if (c.done) cares.push(`完成了自定义任务「${c.label}」`);
            });
            const garden = (s.farmPlots || []).map(p => {
              const crop = State.getFarmCrop(p.cropKey);
              if (!crop) return null;
              const stage = State.farmStageOf(p);
              const stageName = crop.stages[Math.min(stage, crop.stages.length - 1)]?.name || '';
              return `技能农场「${p.skillName}」(${crop.name}) 长到${stageName}阶（累计 ${p.progress} 分钟）`;
            }).filter(Boolean);
            const ctx = [];
            if (emo.length) ctx.push('用户最近的情绪记录（近 5 条）：\n' + emo.join('\n'));
            if (stars.length) ctx.push('用户的成长星点（近 8 条）：\n' + stars.join('\n'));
            if (cares.length) ctx.push('今天已完成的自我照顾：' + cares.join('；'));
            if (garden.length) ctx.push('田地状态：' + garden.join('；'));
            ctx.push(`用户当前数值：关爱值 ${s.careValue || 0}、开心值 ${s.happinessValue || 0}、健康值 ${s.healthValue || 0}、舒适值 ${s.comfortValue || 0}、金币 ${s.coin || 0}`);

            const prompt = `请为房间里的一件家具——「${cat.name}」（分类：${cat.category || '家具'}，获得来源：${acq.source || '未记录'}，获得时间：${acq.obtainedAt ? Utils.formatDate(acq.obtainedAt) : '很久以前'}），根据下面的用户近况，写一段 80-160 字的小故事。
口吻：你是用户房间里的像素“小我”，观察ta的日常，温柔不评判，不说教，不用“应该/必须”。不输出标题，不写列表，只输出一段中文正文。
参考的默认故事（不要照抄，可以借鉴情绪）：${acq.story || '无'}

用户近况：
${ctx.join('\n\n')}`;

            const r = await Api.callAI('furniStory', [{ role: 'user', content: prompt }]);
            const text = (r && r.text) ? String(r.text).trim() : '';
            if (!text) throw new Error('AI 返回为空');
            if (storyEl) { storyEl.value = text; storyEl.dispatchEvent(new Event('input', { bubbles: true })); }
            if (previewEl) {
              previewEl.innerHTML = text.replace(/</g, '&lt;').replace(/\n/g, '<br/>');
            }
            if (titleEl) {
              titleEl.innerHTML = '💮 小我的新故事 <small style="color:var(--muted);font-size:10px;font-weight:normal;">（记得点「记下来」保存）</small>';
            }
            Utils.toast('已为你写了一段经历，觉得合适就记得保存～');
          } catch (e) {
            Utils.toast(e.message || '写故事失败了');
          } finally {
            aiBtn.disabled = false;
            aiBtn.textContent = oldText;
          }
        });
      }
    },

    // ============ 添加自定义照顾任务 ============
    addCare(data = {}) {
      const pick = (segId) => {
        const seg = root().querySelector('#' + segId);
        if (!seg) return;
        seg.querySelectorAll('.cfg-opt').forEach(el => {
          el.addEventListener('click', () => {
            seg.querySelectorAll('.cfg-opt').forEach(x => x.classList.remove('selected'));
            el.classList.add('selected');
          });
        });
      };
      pick('addCareMode');

      bindAct('save', () => {
        const emoji = root().querySelector('#addCareEmoji').value.trim() || '✨';
        const label = root().querySelector('#addCareLabel').value.trim();
        if (!label) {
          Utils.toast('给任务起个名字吧');
          return;
        }
        const mode = root().querySelector('#addCareMode .cfg-opt.selected')?.dataset.val || 'daily';
        const newTask = {
          id: 'custom-' + Utils.uid(),
          emoji,
          label,
          done: false,
          mode,
          pinned: false,
          skipped: false,
          reward: 3,
        };
        State.state.customCareOptions.push(newTask);
        State.save();
        Utils.toast(`已添加「${label}」`);
        if (typeof data.onSave === 'function') data.onSave();
        close();
      });
      bindAct('cancel', close);
    },

    // ============ 星星详情卡片 Tab4：珍藏 + 关闭 ============
    starCard(data) {
      bindAct('close', close);
      bindAct('togglePin', e => {
        const id = e.currentTarget.dataset.id;
        const p = (State.state.starPoints || []).find(x => x.id === id);
        if (!p) return;
        const already = !!(p.collected || p.pinned);
        if (already) return;
        p.collected = true;
        p.pinned = true; // 兼容旧字段
        State.save();
        Utils.toast('已珍藏 · 不会被自动清理 ✨');
        // 如果 Tab4 在当前视图，刷新星星显示（让 collected 样式生效）
        try { if (typeof Tab4 !== 'undefined' && Tab4.renderAll) Tab4.renderAll(); } catch (_) {}
        close();
        setTimeout(() => open('starCard', { id }), 180);
      });
    },

    // ============ 星座总结卡片 Tab4：关闭 ============
    constellationSummary() {
      bindAct('close', close);
    },

    // ============ 自我洞察说明书：填充内容 + AI 重新总结 ============
    selfManual() {
      const PLACEHOLDER = '还在认识中…';
      const S = State.state;
      const sm = S.selfManual || { chapter1: PLACEHOLDER, chapter2: PLACEHOLDER, chapter3: PLACEHOLDER, chapter4: PLACEHOLDER, chapter5: PLACEHOLDER, updatedAt: '' };
      const r = root();

      // 1. 填五章内容 + 灰化兜底 + 统一走 textContent（天然 XSS 安全）
      const map = [
        ['ch1', sm.chapter1], ['ch2', sm.chapter2], ['ch3', sm.chapter3],
        ['ch4', sm.chapter4], ['ch5', sm.chapter5],
      ];
      map.forEach(([cls, txt]) => {
        const el = r.querySelector('.manual-' + cls);
        if (!el) return;
        const isEmpty = !txt || txt === PLACEHOLDER;
        el.textContent = isEmpty ? PLACEHOLDER : String(txt);
        el.classList.toggle('placeholder', isEmpty);
      });

      // 2. 填更新时间
      const upEl = r.querySelector('#manualUpdatedAt');
      if (upEl) {
        if (sm.updatedAt) {
          try { upEl.textContent = Utils.formatFullDate(sm.updatedAt); }
          catch (_) { upEl.textContent = sm.updatedAt; }
        } else {
          upEl.textContent = '尚未生成';
        }
      }

      // 3. AI 可用判断（两个 agent 都启用才算 ready；退而求其次：只要 insight 或任意 AI 已启用也可以）
      const aiReady = !!(State.aiEnabled && (State.aiEnabled('insight') || State.aiEnabled('self_manual')));
      const regenBtn = r.querySelector('#aiRegenBtn');
      const hintEl = r.querySelector('#aiDisabledHint');
      if (!aiReady) {
        if (regenBtn) regenBtn.classList.add('hidden');
        if (hintEl) hintEl.classList.remove('hidden');
      }

      // 4. 数据来源展开切换
      const tog = r.querySelector('[data-act="toggleSources"]');
      const det = r.querySelector('.sources-detail');
      const chev = tog ? tog.querySelector('.chev') : null;
      if (tog) {
        tog.addEventListener('click', (e) => {
          e.preventDefault();
          if (det) det.classList.toggle('hidden');
          if (chev) chev.classList.toggle('open');
        });
      }

      // 5. 完成按钮
      bindAct('closeManual', close);

      // 6. AI 重新总结（含 10 分钟前端节流）
      if (regenBtn && aiReady) {
        const THROTTLE_KEY = 'yuji_last_manual_regen_ts';
        const THROTTLE_MS = 10 * 60 * 1000;
        regenBtn.addEventListener('click', async () => {
          const last = parseInt(localStorage.getItem(THROTTLE_KEY) || '0', 10);
          if (last && Date.now() - last < THROTTLE_MS) {
            const left = Math.ceil((THROTTLE_MS - (Date.now() - last)) / 60000);
            Utils.toast(`刚总结过，${left} 分钟后再试试吧～`);
            return;
          }
          regenBtn.disabled = true;
          const oldBtnText = regenBtn.textContent;
          regenBtn.textContent = '小我在总结你…（通常 1-3 分钟）';
          try {
            const result = await Api.callChain('insight_manual', []);
            localStorage.setItem(THROTTLE_KEY, String(Date.now()));

            // 尝试从后端响应的 self_manual step.text 中解析 JSON
            let newManual = null;
            if (result && typeof result === 'object' && Array.isArray(result.steps)) {
              const lastStep = result.steps[result.steps.length - 1];
              if (lastStep && typeof lastStep.text === 'string') {
                const match = lastStep.text.match(/\{[\s\S]*?"chapter1"[\s\S]*?\}/);
                if (match) {
                  try { newManual = JSON.parse(match[0]); } catch (_) { newManual = null; }
                }
              }
            }
            // 如果响应里没有解析出 JSON，拉远端 user_state 取最新
            if (!newManual && typeof Api.getState === 'function' && Api.isAuthed()) {
              try {
                const remote = await Api.getState();
                const remoteData = remote && remote.data ? remote.data : (remote && typeof remote === 'object' ? remote : null);
                if (remoteData && remoteData.selfManual) newManual = remoteData.selfManual;
              } catch (_) { /* 忽略远端拉取错误 */ }
            }

            if (newManual && typeof newManual === 'object') {
              const merged = Object.assign(
                { chapter1: PLACEHOLDER, chapter2: PLACEHOLDER, chapter3: PLACEHOLDER, chapter4: PLACEHOLDER, chapter5: PLACEHOLDER, updatedAt: new Date().toISOString() },
                newManual
              );
              State.state.selfManual = merged;
              State.save();
            } else {
              Utils.toast('说明书已在后端生成，3 秒后自动刷新～');
              await new Promise(res => setTimeout(res, 3000));
            }

            close();
            setTimeout(() => Popups.open('selfManual'), 120);
          } catch (e) {
            Utils.toast((e && e.message) ? e.message : '重新总结失败了，请稍后再试');
          } finally {
            regenBtn.disabled = false;
            regenBtn.textContent = oldBtnText;
          }
        });
      }
    },
  };

  // ============ 本心对语辅助函数 ============

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function dialogueThreadHtml(msgs) {
    if (!Array.isArray(msgs) || !msgs.length) {
      return '<div class="dialogue-empty">还没有消息，写下第一封悄悄话吧…</div>';
    }
    return msgs.map(m => {
      const isUser = m.role === 'user';
      return `
        <div class="dialogue-msg ${isUser ? 'my' : 'theirs'}">
          <div class="dialogue-msg-avatar">${isUser ? '🙂' : '🌿'}</div>
          <div class="dialogue-msg-bubble">
            <div class="dialogue-msg-text">${escHtml(m.content)}</div>
            <div class="dialogue-msg-time">${Utils.formatDate(m.date)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ===== 心灵树洞：AI 引导题 HTML =====
  // 3 层：L1 情绪、L2 事件、L3 内心/哲学
  const GUIDE_QUESTION_SETS = [
    [
      { tier: 'L1 · 情绪层', tierEmoji: '🌸', q: '今天最明显的感受是什么？可以用 2-3 个词描述，也可以写具体一瞬间。' },
      { tier: 'L1 · 情绪层', tierEmoji: '🌸', q: '如果把此刻的心情比作一种颜色/天气/味道，它会是什么？为什么？' },
      { tier: 'L2 · 事件层', tierEmoji: '📅', q: '今天发生了哪 3 件值得记一下的小事？哪怕是「喝了一杯喜欢的咖啡」。' },
      { tier: 'L2 · 事件层', tierEmoji: '📅', q: '今天哪一件事最让你挂心、反复想到？它让你产生了什么感觉？' },
      { tier: 'L3 · 内心层', tierEmoji: '🪞', q: '这件让你挂心的事背后，你真正在意的是什么？是被理解、被爱、还是一种安全感？' },
      { tier: 'L3 · 哲学层', tierEmoji: '✨', q: '如果十年之后的你，坐下来回看今天这一天，TA 会对你说一句什么？' },
    ],
    [
      { tier: 'L1 · 情绪层', tierEmoji: '🌸', q: '从早上醒来到现在，你的心情经历了怎样的变化？' },
      { tier: 'L1 · 情绪层', tierEmoji: '🌸', q: '此刻你身体上有什么感觉？（紧、累、轻松、胸口空…都可以写）' },
      { tier: 'L2 · 事件层', tierEmoji: '📅', q: '今天有没有一个瞬间，你想对自己说「你辛苦了」？为什么？' },
      { tier: 'L2 · 事件层', tierEmoji: '📅', q: '今天和谁有过比较深的互动？让你感觉靠近还是疏离？' },
      { tier: 'L3 · 内心层', tierEmoji: '🪞', q: '最近一段时间，你心里有没有一个反复出现的声音或问题？它在提醒你什么？' },
      { tier: 'L3 · 哲学层', tierEmoji: '✨', q: '如果现在的你可以给小时候的自己一个拥抱/一句话，你想给什么？' },
    ],
    [
      { tier: 'L1 · 情绪层', tierEmoji: '🌸', q: '今天的情绪里，有没有一种是你「不太想承认」的？试着把它写下来，不用评判它。' },
      { tier: 'L1 · 情绪层', tierEmoji: '🌸', q: '如果今天有个情绪需要被看见、被温柔对待，它是哪一个？' },
      { tier: 'L2 · 事件层', tierEmoji: '📅', q: '今天有什么事让你觉得「我做得还不错」？写下来，别漏了。' },
      { tier: 'L2 · 事件层', tierEmoji: '📅', q: '今天有没有一件事没按预期发生？你当时的第一反应是什么？' },
      { tier: 'L3 · 内心层', tierEmoji: '🪞', q: '你心里有没有一段关系/一个选择，让你最近常常在想「我做得对吗」？它对你来说重要在哪？' },
      { tier: 'L3 · 哲学层', tierEmoji: '✨', q: '如果不用考虑钱、别人的眼光和现实限制，你现在最想去做的一件小事是什么？为什么？' },
    ],
  ];
  function defaultGuideQuestions(setIdx) {
    const i = (setIdx == null ? (Date.now() % GUIDE_QUESTION_SETS.length) : (+setIdx % GUIDE_QUESTION_SETS.length));
    return GUIDE_QUESTION_SETS[i].map(item => ({ tier: item.tier, tierEmoji: item.tierEmoji, q: item.q, a: '' }));
  }
  function aiQuestionsHtml(qs) {
    const list = (Array.isArray(qs) && qs.length) ? qs : defaultGuideQuestions();
    return list.map((item, idx) => `
      <div class="th-question tier-${(item.tier||'').slice(0,2)}" data-qidx="${idx}">
        <div class="th-q-tier">${item.tierEmoji || '🌿'} <b>${escHtml(item.tier || '')}</b></div>
        <div class="th-q-text">${escHtml(item.q || '')}</div>
        <textarea class="popup-textarea th-a-textarea" placeholder="你的回答…（可以写一句话，也可以写一大段）" data-qidx="${idx}" maxlength="1000" style="min-height:60px;">${escHtml(item.a || '')}</textarea>
      </div>
    `).join('');
  }
  // 读取当前编辑器里 AI 引导问答（从 DOM textareas 收集）
  function collectTHQuestions() {
    const nodes = root().querySelectorAll('#thAIQuestionsList .th-question');
    const out = [];
    nodes.forEach(n => {
      const idx = n.dataset.qidx;
      const tierNode = n.querySelector('.th-q-tier b');
      const qNode = n.querySelector('.th-q-text');
      const ta = n.querySelector('.th-a-textarea');
      const tierEmojiNode = n.querySelector('.th-q-tier');
      out.push({
        tier: tierNode ? tierNode.textContent.trim() : '',
        tierEmoji: tierEmojiNode ? tierEmojiNode.textContent.trim().split(' ')[0] : '',
        q: qNode ? qNode.textContent.trim() : '',
        a: ta ? ta.value : '',
      });
    });
    return out;
  }
  // 将 Q&A 整理为日记正文（用户可继续润色）
  function composeFromQA(qs, aiThoughts) {
    const lines = [];
    let curTier = '';
    qs.forEach((item, i) => {
      if (item.tier !== curTier) {
        if (curTier) lines.push('');
        lines.push(`【${item.tierEmoji || ''} ${item.tier}】`);
        curTier = item.tier;
      }
      if ((item.a || '').trim()) {
        lines.push(`Q${i+1}. ${item.q}`);
        lines.push(`A. ${item.a.trim()}`);
        lines.push('');
      } else {
        lines.push(`Q${i+1}. ${item.q}`);
        lines.push(`（未回答，跳过）`);
        lines.push('');
      }
    });
    if (aiThoughts && String(aiThoughts).trim()) {
      lines.push('');
      lines.push('【💭 AI 的一点想法】');
      lines.push(String(aiThoughts).trim());
    }
    return lines.join('\n');
  }

  async function sendDialogueMsg() {
    const textarea = root().querySelector('#diaText');
    const text = textarea.value.trim();
    if (!text) { Utils.toast('写点什么吧'); return; }
    const s = State.state;
    const msgs = s.tab2Dialogue || [];
    // 用户消息
    const userMsg = { role: 'user', content: text, date: Utils.nowTs() };
    msgs.push(userMsg);
    State.save();
    // 刷新弹窗
    const thread = root().querySelector('#diaThread');
    if (thread) thread.innerHTML = dialogueThreadHtml(msgs);
    textarea.value = '';
    thread?.scrollTo(0, thread.scrollHeight);
    // 调用 AI 小我回复
    const btn = root().querySelector('[data-act="diaSend"]');
    if (btn) { btn.disabled = true; btn.textContent = '寄出中…'; }
    // 显示等待提示
    const waitingBubble = document.createElement('div');
    waitingBubble.className = 'dialogue-msg theirs';
    waitingBubble.innerHTML = '<div class="dialogue-msg-avatar">🌿</div><div class="dialogue-msg-bubble"><div class="dialogue-msg-text" style="color:#999;">小我正伏在桌边给回信…</div></div>';
    thread?.appendChild(waitingBubble);
    thread?.scrollTo(0, thread.scrollHeight);
    try {
      const r = await Api.callAI('whisper', [
        { role: 'system', content: '你是森林里那个温柔的小我，是用户内在的自己。用森林密信、说悄悄话的口吻回应。' },
        ...s.tab2Dialogue.filter(m => m.role !== 'system').slice(-10).map(m => ({ role: m.role, content: m.content })),
      ]);
      // 移除等待气泡
      waitingBubble.remove();
      if (r && r.text) {
        const reply = { role: 'assistant', content: r.text, date: Utils.nowTs() };
        msgs.push(reply);
        State.save();
        if (thread) thread.innerHTML = dialogueThreadHtml(msgs);
        thread?.scrollTo(0, thread.scrollHeight);
      } else {
        Utils.toast('森林暂时安静了，稍后再试试');
      }
    } catch (e) {
      waitingBubble.remove();
      Utils.toast(e.message || '小我暂时无法回信，稍后再试');
      console.warn('[dialogue] AI 回复失败', e);
    }
    if (btn) { btn.disabled = false; btn.textContent = '寄出'; }
  }

  // 按钮动作绑定
  function bindAct(name, fn) {
    root().querySelectorAll(`[data-act="${name}"]`).forEach(el => {
      el.addEventListener('click', fn);
    });
  }

  // 田地收到养料的 toast 消息段
  function gardenFeedMsg(fed) {
    const matured = fed.filter(f => f.matured);
    if (matured.length) {
      return ` · 🌿${fed.length} 株收到养料，「${matured[0].name}」成熟了！`;
    }
    return ` · 🌿 田地 ${fed.length} 株收到养料`;
  }

  // 自动生成信件：关爱值跨过阈值 + 最近有情绪记录
  function maybeGenerateLetter() {
    const s = State.state;
    const lastLetter = s.letters[s.letters.length - 1];
    const lastLetterDate = lastLetter ? lastLetter.date.slice(0, 10) : '';
    const today = Utils.today();
    // 每天最多一封；关爱值>=3 且 今天没有过信
    if (s.careValue < 3) return;
    if (lastLetterDate === today) return;
    if (Math.random() > 0.5) {
      // 50% 概率生成
      const templates = [
        '今天你很累，但你记得喝了水，允许自己休息一会。我感受到你的疲惫，不用逼自己做好所有事。',
        '你最近愿意花一点时间看看自己，这件事本身就很难得了。',
        '慢慢地，你好像在尝试不再为难自己。我看见了，谢谢你。',
        '如果你今天只是躺着，那也是一种很重要的照顾。',
        '你照顾自己的样子，比你想象中的要温柔得多。',
      ];
      s.letters.push({
        id: Utils.uid(),
        date: Utils.nowTs(),
        content: Utils.pick(templates),
        read: false,
      });
      s.starPoints.push({
        id: Utils.uid(),
        date: Utils.nowTs(),
        type: 'letter',
        title: '收到一封来自小我的信',
        desc: '小我在心里写了一些话给你。',
        importance: 2,
      });
      State.save();
    }
  }

  return { open, close };
})();