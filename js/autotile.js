"use strict";

/* =================================================================
   AUTO-TILING for the layer-2 terrain sets — per request: grass_tile,
   bricks_tile, snow_tile and mountain tiles follow their own pattern when
   you lay them:
     - a tile on its own (or in a plain straight line) is a CENTRE tile —
       "sa una kapag walang katabi center yung lilitaw", and the next one
       laid beside it matches it;
     - once tiles meet at a corner (neighbours on both a horizontal and a
       vertical side) the edges and corners turn to join up.
   Each set's own picker layout (TERRAIN_TILE_SETS[...].shape, js/assets.js)
   is the pattern: every tile there is tagged with which of its 8
   neighbours are filled in the layout, and a laid tile takes the layout
   tile whose neighbours best match its own. Fully surrounded = a centre.
   Only what the player lays or picks up re-tiles (the tile and its 8
   neighbours) — maps loaded from a save are never touched.
================================================================= */

const AUTOTILE_SET_IDS = ["Grass", "Bricks", "Cobble", "Snow", "Mountain"];
const AUTOTILE_NB = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]; // N E S W, then diagonals NW NE SE SW
const AUTOTILE_DIAG_SIDES = [[0, 3], [0, 1], [2, 1], [2, 3]]; // NW: N+W, NE: N+E, SE: S+E, SW: S+W
const autotileSets = {}; // prefix -> { candidates: [{ type, mask }], centers: [type], layer }

for (const set of TERRAIN_TILE_SETS) {
  if (!AUTOTILE_SET_IDS.includes(set.id) || !set.shape) continue;
  const prefix = "terrain" + set.id;
  const shape = set.shape.map((row) => row.map((f) => (f ? { file: f, type: terrainTileId(set, f) } : null)));
  // Rows made only of plain fills ("enter-*") sit under the grass ring in
  // its layout — they're centre tiles, not part of the pattern.
  const isFillRow = (row) => row.every((c) => !c || /^enter-/.test(c.file));
  let pattern = shape.map((row) => (isFillRow(row) && row.some(Boolean) && set.id === "Grass" ? row.map(() => null) : row));
  // mountain: the plateau is its own patch — the cliff-wall rows under it in
  // the layout mustn't count as neighbours, or the plateau's bottom row
  // never reads as an edge
  if (set.id === "Mountain") {
    pattern = pattern.map((row) => row.map((c) => (c && /^(top-mountain|top-inner-mountain|center-mountain|bottom-inner-mountain)/.test(c.file) ? c : null)));
  }
  const at = (x, y) => (y >= 0 && y < pattern.length && x >= 0 && x < pattern[y].length ? pattern[y][x] : null);
  const candidates = [], centers = [];
  pattern.forEach((row, y) => row.forEach((cell, x) => {
    if (!cell) return;
    // mountain: only the plateau top re-tiles; the cliff walls are laid by hand
    if (set.id === "Mountain" && !/^(top-mountain|top-inner-mountain|center-mountain|bottom-inner-mountain)/.test(cell.file)) return;
    const mask = AUTOTILE_NB.map(([dx, dy]) => !!at(x + dx, y + dy));
    if (mask.every(Boolean)) centers.push(cell.type);
    candidates.push({ type: cell.type, mask });
  }));
  if (!centers.length) { // the grass ring has no full tile — its plain fills are the centres
    for (const row of shape) for (const c of row) if (c && /^enter-/.test(c.file)) centers.push(c.type);
  }
  // the plainest centre first (a "center"/"enter" tile, not an inner edge that happens to be surrounded)
  centers.sort((a, b) => (/Center|Enter/.test(b) ? 1 : 0) - (/Center|Enter/.test(a) ? 1 : 0));
  if (!centers.length || !itemDefs[centers[0]]) continue;
  autotileSets[prefix] = {
    candidates: candidates.filter((c) => itemDefs[c.type]),
    centers: centers.filter((t) => itemDefs[t]),
    centerSet: new Set(centers),
    candidateSet: new Set(candidates.map((c) => c.type)),
    layer: layerForType(centers[0]),
  };
}

/* grass_tile is drawn as a HOLE in a lawn (its picker layout is grass round
   an empty middle), so masks read off that layout came out backwards and
   laying grass just gave plain centre squares ("box style"). Per request
   ("yung mga kasama ng grass na may excess na patusok ... para di lang
   box style"): each grass piece is tagged by which of its sides/corners
   are actually grass in the ART (alpha along each border, measured off
   assets/tiles/grass_tile — sides >= 40% opaque, corners fully opaque),
   and every laid grass tile takes the best match — so patch edges get the
   jagged tufts, convex corners the round bits, inside corners the notches,
   and only a tile with grass all round is a plain centre.
   Mask order = AUTOTILE_NB: N E S W NW NE SE SW. */
