# -*- coding: utf-8 -*-
"""【从源头 a06fb0d9.png 完整重跑】Skill §1.1 + §1.2 + §2.3 庆祝 sprite 流水线。
根因修正：原图根本不是白底（RGB>=240 比例为 0%），而是浅灰 (212,212,212,255) + 深灰 (42,42,42,255) + 部分已经 alpha=0 透明。
之前 cutout 只抠「纯白」所以一片都没抠到 → 导致透明占比仍只有 29%，且浏览器显示出棋盘格（透明区）+ 未抠除的浅灰背景块，视觉上像"轮播白色/灰色照片"。
本脚本改为：从 4 边 flood-fill，按「边框主色的色差 ΔE」判断背景像素，不依赖颜色名，适用于任何颜色背景。
"""
import os, shutil
from PIL import Image
from collections import Counter

SRC_ORIGINAL = r"c:\Users\29948\Desktop\workbuddy\a06fb0d9120edfc77b7fbbd72a1b016b.png"
DST          = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.png"
BACKUP       = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.skill_original.png"   # 永远保留这次的源头
FRAME_COUNT  = 6
TARGET_H     = 254   # 和喝水单帧同样的原始高度（显示时按比例缩到容器 148px 高）
PAD          = 2
FOOT_BAND_RATIO = 0.12
COLOR_DIST_THR = 60  # ΔE 色差阈值：认为和边框主色"同一块背景"的色差上限（越大越狠）
EDGE_ALPHA   = 30

# ─────────────────────────────────────────────────
# §1.1 通用版抠图：按「边框主色 + 色差 flood-fill」，不依赖白底
# ─────────────────────────────────────────────────
def border_main_color_and_seeds(img, px, w, h):
    """取 4 条边上颜色的众数（最多的那种）作为背景参考色；同时返回 4 边的所有种子坐标。"""
    border_cols = []
    seeds = set()
    for x in range(w):
        for y in (0, h-1):
            r,g,b,a = px[x,y]
            if a>0: border_cols.append((r,g,b))
            seeds.add((x,y))
    for y in range(h):
        for x in (0, w-1):
            r,g,b,a = px[x,y]
            if a>0: border_cols.append((r,g,b))
            seeds.add((x,y))
    cnt = Counter(border_cols)
    main_col = cnt.most_common(1)[0][0]
    return main_col, list(seeds)

def color_dist(c1, c2):
    return ( (c1[0]-c2[0])**2 + (c1[1]-c2[1])**2 + (c1[2]-c2[2])**2 ) ** 0.5

def cutout_universal(path_in, path_out):
    """通用 cutout：从 4 边开始 flood-fill，把"连到边 + 颜色≈边框主色"的全变透明。
    适用于任何颜色背景（白、浅灰、米黄、棋盘格等），不需要预先知道背景色。"""
    img = Image.open(path_in).convert("RGBA")
    w, h = img.size
    px = img.load()
    visited = [[False]*h for _ in range(w)]
    main_col, seeds = border_main_color_and_seeds(img, px, w, h)
    print(f"[cutout] 边框主色（背景色）= RGB{main_col}，#seeds={len(seeds)}")
    stack = []
    for (x,y) in seeds:
        r,g,b,a = px[x,y]
        if a>0 and color_dist((r,g,b), main_col) <= COLOR_DIST_THR:
            stack.append((x,y))
            visited[x][y] = True
    # 补充：所有 a>0 且和主色差 <T 的边邻也要进栈（处理 a=0 已经是透明但边邻是背景色的情况）
    while stack:
        x, y = stack.pop()
        r,g,b,a = px[x,y]
        if a<=0: continue
        d = color_dist((r,g,b), main_col)
        if d <= COLOR_DIST_THR:
            # 中心色 → 完全透明
            px[x,y] = (0,0,0,0)
        else:
            # 过渡带：按相对色差做半透明
            ratio = min(1.0, (d - COLOR_DIST_THR*0.5) / (COLOR_DIST_THR*0.5))
            px[x,y] = (r,g,b, max(0, int(a * ratio)))
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if 0<=nx<w and 0<=ny<h and not visited[nx][ny]:
                r2,g2,b2,a2 = px[nx,ny]
                if a2>0:
                    visited[nx][ny]=True
                    stack.append((nx,ny))
    img.save(path_out)
    transparent = sum(1 for y in range(h) for x in range(w) if px[x,y][3]<=EDGE_ALPHA)
    ratio = 100*transparent/(w*h)
    print(f"[cutout] {w}x{h} 透明像素 {ratio:.1f}%（Skill 推荐 30~60%，>=50% 是良）")
    if ratio < 20: print("  ⚠️ 透明占比太低，考虑调大 COLOR_DIST_THR")

# ─────────────────────────────────────────────────
# §1.2 脚底中心锚点对齐（Skill 同模板）+ 缩放到 TARGET_H
# ─────────────────────────────────────────────────
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

    # 每帧缩放到 TARGET_H
    scale = TARGET_H / ch
    fw_dst = int(round(cw * scale))
    fh_dst = TARGET_H
    print(f"[normalize] scale={scale:.3f}, 原始对齐帧 {cw}x{ch} → 输出单帧 {fw_dst}x{fh_dst}")
    resized = [f.resize((fw_dst, fh_dst), Image.NEAREST) for f in frames]

    out = Image.new("RGBA", (fw_dst*FRAME_COUNT, fh_dst), (0,0,0,0))
    for i, f in enumerate(resized):
        out.paste(f, (i*fw_dst, 0), f)
    out.save(path_out)
    print(f"[out] saved -> {path_out} ({out.size}), per-frame {fw_dst}x{fh_dst}")

    # 自检：对齐后每帧脚底中心 X（应相等±2px）
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
        print(f"  Frame {i}: foot_anchor_x={fx}, bbox={bb[2]-bb[0]+1}x{bb[3]-bb[1]+1}")
    print(f"  X diff: {min(xs_after)} ~ {max(xs_after)}, gap={max(xs_after)-min(xs_after)}px {'✅' if max(xs_after)-min(xs_after)<=2 else '⚠️ 超标'}")

    # §2.3 显示尺寸计算（容器高 = 148）
    CONTAINER_H = 148
    s = CONTAINER_H / fh_dst
    DISPLAY_W = int(round(fw_dst * s))
    print(f"\n[display] 单帧 {fw_dst}x{fh_dst} → 缩到 148 高 → 显示尺寸 {DISPLAY_W}x{CONTAINER_H}")
    print(f"         90 宽容器水平居中偏移 = ({90} - {DISPLAY_W}) / 2 = {(90 - DISPLAY_W)/2}px")
    for n in range(6):
        print(f"  frame {n}: background-position X = {((90 - DISPLAY_W)/2) - n*DISPLAY_W}px")
    return fw_dst, fh_dst, DISPLAY_W

# ─────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────
if not os.path.exists(BACKUP):
    shutil.copy2(SRC_ORIGINAL, BACKUP)
    print(f"[backup] 源头原图 -> {BACKUP}")

# 1) 从原始 a06fb0d9.png 开始 cutout（通用色差 flood-fill）
cutout_universal(SRC_ORIGINAL, DST)
# 2) 对齐 + 缩放到 254 高 + 输出横向 sheet
fw_src, fh_src, dw = align_and_normalize(DST, DST)
print(f"\n=== 下一步：CSS 更新为 ===")
print(f"  .xiaowo-celebrate {{ background-size: {dw*6}px 100%; }}")
print(f"  第 n 帧 X = {(90-dw)/2} - n*{dw} px")
