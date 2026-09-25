#!/usr/bin/env python3
"""
Cuts the inventory/placed icon for each food out of its sprite strip.

The food art in assets/interior/foods/ is a strip of 16x16 frames going
from full to empty (beer: 2, meat: 2, salad: 5). The game uses the FIRST
frame (full) as the item's icon, saved beside it as <name>_icon.png.

Done here rather than cropped at runtime because, opened via file://
(double-clicking index.html), the browser won't let a page read pixels
back out of a canvas with a local image on it.

Run from the project root (needs Pillow: pip install pillow) whenever a
food strip changes:
    python tools/crop_food_icons.py
"""
import glob
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOODS = os.path.join(ROOT, "assets", "interior", "foods")
FRAME = 16

for path in sorted(glob.glob(os.path.join(FOODS, "*.png"))):
    if path.endswith("_icon.png"):
        continue
    im = Image.open(path).convert("RGBA")
    icon = im.crop((0, 0, FRAME, min(FRAME, im.height)))
    out = path[:-4] + "_icon.png"
    icon.save(out)
    print("wrote", os.path.relpath(out, ROOT), "from", im.size[0] // FRAME, "frame(s)")
