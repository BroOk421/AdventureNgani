"use strict";

/* =================================================================
   ROOM CUSTOMIZER — tile-shaped rooms you dig out yourself.

   Per request ("yung pang expand ng room is may gagamitin sa inventory na
   parang pickaxe tapos kung san siya nakaharap... 2x2... kada bagong
   gawa na bahay... yung loob is 4x4 lang... yung walling at floor is
   naka default na at sinusundan yung mismong pattern ng open space...
   yung pader na collisions kapag naging open space is maging floor"):

   A customizable room is a SET OF FLOOR TILES, not a rectangle:
     room.custom = { wall, floor, tiles: ["col,row", ...], door: [col, row] }
   `door` is the left tile of the 2-wide doorway, in the row just below
   the floor. Everything is drawn from that set (buildCustomRoomImage()):
     - every floor tile gets the floor texture
     - above every floor tile whose north neighbour isn't floor, the
       chosen wall set's back-wall band (3 tiles tall)
     - round the whole shape (floor + band + doorway), a frame in that
       wall set's own trim colours — so the walls and their corners
       always follow the open space, whatever shape it has
   Collision: the feet may only be on floor or doorway tiles
   (isInteriorWallAt(), js/interior.js, checks `room.floorTiles`).

   Tools (inventory, equip, press F facing a wall — Crush animation):
     - Room Pickaxe: digs the ONE tile in front into floor (expand)
     - Room Hammer:  fills the ONE tile in front back into wall (shrink) — not
       where furniture stands, not the doorway, and never cutting part of
       the room off from the door
   A newly built house starts as a 4x4 room. H still switches the wall
   and floor style. Saved per room as `interiorCustom` (js/save.js).
================================================================= */

const ROOM_WALL_STYLES = Object.keys(TOWN_ART.wallSets);   // log, stone, wood, plaster
const ROOM_FLOOR_STYLES = Object.keys(TOWN_ART.floors);    // planks, stone, herring, parquet
const ROOM_STYLE_NAMES = { log: "Log", stone: "Bato", wood: "Kahoy", plaster: "Plaster", planks: "Tabla", herring: "Herringbone", parquet: "Parquet" };
const ROOM_BAND_ROWS = 3;          // back wall height, in tiles
const ROOM_TOP_MARGIN = ROOM_BAND_ROWS + 1;
const ROOM_MAX_COLS = 48, ROOM_MAX_ROWS = 40, ROOM_MAX_TILES = 1000;
const ROOM_TOOL_PICKAXE = "roomPickaxe", ROOM_TOOL_HAMMER = "roomHammer";
// Feet line -> bottom of the drawn soles (sprite bottom is 48/64 of the frame).
const ROOM_SOLE_DROP = (48 / 64 - SPRITE_FEET_FRACTION) * DRAW_SIZE - 0.01;

const tk = (c, r) => c + "," + r;
const tp = (k) => k.split(",").map(Number);

// A rectangle (the old room size, or the starting 4x4) as a tile layout.
function rectRoomLayout(cols, rows) {
  const tiles = [];
  for (let r = ROOM_TOP_MARGIN; r <= rows - 2; r++) for (let c = 1; c <= cols - 2; c++) tiles.push(tk(c, r));
  return { tiles, door: [Math.floor(cols / 2) - 1, rows - 1] };
}
function smallRoomLayout() { return rectRoomLayout(6, 9); } // floor 4x4: cols 1-4, rows 4-7, door below cols 2-3

function roomShape(custom) {
  const floor = new Set(custom.tiles);
  const [dc, dr] = custom.door;
  const doorway = new Set([tk(dc, dr), tk(dc + 1, dr)]);
  let maxC = dc + 1;
  for (const k of floor) maxC = Math.max(maxC, tp(k)[0]);
  const cols = maxC + 2, rows = dr + 2;
  const band = new Set();
  for (const k of floor) {
    const [c, r] = tp(k);
    if (floor.has(tk(c, r - 1))) continue;
    for (let i = 1; i <= ROOM_BAND_ROWS; i++) {
      const t = tk(c, r - i);
      if (floor.has(t) || doorway.has(t) || r - i < 0) break;
      band.add(t);
    }
  }
  return { floor, doorway, band, cols, rows };
}

