"use strict";

/* =================================================================
   CAMERA / RENDERER — owns the visible <canvas>, keeps it sized to
   the full window at native device resolution (fixes blur/blockiness
   on high-DPI screens), and draws the world + player each frame at
   the current zoom level.

   The character is drawn with the SAME crisp, no-smoothing settings
   as the ground tiles (imageSmoothingEnabled = false everywhere).
   Turning smoothing on for the sprite made it look soft/blurry
   instead of sharp, since it's a low-res pixel-art source being
   scaled up a lot — nearest-neighbor keeps every pixel edge crisp,
   which is the correct look for this kind of pixel art.
================================================================= */
const view = document.getElementById("view");
const ctx = view.getContext("2d");
ctx.imageSmoothingEnabled = false;

// Current camera top-left corner in world px — updated every render() call.
// Exposed at module scope (not local to render()) so inventory.js can
// convert a canvas click into world/tile coordinates for item placement.
let camX = 0;
let camY = 0;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  // Render at full device-pixel resolution so nothing gets upscaled/blurred
  // by the browser, then keep the CSS size at the window size.
  view.width = Math.round(window.innerWidth * dpr);
  view.height = Math.round(window.innerHeight * dpr);
  view.style.width = window.innerWidth + "px";
  view.style.height = window.innerHeight + "px";
  ctx.imageSmoothingEnabled = false; // resizing resets this on some browsers
}
window.addEventListener("resize", resizeCanvas);

// scratch canvas reused every frame to build a silhouette out of the
// currently-playing sprite frame (so the shadow has an actual head,
// arms, body and legs — not a plain blob — and automatically follows
// whatever pose idle/walk/run is currently on)
const silhouetteCanvas = document.createElement("canvas");
silhouetteCanvas.width = FRAME_SIZE;
silhouetteCanvas.height = FRAME_SIZE;
const silhouetteCtx = silhouetteCanvas.getContext("2d");
silhouetteCtx.imageSmoothingEnabled = false;

function buildSilhouette(sheet, sx, alpha) {
  silhouetteCtx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  silhouetteCtx.drawImage(
    sheet,
    sx,
    0,
    FRAME_SIZE,
    FRAME_SIZE,
    0,
    0,
    FRAME_SIZE,
    FRAME_SIZE,
  );
  // tint every opaque pixel of the sprite a soft dark tone, keep its alpha shape.
  // Base tint is rgba(35,25,20,0.32); `alpha` (0-1, from the day/night cycle)
  // scales that down so the shadow fades in/out at sunrise/sunset instead of
  // popping on/off.
  silhouetteCtx.globalCompositeOperation = "source-in";
  silhouetteCtx.fillStyle = `rgba(35,25,20,${(0.32 * alpha).toFixed(3)})`;
  silhouetteCtx.fillRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  silhouetteCtx.globalCompositeOperation = "source-over";
  return silhouetteCanvas;
}

function drawShadow(px, feetY, size, sheet, sx) {
  // Shape/visibility driven by the in-game clock (js/daynight.js): invisible
  // at night, fading in through sunrise, rotating from a long shadow
  // pointing down-LEFT at sunrise, through a short compact one at noon, to
  // a long shadow pointing up-RIGHT at sunset — the far tip sweeps as a
  // whole (not just leaning left/right while always extending downward,
  // which is what this looked like before) — then fading out through dusk.
  const { alpha, skew, squashY } = getShadowParams();
  if (alpha <= 0.01) return; // fully night — nothing to draw

  const silhouette = buildSilhouette(sheet, sx, alpha);

  ctx.save();
  ctx.translate(px, feetY);
  // Negative Y scale flips the silhouette upside-down. Because the image is
  // drawn with its bottom edge (the feet) exactly at local y = 0 (dy = -size),
  // that edge stays pinned at the pivot no matter the scale/skew — only the
  // head/body end (top of the source) swings away from it. That's what
  // keeps the shadow's feet glued to the character's feet.
  ctx.transform(1, 0, skew, -squashY, 0, 0);
  // This mirror is ONLY for the silhouette's pose (so a left-facing character
  // casts a shadow with left-facing arms/legs, using the same right-facing
  // side sheet flipped) — it does not affect which side the shadow leans
  // toward, since `skew` above comes from the sun's position, not facing.
  if (player.facing === "left") ctx.scale(-1, 1);
  ctx.filter = "blur(3px)"; // soften the shadow edges
  ctx.drawImage(silhouette, -size / 2, -size, size, size);
  ctx.filter = "none";
  ctx.restore();
}

