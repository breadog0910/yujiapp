import { getServiceClient } from './supabase.ts';

export interface AIConfig {
  key: string;
  name: string;
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  system_prompt: string;
  enabled: boolean;
}

export async function getAgentConfig(supabase: any, key: string): Promise<AIConfig> {
  const { data: cfg, error } = await supabase
    .from('ai_config')
    .select('*')
    .eq('key', key)
    .single();

  if (error || !cfg) throw new Error('未找到该 AI 智能体配置');
  if (!cfg.enabled) throw new Error('该 AI 智能体未启用（请在管理后台开启）');
  if (!cfg.base_url || !cfg.api_key || !cfg.model) throw new Error('AI 配置不完整（缺少 base_url / api_key / model）');
  return cfg as AIConfig;
}

export async function callAgent(cfg: AIConfig, messages: any[], temperature?: number) {
  const sysPrompt = (cfg.system_prompt || '').trim();
  const fullMessages: any[] = [];
  if (sysPrompt) fullMessages.push({ role: 'system', content: sysPrompt });
  for (const m of messages) {
    if (m && m.role && m.content) fullMessages.push({ role: m.role, content: String(m.content) });
  }

  const url = cfg.base_url.replace(/\/+$/, '') + '/chat/completions';
  const temp = Number(temperature ?? cfg.temperature) || 0.7;

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
}
