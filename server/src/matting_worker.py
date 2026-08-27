"""
matting_worker.py — 本地 Python 抠图子进程
用法： python matting_worker.py <input_path> <output_path> [--alpha-matting]

返回：进程退出码 0 成功，非 0 失败；stderr 输出错误信息。
核心依赖：rembg + onnxruntime + pillow
首次运行会自动下载 U2Net 模型 (~176MB) 到用户缓存目录。
"""
import argparse
import os
import sys
import traceback


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', help='输入图片路径')
    ap.add_argument('output', help='输出 PNG 路径')
    ap.add_argument('--alpha-matting', action='store_true', help='启用 alpha matting 精修边缘（更慢但边缘更干净）')
    args = ap.parse_args()

    if not os.path.exists(args.input):
        print(f'输入文件不存在: {args.input}', file=sys.stderr)
        return 2

    try:
        # 延迟 import：安装未完成时能清晰报"缺少模块"，而不是 argparse 阶段就炸
        from rembg import remove
        from PIL import Image
    except Exception as e:
        print(
            '抠图依赖缺失：' + str(e) +
            '\n请执行：pip install rembg[cpu] onnxruntime pillow',
            file=sys.stderr)
        return 3

    try:
        out_dir = os.path.dirname(os.path.abspath(args.output))
        if out_dir and not os.path.exists(out_dir):
            os.makedirs(out_dir, exist_ok=True)

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
        img.save(args.output, format='PNG', optimize=True)

        return 0
    except Exception as e:
        # 只在 stderr 输出一条简洁错误，避免 onnx/numpy 的冗长堆栈污染 stdout
        short = ''.join(traceback.format_exception_only(type(e), e)).strip()
        print(f'抠图失败：{short}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
