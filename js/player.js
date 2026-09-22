"use strict";

/* =================================================================
   PLAYER — position, facing, animation state (idle/walk/run),
   carry mode (normal/carrying — now driven by the E-key grab/place
   mechanic, see tryGrabOrPlaceInFront() in inventory.js), and the
   one-shot collect/put-down action, plus the per-frame update logic.
================================================================= */
const player = {
  x: MAP_W / 2,
  y: MAP_H / 2,
  speed: 110,     // world px / second (walking)
  runMult: 1.8,   // multiplier applied to speed while running
  facing: "down", // "down" | "up" | "left" | "right"
  anim: "idle",   // "idle" | "walk" | "run" — the underlying movement anim,
                  // kept up to date even while carrying (mode picks the sheet)
  mode: "normal", // "normal" | "carrying" — now driven by whether `grabbedType` is set (see below), not a bare toggle
  action: null,   // null | "collect" | "crush" | "slice" | "hit" | "pierce" — a one-shot animation that locks movement
  harvestTarget: null,  // { col, row, type } while action is an attack — which tile the hit resolves against (if any)
  equippedWeapon: null, // null | an itemDefs type with equipSlot === "weapon" (see equipWeapon(), inventory.js)
  grabbedType: null, // null | an itemDefs type — the world object (wild grass/flower/stone/tree) currently held via the E-key grab/place mechanic (tryGrabOrPlaceInFront(), inventory.js). Distinct from `heldItem` (the inventory-based hold-to-place system) — this one is pulled directly OUT of the world, not out of a slot, so unlike heldItem it IS saved (save.js) — losing track of it on reload would silently delete whatever was grabbed, since it's already removed from the world the moment it's picked up.
  // --- sleeping in a Big Bed (js/resources.js's trySleepInBed()/updateSleeping()) ---
  sleeping: false,       // true for the whole 20-frame sleep animation, freezing movement (same idea as sceneFade) until it hands off to the fade+wake-up
  sleepFrame: 0,
  sleepFrameTimer: 0,
  sleepFadeStarted: false, // true once the frame reaches SLEEP_FADE_START_FRAME and beginSceneFade() has fired (js/resources.js's updateSleeping()) — frozen on that frame, still drawn as "lying in bed" through the whole fade-out/black/fade-in, not switched back to the normal standing sprite until the fade fully finishes
  sleepBedCol: 0, sleepBedRow: 0, // the specific placed bed's own anchor tile (findNearbyBigBed(), js/resources.js) — used to draw the sleep animation AT the bed instead of at the player, and to hide that one bed's normal art while it plays (see camera.js)
  // --- interior scenes (js/interior.js) ---
  scene: "outside", // "outside" | "inside" — which coordinate space x/y are currently in
  activeInteriorType: null, // itemDefs type (e.g. "house2") of the interior currently inside, or null while outside
  activeRoomId: null, // INTERIOR_ROOMS key (e.g. "sharedHouse") the above type's `interior.roomId` resolved to — what rendering/collision actually look the room up by
  outsideReturn: null, // { x, y } saved the moment they entered — restored on exit so they come back exactly where they left off
  gold: 100, // currency, spent at the NPC shop (js/npc.js) — starts with a small amount so there's something to shop with right away
  frame: 0,
  frameTimer: 0,

  // --- stats (new HUD, see js/hud.js) ---
  health: 100, maxHealth: 100,   // no damage source exists yet — stays full until something adds one
  stamina: 100, maxStamina: 100, // drains while running, regenerates otherwise — see updatePlayer() below
  staminaExhausted: false, // latched true once stamina hits 0 while sprinting, cleared once it regens back to STAMINA_RUN_RECOVER_PCT of max (config.js) — see the run/walk flicker fix in updatePlayer() below. Transient (not saved) on purpose: worst case after a reload is just reaching empty again before it can re-arm, no real downside.
  food: 100, maxFood: 100,       // slowly depletes over real time (updateFood(), js/hud.js) — no way to eat/refill yet, a foundation for later
  exp: 0, maxExp: 100,           // no way to gain yet — a foundation for a future leveling system
  playTimeSeconds: 0             // accumulates every frame (dt) — the HUD's "Duration" readout; saved, so it's total time across sessions, not just this one
};

