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
  // Per request: no shadow while indoors — the sun-position-driven shape/
  // fade below only makes sense outside; a room's own light doesn't cast
  // the same kind of shadow, so just skip it entirely in there rather
  // than let the outdoor day/night clock (which keeps ticking indoors
  // too) draw one anyway.
  if (player.scene === "inside") return;
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

function currentPlayerSheet() {
  const animKey = player.action || player.anim; // any active one-shot action (collect/crush/slice/...) overrides idle/walk/run
  const carryVisual = player.mode === "carrying" || !!heldItem;
  return spriteForFacing(animKey, player.facing, carryVisual ? "carrying" : "normal");
}

// Drawn INSTEAD of the bed's normal art (see the objectLayer/room.decor
// skip checks below) while `player.sleeping` (js/resources.js's
// trySleepInBed()/updateSleeping()) — the Big Bed's own 20-frame sleep
// sheet (assets.bedBigSleep), sliced to the current player.sleepFrame,
// drawn at the SPECIFIC bed's own position (player.sleepBedCol/Row,
// set once when the sequence starts) rather than the player's, since
// outside they're not even standing on the same tile (bedBig collides
// there, so sleeping is triggered by FACING it — findNearbyBigBed(),
// resources.js). Same bottom-center anchor every other placed object
// uses (drawObjectLayerItem() above / the indoor decor loop below).
function drawSleepingBed() {
  const icon = assets.bedBigSleep;
  const frameCount = FRAME_COUNTS.sleep;
  const frameW = icon.width / frameCount;
  const frameH = icon.height;
  const sx = player.sleepFrame * frameW;
  const w = frameW * zoom;
  const h = frameH * zoom;
  const tileCenterX = (player.sleepBedCol + 0.5) * TILE;
  const tileBottomY = (player.sleepBedRow + 1) * TILE;
  const screenX = (tileCenterX - camX) * zoom - w / 2;
  const screenY = (tileBottomY - camY) * zoom - h;
  ctx.drawImage(icon, sx, 0, frameW, frameH, screenX, screenY, w, h);
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
  // Carry_* sheets — only the separate E-toggle did. (Picked in
  // currentPlayerSheet() above, shared with the object-fade test so the
  // fade always checks the exact frame being drawn.)
  const sheet = currentPlayerSheet();
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
  // `fadeWithDaylight` (the Lit Windows — per request, "kapag gabi na di
  // na makikita, lilitaw lang kapag umaga, nag fade opacity depende sa
  // light"): rather than a hard on/off switch, reuse the exact same 0
  // (full night) .. 1 (full day) getDayFactor() the shadow and sky tint
  // already ease through TWILIGHT_HOURS with, so it fades in/out right
  // alongside sunrise/sunset instead of popping.
  const fade = itemDefs[type].fadeWithDaylight;
  if (fade) ctx.globalAlpha = getDayFactor();
  ctx.drawImage(icon, screenX, screenY, w, h);
  if (fade) ctx.globalAlpha = 1;
}

// =================================================================
// OBJECT FADE (see-through trees/stones/house) — pixel-vs-pixel.
//
// Per request: a tree/stone fades ONLY once the character actually
// reaches its real leaves/trunk/rock pixels (standing in its transparent
// deadspace, or just beside it, must NOT fade it), and the house fades
// ONLY when the character is actually BEHIND it — never for standing
// beside its walls.
//
// Why the earlier versions still faded "from the side": the character
// was treated as a box DRAW_SIZE * 0.35 = 16.8 world px to each side of
// its center (~34 px wide), but the character's real visible body is only
// ~14 px wide (sprite px 23..41 of the 64px frame, drawn at 48/64 scale).
// That fat box reached 10 px past the character's arm on either side, so
// it touched a trunk/root/branch/house wall while the character was
// visibly still standing next to it with clear grass in between.
//
// Now BOTH sides are tested with their real pixels: the character's
// CURRENT animation frame (CHARACTER_ALPHA_MASKS) against the object's art
// (OBJECT_ALPHA_MASKS), both precomputed in js/objectAlphaMasks.js
// (generator: tools/generate_alpha_masks.py) — no canvas getImageData,
// so it also works when the game is opened via file://.
// =================================================================
const OBJECT_MASK_CACHE = new Map();    // itemDefs type -> decoded mask | null
const CHARACTER_MASK_CACHE = new Map(); // sprite sheet Image -> decoded mask | null

function decodeMaskBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getObjectMask(type) {
  if (OBJECT_MASK_CACHE.has(type)) return OBJECT_MASK_CACHE.get(type);
  const entry = typeof OBJECT_ALPHA_MASKS !== "undefined" ? OBJECT_ALPHA_MASKS[type] : null;
  const decoded = entry
    ? { w: entry.w, h: entry.h, rowBytes: (entry.w + 7) >> 3, bytes: decodeMaskBytes(entry.b64) }
    : null;
  OBJECT_MASK_CACHE.set(type, decoded);
  return decoded;
}

