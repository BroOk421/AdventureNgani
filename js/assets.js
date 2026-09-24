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

  // Seated idle loops (assets/sprites/Sit/) — played while
  // `player.sitting` (js/furniture.js) instead of the normal idle sheet.
  // Ordinary 64x64 frame strips exactly like every sheet above (384x64 =
  // 6 frames each), drawn by the same math at the same DRAW_SIZE, so a
  // seated character is the same size as a walking/running/idle one.
  //   - sitFront (sith.png): facing the viewer — front-facing seats
  //   - sitSide  (sitv.png): side profile facing RIGHT; flipped in code
  //     for LEFT, same convention as every *Side sheet above
  sitFront: new Image(),
  sitSide: new Image(),

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
  house: new Image(),
  // Interior scene art (assets/interior/asesprite/interior.ase, exported
  // to .png alongside it) — the one interior room layout that currently
  // exists, entered by walking onto tavern's/abandonHouse's front-door tile.
  // See js/interior.js.
  // One image per interior layout (js/interior.js's
  // INTERIOR_ROOM_BLUEPRINTS). Named after the room, not the
  // building, since a building just points at one of these.
  houseRoom: new Image(),    // House's own small one-room interior
  tavernRoom: new Image(),   // the Tavern's two-part interior
  abandonRoom: new Image(),  // the Abandoned House's single room
  // Dev/level-design-only marker (no source art — drawn on a throwaway
  // canvas below, same pattern as camera.js's silhouetteCanvas) for the
  // interior collision-block item (js/interior.js's `room.collisions`) —
  // a plain hazard-striped square just so it's visible both in the
  // inventory and sitting on the floor while placing it.
  collisionMarker: new Image(),

  // --- weather FX particles (assets/particles/), see js/weatherfx.js ---
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
  woodStick: new Image(),
