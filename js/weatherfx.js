"use strict";

/* =================================================================
   WEATHER FX — ambient rain, drifting clouds (with soft ground
   shadows), low ground-hugging fog, and sun/god-rays.

   Ported over from another build of this project (which had its own
   day/night clock in js/lighting.js) and re-wired here to read time of
   day from THIS project's existing js/daynight.js instead of bringing
   in a second clock — computeSun() below is the only new "clock" code,
   and it just samples getGameHour()/getDayFactor(), it doesn't run one.

   Everything here is WORLD-space, exactly like the player and ground
   items: each particle has a (wx, wy) position on the map, and every
   draw call converts that to a screen position with the same
   `(worldPos - camX/camY) * zoom` formula camera.js already uses. That
   gives real parallax — a raindrop's position only changes because IT
   is falling, not because the camera moved.

   Entry points (all called from js/main.js and js/camera.js):
     initWeatherFX()              once, from main.js's start()
     updateWeatherFX(dt)          every frame, from main.js's loop()
     drawCloudShadows(camX, camY) camera.js render(), on the ground
     drawFogLayer(camX, camY, front)  camera.js render(), twice (back/front)
     drawCloudSprites(camX, camY) camera.js render(), above the player
     drawWeatherOverlayFX()       camera.js render(), rain — topmost
     drawSunRays(camX, camY)      camera.js render(), after the sky tint

   Named *FX where a name would otherwise collide with something this
   project already has (js/hud.js's cosmetic "Rainy/Cloudy/..." readout
   also uses the word "weather", for a purely decorative HUD rotation
   that has nothing to do with the actual effects drawn here).
================================================================= */

