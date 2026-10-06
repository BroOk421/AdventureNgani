"use strict";

/* =================================================================
   FISHING, MOVING WATER, DEATH

   Per request ("may animation na death tapos fishing tapos na file sa
   folder ng sprite add mo sa character ... yung sa fishing kahit san na
   may ocean dun siya makakapangisda gusto ko nga nag aanimate yung dagat"):
   - The player's own Death and Fishing sheets (assets/sprites/Death,
     assets/sprites/Fishing — the character's art) now play:
       * Death: when health runs out, the character falls (8 frames), lies
         there a moment, then blacks out as before.
       * Fishing: equip the Fishing Rod (you start with one), stand facing
         water — any water, the sea, a pond — and press F. The rod casts,
         the line and bobber land in the water and you wait. When the
         bobber dips and "!" pops up, press F quickly to reel it in. Too
         slow and it gets away. Moving cancels.
       * Fish: Tilapia, Bangus, Lapu-Lapu, and the rare Golden Koi — eat
         them or sell them at the grocery.
   - The water moves: a slow shimmer, drifting wave glints and foam along
     the shore, drawn over every water tile on screen.
================================================================= */

const FISH_TABLE = [["fishTilapia", 50], ["fishBangus", 30], ["fishLapu", 15], ["fishKoi", 4]];
const FISH_SELL = { fishTilapia: 8, fishBangus: 14, fishLapu: 28, fishKoi: 120 };
if (typeof GROCERY_STOCK !== "undefined") {
  for (const [type, price] of Object.entries(FISH_SELL)) if (!GROCERY_STOCK.some((e) => e.type === type && e.sell)) GROCERY_STOCK.push({ type, price, sell: true });
  if (!GROCERY_STOCK.some((e) => e.type === "fishingRod")) GROCERY_STOCK.push({ type: "fishingRod", price: 30 });
}
if (typeof ITEM_DESC !== "undefined") {
  ITEM_DESC.fishingRod = "Equip it, face the water and press F. When the float dips and a \"!\" shows, press F again.";
  ITEM_DESC.fishTilapia = "Karaniwang isda. Pwedeng kainin o ibenta.";
  ITEM_DESC.fishBangus = "Bangus — masarap at mabenta.";
  ITEM_DESC.fishLapu = "Grouper — rarer and pricier.";
  ITEM_DESC.fishKoi = "Golden Koi — very rare! Sells high.";
}

/* ---------------- water ---------------- */
function isWaterTile(c, r) {
  if (player.scene !== "outside") return false;
  const k = c + "," + r, t = groundLayer.get(k);
  if (!t || !/^water/.test(t)) return false;
  if (groundOverlayLayer.has(k)) return false;
  const o = objectLayer.get(k);
  return !(o && itemDefs[o] && itemDefs[o].collides);
}
function fishingTarget() {
  const d = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[player.facing] || [0, 1];
  const fx = player.x, fy = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  let best = null;
  for (let step = 0.6; step <= 3.2; step += 0.2) {
    const x = fx + d[0] * step * TILE, y = fy + d[1] * step * TILE - (d[1] === 0 ? 2 : 0);
    if (isWaterTile(Math.floor(x / TILE), Math.floor(y / TILE))) best = { x, y };
    else if (best) break; // stop at the far shore
  }
  return best;
}

/* ---------------- the player's own sheets for death / fishing ---------------- */
// player.special = { kind: "death" | "fishing", ... } — while set, updatePlayer() runs this instead.
const FISH_TIP = { down: [30, 62], right: [62, 45], up: [37, 9] }; // the rod tip in the 64px frame, while the line is out
function setPlayerFrame(action, frame) { player.action = action; player.frame = frame; player.frameTimer = 0; }
function endSpecial() { player.special = null; player.action = null; player.frame = 0; player.frameTimer = 0; }
const fishPopups = []; // { x, y, text, color, t }
const fishFlying = []; // { type, x0, y0, t }