function drawHeldItemAboveHead(px, py, size, scale) {
  // Shows whichever is active — the inventory-based hold-to-place item,
  // or the E-key grabbed world object (js/inventory.js's
  // tryGrabOrPlaceInFront()) — never both at once in practice, since
  // holding one doesn't stop you from starting the other, but this just
  // reads whichever exists, favoring `heldItem` if somehow both were set.
  const type = heldItem ? heldItem.type : player.grabbedType;
  if (!type) return;
  const icon = itemDefs[type].icon;
  const iconSize = 14 * scale;  // world px, scales with zoom like everything else
  // `px`/`py`/`size` here are already SCREEN pixels (drawPlayer is called
  // with world coords pre-multiplied by zoom) — so this gap is a flat
  // on-screen 5px, not a world-space offset that would get multiplied by
  // zoom again.
  const gapAboveHead = 5;
  // The sprite's actual head does NOT start at the top of its bounding box
  // (py - size/2) — there's transparent padding baked into the art above
  // it, same story as the feet (see SPRITE_FEET_FRACTION). Anchor to the
  // real head position instead, or the icon floats way too high.
  const headY = py - size / 2 + size * SPRITE_HEAD_FRACTION;
  ctx.drawImage(icon, px - iconSize / 2, headY - iconSize - gapAboveHead, iconSize, iconSize);
}

function drawPlayer(px, py, scale) {
  // while the collect action plays, use its sheet; otherwise the normal
  // idle/walk/run (or carry* equivalent) sheet.
  //
  // Carry visuals turn on whenever the character is actually carrying
  // something the player can see: either `player.mode === "carrying"` (the
  // E collect/put-down demo toggle) OR `heldItem` is set (an item picked up
  // from the hotbar/inventory for placement, see js/inventory.js). Without
  // this OR, holding an item to place never switched idle/walk/run to the
  // Carry_* sheets — only the separate E-toggle did.
  const animKey = player.action || player.anim; // any active one-shot action (collect/crush/slice/...) overrides idle/walk/run
  const carryVisual = player.mode === "carrying" || !!heldItem;
  const sheet = spriteForFacing(animKey, player.facing, carryVisual ? "carrying" : "normal");
  const sx = player.frame * FRAME_SIZE;
  const size = DRAW_SIZE * scale;
  // Anchor the shadow at the real feet-pixel position within the sprite
  // frame (measured — see SPRITE_FEET_FRACTION in config.js), not a guess.
  // The character itself is drawn centered on py (top = py - size/2), so
  // the feet row lands at py - size/2 + size * SPRITE_FEET_FRACTION.
  const feetY = py - size / 2 + size * SPRITE_FEET_FRACTION;
  const shadowX = px + SHADOW_OFFSET_X * scale; // left/right nudge, scaled with zoom

  drawShadow(shadowX, feetY, size, sheet, sx);

  ctx.save();
  if (player.facing === "left") {
    ctx.translate(px, py);
    ctx.scale(-1, 1);
    ctx.drawImage(
      sheet,
      sx,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
      -size / 2,
      -size / 2,
      size,
      size,
    );
  } else {
    ctx.drawImage(
      sheet,
      sx,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
      px - size / 2,
      py - size / 2,
      size,
      size,
    );
  }
  ctx.restore();

  // What you're holding shows above your head, so it's visible in-world
  // (not just in the HUD) — mirrors js/inventory.js's `heldItem`.
  drawHeldItemAboveHead(px, py, size, scale);
  // The equipped weapon is NOT shown in-world anymore (per request) — see
  // player.equippedWeapon, still tracked and used for F's attack
  // animation and shown in the Equipment screen (G key) and the
  // top-left HUD, just not drawn on the character itself.
}

