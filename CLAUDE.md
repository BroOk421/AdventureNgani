# CLAUDE.md — Project Log

Internal dev log for this prototype: what exists, why it's built this way,
and what's already been tried/fixed. `README.md` is the user-facing
"how to run" doc; this file is the "what happened and why" doc.

## What this project is

A browser-based, fullscreen top-down RPG movement prototype:
- A 3000×1640 world tiled with a randomly-scattered dirt texture (3 tile
  variants sliced from one source image).
- A WASD-controlled character with idle / walk / run animation states,
  each with its own down / up / side sprite sheet (side sheet is flipped
  in code to get left-facing, no separate left art needed).
- A one-shot **Collect** action (F key) and a **Carry** mode: while
  carrying, idle/walk/run switch to dedicated carry-pose sheets. See
  "Carry system" in `README.md` and changelog entry 13 below for details.
- An **inventory (B key), hotbar (1-7), and ground-item placement**
  system — pick up an item from a 72-slot grid, see a highlighted
  placement range around the player, and place it on a valid tile. See
  "Inventory & placement" in `README.md` and changelog entry 14 below.
- A zoomable camera (mouse wheel or Q/E), fullscreen canvas, no UI chrome.
- A character-shaped (not circular) drop shadow, built from the live
  sprite silhouette, anchored to the feet.

Plain vanilla JS, no build step, no framework — meant to be opened via
VS Code Live Server or double-clicked directly.

## Architecture

```
index.html   → loads js/ files in dependency order (plain <script> tags,
                classic scripts sharing one global scope — no bundler,
                no ES modules, so it still works via file:// double-click)
js/config.js   → all tunable constants
js/assets.js   → loads every sprite/tile/item image, whenAssetsReady(cb)
js/input.js    → keyboard state + mouse wheel zoom
js/inventory.js → inventory grid (8x9), hotbar (1-7), held item, ground
                  item placement/highlight logic + the DOM UI for both
js/save.js     → autosave/load progress (localStorage)
js/world.js    → slices dirt.png into 3 tile variants, randomly tiles MAP_W×MAP_H
js/player.js   → player position/facing/animation-state update logic
js/camera.js   → canvas sizing (DPR-aware), shadow, sprite drawing, ground
                 items, placement-range highlight, render loop draw calls
js/main.js     → entry point, requestAnimationFrame loop, wires up the
                 canvas placement-click listener once everything exists
```

Load order in `index.html` matters: each file uses globals defined by the
one before it (config → assets → input → inventory → world → player →
camera → main). `inventory.js` loads early (right after input.js) but its
functions that touch `player`/`view`/`camX`/`zoom` (all defined in later
files) are only ever *called* after everything has loaded — classic
`<script>` tags share one global scope, and a function body only resolves
names when it *runs*, not when it's defined, so this is safe. The one
placement where that would NOT be safe — `view.addEventListener(...)` in
`setupPlacementClickHandler()` — is deliberately not run at load time; it's
a function that main.js's `start()` calls once, after `whenAssetsReady`
fires, by which point `view` (from camera.js) definitely exists.

**Note:** an old `js/game.js` (an early, all-in-one version of the game
before it was split into the files above) was floating around in a couple
of exported zips as dead weight — it's not referenced by `index.html` and
has been deleted. If you ever see it reappear, it's safe to delete; it's
not part of the running game.

## Timeline of what's been built / fixed, in order

1. **Base map** — 3000×1640 canvas tiled with a single uploaded dirt
   texture (16×16), published first as a hosted artifact.
2. **Converted to a local downloadable package** — plain HTML/CSS/JS
   project (no props/objects layer, per request) so it can be opened in
   VS Code, zipped for download.
3. **Character added** — Walk sheets (down/up/side, 6 frames, 64×64 each)
   wired up with WASD movement; left-facing achieved by flipping the side
   sheet at draw time (`ctx.scale(-1, 1)`) instead of needing separate art.
4. **Fullscreen pass** — removed the header/instructions panel and canvas
   border; canvas now fills the window and resizes with it. Added a
   mouse-wheel/Q-E zoom camera, clamped `ZOOM_MIN`–`ZOOM_MAX`.
5. **Split into multiple files** — was one big `game.js`; broken into
   `config/assets/input/world/player/camera/main.js` (see Architecture
   above) purely for organization, no behavior change.
6. **Pixelation/blur back-and-forth** (worth understanding if it comes up
   again):
   - First complaint: character looked blocky/pixelated. Root cause turned
     out to be **no `devicePixelRatio` handling** — canvas was sized in CSS
     px only, so high-DPI screens upscaled it. Fixed in `resizeCanvas()`
     (`js/camera.js`) by sizing the canvas backing store to
     `window.innerWidth/Height * devicePixelRatio`.
   - Attempted fix #2: turned on `ctx.imageSmoothingEnabled = true` just
     for the character sprite. This *overcorrected* — bilinear smoothing
     on a low-res (64×64) source scaled 4–6x reads as **blurry**, not
     crisp. Reverted; the character is drawn with the same
     `imageSmoothingEnabled = false` (nearest-neighbor) as the ground
     tiles. Net takeaway: the DPR fix was the real fix; smoothing the
     sprite was a mistake and was undone.
7. **Random dirt tiles** — `dirt.png` is a strip of 3 different 16×16
   variants. `world.js` slices out all 3 and assigns one at random
   (seeded PRNG, so layout is stable across reloads) to every tile in the
   map, instead of repeating a single tile.
8. **Idle / Run sheets added** — on top of Walk, added Idle (4 frames) and
   Run (6 frames) sheets for down/up/side. `player.js` now tracks a real
   `anim` state (`idle` / `walk` / `run`): idle when stationary, walk when
   moving, run when moving + holding Shift. Frame index resets on state
   change so it never points past a shorter sheet's frame count.
9. **Diagonal-facing fix** — moving diagonally (e.g. up-left) used to
   sometimes show the up/down sprite instead of the side sprite, because
   facing was chosen by whichever axis had the larger input magnitude.
   Changed so **any horizontal input at all** picks the left/right sprite;
   up/down is only used for purely vertical movement (no diagonal art
   exists, so left/right is the intended fallback for all 4 diagonals).
10. **Shadow, several iterations:**
    - v1: simple static gray ellipse under the feet. Worked, but wanted
      something less "generic blob".
    - v2: tried a *skewed, pulsing ellipse* (size pulsed with the
      idle/walk/run frame timing). Still not the right shape per feedback
      ("dapat may ulo, may kamay, katawan, at paa" — should look like the
      character, not a blob).
    - v3: **silhouette shadow** — `buildSilhouette()` draws the currently
      playing sprite frame onto a scratch canvas and uses
      `globalCompositeOperation = "source-in"` to tint every opaque pixel
      a flat dark color while preserving the sprite's alpha shape. This
      gives the shadow a real head/arm/body/leg outline, and since it's
      rebuilt from whatever frame is currently on-screen, it automatically
      matches the current idle/walk/run pose with no extra animation code.
    - v3 had a positioning bug: the silhouette was anchored **centered**
      on a pivot point, so half of it rendered "above" the feet, giving a
      floating look with the wrong orientation.
    - v4: switched to an **upside-down (mirrored), foot-pinned** shadow —
      the standard "cast shadow" trick. The image is drawn so its foot
      edge sits at local `y = 0` *before* any transform, then
      `ctx.transform(1, 0, skew, -squashY, 0, 0)` flips it vertically and
      flattens it — because the transform's translation terms are zero,
      the point `(0,0)` (the feet) is mathematically guaranteed to stay
      exactly at the pivot regardless of skew/squash. Facing left mirrors
      it the same way the sprite itself is mirrored.
    - v4 still looked "sobrang layo" (way too far from the feet) in
      testing. Root cause: the pivot's vertical position (`feetY`) was a
      guessed fraction of the character's draw size, not based on where
      the feet pixels actually are inside the 64×64 sprite frame. **Measured
      it directly** (Python/PIL, checked alpha-channel bounding boxes
      across every frame of every sheet): the feet consistently sit at
      **y ≈ 47–48 out of 64px** (there's real transparent padding above the
      head and below the feet baked into the art — the character doesn't
      fill the frame edge-to-edge). Added `SPRITE_FEET_FRACTION` in
      `config.js` (started at `0.75` based on that measurement) and used
      it to compute `feetY` properly:
      `feetY = py - size/2 + size * SPRITE_FEET_FRACTION`.
      This fixed both the "too far away" gap and the "shadow shifts
      position while walking" complaint (the feet row barely moves between
      frames — 47 vs 48px — so once anchored correctly it's visually rock
      solid).
    - Also on this pass: lightened the shadow tint (was solid-ish black,
      now `rgba(35,25,20,0.32)`), and added `ctx.filter = "blur(3px)"`
      around the `drawImage` call for soft edges instead of hard pixel
      edges.
    - **You've since hand-tuned** `SPRITE_FEET_FRACTION` to `0.6` (from
      `0.75`) and `squashY`/`skew` to `0.6`/`0.6` (from `0.35`/`0.55`) in
      your own edit of the zip — those are your current values and this
      log reflects them, not the original numbers.
11. **`SHADOW_OFFSET_X` added** — a plain constant in `config.js` to nudge
    the shadow left/right independently of everything else, in world px
    (scales with zoom automatically since it's applied as
    `SHADOW_OFFSET_X * scale` in `camera.js`). You've since set it to `6`.
12. **Decoupled shadow lean direction from facing.** The skew (which side
    the shadow slants toward) used to be `player.facing === "left" ? -0.6
    : 0.6` — tied to facing, same as the pose mirror. That meant facing
    left didn't just mirror the character's pose in the shadow, it also
    flipped which side the shadow leaned toward, which wasn't wanted: you
    liked the shadow always leaning to one side (left, in your tuned
    values) regardless of which way the character faces, while still
    wanting the silhouette's *pose* (arms/legs) to correctly mirror for
    left-facing. Split these into two independent things in
    `drawShadow()`:
    - `SHADOW_LEAN` (new constant, `config.js`) — fixed skew value, always
      applied the same way no matter `player.facing`.
    - `ctx.scale(-1, 1)` when `facing === "left"` — unchanged, still only
      mirrors the silhouette's pose (needed since the side sheet only has
      right-facing art), independent of `SHADOW_LEAN` now.
13. **Collect action + Carry mode added.** New sprite sheets: `Collect`
    (8 frames, down/up/side) and `Carry_Idle` / `Carry_Walk` / `Carry_Run`
    (4/6/6 frames, down/up/side each — same frame counts as their normal
    idle/walk/run counterparts, so no new FRAME_COUNTS/ANIM_FPS values
    were needed for the carry* movement anims themselves, only for
    `collect`). Verified via the same alpha-bbox measurement approach as
    before that the feet still sit at the same y ≈ 47–48/64 across all of
    these new sheets, so `SPRITE_FEET_FRACTION` needed no changes.
    - `player.mode` (`"normal"` / `"carrying"`) and `player.action`
      (`null` / `"collect"`) added to `player.js`.
    - **F** is wired as a one-shot ("just pressed", not held) trigger via
      `collectRequested` in `input.js`, consumed once per press in
      `updatePlayer()` — holding F does not repeat the action.
    - Pressing F starts `player.action = "collect"`, which locks movement
      and plays the 8-frame Collect sheet once; on the last frame it flips
      `player.mode` between `"normal"` and `"carrying"` and clears
      `action`. Same sheet/animation plays for both pickup and put-down —
      there wasn't a separate "put down" sheet provided, so this is a
      deliberate simplification, noted here in case that ever needs
      revisiting.
    - `spriteForFacing(anim, facing, mode)` in `player.js` gained a third
      parameter: when `anim === "collect"` it ignores `mode` entirely (one
      universal collect animation); otherwise it picks the `carry*` sheet
      instead of the normal one whenever `mode === "carrying"`. `camera.js`
      was updated to pass `player.mode` through and to compute the sprite
      sheet from `player.action === "collect" ? "collect" : player.anim`
      rather than always `player.anim`.
    - **This is a demo hook, not a real pickup system** — there's no
      actual item/object in the world yet, so F just toggles carry mode
      directly on every press. To wire up real pickup logic later: set
      `collectRequested = true` (declared in `input.js`) only when the
      player is near an actual item, instead of unconditionally on every
      F keypress.
14. **Inventory, hotbar, and ground-placement system added.** New item
    icon: `assets/items/grass.png` (registered as the `grass` item in
    `itemDefs`, `js/inventory.js`).
    - **Data:** `inventory` — a flat array of `INVENTORY_ROWS *
      INVENTORY_COLS` (8×9 = 72) slots, each `null` or `{type, count}`.
      Slot `0` starts as `{type: "grass", count: 99}` — the requested
      "attached item goes in the first slot". `groundItems` is a
      `Map<"col,row", type>` for items placed on the map.
    - **Hotbar (always visible, bottom of screen):** mirrors inventory
      slots `0`–`HOTBAR_SIZE-1` (first `HOTBAR_SIZE` = 7 of row 0).
      Number keys **1-7** select a slot and, if it has an item, hold it
      (same effect as clicking it).
    - **Inventory panel:** toggled with **B** (`toggleInventory()` in
      `inventory.js`), a full-screen dark overlay with a centered 9-column
      CSS grid of all 72 slots. Built and styled as plain HTML/CSS
      (`#hotbar`, `#inventory-overlay` in `index.html`, styled in
      `style.css`) rather than drawn on the canvas — much simpler for
      text/icons/click-targets than doing UI in canvas, and it doesn't
      need to move with the camera since it's fixed to the screen.
    - **Holding:** clicking any slot with an item (`holdSlot()`) sets
      `heldItem = { type, fromSlot }`. **Esc** cancels
      (`cancelHeldItem()`).
    - **Placement range highlight:** while holding an item,
      `drawPlacementRange()` (`camera.js`) draws a stroked square around
      every tile within `PLACEMENT_RANGE` (5) tiles of the player's
      *current* tile position — **Chebyshev distance** (a square area),
      chosen for simplicity over a circular/Euclidean range since "5
      range ng tiles" didn't specify a shape. Recomputed from the live
      player position every frame, so the highlighted area moves with the
      player while they're still holding something. Light/white border =
      empty tile (valid); red border = occupied (invalid). Tiles outside
      the map bounds are skipped (not highlighted at all).
    - **Placing:** `setupPlacementClickHandler()` (`inventory.js`, called
      once from `main.js`'s `start()`) listens for clicks on the game
      canvas, converts the click's screen position to a world tile using
      the camera's current `camX`/`camY`/`zoom` (see note above on why
      `camX`/`camY` were promoted from `render()`-local `const`s to
      module-level `let`s in `camera.js`), and calls `placeHeldItemAt(col,
      row)`. That function re-checks map bounds, occupancy, and range
      (never trusts the highlight alone) before writing to `groundItems`
      and decrementing the held slot's count; the slot empties and
      `heldItem` clears once its count hits 0.
    - **Ground items are drawn every frame** (`drawGroundItems()`,
      `camera.js`) by iterating the whole `groundItems` map — fine at the
      scale of a demo; if the number of placed items grows large, this is
      the place to add viewport culling (only draw items whose tile is
      within the visible camera area).
15. **Added a proper 3×3 grass tileset.** The original single grass icon
    (`assets/items/grass.png`, from `solograss.png`) is **28×27px** — not
    the same size as a tile (`TILE` = 16px) — so when `drawGroundItems()`
    stretched it to fill a 16×16 tile-sized square on the ground, it came
    out visibly distorted/soft. That's most of what was meant by "panget"
    (ugly). Added 9 new items, each a clean **16×16** tile (pixel-perfect,
    no stretching needed): `grassTL/TC/TR/L/Inner/R/BL/BC/BR` in
    `itemDefs` (`inventory.js`), backed by `assets/items/grass_tl.png`
    etc. These are a standard "edge tileset" layout — corners, edges, and
    a center/fill tile — meant to be placed adjacent to each other to
    build a grass patch with clean borders, rather than dropping isolated
    tufts. Placed in inventory slots 1-9 (slot 0 keeps the original
    single tuft). The original `grass` item was **not removed** — it's
    still there in case it's wanted for scattered decoration — but the
    tileset is the one to use for anything meant to tile cleanly.
16. **Save/load added (`js/save.js`).** Progress didn't persist at all
    before this — every reload reset placed items, inventory counts, and
    player position back to the hardcoded defaults. Added `localStorage`-
    based persistence: `saveGame()` serializes `groundItems`, `inventory`,
    `selectedHotbarIndex`, and the player's `x`/`y` to a single JSON blob
    under the key `"rpg-prototype-save-v1"`; `loadGame()` reads it back
    and mutates those same structures in place (so every other file's
    references to `inventory`/`groundItems`/`player` stay valid — nothing
    is replaced wholesale). `loadGame()` is called once from `main.js`'s
    `start()`, after `buildWorld()` and before the render loop starts.
    Autosave runs on a 2-second `setInterval` plus on `beforeunload`
    (closing/refreshing the tab), and `placeHeldItemAt()` also calls
    `saveGame()` immediately after a successful placement so the most
    important action isn't left waiting on the timer.
    - **Deliberately NOT saved:** `heldItem` (whether something's
      mid-hold) and whether the inventory panel is open — these are
      transient UI state, not "progress", and always reset to normal on
      load.
    - **This is per-browser/per-computer storage**, same caveat as the
      original position-save in the very first version of this game — it
      isn't shared with anyone else, and clearing browser data wipes it.
    - `clearSave()` is available (not bound to any key — nothing asked
      for a reset button) to wipe the save and reload back to defaults;
      callable from the browser dev console.
