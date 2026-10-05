"use strict";

/* =================================================================
   TOWN BUILDINGS — per request ("dagdagan mo sana ng bahay or may mga
   room na maliliit... yung mga ibang npc ilagay mo dun tapos gawa ka
   rin interior may mga pader at collissions din may pinto din palabas
   at papasok").

   Everything here is built from the Buildings pack (assets/buildings/
   source/) by tools/build_town_assets.py, which also writes the measured
   art sizes into js/townBuildings.data.js (TOWN_ART). Loaded right
   after assets.js, so inventory.js/interior.js can merge these in:
     - TOWN_ITEM_DEFS       -> itemDefs        (inventory.js)
     - TOWN_TILE_GROUPS     -> TILE_GROUP_META (inventory.js)
     - TOWN_LAYER_RULES     -> ITEM_LAYER_RULES(inventory.js)
     - TOWN_ROOM_BLUEPRINTS -> INTERIOR_ROOM_BLUEPRINTS (interior.js)

   Houses work exactly like the original House: a multi-tile footprint,
   the door is the placement tile (walk UP into it to enter), the doormat
   at the bottom of the room takes you back out (walk DOWN onto it).
   `citizenHome` marks a house the townsfolk live in (js/citizens.js):
   "town" houses take two townsfolk each, the guard house takes the four
   soldiers.

   Rooms come furnished (`defaultDecor`): the first time a room is made
   for a building it gets these pieces, as ordinary decor you can grab,
   move or remove — once the room is in the save, the save wins (see
   INTERIOR_SAVED_ROOM_IDS / getOrCreateInteriorRoom()).
================================================================= */

// Room ids that came from the save being loaded — those rooms keep
// exactly what was saved and never get the default furniture again.
const INTERIOR_SAVED_ROOM_IDS = new Set();
// Room shapes from the save being loaded (js/save.js fills it first), so a
// room is built at its saved shape straight away and its default
// furniture is only what fits that shape.
const INTERIOR_SAVED_CUSTOM = {};

const TOWN_HOUSE_INFO = {
  cottageLog:     { name: "Cottage (Log)",     room: "cottage_wood", home: "town",  capacity: 2 },
  cottagePlaster: { name: "Cottage (Plaster)", room: "plaster_room", home: "town",  capacity: 2 },
  cottageBrick:   { name: "Cottage (Brick)",   room: "cottage_wood", home: "town",  capacity: 2 },
  guardHouse:     { name: "Guard House",       room: "guard_room",   home: "guard", capacity: 4 },
  // Not a home — a mine/cave mouth set into a cliff face (per request,
  // "lagyan mo ng cave"). Placed ON the mountain wall; the wall tiles
  // under it already collide, the door works like a house door.
  // The grocery — per request ("bahay na pang grocery yung mga pang gulay").
  // Townsfolk drop by during the day (js/citizens.js `citizenShop`); J runs it.
  groceryStore:   { name: "Grocery",           room: "grocery_room", home: null,    capacity: 0, shop: true },
  // A second cave mouth, in the wild world's north cliff (js/worlds.js) — per request, "tunnel ... sa top right".
  tunnelEntrance: { name: "Tunnel Entrance",   room: "tunnel_room",  home: null,    capacity: 0, footW: 4, backRows: 0 },
  // A third cave, in the wild world's north cliff (west side) — joined to the others underground.
  caveEntranceB:  { name: "Cave Entrance (West)", room: "cave2_room", home: null,   capacity: 0, footW: 4, backRows: 0 },
  caveEntrance:   { name: "Cave Entrance",     room: "cave_room",    home: null,    capacity: 0, footW: 4, backRows: 0 },
  // Per request: an equipment shop and a potion shop at the west end of the town, open day and night (js/shops.js).
  equipShop:      { name: "Equipment Shop",    room: "equip_room",   home: null,    capacity: 0 },
  potionShop:     { name: "Potion Shop",       room: "potion_room",  home: null,    capacity: 0 },
  blacksmithShop: { name: "Blacksmith",        room: "smith_room",   home: null,    capacity: 0 },
};