// Draws the NPC shopkeeper (js/npc.js) — a simpler version of
// drawPlayer() above: just a 4-frame idle loop, no action states, no
// carry mode, no held item. `npc.facing` picks between two separate
// PRE-FLIPPED sheets (npcIdleRight/npcIdleLeft) instead of the
// ctx.scale(-1,1) runtime mirror drawPlayer() uses, so no transform
// juggling is needed here — just pick the sheet and draw it straight.
// Takes the same (screen-space px, py, scale) calling convention as
// drawPlayer() for consistency, called from renderWorldObjectsSorted()
// so the NPC properly occludes/is occluded by the player based on
// relative position, same as any other object in the world.
function drawNPC(px, py, scale) {
  // Picks idle vs walk based on npc.isWalking (set once per frame in
  // updateNPC(), js/npc.js, from the in-game clock — not recomputed
  // here), then facing within that pair.
  const rightSheet = npc.isWalking ? assets.npcWalkRight : assets.npcIdleRight;
  const leftSheet = npc.isWalking ? assets.npcWalkLeft : assets.npcIdleLeft;
  const sheet = npc.facing === "left" ? leftSheet : rightSheet;
  const sx = npc.frame * FRAME_SIZE;
  const size = NPC_DRAW_SIZE * scale;
  const feetY = py - size / 2 + size * SPRITE_FEET_FRACTION;

  drawShadow(px, feetY, size, sheet, sx);

  ctx.drawImage(
    sheet,
    sx,
    0,
    FRAME_SIZE,
    FRAME_SIZE,
    px - size / 2,
    py - size / 2,
    size,
    size,
  );
}

function drawGroundItemAt(type, col, row) {
  const icon = itemDefs[type].icon;
  // Draw at native pixel size (1 source px = 1 world px, same convention
  // as every other tile-sheet asset in this project), bottom-center
  // anchored to the tile's bottom-center — like an object standing on
  // that tile, not squashed to fill it. For a 16x16 icon (the original
  // grass tileset) this works out to exactly the same box as before;
  // it's only larger art (stones, trees, the house) that draws at its
  // real size instead of being stretched into one tile.
  const w = icon.width * zoom;
  const h = icon.height * zoom;
  const tileCenterX = (col + 0.5) * TILE;
  const tileBottomY = (row + 1) * TILE;
  const screenX = (tileCenterX - camX) * zoom - w / 2;
  const screenY = (tileBottomY - camY) * zoom - h;
  ctx.drawImage(icon, screenX, screenY, w, h);
}

// Whether drawing an object at world-space bounds
// (objMinX/objMaxX/objMinY/objMaxY) should fade, because the player is
// BOTH currently drawn behind it (playerSortY < objSortY — see the
// Y-sort in renderWorldObjectsSorted()) AND visually overlapping its
// sprite on screen — i.e. the object would otherwise fully hide the
// character standing "inside" it. The player's own bounds use their
// actual visible extent (head-top to feet, SPRITE_HEAD_FRACTION/
// SPRITE_FEET_FRACTION of DRAW_SIZE — the sprite frame has transparent
// padding above/below that, so the full DRAW_SIZE box would over-trigger
// this) and a narrower width than the full frame for the same reason.
const OBJECT_FADE_PLAYER_HALF_WIDTH = DRAW_SIZE * 0.35;

function isPlayerBehindAndOverlapping(objMinX, objMaxX, objMinY, objMaxY, objSortY) {
  const playerSortY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  if (playerSortY >= objSortY) return false; // player already draws in FRONT — nothing to fade

  const playerTop = player.y - DRAW_SIZE / 2 + DRAW_SIZE * SPRITE_HEAD_FRACTION;
  const playerBottom = player.y - DRAW_SIZE / 2 + DRAW_SIZE * SPRITE_FEET_FRACTION;
  const playerMinX = player.x - OBJECT_FADE_PLAYER_HALF_WIDTH;
  const playerMaxX = player.x + OBJECT_FADE_PLAYER_HALF_WIDTH;

  return playerMaxX > objMinX && playerMinX < objMaxX && playerBottom > objMinY && playerTop < objMaxY;
}

// Draws one objectLayer item (a tree, a stone, the house) for the
// Y-sorted pass (renderWorldObjectsSorted(), below) — same bottom-center
// anchoring as drawGroundItemAt(), but with a fade applied
// (OBJECT_FADE_ALPHA) when the player is currently standing behind it in
// a way that would otherwise hide them completely, per request ("kapag
// dumaan sa likod... dapat nag-oopacity yung trees, stone, house...
// para makita yung character").
const OBJECT_FADE_ALPHA = 0.45;

