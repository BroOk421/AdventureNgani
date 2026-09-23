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
  // Keep the shadow GLUED to the feet — per request ("idikit mo lang sa
  // paa yung shadow, wag lumayo... same parin yung size, iuusog lang
  // papunta sa paa parang naka magnet").
  //
  // The silhouette below is drawn with the sprite FRAME's bottom edge at
  // the pivot, but the character's actual feet sit higher up inside that
  // frame (SPRITE_FEET_FRACTION = 0.62 — the rest is transparent padding
  // under them). Once the skew/squash transform runs, that padding gets
  // stretched and swung too, which is what dragged the shadow's feet away
  // from the character's — worst at sunrise/sunset, when skew/squash peak.
  //
  // So: work out exactly where the shadow's FEET row lands under the
  // transform, and nudge the whole thing back by that much. This is a
  // pure screen-space translation applied AFTER the transform, so the
  // shadow's size, lean and length are all completely unchanged — it just
  // slides over until its feet sit on the character's feet.
  const feetLocalY = -size * (1 - SPRITE_FEET_FRACTION); // feet row, in pre-transform local space (frame bottom = 0)
  ctx.translate(-skew * feetLocalY, squashY * feetLocalY);
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

// Soft ambient glow behind the character — per request ("lagyan mo rin ng
// light yung character pero behind ng character, di masyadong maliwanag,
// konting naninag lang na circle, medyo malaki lang ng konti sa kanya"):
// a gentle, low-opacity radial glow centered on the character, its circle
// just a bit bigger than the sprite itself. Drawn BEFORE the sprite (see
// drawPlayer() below) so it sits fully BEHIND the character, like a soft
// light the character carries with them, rather than on top of/around
// the art.
const PLAYER_GLOW_RADIUS_SCALE = 0.85; // relative to the sprite's own size — "medyo malaki lang ng konti sa kanya"
// Candle light — per request ("yung light circle gawin mong color is
// parang candle light"). A real flame isn't white: it's a warm amber
// that gets noticeably more orange toward the edge of its reach, as the
// weaker light loses its blue end first. So this is three stops rather
// than two — a pale warm core, an amber middle, fading to a deep orange
// nothing — instead of the old flat off-white, which read more like a
// flashlight. Alphas stay low to keep it "di masyadong maliwanag".
const PLAYER_GLOW_COLOR_INNER = "rgba(255,198,124,0.95)"; // pale warm core, right at the flame
const PLAYER_GLOW_COLOR_MID = "rgba(255,152,66,0.60)";   // amber body of the pool of light
const PLAYER_GLOW_COLOR_OUTER = "rgba(255,120,30,0)";     // deep orange, faded to nothing

/* --- Light occlusion: walls/decor cast silhouettes out of the glow -----
   Per request ("yung pagkashadow ng wall, kaya ba yung mismong itsura
   lumitaw, hindi tile, pero same shadow style?" — and before that, the
   Graveyard Keeper reference). The glow used to be a flat circle pasted
   over everything, shining straight through walls. Now every solid thing
   within the glow's reach throws its shadow away from the character, and
   those shadows are punched OUT of the circle — so the light stops dead
   at a wall.

   The shadow uses the object's REAL SPRITE SHAPE, not its tile box: a
   round barrel throws a round shadow, a slanted wall throws a slanted
   one. That's done by projecting the sprite's own black silhouette
   outward from the light — for a point light, scaling a shape about the
   light and unioning every step IS its shadow volume, so the result is
   geometrically the true shadow of that exact silhouette, not an
   approximation of it.

   Two small offscreen canvases (same trick as buildSilhouette() above):
   one builds the shadow mask, the other the light. Paint the gradient,
   `destination-out` the mask once, blit. Both are only as wide as the
   glow itself — a couple of tiles across — so this stays cheap even
   running every frame. */
const glowCanvas = document.createElement("canvas");
const glowCtx = glowCanvas.getContext("2d");
const glowMaskCanvas = document.createElement("canvas");
const glowMaskCtx = glowMaskCanvas.getContext("2d");

// Solid-black copies of object sprites, keyed by the source Image — the
// shape that actually gets projected below. Cached because an object's
// art never changes, so this runs once per sprite for the whole session
// rather than every frame.
const OCCLUDER_SILHOUETTE_CACHE = new Map();

