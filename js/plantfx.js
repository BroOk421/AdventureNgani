"use strict";

/* =================================================================
   PLANT FX — per request ("lagyan mo rin ng effects yung mga bush kapag
   dumadaan tapos yung mga trees kapag na cut is nag shashake minimal
   lang"):
     - Bushes (the bushBig/Medium/Small/XS/Flower items) sway when the
       player walks through them — the top leans away from the direction
       walked and springs back — and shed a few leaf flecks.
     - Trees (anything harvested with the "slice" break animation) give a
       small side-to-side shake on every chop (resolveHarvestHit(),
       js/resources.js).
   Purely cosmetic, nothing saved. Applied as a transform around the
   item's base in drawObjectLayerItem() (js/camera.js).
================================================================= */

const BUSH_SWAY_SECONDS = 0.7;
const BUSH_SWAY_SKEW = 0.16;      // max lean (skew factor) at the start of a sway
const BUSH_SWAY_FREQ = 14;        // radians/sec of the springy wobble
const TREE_SHAKE_SECONDS = 0.28;
const TREE_SHAKE_PX = 1;          // world px — "minimal lang"
const TREE_SHAKE_FREQ = 55;

// --- Wind (per request: "sa trees parang may hangin ng konti tapos
// nahuhulog yung leaves", grass too) -------------------------------------
// A gentle, always-on sway for trees, bushes and wild grass, as a wave that
// travels across the map (each plant's phase comes from where it stands),
// stronger in bad weather. Leafy trees on screen now and then drop a leaf
// that flutters down to the ground and fades. Cosmetic only.
const WIND_TREE_PX = 1.3;      // world px the top of a tree leans at full wind
const WIND_BUSH_PX = 0.8;
const WIND_GRASS_ANGLE = 0.35; // wild grass, in wildgrass.js's -1..1 sway units
const WIND_BY_WEATHER = { Sunny: 0.55, Cloudy: 0.8, Rainy: 1.15, Thunderstorm: 1.7, Snow: 0.7 };
const LEAVES_PER_SECOND = 1.6; // across all leafy trees on screen, at wind 1
const LEAF_FALL_SPEED = 9;     // world px/s at most
let windStrength = 0.6;        // eased toward the weather's value
let windTime = 0;
let leafSpawnAcc = 0;
let leafyTreesInView = [], leafyTreesAt = 0;

function windWave(col, row) {
  const t = windTime;
  return Math.sin(t * 1.25 + col * 0.33 + row * 0.12) * 0.7 + Math.sin(t * 2.6 + col * 0.9 + row * 0.4) * 0.3;
}
function isWindTree(type) {
  return /^tree/.test(type) && !/CutStump|Trunk$/.test(type);
}
// Stumps and trunks are just wood — no leaves from them, and nothing to topple.
function isStumpType(type) { return /CutStump|Trunk$/.test(type); }
function treeLeafColors(type) {
  if (/NoLeaves/.test(type) || isStumpType(type)) return null;
  // snowing: what falls off a snowy tree (chop shake, wind) is snow-white
  // leaf bits, matching the winter art (js/snowground.js)
  if (typeof isSnowGroundActive === "function" && isSnowGroundActive()) return ["#eef4fb", "#b9c9dc"];
  if (/LightGreen/.test(type)) return ["#9cc45a", "#76a044"];
  if (/Orange/.test(type)) return ["#e0873a", "#b8602a"];
  if (/Red/.test(type)) return ["#c4493c", "#93302a"];
  if (/Yellow/.test(type)) return ["#e0c04c", "#b0922e"];
  return ["#5d9a3c", "#3f7430"];
}
// Wild grass: extra lean added to its walk-through sway (camera.js).
function windGrassAngle(col, row) {
  return WIND_GRASS_ANGLE * windStrength * windWave(col, row);
}