function roomGeometryFromShape(shape, custom) {
  const W = shape.cols * TILE, H = shape.rows * TILE;
  const [dc, dr] = custom.door;
  const tileMap = [];
  for (let r = 0; r < shape.rows; r++) {
    let line = "";
    for (let c = 0; c < shape.cols; c++) line += shape.floor.has(tk(c, r)) || shape.doorway.has(tk(c, r)) ? "." : "#";
    tileMap.push(line);
  }
  const feetOff = (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  return {
    width: W, height: H,
    spawnX: (dc + 1) * TILE,
    spawnY: (dr - 1) * TILE + TILE / 2 - feetOff,
    exitZone: { minX: dc * TILE + 2, maxX: (dc + 2) * TILE - 2, minY: dr * TILE - feetOff, maxY: H },
    walls: [],
    tileMap,
    floorTiles: new Set([...shape.floor, ...shape.doorway]),
  };
}

// Per request ("walang guhit dapat tuloy tuloy lang"): each wall set's
// 64px band in the sheet has end caps (a dark post / log ends) on both
// sides, so repeating the whole band every 64px drew a vertical line every
// 4 tiles. These are the spans INSIDE the caps that repeat with no seam
// (measured off Interior_Walls_01.png: column s+len matches column s).
// [start offset in the band, length]. Sets not listed keep the old tiling.
const ROOM_WALL_SEAMLESS = { log: [11, 40], stone: [16, 32], wood: [8, 48], plaster: [7, 44] };
function drawSeamlessBandSlice(cx, sheet, wallName, bx, bw, sy, c, r) {
  const span = ROOM_WALL_SEAMLESS[wallName];
  if (!span) { cx.drawImage(sheet, bx + (c * TILE) % bw, sy, TILE, TILE, c * TILE, r * TILE, TILE, TILE); return; }
  const [s0, len] = span;
  let off = (c * TILE) % len, dx = 0;
  while (dx < TILE) { // a 16px slice can straddle the wrap point — draw it in pieces
    const w = Math.min(TILE - dx, len - off);
    cx.drawImage(sheet, bx + s0 + off, sy, w, TILE, c * TILE + dx, r * TILE, w, TILE);
    dx += w; off = 0;
  }
}

/* Cave floors get some texture — per request ("ang plain ng ground ng cave
   ... dapat may dirt rake para may medyo style"): patches of raked dirt
   (the same auto-tiled clods as the farm's Dirt Rake, assets.dirtRakeAuto —
   lumpy rim outside, seamless inside), a few lone clods, pebbles and
   hairline cracks, all baked into the room picture. Seeded from the room's
   own shape, so a cave always looks the same. Walkable as before (it's
   only paint). */
// The Dirt Rake clods in the cave's own earthy, redder brown (the farm
// soil's yellow-orange stood out on the rock floor).
let caveRakeCanvas = null;
function caveRakeArt(rake) {
  if (caveRakeCanvas) return caveRakeCanvas;
  const c = document.createElement("canvas");
  c.width = rake.naturalWidth; c.height = rake.naturalHeight;
  const g = c.getContext("2d");
  g.drawImage(rake, 0, 0);
  try {
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      const l = (p[i] * 0.5 + p[i + 1] * 0.4 + p[i + 2] * 0.1) / 255; // the clod's own shading (~0.30 .. 0.42)
      const t = Math.max(0, Math.min(1, (l - 0.30) / 0.12));               // stretched to 0..1
      p[i] = Math.round(78 + t * 70); p[i + 1] = Math.round(48 + t * 48); p[i + 2] = Math.round(32 + t * 32);
    }
    g.putImageData(d, 0, 0);
  } catch (e) { /* file:// canvas: keep the original colours */ }
  return caveRakeCanvas = c;
}
function decorateCaveFloor(cx, shape, custom) {
  let seed = 7;
  for (const k of shape.floor) for (let i = 0; i < k.length; i++) seed = (seed * 31 + k.charCodeAt(i)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const floor = [...shape.floor];
  const isFloor = (c, r) => shape.floor.has(tk(c, r));
  const [dc, dr] = custom.door;
  const nearDoor = (c, r) => Math.abs(c - dc - 0.5) < 3 && r >= dr - 3;
  const rake = assets.dirtRakeAuto;
  if (rake && !(rake.complete && rake.naturalWidth) && !rake.__caveRebuild) {
    // not loaded yet (a save opened straight into a cave): repaint the caves once it is
    rake.__caveRebuild = true;
    rake.addEventListener("load", () => {
      for (const room of Object.values(INTERIOR_ROOMS)) {
        if (room.custom && room.custom.floor === "cave") room.image = buildCustomRoomImage(room.custom, roomShape(room.custom));
      }
    }, { once: true });
  }
  if (rake && rake.complete && rake.naturalWidth) {
    const patch = new Set();
    const patches = Math.max(2, Math.round(floor.length / 45));
    for (let p = 0; p < patches; p++) {
      let [c, r] = tp(floor[Math.floor(rnd() * floor.length)]);
      const size = 3 + Math.floor(rnd() * 9);
      for (let n = 0; n < size * 3 && n < 40; n++) {
        if (isFloor(c, r) && !nearDoor(c, r) && !shape.band.has(tk(c, r - 1))) patch.add(tk(c, r));
        const d = Math.floor(rnd() * 4);
        c += d === 0 ? 1 : d === 1 ? -1 : 0; r += d === 2 ? 1 : d === 3 ? -1 : 0;
        if (!isFloor(c, r)) [c, r] = tp([...patch][Math.floor(rnd() * patch.size)] || floor[0]);
      }
    }
    // a few lone clods too
    for (let n = 0; n < Math.round(floor.length / 70); n++) {
      const [c, r] = tp(floor[Math.floor(rnd() * floor.length)]);
      if (!nearDoor(c, r) && !shape.band.has(tk(c, r - 1))) patch.add(tk(c, r));
    }
    const inP = (c, r) => patch.has(tk(c, r));
    const caveRake = caveRakeArt(rake);
    cx.save();
    cx.globalAlpha = 0.9;
    for (const k of patch) {
      const [c, r] = tp(k);
      const m = (inP(c, r - 1) ? 1 : 0) | (inP(c + 1, r) ? 2 : 0) | (inP(c, r + 1) ? 4 : 0) | (inP(c - 1, r) ? 8 : 0);
      cx.drawImage(caveRake, m * 24, 0, 24, 24, c * TILE - 4, r * TILE - 4, 24, 24);
    }
    cx.restore();
  }
  // pebbles: 1-3 px stones with a light top and a dark underside
  for (let n = 0; n < Math.round(floor.length * 0.55); n++) {
    const [c, r] = tp(floor[Math.floor(rnd() * floor.length)]);
    const x = c * TILE + Math.floor(rnd() * 14) + 1, y = r * TILE + Math.floor(rnd() * 13) + 2;
    const w = 1 + Math.floor(rnd() * 2);
    cx.fillStyle = "rgba(40,26,18,0.55)"; cx.fillRect(x, y + 1, w + 1, 1);
    cx.fillStyle = rnd() < 0.5 ? "rgba(176,150,128,0.85)" : "rgba(130,104,86,0.9)"; cx.fillRect(x, y, w, 1);
  }
  // hairline cracks
  cx.fillStyle = "rgba(36,22,14,0.45)";
  for (let n = 0; n < Math.round(floor.length / 18); n++) {
    const [c, r] = tp(floor[Math.floor(rnd() * floor.length)]);
    let x = c * TILE + Math.floor(rnd() * 12) + 2, y = r * TILE + Math.floor(rnd() * 12) + 2;
    const len = 3 + Math.floor(rnd() * 5), dir = rnd() < 0.5 ? 1 : -1;
    for (let i = 0; i < len; i++) {
      if (!isFloor(Math.floor(x / TILE), Math.floor(y / TILE))) break;
      cx.fillRect(x, y, 1, 1);
      x += dir; if (rnd() < 0.45) y += rnd() < 0.5 ? 1 : -1;
    }
  }
}

function buildCustomRoomImage(custom, shape) {
  const sheet = assets.townInteriorWalls;
  const W = shape.cols * TILE, H = shape.rows * TILE;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const cx = cv.getContext("2d");
  cx.imageSmoothingEnabled = false;
  cx.fillStyle = "#0a0a0a";
  cx.fillRect(0, 0, W, H);
  const set = roomWallSet(custom.wall);
  const fl = roomFloorSet(custom.floor);
  const [fx, fy, fw, fh] = fl.box;
  const [bx, by, bw] = set.band;
  const wallSheet = set.sheet ? assets[set.sheet] : sheet, floorSheet = fl.sheet ? assets[fl.sheet] : sheet;
  const drawFloor = (c, r) => cx.drawImage(floorSheet, fx + (c * TILE) % fw, fy + (r * TILE) % fh, TILE, TILE, c * TILE, r * TILE, TILE, TILE);
  for (const k of shape.floor) drawFloor(...tp(k));
  for (const k of shape.doorway) drawFloor(...tp(k));
  if (custom.floor === "cave") decorateCaveFloor(cx, shape, custom);
  // back wall: each band tile shows the slice of the 48px band that belongs at its height
  for (const k of shape.band) {
    const [c, r] = tp(k);
    let i = 1; // how many tiles above the floor this band tile is
    while (shape.band.has(tk(c, r + i))) i++;
    const sy = by + 8 + (ROOM_BAND_ROWS - i) * TILE;
    drawSeamlessBandSlice(cx, wallSheet, custom.wall, bx, bw, sy, c, r);
  }
  // soft shadow where floor meets the back wall
  cx.fillStyle = "rgba(0,0,0,0.25)";
  for (const k of shape.floor) {
    const [c, r] = tp(k);
    if (shape.band.has(tk(c, r - 1))) cx.fillRect(c * TILE, r * TILE, TILE, 3);
  }
  // the frame, drawn into the empty tiles that touch the room
  const inside = (c, r) => shape.floor.has(tk(c, r)) || shape.band.has(tk(c, r)) || shape.doorway.has(tk(c, r));
  const ring = set.frame.slice(0, 5).concat(["#120c08"]); // outermost .. innermost
  const T = ring.length;
  for (let r = 0; r < shape.rows; r++) {
    for (let c = 0; c < shape.cols; c++) {
      if (inside(c, r)) continue;
      const x0 = c * TILE, y0 = r * TILE;
      for (let i = 0; i < T; i++) {
        cx.fillStyle = ring[T - 1 - i]; // i = distance from the room
        if (inside(c, r + 1) && !shape.doorway.has(tk(c, r + 1))) cx.fillRect(x0, y0 + TILE - 1 - i, TILE, 1);
        if (inside(c, r - 1) && !shape.doorway.has(tk(c, r - 1))) cx.fillRect(x0, y0 + i, TILE, 1);
        if (inside(c + 1, r)) cx.fillRect(x0 + TILE - 1 - i, y0, 1, TILE);
        if (inside(c - 1, r)) cx.fillRect(x0 + i, y0, 1, TILE);
      }
      // outside corners
      const corner = (dx, dy, ox, oy) => {
        if (!inside(c + dx, r + dy) || inside(c + dx, r) || inside(c, r + dy)) return;
        for (let a = 0; a < T; a++) for (let b = 0; b < T; b++) {
          cx.fillStyle = ring[T - 1 - Math.max(a, b)];
          cx.fillRect(x0 + (ox ? TILE - 1 - a : a), y0 + (oy ? TILE - 1 - b : b), 1, 1);
        }
      };
      corner(1, 1, 1, 1); corner(-1, 1, 0, 1); corner(1, -1, 1, 0); corner(-1, -1, 0, 0);
    }
  }
  const mat = assets.floorMatBldGreen;
  if (mat && mat.width) {
    const [dc, dr] = custom.door;
    cx.drawImage(mat, 0, 0, mat.width, mat.height, dc * TILE, dr * TILE + 2, 2 * TILE, 13);
  }
  return cv;
}

function isRoomCustomizable(room) {
  return !!room && !room.lockedLayout && (!!room.custom || !!room.customizable);
}
// The pack's four wall sets plus extra ones on their own sheet (the cave's rock).
function roomWallSet(name) {
  return TOWN_ART.wallSets[name] || (TOWN_ART.wallSets_extra || {})[name] || TOWN_ART.wallSets.wood;
}
function roomFloorSet(name) {
  if (TOWN_ART.floors[name]) return { box: TOWN_ART.floors[name] };
  return (TOWN_ART.floors_extra || {})[name] || { box: TOWN_ART.floors.planks };
}

// The room's tile layout. Old saves stored a plain size ({cols, rows});
// those become the same rectangle as tiles, so nothing inside moves.
function normalizeCustom(custom, room) {
  const c = {
    wall: ROOM_WALL_STYLES.includes(custom.wall) || (TOWN_ART.wallSets_extra || {})[custom.wall] ? custom.wall : "wood",
    floor: ROOM_FLOOR_STYLES.includes(custom.floor) || (TOWN_ART.floors_extra || {})[custom.floor] ? custom.floor : "planks",
  };
  if (custom.layoutVersion) c.layoutVersion = custom.layoutVersion;
  if (Array.isArray(custom.tiles) && custom.tiles.length && Array.isArray(custom.door)) {
    c.tiles = custom.tiles.slice(); c.door = custom.door.slice();
  } else if (custom.start === "small") {
    Object.assign(c, smallRoomLayout());
  } else {
    const cols = Math.round(custom.cols || (room ? room.width / TILE : 14));
    const rows = Math.round(custom.rows || (room ? room.height / TILE : 12));
    Object.assign(c, rectRoomLayout(Math.max(6, cols), Math.max(9, rows)));
  }
  return c;
}

function applyRoomCustom(room, custom) {
  const c = normalizeCustom(custom, room);
  room.custom = c;
  const shape = roomShape(c);
  Object.assign(room, roomGeometryFromShape(shape, c));
  room.image = buildCustomRoomImage(c, shape);
  room.solidDecorCache = null;
  room.solidDecorCacheNoBand = null;
  if (room.npcAvoid) room.npcAvoid.clear();
}

/* ---------------- digging / filling ---------------- */

/* ---- 5-tile strips ----------------------------------------------------
   Per request ("isang pa vertical na 5 tiles ... kiniclick na lang ...
   gagana lang yun kapag may pader na katabi"): one swing moves a whole
   stretch of wall — up to ROOM_STRIP_LEN tiles along the wall face (a
   VERTICAL strip when pushing a side wall left/right, a horizontal one when
   pushing the back wall up / filling from the bottom), centred on the
   clicked tile (or the tile in front for F).
     Pickaxe: the clicked tile must be WALL right next to the floor; every
       tile of the strip that is wall with floor on the room side is dug.
     Hammer: the clicked tile must be FLOOR right next to a wall; every
       tile of the strip that is floor with wall on that same side is filled.
   Tiles in the strip that don't touch the wall/floor edge are skipped, so a
   strip never cuts into open space. roomToolTarget() returns the whole
   plan ({ tiles: [{col,row,ok}], ok, why }) — the highlight
   (drawRoomToolHighlight(), js/camera.js) and the swing use the same one. */
const ROOM_STRIP_LEN = 5;
const ROOM_TOOL_REACH = PLACEMENT_RANGE + 2; // how far away a click can aim
const ROOM_DIRS = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };

