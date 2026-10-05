#!/usr/bin/env python3
"""
Builds the town's new buildings, props, furniture and room art out of the
Buildings pack (assets/buildings/source/, the pack exactly as uploaded) and
writes js/townBuildings.data.js — the measured sizes every new item and
room needs, so the JS never guesses.

Run from the project root (needs Pillow + numpy):
    python tools/build_town_assets.py

Outputs
  assets/buildings/exterior/<type>.png   composed houses (walls + roof + door + windows)
  assets/buildings/props/<type>.png      outdoor props cut from Props.png
  assets/buildings/furniture/<type>.png  indoor furniture / wall decor / rugs
  assets/buildings/rooms/<room>.png      room art: back wall, floor, frame, doorway, doormat
"""
import json, os, math, random
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "buildings", "source")
OUT = os.path.join(ROOT, "assets", "buildings")
T = 16

def load(rel): return Image.open(os.path.join(SRC, rel)).convert("RGBA")
WALLS, ROOFS, PROPS = load("Walls.png"), load("Roofs.png"), load("Props.png")
IWALLS, IPROPS = load("Interior/Interior_Walls_01.png"), load("Interior/Interior_Props_01.png")

def trim(im):
    bb = im.getbbox()
    return im.crop(bb) if bb else im

def cut(sheet, box):
    return trim(sheet.crop(box))

def save(im, sub, name):
    d = os.path.join(OUT, sub); os.makedirs(d, exist_ok=True)
    im.save(os.path.join(d, name + ".png"))

# ---------------------------------------------------------------- houses
# Front-wall strips (Walls.png, y 184-240): every style is 96px wide, cut
# into pieces 32/16/32/16 wide, each with its own outline, so they tile.
WALL_STYLE_X = {"log": 0, "plank": 96, "vplank": 192, "beam": 288, "cream": 384, "brick": 480}
def wall_piece(style, i):
    x0 = WALL_STYLE_X[style] + [0, 32, 48, 80][i % 4]
    w = [32, 16, 32, 16][i % 4]
    return WALLS.crop((x0, 184, x0 + w, 240))

# One continuous wall of any height: the strip's top trim once at the top,
# its body (logs / planks / plaster) repeated downwards, its base once at
# the bottom. No second trim line half-way up, so the gable under the
# roof reads as solid wall ("parang may butas" fix).
TRIM, BODY, BASE = (0, 12), (12, 42), (42, 56)
def wall_column(style, i, height):
    p = wall_piece(style, i)
    col = Image.new("RGBA", (p.width, height))
    col.alpha_composite(p.crop((0, TRIM[0], p.width, TRIM[1])), (0, 0))
    y = TRIM[1]
    body = p.crop((0, BODY[0], p.width, BODY[1]))
    while y < height - (BASE[1] - BASE[0]):
        h = min(body.height, height - (BASE[1] - BASE[0]) - y)
        col.alpha_composite(body.crop((0, 0, p.width, h)), (0, y)); y += h
    col.alpha_composite(p.crop((0, BASE[0], p.width, BASE[1])), (0, height - (BASE[1] - BASE[0])))
    return col

# Seamless front walls: every 32/16px piece of a wall strip has its own dark
# outline, so laying pieces side by side drew a vertical line every 1-2
# tiles. Instead one measured span from INSIDE a piece repeats with no seam
# (column s+len matches column s), and the wall gets a single outline at
# its two outer edges only.
WALL_SEAMLESS = {"log": (2, 25), "plank": (11, 16), "vplank": (2, 24), "beam": (2, 20), "cream": (2, 20), "brick": (3, 16)}
def wall_block(style, width, height):
    x0 = WALL_STYLE_X[style]
    s, L = WALL_SEAMLESS[style]
    tex = WALLS.crop((x0 + s, 184, x0 + s + L, 240))
    strip = Image.new("RGBA", (width, 56))
    for x in range(0, width, L): strip.alpha_composite(tex, (x, 0))
    strip.alpha_composite(WALLS.crop((x0, 184, x0 + 1, 240)), (0, 0))                 # left outline
    strip.alpha_composite(WALLS.crop((x0 + 95, 184, x0 + 96, 240)), (width - 1, 0))  # right outline
    col = Image.new("RGBA", (width, height))
    col.alpha_composite(strip.crop((0, TRIM[0], width, TRIM[1])), (0, 0))
    y = TRIM[1]
    body = strip.crop((0, BODY[0], width, BODY[1]))
    while y < height - (BASE[1] - BASE[0]):
        h = min(body.height, height - (BASE[1] - BASE[0]) - y)
        col.alpha_composite(body.crop((0, 0, width, h)), (0, y)); y += h
    col.alpha_composite(strip.crop((0, BASE[0], width, BASE[1])), (0, height - (BASE[1] - BASE[0])))
    return col

