from PIL import Image

EDGE = 30

def check_sprite(path, label):
    img = Image.open(path).convert("RGBA")
    px = img.load()
    W, H = img.size
    FW = W // 6
    print(f"=== {label} ===")
    print(f"  sprite: {W}x{H}, 单帧: {FW}x{H}")
    centers = []
    for i in range(6):
        # 从底部往上找最底非透明行
        bottom_row = -1
        for y in range(H-1, -1, -1):
            for x in range(i*FW, (i+1)*FW):
                if px[x,y][3] > EDGE:
                    bottom_row = y
                    break
            if bottom_row >= 0:
                break
        if bottom_row < 0:
            print(f"  frame {i}: 无像素")
            continue
        # 该行的非透明像素 X 范围和中点
        xs = [x - i*FW for x in range(i*FW, (i+1)*FW) if px[x, bottom_row][3] > EDGE]
        center = (min(xs) + max(xs)) // 2
        centers.append(center)
        print(f"  frame {i}: 最底行 y={bottom_row}, x={min(xs)}~{max(xs)}, 中心={center}")
    if centers:
        r = max(centers) - min(centers)
        print(f"  X range: {min(centers)}~{max(centers)}, diff={r}px")
        if r <= 2:
            print(f"  [OK] 对齐良好")
        else:
            print(f"  [WARN] 仍有 {r}px 偏移")
    print()

check_sprite(r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.png", "庆祝 sprite")
check_sprite(r"c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-drinking.png", "喝水 sprite (对照)")