function getOccluderSilhouette(icon) {
  if (!icon || !icon.width || !icon.height) return null;
  const cached = OCCLUDER_SILHOUETTE_CACHE.get(icon);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = icon.width;
  c.height = icon.height;
  const cc = c.getContext("2d");
  cc.drawImage(icon, 0, 0);
  // Keep the sprite's alpha shape, flatten every opaque pixel to black —
  // this is the silhouette the shadow is cast from.
  cc.globalCompositeOperation = "source-in";
  cc.fillStyle = "#000";
  cc.fillRect(0, 0, icon.width, icon.height);
  cc.globalCompositeOperation = "source-over";
  OCCLUDER_SILHOUETTE_CACHE.set(icon, c);
  return c;
}

// How bright the candle circle is right now — per request ("meron parin
// circle light kapag sa umaga, e alisin mo na yun kapag umaga, kahit sa
// room, sa gabi lang, start 6pm to 6am"). 0 = no candle at all, 1 = full
// night. Nighttime is the ONLY thing that lights it: weather is
// deliberately not a factor anymore, because letting overcast days
// contribute meant a rainy or cloudy morning still lit the candle at
// 9am. Now it's purely the clock, so 06:00-18:00 is always dark, indoors
// and out alike (renderInteriorScene() draws the player through the same
// drawPlayer() path, so the room is covered by this too).
//
// This deliberately does NOT reuse getDayFactor() the way the sky tint
// does. getDayFactor() is still 0 AT 06:00 — sunrise is where it STARTS
// climbing, only reaching full daylight an hour later — so a candle tied
// to it was still burning at full strength at the exact moment you woke
// up. The candle gets its own ramp instead, shifted one TWILIGHT_HOURS
// earlier, so it finishes fading out exactly AT SUNRISE_HOUR.
function getNightLightFactor() {
  const h = getGameHour();
  if (h >= SUNRISE_HOUR && h <= SUNSET_HOUR) return 0; // 06:00-18:00 — daytime, no candle, ever
  if (h > SUNSET_HOUR) {
    // Evening: starts at 18:00 and eases up over TWILIGHT_HOURS, so it
    // arrives as the light goes rather than snapping on.
    return Math.max(0, Math.min(1, (h - SUNSET_HOUR) / TWILIGHT_HOURS));
  }
  // Pre-dawn: eases back down through the last TWILIGHT_HOURS of night,
  // hitting exactly 0 at 06:00 — gone by the time you're up.
  return Math.max(0, Math.min(1, (SUNRISE_HOUR - h) / TWILIGHT_HOURS));
}

const LIGHT_MAX_OCCLUDERS = 14;  // hard ceiling on shadow casters per frame — nearest ones win
const LIGHT_SHADOW_STEP_PX = 3;  // world px a projection may advance per step — smaller = smoother, more steps
const LIGHT_SHADOW_MAX_STEPS = 34;
// Generous tile margin for the cheap reject below: big sprites (houses,
// tall trees) are anchored several tiles below/right of where their art
// actually starts, so a tight box would cull them while they're still
// visibly inside the light.
const LIGHT_OCCLUDER_TILE_MARGIN = 8;