// Is icon-space pixel (px, py) of this object opaque? Outside the icon =
// transparent. No mask for this type at all = treated as solid (so a
// newly-added item without a mask yet still fades, bounding-box style).
function isObjectPixelOpaque(mask, px, py) {
  if (!mask) return true;
  if (px < 0 || py < 0 || px >= mask.w || py >= mask.h) return false;
  return (mask.bytes[py * mask.rowBytes + (px >> 3)] & (0x80 >> (px & 7))) !== 0;
}

// Looks up a character sheet's mask by its path under assets/sprites/
// (how CHARACTER_ALPHA_MASKS is keyed) — works for both file:// and
// http(s) URLs since only the tail of the path is compared.
function getCharacterMask(sheet) {
  if (!sheet) return null;
  if (CHARACTER_MASK_CACHE.has(sheet)) return CHARACTER_MASK_CACHE.get(sheet);
  let decoded = null;
  if (typeof CHARACTER_ALPHA_MASKS !== "undefined" && sheet.src) {
    const url = decodeURIComponent(sheet.src).replace(/\\/g, "/");
    const marker = "assets/sprites/";
    const i = url.lastIndexOf(marker);
    const entry = i >= 0 ? CHARACTER_ALPHA_MASKS[url.slice(i + marker.length).split("?")[0]] : null;
    if (entry) {
      const rowBytes = (entry.w + 7) >> 3;
      const frameBytes = rowBytes * entry.h;
      const bytes = decodeMaskBytes(entry.b64);
      // Union (OR) of every frame in the sheet — the whole space the
      // character occupies over the loop. Used for idle/walk/run so the
      // fade doesn't flicker on/off every animation frame while standing
      // right at a leaf/trunk edge (the idle arm sway alone moves ~1px).
      const union = new Uint8Array(frameBytes);
      for (let f = 0; f < entry.frames; f++) {
        for (let i = 0; i < frameBytes; i++) union[i] |= bytes[f * frameBytes + i];
      }
      decoded = { ...entry, rowBytes, frameBytes, bytes, union };
    }
  }
  CHARACTER_MASK_CACHE.set(sheet, decoded);
  return decoded;
}

// Fallback body, used only if a sheet somehow has no mask: the measured
// idle/walk/run union bbox (sprite px within the 64x64 frame).
const PLAYER_BODY_FALLBACK = { x: 23, y: 17, w: 19, h: 31 };

// The feet — used for the house's "only when BEHIND it" rule. Measured
// from the idle/walk/run frames: both feet sit on sprite rows 44..47,
// columns 26..37.
const PLAYER_FEET_SPRITE = { x0: 26, x1: 38, y0: 44, y1: 48 };

// Everything needed to map the character's CURRENT frame into world
// space this frame — same sheet/frame/mirroring drawPlayer() draws with.
function getPlayerOcclusionBody() {
  const sheet = currentPlayerSheet();
  const mask = getCharacterMask(sheet);
  const box = mask || PLAYER_BODY_FALLBACK;
  const scale = DRAW_SIZE / FRAME_SIZE; // world px per sprite px
  const frameLeft = player.x - DRAW_SIZE / 2;
  const frameTop = player.y - DRAW_SIZE / 2;
  const mirror = player.facing === "left"; // drawPlayer() flips the side sheet for left
  // sprite-x -> world-x, accounting for the mirror
  const spriteToWorldX = (sx) => (mirror ? player.x + (FRAME_SIZE / 2 - sx) * scale : frameLeft + sx * scale);
  const xa = spriteToWorldX(box.x), xb = spriteToWorldX(box.x + box.w);
  // One-shot actions (chop/crush/collect...) test the exact current frame
  // (an axe swing's union would be huge); looping idle/walk/run test the
  // sheet's union silhouette so the result is stable across frames.
  const useExactFrame = !!player.action;
  return {
    mask,
    bits: mask ? (useExactFrame ? mask.bytes : mask.union) : null,
    bitsOffset: mask && useExactFrame ? Math.min(player.frame, mask.frames - 1) * mask.frameBytes : 0,
    scale, frameLeft, frameTop, mirror, spriteToWorldX,
    minX: Math.min(xa, xb), maxX: Math.max(xa, xb),
    minY: frameTop + box.y * scale, maxY: frameTop + (box.y + box.h) * scale,
  };
}

function isCharacterPixelOpaque(body, lx, ly) {
  const m = body.mask;
  if (!m) return true; // fallback box — treat the whole box as body
  return (body.bits[body.bitsOffset + ly * m.rowBytes + (lx >> 3)] & (0x80 >> (lx & 7))) !== 0;
}

