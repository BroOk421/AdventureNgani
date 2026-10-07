#!/usr/bin/env python3
"""The town, remade at the same size as every other map (80x46) — per request
("gawin na lang kasing laki ng wild lahat ng map ... yung town gawin mo na lang
na mas maliit na map ... yung may bahay i random mo san mo pwede ilagay dun
pero may path parin alisin mo lang mga animals duon").

  - a cliff along the north (plateau rows 0-3, a 4-tile wall face rows 4-7)
    with the town cave's entrance set into it;
  - the main street (rows ROAD) from the west edge (-> the wild world) to the
    east edge (-> the Highlands, east1), a dirt plaza in the middle;
  - every building placed at a random free spot (seeded), each with a dirt
    path from its door to the street (BFS round the other houses);
  - the warp portal in the north-east among rocks; lamps along the street,
    benches on the plaza, flowers and bushes by the houses, trees in what's
    left, a tree line round the edges.
Writes js/townMap.data.js (TOWN_MAP). Run: python3 tools/build_town_small.py
"""
import base64, json, math, os, random, sys
from collections import deque
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plateau_grass import plateau_grass

COLS, ROWS = 188, 103          # the shared ground-fill grid (js/config.js)
W, H = 80, 46
CLIFF_TOP, CLIFF_WALL = 3, 7    # plateau rows 0..3, wall rows 4..7
ROAD = (24, 25)                 # the main street rows
LANE = (40, 41)                 # the back lane (the south row's doors)
PASS = (23, 26)                 # the west / east gaps in the tree line
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 7
VERSION = "small-v3"   # v2: brick streets, cobblestone plaza / door paths; v3: shops-only market town + a south road to the homes town
HOMES_VERSION = "homes-v1"
# Per request ("kapag yung mga bahay naman sa town is di magkasya or siksik na
# sila gawa ka pa isang town ... pagsamahin mo sa isang town yung blacksmith,
# grocery, at iba pang may nagbebenta tavern sama mo tapos yung iba sa kabilang
# town na"): the town (market) has only the tavern and the shops; the homes go
# to a second town (js/town2Map.data.js, TOWN2_MAP) south of it.

# footprint relative to the anchor (bottom-centre = the door): (left, right, up)
FOOT = {
    "tavern": (5, 5, 11), "abandonHouse": (5, 5, 11), "townCabin": (3, 4, 7),
    "cottageLog": (3, 3, 8), "cottagePlaster": (3, 3, 8), "cottageBrick": (3, 3, 8),
    "equipShop": (3, 3, 8), "potionShop": (3, 3, 8), "blacksmithShop": (3, 3, 8), "furnitureShop": (3, 3, 8),
    "groceryStore": (7, 7, 8), "guardHouse": (7, 7, 8),
}
MODES = {
    "market": (["tavern", "groceryStore", "equipShop", "potionShop", "blacksmithShop", "furnitureShop"], []),
    "homes": (["townCabin", "cottageLog", "cottagePlaster", "cottageBrick", "cottagePlaster", "cottageBrick", "abandonHouse", "guardHouse"], ["cottageLog"]),
}


