#!/usr/bin/env python3
"""
Builds the second world ("wild", js/worlds.js) — per request: half the size
of the main map, dirt and grass inside, a mountain all the way round (the
cliff face is 4 tiles tall counting the grassy foot; trees, bushes and grass
on top of it), with a pass in the east wall where the path from the main map
comes in.

Writes js/wildWorld.data.js (WILD_WORLD_DEFAULT: placedItems + groundFill,
the same shape js/save.js stores a world in). Item ids must exist in itemDefs.
Run from the project root:  python tools/build_wild_world.py
"""
import base64, json, math, os, random
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLS, ROWS = 188, 103          # the shared tile grid (config.js)
W, H = 80, 46                  # the wild world's own size, in tiles (only as far as the trees go)
PASS = (20, 25)                # rows of the east pass (open, no mountain)
HOUSE = (40, 21)               # the player's house (door tile) — the default start
TUNNEL = (66, 8)               # the tunnel mouth in the north cliff, top right
CAVE_W = (14, 8)               # a second cave mouth, north cliff, west side
FARM = (44, 25, 51, 29)        # a fenced plot of bare earth beside the house
rng = random.Random(2026)
items = {}                     # (col,row,layer) -> type ; layer: 'g' ground/overlay, 'o' object
def put(c, r, t, layer="o"): items[(c, r, layer)] = t

# ---------------- the mountain ring ----------------
plateau = set()
for c in range(W):
    for r in range(H):
        north, west, south = r <= 4, c <= 4, r >= H - 5
        east = c >= W - 5 and not (PASS[0] - 4 <= r <= PASS[1])
        if north or west or south or east: plateau.add((c, r))
# south faces: under every plateau cell with open ground below, 4 tiles of cliff
walls = {}
for (c, r) in plateau:
    if (c, r + 1) in plateau or r + 1 >= H: continue
    seq = ["TopWallMountain4", "CenterWallMountain4", "CenterWallMountain4", "BottomWallMountain3"]
    for i, t in enumerate(seq):
        if (c, r + 1 + i) in plateau: break
        walls[(c, r + 1 + i)] = t
for (c, r), t in walls.items():
    # wall ends: the column at either end of a run gets the end piece
    left = (c - 1, r) not in walls and (c - 1, r) not in plateau
    right = (c + 1, r) not in walls and (c + 1, r) not in plateau
    if left: t = t[:-1] + "1"
    elif right: t = t[:-1] + "6"
    put(c, r, "terrainMountain" + t, "g")
for (c, r) in plateau:
    N = (c, r - 1) in plateau or r == 0
    Wn = (c - 1, r) in plateau or c == 0
    E = (c + 1, r) in plateau or c == W - 1
    S = (c, r + 1) in plateau or (c, r + 1) in walls or r == H - 1
    if not S: t = "BottomMountain" + str(2 + c % 2)
    elif not N and not Wn: t = "TopInnerMountain1"
    elif not N and not E: t = "TopInnerMountain6"
    elif not N: t = "TopInnerMountain" + str(2 + c % 4)
    elif not Wn: t = "CenterMountain" + ("1" if r % 2 else "7")
    elif not E: t = "CenterMountain" + ("6" if r % 2 else "12")
    else: t = rng.choice(["CenterMountain9", "CenterMountain9", "CenterMountain4", "CenterMountain10"])
    put(c, r, "terrainMountain" + t, "g")
    if not N and r > 0 and (c, r - 1) not in walls: put(c, r - 1, "terrainMountainTopMountain" + str(1 + c % 4), "g")

# ---------------- grass on the mountain top (tools/plateau_grass.py) ----------------
import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plateau_grass import plateau_grass
walk_plateau = {p for p in plateau if items.get((p[0], p[1], "g"), "").startswith("terrainMountainCenterMountain")
                and not items[(p[0], p[1], "g")].endswith(("Mountain1", "Mountain6", "Mountain7", "Mountain12"))}
PG = plateau_grass(walk_plateau | {p for p in plateau if items.get((p[0], p[1], "g"), "").startswith("terrainMountainTopInner")}, set(), seed=21, coverage=0.85, margin=1, blobs=60)
for (c, r), t in PG.items(): put(c, r, t, "g")

# ---------------- dirt (grass-edged, same corner autotile as the main map's paths) ----------------
D = set()
def rect(c0, r0, c1, r1):
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1): D.add((c, r))
rect(34, 22, W - 1, 23)            # the trail in from the east pass, past the house
rect(14, 22, 33, 23)               # on west
rect(20, 11, 21, 36)               # north-south trail in the west
rect(30, 32, 58, 33); rect(57, 23, 58, 33)   # a loop south
rect(TUNNEL[0], TUNNEL[1] + 1, TUNNEL[0] + 1, 21)   # up to the tunnel
rect(CAVE_W[0], CAVE_W[1] + 1, CAVE_W[0] + 1, 23)   # up to the west cave
rect(HOUSE[0] - 1, HOUSE[1] + 1, HOUSE[0], 21)     # the doorstep
rect(*FARM)
for (cx, cy, rad) in [(28, 15, 3), (60, 38, 3), (12, 32, 3), (52, 13, 2)]:   # clearings
    for r in range(cy - rad, cy + rad + 1):
        for c in range(cx - rad - 1, cx + rad + 2):
            if (c - cx) ** 2 / 1.4 + (r - cy) ** 2 <= rad * rad + 1: D.add((c, r))