const GRASS_ART_MASKS = {
  BottomGrass1: "0011 0001", BottomGrass2: "0110 0010", BottomGrass3: "1111 1011", BottomGrass4: "0111 0011",
  BottomGrass5: "1111 0111", LeftGrass1: "1111 1101", LeftGrass2: "1011 1001", LeftGrass3: "1111 1011",
  RightGrass1: "1111 1110", RightGrass2: "1110 0110", RightGrass3: "1111 0111", TopGrass1: "1111 1101",
  TopGrass2: "1101 1100", TopGrass3: "1111 1110", TopGrass4: "1001 1000", TopGrass5: "1100 0100",
};
// Snow and port pieces, tagged the same way (snow: alpha; port: land vs
// the water colour of water1.png). Same idea, so a snow patch or an
// island gets its round / shore edges too, not squares.
const SNOW_ART_MASKS = {
  TopSnow1: "0110 0010", TopSnow2: "0111 0011", TopSnow3: "0011 0001",
  TopInnerSnow1: "0110 0010", TopInnerSnow2: "1111 0111", TopInnerSnow4: "1111 1011", TopInnerSnow5: "0011 0001",
  CenterSnow1: "1110 0110", CenterSnow5: "1011 1001",
  BottomInnerSnow1: "1100 0100", BottomInnerSnow2: "1111 1110", BottomInnerSnow4: "1111 1101", BottomInnerSnow5: "1001 1000",
  BottomSnow1: "1100 0100", BottomSnow2: "1101 1100", BottomSnow3: "1001 1000",
};
const PORT_ART_MASKS = { // portTL / portTR / portBR are open water — never picked
  TC1: "0110 0010", TC2: "0111 0011", TC3: "0011 0001", L2: "1110 0110", R2: "1011 1001",
  L3: "1100 0100", BC1: "1100 0100", BC2: "1101 1100", BC3: "1001 1000", R3: "1001 1000",
  I1: "1111 0111", I3: "1111 1011", I7: "1111 1110", I9: "1111 1101",
};
function useArtMasks(prefix, masks, centers) {
  const S = autotileSets[prefix];
  if (!S) return;
  const cands = [];
  for (const [name, m] of Object.entries(masks)) {
    const type = prefix + name;
    if (!itemDefs[type]) continue;
    cands.push({ type, mask: m.replace(" ", "").split("").map((b) => b === "1") });
  }
  S.centers = centers.filter((t) => itemDefs[t]);
  S.centerSet = new Set([...S.centerSet || [], ...S.centers]);
  for (const t of S.centers) cands.push({ type: t, mask: AUTOTILE_NB.map(() => true) });
  S.candidates = cands;
  S.candidateSet = new Set([...(S.candidateSet || []), ...cands.map((c) => c.type)]);
  S.exact = true; // best match always — no "alone / straight line = centre" shortcut
}
useArtMasks("terrainGrass", GRASS_ART_MASKS,
  // only the plain fills in the same shade as the edges (enter-grass 4-6 are a darker, shaded green)
  ["terrainGrassEnterGrass1", "terrainGrassEnterGrass2", "terrainGrassEnterGrass3"]);
useArtMasks("terrainSnow", SNOW_ART_MASKS,
  ["terrainSnowCenterSnow2", "terrainSnowCenterSnow3", "terrainSnowCenterSnow4", "terrainSnowTopInnerSnow3", "terrainSnowBottomInnerSnow3"]);

/* Port tiles (the island set, js/assets.js port_*) — per request, they
   join up the same way. Their 5x5 picture: a ring of shore pieces round
   plain land (portI2). Only the ring + the plain centre take part; the
   inner shore notches (portI1/3/4/6/7/9) aren't chosen automatically.
   (The picture's bottom-left cell was plain water, so that corner falls
   back to the closest piece.) */
{
  const P = [
    ["portTL", "portTC1", "portTC2", "portTC3", "portTR"],
    ["portTC1", "portI2", "portI2", "portI2", "portTC3"],
    ["portL2", "portI2", "portI2", "portI2", "portR2"],
    ["portL3", "portI2", "portI2", "portI2", "portR3"],
    ["portBL?", "portBC1", "portBC2", "portBC3", "portBR"],
  ];
  const at = (x, y) => y >= 0 && y < 5 && x >= 0 && x < 5;
  const candidates = [];
  P.forEach((row, y) => row.forEach((type, x) => {
    if (!itemDefs[type] || type === "portI2") return;
    candidates.push({ type, mask: AUTOTILE_NB.map(([dx, dy]) => at(x + dx, y + dy)) });
  }));
  candidates.push({ type: "portI2", mask: AUTOTILE_NB.map(() => true) });
  const portTypes = Object.keys(itemDefs).filter((t) => t.startsWith("port"));
  autotileSets.port = {
    candidates,
    centers: ["portI2"],
    centerSet: new Set(["portI2"]),
    // every port tile re-tiles (the notch pieces too, once something is laid next to them)
    candidateSet: new Set(portTypes),
    layer: layerForType("portI2"),
  };
}

