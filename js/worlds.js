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
const worldStore = { main: null, town2: null, wild: null, east1: null, east2: null, east3: null, east4: null, east5: null, east6: null };
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
  // the homes town, south of the town (js/town2Map.data.js, tools/build_town_small.py) — per request the
  // town keeps the tavern and the shops, every other house moved here
  town2: typeof TOWN2_MAP !== "undefined" ? TOWN2_MAP : null,
};
const EXTRA_WORLDS = Object.keys(WORLD_DEFS).filter((w) => WORLD_DEFS[w]);
const WILD_COLS = WILD_WORLD_DEFAULT.cols, WILD_ROWS = WILD_WORLD_DEFAULT.rows;
const WILD_PASS_ROWS = WILD_WORLD_DEFAULT.pass || [24, 28];
// The town (js/townMap.data.js, tools/build_town_small.py) is 80x46 like every other map now.
const TOWN_LAYOUT_VERSION = typeof TOWN_MAP !== "undefined" ? TOWN_MAP.layoutVersion : "big";
const TOWN_COLS = typeof TOWN_MAP !== "undefined" ? TOWN_MAP.cols : COLS, TOWN_ROWS = typeof TOWN_MAP !== "undefined" ? TOWN_MAP.rows : ROWS;
const MAIN_PORTAL = typeof TOWN_MAP !== "undefined"
  ? { cols: [0, 1], rows: TOWN_MAP.westPass, spawn: { col: TOWN_MAP.spawnWest[0], row: TOWN_MAP.spawnWest[1] } }
  : { cols: [0, 1], rows: [39, 41], spawn: { col: 3, row: 40 } };
const WILD_SPAWN = WILD_WORLD_DEFAULT.spawn || [WILD_COLS - 6, 26];
const WILD_PORTAL = { cols: [WILD_COLS - 2, WILD_COLS - 1], rows: WILD_PASS_ROWS, spawn: { col: WILD_SPAWN[0], row: WILD_SPAWN[1] } };
// Where the townsfolk hang around — the village, not wherever the player happens to be (js/citizens.js).
const TOWN_CENTRE_TILE = typeof TOWN_MAP !== "undefined" ? { col: TOWN_MAP.centre[0], row: TOWN_MAP.centre[1] } : { col: 90, row: 63 };

function worldW() { return currentWorld !== "main" && WORLD_DEFS[currentWorld] ? WORLD_DEFS[currentWorld].cols * TILE : TOWN_COLS * TILE; }
function worldH() { return currentWorld !== "main" && WORLD_DEFS[currentWorld] ? WORLD_DEFS[currentWorld].rows * TILE : TOWN_ROWS * TILE; }
// The town's east edge -> east1's west pass (rows 63-65, by the village).
const MAIN_EAST_PORTAL = typeof TOWN_MAP !== "undefined"
  ? { cols: [TOWN_COLS - 2, TOWN_COLS - 1], rows: TOWN_MAP.eastPass, spawn: { col: TOWN_MAP.spawnEast[0], row: TOWN_MAP.spawnEast[1] } }
  : { cols: [186, 187], rows: [63, 65], spawn: { col: 184, row: 64 } };

// The town's south road <-> the homes town's north road.
const MAIN_SOUTH_PORTAL = typeof TOWN_MAP !== "undefined" && TOWN_MAP.southPass
  ? { cols: [TOWN_MAP.southPass[0] - 1, TOWN_MAP.southPass[1] + 1], rows: [TOWN_ROWS - 2, TOWN_ROWS - 1] } : null;
const TOWN2_NORTH_PORTAL = typeof TOWN2_MAP !== "undefined"
  ? { cols: [TOWN2_MAP.northPass[0] - 1, TOWN2_MAP.northPass[1] + 1], rows: [0, 1] } : null;

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
  if (resumeWhereLeft()) return;
  switchWorld("wild", null, null, true);
  if (!placePlayerAtHomeDoor()) placePlayerOnTile(WILD_SPAWN[0], WILD_SPAWN[1], "left"); // no House there -> by the pass
}

/* ---------------- carry on where you left off ----------------
   Per request ("kung san siya nakapwesto tapos nag exit dapat kapag bukas
   ulit nandun siya"): the save keeps the world, the spot, and the room /
   cave you were in (`resume`); opening the game puts you back there. If
   that place is gone (the town was rebuilt, the room no longer exists, the
   spot is now blocked) you start at your House as before. */
