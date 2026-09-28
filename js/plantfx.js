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
      color: Math.random() < 0.5 ? c1 : c2,
    });
  }
}

// Called every frame (main.js).
function updatePlantFx() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - plantFxLastTime) / 1000);
  plantFxLastTime = now;

  for (const [key, w] of plantWobbles) {
    w.t += dt;
    if (w.t >= (w.kind === "sway" ? BUSH_SWAY_SECONDS : TREE_SHAKE_SECONDS)) plantWobbles.delete(key);
  }
  for (let i = leafFlecks.length - 1; i >= 0; i--) {
    const f = leafFlecks[i];
    f.t += dt;
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
function applyPlantFxTransform(col, row) {
  const w = plantWobbles.get(tileKey(col, row));
  if (!w) return false;
  const bx = ((col + 0.5) * TILE - camX) * zoom;
  const by = ((row + 1) * TILE - camY) * zoom;
  if (w.kind === "sway") {
    const k = BUSH_SWAY_SKEW * w.dir * Math.cos(w.t * BUSH_SWAY_FREQ) * (1 - w.t / BUSH_SWAY_SECONDS);
    ctx.translate(bx, by);
    ctx.transform(1, 0, k, 1, 0, 0); // skewX: the top moves, the base stays put
    ctx.translate(-bx, -by);
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
    ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
    ctx.fillStyle = f.color;
    ctx.fillRect(Math.round((f.x - camX) * zoom), Math.round((f.y - camY) * zoom), s * 2, s);
  }
  ctx.restore();
}
