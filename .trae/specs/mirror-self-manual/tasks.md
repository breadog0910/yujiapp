# 任务清单：镜子家具 + 自我洞察说明书

> 依赖顺序：T1 → T2 → T3 → T4 → T5 基本链路；T6/T7 可与前面并行；T8 在 T1-T7 之后。

***

## Task 1：state.js — 定义镜子家具目录 & 初始摆放

**优先级**：high
**关联 AC**：AC-R1, AC-R6, AC-R7

### 任务说明

修改 `yuji-app/js/state.js`：

1. 在 `FALLBACK_ROOM_CATALOG` 数组中，piggy 之后追加 mirror：

   ```
   { type: 'mirror', icon: 'assets/pixel/mirror.png', w: 56, h: 72, name: '镜子',
     category: '功能', action: 'mirror', price: 0, unlockedByDefault: 1 }
   ```
2. 在 `FALLBACK_DEFAULT_ROOM_ITEMS` 数组中追加：

   ```
   { id: 'ri-mirror', type: 'mirror', x: 45, y: 44, z: 2, scale: 1, flip: 0, action: 'mirror' }
   ```

   * 位置选在墙上中部（不遮挡窗、画、钟的现有位置）；z=2 与 window/painting 同一层；
3. 检查 `applyConfig()` 中 filter：

   * `roomCatalog = cfg.furnitureCatalog.filter(f => f.type !== TAB2_ENTRY_TYPE && f.type !== TAB2_TREEHOLE_TYPE)` — **mirror 不会被过滤掉，无需改**；

   * `defaultRoomLayout` filter 同理；
4. （可选）在 `DEFAULT_STORIES` 对象中加一条：

   ```
   mirror: '你在墙上挂了这面镜子。它不只是用来照脸——偶尔凝视里面，也看看这段时间你慢慢长成了什么样。',
   ```

   这样用户在「获取记录」面板点镜子时会有专属故事（尽管 action=mirror 默认打开说明书，但如果用户走了家具信息入口也能看到）。

### 本地测试需求（TR）

| TR ID | 类型     | 条件                                                                                                                          | 证据                                        |
| ----- | ------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| T1-R1 | rule   | Console 运行 `State.getCatalog('mirror')` 返回对象非 null，action==='mirror'，unlockedByDefault===1                                  | 打开 DevTools → 执行表达式 → 截图                  |
| T1-R2 | rule   | 清 localStorage 后刷新 → `State.state.roomItems` 包含 type==='mirror' 的条目（id='ri-mirror' 或由后端 defaultRoomLayout 下发但 fallback 下必有） | 清缓存 → 刷新 → Console 输 state.roomItems → 截图 |
| T1-R3 | rubric | mirror 位置（x=45%, y=44%）不与 window(8%,34%)/painting(30%,36%)/clock(60%,38%) 重叠；可接受轻微叠但不遮挡视线（pass≥1.5）                         | 截图 Tab1 首页观察视觉分布                          |

***

## Task 2：tab1.js — 点击分发新增 `action === 'mirror'`

**优先级**：high
**依赖**：T1
**关联 AC**：AC-R2, AC-R10

### 任务说明

修改 `yuji-app/js/tab1.js` `bindItemEvents()` 的 action 分发分支：

```js
// 现有：
// if (cat.action === 'shop') { Popups.open('shop'); }
// else if (cat.action === 'letter') { Popups.open('letter'); }
// else { Popups.open('furniInfo', { id: it.id }); }
//
// 改为：
if (cat.action === 'shop') {
  Popups.open('shop');
} else if (cat.action === 'letter') {
  Popups.open('letter');
} else if (cat.action === 'mirror') {
  Popups.open('selfManual');
} else {
  Popups.open('furniInfo', { id: it.id });
}
```

### 本地测试需求（TR）

| TR ID | 类型   | 条件                                                                                                         | 证据            |
| ----- | ---- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| T2-R1 | rule | 非编辑模式点击镜子 → 浏览器抛 `Popups.open('selfManual')` 能被拦截（在 Popups.open 开头加临时 console.log 验证）→ 或直接看后续 T3 完成后实际弹窗打开 | Console 输出/截图 |
| T2-R2 | rule | 编辑模式点击镜子 → 镜子被选中并显示控制条，拖动/缩放/旋转正常                                                                          | 录制 GIF 或截图三步  |
| T2-R3 | rule | 镜子放回家具库 → 再摆回房间 → 点击仍能打开弹窗                                                                                 | 操作全流程截图       |

