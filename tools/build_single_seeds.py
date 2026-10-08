"""One loose seed per crop (16x16), dropped when a ripe crop is harvested
(js/farm.js) — the grocery's seed sachets stay the shop item.
Each seed: a tilted ellipse (shape per crop), shaded from the upper left,
dark outline, a glint, and a small detail (ridges, a point, a hilum)."""
import math, os
from PIL import Image
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "items", "farm")
#            (rx, ry, tilt deg, base rgb, detail)
SEEDS = {
  "carrots":         (3.0, 5.6, 28, (184, 138, 82),  "ridges"),
  "petchay":         (3.6, 3.6, 0,  (110, 52, 34),   "hilum"),
  "onion":           (3.4, 5.4, -22, (46, 40, 38),  "point"),
  "cabbage":         (4.2, 4.2, 0,  (92, 54, 32),    "hilum"),
  "brocolli":        (4.0, 4.0, 0,  (120, 76, 44),   "hilum"),
  "brocolli_flower": (4.0, 4.4, 15, (156, 112, 64),  "hilum"),
  "dragonfruit":     (2.8, 4.4, 35, (30, 24, 26),    "point"),
}
def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)
for veg, (rx, ry, tilt, base, detail) in SEEDS.items():
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); px = im.load()
    cx, cy = 7.5, 8.0; a = math.radians(tilt); ca, sa = math.cos(a), math.sin(a)
    def local(x, y):
        dx, dy = x - cx, y - cy
        return dx * ca + dy * sa, -dx * sa + dy * ca
    def inside(x, y, grow=0.0):
        u, v = local(x, y)
        if detail == "point" and v < 0:   # teardrop: narrower toward the top
            u *= 1 + (-v / ry) * 0.55
        return (u / (rx + grow)) ** 2 + (v / (ry + grow)) ** 2 <= 1
    fill = set()
    for y in range(16):
        for x in range(16):
            if inside(x + 0.5, y + 0.5): fill.add((x, y))
    for (x, y) in fill:
        u, v = local(x + 0.5, y + 0.5)
        light = -(u / rx) * 0.55 - (v / ry) * 0.6          # lit from the upper left
        k = 1.0 + 0.32 * light
        px[x, y] = shade(base, k) + (255,)
    for y in range(16):                                      # outline
        for x in range(16):
            if (x, y) in fill: continue
            if any((x + dx, y + dy) in fill for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = shade(base, 0.32) + (255,)
    if detail == "ridges":                                   # carrot seed: lengthwise ridges
        for t in (-0.35, 0.35):
            for s in range(-4, 5):
                x = cx + t * rx * ca - (s * 0.9) * sa; y = cy + t * rx * sa + (s * 0.9) * ca
                if (int(x), int(y)) in fill: px[int(x), int(y)] = shade(base, 0.72) + (255,)
    if detail == "hilum":                                    # the little scar on a round seed
        x = int(cx + rx * 0.35); y = int(cy + ry * 0.45)
        if (x, y) in fill: px[x, y] = shade(base, 0.55) + (255,)
    gx, gy = int(cx - rx * 0.4), int(cy - ry * 0.45)          # glint
    for (x, y, k) in ((gx, gy, 1.75), (gx + 1, gy, 1.4), (gx, gy + 1, 1.4)):
        if (x, y) in fill: px[x, y] = tuple(min(255, int(v * k) + 30) for v in base) + (255,)
    im.save(os.path.join(OUT, "seedone_" + veg + ".png"))
print("ok")
