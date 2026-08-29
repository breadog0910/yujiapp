# -*- coding: utf-8 -*-
"""庆祝雪碧图 v9：完全按"图片宽度等量切分"思路重做。

用户反馈："还是不对，根据图片宽度等量切分不就行了"。
之前 v7/v8 做了"抠角色→缩到喝水大小→左对齐"等复杂处理，方向不对。

v9 思路（最直观的等量切分）：
  1) 源 = xiaowo-celebrate.unaligned.png（每帧角色完整、占满帧宽 112px、
     6 帧位置天然一致——这就是"等量切分就能用"的素材）
  2) 切 6 帧 → bbox 抠出完整角色
  3) 等比缩放到高 200px（能完整放进 155×254 帧；NEAREST 缩小不糊）
  4) 贴回 155×254 帧：水平居中（中心 x=77.5），垂直底部贴地（脚底 y=251）
  5) 拼回 930×254（= 6 × 155px 等量切分），CSS 保持 background-size 540px
     + background-position -90px 步进，显示时角色居中、完整、无裁切
"""
import os
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.unaligned.png"
OUT = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate-v9.png"

FRAME_COUNT = 6
SRC_FRAME_W = 112
TARGET_FRAME_W = 155
TARGET_FRAME_H = 254
CHAR_H = 200            # 目标身高（完整放入 254 高画布，脚底贴地）
CENTER_X = 77           # 水平居中
FOOT_Y = 251            # 脚底贴地


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

    aligned = []
    for i in range(FRAME_COUNT):
        x0 = i * SRC_FRAME_W
        frame = sheet.crop((x0, 0, x0 + SRC_FRAME_W, TARGET_FRAME_H))
        bb = bbox_in_frame(frame)
        if bb is None:
            print(f"frame {i}: EMPTY!")
            aligned.append(Image.new("RGBA", (TARGET_FRAME_W, TARGET_FRAME_H), (0, 0, 0, 0)))
            continue
        char = frame.crop(bb)
        ch = bb[3] - bb[1] + 1
        scale = CHAR_H / ch
        nw = max(1, int(round(char.size[0] * scale)))
        char = char.resize((nw, CHAR_H), Image.NEAREST)
        paste_x = CENTER_X - nw // 2          # 水平居中
        paste_y = FOOT_Y - CHAR_H + 1         # 脚底贴 FOOT_Y
        if paste_x < 0: paste_x = 0
        if paste_y < 0: paste_y = 0
        canvas = Image.new("RGBA", (TARGET_FRAME_W, TARGET_FRAME_H), (0, 0, 0, 0))
        canvas.paste(char, (paste_x, paste_y), char)
        aligned.append(canvas)
        print(f"frame {i}: src_bbox={bb} scale={scale:.3f} -> {nw}x{CHAR_H} paste=({paste_x},{paste_y})")

    new_sheet = Image.new("RGBA", (TARGET_FRAME_W * FRAME_COUNT, TARGET_FRAME_H), (0, 0, 0, 0))
    for i, c in enumerate(aligned):
        new_sheet.paste(c, (i * TARGET_FRAME_W, 0), c)
    new_sheet.save(OUT)
    print(f"saved -> {OUT} ({new_sheet.size})")

    px = new_sheet.load()
    print("\n[verify] 目标: 中心X≈77 顶部/底部一致 角色完整")
    for i in range(FRAME_COUNT):
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
