# -*- coding: utf-8 -*-
"""庆祝雪碧图 v8：与喝水小人【同位置 + 同身材】。

用户反馈"整体要再往左移"：
  喝水角色帧内中心 x≈46.5（显示在容器偏左 27px 处），
  庆祝 v7 角色中心 x=76（显示居中 44px）→ 切换动作时小人右移 17px；
  且庆祝角色高 250 vs 喝水 172 → 庆祝小人还大 45%。

v8 修复：
  1) 源 = xiaowo-celebrate.unaligned.png（完整角色，高 250）
  2) 等比缩放到身高 172（= 喝水角色高度，缩小不糊，像素风安全）
  3) 水平：角色中心对齐帧内 x=46.5（= 喝水角色中心）
  4) 垂直：角色底部贴 y=251（= 喝水角色脚底，贴地）
  → 显示时庆祝小人 = 喝水小人的位置与大小，动作切换无缝衔接。
"""
import os
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.unaligned.png"
OUT = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate-v8.png"

FRAME_COUNT = 6
SRC_FRAME_W = 112
TARGET_FRAME_W = 155
TARGET_FRAME_H = 254
CHAR_H = 172            # 目标身高 = 喝水角色高
CHAR_CENTER_X = 46.5    # 目标中心 X = 喝水角色中心（帧内坐标）
FOOT_Y = 251            # 目标脚底 Y = 喝水角色脚底


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
        nh = CHAR_H
        char = char.resize((nw, nh), Image.NEAREST)
        paste_x = int(round(CHAR_CENTER_X - nw / 2))
        paste_y = FOOT_Y - nh + 1  # 底部对齐 FOOT_Y
        if paste_x < 0: paste_x = 0
        if paste_y < 0: paste_y = 0
        canvas = Image.new("RGBA", (TARGET_FRAME_W, TARGET_FRAME_H), (0, 0, 0, 0))
        canvas.paste(char, (paste_x, paste_y), char)
        aligned.append(canvas)
        print(f"frame {i}: src_bbox={bb} scale={scale:.3f} -> {nw}x{nh} paste=({paste_x},{paste_y})")

    new_sheet = Image.new("RGBA", (TARGET_FRAME_W * FRAME_COUNT, TARGET_FRAME_H), (0, 0, 0, 0))
    for i, c in enumerate(aligned):
        new_sheet.paste(c, (i * TARGET_FRAME_W, 0), c)
    new_sheet.save(OUT)
    print(f"saved -> {OUT} ({new_sheet.size})")

    # 校验：与喝水角色对比（喝水 bbox x8-85 y80-251 中心46.5 高172）
    px = new_sheet.load()
    print("\n[verify] 目标: 中心X≈46.5 顶部Y≈80 底部Y≈251 (同喝水)")
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
