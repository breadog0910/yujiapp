# -*- coding: utf-8 -*-
"""把生成的 5 张大图作物 sprite：
1. 抠黑底 → 透明
2. 按作物主体缩放 + 对齐到底部
3. 输出为 72x54 透明 PNG 到 assets/field/
"""
import os
from PIL import Image

SRC_DIR = r"c:\Users\29948\Desktop\workbuddy\generated-images"
DST_DIR = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field"

TARGET_W = 72
TARGET_H = 54

# 源文件 → 目标名
FILES = [
    ("crop-s1-src.jpg", "crop-s1.png"),  # 破土
    ("crop-s2-src.jpg", "crop-s2.png"),  # 生长
    ("crop-s3-src.jpg", "crop-s3.png"),  # 繁茂
    ("crop-s4-src.jpg", "crop-s4.png"),  # 成熟前
    ("crop-h1-src.jpg", "crop-h1.png"),  # 收获
]

BG_R, BG_G, BG_B = 0, 0, 0  # 黑背景
EDGE_TOL = 20

def cutout_black(img):
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0: continue
            # RGB 都很接近黑 → 透明
            dr, dg, db = r - BG_R, g - BG_G, b - BG_B
            d_max = max(dr, dg, db)
            if d_max <= EDGE_TOL:
                ratio = d_max / EDGE_TOL if EDGE_TOL else 0
                alpha = int(255 * (ratio * ratio))
                if alpha == 0:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    px[x, y] = (r, g, b, alpha)
    return img

def find_content_bbox(img):
    """找非透明像素的包围盒，方便缩放到中心"""
    w, h = img.size
    px = img.load()
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 10:
                xs.append(x)
                ys.append(y)
    if not xs: return None
    return min(xs), min(ys), max(xs), max(ys)

def process_one(src_path, dst_path):
    img = Image.open(src_path).convert("RGBA")
    w, h = img.size
    # 1) 抠黑底
    img = cutout_black(img)
    # 2) 找主体包围盒
    bbox = find_content_bbox(img)
    if bbox is None:
        print(f"  ⚠ {os.path.basename(src_path)}: 没有非透明像素，跳过")
        return
    x1, y1, x2, y2 = bbox
    bw, bh = x2 - x1 + 1, y2 - y1 + 1
    # 3) 计算在目标画布中的占比：
    #    宽度方向：主体宽度 × 0.95（留一点边）
    #    高度方向：根据不同阶段占目标高度比例（破土矮，成熟高）
    #    这里统一用 fit_in，底部对齐
    scale_w = (TARGET_W * 0.96) / bw
    scale_h = (TARGET_H * 0.98) / bh
    scale = min(scale_w, scale_h)  # 等比缩放，不溢出
    # 裁剪主体
    crop = img.crop((x1, y1, x2 + 1, y2 + 1))
    nw, nh = int(round(bw * scale)), int(round(bh * scale))
    crop = crop.resize((nw, nh), Image.NEAREST)  # 像素风用最近邻
    # 4) 贴到 72x54 画布，底部对齐，水平居中
    canvas = Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))
    dx = (TARGET_W - nw) // 2
    dy = TARGET_H - nh  # 底部对齐
    canvas.paste(crop, (dx, dy), crop)
    canvas.save(dst_path)
    print(f"  OK {os.path.basename(src_path)} → {os.path.basename(dst_path)} ({nw}x{nh} → {TARGET_W}x{TARGET_H})")

def main():
    print("=" * 50)
    print(f"目标尺寸: {TARGET_W}x{TARGET_H}px (底部对齐)")
    print()
    for src_name, dst_name in FILES:
        sp = os.path.join(SRC_DIR, src_name)
        if not os.path.exists(sp):
            print(f"  ✗ 不存在: {src_name}, 跳过")
            continue
        dp = os.path.join(DST_DIR, dst_name)
        process_one(sp, dp)
    print("\n完成 ✓")

if __name__ == "__main__":
    main()
