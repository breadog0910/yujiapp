"""
matting_worker.py — 本地 Python 抠图子进程
用法： python matting_worker.py <input_path> <output_path> [选项]

返回：进程退出码 0 成功，非 0 失败；stderr 输出错误信息。
核心依赖：rembg + onnxruntime + pillow + numpy
首次运行会自动下载 U2Net 模型 (~176MB) 到用户缓存目录。

选项：
  --alpha-matting        启用 alpha matting 精修边缘（更慢但边缘更干净）
  --fill-holes           填充家具内部破洞（默认开启，让家具遮得住背景）
  --no-fill-holes        关闭内部填洞
  --fill-only            跳过 rembg，仅对已有透明图做填洞（用于修复已抠好的图）
  --alpha-thr N          判定前景的 alpha 阈值（默认 30）
  --hole-max-area N      超过该面积的内部洞视为"真实镂空"不填充（默认 0=全填）
"""
import argparse
import os
import sys
import traceback

import numpy as np
from PIL import Image


def fill_interior_holes(img, alpha_thr=30, max_iter=600, hole_max_area=0):
    """把 alpha 中"与边缘不连通"的内部透明区填上最近家具本色，并置为不透明。
    外部背景（与边相连）保持透明。真实的大镂空可用 hole_max_area 保留。"""
    arr = np.array(img.convert('RGBA'))
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]
    fg = alpha > alpha_thr
    if fg.all():
        return img
    bg = ~fg

    # 1) 从四边 flood，标记"外部背景"
    from collections import deque
    exterior = np.zeros((h, w), dtype=bool)
    dq = deque()

    def mark(x, y):
        if 0 <= x < w and 0 <= y < h and bg[y, x] and not exterior[y, x]:
            exterior[y, x] = True
            dq.append((x, y))

    for x in range(w):
        mark(x, 0)
        mark(x, h - 1)
    for y in range(h):
        mark(0, y)
        mark(w - 1, y)
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            mark(x + dx, y + dy)

    holes = bg & ~exterior

    # 2) 过滤过大的洞（视为真实镂空，例如椅子靠背、置物架空格）
    if hole_max_area and holes.any():
        # 连通分量标注（numpy + BFS）
        labeled = np.zeros((h, w), dtype=np.int32)
        cur = 0
        keep = np.zeros_like(holes)
        ys, xs = np.where(holes)
        # 用 union-find 做连通分量
        parent = {}

        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a

        coord_of = {}
        for i in range(len(ys)):
            y, x = int(ys[i]), int(xs[i])
            neigh = []
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and holes[ny, nx]:
                    idx = ny * w + nx
                    if idx in parent:
                        neigh.append(find(idx))
            if not neigh:
                cur += 1
                rid = cur
            else:
                rid = min(neigh)
            me = y * w + x
            parent[me] = me
            coord_of[me] = (y, x)
            for r in neigh:
                parent[r] = rid
                parent[me] = rid
        # 统计每个根的面积
        size_by_root = {}
        for me in coord_of:
            r = find(me)
            size_by_root[r] = size_by_root.get(r, 0) + 1
        for me, (y, x) in coord_of.items():
            r = find(me)
            if size_by_root[r] <= hole_max_area:
                keep[y, x] = True
        holes = keep

    if not holes.any():
        return img

    # 3) 限定到洞的 bbox + 余量，做 grassfire 颜色扩散
    ys, xs = np.where(holes)
    y0, y1 = max(0, int(ys.min()) - max_iter), min(h, int(ys.max()) + max_iter)
    x0, x1 = max(0, int(xs.min()) - max_iter), min(w, int(xs.max()) + max_iter)
    sub = arr[y0:y1, x0:x1].copy()
    subholes = holes[y0:y1, x0:x1]

    val = sub[:, :, :3].astype(np.float32)
    val[sub[:, :, 3] <= alpha_thr] = np.nan  # 洞+外部背景都置 nan

    for _ in range(max_iter):
        new = val.copy()
        up = np.full_like(val, np.nan)
        up[1:] = val[:-1]
        new = np.where(np.isnan(new) & ~np.isnan(up), up, new)
        down = np.full_like(val, np.nan)
        down[:-1] = val[1:]
        new = np.where(np.isnan(new) & ~np.isnan(down), down, new)
        left = np.full_like(val, np.nan)
        left[:, 1:] = val[:, :-1]
        new = np.where(np.isnan(new) & ~np.isnan(left), left, new)
        right = np.full_like(val, np.nan)
        right[:, :-1] = val[:, 1:]
        new = np.where(np.isnan(new) & ~np.isnan(right), right, new)
        if np.allclose(new, val, equal_nan=True):
            val = new
            break
        val = new

    sub[:, :, :3][subholes] = np.nan_to_num(val[subholes], nan=0).astype(np.uint8)
    sub[:, :, 3][subholes] = 255
    arr[y0:y1, x0:x1] = sub
    return Image.fromarray(arr, 'RGBA')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', help='输入图片路径')
    ap.add_argument('output', help='输出 PNG 路径')
    ap.add_argument('--alpha-matting', action='store_true', help='启用 alpha matting 精修边缘（更慢但边缘更干净）')
    ap.add_argument('--fill-holes', dest='fill_holes', action='store_true', default=True, help='填充家具内部破洞（默认）')
    ap.add_argument('--no-fill-holes', dest='fill_holes', action='store_false', help='关闭内部填洞')
    ap.add_argument('--fill-only', action='store_true', help='跳过 rembg，仅对已有透明图做填洞')
    ap.add_argument('--alpha-thr', type=int, default=30, help='判定前景的 alpha 阈值')
    ap.add_argument('--hole-max-area', type=int, default=0, help='超过该面积的内部洞视为真实镂空不填充（0=全填）')
    args = ap.parse_args()

    if not os.path.exists(args.input):
        print(f'输入文件不存在: {args.input}', file=sys.stderr)
        return 2

    try:
        from rembg import remove
    except Exception as e:
        print(
            '抠图依赖缺失：' + str(e) +
            '\n请执行：pip install rembg[cpu] onnxruntime pillow numpy',
            file=sys.stderr)
        return 3

    try:
        out_dir = os.path.dirname(os.path.abspath(args.output))
        if out_dir and not os.path.exists(out_dir):
            os.makedirs(out_dir, exist_ok=True)

        if args.fill_only:
            # 仅填洞，不再跑 rembg（用于修复已抠好的图）
            img = Image.open(args.input).convert('RGBA')
            if args.fill_holes:
                img = fill_interior_holes(img, args.alpha_thr, hole_max_area=args.hole_max_area)
            img.save(args.output, format='PNG', optimize=True)
            return 0

        # 读取输入
        with open(args.input, 'rb') as f:
            in_bytes = f.read()

        # 抠图（返回 PNG bytes）
        out_bytes = remove(
            in_bytes,
            alpha_matting=args.alpha_matting,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=8,
        )

        # 写出；强制 RGBA 并保存为 PNG
        import io
        img = Image.open(io.BytesIO(out_bytes)).convert('RGBA')
        if args.fill_holes:
            img = fill_interior_holes(img, args.alpha_thr, hole_max_area=args.hole_max_area)
        img.save(args.output, format='PNG', optimize=True)

        return 0
    except Exception as e:
        # 只在 stderr 输出一条简洁错误，避免 onnx/numpy 的冗长堆栈污染 stdout
        short = ''.join(traceback.format_exception_only(type(e), e)).strip()
        print(f'抠图失败：{short}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
