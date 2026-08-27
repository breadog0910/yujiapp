-- ============================================================
-- 《予己》Supabase 全迁移 - 种子数据
-- 执行方式：在 001_init_schema.sql 之后执行
-- ============================================================

-- -----------------------------------------------------------
-- 1. 家具目录
-- -----------------------------------------------------------
INSERT INTO furniture_catalog (type, name, category, icon, w, h, is_floor, action, unlocked_by_default, price)
VALUES
  ('bed',      '小床',   '家具', 'assets/pixel/bed.png',      64, 52, 0, NULL, 1, 40),
  ('bed-big',  '大床',   '家具', 'assets/pixel/bed-big.png',  96, 64, 0, NULL, 1, 75),
  ('sofa',     '沙发',   '家具', 'assets/pixel/sofa.png',     60, 44, 0, NULL, 1, 35),
  ('chair',    '小椅',   '家具', 'assets/pixel/chair.png',    36, 52, 0, NULL, 1, 12),
  ('table',    '小木桌', '家具', 'assets/pixel/table.png',    48, 40, 0, NULL, 1, 15),
  ('shelf',    '置物架', '家具', 'assets/pixel/shelf.png',    56, 56, 0, 'shelf', 1, 20),
  ('window',   '小窗',   '家具', 'assets/pixel/window.png',   44, 48, 0, NULL, 1, 18),
  ('lamp',     '台灯',   '灯光', 'assets/pixel/lamp.png',     36, 56, 0, NULL, 1, 12),
  ('candle',   '烛台',   '灯光', 'assets/pixel/candle.png',   28, 44, 0, NULL, 0, 14),
  ('plant',    '盆栽',   '绿植', 'assets/pixel/plant.png',    44, 60, 0, NULL, 1, 16),
  ('flowers',  '花束',   '绿植', 'assets/pixel/flowers.png',  36, 52, 0, NULL, 0, 18),
  ('painting', '画框',   '装饰', 'assets/pixel/painting.png', 48, 40, 0, NULL, 1, 22),
  ('clock',    '小钟',   '装饰', 'assets/pixel/clock.png',    36, 36, 0, NULL, 1, 20),
  ('basket',   '小篮',   '装饰', 'assets/pixel/basket.png',   44, 36, 0, NULL, 0, 10),
  ('rug',      '小地毯', '装饰', 'assets/pixel/rug.png',      80, 40, 1, NULL, 1, 25),
  ('teddy',    '玩偶',   '陪伴', 'assets/pixel/teddy.png',    44, 48, 0, NULL, 1, 15),
  ('cat',      '小猫',   '陪伴', 'assets/pixel/cat.png',      48, 40, 0, NULL, 1, 30),
  ('books',    '书堆',   '陪伴', 'assets/pixel/books.png',    44, 36, 0, NULL, 1, 12),
  ('radio',    '收音机', '陪伴', 'assets/pixel/radio.png',    44, 40, 0, NULL, 0, 24),
  ('tea',      '茶杯',   '陪伴', 'assets/pixel/tea.png',      32, 36, 0, NULL, 0, 8),
  ('letter',   '小我的信', '陪伴', 'assets/pixel/letter.png', 40, 32, 0, 'letter', 1, 12),
  ('piggy',    '存钱罐', '功能', 'assets/pixel/piggy.png',    40, 44, 0, 'shop', 1, 28)
ON CONFLICT (type) DO NOTHING;

-- -----------------------------------------------------------
-- 2. 默认房间布局
-- -----------------------------------------------------------
INSERT INTO default_room_layout (id, type, x, y, z, scale, flip, rot, tilt, action, sort_order)
VALUES
  ('ri-window',   'window',   8,  34, 2, 1,    0, 0, 0, NULL,   0),
  ('ri-painting', 'painting', 30, 36, 2, 0.9,  0, 0, 0, NULL,   1),
  ('ri-clock',    'clock',    60, 38, 2, 0.85, 0, 0, 0, NULL,   2),
  ('ri-lamp',     'lamp',     84, 30, 3, 1,    0, 0, 0, NULL,   3),
  ('ri-plant',    'plant',    92, 16, 3, 1,    0, 0, 0, NULL,   4),
  ('ri-shelf',    'shelf',    10, 18, 4, 1,    0, 0, 0, 'shelf',5),
  ('ri-books',    'books',    18, 10, 5, 1,    0, 0, 0, NULL,   6),
  ('ri-rug',      'rug',      40, 8,  4, 1.4,  0, 0, 0, NULL,   7),
  ('ri-cat',      'cat',      56, 12, 5, 1,    0, 0, 0, NULL,   8),
  ('ri-teddy',    'teddy',    70, 14, 5, 1,    0, 0, 0, NULL,   9),
  ('ri-piggy',    'piggy',    88, 10, 6, 1,    0, 0, 0, 'shop', 10),
  ('ri-letter',   'letter',   48, 44, 6, 0.95, 0, 0, 0, 'letter',11)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------
