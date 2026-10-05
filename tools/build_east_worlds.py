#!/usr/bin/env python3
"""The worlds east of the town (js/eastWorlds.data.js) — per request ("gawa ka
pa kaya ibang map pero kasing laki lang ng bagong map lagyan mo mountain din
at mga trees wag masyado ... mag start yung new map sa right side ng mapa ng
old map"). Same size as the wild world (80x46): a mountain ring with a WEST
pass (where you come in) and, for all but the last, an EAST pass to the next
world; a few mesas (mountain blocks with cliff faces) inside; dirt trails;
a light scatter of trees, bushes and stones. Mobs are added at runtime
(js/mines.js MOB_WORLDS). Same data shape as WILD_WORLD_DEFAULT.
Run: python3 tools/build_east_worlds.py
"""
import base64, json, math, os, random, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plateau_grass import plateau_grass
COLS, ROWS = 188, 103
W, H = 80, 46
PASS = (20, 25)

def build(seed, mesas, east_pass, trails, n_trees, n_bushes, west_pass=True, portals=(), passes=()):
    rng = random.Random(seed)
    items = {}
    def put(c, r, t, layer="o"): items[(c, r, layer)] = t
    plateau = set()
    for c in range(W):
        for r in range(H):
            north, south = r <= 4, r >= H - 5
            west = c <= 4 and not (west_pass and PASS[0] - 4 <= r <= PASS[1])
            east = c >= W - 5 and not (east_pass and PASS[0] - 4 <= r <= PASS[1])
            gap = False
            for (side, a, b, _n) in passes:
                if side == "N" and r <= 4 and a <= c <= b: gap = True
                if side == "S" and r >= H - 5 and a <= c <= b: gap = True
                if side == "W" and c <= 4 and a - 4 <= r <= b: gap = True
                if side == "E" and c >= W - 5 and a - 4 <= r <= b: gap = True
            if (north or west or south or east) and not gap: plateau.add((c, r))
    for (side, a, b, _n) in passes:   # a trail from each passage into the valley
        m = (a + b) // 2
        if side == "N": trails = list(trails) + [(m, 0, m + 1, 14)]
        if side == "S": trails = list(trails) + [(m, H - 14, m + 1, H - 1)]
        if side == "W": trails = list(trails) + [(0, m, 14, m + 1)]
        if side == "E": trails = list(trails) + [(W - 15, m, W - 1, m + 1)]
    for (c0, r0, c1, r1) in mesas:
        for c in range(c0, c1 + 1):
            for r in range(r0, r1 + 1): plateau.add((c, r))
    walls = {}
    for (c, r) in plateau:
        if (c, r + 1) in plateau or r + 1 >= H: continue
        seq = ["TopWallMountain4", "CenterWallMountain4", "CenterWallMountain4", "BottomWallMountain3"]
        for i, t in enumerate(seq):
            if (c, r + 1 + i) in plateau: break
            walls[(c, r + 1 + i)] = t
    for (c, r), t in walls.items():
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
        if not N and r > 0 and (c, r - 1) not in walls and (c, r - 1) not in plateau: put(c, r - 1, "terrainMountainTopMountain" + str(1 + c % 4), "g")
    walk_plateau = {p for p in plateau if items.get((p[0], p[1], "g"), "").startswith("terrainMountainCenterMountain")
                    and not items[(p[0], p[1], "g")].endswith(("Mountain1", "Mountain6", "Mountain7", "Mountain12"))}
    PG = plateau_grass(walk_plateau | {p for p in plateau if items.get((p[0], p[1], "g"), "").startswith("terrainMountainTopInner")}, set(), seed=seed, coverage=0.85, margin=1, blobs=50)
    for (c, r), t in PG.items(): put(c, r, t, "g")
    D = set()
    for (c0, r0, c1, r1) in trails:
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1): D.add((c, r))
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
    occ = set(hard) | dirt_or_edge
    for c in range(0, 9):
        for r in range(PASS[0] - 3, PASS[1] + 3): occ.add((c, r)); occ.add((W - 1 - c, r))
    for (side, a, b, _n) in passes:   # keep the passages clear
        for x in range(W):
            for y in range(H):
                if side in "NS" and a - 2 <= x <= b + 2 and (y <= 9 if side == "N" else y >= H - 10): occ.add((x, y))
                if side in "WE" and a - 6 <= y <= b + 2 and (x <= 9 if side == "W" else x >= W - 10): occ.add((x, y))
    def free(c0, c1, r0, r1, allow_plateau=False):
        for c in range(c0, c1 + 1):
            for r in range(r0, r1 + 1):
                if not (0 <= c < W and 0 <= r < H): return False
                if (c, r) in occ and not (allow_plateau and (c, r) in plateau and (c, r) not in dirt_or_edge): return False
        return True
    portal_out = {}
    for name, (pc, pr) in portals:
        best = None
        for dc, dr in sorted(((a, b) for a in range(-8, 9) for b in range(-6, 7)), key=lambda t: abs(t[0]) + abs(t[1])):
            c, r = pc + dc, pr + dr
            box = [(x, y) for x in range(c - 3, c + 4) for y in range(r - 4, r + 4)]
            if all(0 < x < W - 1 and 0 < y < H - 1 and (x, y) not in hard for (x, y) in box): best = (c, r); break
        if not best: continue
        c, r = best
        put(c, r, "warpPortal")
        for x in range(c - 3, c + 4):
            for y in range(r - 4, r + 4): occ.add((x, y))
        portal_out[name] = {"col": c, "row": r}
    SIZES = {"treeMediumGreen": 1, "treeMediumLightGreen": 1, "treeMediumYellow": 1, "treeMediumRed": 1, "treeThinGreen": 1, "treeThinOrange": 1, "treeBigOrange": 2, "treeTinyGreen": 0}
    def scatter(types, count, box, tall=True, on_plateau=False, seed=1, spacing=0):
        r_ = random.Random(seed); n = 0
        c0, r0, c1, r1 = box
        for _ in range(count * 40):
            if n >= count: break
            c, r = r_.randint(c0, c1), r_.randint(r0, r1); t = r_.choice(types)
            half = SIZES.get(t, 0) + spacing; up = 2 if tall else 0
            if on_plateau and (c, r) not in plateau: continue
            if (c, r) in walls: continue
            if free(c - half, c + half, r - up, r + 1, on_plateau):
                put(c, r, t)
                for a in range(c - half, c + half + 1):
                    for b in range(r - up, r + 2): occ.add((a, b))
                n += 1
    TREES = ["treeMediumGreen", "treeMediumLightGreen", "treeMediumYellow", "treeMediumRed", "treeTinyGreen", "treeThinGreen", "treeBigOrange"]
    scatter(TREES, n_trees, (6, 8, W - 7, H - 7), seed=seed + 3, spacing=1)
    scatter(TREES[:5] + ["bushBigGreen", "bushMediumGreen", "bushSmallLightGreen"], 70, (0, 0, W - 1, H - 1), on_plateau=True, seed=seed + 5)
    scatter(["bushSmallGreen", "bushMediumGreen", "bushXSLightGreen", "bushSmallRed", "bushXSYellow", "bushBigLightGreen", "bushFlowerA", "bushFlowerC"], n_bushes, (6, 8, W - 7, H - 7), tall=False, seed=seed + 6)
    scatter(["stoneMedium", "stoneSmall", "stoneXS", "stoneBig"], 25, (6, 8, W - 7, H - 7), tall=False, seed=seed + 7)
    for t, n, s in [("bushMushroom1", 10, 8), ("stoneDecor1", 10, 16), ("stoneDecor2", 10, 17), ("decoFlower1", 8, 14)]:
        scatter([t], n, (6, 8, W - 7, H - 7), tall=False, seed=seed + s)
    for i in range(40):
        r_ = random.Random(seed * 7 + i); cx, cy = r_.randint(1, W - 2), r_.randint(1, H - 2)
        for _ in range(5):
            c, r = cx + r_.randint(-2, 2), cy + r_.randint(-2, 2)
            if 0 <= c < W and 0 <= r < H and (c, r) not in walls and (c, r) not in dirt_or_edge and (c, r, "o") not in items and (c, r) not in plateau:
                items[(c, r, "w")] = r_.choice(["wildGrass1", "wildGrass2", "wildGrass3", "wildGrass4", "wildGrass6", "wildGrass7"])
    for (c, r) in [(6, PASS[0] - 1), (6, PASS[1] + 1)] + ([(W - 7, PASS[0] - 1), (W - 7, PASS[1] + 1)] if east_pass else []):
        items.pop((c, r, "o"), None); put(c, r, "postLight")
    placed = [[f"{c},{r}", t] for (c, r, _), t in items.items()]
    fill = [0] * (COLS * ROWS)
    for r in range(H):
        for c in range(W):
            if (c, r) not in dirt_or_edge and (c, r) not in PG: fill[r * COLS + c] = 1
    b = bytearray(math.ceil(COLS * ROWS / 8))
    for i, v in enumerate(fill):
        if v: b[i >> 3] |= 1 << (i & 7)
    return {"cols": W, "rows": H, "pass": list(PASS), "spawnWest": [4, (PASS[0] + PASS[1]) // 2], "spawnEast": [W - 5, (PASS[0] + PASS[1]) // 2],
            "eastPass": east_pass, "westPass": west_pass, "portals": portal_out,
            "passes": [{"side": sd, "from": a, "to": b, "name": nm} for (sd, a, b, nm) in passes],
            "layoutVersion": "v2-" + str(seed), "placedItems": placed, "groundFill": {"cols": COLS, "rows": ROWS, "bits": base64.b64encode(bytes(b)).decode()}}

worlds = {
    "east1": build(31, [(22, 9, 33, 13), (50, 30, 61, 34)], True,
                   [(0, 22, W - 1, 23), (40, 8, 41, 22), (40, 23, 41, 37), (14, 33, 40, 34)], 34, 40),
    "east2": build(47, [(14, 8, 24, 12), (36, 27, 47, 31), (56, 9, 66, 13), (60, 33, 70, 36)], False,
                   [(0, 22, W - 12, 23), (28, 8, 29, 22), (52, 23, 53, 38), (W - 13, 14, W - 12, 31)], 30, 36,
                   passes=[("S", 60, 63, "next")]),
    "east3": build(61, [(30, 8, 40, 12), (18, 30, 28, 34), (52, 26, 62, 30)], False,
                   [(10, 30, 70, 31), (40, 14, 41, 30), (60, 12, 61, 30)], 30, 34, west_pass=False,
                   passes=[("N", 16, 19, "back"), ("E", 34, 36, "next")]),
    "east4": build(73, [(22, 22, 32, 26), (46, 8, 56, 12), (56, 30, 66, 34)], False,
                   [(12, 16, 64, 17), (34, 17, 35, 36), (14, 36, 64, 37)], 28, 30, west_pass=False,
                   passes=[("W", 11, 13, "back"), ("S", 16, 19, "next")]),
    "east5": build(89, [(14, 10, 24, 14), (34, 28, 44, 32), (58, 20, 68, 24)], False,
                   [(12, 34, 66, 35), (28, 12, 29, 34), (50, 10, 51, 34), (50, 10, 62, 11)], 24, 26, west_pass=False,
                   passes=[("N", 60, 63, "back"), ("W", 31, 33, "next")]),
    "east6": build(97, [(26, 10, 36, 14), (44, 26, 54, 30), (14, 30, 22, 34)], False,
                   [(14, 18, 66, 19), (40, 19, 41, 38), (20, 38, 64, 39)], 22, 24, west_pass=False,
                   passes=[("E", 13, 15, "back")]),
}
with open(os.path.join(ROOT, "js", "eastWorlds.data.js"), "w", newline="\n") as f:
    f.write('"use strict";\n// Generated by tools/build_east_worlds.py — the worlds east of the town.\n')
    f.write("const EAST_WORLDS = " + json.dumps(worlds, separators=(",", ":")) + ";\n")
print({k: len(v["placedItems"]) for k, v in worlds.items()})
