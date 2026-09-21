"use strict";

/* =================================================================
   ASSETS — loads every image the game needs, then calls whatever
   callback was registered with whenAssetsReady()
================================================================= */
const assets = {
  // 3 separate dirt terrain tile variants (see js/world.js) — used to be
  // one combined strip (assets/tiles/dirt.png) sliced at runtime; split
  // into individual files and moved alongside the ground tileset per
  // request, so world.js no longer needs to slice anything at load time.
  dirt1: new Image(),
  dirt2: new Image(),
  dirt3: new Image(),

  // --- port/island tileset (assets/items/tile/) — a 5x5 land/water edge
  // set (like the ground tileset's 3x3, just a full 5x5), for building
  // island/coastline shapes. Named to match the source pack's own
  // folder/file name ("port"), even though it's really land-meets-water
  // tiles, not a literal harbor/dock. 5 of the original 25 grid cells
  // were pixel-identical duplicates of other cells (or of plain water)
  // and were dropped rather than kept as redundant items — see
  // itemDefs' comment (inventory.js) for exactly which.
  portTL: new Image(), portTC1: new Image(), portTC2: new Image(), portTC3: new Image(), portTR: new Image(),
  portI1: new Image(), portI2: new Image(), portI3: new Image(),
  portL2: new Image(), portI4: new Image(), portI6: new Image(), portR2: new Image(),
  portL3: new Image(), portI7: new Image(), portI9: new Image(), portR3: new Image(),
  portBC1: new Image(), portBC2: new Image(), portBC3: new Image(), portBR: new Image(),

  // --- plain water tile variants (assets/items/tile/) — random-tiled
  // the same way the dirt terrain variants are, see js/world.js. Only 3
  // of the original 5 are kept — 2 were pixel-identical to the 3rd.
  water1: new Image(),
  water2: new Image(),
  water3: new Image(),

  // --- NPC shopkeeper (assets/npc/) — a 4-frame idle sheet, right-facing
  // (npcIdleRight, the uploaded art as-is) and a pre-flipped left-facing
  // copy (npcIdleLeft, generated per-frame — flipping the whole strip at
  // once would reverse the frame ORDER too, not just mirror each frame,
  // so each of the 4 64x64 frames was cropped and flipped individually
  // then reassembled in the same order). Same idea for the 6-frame walk
  // sheet (npcWalkRight/npcWalkLeft) — used during the morning walking
  // window, see js/npc.js.
  npcIdleRight: new Image(),
  npcIdleLeft: new Image(),
  npcWalkRight: new Image(),
  npcWalkLeft: new Image(),

  idleDown: new Image(),
  idleUp: new Image(),
  idleSide: new Image(),

  walkDown: new Image(),
  walkUp: new Image(),
  walkSide: new Image(),

  runDown: new Image(),
  runUp: new Image(),
  runSide: new Image(),

  collectDown: new Image(),
  collectUp: new Image(),
  collectSide: new Image(),

  // --- new one-shot action sheets (Animations.zip). crush/slice are
  // wired to the F "harvest" key (see js/resources.js, js/player.js);
  // death/fishing/hit/pierce/watering are loaded and timed (config.js)
  // but not yet triggered by anything — available for a future feature.
  crushDown: new Image(),
  crushUp: new Image(),
  crushSide: new Image(),

  sliceDown: new Image(),
  sliceUp: new Image(),
  sliceSide: new Image(),

  deathDown: new Image(),
  deathUp: new Image(),
  deathSide: new Image(),

  fishingDown: new Image(),
  fishingUp: new Image(),
  fishingSide: new Image(),

  hitDown: new Image(),
  hitUp: new Image(),
  hitSide: new Image(),

  // source pack calls the "facing up/away" sheet "Top" instead of "Up" —
  // kept the source filename as-is, just named the asset key "pierceUp"
  // for consistency with every other animation's up/down/side naming.
  pierceDown: new Image(),
  pierceUp: new Image(),
  pierceSide: new Image(),

  wateringDown: new Image(),
  wateringUp: new Image(),
  wateringSide: new Image(),

  carryIdleDown: new Image(),
  carryIdleUp: new Image(),
  carryIdleSide: new Image(),

  carryWalkDown: new Image(),
  carryWalkUp: new Image(),
  carryWalkSide: new Image(),

  carryRunDown: new Image(),
  carryRunUp: new Image(),
  carryRunSide: new Image(),

  grass: new Image(),
  grassTL: new Image(),
  grassTC: new Image(),
  grassTR: new Image(),
  grassL: new Image(),
  grassInner: new Image(),
  grassR: new Image(),
  grassBL: new Image(),
  grassBC: new Image(),
  grassBR: new Image(),

  // --- decorative flora that sits on top of the ground ---
  // decoFlower1/2 now live in their own assets/flowers/ folder (moved
  // out of assets/items/tile/ per request), and share the same "decor"
  // layer as wildGrass1-8 below (assets/wildgrass/) — see layerForType()
  // in inventory.js, decorLayer in wildgrass.js — placing either no
  // longer replaces the ground tile underneath it, matching how
  // stones/trees already just overlap the ground instead of replacing it.
  decoFlower1: new Image(),
  decoFlower2: new Image(),
  wildGrass1: new Image(),
  wildGrass2: new Image(),
  wildGrass3: new Image(),
  wildGrass4: new Image(),
  wildGrass5: new Image(),
  wildGrass6: new Image(),
  wildGrass7: new Image(),
  wildGrass8: new Image(),

  // --- stones (assets/items/stones/) ---
  stoneBig: new Image(),
  stoneMedium: new Image(),
  stoneSmall: new Image(),
  stoneXS: new Image(),
  stoneXXS: new Image(),
  stoneDecor1: new Image(),
  stoneDecor2: new Image(),
  stoneDecor3: new Image(),
  stoneDecor4: new Image(),
  stoneDecor5: new Image(),

  // --- trees (assets/items/trees/) ---
  treeBigCutStump: new Image(),
  treeThinCutStump: new Image(),
  treeThinNoLeaves1: new Image(),
  treeThinNoLeaves2: new Image(),
  treeTinyCutStump: new Image(),
  treeThinGreen: new Image(),
  treeTinyGreen: new Image(),
  treeBigOrange: new Image(),
  treeThinOrange: new Image(),

  // --- house (assets/items/house/) ---
  house1: new Image(),

  // --- weather FX particles (assets/particles/), see js/weatherfx.js ---
  rain: new Image(),
  rainOnFloor: new Image(),
  snow: new Image(),
  clouds: new Image(),
  clouds2: new Image(),
  clouds3: new Image(),
  fog: new Image(),
  fog2: new Image(),
  fog3: new Image(),

  // --- wood tools/weapons (assets/items/wood/) — see itemDefs, inventory.js ---
  woodSword: new Image(),
  woodDagger: new Image(),
  woodDaggerSmall: new Image(),
  woodRapier: new Image(),
  woodJavelin: new Image(),
  woodAxe: new Image(),
  woodSickle: new Image(),
  woodPickaxe: new Image(),
  woodMattock: new Image(),
  woodHammer: new Image(),
  woodHookStaff: new Image(),
  woodClubWrapped: new Image(),
  woodTongs: new Image(),
  woodBow: new Image(),
  woodCrate: new Image(),
  woodPlaque: new Image(),
  woodShieldRound: new Image(),
  woodShieldSmall: new Image(),
  woodShieldLarge: new Image(),

  // --- wood drop materials (assets/items/wood_drops/) — granted from
  // chopping trees, see itemDefs `resource.dropItem`, inventory.js ---
  woodLog: new Image(),
  woodPlank: new Image(),
  woodStick: new Image()
};

