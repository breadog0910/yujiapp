# -*- coding: utf-8 -*-
"""庆祝雪碧图 v7：从【完整的未对齐源】重新生成，不再丢失角色。

根因（v2/v3/v4 为什么"每帧只有半个/三分之二个人"）：
  原始 a06fb0d9.png 的角色用"深色上衣 + 浅色裤子/脸"绘制，
  浅色部分颜色≈背景浅灰(212,212,212)（色差 <60），被"背景色 flood-fill"抠图
  误当背景清掉 → 头部高光、腿、手全没，只剩深色上身。
  中间版本 xiaowo-celebrate.unaligned.png（672×254，每帧 112×254）是抠图后
  未经二次清理的版本，角色完整（每帧 ~2 万像素，与喝水 ~2.3 万接近），
  且 6 帧 bbox 顶部全部 y2、底部全部 y251（垂直天然对齐）。

本脚本：
  1) 源 = xiaowo-celebrate.unaligned.png（完整角色）
  2) 切 6 帧 → bbox 抠出完整角色
  3) 水平：角色中心 X → 77（155 画布中线），垂直：保持顶部 y2/底部 y251
     （6 帧天然一致，直接贴进 155×254 画布）
  4) 输出 930×254（与喝水/旧 CSS 完全兼容）
"""
import os
import shutil
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.unaligned.png"
OUT = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate-v7.png"

FRAME_COUNT = 6
SRC_FRAME_W = 112      # unaligned 源帧宽
TARGET_FRAME_W = 155   # 与喝水帧同宽
TARGET_FRAME_H = 254   # 与喝水帧同高
CENTER_X = 77
TOP_Y = 2              # 完整角色顶部原位置（6 帧一致）
BOTTOM_Y = 251         # 完整角色底部原位置


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
        cw = bb[2] - bb[0] + 1
        ch = bb[3] - bb[1] + 1
        # 水平：角色中心对齐画布中线；垂直：角色顶部对齐 TOP_Y（6 帧一致）
        paste_x = CENTER_X - cw // 2
        paste_y = TOP_Y - bb[1]
        if paste_x < 0: paste_x = 0
        if paste_y < 0: paste_y = 0
        canvas = Image.new("RGBA", (TARGET_FRAME_W, TARGET_FRAME_H), (0, 0, 0, 0))
        canvas.paste(char, (paste_x, paste_y), char)
        aligned.append(canvas)
        print(f"frame {i}: bbox={bb} size={cw}x{ch} paste=({paste_x},{paste_y})")

    new_sheet = Image.new("RGBA", (TARGET_FRAME_W * FRAME_COUNT, TARGET_FRAME_H), (0, 0, 0, 0))
    for i, c in enumerate(aligned):
        new_sheet.paste(c, (i * TARGET_FRAME_W, 0), c)
    new_sheet.save(OUT)
    print(f"saved -> {OUT} ({new_sheet.size})")

    # 校验：6 帧角色像素量、bbox 顶部/底部/中心一致性
    px = new_sheet.load()
    print("\n[verify]")
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
        center = (mnx + mxx) // 2
        print(f"frame {i}: 像素={cnt} 顶部Y={mny} 底部Y={mxy} 中心X={center}")


if __name__ == "__main__":
    main()
