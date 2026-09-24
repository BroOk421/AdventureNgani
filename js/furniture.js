"use strict";

/* =================================================================
   FURNITURE — sittable placed objects (every chair, the couch, and the
   benches — itemDefs' `sittable`, js/inventory.js), indoors AND
   outdoors alike (per request: "apply mo sa lahat indoor at outdoor na
   upuan"). Originally built for just the outdoor benches; the function
   names below still say "Bench" for that reason, but they all work
   generically off itemDefs' `sittable` now, for anything placed in
   EITHER the outdoor `objectLayer` or an interior room's own `decor`
   map (js/interior.js) — see `sittableLayer()` below, which is the one
   place that decides which of the two current `player.scene` is
   pointing at.

   - Hovering a placed sittable item (updateBenchHover(), called once a
     frame from main.js's loop, reusing the same lastMouseClientX/Y
     js/inventory.js's placement handler already tracks) highlights just
     the ONE seat tile under the cursor — drawn in drawObjectLayerItem()
     (outdoor) / the indoor decor loop (js/camera.js) via `hoveredSeat`
     and drawSitHighlight() below. No tile-grid square is drawn, only
     the seat's own pixels tinting, and a footprint tile that isn't a
     listed seat doesn't respond at all.
   - Left-clicking it (setupBenchClickHandler(), wired up from main.js
     the same way setupNpcClickHandler()/setupBedClickHandler() are)
     sits the player down (trySitOnBench()), which swaps the character
     over to the seated animation (assets/sprites/Sit/, drawn by
     drawSittingPlayer() in js/camera.js).
   - `player.sitting` freezes normal movement/actions — see the early
     return at the top of updatePlayer() (js/player.js), same pattern as
     `player.sleeping`. updateSitting() (called from there) is what
     watches for a WASD/arrow press to stand back up.
   - Standing up doesn't try to compute "the tile in front of the
     chair" geometrically (which side that is depends on the piece's own
     art/orientation, and indoors it'd also need to be clamped back
     inside the room) — it just restores the player to the exact spot
     they were standing at the moment they clicked to sit
     (`player.sitPreX/Y`), which IS the front tile, since that's where
     they had to be standing to click it in the first place. Works the
     same regardless of scene, since it's just a raw x/y snapshot.
================================================================= */

// Which placed-item map `sittable` lookups should search right now —
// the outdoor `objectLayer` (inventory.js) while outside, or the
// current room's own `decor` map (interior.js) while inside, since
// indoor furniture is never written into the outdoor layers at all.
// Returns null if there's nowhere sensible to look (e.g. mid-transition
// with no room resolved yet), which every caller below treats as
// "nothing found" rather than an error.
function sittableLayer() {
  if (player.scene === "inside") {
    const room = INTERIOR_ROOMS[player.activeRoomId];
    return room ? room.decor : null;
  }
  return objectLayer;
}

// Which tile of a placed `multiTileFootprint` item's FULL drawn
// footprint (every tile it covers, not just its anchor) a given
// (col,row) lands on, if any. findFootprintCoveringTile() (inventory.js)
// already does this for `fixedFootprint` items (the Big Bed) but not
// `multiTileFootprint` ones (chairs, the couch, the benches, the house,
// chimneys, crates...) — their map entry only lives at the anchor tile,
// so a plain layer.get() miss on every OTHER tile they visually cover.
// Scoped to this file rather than folded into that shared helper, so it
// can't change hit-testing for anything else (grabbing, NPC/bed clicks,
// etc.) that already relies on findFootprintCoveringTile()'s current
// behavior.
function findMultiTileFootprintCoveringTile(layer, col, row) {
  for (const [key, type] of layer) {
    const def = itemDefs[type];
    if (!def.multiTileFootprint) continue;
    const [anchorCol, anchorRow] = key.split(",").map(Number);
    const r = getMultiTileFootprintRect(type, anchorCol, anchorRow);
    if (col >= r.leftCol && col <= r.rightCol && row >= r.topRow && row <= r.bottomRow) {
      return { type, anchorCol, anchorRow };
    }
  }
  return null;
}

