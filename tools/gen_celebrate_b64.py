import base64, os
path = r'c:\Users\29948\Desktop\workbuddy\yuji-app\assets\pixel\xiaowo-celebrate.png'
with open(path, 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
out_path = r'c:\Users\29948\Desktop\workbuddy\tools\_celebrate_b64_new.txt'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(b64)
print(f'Written {len(b64)} chars to {out_path}')
print(f'First 50: {b64[:50]}')
print(f'Last 50: {b64[-50:]}')