useArtMasks("port", PORT_ART_MASKS, ["portI2", "portI4", "portI6"]);
// Mountain plateau and bricks: their picker layouts are already solid patches
// (unlike grass), so the layout masks are right — they just get the same
// "best match always" rule: solid inside, edge / corner pieces round the
// outside, inner-corner pieces in the bends, no plain-centre shortcut.
for (const p of ["terrainMountain", "terrainBricks", "terrainCobble"]) if (autotileSets[p]) autotileSets[p].exact = true;

/* Mountain plateau: its own art has no bumpy BOTTOM rim — the bottom-inner
   pieces are flat because they sit on a cliff wall. So the top of a hole in
   a plateau (and a plateau with nothing under it) came out as a straight
   line. bottom-edge-mountain-1..8 are the top rim pieces flipped upside
   down (1-4 = top-mountain-1..4, 5-8 = top-inner-mountain-1/2/5/6), tagged
   with the flipped masks; the flat bottom-inner pieces now count as
   "continues below" (they're for when a cliff wall is laid under them —
   wall tiles are mountain tiles too, so they count as filled). */
if (autotileSets.terrainMountain) {
  const S = autotileSets.terrainMountain;
  const flip = (m) => [m[2], m[1], m[0], m[3], m[7], m[6], m[5], m[4]]; // N<->S, NW<->SW, NE<->SE
  const maskOf = (type) => (S.candidates.find((c) => c.type === type) || {}).mask;
  const src = ["TopMountain1", "TopMountain2", "TopMountain3", "TopMountain4", "TopInnerMountain1", "TopInnerMountain2", "TopInnerMountain5", "TopInnerMountain6"];
  src.forEach((name, i) => {
    const m = maskOf("terrainMountain" + name), type = "terrainMountainBottomEdgeMountain" + (i + 1);
    if (m && itemDefs[type]) { S.candidates.push({ type, mask: flip(m) }); S.candidateSet.add(type); }
  });
  for (const c of S.candidates) if (/BottomInnerMountain/.test(c.type)) { c.mask[2] = true; c.mask[6] = true; c.mask[7] = true; }
}

// The tile an auto-tiled set's inventory slot holds (its plain centre),
// or null for sets that keep their picker (mountain, everything else).
const AUTOTILE_NO_PICKER = { terrainGrass: true, terrainBricks: true, terrainCobble: true, terrainSnow: true, port: true };
function autotileCentreForGroup(groupId) {
  if (!AUTOTILE_NO_PICKER[groupId] || !autotileSets[groupId]) return null;
  if (groupId.startsWith("terrain")) {
    const set = TERRAIN_TILE_SETS.find((x) => "terrain" + x.id === groupId);
    const icon = set && terrainTileId(set, set.icon);
    if (icon && autotileSets[groupId].centerSet.has(icon)) return icon;
  }
  return autotileSets[groupId].centers[0];
}

function autotilePrefixOf(type) {
  if (!type) return null;
  for (const p of Object.keys(autotileSets)) if (type.startsWith(p)) return p;
  return null;
}

// Re-tile one cell of set `prefix` (if it holds a re-tileable tile of it).
/* ---- mountain cliff walls --------------------------------------------
   Per request: a wall only goes UNDER mountain (the plateau, or more wall),
   and a column of wall builds itself — the piece laid lowest is always the
   wall's foot (grass round it), and every wall laid under it turns the one
   above into wall body, so you just keep laying downwards until it's as
   tall as you want:
     top    (plateau above)  -> top-wall (top-left/right-wall at the sides)
     middle                  -> center-wall
     bottom (nothing below)  -> bottom-outer-wall (bottom-wall-1/6 at the sides)
   A face's left/right column (no wall beside it) uses the side pieces
   (…-1 / …-6). The plateau tile right above a middle wall column turns into
   bottom-mountain (rim shading down into the wall). */
const MTN = "terrainMountain";
const MTN_WALL_RE = /^terrainMountain(TopLeftWall|TopRightWall|TopWall|CenterWall|BottomWall|BottomOuterWall|BottomSnowWall|BottomSnowOuterWall)/; // bottom-mountain-1..4 (the front) belong to the mountain; top-left/right-wall are wall
// The FRONT pieces (the plateau's own bottom row, shading down into the wall):
// they belong to the plateau, the tile right above a wall column.
const MTN_FRONT = ["BottomMountain1", "BottomMountain2", "BottomMountain3", "BottomMountain4"];
if (autotileSets.terrainMountain) for (const n of MTN_FRONT) autotileSets.terrainMountain.candidateSet.add("terrainMountain" + n);
if (autotileSets.terrainMountain) {
  // Mountain follows its sheet exactly: corners tell apart by their diagonal
  // neighbours too (top-mountain-4 vs top-inner-mountain-6, top-mountain-1 vs
  // top-inner-mountain-1), and the bottom-inner row is only ever the row over
  // a wall face (mountainPlateauOverWall()), never picked as a side edge.
  const S = autotileSets.terrainMountain;
  S.fullDiag = true;
  S.candidates = S.candidates.filter((c) => !/BottomInnerMountain/.test(c.type));
}
function isMountainWall(t) { return !!t && MTN_WALL_RE.test(t); }
function isMountainTile(t) { return !!t && t.startsWith(MTN); }
/* How the pieces join — per request, exactly as named in the inventory:
     plateau's last row:  bottom-inner-mountain-1 | -2..-5 | -6
     front (1st wall):    top-left-wall | bottom-mountain-1 | -2/-3 | -4 | top-right-wall
     wall (duplicated):   top-wall-1    | top-wall-2        | -3/-4 | -5 | top-wall-6
     foot (automatic):    bottom-wall-1 | bottom-outer-1    | -2/-3 | -4 | bottom-wall-6
   Columns: the face's left end, the one next to it, the middle (alternating),
   the one next to the right end, the right end. */
