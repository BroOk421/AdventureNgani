"use strict";

/* =================================================================
   FARM ANIMALS (chicken, pig, cow, sheep x3)

   Per request ("animate mo na lagay mo na sa map random map muna gawa
   ka ng folder niyan like animals"): small groups of animals placed at
   random spots on the outdoor map, wandering around on their own.

     idle -> standing still (breathing / blinking loop) for a few seconds
     walk -> heading to a random free tile near their group's home spot

   ART: assets/animals/<id>/idle/Idle_<Dir>.png and walk/Walk_<Dir>.png,
   Dir = Down / Up / Left / Right. Each file is ONE horizontal strip of
   4 frames (same idea as the citizens' Walk.png / Idle.png). The frame
   size differs per animal, so it's read from the image itself:
   frame width = image width / 4, frame height = image height. Every
   frame has its feet 1px above the bottom edge.

   SIZE: each type has its own `scale` (world px per art px). Characters
   are drawn at 48/64 = 0.75; the animals are a bit under that so a cow
   is about 2 tiles wide and a chicken about 1. Tune ANIMAL_TYPES below.

   AVOIDING THINGS — same tools the citizens use (js/citizens.js):
   - routes from findNpcTilePath() (js/npc.js) over the shared outdoor
     blocked-tile set customerOutdoorBlocked() (js/customers.js), so
     trees, stones, houses, fences, water edges... anything `collides`.
   - the next tile is re-checked every step (something placed mid-walk
     -> re-plan), and people/other animals standing on a tile count as
     blocked when planning; someone right in front -> wait, re-plan,
     eventually give up and pick another spot.
   - the player is NOT blocked by animals (walks through, like citizens).

   DEPTH: plain feet-based Y sort against everything else in
   renderWorldObjectsSorted() (js/camera.js).

   NIGHT: they stay outside, mostly standing still (long idles), and the
   night wash darkens them like the scenery — UNTIL a light reaches them.
   Per request ("kapag tumama yung circle light sa mga animals is mag
   normal yung kulay nila pero hindi agad agad... langyan mo ng shadow din
   kapag natamaan ng light"):
   - each animal has `lit` (0..1): how much of a light it's standing in
     (the player's / Maria's / citizens' candles and lamp posts), soft
     towards the edge of each pool. It EASES toward that value
     (ANIMAL_LIGHT_EASE) instead of jumping, so colour comes back
     gradually as a light approaches and fades out as it leaves.
   - their true colours are painted back at night * lit after the night
     washes (animalRelightList(), same drawMaskedRelight() the
     characters use, so things in front still cover them).
   - inside a light they're occluders for it (animalLightOccluders(),
     collectLightOccluders(..., { withAnimals: true }), js/camera.js), so
     the light throws their shadow away from the source.

   Not saved — rolled fresh on each load, like the citizens.
================================================================= */

const ANIMAL_IDS = ["chicken", "pig", "cow", "sheep_white", "sheep_blackface", "sheep_cream"];
const ANIMAL_DIRS = ["down", "up", "left", "right"];
const ANIMAL_FRAMES = 4;

// scale: world px per art px. speed: world px/s. wander: tiles from home.
// idle: seconds standing between walks (daytime). fps: walk / idle.
const ANIMAL_TYPES = {
  chicken:         { scale: 0.60, speed: [24, 34], wander: 6, idle: [1.2, 4.5], fps: { walk: 9, idle: 4 }, space: 8 },
  pig:             { scale: 0.62, speed: [16, 23], wander: 7, idle: [2.5, 7],   fps: { walk: 7, idle: 4 }, space: 11 },
  cow:             { scale: 0.62, speed: [11, 16], wander: 8, idle: [4, 10],    fps: { walk: 6, idle: 4, eat: 4 }, space: 15, eats: true },
  sheep_white:     { scale: 0.60, speed: [13, 19], wander: 7, idle: [3, 8],     fps: { walk: 7, idle: 4, eat: 4 }, space: 12, eats: true },
  sheep_blackface: { scale: 0.60, speed: [13, 19], wander: 7, idle: [3, 8],     fps: { walk: 7, idle: 4, eat: 4 }, space: 12, eats: true },
  sheep_cream:     { scale: 0.60, speed: [13, 19], wander: 7, idle: [3, 8],     fps: { walk: 7, idle: 4, eat: 4 }, space: 12, eats: true },
};

