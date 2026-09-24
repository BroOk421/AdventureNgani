"use strict";

/* =================================================================
   INVENTORY / HOTBAR / GROUND PLACEMENT

   - `inventory` is a flat array of INVENTORY_ROWS * INVENTORY_COLS slots
     (null, or {type, count}).
   - `hotbar` is a SEPARATE array of HOTBAR_SIZE entries, each either null
     or an index into `inventory`. This is what makes hotbar assignment
     flexible — any inventory slot (not just the first row) can be put on
     any of the 7 hotkeys. Clicking an item in the full inventory panel
     opens a small menu (`openItemActionMenu`) with a "Hold" button and
     buttons 1-7; picking a number assigns that inventory slot to that
     hotbar position (overwriting whatever was there before).
   - Clicking a hotbar slot directly still just holds its item right away
     (that's the point of a hotbar — quick reuse of something already
     assigned), it doesn't open the assign menu.
   - Clicking "Hold" (or a hotbar slot) sets `heldItem`. While holding,
     tiles within PLACEMENT_RANGE of the player are highlighted in
     camera.js (light border = free, red border = already occupied).
     Clicking the game canvas while holding places the item on a valid
     tile and decrements its count.
   - `terrainLayer`, `groundLayer`, `decorLayer`, and `objectLayer` are
     FOUR separate "col,row" -> item type maps, stacked bottom to top:
       - `terrainLayer` — base terrain: Dirt (dirt1-3) and Water
         (water1-3). Drawn first, beneath even `groundLayer`.
       - `groundLayer` — the ground tileset, the Port/island edge
         tileset, and flat decorative stones (XXS Stone, Pebbles): dressing
         that sits on top of the base terrain — flat, drawn next.
       - `decorLayer` — wild grass/flowers (js/wildgrass.js): also flat/no
         collision, but its OWN layer so placing it never replaces
         whatever's on `groundLayer`/`terrainLayer` underneath it.
         Rendered specially — always fully behind the player while
         they're standing on it, plus a sway animation — see wildgrass.js.
       - `objectLayer` — stones, trees, the house: real presence, gets
         Y-sorted with the player (see renderWorldObjectsSorted()).
     Each layer only ever replaces/blocks within itself — placing Dirt
     over an existing Port tile doesn't disturb it (different layers),
     but placing Dirt over existing Dirt (or Water) DOES block/replace,
     same for Port over Port (or the Ground tileset). `layerForType()`
     below is the one place that decides which layer a type belongs to.
================================================================= */

// Which layer a given item type belongs in. `layer: "terrain"` (dirt,
// water) goes in terrainLayer; `layer: "decor"` (wild grass, flowers)
// goes in decorLayer; everything else falls back to the flat/non-flat
// split — flat (the ground tileset, Port tiles, flat pebbles) in
// groundLayer, everything else (stones, trees, the house) in
// objectLayer. Centralizing this one lookup is what keeps placement,
// collision, and rendering all agreeing on the same four-way split.
/* Which of the six layers each item belongs to. Written as one explicit
   table rather than inferred from flags, because the grouping is a
   design decision, not something derivable from an item's art: a floor
   tileset and a mushroom are both "flat", but one IS the ground and the
   other lies on it.

   Rules are tried in order and the first match wins, so a specific name
   can always override the prefix rule below it. Anything unmatched falls
   through to layer 3, which is where the bulk of the world lives.

   Each entry is [layer number, test]. A test is a prefix string, an
   exact-name array, or a regex. */
const ITEM_LAYER_RULES = [
  // --- 1. dirt ---
  [1, /^dirt/],

  // --- 2. the ground itself: grass, water, the port tileset ---
  [2, /^(grass|water|port)/],

  // --- 2 (overlay): lies ON the ground without replacing it ---
  // Per request these keep every behaviour they already have (shadow,
  // light, occlusion fade, the lot) — only WHERE they're filed changes.
  ["overlay", /^(decoFlower|bushMushroom|windowLight)/],
  ["overlay", ["leavesFloor"]],

  // --- 3, but its own map — see wildgrassLayer ---
  ["wildgrass", /^wildGrass/],

  // --- 5. walls ---
  // The LIT windows are deliberately NOT here: they're the glow a window
  // throws, so they go in the overlay above.
  [5, /^(windowPlain|wallFurniture|wallPoster|pictureFrame|interiorWall)/],

  // --- 6. ceiling ---
  [6, ["ceilingTile"]],

  // --- 4. things that sit on top of furniture, not on the ground ---
  // `base1`-`base5` will join this list once that art exists.
  [4, /^(plotSocket|plate|mug|board[AB]|veg)/],
  [4, ["meatItem"]],

  // --- 3. everything else stands on the ground ---
];

function layerNumberForType(type) {
  for (const [n, test] of ITEM_LAYER_RULES) {
    if (Array.isArray(test) ? test.includes(type) : test.test(type)) return n;
  }
  return 3;
}

function layerForType(type) {
  switch (layerNumberForType(type)) {
    case 1: return dirtLayer;
    case 2: return groundLayer;
    case "overlay": return groundOverlayLayer;
    case "wildgrass": return wildgrassLayer;
    case 4: return upperLayer;
    case 5: return wallLayer;
    case 6: return ceilingLayer;
    default: return objectLayer;
  }
}

function getLayerItemId(layer, col, row) {
  const id = layer.get(tileKey(col, row));
  return id === undefined ? null : id;
}

// Computes the FULL rectangle of tiles a `multiTileFootprint` item's art
// visually covers, anchored the same bottom-center way drawGroundItemAt()
// (camera.js) actually draws it — every tile, not just the ones that end
// up colliding. Shared by getObjectFootprintBlockedTiles() below (which
// then drops `footprintExcludeBackRows` off the back) and by the
// placement-preview highlight (camera.js's drawPlacementRange()), which
// shows the WHOLE consumed area so the person holding it can see exactly
// how many 16x16 tiles the building will take up before committing to it.
function getMultiTileFootprintRect(type, placedCol, placedRow) {
  const def = itemDefs[type];
  const icon = def.icon;
  // ROUNDED tile counts, not a raw floor(leftEdge)/ceil(rightEdge) "touch
  // any pixel" span — that touch-based version over-counted by 1-2 whole
  // tiles per request ("sakto lang sa mismong tiles 16x16... sobra yung
  // collisions"): e.g. tavern/abandonHouse are 182px = 11.375 tiles wide, but
  // flooring/ceiling their continuous edges touched 13 discrete tile
  // columns (2 more than the art's real ~11-tile size), because a
  // fractional half-width straddling a tile-center anchor can clip into
  // an extra column on each side. Rounding to the nearest whole tile
  // count first, then centering THAT many tiles as evenly as possible,
  // stays within half a tile of the real art on every edge instead.
  //
  // `footprintWidthTiles`/`footprintHeightTiles` (optional, per item):
  // a hand-picked override for the rounded count above, for nudging one
  // specific item's footprint a tile wider/narrower without touching the
  // shared math everything else still auto-derives from. Not set on
  // anything by default — tavern/abandonHouse currently rely on the automatic
  // rounding (11x11).
  const widthTiles = def.footprintWidthTiles || Math.round(icon.width / TILE);
  const heightTiles =
    def.footprintHeightTiles || Math.round(icon.height / TILE);
  // Centered on the placement tile's center (placedCol + 0.5), same
  // anchor drawGroundItemAt() (camera.js) actually draws at. For an ODD
  // widthTiles this lands exactly even (N/2 tiles each side of
  // placedCol); for an EVEN one, perfectly even is impossible against a
  // tile-CENTER anchor, so the one extra tile falls on the right —
  // unavoidable, and off by at most half a tile either way.
  const leftCol = placedCol - Math.floor((widthTiles - 1) / 2);
  const rightCol = leftCol + widthTiles - 1;
  const bottomRow = placedRow; // the art's bottom edge is flush with the placement tile's bottom
  const topRow = bottomRow - heightTiles + 1; // topmost row of the footprint = the "back" — single-sided, no centering ambiguity
  return { leftCol, rightCol, topRow, bottomRow };
}

// Every tile in that rectangle, as a flat list — the preview highlight
// wants all of them (collide or not); getObjectFootprintBlockedTiles()
// below wants only the colliding subset.
function getMultiTileFootprintTiles(type, placedCol, placedRow) {
  const r = getMultiTileFootprintRect(type, placedCol, placedRow);
  const tiles = [];
  for (let row = r.topRow; row <= r.bottomRow; row++) {
    for (let col = r.leftCol; col <= r.rightCol; col++)
      tiles.push({ col, row });
  }
  return tiles;
}

// Which tiles a placed OBJECT-layer item actually blocks, given the tile
// it was placed on. Three modes:
//   - default (trees, the big/medium stones): exactly the one placement
//     tile, no matter how much bigger the art is drawn — per request.
//   - `multiTileFootprint: true` (the house skins): derives the blocked
//     area from getMultiTileFootprintRect() above, then excludes
//     `footprintExcludeBackRows` rows counting from the BACK of that
//     footprint (the far edge from the placement tile) — the house
//     blocks its footprint except for a couple of walkable rows at the
//     back.
//   - `fixedFootprint: { leftTiles, rightTiles, heightTiles }`
//     (treeBigOrange / treeBigCutStump): an exact, hand-picked tile count
//     instead of one derived from the art's real pixel size, with the
//     left and right side counted SEPARATELY rather than one centered
//     width — the big tree's footprint isn't symmetric (2 tiles to the
//     left of the placement column, the column itself, 1 tile to the
//     right — 4 tiles total, per request). `heightTiles` extends upward
//     from the placement row the same way `multiTileFootprint`'s height
//     does (the placement row is always the bottom/front row). Used
//     instead of `multiTileFootprint` here because the big tree's real
//     pixel width (~7 tiles for the living tree, ~4 for its stump) reads
//     differently than it looks in play, and isn't centered on the trunk
//     anyway — a fixed, hand-tuned, independently-sided count matches
//     what it actually looks like instead of the literal source art
//     bounds.
// Per-tile opacity check for `multiTileFootprint` items — per request
// ("di accurate yung collisions"), a plain rectangular tile-footprint
// blocks every tile in its bounding box even where the art itself is
// fully transparent there (e.g. the Fence's open corner gaps: its 80x80
// art is a 5x5-tile bounding box, but a big chunk of the middle is
// genuinely empty — two fence pieces meant to be placed apart and
// connected by nothing). Samples the icon's actual pixel alpha for each
// tile cell of the footprint rect (via an offscreen canvas) so only
// cells with real, visible pixels end up blocked — same "don't count
// empty deadspace" idea the object-fade system already uses for
// occlusion (getObjectMask(), camera.js), just applied to collision
// instead of visual fade. Computed once per type and cached, since an
// item's own art never changes at runtime.
const FOOTPRINT_OPACITY_CACHE = new Map(); // type -> Set of "i,j" (footprint-local tile indices, 0-indexed from the top-left) that have real pixels

function computeFootprintOpacityGrid(type) {
  if (FOOTPRINT_OPACITY_CACHE.has(type)) return FOOTPRINT_OPACITY_CACHE.get(type);
  const def = itemDefs[type];
  const icon = def.icon;
  const widthTiles = def.footprintWidthTiles || Math.round(icon.width / TILE);
  const heightTiles = def.footprintHeightTiles || Math.round(icon.height / TILE);
  // The icon's own left/top edge relative to the footprint grid's
  // left/top edge, in icon-space px — same centering
  // getMultiTileFootprintRect()/drawObjectLayerItem() (camera.js) both
  // already use. Independent of where the item is actually placed
  // (placedCol/placedRow cancel out of the math), so this is safe to
  // compute once per type and cache alongside the pixel data.
  // `artRoot` shifts where the art is actually DRAWN relative to its tile
  // (see objectArtRect(), js/camera.js) — benchHorizontal uses it to sit
  // squarely on its four tiles instead of half a tile left of them. The
  // sampling below has to move with it, or collision would be read off
  // the art in a place the art is no longer in.
  const root = def.artRoot || { x: 0, y: 0 };
  const offsetX = 0.5 * TILE + Math.floor((widthTiles - 1) / 2) * TILE - icon.width / 2 - root.x;
  const offsetY = TILE * heightTiles - icon.height - root.y;

  const solid = new Set();
  try {
    const c = document.createElement("canvas");
    c.width = icon.width;
    c.height = icon.height;
    const cx = c.getContext("2d");
    cx.drawImage(icon, 0, 0);
    const data = cx.getImageData(0, 0, icon.width, icon.height).data;
    for (let j = 0; j < heightTiles; j++) {
      const py0 = Math.max(0, Math.floor(j * TILE - offsetY));
      const py1 = Math.min(icon.height, Math.ceil((j + 1) * TILE - offsetY));
      for (let i = 0; i < widthTiles; i++) {
        const px0 = Math.max(0, Math.floor(i * TILE - offsetX));
        const px1 = Math.min(icon.width, Math.ceil((i + 1) * TILE - offsetX));
        let opaque = false;
        for (let y = py0; y < py1 && !opaque; y++) {
          for (let x = px0; x < px1; x++) {
            if (data[(y * icon.width + x) * 4 + 3] > 0) {
              opaque = true;
              break;
            }
          }
        }
        if (opaque) solid.add(i + "," + j);
      }
    }
  } catch (e) {
    // Canvas pixel read failed (e.g. opened via file:// without a local
    // server, which taints the canvas) — fall back to the old behavior,
    // the whole rectangle solid, rather than breaking collision entirely.
    for (let j = 0; j < heightTiles; j++)
      for (let i = 0; i < widthTiles; i++) solid.add(i + "," + j);
  }
  FOOTPRINT_OPACITY_CACHE.set(type, solid);
  return solid;
}

// Called from isTileBlocked() (js/player.js) for every colliding object,
// so a candidate move tile can be checked against footprints anchored at
// a different tile than the one being tested.
function getObjectFootprintBlockedTiles(type, placedCol, placedRow) {
  const def = itemDefs[type];
  if (!def.collides) return [];

  if (def.fixedFootprint) {
    const {
      leftTiles = 0,
      rightTiles = 0,
      heightTiles = 1,
    } = def.fixedFootprint;
    const topRow = placedRow - heightTiles + 1;
    const blocked = [];
    for (let row = topRow; row <= placedRow; row++) {
      for (
        let col = placedCol - leftTiles;
        col <= placedCol + rightTiles;
        col++
      ) {
        blocked.push({ col, row });
      }
    }
    return blocked;
  }

  if (!def.multiTileFootprint) {
    // A standalone span-door (Door (A)/(B)/(C) with `interior.
    // doorSpanCols`, e.g. doorPlain3/"Door (C)") — a 3x3 footprint
    // (doorSpanCols x doorSpanRows) anchored bottom-center on its
    // placement tile, same as its art. Only the two SIDE columns are
    // solid; the CENTER column (all rows) is deliberately left OUT of
    // the blocked list — a real doorway you walk THROUGH, not a wall.
    // See itemDefs' comment on doorPlain3 for why, and
    // checkInteriorEntry()/checkIndoorWarpDoor() (interior.js) for what
    // detects the player reaching that open center column.
    if (def.interior && def.interior.doorSpanCols) {
      const cols = def.interior.doorSpanCols;
      const rows = def.interior.doorSpanRows || 1;
      const halfCols = Math.floor(cols / 2); // e.g. cols=3 -> 1 tile on each side of placedCol
      const blocked = [];
      for (let r = 0; r < rows; r++) {
        const row = placedRow - (rows - 1) + r; // rows run from placedRow-(rows-1) up through placedRow
        for (let c = 0; c < cols; c++) {
          const col = placedCol - halfCols + c;
          if (col === placedCol) continue; // the center column — walkable
          blocked.push({ col, row });
        }
      }
      return blocked;
    }
    return [{ col: placedCol, row: placedRow }];
  }

  const r = getMultiTileFootprintRect(type, placedCol, placedRow);
  const excludeBackRows = def.footprintExcludeBackRows || 0;
  // `interior` (js/interior.js): the door tile is now SOLID too, same as
  // the rest of the footprint — per request, matching tavern/abandonHouse's
  // `wallColliderPx` doors ("lagyan lang ng collisions parang sa tavern
  // at abandonHouse na door"). It's no longer carved out here; entry is instead
  // detected by CONTACT against this tile from just outside it — see
  // isTouchingTileDoor() below and its use in checkInteriorEntry()
  // (interior.js) — so the door still feels walk-in-able even though the
  // tile itself blocks like a wall.
  const opacityGrid = computeFootprintOpacityGrid(type);

  const blocked = [];
  for (let row = r.topRow; row <= r.bottomRow; row++) {
    const j = row - r.topRow;
    if (j < excludeBackRows) continue; // back rows (roof/far side) stay walkable
    for (let col = r.leftCol; col <= r.rightCol; col++) {
      const i = col - r.leftCol;
      if (!opacityGrid.has(i + "," + j)) continue; // the art itself is empty here — per request, don't block deadspace
      blocked.push({ col, row });
    }
  }
  return blocked;
}

// `wallColliderPx: { left, right }` (tavern/abandonHouse): sub-tile, pixel-
// accurate side walls. The whole-tile footprint above can't match these
// houses' side walls — they sit 2px inside a tile column on each side
// (the art is centered on the placement tile's CENTER and the walls are
// 11.25 tiles wide) — so for these items the player/NPC body is tested
// against this world-space rectangle instead of the tile list:
//   - minX/maxX: the real wall columns (`left`/`right`, in art pixels),
//     placed with the exact same bottom-center anchor drawGroundItemAt()
//     (camera.js) draws the icon with, so collision and art can't drift.
//   - minY/maxY: whole tile rows, same as before — the footprint rows
//     minus `footprintExcludeBackRows` at the back.
//   - door: the `interior.doorOffset` tile, walkable (see
//     isBlockedByHouseWalls()), so checkInteriorEntry() can still fire.
function getHouseWallRect(type, placedCol, placedRow) {
  const def = itemDefs[type];
  const artLeft = (placedCol + 0.5) * TILE - def.icon.width / 2;
  const r = getMultiTileFootprintRect(type, placedCol, placedRow);
  return {
    minX: artLeft + def.wallColliderPx.left,
    maxX: artLeft + def.wallColliderPx.right,
    minY: (r.topRow + (def.footprintExcludeBackRows || 0)) * TILE,
    maxY: (r.bottomRow + 1) * TILE,
    doorCol: def.interior ? placedCol + def.interior.doorOffset.col : null,
    doorRow: def.interior ? placedRow + def.interior.doorOffset.row : null,
  };
}

// Would a character whose feet are at world (x, feetY) be inside this
// house's walls? The feet are treated as a horizontal segment
// BODY_COLLISION_HALF_W wide on each side (config.js — the character's
// real visible body width), not a single point: with a point, the body
// always slid half its width into a side wall before the point itself
// reached it. Just touching the wall edge is allowed (strict overlap).
// The door tile is now SOLID too, same as the rest of the wall — per
// request ("kahit lagyan na lang din ng collisions... makakapasok
// parin... kasi sa loob e"): the door should feel like a real door you
// bump into, not an open gap you can just stroll through. Entry still
// works because checkInteriorEntry() (interior.js) no longer waits for
// the feet to land inside the door tile (impossible now that it's
// solid) — it fires the instant the player is stopped flush against the
// door's own spot, via isTouchingHouseDoor() below, which shares this
// same wall rect.
function isBlockedByHouseWalls(type, placedCol, placedRow, x, feetY) {
  const w = getHouseWallRect(type, placedCol, placedRow);
  if (feetY < w.minY || feetY >= w.maxY) return false;
  if (x + BODY_COLLISION_HALF_W <= w.minX || x - BODY_COLLISION_HALF_W >= w.maxX) return false;
  return true;
}

// True once the player's feet are pressed right up against the door's
// own column of the front wall — i.e. exactly the spot a solid door
// would stop them at. Doesn't require the feet to be INSIDE the door
// tile (isBlockedByHouseWalls now prevents that entirely); a few px of
// slack (DOOR_TOUCH_SLACK_PX) covers sweepBodyTo()'s binary-search
// landing short of the exact wall line by a sub-pixel amount.
const DOOR_TOUCH_SLACK_PX = 3;
function isTouchingHouseDoor(type, placedCol, placedRow, x, feetY) {
  const w = getHouseWallRect(type, placedCol, placedRow);
  if (w.doorCol === null) return false;
  if (Math.floor(x / TILE) !== w.doorCol) return false;
  return Math.abs(feetY - w.maxY) <= DOOR_TOUCH_SLACK_PX;
}