function updateWind(dt) {
  windTime += dt;
  const w = typeof getCurrentWeather === "function" ? getCurrentWeather() : null;
  const target = (w && WIND_BY_WEATHER[w.name]) || 0.6;
  windStrength += (target - windStrength) * Math.min(1, dt * 0.5);
  if (player.scene !== "outside") return;
  // Which leafy trees are on screen — refreshed twice a second.
  const now = performance.now();
  if (now - leafyTreesAt > 500) {
    leafyTreesAt = now;
    leafyTreesInView = [];
    const c0 = Math.floor(camX / TILE) - 4, c1 = Math.ceil((camX + view.width / zoom) / TILE) + 4;
    const r0 = Math.floor(camY / TILE) - 2, r1 = Math.ceil((camY + view.height / zoom) / TILE) + 12;
    for (const [key, type] of objectLayer) {
      if (!isWindTree(type) || !treeLeafColors(type)) continue;
      const comma = key.indexOf(",");
      const col = +key.slice(0, comma), row = +key.slice(comma + 1);
      if (col < c0 || col > c1 || row < r0 || row > r1) continue;
      leafyTreesInView.push({ type, col, row });
    }
  }
  if (!leafyTreesInView.length) return;
  leafSpawnAcc += dt * LEAVES_PER_SECOND * windStrength * Math.min(1, leafyTreesInView.length / 3);
  while (leafSpawnAcc >= 1) {
    leafSpawnAcc -= 1;
    const tr = leafyTreesInView[Math.floor(Math.random() * leafyTreesInView.length)];
    const icon = itemDefs[tr.type].icon;
    if (!icon || !icon.width) continue;
    const bb = getIconOpaqueBBox(tr.type); // js/inventory.js
    const left = (tr.col + 0.5) * TILE - icon.width / 2, top = (tr.row + 1) * TILE - icon.height;
    const cols = treeLeafColors(tr.type);
    leafFlecks.push({
      x: left + bb.x0 + Math.random() * (bb.x1 - bb.x0),
      y: top + bb.y0 + Math.random() * (bb.y1 - bb.y0) * 0.55, // somewhere in the canopy
      vx: (Math.random() - 0.3) * 4 * windStrength, vy: 1 + Math.random() * 3,
      t: 0, life: 99, color: Math.random() < 0.5 ? cols[0] : cols[1], cols,
      slow: true, phase: Math.random() * 6.28,
      floorY: (tr.row + 1) * TILE + (Math.random() - 0.5) * 18, // the ground around the trunk
      landedT: -1, ...newLeafAnim(),
    });
  }
}

// --- Leaf.png as the falling leaf (per request: "yung leaf.png na lang
// gawin mong nahuhulog na leaves kahit sa animation") ------------------
// assets/particles/Leaf.png: 6 frames of 12x7, a leaf tumbling. Green as
// drawn; for orange / red / yellow trees a recoloured copy is made once
// (its shading mapped onto that tree's two leaf colours) and cached.
const LEAF_SPRITE_W = 12, LEAF_SPRITE_H = 7, LEAF_SPRITE_FRAMES = 6;
const LEAF_SPRITE_SCALE = 0.7;   // world px per art px — a bit under the screen-wide weather leaves
const leafSpriteCache = new Map();
function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function leafSpriteFor(cols) {
  const img = assets.leaf;
  if (!img || !img.width) return null;
  if (!cols || cols[0] === "#5d9a3c") return img; // plain green trees: the art as it is
  const key = cols.join();
  if (leafSpriteCache.has(key)) return leafSpriteCache.get(key);
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  try {
    const d = g.getImageData(0, 0, c.width, c.height);
    const lo = hexRgb(cols[1]), hi = hexRgb(cols[0]);
    for (let i = 0; i < d.data.length; i += 4) {
      if (d.data[i + 3] < 20) continue;
      const r = d.data[i], gg = d.data[i + 1], b = d.data[i + 2];
      const lum = (r * 0.3 + gg * 0.59 + b * 0.11) / 255;
      if (lum < 0.22) continue; // keep the dark outline
      const k = Math.min(1, Math.max(0, (lum - 0.3) / 0.5));
      d.data[i] = lo[0] + (hi[0] - lo[0]) * k;
      d.data[i + 1] = lo[1] + (hi[1] - lo[1]) * k;
      d.data[i + 2] = lo[2] + (hi[2] - lo[2]) * k;
    }
    g.putImageData(d, 0, 0);
  } catch (e) { leafSpriteCache.set(key, img); return img; } // tainted canvas (file://)
  leafSpriteCache.set(key, c);
  return c;
}
function newLeafAnim() {
  return { frame: Math.floor(Math.random() * LEAF_SPRITE_FRAMES), frameT: Math.random() * 6, fps: 5 + Math.random() * 4, flip: Math.random() < 0.5 };
}