assets.dirt1.src = "assets/items/tile/dirt1.png";
assets.dirt2.src = "assets/items/tile/dirt2.png";
assets.dirt3.src = "assets/items/tile/dirt3.png";

// --- port/island 5x5 tileset — 20 of the original 25 grid cells (5 were
// pixel-identical duplicates: port_bl was identical to plain water,
// port_i5/port_i8 to port_i2, port_l1 to port_tc1, port_r1 to port_tc3 —
// dropped rather than kept as redundant items) ---
assets.portTL.src = "assets/items/tile/port_tl.png";
assets.portTC1.src = "assets/items/tile/port_tc1.png";
assets.portTC2.src = "assets/items/tile/port_tc2.png";
assets.portTC3.src = "assets/items/tile/port_tc3.png";
assets.portTR.src = "assets/items/tile/port_tr.png";
assets.portI1.src = "assets/items/tile/port_i1.png";
assets.portI2.src = "assets/items/tile/port_i2.png";
assets.portI3.src = "assets/items/tile/port_i3.png";
assets.portL2.src = "assets/items/tile/port_l2.png";
assets.portI4.src = "assets/items/tile/port_i4.png";
assets.portI6.src = "assets/items/tile/port_i6.png";
assets.portR2.src = "assets/items/tile/port_r2.png";
assets.portL3.src = "assets/items/tile/port_l3.png";
assets.portI7.src = "assets/items/tile/port_i7.png";
assets.portI9.src = "assets/items/tile/port_i9.png";
assets.portR3.src = "assets/items/tile/port_r3.png";
assets.portBC1.src = "assets/items/tile/port_bc1.png";
assets.portBC2.src = "assets/items/tile/port_bc2.png";
assets.portBC3.src = "assets/items/tile/port_bc3.png";
assets.portBR.src = "assets/items/tile/port_br.png";

