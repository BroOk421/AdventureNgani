"use strict";

/* =================================================================
   SWORD COMBO — a 3-hit, two-handed sword animation, done the way a
   pixel artist animates it.

   Per request ("medyo messy yung pagka drawing ng 2 hand ... gawin mo as
   professional artist sa pag animate ng sword 3 hit with 2 hand sa handle
   ng sword"). The old swing moved the blade and the arms smoothly every
   frame at any angle and any sub-pixel position, so the arms wobbled and
   the blade's pixels shimmered. Now:

   - KEY POSES, held. Every attack is six poses — wind-up, anticipation,
     SMEAR (the strike), impact, follow-through, recovery — each held for
     its share of the swing, like hand-made sprite frames. Nothing tweens
     between them, so nothing wobbles.
   - ONE PIXEL GRID. The arms, the hands, the blade and the smear are all
     drawn at the sprite's own art resolution (64 px frame) on a small
     canvas, then scaled up with the sprite — every pixel is the same size
     as the character's.
   - THE BLADE IS PRE-ROTATED like pixel art (rotsprite-style: scaled up,
     rotated, scaled back down, then snapped to the sword's own colours
     with a hard edge) to 32 directions, once per sword, cached.
   - BOTH HANDS ON THE GRIP: two arms from the shoulders (two-bone IK,
     elbows bending the natural way), two fists one above the other on the
     handle. In side view the far arm goes behind the body.
   - THE COMBO: hit 1 an overhead chop, hit 2 a rising slash, hit 3 a wide
     cleave (the finisher: a bigger smear, more bits flying, a small screen
     shake). Swinging again within COMBO_WINDOW_SEC continues the combo,
     otherwise it starts over at hit 1.

   The body is the arm-less Hit pose (assets/sprites/SwordHold/), drawn by
   the normal character pipeline (lighting, hurt flash, relight all work),
   leaning into the strike on its frames 2-3; this file adds the arms and
   the sword over / under it.
================================================================= */

// --- the arm-less body -------------------------------------------------------
for (const v of ["Down", "Up", "Side"]) {
  assets["swordHold" + v] = new Image();
  assets["swordHold" + v].src = "assets/sprites/SwordHold/SwordHold_" + v + "-Sheet.png";
}
ONE_SHOT_ACTION_SHEETS.swordHit = { down: "swordHoldDown", up: "swordHoldUp", side: "swordHoldSide" };
FRAME_COUNTS.swordHit = FRAME_COUNTS.hit;
ANIM_FPS.swordHit = ANIM_FPS.hit;

const COMBO_WINDOW_SEC = 0.9; // gap allowed between swings for the combo to carry on

/* --- the key poses ---------------------------------------------------------
   Sprite art px, relative to the sprite's centre (32, 32), facing RIGHT /
   DOWN / UP (left = right mirrored). `hand` = the sword's guard, `ang` =
   the direction the blade points (radians, screen: 0 right, PI/2 down),
   `d` = share of the swing the pose is held for, `smear` = [from, to]
   angle of the strike's crescent, `sq` = its vertical squash (a flat,
   wide sweep). The hit lands at 0.5 of the swing — the IMPACT pose. */