const plantWobbles = new Map();   // "col,row" -> { kind: "sway"|"shake", t, dir }
const leafFlecks = [];            // { x, y, vx, vy, t, life, color }
const bushTouching = new Set();   // bushes the player's feet were in last frame
let plantFxLastPos = null;
let plantFxLastTime = performance.now();

function isSwayingBush(type) {
  return /^bush(Big|Medium|Small|XS|Flower)/.test(type);
}

function isShakingTree(type) {
  const def = itemDefs[type];
  return !!(def && def.resource && def.resource.breakAnim === "slice");
}

function bushLeafColor(type) {
  if (/Red/.test(type)) return ["#b8423a", "#8f2e2a"];
  if (/Yellow/.test(type)) return ["#d8b64a", "#a88a2e"];
  if (/LightGreen/.test(type)) return ["#9cc45a", "#76a044"];
  return ["#5d9a3c", "#3f7430"];
}

// Called from resolveHarvestHit() (js/resources.js) on every chop.
function triggerTreeShake(col, row) {
  plantWobbles.set(tileKey(col, row), { kind: "shake", t: 0, dir: 1 });
}

// A stone hit by the pickaxe — per request ("lagyan mo rin ng nginig yung
// stone kapag pinipickaxe"): a quick, tight side-to-side tremble of the
// whole rock (it's solid, so no lean like a bush), a touch stronger and
// longer than a tree's chop shake so it reads as the rock taking the hit.
const STONE_SHAKE_SECONDS = 0.32;
const STONE_SHAKE_PX = 1.5;       // world px
const STONE_SHAKE_FREQ = 70;
function triggerStoneShake(col, row) {
  plantWobbles.set(tileKey(col, row), { kind: "stone", t: 0, dir: 1 });
}

function triggerBushSway(type, col, row, dir) {
  const key = tileKey(col, row);
  const w = plantWobbles.get(key);
  if (w && w.kind === "sway" && w.t < 0.35) return; // still swinging from a moment ago
  plantWobbles.set(key, { kind: "sway", t: 0, dir: dir || 1 });
  // A few leaves shaken loose.
  const [c1, c2] = bushLeafColor(type);
  const icon = itemDefs[type].icon;
  const h = (icon && icon.height) || 16;
  for (let i = 0; i < 3; i++) {
    leafFlecks.push({
      x: (col + 0.5) * TILE + (Math.random() - 0.5) * 10,
      y: (row + 1) * TILE - h * (0.4 + Math.random() * 0.4),
      vx: (Math.random() - 0.5) * 14 + dir * 8,
      vy: -8 - Math.random() * 10,
      t: 0,
      life: 0.6 + Math.random() * 0.4,
      color: Math.random() < 0.5 ? c1 : c2, cols: [c1, c2], sprite: true, ...newLeafAnim(),
    });
  }
}

// Performance: never keep more than this many loose leaves/chips — chopping
// a lot in a forest can't pile up thousands of particles.
const MAX_LEAF_FLECKS = 160;
function capLeafFlecks() {
  if (leafFlecks.length > MAX_LEAF_FLECKS) leafFlecks.splice(0, leafFlecks.length - MAX_LEAF_FLECKS);
}

