"use strict";

/* =================================================================
   THE GREENWOOD — the forest west of the wild world, and its animals.

   Per request ("mag lagay ka pa nga ng isang map sa left side ng new map
   tabi ng town forest ... dun mo ilagay lahat ng hayop spawnable at
   nakikill gamit axe 3-5 hits at may drop din meat nila ... matagal yung
   spawn randomly yung durations"):
   - The map (tools/build_east_worlds.py forest(), 188 x 103 like the town):
     a mountain ring, mesas, a sea with a port-piece shore and rocks in it,
     a waterfall and stream, trees, bushes, flowers and grass everywhere.
   - The way in: a pass cut through the wild world's west cliff, the dirt
     road running out of it (WILD_WEST_PASS). Walk out west; in the
     Greenwood, walk out through the pass in the east ring to come back.
   - Every farm animal lives here wild (chicken, pig, cow, the three
     sheep) — they wander, and run when hit. Hunt them with the Axe
     equipped (F / ATTACK): chicken 3 hits, sheep and pig 4, cow 5. They
     drop Raw Meat plus their own thing (feather, wool, leather) on the
     ground to pick up. New ones turn up slowly, at random: one every
     40-120 s while you're here, up to WILD_ANIMAL_MAX.
================================================================= */

const FOREST_ARRIVE = { col: 180, row: 50 };      // in the Greenwood, just inside the east pass
const WILD_ANIMAL_MAX = 22, WILD_ANIMAL_START = 10;
const WILD_ANIMAL_HP = { chicken: 3, pig: 4, cow: 5, sheep_white: 4, sheep_blackface: 4, sheep_cream: 4 };
const WILD_ANIMAL_DROPS = {
  chicken: [["rawMeat", 1, 1], ["feather", 1, 3]],
  pig: [["rawMeat", 2, 3], ["leather", 0, 1]],
  cow: [["rawMeat", 2, 4], ["leather", 1, 2]],
  sheep_white: [["rawMeat", 1, 2], ["wool", 1, 3]],
  sheep_blackface: [["rawMeat", 1, 2], ["wool", 1, 3]],
  sheep_cream: [["rawMeat", 1, 2], ["wool", 1, 3]],
};
const wildAnimals = [];
let wildNextSpawnAt = 0;
const wrand = (a, b) => a + Math.random() * (b - a);

