const path = require('path');

const ROOT = path.resolve(__dirname, '..');

module.exports = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  ROOT,
  // 现有游戏前端目录（workbuddy/yuji-app）
  GAME_DIR: path.resolve(ROOT, '..', 'yuji-app'),
  // 会话有效期（天）
  SESSION_TTL_DAYS: 7,
  // 种子管理员初始密码（首次登录强制修改）
  ADMIN_DEFAULT_PW: 'admin123',
  // 每日金币上限（默认值）
  DEFAULT_DAILY_COIN_CAP: 20,
};