function drawObjectLayerItem(type, col, row) {
  const icon = itemDefs[type].icon;
  const w = icon.width * zoom;
  const h = icon.height * zoom;
  const tileCenterX = (col + 0.5) * TILE;
  const tileBottomY = (row + 1) * TILE;

  const objMinX = tileCenterX - icon.width / 2;
  const objMaxX = tileCenterX + icon.width / 2;
  const objMinY = tileBottomY - icon.height;
  const objMaxY = tileBottomY;

  const shouldFade = isPlayerBehindAndOverlapping(objMinX, objMaxX, objMinY, objMaxY, tileBottomY);

  const screenX = (tileCenterX - camX) * zoom - w / 2;
  const screenY = (tileBottomY - camY) * zoom - h;

  if (shouldFade) ctx.globalAlpha = OBJECT_FADE_ALPHA;
  ctx.drawImage(icon, screenX, screenY, w, h);
  if (shouldFade) ctx.globalAlpha = 1;
}

// Base terrain (Dirt, Water — `layer: "terrain"` in itemDefs,
// inventory.js) lives in `terrainLayer` and draws FIRST, beneath even
// `groundLayer`'s ground tileset/Port tiles — the bottom of the whole
// stack. Same flat/no-Y-sort treatment as drawFlatGroundItems() below,
// just its own separate map so placing Dirt/Water never erases a Ground/
// Port tile on the same spot (see layerForType() in inventory.js).
function drawTerrainLayer() {
  terrainLayer.forEach((type, key) => {
    const [col, row] = key.split(",").map(Number);
    drawGroundItemAt(type, col, row);
  });
}

// Flat ground decals (the ground tileset, plus small flat decorative
// stones — XXS Stone, Pebbles — see `flat` in itemDefs, inventory.js)
// live entirely in `groundLayer` and are pure terrain: always drawn
// beneath everything, never part of the Y-sort below, and never in the
// same map as decorLayer (wild grass/flowers) or objectLayer
// (stones/trees/the house) — see layerForType() in inventory.js.
function drawFlatGroundItems() {
  groundLayer.forEach((type, key) => {
    const [col, row] = key.split(",").map(Number);
    drawGroundItemAt(type, col, row);
  });
}

// Draws a decor-layer tile (wild grass/flower) as ONE whole sprite. Still
// bent by its current sway angle (wildgrassSway, js/wildgrass.js). Used
// for every decor tile on the map — including the one the player is
// standing on (see drawPlayerStandingDecor() below), which per request
// never gets any part of the plant drawn in front of the character at
// all, no matter how tall the art is; earlier versions of this tried a
// front/back split (some part of a tall plant staying in front, since it
// visually pokes up above the character) but that still read as "still
// overlapping" per feedback — simplest and clearest is what's here now:
// the character is always fully visible while standing on any wild
// grass/flower, full stop.
function drawWildgrassWhole(type, col, row) {
  const icon = itemDefs[type].icon;
  const w = icon.width * zoom;
  const h = icon.height * zoom;

  const sway = wildgrassSway.get(tileKey(col, row));
  const angle = sway ? sway.angle : 0; // -1..1ish, see wildgrass.js
  // NOTE: skew is negated relative to `angle` — with this shear matrix,
  // a POSITIVE c term shifts a point with NEGATIVE local y (the top of
  // the blade, above the root) to a SMALLER x (left). Since `angle`'s
  // sign convention is "negative = leaning left" (set in wildgrass.js
  // from player.facing === "left"), the skew fed into the transform has
  // to be the negative of that to actually lean left when angle is
  // negative.
  const skew = -angle * (WILDGRASS_MAX_SKEW_PX * zoom) / h;

  const tileCenterX = (col + 0.5) * TILE;
  const tileBottomY = (row + 1) * TILE; // the blade's root sits on the tile's bottom edge
  const pivotX = (tileCenterX - camX) * zoom;
  const pivotY = (tileBottomY - camY) * zoom;

  ctx.save();
  ctx.translate(pivotX, pivotY);
  // Shear around the root (local origin) — same bend-from-the-base idea
  // as the character's shadow (camera.js's drawShadow()), so the tip
  // leans while the root stays planted.
  ctx.transform(1, 0, skew, 1, 0, 0);
  ctx.drawImage(icon, -w / 2, -h, w, h);
  ctx.restore();
}