function roomBodyTiles() {
  const feetY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  const rows = [Math.floor(feetY / TILE), Math.floor((feetY + ROOM_SOLE_DROP) / TILE)];
  const cols = [Math.floor((player.x - BODY_COLLISION_HALF_W) / TILE), Math.floor((player.x + BODY_COLLISION_HALF_W - 0.001) / TILE)];
  const out = new Set();
  for (const r of rows) for (const c of cols) out.add(tk(c, r));
  return out;
}
function playerRoomTile() {
  const feetY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  return { col: Math.floor(player.x / TILE), row: Math.floor(feetY / TILE) };
}
// Which way the edge faces at (col,row): for the pickaxe the direction from
// the floor INTO this wall tile, for the hammer from this floor tile INTO the
// wall. Several candidates (a corner) -> the one pointing away from the player.
function stripDirection(floor, tool, col, row) {
  const p = playerRoomTile();
  const away = [Math.sign(col - p.col), Math.sign(row - p.row)];
  let best = null, bestScore = -9;
  for (const [name, [dx, dy]] of Object.entries(ROOM_DIRS)) {
    const edge = tool === ROOM_TOOL_PICKAXE ? floor.has(tk(col - dx, row - dy)) : !floor.has(tk(col + dx, row + dy));
    if (!edge) continue;
    const score = dx * away[0] + dy * away[1];
    if (score > bestScore) { bestScore = score; best = name; }
  }
  return best;
}
function roomToolTarget(room, tool, aim) {
  const c = room.custom;
  const floor = new Set(c.tiles);
  const [dc, dr] = c.door;
  let anchor = aim;
  if (!anchor) { // F: look along the facing direction
    const p = playerRoomTile();
    const [fx, fy] = ROOM_DIRS[player.facing] || ROOM_DIRS.down;
    for (let d = 0; d <= 3 && !anchor; d++) {
      const col = p.col + fx * d, row = p.row + fy * d;
      if (tool === ROOM_TOOL_PICKAXE && d > 0 && !floor.has(tk(col, row))) anchor = { col, row };
      if (tool === ROOM_TOOL_HAMMER && floor.has(tk(col, row)) && !floor.has(tk(col + fx, row + fy))) anchor = { col, row };
    }
    if (!anchor) { const p2 = playerRoomTile(); anchor = { col: p2.col + fx, row: p2.row + fy }; }
  }
  const fail = (why) => ({ anchor, tiles: [{ col: anchor.col, row: anchor.row, ok: false }], ok: false, why });
  const isFloor = floor.has(tk(anchor.col, anchor.row));
  if (tool === ROOM_TOOL_PICKAXE && isFloor) return fail("Pumili ng pader na katabi ng sahig");
  if (tool === ROOM_TOOL_HAMMER && !isFloor) return fail("Pumili ng sahig na katabi ng pader");
  const dirName = stripDirection(floor, tool, anchor.col, anchor.row);
  if (!dirName) return fail(tool === ROOM_TOOL_PICKAXE ? "Walang sahig na katabi — hindi ma-expand" : "Walang pader na katabi");
  const [dx, dy] = ROOM_DIRS[dirName];
  const along = dx ? [0, 1] : [1, 0]; // the strip runs along the wall face
  const half = Math.floor(ROOM_STRIP_LEN / 2);
  const tiles = [];
  for (let i = -half; i <= half; i++) {
    const col = anchor.col + along[0] * i, row = anchor.row + along[1] * i;
    const k = tk(col, row);
    let ok;
    if (tool === ROOM_TOOL_PICKAXE) ok = !floor.has(k) && floor.has(tk(col - dx, row - dy)) && row < dr && col >= -1;
    else ok = floor.has(k) && !floor.has(tk(col + dx, row + dy)) && fillTileFree(room, col, row);
    tiles.push({ col, row, ok });
  }
  const chosen = tiles.filter((t) => t.ok);
  if (!chosen.length) return { anchor, tiles, ok: false, why: tool === ROOM_TOOL_PICKAXE ? "Wala nang mahuhukay dito" : "Walang matatakpan dito" };
  const chk = tool === ROOM_TOOL_PICKAXE ? checkDig(room, chosen) : checkFill(room, chosen);
  if (!chk.ok) for (const t of tiles) t.ok = false;
  return { anchor, tiles, ok: chk.ok, why: chk.why };
}
// A single tile the hammer may cover: not the doorway, not under you, nothing on it.
function fillTileFree(room, col, row) {
  const [dc, dr] = room.custom.door;
  const k = tk(col, row);
  if (k === tk(dc, dr - 1) || k === tk(dc + 1, dr - 1)) return false;
  if (roomBodyTiles().has(k)) return false;
  return !(room.decor.has(k) || room.floorDecor.has(k) || (room.tableTop && room.tableTop.has(k)) ||
    (room.collisions && room.collisions.has(k)) ||
    (typeof interiorSolidDecorTiles === "function" && interiorSolidDecorTiles(room).has(k)));
}

