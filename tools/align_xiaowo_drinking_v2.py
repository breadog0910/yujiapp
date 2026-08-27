# -*- coding: utf-8 -*-
"""把 xiaowo-drinking.png sprite sheet 的 6 帧用"脚底中心"锚点对齐 v2。

v1 的问题：用 bbox 中心对齐，但每帧 bbox 宽度不同（举杯时手伸出 → bbox 变宽），
导致 bbox 中心 != 身体中心，连帧时身体仍会左右瞬移。

v2 思路：
1. 抠出每帧角色本体；
2. 在角色"脚底区域"（最下面 ~12% 高度）找非透明像素的水平中位数 X，作为身体稳定锚点；
3. 把所有帧对齐到这个锚点（脚底中心位置一致）。
"""
import os
import shutil
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-drinking.png"
UNALIGNED = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-drinking.unaligned.png"
BACKUP_V1 = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-drinking.aligned_v1.png"

FRAME_COUNT = 6
PAD = 2

# 脚底区域：角色高度最下面 12% 的像素行（脚部 / 小腿，不动）
FOOT_BAND_RATIO = 0.12


def char_bbox_in_frame(frame_img):
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
    return (min_x, min_y, max_x, max_y)


def foot_center_x(char_img, bbox):
    """角色脚底区域的水平中位数 X（用中位数比均值抗"脚伸出去一只"的扰动）。"""
    cx0, cy0, cx1, cy1 = bbox
    cw = cx1 - cx0 + 1
    ch = cy1 - cy0 + 1
    band_h = max(2, int(ch * FOOT_BAND_RATIO))
    band_y0 = cy1 - band_h + 1  # bbox 底部往上 band_h 行
    band_y1 = cy1
    px = char_img.load()
    # 在脚底带内统计非透明像素的 X 列表，取中位数
    xs = []
    for y in range(band_y0, band_y1 + 1):
        for x in range(cx0, cx1 + 1):
            if px[x, y][3] > 30:
                xs.append(x)
    if not xs:
        return (cx0 + cx1) // 2
    xs.sort()
    return xs[len(xs) // 2]


def main():
    # 用 v1 输出（已抠除白底）作为输入；如果有未对齐原图更好
    src = SRC if os.path.exists(SRC) else None
    if not src:
        print("missing SRC")
        return
    # 备份当前 v1 输出
    if not os.path.exists(BACKUP_V1):
        shutil.copy2(SRC, BACKUP_V1)
        print(f"backed up v1 -> {BACKUP_V1}")

    sheet = Image.open(UNALIGNED).convert("RGBA")  # 从未对齐原图开始
    sheet_w, sheet_h = sheet.size
    frame_w = sheet_w // FRAME_COUNT
    print(f"sheet {sheet_w}x{sheet_h}, frame_w={frame_w}")

    # 1) 切 6 帧 + 抠出角色本体 + 找脚底锚点
    cropped = []         # [char_img]
    foot_anchors = []    # [foot_center_x_in_frame]
    foot_y_anchors = []  # [foot_y_in_frame] (角色 bbox 底部 Y)
    max_w = max_h = 0
    for i in range(FRAME_COUNT):
        x0 = i * frame_w
        x1 = (i + 1) * frame_w if i < FRAME_COUNT - 1 else sheet_w
        frame = sheet.crop((x0, 0, x1, sheet_h))
        bbox = char_bbox_in_frame(frame)
        if bbox[2] < 0:
            continue
        char = frame.crop(bbox)
        cropped.append(char)
        fx = foot_center_x(frame, bbox)   # 脚底 X 在原图坐标系
        fy = bbox[3]                       # 脚底 Y 在原图坐标系
        foot_anchors.append(fx)
        foot_y_anchors.append(fy)
        max_w = max(max_w, char.size[0])
        max_h = max(max_h, char.size[1])
        print(f"frame {i}: bbox={bbox} char_size={char.size} foot_x={fx} foot_y={fy}")

    # 2) 统一画布：宽 = 最大角色宽 + 2*PAD；高 = 最大角色高 + 2*PAD
    canvas_w = max_w + PAD * 2
    canvas_h = max_h + PAD * 2
    print(f"canvas = {canvas_w}x{canvas_h}")

    # 3) 每帧贴到画布，使 (foot_x, foot_y) 对齐到 (canvas_w/2, canvas_h - PAD)
    aligned = []
    for i, (char, fx, fy) in enumerate(zip(cropped, foot_anchors, foot_y_anchors)):
        # char 的本地坐标系：原点是 bbox 左上角
        # 在 char 里 foot_x_local = fx - bbox_min_x；foot_y_local = fy - bbox_min_y
        # 但 char 已经被 crop 到 bbox，所以 foot_x_local 直接 = fx - cx0
        bbox_min_x = char_bbox_in_frame(sheet.crop((i * frame_w, 0, (i + 1) * frame_w if i < FRAME_COUNT - 1 else sheet_w, sheet_h)))[0]
        foot_x_local = fx - bbox_min_x
        foot_y_local = fy - (char_bbox_in_frame(sheet.crop((i * frame_w, 0, (i + 1) * frame_w if i < FRAME_COUNT - 1 else sheet_w, sheet_h)))[1])
        # 贴到画布：让 foot 锚点对齐 (canvas_w/2, canvas_h - PAD)
        paste_x = canvas_w // 2 - foot_x_local
        paste_y = (canvas_h - PAD) - foot_y_local
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        canvas.paste(char, (paste_x, paste_y), char)
        aligned.append(canvas)

    # 4) 横向拼成新 sheet
    new_sheet = Image.new("RGBA", (canvas_w * FRAME_COUNT, canvas_h), (0, 0, 0, 0))
    for i, c in enumerate(aligned):
        new_sheet.paste(c, (i * canvas_w, 0), c)
    new_sheet.save(SRC)
    print(f"saved v2 aligned sheet -> {SRC} ({new_sheet.size})")

    # 5) 校验：每帧脚底锚点 X 应该全部 = canvas_w / 2
    px = new_sheet.load()
    for i in range(FRAME_COUNT):
        # 在画布底部往上 8 行找非透明像素的中位数 X
        band_h = 8
        band_y0 = canvas_h - PAD - band_h
        band_y1 = canvas_h - PAD
        xs = []
        for y in range(band_y0, band_y1):
            for x in range(i * canvas_w, (i + 1) * canvas_w):
                if px[x, y][3] > 30:
                    xs.append(x - i * canvas_w)
        if xs:
            xs.sort()
            med = xs[len(xs) // 2]
            print(f"frame {i}: foot_median_x = {med} (canvas_w/2 = {canvas_w // 2})")


if __name__ == "__main__":
    main()
