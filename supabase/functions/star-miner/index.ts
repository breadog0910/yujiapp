/**
 * star-miner Edge Function
 * --------------------------------------------------------
 * Tab4「深度发现座」的 AI 大星星挖掘入口。
 * - 必须登录（Supabase JWT）
 * - 从 user_state.data 抓取用户真实行为数据
 * - 从 3 种策略中随机选 1 种：优势挖掘 / 行为模式 / 成长对比
 * - 调用 AI 生成 1-2 颗大星，返回 JSON: { stars: Star[] }
 *
 * 前端节流：调用方（tab4.js）自行控制 6 小时只调用一次，以节省 API 费用。
 * 本函数不做频率限制，仅做最小数据量校验。
 */

import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getAgentConfig, callAgent } from '../_shared/ai.ts';

// 6 星座合法 key
type ConsKey = 'selfcare' | 'emotion' | 'hearttalk' | 'growth' | 'milestone' | 'deepdiscover';

interface MinerStar {
  strategy: 'strength' | 'pattern' | 'contrast';
  strategyLabel: string;
  category: ConsKey;
  title: string;
  desc: string;
  importance: 2 | 3;
}

interface Strategy {
  key: 'strength' | 'pattern' | 'contrast';
  label: string;
  prompt: (ctx: string) => string;
}

const STRATEGIES: Strategy[] = [
  {
    key: 'strength',
    label: '挖掘个人优势',
    prompt: (ctx) =>
`你是一个温柔、擅长从细节里发现闪光点的心理咨询师。

请基于用户下面这份真实行为/记录数据，挖掘用户**3 个不显眼但非常珍贵的个人优势**。
例如：能持续坚持、对自己温柔、允许自己不开心、在低谷里还做了一件小事、反复记录同一件事说明在乎、会选择具体的自我照顾方法、愿意写下痛苦等。
不要编造，不要夸大成"你非常努力/完美"，要**忠于原文**，从具体事件中抽象出优势。

${ctx ? '用户真实数据：\n' + ctx : ''}

严格以 JSON 返回，不要包含其他文字。格式：
{
  "stars": [
    {
      "category": "deepdiscover",
      "title": "10 字以内的星名（如：你有一种「允许」的温柔）",
      "desc": "80~140 字。先引用一个具体行为/原话作为证据，再点明这是怎样一种优势。语气温暖、像写给自己的小卡片。",
      "importance": 3
    }
  ]
}

要求：
- category 只能是 selfcare / emotion / hearttalk / growth / milestone / deepdiscover 之一
- 只返回 1 条（最多 2 条）。如果内容重复，就只保留 1 条。
- importance 一般是 3（大星），如果只是小亮点可用 2。`,
  },
  {
    key: 'pattern',
    label: '行为模式洞察',
    prompt: (ctx) =>
`你是一个温柔、非评判的模式观察者。

请从用户真实数据中，找出**1~2 个反复出现的行为/情绪模式**——不是贴标签，而是把"看起来重复出现的规律"善意地指出来，让用户看到自己。
例如：情绪记录里连续 3 天写"晚上睡不着但还是写了感受" → 说明即使状态差，用户也在用书写托住自己。
例如：连续选择同一类自我照顾 → 身体可能正在告诉你，你需要的其实是某种特定的"慢"。

${ctx ? '用户真实数据：\n' + ctx : ''}

严格以 JSON 返回，不要包含其他文字。格式：
{
  "stars": [
    {
      "category": "deepdiscover",
      "title": "10 字以内（如：「卡住时，你总会……」）",
      "desc": "80~140 字。先描述你观察到的重复规律，再用一句温柔的话点破这个模式背后的意义（不是缺点，是你的一种稳定存在）。",
      "importance": 3
    }
  ]
}

要求：
- category 同上，优先 deepdiscover，其次 emotion / hearttalk / growth。
- 返回 1~2 条。如果找不到可靠模式，返回 1 条"你的星星正在积累中……"这种软描述，但不要编造数据。
- 不要负面评判。`,
  },
  {
    key: 'contrast',
    label: '成长对比',
    prompt: (ctx) =>
`你是一个温柔的成长见证人。

请基于用户时间维度上的前后数据，给出**1 条过去 vs 现在的对比式肯定**——让用户看到："原来我已经走了这么远"。
如果数据不够长、看不出前后变化，就退而求其次，写一条"你现在能做到的，对过去的自己来说已经是礼物"。

${ctx ? '用户真实数据：\n' + ctx : ''}

严格以 JSON 返回，不要包含其他文字。格式：
{
  "stars": [
    {
      "category": "milestone",
      "title": "10 字以内（如：你已经能说出「难过」了）",
      "desc": "80~140 字。温柔地指出变化，引用最早和最晚的 2 处证据（如时间、原话、记录数量对比等），最后一句落在"今天的你值得被肯定"。",
      "importance": 3
    }
  ]
}

要求：
- category 优先 milestone 或 growth，也可以是 deepdiscover。
- 只返回 1 条。没有足够数据就不要编造，返回内容保持谦虚（可以说"记录还不多，但已经看见你在往前走了"）。`,
  },
];