// Everything solid near the light, as world-space rects PLUS the sprite
// to cast from. Outdoors that's anything colliding across the four layers
// (walls, trees, stones, houses), bottom-center anchored on its tile
// exactly the way drawObjectLayerItem() draws it, so the shadow lines up
// with the art pixel for pixel. Indoors it's every placed decor item
// (indoor walls/furniture are decor, not collision data) plus the room's
// Collision Blocks — those are invisible by design, so they fall back to
// a plain tile box with no sprite.
function collectLightOccluders(worldCX, worldCY, worldRadius) {
  const out = [];
  const minX = worldCX - worldRadius, maxX = worldCX + worldRadius;
  const minY = worldCY - worldRadius, maxY = worldCY + worldRadius;

  // Bottom-center anchor shared by every placed object in the game.
  const pushSprite = (type, col, row) => {
    const def = itemDefs[type];
    if (!def || !def.icon || !def.icon.width) return;
    // Skip the Lit Windows (`fadeWithDaylight`) — per request ("sa shadow
    // wag mo na isama yung mga lit window kasi shadow na ng bintana
    // yun"). Those sprites ARE light spilling out of a window, not a
    // solid object standing in the way, so casting a shadow from one had
    // the light blocking itself.
    if (def.fadeWithDaylight) return;
    // Cast from the art that's ACTUALLY on screen, at the position it's
    // actually drawn. Two things were being ignored here: `artRoot`
    // (which shifts a lamp post so its foot stands on the tile rather
    // than its bounding box being centred on it) and the night art
    // swap. Without them the shadow was thrown from where the sprite
    // used to sit before root anchoring — about a tile and a half off to
    // the side, which is exactly what it looked like.
    const swap = nightSwapFor(type);
    const icon = swap ? swap.icon : def.icon;
    const root = (swap ? swap.root : def.artRoot) || { x: 0, y: 0 };
    const x = (col + 0.5) * TILE - icon.width / 2 - root.x;
    const y = (row + 1) * TILE - icon.height - root.y;
    if (x + icon.width < minX || x > maxX || y + icon.height < minY || y > maxY) return;
    out.push({ icon, x, y, w: icon.width, h: icon.height });
  };

  if (player.scene === "inside") {
    const room = INTERIOR_ROOMS[player.activeRoomId];
    if (!room) return out;
    for (const [key, type] of room.decor) {
      const [col, row] = key.split(",").map(Number);
      pushSprite(type, col, row);
    }
    for (const key of room.collisions.keys()) {
      const [col, row] = key.split(",").map(Number);
      const x = col * TILE, y = row * TILE;
      if (x + TILE < minX || x > maxX || y + TILE < minY || y > maxY) continue;
      out.push({ icon: null, x, y, w: TILE, h: TILE }); // invisible wall — no art to cast from
    }
  } else {
    // Cheap tile-bounds reject first: the world can hold thousands of
    // placed items, and only the handful within a couple of tiles can
    // possibly shadow anything, so skip the rest before doing any real
    // per-sprite work.
    const minCol = Math.floor(minX / TILE) - LIGHT_OCCLUDER_TILE_MARGIN;
    const maxCol = Math.ceil(maxX / TILE) + LIGHT_OCCLUDER_TILE_MARGIN;
    const minRow = Math.floor(minY / TILE) - LIGHT_OCCLUDER_TILE_MARGIN;
    const maxRow = Math.ceil(maxY / TILE) + LIGHT_OCCLUDER_TILE_MARGIN;
    for (const layer of [terrainLayer, groundLayer, decorLayer, objectLayer]) {
      for (const [key, type] of layer) {
        const def = itemDefs[type];
        if (!def) continue;
        // Two ways in: anything solid blocks light by definition, and
        // anything flagged `castsLightShadow` opts in on top of that —
        // per request ("add mo rin yung ibang walang shadow gaya ng bush,
        // mushrooms... pero yung flower na folder flower1, flower2 lagyan
        // mo ng shadow"). Bushes, mushrooms and the tall/short flowers
        // are things you walk straight through, so they never collided
        // and so never showed up in the light — but they're solid enough
        // to block a candle, and a lit clearing where the bushes throw
        // nothing looks wrong. The flowering bushes in assets/bushes/ are
        // deliberately left out, as asked.
        if (!def.collides && !def.castsLightShadow) continue;
        const comma = key.indexOf(",");
        const col = +key.slice(0, comma);
        const row = +key.slice(comma + 1);
        if (col < minCol || col > maxCol || row < minRow || row > maxRow) continue;
        pushSprite(type, col, row);
      }
    }
  }

  // Nearest-first, capped — a hard ceiling on how much work one frame can
  // ask for no matter how densely the player has built.
  if (out.length > LIGHT_MAX_OCCLUDERS) {
    out.sort((a, b) => {
      const da = Math.hypot(a.x + a.w / 2 - worldCX, a.y + a.h / 2 - worldCY);
      const db = Math.hypot(b.x + b.w / 2 - worldCX, b.y + b.h / 2 - worldCY);
      return da - db;
    });
    out.length = LIGHT_MAX_OCCLUDERS;
  }
  return out;
}

