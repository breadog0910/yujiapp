# Tab3 技能种植农场 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Tab3 从固定 3×3 事件驱动种子系统重做为「技能种植农场」——用户自定义技能、记录学习时间/完成阶段性小目标推进作物生长；土地图、作物品种库、各阶段图、格子位置由管理后台可视化配置并同步前端。

**Architecture:** 严格遵循现有 Supabase+Vercel 架构。新增两张公开表（`farm_crop_catalog`/`farm_plot_layout`，RLS 公开读/admin 写）+ 一个 Storage 桶 `farm-images`；前端 supabase-js 直连；admin 后台直接写库（镜像现有家具库表格 CRUD + 房间布局拖拽）；土地底图复用 `tab_backgrounds['tab3']`；不新增 Edge Function。成长 = 累计学习分钟 + 完成小目标积分 → 阶段。

**Tech Stack:** React 风格 vanilla JS（无构建）、Vite 5、TailwindCSS、supabase-js、PostgreSQL+RLS、Supabase Storage。

**测试现实说明：** 本前端代码库为 vanilla JS（script 标签直载，无 Jest/Vitest），后端为 Supabase SQL。因此采用「验证锚定」步骤而非单测：SQL 用 Supabase SQL Editor 查询验证；前端用具体浏览器操作 + 预期控制台/视觉结果验证。每个 Task 仍以可独立提交的变更收尾。

