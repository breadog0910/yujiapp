import re
import base64
from PIL import Image

# ===== 1. 验证 CSS base64 是否与 sprite 文件匹配 =====
print("=" * 60)
print("1. CSS base64 vs sprite file match check")
print("=" * 60)

with open('yuji-app/css/tab1-home.css', 'r', encoding='utf-8') as f:
    css = f.read()

match = re.search(r'url\("data:image/png;base64,([^"]+)"\)', css)
if match:
    css_b64 = match.group(1)
    print(f"CSS base64 length: {len(css_b64)}")
else:
    print("❌ No base64 data URI found in CSS")
    css_b64 = None

with open('yuji-app/assets/pixel/xiaowo-celebrate.png', 'rb') as f:
    file_b64 = base64.b64encode(f.read()).decode()
print(f"File base64 length: {len(file_b64)}")

if css_b64 and css_b64 == file_b64:
    print("✅ CSS base64 MATCHES sprite file")
else:
    print("❌ MISMATCH!")
    if css_b64:
        print(f"  CSS starts: {css_b64[:30]}")
        print(f"  File starts: {file_b64[:30]}")

# ===== 2. 检查原图每帧内容 =====
print("\n" + "=" * 60)
print("2. Original source image frame analysis")
print("=" * 60)

src = Image.open('a06fb0d9120edfc77b7fbbd72a1b016b.png')
print(f"Source size: {src.size}")
W, H = src.size
FW = W // 6

for i in range(6):
    frame = src.crop((i*FW, 0, (i+1)*FW, H))
    px = frame.load()
    # Count non-transparent pixels
    non_trans = sum(1 for y in range(H) for x in range(FW) if px[x,y][3] > 0)
    # Find bbox
    mnx, mny, mxx, mxy = FW, H, -1, -1
    for y in range(H):
        for x in range(FW):
            if px[x,y][3] > 30:
                if x < mnx: mnx = x
                if y < mny: mny = y
                if x > mxx: mxx = x
                if y > mxy: mxy = y
    if mxx >= 0:
        print(f"Frame {i}: {non_trans} non-transparent, bbox=({mnx},{mny},{mxx},{mxy})")
    else:
        print(f"Frame {i}: EMPTY")

# ===== 3. 检查最终 sprite 每帧内容 =====
print("\n" + "=" * 60)
print("3. Final sprite frame analysis")
print("=" * 60)

sprite = Image.open('yuji-app/assets/pixel/xiaowo-celebrate.png')
print(f"Sprite size: {sprite.size}")
SW, SH = sprite.size
SFW = SW // 6

for i in range(6):
    frame = sprite.crop((i*SFW, 0, (i+1)*SFW, SH))
    px = frame.load()
    non_trans = sum(1 for y in range(SH) for x in range(SFW) if px[x,y][3] > 30)
    mnx, mny, mxx, mxy = SFW, SH, -1, -1
    for y in range(SH):
        for x in range(SFW):
            if px[x,y][3] > 30:
                if x < mnx: mnx = x
                if y < mny: mny = y
                if x > mxx: mxx = x
                if y > mxy: mxy = y
    if mxx >= 0:
        # Find foot center
        ch = mxy - mny + 1
        band_h = max(2, int(ch * 0.12))
        by0 = mxy - band_h + 1
        xs = []
        for y in range(by0, mxy+1):
            for x in range(mnx, mxx+1):
                if px[x,y][3] > 30:
                    xs.append(x)
        xs.sort()
        fc = xs[len(xs)//2] if xs else -1
        print(f"Frame {i}: {non_trans} non-transparent, bbox=({mnx},{mny},{mxx},{mxy}), foot_cx={fc}")
    else:
        print(f"Frame {i}: EMPTY")

# ===== 4. 检查 drinking sprite 作为参考 =====
print("\n" + "=" * 60)
print("4. Drinking sprite frame analysis (reference)")
print("=" * 60)

drink = Image.open('yuji-app/assets/pixel/xiaowo-drinking.png')
DW, DH = drink.size
DFW = DW // 6
print(f"Drinking sprite size: {drink.size}")

for i in range(6):
    frame = drink.crop((i*DFW, 0, (i+1)*DFW, DH))
    px = frame.load()
    non_trans = sum(1 for y in range(DH) for x in range(DFW) if px[x,y][3] > 30)
    mnx, mny, mxx, mxy = DFW, DH, -1, -1
    for y in range(DH):
        for x in range(DFW):
            if px[x,y][3] > 30:
                if x < mnx: mnx = x
                if y < mny: mny = y
                if x > mxx: mxx = x
                if y > mxy: mxy = y
    if mxx >= 0:
        ch = mxy - mny + 1
        band_h = max(2, int(ch * 0.12))
        by0 = mxy - band_h + 1
        xs = []
        for y in range(by0, mxy+1):
            for x in range(mnx, mxx+1):
                if px[x,y][3] > 30:
                    xs.append(x)
        xs.sort()
        fc = xs[len(xs)//2] if xs else -1
        print(f"Frame {i}: {non_trans} non-transparent, bbox=({mnx},{mny},{mxx},{mxy}), foot_cx={fc}")
    else:
        print(f"Frame {i}: EMPTY")