// Does ANY opaque pixel of the character's current frame land on an
// opaque pixel of the object? Walks the character's (small, cropped)
// frame pixel by pixel, maps each one's center into world space, then
// into the object's icon space (1 icon px = 1 world px).
function characterTouchesObjectPixels(body, objMask, objMinX, objMinY) {
  const w = body.mask ? body.mask.w : PLAYER_BODY_FALLBACK.w;
  const h = body.mask ? body.mask.h : PLAYER_BODY_FALLBACK.h;
  const ox = body.mask ? body.mask.x : PLAYER_BODY_FALLBACK.x;
  const oy = body.mask ? body.mask.y : PLAYER_BODY_FALLBACK.y;
  for (let ly = 0; ly < h; ly++) {
    const wy = body.frameTop + (oy + ly + 0.5) * body.scale;
    const py = Math.floor(wy - objMinY);
    if (py < 0 || py >= (objMask ? objMask.h : Infinity)) continue;
    for (let lx = 0; lx < w; lx++) {
      if (!isCharacterPixelOpaque(body, lx, ly)) continue;
      const wx = body.spriteToWorldX(ox + lx + 0.5);
      if (isObjectPixelOpaque(objMask, Math.floor(wx - objMinX), py)) return true;
    }
  }
  return false;
}

// House rule: the character counts as BEHIND the house only if their
// FEET are hidden behind the house's own pixels (roof/back wall). Standing
// beside a wall — even with the head poking in front of the roof's
// overhang — leaves the feet on open grass, so it doesn't count.
// Ignored margin at the left/right edges of a `fadeOnlyWhenBehind`
// object's mask when testing whether the feet are "behind" it — per
// request ("5px na lang sa left at right na collisions para di na mag
// opacity kapag nagpunta sa left at right"): a wide roof genuinely does
// extend further sideways than the walls beneath it, so a marginal graze
// right at that outer edge was pixel-accurate but still read as "just
// walking past the side", not really behind the building — excluding a
// 5px sliver on each side means the feet have to be meaningfully under
// the roof, not just clipping its very tip, before it fades.
const FADE_EDGE_INSET_PX = 5;

function characterFeetBehindObject(body, objMask, objMinX, objMinY) {
  const f = PLAYER_FEET_SPRITE;
  const insetMin = objMask ? FADE_EDGE_INSET_PX : 0;
  const insetMax = objMask ? objMask.w - FADE_EDGE_INSET_PX : Infinity;
  for (let sy = f.y0; sy < f.y1; sy++) {
    const py = Math.floor(body.frameTop + (sy + 0.5) * body.scale - objMinY);
    for (let sx = f.x0; sx < f.x1; sx++) {
      const px = Math.floor(body.spriteToWorldX(sx + 0.5) - objMinX);
      if (px < insetMin || px >= insetMax) continue; // within the excluded edge margin — doesn't count as "behind"
      if (isObjectPixelOpaque(objMask, px, py)) return true;
    }
  }
  return false;
}

// Should this object draw faded this frame?
//  0. `noOcclusionFade` items (Mushroom, Flowering Bush — per request,
//     "alisin mo na lang yung opacity"): never fade, full stop. These
//     have no precomputed alpha mask (getObjectMask() below returns
//     null for them), and isObjectPixelOpaque() treats a maskless item
//     as solid across its WHOLE bounding box — for a short, mostly-empty
//     sprite like a mushroom or a flower, that reads as the character
//     fading while nowhere near its actual (small) visible pixels, which
//     looks wrong rather than helpful.
//  1. the character must be drawn BEHIND it in the Y-sort (otherwise the
//     character is already on top and nothing needs fading);
//  2. their bounding boxes must overlap at all (cheap early-out);
//  2b. `fadeBoundingBoxOnly` (Big/Medium Stone — per request, "lagyan mo
//     ng opacity": the normal pixel-perfect check below (step 4) barely
//     ever actually fired for these — a stone's silhouette is small and
//     mostly solid, so requiring the character's own opaque pixels to
//     land on one of the stone's was a narrow enough window that in
//     normal play it essentially never visibly triggered. Stopping here
//     instead — sorted behind AND bounding boxes overlapping is already
//     true by this point — is coarser but actually visible.
//  3. `fadeOnlyWhenBehind` items (the house): the feet must be hidden
//     behind the object's pixels — see characterFeetBehindObject();
//  4. the character's real pixels must touch the object's real pixels.
function shouldFadeForOcclusion(type, objMinX, objMaxX, objMinY, objMaxY, objSortY) {
  if (itemDefs[type].noOcclusionFade) return false;

  const playerSortY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  if (playerSortY >= objSortY) return false;

  const body = getPlayerOcclusionBody();
  if (body.maxX <= objMinX || body.minX >= objMaxX || body.maxY <= objMinY || body.minY >= objMaxY) return false;

  if (itemDefs[type].fadeBoundingBoxOnly) return true;

  const objMask = getObjectMask(type);
  if (itemDefs[type].fadeOnlyWhenBehind && !characterFeetBehindObject(body, objMask, objMinX, objMinY)) return false;

  return characterTouchesObjectPixels(body, objMask, objMinX, objMinY);
}

