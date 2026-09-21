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
function layerForType(type) {
  const def = itemDefs[type];
  if (def.layer === "terrain") return terrainLayer;
  if (def.layer === "decor") return decorLayer;
  return def.flat ? groundLayer : objectLayer;
}

function getLayerItemId(layer, col, row) {
  const id = layer.get(tileKey(col, row));
  return id === undefined ? null : id;
}

// Which tiles a placed OBJECT-layer item actually blocks, given the tile
// it was placed on. Three modes:
//   - default (trees, the big/medium stones): exactly the one placement
//     tile, no matter how much bigger the art is drawn — per request.
//   - `multiTileFootprint: true` (house1 only): derives the blocked area
//     from the item's real drawn EDGES (in continuous tile-space, then
//     floor/ceil'd to whole tiles) — the exact same bottom-center-anchor
//     math drawGroundItemAt() in camera.js uses to actually draw it, not
//     a rounded-then-halved width. Using a single rounded tile count and
//     splitting it in half (the previous approach) put one extra tile on
//     the left for any icon whose width isn't an exact multiple of TILE
//     (this house is 130px = 8.125 tiles: rounding to 8 and floor-halving
//     gave 4 tiles left of center but only 3 right of it). Computing the
//     left/right/top edges independently and flooring/ceiling each one
//     separately keeps it symmetric and pixel-accurate to what's drawn.
//     Then excludes `footprintExcludeBackRows` rows counting from the
//     BACK of that footprint (the far edge from the placement tile) — the
//     house blocks its footprint except for a couple of walkable rows at
//     the back.
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
// Called from isTileBlocked() (js/player.js) for every colliding object,
// so a candidate move tile can be checked against footprints anchored at
// a different tile than the one being tested.
function getObjectFootprintBlockedTiles(type, placedCol, placedRow) {
  const def = itemDefs[type];
  if (!def.collides) return [];

  if (def.fixedFootprint) {
    const { leftTiles = 0, rightTiles = 0, heightTiles = 1 } = def.fixedFootprint;
    const topRow = placedRow - heightTiles + 1;
    const blocked = [];
    for (let row = topRow; row <= placedRow; row++) {
      for (let col = placedCol - leftTiles; col <= placedCol + rightTiles; col++) {
        blocked.push({ col, row });
      }
    }
    return blocked;
  }

  if (!def.multiTileFootprint) {
    return [{ col: placedCol, row: placedRow }];
  }

  const icon = def.icon;
  // Same anchor as drawGroundItemAt(): horizontally centered on the
  // placement tile's center, bottom edge flush with the placement tile's
  // bottom edge.
  const halfWidthTiles = icon.width / (2 * TILE);
  const heightTiles = icon.height / TILE;
  const leftEdge = (placedCol + 0.5) - halfWidthTiles;
  const rightEdge = (placedCol + 0.5) + halfWidthTiles;
  const topEdge = (placedRow + 1) - heightTiles;
  const bottomEdge = placedRow + 1;

  const leftCol = Math.floor(leftEdge);
  const rightCol = Math.ceil(rightEdge) - 1;
  const topRow = Math.floor(topEdge);       // topmost row of the footprint = the "back"
  const bottomRow = Math.ceil(bottomEdge) - 1;
  const excludeBackRows = def.footprintExcludeBackRows || 0;

  const blocked = [];
  for (let row = topRow; row <= bottomRow; row++) {
    if (row - topRow < excludeBackRows) continue; // back rows (roof/far side) stay walkable
    for (let col = leftCol; col <= rightCol; col++) {
      blocked.push({ col, row });
    }
  }
  return blocked;
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
// `multiTileFootprint: true` (house1 only) — instead of the single-tile
// default above, the blocked area is computed from the item's actual
// drawn footprint (its icon size in tiles, same bottom-center-anchored
// math as drawGroundItemAt() in camera.js), so the collision matches what
// a multi-tile building actually looks like on screen. Combined with
// `footprintExcludeBackRows` (also house1 only): that many rows counting
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
  grass: { id: "grass", name: "Ground", icon: assets.grass, unlimited: true, flat: true },
  grassTL: { id: "grassTL", name: "Ground (Top-Left)", icon: assets.grassTL, unlimited: true, flat: true },
  grassTC: { id: "grassTC", name: "Ground (Top)", icon: assets.grassTC, unlimited: true, flat: true },
  grassTR: { id: "grassTR", name: "Ground (Top-Right)", icon: assets.grassTR, unlimited: true, flat: true },
  grassL: { id: "grassL", name: "Ground (Left)", icon: assets.grassL, unlimited: true, flat: true },
  grassInner: { id: "grassInner", name: "Ground (Inner)", icon: assets.grassInner, unlimited: true, flat: true },
  grassR: { id: "grassR", name: "Ground (Right)", icon: assets.grassR, unlimited: true, flat: true },
  grassBL: { id: "grassBL", name: "Ground (Bottom-Left)", icon: assets.grassBL, unlimited: true, flat: true },
  grassBC: { id: "grassBC", name: "Ground (Bottom)", icon: assets.grassBC, unlimited: true, flat: true },
  grassBR: { id: "grassBR", name: "Ground (Bottom-Right)", icon: assets.grassBR, unlimited: true, flat: true },

  // --- dirt terrain tiles, also added as placeable inventory items per
  // request — same 3 variants world.js randomly tiles the map's
  // background with (assets/items/tile/dirt1-3.png). `layer: "terrain"`
  // puts these (and Water below) on their own base layer, UNDER the
  // Ground tileset/Port tiles above — per request ("dirt, water first
  // layer, second layer grass, port") — so placing Dirt/Water never
  // erases a Ground/Port tile on the same spot, and vice versa.
  dirt1: { id: "dirt1", name: "Dirt 1", icon: assets.dirt1, unlimited: true, flat: true, layer: "terrain" },
  dirt2: { id: "dirt2", name: "Dirt 2", icon: assets.dirt2, unlimited: true, flat: true, layer: "terrain" },
  dirt3: { id: "dirt3", name: "Dirt 3", icon: assets.dirt3, unlimited: true, flat: true, layer: "terrain" },

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
  portTL: { id: "portTL", name: "Port (Top-Left)", icon: assets.portTL, unlimited: true, flat: true, collides: true },
  portTC1: { id: "portTC1", name: "Port (Top 1)", icon: assets.portTC1, unlimited: true, flat: true, collides: true },
  portTC2: { id: "portTC2", name: "Port (Top 2)", icon: assets.portTC2, unlimited: true, flat: true, collides: true },
  portTC3: { id: "portTC3", name: "Port (Top 3)", icon: assets.portTC3, unlimited: true, flat: true, collides: true },
  portTR: { id: "portTR", name: "Port (Top-Right)", icon: assets.portTR, unlimited: true, flat: true, collides: true },
  portI1: { id: "portI1", name: "Port (Inner 1)", icon: assets.portI1, unlimited: true, flat: true },
  portI2: { id: "portI2", name: "Port (Inner 2)", icon: assets.portI2, unlimited: true, flat: true },
  portI3: { id: "portI3", name: "Port (Inner 3)", icon: assets.portI3, unlimited: true, flat: true, collides: true },
  portL2: { id: "portL2", name: "Port (Left 2)", icon: assets.portL2, unlimited: true, flat: true, collides: true },
  portI4: { id: "portI4", name: "Port (Inner 4)", icon: assets.portI4, unlimited: true, flat: true, collides: true },
  portI6: { id: "portI6", name: "Port (Inner 6)", icon: assets.portI6, unlimited: true, flat: true },
  portR2: { id: "portR2", name: "Port (Right 2)", icon: assets.portR2, unlimited: true, flat: true, collides: true },
  portL3: { id: "portL3", name: "Port (Left 3)", icon: assets.portL3, unlimited: true, flat: true, collides: true },
  portI7: { id: "portI7", name: "Port (Inner 7)", icon: assets.portI7, unlimited: true, flat: true, collides: true },
  portI9: { id: "portI9", name: "Port (Inner 9)", icon: assets.portI9, unlimited: true, flat: true, collides: true },
  portR3: { id: "portR3", name: "Port (Right 3)", icon: assets.portR3, unlimited: true, flat: true, collides: true },
  portBC1: { id: "portBC1", name: "Port (Bottom 1)", icon: assets.portBC1, unlimited: true, flat: true, collides: true },
  portBC2: { id: "portBC2", name: "Port (Bottom 2)", icon: assets.portBC2, unlimited: true, flat: true, collides: true },
  portBC3: { id: "portBC3", name: "Port (Bottom 3)", icon: assets.portBC3, unlimited: true, flat: true, collides: true },
  portBR: { id: "portBR", name: "Port (Bottom-Right)", icon: assets.portBR, unlimited: true, flat: true, collides: true },

  // --- plain water — random-tiled the same idea as the dirt terrain
  // variants (js/world.js). Only 3 of the original 5 kept — 2 were
  // pixel-identical to the 3rd. `layer: "terrain"` — same base layer as
  // Dirt above (see that comment for why), so it doesn't erase a
  // Ground/Port tile placed on the same spot either.
  water1: { id: "water1", name: "Water 1", icon: assets.water1, unlimited: true, flat: true, layer: "terrain" },
  water2: { id: "water2", name: "Water 2", icon: assets.water2, unlimited: true, flat: true, layer: "terrain" },
  water3: { id: "water3", name: "Water 3", icon: assets.water3, unlimited: true, flat: true, layer: "terrain" },

  // --- decorative flower — moved onto the same "decor" layer as wild
  // grass below, per request ("same lang din wag sa tile napapalitan din
  // kasi yung grass ground") — it used to share groundLayer with the
  // ground tileset, meaning placing a flower over a ground tile could
  // replace it; now it just overlaps, same as wild grass, and gets the
  // same sway + always-behind-the-player treatment from
  // wildgrass.js/camera.js.
  decoFlower1: { id: "decoFlower1", name: "Flower (Tall)", icon: assets.decoFlower1, unlimited: true, flat: true, layer: "decor" },
  decoFlower2: { id: "decoFlower2", name: "Flower (Short)", icon: assets.decoFlower2, unlimited: true, flat: true, layer: "decor" },

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
  wildGrass1: { id: "wildGrass1", name: "Wild Grass 1", icon: assets.wildGrass1, unlimited: true, flat: true, layer: "decor" },
  wildGrass2: { id: "wildGrass2", name: "Wild Grass 2", icon: assets.wildGrass2, unlimited: true, flat: true, layer: "decor" },
  wildGrass3: { id: "wildGrass3", name: "Wild Grass 3", icon: assets.wildGrass3, unlimited: true, flat: true, layer: "decor" },
  wildGrass4: { id: "wildGrass4", name: "Wild Grass 4", icon: assets.wildGrass4, unlimited: true, flat: true, layer: "decor" },
  wildGrass5: { id: "wildGrass5", name: "Wild Grass 5", icon: assets.wildGrass5, unlimited: true, flat: true, layer: "decor" },
  wildGrass6: { id: "wildGrass6", name: "Wild Grass 6", icon: assets.wildGrass6, unlimited: true, flat: true, layer: "decor" },
  wildGrass7: { id: "wildGrass7", name: "Wild Grass 7", icon: assets.wildGrass7, unlimited: true, flat: true, layer: "decor" },
  wildGrass8: { id: "wildGrass8", name: "Wild Grass 8", icon: assets.wildGrass8, unlimited: true, flat: true, layer: "decor" },

  // --- stones. Three tiers are harvestable resource nodes (Crush
  // animation, F key, see js/resources.js), same idea as the trees:
  // hitting one 3 times breaks it, grants Stone Chunks (more for a
  // bigger stone — 5/3/2 for Big/Medium/Small, mirroring the trees'
  // 5/3/2 big/thin/tiny wood amounts), and the same stone respawns on
  // its own tile 5 real minutes later.
  stoneBig: { id: "stoneBig", name: "Big Stone", icon: assets.stoneBig, collides: true, unlimited: true, fixedFootprint: { leftTiles: 1, rightTiles: 1, heightTiles: 1 }, resource: { hitsToBreak: 3, breakAnim: "crush", dropItem: "stoneChunk", dropAmount: 5, respawnMinutes: 5 } },
  stoneMedium: { id: "stoneMedium", name: "Medium Stone", icon: assets.stoneMedium, collides: true, unlimited: true, resource: { hitsToBreak: 3, breakAnim: "crush", dropItem: "stoneChunk", dropAmount: 3, respawnMinutes: 5 } },
  stoneSmall: { id: "stoneSmall", name: "Small Stone", icon: assets.stoneSmall, collides: true, unlimited: true, resource: { hitsToBreak: 3, breakAnim: "crush", dropItem: "stoneChunk", dropAmount: 2, respawnMinutes: 5 } },
  // XS Stone: collides (1 tile, the default rule) but isn't a harvestable
  // resource — just a solid obstacle, no `resource` config.
  stoneXS: { id: "stoneXS", name: "XS Stone", icon: assets.stoneXS, collides: true, unlimited: true },
  // XXS Stone and the Pebbles below: no collision, and `flat: true` so
  // they sit in groundLayer like the ground tileset — always drawn
  // beneath the player, so walking over one always shows the character
  // on top of it, instead of the dynamic Y-sort objectLayer items use
  // (which could put a tiny flat pebble in front of the player depending
  // on relative position — not what a ground-level pebble should do).
  stoneXXS: { id: "stoneXXS", name: "XXS Stone", icon: assets.stoneXXS, unlimited: true, flat: true },
  stoneDecor1: { id: "stoneDecor1", name: "Pebbles 1", icon: assets.stoneDecor1, unlimited: true, flat: true },
  stoneDecor2: { id: "stoneDecor2", name: "Pebbles 2", icon: assets.stoneDecor2, unlimited: true, flat: true },
  stoneDecor3: { id: "stoneDecor3", name: "Pebbles 3", icon: assets.stoneDecor3, unlimited: true, flat: true },
  stoneDecor4: { id: "stoneDecor4", name: "Pebbles 4", icon: assets.stoneDecor4, unlimited: true, flat: true },
  stoneDecor5: { id: "stoneDecor5", name: "Pebbles 5", icon: assets.stoneDecor5, unlimited: true, flat: true },
  // Dropped by harvesting a stone — a plain inventory resource, not
  // really meant to be placed as decor, but there's no separate
  // "non-placeable" category in this system yet so it's just a normal
  // (flat, so it's harmless if placed) item like everything else.
  stoneChunk: { id: "stoneChunk", name: "Stone Chunk", icon: assets.stoneSmall, unlimited: true, flat: true },

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
  treeBigCutStump: { id: "treeBigCutStump", name: "Big Tree Stump", icon: assets.treeBigCutStump, collides: true, unlimited: true, fixedFootprint: { leftTiles: 2, rightTiles: 1, heightTiles: 1 }, resource: { hitsToBreak: 2, breakAnim: "slice", respawnMinutes: 5, respawnAs: "treeBigOrange", dropItem: "woodLog", dropAmount: 3 } },
  treeThinCutStump: { id: "treeThinCutStump", name: "Thin Tree Stump", icon: assets.treeThinCutStump, collides: true, unlimited: true, resource: { hitsToBreak: 2, breakAnim: "slice", respawnMinutes: 5, respawnAs: "treeThinGreen", dropItem: "woodLog", dropAmount: 2 } },
  treeThinNoLeaves1: { id: "treeThinNoLeaves1", name: "Bare Tree 1", icon: assets.treeThinNoLeaves1, collides: true, unlimited: true, resource: { hitsToBreak: 3, breakAnim: "slice", respawnMinutes: 5, dropItem: "woodLog", dropAmount: 2 } },
  treeThinNoLeaves2: { id: "treeThinNoLeaves2", name: "Bare Tree 2", icon: assets.treeThinNoLeaves2, collides: true, unlimited: true, resource: { hitsToBreak: 3, breakAnim: "slice", respawnMinutes: 5, dropItem: "woodLog", dropAmount: 2 } },
  treeTinyCutStump: { id: "treeTinyCutStump", name: "Tiny Tree Stump", icon: assets.treeTinyCutStump, collides: true, unlimited: true, resource: { hitsToBreak: 2, breakAnim: "slice", respawnMinutes: 5, respawnAs: "treeTinyGreen", dropItem: "woodLog", dropAmount: 1 } },
  // Harvestable (living) trees: 3 hits with the Slice animation (F key)
  // permanently replaces the tile with its matching stump — named by the
  // same convention the source pack used ("thintree" -> "thincutted",
  // per request), no respawn. Unlike stones, cutting a tree doesn't grant
  // anything right now (not asked for) — just the visual/tile change.
  treeThinGreen: { id: "treeThinGreen", name: "Thin Tree (Green)", icon: assets.treeThinGreen, collides: true, unlimited: true, resource: { hitsToBreak: 3, breakAnim: "slice", replaceWith: "treeThinCutStump", dropItem: "woodLog", dropAmount: 3 } },
  treeTinyGreen: { id: "treeTinyGreen", name: "Tiny Tree (Green)", icon: assets.treeTinyGreen, collides: true, unlimited: true, resource: { hitsToBreak: 3, breakAnim: "slice", replaceWith: "treeTinyCutStump", dropItem: "woodLog", dropAmount: 2 } },
  treeBigOrange: { id: "treeBigOrange", name: "Big Tree (Orange)", icon: assets.treeBigOrange, collides: true, unlimited: true, fixedFootprint: { leftTiles: 2, rightTiles: 1, heightTiles: 1 }, resource: { hitsToBreak: 3, breakAnim: "slice", replaceWith: "treeBigCutStump", dropItem: "woodLog", dropAmount: 5 } },
  treeThinOrange: { id: "treeThinOrange", name: "Thin Tree (Orange)", icon: assets.treeThinOrange, collides: true, unlimited: true, resource: { hitsToBreak: 3, breakAnim: "slice", replaceWith: "treeThinCutStump", dropItem: "woodLog", dropAmount: 3 } },

  // --- house — collides, but as a multi-tile footprint with its back
  // rows excluded (see getObjectFootprintBlockedTiles() below), not the
  // single-tile rule every other collider uses.
  house1: { id: "house1", name: "House", icon: assets.house1, unlimited: true, collides: true, multiTileFootprint: true, footprintExcludeBackRows: 2 },

  // --- wood tools/weapons. 14 are real equippable weapons (`equipSlot` +
  // `weapon.attackAnim` — see the big comment above); the crate/plaque/
  // shields are plain flat decor, no different from the grass tileset.
  // attackAnim mapping is a judgment call based on what each tool visually
  // is, not something the source pack specified: bladed melee -> "hit",
  // thrusting/ranged (rapier, javelin, bow) -> "pierce", chopping (axe,
  // sickle) -> "slice", blunt/mining (pickaxe, mattock, hammer) -> "crush".
  woodSword: { id: "woodSword", name: "Wood Sword", icon: assets.woodSword, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "hit" } },
  woodDagger: { id: "woodDagger", name: "Wood Dagger", icon: assets.woodDagger, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "hit" } },
  woodDaggerSmall: { id: "woodDaggerSmall", name: "Wood Dagger (Small)", icon: assets.woodDaggerSmall, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "hit" } },
  woodRapier: { id: "woodRapier", name: "Wood Rapier", icon: assets.woodRapier, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "pierce" } },
  woodJavelin: { id: "woodJavelin", name: "Wood Javelin", icon: assets.woodJavelin, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "pierce" } },
  woodAxe: { id: "woodAxe", name: "Wood Axe", icon: assets.woodAxe, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "slice" } },
  woodSickle: { id: "woodSickle", name: "Wood Sickle", icon: assets.woodSickle, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "slice" } },
  woodPickaxe: { id: "woodPickaxe", name: "Wood Pickaxe", icon: assets.woodPickaxe, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "crush" } },
  woodMattock: { id: "woodMattock", name: "Wood Mattock", icon: assets.woodMattock, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "crush" } },
  woodHammer: { id: "woodHammer", name: "Wood Hammer", icon: assets.woodHammer, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "crush" } },
  woodHookStaff: { id: "woodHookStaff", name: "Wood Hook Staff", icon: assets.woodHookStaff, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "hit" } },
  woodClubWrapped: { id: "woodClubWrapped", name: "Wood Club (Wrapped)", icon: assets.woodClubWrapped, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "hit" } },
  woodTongs: { id: "woodTongs", name: "Wood Tongs", icon: assets.woodTongs, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "hit" } },
  woodBow: { id: "woodBow", name: "Wood Bow", icon: assets.woodBow, unlimited: true, flat: true, equipSlot: "weapon", weapon: { attackAnim: "pierce" } },

  // decor only — not equippable, same treatment as the grass tileset
  woodCrate: { id: "woodCrate", name: "Wood Crate", icon: assets.woodCrate, unlimited: true, flat: true },
  woodPlaque: { id: "woodPlaque", name: "Wood Plaque", icon: assets.woodPlaque, unlimited: true, flat: true },
  woodShieldRound: { id: "woodShieldRound", name: "Wood Shield (Round)", icon: assets.woodShieldRound, unlimited: true, flat: true },
  woodShieldSmall: { id: "woodShieldSmall", name: "Wood Shield (Small)", icon: assets.woodShieldSmall, unlimited: true, flat: true },
  woodShieldLarge: { id: "woodShieldLarge", name: "Wood Shield (Large)", icon: assets.woodShieldLarge, unlimited: true, flat: true },

  // --- wood drop materials — granted from chopping trees (see
  // `resource.dropItem`/`dropAmount` on the tree entries below), and the
  // source of the "floating pickup" popup (spawnFloatingPickups(),
  // resources.js). Flat, plain inventory materials — same treatment as
  // stoneChunk.
  woodLog: { id: "woodLog", name: "Wood Log", icon: assets.woodLog, unlimited: true, flat: true },
  woodPlank: { id: "woodPlank", name: "Wood Plank", icon: assets.woodPlank, unlimited: true, flat: true },
  woodStick: { id: "woodStick", name: "Wood Stick", icon: assets.woodStick, unlimited: true, flat: true }
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
  stone: { name: "Stones", match: (t) => t.startsWith("stone") && t !== "stoneChunk" },
  // Every tree/stump variant (living, bare, and cut-stump alike) — no
  // exclusions needed, `woodLog`/`woodPlank`/`woodStick` etc. are a
  // separate "wood" prefix, not "tree".
  tree: { name: "Trees", match: (t) => t.startsWith("tree") },
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
  if (!tileGroups[gid]) tileGroups[gid] = { id: gid, name: TILE_GROUP_META[gid].name, members: [] };
  tileGroups[gid].members.push(type);
});