function startFishing(target) {
  player.special = { kind: "fishing", phase: "cast", t: 0, target, wait: 2.5 + Math.random() * 4.5, bob: 0 };
  setPlayerFrame("fishing", 0);
}
function fishBite() {
  let total = FISH_TABLE.reduce((s, e) => s + e[1], 0), x = Math.random() * total;
  for (const [type, w] of FISH_TABLE) { x -= w; if (x <= 0) return type; }
  return FISH_TABLE[0][0];
}
function tickSpecial(dt) {
  const S = player.special;
  if (!S) return false;
  S.t += dt;
  if (S.kind === "death") {
    const n = FRAME_COUNTS.death || 8, fps = ANIM_FPS.death || 6;
    const f = Math.min(n - 1, Math.floor(S.t * fps));
    setPlayerFrame("death", f);
    if (S.t >= n / fps + 0.9 && !S.done) {
      S.done = true;
      const base = S.base;
      endSpecial();
      base();
    }
    return true;
  }
  if (S.kind === "fishing") {
    const moving = keys["w"] || keys["a"] || keys["s"] || keys["d"] || keys["arrowup"] || keys["arrowdown"] || keys["arrowleft"] || keys["arrowright"];
    if (moving && S.phase !== "reel") { endSpecial(); return false; }
    const pressed = harvestRequested; harvestRequested = false;
    if (S.phase === "cast") {
      const f = Math.min(4, Math.floor(S.t * 10));
      setPlayerFrame("fishing", f);
      if (f >= 4) { S.phase = "wait"; S.t = 0; S.splash = performance.now() / 1000; }
      if (pressed) { endSpecial(); return true; }
    } else if (S.phase === "wait") {
      setPlayerFrame("fishing", 4);
      if (pressed) { endSpecial(); if (typeof showToast === "function") showToast("You pulled too early — nothing was biting"); return true; }
      if (S.t >= S.wait) { S.phase = "bite"; S.t = 0; S.catch = fishBite(); S.splash = performance.now() / 1000; }
    } else if (S.phase === "bite") {
      setPlayerFrame("fishing", 4);
      const window_ = S.catch === "fishKoi" ? 0.75 : 1.1;
      if (pressed) { S.phase = "reel"; S.t = 0; S.got = true; }
      else if (S.t > window_) {
        if (typeof showToast === "function") showToast("The fish got away...");
        S.phase = "wait"; S.t = 0; S.wait = 2 + Math.random() * 4; // it may bite again
        if (Math.random() < 0.35) { endSpecial(); return true; }
      }
    } else if (S.phase === "reel") {
      const f = 5 + Math.min(2, Math.floor(S.t * 10));
      setPlayerFrame("fishing", f);
      if (S.t >= 0.32 && !S.flung) {
        S.flung = true;
        fishFlying.push({ type: S.catch, x0: S.target.x, y0: S.target.y, t: 0 });
      }
      if (S.t >= 0.5) endSpecial();
    }
    return true;
  }
  return false;
}
{
  const base = updatePlayer;
  updatePlayer = function (dt) {
    if (player.special) {
      const fishingNow = player.special.kind === "fishing";
      if (tickSpecial(dt)) {
        // the mobs keep moving while you fish (they can interrupt you)
        if (fishingNow && typeof mobOutdoorUpdate === "function") { player.autoTarget = null; mobOutdoorUpdate(dt); }
        return;
      }
    }
    // F with the rod: fish, if there's water in front
    if (harvestRequested && player.equippedWeapon === "fishingRod" && player.scene === "outside" && !player.action && !player.sleeping && !player.sitting) {
      harvestRequested = false;
      const target = fishingTarget();
      if (target) startFishing(target);
      else if (typeof showToast === "function") showToast("No water in front of you — face the sea or a river");
      return;
    }
    return base.apply(this, arguments);
  };
}
// A hit while fishing pulls you out of it.
{
  const base = damagePlayer;
  damagePlayer = function () {
    const before = player.health;
    const r = base.apply(this, arguments);
    if (player.health < before && player.special && player.special.kind === "fishing") endSpecial();
    return r;
  };
}
// Death: fall over first, then black out (js/mines.js).
{
  const base = playerBlackout;
  playerBlackout = function () {
    if (player.special && player.special.kind === "death") return;
    const args = arguments, self = this;
    player.mineSwing = null; player.autoTarget = null;
    player.mineInvulnUntil = performance.now() / 1000 + 6;
    player.special = { kind: "death", t: 0, base: () => base.apply(self, args) };
    setPlayerFrame("death", 0);
  };
}

