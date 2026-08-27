# -*- coding: utf-8 -*-
"""调试：打印田地图片的像素样本，帮助校准抠图阈值和土壤阈值。"""
from PIL import Image

SRC = r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\field\field-base-9grid.original.png"

img = Image.open(SRC).convert("RGBA")
w, h = img.size
print(f"size: {w}x{h}")
px = img.load()

# 四个角 + 边上若干样本（这些地方应该是白底）
print("\n--- 边角/边缘样本 (应该是白底) ---")
for name, x, y in [
    ("左上", 0, 0), ("右上", w-1, 0), ("左下", 0, h-1), ("右下", w-1, h-1),
    ("上边中", w//2, 0), ("下边中", w//2, h-1),
    ("左边中", 0, h//2), ("右边中", w-1, h//2),
    ("内边 10%", w//10, h//10), ("内边 90%", int(w*0.9), int(h*0.9)),
]:
    r, g, b, a = px[x, y]
    print(f"{name:8} ({x:>3},{y:>3}) = RGBA({r:>3},{g:>3},{b:>3},{a:>3})")

# 9 块田中心附近采样（目测坐标：按等距 3x3 的中心）
print("\n--- 9 块田中心附近采样 (应该是棕色土壤) ---")
# 左上田、上中田、右上田；左中、正中、右中；左下、下中、右下
samples = [
    ("T0 上中", w*0.50, h*0.28),
    ("T1 左1",  w*0.30, h*0.40),
    ("T2 右1",  w*0.70, h*0.40),
    ("T3 左2",  w*0.18, h*0.53),
    ("T4 正中", w*0.50, h*0.53),
    ("T5 右2",  w*0.82, h*0.53),
    ("T6 左3",  w*0.30, h*0.66),
    ("T7 右3",  w*0.70, h*0.66),
    ("T8 下中", w*0.50, h*0.78),
    ("木框 顶", w*0.50, h*0.15),
    ("木框 底", w*0.50, h*0.90),
    ("田沟(深)", w*0.50, h*0.40),
]
for name, x, y in samples:
    xi, yi = int(x), int(y)
    r, g, b, a = px[xi, yi]
    # 判断是否接近白
    white_dist = max(255-r, 255-g, 255-b)
    print(f"{name:8} ({xi:>3},{yi:>3}) = RGBA({r:>3},{g:>3},{b:>3},{a:>3})  距纯白={white_dist}")
