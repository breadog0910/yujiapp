# Tab3 技能种植农场 · 设计文档

- 日期：2026-08-28
- 目标：移除 Tab3 现有逻辑（固定 3×3 田垄 + 事件驱动 feed 的种子系统），重做为「技能种植农场」——用户自定义想学的技能、设阶段性小目标、记录投入时间，时间/目标推进农作物的生长；土地照片、作物品种、各生长阶段图、格子位置全部由管理后台可视化配置并同步到前端。
- 架构约束：严格遵循现有 Supabase + Vercel 部署架构（前端直连 PostgreSQL via supabase-js + RLS；管理员配置走 admin 后台直接写库；不新增常驻后端进程；不引入新 Edge Function）。详见 `project_memory.md`。

## 1. 关键决策（来自澄清对话）

| 决策点 | 选定 | 说明 |
|---|---|---|
| 成长驱动 | 投入时间 + 完成阶段性小目标 | 二者都累加进单一 `progress` 计数；`progress / minutesPerStage` 决定阶段 |
| 后台/用户分工 | 用户自选作物品种 + 自选格子 | 后台只定义品种库与格子位置；用户创建技能时从品种库选作物、从空格子选位置种下 |
| 实现路径 | 方案 1：镜像现有房间布局拖拽 + 独立作物品种库 | 复用已验证的拖拽代码与家具库表格 CRUD；品种与位置解耦 |
| 土地底图 | 复用 `tab_backgrounds['tab3']` | 现有「Tab 页面背景」后台已支持上传，无需新表 |
| 阶段阈值 | 单一 `minutes_per_stage`（每作物一个值） | YAGNI；如需非线形阈值后续可扩为数组 |
| 收获纪念 | 保留 | 成熟后可选「收获纪念」清空格子重种，入 `farmWarehouse` 纪念列表 |

## 2. 数据模型

### 2.1 新增后端表（公开读 / 仅 admin 写）

#### `farm_crop_catalog`（作物品种库）
| 字段 | 类型 | 说明 |
|---|---|---|
| `key` | TEXT PK | 英文唯一标识，如 `wheat` |
| `name` | TEXT NOT NULL | 中文名，如「小麦」 |
| `emoji` | TEXT | 如 🌾 |
| `stages` | TEXT NOT NULL | JSON 数组 `[{ "image": "<path>", "name": "破土" }, ...]`，按生长顺序；阶段数 = 数组长度 |
| `minutes_per_stage` | INTEGER NOT NULL DEFAULT 600 | 每阶段所需投入分钟数（progress 阈值） |
| `sort_order` | INTEGER DEFAULT 0 | 列表排序 |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | |

#### `farm_plot_layout`（土地格子位置）
| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | 如 `fp-1` |
| `x` | REAL NOT NULL | 百分比 0–100（相对土地底图，响应式自适应，坐标系与 `default_room_layout` 一致） |
| `y` | REAL NOT NULL | 百分比 0–100 |
| `z` | INTEGER DEFAULT 3 | 层级 |
| `scale` | REAL DEFAULT 1 | 缩放 |
| `sort_order` | INTEGER DEFAULT 0 | 排序 |

### 2.2 复用表
- `tab_backgrounds`（tab_key='tab3'）：土地底图路径。新土地照片 `46189e3d4888f758f1f4fbb94ed8f3df.png` 复制到 `yuji-app/assets/farm/land.png`，迁移 SQL 将 tab3 默认底图更新为该路径。
- 新增 Storage 桶 `farm-images`（公开读 / 认证可上传），存放各作物阶段图。规则与现有 `furniture-images` / `shop-images` / `tab-backgrounds` 桶一致。

### 2.3 用户状态（`user_state.data` JSON 内的新形状）
替换旧 `plots`（9 个空槽）、`gardenWarehouse`、`feedGarden`/`harvestPlot`/`plantSeed`（旧）全部移除。

```jsonc
farmPlots: [
  // 每个「已占用」的格子一条，按 plotId 索引；空格子不在此数组
  {
    "plotId": "fp-1",            // 对应 farm_plot_layout.id
    "skillName": "学Python",      // 用户自定义技能名
    "cropKey": "wheat",           // 用户从品种库选的作物
    "progress": 0,                // 累计进度 = Σsessions.minutes + Σ(completed goals).points
    "sessions": [                 // 学习时间日志
      { "id": "<uid>", "date": "<ISO>", "minutes": 30, "note": "学了列表推导" }
    ],
    "goals": [                   // 用户设的阶段性小目标
      { "id": "<uid>", "label": "完成基础语法", "points": 300, "completed": false }
    ],
    "createdAt": "<ISO>",
    "matured": false              // stage == stages.length-1 时置 true
  }
],
farmWarehouse: []                // 成熟收获纪念列表（可选保留）
```

