# -*- coding: utf-8 -*-
"""把已对齐的横向 sprite sheet 转成纵向（6 帧竖排，每帧一行）。

横向 930×254 → 纵向 155×1524（每帧 155×254）。
CSS 同步改为 background-size: 100% 600% + 背景位置 Y 方向步进。
"""
import os
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-drinking.png"
H_BACKUP = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-drinking.horizontal.png"
FRAME_COUNT = 6


def main():
    # 备份当前横向版本
    if not os.path.exists(H_BACKUP):
        import shutil
        shutil.copy2(SRC, H_BACKUP)
        print(f"backed up horizontal -> {H_BACKUP}")

    sheet = Image.open(SRC).convert("RGBA")
    w, h = sheet.size
    frame_w = w // FRAME_COUNT
    frame_h = h
    print(f"horizontal sheet {w}x{h}, frame={frame_w}x{frame_h}")

    # 切 6 帧竖向堆叠
    frames = [sheet.crop((i * frame_w, 0, (i + 1) * frame_w, frame_h)) for i in range(FRAME_COUNT)]
    new_h = frame_h * FRAME_COUNT
    vertical = Image.new("RGBA", (frame_w, new_h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        vertical.paste(f, (0, i * frame_h), f)

    vertical.save(SRC)
    print(f"saved vertical sheet -> {SRC} ({vertical.size})")


if __name__ == "__main__":
    main()
