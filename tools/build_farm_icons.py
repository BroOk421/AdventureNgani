"""Farm item icons (assets/items/farm/): hoe, watering can, seed packets and
harvested-crop icons. Per request: farming (till -> plant -> water -> harvest).
Run: python3 tools/build_farm_icons.py"""
import os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VEG = os.path.join(ROOT, "assets", "items", "vegetables")
OUT = os.path.join(ROOT, "assets", "items", "farm"); os.makedirs(OUT, exist_ok=True)
CROPS = ["carrots", "cabbage", "onion", "petchay", "brocolli", "brocolli_flower", "dragonfruit"]

def outline(im, color=(20, 14, 10, 255)):
    """1px dark outline round every opaque pixel."""
    a = im.load(); w, h = im.size
    out = Image.new("RGBA", im.size); o = out.load()
    for y in range(h):
        for x in range(w):
            if a[x, y][3]: continue
            if any(0 <= x + dx < w and 0 <= y + dy < h and a[x + dx, y + dy][3] for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))):
                o[x, y] = color
    out.alpha_composite(im); return out

# --- hoe: wooden handle on the diagonal, iron blade at the top
hoe = Image.new("RGBA", (16, 16)); d = ImageDraw.Draw(hoe)
for i in range(10):  # handle, 2px thick
    x, y = 3 + i, 13 - i
    d.point((x, y), (150, 96, 52, 255)); d.point((x + 1, y), (112, 68, 36, 255))
d.rectangle((10, 2, 14, 3), (176, 180, 186, 255))     # blade top
d.rectangle((13, 4, 14, 6), (150, 154, 160, 255))     # blade bend
d.point((14, 7), (120, 124, 130, 255))
d.point((10, 2), (220, 224, 228, 255)); d.point((11, 2), (220, 224, 228, 255))
outline(hoe).save(os.path.join(OUT, "hoe.png"))

# --- watering can: same greys as the can in the Watering sheets
can = Image.new("RGBA", (16, 16)); d = ImageDraw.Draw(can)
G1, G2, G3, HI = (64, 69, 69, 255), (146, 143, 136, 255), (204, 201, 194, 255), (255, 255, 255, 255)
d.rectangle((2, 7, 9, 13), G2)            # body
d.rectangle((2, 7, 9, 8), G3)             # rim light
d.point((3, 9), HI); d.point((3, 10), HI)
d.line((2, 13, 9, 13), G1)                # base shade
d.line((3, 6, 3, 4), G1); d.line((4, 3, 7, 3), G1); d.line((8, 4, 8, 6), G1)  # handle
for i in range(4): d.point((10 + i, 10 - i), G3); d.point((10 + i, 11 - i), G2)  # spout
d.rectangle((13, 5, 14, 6), G3); d.point((14, 5), HI)                         # rose
outline(can).save(os.path.join(OUT, "wateringcan.png"))

for v in CROPS:
    grow = Image.open(os.path.join(VEG, v, v + ".png")).convert("RGBA")
    fw = grow.width // 8
    # harvested crop: the fresh half of <veg>_mature.png
    mat = Image.open(os.path.join(VEG, v, v + "_mature.png")).convert("RGBA")
    crop = mat.crop((0, 0, mat.width // 2, mat.height)); crop.save(os.path.join(OUT, "crop_" + v + ".png"))
    # seed packet: paper bag with the crop's little fruit (frame 6 of the sheet) printed on it
    pk = Image.new("RGBA", (16, 16)); d = ImageDraw.Draw(pk)
    d.rectangle((3, 2, 12, 14), (226, 206, 160, 255))
    d.rectangle((3, 2, 12, 3), (196, 170, 120, 255))
    for x in range(3, 13, 2): d.point((x, 2), (160, 132, 90, 255))
    fruit = grow.crop((6 * fw, 0, 7 * fw, grow.height)); bb = fruit.getbbox()
    if bb:
        f = fruit.crop(bb); f.thumbnail((8, 9), Image.NEAREST)
        pk.alpha_composite(f, (8 - f.width // 2, 9 - f.height // 2))
    outline(pk).save(os.path.join(OUT, "seed_" + v + ".png"))
print("ok")