let pendingResume = null;
function resumeWhereLeft() {
  const r = pendingResume;
  pendingResume = null;
  if (!r || typeof r.x !== "number" || typeof r.y !== "number") return false;
  if (r.world !== "main" && !WORLD_DEFS[r.world]) return false;
  if (r.world === "main" && r.town !== TOWN_LAYOUT_VERSION) return false; // the town was rebuilt since
  if (r.world !== "main" && (r.lv || null) !== ((WORLD_DEFS[r.world] && WORLD_DEFS[r.world].layoutVersion) || null)) return false; // that map was rebuilt
  const out = r.outside && typeof r.outside.x === "number" ? r.outside : (r.scene === "inside" ? null : { x: r.x, y: r.y });
  if (r.world !== currentWorld) switchWorld(r.world, null, null, true);
  const okOutside = (o) => o && o.x > 0 && o.y > 0 && o.x < worldW() && o.y < worldH() &&
    !(typeof isBodyBlockedAt === "function" && isBodyBlockedAt(o.x, o.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE));
  if (r.scene === "inside" && r.room) {
    let room = null;
    try { room = getOrCreateInteriorRoom(r.room); } catch (e) { room = null; }
    if (room) {
      player.scene = "inside";
      player.activeRoomId = r.room;
      player.activeInteriorType = r.type || null;
      player.outsideReturn = out && okOutside(out) ? { x: out.x, y: out.y } : null;
      if (!player.outsideReturn) { // no safe way back out recorded: the door of the House, or the pass
        const sx = player.x, sy = player.y;
        if (!placePlayerAtHomeDoor()) placePlayerOnTile(WILD_SPAWN[0], WILD_SPAWN[1], "left");
        player.outsideReturn = { x: player.x, y: player.y }; player.x = sx; player.y = sy;
      }
      player.x = r.x; player.y = r.y;
      player.facing = r.facing || "down";
      return true;
    }
  }
  if (!okOutside(out)) { switchWorld("wild", null, null, true); return false; }
  player.scene = "outside";
  player.x = out.x; player.y = out.y;
  player.facing = r.facing || "down";
  player.elevated = !!r.elevated;
  return true;
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
  } else if (currentWorld === "main" && WORLD_DEFS.town2 && TOWN_MAP.southPass && inZone(MAIN_SOUTH_PORTAL) && (keys["s"] || keys["arrowdown"])) {
    worldPortalCooldown = performance.now() + 1500;
    const sp = WORLD_DEFS.town2.spawnNorth;
    beginSceneFade(() => switchWorld("town2", { col: sp[0], row: sp[1] }, "down"));
  } else if (currentWorld === "town2" && inZone(TOWN2_NORTH_PORTAL) && (keys["w"] || keys["arrowup"])) {
    worldPortalCooldown = performance.now() + 1500;
    const sp = TOWN_MAP.spawnSouth;
    beginSceneFade(() => switchWorld("main", { col: sp[0], row: sp[1] }, "up"));
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
updateAnimals = function () { if (animals.length) animals.length = 0; }; // per request: no farm animals in the town (the Greenwood has its own)
updateCustomers = mainWorldOnly(updateCustomers);
updateNPC = mainWorldOnly(updateNPC);
updateWaiterJob = mainWorldOnly(updateWaiterJob);
// updateResources (regrowing stumps/stones) now runs in every world — each pending regrowth knows its own world (js/resources.js).
citizenDrawables = mainWorldOnly(citizenDrawables, []);
citizenTownCentre = function () {
  return { x: (TOWN_CENTRE_TILE.col + 0.5) * TILE, y: (TOWN_CENTRE_TILE.row + 0.5) * TILE };
};
animalDrawables = function () { return []; };
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
    const inside = player.scene === "inside";
    d.resume = { world: currentWorld, town: TOWN_LAYOUT_VERSION, lv: (WORLD_DEFS[currentWorld] && WORLD_DEFS[currentWorld].layoutVersion) || null, scene: inside ? "inside" : "outside",
      room: inside ? player.activeRoomId : null, type: inside ? player.activeInteriorType : null,
      x: player.sitting ? player.sitPreX : player.x, y: player.sitting ? player.sitPreY : player.y,
      outside: inside ? player.outsideReturn : null, facing: player.facing, elevated: !inside && !!player.elevated };
    d.townVersion = TOWN_LAYOUT_VERSION;
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
    // safety net: a save stamped with today's town that still holds the old
    // big town's items (out past 80x46) is migrated again
    if (data && typeof TOWN_MAP !== "undefined" && data.townVersion === TOWN_LAYOUT_VERSION && townLooksOld(data.placedItems)) delete data.townVersion;
    data = migrateToSmallTown(data);
    currentWorld = "main";
    worldStore.main = null;
    for (const w of EXTRA_WORLDS) {
      const sv = data && data.worlds && data.worlds[w] && Array.isArray(data.worlds[w].placedItems) ? data.worlds[w] : null;
      const want = WORLD_DEFS[w] && WORLD_DEFS[w].layoutVersion;
      worldStore[w] = sv && (!want || sv.layoutVersion === want) ? sv : null; // the far worlds were rebuilt (side passages): an older save of one starts fresh
    }
    if (worldStore.wild) addMissingWildPlaces(worldStore.wild);
    pendingResume = data && data.resume ? data.resume : null;
    return applyBase(data);
  };
}