// Groups spawned at random spots: each group shares one home spot.
const ANIMAL_GROUPS = [
  ["chicken", "chicken", "chicken", "chicken", "chicken"],
  ["pig", "pig", "pig"],
  ["cow", "cow"],
  ["sheep_white", "sheep_white", "sheep_blackface", "sheep_cream"],
];
const ANIMAL_SPAWN_MIN_TILES = 8;   // group home spots: this far from the player at least...
const ANIMAL_SPAWN_MAX_TILES = 30;  // ...and at most this far
const ANIMAL_GROUP_SPREAD_TILES = 3;
const ANIMAL_NIGHT_IDLE = [10, 25];
// Grazing (per request: cows and sheep "kumakain", head down chewing, no
// grass drawn): when one of them stops walking in the daytime, this is
// the chance it spends that stop eating (eat/ strip) instead of standing.
const ANIMAL_EAT_CHANCE = 0.55;
const ANIMAL_EAT_TIME = [5, 12]; // seconds spent grazing (instead of the normal idle time)
const ANIMAL_WAIT_BEFORE_REPLAN = 0.7;
const ANIMAL_GIVE_UP_SECONDS = 4;
const ANIMAL_REPLAN_SECONDS = 6;

// Night relight: how fast `lit` follows the light (per second, exponential
// ease — ~1s to get most of the way), and where in a light's radius the
// colour is fully back (inner) / gone (outer), as fractions of the radius.
const ANIMAL_LIGHT_EASE = 2.2;
const ANIMAL_LIGHT_INNER = 0.45, ANIMAL_LIGHT_OUTER = 1.0;

// Dot colours on the minimap and the full world map (js/hud.js).
const ANIMAL_MAP_COLORS = {
  chicken: "#fff6dc", pig: "#ff9fb6", cow: "#c8b8a8",
  sheep_white: "#f1ece2", sheep_blackface: "#f1ece2", sheep_cream: "#f2e2c2",
};

const animals = [];
let animalsReady = false;

const animalRand = (a, b) => a + Math.random() * (b - a);
const animalTileOf = (x, y) => ({ col: Math.floor(x / TILE), row: Math.floor(y / TILE) });
const animalTileCentre = (col, row) => ({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE });

function animalSheet(id, kind, dir) {
  return assets["animal_" + id + "_" + kind + "_" + dir];
}

/* ---------------- where things are ---------------- */

function animalBlocked() {
  return customerOutdoorBlocked(); // js/customers.js — shared, rebuilt at most once a second
}

function isAnimalTileFree(col, row, blocked) {
  if (col < 1 || row < 1 || col > COLS - 2 || row > ROWS - 2) return false;
  return !blocked.has(col + "," + row);
}

function pickAnimalTileNear(cx, cy, minTiles, maxTiles, blocked, avoid) {
  const c0 = animalTileOf(cx, cy);
  for (let i = 0; i < 60; i++) {
    const ang = Math.random() * Math.PI * 2;
    const d = animalRand(minTiles, maxTiles);
    const col = Math.round(c0.col + Math.cos(ang) * d);
    const row = Math.round(c0.row + Math.sin(ang) * d);
    if (!isAnimalTileFree(col, row, blocked)) continue;
    if (avoid && avoid.has(col + "," + row)) continue;
    return { col, row };
  }
  return null;
}