***

## Task 3：popups.js builders — 新增 `selfManual()` 弹窗 HTML 结构

**优先级**：high
**依赖**：T1
**关联 AC**：AC-R2, AC-R3, AC-R11, AC-Q1

### 任务说明

在 `yuji-app/js/popups.js` 的 `builders` 对象中，紧跟 `shop` / `furniture` 之后，新增 `selfManual()` 方法。

HTML 结构规范（严格遵守现有三段式 + 样式复用）：

```
<div class="popup-head">
  <div class="popup-title">🪞 自我洞察说明书</div>
  <button class="popup-close">✕</button>
</div>
<div class="popup-body">
  <!-- 版本信息 -->
  <div class="manual-version">
    <span class="hint">版本更新于：<span id="manualUpdatedAt"></span></span>
  </div>

  <!-- 五章 -->
  <div class="manual-chapters">
    <!-- 第一章 -->
    <div class="manual-chapter">
      <div class="manual-chapter-title">🌸 第一章 · 我是怎样的人</div>
      <div class="manual-chapter-body manual-ch1"></div>
    </div>
    <!-- 第二章 -->
    <div class="manual-chapter">
      <div class="manual-chapter-title">✨ 第二章 · 我的优势</div>
      <div class="manual-chapter-body manual-ch2"></div>
    </div>
    <!-- 第三章 -->
    <div class="manual-chapter">
      <div class="manual-chapter-title">⚠️ 第三章 · 我的雷区</div>
      <div class="manual-chapter-body manual-ch3"></div>
    </div>
    <!-- 第四章 -->
    <div class="manual-chapter">
      <div class="manual-chapter-title">🤍 第四章 · 怎样好好对待我</div>
      <div class="manual-chapter-body manual-ch4"></div>
    </div>
    <!-- 第五章 -->
    <div class="manual-chapter">
      <div class="manual-chapter-title">🌱 第五章 · 适合我的成长方式</div>
      <div class="manual-chapter-body manual-ch5"></div>
    </div>
  </div>

  <!-- 数据来源折叠说明 -->
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
```

关键实现要点：

1. 正文内容**不在 builders 里直接拼字符串**（为了后续 inits 能精细控制 + 统一走 escHtml），而是用 `manual-ch1` … `manual-ch5` class 占位，然后在 `inits.selfManual()` 中读 State.state.selfManual 后填进去；
2. `manualUpdatedAt` 也由 inits 填充，格式用 `Utils.formatFullDate(updatedAt)` 或调用 Utils 中现成的日期格式化函数；如果 State.state.selfManual.updatedAt 为空则显示「尚未生成」；
3. 章节正文如等于 `'还在认识中…'` 或空白，给 `.manual-chapter-body` 加 `.placeholder` class 让它灰化（浅灰斜体）；
4. `toggleSources` 按钮点击后切换 `.sources-detail` hidden 状态，同时翻转 `.chev`（CSS 加 rotate 90° 展开态即可）；
5. `#aiRegenBtn` 默认显示，然后在 inits 里根据 `State.aiEnabled('insight') && State.aiEnabled('self_manual')` 控制显示/隐藏；两者缺一都隐藏并显示 `#aiDisabledHint`；
6. 若 State 没有 aiEnabled('self\_manual') 单独开关，可退而用 `State.aiEnabled('insight')` 单个判断 + 配置中任意一个 agent 已启用。

### 本地测试需求（TR）

| TR ID | 类型     | 条件                                                                                   | 证据                          |
| ----- | ------ | ------------------------------------------------------------------------------------ | --------------------------- |
| T3-R1 | rule   | 手动调 `Popups.open('selfManual')` → 弹窗打开，五章都在，标题正确                                     | 打开弹窗截图                      |
| T3-R2 | rule   | `State.state.selfManual.chapter1 = '<script>alert(1)</script>'` → 打开弹窗 → 文本原样显示（不执行） | 打开弹窗截图，可见转义后的 `<script>` 文字 |
| T3-R3 | rule   | 章节正文为 `'还在认识中…'` → 显示为灰色/斜体 placeholder                                              | 截图                          |
| T3-R4 | rule   | 点击「查看数据来源」按钮 → 下方说明展开；再点 → 收起                                                        | 展开/收起各截图                    |
| T3-R5 | rubric | 弹窗视觉与 letter 弹窗完全一致（标题、间距、按钮样式、圆角阴影）（pass≥1.5）                                       | 截图对比两弹窗并排                   |