// Display names; anything not listed falls back to its id.
const TOWN_ITEM_NAMES = {
  bldPlanterBox: "Planter Box", bldPlanterBush: "Planter (Bush)", bldBenchWood: "Long Bench (Outdoor)",
  bldBenchStone: "Stone Bench", bldLampPost: "Lamp Post (Thin)", bldChimney: "Chimney",
  bldTableLong: "Long Table (Dark)", bldChair: "Chair (Dark)", bldTableRound: "Round Table (Dark)",
  bldStove: "Stove", bldStoveBig: "Kitchen Range", bldWardrobe: "Wardrobe", bldDresser: "Dresser",
  bldBedSingle: "Single Bed (Blue)", bldBedDouble: "Double Bed (Blue)", bldCouch: "Couch (Blue)",
  bldFireplace: "Stone Fireplace", bldOven: "Brick Oven", bldBarrel: "Barrel (Dark)", bldChest: "Chest",
  bldCounterSink: "Kitchen Counter", bldBench: "Bench (Dark)", bldTub: "Bathtub",
  bldPlantFlower: "Potted Flower", bldPlantA: "Potted Plant (A)", bldPlantB: "Potted Plant (B)", bldPlantSmall: "Potted Plant (Small)", bldTableCloth: "Table (Blue Cloth)", bldChandelier: "Chandelier", bldCuttingBoard: "Cutting Board",
  bldBreadBoard: "Bread Board", bldPot: "Clay Pot", bldBasket: "Basket (Round)", bldKettle: "Kettle", bldPan: "Frying Pan",
  bldPotionRed: "Bottle (Red)", bldPotionGreen: "Bottle (Green)", bldPotionPurple: "Bottle (Purple)", bldBroom: "Broom",
  bldStoolRed: "Cushion (Red)", bldStool: "Stool", bldCupboard: "Cupboard", bldCrateDark: "Crate (Dark)",
  bldWallPanel: "Wall Panel", bldWallCandle: "Wall Candle", bldShelfLong: "Long Shelf", bldCabinetWide: "Wide Cabinet",
  floorMatBldGreen: "Rug (Green)", floorMatBldDark: "Rug (Dark)", floorMatBldCross: "Rug (Wood Cross)",
  bldWallWindow: "Window (Indoor)", bldWallWindowStone: "Window (Stone)", bldWallFrame: "Picture Frame (Dark)",
  bldWallBoard: "Notice Board", bldWallTrophyWolf: "Wolf Trophy", bldWallCaveHole: "Cave Opening", bldWallTrophyBear: "Bear Trophy",
  bldWallDoorPlank: "Door Decor (Plank)", bldWallDoorArched: "Door Decor (Arched)", bldWallShutters: "Window w/ Shutters",
};

// How many tiles each solid piece blocks (rows counted from the bottom).
// Width is read off the art; the depth is set by hand where it matters.
const TOWN_FOOTPRINT_DEPTH = { bldBedSingle: 3, bldBedDouble: 3, bldFireplace: 2, bldOven: 2 };
const TOWN_NOT_SOLID = new Set(["bldChimney", "bldPotionRed", "bldPotionGreen", "bldPotionPurple", "bldBroom", "bldStoolRed", "bldCuttingBoard", "bldBreadBoard", "bldPan", "bldChandelier"]);

const TOWN_ITEM_DEFS = {};
const TOWN_OUTDOOR_PROPS = Object.keys(TOWN_ART.props);

for (const [id, info] of Object.entries(TOWN_HOUSE_INFO)) {
  const art = TOWN_ART.houses[id];
  TOWN_ITEM_DEFS[id] = {
    id, name: info.name, icon: assets[id], unlimited: true, collides: true,
    multiTileFootprint: true,
    footprintWidthTiles: info.footW || Math.round((art.w - 16) / TILE), // the walls; the roof eaves overhang half a tile each side
    footprintHeightTiles: Math.round(art.h / TILE),
    footprintExcludeBackRows: info.backRows !== undefined ? info.backRows : 5, // the roof — walkable behind the house, like the House's back rows
    fadeOnlyWhenBehind: true,
    buildSeconds: 10,
    interior: { roomId: info.room, doorOffset: { col: 0, row: 0 } },
    citizenHome: info.home || undefined,
    citizenCapacity: info.capacity || undefined,
    citizenShop: info.shop || undefined,
  };
}