// Counterpart to isTouchingHouseDoor() above, for multiTileFootprint
// houses WITHOUT `wallColliderPx` (house) — its door is now a single
// whole tile blocked the same plain way as the rest of the footprint
// (getObjectFootprintBlockedTiles() above), not a pixel-accurate wall
// rect, so movement just stops the player flush against the tile
// boundary immediately south of the door (row doorRow+1) instead of ever
// landing on it. "Touching" is therefore the same idea as
// isTouchingHouseDoor(): standing in the door's column, feet within a
// few px of that shared boundary line.
function isTouchingTileDoor(doorCol, doorRow, x, feetY) {
  if (doorCol === null) return false;
  if (Math.floor(x / TILE) !== doorCol) return false;
  const boundaryY = (doorRow + 1) * TILE; // door tile's south edge == the tile below's north edge
  return Math.abs(feetY - boundaryY) <= DOOR_TOUCH_SLACK_PX;
}

// (The old sub-pixel "touching" check for a standalone span-door was
// removed here — now that the door has real depth (doorSpanRows) with a
// walkable center column, entry/warp detection just checks the
// player's tile position directly against that center column instead;
// see checkInteriorEntry()/checkIndoorWarpDoor(), interior.js.)

// Would this object, placed/finished at (col,row), end up colliding with
// the spot the player is standing on right now? Used by the "don't trap
// the player" checks below (canPlaceHouseFootprint(),
// updateConstructions()). wallColliderPx houses use the same precise
// test the player's movement does — the tile list would miss the 2px of
// wall that pokes into the neighbouring column on each side.
function wouldObjectTrapPlayer(type, col, row) {
  if (itemDefs[type].wallColliderPx) {
    const feetY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
    return isBlockedByHouseWalls(type, col, row, player.x, feetY);
  }
  const playerTile = getPlayerTile();
  return getObjectFootprintBlockedTiles(type, col, row).some(
    (t) => t.col === playerTile.col && t.row === playerTile.row,
  );
}