// One-shot action sheets that ignore carry mode (down/up/side only) — see
// spriteForFacing() below. "collect" toggles carry mode when it finishes;
// "crush"/"slice" are the harvest-hit animations (F key, js/resources.js).
// death/fishing/hit/pierce/watering are here too (loaded, playable) even
// though nothing triggers them yet — see config.js's FRAME_COUNTS comment.
const ONE_SHOT_ACTION_SHEETS = {
  collect: { down: "collectDown", up: "collectUp", side: "collectSide" },
  crush: { down: "crushDown", up: "crushUp", side: "crushSide" },
  slice: { down: "sliceDown", up: "sliceUp", side: "sliceSide" },
  death: { down: "deathDown", up: "deathUp", side: "deathSide" },
  fishing: { down: "fishingDown", up: "fishingUp", side: "fishingSide" },
  hit: { down: "hitDown", up: "hitUp", side: "hitSide" },
  pierce: { down: "pierceDown", up: "pierceUp", side: "pierceSide" },
  watering: { down: "wateringDown", up: "wateringUp", side: "wateringSide" },
};

// Which image to use for a given animation + facing + carry mode.
// "left" reuses the *Side sheets and gets flipped horizontally at draw time
// (in camera.js) instead of needing separate left-facing art.
function spriteForFacing(anim, facing, mode) {
  // one-shot action animations ignore carry mode — same motion either way
  const oneShot = ONE_SHOT_ACTION_SHEETS[anim];
  if (oneShot) {
    if (facing === "down") return assets[oneShot.down];
    if (facing === "up") return assets[oneShot.up];
    return assets[oneShot.side];
  }

  const carrying = mode === "carrying";

  if (facing === "down") {
    if (anim === "idle") return carrying ? assets.carryIdleDown : assets.idleDown;
    if (anim === "run") return carrying ? assets.carryRunDown : assets.runDown;
    return carrying ? assets.carryWalkDown : assets.walkDown;
  }
  if (facing === "up") {
    if (anim === "idle") return carrying ? assets.carryIdleUp : assets.idleUp;
    if (anim === "run") return carrying ? assets.carryRunUp : assets.runUp;
    return carrying ? assets.carryWalkUp : assets.walkUp;
  }
  // "left" or "right" both use the side sheet; left is flipped when drawn
  if (anim === "idle") return carrying ? assets.carryIdleSide : assets.idleSide;
  if (anim === "run") return carrying ? assets.carryRunSide : assets.runSide;
  return carrying ? assets.carryWalkSide : assets.walkSide;
}

// --- Collision -----------------------------------------------------
// Which tile the character's FEET are standing on for a given (x, y) —
// same math as getPlayerTile() in js/inventory.js, duplicated here (rather
// than calling that function) so player.js doesn't depend on inventory.js
// for its own movement logic, and so it can be evaluated for a candidate
// position, not just the player's current one.
function feetTileAt(x, y) {
  const feetWorldY = y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  return { col: Math.floor(x / TILE), row: Math.floor(feetWorldY / TILE) };
}

// Whether a tile blocks movement. Checks every colliding item across ALL
// FOUR layers (terrainLayer/groundLayer/decorLayer/objectLayer — see
// js/inventory.js) against its actual blocked footprint
// (getObjectFootprintBlockedTiles() — 1 tile by default, or a multi-tile
// shape with excluded back rows for the house), not just an exact
// placement-tile match — a multi-tile item can block a tile some
// distance from where it was actually placed. Most flat ground-layer
// tiles never block movement (no `collides` flag at all), but some now
// do — the Port tileset, specifically — so this checks every layer
// rather than assuming only objectLayer items can ever collide.
// The NPC shopkeeper (js/npc.js) does NOT add its own collision here on
// purpose (per request) — the player can walk right through it. This
// same function IS what the NPC's own roaming movement (updateNPC(),
// js/npc.js) checks before taking a step, though, so while the NPC
// itself isn't a solid obstacle, it still can't walk through anything
// that actually collides (trees, stones, the house, etc.).
// `skipWallColliders`: leave out `wallColliderPx` items (house2/house3) —
// isBodyBlockedAt() below tests those pixel-accurately on its own.
function isTileBlocked(col, row, skipWallColliders = false) {
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return false; // clamp() already keeps the player on the map; nothing to block here

  const layers = [terrainLayer, groundLayer, decorLayer, objectLayer];
  for (const layer of layers) {
    for (const [key, type] of layer) {
      if (!itemDefs[type].collides) continue;
      if (skipWallColliders && itemDefs[type].wallColliderPx) continue;
      const [placedCol, placedRow] = key.split(",").map(Number);
      const blockedTiles = getObjectFootprintBlockedTiles(type, placedCol, placedRow);
      for (let i = 0; i < blockedTiles.length; i++) {
        if (blockedTiles[i].col === col && blockedTiles[i].row === row) return true;
      }
    }
  }
  return false;
}

