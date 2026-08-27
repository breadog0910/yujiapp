# -*- coding: utf-8 -*-
"""按 Skill §1.1 + §1.2 流程重跑庆祝 sprite：抠图 → 脚底对齐 → 归一化254高。
严格：flood-fill cutout（更低 white_thr=240 提高透明占比到 30+%）→ 脚底中心对齐（FOOT_BAND_RATIO=0.12）→ 每帧脚X差≤2px → 单帧画布高254，横向sheet输出。"""
import os, shutil
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.png"
CUTOUT_BACKUP = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.cutout_backup.png"
UNALIGNED = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.unaligned.png"
FRAME_COUNT = 6
WHITE_THR = 240
EDGE_ALPHA = 30
PAD = 2
FOOT_BAND_RATIO = 0.12
TARGET_H = 254  # 和喝水单帧同样的原始高度（显示时按比例缩放到容器 148px 高）

def cutout(path_in, path_out):
    """Skill §1.1: 从4边 flood-fill 白底抠除"""
    if not os.path.exists(CUTOUT_BACKUP):
        shutil.copy2(SRC, CUTOUT_BACKUP)
    img = Image.open(path_in).convert("RGBA")
    w, h = img.size
    px = img.load()
    visited = [[False]*h for _ in range(w)]
    stack = []
    for x in range(w):
        for y in (0, h-1):
            r,g,b,a = px[x,y]
            if a>0 and r>=WHITE_THR and g>=WHITE_THR and b>=WHITE_THR:
                stack.append((x,y)); visited[x][y]=True
    for y in range(h):
        for x in (0, w-1):
            r,g,b,a = px[x,y]
            if a>0 and r>=WHITE_THR and g>=WHITE_THR and b>=WHITE_THR:
                stack.append((x,y)); visited[x][y]=True
    while stack:
        x, y = stack.pop()
        r,g,b,a = px[x,y]
        if a<=0: continue
        if r>=WHITE_THR and g>=WHITE_THR and b>=WHITE_THR:
            px[x,y] = (0,0,0,0)
        else:
            whiteness = (r+g+b)/3 / 255.0
            px[x,y] = (r,g,b, max(0, int(a*(1-whiteness))))
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if 0<=nx<w and 0<=ny<h and not visited[nx][ny]:
                r2,g2,b2,a2 = px[nx,ny]
                if a2>0:
                    visited[nx][ny]=True
                    stack.append((nx,ny))
    img.save(path_out)
    transparent = sum(1 for y in range(h) for x in range(w) if px[x,y][3]<=EDGE_ALPHA)
    print(f"[cutout] {w}x{h}, transparent_ratio={100*transparent/(w*h):.1f}% (target 30~60%)")

def bbox(img):
    w,h = img.size; p = img.load()
    mnx,mny,mxx,mxy = w,h,-1,-1
    for y in range(h):
        for x in range(w):
            if p[x,y][3] > EDGE_ALPHA:
                if x<mnx: mnx=x
                if y<mny: mny=y
                if x>mxx: mxx=x
                if y>mxy: mxy=y
    return (mnx,mny,mxx,mxy) if mxx>=0 else None

