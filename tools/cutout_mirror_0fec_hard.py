# -*- coding: utf-8 -*-
"""
把抠图结果再做"硬边二值化"：所有半透明像素强制变成 0 或 255。
避免前端 SVG filter (#alpha-hard-edge) 把主体边缘的过渡像素误判为透明。
"""
import os
from PIL import Image

SRC = r"C:\Users\29948\Desktop\workbuddy\0fec7c5343a0ffd1e1b1b98a49ed41e1.png"
DST = r"C:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\mirror.png"
DEBUG = r"C:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\mirror-debug.png"

THRESHOLD = 240  # R/G/B 都 > THRESHOLD 视为白底


def is_white_bg(r, g, b, threshold=THRESHOLD):
    """三通道都接近 255 → 视为白底"""
    return min(r, g, b) >= threshold


def cutout_hard_edge(img, threshold=THRESHOLD):
    w, h = img.size
    px = img.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    opx = out.load()
    transparent = 0
    opaque = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                opx[x, y] = (0, 0, 0, 0)
                transparent += 1
                continue
            if is_white_bg(r, g, b, threshold):
                opx[x, y] = (0, 0, 0, 0)
                transparent += 1
            else:
                opx[x, y] = (r, g, b, 255)
                opaque += 1
    total = w * h
    print(f"  完全透明: {100*transparent/total:.1f}%  (白底)")
    print(f"  完全不透明: {100*opaque/total:.1f}%  (镜面/镜框主体)")
    return out


def main():
    print(f"[1/2] 硬边二值化抠图 (threshold={THRESHOLD})")
    img = Image.open(SRC).convert("RGBA")
    w, h = img.size
    print(f"  源图: {w}x{h}")
    out = cutout_hard_edge(img)
    out.save(DST)
    print(f"  保存 → {DST}")
    # 调试
    dbg = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dpx = dbg.load()
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = opx[x, y]
            if a == 0:
                dpx[x, y] = (255, 0, 0, 80)
            else:
                dpx[x, y] = (0, 200, 0, 255)
    dbg.save(DEBUG)
    print(f"  调试图 → {DEBUG}  (红=已抠, 绿=保留)")
    # bbox
    opx = out.load()
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if opx[x, y][3] == 255:
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y
    if max_x >= 0:
        bw, bh = max_x - min_x + 1, max_y - min_y + 1
        print(f"\n[2/2] 主体 bbox: ({min_x},{min_y}) - ({max_x},{max_y})  尺寸 {bw}x{bh}px  宽高比 {bh/bw:.2f}")


if __name__ == "__main__":
    main()
