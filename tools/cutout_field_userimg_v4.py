# -*- coding: utf-8 -*-
"""v4: 修复抠图 alpha 公式 bug"""
import os
from PIL import Image, ImageDraw

SRC_IMG = r"c:\Users\29948\Desktop\workbuddy\9023197a78e18cf96264fe5ff9fb5a15.png"
DST_IMG = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\field-base-9grid.png"
DEBUG_IMG = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\_debug_grid.png"

def cutout_fixed(img, bg_r=252, bg_g=252, bg_b=252, edge_tol=15):
    """抠图：RGB 与背景色(252,252,252)的最大色差决定 alpha
    - 色差 <=0 → 完全透明 (背景色本身)
    - 0<色差<edge_tol → 半透明 (边缘)
    - 色差 >= edge_tol → 完全不透明 (主体)
    """
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # 到背景色的色差（每通道与背景的距离）
            dr = abs(r - bg_r)
            dg = abs(g - bg_g)
            db = abs(b - bg_b)
            d_min = min(dr, dg, db)
            # 如果三通道都接近背景色 → 透明
            if d_min < edge_tol:
                # 越接近背景(ratio=0)越透明，越远离背景(ratio=1)越保留
                ratio = d_min / edge_tol if edge_tol else 1.0
                # 做一个曲线让更干脆
                alpha = int(255 * (ratio * ratio))
                if alpha == 0:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    px[x, y] = (r, g, b, alpha)
    return img

def build_bbox(w, h):
    centers = [
        (455, 246),   # 0 最顶端
        (310, 332),   # 1 左上
        (610, 332),   # 2 右上
        (172, 433),   # 3 最左
        (455, 432),   # 4 正中
        (753, 433),   # 5 最右
        (310, 538),   # 6 左下
        (610, 538),   # 7 右下
        (455, 638),   # 8 最底端
    ]
    TW, TH = 230, 82
    plots = []
    for idx, (cx, cy) in enumerate(centers):
        x1 = int(cx - TW / 2)
        y1 = int(cy - TH / 2)
        x2 = int(cx + TW / 2)
        y2 = int(cy + TH / 2)
        plots.append({
            'idx': idx,
            'cx': cx, 'cy': cy,
            'x1': max(0, x1), 'y1': max(0, y1),
            'x2': min(w-1, x2), 'y2': min(h-1, y2),
        })
    return plots

def draw_debug(img, plots, out_path):
    img2 = img.copy()
    d = ImageDraw.Draw(img2)
    colors = ['red', 'green', 'blue', 'orange', 'purple', 'cyan', 'magenta', 'yellow', 'brown']
    for p in plots:
        color = colors[p['idx'] % len(colors)]
        d.rectangle([p['x1'], p['y1'], p['x2'], p['y2']], outline=color, width=3)
        cx, cy = p['cx'], p['cy']
        d.line([cx-12, cy, cx+12, cy], fill=color, width=2)
        d.line([cx, cy-12, cx, cy+12], fill=color, width=2)
        d.text((cx+6, cy-14), f"idx{p['idx']}", fill=color)
    img2.save(out_path)

def main():
    print("=" * 60)
    print("[1/3] 抠白底 (修复 alpha 公式)")
    img = Image.open(SRC_IMG).convert("RGBA")
    w, h = img.size
    print(f"  源图: {w}x{h}")
    img = cutout_fixed(img, bg_r=252, bg_g=252, bg_b=252, edge_tol=20)
    img.save(DST_IMG)
    px = img.load()
    total = w * h
    trans = sum(1 for y in range(h) for x in range(w) if px[x, y][3] == 0)
    semi = sum(1 for y in range(h) for x in range(w) if 0 < px[x,y][3] < 255)
    opaque = total - trans - semi
    print(f"  保存 → {os.path.basename(DST_IMG)}")
    print(f"  完全透明: {100*trans/total:.1f}%  ✓ 越大越好")
    print(f"  半透明边缘: {100*semi/total:.1f}%")
    print(f"  不透明主体: {100*opaque/total:.1f}%")

    print("\n[2/3] 9 宫格 bbox + 调试图")
    plots = build_bbox(w, h)
    draw_debug(img, plots, DEBUG_IMG)
    print(f"  调试图: {DEBUG_IMG}")

    print("\n[3/3] 前端配置")
    target_h = 290
    scale = target_h / h
    new_w = int(round(w * scale))
    new_h = target_h
    print(f"  scale={scale:.4f}  前端: {new_w}x{new_h}px")
    print()
    print("===== 复制使用 =====")
    print()
    print("[CSS tab3-garden.css .garden-plots]:")
    print(f"  width: {new_w}px;")
    print(f"  height: {new_h}px;")
    print(f"  top: 63%;   /* 用户要求下移，原 52% */")
    print(f"  transform: translate(-50%, 0);")
    print()
    print("[tab3.js]:")
    print(f"  const CONTAINER_W = {new_w};")
    print(f"  const CONTAINER_H = {new_h};")
    print("  const PLOT_LAYOUT = [")
    tiles = []
    for p in plots:
        sl = round(p['x1'] * scale, 1)
        st = round(p['y1'] * scale, 1)
        sw = round((p['x2'] - p['x1'] + 1) * scale, 1)
        sh = round((p['y2'] - p['y1'] + 1) * scale, 1)
        tiles.append((sw, sh))
        print(f"    {{ left: {sl:>6.1f}, top: {st:>6.1f}, width: {sw:>5.1f}, height: {sh:>5.1f} }},  // idx {p['idx']}")
    print("  ];")
    print("  function plotPosition(idx) { return PLOT_LAYOUT[idx]; }")
    print()
    avg_w = sum(t[0] for t in tiles)/9
    avg_h = sum(t[1] for t in tiles)/9
    cw = int(avg_w*0.86)
    print(f"平均田格 ~{avg_w:.0f}x{avg_h:.0f}px")
    print(f"作物建议统一透明画布 {cw}x{int(avg_h*1.8)}px (底部对齐):")
    print(f"  s1破土 ~{cw}x{int(avg_h*0.55)}")
    print(f"  s2生长 ~{cw}x{int(avg_h*1.0)}")
    print(f"  s3繁茂 ~{cw}x{int(avg_h*1.2)}")
    print(f"  s4将熟 ~{cw}x{int(avg_h*1.8)}")
    print(f"  h1收获 ~{cw}x{int(avg_h*1.8)}")

if __name__ == "__main__":
    main()
