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
function weatherCloudMult() {
  const w = typeof getCurrentWeather === "function" ? getCurrentWeather() : null;
  return (w && WEATHER_CLOUD_OPACITY_MULT[w.name]) || 1;
}
function weatherSunrayMult() {
  const w = typeof getCurrentWeather === "function" ? getCurrentWeather() : null;
  return (w && WEATHER_SUNRAY_MULT[w.name]) || 1;
}

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
// Drawn entirely by code (see drawRain() below) rather than blitted from
// assets/particles/Rain.png — per request. The ground splash still uses
// its sprite (assets.rainOnFloor), untouched.
//
// "Rainy" and "Thunderstorm" share every bit of this; the storm just
// runs it harder (more drops, faster fall, longer streaks) and adds
// lightning on top — see rainIntensity() and the lightning block below.
const rainDrops = [];
const splashes = [];

function isRaining(name) {
  return name === "Rainy" || name === "Thunderstorm";
}

// Multipliers for the CURRENT weather: plain rain is 1x across the
// board, a thunderstorm scales up.
function rainIntensity() {
  if (getCurrentWeather().name === "Thunderstorm") {
    return { drops: STORM_DROP_MULT, speed: STORM_SPEED_MULT, length: STORM_LENGTH_MULT };
  }
  return { drops: 1, speed: 1, length: 1 };
}

// How many of the pooled drops are live right now. The pool is always
// allocated at the storm-sized maximum (RAIN_DROP_COUNT_MAX) and plain
// rain simply uses the first RAIN_DROP_COUNT of them, so switching
// weather never has to allocate or discard anything mid-game.
function activeRainDropCount() {
  return Math.min(rainDrops.length, Math.round(RAIN_DROP_COUNT * rainIntensity().drops));
}

function spawnRainDrop(atInit) {
  const rect = visibleWorldRect();
  const m = WEATHER_SPAWN_MARGIN;
  return {
    wx: weatherRand(camX - m, camX + rect.w + m),
    wy: atInit ? weatherRand(camY - rect.h, camY + rect.h) : camY - m - weatherRand(0, 40),
    landY: camY + rect.h * weatherRand(0.4, 0.98),
    fallSpeed: weatherRand(RAIN_FALL_SPEED_MIN, RAIN_FALL_SPEED_MAX),
    // Per-drop streak length and opacity — the variation is what keeps a
    // field of identical 1px lines from reading as a flat screen door.
    len: weatherRand(RAIN_LENGTH_MIN, RAIN_LENGTH_MAX),
    alpha: weatherRand(RAIN_ALPHA_MIN, RAIN_ALPHA_MAX),
  };
}

function updateRain(dt) {
  const rect = visibleWorldRect();
  const m = WEATHER_SPAWN_MARGIN;
  const speedMult = rainIntensity().speed;
  const active = activeRainDropCount();

  for (let i = 0; i < active; i++) {
    const d = rainDrops[i];
    d.wy += d.fallSpeed * speedMult * dt;

    if (d.wy >= d.landY) {
      splashes.push({ wx: d.wx, wy: d.landY, t: 0 });
      Object.assign(d, spawnRainDrop(false));
      continue;
    }

    const outOfBounds = d.wx < camX - m || d.wx > camX + rect.w + m || d.wy > camY + rect.h + m;
    if (outOfBounds) Object.assign(d, spawnRainDrop(false));
  }

  for (let i = splashes.length - 1; i >= 0; i--) {
    splashes[i].t += dt;
    if (splashes[i].t >= SPLASH_LIFETIME) splashes.splice(i, 1);
  }
}