_ROOF_LABELS = None
def roof_a(color):  # the wide gable roof, 128x89 — ONLY its own pixels
    # The box this roof sits in also catches the top of the steep roof
    # below it (two little triangles + its ridge post). Copying the box
    # whole is what drew those "floating" triangles on every gable — so
    # keep only the pixels connected to the roof itself.
    global _ROOF_LABELS
    from scipy import ndimage
    a = np.array(ROOFS)
    if _ROOF_LABELS is None:
        _ROOF_LABELS, _ = ndimage.label(a[..., 3] > 0, structure=np.ones((3, 3)))
    keep = _ROOF_LABELS == _ROOF_LABELS[50, 32]
    a = a.copy(); a[~keep] = 0
    x0 = 0 if color == "brown" else 128
    return Image.fromarray(a[6:95, x0:x0 + 128])

DOORS = {"plank": (100, 26, 124, 66), "arched": (132, 24, 156, 66), "iron": (164, 23, 188, 66)}
WINDOWS = {"pane": (130, 97, 158, 126), "sill": (34, 94, 60, 129), "arched": (100, 62, 124, 98), "shutter": (128, 62, 161, 98), "small": (46, 78, 65, 97)}
PLANTER = (48, 150, 80, 172)
CHIMNEY = (4, 70, 28, 130)
STEP = (31, 63, 65, 77)

