# -*- coding: utf-8 -*-
"""田地 9 宫格：抠白底 v3（全像素遍历） + 基于 9 中心的精确 bbox。

思路：
1) 抠图：直接遍历所有像素，白色→透明（内部不会有纯白所以安全）
2) 9 块田 bbox：用 9 个已知中心 + 每块大小估算（等距菱形包围盒矩形）
3) 输出：缩放后的 CSS 容器尺寸 + tab3.js 查表式 plotPosition 配置
"""
import os
import shutil
from PIL import Image

BACKUP = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\field-base-9grid.original.png"
SRC    = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\field-base-9grid.png"

# ---------- 1) 全像素抠白底 ----------
BG_WHITE_TOL = 10  # 背景采样=252，tol=10 覆盖 245~255 区间
def cutout_all(img, tol=BG_WHITE_TOL):
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0: continue
            d_max = max(255 - r, 255 - g, 255 - b)
            if d_max <= tol:
                # 接近白 → 透明，边缘 d 越大越不透明
                ratio = d_max / tol if tol else 1.0
                new_a = int(255 * ratio)
                if new_a == 0:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    px[x, y] = (r, g, b, new_a)
    return img

# ---------- 2) 9 块田 bbox（基于 9 个中心点 + 每块尺寸估算） ----------
# 原图 911x799 坐标系下的 9 个中心（从颜色采样确认）
SEED_CENTERS = [
    # row0（视觉最上一行）: 上中 这一项其实在等距 3x3 里 col=1 row=0
    # 实际按 (col,row)→9 个中心重新对应：
    # 行 0 (上)   列0: (273, 271)? 让我们按 cx 排序分 3 列，按 cy 排序分 3 行
]

def build_9plots_bbox_manual(w, h):
    """按目测等距 3x3 估算。原图 911x799，9 个中心间距：
    Δcx(相邻列) ≈ 292 px (163→455→747)，Δcy(相邻行) ≈ 100 px (223→319→423→527→623)
    每块田矩形包围盒约 260w × 130h（约一格间距的 0.9 倍）
    """
    # 按从上到下，每行左→右顺序排列（符合 idx=0..8）
    # 等距 3x3 在屏幕坐标下的布局：
    #   row0 (最上一行的 3 个): 左 col0, 中 col1, 右 col2
    #   但是等距视觉上，真正的 3 行 3 列屏幕 cy 不同：
    centers = [
        # idx 0-2: 最上一行（cy 约 270 左右）—— 实际上 row=0 在等距坐标系
        (340, 270), (455, 225), (575, 270),
        # idx 3-5: 中间一行（cy 约 370）
        (225, 370), (365, 320), (495, 320), (635, 370),  # 不对，这样多了一个
    ]
    # 重新对应：真正的 3x3 等距。我放弃"等距行列号"，直接用 9 个实测中心：
    centers = [
        (455, 223),   # 0 最顶端
        (273, 319),   # 1 左上
        (637, 319),   # 2 右上
        (163, 423),   # 3 最左
        (455, 423),   # 4 正中
        (747, 423),   # 5 最右
        (273, 527),   # 6 左下
        (637, 527),   # 7 右下
        (455, 623),   # 8 最底端
    ]

    # 每块田的矩形包围盒尺寸（从图上目测每块土壤的宽高）
    # 水平方向上，每块田的水平宽度 ≈ 相邻 cx 差 × 0.9 = 292 * 0.9 ≈ 263
    # 垂直方向上，每块田的垂直高度 ≈ 相邻 cy 差 × 0.9 = 100 * 0.9 ≈ 90
    tile_w, tile_h = 260, 92  # 略微调紧一点避免重叠到木框

    plots = []
    for idx, (cx, cy) in enumerate(centers):
        x = int(cx - tile_w / 2)
        y = int(cy - tile_h / 2)
        plots.append({
            'idx': idx,
            'x': x, 'y': y, 'w': tile_w, 'h': tile_h,
            'cx': cx, 'cy': cy,
        })
    return plots


def main():
    # 从备份还原
    shutil.copy2(BACKUP, SRC)
    print(f"[1/3] restored backup -> {os.path.basename(SRC)}")

    img = Image.open(SRC).convert("RGBA")
    w, h = img.size
    print(f"[2/3] size: {w}x{h}")

    # 1) 抠白底
    img = cutout_all(img, tol=10)
    img.save(SRC)
    px = img.load()
    trans = sum(1 for y in range(h) for x in range(w) if px[x, y][3] == 0)
    print(f"[2/3] cutout saved. transparent: {100*trans/(w*h):.1f}%")

    # 2) 9 块田 bbox
    plots = build_9plots_bbox_manual(w, h)

    # 3) 缩放系数：约 300px 高度合适手机
    target_h = 290
    scale = target_h / h
    new_w = int(round(w * scale))
    new_h = target_h
    print(f"\n[3/3] === 前端配置输出 (scale={scale:.4f}) ===")
    print(f"原图: {w}x{h}px   →   前端容器: {new_w}x{new_h}px")
    print(f"\n>>> CSS .garden-plots")
    print(f"  width: {new_w}px; height: {new_h}px;")
    print(f"  top: 58%;   /* 再往下移一点，之前是 52% */")
    print(f"  transform: translate(-50%, 0);  /* 水平居中即可，不再垂直居中 */")
    print(f"\n>>> tab3.js plotPosition 查表（已缩放）：")
    print("  const PLOT_LAYOUT = [")
    for p in plots:
        sl = round(p['x'] * scale, 1)
        st = round(p['y'] * scale, 1)
        sw = round(p['w'] * scale, 1)
        sh = round(p['h'] * scale, 1)
        print(f"    {{ left: {sl:>6}, top: {st:>6}, width: {sw:>5}, height: {sh:>5} }},  // idx {p['idx']}")
    print("  ];")
    print(f"\n>>> 每格作物 sprite 目标尺寸约（占田格 85%×90%，底部对齐）：")
    for p in plots:
        sw = int(round(p['w'] * scale * 0.85))
        sh = int(round(p['h'] * scale * 0.90))
        print(f"  idx {p['idx']}: 作物 ~{sw}x{sh}px  (田格 {int(p['w']*scale)}x{int(p['h']*scale)}px)")
    avg_cw = int(sum(p['w'] for p in plots) / 9 * scale * 0.85)
    avg_ch = int(sum(p['h'] for p in plots) / 9 * scale * 0.90)
    print(f"  → 平均目标: ~{avg_cw}x{avg_ch}px（建议生成此尺寸 sprite，CSS 统一按宽高 100% 自适应）")


if __name__ == "__main__":
    main()
