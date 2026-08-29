# 予己 · 好好爱自己

> 一间只属于自己的温柔小屋：记录情绪、照顾自己、慢慢生长。

**予己**是一款像素轻游戏风格的**治愈系自我成长 App**。屏幕里的像素小人「小我」是"另一个自己"——它不催促、不评判、不惩罚，只陪伴你看见当下的情绪、照顾真实的自己，把抽象的成长变成看得见的房间、植物与星迹。

> 「予己」不是帮助用户成为更完美的人，而是帮助用户：**看见现在的自己、理解真实的自己、接纳不完美的自己，找到适合自己的成长方式，成为更懂自己的自己。**

## ✨ 核心体验

四大场景对应一条向内成长的主线：**看见自己 → 认识自己 → 成长自己 → 沉淀自己**

| Tab | 场景 | 定位 | 核心玩法 |
| --- | --- | --- | --- |
| 🏠 **此刻** | 2D 像素房间 | 我现在怎么样？ | 布置房间、今日自我照顾、幸福值 / 予己金币、犒劳商店 |
| 🌲 **遇见** | 2D 像素迷雾森林 | 我是谁？ | 本心对语、心灵树洞、情绪梳理、AI 生成《自我说明书》 |
| 🌻 **生长** | 2.5D 斜等轴测花园 | 我要如何成为自己？ | 种下一个想学的技能，行动驱动植物生长、产出记忆摆件 |
| 🌌 **星迹** | 2D 像素晨昏星空 | 我一路经历了什么？ | 星座图沉淀全部成长节点，AI 挖掘"深度发现"大星星 |

产品遵循**零压力、完全向内**的设计铁则：无排行榜、无社交、无付费充值；所有数值只正向累积，不清零、不扣减；花园植物不会枯萎死亡，搁置仅停止生长。

## 🧩 功能特性

- **双模式架构**：前端可在「Supabase 云模式」与「本地 Express + SQLite 模式」之间一键切换，同一套代码适配演示与生产。
- **AI 能力链**：`insight`（情绪洞察）→ `letter` / `self_manual`（写信 / 迭代自我说明书）的链式调用；Tab4 深度发现座的 AI 大星星挖掘（优势挖掘 / 行为模式 / 成长对比）。
- **管理后台**：房间布局、家具库、商店商品、花园种子、技能农场、Tab 背景、每日照顾选项、AI 接口、账号与操作日志，全部可视化配置。
- **PWA 支持**：可安装到桌面 / 主屏，离线图标与分享预览已就绪。
- **精致像素美术**：手绘像素家具 / 精灵 / 星座 SVG，多场景昼夜氛围（尘埃光点、萤火、雾霭、流星）。

## 🛠 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | 原生 HTML + CSS + JavaScript（零构建、零依赖） |
| 云后端 | Supabase（Auth + PostgreSQL + RLS + Edge Functions Deno/TypeScript） |
| 本地后端 | Node.js + Express + better-sqlite3 |
| AI 接入 | OpenAI 兼容协议（DeepSeek 等，供应商可配） |
| 部署 | Vercel（静态托管）+ Supabase（云函数） |

## 📁 目录结构

```
.
├── yuji-app/                  # 前端应用（纯静态，可直接托管）
│   ├── index.html             # 主入口（四大 Tab 场景）
│   ├── manifest.json          # PWA 清单
│   ├── admin/                 # 管理后台（看板 / 配置 / AI / 账号）
│   ├── css/                   # 各 Tab 场景与弹窗样式
│   ├── js/
│   │   ├── main.js            # 主入口 / Tab 导航
│   │   ├── api.js             # 通信层（Supabase + 本地双支持）
│   │   ├── state.js           # 全局状态
│   │   ├── tab1~tab4.js       # 四个场景逻辑
│   │   ├── popups.js          # 弹窗系统
│   │   ├── account.js         # 账号 / 登录
│   │   └── utils.js           # 工具函数
│   └── assets/                # 像素美术资源（家具 / 花园 / 星空等）
├── supabase/                  # 云后端
│   ├── functions/
│   │   ├── ai-chain/          # AI 链式调用（洞察→写信/说明书）
│   │   ├── ai-agent/          # AI 代理
│   │   ├── star-miner/        # Tab4 大星星挖掘
│   │   ├── admin-api/         # 管理端 API
│   │   └── _shared/           # 共享鉴权 / 上下文 / AI 客户端
│   ├── migrations/            # 数据库迁移
│   └── config.toml            # Supabase 本地配置
├── server/                    # 本地模式后端（Express + SQLite）
│   └── src/
│       ├── index.js           # 服务入口
│       ├── routes/            # admin / ai / auth / config / state
│       └── seed.js            # 配置种子数据
└── prd3.3.md                  # 产品需求文档 V3.3
```

## 🚀 快速开始

### 方式一：本地模式（无需云服务）

```bash
# 1. 启动本地后端（Express + SQLite）
cd server
npm install
npm run seed   # 首次初始化种子数据
npm start      # 默认 http://localhost:3000

# 2. 让前端走本地模式
# 在 yuji-app/index.html 引入 api.js 之前注入：
#   <script>window.YUJI_LOCAL_MODE = true;</script>
# 然后浏览器打开 yuji-app/index.html 即可
```

### 方式二：Supabase 云模式（默认）

1. 创建 Supabase 项目，在 `supabase/migrations/` 执行建表迁移；
2. 部署 Edge Functions：`supabase functions deploy ai-chain ai-agent star-miner admin-api`；
3. 在 `yuji-app/index.html` 与 `yuji-app/admin/index.html` 中配置你的 `YUJI_SUPABASE_URL` 与 `YUJI_SUPABASE_ANON_KEY`；
4. 直接托管 `yuji-app/` 目录（Vercel 已提供 `vercel.json` 路由与缓存配置）。

### 🤖 配置 AI 能力

AI 供应商通过云端 `ai_config` 表管理（OpenAI 兼容协议，provider 填 `openai` 即可，如 DeepSeek `https://api.deepseek.com/v1` / `deepseek-chat`）：

- 启用某 agent：将对应行 `enabled` 置为 `1`，并填入 `base_url` / `api_key` / `model`；
- 《自我说明书》生成链：需同时启用 `insight` + `self_manual` 两个 agent，前端才会显示「重新总结」入口；
- `ai_config` 表开启 RLS，写入需 service_role（管理后台或 Supabase Dashboard）。

### 🛠 管理后台

打开 `yuji-app/admin/index.html`（或部署后 `/admin` 路径），登录管理员账号后可配置：默认房间布局、初始解锁家具、家具库、商店商品、花园种子、技能农场、Tab 背景、每日照顾选项、AI 接口、账号管理与操作日志。

## 📄 文档

- [产品需求文档 PRD V3.3](./prd3.3.md)：完整的产品理念、世界观、模块需求、AI 系统设计与验收标准。

## 📝 开发约定

- 提交信息遵循 Conventional Commits 中文风格，如 `feat(yuji-app): xxx`、`fix(ai): xxx`、`chore: xxx`。
- 美术资源抠图请保持透明通道干净，避免半透明像素导致的"家具透背景"问题（前端已有 `alpha-hard-edge` filter 兜底）。

## 📜 License

本项目仅供学习与个人使用，未经授权请勿用于商业用途。