function drawPlayerGlow(px, py, size) {
  // Night only, 18:00-06:00 — see getNightLightFactor() above.
  const darkness = getNightLightFactor();
  if (darkness <= 0.02) return;

  const radius = size * PLAYER_GLOW_RADIUS_SCALE; // screen px
  const d = Math.ceil(radius * 2);
  if (d <= 0) return;

  if (glowCanvas.width !== d || glowCanvas.height !== d) {
    glowCanvas.width = d;
    glowCanvas.height = d;
    glowMaskCanvas.width = d;
    glowMaskCanvas.height = d;
  }
  const cx = d / 2, cy = d / 2;

  // 1. Build the shadow mask: every occluder's silhouette, projected out
  //    from the light. Drawn source-over onto its own canvas so the
  //    overlapping copies simply union into one solid shape instead of
  //    stacking up unevenly.
  const worldRadius = radius / zoom;
  const occluders = collectLightOccluders(player.x, player.y, worldRadius);
  let hasShadow = false;

  if (occluders.length) {
    glowMaskCtx.setTransform(1, 0, 0, 1, 0, 0);
    glowMaskCtx.clearRect(0, 0, d, d);
    glowMaskCtx.fillStyle = "#000";
    const far = worldRadius * 2; // past the glow's own edge — anything beyond is already dark

    for (const o of occluders) {
      // The rect in canvas-local px at scale 1. Because the light sits at
      // the canvas center, projecting by `s` is just multiplying these by
      // `s` — the light-relative math collapses into a plain scale.
      const bx = (o.x - player.x) * zoom;
      const by = (o.y - player.y) * zoom;
      const bw = o.w * zoom;
      const bh = o.h * zoom;

      // Nearest/farthest corner distances decide how far to project and
      // how finely to step, so a shadow neither falls short nor tears
      // open into stripes.
      const dxs = [o.x - player.x, o.x + o.w - player.x];
      const dys = [o.y - player.y, o.y + o.h - player.y];
      let dMin = Infinity, dMax = 0;
      for (const dx of dxs) for (const dy of dys) {
        const dist = Math.hypot(dx, dy);
        if (dist < dMin) dMin = dist;
        if (dist > dMax) dMax = dist;
      }
      dMin = Math.max(dMin, 6); // don't let an object underfoot blow the projection up
      if (dMax <= 0) continue;

      const maxScale = Math.min(12, far / dMin);
      if (maxScale <= 1) continue;
      const steps = Math.max(3, Math.min(
        LIGHT_SHADOW_MAX_STEPS,
        Math.ceil(((maxScale - 1) * dMax) / LIGHT_SHADOW_STEP_PX),
      ));

      const sil = getOccluderSilhouette(o.icon);
      for (let i = 0; i <= steps; i++) {
        const s = 1 + ((maxScale - 1) * i) / steps;
        if (sil) {
          glowMaskCtx.drawImage(sil, cx + bx * s, cy + by * s, bw * s, bh * s);
        } else {
          glowMaskCtx.fillRect(cx + bx * s, cy + by * s, bw * s, bh * s);
        }
      }
      hasShadow = true;
    }
  }

  // 2. The light itself — same soft warm circle as before.
  glowCtx.setTransform(1, 0, 0, 1, 0, 0);
  glowCtx.clearRect(0, 0, d, d);
  const gradient = glowCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, PLAYER_GLOW_COLOR_INNER);
  gradient.addColorStop(0.55, PLAYER_GLOW_COLOR_MID);
  gradient.addColorStop(1, PLAYER_GLOW_COLOR_OUTER);
  glowCtx.fillStyle = gradient;
  glowCtx.beginPath();
  glowCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  glowCtx.fill();

  // 3. Carve the mask out of it in one pass — one blur for the whole set
  //    of shadows, so their edges soften without each shape being
  //    filtered separately.
  if (hasShadow) {
    glowCtx.globalCompositeOperation = "destination-out";
    glowCtx.filter = "blur(2px)";
    glowCtx.drawImage(glowMaskCanvas, 0, 0);
    glowCtx.filter = "none";
    glowCtx.globalCompositeOperation = "source-over";
  }

  // 4. Blit the finished, shadowed light into the scene, faded by how
  //    dark it actually is right now.
  //
  //    Composited ADDITIVELY ("lighter") rather than painted over the
  //    scene. Past roughly 0.6 opacity a normal blend stops looking like
  //    light and starts looking like a sticker — it hides the ground
  //    under the character instead of illuminating it, and pushes
  //    everything toward one flat colour. Adding the light to what's
  //    already there is how real light behaves: the ground keeps its own
  //    detail and simply gets brighter, and the circle can go well past
  //    what a plain overlay could without washing out.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = darkness;
  ctx.drawImage(glowCanvas, px - d / 2, py - d / 2);
  ctx.restore();
}

// Just the character's art — no shadow, no glow, no lighting of any
// kind. Split out of drawPlayer() below so the night relight
// (drawPlayerNightRelight()) can redraw exactly the same pixels in the
// same place without duplicating the sheet/frame/mirroring logic.
function drawPlayerSprite(px, py, scale) {
  const sheet = currentPlayerSheet();
  const sx = player.frame * FRAME_SIZE;
  const size = DRAW_SIZE * scale;

  ctx.save();
  if (player.facing === "left") {
    ctx.translate(px, py);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet, sx, 0, FRAME_SIZE, FRAME_SIZE, -size / 2, -size / 2, size, size);
  } else {
    ctx.drawImage(sheet, sx, 0, FRAME_SIZE, FRAME_SIZE, px - size / 2, py - size / 2, size, size);
  }
  ctx.restore();

  // What you're holding shows above your head, so it's visible in-world
  // (not just in the HUD) — mirrors js/inventory.js's `heldItem`.
  drawHeldItemAboveHead(px, py, size, scale);
}

