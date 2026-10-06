"use strict";

/* =================================================================
   WORLDS — per request ("tugtungan mo pa nga ng path papunta dun sa
   ibang world... half lang ng world na original... sa original map port
   col: 1 row: 40 tapos mapunta sa kabila tapos spawn naman nun pa
   original world col: 3 row: 40").

   Two outdoor worlds share the same tile grid and every outdoor system:
     - "main": the town (the original map)
     - "wild": the forest valley ringed by mountains (js/wildWorld.data.js,
       built by tools/build_wild_world.py), WILD_WORLD_DEFAULT.cols x .rows
       tiles — half the main map
   Only one is loaded into the layers at a time. Switching packs the
   current one's placed items + grass fill into `worldStore`, clears the
   layers and unpacks the other one, then repaints the ground.

   Portals: walk WEST onto the main map's col 0-1, rows 39-41 -> the wild
   world's east pass; walk EAST through the pass's last tiles -> back to
   the main map at col 3, row 40.

   The town's people and animals (Maria, citizens, customers, farm animals)
   belong to the main world: they pause and aren't drawn while you're in
   the wild. Saving always writes the main world in the usual fields and
   the wild one under `worlds.wild`, so old saves and tools keep working.
   The game opens in the WILD world (startInDefaultWorld()), at the
   player's House there; the town is through the pass.
================================================================= */

let currentWorld = "main";
const worldStore = { main: null, wild: null, east1: null, east2: null, east3: null, east4: null, east5: null, east6: null };
// Every world besides the town: its own size and default layout. The east
// worlds (js/eastWorlds.data.js, tools/build_east_worlds.py) chain off the
// town's EAST edge: town -> east1 -> east2, each with its own mobs (js/mines.js).
const WORLD_DEFS = {
  wild: WILD_WORLD_DEFAULT,
  east1: typeof EAST_WORLDS !== "undefined" ? EAST_WORLDS.east1 : null,
  east2: typeof EAST_WORLDS !== "undefined" ? EAST_WORLDS.east2 : null,
  // the far worlds, reached through warp portals (js/gear.js)
  east3: typeof EAST_WORLDS !== "undefined" ? EAST_WORLDS.east3 : null,
  east4: typeof EAST_WORLDS !== "undefined" ? EAST_WORLDS.east4 : null,
  east5: typeof EAST_WORLDS !== "undefined" ? EAST_WORLDS.east5 : null,
  east6: typeof EAST_WORLDS !== "undefined" ? EAST_WORLDS.east6 : null,
  east7: typeof EAST_WORLDS !== "undefined" ? EAST_WORLDS.east7 || null : null, // the Volcano (tools/build_east_worlds.py)
  east8: typeof EAST_WORLDS !== "undefined" ? EAST_WORLDS.east8 || null : null, // the Azure Coast
  forest: typeof EAST_WORLDS !== "undefined" ? EAST_WORLDS.forest || null : null, // the Greenwood, west of the wild world (js/forest.js)
};
const EXTRA_WORLDS = Object.keys(WORLD_DEFS).filter((w) => WORLD_DEFS[w]);
const WILD_COLS = WILD_WORLD_DEFAULT.cols, WILD_ROWS = WILD_WORLD_DEFAULT.rows;
const WILD_PASS_ROWS = WILD_WORLD_DEFAULT.pass || [24, 28];
const MAIN_PORTAL = { cols: [0, 1], rows: [39, 41], spawn: { col: 3, row: 40 } };
const WILD_SPAWN = WILD_WORLD_DEFAULT.spawn || [WILD_COLS - 6, 26];
const WILD_PORTAL = { cols: [WILD_COLS - 2, WILD_COLS - 1], rows: WILD_PASS_ROWS, spawn: { col: WILD_SPAWN[0], row: WILD_SPAWN[1] } };
// Where the townsfolk hang around — the village, not wherever the player happens to be (js/citizens.js).
const TOWN_CENTRE_TILE = { col: 90, row: 63 };