-- 3. 商店物品
-- -----------------------------------------------------------
INSERT INTO shop_items (id, kind, emoji, name, price, bonus, "desc", unlocked, sort_order)
VALUES
  ('teddy',   'physical', '🧸', '小熊玩偶',   15, '{"happiness":2,"health":1}',  '', 1, 0),
  ('cake',    'physical', '🎂', '小蛋糕',     25, '{"happiness":3,"health":2}',  '', 1, 1),
  ('lamp',    'physical', '💡', '小台灯',     12, '{"happiness":1,"health":1}',  '', 1, 2),
  ('carpet',  'physical', '🟫', '小地毯',     20, '{"happiness":2,"health":1}',  '', 1, 3),
  ('cushion', 'physical', '🛋️', '抱枕',       18, '{"happiness":2}',             '', 1, 4),
  ('toy',     'physical', '🪀', '像素玩具',   10, '{"happiness":1}',             '', 1, 5),
  ('movie',   'spirit',   '🎬', '看一场电影',   30, '{"happiness":5}',  '房间灯光调暗，小我坐下观看', 1, 6),
  ('feast',   'spirit',   '🍰', '享用美食大餐', 40, '{"happiness":8}',  '小我享用美食动画',         1, 7),
  ('travel',  'spirit',   '🏕️', '短途外出冒险', 50, '{"happiness":6}',  '短暂切换简易户外像素片段', 1, 8),
  ('birth',   'spirit',   '🎉', '生日时刻',     80, '{"happiness":10}', '弹出蛋糕动画，小我暖心独白', 1, 9)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------
