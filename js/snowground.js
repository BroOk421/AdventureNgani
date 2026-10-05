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

/* =================================================================
   SNOW ON THE TREES

   Per request ("kapag nag snow ... lagyan ng snow yung mga nasa loob ng
   folder na trees tyaka yung animation rin"): while it's snowing, every
   tree* item (assets/items/trees/ — leafy trees, bare trees, stumps and
   trunks) is drawn with snow sitting on it:
     - a white cap along every upward-facing edge of the art (3px, with
       a pale blue shade under the white so it reads as a soft layer),
     - a light frost over the whole tree,
     - a few flakes stuck in the canopy.
   Built with canvas compositing only (no getImageData), so it also works
   when the game is opened straight from file:// where reading pixels is
   blocked. Cached per tree type, and swapped in at draw time — the wind
   sway, the chop shake and the felling animation (js/plantfx.js) all draw
   this same snowy image, so the snow moves with the tree.
================================================================= */
const SNOW_TREE_CAP = 3;        // px of snow on top edges
const SNOW_TREE_SHADE = "#cfe0ef";
const SNOW_TREE_FROST = 0.14;   // whitening over the whole tree
const snowTreeCache = new Map();

function isSnowTreeType(type) { return /^tree/.test(type); }

// Per request, the leafy trees and the cut stumps/trunks wear a heavier,
// hand-tuned snow (snow on top of every leaf clump, a snowed-over cut face),
// pre-made by tools/build_snow_trees.py; the bare noLeaves trees keep the
// run-time snow cap below.
const SNOW_TREE_ART = {
  treeMediumGreen: "mediumgreentree", treeThinGreen: "thintree_green", treeTinyGreen: "tinytree_green",
  treeMediumLightGreen: "mediumlightgreentree", treeBigOrange: "bigtree_orange", treeThinOrange: "thintree_orange",
  treeMediumRed: "mediumredtree", treeMediumYellow: "mediumyellowtree",
  treeBigCutStump: "bigtreecutted", treeThinCutStump: "thintreecutted", treeTinyCutStump: "tinytreecutted",
  treeMediumGreenTrunk: "mediumgreentrunk", treeMediumRedYellowTrunk: "mediumredyellowtrunk",
};
const snowTreeArt = {};
for (const [type, file] of Object.entries(SNOW_TREE_ART)) {
  snowTreeArt[type] = new Image();
  snowTreeArt[type].src = "assets/items/trees/snow/" + file + "_snow.png?v=2";
}

// Winter art next to the normal art (same name under a snow/ folder, made by
// tools/build_snow_trees.py and tools/build_snow_world.py): bushes, flower
// bushes, mushrooms, fallen leaves, flowers, lamp posts and the houses.
const SNOW_ART_SRC_RE = /^(assets\/(?:bushes|flowers|outdoor|buildings\/exterior|items\/house|items\/tile))\/((?:postlight[^/?]*|[^/?]+))\.png/;
const SNOW_ART_HAS = /^(assets\/(bushes|flowers)\/|assets\/outdoor\/postlight|assets\/buildings\/exterior\/(cottage|grocery|guard)|assets\/items\/house\/house|assets\/items\/tile\/port_)/;
const snowArtByImage = new Map();
function snowArtFor(img) {
  if (!img || !img.getAttribute) return null;
  let art = snowArtByImage.get(img);
  if (art === undefined) {
    const src = img.getAttribute("src") || "";
    const m = SNOW_ART_HAS.test(src) && src.match(SNOW_ART_SRC_RE);
    art = m ? Object.assign(new Image(), { src: m[1] + "/snow/" + m[2] + "_snow.png?v=2" }) : null;
    snowArtByImage.set(img, art);
  }
  return art && art.complete && art.naturalWidth ? art : null;
}
function snowTreeIcon(type) {
  if (!isSnowGroundActive()) return null;
  if (!isSnowTreeType(type)) { const def = itemDefs[type]; return def ? snowArtFor(def.icon) : null; }
  const art = snowTreeArt[type];
  if (art && art.complete && art.naturalWidth) return art;
  const def = itemDefs[type];
  const icon = def && def.icon;
  if (!icon || !icon.width) return null;
  let cv = snowTreeCache.get(type);
  if (cv && cv.srcW === icon.width && cv.srcH === icon.height) return cv;
  const W = icon.width, H = icon.height;
  // The art's top edges, `h` px thick, painted `color`: its silhouette minus
  // itself shifted down by h (keeps opaque pixels whose pixel h above is clear).
  const band = (h, color) => {
    const b = document.createElement("canvas");
    b.width = W; b.height = H;
    const g = b.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(icon, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "destination-out";
    g.drawImage(icon, 0, h);
    return b;
  };
  cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  cv.srcW = W; cv.srcH = H;
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.drawImage(icon, 0, 0);
  // frost + stuck flakes, kept inside the art (source-atop)
  g.globalCompositeOperation = "source-atop";
  g.globalAlpha = SNOW_TREE_FROST;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.9;
  let seed = 0;
  for (let i = 0; i < type.length; i++) seed = (seed * 31 + type.charCodeAt(i)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const flakes = Math.round((W * H) / 90);
  for (let i = 0; i < flakes; i++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H * 0.85);
    g.fillRect(x, y, 1, 1);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  g.drawImage(band(SNOW_TREE_CAP, SNOW_TREE_SHADE), 0, 0);
  g.drawImage(band(SNOW_TREE_CAP - 1, "#ffffff"), 0, 0);
  snowTreeCache.set(type, cv);
  return cv;
}

// White puffs knocked off a snowy tree (chop / felling) — js/plantfx.js.
function snowTreePuffs(list, x0, x1, y0, y1, n) {
  if (!isSnowGroundActive()) return;
  for (let i = 0; i < n; i++) {
    list.push({
      x: x0 + Math.random() * (x1 - x0), y: y0 + Math.random() * (y1 - y0),
      vx: (Math.random() - 0.5) * 18, vy: -4 - Math.random() * 8,
      t: 0, life: 0.6 + Math.random() * 0.5,
      color: Math.random() < 0.7 ? "#ffffff" : SNOW_TREE_SHADE,
    });
  }
}
