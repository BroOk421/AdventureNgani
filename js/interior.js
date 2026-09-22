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
     only while `scene === "outside"`): either
       (a) a multiTileFootprint item with an `interior` config (house2/
           house3) has exactly one of its otherwise-solid footprint
           tiles carved out as a walkable door — see `interior.
           doorOffset` on those itemDefs entries and its use in
           getObjectFootprintBlockedTiles() (inventory.js), or
       (b) a standalone door item (Door (A)/(B)/(C) — plain `flat` decor
           placed on its own, e.g. as the front door of a hand-built
           house) with `interior.doorSpanCols` — walkable across that
           many tiles in a row, no footprint carve-out needed since it
           was never solid to begin with, and can define its own
           `spawnCol`/`spawnRow` distinct from the room's main entrance.
     Either way, stepping onto the door tile(s) while pressing "up"
     triggers entry — see checkInteriorEntry()'s `vy` guard below.
   - Exiting (checked every frame in updatePlayerInsideInterior() below):
     walking onto the room's `exitZone` rectangle (the doormat drawn at
     the bottom of the art) while pressing "down" triggers it.
   - `player.outsideReturn` remembers exactly where the player was
     standing outside, so exiting doesn't strand them somewhere new.
   - Movement inside is otherwise still simple for this first pass: a
     flat rectangle clamp to the room's bounds, no automatic per-
     furniture collision from the art itself (walking through a table/
     chair drawn in the room is still possible) — the one exception is
     the Collision Block item (itemDefs, `interiorOnly: true`): held and
     placed the same way as any outdoor item, it drops a manually-placed
     16x16 blocker into the room's own `collisions` map (see further
     down this file), which movement DOES respect. Real per-furniture
     collision (fixedFootprint-style rects per piece, matching the art
     automatically) can still be added later, independent of this.
================================================================= */

