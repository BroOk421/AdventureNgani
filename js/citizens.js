"use strict";

/* =================================================================
   WANDERING CITIZENS (Citizen_B .. Citizen_E)

   Per request ("yung Citizen B to E ... i add mo sa map nag lalakad
   lakad dapat di rin nag lalakad sa collision umiiwas"): four townsfolk
   who stroll around the outdoor map on their own.

     idle  -> standing still for a few seconds
     walk  -> heading to a random free tile near their home spot

   Art: assets/npc/Citizen_X/idle/Idle.png + Idle_Left.png (4 frames) and
   walk/Walk.png + Walk_Left.png (6 frames), 64x64 per frame. Only side
   art exists (right + its per-frame flipped left copy), so walking
   straight up/down keeps whichever side they last faced — same as Maria.

   AVOIDING COLLISIONS
   - Routes come from the same A* Maria and the tavern customers use
     (findNpcTilePath(), js/npc.js) over the same blocked-tile set
     (buildNpcBlockedTiles() via customerOutdoorBlocked(), js/customers.js)
     — trees, stones, house walls, crates, port edges, fences… anything
     with `collides`. They walk tile centre to tile centre, so they never
     cut a corner through something solid.
   - Wander targets are only ever picked on free tiles.
   - If something gets placed in their way mid-walk, the next step's tile
     is checked every frame and the route is re-planned.
   - Other characters (the player, Maria, customers, each other): they
     don't collide (per request the player just overlaps them), but they
     DO step around people. A plan treats tiles other characters stand on
     as blocked, and if someone is right in front of them they stop,
     wait a moment, then re-plan around (or give up and pick a new spot).

   OVERLAP (depth sort) — per request: "nag ooverlap din yung character
   kapag 25% below at 75% higher npc overlap sa character". Each citizen
   sorts on a line drawn across its own visible body, 25% of the way up
   from its feet (CITIZEN_OVERLAP_BOTTOM_FRACTION):
     - player's feet BELOW that line (the bottom 25% or lower) -> the
       player is drawn in front, covering the citizen
     - player's feet ABOVE it (the upper 75%) -> the citizen is drawn in
       front, covering the player
   The same line is used against trees/houses/other citizens, so it's the
   same feet-based Y-sort Maria and the customers use, just with the
   split point explicit and tunable.

   Not saved — positions are rolled fresh on each load (they're
   ambience, not progress).
================================================================= */

const CITIZEN_IDS = ["B", "C", "D", "E"];
const CITIZEN_SPEED_MIN = 26, CITIZEN_SPEED_MAX = 38;   // world px/s — a stroll (Maria walks 45)
const CITIZEN_HOME_SPREAD_TILES = 16;   // how far from town centre each citizen's home spot can be
const CITIZEN_WANDER_RADIUS_TILES = 10; // how far from their home spot they'll wander
const CITIZEN_WANDER_MIN_TILES = 3;     // don't pick a target right next to where they already are
const CITIZEN_IDLE_MIN = 2, CITIZEN_IDLE_MAX = 7; // seconds standing around between walks
const CITIZEN_PERSONAL_SPACE = 12;      // world px — closer than this to someone ahead, they stop
const CITIZEN_WAIT_BEFORE_REPLAN = 0.7; // s blocked by someone before routing around them
const CITIZEN_GIVE_UP_SECONDS = 4;      // s still stuck -> pick a whole new destination
const CITIZEN_REPLAN_SECONDS = 5;       // re-plan every so often anyway (the world may have changed)

// Overlap split, see the header. Measured off the art: the head starts
// at ~SPRITE_HEAD_FRACTION of the 64px frame, the lowest foot pixel is
// row 47 (so the visible bottom is 48/64).
const CITIZEN_OVERLAP_BOTTOM_FRACTION = 0.25;
const CITIZEN_VISIBLE_FEET_FRACTION = 48 / 64;

const citizens = [];
let citizensReady = false;

