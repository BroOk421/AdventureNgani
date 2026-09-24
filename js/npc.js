"use strict";

/* =================================================================
   NPC — a shopkeeper standing in the world: idle animation (4 frames)
   most of the day, and actually WALKS a short loop around its spawn
   point (6-frame walk sheet) during a morning window, both from
   assets/npc/; auto-flips which way it's facing every few minutes
   while idle, and opens a buy-list popup when left-clicked with empty
   hands.

   - `npc.facing` picks between separate PRE-FLIPPED sheets
     (npcIdleRight/npcIdleLeft, npcWalkRight/npcWalkLeft — assets.js)
     rather than the ctx.scale(-1,1) runtime-mirroring the player uses
     for its own side sprites — per request ("gawa ka ng left version
     din" for both sheets), actual left-facing files were wanted, not
     just a mirrored draw. There's no up/down NPC art, so facing only
     ever reflects horizontal movement (see moveNpcTowardTarget()) —
     purely vertical steps leave whichever of left/right it already had.
   - `npc.isWalking` (set once per frame in updateNPC(), read by both it
     and drawNPC() rather than recomputing `isNpcWalkingTime()` twice) is
     true during `NPC_WALK_START_HOUR`-`NPC_WALK_END_HOUR` (6:00-7:59,
     per request — `getGameHour()`, js/daynight.js, is a fractional 0-24
     value, so `< 8` correctly covers up to 7:59:59 without also
     matching 8:00 itself), idle (in place, wherever it ended up) the
     rest of the day. Switching between the two resets `npc.frame`/
     `npc.frameTimer` to 0 — idle (4 frames) and walk (6 frames) have
     different lengths, so carrying over an index from one into the
     other could read past the end of the shorter animation.
   - Movement/collision (per request): the NPC does NOT add any
     collision of its own — the player can walk right through it, and
     nothing checks its tile as blocked. But while it's roaming, IT
     still respects every OTHER collider — trees, stones, the house,
     any placed item with `collides` set — via the exact same
     isTileBlocked() (js/player.js) the player's own movement uses, so
     it can't wander through a wall of stones or straight through the
     house. See pickNewNpcTarget()/moveNpcTowardTarget() below.
   - Left-clicking the NPC (setupNpcClickHandler() below, wired up from
     main.js's start() the same way js/inventory.js's placement handler
     is) only opens the shop when BOTH hold mechanisms are empty
     (`heldItem` and `player.grabbedType`) — clicking the NPC while
     mid-placing something instead places it, same as clicking any other
     tile would, rather than fighting over what a click means. Works
     the same whether the NPC is currently idle or mid-stroll, since
     isPointOnNPC() always reads its live npc.x/npc.y.
   - The shop itself is a flat, no-scarcity buy list: every item here is
     already `unlimited: true` elsewhere in the game (nothing stops you
     from just placing more of anything for free), so buying isn't about
     acquiring an item you couldn't otherwise get — it's the actual gold
     economy this project didn't have before now. `player.gold` (js/
     player.js) is spent per purchase and IS saved (js/save.js), same
     treatment as inventory counts.
================================================================= */

const NPC_NAME = "Maria";         // shown in the shop popup's title (renderNpcShopGrid() below) — deliberately NOT floated over her head in the world
const NPC_IDLE_FRAME_COUNT = 4;   // matches the idle sheet (256x64 = 4x 64x64 frames)
const NPC_IDLE_FPS = ANIM_FPS.idle; // reuse the player's own idle speed rather than inventing a separate constant
const NPC_WALK_FRAME_COUNT = 6;   // matches the walk sheet (384x64 = 6x 64x64 frames)
const NPC_WALK_FPS = ANIM_FPS.walk; // reuse the player's own walk speed
const NPC_DRAW_SIZE = DRAW_SIZE;  // same on-screen size as the player, for visual consistency standing next to them
const NPC_FACING_SWITCH_MS = 3 * 60 * 1000; // per request — flips idle facing every 3 minutes
const NPC_CLICK_RADIUS = 26;      // world px — how close a click needs to land to the NPC's center to count as clicking it
const NPC_WALK_START_HOUR = 6;    // per request — walks from 6:00...
const NPC_WALK_END_HOUR = 8;      // ...up to (not including) 8:00, then idles in place

// --- roaming movement (real movement now, not just an in-place animation) ---
const NPC_MOVE_SPEED = 45;        // world px/sec — noticeably slower than the player's own walk (110), reads as an unhurried stroll
const NPC_ROAM_RADIUS = 130;      // world px — how far from its spawn point the NPC will wander
const NPC_TARGET_REACH_DIST = 4;  // world px — "close enough" to a target to pick a new one
const NPC_MAX_STUCK_SECONDS = 1;  // if genuinely blocked on both axes this long, give up on the current target and pick another rather than vibrating against an obstacle forever
const NPC_TARGET_PICK_ATTEMPTS = 12; // random tries to find an unblocked spot before just giving up for this frame

/* --- nightly "go home and sleep" schedule ---------------------------
   Per request ("kapag gabi na maglalakad papuntang tavern tapos nandun
   na siya sa interior nun papasok tapos matutulog dun sa bed mga 8pm
   start ng matulog siya"). Three states, tracked by `npc.scene` plus
   `npc.goingHome`:

     roaming/idle (scene "outside", goingHome false)
       -> at NPC_SLEEP_HOUR: goingHome = true, she walks to the tile
          just in FRONT of a placed tavern's front door
       -> on arrival: enterNpcHouse() — scene becomes "inside", she's
          no longer drawn outdoors at all
     inside (scene "inside")
       -> she walks to the Big Bed placed in that room, lies down
          (npc.sleeping, the bedBigSleep animation — drawNpcSleepingBed(),
          js/camera.js) and stays there
       -> at NPC_WAKE_HOUR: back outside, standing at that same door

   Everything here is a no-op if there's no tavern placed in the world
   yet (findNpcHomeDoor() returns null) — she just keeps her roam/idle
   behaviour, rather than the schedule silently breaking. Same for the
   bed: no Big Bed placed inside means she goes in and stands there
   instead of sleeping. */
const NPC_HOUSE_TYPE = "tavern";  // which building she calls home — per request; any other door is a fallback (findNpcHomeDoor())
const NPC_SLEEP_HOUR = 20;        // 8pm — she heads home at this hour
const NPC_WAKE_HOUR = SUNRISE_HOUR; // 6am — back out the door, same time the world gets light
const NPC_SLEEP_FPS = ANIM_FPS.sleep;   // reuse the player's own tuck-in speed
const NPC_DOOR_REACH_DIST = 10;   // world px — close enough to the door to count as arriving
const NPC_BED_REACH_DIST = 8;     // room px — close enough to the bed to lie down
// If she's genuinely wedged on something on the way home but is already
// this close, let her in anyway rather than leaving her stuck outside
// all night. Deliberately a short leash (3 tiles) so this can never read
// as her teleporting across the map.
const NPC_HOME_GIVEUP_SECONDS = 3;
const NPC_HOME_GIVEUP_DIST = TILE * 3;

