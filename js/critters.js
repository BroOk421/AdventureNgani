"use strict";

/* =================================================================
   CRITTERS — butterflies by day, fireflies by night, round the trees.

   Per request ("gawa ka ng butterfly 4 na itsura with animation lagay mo
   sa ilalim ng puno na lumilipad lipad tapos sa gabi may fireflies ... sa
   umaga mga butterfly tapos sa gabi fireflies"):
   - Butterflies (tools/butterfly_art.py: 4 looks x 4 wing frames) flutter
     around under the trees on screen in the daytime, wandering near their
     tree, bobbing up and down, wings flapping.
   - Fireflies come out at night: little yellow-green lights drifting among
     the trees, each pulsing on and off. They light the ground a little
     (the shared light buffer) and glow over the night washes.
   Purely visual, outdoors only; they fade in/out with the day/night ramp.
================================================================= */

assets.butterflies = new Image();
assets.butterflies.src = "assets/critters/butterflies.png";
const BF_W = 13, BF_H = 11;
const CRITTER_MAX_BUTTERFLIES = 14, CRITTER_MAX_FIREFLIES = 34;
const critters = { butterflies: [], fireflies: [], world: null, lastT: performance.now(), trees: [], treesAt: 0 };

function critterTrees() {
  const now = performance.now();
  if (now - critters.treesAt < 700) return critters.trees;
  critters.treesAt = now;
  const out = [];
  const vw = view.width / zoom, vh = view.height / zoom;
  const c0 = Math.floor(camX / TILE) - 4, c1 = Math.ceil((camX + vw) / TILE) + 4;
  const r0 = Math.floor(camY / TILE) - 2, r1 = Math.ceil((camY + vh) / TILE) + 6;
  const tree = typeof isShakingTree === "function" ? isShakingTree : (t) => /tree/i.test(t);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const t = objectLayer.get(c + "," + r);
    if (t && tree(t)) out.push({ x: (c + 0.5) * TILE, y: (r + 1) * TILE });
  }
  return critters.trees = out;
}
const crand = (a, b) => a + Math.random() * (b - a);
function spawnButterfly(trees) {
  const home = trees[Math.floor(Math.random() * trees.length)];
  return { home, x: home.x + crand(-20, 20), y: home.y + crand(-6, 14), z: crand(6, 16), tx: home.x, ty: home.y, look: Math.floor(Math.random() * 4),
    phase: Math.random() * 10, speed: crand(10, 18), retarget: 0, a: 0, face: 1 };
}
function spawnFirefly(trees) {
  const home = trees.length ? trees[Math.floor(Math.random() * trees.length)] : { x: camX + Math.random() * view.width / zoom, y: camY + Math.random() * view.height / zoom };
  return { home, x: home.x + crand(-34, 34), y: home.y + crand(-10, 26), z: crand(4, 22), vx: crand(-6, 6), vy: crand(-4, 4), phase: Math.random() * 6, rate: crand(0.8, 1.6), a: 0 };
}
function updateCritters() {
  const now = performance.now(), dt = Math.min(0.1, (now - critters.lastT) / 1000);
  critters.lastT = now;
  if (player.scene !== "outside") return;
  if (critters.world !== currentWorld) { critters.world = currentWorld; critters.butterflies.length = 0; critters.fireflies.length = 0; }
  const day = typeof getDayFactor === "function" ? getDayFactor() : 1;
  const night = typeof getNightLightFactor === "function" ? getNightLightFactor() : 1 - day;
  const weather = typeof getCurrentWeather === "function" ? getCurrentWeather().name : "Clear";
  const wet = /Rain|Storm|Snow/i.test(weather);
  const trees = critterTrees();
  const vw = view.width / zoom, vh = view.height / zoom;
  const far = (o) => o.x < camX - 120 || o.x > camX + vw + 120 || o.y < camY - 120 || o.y > camY + vh + 140;
  // butterflies: daytime, not in rain or snow
  const wantB = trees.length && day > 0.35 && !wet ? Math.min(CRITTER_MAX_BUTTERFLIES, 3 + Math.floor(trees.length / 2)) : 0;
  const B = critters.butterflies;
  if (B.length < wantB && Math.random() < 0.08) B.push(spawnButterfly(trees));
  for (let i = B.length - 1; i >= 0; i--) {
    const b = B[i];
    const leaving = i >= wantB || far(b);
    b.a = Math.max(0, Math.min(1, b.a + (leaving ? -1.2 : 1.2) * dt));
    if (leaving && b.a <= 0) { B.splice(i, 1); continue; }
    b.phase += dt;
    b.retarget -= dt;
    if (b.retarget <= 0) { // a new spot near its tree to wander to
      b.retarget = crand(1.2, 3.2);
      b.tx = b.home.x + crand(-28, 28); b.ty = b.home.y + crand(-8, 18);
    }
    const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy) || 1;
    const sp = b.speed * (d > 4 ? 1 : 0.3);
    b.x += dx / d * sp * dt + Math.sin(b.phase * 3.1) * 6 * dt;
    b.y += dy / d * sp * dt + Math.cos(b.phase * 2.3) * 5 * dt;
    b.z = 10 + Math.sin(b.phase * 1.7) * 5 + Math.sin(b.phase * 5.3) * 1.5;
    if (Math.abs(dx) > 2) b.face = dx > 0 ? 1 : -1;
  }
  // fireflies: night
  const wantF = night > 0.25 && !/Rain|Storm/i.test(weather) ? Math.min(CRITTER_MAX_FIREFLIES, 10 + trees.length * 2) : 0;
  const F = critters.fireflies;
  if (F.length < wantF && Math.random() < 0.25) F.push(spawnFirefly(trees));
  for (let i = F.length - 1; i >= 0; i--) {
    const f = F[i];
    const leaving = i >= wantF || far(f);
    f.a = Math.max(0, Math.min(1, f.a + (leaving ? -0.8 : 0.8) * dt));
    if (leaving && f.a <= 0) { F.splice(i, 1); continue; }
    f.phase += dt * f.rate;
    f.vx += crand(-14, 14) * dt; f.vy += crand(-10, 10) * dt;
    const hx = f.home.x - f.x, hy = f.home.y + 6 - f.y; // drift back toward home
    f.vx += hx * 0.08 * dt; f.vy += hy * 0.08 * dt;
    const sp = Math.hypot(f.vx, f.vy); if (sp > 9) { f.vx *= 9 / sp; f.vy *= 9 / sp; }
    f.x += f.vx * dt; f.y += f.vy * dt;
    f.z = 12 + Math.sin(f.phase * 1.3) * 7;
  }
}
function fireflyGlow(f) { // 0..1, a slow blink
  const s = Math.sin(f.phase * 2.2);
  return f.a * Math.max(0, s) ** 1.5;
}
function drawButterflies() {
  const sheet = assets.butterflies;
  if (!sheet || !sheet.width || player.scene !== "outside") return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const b of critters.butterflies) {
    if (b.a <= 0.01) continue;
    const flap = Math.floor(b.phase * 12) % 6, f = [0, 1, 2, 3, 2, 1][flap];
    const s = zoom * 0.75;
    const x = (b.x - camX) * zoom, y = (b.y - b.z - camY) * zoom;
    // its shadow on the ground
    ctx.globalAlpha = 0.18 * b.a; ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(x, (b.y - camY) * zoom, 2.6 * zoom * (f < 2 ? 1 : 0.6), 0.9 * zoom, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = b.a;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(Math.sin(b.phase * 2) * 0.25 + (b.face < 0 ? -0.15 : 0.15));
    ctx.drawImage(sheet, f * BF_W, b.look * BF_H, BF_W, BF_H, -BF_W * s / 2, -BF_H * s / 2, BF_W * s, BF_H * s);
    ctx.restore();
  }
  ctx.restore();
}
let fireflyGlowCanvas = null;
function fireflyLights() {
  if (player.scene !== "outside" || !critters.fireflies.length) return;
  if (!fireflyGlowCanvas) {
    const c = fireflyGlowCanvas = document.createElement("canvas"); c.width = c.height = 32;
    const g = c.getContext("2d"), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(220,255,120,0.9)"); gr.addColorStop(0.4, "rgba(170,240,80,0.35)"); gr.addColorStop(1, "rgba(120,200,40,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  }
  const size = 18 * zoom;
  for (const f of critters.fireflies) {
    const a = fireflyGlow(f);
    if (a < 0.05) continue;
    const x = (f.x - camX) * zoom - size / 2, y = (f.y - f.z * 0.4 - camY) * zoom - size / 2;
    addSceneLight(fireflyGlowCanvas, x, y, size, size, a * 0.45, [170, 230, 90]);
  }
}
function drawFireflies() {
  if (player.scene !== "outside") return;
  ctx.save();
  for (const f of critters.fireflies) {
    const a = fireflyGlow(f);
    if (f.a < 0.02) continue;
    const x = (f.x - camX) * zoom, y = (f.y - f.z - camY) * zoom;
    const r = (0.9 + a * 1.6) * zoom;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
    g.addColorStop(0, "rgba(240,255,170," + (0.25 + 0.75 * a) + ")"); g.addColorStop(0.35, "rgba(190,250,90," + (0.5 * a) + ")"); g.addColorStop(1, "rgba(150,230,60,0)");
    ctx.fillStyle = g; ctx.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
    ctx.fillStyle = "rgba(255,255,220," + (0.35 + 0.65 * a) * f.a + ")";
    ctx.fillRect(Math.round(x - zoom * 0.4), Math.round(y - zoom * 0.4), Math.max(1, Math.round(zoom * 0.8)), Math.max(1, Math.round(zoom * 0.8)));
  }
  ctx.restore();
}
// hooks into the outdoor render (js/camera.js): butterflies after the world objects (before the
// sky tint), firefly light with the lamps, the fireflies themselves after the light lands.
{
  const pick = drawFloatingPickups;
  drawFloatingPickups = function () {
    if (player.scene === "outside") { try { updateCritters(); drawButterflies(); } catch (e) { /* never break the frame */ } }
    return pick.apply(this, arguments);
  };
  const lamps = drawPostLightGlows;
  drawPostLightGlows = function () {
    try { fireflyLights(); } catch (e) { /* ignore */ }
    return lamps.apply(this, arguments);
  };
  const relight = drawLampNightRelight;
  drawLampNightRelight = function () {
    const r = relight.apply(this, arguments);
    try { drawFireflies(); } catch (e) { /* ignore */ }
    return r;
  };
}