// Draws whichever decor tile the player is CURRENTLY standing on, if
// any — a no-op otherwise. Called once per frame, always drawn BEHIND
// the player (before the depth-sorted world pass) — per request, no
// part of any wild grass/flower ever renders in front of the character
// while they're standing on it, full stop. Every other placed wild
// grass/flower on the map draws as this same whole sprite inside the
// regular Y-sort (renderWorldObjectsSorted()), so it doesn't wrongly
// render in front of the player just because they're standing somewhere
// nearby but not actually on that tile.
function drawPlayerStandingDecor() {
  const p = getPlayerTile();
  const type = getLayerItemId(decorLayer, p.col, p.row);
  if (!type) return;
  drawWildgrassWhole(type, p.col, p.row);
}

// Draws the "floating pickup" popups (spawnFloatingPickups(),
// resources.js) — icons that toss out, bounce twice, rest, then fly into
// the player. Purely cosmetic, drawn on top of everything else in the
// world (after the depth-sorted pass) since they're meant to read as a
// flourish, not an object in the scene.
//
// `p.z` (world px, purely visual "height above the ground") is drawn as
// an upward screen-space offset — same convention drawHeldItemAboveHead()
// uses for its fixed gap, just continuously animated here via the
// throw/bounce physics in updateFloatingPickups().
function drawFloatingPickups() {
  if (floatingPickups.length === 0) return;
  const now = Date.now();
  floatingPickups.forEach((p) => {
    if (now < p.startAt) return; // staggered — hasn't been tossed yet

    const icon = itemDefs[p.type].icon;
    // Shrinks toward the end of the vacuum flight, for the "sucked in"
    // look — full size through the throw/rest phases.
    let scale = 1;
    if (p.phase === "vacuum") {
      const t = Math.min(1, (now - p.vacuumStart) / FLOATING_PICKUP_VACUUM_MS);
      scale = 1 - 0.8 * t;
    }
    const size = 12 * zoom * scale; // fixed small "popup" base size, regardless of the icon's real dimensions — keeps every drop type reading the same as a pickup bubble

    const screenX = (p.x - camX) * zoom - size / 2;
    const screenY = (p.y - p.z - camY) * zoom - size / 2; // lifted up by z
    ctx.drawImage(icon, screenX, screenY, size, size);
  });
}

// Draws a thrown item's two phases (spawnThrowToss(), resources.js) —
// the item was already cleared from the player's hand when the throw
// happened (tryThrowGrabbedItem(), inventory.js) and never written into
// any layer at all, so this whole thing is purely decorative from start
// to finish: first a simple parabola arc from the player's position to
// where it lands (drawn at full size, not the shrinking-dot look the
// vacuum phase of a floating pickup uses — this is landing, not being
// collected), then — once landed — a flat on/off blink in place for 3
// cycles before the entry gets cleared (updateThrownTosses()) and
// nothing more is drawn.
function drawThrownTosses() {
  if (thrownTosses.length === 0) return;
  const now = Date.now();
  thrownTosses.forEach((t) => {
    const elapsed = now - t.startAt;
    const icon = itemDefs[t.type].icon;
    const w = icon.width * zoom;
    const h = icon.height * zoom;

    if (elapsed < THROW_TOSS_DURATION_MS) {
      // Phase 1: arcing through the air toward the landing tile.
      const p = elapsed / THROW_TOSS_DURATION_MS;
      const x = t.fromX + (t.toX - t.fromX) * p;
      const y = t.fromY + (t.toY - t.fromY) * p;
      const z = THROW_TOSS_ARC_HEIGHT * 4 * p * (1 - p); // simple parabola, peaks at p=0.5
      const screenX = (x - camX) * zoom - w / 2;
      const screenY = (y - z - camY) * zoom - h;
      ctx.drawImage(icon, screenX, screenY, w, h);
    } else {
      // Phase 2: landed — blink in place 3 times, then gone (per
      // request: "mag blink lang kapag nabato na sa ground").
      const blinkElapsed = elapsed - THROW_TOSS_DURATION_MS;
      const cyclePos = blinkElapsed % (THROW_BLINK_HALF_MS * 2);
      if (cyclePos >= THROW_BLINK_HALF_MS) return; // OFF half of this blink cycle — draw nothing
      const screenX = (t.toX - camX) * zoom - w / 2;
      const screenY = (t.toY - camY) * zoom - h;
      ctx.drawImage(icon, screenX, screenY, w, h);
    }
  });
}