/* ---------------- the way between: a pass cut through the wild world's west cliff ---------------- */
// Per request ("pangit ng portal ... alisin mo yung pinto tanggalan mo ng mountain corner dun sa left
// langyan mo ng way path"): like the wild world's east pass to the town — the cliff walls above, the
// mountain's rim below, and the dirt road (rows 22-23) carried on west to the edge. Applied to the
// default map (js/defaultMap.data.js) and, once, to a saved wild world (player.wildPassV2).
const WILD_WEST_PASS = [[0,16,"terrainMountainTopWallMountain1"],[0,17,"terrainMountainCenterWallMountain1"],[0,18,"terrainMountainCenterWallMountain1"],[0,19,"terrainMountainBottomWallMountain1"],[0,20,null],[0,21,"terrainGrassTopGrass2"],[0,22,null],[0,23,null],[0,24,"terrainGrassBottomGrass4"],[0,25,"terrainMountainTopMountain1"],[0,26,"terrainMountainTopInnerMountain2"],[1,15,"terrainGrassTopGrass5"],[1,16,"terrainMountainTopWallMountain4"],[1,17,"terrainMountainCenterWallMountain4"],[1,18,"terrainMountainCenterWallMountain4"],[1,19,"terrainMountainBottomWallMountain3"],[1,20,null],[1,21,"terrainGrassTopGrass2"],[1,22,null],[1,23,null],[1,24,"terrainGrassBottomGrass4"],[1,25,"terrainMountainTopMountain2"],[1,26,"terrainMountainTopInnerMountain3"],[2,15,"terrainGrassTopGrass4"],[2,16,"terrainMountainTopWallMountain4"],[2,17,"terrainMountainCenterWallMountain4"],[2,18,"terrainMountainCenterWallMountain4"],[2,19,"terrainMountainBottomWallMountain3"],[2,20,null],[2,21,"terrainGrassTopGrass2"],[2,22,null],[2,23,null],[2,24,"terrainGrassBottomGrass4"],[2,25,"terrainMountainTopMountain3"],[2,26,"terrainMountainTopInnerMountain4"],[3,16,"terrainMountainTopWallMountain4"],[3,17,"terrainMountainCenterWallMountain4"],[3,18,"terrainMountainCenterWallMountain4"],[3,19,"terrainMountainBottomWallMountain3"],[3,20,null],[3,21,"terrainGrassTopGrass2"],[3,22,null],[3,23,null],[3,24,"terrainGrassBottomGrass4"],[3,25,"terrainMountainTopMountain4"],[3,26,"terrainMountainTopInnerMountain5"],[4,16,"terrainMountainTopWallMountain6"],[4,17,"terrainMountainCenterWallMountain6"],[4,18,"terrainMountainCenterWallMountain6"],[4,19,"terrainMountainBottomWallMountain6"],[4,20,null],[4,21,"terrainGrassTopGrass2"],[4,22,null],[4,23,null],[4,24,"terrainGrassBottomGrass4"],[4,25,"terrainMountainTopMountain1"],[4,26,"terrainMountainTopInnerMountain6"],[5,21,"terrainGrassTopGrass2"],[5,22,null],[5,23,null],[5,24,"terrainGrassBottomGrass4"],[6,21,"terrainGrassTopGrass2"],[6,22,null],[6,23,null],[6,24,"terrainGrassBottomGrass4"],[7,21,"terrainGrassTopGrass2"],[7,22,null],[7,23,null],[7,24,"terrainGrassBottomGrass4"],[8,21,"terrainGrassTopGrass2"],[8,22,null],[8,23,null],[8,24,"terrainGrassBottomGrass4"],[9,21,"terrainGrassTopGrass2"],[9,22,null],[9,23,null],[9,24,"terrainGrassBottomGrass4"],[10,21,"terrainGrassTopGrass2"],[10,22,null],[10,23,null],[10,24,"terrainGrassBottomGrass4"],[11,21,"terrainGrassTopGrass2"],[11,22,null],[11,23,null],[11,24,"terrainGrassBottomGrass4"],[12,21,"terrainGrassTopGrass2"],[12,22,null],[12,23,null],[12,24,"terrainGrassBottomGrass4"],[13,21,"terrainGrassTopGrass2"],[13,22,null],[13,23,null],[13,24,"terrainGrassBottomGrass4"]];
const WILD_PASS_WEST_ROWS = [20, 24];
function carveWildWestPass() {
  if (currentWorld !== "wild" || player.scene !== "outside" || player.wildPassV2) return;
  const mtnLayer = (typeof autotileSets !== "undefined" && autotileSets.terrainMountain && autotileSets.terrainMountain.layer) || groundLayer;
  for (const [c, r, t] of WILD_WEST_PASS) {
    const k = c + "," + r;
    // the old plateau goes from every layer it sits in (the mountain lives in the overlay too)
    for (const L of [groundLayer, groundOverlayLayer]) if (/^terrain/.test(L.get(k) || "")) L.delete(k);
    if (t) (t.startsWith("terrainMountain") ? mtnLayer : groundLayer).set(k, t);
  }
  for (let c = 0; c < 14; c++) for (let r = 20; r <= 24; r++) {
    const k = c + "," + r;
    objectLayer.delete(k); wildgrassLayer.delete(k);
    // grass only on row 20; the road and its grass-edged sides (rows 21-24) have no lawn under them,
    // so the edge pieces show their own curved grass line
    if (typeof setGroundFill === "function") setGroundFill(c, r, r === 20);
  }
  for (const [k, t] of [...objectLayer]) if (t === "forestGate") objectLayer.delete(k); // the old gate
  player.wildPassV2 = true;
  if (typeof saveGame === "function") saveGame();
}
setInterval(() => { try { carveWildWestPass(); } catch (e) { /* not ready */ } }, 1000);
{
  const saveBase = buildSaveData;
  buildSaveData = function () { const d = saveBase.apply(this, arguments); d.wildPassV2 = !!player.wildPassV2; return d; };
  const loadBase = applySaveData;
  applySaveData = function (data) { const r = loadBase.apply(this, arguments); player.wildPassV2 = !!(data && data.wildPassV2); return r; };
}
let forestTravelCooldown = 0;
{
  const base = updatePlayer;
  updatePlayer = function (dt) {
    const r = base.apply(this, arguments);
    try {
      if (player.scene !== "outside" || (typeof sceneFade !== "undefined" && sceneFade) || performance.now() < forestTravelCooldown) return r;
      const feetY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
      const col = Math.floor(player.x / TILE), row = Math.floor(feetY / TILE);
      const left = keys["a"] || keys["arrowleft"], right = keys["d"] || keys["arrowright"];
      if (currentWorld === "wild" && WORLD_DEFS.forest && left && col <= 1 && row >= WILD_PASS_WEST_ROWS[0] && row <= WILD_PASS_WEST_ROWS[1]) {
        forestTravelCooldown = performance.now() + 2000;
        beginSceneFade(() => { switchWorld("forest", FOREST_ARRIVE, "left"); if (typeof showToast === "function") showToast("The Greenwood — hunt with the Axe"); });
      } else if (currentWorld === "forest" && right && col >= WORLD_DEFS.forest.cols - 3 && row >= 46 && row <= 53) {
        forestTravelCooldown = performance.now() + 2000;
        beginSceneFade(() => switchWorld("wild", { col: 4, row: 22 }, "right"));
      }
    } catch (e) { /* ignore */ }
    return r;
  };
}

