import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getContext, getSelfManual } from '../_shared/context.ts';
import { getAgentConfig, callAgent } from '../_shared/ai.ts';

const CHAINS: Record<string, any> = {
  insight_letter: {
    name: '洞察写信',
    steps: [
      { agent: 'insight', label: '分析情绪洞察', passContext: true },
      { agent: 'letter', label: '基于洞察写信', passContext: true, includePrevResult: true },
    ],
  },
  insight_manual: {
    name: '洞察更新说明书',
    steps: [
      { agent: 'insight', label: '分析用户洞察', passContext: true },
      { agent: 'self_manual', label: '更新说明书', passContext: true, includePrevResult: true, saveToManual: true },
    ],
  },
};

async function saveToSelfManual(supabase: any, userId: string, data: any, aiText: string) {
  try {
    const { data: parseCfg } = await supabase
      .from('ai_config')
      .select('*')
      .eq('key', 'self_manual')
      .single();
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

    await supabase.from('user_state')
      .update({ data: JSON.stringify(data), updated_at: now })
      .eq('user_id', userId);
    console.log('[chain] 自我说明书已更新');
  } catch (e: any) {
    console.warn('[chain] 更新说明书失败：', e.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { chain: chainName, messages: userMessages, temperature } = body;

    if (!chainName || !CHAINS[chainName]) {
      return new Response(JSON.stringify({
        error: '未知的编排链',
        available: Object.entries(CHAINS).map(([k, v]) => ({ key: k, name: v.name })),
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const chain = CHAINS[chainName];
    const { context, data } = await getContext(getServiceClient(), user.id, chain.steps[0].agent);

    let prevResult = '';
    const stepResults: any[] = [];

    for (let i = 0; i < chain.steps.length; i++) {
      const step = chain.steps[i];
      const cfg = await getAgentConfig(getServiceClient(), step.agent);

      let stepMessages: any[] = [];

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
      const text = await callAgent(cfg, stepMessages, temperature);

      stepResults.push({ agent: step.agent, label: step.label, text });
      prevResult = text;

      if (step.saveToManual && data) {
        await saveToSelfManual(getServiceClient(), user.id, data, text);
      }
    }

    return new Response(JSON.stringify({
      chain: chainName,
      steps: stepResults,
      final: stepResults[stepResults.length - 1]?.text || '',
      // 直带已落库的说明书，前端一次拿到，免去二次拉取与登录态依赖
      manual: (data && data.selfManual) ? data.selfManual : null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[ai-chain] error', e.message);
    const status = e.message.includes('未登录') ? 401 : 502;
    return new Response(JSON.stringify({ error: e.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