// The check the player's and the NPC's movement actually use: everything
// tile-based goes through isTileBlocked() exactly as before, EXCEPT items
// with `wallColliderPx` (house2/house3), which are skipped there and
// tested pixel-accurately instead — the body's real width against the
// house's real wall columns (isBlockedByHouseWalls(), inventory.js).
function isBodyBlockedAt(x, y) {
  const feetY = y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  const col = Math.floor(x / TILE);
  const row = Math.floor(feetY / TILE);
  if (isTileBlocked(col, row, true)) return true;
  for (const [key, type] of objectLayer) {
    if (!itemDefs[type].wallColliderPx) continue;
    const [placedCol, placedRow] = key.split(",").map(Number);
    if (isBlockedByHouseWalls(type, placedCol, placedRow, x, feetY)) return true;
  }
  return false;
}

// Moves from (x0,y0) toward (x1,y1) — one axis at a time, see the caller
// — and if the destination is blocked, stops FLUSH against whatever
// blocks it (binary search between the free start and the blocked end)
// instead of refusing the whole step. Without this the character stopped
// up to one frame's worth of movement (a few px when running) short of a
// wall, so the collision never looked like it lined up with the art.
function sweepBodyTo(x0, y0, x1, y1) {
  if (!isBodyBlockedAt(x1, y1)) return { x: x1, y: y1 };
  let lo = 0, hi = 1;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    if (isBodyBlockedAt(x0 + (x1 - x0) * mid, y0 + (y1 - y0) * mid)) hi = mid;
    else lo = mid;
  }
  return { x: x0 + (x1 - x0) * lo, y: y0 + (y1 - y0) * lo };
}

