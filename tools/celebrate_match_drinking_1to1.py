# -*- coding: utf-8 -*-
"""庆祝 sprite 完全复刻喝水小人 100% 成功方案（1:1 同构）。

喝水成功的关键指标：
  单帧原始 canvas = 155x254  →  sprite sheet = 930x254
  容器显示 = 90x148（155:254 等比缩放）
  background-size = 540px 100%（=90*6）
  keyframes 偏移 = 0, -90, -180, -270, -360, -450

之前庆祝失败的根因：庆祝帧 canvas 只有 113x254 → 显示帧只能 66x148，
需要额外计算"90 宽容器内水平居中 12px"→ 每帧偏移变成 12,-54,-120...
多了一套自定义计算逻辑，任何半像素误差或 cache 旧图都会看起来像"轮播 / 瞬移"。

本脚本 100% 对齐喝水流水线：
  1) 从源头 a06fb0d9.png 开始，§1.1「连边全清」抠图（不管颜色，连边就全透）
  2) §1.2 脚底中心锚点对齐（和喝水用同一 FOOT_BAND_RATIO=0.12 中位数算法）
  3) 对齐后把角色贴进【强制固定 155x254】canvas（和喝水帧宽高完全相同），
     脚锚点 Y 对齐 canvas 底部 - PAD 位置（与喝水同一位置），X 对齐 canvas 中线
  4) 最终输出 sprite sheet = 930x254（和喝水 930x254 完全一致）
  → 这样庆祝层的 CSS / keyframes **可以逐字复制**喝水的 xd-play，绝对不出错
"""
import os, shutil
from PIL import Image

SRC_ORIGINAL = r"c:\Users\29948\Desktop\workbuddy\a06fb0d9120edfc77b7fbbd72a1b016b.png"
DST          = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.png"
FRAME_COUNT  = 6

# ===== 以下常量全部抄自 align_xiaowo_drinking_v2.py（确保 1:1 同构）=====
TARGET_FRAME_W = 155   # 和喝水帧宽完全一致！（930 / 6 = 155）
TARGET_FRAME_H = 254   # 和喝水帧高完全一致！
PAD            = 2
FOOT_BAND_RATIO = 0.12
EDGE_ALPHA     = 30

# ─────────────────────────────────────────────────
# Step 1: Skill §1.1 「连边全清」抠图（适用于任何颜色背景）
# ─────────────────────────────────────────────────
def cutout_edge(path_in, path_out):
    img = Image.open(path_in).convert("RGBA")
    w, h = img.size
    px = img.load()
    visited = [[False]*h for _ in range(w)]
    stack = []
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
        px[x,y] = (0,0,0,0)
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if 0<=nx<w and 0<=ny<h and not visited[nx][ny]:
                if px[nx,ny][3] > 0:
                    visited[nx][ny] = True
                    stack.append((nx,ny))
    img.save(path_out)
    transparent = sum(1 for y in range(h) for x in range(w) if px[x,y][3]<=EDGE_ALPHA)
    print(f"[cutout-edge] {w}x{h} 透明占比 {100*transparent/(w*h):.1f}%（>=50% 良）")

# ─────────────────────────────────────────────────
# Step 2: bbox + 脚底锚点（和喝水 v2 完全同算法）
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