***

## Task 4：popups.js inits & Api 调用 — 填内容 + 重新总结（含节流）

**优先级**：high
**依赖**：T3
**关联 AC**：AC-R4, AC-R5, AC-R11, AC-Q3

### 任务说明

在 `yuji-app/js/popups.js` 的 `inits` 对象中新增 `selfManual()`。

**实现步骤**：

```js
inits.selfManual() {
  const root = rootEl;             // 或按现有 const root = root(); 的写法
  const S = State.state;
  const sm = S.selfManual || { chapter1:'还在认识中…', chapter2:'还在认识中…', chapter3:'还在认识中…', chapter4:'还在认识中…', chapter5:'还在认识中…', updatedAt:'' };

  // 1. 填五章内容 + 灰化兜底
  const PLACEHOLDER = '还在认识中…';
  const map = [
    ['ch1', sm.chapter1], ['ch2', sm.chapter2], ['ch3', sm.chapter3],
    ['ch4', sm.chapter4], ['ch5', sm.chapter5],
  ];
  map.forEach(([cls, txt]) => {
    const el = root.querySelector('.manual-' + cls);
    if (!el) return;
    const isEmpty = !txt || txt === PLACEHOLDER;
    el.textContent = isEmpty ? PLACEHOLDER : txt;
    el.classList.toggle('placeholder', isEmpty);
  });

  // 2. 填更新时间
  const upEl = root.querySelector('#manualUpdatedAt');
  if (upEl) upEl.textContent = sm.updatedAt ? Utils.formatFullDate(sm.updatedAt) : '尚未生成';

  // 3. AI 可用判断
  const aiReady = State.aiEnabled('insight') && State.aiEnabled('self_manual');
  const regenBtn = root.querySelector('#aiRegenBtn');
  const hintEl = root.querySelector('#aiDisabledHint');
  if (!aiReady) {
    if (regenBtn) regenBtn.classList.add('hidden');
    if (hintEl) hintEl.classList.remove('hidden');
  }

  // 4. 数据来源展开切换
  const tog = root.querySelector('[data-act="toggleSources"]');
  const det = root.querySelector('.sources-detail');
  const chev = tog?.querySelector('.chev');
  tog?.addEventListener('click', () => {
    det?.classList.toggle('hidden');
    chev?.classList.toggle('open');
  });

  // 5. 完成按钮
  root.querySelector('[data-act="closeManual"]')?.addEventListener('click', close);

  // 6. AI 重新总结（含 10 分钟节流）
  const THROTTLE_KEY = 'yuji_last_manual_regen_ts';
  const THROTTLE_MS = 10 * 60 * 1000;
  regenBtn?.addEventListener('click', async () => {
    // 节流
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
      // 写入节流标记（仅成功后）
      localStorage.setItem(THROTTLE_KEY, String(Date.now()));

      // 后端已落库 selfManual，这里需要拉最新值
      // 策略：如果后端在 result 中带了解析 JSON，优先用；否则拉远端 user_state
      let newManual = null;
      if (result && typeof result === 'object') {
        // 尝试在 steps 最后一条里寻找 JSON 解析
        const lastStep = result.steps && result.steps[result.steps.length - 1];
        if (lastStep && lastStep.text) {
          const match = lastStep.text.match(/\{[\s\S]*"chapter1"[\s\S]*\}/);
          if (match) {
            try { newManual = JSON.parse(match[0]); } catch (_) {}
          }
        }
      }
      if (!newManual) {
        // 拉远端 user_state
        if (typeof Api.getState === 'function' && Api.isAuthed()) {
          const remote = await Api.getState();
          if (remote && remote.selfManual) newManual = remote.selfManual;
        }
      }
      if (newManual) {
        // 合并本地 + 保证 updatedAt
        State.state.selfManual = Object.assign(
          { chapter1:PLACEHOLDER, chapter2:PLACEHOLDER, chapter3:PLACEHOLDER, chapter4:PLACEHOLDER, chapter5:PLACEHOLDER, updatedAt: new Date().toISOString() },
          newManual
        );
        State.save();
      } else {
        Utils.toast('说明书已在后端生成，3 秒后自动刷新～');
        await new Promise(r => setTimeout(r, 3000));
      }
      // 重新打开弹窗刷新内容
      Popups.close();
      setTimeout(() => Popups.open('selfManual'), 100);
    } catch (e) {
      Utils.toast(e.message || '重新总结失败了，请稍后再试');
    } finally {
      regenBtn.disabled = false;
      regenBtn.textContent = oldBtnText;
    }
  });
}
```

