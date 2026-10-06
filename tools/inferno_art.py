"""The legendary Inferno set (js/legendary.js): 24x24 gear icons (the dragon tier's shapes, recoloured
to ember red / molten orange with a flame crest) and the Inferno Blade — a 40x40 long sword
(diamond sword shape, molten blade) + a 6-frame burning strip (flames licking up the blade).
Writes assets/mobs/icons/inferno*.png and infernoSword_anim.png."""
from PIL import Image
import os, colorsys, math, random
ROOT = os.path.join(os.path.dirname(__file__), "..")
IC = os.path.join(ROOT, "assets", "mobs", "icons")
def firecolor(v):  # brightness 0..1 -> ember ramp
    ramp = [(40, 8, 6), (110, 20, 12), (180, 40, 16), (230, 90, 24), (255, 160, 40), (255, 222, 120), (255, 248, 210)]
    v = max(0, min(0.999, v)); i = v * (len(ramp) - 1); a = int(i); f = i - a
    c0, c1 = ramp[a], ramp[a + 1]
    return tuple(int(c0[k] + (c1[k] - c0[k]) * f) for k in range(3))
def infernize(im, boost=1.0):
    im = im.convert("RGBA"); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a: continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if v < 0.16: px[x, y] = (24, 6, 6, a); continue  # outline stays dark
            vv = min(1, (v ** 1.6) * 0.95 * boost)
            px[x, y] = firecolor(vv) + (a,)
    return im
def flames(w, h, t, seed, base_y, x0, x1, height):
    """little flame tongues rising from base_y between x0..x1 (frame t of 6)"""
    im = Image.new("RGBA", (w, h)); px = im.load(); rnd = random.Random(seed)
    for x in range(x0, x1):
        ph = rnd.random() * 6.28
        hgt = height * (0.5 + 0.5 * math.sin(ph + t * 1.05)) + rnd.random() * 1.5
        for k in range(int(hgt)):
            y = base_y - k
            if 0 <= y < h:
                v = 1 - k / max(1, hgt)
                px[x, y] = firecolor(0.35 + 0.6 * v) + (int(210 * (0.5 + 0.5 * v)),)
    return im
# gear: dragon tier shapes, scaled 16 -> 24 like the old boss pieces, + a flame crest
for kind in ["Helmet", "Armor", "Gauntlet", "Boots", "Ring", "Shield"]:
    src = Image.open(os.path.join(IC, "dragon" + kind + ".png")).convert("RGBA").resize((24, 24), Image.NEAREST)
    im = infernize(src, 1.0)
    bbox = im.getbbox() or (4, 4, 20, 20)
    crest = flames(24, 24, 2, 1234 + len(kind) * 7, bbox[1] + 2, bbox[0] + 1, bbox[2] - 1, 5)
    out = Image.new("RGBA", (24, 24)); out.alpha_composite(crest); out.alpha_composite(im)
    out.save(os.path.join(IC, "inferno" + kind + ".png"))
# the sword
sw = infernize(Image.open(os.path.join(IC, "diamondSword.png")).convert("RGBA"), 1.0)
sw.save(os.path.join(IC, "infernoSword.png"))
strip = Image.new("RGBA", (40 * 6, 40))
spx = sw.load()
for t in range(6):
    fr = Image.new("RGBA", (40, 40))
    # flames follow the blade: for each opaque blade pixel near the edge, a short tongue up-right
    fl = Image.new("RGBA", (40, 40)); fp = fl.load(); rnd = random.Random(77)
    for y in range(40):
        for x in range(40):
            if spx[x, y][3] and x + y < 52 and x > y - 30:  # the blade half (the art runs bottom-left -> top-right)
                if rnd.random() < 0.35:
                    L = 3 + 4 * (0.5 + 0.5 * math.sin(x * 0.7 + y * 0.5 + t * 1.05))
                    for k in range(int(L)):
                        xx, yy = x + (k % 2), y - k
                        if 0 <= xx < 40 and 0 <= yy < 40 and not spx[xx, yy][3]:
                            v = 1 - k / L
                            fp[xx, yy] = firecolor(0.4 + 0.55 * v) + (int(230 * (0.4 + 0.6 * v)),)
    fr.alpha_composite(fl); fr.alpha_composite(sw)
    strip.alpha_composite(fr, (t * 40, 0))
strip.save(os.path.join(IC, "infernoSword_anim.png"))
# preview
c = Image.new("RGBA", (24 * 6 + 8 + 40 * 3, 44), (40, 34, 40, 255))
for i, k in enumerate(["Helmet", "Armor", "Gauntlet", "Boots", "Ring", "Shield"]): c.alpha_composite(Image.open(os.path.join(IC, "inferno" + k + ".png")), (i * 24, 10))
for t in range(3): c.alpha_composite(strip.crop((t * 2 * 40, 0, t * 2 * 40 + 40, 40)), (24 * 6 + 8 + t * 40, 2))
c.resize((c.width * 4, c.height * 4), Image.NEAREST).save("/tmp/inferno.png")
print("ok")