function townSolidDef(id, art) {
  const wt = Math.max(1, Math.round(art.w / TILE));
  const left = Math.floor((wt - 1) / 2);
  return {
    id, name: TOWN_ITEM_NAMES[id] || id, icon: assets[id], unlimited: true,
    collides: true,
    fixedFootprint: { leftTiles: left, rightTiles: wt - 1 - left, heightTiles: TOWN_FOOTPRINT_DEPTH[id] || 1 },
  };
}
for (const [id, art] of Object.entries(TOWN_ART.props)) {
  TOWN_ITEM_DEFS[id] = TOWN_NOT_SOLID.has(id)
    ? { id, name: TOWN_ITEM_NAMES[id] || id, icon: assets[id], unlimited: true }
    : townSolidDef(id, art);
}
for (const [id, art] of Object.entries(TOWN_ART.furniture)) {
  if (TOWN_NOT_SOLID.has(id)) {
    TOWN_ITEM_DEFS[id] = { id, name: TOWN_ITEM_NAMES[id] || id, icon: assets[id], unlimited: true };
  } else if (id.startsWith("floorMat") || id.startsWith("bldWall")) {
    // rugs lie on the floor; wall pieces hang on the wall — neither blocks
    TOWN_ITEM_DEFS[id] = { id, name: TOWN_ITEM_NAMES[id] || id, icon: assets[id], unlimited: true, flat: id.startsWith("floorMat") || undefined };
  } else {
    TOWN_ITEM_DEFS[id] = townSolidDef(id, art);
  }
}

// Pixel Crawler props (assets/pixelcrawler/, cut by tools/build_town_assets.py) —
// one inventory group per source sheet.
for (const [id, art] of Object.entries(TOWN_ART.pc || {})) {
  const def = { id, name: art.group + " " + id.replace(/^pc[A-Za-z]+?(\d+)$/, "#$1").replace(/^pcTree/, "Tree ").replace(/^pc/, ""), icon: assets[id], unlimited: true };
  // The small Rocks (pebble size, 16x14 or smaller — the brown "dirt
  // pebbles" and their grey twins) lie on the ground: per request ("yung
  // sa pebbles na dirt ... dapat naka overlap lang character jan") every
  // character always draws over them, and they never fade.
  if (art.group === "Rocks" && art.w <= 16 && art.h <= 14) {
    def.alwaysBehindPlayer = true;
    def.noOcclusionFade = true;
  }
  if (art.solid) {
    def.collides = true;
    const wt = Math.max(1, Math.round(art.w / TILE));
    const left = Math.floor((wt - 1) / 2);
    def.fixedFootprint = { leftTiles: art.group === "Tree" ? 0 : left, rightTiles: art.group === "Tree" ? 0 : wt - 1 - left, heightTiles: 1 };
  }
  TOWN_ITEM_DEFS[id] = def;
}

// The little House in town now belongs to a townsperson (per request, "yung small house... sa iba mo na
// ibigay"): same art and footprint as the player's House, its own room (cabin_room, js/interior.js).
TOWN_ITEM_DEFS.townCabin = {
  id: "townCabin", name: "Cabin (Townsfolk)", icon: assets.house, unlimited: true, collides: true,
  multiTileFootprint: true, footprintExcludeBackRows: 2, fadeOnlyWhenBehind: true, buildSeconds: 10,
  interior: { roomId: "cabin_room", doorOffset: { col: 0, row: 0 } },
  citizenHome: "town", citizenCapacity: 2,
};

// Round table: + a 4px collision strip along the bottom of the tile above it (interiorTopStrips(), js/interior.js).
if (TOWN_ITEM_DEFS.bldTableRound) TOWN_ITEM_DEFS.bldTableRound.collisionTopStrip = 0.25;

// Room tools (js/roomCustomizer.js) — equip, then F facing a wall/floor.
TOWN_ITEM_DEFS.roomPickaxe = {
  id: "roomPickaxe", name: "Room Pickaxe (palakihin)", icon: assets.roomPickaxe, unlimited: true,
  equipSlot: "weapon", weapon: { attackAnim: "crush" },
};
TOWN_ITEM_DEFS.roomHammer = {
  id: "roomHammer", name: "Room Hammer (paliitin)", icon: assets.roomHammer, unlimited: true,
  equipSlot: "weapon", weapon: { attackAnim: "crush" },
};

const TOWN_LAYER_RULES = [
  [6, /^bldChandelier/],     // hangs from the ceiling — drawn over everyone
  [5, /^bldWall/],           // hangs on a wall (allowed on a room's wall tiles)
  ["overlay", /^floorMatBld/], // floor rugs — furniture can stand on them
];

