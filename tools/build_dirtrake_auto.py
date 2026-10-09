"""Builds assets/items/vegetables/dirtrake_auto.png — the 16 auto-tile pieces
of tilled soil (js/farm.js dirtRakeMask(): index = N 1 | E 2 | S 4 | W 8 for
each side that has tilled soil too). Each piece is 24x24: the 16x16 tile plus
a 4px pad for the lumpy rim.

Every OPEN side gets the same lumpy bulge (the look of the clod's top/left
edge), every open-open corner is rounded the same way, closed sides stay
straight and seamless (the joins only happen inside the patch). Shading:
the soil texture is the seamless fill of the old closed piece; edges facing
down get the darkest brown, sides one step darker, so the rim reads as a
raised clod on every side.

Run: python tools/build_dirtrake_auto.py
"""
import math
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "items", "vegetables", "dirtrake_auto.png")
S, PAD, T = 24, 4, 16
DARK, MID, BASE = (102, 66, 17, 255), (113, 74, 20, 255), (124, 82, 24, 255)

# outward depth of the rim along one side (t = 0..15 across the tile), two lumps
PROFILE = [2, 3, 3, 3, 3, 3, 2, 1, 2, 3, 3, 3, 3, 3, 3, 2]
CORNER_R = 5


def fill_texture(sheet):
    """16x16 seamless soil, taken from the old fully-closed piece (index 15)."""
    px = sheet.load()
    tex = [[px[15 * S + PAD + x, PAD + y] for x in range(T)] for y in range(T)]
    return tex


def shape(mask):
    n, e, s, w = bool(mask & 1), bool(mask & 2), bool(mask & 4), bool(mask & 8)
    inside = [[False] * S for _ in range(S)]
    for y in range(S):
        for x in range(S):
            tx, ty = x - PAD, y - PAD  # tile coords, 0..15 inside the tile
            if 0 <= tx < T and 0 <= ty < T:
                inside[y][x] = True
                continue
            # bulges past an open side
            if ty < 0 and 0 <= tx < T and not n:
                inside[y][x] = -ty <= PROFILE[tx]
            elif ty >= T and 0 <= tx < T and not s:
                inside[y][x] = ty - T + 1 <= PROFILE[T - 1 - tx]
            elif tx < 0 and 0 <= ty < T and not w:
                inside[y][x] = -tx <= PROFILE[T - 1 - ty]
            elif tx >= T and 0 <= ty < T and not e:
                inside[y][x] = tx - T + 1 <= PROFILE[ty]
    # round every corner whose two sides are both open
    D = 3  # max bulge
    corners = [
        (not n and not w, -D, -D, 1, 1),
        (not n and not e, T - 1 + D, -D, -1, 1),
        (not s and not w, -D, T - 1 + D, 1, -1),
        (not s and not e, T - 1 + D, T - 1 + D, -1, -1),
    ]
    for on, cx0, cy0, dx, dy in corners:
        if not on:
            continue
        ccx, ccy = cx0 + dx * CORNER_R, cy0 + dy * CORNER_R
        for y in range(S):
            for x in range(S):
                tx, ty = x - PAD, y - PAD
                if (tx - ccx) * dx < 0 and (ty - ccy) * dy < 0:
                    if math.hypot(tx - ccx, ty - ccy) > CORNER_R + 0.35:
                        inside[y][x] = False
    return inside


def build():
    old = Image.open(OUT).convert("RGBA")
    tex = fill_texture(old)
    out = Image.new("RGBA", (S * 16, S), (0, 0, 0, 0))
    po = out.load()
    for m in range(16):
        ins = shape(m)
        get = lambda x, y: 0 <= x < S and 0 <= y < S and ins[y][x]
        for y in range(S):
            for x in range(S):
                if not ins[y][x]:
                    continue
                c = tex[(y - PAD) % T][(x - PAD) % T]
                tx, ty = x - PAD, y - PAD
                in_tile = 0 <= tx < T and 0 <= ty < T
                # rim shading only on real open edges (never along a closed seam)
                below = not get(x, y + 1) and not (ty == T - 1 and m & 4)
                side = (not get(x - 1, y) and not (tx == 0 and m & 8)) or \
                       (not get(x + 1, y) and not (tx == T - 1 and m & 2))
                if y + 1 < S or not in_tile:
                    if below:
                        c = DARK
                    elif side and c == BASE:
                        c = MID
                po[m * S + x, y] = c
    out.save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    build()