function shiftRoomContents(room, dc, dr) {
  if (!dc && !dr) return;
  const move = (map) => {
    if (!map) return;
    const items = [...map];
    map.clear();
    for (const [k, v] of items) { const [c, r] = tp(k); map.set(tk(c + dc, r + dr), v); }
  };
  move(room.decor); move(room.floorDecor); move(room.tableTop); move(room.collisions);
  room.custom.tiles = room.custom.tiles.map((k) => { const [c, r] = tp(k); return tk(c + dc, r + dr); });
  room.custom.door = [room.custom.door[0] + dc, room.custom.door[1] + dr];
  const id = Object.keys(INTERIOR_ROOMS).find((k) => INTERIOR_ROOMS[k] === room);
  if (player.scene === "inside" && player.activeRoomId === id) { player.x += dc * TILE; player.y += dr * TILE; }
  if (typeof citizens !== "undefined") {
    for (const c of citizens) {
      if (c.scene !== "inside" || c.roomId !== id) continue;
      c.fx += dc * TILE; c.fy += dr * TILE; c.path = null; c.goal = null; c.state = "idle";
    }
  }
}

function roomToast(msg) { if (typeof showToast === "function") showToast(msg); }

function checkDig(room, list) {
  const c = room.custom;
  const floor = new Set(c.tiles);
  const [dc, dr] = c.door;
  if (floor.size + list.length > ROOM_MAX_TILES) return { ok: false, why: "Pinakamalaki na ang bahay" };
  const all = [...floor].map(tp).concat(list.map((t) => [t.col, t.row]));
  const minC = Math.min(...all.map((p) => p[0]), dc), maxC = Math.max(...all.map((p) => p[0]), dc + 1);
  const minR = Math.min(...all.map((p) => p[1]));
  if (maxC - minC + 3 > ROOM_MAX_COLS || dr - minR + ROOM_TOP_MARGIN + 2 > ROOM_MAX_ROWS) {
    return { ok: false, why: "Pinakamalaki na ang bahay" };
  }
  return { ok: true };
}

