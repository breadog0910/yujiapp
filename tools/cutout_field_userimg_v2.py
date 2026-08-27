# -*- coding: utf-8 -*-
"""用户田地图片 v2：
抠图（tol加大）+ 几何法定位 9 宫格（因为是规则等距 3x3 菱形），不依赖颜色分割。
从调试图目测 9 中心坐标直接写入。
"""
import os
from PIL import Image, ImageDraw

SRC_IMG = r"c:\Users\29948\Desktop\workbuddy\9023197a78e18cf96264fe5ff9fb5a15.png"
DST_IMG = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\field-base-9grid.png"
DEBUG_IMG = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\_debug_grid.png"

# ---------- 1) 抠白底（tol 加大） ----------
def cutout_white(img, tol=30):
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            d = max(255 - r, 255 - g, 255 - b)
            if d <= tol:
                ratio = d / tol if tol else 1.0
                new_a = int(255 * (ratio ** 2))
                if new_a == 0:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    px[x, y] = (r, g, b, new_a)
    return img

# ---------- 2) 9 宫格位置：几何目测 + 微调 ----------
# 原图 911x799，观察调试图后给出 9 个中心点：
# 等距 3x3 排列：
#                 idx0 (最顶端)
#          idx1           idx2
#   idx3        idx4           idx5
#          idx6           idx7
#                 idx8 (最底端)
def get_9_centers_manual(w, h):
    # 基于原图 911x799 坐标目测
    # cx 方向：9宫格中心在 x=455 左右，每格水平错开约 145
    # cy 方向：最顶端 y~240，相邻行间 cy 差约 95
    return [
        # idx: (cx, cy)
        (455, 238),   # 0 最顶端
        (310, 325),   # 1 左上
        (610, 325),   # 2 右上
        (175, 420),   # 3 最左
        (455, 420),   # 4 正中
        (750, 420),   # 5 最右
        (310, 525),   # 6 左下
        (610, 525),   # 7 右下
        (455, 620),   # 8 最底端
    ]

# 每块土壤的矩形包围盒尺寸（目测每块土壤约 240 宽 × 85 高，避开木框）
TILE_W = 250
TILE_H = 95

def build_bbox(w, h):
    centers = get_9_centers_manual(w, h)
    plots = []
    for idx, (cx, cy) in enumerate(centers):
        x1 = int(cx - TILE_W / 2)
        y1 = int(cy - TILE_H / 2)
        x2 = int(cx + TILE_W / 2)
        y2 = int(cy + TILE_H / 2)
        plots.append({
            'idx': idx,
            'cx': cx, 'cy': cy,
            'x1': max(0, x1), 'y1': max(0, y1),
            'x2': min(w-1, x2), 'y2': min(h-1, y2),
        })
    return plots

def draw_debug(img, plots, out_path):
    img2 = img.copy().convert("RGBA")
    # 叠加半透明白色方便看框
    overlay = Image.new("RGBA", img2.size, (255, 255, 255, 0))
    img2 = Image.alpha_composite(img2, overlay)
    d = ImageDraw.Draw(img2)
    colors = ['red', 'green', 'blue', 'orange', 'purple', 'cyan', 'magenta', 'yellow', 'brown']
    for p in plots:
        color = colors[p['idx'] % len(colors)]
        # 框
        d.rectangle([p['x1'], p['y1'], p['x2'], p['y2']], outline=color, width=3)
        # 十字中心
        cx, cy = p['cx'], p['cy']
        d.line([cx-12, cy, cx+12, cy], fill=color, width=2)
        d.line([cx, cy-12, cx, cy+12], fill=color, width=2)
        # idx 文字（稍大）
        d.text((cx+6, cy-14), f"idx{p['idx']}", fill=color)
    img2.save(out_path)
    print(f"  调试图: {out_path}")