// --- 从 user_state.data 里组装一份喂给 AI 的精简上下文（控制长度）---
function buildUserContext(data: any): string {
  if (!data) return '';
  const parts: string[] = [];

  // 1) 数值概览
  const vals: string[] = [];
  for (const k of ['careValue', 'healthValue', 'happinessValue', 'comfortValue']) {
    if (typeof data[k] === 'number') vals.push(`${k}=${data[k]}`);
  }
  if (vals.length) parts.push(`【数值概览】${vals.join(' / ')}`);

  // 2) 星点总数（摘要）
  if (Array.isArray(data.starPoints) && data.starPoints.length) {
    parts.push(`【已有星星数】${data.starPoints.length} 颗（普通星 + AI 星合计）。最近 6 条标题：`
      + data.starPoints.slice(-6).map((s: any) => `- ${s.title || s.type}`).join('\n'));
  }

  // 3) bubbleRecords（打卡）
  if (Array.isArray(data.bubbleRecords) && data.bubbleRecords.length) {
    const list = data.bubbleRecords.slice(-10).map((r: any) =>
      `- ${r.date || ''} 「${r.activityName || '打卡'}」 sessionNo=${r.sessionNo || 1}`
    );
    parts.push(`【自我照顾打卡 · 近 10 条】\n${list.join('\n')}\n累计次数：${data.bubbleRecords.length}`);
  }

  // 4) emotionRecords
  if (Array.isArray(data.emotionRecords) && data.emotionRecords.length) {
    const list = data.emotionRecords.slice(-10).map((r: any) =>
      `- ${r.date || ''} mood=${r.mood || '?'} ${r.note ? 'note: ' + String(r.note).slice(0, 60) : ''}`
    );
    parts.push(`【情绪记录 · 近 10 条】\n${list.join('\n')}\n累计：${data.emotionRecords.length} 条`);
  }

  // 5) chatHistory（本心对话 whisper）
  if (Array.isArray(data.chatHistory) && data.chatHistory.length) {
    const userMsgs = data.chatHistory.filter((m: any) => m && m.role === 'user').slice(-6);
    if (userMsgs.length) {
      parts.push('【本心对话 · 你最近和小我说的 6 句】\n'
        + userMsgs.map((m: any) => `- ${m.ts || ''} ${String(m.content || '').slice(0, 80)}`).join('\n'));
    }
  }

  // 6) farmPlots + farmWarehouse
  const farmParts: string[] = [];
  if (Array.isArray(data.farmPlots) && data.farmPlots.length) {
    farmParts.push(`农场田地 ${data.farmPlots.length} 块：`
      + data.farmPlots.map((p: any) => `「${p.skillName || p.cropKey || '?'}」${p.matured ? '(已成熟)' : '进度' + (p.progress || 0) + '%'}`).join('；'));
  }
  if (Array.isArray(data.farmWarehouse) && data.farmWarehouse.length) {
    farmParts.push(`仓库收获 ${data.farmWarehouse.length} 次：`
      + data.farmWarehouse.map((w: any) => `「${w.skillName || '技能之果'}」sessions=${w.sessions || '?'}`).join('；'));
  }
  if (farmParts.length) parts.push('【技能农场】\n' + farmParts.join('\n'));

  // 7) milestones
  if (Array.isArray(data.milestones) && data.milestones.length) {
    parts.push(`【里程碑 · 全部 ${data.milestones.length} 条】\n`
      + data.milestones.slice(-6).map((m: any) => `- ${m.date || ''} ${m.title || '里程碑'}${m.desc ? '：' + String(m.desc).slice(0, 60) : ''}`).join('\n'));
  }

  // 8) growthNotes
  if (Array.isArray(data.growthNotes) && data.growthNotes.length) {
    parts.push(`【成长笔记 · 近 5 条】\n`
      + data.growthNotes.slice(-5).map((n: any) => `- ${n.date || ''} ${n.title || ''}${n.content ? '：' + String(n.content).slice(0, 80) : ''}`).join('\n'));
  }

  // 9) selfManual 非默认章节
  if (data.selfManual && typeof data.selfManual === 'object') {
    const sm = data.selfManual;
    const map: Record<string, string> = { chapter1:'第一章 我是怎样的人', chapter2:'第二章 我的优势', chapter3:'第三章 我的雷区', chapter4:'第四章 怎样好好对待我', chapter5:'第五章 适合我的成长方式' };
    const chs: string[] = [];
    for (const k of Object.keys(map)) {
      const v = sm[k];
      if (typeof v === 'string' && !v.includes('还在认识中')) {
        chs.push(`【${map[k]}】${v.slice(0, 120)}`);
      }
    }
    if (chs.length) parts.push('【自我手册】\n' + chs.join('\n'));
  }

  return parts.join('\n\n');
}