function digRoom(room, plan) {
  if (!plan.ok) { roomToast(plan.why); return false; }
  const c = room.custom;
  const floor = new Set(c.tiles);
  for (const t of plan.tiles) {
    if (!t.ok) continue;
    const k = tk(t.col, t.row);
    floor.add(k);
    // something hanging on the wall here has nothing to hang on any more
    const hung = room.decor.get(k);
    if (hung && layerNumberForType(hung) === 5) { room.decor.delete(k); grantItem(hung, 1); }
  }
  c.tiles = [...floor];
  const all = c.tiles.map(tp);
  const minC = Math.min(...all.map((p) => p[0]), c.door[0]);
  const minR = Math.min(...all.map((p) => p[1]));
  // keep a wall's width of room on the left and room for the back wall on top
  shiftRoomContents(room, Math.max(0, 1 - minC), Math.max(0, ROOM_TOP_MARGIN - minR));
  return true;
}

function checkFill(room, list) {
  const c = room.custom;
  const floor = new Set(c.tiles);
  const [dc, dr] = c.door;
  for (const t of list) floor.delete(tk(t.col, t.row));
  if (floor.size < 4) return { ok: false, why: "Masyado nang maliit ang bahay" };
  // everything must still connect to the door
  const start = [tk(dc, dr - 1), tk(dc + 1, dr - 1)].filter((t) => floor.has(t));
  const seen = new Set(start), queue = [...start];
  while (queue.length) {
    const [x, y] = tp(queue.pop());
    for (const n of [tk(x + 1, y), tk(x - 1, y), tk(x, y + 1), tk(x, y - 1)]) if (floor.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
  }
  if (seen.size !== floor.size) return { ok: false, why: "Mahahati ang bahay — hindi pwede" };
  return { ok: true };
}

function fillRoom(room, plan) {
  if (!plan.ok) { roomToast(plan.why); return false; }
  const drop = new Set(plan.tiles.filter((t) => t.ok).map((t) => tk(t.col, t.row)));
  room.custom.tiles = room.custom.tiles.filter((k) => !drop.has(k));
  return true;
}

/* ---- press, drag, release -----------------------------------------------
   Per request ("pagka pindot ididiin para hanggang san yung i-expand tapos
   kapag bitaw is yun mag-expand na"): press on a tile, drag to stretch a
   rectangle as far as you want it to go, release to swing. A plain click
   (no drag) still does the 5-tile strip, F still works on what's in front.
   The same edge rule holds: the pickaxe must start on a wall right next to
   the floor, the hammer on floor right next to a wall. */
const ROOM_DRAG_MAX = 16; // tiles per side of a dragged rectangle
let roomDrag = null;      // { tool, anchor: {col,row} } while the button is held

function roomRectPlan(room, tool, a, b) {
  const c = room.custom;
  const floor = new Set(c.tiles);
  const [, dr] = c.door;
  const fail = (why) => ({ anchor: a, tiles: [{ col: a.col, row: a.row, ok: false }], ok: false, why });
  const aFloor = floor.has(tk(a.col, a.row));
  const touches = (col, row, want) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([x, y]) => floor.has(tk(col + x, row + y)) === want);
  if (tool === ROOM_TOOL_PICKAXE && (aFloor || !touches(a.col, a.row, true))) return fail("Walang sahig na katabi — hindi ma-expand");
  if (tool === ROOM_TOOL_HAMMER && (!aFloor || !touches(a.col, a.row, false))) return fail("Pumili ng sahig na katabi ng pader");
  const bx = Math.max(a.col - ROOM_DRAG_MAX + 1, Math.min(a.col + ROOM_DRAG_MAX - 1, b.col));
  const by = Math.max(a.row - ROOM_DRAG_MAX + 1, Math.min(a.row + ROOM_DRAG_MAX - 1, b.row));
  const tiles = [];
  for (let row = Math.min(a.row, by); row <= Math.max(a.row, by); row++) {
    for (let col = Math.min(a.col, bx); col <= Math.max(a.col, bx); col++) {
      const k = tk(col, row);
      const ok = tool === ROOM_TOOL_PICKAXE ? !floor.has(k) && row < dr && col >= -1 : floor.has(k) && fillTileFree(room, col, row);
      tiles.push({ col, row, ok });
    }
  }
  const chosen = tiles.filter((t) => t.ok);
  if (!chosen.length) return { anchor: a, tiles, ok: false, why: "Walang mababago dito" };
  const chk = tool === ROOM_TOOL_PICKAXE ? checkDig(room, chosen) : checkFill(room, chosen);
  if (!chk.ok) for (const t of tiles) t.ok = false;
  return { anchor: a, tiles, ok: chk.ok, why: chk.why };
}
// The plan for whatever the room tool is aimed at right now (used by the
// highlight in js/camera.js and by the swing itself).
function currentRoomToolPlan(room, tool, spec) {
  if (spec && spec.to && (spec.to.col !== spec.from.col || spec.to.row !== spec.from.row)) return roomRectPlan(room, tool, spec.from, spec.to);
  return roomToolTarget(room, tool, spec ? spec.from : null);
}