function drawRain() {
  const lengthMult = rainIntensity().length;
  const active = activeRainDropCount();
  // 1px wide in WORLD units, so it scales with zoom exactly like every
  // other world-space sprite instead of staying a hairline when zoomed
  // in. fillRect (not a stroked line) keeps the edges crisp and
  // pixel-aligned, matching the game's art rather than anti-aliasing
  // into a smear.
  const w = Math.max(1, RAIN_DROP_WIDTH * zoom);

  ctx.save();
  for (let i = 0; i < active; i++) {
    const d = rainDrops[i];
    const screenX = (d.wx - camX) * zoom;
    const screenY = (d.wy - camY) * zoom;
    ctx.globalAlpha = d.alpha;
    ctx.fillStyle = "rgb(" + RAIN_COLOR_RGB + ")";
    ctx.fillRect(screenX - w / 2, screenY, w, d.len * lengthMult * zoom);
  }
  ctx.restore();

  // Ground splashes — unchanged, still the RainOnFloor.png frames.
  const splashSize = SPLASH_WORLD_SIZE * zoom;
  ctx.save();
  for (const s of splashes) {
    const screenX = (s.wx - camX) * zoom;
    const screenY = (s.wy - camY) * zoom;
    const progress = s.t / SPLASH_LIFETIME;
    const frame = Math.min(SPLASH_FRAME_COUNT - 1, Math.floor(progress * SPLASH_FRAME_COUNT));
    const sx = frame * SPLASH_FRAME_W;
    ctx.globalAlpha = 1 - progress * 0.6;
    ctx.drawImage(assets.rainOnFloor, sx, 0, SPLASH_FRAME_W, SPLASH_FRAME_H, screenX - splashSize / 2, screenY - splashSize / 2, splashSize, splashSize);
  }
  ctx.restore();
}

// --- Lightning (Thunderstorm only) -----------------------------------
// A full-screen flash on a random timer. Real lightning flickers rather
// than fading smoothly, so the alpha below is a decaying envelope cut by
// a fast strobe — one strike reads as two or three quick stabs of light,
// not a single soft pulse.
let lightningCountdown = weatherRand(LIGHTNING_GAP_MIN, LIGHTNING_GAP_MAX);
let lightningFlash = 0; // seconds of flicker left in the current strike