// ==== added by tools/add_remaining_items.py — new items pass ====
  bushBigGreen: new Image(),
  bushBigLightGreen: new Image(),
  bushBigRed: new Image(),
  bushBigYellow: new Image(),
  bushMediumGreen: new Image(),
  bushMediumLightGreen: new Image(),
  bushMediumRed: new Image(),
  bushMediumYellow: new Image(),
  bushSmallGreen: new Image(),
  bushSmallLightGreen: new Image(),
  bushSmallRed: new Image(),
  bushSmallYellow: new Image(),
  bushXSGreen: new Image(),
  bushXSLightGreen: new Image(),
  bushXSRed: new Image(),
  bushXSYellow: new Image(),
  bushFlowerA: new Image(),
  bushFlowerB: new Image(),
  bushFlowerC: new Image(),
  bushFlowerD: new Image(),
  bushMushroom1: new Image(),
  bushMushroom2: new Image(),
  leavesFloor: new Image(),
  treeMediumGreen: new Image(),
  treeMediumLightGreen: new Image(),
  treeMediumRed: new Image(),
  treeMediumYellow: new Image(),
  treeMediumGreenTrunk: new Image(),
  treeMediumRedYellowTrunk: new Image(),
  tavern: new Image(),
  abandonHouse: new Image(),
  interiorWall: new Image(),
  ceilingTile: new Image(),
  windowPlain1: new Image(),
  windowPlain2: new Image(),
  windowLight1: new Image(),
  windowLight2: new Image(),
  windowLight3: new Image(),
  doorPlain1: new Image(),
  doorPlain2: new Image(),
  doorPlain3: new Image(),
  chimneyRedDoor: new Image(),
  wallPoster: new Image(),
  pictureFrame: new Image(),
  boardA: new Image(),
  boardB: new Image(),
  wallFurniture1: new Image(),
  wallFurniture2: new Image(),
  wallFurniture3: new Image(),
  wallFurniture4: new Image(),
  wallFurniture5: new Image(),
  wallFurniture6: new Image(),
  wallFurniture7: new Image(),
  cookerExtension1: new Image(),
  cookerExtension2: new Image(),
  tableFurniture1: new Image(),
  tableFurniture2: new Image(),
  tableFurniture3: new Image(),
  tableFurniture4: new Image(),
  mugFull: new Image(),
  mugEmpty: new Image(),
  plateEmpty: new Image(),
  plateFood: new Image(),
  meatItem: new Image(),
  chairFront: new Image(),
  chairRight: new Image(),
  chairLeft: new Image(),  // the mirror of chairRight — art was already on disk, just unused
  cabinetBaseA: new Image(),
  cabinetBaseB: new Image(),
  cabinetBaseC: new Image(),
  cabinetBaseD: new Image(),
  basket1: new Image(),
  basket2: new Image(),
  bedBig: new Image(),
  // 20-frame sleep animation for the Big Bed (assets/interior/
  // asesprite/bigbed-sheet.png — 1380x54 = 20 frames of 69x54 each,
  // laid out horizontally), played while `player.sleeping` (js/
  // resources.js's trySleepInBed()/updateSleeping()) instead of the
  // normal `assets.bedBig` icon.
  bedBigSleep: new Image(),
  bedSmall: new Image(),
  tableBig: new Image(),
  tableBig1: new Image(),
  tableBig2: new Image(),
  tableCircle: new Image(),
  tableKitchen: new Image(),
  tableSmall: new Image(),
  cookerStove1: new Image(),
  cookerStove2: new Image(),
  cookerStove3: new Image(),
  couch: new Image(),
  drawerFurniture: new Image(),
  broom: new Image(),
  barrelInterior: new Image(),
  crateInterior: new Image(),
  chimneyPlain: new Image(),
  chimneyRed: new Image(),
  benchHorizontal: new Image(),
  benchVertical: new Image(),
  chairOutdoorFront: new Image(),
  chairOutdoorSide: new Image(),
  chairOutdoorSideLeft: new Image(), // generated mirror of chairside.png
  floorMat: new Image(),
  longTableHorizontal: new Image(),
  longTableVertical: new Image(),
  portBridge: new Image(),
  portBridgeDecor: new Image(),
  portBridgeFront1: new Image(),
  portBridgeFront2: new Image(),
  portBridgeFront3: new Image(),
  portBridgeFront4: new Image(),
  portBridgeWall1: new Image(),
  portBridgeWall2: new Image(),
  postPlain: new Image(),
  postLight: new Image(),
  postLightLit: new Image(), // the lit-at-night version of the lamp post
  postLightLeft: new Image(),    // generated mirrors of the two above, for a left-facing lamp
  postLightLitLeft: new Image(),
  postHandleLight: new Image(),
  tableOutdoorSmall: new Image(),
  vegOnion: new Image(),
  vegOnionBox: new Image(),
  vegPetchay: new Image(),
  vegPetchayBox: new Image(),
  vegCabbage: new Image(),
  vegCabbageBox: new Image(),
  vegBrocolli: new Image(),
  vegBrocolliBox: new Image(),
  vegBrocolliFlower: new Image(),
  vegBrocolliFlowerBox: new Image(),
  vegCarrots: new Image(),
  vegCarrotBox: new Image(),
  vegDragonfruit: new Image(),
  vegDragonfruitBox: new Image(),
  vegCrate: new Image(),
  vegCrateOpen: new Image(),
  dirtRake: new Image(),
  dirtWet: new Image(),
  plantDrawer: new Image(),
  plotSocketOpen: new Image(),
  plotSocketClosed: new Image(),
  waterCrateHorizontal: new Image(),
  waterCrateVertical: new Image(),


  // Fence Tiles — fence sliced into 16px tiles (see itemDefs' fenceTile* entries)
  fenceTileR0C0: new Image(),
  fenceTileR0C1: new Image(),
  fenceTileR0C2: new Image(),
  fenceTileR0C3: new Image(),
  fenceTileR0C4: new Image(),
  fenceTileR1C0: new Image(),
  fenceTileR1C1: new Image(),
  fenceTileR1C3: new Image(),
  fenceTileR1C4: new Image(),
  fenceTileR2C0: new Image(),
  fenceTileR2C4: new Image(),
  fenceTileR3C0: new Image(),
  fenceTileR3C1: new Image(),
  fenceTileR3C3: new Image(),
  fenceTileR3C4: new Image(),
  fenceTileR4C0: new Image(),
  fenceTileR4C1: new Image(),
  fenceTileR4C2: new Image(),
  fenceTileR4C3: new Image(),
  // Brown Floor Tiles — floorBrown sliced into 16px tiles (see itemDefs' floorBrownTile* entries)
  floorBrownTileR0C1: new Image(),
  floorBrownTileR0C2: new Image(),
  floorBrownTileR0C3: new Image(),
  floorBrownTileR1C0: new Image(),
  floorBrownTileR1C1: new Image(),
  floorBrownTileR1C2: new Image(),
  floorBrownTileR1C3: new Image(),
  floorBrownTileR1C4: new Image(),
  floorBrownTileR2C0: new Image(),
  floorBrownTileR2C1: new Image(),
  floorBrownTileR2C2: new Image(),
  floorBrownTileR2C3: new Image(),
  floorBrownTileR2C4: new Image(),
  floorBrownTileR3C0: new Image(),
  floorBrownTileR3C1: new Image(),
  floorBrownTileR3C2: new Image(),
  floorBrownTileR3C3: new Image(),
  floorBrownTileR3C4: new Image(),
  floorBrownTileR4C1: new Image(),
  floorBrownTileR4C2: new Image(),
  floorBrownTileR4C3: new Image(),
  // Dark Green Floor Tiles — floorDarkGreen sliced into 16px tiles (see itemDefs' floorDarkGreenTile* entries)
  floorDarkGreenTileR0C0: new Image(),
  floorDarkGreenTileR0C1: new Image(),
  floorDarkGreenTileR0C2: new Image(),
  floorDarkGreenTileR1C0: new Image(),
  floorDarkGreenTileR1C1: new Image(),
  floorDarkGreenTileR1C2: new Image(),
  floorDarkGreenTileR2C0: new Image(),
  floorDarkGreenTileR2C1: new Image(),
  floorDarkGreenTileR2C2: new Image(),
  // Green Floor Tiles — floorGreen sliced into 16px tiles (see itemDefs' floorGreenTile* entries)
  floorGreenTileR0C0: new Image(),
  floorGreenTileR0C1: new Image(),
  floorGreenTileR0C2: new Image(),
  floorGreenTileR1C0: new Image(),
  floorGreenTileR1C1: new Image(),
  floorGreenTileR1C2: new Image(),
  floorGreenTileR2C0: new Image(),
  floorGreenTileR2C1: new Image(),
  floorGreenTileR2C2: new Image(),
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
assets.sitFront.src = "assets/sprites/Sit/sith.png";
assets.sitSide.src = "assets/sprites/Sit/sitv.png"; // faces RIGHT; flipped in code for LEFT

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
assets.house.src = "assets/items/house/house1.png";        // file name kept; only the item id was renamed

