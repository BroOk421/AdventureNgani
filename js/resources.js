"use strict";

/* =================================================================
   RESOURCES — the "hit a stone/tree a few times to harvest it" system.

   - `itemDefs` entries that can be harvested (see js/inventory.js) carry
     a `resource` config:
       { hitsToBreak, breakAnim: "crush" | "slice",
         dropItem?, dropAmount?, respawnMinutes?, respawnAs?, replaceWith? }
     Stones (stoneBig, stoneMedium): `dropItem` + `respawnMinutes` — break
     grants a Stone Chunk (dropAmount defaults to 1 when omitted) and the
     SAME stone tile comes back on its own after `respawnMinutes` (no
     `respawnAs`, so it defaults to respawning as itself).
     Living trees (treeThinGreen/treeTinyGreen/treeBigOrange/
     treeThinOrange): `replaceWith` — break permanently swaps the tile
     for its matching cut/stump variant (named by the source pack:
     "thintree" -> "thincutted", etc.), no respawn on this stage. Also
     `dropItem: "woodLog"` + `dropAmount` — 5 for the big tree, 3 for
     thin, 2 for tiny (per request).
     Stumps/bare trees (treeBigCutStump, treeThinCutStump,
     treeTinyCutStump, treeThinNoLeaves1/2): `respawnMinutes` +
     `respawnAs` — hitting the stump itself clears the tile entirely,
     then after `respawnMinutes` a tree grows back. For the three cut
     stumps, `respawnAs` names the LIVING tree that regrows (completing
     the cycle: living tree -> stump -> empty -> living tree again); the
     two bare/noLeaves trees have no separate "living" form to speak of,
     so they regrow as themselves (no `respawnAs` needed — see
     `respawnAs || type` below). The three cut stumps also drop wood —
     3/2/1 for big/thin/tiny — smaller amounts than their living form
     since there's less tree left to take wood from. The two bare/
     noLeaves trees take 3 hits (not 2, per request — matching a living
     tree's hit count rather than a stump's) and drop `woodLog`
     `dropAmount: 2`, matching the Thin Tree Stump's amount.
   - `resourceHits` tracks in-progress hit counts per tile (NOT saved —
     deliberately transient, same treatment as `heldItem`: a partially-hit
     stone/tree just resets its count on reload rather than remembering it).
   - `pendingRespawns` tracks broken stones/trees waiting to come back (IS
     saved — see js/save.js — so a timer survives a refresh instead of
     silently completing in the background or resetting).
   - `floatingPickups` are the little icons that toss out, bounce, rest,
     then fly to the player when a drop is granted — purely cosmetic (NOT
     saved; if the tab reloads mid-animation they just don't finish
     playing, the inventory grant itself already happened instantly and
     independently of them).
   - Pressing **F** (see js/input.js's `harvestRequested`, consumed in
     js/player.js's updatePlayer()) looks for a harvestable object within
     HARVEST_RANGE of the player and, if found, plays that resource's
     break animation once before resolving the hit.
================================================================= */

const resourceHits = new Map();     // "col,row" -> hits taken so far (not saved)
const pendingRespawns = new Map();  // "col,row" -> { type, respawnAt } (saved)

// Finds the first harvestable object (an objectLayer item whose itemDefs
// entry has a `resource` config) within HARVEST_RANGE of the player's
// current tile. Same Chebyshev-distance neighborhood placement already
// uses (getPlayerTile(), js/inventory.js).
function findHarvestableTarget() {
  const p = getPlayerTile();
  for (let row = p.row - HARVEST_RANGE; row <= p.row + HARVEST_RANGE; row++) {
    for (let col = p.col - HARVEST_RANGE; col <= p.col + HARVEST_RANGE; col++) {
      const type = getLayerItemId(objectLayer, col, row);
      if (type && itemDefs[type].resource) {
        return { col, row, type };
      }
    }
  }
  return null;
}

// Adds `amount` to an inventory slot's count by item TYPE (creates no new
// slot — every itemDefs entry already has one via the inventory
// auto-fill, js/inventory.js). Always actually increments, even though
// every item is `unlimited` right now (entry 28) — so the count is
// already correct and meaningful the moment `unlimited` is turned off for
// a specific item later.
function grantItem(type, amount) {
  const slot = inventory.find((s) => s && s.type === type);
  if (slot) slot.count += amount;
  renderHotbar();
  renderInventory();
}