// Start the Crush swing: spec = { from, to } (click / drag) or null (F, what's in front).
function startRoomToolSwing(tool, spec) {
  const room = player.scene === "inside" ? INTERIOR_ROOMS[player.activeRoomId] : null;
  if (!isRoomCustomizable(room)) { roomToast("Hindi pwedeng baguhin ang room na ito"); return; }
  if (!room.custom) applyRoomCustom(room, { wall: "wood", floor: "planks" });
  const plan = currentRoomToolPlan(room, tool, spec);
  if (!plan.ok) { roomToast(plan.why); return; }
  if (spec) { // face what was aimed at
    const p = playerRoomTile();
    const dx = spec.from.col - p.col, dy = spec.from.row - p.row;
    if (dx || dy) player.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  }
  player.action = itemDefs[tool].weapon.attackAnim;
  player.indoorTool = tool;
  player.indoorToolSpec = spec;
  player.frame = 0;
  player.frameTimer = 0;
}

document.addEventListener("DOMContentLoaded", () => {
  view.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || player.scene !== "inside" || heldItem || player.grabbedType || player.action) return;
    const tool = player.equippedWeapon;
    if (!isRoomTool(tool)) return;
    const room = INTERIOR_ROOMS[player.activeRoomId];
    if (!isRoomCustomizable(room)) return;
    const t = screenToTile(e.clientX, e.clientY);
    const p = playerRoomTile();
    e.stopImmediatePropagation();
    if (Math.max(Math.abs(t.col - p.col), Math.abs(t.row - p.row)) > ROOM_TOOL_REACH) { roomToast("Masyadong malayo — lumapit pa"); return; }
    roomDrag = { tool, anchor: t };
  }, true);
  window.addEventListener("mouseup", (e) => {
    if (!roomDrag || e.button !== 0) return;
    const d = roomDrag;
    roomDrag = null;
    if (player.scene !== "inside" || player.equippedWeapon !== d.tool) return;
    startRoomToolSwing(d.tool, { from: d.anchor, to: screenToTile(e.clientX, e.clientY) });
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") roomDrag = null; });
});