/* ---------------- the town remade small ----------------
   Per request ("yung town gawin mo na lang na mas maliit na map ... pantay
   pantay na silang laki"): a save from the old big town gets the new town
   (js/townMap.data.js) in its place. Every room inside an old town building
   (tavern, shops, grocery, cottages, the cave ...) moves with it: the room
   id `<room>@col,row` is renamed to the same kind of building's new spot,
   everywhere in the save (furniture, room shapes, chests, Maria's trays ...),
   so what was inside stays. What the player had placed out in the old town,
   its farm plots and its auto-tile records go — the ground is all new. */
function townLooksOld(items) {
  if (!Array.isArray(items) || !items.length) return false;
  for (const [k] of items) {
    const i = String(k).indexOf(","), c = +String(k).slice(0, i), r = +String(k).slice(i + 1);
    if (c >= TOWN_MAP.cols || r >= TOWN_MAP.rows) return true;
  }
  return false;
}
function migrateToSmallTown(data) {
  if (!data || typeof TOWN_MAP === "undefined" || data.townVersion === TOWN_LAYOUT_VERSION) return data;
  const spots = {};
  // the town's buildings, then the homes town's (TOWN2_MAP): a cottage from an older town moves there
  for (const b of TOWN_MAP.buildings.concat(typeof TOWN2_MAP !== "undefined" ? TOWN2_MAP.buildings : [])) (spots[b.type] = spots[b.type] || []).push(b);
  spots.caveEntrance = [TOWN_MAP.cave];
  const used = {}, rename = {};
  for (const [k, t] of data.placedItems || []) {
    const def = itemDefs[t];
    if (!def || !def.interior || !def.interior.roomId || !spots[t]) continue;
    const i = used[t] || 0;
    if (i >= spots[t].length) continue;
    used[t] = i + 1;
    rename[def.interior.roomId + "@" + k] = def.interior.roomId + "@" + spots[t][i].col + "," + spots[t][i].row;
  }
  const keepWorlds = data.worlds;
  let out;
  try {
    const json = JSON.stringify(Object.assign({}, data, { worlds: undefined }))
      .replace(/([A-Za-z0-9]+_room)@(-?\d+),(-?\d+)/g, (m) => rename[m] || m);
    out = JSON.parse(json);
  } catch (e) { out = Object.assign({}, data); }
  out.worlds = Object.assign({}, keepWorlds || {}, { town2: null }); // the homes town starts from its own layout
  out.placedItems = TOWN_MAP.placedItems.map((e) => e.slice());
  out.groundFill = JSON.parse(JSON.stringify(TOWN_MAP.groundFill));
  if (out.autotileOwned && typeof out.autotileOwned === "object") { delete out.autotileOwned.main; delete out.autotileOwned["foot:main"]; }
  if (out.farm && out.farm.worlds) delete out.farm.worlds.main;
  if (Array.isArray(out.pendingConstructions)) out.pendingConstructions = [];
  if (Array.isArray(out.pendingRespawns)) out.pendingRespawns = out.pendingRespawns.filter(([, v]) => v && v.world && v.world !== "main");
  out.townVersion = TOWN_LAYOUT_VERSION;
  return out;
}
