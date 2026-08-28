# 规格说明书：Tab1「镜子」家具 + 自我洞察说明书弹窗

## 一、问题背景

按照 PRD v3.3，Tab2「遇见·内心森林」原本设计了两个交互物：
- 🪞 **森林镜子**：自我探索（性格/特质/习惯/兴趣/价值观观察）
- 📖 **古老石书**：打开《自我说明书》五章

当前实现中：
1. **Tab2 森林只保留了「本心对语」木牌**，镜子 + 石书的 UI 入口均已删除；
2. **数据层管线仍在**：`State.state.selfManual` 五章数据结构、Supabase Edge Function `ai-chain` 的 `insight_manual` 编排链（insight → self_manual → 解析 JSON → 存回 selfManual）、`_shared/context.ts` 多维度数据采集均完好；
3. 但没有任何前端入口能触发「生成/查看自我说明书」。

用户希望将镜子 + 石书的**逻辑合并**，以「🪞 镜子」作为 Tab1 房间的一件**初始家具**呈现：
- 镜子是一件正常家具，可被后台设置自定义图片；
- 点击镜子 → 弹出《自我洞察说明书》弹窗；
- 弹窗显示五章内容 + "让 AI 重新总结"按钮；
- AI 总结基于用户在 App 中各板块授权过的数据（情绪记录、自我照顾、成长星点、花园耕作、信件对话、数值状态等——全部由后端 `context.ts` 已有的采集逻辑完成）。

---

## 二、目标

- **G1**：Tab1 房间新用户默认包含一件「🪞 镜子」初始家具；
- **G2**：镜子家具像其他家具一样可被后台（admin 家具库）自定义图标、宽高、是否默认解锁、价格等，也支持布局编辑器摆位置、拖动、缩放；
- **G3**：用户（非编辑模式下）点击镜子 → 弹出「自我洞察说明书」窗口，展示五章内容；
- **G4**：弹窗内提供「✨ 让 AI 重新总结我」按钮，调用后端 `insight_manual` 编排链，基于用户授权的全部数据生成新版五章，保存并即时刷新展示；
- **G5**：已有管线完全复用，不新增后端 Edge Function、不新增数据库表；
- **G6**：镜子同 Tab1 其他家具一样，不透背景（沿用前两次修复的 alpha 二值化 + isolation/isolate 机制，含 SVG `#alpha-hard-edge` filter 兜底）。

---

## 三、非目标

- ❌ 不重做 Tab2 森林的镜子/石书；
- ❌ 不新增自我说明书第六章或改变五章结构；
- ❌ 不新增 AI agent，只复用 `insight` + `self_manual`；
- ❌ 不修改 furniture-images 存储桶或上传逻辑；
- ❌ 不实现"镜子里反射小我"的视觉效果。

---

## 四、功能需求（FR）

### FR-1：镜子家具定义 & 默认出现在房间

**Scope**：前端 `state.js`、后端 seed/migration（可选，admin 手动新增亦可）

1. `FALLBACK_ROOM_CATALOG` 新增一项：
   ```
   type: 'mirror'
   name: '镜子'
   category: '功能'
   action: 'mirror'           ← 关键：标识点击要打开自我说明书弹窗
   unlockedByDefault: 1
   price: 0
   icon: 本地兜底 PNG 路径（assets/pixel/mirror.png，用户未上传自定义图时使用）
   w, h: 合理像素尺寸（如 56×72，可由后台覆盖）
   ```
2. `FALLBACK_DEFAULT_ROOM_ITEMS` 新增一项初始摆放：
   ```
   id: 'ri-mirror'
   type: 'mirror'
   x, y, z, scale: 挂在墙的合理位置（如 x=45%, y=44%, z=2）
   ```
3. `applyConfig()` 中 `furnitureCatalog` filter 条件**不排除** `type === 'mirror'`（它是 Tab1 家具，不是 Tab2 专用 entry）；`defaultRoomLayout` filter 同理。

### FR-2：后台自定义镜子图片 & 布局放置

**Scope**：`admin/admin.js` 家具库模块、布局编辑器模块

1. 镜子（type=mirror）是一件**普通 Tab1 家具**，在 admin 家具库：
   - 家具列表行显示当前图标；
   - 点击「📤 上传图片」→ 走现有 `uploadImage('/api/admin/furniture/upload', {forceName:'mirror', ...})` 流程，支持抠图选项；
   - 支持编辑 name / category / icon / w / h / price / action 字段并保存；
   - **新增家具模态框**也支持手动 type=mirror 新增。
