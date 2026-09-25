#!/usr/bin/env python3
"""
Builds a combined window image — the window on the wall at the TOP, the
patch of light it throws on the floor at the BOTTOM — the same 32x110
layout as assets/interior/window.png (Window A, made by hand).

The game draws the top part (the window) solid and fades the bottom part
(the light) with the daylight, and anchors the item on the WINDOW so the
cursor sits on the window while placing it (js/inventory.js `litWindow`).

Window (B) = window2_plain.png + window_light3.png -> window2.png
Run from the project root:
    python tools/combine_window.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INT = os.path.join(ROOT, "assets", "interior")
W, H = 32, 110
BOTTOM_MARGIN = 2  # same as window.png: the light ends 2px above the image bottom

def combine(window_file, light_file, out_file):
    win = Image.open(os.path.join(INT, window_file)).convert("RGBA")
    light = Image.open(os.path.join(INT, light_file)).convert("RGBA")
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.alpha_composite(win, ((W - win.width) // 2, 0))
    ly = H - BOTTOM_MARGIN - light.height
    out.alpha_composite(light, ((W - light.width) // 2, ly))
    out.save(os.path.join(INT, out_file))
    print(f"wrote assets/interior/{out_file}: window rows 0-{win.height}, light rows {ly}-{ly + light.height}")

combine("window2_plain.png", "window_light3.png", "window2.png")
