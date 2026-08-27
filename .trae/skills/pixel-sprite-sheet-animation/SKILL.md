---
name: "pixel-sprite-sheet-animation"
description: "Turns a sequence of pixel-art character frames into a single-position (no teleporting) frame-by-frame CSS animation. Covers: cutout white bg, anchor-align frames, 6-stage hard-switch keyframes (no % offset bugs), JS trigger, cache busting. Invoke when making sprite-sheet frame animations for pixel characters, pixel pets, or any multi-frame PNG strip that needs to look like ONE character changing poses, not several characters swapping positions."
---

# Pixel Sprite-Sheet Animation (No Teleport / No Swapping)

用于把一组**像素角色动作帧**转换成"同一个小人原地换动作"的连帧动画，绝不出现"好几个小人轮番出现 / 左右瞬移 / 上下滑动"的视觉 bug。

适用场景：
- 像素风主角 / 宠物 / NPC 的逐帧动作循环（喝水、走路、呼吸、睡觉……）
- 多帧 PNG strip / sprite sheet → 单锚点 CSS 动画
- 用户报告"动画看着像好几个小人 / 轮播切换" → 用这个 Skill 重写

---

## 0. 最终效果定义

✅ 正确表现：**同一位置**，一张图 → 撕下 → 下一张图贴到同一位置，视觉上就是"一个小人在做动作"。  
❌ 错误表现（要彻底避免）：
- 帧间角色 X / Y 明显抖动或"瞬移"
- 百分比 `background-position` 造成帧偏移错位
- `steps()` + 百分比位移产生的插值 / 滑步
- 多个 layer 叠层交叉淡入（"轮播白色照片"感）

---

## 1. 素材流水线（4 步，输入 → 可用 sprite sheet）

假设输入是一张 N 帧动作序列图，白底，6 帧横向拼接（最常见的输出格式）。

### 1.1 抠除白底（Cutout）

目标：去掉 sprite sheet 上连到四边的白底，保留角色本体（眼睛里的白、杯口高光等"被角色包围的白"自动保留）。

算法：**从图像 4 条边同时 flood-fill**，把能连通到边缘的 α=255 白像素按"白度"降为 0 α；边缘抗锯齿像素按"越白越透明"做半透明，避免白边。

可复用脚本模板（PIL），改 SRC/BACKUP 路径即可：

```python
# -*- coding: utf-8 -*-
"""Flood-fill 白底抠图：从 4 边向内扩散，连到边缘的白→透明；内部白保留。"""
import os, shutil
from PIL import Image

SRC    = r"<your project>/assets/pixel/character-action.png"
BACKUP = r"<your project>/assets/pixel/character-action.original.png"

def cutout(path_in, path_out, white_thr=245, edge_alpha_thr=30):
    if not os.path.exists(BACKUP):
        shutil.copy2(SRC, BACKUP)
    img = Image.open(path_in).convert("RGBA")
    w, h = img.size
    px = img.load()
    visited = [[False]*h for _ in range(w)]
    # 种子：4 条边上的白像素
    stack = []
    for x in range(w):
        for y in (0, h-1):
            r,g,b,a = px[x,y]
            if a>0 and r>=white_thr and g>=white_thr and b>=white_thr:
                stack.append((x,y)); visited[x][y]=True
    for y in range(h):
        for x in (0, w-1):
            r,g,b,a = px[x,y]
            if a>0 and r>=white_thr and g>=white_thr and b>=white_thr:
                stack.append((x,y)); visited[x][y]=True
    while stack:
        x, y = stack.pop()
        r,g,b,a = px[x,y]
        if a<=0: continue
        if r>=white_thr and g>=white_thr and b>=white_thr:
            px[x,y] = (0,0,0,0)                 # 纯白 → 全透
        else:
            whiteness = (r+g+b)/3 / 255.0       # 边缘抗锯齿 → 按白度半透
            px[x,y] = (r,g,b, max(0, int(a*(1-whiteness))))
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if 0<=nx<w and 0<=ny<h and not visited[nx][ny]:
                r2,g2,b2,a2 = px[nx,ny]
                if a2>0:
                    visited[nx][ny]=True
                    stack.append((nx,ny))
    img.save(path_out)
    # 报告透明占比
    transparent = sum(1 for y in range(h) for x in range(w) if px[x,y][3]<=edge_alpha_thr)
    print(f"cutout saved -> {path_out} ({w}x{h}), alpha<=30: {100*transparent/(w*h):.1f}%")

cutout(SRC, SRC)
```

