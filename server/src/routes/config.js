const express = require('express');
const db = require('../db');
const { mapFurniture, mapLayout, mapShop, mapSeed } = require('./config-shared');

const router = express.Router();

router.get('/config', async (req, res) => {
  const furniture = (await db.prepare('SELECT * FROM furniture_catalog ORDER BY type').all()).map(mapFurniture);
  const layout = (await db.prepare('SELECT * FROM default_room_layout ORDER BY sort_order').all()).map(mapLayout);
  const shop = (await db.prepare('SELECT * FROM shop_items ORDER BY sort_order').all()).map(mapShop);
  const seeds = (await db.prepare('SELECT * FROM seed_catalog ORDER BY sort_order').all()).map(mapSeed);
  const settings = {};
  (await db.prepare('SELECT key, value FROM site_settings').all()).forEach(s => { settings[s.key] = s.value; });
  const aiPublic = (await db.prepare('SELECT key, name, provider, model, enabled FROM ai_config ORDER BY key').all())
    .map(a => ({ key: a.key, name: a.name, provider: a.provider, model: a.model, enabled: !!a.enabled }));

  const DEF_TAB_BG = {
    tab1: 'assets/tab1beijing.png',
    tab2: 'assets/tab2-forest.png',
    tab3: 'assets/tab3-garden-bg.jpg',
    tab4: 'assets/tab4-stars.png',
  };
  const tabBgRows = await db.prepare('SELECT tab_key, bg_path, updated_at FROM tab_backgrounds').all();
  const tabBgBy = {};
  tabBgRows.forEach(r => { tabBgBy[r.tab_key] = r; });
  const tabBackgrounds = {};
  for (const k of Object.keys(DEF_TAB_BG)) {
    const r = tabBgBy[k];
    tabBackgrounds[k] = (r && r.bg_path) || DEF_TAB_BG[k];
  }

  const FALLBACK_DEF_CARE = [
    { id: 'water',     emoji: '💧', label: '喝水',     mode: 'recurring', reward: 3, sortOrder: 0 },
    { id: 'breath',    emoji: '🌬️', label: '深呼吸',   mode: 'daily',     reward: 3, sortOrder: 1 },
    { id: 'walk',      emoji: '🚶', label: '散步',     mode: 'daily',     reward: 3, sortOrder: 2 },
    { id: 'space',     emoji: '🫧', label: '放空',     mode: 'daily',     reward: 3, sortOrder: 3 },
    { id: 'sleep',     emoji: '🛌', label: '好好睡觉', mode: 'daily',     reward: 3, sortOrder: 4 },
    { id: 'encourage', emoji: '💪', label: '自我鼓励', mode: 'daily',     reward: 3, sortOrder: 5 },
  ];
  const careRows = await db.prepare('SELECT * FROM default_care_options ORDER BY sort_order ASC, id ASC').all();
  const defaultCareOptions = (careRows.length > 0)
    ? careRows.map(r => ({
        id: r.id, emoji: r.emoji, label: r.label,
        mode: r.mode, reward: r.reward, sortOrder: r.sort_order,
      }))
    : FALLBACK_DEF_CARE;

  res.json({
    appName: settings.appName || '予己',
    dailyCoinCap: parseInt(settings.dailyCoinCap || '20', 10),
    furnitureCatalog: furniture,
    defaultRoomLayout: layout,
    shopItems: shop,
    seedCatalog: seeds,
    aiConfig: aiPublic,
    tabBackgrounds,
    defaultCareOptions,
    unlockedTypes: furniture.filter(f => f.unlockedByDefault).map(f => f.type),
    serverTime: new Date().toISOString(),
    farmCropCatalog: [],
    farmPlotLayout: [],
    farmLandList: [],
    farmLandConfig: null,
  });
});

module.exports = router;