const INTERIOR_ROOMS = {
  sharedHouse: {
    image: assets.interiorHouse,
    width: 416,
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
    // "col,row" (16x16 TILE grid, same math as the outdoor tileKey()) ->
    // item type — every Collision Block (js/inventory.js's itemDefs)
    // manually placed inside this room, blocking movement. Populated by
    // placeInteriorCollisionAt() below, drawn by camera.js's
    // renderInteriorScene(), and saved/restored by js/save.js exactly
    // like the outdoor layers.
    collisions: new Map(),
    // A SEPARATE "col,row" -> item type map for ordinary decor placed
    // indoors (doors, picture frames, windows, furniture — any regular
    // itemDefs entry, not just Collision Block) — see
    // placeInteriorDecorAt() below. Deliberately its OWN map, not
    // `collisions`: per request ("kagaya ng grass na pwede mapatungan...
    // pero yung collision block is di ka makadaan pero pwede malagyan ng
    // object na pang wall"), a tile can hold BOTH a Collision Block
    // (invisible, blocks movement) AND a decor item (visual only, drawn
    // on top) at once, the same way outdoor terrain/decor layers stack
    // independently — placing into one never checks or touches the
    // other.
    decor: new Map(),
    // Indoor warp door (the "going further into the room" passage) —
    // per request ("tanggalin mo muna yung portal at spawn i list ko
    // muna gamit yung col at row"): plain explicit tile coordinates
    // instead of a formula derived from wherever a decor door happens to
    // be placed. Each is an array of `{ col, row }` tiles (room-local,
    // same 16px TILE grid as everything else here):
    //   - `forwardPortal` — standing on any of these while pressing "up"
    //     triggers the forward warp.
    //   - `forwardSpawn` — where the player lands after it (the AVERAGE
    //     of every tile listed here, if more than one).
    //   - `returnPortal` — standing on any of these while pressing
    //     "down" triggers the return warp.
    //   - `returnSpawn` — where the player lands after that.
    // All four start EMPTY (warp disabled, nothing triggers) until
    // filled in with real coordinates — see checkIndoorWarpDoor() below.
    // Filled in per request: forwardPortal (19,15) -> forwardSpawn
    // (19,10); returnPortal (19,11) -> returnSpawn (19,17).
    indoorWarp: {
      forwardPortal: [{ col: 19, row: 15 }],
      forwardSpawn: [{ col: 19, row: 10 }],
      returnPortal: [{ col: 19, row: 11 }],
      returnSpawn: [{ col: 19, row: 17 }],
    },
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
// for one the player is currently pressed up against at its door —
// called every frame from updatePlayer() (player.js) while outside. At
// most one match makes sense at a time (doors don't overlap), so the
// first hit wins.
//
// wallColliderPx houses (house2/house3): the door tile is solid now,
// same as the rest of the wall (see isBlockedByHouseWalls(), inventory.
// js) — "kahit lagyan na lang din ng collisions [yung pinto]... tapos
// makakapasok parin... kasi sa loob e". Since the feet can never
// actually land ON that tile anymore, entry is detected by CONTACT
// instead: isTouchingHouseDoor() (inventory.js) is true the instant the
// player is stopped flush against the door's spot, sharing the exact
// same wall rect the collision itself uses, so touching the door is
// always exactly "the door", not a few px off in either direction.
// Anything without `wallColliderPx` (a future non-pixel-wall house)
// falls back to the older exact-tile check.
function checkInteriorEntry(vy) {
  if (sceneFade) return; // already mid-transition — don't retrigger
  // Only pressing "up" (W / ArrowUp) at the door should walk you in —
  // being pushed/slid into the same spot while holding A/D/S (sliding
  // along the wall, or backing into it) must NOT trigger entry. Per
  // request: "pumapasok kahit left at right at down... dapat pa up lang
  // 'w' sa mismong pinto".
  if (vy >= 0) return;
  const p = getPlayerTile();
  const feetY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  for (const [key, type] of objectLayer) {
    const def = itemDefs[type];
    if (!def.interior || def.interior.doorSpanCols) continue; // standalone span-doors (Door A/B/C) are handled below
    const [placedCol, placedRow] = key.split(",").map(Number);
    if (def.wallColliderPx) {
      if (isTouchingHouseDoor(type, placedCol, placedRow, player.x, feetY)) {
        beginSceneFade(() => enterInterior(type));
        return;
      }
      continue;
    }
    const doorCol = placedCol + def.interior.doorOffset.col;
    const doorRow = placedRow + def.interior.doorOffset.row;
    if (doorCol === p.col && doorRow === p.row) {
      beginSceneFade(() => enterInterior(type));
      return;
    }
  }

  // Standalone door items (Door (A)/(B)/(C) — itemDefs' plain `flat`
  // decor, hand-placed as the front door of a custom-built house rather
  // than baked into a multiTileFootprint building's own art) with an
  // `interior.doorSpanCols` config. A real 3x3 door with a WALKABLE
  // center column (see itemDefs' comment on doorPlain3 and
  // getObjectFootprintBlockedTiles()'s span-door branch, inventory.js —
  // only the two side columns are solid) — entry triggers once the
  // player's feet have walked far enough up through that center column
  // to reach (or pass) its middle tile, while pressing "up". Matches
  // request: "kapag nadikit sa yung head sa gitna ng 3x3 pinaka middle
  // is tyaka magtrigger".
  for (const [key, type] of groundLayer) {
    const def = itemDefs[type];
    if (!def.interior || !def.interior.doorSpanCols) continue;
    const [placedCol, placedRow] = key.split(",").map(Number);
    const rows = def.interior.doorSpanRows || 1;
    const centerRow = placedRow - Math.floor((rows - 1) / 2); // middle row of the footprint
    const topRow = placedRow - (rows - 1);
    if (p.col !== placedCol) continue; // the walkable center column
    if (p.row > centerRow || p.row < topRow) continue; // reached (or passed) the middle, but not beyond the top of the door
    beginSceneFade(() => enterInterior(type));
    return;
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
  // A standalone door item (doorSpanCols — Door (A)/(B)/(C), see
  // itemDefs) can define its OWN spawn spot, distinct from the room's
  // default house2/house3 entry point (room.spawnX/spawnY) — per
  // request, Door (C) drops the player at a specific room-local tile
  // (spawnCol/spawnRow) instead.
  if (def.interior.spawnCol !== undefined && def.interior.spawnRow !== undefined) {
    player.x = def.interior.spawnCol * TILE + TILE / 2;
    player.y = def.interior.spawnRow * TILE + TILE / 2;
  } else {
    player.x = room.spawnX;
    player.y = room.spawnY;
  }
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

  // A grabbed Collision Block (`interiorOnly`, see itemDefs) means
  // nothing outside — the outdoor E-grab/place system (inventory.js's
  // tryGrabOrPlaceInFront()) knows nothing about `room.collisions` —
  // so never let it leave the room still in hand: drop it back at the
  // player's current spot if that tile's free, or failing that stash it
  // into the inventory, rather than silently deleting it.
  if (player.grabbedType && itemDefs[player.grabbedType].interiorOnly) {
    const room = INTERIOR_ROOMS[player.activeRoomId];
    const here = interiorFeetTileAt(player.x, player.y);
    const key = tileKey(here.col, here.row);
    if (room && !room.collisions.has(key)) {
      room.collisions.set(key, player.grabbedType);
    } else {
      grantItem(player.grabbedType, 1);
    }
    player.grabbedType = null;
    player.mode = "normal";
  }

  player.x = player.outsideReturn.x;
  player.y = player.outsideReturn.y;
  player.scene = "outside";
  player.activeInteriorType = null;
  player.activeRoomId = null;
  player.outsideReturn = null;
  player.anim = "idle";
  player.frame = 0;
  player.frameTimer = 0;
  // A Collision Block (interiorOnly, see itemDefs) means nothing outside
  // — its own placement function already refuses to run there — but
  // drop it here too, same as enterInterior() does, so the held-item HUD
  // doesn't keep showing it once there's nothing sensible left to do
  // with it.
  if (heldItem) cancelHeldItem();
  saveGame();
}

/* ---------------- interior collision (Collision Block, itemDefs) ----------------
   A minimal, room-local counterpart to player.js's outdoor
   isTileBlocked()/isBodyBlockedAt()/sweepBodyTo() — same feet-based tile
   check and same binary-search "stop flush against it" sweep, just
   against a room's own `collisions` map (col,row on the 16px TILE grid,
   in the room's local coordinate space) instead of the outdoor
   terrain/ground/decor/object layers. */

function isInteriorTileBlocked(room, col, row) {
  if (room.collisions.has(tileKey(col, row))) return true;
  // A `decor` item with a 3x3 door footprint (`interior.doorSpanCols`)
  // is SOLID across its two SIDE columns only — the CENTER column stays
  // walkable, a real doorway to walk through (same "3x3, only the
  // middle is open" shape as the outdoor version — see
  // getObjectFootprintBlockedTiles()'s span-door branch, inventory.js —
  // even though ordinary decor is otherwise purely visual, room.decor's
  // header comment above). Scans `decor` rather than a direct key
  // lookup since the door's anchor key alone doesn't cover its other
  // tiles.
  for (const [key, type] of room.decor) {
    const def = itemDefs[type];
    if (!def.interior || !def.interior.doorSpanCols) continue;
    const [placedCol, placedRow] = key.split(",").map(Number);
    const cols = def.interior.doorSpanCols || 1;
    const rows = def.interior.doorSpanRows || 1;
    const halfCols = Math.floor(cols / 2);
    const topRow = placedRow - (rows - 1);
    if (row < topRow || row > placedRow) continue; // outside the door's row band
    if (col === placedCol) continue; // the center column — walkable
    if (col < placedCol - halfCols || col >= placedCol - halfCols + cols) continue; // outside the door's column band
    return true;
  }
  // The Big Bed (and any other `collides` + `fixedFootprint` decor item)
  // is a deliberate EXCEPTION to "indoor decor is purely visual" above —
  // per request, it should block movement across its own real 3x3
  // footprint indoors too, same as it already does outdoors
  // (isTileBlocked(), js/player.js), not just sit there walkable like
  // ordinary furniture. Reuses the same footprint math outdoor collision
  // uses (getObjectFootprintBlockedTiles(), js/inventory.js) so the two
  // never drift apart.
  for (const [key, type] of room.decor) {
    const def = itemDefs[type];
    if (!def.collides || !def.fixedFootprint) continue;
    const [placedCol, placedRow] = key.split(",").map(Number);
    const tiles = getObjectFootprintBlockedTiles(type, placedCol, placedRow);
    if (tiles.some((t) => t.col === col && t.row === row)) return true;
  }
  return false;
}

function interiorFeetTileAt(x, y) {
  const feetY = y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  return { col: Math.floor(x / TILE), row: Math.floor(feetY / TILE) };
}

function isInteriorBodyBlockedAt(room, x, y) {
  const t = interiorFeetTileAt(x, y);
  return isInteriorTileBlocked(room, t.col, t.row);
}

function sweepInteriorBodyTo(room, x0, y0, x1, y1) {
  if (!isInteriorBodyBlockedAt(room, x1, y1)) return { x: x1, y: y1 };
  let lo = 0, hi = 1;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    if (isInteriorBodyBlockedAt(room, x0 + (x1 - x0) * mid, y0 + (y1 - y0) * mid)) hi = mid;
    else lo = mid;
  }
  return { x: x0 + (x1 - x0) * lo, y: y0 + (y1 - y0) * lo };
}

// Placement counterpart to inventory.js's placeHeldItemAt() for
// `interiorOnly` items (right now, only the Collision Block) — called
// from there instead of the outdoor layer logic whenever the held
// item's def has that flag set. Same shape as the outdoor function
// (range check, "not under your own feet", "already occupied" block,
// then hand off to commitPlacementUse() for the shared
// decrement/hotbar-sync/save/render tail), just against `room.collisions`
// rather than an outdoor layer, and gated on actually being inside.
function placeInteriorCollisionAt(col, row) {
  if (!heldItem) return;
  if (player.scene !== "inside") return;
  if (!itemDefs[heldItem.type].interiorOnly) return;
  const room = INTERIOR_ROOMS[player.activeRoomId];
  if (!room) return;
  if (col < 0 || row < 0 || col * TILE >= room.width || row * TILE >= room.height) return;

  const p = interiorFeetTileAt(player.x, player.y);
  if (Math.max(Math.abs(col - p.col), Math.abs(row - p.row)) > PLACEMENT_RANGE) return;
  if (col === p.col && row === p.row) return; // don't trap yourself under your own feet

  const key = tileKey(col, row);
  if (room.collisions.has(key)) return; // one block per tile

  room.collisions.set(key, heldItem.type);
  commitPlacementUse(heldItem.fromSlot);
}

// General-purpose placement for ordinary items (doors, picture frames,
// windows, furniture — anything from itemDefs that ISN'T the
// `interiorOnly` Collision Block) while inside a room — into the room's
// OWN `decor` map, completely separate from `collisions` (see the
// header comment on `decor`, above). Visual only: unlike a Collision
// Block, a decor item placed here never blocks movement on its own —
// if the spot should also be solid, place a Collision Block there too
// (either order works, since the two maps never check each other).
function placeInteriorDecorAt(col, row) {
  if (!heldItem) return;
  if (player.scene !== "inside") return;
  const def = itemDefs[heldItem.type];
  if (def.interiorOnly) return; // Collision Block goes through placeInteriorCollisionAt() instead
  if (def.multiTileFootprint) return; // a whole house/building makes no sense inside a room
  const room = INTERIOR_ROOMS[player.activeRoomId];
  if (!room) return;
  if (col < 0 || row < 0 || col * TILE >= room.width || row * TILE >= room.height) return;

  const p = interiorFeetTileAt(player.x, player.y);
  if (Math.max(Math.abs(col - p.col), Math.abs(row - p.row)) > PLACEMENT_RANGE) return;

  const key = tileKey(col, row);
  if (room.decor.has(key)) return; // one decor item per tile — same "already occupied" rule the outdoor layers use

  room.decor.set(key, heldItem.type);
  commitPlacementUse(heldItem.fromSlot);
}

/* ---------------- E-key grab/place + T-key throw (any indoor item) ----------------
   A room-local counterpart to inventory.js's outdoor E-key mechanic
   (tryGrabOrPlaceInFront()/tryThrowGrabbedItem()) — per request ("yung
   sa collision block is dapat pwede rin ma-E na, na-hold at unhold or
   throw", later extended: "pwede rin ERT apply mo sa lahat ng doors"):
   ANYTHING already placed indoors — the Collision Block (`room.
   collisions`) or ordinary decor like doors/frames/windows (`room.
   decor`) — can be picked back up, carried, placed somewhere else, or
   thrown away, the same way an outdoor object can. Reuses
   `player.grabbedType`/`player.mode` (already scene-agnostic and
   already saved — see player.js) rather than a separate field, so
   drawPlayer()'s "carrying" pose and tryKeepGrabbedItem() ("R" — stash
   to inventory) work here completely unchanged. Resolves the instant
   E/T is pressed — no wind-up "collect" animation like outdoors, since
   this scene's movement has no animation-lock state machine to hook
   into (updatePlayerInsideInterior() is plain immediate movement, see
   above). */

// Same shape as inventory.js's getTileInFrontOfPlayer(), just built on
// interiorFeetTileAt() (room-local) instead of getPlayerTile() (outdoor).
function getInteriorTileInFrontOfPlayer() {
  const p = interiorFeetTileAt(player.x, player.y);
  switch (player.facing) {
    case "up": return { col: p.col, row: p.row - 1 };
    case "down": return { col: p.col, row: p.row + 1 };
    case "left": return { col: p.col - 1, row: p.row };
    case "right": return { col: p.col + 1, row: p.row };
    default: return p;
  }
}

// Called from player.js whenever E is pressed while `scene === "inside"`.
// Handles BOTH of the room's own layers — `collisions` (the Collision
// Block) AND `decor` (every ordinary item placed indoors: doors,
// picture frames, windows, furniture) — per request ("pwede rin ERT
// apply mo sa lahat ng doors"): grabbing/placing now works the same way
// for any of them, not just the Collision Block.
function tryGrabOrPlaceIndoorItemInFront() {
  if (player.scene !== "inside") return;
  const room = INTERIOR_ROOMS[player.activeRoomId];
  if (!room) return;

  if (player.grabbedType) {
    const type = player.grabbedType;
    // Same "collides -> tile in front, else your own tile" rule the
    // outdoor E-mechanic uses (tryGrabOrPlaceInFront(), inventory.js):
    // the Collision Block always collides, so it goes in front; an
    // ordinary decor item is walkable, so it goes on the tile the
    // player is actually standing on.
    const isCollisionItem = !!itemDefs[type].interiorOnly;
    const targetMap = isCollisionItem ? room.collisions : room.decor;
    const target = isCollisionItem
      ? getInteriorTileInFrontOfPlayer()
      : interiorFeetTileAt(player.x, player.y);
    if (target.col < 0 || target.row < 0 || target.col * TILE >= room.width || target.row * TILE >= room.height) return;
    const key = tileKey(target.col, target.row);
    if (targetMap.has(key)) return; // occupied — stays in hand
    targetMap.set(key, type);
    player.grabbedType = null;
    player.mode = "normal";
    saveGame();
    return;
  }

  // Nothing in hand yet — look for something grabbable, same "most on
  // top first" priority the outdoor version uses (decorLayer before the
  // rest): `decor` (visual furniture/doors/etc, sitting AT the player's
  // own tile since it's walkable) is checked before `collisions` (which
  // only ever matters on the tile in front, since it's solid) — each
  // checked "here" first, then "front", same defensive fallback as
  // before.
  const front = getInteriorTileInFrontOfPlayer();
  const here = interiorFeetTileAt(player.x, player.y);
  const hereKey = tileKey(here.col, here.row);
  const frontKey = tileKey(front.col, front.row);

  let foundKey = null, foundMap = null;
  if (room.decor.has(hereKey)) { foundKey = hereKey; foundMap = room.decor; }
  else if (room.decor.has(frontKey)) { foundKey = frontKey; foundMap = room.decor; }
  else if (room.collisions.has(hereKey)) { foundKey = hereKey; foundMap = room.collisions; }
  else if (room.collisions.has(frontKey)) { foundKey = frontKey; foundMap = room.collisions; }
  if (!foundKey) return; // nothing grabbable on either tile, on either layer

  const type = foundMap.get(foundKey);
  foundMap.delete(foundKey);
  player.grabbedType = type;
  player.mode = "carrying";
  saveGame();
}

// Called from player.js whenever T is pressed while `scene === "inside"`
// with something grabbed. Same "toss out 2 tiles, then it's just gone"
// behavior as the outdoor tryThrowGrabbedItem() (inventory.js) — nothing
// is written back into either `room.collisions` or `room.decor` for a
// thrown item, only the cosmetic arc (spawnThrowToss(), resources.js —
// scene-agnostic already; drawThrownTosses(), camera.js's
// renderInteriorScene() draws it here too). Works for anything grabbed,
// Collision Block or ordinary decor alike — no branching needed here.
function tryThrowGrabbedInteriorItem() {
  if (!player.grabbedType) return;
  if (player.scene !== "inside") return;
  const room = INTERIOR_ROOMS[player.activeRoomId];
  if (!room) return;

  const p = interiorFeetTileAt(player.x, player.y);
  let target;
  switch (player.facing) {
    case "up": target = { col: p.col, row: p.row - 2 }; break;
    case "down": target = { col: p.col, row: p.row + 2 }; break;
    case "left": target = { col: p.col - 2, row: p.row }; break;
    case "right": target = { col: p.col + 2, row: p.row }; break;
    default: target = p;
  }
  if (target.col < 0 || target.row < 0 || target.col * TILE >= room.width || target.row * TILE >= room.height) return; // nowhere to throw it — stays in hand

  spawnThrowToss(player.grabbedType, player.x, player.y, target.col, target.row);
  player.grabbedType = null;
  player.mode = "normal";
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

  // A warp-door hold in progress (checkIndoorWarpDoor(), below) freezes
  // movement entirely for its whole INDOOR_WARP_WAIT_MS wait — "mag
  // stop" per request, not just until the next frame — same idea as
  // `sceneFade` freezing updatePlayer() outdoors. Still ticks the timer
  // (and still animates idle) every frame while frozen.
  if (indoorWarpPending) {
    if (player.anim !== "idle") { player.anim = "idle"; player.frame = 0; player.frameTimer = 0; }
    checkIndoorWarpDoor(room, vy);
    return;
  }

  if (moving) {
    const len = Math.hypot(vx, vy) || 1;
    vx /= len; vy /= len;
    const wantX = clamp(player.x + vx * player.speed * dt, DRAW_SIZE / 2, room.width - DRAW_SIZE / 2);
    const wantY = clamp(player.y + vy * player.speed * dt, DRAW_SIZE / 2, room.height - DRAW_SIZE / 2);

    // Same separate-axis collision + "already overlapping -> let them
    // walk free" escape hatch as the outdoor movement block (player.js),
    // just against this room's own `collisions` map (Collision Blocks —
    // see above) instead of the outdoor layers.
    if (isInteriorBodyBlockedAt(room, player.x, player.y)) {
      player.x = wantX;
      player.y = wantY;
    } else {
      player.x = sweepInteriorBodyTo(room, player.x, player.y, wantX, player.y).x;
      player.y = sweepInteriorBodyTo(room, player.x, player.y, player.x, wantY).y;
    }
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
  // Only pressing "down" (S / ArrowDown) onto the doormat should walk
  // you back outside — same reasoning, and same `vy` sign check, as
  // checkInteriorEntry()'s "up"-only guard for walking IN. Per request:
  // "yung sa main door... papalabas is dapat press 's'... di 'a' or 'd'
  // or 'w'".
  if (
    vy > 0 &&
    player.x >= z.minX && player.x <= z.maxX && player.y >= z.minY && player.y <= z.maxY
  ) {
    beginSceneFade(() => exitInterior());
  }

  checkIndoorWarpDoor(room, vy); // a warp-door decor item (e.g. Door (C) placed indoors) — may just have arrived at its trigger tile this frame
}

/* ---------------- indoor warp door ----------------
   Per request ("pag nalagay ko na sana yung door is... papasok mapunta
   siya dun sa taas... 5 tile... dapat may animation na fade in at fade
   out, di agad mapupunta, wait 2 sec bago mapunta pag press 'w' pataas
   mag stop tapos fade after 2 sec mapunta sa taas... simula sa tile ng
   character", later simplified to explicit coordinates instead of a
   formula: "tanggalin mo muna yung portal at spawn i list ko muna gamit
   yung col at row na lang na coordinate"): walking "up" onto any tile in
   `room.indoorWarp.forwardPortal` stops the player there
   (isInteriorTileBlocked() above still handles making a decor door
   actually solid, independent of this), holds for INDOOR_WARP_WAIT_MS,
   fades, then relocates them to `forwardSpawn`. Walking "down" onto any
   tile in `returnPortal` does the same in reverse, landing at
   `returnSpawn`. All four are plain, hand-set tile lists (see
   INTERIOR_ROOMS.sharedHouse.indoorWarp above) — nothing triggers until
   they're filled in. Stays WITHIN the same room (no scene change, unlike
   the outdoor Door (C) entrance above). */

const INDOOR_WARP_WAIT_MS = 1000; // "wait 1 sec" before the fade starts

// The pending timer for a warp currently counting down (or null) —
// { apply, startAt }, where `apply` is what actually moves the player,
// run once INDOOR_WARP_WAIT_MS has elapsed. Movement is frozen entirely
// while this is set (see updatePlayerInsideInterior() above) — "mag
// stop" for the whole INDOOR_WARP_WAIT_MS hold, not just until the next frame.
let indoorWarpPending = null;

// player.y is the sprite's CENTER, but every row elsewhere in this file
// is a FEET-tile row (interiorFeetTileAt()) — centering player.y
// directly on a row would land the FEET (offset below center by
// SPRITE_FEET_FRACTION) in the row AFTER it. This converts "the row I
// want the FEET in" to the matching center-Y.
function centerYForFeetRow(row) {
  return row * TILE + TILE / 2 - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
}

// The average col/row of a tile list — used as the single landing spot
// when a spawn "area" has more than one tile listed.
function centerOfTiles(tiles) {
  const sum = tiles.reduce((a, t) => ({ col: a.col + t.col, row: a.row + t.row }), { col: 0, row: 0 });
  return { col: sum.col / tiles.length, row: sum.row / tiles.length };
}

function checkIndoorWarpDoor(room, vy) {
  // Already counting down — just watch the clock; the freeze in
  // updatePlayerInsideInterior() means nothing about position can have
  // changed in the meantime, so there's nothing else to re-check.
  if (indoorWarpPending) {
    if (Date.now() - indoorWarpPending.startAt < INDOOR_WARP_WAIT_MS) return;
    const apply = indoorWarpPending.apply;
    indoorWarpPending = null;
    beginSceneFade(apply);
    return;
  }

  if (sceneFade) return; // already mid-transition — don't start a new one
  if (vy === 0) return; // only matters while actively pressing up or down

  const warp = room.indoorWarp;
  if (!warp) return;

  const p = interiorFeetTileAt(player.x, player.y);
  const isOnAny = (tiles) => tiles.some((t) => t.col === p.col && t.row === p.row);

  // FORWARD — standing on a forwardPortal tile, walking up.
  if (vy < 0 && warp.forwardPortal.length && warp.forwardSpawn.length && isOnAny(warp.forwardPortal)) {
    const dest = centerOfTiles(warp.forwardSpawn);
    indoorWarpPending = {
      startAt: Date.now(),
      apply: () => {
        player.x = dest.col * TILE + TILE / 2;
        player.y = clamp(centerYForFeetRow(dest.row), DRAW_SIZE / 2, room.height - DRAW_SIZE / 2);
        player.anim = "idle";
        player.frame = 0;
        player.frameTimer = 0;
        saveGame();
      },
    };
    return;
  }

  // RETURN — standing on a returnPortal tile, walking back down.
  if (vy > 0 && warp.returnPortal.length && warp.returnSpawn.length && isOnAny(warp.returnPortal)) {
    const dest = centerOfTiles(warp.returnSpawn);
    indoorWarpPending = {
      startAt: Date.now(),
      apply: () => {
        player.x = dest.col * TILE + TILE / 2;
        player.y = clamp(centerYForFeetRow(dest.row), DRAW_SIZE / 2, room.height - DRAW_SIZE / 2);
        player.facing = "down";
        player.anim = "idle";
        player.frame = 0;
        player.frameTimer = 0;
        saveGame();
      },
    };
    return;
  }
}