// --- weather FX particles — rain, drifting clouds, low fog (js/weatherfx.js) ---
// Rain.png is no longer loaded — rain is drawn by code now (js/weatherfx.js's
// drawRain()). RainOnFloor.png below is still used for the ground splash.
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

// Draws the collision-marker icon on a throwaway canvas instead of
// loading a file — it's a dev/level-design tool, not real game art (see
// the `collisionMarker` key above). A red hazard-striped square with a
// yellow "X" through it, easy to spot both in the inventory grid and
// sitting on an interior room's floor.
(function generateCollisionMarkerIcon() {
  const size = 16;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const cx = c.getContext("2d");
  cx.fillStyle = "rgba(200, 30, 30, 0.65)";
  cx.fillRect(0, 0, size, size);
  cx.strokeStyle = "#ffd83d";
  cx.lineWidth = 2;
  cx.strokeRect(1, 1, size - 2, size - 2);
  cx.beginPath();
  cx.moveTo(2, 2);
  cx.lineTo(size - 2, size - 2);
  cx.moveTo(size - 2, 2);
  cx.lineTo(2, size - 2);
  cx.strokeStyle = "#ffd83d";
  cx.lineWidth = 1.5;
  cx.stroke();
  assets.collisionMarker.src = c.toDataURL();
})();

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