/* --- pathfinding ----------------------------------------------------
   Per request ("dapat may path siya na di makakadaan sa collission na
   stock na"). The old movement was a straight line toward the target
   with a per-axis collision check — good enough to slide along a flat
   wall, but it has no idea what's on the other side of an obstacle, so
   anything shaped like a corner, a fence line, or a wall of trees
   between her and the house would pin her there until the stuck timer
   gave up. She now plans a real route around obstacles first (A* over
   the 16px tile grid) and walks it waypoint by waypoint.

   The straight-line step is still used to move BETWEEN waypoints, and
   still collision-checks every step — the path decides where to go, the
   step still refuses to walk through anything. Two layers, so a path
   that goes stale mid-walk (someone plants a tree across it) can't
   push her through a solid object; she just stops making progress,
   which trips the replan below. */
const NPC_PATH_REPLAN_SECONDS = 1.5; // re-plan this often while following a route, so newly-placed obstacles are noticed
const NPC_PATH_MAX_NODES = 6000;     // safety ceiling on A* expansion — a route longer than this isn't worth the frame time
const NPC_PATH_MARGIN_TILES = 20;    // how far outside the start/goal bounding box the search may wander to get around something

// Every tile that blocks movement right now, as a Set of "col,row".
// Built by walking the placed-item layers ONCE per plan (cheap — it's
// proportional to the number of placed items) rather than by calling
// isBodyBlockedAt() per tile, which would mean re-scanning every layer
// for each of the ~19,000 tiles on the map.
//
// Mirrors isBodyBlockedAt()'s two cases (js/player.js) so the planner
// and the actual movement agree on what's solid:
//   - ordinary colliders: their real footprint tiles
//     (getObjectFootprintBlockedTiles(), js/inventory.js)
//   - `wallColliderPx` houses: their pixel-accurate wall rectangle
//     (getHouseWallRect()), converted to tiles and inflated by the body's
//     half width, since a 12px-wide body can't squeeze into a tile whose
//     edge the wall pokes into
function buildNpcBlockedTiles() {
  const blocked = new Set();
  const layers = ALL_LAYERS;
  for (const layer of layers) {
    for (const [key, type] of layer) {
      const def = itemDefs[type];
      if (!def.collides) continue;
      const [col, row] = key.split(",").map(Number);

      if (def.wallColliderPx) {
        const w = getHouseWallRect(type, col, row);
        const c0 = Math.floor((w.minX - BODY_COLLISION_HALF_W) / TILE);
        const c1 = Math.floor((w.maxX + BODY_COLLISION_HALF_W - 1) / TILE);
        const r0 = Math.floor(w.minY / TILE);
        const r1 = Math.floor((w.maxY - 1) / TILE);
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) blocked.add(c + "," + r);
        }
        continue;
      }

      const tiles = getObjectFootprintBlockedTiles(type, col, row);
      for (let i = 0; i < tiles.length; i++) {
        blocked.add(tiles[i].col + "," + tiles[i].row);
      }
    }
  }
  return blocked;
}

// A* from one tile to another over that blocked set. 4-way only, no
// diagonals: a diagonal hop between two free tiles can still clip the
// corner of a solid one, and ruling it out is simpler (and safer for a
// body that's nearly a full tile wide) than writing the corner test.
//
// If the goal can't be reached at all, this returns a route to the
// CLOSEST tile it did manage to reach instead of nothing — she walks as
// far as she can and tries again on the next replan, rather than
// standing still because a route doesn't exist this instant.
// `isBlocked(col, row)` and `bounds` are passed in rather than baked in,
// so the same search serves both the outdoor map (a prebuilt Set of
// blocked tiles, clamped to COLS/ROWS) and the inside of a room, where
// "blocked" means the room's own walls and furniture and the grid is
// only a couple of dozen tiles across — see findNpcInteriorPath().
function findNpcTilePath(startCol, startRow, goalCol, goalRow, isBlocked, bounds) {
  if (startCol === goalCol && startRow === goalRow) return [];

  const minCol = bounds.minCol, maxCol = bounds.maxCol;
  const minRow = bounds.minRow, maxRow = bounds.maxRow;

  const heuristic = (c, r) => Math.abs(c - goalCol) + Math.abs(r - goalRow);
  const idOf = (c, r) => c + "," + r;

  // Binary min-heap keyed on f — a plain array with a linear scan for
  // the cheapest node degrades badly once the frontier is a few hundred
  // nodes wide, which is exactly what happens routing around a building.
  const heap = [];
  const heapPush = (node) => {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].f <= heap[i].f) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const heapPop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let small = i;
        if (l < heap.length && heap[l].f < heap[small].f) small = l;
        if (r < heap.length && heap[r].f < heap[small].f) small = r;
        if (small === i) break;
        [heap[small], heap[i]] = [heap[i], heap[small]];
        i = small;
      }
    }
    return top;
  };

  const cameFrom = new Map(); // "col,row" -> "col,row" it was reached from
  const gScore = new Map();
  const startId = idOf(startCol, startRow);
  gScore.set(startId, 0);
  heapPush({ c: startCol, r: startRow, f: heuristic(startCol, startRow) });

  let bestId = startId;
  let bestH = heuristic(startCol, startRow);
  let expanded = 0;
  let foundGoal = false;

  const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (heap.length && expanded < NPC_PATH_MAX_NODES) {
    const cur = heapPop();
    const curId = idOf(cur.c, cur.r);
    const curG = gScore.get(curId);
    if (curG === undefined || cur.f - heuristic(cur.c, cur.r) > curG) continue; // stale heap entry, already improved on
    expanded++;

    if (cur.c === goalCol && cur.r === goalRow) {
      bestId = curId;
      foundGoal = true;
      break;
    }

    const h = heuristic(cur.c, cur.r);
    if (h < bestH) {
      bestH = h;
      bestId = curId;
    }

    for (const [dc, dr] of NEIGHBORS) {
      const nc = cur.c + dc, nr = cur.r + dr;
      if (nc < minCol || nc > maxCol || nr < minRow || nr > maxRow) continue;
      const nid = idOf(nc, nr);
      // The goal tile is allowed even if it's flagged blocked — she
      // should still walk right up to a doorway rather than refusing to
      // plan at all, and the per-step collision check stops her at its
      // edge anyway.
      if (isBlocked(nc, nr) && !(nc === goalCol && nr === goalRow)) continue;
      const tentative = curG + 1;
      const known = gScore.get(nid);
      if (known !== undefined && known <= tentative) continue;
      gScore.set(nid, tentative);
      cameFrom.set(nid, curId);
      heapPush({ c: nc, r: nr, f: tentative + heuristic(nc, nr) });
    }
  }

  // Walk the parent chain back from wherever we ended up.
  const endId = foundGoal ? idOf(goalCol, goalRow) : bestId;
  if (endId === startId) return null; // couldn't get anywhere at all
  const tiles = [];
  let walk = endId;
  while (walk !== undefined && walk !== startId) {
    const [c, r] = walk.split(",").map(Number);
    tiles.push({ col: c, row: r });
    walk = cameFrom.get(walk);
  }
  tiles.reverse();
  return tiles;
}