def main():
    print("=" * 60)
    print("[1/3] 抠白底 (tol=30)...")
    img = Image.open(SRC_IMG).convert("RGBA")
    w, h = img.size
    print(f"  源图: {w}x{h}")
    img = cutout_white(img, tol=30)
    img.save(DST_IMG)
    px = img.load()
    trans = sum(1 for y in range(h) for x in range(w) if px[x, y][3] == 0)
    print(f"  保存 → {os.path.basename(DST_IMG)}")
    print(f"  透明比例: {100*trans/(w*h):.1f}%  (越大越好，说明白底去得干净)")

    print("\n[2/3] 几何法生成 9 宫格 bbox")
    plots = build_bbox(w, h)
    for p in plots:
        pw = p['x2'] - p['x1'] + 1
        ph = p['y2'] - p['y1'] + 1
        print(f"  idx{p['idx']}: center=({p['cx']},{p['cy']}) tile={pw}x{ph}")
    draw_debug(img, plots, DEBUG_IMG)

    print("\n[3/3] 前端配置输出")
    # 目标高度 290px
    target_h = 290
    scale = target_h / h
    new_w = int(round(w * scale))
    new_h = target_h
    print(f"  scale={scale:.4f}   原图 {w}x{h} → 前端 {new_w}x{new_h}")
    print()
    print("===== 复制下面的配置到项目文件 =====")
    print()
    print(">>> [tab3-garden.css] .garden-plots 段替换为:")
    print(f"  width: {new_w}px;")
    print(f"  height: {new_h}px;")
    print(f"  top: 63%;   /* 用户要求再往下移，比 52% 下移 11% */")
    print(f"  transform: translate(-50%, 0);   /* 只水平居中，因为 top 已定位 */")
    print(f"  background-image: url('../assets/field/field-base-9grid.png');")
    print()
    print(">>> [tab3.js] 替换 plotPosition() 相关段落:")
    print(f"  const CONTAINER_W = {new_w};")
    print(f"  const CONTAINER_H = {new_h};")
    print("  const PLOT_LAYOUT = [")
    tile_sizes = []
    for p in plots:
        sl = round(p['x1'] * scale, 1)
        st = round(p['y1'] * scale, 1)
        sw = round((p['x2'] - p['x1'] + 1) * scale, 1)
        sh = round((p['y2'] - p['y1'] + 1) * scale, 1)
        tile_sizes.append((sw, sh))
        print(f"    {{ left: {sl:>6.1f}, top: {st:>6.1f}, width: {sw:>5.1f}, height: {sh:>5.1f} }},  // idx {p['idx']}")
    print("  ];")
    print("  function plotPosition(idx) { return PLOT_LAYOUT[idx]; }")
    print()
    avg_w = sum(t[0] for t in tile_sizes) / 9
    avg_h = sum(t[1] for t in tile_sizes) / 9
    print(">>> 作物 sprite 目标尺寸 (按田格宽85% × 高度从矮到高):")
    print(f"  平均田格: ~{avg_w:.0f}x{avg_h:.0f}px")
    s1 = (int(avg_w*0.85), int(avg_h*0.55))   # 破土: 很矮
    s2 = (int(avg_w*0.85), int(avg_h*1.00))   # 生长: 与田格齐
    s3 = (int(avg_w*0.85), int(avg_h*1.20))   # 繁茂: 略超田格
    s4 = (int(avg_w*0.85), int(avg_h*1.60))   # 成熟前: 高大
    h1 = (int(avg_w*0.85), int(avg_h*1.60))   # 收获: 与成熟前同
    print(f"  crop-s1 破土: {s1[0]}x{s1[1]}")
    print(f"  crop-s2 生长: {s2[0]}x{s2[1]}")
    print(f"  crop-s3 繁茂: {s3[0]}x{s3[1]}")
    print(f"  crop-s4 将熟: {s4[0]}x{s4[1]}")
    print(f"  crop-h1 收获: {h1[0]}x{h1[1]}")
    print()
    print("  建议统一生成最大尺寸(如 80x80)透明底PNG，作物底部对齐，")
    print("  CSS 用 width:100%; height:100%; object-fit:contain; object-position:center bottom;")
    print("====================================")

if __name__ == "__main__":
    main()