function worldW() { return currentWorld !== "main" && WORLD_DEFS[currentWorld] ? WORLD_DEFS[currentWorld].cols * TILE : MAP_W; }
function worldH() { return currentWorld !== "main" && WORLD_DEFS[currentWorld] ? WORLD_DEFS[currentWorld].rows * TILE : MAP_H; }
// The town's east edge -> east1's west pass (rows 63-65, by the village).
const MAIN_EAST_PORTAL = { cols: [186, 187], rows: [63, 65], spawn: { col: 184, row: 64 } };

function packCurrentWorld() {
  return {
    layoutVersion: WORLD_DEFS[currentWorld] && WORLD_DEFS[currentWorld].layoutVersion, // a saved far world from an older layout is dropped on load
    placedItems: ALL_LAYERS.flatMap((layer) => Array.from(layer.entries())),
    groundFill: { cols: COLS, rows: ROWS, bits: encodeGroundFill() },
  };
}

function unpackWorld(data) {
  ALL_LAYERS.forEach((layer) => layer.clear());
  for (const [key, type] of data.placedItems || []) {
    if (!itemDefs[type]) continue;
    layerForType(type).set(key, type);
  }
  applyGroundFillSave(data.groundFill);
  if (!groundFillInitialized) ensureGroundFillInitialized();
  repaintAllGroundFill();
}

function placePlayerOnTile(col, row, facing) {
  player.x = (col + 0.5) * TILE;
  player.y = (row + 0.5) * TILE - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  player.facing = facing;
  player.anim = "idle"; player.frame = 0; player.frameTimer = 0;
}

function switchWorld(target, spawn, facing, quiet) {
  if (target === currentWorld) return;
  if (heldItem) cancelHeldItem();
  worldStore[currentWorld] = packCurrentWorld();
  currentWorld = target;
  unpackWorld(worldStore[target] || JSON.parse(JSON.stringify(WORLD_DEFS[target] || WILD_WORLD_DEFAULT)));
  if (spawn) placePlayerOnTile(spawn.col, spawn.row, facing || "down");
  if (!quiet) saveGame();
}

/* ---------------- the wild world is the default world ----------------
   Per request ("yung default ko ng spawn world yung bago... para mag
   simula mag farm mag design ng bahay"): the game opens in the wild world,
   in front of the player's House there. Called once from start() (main.js),
   after the town has been loaded and its people placed. */
function startInDefaultWorld() {
  switchWorld("wild", null, null, true);
  if (!placePlayerAtHomeDoor()) placePlayerOnTile(WILD_SPAWN[0], WILD_SPAWN[1], "left"); // no House there -> by the pass
}

// The minimap shows the outdoor map — inside a room it stays on screen but goes black (per request,
// "kapag nasa room siguro gawin mo maging black na lang"), the dial's frame still there.
setInterval(() => {
  const mm = document.getElementById("minimap");
  if (!mm) return;
  mm.style.visibility = "";
  if (player.scene === "inside") {
    const g = mm.getContext("2d");
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, mm.width, mm.height);
    g.fillStyle = "#000"; g.beginPath(); g.arc(mm.width / 2, mm.height / 2, Math.min(mm.width, mm.height) / 2, 0, Math.PI * 2); g.fill();
    g.restore();
  }
}, 200);

