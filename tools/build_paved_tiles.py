#!/usr/bin/env python3
"""Paved ground for the town — per request ("yung sa town kaya mo bang gawin
is bricks? tapos dagdag ka ng tile na parang stones?").

  assets/tiles/cobble_tile/  a new Cobblestone set laid out like bricks_tile
      (top/left/right/bottom 1-3, enter 1-6): one seamless 16x16 cobble
      pattern (periodic Voronoi stones, 1px mortar, lit top-left / shaded
      bottom-right), every variant shares the stones that cross the tile's
      border, so any two tiles join without a seam; only the inner stones'
      colours, cracks and moss change.
  assets/tiles/bricks_tile/edge-*.png, cobble_tile/edge-*.png
      the grass edge pieces of grass_tile (top-grass-1..5, left/right 1-3,
      bottom-grass-1..5) laid over the paving, so a brick / cobble path gets
      the same soft grass rim the dirt paths have. + snow/<name>_snow.png
      versions (the grass part turns to snow while it snows).
Run: python3 tools/build_paved_tiles.py
"""
import os, random
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = os.path.join(ROOT, "assets", "tiles")
GRASS = os.path.join(T, "grass_tile")
EDGES = [("top", 5), ("left", 3), ("right", 3), ("bottom", 5)]


def cobble_geometry(seed=11, n=11):
    rng = random.Random(seed)
    pts = [(rng.uniform(0, 16), rng.uniform(0, 16)) for _ in range(n)]
    def owner(x, y, pts):
        best, bi = 1e9, 0
        for i, (px, py) in enumerate(pts):
            dx = min(abs(x - px), 16 - abs(x - px)); dy = min(abs(y - py), 16 - abs(y - py))
            d = dx * dx + dy * dy * 1.15
            if d < best: best, bi = d, i
        return bi
    for _ in range(6):  # Lloyd relaxation on the torus: even-sized stones
        acc = [[0.0, 0.0, 0.0, 0.0, 0] for _ in pts]
        import math
        for y in range(16):
            for x in range(16):
                i = owner(x + 0.5, y + 0.5, pts)
                a = acc[i]
                ax, ay = 2 * math.pi * (x + 0.5) / 16, 2 * math.pi * (y + 0.5) / 16
                a[0] += math.cos(ax); a[1] += math.sin(ax); a[2] += math.cos(ay); a[3] += math.sin(ay); a[4] += 1
        new = []
        for (px, py), a in zip(pts, acc):
            if not a[4]: new.append((px, py)); continue
            new.append(((math.atan2(a[1], a[0]) / (2 * math.pi) * 16) % 16, (math.atan2(a[3], a[2]) / (2 * math.pi) * 16) % 16))
        pts = new
    return [[owner(x + 0.5, y + 0.5, pts) for x in range(16)] for y in range(16)]


G = cobble_geometry()
NCELL = max(max(r) for r in G) + 1
# stones that cross the tile border keep one colour in every variant
BORDER = {G[y][x] for y in range(16) for x in range(16) if x in (0, 15) or y in (0, 15)}
MORTAR, MORTAR_D = (74, 70, 66), (60, 56, 53)
STONES = [(138, 134, 126), (126, 123, 117), (146, 140, 130), (118, 116, 112), (132, 127, 118)]


def clamp(c): return tuple(max(0, min(255, int(v))) for v in c) + (255,)


def cobble_tile(variant):
    rng = random.Random(100 + variant)
    base_rng = random.Random(7)
    col = {}
    for i in range(NCELL):
        c = STONES[base_rng.randrange(len(STONES))]
        if i not in BORDER: c = STONES[rng.randrange(len(STONES))]
        col[i] = c
    moss = {i for i in range(NCELL) if i not in BORDER and rng.random() < 0.18}
    im = Image.new("RGBA", (16, 16))
    at = lambda x, y: G[y % 16][x % 16]
    for y in range(16):
        for x in range(16):
            i = at(x, y)
            # mortar: the pixel whose right or lower neighbour is another stone
            if at(x + 1, y) != i or at(x, y + 1) != i:
                im.putpixel((x, y), MORTAR_D + (255,) if (at(x + 1, y) != i and at(x, y + 1) != i) else MORTAR + (255,))
                continue
            c = col[i]
            lit = at(x - 1, y) != i or at(x, y - 1) != i          # top-left rim catches the light
            shade = at(x + 2, y) != i or at(x, y + 2) != i         # bottom-right rim in shadow
            if lit: c = (c[0] + 20, c[1] + 19, c[2] + 17)
            elif shade: c = (c[0] - 16, c[1] - 16, c[2] - 14)
            if i in moss and (x * 3 + y * 5) % 4 == 0: c = (c[0] - 30, c[1] - 6, c[2] - 34)
            im.putpixel((x, y), clamp(c))
    # a hairline crack or two on inner stones
    for _ in range(rng.randint(0, 2)):
        x, y = rng.randrange(16), rng.randrange(16)
        if G[y][x] in BORDER: continue
        for _ in range(3):
            if 0 <= x < 16 and 0 <= y < 16 and im.getpixel((x, y))[:3] not in (MORTAR, MORTAR_D):
                p = im.getpixel((x, y)); im.putpixel((x, y), clamp((p[0] - 28, p[1] - 28, p[2] - 26)))
            x += rng.choice((-1, 0, 1)); y += 1
    return im


def snow_cut(grass_piece, snow_fill):
    """The grass piece's own shape filled with snow (its edge kept)."""
    out = Image.new("RGBA", (16, 16))
    for y in range(16):
        for x in range(16):
            a = grass_piece.getpixel((x, y))[3]
            if a: out.putpixel((x, y), snow_fill.getpixel((x, y))[:3] + (a,))
    return out


def main():
    cob = os.path.join(T, "cobble_tile"); os.makedirs(cob, exist_ok=True)
    tiles = [cobble_tile(v) for v in range(18)]
    k = 0
    for name, n in [("top-cobble", 3), ("left-cobble", 3), ("right-cobble", 3), ("bottom-cobble", 3), ("enter-cobble", 6)]:
        for i in range(1, n + 1):
            tiles[k].save(os.path.join(cob, f"{name}-{i}.png")); k += 1
    snow = Image.open(os.path.join(T, "snow_tile", "center-snow-2.png")).convert("RGBA")
    for folder, base_name in [("bricks_tile", "enter-bricks-5"), ("cobble_tile", "enter-cobble-2")]:
        base = Image.open(os.path.join(T, folder, base_name + ".png")).convert("RGBA")
        os.makedirs(os.path.join(T, folder, "snow"), exist_ok=True)
        for side, n in EDGES:
            for i in range(1, n + 1):
                g = Image.open(os.path.join(GRASS, f"{side}-grass-{i}.png")).convert("RGBA")
                im = base.copy(); im.alpha_composite(g)
                im.save(os.path.join(T, folder, f"edge-{side}-{i}.png"))
                sn = base.copy(); sn.alpha_composite(snow_cut(g, snow))
                sn.save(os.path.join(T, folder, "snow", f"edge-{side}-{i}_snow.png"))
    print("cobble + edges written")


if __name__ == "__main__":
    main()