// ==== added by tools/add_remaining_items.py — new items pass ====
assets.bushBigGreen.src = "assets/bushes/biggreenbush.png";
assets.bushBigLightGreen.src = "assets/bushes/biglightgreenbush.png";
assets.bushBigRed.src = "assets/bushes/bigredbush.png";
assets.bushBigYellow.src = "assets/bushes/bigyellowbush.png";
assets.bushMediumGreen.src = "assets/bushes/mediumgreenbush.png";
assets.bushMediumLightGreen.src = "assets/bushes/mediumlightgreenbush.png";
assets.bushMediumRed.src = "assets/bushes/mediumredbush.png";
assets.bushMediumYellow.src = "assets/bushes/mediumyellowbush.png";
assets.bushSmallGreen.src = "assets/bushes/smallgreenbush.png";
assets.bushSmallLightGreen.src = "assets/bushes/smalllightgreenbush.png";
assets.bushSmallRed.src = "assets/bushes/smallredbush.png";
assets.bushSmallYellow.src = "assets/bushes/smallyellowbush.png";
assets.bushXSGreen.src = "assets/bushes/xsgreenbush.png";
assets.bushXSLightGreen.src = "assets/bushes/xslightgreenbush.png";
assets.bushXSRed.src = "assets/bushes/xsredbush.png";
assets.bushXSYellow.src = "assets/bushes/xsyellowbush.png";
assets.bushFlowerA.src = "assets/bushes/flower.png";
assets.bushFlowerB.src = "assets/bushes/flower2.png";
assets.bushFlowerC.src = "assets/bushes/flower3.png";
assets.bushFlowerD.src = "assets/bushes/flower4.png";
assets.bushMushroom1.src = "assets/bushes/mushroom.png";
assets.bushMushroom2.src = "assets/bushes/mushroom2.png";
assets.leavesFloor.src = "assets/bushes/leaves_floor.png";
assets.treeMediumGreen.src = "assets/items/trees/green/mediumgreentree.png";
assets.treeMediumLightGreen.src = "assets/items/trees/lightgreen/mediumlightgreentree.png";
assets.treeMediumRed.src = "assets/items/trees/red/mediumredtree.png";
assets.treeMediumYellow.src = "assets/items/trees/yellow/mediumyellowtree.png";
assets.treeMediumGreenTrunk.src = "assets/items/trees/trunks/mediumgreentrunk.png";
assets.treeMediumRedYellowTrunk.src = "assets/items/trees/trunks/mediumredyellowtrunk.png";
assets.tavern.src = "assets/items/house/house2.png";       // file name kept; only the item id was renamed
assets.abandonHouse.src = "assets/items/house/house3.png"; // file name kept; only the item id was renamed
assets.houseRoom.src = "assets/interior/asesprite/smallinterior.png";
assets.tavernRoom.src = "assets/interior/asesprite/tavern_room.png";
assets.abandonRoom.src = "assets/interior/asesprite/abandon_room.png";
assets.interiorWall.src = "assets/interior/interior_wall.png";
assets.ceilingTile.src = "assets/interior/ceiling.png";
assets.windowPlain1.src = "assets/interior/window.png";
assets.windowPlain2.src = "assets/interior/window2.png";
assets.windowLight1.src = "assets/interior/window_light.png";
assets.windowLight2.src = "assets/interior/window_light2.png";
assets.windowLight3.src = "assets/interior/window_light3.png";
assets.doorPlain1.src = "assets/interior/door.png";
assets.doorPlain2.src = "assets/interior/door2.png";
assets.doorPlain3.src = "assets/interior/door3.png";
assets.chimneyRedDoor.src = "assets/interior/chimnyreddoor.png";
assets.wallPoster.src = "assets/interior/wall_poster.png";
assets.pictureFrame.src = "assets/interior/pictureframe.png";
assets.boardA.src = "assets/interior/board.png";
assets.boardB.src = "assets/interior/board2.png";
assets.wallFurniture1.src = "assets/interior/wall_furniture.png";
assets.wallFurniture2.src = "assets/interior/wall_furniture2.png";
assets.wallFurniture3.src = "assets/interior/wall_furniture3.png";
assets.wallFurniture4.src = "assets/interior/wall_furniture4.png";
assets.wallFurniture5.src = "assets/interior/wall_furniture5.png";
assets.wallFurniture6.src = "assets/interior/wall_furniture6.png";
assets.wallFurniture7.src = "assets/interior/wall_furniture7.png";
assets.cookerExtension1.src = "assets/interior/cooker_extension.png";
assets.cookerExtension2.src = "assets/interior/cooker2_extension.png";
assets.tableFurniture1.src = "assets/interior/table_furniture.png";
assets.tableFurniture2.src = "assets/interior/table_furniture2.png";
assets.tableFurniture3.src = "assets/interior/table_furniture3.png";
assets.tableFurniture4.src = "assets/interior/table_furniture4.png";
assets.mugFull.src = "assets/interior/mug_drink.png";
assets.mugEmpty.src = "assets/interior/mug_empty.png";
assets.plateEmpty.src = "assets/interior/plate_empty.png";
assets.plateFood.src = "assets/interior/plate_food.png";
assets.meatItem.src = "assets/interior/meat.png";
assets.chairFront.src = "assets/interior/frontchair.png";
assets.chairRight.src = "assets/interior/rightchair.png";
assets.chairLeft.src = "assets/interior/leftchair.png";
assets.cabinetBaseA.src = "assets/interior/base.png";
assets.cabinetBaseB.src = "assets/interior/base2.png";
assets.cabinetBaseC.src = "assets/interior/base3.png";
assets.cabinetBaseD.src = "assets/interior/base5.png";
assets.basket1.src = "assets/interior/basket.png";
assets.basket2.src = "assets/interior/basket2.png";
assets.bedBig.src = "assets/interior/bigbed.png";
assets.bedBigSleep.src = "assets/interior/asesprite/bigbed-sheet.png";
assets.bedSmall.src = "assets/interior/smallbed.png";
assets.tableBig.src = "assets/interior/bigtable.png";
assets.tableBig1.src = "assets/interior/bigtable1.png";
assets.tableBig2.src = "assets/interior/bigtable2.png";
assets.tableCircle.src = "assets/interior/circletable.png";
assets.tableKitchen.src = "assets/interior/kitchen_table.png";
assets.tableSmall.src = "assets/interior/smalltable.png";
assets.cookerStove1.src = "assets/interior/cooker.png";
assets.cookerStove2.src = "assets/interior/cooker2.png";
assets.cookerStove3.src = "assets/interior/cooker3.png";
assets.couch.src = "assets/interior/couch.png";
assets.drawerFurniture.src = "assets/interior/drawer.png";
assets.broom.src = "assets/interior/walis.png";
assets.barrelInterior.src = "assets/interior/barrel.png";
assets.crateInterior.src = "assets/interior/box.png";
assets.chimneyPlain.src = "assets/interior/chimny.png";
assets.chimneyRed.src = "assets/interior/chimnyred.png";
assets.benchHorizontal.src = "assets/outdoor/benchh.png";
assets.benchVertical.src = "assets/outdoor/benchv.png";
assets.chairOutdoorFront.src = "assets/outdoor/chairfront.png";
assets.chairOutdoorSide.src = "assets/outdoor/chairside.png";
assets.chairOutdoorSideLeft.src = "assets/outdoor/chairside_left.png";
assets.floorMat.src = "assets/outdoor/floormat.png";
assets.longTableHorizontal.src = "assets/outdoor/longtableh.png";
assets.longTableVertical.src = "assets/outdoor/longtablev.png";
assets.portBridge.src = "assets/outdoor/port_bridge.png";
assets.portBridgeDecor.src = "assets/outdoor/port_bridge_decor.png";
assets.portBridgeFront1.src = "assets/outdoor/port_bridge_front.png";
assets.portBridgeFront2.src = "assets/outdoor/port_bridge_front2.png";
assets.portBridgeFront3.src = "assets/outdoor/port_bridge_front3.png";
assets.portBridgeFront4.src = "assets/outdoor/port_bridge_front4.png";
assets.portBridgeWall1.src = "assets/outdoor/port_bridge_wall.png";
assets.portBridgeWall2.src = "assets/outdoor/port_bridge_wall2.png";
assets.postPlain.src = "assets/outdoor/post.png";
assets.postLight.src = "assets/outdoor/postlight.png";
assets.postLightLit.src = "assets/outdoor/postlight-light.png";
assets.postLightLeft.src = "assets/outdoor/postlight_left.png";
assets.postLightLitLeft.src = "assets/outdoor/postlight-light_left.png";
assets.postHandleLight.src = "assets/outdoor/posthandlelight.png";
assets.tableOutdoorSmall.src = "assets/outdoor/table.png";
assets.vegOnion.src = "assets/items/vegetables/onion/onion_mature.png";
assets.vegOnionBox.src = "assets/items/vegetables/onion/onionbox.png";
assets.vegPetchay.src = "assets/items/vegetables/petchay/petchay_mature.png";
assets.vegPetchayBox.src = "assets/items/vegetables/petchay/petchaybox.png";
assets.vegCabbage.src = "assets/items/vegetables/cabbage/cabbage_mature.png";
assets.vegCabbageBox.src = "assets/items/vegetables/cabbage/cabbagebox.png";
assets.vegBrocolli.src = "assets/items/vegetables/brocolli/brocolli_mature.png";
assets.vegBrocolliBox.src = "assets/items/vegetables/brocolli/brocollibox.png";
assets.vegBrocolliFlower.src = "assets/items/vegetables/brocolli_flower/brocolli_flower_mature.png";
assets.vegBrocolliFlowerBox.src = "assets/items/vegetables/brocolli_flower/brocolli_flowerbox.png";
assets.vegCarrots.src = "assets/items/vegetables/carrots/carrots_mature.png";
assets.vegCarrotBox.src = "assets/items/vegetables/carrots/carrotbox.png";
assets.vegDragonfruit.src = "assets/items/vegetables/dragonfruit/dragonfruit_mature.png";
assets.vegDragonfruitBox.src = "assets/items/vegetables/dragonfruit/dragonfruitbox.png";
assets.vegCrate.src = "assets/items/vegetables/box.png";
assets.vegCrateOpen.src = "assets/items/vegetables/boxopen.png";
assets.dirtRake.src = "assets/items/vegetables/dirtrake.png";
assets.dirtWet.src = "assets/items/vegetables/dirtwet.png";
assets.plantDrawer.src = "assets/items/vegetables/plantdrawer.png";
assets.plotSocketOpen.src = "assets/items/vegetables/socketopen.png";
assets.plotSocketClosed.src = "assets/items/vegetables/socketclose.png";
assets.waterCrateHorizontal.src = "assets/items/vegetables/waterboxh.png";
assets.waterCrateVertical.src = "assets/items/vegetables/waterboxv.png";

