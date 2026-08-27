# -*- coding: utf-8 -*-
"""田地 9 宫格图片：抠白底 + 9 块田精确位置识别 v2。

改进：
1) 背景是 252（不是 255），tol 调小；每次从备份还原再抠
2) 从 9 个已知中心出发做"土壤色洪水填充"识别每块田，避免误连木框
"""
import os
import shutil
from collections import deque
from PIL import Image

BACKUP = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\field-base-9grid.original.png"
SRC    = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\field-base-9grid.png"

# ---------- 1) 抠白底 ----------
def is_bg(r, g, b, a, tol=6):
    if a == 0: return True
    # 背景采样 RGBA(252,252,252,255)，距纯白=3，tol=6 足够覆盖抗锯齿边缘
    return r >= 255 - tol and g >= 255 - tol and b >= 255 - tol

def cutout(img, tol=6):
    w, h = img.size
    px = img.load()
    visited = [[False] * w for _ in range(h)]
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            if not visited[y][x] and is_bg(*px[x, y], tol):
                visited[y][x] = True; stack.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y][x] and is_bg(*px[x, y], tol):
                visited[y][x] = True; stack.append((x, y))
    while stack:
        x, y = stack.pop()
        r, g, b, a = px[x, y]
        if a == 0: continue
        d = max(255 - r, 255 - g, 255 - b) / float(tol) if tol else 1
        d = max(0.0, min(1.0, d))
        new_a = int(255 * d)
        if new_a == 0:
            px[x, y] = (0, 0, 0, 0)
        else:
            px[x, y] = (r, g, b, new_a)
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and is_bg(*px[nx, ny], tol):
                visited[ny][nx] = True; stack.append((nx, ny))
    return img

# ---------- 2) 9 块田识别 ----------
# 土壤主色采样：R≈190, G≈130, B≈80；木框更亮/偏黄。按相对阈值判定。
SOIL_REF = (192, 134, 82)   # 参考平均土壤色
def is_soil_close(r, g, b, a, dist_thr=45):
    if a < 150: return False
    return max(abs(r-SOIL_REF[0]), abs(g-SOIL_REF[1]), abs(b-SOIL_REF[2])) <= dist_thr

# 9 个田块中心（在原图 911x799 坐标系内，从颜色采样得到）
SEED_CENTERS = [
    # 0: 上中     1: 左上     2: 右上
    (455, 223), (273, 319), (637, 319),
    # 3: 左中     4: 正中     5: 右中
    (163, 423), (455, 423), (747, 423),
    # 6: 左下     7: 右下     8: 下中
    (273, 527), (637, 527), (455, 623),
]

def find_plot_from_seed(img, cx, cy, already):
    """从一个中心点出发，洪水填充连通的土壤像素，返回包围盒 + 像素集。"""
    w, h = img.size
    px = img.load()
    # 起点必须是土壤
    if not is_soil_close(*px[int(cx), int(cy)]):
        # 偏移一下再试
        for dx, dy in ((0,0),(-5,0),(5,0),(0,-5),(0,5)):
            nx, ny = int(cx)+dx, int(cy)+dy
            if 0 <= nx < w and 0 <= ny < h and is_soil_close(*px[nx, ny]):
                cx, cy = nx, ny; break
    visited_this = set()
    q = deque()
    q.append((int(cx), int(cy)))
    visited_this.add((int(cx), int(cy)))
    xs, ys = [int(cx)], [int(cy)]
    while q:
        x, y = q.popleft()
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h): continue
            if (nx, ny) in visited_this or (nx, ny) in already: continue
            if not is_soil_close(*px[nx, ny]): continue
            visited_this.add((nx, ny))
            already.add((nx, ny))
            q.append((nx, ny))
            xs.append(nx); ys.append(ny)
    if not xs: return None
    x1, x2 = min(xs), max(xs)
    y1, y2 = min(ys), max(ys)
    return {
        'x': x1, 'y': y1,
        'w': x2 - x1 + 1, 'h': y2 - y1 + 1,
        'cx': (x1 + x2) / 2, 'cy': (y1 + y2) / 2,
        'area': len(xs),
    }


def main():
    # 从备份还原（每次重新开始）
    shutil.copy2(BACKUP, SRC)
    print(f"[1/4] restored from backup: {BACKUP}")

    img = Image.open(SRC).convert("RGBA")
    w, h = img.size
    print(f"[2/4] image size = {w}x{h}")

    # 抠白底
    img = cutout(img, tol=6)
    img.save(SRC)
    px = img.load()
    trans = sum(1 for y in range(h) for x in range(w) if px[x, y][3] == 0)
    print(f"[2/4] cutout saved. transparent pixels = {100*trans/(w*h):.1f}%")

    # 识别 9 块田
    print("[3/4] 从 9 个中心出发识别田块...")
    already = set()
    plots = []
    for i, (cx, cy) in enumerate(SEED_CENTERS):
        p = find_plot_from_seed(img, cx, cy, already)
        if p is None:
            print(f"  idx {i}: FAIL 找不到土壤 (cx={cx},cy={cy})")
            continue
        p['idx'] = i
        plots.append(p)
        print(f"  idx {i}: left={p['x']:>3} top={p['y']:>3} w={p['w']:>3} h={p['h']:>3}  "
              f"cx={p['cx']:>6.1f} cy={p['cy']:>6.1f}  area={p['area']:>6}px")
    plots.sort(key=lambda p: p['idx'])

    # 推荐容器大小（按图片实际尺寸缩放至前端合适大小：约 300px 高）
    target_h = 300
    scale = target_h / h
    new_w = int(w * scale)
    new_h = target_h
    print(f"\n[4/4] === 输出配置 ===")
    print(f"原图尺寸: {w}x{h}")
    print(f"推荐 CSS 容器: .garden-plots {{ width: {new_w}px; height: {new_h}px; }}  (scale={scale:.3f})")
    print(f"\n推荐 tab3.js PLOT_LAYOUT 表（按 idx 映射，已按 scale 缩放）：")
    print("  const PLOT_LAYOUT = [")
    for p in plots:
        sl = round(p['x'] * scale, 1)
        st = round(p['y'] * scale, 1)
        sw = round(p['w'] * scale, 1)
        sh = round(p['h'] * scale, 1)
        print(f"    {{ left: {sl}, top: {st}, width: {sw}, height: {sh} }},  // idx {p['idx']}")
    print("  ];")

    # 同时打印作物 sprite 建议尺寸：每块田 w * ~85%, h * ~60%（因为作物站在田面上不是填满）
    print(f"\n推荐作物 sprite 显示尺寸（每块田的约 85% 宽 × 90% 高，底部对齐）：")
    for p in plots:
        sw = round(p['w'] * scale * 0.85, 0)
        sh = round(p['h'] * scale * 0.90, 0)
        print(f"  idx {p['idx']}: ~{int(sw)}x{int(sh)}px")


if __name__ == "__main__":
    main()