// Gives the character back their daylight colours at night — per request
// ("yung character sa circle light, i-normal mo na yung kulay ng
// character sa gabi").
//
// The night look comes from two full-screen washes painted over the
// finished frame (getSkyOverlayColor() + drawNightBlueTint()), and those
// hit the character just as hard as the ground: at full night the sky
// tint alone is 55% opaque navy, which drags skin and clothes toward a
// flat blue-grey. It can't be cancelled out BEFORE the wash either —
// undoing a 0.55 overlay would need the sprite drawn at ~430 brightness,
// well past what a pixel can hold.
//
// So the character is simply painted once more AFTER those washes, at
// the strength of the darkening itself. Daylight leaves it at 0 (nothing
// is redrawn at all); full night leaves it at 1, restoring their true
// colours — which reads correctly anyway, since they're standing in
// their own candlelight.
function drawPlayerNightRelight() {
  if (player.sleeping) return; // the bed's own sleep animation is drawn instead of the character
  const night = 1 - getDayFactor(); // matches the wash exactly, so it eases in/out with it
  if (night <= 0.01) return;

  const px = (player.x - camX) * zoom;
  const py = (player.y - camY) * zoom;
  ctx.save();
  ctx.globalAlpha = night;
  drawPlayerSprite(px, py, zoom);
  ctx.restore();
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
  drawPlayerGlow(px, py, size); // behind the character — see drawPlayerGlow() above
  drawPlayerSprite(px, py, scale); // the art itself (shared with the night relight above)
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
// `maskType` lets the caller test against a DIFFERENT art's mask than
// the item's own — needed for the lamp post, which swaps to a
// differently-shaped sprite at night: the fade has to match whichever
// art is actually on screen, or the player would vanish behind pixels
// that aren't there (or show through ones that are).
function shouldFadeForOcclusion(type, objMinX, objMaxX, objMinY, objMaxY, objSortY, maskType) {
  if (itemDefs[type].noOcclusionFade) return false;

  const playerSortY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  if (playerSortY >= objSortY) return false;

  const body = getPlayerOcclusionBody();
  if (body.maxX <= objMinX || body.minX >= objMaxX || body.maxY <= objMinY || body.minY >= objMaxY) return false;

  if (itemDefs[type].fadeBoundingBoxOnly) return true;

  const objMask = getObjectMask(maskType || type);
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

/* --- root anchoring -------------------------------------------------
   Almost everything placed is anchored bottom-CENTRE on its tile, which
   is right for a bush or a rock whose mass sits in the middle of its
   art. It's wrong for something like a lamp post, where the art is a
   tall pole standing at one edge with an arm reaching across: centring
   that leaves the pole a tile and a half away from the tile you clicked,
   which is exactly what the placement preview was showing.

   `artRoot` (and `nightArtRoot` for the night art) says where the
   object's ROOT — the bit actually touching the ground — sits inside its
   own art, measured in art px from the art's bottom-centre. Drawing
   shifts by that, so the root lands on the placement tile and the rest
   of the art hangs off it. That makes the lamp behave like a tree: one
   tile, the tile you clicked, with the art growing up and out from it. */
function objectArtRect(icon, root, col, row, camX, camY) {
  const w = icon.width * zoom;
  const h = icon.height * zoom;
  const rx = root ? root.x * zoom : 0;
  const ry = root ? root.y * zoom : 0;
  return {
    x: ((col + 0.5) * TILE - camX) * zoom - w / 2 - rx,
    y: ((row + 1) * TILE - camY) * zoom - h - ry,
    w,
    h,
  };
}

/* --- night art swap (lamp posts) ------------------------------------
   An item with a `nightIcon` shows that art once it's dark and its
   normal art by day, crossfading between the two on the SAME ramp the
   candle and the sky use — per request ("pa-fade yung entrance ng pag
   transition"), so the lamp warms up at dusk rather than popping. */
function nightSwapFor(type) {
  const def = itemDefs[type];
  if (!def.nightIcon || !def.nightIcon.width) return null;
  const night = getNightLightFactor();
  if (night <= 0.01) return null; // full daylight — nothing to swap in
  return { icon: def.nightIcon, night, root: def.nightArtRoot || def.artRoot };
}

function drawObjectLayerItem(type, col, row) {
  const def = itemDefs[type];
  const icon = def.icon;
  const tileBottomY = (row + 1) * TILE;
  const day = objectArtRect(icon, def.artRoot, col, row, camX, camY);
  const swap = nightSwapFor(type);

  // The occlusion fade is pixel-accurate off the art's own mask (this is
  // the tree behaviour — transparent deadspace never fades, only real
  // pixels do), so it has to be measured against the art that's actually
  // showing AND at the shifted position root anchoring draws it at.
  // Once the night art is more than half faded in, that's the one the
  // player can actually be hidden behind.
  const showNight = swap && swap.night > 0.5;
  const shown = showNight ? swap.icon : icon;
  const shownRect = showNight ? objectArtRect(swap.icon, swap.root, col, row, camX, camY) : day;
  const maskType = showNight ? (def.nightMaskType || type) : type;
  const objMinX = camX + shownRect.x / zoom;
  const objMinY = camY + shownRect.y / zoom;
  const shouldFade = shouldFadeForOcclusion(
    type, objMinX, objMinX + shown.width, objMinY, objMinY + shown.height,
    tileBottomY, maskType);
  const baseAlpha = shouldFade ? OBJECT_FADE_ALPHA : 1;

  if (swap) {
    // Crossfade: the day art fades out as the night art fades in, so
    // there's never a frame where the object vanishes entirely.
    const nite = showNight ? shownRect : objectArtRect(swap.icon, swap.root, col, row, camX, camY);
    ctx.globalAlpha = baseAlpha * (1 - swap.night);
    ctx.drawImage(icon, day.x, day.y, day.w, day.h);
    ctx.globalAlpha = baseAlpha * swap.night;
    ctx.drawImage(swap.icon, nite.x, nite.y, nite.w, nite.h);
    ctx.globalAlpha = 1;
    return;
  }

  if (shouldFade) ctx.globalAlpha = OBJECT_FADE_ALPHA;
  ctx.drawImage(icon, day.x, day.y, day.w, day.h);
  if (shouldFade) ctx.globalAlpha = 1;
}

/* --- lamp-post light ------------------------------------------------
   Per request ("lagyan mo ng ilaw same ng color ng circle light... 80x80
   px yung light niya, may radius lang sa mga sulok"): an 80x80 world-px
   glow in the same candle colours the player's own light uses, shaped as
   a ROUNDED SQUARE rather than a circle — soft edges, but with the
   corners only rounded off instead of the whole thing collapsing into a
   disc.

   Built once into an offscreen sprite and then just blitted per lamp:
   the shape never changes, only where it's drawn and how bright, so
   rebuilding it per lamp per frame would be pure waste. Composited
   additively for the same reason the player's candle is — light adds to
   what's under it instead of painting over it. */
const POST_GLOW_WORLD_SIZE = TILE * 7;  // "yung laki ng light is 7x7" — 7 tiles across
const POST_GLOW_CORNER_CUT = TILE;      // "yung sulok is wag ng lagyan" — a tile off each corner, so each edge reads as 5

// The candle and this lamp use the same colours, but they're drawn at
// different points in the frame: the player's candle goes down with the
// world, BEFORE the night washes, so those washes dim it; this one is
// drawn after them so it can spill over the character, which would leave
// it far brighter for free. That difference is exactly why the lamp was
// blowing out while the candle looked fine.
//
// So it's dimmed by hand to land at the same strength the candle ends up
// at: what survives the sky tint (0.55 navy) and the blue night tint
// (0.16) is (1 - 0.55) * (1 - 0.16) — per request, "same lang sa circle
// light na liwanag, ganun lang kalakas".
const POST_GLOW_MATCH_CANDLE = (1 - 0.55) * (1 - 0.16);

const postGlowCanvas = document.createElement("canvas");
let postGlowReady = false;

function roundRectPath(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

// A soft SQUARE pool of light with its corners taken off, rather than a
// disc — a lamp on a post throws light across the ground it stands on,
// not a neat circle. Built by blurring two nested rounded squares onto
// one sprite: a wide dim one for the spill and a small bright one for
// the core, in the candle's own two colours. They're composited
// source-over here (not additively), so the centre tops out at the inner
// colour instead of the two summing past white.
function buildPostGlowSprite() {
  const S = 4; // supersampled, so it stays smooth when scaled up by zoom
  const n = POST_GLOW_WORLD_SIZE * S;
  postGlowCanvas.width = n;
  postGlowCanvas.height = n;
  const g = postGlowCanvas.getContext("2d");
  g.clearRect(0, 0, n, n);

  const layer = (inset, radius, color, blurPx) => {
    g.filter = "blur(" + blurPx * S + "px)";
    g.fillStyle = color;
    roundRectPath(g, inset * S, inset * S,
      (POST_GLOW_WORLD_SIZE - inset * 2) * S,
      (POST_GLOW_WORLD_SIZE - inset * 2) * S,
      radius * S);
    g.fill();
    g.filter = "none";
  };
  // The outer square is inset and then blurred back out, so its edge
  // lands near the full 7 tiles while staying soft. Its corner radius is
  // the one-tile cut asked for.
  layer(POST_GLOW_CORNER_CUT, POST_GLOW_CORNER_CUT * 1.6, PLAYER_GLOW_COLOR_MID, 13);
  layer(POST_GLOW_WORLD_SIZE * 0.32, POST_GLOW_CORNER_CUT * 0.7, PLAYER_GLOW_COLOR_INNER, 11);
  postGlowReady = true;
}

function drawPostLightGlows(camX, camY) {
  const night = getNightLightFactor();
  if (night <= 0.01) return; // daylight — the lamps are off
  if (!postGlowReady) buildPostGlowSprite();

  const size = POST_GLOW_WORLD_SIZE * zoom;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = night * POST_GLOW_MATCH_CANDLE;
  for (const [key, type] of objectLayer) {
    const def = itemDefs[type];
    if (!def || !def.lightGlow) continue;
    const comma = key.indexOf(",");
    const col = +key.slice(0, comma);
    const row = +key.slice(comma + 1);
    const wx = (col + 0.5) * TILE + def.lightGlow.offsetX;
    const wy = (row + 1) * TILE + def.lightGlow.offsetY;
    const sx = (wx - camX) * zoom - size / 2;
    const sy = (wy - camY) * zoom - size / 2;
    if (sx + size < 0 || sy + size < 0 || sx > view.width || sy > view.height) continue; // off-screen
    ctx.drawImage(postGlowCanvas, sx, sy, size, size);
  }
  ctx.restore();
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

/* ---------------- held-item ghost preview ----------------
   A see-through mock-up of whatever's held, drawn on the tile the mouse
   is pointing at — per request ("kahit anong na-hohold, yung mouse
   tinututok sa kahit aling tile, dapat parang naka-mockup siya kung ano
   itsura kapag binagsak... na naka-opacity").

   Before this the only preview was the tile OUTLINE, which tells you
   where a thing lands but nothing about how it will look: a tall tree,
   a wall panel and a rug all previewed as the same 16px square, even
   though their art is anchored bottom-centre and can tower several
   tiles above the tile you clicked. The ghost is drawn with the exact
   same anchor the real placement uses, so what you see is what you get.

   It goes red when the click would be refused, for the same reasons the
   outline already goes red — so the two can never disagree. */
const HELD_GHOST_ALPHA = 0.55;
const HELD_GHOST_BLOCKED_TINT = "rgba(220,40,40,0.55)";

const ghostCanvas = document.createElement("canvas");
const ghostCtx = ghostCanvas.getContext("2d");

// The icon, optionally washed red. Uses `source-atop` so the tint lands
// only on the art's own opaque pixels and the sprite keeps its shape,
// rather than staining the whole bounding box.
function buildHeldGhost(icon, blocked) {
  if (ghostCanvas.width !== icon.width || ghostCanvas.height !== icon.height) {
    ghostCanvas.width = icon.width;
    ghostCanvas.height = icon.height;
  }
  ghostCtx.setTransform(1, 0, 0, 1, 0, 0);
  ghostCtx.clearRect(0, 0, icon.width, icon.height);
  ghostCtx.drawImage(icon, 0, 0);
  if (blocked) {
    ghostCtx.globalCompositeOperation = "source-atop";
    ghostCtx.fillStyle = HELD_GHOST_BLOCKED_TINT;
    ghostCtx.fillRect(0, 0, icon.width, icon.height);
    ghostCtx.globalCompositeOperation = "source-over";
  }
  return ghostCanvas;
}

// Shared by the outdoor and indoor previews: draw `type`'s art at
// (col,row) with the bottom-centre anchor every placed object uses.
function drawHeldGhostAt(type, col, row, camX, camY, blocked) {
  const def = itemDefs[type];
  // Preview the art the player will actually get right now — the night
  // version once it's dark — and anchor it the same way, so the ghost
  // can't promise one position and the placed object land at another.
  const swap = nightSwapFor(type);
  const icon = swap ? swap.icon : def.icon;
  const root = swap ? swap.root : def.artRoot;
  if (!icon || !icon.width) return;
  const r = objectArtRect(icon, root, col, row, camX, camY);
  ctx.save();
  ctx.globalAlpha = HELD_GHOST_ALPHA;
  ctx.drawImage(buildHeldGhost(icon, blocked), r.x, r.y, r.w, r.h);
  ctx.restore();
}

// Outdoors. Only for `heldItem` — the E-key `player.grabbedType` flow
// drops things in FRONT of the player rather than under the cursor, so a
// ghost at the mouse would point at the wrong tile entirely.
function drawHeldItemGhost(camX, camY) {
  if (!heldItem) return;
  const type = heldItem.type;
  const def = itemDefs[type];
  const { col, row } = screenToTile(lastMouseClientX, lastMouseClientY);
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return;

  // Houses run through their own footprint rules; everything else is the
  // plain "is this tile free on my layer, and would it trap me" test —
  // the same pair drawPlacementRange() colours its outlines with.
  let blocked;
  if (def.multiTileFootprint && def.buildSeconds) {
    blocked = !canPlaceHouseFootprint(type, col, row);
  } else {
    const p = getPlayerTile();
    const occupied = getLayerItemId(layerForType(type), col, row) !== null;
    const wouldTrap = def.collides && col === p.col && row === p.row;
    blocked = occupied || wouldTrap || !isWithinPlacementRange(col, row);
  }
  drawHeldGhostAt(type, col, row, camX, camY, blocked);
}

// Indoors — same idea against the room's own maps and bounds.
function drawInteriorHeldItemGhost(room, camX, camY) {
  if (!heldItem) return;
  const type = heldItem.type;
  const def = itemDefs[type];
  if (def.multiTileFootprint) return; // refused indoors anyway (placeInteriorDecorAt())
  const { col, row } = screenToTile(lastMouseClientX, lastMouseClientY);
  const maxCol = Math.ceil(room.width / TILE) - 1;
  const maxRow = Math.ceil(room.height / TILE) - 1;
  if (col < 0 || row < 0 || col > maxCol || row > maxRow) return;

  const targetMap = def.interiorOnly ? room.collisions : room.decor;
  const p = interiorFeetTileAt(player.x, player.y);
  const blocked =
    targetMap.has(tileKey(col, row)) ||
    (def.interiorOnly && col === p.col && row === p.row) ||
    Math.max(Math.abs(col - p.col), Math.abs(row - p.row)) > PLACEMENT_RANGE;
  drawHeldGhostAt(type, col, row, camX, camY, blocked);
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
  // A room SMALLER than the screen gets centred rather than pinned to
  // the top-left — per request ("di naka-center yung camera ng room ng
  // house1"). The clamp below can only ever return 0 in that case
  // (`room.width - viewWorldW` is negative, and Math.max floors it at
  // 0), which pushed a small room hard against the left/top edge with
  // dead space filling the rest of the view. Offsetting by half the
  // difference — a NEGATIVE scroll — puts the room in the middle
  // instead. Rooms bigger than the screen still scroll and clamp exactly
  // as before.
  camX = room.width <= viewWorldW
    ? (room.width - viewWorldW) / 2
    : clamp(player.x - viewWorldW / 2, 0, room.width - viewWorldW);
  camY = room.height <= viewWorldH
    ? (room.height - viewWorldH) / 2
    : clamp(player.y - viewWorldH / 2, 0, room.height - viewWorldH);

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
  drawInteriorHeldItemGhost(room, camX, camY); // see-through mock-up of what's held, under the cursor — drawn BEFORE the grid so the outline stays readable on top of it
  drawInteriorPlacementRange(room, camX, camY); // white/red tile-border grid while holding something, same idea as drawPlacementRange() outdoors

  // Day/night sky tint indoors — per request ("kung ano yung dilim sa
  // labas kapag nagagagabi ganun din [sa loob]... nag fafade yung kulay
  // pa gabi tapos paumaga ganun din babalik lang sa normal color"): the
  // room used to stay the same brightness at 3am as at noon. This reuses
  // the EXACT same shared clock + easing (js/daynight.js's
  // getSkyOverlayColor()/getDayFactor()) the outdoor view uses, so the
  // room fades toward night and back to normal on the same smooth
  // twilight ramp, in lockstep with outside, instead of snapping.
  ctx.fillStyle = getSkyOverlayColor();
  ctx.fillRect(0, 0, vw, vh);
  drawNightBlueTint(); // same extra cool/moonlit wash the outdoor view gets at night, layered on top
  drawPlayerNightRelight(); // and the same relight, so the character keeps their colours indoors too

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
  drawHeldItemGhost(camX, camY); // see-through mock-up of what's held, under the cursor — drawn BEFORE the grid so the outline stays readable on top of it
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
  drawPlayerNightRelight(); // give the character back their real colours through those washes — see above
  drawPostLightGlows(camX, camY); // lamp light goes on LAST so it spills across the character too — per request, "naka-overlap yung light sa character"
  drawVignetteBlur(); // soft edge blur, all four sides, sunny daytime only — see above
  drawSceneFadeOverlay(); // interior enter/exit fade-to-black (js/interior.js) — drawn last, over absolutely everything
}