// --- plain water tile variants — only 3 of the original 5 kept (2 were
// pixel-identical to the 3rd) ---
assets.water1.src = "assets/items/tile/water1.png";
assets.water2.src = "assets/items/tile/water2.png";
assets.water3.src = "assets/items/tile/water3.png";

// --- NPC shopkeeper ---
assets.npcIdleRight.src = "assets/npc/npc_idle_right.png";
assets.npcIdleLeft.src = "assets/npc/npc_idle_left.png";
assets.npcWalkRight.src = "assets/npc/npc_walk_right.png";
assets.npcWalkLeft.src = "assets/npc/npc_walk_left.png";

assets.idleDown.src = "assets/sprites/Idle/Idle_Down-Sheet.png";
assets.idleUp.src = "assets/sprites/Idle/Idle_Up-Sheet.png";
assets.idleSide.src = "assets/sprites/Idle/Idle_Side-Sheet.png"; // faces RIGHT; flipped in code for LEFT

assets.walkDown.src = "assets/sprites/Walk/Walk_Down-Sheet.png";
assets.walkUp.src = "assets/sprites/Walk/Walk_Up-Sheet.png";
assets.walkSide.src = "assets/sprites/Walk/Walk_Side-Sheet.png"; // faces RIGHT; flipped in code for LEFT

assets.runDown.src = "assets/sprites/Run/Run_Down-Sheet.png";
assets.runUp.src = "assets/sprites/Run/Run_Up-Sheet.png";
assets.runSide.src = "assets/sprites/Run/Run_Side-Sheet.png";   // faces RIGHT; flipped in code for LEFT

// one-shot "picking something up / putting it down" animation
assets.collectDown.src = "assets/sprites/Collect/Collect_Down-Sheet.png";
assets.collectUp.src = "assets/sprites/Collect/Collect_Up-Sheet.png";
assets.collectSide.src = "assets/sprites/Collect/Collect_Side-Sheet.png"; // faces RIGHT; flipped in code for LEFT

// one-shot "hit a stone" harvest animation (F key, see js/resources.js)
assets.crushDown.src = "assets/sprites/Crush/Crush_Down-Sheet.png";
assets.crushUp.src = "assets/sprites/Crush/Crush_Up-Sheet.png";
assets.crushSide.src = "assets/sprites/Crush/Crush_Side-Sheet.png"; // faces RIGHT; flipped in code for LEFT