**关键点**：

* `Utils.formatFullDate`：如果 Utils 中不存在该精确名，找存在的格式化函数（popups.js timeline 中已用 `Utils.formatFullDate(p.date)`，说明已存在）；

* `State.aiEnabled(agentKey)`：若不接受两个参数串联，改成 `State.aiEnabled?.('letter')`（只要任意一个 AI 已启用就算可用，避免按钮无故消失）——退而求其次策略；

* `Api.getState()`：在 api.js 中存在，且返回 Promise\<user\_state>；注意它返回的是整包 state（含 selfManual）；

* 注意 `Api.getState()` 可能会走本地 merge，需要确认不覆盖掉远端最新 selfManual（如果内部是远端优先，则 OK）。

### 本地测试需求（TR）

| TR ID | 类型     | 条件                                                                                                                      | 证据                             |
| ----- | ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| T4-R1 | rule   | 打开弹窗 → 五章内容与 `State.state.selfManual` 字段一一对应（手动改值后验证）                                                                   | Console 修改 state → 打开弹窗 → 截图对比 |
| T4-R2 | rule   | 更新时间正确显示，空则"尚未生成"                                                                                                       | 清 selfManual.updatedAt 验证      |
| T4-R3 | rule   | 点 AI Regen → Network 可见 POST 到 `rest/v1/functions/ai-chain` 且 body.chain==='insight\_manual' → 成功 → 10 分钟内再点 → toast 拦截 | Network 截图 + toast 截图          |
| T4-R4 | rule   | 模拟 AI 调用失败（断网或 mock）→ 按钮 3 秒内恢复并显示错误 toast → selfManual 内容未被破坏                                                          | 断网操作录屏                         |
| T4-R5 | rule   | "完成"按钮能正确关闭弹窗                                                                                                           | 截图                             |
| T4-R6 | rubric | 错误处理：失败场景提示、节流提示文案温和无压迫感；节流剩余分钟数正确（pass≥1.5）                                                                            | 三种场景各截图/录屏                     |

***

## Task 5：popups.css — 新增 selfManual 弹窗样式

**优先级**：medium
**依赖**：T3
**关联 AC**：AC-Q1, AC-R2

### 任务说明

在 `yuji-app/css/popups.css` 末尾新增以下类（风格向现有弹窗样式对齐）：

```css
/* ============ 自我洞察说明书 ============ */
.manual-version {
  margin-bottom: 12px;
  text-align: right;
}
.manual-chapters {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.manual-chapter {
  background: var(--bg-soft, #fff9ed);
  border: 2px solid var(--border, #d7c3a0);
  border-radius: 8px;
  padding: 10px 12px;
}
.manual-chapter-title {
  font-family: 'ZCOOL KuaiLe', sans-serif;
  font-size: 15px;
  color: var(--accent, #9c6b3a);
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}
.manual-chapter-body {
  font-size: 13px;
  line-height: 1.75;
  color: #3a3328;
  white-space: pre-wrap;
  word-break: break-word;
}
.manual-chapter-body.placeholder {
  color: #a89a84;
  font-style: italic;
}
.manual-sources .chev {
  display: inline-block;
  transition: transform 0.2s;
  margin-right: 2px;
}
.manual-sources .chev.open {
  transform: rotate(90deg);
}
.sources-detail {
  padding: 2px 4px 0 4px;
}
/* popup-foot 里 aiDisabledHint 独占一行 */
.popup-foot #aiDisabledHint {
  width: 100%;
}
```

说明：

* 颜色优先用 CSS 变量（--bg-soft / --border / --accent），若现有 popups.css 中有这些变量则引用；如果没有这些具体名，就用 letter/shop 弹窗里**实际在用的颜色变量**（需要实际看一下现有 popups.css 的色彩体系，别凭空发明）。