function mountainFacePos(col, row) {
  const L = autotileSets[MTN].layer;
  const wall = (c, r) => isMountainWall(L.get(c + "," + r));
  const leftEnd = !wall(col - 1, row), rightEnd = !wall(col + 1, row);
  if (leftEnd && rightEnd) { // a lone wall in its row (the raised end of a curve): which side is the mountain on?
    if (isMountainTile(L.get((col - 1) + "," + row)) && !isMountainTile(L.get((col + 1) + "," + row))) return "R";
    return "L";
  }
  if (leftEnd) return "L";
  if (rightEnd) return "R";
  if (!wall(col - 2, row)) return "L2";
  if (!wall(col + 2, row)) return "R2";
  return Math.abs(col) % 2 ? "M1" : "M0";
}
const MTN_FACE = {
  front: { L: "TopLeftWallMountain", L2: "BottomMountain1", M0: "BottomMountain2", M1: "BottomMountain3", R2: "BottomMountain4", R: "TopRightWallMountain" },
  wall:  { L: "TopWallMountain1", L2: "TopWallMountain2", M0: "TopWallMountain3", M1: "TopWallMountain4", R2: "TopWallMountain5", R: "TopWallMountain6" },
  foot:  { L: "BottomWallMountain1", L2: "BottomOuterWallMountain1", M0: "BottomOuterWallMountain2", M1: "BottomOuterWallMountain3", R2: "BottomOuterWallMountain4", R: "BottomWallMountain6" },
};
/* Per request: exactly the mountain sheet (picker picture). Walls you lay:
   1st = front, 2nd = top-wall, then center-wall. Under the last one the foot
   comes by itself — at the face's two ends one tile (bottom-wall-1 / -6),
   in between two (bottom-wall-2..5, then bottom-outer-wall-1..4 under it),
   so the bottom curves in at the corners like the sheet. Laying a wall on
   the foot (or under it) turns it into wall and the foot moves down. */
