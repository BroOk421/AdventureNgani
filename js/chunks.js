"use strict";

/* =================================================================
   GROUND CHUNKS — the flat ground is drawn ONCE into cached chunks.

   Per request ("gusto ko yung natural na quality ng game na sharp tapos
   kahit maraming object is di parin nag lalag"): at full resolution the
   frame cost on a phone is the number of separate drawImage calls — every
   16px ground tile (snow fill, dirt, grass edges, paths, water, mountain
   tiles, the overlay pieces) was drawn one by one, every frame: thousands
   of calls. Now that ground is painted into 16x16-tile chunk canvases at 1
   world px per art px (exactly how it's drawn anyway) and each frame only
   blits the dozen chunks on screen, nearest-neighbour — the picture is
   pixel-for-pixel the same, sharp, with a fraction of the work.

   Two stacks, so the draw order stays exactly as before:
     A  snow fill (while it snows) + layer 1 (dirt / water terrain)
        -> then, live: the auto-tiled raked soil + the farm's wet soil
     B  layer 2 (grass tiles, paths, water, port) + layer 2-over (mountain
        pieces, leaves...) -> then the water animation, as before
   Anything that isn't a plain tile-sized static picture stays live, drawn
   every frame as before: art bigger than its tile, lit windows (they fade
   with the daylight), the depth-sorted pieces (mushrooms, tall flowers,
   crates — never part of these passes anyway).
   A chunk is rebuilt when anything on its tiles changes (every layer's
   set/delete is watched), when the snow starts/stops, or on a world switch
   (layer clear) — a few per frame at most, live drawing filling in until then.
================================================================= */

const CHUNK_TILES = 16, CHUNK_PX = CHUNK_TILES * TILE;
// Each chunk canvas carries a CHUNK_PAD px border of its neighbours' pixels and is blitted from the
// inner square only. At a fractional zoom (MOBILE_ZOOM 2.7) a phone GPU samples a hair past a
// canvas's edge; without the border that sample was transparent and a 1px line of the dirt under
// the grass showed along the chunk edges ("may guhit yung grass"). Now it lands on real neighbour art.
const CHUNK_PAD = 2;
const CHUNK_BUILDS_PER_FRAME = 4;
const CHUNK_CACHE_MAX = 160;
const chunkStore = { A: new Map(), B: new Map() }; // "cx,cy" -> { canvas, ver, sig, empty }
const chunkDirtyVer = new Map(); // "cx,cy" -> number (bumped when a tile in it changes)
let chunkEpoch = 0;               // bumped on a layer clear / whole-map repaint
let chunkMuteMarks = false;
const chunkKeyOf = (cx, cy) => cx + "," + cy;
function markChunkAt(col, row) {
  if (chunkMuteMarks) return;
  const k = chunkKeyOf(Math.floor(col / CHUNK_TILES), Math.floor(row / CHUNK_TILES));
  chunkDirtyVer.set(k, (chunkDirtyVer.get(k) || 0) + 1);
}
function markChunkKey(key) {
  const comma = key.indexOf(",");
  if (comma < 0) return;
  const col = +key.slice(0, comma), row = +key.slice(comma + 1);
  // a neighbour's changes can matter (mountain backing beside stairs): mark the touching chunks too
  markChunkAt(col, row); markChunkAt(col - 1, row); markChunkAt(col + 1, row); markChunkAt(col, row - 1); markChunkAt(col, row + 1);
  // (the padded border reaches the diagonal neighbours' corners too)
  markChunkAt(col - 1, row - 1); markChunkAt(col + 1, row - 1); markChunkAt(col - 1, row + 1); markChunkAt(col + 1, row + 1);
}
for (const L of new Set([...ALL_LAYERS, dirtLayer, groundLayer, groundOverlayLayer])) {
  const set = L.set, del = L.delete, clr = L.clear;
  L.set = function (k, v) { if (typeof k === "string") markChunkKey(k); return set.apply(this, arguments); };
  L.delete = function (k) { if (typeof k === "string") markChunkKey(k); return del.apply(this, arguments); };
  L.clear = function () { chunkEpoch++; return clr.apply(this, arguments); };
}
{
  const redraw = redrawWorldTile;
  redrawWorldTile = function (col, row) { markChunkAt(col, row); return redraw.apply(this, arguments); };
  const repaint = repaintAllGroundFill;
  repaintAllGroundFill = function () { chunkEpoch++; chunkMuteMarks = true; try { return repaint.apply(this, arguments); } finally { chunkMuteMarks = false; } };
}