17. **Flexible hotbar assignment + manual Save + Export/Import.**
    - **Hotbar is no longer hardwired to inventory row 0.** Added a
      separate `hotbar` array (`inventory.js`) — 7 entries, each either
      `null` or an index into `inventory`. Default is `[0,1,2,3,4,5,6]`
      (same visual result as before), but now reassignable: clicking an
      item **in the full inventory panel** opens `openItemActionMenu()`
      — a small floating menu (positioned next to the clicked slot via
      `getBoundingClientRect`) with a **Hold** button and buttons **1-7**;
      clicking a number sets `hotbar[i] = thatSlotIndex`, overwriting
      whatever was there. Clicking a **hotbar** slot directly still holds
      it immediately (no menu) — the menu is only for assignment, which
      only makes sense starting from the inventory. The menu closes on
      Hold/assign (explicit `closeItemActionMenu()` + `e.stopPropagation()`
      so the document-level click-away listener doesn't double-handle it)
      or on clicking anywhere else (a `document`-level `click` listener,
      careful to ignore clicks on the slot that just opened it — bubble
      order means the slot's own handler runs before the document one).
    - **Hotbar highlight follows placement.** In `placeHeldItemAt()`, if
      the slot being placed from is on the hotbar (`hotbar.indexOf(...)`),
      `selectedHotbarIndex` updates to that position — so the visually
      "active" hotbar slot tracks whatever you're actually placing.
    - **Manual Save button** (`#btn-save`, top-right toolbar) calls
      `saveGame()` on demand — autosave already covers this, but it gives
      an explicit confirmation moment (a small toast, see below).
    - **Export/Import** (`#btn-export` / `#btn-import`, same toolbar):
      `exportSave()` builds the same object `saveGame()` would write (now
      factored out as `buildSaveData()`, shared by both) and downloads it
      as `rpg-save.json` via a `Blob` + temporary `<a download>` click.
      `importSaveFromFile()` reads a chosen file with `FileReader`, parses
      it, and applies it through `applySaveData()` — the same function
      `loadGame()` uses — so import and normal load share one code path;
      after importing, it also calls `saveGame()` so the imported data
      becomes this browser's active save too, not just an in-memory
      change that'd be lost on refresh. This is how a save moves to
      another PC: Export on the source, copy `rpg-save.json` over, Import
      on the destination.
    - `buildSaveData()`/`applySaveData()` now also cover `hotbar`, so
      hotkey assignments survive save/load/export/import along with
      everything else.
    - Small `showToast(message)` helper (`save.js`) — a fixed, auto-
      dismissing div (`#save-toast`) for "Saved!" / "Exported!" /
      "Imported!" / error feedback, reused by all three toolbar actions.
18. **Ground-item replace + right-click assign menu.**
    - **Every item now has an explicit `id`** field in `itemDefs`
      (`inventory.js`) — same string as its object key, but made explicit
      rather than implied, per request ("dapat may unique id yung bawat
      item"). `groundItems` still stores that id as its value per tile;
      `getGroundItemId(col, row)` (replacing the old boolean-only
      `isTileOccupied()`, now removed) returns that id or `null`.
    - **Placing on an occupied tile now replaces it, if it's a different
      item.** `placeHeldItemAt()` used to block placement outright on any
      occupied tile. Now: same id already there → blocked (no-op, nothing
      to gain from replacing something with itself); different id already
      there → replaced (`groundItems.set()` overwrites); empty → placed
      normally. All three cases fall through to the same `groundItems.set()`
      call — the only branch that returns early is the "same id" one.
    - **Placement range highlight is now 3-state**, not 2
      (`drawPlacementRange()`, `camera.js`): light/white = empty tile
      (valid), **amber/gold = a different item is there (valid — will
      replace)**, red = the exact same item is already there (blocked).
      Previously "occupied" was a single red state regardless of what was
      occupying it.
    - **Assign-to-hotkey menu moved from left-click to right-click.**
      Left-clicking an inventory item now holds it directly (matching
      hotbar-slot behavior — one consistent "click = hold" rule
      everywhere). Right-clicking (`contextmenu` event,
      `e.preventDefault()` to suppress the browser's native menu) opens
      `openItemActionMenu()` instead. This was a deliberate swap, not
      just an addition — the previous version had left-click open the
      menu, which the request called out as "not appearing" (it likely
      *was* appearing, just not on the right-click the person was trying);
      right-click-for-context-menu is also the more standard convention
      to expect. The document-level click-away listener's `.inv-slot`
      special case (previously needed to stop a slot's own click from
      immediately closing the menu it had just opened) was removed, since
      opening now happens on a different event (`contextmenu`) than the
      one the click-away listener watches (`click`) — a plain left click
      anywhere, including on another inventory slot, now always closes an
      open menu, which is the correct behavior once opening moved off of
      `click` entirely.
19. **Placement range narrowed to 1 tile; highlight border made crisp.**
    - `PLACEMENT_RANGE` (`config.js`) changed from `5` to `1` — you can
      now only place on a tile immediately adjacent to (or under) the
      player, not 5 tiles out.
    - The highlight border looked thick/blurry even at `lineWidth = 1`.
      Cause: `screenX`/`screenY` were fractional (camera position `camX`/
      `camY` is a continuous float, not tile-aligned), so `strokeRect`
      drew its 1px line straddling two rows of physical pixels, which the
      canvas anti-aliases into a soft ~2px line. Fixed in
      `drawPlacementRange()` (`camera.js`) using the standard canvas
      crisp-line technique: round the position to a whole pixel, then
      offset by `+0.5` so the 1px stroke centers exactly on the pixel
      grid instead of between two pixels.
20. **Highlight grid centering fixed to use feet, not sprite center.**
    `getPlayerTile()` (`inventory.js`) used to compute the player's "tile"
    directly from `player.y` — but `player.y` is the vertical center of
    the whole sprite bounding box, and the sprite is 3 tiles tall
    (`DRAW_SIZE` = 48 world px, `TILE` = 16), so that center point is
    roughly chest height, not the ground contact point. Screenshot showed
    the character visually standing with their feet near the bottom edge
    of the highlighted 3×3 grid (or spilling into the row below) instead
    of centered in it. Fixed by computing the same feet-position math
    already used for the ground shadow (`SPRITE_FEET_FRACTION`) and using
    *that* to pick the row: `feetWorldY = player.y + (SPRITE_FEET_FRACTION
    - 0.5) * DRAW_SIZE`. Since `isWithinPlacementRange()` and
    `drawPlacementRange()` both call `getPlayerTile()` rather than
    duplicating the row/col math, this one fix covers both the visual
    highlight and the actual placement validity check consistently. Note
    the character's head/upper body will still visually extend above the
    grid — that's expected for a sprite taller than one tile, the same as
    most top-down RPGs; what matters is the *feet* (contact point) landing
    in the center cell, not the whole sprite fitting inside it.

21. **Day/night cycle added (`js/daynight.js`).**
    - New file, loaded right after `config.js` (only needs the constants
      below and `Math.min/max`, so it has no dependency on later files).
    - **Clock:** a single `gameSeconds` counter (seconds since 00:00),
      advanced every frame in `main.js`'s `loop()` via `updateDayNight(dt)`.
      `TIME_SCALE` (`config.js`) converts real seconds to in-game seconds —
      set so a full 24-hour in-game day takes `REAL_SECONDS_PER_DAY_CYCLE`
      (30 real minutes) to pass, split evenly into 15 real minutes of
      in-game day (06:00–18:00) and 15 of in-game night (18:00–06:00), per
      request. Displayed as plain `HH:MM` military time
      (`formatMilitaryTime()`) in a new top-left HUD (`#clock-hud`,
      `index.html`/`style.css`), refreshed once per in-game minute rather
      than every frame.
    - **Shadow tied to the sun, not a fixed lean anymore.** The old fixed
      `SHADOW_LEAN` constant is gone. `getShadowParams()` now computes, from
      the current in-game hour: `alpha` (0 at night, ramping to 1 across
      `TWILIGHT_HOURS` after sunrise, back to 0 across `TWILIGHT_HOURS`
      before sunset — so it **fades** in/out instead of popping on/off),
      `skew` (positive/leans-left at sunrise, 0 at solar noon,
      negative/leans-right at sunset — the requested "left to right" sweep
      over the day, matching the sun's real east-to-west arc opposite the
      shadow), and `squashY` (small/short at noon, large/long at
      sunrise-sunset, since a low sun casts a long shadow). `drawShadow()`
      (`camera.js`) reads these every frame instead of the old fixed
      `0.6`/`0.6` skew/squash, and bails out entirely (no draw call) when
      `alpha` is ~0 to save the composite work at night. `buildSilhouette()`
      now takes `alpha` and scales the tint's opacity by it
      (`rgba(35,25,20,0.32 * alpha)`) so the fade is on the shadow itself,
      not just an on/off toggle.
    - **Sky tint.** `getSkyOverlayColor()` interpolates across a small table
      of (hour → color) keyframes — deep navy at night, a warm orange wash
      at sunrise/sunset, fully transparent through the middle of the day —
      and `render()` (`camera.js`) fills the whole canvas with it as the
      very last draw call each frame, after the world/items/player, so it
      reads as ambient light over everything. Not explicitly requested but
      added alongside the shadow work since a shadow that fades in/out with
      no visible change to the sky around it would look inconsistent.
    - **Not saved/persisted** — `gameSeconds` always resets to `06:00`
      (sunrise) on page load, same treatment as `zoom` or `heldItem`; if a
      persistent clock across reloads is wanted later, add `gameSeconds` to
      `buildSaveData()`/`applySaveData()` in `save.js` the same way `player`
      position already works.

22. **Day/night tuning + collect key swap + sprite folder reorganization.**
    - **Cycle sped up.** `REAL_SECONDS_PER_DAY_CYCLE` (`config.js`) dropped
      from `30 * 60` to `15 * 60` — a full in-game day now takes 15 real
      minutes (7.5 min day + 7.5 min night) instead of 30, per feedback that
      the cycle felt too slow.
    - **Clock now persists across refreshes.** Previously `gameSeconds`
      always reset to `06:00` on page load (see entry 21's "not
      saved/persisted" note) — reloading the page, or the item-placement
      demo continuing to run, made the clock visibly jump back to sunrise.
      Rewrote `js/daynight.js` to anchor the clock to a real-world
      timestamp instead of a frame-by-frame counter: `dayNightEpoch` (the
      real `Date.now()` that corresponds to in-game `00:00`) is generated
      once and stored in `localStorage` under
      `"rpg-prototype-daynight-epoch-v1"`; every frame, `updateDayNight()`
      recomputes `gameSeconds` from `(Date.now() - dayNightEpoch) *
      TIME_SCALE`, wrapped to a 24h range. Effect: the clock behaves like a
      real continuously-running clock — refreshing, or closing the tab and
      reopening it later, resumes at the correct time instead of resetting.
      `updateDayNight()` no longer takes a `dt` argument (it doesn't need
      one now); `main.js`'s `loop()` was updated to call it with no
      argument.
    - **Collect/put-down moved from F to E.** `js/input.js`: `collectRequested`
      now sets on `"e"` instead of `"f"` (also added an `!e.repeat` guard
      while touching this, so the browser's OS-level key-repeat on a held
      key can't keep re-triggering the one-shot flag — a latent bug from
      before, not something that was reported, but worth fixing while in
      this code). Since **E** was already the keyboard-zoom-in key,
      `js/player.js`'s keyboard zoom controls were moved off **Q/E** onto
      **[ / ]** (zoom out / in) to avoid the collision — the mouse wheel is
      still the primary way to zoom either way. `README.md`'s Controls and
      Carry-system sections updated to match (E for collect, `[`/`]` for
      keyboard zoom).
    - **Sprite sheets reorganized into per-animation folders**, per
      request ("i-folder mo each yun base sa naming nila"):
      `assets/sprites/Idle_Down-Sheet.png` etc. are now
      `assets/sprites/Idle/Idle_Down-Sheet.png`, and likewise for `Walk`,
      `Run`, `Collect`, `Carry_Idle`, `Carry_Walk`, `Carry_Run` — each
      folder holding that animation's Down/Up/Side sheet. `js/assets.js`'s
      `.src` paths and `README.md`'s folder-structure listing were both
      updated to match. No filenames changed, only their folder — so
      `spriteForFacing()` (`js/player.js`) and everything downstream of it
      needed no changes; carry-mode animation (idle/walk/run switching to
      `Carry_Idle`/`Carry_Walk`/`Carry_Run` while `player.mode ===
      "carrying"`) already worked from entry 13 and keeps working
      unchanged — this pass only moved where the files live on disk.

23. **Fixed: carry animation didn't play while holding an item from the
    hotbar/inventory.** Entry 22 said carry animation "already worked" —
    that was true only for the separate **E** collect/put-down demo toggle
    (`player.mode`), which has no real item behind it. It was never
    connected to actually **holding** an item for placement (`heldItem`,
    set by `holdSlot()`/cleared by `cancelHeldItem()`/`placeHeldItemAt()`
    in `js/inventory.js`) — so picking something up from the hotbar or
    inventory panel to place it never switched idle/walk/run to the
    `Carry_Idle`/`Carry_Walk`/`Carry_Run` sheets, only the unrelated E-key
    demo did. Fixed in `drawPlayer()` (`js/camera.js`): carry visuals now
    turn on when **either** `player.mode === "carrying"` **or** `heldItem`
    is truthy (`const carryVisual = player.mode === "carrying" ||
    !!heldItem;`), and that combined flag — not `player.mode` directly —
    picks the sheet via `spriteForFacing()`. Holding an item now animates
    the carry sheets immediately, and placing it or pressing **Esc** to
    cancel (both clear `heldItem`) reverts to the normal sheets right away
    — the "hold" and "unhold" states requested. `player.mode` itself and
    the E-toggle demo are untouched, so they still work independently.

24. **Held item now visible above the head, plus a HUD Unhold button.**
    - **In-world icon.** `drawHeldItemAboveHead()` (`js/camera.js`) draws
      the currently-held item's icon centered above the character's head,
      scaled with zoom like everything else (`14 * scale` world px, with a
      small gap above the sprite's top edge). Called from `drawPlayer()`
      right after the character itself is drawn. Nothing drawn at all when
      `heldItem` is null.
    - **HUD.** New `#held-item-hud` element (`index.html`/`style.css`),
      fixed just above the hotbar, hidden unless something is held: shows
      the item's icon + name and an **Unhold** button. `renderHeldItemHUD()`
      (`js/inventory.js`) fills it in and toggles its visibility; called
      from every place `heldItem` changes — `holdSlot()`, `cancelHeldItem()`,
      and `placeHeldItemAt()` — alongside the existing `renderHotbar()`/
      `renderInventory()` calls. The button's one click listener just calls
      `cancelHeldItem()`, the same function **Esc** already called — this
      is a visible/clickable way to do the same thing, not a new mechanic.
    - **Auto-unhold when the stack runs out** was already correct before
      this round (`placeHeldItemAt()`'s `if (!inventory[usedSlotIndex])
      heldItem = null;`, from when the flexible-hotbar work landed) — it
      just had no visible HUD to disappear from until now. Confirmed it
      still fires: placing the last copy of a stack clears `heldItem` and,
      via the new `renderHeldItemHUD()` call right after, hides the HUD and
      the above-head icon in the same frame.

25. **Held-item icon gap fixed + shadow tuned to a clearer left→top→right flip.**
    - **Icon-above-head gap was scaling twice.** `drawHeldItemAboveHead()`
      (`js/camera.js`) computed its gap as `4 * scale`, but `px`/`py`/`size`
      passed into it are already **screen** pixels (`drawPlayer()` is
      called from `render()` with world coordinates pre-multiplied by
      `zoom`) — so that gap was being scaled by zoom on top of already
      being in screen space, landing at 16-24px on-screen at the game's
      4-6x zoom range instead of a small gap, which read as "way too high
      above the head". Changed to a flat `5` (screen px, not multiplied by
      `scale`), per request.
    - **Shadow: clarified it's a lean/length flip, not a sideways slide.**
      The behavior from entry 21 (long+left-leaning at sunrise, short+
      centered at noon, long+right-leaning at sunset) was already correct
      in principle, but was described (and requested) as "sweeps left to
      right", which reads like the shadow's *position* translates sideways
      across the ground — it doesn't; only its lean/length change, while
      still pinned at the feet. Re-described in the code comments
      (`js/daynight.js`) as what it actually is: a flip, left → short/
      compact/"on top of" the character at noon → right. Also tuned the
      constants (`config.js`) to make that flip more pronounced:
      `SHADOW_SQUASH_MIN` 0.35 → 0.18 (noon shadow is now noticeably more
      compact/short, reads clearly as "pulled in" rather than just
      "somewhat shorter") and `SHADOW_LEAN_MAX` 1.1 → 1.3 (sunrise/sunset
      lean is a bit more pronounced too, so the two extremes read more
      distinctly against the compact noon state).

26. **Held-item icon was still floating too high — real cause found and fixed.**
    Entry 25's flat-`5px`-gap fix wasn't the actual problem. Measured the
    sprite sheets the same way `SPRITE_FEET_FRACTION` was originally
    measured (Python/PIL, alpha-channel bounding box per frame, across
    every sheet): there's transparent padding baked into the art **above**
    the head too, not just below the feet — the head's real visible top
    sits at y ≈ 16-18 out of the 64px frame (~0.28 of the frame height),
    not y = 0. `drawHeldItemAboveHead()` was anchoring to `py - size/2`,
    the top of the sprite's full (mostly-empty) bounding box — so the icon
    was floating in that dead space above the actual head, independent of
    the 5px gap being correct. Added `SPRITE_HEAD_FRACTION = 0.28`
    (`config.js`), same idea as `SPRITE_FEET_FRACTION`, and now anchor to
    `headY = py - size/2 + size * SPRITE_HEAD_FRACTION` before applying the
    5px gap — the icon sits right above the real head now, consistently
    across idle/walk/run/carry* (checked: all sheets measure 0.25-0.28,
    close enough that one constant works, same as the feet fraction).

27. **Placement is now hold-to-drop, not click-to-drop.** Previously you
    had to click once per tile, every time. Replaced the single `"click"`
    listener in `setupPlacementClickHandler()` (`js/inventory.js`) with
    `mousedown`/`mouseup`/`mousemove` handlers: pressing the left button
    places immediately (same as before), and `isPlacingHeld` stays `true`
    while it's held down; `updateHeldItemPlacement()` (new, `inventory.js`)
    runs every frame from `main.js`'s `loop()` and, while `isPlacingHeld` is
    true, keeps calling `placeHeldItemAt()` at the current mouse position
    (tracked via `mousemove`, converted through the new shared
    `screenToTile()` helper — factored out of the old click handler's
    inline math since both the mousedown and per-frame paths need it now).
    `mouseup` is listened for on `window`, not `view`, so releasing the
    button after dragging off the canvas still stops placement.
    - **Didn't need a cooldown/rate-limit to stop it from insta-draining a
      stack while held still on one tile** — `placeHeldItemAt()` already
      no-ops when the exact same item is already on that tile (from the
      ground-item-replace work, entry 18), so calling it every single frame
      on an unchanged tile only actually places once; it only places again
      when the cursor moves to a different tile (or a tile with a
      different item on it, which replaces as usual).

28. **New nature/decor asset pack added: flora, stones, trees, house — plus
    collision and a temporary "unlimited items" mode.**
    - **Source pack.** An uploaded `new.zip` contained `grass/` (small
      flowers/grass tufts), `ground/grass/` + `ground/dirt/dirt.png` (a 3x3
      grass tileset + a dirt strip), `house/house1.png`, `stones/` (11
      files), `trees/` (`noLeaves/` + `tree1/green/` + `tree1/orange/`, 9
      files), and `map/grassmap.ase`. Checked `ground/grass/*` and
      `ground/dirt/dirt.png` against what's already in the project
      (pixel-hash compare) — **identical** to the existing
      `assets/items/grass_tl.png` etc. and `assets/tiles/dirt.png`, i.e.
      these are the original source files those were already cut from
      (see entry 15). Not re-added — would've been exact duplicates under
      different names. `map/grassmap.ase` is an Aseprite project file, not
      a format a browser `<img>`/canvas can load — kept at
      `assets/map/grassmap.ase` for reference but not wired into
      `assets.js`; if a usable map layout is wanted from it, it needs to be
      exported to PNG (or its layer data read) first.
    - **New assets, organized by category** (per request — "i-structure mo
      rin ang folder"), mirroring the source pack's own folder names under
      `assets/items/`: `flora/` (flowers + wild grass tufts, 10 files),
      `stones/` (11 files), `trees/noLeaves/` + `trees/tree1/green/` +
      `trees/tree1/orange/` (9 files), `house/` (1 file). `js/assets.js`
      gained one `new Image()` + `.src` per file.
    - **41 new inventory entries** added to `itemDefs` (`js/inventory.js`)
      and placed in inventory slots 10-40 (slots 0-9 stay the original
      grass tileset): 10 flora, 11 stones, 9 trees, 1 house. None of these
      are on the default hotbar (slots 0-6) — same as any inventory item
      beyond the defaults, assign them to a hotkey via right-click → 1-7 if
      wanted there (see entry 17).
    - **Collision — new mechanic, didn't exist before this** (CLAUDE.md
      used to list "Collision / obstacles" under "Possible next steps").
      `itemDefs` entries now support `collides: true`; set on **all 9 tree
      items** and, among stones, only **`stoneBig`** (bigstone1) and
      **`stoneMedium`** (mediumstone) — every other stone and every flora
      item has no collision, per request. Implemented in `js/player.js`:
      `isTileBlocked(col, row)` checks `getGroundItemId()` (from
      `inventory.js`) against `itemDefs[id].collides`; `feetTileAt(x, y)`
      finds which tile a candidate position's feet would land on (same
      math as `getPlayerTile()` in `inventory.js`, duplicated locally so
      `player.js` doesn't need to depend on that file for its own movement
      logic). Movement in `updatePlayer()` now resolves X and Y
      **separately** — try the X-only move, apply it if the destination
      tile isn't blocked; then try Y the same way — so walking diagonally
      into the corner of a tree/rock slides you along its side instead of
      stopping you dead. Per request, the collision is exactly **the one
      tile the item was placed on**, never a multi-tile footprint, even
      though several of these sprites are drawn much larger than one tile
      (see next point) — a big tree's canopy overhangs neighboring tiles
      visually but doesn't block them.
    - **Ground items now draw at their real size instead of being
      stretched into one tile.** `drawGroundItems()` (`camera.js`) used to
      force every placed item into a `TILE × TILE` box — fine for the
      original 16×16 grass tileset, but this pack's stones/trees/house are
      much bigger (e.g. `bigtreemodel1.png` is 107×160). Changed to draw
      each item at its native pixel size (1 source px = 1 world px, the
      same convention every tile-sheet in this project already uses),
      bottom-center-anchored to the tile it's on — like the object is
      standing there, canopy/bulk extending up and outward, rather than
      being squashed to fit. For every existing 16×16 icon this produces
      the exact same box as before (verified the math), so nothing about
      the current grass tileset changed visually. One side effect, not
      explicitly requested but a genuine improvement: the original
      non-tile-sized `grass` item (28×27, the one entry 15 called out as
      looking "panget"/stretched) now also draws at its real aspect ratio
      instead of being squashed — that old complaint is incidentally
      fixed.
    - **No depth/y-sorting added yet at this point** — fixed two rounds
      later, in entry 30.
    - **Unlimited items — a flag, not a removal of the stacking feature.**
      Every `itemDefs` entry (existing grass tileset included) now has
      `unlimited: true`, per request to make items unlimited *without*
      ripping out the count/stacking system. `placeHeldItemAt()` skips its
      decrement/empty-slot/auto-unhold block entirely when
      `itemDefs[type].unlimited` is set — everything in that block is the
      original logic, untouched, and still runs normally for any future
      item added without the flag. The hotbar and inventory panel
      (`renderHotbar()`/`renderInventory()`) show `∞` instead of a number
      for unlimited stacks. To make a specific item limited again later:
      delete its `unlimited: true` (or set it `false`) and give its
      inventory slot(s) a real starting `count`.

29. **Trimmed the new asset pack: flora out, tree1 (green/orange) out —
    stones and bare trees only.** Per follow-up feedback, removed:
    - **All decorative flora** (`decoFlower1/2`, `decoGrass1-8`) — the
      `assets/items/flora/` folder and its 10 files are gone, along with
      their `itemDefs` entries, `assets.js` registrations, and inventory
      slots.
    - **`trees/tree1/green/` and `trees/tree1/orange/`** (`treeThinGreen`,
      `treeTinyGreen`, `treeBigOrange`, `treeThinOrange`) — 4 files, same
      full removal. Worth noting why these read as "duplicate": both the
      green and orange folders contain a file with the exact same name,
      `thintreemodel2.png` — same tree, two recolors, not two designs — so
      keeping both sets alongside the `noLeaves` (bare/cut) trees would
      have meant three overlapping "versions" of similar trees in the
      inventory. Kept the `noLeaves/` set only.
    - **Stones and the house were NOT touched** — all 11 stones (still
      only `stoneBig`/`stoneMedium` collide) and the house are unchanged
      from entry 28.
    - Inventory slots **renumbered contiguously** after the removals (no
      gaps left behind): 0-9 grass tileset (unchanged), 10-20 stones (11),
      21-25 bare trees (5), 26 house. Total placeable items: 27 (was 41).
    - Deleted the now-unused files from disk
      (`assets/items/flora/`, `assets/items/trees/tree1/`) rather than
      leaving them as dead weight — same policy as removing the old dead
      `js/game.js` in entry 4's note.

30. **Depth (Y-)sorting added — tall objects now correctly occlude the
    player, and all 9 trees are back in the inventory.**
    - **Y-sort.** Entry 28 flagged this as a known gap: the player always
      drew on top of every ground item regardless of position, so walking
      "behind" a tree/house/stone never looked right. Fixed in
      `js/camera.js`: `drawGroundItems()` was split into a per-item
      `drawGroundItemAt(type, col, row)` (same drawing math as before,
      just callable for one item at a time) plus a new
      `renderWorldObjectsSorted()`, which builds one list of "drawables"
      (every ground item + the player), assigns each a `sortY` — a ground
      item's is the bottom edge of the tile it's on (its draw anchor),
      the player's is their feet position (`SPRITE_FEET_FRACTION` math,
      matching `getPlayerTile()` in `inventory.js`) — sorts ascending, and
      draws in that order. This is the standard top-down "Y-sort" trick:
      whichever of two overlapping things has its base further "down" the
      map draws on top. `render()` now calls `renderWorldObjectsSorted()`
      in place of the old separate `drawGroundItems()` +
      `drawPlayer()` calls; `drawPlacementRange()` still draws after, as a
      flat overlay, so the placement grid stays visible even over a tall
      object. The player's shadow, sprite, and held-item-above-head icon
      are unaffected internally (still all drawn together inside
      `drawPlayer()`) — they just now fire at the right point in the
      sorted order instead of always last.
    - **All 9 trees restored to the inventory.** Entry 29 had removed the
      `tree1` green/orange leafed variants (`treeThinGreen`, `treeTinyGreen`,
      `treeBigOrange`, `treeThinOrange` — 4 items, including the actual
      "big tree", `bigtreemodel1.png`) for looking like duplicates of the
      `noLeaves` set. Per this round's request ("lahat ng trees"), they're
      back — `itemDefs`, `assets.js`, and inventory slots all restored.
      Re-saved their source files under clearer names this time
      (`assets/items/trees/green/thintree_green.png`,
      `tinytree_green.png`; `assets/items/trees/orange/bigtree_orange.png`,
      `thintree_orange.png`) instead of the original `tree1/green/` +
      `tree1/orange/` structure, specifically because both of *those*
      folders had a file with the identical name `thintreemodel2.png` —
      the actual source of the earlier "duplicate" read, now avoided by
      naming, not by leaving trees out. All 9 trees collide.
    - Inventory renumbered again after the restore: 0-9 grass tileset,
      10-20 stones (11), 21-29 trees (9, all of them), 30 house. 31 items
      total.

31. **Cleaned up stray duplicate files from a merged/re-zipped upload,
    restored flora, and split flat ground decals out of the Y-sort.**
    A zip the person re-uploaded turned out to contain a mix of several
    past exports layered on top of each other — the dead `js/game.js`
    (deleted back in entry 4), the old flat `assets/sprites/*.png` files
    alongside their already-organized `assets/sprites/<Anim>/*.png`
    versions (entry 22), and the old `assets/items/trees/tree1/green|orange/`
    folder alongside its already-renamed `assets/items/trees/green|orange/`
    replacement (entry 30) — all confirmed byte-identical duplicates
    (pixel/file hash) of the file already living at its proper path, so
    all of the stale copies were deleted rather than kept as dead weight.
    - **Flora restored** ("nawala... flowers" — they'd been removed in
      entry 29 at a prior request, but are wanted back now):
      `decoFlower1/2`, `decoGrass1-8` (10 items) are back in `itemDefs`,
      `assets.js`, and the inventory.
    - **Flat vs. sorted split — the actual fix for "wag yung grass sa
      ground [ma-overlap]".** Entry 30's Y-sort (stones/trees/house vs.
      the player, by world Y) technically included the grass tileset too,
      since every ground item went through the same sorted pass. A flat
      16x16 grass tile's sort key (its tile's bottom edge) can land on
      the exact same value as the player's feet when they're standing on
      it, and depending on which drew first, the grass tile could
      occasionally render on top of the character — visibly wrong for
      something with zero height. Added `flat: true` to every `itemDefs`
      entry that's a pure ground decal (the original grass tileset, now
      joined by the restored flora) — see `js/inventory.js`. `camera.js`
      now has two passes instead of one: `drawFlatGroundItems()` (new)
      draws every flat item first, unconditionally beneath everything,
      exactly like the very first `drawGroundItems()` used to; then
      `renderWorldObjectsSorted()` only collects **non-flat** items
      (stones, trees, the house) plus the player into the Y-sorted pass.
      `render()` calls `drawFlatGroundItems()` immediately after the
      background, then `renderWorldObjectsSorted()`. Net effect: grass and
      flora always sit flush under the character, no matter where they're
      standing; only stones/trees/house participate in the "who's in
      front" depth check with the player.
    - Inventory slots renumbered once more to fit flora back in: 0-9 grass
      tileset, 10-19 flora, 20-30 stones (11), 31-39 trees (9), 40 house.
      41 items total (back to the count from entry 28, since flora is
      back in and nothing else changed count-wise from entry 30).

32. **Inventory reset to auto-generate from itemDefs; one real duplicate
    image found and removed.**
    - **Found and removed a genuine duplicate**, not just a naming
      collision like earlier rounds: `stones/decorstone4.png` and
      `stones/decorstone6.png` are byte-for-byte identical (confirmed by
      hashing every one of the 41 item images against every other one).
      Removed `stoneDecor6` entirely — `itemDefs`, `assets.js`, and the
      file itself — keeping `stoneDecor4`. 40 unique items now.
    - **Inventory population rewritten to derive automatically from
      `itemDefs`, instead of a long hand-written `inventory[N] = {...}`
      list.** That hand-numbered list is exactly what caused the repeated
      slot-numbering slips across entries 28-31 (a `house1` accidentally
      left at its old slot number after a resize being the most recent
      one). Replaced the whole block with:
      ```js
      Object.keys(itemDefs).forEach((type, i) => {
        inventory[i] = { type, count: 99 };
      });
      ```
      This is a real reset, not just a recount: the array is rebuilt from
      `itemDefs` itself, in declaration order, so every key gets exactly
      one slot and there is no code path left that could duplicate or
      skip one. Adding, removing, or reordering an item going forward
      only means editing `itemDefs` — this block never needs touching
      again. (Relies on `Object.keys()` preserving insertion order for
      string keys, which every JS engine has guaranteed since ES2015.)
    - Slot layout is now implicit rather than hand-documented (it just
      follows `itemDefs`' declaration order), but for reference at the
      time of this entry: 0-9 grass tileset, 10-19 flora, 20-29 stones
      (10, after the dedup), 30-38 trees (9), 39 house. 40 slots total.

33. **Fixed the real bug behind "items disappear after importing a save":
    save/load was keyed by array index, not by item identity.**
    - **Root cause.** `applySaveData()` used to copy a saved `inventory`
      array straight over the live one, index by index:
      `inventory[i] = data.inventory[i]`. The inventory's slot layout is
      entirely derived from `itemDefs` (entry 32's auto-fill) and has
      changed shape several times as items were added/removed/reordered.
      An old save (in localStorage, or an old exported `.json` file) has
      a shorter/differently-ordered array from before those items
      existed — loading or importing it overwrote every slot beyond what
      that old save had with `undefined`/whatever was there, which is
      exactly what looked like "the other items disappeared." Confirmed
      by the person: it started happening right after importing a save.
    - **Fix — persist by item TYPE, not by index.** `buildSaveData()`
      (`js/save.js`) now saves `itemCounts` (a `{type: count}` object) and
      `hotbarTypes` (item types, not inventory indices) instead of the
      raw `inventory`/`hotbar` arrays. `applySaveData()` now always calls
      the new `resetInventoryFromItemDefs()` (`js/inventory.js` — the
      same rebuild entry 32's initial fill uses, now factored out so both
      places share it) FIRST, unconditionally, then layers saved counts
      on top by matching `type` — any type in the save that no longer
      exists in the current `itemDefs` is silently skipped rather than
      crashing or leaving a broken slot. This makes the inventory's
      *shape* immune to what any past save says, permanently — only
      *counts* (and only for types that still exist) come from a save now.
    - **Backward compatible with old saves/exports.** `applySaveData()`
      still accepts the old flat `data.inventory` array (converted to a
      type-keyed count map on the fly, `legacyItemCountsFromOldInventoryArray()`)
      and the old flat `data.hotbar` array of raw indices (applied as a
      best-effort — may not land on the exact same items if `itemDefs`'
      order shifted since, but won't crash). An old file can still be
      imported; it just can no longer wipe anything.
    - **Ground/object layer split (see next entry) also needed a save
      format change** — `groundItems` (one array) became `groundLayer` +
      `objectLayer` (two arrays). `applySaveData()` reads either the new
      two-array format or falls back to splitting an old single
      `groundItems` array by the *current* `itemDefs[type].flat`
      (`splitLegacyGroundItems()`), again dropping any stale type instead
      of erroring on it.

34. **Ground tiles and placed objects are now two independent layers —
    placing a tree/stone/house no longer erases the ground tile under it,
    and vice versa.** Per request ("pwede silang patungan ng mga ibang
    objects" — [ground tiles] can be placed under other objects):
    - `js/inventory.js` replaced the single `groundItems` map with two:
      `groundLayer` (flat items — the ground tileset, flora) and
      `objectLayer` (everything else — stones, trees, the house), decided
      by the same `itemDefs[type].flat` flag the render split (entry 31)
      already used. `layerForType(type)` is the one place that decision
      is made; `getLayerItemId(layer, col, row)` reads either map.
    - `placeHeldItemAt()` now resolves which layer the held item belongs
      to and only reads/replaces within THAT layer — the other layer at
      the same tile, if anything's there, is left completely alone. This
      is the actual fix: placing `stoneBig` on a tile that already has
      `grassInner` no longer touches the ground tile; both now coexist
      and both draw (ground tile beneath, stone on top — already true
      visually per entry 31, now true in the placement data too).
      Placing a second ground tile over an existing one still
      replaces/blocks exactly as before (same-layer rules unchanged); same
      for a second object over an existing object.
    - `drawFlatGroundItems()` and `renderWorldObjectsSorted()`
      (`camera.js`) now iterate `groundLayer` and `objectLayer` directly
      instead of one map filtered by `flat`. `drawPlacementRange()` reads
      whichever layer matches the currently-held item, so the highlight
      colors (empty/blocked/replace) reflect that layer specifically, not
      whatever's on the other one.
    - `isTileBlocked()` (`js/player.js`) now checks `objectLayer` only —
      collision was already only ever meant for non-flat items, this just
      makes it structurally impossible for a ground tile to block
      movement, rather than relying on no ground item ever having
      `collides: true` set on it by mistake.

35. **Ground tileset renamed "Grass" → "Ground", moved into
    `assets/items/tile/`.** Per request: `itemDefs`' `grass`/`grassTL`/etc.
    display names (`js/inventory.js`) changed from "Grass"/"Grass
    (Top-Left)"/etc. to "Ground"/"Ground (Top-Left)"/etc. — the item KEYS
    (`grass`, `grassTL`, ...) were left unchanged (nothing else needed
    touching: `flat`, `layerForType()`, save-data type-matching, ground
    items already placed in a save all key off the unchanged string). The
    10 files themselves (`grass.png`, `grass_tl.png` … `grass_br.png`)
    moved from flat in `assets/items/` into `assets/items/tile/`, and
    `assets.js`'s `.src` paths were updated to match — this is the actual
    "ground layer" content the folder name refers to; other items get
    placed on top of it, never replacing it (see entry 34).

36. **House now collides — as a multi-tile footprint with its back rows
    walkable, not the 1-tile rule everything else uses.** Every other
    collider (trees, big/medium stones) deliberately blocks only the
    single tile it's placed on, regardless of art size (entry 28, per
    explicit request). The house is a deliberate exception this round:
    - `house1` in `itemDefs` (`js/inventory.js`) gained `collides: true`,
      `multiTileFootprint: true`, and `footprintExcludeBackRows: 2`.
    - New `getObjectFootprintBlockedTiles(type, placedCol, placedRow)`
      (`inventory.js`): without `multiTileFootprint`, returns the old
      single-tile behavior unchanged (trees/stones untouched). With it
      (house only), computes the footprint from the item's actual drawn
      size — `tilesWide/tilesTall = round(icon.width|height / TILE)`,
      same bottom-center-anchor math `drawGroundItemAt()` already uses so
      the blocked area matches what's on screen — then skips
      `footprintExcludeBackRows` rows counting from the topmost row of
      that footprint (the "back", i.e. the far edge from the placement
      tile) before blocking the rest. For `house1.png` (130×126px) that
      works out to an 8×8-tile footprint, blocking the front/middle 6
      rows and leaving the back 2 rows walkable.
    - `isTileBlocked()` (`js/player.js`) rewritten to check a candidate
      tile against every colliding `objectLayer` entry's actual footprint
      (via the function above) instead of an exact placement-tile lookup —
      necessary because a multi-tile item can now block a tile some
      distance from where it was placed. Iterates all placed colliding
      objects per check; fine at this demo's scale (same "not worth
      optimizing yet" call as the shadow rebuild-every-frame and
      full-map ground-item redraw elsewhere in this project).

37. **Fixed an asymmetric house collision — left side blocked one more
    tile than the right.** `getObjectFootprintBlockedTiles()`'s multi-tile
    branch (entry 36) computed the footprint width as a single rounded
    tile count (`Math.round(icon.width / TILE)`) and split it in half
    with `Math.floor(tilesWide / 2)` for the left offset. For `house1.png`
    (130px = 8.125 tiles), that rounded to 8 tiles and floor-halved to 4
    tiles left of the placement column but only 3 right of it — a real
    1-tile (16px) left-favoring asymmetry, confirmed by the person after
    placing one and comparing sides. Rewrote it to compute the left/right
    (and top/bottom) EDGES independently in continuous tile-space —
    `leftEdge = (placedCol + 0.5) - icon.width/(2*TILE)`, `rightEdge =
    (placedCol + 0.5) + icon.width/(2*TILE)`, each floored/ceiled on its
    own — instead of one rounded width split in half. This is the same
    anchor math `drawGroundItemAt()` (`camera.js`) already draws the
    sprite with, so the collision now matches the art exactly and comes
    out symmetric (4 tiles left, 4 right, for this house size) whenever
    the art is centered on the tile, which it is.

38. **New animation pack added; harvesting system (F key) built on top of
    Crush/Slice.** An uploaded `Animations.zip` contained `Idle_Base`,
    `Walk_Base`, `Run_Base`, `Carry_Idle`, `Carry_Walk`, `Carry_Run`, and
    `Collect_Base` (all confirmed byte-identical to what's already in the
    project via pixel hash — not re-added) plus seven genuinely new
    sheets: `Crush_Base`, `Death_Base`, `Fishing_Base`, `Hit_Base`,
    `Pierce_Base` (this one's "up" sheet is named `Pierce_Top-Sheet.png`
    in the source, not `..._Up-...` like everything else — kept the
    source filename on disk, just named the loaded asset key `pierceUp`
    for consistency), `Slice_Base`, and `Watering_Base`. All are 64×64
    frames, 8 frames each except Hit (4). Copied into
    `assets/sprites/Crush|Death|Fishing|Hit|Pierce|Slice|Watering/`,
    matching the project's existing per-animation-folder convention
    (entry 22). `FRAME_COUNTS`/`ANIM_FPS` (`config.js`) and `assets.js`
    got entries for all seven; only Crush and Slice are wired to an
    actual action this round (see below) — Death/Fishing/Hit/Pierce/
    Watering are loaded and timed, ready for a future feature, same as
    how Collect started as an unwired demo hook before pickup/carry
    existed (entry 13).
    - **Generalized the one-shot-action system.** `player.action` used to
      only ever be `"collect"`; `spriteForFacing()` (`player.js`) had a
      single `if (anim === "collect")` special case. Replaced with an
      `ONE_SHOT_ACTION_SHEETS` lookup table covering all 8 one-shot
      actions (collect/crush/slice/death/fishing/hit/pierce/watering), so
      adding another later is a one-line table entry, not a new `if`
      branch. `camera.js`'s `drawPlayer()` simplified to `player.action ||
      player.anim` for the same reason.
    - **New `js/resources.js`** — the harvest system. `itemDefs` entries
      (`inventory.js`) that can be harvested carry a `resource: {
      hitsToBreak, breakAnim, dropItem?, respawnMinutes?, replaceWith? }`
      config:
      - `stoneBig`/`stoneMedium` (the only two stones with `collides`,
        entry 28): `{ hitsToBreak: 3, breakAnim: "crush", dropItem:
        "stoneChunk", respawnMinutes: 5 }`. New item `stoneChunk` (icon
        reuses `stoneSmall`'s) is the granted drop.
      - `treeThinGreen`/`treeTinyGreen`/`treeBigOrange`/`treeThinOrange`
        (the 4 leafed/"living" trees — the bare/cut variants and stumps
        are left out, they're not living trees to cut down):
        `{ hitsToBreak: 3, breakAnim: "slice", replaceWith: <matching
        stump> }`, named the way the source pack already named them per
        request ("thintree" -> "thincutted"): both `treeThinGreen` and
        `treeThinOrange` map to `treeThinCutStump`, `treeTinyGreen` to
        `treeTinyCutStump`, `treeBigOrange` to `treeBigCutStump`. No
        drop for trees (not asked for).
      - `findHarvestableTarget()`: within `HARVEST_RANGE` (new constant,
        `config.js`, `= 1`, same Chebyshev-neighborhood approach as
        `PLACEMENT_RANGE`) of the player's tile, finds the first
        `objectLayer` item whose type has a `resource` config.
      - `resolveHarvestHit(target)`: called once per finished
        Crush/Slice animation (`updatePlayer()`, `player.js`) —
        increments a per-tile hit counter (`resourceHits`, a `Map`, NOT
        saved — deliberately transient, same treatment as `heldItem`);
        once it reaches `hitsToBreak`, removes the object from
        `objectLayer`, applies `replaceWith` or grants `dropItem` (via
        new `grantItem(type, amount)`, which finds that type's inventory
        slot and increments its count — works correctly regardless of
        the `unlimited` flag, so a drop is already meaningful the moment
        `unlimited` is turned off for a specific item later), and
        schedules a respawn (`pendingRespawns`, a `Map`) if
        `respawnMinutes` is set.
      - `updateResources()`: called every frame from `main.js`'s
        `loop()`; restores any `pendingRespawns` entry whose timer has
        elapsed. Wall-clock based (`Date.now()`), same approach as the
        day/night clock (entry 21) — a stone's respawn timer keeps
        counting down even while the tab is closed, rather than pausing
        or resetting.
    - **Input**: new `harvestRequested` one-shot flag (`input.js`), same
      `!e.repeat`-guarded pattern as `collectRequested`, bound to **F**
      (free since `E` took over collect/put-down, entry 22).
      `updatePlayer()` (`player.js`): pressing F with a target in range
      starts the Crush/Slice animation (`player.harvestTarget` remembers
      which tile to resolve against) and locks movement until it
      finishes, exactly like Collect already did; with no target in
      range, the key press is consumed but movement isn't blocked.
    - **Save data**: `pendingRespawns` added to `buildSaveData()`/
      `applySaveData()` (`save.js`) — a broken stone's respawn timer
      survives a reload. `resourceHits` (partial, not-yet-broken hit
      progress) is deliberately NOT saved.

39. **Cropped a new wood tool/weapon sprite sheet into 19 individual
    icons, own folder — not wired into itemDefs yet.** An uploaded
    `Wood.png` (192×112) packed 19 separate icons with no consistent
    grid spacing (icons vary a lot in size — a small dart next to a full
    sword next to a tiny plaque). Used connected-component labeling
    (Python/PIL/`scipy.ndimage.label`) on the alpha channel to find each
    icon's real bounding box automatically instead of guessing a grid;
    first pass (8-connectivity) merged three touching icons (a crate, a
    round shield, a hex shield) into one box, so switched to
    4-connectivity, which split them correctly — 19 components total,
    each cropped with 1px of padding. Named by what they visually are
    (some — `wood_club_wrapped`, `wood_tongs` — are best guesses; rename
    the files if they don't match what they're meant to be):
    `wood_axe`, `wood_bow`, `wood_club_wrapped`, `wood_crate`,
    `wood_dagger`, `wood_dagger_small`, `wood_hammer`, `wood_hook_staff`,
    `wood_javelin`, `wood_mattock`, `wood_pickaxe`, `wood_plaque`,
    `wood_rapier`, `wood_shield_large`, `wood_shield_round`,
    `wood_shield_small`, `wood_sickle`, `wood_sword`, `wood_tongs`. Saved
    to a new `assets/items/wood/` folder, its own category alongside
    `flora/`, `stones/`, `trees/`, `tile/`, `house/`. **Not yet added to
    `assets.js`/`itemDefs`/the inventory** — only asked to crop and
    folder them this round; wiring them up as placeable/holdable items
    (and deciding which, if any, should be equippable weapons rather
    than ground decor — a concept this project doesn't have yet) is a
    separate next step.

40. **Real weapon equip system — the wood tools from entry 39 are now
    live items, and F is now a general attack, not just "harvest if in
    range."**
    - **All 19 wood icons wired up.** `assets.js` gained one `new
      Image()` + `.src` per file (`assets/items/wood/...`); `itemDefs`
      (`inventory.js`) gained one entry per icon, all `flat: true` (same
      ground-decal treatment as the grass tileset — placeable, no
      collision, no Y-sort). 60 items total now (was 41).
    - **14 are real weapons**, marked `equipSlot: "weapon"` +
      `weapon: { attackAnim }`. The animation mapping is a judgment call
      based on what each tool visually is (the source pack didn't specify
      one): bladed melee (`woodSword`, `woodDagger`, `woodDaggerSmall`,
      `woodHookStaff`, `woodClubWrapped`, `woodTongs`) → `"hit"`;
      thrusting/ranged (`woodRapier`, `woodJavelin`, `woodBow`) →
      `"pierce"`; chopping (`woodAxe`, `woodSickle`) → `"slice"`;
      blunt/mining (`woodPickaxe`, `woodMattock`, `woodHammer`) →
      `"crush"`. The other 5 (`woodCrate`, `woodPlaque`,
      `woodShieldRound/Small/Large`) are plain decor, same as before —
      not equippable.
    - **Equip UI.** `openItemActionMenu()` (`inventory.js`) now adds an
      Equip/Unequip button (toggling based on `player.equippedWeapon`)
      whenever the right-clicked item has `equipSlot: "weapon"`. New
      `equipWeapon(type)`/`unequipWeapon()` set `player.equippedWeapon`
      (a plain type string, or `null` — added to the `player` object,
      `js/player.js`) and refresh a new persistent HUD
      (`#equipped-weapon-hud`, top-left under the clock — persistent
      unlike the held-item HUD, since equipping is a standing choice, not
      a momentary action).
    - **Drawn in-hand.** New `drawEquippedWeapon()` (`camera.js`), called
      from `drawPlayer()`: draws the equipped weapon's icon at its real
      pixel size near a fixed hand offset (`WEAPON_HAND_OFFSET_X/Y`,
      `config.js`), mirrored for left-facing like the shadow/sprite
      already are. This is a genuine limitation, stated plainly: there's
      no per-frame hand rig the way feet/head fractions were actually
      measured (entries 10, 26) — the weapon holds a fixed spot near the
      hip and doesn't swing through the attack animation on its own.
      Tune the two offset constants if it looks wrong for a given weapon
      shape.
    - **F is now a real attack, not conditional on a target.** Previously
      (entry 38) pressing F did nothing at all without a harvestable
      target in range. Now `updatePlayer()` (`player.js`) always starts a
      swing — the equipped weapon's `attackAnim`, or a bare-handed `"hit"`
      if nothing's equipped — and separately checks
      `findHarvestableTarget()` for something to actually hit;
      `resolveHarvestHit()` (`resources.js`) already no-ops safely on a
      `null` target, so swinging at empty air just plays the animation
      with no side effect. The one-shot-action lock in `updatePlayer()`
      was simplified from listing specific action names to a plain
      `if (player.action)`, since it now needs to cover whichever of
      collect/hit/slice/crush/pierce is active, not just two of them.
    - **Saved:** `player.equippedWeapon` (`save.js`), restored only if
      that type still exists AND is still flagged as a weapon — a stale
      reference from a save just leaves the player unequipped rather than
      risking a crash reading `.weapon.attackAnim` off something that
      isn't a weapon anymore.

41. **Tree respawn cycle completed: stumps and bare trees are now
    harvestable too (2 hits), and cutting one all the way through
    eventually regrows the living tree.** Previously (entry 38), only the
    4 leafed/"living" trees had a `resource` config — hitting the
    resulting stump did nothing, it was just permanent collidable decor.
    Per request:
    - `treeBigCutStump`, `treeThinCutStump`, `treeTinyCutStump` (the
      stumps a living tree turns into) and `treeThinNoLeaves1`/`2` (the
      bare trees, which never had a living form to begin with) all gained
      a `resource` config: `hitsToBreak: 2` (not 3, per request — a
      stump/bare tree takes fewer hits than a full living tree),
      `breakAnim: "slice"`, `respawnMinutes: 5`. Hitting one twice clears
      the tile completely ("mawawala"); 5 real minutes later, a tree
      grows back.
    - New `resource.respawnAs` field (`resources.js`'s
      `resolveHarvestHit()`, one-line change: `const respawnType =
      def.resource.respawnAs || type;`) lets what comes back differ from
      what was destroyed. The three stumps use it to regrow as their
      LIVING tree (`treeBigCutStump` → `treeBigOrange`,
      `treeThinCutStump` → `treeThinGreen`, `treeTinyCutStump` →
      `treeTinyGreen`), completing the full cycle: living tree
      -(3 hits)→ stump -(2 hits)→ empty -(5 min)→ living tree again. The
      two bare/noLeaves trees have no living counterpart, so they just
      omit `respawnAs` and regrow as themselves, same as stones already
      did (that default — `respawnAs || type` — is exactly what stones'
      existing behavior relies on, so this change doesn't touch them).
    - **Judgment call, noted in the code comment where it's set:** both
      `treeThinGreen` and `treeThinOrange` share the same stump
      (`treeThinCutStump`), so which one it regrows into is ambiguous.
      Defaulted to `treeThinGreen`; change `respawnAs` on
      `treeThinCutStump` in `itemDefs` if the orange variant was meant
      instead.

42. **Equipment screen — a real second UI (G key), not just the
    right-click menu.** Per a reference image (a mobile RPG's equipment
    screen: character centered, equip slots in boxes beside them):
    - New overlay, `#equipment-overlay`/`#equipment-panel`
      (`index.html`/`style.css`), toggled with **G** (`toggleEquipment()`,
      `inventory.js`, wired next to the existing `B`/inventory toggle).
    - **Character preview**: a `<canvas>` (`#equipment-character-canvas`),
      filled by `renderEquipmentCharacterPreview()` with just the FIRST
      frame of `Idle_Down` (`assets.idleDown`, cropped `0,0,64,64`),
      scaled up — a static "profile view", exactly as requested, not an
      animated character.
    - **Weapon slot**: one slot (`#equipment-slot-weapon`) beside the
      character, styled as a rounded box with an icon, matching the
      reference's slot style. Only one slot exists because weapon is the
      only equip category this game has right now (see entry 40); the
      CSS/markup pattern (`.equipment-slot`) is written to be repeated
      for more slots later without restructuring anything.
    - Clicking the slot opens `openEquipmentWeaponPicker()` — a small
      popup listing every weapon TYPE currently in the inventory
      (deduplicated — a weapon appears once regardless of how many slots/
      stacks of it exist) plus an **Unequip** entry when one's already
      equipped. Picking an item calls the same `equipWeapon()`/
      `unequipWeapon()` the inventory's right-click menu already used
      (entry 40) — this is a second entry point to the identical action,
      not a separate equip mechanic, so the two stay in sync automatically
      (`equipWeapon()`/`unequipWeapon()` now also call
      `renderEquipmentSlots()` alongside the existing HUD refresh).
    - `renderEquipmentSlots()` shows the equipped weapon's icon, or a
      plain "+" placeholder when the slot is empty (same visual idea as
      the reference's greyed-out empty slots).

43. **Equip flow simplified: no in-world weapon visual, no more "Hold"
    for weapons, harvest animation reverted to resource-driven.** Several
    corrections in one round:
    - **Removed the in-hand weapon visual entirely.** `drawEquippedWeapon()`
      and its call in `drawPlayer()` (`camera.js`) are gone, along with
      the now-unused `WEAPON_HAND_OFFSET_X/Y` constants (`config.js`).
      `player.equippedWeapon` is still tracked (still drives F's attack
      animation and shows in the Equipment screen + top-left HUD) — only
      the on-character rendering was removed.
    - **Clicking a weapon now equips it directly — no more "Hold" step.**
      New `useOrHoldSlot(slotIndex)` (`inventory.js`): if the slot's item
      has `equipSlot === "weapon"`, calls `equipWeapon()`; otherwise falls
      through to the existing `holdSlot()`. Replaces the plain
      `holdSlot()` call at all three click sites that used it (inventory
      grid, hotbar, and the 1-7 number-key shortcut). The right-click
      item-action menu's **Hold** button is now hidden entirely for
      weapons (`openItemActionMenu()`) — a weapon is used/equipped, not
      placed on the ground, so offering Hold for one no longer made
      sense. The Equip/Unequip button there is unchanged, still a second
      path to the same `equipWeapon()`/`unequipWeapon()` the Equipment
      screen's picker (entry 42) and this new direct-click path both use.
    - **F's animation is resource-driven again when there's a target.**
      Entry 40 had made the EQUIPPED WEAPON'S `attackAnim` win even when
      harvesting — so an axe-wielder chopping a tree could show a
      different animation than intended, reported back as "yung
      pagputol ng puno nagiba na dapat slice." Fixed in `updatePlayer()`
      (`player.js`): when `findHarvestableTarget()` finds something, the
      animation is that resource's own `resource.breakAnim` (Slice for
      any tree, Crush for stones) unconditionally; the equipped weapon's
      `attackAnim` (or a bare-handed `"hit"`) is only used when swinging
      at nothing. Harvesting a specific resource always looks the same
      regardless of what's equipped; only an idle swing reflects the
      weapon.

44. **Big tree given an explicit, hand-picked 3-tile-wide collision.**
    Per feedback that the big tree visually spans about 3 tiles, not the
    single default tile every other tree/stone uses: new `fixedFootprint:
    { widthTiles, heightTiles }` mode in `getObjectFootprintBlockedTiles()`
    (`inventory.js`), a THIRD footprint mode alongside the existing
    default (1 tile) and `multiTileFootprint` (house1, derived from the
    art's real pixel edges). Unlike `multiTileFootprint`,
    `fixedFootprint` is an exact, hand-set tile count, centered on the
    placement column: `widthTiles: 3` splits as one tile left of the
    placement column + the column itself + one tile right (an odd count
    divides evenly, so — unlike the rounding bug fixed in entry 37 — there's
    no left/right asymmetry to worry about here). Applied to both
    `treeBigOrange` (the living big tree) and `treeBigCutStump` (its
    stump) with `{ widthTiles: 3, heightTiles: 1 }`, so the collision
    width stays the same across the tree's full living-tree/stump cycle
    (entry 41) instead of changing size when it's cut down. The real
    pixel dimensions of these two (~7 tiles and ~4 tiles wide
    respectively) would have given very different, much wider footprints
    under `multiTileFootprint` — `fixedFootprint` exists specifically
    because "how wide the source art technically is" and "how wide it
    reads in play" aren't the same number here.

45. **Tree chopping now drops wood, with a floating-popup flourish.** An
    uploaded `wood.png` (48×16) held 3 distinct drop-item icons on a
    clean 16px grid — connected-component labeling (same approach as
    entries 39/42) split them out cleanly with no merged/ambiguous
    pieces this time. Cropped to `assets/items/wood_drops/` (a different
    folder from entry 39's `assets/items/wood/` tools/weapons, since
    these are materials, not equipment): `wood_log.png` (16×16),
    `wood_plank.png` (8×16), `wood_stick.png` (16×16). Registered in
    `assets.js` and `itemDefs` as `woodLog`/`woodPlank`/`woodStick` — all
    `flat: true`, plain inventory materials like `stoneChunk`.
    - **Only `woodLog` is actually granted right now.** The request gave
      quantities, not which of the 3 types should drop, so `woodLog` (the
      classic "chop a tree, get logs" material) was used uniformly;
      `woodPlank`/`woodStick` exist as items but nothing grants them yet.
    - **Drop amounts added to every tree's `resource` config**
      (`itemDefs`, `inventory.js`), via a new `dropAmount` field
      (`resources.js`'s `resolveHarvestHit()`: `const amount =
      def.resource.dropAmount || 1` — the `|| 1` default is what keeps
      `stoneBig`/`stoneMedium`'s existing un-amounted `dropItem` behavior
      exactly as it was). Living trees: Big 5, Thin 3 (both green and
      orange), Tiny 2. Their stumps: Big 3, Thin 2, Tiny 1 — per request,
      smaller amounts than the living tree since there's less wood left
      in a stump. The two bare/noLeaves trees still have no `dropItem` —
      not asked for, left as-is.
    - **Floating pickup popups** — new in `resources.js`: `floatingPickups`
      (an array, NOT saved — purely cosmetic, the real inventory grant via
      `grantItem()` already happened synchronously and independently) and
      `spawnFloatingPickups(worldX, worldY, type, count)`, called from
      `resolveHarvestHit()` right after granting a drop. Spawns `count`
      small icons at the broken tile's position (slightly above center,
      with a little random horizontal scatter so a 5-log drop doesn't
      render as one solid stack) that each rise
      (`FLOATING_PICKUP_RISE`) and fade out
      (`FLOATING_PICKUP_LIFETIME_MS`) over about 0.7s, staggered
      (`FLOATING_PICKUP_STAGGER_MS`) so multiple icons pop in one after
      another instead of all at once. `updateFloatingPickups()` (called
      every frame, `main.js`) clears out finished ones;
      `drawFloatingPickups()` (`camera.js`) draws the still-active ones,
      called after the depth-sorted world pass so they read as a flourish
      on top of the scene rather than an object within it.

46. **Shadow now rotates through a full down-left → compact → up-right
    arc across the day, not just left/right while always pointing down.**
    Per a screenshot + annotation: the shadow's far tip should sit
    down-left in the morning and sweep toward up-right later. Root cause
    of it never doing that: `getShadowParams()`'s `squashY` (`daynight.js`)
    was always a positive magnitude, and `drawShadow()`'s transform
    (`camera.js`) used `-squashY` as a constant — the far tip's vertical
    offset (`d * topY` in the shear matrix, with `topY` negative) was
    therefore always positive/downward, no matter the time of day; only
    the horizontal `skew` term ever changed sign. Fixed by making
    `squashY` carry the SAME sign as `skew` (`squashY =
    squashMagnitude * skewSign`, `skewSign` already existed for the
    horizontal lean) — verified numerically: sunrise now offsets the far
    tip by `(-30, +27)` (down-left) and sunset by `(+30, -27)`
    (up-right), a true mirror rotation through the compact noon shadow
    instead of a left/right-only lean. `drawShadow()`'s comment updated
    to describe this as a single rotating tip rather than independent
    lean + squash.

47. **Big tree footprint made asymmetric: 2 tiles left, 1 tile right, per
    request — not the symmetric 3-wide it was.** `fixedFootprint` (entry
    44) only supported a single centered `widthTiles`, which couldn't
    express "2 left, 1 right." Reworked its schema to `{ leftTiles,
    rightTiles, heightTiles }`, each independent — `getObjectFootprintBlockedTiles()`
    (`inventory.js`) now builds the blocked columns as
    `placedCol - leftTiles` through `placedCol + rightTiles` directly,
    no centering/splitting math at all. `treeBigOrange`/`treeBigCutStump`
    changed from `{ widthTiles: 3, heightTiles: 1 }` to `{ leftTiles: 2,
    rightTiles: 1, heightTiles: 1 }` — 4 tiles wide total (was 3),
    verified: placed at column 50, blocks 48/49/50/51.

48. **Floating pickup popups rebuilt as a real throw/bounce/rest/vacuum
    animation, replacing the simple rise-and-fade from entry 45.** Per
    request: "pa-hagis tapos tatalbog ng 2x sa ground, after talbog 1sec
    bago mapunta sa character parang na-vacuum." Each popup
    (`resources.js`) now runs a small physics sim through three phases
    instead of one linear fade:
    - **`"throw"`** — tossed outward from the break point in a random
      ground direction (`FLOATING_PICKUP_THROW_SPEED_MIN/MAX`) with an
      initial upward "z" velocity (`FLOATING_PICKUP_THROW_VZ`), pulled
      back down by `FLOATING_PICKUP_GRAVITY` each frame. `z` is a purely
      visual "height above the ground" (world px) — the actual world
      x/y is where its ground contact point is; `drawFloatingPickups()`
      (`camera.js`) draws it lifted up by `z` in screen space, the same
      upward-offset convention `drawHeldItemAboveHead()` already used,
      just continuously animated here. Hitting the ground (`z <= 0`)
      bounces it back up (`vz = -vz * FLOATING_PICKUP_BOUNCE_DAMPING`,
      losing energy each time, with ground speed also decaying via
      `FLOATING_PICKUP_GROUND_FRICTION`) — exactly `FLOATING_PICKUP_BOUNCES`
      (2) times, per request, before moving on.
    - **`"resting"`** — sits still for `FLOATING_PICKUP_REST_MS` (1000ms,
      per request) once the second bounce lands.
    - **`"vacuum"`** — flies to the player's LIVE position (re-read every
      frame, so it still finds them if they've moved since the item
      settled) over `FLOATING_PICKUP_VACUUM_MS` (350ms) with an ease-in
      curve (`t*t` — accelerating, reads like something snapping into a
      vacuum) and shrinks to 20% size along the way
      (`drawFloatingPickups()`'s `scale` calc) before being removed.
    - `updateFloatingPickups()` now takes `dt` (real per-frame delta,
      passed from `main.js`'s `loop()`) instead of being purely
      timestamp-driven, since integrating velocity/gravity needs an
      actual timestep, not just elapsed-time checks. The old
      `spawnedAt`-based stagger for multi-item drops (e.g. 5 logs from
      the big tree) is kept as `startAt`, same idea, just renamed to fit
      the new per-particle state machine.

49. **Consolidated everything ground-related into one folder; renamed
    flora away from "Wild Grass"; split the dirt terrain strip into
    individual files.** Three related cleanups, per request:
    - **Flora renamed.** "Wild Grass 1-8" → "Grass Tuft 1-8" (`itemDefs`,
      `inventory.js`) — the old name read as if it were part of the
      ground tile system (which is now called "Ground", entry 35), when
      it's actually a separate decoration that sits ON TOP of the ground.
      `Flower (Tall)`/`Flower (Short)` were already fine, left unchanged.
      Only the display `name` changed — the object keys (`decoGrass1`
      etc.) are untouched, so this doesn't affect saves (which key by
      type string, entry 33) or anything else that references these
      items by key.
    - **Flora files moved into `assets/items/tile/`**, merging with the
      ground tileset that already lived there (entry 35) — the whole
      former `assets/items/flora/` folder (10 files: `flower1/2.png`,
      `grass1-8.png`) is gone, its contents relocated, no filename
      collisions with the tileset's own files (`grass.png` vs `grass1.png`
      etc. — all distinct). `assets.js`'s `.src` paths updated to match.
    - **The dirt terrain strip split into 3 individual files, also moved
      into `assets/items/tile/`.** `assets/tiles/dirt.png` (48×16, 3
      variants side by side) was sliced into 16×16 tiles AT RUNTIME by
      `world.js`'s `sliceDirtVariants()` — per request, that's now done
      once ahead of time instead: `dirt1.png`/`dirt2.png`/`dirt3.png`,
      cropped with Python/PIL and saved directly into
      `assets/items/tile/`. `assets.js` now loads 3 separate `Image`s
      (`assets.dirt1/2/3`) instead of one `assets.dirt` sheet;
      `world.js`'s `sliceDirtVariants()` function is gone entirely —
      `buildWorld()` just uses `[assets.dirt1, assets.dirt2, assets.dirt3]`
      directly as its variant list, no canvas-slicing step needed anymore.
      The old `assets/tiles/` folder (which held only that one file) is
      gone along with it — everything tile/ground-related, including
      terrain, now lives in the single `assets/items/tile/` folder.
    - Dirt is still terrain only — not an `itemDefs` entry, not
      placeable/holdable — this was a file-organization request, not a
      request to turn dirt into an inventory item.

50. **Wild grass split off into its own non-replacing layer, renamed, and
    given a sway-as-you-walk-through-it effect.** Three related changes,
    per request:
    - **Renamed and relocated.** `decoGrass1-8` → `wildGrass1-8`
      (`itemDefs`, `inventory.js`; `name`: "Wild Grass 1"-"8"). Files
      moved from `assets/items/tile/grass1-8.png` to their own
      `assets/wildgrass/wildgrass1-8.png`, a new top-level folder (not
      nested under `items/`, per request — distinct from the general
      item-asset convention because this item now has its own dedicated
      layer/rendering path, not just a folder move). This is a KEY
      rename, not just a display-name change (unlike entry 49's flora
      rename, which only touched `name`) — a save referencing the old
      `decoGrass1` type won't resolve against the new `itemDefs` and gets
      silently dropped on load, same "skip stale/removed types" handling
      already in place (entry 33) for any renamed/removed item.
    - **Real third layer, not a rename-only fix.** Wild grass used to
      share `groundLayer` with the ground tileset (both were just
      `flat: true`) — meaning placing wild grass over a ground tile
      would REPLACE it, the same-layer "different item replaces" rule
      (entry 34) kicking in when it shouldn't have. Per request ("dapat
      kapag nilagay sa ground is di mapalitan yung grass ground... same
      lang dapat sa stone trees etc na naka overlap lang"), added a new
      `decorLayer` (`inventory.js`, alongside `groundLayer`/`objectLayer`)
      and a `layer: "decor"` itemDefs flag that routes wild grass there
      instead. `layerForType()` checks `layer === "decor"` first, before
      falling back to the existing flat/non-flat split — so placement,
      collision, and the placement-range highlight (`drawPlacementRange()`,
      which already resolved its layer generically through
      `layerForType()`) all picked up the three-way split with no other
      code changes needed. `save.js`'s `buildSaveData()`/`applySaveData()`/
      `splitLegacyGroundItems()` updated to read/write/migrate all three
      layers instead of two.
    - **New `js/wildgrass.js` — sway + split rendering.** Per request
      ("kapag dumadaan yung character... skewed... left then right then
      left and right hanggang tumigil... 100% to 50% to 25% to 0%"):
      `updateWildgrassSway(dt)` runs a small damped-spring simulation
      per grass tile (`wildgrassSway`, a `Map`, NOT saved — a live
      animation, not progress, same treatment as `resourceHits`). Only
      the tile the player is CURRENTLY standing on gets a nonzero
      target lean (`-1`/`+1` from `player.facing`, `0` if facing
      up/down); every tile mid-sway keeps springing back toward 0
      whether or not the player's still on it. The exact 100/50/25/0
      figures from the request are approximated by the spring's natural
      decay rather than 4 hardcoded steps — verified by simulation: a
      player standing on a tile facing left for 0.5s then leaving
      produces a lean to -1.3, a rebound to +0.34, a smaller lean to
      -0.11, settling by ~1.4s — a real damped oscillation (lean, swing
      back, smaller lean, settle) reads more natural in motion than
      snapping between fixed values.
      - **Render split, per request** ("top 95% is overlap sa
        character... 5% is character naman overlap sa wildgrass"):
        `drawWildgrassPart(type, col, row, part)` (`camera.js`) draws
        only a slice of the blade — `"front"` is the top
        `WILDGRASS_SPLIT_FRACTION` (95%), `"back"` the remaining bottom
        5% — both sharing the same skew transform (pivoted at the
        blade's root, same bend-from-the-base technique the character's
        shadow already uses) so the two pieces still read as one
        continuous, bent blade. `render()` calls
        `drawWildgrassLayer("back")` BEFORE the depth-sorted world pass
        and `drawWildgrassLayer("front")` AFTER it — so the player's
        feet render in front of just the thin root sliver, while the
        bulk of the blade always renders in front of the player,
        matching "standing amid tall grass" instead of the grass always
        being flat underfoot.

51. **Fixed the wild grass sway direction (it leaned the wrong way),
    moved flowers onto the same non-replacing layer, expanded the
    stone tiers, and made save-loading re-derive layers instead of
    trusting the save.**
    - **Sway direction bug.** Reported: facing left should lean left, but
      it didn't. Root cause in `drawWildgrassPart()` (`camera.js`): the
      shear matrix's math means a point above the pivot (negative local
      y, i.e. the tip of the blade) shifts by `skew * y`, which for a
      positive `skew` and negative `y` moves LEFT — so `skew` needed the
      OPPOSITE sign of `angle` (`wildgrass.js`'s convention: negative
      angle = leaning left) to actually lean left when `angle` is
      negative. The old code used `skew = angle * ...` (same sign),
      leaning right when it should've leaned left and vice versa. Fixed
      to `skew = -angle * ...`; verified numerically: facing left
      (angle -1) now offsets the tip by -20 (left), facing right (+1) by
      +20 (right).
    - **Flowers moved to the decor layer.** `decoFlower1`/`decoFlower2`
      (`itemDefs`) gained `layer: "decor"`, same as wild grass (entry
      50) — they used to share `groundLayer` with the ground tileset,
      meaning a flower could replace (or be replaced by) a ground tile
      on the same spot. Now they're on `decorLayer` like wild grass, so
      they just overlap instead, and get the same sway + front/back
      split rendering `drawWildgrassLayer()` already applies to
      everything in that layer (not asked for explicitly, but "gawin mo
      rin siyang wildgrass" reads as "give it the same treatment," and
      `decorLayer`'s rendering doesn't distinguish members — anything
      placed there gets the same effect, which keeps the code simple
      rather than special-casing flowers out of it).
    - **Stone tiers expanded, mirroring the tree size tiers (entry 45).**
      `stoneSmall` gained a full `resource` config (3 hits, Crush,
      `dropAmount: 2`, 5-minute respawn) — it's now harvestable like Big
      (`dropAmount: 5`) and Medium (`dropAmount: 3`), the same 5/3/2
      big/medium/small split the trees use for wood. `stoneXS` gained
      `collides: true` (the default single-tile rule) but no `resource`
      — a solid obstacle, not harvestable. `stoneXXS` and all 5 Pebbles
      (`stoneDecor1-5`) gained `flat: true` (no `layer: "decor"` — plain
      groundLayer, no sway/split, just always-beneath) so walking over
      one always shows the character in front of it, instead of the
      dynamic Y-sort `objectLayer` items normally get (which could put a
      tiny flat pebble in front of the player depending on relative
      position — not the right look for ground-level clutter you're
      meant to just walk over).
    - **Save-loading now re-derives every placed item's layer from
      CURRENT `itemDefs` on load, instead of trusting whichever array
      the save had it under.** Several stones just changed which layer
      they belong in (XXS Stone/Pebbles: `objectLayer` → `groundLayer`);
      without this, loading an old save would've kept them in
      `objectLayer` (wrong dynamic-sort behavior) since `applySaveData()`
      used to copy `data.objectLayer` straight into the live
      `objectLayer`. Replaced `splitLegacyGroundItems()` (which only
      handled the oldest single-array format) with a single path in
      `applySaveData()`: concatenate every incoming layer array
      (`groundLayer`, `decorLayer`, `objectLayer`, and the ancient
      `groundItems`) into one list, then re-file each entry via
      `layerForType(type)` regardless of which array it came from. This
      is more robust than the old per-format branching, and automatically
      self-corrects the next time layer flags shift again — no more
      needing a dedicated migration function per reshuffle.

52. **Fixed the wild grass front/back split — it was measured against
    the wrong thing.** Reported: even at the very bottom of the tile, the
    grass/flower still rendered in front of the character; it should
    switch over to the character being in front at that point (and the
    ratio should be 90/10, not 95/5). Root cause:
    `drawWildgrassPart()`'s split (`camera.js`) was computed as a
    percentage of the SPRITE's own height (`icon.height *
    WILDGRASS_SPLIT_FRACTION`) — fine for art that's exactly one tile
    tall, but wild grass art is often much taller (checked: heights range
    9-31px against a 16px tile), so "5% of the sprite" shrank the back
    sliver to well under a pixel for the taller variants, meaning the
    character stayed visually behind almost the ENTIRE blade, right down
    to its root. Fixed by measuring the back band as a fixed
    `WILDGRASS_BACK_TILE_FRACTION` (10%, updated from the request's
    revised ratio) of a TILE's height instead — `backPx =
    Math.min(icon.height, TILE * WILDGRASS_BACK_TILE_FRACTION)`, clamped
    so a sprite shorter than that band doesn't produce a negative front
    size. Verified against every flora sprite: the back band is now a
    constant ~1.6px (10% of the 16px tile) regardless of the sprite's own
    height, instead of scaling with — and shrinking alongside — each
    sprite's individual height. `WILDGRASS_SPLIT_FRACTION` (`wildgrass.js`)
    renamed to `WILDGRASS_BACK_TILE_FRACTION` to reflect what it now
    actually measures.

53. **Fixed the actual bug behind "grass still overlaps the character
    after they've left the tile": the front/back split was applied to
    EVERY decor tile on the map, unconditionally, everywhere — not just
    the one the player is standing on.** A screenshot showed the
    character clearly off the wild grass tile, still rendered behind a
    grass sprite. Root cause: `drawWildgrassLayer("front")` (the old
    function, `camera.js`) looped over the entire `decorLayer` and drew
    every single tile's front portion AFTER the player, no matter where
    the player actually was — so any wild grass/flower anywhere on the
    map whose screen-space bounding box happened to reach the player's
    position (easy, since this art is often taller than one tile) would
    incorrectly cover them, even standing tiles away.
    - **Split rendering restricted to the tile actually underfoot.** New
      `drawPlayerStandingDecor(part)` (`camera.js`) looks up
      `getPlayerTile()`, checks `decorLayer` at exactly that tile, and
      only then calls the existing `drawWildgrassPart()` split — a no-op
      everywhere else. `render()` calls this (not the old blanket
      per-layer loop) before and after the sorted world pass.
    - **Every OTHER decor tile now draws whole, inside the normal Y-sort.**
      New `drawWildgrassWhole(type, col, row)` draws the complete sprite
      (still bent by its sway angle) with no split at all;
      `renderWorldObjectsSorted()` now adds every `decorLayer` entry
      EXCEPT the player's current tile into the same sorted pass as
      `objectLayer` + the player, keyed by the same `(row + 1) * TILE`
      sort value everything else there uses. This means walking past
      (not onto) a patch of wild grass now behaves like any other
      Y-sorted scenery — sometimes in front, sometimes behind, based on
      relative row — instead of unconditionally overlapping the player
      regardless of distance.
    - Net effect: the special "standing inside the grass, split
      front/back" look is now scoped to exactly the one tile the
      character occupies at any given moment, and reverts to normal
      depth-sorted rendering the instant they step off it — matching
      "wala na sa tile ng wildgrass" (no longer on the wild grass tile)
      meaning no more special treatment, dynamic sort takes back over.

54. **Two overlap styles for decor tiles: partial split (default) vs.
    full (per-item opt-in).** Per request, exactly `wildGrass1`,
    `wildGrass4`, and `wildGrass5` now fully cover the player while
    standing on them — no back sliver at all — while `wildGrass2/3/6/7/8`
    and both flowers keep the existing 90/10 front/back split (entry 52).
    - `itemDefs` gained `fullOverlap: true` on just those three
      (`inventory.js`).
    - `drawPlayerStandingDecor(part)` (`camera.js`, entry 53) checks the
      flag before deciding what to draw: if set, the "front" call draws
      the whole sprite via the existing `drawWildgrassWhole()` (no split)
      and the "back" call does nothing at all; without the flag, it's the
      same `drawWildgrassPart()` split as before. Nothing else about the
      scoping-to-the-current-tile fix from entry 53 changed — a
      `fullOverlap` tile still only fully covers the player while
      they're actually standing on it, and reverts to normal whole-sprite
      Y-sorted rendering (`drawWildgrassWhole()`, inside
      `renderWorldObjectsSorted()`) the instant they step off, exactly
      like every other decor tile.

55. **Corrected which side "overlap" meant for wildGrass1/4/5, and
    widened the default split ratio to 80/20.** Screenshots showed the
    character still visually covered/hidden by these three even after
    entry 54's fix — because that entry had the direction backwards: it
    made the GRASS fully cover the character, when the request (clarified
    this round: "dapat yung character na naka-overlap jan") actually
    wanted the opposite — the CHARACTER fully visible/in front while
    standing on these three, no grass drawn over them at all.
    - Renamed the itemDefs flag from `fullOverlap` to `characterInFront`
      (`wildGrass1`/`4`/`5`) and inverted `drawPlayerStandingDecor()`'s
      handling of it (`camera.js`): the flagged item's whole sprite now
      draws in the **"back"** call (behind the player) and nothing draws
      in the "front" call — the reverse of entry 54's logic, which drew
      the whole sprite in "front" and nothing in "back".
    - **Default split ratio widened from 90/10 to 80/20** (per request)
      for every OTHER decor item (wildGrass2/3/6/7/8, both flowers):
      `WILDGRASS_BACK_TILE_FRACTION` (`wildgrass.js`) changed from `0.10`
      to `0.20` — the back sliver (still measured against the TILE's
      height, entry 52, not the sprite's own) is now `TILE * 0.20 = 3.2`
      world px instead of `1.6`, so more of the character shows in front
      of the grass before the "in front of me" portion takes over.

56. **Fixed the split at its root cause: it was measured against the
    wrong reference height entirely, and simplified away the per-item
    flags that had been working around it.** Screenshots showed the
    character still mostly/fully hidden by tall plants (a bush, a tall
    pink flower) even after entries 54-55. Root cause finally identified:
    `drawWildgrassPart()`'s split (`camera.js`) was measured as a
    percentage of a TILE (20% = ~3.2 world px, entry 52/55) — but the
    character's own VISIBLE height (head-top to feet, ignoring the
    transparent padding baked into the sprite frame — the same
    `SPRITE_HEAD_FRACTION`/`SPRITE_FEET_FRACTION` measurements used
    elsewhere) works out to only about 16 world px
    (`(0.62 - 0.28) * 48`), while several plants are considerably TALLER
    than that (wildgrass6/7: 26px; flower1/2: 31px/27px). A ~3px back
    band could only ever reveal the character's very feet against art
    that tall — their whole head and body stayed under the "front"
    portion no matter the tile-relative percentage chosen.
    - **New reference: the character's own height, not the tile's.**
      `WILDGRASS_BACK_HEIGHT_WORLD` (`wildgrass.js`) replaces
      `WILDGRASS_BACK_TILE_FRACTION` entirely:
      `(SPRITE_FEET_FRACTION - SPRITE_HEAD_FRACTION) * DRAW_SIZE`. Any
      part of a plant AT OR BELOW that height now renders BEHIND the
      character (they're fully visible there); only the part that's
      genuinely TALLER than the character stays in front of them —
      verified per sprite: wildgrass1/3/4/5/8 (all ≤16px) now compute a
      front size of exactly 0, i.e. never cover the character at all;
      wildgrass2/6/7 and both flowers (22-31px) still have a front
      portion, but only the part that's actually taller than 16.32px —
      wildgrass6/7's front shrank from "everything past a 3px band" to
      just their top 9.68px (the part sticking up above the character).
    - **Removed the now-redundant `characterInFront` flag** (entry 55) —
      it was a manual per-item override for exactly the "shorter than the
      character" case that the corrected height-based split now handles
      automatically for any item, without needing to know in advance
      which ones qualify. `wildGrass1`/`4`/`5`'s `itemDefs` entries and
      `drawPlayerStandingDecor()`'s special-case branch are both gone;
      the function is back to unconditionally calling
      `drawWildgrassPart()`, which now does the right thing on its own
      for every item based on its actual measured height.

57. **Dropped the front/back split entirely — the character is now
    ALWAYS fully in front while standing on any wild grass/flower, no
    exceptions — and added the 3 dirt terrain tiles as placeable
    inventory items.**
    - A screenshot showed a tall flower's bloom still covering the
      character's whole head — the height-based split from entry 56 was
      working as designed (only the part of the plant taller than the
      character stayed in front), but per this feedback that still read
      as "may natitirang naka-overlap" (something's still overlapping)
      for any plant tall enough to have a front portion at all. Rather
      than continuing to tune where the line sits, the split was removed
      outright: `drawPlayerStandingDecor()` (`camera.js`) now always
      draws the whole plant behind the player — no "front" case exists
      anymore, the function doesn't even take a `part` argument. The old
      `drawWildgrassPart()` (the split-drawing function) and the
      `WILDGRASS_BACK_HEIGHT_WORLD` constant it depended on
      (`wildgrass.js`) are both deleted as dead code. `render()`
      (`camera.js`) calls `drawPlayerStandingDecor()` once, before the
      depth-sorted world pass, instead of the old before/after pair.
      Every OTHER placed wild grass/flower (anywhere the player ISN'T
      currently standing) is unaffected — still drawn whole via
      `drawWildgrassWhole()` inside the normal Y-sort
      (`renderWorldObjectsSorted()`, entry 53).
    - **3 dirt terrain tiles added as inventory items.** `dirt1`/`dirt2`/
      `dirt3` (`itemDefs`, `inventory.js`) — the same 3 variants
      `world.js` already randomly tiles the map's background with
      (`assets/items/tile/dirt1-3.png`, entry 49) — are now also
      placeable/holdable items, `flat: true` like the Ground tileset
      (plain `groundLayer`, no `layer: "decor"`, no collision). No new
      asset files needed; `assets.dirt1/2/3` were already loaded for
      the terrain generator.

58. **Water/port tileset added (uploaded `water.zip`), inventory scroll,
    inventory grid resized, and a real E-key grab/place mechanic
    replacing the old cosmetic-only carry toggle.**
    - **`water.zip` → 23 new placeable items.** Two sprite sheets:
      `water/port/port.png` (81×80 — a 5×5 land/water edge-and-corner
      tileset, like the Ground tileset's 3×3 but a full 5×5, for
      building island/coastline shapes; the 1px width overhang beyond
      80px was stray non-transparent bleed, ignored) and
      `water/water/water.png` (16×80 — 5 stacked plain water tile
      variants, same "random terrain variant" idea as `dirt1-3`).
      Cropped with Python/PIL into `assets/water/port/` (originally 25
      tiles) and `assets/water/water/` (originally 5) — hash-checked for
      duplicates same as every other cropped sheet this session, and
      genuinely found some: `port_bl` was pixel-identical to plain water,
      `port_i5`/`port_i8` to `port_i2` (the tileset's repeated "all
      grass, no edge" inner tiles), `port_l1` to `port_tc1`, `port_r1` to
      `port_tc3` (the pack apparently reused one edge piece on two
      different sides) — all 5 dropped rather than kept as redundant
      items, and `water4`/`water5` (identical to `water3`) dropped too.
      Net: 20 port items + 3 water items = 23 new itemDefs, all
      `flat: true` (plain groundLayer, no collision), named
      `port*`/`water*`.
    - **Inventory scroll + resize.** `INVENTORY_ROWS` (`config.js`)
      bumped from 8 to 10 (72 → 90 slots) since the item count (89) had
      already outgrown the old grid. `#inventory-panel` (`style.css`)
      gained `max-height: 80vh` + flex-column layout; `#inventory-grid`
      gained `overflow-y: auto` — so the grid scrolls internally once it
      exceeds that height instead of the panel (or the whole overlay)
      growing past the viewport as more items get added later.
    - **E-key grab/place, a real mechanic now, not just a cosmetic
      animation toggle.** Previously "collect" (E) just flipped
      `player.mode` between "normal"/"carrying" to switch sprite sheets,
      with nothing behind it. Now: `player.grabbedType` (`player.js`)
      tracks an actual world object in hand. New `getTileInFrontOfPlayer()`
      + `tryGrabOrPlaceInFront()` (`inventory.js`), called when the
      "collect" animation finishes (same "resolve at the end of the
      swing" pattern the F-key attack already uses, not on the raw
      keypress):
      - The target tile is always exactly the ONE tile in front of the
        player, derived from `player.facing` (up/down/left/right) — per
        request ("laging 1 tile bago [sa] character tile").
      - **Grabbing** (nothing currently held): checks `decorLayer` then
        `objectLayer` at that tile (same priority order
        `findHarvestableTarget()` uses) — wild grass, flowers, stones,
        and trees are all grabbable (per request's examples); `house1`
        is explicitly excluded (a structure, not something you'd carry
        off). On success, the item is deleted from its layer and
        `player.grabbedType` + `player.mode = "carrying"` are set.
      - **Placing** (already holding something): writes the held type
        into whichever layer it belongs to (`layerForType()`) at the
        target tile — same "different item in the same layer gets
        replaced, same item is a no-op" rule `placeHeldItemAt()` already
        uses. Multi-tile-footprint items (the Big Tree) are grabbed/
        placed by their single anchor tile, same as the existing
        hold-to-place system — the wider collision is derived from that
        anchor automatically (`getObjectFootprintBlockedTiles()`), no
        special-casing needed here.
      - `drawHeldItemAboveHead()` (`camera.js`) now shows whichever is
        active — the inventory-based `heldItem` OR `player.grabbedType`
        — so a grabbed tree/stone/flower shows above the character's
        head the same way a held inventory item already did.
      - **Saved, unlike `heldItem`.** `player.grabbedType` IS persisted
        (`save.js`) — unlike the inventory-based hold, a grab has already
        removed something from the world the instant it happens, so
        losing track of it on reload would silently delete it. On load,
        `player.mode` is derived from whether `grabbedType` restored
        successfully, rather than saved as its own separate field.

59. **Inventory viewport pinned to exactly 9x9, not just "scrolls
    eventually."** Entry 58's scroll used the panel's `80vh` as the
    scroll boundary — a viewport-relative size that didn't correspond to
    any particular number of rows and could show 8, 9, or 11 depending on
    screen size. Per request ("gawin 9x9 lang kita"), `#inventory-grid`
    (`style.css`) now caps its own `max-height` at a fixed `444px` — the
    exact pixel height of 9 rows of `.inv-slot`s (44px each) plus the 8
    gaps between them (6px each, the grid's own `gap`): `9*44 + 8*6 =
    444`. Since `INVENTORY_COLS` is already 9, this makes the always-
    visible area a true 9x9 regardless of viewport size; row 10 (and any
    further rows added later) scrolls below it. `#inventory-panel`'s own
    `max-height` (was `80vh`) is no longer the thing doing the limiting —
    bumped to `90vh` purely as a generous fallback ceiling for very short
    screens, not a deliberate row count.

60. **Gold-styled inventory scrollbar; grab/place placement now actually
    blocks on an occupied tile instead of replacing; the E-hold highlight;
    two folder moves (flowers out, water/port in).**
    - **Scrollbar styling.** `#inventory-grid` (`style.css`) gained a
      gold-toned scrollbar — `scrollbar-width`/`scrollbar-color` for
      Firefox, the full `::-webkit-scrollbar*` pseudo-element set for
      Chromium/WebKit/Edge (a `linear-gradient` thumb rather than a flat
      fill, so it reads as a metallic bar).
    - **Placement now BLOCKS on an occupied tile, for both hold systems,
      instead of replacing whatever was there.** Per request ("kapag may
      object na nakalagay na sa tile di na pwedeng lagyan"):
      `placeHeldItemAt()` (the inventory hold-to-place system) and
      `tryGrabOrPlaceInFront()` (entry 58's E-key grab/place) both used
      to let a DIFFERENT item in the same layer get silently replaced —
      now `existingId !== null` (any occupant, not just a matching one)
      is a hard no-op in both. `drawPlacementRange()` (`camera.js`)
      simplified to match: just two highlight states now (white = empty/
      valid, red = occupied/blocked) — the old amber "different item,
      will be replaced" case no longer exists since placing can't do
      that anymore.
    - **The placement-range highlight now also shows while grabbing via
      E**, not just while holding from the inventory. Per request ("kapag
      e-hold, dapat kita pa rin yung tile"): `drawPlacementRange()` reads
      `heldItem ? heldItem.type : player.grabbedType` instead of only
      ever checking `heldItem`, so the surrounding-tiles highlight
      appears for either hold mechanism.
    - **`decoFlower1`/`decoFlower2` moved to their own `assets/flowers/`
      folder**, out of `assets/items/tile/` — per request, separate from
      the ground tileset they visually sit on top of (they'd already been
      moved onto their own `decorLayer`, entry 58/59-era work; this is
      just the asset files finally getting their own folder to match).
    - **The whole `assets/water/` folder (`port/` + `water/`, 23 files)
      merged INTO `assets/items/tile/`** — per request, consolidating
      with the ground tileset/dirt/etc. the same way entry 49 already did
      for flora/dirt. No filename collisions (checked). `assets.js`'s
      `.src` paths updated for all 23; the now-empty `assets/water/`
      folder (and its two subfolders) removed entirely.

61. **Big Stone given a 3-tile-wide footprint, the inventory-scroll
    mouse-wheel bug fixed, and two new grabbed-item actions (T to throw,
    R to keep).**
    - **Big Stone footprint.** Per request ("dapat 3 din... add in left
      at right") — `stoneBig` (`itemDefs`, `inventory.js`) gained
      `fixedFootprint: { leftTiles: 1, rightTiles: 1, heightTiles: 1 }`,
      the same mechanism the Big Tree uses (entry 44/47), giving it a
      3-tile-wide block (1 left + the placement tile + 1 right) instead
      of the default single tile. Verified: placed at column 50, blocks
      49/50/51.
    - **Mouse-wheel scroll fix.** The inventory grid's `overflow-y: auto`
      (entry 58) never actually worked with the mouse wheel — root cause:
      `input.js`'s `wheel` listener is on `window` and unconditionally
      called `e.preventDefault()` for camera zoom, which blocks the
      browser's native scroll on ANY element on the page, all the time,
      including over the open inventory panel. Fixed with one check:
      `if (inventoryOpen) return;` before the zoom logic — while the
      panel's open, wheel events are left alone entirely, so the browser
      scrolls `#inventory-grid` normally.
    - **T (throw) / R (keep) for whatever's grabbed via E.** Two new
      one-shot key flags (`throwRequested`/`keepRequested`, `input.js`),
      both no-ops unless `player.grabbedType` is set:
      - **`tryKeepGrabbedItem()`** (`inventory.js`) — stashes the grabbed
        type into the inventory via `grantItem()` (the same function
        harvesting drops already use), instead of setting it back down
        in the world.
      - **`tryThrowGrabbedItem()`** (`inventory.js`) — places it 2 tiles
        out in the player's facing direction (vs. E's 1 tile), blocked
        under the same "tile already occupied" rule as every other
        placement action (entry 60) — stays in hand if the spot's taken.
        The real placement happens synchronously, exactly like every
        other action in this project; a short cosmetic arc
        (`spawnThrowToss()`/`updateThrownTosses()`/`drawThrownTosses()`,
        `resources.js`/`camera.js` — a simple parabola, ~300ms, NOT
        saved) plays on top afterward, purely decorative. Deliberately
        NOT deferring the real placement until the arc finishes (the way
        it might look more "correct" to) — synchronous-effect-with-
        cosmetic-flourish is the established pattern (wood drops, entry
        45) specifically because it avoids a "reload mid-animation"
        item-loss bug class entirely, which matters more here than it
        would for a floating pickup that never removes anything from the
        world in the first place.
      - Neither key locks movement or plays a swing animation — both
        resolve instantly, the same frame, unlike E/F which lock into a
        one-shot animation first.

62. **A 4th layer added: Dirt/Water split off from the Ground tileset/
    Port into their own "terrain" layer, underneath it.** Per request
    ("dirt, water first layer, second layer grass, port... di na
    papalitan kapag meron na"): before this, Dirt/Water/the Ground
    tileset/Port were ALL just `flat: true`, meaning they shared one
    `groundLayer` — placing Water over an existing Port tile (or Dirt
    over Ground) would replace it, same-layer collision, which isn't
    what "a base layer with dressing on top" should do.
    - New `terrainLayer` (`inventory.js`), alongside `groundLayer`/
      `decorLayer`/`objectLayer` — a new `layer: "terrain"` itemDefs flag
      routes `dirt1-3` and `water1-3` there instead of `groundLayer`.
      `layerForType()` checks `layer === "terrain"` first, same pattern
      `"decor"` already used.
    - `groundLayer` keeps the Ground tileset, Port tiles, and the flat
      decorative stones (XXS Stone, Pebbles) — the "dressing" layer that
      sits on top of the new base terrain layer.
    - New `drawTerrainLayer()` (`camera.js`), drawn FIRST in `render()` —
      even before `drawFlatGroundItems()` — so Dirt/Water sit at the very
      bottom of the stack, with the Ground tileset/Port tiles drawing
      over them.
    - `save.js`'s `buildSaveData()`/`applySaveData()` extended to a 4th
      array; the existing "merge every incoming layer array, re-derive
      each entry's CURRENT layer via `layerForType()`" pattern (entry 60)
      already generalizes to this without any special migration code —
      an old save's Dirt/Water entries (previously filed under
      `groundLayer`) land in the new `terrainLayer` automatically on
      load, same as the stone-layer migration that pattern was built for.
    - Net effect, verified by simulation: Dirt/Water route to
      `terrainLayer`; the Ground tileset, Port tiles, and flat pebbles
      route to `groundLayer`; wild grass/flowers to `decorLayer`; stones/
      trees/the house to `objectLayer` — placing an item in any one of
      these four never disturbs what's on the other three at the same
      tile, only ever replacing/blocking within its own layer.

63. **E-grab extended to the first and second layers (Dirt/Water,
    Ground tileset/Port/pebbles), not just decor/objects.** Per request
    — a placed terrain/ground tile was previously permanent once set (no
    way to grab it back, so the only way to change it was placing a
    DIFFERENT item on top, which entry 60 explicitly blocks now if the
    tile's occupied — meaning terrain/ground tiles had become
    unchangeable once placed). `tryGrabOrPlaceInFront()`'s grab logic
    (`inventory.js`) now checks all FOUR layers in order — `decorLayer`,
    `objectLayer` (excluding the house), `groundLayer`, `terrainLayer` —
    instead of stopping after the first two, so a Dirt/Water/Ground
    tileset/Port tile can be picked up with E just like a stone or tree,
    then thrown (T) or kept (R) exactly like any other grabbed item — no
    changes needed to `tryThrowGrabbedItem()`/`tryKeepGrabbedItem()`
    themselves, since both already resolved the target layer generically
    via `layerForType()` rather than assuming decor/object.

64. **Grab/place targeting made collision-aware (front tile only for
    things you can't stand on); throwing redesigned to destroy with a
    3x blink instead of relocating.**
    - **Collision-aware targeting.** Per request ("depende kung may
      collisions... kapag wala naman same tile ng character") —
      previously EVERY grab/place used the tile 1 in front of the
      player, which didn't make sense for flat/walkable items (wild
      grass, flowers, the Ground tileset, Port tiles, Dirt, Water) that
      the character would naturally be standing ON TOP of, not next to.
      `tryGrabOrPlaceInFront()` (`inventory.js`) now checks
      `itemDefs[type].collides` to decide which tile: a colliding
      `objectLayer` item (a tree, a collidable stone — 15 items total,
      verified) still uses the tile 1 IN FRONT (`getTileInFrontOfPlayer()`)
      since the player physically can't be standing on one; everything
      else uses `getPlayerTile()` (the player's own tile) instead, since
      that's where they'd actually be standing on a flat one. This
      applies to both grabbing (which tile to look at) and placing (which
      tile to set) — a grabbed flat item goes back down under the
      player's own feet, a grabbed tree/stone still goes down in front.
    - **Throwing destroys instead of relocating.** Per request ("kapag
      nag throw is dapat masisira mawawala... blink blink na 3x bago
      mawala") — `tryThrowGrabbedItem()` no longer computes a landing
      tile or places anything; it just clears `player.grabbedType` (the
      item is gone, full stop) and plays a cosmetic flourish. Replaced
      the old toss-and-land arc system entirely: `thrownTosses`/
      `spawnThrowToss()`/`updateThrownTosses()` (`resources.js`) and
      `drawThrownTosses()` (`camera.js`) are gone, replaced by
      `destroyBlinks`/`spawnDestroyBlink()`/`updateDestroyBlinks()`
      (`resources.js`) and `drawDestroyBlinks()` (`camera.js`) — a flat
      on/off flash (no movement, no fade) at roughly the same
      "above the head" spot the held-item icon was shown, for exactly 3
      visible blinks (`DESTROY_BLINK_HALF_MS` × 2 × `DESTROY_BLINK_COUNT`
      = 720ms total — verified by simulation: ON for 120ms, off for
      120ms, three times, then gone). Not saved, same reasoning as
      before — the real effect (clearing the hand) already happened
      synchronously before this cosmetic-only animation is spawned.

65. **Reverted entry 64's throw-destroys-with-blink change — T goes back
    to tossing the item 2 tiles out, per follow-up feedback ("mas ok
    yung dati... 2 tile pagitan").** `tryThrowGrabbedItem()` (`inventory.js`)
    restored to computing a target 2 tiles out in the player's facing
    direction, checking it's free (same "occupied blocks it" rule),
    placing the item there, and playing the toss arc — the exact logic
    entry 63 originally added. The destroy-and-blink system entry 64
    introduced (`destroyBlinks`/`spawnDestroyBlink()`/
    `updateDestroyBlinks()` in `resources.js`, `drawDestroyBlinks()` in
    `camera.js`) is removed entirely, and the toss-arc system it had
    replaced (`thrownTosses`/`spawnThrowToss()`/`updateThrownTosses()`/
    `drawThrownTosses()`) is back in place instead. The collision-aware
    grab/place TARGETING from entry 64 (front tile only for things you
    can't stand on, own tile for everything flat/walkable) is untouched
    — only the throw behavior itself was asked to revert.

66. **Combined toss + destroy: the thrown item now arcs out AND gets
    destroyed, not either alone.** Follow-up clarification ("ok naman na
    kaso di na nasisira dapat masira... mag blink lang kapag nabato na sa
    ground tapos mawawala") — entry 65's revert kept the toss but dropped
    the destroy; this wants both, in sequence: the item tosses out 2
    tiles (unchanged visual, `THROW_TOSS_DURATION_MS` = 300ms), and once
    it visually LANDS, it blinks 3 times in place (`THROW_BLINK_HALF_MS`
    × 2 × `THROW_BLINK_COUNT` = 720ms) and is destroyed for good — never
    placed anywhere.
    - `tryThrowGrabbedItem()` (`inventory.js`) no longer calls
      `layer.set()` at all — the target tile is only ever used to aim the
      cosmetic toss, nothing is written into any layer, so there's
      nothing to check for occupancy either (the old "blocked if the
      landing spot's taken" rule is gone, since nothing is actually
      landing there permanently).
    - `spawnThrowToss()`/`updateThrownTosses()` (`resources.js`) extended
      with `THROW_BLINK_HALF_MS`/`THROW_BLINK_COUNT`/
      `THROW_TOTAL_DURATION_MS` (`THROW_TOSS_DURATION_MS +` the blink
      duration) — the entry now lives for the whole combined sequence
      instead of just the toss.
    - `drawThrownTosses()` (`camera.js`) now branches on elapsed time:
      before `THROW_TOSS_DURATION_MS`, draws the arcing parabola (same as
      before); after that, draws a flat on/off blink AT the landing tile
      instead of continuing to move — verified by simulation: 300ms of
      flight, then ON/ON/off/off ×3 (720ms), 1020ms total before the
      entry is cleared.

67. **Port tiles given collision (each one, single-tile) — the first
    `groundLayer` items to ever block movement, which required two other
    systems to become collision-aware instead of layer-aware.** Per
    request ("lagyan mo ng collision each tile lang") — all 20 Port
    itemDefs (`inventory.js`) gained `collides: true`, still `flat: true`
    (same rendering, drawn beneath everything via `groundLayer`) with the
    default single-tile footprint (no `fixedFootprint` — "each tile
    lang").
    - **`isTileBlocked()`** (`player.js`) used to only ever check
      `objectLayer` for `collides` — every colliding item until now
      happened to live there. Now checks all four layers
      (`terrainLayer`/`groundLayer`/`decorLayer`/`objectLayer`), since
      collision is a per-item property, not something exclusive to one
      layer, anymore.
    - **E-grab/place targeting** (`tryGrabOrPlaceInFront()`,
      `inventory.js`) previously assumed "which tile to check" by LAYER
      (front for objectLayer, own tile for the rest) — broken now that
      SOME `groundLayer` items (Port) collide too: the player can never
      be standing ON a Port tile, so checking their own tile for one
      would never find it. Replaced with `findGrabbableInLayer(layer,
      front, here)`, which checks the correct tile per ITEM's own
      `collides` flag rather than assuming by layer — verified by
      simulation: a colliding Port tile at the front tile is found there
      correctly, even with a non-colliding Ground tile sitting under the
      player's own feet at the same time.

68. **Fixed a real self-trap bug: placing a colliding item (a Port tile,
    a Stone) on your OWN tile locked movement entirely, with no way
    out.** Reported: "stock ako, di makagalaw" (stuck, can't move) after
    placing a Port tile. Root cause: `PLACEMENT_RANGE`'s highlighted area
    includes the player's own tile at offset (0,0), and
    `placeHeldItemAt()` never checked whether the target was the
    player's own position — nothing stopped placing a collidable item
    directly under yourself. Once that happens, movement breaks
    completely: `isTileBlocked()`/`feetTileAt()` (`player.js`) check
    collision per-TILE, and a single frame's motion rarely crosses a tile
    boundary, so the destination tile computed for even a tiny nudge is
    usually still the SAME (now-blocked) tile the player is already
    standing on — every direction keeps re-evaluating that same blocked
    tile and refusing to move, permanently.
    - **Prevention.** `placeHeldItemAt()` (`inventory.js`) now refuses to
      place a colliding item on the player's current tile outright —
      verified by simulation: placing a colliding Port tile on the
      player's own position is blocked, on an adjacent tile it's allowed,
      and a non-colliding item on the player's own tile is still fine (no
      behavior change for the common case). `drawPlacementRange()`
      (`camera.js`) shows this the same way as any other blocked tile
      (red border) so it's visible before clicking, not just silently
      refused.
    - **Escape hatch, in case anything else ever manages to trap a
      player anyway.** `findGrabbableInLayer()` (`inventory.js`, entry
      67) reordered to check the player's OWN tile FIRST for whatever's
      there — colliding or not — before falling back to the front tile.
      Previously it only ever checked the front tile for a colliding
      item, assuming (before this bug was found) that a colliding item
      could never end up on the player's own tile at all; now, if one
      somehow does, E can still grab it out from under them instead of
      the assumption leaving them with no recovery option.

69. **Three Port tiles walked back to non-colliding: `portI1`/`portI2`/
    `portI6`.** Follow-up request — of the 17 remaining colliding Port
    tiles from entry 67, these three (plain "inner" grass tiles, no
    visible edge/corner) had their `collides: true` removed, back to
    plain `flat: true` like the rest of the ground tileset. Verified: 17
    of the 20 Port itemDefs still collide; exactly `portI1`/`portI2`/
    `portI6` don't. No other changes needed — `isTileBlocked()`,
    `findGrabbableInLayer()`, and `placeHeldItemAt()`'s self-trap check
    (entry 68) all key off each item's own `collides` flag already,
    rather than assuming anything about the Port tileset as a whole.

70. **Trees/stones/the house fade when they'd fully hide the character
    behind them.** Per request ("kapag dumaan yung character... dapat
    nag-oopacity yung trees, stone, house... para makita yung character
    kapag dumaan sa likod"). Every objectLayer item is taller than the
    single tile it's Y-sorted against, so walking above one (still
    "behind" it in sort order) could put the player's sprite fully under
    its canopy/silhouette with no way to see them at all — a common
    top-down-game problem, usually solved by fading the occluder.
    - New `drawObjectLayerItem(type, col, row)` (`camera.js`) replaces
      `drawGroundItemAt()` specifically for the objectLayer pass in
      `renderWorldObjectsSorted()` (every other caller of
      `drawGroundItemAt()` — flat ground tiles, terrain — is unaffected,
      since fading never applies to them).
    - `isPlayerBehindAndOverlapping()` checks two things before fading:
      (1) the player's sort key is still less than the object's (they're
      genuinely drawn behind it, not in front already), and (2) an AABB
      overlap between the player's actual VISIBLE bounds (head-top to
      feet — `SPRITE_HEAD_FRACTION`/`SPRITE_FEET_FRACTION` of
      `DRAW_SIZE`, not the full padded sprite frame — and a narrower
      width, `OBJECT_FADE_PLAYER_HALF_WIDTH` = `DRAW_SIZE * 0.35`, for
      the same reason) and the object's own drawn sprite bounds. Only
      when both hold does `OBJECT_FADE_ALPHA` (0.45) apply via
      `ctx.globalAlpha` around the `drawImage()` call.
    - Verified by simulation across several placements: a player well in
      front of a tree, or off to the side with no overlap, never fades
      it; a player positioned above a tree's placement tile, overlapping
      its tall canopy on screen, does — matching "makita yung character
      kapag dumaan sa likod" without fading objects the player isn't
      actually obscured by.

71. **New feature: an NPC shopkeeper — idle animation, auto-flipping
    facing, left-click-to-shop, and the game's first real currency.**
    - **Assets.** Uploaded `Idle-Sheet.png` (256×64 = 4 frames, 64×64
      each, facing right — same convention as the player's own
      `Idle_Side-Sheet.png`) copied to a new `assets/npc/` folder as
      `npc_idle_right.png`. A left-facing copy (`npc_idle_left.png`) was
      generated per request ("gawa ka ng left version din") by cropping
      each of the 4 frames individually and flipping each one
      separately, then reassembling in the same order — flipping the
      whole 256px-wide strip at once would have reversed the FRAME ORDER
      too, not just mirrored each frame's content, breaking the
      animation. Registered in `assets.js` as `npcIdleRight`/`npcIdleLeft`.
    - **New `js/npc.js`** — a single `npc` object (`x`/`y`, `facing`,
      animation frame state) placed a short distance from the player's
      spawn point (`MAP_W/2 + 90, MAP_H/2` — arbitrary, move it by
      editing those two numbers). `updateNPC(dt)` advances the 4-frame
      idle loop (reusing `ANIM_FPS.idle`, no new animation-speed constant
      needed) and, on a wall-clock timer (`Date.now()`-based, same
      convention as day/night and resource respawns — keeps "ticking"
      even while the tab isn't focused), flips `npc.facing` between
      `"right"`/`"left"` every `NPC_FACING_SWITCH_MS` = 3 minutes, per
      request. Facing picks between the two separate PRE-FLIPPED sheets
      rather than the `ctx.scale(-1,1)` runtime-mirror the player uses
      for its own side sprites, matching the "make an actual left
      version" request.
    - **Rendering.** New `drawNPC(px, py, scale)` (`camera.js`) — a
      simplified `drawPlayer()`: just the 4-frame idle loop plus a
      shadow (reusing `drawShadow()`, which is generic enough to accept
      any sheet/frame), no action states, no carry mode, no held item.
      Added to `renderWorldObjectsSorted()`'s Y-sort alongside the player
      and every object, so walking above/below the NPC occludes
      correctly instead of it always drawing on top or underneath
      regardless of position. Reuses `SPRITE_FEET_FRACTION` (tuned for
      the player's own sheets) for the NPC's feet/shadow anchor too,
      rather than measuring a separate constant for this new sprite — a
      quick check found the NPC art's actual lowest opaque pixel sits
      slightly lower (~0.73 of the frame height) than the player's
      measured feet position (0.62), a small enough difference to not
      matter for a mostly-stationary idle NPC, but worth knowing if the
      shadow ever looks slightly off at its base.
    - **Left-click-to-shop.** New `setupNpcClickHandler()` (`npc.js`),
      wired up from `main.js`'s `start()` the same way
      `js/inventory.js`'s placement handler is — a SEPARATE `mousedown`
      listener from that one (rather than folding into it), since the
      two react to opposite conditions: this one only opens the shop
      when BOTH `heldItem` and `player.grabbedType` are empty AND the
      click lands within `NPC_CLICK_RADIUS` (26 world px) of `npc.x/y` —
      a simple circular hit-test via new `isPointOnNPC()`, not exact
      sprite bounds. Needed a way to convert a click to world x/y (not
      just a tile) since the NPC's position is continuous, not
      tile-aligned: extracted `screenToWorld()` out of
      `js/inventory.js`'s existing `screenToTile()` (which now just calls
      it and floors the result) rather than duplicating the coordinate
      math in `npc.js`.
    - **The game's first currency.** `player.gold` (`player.js`, starts
      at 100) — saved (`save.js`, alongside a defensive
      "corrupted/negative value falls back to the current amount" guard,
      same pattern the other restores there use) and shown in a new
      always-visible top-left HUD (`#gold-hud`, `index.html`/`style.css`,
      slotted between the clock and the equipped-weapon HUD — the latter
      moved down from `top: 54px` to `top: 96px` to make room, since
      gold is always shown while equipped-weapon is conditional).
    - **The shop itself.** `NPC_SHOP_STOCK` (`npc.js`) is a curated,
      hand-picked list — 8 items (5 weapons, one shield, two harvest
      materials) with prices I chose myself (per "ikaw na bahala sa
      presyo"): Wood Sword 15, Wood Dagger 10, Wood Axe 20, Wood Pickaxe
      18, Wood Bow 30, Wood Shield (Small) 12, Wood Log 3, Stone Chunk 3
      — every type verified to actually exist in `itemDefs`. New
      `#npc-shop-overlay` panel (`index.html`, styled in `style.css` to
      match the inventory panel's look, including the same gold-toned
      scrollbar entry 60 added) lists each with an icon, name, price, and
      a Buy button that's disabled outright when `player.gold` is too
      low. `buyFromNpc(type, price)` deducts gold and calls `grantItem()`
      (the same function harvesting drops already use) — since every
      item in this project is currently `unlimited: true` elsewhere, this
      is a real economy sink/foundation more than a scarcity mechanic
      for now, but it's genuinely wired (gold is spent and saved, not
      just decorative). Closes on click-outside or **Esc**, same
      convention as this project's other popups.

72. **NPC given a time-based walk animation (uploaded `Walk-Sheet.png`)
    for a morning window, and its exact map location clarified.**
    - **Where the NPC actually is** — asked directly ("san banda yung
      npc?"): `npc.x/y` (`MAP_W/2 + 90, MAP_H/2`) works out to tile
      **col 99, row 51** — 5.625 tiles due right of the player's own
      spawn tile (col 93, row 51, same row), computed and verified
      directly (`Math.floor(npcX/TILE)`/`Math.floor(npcY/TILE)`). Should
      be a short walk right from spawn; if it's still not visible,
      double-check the delivered `assets/npc/` files actually made it
      into the running copy (all 4 sprite files, not just the 2 idle
      ones from entry 71) rather than assuming the position math is
      wrong — that part's confirmed correct.
    - **Walk sheet.** Uploaded `Walk-Sheet.png` (384×64 = 6 frames,
      64×64 each, facing right — same convention as the idle sheet and
      the player's own `Walk_Side-Sheet.png`) copied to
      `assets/npc/npc_walk_right.png`; a left-facing copy
      (`npc_walk_left.png`) generated the same per-frame-flip way the
      idle sheet's left version was (entry 71) — crop each of the 6
      64×64 frames individually, flip each one, reassemble in the same
      order, rather than flipping the whole 384px strip at once (which
      would reverse frame ORDER too). Registered in `assets.js` as
      `npcWalkRight`/`npcWalkLeft`.
    - **Time-based animation state, in `js/npc.js`.** New
      `isNpcWalkingTime()` reads `getGameHour()` (`daynight.js`, a
      fractional 0-24 value) and returns true for
      `NPC_WALK_START_HOUR` (6) up to but not including
      `NPC_WALK_END_HOUR` (8) — verified by simulation across several
      hours (5:59 false, 6:00 true, 7:59 true, 8:00 false), matching "6am
      to 7:59 walking, 8am onwards idle" exactly. `updateNPC(dt)` checks
      this every frame into a new `npc.isWalking` flag; when it flips,
      `npc.frame`/`npc.frameTimer` reset to 0 — idle (4 frames) and walk
      (6 frames) are different lengths, so carrying an index over from
      one into the other could read past the end of the shorter one.
      `drawNPC()` (`camera.js`) reads `npc.isWalking` (set once per
      frame, not recomputed) to pick the walk sheet pair over the idle
      one, then facing within that pair, same structure as before.
    - **The NPC does not actually relocate** — "walking" here means the
      walk ANIMATION plays while it stays at its fixed `x`/`y`, not that
      it paces back and forth. The request asked for the animation tied
      to time of day and a left-facing sheet, not a patrol path; a real
      walking-around behavior would need a defined route and is a
      reasonable separate follow-up if wanted later.

73. **New feature: a full HUD overhaul — health/stamina/food/EXP bars,
    a Duration/Col/Row readout, a Day counter, a rotating Weather
    display, and a minimap.** Per request, laid out as: everything
    except weather and the minimap in a unified top-left stack, weather
    moved to top-center, and a minimap on the top-right.
    - **`#left-hud` — one flex column instead of many `position:fixed`
      pieces.** The pre-existing clock/gold/equipped-weapon HUDs used to
      each have their own hardcoded `top: Npx` (entries 61-71 kept
      bumping these numbers as things got added). Restructured so all of
      them — plus the new bars/readouts — are children of one
      `display: flex; flex-direction: column` container
      (`index.html`/`style.css`); order top-to-bottom now: Health,
      Stamina, Food, EXP, Duration, Col/Row, the clock, Day count, Gold,
      Equipped Weapon. Every existing element kept its ID (so every
      other file's `getElementById()` calls — `main.js`'s clock update,
      `npc.js`'s gold display, `inventory.js`'s equipped-weapon HUD —
      needed zero changes), just moved structurally into the new
      container and lost their individual `position`/`top` rules.
    - **Health and EXP are foundations, not full systems yet** — no
      damage source exists to lower health, no way to gain EXP yet, so
      both bars just sit at their starting value (100/100 and 0/100).
      They're real `player.js` fields (`health`/`maxHealth`/`exp`/
      `maxExp`) and are saved, so nothing needs to change structurally
      once a combat or leveling system adds a way to actually move them.
    - **Stamina and Food are real, working systems.** New
      `STAMINA_DRAIN_PER_SEC`/`STAMINA_REGEN_PER_SEC` (`config.js`):
      running drains stamina, not running regenerates it slower than it
      drains, and — a genuine gameplay change — `updatePlayer()`
      (`player.js`) now also requires `player.stamina > 0` for Shift to
      actually trigger running; hitting empty forces a fall-back to
      walking until it recovers. Food (`FOOD_DRAIN_PER_GAME_HOUR`,
      config.js — tuned so a full 100 lasts exactly one in-game day)
      depletes via new `updatePlayerStats(dt)` (`js/hud.js`), tied to the
      IN-GAME clock's rate (via `TIME_SCALE`) rather than real seconds
      directly, so it keeps pace with day/night. No way to eat/refill it
      yet — also a foundation, but an actively-draining one.
    - **Day counter.** New `getGameDay()` (`daynight.js`) — `updateDayNight()`
      now also computes `gameDay` (1-indexed, same wall-clock-anchored
      math `gameSeconds` already used, so it survives a refresh the same
      way) alongside the existing time-of-day fraction. Verified by
      simulation: day 1 at t=0, day 2 after one full game-day elapsed,
      day 3 partway into the third.
    - **Weather** (`js/hud.js`) rotates through 4 states (Clear/Cloudy/
      Rainy/Windy) every `WEATHER_CHANGE_MS` (10 real minutes,
      wall-clock-based, same convention as the NPC's facing timer) —
      purely cosmetic/informational, no gameplay effect yet, explicitly
      a hook for later rather than a claim that it does something now.
    - **Duration** is `player.playTimeSeconds`, accumulated every frame
      via `dt` in `updatePlayerStats()` and saved — total time played
      across sessions, not a per-session timer that resets on reload.
      Formatted "HH:MM:SS" by new `formatDuration()`.
    - **Col/Row** just reads `getPlayerTile()` (already existed,
      `inventory.js`) every frame — no new state needed.
    - **Minimap** — a genuinely separate `<canvas id="minimap">`
      (index.html, NOT part of the main `#view` canvas/camera pipeline),
      drawn by new `drawMinimap()` (`js/hud.js`), called from `render()`
      (`camera.js`) after everything else. Shows the WHOLE map scaled
      down to fit (a flat fill standing in for per-tile detail, which
      would be unreadable at this size), a dot for the player, a dot for
      the NPC, and a stroked rectangle outlining the main camera's
      current viewport — so what's actually "naka-zoom" (zoomed into)
      right now is visible against the whole-map overview, per request.
    - **Saved:** health/stamina/food/exp/playTimeSeconds (`save.js`,
      same defensive clamp-to-max-and-fall-back-if-not-a-number pattern
      the other stat restores there use). **Not saved:** weather (resets
      to "Clear" on reload — purely cosmetic, same treatment as
      wildgrassSway).

74. **HUD reorganized into bordered sections, sized down, and Weather
    moved off top-center into the left stack next to Day.** Per request
    ("lagyan mo ng separation ng division o section... medyo liitan lang
    yung design... yung weather... isama mo dun sa date... baba ng
    health bar section different section yun").
    - **Sectioned layout.** `#left-hud`'s children are now wrapped in
      `.hud-section` boxes (`index.html`/`style.css`) — each with its own
      border/background — instead of one flat list of same-level rows.
      Top to bottom: (1) the 4 stat bars together, (2) Day + Weather
      together — a new `.hud-row` variant that lays two short readouts
      side by side instead of stacking them, (3) Duration + Col/Row
      together, (4) the clock + Gold together, (5) the equipped-weapon
      row (still conditionally hidden).
    - **Weather relocated, not re-implemented.** The standalone
      top-center `#weather-hud` div is gone; its content now lives inside
      the Day section as `#weather-hud-text`, a plain `<span>`.
      `updateWeather()`/`getCurrentWeather()` (`js/hud.js`) are completely
      unchanged — only the DOM element the reading gets written to moved
      (`weatherHudEl` now points at `#weather-hud-text`), and only the
      CSS positioning it used to have (fixed, top-center) is gone,
      replaced by the section's normal flex layout.
    - **Sized down across the board**, per request: `#left-hud` width
      168px (was 200px), section padding 5px/8px, gap 5px (was 6px);
      stat bar height 15px (was 20px) with 10px label text (was 12px);
      the shared text rows (day/weather/duration/position/clock/gold/
      equipped-weapon) all now 11px (clock/gold used to be 13-14px); the
      equipped-weapon icon shrunk to 20px (was 24px) and its Unequip
      button to 10px text/tighter padding; the minimap shrunk to 110×110
      (was 140×140) — its drawing code already read the canvas's own
      width/height dynamically rather than hardcoding 140, so no JS
      changes were needed for that resize to take effect.
    - Caught and fixed a stray orphaned CSS block while removing the old
      `#weather-hud` selector (an editing slip left its declarations
      without a selector above them, which would've been silently
      dropped by the browser as invalid CSS) — verified clean with a
      brace-balance check afterward.

75. **NPC given real 1-tile collision, and the bare "no leaves" trees'
    hit count/drop reworked.**
    - **NPC collision.** New `getNpcTile()` (`npc.js`) computes the
      single tile the NPC occupies using the same feet-based math
      `getPlayerTile()`/`feetTileAt()` already use (so the blocked tile
      lines up with where the NPC visually stands, not the center of its
      whole sprite box) — the NPC never actually relocates (see entry
      72's "walking is an animation, not a patrol" note), so this is a
      genuinely fixed, single tile, not something that needs to track
      movement. `isTileBlocked()` (`player.js`) checks it directly
      alongside the usual four placed-item layers, since the NPC isn't
      itself an entry in any of them. Verified: with the NPC's current
      position (`MAP_W/2 + 90, MAP_H/2 + 115`), its blocked tile (col 99,
      row 58) is well clear of the player's own spawn tile (col 93, row
      51) — no immediate self-trap risk the way entry 68's placement bug
      had. Worth knowing: if an existing save happens to have the player
      standing exactly on the NPC's tile from before this change (only
      possible if they'd walked there while it was still walkable),
      loading that save could reproduce a similar movement-lock symptom
      to entry 68's, since the tile they're already standing on just
      became blocked out from under them — not proactively guarded
      against here, since it requires a fairly specific prior position
      and wasn't asked for.
    - **Bare/noLeaves trees reworked.** Per request ("kapag na slice ko 3
      slice tapos masisira... same lang ng drop ng thin") —
      `treeThinNoLeaves1`/`treeThinNoLeaves2` (`itemDefs`, `inventory.js`)
      changed from `hitsToBreak: 2` (matching a stump) to `hitsToBreak: 3`
      (matching a living tree), and gained `dropItem: "woodLog",
      dropAmount: 2` — matching Thin Tree Stump's amount (the "thin"
      drop being referenced), where before they granted nothing at all.
      Comments in `resources.js` and the README's Harvesting section
      updated to match (the README's old wording — "the bare trees don't
      grant anything" — split into its own bullet describing the new 3-hit/
      2-log behavior instead of grouping it with the stumps' 2-hit rule).

76. **Jan-Dec calendar, 4 real seasons, and weather (Sunny/Rainy/Snow)
    that actually affects what's drawn — added per request ("i want
    have a calendar weather sunny, rainy and snow and calendar jan to
    dec and the 4 season i want you to apply it").**
    - **New `js/calendar.js`**, loaded right after `js/daynight.js` (it
      reads that file's `getGameDay()`, a plain 1-indexed day counter
      already persisted across refreshes) and before everything else.
      No second date counter was added — `CALENDAR_DAYS_PER_MONTH`
      (`js/config.js`, 30) just reinterprets that single number as
      month / day-of-month / year / season:
      `getCalendarDate()` -> `{ year, monthIndex, monthName, monthAbbr,
      dayOfMonth, season, seasonIcon }`. 12 months of 30 in-game days =
      a 360-day year; at the default 15-real-minute day this is ~7.5
      real hours per month, ~3.75 real days per year. Seasons use the
      standard meteorological (Northern-hemisphere) grouping: Dec/Jan/
      Feb = Winter, Mar/Apr/May = Spring, Jun/Jul/Aug = Summer, Sep/Oct/
      Nov = Fall (`CALENDAR_MONTH_SEASON`, config.js).
    - **Weather replaced, not just relabeled.** The old cosmetic
      Clear/Cloudy/Rainy/Windy rotation (`js/hud.js`, timer-based, 10
      real minutes, no gameplay effect) is gone. `calendar.js` now owns
      `updateWeather()`/`getCurrentWeather()` under the same names/call
      site (`main.js`'s `loop()`) so nothing else had to change its call
      chain — it just rerolls once per in-game day (checked via
      `getGameDay()` ticking over, not a wall-clock timer) into one of
      three states, **Sunny / Rainy / Snow**, weighted by the current
      season via `SEASON_WEATHER_WEIGHTS` (config.js) — e.g. Winter
      rolls Snow ~65% of the time, Summer rolls Sunny ~80% of the time,
      Spring/Fall are roughly even Sunny/Rainy with a small chance of
      the "wrong" one, matching how real transitional seasons behave.
    - **Weather now has a real effect, not just a HUD label.**
      `js/weatherfx.js`'s `updateWeatherFX()`/`drawWeatherOverlayFX()`
      read `getCurrentWeather().name` and only update/draw rain during
      "Rainy" and snow during "Snow" (neither during "Sunny") — before
      this, rain silently fell every single frame regardless of what
      the HUD weather readout said, since that readout was purely
      decorative. Cloud opacity (`drawCloudShadows()`/`drawCloudSprites()`)
      and god-ray strength (`drawSunRays()`) are also nudged by the
      current state via two new multiplier tables in config.js
      (`WEATHER_CLOUD_OPACITY_MULT`, `WEATHER_SUNRAY_MULT`) — sunny
      days get thinner clouds and brighter rays, rainy/snowy days get
      thicker cloud cover and duller (sun-blocked) rays — read through
      small `weatherCloudMult()`/`weatherSunrayMult()` helpers so the
      existing draw code only needed a one-line multiply added, not a
      rewrite.
    - **New snow particle system**, added to `js/weatherfx.js` as a
      parallel to the existing rain system rather than folded into it
      (different motion entirely): `spawnSnowFlake()`/`updateSnow()`/
      `drawSnow()` fall much slower than rain
      (`SNOW_FALL_SPEED_MIN/MAX`, config.js: 16-38 vs rain's 70-160
      world px/sec) and sway side-to-side via a sine drift
      (`SNOW_DRIFT_AMPLITUDE_*`/`SNOW_DRIFT_SPEED_*`) around a
      per-flake `baseX`, instead of falling perfectly straight down
      like rain. Uses the previously-unused `assets/particles/Snow.png`
      (a 7-frame, 8x8-per-frame strip — measured with PIL before
      wiring up `SNOW_FRAME_W/H/COUNT`), now loaded in `js/assets.js`
      as `assets.snow` (picked up automatically by the asset-loader's
      `Object.values(assets)` scan, no changes needed there). No ground
      splash equivalent was added for snow (rain has one via
      `RainOnFloor.png`) — snow settling doesn't splash, and no
      "settled snow decal" system was requested.
    - **HUD reworked**, `index.html`/`js/hud.js`: the Day+Weather
      `.hud-row` became a two-row `.hud-section` — row 1 is Day N +
      the calendar date (`Mon D`, e.g. "Mar 5"), row 2 is the season
      (with its own icon, `CALENDAR_SEASON_ICONS`) and the weather
      (with its icon). `updateStatsHUD()` now also calls
      `getCalendarDate()`/`getCurrentWeather()` each frame (both are
      cheap — the former is pure arithmetic on `getGameDay()`, the
      latter just returns an already-computed value) and writes to two
      new elements, `#calendar-hud-date` and `#season-hud-text`,
      alongside the existing `#day-hud-number`/`#weather-hud-text`.
    - **README updated** to describe the new calendar/season/weather
      HUD row and point at `js/calendar.js` + the weather section of
      `js/config.js` for retuning month length or season odds.

77. **Similar-looking tile families (grass's 3x3 autotile set, the 3 dirt
    variants, the 3 water variants, the port/island 5x5 edge set)
    consolidated into ONE inventory slot each, instead of one slot per
    variant — per request ("yung sa mga may magkakaparehong tile like 9
    tiles dun sa grass, dirt, fence, water, port... kahit isang tile na
    lang yung lilitaw... maliliit lang yung mismong icon nila
    magkakatabi tapos mamimili kapag nag click ng isa is lilitaw yung
    pop up na may hold tapos mga slots sa hotkey na 1-7").**
    - **Grouping is derived, not hand-listed.** New `tileGroupIdForType()`
      (`js/inventory.js`, right after `itemDefs`) buckets every itemDefs
      key by its NAME PREFIX — `grass*` (10 keys, including the plain
      "grass" tile alongside the 9 TL/TC/TR/L/Inner/R/BL/BC/BR pieces),
      `dirt*` (3), `water*` (3), `port*` (23) — into `tileGroups`, rather
      than a manually-maintained member list. A future tile added to one
      of these families is picked up automatically just by naming it
      with the matching prefix; nothing else needs updating. Fence
      (`assets/outdoor/fence.png`) was NOT included — it's a single
      sprite, no variant set exists to consolidate, so there was nothing
      to group there despite being named in the request alongside the
      others.
    - **The underlying `inventory`/`hotbar` arrays are completely
      untouched** — still exactly one real slot per itemDefs key, same
      indices as before (`inventoryIndexByType`, built the same
      `Object.keys(itemDefs)` order the inventory array itself is
      filled in). This is purely a rendering change in `renderInventory()`:
      when it reaches a slot whose type belongs to a group, it renders
      ONE `.inv-slot-group` box for that whole family (skipping — not
      hiding, actually omitting — every other member's slot, which is
      what actually frees up the grid space) instead of one box per
      member. Save/load, placement, hotbar-assignment, and holding all
      still operate on real underlying types/indices exactly as before;
      none of that code was touched.
    - **Group slot preview.** `buildTileGroupSlotBox()` packs up to 9 of
      the family's member icons, small (10px, `.inv-group-preview`),
      into the one 44px slot instead of showing a single 28px icon —
      "maliliit lang yung mismong icon nila magkakatabi" ("their actual
      icons [are shown] small, side by side"). Families with more than 9
      members (only Port, 23) get a small "+14" badge
      (`.inv-group-more`) in the corner on top of the 9-icon preview
      rather than trying to cram all 23 into one slot unreadably. The
      slot turns green (`.held`) while the player is holding ANY member
      of that family, same idea as a normal slot's held-highlight.
    - **New popup: the tile variant picker.** Clicking (or right-
      clicking — there's no single "the" item on a group slot to hold
      directly, so both do the same thing here, unlike a normal slot)
      a `.inv-slot-group` box opens `openTileVariantPicker()`
      (`#tile-variant-picker`, new in `index.html`) — every member of
      that family shown at normal 32px icon size in a small grid.
      Clicking one of THOSE closes the variant popup and opens the
      exact same `openItemActionMenu()` (Hold + assign-to-1-7) every
      other single item already uses, anchored to the button just
      clicked — matching "mamimili kapag nag click ng isa is lilitaw
      yung pop up na may hold tapos mga slots sa hotkey na 1-7" exactly.
      Nothing about `openItemActionMenu()` itself changed.
    - **Two small self-close bugs caught and avoided while wiring this
      up**, both from the fact that clicking something can bubble a
      "click" event up to `document`-level "close this popup if you
      clicked outside it" listeners already in this file: (1) the
      group slot's own click bubbling into the NEW variant-picker's
      outside-click listener and closing the popup the instant it
      opened — fixed by excluding any click landing inside a
      `.inv-slot-group` element from that listener, the same way the
      equipment weapon picker already excludes clicks on its own slot;
      (2) a variant button's click bubbling into the EXISTING item-
      action-menu's outside-click listener right after that menu had
      just been opened by that same click — fixed with
      `e.stopPropagation()` on the variant button (the action menu's
      own Hold/hotkey buttons already do this for the same reason), so
      the click never reaches `document` at all once a variant's been
      picked. Also had to capture the clicked variant button's
      `getBoundingClientRect()` BEFORE closing the variant popup (which
      empties `#tile-variant-picker` and detaches the button) rather
      than after — `openItemActionMenu()` takes a real anchor element,
      so it's handed a tiny fake one (`{ getBoundingClientRect: () =>
      rect }`) carrying that pre-captured rect instead.

78. **Tile-group consolidation (entry 77) extended to Stones and Trees,
    and a run/walk animation-flicker bug fixed, both per request ("do
    the same to stones and trees and fix the bug if the stamina duration
    out stamina and go into walk").**
    - **Stones and Trees now consolidate the same way grass/dirt/water/
      port already did.** `TILE_GROUP_META` (`js/inventory.js`) gained
      two more entries, each with a `match(type)` test instead of the
      plain prefix check the first four groups used, since these two
      needed a little more care: `stone` matches every `stone*` key
      EXCEPT `stoneChunk` (10 members: Big/Medium/Small/XS/XXS Stone +
      the 5 Pebbles) — `stoneChunk` is the crafting material dropped by
      breaking a stone, not "a kind of stone tile" someone would browse
      alongside the placeable ones, so it's excluded explicitly rather
      than letting the prefix catch it too and confuse the picker.
      `tree` matches every `tree*` key with no exclusions needed (9
      members: every living tree, bare tree, and cut stump) — wood
      materials/tools are a separate `wood*` prefix, so they were never
      at risk of being swept in. `tileGroupIdForType()` now loops each
      group's `match()` instead of a bare `type.startsWith(gid)`, which
      is what made the exclusion possible without hand-listing members.
      Everything else (the consolidated slot's mini preview, the "+N"
      badge past 9 shown members — Stones gets a "+1" now — the variant
      picker, all of it) is the exact same code from entry 77, unchanged;
      only which itemDefs keys feed into it grew.
    - **Run/walk flicker bug, fixed.** `updatePlayer()` (`js/player.js`)
      used to gate running on plain `player.stamina > 0`. Right at the
      moment stamina emptied out while Shift was still held, this
      flickered: stamina drains to EXACTLY 0 one frame (`running` goes
      false, so regen starts that same frame), ticks a hair back above
      0 the very next frame (`running` goes true again, since Shift's
      still down and stamina is technically > 0 again), which drains it
      straight back to 0, repeating dozens of times a second — and
      since the code already resets the frame counter on every anim
      change (`nextAnim !== player.anim`), each toggle visibly snapped
      the sprite between the run and walk sheets instead of settling
      into a walk like it should have. Fixed with a latch,
      `player.staminaExhausted` (`js/player.js`'s player object): once
      stamina actually reaches 0 it's set (forcing `running` false
      regardless of Shift), and it only clears once stamina has
      regenerated back up to `STAMINA_RUN_RECOVER_PCT` (new,
      `js/config.js`, 0.3 = 30% of max) — a real recovery, not just
      "greater than zero" — so there's no boundary left to flicker
      across. Not saved (`js/save.js` untouched) — it's a transient
      movement flag; worst case after a reload is just reaching empty
      again before it can re-arm, no real downside to that.

79. **See-through trees/stones/house now pixel-vs-pixel; house only
    fades when the character is BEHIND it.** Per request ("kapag nasa
    gilid lang nag-oopacity pa rin... dead space di dapat mag-opacity...
    yung house dapat likod lang"). Two real causes, both fixed:
    - The character was modelled as a box `DRAW_SIZE * 0.35` = 16.8 world
      px to each side of center (~34px wide) — its real body is only ~14px
      wide (sprite px 23..41 of 64, at 48/64 scale). That fat box touched
      trunks/roots/branches/house walls while there was clearly grass
      between them on screen. Now the character's REAL silhouette
      (`CHARACTER_ALPHA_MASKS`, every frame of every sheet) is tested
      against the object's REAL silhouette (`OBJECT_ALPHA_MASKS`) — fade
      only if an opaque character pixel lands on an opaque object pixel.
      Looping idle/walk/run use the sheet's union silhouette (no per-frame
      flicker at an edge); one-shot actions use the exact frame.
    - The first attempt read the tree alpha with canvas `getImageData`,
      which throws "tainted canvas" under file:// and silently fell back
      to the bounding box. Masks are now precomputed into
      `js/objectAlphaMasks.js` by `tools/generate_alpha_masks.py` (re-run
      it if any tree/stone/house/character PNG changes, or add new
      objectLayer items to its `OBJECT_ICONS`).
    - `fadeOnlyWhenBehind: true` (house1): additionally requires the
      character's FEET (sprite rows 44..47, cols 26..37) to be hidden
      behind the house's own pixels — so standing beside a wall never
      fades it, even if the head overlaps the roof overhang.
    Verified in headless Chromium via file:// against real positions
    (beside trunk w/ gap, touching trunk, canopy deadspace, behind
    leaves, beside/behind house, stones, bare tree, walking).

80. **136 previously-unused art assets wired into the inventory; the 14
    wood weapons pulled out of it for now.** Per request ("lagay mo na
    rin yung iba pang mga pixel na wala pa sa inventory except sa mga
    weapon alisin mo muna sa inventory").
    - Added via `tools/add_remaining_items.py` (re-run it if more art
      gets dropped into these same folders later — it's idempotent):
      bushes/flowers/mushrooms (22), extra medium tree + trunk variants
      (6, "tree"-prefixed so they auto-join the existing Trees group),
      two alternate house skins `house2`/`house3` (same collides/
      multiTileFootprint/fadeOnlyWhenBehind treatment as house1),
      interior furniture (~55: beds, tables, chairs, stoves, couch,
      drawers, doors/windows/floors/walls...), outdoor furniture (~20:
      benches, fence, port bridge pieces, lamp posts...), and
      vegetables/farming items (~22: onion/petchay/cabbage/broccoli/
      carrots/dragonfruit + their crates, dirt rake, planting sockets,
      water crates).
    - The 7 vegetable sprites (onion.png, petchay.png, cabbage.png,
      brocolli.png, brocolli_flower.png, carrots.png, dragonfruit.png)
      turned out to be multi-stage GROWTH STRIPS, not single icons (found
      by scanning each for fully-transparent gap columns) — the last
      (mature/harvestable) stage was cropped out into `*_mature.png`
      next to the source file and that's what's actually registered.
    - 5 files were left out on purpose — not single icons: `backchair.png`
      and `base4.png` (608x384, a whole uncropped contact sheet, not
      that one chair/cabinet), `interior/asesprite/bigbed-sheet.png`
      (1380x54 raw multi-frame strip — `bigbed.png` is the real icon),
      `port_bridge_wall_strock.png` (800x864 texture sheet), and
      `vegetables/wet.png` (two glued-together variants, unclear split).
      The entire `assets/particles/` tree was left alone too — it's
      exact duplicate art of assets/bushes, assets/interior (as
      "inside"), assets/outdoor (as "outside"), assets/items/vegetables,
      assets/items/house and assets/items/trees; wiring both up would've
      just double-added the same pictures under two different ids.
    - New non-flat items got no `collides`/`fixedFootprint` (except the
      new trees and the 2 houses, which match their existing siblings) —
      that's a per-item design decision nobody's made yet, not an
      oversight; add it later the same way house1/the stones do.
    - Every new non-flat item also got an entry in
      `tools/generate_alpha_masks.py`'s `OBJECT_ICONS` and a regenerated
      `js/objectAlphaMasks.js`, so entry 79's pixel-accurate fade covers
      them too, not just the original trees/stones/house.
    - Weapons: removed the 14 `equipSlot: "weapon"` entries
      (woodSword/Dagger/DaggerSmall/Rapier/Javelin/Axe/Sickle/Pickaxe/
      Mattock/Hammer/HookStaff/ClubWrapped/Tongs/Bow) from `itemDefs`.
      Left their `assets.js` Image() + `.src` lines alone (harmless
      either way) and left `NPC_SHOP_STOCK` in npc.js untouched too —
      `renderNpcShopGrid()` already skips a stock row when
      `itemDefs[type]` is missing, so the shop just quietly drops those
      5 rows instead of breaking. Re-adding the itemDefs entries later
      (nothing else needs to change) brings them straight back everywhere.
    - Verified in headless Chromium via file://: all 211 itemDefs load
      with a real (non-broken) icon, the inventory auto-fills all 211
      slots, zero weapons remain, zero console/page errors, and a sample
      of the new items (bushes, medium trees, house2/house3, bed, stove,
      couch, crates, crops) were placed and screenshotted to confirm
      they draw correctly and Y-sort correctly.

81. **House placement is now a timed construction, not instant — plus a
    full footprint preview while holding one.** Per request: "kapag naka
    hold na is lumitaw yung mismong tiles kung ilan yung 16x16 tile na
    naconsume... dapat mag countdown 10 sec tapos may progress bar na
    green tapos sa gitna nun is nandun yung countdown tyaka lang
    matatayo yung bahay at magkaroon ng collisions... pero dapat kapag
    laging sa top is may 2 allowance na row ng tiles ng walang
    collisions same sa naunang bahay". Applies to all 3 house skins
    (house1/house2/house3) via a new itemDefs flag, `buildSeconds: 10`
    — any future `multiTileFootprint` item picks up the same behavior
    automatically just by setting that flag, nothing else to wire up.
    - **Preview while holding** (camera.js's drawHouseFootprintPreview(),
      replacing the generic per-tile range grid for these items only):
      outlines EVERY 16x16 tile the art will actually cover — derived
      from the same pixel math getObjectFootprintBlockedTiles() already
      used (now split out into a reusable getMultiTileFootprintRect()/
      getMultiTileFootprintTiles(), inventory.js) — plus one thicker
      rectangle around the whole shape. White = valid, red = blocked,
      always tracking the mouse (screenToTile(lastMouseClientX/Y)).
    - **Starting a build** (placeHeldItemAt(), inventory.js): instead of
      writing straight into objectLayer, it now checks
      canPlaceHouseFootprint() (in range, whole footprint clear of other
      objects AND other in-progress builds, not about to trap the player
      under a soon-to-collide tile) and, if clear, adds an entry to a new
      `pendingConstructions` Map (col,row -> {type, startAt, finishAt})
      — no art, no collision, nothing in objectLayer yet.
    - **While building** (camera.js's drawPendingConstructions(), called
      every render() frame): a 40%-opacity "blueprint" ghost of the real
      icon, plus a green progress bar centered above the footprint with
      the countdown (whole seconds remaining) centered on the bar itself.
    - **Finishing** (updateConstructions(), inventory.js — wall-clock
      based like resources.js's respawns, called from main.js's loop):
      once `finishAt` passes, it's written into objectLayer for real —
      from that point on it's indistinguishable from the old instant-
      place path, same `getObjectFootprintBlockedTiles()`/
      `footprintExcludeBackRows: 2` collision as before, unchanged. If
      the player is currently standing on a tile that's about to start
      colliding, finishing is deferred (checked every frame) until they
      step off it, rather than ever trapping them — same self-trap
      philosophy placeHeldItemAt()'s own-tile check already used
      elsewhere in this file.
    - Saved (js/save.js), same treatment as pendingRespawns, so a build
      in progress survives a reload instead of losing progress or
      finishing silently in the background.
    - Fixed a small pre-existing gap while in this area: the E-key grab
      mechanic (tryGrabOrPlaceInFront()) only ever special-cased
      `type === "house1"` as ungrabbable, so house2/house3 (added in
      entry 80) were accidentally still E-grabbable. Now checks
      `itemDefs[type].multiTileFootprint` generically.
    - Verified in headless Chromium via file://: previewed a hold
      (correct 9x8-tile white outline for house1), clicked to place
      (confirmed NOT instantly in objectLayer, one pendingConstructions
      entry created), screenshotted the ghost + bar at 0s/4s/10s
      (progress bar filling, countdown 10 -> 6 -> done, house appears
      exactly once finished), confirmed 54 tiles end up blocked
      (matching the pre-existing footprintExcludeBackRows: 2 math,
      unchanged), confirmed overlapping a second construction attempt is
      rejected, confirmed building is blocked where an existing object
      already sits, confirmed house2/house3 are no longer E-grabbable,
      confirmed ordinary single-tile items (stones/trees/ground tiles)
      still place instantly with zero regression, and confirmed a
      construction's progress survives a save/applySaveData() roundtrip.

82. **House footprint tightened to the real art size; house2/house3 get
    7 free rows at the back (not 2); build progress bar moved onto the
    house and shrunk.** Follow-up per request, after watching a
    recording: "medyo malaki... yung collisions sa left at right dapat
    accurate sa tiles... top collisions sa house2 at house3 imbis na 2
    rows gawin mo ng 7 rows... progress bar... dapat nasa gitna ng bahay
    para kita tapos medyo liitan mo, 2 tiles lang ang laki".
    - **Root cause of the oversized left/right collision**
      (getMultiTileFootprintRect(), inventory.js): it derived the
      footprint by flooring/ceiling the art's CONTINUOUS edges to
      whatever whole tiles they touched at all, which over-counts by 1-2
      tiles whenever the width isn't a clean multiple of TILE — e.g.
      house2/house3 are 182px = 11.375 tiles wide, but touch-flooring/
      ceiling their edges spanned 13 discrete tile columns (confirmed by
      hand: leftEdge≈74.8, rightEdge≈86.2 around a sample anchor, giving
      floor..ceil-1 = 13 columns for an 11.375-wide shape). Fixed by
      rounding the width/height to the NEAREST whole tile count first
      (Math.round), then centering that many tiles as evenly as possible
      around the placement anchor, rather than expanding to catch every
      partially-touched column. Result: house1 9→8 tiles wide (height
      unchanged, already exact), house2/house3 13→11 tiles wide, 12→11
      rows tall — confirmed in headless Chromium. This is the shared
      function both the collision (getObjectFootprintBlockedTiles()) and
      the hold-preview highlight (camera.js) read from, so both got
      tighter together, automatically, no separate fix needed.
    - **house2/house3 `footprintExcludeBackRows` raised from 2 to 7**
      (house1 untouched, wasn't part of the request and its roof is much
      shorter) — with the new 11-row-tall rounded footprint, that leaves
      exactly the bottom 4 rows colliding, which lines up with where
      these two skins' actual solid walls/foundation sit (confirmed by
      sampling the PNGs' alpha row by row: the wide sloped roof occupies
      roughly the top 7 rows, walls + foundation the bottom 4) — the
      player can now walk under/behind the tall roof overhang instead of
      hitting a wall floating in what looks like open air.
    - **Progress bar repositioned + shrunk**
      (drawPendingConstructions(), camera.js): was a full-footprint-width
      bar floating above the whole building (could drift off-screen for
      a tall one, and read as disconnected from what it's building).
      Now a fixed ~2-tile-wide bar (`CONSTRUCTION_BAR_WORLD_WIDTH`)
      centered on the middle of the footprint rectangle — sits directly
      on the house's own art, per request.
    - Verified in headless Chromium via file://: house1/house2/house3
      footprint dimensions and blocked-row counts match the numbers
      above exactly, the hold-preview grid for house2 is visibly 11x11
      instead of 13x12, the progress bar renders centered on the ghost
      house at the smaller fixed size, and every earlier regression test
      (instant placement for stones/trees/ground tiles, overlap
      rejection, blocked-by-existing-object, house2/house3 not
      E-grabbable, save/load roundtrip for an in-progress build) still
      passes unchanged.

83. **House interiors: walking onto house2's/house3's front door now
    enters a separate interior room scene, instead of that tile just
    being part of the wall.** Per request: "san ko pwede palitan... may
    ginawa akong pang interior na room... interior.ase... try mo apply
    yun para makapasok sa loob ng house2 at house3".
    - The person's own Aseprite file (`assets/interior/asesprite/
      interior.ase`, 10 layers: floor/matt/wall/door/lower/objects/
      upper/ceiling/shadow/windows) had never been exported to a plain
      image, so nothing could load it — .ase is Aseprite's own binary
      format, not a browser-readable one. Read and composited by hand
      (parsed the chunk format directly — layer + cel chunks, zlib-
      decompressed the RGBA pixel data, alpha-composited every visible
      layer in order) into `assets/interior/asesprite/interior.png`
      (410x500), which is what actually gets loaded in-game
      (`assets.interiorHouse`).
    - New `js/interior.js`: `INTERIOR_ROOMS` (currently one entry,
      `"sharedHouse"` — the single room layout that exists in the file,
      a cozy bedroom/lounge connected through an archway to a larger
      dining hall; both house2 and house3 point at it for now, since
      there's only one design to draw from — see the itemDefs comment
      for how a second, different layout would be wired to just one of
      them once it exists). A room is its own small fixed-size
      coordinate space, unrelated to the outdoor MAP_W/MAP_H tile grid.
    - New itemDefs field `interior: { roomId, doorOffset }` on house2/
      house3: the ONE footprint tile at (placedCol+doorOffset.col,
      placedRow+doorOffset.row) — normally solid wall — is carved out of
      getObjectFootprintBlockedTiles()'s result as a walkable door.
      Stepping onto it (checkInteriorEntry(), called from the outdoor
      branch of updatePlayer() only) enters that room.
    - Entering saves exactly where the player was standing outside
      (`player.outsideReturn`) and switches `player.scene` to "inside";
      `updatePlayer()` (player.js) branches to a separate, much simpler
      `updatePlayerInsideInterior()` (js/interior.js) while indoors — a
      flat rectangle clamp to the room's own width/height, no run/
      stamina, no world-object interactions (E/F/T/R do nothing in
      there), and a check every frame for stepping onto the `exitZone`
      rectangle (the doormat drawn at the bottom of the art — found by
      scanning the exported PNG for its pixel bounds) that restores
      `outsideReturn` and flips back to "outside".
    - Rendering branches too: `camera.js`'s `render()` calls a new
      `renderInteriorScene()` instead of the normal world/camera pass
      while inside — the room image fit-to-screen (letterboxed,
      centered, no scrolling camera needed for something this small) with
      the player sprite drawn on top via the same `drawPlayer()` the
      outdoor path uses, plus a small "walk onto the doormat" hint. No
      Y-sorting against furniture yet (walking through a table is
      possible) — noted as a follow-up, not attempted here.
    - Guarded against the coordinate-space mix-up this invites: entering
      clears any `heldItem` (no placement grid indoors), `placeHeldItemAt()`
      now no-ops unless `scene === "outside"` (screenToTile() reads the
      OUTDOOR camX/camY, meaningless for the interior's fit-scale
      mapping), and `save.js` persists the OUTDOOR `outsideReturn`
      position (never the room-space x/y) whenever `scene === "inside"`
      at save time, plus always resets `scene`/`activeInteriorType`/
      `activeRoomId` to "outside"/null/null on load — so a reload while
      indoors comes back outside in the right spot rather than spawning
      near the map's top-left corner interpreting room coordinates as
      world ones.
    - Caught and fixed one real bug before shipping this: `player.
      activeInteriorType` (a house TYPE, e.g. "house2") was being used
      directly as the `INTERIOR_ROOMS` lookup key, which is keyed by
      ROOM id ("sharedHouse") instead — every real-game-loop frame after
      entering immediately failed that lookup and silently exited right
      back out. Fixed by tracking both: `activeInteriorType` (which
      house) and a separate `activeRoomId` (which room layout to
      render/collide against), only the latter used for the
      `INTERIOR_ROOMS` lookup. Caught via a headless-Chromium run that
      simulated real frames (not just calling functions directly), which
      is exactly the class of bug that only shows up once the real
      per-frame loop runs, not from a single direct function call.
    - Also fixed a second, related bug the same way: the movement clamp
      keeps the player's tracked CENTER at least `DRAW_SIZE/2` (24px)
      from any room edge, capping reachable Y at `height - 24` = 476 for
      this room — but the first `exitZone` was placed starting at
      Y 478 (matching the doormat's literal pixel position), which is
      past that cap and so was never actually reachable by walking.
      Moved the zone's start to Y 460 (and the spawn point safely above
      it, so entering doesn't immediately re-trigger exiting) — both
      confirmed reachable in a full simulated walk-in/walk-out pass.
    - Verified in headless Chromium via file://, simulating real
      per-frame updates (not shortcuts): walking onto house2's door tile
      enters the room in ~8 simulated frames, walking down from the
      spawn point back onto the exit zone leaves in ~11 frames and
      restores the exact outdoor position, house3's door works the same
      way, house1 (no `interior` field) is completely unaffected (still
      the same 48 blocked tiles as before), the interior image loads at
      its real 410x500 size, a save/applySaveData() roundtrip taken
      while indoors correctly restores outdoors, and every earlier
      regression test (instant placement, footprint math, overlap/
      existing-object rejection, E-grab exclusion, construction save/
      load) still passes unchanged.

84. **Interior camera switched to match the outdoor one exactly.** Per
    request ("yung sa camera ng interior dapat same lang sa outside na
    camera"). The first pass fit the whole 410x500 room on screen at
    once (letterboxed, shrunk to fit) — readable as an overview, but
    nothing like the outdoor game's zoomed-in, player-following camera.
    `renderInteriorScene()` (camera.js) now uses the exact same shape as
    the outdoor `render()`: `viewWorldW/H = view size / zoom`, camera
    clamped to `[0, room.width/height - viewWorldW/H]` (local
    `roomCamX/roomCamY`, not the outdoor `camX/camY` — re-entering the
    world next frame isn't affected by wherever the room camera ended
    up), room image drawn windowed through that rect exactly like the
    outdoor pass windows `worldCanvas`, player drawn via the same
    `drawPlayer()` at the same `zoom` scale outdoor uses. Confirmed in
    headless Chromium: same zoomed-in scale as outdoors at spawn, and
    camera correctly clamps/letterboxes at the room's edges (walked to
    the top-left corner) the same way the outdoor camera does at the
    map's edges — plus the full enter/exit simulation and every earlier
    regression test still pass unchanged.

85. **house2.png cropped to an exact 11-tile width.** Per request ("look
    the width tile of house2 is not perfect for 11 tiles fix it") — it
    was 182px (11.375 tiles), so even with the rounded-footprint math
    (entry 82) there was a real, if small, ~3px roof-eave overhang past
    the notional 11-tile collision box on each side. Checked the outer 3
    columns on each edge for real content before touching anything (48
    opaque px per column — the sloped roof eave, not just antialiasing
    fringe) and cropped exactly 3px off each side (182 -> 176 = 11.0
    tiles exactly, height untouched — only width was reported off).
    Side-by-side pixel comparison before/after shows no visible loss —
    windows, door, and walls are all well clear of the trimmed columns.
    Regenerated `js/objectAlphaMasks.js` (`tools/generate_alpha_masks.py`)
    afterward so the fade feature's alpha mask matches the new pixel
    dimensions. `footprintWidthTiles: 9` (entry 82's follow-up, a
    deliberately even-tighter override) is untouched by this — it still
    wins over the now-exact 11-tile natural size, since that override
    was about pulling collision in tighter than the art's own bounds,
    a separate concern from the art's own width being a clean multiple
    of 16. house3.png (182px wide, same situation) was left alone since
    only house2 was named — same fix applies the same way if wanted.
    Verified in headless Chromium: `assets.house2` now reports natural
    width 176, the UN-overridden footprint math now gives exactly 11
    with no rounding involved, the override still reports 9 when
    present, and every earlier regression + interior-scene test still
    passes unchanged.

86. **Entry 85's house2.png crop reverted — back to the original 182px
    art.** Per request ("wag mo crop pangit haha balik mo na lang sa
    dati"). Restored from `assets/particles/house/house2.png` — an
    untouched duplicate of the original that happened to still exist
    (see entry 80's note on `assets/particles/` being leftover duplicate
    art) — rather than reconstructing it, so this is the exact original
    file, not a re-approximation. Regenerated `js/objectAlphaMasks.js`
    again to match. The small rounding overhang entry 85 described is
    back too — a real but minor trade-off, and apparently the less bad
    one of the two. `footprintWidthTiles: 9` (entry 82) still applies on
    top either way, untouched by any of this.

87. **`footprintWidthTiles: 9` override removed from house2.** Per
    request ("ginawa ko ng 11tiles yung width ibalik mo na sa dati na
    kapag 11 is yung may collisions") — the person made their own art 11
    tiles wide, so entry 82's tightening override (9, narrower than the
    art's own rounded 11) is no longer wanted; the NATURAL rounded
    footprint (Math.round(icon.width / TILE), currently 11 either way —
    182px rounds to 11 same as an exact 176px would) is what should
    collide again. Confirmed in headless Chromium: `itemDefs.house2.
    footprintWidthTiles` is now `undefined` and the computed footprint
    is 11 tiles wide.

88. **`footprintWidthTiles: 11` added back to house2 — explicit this
    time, not left to auto-rounding.** Per request, after a screenshot
    showed the player still able to walk into part of the building
    ("napapasok pa rin yung tile e dagdagan mo ng footprintwidthtiles:
    11"). Entry 87 removed the override on the assumption the auto-
    rounded value (Math.round(icon.width / TILE)) already equals 11, so
    an explicit override was redundant — true for the 182px art in this
    copy, but the person is editing their OWN local copy of house2.png
    (per entry 87), and if that file's real pixel width doesn't round to
    exactly 11 (e.g. off by a few px from an inexact crop), the
    footprint silently ends up a tile narrower, leaving a walkable gap
    down one side. Setting `footprintWidthTiles: 11` explicitly pins the
    collision width regardless of the art's exact pixel size, removing
    that dependency entirely — the safer choice whenever the exact
    footprint matters more than letting it auto-derive. Confirmed in
    headless Chromium: footprint is 11 tiles wide, both edge columns
    collide, the interior door tile at dead-center is still open (entry
    83 — unaffected by this), and every other regression test still
    passes.

89. **Fade-to-black transition entering/leaving an interior; 5px edge
    margin excluded from the house fade so grazing the very left/right
    tip of the roof doesn't fade the whole building.** Per request:
    "5px na lang e sa left at right na collisions para di na mag opacity
    kapag nagpunta sa left at right tapos kapag pumasok sa loob may fade
    to black tapos pa fade in sa room".
    - `FADE_EDGE_INSET_PX = 5` (camera.js): `characterFeetBehindObject()`
      — the `fadeOnlyWhenBehind` check houses use — now ignores object
      pixels within 5px of the object mask's left/right edge when
      testing whether the feet are covered. The wide roof genuinely
      extends further sideways than the walls beneath it, so a pixel-
      accurate but marginal graze right at that outer tip was making the
      WHOLE house fade (ctx.globalAlpha applies to the entire drawImage
      call, not just the touched region) even though the character read
      as just walking past the side, not behind the building. Only
      affects `fadeOnlyWhenBehind` items (houses); trees/stones
      (`characterTouchesObjectPixels`, the general path) are untouched.
    - New shared fade-to-black transition (js/interior.js): `sceneFade`
      state machine — `beginSceneFade(onMidpoint)` starts a fade-out,
      runs `onMidpoint` (the actual `enterInterior()`/`exitInterior()`
      scene switch) once the screen is fully black, then fades back in.
      `checkInteriorEntry()` and the exit-zone check now go through this
      instead of switching instantly. `updateSceneFade()` (main.js's
      loop, before `updatePlayer()`) advances it every frame; `render()`
      (camera.js) draws the black overlay (`drawSceneFadeOverlay()`)
      last, over whichever scene just rendered, so the switch underneath
      is never visible mid-fade. `updatePlayer()` freezes entirely
      (movement AND the entry/exit triggers) for the whole ~0.7s
      sequence, so nothing can retrigger or drift mid-transition.
    - This timer is wall-clock (`Date.now()`) based, same as
      `pendingRespawns`/`pendingConstructions` elsewhere in this project
      — intentional (keeps advancing even if the tab loses focus), but
      worth remembering if testing by calling `updatePlayer()` in a tight
      synthetic loop rather than through the real per-frame loop: nothing
      advances the fade without real wall-clock time actually passing
      (`updateSceneFade()` has to run on real frames — a synchronous test
      loop calling `updatePlayer()` hundreds of times back-to-back
      finishes in a few milliseconds of real time, nowhere near
      `SCENE_FADE_MS`, so it just sits frozen at phase "out" the whole
      time). Not a bug — confirmed by testing both ways: a synthetic
      tight loop only advances real elapsed time near zero, while a real-
      time test (`page.wait_for_timeout`, i.e. how the actual browser
      runs it) completes the full enter -> fade -> spawn -> exit -> fade
      -> restore cycle correctly.
    - Verified in headless Chromium: fade alpha climbs 0->1 while frozen
      outside, scene switches to "inside" and position jumps to the
      room's spawn point at the exact midpoint (alpha back near 1 just
      after the switch), alpha falls back to 0 and movement resumes
      indoors; screenshots confirm a fully readable near-black frame
      mid-fade and a clean, overlay-free frame once settled. `house2`
      still fades correctly when genuinely behind its center. Every
      earlier regression test (placement, footprint math, E-grab
      exclusion, construction save/load, interior save/load) still
      passes.

## Known trade-offs / things worth knowing if you keep tweaking

- **Item action menu doesn't clamp to the screen edge.** `openItemActionMenu()`
  positions itself at `slotRect.right + 8px` — for inventory slots near the
  right edge of the screen, the menu could render partially off-screen.
  Not fixed yet since the inventory panel is centered and this only
  affects its rightmost column in practice, but worth knowing if the
  panel's position/size changes later.
- **Source art resolution is the real ceiling.** Every sprite frame is a
  small 64×64 image with the character occupying a modest chunk of it. At
  4–6x zoom you will always see individual source pixels rather than
  smooth curves. Nearest-neighbor scaling (current setting) reads as
  "crisp pixel art"; smoothing reads as "blurry" — there's no scaling
  trick that adds detail the source doesn't have.
- **`SPRITE_FEET_FRACTION` is a single global constant**, not measured
  per-sheet. It happens to be nearly identical across idle/walk/run/every
  facing (checked: 46–48px out of 64 across all sheets), which is why one
  constant works. If new sprite sheets are added later with a different
  frame layout, re-measure before assuming this constant still holds.
- **The shadow is rebuilt from scratch every single frame** (`buildSilhouette()`
  runs every draw call). Fine at this scale/frame-rate; if more shadowed
  entities are added later (enemies, NPCs), consider caching per
  frame-index instead of re-rendering the composite each time.
- **`COLS`/`ROWS`/tile loop in `world.js` runs once at startup** (roughly
  188×103 ≈ 19k `drawImage` calls to lay the random tiles) — a one-time
  cost at load, not per-frame, so it doesn't affect runtime performance.

90. **house2/house3 (now 192x192) — pixel-accurate side-wall collision;
    stale alpha masks regenerated.** Per request: after resizing both PNGs
    to 192x192 the character still walked into the left AND right walls
    (screenshots), and switching the footprint 11 -> 12 tiles didn't fix
    it. Three separate causes, all fixed:
    - **The walls don't sit on the tile grid.** Measured from both PNGs:
      walls span art x 6..186 (180px = 11.25 tiles; roof eaves overhang
      to 2..190). The art is centered on the placement tile's CENTER, so
      in world space the walls are [P*16-82, P*16+98) — 2px into the
      neighbouring column on each side. No whole-tile width can match
      that (11 = 2px short each side; 12 = 2px short left, 14px of
      invisible wall right). New `wallColliderPx: { left: 6, right: 186 }`
      on both itemDefs; `getHouseWallRect()` / `isBlockedByHouseWalls()`
      (inventory.js) test against those exact columns, placed with the
      same anchor math as drawGroundItemAt(). Rows are still whole tiles:
      12-row footprint, `footprintExcludeBackRows: 5` kept (top 5 rows
      walkable, bottom 7 block). Door tile stays walkable. The front edge
      deliberately stays the straight tile-row line (not the stepped
      wing bottoms) — the house is one sprite with one Y-sort line, so
      letting the player into the recess under a wing would draw them
      behind that wing. `footprintWidthTiles` back to 11 (only affects the
      placement preview / area-clear now — closest tile fit, symmetric).
    - **The player collided as a single feet point.** Half the body
      (~6 world px) always slid into a side wall before the point hit it.
      New `BODY_COLLISION_HALF_W = 6` (config.js — sprite body columns
      24..40 of 64, x0.75); `isBodyBlockedAt()` (player.js) tests a
      segment that wide for wallColliderPx houses. Everything else still
      goes through the unchanged `isTileBlocked()` (which now skips
      wallColliderPx items when called from isBodyBlockedAt()). The NPC
      uses isBodyBlockedAt() too.
    - **Stopping short.** A blocked step used to be refused whole, leaving
      up to a frame's movement (a few px running) of gap. `sweepBodyTo()`
      binary-searches to stop flush. Escape hatch: if the player is
      already overlapping (old save next to a now-wider wall), movement is
      free until they're out, so nobody gets stuck.
    - `js/objectAlphaMasks.js` still had house2/house3 at 182x182 (the old
      size) — the fade test was reading a mask offset from the 192px art.
      Regenerated with tools/generate_alpha_masks.py; only those two
      entries changed. Re-run it whenever a PNG is resized.
    - Trap checks (`canPlaceHouseFootprint()`, `updateConstructions()`)
      now go through `wouldObjectTrapPlayer()`, which uses the same
      precise test for wallColliderPx houses.
    - Verified with a Node harness running the real functions: walking in
      from either side at every depth, the body edge stops at exactly art
      x 6.0 / 186.0; from below it stops at the bottom tile line except in
      the door column (reaches the door tile); from behind it stops at
      art y 80.

91. **house2/house3's door is now solid too — entry triggers on contact,
    not on standing inside the tile.** Per request: "yung sa door ng
    bahay kahit lagyan na lang din ng collisions tapos makakapasok parin
    pumapasok kasi sa loob e" — the door tile used to be fully carved
    out of collision (a plain gap you could walk straight through); now
    it collides exactly like the rest of the front wall.
    - `isBlockedByHouseWalls()` (inventory.js): the door-tile exception
      removed — the whole front wall (door column included) is solid.
    - New `isTouchingHouseDoor()` (inventory.js): true once the player's
      feet are within `DOOR_TOUCH_SLACK_PX` (3px) of the wall's front
      line AND in the door's tile column — i.e. exactly the spot the now-
      solid door stops them at (from either side of that line —
      sweepBodyTo() lands them a hair on the free side of it, not
      inside).
    - `checkInteriorEntry()` (interior.js): for `wallColliderPx` houses,
      swapped the old "feet tile === door tile" check (impossible now
      that the tile is solid) for `isTouchingHouseDoor()` — entry fires
      the instant the player bumps into the door, like a real door
      instead of an open gap. Non-wallColliderPx houses (none exist yet,
      kept for forward-compat) still use the old exact-tile check.
    - Verified with the same Node harness as entry 90: walking straight
      into the door column stops flush and reports touching=true, at
      both normal and running speed; walking into any other wall column
      (even one tile off from the door) stops flush too but reports
      touching=false; the side-wall stop position from entry 90 is
      unaffected.

## Possible next steps (not done yet, just noted)

- An actual item/object to pick up in the world, wired to trigger the
  real `collectRequested = true` on proximity + F, instead of the current
  demo behavior of toggling on every F press regardless of context.
- Automatic tile selection (autotiling) — right now placing the 3×3 grass
  tileset pieces correctly is manual (you pick which corner/edge/inner
  piece to place); a nicer version would auto-pick the right piece based
  on which neighboring tiles already have grass.
- More item types beyond grass — just add an entry to `itemDefs` and an
  icon in `assets.js`, the system already supports any number of types.
- Removing/picking back up an already-placed ground item (currently
  ground items are place-only — there's no interaction to pick one back
  up once it's down).
- Collision / obstacles — done for trees and the two big stones (entry 28);
  extending it to other items later just means adding `collides: true` to
  their `itemDefs` entry, no other code changes needed.
- Depth/y-sorting — done in entry 30.
- NPCs or a second entity using the same sprite/animation/shadow/carry
  system.
- A proper idle-vs-moving transition blend (currently frame resets to 0
  immediately on animation-state change — fine for now, could ease later).
- Sound effects for footsteps and for the collect action, tied to the
  existing frame timing.
