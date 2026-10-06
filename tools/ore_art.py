"""Original pixel art for the upgrade ores (js/upgrades.js), 16x16:
   oreLuck (green, +20%), oreFortune (blue, +50%), oreDivine (gold, 100%)."""
from PIL import Image
import os
ROOT = os.path.join(os.path.dirname(__file__), "..")
O = (24, 18, 26, 255)
ROCK = [(70, 62, 66, 255), (98, 88, 90, 255), (128, 118, 116, 255)]
def ore(dark, mid, light, glow):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); px = im.load()
    # a rough rock lump
    rows = {4: (5, 10), 5: (3, 12), 6: (2, 13), 7: (2, 13), 8: (1, 14), 9: (1, 14), 10: (1, 14), 11: (2, 13), 12: (3, 12), 13: (5, 10)}
    for y, (a, b) in rows.items():
        for x in range(a, b + 1):
            px[x, y] = ROCK[0] if (x + y) % 5 == 0 else ROCK[1] if y > 8 else ROCK[2]
        px[a - 1, y] = O; px[b + 1, y] = O
    for x in range(5, 11): px[x, 3] = O; px[x, 14] = O
    # crystals growing out of it
    for (cx, top, h) in [(5, 2, 6), (8, 0, 8), (11, 3, 5)]:
        for y in range(top, top + h):
            w = 1 if y < top + 2 else 2
            for x in range(cx - w + 1, cx + w):
                px[x, y] = light if x == cx - w + 1 else mid
            px[cx - w, y] = O; px[cx + w, y] = O
        px[cx, top - 1] = O
        px[cx - 1 if cx > 0 else cx, top + h - 1] = dark
    px[7, 2] = glow; px[4, 4] = glow; px[10, 5] = glow
    return im
out = os.path.join(ROOT, "assets/mobs/icons")
ore((20, 110, 50, 255), (60, 200, 100, 255), (170, 255, 190, 255), (240, 255, 240, 255)).save(os.path.join(out, "oreLuck.png"))
ore((20, 60, 150, 255), (60, 140, 255, 255), (170, 220, 255, 255), (240, 250, 255, 255)).save(os.path.join(out, "oreFortune.png"))
ore((150, 90, 10, 255), (250, 196, 50, 255), (255, 240, 160, 255), (255, 255, 255, 255)).save(os.path.join(out, "oreDivine.png"))
print("ok")