// Called every frame (main.js).
function updatePlantFx() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - plantFxLastTime) / 1000);
  plantFxLastTime = now;

  for (const [key, w] of plantWobbles) {
    w.t += dt;
    if (w.t >= (w.kind === "sway" ? BUSH_SWAY_SECONDS : w.kind === "stone" ? STONE_SHAKE_SECONDS : TREE_SHAKE_SECONDS)) plantWobbles.delete(key);
  }
  updateWind(dt);
  updateFallingTrees(dt);
  capLeafFlecks();
  for (let i = leafFlecks.length - 1; i >= 0; i--) {
    const f = leafFlecks[i];
    if (f.slow) {
      // a falling leaf: drifts with the wind, swings side to side, settles
      // on the ground and fades
      f.t += dt;
      if (f.landedT < 0) {
        f.frameT += dt * f.fps; f.frame = Math.floor(f.frameT) % LEAF_SPRITE_FRAMES;
        f.vy = Math.min(LEAF_FALL_SPEED, f.vy + 4 * dt);
        f.x += (f.vx + Math.sin(f.t * 3 + f.phase) * 7) * dt;
        f.y += f.vy * dt * (0.7 + 0.3 * Math.abs(Math.cos(f.t * 3 + f.phase)));
        if (f.y >= f.floorY) { f.landedT = 0; f.y = f.floorY; }
      } else {
        f.landedT += dt;
        if (f.landedT > 1.5) leafFlecks.splice(i, 1);
      }
      continue;
    }
    f.t += dt;
    if (f.sprite) { f.frameT += dt * f.fps; f.frame = Math.floor(f.frameT) % LEAF_SPRITE_FRAMES; }
    f.vy += 30 * dt;               // gravity
    f.vx *= 0.96;
    f.x += f.vx * dt + Math.sin(f.t * 9) * 4 * dt; // a little flutter
    f.y += f.vy * dt;
    if (f.t >= f.life) leafFlecks.splice(i, 1);
  }

  // Walking through bushes (outdoors).
  if (player.scene !== "outside") { plantFxLastPos = null; bushTouching.clear(); return; }
  const feetY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  const last = plantFxLastPos;
  plantFxLastPos = { x: player.x, y: feetY };
  if (!last) return;
  const dx = player.x - last.x, dy = feetY - last.y;
  const moving = Math.abs(dx) + Math.abs(dy) > 0.05;

  const pc = Math.floor(player.x / TILE), pr = Math.floor(feetY / TILE);
  const nowTouching = new Set();
  for (let r = pr - 1; r <= pr + 2; r++) {
    for (let c = pc - 2; c <= pc + 2; c++) {
      const key = tileKey(c, r);
      const type = objectLayer.get(key);
      if (!type || !isSwayingBush(type)) continue;
      const icon = itemDefs[type].icon;
      if (!icon || !icon.width) continue;
      const bb = getIconOpaqueBBox(type); // js/inventory.js
      const left = (c + 0.5) * TILE - icon.width / 2;
      const top = (r + 1) * TILE - icon.height;
      const inX = player.x + BODY_COLLISION_HALF_W > left + bb.x0 && player.x - BODY_COLLISION_HALF_W < left + bb.x1;
      const inY = feetY > top + bb.y0 + (bb.y1 - bb.y0) * 0.35 && feetY < top + bb.y1 + 3;
      if (!inX || !inY) continue;
      nowTouching.add(key);
      // Sway on the way in, and again every so often while pushing through.
      if (moving && (!bushTouching.has(key) || !plantWobbles.has(key))) {
        const dir = Math.abs(dx) > 0.01 ? Math.sign(dx) : (player.x < (c + 0.5) * TILE ? 1 : -1);
        triggerBushSway(type, c, r, dir);
      }
    }
  }
  bushTouching.clear();
  for (const k of nowTouching) bushTouching.add(k);
}

// The transform for an object mid-sway/shake, around its base point
// (screen px). Returns false when nothing's moving there.
function applyPlantFxTransform(col, row, type) {
  const w = plantWobbles.get(tileKey(col, row));
  if (!w) {
    // Wind: lean the top a little, the base stays planted.
    const tree = type && isWindTree(type), bush = type && isSwayingBush(type);
    if (!tree && !bush) return false;
    const icon = itemDefs[type].icon;
    if (!icon || !icon.height) return false;
    const px = (tree ? WIND_TREE_PX : WIND_BUSH_PX) * windStrength * windWave(col, row);
    const k = -px / icon.height;
    const bx = ((col + 0.5) * TILE - camX) * zoom;
    const by = ((row + 1) * TILE - camY) * zoom;
    ctx.translate(bx, by);
    ctx.transform(1, 0, k, 1, 0, 0);
    ctx.translate(-bx, -by);
    return true;
  }
  const bx = ((col + 0.5) * TILE - camX) * zoom;
  const by = ((row + 1) * TILE - camY) * zoom;
  if (w.kind === "sway") {
    const k = BUSH_SWAY_SKEW * w.dir * Math.cos(w.t * BUSH_SWAY_FREQ) * (1 - w.t / BUSH_SWAY_SECONDS);
    ctx.translate(bx, by);
    ctx.transform(1, 0, k, 1, 0, 0); // skewX: the top moves, the base stays put
    ctx.translate(-bx, -by);
  } else if (w.kind === "stone") {
    const d = STONE_SHAKE_PX * zoom * Math.sin(w.t * STONE_SHAKE_FREQ) * (1 - w.t / STONE_SHAKE_SECONDS);
    ctx.translate(Math.round(d), 0);
  } else {
    const d = TREE_SHAKE_PX * zoom * Math.sin(w.t * TREE_SHAKE_FREQ) * (1 - w.t / TREE_SHAKE_SECONDS);
    ctx.translate(Math.round(d), 0);
  }
  return true;
}

