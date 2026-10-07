"use strict";

/* =================================================================
   SUNLIGHT — long cast shadows + warm golden light outdoors.
   Per request (a Stardew-style reference: "ganyang itsura ng lighting ng
   labas kaya mo ba?" ... "yan pwede gawin mo sa lahat yan").

   - Every standing object (houses, trees, bushes, stones, lamp posts,
     fences, furniture outside ...) casts its OWN silhouette as a shadow on
     the ground, sheared away from the sun. The direction and length are the
     game's own sun (getShadowParams(), js/daynight.js) — the same one the
     characters' shadows already use — so everything leans the same way:
     long down-left in the morning, short at noon, long up-right toward
     evening, gone at night.
   - The shadows are drawn on the ground only: the layer goes down right
     before the depth-sorted objects and characters, so no shadow is ever
     painted over a house, a tree or a bush itself.
   - Exactly where each object is drawn is recorded while the game draws it
     (drawObjectLayerItemRaw(), with its transform — so swaying trees cast a
     swaying shadow), and used the next frame, shifted by how far the camera
     moved. Each picture's empty rows under its lowest pixel are measured
     once, so a shadow starts right at the object's foot.
   - The mask is built at a third of the screen's resolution and scaled up
     smoothly — that gives the soft edge for free and keeps it cheap.
   - Warm light: a slight warm multiply plus a soft glow from the sun's side,
     stronger in the morning / late afternoon.
   - Sunny: full; Cloudy: weaker; rain / snow / night: none.
   - The round blob shadows under trees (drawTreeGroundShadows()) are off
     while this is on (they'd double up).
   - Settings > Graphics > Sun & shadows (localStorage "agn-sun", default on).
================================================================= */
let SUNLIGHT_ON = true;
try { SUNLIGHT_ON = localStorage.getItem("agn-sun") !== "0"; } catch (e) { /* private mode */ }
const SUN_MASK_SCALE = 1 / 3;
const SUN_SHADOW_RGB = "rgb(46,34,70)";
const SUN_SHADOW_ALPHA = 0.74;

let sunRecords = [], sunPrevRecords = [], sunRecCam = null;
let sunMask = null, sunMaskCtx = null;
const sunPadCache = new Map();

function sunStrength() {
  if (!SUNLIGHT_ON || player.scene === "inside") return 0;
  const sp = getShadowParams();
  if (!sp || sp.alpha <= 0.01) return 0;
  let w = 1;
  if (typeof weatherWeight === "function") w = weatherWeight("Sunny") + 0.45 * weatherWeight("Cloudy");
  else if (typeof getCurrentWeather === "function") { const n = getCurrentWeather().name; w = n === "Sunny" ? 1 : n === "Cloudy" ? 0.45 : 0; }
  return Math.max(0, Math.min(1, sp.alpha * w));
}

// empty rows under the lowest opaque pixel of the drawn part (picture px)
function sunBottomPad(img, sy, sh) {
  const key = img;
  let per = sunPadCache.get(key);
  if (!per) { per = new Map(); sunPadCache.set(key, per); }
  const k = (sy || 0) + ":" + (sh || 0);
  if (per.has(k)) return per.get(k);
  let pad = 0;
  try {
    const w = img.width, y0 = sy || 0, hh = sh || img.height;
    const c = document.createElement("canvas"); c.width = w; c.height = hh;
    const g = c.getContext("2d"); g.drawImage(img, 0, y0, w, hh, 0, 0, w, hh);
    const d = g.getImageData(0, 0, w, hh).data;
    outer: for (let y = hh - 1; y >= 0; y--) { for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) break outer; pad++; }
    if (pad >= hh) pad = 0;
  } catch (e) { pad = 0; } // file:// pages can't read pixels — the shadow just starts at the picture's bottom
  per.set(k, pad);
  return pad;
}