// one-shot "hit a tree" harvest animation (F key, see js/resources.js)
assets.sliceDown.src = "assets/sprites/Slice/Slice_Down-Sheet.png";
assets.sliceUp.src = "assets/sprites/Slice/Slice_Up-Sheet.png";
assets.sliceSide.src = "assets/sprites/Slice/Slice_Side-Sheet.png"; // faces RIGHT; flipped in code for LEFT

// loaded and timed, not yet wired to a key/action — available for later
assets.deathDown.src = "assets/sprites/Death/Death_Down-Sheet.png";
assets.deathUp.src = "assets/sprites/Death/Death_Up-Sheet.png";
assets.deathSide.src = "assets/sprites/Death/Death_Side-Sheet.png"; // faces RIGHT; flipped in code for LEFT

assets.fishingDown.src = "assets/sprites/Fishing/Fishing_Down-Sheet.png";
assets.fishingUp.src = "assets/sprites/Fishing/Fishing_Up-Sheet.png";
assets.fishingSide.src = "assets/sprites/Fishing/Fishing_Side-Sheet.png"; // faces RIGHT; flipped in code for LEFT

assets.hitDown.src = "assets/sprites/Hit/Hit_Down-Sheet.png";
assets.hitUp.src = "assets/sprites/Hit/Hit_Up-Sheet.png";
assets.hitSide.src = "assets/sprites/Hit/Hit_Side-Sheet.png"; // faces RIGHT; flipped in code for LEFT

assets.pierceDown.src = "assets/sprites/Pierce/Pierce_Down-Sheet.png";
assets.pierceUp.src = "assets/sprites/Pierce/Pierce_Top-Sheet.png"; // source pack names this sheet "Top", not "Up"
assets.pierceSide.src = "assets/sprites/Pierce/Pierce_Side-Sheet.png"; // faces RIGHT; flipped in code for LEFT

assets.wateringDown.src = "assets/sprites/Watering/Watering_Down-Sheet.png";
assets.wateringUp.src = "assets/sprites/Watering/Watering_Up-Sheet.png";
assets.wateringSide.src = "assets/sprites/Watering/Watering_Side-Sheet.png"; // faces RIGHT; flipped in code for LEFT

// used instead of the normal idle/walk/run sheets while player.mode === "carrying"
assets.carryIdleDown.src = "assets/sprites/Carry_Idle/Carry_Idle_Down-Sheet.png";
assets.carryIdleUp.src = "assets/sprites/Carry_Idle/Carry_Idle_Up-Sheet.png";
assets.carryIdleSide.src = "assets/sprites/Carry_Idle/Carry_Idle_Side-Sheet.png"; // faces RIGHT; flipped in code for LEFT

assets.carryWalkDown.src = "assets/sprites/Carry_Walk/Carry_Walk_Down-Sheet.png";
assets.carryWalkUp.src = "assets/sprites/Carry_Walk/Carry_Walk_Up-Sheet.png";
assets.carryWalkSide.src = "assets/sprites/Carry_Walk/Carry_Walk_Side-Sheet.png"; // faces RIGHT; flipped in code for LEFT

assets.carryRunDown.src = "assets/sprites/Carry_Run/Carry_Run_Down-Sheet.png";
assets.carryRunUp.src = "assets/sprites/Carry_Run/Carry_Run_Up-Sheet.png";
assets.carryRunSide.src = "assets/sprites/Carry_Run/Carry_Run_Side-Sheet.png"; // faces RIGHT; flipped in code for LEFT

// item icons — used both in the inventory UI and drawn on the ground when placed.
// These are the base GROUND tiles — moved into assets/items/tile/ (per
// request) since they're terrain other objects get placed on top of, not
// a decoration themselves; see itemDefs in inventory.js for the rename
// from "Grass" to "Ground".
assets.grass.src = "assets/items/tile/grass.png"; // the original single ground tuft (not tile-sized, 28x27)