const TOWN_TILE_GROUPS = {
  pcRocks: { name: "Pixel Crawler: Rocks", match: (t) => t.startsWith("pcRocks") },
  pcDungeon: { name: "Pixel Crawler: Dungeon", match: (t) => t.startsWith("pcDungeon") },
  pcEsoteric: { name: "Pixel Crawler: Esoteric", match: (t) => t.startsWith("pcEsoteric") },
  pcFarm: { name: "Pixel Crawler: Farm", match: (t) => t.startsWith("pcFarm") },
  pcFurniture: { name: "Pixel Crawler: Furniture", match: (t) => t.startsWith("pcFurniture") },
  pcVegetation: { name: "Pixel Crawler: Plants", match: (t) => t.startsWith("pcVegetation") },
  pcResources: { name: "Pixel Crawler: Resources", match: (t) => t.startsWith("pcResources") },
  pcTree: { name: "Pixel Crawler: Trees", match: (t) => t.startsWith("pcTree") || t === "pcWorkbench" || t === "pcAnvil" || t === "pcCookingStation" },
  townHouse: { name: "Town Houses", match: (t) => !!TOWN_HOUSE_INFO[t] },
  bldOutdoor: { name: "Outdoor Props (Town)", match: (t) => TOWN_OUTDOOR_PROPS.includes(t) },
  bldWall: { name: "Wall Decor (Town)", match: (t) => t.startsWith("bldWall") },
  floorMatBld: { name: "Rugs (Town)", match: (t) => t.startsWith("floorMatBld") },
  bldFurniture: { name: "Furniture (Town)", match: (t) => t.startsWith("bld") && !t.startsWith("bldWall") && !TOWN_OUTDOOR_PROPS.includes(t) },
};

/* ---------------- rooms ----------------
   Every room art has the same frame (tools/build_town_assets.py): the
   back wall band runs y 8-64 (tile rows 0-3), a 6px frame down each
   side, an 8px frame along the bottom with a 32px doorway in the middle
   and the doormat in it. */
function townRoomBlueprint(roomName, defaultDecor, custom) {
  // Static art (the cave) keeps its picture; every other town room is a
  // CUSTOM room — drawn by js/roomCustomizer.js at its current wall/floor
  // style and size, which the player can change (H). `customDefaults` is
  // what a brand-new one starts as; the geometry below is replaced by
  // applyRoomCustom() the moment the room is created.
  const art = TOWN_ART.rooms[roomName] || { w: custom.cols * TILE, h: custom.rows * TILE, cols: custom.cols, rows: custom.rows };
  const W = art.w, H = art.h, mid = W / 2;
  const gapCols = [mid / TILE - 1, mid / TILE];
  const tileMap = [];
  for (let r = 0; r < art.rows; r++) {
    let line = "";
    for (let c = 0; c < art.cols; c++) {
      const wall = r <= 3 || c === 0 || c === art.cols - 1 || (r === art.rows - 1 && !gapCols.includes(c));
      line += wall ? "#" : ".";
    }
    tileMap.push(line);
  }
  return {
    image: assets["room_" + roomName],
    width: W,
    height: H,
    spawnX: mid,
    spawnY: H - 56,
    exitZone: { minX: mid - 18, maxX: mid + 18, minY: H - 38, maxY: H },
    walls: [
      { minX: -999, minY: -999, maxX: 999, maxY: 66 },
      { minX: -999, minY: -999, maxX: 6, maxY: 999 },
      { minX: W - 6, minY: -999, maxX: 999, maxY: 999 },
      { minX: -999, minY: H - 8, maxX: mid - 17, maxY: 999 },
      { minX: mid + 17, minY: H - 8, maxX: 999, maxY: 999 },
    ],
    tileMap,
    collisions: new Map(),
    decor: new Map(),
    indoorWarp: { forwardPortal: [], forwardSpawn: [], returnPortal: [], returnSpawn: [] },
    defaultDecor, // [col, row, type] — bottom-centre anchored, same as placing it by hand
    customDefaults: custom || undefined,
  };
}

function caveBlueprint(name) {
  const L = TOWN_ART.caveLayouts[name];
  const bp = townRoomBlueprint(name, L.decor, { wall: "cave", floor: "cave", tiles: L.tiles, door: L.door, layoutVersion: L.version });
  bp.lockedLayout = true; // not reshaped by the room tools
  bp.layoutVersion = L.version; // a save from an older cave shape is dropped (js/save.js)
  bp.indoorWarp = L.warp;
  return bp;
}