// --- fence / floor sheets sliced into 16px tiles (js/inventory.js tile groups) ---
assets.fenceTileR0C0.src = "assets/outdoor/fence_tiles/r0c0.png";
assets.fenceTileR0C1.src = "assets/outdoor/fence_tiles/r0c1.png";
assets.fenceTileR0C2.src = "assets/outdoor/fence_tiles/r0c2.png";
assets.fenceTileR0C3.src = "assets/outdoor/fence_tiles/r0c3.png";
assets.fenceTileR0C4.src = "assets/outdoor/fence_tiles/r0c4.png";
assets.fenceTileR1C0.src = "assets/outdoor/fence_tiles/r1c0.png";
assets.fenceTileR1C1.src = "assets/outdoor/fence_tiles/r1c1.png";
assets.fenceTileR1C3.src = "assets/outdoor/fence_tiles/r1c3.png";
assets.fenceTileR1C4.src = "assets/outdoor/fence_tiles/r1c4.png";
assets.fenceTileR2C0.src = "assets/outdoor/fence_tiles/r2c0.png";
assets.fenceTileR2C4.src = "assets/outdoor/fence_tiles/r2c4.png";
assets.fenceTileR3C0.src = "assets/outdoor/fence_tiles/r3c0.png";
assets.fenceTileR3C1.src = "assets/outdoor/fence_tiles/r3c1.png";
assets.fenceTileR3C3.src = "assets/outdoor/fence_tiles/r3c3.png";
assets.fenceTileR3C4.src = "assets/outdoor/fence_tiles/r3c4.png";
assets.fenceTileR4C0.src = "assets/outdoor/fence_tiles/r4c0.png";
assets.fenceTileR4C1.src = "assets/outdoor/fence_tiles/r4c1.png";
assets.fenceTileR4C2.src = "assets/outdoor/fence_tiles/r4c2.png";
assets.fenceTileR4C3.src = "assets/outdoor/fence_tiles/r4c3.png";
assets.floorBrownTileR0C1.src = "assets/interior/floorbrown_tiles/r0c1.png";
assets.floorBrownTileR0C2.src = "assets/interior/floorbrown_tiles/r0c2.png";
assets.floorBrownTileR0C3.src = "assets/interior/floorbrown_tiles/r0c3.png";
assets.floorBrownTileR1C0.src = "assets/interior/floorbrown_tiles/r1c0.png";
assets.floorBrownTileR1C1.src = "assets/interior/floorbrown_tiles/r1c1.png";
assets.floorBrownTileR1C2.src = "assets/interior/floorbrown_tiles/r1c2.png";
assets.floorBrownTileR1C3.src = "assets/interior/floorbrown_tiles/r1c3.png";
assets.floorBrownTileR1C4.src = "assets/interior/floorbrown_tiles/r1c4.png";
assets.floorBrownTileR2C0.src = "assets/interior/floorbrown_tiles/r2c0.png";
assets.floorBrownTileR2C1.src = "assets/interior/floorbrown_tiles/r2c1.png";
assets.floorBrownTileR2C2.src = "assets/interior/floorbrown_tiles/r2c2.png";
assets.floorBrownTileR2C3.src = "assets/interior/floorbrown_tiles/r2c3.png";
assets.floorBrownTileR2C4.src = "assets/interior/floorbrown_tiles/r2c4.png";
assets.floorBrownTileR3C0.src = "assets/interior/floorbrown_tiles/r3c0.png";
assets.floorBrownTileR3C1.src = "assets/interior/floorbrown_tiles/r3c1.png";
assets.floorBrownTileR3C2.src = "assets/interior/floorbrown_tiles/r3c2.png";
assets.floorBrownTileR3C3.src = "assets/interior/floorbrown_tiles/r3c3.png";
assets.floorBrownTileR3C4.src = "assets/interior/floorbrown_tiles/r3c4.png";
assets.floorBrownTileR4C1.src = "assets/interior/floorbrown_tiles/r4c1.png";
assets.floorBrownTileR4C2.src = "assets/interior/floorbrown_tiles/r4c2.png";
assets.floorBrownTileR4C3.src = "assets/interior/floorbrown_tiles/r4c3.png";
assets.floorDarkGreenTileR0C0.src = "assets/interior/floordarkgreen_tiles/r0c0.png";
assets.floorDarkGreenTileR0C1.src = "assets/interior/floordarkgreen_tiles/r0c1.png";
assets.floorDarkGreenTileR0C2.src = "assets/interior/floordarkgreen_tiles/r0c2.png";
assets.floorDarkGreenTileR1C0.src = "assets/interior/floordarkgreen_tiles/r1c0.png";
assets.floorDarkGreenTileR1C1.src = "assets/interior/floordarkgreen_tiles/r1c1.png";
assets.floorDarkGreenTileR1C2.src = "assets/interior/floordarkgreen_tiles/r1c2.png";
assets.floorDarkGreenTileR2C0.src = "assets/interior/floordarkgreen_tiles/r2c0.png";
assets.floorDarkGreenTileR2C1.src = "assets/interior/floordarkgreen_tiles/r2c1.png";
assets.floorDarkGreenTileR2C2.src = "assets/interior/floordarkgreen_tiles/r2c2.png";
assets.floorGreenTileR0C0.src = "assets/interior/floorgreen_tiles/r0c0.png";
assets.floorGreenTileR0C1.src = "assets/interior/floorgreen_tiles/r0c1.png";
assets.floorGreenTileR0C2.src = "assets/interior/floorgreen_tiles/r0c2.png";
assets.floorGreenTileR1C0.src = "assets/interior/floorgreen_tiles/r1c0.png";
assets.floorGreenTileR1C1.src = "assets/interior/floorgreen_tiles/r1c1.png";
assets.floorGreenTileR1C2.src = "assets/interior/floorgreen_tiles/r1c2.png";
assets.floorGreenTileR2C0.src = "assets/interior/floorgreen_tiles/r2c0.png";
assets.floorGreenTileR2C1.src = "assets/interior/floorgreen_tiles/r2c1.png";
assets.floorGreenTileR2C2.src = "assets/interior/floorgreen_tiles/r2c2.png";