-- 4. 种子目录
-- -----------------------------------------------------------
INSERT INTO seed_catalog (key, emoji, name, dir, "desc", feed_on, stages, yield, sort_order)
VALUES
  ('selfcare', '🌿', '练习好好休息', '自我照顾', '在「此刻」完成自我照顾，会为它输送养料', '["selfcare","habit"]', '["seed-selfcare-s1","seed-selfcare-s2","seed-selfcare-s3","seed-selfcare-s4"]', '{"emoji":"🪴","name":"治愈盆栽","bonus":{"happiness":2,"health":2}}', 0),
  ('emotion',  '🌱', '练习情绪觉察', '情绪能力', '在「遇见」记录一次情绪，会为它输送养料', '["emotion"]', '["seed-emotion-s1","seed-emotion-s2","seed-emotion-s3","seed-emotion-s4"]', '{"emoji":"🌸","name":"觉察之花","bonus":{"happiness":3}}', 1),
  ('action',   '🌵', '练习立刻行动', '行动力',   '完成一件小事并记下，会为它输送养料', '["action","selfcare"]', '["seed-action-s1","seed-action-s2","seed-action-s3","seed-action-s4"]', '{"emoji":"🌼","name":"行动小花","bonus":{"happiness":2,"health":1}}', 2),
  ('interest', '🌻', '探索一个爱好', '兴趣探索', '尝试新事物、记录新发现，会为它输送养料', '["interest","express"]', '["seed-interest-s1","seed-interest-s2","seed-interest-s3","seed-interest-s4"]', '{"emoji":"🎨","name":"灵感之花","bonus":{"happiness":3}}', 3),
  ('express',  '💐', '练习主动表达', '表达能力', '写下自我鼓励、表达真实想法，会为它输送养料', '["express","emotion"]', '["seed-express-s1","seed-express-s2","seed-express-s3","seed-express-s4"]', '{"emoji":"💐","name":"勇气花束","bonus":{"happiness":2}}', 4),
  ('habit',    '🌾', '养成小习惯',   '生活习惯', '坚持一次好习惯（喝水/睡觉/散步…），会为它输送养料', '["habit","selfcare"]', '["seed-habit-s1","seed-habit-s2","seed-habit-s3","seed-habit-s4"]', '{"emoji":"🌾","name":"丰收麦穗","bonus":{"health":3}}', 5)
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------
-- 5. AI 配置
-- -----------------------------------------------------------
INSERT INTO ai_config (key, name, provider, base_url, api_key, model, temperature, system_prompt, enabled, updated_at)
VALUES
  ('letter',      '小我信件',   'openai', 'https://api.openai.com/v1', '', 'gpt-4o-mini', 0.8,
   '你是用户内在"小我"的温柔观察者，不是心理医生、老师或监督者。用观察式、不评判、不诊断的口吻，给用户写一封简短温暖的信件，引导ta看见并接纳自己。禁止输出"你应该""你必须"等压迫式指令，禁止诊断心理疾病。',
   0, NOW()),
  ('self_manual', '自我说明书', 'openai', 'https://api.openai.com/v1', '', 'gpt-4o-mini', 0.5,
   '你是温柔的自我观察者。基于用户的全部记录，持续迭代更新《自我说明书》五章（我是怎样的人 / 我的优势 / 我的雷区 / 怎样好好对待我 / 适合我的成长方式）。不下死标签、不贴人格定义，用观察式语气输出。',
   0, NOW()),
  ('insight',     '自我洞察',   'openai', 'https://api.openai.com/v1', '', 'gpt-4o-mini', 0.7,
   '你是温柔的自我观察者。基于用户的情绪与行为记录，提炼洞察、提出自我提问，引导觉察。严禁评判、诊断、制造焦虑。',
   0, NOW()),
  ('furni_story', '家具经历',   'openai', 'https://api.openai.com/v1', '', 'gpt-4o-mini', 0.9,
   '你是用户的"小我"——住在用户房间里、默默陪伴ta的像素小人。语气温暖克制，像朋友写信，不要说教、不要诊断、不要用"你应该/必须"。你只输出一段 80–160 字的中文小故事，不使用列表、不加标题。',
   0, NOW())
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------
-- 6. 站点设置
-- -----------------------------------------------------------
INSERT INTO site_settings (key, value, updated_at)
VALUES
  ('dailyCoinCap', '20', NOW()),
  ('appName', '予己', NOW()),
  ('furni_lock_migrated', '1', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

-- -----------------------------------------------------------
-- 7. Tab 背景
-- -----------------------------------------------------------
INSERT INTO tab_backgrounds (tab_key, bg_path, updated_at)
VALUES
  ('tab1', 'assets/tab1beijing.png', NOW()),
  ('tab2', 'assets/tab2-forest.png', NOW()),
  ('tab3', 'assets/tab3-garden-bg.jpg', NOW()),
  ('tab4', 'assets/tab4-stars.png', NOW())
ON CONFLICT (tab_key) DO UPDATE SET bg_path = EXCLUDED.bg_path, updated_at = EXCLUDED.updated_at;

-- -----------------------------------------------------------
-- 8. 默认照顾选项
-- -----------------------------------------------------------
INSERT INTO default_care_options (id, emoji, label, mode, reward, sort_order)
VALUES
  ('water',     '💧', '喝水',     'recurring', 3, 0),
  ('breath',    '🌬️', '深呼吸',   'daily',     3, 1),
  ('walk',      '🚶', '散步',     'daily',     3, 2),
  ('space',     '🫧', '放空',     'daily',     3, 3),
  ('sleep',     '🛌', '好好睡觉', 'daily',     3, 4),
  ('encourage', '💪', '自我鼓励', 'daily',     3, 5)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------
-- 9. 价格回填（确保旧数据也有价格）
-- -----------------------------------------------------------
UPDATE furniture_catalog SET price = 40  WHERE type = 'bed'      AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 75  WHERE type = 'bed-big'  AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 35  WHERE type = 'sofa'     AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 12  WHERE type = 'chair'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 15  WHERE type = 'table'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 20  WHERE type = 'shelf'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 18  WHERE type = 'window'   AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 12  WHERE type = 'lamp'     AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 14  WHERE type = 'candle'   AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 16  WHERE type = 'plant'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 18  WHERE type = 'flowers'  AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 22  WHERE type = 'painting' AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 20  WHERE type = 'clock'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 10  WHERE type = 'basket'   AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 25  WHERE type = 'rug'      AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 15  WHERE type = 'teddy'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 30  WHERE type = 'cat'      AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 12  WHERE type = 'books'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 24  WHERE type = 'radio'    AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 8   WHERE type = 'tea'      AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 12  WHERE type = 'letter'   AND (price IS NULL OR price = 0);
UPDATE furniture_catalog SET price = 28  WHERE type = 'piggy'    AND (price IS NULL OR price = 0);

-- -----------------------------------------------------------
-- 10. 家具默认解锁状态（部分默认未解锁）
-- -----------------------------------------------------------
UPDATE furniture_catalog SET unlocked_by_default = 0 WHERE type IN ('candle', 'flowers', 'basket', 'tea', 'radio');
