const express = require('express');
const path = require('path');
const fs = require('fs');
const { PORT, GAME_DIR, ROOT } = require('./config');
const db = require('./db');
const { seed } = require('./seed');

const app = express();
app.use(express.json({ limit: '2mb' }));

async function init() {
  await db.initSchema();

  // 确保数据库有初始配置（幂等）
  try {
    const cntRes = await db.prepare('SELECT COUNT(*) c FROM furniture_catalog').get();
    if (cntRes.c === 0) {
      console.log('[init] 数据库为空，写入配置种子…');
      await seed();
    }
  } catch (e) {
    console.log('[init] 写入配置种子…', e.message);
    await seed();
  }

  // 价格回填
  try {
    const PRICE_MAP = { bed:40, 'bed-big':75, sofa:35, chair:12, table:15, shelf:20, window:18, lamp:12, candle:14, plant:16, flowers:18, painting:22, clock:20, basket:10, rug:25, teddy:15, cat:30, books:12, radio:24, tea:8, letter:12, piggy:28 };
    const updPrice = db.prepare('UPDATE furniture_catalog SET price = ? WHERE type = ? AND (price IS NULL OR price = 0)');
    for (const [t, p] of Object.entries(PRICE_MAP)) await updPrice.run(p, t);
  } catch (e) {
    console.warn('[init] 家具价格回填失败：', e.message);
  }

  // 一次性迁移：将部分家具默认设为「未解锁」
  try {
    const migrated = await db.prepare("SELECT value FROM site_settings WHERE key='furni_lock_migrated'").get();
    if (!migrated) {
      const LOCKED = ['candle', 'flowers', 'basket', 'tea', 'radio'];
      const upd = db.prepare('UPDATE furniture_catalog SET unlocked_by_default = 0 WHERE type = ? AND unlocked_by_default = 1');
      for (const t of LOCKED) await upd.run(t);
      await db.prepare("INSERT INTO site_settings (key,value,updated_at) VALUES ('furni_lock_migrated','1',?)")
        .run(new Date().toISOString());
      console.log('[init] 已将部分家具默认设为未解锁（点击会跳转商店）：' + LOCKED.join(', '));
    }
  } catch (e) {
    console.warn('[init] 家具默认锁定迁移失败：', e.message);
  }

  // 补写 AI 智能体默认配置
  try {
    const AI_DEFAULTS = [
      {
        key: 'letter', name: '小我信件', provider: 'openai', base_url: 'https://api.openai.com/v1',
        api_key: '', model: 'gpt-4o-mini', temperature: 0.8,
        system_prompt: '你是用户内在“小我”的温柔观察者，不是心理医生、老师或监督者。用观察式、不评判、不诊断的口吻，给用户写一封简短温暖的信件，引导ta看见并接纳自己。禁止输出“你应该”“你必须”等压迫式指令，禁止诊断心理疾病。',
        enabled: 0,
      },
      {
        key: 'self_manual', name: '自我说明书', provider: 'openai', base_url: 'https://api.openai.com/v1',
        api_key: '', model: 'gpt-4o-mini', temperature: 0.5,
        system_prompt: '你是温柔的自我观察者。基于用户的全部记录，持续迭代更新《自我说明书》五章（我是怎样的人 / 我的优势 / 我的雷区 / 怎样好好对待我 / 适合我的成长方式）。不下死标签、不贴人格定义，用观察式语气输出。',
        enabled: 0,
      },
      {
        key: 'insight', name: '自我洞察', provider: 'openai', base_url: 'https://api.openai.com/v1',
        api_key: '', model: 'gpt-4o-mini', temperature: 0.7,
        system_prompt: '你是温柔的自我观察者。基于用户的情绪与行为记录，提炼洞察、提出自我提问，引导觉察。严禁评判、诊断、制造焦虑。',
        enabled: 0,
      },
      {
        key: 'furni_story', name: '家具经历', provider: 'openai', base_url: 'https://api.openai.com/v1',
        api_key: '', model: 'gpt-4o-mini', temperature: 0.9,
        system_prompt: '你是用户的"小我"——住在用户房间里、默默陪伴ta的像素小人。语气温暖克制，像朋友写信，不要说教、不要诊断、不要用"你应该/必须"。你只输出一段 80–160 字的中文小故事，不使用列表、不加标题。',
        enabled: 0,
      },
      {
        key: 'diaryguide', name: '日记引导', provider: 'openai', base_url: 'https://api.openai.com/v1',
        api_key: '', model: 'gpt-4o-mini', temperature: 0.7,
        system_prompt: '你是温柔陪伴用户写日记的引导者。帮助用户生成日记引导问题，或根据用户的回答给出温暖的想法和反馈。语气轻柔，不评判，像一位懂你的朋友。',
        enabled: 0,
      },
      {
        key: 'whisper', name: '森林密信', provider: 'openai', base_url: 'https://api.openai.com/v1',
        api_key: '', model: 'gpt-4o-mini', temperature: 0.85,
        system_prompt: '你是森林里那个温柔的小我，是用户内在的自己。用森林密信、说悄悄话的口吻回应用户。语气温暖、神秘而亲切，像在一片安静的森林里对朋友低语。',
        enabled: 0,
      },
    ];
    const insAi = db.prepare(
      `INSERT INTO ai_config (key,name,provider,base_url,api_key,model,temperature,system_prompt,enabled,updated_at)
       VALUES (@key,@name,@provider,@base_url,@api_key,@model,@temperature,@system_prompt,@enabled,@updated_at)
       ON CONFLICT (key) DO NOTHING`
    );
    const now = new Date().toISOString();
    const runAI = db.transaction(async () => {
      for (const a of AI_DEFAULTS) {
        await insAi.run({
          key: a.key, name: a.name, provider: a.provider, base_url: a.base_url, api_key: a.api_key,
          model: a.model, temperature: a.temperature, system_prompt: a.system_prompt, enabled: a.enabled, updated_at: now,
        });
      }
    });
    await runAI();
    console.log('[init] 已补写 AI 智能体默认配置（furni_story 等），管理员可在后台启用。');
  } catch (e) {
    console.warn('[init] AI 智能体补写失败：', e.message);
  }

  // 补写 4 个 Tab 默认背景
  try {
    const DEF_TAB_BG = {
      tab1: 'assets/tab1beijing.png',
      tab2: 'assets/tab2-forest.png',
      tab3: 'assets/tab3-garden-bg.jpg',
      tab4: 'assets/tab4-stars.png',
    };
    const insTabBg = db.prepare('INSERT INTO tab_backgrounds (tab_key,bg_path,updated_at) VALUES (?,?,?) ON CONFLICT (tab_key) DO NOTHING');
    const now = new Date().toISOString();
    for (const [k, p] of Object.entries(DEF_TAB_BG)) await insTabBg.run(k, p, now);
  } catch (e) {
    console.warn('[init] Tab 默认背景补写失败：', e.message);
  }

  // ===== API =====
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api', require('./routes/config'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/state', require('./routes/state'));
  app.use('/api/ai', require('./routes/ai'));

  // 健康检查
  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  // ===== 静态资源 =====
  if (fs.existsSync(path.join(GAME_DIR, 'assets'))) {
    app.use('/assets', express.static(path.join(GAME_DIR, 'assets')));
  }

  app.use('/admin', express.static(path.join(ROOT, 'admin-ui')));

  if (fs.existsSync(GAME_DIR)) {
    app.use('/', express.static(GAME_DIR, { index: 'index.html' }));
  }

  app.use((err, req, res, next) => {
    console.error('[error]', err.message);
    res.status(500).json({ error: '服务器内部错误' });
  });

  app.listen(PORT, () => {
    console.log(`\n《予己》后端已启动`);
    console.log(`  游戏前端:  http://localhost:${PORT}/`);
    console.log(`  管理后台:  http://localhost:${PORT}/admin/`);
    console.log(`  配置接口:  http://localhost:${PORT}/api/config\n`);
  });
}

init().catch(e => {
  console.error('[fatal] 启动失败', e);
  process.exit(1);
});