// Depth-sorts every object-layer item (stones, trees, the house) — PLUS
// every decor-layer tile (wild grass/flowers) the player ISN'T currently
// standing on, drawn whole via drawWildgrassWhole() — with the player by
// world Y (the standard top-down "Y-sort" technique), so walking behind
// a tall object actually occludes the character instead of the player
// always drawing on top of everything regardless of position. objectLayer
// items go through drawObjectLayerItem() (above) rather than the plain
// drawGroundItemAt() everything else here uses, so one that fully hides
// the player behind it fades out instead (per request — "makita yung
// character kapag dumaan sa likod").
// `groundLayer` items never enter this pass at all — see
// drawFlatGroundItems() above. The ONE decor tile the player IS standing
// on is deliberately excluded here — it gets the special front/back
// split treatment instead (drawPlayerStandingDecor(), called separately
// from render(), before and after this function).
//
// Each drawable's sort key is its "base"/contact-with-ground Y in world
// px: an object's is the bottom edge of the tile it's on (matches its
// draw anchor in drawGroundItemAt() above); the player's is their feet
// position (same SPRITE_FEET_FRACTION math used everywhere else — see
// getPlayerTile() in inventory.js). Smaller Y (further "up"/away) draws
// first; larger Y (further "down"/toward the viewer) draws after, on top.
function renderWorldObjectsSorted() {
  const drawables = [];

  objectLayer.forEach((type, key) => {
    const [col, row] = key.split(",").map(Number);
    drawables.push({ sortY: (row + 1) * TILE, draw: () => drawObjectLayerItem(type, col, row) });
  });

  const playerTile = getPlayerTile();
  const playerDecorKey = tileKey(playerTile.col, playerTile.row);
  decorLayer.forEach((type, key) => {
    if (key === playerDecorKey) return; // handled specially — see drawPlayerStandingDecor()
    const [col, row] = key.split(",").map(Number);
    drawables.push({ sortY: (row + 1) * TILE, draw: () => drawWildgrassWhole(type, col, row) });
  });

  const playerFeetWorldY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  drawables.push({
    sortY: playerFeetWorldY,
    draw: () => drawPlayer((player.x - camX) * zoom, (player.y - camY) * zoom, zoom),
  });

  // The NPC shopkeeper (js/npc.js) — same Y-sort treatment as the player,
  // so walking above/below it occludes correctly instead of it always
  // drawing on top or underneath regardless of position.
  const npcFeetWorldY = npc.y + (SPRITE_FEET_FRACTION - 0.5) * NPC_DRAW_SIZE;
  drawables.push({
    sortY: npcFeetWorldY,
    draw: () => drawNPC((npc.x - camX) * zoom, (npc.y - camY) * zoom, zoom),
  });

  drawables.sort((a, b) => a.sortY - b.sortY);
  drawables.forEach((d) => d.draw());
}

