"""The ten mine levels under the wild tunnel (js/mineLevels.data.js).

Per request ("mag add ng iba pang cave layer sa loob ng tunnel ... medyo
lakihan lang din yung area tapos mahaba ... kahit 10"): ten long, winding
caves, each bigger than the last, chained by openings in the rock:
  tunnel_room (deep chamber, new opening C)  ->  mine1  ->  mine2 ... mine10
Each level: a doorway at the bottom left (back outside), an UP opening near
the start (to the level above) and a DOWN opening in the far chamber (to the
level below; mine10 has none — its far chamber is the boss's). Same tile
format as the other caves (TOWN_ART.caveLayouts), so js/townBuildings.js'
caveBlueprint() builds them as-is.
Run: python3 tools/build_mine_levels.py
"""
import json, math, random, hashlib, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def blob(cx, cy, rx, ry, rnd, wob=0.18):
    out = set()
    for r in range(int(cy - ry - 2), int(cy + ry + 3)):
        for c in range(int(cx - rx - 2), int(cx + rx + 3)):
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
        tiles = tiles | {p for p in cand if p not in tiles and n8(*p) >= 5}
        tiles = tiles - {p for p in tiles if p not in keep and n8(*p) <= 3}
    return tiles
def tunnel(points, w):
    out = set()
    for p, q in zip(points, points[1:]):
        steps = int(max(abs(q[0] - p[0]), abs(q[1] - p[1])) * 2) + 1
        for i in range(steps + 1):
            x = p[0] + (q[0] - p[0]) * i / steps; y = p[1] + (q[1] - p[1]) * i / steps
            for dx in range(-w, w + 1):
                for dy in range(-w, w + 1):
                    if dx * dx + dy * dy <= w * w + 1: out.add((round(x + dx), round(y + dy)))
    return out

def top_floor(tiles, col, rows=None):
    cand = [p for p in tiles if p[0] == col and (rows is None or rows[0] <= p[1] <= rows[1]) and (p[0], p[1] - 1) not in tiles]
    return min(cand, key=lambda p: p[1]) if cand else None