跑完看"透明占比"一般在 30%~60% 之间；<10% 说明没抠到，>95% 说明抠过了角色都没了。

### 1.2 把 N 帧对齐到同一锚点（Eliminate Teleport）

动画瞬移的根因：**每帧角色 bbox 宽高不同（举手 bbox 变宽、下蹲 bbox 变高）**，用 bbox 中心对齐 ≠ 身体中心对齐，连帧时身体中心跳来跳去。

正确做法：**挑角色身体上"每帧位置都不会动的点"做锚点**，例如脚底中心 / 头顶中点 / 腰带扣位置。对喝水/站立类循环，选"脚底中心"最稳妥。

对齐算法（PIL，以脚底中心为例）：
1. 切成 N 帧，每帧抠出角色 bbox
2. 在每帧底部 ~12% 高度范围内（脚部区域），找所有非透明像素 X 的**中位数**作"脚底中心 X"；取 bbox 最大 Y 作"脚底中心 Y"
3. 新建统一画布（max_w + 2pad, max_h + 2pad），把每帧角色贴上去，使 (脚底中心 X, 脚底中心 Y) 对齐画布 (w/2, h - pad)
4. 重排成**横向 sprite sheet**（CSS 部分默认横向）

可复用脚本模板（6 帧横向输入 → 6 帧横向对齐输出）：

```python
# -*- coding: utf-8 -*-
"""把 sprite sheet N 帧按"脚底中心"锚点对齐，消除瞬移。输出仍为横向 sheet。"""
import os, shutil
from PIL import Image

SRC       = r"<your project>/assets/pixel/character-action.png"
UNALIGNED = r"<your project>/assets/pixel/character-action.unaligned.png"
FRAME_COUNT = 6
PAD = 2
FOOT_BAND_RATIO = 0.12   # 脚底带：角色最下面 12% 的像素行（脚部不动）

def bbox(img):
    w,h = img.size; px = img.load()
    mnx,mny,mxx,mxy = w,h,-1,-1
    for y in range(h):
        for x in range(w):
            if px[x,y][3] > 30:
                if x<mnx: mnx=x
                if y<mny: mny=y
                if x>mxx: mxx=x
                if y>mxy: mxy=y
    return (mnx,mny,mxx,mxy)

def foot_anchor(frame_img, bbox_):
    cx0,cy0,cx1,cy1 = bbox_
    ch = cy1-cy0+1
    band_h = max(2, int(ch*FOOT_BAND_RATIO))
    by0, by1 = cy1-band_h+1, cy1
    px = frame_img.load()
    xs = []
    for y in range(by0, by1+1):
        for x in range(cx0, cx1+1):
            if px[x,y][3] > 30: xs.append(x)
    if not xs: return ((cx0+cx1)//2, cy1)
    xs.sort(); fx = xs[len(xs)//2]
    return (fx, cy1)

def main():
    if not os.path.exists(UNALIGNED): shutil.copy2(SRC, UNALIGNED)
    sheet = Image.open(UNALIGNED).convert("RGBA")
    W, H = sheet.size
    FW = W // FRAME_COUNT
    chars, anchors = [], []
    mxw = mxh = 0
    for i in range(FRAME_COUNT):
        x0, x1 = i*FW, (i+1)*FW if i<FRAME_COUNT-1 else W
        frame = sheet.crop((x0,0,x1,H))
        bb = bbox(frame)
        if bb[2]<0: continue
        char = frame.crop(bb); chars.append(char)
        fx, fy = foot_anchor(frame, bb)
        # 锚点换算成 char 裁剪后的本地坐标
        fx_local = fx - bb[0]; fy_local = fy - bb[1]
        anchors.append((fx_local, fy_local))
        mxw, mxh = max(mxw, char.size[0]), max(mxh, char.size[1])
    cw, ch = mxw + PAD*2, mxh + PAD*2
    frames = []
    for char, (fx,fy) in zip(chars, anchors):
        canvas = Image.new("RGBA", (cw, ch), (0,0,0,0))
        paste_x = cw//2 - fx
        paste_y = (ch - PAD) - fy
        canvas.paste(char, (paste_x, paste_y), char)
        frames.append(canvas)
    out = Image.new("RGBA", (cw*FRAME_COUNT, ch), (0,0,0,0))
    for i, f in enumerate(frames): out.paste(f, (i*cw, 0), f)
    out.save(SRC)
    print(f"aligned sheet -> {SRC} ({out.size}), frame={cw}x{ch}")

main()
```