/* ---------------- floating pickup popups (cosmetic only) ---------------- */
//
// A dropped item plays three phases, per request ("pa-hagis tapos
// tatalbog ng 2x sa ground, after talbog 1sec bago mapunta sa character
// parang na-vacuum"):
//   1. "throw"   — tossed outward from the break point with a little
//                  random scatter, arcing up and down under gravity,
//                  bouncing off the ground FLOATING_PICKUP_BOUNCES times
//                  (losing height each bounce) before settling.
//   2. "resting" — sits still on the ground for FLOATING_PICKUP_REST_MS.
//   3. "vacuum"  — flies to the player's (current, live) position over
//                  FLOATING_PICKUP_VACUUM_MS, shrinking as it goes, like
//                  being sucked in, then disappears.
// `z` is a purely visual "height above the ground" — the world x/y is
// where the icon's shadow/contact point is; drawFloatingPickups()
// (camera.js) subtracts z from the screen position to draw it "lifted
// up". This is the same convention drawHeldItemAboveHead() already uses
// (an upward screen-space offset), just continuously animated here
// instead of a fixed gap.

const floatingPickups = []; // see the per-particle shape spawnFloatingPickups() creates below — not saved

const FLOATING_PICKUP_GRAVITY = 260;       // world px/s^2 — how fast it falls back down
const FLOATING_PICKUP_THROW_VZ = 90;       // initial upward speed when tossed
const FLOATING_PICKUP_THROW_SPEED_MIN = 14; // ground-direction toss speed range (world px/s)
const FLOATING_PICKUP_THROW_SPEED_MAX = 30;
const FLOATING_PICKUP_BOUNCE_DAMPING = 0.45; // vertical speed kept after each bounce
const FLOATING_PICKUP_GROUND_FRICTION = 0.6; // ground speed kept after each bounce
const FLOATING_PICKUP_BOUNCES = 2;          // per request — bounces twice before resting
const FLOATING_PICKUP_REST_MS = 1000;       // per request — 1 second pause once it's done bouncing
const FLOATING_PICKUP_VACUUM_MS = 350;      // quick flight into the player once the rest is over
const FLOATING_PICKUP_STAGGER_MS = 90;      // delay between each icon in a multi-drop, so e.g. 5 logs toss out one after another instead of all at once

// Spawns `count` floating icons of `type` at a world position (the broken
// resource's tile), each starting its own staggered throw arc. Purely
// visual: grantItem() already applied the real inventory change
// synchronously, before this is even called.
function spawnFloatingPickups(worldX, worldY, type, count) {
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const throwSpeed = FLOATING_PICKUP_THROW_SPEED_MIN +
      Math.random() * (FLOATING_PICKUP_THROW_SPEED_MAX - FLOATING_PICKUP_THROW_SPEED_MIN);
    floatingPickups.push({
      type,
      x: worldX,
      y: worldY,
      z: 0,
      vx: Math.cos(angle) * throwSpeed,
      vy: Math.sin(angle) * throwSpeed,
      vz: FLOATING_PICKUP_THROW_VZ,
      bounces: 0,
      phase: "throw",       // "throw" -> "resting" -> "vacuum"
      restUntil: 0,         // set once it settles
      vacuumStart: 0,       // set once resting ends
      vacuumFromX: 0,
      vacuumFromY: 0,
      startAt: now + i * FLOATING_PICKUP_STAGGER_MS, // staggered start — see updateFloatingPickups()
    });
  }
}