// The loose leaves — drawn after the depth-sorted objects (camera.js).
function drawLeafFlecks() {
  if (!leafFlecks.length || player.scene !== "outside") return;
  const s = Math.max(1, Math.round(zoom));
  ctx.save();
  for (const f of leafFlecks) {
    const sx = Math.round((f.x - camX) * zoom), sy = Math.round((f.y - camY) * zoom);
    if (sx < -10 || sy < -10 || sx > view.width + 10 || sy > view.height + 10) continue;
    if ((f.slow || f.sprite) && f.cols) {
      const img = leafSpriteFor(f.cols);
      if (img) {
        ctx.globalAlpha = f.slow ? (f.landedT < 0 ? 1 : Math.max(0, 1 - f.landedT / 1.5)) : Math.max(0, 1 - f.t / f.life);
        const w = LEAF_SPRITE_W * LEAF_SPRITE_SCALE * zoom, h = LEAF_SPRITE_H * LEAF_SPRITE_SCALE * zoom;
        const fr = f.slow && f.landedT >= 0 ? 0 : f.frame; // lying flat once it has landed
        ctx.imageSmoothingEnabled = false;
        if (f.flip) {
          ctx.save(); ctx.translate(sx, sy); ctx.scale(-1, 1);
          ctx.drawImage(img, fr * LEAF_SPRITE_W, 0, LEAF_SPRITE_W, LEAF_SPRITE_H, -w / 2, -h / 2, w, h);
          ctx.restore();
        } else {
          ctx.drawImage(img, fr * LEAF_SPRITE_W, 0, LEAF_SPRITE_W, LEAF_SPRITE_H, sx - w / 2, sy - h / 2, w, h);
        }
        continue;
      }
    }
    if (f.slow) {
      ctx.globalAlpha = f.landedT < 0 ? 1 : Math.max(0, 1 - f.landedT / 1.5);
      // tumbling: flat (3x2) / edge-on (2x3) as it swings, with a dark rim so
      // a green leaf still shows against green grass
      const flat = f.landedT >= 0 || Math.cos(f.t * 3 + f.phase) > 0;
      const w = (flat ? 3 : 2) * s, h = (flat ? 2 : 3) * s;
      ctx.fillStyle = "rgba(20,30,12,0.75)";
      ctx.fillRect(sx - s * 0.5, sy - s * 0.5, w + s, h + s);
      ctx.fillStyle = f.color;
      ctx.fillRect(sx, sy, w, h);
      continue;
    }
    ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
    ctx.fillStyle = f.color;
    ctx.fillRect(sx, sy, s * 2, s);
  }
  ctx.restore();
}


/* ---------------- chopping a tree: cracks, flying chips, falling leaves ----
   Per request ("animation din kapag na cucut ko yung trees nagkaka crack
   tapos nahuhulog na leaves"):
   - every chop knocks a few leaves loose from the canopy (they pop out and
     flutter down like the wind's leaves) and sends wood chips flying from
     the cut;
   - a notch with cracks appears on the trunk where it's being hit, bigger
     with every chop (resourceHits, js/resources.js);
   - the final chop brings down a big shower of leaves and chips. */
const CHOP_LEAVES = 6, FELL_LEAVES = 22, CHOP_CHIPS = 5, FELL_CHIPS = 10;
const WOOD_CHIP_COLORS = ["#d9a868", "#a8743e", "#7a4f28"];
const trunkSpotCache = new Map();

