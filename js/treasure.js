"use strict";

/* =================================================================
   TREASURE — glowing crystals and HIDDEN chests in the caves.

   Per request ("lagyan mo din sa loob ng crystals meron jan na crystal na
   object tapos chest ... na oopen meron laman na iba ibang gamit na loot
   sword, iron, gold ... pero mahirap makahanap nun dapat di agad agad
   nakikita"):
   - Every cave (the old caves, the tunnel, all ten mine levels) and the
     Crystal Ridge world (east2) get clusters of blue crystals (the
     pcRocks22-24 art) that glow, and 1-3 treasure chests.
   - Chests are tucked into the far ends of the map, among the crystals,
     and are INVISIBLE until you're close (TREASURE_REVEAL). A little
     closer than TREASURE_HINT you may catch a faint glint now and then —
     that's the only clue.
   - E (or click) next to a revealed chest opens it: gold plus 2-4 random
     things — potions, crystal shards, Iron/Gold Ingots, and now and then
     a sword, bow or piece of armour, better the deeper you are.
   - Opened chests stay open; once every chest of a place is opened, a
     fresh set is hidden in NEW spots after TREASURE_REFILL_MS.
   Layout is seeded per place (+ refill count), so a chest doesn't move
   between visits. Crystals and chests are solid (the collision
   functions are wrapped below), and placing them never cuts a path off:
   every crystal is checked against a flood fill from the entrance.
   Art: tools/treasure_art.py (chest), the Pixel Crawler crystals.
================================================================= */

