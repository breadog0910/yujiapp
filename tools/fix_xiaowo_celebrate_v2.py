# -*- coding: utf-8 -*-
"""庆祝雪碧图 v6：头顶对齐(垂直) + bbox 中心对齐(水平)，保留跳跃离地感。

v5 的教训（为什么"脚底对齐"不行）：
庆祝是"跳跃"动作，6 帧角色高度差异大（107~172px）：
  站立帧 bbox 底贴地(≈251)，空中收腿帧 bbox 底离地(187~200)。
v5 把所有帧的 bbox 底都贴到画布底部 252：
  站立帧头顶 80，空中帧头顶被推到 132 → 播放时头顶上下跳 52px，
  视觉上就是"小人不在同一个位置/上下飘"。

正确对齐：
  垂直：所有帧【头顶(box 顶)对齐到 y=80】——跳跃时头顶稳定，
        空中帧脚自然离地（保留跳跃感）；
  水平：所有帧【bbox 中心 X 对齐到 77】——庆祝各帧手势/身体宽度不同，
        bbox 中心比脚底中位数稳（celebrate_match_drinking_1to1.py 注释
        也明确指出 bbox 中心对齐才是正确做法，但旧版未生效）。
  不缩放：姿态差异（站立/屈膝/收腿）是动作本身，保留原比例。
"""
import os
import shutil
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate-v4.buggy_backup.png"
OUT = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate-v6.png"

FRAME_COUNT = 6
FRAME_W = 155
FRAME_H = 254
ALPHA_MIN = 60
HEAD_TARGET_Y = 80      # 头顶对齐高度（站立帧头顶 y=80）
CENTER_TARGET_X = 77    # bbox 中心对齐 X（155/2 ≈ 77）


def keep_largest_connected(frame_img):
    w, h = frame_img.size
    px = frame_img.load()
    visited = [[False] * w for _ in range(h)]
    regions = []
    for sy in range(h):
        for sx in range(w):
            if visited[sy][sx] or px[sx, sy][3] < ALPHA_MIN:
                continue
            stack = [(sx, sy)]
            visited[sy][sx] = True
            cells = []
            while stack:
                x, y = stack.pop()
                cells.append((x, y))
                for dx, dy in ((-1, -1), (0, -1), (1, -1), (-1, 0),
                               (1, 0), (-1, 1), (0, 1), (1, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] \
                            and px[nx, ny][3] >= ALPHA_MIN:
                        visited[ny][nx] = True
                        stack.append((nx, ny))
            regions.append(cells)
    if not regions:
        return frame_img
    keep = set(max(regions, key=len))
    cleared = frame_img.copy()
    cp = cleared.load()
    for y in range(h):
        for x in range(w):
            if (x, y) not in keep:
                r, g, b, a = cp[x, y]
                cp[x, y] = (r, g, b, 0)
    return cleared


def bbox_in_frame(frame_img):
    w, h = frame_img.size
    px = frame_img.load()
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
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
    print(f"source sheet {sheet.size}")

    frames = []
    for i in range(FRAME_COUNT):
        frame = sheet.crop((i * FRAME_W, 0, (i + 1) * FRAME_W, FRAME_H))
        frames.append(keep_largest_connected(frame))

    aligned = []
    for i, frame in enumerate(frames):
        bb = bbox_in_frame(frame)
        if bb is None:
            print(f"frame {i}: EMPTY!")
            aligned.append(Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0)))
            continue
        char = frame.crop(bb)
        cw = bb[2] - bb[0] + 1
        ch = bb[3] - bb[1] + 1
        paste_x = CENTER_TARGET_X - cw // 2
        paste_y = HEAD_TARGET_Y  # 角色顶部（char 的 y=0 行）贴在画布 y=HEAD_TARGET_Y
        if paste_x < 0: paste_x = 0
        if paste_y < 0: paste_y = 0
        canvas = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
        canvas.paste(char, (paste_x, paste_y), char)
        aligned.append(canvas)
        print(f"frame {i}: bbox={bb} size={cw}x{ch} paste=({paste_x},{paste_y}) "
              f"-> 头顶Y={paste_y} 中心X={paste_x + cw // 2}")

    new_sheet = Image.new("RGBA", (FRAME_W * FRAME_COUNT, FRAME_H), (0, 0, 0, 0))
    for i, c in enumerate(aligned):
        new_sheet.paste(c, (i * FRAME_W, 0), c)
    new_sheet.save(OUT)
    print(f"saved -> {OUT} ({new_sheet.size})")

    # 校验：头顶 Y 应 = 80，bbox 中心 X 应 ≈ 77
    px = new_sheet.load()
    print("\n[verify]")
    ok = True
    for i in range(FRAME_COUNT):
        x0 = i * FRAME_W
        mnx, mny, mxx, mxy = FRAME_W, FRAME_H, -1, -1
        for y in range(FRAME_H):
            for x in range(x0, x0 + FRAME_W):
                if px[x, y][3] > 30:
                    cx, cy = x - x0, y
                    if cx < mnx: mnx = cx
                    if cy < mny: mny = cy
                    if cx > mxx: mxx = cx
                    if cy > mxy: mxy = cy
        head = mny
        center = (mnx + mxx) // 2
        hflag = 'OK' if head == HEAD_TARGET_Y else ('WARN' if abs(head - HEAD_TARGET_Y) <= 2 else 'FAIL')
        cflag = 'OK' if abs(center - CENTER_TARGET_X) <= 2 else 'FAIL'
        if hflag != 'OK' or cflag != 'OK': ok = False
        print(f"frame {i}: 头顶Y={head} ({hflag}) 中心X={center} ({cflag}) 脚底Y={mxy}")
    print("RESULT:", "ALIGNED OK" if ok else "NEEDS ATTENTION")


if __name__ == "__main__":
    main()