// Called every frame (main.js's loop, with the same dt as everything
// else) — advances each pickup's little physics sim one step, and
// removes any that have finished their vacuum flight.
function updateFloatingPickups(dt) {
  if (floatingPickups.length === 0) return;
  const now = Date.now();

  for (let i = floatingPickups.length - 1; i >= 0; i--) {
    const p = floatingPickups[i];
    if (now < p.startAt) continue; // staggered — hasn't been tossed yet

    if (p.phase === "throw") {
      p.vz -= FLOATING_PICKUP_GRAVITY * dt;
      p.z += p.vz * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.z <= 0) {
        p.z = 0;
        p.bounces++;
        if (p.bounces >= FLOATING_PICKUP_BOUNCES) {
          p.phase = "resting";
          p.restUntil = now + FLOATING_PICKUP_REST_MS;
          p.vx = 0;
          p.vy = 0;
          p.vz = 0;
        } else {
          p.vz = -p.vz * FLOATING_PICKUP_BOUNCE_DAMPING; // bounce back up, losing energy
          p.vx *= FLOATING_PICKUP_GROUND_FRICTION;
          p.vy *= FLOATING_PICKUP_GROUND_FRICTION;
        }
      }
    } else if (p.phase === "resting") {
      if (now >= p.restUntil) {
        p.phase = "vacuum";
        p.vacuumStart = now;
        p.vacuumFromX = p.x;
        p.vacuumFromY = p.y;
      }
    } else if (p.phase === "vacuum") {
      const t = Math.min(1, (now - p.vacuumStart) / FLOATING_PICKUP_VACUUM_MS);
      const easeIn = t * t; // accelerating pull, like something snapping into a vacuum
      // Chases the player's LIVE position, not a fixed point, in case
      // they've moved since the item finished resting.
      p.x = p.vacuumFromX + (player.x - p.vacuumFromX) * easeIn;
      p.y = p.vacuumFromY + (player.y - p.vacuumFromY) * easeIn;
      p.z = 0;
      if (t >= 1) {
        floatingPickups.splice(i, 1); // reached the player — done
      }
    }
  }
}

/* ---------------- harvesting ---------------- */

// Called once per hit (from updatePlayer() when a crush/slice animation
// finishes) — increments that tile's hit count and, once it reaches
// hitsToBreak, resolves the break: removes/replaces the object, grants
// its drop (if any, with a floating-popup flourish), and schedules a
// respawn (if any).
function resolveHarvestHit(target) {
  if (!target) return;
  const { col, row, type } = target;
  const key = tileKey(col, row);
  const def = itemDefs[type];
  if (!def || !def.resource) return;

  const hits = (resourceHits.get(key) || 0) + 1;
  if (hits < def.resource.hitsToBreak) {
    resourceHits.set(key, hits);
    return;
  }

  resourceHits.delete(key);
  objectLayer.delete(key);

  if (def.resource.replaceWith) {
    objectLayer.set(key, def.resource.replaceWith); // trees: permanent stump, no respawn
  }

  if (def.resource.dropItem) {
    const amount = def.resource.dropAmount || 1;
    grantItem(def.resource.dropItem, amount);
    // Pop the floating icons roughly where the trunk/body was — a little
    // above the tile's vertical center reads better than dead center for
    // something tall like a tree.
    const worldX = (col + 0.5) * TILE;
    const worldY = (row + 0.3) * TILE;
    spawnFloatingPickups(worldX, worldY, def.resource.dropItem, amount);
  }

  if (def.resource.respawnMinutes) {
    // Respawns as `respawnAs` if the resource names one (a stump regrowing
    // into its living tree), otherwise as itself (stones, and the bare/
    // noLeaves trees which have no separate "living" form).
    const respawnType = def.resource.respawnAs || type;
    pendingRespawns.set(key, {
      type: respawnType,
      respawnAt: Date.now() + def.resource.respawnMinutes * 60 * 1000,
    });
  }

  saveGame(); // persist the break/respawn schedule right away, not just on the timer
}

// Called every frame (main.js's loop) — restores any stone whose respawn
// timer has elapsed. Wall-clock based (Date.now()), same approach as the
// day/night clock (js/daynight.js), so a respawn keeps counting down even
// while the tab is closed, instead of pausing.
function updateResources() {
  if (pendingRespawns.size === 0) return;
  const now = Date.now();
  pendingRespawns.forEach((info, key) => {
    if (now >= info.respawnAt) {
      objectLayer.set(key, info.type);
      pendingRespawns.delete(key);
    }
  });
}