function drawPlacementRange(camX, camY) {
  // Shows the placement highlight for EITHER hold mechanism — the
  // inventory-based `heldItem`, or the E-key `player.grabbedType`
  // (js/inventory.js's tryGrabOrPlaceInFront()) — per request ("kapag
  // e-hold, dapat kita pa rin yung tile"). Only one is ever active at a
  // time in practice, so `heldItem` wins if somehow both were set.
  const holdingType = heldItem ? heldItem.type : player.grabbedType;
  if (!holdingType) return;

  const p = getPlayerTile();
  const size = TILE * zoom;
  const layer = layerForType(holdingType); // highlight reflects the layer THIS item would land on

  for (let row = p.row - PLACEMENT_RANGE; row <= p.row + PLACEMENT_RANGE; row++) {
    for (let col = p.col - PLACEMENT_RANGE; col <= p.col + PLACEMENT_RANGE; col++) {
      const outOfBounds = col < 0 || row < 0 || col >= COLS || row >= ROWS;
      if (outOfBounds) continue; // nothing to highlight past the edge of the map

      const screenX = Math.round((col * TILE - camX) * zoom);
      const screenY = Math.round((row * TILE - camY) * zoom);
      const existingId = getLayerItemId(layer, col, row);

      // Blocked if the tile's already occupied on this layer (the real
      // "occupied blocks placement" rule, placeHeldItemAt()/
      // tryGrabOrPlaceInFront(), inventory.js) OR if it's the player's
      // OWN tile and this item collides — placing a collidable item
      // there would trap the player in place (see the matching comment
      // in placeHeldItemAt()), so it's refused the same way an occupied
      // tile is, and shown the same way here.
      const isOwnTileAndCollides = itemDefs[holdingType].collides && col === p.col && row === p.row;
      const color = (existingId === null && !isOwnTileAndCollides)
        ? "rgba(255,255,255,0.55)"  // empty on this layer — valid to place
        : "rgba(220,40,40,0.9)";    // occupied, or would trap the player — blocked

      // +0.5 aligns the stroke to the pixel grid so a 1px lineWidth renders
      // as a genuinely crisp 1px line instead of a blurry ~2px line (a
      // stroke centered on a whole-number coordinate straddles two rows/
      // columns of pixels and gets anti-aliased into a soft double line).
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(screenX + 0.5, screenY + 0.5, size - 1, size - 1);
    }
  }
}

function render() {
  const vw = view.width,
    vh = view.height;

  // how much of the WORLD is visible at the current zoom level
  const viewWorldW = vw / zoom;
  const viewWorldH = vh / zoom;

  // assign to the module-level camX/camY (declared near the top of this
  // file) rather than shadowing with local consts, so inventory.js can
  // read the current camera position when converting a click to a tile.
  camX = clamp(
    player.x - viewWorldW / 2,
    0,
    Math.max(0, MAP_W - viewWorldW),
  );
  camY = clamp(
    player.y - viewWorldH / 2,
    0,
    Math.max(0, MAP_H - viewWorldH),
  );

  ctx.clearRect(0, 0, vw, vh);
  ctx.drawImage(worldCanvas, camX, camY, viewWorldW, viewWorldH, 0, 0, vw, vh);

  drawTerrainLayer(); // Dirt + Water: the base layer, beneath even the ground tileset
  drawFlatGroundItems(); // ground tileset + Port tiles + flat decorative stones: dressing on top of the base terrain

  // Weather FX (js/weatherfx.js) — cloud ground-shadows and "behind" fog
  // patches go on the ground, under items/player, so the character
  // visibly walks through them rather than over them.
  drawCloudShadows(camX, camY);
  drawFogLayer(camX, camY, false);

  drawPlayerStandingDecor(); // the ONE decor tile (if any) the player is standing on — always fully behind them (see js/camera.js)
  renderWorldObjectsSorted(); // stones/trees/house + every OTHER decor tile + player, depth-sorted by Y (see above)

  // "In front" fog patches — drawn over the player.
  drawFogLayer(camX, camY, true);

  drawFloatingPickups(); // resource-drop popups, on top of the world but drawn before the placement grid
  drawThrownTosses(); // T-key throw arc (js/resources.js) — same layer of the render as the pickups above
  drawPlacementRange(camX, camY); // overlay on top so the grid is always visible, even over a tall object

  // Clouds float above everything on the ground; rain falls in front of
  // that (js/weatherfx.js).
  drawCloudSprites(camX, camY);
  drawWeatherOverlayFX();

  // Day/night sky tint — a flat color wash over the whole view, smoothly
  // interpolated from js/daynight.js's keyframes (deep blue at night, warm
  // glow at sunrise/sunset, clear through the day). Drawn last so it sits
  // over the world and the character alike, like ambient light.
  ctx.fillStyle = getSkyOverlayColor();
  ctx.fillRect(0, 0, vw, vh);

  // Sun rays/god rays go on AFTER the sky tint: they're light being added
  // to the scene, not part of what gets dimmed by it. World-space (they
  // scroll with the map), slanted along the sun, cut by the clouds
  // drifting overhead (js/weatherfx.js).
  drawSunRays(camX, camY);

  drawMinimap(); // top-right overview — a separate <canvas> (index.html), not part of the main view/sky tint above (js/hud.js)
}