// record every standing object exactly as the game draws it
{
  const base = drawObjectLayerItemRaw;
  drawObjectLayerItemRaw = function (type, col, row) {
    const d = itemDefs[type];
    if (!SUNLIGHT_ON || player.scene === "inside" || !d || d.flat || d.pebble || d.noSunShadow) return base.apply(this, arguments);
    const di = ctx.drawImage;
    let first = true;
    ctx.drawImage = function (img, ...a) {
      if (first && img && img.width) { // the object's own picture (the first drawImage of the call)
        first = false;
        const r = a.length >= 8 ? { sx: a[0], sy: a[1], sw: a[2], sh: a[3], dx: a[4], dy: a[5], dw: a[6], dh: a[7] }
          : { dx: a[0], dy: a[1], dw: a.length >= 4 ? a[2] : img.width, dh: a.length >= 4 ? a[3] : img.height };
        sunRecords.push({ img, r, m: ctx.getTransform() });
      }
      return di.apply(this, arguments);
    };
    try { return base.apply(this, arguments); } finally { ctx.drawImage = di; }
  };
}

// each frame: last frame's records become the ones to cast from
{
  const base = render;
  render = function () {
    sunPrevRecords = sunRecords; sunRecords = [];
    const prevCam = sunRecCam;
    sunRecCam = { x: camX, y: camY, z: zoom };
    render.prevCam = prevCam;
    return base.apply(this, arguments);
  };
}