// Drops the tiles in the middle of a straight run — with 4-way steps a
// path is mostly long horizontal/vertical stretches, and stopping to
// "arrive" at every single 16px tile along one makes her movement stutter
// at each boundary. Keeping only the corners lets her walk each leg in
// one smooth motion.
function simplifyNpcTilePath(tiles) {
  if (tiles.length <= 2) return tiles;
  const out = [tiles[0]];
  for (let i = 1; i < tiles.length - 1; i++) {
    const prev = tiles[i - 1], cur = tiles[i], next = tiles[i + 1];
    const turning = (cur.col - prev.col) !== (next.col - cur.col) ||
                    (cur.row - prev.row) !== (next.row - cur.row);
    if (turning) out.push(cur);
  }
  out.push(tiles[tiles.length - 1]);
  return out;
}

// Her feet are what collision is measured against, but npc.y tracks her
// CENTRE — these convert between the two (same relationship
// feetTileAt()/isBodyBlockedAt() use in js/player.js).
function npcFeetY() {
  return npc.y + (SPRITE_FEET_FRACTION - 0.5) * NPC_DRAW_SIZE;
}
function npcCentreYForFeetY(feetY) {
  return feetY - (SPRITE_FEET_FRACTION - 0.5) * NPC_DRAW_SIZE;
}

// Plans a route to a world point and stores it on the NPC as a list of
// waypoints in her own CENTRE coordinates, ready for followNpcPath().
// The caller's exact goal is appended as the final waypoint so she ends
// up precisely there rather than at the centre of the goal's tile.
// Returns false when no route exists at all.
function setNpcPathTo(goalX, goalY) {
  const blocked = buildNpcBlockedTiles();
  const startCol = Math.floor(npc.x / TILE);
  const startRow = Math.floor(npcFeetY() / TILE);
  const goalFeetY = goalY + (SPRITE_FEET_FRACTION - 0.5) * NPC_DRAW_SIZE;
  const goalCol = Math.floor(goalX / TILE);
  const goalRow = Math.floor(goalFeetY / TILE);

  const tiles = findNpcTilePath(startCol, startRow, goalCol, goalRow,
    (c, r) => blocked.has(c + "," + r),
    {
      // Keep the search near the two endpoints — without a bound, an
      // unreachable goal would expand across the entire map before failing.
      minCol: Math.max(0, Math.min(startCol, goalCol) - NPC_PATH_MARGIN_TILES),
      maxCol: Math.min(COLS - 1, Math.max(startCol, goalCol) + NPC_PATH_MARGIN_TILES),
      minRow: Math.max(0, Math.min(startRow, goalRow) - NPC_PATH_MARGIN_TILES),
      maxRow: Math.min(ROWS - 1, Math.max(startRow, goalRow) + NPC_PATH_MARGIN_TILES),
    });
  npc.pathReplanTimer = 0;
  npc.pathIndex = 0;

  if (tiles === null) {
    npc.path = null;
    return false;
  }

  const simplified = simplifyNpcTilePath(tiles);
  npc.path = simplified.map((t) => ({
    x: (t.col + 0.5) * TILE,
    y: npcCentreYForFeetY((t.row + 0.5) * TILE),
  }));
  // Replace the last tile-centre hop with the caller's real goal.
  if (npc.path.length) npc.path[npc.path.length - 1] = { x: goalX, y: goalY };
  else npc.path.push({ x: goalX, y: goalY });
  npc.pathGoalX = goalX;
  npc.pathGoalY = goalY;
  return true;
}

function clearNpcPath() {
  npc.path = null;
  npc.pathIndex = 0;
  npc.pathReplanTimer = 0;
}

// Walks one step along the stored route. Returns the same shape
// stepNpcToward() does, plus `done` once the final waypoint is reached,
// so callers can treat it like a smarter version of the same call.
function followNpcPath(dt) {
  if (!npc.path || npc.pathIndex >= npc.path.length) {
    return { done: true, moved: false, dist: 0 };
  }
  const wp = npc.path[npc.pathIndex];
  const step = stepNpcToward(wp.x, wp.y, dt);
  if (step.arrived) {
    npc.pathIndex++;
    if (npc.pathIndex >= npc.path.length) return { done: true, moved: true, dist: 0 };
  }
  return { done: false, moved: step.moved, dist: step.dist };
}

const npc = {
  // Placed a short distance from the player's spawn point (MAP_W/2,
  // MAP_H/2, see player.js) — move it by changing these two numbers.
  // Doubles as the center of its roam loop (see homeX/homeY below).
  x: MAP_W / 2 + 90,
  y: MAP_H / 2 + 115,
  homeX: MAP_W / 2 + 90, // roam anchor — pickNewNpcTarget() never wanders more than NPC_ROAM_RADIUS from here
  homeY: MAP_H / 2 + 115,
  targetX: null, // world px — where it's currently walking toward; null while idle
  targetY: null,
  stuckSeconds: 0, // how long it's been unable to make progress toward targetX/Y on either axis
  facing: "right", // "right" | "left"
  isWalking: false, // set each frame by updateNPC() from the in-game clock — read by drawNPC() to pick idle vs walk sheets
  frame: 0,
  frameTimer: 0,
  lastFacingSwitchAt: Date.now(), // wall-clock based, same convention as day/night and resource respawns — keeps "ticking" even if the tab isn't focused, rather than pausing

  // --- nightly sleep schedule (see the block comment above) ---
  scene: "outside",  // "outside" | "inside" — which coordinate space she's in, exactly the same idea as player.scene
  roomId: null,      // INTERIOR_ROOMS key she's inside, while scene === "inside"
  inX: 0, inY: 0,    // her position in that ROOM's own local coordinate space (kept apart from x/y so her outdoor spot survives the night untouched)
  goingHome: false,  // walking to the front door right now
  sleeping: false,   // lying in the bed, playing the bedBigSleep animation
  sleepFrame: 0,
  sleepFrameTimer: 0,
  sleepBedCol: 0, sleepBedRow: 0, // the Big Bed she picked, in room-local tiles
  homeGiveUpSeconds: 0, // how long she's been unable to make progress toward the door

  // --- pathfinding (see the block comment above) ---
  path: null,          // array of { x, y } waypoints in her own CENTRE coordinates, or null when walking without a plan
  pathIndex: 0,        // which waypoint she's currently heading for
  pathReplanTimer: 0,  // seconds since the route was last recomputed
  pathGoalX: 0, pathGoalY: 0, // what that route was planned toward — a changed goal forces a fresh plan

  // --- moving around inside a room (same idea as the outdoor path above,
  // but against the room's own walls/furniture — see npcWalkInsideTo()) ---
  inPath: null,        // waypoints in the room's local coordinates, or null
  inPathIndex: 0,
  inPathReplanTimer: 0,
  inStuckSeconds: 0,   // how long she's been unable to make progress indoors
  inGoalX: null, inGoalY: null, // what the indoor route was planned toward
  inPathFailed: false, // last indoor plan came back with no route — throttles the retry
  leaving: false,      // morning: walking to the exit mat to go back out through it
};