// Draws one objectLayer item (a tree, a stone, the house) for the
// Y-sorted pass (renderWorldObjectsSorted(), below) — same bottom-center
// anchoring as drawGroundItemAt(), but with a fade applied
// (OBJECT_FADE_ALPHA) when the player is currently standing behind it in
// a way that would otherwise hide them completely, per request ("kapag
// dumaan sa likod... dapat nag-oopacity yung trees, stone, house...
// para makita yung character"). The fade itself is pixel-accurate (see
// shouldFadeForOcclusion above) — standing in a tree's transparent
// deadspace (empty canopy padding, gaps between branches) does NOT fade
// the character; only actually being covered by a leaf/trunk pixel does.
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

  const shouldFade = shouldFadeForOcclusion(type, objMinX, objMaxX, objMinY, objMaxY, tileBottomY);

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
    // Hidden while its own sleep animation is playing (drawSleepingBed()
    // below draws in its place instead) — per request, the two must
    // never show at once, or it looks like two beds stacked on top of
    // each other.
    if (player.sleeping && key === tileKey(player.sleepBedCol, player.sleepBedRow)) return;
    const [col, row] = key.split(",").map(Number);
    // `alwaysBehindPlayer` (Flowering Bush, Mushroom (B) — per request,
    // "naka behind lang sa character"): skip the normal Y-sort entirely
    // and always draw before the player, regardless of relative
    // position — a flat -Infinity sort key beats every real sortY (which
    // is always a finite world-px row), so this item can never land
    // ahead of the player in the draw order.
    const sortY = itemDefs[type].alwaysBehindPlayer ? -Infinity : (row + 1) * TILE;
    drawables.push({ sortY, draw: () => drawObjectLayerItem(type, col, row) });
  });

  const playerTile = getPlayerTile();
  const playerDecorKey = tileKey(playerTile.col, playerTile.row);
  decorLayer.forEach((type, key) => {
    if (key === playerDecorKey) return; // handled specially — see drawPlayerStandingDecor()
    const [col, row] = key.split(",").map(Number);
    drawables.push({ sortY: (row + 1) * TILE, draw: () => drawWildgrassWhole(type, col, row) });
  });

  if (player.sleeping) {
    // Drawn at the BED's own position, not the player's (they're not
    // even standing on the same tile outside — see drawSleepingBed()'s
    // comment above) — sorted by the bed's row like any other object.
    drawables.push({ sortY: (player.sleepBedRow + 1) * TILE, draw: () => drawSleepingBed() });
  } else {
    const playerFeetWorldY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
    drawables.push({
      sortY: playerFeetWorldY,
      draw: () => drawPlayer((player.x - camX) * zoom, (player.y - camY) * zoom, zoom),
    });
  }

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

  // Multi-tile buildings with a construction timer (the house skins) get
  // their own preview instead of the generic per-tile range grid below —
  // per request ("kapag naka hold na is lumitaw yung mismong tiles kung
  // ilan yung 16x16 tile na naconsume"): the WHOLE footprint the art will
  // actually cover, not just the one tile under the cursor. Only
  // `heldItem` ever reaches this (the house is never E-grabbable — see
  // tryGrabOrPlaceInFront(), inventory.js), so `player.grabbedType` can't
  // hold one here.
  const holdingDef = itemDefs[holdingType];
  if (holdingDef.multiTileFootprint && holdingDef.buildSeconds) {
    drawHouseFootprintPreview(camX, camY, holdingType);
    return;
  }

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

// Interior counterpart to drawPlacementRange() above, for while `heldItem`
// is held inside a room (js/interior.js) — same PLACEMENT_RANGE grid,
// same white-valid/red-blocked coloring, just checked against the
// room's OWN `collisions`/`decor` maps instead of an outdoor layer, and
// bounded by the room's own width/height instead of COLS/ROWS. No E-key
// `player.grabbedType` case here — that mechanic is outdoor-only.
function drawInteriorPlacementRange(room, camX, camY) {
  // Same "heldItem wins, else grabbedType" precedence the outdoor
  // drawPlacementRange() uses — covers both the mouse-based hold-to-
  // place flow AND the E-key grab/carry flow (tryGrabOrPlaceIndoorItemInFront(),
  // interior.js), so carrying a Collision Block or a grabbed decor item
  // around also shows this grid, not just holding one from the
  // inventory panel.
  const holdingType = heldItem ? heldItem.type : player.grabbedType;
  if (!holdingType) return;
  const def = itemDefs[holdingType];
  if (def.multiTileFootprint) return; // never placeable indoors (placeInteriorDecorAt() refuses it) — nothing to preview

  // `interiorOnly` (the Collision Block) targets `room.collisions`;
  // every other item targets `room.decor` — same routing
  // placeHeldItemAt() (inventory.js) uses to decide which of
  // placeInteriorCollisionAt()/placeInteriorDecorAt() actually runs.
  const isCollisionItem = !!def.interiorOnly;
  const targetMap = isCollisionItem ? room.collisions : room.decor;

  const p = interiorFeetTileAt(player.x, player.y);
  const size = TILE * zoom;
  const maxCol = Math.ceil(room.width / TILE) - 1;
  const maxRow = Math.ceil(room.height / TILE) - 1;

  for (let row = p.row - PLACEMENT_RANGE; row <= p.row + PLACEMENT_RANGE; row++) {
    for (let col = p.col - PLACEMENT_RANGE; col <= p.col + PLACEMENT_RANGE; col++) {
      if (col < 0 || row < 0 || col > maxCol || row > maxRow) continue; // nothing to highlight past the room's edge

      const screenX = Math.round((col * TILE - camX) * zoom);
      const screenY = Math.round((row * TILE - camY) * zoom);
      const occupied = targetMap.has(tileKey(col, row));
      // Same "would trap the player" rule placeInteriorCollisionAt()
      // enforces for the Collision Block's own tile (it always
      // collides, so it's refused there even though the tile itself
      // isn't "occupied" yet) — decor never blocks movement, so this
      // never applies to it.
      const isOwnTileBlocked = isCollisionItem && col === p.col && row === p.row;
      const color = (!occupied && !isOwnTileBlocked)
        ? "rgba(255,255,255,0.55)"
        : "rgba(220,40,40,0.9)";

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(screenX + 0.5, screenY + 0.5, size - 1, size - 1);
    }
  }
}

