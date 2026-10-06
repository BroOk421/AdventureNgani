"""Original gold coin (js/combat.js): assets/mobs/icons/goldCoin.png (16x16, the item icon)
   and assets/mobs/icons/goldCoin_spin.png (8 frames of 16x16, a spinning coin) — used for the
   gold mobs drop and the coin that rises over Maria when a customer pays."""
from PIL import Image
import math, os
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = (58, 32, 6, 255)
DARK = (150, 92, 14, 255)
MID = (226, 164, 34, 255)
LIGHT = (252, 214, 84, 255)
SHINE = (255, 248, 196, 255)
EDGE = (176, 112, 18, 255)

def coin(width_frac):
    """A coin seen face-on (1.0) down to edge-on (~0.15). 16x16."""
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    cx, cy, R = 7.5, 7.5, 6.5
    rx = max(0.9, R * width_frac)
    for y in range(16):
        for x in range(16):
            dx, dy = (x - cx) / rx, (y - cy) / R
            d = dx * dx + dy * dy
            if d > 1.0:
                continue
            # outline
            if width_frac < 0.3:  # edge-on: the milled edge, lit down the middle
                if dy * dy > 0.86: im.putpixel((x, y), OUT)
                else: im.putpixel((x, y), LIGHT if x <= cx - 0.5 else MID if (y % 2) else EDGE)
                continue
            if d > 0.78:
                im.putpixel((x, y), OUT); continue
            # rim ring
            if d > 0.5:
                im.putpixel((x, y), DARK if (dx + dy) > 0.2 else MID); continue
            # face: lit from the top-left
            shade = dx * 0.6 + dy * 0.8
            c = LIGHT if shade < -0.25 else MID if shade < 0.45 else DARK
            im.putpixel((x, y), c)
    if width_frac >= 0.55:
        # the embossed mark: a little diamond, dark edge + bright centre
        sx = lambda v: int(round(cx + (v - cx) * width_frac))
        for (x, y, c) in [(7, 5, DARK), (8, 5, DARK), (6, 6, DARK), (9, 6, DARK), (5, 7, DARK), (10, 7, DARK), (5, 8, DARK), (10, 8, DARK),
                          (6, 9, DARK), (9, 9, DARK), (7, 10, DARK), (8, 10, DARK), (7, 6, SHINE), (8, 6, LIGHT), (6, 7, LIGHT), (7, 7, LIGHT),
                          (8, 7, MID), (9, 7, MID), (6, 8, LIGHT), (7, 8, MID), (8, 8, MID), (9, 8, DARK), (7, 9, MID), (8, 9, DARK)]:
            im.putpixel((sx(x), y), c)
        # shine
        im.putpixel((sx(4), 4), SHINE); im.putpixel((sx(5), 3), SHINE); im.putpixel((sx(4), 5), SHINE)
    return im

coin(1.0).save(os.path.join(ROOT, "assets/mobs/icons/goldCoin.png"))
fr = [coin(abs(math.cos(i / 8 * math.pi))) for i in range(8)]
strip = Image.new("RGBA", (16 * 8, 16), (0, 0, 0, 0))
for i, f in enumerate(fr):
    strip.alpha_composite(f, (i * 16, 0))
strip.save(os.path.join(ROOT, "assets/mobs/icons/goldCoin_spin.png"))
print("ok")
