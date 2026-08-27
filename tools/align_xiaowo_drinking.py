# -*- coding: utf-8 -*-
"""把 xiaowo-drinking.png sprite sheet 的 6 帧对齐到同一锚点（脚底中心）。

问题：原本 6 帧里小人角色在每帧内的 X 位置不一样（帧 3 / 5 偏左），
步进播放时小人像在不同位置轮番出现，看着像好几个小人。

解决：以"脚底中心"为锚点，把每帧的角色本体抠出后重新贴到统一尺寸的画布上，
让小人 X/Y 都对齐，连帧时就是一个站定的小人在做喝水动作。
"""
import os
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-drinking.png"
BACKUP = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-drinking.unaligned.png"

FRAME_COUNT = 6
PAD = 2  # 画布四周留点透明 padding，避免边缘像素被切掉


def char_bbox_in_frame(frame_img):
    """返回 frame_img 里非透明像素的 bbox (min_x, min_y, max_x, max_y)。"""
    w, h = frame_img.size
    px = frame_img.load()
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 30:  # 略过半透明抗锯齿像素也算
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y
    return (min_x, min_y, max_x, max_y)


def main():
    if not os.path.exists(BACKUP):
        import shutil
        shutil.copy2(SRC, BACKUP)
        print(f"backed up unaligned -> {BACKUP}")

    sheet = Image.open(SRC).convert("RGBA")
    sheet_w, sheet_h = sheet.size
    frame_w = sheet_w // FRAME_COUNT
    print(f"sheet {sheet_w}x{sheet_h}, frame_w={frame_w}")

    # 1) 切 6 帧 + 找各自角色 bbox
    frames = []          # [(cropped_char_img, bbox)]
    for i in range(FRAME_COUNT):
        x0 = i * frame_w
        x1 = (i + 1) * frame_w if i < FRAME_COUNT - 1 else sheet_w
        frame = sheet.crop((x0, 0, x1, sheet_h))
        bbox = char_bbox_in_frame(frame)
        if bbox[2] < 0:
            print(f"frame {i} empty!")
            continue
        char = frame.crop(bbox)
        frames.append((char, bbox))
        print(f"frame {i}: bbox={bbox} char_size={char.size}")

    # 2) 计算统一画布尺寸 = 所有帧角色本体的最大宽 / 最大高 + padding
    max_w = max(c.size[0] for c, _ in frames)
    max_h = max(c.size[1] for c, _ in frames)
    canvas_w = max_w + PAD * 2
    canvas_h = max_h + PAD * 2
    print(f"canvas size = {canvas_w}x{canvas_h}")

    # 3) 把每帧角色贴到统一画布上，对齐到"脚底中心"
    #    脚底 = 画布底部 + padding；中心 X = 画布宽度中点
    aligned_frames = []
    for i, (char, bbox) in enumerate(frames):
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        # 角色"脚底中心"对齐画布"脚底中心"
        # 角色本体 bbox 的宽度 = char.size[0]，底部 = char.size[1]
        # 把角色贴到 (canvas_w - char_w) // 2, canvas_h - char_h - PAD 的位置
        paste_x = (canvas_w - char.size[0]) // 2
        paste_y = canvas_h - char.size[1] - PAD  # 角色底部贴到画布底部 padding 上方
        canvas.paste(char, (paste_x, paste_y), char)
        aligned_frames.append(canvas)

    # 4) 横向拼成新 sprite sheet
    new_sheet_w = canvas_w * FRAME_COUNT
    new_sheet_h = canvas_h
    new_sheet = Image.new("RGBA", (new_sheet_w, new_sheet_h), (0, 0, 0, 0))
    for i, f in enumerate(aligned_frames):
        new_sheet.paste(f, (i * canvas_w, 0), f)

    # 5) 保存（同名覆盖；CSS 用 background-size:600% 100% 自动适配）
    new_sheet.save(SRC)
    print(f"saved aligned sheet -> {SRC} ({new_sheet.size})")

    # 6) 校验：每帧角色中心 X 应该几乎一致
    px = new_sheet.load()
    for i in range(FRAME_COUNT):
        x0 = i * canvas_w
        # 在该帧范围内找非透明像素的 bbox
        min_x = canvas_w; max_x = -1
        for y in range(canvas_h):
            for x in range(x0, x0 + canvas_w):
                if px[x, y][3] > 30:
                    if x - x0 < min_x: min_x = x - x0
                    if x - x0 > max_x: max_x = x - x0
        center_x = (min_x + max_x) / 2
        print(f"frame {i}: char_x={min_x}~{max_x} center={center_x:.1f} (canvas_w={canvas_w})")


if __name__ == "__main__":
    main()