hard = plateau | set(walls)
D = {p for p in D if p not in hard}
def corner_dirt(vc, vr): return any((vc - dc, vr - dr) in D for dc in (0, 1) for dr in (0, 1))
for _ in range(10):
    bad = []
    for (c, r) in {(c + a, r + b) for (c, r) in D for a in (-1, 0, 1) for b in (-1, 0, 1)}:
        if (c, r) in D: continue
        g = [not corner_dirt(c, r), not corner_dirt(c + 1, r), not corner_dirt(c, r + 1), not corner_dirt(c + 1, r + 1)]
        if g in ([True, False, False, True], [False, True, True, False]): bad.append((c, r))
    if not bad: break
    D |= set(bad)
TILE = {(1,1,0,0):['TopGrass2'],(0,0,1,1):['BottomGrass4'],(1,0,1,0):['LeftGrass2'],(0,1,0,1):['RightGrass2'],
 (1,0,0,0):['TopGrass4'],(0,1,0,0):['TopGrass5'],(0,0,1,0):['BottomGrass1'],(0,0,0,1):['BottomGrass2'],
 (1,1,1,0):['TopGrass1','LeftGrass1'],(1,1,0,1):['TopGrass3','RightGrass1'],(1,0,1,1):['BottomGrass3','LeftGrass3'],(0,1,1,1):['BottomGrass5','RightGrass3']}
dirt_or_edge = set()
for (c, r) in {(c + a, r + b) for (c, r) in D for a in (-1, 0, 1) for b in (-1, 0, 1)}:
    if not (0 <= c < W and 0 <= r < H) or ((c, r) in hard and (c, r) not in D): continue
    g = tuple(int(not corner_dirt(*v)) for v in [(c, r), (c + 1, r), (c, r + 1), (c + 1, r + 1)])
    if g == (1, 1, 1, 1): continue
    dirt_or_edge.add((c, r))
    if g != (0, 0, 0, 0): put(c, r, "terrainGrass" + rng.choice(TILE[g]), "g")

# ---------------- life: trees, bushes, flowers, mushrooms, stones, grass ----------------
occ = set(hard) | dirt_or_edge
# the homestead stays open: the house, its yard and the farm plot
for c in range(HOUSE[0] - 7, HOUSE[0] + 13):
    for r in range(HOUSE[1] - 10, FARM[3] + 3): occ.add((c, r))
for (mc, mr) in (TUNNEL, CAVE_W):
    for c in range(mc - 4, mc + 5):
        for r in range(0, mr + 3): occ.add((c, r))
def free(c0, c1, r0, r1, allow_plateau=False):
    for c in range(c0, c1 + 1):
        for r in range(r0, r1 + 1):
            if not (0 <= c < W and 0 <= r < H): return False
            if (c, r) in occ and not (allow_plateau and (c, r) in plateau and (c, r) not in dirt_or_edge): return False
    return True
SIZES = {"treeMediumGreen": 1, "treeMediumLightGreen": 1, "treeMediumYellow": 1, "treeMediumRed": 1, "treeThinGreen": 1,
         "treeThinOrange": 1, "treeBigOrange": 2, "treeTinyGreen": 0, "treeThinNoLeaves1": 1, "treeThinNoLeaves2": 1}
def scatter(types, count, box, tall=True, on_plateau=False, seed=1):
    r_ = random.Random(seed); n = 0
    c0, r0, c1, r1 = box
    for _ in range(count * 30):
        if n >= count: break
        c, r = r_.randint(c0, c1), r_.randint(r0, r1); t = r_.choice(types)
        half = SIZES.get(t, 0); up = 2 if tall else 0
        if on_plateau and (c, r) not in plateau: continue
        if (c, r) in walls: continue
        if free(c - half, c + half, r - up, r + 1, on_plateau):
            put(c, r, t)
            for a in range(c - half, c + half + 1):
                for b in range(r - up, r + 2): occ.add((a, b))
            n += 1