const autotileFoot = {}; // world -> Set of keys that are the automatic foot
function autotileFootSet(w = currentWorld) { return autotileFoot[w] || (autotileFoot[w] = new Set()); }
function lastLaidWallRow(col, row) { // the laid wall right above an automatic foot tile
  let r = row - 1;
  while (autotileFootSet().has(col + "," + r)) r--;
  return r;
}
function mountainWallPiece(col, row) {
  const L = autotileSets[MTN].layer;
  const wall = (c, r) => isMountainWall(L.get(c + "," + r));
  const key = col + "," + row;
  if (autotileFootSet().has(key)) {
    const r0 = lastLaidWallRow(col, row), idx = row - r0, pos = mountainFacePos(col, r0);
    if (pos === "L") return MTN + "BottomWallMountain1";
    if (pos === "R") return MTN + "BottomWallMountain6";
    const n = { L2: 0, M0: 1, M1: 2, R2: 3 }[pos];
    return MTN + (idx === 1 ? "BottomWallMountain" + (2 + n) : "BottomOuterWallMountain" + (1 + n));
  }
  const pos = mountainFacePos(col, row);
  let d = 0;
  while (wall(col, row - d - 1) && !autotileFootSet().has(col + "," + (row - d - 1))) d++;
  const CW = { L: "CenterWallMountain1", L2: "CenterWallMountain2", M0: "CenterWallMountain3", M1: "CenterWallMountain4", R2: "CenterWallMountain5", R: "CenterWallMountain6" };
  // The face's END columns follow the sheet's curve: where the end wall
  // starts a row higher than the wall beside it (mountain next to its top
  // tile), that top tile is top-left/right-wall, then top-wall-1/-6, then
  // center-wall-1/-6. Per request these two belong to the WALL, not the
  // mountain. A wall is never a front (bottom-mountain) piece.
  if (pos === "L" || pos === "R") {
    const top = row - d, inner = pos === "L" ? col + 1 : col - 1;
    const curved = !isMountainWall(L.get(inner + "," + top)) && isMountainTile(L.get(inner + "," + top));
    if (curved) {
      if (d === 0) return MTN + (pos === "L" ? "TopLeftWallMountain" : "TopRightWallMountain");
      if (d === 1) return MTN + MTN_FACE.wall[pos];
      return MTN + CW[pos];
    }
  }
  if (d === 0) return MTN + MTN_FACE.wall[pos];
  return MTN + CW[pos];
}
// Keep a column's automatic foot right: 1 tile at the face's ends, 2 between.
function autotileFixFoot(col, rowHint) {
  const L = autotileSets[MTN].layer, F = autotileFootSet(), O = autotileOwnedSet();
  const k = (r) => col + "," + r;
  // a laid wall under a foot tile makes that tile laid wall
  for (let r = rowHint + 6; r >= rowHint - 6; r--) if (F.has(k(r)) && isMountainWall(L.get(k(r + 1))) && !F.has(k(r + 1))) F.delete(k(r));
  // lowest laid wall of this column near the hint
  let rb = null;
  for (let r = rowHint - 6; r <= rowHint + 6; r++) if (O.has(k(r)) && !F.has(k(r)) && isMountainWall(L.get(k(r)))) rb = r;
  const want = new Set();
  if (rb !== null) {
    const pos = mountainFacePos(col, rb);
    want.add(k(rb + 1));
    if (pos !== "L" && pos !== "R") want.add(k(rb + 2));
  }
  for (let r = rowHint - 6; r <= rowHint + 8; r++) if (F.has(k(r)) && !want.has(k(r))) { F.delete(k(r)); O.delete(k(r)); L.delete(k(r)); }
  for (const key of want) {
    if (F.has(key)) continue;
    if (L.has(key)) continue;
    const [c, r] = key.split(",").map(Number);
    let free = true;
    for (const layer of ALL_LAYERS) if (layer !== L && layer !== dirtLayer && layer.has(key)) free = false;
    if (!free || (typeof isTileBlocked === "function" && isTileBlocked(c, r))) break;
    F.add(key); O.add(key);
    L.set(key, MTN + "BottomWallMountain2");
  }
}
// The plateau's last row over a wall face: bottom-inner-mountain-1 over the
// face's left end, -6 over its right end, -2..-5 between.
function mountainPlateauOverWall(col, row) {
  const L = autotileSets[MTN].layer;
  const wall = (c, r) => isMountainWall(L.get(c + "," + r));
  void wall;
  const n = { L: 1, L2: 2, M0: 3, M1: 4, R2: 5, R: 6 }[mountainFacePos(col, row + 1)];
  return MTN + "BottomInnerMountain" + n; // same column position as the front piece under it
}
const MTN_FOOT_RE = /^terrainMountain(BottomOuterWall|BottomWall|BottomSnowOuterWall|BottomSnowWall)/;
// The tile above a wall: may it hold one?
function canHoldMountainWall(col, row) {
  return isMountainTile(autotileSets[MTN].layer.get(col + "," + (row - 1)));
}

function mountainStairsAt(col, row) {
  const key = col + "," + row;
  for (const layer of ALL_LAYERS) {
    const t = layer.get(key);
    if (t && itemDefs[t] && itemDefs[t].isStairs) return true;
  }
  return false;
}
/* Per request ("yung mga dating tile is dapat mag merge din para sa bagong
   tile para maiwasan yung ganun itsura na di nagiging buo yung tile"): for
   grass, snow, bricks and port, the tiles that were already there (the
   map's own, or laid before) DO re-tile when a new tile is laid or picked
   up next to them, so the old edge pieces turn into whatever joins the new
   tile — no leftover rim of dirt round a filled-in patch. Mountain keeps the
   old rule (its hand-made cliffs are never touched). */
