"use strict";

/* =================================================================
   INTERIOR SCENES — walking onto a house's front-door tile takes the
   player inside a separate, self-contained room scene instead of the
   open world; walking back onto the door mat there takes them back out
   exactly where they left off. Per request ("yung mismong sa loob ng
   interior folder... interior.ase... try mo apply yun para makapasok sa
   loob ng house2 at house3").

   - `INTERIOR_ROOMS` — one entry per distinct room layout. Only one
     exists right now ("sharedHouse", exported from
     assets/interior/asesprite/interior.ase — the single interior design
     currently drawn there), used by BOTH house2 and house3 (there's only
     one room layout in that file to draw from; see the itemDefs
     `interior` field below for how a SECOND, different layout would be
     wired to one of them once it exists — just a new INTERIOR_ROOMS
     entry and a different `roomId` on that house's itemDefs entry, no
     other code changes needed).
   - A room is its own small, fixed-size coordinate space (the exported
     image's pixel dimensions) — completely separate from the outdoor
     MAP_W/MAP_H tile grid. `player.x`/`player.y` are reused for the
     player's position inside it too (simplest — every other system that
     reads player.x/y, like the shadow and the sprite draw, keeps working
     unmodified), they just mean something different while
     `player.scene === "inside"`.
   - Entering (checkInteriorEntry(), called from updatePlayer() below
     only while `scene === "outside"`): a multiTileFootprint item with an
     `interior` config (house2/house3) has exactly one of its otherwise-
     solid footprint tiles carved out as a walkable door — see
     `interior.doorOffset` on those itemDefs entries and its use in
     getObjectFootprintBlockedTiles() (inventory.js). Stepping onto that
     tile triggers entry.
   - Exiting (checked every frame in updatePlayerInsideInterior() below):
     walking onto the room's `exitZone` rectangle (the doormat drawn at
     the bottom of the art) triggers it.
   - `player.outsideReturn` remembers exactly where the player was
     standing outside, so exiting doesn't strand them somewhere new.
   - Movement inside is deliberately simple for this first pass: a flat
     rectangle clamp to the room's bounds, no per-furniture collision
     (walking through a table/chair is possible for now) — the room is
     small and static, so this isn't the priority; furniture collision
     can be added later the same way outdoor objects get it
     (fixedFootprint-style rects per piece), independent of everything
     else here.
================================================================= */

const INTERIOR_ROOMS = {
  sharedHouse: {
    image: assets.interiorHouse,
    width: 410,
    height: 500,
    // Just inside the door, a clear step above the exit zone below (see
    // exitZone) so walking in doesn't immediately re-trigger walking
    // back out — facing further into the room.
    spawnX: 192,
    spawnY: 440,
    // The doormat at the bottom of the art (measured from the exported
    // PNG: a green rug at roughly x 177-207, y 484-497) — walking down
    // onto this rectangle exits back outside. minY is pulled in from the
    // mat's true y (484) to 460: movement clamps the player's CENTER to
    // `height - DRAW_SIZE/2` = 476 (can't get closer than 24px from the
    // bottom edge), so a minY at or past that would be geometrically
    // unreachable — 460 leaves a walkable band the player can actually
    // enter (their FEET, drawn below center, reach visibly onto the mat
    // itself even though their tracked center point doesn't quite).
    exitZone: { minX: 160, maxX: 224, minY: 460, maxY: 500 },
  },
};

/* ---------------- scene transition: fade to black, switch, fade in ----------------
   Per request ("kapag pumasok sa loob may fade to black tapos pa fade in
   sa room"). A single shared state machine used for BOTH entering and
   exiting — `onMidpoint` is whatever actually needs to happen while the
   screen is fully black (enterInterior()/exitInterior()), so the
   position swap and scene switch are never visible mid-fade. */
const SCENE_FADE_MS = 350; // each half (out, then in) — ~0.7s total
let sceneFade = null; // { phase: "out" | "in", startAt, onMidpoint } | null

// Starts a fade-out -> (run onMidpoint) -> fade-in sequence. A no-op if
// one's already running, so a stray extra trigger (e.g. two frames in a
// row before movement freezes — see the `player.scene` guard in
// updatePlayer(), player.js) can't stack or restart it.
function beginSceneFade(onMidpoint) {
  if (sceneFade) return;
  sceneFade = { phase: "out", startAt: Date.now(), onMidpoint };
}

// Called every frame (main.js's loop), before updatePlayer() — advances
// the fade and, at the exact midpoint (screen fully black), performs the
// actual scene switch.
function updateSceneFade() {
  if (!sceneFade) return;
  const elapsed = Date.now() - sceneFade.startAt;
  if (elapsed < SCENE_FADE_MS) return;
  if (sceneFade.phase === "out") {
    sceneFade.onMidpoint();
    sceneFade.phase = "in";
    sceneFade.startAt = Date.now();
  } else {
    sceneFade = null; // fade-in finished — back to normal
  }
}