// --- small helpers (not already defined elsewhere in this project) -----
function lerpFX(a, b, t) {
  return a + (b - a) * t;
}
function lerpColorFX(a, b, t) {
  return [lerpFX(a[0], b[0], t), lerpFX(a[1], b[1], t), lerpFX(a[2], b[2], t)];
}
function smoothstepFX(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function rgbFX(c, a) {
  const r = Math.round(c[0]), g = Math.round(c[1]), b = Math.round(c[2]);
  return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}
function weatherRand(min, max) {
  return min + Math.random() * (max - min);
}

// Current calendar weather's nudge on ambient effects that already exist
// for time-of-day (see js/config.js's WEATHER_CLOUD_OPACITY_MULT/
// WEATHER_SUNRAY_MULT, and js/calendar.js's getCurrentWeather()) — sunny
// days get thinner clouds and stronger god-rays, rainy/snowy days get
// thicker cloud cover and duller (sun-blocked) rays. Falls back to a
// neutral 1.0 if calendar.js hasn't produced a reading yet.
// Blended across a weather change (weatherWeight(), js/calendar.js), so
// the clouds thicken / the sun rays dim gradually instead of in one frame.
function blendedWeatherMult(table) {
  if (typeof weatherWeight !== "function") {
    const w = typeof getCurrentWeather === "function" ? getCurrentWeather() : null;
    return (w && table[w.name]) || 1;
  }
  let sum = 0, total = 0;
  for (const st of WEATHER_STATES) {
    const k = weatherWeight(st.name);
    if (k > 0) { sum += k * (table[st.name] || 1); total += k; }
  }
  return total > 0 ? sum / total : 1;
}
function weatherCloudMult() { return blendedWeatherMult(WEATHER_CLOUD_OPACITY_MULT); }
function weatherSunrayMult() { return blendedWeatherMult(WEATHER_SUNRAY_MULT); }
// 0..1 — how much rain / snow is falling right now (fades across a change)
function fxWeight(name) {
  if (typeof weatherWeight === "function") return weatherWeight(name);
  return getCurrentWeather().name === name ? 1 : 0;
}
function rainAmount() { return Math.min(1, fxWeight("Rainy") + fxWeight("Thunderstorm")); }
function snowAmount() { return fxWeight("Snow"); }

// --- sun direction/colour, sampled from THIS project's own clock -------
// Only what the cloud shadows + god rays actually need: which way the
// light comes from (dirX/dirY/angle), how long a shadow it casts
// (length, only used to offset a cloud's shadow from the cloud sprite),
// how strong direct light is right now (vis, 0 at night), and the
// colour/strength of the rays themselves (color, rays).
const sun = { dirX: 0.5, dirY: 0.86, angle: Math.PI / 3, length: 1, vis: 1, night: 0, rays: 0, color: [255, 220, 150] };

function computeSun() {
  const h = getGameHour(); // js/daynight.js
  const span = SUNSET_HOUR - SUNRISE_HOUR;
  const p = (h - SUNRISE_HOUR) / span; // 0 at sunrise, 1 at sunset (can be <0 or >1 at night)
  const pc = Math.max(0, Math.min(1, p));
  const day = p > 0 && p < 1;

  const elevDeg = day ? Math.sin(Math.PI * pc) * SUN_MAX_ELEVATION_DEG : 0;
  const elevation = (elevDeg * Math.PI) / 180;
  sun.vis = smoothstepFX(0, 9, elevDeg);
  sun.night = 1 - getDayFactor(); // reuse the existing day/night blend rather than re-deriving it

  const sunDeg = lerpFX(SUN_DIR_MORNING_DEG, SUN_DIR_EVENING_DEG, pc);
  const deg = lerpFX(MOON_DIR_DEG, sunDeg, sun.vis);
  sun.angle = (deg * Math.PI) / 180;
  sun.dirX = Math.cos(sun.angle);
  sun.dirY = Math.sin(sun.angle);

  const sunLen = SHADOW_LENGTH_SCALE / Math.max(0.05, Math.tan(elevation));
  const clampedLen = Math.max(SHADOW_LENGTH_MIN, Math.min(SHADOW_LENGTH_MAX, sunLen));
  sun.length = lerpFX(0.9, clampedLen, sun.vis);

  // God-ray strength: strong and warm near sunrise/sunset, faint at solar
  // noon, gone at night — one rise/fall curve instead of a full keyframe
  // table (see js/config.js's DAY_KEYFRAMES in the sister build for the
  // fuller version this approximates).
  const raysShape = day ? 0.32 + 0.68 * (1 - Math.sin(Math.PI * pc)) : 0;
  sun.rays = raysShape * sun.vis;
  const warm = [255, 180, 120], pale = [255, 244, 214];
  sun.color = lerpColorFX(warm, pale, Math.min(1, elevDeg / (SUN_MAX_ELEVATION_DEG * 0.6 || 1)));
}

// current visible world rectangle, recomputed wherever needed since
// zoom/window size can change at any time
function visibleWorldRect() {
  return { w: view.width / zoom, h: view.height / zoom };
}

// --- Rain -----------------------------------------------------------
// Per request, modelled on the "CSS Rain Effect" pen (codepen.io/arickle/
// pen/XKjMZY) — just the rain, not its dark background, and no pixel
// sprites anywhere (the old RainOnFloor.png splash is gone too):
//   - each drop is a long, very thin stem that fades from invisible at
//     the top to soft white at the bottom (the pen's linear-gradient),
//   - drops fall fast and straight, each with its own speed so they
//     never move as one sheet,
//   - where a drop lands its stem vanishes and a "splat" plays: a dotted
//     arc (the top of an ellipse) that pops open and fades,
//   - a second, half-opacity "back row" behind the front one for depth.
// It's a screen-space overlay like the pen (it doesn't scroll with the
// map). Sizes are in CSS px and scaled to the canvas, so it looks the
// same on any screen. Thunderstorm = more drops, faster, longer
// (rainIntensity()).
const rainDrops = [];   // { x, y, landY, speed, row } — x/y/landY as 0..1 of the screen
const splashes = [];    // { x, y, t, row } — screen fractions too
let rainStemSprite = null;

function isRaining(name) {
  return name === "Rainy" || name === "Thunderstorm";
}

// Multipliers for the CURRENT weather: plain rain is 1x across the
// board, a thunderstorm scales up.
function rainIntensity() {
  // Blended: rain -> storm (or back) ramps the drop count/speed/length
  // up or down gradually; rain starting / stopping thins in and out.
  const wR = fxWeight("Rainy"), wS = fxWeight("Thunderstorm"), total = wR + wS;
  const storm = total > 0 ? wS / total : 0;
  return {
    drops: wR + wS * STORM_DROP_MULT,
    speed: lerpFX(1, STORM_SPEED_MULT, storm),
    length: lerpFX(1, STORM_LENGTH_MULT, storm),
  };
}

// How many of the pooled drops are live right now (the pool is sized for
// a storm; plain rain uses the first part of it).
function activeRainDropCount() {
  return Math.min(rainDrops.length, Math.round(RAIN_DROP_COUNT * rainIntensity().drops));
}

// CSS px -> canvas px (the canvas can be bigger than its CSS size).
function rainPxScale() {
  const r = view.getBoundingClientRect();
  return r.width ? view.width / r.width : 1;
}

function spawnRainDrop(atInit, row) {
  return {
    x: Math.random(),
    // The pen staggers where each drop starts so the splats don't land
    // in one line; here each drop also lands at its own height.
    y: atInit ? Math.random() * 1.2 - 0.2 : -Math.random() * 0.25,
    landY: 0.35 + Math.random() * 0.62,
    speed: RAIN_FALL_SCREENS_PER_SEC * (0.85 + Math.random() * 0.35), // screen heights per second
    row: row !== undefined ? row : (Math.random() < 0.5 ? 0 : 1),    // 0 = front, 1 = back row
  };
}

function updateRain(dt) {
  const speedMult = rainIntensity().speed;
  const active = activeRainDropCount();
  for (let i = 0; i < active; i++) {
    const d = rainDrops[i];
    d.y += d.speed * speedMult * dt;
    if (d.y >= d.landY) {
      splashes.push({ x: d.x, y: d.landY, t: 0, row: d.row });
      Object.assign(d, spawnRainDrop(false, d.row));
    }
  }
  for (let i = splashes.length - 1; i >= 0; i--) {
    splashes[i].t += dt;
    if (splashes[i].t >= RAIN_SPLAT_SECONDS) splashes.splice(i, 1);
  }
}

// The stem, drawn once: 1 wide, a vertical fade from transparent to the
// drop colour — the pen's `linear-gradient(to bottom, transparent,
// rgba(255,255,255,.25))`. Scaled per drop.
function getRainStemSprite() {
  if (rainStemSprite) return rainStemSprite;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(" + RAIN_COLOR_RGB + ",0)");
  grad.addColorStop(1, "rgba(" + RAIN_COLOR_RGB + "," + RAIN_STEM_ALPHA + ")");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  rainStemSprite = c;
  return c;
}

function drawRain(onlyRow) {
  const W = view.width, H = view.height;
  const k = rainPxScale();
  const lengthMult = rainIntensity().length;
  const active = activeRainDropCount();
  const stem = getRainStemSprite();
  const stemW = Math.max(1, RAIN_STEM_WIDTH * k);
  const stemH = RAIN_STEM_LENGTH * k * lengthMult;

  const fade = rainAmount();
  ctx.save();
  ctx.imageSmoothingEnabled = true; // a smooth gradient, not pixel art
  // Back row first (half opacity, like the pen's .back-row), then front.
  for (const row of [1, 0]) {
    if (onlyRow !== undefined && row !== onlyRow) continue;
    ctx.globalAlpha = (row === 1 ? 0.5 : 1) * fade;
    for (let i = 0; i < active; i++) {
      const d = rainDrops[i];
      if (d.row !== row) continue;
      const bottom = d.y * H;
      if (bottom <= 0) continue;
      ctx.drawImage(stem, d.x * W - stemW / 2, bottom - stemH, stemW, stemH);
    }
  }

  // Splats: the dotted top edge of an ellipse (15 x 10 CSS px in the
  // pen) popping open from nothing, then fading out as it grows a bit more.
  // Performance (phones): a dashed stroked ellipse per splash per frame was
  // very costly; the dotted arc is drawn once (rainSplatSprite()) and
  // stamped at each splash's size.
  const splat = rainSplatSprite(k);
  for (const s of splashes) {
    if (onlyRow !== undefined && s.row !== onlyRow) continue;
    const p = s.t / RAIN_SPLAT_SECONDS;
    const scale = p < 0.5 ? p / 0.5 : 1 + (p - 0.5); // 0 -> 1, then 1 -> 1.5
    const alpha = p < 0.5 ? 1 - p : Math.max(0, 1 - p) * 1; // 1 -> 0.5 -> 0
    if (scale <= 0.02) continue;
    ctx.globalAlpha = alpha * (s.row === 1 ? 0.5 : 1) * fade;
    const rx = 7.5 * k * scale, ry = 5 * k * scale, cx = s.x * W, cy = s.y * H + 5 * k * scale;
    const pad = splat.pad * scale;
    ctx.drawImage(splat.c, cx - rx - pad, cy - ry - pad, rx * 2 + pad * 2, ry + pad * 2);
  }
  ctx.restore();
}
// The splat's dotted half-ellipse, drawn once per pixel scale (`k`).
let rainSplatCache = null;
function rainSplatSprite(k) {
  if (rainSplatCache && rainSplatCache.k === k) return rainSplatCache;
  const rx = 7.5 * k, ry = 5 * k, pad = Math.max(1, 2 * k);
  const c = document.createElement("canvas");
  c.width = Math.ceil(rx * 2 + pad * 2); c.height = Math.ceil(ry + pad * 2);
  const g = c.getContext("2d");
  g.lineWidth = Math.max(1, 2 * k);
  g.setLineDash([Math.max(1, 2 * k), Math.max(1, 2 * k)]);
  g.strokeStyle = "rgba(" + RAIN_COLOR_RGB + "," + RAIN_SPLAT_ALPHA + ")";
  g.beginPath();
  g.ellipse(pad + rx, pad + ry, rx, ry, 0, Math.PI, 2 * Math.PI);
  g.stroke();
  rainSplatCache = { c, k, pad };
  return rainSplatCache;
}

// --- Lightning (Thunderstorm only) -----------------------------------
// A full-screen flash on a random timer. Real lightning flickers rather
// than fading smoothly, so the alpha below is a decaying envelope cut by
// a fast strobe — one strike reads as two or three quick stabs of light,
// not a single soft pulse.
let lightningCountdown = weatherRand(LIGHTNING_GAP_MIN, LIGHTNING_GAP_MAX);
let lightningFlash = 0; // seconds of flicker left in the current strike

function updateLightning(dt) {
  if (fxWeight("Thunderstorm") < 0.6) { // no strikes until the storm has mostly rolled in
    lightningFlash = 0;
    lightningBolt = null;
    return;
  }
  if (lightningFlash > 0) lightningFlash = Math.max(0, lightningFlash - dt);
  lightningCountdown -= dt;
  if (lightningCountdown <= 0) {
    lightningFlash = LIGHTNING_FLASH_DURATION;
    lightningCountdown = weatherRand(LIGHTNING_GAP_MIN, LIGHTNING_GAP_MAX);
    lightningBolt = buildLightningBolt();
  }
}

// The bolt itself — a jagged line from the top of the screen down to a
// random point, with a couple of shorter branches forking off it. Built
// ONCE per strike and then just redrawn, so it flickers in place like a
// real bolt instead of writhing around during its own flash.
//
// Screen-space on purpose: a strike is lightning somewhere over the
// scene, not an object standing in the world, so it shouldn't scroll
// with the camera.
let lightningBolt = null;

function buildLightningBolt() {
  const vw = view.width, vh = view.height;
  const main = [];
  let x = weatherRand(vw * 0.15, vw * 0.85);
  let y = 0;
  const endY = weatherRand(vh * 0.45, vh * 0.8); // stops partway down, behind the treeline
  const steps = Math.round(weatherRand(7, 11));
  const stepY = endY / steps;
  main.push({ x, y });
  for (let i = 0; i < steps; i++) {
    y += stepY;
    x += weatherRand(-LIGHTNING_JAG_PX, LIGHTNING_JAG_PX);
    main.push({ x, y });
  }

  // A branch or two, forking off a mid-point and dying out quickly.
  const branches = [];
  const branchCount = Math.round(weatherRand(1, 2.49));
  for (let b = 0; b < branchCount; b++) {
    const from = Math.floor(weatherRand(1, main.length - 2));
    const pts = [main[from]];
    let bx = main[from].x, by = main[from].y;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const n = Math.round(weatherRand(2, 4));
    for (let i = 0; i < n; i++) {
      by += stepY * 0.7;
      bx += dir * weatherRand(6, LIGHTNING_JAG_PX * 1.3);
      pts.push({ x: bx, y: by });
    }
    branches.push(pts);
  }
  return { main, branches };
}

function strokeBoltPath(pts, width, alpha) {
  if (pts.length < 2) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function drawLightning() {
  if (lightningFlash <= 0) return;
  const t = lightningFlash / LIGHTNING_FLASH_DURATION; // 1 -> 0 over the strike
  const strobe = 0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * 5)); // the flicker
  const alpha = LIGHTNING_FLASH_ALPHA * t * t * strobe;             // t*t = fast decay
  if (alpha <= 0.004) return;
  ctx.save();
  // the sky lighting up
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = "rgb(" + LIGHTNING_COLOR_RGB + ")";
  ctx.fillRect(0, 0, view.width, view.height);

  // ...and the bolt drawn over it. Only for the first part of the
  // strike — the bolt itself is gone long before the sky finishes
  // fading, which is what makes the afterglow read as an afterglow.
  if (lightningBolt && t > 0.45) {
    const boltFade = (t - 0.45) / 0.55; // 1 at the strike, 0 as it dies
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Wide soft halo first, then the hot white core on top — that
    // pairing is what stops a bolt reading as a plain drawn line.
    ctx.strokeStyle = "rgb(" + LIGHTNING_COLOR_RGB + ")";
    strokeBoltPath(lightningBolt.main, LIGHTNING_BOLT_WIDTH * 4, boltFade * 0.45 * strobe);
    for (const b of lightningBolt.branches) {
      strokeBoltPath(b, LIGHTNING_BOLT_WIDTH * 2.5, boltFade * 0.3 * strobe);
    }
    ctx.strokeStyle = "#ffffff";
    strokeBoltPath(lightningBolt.main, LIGHTNING_BOLT_WIDTH, boltFade * strobe);
    for (const b of lightningBolt.branches) {
      strokeBoltPath(b, LIGHTNING_BOLT_WIDTH * 0.6, boltFade * 0.8 * strobe);
    }
  }
  ctx.restore();
}