// 解析 AI 返回的字符串，尽量容错地取出 JSON stars
function parseStars(rawText: string, strategy: Strategy): MinerStar[] {
  const text = (rawText || '').trim();
  if (!text) return [];

  // 1) 去掉代码块标记
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  let obj: any = null;
  // 2) 优先直接 JSON.parse
  try { obj = JSON.parse(cleaned); } catch (_) { obj = null; }

  // 3) 兜底：用正则抓最外层 { ... }
  if (!obj) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) try { obj = JSON.parse(m[0]); } catch (_) { obj = null; }
  }
  if (!obj || !Array.isArray(obj.stars)) return [];

  const ALLOWED_CONS: ConsKey[] = ['selfcare','emotion','hearttalk','growth','milestone','deepdiscover'];
  const results: MinerStar[] = [];

  for (const raw of obj.stars) {
    if (!raw || typeof raw !== 'object') continue;
    const title = String(raw.title || '').trim().slice(0, 24);
    const desc  = String(raw.desc  || '').trim().slice(0, 300);
    if (!title || !desc) continue;

    const category = (ALLOWED_CONS.includes(raw.category) ? raw.category : 'deepdiscover') as ConsKey;
    const importance = (raw.importance === 2 ? 2 : 3) as 2 | 3;

    results.push({
      strategy: strategy.key,
      strategyLabel: strategy.label,
      category,
      title,
      desc,
      importance,
    });
    if (results.length >= 2) break; // 最多 2 颗
  }
  return results;
}

// --- Deno 入口 ---
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await requireAuth(req);
    const supabase = getServiceClient();

    // 1) 读取 user_state
    const { data: row, error } = await supabase
      .from('user_state')
      .select('data')
      .eq('user_id', user.id)
      .single();

    const userData = (row && !error) ? JSON.parse(row.data || '{}') : {};
    const ctx = buildUserContext(userData);

    // 2) 最少数据量检查：普通星数 >= 3 才调用
    const starPoints: any[] = Array.isArray(userData.starPoints) ? userData.starPoints : [];
    const minedCount = starPoints.filter((p: any) =>
      p && typeof p.type === 'string' && p.type.startsWith('mined_')
    ).length;

    if (minedCount < 3) {
      return new Response(
        JSON.stringify({ stars: [], message: `数据不足（${minedCount}/3），先积累一点再来挖～` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3) 随机选一种策略
    const strategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];

    // 4) 读取 AI 配置（复用 insight agent，缺少则失败）
    let cfg;
    try {
      cfg = await getAgentConfig(supabase, 'insight');
    } catch (e: any) {
      // 没配置就返回空，让前端不报错
      console.warn('[star-miner] AI 配置不可用：', e.message);
      return new Response(
        JSON.stringify({ stars: [], message: 'AI 智能体未启用，跳过本次大星挖掘' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 5) 调用 AI
    const messages = [{ role: 'user', content: strategy.prompt(ctx) }];
    const rawText = await callAgent(cfg, messages, 0.7);

    // 6) 解析 stars
    const stars = parseStars(rawText, strategy);

    return new Response(
      JSON.stringify({ strategy: strategy.key, strategyLabel: strategy.label, stars }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    console.error('[star-miner] error', e.message, e.stack);
    const status = e.message.includes('未登录') ? 401
      : e.message.includes('未启用') ? 400
      : 502;
    return new Response(
      JSON.stringify({ stars: [], error: e.message || '未知错误' }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