const P = (hand, ang, d, extra) => Object.assign({ hand, ang, d }, extra || {});
const SWORD_POSES = {
  overhead: {
    right: [
      P([-1, -6], -2.5, 0.20), P([-2, -7], -2.75, 0.18),
      P([6, 0], 0.3, 0.12, { smear: [-2.75] }),
      P([7, 4], 0.75, 0.16, { lean: true }), P([6, 5], 0.95, 0.16, { lean: true }), P([4, 2], 0.25, 0.18),
    ],
    down: [
      P([6, -6], -1.75, 0.20), P([6, -7], -1.95, 0.18),
      P([2, 3], 1.3, 0.12, { smear: [-1.95] }),
      P([1, 6], 1.65, 0.16, { lean: true }), P([0, 7], 1.8, 0.16, { lean: true }), P([2, 3], 1.2, 0.18),
    ],
  },
  rising: {
    right: [
      P([-2, 5], 2.3, 0.20), P([-3, 5], 2.55, 0.18),
      P([5, -3], -0.8, 0.12, { smear: [2.55] }),
      P([5, -5], -1.1, 0.16, { lean: true }), P([4, -6], -1.3, 0.16, { lean: true }), P([3, 0], -0.3, 0.18),
    ],
    down: [
      P([-5, 4], 2.6, 0.20), P([-6, 4], 2.8, 0.18),
      P([4, -3], -0.55, 0.12, { smear: [2.8] }),
      P([5, -5], -1.0, 0.16, { lean: true }), P([4, -6], -1.2, 0.16, { lean: true }), P([3, 0], -0.2, 0.18),
    ],
  },
  cleave: {
    right: [
      P([-4, 1], 2.95, 0.20), P([-5, 1], 3.1, 0.18),
      P([7, 2], 0.05, 0.12, { smear: [3.1], sq: 0.55 }),
      P([8, 2], -0.05, 0.16, { lean: true }), P([7, 3], 0.3, 0.16, { lean: true }), P([4, 2], 0.6, 0.18),
    ],
    down: [
      P([-6, 2], 3.0, 0.20), P([-7, 2], 3.1, 0.18),
      P([6, 3], 0.05, 0.12, { smear: [3.1], sq: 0.6 }),
      P([7, 3], -0.1, 0.16, { lean: true }), P([6, 4], 0.3, 0.16, { lean: true }), P([3, 3], 0.9, 0.18),
    ],
  },
};
// Side view: on the wind-up the blade is BEHIND the body (drawn before it),
// it comes round in front on the strike.
for (const st of Object.values(SWORD_POSES)) st.right[0].behind = st.right[1].behind = true;
SWORD_POSES.sweep = SWORD_POSES.cleave; // the skills' sweep (js/skills.js) uses the cleave
const COMBO_STYLES = ["overhead", "rising", "cleave"];

// facing up = the down poses seen from behind: mirrored top-to-bottom, a little higher
function posesFor(style, facing) {
  const set = SWORD_POSES[style];
  if (!set) return null;
  if (facing === "up") {
    if (!set.up) set.up = set.down.map((p) => Object.assign({}, p, {
      hand: [p.hand[0], -p.hand[1] * 0.6 - 2], ang: -p.ang,
      smear: p.smear ? [-p.smear[0]] : undefined,
    }));
    return set.up;
  }
  return set[facing === "down" ? "down" : "right"];
}
function poseAt(poses, t) {
  let acc = 0;
  for (let i = 0; i < poses.length; i++) { acc += poses[i].d; if (t < acc) return poses[i]; }
  return poses[poses.length - 1];
}

// --- shoulders and arms (art px from the sprite's centre) -------------------
const SWORD_BODY = {
  right: { near: [-2, 1], far: [1, 0], lean: [1, 0] },
  down: { near: [-5.5, 1], far: [5.5, 1], lean: [0, 1] },
  up: { near: [-5.5, 1], far: [5.5, 1], lean: [0, -1] },
};
const ARM_UPPER = 4.5, ARM_FORE = 4.5;
const ARM_PAL = {
  near: { sleeve: "#eae6de", sleeveShade: "#c0bcbc", skin: "#d9a066", skinShade: "#a26543" },
  far: { sleeve: "#c0bcbc", sleeveShade: "#8c888e", skin: "#a26543", skinShade: "#763d2b" },
};