// The individual SEAT at (col,row), if any — searches whichever map
// sittableLayer() says matches the current scene, and matches against
// each sittable item's own `seats` list (itemDefs) rather than its whole
// footprint. That distinction is the point: a tile the furniture covers
// but doesn't list as a seat (the vertical bench's 5th/top tile, which
// is its backrest post) correctly returns null here, so it neither
// highlights on hover nor accepts a click.
//
// The returned `seatCol`/`seatRow` are absolute tile coordinates (the
// anchor plus the seat's own offset), and `seatIndex` is that seat's
// position in the list — used by the highlight to work out which SLICE
// of the art to tint (drawSitHighlight(), camera.js).
function findSeatAt(col, row) {
  const layer = sittableLayer();
  if (!layer) return null;
  for (const [key, type] of layer) {
    const def = itemDefs[type];
    if (!def.sittable) continue;
    const [anchorCol, anchorRow] = key.split(",").map(Number);
    const seats = def.sittable.seats;
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i];
      if (anchorCol + s.col !== col || anchorRow + s.row !== row) continue;
      // Spread the seat's own definition first so EVERY field on it comes
      // through, not just the ones named below. Listing fields by hand
      // here silently broke a per-seat option once already, by dropping
      // it on the way to trySitOnBench().
      return {
        ...s,
        type,
        anchorCol,
        anchorRow,
        seatIndex: i,
        seatCol: col,
        seatRow: row,
        facing: s.facing,
      };
    }
  }
  return null;
}

/* ---------------- hover highlight ---------------- */

// The seat the cursor is currently over (the full findSeatAt() result),
// or null — read from drawObjectLayerItem() (outdoor) and the indoor
// decor loop (js/camera.js) to decide which placed item to tint, and
// which one tile's slice of it. Whichever scene is active only ever
// populates its own draw loop's lookup, so there's no risk of an outdoor
// tile number coincidentally lighting up an indoor item or vice versa.
//
// Deliberately NOT accompanied by any tile-grid square — per request
// ("yung pag over niya di makikita yung mismong tile yung highlight lang
// ng upuan mismo"), the only feedback is the seat's own pixels tinting.
let hoveredSeat = null;

// Called once a frame from main.js's loop, before render() (so the
// highlight is up to date for this frame's draw) — cheap no-op checks
// first so it doesn't walk the whole layer every frame for nothing.
function updateBenchHover() {
  hoveredSeat = null;
  if (player.sitting) return; // already seated — nothing to click into
  if (heldItem || player.grabbedType) return; // hands full — a click here places/grabs instead (see inventory.js), not sits
  // screenToTile()/screenToWorld() (inventory.js) read the shared
  // camX/camY camera.js keeps in sync for BOTH scenes, so this resolves
  // correctly indoors too without any extra branching here.
  const { col, row } = screenToTile(lastMouseClientX, lastMouseClientY);
  hoveredSeat = findSeatAt(col, row);
}

/* ---------------- sitting down / standing up ---------------- */

// Left-click-a-sittable-to-sit, indoors or out. A separate listener from
// js/inventory.js's setupPlacementClickHandler() (empty-handed here,
// holding-something there), same split as js/npc.js's
// setupNpcClickHandler().
function setupBenchClickHandler() {
  view.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // left button only
    if (heldItem || player.grabbedType) return; // hands full — a click places/grabs instead
    if (player.sitting) return; // already seated — WASD stands up, not another click
    const { col, row } = screenToTile(e.clientX, e.clientY);
    const seat = findSeatAt(col, row);
    if (!seat) return; // not a seat tile (or not furniture at all) — ignore
    trySitOnBench(seat);
  });
}

/* ---------------- seated animation ----------------
   assets/sprites/Sit/ holds two ordinary character sheets — sith.png
   (front-on) and sitv.png (side profile, facing right), 384x64 = 6
   frames of 64x64 each, the same layout and the same character scale as
   idle/walk/run/carry. So sitting needs no special placement or scaling
   of any kind: the player is simply put on the seat tile and the sheet
   is drawn by the usual character-draw path (drawSittingPlayer(),
   js/camera.js), which is what keeps a seated character exactly the
   size she is standing up. */

