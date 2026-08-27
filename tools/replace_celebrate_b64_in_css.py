import re, base64

css_path = r'c:\Users\29948\Desktop\workbuddy\yuji-app\css\tab1-home.css'
b64_path = r'c:\Users\29948\Desktop\workbuddy\tools\_celebrate_b64_new.txt'

with open(b64_path, 'r', encoding='utf-8') as f:
    new_b64 = f.read().strip()

with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# Replace the old base64 inside .xiaowo-celebrate's background-image
# Pattern: find the data:image/png;base64,... between the quotes for .xiaowo-celebrate block
pattern = r'(\.xiaowo-celebrate\s*\{[^}]*?background-image:\s*url\("data:image/png;base64,)([^"\)]+)("\);)'
match = re.search(pattern, css, re.DOTALL)
if match:
    print(f'Found old base64: len={len(match.group(2))}')
    print(f'Old first 50: {match.group(2)[:50]}')
    print(f'Old last 50: {match.group(2)[-50:]}')
    new_css = css[:match.start(2)] + new_b64 + css[match.end(2):]
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(new_css)
    print(f'\nSUCCESS: replaced base64 (new len={len(new_b64)})')
else:
    print('ERROR: pattern not found')
    # Try alternate simpler pattern
    pattern2 = r'(background-image:\s*url\("data:image/png;base64,)([^"\)]+)'
    matches = list(re.finditer(pattern2, css))
    print(f'Alternate pattern found {len(matches)} matches')
    for i, m in enumerate(matches):
        print(f'  Match {i}: len={len(m.group(2))}, first 30={m.group(2)[:30]}')