/* ---------------- thrown-item toss (cosmetic only) ---------------- */
//
// What tryThrowGrabbedItem() (js/inventory.js) plays when "T" throws
// something away — per request, this is now a toss AND a destroy
// combined, not either alone: the item arcs out to a tile 2 away (same
// as before), then once it visually lands, it blinks 3 times and is
// gone for good. Nothing about this is real game state — the item was
// never written into any layer at all (tryThrowGrabbedItem() only ever
// calls this function, never layer.set()), so the whole thing is exactly
// as cosmetic as the floating pickups above: NOT saved, and reloading
// mid-toss or mid-blink just means the animation doesn't finish playing,
// nothing is lost either way since the item was already cleared from the
// player's hand before this was even spawned.

const thrownTosses = []; // { type, fromX, fromY, toX, toY, startAt } — not saved

const THROW_TOSS_DURATION_MS = 300;   // the arc through the air
const THROW_TOSS_ARC_HEIGHT = 22;     // world px the item rises at the midpoint of its flight
const THROW_BLINK_HALF_MS = 120;      // one on/off half-cycle, once landed
const THROW_BLINK_COUNT = 3;          // per request — blinks 3 times after landing
const THROW_BLINK_DURATION_MS = THROW_BLINK_HALF_MS * 2 * THROW_BLINK_COUNT;
const THROW_TOTAL_DURATION_MS = THROW_TOSS_DURATION_MS + THROW_BLINK_DURATION_MS;

// `fromWorldX/Y` — where the toss starts (the player's position);
// `targetCol/Row` — the tile it lands on (and blinks at) before vanishing.
function spawnThrowToss(type, fromWorldX, fromWorldY, targetCol, targetRow) {
  thrownTosses.push({
    type,
    fromX: fromWorldX,
    fromY: fromWorldY,
    // Matches the same bottom-of-tile anchor drawGroundItemAt()/
    // drawWildgrassWhole() (camera.js) use for a landed item, so the
    // toss visually ends exactly where a real placed sprite would sit.
    toX: (targetCol + 0.5) * TILE,
    toY: (targetRow + 1) * TILE,
    startAt: Date.now(),
  });
}

// Called every frame (main.js's loop) — drops any toss whose full
// toss-then-blink sequence has finished.
function updateThrownTosses() {
  if (thrownTosses.length === 0) return;
  const now = Date.now();
  for (let i = thrownTosses.length - 1; i >= 0; i--) {
    if (now - thrownTosses[i].startAt > THROW_TOTAL_DURATION_MS) {
      thrownTosses.splice(i, 1);
    }
  }
}

/* ---------------- sleeping in a Big Bed ----------------
   Per request ("meron akong bigbed tapos may animation yun kapag gabi
   na tapos mag animate sa 20 frame ng bigbed is dapat mag fade in
   parang sa pinto pag magigising ng 6am", refined further: "kapag click
   ko ng bed yung mismong kahit 3x3 na tiles nun ng bigbed functional...
   kahit anung mapindot dun using left clicks is matutulog animate tapos
   yung ERT yung press 'e' is naging sleep naman dapat left click lang
   kapag press 'e' hold"): LEFT-CLICKING any of a placed Big Bed's 3x3
   tiles at night — never "E", which stays the normal grab/hold action
   here like any other object (tryGrabOrPlaceInFront()/
   tryGrabOrPlaceIndoorItemInFront(), see updatePlayer(), player.js) —
   plays through the bed's 20-frame sleep sheet (assets.bedBigSleep,
   drawn at the BED's own position — see drawSleepingBed(), camera.js —
   in place of both the player's sprite AND the bed's own normal art for
   that one tile, so the two don't draw on top of each other), then
   fades to black exactly like an interior door transition
   (beginSceneFade(), js/interior.js — already scene-agnostic, works the
   same whether the bed is outdoors or indoors), jumps the clock to the
   next 06:00 (skipToNextSunrise(),
   js/daynight.js) while the screen is black, and fades back in. */