const TREASURE_REVEAL = 2.2 * TILE;        // world px (feet to chest) — fully visible inside this
const TREASURE_FADE = 1.2 * TILE;          // ...fading in over this much further out
const TREASURE_HINT = 4.5 * TILE;          // a faint glint from up to here
const CHEST_OPEN_RANGE = 1.7 * TILE;
const TREASURE_REFILL_MS = 30 * 60 * 1000; // a place's chests come back (elsewhere) 30 min after the last is opened
const CRYSTAL_TYPES = ["pcRocks22", "pcRocks23", "pcRocks24"]; // tall / small / small blue crystals
const TREASURE_WORLDS = { east2: { level: 9, chests: 3, clusters: 16 } }; // Crystal Ridge
const TREASURE_FEET_OFF = (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;

assets.chestClosed = new Image(); assets.chestClosed.src = "assets/treasure/chest_closed.png";
assets.chestOpen = new Image(); assets.chestOpen.src = "assets/treasure/chest_open.png";
for (const t of CRYSTAL_TYPES) if (!assets["crystal_" + t]) { assets["crystal_" + t] = new Image(); assets["crystal_" + t].src = "assets/pixelcrawler/props/" + t + ".png"; }

// player.treasure = { zones: { [zoneKey]: { gen, opened: { [i]: timeMs } } } } — saved
function treasureState(key) {
  if (!player.treasure || typeof player.treasure !== "object") player.treasure = { zones: {} };
  if (!player.treasure.zones) player.treasure.zones = {};
  let z = player.treasure.zones[key];
  if (!z) z = player.treasure.zones[key] = { gen: 0, opened: {} };
  if (!z.opened) z.opened = {};
  return z;
}

/* ---------------- where we are ---------------- */
function treasureZone() {
  if (player.scene === "inside") {
    const room = INTERIOR_ROOMS[player.activeRoomId];
    if (!room || !room.custom || room.custom.floor !== "cave") return null;
    const L = TOWN_ART.caveLayouts && TOWN_ART.caveLayouts[room.blueprintId];
    if (!L || !L.tiles) return null;
    return { key: "room:" + room.blueprintId, kind: "room", room, layout: L, level: L.depth || 2 };
  }
  if (player.scene === "outside" && typeof currentWorld !== "undefined" && TREASURE_WORLDS[currentWorld] && typeof WORLD_DEFS !== "undefined" && WORLD_DEFS[currentWorld]) {
    return { key: "world:" + currentWorld, kind: "world", world: currentWorld, def: WORLD_DEFS[currentWorld], level: TREASURE_WORLDS[currentWorld].level };
  }
  return null;
}

/* ---------------- seeded layout ---------------- */
function treasureHash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function treasureRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let treasureGenerating = false;
let treasureLayout = null; // { key, gen, crystals: [...], chests: [...], blockers: Map }

function buildTreasureLayout(zone, gen) {
  treasureGenerating = true; // the collision wrappers below ignore our own pieces while we measure
  try {
    const rnd = treasureRng(treasureHash(zone.key) + gen * 7919);
    const walk = new Set(); // walkable "c,r"
    const floor = new Set(); // every floor tile (rooms) — a piece never stands in the row right under the back wall, whose art hangs over it
    let start = null, avoid = [], cols = 0, rows = 0;
    const free = (c, r) => zone.kind === "room"
      ? !isInteriorBodyBlockedAt(zone.room, (c + 0.5) * TILE, (r + 0.6) * TILE - TREASURE_FEET_OFF)
      : !isBodyBlockedAt((c + 0.5) * TILE, (r + 0.6) * TILE - TREASURE_FEET_OFF);
    if (zone.kind === "room") {
      const L = zone.layout;
      for (const k of L.tiles) { const [c, r] = k.split(",").map(Number); floor.add(c + "," + r); if (free(c, r)) walk.add(c + "," + r); }
      if (L.door) avoid.push([L.door[0], L.door[1]]);
      for (const at of Object.values(L.links || {})) avoid.push([at.col, at.row]);
      if (L.far) avoid.push([L.far.col, L.far.row + 1]); // the boss's spot in the deepest level
      start = avoid[0] || null;
    } else {
      const D = zone.def;
      cols = D.cols; rows = D.rows;
      for (let r = 2; r < rows - 2; r++) for (let c = 2; c < cols - 2; c++) {
        const k = c + "," + r;
        const g = groundOverlayLayer.get(k) || groundLayer.get(k) || "";
        if (g.startsWith("terrainMountain")) continue;
        if (free(c, r)) walk.add(k);
      }
      for (const s of [D.spawnWest, D.spawnEast]) if (s) avoid.push(s);
      for (const p of D.passes || []) if (p && p.spawn) avoid.push(p.spawn);
      start = avoid[0] || null;
    }
    if (!walk.size) return { key: zone.key, gen, crystals: [], chests: [], blockers: new Map() };
    // flood fill from the entrance (nearest walkable tile to it)
    const parse = (k) => k.split(",").map(Number);
    let startKey = null, bd = 1e9;
    for (const k of walk) {
      const [c, r] = parse(k);
      const d = start ? Math.hypot(c - start[0], r - start[1]) : 0;
      if (d < bd) { bd = d; startKey = k; }
    }
    const flood = (blocked) => {
      const dist = new Map([[startKey, 0]]);
      const q = [startKey];
      for (let i = 0; i < q.length; i++) {
        const [c, r] = parse(q[i]), d0 = dist.get(q[i]);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = (c + dc) + "," + (r + dr);
          if (!walk.has(k) || blocked.has(k) || dist.has(k)) continue;
          dist.set(k, d0 + 1); q.push(k);
        }
      }
      return dist;
    };
    const blocked = new Set();
    const dist0 = flood(blocked);
    const reach = [...dist0.keys()];
    const maxD = Math.max(1, ...dist0.values());
    const nearAvoid = (c, r, n) => avoid.some(([ac, ar]) => Math.hypot(c - ac, r - ar) < n);
    const underWall = (c, r) => zone.kind === "room" && (!floor.has(c + "," + (r - 1)) || !floor.has(c + "," + (r - 2)) ||
      !floor.has((c - 1) + "," + r) || !floor.has((c + 1) + "," + r) || !floor.has(c + "," + (r + 1))); // the wall art overlaps the edge tiles
    const wallSides = (c, r) => [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dc, dr]) => !walk.has((c + dc) + "," + (r + dr))).length; // a wall within 2 tiles

    // chests: far from the way in, against a wall, apart from each other
    const nChests = zone.kind === "world" ? TREASURE_WORLDS[zone.world].chests : (zone.level >= 6 ? 2 : 1);
    const cand = reach.filter((k) => {
      const [c, r] = parse(k);
      return dist0.get(k) >= maxD * 0.55 && !nearAvoid(c, r, 6) && wallSides(c, r) >= 1 && !underWall(c, r);
    });
    const chests = [];
    for (let tries = 0; chests.length < nChests && tries < 400 && cand.length; tries++) {
      const k = cand[Math.floor(rnd() * cand.length)];
      const [c, r] = parse(k);
      if (chests.some((h) => Math.hypot(h.col - c, h.row - r) < (zone.kind === "world" ? 18 : 9))) continue;
      chests.push({ col: c, row: r, i: chests.length });
      blocked.add(k);
    }
    // crystals: a cluster round each chest (it hides among them) + clusters along the walls
    const crystals = [];
    const tryCrystal = (c, r) => {
      const k = c + "," + r;
      if (!walk.has(k) || blocked.has(k) || !dist0.has(k) || nearAvoid(c, r, 3) || underWall(c, r)) return false;
      if (crystals.some((x) => x.col === c && x.row === r)) return false;
      // never cut anything off: everything reachable before stays reachable (minus this tile)
      blocked.add(k);
      const d = flood(blocked);
      const reachable = reach.filter((rk) => !blocked.has(rk));
      if (reachable.some((rk) => !d.has(rk))) { blocked.delete(k); return false; }
      const big = rnd() < 0.3;
      crystals.push({ col: c, row: r, type: big ? CRYSTAL_TYPES[0] : CRYSTAL_TYPES[1 + Math.floor(rnd() * 2)],
        x: (c + 0.5) * TILE + (rnd() * 6 - 3), y: (r + 1) * TILE - 3 - rnd() * 3, tw: rnd() * Math.PI * 2 });
      return true;
    };
    const ring = (c0, r0, n, rad) => {
      for (let t = 0, placed = 0; placed < n && t < 30; t++) {
        const c = c0 + Math.round((rnd() * 2 - 1) * rad), r = r0 + Math.round((rnd() * 2 - 1) * rad);
        if ((c !== c0 || r !== r0) && tryCrystal(c, r)) placed++;
      }
    };
    for (const h of chests) ring(h.col, h.row, 3 + Math.floor(rnd() * 2), 2);
    const nClusters = zone.kind === "world" ? TREASURE_WORLDS[zone.world].clusters : Math.max(3, Math.min(8, Math.round(reach.length / 140)));
    const wallTiles = reach.filter((k) => { const [c, r] = parse(k); return wallSides(c, r) >= 1 && !nearAvoid(c, r, 4); });
    for (let n = 0, t = 0; n < nClusters && t < nClusters * 6 && wallTiles.length; t++) {
      const [c, r] = parse(wallTiles[Math.floor(rnd() * wallTiles.length)]);
      if (crystals.some((x) => Math.hypot(x.col - c, x.row - r) < 5)) continue;
      if (tryCrystal(c, r)) { ring(c, r, 1 + Math.floor(rnd() * 3), 1); n++; }
    }
    for (const h of chests) { h.x = (h.col + 0.5) * TILE; h.y = (h.row + 1) * TILE - 2; h.vis = 0; h.glint = rnd() * 3; }
    // tile -> pieces, for the collision wrappers
    const blockers = new Map();
    const addB = (o) => { const k = o.col + "," + o.row; (blockers.get(k) || blockers.set(k, []).get(k)).push(o); };
    crystals.forEach(addB); chests.forEach(addB);
    return { key: zone.key, gen, crystals, chests, blockers };
  } finally {
    treasureGenerating = false;
  }
}

