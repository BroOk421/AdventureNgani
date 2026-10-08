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
let ctx = view.getContext("2d"); // `let`: js/chunks.js points it at a chunk canvas while baking the ground
ctx.imageSmoothingEnabled = false;

// Current camera top-left corner in world px — updated every render() call.
// Exposed at module scope (not local to render()) so inventory.js can
// convert a canvas click into world/tile coordinates for item placement.
let camX = 0;
let camY = 0;

function resizeCanvas() {
  // On a phone (js/mobile.js) the canvas is drawn at 1 canvas px per CSS px
  // instead of the full device resolution. A phone screen is 2.5-3x DPR, so
  // full resolution meant 6-9x more pixels to draw every frame (the lag),
  // and because ZOOM is in canvas px it also made the camera look far away.
  // At 1x, ZOOM_MIN (3.5) looks the same as on a desktop monitor. The pixel
  // art is scaled up by the browser with image-rendering: pixelated, so it
  // stays sharp.
  const isMobile = typeof MOBILE_ON !== "undefined" && MOBILE_ON;
  // Phones (Settings > Quality, js/mobile.js): "Smooth" draws at HALF resolution — a quarter of the
  // pixels every frame — with the camera zoom halved to match, so every art pixel is still exactly one
  // canvas pixel (then 2 screen px, image-rendering: pixelated): the picture looks the same, much faster.
  const mobileScale = isMobile && typeof MOBILE_RENDER_SCALE !== "undefined" ? MOBILE_RENDER_SCALE : 1;
  const dpr = isMobile ? mobileScale : (window.devicePixelRatio || 1);
  if (isMobile && typeof MOBILE_ZOOM !== "undefined") zoom = MOBILE_ZOOM * mobileScale;
  // Render at full device-pixel resolution so nothing gets upscaled/blurred
  // by the browser, then keep the CSS size at the window size.
  view.width = Math.round(window.innerWidth * dpr);
  view.height = Math.round(window.innerHeight * dpr);
  view.style.width = window.innerWidth + "px";
  view.style.height = window.innerHeight + "px";
  ctx.imageSmoothingEnabled = false; // resizing resets this on some browsers
}
window.addEventListener("resize", resizeCanvas);
// Phones: the window size can change without a plain "resize" (the app going
// full screen, the rotation settling) — catch those too, a frame later when
// the new size is actually in place.
const resizeSoon = () => requestAnimationFrame(resizeCanvas);
window.addEventListener("orientationchange", resizeSoon);
if (window.visualViewport) window.visualViewport.addEventListener("resize", resizeSoon);

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

  // Performance: the soft silhouette for this sheet frame is built ONCE and
  // cached (blurred in advance), instead of re-tinting it and running a
  // canvas blur filter on the main canvas for every character every frame.
  const silhouette = cachedSoftSilhouette(sheet, sx);

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
  ctx.globalAlpha = (typeof SUNLIGHT_ON !== "undefined" && SUNLIGHT_ON ? 0.5 : 0.32) * alpha; // darker with the cast shadows on (js/sunlight.js), to match them
  const pad = SOFT_SIL_PAD * size / FRAME_SIZE; // the cached canvas has blur room around the frame
  ctx.drawImage(silhouette, -size / 2 - pad, -size - pad, size + pad * 2, size + pad * 2);
  ctx.restore();
}

// Pre-blurred, pre-tinted silhouettes of character sheet frames, built at
// 2x so they stay smooth when scaled up. Keyed by sheet and frame offset.
const SOFT_SIL_RES = 2, SOFT_SIL_PAD = 3; // pad in frame px
const softSilCache = new Map();
function cachedSoftSilhouette(sheet, sx, fw = FRAME_SIZE, fh = FRAME_SIZE, blurFramePx = 0.75) {
  let perSheet = softSilCache.get(sheet);
  if (!perSheet) { perSheet = new Map(); softSilCache.set(sheet, perSheet); }
  let c = perSheet.get(sx);
  if (c) return c;
  const R = SOFT_SIL_RES, P = SOFT_SIL_PAD;
  const raw = document.createElement("canvas");
  raw.width = (fw + P * 2) * R; raw.height = (fh + P * 2) * R;
  const rg = raw.getContext("2d");
  rg.imageSmoothingEnabled = false;
  rg.drawImage(sheet, sx, 0, fw, fh, P * R, P * R, fw * R, fh * R);
  rg.globalCompositeOperation = "source-in";
  rg.fillStyle = "rgb(35,25,20)";
  rg.fillRect(0, 0, raw.width, raw.height);
  c = document.createElement("canvas");
  c.width = raw.width; c.height = raw.height;
  const g = c.getContext("2d");
  g.filter = "blur(" + (blurFramePx * R) + "px)";
  g.drawImage(raw, 0, 0);
  g.filter = "none";
  perSheet.set(sx, c);
  return c;
}

function drawHeldItemAboveHead(px, py, size, scale, g = ctx) {
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
  g.drawImage(icon, px - iconSize / 2, headY - iconSize - gapAboveHead, iconSize, iconSize);
}

function currentPlayerSheet() {
  const animKey = player.action || player.anim; // any active one-shot action (collect/crush/slice/...) overrides idle/walk/run
  // Carrying a customer's order (js/waiter.js) — its own pose.
  const orderSheet = typeof carryOrderSheet === "function" ? carryOrderSheet(animKey, player.facing) : null;
  if (orderSheet) return orderSheet;
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
const PLAYER_GLOW_RADIUS_SCALE = 1.3; // was 0.85 — per request ("kapag sa gabi yung circle light ng character, npcs ... medyo lakihan mo lang yung sakop"); // relative to the sprite's own size — "medyo malaki lang ng konti sa kanya"
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
// The carried candle (player, Maria, citizens) — per request ("medyo i
// opacity mo pa yung light niya parang aninag na lang... yung dulo ng
// circle medyo fade na"): fainter overall (CANDLE_OPACITY) and a long,
// smooth fall-off instead of the old 3-stop ramp, whose amber middle
// ended in a visible orange ring near the edge.
const CANDLE_OPACITY = 0.6;
// The candle's centre as it lands in the light buffer (first gradient
// stop's colour x its alpha) — its brightest point, used as its cap.
const CANDLE_PEAK_RGB = [217, 170, 111];
// The carried candles (player, Maria, townsfolk, keepers) keep their old look —
// a soft warm glow ADDED over the scene — in their own buffer (addCandleLight()),
// added after the night mask (flushNightMask()) instead of going into it.
const candleLightCanvas = document.createElement("canvas");
const candleLightCtx = candleLightCanvas.getContext("2d");
let candleLightsUsed = false;
const CANDLE_GLOW_BOOST = 2;
function addCandleLight(src, dx, dy, dw, dh, strength) {
  if (!src || strength <= 0.005 || dw <= 0 || dh <= 0) return;
  const S = SCENE_LIGHT_SCALE;
  const W = Math.max(1, Math.ceil(view.width * S)), H = Math.max(1, Math.ceil(view.height * S));
  if (candleLightCanvas.width !== W || candleLightCanvas.height !== H) { candleLightCanvas.width = W; candleLightCanvas.height = H; candleLightsUsed = false; }
  if (!candleLightsUsed) { candleLightCtx.clearRect(0, 0, W, H); candleLightsUsed = true; }
  candleLightCtx.globalCompositeOperation = "lighter";
  candleLightCtx.globalAlpha = Math.min(1, strength * CANDLE_GLOW_BOOST); // the night is darker under the mask, so the glow is a bit stronger to read the same
  candleLightCtx.drawImage(src, dx * S, dy * S, dw * S, dh * S);
  candleLightCtx.globalAlpha = 1;
  candleLightCtx.globalCompositeOperation = "source-over";
}
function flushCandleLights() {
  if (!candleLightsUsed) return;
  candleLightsUsed = false;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = SCENE_LIGHT_BRIGHTNESS;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(candleLightCanvas, 0, 0, candleLightCanvas.width / SCENE_LIGHT_SCALE, candleLightCanvas.height / SCENE_LIGHT_SCALE);
  ctx.restore();
}
const CANDLE_GRADIENT_STOPS = [
  [0.00, "rgba(255,200,130,0.85)"],
  [0.25, "rgba(255,186,110,0.66)"],
  [0.50, "rgba(255,168,90,0.38)"],
  [0.72, "rgba(255,150,70,0.16)"],
  [0.88, "rgba(255,135,55,0.05)"],
  [1.00, "rgba(255,120,40,0)"],
];

/* --- the owner's lights ---------------------------------------------
   Per request ("kapag yung sariling may ari ng bahay is nasa bahay nila
   like si maria is sa kanya yung tavern so iilaw yun kapag gabi na parang
   gaya lang sa umaga na kulay ng tavern_room tapos kapag natulog na siya
   nasa bed na is tyaka lang magdidilim"): while the person who lives in a
   room is home and AWAKE, the lights are on — the room keeps its daytime
   colours even at night. The moment they're in bed asleep, the lights go
   out and the room darkens to the normal night look.

   Maria is the only resident so far, and the only room she ever goes
   into is her own home (js/npc.js), so "she's in this room" is what
   "the owner is home" means. 0 = lights off (normal night), 1 = on.
   Eases over ROOM_OWNER_LIGHT_FADE_SEC rather than snapping, and snaps
   straight to the right value when the player walks into a room, so the
   fade never plays out behind the scene-change fade. */
//
// Updated per request ("dapat ganyan yung kulay hanggang gabi hanggat di
// pa tulog si maria kapag nasa bed na siya at natutulog tyka lang
// didilim yung kulay na parang ngayon na kulay kapag mga 8pm na"): while
// she's home, the room's look is decided by HER, not the clock at all:
//   - awake  -> the room's own original colours, at any hour
//   - asleep -> the full-night look (what the room looks like at 8pm),
//               even if she went to bed at 6pm while it's still dusk out
// When she isn't home, the room follows the clock like before.
const ROOM_OWNER_LIGHT_FADE_SEC = 1.5;
// The full-night washes, exactly as they are at 20:00 (SKY_KEYFRAMES'
// night colour + a full-strength NIGHT_BLUE_TINT, js/daynight.js).
const ROOM_NIGHT_SKY_COLOR = "rgba(18,30,86," + NIGHT_SKY_ALPHA + ")"; // same night darkness as outdoors (js/daynight.js) — a Stardew-like deep blue
// The two wash weights themselves are what's stored and eased — NOT
// "home" and "awake" separately. Easing those two independently and then
// multiplying them (home * (1 - awake)) made the dark wash bump up to
// ~25% halfway through Maria walking in, which read as the room
// flickering dark and both candles flashing on for a moment.
let roomClockWeight = 1;     // 0..1 — how much the clock-driven washes apply
let roomOwnerDarkWeight = 0; // 0..1 — how much the fixed 8pm (owner asleep) washes apply
let roomOwnerWasHome = false;
let roomOwnerLightRoomId = null;
let roomOwnerLightAt = 0;

// Who a room belongs to comes from its blueprint's `owner`
// (js/interior.js): "npc" for Maria's tavern, "player" for the
// player's own house (house_room) — per request, the house works for the
// player exactly the way the tavern works for Maria. Rooms with no owner
// (the abandoned house) just follow the clock.
function getRoomOwnerPresence(roomId) {
  const room = INTERIOR_ROOMS[roomId];
  const owner = room && room.owner;
  if (owner === "player") return { home: true, asleep: !!player.sleeping }; // you're the one looking at it, so you're home
  // Per request ("ganitong itsura dapat kapag gabi sa lahat"): every room gets the
  // night look now, the tavern too — no more "owner home = daytime colours";
  // its lamps and candles light it instead.
  return { home: false, asleep: false };
}

function getRoomOwnerState() {
  if (player.scene !== "inside") return { clock: 1, ownerDark: 0 };
  const roomId = player.activeRoomId;
  const presence = getRoomOwnerPresence(roomId);
  const home = presence.home;
  const targetClock = home ? 0 : 1;
  const targetDark = presence.asleep ? 1 : 0;
  const now = Date.now();
  // Snap straight to the right look — no fade — when the player has just
  // walked in (a different room, or the first indoor frame after being
  // outside), and when Maria walks in or out while the player is here:
  // per request, once she's in, the room is simply that colour.
  // Only her falling asleep / waking up (the lights going out or on)
  // eases, over ROOM_OWNER_LIGHT_FADE_SEC.
  const justEntered = roomId !== roomOwnerLightRoomId || now - roomOwnerLightAt > 500;
  if (justEntered || home !== roomOwnerWasHome) {
    roomClockWeight = targetClock;
    roomOwnerDarkWeight = targetDark;
    roomOwnerLightRoomId = roomId;
  } else if (now !== roomOwnerLightAt) {
    const k = Math.min(1, (now - roomOwnerLightAt) / 1000 / ROOM_OWNER_LIGHT_FADE_SEC); // linear, never overshoots
    const toward = (v, t) => (Math.abs(t - v) <= k ? t : v + Math.sign(t - v) * k);
    roomClockWeight = toward(roomClockWeight, targetClock);
    roomOwnerDarkWeight = toward(roomOwnerDarkWeight, targetDark);
  }
  roomOwnerWasHome = home;
  roomOwnerLightAt = now;
  return { clock: roomClockWeight, ownerDark: roomOwnerDarkWeight };
}

// How the room should be washed right now:
//   clock     — strength of the normal clock-driven washes (0..1)
//   ownerDark — strength of the fixed 8pm washes (0..1)
//   relight   — how strongly characters need their colours restored
//   candle    — how bright the carried candle should be
// Cached per frame so every caller (the washes, both relights, both
// candles) sees exactly the same numbers.
let indoorLightingCache = null;
let indoorLightingCacheAt = -1;
let indoorLightingCacheRoom = null;
function getIndoorLighting() {
  const now = Date.now();
  if (indoorLightingCache && now === indoorLightingCacheAt && indoorLightingCacheRoom === player.activeRoomId) return indoorLightingCache;
  const s = getRoomOwnerState();
  const clock = s.clock;
  const ownerDark = s.ownerDark;
  indoorLightingCacheAt = now;
  indoorLightingCacheRoom = player.activeRoomId;
  return indoorLightingCache = {
    clock,
    ownerDark,
    relight: Math.min(1, clock * (1 - getDayFactor()) + ownerDark),
    candle: Math.min(1, clock * getNightLightFactor() + ownerDark),
  };
}

// Caves (the tunnel, the old caves, every mine level): no daylight down
// there — always the same blue-ish dark, lamps and candles always lit.
// Per request ("sa cave is liwanagan na yung ilaw yung buong map ... mapa umaga or gabi"):
// the whole cave is lit now, day or night — just a light cave dim (was 0.78 + a fog
// round the player), the lamps and candles a soft warm accent on top.
const CAVE_DARKNESS = 0.2, CAVE_CANDLE = 0.45;
{
  const base = getIndoorLighting;
  getIndoorLighting = function () {
    const room = player.scene === "inside" && INTERIOR_ROOMS[player.activeRoomId];
    if (room && room.custom && room.custom.floor === "cave") {
      return { clock: 0, ownerDark: CAVE_DARKNESS, relight: CAVE_DARKNESS, candle: CAVE_CANDLE };
    }
    return base.apply(this, arguments);
  };
}

// How strongly to restore the characters' own colours this frame.
function getRelightStrength() {
  return player.scene === "inside" ? getIndoorLighting().relight : 1 - getDayFactor();
}

/* --- one shared light buffer: lights MERGE instead of stacking -------
   Per request ("dapat di mag overdrive yung kulay ng bawat lights... kung
   magtamaan is parang mag merge lang yung kulay"): every light used to
   be added straight onto the scene on its own, so where two overlapped —
   the player's candle under a lamp, Maria's candle next to yours, two
   lamps side by side — their brightness summed and blew out to yellow-
   white, and the character in the middle got it worst.

   Now every light (both candles and every lamp) is drawn into ONE
   off-screen buffer first, combined with "lighten" — per pixel, the
   brighter of the two wins, nothing is summed — and that single merged
   buffer is added to the scene once. Where lights overlap they simply
   join into one pool at the strength of the stronger light.

   Each light is pre-multiplied onto opaque black before it goes in: with
   no transparency involved, "lighten" is an exact per-channel max.

   The buffer is flushed BEFORE the characters' night relight, so the
   characters themselves are never brightened past their own colours —
   the light falls on the ground and objects around them.

   Half resolution: every light is a soft blurred glow, so this costs
   nothing visible and a quarter of the pixels. */
const SCENE_LIGHT_SCALE = 0.5;
const sceneLightCanvas = document.createElement("canvas");
const sceneLightCtx = sceneLightCanvas.getContext("2d");
const sceneLightTmp = document.createElement("canvas");
const sceneLightTmpCtx = sceneLightTmp.getContext("2d");
// The per-pixel CAP: for every pixel, the peak colour of the brightest
// light that reaches it. The summed lights are clipped to this in
// flushSceneLights() (see addSceneLight()).
const sceneLightCapCanvas = document.createElement("canvas");
const sceneLightCapCtx = sceneLightCapCanvas.getContext("2d");
let sceneLightsUsed = false;
let sceneLightsCleanOnce = false; // the first frame clears both buffers whole
let sceneLightMaxStrength = 0;

/* Per request ("kapag nag merge is lumiliit... kapag nagtamaan di mo
   halata na may bounderies sila... mas malaki ang sakop pero iisa lang
   yung kulay... di siya liliwanag ng sobra" + "yung character parang
   nilalamon yung ilaw"): the old per-pixel MAX ("lighten") had two
   faults. Where two pools met, the max of two falloffs left a visible
   dark crease between them — the boundary you could see. And a weaker
   light inside a stronger one simply vanished: walk the candle into a
   lamp's pool and your own circle disappeared, as if the lamp ate it.

   Now lights are SUMMED into the buffer ("lighter") and the total is
   then capped at the brightest a single light ever gets — the lamp's
   core colour ("darken" with a flat fill = per-channel min). So:
     - overlapping edges add up and fill in smoothly — no crease, the
       combined pool covers more ground and reads as ONE light;
     - nowhere ends up brighter or whiter than one light's own centre,
       and the cap is the core's own warm colour, so the hue holds;
     - the candle still shows wherever the lamp is less than full, and
       inside a lamp's core the two are simply one light. */
// Overall brightness of every light (candles + lamp posts) — per request
// ("bawasan mo ng konti yung lightness siguro -10%"). 1 = the old look.
const SCENE_LIGHT_BRIGHTNESS = 0.9; // additive lights (daytime / no night mask); at night they lift the multiply mask instead (flushNightMask())
const SCENE_LIGHT_CAP_RGB = [250, 193, 120]; // a lamp's core, pre-multiplied (inner 0.95 over mid 0.60 — buildPostGlowSprite())

// Phones: the light buffers are only touched where lights actually went this
// frame (sceneLightRect, buffer px) — cleared there next frame and added to
// the scene only there, instead of two whole buffers cleared and a whole
// screen blended in every frame (outside the lights the buffer is black, which
// adds nothing). Same picture; at night most of the screen has no light.
let sceneLightRect = null, sceneLightPrevRect = null;
function growSceneLightRect(x, y, w, h) {
  const r = sceneLightRect;
  if (!r) { sceneLightRect = { x0: x, y0: y, x1: x + w, y1: y + h }; return; }
  if (x < r.x0) r.x0 = x; if (y < r.y0) r.y0 = y;
  if (x + w > r.x1) r.x1 = x + w; if (y + h > r.y1) r.y1 = y + h;
}
function beginSceneLights() {
  const w = Math.max(1, Math.ceil(view.width * SCENE_LIGHT_SCALE));
  const h = Math.max(1, Math.ceil(view.height * SCENE_LIGHT_SCALE));
  let resized = false;
  if (sceneLightCanvas.width !== w || sceneLightCanvas.height !== h) {
    sceneLightCanvas.width = w;
    sceneLightCanvas.height = h;
    resized = true;
  }
  if (sceneLightCapCanvas.width !== w || sceneLightCapCanvas.height !== h) {
    sceneLightCapCanvas.width = w;
    sceneLightCapCanvas.height = h;
    resized = true;
  }
  const phone = isMobileMode();
  const prev = sceneLightRect || sceneLightPrevRect; // what last frame touched (flush may not have run)
  sceneLightPrevRect = null;
  sceneLightRect = null;
  let cx = 0, cy = 0, cw = w, ch = h;
  if (phone && !resized && sceneLightsCleanOnce) {
    if (!prev) { sceneLightsUsed = false; sceneLightMaxStrength = 0; return; } // nothing was lit: both buffers are still black
    cx = Math.max(0, Math.floor(prev.x0) - 1); cy = Math.max(0, Math.floor(prev.y0) - 1);
    cw = Math.min(w, Math.ceil(prev.x1) + 1) - cx; ch = Math.min(h, Math.ceil(prev.y1) + 1) - cy;
  }
  sceneLightsCleanOnce = true;
  sceneLightCtx.globalCompositeOperation = "source-over";
  sceneLightCtx.fillStyle = "#000";
  if (cw > 0 && ch > 0) sceneLightCtx.fillRect(cx, cy, cw, ch);
  sceneLightCapCtx.globalCompositeOperation = "source-over";
  sceneLightCapCtx.fillStyle = "#000";
  if (cw > 0 && ch > 0) sceneLightCapCtx.fillRect(cx, cy, cw, ch);
  sceneLightsUsed = false;
  sceneLightMaxStrength = 0;
}

// Adds one light (a transparent glow image) at a screen rect, at a
// strength of 0..1.
// `peakRGB` = the light's own brightest colour (its centre, already
// multiplied by its alpha there) — defaults to a lamp's core.
// Phones: a lamp with something in front of it (cut out of its light) is
// composited once and kept (lampLightCache), keyed by everything that
// changes the picture — the lamp's shadowed pool, its strength, and each
// cut-out's picture + position relative to the lamp. A still scene reuses
// it every frame (one blit) instead of 5 big scratch-canvas operations per
// lamp per frame.
const lampLightCache = new Map(); // key -> { sig, canvas }
const lightIconIds = new WeakMap(); let lightIconNext = 1;
function lightIconId(icon) { let id = lightIconIds.get(icon); if (!id) { id = lightIconNext++; lightIconIds.set(icon, id); } return id; }
function addSceneLight(src, dx, dy, dw, dh, strength, peakRGB, cutouts, cache) {
  if (!src || strength <= 0.005 || dw <= 0 || dh <= 0) return;
  const S = SCENE_LIGHT_SCALE;
  const x = Math.floor(dx * S), y = Math.floor(dy * S);
  const w = Math.ceil(dw * S) + 2, h = Math.ceil(dh * S) + 2;
  if (x + w < 0 || y + h < 0 || x > sceneLightCanvas.width || y > sceneLightCanvas.height) return;
  const pk0 = peakRGB || SCENE_LIGHT_CAP_RGB, st0 = Math.min(1, strength);
  const phone = isMobileMode();
  if (phone && cutouts && cutouts.length) { // only cut-outs that actually overlap this light
    const keep = [];
    for (const o of cutouts) if (!(o.x * S - x > w || (o.x + o.w) * S - x < 0 || o.y * S - y > h || (o.y + o.h) * S - y < 0)) keep.push(o);
    cutouts = keep;
  }
  let cacheEntry = null, cacheSig = null;
  if (phone && cache && cutouts && cutouts.length) {
    cacheSig = cache.srcSig + "|" + w + "x" + h + "|" + st0.toFixed(3) + "|" + ((dx * S - x) * 4 | 0) + "," + ((dy * S - y) * 4 | 0);
    for (const o of cutouts) cacheSig += "|" + lightIconId(o.icon) + "@" + Math.round(o.x * S - x) + "," + Math.round(o.y * S - y) + "," + Math.round(o.w * S) + "," + Math.round(o.h * S) + "," + (o.alpha == null ? 1 : o.alpha);
    cacheEntry = lampLightCache.get(cache.key);
    if (cacheEntry && cacheEntry.sig === cacheSig) {
      sceneLightCtx.globalCompositeOperation = "lighter";
      sceneLightCtx.drawImage(cacheEntry.canvas, 0, 0, w, h, x, y, w, h);
      sceneLightCapCtx.globalCompositeOperation = "lighten";
      sceneLightCapCtx.fillStyle = "rgb(" + Math.round(pk0[0] * st0) + "," + Math.round(pk0[1] * st0) + "," + Math.round(pk0[2] * st0) + ")";
      sceneLightCapCtx.fillRect(x, y, w, h);
      sceneLightsUsed = true; growSceneLightRect(x, y, w, h);
      sceneLightMaxStrength = Math.max(sceneLightMaxStrength, st0);
      return;
    }
  }
  if (!cutouts || !cutouts.length) {
    // Performance: the buffer is opaque black and lights ADD, so drawing the
    // light straight in at globalAlpha = strength gives exactly what the
    // scratch-canvas route below does (premultiply on black, scale, add) —
    // without its two full-rect fills and extra copy.
    sceneLightCtx.globalCompositeOperation = "lighter";
    sceneLightCtx.globalAlpha = st0;
    sceneLightCtx.drawImage(src, dx * S, dy * S, dw * S, dh * S);
    sceneLightCtx.globalAlpha = 1;
    sceneLightCapCtx.globalCompositeOperation = "lighten";
    sceneLightCapCtx.fillStyle = "rgb(" + Math.round(pk0[0] * st0) + "," + Math.round(pk0[1] * st0) + "," + Math.round(pk0[2] * st0) + ")";
    sceneLightCapCtx.fillRect(x, y, w, h);
    sceneLightsUsed = true; growSceneLightRect(x, y, w, h);
    sceneLightMaxStrength = Math.max(sceneLightMaxStrength, st0);
    return;
  }
  if (sceneLightTmp.width < w || sceneLightTmp.height < h) {
    sceneLightTmp.width = Math.max(sceneLightTmp.width, w);
    sceneLightTmp.height = Math.max(sceneLightTmp.height, h);
  }
  const g = sceneLightTmpCtx;
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  g.drawImage(src, dx * S - x, dy * S - y, dw * S, dh * S); // pre-multiply onto black
  // Things standing IN FRONT of this light (a lamp post behind a tree):
  // their silhouettes are painted black here, which on this additive
  // buffer simply means "no light" — so the tree stays dark over the pool
  // instead of the glow showing through it. Screen-space rects, same
  // shape relightOccluders() returns.
  if (cutouts && cutouts.length) {
    for (const o of cutouts) {
      if (o.x * S - x > w || (o.x + o.w) * S - x < 0 || o.y * S - y > h || (o.y + o.h) * S - y < 0) continue;
      const sil = getOccluderSilhouette(o.icon);
      if (!sil) continue;
      g.globalAlpha = o.alpha == null ? 1 : o.alpha;
      g.drawImage(sil, o.x * S - x, o.y * S - y, o.w * S, o.h * S);
    }
    g.globalAlpha = 1;
  }
  g.fillStyle = "rgba(0,0,0," + (1 - Math.min(1, strength)) + ")"; // then scale by strength
  g.fillRect(0, 0, w, h);
  // SUMMED, then capped per pixel (flushSceneLights()) — per request:
  //  - "light to light" leaves no dark seam between two pools: a plain
  //    per-pixel max made the spot between two lights dimmer than either
  //    light's own middle, which read as a shadow line. Adding them fills
  //    that valley in, so overlapping pools join into one smooth light;
  //  - but it never gets brighter than one light alone: each light also
  //    writes its peak colour over its rect into the cap buffer (max),
  //    and the sum is clipped to that — two candles top out at one
  //    candle's centre, a candle under a lamp at the lamp's.
  sceneLightCtx.globalCompositeOperation = "lighter";
  sceneLightCtx.drawImage(sceneLightTmp, 0, 0, w, h, x, y, w, h);
  if (cacheSig) { // keep this lamp's finished light for the next frames (phones)
    if (!cacheEntry) { cacheEntry = { sig: null, canvas: document.createElement("canvas") }; lampLightCache.set(cache.key, cacheEntry); }
    const cv = cacheEntry.canvas;
    if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); }
    const cg = cv.getContext("2d");
    cg.globalCompositeOperation = "copy";
    cg.drawImage(sceneLightTmp, 0, 0, w, h, 0, 0, w, h);
    cg.globalCompositeOperation = "source-over";
    cacheEntry.sig = cacheSig;
    if (lampLightCache.size > 48) lampLightCache.delete(lampLightCache.keys().next().value);
  }
  const pk = peakRGB || SCENE_LIGHT_CAP_RGB, st = Math.min(1, strength);
  sceneLightCapCtx.globalCompositeOperation = "lighten";
  sceneLightCapCtx.fillStyle = "rgb(" + Math.round(pk[0] * st) + "," + Math.round(pk[1] * st) + "," + Math.round(pk[2] * st) + ")";
  sceneLightCapCtx.fillRect(x, y, w, h);
  sceneLightsUsed = true; growSceneLightRect(x, y, w, h);
  sceneLightMaxStrength = Math.max(sceneLightMaxStrength, Math.min(1, strength));
}

