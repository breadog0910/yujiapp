const express = require('express');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../auth');
const { getContext, getSelfManual } = require('../context');

const router = express.Router();

const AGENT_KEYS = {
  letter: 'letter',
  self_manual: 'self_manual',
  selfManual: 'self_manual',
  insight: 'insight',
  furni_story: 'furni_story',
  furniStory: 'furni_story',
};

async function callAgent(cfg, messages, temperature) {
  const sysPrompt = (cfg.system_prompt || '').trim();
  const fullMessages = [];
  if (sysPrompt) fullMessages.push({ role: 'system', content: sysPrompt });
  for (const m of messages) {
    if (m && m.role && m.content) fullMessages.push({ role: m.role, content: String(m.content) });
  }

  const url = cfg.base_url.replace(/\/+$/, '') + '/chat/completions';
  const temp = Number(temperature ?? cfg.temperature) || 0.7;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + cfg.api_key,
      },
      body: JSON.stringify({ model: cfg.model, temperature: temp, messages: fullMessages }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('[ai] upstream', r.status, txt.slice(0, 300));
      throw new Error('AI 服务返回错误：' + r.status);
    }
    const data = await r.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    return text.trim();
  } catch (e) {
    if (e.message.startsWith('AI 服务返回错误')) throw e;
    console.error('[ai] fetch failed', e.message);
    throw new Error('无法连接 AI 服务：' + e.message);
  }
}

async function getAgentConfig(key) {
  const cfg = await db.prepare('SELECT * FROM ai_config WHERE key = ?').get(key);
  if (!cfg) throw new Error('未找到该 AI 智能体配置');
  if (!cfg.enabled) throw new Error('该 AI 智能体未启用（请在管理后台开启）');
  if (!cfg.base_url || !cfg.api_key || !cfg.model) throw new Error('AI 配置不完整（缺少 base_url / api_key / model）');
  return cfg;
}

const CHAINS = {
  insight_letter: {
    name: '洞察写信',
    description: '先分析用户的情绪记录生成洞察，再用洞察结果辅助写一封温暖的信',
    steps: [
      { agent: 'insight', label: '分析情绪洞察', passContext: true },
      { agent: 'letter', label: '基于洞察写信', passContext: true, includePrevResult: true },
    ],
  },
  insight_manual: {
    name: '洞察更新说明书',
    description: '分析用户近期记录，用洞察更新《自我说明书》各章节内容',
    steps: [
      { agent: 'insight', label: '分析用户洞察', passContext: true },
      { agent: 'self_manual', label: '更新说明书', passContext: true, includePrevResult: true, saveToManual: true },
    ],
  },
};

router.post('/chain', optionalAuth, async (req, res) => {
  const { chain: chainName, messages: userMessages } = req.body || {};

  if (!chainName || !CHAINS[chainName]) {
    return res.status(400).json({
      error: '未知的编排链',
      available: Object.entries(CHAINS).map(([k, v]) => ({ key: k, name: v.name, description: v.description })),
    });
  }

  const chain = CHAINS[chainName];
  const { context, data } = await getContext(req.user?.id, chain.steps[0].agent);

  let prevResult = '';
  const stepResults = [];

  try {
    for (let i = 0; i < chain.steps.length; i++) {
      const step = chain.steps[i];
      const cfg = await getAgentConfig(step.agent);

      let stepMessages = [];

      if (step.passContext && context) {
        stepMessages.push({ role: 'user', content: context });
      }

      if (step.includePrevResult && prevResult) {
        stepMessages.push({
          role: 'user',
          content: `上一步的分析结果：\n${prevResult}\n\n请基于以上分析，${step.label}。`,
        });
      }

      if (i === chain.steps.length - 1 && userMessages && Array.isArray(userMessages) && userMessages.length > 0) {
        if (step.includePrevResult && prevResult) {
          stepMessages.push({ role: 'user', content: '补充信息：' + userMessages[0].content });
        } else {
          stepMessages = userMessages;
        }
      }

      if (stepMessages.length === 0) {
        stepMessages.push({ role: 'user', content: step.label });
      }

      console.log(`[chain] 步骤 ${i + 1}/${chain.steps.length}: ${step.agent} - ${step.label}`);
      const text = await callAgent(cfg, stepMessages, req.body.temperature);

      stepResults.push({ agent: step.agent, label: step.label, text });
      prevResult = text;

      if (step.saveToManual && data && req.user) {
        await saveToSelfManual(req.user.id, data, text);
      }
    }

    res.json({
      chain: chainName,
      steps: stepResults,
      final: stepResults[stepResults.length - 1]?.text || '',
      // 直带已落库的说明书，前端一次拿到，免去二次拉取与登录态依赖
      manual: (data && data.selfManual) ? data.selfManual : null,
    });
  } catch (e) {
    console.error('[chain] 编排失败', e.message);
    res.status(502).json({
      error: e.message,
      chain: chainName,
      completedSteps: stepResults,
    });
  }
});