对齐后校验：每帧在画布坐标里脚底中心 X = canvas_w / 2，允许 ±2px 像素误差。

### 1.3 选锚点的经验
| 动作类型 | 推荐锚点 | FOOT_BAND_RATIO / 说明 |
|---|---|---|
| 站立/喝水/呼吸 | 脚底中心（中位数 X）| 0.10 ~ 0.15 |
| 走路/跑步（有抬脚）| 腰带扣中心 / 胯部中心点 | 在腰带垂直带内取非透明像素中位数 |
| 飞行/飘浮（全身动）| 头顶中线 | 最上方像素的 X 中位数 |
| 躺卧/睡觉 | 身体最长轴中点 | 手动改脚本，按身体主轴中位数对齐 |

### 1.4 输出格式
- **必须横向排列**（后续 CSS 模板默认横向）：Frame 0 → Frame 1 → … → Frame N-1，从左到右
- 每帧必须等宽等高（对齐脚本已保证）
- 最终 sheet 尺寸 = `(单帧宽 × N帧) × 单帧高`

---

## 2. CSS 动画模板（核心，避开所有坑）

### 2.1 ❌ 三种绝不能用的写法
1. **`background-position: 0% → 100%` + `background-size: 600% 100%`**  
   原因：百分比定位公式 `pos = pct × (容器 - 图片)`，1/6 百分比不等于"移动一帧宽"，每帧偏移歪 16.7%，视觉上每帧都在不同位置 → 好几个小人轮番出现。
2. **`steps(N, end)` + 百分比偏移**  
   `steps()` 的语义是"在关键帧之间做 N 等分过渡"，遇上百分比公式再叠加，位置只会更乱。
3. **N 个 layer 叠层 + opacity 交叉淡入**  
   角色本体不同宽度时，叠层视觉是"一张白照片淡入淡出"，不是逐帧动作。只有像素颜色过渡的特效（如发光、闪光）才适合 opacity crossfade。

### 2.2 ✅ 唯一推荐写法：N 段硬切 keyframes + 像素偏移