// Adds the merged lights to the scene, once.
function flushSceneLights() {
  if (nightMulPending) { flushNightMask(); flushCandleLights(); return; }
  flushCandleLights();
  if (!sceneLightsUsed) return;
  const W = sceneLightCanvas.width, H = sceneLightCanvas.height;
  // Phones: only the part of the buffer this frame's lights touched (+1px for
  // the smoothing); everything else in it is black and adds nothing.
  let x0 = 0, y0 = 0, x1 = W, y1 = H;
  const r = isMobileMode() && sceneLightRect;
  if (r) {
    x0 = Math.max(0, Math.floor(r.x0) - 1); y0 = Math.max(0, Math.floor(r.y0) - 1);
    x1 = Math.min(W, Math.ceil(r.x1) + 1); y1 = Math.min(H, Math.ceil(r.y1) + 1);
    if (x1 <= x0 || y1 <= y0) { sceneLightsUsed = false; return; }
  }
  // Clip the summed lights to the per-pixel cap (per-channel min).
  sceneLightCtx.globalCompositeOperation = "darken";
  sceneLightCtx.drawImage(sceneLightCapCanvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  sceneLightCtx.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = SCENE_LIGHT_BRIGHTNESS; // additive, so this scales how much light is added
  ctx.imageSmoothingEnabled = true;
  const k = 1 / SCENE_LIGHT_SCALE;
  ctx.drawImage(sceneLightCanvas, x0, y0, x1 - x0, y1 - y0, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k);
  ctx.restore();
  sceneLightsUsed = false;
}

// The night mask: blue multiply, with this frame's lights added into it
// (capped at white), multiplied over the scene once.
function flushNightMask() {
  const mul = nightMulPending;
  nightMulPending = null;
  const W = sceneLightCanvas.width, H = sceneLightCanvas.height;
  if (nightMaskCanvas.width !== W || nightMaskCanvas.height !== H) { nightMaskCanvas.width = W; nightMaskCanvas.height = H; }
  const g = nightMaskCtx;
  g.globalCompositeOperation = "copy";
  g.fillStyle = "rgb(" + mul.map((v) => Math.round(v * 255)).join(",") + ")";
  g.fillRect(0, 0, W, H);
  if (sceneLightsUsed) {
    sceneLightCtx.globalCompositeOperation = "darken"; // clip the summed lights to their cap, as before
    sceneLightCtx.drawImage(sceneLightCapCanvas, 0, 0);
    sceneLightCtx.globalCompositeOperation = "source-over";
    // light^2 (each pool falls off faster at its rim -> distinct warm circles), then lifted
    sceneLightCtx.globalCompositeOperation = "multiply";
    sceneLightCtx.drawImage(sceneLightCanvas, 0, 0);
    sceneLightCtx.globalCompositeOperation = "source-over";
    // lifted into a scratch buffer, then merged into the mask per channel with "lighten" (max):
    // a pool turns the blue mask toward the light's own warm colour instead of toward white/pink
    if (sceneLightTmp.width < W || sceneLightTmp.height < H) { sceneLightTmp.width = Math.max(sceneLightTmp.width, W); sceneLightTmp.height = Math.max(sceneLightTmp.height, H); }
    const t = sceneLightTmpCtx;
    t.globalCompositeOperation = "copy"; t.globalAlpha = 1;
    // brightness only (the colour comes from NIGHT_LIGHT_RGB below), lifted x NIGHT_LIGHT_LIFT in one pass
    t.filter = "grayscale(1) brightness(" + NIGHT_LIGHT_LIFT + ")";
    t.drawImage(sceneLightCanvas, 0, 0, W, H, 0, 0, W, H);
    t.filter = "none";
    t.globalCompositeOperation = "multiply"; // a warm lamplight colour
    t.fillStyle = NIGHT_LIGHT_RGB;
    t.fillRect(0, 0, W, H);
    t.globalCompositeOperation = "source-over";
    g.globalCompositeOperation = "lighten";
    g.drawImage(sceneLightTmp, 0, 0, W, H, 0, 0, W, H);
  }
  g.globalCompositeOperation = "source-over";
  ctx.save();
  if (nightAmbientK > 0.001) { // moonlight: a little blue added first, so even blue-less colours (grass, wood) lean blue
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgb(" + NIGHT_AMBIENT_RGB.map((c) => Math.round(c * nightAmbientK)).join(",") + ")";
    ctx.fillRect(0, 0, view.width, view.height);
  }
  nightAmbientK = 0;
  ctx.globalCompositeOperation = "multiply";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(nightMaskCanvas, 0, 0, W, H, 0, 0, W / SCENE_LIGHT_SCALE, H / SCENE_LIGHT_SCALE);
  ctx.restore();
  sceneLightsUsed = false;
}
const NIGHT_LIGHT_LIFT = 10;
const NIGHT_LIGHT_RGB = "rgb(255,226,168)"; // the warm colour a lit pool turns the night toward // how strongly a light lifts the night mask toward its own warm colour

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
  // Performance (phones): getImageData() on a normal (GPU) canvas makes the
  // browser stop and wait for the graphics chip to finish EVERYTHING it was
  // drawing, then copy pixels back — measured at hundreds of ms per call.
  // A walking citizen / animal shows a new animation frame -> a new icon ->
  // one of those stalls each time: the big lag spikes at night.
  //  - a canvas source (citizen / animal frames, snowy copies): the shape is
  //    made with compositing only, entirely on the GPU, no read-back;
  //  - an image file: its pixels are read on a CPU-side scratch canvas
  //    (willReadFrequently), which never touches the GPU.
  const isCanvasSource = typeof HTMLCanvasElement !== "undefined" && icon instanceof HTMLCanvasElement;
  if (!isCanvasSource) {
    try {
      const s = document.createElement("canvas");
      s.width = icon.width;
      s.height = icon.height;
      const sc = s.getContext("2d", { willReadFrequently: true });
      sc.drawImage(icon, 0, 0);
      // Keep ONLY the sprite's real pixels, flattened to solid black. Faint
      // pixels (soft glows, anti-aliased halos, near-invisible padding) are
      // dropped entirely rather than kept at their low alpha — projected a
      // few dozen times each, those faint pixels were what filled a sprite's
      // empty deadspace with a grey box.
      const img = sc.getImageData(0, 0, icon.width, icon.height);
      const px = img.data;
      for (let i = 0; i < px.length; i += 4) {
        const solid = px[i + 3] >= 128;
        px[i] = px[i + 1] = px[i + 2] = 0;
        px[i + 3] = solid ? 255 : 0;
      }
      sc.putImageData(img, 0, 0);
      cc.drawImage(s, 0, 0); // one upload into a normal canvas, then it's drawn from the GPU like any sprite
      OCCLUDER_SILHOUETTE_CACHE.set(icon, c);
      return c;
    } catch (e) {
      // file:// can taint the canvas in some browsers — fall back below
    }
  }
  // The plain alpha-shape silhouette (pixel-art frames are fully opaque or
  // fully clear anyway).
  cc.clearRect(0, 0, icon.width, icon.height);
  cc.drawImage(icon, 0, 0);
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
const NPC_LIGHT_MAX_OCCLUDERS = 6;   // other people's candles: nearest few casters only
const NPC_LIGHT_SHADOW_MAX_STEPS = 14;
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
// `opts.excludeKey` skips one placed item by its "col,row" key (a lamp
// never shadows its own light), `opts.maxOccluders` overrides the cap
// (a lamp's pool is much wider than the candle's, so it needs more).
// Is any pixel of `icon` within `r` px of (px, py) (icon-local) opaque?
// Alpha read once per image and cached; if the pixels can't be read
// (a file:// page taints the canvas) it answers true, which is the old
// "anywhere in the box" behaviour.
const iconAlphaCache = new Map(); // Image -> { w, h, a: Uint8Array } | null
function iconOpaqueNear(icon, px, py, r) {
  let e = iconAlphaCache.get(icon);
  if (e === undefined) {
    e = null;
    if (icon.width && icon.height) {
      try {
        const c = document.createElement("canvas");
        c.width = icon.width;
        c.height = icon.height;
        const g = c.getContext("2d", { willReadFrequently: true }); // CPU-side: reading it back never stalls the GPU
        g.drawImage(icon, 0, 0);
        const d = g.getImageData(0, 0, icon.width, icon.height).data;
        const a = new Uint8Array(icon.width * icon.height);
        for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
        e = { w: icon.width, h: icon.height, a };
      } catch (err) {
        e = null;
      }
      iconAlphaCache.set(icon, e);
    }
  }
  if (!e) return true;
  const x0 = Math.max(0, Math.floor(px - r)), x1 = Math.min(e.w - 1, Math.floor(px + r));
  const y0 = Math.max(0, Math.floor(py - r)), y1 = Math.min(e.h - 1, Math.floor(py + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) if (e.a[y * e.w + x] > 20) return true;
  }
  return false;
}

/* --- Performance: row buckets of a layer ---------------------------------
   The relights (every character, animal, lamp at night) and the light
   shadows used to walk EVERY placed item on the map, several times a frame
   — the biggest cost on a phone. Each layer now keeps (per purpose) a
   Map row -> [[col, type, key], ...] of just the items that matter, rebuilt
   only when the layer changes (its set/delete/clear bump a version). */
const layerVersions = new WeakMap();
for (const L of new Set([...ALL_LAYERS, objectLayer, groundLayer, groundOverlayLayer, upperLayer])) {
  layerVersions.set(L, 0);
  const bump = () => layerVersions.set(L, (layerVersions.get(L) || 0) + 1);
  const set = L.set, del = L.delete, clr = L.clear;
  L.set = function () { bump(); return set.apply(this, arguments); };
  L.delete = function () { bump(); return del.apply(this, arguments); };
  L.clear = function () { bump(); return clr.apply(this, arguments); };
}
const rowIndexCache = new Map(); // tag -> { layer, ver, rows }
function layerRows(layer, tag, keep) {
  const ver = layerVersions.get(layer) || 0;
  let e = rowIndexCache.get(tag);
  if (e && e.layer === layer && e.ver === ver) return e.rows;
  const rows = new Map();
  for (const [key, type] of layer) {
    if (!keep(type)) continue;
    const comma = key.indexOf(",");
    const col = +key.slice(0, comma), row = +key.slice(comma + 1);
    let a = rows.get(row);
    if (!a) rows.set(row, (a = []));
    a.push([col, type, key]);
  }
  rowIndexCache.set(tag, { layer, ver, rows });
  return rows;
}

function collectLightOccluders(worldCX, worldCY, worldRadius, opts) {
  const excludeKey = opts && opts.excludeKey;
  const maxOccluders = (opts && opts.maxOccluders) || LIGHT_MAX_OCCLUDERS;
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
    // Per request ("alisin yung mga deadspace para di halatang box"):
    // only things that actually STAND in the room throw a shadow now.
    // Left out, because each one threw a flat rectangle across the floor
    // and wall that nothing visible explains:
    //   - wall decor, things on top of furniture and ceiling tiles
    //     (layers 4, 5, 6) — signs, frames, windows, Interior Wall tiles
    //     are part of the wall surface, so the light falls ON them;
    //   - `flat` items (rugs, mats) lying on the floor;
    //   - Collision Blocks — invisible by design, so their shadow was a
    //     bare 16x16 box with no art to explain it.
    for (const [key, type] of room.decor) {
      const def = itemDefs[type];
      if (!def) continue;
      const layerN = layerNumberForType(type);
      if (layerN === 4 || layerN === 5 || layerN === 6) continue;
      if (def.flat && !def.collides) continue;
      // The shop / tavern counter (bartender* pieces) throws no shadow — per request
      // ("may isa jan na table ... meron ilaw yung taas dapat hindi magkaroon ilaw"):
      // a light standing right at the counter dropped one piece (light inside it) but
      // not its neighbours, which left a bright wedge across the counter top. The
      // counter is cut out of the light instead (counterLightCutouts()).
      if (/^bartender/.test(type)) continue;
      const [col, row] = key.split(",").map(Number);
      pushSprite(type, col, row);
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
    // Performance: look up only the tiles in reach of the light instead of
    // walking every placed item on the map for every candle and lamp.
    if (isMobileMode()) { // phones: the row-bucket version (same result, far less work)
    ALL_LAYERS.forEach((layer, li) => {
      const rows = layerRows(layer, "occ" + li, (type) => {
        const def = itemDefs[type];
        if (!def) return false;
        // anything solid blocks light, `castsLightShadow` items opt in (bushes, mushrooms, flowers);
        // not the plateau tops (`noLightShadow`), nothing flat on layers 1-2 but the water crates
        if (!def.collides && !def.castsLightShadow) return false;
        if (def.noLightShadow) return false;
        if ((layer === dirtLayer || layer === groundLayer) && !def.depthBand) return false;
        return true;
      });
      for (let row = minRow; row <= maxRow; row++) {
        const a = rows.get(row);
        if (!a) continue;
        for (const [col, type, key] of a) {
          if (col < minCol || col > maxCol || key === excludeKey) continue;
          pushSprite(type, col, row);
        }
      }
    });
    } else {
    const span = (maxCol - minCol + 1) * (maxRow - minRow + 1);
    for (const layer of ALL_LAYERS) {
      const entries = layer.size <= span ? layer : null;
      const iter = entries ? entries.entries() : (function* () {
        for (let r = minRow; r <= maxRow; r++) for (let c = minCol; c <= maxCol; c++) {
          const k = c + "," + r, t = layer.get(k);
          if (t !== undefined) yield [k, t];
        }
      })();
      for (const [key, type] of iter) {
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
        // Per request: the mountain plateau tiles (top / inner / center /
        // bottom mountain grass, `noLightShadow`, js/inventory.js) are the
        // ground you walk on up there, not something standing in the light.
        if (def.noLightShadow) continue;
        // Per request: nothing on layers 1 and 2 (dirt, the ground —
        // grass, water, port tiles) throws a shadow. The Water Crates
        // live on layer 2 by name but are real objects, so they keep one.
        if ((layer === dirtLayer || layer === groundLayer) && !def.depthBand) continue;
        if (key === excludeKey) continue;
        const comma = key.indexOf(",");
        const col = +key.slice(0, comma);
        const row = +key.slice(comma + 1);
        if (col < minCol || col > maxCol || row < minRow || row > maxRow) continue;
        pushSprite(type, col, row);
      }
    }
    }
  }

  // Drop anything whose picture the light is sitting INSIDE of — a
  // character standing behind a table or a tree, a lamp whose pool
  // centre is tucked behind something. Projected from a point inside
  // the silhouette, the "shadow" covers the entire pool, so the candle
  // simply vanished the moment you walked behind furniture. Something
  // you're behind shouldn't swallow your own light.
  //
  // Tested against the art's real pixels, not its whole picture box: a
  // tree's box is mostly empty space around the canopy and trunk, so
  // standing anywhere near a tree (bare or leafy) used to count as
  // "inside" it and its shadow disappeared at night. Only a light that's
  // actually over the tree's own pixels drops it now.
  for (let i = out.length - 1; i >= 0; i--) {
    const o = out[i];
    if (worldCX >= o.x && worldCX <= o.x + o.w && worldCY >= o.y && worldCY <= o.y + o.h &&
        iconOpaqueNear(o.icon, worldCX - o.x, worldCY - o.y, 0)) out.splice(i, 1);
  }

  // Farm animals in the light throw a shadow too (js/animals.js) — only
  // for the lights that ask for them. Added after the drop above because
  // their art isn't 1 art px = 1 world px; animalLightOccluders() does
  // its own "light inside the animal" test.
  if (opts && opts.withAnimals && player.scene !== "inside" && typeof animalLightOccluders === "function") {
    for (const o of animalLightOccluders(minX, minY, maxX, maxY, worldCX, worldCY)) out.push(o);
  }

  // Nearest-first, capped — a hard ceiling on how much work one frame can
  // ask for no matter how densely the player has built.
  if (out.length > maxOccluders) {
    out.sort((a, b) => {
      const da = Math.hypot(a.x + a.w / 2 - worldCX, a.y + a.h / 2 - worldCY);
      const db = Math.hypot(b.x + b.w / 2 - worldCX, b.y + b.h / 2 - worldCY);
      return da - db;
    });
    out.length = maxOccluders;
  }
  return out;
}

// The glow, generalised to any character: `px`/`py` are where its centre
// lands on screen, `size` its sprite's drawn size, and `worldX`/`worldY`
// the same point in WORLD coordinates (what the shadow-casting pass
// below measures occluders against). Split out from drawPlayerGlow()
// so the NPC can carry an identical light — per request ("yung npc
// lagyan mo rin ng circle light parang kagaya sa character parang
// duplicate lang yung circle light"). Everything about it is shared:
// same colours, same radius rule, same night-only ramp, same wall
// shadows — the only difference is whose position it's centred on.
function drawCharacterGlow(px, py, size, worldX, worldY) {
  // Night only, 18:00-06:00 — see getNightLightFactor() above.
  // In a room whose owner is home with the lights on, nobody needs a
  // candle — it fades out with the room's lights coming on.
  const darkness = player.scene === "inside" ? getIndoorLighting().candle : getNightLightFactor();
  if (darkness <= 0.02) return;

  const screenRadius = size * PLAYER_GLOW_RADIUS_SCALE; // screen px
  // Performance: the candle (its light AND its shadow mask) is built at the
  // light buffer's own resolution (SCENE_LIGHT_SCALE — half) instead of full
  // screen px. It ends up in that half-res buffer anyway, so nothing is
  // lost, and the projection + blur work on a quarter of the pixels.
  const Q = SCENE_LIGHT_SCALE;
  const radius = screenRadius * Q; // canvas px
  const zq = zoom * Q;             // world px -> canvas px
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
  const worldRadius = screenRadius / zoom;
  // Performance: the player's own candle keeps full detail; everyone else's
  // (Maria, the townsfolk) uses the nearest few shadow casters and fewer
  // projection steps — they're small, soft and usually off to the side.
  const isPlayerLight = worldX === player.x && worldY === player.y;
  const phone = isMobileMode();
  const occluders = collectLightOccluders(worldX, worldY, worldRadius,
    { withAnimals: true, maxOccluders: isPlayerLight ? LIGHT_MAX_OCCLUDERS : (phone ? 4 : NPC_LIGHT_MAX_OCCLUDERS) });
  const maxSteps = isPlayerLight ? (phone ? 24 : LIGHT_SHADOW_MAX_STEPS) : (phone ? 10 : NPC_LIGHT_SHADOW_MAX_STEPS);
  let hasShadow = false;
  // Performance: someone standing still (sitting, idle, Maria at work) with
  // nothing moving around them gets the exact same candle as last frame —
  // reuse it instead of re-projecting every shadow.
  let ckey = Math.round(worldX * 2) + "," + Math.round(worldY * 2) + "|" + d + "|" + zoom;
  for (const o of occluders) ckey += "|" + (o.icon ? (o.icon.lightSig || o.icon.src || "c") : "b") + Math.round(o.x) + "," + Math.round(o.y);
  const cached = candleCache.get(ckey);
  if (cached) {
    candleCache.delete(ckey); candleCache.set(ckey, cached); // most recently used
    addCandleLight(cached, px - screenRadius, py - screenRadius, screenRadius * 2, screenRadius * 2, darkness * POST_GLOW_MATCH_CANDLE * CANDLE_OPACITY, CANDLE_PEAK_RGB, counterLightCutouts());
    return;
  }
  // Phones: someone ELSE walking (a townsperson, Maria) missed the cache
  // every single frame — a full shadow projection per walker per frame, the
  // biggest night-time spikes. Their candle built a frame or two ago, a few
  // px back, is reused instead (moved along with them); it's rebuilt every
  // NPC_CANDLE_REUSE_FRAMES + 1 frames. The shadows trail by ~30 ms at most.
  if (phone && !isPlayerLight) {
    for (const r of recentNpcCandles) {
      if (r.d !== d || relightFrameId - r.frame > NPC_CANDLE_REUSE_FRAMES) continue;
      if (Math.abs(r.x - worldX) > 4 || Math.abs(r.y - worldY) > 4) continue;
      if (candleCache.get(r.key) !== r.canvas) continue; // its canvas was recycled meanwhile
      r.x = worldX; r.y = worldY;
      addCandleLight(r.canvas, px - screenRadius, py - screenRadius, screenRadius * 2, screenRadius * 2, darkness * POST_GLOW_MATCH_CANDLE * CANDLE_OPACITY, CANDLE_PEAK_RGB, counterLightCutouts());
      return;
    }
  }

  if (occluders.length) {
    glowMaskCtx.setTransform(1, 0, 0, 1, 0, 0);
    glowMaskCtx.clearRect(0, 0, d, d);
    glowMaskCtx.fillStyle = "#000";
    const far = worldRadius * 1.1; // just past the glow's own edge — anything beyond is already dark (performance: was 2x, twice the projection work for nothing visible)

    for (const o of occluders) {
      // The rect in canvas-local px at scale 1. Because the light sits at
      // the canvas center, projecting by `s` is just multiplying these by
      // `s` — the light-relative math collapses into a plain scale.
      const bx = (o.x - worldX) * zq;
      const by = (o.y - worldY) * zq;
      const bw = o.w * zq;
      const bh = o.h * zq;

      // Nearest/farthest corner distances decide how far to project and
      // how finely to step, so a shadow neither falls short nor tears
      // open into stripes.
      const dxs = [o.x - worldX, o.x + o.w - worldX];
      const dys = [o.y - worldY, o.y + o.h - worldY];
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
        maxSteps,
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
  for (const [at, col] of CANDLE_GRADIENT_STOPS) gradient.addColorStop(at, col);
  glowCtx.fillStyle = gradient;
  glowCtx.beginPath();
  glowCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  glowCtx.fill();

  // 3. Carve the mask out of it in one pass — one blur for the whole set
  //    of shadows, so their edges soften without each shape being
  //    filtered separately.
  if (hasShadow) {
    glowCtx.globalCompositeOperation = "destination-out";
    // Phones: no filter — a canvas blur is one of the most expensive things a
    // phone GPU can be asked for, and this half-res candle is smoothed on
    // the way up to the screen anyway.
    if (!phone) glowCtx.filter = "blur(1px)"; // 2px at full res
    glowCtx.drawImage(glowMaskCanvas, 0, 0);
    if (!phone) glowCtx.filter = "none";
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
  //
  //    It now goes into the shared light buffer (addSceneLight() above)
  //    rather than straight onto the scene, so it merges with any other
  //    light it overlaps instead of stacking. That buffer lands AFTER the
  //    night washes, where this candle used to land before them — so it's
  //    dimmed by hand to the same strength the washes used to leave it
  //    at (POST_GLOW_MATCH_CANDLE, the lamp's own figure for exactly this).
  addCandleLight(glowCanvas, px - screenRadius, py - screenRadius, screenRadius * 2, screenRadius * 2, darkness * POST_GLOW_MATCH_CANDLE * CANDLE_OPACITY, CANDLE_PEAK_RGB, counterLightCutouts());
  // keep a copy for next frame (see the cache lookup above)
  // Performance: a walking character misses this cache every frame, so the
  // canvas the oldest entry was using is recycled instead of creating (and
  // later garbage-collecting) a brand-new GPU canvas each time.
  let keep = null;
  if (candleCache.size >= CANDLE_CACHE_MAX) {
    const oldKey = candleCache.keys().next().value;
    keep = candleCache.get(oldKey);
    candleCache.delete(oldKey);
  }
  if (!keep) keep = document.createElement("canvas");
  if (keep.width !== d || keep.height !== d) { keep.width = d; keep.height = d; }
  const kg = keep.getContext("2d");
  kg.clearRect(0, 0, d, d);
  kg.drawImage(glowCanvas, 0, 0);
  candleCache.set(ckey, keep);
  if (phone && !isPlayerLight) {
    for (let i = recentNpcCandles.length - 1; i >= 0; i--) if (relightFrameId - recentNpcCandles[i].frame > NPC_CANDLE_REUSE_FRAMES) recentNpcCandles.splice(i, 1);
    recentNpcCandles.push({ x: worldX, y: worldY, d, frame: relightFrameId, key: ckey, canvas: keep });
  }
}
const CANDLE_CACHE_MAX = 24;
const NPC_CANDLE_REUSE_FRAMES = 2;  // phones: a walking NPC's candle is rebuilt every 3rd frame
const recentNpcCandles = [];        // [{ x, y, d, frame, key, canvas }] — see drawCharacterGlow()
// The counter pieces (bartender*) in the room, as screen-space cutouts for
// addSceneLight(): no candle or lamp lights the counter top (see
// collectLightOccluders()). Same rects relightOccluders() uses indoors.
function counterLightCutouts() {
  if (player.scene !== "inside") return null;
  const room = INTERIOR_ROOMS[player.activeRoomId];
  if (!room || !room.decor) return null;
  let out = null;
  for (const [key, type] of room.decor) {
    if (type.charCodeAt(0) !== 98 || !/^bartender/.test(type)) continue; // 'b'
    const icon = itemDefs[type] && itemDefs[type].icon;
    if (!icon || !icon.width) continue;
    const comma = key.indexOf(",");
    const col = +key.slice(0, comma), row = +key.slice(comma + 1);
    (out || (out = [])).push({ icon, x: ((col + 0.5) * TILE - camX) * zoom - icon.width * zoom / 2,
      y: ((row + 1) * TILE - camY) * zoom - icon.height * zoom, w: icon.width * zoom, h: icon.height * zoom, alpha: 1 });
  }
  return out;
}
const candleCache = new Map();

// The player's own light — a thin wrapper around the shared
// drawCharacterGlow() above, centred on the player.
function drawPlayerGlow(px, py, size) {
  drawCharacterGlow(px, py, size, player.x, player.y);
}

// Just the character's art — no shadow, no glow, no lighting of any
// kind. Split out of drawPlayer() below so the night relight
// (drawPlayerNightRelight()) can redraw exactly the same pixels in the
// same place without duplicating the sheet/frame/mirroring logic.
/* --- seated animation ------------------------------------------------
   assets/sprites/Sit/ holds two ordinary character sheets — sith.png
   (front-on) and sitv.png (side profile, facing right), 384x64 = 6
   frames of 64x64 each. Nothing special is needed to draw them: they go
   through the exact same frame slice, DRAW_SIZE box and left-flip that
   idle/walk/run/carry do, which is what keeps a seated character the
   same size as a standing one. The frame counter is advanced by
   updateSitting() (js/furniture.js) off FRAME_COUNTS.sit/ANIM_FPS.sit,
   the same way updatePlayer() advances every other animation. */

// Which sit sheet a facing uses — the side sheet is drawn facing RIGHT
// and mirrored for LEFT, the same convention every other *Side sheet in
// the project follows.
function sitSheetFor(facing) {
  return (facing === "left" || facing === "right") ? assets.sitSide : assets.sitFront;
}

// Draws the seated character in place of the normal sprite sheet.
// Returns false if the sheet hasn't finished loading, so the caller can
// fall back to the standing sprite rather than drawing nothing.
function drawSittingPlayer(px, py, scale, g = ctx) {
  const sheet = sitSheetFor(player.facing);
  if (!sheet || !sheet.width) return false;

  const size = DRAW_SIZE * scale;
  const frame = player.frame % FRAME_COUNTS.sit;
  const sx = frame * FRAME_SIZE;

  // Per-seat nudge (itemDefs' `poseOffsetX`/`poseOffsetY`, set on the
  // seat and stored by trySitOnBench() — js/furniture.js). World px, so
  // it scales with zoom like everything else, and it moves ONLY the
  // drawn sprite: a seat whose art puts its sitting spot off-centre in
  // its tile can line the character up without shifting where she
  // actually is. Mirrored along with the sprite when facing left, so a
  // left-facing seat's nudge points the same way relative to the art.
  const dx = (player.facing === "left" ? -player.sitDrawOffsetX : player.sitDrawOffsetX) * scale;
  const dy = player.sitDrawOffsetY * scale;

  g.save();
  if (player.facing === "left") {
    g.translate(px + dx, py + dy);
    g.scale(-1, 1);
    g.drawImage(sheet, sx, 0, FRAME_SIZE, FRAME_SIZE, -size / 2, -size / 2, size, size);
  } else {
    g.drawImage(sheet, sx, 0, FRAME_SIZE, FRAME_SIZE, px + dx - size / 2, py + dy - size / 2, size, size);
  }
  g.restore();
  return true;
}

function drawPlayerSprite(px, py, scale, g = ctx) {
  const size = DRAW_SIZE * scale;

  // Sitting on a chair/bench (js/furniture.js) swaps the whole sheet out
  // for a single seated pose. Falls through to the normal sheet if that
  // art somehow isn't loaded.
  if (player.sitting && drawSittingPlayer(px, py, scale, g)) {
    drawHeldItemAboveHead(px, py, size, scale, g);
    return;
  }

  const sheet = currentPlayerSheet();
  const sx = player.frame * FRAME_SIZE;

  g.save();
  if (player.facing === "left") {
    g.translate(px, py);
    g.scale(-1, 1);
    g.drawImage(sheet, sx, 0, FRAME_SIZE, FRAME_SIZE, -size / 2, -size / 2, size, size);
  } else {
    g.drawImage(sheet, sx, 0, FRAME_SIZE, FRAME_SIZE, px - size / 2, py - size / 2, size, size);
  }
  g.restore();

  // What you're holding shows above your head, so it's visible in-world
  // (not just in the HUD) — mirrors js/inventory.js's `heldItem`.
  drawHeldItemAboveHead(px, py, size, scale, g);
  // A customer's order being carried (js/waiter.js) — in the hands.
  if (typeof drawCarriedOrder === "function") drawCarriedOrder(px, py, size, scale, g);
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
  const night = getRelightStrength(); // matches the washes exactly (indoors that includes the owner's lights)
  if (night <= 0.01) return;
  const px = (player.x - camX) * zoom;
  const py = (player.y - camY) * zoom;
  const feetY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  drawMaskedRelight((g) => drawPlayerSprite(px, py, zoom, g), px, py, DRAW_SIZE * zoom, feetY, night, true);
}

/* --- relight, but never over something standing in front -------------
   The relight repaints a character on top of the finished frame, which
   used to put them on top of EVERYTHING — so at night a table (or tree,
   or house) they were standing behind stopped covering them. Per request
   ("dapat yung table laging naka overlap sa character"), the repainted
   copy is built on a small canvas first and every object standing in
   front of the character (it sorts lower on screen than their feet) is
   cut out of it with its own silhouette. An object that's currently
   see-through because the player is behind it (the occlusion fade) is
   only cut out by that much, so the fade still reads the same. */
const relightCanvas = document.createElement("canvas");

/* Performance (phones): every lamp, every citizen, every animal and every
   lantern relight asked relightOccluders() for the same objects again —
   a dozen-plus full row scans a frame at night. The STILL things in front
   (objects, crates, flowers, bridges) are now collected ONCE per frame for
   the whole screen, each with the depth it has to beat (`k`), and every
   non-player caller just keeps the ones whose `k` is past its own feet.
   Same answer the per-call scan gave, a fraction of the work. The player's
   own call (see-through fading, the seat) still runs the full version. */
let relightFrameId = 0;          // bumped at the start of every render()
let relightStaticFrame = -1, relightStaticList = null;
let relightMovingFrame = -1, relightMovingList = [];
function relightStaticOccludersMobile() {
  if (relightStaticFrame === relightFrameId && relightStaticList) return relightStaticList;
  const out = [];
  const vr0 = Math.floor(camY / TILE) - 4, vr1 = Math.ceil((camY + view.height / zoom) / TILE) + 16;
  const vc0 = Math.floor(camX / TILE) - 10, vc1 = Math.ceil((camX + view.width / zoom) / TILE) + 10;
  const objRows = layerRows(objectLayer, "relightObj", (type) => { const d = itemDefs[type]; return !!(d && !d.alwaysBehindPlayer); });
  for (let row = vr0; row <= vr1; row++) {
    const list = objRows.get(row);
    if (!list) continue;
    for (const [col, type] of list) {
      if (col < vc0 || col > vc1) continue;
      if (typeof renderWin !== "undefined" && renderWin && itemOffscreen(type, col, row)) continue; // hidden (render window) — nothing to cut out
      const def = itemDefs[type];
      const swap = nightSwapFor(type);
      const showNight = swap && swap.night > 0.5;
      const icon = showNight ? swap.icon : def.icon;
      if (!icon || !icon.width) continue;
      const r = objectArtRect(icon, showNight ? swap.root : def.artRoot, col, row, camX, camY);
      const k = itemSortY(type, col, row) - (/^(bush|decoFlower)/.test(type) ? CHARACTER_VISIBLE_FEET_EXTRA : 0);
      out.push({ icon, x: r.x, y: r.y, w: r.w, h: r.h, alpha: 1, k });
    }
  }
  [groundLayer, groundOverlayLayer, upperLayer].forEach((layer, li) => {
    const rows = layerRows(layer, "relightBand" + li, (type) => {
      const def = itemDefs[type];
      return !!(def && (def.depthBand || (layer === groundOverlayLayer && /^decoFlower/.test(type))));
    });
    for (let row = vr0; row <= vr1; row++) {
      const list = rows.get(row);
      if (!list) continue;
      for (const [col, type] of list) {
        if (col < vc0 || col > vc1) continue;
        const def = itemDefs[type];
        const flower = layer === groundOverlayLayer && /^decoFlower/.test(type);
        const icon = def.icon;
        if (!icon || !icon.width) continue;
        const k = flower ? (row + 1) * TILE - CHARACTER_VISIBLE_FEET_EXTRA : itemSortY(type, col, row);
        out.push({ icon, x: ((col + 0.5) * TILE - camX) * zoom - icon.width * zoom / 2,
          y: ((row + 1) * TILE - camY) * zoom - icon.height * zoom, w: icon.width * zoom, h: icon.height * zoom, alpha: 1, k });
      }
    }
  });
  for (const comp of bridgeComponentsThisFrame) {
    for (const [col, row, type] of comp.tiles) {
      const icon = itemDefs[type] && itemDefs[type].icon;
      if (!icon || !icon.width) continue;
      out.push({ icon, x: (col * TILE - camX) * zoom, y: (row * TILE - camY) * zoom, w: TILE * zoom, h: TILE * zoom, alpha: 1, k: comp.bottom });
    }
  }
  relightStaticList = out;
  relightStaticFrame = relightFrameId;
  return out;
}

function relightOccluders(feetY, isPlayer) {
  const out = [];
  const seated = isPlayer && player.sitting;
  if (!isPlayer && player.scene !== "inside" && isMobileMode()) {
    for (const o of relightStaticOccludersMobile()) if (o.k > feetY) out.push(o);
    // townsfolk and animals: collected once a frame too (each carries its own depth `k`)
    if (relightMovingFrame !== relightFrameId) {
      relightMovingList = citizenRelightOccluders(-Infinity).concat(animalRelightOccluders(-Infinity));
      relightMovingFrame = relightFrameId;
    }
    for (const o of relightMovingList) if (o.k > feetY) out.push(o);
    return out;
  }
  if (player.scene === "inside") {
    const room = INTERIOR_ROOMS[player.activeRoomId];
    if (!room) return out;
    const indoorItems = room.floorDecor ? [...room.decor, ...room.floorDecor] : room.decor;
    for (const [key, type] of indoorItems) {
      if (!isIndoorStandingDecor(type) && !(itemDefs[type] && itemDefs[type].depthBand)) continue;
      const [col, row] = key.split(",").map(Number);
      if (seated && col === player.sitAnchorCol && row === player.sitAnchorRow) continue; // the seat you're on is behind you
      if (itemSortY(type, col, row) <= feetY) continue; // sorts behind
      const icon = itemDefs[type].icon;
      if (!icon || !icon.width) continue;
      out.push({ icon, x: ((col + 0.5) * TILE - camX) * zoom - icon.width * zoom / 2,
        y: ((row + 1) * TILE - camY) * zoom - icon.height * zoom, w: icon.width * zoom, h: icon.height * zoom, alpha: 1 });
    }
    for (const o of citizenRelightOccluders(feetY)) out.push(o); // citizens in this room (js/citizens.js)
    if (typeof mineRelightOccluders === "function") for (const o of mineRelightOccluders(feetY)) out.push(o); // cave mobs in front (js/mines.js)
    return out;
  }
  if (isMobileMode()) { // phones: the row-bucket version (same result, far less work)
  const nRow = Math.floor(feetY / TILE);
  // Performance: only the rows that can be in front, and only near the screen (row buckets, above).
  const vc0 = Math.floor(camX / TILE) - 10, vc1 = Math.ceil((camX + view.width / zoom) / TILE) + 10;
  const objRows = layerRows(objectLayer, "relightObj", (type) => { const d = itemDefs[type]; return !!(d && !d.alwaysBehindPlayer); });
  for (let row = nRow - 2; row <= nRow + 14; row++) { // only things further down the screen can be in front (-2: a crate's band sits above its own tile)
    const list = objRows.get(row);
    if (!list) continue;
    for (const [col, type] of list) {
      if (col < vc0 || col > vc1) continue;
      const def = itemDefs[type];
      if (itemSortY(type, col, row) <= feetY + (/^(bush|decoFlower)/.test(type) ? CHARACTER_VISIBLE_FEET_EXTRA : 0)) continue; // bushes: against the visible feet (drawableOrder())
      if (seated && col === player.sitAnchorCol && row === player.sitAnchorRow) continue;
      const swap = nightSwapFor(type);
      const showNight = swap && swap.night > 0.5;
      const icon = showNight ? swap.icon : def.icon;
      if (!icon || !icon.width) continue;
      const r = objectArtRect(icon, showNight ? swap.root : def.artRoot, col, row, camX, camY);
      let alpha = 1;
      if (isPlayer) {
        // Same see-through check drawObjectLayerItem() uses for this frame.
        const minX = camX + r.x / zoom, minY = camY + r.y / zoom;
        if (shouldFadeForOcclusion(type, minX, minX + icon.width, minY, minY + icon.height,
          itemSortY(type, col, row), showNight ? (def.nightMaskType || type) : type, col, row)) alpha = 1 - OBJECT_FADE_ALPHA;
      }
      out.push({ icon, x: r.x, y: r.y, w: r.w, h: r.h, alpha });
    }
  }
  // Crates/mushrooms on the other layers (see renderWorldObjectsSorted()).
  [groundLayer, groundOverlayLayer, upperLayer].forEach((layer, li) => {
    const rows = layerRows(layer, "relightBand" + li, (type) => {
      const def = itemDefs[type];
      return !!(def && (def.depthBand || (layer === groundOverlayLayer && /^decoFlower/.test(type))));
    });
    for (const [row, list] of rows) {
      if (row < nRow - 3) continue;
      for (const [col, type] of list) {
        if (col < vc0 || col > vc1) continue;
        const def = itemDefs[type];
        const flower = layer === groundOverlayLayer && /^decoFlower/.test(type);
        if (flower ? (row + 1) * TILE <= feetY + CHARACTER_VISIBLE_FEET_EXTRA : itemSortY(type, col, row) <= feetY) continue;
        const icon = def.icon;
        if (!icon || !icon.width) continue;
        out.push({ icon, x: ((col + 0.5) * TILE - camX) * zoom - icon.width * zoom / 2,
          y: ((row + 1) * TILE - camY) * zoom - icon.height * zoom, w: icon.width * zoom, h: icon.height * zoom, alpha: 1 });
      }
    }
  });
  } else {
  const nRow = Math.floor(feetY / TILE);
  objectLayer.forEach((type, key) => {
    const def = itemDefs[type];
    if (!def || def.alwaysBehindPlayer) return;
    const comma = key.indexOf(",");
    const col = +key.slice(0, comma), row = +key.slice(comma + 1);
    if (row < nRow - 2 || row > nRow + 14) return; // only things further down the screen can be in front (-2: a crate's band sits above its own tile)
    if (itemSortY(type, col, row) <= feetY + (/^(bush|decoFlower)/.test(type) ? CHARACTER_VISIBLE_FEET_EXTRA : 0)) return; // bushes: against the visible feet (drawableOrder())
    if (seated && col === player.sitAnchorCol && row === player.sitAnchorRow) return;
    const swap = nightSwapFor(type);
    const showNight = swap && swap.night > 0.5;
    const icon = showNight ? swap.icon : def.icon;
    if (!icon || !icon.width) return;
    const r = objectArtRect(icon, showNight ? swap.root : def.artRoot, col, row, camX, camY);
    let alpha = 1;
    if (isPlayer) {
      // Same see-through check drawObjectLayerItem() uses for this frame.
      const minX = camX + r.x / zoom, minY = camY + r.y / zoom;
      if (shouldFadeForOcclusion(type, minX, minX + icon.width, minY, minY + icon.height,
        itemSortY(type, col, row), showNight ? (def.nightMaskType || type) : type, col, row)) alpha = 1 - OBJECT_FADE_ALPHA;
    }
    out.push({ icon, x: r.x, y: r.y, w: r.w, h: r.h, alpha });
  });
  // Crates/mushrooms on the other layers (see renderWorldObjectsSorted()).
  for (const layer of [groundLayer, groundOverlayLayer, upperLayer]) {
    layer.forEach((type, key) => {
      const def = itemDefs[type];
      const flower = layer === groundOverlayLayer && /^decoFlower/.test(type);
      if (!def || (!def.depthBand && !flower)) return;
      const [col, row] = key.split(",").map(Number);
      if (flower ? (row + 1) * TILE <= feetY + CHARACTER_VISIBLE_FEET_EXTRA : itemSortY(type, col, row) <= feetY) return;
      const icon = def.icon;
      if (!icon || !icon.width) return;
      out.push({ icon, x: ((col + 0.5) * TILE - camX) * zoom - icon.width * zoom / 2,
        y: ((row + 1) * TILE - camY) * zoom - icon.height * zoom, w: icon.width * zoom, h: icon.height * zoom, alpha: 1 });
    });
  }
  }
  // A Port Bridge covers whoever's feet are inside its span (under it) —
  // same rule as renderWorldObjectsSorted(); never the player up on it.
  if (!(isPlayer && player.elevated)) {
    for (const comp of bridgeComponentsThisFrame) {
      if (feetY >= comp.bottom) continue;
      for (const [col, row, type] of comp.tiles) {
        const icon = itemDefs[type] && itemDefs[type].icon;
        if (!icon || !icon.width) continue;
        out.push({ icon, x: (col * TILE - camX) * zoom, y: (row * TILE - camY) * zoom, w: TILE * zoom, h: TILE * zoom, alpha: 1 });
      }
    }
  }
  // Wandering citizens standing in front (js/citizens.js).
  for (const o of citizenRelightOccluders(feetY)) out.push(o);
  // Farm animals standing in front (js/animals.js).
  for (const o of animalRelightOccluders(feetY)) out.push(o);
  return out;
}

function drawMaskedRelight(drawFn, px, py, size, feetY, strength, isPlayer) {
  // Room for the sprite plus whatever's held above the head.
  // Performance: just the sprite plus room above it for a held item — this
  // used to be a 2 x 2.5 sprite-sized area (5x the sprite) per relight.
  const left = Math.floor(px - size * 0.75), top = Math.floor(py - size * 1.25);
  const w = Math.ceil(size * 1.5), h = Math.ceil(size * 2);
  if (left + w < 0 || top + h < 0 || left > view.width || top > view.height) return;
  // Performance: grow-only. Every character / lantern asked for a different
  // size, so the canvas was re-allocated on the GPU several times a frame.
  if (relightCanvas.width < w || relightCanvas.height < h) {
    relightCanvas.width = Math.max(relightCanvas.width, w);
    relightCanvas.height = Math.max(relightCanvas.height, h);
  }
  const g = relightCanvas.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.clearRect(0, 0, w, h);
  g.imageSmoothingEnabled = false;
  g.setTransform(1, 0, 0, 1, -left, -top); // so drawFn can draw in plain screen coordinates
  drawFn(g);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "destination-out";
  for (const o of relightOccluders(feetY, isPlayer)) {
    if (o.x > left + w || o.x + o.w < left || o.y > top + h || o.y + o.h < top) continue;
    const sil = getOccluderSilhouette(o.icon);
    if (!sil) continue;
    g.globalAlpha = o.alpha;
    g.drawImage(sil, o.x - left, o.y - top, o.w, o.h);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = strength;
  ctx.drawImage(relightCanvas, 0, 0, w, h, left, top, w, h);
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

  // No shadow while seated (js/furniture.js): buildSilhouette() casts from
  // a 64x64 frame of a sheet, and the sit poses aren't sheet frames — and
  // a standing-shaped silhouette under a seated character reads wrong
  // anyway, with the chair or bench sitting right where it would fall.
  if (!player.sitting) drawShadow(shadowX, feetY, size, sheet, sx);
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
  const sheet = currentNpcSheet();
  const sx = npc.frame * FRAME_SIZE;
  const size = NPC_DRAW_SIZE * scale;
  const feetY = py - size / 2 + size * SPRITE_FEET_FRACTION;

  drawShadow(px, feetY, size, sheet, sx);

  // The same candle-circle the player carries — per request ("yung npc
  // lagyan mo rin ng circle light parang kagaya sa character parang
  // duplicate lang yung circle light"). Drawn BEFORE the sprite, exactly
  // like drawPlayer() does, so it reads as a light she's carrying rather
  // than a halo pasted on top. Uses whichever coordinate space she's
  // currently in (outdoor world x/y, or the room-local inX/inY while
  // she's inside), which is what the shadow-casting pass measures
  // occluders against.
  const worldX = npc.scene === "inside" ? npc.inX : npc.x;
  const worldY = npc.scene === "inside" ? npc.inY : npc.y;
  drawCharacterGlow(px, py, size, worldX, worldY);

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

function currentNpcSheet() {
  const rightSheet = npc.isWalking ? assets.npcWalkRight : assets.npcIdleRight;
  const leftSheet = npc.isWalking ? assets.npcWalkLeft : assets.npcIdleLeft;
  return npc.facing === "left" ? leftSheet : rightSheet;
}

/* --- Maria's night relight --------------------------------------------
   Per request ("yung npc balik mo parin sa original na kulay niya kahit
   gabi na"): the same fix the player already gets
   (drawPlayerNightRelight() above). The night washes are painted over
   the finished frame and drag her colours toward blue-grey, so she's
   painted once more AFTER them, at the strength of the darkening.

   One thing the player's version doesn't have to care about: she can
   stand BEHIND a tree or a house. Her relit copy is built on a small
   canvas first and every object standing in front of her (sorts lower
   on screen than her feet) is cut out of it with its own silhouette, so
   the relight never shows her through something she's hidden behind. */

function drawNpcNightRelight() {
  const night = getRelightStrength(); // same strength as the washes and the player's relight
  if (night <= 0.01) return;
  let wx, wy;
  if (player.scene === "inside") {
    if (npc.scene !== "inside" || npc.roomId !== player.activeRoomId || npc.sleeping) return;
    wx = npc.inX; wy = npc.inY;
  } else {
    if (npc.scene !== "outside") return;
    wx = npc.x; wy = npc.y;
  }
  const size = NPC_DRAW_SIZE * zoom;
  const px = (wx - camX) * zoom, py = (wy - camY) * zoom;
  const feetY = wy + (SPRITE_FEET_FRACTION - 0.5) * NPC_DRAW_SIZE;
  drawMaskedRelight((g) => g.drawImage(currentNpcSheet(), npc.frame * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE,
    px - size / 2, py - size / 2, size, size), px, py, size, feetY, night, false);
}

/* --- the lit lanterns keep their colour ------------------------------
   Per request ("yung lamp na may light lang yung medyo ibalik mo yung
   kulay... para di mukang patay"): the night washes dim a lamp's lantern
   like everything else, so the one thing that's supposed to be GLOWING
   came out a dull grey-yellow. Just the lantern and its halo (the lamp's
   `lightGlow.relightRect`, measured off the lit art so none of the
   wooden post is included) is painted again after the washes, at
   LAMP_RELIGHT_STRENGTH — "medyo", most of the way back rather than
   fully, so it still sits in the night instead of looking pasted on. */
const LAMP_RELIGHT_STRENGTH = 0.8;

function drawLampNightRelight() {
  const night = 1 - getDayFactor();
  if (night <= 0.01) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const [key, type] of lampEntries()) {
    const def = itemDefs[type];
    if (!def || !def.lightGlow || !def.lightGlow.relightRect) continue;
    // The lit art: a lamp with a night swap only shows it once it's dark
    // (and only as much as it has faded in); an always-lit lamp is its
    // own icon.
    let icon = def.icon, root = def.artRoot, strength = 1;
    if (def.nightIcon) {
      const swap = nightSwapFor(type);
      if (!swap) continue;
      icon = swap.icon; root = swap.root; strength = swap.night;
    }
    if (!icon || !icon.width) continue;
    const comma = key.indexOf(",");
    const col = +key.slice(0, comma), row = +key.slice(comma + 1);
    const r = objectArtRect(icon, root, col, row, camX, camY);
    if (r.x + r.w < 0 || r.y + r.h < 0 || r.x > view.width || r.y > view.height) continue;
    const rr = def.lightGlow.relightRect;
    const lx = r.x + rr.x * zoom, ly = r.y + rr.y * zoom, lw = rr.w * zoom, lh = rr.h * zoom;
    // The lit lantern is cut out wherever something in front of the post
    // (a tree) covers it — same masked redraw the characters' relight uses.
    const size = Math.max(lw, lh);
    drawMaskedRelight((g) => g.drawImage(icon, rr.x, rr.y, rr.w, rr.h, lx, ly, lw, lh),
      lx + lw / 2, ly + lh / 2, size, itemSortY(type, col, row), night * strength * LAMP_RELIGHT_STRENGTH, false);
  }
  ctx.restore();
}

// Both characters' relights, in depth order — whoever is further down
// the screen (in front) goes last, so their restored colours correctly
// cover the one behind. Indoors she's always drawn after the player
// (renderInteriorScene()), so she goes last there too.
function drawCharacterNightRelights() {
  // Same feet-based depth order the scene itself now uses, indoors and out.
  let npcInFront = true;
  if (!player.sleeping) {
    const inside = player.scene === "inside";
    const sameScene = inside ? (npc.scene === "inside" && npc.roomId === player.activeRoomId) : npc.scene === "outside";
    if (sameScene) {
      const ny = inside ? npc.inY : npc.y;
      npcInFront = ny + (SPRITE_FEET_FRACTION - 0.5) * NPC_DRAW_SIZE >
        player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
    }
  }
  // The wandering citizens (js/citizens.js) join in: everyone is relit
  // back-to-front, so whoever stands in front keeps covering whoever's
  // behind them even after the relight.
  const playerSort = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  const order = [
    { sortY: npcInFront ? playerSort - 0.001 : playerSort + 0.001, draw: drawPlayerNightRelight },
    { sortY: playerSort, draw: drawNpcNightRelight }, // her place relative to the player, worked out above
  ];
  if (player.scene === "outside" && npc.scene === "outside" && currentWorld === "main") {
    order[1].sortY = npc.y + (SPRITE_FEET_FRACTION - 0.5) * NPC_DRAW_SIZE;
    order[0].sortY = playerSort;
  }
  for (const c of citizenRelightList()) order.push(c);
  for (const a of animalRelightList()) order.push(a); // animals standing in a light (js/animals.js)
  if (typeof shopKeeperRelightList === "function") for (const k of shopKeeperRelightList()) order.push(k); // the shop keepers keep their colours (js/shops.js)
  if (typeof mineRelightList === "function") for (const m of mineRelightList()) order.push(m); // cave mobs in your light (js/mines.js)
  order.sort((a, b) => a.sortY - b.sortY);
  for (const o of order) o.draw();
}

// Maria asleep in a Big Bed inside a room (js/npc.js's sleep schedule) —
// the exact same bedBigSleep sheet drawSleepingBed() plays for the
// player, just driven by the NPC's own frame counter and drawn at the
// bed SHE picked. The indoor decor loop skips that bed's normal art
// while this is showing, same as it does for the player's own sleep.
//
// Art limitation worth knowing about: that sheet has one fixed character
// baked into it (it was drawn for the player), so the figure tucked into
// the bed isn't Maria's own sprite. There's no NPC sleep art in the
// project to use instead — this is the only "someone is asleep in this
// bed" visual that exists.
function drawNpcSleepingBed() {
  const icon = assets.bedBigSleep;
  const frameCount = FRAME_COUNTS.sleep;
  const frameW = icon.width / frameCount;
  const frameH = icon.height;
  const sx = npc.sleepFrame * frameW;
  const w = frameW * zoom;
  const h = frameH * zoom;
  const tileCenterX = (npc.sleepBedCol + 0.5) * TILE;
  const tileBottomY = (npc.sleepBedRow + 1) * TILE;
  const screenX = (tileCenterX - camX) * zoom - w / 2;
  const screenY = (tileBottomY - camY) * zoom - h;
  ctx.drawImage(icon, sx, 0, frameW, frameH, screenX, screenY, w, h);
}

// Draws a flat/wall item at its tile, honouring `artRoot` (where the
// art is anchored — used by the combined windows so the WINDOW sits on
// the tile, not the bottom of the image) and `litWindow` (the light part
// fades with the daylight while the window itself stays solid).
// Returns the drawn screen rect.
//
// LIT_WINDOW_LIGHT_ALPHA: how strong the window's light on the floor is at
// full daylight. The light art is solid white, which at 100% looks like a
// white sticker rather than sunlight — 0.5 lets the floor show through.
// Set to 1 for the old full-strength look.
const LIT_WINDOW_LIGHT_ALPHA = 0.5;
function drawFlatItemArt(type, col, row) {
  const def = itemDefs[type];
  const icon = def.icon;
  const r = objectArtRect(icon, def.artRoot, col, row, camX, camY);
  if (def.litWindow) {
    const split = def.litWindow.lightTop;
    // The window: always there.
    ctx.drawImage(icon, 0, 0, icon.width, split, r.x, r.y, r.w, split * zoom);
    // Its light: fades out at night, back in the morning.
    const a = getDayFactor() * LIT_WINDOW_LIGHT_ALPHA;
    if (a > 0.003) {
      ctx.globalAlpha = a;
      ctx.drawImage(icon, 0, split, icon.width, icon.height - split, r.x, r.y + split * zoom, r.w, (icon.height - split) * zoom);
      ctx.globalAlpha = 1;
    }
    return r;
  }
  const fade = def.fadeWithDaylight;
  if (fade) ctx.globalAlpha = getDayFactor();
  ctx.drawImage(icon, r.x, r.y, r.w, r.h);
  if (fade) ctx.globalAlpha = 1;
  return r;
}

function drawGroundItemAt(type, col, row) {
  if (itemDefs[type].artRoot || itemDefs[type].litWindow) { drawFlatItemArt(type, col, row); return; }
  // While it snows a grass tile draws as snow in the same shape (js/snowground.js).
  const icon = snowGroundIconFor(type, col, row) || (typeof snowTreeIcon === "function" && snowTreeIcon(type)) || itemDefs[type].icon; // + winter mushrooms / flowers / leaves
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
  // Each edge rounded to a whole canvas px on its own: at a fractional zoom (2.7 on phones)
  // neighbouring tiles then always share the same edge pixel — no hairline gap between them.
  const x0 = Math.round(screenX), y0 = Math.round(screenY);
  ctx.drawImage(icon, x0, y0, Math.round(screenX + w) - x0, Math.round(screenY + h) - y0);
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
// Per request ("tyaka lang mag opacity kapag na reach yung ulo"): only the
// HEAD counts — sprite rows above PLAYER_HEAD_BOTTOM_SPRITE (the chin, row
// 31 of the 64px frame, measured off the idle/walk sheets). A fence, a
// stone, a bush or anything else that only covers the legs/body leaves the
// face showing, so it stays solid; it fades once its pixels reach the head.
const PLAYER_HEAD_BOTTOM_SPRITE = 32;
function characterTouchesObjectPixels(body, objMask, objMinX, objMinY) {
  const w = body.mask ? body.mask.w : PLAYER_BODY_FALLBACK.w;
  const ox = body.mask ? body.mask.x : PLAYER_BODY_FALLBACK.x;
  const oy = body.mask ? body.mask.y : PLAYER_BODY_FALLBACK.y;
  const h = Math.min(body.mask ? body.mask.h : PLAYER_BODY_FALLBACK.h, PLAYER_HEAD_BOTTOM_SPRITE - oy);
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
// The tree the player is chopping never goes see-through — per request
// ("kapag nag puputol ng puno nagkakaroon ng opacity dapat hindi"). Only
// that one tree, only while chopping it: mid-swing, or standing still
// within CHOP_KEEP_SOLID_MS of the last swing. Walk off and the normal
// occlusion fade applies again; every other tree is untouched.
function isTreeBeingChopped(col, row) {
  if (col == null) return false;
  const t = player.harvestTarget;
  const c = player.chopTree;
  if (player.action && t && t.col === col && t.row === row) {
    if (c && c.col === col && c.row === row) c.until = performance.now() + CHOP_KEEP_SOLID_MS; // count from the end of the swing
    return true;
  }
  if (!c || c.col !== col || c.row !== row) return false;
  if (performance.now() > c.until || Math.abs(player.x - c.x) > 1 || Math.abs(player.y - c.y) > 1) {
    player.chopTree = null;
    return false;
  }
  return true;
}

function shouldFadeForOcclusion(type, objMinX, objMaxX, objMinY, objMaxY, objSortY, maskType, col, row) {
  const fdef = itemDefs[type];
  if (fdef.noOcclusionFade) return false;
  // Bushes never go see-through — per request ("yung bushes wag mo na
  // lagyan ng opacity kapag dumaan yung character or mga npcs").
  if (/^bush/.test(type)) return false;
  if (isTreeBeingChopped(col, row)) return false;
  // Chairs, benches and stools never fade (per request, "mga upuan wag lang yan ng opacity").
  if (fdef.sittable || /chair|bench|stool/i.test(type)) return false;
  // Anything sittable stays fully solid while it's being sat on — per
  // request ("alisin mo lang opacity ng benchv at benchh kapag naka
  // sit"). The benches already carry `noOcclusionFade` so they can't
  // fade anyway, but this makes it true for every seat regardless of
  // that flag, and independently of it: you're meant to see the bench
  // you're sitting on, not through it.
  if (player.sitting && itemDefs[type].sittable) return false;

  const playerSortY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  if (playerSortY >= objSortY) return false;

  const body = getPlayerOcclusionBody();
  if (body.maxX <= objMinX || body.minX >= objMaxX || body.maxY <= objMinY || body.minY >= objMaxY) return false;
  // Nothing of it reaches up to the head — stays solid (cheap check before any pixel work).
  const headBottomY = body.frameTop + PLAYER_HEAD_BOTTOM_SPRITE * body.scale;
  if (objMinY >= headBottomY) return false;

  // (`fadeBoundingBoxOnly` stones used to fade on any bounding-box overlap;
  // now they follow the same head-pixel rule as everything else.)

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
  const nightIcon = (typeof isSnowGroundActive === "function" && isSnowGroundActive() && snowArtFor(def.nightIcon)) || def.nightIcon; // snowy lit lamp
  return { icon: nightIcon, night, root: def.nightArtRoot || def.artRoot };
}

// A bush swaying / a tree shaking (js/plantfx.js) — drawn through a
// transform around its base; everything else straight through.
function drawObjectLayerItem(type, col, row) {
  if (typeof applyPlantFxTransform === "function") {
    ctx.save();
    const moved = applyPlantFxTransform(col, row, type);
    if (moved) {
      drawObjectLayerItemRaw(type, col, row);
      if (typeof drawTreeCrack === "function") drawTreeCrack(type, col, row); // notch + cracks while being chopped (js/plantfx.js)
      ctx.restore();
      return;
    }
    ctx.restore();
  }
  drawObjectLayerItemRaw(type, col, row);
  if (typeof drawTreeCrack === "function") drawTreeCrack(type, col, row);
}

function drawObjectLayerItemRaw(type, col, row) {
  const def = itemDefs[type];
  // Snowing: trees wear a snowy copy of their art (snowTreeIcon(), js/snowground.js) — same size, so everything below lines up.
  const icon = (typeof snowTreeIcon === "function" && snowTreeIcon(type)) || def.icon;
  const tileBottomY = itemSortY(type, col, row); // this item's Y-sort key — the band centre for a depthBand crate
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
    tileBottomY, maskType, col, row);
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

  // Hover highlight for the ONE seat tile the cursor is over
  // (js/furniture.js) — no-ops unless this is the hovered item.
  if (def.sittable) drawSitHighlight(type, col, row, day);
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
// Was 7 tiles; per request ("medyo lakihan yung sakop ng circle light ng
// postlight") it now reaches 10 tiles across. The corner cut grows with
// it so the pool keeps the same soft rounded-square shape.
const POST_GLOW_WORLD_SIZE = TILE * 13; // was 10 — per request: the lamp posts light a wider pool too
const POST_GLOW_CORNER_CUT = TILE * 1.9;

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

/* --- lamp shadows ---------------------------------------------------
   Per request ("kapag may mga object is may shadow din na lalabas tapos
   na dislocate din yung circle light niya"): anything solid inside a
   lamp's pool — trees, stones, walls, houses, other lamps, bushes and
   flowers flagged `castsLightShadow` — now throws a shadow AWAY from the
   bulb, and that shadow is cut out of the pool, so the light bends
   around objects instead of shining straight through them.

   Same technique as the character's candle (drawCharacterGlow() above):
   the object's real sprite silhouette is projected outward from the
   light and unioned into a mask, which is then `destination-out`-ed
   from the glow. One difference: the object ITSELF stays lit — its own
   silhouette is cleared back out of the mask — so a tree next to a lamp
   shows its lit face with the dark shadow falling behind it, rather
   than turning into a black cut-out.

   Objects don't move, so each lamp's finished (shadowed) light is
   CACHED in world resolution and only rebuilt when something within
   its reach changes (placed, removed, day/night art swap). Zooming
   doesn't rebuild anything — the cached sprite is just scaled. */
const POST_SHADOW_RES = 2;           // cache px per world px — enough to stay smooth when zoomed in
const POST_SHADOW_MAX_OCCLUDERS = 28; // nearest-first cap per lamp
const POST_SHADOW_STRENGTH = 0.9;    // how much light a shadow removes (1 = pitch black, lower = softer)
const POST_SHADOW_BLUR_PX = 3;       // world px of softening on the shadow edges
const postShadowCache = new Map();   // lamp "col,row" -> { sig, canvas }
const POST_SHADOW_CACHE_MAX = 40;    // phones: lamps kept even while off screen

function buildShadowedPostGlow(entry, wx, wy, occluders) {
  // Phones: 1 cache px per world px — a quarter of the pixels to build, the
  // pool is soft light anyway (and the screen is only ~2.7 px per world px).
  const R = isMobileMode() ? 1 : POST_SHADOW_RES;
  const n = POST_GLOW_WORLD_SIZE * R;
  if (!entry.canvas) {
    entry.canvas = document.createElement("canvas");
    entry.mask = document.createElement("canvas");
  }
  const c = entry.canvas, m = entry.mask;
  if (c.width !== n) { c.width = n; c.height = n; m.width = n; m.height = n; }
  const g = c.getContext("2d");
  const mg = m.getContext("2d");
  const cx = n / 2, cy = n / 2;

  // 1. The lamp's usual soft rounded-square pool.
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, n, n);
  g.drawImage(postGlowCanvas, 0, 0, n, n);
  if (!occluders.length) return;

  // 2. Shadow mask: every silhouette projected out from the bulb.
  mg.setTransform(1, 0, 0, 1, 0, 0);
  mg.globalCompositeOperation = "source-over";
  mg.clearRect(0, 0, n, n);
  mg.fillStyle = "#000";
  const far = POST_GLOW_WORLD_SIZE; // corner of the pool is ~0.71 of this; past it is already dark
  for (const o of occluders) {
    const bx = (o.x - wx) * R, by = (o.y - wy) * R;
    const bw = o.w * R, bh = o.h * R;
    let dMin = Infinity, dMax = 0;
    for (const dx of [o.x - wx, o.x + o.w - wx]) for (const dy of [o.y - wy, o.y + o.h - wy]) {
      const dist = Math.hypot(dx, dy);
      if (dist < dMin) dMin = dist;
      if (dist > dMax) dMax = dist;
    }
    dMin = Math.max(dMin, 6);
    const maxScale = Math.min(12, far / dMin);
    if (maxScale <= 1) continue;
    const steps = Math.max(3, Math.min(48,
      Math.ceil(((maxScale - 1) * dMax) / LIGHT_SHADOW_STEP_PX)));
    const sil = getOccluderSilhouette(o.icon);
    for (let i = 0; i <= steps; i++) {
      const s = 1 + ((maxScale - 1) * i) / steps;
      if (sil) mg.drawImage(sil, cx + bx * s, cy + by * s, bw * s, bh * s);
      else mg.fillRect(cx + bx * s, cy + by * s, bw * s, bh * s);
    }
  }
  // Keep each object's own body lit — only what's BEHIND it is shadow.
  mg.globalCompositeOperation = "destination-out";
  for (const o of occluders) {
    const sil = getOccluderSilhouette(o.icon);
    if (!sil) continue; // invisible blocks have no body to light
    mg.drawImage(sil, cx + (o.x - wx) * R, cy + (o.y - wy) * R, o.w * R, o.h * R);
  }
  mg.globalCompositeOperation = "source-over";

  // 3. Carve the shadows out of the light, softened.
  g.globalCompositeOperation = "destination-out";
  g.globalAlpha = POST_SHADOW_STRENGTH;
  g.filter = "blur(" + POST_SHADOW_BLUR_PX * R + "px)";
  g.drawImage(m, 0, 0);
  g.filter = "none";
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
}

// The shadowed light for one lamp, rebuilt only when what's around it
// changed. The signature is every nearby occluder's sprite + position.
function getShadowedPostGlow(key, wx, wy) {
  const occluders = collectLightOccluders(wx, wy, POST_GLOW_WORLD_SIZE / 2,
    // No animals here (performance): a lamp's shadows are cached and only
    // rebuilt when something around it changes — an animal idling in the
    // pool changed it every frame (~9 ms rebuild each). Animals still throw
    // shadows in the characters' candles, and are cut out of lamp light
    // when they stand in front of it.
    { excludeKey: key, maxOccluders: POST_SHADOW_MAX_OCCLUDERS });
  let sig = wx + "," + wy + "|" + POST_GLOW_WORLD_SIZE;
  // Moving things (animals) are rounded to 2 world px, so a lamp's shadows
  // are rebuilt a few times a second as one walks by, not every frame.
  for (const o of occluders) sig += "|" + (o.icon ? (o.icon.src || o.icon.lightSig || "cv") : "box") + "@" + (o.icon && o.icon.lightSig ? Math.round(o.x / 2) + "," + Math.round(o.y / 2) : o.x + "," + o.y);
  let entry = postShadowCache.get(key);
  if (!entry) { entry = { sig: null, canvas: null, mask: null }; postShadowCache.set(key, entry); }
  if (entry.sig !== sig) {
    buildShadowedPostGlow(entry, wx, wy, occluders);
    entry.sig = sig;
  }
  entry.seen = true;
  return entry.canvas;
}

/* Cave fog — per request ("yung ibang place na wala yung character is naka
   black para di kita ... medyo diliman pa yung ibang paligid ... wag
   masyadong dark parang sillouhette lang"): round the player the cave is as
   lit as its lamps make it; a little further out it fades to a dark
   silhouette (shapes still readable), and far away it's black. Outside the
   cave's own picture is black too. Damage numbers / drops flying to you are
   drawn after this (drawMineOverlay()), so they stay readable. */
function drawCaveFog(room, vw, vh) {
  // The cave is lit everywhere now (CAVE_DARKNESS): no fog round the player, only
  // the black beyond the cave's own picture.
  ctx.save();
  ctx.fillStyle = "#000";
  {
    const x0 = (0 - camX) * zoom, y0 = (0 - camY) * zoom, x1 = (room.width - camX) * zoom, y1 = (room.height - camY) * zoom;
    if (x0 > 0) ctx.fillRect(0, 0, x0, vh);
    if (x1 < vw) ctx.fillRect(x1, 0, vw - x1, vh);
    if (y0 > 0) ctx.fillRect(0, 0, vw, y0);
    if (y1 < vh) ctx.fillRect(0, y1, vw, vh - y1);
  }
  ctx.restore();
}

// Indoors (rooms, caves) — per request ("lagyan mo nga ng circle light din yan
// ... yung mga postlight sa cave dapat umiilaw din mapa araw or gabi"): every
// decor piece with a `lightGlow` (the lit post lights, the Wall Candles)
// adds its circle to the shared light buffer, as strong as the room's own
// darkness calls for (getIndoorLighting().candle — full, always, in a cave).
function drawIndoorLampGlows(room, strength) {
  if (!room || !room.decor || strength <= 0.01) return;
  if (!postGlowReady) buildPostGlowSprite();
  for (const [key, type] of room.decor) {
    const def = itemDefs[type];
    if (!def || !def.lightGlow) continue;
    const comma = key.indexOf(",");
    const col = +key.slice(0, comma), row = +key.slice(comma + 1);
    const size = POST_GLOW_WORLD_SIZE * (def.lightGlow.small ? 0.8 : 0.85) * zoom; // wall candles: a bigger pool now the rooms are dark at night
    const wx = (col + 0.5) * TILE + def.lightGlow.offsetX;
    const wy = (row + 1) * TILE + (def.lightGlow.groundOffsetY !== undefined ? def.lightGlow.groundOffsetY : def.lightGlow.offsetY);
    const sx = (wx - camX) * zoom - size / 2, sy = (wy - camY) * zoom - size / 2;
    if (sx + size < 0 || sy + size < 0 || sx > view.width || sy > view.height) continue;
    addSceneLight(postGlowCanvas, sx, sy, size, size, strength * POST_GLOW_MATCH_CANDLE * (def.lightGlow.small ? 0.9 : 1), undefined, counterLightCutouts());
  }
}

// Performance (phones): the lamps on / near the screen, from row buckets,
// instead of walking every placed object on the map (twice a frame at night).
function lampEntries() {
  if (!isMobileMode()) return objectLayer;
  const rows = layerRows(objectLayer, "lamps", (type) => !!(itemDefs[type] && itemDefs[type].lightGlow));
  const pad = Math.ceil(POST_GLOW_WORLD_SIZE / TILE);
  const r0 = Math.floor(camY / TILE) - pad, r1 = Math.ceil((camY + view.height / zoom) / TILE) + pad;
  const c0 = Math.floor(camX / TILE) - pad, c1 = Math.ceil((camX + view.width / zoom) / TILE) + pad;
  const out = [];
  const win = typeof renderWin !== "undefined" && renderWin; // js/renderwindow.js
  for (let r = r0; r <= r1; r++) {
    const a = rows.get(r);
    if (!a) continue;
    for (const e of a) {
      if (e[0] < c0 || e[0] > c1) continue;
      if (win && itemOffscreen(e[1], e[0], r)) continue; // the lamp isn't drawn, so neither is its light
      out.push([e[2], e[1]]);
    }
  }
  return out;
}

function drawPostLightGlows(camX, camY) {
  const night = getNightLightFactor();
  if (night <= 0.01) return; // daylight — the lamps are off
  if (!postGlowReady) buildPostGlowSprite();

  for (const entry of postShadowCache.values()) entry.seen = false;

  const size = POST_GLOW_WORLD_SIZE * zoom;
  const strength = night * POST_GLOW_MATCH_CANDLE;
  for (const [key, type] of lampEntries()) {
    const def = itemDefs[type];
    if (!def || !def.lightGlow) continue;
    const comma = key.indexOf(",");
    const col = +key.slice(0, comma);
    const row = +key.slice(comma + 1);
    // Centred on the GROUND under the bulb (`groundOffsetY`), not on the
    // bulb itself up in the air — a hanging lantern lights the ground
    // beneath it. Centring on the bulb put most of the pool up in empty
    // space above the lamp, which is why it looked dislocated from it.
    // That same ground point is where the shadows are cast from.
    const wx = (col + 0.5) * TILE + def.lightGlow.offsetX;
    const wy = (row + 1) * TILE + (def.lightGlow.groundOffsetY !== undefined ? def.lightGlow.groundOffsetY : def.lightGlow.offsetY);
    const sx = (wx - camX) * zoom - size / 2;
    const sy = (wy - camY) * zoom - size / 2;
    if (sx + size < 0 || sy + size < 0 || sx > view.width || sy > view.height) continue; // off-screen
    // Per request: a lamp BEHIND a tree (or house...) must not shine over
    // it — everything that sorts in front of the lamp is cut out of its
    // light. A lamp in front of the tree still lights it, as before.
    const cut = relightOccluders(itemSortY(type, col, row), false).filter((o) =>
      o.x < sx + size && o.x + o.w > sx && o.y < sy + size && o.y + o.h > sy);
    const pool = getShadowedPostGlow(key, wx, wy), pe = postShadowCache.get(key);
    addSceneLight(pool, sx, sy, size, size, strength, undefined, cut, { key, srcSig: (pe && pe.sig) + "|" + size.toFixed(1) }); // merged with every other light, not stacked
  }

  // Drop cached lights for lamps that were removed or are off-screen, so
  // the cache can't grow without bound.
  // Phones: off-screen lamps keep their light (up to POST_SHADOW_CACHE_MAX),
  // so walking back and forth doesn't rebuild it — that rebuild is hundreds
  // of drawImage calls plus a blur, a hitch each time a lamp came back.
  if (!isMobileMode()) { for (const [key, entry] of postShadowCache) if (!entry.seen) postShadowCache.delete(key); }
  else if (postShadowCache.size > POST_SHADOW_CACHE_MAX) {
    for (const [key, entry] of postShadowCache) {
      if (postShadowCache.size <= POST_SHADOW_CACHE_MAX) break;
      if (!entry.seen) postShadowCache.delete(key);
    }
  }
}

// Base terrain (Dirt, Water — `layer: "terrain"` in itemDefs,
// inventory.js) lives in `terrainLayer` and draws FIRST, beneath even
// `groundLayer`'s ground tileset/Port tiles — the bottom of the whole
// stack. Same flat/no-Y-sort treatment as drawFlatGroundItems() below,
// just its own separate map so placing Dirt/Water never erases a Ground/
// Port tile on the same spot (see layerForType() in inventory.js).
function drawDirtLayer() {
  forEachTileInView(dirtLayer, (type, col, row) => {
    if (type === "dirtRake" && typeof drawDirtRakeAuto === "function" && drawDirtRakeAuto(col, row)) return; // auto-tiled soil (js/farm.js)
    drawGroundItemAt(type, col, row);
  });
}

// Flat ground decals (the ground tileset, plus small flat decorative
// stones — XXS Stone, Pebbles — see `flat` in itemDefs, inventory.js)
// live entirely in `groundLayer` and are pure terrain: always drawn
// beneath everything, never part of the Y-sort below, and never in the
// same map as decorLayer (wild grass/flowers) or objectLayer
// (stones/trees/the house) — see layerForType() in inventory.js.
// Layers 2-over, 4, 5 and 6. All flat passes: they're drawn in their own
// fixed order rather than joining the Y-sort, because none of them is
// something the character walks around — they're under your feet, on a
// table, on a wall, or overhead. Same bottom-center anchoring as every
// other placed item (drawGroundItemAt()).
/* --- Performance: walk only the tiles on screen ----------------------
   The flat layers (dirt, ground, ground overlay, upper, wall, ceiling)
   used to be walked in full every frame — every placed tile on the whole
   map was key-split and drawn, on or off screen. A big world (thousands
   of tiles) paid for all of them. Now, once a layer holds more tiles than
   the view can show, only the window around the view is looked up, row by
   row. Margins: art is bottom-centre anchored on its tile, so it can reach
   a few tiles sideways and up — not down. */
const FLAT_VIEW_PAD_COLS = 4, FLAT_VIEW_PAD_ROWS_ABOVE = 1, FLAT_VIEW_PAD_ROWS_BELOW = 8;
function forEachTileInView(layer, fn) {
  const c0 = Math.floor(camX / TILE) - FLAT_VIEW_PAD_COLS;
  const c1 = Math.ceil((camX + view.width / zoom) / TILE) + FLAT_VIEW_PAD_COLS;
  const r0 = Math.floor(camY / TILE) - FLAT_VIEW_PAD_ROWS_ABOVE;
  const r1 = Math.ceil((camY + view.height / zoom) / TILE) + FLAT_VIEW_PAD_ROWS_BELOW;
  if (layer.size <= (c1 - c0 + 1) * (r1 - r0 + 1)) {
    layer.forEach((type, key) => {
      const comma = key.indexOf(",");
      const col = +key.slice(0, comma), row = +key.slice(comma + 1);
      if (col < c0 || col > c1 || row < r0 || row > r1) return;
      fn(type, col, row);
    });
    return;
  }
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const type = layer.get(col + "," + row);
      if (type !== undefined) fn(type, col, row);
    }
  }
}

// Per request: a cliff wall right beside dirt stairs (a stairway cut into
// the cliff) gets a dark rock-coloured backing, so the gap its rounded side
// leaves next to the stairs reads as shadowed rock instead of a hole to the
// ground. The cliff's outer sides are left as they are.
const MOUNTAIN_INNER_BACKING = "#47281f"; // the wall art's darkest rock tone
function drawMountainInnerBacking(type, col, row) {
  if (typeof isMountainWall !== "function" || !isMountainWall(type)) return;
  if (!mountainStairsAt(col - 1, row) && !mountainStairsAt(col + 1, row)) return;
  const x = Math.round((col * TILE - camX) * zoom), y = Math.round((row * TILE - camY) * zoom);
  const size = Math.ceil(TILE * zoom);
  ctx.fillStyle = MOUNTAIN_INNER_BACKING;
  ctx.fillRect(x, y, size, size);
}

/* ---- tree shadows ------------------------------------------------------
   Per request: the shadow sheet (assets/shadows/Shadows.png) cut into one
   file per shadow, each tree drawn over the one that fits it — the leafy
   canopies over the canopy-shaped ones, bare trees / stumps / trunks over
   the ovals. Only by day: they fade out with the light at dusk
   (getDayFactor()) and aren't drawn at night. */
const TREE_SHADOW_FILES = ["ellipse_big", "ellipse_medium", "ellipse_small_a", "ellipse_small_b", "ellipse_tiny",
  "blob_a", "blob_b", "canopy_big", "canopy_medium", "canopy_small"];
const treeShadowArt = {};
for (const n of TREE_SHADOW_FILES) { treeShadowArt[n] = new Image(); treeShadowArt[n].src = "assets/shadows/" + n + ".png"; }
const TREE_SHADOW_FOR = {
  treeBigOrange: "canopy_big",
  treeMediumGreen: "canopy_medium", treeMediumLightGreen: "canopy_medium", treeMediumRed: "canopy_medium", treeMediumYellow: "canopy_medium",
  treeThinGreen: "canopy_small", treeThinOrange: "canopy_small", treeTinyGreen: "ellipse_small_b",
  treeThinNoLeaves1: "ellipse_small_a", treeThinNoLeaves2: "ellipse_small_a",
  treeBigCutStump: "ellipse_small_a", treeThinCutStump: "ellipse_tiny", treeTinyCutStump: "ellipse_tiny",
  treeMediumGreenTrunk: "blob_a", treeMediumRedYellowTrunk: "blob_a",
};
function drawTreeGroundShadows() {
  const day = typeof getDayFactor === "function" ? getDayFactor() : 1;
  if (day <= 0.03) return;
  ctx.save();
  ctx.globalAlpha = day;
  ctx.imageSmoothingEnabled = false;
  const win = typeof renderWin !== "undefined" && renderWin; // js/renderwindow.js
  forEachTileInView(objectLayer, (type, col, row) => {
    if (!/^tree/.test(type)) return;
    if (win && itemOffscreen(type, col, row)) return; // the tree isn't drawn, so no shadow either
    const art = treeShadowArt[TREE_SHADOW_FOR[type] || "ellipse_small_a"];
    if (!art || !art.width) return;
    // moves with the tree's own animation (wind lean, chop shake — js/plantfx.js)
    const dx = typeof plantFxShadowShift === "function" ? plantFxShadowShift(col, row, type) : 0;
    const cx = (col + 0.5) * TILE + dx, cy = (row + 1) * TILE - 3; // around the foot of the trunk
    ctx.drawImage(art, (cx - art.width / 2 - camX) * zoom, Math.round((cy - art.height / 2 - camY) * zoom), art.width * zoom, art.height * zoom);
  });
  // a tree being felled: its shadow swings out the way it falls, stretches
  // along the ground as it lands, and fades with it
  if (typeof fallingTrees !== "undefined") {
    for (const f of fallingTrees) {
      const art = treeShadowArt[TREE_SHADOW_FOR[f.type] || "ellipse_small_a"];
      if (!art || !art.width) continue;
      const fadeT = f.t - FELL_TIP_SECONDS - FELL_SETTLE_SECONDS;
      const fade = fadeT > 0 ? Math.max(0, 1 - fadeT / FELL_FADE_SECONDS) : 1;
      if (fade <= 0) continue;
      const p = Math.min(1, Math.abs(Math.sin(fallAngle(f))));
      const w = art.width * (1 + 0.6 * p), h = art.height * (1 - 0.25 * p);
      const cx = f.pivotX + f.dir * f.srcH * 0.5 * p, cy = f.pivotY - 3;
      ctx.globalAlpha = day * fade;
      ctx.drawImage(art, (cx - w / 2 - camX) * zoom, (cy - h / 2 - camY) * zoom, w * zoom, h * zoom);
    }
  }
  ctx.restore();
}

function drawGroundOverlay() {
  forEachTileInView(groundOverlayLayer, (type, col, row) => {
    if (itemDefs[type].depthBand) return; // mushrooms — Y-sorted with the player instead (renderWorldObjectsSorted())
    if (/^decoFlower/.test(type)) return; // the tall flowers — Y-sorted too (renderWorldObjectsSorted())
    drawMountainInnerBacking(type, col, row);
    // snowy mountain-wall bottoms while it snows (js/snowground.js) — drawing only
    drawGroundItemAt(snowSwapMountainType(type), col, row);
  });
}

function drawUpperLayer() {
  forEachTileInView(upperLayer, (type, col, row) => {
    if (itemDefs[type].depthBand) return; // crates — Y-sorted with the player instead (renderWorldObjectsSorted())
    drawGroundItemAt(type, col, row);
  });
}

function drawWallLayer() {
  forEachTileInView(wallLayer, (type, col, row) => {
    drawGroundItemAt(type, col, row);
  });
}

function drawCeilingLayer() {
  forEachTileInView(ceilingLayer, (type, col, row) => {
    drawGroundItemAt(type, col, row);
  });
}

function drawFlatGroundItems() {
  forEachTileInView(groundLayer, (type, col, row) => {
    if (itemDefs[type].depthBand) return; // Water Crates — Y-sorted with the player instead (renderWorldObjectsSorted())
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
  const angle = (sway ? sway.angle : 0) // -1..1ish, see wildgrass.js
    + (typeof windGrassAngle === "function" ? windGrassAngle(col, row) : 0); // gentle wind (js/plantfx.js)
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
  const type = getLayerItemId(wildgrassLayer, p.col, p.row);
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
// True when an item's art is completely off screen (with a margin as big
// as the art itself, so swaying trees / night art / odd anchors never pop).
// Off-screen items are skipped before sorting and drawing — the whole map
// used to be sorted and drawn every frame even though only a small part of
// it is ever visible (a big cost on a phone).
function itemOffscreen(type, col, row) {
  const d = itemDefs[type];
  const ic = d && d.icon;
  if (!ic || !ic.width) return false;
  const m = (32 + Math.max(ic.width, ic.height)) * zoom;
  const x = ((col + 0.5) * TILE - camX) * zoom, y = ((row + 1) * TILE - camY) * zoom;
  return x + m < 0 || y + m < 0 || x - m > view.width || y - m > view.height;
}

function renderWorldObjectsSorted() {
  const drawables = [];
  // Worked out up front because the objectLayer pass below needs it to
  // slot the sat-on bench in just behind the player (see `sittingOnThis`).
  const seatedPlayerSortY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;

  // Performance: only the rows/cols around the screen (row buckets, see layerRows()) instead of
  // walking every placed item on the map every frame.
  const objBody = (type, key) => {
    // Hidden while its own sleep animation is playing (drawSleepingBed()
    // below draws in its place instead) — per request, the two must
    // never show at once, or it looks like two beds stacked on top of
    // each other.
    if (player.sleeping && key === tileKey(player.sleepBedCol, player.sleepBedRow)) return;
    const [col, row] = key.split(",").map(Number);
    if (itemOffscreen(type, col, row)) return;
    // `alwaysBehindPlayer` (Flowering Bush, Mushroom (B) — per request,
    // "naka behind lang sa character"): skip the normal Y-sort entirely
    // and always draw before the player, regardless of relative
    // position — a flat -Infinity sort key beats every real sortY (which
    // is always a finite world-px row), so this item can never land
    // ahead of the player in the draw order.
    //
    // The ONE piece of furniture the player is currently sitting on
    // (js/furniture.js) gets the same treatment, for the same reason: a
    // bench sorts by its BOTTOM row, but a seated player's feet are on
    // one of the rows ABOVE that, so the normal sort would draw the
    // bench over the top of them — on the 5-tall vertical bench, seated
    // on its back seats, that hid the character almost completely.
    // Forcing it behind keeps the player visible on the seat.
    // The ONE piece of furniture being sat on is pulled to just BEHIND
    // the player. A bench sorts by its bottom row, but a seated player's
    // feet are on that same row or above it, so the normal sort can draw
    // the bench over the top of her.
    //
    // Note the sort key: just under the player's own, NOT -Infinity.
    // -Infinity put it behind literally everything in the scene, so any
    // grass tuft, fence or neighbouring object drew on top of the bench —
    // which is what made its backrest vanish the moment you sat down.
    // Sitting should only change where the bench is relative to the
    // PLAYER; everything else keeps sorting against it as usual.
    const sittingOnThis = player.sitting && col === player.sitAnchorCol && row === player.sitAnchorRow;
    const citizenOnThis = !sittingOnThis && typeof citizenSittingOn === "function" ? citizenSittingOn(col, row) : null; // js/citizens.js
    if (itemDefs[type].splitDepthTopRows && !sittingOnThis && !citizenOnThis) {
      pushSplitDepthDrawables(drawables, type, col, row, () => drawObjectLayerItem(type, col, row));
      return;
    }
    const sortY = itemDefs[type].alwaysBehindPlayer
      ? -Infinity
      : (sittingOnThis ? seatedPlayerSortY - 0.001
        : citizenOnThis ? citizenSortY(citizenOnThis) - 0.001
        : itemSortY(type, col, row));
    // bushes compare against characters' visible feet (drawableOrder())
    drawables.push({ sortY, bush: /^bush/.test(type) && sortY !== -Infinity, draw: () => drawObjectLayerItem(type, col, row) });
  };
  // phones: only the rows/cols round the screen (row buckets); the desktop walks the layer as before
  let vr0 = Math.floor(camY / TILE) - 3, vr1 = Math.ceil((camY + view.height / zoom) / TILE) + 14;
  let vc0 = Math.floor(camX / TILE) - 12, vc1 = Math.ceil((camX + view.width / zoom) / TILE) + 12;
  // Phones: only round the render window (js/renderwindow.js) — a few rows
  // below it for tall art (a tree whose base is further down still reaching
  // up into it), a few columns either side for wide art (houses). The exact
  // test is itemOffscreen() on each item's art.
  const rw = typeof renderWindowTiles === "function" ? renderWindowTiles() : null;
  if (rw) {
    vr0 = Math.max(vr0, rw.r0 - 2); vr1 = Math.min(vr1, rw.r1 + 10);
    vc0 = Math.max(vc0, rw.c0 - 6); vc1 = Math.min(vc1, rw.c1 + 6);
  }
  if (isMobileMode()) {
    const drawRows = layerRows(objectLayer, "drawObj", () => true);
    for (let r = vr0; r <= vr1; r++) { const a = drawRows.get(r); if (a) for (const e of a) if (e[0] >= vc0 && e[0] <= vc1) objBody(e[1], e[2]); }
  } else objectLayer.forEach(objBody);

  // `depthBand` items on the overlay layer (mushrooms), layer 4 (the
  // crates) and the ground layer (the Water Crates) — per request, these no longer sit permanently under / over
  // the player. They sort on the centre line of their solid band
  // (getDepthBandRect(), inventory.js): walk in from behind and they're
  // drawn over the character, walk in from the front and the character
  // is drawn over them.
  [groundLayer, groundOverlayLayer, upperLayer].forEach((layer, li) => {
    const bandBody = (type, key) => {
      const flower = layer === groundOverlayLayer && /^decoFlower/.test(type);
      if (!itemDefs[type].depthBand && !flower) return;
      const [col, row] = key.split(",").map(Number);
      if (itemOffscreen(type, col, row)) return;
      // The tall flowers (per request): over a character whose shoes are
      // above their base, under one whose shoes have passed it — the same
      // visible-feet rule as the bushes (drawableOrder()).
      drawables.push({ sortY: flower ? (row + 1) * TILE : itemSortY(type, col, row), bush: flower, draw: () => drawGroundItemAt(type, col, row) });
    };
    if (isMobileMode()) {
      const bandRows = layerRows(layer, "relightBand" + li, (type) => { const def = itemDefs[type]; return !!(def && (def.depthBand || (layer === groundOverlayLayer && /^decoFlower/.test(type)))); });
      for (let r = vr0; r <= vr1; r++) { const a = bandRows.get(r); if (a) for (const e of a) if (e[0] >= vc0 && e[0] <= vc1) bandBody(e[1], e[2]); }
    } else layer.forEach(bandBody);
  });

  // Port Bridge (bridgeLayer): each connected bridge is ONE drawable,
  // Y-sorted on its bottom edge like a big object. So a tree or anyone
  // standing below the bridge draws over it (no more bridge on top of the
  // trees, per request), while anything whose feet are inside the bridge's
  // span — under it — is covered by it. The player, while up on it
  // (player.elevated), is sorted just past the bridge instead (below).
  bridgeComponentsThisFrame = computeBridgeComponents();
  for (const comp of bridgeComponentsThisFrame) {
    drawables.push({ sortY: comp.bottom, draw: () => drawBridgeComponent(comp) });
  }

  const playerTile = getPlayerTile();
  const playerDecorKey = tileKey(playerTile.col, playerTile.row);
  const wildBody = (type, key) => {
    if (key === playerDecorKey) return; // handled specially — see drawPlayerStandingDecor()
    const [col, row] = key.split(",").map(Number);
    if (itemOffscreen(type, col, row)) return;
    // Pebbles / XXS Stone lie flat on the ground: per request ("yung mga
    // pebble na stone is dapat naka overlap yung character sa pebble laging
    // behind") they sort before everything, so the player and every NPC /
    // animal always draw on top of them, from any side.
    const sortY = itemDefs[type].pebble ? -Infinity : (row + 1) * TILE;
    // The tall flowers overlap like the bushes (drawableOrder()): over a
    // character whose shoes are above their base, under one whose shoes have passed it.
    drawables.push({ sortY, bush: /^decoFlower/.test(type), draw: () => drawWildgrassWhole(type, col, row) });
  };
  if (isMobileMode()) {
    const wildRows = layerRows(wildgrassLayer, "drawWild", () => true);
    for (let r = vr0; r <= vr1; r++) { const a = wildRows.get(r); if (a) for (const e of a) if (e[0] >= vc0 && e[0] <= vc1) wildBody(e[1], e[2]); }
  } else wildgrassLayer.forEach(wildBody);

  if (player.sleeping) {
    // Drawn at the BED's own position, not the player's (they're not
    // even standing on the same tile outside — see drawSleepingBed()'s
    // comment above) — sorted by the bed's row like any other object.
    drawables.push({ sortY: (player.sleepBedRow + 1) * TILE, draw: () => drawSleepingBed() });
  } else {
    const playerFeetWorldY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
    drawables.push({
      sortY: elevatedPlayerSortY(playerFeetWorldY),
      feetY: player.elevated ? undefined : playerFeetWorldY,
      character: true,
      draw: () => drawPlayer((player.x - camX) * zoom, (player.y - camY) * zoom, zoom),
    });
  }

  // The NPC shopkeeper (js/npc.js) — same Y-sort treatment as the player,
  // so walking above/below it occludes correctly instead of it always
  // drawing on top or underneath regardless of position. Skipped entirely
  // once she's gone indoors for the night (her sleep schedule, npc.js) —
  // she's drawn inside the room instead, by renderInteriorScene().
  if (npc.scene === "outside" && currentWorld === "main") {
    const npcFeetWorldY = npc.y + (SPRITE_FEET_FRACTION - 0.5) * NPC_DRAW_SIZE;
    drawables.push({
      sortY: npcFeetWorldY,
      character: true,
      draw: () => drawNPC((npc.x - camX) * zoom, (npc.y - camY) * zoom, zoom),
    });
  }

  // Tavern customers walking around outside (js/customers.js).
  for (const d of customerDrawables()) drawables.push(d);
  // Citizens B-E wandering the map (js/citizens.js) — sorted on their
  // 25%-up overlap line, see citizenSortY().
  for (const d of citizenDrawables()) drawables.push(d);
  // Farm animals wandering the map (js/animals.js) — plain feet Y-sort.
  for (const d of animalDrawables()) drawables.push(d);
  if (typeof farmDrawables === "function") for (const d of farmDrawables()) drawables.push(d); // crops + the harvest collector (js/farm.js)
  if (typeof fallingTreeDrawables === "function") for (const d of fallingTreeDrawables()) drawables.push(d); // a felled tree toppling (js/plantfx.js)
  if (typeof mineIndoorDrawables === "function") for (const d of mineIndoorDrawables()) drawables.push(d); // mobs + drops in the east worlds (js/mines.js)
  if (typeof treasureDrawables === "function") for (const d of treasureDrawables()) drawables.push(d); // crystals + hidden chests (js/treasure.js)

  drawables.sort(drawableOrder);
  drawables.forEach((d) => d.draw());
}

// The bridges on the map, each a 4-connected group of bridge tiles
// (stairs excluded): { tiles: [[col,row,type]], left/right/top/bottom in
// world px }. Rebuilt every frame (a handful of tiles); also read by
// relightOccluders() later in the same frame.
let bridgeComponentsThisFrame = [];
let bridgeCompCache = null, bridgeCompVer = -1, bridgeCompWorld = null;
function computeBridgeComponents() {
  // Performance: the flood fill over every bridge tile ran every frame; the
  // bridges only change when one is placed / removed (or the world changes).
  const ver = layerVersions.get(bridgeLayer);
  if (bridgeCompCache && ver !== undefined && ver === bridgeCompVer && bridgeCompWorld === currentWorld) return bridgeCompCache;
  bridgeCompCache = computeBridgeComponentsNow();
  bridgeCompVer = ver; bridgeCompWorld = currentWorld;
  return bridgeCompCache;
}
function computeBridgeComponentsNow() {
  const seen = new Set();
  const comps = [];
  bridgeLayer.forEach((type, key) => {
    if (seen.has(key) || itemDefs[type].isStairs) return;
    const comp = { tiles: [], left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    const stack = [key];
    seen.add(key);
    while (stack.length) {
      const k = stack.pop();
      const [col, row] = k.split(",").map(Number);
      comp.tiles.push([col, row, bridgeLayer.get(k)]);
      comp.left = Math.min(comp.left, col * TILE);
      comp.right = Math.max(comp.right, (col + 1) * TILE);
      comp.top = Math.min(comp.top, row * TILE);
      comp.bottom = Math.max(comp.bottom, (row + 1) * TILE);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = tileKey(col + dc, row + dr);
        const nt = bridgeLayer.get(nk);
        if (nt && !seen.has(nk) && !itemDefs[nt].isStairs) { seen.add(nk); stack.push(nk); }
      }
    }
    comps.push(comp);
  });
  return comps;
}

function drawBridgeComponent(comp) {
  // Phones: only the tiles near the screen (a long bridge was ~250 draws a frame).
  if (isMobileMode()) {
    const c0 = Math.floor(camX / TILE) - 2, c1 = Math.ceil((camX + view.width / zoom) / TILE) + 2;
    const r0 = Math.floor(camY / TILE) - 2, r1 = Math.ceil((camY + view.height / zoom) / TILE) + 4;
    const rw = typeof renderWindowTiles === "function" ? renderWindowTiles() : null; // the render window (js/renderwindow.js)
    for (const [col, row, type] of comp.tiles) {
      if (col < c0 || col > c1 || row < r0 || row > r1) continue;
      if (rw && (col < rw.c0 || col > rw.c1 || row < rw.r0 || row > rw.r1)) continue;
      drawGroundItemAt(type, col, row);
    }
    return;
  }
  for (const [col, row, type] of comp.tiles) drawGroundItemAt(type, col, row);
}

// Up on a bridge the player must draw over it even though their feet are
// inside its span: sort them just past the bottom of every bridge their
// sprite overlaps.
// Draw order for the depth-sorted pass: plain sortY, except between an
// animal and a character (player, Maria, customers, citizens) — per request
// ("kapag yung paa ng character or mga npc is nakalagpas sa paa ng mga yun
// is mag overlap na yung character or npcs sa mga animals"): there it's
// feet against feet, so the moment someone's feet are below the animal's
// feet they draw over it. Characters carry `feetY` when their sortY isn't
// their feet (citizens sort on a line 25% up their body).
//
// "Feet" here are the VISIBLE feet: the characters' usual sort point
// (SPRITE_FEET_FRACTION, 0.62 of the frame) sits ~6 world px above the
// soles they're drawn with (the lowest foot pixel is row 47 of 64), which
// is why a sheep or bush whose base was above the character's shoes still
// covered them. Same rule for bushes ("ganyan din dapat sa bushes"): a bush
// sorts on its base (the tile's bottom edge) against the visible feet.
const CHARACTER_VISIBLE_FEET_EXTRA = (48 / 64 - SPRITE_FEET_FRACTION) * DRAW_SIZE;
function characterVisibleFeet(d) {
  return (d.feetY != null ? d.feetY : d.sortY) + CHARACTER_VISIBLE_FEET_EXTRA;
}
function drawableOrder(a, b) {
  const aChar = a.feetY != null || a.character, bChar = b.feetY != null || b.character;
  if ((a.animal || a.bush) && bChar) return a.sortY - characterVisibleFeet(b) || -1;
  if ((b.animal || b.bush) && aChar) return characterVisibleFeet(a) - b.sortY || 1;
  return a.sortY - b.sortY;
}

function elevatedPlayerSortY(feetY) {
  if (!player.elevated) return feetY;
  const half = DRAW_SIZE / 2;
  let y = feetY;
  for (const comp of bridgeComponentsThisFrame) {
    if (player.x + half <= comp.left || player.x - half >= comp.right) continue;
    if (player.y + half <= comp.top || player.y - half >= comp.bottom) continue;
    y = Math.max(y, comp.bottom + 0.01);
  }
  return y;
}

// Dirt Stairs (bridgeLayer, isStairs): on the ground/cliff, under every
// character — drawn right after the ground overlay (render()).
function drawStairsLayer() {
  bridgeLayer.forEach((type, key) => {
    if (!itemDefs[type].isStairs) return;
    const [col, row] = key.split(",").map(Number);
    drawGroundItemAt(type, col, row);
  });
}

function drawPlacementRange(camX, camY) {
  // Shows the placement highlight for EITHER hold mechanism — the
  // inventory-based `heldItem`, or the E-key `player.grabbedType`
  // (js/inventory.js's tryGrabOrPlaceInFront()) — per request ("kapag
  // e-hold, dapat kita pa rin yung tile"). Only one is ever active at a
  // time in practice, so `heldItem` wins if somehow both were set.
  const holdingType = heldItem ? heldItem.type : player.grabbedType;
  if (!holdingType) return;
  if (itemDefs[holdingType].seedOf) return; // seeds: only tilled tiles light up (drawFarmHighlights(), js/farm.js)

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
      const color = ((existingId === null || canReplaceGroundItem(existingId, holdingType)) && !isOwnTileAndCollides)
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
  if (!heldItem && player.grabbedType) { // carried (E grab): left-click puts it down here (placeGrabbedAtClick(), inventory.js)
    const { col, row } = screenToTile(lastMouseClientX, lastMouseClientY);
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS || !isWithinPlacementRange(col, row)) return;
    drawHeldGhostAt(player.grabbedType, col, row, camX, camY, !canPlaceGrabbedOutdoorAt(player.grabbedType, col, row));
    return;
  }
  if (!heldItem) return;
  const type = heldItem.type;
  const def = itemDefs[type];
  if (def.seedOf) return; // seeds aren't placed as objects — they're planted (js/farm.js)
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
  if (!heldItem && player.grabbedType) { // carried (E grab): left-click puts it down here (placeGrabbedIndoorAt(), interior.js)
    const { col, row } = screenToTile(lastMouseClientX, lastMouseClientY);
    const p = interiorFeetTileAt(player.x, player.y);
    if (Math.max(Math.abs(col - p.col), Math.abs(row - p.row)) > PLACEMENT_RANGE) return;
    if (isBuildingType(itemDefs[player.grabbedType])) return;
    drawHeldGhostAt(player.grabbedType, col, row, camX, camY, !grabbedIndoorTarget(room, player.grabbedType, col, row));
    return;
  }
  if (!heldItem) return;
  const type = heldItem.type;
  const def = itemDefs[type];
  if (isBuildingType(def)) return; // only buildings are refused indoors (js/interior.js) — furniture previews like anything else
  const { col, row } = screenToTile(lastMouseClientX, lastMouseClientY);
  const maxCol = Math.ceil(room.width / TILE) - 1;
  const maxRow = Math.ceil(room.height / TILE) - 1;
  if (col < 0 || row < 0 || col > maxCol || row > maxRow) return;

  const targetMap = def.interiorOnly ? room.collisions : interiorMapFor(room, type);
  const p = interiorFeetTileAt(player.x, player.y);
  // Exactly the rules a click would apply (placeInteriorDecorAt()), so
  // the see-through preview turns red whenever a click here would fail.
  const blocked =
    targetMap.has(tileKey(col, row)) ||
    (def.interiorOnly && col === p.col && row === p.row) ||
    Math.max(Math.abs(col - p.col), Math.abs(row - p.row)) > PLACEMENT_RANGE ||
    (!def.interiorOnly && (isInteriorPlacementBlocked(room, type, col, row) || interiorFootprintCoversPlayer(type, col, row)));
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
  if (isBuildingType(def)) return; // buildings are never placeable indoors — nothing to preview

  // `interiorOnly` (the Collision Block) targets `room.collisions`;
  // every other item targets `room.decor` — same routing
  // placeHeldItemAt() (inventory.js) uses to decide which of
  // placeInteriorCollisionAt()/placeInteriorDecorAt() actually runs.
  const isCollisionItem = !!def.interiorOnly;
  const targetMap = isCollisionItem ? room.collisions : interiorMapFor(room, holdingType);

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
      const isOwnTileBlocked = isCollisionItem
        ? (col === p.col && row === p.row)
        : interiorFootprintCoversPlayer(holdingType, col, row); // solid furniture can't be dropped on top of you
      // Wall tiles read red for anything that stands on the floor — see
      // isInteriorPlacementBlocked() (js/interior.js). Layers 4-6 belong
      // up there, so for those this stays white.
      const onWall = isInteriorPlacementBlocked(room, holdingType, col, row);
      const color = (!occupied && !isOwnTileBlocked && !onWall)
        ? "rgba(255,255,255,0.55)"
        : "rgba(220,40,40,0.9)";

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(screenX + 0.5, screenY + 0.5, size - 1, size - 1);
    }
  }
}

// Room Pickaxe / Room Hammer equipped inside a tile-shaped room
// (js/roomCustomizer.js): the same white tile-border grid as holding an
// item, so it reads the same way, plus the ONE tile F would dig (pickaxe)
// or fill (hammer) outlined thicker — white when the swing will work, red
// when it won't (roomToolTarget() runs the exact same checks the swing does).
function drawRoomToolHighlight(room, camX, camY) {
  if (heldItem || player.grabbedType) return; // the held-item grid is already showing
  const tool = player.equippedWeapon;
  if (typeof isRoomTool !== "function" || !isRoomTool(tool) || !isRoomCustomizable(room) || !room.custom) return;
  const p = interiorFeetTileAt(player.x, player.y);
  const size = TILE * zoom;
  const maxCol = Math.ceil(room.width / TILE) - 1;
  const maxRow = Math.ceil(room.height / TILE) - 1;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  for (let row = p.row - PLACEMENT_RANGE; row <= p.row + PLACEMENT_RANGE; row++) {
    for (let col = p.col - PLACEMENT_RANGE; col <= p.col + PLACEMENT_RANGE; col++) {
      if (col < 0 || row < 0 || col > maxCol || row > maxRow) continue;
      const sx = Math.round((col * TILE - camX) * zoom), sy = Math.round((row * TILE - camY) * zoom);
      ctx.strokeRect(sx + 0.5, sy + 0.5, size - 1, size - 1);
    }
  }
  // The strip the next swing would change: aimed by the mouse when it's in
  // reach (a click swings there), otherwise what F would hit in front.
  const m = screenToTile(lastMouseClientX, lastMouseClientY);
  const mouseIn = Math.max(Math.abs(m.col - p.col), Math.abs(m.row - p.row)) <= ROOM_TOOL_REACH;
  let plan;
  if (roomDrag && roomDrag.tool === tool) plan = currentRoomToolPlan(room, tool, { from: roomDrag.anchor, to: m }); // dragging: the rectangle so far
  else plan = mouseIn ? roomToolTarget(room, tool, m) : roomToolTarget(room, tool, null);
  for (const t of plan.tiles) {
    const ok = plan.ok && t.ok;
    if (!ok && plan.ok) continue; // a skipped tile of a good strip: leave it unmarked
    const sx = Math.round((t.col * TILE - camX) * zoom), sy = Math.round((t.row * TILE - camY) * zoom);
    ctx.fillStyle = ok ? "rgba(255,255,255,0.22)" : "rgba(220,40,40,0.25)";
    ctx.fillRect(sx, sy, size, size);
    ctx.strokeStyle = ok ? "rgba(255,255,255,0.95)" : "rgba(220,40,40,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2);
  }
  ctx.lineWidth = 1;
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
// `splitDepthTopRows` (chairRight / chairLeft): the item is pushed into
// the depth sort as TWO slices instead of one, each clipped to its own
// tile rows —
//   - the TOP slice (the backrest tile) sorts on the line between the
//     top and bottom tile, so a character standing ON the top tile (it's
//     walkable — `footprintExcludeBackRows`) is drawn UNDER it;
//   - the BOTTOM slice (seat + legs) sorts at the top of the top tile,
//     so any character standing on the top tile or lower is drawn OVER
//     it.
// A character in front of the chair (below it) still covers both.
// The seam is rounded to a whole screen pixel so the two slices meet
// without a hairline gap.
function pushSplitDepthDrawables(list, type, col, row, drawFn) {
  const topRows = itemDefs[type].splitDepthTopRows;
  const seamWorldY = (row + 1 - topRows) * TILE; // bottom edge of the top slice
  const seamY = Math.round((seamWorldY - camY) * zoom);
  const BIG = 1e6;
  const clipped = (y0, y1) => () => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-BIG, y0, BIG * 2, y1 - y0);
    ctx.clip();
    drawFn();
    ctx.restore();
  };
  list.push({ sortY: seamWorldY - topRows * TILE, draw: clipped(seamY, BIG) });  // bottom slice
  list.push({ sortY: seamWorldY, draw: clipped(-BIG, seamY) });                  // top slice
}

// Something that stands on an indoor floor and should be depth-sorted
// with the characters (layer 3, not flat).
function isIndoorStandingDecor(type) {
  const def = itemDefs[type];
  return !!def && layerNumberForType(type) === 3 && !def.flat;
}

// One indoor decor item, bottom-centre anchored on its tile.
function drawIndoorDecorItem(type, col, row) {
  if (itemDefs[type].artRoot || itemDefs[type].litWindow) {
    const r = drawFlatItemArt(type, col, row);
    if (itemDefs[type].sittable) drawSitHighlight(type, col, row, r);
    return;
  }
  const icon = itemDefs[type].icon;
  const w = icon.width * zoom;
  const h = icon.height * zoom;
  const tileCenterX = (col + 0.5) * TILE;
  const tileBottomY = (row + 1) * TILE;
  const screenX = (tileCenterX - camX) * zoom - w / 2;
  const screenY = (tileBottomY - camY) * zoom - h;
  // `fadeWithDaylight` (Lit Windows) dims with the outdoor clock.
  const fade = itemDefs[type].fadeWithDaylight;
  if (fade) ctx.globalAlpha = getDayFactor();
  ctx.drawImage(icon, screenX, screenY, w, h);
  if (fade) ctx.globalAlpha = 1;
  if (itemDefs[type].sittable) drawSitHighlight(type, col, row, { x: screenX, y: screenY, w, h });
}

// Something on top of a table indoors (room.tableTop, js/interior.js) —
// per request, the Tray on the bartender table. Centred on the table's
// top surface (`tableSurfaceY`, or 40% down its visible art), not on the
// floor tile, so it sits ON the counter.
function drawTableTopItem(room, type, col, row) {
  const def = itemDefs[type];
  if (def.isTray && typeof trayIsAway === "function" && trayIsAway(player.activeRoomId, tileKey(col, row))) return; // being carried
  const icon = def.isTray && typeof trayImageFor === "function" ? trayImageFor(player.activeRoomId, tileKey(col, row)) : def.icon;
  if (!icon || !icon.width) return;
  const surfaceY = tableTopCentreY(room, col, row); // js/interior.js
  const w = icon.width * zoom, h = icon.height * zoom;
  const x = ((col + 0.5) * TILE - camX) * zoom - w / 2;
  const y = (surfaceY - camY) * zoom - h / 2;
  ctx.drawImage(icon, x, y, w, h);
}

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
  // house"). The clamp below can only ever return 0 in that case
  // (`room.width - viewWorldW` is negative, and Math.max floors it at
  // 0), which pushed a small room hard against the left/top edge with
  // dead space filling the rest of the view. Offsetting by half the
  // difference — a NEGATIVE scroll — puts the room in the middle
  // instead. Rooms bigger than the screen still scroll and clamp exactly
  // as before.
  // Caves: the camera stays centred on the player (no clamping to the
  // cave's edge) — per request ("medyo center yung map medyo gilid kasi
  // yung iba") — and beyond the cave is plain black.
  const isCave = !!(room.custom && room.custom.floor === "cave");
  if (isCave) {
    camX = player.x - viewWorldW / 2;
    camY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE - viewWorldH / 2;
  } else {
    camX = room.width <= viewWorldW
      ? (room.width - viewWorldW) / 2
      : clamp(player.x - viewWorldW / 2, 0, room.width - viewWorldW);
    camY = room.height <= viewWorldH
      ? (room.height - viewWorldH) / 2
      : clamp(player.y - viewWorldH / 2, 0, room.height - viewWorldH);
  }

  // Snap the camera to whole canvas pixels. A camera between pixels makes
  // the un-smoothed pixel art land on a different pixel each frame, so the
  // whole map shimmers/jitters while walking (very visible on a phone).
  camX = Math.round(camX * zoom) / zoom;
  camY = Math.round(camY * zoom) / zoom;

  ctx.clearRect(0, 0, vw, vh);
  ctx.fillStyle = isCave ? "#000" : "#0a0a0a";
  ctx.fillRect(0, 0, vw, vh);
  {
    // only the part of the room picture that's on screen (the camera may look past its edges)
    const sx = Math.max(0, camX), sy = Math.max(0, camY);
    const ex = Math.min(room.width, camX + viewWorldW), ey = Math.min(room.height, camY + viewWorldH);
    if (ex > sx && ey > sy) ctx.drawImage(room.image, sx, sy, ex - sx, ey - sy, (sx - camX) * zoom, (sy - camY) * zoom, (ex - sx) * zoom, (ey - sy) * zoom);
  }

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
  // Indoor decor, split three ways — per request ("dapat yung table laging
  // naka overlap sa character"). Before, every indoor item was drawn
  // first and the characters on top, so a table could never cover
  // someone standing behind it:
  //   - things that STAND on the floor (tables, chairs, beds, stoves...)
  //     now join the depth sort with the player and Maria below, same
  //     rule as outdoors — whoever's lower on screen is in front;
  //   - flat things and wall decor stay underneath everyone;
  //   - things on top of furniture (layer 4) and the ceiling (layer 6)
  //     go on after, like outdoors' drawUpperLayer()/drawCeilingLayer().
  // The floor pieces (floor tiles, mats, light patches) first, under
  // everything else in the room.
  const indoorChars = []; // player + Maria + standing furniture, depth-sorted below
  if (room.floorDecor) {
    for (const [key, type] of room.floorDecor) {
      if (!itemDefs[type]) continue;
      const [col, row] = key.split(",").map(Number);
      if (itemDefs[type].depthBand) { // a mushroom brought indoors — overlaps both ways, like outside
        indoorChars.push({ sortY: itemSortY(type, col, row), draw: () => drawIndoorDecorItem(type, col, row) });
        continue;
      }
      drawIndoorDecorItem(type, col, row);
    }
  }

  const indoorOnTop = [];
  const seatedSortY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  for (const [key, type] of room.decor) {
    if (player.sleeping && key === tileKey(player.sleepBedCol, player.sleepBedRow)) continue;
    if (isNpcSleepingInRoom(player.activeRoomId) && key === tileKey(npc.sleepBedCol, npc.sleepBedRow)) continue;
    const [col, row] = key.split(",").map(Number);
    const layerN = layerNumberForType(type);
    if (itemDefs[type].depthBand) {
      // Crates (and anything else with a depthBand) — sorted on their
      // band's centre line instead of their tile's bottom edge, and pulled
      // out of layer 4's "always on top" pass.
      indoorChars.push({ sortY: itemSortY(type, col, row), draw: () => drawIndoorDecorItem(type, col, row) });
    } else if (isIndoorStandingDecor(type)) {
      // The seat being sat on goes just BEHIND the player, same as outdoors.
      const sittingOnThis = player.sitting && col === player.sitAnchorCol && row === player.sitAnchorRow;
      const customerOnThis = customerSittingAt(player.activeRoomId, col, row); // js/customers.js
      if (itemDefs[type].splitDepthTopRows && !sittingOnThis && !customerOnThis) {
        pushSplitDepthDrawables(indoorChars, type, col, row, () => drawIndoorDecorItem(type, col, row));
        continue;
      }
      indoorChars.push({
        sortY: sittingOnThis ? seatedSortY - 0.001 : customerOnThis ? customerOnThis.fy - 0.001 : (row + 1) * TILE,
        draw: () => drawIndoorDecorItem(type, col, row),
      });
    } else if (layerN === 4 || layerN === 6) {
      // A Tray standing on the floor still shows what's on it.
      if (itemDefs[type].isTray) indoorOnTop.push(() => drawTableTopItem(room, type, col, row));
      else indoorOnTop.push(() => drawIndoorDecorItem(type, col, row));
    } else {
      drawIndoorDecorItem(type, col, row);
    }
  }
  // Things on top of tables (the Tray on the bartender table) — depth-
  // sorted right after their table, per request: drawn over the table,
  // but a character standing in front of the counter overlaps them.
  if (room.tableTop) {
    for (const [key, type] of room.tableTop) {
      if (!itemDefs[type]) continue;
      const [col, row] = key.split(",").map(Number);
      const table = interiorTableAt(room, col, row);
      const sortY = ((table ? table.row : row) + 1) * TILE + 0.001;
      indoorChars.push({ sortY, draw: () => drawTableTopItem(room, type, col, row) });
    }
  }

  if (player.sleeping) {
    indoorChars.push({ sortY: (player.sleepBedRow + 1) * TILE, draw: () => drawSleepingBed() });
  } else {
    indoorChars.push({
      sortY: player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE,
      draw: () => drawPlayer((player.x - camX) * zoom, (player.y - camY) * zoom, zoom),
    });
  }

  // Maria, if she's in THIS room right now — tucked into her bed, or
  // walking/standing around. Per request ("yung npc parang laging nasa
  // front lang ng character dapat nag overlap din yung character sa
  // kanya"), she and the player are now depth-sorted by their feet, the
  // same way they are outdoors: whoever is lower on screen is in front.
  if (npc.scene === "inside" && npc.roomId === player.activeRoomId) {
    if (npc.sleeping) {
      indoorChars.push({ sortY: (npc.sleepBedRow + 1) * TILE, draw: () => drawNpcSleepingBed() });
    } else {
      indoorChars.push({
        sortY: npc.inY + (SPRITE_FEET_FRACTION - 0.5) * NPC_DRAW_SIZE,
        draw: () => drawNPC((npc.inX - camX) * zoom, (npc.inY - camY) * zoom, zoom),
      });
    }
  }
  for (const d of customerDrawables()) indoorChars.push(d); // tavern customers (js/customers.js)
  for (const d of citizenIndoorDrawables(player.activeRoomId)) indoorChars.push(d); // citizens sheltering here for the night (js/citizens.js)
  if (typeof mineIndoorDrawables === "function") for (const d of mineIndoorDrawables(player.activeRoomId)) indoorChars.push(d); // mobs + their drops (js/mines.js)
  if (typeof shopKeeperDrawables === "function") for (const d of shopKeeperDrawables()) indoorChars.push(d);
  if (typeof treasureDrawables === "function") for (const d of treasureDrawables()) indoorChars.push(d); // crystals + hidden chests (js/treasure.js) // the Smith / the Alchemist (js/shops.js)
  indoorChars.sort((a, b) => a.sortY - b.sortY);
  indoorChars.forEach((c) => c.draw());
  indoorOnTop.forEach((d) => d()); // things on top of furniture + ceiling, over everyone
  if (typeof drawTrayInfo === "function") drawTrayInfo(room); // hold Alt: what's left on each Tray (js/waiter.js)
  if (typeof drawWaiterTableThings === "function") drawWaiterTableThings(); // empty plates/mugs on tables + Maria getting paid (js/waiter.js)
  drawCustomerFoodAndBubbles(); // customers' meals on the tables + order bubbles (js/customers.js)

  drawThrownTosses(); // T-key throw arc for a grabbed Collision Block (js/inventory.js's tryThrowGrabbedInteriorItem(), interior.js) — same visual as the outdoor throw
  drawInteriorHeldItemGhost(room, camX, camY); // see-through mock-up of what's held, under the cursor — drawn BEFORE the grid so the outline stays readable on top of it
  drawInteriorPlacementRange(room, camX, camY); // white/red tile-border grid while holding something, same idea as drawPlacementRange() outdoors
  drawRoomToolHighlight(room, camX, camY); // Room Pickaxe/Hammer: same grid + the one tile F will change (js/roomCustomizer.js)

  // Day/night sky tint indoors — per request ("kung ano yung dilim sa
  // labas kapag nagagagabi ganun din [sa loob]... nag fafade yung kulay
  // pa gabi tapos paumaga ganun din babalik lang sa normal color"): the
  // room used to stay the same brightness at 3am as at noon. This reuses
  // the EXACT same shared clock + easing (js/daynight.js's
  // getSkyOverlayColor()/getDayFactor()) the outdoor view uses, so the
  // room fades toward night and back to normal on the same smooth
  // twilight ramp, in lockstep with outside, instead of snapping.
  //
  // ...unless the house's owner is home (getIndoorLighting()
  // below): then the lights are on and the washes are faded out, so the
  // room keeps its daytime colours at night.
  const lighting = getIndoorLighting();
  if (lighting.clock > 0.001) {
    ctx.save();
    ctx.globalAlpha = lighting.clock;
    drawNightWash(getSkyOverlayColor(), (1 - getDayFactor()) * INDOOR_NIGHT_K, vw, vh, INDOOR_NIGHT_K); // the same Stardew-like night as outdoors, a bit lighter indoors
    ctx.restore();
  }
  if (lighting.ownerDark > 0.001) {
    // Owner asleep: the fixed 8pm look, whatever the clock says.
    ctx.save();
    ctx.globalAlpha = lighting.ownerDark;
    drawNightWash(ROOM_NIGHT_SKY_COLOR, INDOOR_NIGHT_K, vw, vh, INDOOR_NIGHT_K);
    ctx.restore();
  }
  if (typeof treasureLights === "function") treasureLights(); // the crystals' blue glow (js/treasure.js)
  drawIndoorLampGlows(room, lighting.candle); // lamps and wall candles in the room shine too (caves: always)
  flushSceneLights(); // the candles, merged, after the washes — same as outdoors
  drawCharacterNightRelights(); // and the same relight, so the player (and Maria, if she's in this room) keep their colours indoors too
  if (isCave) drawCaveFog(room, vw, vh);
  if (typeof drawMineOverlay === "function") drawMineOverlay(); // damage numbers, drops flying to you, the hurt flash (js/mines.js)
  if (typeof drawTreasureOverlay === "function") drawTreasureOverlay(); // chest glints, loot popups (js/treasure.js)

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
  // 0 through twilight) and not on a Rainy/Snow day either.
  setVignetteBlur(getDayFactor() >= 1 && getCurrentWeather().name === "Sunny");
}
// Performance: the blur is the #vignette-blur overlay (style.css) — the
// browser blurs what's behind it on the GPU. Drawing a blurred copy of the
// frame ourselves meant reading the whole canvas back mid-frame, which
// stalled every frame (~20-70 ms measured). Here we only switch it on/off.
let vignetteEl = null, vignetteOn = null;
function setVignetteBlur(on) {
  if (vignetteOn === on) return;
  vignetteOn = on;
  if (!vignetteEl) vignetteEl = document.getElementById("vignette-blur");
  if (vignetteEl) vignetteEl.classList.toggle("on", on);
}

// A distinct blue night tint — per request ("kapag gabi... kaya ba ng
// parang may pagka blue yung paligid?"). The existing day/night sky
// overlay (getSkyOverlayColor(), js/daynight.js) already darkens toward
// a navy color at night, but at its actual alpha that reads mostly as
// "dim", the blue in it barely registering. This is a SEPARATE, gentler
// wash — low alpha, clearly blue rather than just dark — layered on top
// of that overlay (not replacing it) so night specifically picks up an
// obvious cool/moonlit cast rather than just losing brightness.
const NIGHT_BLUE_TINT = "rgba(52,86,200,0.2)"; // per request: night reads blue, like Stardew Valley

// The sky tint with the night blue cast laid over it, as one rgba colour:
// a1/c1 then a2/c2 over a scene S gives S(1-a1)(1-a2) + c1 a1 (1-a2) + c2 a2,
// i.e. alpha A = 1-(1-a1)(1-a2) and colour (c1 a1 (1-a2) + c2 a2) / A.
const RGBA_RE = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/;
function skyAndNightTint(skyColor) {
  const nightFactor = 1 - getDayFactor();
  if (nightFactor <= 0) return skyColor;
  const m1 = RGBA_RE.exec(skyColor), m2 = RGBA_RE.exec(NIGHT_BLUE_TINT);
  if (!m1 || !m2) return skyColor;
  const a1 = m1[4] === undefined ? 1 : +m1[4];
  const a2 = (m2[4] === undefined ? 1 : +m2[4]) * nightFactor;
  const A = 1 - (1 - a1) * (1 - a2);
  if (A <= 0) return skyColor;
  const mix = (i) => Math.round((+m1[i] * a1 * (1 - a2) + +m2[i] * a2) / A);
  return "rgba(" + mix(1) + "," + mix(2) + "," + mix(3) + "," + A.toFixed(4) + ")";
}

/* Stardew-like night — per request (a Stardew screenshot: "ganitong itsura dapat
   kapag gabi sa lahat"): the night used to be a flat navy laid OVER the scene
   at 60%, which greys every colour out. Now most of the darkening is a
   MULTIPLY by a saturated moonlight blue (NIGHT_MULTIPLY_RGB) — colours stay
   rich, everything leans blue — plus a light navy wash (NIGHT_SKY_ALPHA, now
   0.2) for depth. The lamps / candles then add their warm pools on top
   (flushSceneLights()). Used outdoors and in every room. The caller's
   globalAlpha fades the whole thing (indoor clock / owner weights). */
const NIGHT_MULTIPLY_RGB = [58, 72, 170];
const INDOOR_NIGHT_K = 0.88; // rooms: a little lighter than outdoors so they stay readable (Stardew-like)
// The night is a MULTIPLY by a moonlit blue, applied with the lights in
// flushSceneLights(): the lights are added into that blue mask first
// (nightMulPending), so where a lamp / candle shines the mask turns warm
// and white and the scene shows its own colours, warm-lit — Stardew's
// look — instead of light being added on top of a fogged-over scene.
let nightMulPending = null; // [r,g,b] 0..1, product of this frame's night washes
let nightAmbientK = 0;      // how much moonlit blue is added under the mask (greens / browns turn teal / slate)
const NIGHT_AMBIENT_RGB = [14, 24, 66];
const nightMaskCanvas = document.createElement("canvas");
const nightMaskCtx = nightMaskCanvas.getContext("2d");
function drawNightWash(skyColor, night, w, h, washK) {
  const k = Math.min(1, Math.max(0, night)) * ctx.globalAlpha;
  if (k > 0.001) {
    const m = NIGHT_MULTIPLY_RGB.map((c) => 1 - (1 - c / 255) * k);
    nightMulPending = nightMulPending ? nightMulPending.map((v, i) => v * m[i]) : m;
    nightAmbientK = Math.min(1, nightAmbientK + k);
  }
  const al = RGBA_RE.exec(skyColor);
  if (al && (al[4] === undefined ? 1 : +al[4]) > 0.004) { // dawn / dusk glow (the night part is the mask)
    ctx.save();
    if (washK !== undefined) ctx.globalAlpha *= washK;
    ctx.fillStyle = skyColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function drawNightBlueTint() {
  const nightFactor = 1 - getDayFactor(); // 0 in full day, 1 in full night, easing through twilight same as everything else
  if (nightFactor <= 0) return;
  ctx.save();
  ctx.globalAlpha *= nightFactor; // multiplies with whatever the caller set (the owner-home fade indoors)
  ctx.fillStyle = NIGHT_BLUE_TINT;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
}

function render() {
  relightFrameId++; // per-frame caches (relightStaticOccludersMobile())
  beginSceneLights(); // every light this frame collects here, merged — see addSceneLight()
  if (player.scene === "inside") {
    renderInteriorScene();
    // No vignette blur indoors — per request, it's an outside-only effect.
    setVignetteBlur(false);
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
    Math.max(0, worldW() - viewWorldW), // js/worlds.js
  );
  camY = clamp(
    player.y - viewWorldH / 2,
    0,
    Math.max(0, worldH() - viewWorldH),
  );

  // Snap the camera to whole canvas pixels. A camera between pixels makes
  // the un-smoothed pixel art land on a different pixel each frame, so the
  // whole map shimmers/jitters while walking (very visible on a phone).
  camX = Math.round(camX * zoom) / zoom;
  camY = Math.round(camY * zoom) / zoom;

  ctx.clearRect(0, 0, vw, vh);
  // Phones: the base ground is inside the stack-A chunks (js/chunks.js
  // groundBaseInChunks()), drawn by drawSnowGroundFill() right below.
  if (!(typeof groundBaseInChunks === "function" && groundBaseInChunks())) ctx.drawImage(worldCanvas, camX, camY, viewWorldW, viewWorldH, 0, 0, vw, vh);
  drawSnowGroundFill(); // while it snows, the grass fill shows as snow (js/snowground.js)

  drawDirtLayer();       // 1 — bare earth, the bottom of the stack
  if (typeof drawFarmSoil === "function") drawFarmSoil(); // wet tilled soil (js/farm.js)
  drawFlatGroundItems(); // 2 — grass / water / port tiles
  drawGroundOverlay();   // 2 over — mushrooms, flowers, leaves, lit-window glow: on the ground, not instead of it
  drawStairsLayer();     // Dirt Stairs — over the mountain wall they're on, under the characters
  drawTreeGroundShadows(); // soft shadows under the trees, daytime only (assets/shadows/)

  // Weather FX (js/weatherfx.js) — cloud ground-shadows and "behind" fog
  // patches go on the ground, under items/player, so the character
  // visibly walks through them rather than over them.
  drawCloudShadows(camX, camY);
  drawFogLayer(camX, camY, false);
  drawWeatherBackFX(); // the BACK row of snow/rain/leaves — behind characters and trees (js/weatherfx.js)

  drawBirdShadows(); // birds' shadows on the ground, under every object (js/birds.js)
  drawPlayerStandingDecor(); // the ONE decor tile (if any) the player is standing on — always fully behind them (see js/camera.js)
  renderWorldObjectsSorted(); // stones/trees/house + every OTHER decor tile + player, depth-sorted by Y (see above)
  if (typeof drawLeafFlecks === "function") drawLeafFlecks(); // leaves shaken off bushes (js/plantfx.js)

  drawPendingConstructions(camX, camY); // house builds in progress — ghost preview + green countdown bar

  // "In front" fog patches — drawn over the player.
  drawFogLayer(camX, camY, true);

  drawUpperLayer();   // 4 — things resting on top of furniture
  drawWallLayer();    // 5 — windows, frames, posters, wall decor
  drawCeilingLayer(); // 6 — the very top

  drawFloatingPickups(); // resource-drop popups, on top of the world but drawn before the placement grid
  drawThrownTosses(); // T-key throw arc (js/resources.js) — same layer of the render as the pickups above
  drawHeldItemGhost(camX, camY); // see-through mock-up of what's held, under the cursor — drawn BEFORE the grid so the outline stays readable on top of it
  drawPlacementRange(camX, camY); // overlay on top so the grid is always visible, even over a tall object
  if (typeof drawFarmHighlights === "function") drawFarmHighlights(camX, camY); // white borders on farm tiles (js/farm.js)

  // Clouds float above everything on the ground; rain falls in front of
  // that (js/weatherfx.js).
  drawBirds(); // flocks flying over everything, under the clouds (js/birds.js)
  drawCloudSprites(camX, camY);
  drawWeatherOverlayFX();

  // Day/night sky tint — a flat color wash over the whole view, smoothly
  // interpolated from js/daynight.js's keyframes (deep blue at night, warm
  // glow at sunrise/sunset, clear through the day). Drawn last so it sits
  // over the world and the character alike, like ambient light.
  // Phones: the sky tint and the night's blue cast (drawNightBlueTint(),
  // below) are folded into ONE fill — two flat colours laid over each other
  // are exactly one flat colour (skyAndNightTint()), and it's one less whole
  // screen of pixels to paint every frame.
  drawNightWash(getSkyOverlayColor(), 1 - getDayFactor(), vw, vh);

  // Sun rays/god rays go on AFTER the sky tint: they're light being added
  // to the scene, not part of what gets dimmed by it. World-space (they
  // scroll with the map), slanted along the sun, cut by the clouds
  // drifting overhead (js/weatherfx.js).
  drawSunRays(camX, camY);

  drawMinimap(); // top-right overview — a separate <canvas> (index.html), not part of the main view/sky tint above (js/hud.js)

  if (typeof treasureLights === "function") treasureLights(); // the crystals' blue glow (js/treasure.js)
  drawPostLightGlows(camX, camY); // lamps join the candles already collected in the shared light buffer
  flushSceneLights();             // ...and every light lands at once, merged instead of stacked
  drawLampNightRelight();         // the lit lanterns get most of their own colour back, so they don't look dead
  drawCharacterNightRelights();   // then the characters get their own colours back ON TOP, so no light can overdrive them
  if (typeof drawTreasureOverlay === "function") drawTreasureOverlay(); // chest glints, loot popups (js/treasure.js)
  if (typeof drawMineOverlay === "function") drawMineOverlay(); // east worlds: damage numbers, drops flying to you, hurt flash (js/mines.js)
  drawVignetteBlur(); // soft edge blur, all four sides, sunny daytime only — see above
  drawSceneFadeOverlay(); // interior enter/exit fade-to-black (js/interior.js) — drawn last, over absolutely everything
}
