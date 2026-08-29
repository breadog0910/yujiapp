# 项目长期记忆（予己 yuji-app）

## 运行模式与 AI 配置
- 前端默认 `LOCAL_MODE=false`，走 **Supabase 模式**：`index.html` 指向 `https://saxpmirsqlhokzuoiray.supabase.co`；`callChain` → Supabase Edge Function `ai-chain`；AI 配置读云端 `ai_config` 表（anon 可读，用于前端判断按钮显隐）。
- `ai_config` 表开启 RLS，写入需 service_role（admin 后台 `yuji-app/admin` 或 Supabase Dashboard SQL Editor）。启用某 agent：把对应行 `enabled` 设为 1 并填 `base_url/api_key/model`。
- 自我说明书（selfManual）生成链 = `insight_manual`（insight 分析 → self_manual 写回 `user_state.data.selfManual`）。需同时启用 `insight` + `self_manual`，前端才显示「重新总结」按钮并隐藏 AI 未启用时的占位提示。
- 本地 server（`server/src`，Express + better-sqlite3）仅在 `LOCAL_MODE=true` 时使用；`server/src/seed.js` 是本地 SQLite 种子（与云端 ai_config 同源结构）。
- AI 供应商按 OpenAI 兼容协议调用（provider 填 `openai` 即可），DeepSeek 端点为 `https://api.deepseek.com/v1`，模型 `deepseek-chat`。

## 用户偏好（本项目）
- 镜子弹窗等处不要出现"未配置 / 啥没配置"类半成品提示文案，要么把功能真正接通，要么换成友好占位。