def compose_house(wall, roof, door, window, gables=1, chimney=True):
    W = 128 * gables
    im = Image.new("RGBA", (W, 144))
    if chimney:
        ch = cut(PROPS, CHIMNEY); im.alpha_composite(ch, (W - 44, 0))
    wall_w = W - 16
    im.alpha_composite(wall_block(wall, wall_w, 112), (8, 32))  # one wall from under the roof to the ground
    for g in range(gables): im.alpha_composite(roof_a(roof), (128 * g, 2))
    d = cut(PROPS, DOORS[door]); dx = W // 2 - d.width // 2
    st = cut(PROPS, STEP)
    im.alpha_composite(d, (dx, 144 - d.height - 4))
    im.alpha_composite(st, (W // 2 - st.width // 2, 144 - st.height))
    win = cut(PROPS, WINDOWS[window]); pl = cut(PROPS, PLANTER)
    centres = [32, W - 32] if gables == 1 else [36, 84, W - 84, W - 36]
    for cx in centres:
        im.alpha_composite(win, (cx - win.width // 2, 98))
        im.alpha_composite(pl, (cx - pl.width // 2, 98 + win.height - 4))
    return im

HOUSES = {
    "cottageLog":     dict(wall="log",   roof="brown", door="plank",  window="pane"),
    "cottagePlaster": dict(wall="beam",  roof="teal",  door="arched", window="shutter"),
    "cottageBrick":   dict(wall="brick", roof="brown", door="iron",   window="arched"),
    "guardHouse":     dict(wall="vplank", roof="teal", door="iron",   window="pane", gables=2),
}
data = {"houses": {}, "props": {}, "furniture": {}, "rooms": {}}

# ---------------------------------------------------------------- cave
MTN = os.path.join(ROOT, "assets", "tiles", "mountain")
def mtile(name): return Image.open(os.path.join(MTN, name + ".png")).convert("RGBA")
ROCK_DARK, ROCK_EDGE, WOOD, WOOD_DARK = (16, 11, 9, 255), (52, 36, 28, 255), (122, 78, 44, 255), (58, 36, 20, 255)
def compose_cave_entrance():
    W, H = 64, 80
    im = Image.new("RGBA", (W, H))
    rows = ["top-wall-mountain", "center-wall-mountain", "center-wall-mountain", "center-wall-mountain", "bottom-wall-mountain"]
    for r, base in enumerate(rows):
        for c in range(4): im.alpha_composite(mtile(f"{base}-{c + 2}"), (c * 16, r * 16))
    px = im.load()
    cx, top, half = 32, 30, 16
    for y in range(top, H):
        for x in range(cx - half - 2, cx + half + 2):
            dy = max(0, (top + half) - y)
            inside = (x - cx) ** 2 + dy ** 2 <= half ** 2 if y < top + half else abs(x - cx) <= half
            edge = (x - cx) ** 2 + dy ** 2 <= (half + 2) ** 2 if y < top + half else abs(x - cx) <= half + 2
            if inside:
                depth = min(1.0, (y - top) / 40)
                g = int(10 + 14 * depth)
                px[x, y] = (g + 4, g, g - 2, 255)
            elif edge:
                px[x, y] = ROCK_EDGE
    # timber frame — an old mine entrance
    for x0 in (cx - half - 1, cx + half - 4):
        for y in range(top + 4, H):
            for x in range(x0, x0 + 5): px[x, y] = WOOD_DARK if x in (x0, x0 + 4) else WOOD
    for y in range(top, top + 6):
        for x in range(cx - half - 4, cx + half + 4): px[x, y] = WOOD_DARK if y in (top, top + 5) else WOOD
    return im

def compose_cave_room(cols, rows):
    W, H = cols * T, rows * T
    im = Image.new("RGBA", (W, H), (8, 6, 5, 255))
    floor = Image.open(os.path.join(ROOT, "assets", "items", "tile", "dirt2.png")).convert("RGBA")
    tile_fill(im, floor, (6, 64, W - 6, H - 8))
    band = Image.new("RGBA", (64, 56))
    for c in range(4):
        band.alpha_composite(mtile(f"center-wall-mountain-{c + 2}").crop((0, 8, 16, 16)), (c * 16, 0))
        band.alpha_composite(mtile(f"center-wall-mountain-{c + 2}"), (c * 16, 8))
        band.alpha_composite(mtile(f"center-wall-mountain-{c + 2}"), (c * 16, 24))
        band.alpha_composite(mtile(f"center-wall-mountain-{c + 2}"), (c * 16, 40))
    tile_fill(im, band, (6, 8, W - 6, 64))
    gap0, gap1 = W // 2 - 16, W // 2 + 16
    px = im.load()
    for x in range(W):
        for y in range(H):
            edge, bottom = min(x, W - 1 - x, y), H - 1 - y
            if edge < 6 or (bottom < 8 and not gap0 <= x < gap1):
                px[x, y] = ROCK_DARK if (edge + bottom) % 5 else ROCK_EDGE
    # it's a cave: everything a little darker towards the walls
    a = np.array(im).astype(float)
    yy, xx = np.mgrid[0:H, 0:W]
    shade = 1 - 0.45 * np.clip(np.maximum(abs(xx - W / 2) / (W / 2), abs(yy - H * 0.6) / (H * 0.6)) - 0.35, 0, 1)
    a[..., :3] *= shade[..., None] * 0.62
    return Image.fromarray(a.astype(np.uint8))
def compose_grocery():
    im = compose_house(wall="plank", roof="brown", door="arched", window="shutter", gables=2)
    VEG = os.path.join(ROOT, "assets", "items", "vegetables")
    sign = Image.new("RGBA", (56, 22))
    sp = sign.load()
    for x in range(56):
        for y in range(22):
            edge = min(x, 55 - x, y, 21 - y)
            sp[x, y] = (40, 24, 14, 255) if edge == 0 else (122, 78, 44, 255) if edge < 3 else (164, 112, 64, 255)
    for i, v in enumerate(["carrots/carrots_mature", "cabbage/cabbage_mature", "onion/onion_mature"]):
        ic = trim(Image.open(os.path.join(VEG, v + ".png")).convert("RGBA"))
        ic.thumbnail((16, 16), Image.NEAREST)
        sign.alpha_composite(ic, (4 + i * 17 + (16 - ic.width) // 2, 3 + (16 - ic.height) // 2))
    im.alpha_composite(sign, (128 - 28, 62))
    return im
gro = compose_grocery(); save(gro, "exterior", "groceryStore")
data["houses"]["groceryStore"] = {"w": gro.width, "h": gro.height}
cave = compose_cave_entrance(); save(cave, "exterior", "caveEntrance")
data["houses"]["caveEntrance"] = {"w": cave.width, "h": cave.height}
for name, cfg in HOUSES.items():
    im = compose_house(**cfg); save(im, "exterior", name)
    data["houses"][name] = {"w": im.width, "h": im.height}

# ---------------------------------------------------------------- props / furniture
PROP_CUTS = {  # outdoor, Props.png
    "bldPlanterBox": (16, 158, 48, 172), "bldPlanterBush": PLANTER,
    "bldBenchWood": (82, 174, 143, 193), "bldBenchStone": (16, 130, 49, 145),
    "bldLampPost": (2, 126, 13, 178), "bldChimney": CHIMNEY,
}
FURN_CUTS = {  # indoor, Interior_Props_01.png (and a few wall pieces from Props.png)
    "bldTableLong": (0, 0, 64, 26), "bldChair": (65, 2, 79, 27), "bldTableRound": (79, 5, 112, 42),
    "bldStove": (114, 0, 143, 63), "bldStoveBig": (175, 0, 225, 63),
    "bldWardrobe": (0, 32, 32, 96), "bldDresser": (32, 32, 64, 66),
    "bldBedSingle": (0, 292, 32, 348), "bldBedDouble": (32, 292, 80, 348), "bldCouch": (82, 300, 126, 321),
    "bldFireplace": (272, 46, 321, 145), "bldOven": (384, 46, 433, 145),
    "bldBarrel": (223, 120, 241, 145), "bldChest": (63, 255, 96, 289), "bldCounterSink": (112, 225, 209, 257),
    "bldBench": (0, 201, 49, 225), "bldTub": (127, 146, 176, 176),
    "bldPlantFlower": (16, 350, 32, 384), "bldPlantA": (47, 352, 64, 384), "bldPlantB": (64, 352, 81, 384),
    "bldPlantSmall": (31, 358, 48, 384),
    "bldTableCloth": (7, 163, 41, 192),
    "bldChandelier": (209, 65, 237, 95), "bldCuttingBoard": (401, 229, 431, 249), "bldBreadBoard": (433, 225, 463, 240),
    "bldPot": (496, 272, 512, 288), "bldBasket": (496, 288, 512, 304), "bldKettle": (455, 272, 473, 288), "bldPan": (480, 255, 500, 270),
    "bldPotionRed": (516, 290, 532, 306), "bldPotionGreen": (516, 306, 532, 322), "bldPotionPurple": (516, 322, 532, 338),
    "bldBroom": (592, 336, 608, 366), "bldStoolRed": (96, 61, 111, 72), "bldStool": (81, 61, 96, 81), "bldCupboard": (112, 67, 144, 93),
    "bldCrateDark": (208, 121, 224, 144), "bldWallPanel": (166, 260, 186, 280), "bldWallCandle": (545, 192, 558, 208), "bldShelfLong": (367, 6, 432, 47), "bldCabinetWide": (432, 6, 496, 47),
    "floorMatBldGreen": (335, 335, 385, 385), "floorMatBldDark": (383, 335, 433, 385), "floorMatBldCross": (432, 305, 513, 385),
    "bldWallWindow": (66, 175, 93, 209), "bldWallWindowStone": (97, 175, 125, 209),
    "bldWallFrame": (193, 259, 222, 284), "bldWallBoard": (225, 259, 254, 284),
    "bldWallTrophyWolf": (551, 6, 569, 26), "bldWallTrophyBear": (583, 6, 601, 26),
}
WALL_FROM_PROPS = {"bldWallDoorPlank": DOORS["plank"], "bldWallDoorArched": DOORS["arched"], "bldWallShutters": (128, 62, 161, 98)}
for n, b in PROP_CUTS.items():
    im = cut(PROPS, b); save(im, "props", n); data["props"][n] = {"w": im.width, "h": im.height}
for n, b in FURN_CUTS.items():
    im = cut(IPROPS, b); save(im, "furniture", n); data["furniture"][n] = {"w": im.width, "h": im.height}
for n, b in WALL_FROM_PROPS.items():
    im = cut(PROPS, b); save(im, "furniture", n); data["furniture"][n] = {"w": im.width, "h": im.height}

# ---------------------------------------------------------------- rooms
# Interior_Walls_01.png: four wall sets 96px apart (log, stone, wood,
# plaster); each set's back-wall band (top trim, panel, baseboard) is the
# 64x56 piece at x0+16, y 88. Floors along the bottom of the sheet.
WALLSET_X = {"log": 0, "stone": 96, "wood": 192, "plaster": 288}
FLOORS = {"planks": (16, 322, 64, 370), "stone": (96, 322, 144, 370), "herring": (176, 322, 224, 370), "parquet": (264, 330, 296, 362)}
FRAME_DARK, FRAME_TRIM = (24, 16, 12, 255), (122, 78, 44, 255)

def tile_fill(im, tex, box):
    x0, y0, x1, y1 = box
    for y in range(y0, y1, tex.height):
        for x in range(x0, x1, tex.width):
            piece = tex.crop((0, 0, min(tex.width, x1 - x), min(tex.height, y1 - y)))
            im.alpha_composite(piece, (x, y))

def compose_room(cols, rows, wallset, floor, mat):
    W, H = cols * T, rows * T
    im = Image.new("RGBA", (W, H), (10, 10, 10, 255))
    band = IWALLS.crop((WALLSET_X[wallset] + 16, 88, WALLSET_X[wallset] + 80, 144))
    tile_fill(im, IWALLS.crop(FLOORS[floor]), (6, 64, W - 6, H - 8))
    tile_fill(im, band, (6, 8, W - 6, 64))
    # frame: dark outline + a wooden trim, open at the bottom centre (the doorway)
    gap0, gap1 = W // 2 - 16, W // 2 + 16
    px = im.load()
    for x in range(W):
        for y in range(H):
            edge = min(x, W - 1 - x, y)
            bottom = H - 1 - y
            if edge < 6 or (bottom < 8 and not gap0 <= x < gap1):
                d = min(edge, bottom if not gap0 <= x < gap1 else 99)
                px[x, y] = FRAME_DARK if d in (0, 5) or (bottom == 7 and not gap0 <= x < gap1) else FRAME_TRIM
    m = cut(IPROPS, mat)
    m = m.resize((32, max(8, round(m.height * 32 / m.width))), Image.NEAREST)
    im.alpha_composite(m, (gap0, H - m.height))
    return im

ROOMS = {
    "cottage_wood": dict(cols=14, rows=12, wallset="wood", floor="planks", mat=FURN_CUTS["floorMatBldGreen"]),
    "plaster_room": dict(cols=14, rows=12, wallset="plaster", floor="parquet", mat=FURN_CUTS["floorMatBldDark"]),
    "guard_room":   dict(cols=20, rows=13, wallset="stone", floor="stone", mat=FURN_CUTS["floorMatBldGreen"]),
}
for name, cfg in ROOMS.items():
    im = compose_room(**cfg); save(im, "rooms", name)
    data["rooms"][name] = {"w": im.width, "h": im.height, "cols": cfg["cols"], "rows": cfg["rows"]}

cr = compose_cave_room(22, 14); save(cr, "rooms", "cave_room")
data["rooms"]["cave_room"] = {"w": cr.width, "h": cr.height, "cols": 22, "rows": 14}

# The in-game room builder (js/roomCustomizer.js) draws rooms of any size
# from the source sheet itself; it needs each wall set's band box, its
# frame colours (read here, since the game can't read pixels back under
# file://) and each floor's texture box.
frames = {}
for name, x0 in WALLSET_X.items():
    cols = []
    for x in range(x0, x0 + 8):
        p = IWALLS.getpixel((x, 48))
        if p[3] > 0: cols.append("#%02x%02x%02x" % p[:3])
    frames[name] = cols[:6] if len(cols) >= 4 else ["#181010", "#7a4e2c", "#7a4e2c", "#5a3a20", "#3a2414", "#181010"]
data["wallSets"] = {n: {"band": [x0 + 16, 88, 64, 56], "frame": frames[n]} for n, x0 in WALLSET_X.items()}
data["floors"] = {n: [b[0], b[1], b[2] - b[0], b[3] - b[1]] for n, b in FLOORS.items()}


# ---------------------------------------------------------------- Pixel Crawler pack
# Props cut automatically (one item per separate picture) from the pack's
# static prop sheets, plus its trees and work stations; and the cave's
# rock walls/floor from its Wall_Tiles.png.
from scipy import ndimage
PC = os.path.join(ROOT, "assets", "pixelcrawler", "source", "Environment")
PC_SHEETS = {"Rocks": "Props/Static/Rocks.png", "Dungeon": "Props/Static/Dungeon_Props.png", "Esoteric": "Props/Static/Esoteric.png",
             "Farm": "Props/Static/Farm.png", "Furniture": "Props/Static/Furniture.png", "Vegetation": "Props/Static/Vegetation.png",
             "Resources": "Props/Static/Resources.png"}
SOLID_GROUPS = {"Rocks", "Furniture", "Dungeon", "Tree", "Station"}
data["pc"] = {}
def pc_save(img, pid, group):
    save(img, os.path.join("..", "pixelcrawler", "props"), pid)
    data["pc"][pid] = {"w": img.width, "h": img.height, "group": group,
                       "solid": group in SOLID_GROUPS and img.width >= 14 and img.height >= 14}
for group, rel in PC_SHEETS.items():
    sheet = Image.open(os.path.join(PC, rel)).convert("RGBA"); a = np.array(sheet)
    lab, _ = ndimage.label(a[..., 3] > 0, structure=np.ones((3, 3)))
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if sl is None: continue
        x0, y0, x1, y1 = sl[1].start, sl[0].start, sl[1].stop, sl[0].stop
        w, h = x1 - x0, y1 - y0
        if w < 8 or h < 8 or w > 160 or h > 160 or (lab[sl] == i + 1).sum() < 50: continue
        piece = a[y0:y1, x0:x1].copy(); piece[lab[y0:y1, x0:x1] != i + 1] = 0
        if piece[..., :3][piece[..., 3] > 0].mean() < 28: continue      # the sheet's black swatches
        if h <= 9 and w >= 30: continue                                  # the "PALETTE" label
        boxes.append((y0 // 8, x0, piece))
    boxes.sort(key=lambda b: (b[0], b[1]))
    for n, (_, _, piece) in enumerate(boxes):
        pc_save(Image.fromarray(piece), f"pc{group}{n + 1:02d}", group)
import glob as _glob
for f in sorted(_glob.glob(os.path.join(PC, "Props", "Static", "Trees", "Model_*", "Size_0[2-5].png"))):
    m, sz = f.split(os.sep)[-2][-2:], f[-6:-4]
    pc_save(trim(Image.open(f).convert("RGBA")), f"pcTree{m}{sz}", "Tree")
for name, rel in [("Workbench", "Structures/Stations/Workbench/Workbench.png"), ("Anvil", "Structures/Stations/Anvil/Anvil.png"),
                  ("CookingStation", "Structures/Stations/Cooking Station/Cooking Station.png")]:
    im = trim(Image.open(os.path.join(PC, rel)).convert("RGBA"))
    if im.width <= 160 and im.height <= 160: pc_save(im, "pc" + name, "Station")

# cave textures — the first cave's look (per request: "dirt lang tyaka wall
# mountain"): the back wall is the mountain's own cliff tiles, the floor the
# map's dirt, both a little darker underground.
cave_sheet = Image.new("RGBA", (112, 56))
for c in range(4):
    cave_sheet.alpha_composite(mtile(f"top-wall-mountain-{c + 2}"), (c * 16, 8))
    cave_sheet.alpha_composite(mtile(f"center-wall-mountain-{c + 2}"), (c * 16, 24))
    cave_sheet.alpha_composite(mtile(f"center-wall-mountain-{c + 2}"), (c * 16, 40))
_dr = random.Random(3)
for y in range(3):
    for x in range(3):
        d = Image.open(os.path.join(ROOT, "assets", "items", "tile", f"dirt{_dr.randint(1, 3)}.png")).convert("RGBA")
        cave_sheet.alpha_composite(d, (64 + x * 16, y * 16))
ca = np.array(cave_sheet).astype(float); ca[..., :3] *= 0.72; cave_sheet = Image.fromarray(ca.astype(np.uint8))
save(cave_sheet, "rooms", "cave_sheet")
data["wallSets_extra"] = {"cave": {"sheet": "cave_sheet", "band": [0, 0, 64, 56], "frame": ["#0a0706", "#3a281e", "#4a3326", "#34241b", "#1c130e"]}}
data["floors_extra"] = {"cave": {"sheet": "cave_sheet", "box": [64, 0, 48, 48]}}

# winding cave layouts: tunnel from the door that bends and widens into a
# cavern, an inner door at the cavern's top leading to a deeper chamber.
def blob(cx, cy, rx, ry, rnd, wob=0.25):
    out = set()
    for r in range(cy - ry - 2, cy + ry + 3):
        for c in range(cx - rx - 2, cx + rx + 3):
            ang = math.atan2(r - cy, c - cx)
            k = 1 + wob * math.sin(3 * ang + rnd) + wob * 0.5 * math.cos(5 * ang + rnd * 2)
            if ((c - cx) / (rx * k)) ** 2 + ((r - cy) / (ry * k)) ** 2 <= 1: out.add((c, r))
    return out
def chaikin(points, n=2):
    for _ in range(n):
        q = [points[0]]
        for p, r in zip(points, points[1:]):
            q += [(0.75 * p[0] + 0.25 * r[0], 0.75 * p[1] + 0.25 * r[1]), (0.25 * p[0] + 0.75 * r[0], 0.25 * p[1] + 0.75 * r[1])]
        points = q + [points[-1]]
    return points
def smooth_tiles(tiles, keep):
    for _ in range(3):
        n8 = lambda c, r: sum((c + a, r + b) in tiles for a in (-1, 0, 1) for b in (-1, 0, 1) if a or b)
        cand = {(c + a, r + b) for (c, r) in tiles for a in (-1, 0, 1) for b in (-1, 0, 1)}
        add = {p for p in cand if p not in tiles and n8(*p) >= 5}
        tiles = tiles | add
        rem = {p for p in tiles if p not in keep and n8(*p) <= 3}
        tiles = tiles - rem
    return tiles
def tunnel(points, widths):
    out = set()
    for (p, q), w in zip(zip(points, points[1:]), widths):
        steps = int(max(abs(q[0] - p[0]), abs(q[1] - p[1])) * 2) + 1
        for i in range(steps + 1):
            x = p[0] + (q[0] - p[0]) * i / steps; y = p[1] + (q[1] - p[1]) * i / steps
            for dx in range(-w, w + 1):
                for dy in range(-w, w + 1):
                    if dx * dx + dy * dy <= w * w + 1: out.add((round(x + dx), round(y + dy)))
    return out
import math, random
def cave_layout(seed, door, path, widths, cavern, chamber, chamber_tunnel):
    rnd = random.Random(seed)
    sp = chaikin(path)
    main = tunnel(sp, [w for w in widths for _ in range(4)][:len(sp) - 1] + [widths[-1]] * 8) | blob(*cavern, rnd.random() * 6, 0.12)
    deep = blob(*chamber, rnd.random() * 6, 0.12) | tunnel(chamber_tunnel, [2] * (len(chamber_tunnel) - 1))
    tiles = {(c, r) for (c, r) in main | deep if r < door[1] and c >= 1 and r >= 4}
    keep = set()
    for c in (door[0], door[0] + 1):
        for r in (door[1] - 1, door[1] - 2, door[1] - 3): keep.add((c, r))
    tiles = smooth_tiles(tiles | keep, keep)
    tiles = {(c, r) for (c, r) in tiles if r < door[1] and c >= 1 and r >= 4}
    # inner door: the top-most tile of the cavern, under its back wall
    top = min((p for p in main if p in tiles and p[0] == cavern[0]), key=lambda p: p[1])
    entry = max((p for p in deep if p in tiles and p[0] == chamber_tunnel[-1][0]), key=lambda p: p[1])
    return tiles, top, entry, chamber_passages(deep, tiles, chamber[0], chamber[2])
def compose_cave_hole():
    """A plain opening in the rock (no timber) — the inner doors and the
    passages between caves, hung on the cave's back wall."""
    W, H = 32, 40
    im = Image.new("RGBA", (W, H)); px = im.load()
    cx, top, half = 16, 6, 11
    for y in range(H):
        for x in range(W):
            dy = max(0, (top + half) - y)
            d = math.hypot(x - cx, dy) if y < top + half else abs(x - cx)
            if d <= half:
                g = int(6 + 10 * min(1, (y - top) / 30)); px[x, y] = (g + 3, g, g - 1 if g > 0 else 0, 255)
            elif d <= half + 1.5: px[x, y] = (28, 19, 14, 255)
            elif d <= half + 3.5: px[x, y] = (62, 43, 32, 255) if (x + y) % 3 else (48, 33, 25, 255)
    return im
hole = compose_cave_hole(); save(hole, "furniture", "bldWallCaveHole")
data["furniture"]["bldWallCaveHole"] = {"w": hole.width, "h": hole.height}

def chamber_passages(deep, tiles, cx, rx):
    out = {}
    for name, col in (("A", cx - max(2, rx // 2)), ("B", cx + max(2, rx // 2))):
        col_tiles = [p for p in deep if p in tiles and p[0] == col]
        if col_tiles: out[name] = min(col_tiles, key=lambda p: p[1])
    return out

def cave_decor(tiles, avoid, rnd, n_big, kinds):
    floor = sorted(tiles - avoid); out = []; used = set()
    for t, cnt in kinds:
        for _ in range(cnt * 20):
            if not cnt: break
            c, r = rnd.choice(floor)
            if any((c + a, r + b) in used for a in (-1, 0, 1) for b in (-1, 0, 1)): continue
            if not all((c + a, r) in tiles for a in (-1, 0, 1)): continue
            out.append([c, r, t]); used.add((c, r)); cnt -= 1
    return out
data["caveLayouts"] = {}
for name, seed, door, path, widths, cavern, chamber, ctun in [
    ("cave_room", 5, (20, 33), [(21, 31), (21, 27), (17, 23), (15, 19), (19, 15)], [2, 2, 2, 2], (22, 11, 10, 6), (40, 14, 6, 5), [(40, 26), (40, 18)]),
    ("tunnel_room", 9, (8, 33), [(9, 31), (9, 26), (14, 22), (23, 22), (29, 17), (26, 11)], [2, 2, 2, 2, 2], (24, 8, 7, 4), (44, 20, 7, 6), [(44, 31), (44, 24)]),
    ("cave2_room", 13, (26, 33), [(27, 31), (27, 27), (32, 24), (34, 19), (29, 15)], [2, 2, 2, 2], (24, 10, 9, 5), (8, 19, 6, 5), [(8, 31), (8, 23)]),
]:
    tiles, top, entry, passages = cave_layout(seed, door, path, widths, cavern, chamber, ctun)
    rnd = random.Random(seed + 100)
    avoid = {(c, r) for c in range(door[0] - 1, door[0] + 3) for r in range(door[1] - 3, door[1])}
    avoid |= {(top[0] + a, top[1] + b) for a in (-1, 0, 1) for b in (0, 1, 2)} | {(entry[0] + a, entry[1] - b) for a in (-1, 0, 1) for b in (0, 1, 2)}
    avoid |= tunnel(path, [0] * (len(path) - 1))   # keep the middle of the way clear
    for (pc_, pr_) in passages.values(): avoid |= {(pc_ + a, pr_ + b) for a in (-1, 0, 1) for b in (0, 1, 2)}
    decor = cave_decor(set(tiles), avoid, rnd, 0, [("stoneBig", 3), ("stoneMedium", 4), ("stoneSmall", 5), ("bushMushroom1", 4), ("bushMushroom2", 4),
                                                  ("stoneDecor2", 5), ("stoneDecor3", 4), ("pcRocks01", 2), ("pcRocks05", 2)])
    links = {k: {"col": c, "row": r} for k, (c, r) in passages.items() if name == "tunnel_room" or k == "A"}
    decor += [[l["col"], l["row"] - 1, "bldWallCaveHole"] for l in links.values()]
    decor += [[top[0], top[1] - 1, "bldWallCaveHole"], [top[0] - 2, top[1] - 1, "bldWallCandle"], [top[0] + 2, top[1] - 1, "bldWallCandle"],
              [entry[0] + 2, entry[1] - 6, "bldChest"], [entry[0] - 2, entry[1] - 6, "postLightLit"], [door[0] + 3, door[1] - 2, "postLightLit"]]
    data["caveLayouts"][name] = {
        "tiles": [f"{c},{r}" for (c, r) in sorted(tiles)], "door": list(door), "decor": decor, "links": links,
        "version": __import__("hashlib").md5(json.dumps([sorted(tiles), decor]).encode()).hexdigest()[:10],
        "warp": {"forwardPortal": [{"col": top[0], "row": top[1]}], "forwardSpawn": [{"col": entry[0], "row": entry[1] - 1}],
                 "returnPortal": [{"col": entry[0], "row": entry[1]}], "returnSpawn": [{"col": top[0], "row": top[1] + 1}]},
    }

def compose_tunnel_entrance():
    return compose_cave_entrance()
tun = compose_tunnel_entrance(); save(tun, "exterior", "tunnelEntrance")
data["houses"]["tunnelEntrance"] = {"w": tun.width, "h": tun.height}
save(tun, "exterior", "caveEntranceB"); data["houses"]["caveEntranceB"] = {"w": tun.width, "h": tun.height}

import time as _time
data["version"] = _time.strftime("%Y%m%d%H%M%S")  # cache-buster for the generated images (js/assets.js)
with open(os.path.join(ROOT, "js", "townBuildings.data.js"), "w", newline="\n") as f:
    f.write("\"use strict\";\n// Generated by tools/build_town_assets.py — measured art sizes for the town buildings.\n")
    f.write("const TOWN_ART = " + json.dumps(data, indent=1) + ";\n")
print(json.dumps(data))