// True from NPC_WALK_START_HOUR up to (not including) NPC_WALK_END_HOUR
// — see the header comment above for why the fractional getGameHour()
// makes the "< 8" boundary work out to "up to 7:59:59".
function isNpcWalkingTime() {
  const h = getGameHour();
  return h >= NPC_WALK_START_HOUR && h < NPC_WALK_END_HOUR;
}

// Picks a new random point within NPC_ROAM_RADIUS of the NPC's home spot
// for it to walk toward next, retrying a handful of times if a candidate
// lands on a blocked tile (inside a tree, a stone, the house, ...) or
// off the edge of the map. If every attempt this call happens to land on
// something blocked, it just tries again next frame (targetX/Y stays
// whatever it was) rather than forcing a bad target through.
function pickNewNpcTarget() {
  for (let attempt = 0; attempt < NPC_TARGET_PICK_ATTEMPTS; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * NPC_ROAM_RADIUS;
    const candidateX = clamp(npc.homeX + Math.cos(angle) * dist, NPC_DRAW_SIZE / 2, MAP_W - NPC_DRAW_SIZE / 2);
    const candidateY = clamp(npc.homeY + Math.sin(angle) * dist, NPC_DRAW_SIZE / 2, MAP_H - NPC_DRAW_SIZE / 2);
    if (!isBodyBlockedAt(candidateX, candidateY)) { // js/player.js — same collision check the player's own movement uses
      npc.targetX = candidateX;
      npc.targetY = candidateY;
      return;
    }
  }
}

// One step toward an arbitrary world point at NPC_MOVE_SPEED, one axis
// at a time (same separate-axis approach updatePlayer() uses —
// js/player.js — so grazing the corner of an obstacle on one axis
// doesn't also stop progress on the other). Shared by the random roam
// below and the walk-home schedule further down, so both move and
// collide identically. Returns what happened, and leaves deciding what
// to do about it to the caller.
function stepNpcToward(targetX, targetY, dt) {
  const dx = targetX - npc.x;
  const dy = targetY - npc.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= NPC_TARGET_REACH_DIST) return { arrived: true, moved: false, dist };

  const vx = dx / dist, vy = dy / dist;
  const wantX = clamp(npc.x + vx * NPC_MOVE_SPEED * dt, NPC_DRAW_SIZE / 2, MAP_W - NPC_DRAW_SIZE / 2);
  const wantY = clamp(npc.y + vy * NPC_MOVE_SPEED * dt, NPC_DRAW_SIZE / 2, MAP_H - NPC_DRAW_SIZE / 2);

  let moved = false;
  if (!isBodyBlockedAt(wantX, npc.y)) {
    npc.x = wantX;
    moved = true;
  }
  if (!isBodyBlockedAt(npc.x, wantY)) { // uses the (possibly just-updated) npc.x
    npc.y = wantY;
    moved = true;
  }

  // No up/down NPC art — only ever flip facing off horizontal movement,
  // same convention the player's own diagonal movement uses (player.js).
  if (vx > 0.05) npc.facing = "right";
  else if (vx < -0.05) npc.facing = "left";

  return { arrived: false, moved, dist };
}

// Steps the NPC along a planned route toward npc.targetX/Y, picking a
// fresh random target once it arrives, or once it's been stuck making no
// progress at all for NPC_MAX_STUCK_SECONDS (e.g. its target ended up
// surrounded after something got placed near it mid-stroll).
function moveNpcTowardTarget(dt) {
  if (npc.targetX === null) {
    pickNewNpcTarget();
    return;
  }

  // (Re)plan whenever there's no route, the target moved, or the plan is
  // simply old enough that the world may have changed under it.
  npc.pathReplanTimer += dt;
  const goalChanged = npc.pathGoalX !== npc.targetX || npc.pathGoalY !== npc.targetY;
  if (!npc.path || goalChanged || npc.pathReplanTimer >= NPC_PATH_REPLAN_SECONDS) {
    if (!setNpcPathTo(npc.targetX, npc.targetY)) {
      pickNewNpcTarget(); // nowhere to go from here — try somewhere else
      return;
    }
  }

  const step = followNpcPath(dt);
  if (step.done) {
    clearNpcPath();
    pickNewNpcTarget();
    return;
  }

  if (step.moved) {
    npc.stuckSeconds = 0;
  } else {
    npc.stuckSeconds += dt;
    if (npc.stuckSeconds >= NPC_MAX_STUCK_SECONDS) {
      npc.stuckSeconds = 0;
      clearNpcPath();
      pickNewNpcTarget();
    }
  }
}

// Called every frame (main.js's loop) — advances whichever animation is
// currently active, actually walks it around during the morning window
// (moveNpcTowardTarget() above), and flips facing on its own timer while
// idle. No player-proximity gating: the NPC roams/idles and looks around
// whether or not anyone's nearby.
/* ---------------- nightly schedule: walk home, go in, sleep ---------------- */

// True from NPC_SLEEP_HOUR (8pm) round through midnight to
// NPC_WAKE_HOUR (6am) — the window she spends at home. Written as an OR
// rather than a range because it wraps past midnight.
function isNpcBedtime() {
  const h = getGameHour();
  return h >= NPC_SLEEP_HOUR || h < NPC_WAKE_HOUR;
}