// A tile-sized, unchanging picture — safe to bake. (Bigger art would spill into the next chunk.)
function chunkIconFor(type, col, row, layer) {
  const def = itemDefs[type];
  if (!def || def.depthBand || def.artRoot || def.litWindow || def.fadeWithDaylight) return null;
  if (layer === groundOverlayLayer && /^decoFlower/.test(type)) return null;
  if (layer === dirtLayer && type === "dirtRake") return null;
  const t = layer === groundOverlayLayer ? snowSwapMountainType(type) : type;
  const icon = snowGroundIconFor(t, col, row) || (typeof snowTreeIcon === "function" && snowTreeIcon(t)) || (itemDefs[t] && itemDefs[t].icon);
  if (!icon || !icon.width || icon.width > TILE || icon.height > TILE) return null;
  return icon;
}
// Phones: the base ground (worldCanvas: the dirt terrain + the painted lawn)
// is baked into stack A as well, so render() doesn't have to blit it as a
// separate full-screen layer first — one less whole screen of pixels to
// paint every frame (on a phone the outdoor frame rate is limited by how
// many screens' worth of pixels get painted). Same order, same pixels.
function groundBaseInChunks() { return isMobileMode() && !/[?&]nochunks=1/.test(location.search); }
function drawWorldBaseRegion(wx, wy, ww, wh, dx, dy, dw, dh) {
  // clipped to worldCanvas (a chunk at the map's edge reaches past it)
  const x0 = Math.max(0, wx), y0 = Math.max(0, wy), x1 = Math.min(worldCanvas.width, wx + ww), y1 = Math.min(worldCanvas.height, wy + wh);
  if (x1 <= x0 || y1 <= y0) return;
  const sx = dw / ww, sy = dh / wh;
  ctx.drawImage(worldCanvas, x0, y0, x1 - x0, y1 - y0, dx + (x0 - wx) * sx, dy + (y0 - wy) * sy, (x1 - x0) * sx, (y1 - y0) * sy);
}
function chunkSig() { return (isSnowGroundActive() ? "s" : "n") + "|" + (typeof currentWorld !== "undefined" ? currentWorld : "") + "|" + chunkEpoch; }

