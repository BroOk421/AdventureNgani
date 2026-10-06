"""Original pixel butterflies (js/critters.js): assets/critters/butterflies.png —
   4 rows (looks) x 4 frames (wing flap), 13x11 each, seen from above."""
from PIL import Image
import os
ROOT = os.path.join(os.path.dirname(__file__), "..")
W, H = 13, 11
# the RIGHT half-wing when fully open: E edge, M main colour, S spot, . empty (6 wide, x = 1..6 from the body)
HALF = [
    "..EEE.",
    ".EMMME",
    "EMSMME",
    "EMMMSE",
    ".EMMME",
    "..EEE.",
    ".EMME.",
    "EMSME.",
    ".EEE..",
]
LOOKS = [
    ((236, 128, 32), (36, 22, 14), (255, 240, 210)),   # orange monarch
    ((70, 150, 255), (16, 28, 76), (210, 245, 255)),    # blue morpho
    ((250, 222, 70), (126, 92, 18), (255, 255, 236)),   # yellow sulphur
    ((248, 168, 210), (140, 56, 104), (255, 255, 255)), # pink
]
BODY = (44, 30, 32, 255)
def frame(look, f):
    main, edge, spot = look
    cols = {"E": edge + (255,), "M": main + (255,), "S": spot + (255,)}
    widths = [6, 5, 3, 1][f]   # how much of the wing shows (it folds up)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); px = im.load()
    cx = 6
    for y, row in enumerate(HALF):
        for i in range(widths):
            # sample the half-wing squeezed into `widths` columns
            src = min(5, int(i * 6 / widths))
            c = row[src]
            if c == ".": continue
            if widths <= 2: c = "E" if src in (0, 5) or c == "E" else "M"
            for side in (1, -1):
                x = cx + side * (i + 1)
                if 0 <= x < W: px[x, y + 1] = cols[c]
    for y in range(2, 10): px[cx, y] = BODY            # body
    px[cx - 1, 0] = BODY; px[cx + 1, 0] = BODY; px[cx, 1] = BODY  # head + antennae
    return im
sheet = Image.new("RGBA", (W * 4, H * 4), (0, 0, 0, 0))
for r, look in enumerate(LOOKS):
    for f in range(4): sheet.alpha_composite(frame(look, f), (f * W, r * H))
sheet.save(os.path.join(ROOT, "assets/critters/butterflies.png"))
print("ok")