// A door she can go home through, or null if the world has none yet.
// Per request ("yung npc dapat sa mga pinto lang siya dumadaan"), that
// means an actual door — never a wall, never a shortcut through a
// building's art. Two kinds count, exactly the two the player can use
// (checkInteriorEntry(), js/interior.js):
//   - a building with a door baked into its own art (house/2/3): its
//     `interior.doorOffset` tile, in objectLayer
//   - a standalone Door (A)/(B)/(C) placed as the front door of a
//     hand-built house: `interior.doorSpanCols`, in groundLayer
// Her own house (NPC_HOUSE_TYPE) wins if one is placed; otherwise she
// takes the first door of either kind, so she still has somewhere to
// sleep in a world built entirely out of hand-placed doors.
function findNpcHomeDoor() {
  let fallback = null;
  for (const [key, type] of objectLayer) {
    const def = itemDefs[type];
    if (!def.interior || def.interior.doorSpanCols) continue;
    const [col, row] = key.split(",").map(Number);
    const door = { type, def, col, row, span: false };
    if (type === NPC_HOUSE_TYPE) return door;
    if (!fallback) fallback = door;
  }
  for (const [key, type] of groundLayer) {
    const def = itemDefs[type];
    if (!def.interior || !def.interior.doorSpanCols) continue;
    const [col, row] = key.split(",").map(Number);
    if (!fallback) fallback = { type, def, col, row, span: true };
  }
  return fallback;
}

// Where she stands outside to go in. For a building door that's the tile
// directly in FRONT of (below) the door, because the door tile itself is
// solid (`wallColliderPx`, js/inventory.js) exactly as it is for the
// player. A standalone Door (A)/(B)/(C) is walkable up its centre column
// instead, so she aims at the tile just below it and walks up through it.
function npcDoorApproachSpot(door) {
  const ic = door.def.interior;
  const doorCol = door.span ? door.col : door.col + ic.doorOffset.col;
  const doorRow = door.span ? door.row : door.row + ic.doorOffset.row;
  return {
    x: (doorCol + 0.5) * TILE,
    // Solved backwards from "feet centred on the tile below the door" to
    // the CENTRE y the NPC is actually tracked by — same feetY math
    // isBodyBlockedAt() (js/player.js) uses.
    y: (doorRow + 1.5) * TILE - (SPRITE_FEET_FRACTION - 0.5) * NPC_DRAW_SIZE,
  };
}

// The Big Bed placed in a room, if any — where she'll actually sleep.
// Scans `room.decor` (js/interior.js), the same map the player's own
// indoor bed lookup uses.
function findNpcBedInRoom(room) {
  for (const [key, type] of room.decor) {
    if (type !== "bedBig") continue;
    const [col, row] = key.split(",").map(Number);
    return { col, row };
  }
  return null;
}

// Where she STANDS to get into that bed. Not the bed's own tile: a Big
// Bed is solid indoors (`collides` + `fixedFootprint`, js/inventory.js —
// isInteriorTileBlocked() counts it), so now that she respects the
// room's collision she can no more stand on it than the player can.
// Walking at the bed itself would just wedge her against its edge
// forever. So she walks to a free tile beside it and lies down from
// there, which is exactly how the player does it too (they FACE a bed to
// sleep — findNearbyBigBed(), js/resources.js).
//
// The front (below) is tried first since that's the side a bed is
// normally approached from, then the other three. Returns null if the
// bed has been walled in completely.
function npcBedApproachTile(room, bed) {
  const around = [
    { col: bed.col, row: bed.row + 1 },
    { col: bed.col - 1, row: bed.row },
    { col: bed.col + 1, row: bed.row },
    { col: bed.col, row: bed.row - 1 },
    { col: bed.col - 2, row: bed.row },
    { col: bed.col + 2, row: bed.row },
  ];
  for (const t of around) {
    if (t.col < 0 || t.row < 0) continue;
    if (!isNpcInteriorTileBlocked(room, t.col, t.row)) return t;
  }
  return null;
}

/* ---------------- moving around inside a room ----------------
   Per request ("dapat di siya makakatagos sa pader o may collisions sa
   room"). Indoors she respects exactly what the player does —
   isInteriorBodyBlockedAt() (js/interior.js), which covers the room's
   own wall rectangles, placed Collision Blocks, solid decor and the
   walkable centre column of an indoor door — and routes around it with
   the same A* the outdoor walk uses, just over the room's own small
   tile grid instead of the world map. */

// Is the tile at (col,row) somewhere she can stand in this room? Tested
// at the tile's centre through the player's own indoor collision check,
// so the two can never disagree about what counts as a wall.
function isNpcInteriorTileBlocked(room, col, row) {
  return isInteriorBodyBlockedAt(room, (col + 0.5) * TILE, centerYForFeetRow(row));
}

// A route through the room to a world point, as waypoints in her indoor
// coordinates, or null if there's no way through at all. Rooms are only
// a couple of dozen tiles across, so the whole grid is searched.
function findNpcInteriorPath(room, targetX, targetY) {
  const from = interiorFeetTileAt(npc.inX, npc.inY);
  const to = interiorFeetTileAt(targetX, targetY);
  const bounds = {
    minCol: 0, maxCol: Math.ceil(room.width / TILE) - 1,
    minRow: 0, maxRow: Math.ceil(room.height / TILE) - 1,
  };
  const tiles = findNpcTilePath(from.col, from.row, to.col, to.row,
    (c, r) => isNpcInteriorTileBlocked(room, c, r), bounds);
  if (tiles === null) return null;
  const path = simplifyNpcTilePath(tiles).map((t) => ({
    x: (t.col + 0.5) * TILE,
    y: centerYForFeetRow(t.row),
  }));
  if (path.length) path[path.length - 1] = { x: targetX, y: targetY };
  else path.push({ x: targetX, y: targetY });
  return path;
}

function clearNpcInsidePath() {
  npc.inPath = null;
  npc.inPathFailed = false;
  npc.inPathIndex = 0;
  npc.inPathReplanTimer = 0;
  npc.inStuckSeconds = 0;
  npc.inGoalX = null;
  npc.inGoalY = null;
}

// One step along her indoor route. Moves through sweepInteriorBodyTo() —
// the player's own indoor movement — so even a stale route can't push
// her through a wall; she just stops flush against it, which is what
// trips the replan below.
function stepNpcInside(room, dt) {
  if (!npc.inPath || npc.inPathIndex >= npc.inPath.length) return { done: true, moved: false };
  const wp = npc.inPath[npc.inPathIndex];
  const dx = wp.x - npc.inX, dy = wp.y - npc.inY;
  const dist = Math.hypot(dx, dy);
  if (dist <= NPC_TARGET_REACH_DIST) {
    npc.inPathIndex++;
    return { done: npc.inPathIndex >= npc.inPath.length, moved: false };
  }
  const stepLen = Math.min(dist, NPC_MOVE_SPEED * dt);
  const want = sweepInteriorBodyTo(room, npc.inX, npc.inY,
    npc.inX + (dx / dist) * stepLen, npc.inY + (dy / dist) * stepLen);
  const moved = Math.abs(want.x - npc.inX) > 0.01 || Math.abs(want.y - npc.inY) > 0.01;
  npc.inX = want.x;
  npc.inY = want.y;
  npc.isWalking = true;
  if (dx > 0.05) npc.facing = "right";
  else if (dx < -0.05) npc.facing = "left";
  return { done: false, moved };
}