const citizenRand = (a, b) => a + Math.random() * (b - a);
const citizenTileOf = (x, y) => ({ col: Math.floor(x / TILE), row: Math.floor(y / TILE) });
const citizenTileCentre = (col, row) => ({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE });

function citizenSheets(id) {
  return {
    idleRight: assets["citizen" + id + "IdleRight"],
    idleLeft: assets["citizen" + id + "IdleLeft"],
    walkRight: assets["citizen" + id + "WalkRight"],
    walkLeft: assets["citizen" + id + "WalkLeft"],
  };
}

// Screen-space centre Y for a feet Y (the sprite is drawn around its centre).
function citizenCentreY(feetY) {
  return feetY - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
}

// The depth-sort line described in the header, as a world Y.
function citizenSortY(c) {
  const top = SPRITE_HEAD_FRACTION, bottom = CITIZEN_VISIBLE_FEET_FRACTION;
  const lineFrac = bottom - CITIZEN_OVERLAP_BOTTOM_FRACTION * (bottom - top);
  return citizenCentreY(c.fy) + (lineFrac - 0.5) * DRAW_SIZE;
}

/* ---------------- where things are ---------------- */

function citizenStaticBlocked() {
  return customerOutdoorBlocked(); // js/customers.js — shared, rebuilt at most once a second
}

function isCitizenTileFree(col, row, blocked) {
  if (col < 1 || row < 1 || col > COLS - 2 || row > ROWS - 2) return false;
  return !blocked.has(col + "," + row);
}

// Feet positions of everyone else walking around outside right now.
function otherOutdoorFeet(self) {
  const out = [];
  if (player.scene === "outside" && !player.sleeping) {
    out.push({ x: player.x, y: player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE });
  }
  if (npc.scene === "outside") out.push({ x: npc.x, y: npc.y + (SPRITE_FEET_FRACTION - 0.5) * NPC_DRAW_SIZE });
  if (typeof customers !== "undefined") {
    for (const cu of customers) if (cu.scene === "outside" && cu.state !== "away") out.push({ x: cu.fx, y: cu.fy });
  }
  for (const c of citizens) if (c !== self) out.push({ x: c.fx, y: c.fy, citizen: c });
  return out;
}

// Town centre: in front of the player's house if there is one, otherwise
// wherever the player is standing when the citizens first appear.
function citizenTownCentre() {
  return { x: player.x, y: player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE };
}

function pickFreeTileNear(cx, cy, minTiles, maxTiles, blocked, avoidKeys) {
  const c0 = citizenTileOf(cx, cy);
  for (let i = 0; i < 40; i++) {
    const ang = Math.random() * Math.PI * 2;
    const d = citizenRand(minTiles, maxTiles);
    const col = Math.round(c0.col + Math.cos(ang) * d);
    const row = Math.round(c0.row + Math.sin(ang) * d);
    if (!isCitizenTileFree(col, row, blocked)) continue;
    if (avoidKeys && avoidKeys.has(col + "," + row)) continue;
    return { col, row };
  }
  return null;
}

/* ---------------- setup ---------------- */

function initCitizens() {
  citizensReady = true;
  const blocked = citizenStaticBlocked();
  const centre = citizenTownCentre();
  const taken = new Set();
  const pt = citizenTileOf(centre.x, centre.y);
  taken.add(pt.col + "," + pt.row);
  for (const id of CITIZEN_IDS) {
    const home = pickFreeTileNear(centre.x, centre.y, 4, CITIZEN_HOME_SPREAD_TILES, blocked, taken) ||
      pickFreeTileNear(centre.x, centre.y, 1, 40, blocked, taken) || pt;
    taken.add(home.col + "," + home.row);
    const p = citizenTileCentre(home.col, home.row);
    citizens.push({
      id,
      home: { col: home.col, row: home.row },
      fx: p.x, fy: p.y, // FEET position, world px
      facing: Math.random() < 0.5 ? "left" : "right",
      anim: "idle", frame: Math.floor(Math.random() * 4), frameTimer: 0,
      speed: citizenRand(CITIZEN_SPEED_MIN, CITIZEN_SPEED_MAX),
      state: "idle", timer: citizenRand(0.5, CITIZEN_IDLE_MAX),
      path: null, pathIdx: 0, goal: null,
      waitT: 0, stuckT: 0, replanT: 0,
    });
  }
}