/* ---------------- the animals ---------------- */
function wildFeetFree(x, y) { return !isBodyBlockedAt(x, y - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE); }
function spawnWildAnimal(nearPlayer) {
  const D = WORLD_DEFS.forest;
  const pfy = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  for (let tries = 0; tries < 60; tries++) {
    const c = Math.floor(wrand(8, D.cols - 8)), r = Math.floor(wrand(8, D.rows - 8));
    const x = (c + 0.5) * TILE, y = (r + 0.8) * TILE;
    const d = Math.hypot(x - player.x, y - pfy);
    if (!nearPlayer && d < 10 * TILE) continue;              // never pops up right beside you
    if (groundLayer.has(c + "," + r) && !/^terrainGrass/.test(groundLayer.get(c + "," + r))) continue; // not on water / shore / cliffs
    if (!wildFeetFree(x, y)) continue;
    const ids = Object.keys(WILD_ANIMAL_HP);
    const id = ids[Math.floor(Math.random() * ids.length)];
    const def = ANIMAL_TYPES[id];
    if (!def) return null;
    const a = { id, def, fx: x, fy: y, homeX: x, homeY: y, facing: "down", anim: "idle", frame: 0, ft: 0, hp: WILD_ANIMAL_HP[id], maxHp: WILD_ANIMAL_HP[id],
      state: "idle", t: wrand(1, 4), tx: x, ty: y, flash: 0, flee: 0, hop: 0, lit: 0 };
    wildAnimals.push(a);
    return a;
  }
  return null;
}
function updateWildAnimals(dt) {
  if (currentWorld !== "forest" || player.scene !== "outside" || !WORLD_DEFS.forest) return;
  const now = performance.now() / 1000;
  if (!wildAnimals.length && !updateWildAnimals.started) { updateWildAnimals.started = true; for (let i = 0; i < WILD_ANIMAL_START; i++) spawnWildAnimal(false); wildNextSpawnAt = now + wrand(40, 120); }
  if (now >= wildNextSpawnAt) { if (wildAnimals.length < WILD_ANIMAL_MAX) spawnWildAnimal(false); wildNextSpawnAt = now + wrand(40, 120); } // slow, random
  const pfy = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  for (const a of wildAnimals) {
    a.flash = Math.max(0, a.flash - dt); a.hop = Math.max(0, a.hop - dt * 4);
    if (a.flee > 0) { // running from you
      a.flee -= dt;
      const dx = a.fx - player.x, dy = a.fy - pfy, d = Math.hypot(dx, dy) || 1;
      a.tx = a.fx + dx / d * 40; a.ty = a.fy + dy / d * 40; a.state = "walk";
    } else {
      a.t -= dt;
      if (a.t <= 0) {
        if (a.state === "walk") { a.state = "idle"; a.t = wrand(a.def.idle[0], a.def.idle[1]); }
        else { a.state = "walk"; a.t = wrand(2, 5); const ang = Math.random() * Math.PI * 2, rr = wrand(1, a.def.wander) * TILE; a.tx = a.homeX + Math.cos(ang) * rr; a.ty = a.homeY + Math.sin(ang) * rr; }
      }
    }
    if (a.state === "walk") {
      const dx = a.tx - a.fx, dy = a.ty - a.fy, d = Math.hypot(dx, dy);
      const sp = (a.def.speed[0] + a.def.speed[1]) / 2 * (a.flee > 0 ? 2.2 : 1);
      if (d < 2) { a.state = "idle"; a.t = wrand(a.def.idle[0], a.def.idle[1]); }
      else {
        const nx = a.fx + dx / d * sp * dt, ny = a.fy + dy / d * sp * dt;
        if (wildFeetFree(nx, ny)) { a.fx = nx; a.fy = ny; } else { a.state = "idle"; a.t = wrand(0.5, 2); }
        a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      }
    }
    a.anim = a.state === "walk" ? "walk" : "idle";
    a.ft += dt;
    const fps = a.def.fps[a.anim] || 5;
    if (a.ft >= 1 / fps) { a.ft = 0; a.frame = (a.frame + 1) % ANIMAL_FRAMES; }
  }
}
// drawn in the depth sort (through the mobs' hook into renderWorldObjectsSorted(), js/mines.js)
{
  const base = mineIndoorDrawables;
  mineIndoorDrawables = function () {
    const out = base.apply(this, arguments) || [];
    if (currentWorld === "forest" && player.scene === "outside") {
      const vw = view.width / zoom, vh = view.height / zoom;
      for (const a of wildAnimals) {
        if (a.fx < camX - 64 || a.fx > camX + vw + 64 || a.fy < camY - 64 || a.fy > camY + vh + 64) continue;
        out.push({ sortY: a.fy, animal: true, draw: () => drawWildAnimal(a) });
      }
    }
    return out;
  };
}
function drawWildAnimal(a) {
  const hop = Math.sin(a.hop * Math.PI) * 4;
  const fy = a.fy; a.fy -= hop;
  try { drawAnimal(a); } finally { a.fy = fy; }
  if (a.flash > 0) { // white flash when hit
    const b = animalScreenBox(a);
    if (b) {
      ctx.save(); ctx.globalAlpha = Math.min(1, a.flash / 0.12) * 0.75; ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(b.sheet, b.sx, 0, b.fw, b.fh, b.x, b.y - hop * zoom, b.w, b.h);
      ctx.restore();
    }
  }
  if (a.hp < a.maxHp) { // a small health bar once it's hurt
    const b = animalScreenBox(a);
    if (b) {
      const w = 14 * zoom, h = Math.max(2, zoom * 0.8), x = b.px - w / 2, y = b.y - 3 * zoom;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#e05050"; ctx.fillRect(x, y, w * a.hp / a.maxHp, h);
    }
  }
}
setInterval(() => { // (its own clock: the Greenwood has no mob zone)
  const now = performance.now();
  const dt = Math.min(0.1, (now - (updateWildAnimals.last || now)) / 1000);
  updateWildAnimals.last = now;
  try { updateWildAnimals(dt); } catch (e) { /* ignore */ }
}, 33);