2. 布局编辑器（房间模式）调色板中，镜子应作为普通家具**显示**（`renderPalette` 的 tab2_entry/treehole_entry 过滤不影响它），可被拖进画布并调整位置/缩放/旋转。
3. admin 切换到「🌿 森林」背景（layoutBgKey=forest）时，调色板应隐藏镜子（镜子是 Tab1 房间专用，不出现在森林木牌里）—— **这与现有 tab2_entry 显示逻辑正好相反**：森林模式调色板只显示 tab2_entry/treehole_entry，所以 mirror 天然不会出现在那里，无需改动。

### FR-3：点击镜子 → 打开《自我洞察说明书》弹窗

**Scope**：`tab1.js` bindItemEvents、`popups.js` builders/inits

1. `tab1.js` `bindItemEvents` 点击分发中，新增 action 分支：
   ```js
   else if (cat.action === 'mirror') {
     Popups.open('selfManual');      // 新弹窗名
   }
   ```
   保持 editMode 下正常选中、拖动。
2. `popups.js` 新增 `builders.selfManual()` 返回 HTML 结构：
   - 标题栏：🪞 自我洞察说明书 + 关闭按钮；
   - **版本时间**：右上角或标题下方小字显示 `selfManual.updatedAt`（格式化）；
   - **五章面板**，每章标题固定，正文来自：
     | 章节 | 标题 | 字段 |
     |------|------|------|
     | 第一章 | 🌸 我是怎样的人 | selfManual.chapter1 |
     | 第二章 | ✨ 我的优势 | selfManual.chapter2 |
     | 第三章 | ⚠️ 我的雷区 | selfManual.chapter3 |
     | 第四章 | 🤍 怎样好好对待我 | selfManual.chapter4 |
     | 第五章 | 🌱 适合我的成长方式 | selfManual.chapter5 |
   - 正文全部走 `escHtml()` 转义；
   - 兜底文案为「还在认识中…」时样式灰化；
   - 底部按钮区：
     - 左侧 ghost 按钮「查看数据来源」（可选，默认折叠，展开后显示一段说明：内容来源于你记录的情绪、自我照顾打卡、成长星点、花园耕作、本心对语对话等你授权给小我的所有数据）；
     - 右侧 primary 按钮「✨ 让 AI 重新总结我」——仅当 `State.aiEnabled('insight')` 或 `State.aiEnabled('self_manual')` 或全局任一 AI 已启用时显示；未启用 AI 时此按钮隐藏并显示一行小字提示「当前未配置 AI 智能体，请在后台开启洞察 + 自我说明书智能体后使用」。
     - 固定按钮「完成」关闭弹窗。
3. `popups.js` 新增 `inits.selfManual()`：
   - 绑定「让 AI 重新总结我」按钮：
     1. 按钮 disabled → 文案改为「小我在总结你…（通常 1-3 分钟）」；
     2. 调用 `Api.callChain('insight_manual', [])`；
     3. 调用成功后：
        - 因为后端 `saveToSelfManual` 已经直接写入了 Supabase `user_state.data.selfManual`，前端需要**立刻拉取最新状态** → 调用 `State.loadRemoteOrFallback()`（若存在）或 `Api.getState()` 后把 selfManual 合并到 `State.state.selfManual` 并 `State.save(false /* skipSync */)`；
        - 如果 State 没有单独 loadRemote 方法，则调 `Api.saveState()` 前先手动保存到本地 selfManual（避免等轮询）：从响应里若后端返回了 step 文本和已解析 JSON，直接写入本地 + 持久化；
        - 关闭并重新打开弹窗：`Popups.close(); Popups.open('selfManual');`
     4. 失败 → toast 错误信息；
     5. 最终按钮恢复。

### FR-4：前端家具不透明机制复用

**Scope**：`tab1-home.css` / `main.css`（通常无需改动，验证即可）

- 镜子家具 DOM 路径 `.room-item[data-type="mirror"] > .ri-visual > .ri-sprite > img`；
- 沿用已有规则链：
  - `.room-item .ri-sprite img` 在 CSS 中已经应用 `filter: url(#alpha-hard-edge)` 兜底；
  - `.room-furniture / .room-item / .ri-visual / .ri-sprite / .ri-sprite img` 四层已加 `isolation: isolate + mix-blend-mode: normal + translateZ(0)`；
  - `.scene-layer` 全部独立合成；
