"""Original pixel art for the hidden cave chests and the new ingots (js/treasure.js).
   assets/treasure/chest_closed.png, chest_open.png (20x20, bottom-anchored),
   assets/mobs/icons/ironIngot.png, goldIngot.png (16x16)."""
from PIL import Image
import os
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = "#1c1010"
WOOD = ["#5a3220", "#7a4528", "#995a33", "#b8743f"]   # dark -> light
IRON = ["#3b4250", "#6b7588", "#a3adbf", "#d8dee9"]
GOLD = ["#7a4a0e", "#c48a1c", "#f2c84b", "#fff1a8"]

def px(im, x, y, c):
    if 0 <= x < im.width and 0 <= y < im.height:
        im.putpixel((x, y), Image.new("RGBA", (1, 1), c).getpixel((0, 0)))

def rect(im, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px(im, x, y, c)

def body(im, top):
    # box body: x 2..17, rows top..18
    rect(im, 2, top, 17, 18, OUT)
    rect(im, 3, top + 1, 16, 17, WOOD[1])
    for y in range(top + 1, 18):
        for x in (6, 11):
            px(im, x, y, WOOD[0])          # plank seams
    rect(im, 3, top + 1, 16, top + 1, WOOD[2])   # top edge highlight
    rect(im, 3, 17, 16, 17, WOOD[0])             # bottom shade
    for x in (3, 16):                              # iron corner bands
        rect(im, x, top + 1, x, 17, IRON[1])
    rect(im, 3, top + 1, 16, top + 1, IRON[2]) if False else None

def lid_closed(im):
    # lid: rows 6..10, rounded top
    rect(im, 3, 5, 16, 5, OUT)
    rect(im, 2, 6, 17, 10, OUT)
    rect(im, 3, 6, 16, 9, WOOD[2])
    rect(im, 3, 6, 16, 6, WOOD[3])
    rect(im, 3, 9, 16, 9, WOOD[1])
    for x in (3, 16):
        rect(im, x, 6, x, 9, IRON[2])
    rect(im, 3, 10, 16, 10, IRON[1])             # lid rim band
    # lock plate
    rect(im, 8, 9, 11, 13, OUT)
    rect(im, 9, 10, 10, 12, GOLD[2])
    px(im, 9, 10, GOLD[3]); px(im, 10, 12, GOLD[1])

def closed():
    im = Image.new("RGBA", (20, 20), (0, 0, 0, 0))
    body(im, 10)
    lid_closed(im)
    return im

def opened():
    im = Image.new("RGBA", (20, 20), (0, 0, 0, 0))
    # lid tilted back: a thin slab at rows 1..5
    rect(im, 3, 1, 16, 1, OUT)
    rect(im, 2, 2, 17, 6, OUT)
    rect(im, 3, 2, 16, 5, WOOD[0])
    rect(im, 3, 2, 16, 2, WOOD[1])
    for x in (3, 16):
        rect(im, x, 2, x, 5, IRON[1])
    # inside: dark interior + heaped gold
    rect(im, 2, 7, 17, 10, OUT)
    rect(im, 3, 7, 16, 10, "#2a160c")
    for x, y, c in [(5, 9, 1), (6, 8, 2), (7, 8, 3), (8, 7, 2), (9, 8, 2), (10, 7, 3), (11, 8, 2), (12, 8, 1), (13, 9, 2), (14, 9, 1),
                    (6, 9, 2), (7, 9, 2), (8, 8, 2), (9, 9, 1), (10, 8, 2), (11, 9, 2), (12, 9, 2), (13, 10, 1), (4, 10, 1), (15, 10, 1)]:
        px(im, x, y, GOLD[c])
    px(im, 9, 6, "#9be7ff"); px(im, 9, 7, "#4fb4ff")  # a gem poking out
    body(im, 10)
    rect(im, 3, 10, 16, 10, IRON[1])
    rect(im, 8, 11, 11, 13, OUT)
    rect(im, 9, 11, 10, 12, GOLD[1])
    return im

def ingot(pal):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    # trapezoid bar, seen from the front-top
    rows = [(5, 10, 5), (4, 11, 6), (3, 12, 7), (3, 12, 8), (2, 13, 9), (2, 13, 10), (2, 13, 11)]
    for x0, x1, y in rows:
        rect(im, x0 - 1, y, x1 + 1, y, OUT)
    rect(im, 4, 4, 11, 4, OUT); rect(im, 1, 12, 14, 12, OUT)
    for x0, x1, y in rows:
        top = y <= 7
        rect(im, x0, y, x1, y, pal[3] if top and y == 5 else pal[2] if top else pal[1])
    rect(im, 2, 11, 13, 11, pal[0])
    px(im, 6, 5, "#ffffff"); px(im, 7, 5, pal[3])
    return im

closed().save(os.path.join(ROOT, "assets/treasure/chest_closed.png"))
opened().save(os.path.join(ROOT, "assets/treasure/chest_open.png"))
ingot(IRON).save(os.path.join(ROOT, "assets/mobs/icons/ironIngot.png"))
ingot(GOLD).save(os.path.join(ROOT, "assets/mobs/icons/goldIngot.png"))
print("ok")