/* ---------------- walking ---------------- */

function planCitizenPath(c, avoidPeople) {
  const blocked = citizenStaticBlocked();
  const s = citizenTileOf(c.fx, c.fy);
  const g = c.goal;
  const people = new Set();
  if (avoidPeople) {
    for (const f of otherOutdoorFeet(c)) {
      const t = citizenTileOf(f.x, f.y);
      people.add(t.col + "," + t.row);
    }
    people.delete(s.col + "," + s.row);
  }
  const tiles = findNpcTilePath(s.col, s.row, g.col, g.row,
    (col, row) => blocked.has(col + "," + row) || people.has(col + "," + row), {
      minCol: Math.max(0, Math.min(s.col, g.col) - NPC_PATH_MARGIN_TILES),
      maxCol: Math.min(COLS - 1, Math.max(s.col, g.col) + NPC_PATH_MARGIN_TILES),
      minRow: Math.max(0, Math.min(s.row, g.row) - NPC_PATH_MARGIN_TILES),
      maxRow: Math.min(ROWS - 1, Math.max(s.row, g.row) + NPC_PATH_MARGIN_TILES),
    });
  // First leg: back onto the centre of the tile they're on, so every leg
  // after it runs along tile centres and never clips a solid corner.
  const pts = [citizenTileCentre(s.col, s.row)];
  if (tiles) for (const t of simplifyNpcTilePath(tiles)) pts.push(citizenTileCentre(t.col, t.row));
  c.path = pts;
  c.pathIdx = 0;
  c.replanT = 0;
  return !!(tiles && tiles.length);
}

function startCitizenWalk(c) {
  const blocked = citizenStaticBlocked();
  const home = citizenTileCentre(c.home.col, c.home.row);
  // Mostly around home; a little drift back toward it if they've wandered far.
  let target = null;
  for (let tries = 0; tries < 6 && !target; tries++) {
    const t = pickFreeTileNear(home.x, home.y, 0, CITIZEN_WANDER_RADIUS_TILES, blocked, null);
    if (!t) continue;
    const here = citizenTileOf(c.fx, c.fy);
    if (Math.abs(t.col - here.col) + Math.abs(t.row - here.row) < CITIZEN_WANDER_MIN_TILES) continue;
    target = t;
  }
  if (!target) { c.state = "idle"; c.timer = citizenRand(CITIZEN_IDLE_MIN, CITIZEN_IDLE_MAX); return; }
  c.goal = target;
  c.state = "walk";
  c.waitT = 0; c.stuckT = 0;
  planCitizenPath(c, true);
}

function stopCitizenWalk(c) {
  c.state = "idle";
  c.anim = "idle";
  c.timer = citizenRand(CITIZEN_IDLE_MIN, CITIZEN_IDLE_MAX);
  c.path = null;
  c.goal = null;
}

// Someone standing just ahead (in the direction of travel)? Returns
// them (a feet entry from otherOutdoorFeet()), or null.
function citizenPersonAhead(c, dirX, dirY) {
  for (const f of otherOutdoorFeet(c)) {
    const ox = f.x - c.fx, oy = f.y - c.fy;
    const d = Math.hypot(ox, oy);
    if (d > CITIZEN_PERSONAL_SPACE || d < 0.001) continue;
    if (ox * dirX + oy * dirY > 0) return f; // they're in front, not behind
  }
  return null;
}

// Two citizens walking into each other: only ONE steps aside, or both
// dodge to the same side and meet again. The one earlier in the list has
// right of way and just waits; the other routes around.
function citizenHasRightOfWay(c, other) {
  return !!other && citizens.indexOf(c) < citizens.indexOf(other) && other.state === "walk";
}