- 若镜子 PNG 本身有半透明像素，上传时勾选「抠图」→ 抠图后再走 PIL alpha 二值化脚本（服务端），再加上浏览器 SVG filter 兜底，保证 100% 实心。

### FR-5：State / 持久化

**Scope**：`state.js`

1. `buildDefaultState()` 中 `selfManual` 默认值已正确存在，无需改动；
2. 如果 `loadRemoteOrFallback()` / `init()` 拉取 `Api.getState()` 后 merge 逻辑存在，要确保 selfManual 不会被 `deepMerge` 用老的 localStorage 覆盖——沿用已有的「后端优先覆盖」策略（若目前有问题则修复，但当前代码中 selfManual 只是一层简单字段，merge 应无冲突）；
3. 新增工具函数 `State.updateSelfManualFromRemote(raw)` 便于弹窗初始化成功后立刻合并本地状态（可选，用现有赋值 `State.state.selfManual = {...}` + `State.save()` 也可）。

---

## 五、非功能需求（NFR）

### NFR-1：缓存版本号递增

改动涉及以下前端资源，**必须在 `index.html` 中 bump 版本号**以强制浏览器刷新：

- `js/state.js?v=43` → v=44
- `js/tab1.js?v=53` → v=54
- `js/popups.js?v=41` → v=42
- `css/popups.css?v=39` → v=40（新增弹窗样式）
- 其他资源若无改动则不变。

### NFR-2：不透明度 & 层级

- 镜子必须与其他家具一样完全不透背景；
- `.room-item[data-type="mirror"]` z-index 仍按 `10 + z`，不得与其他家具产生层级穿透。

### NFR-3：节流

- 用户可以点击多次「让 AI 重新总结我」，前端需**防抖**：同一用户 10 分钟内只允许触发 1 次（按钮 disabled + 本地 `localStorage.lastManualRunTs` 控制）；超过限制时 toast「刚总结过，10 分钟后再试试吧～」。
- （后端已存在的 insight_manual 节流如有则以更严格者为准）

### NFR-4：AI 失败降级

- 若 `insight_manual` 调用失败：不覆盖当前 selfManual 内容，保留旧版并 toast 错误信息，按钮重新启用。

### NFR-5：XSS 防护

- 弹窗正文中所有 selfManual.chapterX 文本必须经 `escHtml()` 转义后再插入 DOM（目前 popups.js 内已有 escHtml 函数）。

---

## 六、约束 & 依赖

- **C-1**：复用现有 furniture 系统（定义、上传、布局）；不得新增独立的「镜子表」。
- **C-2**：AI 链必须走 `Api.callChain('insight_manual')` → Supabase Edge Function `ai-chain` → insight agent + self_manual agent → `saveToSelfManual()` 解析落库。
- **C-3**：镜子图标需提供本地兜底 PNG，避免用户首次部署无上传图时图标 404（可先用简单像素镜面图）。
- **C-4**：预览账号（`is_preview=true`）的 admin 轮询同步要能识别 mirror 家具——因为 mirror 不是 tab2_entry/treehole_entry，不受现有 filter 影响，理论直接支持，但需手动验证。
- **C-5**：弹窗 HTML 结构要符合现有 `.popup-head / .popup-body / .popup-foot` 三段式规范，样式复用 popups.css 已有类，禁止引入全局 UI Kit。

---

## 七、开放问题

- **Q1**：兜底镜子 PNG 的美术风格？→ **决策：先放一面简洁像素镜面图（可用程序生成或让用户后续替换），尺寸 56×72 左右，白底上传后抠图 + alpha 二值化处理。**
- **Q2**：「数据来源」展开说明的具体文案？→ **决策：使用规范模板，明确列出情绪记录 / 自我照顾 / 成长星点 / 花园耕作 / 本心对语 / 小我信件 六个来源；文案不用写太细，点到为止。**
- **Q3**：首次点击弹窗，若 selfManual 仍为「还在认识中…」，是否自动触发 AI 总结？→ **决策：不自动触发，只显示引导按钮，避免新用户首次点击立即消耗 AI tokens。**

---

## 八、验收标准（Acceptance Criteria）

### Rule 类型（可客观验证）

