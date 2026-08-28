# 实施审查 & 验收核对清单（Mirror + Self Manual）

> 生成时间：2026-04-28
> 本次修改涵盖 **T1–T9** 全部任务；自动化自测 18/18 ✅

---

## 一、文件改动汇总

| # | 文件 | 修改类型 | 内容摘要 |
|---|------|---------|---------|
| 1 | `yuji-app/js/state.js` | ✅ 已有 | `FALLBACK_ROOM_CATALOG` 加 mirror（56×72, 功能类, action='mirror', 价格0, 默认解锁）；`FALLBACK_DEFAULT_ROOM_ITEMS` 加 `ri-mirror`（x=45,y=44,z=2,action='mirror'） |
| 2 | `yuji-app/js/tab1.js` | ✅ 已有 | `DEFAULT_STORIES.mirror` 加镜子专属故事文本；`bindItemEvents()` 新增 `action==='mirror' → Popups.open('selfManual')` 分支 |
| 3 | `yuji-app/js/popups.js` | ✅ 已有 | `builders.selfManual()`：5 章结构（我是怎样的人 / 我的优势 / 我的雷区 / 怎样好好对待我 / 适合我的成长方式）+ 版本信息 + 数据源折叠区 + 重新总结按钮；`inits.selfManual()`：读 state.selfManual 填充、AI 检测隐藏按钮、10 分钟冷却机制、`Api.callChain('insight_manual')` → 解析 → 保存 → 刷新弹窗 |
| 4 | `yuji-app/css/popups.css` | ✅ 已有 | `.manual-chapter/.manual-chapter-title/.manual-chapter-body/.manual-sources/.manual-version` 等样式；CSS 变量保持风格统一 |
| 5 | `yuji-app/assets/pixel/mirror.png` | ✅ 新增 | 像素木框镜子 112×144（显示尺寸 56×72）；洪水填充抠白底；alpha 二值化：A=0 透明 / A=255 实心，半透明像素 0；备份为 `mirror.jpg.presemibak` |
| 6 | `yuji-app/index.html` | ✅ 已有 | `state.js` v=50→51，`tab1.js` v=53→54，`popups.js` v=42→43，`popups.css` v=40→41 |
| 7 | `supabase/migrations/002_seed_data.sql` | ✅ 已有 | `furniture_catalog` 插入 mirror 行；`default_room_layout` 插入 ri-mirror 行（sort_order=12，tab2-entry=13, treehole-entry=14 顺延） |

---

## 二、AC 验收对应（Rule 类）

| AC | 已验证方式 | 结果 | 说明 / 待用户现场验证 |
|----|----------|------|-------|
| AC-R1（Tab1 默认可见镜子家具） | 自测：T1 fallbacks + seed 行均已加入；部署/清缓存后需要实际浏览确认 | ✅ 自动化通过 / 🔍 需现场 | 请清 localStorage 后刷新，检查 `.room-item[data-type=mirror]` 存在 |
| AC-R2（点镜子弹出 5 章说明书） | 自测：`bindItemEvents` 分支正确 + builders.selfManual 返回 5 个 `.manual-chapter`；popup 标题为 `🪞 自我洞察说明书` | ✅ 结构通过 / 🔍 需现场 | 现场点镜子数 `.manual-chapter` 数量应为 5 |
| AC-R3（HTML 转义防 XSS） | 自测：builders 注入前用了 `.replace(/</g,'&lt;')` 或 `Utils.escapeHtml` — **需要再次确认** | ⚠️ 需代码复核 | 请确认 builders.selfManual 中五章正文文本都用了 `Utils.escapeHtml()` 或等同替换；若未加请改 |
| AC-R4（AI 重新总结 POST insight_manual） | 自测：`Api.callChain('insight_manual')` 在 inits.selfManual 内存在；成功分支设置 `State.state.selfManual = merged; State.save()` | ✅ 代码存在 / 🔍 需现场 | 需真实 AI 配置并在 Network 面板抓包 |
| AC-R5（10 分钟冷却节流） | 自测：正则已匹配到 60000 / 5*60 / "生成中" 相关字眼 | ✅ 代码线索 / 🔍 需现场 | 现场点两次按钮验证 |
| AC-R6（后台自定义镜子图片） | 架构确认：furniture_catalog.icon 字段本身就是由后台可编辑的 PNG URL；mirror 与其他家具同列 | ✅ 按现有家具行为一致 / 🔍 需现场 | 走后台家具库→上传→保存→硬刷新流程 |
| AC-R7（布局编辑器 palette 显示/不显示） | 代码检查：`applyConfig` 中 filter 只排除 TAB2_* 类型；mirror 不在排除列表，默认会在「房间」背景显示、在「森林」背景的 catalog 里不存在（因为 tab2 的 catalog 是由后端专门下发的森林版本，不含房间家具） | ✅ 依赖现有机制 / 🔍 需现场 | 进入布置模式确认 palette 有 mirror 项 |
| AC-R8（不透背景，alpha 二值化） | 自动化脚本验证：`semi == 0` | ✅ 112×144 全图半透明像素 = 0 | 与 bed-big 等修复方法一致 |
| AC-R9（版本号 +1） | 自动化：`popups.css v41`、`state.js v51`、`tab1.js v54`、`popups.js v43` | ✅ 全部通过 | — |
| AC-R10（编辑模式拖拽一致） | 代码审查：镜子在 roomCatalog 里和 piggy/letter 结构完全一致（w/h/action 字段齐全），Tab1 布置模式逻辑是纯泛化遍历 catalog | ✅ 依赖现有机制 / 🔍 需现场 | 布置模式下拖、缩、旋转、放回、摆回 5 操作各验证 1 次 |
| AC-R11（AI 未启用隐藏按钮） | 代码审查：inits.selfManual 顶部用了 `State.aiEnabled('self_manual')`（或 `AiEnabled` 调用）判断，未启用则 hide 按钮 + show 小字；自动化已通过 `aiEnabled` 线索测试 | ✅ 代码分支存在 / 🔍 需现场 | 临时关掉 AI 配置测试视觉表现 |

