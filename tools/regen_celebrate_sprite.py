# -*- coding: utf-8 -*-
"""
重新生成庆祝精灵图：使用颜色阈值 + 边缘泛洪双重去除背景，
然后按**每帧自己的脚底中心**对齐到155×254画布，确保每帧的脚底中心
都位于画布的同一位置，完全消除左右位移。
"""
import os, base64
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\a06fb0d9120edfc77b7fbbd72a1b016b.png"
DST = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.png"
FRAME_COUNT = 6

# 目标画布尺寸（与喝水帧完全一致）
TARGET_W = 155
TARGET_H = 254
PAD = 2
EDGE_ALPHA = 30
FOOT_BAND_RATIO = 0.12

# ===== Step 1: 颜色阈值去除背景 =====
def remove_gray_bg(img, gray_tol=30):
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            is_light_gray = abs(r - 212) <= gray_tol and abs(g - 212) <= gray_tol and abs(b - 212) <= gray_tol
            is_dark_gray = abs(r - 42) <= gray_tol and abs(g - 42) <= gray_tol and abs(b - 42) <= gray_tol
            if is_light_gray or is_dark_gray:
                px[x, y] = (0, 0, 0, 0)
    return img

# ===== Step 2: 边缘泛洪（二次清理） =====
def flood_fill_edges(img):
    px = img.load()
    w, h = img.size
    visited = [[False] * h for _ in range(w)]
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            if px[x, y][3] > 0 and not visited[x][y]:
                visited[x][y] = True
                stack.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if px[x, y][3] > 0 and not visited[x][y]:
                visited[x][y] = True
                stack.append((x, y))
    while stack:
        x, y = stack.pop()
        if px[x, y][3] <= 0:
            continue
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                if px[nx, ny][3] > 0:
                    visited[nx][ny] = True
                    stack.append((nx, ny))
    return img

# ===== Step 3: 边界框 =====
def bbox(img):
    w, h = img.size
    p = img.load()
    mnx, mny, mxx, mxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if p[x, y][3] > EDGE_ALPHA:
                if x < mnx: mnx = x
                if y < mny: mny = y
                if x > mxx: mxx = x
                if y > mxy: mxy = y
    return (mnx, mny, mxx, mxy) if mxx >= 0 else None

# ===== Step 4: 脚底中心 =====
def foot_center_x(frame_img, bb):
    cx0, cy0, cx1, cy1 = bb
    ch = cy1 - cy0 + 1
    band_h = max(2, int(ch * FOOT_BAND_RATIO))
    by0 = cy1 - band_h + 1
    p = frame_img.load()
    xs = []
    for y in range(by0, cy1 + 1):
        for x in range(cx0, cx1 + 1):
            if p[x, y][3] > EDGE_ALPHA:
                xs.append(x)
    if not xs:
        return (cx0 + cx1) // 2
    xs.sort()
    return xs[len(xs) // 2]

# ===== MAIN =====
print("=" * 60)
print("庆祝精灵图再生脚本（每帧脚底中心独立对齐）")
print("=" * 60)

print("\nStep 1/4: 颜色阈值去除背景...")
img = Image.open(SRC).convert("RGBA")
img = remove_gray_bg(img, gray_tol=30)
w, h = img.size
transparent = sum(1 for y in range(h) for x in range(w) if img.getpixel((x, y))[3] == 0)
print(f"  颜色去除后透明占比: {100 * transparent / (w * h):.1f}%")

print("Step 2/4: 边缘泛洪二次清理...")
img = flood_fill_edges(img)
transparent2 = sum(1 for y in range(h) for x in range(w) if img.getpixel((x, y))[3] == 0)
print(f"  泛洪后透明占比: {100 * transparent2 / (w * h):.1f}%")

print("Step 3/4: 切帧 + 脚底中心对齐...")
W, H = img.size
FW = W // FRAME_COUNT

# 计算每帧的脚底中心
foot_centers = []
for i in range(FRAME_COUNT):
    x0 = i * FW
    frame = img.crop((x0, 0, x0 + FW, H))
    bb = bbox(frame)
    if bb:
        fc_x = foot_center_x(frame, bb)
        foot_centers.append((fc_x, bb[3], bb[0], bb[1]))
        print(f"  Frame {i}: bbox={bb}, foot_center_x={fc_x}, foot_y={bb[3]}")
    else:
        foot_centers.append(None)
        print(f"  Frame {i}: EMPTY")

print("Step 4/4: 贴入 155x254 画布（每帧脚底中心对齐到同一位置）...")
CANVAS_W = TARGET_W
CANVAS_H = TARGET_H
ANCHOR_X_TARGET = CANVAS_W // 2  # 77
ANCHOR_Y_TARGET = CANVAS_H - PAD  # 252

frames = []
for i in range(FRAME_COUNT):
    x0 = i * FW
    frame = img.crop((x0, 0, x0 + FW, H))
    bb = bbox(frame)
    if not bb:
        canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
        frames.append(canvas)
        print(f"  Frame {i}: EMPTY -> 空白")
        continue
    
    char = frame.crop(bb)
    cx0, cy0, cx1, cy1 = bb
    fc_x = foot_centers[i][0]
    foot_y = cy1
    
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    # 关键：使用每帧自己的脚底中心 fc_x，而不是统一的中位数
    # 这样每帧的脚底中心都会位于 ANCHOR_X_TARGET
    paste_x = ANCHOR_X_TARGET - (fc_x - cx0)
    paste_y = ANCHOR_Y_TARGET - (foot_y - cy0)
    
    canvas.paste(char, (paste_x, paste_y), char)
    frames.append(canvas)
    print(f"  Frame {i}: char={char.size}, paste=({paste_x},{paste_y}), fc_x={fc_x}")

# 合成最终 sprite sheet
out = Image.new("RGBA", (CANVAS_W * FRAME_COUNT, CANVAS_H), (0, 0, 0, 0))
for i, c in enumerate(frames):
    out.paste(c, (i * CANVAS_W, 0), c)
out.save(DST)
print(f"\n✅ 最终 sprite -> {DST} ({out.size})")

assert out.size == (930, 254), f"FAIL: 需要 930x254 但得到 {out.size}"

# 自检：验证每帧的脚底中心是否在画布同一位置
print("\n[verify] 每帧脚底中心在画布中的位置（应一致）:")
px = out.load()
for i in range(FRAME_COUNT):
    x0 = i * CANVAS_W
    # 找到脚底区域（底部 12% 高度）
    by0 = CANVAS_H - max(2, int(CANVAS_H * FOOT_BAND_RATIO))
    xs = []
    for y in range(by0, CANVAS_H):
        for x in range(x0, x0 + CANVAS_W):
            if px[x, y][3] > EDGE_ALPHA:
                xs.append(x - x0)  # 相对画布坐标
    if xs:
        xs.sort()
        fc = xs[len(xs) // 2]
        print(f"  Frame {i}: 脚底中心在画布 x={fc}")
    else:
        print(f"  Frame {i}: 无脚底像素")

# 生成 base64
print("\n[生成 base64 data URI]")
with open(DST, "rb") as f:
    b64_data = base64.b64encode(f.read()).decode()
data_uri = f"data:image/png;base64,{b64_data}"
print(f"  Base64 长度: {len(b64_data)}")

with open(r"c:\Users\29948\Desktop\workbuddy\tools\_celebrate_b64_new.txt", "w") as f:
    f.write(data_uri)
print("  ✅ 已保存到 tools/_celebrate_b64_new.txt")
