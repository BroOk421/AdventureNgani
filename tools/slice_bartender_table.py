#!/usr/bin/env python3
"""
Slices assets/interior/bartender-table.png (48x32) into its three 16px
pieces so a bar counter of any length can be built from them:

    bartender-table_left.png    — the left end (edge + leg)
    bartender-table_center.png  — the middle, repeat as many as you like
    bartender-table_right.png   — the right end

The full image itself stays as the inventory icon for the whole set.
Re-run from the project root after editing the art:
    python tools/slice_bartender_table.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "interior", "bartender-table.png")
PIECE = 16

im = Image.open(SRC).convert("RGBA")
for i, name in enumerate(["left", "center", "right"]):
    out = os.path.join(ROOT, "assets", "interior", f"bartender-table_{name}.png")
    im.crop((i * PIECE, 0, (i + 1) * PIECE, im.height)).save(out)
    print("wrote", os.path.relpath(out, ROOT))
