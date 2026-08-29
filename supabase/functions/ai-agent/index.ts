import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getContext } from '../_shared/context.ts';
import { getAgentConfig, callAgent } from '../_shared/ai.ts';

const AGENT_KEYS: Record<string, string> = {
  letter: 'letter',
  self_manual: 'self_manual',
  selfManual: 'self_manual',
  insight: 'insight',
  furni_story: 'furni_story',
  furniStory: 'furni_story',
  diaryguide: 'diaryguide',
  whisper: 'whisper',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const agentParam = url.pathname.split('/').pop() || '';
    const key = AGENT_KEYS[agentParam] || agentParam;

    const user = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { messages = [], temperature, sources } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages 必填' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getServiceClient();
    const cfg = await getAgentConfig(supabase, key);

    // 注入上下文（sources 为空数组 → 不含任何用户个人数据，仅用 messages 本身）
    const { context } = await getContext(supabase, user.id, key, sources);
    if (context) {
      const hasContext = messages.some((m: any) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('用户当前数值'));
      if (!hasContext) {
        messages[0] = { role: 'user', content: context + '\n\n' + messages[0].content };
      }
    }

    const text = await callAgent(cfg, messages, temperature);
    return new Response(JSON.stringify({ text, agent: key }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[ai-agent] error', e.message);
    const status = e.message.includes('未找到') ? 404
      : e.message.includes('未启用') || e.message.includes('不完整') ? 400
      : e.message.includes('未登录') ? 401
      : 502;
    return new Response(JSON.stringify({ error: e.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