// Walk her toward a world point in the room, planning (and re-planning)
// a route around whatever's in the way. Returns "arrived" | "walking" |
// "unreachable".
function npcWalkInsideTo(room, targetX, targetY, dt) {
  if (Math.hypot(targetX - npc.inX, targetY - npc.inY) <= NPC_BED_REACH_DIST) return "arrived";

  npc.inPathReplanTimer += dt;
  const goalMoved = npc.inGoalX !== targetX || npc.inGoalY !== targetY;
  // `inPathFailed` keeps a hopeless goal from re-running the search every
  // single frame: once a plan comes back empty, the next attempt waits
  // out the normal replan interval like any other. Without it, a bed
  // that's genuinely walled off would run a full room-wide A* 60 times a
  // second for as long as she stayed inside.
  const needPlan = (!npc.inPath && !npc.inPathFailed)
    || goalMoved
    || npc.inPathReplanTimer >= NPC_PATH_REPLAN_SECONDS;
  if (needPlan) {
    npc.inPath = findNpcInteriorPath(room, targetX, targetY);
    npc.inPathFailed = !npc.inPath;
    npc.inPathIndex = 0;
    npc.inPathReplanTimer = 0;
    npc.inGoalX = targetX;
    npc.inGoalY = targetY;
  }
  if (!npc.inPath) return "unreachable";

  const step = stepNpcInside(room, dt);
  if (step.done) {
    npc.inPath = null;
    return Math.hypot(targetX - npc.inX, targetY - npc.inY) <= NPC_BED_REACH_DIST
      ? "arrived" : "unreachable";
  }
  if (step.moved) {
    npc.inStuckSeconds = 0;
  } else {
    npc.inStuckSeconds += dt;
    if (npc.inStuckSeconds >= NPC_MAX_STUCK_SECONDS) {
      npc.inStuckSeconds = 0;
      npc.inPath = null; // wedged — force a fresh route next frame
    }
  }
  return "walking";
}

// The room's indoor door (INTERIOR_ROOMS' `indoorWarp`) — the same
// passage the player steps through with "up"/"down"
// (checkIndoorWarpDoor(), js/interior.js). Per request ("kapag nasa room
// na is dun parin sa door a,b or c dapat na detect niya same lang dun sa
// character") she uses it for the same reason the player does: when
// where she's going is walled off from where she is, that door is the
// way through. `dir` is "forward" or "return".
function npcWarpPortal(room, dir) {
  const w = room.indoorWarp;
  if (!w) return null;
  const portal = dir === "forward" ? w.forwardPortal : w.returnPortal;
  if (!portal || !portal.length) return null;
  return centerOfTiles(portal);
}

// Steps her through that door, landing on its matching spawn side.
function npcTakeWarp(room, dir) {
  const w = room.indoorWarp;
  const spawn = dir === "forward" ? w.forwardSpawn : w.returnSpawn;
  if (!spawn || !spawn.length) return;
  const c = centerOfTiles(spawn);
  npc.inX = c.x;
  npc.inY = c.y;
  clearNpcInsidePath();
}

// Walk to a point in the room, going through the room's indoor door if
// the point turns out to be walled off from her. Returns true once she's
// there.
function npcWalkInsideVia(room, targetX, targetY, dt, warpDir) {
  const r = npcWalkInsideTo(room, targetX, targetY, dt);
  if (r === "arrived") return true;
  if (r !== "unreachable") return false;

  // Can't get there directly — head for the door instead.
  const portal = npcWarpPortal(room, warpDir);
  if (!portal) {
    npc.isWalking = false; // nowhere to go and no door to take; just stand
    return false;
  }
  if (npcWalkInsideTo(room, portal.x, portal.y, dt) === "arrived") npcTakeWarp(room, warpDir);
  return false;
}

// Steps through the front door: she stops being an outdoor character
// entirely (renderWorldObjectsSorted() skips her, js/camera.js) and
// starts existing in that building's OWN room instead. The room id is
// per-building (js/interior.js's interiorRoomId()) — the same one the
// player gets walking through that same door — so she sleeps in the
// actual house she went into, not a layout shared by every house of
// that kind.
function enterNpcHouse(door) {
  const roomId = interiorRoomId(door.def.interior.roomId, door.col, door.row);
  const room = getOrCreateInteriorRoom(roomId);
  if (!room) return; // no art wired up for that room id — stay outside rather than vanish into nothing

  npc.scene = "inside";
  npc.roomId = roomId;
  // Same spawn rule enterInterior() uses for the player: a standalone
  // door can name its own arrival tile, otherwise it's the room's own
  // entrance.
  const ic = door.def.interior;
  if (ic.spawnCol !== undefined && ic.spawnRow !== undefined) {
    npc.inX = ic.spawnCol * TILE + TILE / 2;
    npc.inY = ic.spawnRow * TILE + TILE / 2;
  } else {
    npc.inX = room.spawnX;
    npc.inY = room.spawnY;
  }
  npc.goingHome = false;
  npc.homeGiveUpSeconds = 0;
  npc.sleeping = false;
  npc.sleepFrame = 0;
  npc.sleepFrameTimer = 0;
  npc.leaving = false;
  clearNpcPath();       // the outdoor route is meaningless in here
  clearNpcInsidePath();
  // Shopping with someone who's just walked into her house and shut the
  // door behind her doesn't make sense — close the panel if it happened
  // to be open when she got home.
  closeNpcShop();
}

// Back out through a door. If every door has since been removed she
// falls back to her roam anchor rather than being stranded in a room
// nobody can reach her in.
function exitNpcHouse() {
  const door = findNpcHomeDoor();
  if (door) {
    const spot = npcDoorApproachSpot(door);
    npc.x = spot.x;
    npc.y = spot.y;
  } else {
    npc.x = npc.homeX;
    npc.y = npc.homeY;
  }
  npc.scene = "outside";
  npc.roomId = null;
  npc.sleeping = false;
  npc.sleepFrame = 0;
  npc.sleepFrameTimer = 0;
  npc.goingHome = false;
  npc.leaving = false;
  npc.targetX = null; // pick a fresh roam target rather than resuming last night's
  npc.stuckSeconds = 0;
  clearNpcPath();
  clearNpcInsidePath();
}