* `.manual-chapter-body.placeholder` 的灰化与 `.hint` class 的灰化程度接近即可。

### 本地测试需求（TR）

| TR ID | 类型     | 条件                                                    | 证据      |
| ----- | ------ | ----------------------------------------------------- | ------- |
| T5-R1 | rule   | 五章卡片以卡片样式（浅底 + 深色边框 + 圆角 + 间距）独立呈现                    | 截图      |
| T5-R2 | rule   | placeholder 章节的文字为浅灰斜体，与正常正文差异明显                      | 对比截图    |
| T5-R3 | rule   | Chevron 按钮展开时 90° 旋转，无动画卡顿                            | 截图 2 状态 |
| T5-R4 | rubric | 卡片/标题/正文的字号、颜色、行高与现有 letter/shop 弹窗的内容区视觉和谐（pass≥1.5） | 并排截图    |

***

## Task 6：兜底镜子 PNG + alpha 二值化处理

**优先级**：medium
**关联 AC**：AC-R1, AC-R8, AC-Q2

### 任务说明

1. 生成一张像素风镜子兜底 PNG，放到 `yuji-app/assets/pixel/mirror.png`：

   * 尺寸建议 112×144（2× 渲染后缩到 56×72，保证像素锐利），或直接 56×72；

   * 美术：棕色木质边框 + 镜面浅蓝/淡白反光；挂墙造型。

   * 若无法手绘，使用 GenerateImage 生成一张像素镜子图，prompt 明确用途和尺寸：
     `APP ASSET: pixel art mirror for wall hanging in a cozy room, wooden brown frame, light blue reflective glass surface, white background for matting, 56x72 size, detailed pixel art style with crisp edges`

   * 尺寸选 `square` 或 `portrait_4_3`（如无合适尺寸，生成后手动裁剪也行），注意最终需要放至 assets/pixel/mirror.png。
2. 执行 alpha 二值化处理（严格遵循项目工程约定，防止镜子边缘透背景）：

   * 用 PIL 对 mirror.png 执行：A=0 保留透明，A>0 → A=255；

   * 原图备份为 `mirror.presemibak`；
3. 浏览器端兜底：SVG `#alpha-hard-edge` filter 在 index.html 中已存在，`.room-item .ri-sprite img` 已应用 filter，无需额外加。

### 本地测试需求（TR）

| TR ID | 类型     | 条件                                                        | 证据                   |
| ----- | ------ | --------------------------------------------------------- | -------------------- |
| T6-R1 | rule   | `assets/pixel/mirror.png` 文件存在且 2xx 可访问，Tab1 镜子 img 无破损图标 | Network 截图 + 页面截图    |
| T6-R2 | rule   | mirror.presemibak 备份文件存在（PIL 二值化留痕）                       | File Explorer / LS   |
| T6-R3 | rule   | 放大截图：镜子边缘无半透明鬼影（与其他家具处理效果一致）                              | 放大边缘截图对比 bed-big.png |
| T6-R4 | rubric | 与房间内家具像素风格统一，挂墙位置比例协调（pass≥1.5）                           | 首页全屏截图               |

***

## Task 7：index.html — 版本号递增（强制缓存刷新）

**优先级**：high
**依赖**：T1–T6（完成后最后执行）
**关联 AC**：AC-R9, NFR-1

### 任务说明

修改 `yuji-app/index.html` 中的以下版本号：

| 文件                             | 旧版   | 新版   |
| ------------------------------ | ---- | ---- |
| `js/state.js`                  | v=43 | v=44 |
| `js/tab1.js`                   | v=53 | v=54 |
| `js/popups.js`                 | v=41 | v=42 |
| `css/popups.css`               | v=39 | v=40 |
| 其他（main.css/tab1-home.css 等未改） | 不变   | 不变   |

注意：

* 实际 bump 前请先读 index.html 中的**当前实际值**再 +1（因为之前提交可能已经加过，上面的值以读取时实际值为准）。

* CSS/JS 只要有内容改动的才 bump；其余保持不动。

### 本地测试需求（TR）

| TR ID | 类型   | 条件                                                     | 证据                             |
| ----- | ---- | ------------------------------------------------------ | ------------------------------ |
| T7-R1 | rule | 上述四个资源在 index.html 中的 v 值比未改前各自 +1                     | diff / 截图                      |
| T7-R2 | rule | Ctrl+F5 刷新后 Network 中四个文件都为 200（非 304 from disk cache） | Network 截图（Size 列不含 from disk） |