// Feet of everyone else outside: player, Maria, customers, citizens, other animals.
function animalOthers(self) {
  const out = [];
  if (player.scene === "outside" && !player.sleeping) {
    out.push({ x: player.x, y: player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE });
  }
  if (typeof npc !== "undefined" && npc.scene === "outside") {
    out.push({ x: npc.x, y: npc.y + (SPRITE_FEET_FRACTION - 0.5) * NPC_DRAW_SIZE });
  }
  if (typeof customers !== "undefined") {
    for (const cu of customers) if (cu.scene === "outside" && cu.state !== "away") out.push({ x: cu.fx, y: cu.fy });
  }
  if (typeof citizens !== "undefined") {
    for (const c of citizens) if (c.scene === "outside") out.push({ x: c.fx, y: c.fy });
  }
  for (const a of animals) if (a !== self) out.push({ x: a.fx, y: a.fy, animal: a });
  return out;
}

/* ---------------- setup ---------------- */

function initAnimals() {
  animalsReady = true;
  const blocked = animalBlocked();
  const centre = { x: player.x, y: player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE };
  const taken = new Set();
  const pt = animalTileOf(centre.x, centre.y);
  taken.add(pt.col + "," + pt.row);
  const homes = [];
  for (const group of ANIMAL_GROUPS) {
    // A random home spot, kept apart from the other groups' spots.
    let home = null;
    for (let tries = 0; tries < 20 && !home; tries++) {
      const t = pickAnimalTileNear(centre.x, centre.y, ANIMAL_SPAWN_MIN_TILES, ANIMAL_SPAWN_MAX_TILES, blocked, taken);
      if (!t) continue;
      if (homes.some((h) => Math.abs(h.col - t.col) + Math.abs(h.row - t.row) < 8)) continue;
      home = t;
    }
    if (!home) home = pickAnimalTileNear(centre.x, centre.y, 2, 45, blocked, taken) || pt;
    homes.push(home);
    const hc = animalTileCentre(home.col, home.row);
    for (const id of group) {
      const def = ANIMAL_TYPES[id];
      const spot = pickAnimalTileNear(hc.x, hc.y, 0, ANIMAL_GROUP_SPREAD_TILES, blocked, taken) || home;
      taken.add(spot.col + "," + spot.row);
      const p = animalTileCentre(spot.col, spot.row);
      animals.push({
        id, def,
        home: { col: home.col, row: home.row },
        fx: p.x, fy: p.y, // FEET position, world px
        facing: ANIMAL_DIRS[Math.floor(Math.random() * 4)],
        anim: "idle", frame: Math.floor(Math.random() * ANIMAL_FRAMES), frameTimer: Math.random() * 0.25,
        speed: animalRand(def.speed[0], def.speed[1]),
        state: "idle", timer: animalRand(0.3, def.idle[1]), eating: !!def.eats && Math.random() < ANIMAL_EAT_CHANCE,
        path: null, pathIdx: 0, goal: null,
        waitT: 0, stuckT: 0, replanT: 0,
        lit: 0, // 0..1, how much light reaches them right now (eased)
      });
    }
  }
}

/* ---------------- walking ---------------- */

function planAnimalPath(a, avoidPeople) {
  const blocked = animalBlocked();
  const s = animalTileOf(a.fx, a.fy), g = a.goal;
  const people = new Set();
  if (avoidPeople) {
    for (const f of animalOthers(a)) {
      const t = animalTileOf(f.x, f.y);
      people.add(t.col + "," + t.row);
    }
    people.delete(s.col + "," + s.row);
  }
  const bounds = {
    minCol: Math.max(0, Math.min(s.col, g.col) - NPC_PATH_MARGIN_TILES),
    maxCol: Math.min(COLS - 1, Math.max(s.col, g.col) + NPC_PATH_MARGIN_TILES),
    minRow: Math.max(0, Math.min(s.row, g.row) - NPC_PATH_MARGIN_TILES),
    maxRow: Math.min(ROWS - 1, Math.max(s.row, g.row) + NPC_PATH_MARGIN_TILES),
  };
  const tiles = findNpcTilePath(s.col, s.row, g.col, g.row,
    (col, row) => blocked.has(col + "," + row) || people.has(col + "," + row), bounds);
  // First leg back to the centre of the current tile, so every leg after
  // it runs along tile centres and never clips a solid corner.
  const pts = [animalTileCentre(s.col, s.row)];
  if (tiles) for (const t of simplifyNpcTilePath(tiles)) pts.push(animalTileCentre(t.col, t.row));
  a.path = pts;
  a.pathIdx = 0;
  a.replanT = 0;
  return !!(tiles && tiles.length);
}