// Preview for a multi-tile building (house skins) while it's held: the
// candidate anchor tile is wherever the mouse currently is
// (lastMouseClientX/Y, inventory.js — updated on move/click), same as
// the instant-placement items above use for their own preview. Outlines
// EVERY tile getMultiTileFootprintTiles() says the art will cover (not
// just the ones that end up colliding — the whole "how many 16x16 tiles
// does this consume" picture), individually AND with one thicker
// rectangle around the whole footprint so the shape reads clearly at a
// glance. White/valid or red/blocked exactly matches what
// canPlaceHouseFootprint() (inventory.js) would decide on an actual
// click, so the preview never lies about whether a click here will work.
function drawHouseFootprintPreview(camX, camY, type) {
  const { col, row } = screenToTile(lastMouseClientX, lastMouseClientY);
  const tiles = getMultiTileFootprintTiles(type, col, row);
  const valid = canPlaceHouseFootprint(type, col, row);
  const color = valid ? "rgba(255,255,255,0.55)" : "rgba(220,40,40,0.9)";
  const size = TILE * zoom;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  tiles.forEach((t) => {
    if (t.col < 0 || t.row < 0 || t.col >= COLS || t.row >= ROWS) return;
    const screenX = Math.round((t.col * TILE - camX) * zoom);
    const screenY = Math.round((t.row * TILE - camY) * zoom);
    ctx.strokeRect(screenX + 0.5, screenY + 0.5, size - 1, size - 1);
  });

  const r = getMultiTileFootprintRect(type, col, row);
  const rx = Math.round((r.leftCol * TILE - camX) * zoom);
  const ry = Math.round((r.topRow * TILE - camY) * zoom);
  const rw = (r.rightCol - r.leftCol + 1) * size;
  const rh = (r.bottomRow - r.topRow + 1) * size;
  ctx.lineWidth = 2;
  ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
}

// Draws every in-progress house build (js/inventory.js's
// pendingConstructions, started by placeHeldItemAt(), finished by
// updateConstructions()) — a low-opacity "blueprint" ghost of the actual
// art, plus a green countdown progress bar centered on the footprint.
// Per request: "mag countdown 10 sec tapos may progress bar na green
// tapos sa gitna nun is nandun yung countdown tyaka lang matatayo yung
// bahay". Nothing here is collidable yet — the ghost is purely visual,
// same as drawFloatingPickups()/drawThrownTosses() below it.
// Draws every in-progress house build (js/inventory.js's
// pendingConstructions, started by placeHeldItemAt(), finished by
// updateConstructions()) — a low-opacity "blueprint" ghost of the actual
// art, plus a green countdown progress bar. Per follow-up request, the
// bar sits centered ON the house itself (not floating above it, where it
// could read as disconnected or drift off-screen for a tall building)
// and is small — about 2 tiles wide — rather than stretched across the
// whole footprint.
const CONSTRUCTION_BAR_WORLD_WIDTH = TILE * 2;  // ~2 tiles, per request
const CONSTRUCTION_BAR_WORLD_HEIGHT = TILE * 0.6;