// a 3x3 ground "edge" tileset (all a clean 16x16, matching TILE exactly) —
// meant to be placed together to build a proper-looking ground patch with
// edges/corners, instead of scattering the single 28x27 tuft above
assets.grassTL.src = "assets/items/tile/grass_tl.png";       // top-left corner
assets.grassTC.src = "assets/items/tile/grass_tc.png";       // top edge
assets.grassTR.src = "assets/items/tile/grass_tr.png";       // top-right corner
assets.grassL.src = "assets/items/tile/grass_l.png";         // left edge
assets.grassInner.src = "assets/items/tile/grass_inner.png"; // fill / center
assets.grassR.src = "assets/items/tile/grass_r.png";         // right edge
assets.grassBL.src = "assets/items/tile/grass_bl.png";       // bottom-left corner
assets.grassBC.src = "assets/items/tile/grass_bc.png";       // bottom edge
assets.grassBR.src = "assets/items/tile/grass_br.png";       // bottom-right corner

// --- decorative flowers — flat ground decal, drawn at native pixel size
// (no stretching to TILE), see drawGroundItemAt() in camera.js. No
// collision, and flat (see itemDefs) — same ground-decal treatment as
// the grass tileset above (this DOES share the ground layer, and can
// still replace/be replaced by another flat item on the same tile —
// only wildGrass below got the non-replacing "decor layer" treatment).
assets.decoFlower1.src = "assets/flowers/flower1.png";
assets.decoFlower2.src = "assets/flowers/flower2.png";

// --- wild grass — its own "decor" layer (js/wildgrass.js), separate
// from the ground tileset's layer, so placing it never replaces the
// ground tile underneath (per request) — it just overlaps, the same way
// stones/trees already overlap the ground instead of replacing it. Also
// sways as the player walks through it — see js/wildgrass.js.
assets.wildGrass1.src = "assets/wildgrass/wildgrass1.png";
assets.wildGrass2.src = "assets/wildgrass/wildgrass2.png";
assets.wildGrass3.src = "assets/wildgrass/wildgrass3.png";
assets.wildGrass4.src = "assets/wildgrass/wildgrass4.png";
assets.wildGrass5.src = "assets/wildgrass/wildgrass5.png";
assets.wildGrass6.src = "assets/wildgrass/wildgrass6.png";
assets.wildGrass7.src = "assets/wildgrass/wildgrass7.png";
assets.wildGrass8.src = "assets/wildgrass/wildgrass8.png";

// --- stones. Only stoneBig and stoneMedium collide (see `collides` in
// itemDefs, js/inventory.js) — the rest are small decorative pebbles.
assets.stoneBig.src = "assets/items/stones/bigstone1.png";
assets.stoneMedium.src = "assets/items/stones/mediumstone.png";
assets.stoneSmall.src = "assets/items/stones/smallstone.png";
assets.stoneXS.src = "assets/items/stones/xsstone.png";
assets.stoneXXS.src = "assets/items/stones/xxsstone.png";
assets.stoneDecor1.src = "assets/items/stones/decorstone1.png";
assets.stoneDecor2.src = "assets/items/stones/decorstone2.png";
assets.stoneDecor3.src = "assets/items/stones/decorstone3.png";
assets.stoneDecor4.src = "assets/items/stones/decorstone4.png";
assets.stoneDecor5.src = "assets/items/stones/decorstone5.png";

