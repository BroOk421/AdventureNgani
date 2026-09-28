"use strict";

/* =================================================================
   WORLD — pre-renders the ground once onto an offscreen canvas
   (worldCanvas), which camera.js later draws from every frame.

   3 separate 16x16 dirt tile variants (assets.dirt1/2/3, see assets.js)
   — used to be one combined strip sliced at runtime, now individual
   files loaded directly, so there's no slicing step here anymore.
   Instead of repeating just one of them, buildWorld() picks a random
   one for every tile on the map (seeded, so the layout is the same
   every time you reload).
================================================================= */
const worldCanvas = document.createElement("canvas");
worldCanvas.width = MAP_W;
worldCanvas.height = MAP_H;
const worldCtx = worldCanvas.getContext("2d");

function buildWorld() {
  worldCtx.imageSmoothingEnabled = false;

  const variants = [assets.dirt1, assets.dirt2, assets.dirt3];

  // simple seeded PRNG so the random tile layout is stable across reloads
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = Math.floor(rnd() * variants.length);
      worldDirtVariant[r * COLS + c] = v; // remembered so a single tile can be repainted later (redrawWorldTile())
      worldCtx.drawImage(variants[v], c * TILE, r * TILE, TILE, TILE);
    }
  }
}
const worldDirtVariant = new Uint8Array(COLS * ROWS);

/* ---------------- GROUND FILL — layer 2 all grass ----------------
   Per request ("gawin mo sa 2nd layer sa labas is puro grass... wag mo
   aalisin yung mga nakalagay, i fulfill mo lang yung ibang wala pang
   grass"): every outdoor tile whose layer 2 slot was EMPTY gets the
   Ground (Inner) grass tile. Nothing already placed is touched — a tile
   that has any layer 1 (dirt) or layer 2 (grass / water / port) item, or
   is under the art of a bigger one, is skipped.

   Why it isn't ~19,000 real entries in groundLayer: plenty of per-frame
   code walks every placed item on every layer (collision, light
   shadows, the minimap...), and every groundLayer entry is a separate
   drawImage each frame. So the fill lives in its own per-tile bitmap
   and is painted ONCE into worldCanvas, under everything — free to draw.
   It still behaves like a layer 2 tile:
     - placing a flat 16x16 layer 1/2 tile there replaces it (the fill
       bit clears, so e.g. a dirt path shows as dirt, not over grass);
     - E on a filled tile with nothing else to grab picks the grass up
       as a real Ground (Inner) item (tryGrabOrPlaceInFront(),
       inventory.js);
     - it's saved (`groundFill`, js/save.js) — the fill only runs ONCE,
       so grass you remove later stays removed. */
const GROUND_FILL_TYPE = "grassInner";
const groundFill = new Uint8Array(COLS * ROWS);
let groundFillInitialized = false;

function isGroundFilled(col, row) {
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return false;
  return groundFill[row * COLS + col] === 1;
}

function redrawWorldTile(col, row) {
  const variants = [assets.dirt1, assets.dirt2, assets.dirt3];
  worldCtx.imageSmoothingEnabled = false;
  worldCtx.drawImage(variants[worldDirtVariant[row * COLS + col]], col * TILE, row * TILE, TILE, TILE);
  if (groundFill[row * COLS + col]) {
    worldCtx.drawImage(itemDefs[GROUND_FILL_TYPE].icon, col * TILE, row * TILE, TILE, TILE);
  }
}

function setGroundFill(col, row, on) {
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return;
  const i = row * COLS + col;
  const v = on ? 1 : 0;
  if (groundFill[i] === v) return;
  groundFill[i] = v;
  redrawWorldTile(col, row);
}

function repaintAllGroundFill() {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) redrawWorldTile(c, r);
}

// Tiles already taken on layers 1/2: each item's anchor tile, plus every
// tile its art overlaps (a 3x3 door, a big port piece...).
function groundFillTakenTiles() {
  const taken = new Set();
  for (const layer of [dirtLayer, groundLayer]) {
    for (const [key, type] of layer) {
      taken.add(key);
      const def = itemDefs[type];
      const icon = def && def.icon;
      if (!icon || !icon.width) continue;
      const [col, row] = key.split(",").map(Number);
      const root = def.artRoot || { x: 0, y: 0 };
      const left = (col + 0.5) * TILE - icon.width / 2 - root.x;
      const top = (row + 1) * TILE - icon.height - root.y;
      const c0 = Math.floor(left / TILE), c1 = Math.ceil((left + icon.width) / TILE) - 1;
      const r0 = Math.floor(top / TILE), r1 = Math.ceil((top + icon.height) / TILE) - 1;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) taken.add(c + "," + r);
    }
  }
  return taken;
}

// Run once per save (see the header above). Called after loadGame().
function ensureGroundFillInitialized() {
  if (groundFillInitialized) return;
  const taken = groundFillTakenTiles();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) groundFill[r * COLS + c] = taken.has(c + "," + r) ? 0 : 1;
  }
  groundFillInitialized = true;
  repaintAllGroundFill();
  saveGame();
}

// Save format: the bitmap packed 8 tiles per byte, base64.
function encodeGroundFill() {
  const bytes = new Uint8Array(Math.ceil(groundFill.length / 8));
  for (let i = 0; i < groundFill.length; i++) if (groundFill[i]) bytes[i >> 3] |= 1 << (i & 7);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// `saved` missing (an older save, or a fresh game) -> the one-time fill
// runs from ensureGroundFillInitialized() against what's placed now.
function applyGroundFillSave(saved) {
  if (!saved || typeof saved.bits !== "string" || saved.cols !== COLS || saved.rows !== ROWS) {
    groundFill.fill(0);
    groundFillInitialized = false;
    return;
  }
  let bin;
  try { bin = atob(saved.bits); } catch (e) { groundFillInitialized = false; return; }
  for (let i = 0; i < groundFill.length; i++) {
    const b = bin.charCodeAt(i >> 3) || 0;
    groundFill[i] = (b >> (i & 7)) & 1;
  }
  groundFillInitialized = true;
  repaintAllGroundFill();
}

// A real flat 16x16 tile put down on layer 1 or 2 takes over that tile's
// fill — it REPLACES the grass, like placing onto a real layer 2 tile.
// Bigger or non-flat things filed on layer 2 (the Water Crates, the 3x3
// door) just sit on top of the grass instead.
function replacesGroundFill(type) {
  const def = itemDefs[type];
  if (!def || !def.flat || def.depthBand) return false;
  return !def.icon || !def.icon.width || (def.icon.width === TILE && def.icon.height === TILE);
}
for (const layer of [dirtLayer, groundLayer]) {
  const baseSet = layer.set;
  layer.set = function (key, type) {
    if (groundFillInitialized && replacesGroundFill(type)) {
      const [col, row] = String(key).split(",").map(Number);
      setGroundFill(col, row, false);
    }
    return baseSet.call(this, key, type);
  };
}