/* ---------------- drawing: line, bobber, ripples, the catch ---------------- */
function drawFishingLine(screenX, screenY, z) {
  const S = player.special;
  if (!S || S.kind !== "fishing" || S.phase === "cast" && player.frame < 3) return;
  const k = (DRAW_SIZE / 64) * z, flip = player.facing === "left";
  const face = flip ? "right" : (FISH_TIP[player.facing] ? player.facing : "down");
  const tip = FISH_TIP[face];
  const tx = screenX + (flip ? 32 - tip[0] : tip[0] - 32) * k, ty = screenY + (tip[1] - 32) * k;
  const now = performance.now() / 1000;
  let bx = (S.target.x - camX) * zoom, by = (S.target.y - camY) * zoom;
  if (S.phase === "cast") { const e = Math.min(1, S.t / 0.45); bx = tx + (bx - tx) * e; by = ty + (by - ty) * e - Math.sin(e * Math.PI) * 10 * zoom; }
  const dip = S.phase === "bite" ? (Math.sin(now * 30) > 0 ? 2.2 : 1.2) * zoom : Math.sin(now * 2.4) * 0.6 * zoom;
  ctx.save();
  // ripples round the bobber
  if (S.phase !== "cast") {
    for (let i = 0; i < 3; i++) {
      const p = ((now * 0.6 + i / 3) % 1);
      ctx.globalAlpha = (1 - p) * (S.phase === "bite" ? 0.8 : 0.45);
      ctx.strokeStyle = "#e8f6ff"; ctx.lineWidth = Math.max(1, 0.5 * zoom);
      ctx.beginPath(); ctx.ellipse(bx, by + 1 * zoom, (2 + p * (S.phase === "bite" ? 9 : 6)) * zoom, (1 + p * (S.phase === "bite" ? 3.5 : 2.4)) * zoom, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (S.splash && now - S.splash < 0.4) { // a splash when it lands / bites
      const q = (now - S.splash) / 0.4;
      ctx.globalAlpha = 1 - q; ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 6; i++) { const a = -Math.PI * (0.15 + 0.7 * i / 5); ctx.fillRect(bx + Math.cos(a) * 5 * zoom * q, by + Math.sin(a) * 6 * zoom * q, zoom, zoom); }
    }
  }
  // the line (a slight sag)
  ctx.globalAlpha = 0.9; ctx.strokeStyle = "rgba(240,240,240,0.9)"; ctx.lineWidth = Math.max(1, 0.35 * zoom);
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo((tx + bx) / 2, Math.max(ty, by) + 4 * zoom, bx, by + dip - 1.5 * zoom); ctx.stroke();
  // the bobber
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#e63c3c"; ctx.fillRect(bx - zoom, by + dip - 2.5 * zoom, 2 * zoom, 1.5 * zoom);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(bx - zoom, by + dip - 1 * zoom, 2 * zoom, 1.2 * zoom);
  ctx.restore();
  // "!" over the head on a bite
  if (S.phase === "bite") {
    const fs = Math.max(10, Math.round(7 * zoom));
    ctx.save(); ctx.font = "bold " + fs + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    const hy = screenY - 18 * k - Math.abs(Math.sin(now * 12)) * 2 * zoom;
    ctx.lineWidth = Math.max(2, fs / 4); ctx.strokeStyle = "#000"; ctx.strokeText("!", screenX, hy);
    ctx.fillStyle = "#ffd84a"; ctx.fillText("!", screenX, hy); ctx.restore();
  }
}
{
  const base = drawPlayer;
  drawPlayer = function (screenX, screenY, z) {
    const r = base.apply(this, arguments);
    drawFishingLine(screenX, screenY, z);
    return r;
  };
}
let fishLastT = performance.now();
function drawFishOverlay() {
  const now = performance.now(), dt = Math.min(0.1, (now - fishLastT) / 1000);
  fishLastT = now;
  for (let i = fishFlying.length - 1; i >= 0; i--) {
    const f = fishFlying[i];
    f.t += dt / 0.6;
    const px = player.x, py = player.y - 6;
    const e = Math.min(1, f.t), x = f.x0 + (px - f.x0) * e, y = f.y0 + (py - f.y0) * e - Math.sin(e * Math.PI) * 22;
    const icon = assets[f.type];
    if (icon && icon.width) {
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.translate((x - camX) * zoom, (y - camY) * zoom); ctx.rotate(e * Math.PI * 3);
      ctx.drawImage(icon, -6 * zoom, -6 * zoom, 12 * zoom, 12 * zoom); ctx.restore();
    }
    if (f.t >= 1) {
      fishFlying.splice(i, 1);
      grantItem(f.type, 1);
      const def = itemDefs[f.type];
      fishPopups.push({ x: player.x, y: player.y - DRAW_SIZE * 0.35, text: "+1 " + (def ? def.name : f.type), color: f.type === "fishKoi" ? "#ffd84a" : "#9cf5ff", t: now / 1000 });
      if (f.type === "fishKoi" && typeof showToast === "function") showToast("Wow! You caught a Golden Koi!");
      if (typeof saveGame === "function") saveGame();
    }
  }
  for (let i = fishPopups.length - 1; i >= 0; i--) {
    const q = fishPopups[i], k = (now / 1000 - q.t) / 1.6;
    if (k >= 1) { fishPopups.splice(i, 1); continue; }
    const fs = Math.max(9, Math.round(4.2 * zoom));
    ctx.save(); ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
    ctx.font = "bold " + fs + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    const sx = (q.x - camX) * zoom, sy = (q.y - camY) * zoom - k * 14 * zoom;
    ctx.lineWidth = Math.max(2, fs / 4); ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.strokeText(q.text, sx, sy);
    ctx.fillStyle = q.color; ctx.fillText(q.text, sx, sy); ctx.restore();
  }
}

/* ---------------- the water moves ----------------
   Per request ("baguhin mo yung animation ng tubig ... dapat pang professional"): the old
   dashes are gone. The water now has:
     - caustics: a seamless, looping web of soft light (WATER_FRAMES frames of a 48x48 tile,
       built once from interfering sine waves, quantised to two tones so it stays pixel art),
       laid twice — a slow large layer and a faster small one drifting another way — for depth;
     - gentle swell: broad light/dark bands rolling slowly across;
     - shore foam: a ragged, breathing band where water meets land (pre-drawn frames, each tile
       out of step with its neighbours);
     - sun glints by day: a few tiny sparkles that wink on and off.
   All of it is clipped to the water tiles on screen. */
const WATER_FRAMES = 32, WATER_TILE = 48, WATER_LOOP_SEC = 4;
let waterCaustics = null, waterFoam = null;
function buildWaterArt() {
  waterCaustics = [];
  const N = WATER_TILE, TAU = Math.PI * 2;
  // integer wave numbers -> the tile repeats seamlessly; integer speeds -> the loop is seamless
  const A = [[1, 2, 1], [-2, 1, -1], [3, -1, 2], [1, 3, -2]];
  const B = [[2, -1, 1], [-1, -3, 2], [3, 2, -1]];
  for (let f = 0; f < WATER_FRAMES; f++) {
    const t = f / WATER_FRAMES * TAU;
    const c = document.createElement("canvas"); c.width = c.height = N;
    const g = c.getContext("2d"), img = g.createImageData(N, N), d = img.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let a = 0, b = 0;
      for (const [kx, ky, w] of A) a += Math.sin(TAU * (kx * x + ky * y) / N + w * t);
      for (const [kx, ky, w] of B) b += Math.sin(TAU * (kx * x + ky * y) / N + w * t + 1.3);
      const line = Math.max(Math.exp(-a * a * 1.6), Math.exp(-b * b * 1.6)); // bright where a field crosses zero
      const i = (y * N + x) * 4;
      if (line > 0.86) { d[i] = 214; d[i + 1] = 240; d[i + 2] = 255; d[i + 3] = 78; }
      else if (line > 0.62) { d[i] = 190; d[i + 1] = 228; d[i + 2] = 255; d[i + 3] = 26; }
      else if (a + b > 3.1) { d[i] = 8; d[i + 1] = 30; d[i + 2] = 70; d[i + 3] = 26; } // the deeper troughs
    }
    g.putImageData(img, 0, 0);
    waterCaustics.push(c);
  }
  // foam for an edge with land ABOVE the tile (rotated for the other sides), 16 frames
  waterFoam = [];
  for (let f = 0; f < 16; f++) {
    const t = f / 16 * TAU;
    const c = document.createElement("canvas"); c.width = c.height = TILE;
    const g = c.getContext("2d"), img = g.createImageData(TILE, TILE), d = img.data;
    for (let x = 0; x < TILE; x++) {
      const depth = 1.6 + 0.9 * Math.sin(TAU * x * 2 / TILE + t) + 0.5 * Math.sin(TAU * x * 3 / TILE - 2 * t);
      for (let y = 0; y < 6; y++) {
        const i = (y * TILE + x) * 4;
        let a = 0;
        if (y < depth - 0.4) a = 150; else if (y < depth + 0.6) a = 70;
        else if (y < depth + 2.2 && ((x * 7 + y * 3 + f) % 9 === 0)) a = 60; // a few bubbles past the band
        if (a) { d[i] = 240; d[i + 1] = 250; d[i + 2] = 255; d[i + 3] = a; }
      }
    }
    g.putImageData(img, 0, 0);
    waterFoam.push(c);
  }
}
function waterHash(c, r) { let h = (c * 374761393 + r * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return (h ^ (h >>> 16)) >>> 0; }
// Per request ("yung port tiles na corner is i connect mo jan sa water ... tyaka yung stone at yung tree
// lagyan mo sa ilalim na color white ... sa trunk tree is yung trunk lang"):
//  - the port pieces' own water (the blue part of their art) moves with the rest of the water, and no
//    foam is drawn against a port piece (its art has its own shore), so the two join up;
//  - a water tile with a stone / tree / anything on it is still water (it moves), and the thing gets a
//    white foam ring round its base — round the trunk only, for a tree.
const portWaterSpans = new Map(); // port type -> [[y, x0, x1], ...] (art px) of its blue pixels
function portSpans(type) {
  let sp = portWaterSpans.get(type);
  if (sp) return sp;
  const icon = itemDefs[type] && itemDefs[type].icon;
  if (!icon || !icon.width) return null;
  sp = [];
  try {
    const c = document.createElement("canvas"); c.width = icon.width; c.height = icon.height;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(icon, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    for (let y = 0; y < c.height; y++) {
      let x0 = -1;
      for (let x = 0; x <= c.width; x++) {
        const i = (y * c.width + x) * 4;
        const blue = x < c.width && d[i + 3] > 0 && d[i + 2] > d[i] + 20 && d[i + 2] > d[i + 1];
        if (blue && x0 < 0) x0 = x;
        if (!blue && x0 >= 0) { sp.push([y, x0, x]); x0 = -1; }
      }
    }
  } catch (e) { sp = []; } // file:// can't read pixels: the port pieces just don't move
  portWaterSpans.set(type, sp);
  return sp;
}
function isWaterGround(c, r) { const t = groundLayer.get(c + "," + r); return !!t && /^water/.test(t); }
function isPortGround(c, r) { const t = groundLayer.get(c + "," + r); return !!t && /^port(?!Bridge)/.test(t); }
function drawWaterAnim() {
  if (player.scene !== "outside") return;
  if (!waterCaustics) buildWaterArt();
  const vw = view.width / zoom, vh = view.height / zoom;
  const c0 = Math.floor(camX / TILE) - 1, c1 = Math.ceil((camX + vw) / TILE) + 1;
  const r0 = Math.floor(camY / TILE) - 1, r1 = Math.ceil((camY + vh) / TILE) + 1;
  const tiles = [], ports = [], based = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (isWaterGround(c, r)) { tiles.push([c, r]); const o = objectLayer.get(c + "," + r); if (o) based.push([c, r, o]); }
    else if (isPortGround(c, r)) ports.push([c, r]);
  }
  if (!tiles.length && !ports.length) return;
  const t = performance.now() / 1000, T = TILE * zoom;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.beginPath();
  for (const [c, r] of tiles) ctx.rect(Math.round((c * TILE - camX) * zoom), Math.round((r * TILE - camY) * zoom), Math.ceil(T) + 1, Math.ceil(T) + 1);
  for (const [c, r] of ports) { // just the blue part of a port piece
    const sp = portSpans(groundLayer.get(c + "," + r));
    if (!sp) continue;
    const ox = (c * TILE - camX) * zoom, oy = (r * TILE - camY) * zoom;
    for (const [y, x0, x1] of sp) ctx.rect(Math.floor(ox + x0 * zoom), Math.floor(oy + y * zoom), Math.ceil((x1 - x0) * zoom) + 1, Math.ceil(zoom) + 1);
  }
  ctx.clip();
  // broad swell: soft bands of light and shade rolling across
  const sx0 = (c0 * TILE - camX) * zoom, sy0 = (r0 * TILE - camY) * zoom, sw = (c1 - c0 + 1) * T, sh = (r1 - r0 + 1) * T;
  const ph = (t * 0.06) % 1, gx = Math.cos(0.5), gy = Math.sin(0.5);
  const band = ctx.createLinearGradient(sx0 - ph * 220 * zoom * gx, sy0 - ph * 220 * zoom * gy, sx0 + (1 - ph) * 220 * zoom * gx, sy0 + (1 - ph) * 220 * zoom * gy);
  band.addColorStop(0, "rgba(255,255,255,0.045)"); band.addColorStop(0.25, "rgba(10,40,90,0.05)"); band.addColorStop(0.5, "rgba(255,255,255,0.045)");
  band.addColorStop(0.75, "rgba(10,40,90,0.05)"); band.addColorStop(1, "rgba(255,255,255,0.045)");
  ctx.fillStyle = band; ctx.fillRect(sx0, sy0, sw, sh);
  // caustics: a slow big layer + a quicker small one drifting the other way
  const layer = (scale, speed, dx, dy, alpha, offset) => {
    const fr = Math.floor(((t * speed / WATER_LOOP_SEC + offset) % 1) * WATER_FRAMES);
    const pat = ctx.createPattern(waterCaustics[fr], "repeat");
    const m = new DOMMatrix().translate(-camX * zoom + t * dx * zoom, -camY * zoom + t * dy * zoom).scale(zoom * scale);
    pat.setTransform(m);
    ctx.globalAlpha = alpha; ctx.fillStyle = pat; ctx.fillRect(sx0, sy0, sw, sh);
  };
  layer(3, 0.5, 2.2, 0.8, 0.4, 0);
  layer(2, 0.9, -3.4, 1.6, 0.6, 0.37);
  ctx.globalAlpha = 1;
  // foam where the water meets land
  for (const [c, r] of tiles) {
    const x = Math.round((c * TILE - camX) * zoom), y = Math.round((r * TILE - camY) * zoom);
    const h = waterHash(c, r);
    for (const [dc, dr, rot] of [[0, -1, 0], [1, 0, 0.5], [0, 1, 1], [-1, 0, 1.5]]) {
      if (isWaterGround(c + dc, r + dr) || isPortGround(c + dc, r + dr)) continue; // water or a port piece (it has its own shore) beside: no foam
      const fr = (Math.floor(t * 6) + (h >>> (rot * 4)) ) % 16;
      ctx.save();
      ctx.translate(x + T / 2, y + T / 2); ctx.rotate(rot * Math.PI);
      ctx.drawImage(waterFoam[fr], -T / 2, -T / 2, T, T);
      ctx.restore();
    }
  }
  // sun glints by day
  const day = typeof getDayFactor === "function" ? getDayFactor() : 1;
  if (day > 0.2) {
    const slot = Math.floor(t / 1.4);
    for (const [c, r] of tiles) {
      const h = waterHash(c + slot * 31, r - slot * 17);
      if (h % 23) continue;
      const k = ((t / 1.4) % 1), a = Math.sin(k * Math.PI) * day;
      const x = (c * TILE + 3 + (h >> 5) % 10 - camX) * zoom, y = (r * TILE + 3 + (h >> 9) % 10 - camY) * zoom, s = Math.max(1, Math.round(zoom * 0.6));
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.globalAlpha = a * 0.45;
      ctx.fillRect(x - s * 2, y - s / 2, s * 4, s); ctx.fillRect(x - s / 2, y - s * 2, s, s * 4);
    }
  }
  ctx.restore();
  // a white foam ring round anything standing in the water — just the trunk, for a tree
  for (const [c, r, o] of based) {
    const d = itemDefs[o];
    if (!d || !d.icon || !d.icon.width) continue;
    const tree = /^(tree|pcTree)/.test(o) || (d.resource && d.resource.breakAnim === "slice");
    const halfW = tree ? 3.2 : Math.min(d.icon.width * 0.42, 22);
    const cx = ((c + 0.5) * TILE - camX) * zoom, cy = ((r + 1) * TILE - 2.5 - camY) * zoom;
    const h = waterHash(c, r), pulse = 0.75 + 0.25 * Math.sin(t * 2.2 + (h % 7));
    ctx.save();
    ctx.globalAlpha = 0.85 * pulse;
    ctx.strokeStyle = "rgba(240,250,255,0.95)"; ctx.lineWidth = Math.max(1.5, zoom * 1.1);
    ctx.beginPath(); ctx.ellipse(cx, cy, (halfW + 1.5) * zoom, (tree ? 1.6 : 2.6) * zoom, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.35 * pulse; ctx.lineWidth = Math.max(1, zoom * 0.7);
    const g2 = 1 + 0.5 * ((t * 0.6 + (h % 5) / 5) % 1); // a fainter ripple spreading out
    ctx.beginPath(); ctx.ellipse(cx, cy, (halfW + 1.5) * zoom * g2, (tree ? 1.6 : 2.6) * zoom * g2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
{
  const base = drawFlatGroundItems;
  drawFlatGroundItems = function () {
    const r = base.apply(this, arguments);
    try { drawWaterAnim(); } catch (e) { /* never break the frame */ }
    return r;
  };
  const ovBase = drawSceneFadeOverlay;
  drawSceneFadeOverlay = function () {
    try { drawFishOverlay(); } catch (e) { /* ignore */ }
    return ovBase.apply(this, arguments);
  };
}