const TOWN_ROOM_BLUEPRINTS = {
  // The caves (per request: "di lang dapat na mismong isang box... parang nag cucurve yung daan tapos
  // papalaki yung area" + an inner door): a winding tunnel from the entrance that widens into a cavern;
  // the door at the top of the cavern leads (indoor warp) into a separate deeper chamber.
  // Shapes, props and the warp tiles come from tools/build_town_assets.py (TOWN_ART.caveLayouts).
  cave_room: caveBlueprint("cave_room"),
  tunnel_room: caveBlueprint("tunnel_room"),
  cave2_room: caveBlueprint("cave2_room"),
  // The ten mine levels under the tunnel (js/mineLevels.data.js, js/mines.js) are added just below.
  grocery_room: townRoomBlueprint("grocery_room", [
    [4, 2, "bldWallShutters"], [17, 2, "bldWallShutters"], [10, 1, "bldWallBoard"], [7, 2, "bldWallCandle"], [14, 2, "bldWallCandle"],
    [3, 4, "bldShelfLong"], [17, 4, "bldShelfLong"], [10, 4, "bldCabinetWide"],
    [7, 7, "bartenderLeft"], [8, 7, "bartenderCenter"], [9, 7, "bartenderCenter"], [10, 7, "bartenderCenter"], [11, 7, "bartenderCenter"], [12, 7, "bartenderCenter"], [13, 7, "bartenderRight"],
    [8, 6, "bldBasket"], [12, 6, "bldPot"],
    [2, 7, "vegCarrotBox"], [3, 7, "vegCabbageBox"], [4, 7, "vegOnionBox"],
    [2, 10, "vegPetchayBox"], [3, 10, "vegBrocolliBox"], [4, 10, "vegDragonfruitBox"],
    [17, 7, "vegCrateOpen"], [18, 7, "vegCrate"], [17, 10, "bldBarrel"], [18, 10, "bldBarrel"],
    [1, 12, "bldPlantB"], [19, 12, "bldPlantFlower"], [15, 12, "bldBroom"], [10, 10, "floorMatBldCross"],
    [14, 4, "pcFurniture12"], [6, 10, "pcFurniture13"], [7, 12, "pcFurniture16"], [16, 12, "pcFurniture17"], [13, 10, "pcFurniture05"],
  ], { wall: "wood", floor: "herring", start: "small" }),
  cottage_wood: townRoomBlueprint("cottage_wood", [
    [3, 2, "bldWallWindow"], [10, 2, "bldWallWindow"], [7, 2, "bldWallFrame"], [12, 1, "bldWallTrophyBear"],
    [2, 6, "bldBedDouble"], [5, 4, "bldWardrobe"], [8, 4, "bldShelfLong"], [12, 4, "bldStove"],
    [7, 8, "floorMatBldGreen"], [7, 7, "bldTableRound"], [5, 7, "bldChair"], [9, 7, "bldChair"],
    [3, 10, "bldChest"], [1, 10, "bldPlantA"], [12, 10, "bldPlantFlower"], [12, 7, "bldBarrel"], [1, 7, "bldPlantSmall"],
    [11, 11, "floorMatBldDark"], [7, 5, "bldChandelier"], [10, 4, "bldKettle"], [13, 9, "bldBroom"],
    [10, 10, "pcFurniture20"], [4, 8, "pcFurniture15"], [9, 2, "pcDungeon14"], [11, 8, "pcFurniture06"], [1, 9, "pcEsoteric10"],
  ], { wall: "wood", floor: "planks", start: "small" }),
  plaster_room: townRoomBlueprint("plaster_room", [
    [4, 2, "bldWallShutters"], [7, 2, "bldWallBoard"], [10, 2, "bldWallTrophyBear"], [1, 1, "bldWallFrame"],
    [2, 6, "bldBedSingle"], [4, 6, "bldBedSingle"], [11, 5, "bldFireplace"], [7, 4, "bldCabinetWide"],
    [10, 10, "floorMatBldDark"], [10, 9, "bldCouch"], [12, 8, "bldPlantB"],
    [3, 9, "bldTableCloth"], [5, 9, "bldChair"], [1, 10, "bldPlantSmall"], [12, 10, "bldPlantFlower"],
    [7, 7, "floorMatBldCross"], [9, 5, "bldPlantA"], [2, 8, "bldPotionGreen"], [12, 6, "bldStool"],
    [1, 8, "pcFurniture16"], [5, 2, "pcDungeon15"], [8, 10, "pcEsoteric04"], [6, 9, "pcFurniture13"], [12, 9, "pcEsoteric22"],
  ], { wall: "plaster", floor: "parquet", start: "small" }),
  guard_room: townRoomBlueprint("guard_room", [
    [3, 2, "bldWallWindowStone"], [16, 2, "bldWallWindowStone"], [6, 2, "bldWallTrophyWolf"], [10, 1, "bldWallBoard"], [13, 2, "bldWallFrame"],
    [2, 6, "bldBedSingle"], [4, 6, "bldBedSingle"], [15, 6, "bldBedSingle"], [17, 6, "bldBedSingle"],
    [8, 4, "bldStoveBig"], [12, 4, "bldWardrobe"], [10, 4, "bldCounterSink"],
    [10, 7, "bldTableLong"], [10, 8, "bldBench"], [10, 10, "floorMatBldGreen"],
    [2, 10, "bldChest"], [18, 10, "bldBarrel"], [18, 11, "bldBarrel"], [1, 11, "bldPlantA"], [16, 11, "bldPlantB"],
    [6, 10, "bldTub"], [14, 10, "bldChair"], [13, 8, "bldCrateDark"],
    [16, 9, "pcFurniture20"], [8, 2, "pcDungeon16"], [12, 2, "pcDungeon15"], [3, 8, "pcFurniture14"], [17, 8, "pcResources05"], [9, 11, "pcFurniture15"],
  ], { wall: "stone", floor: "stone", start: "small" }),
};// The shops (js/shops.js): a ready-made 10x6 floor with a counter, the keeper stands behind it.
function shopRoomLayout() {
  const tiles = [];
  for (let r = 4; r <= 9; r++) for (let c = 1; c <= 10; c++) tiles.push(c + "," + r);
  return { tiles, door: [5, 10] };
}
TOWN_ROOM_BLUEPRINTS.equip_room = townRoomBlueprint("equip_room", [
  [2, 1, "bldWallBoard"], [9, 1, "bldWallTrophyWolf"], [5, 2, "bldWallCandle"], [7, 2, "bldWallCandle"],
  [2, 4, "bldShelfLong"], [9, 4, "bldCabinetWide"],
  [3, 6, "bartenderLeft"], [4, 6, "bartenderCenter"], [5, 6, "bartenderCenter"], [6, 6, "bartenderCenter"], [7, 6, "bartenderCenter"], [8, 6, "bartenderRight"],
  [1, 9, "bldBarrel"], [10, 9, "bldCrateDark"], [10, 8, "bldBarrel"], [2, 9, "floorMatBldDark"],
], Object.assign({ wall: "stone", floor: "stone" }, shopRoomLayout()));
TOWN_ROOM_BLUEPRINTS.potion_room = townRoomBlueprint("potion_room", [
  [2, 1, "bldWallShutters"], [9, 1, "bldWallFrame"], [5, 2, "bldWallCandle"], [7, 2, "bldWallCandle"],
  [2, 4, "bldShelfLong"], [9, 4, "bldShelfLong"],
  [3, 6, "bartenderLeft"], [4, 6, "bartenderCenter"], [5, 6, "bartenderCenter"], [6, 6, "bartenderCenter"], [7, 6, "bartenderCenter"], [8, 6, "bartenderRight"],
  [4, 5, "bldPotionRed"], [7, 5, "bldPotionGreen"], [1, 9, "bldPlantFlower"], [10, 9, "bldPlantB"], [10, 8, "bldPot"], [5, 9, "floorMatBldCross"],
], Object.assign({ wall: "plaster", floor: "parquet" }, shopRoomLayout()));
TOWN_ROOM_BLUEPRINTS.smith_room = townRoomBlueprint("smith_room", [
  [2, 1, "bldWallTrophyWolf"], [9, 1, "bldWallBoard"], [5, 2, "bldWallCandle"], [7, 2, "bldWallCandle"],
  [2, 4, "bldStoveBig"], [9, 4, "bldFireplace"],
  [3, 6, "bartenderLeft"], [4, 6, "bartenderCenter"], [5, 6, "bartenderCenter"], [6, 6, "bartenderCenter"], [7, 6, "bartenderCenter"], [8, 6, "bartenderRight"],
  [1, 9, "bldBarrel"], [10, 9, "bldCrateDark"], [10, 8, "bldBarrel"], [1, 8, "bldCrateDark"], [5, 9, "floorMatBldDark"],
], Object.assign({ wall: "stone", floor: "stone" }, shopRoomLayout()));
// Mine levels (tools/build_mine_levels.py -> js/mineLevels.data.js): same cave format.
if (typeof MINE_LEVELS !== "undefined") for (const name of Object.keys(MINE_LEVELS)) TOWN_ROOM_BLUEPRINTS[name] = caveBlueprint(name);