def level(k):
    rnd = random.Random(1000 + k * 37)
    W = min(78, 56 + k * 2); H = min(44, 40 + k // 3)
    door = (5, H - 1)
    y1 = H - 8; y2 = H - 21; y3 = 9
    j = lambda a: rnd.randint(-a, a)
    pts = [(6, H - 3), (6, y1), (int(W * .3), y1 + j(2)), (int(W * .55), y1 - 1 + j(2)), (W - 8, y1),
           (W - 8, y2), (int(W * .62), y2 + j(2)), (int(W * .36), y2 - 1 + j(2)), (10, y2),
           (10, y3), (int(W * .38), y3 + 1 + j(1)), (int(W * .66), y3 + j(1)), (W - 11, y3)]
    sp = chaikin(pts, 2)
    main = tunnel(sp, 2)
    caverns = []
    for t in (0.18, 0.36, 0.55, 0.74):
        p = sp[int(t * (len(sp) - 1))]
        caverns.append((round(p[0]), round(p[1])))
        main |= blob(p[0], p[1], 5 + rnd.random() * 2.5, 3 + rnd.random() * 1.0, rnd.random() * 6)
    end = (W - 11, y3 + 1)
    main |= blob(end[0], end[1], 7.5 if k < 10 else 9, 4.2, rnd.random() * 6)
    keep = {(c, r) for c in (door[0], door[0] + 1) for r in (door[1] - 1, door[1] - 2, door[1] - 3)}
    tiles = {(c, r) for (c, r) in main if 1 <= c <= W - 2 and 4 <= r < door[1]}
    tiles = smooth_tiles(tiles | keep, keep)
    tiles = {(c, r) for (c, r) in tiles if 1 <= c <= W - 2 and 4 <= r < door[1]}
    # openings: UP near the start, DOWN at the top of the far chamber
    up = None
    for col in (10, 11, 12, 9, 13, 8, 14):
        up = top_floor(tiles, col, (y1 - 5, H))
        if up: break
    links = {"UP": {"col": up[0], "row": up[1]}}
    down = top_floor(tiles, end[0]) if k < 10 else None
    if down: links["DOWN"] = {"col": down[0], "row": down[1]}
    # decor
    avoid = set(tunnel(sp, 0))
    avoid |= {(c, r) for c in range(door[0] - 1, door[0] + 3) for r in range(door[1] - 4, door[1])}
    for l in links.values(): avoid |= {(l["col"] + a, l["row"] + b) for a in (-2, -1, 0, 1, 2) for b in (-1, 0, 1, 2, 3)}
    floor = sorted(tiles - avoid); used = set(); decor = []
    def put(t, cnt, need_row=True):
        nonlocal decor
        tries = 0
        while cnt and tries < cnt * 60:
            tries += 1
            c, r = rnd.choice(floor)
            if any((c + a, r + b) in used for a in (-2, -1, 0, 1, 2) for b in (-1, 0, 1)): continue
            if need_row and not all((c + a, r) in tiles for a in (-1, 0, 1)): continue
            decor.append([c, r, t]); used.add((c, r)); cnt -= 1
    scale = 1 + k / 10
    # per request, fewer of the big rocks: a couple of big stones, at most one tall rock
    put("stoneBig", 1 + k // 5); put("stoneMedium", int(4 * scale)); put("stoneSmall", int(6 * scale))
    put(rnd.choice(["pcRocks01", "pcRocks05", "pcRocks15"]), 1)
    put("bushMushroom1", 4); put("bushMushroom2", 4); put("stoneDecor2", 6, False); put("stoneDecor3", 5, False); put("pcRocks11", 4, False)
    # lights along the way
    for i in range(6, len(sp), 9):
        x, y = sp[i]
        for off in (3, -3, 2, -2):
            c, r = round(x) + off, round(y) + 1
            if (c, r) in tiles and (c, r) not in used and all((c + a, r) in tiles for a in (-1, 0, 1)):
                decor.append([c, r, "postLightLit"]); used.add((c, r)); break
    decor.append([door[0] + 3, door[1] - 2, "postLightLit"])
    for l in links.values():
        decor += [[l["col"], l["row"] - 1, "bldWallCaveHole"], [l["col"] - 2, l["row"] - 1, "bldWallCandle"], [l["col"] + 2, l["row"] - 1, "bldWallCandle"]]
    if k == 10: decor.append([end[0] + 4, end[1] - 2, "bldChest"])
    tl = sorted(tiles)
    return {
        "tiles": [f"{c},{r}" for (c, r) in tl], "door": list(door), "decor": decor, "links": links,
        "version": hashlib.md5(json.dumps([tl, decor]).encode()).hexdigest()[:10],
        "warp": {"forwardPortal": [], "forwardSpawn": [], "returnPortal": [], "returnSpawn": []},
        "depth": k, "far": {"col": end[0], "row": end[1]}, "path": [[round(x), round(y)] for (x, y) in sp[::3]],
    }

def tunnel_link_c():
    s = open(os.path.join(ROOT, "js", "townBuildings.data.js"), encoding="utf-8").read()
    data = json.loads(re.search(r"const TOWN_ART\s*=\s*(\{.*\});", s, re.S).group(1))
    L = data["caveLayouts"]["tunnel_room"]
    tiles = {tuple(map(int, t.split(","))) for t in L["tiles"]}
    a, b = L["links"]["A"], L["links"]["B"]
    col = (a["col"] + b["col"]) // 2
    best = None
    for c in sorted(range(a["col"] + 2, b["col"] - 1), key=lambda c: abs(c - col)):
        t = top_floor(tiles, c, (a["row"] - 6, a["row"] + 6))
        if t and all((t[0] + d, t[1]) in tiles for d in (-1, 0, 1)): best = t; break
    return {"col": best[0], "row": best[1]}

levels = {f"mine{k}_room": level(k) for k in range(1, 11)}
link_c = tunnel_link_c()
with open(os.path.join(ROOT, "js", "mineLevels.data.js"), "w", newline="\n") as f:
    f.write('"use strict";\n// Generated by tools/build_mine_levels.py — the ten mine levels under the tunnel.\n')
    f.write("const MINE_LEVELS = " + json.dumps(levels) + ";\n")
    f.write("const MINE_TUNNEL_LINK = " + json.dumps(link_c) + ";\n")
    f.write("""// The mine levels join the other caves' layouts, and the tunnel's deep chamber
// gets a third opening (C) down into mine 1 (its version changes so a saved
// tunnel room is rebuilt with the opening in it).
Object.assign(TOWN_ART.caveLayouts, MINE_LEVELS);
{
  const T = TOWN_ART.caveLayouts.tunnel_room;
  if (T && !T.links.C) {
    T.links.C = { col: MINE_TUNNEL_LINK.col, row: MINE_TUNNEL_LINK.row };
    const c = MINE_TUNNEL_LINK.col, r = MINE_TUNNEL_LINK.row;
    T.decor = T.decor.filter(([dc, dr]) => !(Math.abs(dc - c) <= 1 && dr >= r - 1 && dr <= r + 2));
    T.decor.push([c, r - 1, "bldWallCaveHole"], [c - 2, r - 1, "bldWallCandle"], [c + 2, r - 1, "bldWallCandle"]);
    T.version = T.version + "-mine";
  }
}
""")
print({k: (len(v["tiles"]), v["links"]) for k, v in levels.items()}, link_c)
