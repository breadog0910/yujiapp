/* ============================================================
   Tab1 此刻·家 - 像素房间 + 可动可交互 + 背景可增删改
   ============================================================ */

const Tab1 = (() => {

  let editMode = false;     // 布置模式
  let selectedId = null;    // 当前选中的家具 id
  let itemBarEl = null;     // 选中家具控制条元素（缓存引用，防止重渲染后丢失）

  // 家具 尺寸 / 旋转 的范围与步进
  const SCALE_MIN = 0.5, SCALE_MAX = 4.0, SCALE_STEP = 0.1;
  // 旋转：Y 轴 3D 转向（侧身/转面），范围 ±75°，步进 15°
  const ROT_MIN = -75, ROT_MAX = 75, ROT_STEP = 15;
  // 倾斜：2D 平面小角度左右倾斜（之前的小幅度横向旋转），范围 ±20°，步进 5°
  const TILT_MIN = -20, TILT_MAX = 20, TILT_STEP = 5;

  // 像素风照顾选项图标（SVG 点阵，代替 emoji）
  const CARE_ICONS = {
    water: `
      <svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">
        <rect x="3" y="0" width="1" height="1" fill="#7ab8c8"/>
        <rect x="2" y="1" width="2" height="1" fill="#7ab8c8"/>
        <rect x="2" y="2" width="3" height="1" fill="#7ab8c8"/>
        <rect x="1" y="3" width="5" height="3" fill="#7ab8c8"/>
        <rect x="2" y="6" width="3" height="1" fill="#7ab8c8"/>
        <rect x="2" y="4" width="1" height="1" fill="#c8e8f0"/>
      </svg>`,
    breath: `
      <svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">
        <rect x="2" y="0" width="3" height="1" fill="#9ec8dc"/>
        <rect x="1" y="1" width="5" height="1" fill="#9ec8dc"/>
        <rect x="0" y="2" width="7" height="2" fill="#9ec8dc"/>
        <rect x="1" y="5" width="2" height="1" fill="#b8d8e8"/>
        <rect x="4" y="5" width="2" height="1" fill="#b8d8e8"/>
        <rect x="0" y="2" width="2" height="1" fill="#c8e8f0"/>
      </svg>`,
    walk: `
      <svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">
        <rect x="2" y="0" width="2" height="2" fill="#8ab070"/>
        <rect x="1" y="2" width="5" height="1" fill="#8ab070"/>
        <rect x="2" y="3" width="3" height="1" fill="#8ab070"/>
        <rect x="2" y="4" width="1" height="2" fill="#8ab070"/>
        <rect x="4" y="4" width="1" height="2" fill="#8ab070"/>
        <rect x="1" y="6" width="1" height="1" fill="#8ab070"/>
        <rect x="5" y="6" width="1" height="1" fill="#8ab070"/>
      </svg>`,
    space: `
      <svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">
        <rect x="3" y="0" width="1" height="2" fill="#c0a8d8"/>
        <rect x="0" y="2" width="7" height="1" fill="#c0a8d8"/>
        <rect x="1" y="3" width="5" height="1" fill="#c0a8d8"/>
        <rect x="2" y="4" width="3" height="1" fill="#c0a8d8"/>
        <rect x="1" y="5" width="2" height="1" fill="#c0a8d8"/>
        <rect x="4" y="5" width="2" height="1" fill="#c0a8d8"/>
        <rect x="1" y="6" width="1" height="1" fill="#c0a8d8"/>
        <rect x="5" y="6" width="1" height="1" fill="#c0a8d8"/>
      </svg>`,
    sleep: `
      <svg viewBox="0 0 8 7" shape-rendering="crispEdges" aria-hidden="true">
        <rect x="2" y="0" width="3" height="1" fill="#8888c0"/>
        <rect x="1" y="1" width="2" height="1" fill="#8888c0"/>
        <rect x="0" y="2" width="1" height="3" fill="#8888c0"/>
        <rect x="1" y="5" width="2" height="1" fill="#8888c0"/>
        <rect x="2" y="6" width="3" height="1" fill="#8888c0"/>
        <rect x="6" y="1" width="1" height="1" fill="#d8d0f0"/>
        <rect x="5" y="2" width="3" height="1" fill="#d8d0f0"/>
        <rect x="6" y="3" width="1" height="1" fill="#d8d0f0"/>
      </svg>`,
    encourage: `
      <svg viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true">
        <rect x="1" y="0" width="2" height="1" fill="#d4879a"/>
        <rect x="4" y="0" width="2" height="1" fill="#d4879a"/>
        <rect x="0" y="1" width="7" height="2" fill="#d4879a"/>
        <rect x="1" y="3" width="5" height="1" fill="#d4879a"/>
        <rect x="2" y="4" width="3" height="1" fill="#d4879a"/>
        <rect x="3" y="5" width="1" height="1" fill="#d4879a"/>
        <rect x="1" y="1" width="1" height="1" fill="#f0c0cc"/>
      </svg>`,
  };

  function careIcon(id) {
    return CARE_ICONS[id] || CARE_ICONS.encourage;
  }

  /* ============================================================
     家具"获取记录"：初始资产 / 亲手布置 / 购置 / 礼物 / 其它
     —— 点击家具弹出小面板，写清时间、方式、经历
     ============================================================ */

  // 各类家具的默认"经历"文案（仅当未手动填写时兜底展示）
  const DEFAULT_STORIES = {
    window:  '刚搬进来时，你特意在墙上留了这扇窗。累了就望出去一会儿，光会自己走进来。',
    painting: '一幅随手挂上的小画，不为什么，只是想让墙上多一点自己的痕迹。',
    clock:    '你买它是想慢慢把生活节奏找回来的。它不催你，只是安静地陪着。',
    lamp:     '某个加完班的深夜，你点亮了它，忽然觉得屋子也可以很暖。',
    plant:    '你领养了这盆小绿植，说要一起好好活着。它长得慢，你也愿意等。',
    shelf:    '置物架是你留给回忆的位置——把走过的路，一件件摆上去。',
    books:    '叠起来的书，是你还没读完、也舍不得扔的那些念头。',
    rug:      '一块小地毯，光脚踩上去的瞬间，家才算真正落了地。',
    cat:      '这只猫是某天自己走来的。它不说话，但你知道它在。',
    teddy:    '玩偶是你小时候的伙伴，后来走丢了，又被你找了回来。',
    piggy:    '存钱罐里装的不是钱，是你一次次"值得被善待"的决心。',
    letter:   '小我写给你的信，会在这里等你愿意拆开的时候。',
    mirror:   '你在墙上挂了这面镜子。它不只是用来照脸——偶尔凝视里面，也看看这段时间你慢慢长成了什么样。',
  };
  const DEFAULT_STORY_FALLBACK = '这是你房间里的老伙计，陪你度过了不少平淡又珍贵的日子。';

  // 取得一件家具的获取记录（带兜底）
  function acquisitionOf(it) {
    const obtainedAt = (it.obtainedAt !== undefined && it.obtainedAt !== null)
      ? it.obtainedAt
      : State.state.createdAt;
    const source = it.source !== undefined
      ? it.source
      : (State.defaultRoomItemIds.includes(it.id) ? '初始资产' : '亲手布置');
    const story = (it.story && String(it.story).trim())
      ? it.story
      : (DEFAULT_STORIES[it.type] || DEFAULT_STORY_FALLBACK);
    return { obtainedAt, source, story };
  }

  function init() {
    State.ensureDaily();
    // 迁移：为旧数据补全获取记录字段
    State.state.roomItems.forEach(it => {
      if (it.obtainedAt === undefined || it.obtainedAt === null) it.obtainedAt = State.state.createdAt;
      if (it.source === undefined) it.source = State.defaultRoomItemIds.includes(it.id) ? '初始资产' : '亲手布置';
      if (it.story === undefined) it.story = '';
    });
    State.save();
    renderCareOptions();
    renderStats();
    renderRoomGlow();
    renderBg();
    renderRoom();
    bindEvents();
    // 房间尘埃光点氛围
    Utils.spawnParticles(document.getElementById('dustMotes'), {
      count: 14,
      color: 'rgba(255, 238, 200, 0.55)',
      size: 4,
      rise: 60,
    });
    // 支持 ?edit=1 直达布置模式
    if (new URLSearchParams(location.search).get('edit') === '1') {
      toggleEditMode(true);
    }
  }

  function bindEvents() {
    // 点击像素小我 - 唤起情绪记录
    const xiaowo = document.getElementById('xiaowo');
    if (xiaowo) {
      xiaowo.addEventListener('click', () => {
        if (!editMode) Popups.open('emotion');
      });
    }

    // 布置按钮
    const editBtn = document.getElementById('roomEditBtn');
    if (editBtn) editBtn.addEventListener('click', toggleEditMode);

    // 编辑栏按钮（仅保留「家具库」入口；翻转/移除/完成已移除，
    // 退出布置用右上角「布置/完成」切换）
    const addBtn = document.getElementById('roomAddBtn');
    if (addBtn) addBtn.addEventListener('click', () => Popups.open('furniture'));

    // 选中家具的尺寸 / 旋转控制条（贴合家具、随家具一起移动）
    itemBarEl = document.getElementById('roomItemBar');
    if (itemBarEl) {
      // 面板上的按下/点击都别冒泡到家具，否则会误触发拖动或重选中
      itemBarEl.addEventListener('pointerdown', e => e.stopPropagation());
      itemBarEl.addEventListener('click', e => e.stopPropagation());
      const returnBtn = document.getElementById('roomReturnBtn');
      if (returnBtn) returnBtn.addEventListener('click', e => {
        e.stopPropagation();
        returnSelected();
      });
    }
    const scaleUpBtn = document.getElementById('roomScaleUp');
    if (scaleUpBtn) scaleUpBtn.addEventListener('click', () => nudgeScale(SCALE_STEP));
    const scaleDownBtn = document.getElementById('roomScaleDown');
    if (scaleDownBtn) scaleDownBtn.addEventListener('click', () => nudgeScale(-SCALE_STEP));
    const rotLeftBtn = document.getElementById('roomRotLeft');
    if (rotLeftBtn) rotLeftBtn.addEventListener('click', () => nudgeRot(-ROT_STEP));
    const rotRightBtn = document.getElementById('roomRotRight');
    if (rotRightBtn) rotRightBtn.addEventListener('click', () => nudgeRot(ROT_STEP));
    const tiltLeftBtn = document.getElementById('roomTiltLeft');
    if (tiltLeftBtn) tiltLeftBtn.addEventListener('click', () => nudgeTilt(-TILT_STEP));
    const tiltRightBtn = document.getElementById('roomTiltRight');
    if (tiltRightBtn) tiltRightBtn.addEventListener('click', () => nudgeTilt(TILT_STEP));

    // 窗口大小变化时重新计算气泡区域高度
    window.addEventListener('resize', () => {
      const container = document.getElementById('careOptions');
      if (!container) return;
      const firstBubble = container.querySelector('.care-bubble');
      if (firstBubble) {
        const rowHeight = firstBubble.offsetHeight;
        const style = window.getComputedStyle(container);
        const padTop = parseFloat(style.paddingTop) || 0;
        const padBottom = parseFloat(style.paddingBottom) || 0;
        container.style.height = (rowHeight + padTop + padBottom) + 'px';
      }
    });
  }

  /* ============================================================
     背景渲染（仅白昼一张，不再切换时段 / 自定义）
     ============================================================ */

  function renderBg() {
    const layer = document.getElementById('bgLayer');
    if (!layer) return;
    const bg = State.bgCatalog[0];
    layer.innerHTML = `
      <img class="tab1-bg active"
           src="${bg.src}"
           alt="${bg.name}"
           draggable="false" />
    `;
  }

  /* ============================================================
     家具组件
     ============================================================ */

  function depthOf(z) {
    if (z <= 3) return 'far';
    if (z <= 4) return 'mid';
    return 'near';
  }

  function renderRoom() {
    const container = document.getElementById('roomFurniture');
    if (!container) return;
    container.innerHTML = '';

    // 按 z 排序：低的先渲染（在后面）
    const items = [...State.state.roomItems].sort((a, b) => a.z - b.z);
    items.forEach(it => {
      const cat = State.getCatalog(it.type);
      if (!cat) return;
      const el = document.createElement('div');
      el.className = 'room-item'
        + (it.id === selectedId ? ' selected' : '')
        + (cat.action ? ' has-action' : '')
        + (cat.isFloor ? ' is-floor' : '');
      el.dataset.id = it.id;
      el.dataset.depth = depthOf(it.z);
      el.dataset.type = it.type;
      el.style.left = it.x + '%';
      el.style.bottom = it.y + '%';
      el.style.zIndex = 10 + it.z;
      el.style.setProperty('--ri-scale', it.scale);
      el.style.setProperty('--ri-flip', it.flip ? '-1' : '1');
      el.style.setProperty('--ri-rot', (it.rot || 0) + 'deg');
      el.style.setProperty('--ri-tilt', (it.tilt || 0) + 'deg');
      el.style.setProperty('--ri-w', (cat.w || 56) + 'px');
      el.style.setProperty('--ri-h', (cat.h || 56) + 'px');
      el.title = cat.action ? `${cat.name}（点击打开）` : cat.name;
      el.innerHTML = `
        <span class="ri-visual">
          <span class="ri-sprite"><img src="${cat.icon}" alt="${cat.name}" draggable="false" /></span>
          <span class="ri-shadow"></span>
        </span>
        <span class="ri-label">${cat.name}</span>
      `;
      container.appendChild(el);
      bindItemEvents(el, it);
    });

    // 重渲染会重建家具节点，需要把控制条重新挂到当前选中的家具上
    attachItemBar();
  }

  function bindItemEvents(el, it) {
    // 点击：编辑模式选中 / 普通模式打开功能
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (editMode) {
        selectItem(it.id);
      } else {
        // 点击特效：物件弹一下
        el.classList.add('clicked');
        setTimeout(() => el.classList.remove('clicked'), 320);
        // 有 action 的家具走专属交互，否则打开"获取记录"面板
        const cat = State.getCatalog(it.type);
        if (cat && cat.action) {
          if (cat.action === 'shop') {
            Popups.open('shop');
          } else if (cat.action === 'letter') {
            Popups.open('letter');
          } else if (cat.action === 'mirror') {
            Popups.open('selfManual');
          } else {
            Popups.open('furniInfo', { id: it.id });
          }
        } else {
          Popups.open('furniInfo', { id: it.id });
        }
      }
    });

    // 拖动（仅编辑模式）
    el.addEventListener('pointerdown', e => {
      if (!editMode) return;
      e.preventDefault();
      e.stopPropagation();
      // 仅更新选中态，避免 selectItem 重渲染把当前元素替换掉、拖动立即失效
      setSelected(it.id);

      // 以家具容器为坐标基准：bottom% 是相对 .room-furniture 计算的，
      // 而 .room-furniture 从底部被 --care-h 抬起了约 124px，不能用 roomStage
      const stage = document.getElementById('roomFurniture');
      const rect = stage.getBoundingClientRect();
      // 记录抓取点与锚点的偏移
      const anchorX = rect.left + (it.x / 100) * rect.width;
      const anchorY = rect.bottom - (it.y / 100) * rect.height;
      const offX = e.clientX - anchorX;
      const offY = e.clientY - anchorY;

      el.classList.add('dragging');

      const move = ev => {
        const nx = (ev.clientX - rect.left - offX) / rect.width * 100;
        // 注意：纵向锚点是底边（rect.bottom - pos），故 offY 需“加回”而非减去
        const ny = (rect.bottom - ev.clientY + offY) / rect.height * 100;
        it.x = Math.max(2, Math.min(98, nx));
        it.y = Math.max(2, Math.min(94, ny));
        el.style.left = it.x + '%';
        el.style.bottom = it.y + '%';
      };
      const up = () => {
        el.classList.remove('dragging');
        State.save();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  /* ---- 编辑模式 ---- */
  function toggleEditMode(force) {
    editMode = typeof force === 'boolean' ? force : !editMode;
    document.body.classList.toggle('room-editing', editMode);
    const bar = document.getElementById('roomEditBar');
    if (bar) {
      if (editMode) {
        // 进入布置模式：编辑栏滑入
        bar.classList.remove('closing');
        bar.hidden = false;
      } else {
        // 退出布置模式：编辑栏先播放收起动画，再彻底隐藏
        bar.classList.add('closing');
        setTimeout(() => {
          bar.hidden = true;
          bar.classList.remove('closing');
        }, 200);
      }
    }
    const btn = document.getElementById('roomEditBtn');
    if (btn) btn.textContent = editMode ? '完成' : '布置';
    if (!editMode) selectItem(null);
    renderRoom();
    updateItemBar();
  }

  // 仅更新选中态，不触发重渲染（重渲染会替换 DOM 节点，打断正在进行的拖动）
  function setSelected(id) {
    selectedId = id;
    const container = document.getElementById('roomFurniture');
    if (container) {
      container.querySelectorAll('.room-item').forEach(node => {
        node.classList.toggle('selected', node.dataset.id === id);
      });
    }
    attachItemBar();
  }

  function selectItem(id) {
    setSelected(id);
    renderRoom();
  }

  // 把控制条挂到当前选中家具的节点上：控制条成为家具的子元素后，
  // 会贴合在选择框上方，并跟着家具一起被拖动；无选中时挂回房间容器（隐藏）
  function attachItemBar() {
    const container = document.getElementById('roomFurniture');
    if (!itemBarEl || !container) return;
    if (selectedId) {
      const el = container.querySelector('.room-item[data-id="' + selectedId + '"]');
      if (el && itemBarEl.parentElement !== el) el.appendChild(itemBarEl);
    } else if (itemBarEl.parentElement !== container) {
      container.appendChild(itemBarEl);
    }
    updateItemBar();
  }

  // 家具尺寸 / 旋转 控制 ----------------------------------
  function getSelectedItem() {
    return State.state.roomItems.find(r => r.id === selectedId) || null;
  }

  // 把 it 的 scale/rot/flip 直接写到 DOM（不重建元素，避免闪烁 / 打断交互）
  function applyItemTransform(it) {
    const el = document.querySelector('.room-item[data-id="' + it.id + '"]');
    if (!el) return;
    el.style.setProperty('--ri-scale', it.scale);
    el.style.setProperty('--ri-flip', it.flip ? '-1' : '1');
    el.style.setProperty('--ri-rot', (it.rot || 0) + 'deg');
    el.style.setProperty('--ri-tilt', (it.tilt || 0) + 'deg');
  }

  function nudgeScale(d) {
    const it = getSelectedItem();
    if (!it) return;
    const v = Math.round(Math.max(SCALE_MIN, Math.min(SCALE_MAX, (it.scale || 1) + d)) * 10) / 10;
    it.scale = v;
    State.save();
    applyItemTransform(it);
    updateItemBar();
  }

  function nudgeRot(d) {
    const it = getSelectedItem();
    if (!it) return;
    const v = Math.max(ROT_MIN, Math.min(ROT_MAX, (it.rot || 0) + d));
    it.rot = v;
    State.save();
    applyItemTransform(it);
    updateItemBar();
  }

  function nudgeTilt(d) {
    const it = getSelectedItem();
    if (!it) return;
    const v = Math.max(TILT_MIN, Math.min(TILT_MAX, (it.tilt || 0) + d));
    it.tilt = v;
    State.save();
    applyItemTransform(it);
    updateItemBar();
  }

  // 选中家具时显示尺寸 / 旋转控制条，并同步当前数值
  function updateItemBar() {
    const bar = itemBarEl || document.getElementById('roomItemBar');
    if (!bar) return;
    const it = getSelectedItem();
    if (editMode && it) {
      bar.hidden = false;
      const sv = document.getElementById('roomScaleVal');
      const rv = document.getElementById('roomRotVal');
      if (sv) sv.textContent = ((it.scale || 1).toFixed(1)) + '×';
      if (rv) rv.textContent = ((it.rot || 0)) + '°';
      const tv = document.getElementById('roomTiltVal');
      if (tv) tv.textContent = ((it.tilt || 0)) + '°';
    } else {
      bar.hidden = true;
    }
  }

  // 放回家具库：从房间移除，并回到「家具库」（已获得、未摆放）
  function returnSelected() {
    const it = getSelectedItem();
    if (!it) return;
    const name = State.getCatalog(it.type)?.name || '';
    removeItem(selectedId);
    selectItem(null);
    Utils.toast(`「${name}」已放回家具库`);
  }

  function removeItem(id) {
    const it = State.state.roomItems.find(r => r.id === id);
    const idx = State.state.roomItems.findIndex(r => r.id === id);
    if (idx >= 0) {
      State.state.roomItems.splice(idx, 1);
      // 移出房间后回到「家具库」（已获得、未摆放），保留获取记录
      if (it) {
        State.state.furnitureInventory.push({
          id: 'fi-' + Utils.uid(),
          type: it.type,
          obtainedAt: (it.obtainedAt !== undefined && it.obtainedAt !== null) ? it.obtainedAt : Utils.nowTs(),
          source: it.source || '亲手布置',
        });
      }
      State.save();
      renderRoom();
    }
  }

  // 从家具库（已获得、未摆放）摆进房间
  function placeFromInventory(invId) {
    const inv = State.state.furnitureInventory;
    const idx = inv.findIndex(x => x.id === invId);
    if (idx < 0) return false;
    const inst = inv[idx];
    inv.splice(idx, 1);
    addRoomItem(inst.type, { source: inst.source || '购置' });
    return true;
  }

  // 从家具库添加（opts.source 可覆盖获取方式，如 '购置'；opts.price 用于提示）
  function addRoomItem(type, opts = {}) {
    const cat = State.getCatalog(type);
    if (!cat) return;
    // 找一个空位
    const x = 15 + Math.random() * 70;
    const y = 12 + Math.random() * 35;
    // 新添加的 z 略大于已有最大，让它出现在最前
    const maxZ = State.state.roomItems.reduce((m, r) => Math.max(m, r.z), 0);
    const item = {
      id: 'ri-' + Utils.uid(),
      type,
      x, y,
      z: Math.min(6, maxZ + 1),
      scale: 1,
      flip: 0,
      rot: 0,
      tilt: 0,
      action: cat.action || undefined,
      obtainedAt: Utils.nowTs(),
      source: opts.source || '亲手布置',
      story: '',
    };
    State.state.roomItems.push(item);
    State.save();
    renderRoom();
    selectItem(item.id);
    // 自动进入编辑模式
    if (!editMode) toggleEditMode(true);
    let msg = `「${cat.name}」已放进房间，拖动调整位置`;
    if (opts.source === '购置' && opts.price) msg = `「${cat.name}」已购置进房间 · 花费 🪙${opts.price}`;
    Utils.toast(msg);
  }

  /* ============================================================
     自我照顾 - 气泡网格
     ============================================================ */

  const LONG_PRESS_DURATION = 800; // ms

  // 排序：一直置顶 > 今日置顶 > 未完成 > 已完成/跳过
  function sortCareOptions() {
    const score = o => {
      if (o.pinned === 'always') return 400;
      if (o.pinned === 'today') return 300;
      if (o.done || o.skipped) return 0;
      return 200;
    };
    State.state.careOptions.sort((a, b) => score(b) - score(a));
  }

  function renderCareOptions() {
    const container = document.getElementById('careOptions');
    if (!container) return;

    sortCareOptions();
    const opts = State.state.careOptions;
    const customOpts = State.state.customCareOptions || [];
    const allOpts = [...opts, ...customOpts];

    container.innerHTML = allOpts.map((o, i) => `
      <div class="care-bubble ${o.done ? 'done' : ''} ${o.skipped ? 'skipped' : ''} ${o.pinned ? 'pinned' : ''}"
           data-id="${o.id}" data-idx="${i}" style="--i:${i}">
        <div class="bubble-ring"></div>
        <div class="bubble-check">✓</div>
        <div class="bubble-emoji">${o.emoji}</div>
        <div class="bubble-label">${o.label}</div>
        ${o.mode === 'recurring' ? '<div class="bubble-mode">循环</div>' : '<div class="bubble-mode">每日</div>'}
      </div>
    `).join('') + `
      <div class="care-bubble add-btn" data-act="addCare">
        <div class="bubble-emoji">＋</div>
        <div class="bubble-label">添加</div>
      </div>
    `;

    container.querySelectorAll('.care-bubble[data-id]').forEach(bubble => {
      bindBubbleEvents(bubble);
    });

    const addBtn = container.querySelector('.care-bubble.add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        Popups.open('addCare', { onSave: () => {
          renderCareOptions();
          renderStats();
        }});
      });
    }

    // 精确锁定容器高度为刚好一行气泡（读取实际渲染后的 padding）
    requestAnimationFrame(() => {
      const firstBubble = container.querySelector('.care-bubble');
      if (firstBubble) {
        const rowHeight = firstBubble.offsetHeight;
        const style = window.getComputedStyle(container);
        const padTop = parseFloat(style.paddingTop) || 0;
        const padBottom = parseFloat(style.paddingBottom) || 0;
        container.style.height = (rowHeight + padTop + padBottom) + 'px';
        container.style.maxHeight = 'none';
      }
      // 把整条气泡区（含标题）的高度同步给 #tab1，让背景控件自动避让到气泡条之上
      const care = document.getElementById('carePanel');
      const tab1 = document.getElementById('tab1');
      if (care && tab1) {
        tab1.style.setProperty('--care-h', care.offsetHeight + 'px');
      }
    });
  }

  function bindBubbleEvents(bubble) {
    let raf = null;
    let isLongPress = false;
    let startX = 0, startY = 0;

    const startLongPress = () => {
      if (bubble.classList.contains('done') || bubble.classList.contains('skipped')) return;
      isLongPress = false;
      bubble.classList.add('longpressing');
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, (elapsed / LONG_PRESS_DURATION) * 100);
        bubble.style.setProperty('--progress', progress);

        if (progress >= 100) {
          isLongPress = true;
          bubble.classList.remove('longpressing');
          bubble.classList.add('checking');
          setTimeout(() => {
            completeCare(bubble.dataset.id);
          }, 280);
          return;
        }
        raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);
    };

    const cancelLongPress = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      bubble.classList.remove('longpressing');
      bubble.style.setProperty('--progress', 0);
    };

    // Touch events
    bubble.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startLongPress();
    }, { passive: true });

    bubble.addEventListener('touchend', () => {
      if (isLongPress) return;
      cancelLongPress();
      Popups.open('careConfig', { id: bubble.dataset.id, onSave: () => {
        renderCareOptions();
        renderStats();
      }});
    });

    bubble.addEventListener('touchmove', e => {
      if (!bubble.classList.contains('longpressing')) return;
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dx > 14 || dy > 14) {
        cancelLongPress();
      }
    }, { passive: true });

    bubble.addEventListener('touchcancel', cancelLongPress);

    // Mouse events (desktop)
    bubble.addEventListener('mousedown', e => {
      startX = e.clientX;
      startY = e.clientY;
      startLongPress();
    });

    bubble.addEventListener('mouseup', () => {
      if (isLongPress) return;
      cancelLongPress();
      Popups.open('careConfig', { id: bubble.dataset.id, onSave: () => {
        renderCareOptions();
        renderStats();
      }});
    });

    bubble.addEventListener('mouseleave', () => {
      if (!isLongPress) cancelLongPress();
    });
  }

  // 直接完成一项
  function completeCare(id) {
    const opt = State.state.careOptions.find(o => o.id === id)
              || State.state.customCareOptions.find(o => o.id === id);
    if (!opt || opt.done || opt.skipped) return;

    opt.done = true;
    triggerXiaowoAction(opt.id);

    State.addCare(1);
    const got = State.addCoin(opt.reward || 3);
    if (got > 0) {
      State.addHappiness(Math.floor(got / 2));
      Utils.recalcComfort && Utils.recalcComfort();
    }

    renderStats();

    let msg = `+1 关爱值${got > 0 ? ` · +${got} 金币` : ''}`;
    Utils.toast(msg);

    State.save();

    if (opt.mode === 'recurring') {
      setTimeout(() => {
        opt.done = false;
        // 沉到底部：移到数组末尾
        const arr = State.state.careOptions;
        const i = arr.findIndex(o => o.id === opt.id);
        if (i >= 0) { arr.splice(i, 1); arr.push(opt); }
        State.save();
        renderCareOptions();
      }, 900);
    } else {
      renderCareOptions();
    }
  }

  // 触发小我动作（严格按 pixel-sprite-sheet-animation Skill §3 模板）
  // 默认状态：小我站定显示第 0 帧（举杯静止），不播动画。
  //   water      → 加 .is-drinking，播 N 轮 6 帧喝水连帧后自动移除类。
  //   encourage/celebrate → 加 .is-celebrating，隐藏喝水层显示庆祝层，播 N 轮 5 帧庆祝连帧后切回。
  //   其他      → .mood-happy 轻微跳动反馈。
  // 关键重置三步法（Skill §3 固定写法）：先 remove 类 → 强制 reflow → 再加类；
  // 保证每次从第 0 帧开始，不会"停在哪帧就从哪帧接着播"。
  let __xdTimer = null;
  let __xcTimer = null;

  function triggerXiaowoAction(careId) {
    const xw = document.getElementById('xiaowo');
    if (!xw) return;
    const cs = getComputedStyle(xw);
    const N = parseInt(cs.getPropertyValue('--frame-count'), 10) || 6;

    // ── 庆祝（自我鼓励 / 智能体触发的鼓励类动作）────────────────────────
    if (careId === 'encourage' || careId === 'celebrate') {
      const d = parseFloat(cs.getPropertyValue('--xc-frame-dur')) || 160;
      const k = parseInt(cs.getPropertyValue('--xc-loops'), 10) || 2;
      const n5 = parseInt(cs.getPropertyValue('--xc-frame-count'), 10) || 5; // 庆祝 5 帧动画
      if (__xcTimer) { clearTimeout(__xcTimer); __xcTimer = null; }
      // 避免与喝水叠加：喝水也清掉
      if (__xdTimer) { clearTimeout(__xdTimer); __xdTimer = null; xw.classList.remove('is-drinking'); }
      // Skill §3 三步法：remove → reflow → add
      xw.classList.remove('is-celebrating');
      void xw.offsetWidth;
      xw.classList.add('is-celebrating');
      __xcTimer = setTimeout(() => {
        xw.classList.remove('is-celebrating');
        __xcTimer = null;
      }, d * n5 * k + 200);
      return;
    }

    // ── 喝水 ────────────────────────────────────────────────────────
    if (careId === 'water') {
      const d = parseFloat(cs.getPropertyValue('--xd-frame-dur')) || 220;
      const k = parseInt(cs.getPropertyValue('--xd-loops'), 10) || 2;
      if (__xdTimer) { clearTimeout(__xdTimer); __xdTimer = null; }
      // 避免与庆祝叠加
      if (__xcTimer) { clearTimeout(__xcTimer); __xcTimer = null; xw.classList.remove('is-celebrating'); }
      // Skill §3 三步法
      xw.classList.remove('is-drinking');
      void xw.offsetWidth;
      xw.classList.add('is-drinking');
      __xdTimer = setTimeout(() => {
        xw.classList.remove('is-drinking');
        __xdTimer = null;
      }, d * N * k + 200);
      return;
    }

    // ── 其他任务：心情跳一下 ──────────────────────────────────────
    xw.classList.add('mood-happy');
    setTimeout(() => xw.classList.remove('mood-happy'), 700);
  }

  /* ============================================================
     数值 / 氛围
     ============================================================ */

  function renderStats() {
    const s = State.state;
    const careEl = document.getElementById('careValue');
    const coinEl = document.getElementById('dailyCoin');
    const display = document.getElementById('coinDisplay');
    if (careEl) careEl.textContent = s.careValue;
    if (coinEl) coinEl.textContent = s.dailyCoin;
    if (display) display.textContent = '金币 ' + s.coin;
  }

  function renderRoomGlow() {
    const glow = document.getElementById('roomGlow');
    if (!glow) return;
    const s = State.state;
    const care = Math.min(100, s.careValue);
    const comfort = Math.min(100, s.comfortValue);
    const intensity = (care + comfort) / 200;
    glow.style.opacity = 0.4 + intensity * 0.6;
  }

  // 重新进入 Tab 时刷新
  function refresh() {
    State.ensureDaily();
    renderCareOptions();
    renderStats();
    renderRoomGlow();
    renderBg();
    renderRoom();
  }

  // 暴露到全局，方便 Console 调试触发动画
  window.triggerXiaowoAction = triggerXiaowoAction;

  return { init, refresh, addRoomItem, placeFromInventory, acquisitionOf };
})();
