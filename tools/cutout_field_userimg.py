# -*- coding: utf-8 -*-
"""用户自定义田地图片 (9023197a78e18cf96264fe5ff9fb5a15.png) 处理脚本：
1. 抠白底 → 透明 PNG
2. 识别 9 宫格每块田精确位置
3. 输出前端 CSS + tab3.js 配置
"""
import os
from PIL import Image, ImageDraw

SRC_IMG = r"c:\Users\29948\Desktop\workbuddy\9023197a78e18cf96264fe5ff9fb5a15.png"
DST_IMG = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\field-base-9grid.png"
DEBUG_IMG = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\_debug_grid.png"

# ---------- 1) 全像素抠白底 ----------
def cutout_white(img, tol=15):
    """白色(或接近白)→透明。tol: 允许色差范围 0-255"""
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # 到纯白的距离（任一通道越接近255，就越接近白）
            d = max(255 - r, 255 - g, 255 - b)
            if d <= tol:
                # 越接近白越透明
                ratio = d / tol if tol else 1.0
                new_a = int(255 * ratio * ratio)  # 二次方让边缘更干脆
                if new_a == 0:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    px[x, y] = (r, g, b, new_a)
    return img

# ---------- 2) 9 宫格 bbox 识别（基于颜色：找 9 个土壤中心） ----------
def find_9_soil_centers(img):
    """通过颜色阈值找土壤区域(棕色)，再找 9 个连通域质心。"""
    w, h = img.size
    px = img.load()
    # 土壤颜色：棕色系 R>G>B, R~140-200, G~100-160, B~70-120, 不是木框颜色
    # 先做二值图：土壤=1，其他=0
    mask = [[0]*w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 30:
                continue
            # 土壤：R~120-220, G~80-180, B~50-140, R>G>B+10, 比较暗(不是木框)
            # 木框偏黄亮 R>G≈B, R~180-240
            is_soil = (100 <= r <= 210) and (70 <= g <= 170) and (40 <= b <= 130) \
                      and (r > g + 10) and (g > b + 5)
            # 木框：黄亮色
            is_frame = (180 <= r <= 250) and (140 <= g <= 220) and (90 <= b <= 180) \
                       and (r - b > 60)
            if is_soil and not is_frame:
                mask[y][x] = 1
    # 连通域标记
    visited = [[False]*w for _ in range(h)]
    regions = []
    for y in range(h):
        for x in range(w):
            if mask[y][x] == 1 and not visited[y][x]:
                # BFS
                stack = [(x, y)]
                visited[y][x] = True
                pts = []
                while stack:
                    cx, cy = stack.pop()
                    pts.append((cx, cy))
                    for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                        nx, ny = cx+dx, cy+dy
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx]==1 and not visited[ny][nx]:
                            visited[ny][nx] = True
                            stack.append((nx, ny))
                if len(pts) >= 50:  # 过滤噪声
                    sx = sum(p[0] for p in pts)
                    sy = sum(p[1] for p in pts)
                    n = len(pts)
                    xs = [p[0] for p in pts]
                    ys = [p[1] for p in pts]
                    regions.append({
                        'area': n,
                        'cx': sx // n,
                        'cy': sy // n,
                        'x1': min(xs), 'y1': min(ys),
                        'x2': max(xs), 'y2': max(ys),
                    })
    # 按面积排序，取最大 9 个
    regions.sort(key=lambda r: -r['area'])
    regions = regions[:9]
    print(f"  找到 {len(regions)} 个土壤连通域")
    for i, r in enumerate(regions):
        print(f"    region{i}: area={r['area']} center=({r['cx']},{r['cy']}) bbox=({r['x1']},{r['y1']})-({r['x2']},{r['y2']}) size={r['x2']-r['x1']+1}x{r['y2']-r['y1']+1}")
    return regions

def order_9plots_iso(regions):
    """把 9 个中心按等距顺序重新排列：
    idx 0: 最顶端 (cy 最小)
    idx 1: 左上 (cy 次小, cx 较小)
    idx 2: 右上 (cy 次小, cx 较大)
    idx 3: 最左 (cx 最小)
    idx 4: 正中
    idx 5: 最右 (cx 最大)
    idx 6: 左下 (cy 次大, cx 较小)
    idx 7: 右下 (cy 次大, cx 较大)
    idx 8: 最底端 (cy 最大)
    """
    # 按 cy 排序分 5 层
    rs = sorted(regions, key=lambda r: r['cy'])
    # 9 个中心的 cy 应该形成 5 组：[1,2,3,2,1]
    # 简单方法：按 idx 编号赋值，通过几何距离
    centers = [(r['cx'], r['cy'], r['x1'], r['y1'], r['x2'], r['y2']) for r in rs]
    # 找对应索引位置
    result = [None] * 9
    # 0: cy 最小
    result[0] = centers[0]
    # 8: cy 最大
    result[8] = centers[-1]
    # 剩下中间
    rest = centers[1:-1]
    # 1,2: cy 次小的 2 个（按 cx 小→大）
    rest_sorted_cy = sorted(rest, key=lambda c: c[1])
    row1 = sorted(rest_sorted_cy[:2], key=lambda c: c[0])
    result[1], result[2] = row1[0], row1[1]
    # 6,7: cy 次大的 2 个
    row3 = sorted(rest_sorted_cy[-2:], key=lambda c: c[0])
    result[6], result[7] = row3[0], row3[1]
    # 剩下 3 个是中间行 row2: cx 最小 / 中 / 最大
    row2_all = rest_sorted_cy[2:-2]
    # 如果不够 3 个，放宽限制（可能相邻cy太近）
    if len(row2_all) < 3:
        # 直接用剩下没分配的 3 个
        used = {id(c) for c in result if c is not None}
        row2_all = [c for c in rest if id(c) not in used]
    row2 = sorted(row2_all, key=lambda c: c[0])
    result[3], result[4], result[5] = row2[0], row2[1], row2[2]
    return result

