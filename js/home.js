"use strict";

/* =================================================================
   HOME — the player's own House (house_room, in the wild world).

   Per request ("yung room ng bahay ng character is idilim mo na din parang
   kagaya sa ibang room like sa blacksmith grocery etc lagyan mo na lang ng
   ilaw yung pader parang sa cave. tapos kapag namatay yung character dapat
   yung spawn niya dun mismo sa loob ng bahay niya tabi ng bed sa pag baba
   niya kapag nagising"):

   1. The room follows the clock like every other room (its `owner` was
      removed in js/interior.js): bright by day, dark at night.
   2. Wall Candles on the back wall (real decor, lit at night by
      drawIndoorLampGlows(), js/camera.js). Added once to a House that has
      none (player.homeCandlesV1, saved); after that they're the player's
      to move or pick up.
   3. Dying (after the Death animation, js/fishing.js) no longer carries you
      out of the cave / to the town gate: the screen fades, and you wake up
      in your House — lying in the Big Bed (its sleep sheet, asleep, then
      the eyes open), then you climb out and stand beside it. No House or no
      bed: the old behaviour / the room's door.
================================================================= */

const HOME_TYPE = "house";             // the player's House (itemDefs), interior "house_room"
const HOME_WAKE_ASLEEP_SEC = 1.1;      // lying asleep before the eyes open
const HOME_WAKE_EYES_FPS = 5;          // sleep-sheet frames 4 -> 0 (eyes opening)
const HOME_WAKE_HOLD_SEC = 0.35;       // awake in bed for a moment
const HOME_STEP_OUT_SEC = 0.45;        // climbing out to the spot beside the bed

/* ---------------- 2. wall candles ---------------- */
// Back-wall tiles: for a room drawn from tiles (room.custom), every wall
// tile right above a floor tile; for the original art (300x300), row 5
// (the band the windows hang on), cols 1-17.
function homeWallSpots(room) {
  const spots = [];
  if (room.custom && room.floorTiles && room.floorTiles.size) {
    for (const k of room.floorTiles) {
      const [c, r] = k.split(",").map(Number);
      if (!room.floorTiles.has(c + "," + (r - 1))) spots.push([c, r - 1]);
    }
  } else if (room.tileMap) { // the tavern: a wall tile with floor right under it
    for (let r = 0; r < room.tileMap.length - 1; r++) {
      const line = room.tileMap[r], below = room.tileMap[r + 1];
      for (let c = 1; c < line.length - 1; c++) if (line[c] === "#" && below[c] === ".") spots.push([c, r]);
    }
  } else if (room.blueprintId === "house_room") {
    for (let c = 1; c <= 17; c++) spots.push([c, 5]);
  }
  spots.sort((a, b) => a[1] - b[1] || a[0] - b[0]); // row by row, left to right (runs of wall)
  return spots;
}
// Per request ("ganitong itsura dapat kapag gabi sa lahat"): every room is dark
// at night now, so any room with no light of its own (no lamp / candle decor)
// gets wall candles the same way, once (player.roomCandles, saved).
function ensureHomeCandles(room) {
  if (!room) return;
  const isHome = room.blueprintId === "house_room";
  if (isHome ? player.homeCandlesV1 : (player.roomCandles || []).includes(player.activeRoomId)) return;
  if (room.lockedLayout || (room.custom && room.custom.floor === "cave")) return; // caves have their own lamps
  if (isHome) player.homeCandlesV1 = true; else (player.roomCandles = player.roomCandles || []).push(player.activeRoomId);
  for (const t of room.decor.values()) if (itemDefs[t] && itemDefs[t].lightGlow) return; // already lit
  const taken = (c, r) => { // a wall piece on this tile or the one beside it (windows are ~2 tiles wide)
    for (let dc = -1; dc <= 1; dc++) for (const map of [room.decor, room.floorDecor]) if (map && map.has((c + dc) + "," + r)) return true;
    return false;
  };
  // every stretch of back wall gets its own candles, ~1 per 7 tiles
  const runs = [];
  for (const [c, r] of homeWallSpots(room)) {
    const last = runs[runs.length - 1];
    if (last && last.r === r && last.c1 === c - 1) last.c1 = c; else runs.push({ r, c0: c, c1: c });
  }
  const picked = [];
  for (const run of runs) {
    const len = run.c1 - run.c0 + 1;
    if (len < 3) continue;
    const n = Math.max(1, Math.round(len / 7));
    for (let i = 0; i < n; i++) {
      const target = run.c0 + (len - 1) * (i + 0.5) / n;
      let best = null;
      for (let c = run.c0 + (len > 4 ? 1 : 0); c <= run.c1 - (len > 4 ? 1 : 0); c++) {
        if (taken(c, run.r) || picked.some((p) => p[1] === run.r && Math.abs(p[0] - c) < 3)) continue;
        if (best === null || Math.abs(c - target) < Math.abs(best - target)) best = c;
      }
      if (best !== null) picked.push([best, run.r]);
    }
  }
  for (const [c, r] of picked) room.decor.set(c + "," + r, "bldWallCandle");
}
function homeRoomNow() {
  if (player.scene !== "inside" || !player.activeRoomId || player.activeRoomId.split("@")[0] !== "house_room") return null;
  return INTERIOR_ROOMS[player.activeRoomId] || null;
}
function roomNow() {
  return player.scene === "inside" && player.activeRoomId ? INTERIOR_ROOMS[player.activeRoomId] || null : null;
}
{
  const base = enterInterior;
  enterInterior = function () {
    const r = base.apply(this, arguments);
    const room = roomNow();
    if (room) ensureHomeCandles(room);
    return r;
  };
  // a game resumed inside the House (js/worlds.js resumeWhereLeft()) never calls enterInterior()
  setInterval(() => { const room = roomNow(); if (room) ensureHomeCandles(room); }, 1000);
}