// Her whole indoor life: cross the room to the bed, lie down, stay there
// until morning, then walk back out through the exit mat. Every step of
// it respects the room's walls and furniture, and falls back to the
// room's indoor door when the bed (or the way out) is walled off.
function updateNpcInside(dt) {
  const room = INTERIOR_ROOMS[npc.roomId];
  if (!room) {
    exitNpcHouse(); // room disappeared out from under her — bail out safely
    return;
  }

  // Morning: get up and walk to the exit mat, rather than blinking out
  // of the room from wherever she happened to be lying.
  if (!isNpcBedtime()) {
    npc.sleeping = false;
    npc.leaving = true;
  }

  if (npc.leaving) {
    const z = room.exitZone;
    // Aim at a point the movement clamp can actually reach — the mat's
    // own top edge, not its middle, for the same reason the player's
    // exit zone starts well above the mat (see INTERIOR_ROOMS).
    if (npcWalkInsideVia(room, (z.minX + z.maxX) / 2, z.minY + 4, dt, "return")) {
      exitNpcHouse();
    }
    return;
  }

  if (npc.sleeping) {
    // Play the tuck-in animation once, then HOLD on its last frame for
    // the rest of the night — same "freeze at the end" idea the player's
    // own sleep uses, minus the fade (nothing is transitioning here, she
    // just stays asleep).
    const lastFrame = FRAME_COUNTS.sleep - 1;
    if (npc.sleepFrame < lastFrame) {
      npc.sleepFrameTimer += dt;
      if (npc.sleepFrameTimer >= 1 / NPC_SLEEP_FPS) {
        npc.sleepFrameTimer = 0;
        npc.sleepFrame++;
      }
    }
    return;
  }

  const bed = findNpcBedInRoom(room);
  if (!bed) {
    npc.isWalking = false; // no bed placed in there — she just stands around inside for the night
    clearNpcInsidePath();
    return;
  }

  const stand = npcBedApproachTile(room, bed);
  if (!stand) {
    npc.isWalking = false; // bed is walled in — nothing sensible to do but stand
    clearNpcInsidePath();
    return;
  }

  if (npcWalkInsideVia(room, (stand.col + 0.5) * TILE, centerYForFeetRow(stand.row), dt, "forward")) {
    npc.sleeping = true;
    npc.isWalking = false;
    npc.sleepBedCol = bed.col;
    npc.sleepBedRow = bed.row;
    npc.sleepFrame = 0;
    npc.sleepFrameTimer = 0;
    clearNpcInsidePath();
  }
}

// Heading for the front door. Returns true once she's inside (or has
// given up on the whole idea), so updateNPC() knows to stop here.
function updateNpcGoingHome(dt) {
  const door = findNpcHomeDoor();
  if (!door) {
    // No door anywhere in the world — nothing to walk to. Fall back to
    // the ordinary idle behaviour instead of standing frozen all night.
    npc.goingHome = false;
    clearNpcPath();
    return false;
  }

  const spot = npcDoorApproachSpot(door);
  npc.isWalking = true;

  // Plan (or re-plan) a route around whatever's between her and the
  // door. Unlike roaming there's no alternative destination to fall back
  // on, so a failed plan just means trying again next frame — she'll
  // still be here, and the world might have changed by then.
  npc.pathReplanTimer += dt;
  const goalChanged = npc.pathGoalX !== spot.x || npc.pathGoalY !== spot.y;
  if (!npc.path || goalChanged || npc.pathReplanTimer >= NPC_PATH_REPLAN_SECONDS) {
    setNpcPathTo(spot.x, spot.y);
  }

  const straightDist = Math.hypot(spot.x - npc.x, spot.y - npc.y);
  if (straightDist <= NPC_DOOR_REACH_DIST) {
    enterNpcHouse(door);
    return true;
  }

  const step = npc.path
    ? followNpcPath(dt)
    : { done: false, moved: stepNpcToward(spot.x, spot.y, dt).moved, dist: straightDist };

  if (step.done) {
    // Reached the end of the route — either she's at the door, or the
    // route only got her as close as it could (findNpcTilePath() returns
    // a best-effort path when the goal is unreachable). Go in if she's
    // actually there; otherwise drop the plan so the next frame builds a
    // fresh one from where she now stands.
    clearNpcPath();
    if (straightDist <= NPC_DOOR_REACH_DIST) {
      enterNpcHouse(door);
      return true;
    }
  }

  // Wedged on something the plan didn't know about — let her in if she's
  // basically at the door already, otherwise drop the route so the next
  // replan goes around whatever just appeared. The short distance leash
  // is what stops "give up" from turning into walking through a wall.
  if (step.moved) {
    npc.homeGiveUpSeconds = 0;
  } else {
    npc.homeGiveUpSeconds += dt;
    if (npc.homeGiveUpSeconds >= NPC_HOME_GIVEUP_SECONDS) {
      if (straightDist <= NPC_HOME_GIVEUP_DIST) {
        enterNpcHouse(door);
        return true;
      }
      npc.homeGiveUpSeconds = 0;
      clearNpcPath();
    }
  }
  return false;
}

// Called every frame (main.js's loop) — advances whichever animation is
// currently active, actually walks it around during the morning window
// (moveNpcTowardTarget() above), runs the nightly go-home-and-sleep
// schedule, and flips facing on its own timer while idle. No
// player-proximity gating: she roams, walks home and sleeps whether or
// not anyone's nearby or even in the same scene.
function updateNPC(dt) {
  // Indoors for the night — her own separate update path, which also
  // handles coming back out in the morning.
  if (npc.scene === "inside") {
    updateNpcInside(dt);
    advanceNpcAnimFrame(dt);
    return;
  }

  // Bedtime: drop whatever she was doing and head for the door.
  if (isNpcBedtime()) {
    if (!npc.goingHome) {
      npc.goingHome = true;
      npc.homeGiveUpSeconds = 0;
      npc.targetX = null; // abandon the current roam target
      clearNpcPath();     // ...and the route that went with it
    }
    if (updateNpcGoingHome(dt)) return; // went inside this frame
    advanceNpcAnimFrame(dt);
    return;
  }

  npc.goingHome = false;

  const walking = isNpcWalkingTime();
  if (walking !== npc.isWalking) {
    // Just switched animations — reset so the frame index never carries
    // over from one animation's length into the other's.
    npc.isWalking = walking;
    npc.frame = 0;
    npc.frameTimer = 0;
    if (walking) {
      npc.targetX = null; // force a fresh target now that the walking window has started
      npc.stuckSeconds = 0;
    }
  }

  if (walking) moveNpcTowardTarget(dt);

  advanceNpcAnimFrame(dt);

  // Idle facing-flip timer only matters while actually idle — while
  // walking, facing is driven by movement direction instead (see
  // moveNpcTowardTarget()), so there's nothing for this timer to do.
  if (!walking && Date.now() - npc.lastFacingSwitchAt >= NPC_FACING_SWITCH_MS) {
    npc.lastFacingSwitchAt = Date.now();
    npc.facing = npc.facing === "right" ? "left" : "right";
  }
}