**参考文件（实现时务必先读对应已有实现以镜像风格）：**
- [yuji-app/admin/admin.js](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/admin/admin.js) 房间布局拖拽（`loadLayout`/`renderRoom`/`bindItemEvents`/`#layout-save`，L470-L609）+ 资源映射表（L181-L236）+ Storage 上传（L319+）
- [yuji-app/js/state.js](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/state.js) `applyConfig`/`buildDefaultState`/`pollPreviewConfig`/`currentConfigFingerprint`
- [yuji-app/js/api.js](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/api.js) `getConfig` 并行查询+map
- [yuji-app/js/tab3.js](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/tab3.js) 旧实现（待整体替换）
- [yuji-app/js/popups.js](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/popups.js) builders/inits 模式 + 旧 seedSelect/harvest/cottage（L339-L455、L1087-L1145）
- [supabase/migrations/001_init_schema.sql](file:///c:/Users/29948/Desktop/workbuddy/supabase/migrations/001_init_schema.sql) RLS 同款写法

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `yuji-app/assets/farm/land.png` | 土地底图 | 新建（复制 46189e3d...png） |
| `supabase/migrations/003_farm_schema.sql` | 建表/RLS/桶/种子数据/底图 | 新建 |
| `yuji-app/js/api.js` | getConfig 加农场两表查询+map | 改 L153-L229 |
| `yuji-app/js/state.js` | applyConfig 缓存农场配置；buildDefaultState 用 farmPlots；新 farm 方法；删旧 plantSeed/feedGarden/harvestPlot/getSeed；fingerprint 纳入农场 | 改 |
| `yuji-app/js/tab1.js` | 移除 `State.feedGarden('selfcare')` 调用 | 改 L715 附近 |
| `yuji-app/js/popups.js` | 新增 farmPlant/farmLog builders+inits；移除旧 seedSelect/harvest/cottage；移除 emotion/interest/express 中的 feedGarden 调用 | 改 |
| `yuji-app/js/tab3.js` | 完全重写：渲染土地+格子+作物阶段图；交互分发到 popups | 重写 |
| `yuji-app/css/tab3-garden.css` | 格子改百分比定位；保留粒子/农夫/弹跳 | 改 |
| `yuji-app/index.html` | tab3 DOM 注释；CSS/JS version+1 | 改 L20、L169-L199、L275 |
| `yuji-app/admin/index.html` | 侧栏加「技能农场」；section 两子面板+模态框 | 改 L34-L46 区、L124 后 |
| `yuji-app/admin/admin.js` | 加 farm-crops/farm-plots 资源映射+mapper；loadFarmCrops/loadFarmPlots+拖拽画布+品种阶段图上传；导航注册 | 改 |
| `yuji-app/admin/admin.css` | 农场 section/拖拽画布/品种模态框样式 | 改 |

---

## Task 1: 资产与迁移 SQL（地基）

**Files:**
- Create: `yuji-app/assets/farm/land.png`
- Create: `supabase/migrations/003_farm_schema.sql`

- [ ] **Step 1: 复制土地底图**

把项目根 `46189e3d4888f758f1f4fbb94ed8f3df.png` 复制为 `yuji-app/assets/farm/land.png`（目录已存在，内有 crop-*.png）。

PowerShell:
```powershell
Copy-Item "46189e3d4888f758f1f4fbb94ed8f3df.png" "yuji-app/assets/farm/land.png"
```

- [ ] **Step 2: 写迁移 SQL**

创建 `supabase/migrations/003_farm_schema.sql`，完整内容：

```sql
-- ============================================================
-- 《予己》003 技能农场 schema + RLS + 种子数据
-- 执行方式：在 001/002 之后于 Supabase SQL Editor 执行
-- ============================================================

-- 1. 作物品种库
CREATE TABLE IF NOT EXISTS farm_crop_catalog (
  key               TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  emoji             TEXT,
  stages            TEXT NOT NULL,            -- JSON: [{image,name}, ...]
  minutes_per_stage INTEGER NOT NULL DEFAULT 600,
  sort_order        INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ
);

-- 2. 土地格子位置
CREATE TABLE IF NOT EXISTS farm_plot_layout (
  id          TEXT PRIMARY KEY,
  x           REAL NOT NULL,                  -- 百分比 0-100
  y           REAL NOT NULL,
  z           INTEGER DEFAULT 3,
  scale       REAL DEFAULT 1,
  sort_order  INTEGER DEFAULT 0
);

-- 3. RLS
ALTER TABLE farm_crop_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_plot_layout  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fcc_read_all" ON farm_crop_catalog FOR SELECT USING (true);
CREATE POLICY "fcc_admin_wr" ON farm_crop_catalog FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "fpl_read_all" ON farm_plot_layout FOR SELECT USING (true);
CREATE POLICY "fpl_admin_wr" ON farm_plot_layout FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4. Storage 桶
INSERT INTO storage.buckets (id, name, public)
VALUES ('farm-images', 'farm-images', true)
ON CONFLICT (id) DO NOTHING;

-- 扩展现有 storage 策略的 bucket 白名单（重建含 farm-images 的版本）
DROP POLICY IF EXISTS storage_public_read ON storage.objects;
DROP POLICY IF EXISTS storage_auth_upload ON storage.objects;
DROP POLICY IF EXISTS storage_auth_update ON storage.objects;
DROP POLICY IF EXISTS storage_auth_delete ON storage.objects;
CREATE POLICY storage_public_read ON storage.objects FOR SELECT
  USING (bucket_id IN ('furniture-images','shop-images','tab-backgrounds','farm-images'));
CREATE POLICY storage_auth_upload ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('furniture-images','shop-images','tab-backgrounds','farm-images') AND auth.role() = 'authenticated');
CREATE POLICY storage_auth_update ON storage.objects FOR UPDATE
  USING (bucket_id IN ('furniture-images','shop-images','tab-backgrounds','farm-images') AND auth.role() = 'authenticated');
CREATE POLICY storage_auth_delete ON storage.objects FOR DELETE
  USING (bucket_id IN ('furniture-images','shop-images','tab-backgrounds','farm-images') AND auth.role() = 'authenticated');

-- 5. 种子数据：作物品种（阶段图复用 assets/farm/crop-s1..s4.png 与 crop-h1.png）
INSERT INTO farm_crop_catalog (key, name, emoji, stages, minutes_per_stage, sort_order, updated_at)
VALUES
  ('wheat',     '小麦',   '🌾', '[{"image":"assets/farm/crop-s1.png","name":"破土"},{"image":"assets/farm/crop-s2.png","name":"生长"},{"image":"assets/farm/crop-s3.png","name":"繁茂"},{"image":"assets/farm/crop-h1.png","name":"成熟"}]', 600, 0, NOW()),
  ('flower',    '向日葵', '🌻', '[{"image":"assets/farm/crop-s1.png","name":"破土"},{"image":"assets/farm/crop-s2.png","name":"生长"},{"image":"assets/farm/crop-s3.png","name":"繁茂"},{"image":"assets/farm/crop-h1.png","name":"成熟"}]', 900, 1, NOW()),
  ('tree',      '果树',   '🌳', '[{"image":"assets/farm/crop-s1.png","name":"破土"},{"image":"assets/farm/crop-s2.png","name":"生长"},{"image":"assets/farm/crop-s3.png","name":"繁茂"},{"image":"assets/farm/crop-h1.png","name":"成熟"}]', 1200, 2, NOW())
ON CONFLICT (key) DO NOTHING;

-- 6. 种子数据：默认格子位置（旧 PLOT_LAYOUT 像素 / 容器 331x290 → 百分比近似；3x3 菱形）
INSERT INTO farm_plot_layout (id, x, y, z, scale, sort_order) VALUES
  ('fp-0','37.2','25.7',3,1,0),
  ('fp-1','21.4','36.4',3,1,1),
  ('fp-2','54.3','36.4',3,1,2),
  ('fp-3','6.2', '49.1',3,1,3),
  ('fp-4','37.2','49.0',3,1,4),
  ('fp-5','69.9','49.1',3,1,5),
  ('fp-6','21.4','62.2',3,1,6),
  ('fp-7','54.3','62.2',3,1,7),
  ('fp-8','37.2','74.7',3,1,8)
ON CONFLICT (id) DO NOTHING;

-- 7. 土地底图更新为农场土地照片
INSERT INTO tab_backgrounds (tab_key, bg_path, updated_at)
VALUES ('tab3', 'assets/farm/land.png', NOW())
ON CONFLICT (tab_key) DO UPDATE SET bg_path = EXCLUDED.bg_path, updated_at = EXCLUDED.updated_at;
```

- [ ] **Step 3: 在 Supabase SQL Editor 执行该文件全文**

执行后用以下查询验证（应返回 3 品种、9 格子、tab3=land.png）：

```sql
SELECT (SELECT count(*) FROM farm_crop_catalog) AS crops,
       (SELECT count(*) FROM farm_plot_layout)  AS plots,
       (SELECT bg_path FROM tab_backgrounds WHERE tab_key='tab3') AS tab3bg;
```
预期：`crops=3, plots=9, tab3bg=assets/farm/land.png`

- [ ] **Step 4: 提交**

```bash
git add yuji-app/assets/farm/land.png supabase/migrations/003_farm_schema.sql
git commit -m "feat(farm): add land image + 003 schema (tables/RLS/bucket/seed)"
```

---

## Task 2: 后端读路径 — api.js getConfig 加农场两表

**Files:**
- Modify: `yuji-app/js/api.js:153-229`（getConfig 并行查询块 + 返回对象）

- [ ] **Step 1: 在并行查询数组追加两表**

在 [api.js getConfig](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/api.js#L153-L173) 的 `Promise.all` 解构里，于 `aiRows` 之后追加两个查询变量。把解构改为：

```js
    const [
      { data: furniture, error: e1 },
      { data: layout, error: e2 },
      { data: shop, error: e3 },
      { data: seeds, error: e4 },
      { data: settingsRows, error: e5 },
      { data: tabBgRows, error: e6 },
      { data: careRows, error: e7 },
      { data: aiRows, error: e8 },
      { data: farmCrops, error: e9 },
      { data: farmPlots, error: e10 },
    ] = await Promise.all([
      client.from('furniture_catalog').select('*').order('category').order('type'),
      client.from('default_room_layout').select('*').order('sort_order'),
      client.from('shop_items').select('*').order('kind').order('sort_order'),
      client.from('seed_catalog').select('*').order('sort_order'),
      client.from('site_settings').select('key, value'),
      client.from('tab_backgrounds').select('tab_key, bg_path, updated_at'),
      client.from('default_care_options').select('*').order('sort_order').order('id'),
      client.from('ai_config').select('key, name, provider, model, enabled').order('key'),
      client.from('farm_crop_catalog').select('*').order('sort_order'),
      client.from('farm_plot_layout').select('*').order('sort_order'),
    ]);
```

并在错误 warn 区追加（可选）：
```js
    if (e9) console.warn('[Api] farm_crop_catalog 查询失败', e9.message);
    if (e10) console.warn('[Api] farm_plot_layout 查询失败', e10.message);
```

- [ ] **Step 2: 加 mapper 并返回**

在 `mapSeed` 之后追加：

```js
    const mapFarmCrop = (r) => ({
      key: r.key, name: r.name, emoji: r.emoji,
      stages: JSON.parse(r.stages || '[]'),
      minutesPerStage: r.minutes_per_stage || 600,
      sortOrder: r.sort_order,
    });
    const mapFarmPlot = (r) => ({
      id: r.id, x: r.x, y: r.y, z: r.z, scale: r.scale, sortOrder: r.sort_order,
    });
```

在 return 对象追加两字段（与 seedCatalog 同级）：

```js
      farmCropCatalog: (farmCrops || []).map(mapFarmCrop),
      farmPlotLayout: (farmPlots || []).map(mapFarmPlot),
```

- [ ] **Step 3: 验证**

打开前端（已登录或预览账号），控制台跑：
```js
Api.getConfig().then(c => console.log(c.farmCropCatalog, c.farmPlotLayout))
```
预期：3 个作物、9 个格子。

- [ ] **Step 4: 提交**

```bash
git add yuji-app/js/api.js
git commit -m "feat(farm): getConfig queries farm_crop_catalog + farm_plot_layout"
```

---

## Task 3: state.js — 缓存农场配置 + 用户状态形状 + 农场方法 + 删旧

**Files:**
- Modify: `yuji-app/js/state.js`（applyConfig、currentConfigFingerprint、buildDefaultState、农场方法、return 导出）

- [ ] **Step 1: applyConfig 缓存农场配置**

在 [state.js](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/state.js#L94-L101) 动态配置声明区，于 `let aiConfig = []` 后追加：
```js
  let farmCropCatalog = [];
  let farmPlotLayout = [];
```

在 `applyConfig(cfg)` 末尾（`if (cfg.tabBackgrounds ...)` 块之后）追加：
```js
    if (Array.isArray(cfg.farmCropCatalog)) farmCropCatalog = cfg.farmCropCatalog;
    if (Array.isArray(cfg.farmPlotLayout)) farmPlotLayout = cfg.farmPlotLayout;
```

- [ ] **Step 2: 预览轮询指纹纳入农场配置**

把 [currentConfigFingerprint](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/state.js#L290-L297) 改为：
```js
  function currentConfigFingerprint() {
    return JSON.stringify({
      l: defaultRoomItems, u: unlockedTypes, c: DAILY_COIN_CAP,
      k: roomCatalog.map(f => f.type).join(','),
      b: tabBackgrounds,
      d: defaultCareOptions,
      f: farmCropCatalog, p: farmPlotLayout,
    });
  }
```

并在 `pollPreviewConfig` 检测到变更的分支里（`state.roomItems = buildDefaultRoomItems();` 之后）追加：
```js
        state.farmPlots = [];   // 预览账号：后台格子变更后重置农场为空（始终反映最新格子布局）
```

- [ ] **Step 3: buildDefaultState 用 farmPlots**

在 [buildDefaultState](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/state.js#L169-L205) 的返回对象里，把 `plots: [null,null,null, null,null,null, null,null,null],` 替换为：
```js
      farmPlots: [],          // 技能农场：每个已占格子一条 {plotId,skillName,cropKey,progress,sessions,goals,createdAt,matured}
      farmWarehouse: [],     // 成熟收获纪念
```
（删除旧 `gardenWarehouse: []` 行，避免遗留。）

- [ ] **Step 4: 加农场方法 + 删旧花园方法**

在 state.js 的「花园」段（旧 `plantSeed`/`feedGarden`/`harvestPlot`，L401-L444）整体替换为：

```js
  // 技能农场
  function getFarmCrop(key) { return farmCropCatalog.find(c => c.key === key) || null; }
  function getFarmPlotByPlotId(plotId) { return state.farmPlots.find(p => p.plotId === plotId) || null; }

  function farmStageOf(p) {
    const crop = getFarmCrop(p.cropKey);
    if (!crop || !crop.stages.length) return 0;
    return Math.min(Math.floor(p.progress / Math.max(1, crop.minutesPerStage)), crop.stages.length - 1);
  }

  function plantSkill(plotId, skillName, cropKey, goals = []) {
    if (!plotId || !skillName || !getFarmCrop(cropKey)) return false;
    if (getFarmPlotByPlotId(plotId)) return false;           // 格子已占
    state.farmPlots.push({
      plotId, skillName, cropKey, progress: 0,
      sessions: [], goals: goals.map(g => ({ id: Utils.uid(), label: g.label, points: +g.points || 0, completed: false })),
      createdAt: new Date().toISOString(), matured: false,
    });
    save();
    return true;
  }

  function logSession(plotId, minutes, note) {
    const p = getFarmPlotByPlotId(plotId); if (!p) return null;
    const m = Math.max(0, +minutes || 0);
    p.sessions.push({ id: Utils.uid(), date: new Date().toISOString(), minutes: m, note: String(note || '') });
    p.progress += m;
    const stage = farmStageOf(p);
    p.matured = stage >= (getFarmCrop(p.cropKey)?.stages.length || 0) - 1;
    save();
    return { progress: p.progress, stage, matured: p.matured };
  }

  function toggleGoal(plotId, goalId) {
    const p = getFarmPlotByPlotId(plotId); if (!p) return null;
    const g = p.goals.find(x => x.id === goalId); if (!g) return null;
    g.completed = !g.completed;
    p.progress += g.completed ? g.points : -g.points;
    const stage = farmStageOf(p);
    p.matured = stage >= (getFarmCrop(p.cropKey)?.stages.length || 0) - 1;
    save();
    return { progress: p.progress, stage, matured: p.matured };
  }

  function addGoal(plotId, label, points) {
    const p = getFarmPlotByPlotId(plotId); if (!p) return null;
    const g = { id: Utils.uid(), label: String(label || ''), points: Math.max(0, +points || 0), completed: false };
    p.goals.push(g);
    save();
    return g;
  }

  function harvestSkill(plotId) {
    const p = getFarmPlotByPlotId(plotId); if (!p || !p.matured) return null;
    const crop = getFarmCrop(p.cropKey);
    const item = {
      id: 'fw-' + Utils.uid(), skillName: p.skillName, cropKey: p.cropKey,
      emoji: crop?.emoji || '🌱', name: p.skillName, source: '技能农场',
      progress: p.progress, createdAt: p.createdAt, harvestedAt: new Date().toISOString(),
    };
    state.farmWarehouse.push(item);
    state.farmPlots = state.farmPlots.filter(x => x.plotId !== plotId);
    save();
    return item;
  }

  function removeSkill(plotId) {
    const before = state.farmPlots.length;
    state.farmPlots = state.farmPlots.filter(x => x.plotId !== plotId);
    if (state.farmPlots.length !== before) { save(); return true; }
    return false;
  }
```

- [ ] **Step 5: 更新 return 导出**

把 [return 块](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/state.js#L449-L475) 里的 `plantSeed, feedGarden, harvestPlot,` 删除，并在 `getCatalog, getSeed,` 之后改为：
```js
    getCatalog, getSeed,
    plantSkill, logSession, toggleGoal, addGoal, harvestSkill, removeSkill,
    getFarmCrop, getFarmPlotByPlotId, farmStageOf,
```

并在 getter 区追加：
```js
    get farmCropCatalog() { return farmCropCatalog; },
    get farmPlotLayout() { return farmPlotLayout; },
```

- [ ] **Step 6: 验证（控制台）**

```js
State.plantSkill('fp-0','学吉他','wheat');   // true
State.logSession('fp-0', 30, '练了C和弦');    // {progress:30, stage:0, matured:false}
State.farmStageOf(State.getFarmPlotByPlotId('fp-0'));  // 0
```
预期无报错；`State.state.farmPlots.length` 为 1。

- [ ] **Step 7: 提交**

```bash
git add yuji-app/js/state.js
git commit -m "feat(farm): state caches farm config + farmPlots shape + farm methods; drop old garden"
```

---

## Task 4: 清理旧 feedGarden / 旧 tab3 方法调用点

**Files:**
- Modify: `yuji-app/js/tab1.js:715` 附近
- Modify: `yuji-app/js/popups.js`（emotion L788、interest L1034、express L1076 的 feedGarden 调用）

- [ ] **Step 1: tab1.js 移除 selfcare feedGarden**

读 [tab1.js](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/tab1.js#L710-L720) L710-L720，删除 `const fed = State.feedGarden('selfcare', 1);` 行及紧随其后的、对 `fed` 的使用（若有 console/提示依赖 fed，改为删除该提示或保留无操作）。保留其余自我照顾奖励逻辑（金币/开心等）不变。

- [ ] **Step 2: popups.js 移除 emotion/interest/express 的 feedGarden**

读 [popups.js L785-L795](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/popups.js#L785-L795)（emotion init）、L1030-L1040（interest）、L1073-L1080（express），删除每个 `const fed = State.feedGarden(...)` 行及其后续对 `fed` 的引用（如 `if (fed.length) ...` 提示块）。保留主流程（写情绪记录/写兴趣/写表达）不变。

- [ ] **Step 3: 验证**

打开前端，完成一次自我照顾、记一次情绪——控制台不应出现 `State.feedGarden is not a function` 报错（因为 Task3 已删除该方法，这些调用若残留会报错）。

- [ ] **Step 4: 提交**

```bash
git add yuji-app/js/tab1.js yuji-app/js/popups.js
git commit -m "refactor(farm): remove old feedGarden call sites (decoupled from events)"
```

---

## Task 5: tab3-garden.css — 格子百分比定位

**Files:**
- Modify: `yuji-app/css/tab3-garden.css`

- [ ] **Step 1: 改 .garden-plots 为满屏百分比容器**

把 [.garden-plots](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/css/tab3-garden.css#L70-L99) 规则替换为（去掉固定 331×290 与九宫格背景图，改为满屏定位上下文，作物格子用百分比绝对定位）：

```css
.garden-plots {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;   /* 子格子单独开 pointer-events:auto */
}
.garden-plots::after { display: none; }   /* 旧阴影取消 */
```

- [ ] **Step 2: .plot 保留百分比定位 + 尺寸由 z-index/scale 控制**

`.plot` 规则保留（[L102-L117](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/css/tab3-garden.css#L102-L117)），但移除其中固定 `width/height`，改由 JS 内联设置百分比 left/top 与固定宽高（按 scale）。其余 `.plot-img`、`.plot.empty`、`.plot.pop`、`.plot-sparkle`、粒子、农夫规则全部保留不动。

- [ ] **Step 3: 验证**

CSS 暂不影响功能；下一步 tab3.js 重写后视觉验证。

- [ ] **Step 4: 提交**

```bash
git add yuji-app/css/tab3-garden.css
git commit -m "style(farm): plot slots use percentage positioning over full-screen land"
```

---

## Task 6: tab3.js 完全重写

**Files:**
- Rewrite: `yuji-app/js/tab3.js`

- [ ] **Step 1: 整体重写为以下内容**

```js
/* ============================================================
   Tab3 生长·技能农场
   - 土地底图：State.tabBackgrounds.tab3（<img class="tab3-bg">）
   - 格子槽位：State.farmPlotLayout（百分比绝对定位叠加在土地上）
   - 作物阶段图：State.farmCropCatalog[key].stages[stage].image
   - 成长：progress = Σsessions.minutes + Σ(completed goals).points
           stage = min(floor(progress/minutesPerStage), stages.length-1)
   - 交互：空格子→farmPlant；已占→farmLog
   ============================================================ */

const Tab3 = (() => {
  const ASSET_FALLBACK = 'assets/farm/crop-s1.png';
  let lastStages = {};

  function init() {
    renderPlots();
    bindEvents();
    Utils.spawnParticles(document.getElementById('gardenButterflies'), {
      count: 5, cls: 'butterfly', emoji: true, chars: ['✨', '🐝', '🍃'], size: 16, rise: 130,
    });
    Utils.spawnParticles(document.getElementById('gardenPollen'), {
      count: 10, cls: 'pollen', color: 'rgba(255, 230, 160, 0.55)', size: 5, rise: 90,
    });
  }

  function bindEvents() {
    const container = document.getElementById('gardenPlots');
    container?.addEventListener('click', e => {
      const plot = e.target.closest('.plot');
      if (!plot) return;
      const plotId = plot.dataset.plotid;
      const occupied = State.getFarmPlotByPlotId(plotId);
      if (occupied) Popups.open('farmLog', { plotId });
      else Popups.open('farmPlant', { plotId });
    });
    document.getElementById('gardenJournalBtn')?.addEventListener('click', () => {
      Popups.open('cottage');  // 复用为农场日志（见 Task7 重写 cottage）
    });
  }

  function cropStageImage(cropKey, stage) {
    const crop = State.getFarmCrop(cropKey);
    if (!crop || !crop.stages.length) return ASSET_FALLBACK;
    return crop.stages[Math.min(stage, crop.stages.length - 1)].image || ASSET_FALLBACK;
  }

  function renderPlots() {
    const container = document.getElementById('gardenPlots');
    if (!container) return;
    const layouts = State.farmPlotLayout;
    container.innerHTML = '';
    const nextStages = {};
    let plantedCount = 0;

    layouts.forEach(layout => {
      const p = State.getFarmPlotByPlotId(layout.id);
      const crop = p ? State.getFarmCrop(p.cropKey) : null;
      const div = document.createElement('div');
      div.dataset.plotid = layout.id;
      div.style.left = layout.x + '%';
      div.style.top = layout.y + '%';
      div.style.width = (62 * (layout.scale || 1)) + 'px';
      div.style.height = (46 * (layout.scale || 1)) + 'px';
      div.style.zIndex = 10 + (layout.z || 3);

      if (p && crop) {
        plantedCount++;
        const stage = State.farmStageOf(p);
        const mature = p.matured || stage >= crop.stages.length - 1;
        div.className = 'plot ' + (mature ? 'mature' : 'planted');
        div.title = `${crop.emoji} ${p.skillName} · ${crop.stages[Math.min(stage, crop.stages.length-1)].name || ''}`;
        div.innerHTML = `
          <img class="plot-img" src="${cropStageImage(p.cropKey, stage)}" alt="${p.skillName}" />
          ${mature ? '<span class="plot-sparkle">✨</span>' : ''}
        `;
        nextStages[layout.id] = stage;
        const prev = lastStages[layout.id];
        if (prev === undefined || prev < stage) div.classList.add('pop');
      } else {
        div.className = 'plot empty';
        div.title = '空格子 · 点击种下一个想学的技能';
        div.innerHTML = `<img class="plot-img" src="${ASSET_FALLBACK}" alt="" />`;
      }
      container.appendChild(div);
    });

    lastStages = nextStages;
    const hint = document.getElementById('gardenHint');
    if (hint) hint.classList.toggle('hidden', plantedCount > 0);
  }

  // 供 popups 调用：种下/记录/收获后刷新
  function refresh() { renderPlots(); }

  return { init, renderPlots, refresh };
})();
```

- [ ] **Step 2: 验证**

打开 tab3，应看到土地底图（land.png）+ 9 个空格子（菱形排布，呼吸动画）。点空格子控制台应 `Unknown popup: farmPlant`（Task7 才加）；点已占格子 `farmLog` 同理。无 JS 报错。

- [ ] **Step 3: 提交**

```bash
git add yuji-app/js/tab3.js
git commit -m "feat(farm): rewrite tab3.js as skill farm (land + % plot slots + stage crops)"
```

---

## Task 7: popups.js — farmPlant / farmLog / 重写 cottage，删旧 seedSelect/harvest

**Files:**
- Modify: `yuji-app/js/popups.js`（builders: L339-L455；inits: L1087-L1145；以及 TITLES 表 L711）

- [ ] **Step 1: 删旧 builders**

删除 [popups.js](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/popups.js#L339-L455) 的 `seedSelect`、`harvest`、`cottage` 三个 builder（L339-L455 整段）。

- [ ] **Step 2: 加新 builders**

在同一位置插入：

```js
    // ============ 农场：种下技能 ============
    farmPlant(data) {
      const plotId = data.plotId;
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
          <button class="popup-btn primary" data-act="plant" data-plotid="${plotId}">种下</button>
        </div>
      `;
    },

    // ============ 农场：记录学习 / 管理目标 / 收获 ============
    farmLog(data) {
      const p = State.getFarmPlotByPlotId(data.plotId);
      if (!p) return `<div class="popup-body">这块地还没种东西…</div>`;
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
            <img src="${crop.stages[Math.min(stage,crop.stages.length-1)].image}" alt="${stageName}" style="width:64px;height:48px;object-fit:contain;image-rendering:pixelated;" />
          </div>
          <div style="text-align:center;font-size:13px;color:#5a3a20;margin-top:4px;">${stageName}阶（${stage+1}/${crop.stages.length}）· 累计 ${p.progress} 分钟</div>
          ${next ? `<div class="hint" style="text-align:center;">距下一阶还差 ${remain}（分钟/积分）</div>` : `<div class="hint" style="text-align:center;color:#c7742a;">✨ 已成熟，可收获纪念</div>`}

          <div class="chapter-title" style="margin-top:14px;">⏱️ 记录今天的学习</div>
          <div class="popup-row" style="margin-top:6px;">
            <input class="popup-input" id="fl-min" type="number" placeholder="分钟" min="0" style="flex:1;" />
            <input class="popup-input" id="fl-note" type="text" placeholder="学了什么" maxlength="60" style="flex:2;" />
          </div>
          <button class="popup-btn primary" data-act="log" data-plotid="${p.plotId}" style="width:100%;margin-top:6px;">记一笔</button>

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
            <button class="popup-btn" data-act="addgoal" data-plotid="${p.plotId}">＋</button>
          </div>

          <div style="margin-top:14px;">
            <button class="popup-btn ghost" data-act="remove" data-plotid="${p.plotId}" style="width:100%;">移除这块作物（不收获）</button>
            ${p.matured || stage >= crop.stages.length-1 ? `<button class="popup-btn primary" data-act="harvest" data-plotid="${p.plotId}" style="width:100%;margin-top:6px;">🎁 收获纪念</button>` : ''}
          </div>
        </div>
      `;
    },

    // ============ 农场日志（成长目标 + 仓库） ============
    cottage() {
      const s = State.state;
      const active = s.farmPlots;
      return `
        <div class="popup-head">
          <div class="popup-title">📔 农场日志</div>
          <button class="popup-close" aria-label="关闭">✕</button>
        </div>
        <div class="popup-body">
          <div class="chapter-title">🌱 我的技能（${active.length}/${State.farmPlotLayout.length}）</div>
          ${active.length === 0 ? `<div class="hint" style="padding:8px 0;">去田地点空格子种一个想学的技能吧。</div>` : `
            <div class="seed-list" style="margin-top:6px;">
              ${active.map(p => {
                const crop = State.getFarmCrop(p.cropKey); if (!crop) return '';
                const stage = State.farmStageOf(p);
                const mature = p.matured || stage >= crop.stages.length - 1;
                const name = crop.stages[Math.min(stage,crop.stages.length-1)].name || '';
                return `
                  <div class="seed-item" data-act="openPlot" data-plotid="${p.plotId}" style="cursor:pointer;">
                    <div class="seed-emoji">${crop.emoji}</div>
                    <div class="seed-info">
                      <div class="seed-name">${p.skillName}</div>
                      <div class="seed-desc">${mature ? '✨ 已成熟' : `${name}阶 · 累计 ${p.progress}/${crop.minutesPerStage*(stage+1)}`}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
          <div class="chapter-title" style="margin-top:14px;">📦 收获纪念（${s.farmWarehouse.length}）</div>
          ${s.farmWarehouse.length === 0 ? `<div class="hint" style="padding:8px 0;">空空的。</div>` : `
            <div class="seed-list" style="margin-top:6px;">
              ${s.farmWarehouse.map(w => `
                <div class="seed-item" style="cursor:default;">
                  <div class="seed-emoji">${w.emoji}</div>
                  <div class="seed-info">
                    <div class="seed-name">${w.name}</div>
                    <div class="seed-desc">${w.source} · 累计 ${w.progress} 分钟</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `;
    },
```

- [ ] **Step 3: 删旧 inits，加新 inits**

删除 [inits](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/popups.js#L1087-L1145) 中的 `seedSelect`、`harvest`、`cottage` 三个 init（L1087-L1145），替换为：

```js
    farmPlant(data) {
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
        if (State.plantSkill(data.plotId, name, chosen, goals)) {
          Tab3.refresh(); close();
        } else toast('种下失败（格子已占？）');
      });
    },
    farmLog(data) {
      bindAct('log', () => {
        const min = +$('#fl-min').value || 0;
        const note = $('#fl-note').value.trim();
        if (min <= 0 && !note) return toast('填点分钟或笔记吧');
        State.logSession(data.plotId, min, note);
        Tab3.refresh(); open('farmLog', { plotId: data.plotId });  // 刷新弹窗
      });
      $$('#farmLog-roots, [data-goal]').forEach(() => {});
      root().querySelectorAll('[data-goal]').forEach(el => el.addEventListener('click', () => {
        State.toggleGoal(data.plotId, el.dataset.goal);
        Tab3.refresh(); open('farmLog', { plotId: data.plotId });
      }));
      bindAct('addgoal', () => {
        const label = $('#fl-goal-label').value.trim();
        const pts = +$('#fl-goal-pts').value || 0;
        if (!label) return toast('填目标名');
        State.addGoal(data.plotId, label, pts);
        open('farmLog', { plotId: data.plotId });
      });
      bindAct('remove', () => {
        if (!confirm('移除这块作物？已记录的进度会丢失。')) return;
        State.removeSkill(data.plotId); Tab3.refresh(); close();
      });
      bindAct('harvest', () => {
        State.harvestSkill(data.plotId); Tab3.refresh(); close();
      });
    },
    cottage() {
      root().querySelectorAll('[data-act="openPlot"]').forEach(el => el.addEventListener('click', () => {
        close(); open('farmLog', { plotId: el.dataset.plotid });
      }));
    },
```

注：`bindAct`/`toast`/`open`/`close`/`root`/`$`/`$$` 为 popups.js 既有工具（见 [L1392 bindAct](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/popups.js#L1392)、`toast` 在 utils）。`farmLog` 的 `log` 用了 `open('farmLog',...)` 重开自身以刷新——与既有 `shelf` 重开模式一致。

- [ ] **Step 4: 删旧 inits 中的 farmLog 多余行**

把上面 init 里的占位 `$$('#farmLog-roots, [data-goal]').forEach(() => {});` 删除（仅为避免误改，无作用）。保留 `root().querySelectorAll('[data-goal]')` 那行。

- [ ] **Step 5: TITLES 表更新**

[TITLES 对象](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/js/popups.js#L711)（L711 附近，含 `harvest: '田地收获'` 等）删除 `seedSelect`/`harvest` 项；加 `farmPlant: '种下技能', farmLog: '技能记录', cottage: '农场日志'`。

- [ ] **Step 6: 验证**

打开 tab3：点空格子→farmPlant 弹窗，填名选小麦+目标→种下→格子出现作物 s1 图。再点该格子→farmLog 弹窗，记 600 分钟→应升到 stage1（s2 图）。控制台 `State.farmStageOf(State.getFarmPlotByPlotId('fp-0'))` 应 ≥1。

- [ ] **Step 7: 提交**

```bash
git add yuji-app/js/popups.js
git commit -m "feat(farm): farmPlant/farmLog/cottage popups; drop old seedSelect/harvest"
```

---

## Task 8: index.html — tab3 DOM + 版本号

**Files:**
- Modify: `yuji-app/index.html`（L20 CSS 版本、L169-L199 tab3 区、L275 tab3.js 版本）

- [ ] **Step 1: tab3 DOM 注释更新**

把 [index.html L169-L199](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/index.html#L169-L199) 注释 `<!-- ============ Tab3 生长·像素田地 ============ -->` 改为 `<!-- ============ Tab3 生长·技能农场 ============ -->`；中层注释 `<!-- 中层：3 行 × 4 列田垄网格 -->` 改为 `<!-- 中层：格子槽位（admin 后台配置位置，百分比绝对定位） -->`。DOM 结构（gardenPlots/gardenHint/character/粒子）保持不变。

- [ ] **Step 2: 版本号 +1 强刷缓存**

- [L20](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/index.html#L20) `tab3-garden.css?v=38` → `?v=39`
- [L275](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/index.html#L275) `js/tab3.js?v=37` → `?v=38`

- [ ] **Step 3: 验证**

Ctrl+Shift+R 强刷；tab3 显示土地 + 9 空格子；版本号在 Network 面板对应。

- [ ] **Step 4: 提交**

```bash
git add yuji-app/index.html
git commit -m "chore(farm): bump tab3 css/js versions + DOM comments"
```

---

## Task 9: admin/index.html — 技能农场 section + 模态框

**Files:**
- Modify: `yuji-app/admin/index.html`（侧栏 L34-L46 + section 在 L128 后 + 模态框在 L336 前）

- [ ] **Step 1: 侧栏加按钮**

在 [侧栏 nav](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/admin/index.html#L34-L46) 的 `<button data-sec="seeds">...</button>` 之后插入：
```html
      <button data-sec="farm">🌾 技能农场</button>
```

- [ ] **Step 2: 加 section（两子面板）**

在 [seeds section](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/admin/index.html#L124-L128) 之后插入：
```html
    <!-- 技能农场 -->
    <section data-panel="farm" class="panel hidden">
      <div class="panel-head"><h2>🌾 技能农场</h2></div>
      <p class="hint">配置 <b>土地格子位置</b>（拖拽）与 <b>作物品种库</b>（含各生长阶段图）。前端用户创建技能时从品种库选作物、从空格子选位置种下；记录学习时间/完成小目标推进生长。土地底图在「Tab 页面背景」tab3 项上传。保存后预览账号 2.5s 自动同步。</p>

      <h3 style="margin-top:18px;">① 作物品种库</h3>
      <div class="panel-head" style="margin-top:6px;">
        <span class="hint" style="margin:0;">每行：key/名/各阶段图/每阶分钟</span>
        <button id="farm-crop-add" class="primary">+ 新增品种</button>
      </div>
      <div id="farm-crop-table" class="table-wrap"></div>

      <h3 style="margin-top:22px;">② 土地格子布置（拖拽）</h3>
      <div class="panel-head" style="margin-top:6px;">
        <span class="hint" style="margin:0;">把空格子拖到土地图上，用户在此处种技能。</span>
        <div class="panel-actions">
          <button id="farm-plot-add" class="primary">+ 添加格子</button>
          <button id="farm-plot-save" class="primary">保存格子布局</button>
          <button id="farm-plot-clear">清空</button>
        </div>
      </div>
      <div class="layout-wrap">
        <div id="farm-canvas" class="room-canvas">
          <img class="room-bg" id="farm-land-bg" src="/assets/farm/land.png" alt="土地底图" draggable="false" />
          <div id="farm-plots-stage" class="room-furniture"></div>
        </div>
        <div class="palette">
          <div class="palette-title">格子属性</div>
          <div id="farm-plot-props" class="piece-props hidden">
            <label>层级 z <input id="fpp-z" type="range" min="1" max="6" step="1" /><span id="fpp-z-v"></span></label>
            <label>缩放 <input id="fpp-scale" type="range" min="0.5" max="3" step="0.1" /><span id="fpp-scale-v"></span></label>
            <button id="fpp-del" class="danger">删除该格子</button>
          </div>
          <div class="hint" style="margin-top:8px;">土地底图请到「Tab 页面背景 → tab3」上传。</div>
        </div>
      </div>
    </section>
```

- [ ] **Step 3: 加品种模态框（在 #furn-add-modal 之前或文件末 hidden input 之前）**

在 [L336 tabbg-upload-input](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/admin/index.html#L336) 之前插入品种新增/编辑模态框：
```html
<!-- ===== 农场品种（含阶段图上传）模态框 ===== -->
<div id="farm-crop-modal" class="modal hidden">
  <div class="modal-card">
    <div class="modal-head">
      <h3 id="fc-modal-title">新增作物品种</h3>
      <button type="button" id="fc-close" class="mini" title="关闭">✕</button>
    </div>
    <div class="modal-body">
      <div class="row two-col">
        <div><label>Key *</label><input id="fc-key" type="text" placeholder="英文唯一，如 wheat" /></div>
        <div><label>名称 *</label><input id="fc-name" type="text" placeholder="如 小麦" /></div>
      </div>
      <div class="row two-col">
        <div><label>Emoji</label><input id="fc-emoji" type="text" placeholder="🌾" style="width:60px;" /></div>
        <div><label>每阶段分钟</label><input id="fc-mps" type="number" min="1" value="600" /></div>
      </div>
      <div class="row">
        <label>生长阶段（每阶段上传一张图 + 名称）</label>
        <div id="fc-stages"></div>
        <button type="button" id="fc-add-stage" class="ghost" style="margin-top:6px;">+ 增加阶段</button>
      </div>
    </div>
    <div class="modal-actions">
      <button type="button" id="fc-cancel">取消</button>
      <button type="button" id="fc-submit" class="primary">保存品种</button>
    </div>
  </div>
</div>
<input id="fc-upload-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden />
```

- [ ] **Step 4: 提交**

```bash
git add yuji-app/admin/index.html
git commit -m "feat(admin): add 技能农场 section (crop table + plot drag canvas) + crop modal"
```

---

## Task 10: admin/admin.js — 资源映射 + 品种库 + 拖拽画布

**Files:**
- Modify: `yuji-app/admin/admin.js`（资源映射 L181-L236、导航注册 L437、L605 后新增农场逻辑）

- [ ] **Step 1: 加 mapper 函数**

在 [mapSeed 附近](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/admin/admin.js#L59-L114) 的 mapper 区追加：
```js
function mapFarmCrop(r) {
  return {
    key: r.key, name: r.name, emoji: r.emoji,
    stages: JSON.parse(r.stages || '[]'),
    minutesPerStage: r.minutes_per_stage, sortOrder: r.sort_order,
  };
}
function mapFarmPlot(r) {
  return { id: r.id, x: r.x, y: r.y, z: r.z, scale: r.scale, sortOrder: r.sort_order };
}
```

- [ ] **Step 2: resources 映射表加两项**

在 [resources 对象](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/admin/admin.js#L206-L213) 的 `'seeds'` 项之后追加：
```js
    'farm-crops': {
      table: 'farm_crop_catalog', idField: 'key', sortField: 'sort_order', mapper: mapFarmCrop,
      mapBack: r => ({
        key: r.key, name: r.name, emoji: r.emoji,
        stages: JSON.stringify(r.stages || '[]'),
        minutes_per_stage: r.minutesPerStage || 600, sort_order: r.sortOrder || 0,
        updated_at: new Date().toISOString(),
      })
    },
    'farm-plots': {
      table: 'farm_plot_layout', idField: 'id', sortField: 'sort_order', mapper: mapFarmPlot,
      mapBack: r => ({ id: r.id, x: r.x, y: r.y, z: r.z, scale: r.scale, sort_order: r.sortOrder || 0 })
    },
```

- [ ] **Step 3: PUT 全量替换支持 farm-plots**

在 [api() PUT 分支](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/admin/admin.js#L277-L296) 的 `if (resource === 'room-layout')` 块后追加同款全量替换：
```js
    if (resource === 'farm-plots') {
      const items = body.items || [];
      await client.from(cfg.table).delete().neq('id', '');
      if (items.length) {
        const rows = items.map(cfg.mapBack);
        const { error } = await client.from(cfg.table).insert(rows);
        if (error) throw new Error(error.message);
      }
      return { ok: true };
    }
```

- [ ] **Step 4: 导航注册农场**

在 [loadXxx 注册表](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/admin/admin.js#L437)（`dashboard: loadDashboard, layout: loadLayout, ...`）追加 `farm: loadFarm,`。

- [ ] **Step 5: 加农场加载/品种表格/拖拽逻辑**

在文件末尾（或 `loadLayout` 实现附近）追加：

```js
/* ===================== 技能农场 ===================== */
let farmPlots = [];
let farmSelectedId = null;

async function loadFarm() {
  const [crops, plots, tabbg] = await Promise.all([
    api('GET', '/api/admin/farm-crops'),
    api('GET', '/api/admin/farm-plots'),
    api('GET', '/api/admin/tab-backgrounds'),
  ]);
  const t3 = tabbg.find(t => t.tabKey === 'tab3');
  $('#farm-land-bg').src = t3 && t3.bgPath ? iconUrl(t3.bgPath) : '/assets/farm/land.png';
  farmPlots = plots.map(p => ({ ...p }));
  farmSelectedId = null;
  renderFarmCrops(crops);
  renderFarmPlots();
  $('#farm-plot-props').classList.add('hidden');
}

function renderFarmCrops(crops) {
  $('#farm-crop-table').innerHTML = `<table><thead><tr>
    <th>key</th><th>emoji</th><th>名称</th><th>阶段数</th><th>每阶分钟</th><th></th></tr></thead><tbody>
    ${crops.map(c => `<tr data-id="${esc(c.key)}">
      <td>${esc(c.key)}</td>
      <td>${esc(c.emoji||'')}</td>
      <td>${esc(c.name)}</td>
      <td>${c.stages.length}</td>
      <td>${c.minutesPerStage}</td>
      <td class="row-actions">
        <button class="mini" data-act="edit" data-key="${esc(c.key)}">编辑</button>
        <button class="mini del" data-act="del" data-key="${esc(c.key)}">删</button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;
  bindRowOps('#farm-crop-table', '/api/admin/farm-crops/', 'key',
    ['emoji','name','stages','minutesPerStage','sortOrder'],
    { stages: v => JSON.parse(v||'[]'), minutesPerStage: v=>+v||600, sortOrder: v=>+v||0 });
  $$('#farm-crop-table [data-act="edit"]').forEach(b => b.addEventListener('click', () => openFarmCropModal(b.dataset.key)));
}

// ---- 格子拖拽画布（镜像 room-layout） ----
function renderFarmPlots() {
  const stage = $('#farm-plots-stage');
  $$('.farm-plot-item', stage).forEach(e => e.remove());
  [...farmPlots].sort((a,b)=>a.z-b.z).forEach(p => {
    const el = document.createElement('div');
    el.className = 'room-item farm-plot-item' + (p.id===farmSelectedId?' selected':'');
    el.dataset.id = p.id;
    el.style.left = p.x + '%';
    el.style.bottom = p.y + '%';
    el.style.zIndex = 10 + p.z;
    el.style.setProperty('--ri-w','48px');
    el.style.setProperty('--ri-h','32px');
    el.style.setProperty('--ri-scale', p.scale || 1);
    el.innerHTML = `<span class="ri-visual"><span class="ri-sprite" style="background:rgba(120,80,40,.35);border:2px dashed #6b4a22;border-radius:6px;display:block;width:100%;height:100%;"></span><span class="ri-badge del" data-badge="del" title="删除">✕</span></span>`;
    stage.appendChild(el);
    bindFarmPlotEvents(el, p);
  });
}
function bindFarmPlotEvents(el, p) {
  el.querySelector('.ri-badge.del').addEventListener('click', e => {
    e.stopPropagation();
    farmPlots = farmPlots.filter(x => x.id !== p.id);
    if (farmSelectedId === p.id) { farmSelectedId = null; $('#farm-plot-props').classList.add('hidden'); }
    renderFarmPlots();
  });
  el.addEventListener('pointerdown', e => {
    if (e.target.dataset.badge) return;
    e.preventDefault(); e.stopPropagation();
    farmSelectedId = p.id; setSelectedFarmUI();
    const stage = $('#farm-plots-stage');
    const rect = stage.getBoundingClientRect();
    const anchorX = rect.left + (p.x/100)*rect.width;
    const anchorY = rect.bottom - (p.y/100)*rect.height;
    const offX = e.clientX - anchorX, offY = e.clientY - anchorY;
    el.classList.add('dragging');
    const move = ev => {
      const nx = (ev.clientX-rect.left-offX)/rect.width*100;
      const ny = (rect.bottom-ev.clientY+offY)/rect.height*100;
      p.x = Math.max(2, Math.min(98, nx));
      p.y = Math.max(2, Math.min(98, ny));
      el.style.left = p.x+'%'; el.style.bottom = p.y+'%';
    };
    const up = () => { el.classList.remove('dragging'); window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
}
function setSelectedFarmUI() {
  $$('#farm-canvas .farm-plot-item').forEach(n => n.classList.toggle('selected', n.dataset.id===farmSelectedId));
  if (farmSelectedId) {
    const p = farmPlots.find(x=>x.id===farmSelectedId); if(!p) return;
    const box = $('#farm-plot-props'); box.classList.remove('hidden');
    $('#fpp-z').value = p.z; $('#fpp-z-v').textContent = p.z;
    $('#fpp-scale').value = p.scale; $('#fpp-scale-v').textContent = (+p.scale).toFixed(1)+'×';
    $('#fpp-z').oninput = () => { p.z = +$('#fpp-z').value; $('#fpp-z-v').textContent = p.z; const e = farmEl(p.id); if(e) e.style.zIndex = 10+p.z; };
    $('#fpp-scale').oninput = () => { p.scale = +$('#fpp-scale').value; $('#fpp-scale-v').textContent = p.scale.toFixed(1)+'×'; const e = farmEl(p.id); if(e) e.style.setProperty('--ri-scale', p.scale); };
    $('#fpp-del').onclick = () => { farmPlots = farmPlots.filter(x=>x.id!==p.id); farmSelectedId=null; renderFarmPlots(); box.classList.add('hidden'); };
  } else $('#farm-plot-props').classList.add('hidden');
}
function farmEl(id){ return document.querySelector('#farm-canvas .farm-plot-item[data-id="'+id+'"]'); }

$('#farm-plot-add').addEventListener('click', () => {
  const id = 'fp-' + Date.now().toString(36);
  farmPlots.push({ id, x:50, y:45, z:3, scale:1, sortOrder: farmPlots.length });
  farmSelectedId = id; renderFarmPlots(); setSelectedFarmUI();
});
$('#farm-plot-save').addEventListener('click', async () => {
  try { await api('PUT','/api/admin/farm-plots',{ items: farmPlots }); toast('格子布局已保存（预览账号 2.5s 同步）'); }
  catch(err){ toast(err.message); }
});
$('#farm-plot-clear').addEventListener('click', () => { if(confirm('清空所有格子？')){ farmPlots=[]; farmSelectedId=null; renderFarmPlots(); $('#farm-plot-props').classList.add('hidden'); } });
$('#farm-canvas').addEventListener('pointerdown', e => { if (e.target === $('#farm-land-bg')) { farmSelectedId=null; setSelectedFarmUI(); } });

// ---- 品种模态框（含阶段图上传） ----
let _fcEditingKey = null;
let _fcStages = [];   // [{image,name}]
$('#farm-crop-add').addEventListener('click', () => openFarmCropModal(null));
async function openFarmCropModal(key) {
  _fcEditingKey = key || null;
  $('#fc-modal-title').textContent = key ? '编辑品种' : '新增品种';
  if (key) {
    const crops = await api('GET','/api/admin/farm-crops');
    const c = crops.find(x=>x.key===key) || {};
    $('#fc-key').value = c.key||''; $('#fc-key').disabled = true;
    $('#fc-name').value = c.name||''; $('#fc-emoji').value = c.emoji||'';
    $('#fc-mps').value = c.minutesPerStage||600;
    _fcStages = (c.stages||[]).map(s=>({image:s.image||'',name:s.name||''}));
  } else {
    $('#fc-key').value=''; $('#fc-key').disabled=false;
    $('#fc-name').value=''; $('#fc-emoji').value=''; $('#fc-mps').value=600;
    _fcStages = [{image:'',name:'破土'},{image:'',name:'成熟'}];
  }
  renderFcStages();
  $('#farm-crop-modal').classList.remove('hidden');
}
function renderFcStages() {
  $('#fc-stages').innerHTML = _fcStages.map((s,i)=>`
    <div class="fc-stage" data-i="${i}" style="display:flex;gap:6px;align-items:center;margin-top:4px;">
      <input class="fc-stage-name" type="text" value="${esc(s.name)}" placeholder="阶段名" style="width:90px;" />
      <button type="button" class="mini" data-up="${i}">选图</button>
      <span class="fc-stage-img" style="width:40px;height:28px;background:url('${iconUrl(s.image)}') center/contain no-repeat;border:1px solid #ccc;display:inline-block;"></span>
      <button type="button" class="mini del" data-rm="${i}">✕</button>
    </div>`).join('');
  $$('#fc-stages .fc-stage-name').forEach(i => i.oninput = e => _fcStages[+i.dataset.i].name = e.target.value);
  $$('#fc-stages [data-up]').forEach(b => b.onclick = () => pickFcStageImage(+b.dataset.up));
  $$('#fc-stages [data-rm]').forEach(b => b.onclick = () => { _fcStages.splice(+b.dataset.rm,1); renderFcStages(); });
}
$('#fc-add-stage').addEventListener('click', () => { _fcStages.push({image:'',name:''}); renderFcStages(); });
function pickFcStageImage(i) {
  const inp = $('#fc-upload-input');
  inp.onchange = async () => {
    const file = inp.files[0]; if(!file) return;
    try {
      const fd = new FormData(); fd.append('file', file);
      fd.append('forceName', 'farm-' + Date.now().toString(36) + '-' + i);
      const r = await api('POST','/api/admin/farm-crops/with-image', fd);
      _fcStages[i].image = r.path; renderFcStages();
    } catch(err){ toast(err.message); }
    inp.value='';
  };
  inp.click();
}
$('#fc-close').addEventListener('click', () => $('#farm-crop-modal').classList.add('hidden'));
$('#fc-cancel').addEventListener('click', () => $('#farm-crop-modal').classList.add('hidden'));
$('#fc-submit').addEventListener('click', async () => {
  const key = $('#fc-key').value.trim(); const name = $('#fc-name').value.trim();
  if (!key || !name) return toast('key 与名称必填');
  const body = {
    key, name, emoji: $('#fc-emoji').value, minutesPerStage: +$('#fc-mps').value||600,
    stages: _fcStages, sortOrder: 0,
  };
  try {
    if (_fcEditingKey) await api('PUT', `/api/admin/farm-crops/${encodeURIComponent(_fcEditingKey)}`, body);
    else await api('POST','/api/admin/farm-crops', body);
    $('#farm-crop-modal').classList.add('hidden');
    const crops = await api('GET','/api/admin/farm-crops'); renderFarmCrops(crops);
    toast('已保存');
  } catch(err){ toast(err.message); }
});
```

- [ ] **Step 6: Storage 上传加 farm-crops/with-image 分支**

在 [handleUpload](file:///c:/Users/29948/Desktop/workbuddy/yuji-app/admin/admin.js#L319-L334)（约 L326 `/furniture` 分支后）追加 farm-crops 分支：
```js
  if (path.includes('/farm-crops/with-image')) {
    const forceName = fd.get('forceName') || ('farm-' + file.name);
    const filePath = (forceName + '.png').replace(/\//g,'-');
    const { data, error } = await client.storage.from('farm-images').upload(filePath, file, { upsert: true });
    if (error) throw new Error(error.message);
    const { data: urlData } = client.storage.from('farm-images').getPublicUrl(data.path);
    // 返回相对路径入库（去掉公共 URL 前缀，保留 storage path 对应的 assets-friendly 路径）
    // 约定：farm-images 桶公共 URL 形如 https://<proj>.supabase.co/storage/v1/object/public/farm-images/<file>
    // 前端用绝对 URL 即可（iconUrl 保留 http 开头）
    return { path: urlData.publicUrl };
  }
```

- [ ] **Step 7: 验证**

admin 登录→侧栏「技能农场」→品种库表格应显示 3 条；格子画布显示 9 个虚框格子叠在 land.png 上；拖动格子可移动；「保存格子布局」toast 成功；预览账号前端 2.5s 后格子位置同步。「+ 新增品种」→填名+2 阶段+上传图→保存→表格新增一行。

- [ ] **Step 8: 提交**

```bash
git add yuji-app/admin/admin.js
git commit -m "feat(admin): farm crop table + plot drag canvas + crop stage image upload"
```

---

## Task 11: admin/admin.css — 农场样式补丁

**Files:**
- Modify: `yuji-app/admin/admin.css`

- [ ] **Step 1: 补 fc-stage 与 farm-plot-item 样式**

在 admin.css 末尾追加：
```css
/* 技能农场 */
.fc-stage { font-size: 12px; }
.fc-stage-img { background-color: #f6f1e6; }
.farm-plot-item .ri-sprite { border-radius: 6px; }
#farm-canvas { background: #d9c9a8; }
```

注：`.room-item`/`.ri-visual`/`.ri-badge`/`.palette`/`.piece-props`/`.modal`/`.table-wrap` 等样式已存在（复用）。

- [ ] **Step 2: 提交**

```bash
git add yuji-app/admin/admin.css
git commit -m "style(admin): farm section styles"
```

---

## Task 12: 端到端集成验证

**Files:** 无（仅验证）

- [ ] **Step 1: 确认迁移已执行**

Supabase SQL Editor 跑 Task1 Step3 的验证查询，crops=3/plots=9/tab3bg=land.png。

- [ ] **Step 2: 前端预览账号验证配置同步**

用预览账号登录前端→tab3→控制台：
```js
State.farmCropCatalog.length  // 3
State.farmPlotLayout.length   // 9
```

- [ ] **Step 3: 种技能→记时间→升阶→收获 全流程**

- tab3 点空格子→farmPlant→名「学吉他」选小麦+目标「能弹一首歌 300」→种下
- 该格子点开→farmLog→记 600 分钟→应升 stage1（s2 图）
- 再记 600→stage2（s3）；记 600→stage3 成熟（crop-h1 图 + ✨）
- 成熟后「收获纪念」→格子清空；农场日志里仓库 +1

- [ ] **Step 4: 后台改格子位置→前端同步**

admin「技能农场」拖一个格子到新位置→保存→预览账号前端 ≤2.5s 后该格子位置移动。

- [ ] **Step 5: 后台改品种→前端可选**

admin 新增品种「向日葵🌻 2 阶」→保存→前端 farmPlant 弹窗品种列表多一项。

- [ ] **Step 6: 缓存与控制台**

Ctrl+Shift+R 强刷；F12 控制台无 `feedGarden is not a function`/`plantSeed` 等旧 API 报错；tab1 自我照顾、tab2 情绪记录正常无报错。

- [ ] **Step 7: 最终提交（如有小修）**

```bash
git add -A
git commit -m "chore(farm): e2e verification tweaks"
```

---

## Self-Review 结果

- **Spec 覆盖**：spec 各节均有任务对应——数据模型(T1,3)、RLS(T1)、Storage 桶(T1)、后台两子面板(T9,10,11)、配置流(T2,3)、tab3 渲染(T5,6,8)、popups 交互(T7)、旧 feedGarden 清理(T4)、迁移(T1)、文件清单全部覆盖。
- **占位符扫描**：无 TBD/TODO；所有代码块均给出实际内容。
- **类型/方法一致性**：`plantSkill/logSession/toggleGoal/addGoal/harvestSkill/removeSkill/getFarmCrop/getFarmPlotByPlotId/farmStageOf` 在 state.js(T3) 定义、popups.js(T7) 与 tab3.js(T6) 调用名一致；`farmCropCatalog`/`farmPlotLayout` getter 一致；admin resource key `farm-crops`/`farm-plots` 在映射(T10 Step2)、PUT 替换(T10 Step3)、HTML(T9)、调用(T10 Step5) 一致；`stages` JSON 字段在 mapper/api/migration 一致。
- **风险点**：`farm-crops/with-image` 上传返回的是 supabase 公共 URL（绝对 http），`cropStageImage` 直接用其作 `<img src>` 可行（与 furniture icon 同款处理）。若希望相对路径入库，可在 Step6 改为存 `data.path`，但前端 `<img>` 需补 storage 前缀——本计划采用绝对 URL 简化。
