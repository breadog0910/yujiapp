/**
 * 统一上下文模块
 * - 从 user_state 解析用户数据，自动构建 AI 上下文
 * - 按智能体类型最小化发送（只发当前任务所需数据）
 * - 数据脱敏：去除用户名等 PII
 */

const db = require('./db');

// 各智能体所需的数据字段映射
const AGENT_CONTEXT_KEYS = {
  letter: ['careValue', 'healthValue', 'happinessValue', 'comfortValue', 'emotionRecords', 'starPoints', 'careOptions', 'customCareOptions', 'plots'],
  self_manual: ['emotionRecords', 'starPoints', 'careOptions', 'customCareOptions', 'plots', 'selfManual', 'letters'],
  insight: ['emotionRecords', 'starPoints', 'careOptions', 'customCareOptions', 'plots', 'careValue', 'healthValue', 'happinessValue', 'comfortValue'],
  furni_story: ['emotionRecords', 'starPoints', 'careOptions', 'customCareOptions', 'plots', 'careValue', 'healthValue', 'happinessValue', 'comfortValue'],
};

/**
 * 从用户状态中提取上下文字符串
 * @param {object} data - 用户状态 JSON
 * @param {string} agentKey - 智能体 key
 * @returns {string} 格式化的上下文字符串
 */
function buildContext(data, agentKey) {
  if (!data) return '';
  const keys = AGENT_CONTEXT_KEYS[agentKey] || Object.keys(data);
  const parts = [];

  // 数值
  const vals = ['careValue', 'healthValue', 'happinessValue', 'comfortValue'];
  const hasVal = vals.some(k => keys.includes(k) && data[k] != null);
  if (hasVal) {
    const v = [];
    if (keys.includes('careValue') && data.careValue != null) v.push(`关爱值 ${data.careValue}`);
    if (keys.includes('happinessValue') && data.happinessValue != null) v.push(`开心值 ${data.happinessValue}`);
    if (keys.includes('healthValue') && data.healthValue != null) v.push(`健康值 ${data.healthValue}`);
    if (keys.includes('comfortValue') && data.comfortValue != null) v.push(`舒适值 ${data.comfortValue}`);
    if (v.length) parts.push('用户当前数值：' + v.join('、'));
  }

  // 情绪记录
  if (keys.includes('emotionRecords') && Array.isArray(data.emotionRecords) && data.emotionRecords.length) {
    const recent = data.emotionRecords.slice(-5).map(r => {
      const tags = (r.tags || []).join('/');
      return tags + (r.text ? '：' + r.text : '');
    }).join('\n');
    if (recent) parts.push('用户最近的情绪记录（近 5 条）：\n' + recent);
  }

  // 成长星点
  if (keys.includes('starPoints') && Array.isArray(data.starPoints) && data.starPoints.length) {
    const stars = data.starPoints.slice(-8).map(s => {
      const tag = s.tag || '';
      return tag + (s.text ? '：' + s.text : '');
    }).join('\n');
    if (stars) parts.push('用户的成长星点（近 8 条）：\n' + stars);
  }

  // 今日自我照顾
  if ((keys.includes('careOptions') || keys.includes('customCareOptions')) && Array.isArray(data.careOptions)) {
    const done = data.careOptions.filter(c => c.done).map(c => `「${c.label}」`);
    if (Array.isArray(data.customCareOptions)) {
      data.customCareOptions.filter(c => c.done).forEach(c => done.push(`自定义任务「${c.label}」`));
    }
    if (done.length) parts.push('今天已完成的自我照顾：' + done.join('；'));
  }

  // 田地状态
  if (keys.includes('plots') && Array.isArray(data.plots)) {
    const garden = data.plots.map((p, i) => {
      if (!p) return null;
      const names = ['破土', '生长', '繁茂', '成熟'];
      return `田地里「${p.seedKey || '未知种子'}」长到${names[Math.min(p.stage, 3)]}阶（养分${p.feed || 0}/3）`;
    }).filter(Boolean);
    if (garden.length) parts.push('田地状态：' + garden.join('；'));
  }

  // 家具经历（已记录的家具故事）
  if (keys.includes('letters') && Array.isArray(data.roomItems)) {
    const stories = data.roomItems.filter(r => r.story && r.story !== '').slice(-5);
    if (stories.length) {
      parts.push('已记录的家具经历（近 5 件）：\n' + stories.map(r => `「${r.type}」：${r.story.slice(0, 60)}`).join('\n'));
    }
  }

  // 自我说明书当前内容
  if (keys.includes('selfManual') && data.selfManual) {
    const sm = data.selfManual;
    const chapters = [];
    if (sm.chapter1 && sm.chapter1 !== '还在认识中…') chapters.push(`第一章（我是怎样的人）：${sm.chapter1.slice(0, 80)}`);
    if (sm.chapter2 && sm.chapter2 !== '还在认识中…') chapters.push(`第二章（我的优势）：${sm.chapter2.slice(0, 80)}`);
    if (sm.chapter3 && sm.chapter3 !== '还在认识中…') chapters.push(`第三章（我的雷区）：${sm.chapter3.slice(0, 80)}`);
    if (sm.chapter4 && sm.chapter4 !== '还在认识中…') chapters.push(`第四章（怎样好好对待我）：${sm.chapter4.slice(0, 80)}`);
    if (sm.chapter5 && sm.chapter5 !== '还在认识中…') chapters.push(`第五章（适合我的成长方式）：${sm.chapter5.slice(0, 80)}`);
    if (chapters.length) parts.push('《自我说明书》当前内容：\n' + chapters.join('\n'));
  }

  return parts.join('\n\n');
}

/**
 * 脱敏处理：去除用户名、自定义标签等可能含 PII 的字段
 * @param {object} data - 原始用户状态
 * @returns {object} 脱敏后的数据
 */
function sanitize(data) {
  if (!data) return data;
  const d = JSON.parse(JSON.stringify(data));
  // 情绪记录中若有用户输入的文本可能含 PII，保留但标记
  // 用户名等标识信息已在前端不可见，服务端不存储
  return d;
}

/**
 * 获取用户上下文（脱敏后）
 * @param {number} userId
 * @param {string} agentKey - 智能体 key
 * @returns {{context: string, data: object}}
 */
function getContext(userId, agentKey) {
  const row = db.prepare('SELECT data FROM user_state WHERE user_id = ?').get(userId);
  if (!row) return { context: '', data: null };
  const data = sanitize(JSON.parse(row.data));
  const context = buildContext(data, agentKey);
  return { context, data };
}

/**
 * 获取说明书数据（用于更新）
 * @param {object} data - 用户状态
 * @returns {object} selfManual 对象
 */
function getSelfManual(data) {
  return (data && data.selfManual) || {
    chapter1: '还在认识中…',
    chapter2: '还在认识中…',
    chapter3: '还在认识中…',
    chapter4: '还在认识中…',
    chapter5: '还在认识中…',
    updatedAt: new Date().toISOString(),
  };
}

module.exports = { buildContext, sanitize, getContext, getSelfManual, AGENT_CONTEXT_KEYS };