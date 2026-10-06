"""Art for the Greenwood (js/forest.js): the wooden forest gate (assets/outdoor/forestGate.png, 48x56)
and the hunting drops (assets/mobs/icons/rawMeat.png, feather.png, wool.png, leather.png — 16x16)."""
from PIL import Image, ImageDraw
import os
ROOT = os.path.join(os.path.dirname(__file__), "..")
O = (30, 18, 12, 255)
def outline(im):
    px = im.load(); src = im.copy().load(); W, H = im.size
    for y in range(H):
        for x in range(W):
            if src[x, y][3]: continue
            if any(0 <= x + a < W and 0 <= y + b < H and src[x + a, y + b][3] for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))): px[x, y] = O
    return im
# the gate: two log posts, a beam with a little roof and leaves
g = Image.new("RGBA", (48, 56)); d = ImageDraw.Draw(g)
for x in (6, 36):
    d.rectangle([x, 16, x + 5, 55], fill=(120, 78, 42, 255)); d.line([(x + 1, 16), (x + 1, 55)], fill=(160, 108, 60, 255)); d.line([(x + 4, 16), (x + 4, 55)], fill=(86, 54, 28, 255))
d.rectangle([2, 12, 45, 18], fill=(136, 88, 48, 255)); d.line([(2, 13), (45, 13)], fill=(176, 120, 66, 255))
d.polygon([(0, 12), (24, 2), (47, 12)], fill=(70, 120, 52, 255)); d.line([(0, 12), (24, 2), (47, 12)], fill=(110, 160, 70, 255))
for (x, y) in [(8, 9), (14, 7), (32, 7), (38, 9), (24, 5)]: d.ellipse([x - 3, y - 2, x + 3, y + 2], fill=(84, 140, 60, 255))
d.rectangle([16, 20, 31, 26], fill=(196, 150, 96, 255)); d.line([(18, 23), (29, 23)], fill=(110, 70, 36, 255))  # a little sign
outline(g).save(os.path.join(ROOT, "assets", "outdoor", "forestGate.png"))
IC = os.path.join(ROOT, "assets", "mobs", "icons")
def icon(draw):
    im = Image.new("RGBA", (16, 16)); draw(ImageDraw.Draw(im)); return outline(im)
icon(lambda d: (d.ellipse([2, 4, 13, 12], fill=(208, 70, 72, 255)), d.ellipse([4, 5, 9, 9], fill=(236, 120, 120, 255)), d.ellipse([9, 8, 12, 11], fill=(246, 230, 220, 255)))).save(os.path.join(IC, "rawMeat.png"))
icon(lambda d: (d.line([(3, 13), (12, 3)], fill=(150, 120, 90, 255)), d.polygon([(5, 12), (4, 7), (8, 3), (12, 3), (11, 8)], fill=(244, 244, 236, 255)), d.line([(5, 11), (11, 4)], fill=(196, 196, 186, 255)))).save(os.path.join(IC, "feather.png"))
icon(lambda d: [d.ellipse([x, y, x + 6, y + 6], fill=(246, 244, 236, 255)) for (x, y) in ((2, 6), (6, 3), (8, 7), (4, 9))]).save(os.path.join(IC, "wool.png"))
icon(lambda d: (d.polygon([(3, 3), (13, 4), (12, 13), (4, 12)], fill=(150, 96, 52, 255)), d.line([(5, 6), (11, 6)], fill=(186, 128, 76, 255)), d.line([(5, 9), (10, 10)], fill=(118, 72, 36, 255)))).save(os.path.join(IC, "leather.png"))
print("ok")