| ID | 规则 | 验证方式 |
|----|------|----------|
| **AC-R1** | 新用户 / 清缓存用户进入 Tab1，房间内可见一件名为「镜子」的家具 | 清除 localStorage 后注册新账号 → 进入首页 → DOM 中存在 `.room-item[data-type="mirror"]` 且 img src 不为空 |
| **AC-R2** | 镜子家具点击（非编辑模式）弹出「自我洞察说明书」弹窗，弹窗标题含五章标题 | 点击镜子 → `.popup-title` 文本为「🪞 自我洞察说明书」+ DOM 内存在 5 个 `.manual-chapter` 区块（或对应 chapter1-chapter5 标识） |
| **AC-R3** | 五章正文分别从 `State.state.selfManual.chapter1~5` 读取并 HTML 转义 | 在 Console 手动设置 `State.state.selfManual.chapter1 = '<script>alert(1)</script>'` → 打开弹窗 → 文字原样显示（不弹 alert） |
| **AC-R4** | 点击「✨ 让 AI 重新总结我」→ 调用 `Api.callChain('insight_manual')` → 成功后五章内容更新 | 开启 Network 面板 → 点击按钮 → 看到对 ai-chain 的 POST 请求 body `{chain:'insight_manual'}` → 成功后 selfManual.updatedAt 比之前新 → 弹窗内容刷新 |
| **AC-R5** | 10 分钟内连续点击「重新总结」只触发 1 次调用，第二次被 toast 拦截 | 成功触发一次 → 再点一次 → toast 「10 分钟」提示 → Network 无第二次 ai-chain 请求 |
| **AC-R6** | admin 家具库可见 mirror 行，可上传 PNG → 保存 → 前端刷新后镜子图标更新 | 打开 admin → 家具库 → 找到 mirror → 上传 PNG → 点保存 → 前端 Ctrl+Shift+R → 镜子 img src 指向新 URL |
| **AC-R7** | admin 布局编辑器（🛋️ 房间背景）中调色板显示镜子，森林背景中不显示 | 打开布局编辑器 → 默认房间背景 → palette-list 中含 mirror 项 → 切换森林背景 → palette-list 不含 mirror 项 |
| **AC-R8** | 镜子家具完全不透背景，家具底无半透明鬼影污染 | 视觉检查；同已修复的 bed-big 等家具效果一致；截图对比边缘无"透色" |
| **AC-R9** | index.html 中 state.js/tab1.js/popups.js/popups.css 的版本号均已 +1 | 打开 index.html 查看 script/link 标签 query v 值变化符合 NFR-1 |
| **AC-R10** | 编辑模式下镜子可被拖动 / 缩放 / 旋转 / 放回家具库，行为与其他带 action 家具一致 | 切布置模式 → 拖动 → 缩放 → 放回家具库 → 家具库里可再摆回 → 退出布置后点击仍能打开说明书 |
| **AC-R11** | 未开启 AI（aiEnabled 返回 false）时弹窗底部「重新总结」按钮隐藏并显示提示文案 | 在 Console 临时屏蔽 State.aiEnabled → 打开弹窗 → 按钮不显示 → 存在一行小字「当前未配置 AI 智能体」 |

### Rubric 类型（质量维度）

| ID | 维度 | 评分锚点（0-2，pass≥1.5） | 证据来源 |
|----|------|--------------------------|----------|
| **AC-Q1**：弹窗 UI 一致性 | 2 = 与 letter/furniture 等弹窗视觉风格完全统一（字体、圆角、阴影、按钮样式、间距比例）；1 = 大体一致但有 1-2 处小偏差；0 = 风格明显脱节 | 打开 selfManual 弹窗截图对比 letter 弹窗 |
| **AC-Q2**：镜子视觉融入度 | 2 = 与现有家具像素风格统一，挂墙比例协调不突兀；1 = 风格可接受但比例略怪；0 = 镜子明显违和 | 全屏首页截图检查 |
| **AC-Q3**：错误处理体验 | 2 = 断网 / AI 失败 / 解析失败三种场景都有清晰 toast 提示且按钮自动恢复；1 = 仅部分场景提示；0 = 静默失败 | 断网点按钮 / mock 失败响应观察行为 |
| **AC-Q4**：代码结构整洁度 | 2 = 新增代码严格遵循现有 tab1.js action 分发模式 + popups builders/inits 双函数模式，无重复逻辑，action 常量集中管理；1 = 结构可接受但有小瑕疵；0 = 引入了新的全局变量或绕开了现有模式 | 代码评审 diff |