TREES = ["treeMediumGreen", "treeMediumLightGreen", "treeMediumYellow", "treeMediumRed", "treeThinGreen", "treeTinyGreen", "treeBigOrange", "treeThinOrange"]
scatter(TREES, 110, (6, 10, W - 7, H - 7), seed=3)
scatter(["treeThinNoLeaves1", "treeThinNoLeaves2", "treeMediumGreenTrunk", "treeMediumRedYellowTrunk", "treeBigCutStump", "treeThinCutStump"], 25, (6, 8, W - 7, H - 7), seed=4)
scatter(TREES[:5] + ["bushBigGreen", "bushMediumGreen", "bushSmallLightGreen"], 130, (0, 0, W - 1, H - 1), on_plateau=True, seed=5)
scatter(["bushSmallGreen", "bushMediumGreen", "bushXSLightGreen", "bushSmallRed", "bushXSYellow", "bushBigLightGreen"], 90, (6, 8, W - 7, H - 7), tall=False, seed=6)
scatter(["stoneMedium", "stoneSmall", "stoneXS", "stoneBig"], 40, (6, 8, W - 7, H - 7), tall=False, seed=7)
for t, n, s in [("bushMushroom1", 25, 8), ("bushMushroom2", 25, 9), ("bushFlowerA", 20, 10), ("bushFlowerB", 20, 11), ("bushFlowerC", 15, 12),
                ("bushFlowerD", 15, 13), ("decoFlower1", 15, 14), ("decoFlower2", 15, 15), ("stoneDecor1", 15, 16), ("stoneDecor2", 15, 17), ("stoneDecor3", 10, 18)]:
    scatter([t], n, (6, 8, W - 7, H - 7), tall=False, seed=s)
for i in range(60):                                       # grass tufts, in clumps
    r_ = random.Random(100 + i); cx, cy = r_.randint(1, W - 2), r_.randint(1, H - 2)
    for _ in range(6):
        c, r = cx + r_.randint(-2, 2), cy + r_.randint(-2, 2)
        if 0 <= c < W and 0 <= r < H and (c, r) not in walls and (c, r) not in dirt_or_edge and (c, r, "o") not in items:
            items[(c, r, "w")] = r_.choice(["wildGrass1", "wildGrass2", "wildGrass3", "wildGrass4", "wildGrass6", "wildGrass7"])
# the homestead: the player's house, the tunnel, the farm fence, a few things in the yard
put(HOUSE[0], HOUSE[1], "house")
put(TUNNEL[0], TUNNEL[1], "tunnelEntrance")
put(CAVE_W[0], CAVE_W[1], "caveEntranceB")
put(CAVE_W[0] + 3, CAVE_W[1] + 2, "postLight"); put(CAVE_W[0] - 3, CAVE_W[1] + 2, "stoneMedium")
f0c, f0r, f1c, f1r = FARM[0] - 1, FARM[1] - 1, FARM[2] + 1, FARM[3] + 1
gap = ((f0c + f1c) // 2, (f0c + f1c) // 2 + 1)
for c in range(f0c, f1c + 1):
    put(c, f0r, "fenceTileR1C0" if c == f0c else "fenceTileR1C4" if c == f1c else "fenceTileR0C2")
    if gap[0] <= c <= gap[1] and c not in (f0c, f1c): continue
    put(c, f1r, "fenceTileR3C0" if c == f0c else "fenceTileR3C4" if c == f1c else "fenceTileR3C1" if c == gap[0] - 1 else "fenceTileR3C3" if c == gap[1] + 1 else "fenceTileR4C2")
for r in range(f0r + 1, f1r): put(f0c, r, "fenceTileR2C0"); put(f1c, r, "fenceTileR2C4")
for (c, r, t) in [(HOUSE[0] - 5, HOUSE[1] + 1, "postLight"), (HOUSE[0] + 5, HOUSE[1] + 1, "bldBarrel"), (HOUSE[0] - 6, HOUSE[1] - 2, "bldPlanterBush"),
                  (HOUSE[0] + 6, HOUSE[1] - 1, "bldCrateDark"), (HOUSE[0] - 3, HOUSE[1] + 4, "bldBenchWood"), (TUNNEL[0] - 2, TUNNEL[1] + 2, "postLight"),
                  (TUNNEL[0] + 3, TUNNEL[1] + 2, "stoneMedium"), (FARM[0] - 3, FARM[1], "vegCrateOpen")]:
    put(c, r, t)
# the way home: lamps either side of the pass
for (c, r) in [(W - 3, PASS[0] - 1), (W - 3, PASS[1] + 1)]:
    items.pop((c, r, "o"), None); put(c, r, "postLight")

placed = [[f"{c},{r}", t] for (c, r, _), t in items.items()]
fill = [0] * (COLS * ROWS)
for r in range(H):
    for c in range(W):
        if (c, r) not in dirt_or_edge and (c, r) not in PG: fill[r * COLS + c] = 1
b = bytearray(math.ceil(COLS * ROWS / 8))
for i, v in enumerate(fill):
    if v: b[i >> 3] |= 1 << (i & 7)
data = {"cols": W, "rows": H, "pass": list(PASS), "spawn": [W - 6, (PASS[0] + PASS[1]) // 2], "placedItems": placed, "groundFill": {"cols": COLS, "rows": ROWS, "bits": base64.b64encode(bytes(b)).decode()}}
with open(os.path.join(ROOT, "js", "wildWorld.data.js"), "w", newline="\n") as f:
    f.write('"use strict";\n// Generated by tools/build_wild_world.py — the second world\'s default layout.\n')
    f.write("const WILD_WORLD_DEFAULT = " + json.dumps(data, separators=(",", ":")) + ";\n")
print("wild world:", len(placed), "items")
