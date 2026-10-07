"use strict";

/* =================================================================
   BIRDS FLYING OVER THE MAP

   Per request ("yung tatlo kunin mo tapos randomly lumilipad sa map
   dapat di lang isa ... minsan isa minsan dalawa minsan tatlo pero sa
   umaga lang sila lumilipad kapag sunny lang"):

   - Every so often a small flock of 1, 2 or 3 birds crosses the screen,
     left-to-right or right-to-left, high above everything.
   - Only in the daytime (BIRD_START_HOUR..BIRD_END_HOUR) and only while
     the day's weather is Sunny (getCurrentWeather(), js/calendar.js).
     A flock already in the air when that stops just finishes crossing.
   - Three kinds (maya, white dove, blue bird). A flock is usually all one
     kind, now and then mixed.

   ART: assets/animals/bird_<kind>/fly/Fly_Right.png + Fly_Left.png, one
   4-frame wing-flap strip each (frame size read from the image). No
   feet — they only ever fly.

   DRAWING: the bird itself goes above every object (after the placement
   grid, under the clouds); its shadow goes on the ground under the
   objects, offset straight down by its altitude, so trees and houses
   cover the shadow but never the bird. Their flight doesn't collide
   with anything — they're in the sky.

   Not saved, nothing interacts with them — pure ambience.
================================================================= */

const BIRD_IDS = ["bird_maya", "bird_dove", "bird_blue"];
const BIRD_FRAMES = 4;
// world px per art px (characters are 0.75) — per request, each flock gets a
// random size between the first (0.55) and the smaller (0.38) version, and
// each bird in it a touch either way, so they don't all look stamped out.
const BIRD_SCALE_RANGE = [0.38, 0.55];
const BIRD_SCALE_JITTER = 0.04;
const BIRD_START_HOUR = 6.5;          // they come out a little after sunrise...
const BIRD_END_HOUR = 17.5;           // ...and stop a little before sunset
const BIRD_WEATHER = "Sunny";
const BIRD_SPAWN_GAP = [6, 18];       // seconds between flocks
const BIRD_MAX_FLOCKS = 2;            // in the air at once
const BIRD_FLOCK_SIZE_ODDS = [[1, 0.45], [2, 0.35], [3, 0.2]];
const BIRD_MIXED_FLOCK_CHANCE = 0.25;
const BIRD_SPEED = [42, 68];          // world px/s
const BIRD_ALTITUDE = [34, 56];       // world px between bird and its shadow
const BIRD_FLAP_FPS = [9, 12];
const BIRD_SHADOW_ALPHA = 0.22;

const birdFlocks = [];
let birdSpawnTimer = 3;

const birdRand = (a, b) => a + Math.random() * (b - a);

function birdSheet(id, dir) {
  return assets[id + "_fly_" + (dir > 0 ? "right" : "left")];
}

function isBirdTime() {
  const h = getGameHour();
  if (h < BIRD_START_HOUR || h >= BIRD_END_HOUR) return false;
  const w = typeof getCurrentWeather === "function" ? getCurrentWeather() : null;
  return !!w && w.name === BIRD_WEATHER;
}

function birdViewRect() {
  return { x: camX, y: camY, w: view.width / zoom, h: view.height / zoom };
}

function pickFlockSize() {
  let r = Math.random(), acc = 0;
  for (const [n, p] of BIRD_FLOCK_SIZE_ODDS) { acc += p; if (r < acc) return n; }
  return 1;
}

