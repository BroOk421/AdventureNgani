"""Art for the Volcano and the Azure Coast (js/farWorlds.js, tools/build_east_worlds.py):
   assets/items/tile/lava1..3.png (the water tiles turned to molten rock), waterfall.png (16x16),
   and the new mobs, recoloured from the existing sheets (same frames, same sizes):
     Volcano: lavaSlime (slime), magmaGolem (golem), fireBat (bat), bossTitan (bossGolem)
     Coast:   seaCrab (scorpion), jellySlime (slime), seaWisp (wisp), bossLeviathan (bossScorpion)"""
from PIL import Image
import os, colorsys, random
ROOT = os.path.join(os.path.dirname(__file__), "..")
TILE = os.path.join(ROOT, "assets", "items", "tile")
MOBS = os.path.join(ROOT, "assets", "mobs")
def ramp(stops, v):
    v = max(0, min(0.999, v)); i = v * (len(stops) - 1); a = int(i); f = i - a
    return tuple(int(stops[a][k] + (stops[a + 1][k] - stops[a][k]) * f) for k in range(3))
LAVA = [(30, 4, 2), (90, 12, 6), (160, 30, 10), (215, 70, 14), (245, 130, 30), (255, 210, 110)]
# lava tiles from the water tiles: brightness -> the molten ramp, a few dark crust flecks
for i in (1, 2, 3):
    im = Image.open(os.path.join(TILE, f"water{i}.png")).convert("RGBA"); px = im.load(); rnd = random.Random(i)
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            c = ramp(LAVA, 0.32 + (v - 0.6) * 2.2 + rnd.uniform(-0.08, 0.08))
            if rnd.random() < 0.05: c = (60, 14, 8)
            px[x, y] = c + (255,)
    im.save(os.path.join(TILE, f"lava{i}.png"))
# a waterfall tile: falling streaks (the motion is drawn live, js/fishing.js)
wf = Image.new("RGBA", (16, 16)); px = wf.load(); rnd = random.Random(5)
for x in range(16):
    base = (70 + rnd.randint(-8, 8), 150 + rnd.randint(-10, 10), 215)
    for y in range(16):
        streak = (x * 7 + y * 3) % 11 < 2
        px[x, y] = (225, 245, 255, 255) if streak else base + (255,)
wf.save(os.path.join(TILE, "waterfall.png"))
# mobs
def recolor(src, dst, hue, sat=1.0, val=1.0, glow=None):
    os.makedirs(os.path.join(MOBS, dst), exist_ok=True)
    for a in ("idle", "move", "attack", "death"):
        im = Image.open(os.path.join(MOBS, src, a + ".png")).convert("RGBA"); px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, al = px[x, y]
                if not al: continue
                h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                if v < 0.13: continue  # outline
                if glow and v > 0.78: h2, s2, v2 = glow
                else: h2, s2, v2 = hue, min(1, max(0.25, s) * sat), min(1, v * val)
                rr, gg, bb = colorsys.hsv_to_rgb(h2 % 1, s2, v2)
                px[x, y] = (int(rr * 255), int(gg * 255), int(bb * 255), al)
        im.save(os.path.join(MOBS, dst, a + ".png"))
recolor("slime", "lavaSlime", 0.04, 1.4, 1.05, glow=(0.12, 0.7, 1.0))
recolor("golem", "magmaGolem", 0.02, 0.9, 0.75, glow=(0.08, 0.9, 1.0))
recolor("bat", "fireBat", 0.03, 1.3, 1.0, glow=(0.11, 0.8, 1.0))
recolor("bossGolem", "bossTitan", 0.01, 1.1, 0.8, glow=(0.09, 0.95, 1.0))
recolor("scorpion", "seaCrab", 0.01, 1.2, 1.0)
recolor("slime", "jellySlime", 0.88, 0.7, 1.1, glow=(0.5, 0.35, 1.0))
recolor("wisp", "seaWisp", 0.5, 1.0, 1.05)
recolor("bossScorpion", "bossLeviathan", 0.55, 1.1, 0.85, glow=(0.47, 0.6, 1.0))
# preview
c = Image.new("RGBA", (64 * 4 + 16 * 4, 2 * 52), (40, 40, 48, 255))
for i, m in enumerate(["lavaSlime", "magmaGolem", "fireBat", "bossTitan"]):
    im = Image.open(os.path.join(MOBS, m, "idle.png")); s = im.height; c.alpha_composite(im.crop((0, 0, s, s)), (i * 64, 0))
for i, m in enumerate(["seaCrab", "jellySlime", "seaWisp", "bossLeviathan"]):
    im = Image.open(os.path.join(MOBS, m, "idle.png")); s = im.height; c.alpha_composite(im.crop((0, 0, s, s)), (i * 64, 52))
for i, t in enumerate(["lava1", "lava2", "lava3", "waterfall"]):
    c.alpha_composite(Image.open(os.path.join(TILE, t + ".png")), (256 + i * 16, 10))
c.resize((c.width * 3, c.height * 3), Image.NEAREST).save("/tmp/farart.png")
print("ok")