function animalIdleTime(a) {
  const isDay = typeof isDaytime === "function" ? isDaytime() : true;
  const r = isDay ? a.def.idle : ANIMAL_NIGHT_IDLE;
  return animalRand(r[0], r[1]);
}

function startAnimalWalk(a) {
  const blocked = animalBlocked();
  const home = animalTileCentre(a.home.col, a.home.row);
  const here = animalTileOf(a.fx, a.fy);
  let target = null;
  for (let tries = 0; tries < 6 && !target; tries++) {
    const t = pickAnimalTileNear(home.x, home.y, 0, a.def.wander, blocked, null);
    if (!t) continue;
    if (Math.abs(t.col - here.col) + Math.abs(t.row - here.row) < 2) continue;
    target = t;
  }
  if (!target) { a.state = "idle"; beginAnimalRest(a); return; }
  a.goal = target;
  a.state = "walk";
  a.eating = false;
  a.waitT = 0; a.stuckT = 0;
  planAnimalPath(a, true);
}

// Decide what a stop looks like: grazing or just standing.
function beginAnimalRest(a) {
  const isDay = typeof isDaytime === "function" ? isDaytime() : true;
  a.eating = !!a.def.eats && isDay && Math.random() < ANIMAL_EAT_CHANCE;
  a.timer = a.eating ? animalRand(ANIMAL_EAT_TIME[0], ANIMAL_EAT_TIME[1]) : animalIdleTime(a);
}

function stopAnimalWalk(a) {
  a.state = "idle";
  a.anim = "idle";
  beginAnimalRest(a);
  a.path = null;
  a.goal = null;
}

function animalPersonAhead(a, dirX, dirY) {
  for (const f of animalOthers(a)) {
    const ox = f.x - a.fx, oy = f.y - a.fy;
    const d = Math.hypot(ox, oy);
    if (d > a.def.space || d < 0.001) continue;
    if (ox * dirX + oy * dirY > 0) return f;
  }
  return null;
}

