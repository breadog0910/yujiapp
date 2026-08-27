# -*- coding: utf-8 -*-
"""把已对齐的庆祝 sprite sheet 贴到统一 155:254 比例的画布上。
目标：输出单帧尺寸比例 ≈ 155:254（和喝水同比例），这样容器 90×148 完美适配。
计算：254/213 ≈ 1.192，画布每帧宽 = 94×1.192 ≈ 112，高 = 213×1.192 ≈ 254。
最终每帧：112×254（比喝水的 155×254 稍窄，水平居中显示更自然）。
"""
import os
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.png"
FRAME_COUNT = 6
TARGET_H = 254   # 和喝水单帧相同高度（确保身高视觉一致）

def main():
    sheet = Image.open(SRC).convert("RGBA")
    total_w, total_h = sheet.size
    frame_w_src = total_w // FRAME_COUNT
    print(f'src: {total_w}x{total_h}, per frame {frame_w_src}x{total_h}')

    # 按目标高度等比缩放一帧
    scale = TARGET_H / total_h
    fw_dst = int(round(frame_w_src * scale))
    fh_dst = TARGET_H
    print(f'scale {scale:.3f} -> dst frame {fw_dst}x{fh_dst}')

    new_frame_w = fw_dst
    new_frame_h = fh_dst
    out_frames = []
    for i in range(FRAME_COUNT):
        # 切原帧
        sf = sheet.crop((i*frame_w_src, 0, (i+1)*frame_w_src if i<FRAME_COUNT-1 else total_w, total_h))
        # 等比缩放到目标高度
        sf_resized = sf.resize((fw_dst, fh_dst), Image.NEAREST)  # 像素风：NEAREST 不糊
        # 水平居中到画布（画布和角色等宽，不需要；但若以后想放到 155×254 和喝水同宽，这里预留）
        canvas = Image.new("RGBA", (new_frame_w, new_frame_h), (0,0,0,0))
        # 角色贴到画布水平居中（目前宽相等，偏移就是 0）
        canvas.paste(sf_resized, (0,0), sf_resized)
        out_frames.append(canvas)

    out = Image.new("RGBA", (new_frame_w * FRAME_COUNT, new_frame_h), (0,0,0,0))
    for i, f in enumerate(out_frames): out.paste(f, (i*new_frame_w, 0), f)
    out.save(SRC)
    print(f'saved normalized sheet -> {SRC} ({out.size}), per-frame {new_frame_w}x{new_frame_h}')
    # 验证比例
    print(f'ratio: {new_frame_w/new_frame_h:.4f} (喝水是 155/254 = {155/254:.4f})')

main()