// Called from player.js (indoor branch) when an F swing with a room tool finishes.
function resolveRoomTool(tool) {
  const room = player.scene === "inside" ? INTERIOR_ROOMS[player.activeRoomId] : null;
  if (!isRoomCustomizable(room)) { roomToast("Hindi pwedeng baguhin ang room na ito"); return; }
  if (!room.custom) applyRoomCustom(room, { wall: "wood", floor: "planks" });
  const plan = currentRoomToolPlan(room, tool, player.indoorToolSpec || null); // re-checked now the swing has landed
  player.indoorToolSpec = null;
  const changed = tool === ROOM_TOOL_PICKAXE ? digRoom(room, plan) : fillRoom(room, plan);
  if (!changed) return;
  applyRoomCustom(room, room.custom);
  saveGame();
}

// Does a default furniture piece fit this room's shape?
function defaultDecorFits(room, type, col, row) {
  const n = layerNumberForType(type);
  const floor = new Set(room.custom.tiles);
  if (n === 5) return !floor.has(tk(col, row)) && floor.has(tk(col, row + 1)) || roomShape(room.custom).band.has(tk(col, row));
  if (n === 6) return floor.has(tk(col, row));
  const def = itemDefs[type];
  const tiles = def && def.fixedFootprint ? getObjectFootprintBlockedTiles(type, col, row) : [{ col, row }];
  return tiles.every((t) => floor.has(tk(t.col, t.row)));
}

function isRoomTool(type) { return type === ROOM_TOOL_PICKAXE || type === ROOM_TOOL_HAMMER; }

