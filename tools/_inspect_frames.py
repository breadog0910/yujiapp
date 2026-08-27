from PIL import Image
import os

os.makedirs('tools/_inspect', exist_ok=True)

sprite = Image.open('yuji-app/assets/pixel/xiaowo-celebrate.png')
W, H = sprite.size
FW = W // 6

for i in range(6):
    frame = sprite.crop((i*FW, 0, (i+1)*FW, H))
    # Add checkerboard background for visibility
    from PIL import ImageDraw
    check = Image.new('RGBA', frame.size, (255, 255, 255, 255))
    for y in range(0, frame.height, 16):
        for x in range(0, frame.width, 16):
            if (x//16 + y//16) % 2 == 0:
                ImageDraw.floodfill(check, (x, y), (200, 200, 200), thresh=10)
    check.paste(frame, (0, 0), frame)
    check.save(f'tools/_inspect/celebrate_frame_{i}.png')
    
    # Also save raw frame
    frame.save(f'tools/_inspect/celebrate_frame_{i}_raw.png')
    
    # Print bottom band pixel distribution
    px = frame.load()
    by0 = H - 30
    xs = []
    for y in range(by0, H):
        for x in range(FW):
            if px[x,y][3] > 30:
                xs.append(x)
    if xs:
        xs.sort()
        print(f"Frame {i}: bottom band has {len(xs)} pixels, x range {min(xs)}~{max(xs)}, median x={xs[len(xs)//2]}")
    else:
        print(f"Frame {i}: no bottom pixels")

print("\nSaved frames to tools/_inspect/")