const AUTOTILE_MERGE_OLD = { terrainGrass: true, terrainSnow: true, terrainBricks: true, terrainCobble: true, port: true };
// Is this neighbour "the same stuff" for set `prefix`? For grass that also
// means the painted lawn (ground fill), old-style grass tiles and port land —
// the same things migrateOldGrass() below counts as grass — so a laid grass
// tile next to the lawn joins it instead of putting an edge there.
function autotileFilledFor(prefix, col, row) {
  const S = autotileSets[prefix];
  const k = col + "," + row;
  const t = S.layer.get(k);
  if (t) {
    if (t.startsWith(prefix)) return true;
    return prefix === "terrainGrass" && (OLD_GRASS_RE.test(t) || t.startsWith("port"));
  }
  return prefix === "terrainGrass" && typeof isGroundFilled === "function" && isGroundFilled(col, row) && !groundLayer.has(k);
}
function autotileCell(prefix, col, row, preferredCenter) {
  const S = autotileSets[prefix];
  const key = col + "," + row;
  if (!autotileOwnedSet().has(key) && !AUTOTILE_MERGE_OLD[prefix]) return; // mountain: the map's own / older tiles are never changed
  const cur = S.layer.get(key);
  if (prefix === MTN && isMountainWall(cur)) {
    const pick = mountainWallPiece(col, row);
    if (itemDefs[pick] && pick !== cur) S.layer.set(key, pick);
    return;
  }
  if (!cur || !cur.startsWith(prefix) || !(S.candidateSet.has(cur) || S.centerSet.has(cur))) return;
  // An OLD tile (not laid by the player) only re-tiles if it's one of the
  // pieces the auto-tiler itself picks from — so the map's open-water port
  // squares (portTL/TR/BR), the shaded grass fills (enter-grass-4..6) and
  // other hand-placed extras are never swapped for something else.
  if (!autotileOwnedSet().has(key) && !S.candidates.some((c) => c.type === cur)) return;
  const has = AUTOTILE_NB.map(([dx, dy], i) => {
    // per request: dirt stairs right under the mountain — it carries straight
    // on into them (no rim / curve on that side)
    if (prefix === MTN && (i === 2 || i === 6 || i === 7) && mountainStairsAt(col, row + 1)) return true;
    const t = S.layer.get((col + dx) + "," + (row + dy));
    if (prefix !== MTN) return autotileFilledFor(prefix, col + dx, row + dy);
    if (!t || !t.startsWith(prefix)) return false;
    // plateau: a cliff wall only "continues" it straight below (S/SE/SW) —
    // beside or above it, the plateau ends (so a stepped/curving cliff gets
    // the plateau's rounded rim where it steps down, not a cut-off square)
    if (prefix === MTN && isMountainWall(t) && i !== 2 && i !== 6 && i !== 7) return false;
    return true;
  });
  const [n, e, s, w] = has;
  let pick;
  const hash = Math.abs(col * 73856093 ^ row * 19349663);
  if (!S.exact && (has.every(Boolean) || !((n || s) && (e || w)))) {
    // centre: alone, in a straight line, or fully surrounded — keep the
    // centre it already is, else the one being laid (so it matches)
    pick = S.centerSet.has(cur) ? cur : (preferredCenter && S.centerSet.has(preferredCenter) ? preferredCenter : S.centers[0]);
  } else {
    let best = -1e9, tops = [];
    for (const c of S.candidates) {
      let score = 0;
      for (let i = 0; i < 8; i++) {
        // a corner only matters where both sides next to it are filled
        if (i >= 4 && S.exact && !S.fullDiag) { const [a, b] = AUTOTILE_DIAG_SIDES[i - 4]; if (!has[a] || !has[b]) continue; }
        score += (c.mask[i] === has[i]) ? (i < 4 ? 4 : 1) : (i < 4 ? -4 : -1);
      }
      if (score > best) { best = score; tops = [c.type]; } else if (score === best) tops.push(c.type);
    }
    pick = tops.includes(cur) ? cur : tops[hash % tops.length];
  }
  if (prefix === MTN && pick && !mountainStairsAt(col, row + 1)) {
    // the plateau's last two rows over a wall face: the front row right on the
    // wall, the bottom-inner row above it (same column positions as the wall)
    const below = S.layer.get(col + "," + (row + 1));
    const mid = (p) => p !== "L" && p !== "R";
    if (isMountainWall(below)) {
      const p = mountainFacePos(col, row + 1);
      // over a middle column: the front (bottom-mountain); over an end column: the bottom-inner corner
      // ...unless the mountain carries on past the wall's end (e.g. over a
      // stairway cut into the cliff): then no rim on that side
      const carriesOn = (p === "L" && has[3]) || (p === "R" && has[1]);
      pick = MTN + (mid(p) ? MTN_FACE.front[p] : carriesOn ? "BottomInnerMountain" + (3 + (Math.abs(col) % 2)) : (p === "L" ? "BottomInnerMountain1" : "BottomInnerMountain6"));
    } else if (isMountainTile(below) && isMountainWall(S.layer.get(col + "," + (row + 2))) && mid(mountainFacePos(col, row + 2))) {
      pick = mountainPlateauOverWall(col, row + 1);
    }
  }
  if (pick && pick !== cur) S.layer.set(key, pick);
}

/* Only the player's own laying / picking up re-tiles: those functions are
   wrapped so that while they run, any terrain tile they set or remove is
   noted; afterwards it and its neighbours are re-tiled. */
let autotileArmed = 0, autotileFlushing = false;
const autotileTouched = [];
/* Only tiles the PLAYER laid ever re-tile. Per request (a wall laid next to
   the map's own cliff turned the hand-made tile beside it flat): the map's
   terrain — and anything laid before this — is left exactly as it is; a
   new tile still looks at it to pick its own piece, it just never changes
   it. Kept per world, saved as `autotileOwned` (js/save.js). */