let worldPortalCooldown = 0;
function checkWorldPortals() {
  if (player.scene !== "outside" || sceneFade || player.sleeping || player.sitting) return;
  if (performance.now() < worldPortalCooldown) return;
  const feetY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  const col = Math.floor(player.x / TILE), row = Math.floor(feetY / TILE);
  const inZone = (z) => col >= z.cols[0] && col <= z.cols[1] && row >= z.rows[0] && row <= z.rows[1];
  if (currentWorld === "main" && inZone(MAIN_PORTAL) && (keys["a"] || keys["arrowleft"])) {
    worldPortalCooldown = performance.now() + 1500;
    beginSceneFade(() => switchWorld("wild", WILD_PORTAL.spawn, "left"));
  } else if (currentWorld === "wild" && inZone(WILD_PORTAL) && (keys["d"] || keys["arrowright"])) {
    worldPortalCooldown = performance.now() + 1500;
    beginSceneFade(() => switchWorld("main", MAIN_PORTAL.spawn, "right"));
  } else if (currentWorld === "main" && WORLD_DEFS.east1 && inZone(MAIN_EAST_PORTAL) && (keys["d"] || keys["arrowright"])) {
    worldPortalCooldown = performance.now() + 1500;
    const sw = WORLD_DEFS.east1.spawnWest;
    beginSceneFade(() => switchWorld("east1", { col: sw[0], row: sw[1] }, "right"));
  } else if (WORLD_DEFS[currentWorld] && currentWorld.startsWith("east")) {
    const D = WORLD_DEFS[currentWorld], n = +currentWorld.slice(4);
    const westZone = { cols: [0, 1], rows: D.pass }, eastZone = { cols: [D.cols - 2, D.cols - 1], rows: D.pass };
    if (D.westPass !== false && inZone(westZone) && (keys["a"] || keys["arrowleft"])) {
      worldPortalCooldown = performance.now() + 1500;
      const prev = n === 1 ? null : WORLD_DEFS["east" + (n - 1)];
      beginSceneFade(() => prev ? switchWorld("east" + (n - 1), { col: prev.spawnEast[0], row: prev.spawnEast[1] }, "left")
                               : switchWorld("main", MAIN_EAST_PORTAL.spawn, "left"));
    } else if (D.passes && D.passes.length && checkSidePasses(D, col, row)) {
      // walked out through a side passage (east2 -> east3 ... east6)
    } else if (D.eastPass && WORLD_DEFS["east" + (n + 1)] && inZone(eastZone) && (keys["d"] || keys["arrowright"])) {
      worldPortalCooldown = performance.now() + 1500;
      const nx = WORLD_DEFS["east" + (n + 1)];
      beginSceneFade(() => switchWorld("east" + (n + 1), { col: nx.spawnWest[0], row: nx.spawnWest[1] }, "right"));
    }
  }
}

/* Side passages — per request (the far worlds: "gawin mo yung parang normal
   na portal lang na maglalakad pero wag sa center ... iba iba din na area
   pero sa gilid lang"): gaps in a world's mountain ring at off-centre spots
   (WORLD_DEFS[w].passes: side N/S/W/E, from..to). Walk out through one (keep
   walking toward the edge) and you come in through the linked passage of the
   next world. */
const SIDE_LINKS = {
  "east2:next": ["east3", "back"], "east3:back": ["east2", "next"],
  "east3:next": ["east4", "back"], "east4:back": ["east3", "next"],
  "east4:next": ["east5", "back"], "east5:back": ["east4", "next"],
  "east5:next": ["east6", "back"], "east6:back": ["east5", "next"],
  "east6:next": ["east7", "back"], "east7:back": ["east6", "next"],
  "east7:next": ["east8", "back"], "east8:back": ["east7", "next"],
};
function passSpawn(D, p) {
  const m = Math.floor((p.from + p.to) / 2);
  // a few tiles in from the gap, so you don't walk straight back out
  if (p.side === "N") return { col: m, row: 6, facing: "down" };
  if (p.side === "S") return { col: m, row: D.rows - 7, facing: "up" };
  if (p.side === "W") return { col: 6, row: m, facing: "right" };
  return { col: D.cols - 7, row: m, facing: "left" };
}
function checkSidePasses(D, col, row) {
  for (const p of D.passes) {
    // (the body can't reach the very edge row/column — the camera clamp keeps it a tile in)
    const out = p.side === "N" ? row <= 1 && col >= p.from && col <= p.to && (keys["w"] || keys["arrowup"])
      : p.side === "S" ? row >= D.rows - 2 && col >= p.from && col <= p.to && (keys["s"] || keys["arrowdown"])
      : p.side === "W" ? col <= 1 && row >= p.from - 1 && row <= p.to + 1 && (keys["a"] || keys["arrowleft"])
      : col >= D.cols - 2 && row >= p.from - 1 && row <= p.to + 1 && (keys["d"] || keys["arrowright"]);
    if (!out) continue;
    const link = SIDE_LINKS[currentWorld + ":" + p.name];
    if (!link || !WORLD_DEFS[link[0]]) return false;
    const T = WORLD_DEFS[link[0]], tp = (T.passes || []).find((q) => q.name === link[1]);
    if (!tp) return false;
    const sp = passSpawn(T, tp);
    worldPortalCooldown = performance.now() + 2500;
    beginSceneFade(() => {
      switchWorld(link[0], { col: sp.col, row: sp.row }, sp.facing);
      const Z = typeof MOB_WORLDS !== "undefined" && MOB_WORLDS[link[0]];
      if (Z && typeof showToast === "function") showToast(Z.name + " — mobs Lv " + Z.level[0] + "-" + Z.level[1]);
    });
    return true;
  }
  return false;
}