// Ticks the idle/walk sprite animation, whichever is showing. Pulled out
// of updateNPC() so all three of its paths (roaming, walking home, and
// indoors) share exactly one copy rather than repeating it.
function advanceNpcAnimFrame(dt) {
  const frameCount = npc.isWalking ? NPC_WALK_FRAME_COUNT : NPC_IDLE_FRAME_COUNT;
  const fps = npc.isWalking ? NPC_WALK_FPS : NPC_IDLE_FPS;
  // The walk sheet has 6 frames and the idle sheet only 4, and several
  // paths through updateNPC() flip `isWalking` directly without resetting
  // the counter (going home, arriving indoors) — so clamp first, or a
  // frame index left over from the longer sheet would slice past the end
  // of the shorter one for a frame and draw nothing.
  if (npc.frame >= frameCount) npc.frame = 0;
  npc.frameTimer += dt;
  if (npc.frameTimer >= 1 / fps) {
    npc.frameTimer = 0;
    npc.frame = (npc.frame + 1) % frameCount;
  }
}

// Whether Maria is currently asleep in the given room — read by
// renderInteriorScene() (js/camera.js) to hide that bed's normal art
// while her sleep animation is drawn over it.
function isNpcSleepingInRoom(roomId) {
  return npc.scene === "inside" && npc.sleeping && npc.roomId === roomId;
}

// Whether a WORLD-space point (screenToWorld(), inventory.js) is close
// enough to the NPC's center to count as clicking them — a simple
// circular hit-test rather than an exact sprite-bounds one, generous
// enough to click comfortably without needing pixel precision. Always
// false while she's indoors for the night: her x/y is a stale outdoor
// position then, so without this a click on empty grass where she used
// to stand would still open the shop.
function isPointOnNPC(worldX, worldY) {
  if (npc.scene !== "outside") return false;
  const dx = worldX - npc.x;
  const dy = worldY - npc.y;
  return dx * dx + dy * dy <= NPC_CLICK_RADIUS * NPC_CLICK_RADIUS;
}

/* ---------------- shop stock (prices decided here, per request "ikaw na bahala sa price") ---------------- */

const NPC_SHOP_STOCK = [
  { type: "woodSword", price: 15 },
  { type: "woodDagger", price: 10 },
  { type: "woodAxe", price: 20 },
  { type: "woodPickaxe", price: 18 },
  { type: "woodBow", price: 30 },
  { type: "woodShieldSmall", price: 12 },
  { type: "woodLog", price: 3 },
  { type: "stoneChunk", price: 3 },
];

/* ---------------- shop UI ---------------- */

const npcShopOverlayEl = document.getElementById("npc-shop-overlay");
const npcShopGridEl = document.getElementById("npc-shop-grid");
const npcShopGoldAmountEl = document.getElementById("npc-shop-gold-amount");
const goldHudAmountEl = document.getElementById("gold-hud-amount");
// Her name now lives ONLY here, in the shop popup's heading — per
// request ("alisin mo na yung label sa ulo niya na maria tapos stay mo
// lang name niya dun sa pop up na Maria"). Written from NPC_NAME rather
// than left as static markup so the constant stays the single place the
// name is defined.
const npcShopNameEl = document.getElementById("npc-shop-title-name");
if (npcShopNameEl) npcShopNameEl.textContent = NPC_NAME;

// Keeps the top-left gold HUD and (if open) the shop panel's own gold
// readout in sync — called after every purchase, and once at startup.
function renderGoldDisplays() {
  if (goldHudAmountEl) goldHudAmountEl.textContent = player.gold;
  if (npcShopGoldAmountEl) npcShopGoldAmountEl.textContent = player.gold;
}

// Rebuilds the shop's item grid from NPC_SHOP_STOCK. Called each time the
// shop opens (not continuously) — the stock list is static, and gold
// changes are handled by renderGoldDisplays()/re-rendering the buy
// buttons' disabled state after each purchase instead of a full rebuild.
function renderNpcShopGrid() {
  npcShopGridEl.innerHTML = "";
  NPC_SHOP_STOCK.forEach(({ type, price }) => {
    const def = itemDefs[type];
    if (!def) return; // defensive — skip silently if a type ever gets renamed/removed later

    const row = document.createElement("div");
    row.className = "npc-shop-row";

    const icon = document.createElement("img");
    icon.src = def.icon.src;
    icon.alt = def.name;
    icon.className = "npc-shop-icon";
    row.appendChild(icon);

    const name = document.createElement("span");
    name.className = "npc-shop-name";
    name.textContent = def.name;
    row.appendChild(name);

    const priceEl = document.createElement("span");
    priceEl.className = "npc-shop-price";
    priceEl.textContent = `${price} 💰`;
    row.appendChild(priceEl);

    const buyBtn = document.createElement("button");
    buyBtn.className = "npc-shop-buy";
    buyBtn.textContent = "Buy";
    buyBtn.disabled = player.gold < price;
    buyBtn.addEventListener("click", () => buyFromNpc(type, price));
    row.appendChild(buyBtn);

    npcShopGridEl.appendChild(row);
  });
}

// Spends `price` gold and grants 1 of `type` to the inventory
// (grantItem(), resources.js — the same "add to an existing slot by
// type" function harvesting drops already use). Re-renders the grid
// afterward so every Buy button's disabled state reflects the new gold
// total immediately (buying one thing can price you out of another).
function buyFromNpc(type, price) {
  if (player.gold < price) return; // shouldn't happen (button's disabled), but never trust just the UI
  player.gold -= price;
  grantItem(type, 1);
  renderGoldDisplays();
  renderNpcShopGrid();
  saveGame();
}

function openNpcShop() {
  renderNpcShopGrid();
  renderGoldDisplays();
  npcShopOverlayEl.classList.remove("hidden");
}

function closeNpcShop() {
  npcShopOverlayEl.classList.add("hidden");
}

// Click-outside-to-close, same convention every other popup in this
// project uses (the item action menu, the weapon picker).
npcShopOverlayEl.addEventListener("click", (e) => {
  if (e.target === npcShopOverlayEl) closeNpcShop();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeNpcShop();
});

// Called once from main.js's start(), after the canvas exists — wires up
// left-click-the-NPC-to-shop. A separate listener from
// js/inventory.js's setupPlacementClickHandler() (rather than folding
// this into that one) since the two react to opposite conditions —
// empty-handed here, holding-something there — and keeping them apart
// keeps each file's click behavior self-contained.
function setupNpcClickHandler() {
  view.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // left button only
    if (heldItem || player.grabbedType) return; // hands full — a click places/grabs instead, see inventory.js
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    if (isPointOnNPC(x, y)) openNpcShop();
  });
}