function drawPendingConstructions(camX, camY) {
  if (pendingConstructions.size === 0) return;
  const now = Date.now();

  pendingConstructions.forEach((info) => {
    const icon = itemDefs[info.type].icon;
    const w = icon.width * zoom;
    const h = icon.height * zoom;
    const tileCenterX = (info.col + 0.5) * TILE;
    const tileBottomY = (info.row + 1) * TILE;
    const screenX = (tileCenterX - camX) * zoom - w / 2;
    const screenY = (tileBottomY - camY) * zoom - h;

    ctx.globalAlpha = 0.4;
    ctx.drawImage(icon, screenX, screenY, w, h);
    ctx.globalAlpha = 1;

    const total = Math.max(1, info.finishAt - info.startAt);
    const progress = Math.min(1, Math.max(0, (now - info.startAt) / total));
    const remainingSec = Math.max(0, Math.ceil((info.finishAt - now) / 1000));

    // Centered on the middle of the footprint rectangle — lands roughly
    // in the middle of the house's own art, so it reads as "on" the
    // building rather than floating above it (per request: "dapat nasa
    // gitna ng bahay para kita").
    const r = getMultiTileFootprintRect(info.type, info.col, info.row);
    const centerWorldX = ((r.leftCol + r.rightCol + 1) / 2) * TILE;
    const centerWorldY = ((r.topRow + r.bottomRow + 1) / 2) * TILE;
    const barW = CONSTRUCTION_BAR_WORLD_WIDTH * zoom;
    const barH = CONSTRUCTION_BAR_WORLD_HEIGHT * zoom;
    const barX = (centerWorldX - camX) * zoom - barW / 2;
    const barY = (centerWorldY - camY) * zoom - barH / 2;

    ctx.fillStyle = "rgba(20,20,20,0.65)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = "#3ecf4a"; // green, per request
    ctx.fillRect(barX, barY, barW * progress, barH);
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);

    // Countdown number, centered on the bar (per request: "sa gitna nun
    // is nandun yung countdown").
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.max(9, Math.round(barH * 0.85))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(remainingSec), barX + barW / 2, barY + barH / 2 + 1);
  });
}

// Draws the interior scene (js/interior.js) — a fixed-size room image
// fit-to-screen (letterboxed, centered) rather than a scrolling camera
// over a big tile map, since a room this small doesn't need one. The
// player is drawn at their room-space x/y mapped through the same
// fit scale, reusing drawPlayer() exactly as the outdoor path does (it
// only needs a final screen x/y and a size multiplier, both supplied
// here). No Y-sorting against furniture yet — see js/interior.js's
// header comment on why that's an acceptable first pass.
// Draws the interior scene (js/interior.js) using the SAME camera
// convention the outdoor world does (per request: "dapat same lang sa
// outside na camera") — a scrolling camera at the normal `zoom` level
// that follows the player and clamps to the room's own bounds, instead
// of the earlier fit-the-whole-room-on-screen approach. `room.image` is
// windowed/scaled exactly the way the outdoor pass draws `worldCanvas`
// (camera.js's render()) — just a single static image here instead of a
// pre-rendered map canvas, same drawImage(source, sx, sy, sw, sh, dx,
// dy, dw, dh) call shape either way. No Y-sorting against furniture
// yet — see js/interior.js's header comment on why that's an acceptable
// first pass.
function renderInteriorScene() {
  const vw = view.width, vh = view.height;
  const room = INTERIOR_ROOMS[player.activeRoomId];
  if (!room) return; // shouldn't happen — interior.js never leaves scene "inside" pointed at a missing room

  // Same viewWorldW/H + clamp-to-bounds shape as the outdoor render()
  // below, just against this room's width/height instead of MAP_W/MAP_H.
  const viewWorldW = vw / zoom;
  const viewWorldH = vh / zoom;
  // Assigned to the SAME module-level camX/camY the outdoor render()
  // uses (declared near the top of this file), not local consts — this
  // is what lets inventory.js's screenToTile()/screenToWorld() (used by
  // the mouse-click placement handler) resolve a click correctly while
  // inside too, for `interiorOnly` items like the Collision Block (see
  // placeInteriorCollisionAt(), js/interior.js). Only one of this
  // function or the outdoor render() runs per frame, so reusing the same
  // pair of variables for "the room's scroll offset" vs. "the map's
  // scroll offset" never conflicts.
  camX = clamp(player.x - viewWorldW / 2, 0, Math.max(0, room.width - viewWorldW));
  camY = clamp(player.y - viewWorldH / 2, 0, Math.max(0, room.height - viewWorldH));

  ctx.clearRect(0, 0, vw, vh);
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, vw, vh);
  ctx.drawImage(room.image, camX, camY, viewWorldW, viewWorldH, 0, 0, vw, vh);

  // Placed Collision Blocks (js/interior.js's `room.collisions`) are
  // invisible once placed — per request ("wag mo na siyang lagyan ng
  // box kapag na put na sa ground... gawin mong transparent lang parang
  // wala lang pero meron collision"): the tile still blocks movement
  // (isInteriorBodyBlockedAt(), interior.js), it just isn't drawn here
  // anymore. The icon itself is untouched — still shows normally in the
  // inventory/hotbar/held-item HUD (itemDefs' `icon: assets.
  // collisionMarker`, inventory.js).

  // Ordinary decor placed indoors (js/interior.js's `room.decor` — doors,
  // picture frames, windows, furniture, anything placeInteriorDecorAt()
  // accepted) — drawn the SAME bottom-center-anchored way
  // drawGroundItemAt() draws an outdoor flat item, just against this
  // room's camX/camY instead. Purely visual (see `room.decor`'s header
  // comment, interior.js) — a Collision Block on the same tile is what
  // actually blocks movement, not this.
  for (const [key, type] of room.decor) {
    // Hidden while its own sleep animation is playing — same reasoning
    // as the outdoor objectLayer skip above.
    if (player.sleeping && key === tileKey(player.sleepBedCol, player.sleepBedRow)) continue;
    const [col, row] = key.split(",").map(Number);
    const icon = itemDefs[type].icon;
    const w = icon.width * zoom;
    const h = icon.height * zoom;
    const tileCenterX = (col + 0.5) * TILE;
    const tileBottomY = (row + 1) * TILE;
    const screenX = (tileCenterX - camX) * zoom - w / 2;
    const screenY = (tileBottomY - camY) * zoom - h;
    // `fadeWithDaylight` (Lit Windows) — same outdoor-clock-driven fade
    // drawGroundItemAt() (above) applies, so a Lit Window placed as
    // indoor wall decor still dims out at night just like one placed
    // outside, on the same shared day/night clock (js/daynight.js) that
    // keeps ticking while indoors too.
    const fade = itemDefs[type].fadeWithDaylight;
    if (fade) ctx.globalAlpha = getDayFactor();
    ctx.drawImage(icon, screenX, screenY, w, h);
    if (fade) ctx.globalAlpha = 1;
  }

  if (player.sleeping) {
    drawSleepingBed();
  } else {
    const px = (player.x - camX) * zoom;
    const py = (player.y - camY) * zoom;
    drawPlayer(px, py, zoom);
  }

  drawThrownTosses(); // T-key throw arc for a grabbed Collision Block (js/inventory.js's tryThrowGrabbedInteriorItem(), interior.js) — same visual as the outdoor throw
  drawInteriorPlacementRange(room, camX, camY); // white/red tile-border grid while holding something, same idea as drawPlacementRange() outdoors

  // Small "how to leave" hint — the exit mat isn't otherwise marked as
  // interactive, so this keeps it discoverable. Pinned to the bottom of
  // the screen (not the room image's edge, since that scrolls now).
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Walk onto the doormat to go back outside", vw / 2, vh - 14);
}