function currentTreasure() {
  const zone = treasureZone();
  if (!zone) return null;
  const st = treasureState(zone.key);
  // every chest opened and long enough ago: a fresh set, hidden somewhere new
  if (treasureLayout && treasureLayout.key === zone.key && treasureLayout.chests.length &&
      treasureLayout.chests.every((h) => st.opened[h.i])) {
    const last = Math.max(...treasureLayout.chests.map((h) => st.opened[h.i]));
    if (Date.now() - last > TREASURE_REFILL_MS) { st.gen = (st.gen || 0) + 1; st.opened = {}; st.loot = {}; if (typeof saveGame === "function") saveGame(); }
  }
  if (!treasureLayout || treasureLayout.key !== zone.key || treasureLayout.gen !== (st.gen || 0)) {
    // the outdoor world must be loaded first (switchWorld fills the layers)
    if (zone.kind === "world" && !groundLayer.size && !objectLayer.size) return null;
    treasureLayout = buildTreasureLayout(zone, st.gen || 0);
  }
  treasureLayout.zone = zone; treasureLayout.st = st;
  return treasureLayout;
}

/* ---------------- collision ---------------- */
function treasureBlocksFeet(x, feetY) {
  const T = treasureLayout;
  if (!T || treasureGenerating) return false;
  const c0 = Math.floor(x / TILE), r0 = Math.floor(feetY / TILE);
  for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
    const list = T.blockers.get(c + "," + r);
    if (!list) continue;
    for (const o of list) {
      const hw = o.type ? 4 : 8, top = o.type ? 4 : 7; // crystal base / chest box
      if (x + BODY_COLLISION_HALF_W > o.x - hw && x - BODY_COLLISION_HALF_W < o.x + hw && feetY > o.y - top && feetY < o.y + 2) return true;
    }
  }
  return false;
}
{
  const inBase = isInteriorBodyBlockedAt;
  isInteriorBodyBlockedAt = function (room, x, y) {
    if (inBase.apply(this, arguments)) return true;
    const T = treasureLayout;
    if (!T || treasureGenerating || !room || T.key !== "room:" + room.blueprintId || player.scene !== "inside") return false;
    return treasureBlocksFeet(x, y + TREASURE_FEET_OFF);
  };
  const outBase = isBodyBlockedAt;
  isBodyBlockedAt = function (x, y) {
    if (outBase.apply(this, arguments)) return true;
    const T = treasureLayout;
    if (!T || treasureGenerating || player.scene !== "outside" || typeof currentWorld === "undefined" || T.key !== "world:" + currentWorld) return false;
    return treasureBlocksFeet(x, y + TREASURE_FEET_OFF);
  };
}