// itemDefs key -> its group object (for a quick "is this type grouped?"
// check while rendering), and itemDefs key -> inventory index (grouped
// or not — the variant picker uses this to find the real slot to open
// openItemActionMenu on). Both rely on inventory[] being filled in this
// exact same Object.keys(itemDefs) order right below, which it always is.
const tileGroupByType = {};
Object.values(tileGroups).forEach((g) => {
  g.members.forEach((t) => { tileGroupByType[t] = g; });
});
const inventoryIndexByType = {};
Object.keys(itemDefs).forEach((type, i) => { inventoryIndexByType[type] = i; });

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
let heldItem = null;        // null | { type, fromSlot }  (fromSlot = an INVENTORY index)
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
const terrainLayer = new Map();
const groundLayer = new Map();
const decorLayer = new Map();
const objectLayer = new Map();

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
    row: Math.floor(feetWorldY / TILE)
  };
}

function isWithinPlacementRange(col, row) {
  const p = getPlayerTile();
  // Chebyshev distance (a square range, not a circle) — simple and matches
  // "5 range ng tiles" without needing to justify a specific shape.
  return Math.max(Math.abs(col - p.col), Math.abs(row - p.row)) <= PLACEMENT_RANGE;
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
// for anything else it's the existing hold-to-place flow.
function useOrHoldSlot(slotIndex) {
  const slot = inventory[slotIndex];
  if (!slot) return;
  if (itemDefs[slot.type].equipSlot === "weapon") {
    equipWeapon(slot.type);
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

function placeHeldItemAt(col, row) {
  if (!heldItem) return;
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
  if (itemDefs[heldItem.type].collides && col === playerTile.col && row === playerTile.row) return;

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
  layer.set(tileKey(col, row), heldItem.type);

  const usedSlotIndex = heldItem.fromSlot;

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
    case "up": return { col: p.col, row: p.row - 1 };
    case "down": return { col: p.col, row: p.row + 1 };
    case "left": return { col: p.col - 1, row: p.row };
    case "right": return { col: p.col + 1, row: p.row };
    default: return p;
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
function findGrabbableInLayer(layer, front, here) {
  const hereType = getLayerItemId(layer, here.col, here.row);
  if (hereType) {
    return { type: hereType, col: here.col, row: here.row };
  }
  if (front) {
    const frontType = getLayerItemId(layer, front.col, front.row);
    if (frontType && itemDefs[frontType].collides) {
      return { type: frontType, col: front.col, row: front.row };
    }
  }
  return null;
}

function tryGrabOrPlaceInFront() {
  if (player.grabbedType) {
    const type = player.grabbedType;
    const target = itemDefs[type].collides ? getTileInFrontOfPlayer() : getPlayerTile();
    if (target.col < 0 || target.row < 0 || target.col >= COLS || target.row >= ROWS) return;

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
  const front = (rawFront.col >= 0 && rawFront.row >= 0 && rawFront.col < COLS && rawFront.row < ROWS) ? rawFront : null;
  const here = getPlayerTile();

  let found = findGrabbableInLayer(decorLayer, front, here);
  let layer = decorLayer;
  if (!found) {
    found = findGrabbableInLayer(objectLayer, front, here);
    layer = objectLayer;
    if (found && found.type === "house1") found = null; // the house specifically is never grabbable
  }
  if (!found) {
    found = findGrabbableInLayer(groundLayer, front, here);
    layer = groundLayer;
  }
  if (!found) {
    found = findGrabbableInLayer(terrainLayer, front, here);
    layer = terrainLayer;
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
    case "up": target = { col: p.col, row: p.row - 2 }; break;
    case "down": target = { col: p.col, row: p.row + 2 }; break;
    case "left": target = { col: p.col - 2, row: p.row }; break;
    case "right": target = { col: p.col + 2, row: p.row }; break;
    default: target = p;
  }
  if (target.col < 0 || target.row < 0 || target.col >= COLS || target.row >= ROWS) return; // nowhere to throw it, off the edge of the map — stays in hand

  spawnThrowToss(player.grabbedType, player.x, player.y, target.col, target.row);
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
const equippedWeaponHudIconEl = document.getElementById("equipped-weapon-hud-icon");
const equippedWeaponHudNameEl = document.getElementById("equipped-weapon-hud-name");
const equippedWeaponHudUnequipBtn = document.getElementById("equipped-weapon-hud-unequip");

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
const equipmentSlotWeaponIconEl = document.getElementById("equipment-slot-weapon-icon");
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
    0, 0, FRAME_SIZE, FRAME_SIZE,           // source: first frame only
    0, 0, equipmentCanvasEl.width, equipmentCanvasEl.height, // dest: fill the canvas
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
    if (!slot || itemDefs[slot.type].equipSlot !== "weapon" || seenTypes.has(slot.type)) return;
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

  // position it right next to the slot that was clicked
  const rect = equipmentSlotWeaponEl.getBoundingClientRect();
  equipmentPickerEl.style.left = rect.right + 8 + "px";
  equipmentPickerEl.style.top = rect.top + "px";
  equipmentPickerEl.classList.remove("hidden");
}

equipmentSlotWeaponEl.addEventListener("click", () => {
  if (equipmentPickerEl.classList.contains("hidden")) openEquipmentWeaponPicker();
  else closeEquipmentWeaponPicker();
});

// close the picker if you click anywhere outside it (same pattern as
// the inventory's item-action-menu below)
document.addEventListener("click", (e) => {
  if (equipmentPickerEl.classList.contains("hidden")) return;
  if (e.target === equipmentPickerEl || equipmentPickerEl.contains(e.target)) return;
  if (e.target === equipmentSlotWeaponEl || equipmentSlotWeaponEl.contains(e.target)) return;
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
    if (heldItem && invIndex !== null && heldItem.fromSlot === invIndex) box.classList.add("held");

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
  box.title = group.name + " (" + group.members.length + " tiles) — click to choose";

  // Highlight the family's slot green while the player is holding ANY
  // one of its members, same idea as a normal slot's `.held` state.
  if (heldItem && tileGroupByType[heldItem.type] === group) box.classList.add("held");

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

  // position it right next to the group slot that was clicked
  const rect = anchorEl.getBoundingClientRect();
  tileVariantPickerEl.style.left = rect.right + 8 + "px";
  tileVariantPickerEl.style.top = rect.top + "px";
  tileVariantPickerEl.classList.remove("hidden");
}

// Close on click-outside, same pattern as the item action menu/equipment
// picker below — EXCEPT a click on the group slot itself is excluded, or
// this would fire right after that slot's own click handler just opened
// the popup (both listeners see the same click) and instantly close it
// again.
document.addEventListener("click", (e) => {
  if (tileVariantPickerEl.classList.contains("hidden")) return;
  if (e.target === tileVariantPickerEl || tileVariantPickerEl.contains(e.target)) return;
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

  // Hold is only offered for non-weapons — a weapon is used/equipped
  // directly (see useOrHoldSlot()), not placed on the ground, so "Hold"
  // doesn't apply to it anymore.
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

  // position it right next to the slot that was clicked
  const rect = anchorEl.getBoundingClientRect();
  actionMenuEl.style.left = rect.right + 8 + "px";
  actionMenuEl.style.top = rect.top + "px";
  actionMenuEl.classList.remove("hidden");
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