// --- Snow ---------------------------------------------------------------
// Same world-space convention as rain above, but falls slower/gentler and
// sways side to side instead of dropping straight down, and only spawns/
// draws while js/calendar.js's getCurrentWeather() reports "Snow" — see
// updateWeatherFX()/drawWeatherOverlayFX() at the bottom of this file.
const snowFlakes = [];

/* --- Snow, drawn by code ---------------------------------------------
   Per request, modelled on the "Snow" pen (codepen.io/ivanodintsov/pen/
   KVgwRG) instead of the old Snow.png sprite: plain white round flakes,
   radius 0.5-3 px, each with its own fall speed (1-3 px per frame) and
   sideways wind (-0.5..3 px per frame), wrapping back to the top when
   they fall out of view. Screen-space like the pen, in CSS px (scaled to
   the canvas when drawn), so it keeps falling seamlessly while you go in
   and out of a house — it never depended on where the camera is.
   Two rows: a BACK row drawn behind the characters/trees and a FRONT row
   drawn over them (drawWeatherBackFX() / drawWeatherOverlayFX()). */
// Performance: getBoundingClientRect() forces the browser to lay the page out
// again — it was called for every snowflake / raindrop. The size only changes
// when the window does, so it's read once and kept until a resize.
let screenCssSizeCache = null;
function screenCssSize() {
  if (screenCssSizeCache) return screenCssSizeCache;
  const r = view.getBoundingClientRect();
  screenCssSizeCache = { w: r.width || window.innerWidth, h: r.height || window.innerHeight };
  return screenCssSizeCache;
}
window.addEventListener("resize", () => { screenCssSizeCache = null; });
window.addEventListener("orientationchange", () => { screenCssSizeCache = null; });
if (window.visualViewport) window.visualViewport.addEventListener("resize", () => { screenCssSizeCache = null; });

