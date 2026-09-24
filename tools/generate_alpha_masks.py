#!/usr/bin/env python3
"""
Regenerates js/objectAlphaMasks.js — the precomputed 1-bit transparency
masks js/camera.js uses to decide when a tree/stone/house should fade so
the character shows through it.

Two sets of masks are baked in:

  OBJECT_ALPHA_MASKS    — one mask per objectLayer icon (trees, stones,
                          the house), keyed by its itemDefs type.
  CHARACTER_ALPHA_MASKS — one mask per FRAME of every character sprite
                          sheet under assets/sprites/, keyed by the sheet's
                          path relative to assets/sprites/ (e.g.
                          "Idle/Idle_Down-Sheet.png"), cropped to the
                          union bounding box of that sheet's frames.

Why precomputed instead of read at runtime with canvas getImageData():
opened via file:// (double-clicking index.html, which this project
supports), Chrome refuses to let a page read pixels back out of a canvas
that had a local image drawn on it ("tainted canvas" SecurityError). Baked
data has no such restriction.

Run from the project root (needs Pillow: pip install pillow):
    python tools/generate_alpha_masks.py
Re-run whenever any of the tree/stone/house PNGs or character sprite
sheets change, or when a new objectLayer item is added (add it to
OBJECT_ICONS below too).
"""
import base64
import glob
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "js", "objectAlphaMasks.js")

ALPHA_THRESHOLD = 20  # 0-255; fainter pixels (soft anti-aliased edges) count as transparent
FRAME_SIZE = 64       # every character sprite frame is 64x64 (config.js FRAME_SIZE)