function updateLightning(dt) {
  if (getCurrentWeather().name !== "Thunderstorm") {
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

function spawnSnowFlake(atInit) {
  const rect = visibleWorldRect();
  const m = WEATHER_SPAWN_MARGIN;
  return {
    wx: weatherRand(camX - m, camX + rect.w + m),
    baseX: 0, // set right after spawn, once wx is known (the sway center)
    wy: atInit ? weatherRand(camY - rect.h, camY + rect.h) : camY - m - weatherRand(0, 40),
    fallSpeed: weatherRand(SNOW_FALL_SPEED_MIN, SNOW_FALL_SPEED_MAX),
    driftAmp: weatherRand(SNOW_DRIFT_AMPLITUDE_MIN, SNOW_DRIFT_AMPLITUDE_MAX),
    driftSpeed: weatherRand(SNOW_DRIFT_SPEED_MIN, SNOW_DRIFT_SPEED_MAX),
    phase: weatherRand(0, Math.PI * 2),
    t: 0,
    frame: Math.floor(weatherRand(0, SNOW_FRAME_COUNT)),
  };
}

function resetSnowFlake(flake, atInit) {
  Object.assign(flake, spawnSnowFlake(atInit));
  flake.baseX = flake.wx;
}

function updateSnow(dt) {
  const rect = visibleWorldRect();
  const m = WEATHER_SPAWN_MARGIN;

  for (const f of snowFlakes) {
    f.t += dt;
    f.wy += f.fallSpeed * dt;
    f.wx = f.baseX + Math.sin(f.t * f.driftSpeed + f.phase) * f.driftAmp;

    const outOfBounds = f.wx < camX - m || f.wx > camX + rect.w + m || f.wy > camY + rect.h + m;
    if (outOfBounds) resetSnowFlake(f, false);
  }
}

function drawSnow() {
  const size = SNOW_WORLD_SIZE * zoom;

  ctx.save();
  ctx.globalAlpha = 0.9;
  for (const f of snowFlakes) {
    const screenX = (f.wx - camX) * zoom;
    const screenY = (f.wy - camY) * zoom;
    const sx = f.frame * SNOW_FRAME_W;
    ctx.drawImage(assets.snow, sx, 0, SNOW_FRAME_W, SNOW_FRAME_H, screenX - size / 2, screenY - size / 2, size, size);
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
function drawCloudShadows(camX, camY) {
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

function spawnFog() {
  return {
    wx: weatherRand(-FOG_SRC_W * FOG_SCALE_MAX, MAP_W),
    wy: weatherRand(0, MAP_H),
    speed: weatherRand(FOG_SPEED_MIN, FOG_SPEED_MAX),
    scale: weatherRand(FOG_SCALE_MIN, FOG_SCALE_MAX),
    opacity: weatherRand(FOG_OPACITY_MIN, FOG_OPACITY_MAX),
    variant: Math.floor(weatherRand(0, fogImages.length)),
    inFront: Math.random() < 0.5,
  };
}

function updateFog(dt) {
  for (const f of fogPatches) {
    f.wx += f.speed * dt;
    const halfW = (FOG_SRC_W * f.scale) / 2;
    if (f.wx - halfW > MAP_W) {
      f.wx = -halfW;
      f.wy = weatherRand(0, MAP_H);
      f.speed = weatherRand(FOG_SPEED_MIN, FOG_SPEED_MAX);
      f.scale = weatherRand(FOG_SCALE_MIN, FOG_SCALE_MAX);
      f.opacity = weatherRand(FOG_OPACITY_MIN, FOG_OPACITY_MAX);
      f.variant = Math.floor(weatherRand(0, fogImages.length));
      f.inFront = Math.random() < 0.5;
    }
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
    ctx.globalAlpha = f.opacity;
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

function drawSunRays(camX, camY) {
  if (!SUNRAYS_ENABLED) return;
  const strength = sun.rays * SUNRAY_INTENSITY * weatherSunrayMult();
  if (strength <= 0.01) return;

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
  ctx.imageSmoothingEnabled = false;
}

// --- Setup / per-frame entry points -----------------------------------
function initWeatherFX() {
  computeSun();
  buildCloudShadowImages();
  // Pool at the STORM-sized maximum; plain rain just leaves the tail of
  // it idle (activeRainDropCount()), so switching weather never has to
  // allocate or throw away drops mid-game.
  for (let i = 0; i < RAIN_DROP_COUNT_MAX; i++) rainDrops.push(spawnRainDrop(true));
  for (let i = 0; i < SNOW_FLAKE_COUNT; i++) {
    const f = spawnSnowFlake(true);
    f.baseX = f.wx;
    snowFlakes.push(f);
  }
  for (let i = 0; i < CLOUD_COUNT; i++) clouds.push(spawnCloud());
  for (let i = 0; i < FOG_COUNT; i++) fogPatches.push(spawnFog());
  sunBeamSoft = buildSunBeamSprite(1.5);
  sunBeamStreak = buildSunBeamSprite(2.2);
  buildSunRays();
}

function updateWeatherFX(dt) {
  computeSun();
  sunRayTime += dt;
  // Rain/snow motion only needs to run while that weather is actually
  // showing (getCurrentWeather(), js/calendar.js) — cheap either way at
  // this particle count, but this also keeps drops/flakes from drifting
  // out of position while their weather isn't active, so they don't pop
  // in mid-fall the moment it switches back on.
  const weatherName = getCurrentWeather().name;
  if (isRaining(weatherName)) updateRain(dt); // "Rainy" and "Thunderstorm" both
  if (weatherName === "Snow") updateSnow(dt);
  updateLightning(dt);
  updateClouds(dt);
  updateFog(dt);
}

// Rain/snow, drawn as the topmost world-space overlay (call last in
// render()) — only one (or neither, on a Sunny or Cloudy day) actually
// renders, picked by js/calendar.js's getCurrentWeather(). The
// thunderstorm's lightning flash goes on last of all, over the rain.
function drawWeatherOverlayFX() {
  const weatherName = getCurrentWeather().name;
  if (isRaining(weatherName)) drawRain();
  else if (weatherName === "Snow") drawSnow();
  drawLightning();
}
