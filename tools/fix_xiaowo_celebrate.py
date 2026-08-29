# -*- coding: utf-8 -*-
"""修复 xiaowo-celebrate 雪碧图：去残影 + 脚底中心对齐，输出 930×254。

背景（与喝水对齐脚本同源，复用 v2 的脚底锚点法）：
庆祝 6 帧存在两类问题：
1) 相邻帧残影/碎片：帧 0 右侧粘着上个姿态的头部、帧 1 右侧有半身等，
   这些碎片会让 bbox 变宽、让"小人左右瞬移"更严重；
2) 每帧角色水平位置漂移：有的在画布左、有的在右，步进播放时角色乱跳。

方案：
1. 切 6 帧（155×254/帧）；
2. 每帧做连通域分析，只保留最大连通域（主角），其余碎片全部清透明；
3. 在"脚底带"（底部 12% 高度）取非透明像素水平中位数 X 作为稳定锚点
   （跳跃/举手时 bbox 中心会偏，脚底不会动）；
4. 把主角贴回统一 155×254 画布，脚底中心对齐 (77, 251)；
5. 拼回 930×254，输出为新文件名 v5（防浏览器强缓存旧图）。
"""
import os
import shutil
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate-v4.png"
OUT = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate-v5.png"

FRAME_COUNT = 6
FRAME_W = 155          # 目标单帧宽（930 / 6），与喝水帧完全一致
FRAME_H = 254          # 目标单帧高，与喝水帧完全一致
FOOT_BAND_RATIO = 0.12 # 脚底带高度 = 角色高度 * 12%
ALPHA_MIN = 60         # 判定"可见像素"的最小 alpha


def char_bbox_in_frame(frame_img):
    """非透明像素 bbox (min_x, min_y, max_x, max_y)。"""
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


def keep_largest_connected(frame_img):
    """只保留最大连通域（主角），清除残影/碎片。

    返回清理后的 RGBA 帧图。8 邻域 BFS。
    """
    w, h = frame_img.size
    px = frame_img.load()
    visited = [[False] * w for _ in range(h)]
    regions = []
    for sy in range(h):
        for sx in range(w):
            if visited[sy][sx] or px[sx, sy][3] < ALPHA_MIN:
                continue
            # BFS
            stack = [(sx, sy)]
            visited[sy][sx] = True
            cells = []
            while stack:
                x, y = stack.pop()
                cells.append((x, y))
                for dx, dy in ((-1, -1), (0, -1), (1, -1), (-1, 0),
                               (1, 0), (-1, 1), (0, 1), (1, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] \
                            and px[nx, ny][3] >= ALPHA_MIN:
                        visited[ny][nx] = True
                        stack.append((nx, ny))
            regions.append(cells)

    if not regions:
        return frame_img

    # 最大连通域
    biggest = max(regions, key=len)
    keep = set(biggest)
    cleared = frame_img.copy()
    cp = cleared.load()
    for y in range(h):
        for x in range(w):
            if (x, y) not in keep:
                r, g, b, a = cp[x, y]
                cp[x, y] = (r, g, b, 0)
    print(f"  connected regions: {len(regions)}, keep largest = {len(biggest)}px, cleared = {sum(len(r) for r in regions) - len(biggest)}px")
    return cleared


def foot_center_x(frame_img, bbox):
    """脚底带（bbox 底部 12% 高度）非透明像素的水平中位数 X（原图坐标系）。"""
    cx0, cy0, cx1, cy1 = bbox
    ch = cy1 - cy0 + 1
    band_h = max(2, int(ch * FOOT_BAND_RATIO))
    band_y0 = cy1 - band_h + 1
    px = frame_img.load()
    xs = []
    for y in range(band_y0, cy1 + 1):
        for x in range(cx0, cx1 + 1):
            if px[x, y][3] > 30:
                xs.append(x)
    if not xs:
        return (cx0 + cx1) // 2
    xs.sort()
    return xs[len(xs) // 2]


def main():
    if not os.path.exists(SRC):
        print("missing SRC:", SRC)
        return
    shutil.copy2(SRC, SRC.replace('.png', '.buggy_backup.png'))
    print(f"backed up buggy -> {SRC.replace('.png', '.buggy_backup.png')}")

    sheet = Image.open(SRC).convert("RGBA")
    sheet_w, sheet_h = sheet.size
    print(f"source sheet {sheet_w}x{sheet_h}")

    # 1) 切帧 + 去残影
    frames = []
    for i in range(FRAME_COUNT):
        x0 = i * FRAME_W
        x1 = x0 + FRAME_W
        frame = sheet.crop((x0, 0, x1, sheet_h))
        print(f"frame {i}:")
        cleaned = keep_largest_connected(frame)
        frames.append(cleaned)

    # 2) 每帧：bbox + 脚底锚点 + 角色本体
    anchors = []   # (char_img, foot_x_in_char, foot_y_in_char)
    for i, frame in enumerate(frames):
        bbox = char_bbox_in_frame(frame)
        if bbox[2] < 0:
            print(f"  frame {i} EMPTY!")
            continue
        fx = foot_center_x(frame, bbox)
        fy = bbox[3]
        char = frame.crop(bbox)
        # char 本地坐标系锚点
        foot_x_local = fx - bbox[0]
        foot_y_local = fy - bbox[1]
        anchors.append((char, foot_x_local, foot_y_local))
        print(f"  bbox={bbox} char={char.size} foot=({foot_x_local},{foot_y_local})")

    # 3) 贴回统一 155×254 画布，脚底中心对齐 (FRAME_W//2, FRAME_H - 2)
    aligned = []
    for i, (char, fxl, fyl) in enumerate(anchors):
        canvas = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
        paste_x = FRAME_W // 2 - fxl
        paste_y = (FRAME_H - 2) - fyl
        canvas.paste(char, (paste_x, paste_y), char)
        aligned.append(canvas)

    # 4) 拼回 930×254
    new_sheet = Image.new("RGBA", (FRAME_W * FRAME_COUNT, FRAME_H), (0, 0, 0, 0))
    for i, c in enumerate(aligned):
        new_sheet.paste(c, (i * FRAME_W, 0), c)
    new_sheet.save(OUT)
    print(f"saved fixed sheet -> {OUT} ({new_sheet.size})")

    # 5) 校验：每帧脚底带中位数 X 应 ≈ FRAME_W//2 = 77
    px = new_sheet.load()
    ok = True
    for i in range(FRAME_COUNT):
        band_h = 10
        band_y0 = FRAME_H - 2 - band_h
        band_y1 = FRAME_H - 2
        xs = []
        for y in range(band_y0, band_y1):
            for x in range(i * FRAME_W, (i + 1) * FRAME_W):
                if px[x, y][3] > 30:
                    xs.append(x - i * FRAME_W)
        if xs:
            xs.sort()
            med = xs[len(xs) // 2]
            flag = 'OK' if abs(med - FRAME_W // 2) <= 2 else 'MISALIGNED!'
            if flag != 'OK': ok = False
            print(f"frame {i}: foot_median_x={med} (target {FRAME_W//2}) {flag}")
        else:
            print(f"frame {i}: no foot pixels!")
            ok = False
    print("RESULT:", "ALIGNED OK" if ok else "NEEDS ATTENTION")


if __name__ == "__main__":
    main()