// Where the trunk is on a tree's art: the narrowest run of pixels a little
// above the bottom (roots below, canopy above). Offsets from the tile's
// bottom-centre, world px.
function treeTrunkSpot(type) {
  if (trunkSpotCache.has(type)) return trunkSpotCache.get(type);
  const icon = itemDefs[type] && itemDefs[type].icon;
  let spot = { dx: 0, dy: -8 };
  if (icon && icon.width) {
    try {
      const c = document.createElement("canvas");
      c.width = icon.width; c.height = icon.height;
      const g = c.getContext("2d");
      g.drawImage(icon, 0, 0);
      const d = g.getImageData(0, 0, icon.width, icon.height).data;
      const H = icon.height, W = icon.width;
      let best = null;
      for (let up = 4; up <= Math.min(16, H - 2); up++) {
        const y = H - up;
        let x0 = -1, x1 = -1;
        for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 40) { if (x0 < 0) x0 = x; x1 = x; }
        if (x0 < 0) continue;
        const w = x1 - x0;
        if (!best || w < best.w) best = { w, cx: (x0 + x1) / 2, up };
      }
      if (best) spot = { dx: best.cx - W / 2, dy: -Math.max(4, Math.min(best.up + 2, 12)) };
    } catch (e) { /* tainted canvas (file://) — keep the default */ }
  }
  trunkSpotCache.set(type, spot);
  return spot;
}

function treeChopFx(type, col, row, final) {
  const def = itemDefs[type];
  const icon = def && def.icon;
  if (!icon || !icon.width) return;
  const spot = treeTrunkSpot(type);
  const tx = (col + 0.5) * TILE + spot.dx, ty = (row + 1) * TILE + spot.dy;
  // wood chips out of the cut
  const nChips = final ? FELL_CHIPS : CHOP_CHIPS;
  for (let i = 0; i < nChips; i++) {
    leafFlecks.push({
      x: tx + (Math.random() - 0.5) * 3, y: ty + (Math.random() - 0.5) * 2,
      vx: (Math.random() - 0.5) * 40, vy: -14 - Math.random() * 16,
      t: 0, life: 0.5 + Math.random() * 0.35,
      color: WOOD_CHIP_COLORS[Math.floor(Math.random() * WOOD_CHIP_COLORS.length)],
    });
  }
  // leaves knocked out of the canopy
  const bb = getIconOpaqueBBox(type); // js/inventory.js
  const left = (col + 0.5) * TILE - icon.width / 2, top = (row + 1) * TILE - icon.height;
  // snow knocked off the branches (js/snowground.js) — bare trees too
  if (typeof snowTreePuffs === "function") {
    snowTreePuffs(leafFlecks, left + bb.x0, left + bb.x1, top + bb.y0, top + bb.y0 + (bb.y1 - bb.y0) * 0.5, final ? 18 : 7);
  }
  const cols = treeLeafColors(type);
  if (!cols) return; // bare tree
  const n = final ? FELL_LEAVES : CHOP_LEAVES;
  for (let i = 0; i < n; i++) {
    leafFlecks.push({
      x: left + bb.x0 + Math.random() * (bb.x1 - bb.x0),
      y: top + bb.y0 + Math.random() * (bb.y1 - bb.y0) * (final ? 0.8 : 0.55),
      vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 8, // a little pop before they flutter down
      t: 0, life: 99, color: Math.random() < 0.5 ? cols[0] : cols[1], cols,
      slow: true, phase: Math.random() * 6.28,
      floorY: (row + 1) * TILE + (Math.random() - 0.5) * (final ? 30 : 20),
      landedT: -1, ...newLeafAnim(),
    });
  }
}