/* ---------------- the panel (H): wall + floor style ---------------- */
let roomPanelEl = null;
function roomPanelButton(label, onClick) {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = "min-width:30px;margin:2px;padding:3px 8px;border:1px solid #6b4a2b;border-radius:4px;background:#3b2717;color:#f3e2c3;font:inherit;cursor:pointer";
  b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return b;
}
function currentCustomRoom() {
  if (player.scene !== "inside") return null;
  const room = INTERIOR_ROOMS[player.activeRoomId];
  return isRoomCustomizable(room) ? room : null;
}
function changeCurrentRoom(fn) {
  const room = currentCustomRoom();
  if (!room) return;
  const next = Object.assign({}, room.custom || normalizeCustom({}, room));
  fn(next);
  applyRoomCustom(room, next);
  saveGame();
  renderRoomPanel();
}
function cycle(list, v, d) { return list[(list.indexOf(v) + d + list.length) % list.length]; }
function renderRoomPanel() {
  if (!roomPanelEl) return;
  const room = currentCustomRoom();
  if (!room) { roomPanelEl.style.display = "none"; return; }
  const c = room.custom || { wall: "—", floor: "—" };
  roomPanelEl.innerHTML = "";
  const title = document.createElement("div");
  title.textContent = "Ayusin ang bahay";
  title.style.cssText = "font-weight:bold;margin-bottom:4px";
  roomPanelEl.appendChild(title);
  const row = (label, value, minus, plus) => {
    const d = document.createElement("div");
    d.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px";
    const l = document.createElement("span"); l.textContent = label; l.style.minWidth = "58px";
    const v = document.createElement("span"); v.textContent = value; v.style.cssText = "min-width:90px;text-align:center";
    d.append(l, roomPanelButton("◀", minus), v, roomPanelButton("▶", plus));
    roomPanelEl.appendChild(d);
  };
  row("Pader", ROOM_STYLE_NAMES[c.wall] || c.wall, () => changeCurrentRoom((n) => { n.wall = cycle(ROOM_WALL_STYLES, n.wall, -1); }), () => changeCurrentRoom((n) => { n.wall = cycle(ROOM_WALL_STYLES, n.wall, 1); }));
  row("Sahig", ROOM_STYLE_NAMES[c.floor] || c.floor, () => changeCurrentRoom((n) => { n.floor = cycle(ROOM_FLOOR_STYLES, n.floor, -1); }), () => changeCurrentRoom((n) => { n.floor = cycle(ROOM_FLOOR_STYLES, n.floor, 1); }));
  const hint = document.createElement("div");
  hint.innerHTML = "Palakihin: Room Pickaxe + F<br>Paliitin: Room Hammer + F<br>H para isara";
  hint.style.cssText = "opacity:.75;font-size:11px;margin-top:4px;line-height:1.4";
  roomPanelEl.appendChild(hint);
  roomPanelEl.style.display = "block";
}
function toggleRoomPanel() {
  if (!roomPanelEl) {
    roomPanelEl = document.createElement("div");
    roomPanelEl.id = "room-custom-panel";
    roomPanelEl.style.cssText = "position:fixed;right:16px;bottom:120px;z-index:50;padding:10px 12px;background:rgba(30,20,12,.92);border:2px solid #6b4a2b;border-radius:8px;color:#f3e2c3;font:13px monospace;display:none";
    roomPanelEl.addEventListener("mousedown", (e) => e.stopPropagation());
    document.body.appendChild(roomPanelEl);
  }
  if (roomPanelEl.style.display === "block") { roomPanelEl.style.display = "none"; return; }
  if (!currentCustomRoom()) {
    if (player.scene === "inside") roomToast("Hindi pwedeng ayusin ang room na ito");
    return;
  }
  renderRoomPanel();
}

/* ---------------- grocery (P) ---------------- */
// Per request: the grocery sells SEEDS only (js/farm.js grows them).
const GROCERY_STOCK = [
  { type: "seedCarrots", price: 5 }, { type: "seedPetchay", price: 5 }, { type: "seedOnion", price: 8 },
  { type: "seedCabbage", price: 10 }, { type: "seedBrocolli", price: 12 }, { type: "seedBrocolliFlower", price: 14 },
  { type: "seedDragonfruit", price: 20 },
  // per request: the grocery also BUYS what you chop and break
  { type: "woodLog", price: 3, sell: true },
  { type: "stoneChunk", price: 2, sell: true },
];
function groceryKeeperHere() {
  if (typeof citizens === "undefined") return null;
  return citizens.find((c) => isShopkeeperOnDuty(c) && c.roomId === player.activeRoomId) || null;
}
function openGroceryShop() {
  if (!groceryKeeperHere()) { roomToast("Sarado — bukas ang grocery 8:00 hanggang 18:00 (kapag nandito na ang tindero)"); return; }
  openNpcShop(GROCERY_STOCK, "Grocery — Binhi");
}
// (clicking the keeper to shop: js/farm.js, since `view` only exists once camera.js has loaded)
function isInGrocery() {
  return player.scene === "inside" && typeof player.activeRoomId === "string" && player.activeRoomId.startsWith("grocery_room@");
}
let roomHintEl = null;
function updateRoomHint() {
  if (typeof player === "undefined") return; // the interval can fire before js/player.js has loaded
  if (!roomHintEl) {
    roomHintEl = document.createElement("div");
    roomHintEl.style.cssText = "position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:40;padding:4px 10px;background:rgba(0,0,0,.55);color:#f3e2c3;font:12px monospace;border-radius:6px;pointer-events:none;display:none";
    document.body.appendChild(roomHintEl);
  }
  const parts = [];
  if (currentCustomRoom()) {
    parts.push("[H] Pader/Sahig");
    if (isRoomTool(player.equippedWeapon)) parts.push(player.equippedWeapon === ROOM_TOOL_PICKAXE ? "[F] Hukayin (palakihin)" : "[F] Takpan (paliitin)");
  }
  if (isInGrocery()) parts.push(groceryKeeperHere() ? "[P] Bumili ng binhi" : "Sarado ang grocery (8:00-18:00)");
  roomHintEl.textContent = parts.join("   ");
  roomHintEl.style.display = parts.length ? "block" : "none";
  if (roomPanelEl && roomPanelEl.style.display === "block" && !currentCustomRoom()) roomPanelEl.style.display = "none";
}
setInterval(updateRoomHint, 300);

window.addEventListener("keydown", (e) => {
  if (e.repeat || (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA"))) return;
  const k = e.key.toLowerCase();
  if (k === "h") toggleRoomPanel();
  else if (k === "p" && isInGrocery()) openGroceryShop();
});
