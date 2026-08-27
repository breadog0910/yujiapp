# -*- coding: utf-8 -*-
"""把 xiaowo-drinking.png sprite sheet 的白底抠除成透明小人。

策略：
1) 从图片四边做 flood-fill，把连通到边缘的"白底"像素变透明；
2) 边缘抗锯齿像素按"白度"做半透明，避免出现白边；
3) 角色内部的白（眼白、水杯高光等）由于被非白像素包围，
   flood-fill 走不到，所以会被保留，不会误删。
"""
import os
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-drinking.png"
BACKUP = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-drinking.original.png"


def is_bg(px, x, y, w, h, tol=14):
    """白底判定：RGB 三通道都接近 255 即视为白底。tol 放宽些可吞掉抗锯齿。"""
    r, g, b, a = px[x, y]
    if a == 0:
        return True
    return r >= 255 - tol and g >= 255 - tol and b >= 255 - tol


def cutout(img, tol=14):
    w, h = img.size
    px = img.load()

    # 1) flood-fill 从四边出发，标记所有连通到边缘的"白底"像素
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
        # 边缘抗锯齿像素：alpha 按距纯白的距离做线性映射，
        # 越接近 255 越透明，让边缘平滑过渡而不是硬锯齿。
        if a == 0:
            continue
        # 三通道距 255 的最大距离 → 0..1
        d = max(255 - r, 255 - g, 255 - b) / float(tol) if tol else 1
        d = max(0.0, min(1.0, d))  # 0=纯白 1=刚好踩到 tol 阈值
        # 纯白 → alpha=0；边缘半白 → 半透明
        new_a = int(255 * d)
        if new_a == 0:
            px[x, y] = (0, 0, 0, 0)
        else:
            # 保留原 RGB，只改 alpha（让边缘像素保留颜色但变半透明）
            px[x, y] = (r, g, b, new_a)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] \
                    and is_bg(px, nx, ny, w, h, tol):
                visited[ny][nx] = True
                stack.append((nx, ny))
    return img


def main():
    if not os.path.exists(BACKUP):
        import shutil
        shutil.copy2(SRC, BACKUP)
        print(f"backed up original -> {BACKUP}")
    img = Image.open(SRC).convert("RGBA")
    print(f"loaded {img.size}")
    img = cutout(img, tol=14)
    img.save(SRC)
    print(f"saved cutout -> {SRC}")

    # 统计透明像素数量
    px = img.load()
    w, h = img.size
    trans = sum(1 for y in range(h) for x in range(w) if px[x, y][3] == 0)
    print(f"transparent pixels: {trans}/{w*h} ({100*trans/(w*h):.1f}%)")


if __name__ == "__main__":
    main()