function updatePlayer(dt) {
  // Frozen for the entire fade-out -> switch -> fade-in sequence
  // (js/interior.js) — nothing should move, and neither
  // checkInteriorEntry() nor the exit-zone check should be able to
  // retrigger, while the screen is transitioning.
  if (typeof sceneFade !== "undefined" && sceneFade) return;

  // Playing through the Big Bed's 20-frame sleep animation (js/
  // resources.js's trySleepInBed()/updateSleeping()) — frozen the same
  // way, until it hands off to beginSceneFade() above at the end.
  if (player.sleeping) {
    updateSleeping(dt);
    return;
  }

  // Interior scenes (js/interior.js) are a completely separate movement/
  // collision space — branch off immediately, before any of the outdoor
  // collect/throw/harvest/movement logic below (none of which means
  // anything indoors: no world objects in there to grab or harvest).
  if (player.scene === "inside") {
    updatePlayerInsideInterior(dt);
    // E/T/R for a placed Collision Block (js/interior.js) — the same
    // one-shot flags input.js already tracks for the outdoor versions,
    // just resolved immediately instead of waiting on a "collect"
    // wind-up animation (this scene doesn't have one — see
    // updatePlayerInsideInterior()'s simpler movement, interior.js).
    if (collectRequested) {
      collectRequested = false;
      tryGrabOrPlaceIndoorItemInFront();
    }
    if (throwRequested) {
      throwRequested = false;
      tryThrowGrabbedInteriorItem();
    }
    if (keepRequested) {
      keepRequested = false;
      tryKeepGrabbedItem(); // scene-agnostic already (js/inventory.js) — just grantItem() + clear grabbedType
    }
    return;
  }

  // --- one-shot action animations: lock movement until they finish ---
  if (player.action) {
    const fps = ANIM_FPS[player.action];
    const frameCount = FRAME_COUNTS[player.action];
    player.frameTimer += dt;
    if (player.frameTimer >= 1 / fps) {
      player.frameTimer = 0;
      player.frame++;
      if (player.frame >= frameCount) {
        if (player.action === "collect") {
          // animation finished — grab whatever's on the tile directly in
          // front of the player, or if already holding something from a
          // previous grab, place it back down there instead
          // (tryGrabOrPlaceInFront(), js/inventory.js — it also updates
          // player.mode to match).
          tryGrabOrPlaceInFront();
        } else {
          // an attack swing (bare-handed "hit", or whatever the equipped
          // weapon's attackAnim is) — resolve it against whatever was in
          // range when the swing started, if anything. Swinging at empty
          // air (no target) is a harmless no-op inside resolveHarvestHit().
          resolveHarvestHit(player.harvestTarget);
        }
        player.action = null;
        player.harvestTarget = null;
        player.frame = 0;
      }
    }
    return; // no movement / other animation while this plays
  }

  // pressing E starts the collect animation — grabs the wild grass/
  // flower/stone/tree directly in front of the player if not already
  // holding something, or places whatever's currently grabbed back down
  // there if so (resolved once the animation finishes —
  // tryGrabOrPlaceInFront(), js/inventory.js — same "resolve at the end
  // of the swing" pattern the F-key attack below uses). Consumes the
  // one-shot flag from input.js. Per request, "E" is ALWAYS this — even
  // at a Big Bed (grab/hold it like any other object); sleeping there is
  // left-click ONLY (trySleepInBed(), js/resources.js's
  // setupBedClickHandler()), never this key.
  if (collectRequested) {
    collectRequested = false;
    player.action = "collect";
    player.frame = 0;
    player.frameTimer = 0;
    return;
  }

  // "T"/"R" only ever do anything if something's currently grabbed (both
  // functions are no-ops otherwise) — no animation lock for either, they
  // just resolve instantly and let movement continue the same frame.
  if (throwRequested) {
    throwRequested = false;
    tryThrowGrabbedItem();
  }
  if (keepRequested) {
    keepRequested = false;
    tryKeepGrabbedItem();
  }

  // pressing F attacks. If a harvestable stone/tree is in range
  // (findHarvestableTarget(), js/resources.js), the animation matches
  // THAT resource (Crush for stones, Slice for trees — its own
  // `resource.breakAnim`), regardless of what's equipped — cutting a
  // tree always looks like cutting a tree. Only when swinging at nothing
  // does the equipped weapon's animation (or a bare-handed "hit") show.
  if (harvestRequested) {
    harvestRequested = false;
    const target = findHarvestableTarget();
    const attackAnim = target
      ? itemDefs[target.type].resource.breakAnim
      : (player.equippedWeapon ? itemDefs[player.equippedWeapon].weapon.attackAnim : "hit");
    player.action = attackAnim;
    player.harvestTarget = target; // null is fine — just a swing
    player.frame = 0;
    player.frameTimer = 0;
    return;
  }

  let vx = 0, vy = 0;
  if (keys["w"] || keys["arrowup"]) vy -= 1;
  if (keys["s"] || keys["arrowdown"]) vy += 1;
  if (keys["a"] || keys["arrowleft"]) vx -= 1;
  if (keys["d"] || keys["arrowright"]) vx += 1;

  // [ / ] as a keyboard alternative to the mouse wheel for zoom (moved off
  // Q/E since E is now the collect/put-down key)
  if (keys["["]) zoom = clamp(zoom - ZOOM_STEP * dt * 6, ZOOM_MIN, ZOOM_MAX);
  if (keys["]"]) zoom = clamp(zoom + ZOOM_STEP * dt * 6, ZOOM_MIN, ZOOM_MAX);

  const moving = vx !== 0 || vy !== 0;
  // Running also requires actual stamina left — per the stamina stat
  // (js/player.js's player object, js/hud.js's bar), sprinting isn't
  // free anymore. Holding Shift with 0 stamina just walks instead of
  // running, same as not holding it at all.
  //
  // BUG FIX: checking plain `player.stamina > 0` here used to flicker
  // the run/walk animation rapidly the instant stamina hit empty while
  // Shift was still held — stamina drains to EXACTLY 0 one frame
  // (`running` false, so it starts regenerating that same frame), ticks
  // a hair back above 0 the very next frame (`running` true again,
  // since Shift is still down and stamina > 0), which drains it right
  // back to 0, and so on — dozens of times a second, each toggle also
  // resetting the animation frame counter (see the `nextAnim !==
  // player.anim` reset below), so the character visibly stuttered
  // between the run and walk sprites instead of settling into a walk.
  // `player.staminaExhausted` is a latch that fixes this: once stamina
  // actually reaches 0 it's set, forcing `running` false regardless of
  // Shift, and it only clears once stamina has regenerated back up to
  // STAMINA_RUN_RECOVER_PCT of max (config.js) — a real recovery, not
  // just "greater than zero" — before Shift can trigger running again.
  if (player.stamina <= 0) player.staminaExhausted = true;
  else if (player.stamina >= player.maxStamina * STAMINA_RUN_RECOVER_PCT) player.staminaExhausted = false;

  const running = moving && keys["shift"] && player.stamina > 0 && !player.staminaExhausted;
  const nextAnim = moving ? (running ? "run" : "walk") : "idle";

  // Drains while actually running, regenerates otherwise (whether idle
  // or just walking) — slower than it drains, so sprinting everywhere
  // isn't free (see STAMINA_DRAIN_PER_SEC/STAMINA_REGEN_PER_SEC, config.js).
  if (running) {
    player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN_PER_SEC * dt);
  } else {
    player.stamina = Math.min(player.maxStamina, player.stamina + STAMINA_REGEN_PER_SEC * dt);
  }

  if (moving) {
    const len = Math.hypot(vx, vy) || 1;
    vx /= len; vy /= len;
    const speed = player.speed * (running ? player.runMult : 1);

    const wantX = clamp(player.x + vx * speed * dt, DRAW_SIZE / 2, MAP_W - DRAW_SIZE / 2);
    const wantY = clamp(player.y + vy * speed * dt, DRAW_SIZE / 2, MAP_H - DRAW_SIZE / 2);

    // Separate-axis collision: try moving on X and Y independently rather
    // than as one combined step, so bumping into a tree/rock on one axis
    // doesn't also cancel movement on the other — you can slide along the
    // side of an obstacle instead of getting fully stuck on it.
    //
    // Escape hatch: if the player is ALREADY overlapping something (e.g. a
    // save from before a collision change put them right against a wall
    // that's now a few px wider), let them walk freely until they're out,
    // instead of every direction being refused forever.
    if (isBodyBlockedAt(player.x, player.y)) {
      player.x = wantX;
      player.y = wantY;
    } else {
      player.x = sweepBodyTo(player.x, player.y, wantX, player.y).x;
      player.y = sweepBodyTo(player.x, player.y, player.x, wantY).y; // uses the (possibly just-updated) player.x
    }

    // Any horizontal input at all (including diagonals like top-left,
    // top-right, bottom-left, bottom-right) uses the left/right side
    // sprite. Up/down is only used for purely vertical movement, since
    // there's no dedicated diagonal artwork.
    if (vx !== 0) {
      player.facing = vx > 0 ? "right" : "left";
    } else {
      player.facing = vy > 0 ? "down" : "up";
    }

    // Stepping onto a house's front-door tile (js/interior.js) takes
    // over from here — only checked while actually moving, since the
    // door tile can only be reached by walking onto it. If this just
    // switched `player.scene` to "inside", bail out immediately rather
    // than falling through to the animation-frame update below, which
    // would otherwise clobber the fresh idle state enterInterior() just
    // set using this frame's now-stale OUTDOOR `nextAnim`.
    checkInteriorEntry(vy);
    if (player.scene === "inside") return;
  }

  // reset the frame counter whenever the animation state changes, so we
  // never end up pointing at a frame index that doesn't exist in the
  // new sheet (e.g. idle only has 4 frames, run/walk have 6)
  if (nextAnim !== player.anim) {
    player.anim = nextAnim;
    player.frame = 0;
    player.frameTimer = 0;
  }

  // carry* sheets share the same frame counts/speeds as their normal
  // counterparts (idle/walk/run), so the anim key alone is enough here —
  // spriteForFacing() is what actually picks the carry vs normal sheet.
  const fps = ANIM_FPS[player.anim];
  const frameCount = FRAME_COUNTS[player.anim];
  player.frameTimer += dt;
  if (player.frameTimer >= 1 / fps) {
    player.frameTimer = 0;
    player.frame = (player.frame + 1) % frameCount;
  }
}