/* ---------------- hunting with the axe ---------------- */
itemDefs.__huntTarget = { id: "__huntTarget", name: "", icon: assets.mob_rawMeat, resource: { breakAnim: "slice" } };
function wildAnimalInFront() {
  if (currentWorld !== "forest" || player.equippedWeapon !== "woodAxe") return null;
  const fy = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  const dir = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[player.facing] || [0, 1];
  const cx = player.x + dir[0] * 12, cy = fy + dir[1] * 10;
  let best = null, bd = 1e9;
  for (const a of wildAnimals) {
    const d = Math.hypot(a.fx - cx, a.fy - cy);
    if (d < 22 && d < bd) { bd = d; best = a; }
  }
  return best;
}
{
  const findBase = findHarvestableTarget;
  findHarvestableTarget = function () {
    const a = wildAnimalInFront();
    if (a) return { col: Math.floor(a.fx / TILE), row: Math.floor(a.fy / TILE), type: "__huntTarget", animal: a };
    return findBase.apply(this, arguments);
  };
  const hitBase = resolveHarvestHit;
  resolveHarvestHit = function (target) {
    if (target && target.animal) { hitWildAnimal(target.animal); return; }
    return hitBase.apply(this, arguments);
  };
}
function hitWildAnimal(a) {
  if (!wildAnimals.includes(a)) return;
  a.hp -= 1; a.flash = 0.18; a.hop = 1; a.flee = 3; a.state = "walk";
  const fy = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE, dx = a.fx - player.x, dy = a.fy - fy, d = Math.hypot(dx, dy) || 1;
  const nx = a.fx + dx / d * 6, ny = a.fy + dy / d * 6;
  if (wildFeetFree(nx, ny)) { a.fx = nx; a.fy = ny; } // knocked back a step
  if (a.hp > 0) return;
  wildAnimals.splice(wildAnimals.indexOf(a), 1);
  for (const [t, lo, hi] of WILD_ANIMAL_DROPS[a.id] || []) {
    const n = Math.floor(wrand(lo, hi + 1));
    if (n <= 0) continue;
    // the little tossed icons are only the look (js/resources.js) — the items go into the bag here
    if (typeof spawnFloatingPickups === "function") spawnFloatingPickups(a.fx, a.fy - 6, t, n);
    grantItem(t, n);
  }
  if (typeof gainExp === "function") gainExp(3);
}