function spawnSnowFlake(atInit, row) {
  const sz = screenCssSize();
  const back = row !== undefined ? row === 1 : Math.random() < 0.5;
  return {
    x: Math.random() * sz.w,
    y: atInit ? Math.random() * sz.h : -Math.random() * 20,
    r: weatherRand(SNOW_RADIUS_MIN, SNOW_RADIUS_MAX) * (back ? 0.75 : 1),
    speed: weatherRand(SNOW_SPEED_MIN, SNOW_SPEED_MAX) * (back ? 0.75 : 1), // CSS px / sec
    wind: weatherRand(SNOW_WIND_MIN, SNOW_WIND_MAX) * (back ? 0.75 : 1),
    row: back ? 1 : 0,
  };
}

function updateSnow(dt) {
  const sz = screenCssSize();
  for (const f of snowFlakes) {
    f.y += f.speed * dt;
    f.x += f.wind * dt;
    if (f.y - f.r > sz.h) { f.y = -f.r; f.x = Math.random() * sz.w; }
    if (f.x - f.r > sz.w) f.x -= sz.w + f.r * 2;
    else if (f.x + f.r < 0) f.x += sz.w + f.r * 2;
  }
}

function drawSnow(row) {
  const k = rainPxScale();
  const amt = snowAmount();
  // starting / stopping: fewer flakes and fainter, growing to the full snowfall
  const n = Math.ceil(snowFlakes.length * Math.min(1, amt * 1.3));
  ctx.save();
  ctx.globalAlpha = (row === 1 ? SNOW_BACK_ALPHA : SNOW_FRONT_ALPHA) * Math.min(1, amt * 1.5);
  // Performance (phones): every flake used to be a circle in ONE big path —
  // ~75 anti-aliased circles filled per row, every frame. Rasterising a
  // path like that is one of the most expensive things a phone's canvas
  // can do (measured: switching snow off doubled the outdoor frame rate).
  // Each flake is now the same pre-drawn soft dot (snowFlakeSprite()),
  // stamped scaled to its radius — image quads the GPU batches cheaply.
  // Same look: white, round, same sizes, same alpha.
  const dot = snowFlakeSprite();
  ctx.imageSmoothingEnabled = true;
  for (let i = 0; i < n; i++) {
    const f = snowFlakes[i];
    if (f.row !== row) continue;
    const x = f.x * k, y = f.y * k, r = Math.max(0.6, f.r * k);
    ctx.drawImage(dot, x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}
let snowFlakeDot = null;
function snowFlakeSprite() {
  if (snowFlakeDot) return snowFlakeDot;
  const S = 32, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 0.5, 0, Math.PI * 2); g.fill();
  snowFlakeDot = c;
  return c;
}

/* --- Falling leaves (sunny days, 09:00-15:00) ------------------------
   Per request: Leaf.png (6 frames of 12x7, a leaf tumbling) drifting
   across the screen on a sunny day between 9am and 3pm. Same screen-
   space, two-row treatment as the snow. Outside the time window no new
   leaves start, and the ones already falling finish their fall, so it
   eases in and out instead of popping. */
const leaves = [];
const LEAF_FRAME_W = 12, LEAF_FRAME_H = 7, LEAF_FRAME_COUNT = 6;

function isLeafTime() {
  if (getCurrentWeather().name !== "Sunny") return false;
  const h = getGameHour();
  return h >= LEAF_START_HOUR && h < LEAF_END_HOUR;
}

function spawnLeaf(atInit) {
  const sz = screenCssSize();
  const back = Math.random() < 0.5;
  return {
    live: false,
    x: Math.random() * sz.w,
    y: atInit ? Math.random() * sz.h : -10 - Math.random() * 60,
    vx: weatherRand(LEAF_WIND_MIN, LEAF_WIND_MAX),
    vy: weatherRand(LEAF_FALL_MIN, LEAF_FALL_MAX),
    swayAmp: weatherRand(10, 26),
    swaySpeed: weatherRand(0.8, 1.8),
    phase: Math.random() * Math.PI * 2,
    t: 0,
    frame: Math.floor(Math.random() * LEAF_FRAME_COUNT),
    frameT: Math.random(),
    fps: weatherRand(5, 9),
    flip: Math.random() < 0.5,
    row: back ? 1 : 0,
  };
}

function updateLeaves(dt) {
  const sz = screenCssSize();
  const spawning = isLeafTime();
  for (let i = 0; i < leaves.length; i++) {
    const l = leaves[i];
    if (!l.live) {
      // Waiting off-screen: start falling (staggered) only while it's leaf time.
      if (spawning && Math.random() < dt * 0.6) { Object.assign(l, spawnLeaf(false)); l.live = true; }
      continue;
    }
    l.t += dt;
    l.y += l.vy * dt;
    l.x += (l.vx + Math.cos(l.t * l.swaySpeed + l.phase) * l.swayAmp) * dt;
    l.frameT += dt * l.fps;
    l.frame = Math.floor(l.frameT) % LEAF_FRAME_COUNT;
    if (l.y > sz.h + 12 || l.x > sz.w + 30 || l.x < -30) l.live = false; // fell out of view
  }
}

function drawLeaves(row) {
  const img = assets.leaf;
  if (!img || !img.width) return;
  const k = rainPxScale();
  const scale = zoom * LEAF_SCALE * (row === 1 ? 0.8 : 1); // pixel-art sized like the world around it
  const w = LEAF_FRAME_W * scale, h = LEAF_FRAME_H * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = row === 1 ? 0.8 : 1;
  for (const l of leaves) {
    if (!l.live || l.row !== row) continue;
    const x = l.x * k, y = l.y * k;
    if (l.flip) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, l.frame * LEAF_FRAME_W, 0, LEAF_FRAME_W, LEAF_FRAME_H, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, l.frame * LEAF_FRAME_W, 0, LEAF_FRAME_W, LEAF_FRAME_H, x - w / 2, y - h / 2, w, h);
    }
  }
  ctx.restore();
}

// --- Clouds -----------------------------------------------------------
const clouds = [];
const cloudImages = [assets.clouds, assets.clouds2, assets.clouds3];

function spawnCloud() {
  return {
    wx: weatherRand(-CLOUD_SRC_W * CLOUD_SCALE_MAX, MAP_W),
    wy: weatherRand(0, MAP_H),
    speed: weatherRand(CLOUD_SPEED_MIN, CLOUD_SPEED_MAX),
    scale: weatherRand(CLOUD_SCALE_MIN, CLOUD_SCALE_MAX),
    opacity: weatherRand(CLOUD_OPACITY_MIN, CLOUD_OPACITY_MAX),
    variant: Math.floor(weatherRand(0, cloudImages.length)),
  };
}