function stepAnimalWalk(a, dt) {
  a.replanT += dt;
  if (a.replanT > ANIMAL_REPLAN_SECONDS) planAnimalPath(a, true);

  if (!a.path || a.pathIdx >= a.path.length) { stopAnimalWalk(a); return; }
  const wp = a.path[a.pathIdx];
  const dx = wp.x - a.fx, dy = wp.y - a.fy;
  const d = Math.hypot(dx, dy);
  if (d < 0.01) {
    a.pathIdx++;
    if (a.pathIdx >= a.path.length) stopAnimalWalk(a);
    return;
  }
  const ux = dx / d, uy = dy / d;
  const step = Math.min(d, a.speed * dt);
  const nx = a.fx + ux * step, ny = a.fy + uy * step;

  // Something solid placed on the way?
  const blocked = animalBlocked();
  const here = animalTileOf(a.fx, a.fy), next = animalTileOf(nx, ny);
  if ((next.col !== here.col || next.row !== here.row) && blocked.has(next.col + "," + next.row)) {
    if (!planAnimalPath(a, false)) stopAnimalWalk(a);
    return;
  }

  // Someone in the way — wait, then go around, then give up.
  const blocker = animalPersonAhead(a, ux, uy);
  if (blocker) {
    a.anim = "idle";
    a.waitT += dt;
    a.stuckT += dt;
    if (a.stuckT > ANIMAL_GIVE_UP_SECONDS) { stopAnimalWalk(a); return; }
    if (a.waitT > ANIMAL_WAIT_BEFORE_REPLAN) {
      a.waitT = 0;
      // Two animals nose to nose: only the later one in the list steps aside.
      const yields = !(blocker.animal && animals.indexOf(a) < animals.indexOf(blocker.animal) && blocker.animal.state === "walk");
      if (yields) planAnimalPath(a, true);
    }
    return;
  }
  a.waitT = 0;
  a.stuckT = Math.max(0, a.stuckT - dt * 0.25);

  a.fx = nx; a.fy = ny;
  // Face the way they're mostly going (4 directions).
  if (Math.abs(ux) >= Math.abs(uy)) a.facing = ux > 0 ? "right" : "left";
  else a.facing = uy > 0 ? "down" : "up";
  a.anim = "walk";
  if (step >= d - 0.001) {
    a.pathIdx++;
    if (a.pathIdx >= a.path.length) stopAnimalWalk(a);
  }
}

function advanceAnimalFrame(a, dt, prevAnim) {
  if (a.anim !== prevAnim) { a.frame = 0; a.frameTimer = 0; }
  const fps = a.def.fps[a.anim] || a.def.fps.idle;
  a.frameTimer += dt;
  const per = 1 / fps;
  while (a.frameTimer >= per) { a.frameTimer -= per; a.frame = (a.frame + 1) % ANIMAL_FRAMES; }
}

/* ---------------- lights ---------------- */

// Every light outdoors right now, as { x, y, r } in world px: the candles
// the player, Maria and the citizens carry (drawCharacterGlow(), centred
// on the sprite, radius = sprite size * PLAYER_GLOW_RADIUS_SCALE) and the
// lamp posts' pools (drawPostLightGlows(), js/camera.js).
function animalLightSources() {
  const out = [];
  if (getNightLightFactor() <= 0.02) return out;
  if (player.scene === "outside" && !player.sleeping) {
    out.push({ x: player.x, y: player.y, r: DRAW_SIZE * PLAYER_GLOW_RADIUS_SCALE });
  }
  if (typeof npc !== "undefined" && npc.scene === "outside") {
    out.push({ x: npc.x, y: npc.y, r: NPC_DRAW_SIZE * PLAYER_GLOW_RADIUS_SCALE });
  }
  if (typeof citizens !== "undefined") {
    for (const c of citizens) {
      if (c.scene === "outside") out.push({ x: c.fx, y: citizenCentreY(c.fy), r: DRAW_SIZE * PLAYER_GLOW_RADIUS_SCALE });
    }
  }
  for (const L of animalLampList()) out.push(L);
  return out;
}

// The lamp posts' pools — the whole object layer is only walked once a
// second for these (lamps don't move), not every frame.
let animalLampCache = null, animalLampCacheAt = 0;
function animalLampList() {
  const now = Date.now();
  if (animalLampCache && now - animalLampCacheAt < 1000) return animalLampCache;
  const out = [];
  for (const [key, type] of objectLayer) {
    const def = itemDefs[type];
    if (!def || !def.lightGlow) continue;
    const comma = key.indexOf(",");
    const col = +key.slice(0, comma), row = +key.slice(comma + 1);
    const lg = def.lightGlow;
    out.push({
      x: (col + 0.5) * TILE + lg.offsetX,
      y: (row + 1) * TILE + (lg.groundOffsetY !== undefined ? lg.groundOffsetY : lg.offsetY),
      r: POST_GLOW_WORLD_SIZE * 0.45,
    });
  }
  animalLampCache = out; animalLampCacheAt = now;
  return out;
}