/* --- the blade, rotated like pixel art -------------------------------------- */
const BLADE_DIRS = 32;
const bladeCache = new Map(); // "type|dir" -> { c, cx, cy }
function swordArtFor(type) {
  const d = type && itemDefs[type];
  if (!d) return null;
  const strip = (!d.bossDrop && d.animStrip && assets[d.animStrip] && assets[d.animStrip].width) ? assets[d.animStrip] : d.icon;
  if (!strip || !strip.width) return null;
  const S = strip.height, big = S >= 32;
  return { strip, S, big, grip: big ? HOLD_GRIP : [S * 0.16, S * 0.84] };
}
function bladeSprite(type, ang) {
  const dir = ((Math.round(ang / (Math.PI * 2) * BLADE_DIRS) % BLADE_DIRS) + BLADE_DIRS) % BLADE_DIRS;
  const key = type + "|" + dir;
  let e = bladeCache.get(key);
  if (e) return e;
  const art = swordArtFor(type);
  if (!art) return null;
  const { strip, S, grip } = art;
  const U = 4;                                  // work at 4x, like rotsprite
  const N = Math.ceil(S * 1.5) * 2 + 4;         // room for any angle round the grip
  const src = document.createElement("canvas"); src.width = S; src.height = S;
  const sg = src.getContext("2d", { willReadFrequently: true });
  sg.imageSmoothingEnabled = false;
  sg.drawImage(strip, 0, 0, S, S, 0, 0, S, S);
  let palette = [];
  try {
    const d = sg.getImageData(0, 0, S, S).data, seen = new Set();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      if (!seen.has(k)) { seen.add(k); palette.push([d[i], d[i + 1], d[i + 2]]); }
    }
  } catch (err) { palette = []; }
  const big4 = document.createElement("canvas"); big4.width = N * U; big4.height = N * U;
  const bg = big4.getContext("2d");
  bg.imageSmoothingEnabled = false;
  bg.translate(N * U / 2, N * U / 2);
  bg.rotate(dir / BLADE_DIRS * Math.PI * 2 + Math.PI / 4); // the art points up-right (-PI/4)
  bg.drawImage(src, 0, 0, S, S, -grip[0] * U, -grip[1] * U, S * U, S * U);
  const out = document.createElement("canvas"); out.width = N; out.height = N;
  const og = out.getContext("2d", { willReadFrequently: true });
  og.imageSmoothingEnabled = true;
  og.imageSmoothingQuality = "high";
  og.drawImage(big4, 0, 0, N * U, N * U, 0, 0, N, N);
  try {
    // hard pixel edges, and every pixel snapped back to one of the sword's own colours
    const img = og.getImageData(0, 0, N, N), p = img.data;
    for (let i = 0; i < p.length; i += 4) {
      const a = p[i + 3];
      if (a < 110) { p[i + 3] = 0; continue; }
      const r = p[i] * 255 / a, g = p[i + 1] * 255 / a, b = p[i + 2] * 255 / a; // un-premultiply the edge
      let best = null, bd = 1e9;
      for (const c of palette) { const dd = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (dd < bd) { bd = dd; best = c; } }
      if (best) { p[i] = best[0]; p[i + 1] = best[1]; p[i + 2] = best[2]; }
      p[i + 3] = 255;
    }
    og.putImageData(img, 0, 0);
  } catch (err) { /* tainted canvas (file://): keep the smooth version */ }
  const gpu = document.createElement("canvas"); gpu.width = N; gpu.height = N;
  gpu.getContext("2d").drawImage(out, 0, 0);
  e = { c: gpu, cx: N / 2, cy: N / 2 };
  bladeCache.set(key, e);
  return e;
}
function bladeLength(type) {
  const a = swordArtFor(type);
  if (!a) return 20;
  const tip = a.big ? [35, 5] : [a.S * 0.88, a.S * 0.12];
  return Math.hypot(tip[0] - a.grip[0], a.grip[1] - tip[1]);
}

