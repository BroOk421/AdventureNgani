"""Cuts the user's generated sprite sheet (the Dragon, the Snake, the Siren — 4-ish frames each of
idle / walk / attack / hurt / die on a transparent sheet) into the game's mob strips:
assets/mobs/<id>/{idle,move,attack,death}.png — square frames, feet on the frame's bottom line,
halved (the sheet's pixels are 2x), soft edges cut hard (alpha > 50%).
Run: python3 tools/mobs/extract_sheet.py path/to/sheet.png"""
from PIL import Image
import os, sys
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(ROOT, "assets", "mobs")
src = Image.open(sys.argv[1]).convert("RGBA")
A = src.getchannel("A").load()
W, H = src.size
ROWS = {"idle": (447, 532), "move": (535, 622), "attack": (624, 714), "hurt": (718, 810), "death": (812, 902)}
def segments(x0, x1, y0, y1, minw=18):
    proj = [sum(1 for y in range(y0, y1) if A[x, y] > 170) for x in range(x0, x1)]
    segs, inside, start = [], False, 0
    for i, v in enumerate(proj + [0]):
        if v > 1 and not inside: start, inside = i, True
        if v <= 1 and inside:
            inside = False
            if i - start >= minw: segs.append((x0 + start, x0 + i))
    return segs
def cut(x0, x1, y0, y1):
    fr = src.crop((x0, y0, x1, y1))
    a = fr.getchannel("A").point(lambda v: 255 if v > 170 else 0)
    fr.putalpha(a)
    return fr
def frames_of(col, row, fix=None):
    x0, x1 = col; y0, y1 = ROWS[row]
    segs = fix if fix else segments(x0, x1, y0, y1)
    return [cut(a, b, y0, y1) for a, b in segs]
def to_strip(frames, size, name, anim):
    out = Image.new("RGBA", (size * len(frames), size))
    for i, f in enumerate(frames):
        f = f.resize((max(1, f.width // 2), max(1, f.height // 2)), Image.BOX)
        f.putalpha(f.getchannel("A").point(lambda v: 255 if v > 128 else 0))
        bb = f.getbbox()
        if not bb: continue
        f = f.crop(bb)
        x = (size - f.width) // 2
        y = size - 1 - f.height
        if f.width > size: f = f.crop(((f.width - size) // 2 if False else 0, 0, size, f.height))  # (never wider than the frame)
        out.alpha_composite(f, (i * size + max(0, x), max(0, y)))
    os.makedirs(os.path.join(OUT, name), exist_ok=True)
    out.save(os.path.join(OUT, name, anim + ".png"))
DR, SN, SI = (20, 520), (625, 955), (1080, 1505)
# the dragon (its 3 fire-breathing frames run together on the sheet: cut by hand)
y0, y1 = ROWS["attack"]
f1, f2, f4 = cut(88, 183, y0, y1), cut(188, 336, y0, y1), cut(412, 506, y0, y1)
dragon_attack = [f1, f2, f4, f4]  # (the sheet's 3rd fire frame is hidden under the 2nd one's flames)
for anim in ("idle", "move"): to_strip(frames_of(DR, anim), 80, "bossDragon", anim)
to_strip(dragon_attack, 80, "bossDragon", "attack")
hurt, die = frames_of(DR, "hurt"), frames_of(DR, "death")
to_strip([hurt[0], hurt[2], die[2], die[3]], 80, "bossDragon", "death")  # (its first two "die" frames still breathe fire)
for anim in ("idle", "move", "attack", "death"): to_strip(frames_of(SN, anim), 64, "snake", anim)
y0, y1 = ROWS["attack"]
siren_attack = [cut(1095, 1196, y0, y1), cut(1211, 1283, y0, y1), cut(1308, 1378, y0, y1), cut(1397, 1484, y0, y1)]
for anim in ("idle", "move", "death"): to_strip(frames_of(SI, anim), 64, "siren", anim)
to_strip(siren_attack, 64, "siren", "attack")
print("ok")
