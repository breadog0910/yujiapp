const AGENT_CONTEXT_KEYS: Record<string, string[]> = {
  letter: ['careValue', 'healthValue', 'happinessValue', 'comfortValue', 'emotionRecords', 'starPoints', 'careOptions', 'customCareOptions', 'plots'],
  self_manual: ['emotionRecords', 'starPoints', 'careOptions', 'customCareOptions', 'plots', 'selfManual', 'letters'],
  insight: ['emotionRecords', 'starPoints', 'careOptions', 'customCareOptions', 'plots', 'careValue', 'healthValue', 'happinessValue', 'comfortValue'],
  furni_story: ['emotionRecords', 'starPoints', 'careOptions', 'customCareOptions', 'plots', 'careValue', 'healthValue', 'happinessValue', 'comfortValue'],
  // 本心对语：结合近期自我照顾事例 + 情绪 + 成长星点 + 说明书，给用户鼓励与陪伴
  whisper: ['careOptions', 'customCareOptions', 'emotionRecords', 'starPoints', 'selfManual', 'careValue', 'happinessValue', 'healthValue', 'comfortValue'],
};

function buildContext(data: any, agentKey: string): string {
  if (!data) return '';
  const keys = AGENT_CONTEXT_KEYS[agentKey] || Object.keys(data);
  const parts: string[] = [];

  const vals = ['careValue', 'healthValue', 'happinessValue', 'comfortValue'];
  const hasVal = vals.some(k => keys.includes(k) && data[k] != null);
  if (hasVal) {
    const v: string[] = [];
    if (keys.includes('careValue') && data.careValue != null) v.push(`关爱值 ${data.careValue}`);
    if (keys.includes('happinessValue') && data.happinessValue != null) v.push(`开心值 ${data.happinessValue}`);
    if (keys.includes('healthValue') && data.healthValue != null) v.push(`健康值 ${data.healthValue}`);
    if (keys.includes('comfortValue') && data.comfortValue != null) v.push(`舒适值 ${data.comfortValue}`);
    if (v.length) parts.push('用户当前数值：' + v.join('、'));
  }

  if (keys.includes('emotionRecords') && Array.isArray(data.emotionRecords) && data.emotionRecords.length) {
    const recent = data.emotionRecords.slice(-5).map((r: any) => {
      const tags = (r.tags || []).join('/');
      return tags + (r.text ? '：' + r.text : '');
    }).join('\n');
    if (recent) parts.push('用户最近的情绪记录（近 5 条）：\n' + recent);
  }

  if (keys.includes('starPoints') && Array.isArray(data.starPoints) && data.starPoints.length) {
    const stars = data.starPoints.slice(-8).map((s: any) => {
      const tag = s.tag || '';
      return tag + (s.text ? '：' + s.text : '');
    }).join('\n');
    if (stars) parts.push('用户的成长星点（近 8 条）：\n' + stars);
  }

  if ((keys.includes('careOptions') || keys.includes('customCareOptions')) && Array.isArray(data.careOptions)) {
    const done = data.careOptions.filter((c: any) => c.done).map((c: any) => `「${c.label}」`);
    if (Array.isArray(data.customCareOptions)) {
      data.customCareOptions.filter((c: any) => c.done).forEach((c: any) => done.push(`自定义任务「${c.label}」`));
    }
    if (done.length) parts.push('今天已完成的自我照顾：' + done.join('；'));
  }

  if (keys.includes('plots') && Array.isArray(data.plots)) {
    const garden = data.plots.map((p: any, i: number) => {
      if (!p) return null;
      const names = ['破土', '生长', '繁茂', '成熟'];
      return `田地里「${p.seedKey || '未知种子'}」长到${names[Math.min(p.stage, 3)]}阶（养分${p.feed || 0}/3）`;
    }).filter(Boolean);
    if (garden.length) parts.push('田地状态：' + garden.join('；'));
  }

  if (keys.includes('letters') && Array.isArray(data.roomItems)) {
    const stories = data.roomItems.filter((r: any) => r.story && r.story !== '').slice(-5);
    if (stories.length) {
      parts.push('已记录的家具经历（近 5 件）：\n' + stories.map((r: any) => `「${r.type}」：${r.story.slice(0, 60)}`).join('\n'));
    }
  }

  if (keys.includes('selfManual') && data.selfManual) {
    const sm = data.selfManual;
    const chapters: string[] = [];
    if (sm.chapter1 && sm.chapter1 !== '还在认识中…') chapters.push(`第一章（我是怎样的人）：${sm.chapter1.slice(0, 80)}`);
    if (sm.chapter2 && sm.chapter2 !== '还在认识中…') chapters.push(`第二章（我的优势）：${sm.chapter2.slice(0, 80)}`);
    if (sm.chapter3 && sm.chapter3 !== '还在认识中…') chapters.push(`第三章（我的雷区）：${sm.chapter3.slice(0, 80)}`);
    if (sm.chapter4 && sm.chapter4 !== '还在认识中…') chapters.push(`第四章（怎样好好对待我）：${sm.chapter4.slice(0, 80)}`);
    if (sm.chapter5 && sm.chapter5 !== '还在认识中…') chapters.push(`第五章（适合我的成长方式）：${sm.chapter5.slice(0, 80)}`);
    if (chapters.length) parts.push('《自我说明书》当前内容：\n' + chapters.join('\n'));
  }

  return parts.join('\n\n');
}

function sanitize(data: any): any {
  if (!data) return data;
  return JSON.parse(JSON.stringify(data));
}

export function getSelfManual(data: any) {
  return (data && data.selfManual) || {
    chapter1: '还在认识中…',
    chapter2: '还在认识中…',
    chapter3: '还在认识中…',
    chapter4: '还在认识中…',
    chapter5: '还在认识中…',
    updatedAt: new Date().toISOString(),
  };
}

export async function getContext(supabase: any, userId: string, agentKey: string) {
  const { data: row, error } = await supabase
    .from('user_state')
    .select('data')
    .eq('user_id', userId)
    .single();

  if (error || !row) return { context: '', data: null };
  const data = sanitize(JSON.parse(row.data));
  const context = buildContext(data, agentKey);
  return { context, data };
}

export { buildContext };