function spawnBirdFlock() {
  const v = birdViewRect();
  const dir = Math.random() < 0.5 ? 1 : -1;
  const size = pickFlockSize();
  const kind = BIRD_IDS[Math.floor(Math.random() * BIRD_IDS.length)];
  const mixed = size > 1 && Math.random() < BIRD_MIXED_FLOCK_CHANCE;
  const speed = birdRand(BIRD_SPEED[0], BIRD_SPEED[1]);
  const startX = dir > 0 ? v.x - 40 : v.x + v.w + 40;
  const groundY = v.y + v.h * birdRand(0.2, 0.9); // y of the point on the ground under the leader
  const drift = birdRand(-8, 8);                  // a gentle slant across the screen
  // A loose V: the leader in front, the others a little behind and to the sides.
  const offsets = [[0, 0], [-birdRand(14, 22), -birdRand(7, 13)], [-birdRand(14, 22), birdRand(7, 13)]];
  const flockScale = birdRand(BIRD_SCALE_RANGE[0], BIRD_SCALE_RANGE[1]);
  const birds = [];
  for (let i = 0; i < size; i++) {
    birds.push({
      id: mixed ? BIRD_IDS[Math.floor(Math.random() * BIRD_IDS.length)] : kind,
      ox: offsets[i][0] * dir, oy: offsets[i][1],
      alt: birdRand(BIRD_ALTITUDE[0], BIRD_ALTITUDE[1]),
      fps: birdRand(BIRD_FLAP_FPS[0], BIRD_FLAP_FPS[1]),
      frame: Math.floor(Math.random() * BIRD_FRAMES), frameT: Math.random() * 0.1,
      glideT: 0, nextGlide: birdRand(1.5, 4), // now and then they stop flapping and glide
      bobPhase: Math.random() * Math.PI * 2,
      speedJitter: birdRand(-2, 2), lag: 0,
      scale: Math.max(0.3, flockScale + birdRand(-BIRD_SCALE_JITTER, BIRD_SCALE_JITTER)),
    });
  }
  birdFlocks.push({ dir, x: startX, gy: groundY, speed, drift, birds, age: 0 });
}

function updateBirds(dt) {
  if (player.scene === "outside" && isBirdTime()) {
    birdSpawnTimer -= dt;
    if (birdSpawnTimer <= 0) {
      if (birdFlocks.length < BIRD_MAX_FLOCKS) spawnBirdFlock();
      birdSpawnTimer = birdRand(BIRD_SPAWN_GAP[0], BIRD_SPAWN_GAP[1]);
    }
  }
  const v = birdViewRect();
  for (let i = birdFlocks.length - 1; i >= 0; i--) {
    const f = birdFlocks[i];
    f.age += dt;
    f.x += f.dir * f.speed * dt;
    f.gy += f.drift * dt;
    for (const b of f.birds) {
      b.bobPhase += dt * 3;
      b.lag += b.speedJitter * dt * 0.3; // followers drift a touch in and out of formation
      b.lag = Math.max(-6, Math.min(6, b.lag));
      if (b.glideT > 0) {
        b.glideT -= dt;
        b.frame = 1; // wings held out flat
      } else {
        b.nextGlide -= dt;
        if (b.nextGlide <= 0) { b.glideT = birdRand(0.5, 1.3); b.nextGlide = birdRand(2, 5); }
        b.frameT += dt;
        const per = 1 / b.fps;
        while (b.frameT >= per) { b.frameT -= per; b.frame = (b.frame + 1) % BIRD_FRAMES; }
      }
    }
    // Gone past the far side of the view (or something odd happened) -> drop it.
    const far = f.dir > 0 ? f.x - 80 > v.x + v.w : f.x + 80 < v.x;
    if (far || f.age > 90) birdFlocks.splice(i, 1);
  }
}

/* ---------------- drawing ---------------- */

// World position of a bird's body (in the sky) and of its shadow (on the ground).
function birdPositions(f, b) {
  const x = f.x + b.ox + b.lag * f.dir;
  const gy = f.gy + b.oy;
  const bob = Math.sin(b.bobPhase) * (b.glideT > 0 ? 0.6 : 1.5);
  return { x, gy, skyY: gy - b.alt + bob };
}

const birdShadowCache = new Map(); // sheet -> [frame silhouette canvases]
function birdShadowFrame(sheet, frame, fw, fh) {
  let arr = birdShadowCache.get(sheet);
  if (!arr) { arr = []; birdShadowCache.set(sheet, arr); }
  if (!arr[frame]) {
    const c = document.createElement("canvas");
    c.width = fw; c.height = fh;
    const g = c.getContext("2d");
    g.drawImage(sheet, frame * fw, 0, fw, fh, 0, 0, fw, fh);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "rgb(35,25,20)";
    g.fillRect(0, 0, fw, fh);
    arr[frame] = c;
  }
  return arr[frame];
}

