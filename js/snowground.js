"use strict";

/* =================================================================
   SNOW ON THE GROUND

   Per request: while the weather is Snow, the grass turns to snow —
     - the map's grass fill (the grass painted into worldCanvas, js/world.js)
       is drawn over with the Snow set's center-snow-2..5 tiles, one per
       grass tile, picked by position so the pattern doesn't repeat in rows;
     - grass TILES placed on layer 2 (the grass edge/inner tiles and the
       grass_tile set) become snow in the SAME shape: the snow texture cut
       out by the grass tile's own alpha, so their ragged edges stay;
     - mountain walls with grass at their foot swap to their snowy twins:
       bottom-wall-mountain 1-6 -> bottom-snow-wall-mountain 1-6,
       bottom-outer-wall-mountain 1-4 -> bottom-snow-outer-wall-mountain 1-4.

   All of it is drawn at render time only — nothing in the save or the
   layers changes, so the grass is simply back when the snow stops.
================================================================= */

const SNOW_GROUND_TILES = ["terrainSnowCenterSnow2", "terrainSnowCenterSnow3", "terrainSnowCenterSnow4", "terrainSnowCenterSnow5"];
// center-snow-5 is the patch's right-edge piece — part of it is
// transparent, which let the grass show through in green specks. Those
// tiles get a solid snow tile (center-snow-3) laid under them first.
const SNOW_GROUND_BASE = "terrainSnowCenterSnow3";
const SNOW_GROUND_PARTIAL = new Set(["terrainSnowCenterSnow5"]);

function isSnowGroundActive() {
  return getCurrentWeather().name === "Snow";
}

// Stable per-tile choice among the four snow tiles.
function snowVariantAt(col, row) {
  let h = (col * 73856093) ^ (row * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return SNOW_GROUND_TILES[h % SNOW_GROUND_TILES.length];
}

function isGrassGroundType(type) {
  return /^(grass|terrainGrass)/.test(type);
}

// Snow in the shape of a grass tile: snow texture, cut by the grass
// tile's alpha. Cached per (grass type, snow variant).
const snowShapedCache = new Map();
function snowShapedIcon(type, snowType) {
  const key = type + "|" + snowType;
  let cv = snowShapedCache.get(key);
  if (cv) return cv;
  const icon = itemDefs[type].icon, snow = itemDefs[snowType].icon;
  if (!icon || !icon.width || !snow || !snow.width) return null;
  cv = document.createElement("canvas");
  cv.width = icon.width;
  cv.height = icon.height;
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  const base = SNOW_GROUND_PARTIAL.has(snowType) ? itemDefs[SNOW_GROUND_BASE].icon : null;
  for (let y = 0; y < cv.height; y += TILE) {
    for (let x = 0; x < cv.width; x += TILE) {
      if (base) g.drawImage(base, x, y, TILE, TILE);
      g.drawImage(snow, x, y, TILE, TILE);
    }
  }
  g.globalCompositeOperation = "destination-in";
  g.drawImage(icon, 0, 0);
  snowShapedCache.set(key, cv);
  return cv;
}

// The grass fill under everything, as snow — only the tiles on screen.
function drawSnowGroundFill() {
  if (!isSnowGroundActive()) return;
  const size = TILE * zoom;
  const c0 = Math.max(0, Math.floor(camX / TILE)), r0 = Math.max(0, Math.floor(camY / TILE));
  const c1 = Math.min(COLS - 1, Math.ceil((camX + view.width / zoom) / TILE));
  const r1 = Math.min(ROWS - 1, Math.ceil((camY + view.height / zoom) / TILE));
  ctx.imageSmoothingEnabled = false;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!groundFill[r * COLS + c]) continue;
      const t = snowVariantAt(c, r);
      const img = itemDefs[t].icon;
      if (!img || !img.width) continue;
      // +1px overlap hides hairline seams between scaled tiles
      const x = Math.floor((c * TILE - camX) * zoom), y = Math.floor((r * TILE - camY) * zoom), s = Math.ceil(size) + 1;
      if (SNOW_GROUND_PARTIAL.has(t)) ctx.drawImage(itemDefs[SNOW_GROUND_BASE].icon, x, y, s, s);
      ctx.drawImage(img, x, y, s, s);
    }
  }
}

// Layer-2 grass tile -> the same-shaped snow image to draw instead (or null).
function snowGroundIconFor(type, col, row) {
  if (!isSnowGroundActive() || !isGrassGroundType(type)) return null;
  return snowShapedIcon(type, snowVariantAt(col, row));
}

// Mountain walls with grass at their foot -> their snowy version.
function snowSwapMountainType(type) {
  if (!isSnowGroundActive()) return type;
  let m = /^terrainMountainBottomWallMountain(\d+)$/.exec(type);
  if (m) return "terrainMountainBottomSnowWallMountain" + m[1];
  m = /^terrainMountainBottomOuterWallMountain(\d+)$/.exec(type);
  if (m) return "terrainMountainBottomSnowOuterWallMountain" + m[1];
  return type;
}
