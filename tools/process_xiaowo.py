# -*- coding: utf-8 -*-
"""处理小我走路动画帧 sprite sheet -> 4 帧透明 PNG"""
import os
from PIL import Image

GEN = r"C:\Users\29948\Desktop\workbuddy\generated-images"
OUT = r"C:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel"

SRC = r"A_horizontal_sprite_sheet_of_4_2026-08-26T10-05-37.png"
NAMES = ["xiaowo-walk-1", "xiaowo-walk-2", "xiaowo-walk-3", "xiaowo-walk-4"]


def background_color(img):
    w, h = img.size
    pts = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]
    rs = gs = bs = 0
    for p in pts:
        r, g, b = img.getpixel(p)[:3]
        rs += r; gs += g; bs += b
    return (rs // 4, gs // 4, bs // 4)


def is_bg(px, bg, tol=30):
    return all(abs(px[i] - bg[i]) <= tol for i in range(3))


def column_has_content(img, x, bg, tol=26):
    h = img.size[1]
    px = img.load()
    for y in range(h):
        if not is_bg(px[x, y][:3], bg, tol):
            return True
    return False


def transparentize_edge(img, bg, tol=32):
    w, h = img.size
    px = img.load()
    visited = [[False] * w for _ in range(h)]
    stack = []
    for x in range(w):
        if not visited[0][x] and is_bg(px[x, 0][:3], bg, tol):
            stack.append((x, 0)); visited[0][x] = True
        if not visited[h - 1][x] and is_bg(px[x, h - 1][:3], bg, tol):
            stack.append((x, h - 1)); visited[h - 1][x] = True
    for y in range(h):
        if not visited[y][0] and is_bg(px[0, y][:3], bg, tol):
            stack.append((0, y)); visited[y][0] = True
        if not visited[y][w - 1] and is_bg(px[w - 1, y][:3], bg, tol):
            stack.append((w - 1, y)); visited[y][w - 1] = True
    while stack:
        x, y = stack.pop()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                visited[ny][nx] = True
                if is_bg(px[nx, ny][:3], bg, tol):
                    stack.append((nx, ny))
    return img


def bbox_of_content(img):
    w, h = img.size
    px = img.load()
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 30:
                min_x = min(min_x, x); min_y = min(min_y, y)
                max_x = max(max_x, x); max_y = max(max_y, y)
    return (min_x, min_y, max_x, max_y)


img = Image.open(os.path.join(GEN, SRC)).convert("RGBA")
w, h = img.size
print(f"{SRC} {w}x{h}")
bg = background_color(img)
segs = []
cur = None
for x in range(w):
    has = column_has_content(img, x, bg)
    if has and cur is None:
        cur = x
    if not has and cur is not None:
        segs.append((cur, x - 1)); cur = None
if cur is not None:
    segs.append((cur, w - 1))
print("segs:", segs)

if len(segs) != len(NAMES):
    seg_w = w // len(NAMES)
    segs = [(i * seg_w, (i + 1) * seg_w - 1) for i in range(len(NAMES))]

for i, (sx, ex) in enumerate(segs):
    crop = img.crop((max(0, sx - 6), 0, min(w, ex + 6), h))
    crop = transparentize_edge(crop, bg, tol=30)
    px = crop.load()
    cw, ch = crop.size
    for y in range(ch):
        for x in range(cw):
            r, g, b, a = px[x, y]
            if a and r > 246 and g > 244 and b > 238:
                px[x, y] = (0, 0, 0, 0)
    b = bbox_of_content(crop)
    final = crop.crop(b)
    pad = 4
    canvas = Image.new("RGBA", (final.size[0] + pad * 2, final.size[1] + pad * 2), (0, 0, 0, 0))
    canvas.paste(final, (pad, pad))
    canvas.save(os.path.join(OUT, NAMES[i] + ".png"))
    print(f"[{NAMES[i]}] {canvas.size} saved")
print("DONE")