def foot_anchor(frame_img, bb):
    """Skill §1.2: 底部 12% 带非透明 X 中位数作脚底中心 X；bbox 最大 Y 作脚底 Y"""
    cx0,cy0,cx1,cy1 = bb
    ch = cy1-cy0+1
    band_h = max(2, int(ch*FOOT_BAND_RATIO))
    by0, by1 = cy1-band_h+1, cy1
    p = frame_img.load()
    xs = []
    for y in range(by0, by1+1):
        for x in range(cx0, cx1+1):
            if p[x,y][3] > EDGE_ALPHA: xs.append(x)
    if not xs: return ((cx0+cx1)//2, cy1)
    xs.sort(); fx = xs[len(xs)//2]
    return (fx, cy1)

def align_and_normalize(path_in, path_out):
    """Skill §1.2 + §2.3: 按脚底中心对齐 → 缩放到 TARGET_H 高度 → 等宽输出单帧"""
    shutil.copy2(path_in, UNALIGNED)
    sheet = Image.open(UNALIGNED).convert("RGBA")
    W, H = sheet.size
    FW = W // FRAME_COUNT
    chars = []
    local_anchors = []
    mxw = mxh = 0
    for i in range(FRAME_COUNT):
        x0, x1 = i*FW, ((i+1)*FW if i<FRAME_COUNT-1 else W)
        frame = sheet.crop((x0,0,x1,H))
        bb = bbox(frame)
        if not bb: continue
        char = frame.crop(bb)
        fx, fy = foot_anchor(frame, bb)
        fx_local = fx - bb[0]
        fy_local = fy - bb[1]
        chars.append(char)
        local_anchors.append((fx_local, fy_local))
        mxw, mxh = max(mxw, char.size[0]), max(mxh, char.size[1])
    print(f"[align] max char bbox: {mxw}x{mxh}, N_char={len(chars)}")

    # 对齐到统一画布（每帧贴上去时使脚底中心坐标一致）
    cw, ch = mxw + PAD*2, mxh + PAD*2
    frames = []
    for char, (fx, fy) in zip(chars, local_anchors):
        canvas = Image.new("RGBA", (cw, ch), (0,0,0,0))
        paste_x = cw//2 - fx
        paste_y = (ch - PAD) - fy
        canvas.paste(char, (paste_x, paste_y), char)
        frames.append(canvas)

    # 缩放：每帧缩放到高 = TARGET_H，宽度按比例（所有帧缩放到相同 fw_dst）
    scale = TARGET_H / ch
    fw_dst = int(round(cw * scale))
    fh_dst = TARGET_H
    print(f"[normalize] scale={scale:.3f}, dst frame size={fw_dst}x{fh_dst}")
    resized = [f.resize((fw_dst, fh_dst), Image.NEAREST) for f in frames]

    # 输出横向 sprite sheet
    out = Image.new("RGBA", (fw_dst*FRAME_COUNT, fh_dst), (0,0,0,0))
    for i, f in enumerate(resized):
        out.paste(f, (i*fw_dst, 0), f)
    out.save(path_out)
    print(f"[out] saved {path_out} ({out.size}), per-frame {fw_dst}x{fh_dst}")

    # 对齐后自检：重新算每帧脚X的画布坐标
    print("[verify] 对齐后每帧脚底中心 X（应全部相等±2px）:")
    outsheet = Image.open(path_out).convert("RGBA")
    W2, H2 = outsheet.size
    FW2 = W2 // FRAME_COUNT
    xs_after = []
    for i in range(FRAME_COUNT):
        x0, x1 = i*FW2, ((i+1)*FW2 if i<FRAME_COUNT-1 else W2)
        f = outsheet.crop((x0,0,x1,H2))
        bb = bbox(f)
        if not bb: continue
        fx, fy = foot_anchor(f, bb)
        xs_after.append(fx)
        print(f"  Frame {i}: foot_anchor_x={fx}, bbox_h={bb[3]-bb[1]+1}")
    print(f"  X range: {min(xs_after)} ~ {max(xs_after)}, diff={max(xs_after)-min(xs_after)}px {'✅ OK (<=2)' if max(xs_after)-min(xs_after)<=2 else '⚠️ 需重调'}")
    return fw_dst, fh_dst

cutout(SRC, SRC)
fw, fh = align_and_normalize(SRC, SRC)
print(f"\n=== Skill §2.3 显示尺寸计算 ===")
CONTAINER_H = 148
s = CONTAINER_H / fh
DISPLAY_W = int(round(fw * s))
print(f"原始单帧 {fw}x{fh} → 容器高 {CONTAINER_H}px → 显示宽 = {CONTAINER_H}×{fw}/{fh} = {DISPLAY_W}px")
print(f"90px 容器内水平居中偏移 = ({90} - {DISPLAY_W}) / 2 = {(90 - DISPLAY_W)/2}px")
print(f"→ 第 n 帧 background-position X = {(90 - DISPLAY_W)/2} - n×{DISPLAY_W} px")
for n in range(6):
    print(f"  frame {n}: {((90 - DISPLAY_W)/2) - n*DISPLAY_W}px 0")
