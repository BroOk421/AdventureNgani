#!/usr/bin/env python3
"""
Gives the sleeping player (assets/interior/asesprite/bigbed-sheet.png,
30 frames of 46x54) the player's current hair — per request ("yung pag
tulog ng character di pa update na yung itsura niya nagiging kalbo").
The sheet was drawn with the old bald base; every other player sheet got
outfit #2 (black hair with a small bun). The hair colours are read from
assets/sprites/Idle/Idle_Down-Sheet.png, the head is found per frame from
its skin pixels, and the hair is drawn over the top of it (cap, fringe
down to the brows, sides, bun), leaving the closed eyes and the pillow.
The untouched original is kept as bigbed-sheet_bald.png.
"""
import os, shutil
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, "assets", "interior", "asesprite", "bigbed-sheet.png")
BALD = SHEET.replace(".png", "_bald.png")
if not os.path.exists(BALD): shutil.copy(SHEET, BALD)
s = np.array(Image.open(BALD).convert("RGBA"))
p = np.array(Image.open(os.path.join(ROOT, "assets", "sprites", "Idle", "Idle_Down-Sheet.png")).convert("RGBA"))
HAIR = p[22, 31].copy(); OUT = p[21, 26].copy()
LIGHT = np.clip(HAIR.astype(int) + [28, 28, 34, 0], 0, 255).astype(np.uint8)
FW = 46
def is_skin(px): r, g, b, a = (int(v) for v in px); return a > 0 and r > 200 and g > 130 and 80 < b < 170
for i in range(s.shape[1] // FW):
    f = s[:, i * FW:(i + 1) * FW]
    pts = [(x, y) for y in range(3, 19) for x in range(8, 38) if is_skin(f[y, x])]
    if not pts: continue
    xs = [x for x, _ in pts]; ys = [y for _, y in pts]
    l, r, t = min(xs), max(xs), min(ys); c = (l + r) // 2
    def put(x, y, col):
        if 0 <= x < FW and 0 <= y < f.shape[0]: f[y, x] = col
    for x in range(l + 1, r):             # rounded top
        put(x, t - 2, OUT)
    put(l, t - 1, OUT); put(r, t - 1, OUT)
    for x in range(l + 1, r): put(x, t - 1, HAIR)
    for y in range(t, t + 4):              # cap
        put(l - 1, y, OUT); put(r + 1, y, OUT)
        for x in range(l, r + 1): put(x, y, HAIR)
    put(l - 1, t + 4, OUT); put(r + 1, t + 4, OUT)
    for x in range(l, r + 1):              # fringe — a few strands, skin between
        if (x - l) % 3 != 2: put(x, t + 4, HAIR)
    for y in range(t + 5, t + 7):          # sides
        put(l - 1, y, OUT); put(l, y, HAIR); put(r, y, HAIR); put(r + 1, y, OUT)
    for x in range(c - 1, c + 3):          # small bun
        put(x, t - 3, OUT if x in (c - 1, c + 2) else HAIR)
    for x in range(c, c + 2): put(x, t - 4, OUT)
    for x in range(l + 2, r - 1, 3): put(x, t, LIGHT)  # a bit of shine
Image.fromarray(s).save(SHEET)
print("done", s.shape[1] // FW, "frames")