// Finds a placed Big Bed the player can currently interact with — the
// one they're FACING if outside (bedBig collides there — itemDefs), or
// the one directly underfoot if inside (indoor decor stays walkable
// regardless of `collides` — placeInteriorDecorAt()'s header comment,
// interior.js). Uses findFootprintCoveringTile() (inventory.js) so ANY
// of the bed's 3x3 tiles counts, not just its single anchor tile.
// Returns { col, row } — the bed's own anchor tile, the same key it's
// stored under (needed later to hide its normal art while sleeping,
// and to draw the sleep animation in the right spot) — or null.
function findNearbyBigBed() {
  if (player.scene === "outside") {
    const front = getTileInFrontOfPlayer();
    for (const layer of [decorLayer, objectLayer, groundLayer, terrainLayer]) {
      const hit = findFootprintCoveringTile(layer, front.col, front.row);
      if (hit && hit.type === "bedBig") return { col: hit.anchorCol, row: hit.anchorRow };
    }
    return null;
  }
  const room = INTERIOR_ROOMS[player.activeRoomId];
  if (!room) return null;
  const p = interiorFeetTileAt(player.x, player.y);
  if (room.decor.get(tileKey(p.col, p.row)) === "bedBig") return { col: p.col, row: p.row };
  return null;
}

// Called from setupBedClickHandler() below whenever a left-click lands
// on a Big Bed — a no-op (returns false, changes nothing) unless it's
// actually night, the player is at a Big Bed, nothing's currently
// held/grabbed (sleeping with your hands full doesn't make sense), and
// no other transition is already in progress. NOT wired to "E" — per
// request, that key stays the normal grab/hold action everywhere,
// including at a bed.
function trySleepInBed() {
  if (isDaytime()) return false;
  if (sceneFade) return false;
  if (player.sleeping) return false;
  if (heldItem || player.grabbedType) return false;
  const bed = findNearbyBigBed();
  if (!bed) return false;

  player.sleeping = true;
  player.sleepFrame = 0;
  player.sleepFrameTimer = 0;
  player.sleepBedCol = bed.col;
  player.sleepBedRow = bed.row;
  return true;
}

// True if the given WORLD (x,y) point lands on ANY of a placed Big
// Bed's 3x3 footprint tiles — not just wherever its art pixels happen
// to be drawn, per request ("kahit 3x3 na tiles nun ng bigbed
// functional"). Reuses findFootprintCoveringTile() (inventory.js),
// same as the E-key check above, just keyed off a clicked tile instead
// of the tile the player is facing.
function isPointOnBigBed(x, y) {
  const col = Math.floor(x / TILE);
  const row = Math.floor(y / TILE);
  if (player.scene === "outside") {
    return [decorLayer, objectLayer, groundLayer, terrainLayer].some((layer) => {
      const hit = findFootprintCoveringTile(layer, col, row);
      return hit && hit.type === "bedBig";
    });
  }
  const room = INTERIOR_ROOMS[player.activeRoomId];
  if (!room) return false;
  return room.decor.get(tileKey(col, row)) === "bedBig";
}

// Left-click anywhere on a placed Big Bed's 3x3 footprint at night
// sleeps, same as pressing "E" while at one (trySleepInBed(), above) —
// just an alternate input for the same action (still requires actually
// being at the bed, night, hands empty, etc. — trySleepInBed() re-checks
// all of that and simply no-ops if the click landed on a bed the player
// isn't close enough to). Small Bed has no sleep sheet, so it's
// deliberately left out here. Set up once from main.js, same pattern as
// setupNpcClickHandler() (js/npc.js).
function setupBedClickHandler() {
  view.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // left button only
    if (heldItem || player.grabbedType) return; // hands full — a click places/grabs instead, see inventory.js
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    if (!isPointOnBigBed(x, y)) return;
    trySleepInBed();
  });
}

// Called every frame from updatePlayer() (player.js) instead of the
// normal movement update while `player.sleeping` — advances the sleep
// animation, and once all FRAME_COUNTS.sleep frames have played, hands
// off to the same fade-to-black/fade-in sequence every interior door
// uses, with the clock jump as the "onMidpoint" (invisible to the
// player, same as a scene switch happening at the blackout point).
function updateSleeping(dt) {
  const fps = ANIM_FPS.sleep;
  const frameCount = FRAME_COUNTS.sleep;
  player.sleepFrameTimer += dt;
  if (player.sleepFrameTimer >= 1 / fps) {
    player.sleepFrameTimer = 0;
    player.sleepFrame++;
    if (player.sleepFrame >= frameCount) {
      player.sleeping = false;
      beginSceneFade(() => {
        skipToNextSunrise();
      });
    }
  }
}
