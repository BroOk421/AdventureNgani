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
      const variant = variants[Math.floor(rnd() * variants.length)];
      worldCtx.drawImage(variant, c * TILE, r * TILE, TILE, TILE);
    }
  }
}