/* ---------------- 99 to a stack ---------------- */
// Per request ("yung mga meat is eatable din parang fish pero kung ilan lang drop nila yun lang
// mailalagay sa inventory 99x per slot"): the hunting drops stack to 99 at most; past that they're left.
const STACK_99 = new Set(["rawMeat", "feather", "wool", "leather"]);
{
  const base = grantItem;
  grantItem = function (type, n) {
    if (STACK_99.has(type)) {
      const have = ownedCount(type), room = Math.max(0, 99 - have);
      if (room <= 0) { if (typeof showToast === "function") showToast((itemDefs[type] ? itemDefs[type].name : type) + " is full (99)"); return; }
      if (n > room) n = room;
      arguments[1] = n;
    }
    return base.apply(this, arguments);
  };
}

/* ---------------- the top cliff runs on to the map's edges ---------------- */
// Per request ("gantong front sana ng mountain tapos continues hanggat walang curve" — the wild world's
// top wall and the other top mountains): the wall face along the top doesn't stop where the ridges
// beside it start — it carries on through them to both edges of the map (rows 5-8), and the ridges
// below it start one step lower with their rim (row 9). In js/defaultMap.data.js; a saved wild world
// gets it once (player.wildCornersV2). (The generated lands do the same: tools/build_east_worlds.py.)
const WILD_TOP_WALL_RUN = [[0,5,"terrainMountainTopWallMountain4"],[0,6,"terrainMountainCenterWallMountain4"],[0,7,"terrainMountainCenterWallMountain4"],[0,8,"terrainMountainBottomWallMountain3"],[1,5,"terrainMountainTopWallMountain4"],[1,6,"terrainMountainCenterWallMountain4"],[1,7,"terrainMountainCenterWallMountain4"],[1,8,"terrainMountainBottomWallMountain3"],[2,5,"terrainMountainTopWallMountain4"],[2,6,"terrainMountainCenterWallMountain4"],[2,7,"terrainMountainCenterWallMountain4"],[2,8,"terrainMountainBottomWallMountain3"],[3,5,"terrainMountainTopWallMountain4"],[3,6,"terrainMountainCenterWallMountain4"],[3,7,"terrainMountainCenterWallMountain4"],[3,8,"terrainMountainBottomWallMountain3"],[4,5,"terrainMountainTopWallMountain4"],[4,6,"terrainMountainCenterWallMountain4"],[4,7,"terrainMountainCenterWallMountain4"],[4,8,"terrainMountainBottomWallMountain3"],[5,5,"terrainMountainTopWallMountain4"],[5,6,"terrainMountainCenterWallMountain4"],[5,7,"terrainMountainCenterWallMountain4"],[5,8,"terrainMountainBottomWallMountain3"],[74,5,"terrainMountainTopWallMountain4"],[74,6,"terrainMountainCenterWallMountain4"],[74,7,"terrainMountainCenterWallMountain4"],[74,8,"terrainMountainBottomWallMountain3"],[75,5,"terrainMountainTopWallMountain4"],[75,6,"terrainMountainCenterWallMountain4"],[75,7,"terrainMountainCenterWallMountain4"],[75,8,"terrainMountainBottomWallMountain3"],[76,5,"terrainMountainTopWallMountain4"],[76,6,"terrainMountainCenterWallMountain4"],[76,7,"terrainMountainCenterWallMountain4"],[76,8,"terrainMountainBottomWallMountain3"],[77,5,"terrainMountainTopWallMountain4"],[77,6,"terrainMountainCenterWallMountain4"],[77,7,"terrainMountainCenterWallMountain4"],[77,8,"terrainMountainBottomWallMountain3"],[78,5,"terrainMountainTopWallMountain4"],[78,6,"terrainMountainCenterWallMountain4"],[78,7,"terrainMountainCenterWallMountain4"],[78,8,"terrainMountainBottomWallMountain3"],[79,5,"terrainMountainTopWallMountain4"],[79,6,"terrainMountainCenterWallMountain4"],[79,7,"terrainMountainCenterWallMountain4"],[79,8,"terrainMountainBottomWallMountain3"],[0,9,"terrainMountainTopInnerMountain2"],[1,9,"terrainMountainTopInnerMountain3"],[2,9,"terrainMountainTopInnerMountain4"],[3,9,"terrainMountainTopInnerMountain5"],[4,9,"terrainMountainTopInnerMountain6"],[75,9,"terrainMountainTopInnerMountain1"],[76,9,"terrainMountainTopInnerMountain2"],[77,9,"terrainMountainTopInnerMountain3"],[78,9,"terrainMountainTopInnerMountain4"],[79,9,"terrainMountainTopInnerMountain5"]];
function runWildTopWall() {
  if (currentWorld !== "wild" || player.scene !== "outside" || player.wildCornersV2) return;
  const mtnLayer = (typeof autotileSets !== "undefined" && autotileSets.terrainMountain && autotileSets.terrainMountain.layer) || groundLayer;
  for (const [c, r, t] of WILD_TOP_WALL_RUN) {
    const k = c + "," + r;
    let target = null;
    for (const L of [groundOverlayLayer, groundLayer]) {
      const cur = L.get(k) || "";
      if (/^terrainMountain/.test(cur)) { if (!target) target = L; else L.delete(k); }
      else if (/^terrainGrass/.test(cur)) L.delete(k);
    }
    (target || mtnLayer).set(k, t);
    for (const L of [objectLayer, wildgrassLayer]) { const o = L.get(k); if (o && /^(tree|bush|wildGrass|stone|decoFlower)/.test(o)) L.delete(k); }
  }
  player.wildCornersV2 = true;
  if (typeof saveGame === "function") saveGame();
}
setInterval(() => { try { runWildTopWall(); } catch (e) { /* not ready */ } }, 1000);