function updateClouds(dt) {
  for (const c of clouds) {
    c.wx += c.speed * dt;
    const halfW = (CLOUD_SRC_W * c.scale) / 2;
    if (c.wx - halfW > MAP_W) {
      c.wx = -halfW;
      c.wy = weatherRand(0, MAP_H);
      c.speed = weatherRand(CLOUD_SPEED_MIN, CLOUD_SPEED_MAX);
      c.scale = weatherRand(CLOUD_SCALE_MIN, CLOUD_SCALE_MAX);
      c.opacity = weatherRand(CLOUD_OPACITY_MIN, CLOUD_OPACITY_MAX);
      c.variant = Math.floor(weatherRand(0, cloudImages.length));
    }
  }
}

// How far/which way a cloud's ground shadow offsets from the cloud sprite
// itself — further away the lower the sun is, same direction as the sun.
function cloudShadowOffset() {
  const d = CLOUD_HEIGHT * sun.length;
  return { x: sun.dirX * d, y: sun.dirY * d };
}
function cloudShadowStrength() {
  return lerpFX(CLOUD_SHADOW_NIGHT, 1, 1 - sun.night);
}

// Pre-tinted (SHADOW_COLOR) + fully-opaque (for the sun-ray occlusion
// mask) versions of each cloud sprite, built once. The source art is very
// faint (low alpha), so the mask is stacked on itself until it saturates
// — no pixel read-back needed (keeps this working from file://).
const cloudShadowImages = [];
const cloudMaskImages = [];
let cloudShadowBuf = null, cloudShadowCtx = null, cloudShadowBlurBuf = null, cloudShadowBlurCtx = null;

function buildCloudShadowImages() {
  cloudShadowImages.length = 0;
  cloudMaskImages.length = 0;
  for (const img of cloudImages) {
    const m = document.createElement("canvas");
    m.width = img.width;
    m.height = img.height;
    const mctx = m.getContext("2d");
    for (let i = 0; i < 48; i++) mctx.drawImage(img, 0, 0);
    cloudMaskImages.push(m);

    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const cctx = c.getContext("2d");
    cctx.drawImage(img, 0, 0);
    cctx.globalCompositeOperation = "source-in";
    cctx.fillStyle = `rgb(${SHADOW_COLOR[0]},${SHADOW_COLOR[1]},${SHADOW_COLOR[2]})`;
    cctx.fillRect(0, 0, c.width, c.height);
    cloudShadowImages.push(c);
  }
}

function ensureCloudShadowBuffers() {
  const bw = Math.ceil(view.width / CLOUD_SHADOW_BUFFER_SCALE),
    bh = Math.ceil(view.height / CLOUD_SHADOW_BUFFER_SCALE);
  if (cloudShadowBuf && cloudShadowBuf.width === bw && cloudShadowBuf.height === bh) return;
  cloudShadowBuf = document.createElement("canvas");
  cloudShadowBlurBuf = document.createElement("canvas");
  cloudShadowBuf.width = cloudShadowBlurBuf.width = bw;
  cloudShadowBuf.height = cloudShadowBlurBuf.height = bh;
  cloudShadowCtx = cloudShadowBuf.getContext("2d");
  cloudShadowBlurCtx = cloudShadowBlurBuf.getContext("2d");
}

// Soft shade on the ground beneath each cloud — call BEFORE the
// player/ground items are drawn, so the character visibly walks through
// the shadow rather than over it.
// Performance (per request, "optimize mo medyo lag"): the blurred cloud-
// shadow buffer (a canvas blur filter — slow, especially in Firefox/Safari)
// is rebuilt only every CLOUD_SHADOW_REBUILD_EVERY frames. In between the
// last one is drawn again, shifted by how far the camera moved; the clouds
// themselves drift far less than a pixel a frame, so it can't be seen.
const CLOUD_SHADOW_REBUILD_EVERY = 3;
// On a phone the blurred cloud-shadow / sun-ray buffers are rebuilt 3x less often (the blur is the
// expensive part there); in between they're just slid with the camera, and they drift too slowly to tell.
function weatherRebuildEvery(n) { return typeof MOBILE_ON !== "undefined" && MOBILE_ON ? n * 3 : n; }
let cloudShadowCache = null;
function drawCloudShadows(camX, camY) {
  const cc = cloudShadowCache;
  if (cc && cc.zoom === zoom && cc.age < weatherRebuildEvery(CLOUD_SHADOW_REBUILD_EVERY) - 1 && cc.w === view.width && cc.h === view.height) {
    cc.age++;
    const ox = (cc.camX - camX) * zoom, oy = (cc.camY - camY) * zoom;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cc.src, 0, 0, cc.src.width, cc.src.height, ox, oy, cc.src.width * CLOUD_SHADOW_BUFFER_SCALE, cc.src.height * CLOUD_SHADOW_BUFFER_SCALE);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
    return;
  }
  ensureCloudShadowBuffers();
  const k = 1 / CLOUD_SHADOW_BUFFER_SCALE;
  const bz = zoom * k;
  const off = cloudShadowOffset();
  const strength = CLOUD_SHADOW_OPACITY * cloudShadowStrength() * weatherCloudMult();
  const margin = CLOUD_SHADOW_BLUR_PX * 3 * k;

  const b = cloudShadowCtx;
  b.globalAlpha = 1;
  b.clearRect(0, 0, cloudShadowBuf.width, cloudShadowBuf.height);
  b.imageSmoothingEnabled = true;
  for (const c of clouds) {
    const w = CLOUD_SRC_W * c.scale * bz,
      h = CLOUD_VARIANT_HEIGHTS[c.variant] * c.scale * bz;
    const x = (c.wx + off.x - camX) * bz,
      y = (c.wy + off.y - camY) * bz;
    if (x + w / 2 < -margin || x - w / 2 > cloudShadowBuf.width + margin || y + h / 2 < -margin || y - h / 2 > cloudShadowBuf.height + margin) continue;
    b.globalAlpha = Math.min(1, strength * c.opacity);
    b.drawImage(cloudShadowImages[c.variant], x - w / 2, y - h / 2, w, h);
  }

  let src = cloudShadowBuf;
  if (CLOUD_SHADOW_BLUR_PX > 0) {
    cloudShadowBlurCtx.clearRect(0, 0, cloudShadowBlurBuf.width, cloudShadowBlurBuf.height);
    cloudShadowBlurCtx.filter = `blur(${CLOUD_SHADOW_BLUR_PX * k}px)`;
    cloudShadowBlurCtx.drawImage(cloudShadowBuf, 0, 0);
    cloudShadowBlurCtx.filter = "none";
    src = cloudShadowBlurBuf;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, src.width * CLOUD_SHADOW_BUFFER_SCALE, src.height * CLOUD_SHADOW_BUFFER_SCALE);
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
  cloudShadowCache = { src, camX, camY, zoom, age: 0, w: view.width, h: view.height };
}