// --- trees. All trees collide (see `collides` in itemDefs). The green/
// orange leafed variants were re-added per request ("lahat ng trees") —
// their source files had the same name (thintreemodel2.png) in both
// color folders, so they're saved here under clearer, distinct names
// instead of nesting a green/ and orange/ folder that both contain a file
// with an identical filename.
assets.treeBigCutStump.src = "assets/items/trees/noLeaves/bigtreecutted.png";
assets.treeThinCutStump.src = "assets/items/trees/noLeaves/thintreecutted.png";
assets.treeThinNoLeaves1.src = "assets/items/trees/noLeaves/thintreenoleaves1.png";
assets.treeThinNoLeaves2.src = "assets/items/trees/noLeaves/thintreenoleaves2.png";
assets.treeTinyCutStump.src = "assets/items/trees/noLeaves/tinytreecutted.png";
assets.treeThinGreen.src = "assets/items/trees/green/thintree_green.png";
assets.treeTinyGreen.src = "assets/items/trees/green/tinytree_green.png";
assets.treeBigOrange.src = "assets/items/trees/orange/bigtree_orange.png";
assets.treeThinOrange.src = "assets/items/trees/orange/thintree_orange.png";

// --- house. Decorative only (no collision) — not asked for, not added.
assets.house1.src = "assets/items/house/house1.png";

// --- weather FX particles — rain, drifting clouds, low fog (js/weatherfx.js) ---
assets.rain.src = "assets/particles/Rain.png";
assets.rainOnFloor.src = "assets/particles/RainOnFloor.png";
assets.snow.src = "assets/particles/Snow.png";
assets.clouds.src = "assets/particles/Clouds.png";
assets.clouds2.src = "assets/particles/Clouds2.png";
assets.clouds3.src = "assets/particles/Clouds3.png";
assets.fog.src = "assets/particles/fog.png";
assets.fog2.src = "assets/particles/fog2.png";
assets.fog3.src = "assets/particles/fog3.png";

// --- wood tools/weapons. The 14 actual weapons get an `equipSlot` +
// `weapon.attackAnim` in itemDefs (inventory.js); the shields/crate/plaque
// are plain decor, same treatment as the grass tileset/flora.
assets.woodSword.src = "assets/items/wood/wood_sword.png";
assets.woodDagger.src = "assets/items/wood/wood_dagger.png";
assets.woodDaggerSmall.src = "assets/items/wood/wood_dagger_small.png";
assets.woodRapier.src = "assets/items/wood/wood_rapier.png";
assets.woodJavelin.src = "assets/items/wood/wood_javelin.png";
assets.woodAxe.src = "assets/items/wood/wood_axe.png";
assets.woodSickle.src = "assets/items/wood/wood_sickle.png";
assets.woodPickaxe.src = "assets/items/wood/wood_pickaxe.png";
assets.woodMattock.src = "assets/items/wood/wood_mattock.png";
assets.woodHammer.src = "assets/items/wood/wood_hammer.png";
assets.woodHookStaff.src = "assets/items/wood/wood_hook_staff.png";
assets.woodClubWrapped.src = "assets/items/wood/wood_club_wrapped.png";
assets.woodTongs.src = "assets/items/wood/wood_tongs.png";
assets.woodBow.src = "assets/items/wood/wood_bow.png";
assets.woodCrate.src = "assets/items/wood/wood_crate.png";
assets.woodPlaque.src = "assets/items/wood/wood_plaque.png";
assets.woodShieldRound.src = "assets/items/wood/wood_shield_round.png";
assets.woodShieldSmall.src = "assets/items/wood/wood_shield_small.png";
assets.woodShieldLarge.src = "assets/items/wood/wood_shield_large.png";

// --- wood drop materials — granted from chopping trees ---
assets.woodLog.src = "assets/items/wood_drops/wood_log.png";
assets.woodPlank.src = "assets/items/wood_drops/wood_plank.png";
assets.woodStick.src = "assets/items/wood_drops/wood_stick.png";

let assetsLoadedCount = 0;
const assetsNeededCount = Object.keys(assets).length;
let onAssetsReadyCallback = null;

function whenAssetsReady(callback) {
  onAssetsReadyCallback = callback;
}

Object.values(assets).forEach((img) => {
  img.onload = () => {
    assetsLoadedCount++;
    if (assetsLoadedCount === assetsNeededCount && onAssetsReadyCallback) {
      onAssetsReadyCallback();
    }
  };
  img.onerror = () => console.error("Failed to load asset:", img.src);
});