// The same silhouette, already soft (blurred once, at 2x, with room round
// it) — per frame of each sheet. Performance: drawBirdShadows() used to set
// ctx.filter = "blur(1.5px)" on the MAIN canvas and draw every bird's
// shadow through it, every frame. A canvas blur filter is one of the most
// expensive things a phone can be asked to do (measured: the birds alone
// took the sunny-day frame rate from ~29 down to ~10). Now the blur is done
// once per frame picture and the shadow is just stamped.
const BIRD_SHADOW_PAD = 3; // art px of room for the blur
const birdSoftShadowCache = new Map(); // sheet -> [soft canvases]
function birdSoftShadowFrame(sheet, frame, fw, fh) {
  let arr = birdSoftShadowCache.get(sheet);
  if (!arr) { arr = []; birdSoftShadowCache.set(sheet, arr); }
  if (!arr[frame]) {
    const R = 2, P = BIRD_SHADOW_PAD;
    const c = document.createElement("canvas");
    c.width = (fw + P * 2) * R; c.height = (fh + P * 2) * R;
    const g = c.getContext("2d");
    g.filter = "blur(" + (1.5 * R) + "px)";
    g.drawImage(birdShadowFrame(sheet, frame, fw, fh), P * R, P * R, fw * R, fh * R);
    g.filter = "none";
    arr[frame] = c;
  }
  return arr[frame];
}

// On the ground, under trees/houses/characters — called before
// renderWorldObjectsSorted() (js/camera.js).
function drawBirdShadows() {
  if (player.scene !== "outside" || !birdFlocks.length) return;
  const { alpha } = getShadowParams();
  const a = BIRD_SHADOW_ALPHA * Math.max(0.35, alpha);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = a;
  ctx.imageSmoothingEnabled = true; // it's a soft shadow
  for (const f of birdFlocks) {
    for (const b of f.birds) {
      const sheet = birdSheet(b.id, f.dir);
      if (!sheet || !sheet.width) continue;
      const fw = Math.floor(sheet.width / BIRD_FRAMES), fh = sheet.height;
      const p = birdPositions(f, b);
      const s = b.scale * zoom * 0.8; // a little smaller than the bird
      const w = fw * s, h = fh * s * 0.6; // squashed — it lies flat on the ground
      const sx = (p.x - camX) * zoom - w / 2, sy = (p.gy - camY) * zoom - h / 2;
      if (sx > view.width || sy > view.height || sx + w < 0 || sy + h < 0) continue;
      const px = BIRD_SHADOW_PAD * (w / fw), py = BIRD_SHADOW_PAD * (h / fh); // the soft canvas's padding, at this size
      ctx.drawImage(birdSoftShadowFrame(sheet, b.frame, fw, fh), sx - px, sy - py, w + px * 2, h + py * 2);
    }
  }
  ctx.restore();
}

// In the sky, above every object — called after the placement grid and
// before the clouds (js/camera.js).
function drawBirds() {
  if (player.scene !== "outside" || !birdFlocks.length) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1; // whatever was drawn before may have left these changed
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  for (const f of birdFlocks) {
    // Back-to-front by height on screen so overlapping birds layer sensibly.
    const list = f.birds.map((b) => ({ b, p: birdPositions(f, b) })).sort((m, n) => m.p.skyY - n.p.skyY);
    for (const { b, p } of list) {
      const sheet = birdSheet(b.id, f.dir);
      if (!sheet || !sheet.width) continue;
      const fw = Math.floor(sheet.width / BIRD_FRAMES), fh = sheet.height;
      const s = b.scale * zoom, w = fw * s, h = fh * s;
      const x = (p.x - camX) * zoom - w / 2, y = (p.skyY - camY) * zoom - h / 2;
      if (x > view.width || y > view.height || x + w < 0 || y + h < 0) continue;
      ctx.drawImage(sheet, b.frame * fw, 0, fw, fh, x, y, w, h);
    }
  }
  ctx.restore();
}