// registry of placeable item types -> which asset image represents them.
// `id` is the item's unique identifier (used to tell items apart when
// deciding whether a ground tile can be replaced — see placeHeldItemAt).
// It's the same string as the object's own key, kept explicit so other
// code compares `itemDefs[x].id` rather than assuming the key is the id.
//
// `collides: true` means the placed item blocks player movement (see
// isTileBlocked() in js/player.js and getObjectFootprintBlockedTiles()
// below) — set on trees, the two big stones, and the house. By DEFAULT
// this blocks exactly the single tile the item was placed on, regardless
// of how much bigger its art is drawn (trees/stones, per request). The
// house is the one exception: see `multiTileFootprint` below.
//
// `multiTileFootprint: true` (house only) — instead of the single-tile
// default above, the blocked area is computed from the item's actual
// drawn footprint (its icon size in tiles, same bottom-center-anchored
// math as drawGroundItemAt() in camera.js), so the collision matches what
// a multi-tile building actually looks like on screen. Combined with
// `footprintExcludeBackRows` (also house only): that many rows counting
// from the BACK of the footprint (the far/top edge, away from the
// placement tile) are excluded from collision — per request, the house
// blocks its footprint except for 2 walkable rows at the back.
//
// `unlimited: true` means this item's stack never runs out: holding and
// placing it doesn't decrement its count or ever auto-unhold from running
// out (see placeHeldItemAt() below). This is a deliberate "for now" flag on
// every item (not a removal of the stacking/count feature — that logic is
// all still here and works normally for anything without this flag) so
// testing/building isn't limited by counts yet.
// `flat: true` marks a ground-level decal with no real height — it's
// drawn as pure terrain decoration, always beneath the player and every
// non-flat item, and never takes part in depth/Y-sorting (see
// renderWorldObjectsSorted() in camera.js) or in placement/collision
// checks against non-flat items (see layerForType() above) — a tree can
// be placed on top of a ground tile without disturbing it, and vice
// versa. Only the ground tileset and the flora scatter are flat; stones,
// trees, and the house have real presence and get sorted/placed on the
// separate object layer.
//
// `equipSlot: "weapon"` + `weapon: { attackAnim }` mark an item as a real
// equippable weapon (see equipWeapon()/player.equippedWeapon below).
// Clicking it (inventory or hotbar) equips it directly — see
// useOrHoldSlot() — and the Equipment screen (G key) offers the same via
// its weapon slot. Not drawn on the character in-world (removed per
// request); pressing F plays `attackAnim` when swinging at nothing, but
// a harvestable stone/tree in range always uses ITS OWN
// `resource.breakAnim` instead — see the F-key handling in js/player.js.
// Either way that hit still counts toward breaking the resource
// (resolveHarvestHit(), js/resources.js); the animation choice never
// affects the hit-counting mechanic.
const itemDefs = {
  // Renamed from "Grass" to "Ground" per request — these are the base
  // terrain tiles (moved into assets/items/tile/, see assets.js) that
  // everything else gets placed on top of, not just a grass decoration.
  grass: {
    id: "grass",
    name: "Ground",
    icon: assets.grass,
    unlimited: true,
    flat: true,
  },
  grassTL: {
    id: "grassTL",
    name: "Ground (Top-Left)",
    icon: assets.grassTL,
    unlimited: true,
    flat: true,
  },
  grassTC: {
    id: "grassTC",
    name: "Ground (Top)",
    icon: assets.grassTC,
    unlimited: true,
    flat: true,
  },
  grassTR: {
    id: "grassTR",
    name: "Ground (Top-Right)",
    icon: assets.grassTR,
    unlimited: true,
    flat: true,
  },
  grassL: {
    id: "grassL",
    name: "Ground (Left)",
    icon: assets.grassL,
    unlimited: true,
    flat: true,
  },
  grassInner: {
    id: "grassInner",
    name: "Ground (Inner)",
    icon: assets.grassInner,
    unlimited: true,
    flat: true,
  },
  grassR: {
    id: "grassR",
    name: "Ground (Right)",
    icon: assets.grassR,
    unlimited: true,
    flat: true,
  },
  grassBL: {
    id: "grassBL",
    name: "Ground (Bottom-Left)",
    icon: assets.grassBL,
    unlimited: true,
    flat: true,
  },
  grassBC: {
    id: "grassBC",
    name: "Ground (Bottom)",
    icon: assets.grassBC,
    unlimited: true,
    flat: true,
  },
  grassBR: {
    id: "grassBR",
    name: "Ground (Bottom-Right)",
    icon: assets.grassBR,
    unlimited: true,
    flat: true,
  },

  // --- dirt terrain tiles, also added as placeable inventory items per
  // request — same 3 variants world.js randomly tiles the map's
  // background with (assets/items/tile/dirt1-3.png). `layer: "terrain"`
  // puts these (and Water below) on their own base layer, UNDER the
  // Ground tileset/Port tiles above — per request ("dirt, water first
  // layer, second layer grass, port") — so placing Dirt/Water never
  // erases a Ground/Port tile on the same spot, and vice versa.
  dirt1: {
    id: "dirt1",
    name: "Dirt 1",
    icon: assets.dirt1,
    unlimited: true,
    flat: true,
    layer: "terrain",
  },
  dirt2: {
    id: "dirt2",
    name: "Dirt 2",
    icon: assets.dirt2,
    unlimited: true,
    flat: true,
    layer: "terrain",
  },
  dirt3: {
    id: "dirt3",
    name: "Dirt 3",
    icon: assets.dirt3,
    unlimited: true,
    flat: true,
    layer: "terrain",
  },

  // --- port/island 5x5 tileset — a land/water edge-and-corner set (like
  // the Ground tileset's 3x3, just a full 5x5) for building coastline
  // shapes. Still `flat: true` (drawn beneath everything, same rendering
  // as every other ground tile), but most tiles here COLLIDE too, per
  // request ("lagyan mo ng collision each tile lang") — the default
  // single-tile footprint (no `fixedFootprint`), same as a plain Medium
  // Stone. This is why isTileBlocked() (player.js) checks every layer
  // now, not just objectLayer — these are the first `groundLayer` items
  // that actually block movement.
  // EXCEPTION, per follow-up request: `portI1`/`portI2`/`portI6` (three
  // of the plain "inner" tiles) do NOT collide — walkable, like the rest
  // of the ground tileset.
  // 5 of the original 25 grid cells were pixel-identical duplicates and
  // were dropped rather than kept as redundant items: `port_bl` (matched
  // plain water — nothing distinguishing at that grid position),
  // `port_i5`/`port_i8` (matched `port_i2` — the tileset's plain-inner
  // tiles repeat), `port_l1` (matched `port_tc1`), `port_r1` (matched
  // `port_tc3`) — the last two apparently reused the same edge art on a
  // different side.
  portTL: {
    id: "portTL",
    name: "Port (Top-Left)",
    icon: assets.portTL,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portTC1: {
    id: "portTC1",
    name: "Port (Top 1)",
    icon: assets.portTC1,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portTC2: {
    id: "portTC2",
    name: "Port (Top 2)",
    icon: assets.portTC2,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portTC3: {
    id: "portTC3",
    name: "Port (Top 3)",
    icon: assets.portTC3,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portTR: {
    id: "portTR",
    name: "Port (Top-Right)",
    icon: assets.portTR,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portI1: {
    id: "portI1",
    name: "Port (Inner 1)",
    icon: assets.portI1,
    unlimited: true,
    flat: true,
  },
  portI2: {
    id: "portI2",
    name: "Port (Inner 2)",
    icon: assets.portI2,
    unlimited: true,
    flat: true,
  },
  portI3: {
    id: "portI3",
    name: "Port (Inner 3)",
    icon: assets.portI3,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portL2: {
    id: "portL2",
    name: "Port (Left 2)",
    icon: assets.portL2,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portI4: {
    id: "portI4",
    name: "Port (Inner 4)",
    icon: assets.portI4,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portI6: {
    id: "portI6",
    name: "Port (Inner 6)",
    icon: assets.portI6,
    unlimited: true,
    flat: true,
  },
  portR2: {
    id: "portR2",
    name: "Port (Right 2)",
    icon: assets.portR2,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portL3: {
    id: "portL3",
    name: "Port (Left 3)",
    icon: assets.portL3,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portI7: {
    id: "portI7",
    name: "Port (Inner 7)",
    icon: assets.portI7,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portI9: {
    id: "portI9",
    name: "Port (Inner 9)",
    icon: assets.portI9,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portR3: {
    id: "portR3",
    name: "Port (Right 3)",
    icon: assets.portR3,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portBC1: {
    id: "portBC1",
    name: "Port (Bottom 1)",
    icon: assets.portBC1,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portBC2: {
    id: "portBC2",
    name: "Port (Bottom 2)",
    icon: assets.portBC2,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portBC3: {
    id: "portBC3",
    name: "Port (Bottom 3)",
    icon: assets.portBC3,
    unlimited: true,
    flat: true,
    collides: true,
  },
  portBR: {
    id: "portBR",
    name: "Port (Bottom-Right)",
    icon: assets.portBR,
    unlimited: true,
    flat: true,
    collides: true,
  },

  // --- plain water — random-tiled the same idea as the dirt terrain
  // variants (js/world.js). Only 3 of the original 5 kept — 2 were
  // pixel-identical to the 3rd. `layer: "terrain"` — same base layer as
  // Dirt above (see that comment for why), so it doesn't erase a
  // Ground/Port tile placed on the same spot either.
  water1: {
    id: "water1",
    name: "Water 1",
    icon: assets.water1,
    unlimited: true,
    flat: true,
    layer: "terrain",
  },
  water2: {
    id: "water2",
    name: "Water 2",
    icon: assets.water2,
    unlimited: true,
    flat: true,
    layer: "terrain",
  },
  water3: {
    id: "water3",
    name: "Water 3",
    icon: assets.water3,
    unlimited: true,
    flat: true,
    layer: "terrain",
  },

  // --- decorative flower — moved onto the same "decor" layer as wild
  // grass below, per request ("same lang din wag sa tile napapalitan din
  // kasi yung grass ground") — it used to share groundLayer with the
  // ground tileset, meaning placing a flower over a ground tile could
  // replace it; now it just overlaps, same as wild grass, and gets the
  // same sway + always-behind-the-player treatment from
  // wildgrass.js/camera.js.
  decoFlower1: {
    id: "decoFlower1",
    name: "Flower (Tall)",
    icon: assets.decoFlower1,
    unlimited: true,
    flat: true,
    layer: "decor",
    castsLightShadow: true,
  },
  decoFlower2: {
    id: "decoFlower2",
    name: "Flower (Short)",
    icon: assets.decoFlower2,
    unlimited: true,
    flat: true,
    layer: "decor",
    castsLightShadow: true,
  },

  // --- wild grass — renamed from "decoGrass"/"Grass Tuft" per request,
  // and moved to its OWN layer (`layer: "decor"`, see layerForType()
  // above and decorLayer in js/wildgrass.js) instead of sharing
  // groundLayer with the ground tileset — placing wild grass no longer
  // replaces the ground tile underneath it, the same way stones/trees on
  // objectLayer already just overlap the ground instead of replacing it.
  // Still `flat: true` for collision purposes (no collision either way);
  // `layer: "decor"` is what actually redirects it to decorLayer.
  // Rendered specially (sway + always-behind-the-player) by
  // wildgrass.js/camera.js, not the plain drawGroundItemAt() the ground
  // tileset uses — see drawPlayerStandingDecor(), camera.js.
  wildGrass1: {
    id: "wildGrass1",
    name: "Wild Grass 1",
    icon: assets.wildGrass1,
    unlimited: true,
    flat: true,
    layer: "decor",
  },
  wildGrass2: {
    id: "wildGrass2",
    name: "Wild Grass 2",
    icon: assets.wildGrass2,
    unlimited: true,
    flat: true,
    layer: "decor",
  },
  wildGrass3: {
    id: "wildGrass3",
    name: "Wild Grass 3",
    icon: assets.wildGrass3,
    unlimited: true,
    flat: true,
    layer: "decor",
  },
  wildGrass4: {
    id: "wildGrass4",
    name: "Wild Grass 4",
    icon: assets.wildGrass4,
    unlimited: true,
    flat: true,
    layer: "decor",
  },
  wildGrass5: {
    id: "wildGrass5",
    name: "Wild Grass 5",
    icon: assets.wildGrass5,
    unlimited: true,
    flat: true,
    layer: "decor",
  },
  wildGrass6: {
    id: "wildGrass6",
    name: "Wild Grass 6",
    icon: assets.wildGrass6,
    unlimited: true,
    flat: true,
    layer: "decor",
  },
  wildGrass7: {
    id: "wildGrass7",
    name: "Wild Grass 7",
    icon: assets.wildGrass7,
    unlimited: true,
    flat: true,
    layer: "decor",
  },
  wildGrass8: {
    id: "wildGrass8",
    name: "Wild Grass 8",
    icon: assets.wildGrass8,
    unlimited: true,
    flat: true,
    layer: "decor",
  },

  // --- stones. Three tiers are harvestable resource nodes (Crush
  // animation, F key, see js/resources.js), same idea as the trees:
  // hitting one 3 times breaks it, grants Stone Chunks (more for a
  // bigger stone — 5/3/2 for Big/Medium/Small, mirroring the trees'
  // 5/3/2 big/thin/tiny wood amounts), and the same stone respawns on
  // its own tile 5 real minutes later.
  stoneBig: {
    id: "stoneBig",
    name: "Big Stone",
    icon: assets.stoneBig,
    collides: true,
    unlimited: true,
    fixedFootprint: { leftTiles: 1, rightTiles: 1, heightTiles: 1 },
    fadeBoundingBoxOnly: true,
    resource: {
      hitsToBreak: 3,
      breakAnim: "crush",
      dropItem: "stoneChunk",
      dropAmount: 5,
      respawnMinutes: 5,
    },
  },
  stoneMedium: {
    id: "stoneMedium",
    name: "Medium Stone",
    icon: assets.stoneMedium,
    collides: true,
    unlimited: true,
    fadeBoundingBoxOnly: true,
    resource: {
      hitsToBreak: 3,
      breakAnim: "crush",
      dropItem: "stoneChunk",
      dropAmount: 3,
      respawnMinutes: 5,
    },
  },
  stoneSmall: {
    id: "stoneSmall",
    name: "Small Stone",
    icon: assets.stoneSmall,
    collides: true,
    unlimited: true,
    noOcclusionFade: true,
    resource: {
      hitsToBreak: 3,
      breakAnim: "crush",
      dropItem: "stoneChunk",
      dropAmount: 2,
      respawnMinutes: 5,
    },
  },
  // XS Stone: collides (1 tile, the default rule) but isn't a harvestable
  // resource — just a solid obstacle, no `resource` config.
  stoneXS: {
    id: "stoneXS",
    name: "XS Stone",
    icon: assets.stoneXS,
    collides: true,
    unlimited: true,
    noOcclusionFade: true,
  },
  // XXS Stone and the Pebbles below: no collision, and `flat: true` so
  // they sit in groundLayer like the ground tileset — always drawn
  // beneath the player, so walking over one always shows the character
  // on top of it, instead of the dynamic Y-sort objectLayer items use
  // (which could put a tiny flat pebble in front of the player depending
  // on relative position — not what a ground-level pebble should do).
  stoneXXS: {
    id: "stoneXXS",
    name: "XXS Stone",
    icon: assets.stoneXXS,
    unlimited: true,
    flat: true,
    layer: "decor",
    noSway: true,
    noOcclusionFade: true,
  },
  stoneDecor1: {
    id: "stoneDecor1",
    name: "Pebbles 1",
    icon: assets.stoneDecor1,
    unlimited: true,
    flat: true,
    layer: "decor",
    noSway: true,
    noOcclusionFade: true,
  },
  stoneDecor2: {
    id: "stoneDecor2",
    name: "Pebbles 2",
    icon: assets.stoneDecor2,
    unlimited: true,
    flat: true,
    layer: "decor",
    noSway: true,
    noOcclusionFade: true,
  },
  stoneDecor3: {
    id: "stoneDecor3",
    name: "Pebbles 3",
    icon: assets.stoneDecor3,
    unlimited: true,
    flat: true,
    layer: "decor",
    noSway: true,
    noOcclusionFade: true,
  },
  stoneDecor4: {
    id: "stoneDecor4",
    name: "Pebbles 4",
    icon: assets.stoneDecor4,
    unlimited: true,
    flat: true,
    layer: "decor",
    noSway: true,
    noOcclusionFade: true,
  },
  stoneDecor5: {
    id: "stoneDecor5",
    name: "Pebbles 5",
    icon: assets.stoneDecor5,
    unlimited: true,
    flat: true,
    layer: "decor",
    noSway: true,
    noOcclusionFade: true,
  },
  // Dropped by harvesting a stone — a plain inventory resource, not
  // really meant to be placed as decor, but there's no separate
  // "non-placeable" category in this system yet so it's just a normal
  // (flat, so it's harmless if placed) item like everything else.
  stoneChunk: {
    id: "stoneChunk",
    name: "Stone Chunk",
    icon: assets.stoneSmall,
    unlimited: true,
    flat: true,
  },

  // --- trees (leafless/cut + green/orange leafed variants) — all collide, all sorted ---
  // The bare/cut stumps below are also what a living tree gets replaced
  // with once harvested (see `resource.replaceWith` further down) — and
  // now, per request, they're harvestable themselves: 2 hits (not 3, and
  // not `dropItem` like stones) with Slice clears the tile completely,
  // and after 5 minutes a tree grows back. For the three cut stumps that
  // regrowth is the matching LIVING tree (`respawnAs`), completing the
  // living -> stump -> empty -> living cycle; the two bare/noLeaves trees
  // have no separate living form, so they just regrow as themselves
  // (`respawnAs` omitted — see resolveHarvestHit(), resources.js).
  // NOTE: both treeThinGreen and treeThinOrange share treeThinCutStump as
  // their stump, so which one it regrows into is a judgment call — chose
  // treeThinGreen; change `respawnAs` here if the orange one is meant.
  treeBigCutStump: {
    id: "treeBigCutStump",
    name: "Big Tree Stump",
    icon: assets.treeBigCutStump,
    collides: true,
    unlimited: true,
    fixedFootprint: { leftTiles: 2, rightTiles: 1, heightTiles: 1 },
    resource: {
      hitsToBreak: 2,
      breakAnim: "slice",
      respawnMinutes: 5,
      respawnAs: "treeBigOrange",
      dropItem: "woodLog",
      dropAmount: 3,
    },
  },
  treeThinCutStump: {
    id: "treeThinCutStump",
    name: "Thin Tree Stump",
    icon: assets.treeThinCutStump,
    collides: true,
    unlimited: true,
    resource: {
      hitsToBreak: 2,
      breakAnim: "slice",
      respawnMinutes: 5,
      respawnAs: "treeThinGreen",
      dropItem: "woodLog",
      dropAmount: 2,
    },
  },
  treeThinNoLeaves1: {
    id: "treeThinNoLeaves1",
    name: "Bare Tree 1",
    icon: assets.treeThinNoLeaves1,
    collides: true,
    unlimited: true,
    resource: {
      hitsToBreak: 3,
      breakAnim: "slice",
      respawnMinutes: 5,
      dropItem: "woodLog",
      dropAmount: 2,
    },
  },
  treeThinNoLeaves2: {
    id: "treeThinNoLeaves2",
    name: "Bare Tree 2",
    icon: assets.treeThinNoLeaves2,
    collides: true,
    unlimited: true,
    resource: {
      hitsToBreak: 3,
      breakAnim: "slice",
      respawnMinutes: 5,
      dropItem: "woodLog",
      dropAmount: 2,
    },
  },
  treeTinyCutStump: {
    id: "treeTinyCutStump",
    name: "Tiny Tree Stump",
    icon: assets.treeTinyCutStump,
    collides: true,
    unlimited: true,
    resource: {
      hitsToBreak: 2,
      breakAnim: "slice",
      respawnMinutes: 5,
      respawnAs: "treeTinyGreen",
      dropItem: "woodLog",
      dropAmount: 1,
    },
  },
  // Harvestable (living) trees: 3 hits with the Slice animation (F key)
  // permanently replaces the tile with its matching stump — named by the
  // same convention the source pack used ("thintree" -> "thincutted",
  // per request), no respawn. Unlike stones, cutting a tree doesn't grant
  // anything right now (not asked for) — just the visual/tile change.
  treeThinGreen: {
    id: "treeThinGreen",
    name: "Thin Tree (Green)",
    icon: assets.treeThinGreen,
    collides: true,
    unlimited: true,
    resource: {
      hitsToBreak: 3,
      breakAnim: "slice",
      replaceWith: "treeThinCutStump",
      dropItem: "woodLog",
      dropAmount: 3,
    },
  },
  treeTinyGreen: {
    id: "treeTinyGreen",
    name: "Tiny Tree (Green)",
    icon: assets.treeTinyGreen,
    collides: true,
    unlimited: true,
    resource: {
      hitsToBreak: 3,
      breakAnim: "slice",
      replaceWith: "treeTinyCutStump",
      dropItem: "woodLog",
      dropAmount: 2,
    },
  },
  treeBigOrange: {
    id: "treeBigOrange",
    name: "Big Tree (Orange)",
    icon: assets.treeBigOrange,
    collides: true,
    unlimited: true,
    fixedFootprint: { leftTiles: 2, rightTiles: 1, heightTiles: 1 },
    resource: {
      hitsToBreak: 3,
      breakAnim: "slice",
      replaceWith: "treeBigCutStump",
      dropItem: "woodLog",
      dropAmount: 5,
    },
  },
  treeThinOrange: {
    id: "treeThinOrange",
    name: "Thin Tree (Orange)",
    icon: assets.treeThinOrange,
    collides: true,
    unlimited: true,
    resource: {
      hitsToBreak: 3,
      breakAnim: "slice",
      replaceWith: "treeThinCutStump",
      dropItem: "woodLog",
      dropAmount: 3,
    },
  },

  // `fadeOnlyWhenBehind` (camera.js shouldFadeForOcclusion()): the house
  // only turns see-through when the character is actually BEHIND it (feet
  // hidden behind the roof/back wall), never for standing beside a wall.
  // --- house — collides, but as a multi-tile footprint with its back
  // rows excluded (see getObjectFootprintBlockedTiles() below), not the
  // single-tile rule every other collider uses.
  house: {
    id: "house",
    name: "House",
    icon: assets.house,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
    footprintExcludeBackRows: 2,
    fadeOnlyWhenBehind: true,
    buildSeconds: 10,
    // House's own interior — the small one-room art (js/interior.js's
    // `smallInterior`). Unlike tavern/abandonHouse this has no `wallColliderPx`
    // pixel-accurate wall rect — its door is a plain whole tile, blocked
    // the same way as the rest of the footprint
    // (getObjectFootprintBlockedTiles(), inventory.js) rather than
    // carved out as walkable, so it feels like a real door you bump into
    // (matches tavern/abandonHouse, per request). Entry is detected by CONTACT
    // against that tile instead: isTouchingTileDoor() (inventory.js),
    // used from checkInteriorEntry() (interior.js).
    //
    // `doorOffset: { col: 0, row: 0 }` means that tile is the placement
    // tile itself, which is exactly right here — the art is 130x126 and
    // drawn bottom-centre anchored, so the placement tile covers art
    // x 57-72, y 110-125: the doorway's threshold, dead centre under the
    // door.
    interior: { roomId: "house_room", doorOffset: { col: 0, row: 0 } },
  },

  // --- wood tools/weapons. 14 are real equippable weapons (`equipSlot` +
  // `weapon.attackAnim` — see the big comment above); the crate/plaque/
  // shields are plain flat decor, no different from the grass tileset.
  // attackAnim mapping is a judgment call based on what each tool visually
  // is, not something the source pack specified: bladed melee -> "hit",
  // thrusting/ranged (rapier, javelin, bow) -> "pierce", chopping (axe,
  // sickle) -> "slice", blunt/mining (pickaxe, mattock, hammer) -> "crush".

  // decor only — not equippable, same treatment as the grass tileset
  woodCrate: {
    id: "woodCrate",
    name: "Wood Crate",
    icon: assets.woodCrate,
    unlimited: true,
    flat: true,
  },
  woodPlaque: {
    id: "woodPlaque",
    name: "Wood Plaque",
    icon: assets.woodPlaque,
    unlimited: true,
    flat: true,
  },
  woodShieldRound: {
    id: "woodShieldRound",
    name: "Wood Shield (Round)",
    icon: assets.woodShieldRound,
    unlimited: true,
    flat: true,
  },
  woodShieldSmall: {
    id: "woodShieldSmall",
    name: "Wood Shield (Small)",
    icon: assets.woodShieldSmall,
    unlimited: true,
    flat: true,
  },
  woodShieldLarge: {
    id: "woodShieldLarge",
    name: "Wood Shield (Large)",
    icon: assets.woodShieldLarge,
    unlimited: true,
    flat: true,
  },

  // --- wood drop materials — granted from chopping trees (see
  // `resource.dropItem`/`dropAmount` on the tree entries below), and the
  // source of the "floating pickup" popup (spawnFloatingPickups(),
  // resources.js). Flat, plain inventory materials — same treatment as
  // stoneChunk.
  woodLog: {
    id: "woodLog",
    name: "Wood Log",
    icon: assets.woodLog,
    unlimited: true,
    flat: true,
  },
  woodPlank: {
    id: "woodPlank",
    name: "Wood Plank",
    icon: assets.woodPlank,
    unlimited: true,
    flat: true,
  },
  woodStick: {
    id: "woodStick",
    name: "Wood Stick",
    icon: assets.woodStick,
    unlimited: true,
    flat: true,
  },
  // ==== added by tools/add_remaining_items.py — bushes, interior/outdoor
  // furniture, vegetables, alt. house skins, extra tree variants. All
  // default to no collision / no footprint design yet (except trees and
  // the two alt. houses, which match their existing siblings) — add
  // `collides: true` / `fixedFootprint` per item later as needed.
  bushBigGreen: {
    id: "bushBigGreen",
    name: "Big Green Bush",
    icon: assets.bushBigGreen,
    unlimited: true,
    castsLightShadow: true,
  },
  bushBigLightGreen: {
    id: "bushBigLightGreen",
    name: "Big Light Green Bush",
    icon: assets.bushBigLightGreen,
    unlimited: true,
    castsLightShadow: true,
  },
  bushBigRed: {
    id: "bushBigRed",
    name: "Big Red Bush",
    icon: assets.bushBigRed,
    unlimited: true,
    castsLightShadow: true,
  },
  bushBigYellow: {
    id: "bushBigYellow",
    name: "Big Yellow Bush",
    icon: assets.bushBigYellow,
    unlimited: true,
    castsLightShadow: true,
  },
  bushMediumGreen: {
    id: "bushMediumGreen",
    name: "Medium Green Bush",
    icon: assets.bushMediumGreen,
    unlimited: true,
    castsLightShadow: true,
  },
  bushMediumLightGreen: {
    id: "bushMediumLightGreen",
    name: "Medium Light Green Bush",
    icon: assets.bushMediumLightGreen,
    unlimited: true,
    castsLightShadow: true,
  },
  bushMediumRed: {
    id: "bushMediumRed",
    name: "Medium Red Bush",
    icon: assets.bushMediumRed,
    unlimited: true,
    castsLightShadow: true,
  },
  bushMediumYellow: {
    id: "bushMediumYellow",
    name: "Medium Yellow Bush",
    icon: assets.bushMediumYellow,
    unlimited: true,
    castsLightShadow: true,
  },
  bushSmallGreen: {
    id: "bushSmallGreen",
    name: "Small Green Bush",
    icon: assets.bushSmallGreen,
    unlimited: true,
    castsLightShadow: true,
  },
  bushSmallLightGreen: {
    id: "bushSmallLightGreen",
    name: "Small Light Green Bush",
    icon: assets.bushSmallLightGreen,
    unlimited: true,
    castsLightShadow: true,
  },
  bushSmallRed: {
    id: "bushSmallRed",
    name: "Small Red Bush",
    icon: assets.bushSmallRed,
    unlimited: true,
    castsLightShadow: true,
  },
  bushSmallYellow: {
    id: "bushSmallYellow",
    name: "Small Yellow Bush",
    icon: assets.bushSmallYellow,
    unlimited: true,
    castsLightShadow: true,
  },
  bushXSGreen: {
    id: "bushXSGreen",
    name: "XS Green Bush",
    icon: assets.bushXSGreen,
    unlimited: true,
    castsLightShadow: true,
  },
  bushXSLightGreen: {
    id: "bushXSLightGreen",
    name: "XS Light Green Bush",
    icon: assets.bushXSLightGreen,
    unlimited: true,
    castsLightShadow: true,
  },
  bushXSRed: {
    id: "bushXSRed",
    name: "XS Red Bush",
    icon: assets.bushXSRed,
    unlimited: true,
    castsLightShadow: true,
  },
  bushXSYellow: {
    id: "bushXSYellow",
    name: "XS Yellow Bush",
    icon: assets.bushXSYellow,
    unlimited: true,
    castsLightShadow: true,
  },
  bushFlowerA: {
    id: "bushFlowerA",
    name: "Flowering Bush (A)",
    icon: assets.bushFlowerA,
    unlimited: true,
    noOcclusionFade: true,
    alwaysBehindPlayer: true,
  },
  bushFlowerB: {
    id: "bushFlowerB",
    name: "Flowering Bush (B)",
    icon: assets.bushFlowerB,
    unlimited: true,
    noOcclusionFade: true,
    alwaysBehindPlayer: true,
  },
  bushFlowerC: {
    id: "bushFlowerC",
    name: "Flowering Bush (C)",
    icon: assets.bushFlowerC,
    unlimited: true,
    noOcclusionFade: true,
    alwaysBehindPlayer: true,
  },
  bushFlowerD: {
    id: "bushFlowerD",
    name: "Flowering Bush (D)",
    icon: assets.bushFlowerD,
    unlimited: true,
    noOcclusionFade: true,
    alwaysBehindPlayer: true,
  },
  bushMushroom1: {
    id: "bushMushroom1",
    name: "Mushroom (A)",
    icon: assets.bushMushroom1,
    unlimited: true,
    noOcclusionFade: true,
    castsLightShadow: true,
  },
  bushMushroom2: {
    id: "bushMushroom2",
    name: "Mushroom (B)",
    icon: assets.bushMushroom2,
    unlimited: true,
    noOcclusionFade: true,
    alwaysBehindPlayer: true,
    castsLightShadow: true,
  },
  leavesFloor: {
    id: "leavesFloor",
    name: "Fallen Leaves (Ground)",
    icon: assets.leavesFloor,
    unlimited: true,
    flat: true,
  },
  treeMediumGreen: {
    id: "treeMediumGreen",
    name: "Medium Tree (Green)",
    icon: assets.treeMediumGreen,
    unlimited: true,
    collides: true,
  },
  treeMediumLightGreen: {
    id: "treeMediumLightGreen",
    name: "Medium Tree (Light Green)",
    icon: assets.treeMediumLightGreen,
    unlimited: true,
    collides: true,
  },
  treeMediumRed: {
    id: "treeMediumRed",
    name: "Medium Tree (Red)",
    icon: assets.treeMediumRed,
    unlimited: true,
    collides: true,
  },
  treeMediumYellow: {
    id: "treeMediumYellow",
    name: "Medium Tree (Yellow)",
    icon: assets.treeMediumYellow,
    unlimited: true,
    collides: true,
  },
  treeMediumGreenTrunk: {
    id: "treeMediumGreenTrunk",
    name: "Medium Trunk (Green)",
    icon: assets.treeMediumGreenTrunk,
    unlimited: true,
    collides: true,
  },
  treeMediumRedYellowTrunk: {
    id: "treeMediumRedYellowTrunk",
    name: "Medium Trunk (Red/Yellow)",
    icon: assets.treeMediumRedYellowTrunk,
    unlimited: true,
    collides: true,
  },
  // `interior` (js/interior.js): walking onto the tile at
  // (placedCol + doorOffset.col, placedRow + doorOffset.row) — normally
  // part of the solid footprint — instead enters the named
  // INTERIOR_ROOMS scene. That one tile is carved out of the blocked
  // list as a walkable door (see getObjectFootprintBlockedTiles() above).
  // Each now points at its OWN layout — tavern_room and abandon_room
  // layout drawn so far (assets/interior/asesprite/interior.ase); give
  // one of them a different `roomId` once a second layout exists.
  // tavern/abandonHouse collision (both PNGs are 192x192 = 12x12 tiles):
  //   - LEFT/RIGHT: pixel-accurate to the real walls via `wallColliderPx`
  //     (see getHouseWallRect() above) — NOT the 16px tile grid. Measured
  //     from both PNGs: the walls run from art column 6 to 186 (180px =
  //     11.25 tiles; the roof eaves overhang a further 4px each side, x
  //     2..190, and aren't solid). Because the art is centered on the
  //     placement tile's CENTER, those wall edges land 2px inside a tile
  //     column on each side, so no whole-tile width could ever match them
  //     — that was why the character still walked into both side walls.
  //   - FRONT/BACK rows: still whole 16x16 tiles from the footprint below
  //     — 12 rows tall (the art's real height), `footprintExcludeBackRows:
  //     5` kept as-is, so the top 5 rows (roof) stay walkable and the
  //     bottom 7 rows block.
  //   - `footprintWidthTiles: 11` is now only the placement preview /
  //     "is this area clear" size: 11 whole tiles is the closest tile fit
  //     to the 11.25-tile walls (2px short on each side, symmetric
  //     around the door).
  tavern: {
    id: "tavern",
    name: "Tavern",
    icon: assets.tavern,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
    footprintWidthTiles: 11,
    footprintHeightTiles: 12,
    footprintExcludeBackRows: 5,
    wallColliderPx: { left: 6, right: 186 },
    fadeOnlyWhenBehind: true,
    buildSeconds: 10,
    interior: { roomId: "tavern_room", doorOffset: { col: 0, row: 0 } },
  },
  abandonHouse: {
    id: "abandonHouse",
    name: "Abandoned House",
    icon: assets.abandonHouse,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
    footprintWidthTiles: 11,
    footprintHeightTiles: 12,
    footprintExcludeBackRows: 5,
    wallColliderPx: { left: 6, right: 186 }, // same wall columns as tavern (measured separately — identical)
    fadeOnlyWhenBehind: true,
    buildSeconds: 10,
    interior: { roomId: "abandon_room", doorOffset: { col: 0, row: 0 } },
  },
  // NOTE: the whole-sheet "Floor (Brown)/(Dark Green)/(Green)" and
  // "Fence" items that used to live here are gone — per request
  // ("may duplicate mga yan sa inventory, erase mo na lang"). They've
  // been replaced by their sliced 16x16 tile families further down
  // (floorBrownTile*/floorDarkGreenTile*/floorGreenTile*/fenceTile*),
  // which cover the same art one placeable tile at a time. Any old
  // save that still has one placed simply drops it on load —
  // applySaveData() (js/save.js) skips types that no longer exist.
  interiorWall: {
    id: "interiorWall",
    name: "Interior Wall",
    icon: assets.interiorWall,
    unlimited: true,
    flat: true,
  },
  ceilingTile: {
    id: "ceilingTile",
    name: "Ceiling",
    icon: assets.ceilingTile,
    unlimited: true,
    flat: true,
  },
  windowPlain1: {
    id: "windowPlain1",
    name: "Window (A)",
    icon: assets.windowPlain1,
    unlimited: true,
    flat: true,
  },
  windowPlain2: {
    id: "windowPlain2",
    name: "Window (B)",
    icon: assets.windowPlain2,
    unlimited: true,
    flat: true,
  },
  windowLight1: {
    id: "windowLight1",
    name: "Lit Window (A)",
    icon: assets.windowLight1,
    unlimited: true,
    flat: true,
    fadeWithDaylight: true,
  },
  windowLight2: {
    id: "windowLight2",
    name: "Lit Window (B)",
    icon: assets.windowLight2,
    unlimited: true,
    flat: true,
    fadeWithDaylight: true,
  },
  windowLight3: {
    id: "windowLight3",
    name: "Lit Window (C)",
    icon: assets.windowLight3,
    unlimited: true,
    flat: true,
    fadeWithDaylight: true,
  },
  doorPlain1: {
    id: "doorPlain1",
    name: "Door (A)",
    icon: assets.doorPlain1,
    unlimited: true,
    flat: true,
  },
  doorPlain2: {
    id: "doorPlain2",
    name: "Door (B)",
    icon: assets.doorPlain2,
    unlimited: true,
    flat: true,
  },
  doorPlain3: {
    id: "doorPlain3",
    name: "Door (C)",
    icon: assets.doorPlain3,
    unlimited: true,
    flat: true,
    // The sprite (assets/particles/inside/door3.png) is 48x48px = a full
    // 3x3 tile grid, not 2x1 — per correction ("di lang pala 2 column
    // yun 3 din... check mo yung png ng mga doors 3x3"). Anchored
    // bottom-center on its placement tile (drawGroundItemAt(), camera.js
    // — same math as everything else in `groundLayer`), the 3x3 spans
    // columns [placedCol-1, placedCol+1] and rows [placedRow-2,
    // placedRow].
    //   - `doorSpanCols`/`doorSpanRows: 3` — the full footprint size.
    //     Only the two SIDE columns are solid (`collides: true` below +
    //     getObjectFootprintBlockedTiles()'s span-door branch,
    //     inventory.js) — the CENTER column (all 3 rows) stays
    //     deliberately walkable, forming a real doorway you walk
    //     THROUGH rather than a wall you're stopped at.
    collides: true,
    // Functions as a real front door for a custom-built house (hand-
    // placed from individual wall/window/door decor pieces, rather than
    // baked into the tavern/abandonHouse multiTileFootprint art) — walking
    // "up" through its center reaches the door's middle tile and enters
    // the shared interior room, same idea as tavern/abandonHouse's door
    // (js/interior.js's checkInteriorEntry()), just for a standalone
    // item instead of a whole building. Per request ("kapag nadikit sa
    // yung head sa gitna ng 3x3 pinaka middle is tyaka magtrigger"):
    //   - `spawnCol`/`spawnRow` — this door drops the player at its OWN
    //     spot inside the room (the 5th tile down, room-local), instead
    //     of the main entrance's spawnX/spawnY (INTERIOR_ROOMS.
    //     sharedHouse) — see enterInterior(), js/interior.js.
    //   - `doorSpanCols`/`doorSpanRows` also make this door SOLID across
    //     its two side columns (center column walkable) if placed
    //     indoors as decor — see isInteriorTileBlocked(), js/interior.js.
    //     The actual indoor warp trigger/landing tiles are now plain,
    //     hand-set coordinates on the ROOM itself, not derived from
    //     wherever this item happens to be placed — see
    //     the sharedHouse blueprint's indoorWarp and
    //     checkIndoorWarpDoor(), js/interior.js.
    interior: { roomId: "tavern_room", doorSpanCols: 3, doorSpanRows: 3, spawnCol: 12, spawnRow: 5 },
  },
  chimneyRedDoor: {
    id: "chimneyRedDoor",
    name: "Chimney Flue (Red)",
    icon: assets.chimneyRedDoor,
    unlimited: true,
    flat: true,
  },
  wallPoster: {
    id: "wallPoster",
    name: "Wall Poster",
    icon: assets.wallPoster,
    unlimited: true,
    flat: true,
  },
  pictureFrame: {
    id: "pictureFrame",
    name: "Picture Frame",
    icon: assets.pictureFrame,
    unlimited: true,
    flat: true,
  },
  boardA: {
    id: "boardA",
    name: "Board (A)",
    icon: assets.boardA,
    unlimited: true,
    flat: true,
  },
  boardB: {
    id: "boardB",
    name: "Board (B)",
    icon: assets.boardB,
    unlimited: true,
    flat: true,
  },
  wallFurniture1: {
    id: "wallFurniture1",
    name: "Wall Decor 1",
    icon: assets.wallFurniture1,
    unlimited: true,
    flat: true,
  },
  wallFurniture2: {
    id: "wallFurniture2",
    name: "Wall Decor 2",
    icon: assets.wallFurniture2,
    unlimited: true,
    flat: true,
  },
  wallFurniture3: {
    id: "wallFurniture3",
    name: "Wall Decor 3",
    icon: assets.wallFurniture3,
    unlimited: true,
    flat: true,
  },
  wallFurniture4: {
    id: "wallFurniture4",
    name: "Wall Decor 4",
    icon: assets.wallFurniture4,
    unlimited: true,
    flat: true,
  },
  wallFurniture5: {
    id: "wallFurniture5",
    name: "Wall Decor 5",
    icon: assets.wallFurniture5,
    unlimited: true,
    flat: true,
  },
  wallFurniture6: {
    id: "wallFurniture6",
    name: "Wall Decor 6",
    icon: assets.wallFurniture6,
    unlimited: true,
    flat: true,
  },
  wallFurniture7: {
    id: "wallFurniture7",
    name: "Wall Decor 7",
    icon: assets.wallFurniture7,
    unlimited: true,
    flat: true,
  },
  cookerExtension1: {
    id: "cookerExtension1",
    name: "Stove Extension (A)",
    icon: assets.cookerExtension1,
    unlimited: true,
    flat: true,
  },
  cookerExtension2: {
    id: "cookerExtension2",
    name: "Stove Extension (B)",
    icon: assets.cookerExtension2,
    unlimited: true,
    flat: true,
  },
  tableFurniture1: {
    id: "tableFurniture1",
    name: "Tabletop Clutter 1",
    icon: assets.tableFurniture1,
    unlimited: true,
    flat: true,
  },
  tableFurniture2: {
    id: "tableFurniture2",
    name: "Tabletop Clutter 2",
    icon: assets.tableFurniture2,
    unlimited: true,
    flat: true,
  },
  tableFurniture3: {
    id: "tableFurniture3",
    name: "Tabletop Clutter 3",
    icon: assets.tableFurniture3,
    unlimited: true,
    flat: true,
  },
  tableFurniture4: {
    id: "tableFurniture4",
    name: "Tabletop Clutter 4",
    icon: assets.tableFurniture4,
    unlimited: true,
    flat: true,
  },
  mugFull: {
    id: "mugFull",
    name: "Mug (Full)",
    icon: assets.mugFull,
    unlimited: true,
    flat: true,
  },
  mugEmpty: {
    id: "mugEmpty",
    name: "Mug (Empty)",
    icon: assets.mugEmpty,
    unlimited: true,
    flat: true,
  },
  plateEmpty: {
    id: "plateEmpty",
    name: "Plate (Empty)",
    icon: assets.plateEmpty,
    unlimited: true,
    flat: true,
  },
  plateFood: {
    id: "plateFood",
    name: "Plate (With Food)",
    icon: assets.plateFood,
    unlimited: true,
    flat: true,
  },
  meatItem: {
    id: "meatItem",
    name: "Meat",
    icon: assets.meatItem,
    unlimited: true,
    flat: true,
    // Edible — per request ("may meat sa inventory, kapag na-use ko yun,
    // dagdag ng 20+ para sa food duration, tyaka health 20% ng health").
    // `food` is a flat number of food points; `healthPercent` is a
    // percentage of maxHealth (NOT of current health), so a 20 here heals
    // the same 20 points whether you're nearly dead or nearly full —
    // healing a percentage of CURRENT health would make the item
    // near-useless exactly when you need it most. See consumeItem().
    consumable: { food: 20, healthPercent: 20 },
  },
  // `sittable`/`noOcclusionFade` (js/furniture.js, camera.js): same
  // click-to-sit + no-approach-fade treatment as the outdoor benches
  // (see the big comment above benchHorizontal) — applied here to every
  // other seat in the game, indoor and outdoor alike, per request
  // ("apply mo sa lahat indoor at outdoor na upuan"). `facing` matches
  // which way each chair's own art actually opens (measured off each
  // icon): chairFront/chairOutdoorFront face the viewer head-on ("down");
  // chairRight/chairOutdoorSide have their backrest on the left, seat
  // opening right; chairLeft/chairOutdoorSideLeft are their mirror,
  // opening left.
  chairFront: {
    id: "chairFront",
    name: "Chair (Front-facing)",
    icon: assets.chairFront,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
    noOcclusionFade: true,
    sittable: { seats: [{ col: 0, row: 0, facing: "down" }] },
  },
  chairRight: {
    id: "chairRight",
    name: "Chair (Side-facing)",
    icon: assets.chairRight,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
    noOcclusionFade: true,
    sittable: { seats: [{ col: 0, row: 0, facing: "right" }] },
  },
  // The left-facing counterpart — per request ("kung may right dapat may
  // left din"). Its art (assets/interior/leftchair.png) was already in
  // the project, just never registered as an item.
  chairLeft: {
    id: "chairLeft",
    name: "Chair (Side-facing, Left)",
    icon: assets.chairLeft,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
    noOcclusionFade: true,
    sittable: { seats: [{ col: 0, row: 0, facing: "left" }] },
  },
  cabinetBaseA: {
    id: "cabinetBaseA",
    name: "Cabinet Base (A)",
    icon: assets.cabinetBaseA,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  cabinetBaseB: {
    id: "cabinetBaseB",
    name: "Cabinet Base (B)",
    icon: assets.cabinetBaseB,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  cabinetBaseC: {
    id: "cabinetBaseC",
    name: "Cabinet Base (C)",
    icon: assets.cabinetBaseC,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  cabinetBaseD: {
    id: "cabinetBaseD",
    name: "Cabinet Base (D)",
    icon: assets.cabinetBaseD,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  basket1: {
    id: "basket1",
    name: "Basket (A)",
    icon: assets.basket1,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  basket2: {
    id: "basket2",
    name: "Basket (B)",
    icon: assets.basket2,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  bedBig: {
    id: "bedBig",
    name: "Big Bed",
    icon: assets.bedBig,
    unlimited: true,
    // Per request ("automatic na may collission na dapat kapag lapag sa
    // tile kung ano size nila yun na mismo yung collissions"): solid,
    // sized to match its own art (46x54px ≈ 3 tiles wide, 3 tall) rather
    // than the single-tile default — same `fixedFootprint` pattern Big
    // Stone already uses (getObjectFootprintBlockedTiles(), above).
    // `collides: true` is also what makes the outdoor E-grab/place
    // mechanic (findGrabbableInLayer(), tryGrabOrPlaceInFront() —
    // inventory.js) check the tile IN FRONT of the player rather than
    // underfoot, same as every other collidable object — "ERT" already
    // works generically for any placed item, so no new code was needed
    // there, just this.
    collides: true,
    fixedFootprint: { leftTiles: 1, rightTiles: 1, heightTiles: 3 },
  },
  bedSmall: {
    id: "bedSmall",
    name: "Small Bed",
    icon: assets.bedSmall,
    unlimited: true,
    // Same reasoning as Big Bed above, sized to its own (narrower)
    // art (30x54px ≈ 2 tiles wide, 3 tall).
    collides: true,
    fixedFootprint: { leftTiles: 0, rightTiles: 1, heightTiles: 3 },
  },
  tableBig: {
    id: "tableBig",
    name: "Big Table (A)",
    icon: assets.tableBig,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  tableBig1: {
    id: "tableBig1",
    name: "Big Table (B)",
    icon: assets.tableBig1,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  tableBig2: {
    id: "tableBig2",
    name: "Big Table (C)",
    icon: assets.tableBig2,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  tableCircle: {
    id: "tableCircle",
    name: "Round Table",
    icon: assets.tableCircle,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  tableKitchen: {
    id: "tableKitchen",
    name: "Kitchen Table",
    icon: assets.tableKitchen,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  tableSmall: {
    id: "tableSmall",
    name: "Small Table",
    icon: assets.tableSmall,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  cookerStove1: {
    id: "cookerStove1",
    name: "Stove (A)",
    icon: assets.cookerStove1,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  cookerStove2: {
    id: "cookerStove2",
    name: "Stove (B)",
    icon: assets.cookerStove2,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  cookerStove3: {
    id: "cookerStove3",
    name: "Stove (C)",
    icon: assets.cookerStove3,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  couch: {
    id: "couch",
    name: "Couch",
    icon: assets.couch,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
    noOcclusionFade: true,
    // 42x19 art = a 3-tile-wide footprint (placedCol-1 .. placedCol+1),
    // so the couch gets three separate seats across it rather than one
    // shared spot — same "pick which cushion" behavior as the benches.
    sittable: {
      seats: [
        { col: -1, row: 0, facing: "down" },
        { col: 0, row: 0, facing: "down" },
        { col: 1, row: 0, facing: "down" },
      ],
    },
  },
  drawerFurniture: {
    id: "drawerFurniture",
    name: "Drawer",
    icon: assets.drawerFurniture,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  broom: {
    id: "broom",
    name: "Broom (Walis)",
    icon: assets.broom,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  barrelInterior: {
    id: "barrelInterior",
    name: "Barrel",
    icon: assets.barrelInterior,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  crateInterior: {
    id: "crateInterior",
    name: "Wooden Crate",
    icon: assets.crateInterior,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  chimneyPlain: {
    id: "chimneyPlain",
    name: "Chimney",
    icon: assets.chimneyPlain,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  chimneyRed: {
    id: "chimneyRed",
    name: "Chimney (Red)",
    icon: assets.chimneyRed,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  // `noOcclusionFade` (see shouldFadeForOcclusion(), camera.js) — per
  // request ("wag lagyan ng opacity kapag lumapit"): a bench is low and
  // thin, so the normal "fade when the player's feet touch the object's
  // pixels while sorted behind it" check triggered constantly just
  // walking up to sit on it. Same treatment as Mushroom/Flowering Bush.
  //
  // `sittable: { seats: [...] }` (js/furniture.js) — a LIST of individual
  // seat spots, each `{ col, row, facing }` offset from the item's own
  // placement/anchor tile, rather than one seat per piece of furniture.
  // Per request ("mamimili kung san dun sa 1-4 uupo na tile"): hovering
  // highlights only the ONE seat tile's slice of the art the cursor is
  // actually over (no tile-grid square is drawn — just the seat itself
  // tinted, see drawSitHighlight(), camera.js), and clicking sits the
  // player on THAT spot. A tile inside the furniture's footprint that
  // isn't listed here (the vertical bench's 5th/top tile — its backrest
  // post, not a seat) neither highlights nor accepts a click.
  //
  // Pressing any movement key while seated stands back up, landing
  // exactly back where the player was standing right before they clicked
  // to sit (js/furniture.js's trySitOnBench()/standUpFromBench()) —
  // simplest reliable way to land on "the front tile" without having to
  // work out which side of the furniture that is for every placement/
  // rotation. There's no dedicated sitting sprite sheet, so this just
  // repositions the player and keeps the normal idle pose/animation — a
  // placeholder until real seated art exists.
  //
  // benchh.png is 64x32 = 4 tiles wide, 2 tall. getMultiTileFootprintRect()
  // (above) centres an even 4-wide footprint as placedCol-1 .. placedCol+2,
  // so those are the four seat columns; the seat slab itself is the art's
  // BOTTOM tile row (y 16-31 — measured off the PNG: rows 0-15 are the
  // backrest), which is the anchor row, hence `row: 0` on all four.
  benchHorizontal: {
    id: "benchHorizontal",
    name: "Bench (Horizontal)",
    icon: assets.benchHorizontal,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
    // `footprintHeightTiles: 1` — per request, this bench takes up FOUR
    // tiles, not eight. Its art is 64x32, and the footprint size is
    // otherwise derived straight from that (getMultiTileFootprintRect()
    // above), which made it 4 wide by 2 TALL — the upper of those two
    // rows being its backrest, which nothing actually stands on. A bench
    // occupies one row of ground, so the height is pinned at 1 and the
    // backrest simply hangs off the top of it the way a tree's canopy
    // does. This is what the placement preview draws and what the
    // collision blocks, so both now match the four tiles the bench
    // really sits on.
    footprintHeightTiles: 1,
    // `artRoot: { x: -8 }` slides the drawn bench 8px RIGHT, onto its own
    // footprint. It needs this because 64px is an EVEN four tiles wide,
    // and drawing centres art on the placement tile's CENTRE: the art
    // therefore started half a tile left of the four tiles it occupies,
    // spilling into a fifth column on the left and leaving the right-hand
    // one bare. That's the "still 5 tiles" the footprint looked like, and
    // why the bench sat visibly left of what it actually collided with.
    // Shifting by half a tile lines the art up exactly with its four
    // tiles. (Odd-width art — benchVertical's single column, a tree —
    // centres cleanly and needs none of this.)
    artRoot: { x: -8, y: 0 },
    noOcclusionFade: true,
    // No `poseOffsetX` here: with `artRoot` above lining the art up with
    // its tiles, each of the bench's four 16px seat slots now sits
    // exactly on one seat tile, so a sit frame centred on the tile is
    // already centred on the seat. (This used to carry -8 to cancel out
    // that same half-tile skew from the other end.)
    sittable: {
      seats: [
        { col: -1, row: 0, facing: "down" },
        { col: 0, row: 0, facing: "down" },
        { col: 1, row: 0, facing: "down" },
        { col: 2, row: 0, facing: "down" },
      ],
    },
  },
  // benchv.png is 21x80 = 1 tile wide, 5 tall (the art overhangs its
  // single tile column by ~2px each side, which the rounded footprint
  // ignores). Seats are the BOTTOM FOUR tiles only — rows 0, -1, -2, -3
  // from the anchor — per request ("pwede niyang maupuan is 1-4 lang
  // simula sa baba pataas"). The 5th/topmost tile (row -4) is left out
  // on purpose: measured off the PNG, art rows 0-15 are just the narrow
  // backrest post, not a seat surface (the full-width bench body only
  // starts at y 16).
  benchVertical: {
    id: "benchVertical",
    name: "Bench (Vertical)",
    icon: assets.benchVertical,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
    noOcclusionFade: true,
    // Drawn side-on, so a seated player faces sideways ("right") here
    // rather than front-on like the horizontal bench — that picks the
    // sitv sheet over sith (sitSheetFor(), js/camera.js).
    //
    // No `poseOffsetX` on any of these seats: the sit frame is drawn
    // centred on the seat tile and nothing in the code shifts it, so
    // where the character lands is decided purely by where she's drawn
    // inside her own 64x64 frame. (`poseOffsetX` still exists as a
    // per-seat option — see js/furniture.js — for a seat whose art
    // genuinely isn't tile-centred; it's just not needed here.)
    sittable: {
      seats: [
        { col: 0, row: 0, facing: "right" },
        { col: 0, row: -1, facing: "right" },
        { col: 0, row: -2, facing: "right" },
        { col: 0, row: -3, facing: "right" },
      ],
    },
  },
  chairOutdoorFront: {
    id: "chairOutdoorFront",
    name: "Outdoor Chair (Front)",
    icon: assets.chairOutdoorFront,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
    noOcclusionFade: true,
    sittable: { seats: [{ col: 0, row: 0, facing: "down" }] },
  },
  chairOutdoorSide: {
    id: "chairOutdoorSide",
    name: "Outdoor Chair (Side)",
    icon: assets.chairOutdoorSide,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
    noOcclusionFade: true,
    sittable: { seats: [{ col: 0, row: 0, facing: "right" }] },
  },
  // Same rule for the outdoor chair. This one had no left art at all, so
  // it's a horizontal mirror of chairside.png, generated into
  // assets/outdoor/chairside_left.png.
  chairOutdoorSideLeft: {
    id: "chairOutdoorSideLeft",
    name: "Outdoor Chair (Side, Left)",
    icon: assets.chairOutdoorSideLeft,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
    noOcclusionFade: true,
    sittable: { seats: [{ col: 0, row: 0, facing: "left" }] },
  },
  floorMat: {
    id: "floorMat",
    name: "Floor Mat",
    icon: assets.floorMat,
    unlimited: true,
    flat: true,
  },
  longTableHorizontal: {
    id: "longTableHorizontal",
    name: "Long Table (Horizontal)",
    icon: assets.longTableHorizontal,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  longTableVertical: {
    id: "longTableVertical",
    name: "Long Table (Vertical)",
    icon: assets.longTableVertical,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  portBridge: {
    id: "portBridge",
    name: "Port Bridge",
    icon: assets.portBridge,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  portBridgeDecor: {
    id: "portBridgeDecor",
    name: "Port Bridge Decor",
    icon: assets.portBridgeDecor,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  portBridgeFront1: {
    id: "portBridgeFront1",
    name: "Port Bridge Front (A)",
    icon: assets.portBridgeFront1,
    unlimited: true,
    flat: true,
  },
  portBridgeFront2: {
    id: "portBridgeFront2",
    name: "Port Bridge Front (B)",
    icon: assets.portBridgeFront2,
    unlimited: true,
    flat: true,
  },
  portBridgeFront3: {
    id: "portBridgeFront3",
    name: "Port Bridge Front (C)",
    icon: assets.portBridgeFront3,
    unlimited: true,
    flat: true,
  },
  portBridgeFront4: {
    id: "portBridgeFront4",
    name: "Port Bridge Front (D)",
    icon: assets.portBridgeFront4,
    unlimited: true,
    flat: true,
  },
  portBridgeWall1: {
    id: "portBridgeWall1",
    name: "Port Bridge Wall (A)",
    icon: assets.portBridgeWall1,
    unlimited: true,
    flat: true,
  },
  portBridgeWall2: {
    id: "portBridgeWall2",
    name: "Port Bridge Wall (B)",
    icon: assets.portBridgeWall2,
    unlimited: true,
    flat: true,
  },
  postPlain: {
    id: "postPlain",
    name: "Post",
    icon: assets.postPlain,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  // Lamp post. Treated like a TREE, not a building — per request ("yung
  // pinaka root niya yun lang yung may collission, para lang siyang
  // noLeave na tree"): no `multiTileFootprint`, so exactly one tile
  // blocks, the tile it was placed on, and the tall art simply hangs
  // above/beside it.
  //
  // `artRoot` is what makes that tile the POST'S FOOT rather than the
  // middle of its bounding box. Measured off the PNGs: the foot sits at
  // x 7.5 / row 45 in the 32x48 unlit art and x 8.5 / row 75 in the
  // 64x80 lit one, both given here as an offset from each art's own
  // bottom-centre. Without it the pole drew about a tile and a half left
  // of the tile you clicked (see objectArtRect(), js/camera.js).
  postLight: {
    id: "postLight",
    name: "Lamp Post",
    icon: assets.postLight,
    unlimited: true,
    collides: true,
    groupIcon: true, // stands in for the whole lamp family in the inventory — per request, "postlight gamitin mong icon"
    artRoot: { x: -23.5, y: -4 },
    // Swaps to the lit art after dark and back at sunrise, crossfading
    // both ways — per request ("postlight sa umaga, postlight-light sa
    // gabi... pa-fade yung entrance ng pag-transition").
    nightIcon: assets.postLightLit,
    // Which mask the occlusion fade tests against once the lit art is
    // the one on screen — per request ("yung mismong deadspace is wala
    // mag-opacity, tapos kapag na-reach lang yung mismong object tyaka
    // lang mag-opacity... check mo yung logic ng trees"). That's exactly
    // what a tree does, and it only works from a real per-pixel mask; the
    // lit art is a different shape and size from the unlit one, so it
    // needs its own (generated into js/objectAlphaMasks.js).
    nightMaskType: "postLightLit",
    // The glow sits on the bulb (measured at 40, 22.5 in the lit art),
    // expressed from the tile's bottom-centre once root anchoring has
    // shifted the art into place.
    lightGlow: { offsetX: 31.5, offsetY: -53.5 },
  },
  // The lit lamp as its OWN placeable item — per request ("yung
  // postlight/postlight-light is na hold din"). Permanently lit, so no
  // `nightIcon`; same root anchoring and same single-tile collision.
  postLightLit: {
    id: "postLightLit",
    name: "Lamp Post (Lit)",
    icon: assets.postLightLit,
    unlimited: true,
    collides: true,
    artRoot: { x: -23.5, y: -4 },
    lightGlow: { offsetX: 31.5, offsetY: -53.5 },
  },
  // Left-facing mirrors of the two lamps above — per request ("original
  // kasi diba right side lang, gusto ko rin sana magka left side"). The
  // art is generated by flipping the originals
  // (assets/outdoor/postlight_left.png and postlight-light_left.png), so
  // every measurement mirrors too: the post's foot moves from x 8.5 to
  // x 54.5, and the bulb's glow from +31.5 to -31.5.
  postLightLeft: {
    id: "postLightLeft",
    name: "Lamp Post (Left)",
    icon: assets.postLightLeft,
    unlimited: true,
    collides: true,
    artRoot: { x: 22.5, y: -4 },
    nightIcon: assets.postLightLitLeft,
    nightMaskType: "postLightLitLeft",
    lightGlow: { offsetX: -31.5, offsetY: -53.5 },
  },
  postLightLitLeft: {
    id: "postLightLitLeft",
    name: "Lamp Post (Lit, Left)",
    icon: assets.postLightLitLeft,
    unlimited: true,
    collides: true,
    artRoot: { x: 22.5, y: -4 },
    lightGlow: { offsetX: -31.5, offsetY: -53.5 },
  },
  postHandleLight: {
    id: "postHandleLight",
    name: "Handheld Lamp",
    icon: assets.postHandleLight,
    unlimited: true,
    flat: true,
  },
  tableOutdoorSmall: {
    id: "tableOutdoorSmall",
    name: "Small Outdoor Table",
    icon: assets.tableOutdoorSmall,
    unlimited: true,
    flat: true,
  },
  vegOnion: {
    id: "vegOnion",
    name: "Onion",
    icon: assets.vegOnion,
    unlimited: true,
    flat: true,
  },
  vegOnionBox: {
    id: "vegOnionBox",
    name: "Onion Crate",
    icon: assets.vegOnionBox,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  vegPetchay: {
    id: "vegPetchay",
    name: "Petchay",
    icon: assets.vegPetchay,
    unlimited: true,
    flat: true,
  },
  vegPetchayBox: {
    id: "vegPetchayBox",
    name: "Petchay Crate",
    icon: assets.vegPetchayBox,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  vegCabbage: {
    id: "vegCabbage",
    name: "Cabbage",
    icon: assets.vegCabbage,
    unlimited: true,
    flat: true,
  },
  vegCabbageBox: {
    id: "vegCabbageBox",
    name: "Cabbage Crate",
    icon: assets.vegCabbageBox,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  vegBrocolli: {
    id: "vegBrocolli",
    name: "Broccoli",
    icon: assets.vegBrocolli,
    unlimited: true,
    flat: true,
  },
  vegBrocolliBox: {
    id: "vegBrocolliBox",
    name: "Broccoli Crate",
    icon: assets.vegBrocolliBox,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  vegBrocolliFlower: {
    id: "vegBrocolliFlower",
    name: "Broccoli Flower",
    icon: assets.vegBrocolliFlower,
    unlimited: true,
    flat: true,
  },
  vegBrocolliFlowerBox: {
    id: "vegBrocolliFlowerBox",
    name: "Broccoli Flower Crate",
    icon: assets.vegBrocolliFlowerBox,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  vegCarrots: {
    id: "vegCarrots",
    name: "Carrots",
    icon: assets.vegCarrots,
    unlimited: true,
    flat: true,
  },
  vegCarrotBox: {
    id: "vegCarrotBox",
    name: "Carrot Crate",
    icon: assets.vegCarrotBox,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  vegDragonfruit: {
    id: "vegDragonfruit",
    name: "Dragonfruit",
    icon: assets.vegDragonfruit,
    unlimited: true,
    flat: true,
  },
  vegDragonfruitBox: {
    id: "vegDragonfruitBox",
    name: "Dragonfruit Crate",
    icon: assets.vegDragonfruitBox,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  vegCrate: {
    id: "vegCrate",
    name: "Crate (Closed)",
    icon: assets.vegCrate,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  vegCrateOpen: {
    id: "vegCrateOpen",
    name: "Crate (Open)",
    icon: assets.vegCrateOpen,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  dirtRake: {
    id: "dirtRake",
    name: "Dirt Rake",
    icon: assets.dirtRake,
    unlimited: true,
    flat: true,
  },
  dirtWet: {
    id: "dirtWet",
    name: "Wet Dirt Patch",
    icon: assets.dirtWet,
    unlimited: true,
    flat: true,
  },
  plantDrawer: {
    id: "plantDrawer",
    name: "Plant Drawer",
    icon: assets.plantDrawer,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  plotSocketOpen: {
    id: "plotSocketOpen",
    name: "Planting Socket (Open)",
    icon: assets.plotSocketOpen,
    unlimited: true,
    flat: true,
  },
  plotSocketClosed: {
    id: "plotSocketClosed",
    name: "Planting Socket (Closed)",
    icon: assets.plotSocketClosed,
    unlimited: true,
    flat: true,
  },
  waterCrateHorizontal: {
    id: "waterCrateHorizontal",
    name: "Water Crate (Horizontal)",
    icon: assets.waterCrateHorizontal,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },
  waterCrateVertical: {
    id: "waterCrateVertical",
    name: "Water Crate (Vertical)",
    icon: assets.waterCrateVertical,
    unlimited: true,
    collides: true,
    multiTileFootprint: true,
  },

  // --- dev / level-design tool: one 16x16-tile collision block, for
  // manually marking spots inside an interior room (js/interior.js) that
  // should block movement — furniture, walls, whatever isn't walkable in
  // the new room art. Held/unheld exactly like every other item above
  // (holdSlot()/cancelHeldItem()); `interiorOnly: true` is what routes
  // its placement into the room's own `collisions` map instead of the
  // outdoor terrain/ground/decor/object layers (see placeHeldItemAt()
  // and updatePlayerInsideInterior(), plus checkInteriorClick() below).
  // Per request ("gusto ko maglagay ka ng isang item na pang collisions
  // isang tile 16x16... ilagay mo sa inventory tapos na hohold at na e
  // tapos unhold").
  collisionBlock: {
    id: "collisionBlock",
    name: "Collision Block",
    icon: assets.collisionMarker,
    unlimited: true,
    collides: true,
    interiorOnly: true,
  },

  // --- fence / floor sheets sliced into single 16x16 game tiles ---
  // Per request ("meron akong object na fence, floor brown, darkgreen at
  // green sa inventory, gawin mo hatiin mo sa tiles yun"). Each source
  // sprite was one whole bordered object; these are its individual
  // cells, so a border/floor can be built piece by piece instead of
  // dropped as one fixed block. Fully-transparent cells are skipped
  // (fence's hollow middle, floorbrown's rounded corners), which is why
  // the counts are 19/21/9/9 rather than 25/25/9/9.
  //
  // They consolidate into one inventory slot each via TILE_GROUP_META
  // below, the same way the grass/dirt/water/port families do —
  // `groupIcon: true` marks the centre tile that represents the family.
  fenceTileR0C0: {
    id: "fenceTileR0C0",
    name: "Fence Tile (R1C1)",
    icon: assets.fenceTileR0C0,
    unlimited: true,
    collides: true,
  },
  fenceTileR0C1: {
    id: "fenceTileR0C1",
    name: "Fence Tile (R1C2)",
    icon: assets.fenceTileR0C1,
    unlimited: true,
    collides: true,
  },
  fenceTileR0C2: {
    id: "fenceTileR0C2",
    name: "Fence Tile (R1C3)",
    icon: assets.fenceTileR0C2,
    unlimited: true,
    collides: true,
  },
  fenceTileR0C3: {
    id: "fenceTileR0C3",
    name: "Fence Tile (R1C4)",
    icon: assets.fenceTileR0C3,
    unlimited: true,
    collides: true,
  },
  fenceTileR0C4: {
    id: "fenceTileR0C4",
    name: "Fence Tile (R1C5)",
    icon: assets.fenceTileR0C4,
    unlimited: true,
    collides: true,
  },
  fenceTileR1C0: {
    id: "fenceTileR1C0",
    name: "Fence Tile (R2C1)",
    icon: assets.fenceTileR1C0,
    unlimited: true,
    collides: true,
  },
  fenceTileR1C1: {
    id: "fenceTileR1C1",
    name: "Fence Tile (R2C2)",
    icon: assets.fenceTileR1C1,
    unlimited: true,
    collides: true,
    groupIcon: true, // the dead-centre tile — stands in for the whole family in the inventory
  },
  fenceTileR1C3: {
    id: "fenceTileR1C3",
    name: "Fence Tile (R2C4)",
    icon: assets.fenceTileR1C3,
    unlimited: true,
    collides: true,
  },
  fenceTileR1C4: {
    id: "fenceTileR1C4",
    name: "Fence Tile (R2C5)",
    icon: assets.fenceTileR1C4,
    unlimited: true,
    collides: true,
  },
  fenceTileR2C0: {
    id: "fenceTileR2C0",
    name: "Fence Tile (R3C1)",
    icon: assets.fenceTileR2C0,
    unlimited: true,
    collides: true,
  },
  fenceTileR2C4: {
    id: "fenceTileR2C4",
    name: "Fence Tile (R3C5)",
    icon: assets.fenceTileR2C4,
    unlimited: true,
    collides: true,
  },
  fenceTileR3C0: {
    id: "fenceTileR3C0",
    name: "Fence Tile (R4C1)",
    icon: assets.fenceTileR3C0,
    unlimited: true,
    collides: true,
  },
  fenceTileR3C1: {
    id: "fenceTileR3C1",
    name: "Fence Tile (R4C2)",
    icon: assets.fenceTileR3C1,
    unlimited: true,
    collides: true,
  },
  fenceTileR3C3: {
    id: "fenceTileR3C3",
    name: "Fence Tile (R4C4)",
    icon: assets.fenceTileR3C3,
    unlimited: true,
    collides: true,
  },
  fenceTileR3C4: {
    id: "fenceTileR3C4",
    name: "Fence Tile (R4C5)",
    icon: assets.fenceTileR3C4,
    unlimited: true,
    collides: true,
  },
  fenceTileR4C0: {
    id: "fenceTileR4C0",
    name: "Fence Tile (R5C1)",
    icon: assets.fenceTileR4C0,
    unlimited: true,
    collides: true,
  },
  fenceTileR4C1: {
    id: "fenceTileR4C1",
    name: "Fence Tile (R5C2)",
    icon: assets.fenceTileR4C1,
    unlimited: true,
    collides: true,
  },
  fenceTileR4C2: {
    id: "fenceTileR4C2",
    name: "Fence Tile (R5C3)",
    icon: assets.fenceTileR4C2,
    unlimited: true,
    collides: true,
  },
  fenceTileR4C3: {
    id: "fenceTileR4C3",
    name: "Fence Tile (R5C4)",
    icon: assets.fenceTileR4C3,
    unlimited: true,
    collides: true,
  },
  floorBrownTileR0C1: {
    id: "floorBrownTileR0C1",
    name: "Brown Floor Tile (R1C2)",
    icon: assets.floorBrownTileR0C1,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR0C2: {
    id: "floorBrownTileR0C2",
    name: "Brown Floor Tile (R1C3)",
    icon: assets.floorBrownTileR0C2,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR0C3: {
    id: "floorBrownTileR0C3",
    name: "Brown Floor Tile (R1C4)",
    icon: assets.floorBrownTileR0C3,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR1C0: {
    id: "floorBrownTileR1C0",
    name: "Brown Floor Tile (R2C1)",
    icon: assets.floorBrownTileR1C0,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR1C1: {
    id: "floorBrownTileR1C1",
    name: "Brown Floor Tile (R2C2)",
    icon: assets.floorBrownTileR1C1,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR1C2: {
    id: "floorBrownTileR1C2",
    name: "Brown Floor Tile (R2C3)",
    icon: assets.floorBrownTileR1C2,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR1C3: {
    id: "floorBrownTileR1C3",
    name: "Brown Floor Tile (R2C4)",
    icon: assets.floorBrownTileR1C3,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR1C4: {
    id: "floorBrownTileR1C4",
    name: "Brown Floor Tile (R2C5)",
    icon: assets.floorBrownTileR1C4,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR2C0: {
    id: "floorBrownTileR2C0",
    name: "Brown Floor Tile (R3C1)",
    icon: assets.floorBrownTileR2C0,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR2C1: {
    id: "floorBrownTileR2C1",
    name: "Brown Floor Tile (R3C2)",
    icon: assets.floorBrownTileR2C1,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR2C2: {
    id: "floorBrownTileR2C2",
    name: "Brown Floor Tile (R3C3)",
    icon: assets.floorBrownTileR2C2,
    unlimited: true,
    flat: true,
    groupIcon: true, // the dead-centre tile — stands in for the whole family in the inventory
  },
  floorBrownTileR2C3: {
    id: "floorBrownTileR2C3",
    name: "Brown Floor Tile (R3C4)",
    icon: assets.floorBrownTileR2C3,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR2C4: {
    id: "floorBrownTileR2C4",
    name: "Brown Floor Tile (R3C5)",
    icon: assets.floorBrownTileR2C4,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR3C0: {
    id: "floorBrownTileR3C0",
    name: "Brown Floor Tile (R4C1)",
    icon: assets.floorBrownTileR3C0,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR3C1: {
    id: "floorBrownTileR3C1",
    name: "Brown Floor Tile (R4C2)",
    icon: assets.floorBrownTileR3C1,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR3C2: {
    id: "floorBrownTileR3C2",
    name: "Brown Floor Tile (R4C3)",
    icon: assets.floorBrownTileR3C2,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR3C3: {
    id: "floorBrownTileR3C3",
    name: "Brown Floor Tile (R4C4)",
    icon: assets.floorBrownTileR3C3,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR3C4: {
    id: "floorBrownTileR3C4",
    name: "Brown Floor Tile (R4C5)",
    icon: assets.floorBrownTileR3C4,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR4C1: {
    id: "floorBrownTileR4C1",
    name: "Brown Floor Tile (R5C2)",
    icon: assets.floorBrownTileR4C1,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR4C2: {
    id: "floorBrownTileR4C2",
    name: "Brown Floor Tile (R5C3)",
    icon: assets.floorBrownTileR4C2,
    unlimited: true,
    flat: true,
  },
  floorBrownTileR4C3: {
    id: "floorBrownTileR4C3",
    name: "Brown Floor Tile (R5C4)",
    icon: assets.floorBrownTileR4C3,
    unlimited: true,
    flat: true,
  },
  floorDarkGreenTileR0C0: {
    id: "floorDarkGreenTileR0C0",
    name: "Dark Green Floor Tile (R1C1)",
    icon: assets.floorDarkGreenTileR0C0,
    unlimited: true,
    flat: true,
  },
  floorDarkGreenTileR0C1: {
    id: "floorDarkGreenTileR0C1",
    name: "Dark Green Floor Tile (R1C2)",
    icon: assets.floorDarkGreenTileR0C1,
    unlimited: true,
    flat: true,
  },
  floorDarkGreenTileR0C2: {
    id: "floorDarkGreenTileR0C2",
    name: "Dark Green Floor Tile (R1C3)",
    icon: assets.floorDarkGreenTileR0C2,
    unlimited: true,
    flat: true,
  },
  floorDarkGreenTileR1C0: {
    id: "floorDarkGreenTileR1C0",
    name: "Dark Green Floor Tile (R2C1)",
    icon: assets.floorDarkGreenTileR1C0,
    unlimited: true,
    flat: true,
  },
  floorDarkGreenTileR1C1: {
    id: "floorDarkGreenTileR1C1",
    name: "Dark Green Floor Tile (R2C2)",
    icon: assets.floorDarkGreenTileR1C1,
    unlimited: true,
    flat: true,
    groupIcon: true, // the dead-centre tile — stands in for the whole family in the inventory
  },
  floorDarkGreenTileR1C2: {
    id: "floorDarkGreenTileR1C2",
    name: "Dark Green Floor Tile (R2C3)",
    icon: assets.floorDarkGreenTileR1C2,
    unlimited: true,
    flat: true,
  },
  floorDarkGreenTileR2C0: {
    id: "floorDarkGreenTileR2C0",
    name: "Dark Green Floor Tile (R3C1)",
    icon: assets.floorDarkGreenTileR2C0,
    unlimited: true,
    flat: true,
  },
  floorDarkGreenTileR2C1: {
    id: "floorDarkGreenTileR2C1",
    name: "Dark Green Floor Tile (R3C2)",
    icon: assets.floorDarkGreenTileR2C1,
    unlimited: true,
    flat: true,
  },
  floorDarkGreenTileR2C2: {
    id: "floorDarkGreenTileR2C2",
    name: "Dark Green Floor Tile (R3C3)",
    icon: assets.floorDarkGreenTileR2C2,
    unlimited: true,
    flat: true,
  },
  floorGreenTileR0C0: {
    id: "floorGreenTileR0C0",
    name: "Green Floor Tile (R1C1)",
    icon: assets.floorGreenTileR0C0,
    unlimited: true,
    flat: true,
  },
  floorGreenTileR0C1: {
    id: "floorGreenTileR0C1",
    name: "Green Floor Tile (R1C2)",
    icon: assets.floorGreenTileR0C1,
    unlimited: true,
    flat: true,
  },
  floorGreenTileR0C2: {
    id: "floorGreenTileR0C2",
    name: "Green Floor Tile (R1C3)",
    icon: assets.floorGreenTileR0C2,
    unlimited: true,
    flat: true,
  },
  floorGreenTileR1C0: {
    id: "floorGreenTileR1C0",
    name: "Green Floor Tile (R2C1)",
    icon: assets.floorGreenTileR1C0,
    unlimited: true,
    flat: true,
  },
  floorGreenTileR1C1: {
    id: "floorGreenTileR1C1",
    name: "Green Floor Tile (R2C2)",
    icon: assets.floorGreenTileR1C1,
    unlimited: true,
    flat: true,
    groupIcon: true, // the dead-centre tile — stands in for the whole family in the inventory
  },
  floorGreenTileR1C2: {
    id: "floorGreenTileR1C2",
    name: "Green Floor Tile (R2C3)",
    icon: assets.floorGreenTileR1C2,
    unlimited: true,
    flat: true,
  },
  floorGreenTileR2C0: {
    id: "floorGreenTileR2C0",
    name: "Green Floor Tile (R3C1)",
    icon: assets.floorGreenTileR2C0,
    unlimited: true,
    flat: true,
  },
  floorGreenTileR2C1: {
    id: "floorGreenTileR2C1",
    name: "Green Floor Tile (R3C2)",
    icon: assets.floorGreenTileR2C1,
    unlimited: true,
    flat: true,
  },
  floorGreenTileR2C2: {
    id: "floorGreenTileR2C2",
    name: "Green Floor Tile (R3C3)",
    icon: assets.floorGreenTileR2C2,
    unlimited: true,
    flat: true,
  },
};

/* ---------------- tile groups (consolidated inventory slots) ----------------
   Per request: families of near-identical/same-purpose items (the grass
   3x3 autotile set, the 3 dirt variants, the 3 water variants, the
   port/island 5x5 edge set, the stone tiers + pebbles, and the tree/
   stump variants) used to each take up one inventory slot PER member —
   10 slots just for grass, 23 for port, etc. They're grouped here into
   ONE consolidated slot per family (renderInventory() below), showing a
   small side-by-side preview of the actual member icons instead of the
   full-size icon a normal slot shows. Clicking that one slot opens
   `openTileVariantPicker()`, a small popup listing every member at
   normal size; picking one from THERE opens the same Hold/1-7
   `openItemActionMenu()` every other item already uses — nothing about
   holding, placing, or hotbar-assigning an individual member changes,
   only how the family as a whole is browsed to get there.

   Grouping is derived from the itemDefs KEY (via each group's `match`
   test below — grass/dirt/water/port match by plain prefix; stone/tree
   need a little more care, see their comments) rather than a hand-
   maintained member list, so a future tile added to one of these
   families is picked up automatically with no list to remember to
   update. Fence (`assets/outdoor/fence.png`) isn't included — it's a
   single sprite with no variant set, nothing to consolidate. */
const TILE_GROUP_META = {
  grass: { name: "Ground Tiles", match: (t) => t.startsWith("grass") },
  dirt: { name: "Dirt Tiles", match: (t) => t.startsWith("dirt") },
  water: { name: "Water Tiles", match: (t) => t.startsWith("water") },
  port: { name: "Port Tiles", match: (t) => t.startsWith("port") },
  // Every placeable stone EXCEPT `stoneChunk` — that one's a harvested
  // crafting material (dropped by breaking a stone, see itemDefs), not
  // a "kind of stone tile" you'd browse alongside Big/Medium/Small/XS/
  // XXS Stone and the 5 Pebbles, so it's excluded explicitly rather
  // than just letting the "stone" prefix catch it too.
  stone: {
    name: "Stones",
    match: (t) => t.startsWith("stone") && t !== "stoneChunk",
  },
  // Every tree/stump variant (living, bare, and cut-stump alike) — no
  // exclusions needed, `woodLog`/`woodPlank`/`woodStick` etc. are a
  // separate "wood" prefix, not "tree".
  tree: { name: "Trees", match: (t) => t.startsWith("tree") },
  // All six chairs share one inventory slot — per request ("may mag-appear
  // na pop up may hold tapos 1-7 hotkey na lilitaw kapag click sa
  // inventory"). Clicking it opens the variant picker, and picking one
  // from there opens the same Hold + 1-7 menu every other item uses.
  // Multi-icon preview rather than `singleIcon`, since a front chair, a
  // side chair and an outdoor one genuinely look different from each
  // other — the same reason Trees and Stones keep theirs.
  chair: { name: "Chairs", match: (t) => t.startsWith("chair") },
  // The four lamp posts (right/left, unlit/lit) share one slot — per
  // request ("pag-sama-samahin mo na sa isang icon, postlight gamitin
  // mong icon, tapos pag-click at nakapili na, may popup na hold at
  // hotkey 1-7"). `singleIcon` shows just the plain right-facing lamp
  // rather than a packed grid, since at preview size the four are near
  // enough identical that a grid reads as mush.
  postLight: { name: "Lamp Posts", match: (t) => t.startsWith("postLight"), singleIcon: true },
  fenceTile: { name: "Fence Tiles", match: (t) => t.startsWith("fenceTile"), singleIcon: true },
  floorBrownTile: { name: "Brown Floor Tiles", match: (t) => t.startsWith("floorBrownTile"), singleIcon: true },
  floorDarkGreenTile: { name: "Dark Green Floor Tiles", match: (t) => t.startsWith("floorDarkGreenTile"), singleIcon: true },
  floorGreenTile: { name: "Green Floor Tiles", match: (t) => t.startsWith("floorGreenTile"), singleIcon: true },
};

function tileGroupIdForType(type) {
  for (const gid of Object.keys(TILE_GROUP_META)) {
    if (TILE_GROUP_META[gid].match(type)) return gid;
  }
  return null;
}

// id -> { id, name, members: [itemDefs keys, in declaration order] }
const tileGroups = {};
Object.keys(itemDefs).forEach((type) => {
  const gid = tileGroupIdForType(type);
  if (!gid) return;
  if (!tileGroups[gid])
    tileGroups[gid] = { id: gid, name: TILE_GROUP_META[gid].name, members: [] };
  tileGroups[gid].members.push(type);
});

// itemDefs key -> its group object (for a quick "is this type grouped?"
// check while rendering), and itemDefs key -> inventory index (grouped
// or not — the variant picker uses this to find the real slot to open
// openItemActionMenu on). Both rely on inventory[] being filled in this
// exact same Object.keys(itemDefs) order right below, which it always is.
const tileGroupByType = {};
Object.values(tileGroups).forEach((g) => {
  g.members.forEach((t) => {
    tileGroupByType[t] = g;
  });
});
const inventoryIndexByType = {};
Object.keys(itemDefs).forEach((type, i) => {
  inventoryIndexByType[type] = i;
});

const inventory = new Array(INVENTORY_ROWS * INVENTORY_COLS).fill(null);
// Reset + auto-fill: one inventory slot per itemDefs entry, in the order
// they're declared above, each starting with a 99 stack (irrelevant for
// anything `unlimited`, but still a sane real count for any future item
// added without that flag). This replaced a long hand-written list of
// `inventory[N] = {...}` lines, numbered by hand — every asset pack added
// so far has, at some point, thrown that numbering off by one slot or
// left a duplicate/gap behind it (see entries 28-31). Deriving the
// inventory directly from itemDefs makes that whole class of mistake
// impossible: every key in itemDefs gets exactly one slot, in
// declaration order, automatically — add or remove an item by editing
// itemDefs only, nothing here ever needs hand-updating again.
Object.keys(itemDefs).forEach((type, i) => {
  inventory[i] = { type, count: 99 };
});

// (Re)builds the inventory from scratch, straight from itemDefs — shared
// by the initial fill above and by save.js's applySaveData(), which calls
// this before layering saved counts on top by item type. Never derives
// the inventory's item-type layout from a save; see save.js for why.
function resetInventoryFromItemDefs() {
  inventory.fill(null);
  Object.keys(itemDefs).forEach((type, i) => {
    inventory[i] = { type, count: 99 };
  });
}

// default hotbar: slots 1-7 mirror inventory slots 0-6, same as before —
// but now this is just a starting point, freely reassignable via the
// inventory panel's action menu.
const hotbar = [0, 1, 2, 3, 4, 5, 6];

let selectedHotbarIndex = 0;
let heldItem = null; // null | { type, fromSlot }  (fromSlot = an INVENTORY index)
let inventoryOpen = false;

// Four independent "col,row" -> type layers, stacked bottom to top (see
// layerForType() near the top of this file):
//   terrainLayer — base terrain: Dirt, Water. Drawn first, beneath even
//                  groundLayer.
//   groundLayer  — terrain decals (the ground tileset, the Port/island
//                  edge tileset, flat pebbles): always flat, drawn next,
//                  no collision.
//   decorLayer   — wild grass/flowers (js/wildgrass.js): also flat/no
//                  collision, but kept separate from groundLayer/
//                  terrainLayer so placing one never replaces whatever's
//                  underneath it. Rendered with an always-fully-behind-
//                  the-player treatment and a sway animation instead of
//                  the plain flat draw groundLayer items get.
//   objectLayer  — things that stand on the ground (stones, trees, the
//                  house): depth-sorted with the player, and where
//                  collision is checked.
// Placing an item only ever reads/replaces within its OWN layer — putting
// Dirt down doesn't disturb a Port tile already there (different layers),
// but putting Dirt down over existing Dirt DOES replace it (same layer),
// same idea one level up for groundLayer, and for decor/object items.
/* ---------------- the six layers ----------------
   Bottom to top, exactly the order they're drawn and the order a click
   resolves through:

     1  dirtLayer     bare earth
     2  groundLayer   grass / water / the port tileset
     3  objectLayer   everything standing ON the ground — trees, stones,
                      bushes, fences, all the furniture, the buildings,
                      the floor tilesets, wild grass
     4  upperLayer    things that sit on TOP of furniture rather than on
                      the ground: plates, mugs, boards, crops, sockets
     5  wallLayer     windows, picture frames, posters, wall decor
     6  ceilingLayer  ceiling tiles

   Each layer holds at most ONE item per tile, and placing into a layer
   only ever replaces within that same layer — dropping Dirt doesn't
   disturb a tree above it, but dropping Dirt on Dirt does replace it.

   `groundOverlayLayer` is the one exception, and it exists because some
   things belong visually at ground level yet must NOT take the ground
   tile's place — per request, mushrooms, flowers, fallen leaves and the
   lit-window glow ("di niya mapapalitan yung 2nd layer na floor parang
   shadow lang kasi yan"). They're drawn straight after the ground layer,
   so they read as something lying on the floor rather than as the floor.
   Keeping them in their own map is what lets a mushroom and the grass
   under it both exist on one tile.
================================================================= */
const dirtLayer = new Map();          // 1
const groundLayer = new Map();        // 2
const groundOverlayLayer = new Map(); // 2, but layered over it rather than replacing it
const objectLayer = new Map();        // 3
// Also layer 3, but kept apart because wild grass isn't just a z-order:
// it's walkable, it bends as you move through it, and the one tile the
// player is standing on is drawn split around them (js/wildgrass.js,
// drawPlayerStandingDecor()). Per request that behaviour stays exactly
// as it is; only its place in the layer list is being made explicit. It
// Y-sorts together with objectLayer, so the two read as one layer.
const wildgrassLayer = new Map();     // 3
const upperLayer = new Map();         // 4
const wallLayer = new Map();          // 5
const ceilingLayer = new Map();       // 6

// Bottom-to-top. Anything that needs to sweep "every placed item" walks
// this, so a new layer only has to be added in one place.
const ALL_LAYERS = [
  dirtLayer, groundLayer, groundOverlayLayer, wildgrassLayer, objectLayer,
  upperLayer, wallLayer, ceilingLayer,
];
// Top-to-bottom — for "what did I just click / what's the topmost thing
// here", where the thing drawn last should answer first.
const ALL_LAYERS_TOP_FIRST = ALL_LAYERS.slice().reverse();

// "col,row" (the anchor tile, same key objectLayer would eventually use)
// -> { type, col, row, startAt, finishAt } — a multiTileFootprint item
// (the house skins) that's been placed but is still mid-construction (see
// `buildSeconds` in itemDefs, startConstruction()/updateConstructions()
// below). Not in objectLayer yet — no art, no collision, nothing — until
// the timer finishes; camera.js's drawPendingConstructions() draws the
// ghost preview + progress bar in the meantime. IS saved (js/save.js),
// same treatment as resources.js's pendingRespawns, so a build in
// progress survives a reload instead of finishing silently in the
// background or losing its progress.
const pendingConstructions = new Map();

function tileKey(col, row) {
  return col + "," + row;
}

function getPlayerTile() {
  // Use the character's FEET position, not the raw player.y (which is the
  // vertical center of the whole sprite's bounding box). The sprite is
  // taller than one tile (DRAW_SIZE = 48 world px = 3 tiles), so the
  // "center" of the box is roughly chest height, not where the character
  // is actually standing — that's why the highlighted tile looked shifted
  // up from the character in testing. This reuses the same feet math as
  // the ground shadow (SPRITE_FEET_FRACTION), so both line up consistently.
  const feetWorldY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  return {
    col: Math.floor(player.x / TILE),
    row: Math.floor(feetWorldY / TILE),
  };
}

function isWithinPlacementRange(col, row) {
  const p = getPlayerTile();
  // Chebyshev distance (a square range, not a circle) — simple and matches
  // "5 range ng tiles" without needing to justify a specific shape.
  return (
    Math.max(Math.abs(col - p.col), Math.abs(row - p.row)) <= PLACEMENT_RANGE
  );
}

/* ---------------- eating (consumables) ---------------- */

// Eats one of whatever's in `slotIndex`, if its itemDefs entry has a
// `consumable` block (right now: Meat). Restores food and health, then
// runs the SAME bookkeeping tail placing an item does
// (commitPlacementUse() — hotbar highlight, decrement unless
// `unlimited`, save, re-render), so eating and placing can never drift
// apart on how a stack is spent.
//
// Both bars are clamped to their maximum, and the whole thing is a no-op
// when you're already completely full — otherwise a click would silently
// burn an item for nothing.
function consumeItem(slotIndex) {
  const slot = inventory[slotIndex];
  if (!slot) return false;
  const def = itemDefs[slot.type];
  if (!def || !def.consumable) return false;

  const { food = 0, healthPercent = 0 } = def.consumable;
  const healthGain = (healthPercent / 100) * player.maxHealth;

  const foodRoom = player.maxFood - player.food;
  const healthRoom = player.maxHealth - player.health;
  if (foodRoom <= 0.001 && healthRoom <= 0.001) return false; // already full — don't waste it

  player.food = Math.min(player.maxFood, player.food + food);
  player.health = Math.min(player.maxHealth, player.health + healthGain);

  commitPlacementUse(slotIndex); // shared spend/save/re-render tail
  updateStatsHUD();              // reflect the new bars immediately, don't wait a frame
  return true;
}

/* ---------------- holding / placing ---------------- */

function holdSlot(slotIndex) {
  const slot = inventory[slotIndex];
  if (!slot || slot.count <= 0) return;
  heldItem = { type: slot.type, fromSlot: slotIndex };
  renderHotbar();
  renderInventory();
  renderHeldItemHUD();
}

function cancelHeldItem() {
  heldItem = null;
  renderHotbar();
  renderInventory();
  renderHeldItemHUD();
}

// Clicking a slot (inventory or hotbar) "uses" whatever's in it — for a
// weapon that means equipping it directly (no more hold-to-place step for
// weapons, per request: they're not something you plant on the ground),
// for a consumable it means eating it, and for anything else it's the
// existing hold-to-place flow.
//
// A consumable is still PLACEABLE — Meat is decor as well as food — so
// eating deliberately doesn't replace holding, it just takes the
// left-click/hotkey slot. "Hold" stays available on the right-click
// action menu (openItemActionMenu()), the same way weapons keep their
// Equip there.
function useOrHoldSlot(slotIndex) {
  const slot = inventory[slotIndex];
  if (!slot) return;
  if (itemDefs[slot.type].equipSlot === "weapon") {
    equipWeapon(slot.type);
  } else if (itemDefs[slot.type].consumable) {
    consumeItem(slotIndex);
  } else {
    holdSlot(slotIndex);
  }
}

/* ---------------- equipping (weapons) ---------------- */

// Equips a weapon by TYPE, not by slot index — same reasoning as the
// save-data rework (js/save.js): the type is stable identity, an
// inventory index isn't. `player.equippedWeapon` (js/player.js) is what
// the Equipment screen (G key) and the F-key attack (player.js) read.
function equipWeapon(type) {
  if (!itemDefs[type] || itemDefs[type].equipSlot !== "weapon") return;
  player.equippedWeapon = type;
  renderEquippedWeaponHUD();
  renderEquipmentSlots();
}

function unequipWeapon() {
  player.equippedWeapon = null;
  renderEquippedWeaponHUD();
  renderEquipmentSlots();
}

// True if EVERY tile a multiTileFootprint item would visually cover
// (the whole rectangle getMultiTileFootprintTiles() returns — not just
// the colliding subset, so the walkable back rows count too) is free of
// anything ELSE right now: not off the map edge, not already occupied in
// objectLayer, and not already claimed by another in-progress
// construction. Checked before a build can START (startConstruction()
// below) — this is what makes the preview highlight (camera.js's
// drawPlacementRange()) red/blocked, and what placeHeldItemAt() re-checks
// before actually starting the timer.
function isMultiTileFootprintAreaClear(type, anchorCol, anchorRow) {
  const tiles = getMultiTileFootprintTiles(type, anchorCol, anchorRow);
  for (const t of tiles) {
    if (t.col < 0 || t.row < 0 || t.col >= COLS || t.row >= ROWS) return false; // runs off the map
    if (getLayerItemId(objectLayer, t.col, t.row) !== null) return false;
    if (pendingConstructions.has(tileKey(t.col, t.row))) return false;
  }
  // Also check against every OTHER pending construction's full footprint
  // (not just its anchor tile) — two buildings-in-progress can't overlap
  // even if neither one's ANCHOR tile is the other's.
  for (const info of pendingConstructions.values()) {
    const otherTiles = getMultiTileFootprintTiles(
      info.type,
      info.col,
      info.row,
    );
    if (
      otherTiles.some((ot) =>
        tiles.some((t) => t.col === ot.col && t.row === ot.row),
      )
    )
      return false;
  }
  return true;
}

// Full validity check for placing a multiTileFootprint item's ANCHOR at
// (anchorCol, anchorRow): on the map, within PLACEMENT_RANGE, the whole
// footprint clear of other objects/constructions
// (isMultiTileFootprintAreaClear() above), and not about to trap the
// player under any tile that would end up colliding. Shared by
// placeHeldItemAt() (the real check right before starting a build) and
// camera.js's drawHouseFootprintPreview() (the live preview while
// holding one), so the preview's white/red never disagrees with what an
// actual click would do.
function canPlaceHouseFootprint(type, anchorCol, anchorRow) {
  if (anchorCol < 0 || anchorRow < 0 || anchorCol >= COLS || anchorRow >= ROWS)
    return false;
  if (!isWithinPlacementRange(anchorCol, anchorRow)) return false;
  if (wouldObjectTrapPlayer(type, anchorCol, anchorRow)) return false;
  return isMultiTileFootprintAreaClear(type, anchorCol, anchorRow);
}

// Starts a construction-in-progress at the given anchor tile — no art,
// no collision, nothing in objectLayer yet, just the timer entry;
// updateConstructions() (below) finishes the job once `buildSeconds`
// elapses. Caller (placeHeldItemAt()) is responsible for having already
// confirmed isMultiTileFootprintAreaClear().
function startConstruction(type, col, row) {
  pendingConstructions.set(tileKey(col, row), {
    type,
    col,
    row,
    startAt: Date.now(),
    finishAt: Date.now() + itemDefs[type].buildSeconds * 1000,
  });
}

// Called every frame (main.js's loop) — finishes any construction whose
// timer has elapsed by actually writing it into objectLayer (real art,
// real collision, from that point on exactly like any other placed
// house). Wall-clock based (Date.now()), same approach as
// resources.js's respawns, so a build keeps counting down even while the
// tab is closed instead of pausing.
//
// Safety check before finishing: if the player is currently standing on
// one of the tiles that's about to start colliding, finishing right now
// would trap them in place (same self-trap concern placeHeldItemAt()'s
// own-tile check guards against for an instant placement) — so a
// construction simply WAITS at 0:00 (still drawn as a finished progress
// bar) until they step off it, rather than ever locking the player in.
function updateConstructions() {
  if (pendingConstructions.size === 0) return;
  const now = Date.now();
  pendingConstructions.forEach((info, key) => {
    if (now < info.finishAt) return;
    if (wouldObjectTrapPlayer(info.type, info.col, info.row)) return; // keep waiting — try again next frame
    objectLayer.set(key, info.type);
    pendingConstructions.delete(key);
    saveGame();
  });
}

function placeHeldItemAt(col, row) {
  if (!heldItem) return;

  // `interiorOnly` items (right now, just the Collision Block — see
  // itemDefs) place into an interior room's own `collisions` map
  // instead of any outdoor layer; hand off to interior.js's version
  // entirely rather than falling through to the outdoor-grid logic
  // below, which knows nothing about room-local coordinates.
  if (itemDefs[heldItem.type].interiorOnly) {
    placeInteriorCollisionAt(col, row);
    return;
  }

  // Any OTHER item, held while actually inside a room, places into that
  // room's own `decor` map instead (js/interior.js's
  // placeInteriorDecorAt()) — per request: ordinary items (doors,
  // picture frames, windows, furniture) can be placed indoors now too,
  // stacking freely with a Collision Block on the same tile since the
  // two maps never check each other. Falls through to the outdoor logic
  // below only while `scene === "outside"`.
  if (player.scene === "inside") {
    placeInteriorDecorAt(col, row);
    return;
  }

  // Placement targets the outdoor tile grid (screenToTile() reads camX/
  // camY, which only make sense for the outdoor camera) — scene is
  // guaranteed "outside" here (the "inside" case returned just above).
  if (player.scene !== "outside") return;
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return; // outside the map
  if (!isWithinPlacementRange(col, row)) return; // outside the 5-tile range

  // A colliding item can never be placed on the player's OWN tile — per
  // request ("stock ako, di makagalaw"), placing a collidable item (a
  // Port tile, a Stone, etc.) right under yourself trapped the player
  // permanently: movement is checked per-tile
  // (isTileBlocked()/feetTileAt(), player.js), and a single frame's
  // motion rarely crosses a tile boundary, so the destination tile
  // computed for a tiny nudge is usually still the SAME tile the player
  // is already standing on — if THAT tile is blocked, every direction
  // keeps re-checking the same blocked tile and refuses to move, with no
  // way out. `PLACEMENT_RANGE`'s highlighted area includes the player's
  // own tile at offset (0,0), so nothing else was stopping a click there.
  const playerTile = getPlayerTile();
  if (
    itemDefs[heldItem.type].collides &&
    col === playerTile.col &&
    row === playerTile.row
  )
    return;

  const def = itemDefs[heldItem.type];
  const layer = layerForType(heldItem.type);
  const existingId = getLayerItemId(layer, col, row);
  // Per request ("kapag may object na nakalagay na sa tile di na pwedeng
  // lagyan") — a tile already occupied in the target layer BLOCKS
  // placement entirely now, whether it's the same item or a different
  // one. This replaces the earlier "different item gets replaced,
  // falls through and overwrites" rule with a real layer-respecting
  // block, matching drawPlacementRange()'s highlight (camera.js), which
  // now only ever shows two states: empty (valid) or occupied (blocked)
  // — no more "will be replaced" case. The OTHER layer (if anything's
  // there) was never touched either way — placing a tree doesn't
  // disturb the ground tile under it, and vice versa, since they live
  // in separate maps.
  if (existingId !== null) return;

  // `multiTileFootprint` + `buildSeconds` (the house skins) — per
  // request ("dapat mag countdown 10 sec... tyaka lang matatayo yung
  // bahay"), placing one doesn't drop it in instantly: it starts a
  // timed construction (startConstruction()/updateConstructions() above)
  // that only becomes a real, colliding objectLayer entry once the timer
  // finishes. The WHOLE footprint (not just this anchor tile) has to be
  // clear first — isMultiTileFootprintAreaClear() re-checks that with
  // the same rules the preview highlight already showed as red/blocked.
  if (def.multiTileFootprint && def.buildSeconds) {
    if (!canPlaceHouseFootprint(heldItem.type, col, row)) return;
    startConstruction(heldItem.type, col, row);
  } else {
    layer.set(tileKey(col, row), heldItem.type);
  }

  commitPlacementUse(heldItem.fromSlot);
}

// Shared tail of placeHeldItemAt() (outdoor layers) and
// placeInteriorCollisionAt() (js/interior.js's room.collisions) — once
// whichever map actually got the new entry, both do the exact same
// bookkeeping: keep the hotbar highlight following the slot being
// placed from, decrement/clear it (unless `unlimited`), stop holding if
// the stack just ran out, save, and re-render the hotbar/inventory/
// held-item HUD.
function commitPlacementUse(usedSlotIndex) {
  // if that inventory slot happens to be on the hotbar, move the
  // selection highlight to follow it — so whatever you're actively
  // placing is the one shown as "active" on the hotbar
  const hotbarIdx = hotbar.indexOf(usedSlotIndex);
  if (hotbarIdx !== -1) selectedHotbarIndex = hotbarIdx;

  const slot = inventory[usedSlotIndex];
  // Unlimited items (see itemDefs) never decrement or run out — everything
  // below this check is the original stacking/count logic, untouched, for
  // any item that doesn't have that flag.
  if (slot && !itemDefs[slot.type].unlimited) {
    slot.count -= 1;
    if (slot.count <= 0) inventory[usedSlotIndex] = null;

    // stop holding once the stack runs out; otherwise keep placing more
    if (!inventory[usedSlotIndex]) {
      heldItem = null;
    }
  }

  saveGame(); // save right away on the most important action, not just on the timer

  renderHotbar();
  renderInventory();
  renderHeldItemHUD();
}

/* ---------------- E-key grab/place (world objects, not inventory) ---------------- */
//
// A SEPARATE mechanic from the hold-to-place system above: E grabs a
// wild grass/flower/stone/tree straight out of the world (directly in
// front of the player) and lets you set it back down somewhere else,
// without ever touching the inventory/hotbar. `player.grabbedType`
// (js/player.js) tracks what's currently in hand; both functions below
// are called from there once the "collect" animation finishes.

// The tile directly in front of the player, based on their current
// `facing` — always exactly 1 tile away, matching "laging 1 tile bago
// [sa] character tile" from the request.
function getTileInFrontOfPlayer() {
  const p = getPlayerTile();
  switch (player.facing) {
    case "up":
      return { col: p.col, row: p.row - 1 };
    case "down":
      return { col: p.col, row: p.row + 1 };
    case "left":
      return { col: p.col - 1, row: p.row };
    case "right":
      return { col: p.col + 1, row: p.row };
    default:
      return p;
  }
}

// Grabs whatever's on the tile in front of the player (if anything —
// checked across all FOUR layers: decorLayer, objectLayer, groundLayer,
// terrainLayer, so any placed item is grabbable EXCEPT the house), or
// places whatever's currently grabbed back down there instead — blocked
// if that tile's target layer already has something on it (see
// placeHeldItemAt()'s matching rule, above). Multi-tile-footprint items
// (the Big Tree, the house) are still placed/grabbed by their single
// anchor tile, same as the mouse-based hold-to-place system already
// does — their wider collision (getObjectFootprintBlockedTiles(), above)
// is derived from that anchor automatically, no special-casing needed
// here (the house is excluded from grabbing entirely, below, so this
// only ever matters for the Big Tree).
// Grabs whatever's on the tile the player is standing on or facing (if
// anything), or places whatever's currently grabbed back down instead —
// blocked if the target tile's layer already has something on it (see
// placeHeldItemAt()'s matching rule, above). Multi-tile-footprint items
// (the Big Tree, the house) are still placed/grabbed by their single
// anchor tile, same as the mouse-based hold-to-place system already
// does — their wider collision (getObjectFootprintBlockedTiles(), above)
// is derived from that anchor automatically, no special-casing needed
// here (the house is excluded from grabbing entirely, below, so this
// only ever matters for the Big Tree).
//
// WHICH tile depends on whether the item COLLIDES (per request): a
// colliding object (a tree, a collidable stone) is always checked/placed
// on the tile 1 IN FRONT of the player, since they physically can't be
// standing on one of those. Everything else — decorLayer, groundLayer,
// terrainLayer items, all flat/walkable — is checked/placed on the
// player's OWN tile instead, since that's where they'd actually be
// standing on one.
// Looks for a grabbable item in `layer` — checking the player's OWN tile
// FIRST, for whatever's there regardless of whether it collides, before
// falling back to the FRONT tile for a colliding item. Checking "here"
// first (rather than only checking "front" for anything that collides)
// matters as an escape hatch: normally a colliding item can never end up
// on the player's own tile, but placeHeldItemAt() used to allow exactly
// that (a self-trap bug, since fixed there too) — if a stray colliding
// item is ever somehow sitting under the player regardless of how it got
// there, grabbing needs to be able to find and remove it, not just
// assume it's impossible and only ever look in front. Returns { type,
// col, row } or null.
// Finds whichever item in `layer` covers (col,row) — a direct key match
// first (any item, single-tile or not), or failing that, scans for a
// `fixedFootprint` item (Big Stone, Big/Small Bed — inventory.js's
// itemDefs) whose actual blocked area (getObjectFootprintBlockedTiles())
// includes this tile even though it's anchored elsewhere. Without this,
// a multi-tile item could only ever be grabbed/interacted with by
// facing its EXACT anchor tile — one out of however many tiles its art
// visually covers — which reads as "not working at all" for anything
// wider than 1x1 (bedBig's 3x3, say). Returns { type, anchorCol,
// anchorRow } or null.
function findFootprintCoveringTile(layer, col, row) {
  const direct = getLayerItemId(layer, col, row);
  if (direct) return { type: direct, anchorCol: col, anchorRow: row };

  // An item only has a map entry on its ANCHOR tile, so every OTHER tile
  // it covers has to be found by walking the layer and re-deriving each
  // item's real blocked footprint. Both multi-tile shapes are searched —
  // `fixedFootprint` (the Big Bed) and `multiTileFootprint` (benches,
  // houses, chimneys, tables...) — per request, so the E-grab reaches a
  // bench from ANY of the four tiles it collides on rather than only the
  // one it happened to be placed from.
  //
  // getObjectFootprintBlockedTiles() is deliberately what's asked: it's
  // the same list movement collides against, including its carve-outs
  // (a house's door tile, cells where the art is actually transparent).
  // So "can I grab it here" lines up exactly with "does it block me
  // here", with no second, slightly-different idea of the item's size.
  //
  // `fixedFootprint` items get a first pass of their own so this can
  // only ADD matches, never change an existing one: the Big Bed lookups
  // in js/resources.js take a single hit and test its type, so a bench
  // overlapping a bed must not be able to answer first and hide it.
  for (const pass of ["fixedFootprint", "multiTileFootprint"]) {
    for (const [key, type] of layer) {
      const def = itemDefs[type];
      if (!def || !def[pass]) continue; // stale/removed type left in a layer — skip, don't crash
      const [anchorCol, anchorRow] = key.split(",").map(Number);
      const tiles = getObjectFootprintBlockedTiles(type, anchorCol, anchorRow);
      if (tiles.some((t) => t.col === col && t.row === row)) {
        return { type, anchorCol, anchorRow };
      }
    }
  }
  return null;
}

// A solid object occupying the tile the player is FACING, or null.
// findFootprintCoveringTile() is what makes this reach a multi-tile item
// from any tile it covers, not just the one it was placed on.
//
// Only `collides` items count here, and that's the whole distinction the
// grab priority rests on: an OBJECT in front is something you reach out
// and pick up, while the floor you're standing on is something you peel
// up from under your own feet. A flat floor tile in front of you is
// neither, so it stays out of this pass.
function findGrabbableInFront(layer, front) {
  if (!front) return null;
  const hit = findFootprintCoveringTile(layer, front.col, front.row);
  if (!hit) return null;
  const def = itemDefs[hit.type];
  if (!def.collides) return null;
  // Houses stay un-grabbable: they're built on a timer
  // (`buildSeconds` — startConstruction()), not carried around. This
  // used to exclude every `multiTileFootprint` item, which swept up all
  // the multi-tile FURNITURE with them — the benches, tables, couches —
  // and was why a bench could never be picked up no matter which of its
  // tiles you faced.
  if (def.buildSeconds) return null;
  return { type: hit.type, col: hit.anchorCol, row: hit.anchorRow };
}

// Whatever is sitting on the player's OWN tile — the floor underfoot.
function findGrabbableHere(layer, here) {
  const type = getLayerItemId(layer, here.col, here.row);
  return type ? { type, col: here.col, row: here.row } : null;
}

function tryGrabOrPlaceInFront() {
  if (player.grabbedType) {
    const type = player.grabbedType;
    const target = itemDefs[type].collides
      ? getTileInFrontOfPlayer()
      : getPlayerTile();
    if (
      target.col < 0 ||
      target.row < 0 ||
      target.col >= COLS ||
      target.row >= ROWS
    )
      return;

    const layer = layerForType(type);
    const existing = getLayerItemId(layer, target.col, target.row);
    if (existing !== null) return; // occupied — stays in hand
    layer.set(tileKey(target.col, target.row), type);
    player.grabbedType = null;
    player.mode = "normal";
    saveGame();
    return;
  }

  // Nothing in hand yet — try to grab, checked in the same "most on top
  // first" priority as before (decorLayer, objectLayer, groundLayer,
  // terrainLayer), but each layer now picks its own tile per-item via
  // findGrabbableInLayer() rather than assuming a whole layer is always
  // colliding or never colliding.
  const rawFront = getTileInFrontOfPlayer();
  const front =
    rawFront.col >= 0 &&
    rawFront.row >= 0 &&
    rawFront.col < COLS &&
    rawFront.row < ROWS
      ? rawFront
      : null;
  const here = getPlayerTile();

  // Per request ("kapag may object sa harap mas mauunang ma grab ang
  // object kaysa sa ground floor; kapag wala naman object sa harap is
  // yung ground floor ang makukuha"): what you're FACING is checked
  // across every layer FIRST, and only if there's nothing there does it
  // fall back to the tile under your feet.
  //
  // The old order asked each layer "here, then front" in turn, so the
  // floor tile the player happened to be standing on always answered
  // before anything they were facing — you could be nose-to-nose with a
  // bench and still pull up the grass underneath yourself.
  //
  // Within each pass the layers keep their usual "most on top first"
  // order (decor, object, ground, terrain).
  const layers = ALL_LAYERS_TOP_FIRST;
  let found = null;
  let layer = null;

  for (const candidate of layers) {
    const hit = findGrabbableInFront(candidate, front);
    if (hit) { found = hit; layer = candidate; break; }
  }
  if (!found) {
    for (const candidate of layers) {
      const hit = findGrabbableHere(candidate, here);
      if (hit) { found = hit; layer = candidate; break; }
    }
  }
  if (!found) return; // nothing grabbable, on either tile, on any layer

  layer.delete(tileKey(found.col, found.row));
  player.grabbedType = found.type;
  player.mode = "carrying";
  saveGame();
}

// Keeps whatever's currently grabbed (js/inventory.js's
// tryGrabOrPlaceInFront()) by stashing it into the inventory instead of
// setting it back down in the world — bound to "R", a no-op if nothing's
// grabbed. Reuses grantItem() (js/resources.js) — the same "add to an
// existing slot by type" function harvesting already grants drops
// through, so a kept wild grass/flower/stone/tree just becomes a normal
// placeable inventory item again, same as any other.
function tryKeepGrabbedItem() {
  if (!player.grabbedType) return;
  grantItem(player.grabbedType, 1);
  player.grabbedType = null;
  player.mode = "normal";
  saveGame();
}

// Throws away whatever's currently grabbed — bound to "T", a no-op if
// nothing's grabbed. Per request, this lands 2 tiles out in whichever
// direction the player's facing (further than E's 1-tile place) — same
// "occupied blocks it" rule as every other placement action (stays in
// hand if that spot isn't free). The actual placement happens
// synchronously, right here, same as every other action in this project
// (grantItem(), placeHeldItemAt(), harvesting's drops); spawnThrowToss()
// (resources.js) is purely a cosmetic arc drawn on top afterward, not
// something the real effect waits on — this avoids a whole class of
// "reload mid-animation" data-loss bugs the floating pickups
// (resources.js) get away with because THEY never remove anything from
// the world in the first place.
// Throws away whatever's currently grabbed — bound to "T", a no-op if
// nothing's grabbed. It doesn't get placed anywhere permanently: it
// tosses out to a tile 2 out in whichever direction the player's facing
// (further than E's 1-tile place, same as before), then — once it
// visually lands — blinks 3 times and is destroyed for good. The item
// leaves the player's hand immediately (grabbedType clears right away,
// matching real throwing — you let go before it lands), and the whole
// toss-then-blink-then-gone sequence is purely cosmetic
// (spawnThrowToss(), resources.js) — nothing is ever written into any
// layer for the thrown item, so there's no placement to block or worry
// about landing on an occupied tile.
function tryThrowGrabbedItem() {
  if (!player.grabbedType) return;
  const p = getPlayerTile();
  let target;
  switch (player.facing) {
    case "up":
      target = { col: p.col, row: p.row - 2 };
      break;
    case "down":
      target = { col: p.col, row: p.row + 2 };
      break;
    case "left":
      target = { col: p.col - 2, row: p.row };
      break;
    case "right":
      target = { col: p.col + 2, row: p.row };
      break;
    default:
      target = p;
  }
  if (
    target.col < 0 ||
    target.row < 0 ||
    target.col >= COLS ||
    target.row >= ROWS
  )
    return; // nowhere to throw it, off the edge of the map — stays in hand

  spawnThrowToss(
    player.grabbedType,
    player.x,
    player.y,
    target.col,
    target.row,
  );
  player.grabbedType = null;
  player.mode = "normal";
  saveGame();
}

// screen px (mouse client coords) -> world tile col/row, using the
// camera's current camX/camY/zoom (from camera.js).
// screen px (mouse client coords) -> world x/y, using the camera's
// current camX/camY/zoom (from camera.js). Shared by screenToTile()
// below and js/npc.js's click hit-test (an NPC's position is continuous
// world x/y, not tile-aligned, so it needs the raw coordinates rather
// than a col/row).
function screenToWorld(clientX, clientY) {
  const rect = view.getBoundingClientRect();
  const scaleX = view.width / rect.width;
  const scaleY = view.height / rect.height;
  const sx = (clientX - rect.left) * scaleX;
  const sy = (clientY - rect.top) * scaleY;
  return { x: camX + sx / zoom, y: camY + sy / zoom };
}

function screenToTile(clientX, clientY) {
  const { x, y } = screenToWorld(clientX, clientY);
  return { col: Math.floor(x / TILE), row: Math.floor(y / TILE) };
}

// True while the left mouse button is held down (with an item held), for
// continuous placement — see updateHeldItemPlacement() below.
let isPlacingHeld = false;
let lastMouseClientX = 0;
let lastMouseClientY = 0;

// Called once from main.js after the canvas exists — wires up the
// mouse/keyboard handlers for placing/canceling a held item.
//
// Placement is now hold-to-drop, not click-to-drop: pressing the left
// button places immediately, and holding it down keeps placing as the
// cursor moves over new tiles (or the same tile, if it's a different item
// that should replace what's there) — no repeated clicking needed.
// `placeHeldItemAt()`'s existing "same item already there -> no-op" check
// (js/inventory.js) is what stops holding still on one tile from burning
// through the whole stack instantly: it only actually places once per
// tile until something there changes.
function setupPlacementClickHandler() {
  view.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !heldItem) return; // left button only
    isPlacingHeld = true;
    lastMouseClientX = e.clientX;
    lastMouseClientY = e.clientY;
    const { col, row } = screenToTile(e.clientX, e.clientY);
    placeHeldItemAt(col, row);
  });

  // Listen on `window`, not `view`, so releasing the button after dragging
  // the cursor off the canvas still stops continuous placement.
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) isPlacingHeld = false;
  });

  view.addEventListener("mousemove", (e) => {
    lastMouseClientX = e.clientX;
    lastMouseClientY = e.clientY;
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancelHeldItem();
  });
}

// Called every frame from main.js's loop — keeps placing at the current
// mouse position while the left button stays held (see
// setupPlacementClickHandler() above). No-ops instantly if the button
// isn't down or nothing's held, so it's cheap to call unconditionally.
function updateHeldItemPlacement() {
  if (!isPlacingHeld || !heldItem) return;
  const { col, row } = screenToTile(lastMouseClientX, lastMouseClientY);
  placeHeldItemAt(col, row);
}

/* ---------------- UI: held-item HUD (item icon + name + Unhold button) ---------------- */

const heldItemHudEl = document.getElementById("held-item-hud");
const heldItemHudIconEl = document.getElementById("held-item-hud-icon");
const heldItemHudNameEl = document.getElementById("held-item-hud-name");
const heldItemHudUnholdBtn = document.getElementById("held-item-hud-unhold");

// Shows what's currently held (icon + name) with a button to release it —
// same effect as pressing Esc, just visible/clickable instead of a hidden
// keyboard shortcut. Hidden entirely while nothing is held.
function renderHeldItemHUD() {
  if (!heldItem) {
    heldItemHudEl.classList.add("hidden");
    return;
  }
  const def = itemDefs[heldItem.type];
  heldItemHudIconEl.src = def.icon.src;
  heldItemHudIconEl.alt = def.name;
  heldItemHudNameEl.textContent = "Holding: " + def.name;
  heldItemHudEl.classList.remove("hidden");
}

heldItemHudUnholdBtn.addEventListener("click", () => cancelHeldItem());

/* ---------------- UI: equipped-weapon HUD (icon + name + Unequip button) ---------------- */

const equippedWeaponHudEl = document.getElementById("equipped-weapon-hud");
const equippedWeaponHudIconEl = document.getElementById(
  "equipped-weapon-hud-icon",
);
const equippedWeaponHudNameEl = document.getElementById(
  "equipped-weapon-hud-name",
);
const equippedWeaponHudUnequipBtn = document.getElementById(
  "equipped-weapon-hud-unequip",
);

// Shows the currently-equipped weapon (icon + name) with a button to
// unequip it. Hidden entirely while nothing is equipped. This is a
// persistent status indicator (unlike the held-item HUD, which only
// shows during an active hold) — equipping is a standing choice, not a
// momentary action.
function renderEquippedWeaponHUD() {
  if (!player.equippedWeapon) {
    equippedWeaponHudEl.classList.add("hidden");
    return;
  }
  const def = itemDefs[player.equippedWeapon];
  equippedWeaponHudIconEl.src = def.icon.src;
  equippedWeaponHudIconEl.alt = def.name;
  equippedWeaponHudNameEl.textContent = "Equipped: " + def.name;
  equippedWeaponHudEl.classList.remove("hidden");
}

equippedWeaponHudUnequipBtn.addEventListener("click", () => unequipWeapon());

/* ---------------- UI: equipment screen (character + weapon slot, G key) ---------------- */

const equipmentOverlayEl = document.getElementById("equipment-overlay");
const equipmentCanvasEl = document.getElementById("equipment-character-canvas");
const equipmentSlotWeaponEl = document.getElementById("equipment-slot-weapon");
const equipmentSlotWeaponIconEl = document.getElementById(
  "equipment-slot-weapon-icon",
);
const equipmentPickerEl = document.getElementById("equipment-weapon-picker");
let equipmentOpen = false;

// Draws just the FIRST frame of Idle_Down (64x64, top-left of the sheet)
// onto the equipment screen's preview canvas, scaled up — a static
// "profile view" of the character, same idea as the reference image's
// centered character render. Uses the same nearest-neighbor (no
// smoothing) convention as every other sprite draw in this project.
function renderEquipmentCharacterPreview() {
  const ctx2 = equipmentCanvasEl.getContext("2d");
  ctx2.imageSmoothingEnabled = false;
  ctx2.clearRect(0, 0, equipmentCanvasEl.width, equipmentCanvasEl.height);
  ctx2.drawImage(
    assets.idleDown,
    0,
    0,
    FRAME_SIZE,
    FRAME_SIZE, // source: first frame only
    0,
    0,
    equipmentCanvasEl.width,
    equipmentCanvasEl.height, // dest: fill the canvas
  );
}

// Fills in the weapon slot's icon (or the empty "+" placeholder) to match
// player.equippedWeapon. Called whenever the equip state changes, not
// just while the screen is open, so it's already correct the next time
// it's opened.
function renderEquipmentSlots() {
  equipmentSlotWeaponIconEl.innerHTML = "";
  if (player.equippedWeapon) {
    const def = itemDefs[player.equippedWeapon];
    const img = document.createElement("img");
    img.src = def.icon.src;
    img.alt = def.name;
    equipmentSlotWeaponIconEl.appendChild(img);
  } else {
    equipmentSlotWeaponIconEl.textContent = "+";
  }
}

function toggleEquipment() {
  equipmentOpen = !equipmentOpen;
  equipmentOverlayEl.classList.toggle("hidden", !equipmentOpen);
  closeEquipmentWeaponPicker();
  if (equipmentOpen) {
    renderEquipmentCharacterPreview();
    renderEquipmentSlots();
  }
}

function closeEquipmentWeaponPicker() {
  equipmentPickerEl.classList.add("hidden");
  equipmentPickerEl.innerHTML = "";
}

// Lists every weapon-type item the player has (deduplicated by type —
// the picker offers each weapon once regardless of stack/slot count),
// plus an Unequip entry when one's already equipped. Clicking an item
// equips it via the same equipWeapon() the inventory's right-click menu
// uses (js/inventory.js) — this is just a second entry point to the same
// action, not a separate equip mechanic.
function openEquipmentWeaponPicker() {
  equipmentPickerEl.innerHTML = "";

  if (player.equippedWeapon) {
    const unequipBtn = document.createElement("button");
    unequipBtn.className = "equipment-picker-unequip";
    unequipBtn.textContent = "Unequip";
    unequipBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      unequipWeapon();
      closeEquipmentWeaponPicker();
    });
    equipmentPickerEl.appendChild(unequipBtn);
  }

  const seenTypes = new Set();
  inventory.forEach((slot) => {
    if (
      !slot ||
      itemDefs[slot.type].equipSlot !== "weapon" ||
      seenTypes.has(slot.type)
    )
      return;
    seenTypes.add(slot.type);

    const def = itemDefs[slot.type];
    const btn = document.createElement("button");
    btn.className = "equipment-picker-item";

    const img = document.createElement("img");
    img.src = def.icon.src;
    img.alt = def.name;
    btn.appendChild(img);

    const label = document.createElement("span");
    label.textContent = def.name;
    btn.appendChild(label);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      equipWeapon(slot.type);
      closeEquipmentWeaponPicker();
    });
    equipmentPickerEl.appendChild(btn);
  });

  // beside the slot, nudged back on-screen if it would overflow
  positionPopupNear(equipmentPickerEl, equipmentSlotWeaponEl);
}

equipmentSlotWeaponEl.addEventListener("click", () => {
  if (equipmentPickerEl.classList.contains("hidden"))
    openEquipmentWeaponPicker();
  else closeEquipmentWeaponPicker();
});

// close the picker if you click anywhere outside it (same pattern as
// the inventory's item-action-menu below)
document.addEventListener("click", (e) => {
  if (equipmentPickerEl.classList.contains("hidden")) return;
  if (e.target === equipmentPickerEl || equipmentPickerEl.contains(e.target))
    return;
  if (
    e.target === equipmentSlotWeaponEl ||
    equipmentSlotWeaponEl.contains(e.target)
  )
    return;
  closeEquipmentWeaponPicker();
});

/* ---------------- UI: hotbar ---------------- */

const hotbarEl = document.getElementById("hotbar");

function renderHotbar() {
  hotbarEl.innerHTML = "";
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const invIndex = hotbar[i];
    const slot = invIndex !== null ? inventory[invIndex] : null;
    const box = document.createElement("div");
    box.className = "hotbar-slot";
    if (i === selectedHotbarIndex) box.classList.add("selected");
    if (heldItem && invIndex !== null && heldItem.fromSlot === invIndex)
      box.classList.add("held");

    const number = document.createElement("span");
    number.className = "slot-number";
    number.textContent = i + 1;
    box.appendChild(number);

    if (slot) {
      const img = document.createElement("img");
      img.src = itemDefs[slot.type].icon.src;
      img.alt = itemDefs[slot.type].name;
      box.appendChild(img);

      const count = document.createElement("span");
      count.className = "slot-count";
      count.textContent = itemDefs[slot.type].unlimited ? "∞" : slot.count;
      box.appendChild(count);
    }

    // hotbar slots are for quick reuse — click just uses/holds directly,
    // it doesn't open the assign menu (that's only in the full inventory)
    box.addEventListener("click", () => {
      selectedHotbarIndex = i;
      if (slot) useOrHoldSlot(invIndex);
      else renderHotbar();
    });

    hotbarEl.appendChild(box);
  }
}

/* ---------------- UI: inventory panel ---------------- */

const inventoryOverlayEl = document.getElementById("inventory-overlay");
const inventoryGridEl = document.getElementById("inventory-grid");

function renderInventory() {
  inventoryGridEl.innerHTML = "";
  inventoryGridEl.style.gridTemplateColumns = `repeat(${INVENTORY_COLS}, 1fr)`;

  const renderedGroups = new Set(); // group id -> already appended its one consolidated slot

  for (let i = 0; i < inventory.length; i++) {
    const slot = inventory[i];
    const group = slot ? tileGroupByType[slot.type] : null;

    if (group) {
      if (renderedGroups.has(group.id)) continue; // this family's one slot is already in the grid — skip its other members entirely (this is what actually frees up the space)
      renderedGroups.add(group.id);
      inventoryGridEl.appendChild(buildTileGroupSlotBox(group));
      continue;
    }

    const box = document.createElement("div");
    box.className = "inv-slot";
    if (heldItem && heldItem.fromSlot === i) box.classList.add("held");

    if (slot) {
      const img = document.createElement("img");
      img.src = itemDefs[slot.type].icon.src;
      img.alt = itemDefs[slot.type].name;
      box.appendChild(img);

      const count = document.createElement("span");
      count.className = "slot-count";
      count.textContent = itemDefs[slot.type].unlimited ? "∞" : slot.count;
      box.appendChild(count);

      // left click uses/holds it directly (same as clicking a hotbar
      // slot) — a weapon equips immediately, anything else picks it up
      // to place; right click opens the assign-to-1-7 menu (+ Hold for
      // non-weapons)
      box.addEventListener("click", () => useOrHoldSlot(i));
      box.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openItemActionMenu(i, box);
      });
    }

    inventoryGridEl.appendChild(box);
  }
}

// One consolidated slot standing in for an entire tile family (see the
// "tile groups" block above itemDefs) — a small side-by-side preview of
// up to 9 of its member icons (capped so it still reads as "one slot",
// not a second mini-grid; a "+N" badge covers anything beyond that,
// e.g. Port's 23 members). Clicking it opens the variant picker instead
// of holding anything directly, since the slot itself isn't any one
// real item.
function buildTileGroupSlotBox(group) {
  const box = document.createElement("div");
  box.className = "inv-slot inv-slot-group";
  box.title =
    group.name + " (" + group.members.length + " tiles) — click to choose";

  // Highlight the family's slot green while the player is holding ANY
  // one of its members, same idea as a normal slot's `.held` state.
  if (heldItem && tileGroupByType[heldItem.type] === group)
    box.classList.add("held");

  // Two ways a family can present itself in its one slot:
  //
  //  - `singleIcon` groups (the sliced fence/floor sheets) show ONE icon,
  //    the member flagged `groupIcon: true` in itemDefs — the sheet's
  //    dead-centre tile. Per request ("lagay ka lang ng isang icon nila,
  //    siguro lagay mo yung pinaka inner mid na tile"): these families
  //    run to 19-21 members whose cells are near-identical at preview
  //    size, so the packed grid below turned into unreadable mush. One
  //    clean tile reads far better, and the picker is one click away.
  //
  //  - everything else (grass/dirt/water/port/stone/tree) keeps the
  //    packed multi-icon preview, which suits families whose members
  //    genuinely look different from one another.
  const meta = TILE_GROUP_META[group.id];
  const iconType = meta && meta.singleIcon
    ? group.members.find((t) => itemDefs[t].groupIcon) || group.members[0]
    : null;

  if (iconType) {
    const img = document.createElement("img");
    img.src = itemDefs[iconType].icon.src;
    img.alt = group.name;
    box.appendChild(img);
  } else {
    const preview = document.createElement("div");
    preview.className = "inv-group-preview";
    const shown = group.members.slice(0, 9);
    const cols = shown.length <= 3 ? shown.length : 3;
    preview.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    shown.forEach((type) => {
      const img = document.createElement("img");
      img.src = itemDefs[type].icon.src;
      img.alt = itemDefs[type].name;
      preview.appendChild(img);
    });
    box.appendChild(preview);

    if (group.members.length > shown.length) {
      const more = document.createElement("span");
      more.className = "inv-group-more";
      more.textContent = "+" + (group.members.length - shown.length);
      box.appendChild(more);
    }
  }

  box.addEventListener("click", () => openTileVariantPicker(group, box));
  box.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openTileVariantPicker(group, box);
  });

  return box;
}

function toggleInventory() {
  inventoryOpen = !inventoryOpen;
  inventoryOverlayEl.classList.toggle("hidden", !inventoryOpen);
  closeItemActionMenu();
  closeTileVariantPicker();
}

/* ---------------- UI: popup placement (shared by all three popups) ----------------
   Every popup in here — the tile-variant picker, the item action menu and
   the equipment picker — opens beside the slot that was clicked. Placing
   it at the slot's own top is fine near the top of the inventory, but a
   slot far down the grid put the popup's top near the bottom of the
   screen, so most of it hung off the edge and the Hold button and the 1-7
   hotkey row were unreachable. Per request ("kapag medyo mababa na yung
   item sa inventory, yung popup medyo taasan mo lang").

   So: show it first (a hidden element measures as 0x0, so its real height
   can't be known until it's visible), then slide it back inside the
   viewport if it would overflow — upward if it runs off the bottom, and
   flipped to the slot's other side if it runs off the right. It only ever
   moves as much as it has to, so a popup that already fits stays exactly
   where it was. */
const POPUP_VIEWPORT_MARGIN = 8;

function positionPopupNear(popupEl, anchorEl) {
  popupEl.classList.remove("hidden"); // must be visible before it can be measured

  const rect = anchorEl.getBoundingClientRect();
  const w = popupEl.offsetWidth;
  const h = popupEl.offsetHeight;
  const m = POPUP_VIEWPORT_MARGIN;

  let left = rect.right + m;
  // Off the right edge? Put it on the slot's left instead, and if there's
  // no room there either, just clamp inside the window.
  if (left + w > window.innerWidth - m) {
    left = rect.left - w - m;
    if (left < m) left = Math.max(m, window.innerWidth - w - m);
  }

  let top = rect.top;
  // Off the bottom? Lift it just enough to fit, never past the top edge.
  if (top + h > window.innerHeight - m) {
    top = Math.max(m, window.innerHeight - h - m);
  }

  popupEl.style.left = left + "px";
  popupEl.style.top = top + "px";
}

/* ---------------- UI: tile variant picker (tile-group slots only) ---------------- */

const tileVariantPickerEl = document.getElementById("tile-variant-picker");

function closeTileVariantPicker() {
  tileVariantPickerEl.classList.add("hidden");
  tileVariantPickerEl.innerHTML = "";
}

// Opens next to a consolidated tile-group slot (buildTileGroupSlotBox()
// above) — lists every member of that family at normal icon size.
// Picking one opens the SAME Hold/1-7 openItemActionMenu() every other
// item already uses, anchored to the button just clicked; the family
// popup itself closes first so it doesn't sit on screen behind it.
function openTileVariantPicker(group, anchorEl) {
  tileVariantPickerEl.innerHTML = "";

  const label = document.createElement("div");
  label.className = "action-menu-label";
  label.textContent = group.name;
  tileVariantPickerEl.appendChild(label);

  const grid = document.createElement("div");
  grid.className = "tile-variant-grid";
  group.members.forEach((type) => {
    const slotIndex = inventoryIndexByType[type];
    const btn = document.createElement("button");
    btn.className = "tile-variant-item";
    btn.title = itemDefs[type].name;

    const img = document.createElement("img");
    img.src = itemDefs[type].icon.src;
    img.alt = itemDefs[type].name;
    btn.appendChild(img);

    // Captured BEFORE closeTileVariantPicker() below empties this popup
    // (which would otherwise detach `btn` and zero out its rect), and
    // e.stopPropagation() keeps this same click from also reaching the
    // document-level "click outside closes it" listeners further down —
    // without it, openItemActionMenu()'s own outside-click listener
    // would immediately re-close what this click just opened, since at
    // the time it bubbled up that menu had JUST been shown.
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const rect = btn.getBoundingClientRect();
      closeTileVariantPicker();
      openItemActionMenu(slotIndex, { getBoundingClientRect: () => rect });
    });
    grid.appendChild(btn);
  });
  tileVariantPickerEl.appendChild(grid);

  // beside the group slot, nudged back on-screen if it would overflow
  positionPopupNear(tileVariantPickerEl, anchorEl);
}

// Close on click-outside, same pattern as the item action menu/equipment
// picker below — EXCEPT a click on the group slot itself is excluded, or
// this would fire right after that slot's own click handler just opened
// the popup (both listeners see the same click) and instantly close it
// again.
document.addEventListener("click", (e) => {
  if (tileVariantPickerEl.classList.contains("hidden")) return;
  if (
    e.target === tileVariantPickerEl ||
    tileVariantPickerEl.contains(e.target)
  )
    return;
  if (e.target.closest && e.target.closest(".inv-slot-group")) return;
  closeTileVariantPicker();
});

/* ---------------- UI: item action menu (Hold / assign to 1-7) ---------------- */

const actionMenuEl = document.getElementById("item-action-menu");

function closeItemActionMenu() {
  actionMenuEl.classList.add("hidden");
  actionMenuEl.innerHTML = "";
}

function openItemActionMenu(slotIndex, anchorEl) {
  const slot = inventory[slotIndex];
  if (!slot) return;

  actionMenuEl.innerHTML = "";

  const label = document.createElement("div");
  label.className = "action-menu-label";
  label.textContent = itemDefs[slot.type].name;
  actionMenuEl.appendChild(label);

  const isWeapon = itemDefs[slot.type].equipSlot === "weapon";
  const isConsumable = !!itemDefs[slot.type].consumable;

  // Eat — only for items with a `consumable` block (Meat). Listed FIRST
  // since it's what left-click does too, so the menu's top entry always
  // matches the item's primary action.
  if (isConsumable) {
    const eatBtn = document.createElement("button");
    eatBtn.className = "action-menu-hold";
    const c = itemDefs[slot.type].consumable;
    eatBtn.textContent = "Eat";
    eatBtn.title = "+" + c.food + " food, +" + c.healthPercent + "% health";
    eatBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      consumeItem(slotIndex);
      closeItemActionMenu();
    });
    actionMenuEl.appendChild(eatBtn);
  }

  // Hold is only offered for non-weapons — a weapon is used/equipped
  // directly (see useOrHoldSlot()), not placed on the ground, so "Hold"
  // doesn't apply to it anymore. A consumable DOES still get it: Meat is
  // decor too, and left-click now eats instead of holding, so this is
  // the only way left to place one.
  if (!isWeapon) {
    const holdBtn = document.createElement("button");
    holdBtn.className = "action-menu-hold";
    holdBtn.textContent = "Hold";
    holdBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      holdSlot(slotIndex);
      closeItemActionMenu();
    });
    actionMenuEl.appendChild(holdBtn);
  }

  // Equip/Unequip — only shown for actual weapons (itemDefs.equipSlot).
  // The primary place to manage this is the Equipment screen (G), but
  // it's offered here too since the person's already looking at the item.
  if (isWeapon) {
    const equipBtn = document.createElement("button");
    equipBtn.className = "action-menu-hold";
    const alreadyEquipped = player.equippedWeapon === slot.type;
    equipBtn.textContent = alreadyEquipped ? "Unequip" : "Equip";
    equipBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (alreadyEquipped) unequipWeapon();
      else equipWeapon(slot.type);
      closeItemActionMenu();
    });
    actionMenuEl.appendChild(equipBtn);
  }

  const hotkeyRow = document.createElement("div");
  hotkeyRow.className = "action-menu-hotkeys";
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const btn = document.createElement("button");
    btn.textContent = i + 1;
    btn.title = "Assign to hotkey " + (i + 1);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      hotbar[i] = slotIndex;
      selectedHotbarIndex = i;
      closeItemActionMenu();
      renderHotbar();
    });
    hotkeyRow.appendChild(btn);
  }
  actionMenuEl.appendChild(hotkeyRow);

  // beside the slot, nudged back on-screen if it would overflow
  positionPopupNear(actionMenuEl, anchorEl);
}

// close the menu if you click anywhere outside it. Opening happens on
// "contextmenu" (right click), a different event from "click", so a
// regular left click never needs to be excluded here — clicking any
// slot (which holds it directly) should also dismiss a stray open menu.
document.addEventListener("click", (e) => {
  if (actionMenuEl.classList.contains("hidden")) return;
  if (e.target === actionMenuEl || actionMenuEl.contains(e.target)) return;
  closeItemActionMenu();
});

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "b") toggleInventory();
  if (k === "g") toggleEquipment();

  const num = Number(e.key);
  if (num >= 1 && num <= HOTBAR_SIZE) {
    selectedHotbarIndex = num - 1;
    const invIndex = hotbar[selectedHotbarIndex];
    const slot = invIndex !== null ? inventory[invIndex] : null;
    if (slot) useOrHoldSlot(invIndex);
    else renderHotbar();
  }
});

renderHotbar();
renderInventory();