function stepCitizenWalk(c, dt) {
  c.replanT += dt;
  if (c.replanT > CITIZEN_REPLAN_SECONDS) planCitizenPath(c, true);

  if (!c.path || c.pathIdx >= c.path.length) { stopCitizenWalk(c); return; }
  const wp = c.path[c.pathIdx];
  const dx = wp.x - c.fx, dy = wp.y - c.fy;
  const d = Math.hypot(dx, dy);
  if (d < 0.01) {
    c.pathIdx++;
    if (c.pathIdx >= c.path.length) stopCitizenWalk(c);
    return;
  }
  const ux = dx / d, uy = dy / d;
  const step = Math.min(d, c.speed * dt);
  const nx = c.fx + ux * step, ny = c.fy + uy * step;

  // Something solid appeared on the way (the player just placed a tree)?
  const blocked = citizenStaticBlocked();
  const here = citizenTileOf(c.fx, c.fy), next = citizenTileOf(nx, ny);
  const nextKey = next.col + "," + next.row;
  if ((next.col !== here.col || next.row !== here.row) && blocked.has(nextKey)) {
    if (!planCitizenPath(c, false)) stopCitizenWalk(c);
    return;
  }

  // Someone in the way — wait, then walk around them, then give up.
  const blocker = citizenPersonAhead(c, ux, uy);
  if (blocker) {
    c.anim = "idle";
    c.waitT += dt;
    c.stuckT += dt;
    if (c.stuckT > CITIZEN_GIVE_UP_SECONDS) { stopCitizenWalk(c); return; }
    if (c.waitT > CITIZEN_WAIT_BEFORE_REPLAN) {
      c.waitT = 0;
      if (!citizenHasRightOfWay(c, blocker.citizen)) planCitizenPath(c, true);
    }
    return;
  }
  c.waitT = 0;
  // Only real walking wears the stuck timer down, and slowly — otherwise
  // a step-wait-step shuffle would never add up to giving up.
  c.stuckT = Math.max(0, c.stuckT - dt * 0.25);

  c.fx = nx; c.fy = ny;
  if (Math.abs(ux) > 0.01) c.facing = ux > 0 ? "right" : "left"; // up/down keeps the last side
  c.anim = "walk";
  if (step >= d - 0.001) {
    c.pathIdx++;
    if (c.pathIdx >= c.path.length) stopCitizenWalk(c);
  }
}

function advanceCitizenFrame(c, dt, prevAnim) {
  if (c.anim !== prevAnim) { c.frame = 0; c.frameTimer = 0; }
  const count = c.anim === "walk" ? 6 : 4;
  const fps = c.anim === "walk" ? ANIM_FPS.walk : ANIM_FPS.idle;
  c.frameTimer += dt;
  const per = 1 / fps;
  while (c.frameTimer >= per) { c.frameTimer -= per; c.frame = (c.frame + 1) % count; }
}

function updateCitizens(dt) {
  if (!citizensReady) initCitizens();
  for (const c of citizens) {
    const prevAnim = c.anim;
    if (c.state === "idle") {
      c.anim = "idle";
      c.timer -= dt;
      if (c.timer <= 0) startCitizenWalk(c);
    } else {
      stepCitizenWalk(c, dt);
    }
    advanceCitizenFrame(c, dt, prevAnim);
  }
}

/* ---------------- drawing ---------------- */

function currentCitizenSheet(c) {
  const s = citizenSheets(c.id);
  if (c.anim === "walk") return c.facing === "left" ? s.walkLeft : s.walkRight;
  return c.facing === "left" ? s.idleLeft : s.idleRight;
}