// The notch + cracks on a tree being chopped — drawn on top of the tree
// (inside its shake/sway transform, so they move with it). js/camera.js.
const CRACK_STAGES = [
  null,
  { notch: [[0, 0], [1, 0]], crack: [[-1, -1], [2, 1]] },
  { notch: [[-1, 0], [0, 0], [1, 0], [0, 1]], crack: [[-2, -1], [-1, -2], [2, 1], [3, 2], [1, -1]] },
  { notch: [[-1, 0], [0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [0, -1]], crack: [[-2, -1], [-3, -2], [-2, -3], [3, 1], [4, 2], [2, -1], [3, -2], [1, 2], [-1, 2]] },
];
function drawTreeCrack(type, col, row) {
  if (typeof resourceHits === "undefined" || !isShakingTree(type)) return;
  const hits = resourceHits.get(tileKey(col, row));
  if (!hits) return;
  const st = CRACK_STAGES[Math.min(3, hits)];
  const spot = treeTrunkSpot(type);
  const bx = (col + 0.5) * TILE + spot.dx, by = (row + 1) * TILE + spot.dy;
  const z = zoom;
  const px = (dx, dy) => [Math.round((bx + dx - camX) * z), Math.round((by + dy - camY) * z)];
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#24160c"; // dark crack lines (and an edge round the notch)
  for (const [dx, dy] of st.crack) { const [x, y] = px(dx, dy); ctx.fillRect(x, y, Math.ceil(z), Math.ceil(z)); }
  for (const [dx, dy] of st.notch) {
    const [x, y] = px(dx, dy);
    ctx.fillRect(x - Math.ceil(z * 0.5), y - Math.ceil(z * 0.5), Math.ceil(z * 2), Math.ceil(z * 2));
  }
  ctx.fillStyle = "#e2b77c"; // the pale fresh wood showing in the notch
  for (const [dx, dy] of st.notch) { const [x, y] = px(dx, dy); ctx.fillRect(x, y, Math.ceil(z), Math.ceil(z)); }
  ctx.restore();
}


/* ---------------- felling: the cut tree topples over ----------------
   Per request ("kapag naputol na ... babagsak yung pinagputulan pa left or
   right depende sa direction ng pag cut ... parang sa stardew valley"):
   on the felling chop the stump stays and everything ABOVE the cut is
   drawn on its own, pivoting on the cut: it tips over slowly, speeds up,
   slams down flat, bounces a touch, then fades while leaves and chips
   burst along where it landed. It falls AWAY from the player. The wood
   pops out where it lands (onLand). Cosmetic only. */
const FELL_TIP_SECONDS = 1.05;   // from upright to flat on the ground
const FELL_SETTLE_SECONDS = 0.3; // the little bounce
const FELL_FADE_SECONDS = 0.55;
const fallingTrees = [];

function fellDirection(col) {
  const tx = (col + 0.5) * TILE;
  if (Math.abs(player.x - tx) > 3) return player.x < tx ? 1 : -1; // away from the player
  return player.facing === "left" ? -1 : 1;
}

// Called from resolveHarvestHit() (js/resources.js) on the felling chop,
// before the tree is swapped for its stump. Returns true when it'll animate.
function startTreeFall(type, col, row, onLand) {
  const def = itemDefs[type];
  const icon = def && def.icon;
  if (!icon || !icon.width || player.scene !== "outside" || isStumpType(type)) return false;
  const spot = treeTrunkSpot(type);
  fallingTrees.push({
    type, col, row, icon, dir: fellDirection(col), t: 0,
    pivotX: (col + 0.5) * TILE + spot.dx,
    pivotY: (row + 1) * TILE + spot.dy,      // the cut
    left: (col + 0.5) * TILE - icon.width / 2,
    top: (row + 1) * TILE - icon.height,
    srcH: Math.max(1, Math.round(icon.height + spot.dy)), // art rows above the cut
    landed: false, onLand,
  });
  return true;
}

function fallAngle(f) {
  const half = Math.PI / 2;
  if (f.t < FELL_TIP_SECONDS) {
    const k = f.t / FELL_TIP_SECONDS;
    return f.dir * half * Math.pow(k, 2.4);           // slow start, then it really goes
  }
  const u = Math.min(1, (f.t - FELL_TIP_SECONDS) / FELL_SETTLE_SECONDS);
  return f.dir * (half - 0.12 * Math.sin(u * Math.PI)); // bounce up a little and back down
}

function updateFallingTrees(dt) {
  for (let i = fallingTrees.length - 1; i >= 0; i--) {
    const f = fallingTrees[i];
    f.t += dt;
    if (!f.landed && f.t >= FELL_TIP_SECONDS) {
      f.landed = true;
      landingBurst(f);
      if (f.onLand) { try { f.onLand(f.landX, f.landY); } catch (e) { /* keep going */ } }
    }
    if (f.t > FELL_TIP_SECONDS + FELL_SETTLE_SECONDS + FELL_FADE_SECONDS) fallingTrees.splice(i, 1);
  }
}

// Leaves and chips all along where the trunk and canopy hit the ground.
function landingBurst(f) {
  const len = f.srcH;                  // world px from the cut to the top of the tree
  const cols = treeLeafColors(f.type);
  f.landX = f.pivotX + f.dir * len * 0.6;
  f.landY = f.pivotY;
  if (typeof snowTreePuffs === "function") { // a burst of snow where the canopy hits (js/snowground.js)
    const a = f.pivotX + f.dir * len * 0.3, b = f.pivotX + f.dir * len;
    snowTreePuffs(leafFlecks, Math.min(a, b), Math.max(a, b), f.pivotY - 8, f.pivotY + 2, 24);
  }
  for (let i = 0; i < 26; i++) {
    const d = 0.25 + Math.random() * 0.8; // along the fallen tree (canopy end gets most)
    const x = f.pivotX + f.dir * len * d, y = f.pivotY + (Math.random() - 0.6) * 10;
    if (cols && i % 3 !== 0) {
      leafFlecks.push({
        x, y, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 14,
        t: 0, life: 99, color: cols[0], cols, slow: true, phase: Math.random() * 6.28,
        floorY: f.pivotY + (Math.random() - 0.3) * 12, landedT: -1, ...newLeafAnim(),
      });
    } else {
      leafFlecks.push({
        x, y, vx: (Math.random() - 0.5) * 36, vy: -12 - Math.random() * 14,
        t: 0, life: 0.5 + Math.random() * 0.4,
        color: WOOD_CHIP_COLORS[Math.floor(Math.random() * WOOD_CHIP_COLORS.length)],
      });
    }
  }
}

// Depth-sortable entries for renderWorldObjectsSorted() (js/camera.js) —
// sorted on the stump's row, so things in front of the tree still cover it.
function fallingTreeDrawables() {
  const out = [];
  if (player.scene !== "outside") return out;
  for (const f of fallingTrees) out.push({ sortY: (f.row + 1) * TILE + 0.5, draw: () => drawFallingTree(f) });
  return out;
}

function drawFallingTree(f) {
  const fadeT = f.t - FELL_TIP_SECONDS - FELL_SETTLE_SECONDS;
  const alpha = fadeT > 0 ? Math.max(0, 1 - fadeT / FELL_FADE_SECONDS) : 1;
  if (alpha <= 0) return;
  const px = (f.pivotX - camX) * zoom, py = (f.pivotY - camY) * zoom;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.translate(px, py);
  ctx.rotate(fallAngle(f));
  const art = (typeof snowTreeIcon === "function" && snowTreeIcon(f.type)) || f.icon; // snowy while it snows (js/snowground.js)
  ctx.drawImage(art, 0, 0, f.icon.width, f.srcH,
    (f.left - f.pivotX) * zoom, (f.top - f.pivotY) * zoom, f.icon.width * zoom, f.srcH * zoom);
  ctx.restore();
}

// How far (world px, sideways) a plant's ground shadow moves with its
// animation right now — per request, the shadow sways / shakes along with
// the tree (drawTreeGroundShadows(), js/camera.js). The shadow is the
// canopy's, so it follows the canopy (about half the top's lean); a chop
// shake moves the whole tree, so the shadow moves the same.
function plantFxShadowShift(col, row, type) {
  const w = plantWobbles.get(tileKey(col, row));
  const icon = itemDefs[type] && itemDefs[type].icon;
  const H = (icon && icon.height) || 32;
  if (!w) {
    const tree = isWindTree(type), bush = isSwayingBush(type);
    if (!tree && !bush) return 0;
    return (tree ? WIND_TREE_PX : WIND_BUSH_PX) * windStrength * windWave(col, row) * 0.55;
  }
  if (w.kind === "sway") {
    const k = BUSH_SWAY_SKEW * w.dir * Math.cos(w.t * BUSH_SWAY_FREQ) * (1 - w.t / BUSH_SWAY_SECONDS);
    return -k * H * 0.55;
  }
  if (w.kind === "stone") return STONE_SHAKE_PX * Math.sin(w.t * STONE_SHAKE_FREQ) * (1 - w.t / STONE_SHAKE_SECONDS);
  return TREE_SHAKE_PX * Math.sin(w.t * TREE_SHAKE_FREQ) * (1 - w.t / TREE_SHAKE_SECONDS);
}