const autotileOwned = {};
function autotileOwnedSet(w = currentWorld) { return autotileOwned[w] || (autotileOwned[w] = new Set()); }
function serializeAutotileOwned() {
  const o = {};
  for (const [w, s] of Object.entries(autotileOwned)) o[w] = [...s];
  for (const [w, s] of Object.entries(typeof autotileFoot !== "undefined" ? autotileFoot : {})) o["foot:" + w] = [...s];
  return o;
}
function loadAutotileOwned(d) {
  if (!d || typeof d !== "object") return;
  for (const [w, list] of Object.entries(d)) {
    if (!Array.isArray(list)) continue;
    if (w.startsWith("foot:")) autotileFoot[w.slice(5)] = new Set(list);
    else autotileOwned[w] = new Set(list);
  }
}
for (const S of Object.values(autotileSets)) {
  const L = S.layer;
  if (L.__autotileHooked) continue;
  L.__autotileHooked = true;
  const set = L.set, del = L.delete;
  L.set = function (k, v) {
    // an old-style grass tile laid by the player (the lawn's own Ground (Inner) picked up and put
    // back) is the new grass tile straight away, so it re-tiles on the spot instead of waiting for
    // migrateOldGrass() below
    if (autotileArmed && !autotileFlushing && L === (autotileSets.terrainGrass && autotileSets.terrainGrass.layer) && typeof v === "string" && OLD_GRASS_RE.test(v)) v = autotileSets.terrainGrass.centers[0];
    if (autotileArmed && autotilePrefixOf(v)) {
      autotileTouched.push([k, v]);
      if (!autotileFlushing) autotileOwnedSet().add(k); // laid by the player
    }
    return set.call(this, k, v);
  };
  L.delete = function (k) {
    const old = this.get(k);
    if (autotileArmed && autotilePrefixOf(old)) {
      autotileTouched.push([k, old]);
      if (!autotileFlushing) autotileOwnedSet().delete(k);
    }
    return del.call(this, k);
  };
}
// A tile of the painted lawn (ground fill) was picked up: the lawn round the hole turns into real
// grass tiles (laid by the player, so they re-tile) — the flush right after gives them their edges,
// so the hole has proper grass borders at once.
function formGrassEdgesAround(col, row) {
  const S = autotileSets.terrainGrass;
  if (!S || typeof isGroundFilled !== "function") return;
  autotileArmed++;
  try {
    for (const [dx, dy] of AUTOTILE_NB) {
      const c = col + dx, r = row + dy, k = c + "," + r;
      if (!isGroundFilled(c, r) || S.layer.has(k)) continue;
      setGroundFill(c, r, false);
      S.layer.set(k, S.centers[0]);
    }
  } finally { autotileArmed--; }
  if (!autotileArmed && autotileTouched.length) autotileFlush();
}
function autotileFlush() {
  const jobs = autotileTouched.splice(0);
  autotileArmed++; // re-tiling itself mustn't queue more work
  autotileFlushing = true;
  try {
    for (const [key, type] of jobs) {
      const prefix = autotilePrefixOf(type);
      const [col, row] = key.split(",").map(Number);
      autotileCell(prefix, col, row, type);
      for (const [dx, dy] of AUTOTILE_NB) autotileCell(prefix, col + dx, row + dy, type);
      if (prefix === MTN && isMountainWall(type)) {
        // a wall laid under the map's own wall FOOT carries that column on:
        // the old foot becomes wall body (only that one tile — the map's
        // tiles beside it are still left alone)
        const above = (col) + "," + (row - 1), at = autotileSets[MTN].layer.get(above);
        if (autotileSets[MTN].layer.has(key) && /^terrainMountain(BottomOuterWall|BottomWall|BottomSnowOuterWall|BottomSnowWall)/.test(at || "")) autotileOwnedSet().add(above);
        for (let c = col - 2; c <= col + 2; c++) autotileFixFoot(c, row);
        for (let r = row - 6; r <= row + 4; r++) for (let c = col - 2; c <= col + 2; c++) autotileCell(prefix, c, r, type); // ±2: the curved front corner looks two tiles along
      }
    }
  } finally {
    autotileArmed--;
    autotileFlushing = false;
    autotileTouched.length = 0;
  }
  if (jobs.length && typeof saveGame === "function") saveGame();
}
function autotileWrap(fn) {
  return function () {
    autotileArmed++;
    let r;
    try { r = fn.apply(this, arguments); } finally { autotileArmed--; }
    if (!autotileArmed && autotileTouched.length) autotileFlush();
    return r;
  };
}
placeHeldItemAt = autotileWrap(placeHeldItemAt);
{ // a wall only goes under mountain
  const placeBase = placeHeldItemAt;
  placeHeldItemAt = function (col, row) {
    const L = autotileSets[MTN].layer, key = col + "," + row;
    if (heldItem && isMountainWall(heldItem.type) && player.scene === "outside" && autotileFootSet().has(key)) {
      if (!isWithinPlacementRange(col, row)) return;
      autotileFootSet().delete(key); // now a laid wall
      autotileArmed++;
      try { L.set(key, heldItem.type); } finally { autotileArmed--; } // queues the re-tile + the foot moving down
      if (!autotileArmed && autotileTouched.length) autotileFlush();
      return;
    }
    // (per request: a wall may go anywhere, with or without mountain above —
    // laying the walls first and the plateau after keeps the pattern too)
    return placeBase.apply(this, arguments);
  };
}
tryGrabOrPlaceInFront = autotileWrap(tryGrabOrPlaceInFront);
placeGrabbedAtClick = autotileWrap(placeGrabbedAtClick);