***

## Task 8：后台 furniture 种子数据 SQL（可选/锦上添花）

**优先级**：low
**关联 AC**：AC-R6

### 任务说明

在 `supabase/migrations/002_seed_data.sql`（或最新一个 seed migration）中，INSERT INTO furniture 时加 mirror 行，保证新部署的环境首次 `supabase db reset` 后家具库就有 mirror，无需手动新增。

如果目前 furniture 的 seed 是通过 admin 手动录入（002\_seed\_data.sql 中没有），则跳过本 Task 并在 tasks 里标注 cancelled（需用户批准）。

如果 furniture catalog 已经有 seed：

```sql
INSERT INTO furniture (type, name, category, icon, w, h, is_floor, action, price, unlocked_by_default)
VALUES ('mirror', '镜子', '功能', 'assets/pixel/mirror.png', 56, 72, 0, 'mirror', 0, 1)
ON CONFLICT (type) DO NOTHING;
```

同样，default\_room\_layout 表中如果有 seed，也加一行 mirror 的默认位置（x=45, y=44, z=2, scale=1）。

### 本地测试需求（TR）

| TR ID | 类型   | 条件                                                                                       | 证据         |
| ----- | ---- | ---------------------------------------------------------------------------------------- | ---------- |
| T8-R1 | rule | 若执行：运行 migration 后，`SELECT * FROM furniture WHERE type='mirror'` 返回 1 行且 action='mirror' | SQL 执行结果截图 |

***

## Task 9：集成自测 + 不透明度验证

**优先级**：high
**依赖**：T1–T7 全部完成
**关联 AC**：AC-R1 \~ AC-R11, AC-Q1 \~ AC-Q4

### 任务说明

按以下清单执行验证，每一项记录结果：

1. **新用户流**：localStorage 清干净 + 重新登录（或开无痕窗口）→ 首页看到镜子在墙上 → 点镜子 → 弹窗五章均为「还在认识中…」→ 提示未开启 AI（如果是本地离线）；
2. **AI 重新总结流**：确保 insight + self\_manual agent 均 enabled → 点「重新总结」→ 观察节流按钮禁用 → 成功后内容刷新 → updatedAt 更新 → 10 分钟内再点 → toast；
3. **编辑模式家具操作流**：点布置 → 镜子可选中 → 拖动移位 → 放大缩小 → 放回家具库 → 从家具库摆回 → 退出布置 → 点击镜子仍弹窗；
4. **后台图片上传流**：admin → 家具库 → 找到 mirror → 换一张 PNG → 上传 → 保存 → 前端 Ctrl+Shift+R → 镜子图片更新；
5. **后台布局编辑器流**：admin → 布局编辑器 → 默认🛋️ 房间 → palette-list 中可见 mirror → 拖进画布 → 切🌿 森林 → palette 无 mirror；
6. **不透明度视觉检查**：与小床、画框、置物架、钟对比，镜子边缘无半透明透色，背景无法透过镜子；
7. **XSS 安全**：Console 改 selfManual.chapter1 为 XSS payload → 弹窗内显示为纯文本不执行。

### 本地测试需求（TR）

| TR ID | 类型     | 条件                                                              | 证据                     |
| ----- | ------ | --------------------------------------------------------------- | ---------------------- |
| T9-R1 | rule   | 新用户流通过（6 项）                                                     | 视频或截图集                 |
| T9-R2 | rule   | AI 重新总结流通过（4 项）                                                 | Network + toast + 内容截图 |
| T9-R3 | rule   | 编辑模式操作流通过（6 项）                                                  | 录屏或截图                  |
| T9-R4 | rule   | 后台图片上传生效                                                        | 截图                     |
| T9-R5 | rule   | 布局编辑器双背景过滤正确                                                    | 两模式各截图                 |
| T9-R6 | rule   | 不透明度合格                                                          | 放大边缘截图                 |
| T9-R7 | rule   | XSS 无执行                                                         | 截图 payload 为纯文本        |
| T9-R8 | rubric | 代码 diff 评审：结构遵循现有模式（action 分发、builders/inits 对、无绕路逻辑）（pass≥1.5） | 代码 diff 截图             |