### 2.4 成长计算
- `progress = Σ sessions.minutes + Σ (goals where completed).points`
- `stage = min( floor(progress / minutes_per_stage), stages.length - 1 )`
- `matured = (stage == stages.length - 1)`
- 升阶时触发庆祝动画（粒子/sparkle），与旧 tab3 `.pop` 升阶动效一致。

## 3. RLS 策略（与现有表同款）
```sql
ALTER TABLE farm_crop_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_plot_layout  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fc_read_all"  ON farm_crop_catalog FOR SELECT USING (true);
CREATE POLICY "fc_admin_wr"  ON farm_crop_catalog FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "fp_read_all"  ON farm_plot_layout  FOR SELECT USING (true);
CREATE POLICY "fp_admin_wr"  ON farm_plot_layout  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
```
Storage `farm-images` 桶复用现有 `storage_public_read` / `storage_auth_upload` / `storage_auth_update` / `storage_auth_delete` 策略（扩展 bucket_id 白名单）。

## 4. 后台管理界面

### 4.1 入口
`yuji-app/admin/index.html` 侧栏新增按钮 `🌾 技能农场`（data-sec=`farm`），在「花园种子」与「Tab 页面背景」之间。新增 `<section data-panel="farm">` 含两子面板。

### 4.2 子面板 A：作物品种库（表格 CRUD）
- 镜像现有「家具库」表格（[admin.js](../yuji-app/admin/admin.js) `loadFurniture` 模式）。
- 列：key、emoji、name、阶段数、minutes_per_stage、操作（保存/删）。
- `+ 新增品种` → 弹窗填 key/name/emoji/minutes_per_stage，逐阶段上传图片（存 `farm-images` 桶，路径入库到 `stages` JSON）、填阶段名；阶段数可增删；预览各阶段图。
- `admin.js` 的 `resources` 映射表新增 `'farm-crops'` → `{ table:'farm_crop_catalog', idField:'key', mapper:mapFarmCrop, mapBack:... }`，`stages` 走 JSON 序列化（与现有 `seed_catalog` 的 `stages`/`yield` JSON 处理一致）。

### 4.3 子面板 B：土地格子布置（拖拽画布）
- 镜像现有「默认房间布局」拖拽（[admin.js](../yuji-app/admin/admin.js) 房间布局编辑器）。
- 画布底图 = tab3 土地照片；右侧 `+ 添加格子` 放空格子标记到画布；拖动调位置（百分比坐标）；选中改 z/scale；删除。
- `保存布局` → `farm_plot_layout` 表（全删后重插，与房间布局保存一致）。
- 前端预览账号 2.5s 轮询自动同步（现有 `pollPreviewConfig` 机制，需把 `farmCropCatalog`/`farmPlotLayout` 纳入 `currentConfigFingerprint`）。
- `admin.js` 的 `resources` 映射表新增 `'farm-plots'` → `{ table:'farm_plot_layout', idField:'id', ... }`。

### 4.4 写入路径
admin 前端直接 supabase-js 写库（RLS admin 可写），**不改动** `admin-api` Edge Function（仅用户/日志走它）。

## 5. 前端 Tab3 重写

### 5.1 配置流
- [api.js](../yuji-app/js/api.js) `getConfig()`：并行查询加 `farm_crop_catalog`+`farm_plot_layout`，map 后返回 `farmCropCatalog`+`farmPlotLayout`。
- [state.js](../yuji-app/js/state.js) `applyConfig()`：缓存 `farmCropCatalog`/`farmPlotLayout`；预览轮询 `currentConfigFingerprint()` 纳入这两项；`buildDefaultState()` 改用 `farmPlots: []`（旧 `plots`/`gardenWarehouse` 字段移除，deepMerge 忽略旧值）。

### 5.2 渲染（[tab3.js](../yuji-app/js/tab3.js) 重写 + [tab3-garden.css](../yuji-app/css/tab3-garden.css) 适配）
- 远景层：土地底图（`State.tabBackgrounds.tab3` → `<img class="tab3-bg">`，已有 DOM）。
- 中层：遍历 `farmPlotLayout` 渲染格子槽位（绝对定位，百分比坐标转 px）；按 `farmPlots[plotId]` 是否占用决定显示作物图或空槽提示。作物图取 `crop.stages[stage].image`，stage 由 progress 计算。
- 前景层：保留像素农夫小我 + 蝴蝶/花粉粒子（现有装饰，纯视觉）。
- 移除旧 `PLOT_LAYOUT`(像素坐标)、`fieldSprite`、`FEED_PER_STAGE` 相关逻辑。

