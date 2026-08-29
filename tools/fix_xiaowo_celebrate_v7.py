# -*- coding: utf-8 -*-
"""庆祝雪碧图 v11：用户确认【5 帧】，从源头正确抠图。

真相（前面 v4-v10 全部返工的根源）：
  1) 庆祝动画是 5 帧（源头 a06fb0d9.png 546x210 = 5 个角色块）；
  2) 角色用"深色上衣 + 浅灰(192)裤子/腿"绘制，而旧抠图阈值 COLOR_DIST_THR=60
     把与背景(212)色差仅 34.6 的浅色腿误当背景清掉 → "半个/三分之二个人"；
  3) 帧数切错（6/7 帧）→ 角色混入相邻帧。

v11：
  1) 源 = a06fb0d9.png，5 个角色块：x12-111, 114-211, 215-318, 320-427, 429-530
  2) 安全抠图：色差阈值 25（背景 212 清掉，角色浅灰 192 保留）+ BFS 遇角色停止
  3) 角色 bbox → 头顶对齐 y=0 + 水平居中 x=77 → 贴 155×254 → 输出 775×254（5×155）
  4) CSS：--xc-frame-count: 5，background-size 450px 100%（90×5），xc-play 5 段
"""
import os
from PIL import Image
from collections import Counter

SRC = r"c:\Users\29948\Desktop\workbuddy\a06fb0d9120edfc77b7fbbd72a1b016b.png"
OUT = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate-v11.png"

# 5 个角色块（原图 x 范围）
FRAME_BLOCKS = [(12, 111), (114, 211), (215, 318), (320, 427), (429, 530)]
TARGET_FRAME_W = 155
TARGET_FRAME_H = 254
CENTER_X = 77
HEAD_Y = 0
BG_THR = 25   # 背景色差阈值：<THR 视为背景清除；>=THR 视为角色保留并停止


def dist(c1, c2):
    return ((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2) ** 0.5


def safe_cutout(frame_img):
    """从边缘 flood-fill：色差<=BG_THR 且连通边缘 → 透明；遇角色色(>THR)停止不进入。"""
    fw, fh = frame_img.size
    fp = frame_img.load()
    border = []
    for x in range(fw):
        for y in (0, fh - 1):
            r, g, b, a = fp[x, y]
            if a > 0: border.append((r, g, b))
    for y in range(fh):
        for x in (0, fw - 1):
            r, g, b, a = fp[x, y]
            if a > 0: border.append((r, g, b))
    bg = Counter(border).most_common(1)[0][0]

    visited = [[False] * fw for _ in range(fh)]
    stack = []
    for x in range(fw):
        for y in (0, fh - 1):
            if not visited[y][x] and fp[x, y][3] > 0:
                visited[y][x] = True; stack.append((x, y))
    for y in range(fh):
        for x in (0, fw - 1):
            if not visited[y][x] and fp[x, y][3] > 0:
                visited[y][x] = True; stack.append((x, y))
    while stack:
        x, y = stack.pop()
        r, g, b, a = fp[x, y]
        if a <= 0: continue
        if dist((r, g, b), bg) <= BG_THR:
            fp[x, y] = (0, 0, 0, 0)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < fw and 0 <= ny < fh and not visited[ny][nx] and fp[nx, ny][3] > 0:
                    visited[ny][nx] = True
                    stack.append((nx, ny))
    return frame_img


def bbox_in_frame(frame_img):
    fw, fh = frame_img.size
    px = frame_img.load()
    min_x, min_y, max_x, max_y = fw, fh, -1, -1
    for y in range(fh):
        for x in range(fw):
            if px[x, y][3] > 30:
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y
    return (min_x, min_y, max_x, max_y) if max_x >= 0 else None


def main():
    if not os.path.exists(SRC):
        print("missing SRC:", SRC)
        return
    sheet = Image.open(SRC).convert("RGBA")
    print(f"source sheet {sheet.size}, 5 frames")

    aligned = []
    for i, (b0, b1) in enumerate(FRAME_BLOCKS):
        frame = sheet.crop((b0, 0, b1 + 1, sheet.size[1])).copy()
        frame = safe_cutout(frame)
        bb = bbox_in_frame(frame)
        if bb is None:
            print(f"frame {i}: EMPTY!")
            aligned.append(Image.new("RGBA", (TARGET_FRAME_W, TARGET_FRAME_H), (0, 0, 0, 0)))
            continue
        char = frame.crop(bb)
        cw = bb[2] - bb[0] + 1
        ch = bb[3] - bb[1] + 1
        paste_x = CENTER_X - cw // 2
        paste_y = HEAD_Y - bb[1]
        if paste_x < 0: paste_x = 0
        if paste_y < 0: paste_y = 0
        canvas = Image.new("RGBA", (TARGET_FRAME_W, TARGET_FRAME_H), (0, 0, 0, 0))
        canvas.paste(char, (paste_x, paste_y), char)
        aligned.append(canvas)
        print(f"frame {i}: char={cw}x{ch} paste=({paste_x},{paste_y})")

    new_sheet = Image.new("RGBA", (TARGET_FRAME_W * len(aligned), TARGET_FRAME_H), (0, 0, 0, 0))
    for i, c in enumerate(aligned):
        new_sheet.paste(c, (i * TARGET_FRAME_W, 0), c)
    new_sheet.save(OUT)
    print(f"saved -> {OUT} ({new_sheet.size}) = {len(aligned)} x {TARGET_FRAME_W}")

    px = new_sheet.load()
    print("\n[verify] 目标: 头顶Y=0 中心X≈77 角色完整")
    for i in range(len(aligned)):
        x0 = i * TARGET_FRAME_W
        mnx, mny, mxx, mxy = TARGET_FRAME_W, TARGET_FRAME_H, -1, -1
        cnt = 0
        for y in range(TARGET_FRAME_H):
            for x in range(x0, x0 + TARGET_FRAME_W):
                if px[x, y][3] > 30:
                    cnt += 1
                    cx, cy = x - x0, y
                    if cx < mnx: mnx = cx
                    if cy < mny: mny = cy
                    if cx > mxx: mxx = cx
                    if cy > mxy: mxy = cy
        center = (mnx + mxx) / 2
        print(f"frame {i}: 像素={cnt} bbox=({mnx},{mny},{mxx},{mxy}) 中心X={center:.1f} 高{mxy-mny+1}")


if __name__ == "__main__":
    main()