/* ---------------- the town's residents stay in the town ---------------- */
function mainWorldOnly(fn, empty) {
  return function () { return currentWorld === "main" ? fn.apply(this, arguments) : empty; };
}
updateCitizens = mainWorldOnly(updateCitizens);
updateAnimals = mainWorldOnly(updateAnimals);
updateCustomers = mainWorldOnly(updateCustomers);
updateNPC = mainWorldOnly(updateNPC);
updateWaiterJob = mainWorldOnly(updateWaiterJob);
// updateResources (regrowing stumps/stones) now runs in every world — each pending regrowth knows its own world (js/resources.js).
citizenDrawables = mainWorldOnly(citizenDrawables, []);
citizenTownCentre = function () {
  return { x: (TOWN_CENTRE_TILE.col + 0.5) * TILE, y: (TOWN_CENTRE_TILE.row + 0.5) * TILE };
};
animalDrawables = mainWorldOnly(animalDrawables, []);
customerDrawables = mainWorldOnly(customerDrawables, []);
if (typeof citizenRelightList === "function") citizenRelightList = mainWorldOnly(citizenRelightList, []);

{
  const updatePlayerBase = updatePlayer;
  updatePlayer = function (dt) { updatePlayerBase(dt); checkWorldPortals(); };
}

/* ---------------- passages between the caves ----------------
   Per request ("walang portal papunta dun sa ibang cave... yung pang
   mountain na bukas lang... dapat mag kaka connect"): each cave's deep
   chamber has an opening in the rock (bldWallCaveHole) at a link tile
   (TOWN_ART.caveLayouts[...].links). Walking UP into it takes you to the
   matching opening in the other cave — in the other world if need be —
   and leaving that cave puts you outside ITS entrance.
     tunnel (wild, top right) A <-> town cave A
     tunnel (wild, top right) B <-> west cave (wild) A */
const CAVE_LINKS = {
  tunnel_room: { A: { type: "caveEntrance", room: "cave_room", link: "A" }, B: { type: "caveEntranceB", room: "cave2_room", link: "A" } },
  cave_room: { A: { type: "tunnelEntrance", room: "tunnel_room", link: "A" } },
  cave2_room: { A: { type: "tunnelEntrance", room: "tunnel_room", link: "B" } },
};

function findBuildingAnywhere(type) {
  for (const [key, t] of objectLayer) if (t === type) return { world: currentWorld, key };
  const other = currentWorld === "main" ? "wild" : "main";
  const data = worldStore[other] || (other === "wild" ? WILD_WORLD_DEFAULT : null);
  if (data) for (const [key, t] of data.placedItems) if (t === type) return { world: other, key };
  return null;
}

let caveLinkCooldown = 0;
function checkCaveLinks() {
  if (player.scene !== "inside" || sceneFade || !(keys["w"] || keys["arrowup"])) return;
  if (performance.now() < caveLinkCooldown) return;
  const room = INTERIOR_ROOMS[player.activeRoomId];
  const layout = room && TOWN_ART.caveLayouts && TOWN_ART.caveLayouts[room.blueprintId];
  const links = layout && layout.links;
  if (!links || !CAVE_LINKS[room.blueprintId]) return;
  const t = interiorFeetTileAt(player.x, player.y);
  for (const [name, at] of Object.entries(links)) {
    const dest = CAVE_LINKS[room.blueprintId][name];
    if (!dest || t.col !== at.col || t.row !== at.row) continue;
    caveLinkCooldown = performance.now() + 1500;
    beginSceneFade(() => travelCaveLink(dest));
    return;
  }
}