// 0 (fully visible) .. 1 (fully black) — read by camera.js's
// drawSceneFadeOverlay(), drawn on top of whichever scene (outdoor or
// interior) just rendered.
function getSceneFadeAlpha() {
  if (!sceneFade) return 0;
  const t = Math.min(1, (Date.now() - sceneFade.startAt) / SCENE_FADE_MS);
  return sceneFade.phase === "out" ? t : 1 - t;
}

// Scans every placed multiTileFootprint item with an `interior` config
// for one whose door tile is the player's CURRENT tile — called every
// frame from updatePlayer() (player.js) while outside. At most one match
// makes sense at a time (doors don't overlap), so the first hit wins.
function checkInteriorEntry() {
  if (sceneFade) return; // already mid-transition — don't retrigger
  const p = getPlayerTile();
  for (const [key, type] of objectLayer) {
    const def = itemDefs[type];
    if (!def.interior) continue;
    const [placedCol, placedRow] = key.split(",").map(Number);
    const doorCol = placedCol + def.interior.doorOffset.col;
    const doorRow = placedRow + def.interior.doorOffset.row;
    if (doorCol === p.col && doorRow === p.row) {
      beginSceneFade(() => enterInterior(type));
      return;
    }
  }
}

function enterInterior(type) {
  const def = itemDefs[type];
  const room = INTERIOR_ROOMS[def.interior.roomId];
  if (!room) return; // no art wired up for this room id yet — stay outside rather than break

  player.outsideReturn = { x: player.x, y: player.y };
  player.scene = "inside";
  player.activeInteriorType = type;
  player.activeRoomId = def.interior.roomId;
  player.x = room.spawnX;
  player.y = room.spawnY;
  player.facing = "up"; // facing further into the room, away from the door
  player.anim = "idle";
  player.frame = 0;
  player.frameTimer = 0;

  // Holding/grabbing/equipping don't carry any special meaning indoors
  // yet (no placement grid, no harvestable objects in here) — closing
  // the held-item HUD avoids a stale "Holding: X" banner sitting over a
  // scene where clicking it wouldn't do anything sensible.
  if (heldItem) cancelHeldItem();

  saveGame();
}

function exitInterior() {
  if (!player.outsideReturn) return;
  player.x = player.outsideReturn.x;
  player.y = player.outsideReturn.y;
  player.scene = "outside";
  player.activeInteriorType = null;
  player.activeRoomId = null;
  player.outsideReturn = null;
  player.anim = "idle";
  player.frame = 0;
  player.frameTimer = 0;
  saveGame();
}

// The interior equivalent of updatePlayer()'s movement block — plain
// rectangle-clamped movement within the room, no run/stamina (keeping a
// small indoor room simple), then a check for stepping onto the exit
// mat. Called instead of the normal outdoor update whenever
// `player.scene === "inside"` (see the branch at the top of
// updatePlayer(), player.js).
function updatePlayerInsideInterior(dt) {
  const room = INTERIOR_ROOMS[player.activeRoomId];
  if (!room) { exitInterior(); return; } // shouldn't happen, but never strand the player in a room that doesn't exist

  let vx = 0, vy = 0;
  if (keys["w"] || keys["arrowup"]) vy -= 1;
  if (keys["s"] || keys["arrowdown"]) vy += 1;
  if (keys["a"] || keys["arrowleft"]) vx -= 1;
  if (keys["d"] || keys["arrowright"]) vx += 1;
  const moving = vx !== 0 || vy !== 0;

  if (moving) {
    const len = Math.hypot(vx, vy) || 1;
    vx /= len; vy /= len;
    player.x = clamp(player.x + vx * player.speed * dt, DRAW_SIZE / 2, room.width - DRAW_SIZE / 2);
    player.y = clamp(player.y + vy * player.speed * dt, DRAW_SIZE / 2, room.height - DRAW_SIZE / 2);
    player.facing = vx !== 0 ? (vx > 0 ? "right" : "left") : (vy > 0 ? "down" : "up");
  }

  const nextAnim = moving ? "walk" : "idle";
  if (nextAnim !== player.anim) {
    player.anim = nextAnim;
    player.frame = 0;
    player.frameTimer = 0;
  }
  const fps = ANIM_FPS[player.anim];
  const frameCount = FRAME_COUNTS[player.anim];
  player.frameTimer += dt;
  if (player.frameTimer >= 1 / fps) {
    player.frameTimer = 0;
    player.frame = (player.frame + 1) % frameCount;
  }

  const z = room.exitZone;
  if (player.x >= z.minX && player.x <= z.maxX && player.y >= z.minY && player.y <= z.maxY) {
    beginSceneFade(() => exitInterior());
  }
}
