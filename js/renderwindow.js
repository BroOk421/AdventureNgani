"use strict";

/* =================================================================
   RENDER WINDOW (phones) — only draw what's near the character.

   Per request ("kaya ba na yung ibang wala sa screen or di natamaan is di
   mag render ... try 16x16 na tiles lang na render center jan yung
   character tyaka lilitaw agad agad yung mga objects ... kapag lumalayo is
   nawawala yung ibang objects"):

   A square MOBILE_RENDER_TILES tiles across (js/config.js, 16), centred on
   the character's feet, is the "render window". Outdoors on a phone,
   anything whose picture doesn't reach into that square is simply not
   drawn — and its work (shadow, candle light, relight) is skipped too:
     - placed objects: trees, rocks, houses, fences, bushes, lamps, crates,
       wild grass, tall flowers, bridges (through itemOffscreen() and the
       row/column ranges in renderWorldObjectsSorted(), js/camera.js);
     - the lamps' light pools and the lit lanterns (lampEntries());
     - tree ground shadows;
     - people and animals: townsfolk, customers, Maria, farm animals, the
       Greenwood's wild animals, mobs and their drops, crops, crystals and
       chests, butterflies and fireflies;
     - night relights of anyone outside it.
   They come back the moment they're inside it again — nothing is removed
   from the world, nothing stops living (people keep walking, crops keep
   growing); they're just not painted while they're far.

   The ground (grass, dirt, paths, water, snow) still covers the whole
   screen: it's drawn in big pre-baked 16x16-tile chunks (js/chunks.js),
   one picture per chunk, so it costs almost nothing and the screen edges
   never go black. Weather, clouds and birds are screen-wide as before.

   Indoors (rooms are small) and on the desktop nothing changes.
   Settings > View on the phone turns it on/off (js/mobile.js).
================================================================= */

let renderWin = null; // { x0, y0, x1, y1 } in world px, or null = no limit (this frame)

function renderWindowOn() {
  return isMobileMode() && typeof MOBILE_RENDER_TILES !== "undefined" && MOBILE_RENDER_TILES > 0 &&
    player.scene === "outside";
}
function updateRenderWindow() {
  if (!renderWindowOn()) { renderWin = null; return; }
  const half = (MOBILE_RENDER_TILES * TILE) / 2;
  const cx = player.x, cy = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE; // the feet
  renderWin = { x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half };
}
// a world-px rectangle against the window (true when there's no window)
function rectInRenderWindow(x0, y0, x1, y1) {
  const w = renderWin;
  return !w || (x1 >= w.x0 && x0 <= w.x1 && y1 >= w.y0 && y0 <= w.y1);
}
// a character / animal standing with its feet at (x, feetY), `size` world px tall
function feetInRenderWindow(x, feetY, size) {
  const s = size || DRAW_SIZE;
  return rectInRenderWindow(x - s / 2, feetY - s, x + s / 2, feetY + 4);
}
// the window as tile rows / columns, for the row-bucket loops (null = none)
function renderWindowTiles() {
  const w = renderWin;
  if (!w) return null;
  return { c0: Math.floor(w.x0 / TILE), c1: Math.floor(w.x1 / TILE), r0: Math.floor(w.y0 / TILE), r1: Math.floor(w.y1 / TILE) };
}

// worked out once at the start of every frame
{
  const base = render;
  render = function () {
    updateRenderWindow();
    return base.apply(this, arguments);
  };
}

/* ---------- placed objects, mobs, drops (js/culling.js's rectInView) ---------- */
{
  const base = rectInView;
  rectInView = function (x0, y0, x1, y1) {
    return base.apply(this, arguments) && rectInRenderWindow(x0, y0, x1, y1);
  };
}

/* ---------- people and animals ---------- */
{
  const base = drawCitizen;
  drawCitizen = function (c) {
    if (renderWin) { const f = citizenDrawFeet(c); if (!feetInRenderWindow(f.x, f.y)) return; }
    return base.apply(this, arguments);
  };
}
{
  const base = drawCustomer;
  drawCustomer = function (c) {
    if (renderWin && !feetInRenderWindow(c.fx, c.fy)) return;
    return base.apply(this, arguments);
  };
}
{
  const base = drawAnimal; // farm animals, and the Greenwood's wild ones (drawWildAnimal() calls this)
  drawAnimal = function (a) {
    if (renderWin && !feetInRenderWindow(a.fx, a.fy, 40)) return;
    return base.apply(this, arguments);
  };
}
if (typeof drawWildAnimal === "function") {
  const base = drawWildAnimal; // (its health bar / hit flash too)
  drawWildAnimal = function (a) {
    if (renderWin && !feetInRenderWindow(a.fx, a.fy, 40)) return;
    return base.apply(this, arguments);
  };
}
{
  const base = drawNPC; // Maria outdoors (screen px in, world px out)
  drawNPC = function (px, py, scale) {
    if (renderWin && player.scene === "outside" && !feetInRenderWindow(camX + px / zoom, camY + py / zoom + (SPRITE_FEET_FRACTION - 0.5) * NPC_DRAW_SIZE)) return;
    return base.apply(this, arguments);
  };
}
// night relights (the colours painted back on after dark) — screen px in
{
  const base = drawMaskedRelight;
  drawMaskedRelight = function (drawFn, px, py, size) {
    if (renderWin) {
      const wx = camX + px / zoom, wy = camY + py / zoom, h = size / zoom / 2;
      if (!rectInRenderWindow(wx - h, wy - h, wx + h, wy + h)) return;
    }
    return base.apply(this, arguments);
  };
}

/* ---------- crops, crystals, chests ---------- */
if (typeof drawCrop === "function") {
  const base = drawCrop;
  drawCrop = function (key) {
    if (renderWin) { const [c, r] = fpos(key); if (!rectInRenderWindow(c * TILE, (r - 1) * TILE, (c + 1) * TILE, (r + 1) * TILE)) return; }
    return base.apply(this, arguments);
  };
}
if (typeof drawCrystal === "function") {
  const base = drawCrystal;
  drawCrystal = function (o) { if (renderWin && !feetInRenderWindow(o.x, o.y, 32)) return; return base.apply(this, arguments); };
}
if (typeof drawChest === "function") {
  const base = drawChest;
  drawChest = function (h) { if (renderWin && !feetInRenderWindow(h.x, h.y, 24)) return; return base.apply(this, arguments); };
}

/* ---------- butterflies and fireflies ---------- */
function withCrittersInWindow(fn) {
  return function () {
    if (!renderWin || typeof critters === "undefined") return fn.apply(this, arguments);
    const bf = critters.butterflies, ff = critters.fireflies;
    critters.butterflies = bf.filter((b) => rectInRenderWindow(b.x - 4, b.y - 30, b.x + 4, b.y + 4));
    critters.fireflies = ff.filter((f) => rectInRenderWindow(f.x - 4, f.y - 30, f.x + 4, f.y + 4));
    try { return fn.apply(this, arguments); } finally { critters.butterflies = bf; critters.fireflies = ff; }
  };
}
if (typeof drawButterflies === "function") drawButterflies = withCrittersInWindow(drawButterflies);
if (typeof drawFireflies === "function") drawFireflies = withCrittersInWindow(drawFireflies);
if (typeof fireflyLights === "function") fireflyLights = withCrittersInWindow(fireflyLights);
