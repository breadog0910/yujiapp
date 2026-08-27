// 数据库行 -> 前端对象的映射函数（config 与 admin 路由共用）
function mapFurniture(r) {
  return {
    type: r.type, name: r.name, category: r.category, icon: r.icon,
    w: r.w, h: r.h, isFloor: !!r.is_floor, action: r.action || null,
    unlockedByDefault: !!r.unlocked_by_default,
    price: r.price || 0,
  };
}
function mapLayout(r) {
  return {
    id: r.id, type: r.type, x: r.x, y: r.y, z: r.z,
    scale: r.scale, flip: r.flip,
    rot: r.rot || 0, tilt: r.tilt || 0,
    action: r.action || null, sortOrder: r.sort_order,
  };
}
function mapShop(r) {
  return {
    id: r.id, kind: r.kind, emoji: r.emoji, name: r.name, price: r.price,
    bonus: JSON.parse(r.bonus || '{}'), desc: r.desc || '', unlocked: !!r.unlocked,
    icon: r.icon || '',
  };
}
function mapSeed(r) {
  return {
    key: r.key, emoji: r.emoji, name: r.name, dir: r.dir, desc: r.desc,
    feedOn: JSON.parse(r.feed_on || '[]'), stages: JSON.parse(r.stages || '[]'),
    yield: JSON.parse(r.yield || '{}'),
  };
}
module.exports = { mapFurniture, mapLayout, mapShop, mapSeed };