// 0..1: how lit this animal's body is by the brightest light reaching it.
function animalLightTarget(a, lights) {
  if (!lights.length) return 0;
  const sheet = animalSheet(a.id, a.anim, a.facing);
  const h = sheet && sheet.height ? sheet.height * a.def.scale : 16;
  const bx = a.fx, by = a.fy - h / 2; // middle of the body
  let best = 0;
  for (const L of lights) {
    const d = Math.hypot(bx - L.x, by - L.y) / L.r;
    if (d >= ANIMAL_LIGHT_OUTER) continue;
    let t = d <= ANIMAL_LIGHT_INNER ? 1 : 1 - (d - ANIMAL_LIGHT_INNER) / (ANIMAL_LIGHT_OUTER - ANIMAL_LIGHT_INNER);
    t = t * t * (3 - 2 * t); // smoothstep — a soft edge, no visible ring
    if (t > best) best = t;
  }
  return best;
}

function updateAnimals(dt) {
  if (!animalsReady) initAnimals();
  const lights = animalLightSources();
  const ease = 1 - Math.exp(-ANIMAL_LIGHT_EASE * dt);
  for (const a of animals) {
    a.lit += (animalLightTarget(a, lights) - a.lit) * ease;
    if (a.lit < 0.001) a.lit = 0;
    const prevAnim = a.anim;
    if (a.state === "idle") {
      a.anim = a.eating ? "eat" : "idle";
      a.timer -= dt;
      if (a.timer <= 0) startAnimalWalk(a);
    } else {
      stepAnimalWalk(a, dt);
    }
    advanceAnimalFrame(a, dt, prevAnim);
  }
}

/* ---------------- drawing ---------------- */

// Where an animal lands on screen this frame (or null if its art isn't loaded).
function animalScreenBox(a) {
  const sheet = animalSheet(a.id, a.anim, a.facing);
  if (!sheet || !sheet.width) return null;
  const fw = Math.floor(sheet.width / ANIMAL_FRAMES), fh = sheet.height;
  const s = a.def.scale * zoom;
  const w = fw * s, h = fh * s;
  const px = (a.fx - camX) * zoom;
  const feetY = (a.fy - camY) * zoom;
  // Feet sit 1 art px above the frame's bottom edge.
  return { sheet, fw, fh, sx: a.frame * fw, w, h, px, feetY, x: px - w / 2, y: feetY - h + s };
}

// Sun-driven shadow from the sprite's own silhouette, same look as the
// characters' drawShadow() (js/camera.js), sized to this frame. Uses the
// same cached, pre-blurred silhouettes (cachedSoftSilhouette()) — no
// per-frame canvas filter.
function drawAnimalShadow(b) {
  if (player.scene === "inside") return;
  const { alpha, skew, squashY } = getShadowParams();
  if (alpha <= 0.01) return;
  const sil = cachedSoftSilhouette(b.sheet, b.sx, b.fw, b.fh, 1);
  const pad = SOFT_SIL_PAD * (b.w / b.fw);
  ctx.save();
  ctx.translate(b.px, b.feetY);
  ctx.transform(1, 0, skew, -squashY, 0, 0);
  ctx.globalAlpha = 0.32 * alpha;
  ctx.drawImage(sil, -b.w / 2 - pad, -b.h - pad, b.w + pad * 2, b.h + pad * 2);
  ctx.restore();
}

function drawAnimal(a) {
  const b = animalScreenBox(a);
  if (!b) return;
  drawAnimalShadow(b);
  ctx.drawImage(b.sheet, b.sx, 0, b.fw, b.fh, b.x, b.y, b.w, b.h);
}