/* ---------------- tidy-ups: the hunting stand-in, the Grilled Meat ---------------- */
// "__huntTarget" is only the axe swing's stand-in (above) — never an inventory item. Per request
// ("alisin mo yung meat sa inventory yung 99"), once, the Grilled Meat stack goes too (player.meatResetV1).
{
  const shown = inventorySlotShown;
  inventorySlotShown = function (slot) { return slot && slot.type === "__huntTarget" ? false : shown.apply(this, arguments); };
  const saveBase = buildSaveData;
  buildSaveData = function () { const d = saveBase.apply(this, arguments); d.wildCornersV2 = !!player.wildCornersV2; d.meatResetV1 = !!player.meatResetV1; return d; };
  const loadBase = applySaveData;
  applySaveData = function (data) {
    const r = loadBase.apply(this, arguments);
    player.wildCornersV2 = !!(data && data.wildCornersV2);
    player.meatResetV1 = !!(data && data.meatResetV1);
    for (const s of inventory) if (s && s.type === "__huntTarget") s.count = 0;
    if (!player.meatResetV1) {
      for (const s of inventory) if (s && s.type === "meatItem") s.count = 0;
      player.meatResetV1 = true;
      if (typeof renderInventory === "function") renderInventory();
    }
    return r;
  };
}

/* ---------------- names over the animals' drops ---------------- */
{
  const base = drawFloatingPickups;
  drawFloatingPickups = function () {
    const r = base.apply(this, arguments);
    const now = Date.now();
    for (const p of floatingPickups) {
      if (now < p.startAt || p.phase === "vacuum" || !STACK_99.has(p.type)) continue;
      const d = itemDefs[p.type];
      if (!d) continue;
      const x = (p.x - camX) * zoom, y = (p.y - p.z - camY) * zoom - 8 * zoom;
      ctx.save();
      ctx.font = "bold " + Math.max(10, Math.round(3.4 * zoom)) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.strokeText(d.name, x, y);
      ctx.fillStyle = "#fff4d6"; ctx.fillText(d.name, x, y);
      ctx.restore();
    }
    return r;
  };
}

// what the hunting drops are for (the hover info, js/itemInfo.js)
setTimeout(() => {
  if (typeof ITEM_DESC === "undefined") return;
  ITEM_DESC.rawMeat = "Meat from a hunted animal. Click to eat: +20% health and +30 food.";
  ITEM_DESC.feather = "A chicken's feather. Shops buy it.";
  ITEM_DESC.wool = "Soft wool from a sheep. Shops buy it.";
  ITEM_DESC.leather = "Tough leather from a cow or a pig. Shops buy it.";
}, 0);