/* --- the smear: a solid crescent, rasterised on the art grid, cached ------- */
const smearCache = new Map();
function smearSprite(from, to, len, sq, rgb, big) {
  const key = [from.toFixed(2), to.toFixed(2), Math.round(len), sq || 1, rgb.join(","), big ? 1 : 0].join("|");
  let e = smearCache.get(key);
  if (e) return e;
  const R = len + 3 + (big ? 2 : 0), N = Math.ceil(R) * 2 + 4, C = N / 2;
  const c = document.createElement("canvas"); c.width = N; c.height = N;
  const g = c.getContext("2d", { willReadFrequently: true });
  const img = g.createImageData(N, N), p = img.data;
  const span = to - from, q = sq || 1;
  const edge = [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])];
  const inside = (x, y) => {
    const dx = x - C, dy = (y - C) / q;
    const r = Math.hypot(dx, dy);
    if (r > R || r < 3) return false;
    let a = Math.atan2(dy, dx);
    // progress u (0 = where it started, 1 = the blade now) along the sweep, either direction
    let u = (a - from) / span;
    for (let k = -2; k <= 2 && (u < 0 || u > 1); k++) u = (a + k * Math.PI * 2 - from) / span;
    if (u < 0 || u > 1) return false;
    // a crescent moon, like the axe's swoosh: pointed at both tips, fullest
    // just behind the blade (u ~ 0.65)
    const thick = (big ? 0.62 : 0.52) * R * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.78 + 0.02)), 1.15);
    return r >= R - thick;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!inside(x + 0.5, y + 0.5)) continue;
    const i = (y * N + x) * 4;
    const border = !inside(x + 1.5, y + 0.5) || !inside(x - 0.5, y + 0.5) || !inside(x + 0.5, y + 1.5) || !inside(x + 0.5, y - 0.5);
    if (border) { p[i] = edge[0]; p[i + 1] = edge[1]; p[i + 2] = edge[2]; p[i + 3] = 235; }
    else { p[i] = 255; p[i + 1] = 255; p[i + 2] = 255; p[i + 3] = 245; }
  }
  g.putImageData(img, 0, 0);
  const gpu = document.createElement("canvas"); gpu.width = N; gpu.height = N;
  gpu.getContext("2d").drawImage(c, 0, 0);
  e = { c: gpu, cx: C, cy: C };
  smearCache.set(key, e);
  if (smearCache.size > 120) smearCache.delete(smearCache.keys().next().value);
  return e;
}