function drawCitizen(c) {
  const sheet = currentCitizenSheet(c);
  if (!sheet || !sheet.width) return;
  const size = DRAW_SIZE * zoom;
  const px = (c.fx - camX) * zoom;
  const py = (citizenCentreY(c.fy) - camY) * zoom;
  const sx = c.frame * FRAME_SIZE;
  drawShadow(px, py - size / 2 + size * SPRITE_FEET_FRACTION, size, sheet, sx);
  // Same candle circle the player and Maria carry — night only (it's a
  // no-op in daylight, see drawCharacterGlow(), js/camera.js).
  drawCharacterGlow(px, py, size, c.fx, citizenCentreY(c.fy));
  ctx.drawImage(sheet, sx, 0, FRAME_SIZE, FRAME_SIZE, px - size / 2, py - size / 2, size, size);
}

// Depth-sortable entries for renderWorldObjectsSorted() (js/camera.js).
// Outdoors only — citizens never go inside.
function citizenDrawables() {
  const out = [];
  if (player.scene !== "outside") return out;
  const viewW = view.width / zoom, viewH = view.height / zoom;
  for (const c of citizens) {
    if (c.fx < camX - DRAW_SIZE || c.fx > camX + viewW + DRAW_SIZE ||
        c.fy < camY - DRAW_SIZE || c.fy > camY + viewH + DRAW_SIZE * 2) continue; // off screen
    out.push({ sortY: citizenSortY(c), draw: () => drawCitizen(c) });
  }
  return out;
}

// Night relight — like the player and Maria, citizens keep their real
// colours after dark instead of being dragged blue-grey by the night
// washes. Returned as sortable entries so drawCharacterNightRelights()
// (js/camera.js) can relight everyone back-to-front.
function citizenRelightList() {
  const out = [];
  if (player.scene !== "outside") return out;
  const night = getRelightStrength();
  if (night <= 0.01) return out;
  const size = DRAW_SIZE * zoom;
  for (const c of citizens) {
    const sheet = currentCitizenSheet(c);
    if (!sheet || !sheet.width) continue;
    const px = (c.fx - camX) * zoom, py = (citizenCentreY(c.fy) - camY) * zoom;
    if (px < -size || py < -size || px > view.width + size || py > view.height + size) continue;
    const sortY = citizenSortY(c);
    out.push({ sortY, draw: () => drawMaskedRelight((g) => g.drawImage(sheet, c.frame * FRAME_SIZE, 0,
      FRAME_SIZE, FRAME_SIZE, px - size / 2, py - size / 2, size, size), px, py, size, sortY, night, false) });
  }
  return out;
}

// At night the player's and Maria's colours are painted back on after the
// darkening (drawMaskedRelight(), js/camera.js), cut out wherever
// something stands in front of them. A citizen in front has to be cut out
// too, or the relit player would show through them. Each frame of each
// sheet is cached as its own small canvas so the shared silhouette cache
// (getOccluderSilhouette()) can key on it.
const citizenFrameCanvasCache = new Map();
function citizenFrameCanvas(sheet, frame) {
  let perSheet = citizenFrameCanvasCache.get(sheet);
  if (!perSheet) { perSheet = []; citizenFrameCanvasCache.set(sheet, perSheet); }
  if (!perSheet[frame]) {
    const cv = document.createElement("canvas");
    cv.width = FRAME_SIZE; cv.height = FRAME_SIZE;
    cv.getContext("2d").drawImage(sheet, frame * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE, 0, 0, FRAME_SIZE, FRAME_SIZE);
    perSheet[frame] = cv;
  }
  return perSheet[frame];
}

function citizenRelightOccluders(feetY) {
  const out = [];
  if (player.scene !== "outside") return out;
  const size = DRAW_SIZE * zoom;
  for (const c of citizens) {
    if (citizenSortY(c) <= feetY) continue; // behind — nothing to cut out
    const sheet = currentCitizenSheet(c);
    if (!sheet || !sheet.width) continue;
    const px = (c.fx - camX) * zoom, py = (citizenCentreY(c.fy) - camY) * zoom;
    out.push({ icon: citizenFrameCanvas(sheet, c.frame), x: px - size / 2, y: py - size / 2, w: size, h: size, alpha: 1 });
  }
  return out;
}