/* ---------------- 3. waking up at home after dying ---------------- */
// Where the House is: the current world first, then the others (the wild world normally).
function findHomeHouse() {
  const look = (items) => { for (const [k, t] of items) if (t === HOME_TYPE) { const [c, r] = String(k).split(",").map(Number); return { col: c, row: r }; } return null; };
  const here = look(objectLayer); // the map we're on (indoors too — its outdoor layer is still loaded)
  if (here) return { world: currentWorld, ...here };
  const order = ["wild"].concat(Object.keys(worldStore).filter((w) => w !== "wild"));
  for (const w of order) {
    if (w === currentWorld) continue;
    const st = worldStore[w] || (w === "wild" && typeof WILD_WORLD_DEFAULT !== "undefined" ? WILD_WORLD_DEFAULT : null);
    if (!st || !Array.isArray(st.placedItems)) continue;
    const h = look(st.placedItems);
    if (h) return { world: w, ...h };
  }
  return null;
}
// A free spot beside the bed: its sides first (middle row), then below it.
function homeBedSide(room, bc, br) {
  const tiles = getObjectFootprintBlockedTiles("bedBig", bc, br);
  let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  for (const t of tiles) { c0 = Math.min(c0, t.col); c1 = Math.max(c1, t.col); r0 = Math.min(r0, t.row); r1 = Math.max(r1, t.row); }
  if (!isFinite(c0)) { c0 = c1 = bc; r0 = r1 = br; }
  const mid = Math.round((r0 + r1) / 2);
  const tries = [[c1 + 1, mid, "left"], [c0 - 1, mid, "right"], [c1 + 1, r1, "left"], [c0 - 1, r1, "right"],
    [Math.round((c0 + c1) / 2), r1 + 1, "up"], [c1 + 1, r1 + 1, "up"], [c0 - 1, r1 + 1, "up"], [c1 + 1, r0, "left"], [c0 - 1, r0, "right"]];
  for (const [c, r, face] of tries) {
    const x = (c + 0.5) * TILE, y = (r + 0.5) * TILE - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
    if (!isInteriorBodyBlockedAt(room, x, y)) return { x, y, face, fromX: ((c0 + c1) / 2 + 0.5) * TILE, fromY: y };
  }
  return null;
}
// Called at the black point of the fade: put the player in their House.
function respawnInHome() {
  const home = findHomeHouse();
  if (!home) return false;
  // leave wherever we are (a room / cave / another map)
  player.sitting = false; player.sleeping = false; player.special = null; player.action = null;
  player.mineSwing = null; player.autoTarget = null; player.selectedMob = null;
  player.scene = "outside"; player.activeRoomId = null; player.activeInteriorType = null; player.outsideReturn = null;
  player.elevated = false;
  if (home.world !== currentWorld) switchWorld(home.world, null, null, true);
  if (!placePlayerAtHomeDoor()) placePlayerOnTile(home.col, home.row + 1, "up");
  enterInterior(HOME_TYPE, home.col, home.row);
  const room = homeRoomNow();
  if (!room) return true; // in front of the door at least
  let bed = null;
  for (const [k, t] of room.decor) if (t === "bedBig") { const [c, r] = k.split(",").map(Number); bed = { col: c, row: r }; break; }
  const side = bed && homeBedSide(room, bed.col, bed.row);
  if (!bed || !side) return true; // no bed: just inside the door
  player.x = side.x; player.y = side.y; player.facing = "down";
  player.sleeping = true;
  player.sleepBedCol = bed.col; player.sleepBedRow = bed.row;
  player.sleepFrame = 12; player.sleepFrameTimer = 0;
  player.sleepFadeStarted = false;
  player.homeWake = { t: 0, side };
  return true;
}
// Lying in bed -> eyes open -> climb out (replaces the normal sleep tick while waking).
{
  const base = updateSleeping;
  updateSleeping = function (dt) {
    const W = player.homeWake;
    if (!W) return base.apply(this, arguments);
    W.t += dt;
    const asleepEnd = HOME_WAKE_ASLEEP_SEC, eyesEnd = asleepEnd + 5 / HOME_WAKE_EYES_FPS, holdEnd = eyesEnd + HOME_WAKE_HOLD_SEC;
    if (W.t < asleepEnd) player.sleepFrame = 10 + Math.floor(W.t * 4) % 4;               // zzz
    else if (W.t < eyesEnd) player.sleepFrame = Math.max(0, 4 - Math.floor((W.t - asleepEnd) * HOME_WAKE_EYES_FPS)); // eyes opening
    else if (W.t < holdEnd) player.sleepFrame = 0;                                        // awake
    else { // out of bed
      player.sleeping = false;
      player.homeWake = null;
      player.homeStep = { t: 0, x0: W.side.fromX, x1: W.side.x, y: W.side.y, face: W.side.face };
      player.x = W.side.fromX; player.facing = W.side.face === "up" ? "down" : W.side.face === "left" ? "right" : "left";
    }
  };
  const baseUpd = updatePlayer;
  updatePlayer = function (dt) {
    const S = player.homeStep;
    if (S && !(typeof sceneFade !== "undefined" && sceneFade)) {
      S.t += dt;
      const k = Math.min(1, S.t / HOME_STEP_OUT_SEC), e = k * (2 - k);
      player.x = S.x0 + (S.x1 - S.x0) * e;
      player.y = S.y - Math.sin(k * Math.PI) * 3; // a little hop down off the bed
      player.anim = "walk";
      player.frameTimer += dt;
      if (player.frameTimer >= 1 / (ANIM_FPS.walk || 10)) { player.frameTimer = 0; player.frame = (player.frame + 1) % (FRAME_COUNTS.walk || 6); }
      if (k >= 1) {
        player.homeStep = null; player.y = S.y; player.x = S.x1;
        player.anim = "idle"; player.frame = 0; player.frameTimer = 0; player.facing = "down";
        if (typeof saveGame === "function") saveGame();
      }
      return;
    }
    return baseUpd.apply(this, arguments);
  };
}

/* ---------------- saving the one-off candle flag ---------------- */
{
  const saveBase = buildSaveData;
  buildSaveData = function () { const d = saveBase.apply(this, arguments); d.homeCandlesV1 = !!player.homeCandlesV1; d.roomCandles = player.roomCandles || []; return d; };
  const loadBase = applySaveData;
  applySaveData = function (data) { const r = loadBase.apply(this, arguments); player.homeCandlesV1 = !!(data && data.homeCandlesV1); player.roomCandles = data && Array.isArray(data.roomCandles) ? data.roomCandles.slice() : []; player.homeWake = null; player.homeStep = null; return r; };
}