// Solid black, fading in/out (js/interior.js's `sceneFade`) over the
// entrance/exit of a house's interior — drawn last, over the world or
// the room alike, so the scene switch underneath is never visible
// mid-transition.
function drawSceneFadeOverlay() {
  const alpha = getSceneFadeAlpha();
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fillRect(0, 0, view.width, view.height);
}

// Screen-edge vignette blur — per request ("medyo blurry sa taas left
// right at bottom ng screen parang sa Stardew Valley"): the outer rim of
// the viewport (all four edges/corners) reads slightly soft-focus while
// the middle — where the player and the action actually are — stays
// perfectly sharp, same "focus falls off toward the frame" look Stardew
// Valley's own camera has.
//
// Built from the frame that's ALREADY been drawn to the main canvas this
// frame: a blurred copy of it (ctx.filter = "blur()", the same filter
// property drawShadow() above already relies on) gets masked with a
// radial gradient — transparent through the whole center, opaque only
// out past `VIGNETTE_INNER_FRACTION` of the way to the corner — so only
// the edges actually show the blurred copy peeking through; compositing
// that on top of the untouched sharp frame is what gives the smooth
// sharp-to-soft falloff, rather than blurring the whole screen (which
// would blur the character too) or hard-cutting a blurred border (which
// would show a visible seam).
//
// Both buffers are only rebuilt when the canvas itself actually resizes
// (resizeCanvas(), main.js) — same viewport size every other frame in
// between, so there's nothing new to compute.
let vignetteBlurCanvas = null;
let vignetteBlurCtx = null;
let vignetteMaskCanvas = null;
let vignetteBuiltForW = 0;
let vignetteBuiltForH = 0;

const VIGNETTE_BLUR_PX = 14; // how soft the edge itself looks — strong enough to actually read as "blurred", not just faintly softened
const VIGNETTE_BAND_FRACTION = 0.26; // how far in from EACH edge (as a fraction of that edge's own screen dimension) the blur reaches before fading to nothing