// `seat` is a findSeatAt() result — it already carries the exact seat
// tile the player clicked (seatCol/seatRow) and that seat's own facing,
// so this doesn't need to re-derive anything from the anchor.
function trySitOnBench(seat) {
  // Remembered so standing back up can put the player exactly here
  // again — see the file header comment on why this replaces working
  // out "the front tile" geometrically. Plain x/y, so it round-trips
  // correctly whichever scene (indoor room-local or outdoor world-space
  // coordinates) they were in when they sat down.
  player.sitPreX = player.x;
  player.sitPreY = player.y;

  // Straight onto the seat tile, no code-driven ease — the sit sheets
  // carry their own breathing animation, so the game adds no motion of
  // its own on top of it.
  player.sitSeatX = (seat.seatCol + 0.5) * TILE;
  // Feet land on the seat tile's own center — same feetWorldY math
  // isBodyBlockedAt()/feetTileAt() (player.js) use, solved backwards
  // for the player's CENTER y instead of their feet.
  player.sitSeatY = (seat.seatRow + 0.5) * TILE - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;

  player.x = player.sitSeatX;
  player.y = player.sitSeatY;
  player.sitting = true;
  // Per-seat nudge for the DRAWN sprite only (itemDefs' `poseOffsetX`/
  // `poseOffsetY`, world px) — the player's real position stays on the
  // seat tile, so collision, the camera and the Y-sort are untouched.
  // Needed because a seat's own art doesn't always put its sitting spot
  // at the middle of its tile: benchVertical's seat slab is off to one
  // side of the 16px tile, so a frame centred on the tile leaves the
  // character sitting on the backrest instead of the seat.
  player.sitDrawOffsetX = seat.poseOffsetX || 0;
  player.sitDrawOffsetY = seat.poseOffsetY || 0;
  // Which placed item is being sat on — read by renderWorldObjectsSorted()
  // (camera.js) to draw that one piece of furniture just BEHIND the
  // player instead of at its normal Y-sort position. Without this the
  // bench (whose sort key is its bottom row) would draw on top of a
  // player seated on any row above it — i.e. the character would
  // disappear behind the bench they just sat on.
  player.sitAnchorCol = seat.anchorCol;
  player.sitAnchorRow = seat.anchorRow;
  player.facing = seat.facing;
  player.anim = "idle";
  player.frame = 0;
  player.frameTimer = 0;
}

// Called from updatePlayer() (player.js) every frame while
// `player.sitting`, in place of the normal movement update — the only
// way out is a movement key, per request ("kapag click ng wasd na
// button is aalis na siya sa pagka sit").
function updateSitting(dt) {
  // Advance the seated loop. updatePlayer() (js/player.js) never reaches
  // its own animation tick while sitting — it hands straight off to this
  // function — so the sit sheet's frames are cycled here, with exactly
  // the same timer/modulo shape every other animation uses. This is the
  // ONLY animation sitting has: the breathing is drawn into the sheet
  // itself, so the code adds nothing on top of it.
  player.frameTimer += dt;
  if (player.frameTimer >= 1 / ANIM_FPS.sit) {
    player.frameTimer = 0;
    player.frame = (player.frame + 1) % FRAME_COUNTS.sit;
  }

  if (
    keys["w"] || keys["a"] || keys["s"] || keys["d"] ||
    keys["arrowup"] || keys["arrowdown"] || keys["arrowleft"] || keys["arrowright"]
  ) {
    standUpFromBench();
  }
}

function standUpFromBench() {
  player.sitting = false;
  // Snapped rather than eased, unlike sitting down: standing up is
  // triggered BY a movement key, so the player is already asking to
  // walk — a slide back out would just read as input lag.
  player.x = player.sitPreX;
  player.y = player.sitPreY;
  player.anim = "idle";
  player.frame = 0;
  player.frameTimer = 0;
}


/* ---------------- seat highlight (drawing helpers) ----------------
   Called from js/camera.js's two draw paths — drawObjectLayerItem()
   outdoors and the room.decor loop indoors — once it has worked out
   where the item's art landed on screen. Kept here rather than in
   camera.js so all the seat logic stays in one file. */