// The cloud sprites themselves — call AFTER the player, since a cloud
// floats higher than anything on the ground.
function drawCloudSprites(camX, camY) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  for (const c of clouds) {
    const h = CLOUD_VARIANT_HEIGHTS[c.variant];
    const w = CLOUD_SRC_W * c.scale * zoom;
    const drawH = h * c.scale * zoom;
    const screenX = (c.wx - camX) * zoom;
    const screenY = (c.wy - camY) * zoom;
    if (screenX + w / 2 < 0 || screenX - w / 2 > view.width || screenY + drawH / 2 < 0 || screenY - drawH / 2 > view.height) continue;
    ctx.globalAlpha = Math.min(1, c.opacity * weatherCloudMult());
    ctx.drawImage(cloudImages[c.variant], screenX - w / 2, screenY - drawH / 2, w, drawH);
  }
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
}

// --- Fog ---------------------------------------------------------------
const fogPatches = [];
const fogImages = [assets.fog, assets.fog2, assets.fog3];

/* Per request ("yung fog sa labas kapag sunny dapat smooth yung
   entrance parang fade in din at out"): every patch now lives a little
   life instead of being permanently on — it fades IN where it appears,
   drifts for a while, fades OUT, and only then reappears somewhere else
   (already invisible, so the jump is never seen) to fade in again.
   Before, patches were simply always there at full strength and, on
   reaching the edge of the map, popped straight back to the other side.
   `age` starts at a random point so the patches don't all breathe in
   step with each other. */
const FOG_LIFE_MIN = 25, FOG_LIFE_MAX = 55; // seconds a patch lasts, fades included
const FOG_FADE_SEC = 6;                      // seconds to fade in, and again to fade out

function resetFogPatch(f, randomAge) {
  f.wx = weatherRand(-FOG_SRC_W * FOG_SCALE_MAX, MAP_W);
  f.wy = weatherRand(0, MAP_H);
  f.speed = weatherRand(FOG_SPEED_MIN, FOG_SPEED_MAX);
  f.scale = weatherRand(FOG_SCALE_MIN, FOG_SCALE_MAX);
  f.opacity = weatherRand(FOG_OPACITY_MIN, FOG_OPACITY_MAX);
  f.variant = Math.floor(weatherRand(0, fogImages.length));
  f.inFront = Math.random() < 0.5;
  f.life = weatherRand(FOG_LIFE_MIN, FOG_LIFE_MAX);
  f.age = randomAge ? weatherRand(0, f.life) : 0;
  return f;
}

function spawnFog() {
  return resetFogPatch({}, true);
}

// 0..1 — how visible a patch is at this point in its life (smoothstep
// ramps, so it eases in and out rather than fading linearly).
function fogLifeAlpha(f) {
  const ease = (t) => t * t * (3 - 2 * t);
  const tIn = Math.min(1, f.age / FOG_FADE_SEC);
  const tOut = Math.min(1, Math.max(0, (f.life - f.age) / FOG_FADE_SEC));
  return ease(Math.min(tIn, tOut));
}

function updateFog(dt) {
  for (const f of fogPatches) {
    f.wx += f.speed * dt;
    f.age += dt;
    const halfW = (FOG_SRC_W * f.scale) / 2;
    // Drifting off the edge of the map ends its life early — start the
    // fade-out instead of letting it pop.
    if (f.wx - halfW > MAP_W && f.life - f.age > FOG_FADE_SEC) f.age = f.life - FOG_FADE_SEC;
    if (f.age >= f.life) resetFogPatch(f, false); // invisible at this point — safe to move
  }
}

// Draws only the fog patches matching the requested layer. Call with
// front=false right before the player/ground items are drawn, and again
// with front=true right after.
function drawFogLayer(camX, camY, front) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  for (const f of fogPatches) {
    if (f.inFront !== front) continue;
    const w = FOG_SRC_W * f.scale * zoom;
    const h = FOG_SRC_H * f.scale * zoom;
    const screenX = (f.wx - camX) * zoom;
    const screenY = (f.wy - camY) * zoom;
    if (screenX + w / 2 < 0 || screenX - w / 2 > view.width || screenY + h / 2 < 0 || screenY - h / 2 > view.height) continue;
    const a = f.opacity * fogLifeAlpha(f);
    if (a <= 0.003) continue;
    ctx.globalAlpha = a;
    ctx.drawImage(fogImages[f.variant], screenX - w / 2, screenY - h / 2, w, h);
  }
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
}

// --- Sun rays / god rays -------------------------------------------------
const sunRays = [];
let sunRayTime = 0;
let sunBeamSoft = null, sunBeamStreak = null;

function buildSunBeamSprite(sharpness) {
  const w = 64, h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cctx = c.getContext("2d");
  const img = cctx.createImageData(w, h);

  const smooth = (t) => {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  };

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const along = smooth(v / SUNRAY_HEAD_FADE) * smooth((1 - v) / SUNRAY_TAIL_FADE);
    const halfWidth = SUNRAY_HEAD_WIDTH + (1 - SUNRAY_HEAD_WIDTH) * v;

    for (let x = 0; x < w; x++) {
      const u = Math.abs((x + 0.5) / w - 0.5) * 2;
      const d = u / halfWidth;
      let across = 0;
      if (d < 1) across = Math.pow(0.5 + 0.5 * Math.cos(Math.PI * d), sharpness);

      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * along * across);
    }
  }
  cctx.putImageData(img, 0, 0);
  return c;
}

function buildSunRays() {
  sunRays.length = 0;

  let seed = SUNRAY_SEED;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const range = (a, b) => a + rnd() * (b - a);

  const R = Math.sqrt(MAP_W * MAP_W + MAP_H * MAP_H) / 2 + 60;

  for (let p = -R; p < R; p += range(SUNRAY_LANE_GAP_MIN, SUNRAY_LANE_GAP_MAX)) {
    const roll = rnd();
    let kind;
    if (roll < SUNRAY_KINDS.streak.chance) kind = SUNRAY_KINDS.streak;
    else if (roll < SUNRAY_KINDS.streak.chance + SUNRAY_KINDS.beam.chance) kind = SUNRAY_KINDS.beam;
    else kind = SUNRAY_KINDS.haze;

    let q = -R - range(0, SUNRAY_LENGTH_MAX);
    while (q < R) {
      const length = range(SUNRAY_LENGTH_MIN, SUNRAY_LENGTH_MAX);
      sunRays.push({
        p,
        q,
        length,
        width: range(kind.widthMin, kind.widthMax),
        jitter: (range(-SUNRAY_ANGLE_JITTER_DEG, SUNRAY_ANGLE_JITTER_DEG) * Math.PI) / 180,
        alpha: range(kind.alphaMin, kind.alphaMax),
        streak: kind === SUNRAY_KINDS.streak,
        phase: range(0, Math.PI * 2),
        fadeSpeed: (Math.PI * 2) / range(SUNRAY_FADE_PERIOD_MIN, SUNRAY_FADE_PERIOD_MAX),
        phase2: range(0, Math.PI * 2),
        fadeSpeed2: (Math.PI * 2) / range(SUNRAY_FADE_PERIOD_MAX, SUNRAY_FADE_PERIOD_MAX * 2.5),
      });
      q += length + range(SUNRAY_SEGMENT_GAP_MIN, SUNRAY_SEGMENT_GAP_MAX);
    }
  }
}

