# -*- coding: utf-8 -*-
"""v3: 先检查源图实际背景色值，再做抠图 + 微调 9 格位置"""
import os
from PIL import Image, ImageDraw

SRC_IMG = r"c:\Users\29948\Desktop\workbuddy\9023197a78e18cf96264fe5ff9fb5a15.png"
DST_IMG = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\field-base-9grid.png"
DEBUG_IMG = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\_debug_grid.png"

def inspect_bg(img):
    """检查四角和边框的像素颜色"""
    w, h = img.size
    px = img.load()
    print(f"  图像尺寸: {w}x{h}")
    corners = [
        ('左上', 0, 0),
        ('右上', w-1, 0),
        ('左下', 0, h-1),
        ('右下', w-1, h-1),
        ('上中', w//2, 0),
        ('下中', w//2, h-1),
        ('左中', 0, h//2),
        ('右中', w-1, h//2),
    ]
    bg_colors = []
    print("  背景采样 (角落/边框像素):")
    for name, x, y in corners:
        r,g,b,a = px[x,y]
        print(f"    {name} ({x:>3},{y:>3}): RGBA=({r},{g},{b},{a})")
        bg_colors.append((r,g,b))
    # 再取边框附近一些
    for step in [5, 10, 20, 50, 100]:
        for x, y in [(step, step), (w-1-step, step), (step, h-1-step), (w-1-step, h-1-step)]:
            r,g,b,a = px[x,y]
            bg_colors.append((r,g,b))
            if step == 5:
                print(f"    边缘 ({x:>3},{y:>3}): ({r},{g},{b},{a})")
    # 计算最小与最大通道值，确定抠图范围
    mins = [min(c[i] for c in bg_colors) for i in range(3)]
    maxs = [max(c[i] for c in bg_colors) for i in range(3)]
    print(f"  背景通道范围: R[{mins[0]}-{maxs[0]}], G[{mins[1]}-{maxs[1]}], B[{mins[2]}-{maxs[2]}]")
    return mins, maxs

def cutout_by_range(img, r_min, g_min, b_min):
    """把 RGB 都 >= 阈值 的像素当背景设为透明，带边缘渐变"""
    w, h = img.size
    px = img.load()
    tol_add = 10  # 在阈值之上加渐变带
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0: continue
            # 各通道与背景最低值的距离
            dr = r - r_min
            dg = g - g_min
            db = b - b_min
            d_min = min(dr, dg, db)
            if d_min < 0:
                continue  # 比背景最低值还低 → 不是背景
            if d_min <= tol_add:
                # 在渐变带：越小越透明
                ratio = d_min / tol_add if tol_add else 0
                # 越接近1越透明
                alpha = int(255 * (1 - ratio))
                if alpha == 0:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    px[x, y] = (r, g, b, alpha)
            else:
                # 完全是背景
                px[x, y] = (0, 0, 0, 0)
    return img

def build_bbox(w, h):
    """根据调试图进一步微调 9 个中心 + 包围盒尺寸，让每块框精确贴合土壤内部（避开木框）"""
    # 调试图 v2 看起来各中心略偏上，且 tile 高度略大；让我按以下值微调：
    # 图中每块土壤在 x 方向（水平宽度）约 220-240；y 方向（垂直高度）约 85
    # 中心位置基于调试图视觉微调：
    centers = [
        (455, 246),   # 0 最顶端：原来238，往下+8
        (310, 332),   # 1 左上：+7
        (610, 332),   # 2 右上：+7
        (172, 433),   # 3 最左：cx-3, cy+13（调试图橙框略偏右略偏上）
        (455, 432),   # 4 正中：+12
        (753, 433),   # 5 最右：cx+3, cy+13
        (310, 538),   # 6 左下：cy+13
        (610, 538),   # 7 右下：cy+13
        (455, 638),   # 8 最底端：cy+18
    ]
    TW, TH = 230, 82  # 每格包围盒略收紧，避开木框
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
    print("[1/4] 检查源图背景实际颜色")
    img = Image.open(SRC_IMG).convert("RGBA")
    w, h = img.size
    rng = inspect_bg(img)
    r_min, g_min, b_min = rng[0]
    print(f"  → 将以 R>={r_min}, G>={g_min}, B>={b_min} 判定为背景")

    print("\n[2/4] 执行抠图")
    img = cutout_by_range(img, r_min, g_min, b_min)
    img.save(DST_IMG)
    px = img.load()
    trans = sum(1 for y in range(h) for x in range(w) if px[x, y][3] == 0)
    total = w * h
    print(f"  保存 → {os.path.basename(DST_IMG)}")
    print(f"  完全透明: {100*trans/total:.1f}%")
    semi = sum(1 for y in range(h) for x in range(w) if 0 < px[x,y][3] < 255)
    print(f"  半透明边缘: {100*semi/total:.1f}%")
    opaque = total - trans - semi
    print(f"  不透明主体: {100*opaque/total:.1f}%")

    print("\n[3/4] 生成 9 宫格 bbox + 调试图")
    plots = build_bbox(w, h)
    for p in plots:
        pw = p['x2'] - p['x1'] + 1
        ph = p['y2'] - p['y1'] + 1
        print(f"  idx{p['idx']}: ({p['cx']},{p['cy']}) {pw}x{ph}")
    draw_debug(img, plots, DEBUG_IMG)

    print("\n[4/4] 前端配置")
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
    print(f"  top: 63%;")
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
    print(f"作物目标尺寸(平均田格 ~{avg_w:.0f}x{avg_h:.0f}px):")
    cw = int(avg_w*0.86)
    print(f"  s1破土 {cw}x{int(avg_h*0.55)}")
    print(f"  s2生长 {cw}x{int(avg_h*1.0)}")
    print(f"  s3繁茂 {cw}x{int(avg_h*1.2)}")
    print(f"  s4将熟 {cw}x{int(avg_h*1.7)}")
    print(f"  h1收获 {cw}x{int(avg_h*1.7)}")
    print(f"  生成建议: 统一透明画布 {cw}x{int(avg_h*1.7)}px, 底部对齐绘制")

if __name__ == "__main__":
    main()