def generate(seed, mode="market"):
    REQUIRED, OPTIONAL = MODES[mode]
    market = mode == "market"
    rng = random.Random(seed)
    items = {}                      # (c, r, layer) -> type
    def put(c, r, t, layer="o"): items[(c, r, layer)] = t

    # ---------- the north cliff ----------
    plateau = {(c, r) for c in range(W) for r in range(CLIFF_TOP + 1)} if market else set()
    walls = {}
    for c in (range(W) if market else []):
        for i, t in enumerate(["TopWallMountain4", "CenterWallMountain4", "CenterWallMountain4", "BottomWallMountain3"]):
            walls[(c, CLIFF_TOP + 1 + i)] = t
    for (c, r), t in walls.items(): put(c, r, "terrainMountain" + t, "g")
    for (c, r) in plateau:
        N = r == 0 or (c, r - 1) in plateau
        if not N: continue
        S = (c, r + 1) in plateau or (c, r + 1) in walls
        Wn, E = c == 0 or (c - 1, r) in plateau, c == W - 1 or (c + 1, r) in plateau
        if not Wn: t = "CenterMountain" + ("1" if r % 2 else "7")
        elif not E: t = "CenterMountain" + ("6" if r % 2 else "12")
        else: t = rng.choice(["CenterMountain9", "CenterMountain9", "CenterMountain4", "CenterMountain10"])
        put(c, r, "terrainMountain" + t, "g")
    PG = plateau_grass({p for p in plateau if p[1] <= CLIFF_TOP - 1}, set(), seed=seed, coverage=0.8, margin=1, blobs=20) if market else {}
    TOP = CLIFF_WALL if market else 0   # the homes town has no cliff: open ground from the top
    for (c, r), t in PG.items(): put(c, r, t, "g")

    # ---------- streets and lots ----------
    # Two rows of buildings: the north row's doors open onto the main street,
    # the south row's onto a back lane (LANE) joined to the street by two
    # connecting lanes. The buildings' order along each row, the gaps between
    # them, which row each goes in, the cave's and the portal's spots and where
    # the connectors run are all picked at random (seeded).
    hard = set(plateau) | set(walls)
    D = set()
    for r in range(ROAD[0], ROAD[1] + 1):
        for c in (range(W) if market else range(3, W - 3)): D.add((c, r))
    for r in range(LANE[0], LANE[1] + 1):
        for c in range(3, W - 3): D.add((c, r))
    foot_cells, margin_cells = set(), set()
    buildings = []
    def fp_cells(t, c, r, pad=0):
        L, R, U = FOOT[t]
        return {(x, y) for x in range(c - L - pad, c + R + pad + 1) for y in range(r - U - pad, r + 1 + pad)}
    def width(t): return FOOT[t][0] + FOOT[t][1] + 1

    req = REQUIRED[:]; rng.shuffle(req)
    first = "tavern" if market else "townCabin"
    north, south = [first], []
    for t in req:
        if t == first: continue
        (north if rng.random() < 0.5 else south).append(t)
    # balance the two rows by width
    def wsum(l): return sum(width(t) + 2 for t in l if t in FOOT)
    while wsum(north) > wsum(south) + 10 and len(north) > 1:
        t = next(x for x in north if x != first); north.remove(t); south.append(t)
    while wsum(south) > wsum(north) + 10:
        t = south.pop(); north.append(t)
    rng.shuffle(north); rng.shuffle(south)
    if market:
        north.insert(rng.randint(0, len(north)), "#cave")
        north.insert(rng.randint(0, len(north)), "#portal")
    else:
        north.insert(rng.randint(1, max(1, len(north) - 1)), "#north")
    for _ in range(2): south.insert(rng.randint(0, len(south)), "#lane")
    opt = OPTIONAL[:]; rng.shuffle(opt)

    cave_c = portal = north_c = None
    lanes = []
    def lay_row(seq, anchor_row, front_row, extra):
        nonlocal cave_c, portal, north_c
        c = 4 + rng.randint(0, 2)
        placed = []
        queue = list(seq) + [("opt", t) for t in extra]
        for it in queue:
            optional = isinstance(it, tuple)
            t = it[1] if optional else it
            if t == "#cave":
                wdt = 3
                if c + wdt > W - 4: return None
                cave_c = c + 1
                for r in range(CLIFF_WALL + 1, ROAD[0]): D.add((cave_c, r))
                c += wdt + rng.randint(1, 2); continue
            if t == "#north":  # the road in from the market town (north edge)
                wdt = 4
                if c + wdt > W - 4: return None
                north_c = c + 1
                for r in range(0, ROAD[0]): D.add((north_c, r)); D.add((north_c + 1, r))
                c += wdt + rng.randint(1, 2); continue
            if t == "#portal":
                wdt = 5
                if c + wdt > W - 4: return None
                portal = (c + 2, anchor_row - 1)
                foot_cells.update({(x, y) for x in range(c, c + 5) for y in range(portal[1] - 4, portal[1] + 2)})
                for r in range(portal[1] + 1, front_row + 1): D.add((portal[0], r))
                c += wdt + rng.randint(1, 2); continue
            if t == "#lane":
                for r in range(ROAD[1] + 1, LANE[0]): D.add((c, r)); D.add((c + 1, r))
                lanes.append(c)
                c += 2 + rng.randint(1, 2); continue
            wdt = width(t)
            if c + wdt > W - 4:
                if optional: continue
                return None
            L = FOOT[t][0]
            bc = c + L
            cells = fp_cells(t, bc, anchor_row)
            if any(p in hard for p in cells):
                if optional: continue
                return None
            foot_cells.update(cells)
            margin_cells.update(fp_cells(t, bc, anchor_row, 1) - cells)
            for r in range(anchor_row + 1, front_row + 1): D.add((bc, r))
            buildings.append({"type": t, "col": bc, "row": anchor_row})
            placed.append(t)
            c += wdt + (rng.randint(3, 7) if market else rng.randint(1, 3))
        return placed
    if lay_row(north, ROAD[0] - 2, ROAD[0] - 1, opt[:1]) is None: return None
    if lay_row(south, LANE[0] - 1, LANE[0] - 1, opt[1:]) is None: return None
    if market and (cave_c is None or portal is None): return None
    if not market and north_c is None: return None
    if len(lanes) < 2: return None
    # the lane's ends join the connectors only: trim it to the outermost connectors
    lo, hi = min(lanes), max(lanes) + 1
    D = {p for p in D if not (LANE[0] <= p[1] <= LANE[1] and (p[0] < lo or p[0] > hi)) or any(b["col"] == p[0] for b in buildings)}
    for b in buildings:
        if b["row"] == LANE[0] - 1:
            x0, x1 = sorted((b["col"], min(max(b["col"], lo), hi)))
            for x in range(x0, x1 + 1): D.add((x, LANE[0]))
    # the market town's road south to the homes town: from the back lane to the bottom edge
    south_c = None
    if market:
        south_c = (lo + hi) // 2
        for r in range(LANE[1] + 1, H): D.add((south_c, r)); D.add((south_c + 1, r))
    # the plaza: across the street from the tavern (homes: the north building nearest the middle)
    if market: tav = next(b for b in buildings if b["type"] == "tavern")
    else: tav = min((b for b in buildings if b["row"] == ROAD[0] - 2), key=lambda b: abs(b["col"] - W // 2))
    pc = tav["col"]
    plaza = {(c, r) for c in range(pc - 4, pc + 5) for r in range(ROAD[1] + 1, ROAD[1] + 4)
             if (c, r) not in foot_cells and (c, r) not in margin_cells}
    D |= plaza
    if market:
        put(cave_c, CLIFF_WALL, "caveEntrance")
        put(portal[0], portal[1], "warpPortal")
        for dc, dr, t in [(-2, -1, "stoneBig"), (2, -1, "stoneMedium"), (-2, 1, "stoneSmall"), (2, 1, "pcRocks02"), (-1, -4, "stoneSmall"), (1, -4, "pcRocks01")]:
            if (portal[0] + dc, portal[1] + dr) not in D: put(portal[0] + dc, portal[1] + dr, t)

    # ---------- dirt + grass edges (the world builders' corner rule) ----------
    D = {p for p in D if 0 <= p[0] < W and (TOP < p[1] < H if market else 0 <= p[1] < H)}
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
    edge_piece, gap_cells = {}, set()
    for (c, r) in {(c + a, r + b) for (c, r) in D for a in (-1, 0, 1) for b in (-1, 0, 1)}:
        if not (0 <= c < W and (TOP < r < H if market else 0 <= r < H)): continue
        g = tuple(int(not corner_dirt(*v)) for v in [(c, r), (c + 1, r), (c, r + 1), (c + 1, r + 1)])
        if g == (1, 1, 1, 1): continue
        dirt_or_edge.add((c, r))
        if g != (0, 0, 0, 0): edge_piece[(c, r)] = rng.choice(TILE[g])
        elif (c, r) not in D: gap_cells.add((c, r))   # paving on all four corners: a full tile too

    # ---------- paving (per request: "gawin is bricks ... tile na parang stones") ----------
    # The main street, the back lane and the two connecting lanes are bricks;
    # the plaza and the little paths to the doors / the cave / the portal are
    # cobblestone. The rim cells keep the grass edge piece, drawn over the
    # paving next to them (terrain<Set>Edge<Side><n>, tools/build_paved_tiles.py).
    def brick_cell(c, r):
        if ROAD[0] <= r <= ROAD[1]: return True
        if LANE[0] <= r <= LANE[1] and lo <= c <= hi + 1: return True
        if south_c is not None and r > LANE[1] and c in (south_c, south_c + 1): return True
        if north_c is not None and r < ROAD[0] and c in (north_c, north_c + 1): return True
        return ROAD[1] < r < LANE[0] and any(c in (x, x + 1) for x in lanes)
    pr = random.Random(seed * 31 + 5)
    mat = {}
    for p in D:
        mat[p] = "Bricks" if brick_cell(*p) else "Cobble"
    for p in D:  # cells added by the corner fix: follow their neighbours
        if p[1] in (ROAD[0] - 1, ROAD[1] + 1) and not (p in plaza):
            nb = [mat.get((p[0] + a, p[1] + b)) for a in (-1, 0, 1) for b in (-1, 0, 1) if (a or b)]
            if nb.count("Bricks") > nb.count("Cobble") and mat[p] == "Cobble" and not any(q[0] == p[0] for q in [(b_["col"], 0) for b_ in buildings]): mat[p] = "Bricks"
    for p in sorted(gap_cells):
        nb = [mat.get((p[0] + a, p[1] + b)) for a in (-1, 0, 1) for b in (-1, 0, 1)]
        mat[p] = "Bricks" if nb.count("Bricks") >= nb.count("Cobble") else "Cobble"
    for (c, r), m in mat.items():
        if not (0 <= c < W and (TOP < r < H if market else 0 <= r < H)): continue
        n = pr.randint(1, 6)
        put(c, r, "terrain" + m + ("EnterBricks" if m == "Bricks" else "EnterCobble") + str(n), "g")
    for (c, r), piece in edge_piece.items():
        nb = [mat.get((c + a, r + b)) for a in (-1, 0, 1) for b in (-1, 0, 1)]
        m = "Bricks" if nb.count("Bricks") >= nb.count("Cobble") else "Cobble"
        side, n = piece[:-6], piece[-1]          # "TopGrass2" -> "Top", "2"
        put(c, r, "terrain" + m + "Edge" + side + n, "g")

    for b in buildings: put(b["col"], b["row"], b["type"])

    # ---------- decoration ----------
    occ = set(hard) | foot_cells | dirt_or_edge | {(c, r) for (c, r, l) in items if l == "o"}
    fronts = {(b["col"] + dc, b["row"] + 1 + dr) for b in buildings for dc in (-1, 0, 1) for dr in (0, 1)}
    occ |= fronts
    def free(c0, c1, r0, r1):
        return all(0 <= c < W and 0 <= r < H and (c, r) not in occ for c in range(c0, c1 + 1) for r in range(r0, r1 + 1))
    keep_clear = foot_cells | margin_cells | fronts       # a tall tree's crown must not hang over a house or a doorstep
    def canopy_ok(c, r, big=False):
        w = 4 if big else 3
        return not any((x, y) in keep_clear for x in range(c - w, c + w + 1) for y in range(r - (10 if big else 8), r + 1))
    def take(c0, c1, r0, r1):
        for c in range(c0, c1 + 1):
            for r in range(r0, r1 + 1): occ.add((c, r))
    # lamps along the street and round the plaza
    for c in range(4, W - 3, 9):
        for r in (ROAD[0] - 2, ROAD[1] + 2):
            if (c // 9 + (r > ROAD[1])) % 2: continue
            for dc in (0, 1, -1, 2):
                if free(c + dc, c + dc, r, r): put(c + dc, r, "postLight"); take(c + dc, c + dc, r, r); break
    for (dc, dr) in [(-6, -4), (6, -4), (-6, 4), (6, 4)]:
        c, r = pc + dc, (ROAD[0] + ROAD[1]) // 2 + dr
        if free(c, c, r, r): put(c, r, "postLight"); take(c, c, r, r)
    for (dc, dr, t) in [(-3, 4, "bldBenchWood"), (3, 4, "bldBenchStone"), (-5, 2, "bldPlanterBush"), (5, 2, "bldPlanterBush"), (0, 5, "bldPlanterBox")]:
        c, r = pc + dc, ROAD[1] + dr
        if free(c - 1, c + 1, r, r): put(c, r, t); take(c - 1, c + 1, r, r)
    # the grocery's market crates in front of it
    for b in buildings:
        if b["type"] == "groceryStore":
            for i, t in enumerate(["vegCarrotBox", "vegCabbageBox", "vegOnionBox"]):
                c, r = b["col"] - 6 + i * 2, b["row"] + 2
                if free(c, c, r, r): put(c, r, t); take(c, c, r, r)
    # flowers / bushes by the houses (beside the doorstep, along the front wall)
    FLOWERS = ["bushFlowerA", "bushFlowerB", "bushFlowerC", "bushFlowerD", "decoFlower1", "decoFlower2", "bushSmallGreen", "bldPlanterBush"]
    for b in buildings:
        L, R, U = FOOT[b["type"]]
        for c in (b["col"] - L - 1, b["col"] + R + 1, b["col"] - 2, b["col"] + 2):
            r = b["row"] + 1
            if rng.random() < 0.7 and free(c, c, r, r): put(c, r, rng.choice(FLOWERS)); take(c, c, r, r)
    # a tree line round the south / west / east edges (gaps at the passes)
    TREES = ["treeMediumGreen", "treeMediumLightGreen", "treeMediumYellow", "treeMediumRed", "treeThinGreen", "treeTinyGreen"]
    LOW = ["bushBigGreen", "bushMediumGreen", "bushBigLightGreen", "bushSmallGreen", "treeTinyGreen"]
    for c in range(1, W - 1, 2):              # along the bottom: low bushes / tiny trees (they'd hide the back lane's doors)
        r = H - 1
        if south_c is not None and south_c - 2 <= c <= south_c + 3: continue
        if free(c, c, r, r): put(c, r, rng.choice(LOW)); take(c, c, r, r)
    if not market:                            # along the top: trees, a gap for the road in
        for c in range(1, W - 1, 3):
            if north_c - 3 <= c <= north_c + 4: continue
            r = 2 + rng.randint(0, 1)
            if free(c, c, r, r) and canopy_ok(c, r): put(c, r, rng.choice(TREES)); take(c - 1, c + 1, r - 2, r)
    for r in range(TOP + 3, H - 2, 3):
        if market and PASS[0] - 2 <= r <= PASS[1] + 2: continue
        for c in (1 + rng.randint(0, 1), W - 2 - rng.randint(0, 1)):
            if free(c, c, r, r) and canopy_ok(c, r): put(c, r, rng.choice(TREES)); take(c - 1, c + 1, r - 2, r)
            elif free(c, c, r, r): put(c, r, rng.choice(LOW)); take(c, c, r, r)
    # trees, bushes, stones and tufts in the open spots
    def scatter(types, count, tall, seed2, spacing=1):
        r_ = random.Random(seed2); n = 0
        for _ in range(count * 60):
            if n >= count: break
            c, r = r_.randint(3, W - 4), r_.randint(TOP + 2, H - 4); t = r_.choice(types)
            up = 2 if tall else 0
            if tall and not canopy_ok(c, r, t == "treeBigOrange"): continue
            if free(c - spacing, c + spacing, r - up, r + 1):
                put(c, r, t); take(c - spacing, c + spacing, r - up, r + 1); n += 1
    scatter(TREES + ["treeBigOrange"], 26, True, seed + 3)
    scatter(["bushMediumGreen", "bushSmallGreen", "bushXSLightGreen", "bushBigGreen", "bushSmallYellow"], 22, False, seed + 4, 0)
    scatter(["stoneSmall", "stoneXS", "stoneMedium", "stoneDecor1", "stoneDecor2"], 14, False, seed + 5, 0)
    scatter(["bushMushroom1", "bushMushroom2", "decoFlower1", "decoFlower2"], 18, False, seed + 6, 0)
    for i in range(30):
        r_ = random.Random(seed * 11 + i); cx, cy = r_.randint(3, W - 4), r_.randint(TOP + 2, H - 3)
        for _ in range(4):
            c, r = cx + r_.randint(-2, 2), cy + r_.randint(-1, 1)
            if (c, r) not in occ and 0 <= c < W and 0 <= r < H:
                put(c, r, r_.choice(["wildGrass1", "wildGrass2", "wildGrass3", "wildGrass4", "wildGrass6"]), "w"); occ.add((c, r))
    # trees and bushes up on the cliff
    r_ = random.Random(seed + 9)
    for c in range(2, W - 2, 4):
        cc, rr = c + r_.randint(0, 2), r_.randint(1, 2)
        if (cc, rr) in plateau and (cc, rr, "o") not in items: put(cc, rr, r_.choice(TREES[:5] + ["bushBigGreen", "bushMediumGreen"]))

    placed = [[f"{c},{r}", t] for (c, r, _), t in sorted(items.items())]
    fill = [0] * (COLS * ROWS)
    for r in range(H):
        for c in range(W):
            if (c, r) not in dirt_or_edge and (c, r) not in PG: fill[r * COLS + c] = 1
    b = bytearray(math.ceil(COLS * ROWS / 8))
    for i, v in enumerate(fill):
        if v: b[i >> 3] |= 1 << (i & 7)
    mid = (ROAD[0] + ROAD[1]) // 2
    if not market:
        return {"cols": W, "rows": H, "layoutVersion": HOMES_VERSION + "-" + str(seed),
                "northPass": [north_c, north_c + 1], "spawnNorth": [north_c, 3], "centre": [pc, mid + 2],
                "buildings": buildings, "placedItems": placed,
                "groundFill": {"cols": COLS, "rows": ROWS, "bits": base64.b64encode(bytes(b)).decode()}}
    return {"cols": W, "rows": H, "layoutVersion": VERSION + "-" + str(seed),
            "southPass": [south_c, south_c + 1], "spawnSouth": [south_c, H - 4],
            "westPass": [ROAD[0] - 1, ROAD[1] + 1], "eastPass": [ROAD[0] - 1, ROAD[1] + 1],
            "spawnWest": [3, mid], "spawnEast": [W - 4, mid], "centre": [pc, mid + 2],
            "portal": {"col": portal[0], "row": portal[1]}, "cave": {"col": cave_c, "row": CLIFF_WALL},
            "buildings": buildings, "placedItems": placed,
            "groundFill": {"cols": COLS, "rows": ROWS, "bits": base64.b64encode(bytes(b)).decode()}}


def build(mode, seed0, fname, const, note):
    REQ = MODES[mode][0]
    seed = seed0
    for attempt in range(400):
        town = generate(seed, mode)
        if town and len(town["buildings"]) >= len(REQ): break
        seed += 1
    assert town, "no layout found"
    with open(os.path.join(ROOT, "js", fname), "w", newline="\n") as f:
        f.write('"use strict";\n// Generated by tools/build_town_small.py — ' + note + '\n')
        f.write("const " + const + " = " + json.dumps(town, separators=(",", ":")) + ";\n")
    print(mode, "seed", seed, "buildings", [(b["type"], b["col"], b["row"]) for b in town["buildings"]], "items", len(town["placedItems"]))
    return town

build("market", SEED, "townMap.data.js", "TOWN_MAP", "the town (tavern + shops) at 80x46.")
build("homes", SEED + 100, "town2Map.data.js", "TOWN2_MAP", "the homes town south of the market town, 80x46.")