let rayBuf = null, rayBufCtx = null, rayBlurBuf = null, rayBlurCtx = null,
  occBuf = null, occCtx = null, shaftBuf = null, shaftCtx = null, occPad = 0;

function sunRayOccScale() {
  return SUNRAY_BUFFER_SCALE * 2;
}

function ensureSunRayBuffers() {
  const bw = Math.ceil(view.width / SUNRAY_BUFFER_SCALE),
    bh = Math.ceil(view.height / SUNRAY_BUFFER_SCALE);
  if (rayBuf && rayBuf.width === bw && rayBuf.height === bh) return;

  rayBuf = document.createElement("canvas");
  rayBlurBuf = document.createElement("canvas");
  rayBuf.width = rayBlurBuf.width = bw;
  rayBuf.height = rayBlurBuf.height = bh;
  rayBufCtx = rayBuf.getContext("2d");
  rayBlurCtx = rayBlurBuf.getContext("2d");

  const os = sunRayOccScale();
  const ow = Math.ceil(view.width / os), oh = Math.ceil(view.height / os);
  occPad = Math.ceil((SUNRAY_SHAFT_LENGTH * ZOOM_MAX) / os) + 2;
  occBuf = document.createElement("canvas");
  occBuf.width = ow + occPad * 2;
  occBuf.height = oh + occPad * 2;
  occCtx = occBuf.getContext("2d");
  shaftBuf = document.createElement("canvas");
  shaftBuf.width = ow;
  shaftBuf.height = oh;
  shaftCtx = shaftBuf.getContext("2d");
}

function sunRayFade(ray) {
  const a = 0.5 + 0.5 * Math.sin(sunRayTime * ray.fadeSpeed + ray.phase);
  const b = 0.5 + 0.5 * Math.sin(sunRayTime * ray.fadeSpeed2 + ray.phase2);
  const wave = a * (0.65 + 0.35 * b);
  return SUNRAY_FADE_MIN + (1 - SUNRAY_FADE_MIN) * wave;
}

function buildSunShaftMask(camX, camY) {
  const os = sunRayOccScale();
  const oz = zoom / os;

  const o = occCtx;
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = "source-over";
  o.globalAlpha = 1;
  o.fillStyle = "#fff";
  o.fillRect(0, 0, occBuf.width, occBuf.height);
  o.globalCompositeOperation = "destination-out";
  o.imageSmoothingEnabled = true;
  for (const c of clouds) {
    const w = CLOUD_SRC_W * c.scale * oz, h = CLOUD_VARIANT_HEIGHTS[c.variant] * c.scale * oz;
    const x = (c.wx - camX) * oz + occPad, y = (c.wy - camY) * oz + occPad;
    if (x + w / 2 < 0 || x - w / 2 > occBuf.width || y + h / 2 < 0 || y - h / 2 > occBuf.height) continue;
    o.globalAlpha = Math.min(1, SUNRAY_CLOUD_DENSITY * c.opacity);
    o.drawImage(cloudMaskImages[c.variant], x - w / 2, y - h / 2, w, h);
  }

  const s = shaftCtx;
  const n = Math.max(2, SUNRAY_SHAFT_SAMPLES);
  const step = (SUNRAY_SHAFT_LENGTH * oz) / n;
  let wSum = 0;
  for (let i = 0; i < n; i++) wSum += 1 - i / n;
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = "source-over";
  s.globalAlpha = 1;
  s.clearRect(0, 0, shaftBuf.width, shaftBuf.height);
  s.globalCompositeOperation = "lighter";
  s.imageSmoothingEnabled = true;
  for (let i = 0; i < n; i++) {
    s.globalAlpha = (1 - i / n) / wSum;
    s.drawImage(occBuf, -occPad + sun.dirX * step * i, -occPad + sun.dirY * step * i);
  }
}

// Performance: the soft, slow-moving rays are rebuilt only every other
// frame. In between, the last finished (blurred) buffer is drawn again,
// just shifted by how far the camera moved — the rays are world-anchored,
// so that's exactly where they'd be. A zoom change rebuilds right away.
const SUNRAY_REBUILD_EVERY = 4; // was 2 — the rays move slowly enough that 4 can't be told apart
let sunRayCache = null; // { src, camX, camY, zoom, age }

function drawSunRays(camX, camY) {
  if (!SUNRAYS_ENABLED) return;
  const strength = sun.rays * SUNRAY_INTENSITY * weatherSunrayMult();
  if (strength <= 0.01) { sunRayCache = null; return; }
  if (sunRayCache && sunRayCache.zoom === zoom && sunRayCache.age < weatherRebuildEvery(SUNRAY_REBUILD_EVERY) - 1 &&
      sunRayCache.w === view.width && sunRayCache.h === view.height) {
    sunRayCache.age++;
    const src = sunRayCache.src;
    const ox = (sunRayCache.camX - camX) * zoom, oy = (sunRayCache.camY - camY) * zoom;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, 0, 0, src.width, src.height, ox, oy, src.width * SUNRAY_BUFFER_SCALE, src.height * SUNRAY_BUFFER_SCALE);
    ctx.restore();
    return;
  }

  const vw = view.width, vh = view.height;
  ensureSunRayBuffers();
  const k = 1 / SUNRAY_BUFFER_SCALE;
  const bz = zoom * k;

  const dx = sun.dirX, dy = sun.dirY;
  const nx = dy, ny = -dx;
  const cx = MAP_W / 2, cy = MAP_H / 2;

  const b = rayBufCtx;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = "source-over";
  b.globalAlpha = 1;
  b.clearRect(0, 0, rayBuf.width, rayBuf.height);
  b.globalCompositeOperation = "lighter";
  b.imageSmoothingEnabled = true;

  if (SUNRAY_AIR_GLOW > 0) {
    b.globalAlpha = Math.min(1, SUNRAY_AIR_GLOW * strength);
    b.fillStyle = "#fff";
    b.fillRect(0, 0, rayBuf.width, rayBuf.height);
  }

  for (const ray of sunRays) {
    const hx = cx + nx * ray.p + dx * ray.q, hy = cy + ny * ray.p + dy * ray.q;
    const angle = sun.angle + ray.jitter;

    const half = ray.length / 2;
    const sx = (hx + Math.cos(angle) * half - camX) * zoom, sy = (hy + Math.sin(angle) * half - camY) * zoom;
    const sr = (half + ray.width) * zoom + SUNRAY_BLUR_PX * 3;
    if (sx + sr < 0 || sx - sr > vw || sy + sr < 0 || sy - sr > vh) continue;

    const alpha = ray.alpha * strength * sunRayFade(ray);
    if (alpha <= 0.004) continue;
    b.globalAlpha = Math.min(1, alpha);

    const w = ray.width * bz, len = ray.length * bz;
    b.setTransform(1, 0, 0, 1, (hx - camX) * bz, (hy - camY) * bz);
    b.rotate(angle - Math.PI / 2);
    b.drawImage(ray.streak ? sunBeamStreak : sunBeamSoft, -w / 2, 0, w, len);
  }
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalAlpha = 1;

  if (SUNRAY_CLOUD_OCCLUSION) {
    buildSunShaftMask(camX, camY);
    b.globalCompositeOperation = "destination-in";
    const passes = Math.max(1, Math.round(SUNRAY_OCCLUSION_CONTRAST));
    for (let i = 0; i < passes; i++) b.drawImage(shaftBuf, 0, 0, rayBuf.width, rayBuf.height);
  }

  b.globalCompositeOperation = "source-in";
  b.fillStyle = rgbFX(sun.color);
  b.fillRect(0, 0, rayBuf.width, rayBuf.height);
  b.globalCompositeOperation = "source-over";

  let src = rayBuf;
  if (SUNRAY_BLUR_PX > 0) {
    rayBlurCtx.clearRect(0, 0, rayBlurBuf.width, rayBlurBuf.height);
    rayBlurCtx.filter = `blur(${SUNRAY_BLUR_PX * k}px)`;
    rayBlurCtx.drawImage(rayBuf, 0, 0);
    rayBlurCtx.filter = "none";
    src = rayBlurBuf;
  }

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, src.width * SUNRAY_BUFFER_SCALE, src.height * SUNRAY_BUFFER_SCALE);
  ctx.restore();
  sunRayCache = { src, camX, camY, zoom, age: 0, w: view.width, h: view.height };
  ctx.imageSmoothingEnabled = false;
}