async function saveToSelfManual(userId, data, aiText) {
  try {
    const parseCfg = await db.prepare("SELECT * FROM ai_config WHERE key = 'self_manual'").get();
    if (!parseCfg || !parseCfg.enabled) return;

    const parseMessages = [
      {
        role: 'system',
        content: '你是一个 JSON 解析器。请从用户输入的文本中提取《自我说明书》五章内容，输出 JSON 格式：\n'
          + '{"chapter1":"我是怎样的人...","chapter2":"我的优势...","chapter3":"我的雷区...","chapter4":"怎样好好对待我...","chapter5":"适合我的成长方式..."}\n'
          + '如果某章内容缺失，填入空字符串。只输出 JSON，不要包含其他文字。',
      },
      { role: 'user', content: aiText },
    ];

    const url = parseCfg.base_url.replace(/\/+$/, '') + '/chat/completions';
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + parseCfg.api_key,
      },
      body: JSON.stringify({
        model: parseCfg.model, temperature: 0.3,
        messages: parseMessages,
      }),
    });

    if (!r.ok) return;
    const json = await r.json();
    const raw = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
    const parsed = JSON.parse(raw.replace(/```json\s*/i, '').replace(/```\s*$/, '').trim());

    const manual = getSelfManual(data);
    const now = new Date().toISOString();
    for (const ch of ['chapter1', 'chapter2', 'chapter3', 'chapter4', 'chapter5']) {
      if (parsed[ch] && parsed[ch].trim()) manual[ch] = parsed[ch].trim();
    }
    manual.updatedAt = now;
    data.selfManual = manual;

    await db.prepare('UPDATE user_state SET data = ?, updated_at = ? WHERE user_id = ?')
      .run(JSON.stringify(data), now, userId);
    console.log('[chain] 自我说明书已更新');
  } catch (e) {
    console.warn('[chain] 更新说明书失败：', e.message);
  }
}

router.get('/chains', optionalAuth, (req, res) => {
  const list = Object.entries(CHAINS).map(([k, v]) => ({
    key: k, name: v.name, description: v.description,
    steps: v.steps.map(s => ({ agent: s.agent, label: s.label })),
  }));
  res.json(list);
});

// 注意：参数路由放在最后，避免拦截 /chain、/chains 等固定路径
router.post('/:agent', optionalAuth, async (req, res) => {
  const key = AGENT_KEYS[req.params.agent] || req.params.agent;
  try {
    const cfg = await getAgentConfig(key);
    const { messages = [] } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages 必填' });
    }

    const { context, data } = await getContext(req.user?.id, key);
    if (context) {
      const hasContext = messages.some(m => m.role === 'user' && typeof m.content === 'string' && m.content.includes('用户当前数值'));
      if (!hasContext) {
        messages[0] = {
          role: 'user',
          content: context + '\n\n' + messages[0].content,
        };
      }
    }

    const text = await callAgent(cfg, messages, req.body.temperature);
    res.json({ text, agent: key });
  } catch (e) {
    const status = e.message.includes('未找到') ? 404
      : e.message.includes('未启用') || e.message.includes('不完整') ? 400
      : 502;
    res.status(status).json({ error: e.message });
  }
});

module.exports = router;
