# -*- coding: utf-8 -*-
"""庆祝 sprite sheet N 帧按脚底中心锚点对齐。输出横向 sheet。
输入：xiaowo-celebrate.png (546×210, 6×91×210, 透明背景)
对齐方式：脚底中位数 X（最下 12% 行）+ bbox 底部 Y
输出：xiaowo-celebrate.png（等宽等高，横向排列）
"""
import os, shutil
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.png"
UNALIGNED = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.unaligned.png"
FRAME_COUNT = 6
PAD = 2
FOOT_BAND_RATIO = 0.10

def bbox(img):
    w,h = img.size; px = img.load()
    mnx,mny,mxx,mxy = w,h,-1,-1
    for y in range(h):
        for x in range(w):
            if px[x,y][3] > 30:
                if x<mnx: mnx=x
                if y<mny: mny=y
                if x>mxx: mxx=x
                if y>mxy: mxy=y
    return (mnx,mny,mxx,mxy)

def foot_anchor(frame_img, bbox_):
    cx0,cy0,cx1,cy1 = bbox_
    ch = cy1-cy0+1
    band_h = max(3, int(ch*FOOT_BAND_RATIO))
    by0, by1 = cy1-band_h+1, cy1
    px = frame_img.load()
    xs = []
    for y in range(by0, by1+1):
        for x in range(cx0, cx1+1):
            if px[x,y][3] > 30: xs.append(x)
    if not xs:
        return ((cx0+cx1)//2, cy1)
    xs.sort(); fx = xs[len(xs)//2]
    return (fx, cy1)

def main():
    if not os.path.exists(UNALIGNED): shutil.copy2(SRC, UNALIGNED)
    sheet = Image.open(UNALIGNED).convert("RGBA")
    W, H = sheet.size
    FW = W // FRAME_COUNT
    print(f"sheet {W}x{H}, FW={FW}")
    chars, anchors = [], []
    mxw = mxh = 0
    for i in range(FRAME_COUNT):
        x0, x1 = i*FW, (i+1)*FW if i<FRAME_COUNT-1 else W
        frame = sheet.crop((x0,0,x1,H))
        bb = bbox(frame)
        if bb[2]<0:
            print(f'frame {i} empty'); continue
        char = frame.crop(bb); chars.append(char)
        fx, fy = foot_anchor(frame, bb)
        fx_local = fx - bb[0]; fy_local = fy - bb[1]
        anchors.append((fx_local, fy_local))
        mxw, mxh = max(mxw, char.size[0]), max(mxh, char.size[1])
        print(f'frame {i}: bbox={bb} char={char.size} foot@({fx},{fy})')
    cw, ch = mxw + PAD*2, mxh + PAD*2
    print(f'unified canvas: {cw}x{ch}')
    frames = []
    for char, (fx,fy) in zip(chars, anchors):
        canvas = Image.new("RGBA", (cw, ch), (0,0,0,0))
        paste_x = cw//2 - fx
        paste_y = (ch - PAD) - fy
        canvas.paste(char, (paste_x, paste_y), char)
        frames.append(canvas)
    out = Image.new("RGBA", (cw*FRAME_COUNT, ch), (0,0,0,0))
    for i, f in enumerate(frames): out.paste(f, (i*cw, 0), f)
    out.save(SRC)
    print(f'aligned sheet -> {SRC} ({out.size}), frame={cw}x{ch}')

main()