function travelCaveLink(dest) {
  const b = findBuildingAnywhere(dest.type);
  if (!b) {
    // Its entrance isn't on any map any more (the wild world keeps only the west cave): the caves
    // underground still join — go through, and leaving puts you back outside the cave you came in by.
    if (!getOrCreateInteriorRoom(dest.room + "@underground")) return;
    player.activeRoomId = dest.room + "@underground";
    const at0 = TOWN_ART.caveLayouts[dest.room].links[dest.link];
    player.x = (at0.col + 0.5) * TILE;
    player.y = (at0.row + 1.5) * TILE - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
    player.facing = "down";
    saveGame();
    return;
  }
  const [col, row] = b.key.split(",").map(Number);
  const roomId = interiorRoomId(dest.room, col, row);
  if (!getOrCreateInteriorRoom(roomId)) return;
  if (b.world !== currentWorld) switchWorld(b.world, null, null, true);
  player.outsideReturn = { x: (col + 0.5) * TILE, y: (row + 1.5) * TILE - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE };
  player.activeRoomId = roomId;
  player.activeInteriorType = dest.type;
  const at = TOWN_ART.caveLayouts[dest.room].links[dest.link];
  player.x = (at.col + 0.5) * TILE;
  player.y = (at.row + 1.5) * TILE - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  player.facing = "down";
  saveGame();
}
{
  const insideBase = updatePlayerInsideInterior;
  updatePlayerInsideInterior = function (dt) { insideBase(dt); checkCaveLinks(); };
}

/* ---------------- older saves of the wild world ----------------
   A wild world saved before a place was added to it (the west cave, the
   tunnel, the House...) gets that place's corner copied in from today's
   default layout — items and grass alike — so the cave links have
   somewhere to come out. Nothing else in the saved world is touched. */
const WILD_PLACES = [
  { type: "caveEntranceB", box: [8, 0, 20, 24] },
];
function addMissingWildPlaces(store) {
  for (const place of WILD_PLACES) {
    if (store.placedItems.some(([, t]) => t === place.type)) continue;
    const [c0, r0, c1, r1] = place.box;
    const inBox = (k) => { const [c, r] = k.split(",").map(Number); return c >= c0 && c <= c1 && r >= r0 && r <= r1; };
    store.placedItems = store.placedItems.filter(([k]) => !inBox(k)).concat(WILD_WORLD_DEFAULT.placedItems.filter(([k]) => inBox(k)));
    try {
      const a = atob(store.groundFill.bits), b = atob(WILD_WORLD_DEFAULT.groundFill.bits);
      const bytes = Uint8Array.from(a, (ch) => ch.charCodeAt(0));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const i = r * COLS + c, on = (b.charCodeAt(i >> 3) >> (i & 7)) & 1;
        bytes[i >> 3] = on ? bytes[i >> 3] | (1 << (i & 7)) : bytes[i >> 3] & ~(1 << (i & 7));
      }
      store.groundFill = { cols: COLS, rows: ROWS, bits: btoa(String.fromCharCode(...bytes)) };
    } catch (e) { /* keep the saved grass */ }
  }
}

/* ---------------- saving / loading ---------------- */
{
  const buildBase = buildSaveData;
  buildSaveData = function () {
    const d = buildBase();
    d.worlds = {};
    for (const w of EXTRA_WORLDS) d.worlds[w] = worldStore[w] || null;
    if (currentWorld !== "main") {
      d.worlds[currentWorld] = { placedItems: d.placedItems, groundFill: d.groundFill };
      const main = worldStore.main;
      if (main) { d.placedItems = main.placedItems; d.groundFill = main.groundFill; }
    }
    return d;
  };
  const applyBase = applySaveData;
  applySaveData = function (data) {
    currentWorld = "main";
    worldStore.main = null;
    for (const w of EXTRA_WORLDS) {
      const sv = data && data.worlds && data.worlds[w] && Array.isArray(data.worlds[w].placedItems) ? data.worlds[w] : null;
      const want = WORLD_DEFS[w] && WORLD_DEFS[w].layoutVersion;
      worldStore[w] = sv && (!want || sv.layoutVersion === want) ? sv : null; // the far worlds were rebuilt (side passages): an older save of one starts fresh
    }
    if (worldStore.wild) addMissingWildPlaces(worldStore.wild);
    return applyBase(data);
  };
}