// --- Setup / per-frame entry points -----------------------------------
function initWeatherFX() {
  computeSun();
  buildCloudShadowImages();
  // Pool at the STORM-sized maximum; plain rain just leaves the tail of
  // it idle (activeRainDropCount()), so switching weather never has to
  // allocate or throw away drops mid-game.
  for (let i = 0; i < RAIN_DROP_COUNT_MAX; i++) rainDrops.push(spawnRainDrop(true, i % 2));
  for (let i = 0; i < SNOW_FLAKE_COUNT; i++) snowFlakes.push(spawnSnowFlake(true, i % 2));
  for (let i = 0; i < LEAF_COUNT; i++) leaves.push(spawnLeaf(true));
  for (let i = 0; i < CLOUD_COUNT; i++) clouds.push(spawnCloud());
  for (let i = 0; i < FOG_COUNT; i++) fogPatches.push(spawnFog());
  sunBeamSoft = buildSunBeamSprite(1.5);
  sunBeamStreak = buildSunBeamSprite(2.2);
  buildSunRays();
}

/* --- Keep the weather still while the camera moves -------------------
   Per request ("yung snow parang sumusunod sa character dapat hindi"):
   snow, rain and leaves live in a wrapping screen-sized field (that's
   what keeps them going seamlessly in and out of houses), but outdoors,
   whenever the camera scrolls, every particle is shifted the opposite
   way by the same amount — so on screen they stay put in the world and
   the character walks through them instead of dragging them along.
   Skipped across a scene change or zoom change (no meaningful delta). */
let weatherCamLast = null;

function scrollWeatherWithCamera() {
  const now = { x: camX, y: camY, zoom, scene: player.scene };
  const last = weatherCamLast;
  weatherCamLast = now;
  if (!last || now.scene !== "outside" || last.scene !== "outside" || last.zoom !== now.zoom) return;
  const dxCanvas = (now.x - last.x) * zoom, dyCanvas = (now.y - last.y) * zoom;
  if (!dxCanvas && !dyCanvas) return;
  if (Math.abs(dxCanvas) > view.width || Math.abs(dyCanvas) > view.height) return; // a teleport, not a scroll
  const k = rainPxScale();            // canvas px per CSS px
  const dx = dxCanvas / k, dy = dyCanvas / k; // CSS px
  const sz = screenCssSize();
  const wrap = (v, size, pad) => {
    const span = size + pad * 2;
    return ((((v + pad) % span) + span) % span) - pad;
  };
  for (const f of snowFlakes) {
    f.x = wrap(f.x - dx, sz.w, f.r);
    f.y = wrap(f.y - dy, sz.h, f.r);
  }
  for (const l of leaves) {
    if (!l.live) continue;
    l.x -= dx; l.y -= dy;
    if (l.x < -30) l.x += sz.w + 60; else if (l.x > sz.w + 30) l.x -= sz.w + 60;
    if (l.y < -20) l.y += sz.h + 40; else if (l.y > sz.h + 20) l.y -= sz.h + 40;
  }
  // Rain is kept in screen fractions.
  const fx = dxCanvas / view.width, fy = dyCanvas / view.height;
  for (const d of rainDrops) {
    d.x = ((d.x - fx) % 1 + 1) % 1;
    d.y -= fy;
    d.landY -= fy;
    if (d.landY < 0.05 || d.landY > 1.05) Object.assign(d, spawnRainDrop(false, d.row)); // its landing spot scrolled away
  }
  for (const sp of splashes) { sp.x -= fx; sp.y -= fy; }
}

function updateWeatherFX(dt) {
  scrollWeatherWithCamera();
  computeSun();
  sunRayTime += dt;
  // Rain/snow motion only needs to run while that weather is actually
  // showing (getCurrentWeather(), js/calendar.js) — cheap either way at
  // this particle count, but this also keeps drops/flakes from drifting
  // out of position while their weather isn't active, so they don't pop
  // in mid-fall the moment it switches back on.
  if (rainAmount() > 0) updateRain(dt); // "Rainy" and "Thunderstorm" both (incl. while fading in/out)
  if (snowAmount() > 0) updateSnow(dt);
  updateLeaves(dt); // sunny 09:00-15:00; finishes its fall afterwards
  // (All of these keep running whether the player is indoors or out —
  // they're screen-space — so walking out of a house you step straight
  // back into weather that's been going the whole time.)
  updateLightning(dt);
  updateClouds(dt);
  updateFog(dt);
}

// Weather particles come in two rows. The BACK row is drawn before the
// depth-sorted world (characters, trees, houses), so those stand in front
// of it; the FRONT row goes over everything. Per request: some snow /
// rain / leaves pass in front of the character, some behind.
function drawWeatherBackFX() {
  if (rainAmount() > 0) drawRain(1);
  if (snowAmount() > 0) drawSnow(1);
  drawLeaves(1);
}

// The FRONT row (called late in render()), then the thunderstorm's
// lightning flash over everything.
function drawWeatherOverlayFX() {
  if (rainAmount() > 0) drawRain(0);
  if (snowAmount() > 0) drawSnow(0);
  drawLeaves(0);
  drawLightning();
}