// A pre-tinted copy of an item's art: the icon drawn into an offscreen
// canvas, then flooded with the highlight colour in "source-atop" mode
// so the fill lands ONLY on the icon's own opaque pixels. Drawing this
// over the real art tints the furniture's exact silhouette.
//
// The tint has to be baked offscreen like this rather than done with
// source-atop directly on the main canvas: by the time furniture draws,
// the main canvas already has the opaque world/room image underneath, so
// "atop existing pixels" there would mean the whole rectangle, tile
// square and all — exactly the block of colour the request asks NOT to
// show. Built once per type and cached, since an item's art never
// changes at runtime. (drawImage into a canvas never taints it for
// drawing purposes — only getImageData would care — so this is safe
// even when the page is opened straight off the filesystem.)
const SIT_HIGHLIGHT_CACHE = new Map(); // type -> HTMLCanvasElement | null
const SIT_HIGHLIGHT_COLOR = "rgba(255, 238, 140, 1)";
const SIT_HIGHLIGHT_ALPHA = 0.5;

function getSitHighlightArt(type) {
  if (SIT_HIGHLIGHT_CACHE.has(type)) return SIT_HIGHLIGHT_CACHE.get(type);
  const icon = itemDefs[type].icon;
  let canvas = null;
  try {
    canvas = document.createElement("canvas");
    canvas.width = icon.width;
    canvas.height = icon.height;
    const cx = canvas.getContext("2d");
    cx.drawImage(icon, 0, 0);
    cx.globalCompositeOperation = "source-atop";
    cx.fillStyle = SIT_HIGHLIGHT_COLOR;
    cx.fillRect(0, 0, icon.width, icon.height);
  } catch (e) {
    canvas = null; // no highlight rather than a broken draw
  }
  SIT_HIGHLIGHT_CACHE.set(type, canvas);
  return canvas;
}

// Whether this item's seats run along a row (side by side — the
// horizontal bench, the couch) or down a column (the vertical bench).
// Decides which way the per-seat clip band below is oriented, so one
// hovered seat lights up its own slice of a shared piece of art without
// cutting off the art's overhang on the other axis (the vertical bench's
// 21px-wide art, for instance, is wider than its single 16px tile
// column). A single-seat chair has no axis at all — the whole thing
// lights up.
function sittableSeatAxis(def) {
  const seats = def.sittable.seats;
  if (seats.length < 2) return null;
  return seats.some((s) => s.col !== seats[0].col) ? "cols" : "rows";
}

// Draws the hovered seat's highlight over furniture that has just been
// drawn at `artRect` (screen px). `col`/`row` are the item's anchor
// tile. No-ops unless this exact item is the hovered one, so both call
// sites can call it unconditionally.
function drawSitHighlight(type, col, row, artRect) {
  if (!hoveredSeat) return;
  if (hoveredSeat.anchorCol !== col || hoveredSeat.anchorRow !== row) return;
  const art = getSitHighlightArt(type);
  if (!art) return;

  const axis = sittableSeatAxis(itemDefs[type]);

  ctx.save();
  // Clip to just the hovered seat's own band, so on a multi-seat bench
  // only the one seat under the cursor lights up rather than the whole
  // bench — per request ("mamimili kung san dun sa 1-4 uupo na tile").
  // The band spans the full art on the OTHER axis on purpose: the art
  // routinely overhangs its tiles there (the vertical bench is 21px wide
  // across a 16px column), and clipping that off would shave slivers
  // from the highlight's edges.
  if (axis === "rows") {
    const y = ((hoveredSeat.seatRow * TILE) - camY) * zoom;
    ctx.beginPath();
    ctx.rect(artRect.x, y, artRect.w, TILE * zoom);
    ctx.clip();
  } else if (axis === "cols") {
    const x = ((hoveredSeat.seatCol * TILE) - camX) * zoom;
    ctx.beginPath();
    ctx.rect(x, artRect.y, TILE * zoom, artRect.h);
    ctx.clip();
  }
  ctx.globalAlpha = SIT_HIGHLIGHT_ALPHA;
  ctx.drawImage(art, artRect.x, artRect.y, artRect.w, artRect.h);
  ctx.restore();
}