### 5.3 交互（[popups.js](../yuji-app/js/popups.js) 新增弹窗，替换旧 seedSelect/harvest/cottage）
- 点空格子 → `farmPlant` 弹窗：填技能名 → 选品种（farmCropCatalog）→ 可选设阶段性小目标（label+points）→ 种下（调 `State.plantSkill`）。
- 点已占格子 → `farmLog` 弹窗：显示当前阶段/进度/下一阶段阈值；记录今日学习（minutes+note）→ progress 累加、自动升阶；管理小目标（勾选完成 → points 计入 progress）；成熟后可选「收获纪念」清空格子重种（调 `State.harvestSkill`，入 farmWarehouse）。

### 5.4 State 新方法（[state.js](../yuji-app/js/state.js)）
- `plantSkill(plotId, skillName, cropKey, goals=[])`：占空格子，初始化 farmPlot 对象。
- `logSession(plotId, minutes, note)`：追加 session，progress+=minutes，重算 stage/matured。
- `toggleGoal(plotId, goalId)`：切换 goal.completed；若变为 completed，progress+=points；否则减回。
- `harvestSkill(plotId)`：仅 matured 可调；push 纪念项到 farmWarehouse，清空该 plotId。
- 暴露 `farmCropCatalog`、`farmPlotLayout`、`getFarmCrop(key)`、`getFarmPlotByPlotId(plotId)`。
- 移除旧 `plantSeed`/`feedGarden`/`harvestPlot`/`getSeed`（若其他模块引用需清理）。

### 5.5 清理旧 feedGarden 调用点
全局 grep `feedGarden`/旧 `plantSeed`/`harvestPlot`：tab1/tab2/tab4 中 self-care/emotion/action 完成回调曾调 `State.feedGarden(...)` 推进旧种子，全部移除（新系统与事件解耦，仅由用户记录时间/完成目标驱动）。

## 6. 迁移 SQL `003_farm_schema.sql`
1. 建 `farm_crop_catalog`、`farm_plot_layout`（含 RLS 策略，复用 `is_admin()`）。
2. Storage 加 `farm-images` 桶；扩展 `storage_*` 策略 bucket_id 白名单。
3. 种子数据：2–3 个示例作物品种（阶段图复用现有 `yuji-app/assets/farm/crop-s1..s4.png`/`crop-h1.png`，避免额外生成图）；一套默认格子位置（旧 PLOT_LAYOUT 像素值 / 容器尺寸 → 百分比换算）。
4. `UPDATE tab_backgrounds SET bg_path='assets/farm/land.png' WHERE tab_key='tab3'`。
5. 用户需在 Supabase SQL Editor 手动执行此文件。

## 7. 改动文件清单
- `yuji-app/assets/farm/land.png`（复制入 46189e3d4888f758f1f4fbb94ed8f3df.png）
- `yuji-app/index.html`：tab3 DOM 注释更新、CSS/JS version +1 强刷缓存
- `yuji-app/js/tab3.js`：完全重写
- `yuji-app/js/state.js`：applyConfig 加农场配置；buildDefaultState 用 farmPlots；新增 farm 方法；移除旧 plantSeed/feedGarden/harvestPlot/getSeed
- `yuji-app/js/api.js`：getConfig 加两表查询与 map
- `yuji-app/js/popups.js`：新增 farmPlant/farmLog，移除旧 seedSelect/harvest/cottage 的 tab3 分支
- `yuji-app/css/tab3-garden.css`：格子定位改百分比
- `yuji-app/admin/index.html` + `admin.js` + `admin.css`：新增「技能农场」section + 两子面板 + 两 resource 映射
- `supabase/migrations/003_farm_schema.sql`：新建

## 8. 部署影响
- Vercel Root Directory 仍为 `yuji-app`；前端静态构建无新增依赖。
- 后端仅新增两张公开表 + 一个 Storage 桶，RLS 与现有同款；admin 后台直接写库，无新 Edge Function。
- 执行 `003_farm_schema.sql` 后即生效；前端 version +1 强刷缓存；预览账号自动同步后台格子/品种变更。