```css
/* ============== 容器 ============== */
/* 尺寸按"单帧实际像素比例 × 显示缩放因子"计算。
   例：单帧 155×254，显示缩放 0.284 → 显示尺寸 44×72。 */
.sprite {
  --frame-w: 44px;       /* 显示出来的一帧宽 */
  --frame-h: 72px;       /* 显示出来的一帧高 */
  --frame-count: 6;      /* 帧数 */
  --frame-dur: 220ms;    /* 每帧停留时长（调大变慢，调小变快）*/
  --loops: 2;            /* 触发时默认播 N 轮（CSS 变量，JS 可覆写）*/

  width:  var(--frame-w);
  height: var(--frame-h);
  position: absolute;    /* 或 relative / static，按需 */
  cursor: pointer;
  image-rendering: pixelated;         /* 像素风必须有，否则边缘糊 */
}

/* ============== sprite 载体（一个元素就够，不需要 N 个） ============== */
.sprite-inner {
  position: absolute;
  inset: 0;
  background-image: url('../assets/pixel/character-action.png?v=1');
  /* 宽 = 单帧宽 × 帧数；高 = 单帧高。不用百分比。 */
  background-size: calc(var(--frame-w) * var(--frame-count)) 100%;
  background-repeat: no-repeat;
  background-position: 0 0;           /* 默认显示第 0 帧（站定 / 待机）*/
  filter: drop-shadow(0 2px 2px rgba(0,0,0,0.25));
}

/* ============== 触发类：加类就播动画，移类就停 ============== */
.sprite.is-playing .sprite-inner {
  /* 总时长 = 单帧时长 × 帧数；播放 N 轮后自动停（JS 同步 setTimeout 移除类） */
  animation: sprite-play calc(var(--frame-dur) * var(--frame-count)) var(--loops);
}

/* ============== N 段式硬切换 keyframes ==============
   6 帧示例。改 --frame-count 时同步调整 keyframes 段数。
   每一段百分比 = 时间占比：1/N ≈ 16.667%。每段内部 background-position 写死像素，
   就是"一张图贴上去→撕→下一张贴上去"，无任何插值/滑步。 */
@keyframes sprite-play {
  0%,          16.666%  { background-position:     0        0; }  /* 第 0 帧 */
  16.667%,     33.333%  { background-position: -44px       0; }  /* 第 1 帧 = -1w */
  33.334%,     50%      { background-position: -88px       0; }  /* 第 2 帧 = -2w */
  50.001%,     66.666%  { background-position: -132px      0; }  /* 第 3 帧 = -3w */
  66.667%,     83.333%  { background-position: -176px      0; }  /* 第 4 帧 = -4w */
  83.334%,     100%     { background-position: -220px      0; }  /* 第 5 帧 = -5w */
}

/* ============== 辅助类 ============== */
/* 暂停：弹窗压栈 / 编辑模式时定住 */
.sprite.paused .sprite-inner { animation-play-state: paused; }

/* 永远循环模式（待机动画）：把 .is-playing 换成 .is-idle，--loops 改成 infinite */
.sprite.is-idle .sprite-inner {
  animation: sprite-play calc(var(--frame-dur) * var(--frame-count)) infinite;
}
```

**关键帧段数生成规则**（不用手写，通用公式）：
```
段数 = --frame-count
第 n 帧（n=0..N-1）背景偏移 =  -(n × --frame-w)  px
每段起点百分比 =  n      / N × 100 （+ 0.001 小偏移避免两帧同百分比冲突）
每段结束百分比 = (n+1)   / N × 100 （- 0.001）
```

### 2.3 等比例显示尺寸计算
单帧原始像素宽 W₀ 高 H₀ → 显示宽 W → 显示高 = `round(W × H₀ / W₀)`。  
例：155×254 → 宽缩放到 44 → 高 = 44×254/155 ≈ 72.05 → **72px**。不要手估高度，拉伸会让像素走样。

---

## 3. JS 触发 + 状态同步模板

```js
/**
 * 触发 sprite 角色动作：加类 → 播 N 轮 → 自动移除类回到待机（第 0 帧）。
 * @param {HTMLElement} spriteEl     —— .sprite 容器
 * @param {number}      loops        —— 播放轮数（默认读 CSS --loops）
 * @param {number}      frameDurMs   —— 单帧时长（默认读 CSS --frame-dur）
 * @param {number}      frameCount   —— 帧数（默认读 CSS --frame-count）
 */
let __spriteTimer = null;
export function playSpriteAction(spriteEl, { loops, frameDurMs, frameCount } = {}) {
  if (!spriteEl) return;
  if (__spriteTimer) { clearTimeout(__spriteTimer); __spriteTimer = null; }

  // 读 CSS 变量的默认值
  const cs = getComputedStyle(spriteEl);
  const d = frameDurMs ?? parseFloat(cs.getPropertyValue('--frame-dur')) || 220;
  const n = frameCount ?? parseInt(cs.getPropertyValue('--frame-count'), 10) || 6;
  const k = loops     ?? parseInt(cs.getPropertyValue('--loops'), 10) || 1;

  // 重置动画：先移类 → 强制 reflow → 再加类，保证从第 0 帧重开
  spriteEl.classList.remove('is-playing');
  void spriteEl.offsetWidth;
  spriteEl.classList.add('is-playing');

  const totalMs = d * n * k + 200;   // +200ms 缓冲，等最后一帧彻底显示完
  __spriteTimer = setTimeout(() => {
    spriteEl.classList.remove('is-playing');
    __spriteTimer = null;
  }, totalMs);
}
```

