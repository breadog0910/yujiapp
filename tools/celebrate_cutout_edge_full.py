# -*- coding: utf-8 -*-
"""Skill §1.1 增强抠图：连边全清（不管颜色）。
核心洞察：对这种"6 帧横向 sprite sheet"，**连到 4 条边的任何 a>0 像素 100% 是背景**（真正的角色像素不会贴到 sheet 的 4 边，会被角色 body 包围在内部）。
所以直接 flood-fill 从 4 边出发，**把所有从 4 边能走到的 a>0 像素全部 alpha=0**，不需要判断颜色——白、浅灰、深灰、网格线，只要连到边就全透明。
角色内部被 body 像素包围的白（眼白、牙齿、杯口高光）走不到 4 边 → 完整保留。
这个算法对"网格那种背景 / 白底 / 浅灰底 / 深灰分隔线"全部秒杀，透明占比通常能到 60%+。
"""
import os
from PIL import Image

SRC_ORIGINAL = r"c:\Users\29948\Desktop\workbuddy\a06fb0d9120edfc77b7fbbd72a1b016b.png"
CUTOUT_TMP   = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.cutout_tmp.png"
DST          = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.png"
FRAME_COUNT  = 6
TARGET_H     = 254
PAD          = 2
FOOT_BAND_RATIO = 0.12
EDGE_ALPHA   = 30

def cutout_edge_connected(path_in, path_out):
    """从 4 条边 flood-fill：所有"连到边"的 a>0 像素 → 全 0 alpha（完全透明）。
    不需要颜色判断——连边就一定是背景。角色内部白走不到边 → 自动保留。"""
    img = Image.open(path_in).convert("RGBA")
    w, h = img.size
    px = img.load()
    visited = [[False]*h for _ in range(w)]
    stack = []
    # 所有 4 边上的 a>0 像素都是起点种子
    for x in range(w):
        for y in (0, h-1):
            if px[x,y][3] > 0 and not visited[x][y]:
                visited[x][y] = True; stack.append((x,y))
    for y in range(h):
        for x in (0, w-1):
            if px[x,y][3] > 0 and not visited[x][y]:
                visited[x][y] = True; stack.append((x,y))
    while stack:
        x, y = stack.pop()
        r,g,b,a = px[x,y]
        if a <= 0: continue
        px[x,y] = (0,0,0,0)                 # 连边像素 → 全透
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if 0<=nx<w and 0<=ny<h and not visited[nx][ny]:
                if px[nx,ny][3] > 0:
                    visited[nx][ny] = True
                    stack.append((nx,ny))
    img.save(path_out)
    transparent = sum(1 for y in range(h) for x in range(w) if px[x,y][3]<=EDGE_ALPHA)
    ratio = 100*transparent/(w*h)
    print(f"[cutout-edge] {w}x{h} 透明像素 {ratio:.1f}%（Skill 良线：>=50%）")
    if ratio < 50: print(f"  ⚠️ 透明占比 <50%，可能仍有残背景")

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
    sheet = Image.open(path_in).convert("RGBA")
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
    cw, ch = mxw + PAD*2, mxh + PAD*2
    frames = []
    for char, (fx, fy) in zip(chars, local_anchors):
        canvas = Image.new("RGBA", (cw, ch), (0,0,0,0))
        paste_x = cw//2 - fx
        paste_y = (ch - PAD) - fy
        canvas.paste(char, (paste_x, paste_y), char)
        frames.append(canvas)
    scale = TARGET_H / ch
    fw_dst = int(round(cw * scale))
    fh_dst = TARGET_H
    print(f"[normalize] scale={scale:.3f}, 单帧 {cw}x{ch} → {fw_dst}x{fh_dst}")
    resized = [f.resize((fw_dst, fh_dst), Image.NEAREST) for f in frames]
    out = Image.new("RGBA", (fw_dst*FRAME_COUNT, fh_dst), (0,0,0,0))
    for i, f in enumerate(resized):
        out.paste(f, (i*fw_dst, 0), f)
    out.save(path_out)
    print(f"[out] {path_out} ({out.size}), 单帧 {fw_dst}x{fh_dst}")

    # 自检
    sheet2 = Image.open(path_out).convert("RGBA")
    W2, H2 = sheet2.size
    FW2 = W2 // FRAME_COUNT
    xs_after = []
    for i in range(FRAME_COUNT):
        x0, x1 = i*FW2, ((i+1)*FW2 if i<FRAME_COUNT-1 else W2)
        f = sheet2.crop((x0,0,x1,H2))
        bb = bbox(f)
        if not bb: continue
        fx, fy = foot_anchor(f, bb)
        xs_after.append(fx)
        print(f"  Frame {i}: foot_x={fx}, bbox={bb[2]-bb[0]+1}x{bb[3]-bb[1]+1}")
    print(f"  X diff: {min(xs_after)}~{max(xs_after)}, gap={max(xs_after)-min(xs_after)}px {'✅' if max(xs_after)-min(xs_after)<=2 else '⚠️'}")

    CONTAINER_H = 148
    s = CONTAINER_H / fh_dst
    DISPLAY_W = int(round(fw_dst * s))
    CENTER = (90 - DISPLAY_W) / 2
    print(f"\n=== Skill §2.3 显示计算 ===")
    print(f"显示帧 {DISPLAY_W}x{CONTAINER_H}, sprite background-size={DISPLAY_W*6}px 100%")
    print(f"第 n 帧偏移 X = {CENTER} - n*{DISPLAY_W} px")
    for n in range(6):
        print(f"  frame {n}: {CENTER - n*DISPLAY_W}px 0")
    return fw_dst, fh_dst, DISPLAY_W

# MAIN
print("=" * 60)
print("STEP 1/2: Skill §1.1 连边全清抠图")
print("=" * 60)
cutout_edge_connected(SRC_ORIGINAL, CUTOUT_TMP)
print()
print("=" * 60)
print("STEP 2/2: Skill §1.2 脚底中心对齐 + 归一化254高")
print("=" * 60)
fw, fh, dw = align_and_normalize(CUTOUT_TMP, DST)
os.remove(CUTOUT_TMP)
print(f"\n✅ DONE -> {DST}")
