# -*- coding: utf-8 -*-
"""
把 AI 生成的像素 sprite sheet 切割为独立透明 PNG + 整理背景图。
- 白色背景通过边缘 flood-fill 转为透明
- 每个 sprite 自动检测列边界并裁剪包围盒
"""
import os
from PIL import Image, ImageDraw

GEN = r"C:\Users\29948\Desktop\workbuddy\generated-images"
OUT = r"C:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel"
os.makedirs(OUT, exist_ok=True)

SHEETS = [
    (r"A_horizontal_sprite_sheet_of_7_2026-08-26T09-59-57.png",
     ["bed", "sofa", "chair", "table", "shelf", "lamp", "candle"]),
    (r"A_horizontal_sprite_sheet_of_7_2026-08-26T10-02-50.png",
     ["plant", "flowers", "painting", "clock", "teddy", "cat", "books"]),
    (r"A_horizontal_sprite_sheet_of_7_2026-08-26T10-03-08.png",
     ["radio", "tea", "basket", "rug", "piggy", "letter", "window"]),
]

BG_MAP = [
    (r"A_pixel_art_interior_room_scen_2026-08-26T10-03-24.png", "bg-day.png"),
    (r"A_pixel_art_interior_room_scen_2026-08-26T10-03-47.png", "bg-dusk.png"),
    (r"A_pixel_art_interior_room_scen_2026-08-26T10-04-03.png", "bg-night.png"),
]


def background_color(img):
    """取四角颜色均值作为背景色"""
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
    """该列是否存在非背景像素"""
    h = img.size[1]
    px = img.load()
    for y in range(h):
        if not is_bg(px[x, y][:3], bg, tol):
            return True
    return False


def transparentize_edge(img, bg, tol=32):
    """从四边 flood-fill：把与背景色接近且边缘可达的像素变透明"""
    w, h = img.size
    px = img.load()
    visited = [[False] * w for _ in range(h)]
    stack = []
    # 四边入栈
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
    """计算非透明像素的包围盒"""
    w, h = img.size
    px = img.load()
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 30:
                min_x = min(min_x, x); min_y = min(min_y, y)
                max_x = max(max_x, x); max_y = max(max_y, y)
    return (min_x, min_y, max_x, max_y)


def split_sheet(path, names):
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    print(f"== {path}  {w}x{h}")

    # 1) 找列边界（连续的有内容列段）
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
    print("   内容列段:", segs)

    # 若段数 != 数量，按数量平均切（兜底）
    if len(segs) != len(names):
        seg_w = w // len(names)
        segs = [(i * seg_w, (i + 1) * seg_w - 1) for i in range(len(names))]
        print("   平均切:", segs)

    for i, (sx, ex) in enumerate(segs):
        name = names[i]
        crop = img.crop((max(0, sx - 6), 0, min(w, ex + 6), h))
        crop = transparentize_edge(crop, bg, tol=30)
        # 二次透明：把残余的近白像素也去掉
        px = crop.load()
        cw, ch = crop.size
        for y in range(ch):
            for x in range(cw):
                r, g, b, a = px[x, y]
                if a and r > 246 and g > 244 and b > 238:
                    px[x, y] = (0, 0, 0, 0)
        b = bbox_of_content(crop)
        if b[2] < 0:
            print(f"   [{name}] EMPTY, skip"); continue
        final = crop.crop(b)
        # 加 4px 透明边距
        pad = 4
        canvas = Image.new("RGBA", (final.size[0] + pad * 2, final.size[1] + pad * 2), (0, 0, 0, 0))
        canvas.paste(final, (pad, pad))
        canvas.save(os.path.join(OUT, f"{name}.png"))
        print(f"   [{name}]  {canvas.size}  saved")


def copy_bg(src, dst):
    img = Image.open(os.path.join(GEN, src)).convert("RGB")
    # 统一高度 900px，宽度等比（保持清晰度）
    w, h = img.size
    target_h = 900
    nw = round(w * target_h / h)
    img = img.resize((nw, target_h), Image.NEAREST)
    img.save(os.path.join(OUT, dst))
    print(f"BG {dst}  {img.size}")


for path, names in SHEETS:
    split_sheet(os.path.join(GEN, path), names)

for src, dst in BG_MAP:
    copy_bg(src, dst)

print("DONE")