要点：
- **先 remove → reflow → add**，保证第二次及以后触发都从第 0 帧开始，不会从"停在哪帧就从哪帧接着播"。
- setTimeout 时长 = `d*n*k`（总动画时长）+ 小缓冲，避免 CSS 动画还没跑完 JS 就移类。

---

## 4. 缓存 Busting

浏览器对 background-image URL 极强缓存，会出现"CSS/JS 都对但 sprite sheet 还是旧的"。每次改图或改 CSS 后三件套一起升：

```html
<!-- 1. 引入 CSS 的 <link> 加版本号 -->
<link rel="stylesheet" href="css/sprite.css?v=34" />

<!-- 2. 引用 sprite URL 在 CSS 中加查询串（见 2.2 模板的 ?v=1） -->
<!-- 3. 必要时（sprite 文件名没变但内容重写过）URL 版本号 +1: ?v=2 -->
```

用户报告"还是旧的 / 还是瞬移"→ 第一步：**让他 Ctrl+F5 或 Ctrl+Shift+R 硬刷**。

---

## 5. 自测 Checklist（每一步都要过）

做完后按顺序核对：

| # | 检查项 | 过的标准 |
|---|---|---|
| 1 | 抠图质量 | DevTools Elements 选中 .sprite，背景四周是棋盘格（透明）；无连到边缘的大片白 |
| 2 | 对齐质量 | 打开 sprite sheet 原始 PNG，逐帧看：脚 / 头 / 腰带 等基准点是否在一条直线，肉眼不能有左右跳 |
| 3 | 默认静态 | .sprite 默认只显示 1 个角色，尺寸正确，不糊，不压扁 |
| 4 | 位置 | DevTools 手动改 background-position 为 -44, -88, -132, -176, -220px，每帧角色 X/Y 保持一致，像同一个人在换动作 |
| 5 | 触发动画 | DevTools Console `el.classList.add('is-playing')`，动画播完自动停止，不会循环 |
| 6 | 多次触发 | 连续 add/remove 三次，每次都从第 0 帧开始，没有"叠加动画" |
| 7 | 清缓存验证 | Ctrl+F5 后以上全部仍然成立 |

---

## 6. 常见故障 + 修复

| 现象 | 根因 | 修复 |
|---|---|---|
| 动画时小人左右瞬移 | 6 帧没锚点对齐 | 重跑 §1.2 对齐脚本，换更稳定的锚点 |
| 动画时小人上下滑 | background-size 用了百分比 / 容器高度算错 | 重算 §2.3 的比例；把 background-size 改成 calc(N×w) 100% 像素 |
| 每帧角色"缩小一圈放大一圈" | 容器高 / 宽不匹配角色比例（压扁了举手帧） | 重算显示尺寸（§2.3）|
| 动画根本不播 | 缺 .is-playing 类 / JS 没触发 | Console 跑 `el.classList.add('is-playing')` 手动验证 |
| 第二次触发从中间帧开始 | 没做 remove → reflow → add 三步重置 | 抄 §3 模板固定写法 |
| sprite sheet"怎么改都不变" | 浏览器缓存 | 升 CSS 版本号 + sprite URL ?v=xx + Ctrl+F5 |

---

## 7. 可复用脚本（如果项目里已有，按需引用）

如果当前项目 `tools/` 目录里已有这些脚本，改路径常量后直接复用：
- `tools/cutout_xxx.py` → §1.1 白底抠除
- `tools/align_xxx_v2.py` → §1.2 脚底中心锚点对齐