// Draws one stack's tiles of a chunk with the CURRENT ctx/camX/camY/zoom (live or into a chunk canvas).
// Returns false if some art wasn't loaded yet (the chunk is then rebuilt later).
function drawChunkTiles(stack, cx, cy, liveOnly) {
  let complete = true;
  const c0 = cx * CHUNK_TILES, r0 = cy * CHUNK_TILES;
  const snow = stack === "A" && isSnowGroundActive();
  const ring = liveOnly ? 0 : 1; // a baked chunk also paints the neighbouring tiles into its padded border
  if (stack === "A" && groundBaseInChunks()) { // the base ground under it (a baked chunk incl. its padded border)
    const p = liveOnly ? 0 : CHUNK_PAD, wx = c0 * TILE - p, wy = r0 * TILE - p, ws = CHUNK_PX + p * 2;
    const x = (wx - camX) * zoom, y = (wy - camY) * zoom;
    drawWorldBaseRegion(wx, wy, ws, ws, liveOnly ? Math.round(x) : x, liveOnly ? Math.round(y) : y, liveOnly ? Math.round((wx + ws - camX) * zoom) - Math.round(x) : ws * zoom, liveOnly ? Math.round((wy + ws - camY) * zoom) - Math.round(y) : ws * zoom);
  }
  for (let r = r0 - ring; r < r0 + CHUNK_TILES + ring; r++) {
    for (let c = c0 - ring; c < c0 + CHUNK_TILES + ring; c++) {
      const k = c + "," + r;
      if (stack === "A") {
        if (snow && c >= 0 && r >= 0 && c < COLS && r < ROWS && groundFill[r * COLS + c]) {
          const t = snowVariantAt(c, r), img = itemDefs[t].icon;
          if (img && img.width) {
            const x = Math.floor((c * TILE - camX) * zoom), y = Math.floor((r * TILE - camY) * zoom), s = Math.ceil(TILE * zoom) + (liveOnly ? 1 : 0);
            if (SNOW_GROUND_PARTIAL.has(t)) ctx.drawImage(itemDefs[SNOW_GROUND_BASE].icon, x, y, s, s);
            ctx.drawImage(img, x, y, s, s);
          } else complete = false;
        }
        const t = dirtLayer.get(k);
        if (t && chunkIconFor(t, c, r, dirtLayer)) drawGroundItemAt(t, c, r);
      } else {
        const g = groundLayer.get(k);
        if (g) { if (chunkIconFor(g, c, r, groundLayer)) drawGroundItemAt(g, c, r); else if (itemDefs[g] && itemDefs[g].icon && !itemDefs[g].icon.width) complete = false; }
        const o = groundOverlayLayer.get(k);
        if (o && chunkIconFor(o, c, r, groundOverlayLayer)) {
          drawMountainInnerBacking(o, c, r);
          drawGroundItemAt(snowSwapMountainType(o), c, r);
        } else if (o && itemDefs[o] && itemDefs[o].icon && !itemDefs[o].icon.width) complete = false;
      }
    }
  }
  return complete;
}
function buildChunk(stack, cx, cy, entry) {
  const size = CHUNK_PX + CHUNK_PAD * 2;
  if (!entry.canvas) { entry.canvas = document.createElement("canvas"); entry.canvas.width = size; entry.canvas.height = size; }
  const g = entry.canvas.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, size, size);
  g.imageSmoothingEnabled = false;
  const saved = { ctx, camX, camY, zoom };
  ctx = g; camX = cx * CHUNK_PX - CHUNK_PAD; camY = cy * CHUNK_PX - CHUNK_PAD; zoom = 1;
  let complete;
  try { complete = drawChunkTiles(stack, cx, cy, false); }
  finally { ctx = saved.ctx; camX = saved.camX; camY = saved.camY; zoom = saved.zoom; }
  // empty chunks are remembered as such and never drawn
  entry.empty = !hasChunkContent(stack, cx, cy);
  return complete;
}
function hasChunkContent(stack, cx, cy) {
  if (stack === "A" && groundBaseInChunks()) return true; // carries the base ground
  const c0 = cx * CHUNK_TILES, r0 = cy * CHUNK_TILES;
  const snow = stack === "A" && isSnowGroundActive();
  for (let r = r0; r < r0 + CHUNK_TILES; r++) for (let c = c0; c < c0 + CHUNK_TILES; c++) {
    const k = c + "," + r;
    if (stack === "A") { if (dirtLayer.has(k) || (snow && c >= 0 && r >= 0 && c < COLS && r < ROWS && groundFill[r * COLS + c])) return true; }
    else if (groundLayer.has(k) || groundOverlayLayer.has(k)) return true;
  }
  return false;
}
let chunkBuildsLeft = 0, chunkFrameAt = -1;
function drawStackChunks(stack) {
  const now = performance.now();
  if (now !== chunkFrameAt) { chunkFrameAt = now; chunkBuildsLeft = CHUNK_BUILDS_PER_FRAME; }
  const store = chunkStore[stack], sig = chunkSig();
  const vw = view.width / zoom, vh = view.height / zoom;
  const cx0 = Math.floor(camX / CHUNK_PX), cx1 = Math.floor((camX + vw) / CHUNK_PX);
  const cy0 = Math.floor(camY / CHUNK_PX), cy1 = Math.floor((camY + vh) / CHUNK_PX);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const key = chunkKeyOf(cx, cy), ver = chunkDirtyVer.get(key) || 0;
      let e = store.get(key);
      const fresh = e && e.ver === ver && e.sig === sig;
      if (!fresh) {
        if (chunkBuildsLeft > 0) {
          chunkBuildsLeft--;
          if (!e) { e = {}; store.set(key, e); }
          const ok = buildChunk(stack, cx, cy, e);
          e.ver = ok ? ver : -1; e.sig = sig;
        } else { // not built yet this frame: draw it live
          drawChunkTiles(stack, cx, cy, true);
          continue;
        }
      } else { store.delete(key); store.set(key, e); } // most recently used
      if (e.empty) continue;
      const x = Math.round((cx * CHUNK_PX - camX) * zoom), y = Math.round((cy * CHUNK_PX - camY) * zoom);
      const x2 = Math.round(((cx + 1) * CHUNK_PX - camX) * zoom), y2 = Math.round(((cy + 1) * CHUNK_PX - camY) * zoom);
      ctx.drawImage(e.canvas, CHUNK_PAD, CHUNK_PAD, CHUNK_PX, CHUNK_PX, x, y, x2 - x, y2 - y); // inner square only
    }
  }
  ctx.restore();
  if (store.size > CHUNK_CACHE_MAX) { // drop the least recently used
    for (const k of store.keys()) { if (store.size <= CHUNK_CACHE_MAX) break; store.delete(k); }
  }
}
// what stays live in each layer (art bigger than a tile, lit windows, raked soil...)
function drawLiveLayer(layer, tag, extra) {
  const rows = layerRows(layer, tag, (type) => {
    const def = itemDefs[type];
    if (!def || def.depthBand) return false;
    if (layer === groundOverlayLayer && /^decoFlower/.test(type)) return false;
    if (def.artRoot || def.litWindow || def.fadeWithDaylight || (layer === dirtLayer && type === "dirtRake")) return true;
    const ic = def.icon;
    return !ic || !ic.width || ic.width > TILE || ic.height > TILE; // (an unloaded icon is rechecked when the layer changes)
  });
  const vw = view.width / zoom, vh = view.height / zoom;
  const r0 = Math.floor(camY / TILE) - 1, r1 = Math.ceil((camY + vh) / TILE) + 8;
  const c0 = Math.floor(camX / TILE) - 4, c1 = Math.ceil((camX + vw) / TILE) + 4;
  for (let r = r0; r <= r1; r++) {
    const a = rows.get(r);
    if (!a) continue;
    for (const [c, type] of a) if (c >= c0 && c <= c1) extra(type, c, r);
  }
}

