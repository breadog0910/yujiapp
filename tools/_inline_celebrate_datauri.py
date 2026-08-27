# -*- coding: utf-8 -*-
"""把 celebrate sprite 写成 base64 Data URI 内联进 CSS（终极兜底，零外部 PNG 依赖）。"""
B64_FILE = r"c:\Users\29948\Desktop\workbuddy\tools\_celebrate_b64.txt"
CSS_FILE = r"c:\Users\29948\Desktop\workbuddy\yuji-app\css\tab1-home.css"

with open(B64_FILE, "r", encoding="utf-8") as f:
    b64 = f.read().strip()
print(f"b64 chars: {len(b64)}")

with open(CSS_FILE, "r", encoding="utf-8") as f:
    text = f.read()

old_line = "background-image: url('../assets/pixel/xiaowo-celebrate-match-water.png');"
assert old_line in text, f"Cannot find target line:\n{old_line}"

new_line = f"background-image: url(\"data:image/png;base64,{b64}\");"

new_text = text.replace(old_line, new_line)

with open(CSS_FILE, "w", encoding="utf-8") as f:
    f.write(new_text)

print(f"CSS rewritten: {len(text)} -> {len(new_text)} bytes")
print("Data URI inline OK:", "data:image/png;base64," in new_text)
print("Old URL still present?", old_line in new_text)