/* --- pixel drawing on the art grid ------------------------------------------- */
function pxLine(g, x0, y0, x1, y1, size, color) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  g.fillStyle = color;
  const off = Math.floor(size / 2);
  for (;;) {
    g.fillRect(x0 - off, y0 - off, size, size);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
// two-bone IK: the elbow, bending toward `bendSign` (+1 / -1) of the shoulder->hand line
function elbowFor(s, h, bendSign) {
  const dx = h[0] - s[0], dy = h[1] - s[1], d = Math.hypot(dx, dy);
  if (d >= ARM_UPPER + ARM_FORE - 0.2 || d < 0.01) return [(s[0] + h[0]) / 2, (s[1] + h[1]) / 2];
  const a = Math.acos(Math.max(-1, Math.min(1, (ARM_UPPER * ARM_UPPER + d * d - ARM_FORE * ARM_FORE) / (2 * ARM_UPPER * d))));
  const base = Math.atan2(dy, dx) + a * bendSign;
  return [s[0] + Math.cos(base) * ARM_UPPER, s[1] + Math.sin(base) * ARM_UPPER];
}
function drawArm(g, s, e, h, pal) {
  pxLine(g, s[0], s[1], e[0], e[1], 4, "#000");   // outline
  pxLine(g, e[0], e[1], h[0], h[1], 4, "#000");
  pxLine(g, s[0], s[1], e[0], e[1], 2, pal.sleeve); // sleeve
  pxLine(g, e[0], e[1], h[0], h[1], 2, pal.skin);   // forearm
  g.fillStyle = pal.sleeveShade;                    // a shade where the sleeve ends
  g.fillRect(Math.round(e[0]) - 1, Math.round(e[1]) - 1, 1, 1);
}
function drawFist(g, h, pal) {
  const x = Math.round(h[0]), y = Math.round(h[1]);
  g.fillStyle = "#000"; g.fillRect(x - 2, y - 2, 4, 4);
  g.fillStyle = pal.skin; g.fillRect(x - 1, y - 1, 2, 2);
  g.fillStyle = pal.skinShade; g.fillRect(x, y, 1, 1);
}

/* --- one frame of the attack, in two layers ---------------------------------- */
const SWORD_LAYER = 160;  // art px canvas, the sprite's centre at its centre
const swordLayer = document.createElement("canvas");
swordLayer.width = SWORD_LAYER; swordLayer.height = SWORD_LAYER;
const swordLayerCtx = swordLayer.getContext("2d");
swordLayerCtx.imageSmoothingEnabled = false;

function swordComboActive() {
  return !!(player.mineSwing && player.action === "swordHit" && isSwordWeapon(player.equippedWeapon) &&
    SWORD_POSES[player.mineSwing.style]);
}
function swordSwingT() {
  const n = FRAME_COUNTS.swordHit || 4;
  const fps = (ANIM_FPS.swordHit || 10) * (player.mineSwing.speed || 1);
  return Math.min(0.999, (player.frame + Math.min(1, player.frameTimer * fps)) / n);
}

// layer "back": drawn before the body; "front": after it
function drawSwordComboLayer(screenX, screenY, z, layer) {
  const type = player.equippedWeapon, art = swordArtFor(type);
  if (!art) return;
  const facingRaw = player.facing, flip = facingRaw === "left";
  const facing = flip ? "right" : facingRaw === "up" ? "up" : facingRaw === "down" ? "down" : "right";
  const poses = posesFor(player.mineSwing.style, facing);
  if (!poses) return;
  const pose = poseAt(poses, swordSwingT());
  const back = facing === "up";
  // what goes in this layer
  const wantFarArm = facing === "right" && layer === "back"; // side view: the far arm is behind the body
  const bladeBehind = back || (facing === "right" && pose.behind);
  const wantBlade = layer === (bladeBehind ? "back" : "front");
  const wantFront = layer === (back ? "back" : "front");
  if (!wantFarArm && !wantFront && !wantBlade) return;

  const g = swordLayerCtx, O = SWORD_LAYER / 2;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, SWORD_LAYER, SWORD_LAYER);
  const body = SWORD_BODY[facing];
  const lean = pose.lean ? body.lean : [0, 0];
  const at = (p) => [O + p[0] + lean[0] * 0, O + p[1]]; // hand positions already include the reach
  const sh = (p) => [O + p[0] + lean[0], O + p[1] + lean[1]];
  const guard = at(pose.hand);
  const dirx = Math.cos(pose.ang), diry = Math.sin(pose.ang);
  const gap = art.big ? 3 : 2.2;
  const fistA = [guard[0] - dirx * 1.5, guard[1] - diry * 1.5];          // top hand, under the guard
  const fistB = [guard[0] - dirx * (1.5 + gap), guard[1] - diry * (1.5 + gap)]; // bottom hand
  const nearS = sh(body.near), farS = sh(body.far);
  // which shoulder holds which hand: the nearer pairing
  const cost = (s, f) => Math.hypot(f[0] - s[0], f[1] - s[1]);
  const swap = cost(nearS, fistA) + cost(farS, fistB) < cost(nearS, fistB) + cost(farS, fistA);
  const nearF = swap ? fistA : fistB, farF = swap ? fistB : fistA;
  // elbows: down in side view; outward from the body seen from the front / back
  const bend = (s, f, outward) => {
    const e1 = elbowFor(s, f, 1), e2 = elbowFor(s, f, -1);
    if (facing === "right") return e1[1] >= e2[1] ? e1 : e2;
    return Math.abs(e1[0] - O) * outward >= Math.abs(e2[0] - O) * outward ? e1 : e2;
  };

  if (wantFarArm) drawArm(g, farS, bend(farS, farF, 1), farF, ARM_PAL.far);
  if (wantBlade) {
    const rgb = typeof swordTrailColor === "function" ? swordTrailColor() : [225, 232, 245];
    if (pose.smear) {
      const fin = player.mineSwing.combo === 3;
      const sm = smearSprite(pose.smear[0], pose.ang, bladeLength(type), pose.sq, rgb, fin); // trails right up to the blade
      g.drawImage(sm.c, Math.round(guard[0] - dirx * 0 - sm.cx), Math.round(guard[1] - sm.cy));
    }
    const bl = bladeSprite(type, pose.ang);
    if (bl) g.drawImage(bl.c, Math.round(guard[0] - bl.cx), Math.round(guard[1] - bl.cy));
  }
  if (wantFront) {
    if (facing !== "right") drawArm(g, farS, bend(farS, farF, 1), farF, ARM_PAL.near);
    drawArm(g, nearS, bend(nearS, nearF, 1), nearF, ARM_PAL.near);
    drawFist(g, farF, facing === "right" ? ARM_PAL.far : ARM_PAL.near);
    drawFist(g, nearF, ARM_PAL.near);
  }

  // up to the screen with the sprite, on its pixel grid
  const k = (DRAW_SIZE / 64) * z;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // placed exactly like the body (drawPlayerSprite(): centred on screenX/screenY, mirrored about it)
  if (flip) { ctx.translate(screenX, screenY); ctx.scale(-1, 1); ctx.drawImage(swordLayer, -O * k, -O * k, SWORD_LAYER * k, SWORD_LAYER * k); }
  else ctx.drawImage(swordLayer, screenX - O * k, screenY - O * k, SWORD_LAYER * k, SWORD_LAYER * k);
  ctx.restore();
}