/* ---------------- the passes, re-pointed ---------------- */
{ // phones only (per request the desktop is left exactly as it was); ?nochunks=1 turns it off to compare
  const useChunks = () => isMobileMode() && !/[?&]nochunks=1/.test(location.search);
  const base = { snow: drawSnowGroundFill, dirt: drawDirtLayer, flat: drawFlatGroundItems, over: drawGroundOverlay };
  drawSnowGroundFill = function () { if (!useChunks()) return base.snow.apply(this, arguments); drawStackChunks("A"); }; // stack A (snow fill + layer 1)
  drawDirtLayer = function () {                                     // only what layer 1 still draws live
    if (!useChunks()) return base.dirt.apply(this, arguments);
    drawLiveLayer(dirtLayer, "liveDirt", (type, col, row) => {
      if (type === "dirtRake" && typeof drawDirtRakeAuto === "function" && drawDirtRakeAuto(col, row)) return;
      drawGroundItemAt(type, col, row);
    });
  };
  drawFlatGroundItems = function () {                               // stack B, then layer 2's live pieces
    if (!useChunks()) return base.flat.apply(this, arguments);
    drawStackChunks("B");
    drawLiveLayer(groundLayer, "liveGround", (type, col, row) => drawGroundItemAt(type, col, row));
  };
  drawGroundOverlay = function () {                                 // layer 2-over's live pieces (the rest is in stack B)
    if (!useChunks()) return base.over.apply(this, arguments);
    drawLiveLayer(groundOverlayLayer, "liveOverlay", (type, col, row) => {
      drawMountainInnerBacking(type, col, row);
      drawGroundItemAt(snowSwapMountainType(type), col, row);
    });
  };
}
// art that finishes loading after a chunk was built: rebuild everything once
window.addEventListener("load", () => { chunkEpoch++; });