/* "Mountain" / "Mountain Wall" inventory slots (js/inventory.js): holding
   one lays its real tile (`autoAlias`) — everything else (where it may go,
   which piece it becomes) is the usual laying + auto-tiling above. */
{
  const inner = placeHeldItemAt;
  placeHeldItemAt = function (col, row) {
    const alias = heldItem && itemDefs[heldItem.type] && itemDefs[heldItem.type].autoAlias;
    if (!alias) return inner.apply(this, arguments);
    const held = heldItem, orig = held.type;
    held.type = alias;
    try { return inner.apply(this, arguments); } finally { held.type = orig; }
  };
}
{ // the alias slots sit on their real tile's layer (placement preview, range grid)
  const lft = layerForType, lnt = layerNumberForType;
  const real = (t) => (itemDefs[t] && itemDefs[t].autoAlias) || t;
  layerForType = function (t) { return lft(real(t)); };
  layerNumberForType = function (t) { return lnt(real(t)); };
}

/* Dirt stairs laid or picked up: the (player-laid) mountain tile right above
   them re-tiles, so it runs straight into the stairs / gets its rim back. */
for (const layer of ALL_LAYERS) {
  if (layer.__stairsHooked) continue;
  layer.__stairsHooked = true;
  const set = layer.set, del = layer.delete;
  const retileAbove = (k) => {
    const [c, r] = k.split(",").map(Number);
    queueMicrotask(() => {
      autotileArmed++; autotileFlushing = true;
      try { for (let dc = -1; dc <= 1; dc++) autotileCell(MTN, c + dc, r - 1); }
      finally { autotileArmed--; autotileFlushing = false; autotileTouched.length = 0; }
    });
  };
  layer.set = function (k, v) {
    const r = set.call(this, k, v);
    if (v && itemDefs[v] && itemDefs[v].isStairs) retileAbove(k);
    return r;
  };
  layer.delete = function (k) {
    const old = this.get(k);
    const r = del.call(this, k);
    if (old && itemDefs[old] && itemDefs[old].isStairs) retileAbove(k);
    return r;
  };
}

/* ---- old grass -> grass_tile -------------------------------------------
   Per request: the old grass tiles (grass, grassInner, grassL/R/TC/BC/
   TL/TR/BL/BR — the first tileset) are replaced by grass_tile pieces, so
   every patch of grass on the maps joins up the same way. Each old tile
   becomes the grass_tile piece its neighbours call for (old grass, new
   grass and the painted ground grass all count as grass). Runs whenever a
   world has old grass in it (loading, switching worlds); the result is
   saved like any other tile. */
const OLD_GRASS_RE = /^grass(Inner|L|R|TC|BC|TL|TR|BL|BR)?$/;
function migrateOldGrass() {
  const S = autotileSets.terrainGrass;
  if (!S) return 0;
  const L = S.layer;
  const old = [];
  // also the port set's plain land squares (portI2/I4/I6): same green, so a
  // grassy shore reads as grass_tile too; the shore pieces stay as they are
  const PORT_LAND = /^portI[246]$/;
  for (const [k, t] of L) if (OLD_GRASS_RE.test(t) || PORT_LAND.test(t)) old.push(k);
  if (!old.length) return 0;
  const isGrass = (c, r) => {
    const t = L.get(c + "," + r);
    if (t) return OLD_GRASS_RE.test(t) || t.startsWith("terrainGrass") || t.startsWith("port");
    return typeof isGroundFilled === "function" && isGroundFilled(c, r) && !groundLayer.has(c + "," + r);
  };
  const picks = [];
  for (const k of old) {
    const [col, row] = k.split(",").map(Number);
    const has = AUTOTILE_NB.map(([dx, dy]) => isGrass(col + dx, row + dy));
    let best = -1e9, tops = [];
    for (const c of S.candidates) {
      let score = 0;
      for (let i = 0; i < 8; i++) {
        if (i >= 4) { const [a, b] = AUTOTILE_DIAG_SIDES[i - 4]; if (!has[a] || !has[b]) continue; }
        score += (c.mask[i] === has[i]) ? (i < 4 ? 4 : 1) : (i < 4 ? -4 : -1);
      }
      if (score > best) { best = score; tops = [c.type]; } else if (score === best) tops.push(c.type);
    }
    picks.push([k, tops[Math.abs(col * 73856093 ^ row * 19349663) % tops.length]]);
  }
  for (const [k, t] of picks) L.set(k, t); // all at once, so every pick saw the old layout
  if (typeof saveGame === "function") saveGame();
  return picks.length;
}
setInterval(() => { try { migrateOldGrass(); } catch (e) { console.error("grass migration:", e); } }, 1500);
