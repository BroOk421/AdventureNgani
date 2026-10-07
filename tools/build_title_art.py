#!/usr/bin/env python3
"""Parallax layers for the title screen — per request ("gawa ka ng parang
parallax na intro may mount everest na may snow tapos yung town na may mga
puno tyaka lalabas yung mismong name ng game").

Writes assets/title/:
  everest.png   the far range: a huge snowy summit in the middle, lit pink by
                the dawn on its left faces, blue in shadow, fading into haze
  range.png     a nearer, lower snowy range
  hills.png     forested hills with pines (two bands)
  town.png      the town in the valley: the game's own houses and trees at half
                size on a meadow with a cobble road and lamps
  fore_left.png / fore_right.png  big trees, bushes and grass framing the edges
  layers.json   chimney tops (for the smoke) and the summit (for the snow plume)
Every layer is LAYER_W x LAYER_H logical px (the title canvas is LAYER_H tall).
Run: python3 tools/build_title_art.py
"""
import json, math, os, random
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "title")
LAYER_W, LAYER_H = 1100, 360
A = lambda *p: os.path.join(ROOT, "assets", *p)


def lerp(a, b, t): return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def noise1d(n, seed, octaves=5, base=64):
    """Fractal value noise over n columns, in -1..1."""
    rng = random.Random(seed)
    out = [0.0] * n
    amp, total, step = 1.0, 0.0, base
    for _ in range(octaves):
        pts = [rng.uniform(-1, 1) for _ in range(n // step + 3)]
        for x in range(n):
            i, f = divmod(x / step, 1)
            i = int(i); f = f * f * (3 - 2 * f)
            out[x] += amp * (pts[i] * (1 - f) + pts[i + 1] * f)
        total += amp; amp *= 0.5; step = max(1, step // 2)
    return [v / total for v in out]


def n2(x, y, seed, cell=7):
    """2D value noise, 0..1, blocky cells smoothed (stretched along the slope)."""
    def h(i, j):
        v = (i * 374761393 + j * 668265263 + seed * 2147483647) & 0xffffffff
        v = (v ^ (v >> 13)) * 1274126177 & 0xffffffff
        return (v ^ (v >> 16)) / 0xffffffff
    fx, fy = x / cell, y / (cell * 1.6)
    i, j = int(fx), int(fy); u, v = fx - i, fy - j
    u, v = u * u * (3 - 2 * u), v * v * (3 - 2 * v)
    a = h(i, j) * (1 - u) + h(i + 1, j) * u
    b = h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u
    return a * (1 - v) + b * v


def mountains(peaks, seed, pal, snow_depth, snowline, haze, haze_from, haze_to, rough=10):
    """peaks: (x0, y0, slope_left, slope_right). Returns an RGBA image."""
    W, H = LAYER_W, LAYER_H
    rng = random.Random(seed)
    nz = noise1d(W, seed, 6, 128)
    fine = noise1d(W, seed + 1, 3, 8)
    surf, owner = [H] * W, [0] * W
    for x in range(W):
        best, bi = H * 2, 0
        for i, (x0, y0, sl, sr) in enumerate(peaks):
            d = x - x0
            s = sl if d < 0 else sr
            y = y0 + s * abs(d) ** 0.93 + rough * nz[x] * min(1, abs(d) / 60) + 2.2 * fine[x] * min(1, abs(d) / 25)
            if y < best: best, bi = y, i
        surf[x], owner[x] = best, bi
    # ridges: the main one down from each summit, and side ridges off the flanks
    ridges = []  # (x_at(y) list keyed by y, width, side) side -1 = left flank (shadow strip right of it), +1 = right flank
    def walk(x, y, dx, depth, w, side):
        pts = {}
        xx = float(x)
        for yy in range(int(y), H):
            pts[yy] = xx
            xx += dx + rng.uniform(-0.35, 0.35)
            if yy - y > depth: break
        ridges.append((pts, w, side))
    main = []
    for i, (x0, y0, sl, sr) in enumerate(peaks):
        pts = {}
        xx = float(x0)
        for yy in range(int(y0), H):
            pts[yy] = xx
            xx += rng.uniform(-0.45, 0.6)
        main.append(pts)
    for x in range(4, W - 4, 3):
        i = owner[x]
        x0 = peaks[i][0]
        if abs(x - x0) < 8 or rng.random() > 0.22: continue
        side = -1 if x < x0 else 1
        walk(x, surf[x] + 1, side * rng.uniform(0.25, 0.8), rng.randint(15, 70), rng.uniform(2, 6), side)
    sn = noise1d(W, seed + 7, 4, 32)
    img = Image.new("RGBA", (W, H))
    px = img.load()
    for x in range(W):
        top = int(math.ceil(surf[x]))
        i = owner[x]
        mp = main[i]
        for y in range(max(0, top), H):
            mx = mp.get(y, peaks[i][0])
            lit = x < mx
            for (pts, w, side) in ridges:
                rx = pts.get(y)
                if rx is None: continue
                d = x - rx
                if side < 0 and lit and 0 < d < w: lit = False; break
                if side > 0 and not lit and -w < d < 0: lit = True; break
            depth = y - surf[x]
            alt = y
            is_snow = depth < snow_depth * (0.6 + 0.6 * (sn[x] + 1) / 2) or alt < snowline + 18 * sn[x]
            if not is_snow and alt < snowline + 70 and n2(x, y, seed) > 0.25 + (alt - snowline) / 140: is_snow = True  # snow patches on the rock
            if is_snow:
                c = pal["snow_lit"] if lit else pal["snow_sh"]
                if lit and alt < peaks[0][1] + 60: c = lerp(pal["glow"], c, min(1, (alt - peaks[0][1]) / 60))  # alpenglow near the summit
                if depth < 1.2: c = lerp(c, (255, 255, 255), 0.35 if lit else 0.15)
            else:
                c = pal["rock_lit"] if lit else pal["rock_sh"]
                if n2(x, y, seed + 3, 4) > 0.55: c = lerp(c, (0, 0, 0), 0.1)  # darker rock bands
            t = max(0.0, min(1.0, (y - haze_from) / (haze_to - haze_from)))
            c = lerp(c, haze, t * 0.85)
            px[x, y] = c + (255,)
    return img, surf


def pine(img, x, base, h, dark, light, rng):
    px = img.load()
    W, H = img.size
    tiers = max(2, h // 6)
    for t in range(tiers):
        ty = base - h + int(t * h / tiers)
        tw = 2 + int((t + 1) * h / tiers * 0.42)
        th = int(h / tiers) + 3
        for dy in range(th):
            half = int(tw * (dy + 1) / th)
            for dx in range(-half, half + 1):
                xx, yy = x + dx, ty + dy
                if 0 <= xx < W and 0 <= yy < H:
                    c = light if dx < -half // 3 else dark
                    px[xx, yy] = c + (255,)
    for yy in range(base - 2, base + 1):
        if 0 <= x < W and 0 <= yy < H: px[x, yy] = (52, 36, 28, 255)


def hills():
    W, H = LAYER_W, LAYER_H
    img = Image.new("RGBA", (W, H))
    px = img.load()
    rng = random.Random(5)
    bands = [  # base y, amplitude, colour, pine colours, haze
        (226, 14, (66, 98, 104), (48, 82, 90), (82, 118, 120), 0.45, 11),
        (246, 12, (52, 92, 70), (38, 74, 58), (70, 112, 80), 0.15, 23),
    ]
    for bi, (base, amp, col, pd, pl, hz, sd) in enumerate(bands):
        nz = noise1d(W, sd, 4, 96)
        top = [int(base + amp * nz[x] + 6 * math.sin(x / 47 + bi)) for x in range(W)]
        for x in range(W):
            for y in range(top[x], H):
                c = col
                if y - top[x] < 2: c = lerp(col, (255, 230, 200), 0.15)
                px[x, y] = c + (255,)
        x = 0
        while x < W:
            h = rng.randint(14, 26) if bi else rng.randint(10, 18)
            pine(img, x, top[min(W - 1, x)] + rng.randint(1, 4), h, pd, pl, rng)
            x += rng.randint(4, 11)
    return img


def half(path):
    im = Image.open(path).convert("RGBA")
    sm = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.BOX)
    p = sm.load()
    for y in range(sm.height):
        for x in range(sm.width):
            r, g, b, a = p[x, y]
            p[x, y] = (r, g, b, 255) if a >= 120 else (0, 0, 0, 0)
    return sm


def chimney_tops(im):
    """Narrow bumps on the roof line = chimneys: (x, y) of their tops."""
    W, H = im.size
    a = im.getchannel("A").load()
    top = []
    for x in range(W):
        y = next((y for y in range(H) if a[x, y] > 0), H)
        top.append(y)
    out = []
    x = 0
    while x < W:
        if top[x] < H:
            run = x
            while run + 1 < W and abs(top[run + 1] - top[x]) <= 1: run += 1
            wdt = run - x + 1
            left = top[x - 3] if x >= 3 else H
            right = top[run + 3] if run + 3 < W else H
            if wdt <= 6 and left - top[x] >= 3 and right - top[x] >= 3:
                out.append((x + wdt // 2, top[x]))
            x = run + 1
        else:
            x += 1
    return out


def town():
    W, H = LAYER_W, LAYER_H
    img = Image.new("RGBA", (W, H))
    rng = random.Random(9)
    px = img.load()
    ground = 296
    nz = noise1d(W, 41, 3, 64)
    for x in range(W):
        gy = int(ground - 8 + 3 * nz[x])
        for y in range(gy, H):
            c = (98, 158, 62) if (y + x // 9) % 7 else (106, 166, 68)
            if y - gy < 2: c = (124, 182, 78)
            px[x, y] = c + (255,)
    # the cobble road along the front
    cob = Image.open(A("tiles", "cobble_tile", "enter-cobble-2.png")).convert("RGBA").resize((8, 8), Image.BOX)
    for x in range(0, W, 8):
        for y in (ground + 10, ground + 18):
            img.alpha_composite(cob, (x, y))
    for x in range(W):
        for y in (ground + 9, ground + 26):
            px[x, y] = (84, 140, 54, 255)
    houses = ["cottageLog", "cottagePlaster", "groceryStore", "cottageBrick", "TAVERN", "equipShop", "cottagePlaster", "potionShop", "cottageLog", "cottageBrick", "blacksmithShop"]
    trees = [half(A("items", "trees", d, f)) for d, f in [("green", "mediumgreentree.png"), ("lightgreen", "mediumlightgreentree.png"),
             ("red", "mediumredtree.png"), ("yellow", "mediumyellowtree.png"), ("orange", "bigtree_orange.png"), ("green", "thintree_green.png")]]
    lamp = half(A("outdoor", "postlight.png"))
    smoke, lamps = [], []
    x = 18
    back = []
    for i, h in enumerate(houses):
        src = A("items", "house", "house2.png") if h == "TAVERN" else A("buildings", "exterior", h + ".png")
        im = half(src)
        # trees behind and between
        for _ in range(rng.randint(1, 2)):
            t = rng.choice(trees)
            back.append((t, x - t.width // 2 + rng.randint(-6, 10), ground - t.height - rng.randint(4, 12)))
        y = ground - im.height + 4
        back.append((im, x, y, "house"))
        for (cx, cy) in chimney_tops(im): smoke.append([x + cx, y + cy])
        x += im.width + rng.randint(10, 26)
        if x > W - 60: break
    for item in back:
        if len(item) == 3:
            img.alpha_composite(item[0], (item[1], item[2]))
    for item in back:
        if len(item) == 4:
            img.alpha_composite(item[0], (item[1], item[2]))
    # lamps along the road and trees in front
    for lx in range(40, W, 110):
        img.alpha_composite(lamp, (lx, ground + 10 - lamp.height))
        lamps.append([lx + 22, ground + 10 - lamp.height + 12])
    for _ in range(9):
        t = rng.choice(trees[:4])
        tx = rng.randint(0, W - t.width)
        img.alpha_composite(t, (tx, ground + 30 - t.height))
    return img, smoke, lamps


def fore(side):
    W, H = 260, LAYER_H
    img = Image.new("RGBA", (W, H))
    rng = random.Random(3 if side == "left" else 4)
    big = Image.open(A("items", "trees", "orange", "bigtree_orange.png")).convert("RGBA")
    med = Image.open(A("items", "trees", "green", "mediumgreentree.png")).convert("RGBA")
    lg = Image.open(A("items", "trees", "lightgreen", "mediumlightgreentree.png")).convert("RGBA")
    bushes = [Image.open(A("bushes", f)).convert("RGBA") for f in sorted(os.listdir(A("bushes"))) if f.endswith(".png") and "bush" in f.lower()][:6]
    grass = [Image.open(A("wildgrass", f)).convert("RGBA") for f in sorted(os.listdir(A("wildgrass"))) if f.endswith(".png")]
    # ground mound
    px = img.load()
    for x in range(W):
        d = x if side == "left" else W - 1 - x
        gy = int(H - 44 + d * 0.16 + 4 * math.sin(x / 13))
        for y in range(gy, H):
            px[x, y] = ((76, 132, 50) if (y + x // 7) % 6 else (84, 142, 56)) + (255,)
            if y - gy < 2: px[x, y] = (110, 168, 70, 255)
    edge = lambda w: (-w // 3 if side == "left" else W - w + w // 3)
    if side == "left":
        img.alpha_composite(big, (edge(big.width) + 6, H - 34 - big.height))
        img.alpha_composite(med, (96, H - 36 - med.height))
    else:
        img.alpha_composite(lg, (W - 150, H - 30 - lg.height))
        img.alpha_composite(big, (edge(big.width) - 2, H - 34 - big.height))
    for _ in range(5):
        b = rng.choice(bushes)
        bx = rng.randint(0, 150) if side == "left" else rng.randint(W - 170, W - b.width)
        img.alpha_composite(b, (bx, H - 10 - b.height - rng.randint(0, 10)))
    for _ in range(26):
        g = rng.choice(grass)
        gx = rng.randint(0, 190) if side == "left" else rng.randint(W - 200, W - g.width)
        img.alpha_composite(g, (gx, H - g.height - rng.randint(0, 22)))
    return img


# ---------------- clouds: pixel-art cumulus, lit from the dawn side ----------------
CLOUD_TONES = [(255, 236, 222), (246, 206, 206), (214, 170, 196), (160, 128, 176), (112, 96, 150)]  # light -> underside


def cloud(seed, w, h, bumps):
    """Pixel-art cumulus built like a hand-drawn one: overlapping round puffs,
    the higher ones behind, the lower ones in front. Every puff is shaded as a
    little sphere lit from the upper left (lit rim, mid, shade), the part of a
    puff tucked behind another one gets a crease shadow, the flat base is the
    darkest tone, and a 1px checker softens each band edge. 5 tones."""
    rng = random.Random(seed)
    base = h - 2
    puffs = []
    n = max(3, int(bumps * 0.7))
    for i in range(n):  # the bottom row of puffs, biggest in the middle
        t = (i + 0.5) / n
        r = h * (0.3 + 0.24 * math.sin(math.pi * t)) * rng.uniform(0.85, 1.15)
        puffs.append([w * (0.07 + 0.86 * t) + rng.uniform(-2, 2), base - r * rng.uniform(0.25, 0.55), r])
    for i in range(max(2, n - 2)):  # a second, smaller row on top
        t = (i + 1) / (n - 1)
        r = h * (0.26 + 0.2 * math.sin(math.pi * t)) * rng.uniform(0.8, 1.1)
        puffs.append([w * (0.12 + 0.76 * t) + rng.uniform(-3, 3), base - h * (0.38 + 0.25 * math.sin(math.pi * t)) * rng.uniform(0.85, 1.1), r])
    for _ in range(rng.randint(1, 2)):  # a crown or two
        r = h * rng.uniform(0.16, 0.24)
        puffs.append([w * rng.uniform(0.3, 0.7), r + rng.uniform(0, 2), r])
    puffs.sort(key=lambda p: p[1])          # higher = further back = drawn first
    xs = [p[0] for p in puffs]
    body, rb = [], h * 0.2                   # a low body behind everything, so the base is one piece
    x = min(xs)
    while x <= max(xs):
        body.append([x, base - rb * 0.55, rb]); x += rb * 0.9
    puffs = body + puffs
    L = (-0.52, -0.62, 0.59)
    owner = [[-1] * w for _ in range(h)]
    tone = [[-1] * w for _ in range(h)]
    for idx, (cx, cy, r) in enumerate(puffs):
        for y in range(max(0, int(cy - r) - 1), min(h, int(cy + r) + 2)):
            if y > base: continue
            for x in range(max(0, int(cx - r) - 1), min(w, int(cx + r) + 2)):
                nx, ny = (x + 0.5 - cx) / r, (y + 0.5 - cy) / r
                d2 = nx * nx + ny * ny
                if d2 > 1: continue
                nz = math.sqrt(1 - d2)
                v = (nx * L[0] + ny * L[1]) * 0.95 + nz * L[2] * 0.55 - 0.05
                v -= 0.35 * max(0.0, (y - base * 0.6) / (base * 0.4))
                k = 0 if v > 0.62 else 1 if v > 0.3 else 2 if v > 0.02 else 3
                owner[y][x], tone[y][x] = idx, k
    # crease: a back puff's pixels right next to a puff in front of it fall in its shadow
    out = [row[:] for row in tone]
    for y in range(h):
        for x in range(w):
            o = owner[y][x]
            if o < 0: continue
            for dx, dy in ((1, 0), (0, 1), (1, 1), (2, 1)):
                xx, yy = x + dx, y + dy
                if xx < w and yy < h and owner[yy][xx] > o and tone[yy][xx] <= 1:
                    out[y][x] = min(3, max(out[y][x], tone[yy][xx] + 2)); break
    for x in range(w):  # the flat underside
        for y in range(base, -1, -1):
            if out[y][x] >= 0:
                out[y][x] = 4
                if y - 1 >= 0 and out[y - 1][x] >= 0 and out[y - 1][x] < 3: out[y - 1][x] = 3
                break
    img = Image.new("RGBA", (w, h)); px = img.load()
    for y in range(h):
        for x in range(w):
            k = out[y][x]
            if k < 0: continue
            if (x + y) % 2 == 0 and 1 <= k <= 3:   # soften band edges
                up = out[y - 1][x] if y else -1
                if up == k - 1: k -= 1
            px[x, y] = CLOUD_TONES[k] + (255,)
    return img


def npc_strip(cid, name, frames):
    """Half-size side-walk strip of a townsperson (like the half-size town)."""
    src = A("npc", "Citizen_" + cid, "walk", name)
    if not os.path.exists(src): return None
    im = Image.open(src).convert("RGBA")
    out = Image.new("RGBA", (32 * frames, 32))
    for f in range(frames):
        fr = im.crop((f * 64, 0, f * 64 + 64, 64)).resize((32, 32), Image.BOX)
        p = fr.load()
        for y in range(32):
            for x in range(32):
                r, g, b, a = p[x, y]
                p[x, y] = (r, g, b, 255) if a >= 110 else (0, 0, 0, 0)
        out.alpha_composite(fr, (f * 32, 0))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    ev_pal = {"snow_lit": (244, 238, 246), "snow_sh": (150, 160, 206), "rock_lit": (150, 136, 150), "rock_sh": (86, 86, 128), "glow": (255, 196, 186)}
    ev, ev_surf = mountains([(560, 46, 1.02, 0.95), (440, 104, 1.1, 1.0), (690, 92, 1.15, 1.05), (300, 138, 1.0, 1.0), (850, 124, 1.0, 1.1), (130, 160, 0.9, 0.9), (990, 150, 0.95, 0.9)],
                            seed=17, pal=ev_pal, snow_depth=40, snowline=150, haze=(214, 176, 196), haze_from=130, haze_to=250, rough=12)
    ev.save(os.path.join(OUT, "everest.png"))
    rg_pal = {"snow_lit": (232, 236, 248), "snow_sh": (126, 140, 186), "rock_lit": (112, 116, 140), "rock_sh": (66, 74, 108), "glow": (250, 210, 200)}
    rg, _ = mountains([(120, 150, 0.9, 0.85), (330, 140, 0.8, 0.95), (520, 168, 0.9, 0.8), (760, 146, 0.85, 0.9), (960, 158, 0.9, 0.9)],
                      seed=29, pal=rg_pal, snow_depth=12, snowline=160, haze=(196, 170, 196), haze_from=175, haze_to=245, rough=8)
    rg.save(os.path.join(OUT, "range.png"))
    hills().save(os.path.join(OUT, "hills.png"))
    tw, smoke, lamps = town()
    tw.save(os.path.join(OUT, "town.png"))
    fore("left").save(os.path.join(OUT, "fore_left.png"))
    fore("right").save(os.path.join(OUT, "fore_right.png"))
    for i, (w, h, n) in enumerate([(132, 34, 7), (96, 28, 6), (70, 22, 5), (150, 30, 8), (54, 18, 4), (110, 26, 6)]):
        cloud(31 + i * 7, w, h, n).save(os.path.join(OUT, "cloud%d.png" % (i + 1)))
    walkers = []
    for cid in ["F", "G", "I", "J", "K", "P", "Q", "L", "B", "E"]:
        r, l = npc_strip(cid, "Walk.png", 6), npc_strip(cid, "Walk_Left.png", 6)
        if r is None or l is None: continue
        r.save(os.path.join(OUT, "walk_%s_r.png" % cid)); l.save(os.path.join(OUT, "walk_%s_l.png" % cid)); walkers.append(cid)
    summit = min(range(LAYER_W), key=lambda x: ev_surf[x])
    with open(os.path.join(OUT, "layers.json"), "w") as f:
        json.dump({"w": LAYER_W, "h": LAYER_H, "summit": [summit, int(ev_surf[summit])], "smoke": smoke, "lamps": lamps, "road": [296 + 15, 296 + 24], "walkers": walkers, "clouds": 6}, f)
    print("title layers written; summit", summit, int(ev_surf[summit]), "smoke", len(smoke), "lamps", len(lamps))


if __name__ == "__main__":
    main()