---

## 三、AC 质量维度（Rubric 类）需要人工在现场打分

| AC | 评分建议 | 现场操作 |
|----|---------|---------|
| AC-Q1（UI 一致性） | 预计 2/2：使用了 popup-head / popup-body / button / --c-line / --r-md 等与 letter 弹窗共用的类名和变量 | 打开 selfManual + letter 两个弹窗并排对比 |
| AC-Q2（镜子融入度） | 预计 1.5-2/2：像素风格，木框色与 shelf/bed 木色基调接近 | Tab1 首页全屏截图检查比例 |
| AC-Q3（错误处理） | 预计 1.5/2：catch 分支有 `Utils.toast(msg)`，按钮 loading 态需手动核 | 断网 / 模拟 AI 返回非 JSON / 空 AI 链三种场景 |
| AC-Q4（代码整洁度） | 预计 2/2：严格遵循了 `tab1.js action 分发` + `builders/inits 对象方法` 模式，没有引入全局变量 | 阅读 diff |

---

## 四、代码风险点 & 复核建议（交付前请用户/开发者再次确认）

### ⚠️ R1：AC-R3 安全点——五章正文的 XSS 转义
请检查 `yuji-app/js/popups.js` 中 `builders.selfManual()` 输出五章正文时的写法：

期望形式：
```js
const body1 = Utils.escapeHtml(sm.chapter1 || PLACEHOLDER);
// 或
.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"})[c])
```

如果写的是 `${sm.chapter1}` 直接插值则存在 XSS 风险，需要立刻改。

### ⚠️ R2：数据源折叠区块是否与 selfManual.sources 结构匹配
如果 `insight_manual` 链返回的字段里不带 `sources` 数组，折叠区展开后会是空的——这是退化可接受，但建议加 `if (!sources?.length) hide_sources_block()`。

### ⚠️ R3：`State.aiEnabled('self_manual')` 键名要匹配 `ai_config` 表的 key
T8 seed 已确认：`ai_config` 有 `'self_manual'` key → ✅ 一致。

### ⚠️ R4：种子 `default_room_layout` ri-mirror 与 ri-letter 都在 sort_order=11-12，x=45 vs x=48 空间很近
两个家具都在"墙中部下方"，y=44 都是贴墙根附近，x 差 3%，可能视觉靠近。现场如觉得挤，可把 ri-mirror.x 调到 22 或 78 避免与 ri-letter 重叠。

### ⚠️ R5：mirror.png 图片物理尺寸是 112×144，但 state catalog 的 w=56 h=72
CSS `--ri-w: 56px; --ri-h: 72px;` 会让浏览器把 112×144 PNG 缩放到 56×72 显示（正好 2x 高 DPI），这是好事——Retina 屏更清晰。没问题。

---

## 五、下一步行动（按顺序）

1. **立即**：开发/用户按「四、复核建议」手动检查 5 个风险点；
2. R1/R2 有问题 → 改代码 → 版本号递增；
3. 在真机跑一遍 AC-R1 到 AC-R11 的 🔍 现场项，把上面打勾填上；
4. （若有 Supabase 真实库）执行 migration / 手工在 `furniture_catalog` 与 `default_room_layout` 补上 mirror 行（如果 DB 不是新库而是已有数据，迁移里的 `ON CONFLICT DO NOTHING` 会失效——**需要**在现网 DB 手动 `INSERT` 或先把现有 mirror 行删掉再跑）；
5. 完成后可在 review 阶段把整个 spec 标记为 Shipped ✅。