function ensureVignetteBuffers(vw, vh) {
  if (vignetteBuiltForW === vw && vignetteBuiltForH === vh && vignetteBlurCanvas) return;

  vignetteBlurCanvas = document.createElement("canvas");
  vignetteBlurCanvas.width = vw;
  vignetteBlurCanvas.height = vh;
  vignetteBlurCtx = vignetteBlurCanvas.getContext("2d");

  // Built from FOUR separate edge bands (top/bottom/left/right), each its
  // own linear gradient running perpendicular to that edge — full
  // strength flush against the edge, fading to nothing over
  // VIGNETTE_BAND_FRACTION of the screen's own width/height — rather
  // than one radial gradient from the center. A radial gradient reaches
  // full strength fastest at the CORNERS (furthest from center) and
  // barely touches the middle of each edge at all; per request ("taas
  // left right at bottom ng screen"), all four edges need to read as
  // blurred along their whole length, corners included, not just the
  // corners themselves. `globalCompositeOperation = "lighten"` combines
  // the four bands by taking the per-pixel MAX rather than summing them,
  // so a corner (covered by two overlapping bands) reads exactly as
  // strong as a flat edge — never double-darkened.
  vignetteMaskCanvas = document.createElement("canvas");
  vignetteMaskCanvas.width = vw;
  vignetteMaskCanvas.height = vh;
  const maskCtx = vignetteMaskCanvas.getContext("2d");
  maskCtx.clearRect(0, 0, vw, vh);
  maskCtx.globalCompositeOperation = "lighten";

  const bandW = vw * VIGNETTE_BAND_FRACTION;
  const bandH = vh * VIGNETTE_BAND_FRACTION;

  // Left edge: opaque at x=0, fading out by x=bandW.
  let g = maskCtx.createLinearGradient(0, 0, bandW, 0);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  maskCtx.fillStyle = g;
  maskCtx.fillRect(0, 0, bandW, vh);

  // Right edge: mirror of the above.
  g = maskCtx.createLinearGradient(vw, 0, vw - bandW, 0);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  maskCtx.fillStyle = g;
  maskCtx.fillRect(vw - bandW, 0, bandW, vh);

  // Top edge.
  g = maskCtx.createLinearGradient(0, 0, 0, bandH);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  maskCtx.fillStyle = g;
  maskCtx.fillRect(0, 0, vw, bandH);

  // Bottom edge.
  g = maskCtx.createLinearGradient(0, vh, 0, vh - bandH);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  maskCtx.fillStyle = g;
  maskCtx.fillRect(0, vh - bandH, vw, bandH);

  maskCtx.globalCompositeOperation = "source-over";

  vignetteBuiltForW = vw;
  vignetteBuiltForH = vh;
}

function drawVignetteBlur() {
  // Per request ("kapag gabi kahit wala na, tuwing sunny day lang"):
  // only shows on a clear, fully-daylit sky — not at night (getDayFactor()
  // 0 through twilight) and not on a Rainy/Snow day either, since a
  // blurred rim reads as a bright, in-focus-center camera effect that
  // doesn't fit an already-dim or overcast scene the way it does a sunny
  // one.
  if (getDayFactor() < 1 || getCurrentWeather().name !== "Sunny") return;

  const vw = view.width;
  const vh = view.height;
  ensureVignetteBuffers(vw, vh);

  vignetteBlurCtx.clearRect(0, 0, vw, vh);
  vignetteBlurCtx.filter = `blur(${VIGNETTE_BLUR_PX}px)`;
  vignetteBlurCtx.drawImage(view, 0, 0); // a blurred copy of the frame just drawn to the main canvas
  vignetteBlurCtx.filter = "none";

  // Punch the center out of that blurred copy, leaving only the edges.
  vignetteBlurCtx.globalCompositeOperation = "destination-in";
  vignetteBlurCtx.drawImage(vignetteMaskCanvas, 0, 0);
  vignetteBlurCtx.globalCompositeOperation = "source-over";

  ctx.drawImage(vignetteBlurCanvas, 0, 0); // composite the edge-only blur back onto the sharp frame
}

// A distinct blue night tint — per request ("kapag gabi... kaya ba ng
// parang may pagka blue yung paligid?"). The existing day/night sky
// overlay (getSkyOverlayColor(), js/daynight.js) already darkens toward
// a navy color at night, but at its actual alpha that reads mostly as
// "dim", the blue in it barely registering. This is a SEPARATE, gentler
// wash — low alpha, clearly blue rather than just dark — layered on top
// of that overlay (not replacing it) so night specifically picks up an
// obvious cool/moonlit cast rather than just losing brightness.
const NIGHT_BLUE_TINT = "rgba(40,70,160,0.16)";

function drawNightBlueTint() {
  const nightFactor = 1 - getDayFactor(); // 0 in full day, 1 in full night, easing through twilight same as everything else
  if (nightFactor <= 0) return;
  ctx.save();
  ctx.globalAlpha = nightFactor;
  ctx.fillStyle = NIGHT_BLUE_TINT;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
}

function render() {
  if (player.scene === "inside") {
    renderInteriorScene();
    // No vignette blur indoors — per request, it's an outside-only effect.
    drawSceneFadeOverlay();
    return;
  }

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

  drawPendingConstructions(camX, camY); // house builds in progress — ghost preview + green countdown bar

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

  drawNightBlueTint(); // extra blue cast at night, on top of the sky tint above — see above
  drawVignetteBlur(); // soft edge blur, all four sides, sunny daytime only — see above
  drawSceneFadeOverlay(); // interior enter/exit fade-to-black (js/interior.js) — drawn last, over absolutely everything
}