// Depth-sortable entries for renderWorldObjectsSorted() (js/camera.js).
function animalDrawables() {
  const out = [];
  if (player.scene !== "outside") return out;
  const viewW = view.width / zoom, viewH = view.height / zoom;
  const pad = 64;
  for (const a of animals) {
    if (a.fx < camX - pad || a.fx > camX + viewW + pad || a.fy < camY - pad || a.fy > camY + viewH + pad) continue;
    out.push({ sortY: a.fy, animal: true, draw: () => drawAnimal(a) }); // `animal`: compared feet-to-feet with characters (drawableOrder(), js/camera.js)
  }
  return out;
}

// At night the player/Maria/citizens are relit after the darkening and
// cut out wherever something stands in front of them (relightOccluders(),
// js/camera.js). An animal in front has to be cut out too, or the relit
// player would show through it.
const animalFrameCanvasCache = new Map();
function animalFrameCanvas(sheet, sx, fw, fh) {
  let perSheet = animalFrameCanvasCache.get(sheet);
  if (!perSheet) { perSheet = new Map(); animalFrameCanvasCache.set(sheet, perSheet); }
  let cv = perSheet.get(sx);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = fw; cv.height = fh;
    cv.getContext("2d").drawImage(sheet, sx, 0, fw, fh, 0, 0, fw, fh);
    cv.lightSig = sheet.src + "#" + sx; // for the lamps' shadow cache signature (getShadowedPostGlow())
    perSheet.set(sx, cv);
  }
  return cv;
}

function animalRelightOccluders(feetY) {
  const out = [];
  if (player.scene !== "outside") return out;
  for (const a of animals) {
    if (a.fy <= feetY + CHARACTER_VISIBLE_FEET_EXTRA) continue; // behind the character's visible feet — nothing to cut out (drawableOrder(), js/camera.js)
    const b = animalScreenBox(a);
    if (!b) continue;
    if (b.x > view.width || b.y > view.height || b.x + b.w < 0 || b.y + b.h < 0) continue;
    out.push({ icon: animalFrameCanvas(b.sheet, b.sx, b.fw, b.fh), x: b.x, y: b.y, w: b.w, h: b.h, alpha: 1 });
  }
  return out;
}

// Animals standing in a light, as occluders for collectLightOccluders()
// (js/camera.js) — in WORLD px like every other occluder. Skips an animal
// the light is sitting inside of (its "shadow" would swallow the pool).
function animalLightOccluders(minX, minY, maxX, maxY, lx, ly) {
  const out = [];
  for (const a of animals) {
    const sheet = animalSheet(a.id, a.anim, a.facing);
    if (!sheet || !sheet.width) continue;
    const fw = Math.floor(sheet.width / ANIMAL_FRAMES), fh = sheet.height;
    const s = a.def.scale, w = fw * s, h = fh * s;
    const x = a.fx - w / 2, y = a.fy - h + s;
    if (x + w < minX || x > maxX || y + h < minY || y > maxY) continue;
    if (lx >= x && lx <= x + w && ly >= y && ly <= y + h) continue;
    out.push({ icon: animalFrameCanvas(sheet, a.frame * fw, fw, fh), x, y, w, h });
  }
  return out;
}

// Their true colours painted back at night, as much as a light reaches
// them — sortable entries for drawCharacterNightRelights() (js/camera.js).
function animalRelightList() {
  const out = [];
  if (player.scene !== "outside") return out;
  const night = getRelightStrength();
  if (night <= 0.01) return out;
  for (const a of animals) {
    if (a.lit <= 0.01) continue;
    const b = animalScreenBox(a);
    if (!b) continue;
    if (b.x > view.width || b.y > view.height || b.x + b.w < 0 || b.y + b.h < 0) continue;
    const size = Math.max(b.w, b.h);
    out.push({
      sortY: a.fy,
      draw: () => drawMaskedRelight((g) => g.drawImage(b.sheet, b.sx, 0, b.fw, b.fh, b.x, b.y, b.w, b.h),
        b.px, b.y + b.h / 2, size, a.fy, night * a.lit, false),
    });
  }
  return out;
}