# itemDefs type -> icon path (must match js/assets.js)
OBJECT_ICONS = {
    # ==== added by tools/add_remaining_items.py — non-flat new items ====
    "bushBigGreen": "assets/bushes/biggreenbush.png",
    "bushBigLightGreen": "assets/bushes/biglightgreenbush.png",
    "bushBigRed": "assets/bushes/bigredbush.png",
    "bushBigYellow": "assets/bushes/bigyellowbush.png",
    "bushMediumGreen": "assets/bushes/mediumgreenbush.png",
    "bushMediumLightGreen": "assets/bushes/mediumlightgreenbush.png",
    "bushMediumRed": "assets/bushes/mediumredbush.png",
    "bushMediumYellow": "assets/bushes/mediumyellowbush.png",
    "bushSmallGreen": "assets/bushes/smallgreenbush.png",
    "bushSmallLightGreen": "assets/bushes/smalllightgreenbush.png",
    "bushSmallRed": "assets/bushes/smallredbush.png",
    "bushSmallYellow": "assets/bushes/smallyellowbush.png",
    "bushXSGreen": "assets/bushes/xsgreenbush.png",
    "bushXSLightGreen": "assets/bushes/xslightgreenbush.png",
    "bushXSRed": "assets/bushes/xsredbush.png",
    "bushXSYellow": "assets/bushes/xsyellowbush.png",
    "bushFlowerA": "assets/bushes/flower.png",
    "bushFlowerB": "assets/bushes/flower2.png",
    "bushFlowerC": "assets/bushes/flower3.png",
    "bushFlowerD": "assets/bushes/flower4.png",
    "bushMushroom1": "assets/bushes/mushroom.png",
    "bushMushroom2": "assets/bushes/mushroom2.png",
    "treeMediumGreen": "assets/items/trees/green/mediumgreentree.png",
    "treeMediumLightGreen": "assets/items/trees/lightgreen/mediumlightgreentree.png",
    "treeMediumRed": "assets/items/trees/red/mediumredtree.png",
    "treeMediumYellow": "assets/items/trees/yellow/mediumyellowtree.png",
    "treeMediumGreenTrunk": "assets/items/trees/trunks/mediumgreentrunk.png",
    "treeMediumRedYellowTrunk": "assets/items/trees/trunks/mediumredyellowtrunk.png",
    "house2": "assets/items/house/house2.png",
    "house3": "assets/items/house/house3.png",
    "chairFront": "assets/interior/frontchair.png",
    "chairRight": "assets/interior/rightchair.png",
    "chairLeft": "assets/interior/leftchair.png",
    "cabinetBaseA": "assets/interior/base.png",
    "cabinetBaseB": "assets/interior/base2.png",
    "cabinetBaseC": "assets/interior/base3.png",
    "cabinetBaseD": "assets/interior/base5.png",
    "basket1": "assets/interior/basket.png",
    "basket2": "assets/interior/basket2.png",
    "bedBig": "assets/interior/bigbed.png",
    "bedSmall": "assets/interior/smallbed.png",
    "tableBig": "assets/interior/bigtable.png",
    "tableBig1": "assets/interior/bigtable1.png",
    "tableBig2": "assets/interior/bigtable2.png",
    "tableCircle": "assets/interior/circletable.png",
    "tableKitchen": "assets/interior/kitchen_table.png",
    "tableSmall": "assets/interior/smalltable.png",
    "cookerStove1": "assets/interior/cooker.png",
    "cookerStove2": "assets/interior/cooker2.png",
    "cookerStove3": "assets/interior/cooker3.png",
    "couch": "assets/interior/couch.png",
    "drawerFurniture": "assets/interior/drawer.png",
    "broom": "assets/interior/walis.png",
    "barrelInterior": "assets/interior/barrel.png",
    "crateInterior": "assets/interior/box.png",
    "chimneyPlain": "assets/interior/chimny.png",
    "chimneyRed": "assets/interior/chimnyred.png",
    "benchHorizontal": "assets/outdoor/benchh.png",
    "benchVertical": "assets/outdoor/benchv.png",
    "chairOutdoorFront": "assets/outdoor/chairfront.png",
    "chairOutdoorSide": "assets/outdoor/chairside.png",
    "chairOutdoorSideLeft": "assets/outdoor/chairside_left.png",
    "fence": "assets/outdoor/fence.png",
    "longTableHorizontal": "assets/outdoor/longtableh.png",
    "longTableVertical": "assets/outdoor/longtablev.png",
    "portBridge": "assets/outdoor/port_bridge.png",
    "portBridgeDecor": "assets/outdoor/port_bridge_decor.png",
    "postPlain": "assets/outdoor/post.png",
    "postLight": "assets/outdoor/postlight.png",
    "postLightLit": "assets/outdoor/postlight-light.png",
    "postLightLeft": "assets/outdoor/postlight_left.png",
    "postLightLitLeft": "assets/outdoor/postlight-light_left.png",
    "vegOnionBox": "assets/items/vegetables/onion/onionbox.png",
    "vegPetchayBox": "assets/items/vegetables/petchay/petchaybox.png",
    "vegCabbageBox": "assets/items/vegetables/cabbage/cabbagebox.png",
    "vegBrocolliBox": "assets/items/vegetables/brocolli/brocollibox.png",
    "vegBrocolliFlowerBox": "assets/items/vegetables/brocolli_flower/brocolli_flowerbox.png",
    "vegCarrotBox": "assets/items/vegetables/carrots/carrotbox.png",
    "vegDragonfruitBox": "assets/items/vegetables/dragonfruit/dragonfruitbox.png",
    "vegCrate": "assets/items/vegetables/box.png",
    "vegCrateOpen": "assets/items/vegetables/boxopen.png",
    "plantDrawer": "assets/items/vegetables/plantdrawer.png",
    "waterCrateHorizontal": "assets/items/vegetables/waterboxh.png",
    "waterCrateVertical": "assets/items/vegetables/waterboxv.png",

    "stoneBig": "assets/items/stones/bigstone1.png",
    "stoneMedium": "assets/items/stones/mediumstone.png",
    "stoneSmall": "assets/items/stones/smallstone.png",
    "stoneXS": "assets/items/stones/xsstone.png",
    "treeBigCutStump": "assets/items/trees/noLeaves/bigtreecutted.png",
    "treeThinCutStump": "assets/items/trees/noLeaves/thintreecutted.png",
    "treeThinNoLeaves1": "assets/items/trees/noLeaves/thintreenoleaves1.png",
    "treeThinNoLeaves2": "assets/items/trees/noLeaves/thintreenoleaves2.png",
    "treeTinyCutStump": "assets/items/trees/noLeaves/tinytreecutted.png",
    "treeThinGreen": "assets/items/trees/green/thintree_green.png",
    "treeTinyGreen": "assets/items/trees/green/tinytree_green.png",
    "treeBigOrange": "assets/items/trees/orange/bigtree_orange.png",
    "treeThinOrange": "assets/items/trees/orange/thintree_orange.png",
    "house1": "assets/items/house/house1.png",
}