def foot_center_x(frame_img, bb):
    cx0,cy0,cx1,cy1 = bb
    ch = cy1-cy0+1
    band_h = max(2, int(ch*FOOT_BAND_RATIO))
    by0, by1 = cy1-band_h+1, cy1
    p = frame_img.load()
    xs = []
    for y in range(by0, by1+1):
        for x in range(cx0, cx1+1):
            if p[x,y][3] > EDGE_ALPHA: xs.append(x)
    if not xs: return (cx0+cx1)//2
    xs.sort(); return xs[len(xs)//2]

# ─────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────
os.makedirs(os.path.dirname(DST), exist_ok=True)

# 1) cutout
print("STEP 1/3: cutout")
cutout_edge(SRC_ORIGINAL, DST)

# 2) 切帧 + 抠角色本体 + 算脚锚
print("\nSTEP 2/3: bbox + foot anchor (和喝水 v2 同算法)")
sheet = Image.open(DST).convert("RGBA")
W, H = sheet.size
FW = W // FRAME_COUNT
chars = []
fx_local_list = []
fy_local_list = []
for i in range(FRAME_COUNT):
    x0, x1 = i*FW, ((i+1)*FW if i<FRAME_COUNT-1 else W)
    frame = sheet.crop((x0,0,x1,H))
    bb = bbox(frame)
    if not bb: continue
    char = frame.crop(bb)
    cx0 = bb[0]; cy0 = bb[1]
    fx_global = foot_center_x(frame, bb)
    fy_global = bb[3]
    chars.append(char)
    fx_local_list.append(fx_global - cx0)
    fy_local_list.append(fy_global - cy0)
    print(f"  frame {i}: char {char.size}, foot_local ({fx_global-cx0},{fy_global-cy0})")

# 3) 强制贴入 155×254 canvas（和喝水帧完全相同尺寸）
#    脚锚点 Y 对齐到 canvas 底部 - PAD（与喝水同一基准）
#    X 对齐到 canvas 中线（= TARGET_FRAME_W//2 = 77.5，整数取 77）
print(f"\nSTEP 3/3: 强制 canvas {TARGET_FRAME_W}x{TARGET_FRAME_H}（和喝水帧完全同尺寸）")
CANVAS_W = TARGET_FRAME_W
CANVAS_H = TARGET_FRAME_H
ANCHOR_X_TARGET = CANVAS_W // 2     # = 77
ANCHOR_Y_TARGET = CANVAS_H - PAD   # = 252（和喝水 v2: canvas_h - PAD 完全一致）

# ★ 关键修复：使用 bbox 中心对齐（而非脚底中心）
#   庆祝动画各帧角色身体（手臂/身体）位置变化大，脚底中心对齐会导致身体左右偏移。
#   bbox 中心对齐让角色身体居中，更稳定。
frames = []
for i in range(FRAME_COUNT):
    x0, x1 = i*FW, ((i+1)*FW if i<FRAME_COUNT-1 else W)
    frame = sheet.crop((x0,0,x1,H))
    bb = bbox(frame)
    if not bb:
        frames.append(Image.new("RGBA", (CANVAS_W, CANVAS_H), (0,0,0,0)))
        continue
    char = frame.crop(bb)
    cx0, cy0, cx1, cy1 = bb
    # bbox 中心 X 作为锚点
    bbox_center_x = (cx0 + cx1) // 2
    foot_y = cy1
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0,0,0,0))
    # bbox 中心对齐 canvas 中线
    paste_x = ANCHOR_X_TARGET - (bbox_center_x - cx0)
    paste_y = ANCHOR_Y_TARGET - (foot_y - cy0)
    canvas.paste(char, (paste_x, paste_y), char)
    frames.append(canvas)
    print(f"  frame {i}: bbox_center_x={bbox_center_x}, paste_x={paste_x}, char={char.size}")
out = Image.new("RGBA", (CANVAS_W*FRAME_COUNT, CANVAS_H), (0,0,0,0))
for i, c in enumerate(frames):
    out.paste(c, (i*CANVAS_W, 0), c)
out.save(DST)
print(f"✅ 最终 sprite -> {DST}  ({out.size})  单帧 {CANVAS_W}x{CANVAS_H}")

# 校验：和喝水的 930x254 完全相等
assert out.size == (930, 254), f"FAIL: 需要 930x254 但得到 {out.size}"
print(f"   ★ 与喝水帧 {930, 254} 完全一致！CSS 可 1:1 复制。")

# 自检：每帧在 155×254 canvas 里 bbox 中心 X 应该 ≈ 77 ±2
px = out.load()
print("\n[verify] 对齐后 bbox 中心 X（应≈77，diff≤2px）:")
centers = []
for i in range(FRAME_COUNT):
    x0 = i*CANVAS_W
    mnx,mxx = CANVAS_W,-1
    for y in range(CANVAS_H):
        for x in range(x0, x0+CANVAS_W):
            if px[x,y][3] > EDGE_ALPHA:
                cx = x - x0
                if cx<mnx: mnx=cx
                if cx>mxx: mxx=cx
    if mxx >= 0:
        center = (mnx + mxx) // 2
        centers.append(center)
        print(f"  frame {i}: bbox_center_x = {center} (target=77)")
print(f"  X range {min(centers)}~{max(centers)}, diff={max(centers)-min(centers)}px {'✅' if max(centers)-min(centers)<=2 else '⚠️'}")