/* ---------------- drawing ---------------- */
function treasurePlayerFeet() { return { x: player.x, y: player.y + TREASURE_FEET_OFF }; }
let treasureLastT = performance.now();
function treasureDrawables() {
  const T = currentTreasure();
  if (!T) return [];
  const now = performance.now(), dt = Math.min(0.1, (now - treasureLastT) / 1000);
  treasureLastT = now;
  const p = treasurePlayerFeet();
  const vw = view.width / zoom, vh = view.height / zoom;
  const onScreen = (x, y) => x > camX - 40 && x < camX + vw + 40 && y > camY - 40 && y < camY + vh + 60;
  const out = [];
  for (const o of T.crystals) {
    if (!onScreen(o.x, o.y)) continue;
    out.push({ sortY: o.y - (typeof CHARACTER_VISIBLE_FEET_EXTRA !== "undefined" ? CHARACTER_VISIBLE_FEET_EXTRA : 0), draw: () => drawCrystal(o) });
  }
  for (const h of T.chests) {
    const opened = !!T.st.opened[h.i];
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    const target = opened ? 1 : d <= TREASURE_REVEAL ? 1 : d >= TREASURE_REVEAL + TREASURE_FADE ? 0 : 1 - (d - TREASURE_REVEAL) / TREASURE_FADE;
    h.vis += (target - h.vis) * (1 - Math.exp(-6 * dt));
    if (h.vis < 0.02 || !onScreen(h.x, h.y)) continue;
    out.push({ sortY: h.y - (typeof CHARACTER_VISIBLE_FEET_EXTRA !== "undefined" ? CHARACTER_VISIBLE_FEET_EXTRA : 0), draw: () => drawChest(h, opened) });
  }
  return out;
}
function drawCrystal(o) {
  const icon = assets["crystal_" + o.type];
  if (!icon || !icon.width) return;
  const x = Math.round((o.x - camX) * zoom - icon.width * zoom / 2), y = Math.round((o.y - camY) * zoom - icon.height * zoom);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // a soft dark foot so it stands on the floor
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse((o.x - camX) * zoom, (o.y - camY) * zoom, icon.width * zoom * 0.45, 2 * zoom, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(icon, x, y, icon.width * zoom, icon.height * zoom);
  ctx.restore();
}
function drawChest(h, opened) {
  const icon = opened ? assets.chestOpen : assets.chestClosed;
  if (!icon || !icon.width) return;
  const x = Math.round((h.x - camX) * zoom - icon.width * zoom / 2), y = Math.round((h.y - camY) * zoom - icon.height * zoom);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = Math.min(1, h.vis);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse((h.x - camX) * zoom, (h.y - camY) * zoom - zoom, 8 * zoom, 2.2 * zoom, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(icon, x, y, icon.width * zoom, icon.height * zoom);
  ctx.restore();
}

// The crystals' cold blue light, into the shared light buffer (js/camera.js).
let crystalGlowCanvas = null;
function crystalGlow() {
  if (crystalGlowCanvas) return crystalGlowCanvas;
  const c = crystalGlowCanvas = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(140,210,255,0.9)"); gr.addColorStop(0.45, "rgba(70,150,255,0.45)"); gr.addColorStop(1, "rgba(40,90,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function treasureLights() {
  const T = treasureLayout;
  const zone = T && treasureZone();
  if (!zone || zone.key !== T.key) return;
  const strength = zone.kind === "room" ? 0.4 : 0.08 + 0.42 * (typeof getNightLightFactor === "function" ? getNightLightFactor() : 0);
  const t = performance.now() / 1000, size = TILE * 3.2 * zoom;
  for (const o of T.crystals) {
    const sx = (o.x - camX) * zoom - size / 2, sy = (o.y - 6 - camY) * zoom - size / 2;
    if (sx + size < 0 || sy + size < 0 || sx > view.width || sy > view.height) continue;
    const pulse = 0.85 + 0.15 * Math.sin(t * 1.6 + o.tw);
    addSceneLight(crystalGlow(), sx, sy, size, size, strength * pulse, [120, 190, 255]);
  }
}

/* ---------------- overlay: glints, the E hint, loot popups ---------------- */
const treasurePopups = []; // { x, y, text, color, t }
const treasureBursts = []; // { x, y, t }
function drawSparkle(sx, sy, r, a, color) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = color || "#fff6c8";
  ctx.beginPath();
  ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r * 0.22, sy - r * 0.22); ctx.lineTo(sx + r, sy); ctx.lineTo(sx + r * 0.22, sy + r * 0.22);
  ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r * 0.22, sy + r * 0.22); ctx.lineTo(sx - r, sy); ctx.lineTo(sx - r * 0.22, sy - r * 0.22);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawTreasureOverlay() {
  const T = treasureLayout;
  const zone = T && treasureZone();
  if (!zone || zone.key !== T.key) return;
  const t = performance.now() / 1000, p = treasurePlayerFeet();
  // crystals twinkle a little
  for (const o of T.crystals) {
    const k = (t * 0.6 + o.tw) % 4;
    if (k > 0.5) continue;
    const icon = assets["crystal_" + o.type];
    const h = icon && icon.height ? icon.height : 10;
    drawSparkle((o.x - camX) * zoom, (o.y - h * 0.7 - camY) * zoom, 2.4 * zoom * Math.sin(k / 0.5 * Math.PI), 0.9, "#d6f3ff");
  }
  let near = null;
  for (const h of T.chests) {
    if (T.st.opened[h.i]) { // opened, still something inside: the hint stays
      if (chestHasLoot(T, h) && Math.hypot(h.x - p.x, h.y - p.y) <= CHEST_OPEN_RANGE) near = h;
      continue;
    }
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    // still hidden: now and then a faint glint where it lies — the only clue
    if (h.vis < 0.5 && d < TREASURE_HINT) {
      const k = (t + h.glint) % 3.2;
      if (k < 0.45) drawSparkle((h.x - camX) * zoom + (h.i % 2 ? 3 : -3) * zoom, (h.y - 9 - camY) * zoom, 2.2 * zoom * Math.sin(k / 0.45 * Math.PI), 0.55);
    }
    if (h.vis >= 0.5 && d <= CHEST_OPEN_RANGE) near = h;
  }
  if (near && !inventoryOpen && !chestWindowOpen()) {
    const fs = Math.max(9, Math.round(4.2 * zoom));
    const sx = (near.x - camX) * zoom, sy = (near.y - 22 - camY) * zoom;
    ctx.save();
    ctx.font = "bold " + fs + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.lineWidth = Math.max(2, fs / 4); ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText("[E] Buksan", sx, sy); ctx.fillStyle = "#ffe6a8"; ctx.fillText("[E] Buksan", sx, sy);
    ctx.restore();
  }
  // opening burst
  for (let i = treasureBursts.length - 1; i >= 0; i--) {
    const b = treasureBursts[i], k = (t - b.t) / 0.9;
    if (k >= 1) { treasureBursts.splice(i, 1); continue; }
    for (let n = 0; n < 8; n++) {
      const a = n / 8 * Math.PI * 2, rr = (6 + 16 * k) * zoom;
      drawSparkle((b.x - camX) * zoom + Math.cos(a) * rr, (b.y - 10 - camY) * zoom + Math.sin(a) * rr * 0.7, 2.2 * zoom * (1 - k), 1 - k, n % 2 ? "#ffe27a" : "#fff");
    }
  }
  // what came out of the chest, floating up
  for (let i = treasurePopups.length - 1; i >= 0; i--) {
    const q = treasurePopups[i], k = (t - q.t) / 2.6;
    if (k >= 1) { treasurePopups.splice(i, 1); continue; }
    if (k < 0) continue;
    const fs = Math.max(9, Math.round(4 * zoom));
    const sx = (q.x - camX) * zoom, sy = (q.y - camY) * zoom - k * 18 * zoom;
    ctx.save();
    ctx.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2;
    ctx.font = "bold " + fs + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.lineWidth = Math.max(2, fs / 4); ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(q.text, sx, sy); ctx.fillStyle = q.color; ctx.fillText(q.text, sx, sy);
    ctx.restore();
  }
}

/* ---------------- opening + loot ---------------- */
// [type, min, max, weight, minLevel] — rare things weigh little; deeper places unlock better ones
const TREASURE_LOOT = [
  ["potionHealth", 1, 2, 30, 1], ["potionStamina", 1, 2, 24, 1], ["crystalShard", 1, 3, 26, 1],
  ["ironIngot", 1, 3, 26, 1], ["goldIngot", 1, 2, 12, 3], ["golemCore", 1, 1, 6, 4], ["potionElixir", 1, 1, 6, 3],
  // the rare finds — swords, bows, armour
  ["woodBow", 1, 1, 3, 1], ["bronzeSword", 1, 1, 3, 1], ["ironSword", 1, 1, 2.5, 3], ["ironBow", 1, 1, 1.5, 5],
  ["goldSword", 1, 1, 1.4, 6], ["crystalSword", 1, 1, 0.8, 8], ["goldBow", 1, 1, 0.6, 9],
  ["leatherHelmet", 1, 1, 2.5, 1], ["leatherBoots", 1, 1, 2.5, 1], ["leatherArmor", 1, 1, 2, 1],
  ["bronzeHelmet", 1, 1, 1.6, 3], ["bronzeArmor", 1, 1, 1.2, 4], ["bronzeGauntlet", 1, 1, 1.6, 3], ["bronzeBoots", 1, 1, 1.6, 3],
  ["ironHelmet", 1, 1, 0.9, 6], ["ironArmor", 1, 1, 0.7, 7], ["ironShield", 1, 1, 0.8, 6], ["ironRing", 1, 1, 0.8, 6],
];
function rollTreasureLoot(level) {
  const pool = TREASURE_LOOT.filter(([type, , , , lv]) => itemDefs[type] && lv <= level);
  const total = pool.reduce((s, e) => s + e[3], 0);
  const got = new Map();
  const rolls = 2 + Math.floor(Math.random() * 3);
  for (let n = 0; n < rolls; n++) {
    let x = Math.random() * total, e = pool[0];
    for (const it of pool) { x -= it[3]; if (x <= 0) { e = it; break; } }
    const amt = e[1] + Math.floor(Math.random() * (e[2] - e[1] + 1));
    got.set(e[0], (got.get(e[0]) || 0) + amt);
  }
  const gold = Math.round((15 + Math.random() * 25) * (1 + level * 0.35));
  return { gold, items: [...got] };
}
// Opening: the loot is rolled once into the chest (saved — st.loot[i]) and shown
// in the chest window; per request ("dapat may mag appear na pop up i click yung
// mga item na nandun sa loob ng chest parang inventory rin na ui may 6 column at 3
// rows pag click mapunta sa inventory"): click a slot to take it into your
// inventory, or "Kunin lahat". Whatever is left stays in the chest.
function openTreasureChest(T, h) {
  if (!T.st.loot) T.st.loot = {};
  if (!T.st.opened[h.i]) {
    T.st.opened[h.i] = Date.now();
    const loot = rollTreasureLoot(T.zone.level);
    T.st.loot[h.i] = [{ type: "goldCoin", amount: loot.gold }].concat(loot.items.map(([type, amount]) => ({ type, amount })));
    treasureBursts.push({ x: h.x, y: h.y, t: performance.now() / 1000 });
    if (typeof saveGame === "function") saveGame();
  }
  openChestWindow(T, h);
}
const CHEST_COLS = 6, CHEST_ROWS = 3;
let chestWin = null, chestWinAt = null; // { T, h }
function buildChestWindow() {
  chestWin = document.createElement("div");
  chestWin.id = "chest-overlay";
  chestWin.className = "hidden";
  chestWin.innerHTML = '<div id="chest-panel"><div class="chest-title">📦 Treasure Chest <span class="hint">(click outside to close)</span></div>' +
    '<div id="chest-grid"></div><div class="chest-foot"><span class="hint">I-click ang item para kunin</span><button id="chest-all">Kunin lahat</button></div></div>';
  document.body.appendChild(chestWin);
  chestWin.addEventListener("click", (e) => { if (e.target === chestWin) closeChestWindow(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeChestWindow(); });
  chestWin.querySelector("#chest-all").addEventListener("click", () => {
    if (!chestWinAt) return;
    const L = chestWinAt.T.st.loot[chestWinAt.h.i] || [];
    while (L.length) takeChestSlot(0, true);
    renderChestWindow();
    closeChestWindow();
  });
}
function chestIconSrc(type) {
  const ic = type === "goldCoin" ? assets.mob_goldCoin : itemDefs[type] && itemDefs[type].icon;
  if (!ic) return "";
  if (ic.src) return ic.src;
  try { return ic.toDataURL(); } catch (e) { return ""; }
}
function openChestWindow(T, h) {
  if (!chestWin) buildChestWindow();
  chestWinAt = { T, h };
  chestWin.classList.remove("hidden");
  renderChestWindow();
}
function closeChestWindow() { if (chestWin) chestWin.classList.add("hidden"); chestWinAt = null; }
function chestWindowOpen() { return !!(chestWin && !chestWin.classList.contains("hidden")); }
function renderChestWindow() {
  if (!chestWin || !chestWinAt) return;
  const grid = chestWin.querySelector("#chest-grid");
  const L = chestWinAt.T.st.loot[chestWinAt.h.i] || [];
  grid.innerHTML = "";
  for (let i = 0; i < CHEST_COLS * CHEST_ROWS; i++) {
    const it = L[i];
    const cell = document.createElement("div");
    cell.className = "chest-slot" + (it ? " full" : "");
    if (it) {
      const def = itemDefs[it.type];
      const name = it.type === "goldCoin" ? "Gold" : def ? def.name : it.type;
      const rare = def && (def.weapon || def.gear);
      if (rare) cell.classList.add("rare");
      cell.dataset.itemType = it.type; // hover: name + description (js/itemInfo.js)
      cell.innerHTML = '<img src="' + chestIconSrc(it.type) + '"><span class="cnt">' + it.amount + "</span>";
      cell.addEventListener("click", () => { takeChestSlot(i); renderChestWindow(); });
    }
    grid.appendChild(cell);
  }
  chestWin.querySelector("#chest-all").disabled = !L.length;
}
function takeChestSlot(i, quiet) {
  if (!chestWinAt) return;
  const { T, h } = chestWinAt;
  const L = T.st.loot[h.i] || [];
  const it = L[i];
  if (!it) return;
  L.splice(i, 1);
  let text, color;
  if (it.type === "goldCoin") {
    player.gold = (player.gold || 0) + it.amount;
    if (typeof renderGoldDisplays === "function") renderGoldDisplays();
    text = "+" + it.amount + " gold"; color = "#ffd84a";
  } else {
    grantItem(it.type, it.amount);
    const def = itemDefs[it.type];
    text = "+" + it.amount + " " + (def ? def.name : it.type); color = def && (def.weapon || def.gear) ? "#ff9cf0" : "#9cf59a";
  }
  const stack = treasurePopups.filter((q) => performance.now() / 1000 - q.t < 0.6).length;
  treasurePopups.push({ x: h.x, y: h.y - 22 - stack * 5.5, text, color, t: performance.now() / 1000 });
  if (typeof saveGame === "function") saveGame();
}
// walk away and the window closes
setInterval(() => {
  if (!chestWindowOpen() || !chestWinAt) return;
  const p = treasurePlayerFeet(), h = chestWinAt.h;
  if (treasureZone() === null || !treasureLayout || treasureLayout !== chestWinAt.T || Math.hypot(h.x - p.x, h.y - p.y) > CHEST_OPEN_RANGE * 1.6) closeChestWindow();
}, 300);
function chestHasLoot(T, h) { return !T.st.opened[h.i] || ((T.st.loot && T.st.loot[h.i]) || []).length > 0; }
function nearestOpenableChest() {
  const T = treasureLayout;
  const zone = T && treasureZone();
  if (!zone || zone.key !== T.key) return null;
  const p = treasurePlayerFeet();
  let best = null, bd = CHEST_OPEN_RANGE;
  for (const h of T.chests) {
    if (!chestHasLoot(T, h) || h.vis < 0.5) continue;
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d <= bd) { bd = d; best = h; }
  }
  return best ? { T, h: best } : null;
}
// E next to a chest opens it (captured before input.js so it doesn't also grab/collect)
window.addEventListener("keydown", (e) => {
  if (e.repeat || e.key.toLowerCase() !== "e") return;
  if (typeof inventoryOpen !== "undefined" && inventoryOpen) return;
  if (chestWindowOpen()) { e.stopImmediatePropagation(); closeChestWindow(); return; } // E again closes it
  const n = nearestOpenableChest();
  if (!n) return;
  e.stopImmediatePropagation();
  openTreasureChest(n.T, n.h);
}, true);
// ...or click it
view.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const T = treasureLayout;
  const zone = T && treasureZone();
  if (!zone || zone.key !== T.key) return;
  const { x, y } = screenToWorld(e.clientX, e.clientY);
  const h = T.chests.find((c) => chestHasLoot(T, c) && c.vis >= 0.5 && Math.abs(x - c.x) < 10 && y > c.y - 18 && y < c.y + 2);
  if (!h) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const p = treasurePlayerFeet();
  if (Math.hypot(h.x - p.x, h.y - p.y) > CHEST_OPEN_RANGE) { if (typeof showToast === "function") showToast("Masyadong malayo — lumapit ka muna"); return; }
  openTreasureChest(T, h);
}, true);

/* ---------------- save ---------------- */
{
  const saveBase = buildSaveData;
  buildSaveData = function () {
    const d = saveBase.apply(this, arguments);
    if (player.treasure) d.treasure = player.treasure;
    return d;
  };
  const loadBase = applySaveData;
  applySaveData = function (data) {
    const r = loadBase.apply(this, arguments);
    if (data && data.treasure && typeof data.treasure === "object") player.treasure = data.treasure;
    treasureLayout = null;
    return r;
  };
}