function drawSunShadows() {
  const s = sunStrength();
  if (s <= 0.01 || !sunPrevRecords.length || !render.prevCam) return;
  const sp = getShadowParams(), SH = sp.skew, SQ = sp.squashY;
  const vw = view.width, vh = view.height;
  const mw = Math.max(1, Math.ceil(vw * SUN_MASK_SCALE)), mh = Math.max(1, Math.ceil(vh * SUN_MASK_SCALE));
  if (!sunMask) { sunMask = document.createElement("canvas"); sunMaskCtx = sunMask.getContext("2d"); }
  if (sunMask.width !== mw || sunMask.height !== mh) { sunMask.width = mw; sunMask.height = mh; }
  const g = sunMaskCtx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, mw, mh);
  g.imageSmoothingEnabled = false;
  // last frame's screen -> this frame's screen (the camera moved / zoomed), then down to the mask's scale
  const pc = render.prevCam, k = zoom / pc.z;
  const pre = new DOMMatrix([k, 0, 0, k, (pc.x - camX) * zoom, (pc.y - camY) * zoom]);
  const toMask = new DOMMatrix([SUN_MASK_SCALE, 0, 0, SUN_MASK_SCALE, 0, 0]).multiply(pre);
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity; // the mask's part that has shadows in it
  for (const e of sunPrevRecords) {
    const { img, r, m } = e;
    const srcH = r.sh !== undefined ? r.sh : img.height;
    const pad = sunBottomPad(img, r.sy, r.sh) * (r.dh / srcH);
    const foot = new DOMPoint(r.dx + r.dw / 2, r.dy + r.dh - pad).matrixTransform(m); // the object's foot, on screen
    // shear about the foot: x' = x + SH*(y - fy)... written as translate(foot) * [1,0,SH,-SQ] * translate(-foot) * m
    const shear = new DOMMatrix([1, 0, SH, -SQ, 0, 0]);
    const t = toMask.multiply(new DOMMatrix().translate(foot.x, foot.y)).multiply(shear).multiply(new DOMMatrix().translate(-foot.x, -foot.y)).multiply(m);
    g.setTransform(t);
    for (const [px, py] of [[r.dx, r.dy], [r.dx + r.dw, r.dy], [r.dx, r.dy + r.dh], [r.dx + r.dw, r.dy + r.dh]]) {
      const q = new DOMPoint(px, py).matrixTransform(t);
      if (q.x < bx0) bx0 = q.x; if (q.x > bx1) bx1 = q.x; if (q.y < by0) by0 = q.y; if (q.y > by1) by1 = q.y;
    }
    if (r.sw !== undefined) g.drawImage(img, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
    else g.drawImage(img, r.dx, r.dy, r.dw, r.dh);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = SUN_SHADOW_RGB;
  g.fillRect(0, 0, mw, mh);
  g.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = SUN_SHADOW_ALPHA * s;
  ctx.imageSmoothingEnabled = true;
  const x0 = Math.max(0, Math.floor(bx0) - 1), y0 = Math.max(0, Math.floor(by0) - 1);
  const x1 = Math.min(mw, Math.ceil(bx1) + 1), y1 = Math.min(mh, Math.ceil(by1) + 1);
  if (x1 > x0 && y1 > y0) ctx.drawImage(sunMask, x0, y0, x1 - x0, y1 - y0, x0 / SUN_MASK_SCALE, y0 / SUN_MASK_SCALE, (x1 - x0) / SUN_MASK_SCALE, (y1 - y0) / SUN_MASK_SCALE);
  ctx.restore();
}

// warm light: a warm cast mixed into the sky tint the game paints anyway (no extra full-screen
// fill), plus — desktop only — a soft glow from the sun's side. Stronger morning / late afternoon.
function sunWarmth() {
  const st = sunStrength();
  if (st <= 0.01) return 0;
  const t = typeof getSunProgress === "function" ? getSunProgress() : 0.5;
  const low = 1 - Math.sin(Math.max(0, Math.min(1, t)) * Math.PI); // 1 at sunrise / sunset, 0 at noon
  return st * (0.35 + 0.65 * low);
}
{
  const base = getSkyOverlayColor;
  getSkyOverlayColor = function () {
    const c = base.apply(this, arguments);
    const w = player.scene === "inside" ? 0 : sunWarmth();
    if (w <= 0.01) return c;
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return c;
    const p = m[1].split(",").map(Number);
    const a = p.length > 3 ? p[3] : 1, aw = 0.12 * w;          // the warm layer, under the sky's own tint
    const ao = a + aw * (1 - a);
    if (ao <= 0) return c;
    const mix = (ch, wc) => Math.round((ch * a + wc * aw * (1 - a)) / ao);
    return `rgba(${mix(p[0], 255)},${mix(p[1], 186)},${mix(p[2], 104)},${ao.toFixed(3)})`;
  };
}
function drawSunWarmth() {
  if (isMobileMode()) return; // phones: the warm tint only
  const w = sunWarmth();
  if (w <= 0.01) return;
  const sp = getShadowParams();
  const vw = view.width, vh = view.height;
  let dx = sp.skew, dy = -sp.squashY;
  const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  if (Math.abs(sp.skew) < 0.05) { dx = 0.4; dy = -0.9; } // noon: from above
  const diag = Math.hypot(vw, vh);
  const cx = vw / 2 + dx * diag * 0.55, cy = vh / 2 + dy * diag * 0.55;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, diag * 0.95);
  glow.addColorStop(0, `rgba(255,214,140,${(0.28 * w).toFixed(3)})`);
  glow.addColorStop(0.5, `rgba(255,190,120,${(0.09 * w).toFixed(3)})`);
  glow.addColorStop(1, "rgba(255,180,120,0)");
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, vw, vh);
  ctx.restore();
}

// hooks into the outdoor render: shadows go on the ground right before the depth-sorted objects
// (drawBirdShadows() is the call just before them), the warmth right before the sun rays
{
  const bs = drawBirdShadows;
  drawBirdShadows = function () { if (player.scene !== "inside") drawSunShadows(); return bs.apply(this, arguments); };
  const rays = drawSunRays;
  drawSunRays = function () { if (player.scene !== "inside") drawSunWarmth(); return rays.apply(this, arguments); };
  const tgs = drawTreeGroundShadows;
  drawTreeGroundShadows = function () { if (SUNLIGHT_ON) return; return tgs.apply(this, arguments); };
}

function setSunlight(on) {
  SUNLIGHT_ON = !!on;
  try { localStorage.setItem("agn-sun", SUNLIGHT_ON ? "1" : "0"); } catch (e) { /* ignore */ }
}