def draw_debug(img, ordered, scale_x, scale_y, out_path):
    """画调试图：红框=每块田 bbox，蓝字=idx"""
    img2 = img.copy()
    d = ImageDraw.Draw(img2)
    colors = ['red', 'green', 'blue', 'orange', 'purple', 'cyan', 'magenta', 'yellow', 'brown']
    for i, c in enumerate(ordered):
        if c is None:
            continue
        cx, cy, x1, y1, x2, y2 = c
        # 放大显示
        sx1, sy1 = int(x1*scale_x), int(y1*scale_y)
        sx2, sy2 = int(x2*scale_x), int(y2*scale_y)
        color = colors[i % len(colors)]
        d.rectangle([sx1, sy1, sx2, sy2], outline=color, width=2)
        # idx 号
        scx, scy = int(cx*scale_x), int(cy*scale_y)
        d.text((scx-6, scy-6), str(i), fill=color)
    img2.save(out_path)
    print(f"  调试图已保存: {out_path}")

def main():
    print("=" * 60)
    print("[1/4] 读取源图 + 抠白底")
    img = Image.open(SRC_IMG).convert("RGBA")
    w, h = img.size
    print(f"  源图尺寸: {w}x{h}")
    img = cutout_white(img, tol=15)
    img.save(DST_IMG)
    # 统计透明像素
    px = img.load()
    trans = sum(1 for y in range(h) for x in range(w) if px[x, y][3] == 0)
    print(f"  抠图完成 → {os.path.basename(DST_IMG)}")
    print(f"  透明比例: {100*trans/(w*h):.1f}%")

    print("\n[2/4] 识别 9 宫格土壤区域")
    regions = find_9_soil_centers(img)
    if len(regions) != 9:
        print(f"  ⚠ 没找到 9 个区域(得{len(regions)}个)，请调整颜色阈值")
        return
    ordered = order_9plots_iso(regions)
    print("  按等距顺序 idx0-8 排列完成:")
    for i, c in enumerate(ordered):
        cx, cy, x1, y1, x2, y2 = c
        print(f"    idx{i}: center=({cx},{cy}) bbox=({x1},{y1})-({x2},{y2}) tile={(x2-x1+1)}x{(y2-y1+1)}")

    # 画调试图（2x 放大方便看）
    print("\n[3/4] 生成调试图确认格子位置")
    draw_debug(img, ordered, 2, 2, DEBUG_IMG)

    print("\n[4/4] 计算前端配置")
    # 目标高度 ~ 280-300px 适合手机
    target_h = 290
    scale = target_h / h
    new_w = int(round(w * scale))
    new_h = target_h
    print(f"  原图 {w}x{h} → 前端容器 {new_w}x{new_h} (scale={scale:.4f})")
    print()
    print("""========== 直接复制下面的配置 ==========""")
    print()
    print(">>> CSS .garden-plots (替换原来的)")
    print(f"  width: {new_w}px;")
    print(f"  height: {new_h}px;")
    print(f"  top: 62%;   /* 再往下移！从原来的 52% → 62%，用户说位置高 */")
    print(f"  transform: translate(-50%, 0);   /* 只水平居中，不做垂直居中 */")
    print()
    print(">>> tab3.js — 直接替换 plotPosition()")
    print("  // 九宫格位置查表（来自 cutout_field_userimg.py）")
    print("  const PLOT_LAYOUT = [")
    tiles_scaled = []
    for i, c in enumerate(ordered):
        cx, cy, x1, y1, x2, y2 = c
        left = round(x1 * scale, 1)
        top  = round(y1 * scale, 1)
        tw   = round((x2 - x1 + 1) * scale, 1)
        th   = round((y2 - y1 + 1) * scale, 1)
        tiles_scaled.append((tw, th))
        print(f"    {{ left: {left:>6.1f}, top: {top:>6.1f}, width: {tw:>5.1f}, height: {th:>5.1f} }},  // idx {i}")
    print("  ];")
    print()
    print("  function plotPosition(idx) { return PLOT_LAYOUT[idx]; }")
    # 同时更新 CONTAINER_W / CONTAINER_H
    print(f"  const CONTAINER_W = {new_w};")
    print(f"  const CONTAINER_H = {new_h};")
    print()
    print(">>> 作物 sprite 建议尺寸（按田格 85%×120%，因为作物要长高超出田面）")
    avg_tw = sum(t[0] for t in tiles_scaled) / 9
    avg_th = sum(t[1] for t in tiles_scaled) / 9
    cw = int(round(avg_tw * 0.85))
    ch_harvest = int(round(avg_th * 1.6))   # 成熟/收获阶段：高于田格
    ch_seed    = int(round(avg_th * 0.6))   # 破土阶段：矮于田格
    ch_mid     = int(round(avg_th * 1.1))   # 生长/繁茂：约等于田格
    print(f"  平均田格: ~{avg_tw:.0f}x{avg_th:.0f}px")
    print(f"  → crop-s1 (破土):  ~{cw}x{ch_seed}px")
    print(f"  → crop-s2 (生长):  ~{cw}x{ch_mid}px")
    print(f"  → crop-s3 (繁茂):  ~{cw}x{ch_mid}px")
    print(f"  → crop-s4 (成熟前): ~{cw}x{ch_harvest}px")
    print(f"  → crop-h1 (收获):  ~{cw}x{ch_harvest}px")
    print()
    print("""=========================================""")

if __name__ == "__main__":
    main()
