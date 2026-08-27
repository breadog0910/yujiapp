# -*- coding: utf-8 -*-
"""田地 9 宫格图片：白底抠除 + 9 块田精确位置识别。

1) 抠除白底（flood-fill 从四边 + alpha 抗锯齿）
2) 分析 9 块土壤田的精确包围盒：
   - 先按"棕色土壤像素"阈值做二值化
   - 用连通域（connected components）找出 9 个田块
   - 输出每个田块的 left/top/width/height 以及相对容器的百分比位置
"""
import os
import sys
from PIL import Image
from collections import deque

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\field-base-9grid.png"
BACKUP = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\field-base-9grid.original.png"


# ---------- 1) 白底抠除 ----------
def is_bg(px, x, y, w, h, tol=16):
    r, g, b, a = px[x, y]
    if a == 0:
        return True
    return r >= 255 - tol and g >= 255 - tol and b >= 255 - tol


def cutout(img, tol=16):
    w, h = img.size
    px = img.load()
    visited = [[False] * w for _ in range(h)]
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            if not visited[y][x] and is_bg(px, x, y, w, h, tol):
                visited[y][x] = True
                stack.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y][x] and is_bg(px, x, y, w, h, tol):
                visited[y][x] = True
                stack.append((x, y))
    while stack:
        x, y = stack.pop()
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        d = max(255 - r, 255 - g, 255 - b) / float(tol) if tol else 1
        d = max(0.0, min(1.0, d))
        new_a = int(255 * d)
        if new_a == 0:
            px[x, y] = (0, 0, 0, 0)
        else:
            px[x, y] = (r, g, b, new_a)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] \
                    and is_bg(px, nx, ny, w, h, tol):
                visited[ny][nx] = True
                stack.append((nx, ny))
    return img


# ---------- 2) 9 块田位置识别 ----------
def is_soil(r, g, b, a):
    """土壤像素判定：棕色系（R 高，G 中，B 低）且不透明。"""
    if a < 80:
        return False
    # 木框也是棕色但更亮；木框与土壤都算"田地像素"用来做连通域
    return 80 <= r <= 230 and 40 <= g <= 180 and 15 <= b <= 140 and r > g and g > b


def find_plots_bbox(img):
    """返回 9 块田的 [{'idx','x','y','w','h','cx','cy'}] 按 idx 排序。"""
    w, h = img.size
    px = img.load()

    # 2a) 二值化 mask：土壤+木框 = 前景；其余透明/白 = 背景
    mask = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            mask[y][x] = is_soil(r, g, b, a)

    # 2b) 连通域（8 邻接）
    visited = [[False] * w for _ in range(h)]
    components = []  # list of [(x,y)...]
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0][x0] or visited[y0][x0]:
                continue
            q = deque()
            q.append((x0, y0))
            visited[y0][x0] = True
            comp = []
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not visited[ny][nx]:
                            visited[ny][nx] = True
                            q.append((nx, ny))
            components.append(comp)

    # 2c) 9 个最大连通域就是 9 块田（去掉极小噪点）
    components.sort(key=lambda c: -len(c))
    plots_comp = components[:9]

    # 2d) 求每个田的包围盒和中心
    plots = []
    for comp in plots_comp:
        xs = [p[0] for p in comp]
        ys = [p[1] for p in comp]
        x1, x2 = min(xs), max(xs)
        y1, y2 = min(ys), max(ys)
        plots.append({
            'x': x1,
            'y': y1,
            'w': x2 - x1 + 1,
            'h': y2 - y1 + 1,
            'cx': (x1 + x2) / 2,
            'cy': (y1 + y2) / 2,
        })

    # 2e) 等距 9 宫格排序：
    # 先按 cy 分 3 行（上/中/下），每行内部按 cx 排左→右
    plots.sort(key=lambda p: (round(p['cy'] / (h / 6)), p['cx']))
    for i, p in enumerate(plots):
        p['idx'] = i
    plots.sort(key=lambda p: p['idx'])
    return plots


def main():
    # 备份原图
    if not os.path.exists(BACKUP):
        import shutil
        shutil.copy2(SRC, BACKUP)
        print(f"[1/3] backed up original -> {BACKUP}")
    else:
        print(f"[1/3] backup already exists at {BACKUP}")

    # 抠图
    img = Image.open(SRC).convert("RGBA")
    w, h = img.size
    print(f"[2/3] loaded {w}x{h}")
    img = cutout(img, tol=16)
    img.save(SRC)

    px = img.load()
    trans = sum(1 for y in range(h) for x in range(w) if px[x, y][3] == 0)
    print(f"[2/3] saved cutout -> {SRC}  transparent={100*trans/(w*h):.1f}%")

    # 识别 9 块田
    plots = find_plots_bbox(img)
    print(f"\n[3/3] 9 块田精确位置 (图片坐标系 {w}x{h})：")
    print(f"{'idx':>3}  {'left':>5}  {'top':>5}  {'w':>4}  {'h':>4}  "
          f"{'cx%':>5}  {'cy%':>5}  {'w%':>5}  {'h%':>5}")
    for p in plots:
        cx_pct = 100 * p['cx'] / w
        cy_pct = 100 * p['cy'] / h
        w_pct = 100 * p['w'] / w
        h_pct = 100 * p['h'] / h
        print(f"{p['idx']:>3}  {p['x']:>5}  {p['y']:>5}  {p['w']:>4}  {p['h']:>4}  "
              f"{cx_pct:>5.2f}  {cy_pct:>5.2f}  {w_pct:>5.2f}  {h_pct:>5.2f}")

    # 推荐容器+坐标（方便粘贴进 tab3.js）：建议容器尺寸就用图片原始尺寸
    print(f"\n>>> 推荐 CSS: .garden-plots {{ width: {w}px; height: {h}px; }}")
    print(">>> 推荐 tab3.js plotPosition（按 idx 直接查表，等距识别最准）：")
    print("  const PLOT_LAYOUT = [")
    for p in plots:
        print(f"    {{ left: {p['x']}, top: {p['y']}, width: {p['w']}, height: {p['h']} }},  // idx {p['idx']}")
    print("  ];")


if __name__ == "__main__":
    main()
