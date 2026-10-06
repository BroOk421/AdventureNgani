"""Original pixel art for fishing (js/fishing.js): the Fishing Rod icon and four fish (16x16).
   assets/items/fish/<id>.png"""
from PIL import Image
import os
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_DIR = os.path.join(ROOT, "assets/items/fish"); os.makedirs(OUT_DIR, exist_ok=True)
O = (24, 20, 28, 255)

def fish(body, belly, fin, accent=None, spots=False, size=1.0):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    cx, cy, rx, ry = 7.0, 8.0, 5.2 * size, 3.0 * size
    def inside(x, y): return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
    # tail (a fan on the right)
    tail = [(13, 5), (13, 6), (13, 7), (13, 8), (13, 9), (13, 10), (14, 4), (14, 5), (14, 10), (14, 11), (12, 6), (12, 7), (12, 8), (12, 9)]
    for x, y in tail: im.putpixel((x, y), fin)
    for x, y in [(15, 3), (15, 4), (15, 11), (15, 12), (14, 3), (14, 12), (13, 4), (13, 11), (11, 7), (11, 8)]:
        im.putpixel((x, y), O)
    for y in range(16):
        for x in range(16):
            if inside(x, y):
                c = belly if y > cy + 0.6 else body
                if accent and abs(x - 8) <= 0 and y < cy + 1: c = accent
                im.putpixel((x, y), c)
    # outline
    px = im.load()
    for y in range(16):
        for x in range(13):
            if inside(x, y): continue
            if any(0 <= x + dx < 16 and 0 <= y + dy < 16 and inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                if px[x, y][3] == 0: px[x, y] = O
    # top fin, eye, highlight
    for x, y in [(6, 4), (7, 4), (8, 4), (7, 3)]: px[x, y] = fin
    px[4, 7] = (255, 255, 255, 255); px[4, 8] = O
    px[6, 6] = (255, 255, 255, 170)
    if spots:
        for x, y in [(7, 7), (9, 9), (10, 7), (6, 9)]: px[x, y] = accent or O
    return im

def rod():
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for i in range(12):  # the pole, bottom-left to top-right
        x, y = 2 + i, 13 - i
        im.putpixel((x, y), (120, 78, 40, 255) if i < 4 else (190, 190, 200, 255))
        im.putpixel((x + 1, y), O if i < 11 else (190, 190, 200, 255))
    for x, y in [(3, 12), (4, 12), (3, 13), (4, 11)]: im.putpixel((x, y), (60, 40, 22, 255))  # handle
    im.putpixel((5, 12), (210, 210, 220, 255)); im.putpixel((6, 12), (90, 90, 100, 255))   # reel
    for y in range(3, 10): im.putpixel((14, y), (235, 235, 235, 200))                      # line
    im.putpixel((14, 10), (230, 60, 60, 255)); im.putpixel((14, 11), (255, 255, 255, 255))  # bobber
    return im

rod().save(os.path.join(OUT_DIR, "fishingRod.png"))
fish((120, 140, 150, 255), (200, 210, 210, 255), (90, 105, 120, 255)).save(os.path.join(OUT_DIR, "fishTilapia.png"))
fish((150, 175, 200, 255), (230, 236, 240, 255), (110, 130, 160, 255), accent=(200, 220, 240, 255)).save(os.path.join(OUT_DIR, "fishBangus.png"))
fish((200, 70, 60, 255), (240, 150, 120, 255), (150, 40, 40, 255), accent=(120, 20, 30, 255), spots=True).save(os.path.join(OUT_DIR, "fishLapu.png"))
fish((250, 196, 60, 255), (255, 236, 150, 255), (230, 120, 40, 255), accent=(255, 255, 255, 255), spots=True).save(os.path.join(OUT_DIR, "fishKoi.png"))
print("ok")