// the old drawing steps aside for these swings
{
  const base = drawSwordSwing;
  drawSwordSwing = function () {
    if (swordComboActive()) return;
    return base.apply(this, arguments);
  };
}
{
  const base = drawPlayer;
  drawPlayer = function (screenX, screenY, z) {
    noteComboSwingEnd();
    if (!swordComboActive() || player.sleeping || player.sitting) return base.apply(this, arguments);
    drawSwordComboLayer(screenX, screenY, z, "back");
    const r = base.apply(this, arguments);
    drawSwordComboLayer(screenX, screenY, z, "front");
    return r;
  };
}

/* --- the combo: 1 overhead, 2 rising, 3 cleave ------------------------------- */
// The window counts from when the last swing ENDED (so a slow frame rate
// can't break the combo): noticed every frame in the drawPlayer() wrapper.
let comboHit = 0, comboLastAt = -1, comboSwingLive = false;
function noteComboSwingEnd() {
  const live = !!(player.mineSwing && player.mineSwing.combo);
  if (comboSwingLive && !live) comboLastAt = performance.now() / 1000;
  comboSwingLive = live;
}
{
  const base = startMineSwing;
  startMineSwing = function () {
    const r = base.apply(this, arguments);
    const s = player.mineSwing;
    if (s && s.sword) {
      const now = performance.now() / 1000;
      comboHit = comboLastAt >= 0 && now - comboLastAt <= COMBO_WINDOW_SEC ? (comboHit % 3) + 1 : 1;
      comboSwingLive = true;
      s.combo = comboHit;
      s.style = COMBO_STYLES[comboHit - 1];
      player.action = "swordHit"; player.frame = 0; player.frameTimer = 0;
    }
    return r;
  };
}
// the finisher hits a little harder visually: more bits, a short shake
{
  const base = landMineHit;
  landMineHit = function (st, m) {
    const fin = player.mineSwing && player.mineSwing.combo === 3 && !player.mineSwing.ranged;
    const wasDead = m && m.state === "dead";
    const r = base.apply(this, arguments);
    if (fin && !wasDead && typeof spawnChopChips === "function") {
      const cy = typeof mobTopY === "function" ? (mobTopY(m) + m.y) / 2 : m.y - 8;
      spawnChopChips(m, cy, 8, false, typeof fxZone === "function" ? fxZone() : null);
      if (typeof shakeScreen === "function") shakeScreen(2, 110);
    }
    return r;
  };
}