def pack_bits(alpha, x0, y0, w, h):
    """1 bit per pixel, MSB first, each row padded to a whole byte."""
    row_bytes = (w + 7) // 8
    out = bytearray(row_bytes * h)
    for y in range(h):
        for x in range(w):
            if alpha.getpixel((x0 + x, y0 + y)) >= ALPHA_THRESHOLD:
                out[y * row_bytes + (x >> 3)] |= 0x80 >> (x & 7)
    return bytes(out)


def b64(data):
    return base64.b64encode(data).decode("ascii")


def main():
    lines = [
        '"use strict";',
        "",
        "/* =================================================================",
        "   OBJECT + CHARACTER ALPHA MASKS — GENERATED FILE, don't hand-edit.",
        "   Regenerate with: python tools/generate_alpha_masks.py",
        "",
        "   1-bit-per-pixel transparency masks (MSB first, rows padded to a",
        "   whole byte, base64). js/camera.js uses these to fade a tree/stone/",
        "   house ONLY when the character's real visible pixels are actually",
        "   covered by the object's real visible pixels — never for transparent",
        "   deadspace, never for just standing beside it. See the generator",
        "   script's docstring for why these are baked in rather than read",
        "   from the images at runtime (file:// + canvas getImageData).",
        "================================================================= */",
        "const OBJECT_ALPHA_MASKS = {",
    ]

    for key, rel in OBJECT_ICONS.items():
        im = Image.open(os.path.join(ROOT, rel)).convert("RGBA")
        w, h = im.size
        data = pack_bits(im.split()[3], 0, 0, w, h)
        lines.append(f'  {key}: {{ w: {w}, h: {h}, b64: "{b64(data)}" }},')
    lines.append("};")
    lines.append("")

    # Character sheets: frames laid out left to right, 64x64 each. Each
    # sheet is cropped to the union bbox of its frames (x/y/w/h, in sprite
    # px within one 64x64 frame); frame i's bits start at byte
    # i * rowBytes * h.
    lines.append("const CHARACTER_ALPHA_MASKS = {")
    sprites_dir = os.path.join(ROOT, "assets", "sprites")
    for path in sorted(glob.glob(os.path.join(sprites_dir, "*", "*.png"))):
        rel = os.path.relpath(path, sprites_dir).replace(os.sep, "/")
        im = Image.open(path).convert("RGBA")
        frames = im.size[0] // FRAME_SIZE
        alpha = im.split()[3]
        bbox = None
        for i in range(frames):
            fb = alpha.crop((i * FRAME_SIZE, 0, (i + 1) * FRAME_SIZE, FRAME_SIZE)) \
                .point(lambda v: 255 if v >= ALPHA_THRESHOLD else 0).getbbox()
            if fb:
                bbox = fb if bbox is None else (
                    min(bbox[0], fb[0]), min(bbox[1], fb[1]),
                    max(bbox[2], fb[2]), max(bbox[3], fb[3]))
        if bbox is None:
            continue
        bx, by, bx2, by2 = bbox
        bw, bh = bx2 - bx, by2 - by
        data = b"".join(pack_bits(alpha, i * FRAME_SIZE + bx, by, bw, bh) for i in range(frames))
        lines.append(
            f'  "{rel}": {{ frames: {frames}, x: {bx}, y: {by}, w: {bw}, h: {bh}, b64: "{b64(data)}" }},')
    lines.append("};")
    lines.append("")

    with open(OUT, "w", newline="\n") as f:
        f.write("\n".join(lines))
    print("wrote", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
