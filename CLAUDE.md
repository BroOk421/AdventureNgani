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
(added later) js/interior.js (rooms, doors, locks), js/furniture.js
(sitting), js/npc.js (Maria), js/customers.js (tavern customers),
js/calendar.js, js/daynight.js, js/hud.js, js/weatherfx.js — see the
numbered entries below; index.html is the source of truth for load order.
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

### Sitting on furniture (benches, chairs, the couch)

- **`sittable` in itemDefs + js/furniture.js (new file).** Hovering a seat
  highlights it, left-clicking sits the player on it, and any WASD/arrow
  key stands them back up, landing them exactly where they were standing
  when they clicked (`player.sitPreX/Y`) — which IS "the front tile",
  since that's where they had to be to click it. Works indoors and out:
  `sittableLayer()` picks `objectLayer` outside or the current room's
  `decor` map inside.
- **Seats are per-tile, not per-item.** `sittable.seats` is a list of
  `{ col, row, facing }` offsets, so a 4-seat bench really has four
  separate spots. Hovering highlights only the one tile under the cursor
  (`drawSitHighlight()`, camera.js) — no tile-grid square is drawn, just
  the seat's own pixels tinted. A footprint tile that isn't a listed seat
  (benchVertical's 5th/top tile, its backrest post) doesn't respond at
  all.
- **The highlight has to be baked offscreen.** `source-atop` directly on
  the main canvas tints the whole rectangle, because the opaque world is
  already drawn underneath by then. `getSitHighlightArt()` pre-tints a
  copy of the icon instead, so only the furniture's real pixels light up.
- **The sat-on item is forced behind the player** (`sortY = -Infinity`,
  renderWorldObjectsSorted) — a bench sorts by its bottom row, so a
  player seated on an upper row would otherwise be drawn behind it.
- **Sit art:** `assets/sprites/Sit/sith.png` (front) and `sitv.png`
  (side, mirrored for left) — ordinary 384x64 six-frame character sheets,
  drawn through the exact same path as idle/walk, which is what keeps a
  seated character the same size as a standing one. The code adds no
  animation of its own; the breathing is in the sheet.
  - *Gotcha worth remembering:* a 64px frame is four 16px cells wide, so
    the frame's centre falls on a CELL BOUNDARY. Centring the character
    inside a cell puts it 8px off-centre (= 6 world px in game). Centre
    on the frame's middle line instead, or set the Aseprite grid to 32.

### Bench footprints and art alignment

- **`footprintHeightTiles: 1` on benchHorizontal** — its 64x32 art was
  deriving a 4x2 = 8-tile footprint, the upper row being backrest nothing
  stands on. A bench occupies one row of ground; the backrest hangs off
  the top like a tree canopy.
- **`artRoot: { x: -8 }` on benchHorizontal** — 64px is an EVEN four
  tiles, and art is centred on the placement tile's CENTRE, so it sat
  half a tile left of its own footprint, spilling into a fifth column.
  This slides it onto its four tiles. `computeFootprintOpacityGrid()` was
  taught about `artRoot` too, or collision would be sampled from where
  the art no longer is. Odd-width art (benchVertical) needs none of this.
- **`poseOffsetX`** (per seat) still exists for a seat whose art genuinely
  isn't tile-centred, but nothing uses it now — the code adds no shift, so
  where the character lands is decided purely by the sprite sheet.

### E-grab reaches multi-tile items

- `findFootprintCoveringTile()` searched only `fixedFootprint` items, so a
  bench answered on its anchor tile and nowhere else. It now does a second
  pass over `multiTileFootprint` items, using
  `getObjectFootprintBlockedTiles()` — the same list movement collides
  against — so "can I grab it here" matches "does it block me here".
  `fixedFootprint` keeps a first pass of its own so the Big Bed lookups
  (which take one hit and test its type) can't be shadowed.
- **Grab priority:** the tile the player is FACING is checked across every
  layer first, and only then the tile underfoot. The old order asked each
  layer "here, then front", so the floor you stood on always beat the
  bench you were nose-to-nose with. Houses stay un-grabbable, now keyed on
  `buildSeconds` rather than `multiTileFootprint` (which had swept up all
  the multi-tile furniture with them).

### Maria: light, name, pathfinding, nightly schedule

- **Same candle circle as the player.** `drawPlayerGlow()` was split into
  `drawCharacterGlow(px, py, size, worldX, worldY)`; both call it, so the
  colours, radius, night ramp and wall shadows are literally one function.
- **Name lives only in the shop popup** (`NPC_NAME` -> `#npc-shop-title-name`).
  No floating label over her head.
- **Real pathfinding** (`findNpcTilePath()`): A* over the tile grid with a
  binary min-heap, 4-way only (a diagonal hop can clip a solid corner).
  Takes an `isBlocked` callback + bounds, so the same search serves the
  outdoor map and the inside of a room. `buildNpcBlockedTiles()` walks the
  placed layers ONCE per plan rather than testing per tile. An unreachable
  goal returns a best-effort route to the closest tile reached.
- **Nightly schedule:** at `NPC_SLEEP_HOUR` (20:00) she walks to a door,
  goes in, crosses the room to a Big Bed and sleeps until `NPC_WAKE_HOUR`
  (06:00), then walks back out through the exit mat.
  - `findNpcHomeDoor()` accepts both door kinds the player can use — a
    building's baked-in door (`interior.doorOffset`) and a standalone
    Door (A)/(B)/(C) (`interior.doorSpanCols`). Her own house
    (`NPC_HOUSE_TYPE`, now `"tavern"`) wins if placed.
  - Indoors she respects `isInteriorBodyBlockedAt()`/`sweepInteriorBodyTo()`
    — the player's own collision — and uses the room's `indoorWarp` door
    when the bed or the exit is walled off from her.
  - *Gotcha:* a Big Bed is SOLID indoors, so she walks to a free tile
    BESIDE it (`npcBedApproachTile()`) and lies down from there. Walking
    at the bed itself just wedged her against its edge forever.
  - `inPathFailed` throttles the retry, or a walled-off bed would re-run a
    room-wide A* 60 times a second.
- Her sleep uses the player's `bedBigSleep` sheet, so the figure in the
  bed isn't her own sprite. There's no NPC sleep art in the project.

### One interior per building

- `INTERIOR_ROOMS` used to be one entry per LAYOUT, shared by every copy
  of a building — furnish one tavern and every tavern had the furniture.
  It's now split: `INTERIOR_ROOM_BLUEPRINTS` holds the fixed layout, and
  `INTERIOR_ROOMS` is a live registry of one room per placed building,
  keyed `blueprint@col,row` (`interiorRoomId()`).
- An instance copies the blueprint's fixed parts by reference and gets
  FRESH `collisions`/`decor` Maps — the only per-room state there is, and
  exactly what save.js already persisted per room id.
- `getOrCreateInteriorRoom()` rebuilds a room from its id alone, which is
  what the `blueprint@col,row` format is for: on load no instance exists
  yet, so without it every house's contents would be dropped.

### Buildings renamed, third interior added

- `house1 -> house`, `house2 -> tavern`, `house3 -> abandonHouse` (ids,
  asset keys and alpha-mask keys all move together — the mask table is
  keyed by item id). PNG filenames on disk were NOT renamed.
- `smallInterior -> house_room`; the shared layout split into
  `tavern_room` (pixel-identical to the old interior.png, so all its
  numbers carried over) and a new `abandon_room` (416x304, measured off
  the PNG: floor x 24-391 / y 89-293, doorway x 177-206).
- **Save migration** in save.js: `RENAMED_ITEM_TYPES` + `migrateItemType()`
  applied to layers, respawn/construction timers, inventory counts, hotbar
  slots and the grabbed item; `migrateRoomBlueprintId()` for room ids. The
  awkward case is old `sharedHouse` rooms — one layout used by two
  buildings — resolved by looking at what actually stands on that tile.

### Six layers

- Was four (`terrainLayer`/`groundLayer`/`decorLayer`/`objectLayer`), now:
  1 `dirtLayer`, 2 `groundLayer` (grass/water/port), 3 `objectLayer`,
  4 `upperLayer` (things on top of furniture), 5 `wallLayer`,
  6 `ceilingLayer`. `ALL_LAYERS` / `ALL_LAYERS_TOP_FIRST` are the single
  place a sweep over "every placed item" is defined.
- **`groundOverlayLayer`** is layer 2 that does NOT replace the ground
  tile: mushrooms, flowers, fallen leaves and the lit-window glow lie ON
  the floor rather than being the floor, so a mushroom and the grass under
  it both exist on one tile.
- **`wildgrassLayer`** is layer 3 kept in its own map, because wild grass
  isn't just a z-order — it's walkable, it bends as you walk through it,
  and the tile the player stands on is drawn split around them. It
  Y-sorts with `objectLayer`, so the two read as one layer.
- **`ITEM_LAYER_RULES`** is one explicit ordered table (first match wins)
  rather than flags, because the grouping is a design decision: a floor
  tileset and a mushroom are both `flat`, but one IS the ground.
- **Save format is now layer-agnostic** — a single `placedItems` list, with
  the layer re-derived from the type on load. That's also why 4-layer
  saves still load: their entries just re-sort into today's layers.

### Layer 3 can't be placed on a wall

- Rooms describe their solid parts two ways now: `walls` (world-space
  rects — house_room, abandon_room) and `tileMap` (a per-tile `#`/`.`
  grid — the tavern, whose two halves and doorway don't reduce to a few
  rectangles). `isInteriorWallTile()` checks both.
- `isInteriorPlacementBlocked()` refuses layer-3-and-below on a wall tile
  and lets layers 4/5/6 through; the indoor placement grid reds out the
  same tiles, so the preview and the click can't disagree.
- The tavern's `tileMap` deliberately leaves column 19 open from row 11 to
  17 — that's the doorway `indoorWarp` leads through, and walling it off
  would make the upper half unreachable.

#### Still open on the layer work
- Asset folders are NOT reorganised yet (`assets/inner/...`,
  `assets/outer/...` was requested).
- Layer 4 has no height rule yet (floor + 3 tiles), and barrel/box don't
  auto-pick a layer based on whether furniture is under them.
- `base1`-`base5` art doesn't exist yet; add them to `ITEM_LAYER_RULES`
  layer 4 when it does.
- Tavern wall tiles block PLACEMENT only — the player can still walk
  through them.

### Cache busting

- Every `<script>`/`<link>` in index.html carries `?v=YYYYMMDDx`. Browsers
  hold onto these files hard enough that an update can look like nothing
  changed at all. Bump the string whenever a file changes.

### Crates and mushrooms overlap both ways (`depthBand`)

Per request ("yung mga crate box dapat half crate overlap to character
30% up and 30% down character overlap box ganun din sa mushrooms"). The
crates used to live on layer 4 (always drawn over the player), the Water
Crates on the ground layer and the mushrooms on the overlay layer (always
under), all blocking a whole tile. Now every crate (the seven vegetable
crates, Crate Closed/Open, both Water Crates, the indoor Wooden Crate) and
both mushrooms carry `depthBand: CRATE_DEPTH_BAND` (`{ top: 0.3, bottom:
0.3 }`, config.js — later lowered to 0.25 / 0.25 per request, "medyo
bawasan mo lang 25% up and down", so the solid middle is now 50%):

- Collision is only the middle 40% of the art's visible height
  (getDepthBandRect(), inventory.js — measured off the opaque pixels, so
  empty padding doesn't count), tested pixel-accurately in
  isBodyBlockedAt() (player.js) and isInteriorBodyBlockedAt()
  (interior.js). Placement and the NPC path planner still treat them as
  tiles.
- The Y-sort key is that band's centre line (itemSortY()), so from behind
  the item covers the character's feet, from the front the character
  covers the item. They're pulled out of drawFlatGroundItems() /
  drawGroundOverlay() / drawUpperLayer() and into
  renderWorldObjectsSorted() (and the indoor sort), and the night relight
  cuts them out like any other occluder. Their layer (and so save data)
  is unchanged.
- Mushroom (B) lost `alwaysBehindPlayer`. The mushrooms briefly got
  `collides` too, then it was removed again per request — they're
  walk-through, and their depthBand only sets where they Y-sort. The Wood Crate (wood items) is flat decor and was left
  alone.

### Waiter job (js/waiter.js)

Per request: apply to Maria as her waiter and serve the tavern yourself.
- Maria's talk menu gains "I want to apply as a waiter." -> a contract
  panel (`#waiter-contract-overlay`: duties, Mon-Fri shift, 10 gold/hour,
  max per day, tips, payday) with Confirm / Cancel. Once hired the option
  becomes "About my waiter job..." (hours today, quit).
- Stove (A) (`cookerStove1`) = Beer, Stove (B) (`cookerStove2`) = a small
  menu, Salad or Grilled Meat (`#stove-menu`). Click within 2 tiles, in
  the tavern, during her working hours. Clicking a stove while carrying
  puts the order back. The order is `player.carryOrder` (not saved) and is
  dropped if you leave the tavern.
- Carrying: `Carry_Order_Down` facing down with the dish in the hands;
  only that direction exists, so up/side use the normal Carry_* sheets
  with the dish above the head (carryOrderSheet()/drawCarriedOrder()).
- Customers (js/customers.js): on reaching their seat, if the player is
  on duty (hired + in the tavern + shift hours) they go to `waitFood`
  (seated, order bubble bobbing overhead, 60 s patience, blinks the last
  10 s) instead of straight to `eating`. Click them with the right dish ->
  serveCustomer(). Off duty, Maria serves as before. Served customers
  leave `gold_coins.png` on the table (tip: beer 3 / salad 5 / meat 10);
  click to collect. `tableCoins` isn't saved.
- Pay: hours spent in the tavern on shift, counted each frame from the
  game clock (clock jumps ignored). Paid when Maria goes to bed
  (`bedHour`, 18:00); an unpaid shift from an earlier day is paid on the
  next day change. `waiterJob` is saved.
- The click handler runs in the CAPTURE phase and stops the event, so
  clicking a seated customer never also sits you on their chair.
- Gold moved from the top-left HUD to `#gold-slot` beside the hotbar
  (both inside the new `#bottom-bar`), with the gold icon.
  `assets/items/goild_coins.png` renamed to `gold_coins.png`.

Two older bugs fixed along the way:
- whenAssetsReady() (assets.js): on a cached reload every image could
  finish before main.js registered its callback, so the game never
  started. It now starts immediately if everything's already loaded.
- saveGame() (save.js): the 2 s autosave began before loadGame() had read
  the save, so a slow load overwrote the real save with defaults. Saving
  is now blocked until loadGame() runs.

### Bartender table re-slice + the Tray

- `bartender-table.png` was resized by the user (48x32, art now 21px
  tall). `bartender-table_left/center/right.png` were re-cut from it
  (x 0-16 / 16-32 / 32-48) so the three parts match. They carry
  `tableSurfaceY: 19` for things placed on top.
- Indoors, a layer-4 item placed on a table tile (click-place or E) now
  goes into `room.tableTop` (js/interior.js interiorTableAt() /
  canPlaceOnTableTop()), so it can share the table's tile. Saved as
  `interiorTableTop`. Drawn centred on the table surface
  (tableTopCentreY(), drawTableTopItem() in camera.js). E takes the
  top item off before the table.
- The Tray: `tableFurniture1` (id kept for saves), renamed from
  "Tabletop Clutter 1" to "Tray", now layer 4, `isTray`.
  `table_furniture.png` renamed to `tray.png` (the empty tray).
  Pictures by contents (js/waiter.js trayImageFor()): one food x1 ->
  `solo/`, x2/x3 -> `drinks|salads|grilleds/*-2|3.png`, two foods ->
  `combo/no<missing>.png`, all three -> `combo/drink-salad-grilled.png`.
  `orderlist/orderlist.png` is the same picture as `nogrilled-meat.png`
  and isn't used.
- Flow: click the Tray holding a stove order (or a beer/salad/grilled
  meat held from the inventory) to put it on, max 3 per food. Click the
  Tray with empty hands to carry it (Carry_Order pose). Click a waiting
  customer or their chair to serve from it. Stoves clicked while carrying
  it add straight to it. Empty -> it goes back to its spot by itself;
  click its spot to put it back early; walking out of the tavern also
  returns it. Hold Alt for a card per tray (and the carried one) with
  counts. `trayContents` is saved (`waiterTrays`); `player.carryTray`
  isn't.
- Gold moved again: from beside the hotbar into the inventory panel, a
  full-width bar under the grid (`#inventory-gold`).

### Clearing tables, the bin crate, paying Maria

- New item `crateOpenInterior` "Crate (Open, Indoor)" (added LAST in
  itemDefs so no slot/hotbar index moves), its own copy of the art at
  `assets/interior/crate_open.png`, `isTrash`. Click it while carrying
  the Tray (within 1 tile) to tip everything off; the Tray then goes back
  to its spot. Clicking it with a single stove order throws that away.
- No more gold on tables (`tableCoins`/`WAITER_TIPS` removed). Customers
  pay Maria at the counter when their order is taken (a coin rises over
  her head, `showMariaPaid()`); the player's money is still the salary.
- Customers in line don't start ordering, and an order in progress
  pauses, until Maria is at her work spot (`isMariaAtCounter()`:
  `npc.working` in the tavern).
- A customer the player served leaves an empty plate (salad/meat) or
  mug (beer) on the table — the last frame of its eating strip
  (`tableLeftovers`, saved as `waiterLeftovers`). That seat isn't
  offered to new customers until it's cleared. Carry the Tray (an empty
  Tray can be picked up now) and click the dish to put it on — up to 5
  mugs and 5 plates. A Tray holds food OR dishes, not both. Pictures:
  `orderlist/empty/empty-mug|empty-plate|empty-mug-and-plate.png`,
  `-max` once both are on and there are 5+.
- Reach: 1 tile for the bin, picking up / filling the Tray, and taking
  food from a stove (`WAITER_NEAR_TILES`); 2 for customers and dishes.

### No layer 1/2 shadows, fatter rain, bush/tree fx, layer-2 replace

- Light shadows (collectLightOccluders(), camera.js) skip dirtLayer and
  groundLayer — water/port tiles no longer throw one. Water Crates
  (`depthBand`, layer 2 by name) still do.
- Rain: `RAIN_DROP_WIDTH` 2 (was 1). Each drop is a faint 1px tail, a
  2px body and a brighter 2px head (drawRain(), weatherfx.js).
- js/plantfx.js: bushes (`bushBig/Medium/Small/XS/Flower*`) sway (skew
  around the base, springing back) and drop a few leaf flecks when the
  player walks through; trees (resource `breakAnim: "slice"`) shake 1
  world px on each chop (resolveHarvestHit()). Applied by
  drawObjectLayerItem(), which now wraps drawObjectLayerItemRaw().
- Layer 2: placing a different layer-2 item on a tile that has one
  replaces it (canReplaceGroundItem(), inventory.js — outdoors, the
  preview highlight, and indoor floor pieces). Same item, or a
  `depthBand` object either way, still blocks.

### Tray overlap, one-click table clearing, performance pay

- Things on tables (room.tableTop) are depth-sorted just after their
  table instead of always on top, so a character in front of the
  counter overlaps the Tray.
- Clicking an empty plate/mug without a tray picks up the tavern's free
  tray (one with no food) with the dish already on it.
- The bin: the indoor open crate, and also the outdoor `vegCrateOpen`
  if that's what's in the tavern. Clicking it empty-handed says to bring
  the tray.
- Pay is no longer auto-added at bedtime. After work (workEndHour) the
  day is turned into `waiterJob.payslip`; Maria walks over to the player
  (waiterMariaSeeksPlayer(), hooked into her after-work wander and
  bedtime in js/npc.js) and opens `#waiter-pay-overlay`: a message, hours
  x rate, orders served, walk-outs, performance % and tier, bonus or
  deduction, total, and a Claim button. Performance starts at 70, +5 per
  served order, -15 per customer who gives up waiting; >=90 +20%,
  70-89 full, 50-69 -10%, <50 -25% (WAITER_PERF_* in js/waiter.js). An
  unclaimed slip is saved and adds up; "I'm here for my pay." in her talk
  menu opens it too. Quitting makes the slip right away.

### Rain as one thick streak; a separate dish tray

- Rain: each drop is one solid straight rectangle, `RAIN_DROP_WIDTH` 3,
  10-15 world px long (the tail/body/head version was disliked).
- Clearing dishes no longer takes the counter's Tray: the first click on
  an empty plate/mug gives the player a separate dish tray
  (`DISH_TRAY_KEY` "dishes", contents in trayContents like any tray).
  Binning it in the open crate makes it disappear; the real Tray never
  leaves the counter. Walking out with it drops the dishes.

### Rain, modelled on the "CSS Rain Effect" pen

The pixel-style rain (and the RainOnFloor.png splash) is gone. Rain is a
screen-space overlay copied in spirit from codepen.io/arickle/pen/XKjMZY,
without its dark background: thin (1 CSS px) stems, 72 CSS px long,
fading from transparent to white (a pre-rendered gradient sprite), falling
~2.2 screen heights/sec with per-drop speed; a half-opacity back row; and
where each drop lands, a dotted half-ellipse "splat" that pops open and
fades in 0.12 s. Tunables: RAIN_* in js/config.js.

### Tree shadows at night near the light

collectLightOccluders() drops an occluder when the light is "inside" it
(so standing behind something doesn't black out your own light). That
test used the sprite's whole picture box — for trees (bare or leafy) the
box is mostly empty space, so being anywhere near a tree removed its
night shadow. It now checks the actual pixel under the light
(iconOpaqueNear(), alpha cached per image; falls back to the box if the
pixels can't be read on a file:// page).

### Farm animals (js/animals.js)

Per request ("animate mo na lagay mo na sa map random map muna gawa ka
ng folder niyan like animals"): chickens, pigs, cows and three kinds of
sheep wander the outdoor map.

- Art: `assets/animals/<id>/idle/Idle_<Dir>.png` and `walk/Walk_<Dir>.png`
  (Dir = Down/Up/Left/Right), each ONE horizontal strip of 4 frames. Ids:
  chicken, pig, cow, sheep_white, sheep_blackface, sheep_cream. Frame size
  differs per animal and is read from the image (width / 4, full height);
  feet sit 1px above each frame's bottom edge. Loaded in js/assets.js.
- Groups (`ANIMAL_GROUPS`) spawn at random free spots 8-30 tiles from the
  player on load and wander within `wander` tiles of their group's spot.
  Not saved, re-rolled each load (same as the citizens).
- Pathing/avoidance reuses the citizens' tools: findNpcTilePath() over
  customerOutdoorBlocked(); people and other animals count as blocked
  when planning; wait / re-plan / give up when someone is in front.
- Size per type via `scale` in `ANIMAL_TYPES` (world px per art px;
  characters are 0.75). Speeds, idle times, fps also live there.
- Drawing: feet Y-sort in renderWorldObjectsSorted(), own sun-driven
  silhouette shadow (drawAnimalShadow), cut-outs for the night relight
  (animalRelightOccluders in relightOccluders()). At night they darken
  like the scenery and mostly stand still.
- Lit at night (per request "kapag tumama yung circle light sa mga animals
  is mag normal yung kulay... hindi agad agad... langyan mo ng shadow"):
  each animal's `lit` (0..1) eases (ANIMAL_LIGHT_EASE) toward how deep it
  stands in any light — the player's/Maria's/citizens' candles and lamp
  posts (animalLightSources()) — and animalRelightList() paints its true
  colours back at night * lit through drawMaskedRelight(). In a light
  they're occluders too: collectLightOccluders(..., { withAnimals: true })
  from drawCharacterGlow() and getShadowedPostGlow(), so the light throws
  their shadow away from the source. Their frame canvases carry a
  `lightSig` so the lamps' shadow cache notices when they move.

### Mountain plateau casts no night shadow

Per request: the top / inner / center / bottom mountain grass tiles (every
Mountain tile without "wall" in its name) are flagged `noLightShadow`
(js/inventory.js) and skipped by collectLightOccluders(). Some of them
collide (MOUNTAIN_SOLID_TILES, the plateau rim), which is why they used to
throw shadows from candles and lamps. Walls still do.

### Birds (js/birds.js)

Per request ("randomly lumilipad sa map ... minsan isa minsan dalawa minsan
tatlo pero sa umaga lang sila lumilipad kapag sunny lang"): flocks of 1-3
birds (maya, white dove, blue bird) cross the view left->right or
right->left in a loose V, flapping with the odd glide.

- Art: `assets/animals/bird_<kind>/fly/Fly_Right.png` + `Fly_Left.png`,
  4-frame wing-flap strips, side view, no feet. Loaded in js/assets.js.
- Only spawn between BIRD_START_HOUR and BIRD_END_HOUR (06:30-17:30) while
  getCurrentWeather().name is "Sunny", outdoors. A flock already flying
  when that stops finishes its crossing. Spawned just off-screen, removed
  once past the far side. At most BIRD_MAX_FLOCKS at once.
- Drawn above every object (drawBirds(), before the clouds in render());
  their shadow is drawn on the ground before renderWorldObjectsSorted()
  (drawBirdShadows()), offset down by each bird's altitude.
- Pure ambience: no collision, not saved.
- Made smaller per request: BIRD_SCALE 0.55 -> 0.38.

### Cows and sheep graze

Per request (cows/sheep "kumakain", no grass drawn; the pig and chicken
versions were rejected): `assets/animals/{cow,sheep_*}/eat/Eat_<Dir>.png`,
4 frames, head lowered and bobbing as they chew. When a grazer stops
walking in the daytime, ANIMAL_EAT_CHANCE decides if that stop is spent
eating (ANIMAL_EAT_TIME seconds, `a.eating`, anim "eat") instead of
standing. Types opt in with `eats: true` in ANIMAL_TYPES. Frame sizes match
their walk/idle strips exactly.

### Bird sizes

Per request, each flock gets a random scale between the first (0.55) and
the smaller (0.38) size (BIRD_SCALE_RANGE), each bird +/- BIRD_SCALE_JITTER.

### Breathing side sit + citizens sitting

- assets/sprites/Sit/sitv.png (player's side sit) had 6 identical frames;
  it now breathes exactly like sith.png does: in frames 3-4 the head and
  torso (rows 0-33) sink 1px, the legs stay put. Customers use the same
  sheet, so they breathe too.
- Per request (the other NPCs sit in that style, "wag mo baguhin yung
  istura nila"): assets/npc/Citizen_{A..E}/sit/Sit.png + Sit_Left.png,
  built from sitv.png's pose with each citizen's own head (idle rows 0-30,
  moved 5px right / 5px up onto the sit pose's head spot) and the base
  body's skin recoloured to their shirt / trousers / shoes (sampled from
  their idle frame). Same breathing. Side pose only — they have no front art.
- js/citizens.js: in daytime a stroll becomes "go sit" with
  CITIZEN_SIT_CHANCE — a free left/right-facing outdoor seat within
  CITIZEN_SEAT_SEARCH_TILES of home (citizenSideSeats(), not taken by the
  player or another citizen), walked to as an errand (allowed onto the
  solid seat tile), then state "sit" for CITIZEN_SIT_TIME seconds, with
  the seat's poseOffsetX/Y. They get up at the end, at night, or if the
  seat is removed, onto a free tile next to it.
- camera.js pulls a bench behind whoever sits on it (citizenSittingOn(),
  topmost sitter), like it does for the player; furniture.js refuses to
  sit the player on a seat a citizen is on (citizenOnSeatTile()).
- Citizen_A (Maria) has a sit sheet too but no sitting behaviour yet.

### Eating while seated (tavern customers)

Per request (eating animation; "spoon na lang ... mug ... grilled meat nasa
folder"): assets/sprites/Sit_Eat/Eat_{Front,Side}_{Meat,Spoon,Mug}.png,
6 frames each on the sit pose — the hand comes up to the mouth and back,
with a chew (head/torso dip 1px) in frames 4 and 6. Meat is the Grilled
Meat from assets/interior/foods/grilled_meat_icon.png taken off its plate
and shrunk to hand size; the spoon and mug are small drawn props. Side
sheets face right (flipped in code for left). drawCustomer() swaps them in
while `state === "eating"`, picked by the order (CUSTOMER_EAT_HELD:
meatItem -> Meat, foodSalad -> Spoon, foodBeer -> Mug).
Refined per request: the spoon is tilted toward the top-right with its bowl
at the mouth; each prop is placed by its grip point (held.py's GRIP — bone
end, spoon handle end, mug handle) and the at-mouth hand spot is per prop,
so in the side views the meat tip / spoon bowl / mug rim meet the front of
the face. While a customer eats the Grilled Meat the plate on the table
shows its empty frame, since the meat is in their hand.

### NPC-look tavern customers

Per request ("palitan mo yung ibang customer ng npc tapos apply mo rin yung
pag eating"): every other customer (customerLookFor(): odd ids) looks like
Citizen B, C, D or E instead of the player's placeholder look. Those looks
only have side art, so customerSprites() marks them `sideOnly`: walking
up/down keeps their last side (`c.side`), the right-facing sheets are
flipped in code for left, and freeSeatFor(room, who) only gives them seats
facing left or right. Their eating sheets are
assets/npc/Citizen_X/sit/Eat_{Meat,Spoon,Mug}.png — their own sit pose with
the same hand-to-mouth motion, the arm in their sleeve colour and the hand
in their own skin tone (customerEatSheets(orderType, look)).

### Eating props placed on the mouth; skirts fold when sitting

- Every eating prop is now placed by TWO points: its grip (in the hand)
  and its mouth point (spoon bowl, mug rim, meat end), and the hand is put
  wherever makes the mouth point land exactly on the mouth: (31,28) on
  sith.png, (41,25) — the front edge of the face under the eye — on
  sitv.png. Side views use mirrored props (spoon bowl and meat end toward
  the face) and a mug tipped so its rim meets the lips.
- Citizen E (skirt): her sit pose trims the 3px of skirt that stuck out
  behind the hips (rows 34-37), as if folded under her (SKIRTS in the
  generator). Her eat sheets are rebuilt from that.

### Player outfit, new townsfolk F/G, front & back views for every NPC

Per request (picked sample #2 for the player; #1 and #3 become NPCs with
different hair; every NPC gets front and back, same look):
- Generator (outside the repo): the bald base sheets are "dressed" by
  rows relative to the head top (first row with a run of skin) and the
  collar line under the chin: shirt N+1..N+6 (hands stay skin), pants
  below, boots from N+13, plus a hair style per view (short, ponytail,
  spiky, long, bob, bun, high bun) and an optional skirt + apron.
- Player: EVERY sheet in assets/sprites/ is now outfit #2 (black hair, red
  tee, grey pants, black boots), Sit_Eat included.
- Citizen_F (white tee, jeans, auburn ponytail) and Citizen_G (green tee,
  brown pants, spiky brown hair): full sets — idle/walk side + _Left +
  _Down + _Up, sit side/left/front, eat side and front for meat/spoon/mug.
- Citizen_A..E keep their original side art; added idle/Idle_Down,
  Idle_Up, walk/Walk_Down, Walk_Up, sit/Sit_Front and
  sit/Eat_Front_{Meat,Spoon,Mug} matched to their colours and hair.
- citizens.js: CITIZEN_IDS now B..G; they face down/up/left/right and can
  sit on seats facing down too (front sit).
- customers.js: every customer is a townsperson (B..G, customerLookFor());
  all looks have full art, so no seat restriction any more.
- Maria: npc.view (trackNpcView(), js/npc.js, called from main.js) picks
  npcIdleDown/Up / npcWalkDown/Up when she walks toward/away from the camera.

### Old NPCs back to side-only; F..K are the 4-direction townsfolk; lamps behind trees

- Per request the generated front/back of Citizen_A..E was removed (it
  didn't match their original hair). They are side-only again, as before:
  citizens B..E face left/right only, take only left/right seats, and as
  customers are `sideOnly` (customerSprites() checks for WalkDown art).
  Maria's front/back (npc.view / trackNpcView) was removed too.
- New townsfolk with full art (assets/npc/Citizen_F..K): F (ponytail, white
  tee, jeans), G (spiky, green tee), H (long blonde, blue dress), I (black
  bob, yellow tee), J (brown bun, purple top), K (spiky ginger, brown tee).
  H (long blonde, blue dress) was removed afterwards, per request.
  idle/walk side + _Left + _Down + _Up, sit side/left/front, eat side and
  front (meat/spoon/mug). CITIZENS_WITH_FRONT_BACK (assets.js) loads their
  front/back sheets; citizenHasFrontBack() (citizens.js) lets them face
  four ways and sit on seats facing down. All of B..K wander and come in
  as tavern customers (CUSTOMER_NPC_LOOKS).
- Lamp posts at night: a lamp BEHIND something no longer lights it up.
  drawPostLightGlows() passes relightOccluders(lampSortY) as `cutouts` to
  addSceneLight(), which paints their silhouettes black into that light
  before it's merged (black = no light on the additive buffer). The lit
  lantern relight (drawLampNightRelight()) goes through drawMaskedRelight()
  so a tree in front covers it. A lamp in front of a tree still lights it.

### Performance pass

Per request ("medyo naglalag"). Measured per function in a headless
browser: night frames were ~17 ms, 12 ms of it drawCharacterGlow (every
candle — player, Maria, each citizen — projecting shadows + a blur at full
screen resolution); day frames ~7 ms, mostly drawSunRays. Changes:
- drawCharacterGlow builds the light and its shadow mask at
  SCENE_LIGHT_SCALE (half) resolution — the shared light buffer is half
  res anyway, so it looks the same. ~2 ms -> ~0.35 ms per candle.
- drawShadow() / drawAnimalShadow(): no more per-character canvas blur
  filter on the main canvas each frame; cachedSoftSilhouette() keeps a
  pre-tinted, pre-blurred silhouette per sheet frame (2x res).
- drawSunRays: rebuilt every SUNRAY_REBUILD_EVERY (2) frames; in between
  the last buffer is redrawn shifted by the camera's movement.
- Lamp shadow cache signature rounds animal positions to 2 world px;
  animals read the lamp list from a once-a-second cache.
Result in the same test: night ~3.8 ms/frame, day ~4.1 ms/frame.

Second pass, measured on the user's real save (8,378 placed items):
night ~63 -> ~28 ms/frame, day ~16.5 -> ~7.8 ms/frame (headless, software
rendering — a real GPU browser is faster).
- forEachTileInView(): the flat layers (dirt, ground, ground overlay,
  upper, wall, ceiling) only look up the tiles around the view once the
  layer is bigger than the view; drawGroundItemAt() itself never culled, so
  every tile on the map used to be drawn every frame.
- collectLightOccluders(): looks up the tiles in reach of the light rather
  than walking every layer entry for every candle/lamp.
- Lamp shadow caches no longer include animals (an idling animal in a
  pool forced a ~9 ms rebuild every frame); animals still cast shadows in
  candles and are cut out of lamp light when in front of it.
- Candles: other people's use NPC_LIGHT_MAX_OCCLUDERS / NPC_LIGHT_SHADOW_
  MAX_STEPS; shadows are projected only to just past the glow edge (1.1x
  radius, was 2x); a candle whose position and surroundings didn't change
  is reused from candleCache.
- addSceneLight(): lights with no cutouts are drawn straight into the
  (opaque black, additive) buffer — same result, no scratch canvas.
- drawMaskedRelight(): scratch area 1.5 x 2 sprite sizes (was 2 x 2.5).
- drawMinimap(): redrawn every MINIMAP_EVERY (3) frames.

### Map head icons; the mug while drinking

- Minimap + world map (js/hud.js): instead of dots, each townsperson /
  outdoor customer / Maria shows their own HEAD (citizenMapIcon(),
  mariaMapIcon() — rows 0-30 of frame 0, front view if they have one, else
  side) and each animal its head (animalMapIcon(), ANIMAL_HEAD_ROWS of its
  idle-down frame), cut once and cached (cropMapIcon()). The player is an
  arrow pointing along player.facing (drawPlayerArrow()). If the art can't
  be read (tainted canvas on file://) a plain dot is drawn instead.
- Beer: while a customer drinks, the mug is NOT drawn on the table (it's in
  their hand). When they leave, the empty mug appears as a leftover — for
  Maria-served customers too, and those clear themselves after
  LEFTOVER_AUTO_CLEAR_MS (js/waiter.js), since nobody else picks them up.

### Axe (Slice) frames fixed

Per request (the axe swing looked different from the pickaxe): in Slice's
leaning frames the generator found the wrong collar row, so the lower face
got the shirt colour and the hair landed off the head. The player sheets
are now dressed from the EYES (eye_anchor(): collar = lowest green iris
row + 3, head top = collar - 13, head columns grown out from the eye), with
the old head/collar search only where no eye shows (back views). All
(Follow-up: frames with the eyes SHUT mid-swing fell back to that search
and measured the head's width across the white swish too, so the fringe
and top tuft landed beside the head and its top looked bald. With no eye,
the head's columns are now grown out from the middle of its top row of
skin instead.)
player sheets were rebuilt; only the leaning action frames changed.

### Outlined hair on the old townsfolk; soldiers

- Citizen_B..E: their hair had no black outline (unlike A and the newer
  ones). Every sheet of theirs (idle, walk, sit, eat — both directions) now
  has a 1px black outline on the transparent pixels touching their hair
  colours (sampled from the top of their idle frame).
- Soldiers (assets/npc/Citizen_L..O), full 4-direction sets like F..K:
  L steel helmet + red tabard, M steel helmet with blue plume + blue
  tabard, N steel helmet + green tabard, O gold helmet with red plume +
  navy tabard (captain). Generator: hairstyle "helmet" (cap, rim, cheek
  and nose guards, neck guard from the side, optional plume) and `armor`
  (metal shoulder pads + belt). They wander, sit and come to the tavern
  like the other townsfolk.
- Soldiers redone after feedback ("ang pangit") with a proper kit
  (soldier.py in the generator): helmet following the head with the face
  open, brow band + rivets, nose/cheek guards, centre ridge, optional plume;
  breastplate, pauldrons, gauntlets, greaves; tabard strip with an emblem,
  belt + buckle; a spear in idle/walk (L, M, N); the captain (O) in gold
  with a red cape (idle/walk only, tucked away when seated).
- Weapons held in the actual hand (follow-up): find_hand() locates the
  weapon hand in every frame on the undressed base (front: viewer's right,
  back: left, side: near hand), so the weapon swings with the walk. L and M
  carry spears (front/back: along the outer edge of the fist; side: leaning
  back over the shoulder, behind the head); N and the captain O carry
  swords pointing down from the fist (side: angled forward). The fist is
  redrawn over the shaft/grip (grip()) so it reads as held.

### Wind: trees, bushes and grass sway; leaves fall

Per request (js/plantfx.js): an always-on gentle wind. windWave(col,row)
is a wave travelling across the map; windStrength eases toward
WIND_BY_WEATHER (Sunny 0.55 ... Thunderstorm 1.7).
- Trees (isWindTree(): ids starting "tree", not stumps/trunk pieces) and
  bushes lean their top by WIND_TREE_PX / WIND_BUSH_PX world px, base
  planted — applyPlantFxTransform(col, row, type) now gets the type and
  does this whenever no chop-shake / walk-through sway is running. A
  two-piece tree's canopy pivots on its own base, so it stays on its trunk.
- Wild grass: windGrassAngle() is added to its walk-through sway angle in
  drawWildgrassWhole() (js/camera.js).
- Falling leaves: leafy trees on screen (list refreshed twice a second)
  drop LEAVES_PER_SECOND * wind leaves from inside their canopy (opaque
  bbox), coloured like the tree; they flutter down, settle on the ground
  around the trunk and fade. Drawn with a dark rim so they show on grass.

### Chopping trees: cracks, chips, leaves — leaves are Leaf.png

- Chopping (resolveHarvestHit(), js/resources.js -> treeChopFx(),
  js/plantfx.js): every chop sends wood chips out of the cut and knocks
  CHOP_LEAVES leaves out of the canopy; the felling chop a FELL_LEAVES
  shower. A notch with cracks (CRACK_STAGES, bigger each hit) is drawn on
  the trunk (treeTrunkSpot(): the narrowest run of pixels just above the
  roots) by drawTreeCrack() from drawObjectLayerItem() (js/camera.js),
  inside the shake transform so it moves with the tree.
- Every falling leaf — wind, chopping, bushes walked through — is now
  assets/particles/Leaf.png (6 frames of 12x7, tumbling while it falls,
  lying flat once landed), drawn at LEAF_SPRITE_SCALE. Green trees use
  the art as is; other leaf colours get a recoloured copy
  (leafSpriteFor(), cached), its shading mapped onto the tree's colours.

### Felled trees topple over (Stardew-style)

On the felling chop resolveHarvestHit() (js/resources.js) calls
startTreeFall() (js/plantfx.js) before swapping in the stump: the part of
the tree ABOVE the cut (treeTrunkSpot()) is drawn on its own, pivoting on
the cut — fallAngle() eases from upright to flat over FELL_TIP_SECONDS
(slow start, then fast), bounces a little (FELL_SETTLE_SECONDS) and fades
(FELL_FADE_SECONDS). It falls AWAY from the player (fellDirection()).
On landing, landingBurst() throws Leaf.png leaves and wood chips along the
fallen tree, and the wood's floating pickups pop out there (onLand) instead
of at the base. Drawn in the depth sort on the stump's row
(fallingTreeDrawables(), js/camera.js). Cosmetic only — the wood is
granted on the chop, as before.

### Every tree in the trees folder can be chopped; vignette blur via CSS

- treeMediumGreen / LightGreen / Red / Yellow had no `resource`, so they
  couldn't be chopped. Now: 3 hits, slice, 3 wood, and they leave their
  trunk (green -> treeMediumGreenTrunk, red/yellow ->
  treeMediumRedYellowTrunk). The two trunks are chopped like the other
  stumps (2 hits, 2 wood, gone; no respawn).
- isStumpType() (CutStump / Trunk): no leaves from them (treeLeafColors()
  returns null) and they don't topple (startTreeFall() skips them) — just
  cracks and chips. noLeaves trees crack and topple, with no leaves.
- Loose leaves/chips are capped at MAX_LEAF_FLECKS (160).
- Performance: drawVignetteBlur() (sunny-day edge blur) used to draw a
  blurred copy of the whole canvas back over itself, reading the canvas
  back mid-frame every frame — measured 20-70 ms on a sunny day. It's now
  the #vignette-blur overlay (index.html / style.css): CSS
  backdrop-filter blur masked to the four edge bands, done by the browser
  on the GPU; JS only toggles it (setVignetteBlur(), off indoors).

### Bare trees leave a stump; soldiers' side-view weapons fixed

- treeThinNoLeaves1/2 now `replaceWith: \"treeThinCutStump\"` like the
  thin trees (their 5-minute respawn still regrows the bare tree there).
- Soldier side views: the weapon is in the FRONT hand (find_hand() side:
  x >= 34; falls back to the near hand if it swung back), and that hand is
  a gauntlet now. Spear: upright just in front of the face, the fist
  closed over the shaft, butt resting on the ground (never below the
  feet). Sword: pommel behind the fist, crossguard in front, blade down
  and forward. Front/back sword: pommel above the fist, crossguard below
  it, ~9px blade angled slightly away from the leg.
- Spear overlap (follow-up): front/back the shaft goes through the MIDDLE
  of the fist — drawn over the body in the front view (it crosses the arm
  and shoulder, fist closed over it), behind the body in the back view
  (only the head of the spear and its butt show).

### Animals on the minimap and world map

Per request ("parang wala pa sa map yung pig, chicken"): every animal is a
small dot on the minimap dial and on the full world map (js/hud.js),
coloured per kind by ANIMAL_MAP_COLORS (js/animals.js) — cream chickens,
pink pigs, grey-brown cows (a bit bigger), white/cream sheep.

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

92. **Maria's route through tavern_room, and the bug that hid her.** Per
    request, a fixed tile route inside the tavern (`tavern_room.npcRoute`,
    interior.js): main door (12,29) -> (17,27) -> inner door (19,15) ->
    out at (19,10) -> bed; walked in reverse in the morning
    (`followNpcRoomRoute()`, npc.js).
    - Root cause of "she never shows up inside": `checkInteriorEntry()`
      called `enterInterior(type)` WITHOUT the building's col/row, so the
      player's room id was `tavern_room@undefined,undefined` — a different
      room from the one Maria entered (`tavern_room@col,row`). Fixed at all
      three call sites; save.js now migrates the broken `@undefined` ids
      onto the real building so furniture placed there isn't lost.
    - Second bug: `npcWarpPortal()` returned `{col,row}` but callers read
      `.x/.y` -> NaN position, she vanished. Now converted to x/y.
    - Her indoor A* also respects the tavern's `tileMap` walls now
      (`isNpcInteriorTileBlocked()`).

93. **Lamp posts: object shadows, bigger pool, pool on the ground.**
    - Anything solid inside a lamp's pool throws a shadow away from it —
      same silhouette-projection technique as the candle, but the object's
      own body stays lit. Cached per lamp (`postShadowCache`, camera.js),
      rebuilt only when something nearby changes.
    - Pool 7 -> 10 tiles (`POST_GLOW_WORLD_SIZE`).
    - Centred on the ground under the bulb (`lightGlow.groundOffsetY`)
      instead of the bulb itself, which floated most of the pool in the air.
    - Later: the lantern itself is repainted after the night washes at 80%
      (`drawLampNightRelight()`, `lightGlow.relightRect`) so it doesn't look
      dead.

94. **Maria's weekly life.** Weekends (Sat/Sun) she goes outside on her old
    route; Mon-Fri she stays in the tavern (`npcSchedule`, interior.js):
    06:00 out of bed through the inner door (19,11)->(19,17), wanders the
    lower room, sets off in time to be at her work spot (8,19) at 08:00,
    works until 17:00, wanders, 18:00 back to bed.
    - Day of the week added (`getWeekdayIndex()`/`isWeekendDay()`,
      calendar.js; Day 1 = Monday) and shown in the HUD date.
    - "Memory" of blocked tiles: a collision appearing on her route puts
      that tile in `room.npcAvoid` (saved) and she never uses it again —
      unless it's the only way through and it's clear.
    - ALL colliding indoor furniture blocks her (`npcDecorBlockedTiles()`),
      not just fixedFootprint beds.
    - She keeps her real colours at night (`drawNpcNightRelight()`), cut out
      where something stands in front of her.
    - Assumption flagged to the user: their inner-door spawn "row 7" was
      read as row 17 (row 7 is still the upper room).

95. **Tavern doors and rooms follow their owner.**
    - Main door spawn row 29, exit on row 30 (`exitZone.minY: 475`).
    - Rooms have an `owner` ("npc" tavern, "player" house_room). While the
      owner is home and awake the room keeps daytime colours; once they're
      asleep it switches to the fixed 8pm look (`getIndoorLighting()`,
      camera.js). Fix later: the two weights are eased directly — easing
      "home" and "awake" separately made the dark wash bump to ~25% when
      Maria walked in (visible flicker + candles flashing on).

96. **Maria's house, her rules.** Player starts in front of their house
    door (`placePlayerAtHomeDoor()`); Maria starts where her schedule says
    (`placeNpcForCurrentTime()`). Her tavern's main door is closed on
    weekends and outside Mon-Fri 08:00-17:00; its inner door needs her
    permission — click her indoors -> "Can I go to your room?" (only yes
    during working hours, lasts until 17:00). Her shop moved into that
    dialog too (she's never outside on weekdays). `npcHomeRoomId()` only
    counts a real tavern — the fallback-to-any-door once locked the
    player out of their OWN house when no tavern existed.

97. **Lights merge instead of stacking.** Every light (both candles, every
    lamp) goes into one half-res buffer combined with "lighten" (per-pixel
    max, lights pre-multiplied onto opaque black so it's an exact max),
    added to the scene once, BEFORE the characters' relight — so
    overlapping lights never overdrive and characters keep their own
    colours (`addSceneLight()`/`flushSceneLights()`, camera.js).

98. **Shadow clean-up.** Indoors only real floor objects cast shadows (no
    wall decor, ceiling, flat rugs, or invisible Collision Blocks — those
    were the "box" shadows). Silhouettes drop faint pixels. An occluder
    whose art CONTAINS the light's centre is skipped — standing behind a
    table/tree used to wipe out your own candle completely.

99. **Furniture indoors actually works.** `placeInteriorDecorAt()` refused
    anything `multiTileFootprint` — i.e. every table, chair, bench, couch
    and stove. Now only buildings are refused (`isBuildingType()`); the
    whole footprint must be on floor and clear of other solid pieces;
    the ghost preview and tile grid show indoors; the player collides
    with it; E puts solid furniture on the tile in front.

100. **Collision covers the whole tile.** The feet used to be a single
     point, so half the body slid into a solid tile from the side. The
     feet are now 12px wide (`bodyFeetCols()`, player.js) — flush stops
     on all four sides — plus a nudge that centres you into 1-tile gaps
     (doors, paths between trees) when walking straight at them.

101. **Minimap & world map.** White viewport box and rim removed; clicking
     the minimap opens the whole world map (`openFullMap()`, hud.js).

102. **Food.** Items in `assets/interior/foods/` are strips of 16x16 frames
     (full -> empty). Icons are the first frame, cut by
     `tools/crop_food_icons.py` (canvas cropping at runtime fails under
     file://). Maria sells Grilled Meat 50 / Salad 20 / Beer 10 (item id
     stays `meatItem` for old saves). The asset loader no longer hangs on
     a missing image (fallbacks, then counts it done anyway).
     - Out of food: no running, 60% walk speed (`HUNGRY_WALK_MULT`).

103. **Tables.** Never see-through (`noOcclusionFade`), depth-sorted with
     characters indoors too (indoor decor used to always draw under
     everyone), and the night relight is masked by anything in front
     (`drawMaskedRelight()`). New Long Table (footprint pinned to its 2
     real rows). All indoor tables share one "Tables" slot. Bartender
     table = 3 parts (left/center/right, 1x1 collision) built from
     `bartender-table.png` by `tools/slice_bartender_table.py`; its slot
     uses the whole table as icon (`iconImage` group option). `isTable`
     marks real tables (Tabletop Clutter isn't one).

104. **Tavern customers (js/customers.js).** 20 stand-ins (player sprites —
     swap `customerSprites()` for real NPC art) visit on weekdays: walk in
     from across the map, queue at the counter, ONE order bubble at a time
     (5 s), sit at a chair facing a table (`findTableSeats()`), eat for
     40-50 s (food strip plays full -> empty), leave.
     - When they come is a daily plan on the GAME clock
       (`buildCustomerDay()`, seeded per day): Mon/Fri usually busy, other
       days quiet/normal/busy at random, small lunch rush; each sets off in
       time to reach the door on time. Last arrival ~14:00 because a 40-50
       s meal is over an hour of game time; at 16:51 everyone inside
       leaves. Missed visits (hidden tab) are skipped, not piled in.
     - Crash fixed: anim stayed "sit" for one frame after the seat was
       cleared -> `c.seat.poseX` on null froze the game. main.js's loop now
       schedules the next frame first and catches/logs frame errors, so a
       single bug can't freeze everything again.

105. **Smaller bits.** Fog patches fade in/out over a life cycle instead of
     popping; sitting and sleeping need you within 1 tile
     (`FURNITURE_REACH_TILES`); tavern opens Mon-Fri 08:00-17:00.

106. **Windows with their light, and a floor layer indoors.**
     - Window (A)/(B) are one 32x110 image each (window on top, its light
       patch below; B built by `tools/combine_window.py`, original kept as
       window2_plain.png). `artRoot` anchors them on the WINDOW so the
       cursor/ghost/placed item line up on it; `litWindow.lightTop` splits
       the art so only the light fades with daylight, at
       `LIT_WINDOW_LIGHT_ALPHA` (0.5 — the art is solid white).
     - Floor tiles (floorBrown/DarkGreen/Green families) and Floor Mat are
       layer "overlay" now, not 3 — they were taking the objects' slot, so
       a stove couldn't go on a mat. Indoors they live in their own map,
       `room.floorDecor` (drawn first; saved as `interiorFloorDecor`; old
       saves are migrated out of `room.decor` on load), so a floor piece
       and an object can share a tile. `interiorMapFor(room, type)` picks
       the map.

107. **Furniture can be pushed up against an indoor wall.** The wall check
     in `isInteriorPlacementBlocked()` tested a tall object's WHOLE
     footprint, so a chair's backrest / stove's chimney / bed's headboard
     landing on the wall rows refused 26 of 102 objects on the floor row
     right under the wall (tavern row 18). Now only the BASE row must be
     floor; overlaps with other solid objects are still checked across the
     full footprint.
108. **Side chairs (chairRight / chairLeft): walkable backrest + split
     depth.** Both are 2 tiles tall. `footprintExcludeBackRows: 1` drops
     the top tile's collision. `splitDepthTopRows: 1` makes the renderer
     (`pushSplitDepthDrawables()`, camera.js) push the chair as two
     clipped slices: the top tile sorts on the seam between the tiles
     (drawn over a character standing on it), the bottom tile sorts at
     the top of the top tile (a character on either tile is drawn over
     it). While someone sits on it, the whole chair is drawn behind them
     as before. Indoors and outdoors.
     Follow-up: with the backrest walkable, the drawn feet sank ~6px onto
     the seat, because the collision feet point (SPRITE_FEET_FRACTION
     0.62) sits above the sprite's real feet (y 48/64). The base tile is
     now tested against the VISIBLE feet across exactly its 16x16
     (`isBlockedBySplitChairBase()`, inventory.js) in isBodyBlockedAt()
     and isInteriorBodyBlockedAt(); the plain tile test skips these chairs
     for movement only (NPC route planning and placement still use the
     tile footprint).

109. **Layer 2 outdoors is all grass.** Every outdoor tile with nothing on
     layer 1/2 (and not under a bigger layer 1/2 item's art) got Ground
     (Inner). Stored as a per-tile bitmap (`groundFill`, js/world.js) and
     painted once into worldCanvas instead of ~19k groundLayer entries,
     because many per-frame loops walk every layer. Runs ONCE per save
     (`groundFill` in the save); placing a flat 16x16 layer 1/2 tile
     replaces it (groundLayer/dirtLayer `.set` are wrapped); E on a filled
     tile with nothing else grabs it as a real grassInner.

110. **Lights merge as one pool.** The shared light buffer used a per-pixel
     max ("lighten"): a dark crease showed where two pools met, and the
     candle vanished inside a lamp's pool. Now lights are summed
     ("lighter") and `flushSceneLights()` caps the total at a lamp's core
     colour x the frame's strength ("darken" fill, `SCENE_LIGHT_CAP_RGB`),
     so overlaps fill in smoothly and never get brighter than one light.

111. **NPC art in per-character folders + four wandering citizens.** Per
     request ("gawin mong folder Citizen_A... Citizen B to E gawan mong ng
     left idle at walk... i add mo sa map nag lalakad lakad... umiiwas...
     25% below at 75% higher npc overlap sa character").
     - Maria's four sheets moved to `assets/npc/Citizen_A/idle/Idle.png`,
       `Idle_Left.png`, `walk/Walk.png`, `Walk_Left.png` (git mv, same
       pixels). Citizen_B..E got `Idle_Left.png` / `Walk_Left.png`, flipped
       frame by frame (4 / 6 frames of 64x64), the same way Maria's were.
       Loaded as `assets.citizen<X>IdleRight/IdleLeft/WalkRight/WalkLeft`.
     - New `js/citizens.js` (after customers.js): four citizens get a home
       spot near the player's spawn and stroll to random free tiles within
       10 tiles of it, idling 2-7 s between walks. Routes use Maria's A*
       (`findNpcTilePath()`) over the customers' shared blocked-tile cache
       (`customerOutdoorBlocked()`), tile centre to tile centre, and
       re-plan if something gets placed on the next tile. People (player,
       Maria, customers, each other) don't collide with them, but they stop
       when someone is within 12px ahead and route around them; in a
       citizen-vs-citizen head-on only the later one in the list dodges
       (both dodging picked the same side and met again). Outdoors only,
       not saved.
     - Overlap: each citizen sorts on a line 25% up its visible body
       (`CITIZEN_OVERLAP_BOTTOM_FRACTION`) — player's feet below it -> player
       in front, above it -> citizen in front. Works out within ~1px of the
       plain feet sort Maria/customers use.
     - They're added to `relightOccluders()` so the player's/Maria's night
       relight is cut out behind a citizen standing in front. Citizens
       themselves aren't relit at night (same as the customers).
     - Minimap + full map show them as light-blue dots.
     - Verified headless (file://): 240 random trees/stones + a tavern,
       3 simulated minutes, 43,200 position samples — none on a blocked
       tile or overlapping `isBodyBlockedAt()`; two citizens sent head-on
       along one row both arrive; no page errors.

112. **Maria no longer gets stuck against furniture (collision unchanged).**
     Per a recording: indoors she'd press into a side chair and stay there
     until the chair was picked up. Reproduced headless with rows of side
     chairs + round tables: 74 of 279 random walks stuck. Cause: her route
     runs tile centre to tile centre, but she usually starts a few px off
     centre, so the first leg went diagonally and her 12px-wide feet caught
     the chair's corner; `sweepInteriorBodyTo()` stopped her flush, and
     every replan from that same spot aimed at the same corner. Fixes
     (js/npc.js), none touching any item's collision:
     - Routes (indoor `findNpcInteriorPath()` and outdoor `setNpcPathTo()`)
       now start by stepping onto the centre of her current tile, when it's
       clear.
     - New `moveNpcInsideToward()`: when the straight step is blocked it
       slides (x then y), like the outdoor step already did. If she's
       already overlapping something (it was placed on her), she may walk
       out of it — never into something she wasn't already in. The outdoor
       `stepNpcToward()` got the same walk-out.
     - Stuck 1 s: she first backs off to the nearest tile centre she can
       reach in a straight clear line (`npcNearestClearCentre()`), then
       re-plans, instead of re-planning into the same corner.
     - Result: 0 of 279 stuck, 0 steps that ended inside a collision she
       wasn't already in; a chair dropped on top of her is walked out of in
       ~3.6 s with the chair left in place.

113. **Lights 10% dimmer; citizens carry a candle and keep their colours
     at night.** Per request.
     - `SCENE_LIGHT_BRIGHTNESS = 0.9` (camera.js): the merged light buffer
       is added to the scene at 90%, so every candle circle and lamp-post
       pool is 10% less bright. Set it back to 1 for the old look.
     - `drawCitizen()` calls `drawCharacterGlow()` like the player and
       Maria — it's already night-only, so nothing shows in daylight.
     - `citizenRelightList()` (citizens.js) gives each on-screen citizen a
       `drawMaskedRelight()` pass, cut out by whatever stands in front of
       them. `drawCharacterNightRelights()` now relights the player, Maria
       and every citizen sorted back-to-front, so whoever is in front stays
       in front after the relight.

114. **The carried Tray rests on the head and bobs with the carry
     animation.** Per request (screenshot: tray floating well above the
     head facing up). `drawCarriedOrder()` (waiter.js) now puts the tray's
     visible bottom edge on the head top of the CURRENT frame, sunk 2 source
     px into the crown (`TRAY_SINK_INTO_HEAD`). Head tops per frame were
     measured off Carry_Idle / Carry_Walk / Carry_Run (first opaque row,
     `CARRY_HEAD_TOP_BY_SHEET`); every tray picture is 32x16 with 1 empty
     row at the bottom (`TRAY_ART_BOTTOM_PAD`). While carrying the tray,
     facing down now also uses Carry_Idle/Carry_Walk (hands up, tray on
     head) instead of Carry_Order_Down — that sheet is kept for a single
     dish carried without the tray.

115. **Painted inventory + hotbar art, 10 hotkeys, citizens sleep in the
     Abandoned House, darker nights.** Per request, with the user's new
     `assets/asset/inventory.png` (961x961) and `slots.png` (1249x209).
     - Inventory: `#inventory-panel` is the art itself (`--inv` = its
       on-screen size). Grid, title, close X and gold are placed in
       fractions of the art, measured off the PNG: 8 columns from x 89
       (86.5 wide, 13.2 gap), 7 rows from y 137 (87 tall, 14 gap). More
       rows scroll with `scroll-snap` a row at a time, so items always
       land in the painted boxes. `INVENTORY_COLS` 9 -> 8. The painted X
       is `#inventory-close`. CSS is the last block in style.css.
     - Hotbar: `HOTBAR_SIZE` 7 -> 10, keys 1-9 and 0 (also numpad).
       `hotbarKeyLabel()` gives the label; slots are positioned on
       slots.png from `HOTBAR_SLOT_X` (the art has its own number badges).
       Old saves with 7 hotbar entries keep slots 8/9/0 at their defaults.
     - Citizens (citizens.js): 20:00-06:00 they walk to the nearest
       finished `abandonHouse`, enter at its door (`npcDoorApproachSpot()`)
       and wander slowly in that house's `abandon_room`; at 06:00 they
       walk to the room's spawn by the mat and come back out. No candle
       and no relight indoors. Drawn via `citizenIndoorDrawables()` in
       `renderInteriorScene()`; indoor relight occluders include them. No
       Abandoned House -> they stay out. Loading at night puts them
       inside. Verified: all 4 inside ~17 s after 20:00, 0 samples on a
       blocked tile indoors, all out ~14 s after 06:00.
     - `NIGHT_SKY_ALPHA` (daynight.js) 0.55 -> 0.63, used by the sky
       keyframes and the indoor full-night wash. Lamp/candle strength
       (`POST_GLOW_MATCH_CANDLE`) left alone so lights don't dim with it.

116. **Hotbar slot fix, inventory built from one looped slot tile,
     citizens reliably leave at 06:00.**
     - Hotbar bug: the icon nudge was `padding: 16% 0 0 12%` — padding %
       is of the containing block's WIDTH (the whole bar), so each slot
       grew to ~100px, the highlight covered two slots and the icons were
       pushed out of view. Now no padding; the icon is absolutely centred
       at 56%/58% of its slot (it may overlap the painted number).
     - Inventory: `assets/asset/inventory_slot.png` is one slot cropped
       from inventory.png (182,230)-(282,330), and
       `inventory_frame.png` is inventory.png with the grid area
       (78..884 x 122..845) filled with the slot tile's edge colour.
       Every grid cell (8 x 100px, no gaps, at 81,133) carries the tile as
       its own background, so slots scroll with their items;
       `renderInventory()` pads to whole rows and at least 7 rows.
     - Citizens: exit counts as reached within one tile of the room's
       spawn, and anyone still inside at 06:30
       (`CITIZEN_LEAVE_GRACE_HOURS`) is put straight out the door. Real-
       time test from 05:58: all four out by ~06:19.

117. **Lights never brighten where they overlap; fainter, softer candle;
     smaller inventory.**
     - `addSceneLight()` merges with "lighten" (per-pixel max) instead of
       summing, and the cap in `flushSceneLights()` is gone. Measured: the
       brightest pixel of the light buffer is the same (129) with one
       candle, two on the same spot, two offset, or four together, and a
       candle under a lamp is just the lamp.
     - The carried candle: `CANDLE_OPACITY = 0.6` and a 6-stop
       `CANDLE_GRADIENT_STOPS` ramp that fades out long before the rim.
       Lamp posts unchanged.
     - Inventory `--inv` 600 -> 470px (max 78vh / 90vw); `#inventory-grid`
       has `overflow-x: hidden`.

118. **Hotbar a bit smaller; highlight shaped like the slot.** `#hotbar`
     640 -> 540px (max 90vw), held-item pill moved to match. The selected
     (gold) / held (green) outline is now a `::after` ring 5% outside the
     slot's dark inside — on its bronze rim — with 16% rounded corners,
     instead of an inset square box-shadow.

119. **Snow drawn by code, weather split in front of/behind characters,
     falling leaves on sunny days, weather continuous through houses.**
     - Snow (weatherfx.js) follows the "Snow" pen (codepen.io/ivanodintsov/
       pen/KVgwRG): 150 white circles, radius 0.5-3 CSS px, fall 60-180
       px/s, wind -30..90 px/s, wrap to the top. Snow.png is still loaded
       but no longer drawn. Tunables: SNOW_* in config.js.
     - Snow is now SCREEN-space (it was world-space, tied to camX/camY, so
       every trip into a house re-based it on the room camera and it came
       back out empty). Rain already was. All weather particles keep
       updating while the player is indoors, so stepping out lands in the
       middle of it: measured 147/150 flakes on screen right after exit.
     - Two rows: `drawWeatherBackFX()` (called in render() right after the
       back fog, before the depth-sorted world) draws row 1 behind
       characters/trees; `drawWeatherOverlayFX()` draws row 0 over them.
       Rain's back row and its splats use the same split.
     - Leaves: `assets.leaf` = particles/Leaf.png (6 frames, 12x7).
       Sunny + 09:00-15:00 (`LEAF_START_HOUR`/`LEAF_END_HOUR`): 18 leaves
       drift down and right, tumbling through the frames; outside the
       window no new ones start and live ones finish falling.

120. **No dark seam where two lights meet ("light to light").** The
     per-pixel max from entry 117 left a valley between two pools (the
     midpoint is dimmer than either centre), which read as a shadow line.
     Now `addSceneLight()` SUMS lights (fills the valley) and also paints
     that light's peak colour over its rect into `sceneLightCapCanvas`
     ("lighten" = max); `flushSceneLights()` clips the sum to that cap
     ("darken" = min). So overlapping pools blend into one smooth light but
     never get brighter than the brightest single light there. Candles
     pass `CANDLE_PEAK_RGB` (their centre, 217/170/111); lamps default to
     `SCENE_LIGHT_CAP_RGB`. Measured: peak 112-113 alone or overlapped;
     two candles 30px apart stay 111-113 all the way between them.

121. **Snow/rain/leaves no longer follow the character.** They stay in a
     wrapping screen-sized field (so they're continuous through houses),
     but `scrollWeatherWithCamera()` (weatherfx.js, first thing in
     updateWeatherFX()) shifts every particle opposite to the outdoor
     camera's movement each frame — snow and leaves in CSS px, rain (and
     its splats, landing spots) in screen fractions — wrapping at the
     edges. Skipped on scene/zoom changes or jumps bigger than a screen.
     Verified: with falling stopped, walking 62px diagonally left every
     flake at the same world x/y (or wrapped exactly one screen over).

122. **New terrain sheets cropped into 16x16 tiles (not wired up yet).**
     Per request, with the user's counts. Each sheet in
     `assets/tiles/grass_tile/`, `bricks_tile/`, `snow_tile/` was cut on
     the 16px grid in reading order (left->right, top->bottom), skipping
     fully transparent cells, and saved in the SAME folder as
     `<sheet>-1.png`, `<sheet>-2.png`, ... The original sheets are kept.
     - grass: top 5, right 3, left 3, bottom 5, enter 6 (top/bottom are
       3x2 with one empty cell each).
     - bricks: top 3, left 3, right 3, bottom 3, enter 6 (the sheet is
       3x3, but its 3rd row is pixel-identical to the 2nd, so rows 1-2).
     - snow: top 3, top-inner 5, center 5, bottom-inner 5, bottom 3,
       snow-tile-6-part 10, snow-dark-tile-6-part 10.
     81 files. `assets/tiles/mountain/` was not in the list and was left
     uncropped. Not added to `assets.js` / `itemDefs` yet.

123. **Terrain tile sets in the inventory (grass / bricks / snow /
     mountain); mountain cropped; source sheets removed.**
     - The leftover source sheets in grass_tile/bricks_tile/snow_tile were
       deleted (only the 16x16 crops remain).
     - assets/tiles/mountain/ cropped per the user's names: top 4,
       top-inner 6, center 12, bottom-inner 6, bottom 6 (first/last named
       top-left-wall-mountain / top-right-wall-mountain, the 4 between
       bottom-mountain-1..4), top-wall 6, center-wall 6, bottom-wall 6,
       bottom-outer-wall 4 — plus bottom-snow-wall 6 and
       bottom-snow-outer-wall 4 (in the folder but not on the list).
       Sources removed. 66 files.
     - `TERRAIN_TILE_SETS` (assets.js) lists every set: folder, the icon
       tile, and its rows BY NAME (a long name wraps at its sheet width).
       Assets and itemDefs are generated from it, id =
       "terrain" + Set + CamelName + n (e.g. terrainMountainCenterWallMountain3).
       Flat, unlimited, ground layer 2 (`[2, /^terrain/]`).
     - One inventory slot per set (TILE_GROUP_META `terrain<Set>`,
       singleIcon): enter-grass-1, enter-bricks-6, center-snow-2,
       center-wall-mountain-3. Clicking opens the picker laid out with
       `meta.rows` — one row per name, in order, not a shuffled wrap.
     - Verified: 147 tiles load (22/18/41/66), none broken; placed on the
       map the mountain/snow pieces join up.

124. **grass_tile picker laid out like the user's mockup; picker scroll
     fixed; mountain walls collide.**
     - `TERRAIN_TILE_SETS` Grass has a `shape` (5x7, null = empty cell):
       top 1-3 across the top, left 1-3 / right 1-3 down the sides, top
       4/5 and bottom 1/2 as the inner corners, bottom 3-5 along the
       bottom, enter 1-6 underneath. Matched cell by cell against the
       mockup (alpha + colour exact); note left-grass-1 == top-grass-1,
       right-grass-1 == top-grass-3, left-grass-3 == bottom-grass-3,
       right-grass-3 == bottom-grass-5 pixel for pixel. The picker renders
       `meta.shape` as a grid when present, else `meta.rows`.
     - Scrollbars: #tile-variant-picker had max-height 260px AND the
       terrain rows had their own 70vh scroll box — two competing
       scrollbars, lower rows hard to reach. Now one scroll area (the
       popup), up to the window height, gold scrollbar; the inner one is
       gone. Grass (251px) and Mountain (412px) now fit with no scroll.
     - Verified picker tiles hold, go on hotkeys (enter-grass-5 -> 4) and
       place on the ground.
     - Mountain tiles with "wall" in their name get `collides: true`
       (whole tile): top/center/bottom/bottom-outer walls, the two
       top-left/right corners and the snowy wall strips. Plateau tiles stay
       walkable. Walking up into a row of walls stops the feet one row
       short.

125. **Bricks / snow / mountain pickers laid out like the user's mockups.**
     Each mockup (white = empty) was matched cell by cell against the tiles
     (alpha + colour exact); several tiles are pixel-identical, so each cell
     takes the name that follows the natural order, verified to be one of
     that cell's exact matches (0 mismatches). `shape` added to Bricks
     (5x5 plus; the centre's last row repeats enter 4-6, as in the mockup;
     all 18 tiles), Snow (5x5 patch, 21 tiles) and Mountain (6x12: plateau,
     cliff walls, grassy then snowy bottoms; all 66, same order as the
     sheets). Tiles a shape leaves out (snow-tile / snow-dark-tile, 20) are
     listed under the shape by name (`.tile-variant-extra`). No picker
     needs a scrollbar at 1366x768.

126. **Brown / dark green / green floor and Port pickers shaped like the
     user's mockups.** `TILE_GROUP_META.<group>.shape` (set right after
     the literal): the floors are their own sheet grids (tile RrCc at row
     r, col c; brown 5x5 minus corners, greens 3x3) — each mockup cell
     matched its own tile exactly. The port mockup is the original 5x5
     port sheet (nearest-tile distance 0-9 from water shimmer, next best
     far off); spots whose tile was dropped as a pixel-duplicate earlier
     show the tile it duplicated (row-2 edges = portTC1/portTC3, centre
     column = portI2, bottom-left = portTL). For shape groups without
     `rows`, members not in the shape (the 8 port bridge pieces) are
     listed underneath in a grid. No scrollbars needed.

127. **Mountain tiles no longer replace layer 2.** Per request ("gawin mo
     na lang object"), `terrainMountain*` is filed in the overlay layer
     (`["overlay", /^terrainMountain/]`, before the `[2, /^terrain/]` rule)
     rather than objectLayer: it sits on the grass/ground tile without
     removing it, always draws under characters (layer 3 would Y-sort a
     flat plateau tile over a player standing on it), and leaves the object
     slot free (trees can stand on the mountain). Wall tiles still collide
     (overlay is in ALL_LAYERS, which both the player and NPC planner scan).
     Old saves: the load routes those tiles to the overlay by type, and
     applySaveData() turns the grass fill back on under each mountain tile
     that has no real ground tile. Verified: bricks + mountain on one cell
     both kept; wall blocked, plateau walkable; migration restores grass.

128. **Mountain plateau rim collides; fence picker shaped like the mockup.**
     - `MOUNTAIN_SOLID_TILES` (inventory.js): top-mountain 1-4,
       top-inner 1 & 6, center 1, 6, 7, 12, bottom-inner 1 & 6,
       bottom-mountain 1 & 4 — solid like every wall tile. 48 of the 66
       mountain tiles collide. Each blocks its whole 16x16: walking into a
       lone tile from each side, the 12px-wide feet stop flush on its edge
       (x -6/+22 -> body edge 0/16, y 0/16).
     - Fence: `TILE_GROUP_META.fenceTile.shape` = its sheet grid with the
       four corners empty (the user's mockup; every filled cell is its own
       RrCc tile, diff 0.2-0.5). The three existing corner pieces (R0C0,
       R0C4, R4C0) are listed underneath.

129. **bottom-mountain 2 and 3 collide too** (per request, same as 1 and
     4) — added to `MOUNTAIN_SOLID_TILES`; 50 of 66 mountain tiles are
     solid now, each the full 16x16.

130. **Snow weather turns the grass to snow (render-time only).** New
     js/snowground.js (after weatherfx.js), active while
     getCurrentWeather().name === "Snow":
     - `drawSnowGroundFill()` (right after worldCanvas in render()) draws a
       snow tile over every ON-SCREEN grass-fill cell: center-snow-2..5,
       picked by a position hash. center-snow-5 is an edge piece with
       transparent pixels, so it gets center-snow-3 under it
       (`SNOW_GROUND_PARTIAL`) — otherwise grass showed through as green
       specks.
     - `drawGroundItemAt()` asks `snowGroundIconFor()`: layer-2 grass
       tiles (/^(grass|terrainGrass)/) draw as snow cut to the grass tile's
       alpha (cached canvas per type+variant), so their edges keep shape.
     - `drawGroundOverlay()` passes types through `snowSwapMountainType()`:
       bottom-wall-mountain N -> bottom-snow-wall-mountain N,
       bottom-outer-wall-mountain N -> bottom-snow-outer-wall-mountain N.
     Saves/layers are untouched, so the grass is back when it stops
     snowing. The minimap still shows grass (it reads worldCanvas).

131. **Day/night monitor in the top-left HUD; HUD re-laid.** Per request,
     with the user's assets/asset/sunny_cycle_monitoring.png and
     night_cycle_monitoring.png (36 frames of 881x943 each, from
     dayandnightmonitoring.aseprite). The frames are the sun (moon) rising
     on the right, crossing the top and setting on the left, so
     js/daycyclehud.js picks the frame from the GAME CLOCK: 06:00-18:00 ->
     sunny frames 0-35, 18:00-06:00 -> night frames 0-35 (one per 20 game
     minutes; noon = sunny 18, midnight = night 18). It draws into
     `#daycycle-hud` (264x283 canvas shown at 124px), redrawing only when
     the frame changes (checked every 250ms). The full sheets are 31716px
     wide (~120 MB each decoded), so it uses *_hud.png copies scaled to
     264x283 per frame (~320 KB each); the originals are kept.
     Layout: `#hud-top` = monitor + the stat bars beside it; under the
     monitor `#calendar-section` = date with the clock next to it (the
     clock replaced the "Day N" counter) and season + weather; then
     Col/Row. The play-time timer is gone from the HUD (hud.js writes to
     it and to Day N only if they exist; play time is still tracked/saved).

132. **Port Bridge cut into 16x16 tiles, own inventory slot, walk on it
     from the mountain / under it from the ground.** Per request.
     - assets/outdoor/port_bridge.png is 80x80, so on the 16px grid it's
       5x5 = 25 tiles (the user said "10 by 10"; that would be 8px pieces
       — flagged to them). Crops: assets/outdoor/port_bridge_tiles/
       port-bridge-R<r>C<c>.png, loaded in assets.js as bridgeTileR<r>C<c>
       (BRIDGE_TILE_ROWS/COLS). Not a "port" prefix on purpose.
     - itemDefs generated in a loop (inventory.js, before the tile groups):
       flat, unlimited, `isBridge`, R2C2 is `groupIcon`. The old whole-
       sprite `portBridge` item is gone; the other port bridge pieces
       (decor/front/wall) stay in Port Tiles.
     - TILE_GROUP_META.bridgeTile ("Port Bridge", singleIcon, 5x5 `shape`).
       Bridge tiles replace each other (canReplaceGroundItem). Not placeable
       indoors.
     - New `bridgeLayer` (layer rule "bridge", in ALL_LAYERS after the
       overlay): sits over ground AND mountain tiles without replacing them.
     - `player.elevated` (player.js, saved): walkable mountain tile -> true,
       plain ground -> false, bridge tile -> unchanged
       (updatePlayerElevation(), after movement). isBodyBlockedAt() with
       `collisionForPlayer` (set only around the player's own movement):
       elevated -> bridge cells always walkable (even over a solid rim/
       wall), and from a bridge you can't step onto a cell that's neither
       bridge nor walkable mountain; not elevated -> bridge ignored.
       NPCs never use these rules.
     - camera.js renderWorldObjectsSorted(): bridge drawn after the sorted
       pass (over NPCs/objects/low player). When elevated, the player and
       objectLayer items on walkable mountain tiles move to a second sorted
       pass drawn after the bridge. relightOccluders() cuts bridge tiles out
       of every night relight except the elevated player's.
     - Old saves: a placed `portBridge` expands into the 25 tiles on the
       cells the sprite covered; hotbar/in-hand portBridge -> bridgeTileR2C2.
     - Verified headless: 25 tiles load, picker 5x5; plateau -> bridge ->
       across stays elevated, side step off blocked; from the ground the
       player walks under it (hidden by it), mountain wall still blocks;
       migration gives 25 tiles. Known: a bridge end that stops over plain
       ground is a dead end while up (can't step off) — end it on mountain.

133. **Dirt Stairs tile set.** Per request, dirtstair.png (32x48) cut on
     the 16px grid in reading order into assets/tiles/stairs_dirt/
     stairs-dirt-1..6.png (2 across x 3 down; the left and right column
     are pixel-identical, all six kept). Added as TERRAIN_TILE_SETS
     "StairsDirt" ("Dirt Stairs", icon stairs-dirt-3, picker rows 2x3), so
     ids are terrainStairsDirtStairsDirt1..6, one inventory slot.
     - Layer: ["bridge", /^terrainStairs/] — on bridgeLayer so they sit
       over a mountain wall without replacing it; `isStairs` flag.
       Bridge-layer tiles replace each other (canReplaceGroundItem).
     - Drawn by drawStairsLayer() right after drawGroundOverlay() (under
       every character); skipped by drawBridgeLayer() and the bridge relight
       occluders.
     - Player only: a stairs cell is walkable even over a solid wall
       (isBodyBlockedAt()), and keeps `elevated` unchanged like the bridge,
       so climbing to the plateau turns it on and walking down to the
       ground turns it off. NPCs don't use them. Not placeable indoors.
     - Verified headless: 6 tiles load, picker 2x3; ground -> stairs ->
       plateau goes elevated, back down goes low; a wall with no stairs
       still blocks.

134. **Port Bridge collision is pixel-exact (while up on it).** Per request
     ("yung deadspace is yun yung may collissions"): on a bridge tile only
     its drawn pixels are walkable; its transparent pixels are solid.
     `BRIDGE_TILE_ALPHA` (assets.js) = each tile's opacity as 16 row
     bitmasks, measured off the PNGs (no getImageData, so file:// works).
     isBodyBlockedAt() (player.js), when the player is elevated, tests every
     pixel of the 12px feet line on the feet row with isBridgePixelDrawn();
     a transparent pixel blocks unless the cell under it is a walkable
     mountain tile (where the bridge meets the plateau). The old tile-level
     rules (no stepping off a bridge cell into air) still apply after it.
     Down on the ground nothing changed — the bridge still doesn't collide.
     Verified headless: on the deck the feet stop flush on the planks'
     left/right edges (x 1594 / ~1651 for a bridge at col 99), can't walk
     up into the deadspace beside the narrow top neck, can walk up the
     neck onto the plateau.

135. **Port Bridge hooks onto Grass/Brick/Snow tiles too; bridge is
     depth-sorted so trees aren't covered by it.** Per the user's video (a
     bridge built off grass over water drew on top of a tree).
     - isHighGroundAt() (player.js) now also counts the tile-set ground
       tiles terrainGrass* / terrainBricks* / terrainSnow* (groundLayer,
       BRIDGE_LANDING_GROUND) as "up" ground, besides walkable mountain
       tiles (a mountain overlay on the cell still decides first). Lay
       those tiles at a bridge's ends to walk onto it.
     - camera.js: no more "draw the whole bridge after everything" /
       high-drawables second pass. computeBridgeComponents() groups
       bridge tiles (4-connected, stairs excluded) each frame into
       bridgeComponentsThisFrame; each is ONE drawable Y-sorted on its
       bottom edge. So trees/NPCs/the player whose feet are below the
       bridge draw over it, and anything with feet inside its span is
       under it. elevatedPlayerSortY(): an elevated player whose sprite
       overlaps a bridge sorts just past its bottom (drawn on top).
       relightOccluders() uses the same rule (feetY < comp.bottom).
     - Verified headless: grass tiles -> walk right onto the bridge stays
       elevated and is drawn over it; a tree below the bridge draws over
       the bridge; a low player walking up under it is hidden by it.

136. **R5C1's bottom edge is a closed rail (Port Bridge only).** The user
     pointed at the player walking past the bottom of R5C1 (1-based;
     = bridgeTileR4C0, the bottom-left block with a black outline along its
     bottom). A first attempt made Grass/Brick/Snow edge tiles pixel-exact
     landings; the user said NOT to touch grass — only the bridge — so that
     was fully reverted (no TERRAIN_TILE_ALPHA / isLandingPixel; landing
     tiles count as whole tiles again, as in #135).
     - BRIDGE_TILE_CLOSED_EDGES (assets.js) = { R4C0: ["bottom"] }: bridge
       tile sides you can't walk across while up on the bridge, whatever is
       past them. bridgeEdgeClosed() (player.js); isBodyBlockedAt() checks
       it when the candidate feet row differs from the current one (top /
       bottom sides). Other tiles with a black outline edge (R1C1-R1C4 top,
       R2C1/R2C5 top, R4C1/R4C5 bottom, R5C2-R5C4 bottom) were left open —
       add them to the table if asked.
     - Verified headless: on R5C1 with a grass tile below, feet stop at its
       bottom edge; a non-closed bottom tile still lets you step off onto
       the grass below.

137. **Bridge collision measured at the soles, not the feet line.** The
     user's video (#136 "same parin"): the collision already stopped at
     R5C1's bottom, but the drawn feet hung ~6 world px past the planks,
     because the feet line (SPRITE_FEET_FRACTION = 0.62) sits above the
     sprite's real soles (every player sheet: 64px frames, lowest opaque
     row 48 = 0.75). BRIDGE_SOLE_DROP (player.js) = (48/64 - 0.62) *
     DRAW_SIZE ≈ 6.2. In isBodyBlockedAt()'s elevated-bridge block, every
     check (pixel deadspace, closed edges, stepping off, standingOnBridge)
     now uses soleY / srow instead of feetY / row. updatePlayerElevation()
     also treats a bridge under the soles as "on the bridge" (otherwise the
     feet line leaving the top row dropped `elevated` and let you walk off).
     Only affects the player while up on a bridge.
     Verified headless: walking down on R5C1 the soles stop at its bottom
     edge (screenshot: feet on the dark bottom line); walking up, the soles
     stop at the top row's top edge; walking along the deck unchanged.

## Possible next steps (not done yet, just noted)

- ~~Serving~~ — done, see "Waiter job" above. Still open: Carry_Order
  only has a Down sheet; Up/Side art would replace the fallback.
- Real NPC art for the tavern customers — only `customerSprites()` in
  js/customers.js needs to change.
- tools/generate_alpha_masks.py is OUT OF DATE (old building names):
  running it would DELETE the tavern/abandonHouse/house masks. Update its
  OBJECT_ICONS list first, or patch single entries by hand as done for
  tableBig2/chairRight/tableCircle.
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


### Town buildings, furnished rooms, townsfolk homes

Per request ("tanggalin mo muna yung parang taniman... dagdagan mo sana
ng bahay or may mga room na maliliit... yung mga ibang npc ilagay mo
dun... interior may mga pader at collissions... pinto palabas at papasok
... path way with fence at mga flowers... tuloy mo na rin yung mountain
design").

- `tools/build_town_assets.py` composes houses from the pack's wall strips
  (Walls.png y 184-240, pieces 32/16/32/16 per style), the wide gable roof
  (Roofs.png, 128x89 — the steep roof's ridge post is masked out of its
  box), doors/windows/planters/chimney from Props.png. Rooms: tiled floor,
  the wall set's 64x56 back-wall band (Interior_Walls_01.png x0+16, y 88),
  a drawn frame with a 32px doorway and a rug as doormat.
- `js/townBuildings.js` holds item defs, groups, layer rules and room
  blueprints; inventory.js / interior.js merge them. Room walls use the
  same `walls` rectangles as house_room, plus a `tileMap` for placement.
- `defaultDecor` + `INTERIOR_SAVED_ROOM_IDS`: a room is furnished only when
  it is created for the first time; a room present in the loaded save
  keeps exactly what was saved (save.js fills the set before restoring).
- citizens.js: `citizenShelters()` also lists houses with `citizenHome`;
  `nearestShelter()` now assigns a home (`c.homeRoomId`) by kind and
  capacity; daytime visits use `c.visitUntil`, cleared at night.
- Map (save): farm plots/crops removed; west neighbourhood with two
  streets, five cottages + guard house, fenced flower beds, lamps,
  benches, a fence along the streets; plateau edges autotiled (left/right
  edge tiles, top-inner rims + top-mountain lip on the grass above).

### Town pass 2: solid gables, richer rooms, plaza, lookout

- Houses: the front wall is now ONE continuous wall (wall_column() in
  tools/build_town_assets.py — top trim once, body repeated, base once),
  so nothing shows through under the roof ("parang may butas yung taas").
  Plaster cottage got shuttered windows.
- More furniture (Table (Blue Cloth), Long Shelf, Wide Cabinet) and fuller
  defaultDecor layouts; the town rooms are dropped from the save on
  regeneration so the new layouts apply.
- Map: brick plaza (terrainBricks) in front of the tavern with a stone
  bench, planter and lamp; a lookout at the top of the stairs (bench,
  two lit lamps, stones, bare trees, flowers) and bare trees/stones
  scattered over the plateau; extra trees, bushes, benches around the
  neighbourhood.

### Town pass 3: floating triangles, hair while sleeping, lamps, cave

- Floating triangles on the gables: roof_a() copied a 128x89 box that also
  caught the top of the steep roof below it. It now keeps only the pixels
  connected to the roof itself (scipy label), so nothing else lands on the
  wall.
- Sleeping player was bald: bigbed-sheet.png (30 frames, 46x54) predates
  outfit #2. tools/fix_sleep_hair.py finds the head per frame and draws the
  player's black hair + bun in the Idle sheet's colours; the original is
  kept as bigbed-sheet_bald.png.
- Paths: postLight (plain post by day, lit lamp at night — its own
  nightIcon swap) every ~9 tiles, alternating sides; trees, trunks, bare
  trees, stumps, bushes, flowers, mushrooms and stones scattered 2-5 tiles
  off every path; a tree/bush border round the map edge. The earlier
  always-lit lamps became postLight too.
- Cave: caveEntrance (mountain wall tiles + timbered mine mouth) set into
  the cliff north of the pond at (120,23), path to the dock and stairs;
  cave_room (rock walls, dark dirt floor, stones, mushrooms, a lamp, a
  chest). Works like a house door.
- The user's own village decor from the original save is kept — only items
  an earlier town pass generated are rebuilt.

### Grocery, more decor, room customizer (walls/floors/size)

- groceryStore: twin-gable plank shop with a produce sign, east of the
  quarry road at (152,78) with a market row of veg crates across the road.
  grocery_room: counter (bartender pieces), veg crates, shelves, barrels.
  Inside, P opens the shop panel (openNpcShop(stock, title) is now
  generic) selling vegetables. Townsfolk drop in now and then
  (CITIZEN_SHOP_VISIT_CHANCE); J works there 08:00-17:00; at night anyone
  inside the shop heads home.
- 17 more pieces from Interior_Props_01: chandelier (layer 6), kitchen
  things, bottles, broom, stool, cushion, cupboard, crate, wall panel,
  wall candle.
- js/roomCustomizer.js: town rooms are drawn at runtime from
  Interior_Walls_01.png (`room.custom = {wall, floor, cols, rows}`): tiled
  floor, the set's back-wall band, a frame in the set's own trim colours
  (sampled by the build script into TOWN_ART.wallSets) so corners follow
  any size. H opens the panel: wall (Log/Bato/Kahoy/Plaster), floor
  (Tabla/Bato/Herringbone/Parquet), width 10-30 (steps of 2, keeps the
  doorway centred), height 9-24. Shrinking returns what no longer fits to
  the inventory and moves anyone outside back in. The player's House
  (house_room, `customizable`) keeps its art until the first change.
  Saved as `interiorCustom`.

### Rooms you dig out (Room Pickaxe / Room Hammer)

Per request: expanding a room should be done with a pickaxe-like tool,
2x2 at a time, in the direction you face; a new house starts 4x4; the
walls and floor follow the open space.

- js/roomCustomizer.js: a customizable room is a set of floor tiles
  (`custom.tiles`) plus a 2-wide doorway (`custom.door`). The image is
  rebuilt from that set: floor texture per tile, the wall set's back-wall
  band (3 tiles) above every floor tile with no floor north of it, and a
  frame (the set's trim colours, outer corners filled) round the shape.
  `room.floorTiles` = floor + doorway; isInteriorWallAt() (interior.js)
  only lets the feet stand there. tileMap follows the same set.
- Tools: Room Pickaxe digs, Room Hammer fills. Equip, face a wall, F:
  Crush swing (player.js inside branch, player.indoorTool), then
  resolveRoomTool(). The target 2x2 is the first one past the floor in
  that direction (up to 3 tiles). Digging never goes below the doorway
  row; filling refuses furniture, the tiles just inside the door, the
  player's own tile, and anything that would cut part of the room off.
  Digging past the left/top margin shifts the whole room (tiles, door,
  decor, collisions, player, citizens) so there's always space for the
  back wall.
- New houses start 4x4 (`customDefaults.start = "small"`); default
  furniture is only placed where it fits (defaultDecorFits()). Saved room
  shapes are known before rooms are created (INTERIOR_SAVED_CUSTOM), so a
  saved big room gets its full furniture. Old {cols, rows} saves become
  the same rectangle as tiles. The generator writes the town houses'
  full-size shapes into the save.
- H keeps wall/floor style only. Both tools are also sold at the grocery.

### Second world (the wild valley), portal, neighbourhood moved

- js/worlds.js: two outdoor worlds on the same tile grid. switchWorld()
  packs the current one (placed items + grass fill) into worldStore,
  clears ALL_LAYERS, unpacks the other, repaints the ground. Bounds via
  worldW()/worldH() (player.js movement clamp, camera.js clamp).
  Portals: main col 0-1 rows 39-41 walking west -> wild east pass;
  wild east pass walking east -> main (3,40). Fade via beginSceneFade().
  Maria, citizens, customers, animals, the waiter job and resource
  respawns only update/draw in the main world (wrapped functions).
  Saves: main world always in the usual fields, the wild one in
  `worlds.wild`; the game always starts in the main world.
- tools/build_wild_world.py -> js/wildWorld.data.js: 94x52 (half the
  main map). Mountain ring (plateau autotiled; south faces are a 4-tile
  cliff: TopWall, CenterWall x2, BottomWall with its grassy foot), pass in
  the east wall at rows 24-28, grass-edged dirt trails and clearings,
  trees, trunks, stumps, bushes, flowers, mushrooms, stones, grass tufts,
  and trees/bushes on top of the mountain.
- Main map: a path from the woods west to the portal at row 40 with two
  lamps; the neighbourhood moved from the bottom-left to the bottom
  centre (+90 cols, joined to the road at cols 140-141); the old area is
  forest now. Saved interiors were re-keyed to the new house positions.

### Ranch replaced by houses

Per request: the fenced ranch south of the village is gone. In its place a
row of four cottages (Brick, Plaster, Log, Plaster at cols 61/70/83/92,
doors on row 92) on a new street (rows 93-94, cols 57-96), reached by a
lane at cols 76-77 from the main road, with lamps, a bench, planter,
barrel, flowers, and trees/bushes south of the street. Each has its full
furnished interior (shape written to `interiorCustom` by the generator).
The leftover boundary fence at col 94 was removed. The generator now also
clears any standing object under a new building's footprint.

### Grass on the mountain tops (both worlds)

- tools/plateau_grass.py: picks blobs of plateau cells away from the rim
  (`margin` tiles in), fixes diagonal-only corners, and returns grass_tile
  pieces by the same 4-corner rule as the paths (corner = grass when all
  four cells round it are grass): EnterGrass 1-3 inside (4-6 are darker
  and checker), edge pieces round the patch. Those cells lose their
  mountain overlay and their grass-fill bit, so the edge pieces' open
  corners show bare soil. They still count as high ground
  (isHighGroundAt(), player.js: terrainGrass is a landing tile).
- Main map (generator): grass patches on the plateau (not near stairs or
  bridges), then trees, bushes, flowers, mushrooms and stones scattered
  over the plateau top.
- Wild world: the north mountain band is 5 tiles deep now (room for grass
  on top); grass patches on all bands, margin 1.

### Wild world is home; caves with inner doors; Pixel Crawler props

- The game opens in the wild world at the player's House
  (startInDefaultWorld(), worlds.js, called from start()). The wild world
  is 80x46 now, trees right up to its edges, with a homestead: the House
  (door (40,21)), a fenced bare-earth plot for farming, a bench, lamp,
  barrel, planter; house_room starts with a Big Bed, table, chairs,
  plants, chest, windows (defaultDecor).
- The little House in town is a townsperson's now: `townCabin` (same art),
  room `cabin_room` (house_room without the player's lights); the save's
  house_room@96,56 data moved there.
- Minimap hidden while inside a room. Citizens' town centre is fixed to
  the village (citizenTownCentre override) since the player starts away.
- Caves: cave_room (town) and tunnel_room (the new tunnelEntrance in the
  wild world's north cliff, top right) are tile-shaped rooms
  (lockedLayout — no room tools) generated by build_town_assets.py:
  a winding tunnel from the entrance that widens into a cavern; an inner
  door at the cavern's top warps (indoorWarp) into a separate deeper
  chamber with a chest. Rock walls/floor from Pixel Crawler's
  Wall_Tiles.png (TOWN_ART.wallSets_extra/floors_extra.cave, own sheet).
- Pixel Crawler pack in assets/pixelcrawler/source; ~280 props cut
  automatically (one per separate picture) from its static prop sheets,
  plus its trees, grouped per sheet in the inventory (pc*). Rocks,
  furniture, dungeon pieces and trees collide.

### Caves back to dirt + mountain wall, smoother curves

Per request the Pixel Crawler rock looked worse: cave_sheet is the first
cave's look again — back wall from the mountain cliff tiles (top-wall +
center-wall), floor from the map's dirt tiles, both darkened; warmer
frame. The winding layout stays but is smoother: Chaikin-rounded path,
tunnels 2 tiles each side, gentler cavern outline, and smooth_tiles()
fills one-tile notches and drops one-tile spurs so the curve doesn't look
broken. The tunnel mouth uses the cave mouth's timber art again.

### Caves joined underground; a third cave; fuller townsfolk houses

- bldWallCaveHole: a plain opening in the rock (no timber), used for the
  inner doors and for the passages between caves.
- Each cave layout now has `links` — the top tile of its deep chamber at
  the left (A) / right (B). worlds.js CAVE_LINKS: tunnel A <-> town cave
  A, tunnel B <-> west cave A. Walking up into a link (checkCaveLinks(),
  wrapped round updatePlayerInsideInterior) fades to the other cave's
  opening, switching worlds underneath if needed, and sets outsideReturn
  to the front of THAT cave's entrance so leaving puts you there.
- caveEntranceB / cave2_room: third cave in the wild world's north cliff,
  west side (14,8), with a path down to the trail.
- Townsfolk homes: more pieces in the cottage, plaster, guard and grocery
  defaults (Pixel Crawler shelves, vases, jars, banners, books, potions);
  the generator furnishes the empty Abandoned House and adds to the
  cabin. The cabin room isn't customizable (it's not the player's).

### Old saves get the new caves

Reported: the caves in both worlds still showed the old shape. A cave
room's shape and props are saved like any room, and the save wins — so a
save made with the old cave kept it. Now each generated cave layout has a
`version` (hash of tiles + props); applySaveData() drops everything saved
for a locked room whose saved version differs, so it's rebuilt from
today's layout. A wild world saved before the west cave/tunnel existed
gets that corner copied in from the default layout (addMissingWildPlaces,
worlds.js). Generated images are loaded with ?v=TOWN_ART.version so the
browser can't show a stale cave texture.

## Room tools 1-tile, tool highlight, full-tile room walls, snowy trees

- **Room Pickaxe / Room Hammer now change ONE tile** (js/roomCustomizer.js):
  `roomToolTarget()` picks the tile — pickaxe: first wall tile in front
  (up to 3 away); hammer: the floor tile right in front. `checkDig()` /
  `checkFill()` hold the rules (doorway, under your body, furniture, room
  split, size limits) and are shared by the swing and the highlight.
- **Highlight while a room tool is equipped** (`drawRoomToolHighlight()`,
  js/camera.js): same white tile grid as holding an item, plus the target
  tile outlined thick — white = F will work, red = it won't.
- **Room walls are full 16x16 solids** (`isInteriorWallAt()`, js/interior.js):
  tile-shaped rooms now test the whole feet area (feet line down to the
  soles, 12px wide), so the shoes no longer sink into the wall trim.
- **Snow on trees** (js/snowground.js `snowTreeIcon()`): while it snows every
  tree* item is drawn with a snow cap on its top edges, light frost and
  stuck flakes — built with compositing only (works on file://). Used by
  drawObjectLayerItemRaw() and the felling animation, so it moves with the
  wind sway / chop shake / fall. Chops and falls also shed snow puffs.

## Seamless walls, head-only fade, round-table strip, performance pass

- **Seamless room walls** (js/roomCustomizer.js `ROOM_WALL_SEAMLESS`,
  `drawSeamlessBandSlice()`): each wall set's 64px band has end caps, so
  tiling the whole band drew a vertical line every 4 tiles. Now only a
  measured cap-free span repeats (log 11+40, stone 16+32, wood 8+48,
  plaster 7+44). Every custom room (all town houses) uses it.
- **Fade only when the head is covered** (js/camera.js
  `PLAYER_HEAD_BOTTOM_SPRITE = 32`): characterTouchesObjectPixels() only
  tests sprite rows above the chin, plus a cheap early-out when the
  object's top is below the chin. Fences, stones, bushes etc. that only
  cover the legs/body stay solid. `fadeBoundingBoxOnly` stones follow the
  same pixel rule now. Chairs/benches/stools (and anything sittable) never fade.
- **Round table**: `collisionTopStrip: 0.25` on tableCircle and
  bldTableRound — a 4px solid strip along the bottom of the tile row above
  the footprint (interiorTopStrips(), js/interior.js), so walking down from
  behind stops before sinking into the table top.
- **Performance**:
  - isTileBlocked() (js/player.js) used to scan every item on every layer
    per call; now a cached Set of blocked tiles, invalidated by
    `layerVersion` (each layer Map's set/delete/clear is hooked) + a 1s refresh.
    updatePlayer went from ~3-6ms to ~0.5ms a frame.
  - Minimap items are baked once into a whole-map canvas
    (minimapItemsCanvas(), js/hud.js) instead of ~1,700 drawImage calls
    per refresh.
  - Cloud shadows (blur filter) rebuild every 3 frames and are shifted by
    the camera in between; sun rays rebuild every 4 frames (was 2).

## Left-click to put down a carried item

- While carrying something grabbed with E (`player.grabbedType`) and not
  holding an inventory item, a left-click on any tile inside the white
  placement grid (PLACEMENT_RANGE round the player) puts it down there.
  Outdoors: canPlaceGrabbedOutdoorAt() / placeGrabbedAtClick()
  (js/inventory.js) — in range, tile free on the item's layer, nothing
  solid on the player's own feet. Indoors: grabbedIndoorTarget() /
  placeGrabbedIndoorAt() (js/interior.js) — same checks as placing decor,
  and small layer-4 things clicked onto a table go on the table top.
- A see-through ghost of the carried item follows the cursor inside the
  grid (white = will place, red = won't), in drawHeldItemGhost() /
  drawInteriorHeldItemGhost() (js/camera.js). E still works as before.

## Seamless house walls + farming

- **House front walls** (tools/build_town_assets.py `wall_block()` /
  `WALL_SEAMLESS`): every 32/16px wall piece had its own outline, so the
  houses showed a vertical line every 1-2 tiles. Now one cap-free span per
  style repeats, with an outline only at the wall's two outer edges.
  Regenerated cottageLog / cottagePlaster / cottageBrick / guardHouse /
  groceryStore (TOWN_ART.version bumped so browsers reload them).
- **Farming** (js/farm.js, icons by tools/build_farm_icons.py into
  assets/items/farm/):
  - Hoe (`farmHoe`, F or click a tile within FARM_RANGE = 2): tillable
    ground (plain dirt or grass, nothing else on it) becomes `dirtRake`.
  - Watering Can (`farmCan`, Watering animation): the soil is wet for
    FARM_WET_HOURS (26 in-game h), drawn as a darker Dirt Rake. Crops only
    grow while wet.
  - Seeds (`seed*`, start at 0, grocery only): hold + click tilled soil.
    FARM_CROPS.hours of wet soil to ripen (carrots/petchay 24 ... dragonfruit 72),
    growth sheet frames 0-2, ripe 3, rotten 4. Rot FARM_ROT_HOURS (36) after
    ripening; a rotten crop can still be clicked, no loot.
  - Harvest: one click on a ripe crop in reach -> Collect animation ->
    `crop*` items pop out (spawnFloatingPickups, same as tree wood).
  - White borders only on usable tiles in reach (drawFarmHighlights()).
  - Planting Sockets (sacks): open ones take crops, SOCKET_CAPACITY 20.
    Click = deposit; full / nothing to add -> pop-up Close+Hold (open) or
    Open+Hold (closed). Contents follow the sack when it's carried.
    "n/20" label over sacks within 3 tiles.
  - Collector (Mang Ador, citizen "I" art): Tue/Thu/Sat 15:00 walks (BFS
    on isTileBlocked) to each Plant Drawer with filled sacks on it, empties
    them and pays FARM_CROPS.sell per crop. Other worlds / player indoors:
    paid instantly.
  - Saved under `farm` (per world: plots, sockets) in js/save.js. Times are
    absolute in-game seconds (farmNow()), so crops grow while closed too.
- **Grocery**: GROCERY_STOCK is seeds only; J (CITIZEN_SHOPKEEPER) works
  08:00-18:00 and stands behind the counter (SHOPKEEPER_POST); P or a
  click on J opens the shop only while J is on duty.
- `startCount` on an item def sets its starting inventory count (default 99).

## Townsfolk home by 19:00, soldiers out 24/7, harvest 2-4

- js/citizens.js: CITIZEN_HOME_HOUR is now 18 (head home) and
  CITIZEN_HOME_BY_HOUR 19: from 19:00 anyone still outside and not on
  screen is put straight into their house (citizenEnterShelter()); ones in
  view get until 19:30 to finish the walk. This also fixes coming back from
  the wild world at night (citizens are paused there — mainWorldOnly(),
  js/worlds.js — so they used to be stranded outside, walking home late).
- The soldiers (CITIZEN_GUARD_IDS L-O) never go in: citizenScheduleTick()
  skips them and initCitizens() doesn't put them indoors at night.
- citizenShelters() is cached per layerVersion (it was a full objectLayer
  scan per citizen per frame).
- js/farm.js: every harvest yields 2-4 (FARM_CROPS.yield).

## Room tools: 5-tile strips, aimed by click

- js/roomCustomizer.js: one Room Pickaxe / Room Hammer swing changes a
  strip of up to ROOM_STRIP_LEN (5) tiles along the wall face — vertical
  when pushing a side wall, horizontal for the back wall — centred on the
  clicked tile (left-click within ROOM_TOOL_REACH) or on what's in front (F).
  - Pickaxe: the aimed tile must be wall touching the floor; each strip
    tile that is wall with floor on the room side is dug. No floor next to
    it -> "Walang sahig na katabi — hindi ma-expand".
  - Hammer: the aimed tile must be floor touching a wall; each strip tile
    that is floor with wall on that side (and free: not the doorway, not
    under you, no furniture) is filled; the room must stay connected.
  - roomToolTarget(room, tool, aim) returns the whole plan
    ({ anchor, tiles:[{col,row,ok}], ok, why }); checkDig()/checkFill()
    take the tile list; startRoomToolSwing() starts the swing (F and click).
- js/camera.js drawRoomToolHighlight(): the strip under the mouse (or in
  front, for F) — white tiles = will change, red = won't.

## Room tools: press-drag-release; auto-tiled ground sets

- **Room Pickaxe / Hammer, drag to size** (js/roomCustomizer.js): press on
  the edge, drag out a rectangle (up to ROOM_DRAG_MAX tiles a side),
  release to swing at all of it (roomRectPlan()). The pickaxe must start on
  wall next to the floor, the hammer on floor next to a wall. A plain click
  is still the 5-tile strip; F still hits what's in front. Esc cancels a
  drag. The highlight (js/camera.js) shows the rectangle while dragging.
- **Auto-tiling** (js/autotile.js): grass_tile, bricks_tile, snow_tile,
  the mountain plateau and the port/island tiles pick their own piece from
  their neighbours when laid or picked up — alone or in a straight line =
  the centre tile, the next one beside it matches, and once tiles meet at a
  corner the edges/corners turn to join up. Each set's picker layout is the
  pattern (masks of filled neighbours); the port set uses its 5x5 picture
  ring + portI2 as the centre. Only the player's own laying re-tiles
  (placeHeldItemAt / tryGrabOrPlaceInFront / placeGrabbedAtClick are
  wrapped); saved maps are never touched.
- **Inventory**: Grass, Brick, Snow and Port Tiles are one slot showing the
  set's own icon — clicking it holds the centre tile, no picker
  (autotileCentreForGroup(); right-click = Hold + 1-7 menu). Mountain Tiles
  keep their picker.

## Grass auto-tiling from the art (jagged edges, not boxes)

- js/autotile.js `GRASS_ART_MASKS`: grass_tile's picker layout is a HOLE in
  a lawn, so masks read off it were backwards and laid grass came out as
  plain centre squares. Each grass piece is now tagged by which of its
  sides/corners are grass in the art itself (border alpha: sides >= 40%,
  corners fully opaque) and every laid tile takes the best match
  (`S.exact`: no "alone / straight line = centre" shortcut; a corner only
  counts where both sides next to it are filled). Patches get the jagged
  tufts on their edges, round convex corners and notched inner corners.
- Only enter-grass 1-3 are used as auto centres (4-6 are a darker shade
  and showed up as a dark square in the middle of a patch).
- A 1-tile-wide line or a lone tile has no exact piece in this set, so it
  gets the closest edge/corner piece.

## Snow and port tiles auto-tile from their art too

- js/autotile.js: useArtMasks(prefix, masks, centres) — the grass fix,
  generalised. SNOW_ART_MASKS (alpha) and PORT_ART_MASKS (land vs the
  water colour of water1.png) tag every edge / convex corner / inner
  corner piece; the snow patch and the island get their rounded / shore
  edges instead of squares. Port: portTL/TR/BR are open water and never
  picked; centres portI2/I4/I6.
- Bricks: every brick piece is a full square (no edge art in the set), so
  they still only vary the brick pattern — nothing to round off.
- Mountain: unchanged (plateau re-tiles from its layout; walls by hand,
  picker kept).

## Same edge pattern for mountain, bricks, snow, port

- js/autotile.js: the mountain plateau and bricks also use "best match
  always" (`exact`): solid inside, edge/corner pieces round the outside,
  inner-corner pieces in the bends. Mountain masks are read off the
  plateau rows of its layout only — the cliff-wall rows under it no longer
  count as neighbours, so the plateau's bottom row reads as an edge.
  Snow / port / grass already use the art masks (useArtMasks()).

## Mountain plateau: a bumpy bottom rim

- The plateau art had no bumpy bottom rim (bottom-inner pieces are flat —
  they sit on a cliff wall), so the top edge of a hole in a plateau, and a
  plateau's lower edge with nothing under it, came out as a straight line.
- New tiles assets/tiles/mountain/bottom-edge-mountain-1..8.png = the top
  rim pieces flipped upside down (1-4 from top-mountain-1..4, 5-8 from
  top-inner-mountain-1/2/5/6). Added to the Mountain set (rows + picker
  shape) in js/assets.js; js/autotile.js gives them the flipped masks.
  bottom-inner pieces now count as "continues below", so they're used where
  a cliff wall (also a mountain tile) is laid under the plateau.

## Mountain cliff walls build themselves

- js/autotile.js mountainWallPiece(): a wall tile (any of the mountain wall
  pieces) only goes under a mountain tile (plateau or more wall) — else
  "Ilagay ang wall sa ilalim ng mountain". Each wall tile picks its piece
  from its column: plateau above -> top-wall (top-left/right-wall at the
  face's sides), wall above and below -> center-wall, nothing below ->
  the foot (bottom-outer-wall in the middle, bottom-wall-1/6 at the sides).
  So laying one wall gives the foot, and every wall laid under it turns the
  one above into body — keep laying down to the height you want.
- The plateau tile over a middle wall column turns into bottom-mountain-2/3
  (the rim shading down into the wall). bottom-mountain-1/4 aren't used
  automatically (they carry a side outline that only fits the picker's own
  picture).
- Laying/removing a wall re-tiles 2 rows up and down around it.

## Curving / stepped cliffs

- js/autotile.js: for a plateau tile, a cliff wall only counts as
  "mountain continues" when it's straight below (S/SE/SW). Beside or above
  it the plateau ends, so where a cliff steps down the plateau gets its
  rounded rim instead of a cut-off square. The bottom-mountain rim shading
  is only used on tiles with plateau on both sides.

## Auto-tiling never changes the map's own terrain

- js/autotile.js `autotileOwned` (per world, saved as `autotileOwned` in
  js/save.js): only tiles the player laid are ever re-tiled. A newly laid
  tile still looks at the map's tiles to pick its own piece, but a
  hand-made cliff / plateau next to it is left exactly as it was (laying a
  wall beside the map's cliff used to turn the tile next to it flat).
  Tiles laid before this change aren't tracked, so they stay as they are.
- Exception: a wall laid right under the map's own wall FOOT takes that
  one foot tile over (it becomes wall body, so the column carries on down);
  the map's tiles beside it are still never changed.

## Cliff wall order follows the picker's picture

- mountainWallPiece() (js/autotile.js) now builds a column the way the
  Mountain picker lays it out, top to bottom: the FRONT row
  (top-left-wall / bottom-mountain-1..4 / top-right-wall) right under the
  plateau, then top-wall, then center-wall repeated, and the end is always
  the foot (bottom-outer-wall in the middle, bottom-wall-1/6 at the sides).
  One wall = just the foot; the front row only shows once a second wall is
  laid under it. bottom-mountain-* are wall pieces now (MTN_WALL_RE); the
  plateau above a wall is left as its own flat bottom-inner piece.
- Revised: the FRONT pieces (top-left-wall / bottom-mountain-1..4 /
  top-right-wall) are the PLATEAU's bottom row, not a wall row — the plateau
  tile right above a wall column turns into its front piece
  (mountainFrontPiece()), so even one wall shows the shaded rim. Under it:
  one wall = the foot; two = top-wall + foot; more = top-wall, center-wall…,
  foot. MTN_WALL_RE no longer includes the front pieces.
- Revised again: the first wall under the front is always top-wall (a foot
  right under the front swallowed the corner); the foot shows from the
  second wall on, always at the bottom, center-wall in between.
- Front corners: the plateau tile next to the face's end takes
  bottom-mountain-1 (left) / bottom-mountain-4 (right), so with
  top-left/right-wall they make the rounded corner of the picker's picture
  instead of a straight cut. Laying a wall re-tiles ±2 columns around it.

## Cliff wall pieces joined exactly as named in the inventory

- js/autotile.js MTN_FACE / mountainFacePos(): every row of a wall face
  picks its piece by column position (left end, next to it, middle
  alternating, next to the right end, right end):
    plateau's last row: bottom-inner-mountain-1 | -2 | -3/-4 | -5 | -6
    front (1st wall):   top-left-wall | bottom-mountain-1 | -2/-3 | -4 | top-right-wall
    wall (duplicated):  top-wall-1 | -2 | -3/-4 | -5 | -6
    foot (automatic):   bottom-wall-1 | bottom-outer-1 | -2/-3 | -4 | bottom-wall-6
  The front is the first wall row again (under the plateau's bottom-inner
  row); the foot is added by itself under the last wall (autotileAddFoot())
  and laying a wall on it pushes it down.

## Mountain / Mountain Wall inventory slots

- js/inventory.js: two alias items, `mountainPlateau` ("Mountain") and
  `mountainWall` ("Mountain Wall"), with `autoAlias` = the real tile they
  lay. js/autotile.js swaps the held type to the alias for the lay (so all
  the usual rules + auto-tiling apply) and layerForType()/
  layerNumberForType() follow the alias. The "Mountain Tiles" slot keeps
  its picker for laying any piece by hand.

## Mountain = its sheet, exactly

- The Mountain picker picture is the original sheet again
  (bottom-edge-mountain-* stay defined for the auto-tiling but are no
  longer in the picture).
- Walls: 1st laid = front, 2nd = top-wall, then center-wall; the foot is
  automatic (autotileFixFoot(), `autotileFoot` per world, saved with
  autotileOwned as "foot:<world>"): one tile (bottom-wall-1/-6) at the
  face's ends, two in between (bottom-wall-2..5 + bottom-outer-wall-1..4),
  so the bottom curves in like the sheet. Laying on/under the foot turns it
  into wall and the foot moves down.
- Plateau: `fullDiag` — diagonals count even where a side is open, so the
  corner pieces tell apart (top-mountain-1/4 vs top-inner-mountain-1/6);
  bottom-inner pieces are only the row over a wall face.
- Laying the sheet's own shape (plateau 4 then 6 wide, 3 wall rows) gives
  the sheet back tile for tile (bar which plain centre variant is used).
- Walls may now be laid anywhere, with or without mountain above (per
  request — laying the wall rows first, then the plateau over them, keeps
  the sheet's pattern too). The plateau laid over a wall row still becomes
  the bottom-inner row.
- The FRONT row (top-left-wall / bottom-mountain-1..4 / top-right-wall) is
  the mountain's, not the wall's: a plateau tile right on a wall becomes its
  front piece, the one above that the bottom-inner piece. A wall is only ever
  top-wall / center-wall / foot — filling a gap between walls no longer turns
  the new ones into front pieces. MTN_WALL_RE excludes the front pieces.
- top-left-wall / top-right-wall are WALL pieces (only bottom-mountain-1..4
  are the mountain's front). A face's end column that starts a row higher
  than the wall beside it (the sheet's curve) gets top-left/right-wall on
  top, then top-wall-1/-6, then center-wall-1/-6, foot bottom-wall-1/-6;
  the plateau tile over it is bottom-inner-1/-6. A lone wall in its row
  takes the side the mountain is on (mountainFacePos()).
- Laying the sheet's shape (end walls one row higher, mountain front between
  them) gives the sheet back tile for tile; a flat face (all walls starting
  on one row) gets top-wall-1/-6 at the ends under bottom-inner-1/-6.
- Dirt stairs under a mountain tile: it counts as filled below (S, SE, SW —
  mountainStairsAt()), so the tile runs straight into the stairs with no
  rim/curve, and no front/bottom-inner swap. Laying or picking up stairs
  re-tiles the (player-laid) mountain tiles right above them.
- Stairway cut into a cliff: the bottom-inner tile over a wall face's end
  column only takes the rimmed end piece (-1/-6) when the mountain stops
  there; if the mountain carries on past it (over the stairs) it takes a
  plain middle piece (-3/-4), so the plateau runs straight across the top of
  the stairs. Same result whichever is laid first, stairs or mountain.
- js/camera.js drawMountainInnerBacking(): a cliff wall tile with dirt stairs
  right beside it is drawn over a dark rock-coloured square
  (MOUNTAIN_INNER_BACKING, the wall art's darkest tone), so the gap its
  rounded side leaves next to the stairs reads as shadowed rock, not a hole
  to the ground. The cliff's outer sides are unchanged.

## Heavier snow on leafy trees and cut stumps

- tools/build_snow_trees.py -> assets/items/trees/snow/<name>_snow.png for
  the 8 leafy trees and the 5 cut stumps/trunks: snow on top of every leaf
  clump (open air / outline / clearly shadowed pixel above it), a 1px lip
  on the outer outline, light frost, a few flakes; a stump's light cut face
  is snowed over. js/snowground.js SNOW_TREE_ART uses these while it snows;
  the bare noLeaves trees keep the run-time snow cap.
- Revised: the leafy trees' winter art (tools/build_snow_trees.py winter())
  re-shades the LEAVES themselves instead of pasting snow on top: each leaf
  pixel by its brightness — lit clump tops turn to snow (white/ice-blue
  ramp), shaded undersides keep the tree's own colour cooled down; trunk
  slightly frosted, outline a touch bluer. Trunk pixels = brownish colours
  used in the bottom rows of the art.

## Force a weather for testing; snowy leaf bits

- js/config.js `let FORCE_WEATHER = null;` — set to "Sunny" / "Cloudy" /
  "Rainy" / "Thunderstorm" / "Snow" (or live in the console:
  FORCE_WEATHER = "Snow") and getCurrentWeather() (js/calendar.js) returns
  it every day; null = the normal daily roll again.
- js/plantfx.js treeLeafColors(): while it snows, the bits that fall off a
  tree (chop shake, wind) are snow-white, matching the winter tree art.

## Winter bushes, flowers, mushrooms, fallen leaves

- tools/build_snow_trees.py also writes assets/bushes/snow/*_snow.png and
  assets/flowers/snow/*_snow.png: the bushes get the trees' winter leaves
  (no trunk), the flower bushes / mushrooms / flowers keep their colours
  with snow on their tops (a thin cap on the tiny flowers), the fallen
  leaves get a light dusting.
- js/snowground.js snowTreeIcon() serves them while it snows
  (SNOW_PLANT_RE: bush*, decoFlower*, leavesFloor — path = the icon's own
  path with /snow/ and _snow), and drawGroundItemAt() (js/camera.js) now
  asks it too, so the overlay-layer mushrooms/flowers/leaves swap as well.
  Bushes sway/shake with their winter art (drawObjectLayerItemRaw()).

## Old grass -> grass_tile; winter houses, lamp posts; snow painted in

- js/autotile.js migrateOldGrass(): every old grass tile (grass,
  grassInner, grassL/R/TC/BC/TL/TR/BL/BR) becomes the grass_tile piece its
  neighbours call for (old grass, grass_tile and painted ground grass all
  count). Runs every 1.5s if a world still has old grass (so on load and
  after switching worlds); saved like any tile. The town save had ~3,000.
- tools/build_snow_world.py: winter art painted INTO the drawing (no
  outline/stroke added): roofs re-shaded into snow by their own brightness
  (roof = each column's top run in the roof's own colours), chimney tops /
  gable peaks, lamp-post arms, flower and mushroom tops re-shaded the same
  way. Houses: cottageLog/Plaster/Brick, guardHouse, groceryStore,
  house1-3; lamp posts incl. lit + left versions.
- js/snowground.js snowArtFor(img): any icon under bushes/, flowers/,
  outdoor/postlight*, buildings/exterior/(cottage|grocery|guard),
  items/house/ gets <dir>/snow/<name>_snow.png while it snows;
  nightSwapFor() (js/camera.js) uses it for the lit lamp too.

## Shore grass, port snow, tree shadows

- migrateOldGrass() also turns the port set's plain land squares
  (portI2/I4/I6 — same green) into grass_tile; port shore pieces count as
  grass for the neighbour test, so they join without a seam.
- tools/build_snow_world.py: port_* tiles get winter art (their grass
  pixels take the snow tile's pixels at the same spot; sand/water stay);
  snowArtFor() covers assets/items/tile/port_*.
- assets/shadows/: the user's Shadows.png cut into one file per shadow
  (ellipse_big/medium/small_a/small_b/tiny, blob_a/b, canopy_big/medium/
  small). js/camera.js drawTreeGroundShadows() draws TREE_SHADOW_FOR[type]
  under each tree (canopy shapes for leafy trees, ovals for bare trees /
  stumps / trunks), after the ground layers and before the objects; alpha
  follows getDayFactor(), so they're daytime only and fade at dusk.
- Tree shadows move with the tree: plantFxShadowShift() (js/plantfx.js)
  gives the sideways shift for the wind lean / bush sway (about half the
  top's lean — it's the canopy's shadow) and the chop shake (all of it);
  a tree being felled has its shadow swing out the way it falls, stretch
  along the ground as it lands and fade with it.

## Grocery hours, townsfolk sleep in their beds

- Grocery (js/citizens.js): open Monday-Friday 08:00-18:00
  (isGroceryWorkday(), isGroceryOpen()). J sets off from home at 07:00
  (CITIZEN_SHOPKEEPER.leave) and at 08:00 is put at his post behind the
  counter wherever he got to (shopkeeperToPost()); on the weekend he
  doesn't go and leaves the shop if he's in it. The door
  (tryPlayerEnterInterior(), js/interior.js) is shut whenever the grocery
  isn't open: "Sarado ang grocery. Bukas Lunes-Biyernes, 8:00-18:00."
- Sleeping: from CITIZEN_SLEEP_HOUR (20:00) to 06:00 every townsperson at
  home goes to a bed in their house (Single Bed = 1, Double Bed = 2 side by
  side, Big/Small Bed = 1 — citizenBedSlots()) and sleeps: walks to the
  foot of the bed if the player is in that room, otherwise (or after 20:30)
  is simply in it. drawSleepingCitizen(): their own sprite with the head on
  the pillow, the bed's lower part (blanket) redrawn over them, a slow
  breath and a drifting "z". They wake at the foot of the bed at 06:00. The
  soldiers stay outside.

## Sleeping faces; crops need watering

- drawSleepingCitizen() uses each townsperson's own closed-eyes art
  (assets/npc/Citizen_X/sleep/Sleep_Face.png).
- js/farm.js: a crop only grows while its soil is wet; on dry soil its
  growth stops and a dry clock (`crop.dry`) runs — FARM_DRY_DIE_HOURS (12
  in-game h, ~7.5 real min) dry and it withers (`crop.dead`, withered
  frame, clickable, no loot: "Natuyo na ang tanim"). Every watering puts the
  dry clock back to 0 and growth carries on; the soil shows wet again. A
  water drop floats over a thirsty crop: blue, then orange (40%), red (75%).
  Ripe crops don't need water (they still rot after FARM_ROT_HOURS).
- Unused holes grow back: tilling remembers the ground (`plot.orig`: the
  grass tile and/or painted grass). A plot with nothing planted —
  never planted, or emptied by a harvest (`plot.emptySince`) — for
  FARM_REGROW_HOURS (24 in-game h) loses its Dirt Rake and gets that
  ground back (farmRegrowEmptyPlots(), js/farm.js).
- Sack badge: a clear "n / 20" pill with a fill bar ("(sarado)" when
  closed) over each sack within 3 tiles — an empty sack reads "0 / 20".
- Deposit effects (socketDepositFx(), js/farm.js): the sack puffs up and
  settles back, the crops fly into it from the player in arcs, sparkles pop
  out of its mouth as each lands, and "+N" floats up.
- Sack deposit effects (js/farm.js socketDepositFx()/updateSocketFx()/
  drawSocketFx()): each time crops go in, the sack puffs up and settles
  back, up to 8 of the crops fly from the player into it in little arcs,
  sparkles pop from its mouth as each lands, and "+N" floats up. The sack
  label shows "n / 20" with a fill bar (green, red when full).

## Seeds from harvests; the grocery buys wood and stone

- js/farm.js: every ripe harvest also drops that crop's seeds — 2 (60%),
  1 (25%) or 3 (15%), popping out like the crop.
- GROCERY_STOCK (js/roomCustomizer.js) has `sell: true` rows: Wood Log 3
  gold, Stone Chunk 2 gold each. renderNpcShopGrid() (js/npc.js) shows
  them as "+N (meron: X)" with Sell (one) and All buttons -> sellToNpc().
  woodLog / stoneChunk are no longer `unlimited` (they're money now, so
  laying one uses one up and the inventory shows the real count).

## Minimap stays on the map

- js/hud.js drawMinimap(): the dial's window is clamped to the current
  world's size (worldW()/worldH() — the wild world is smaller than the
  town), so near an edge it stops at the border and the player's arrow
  moves off-centre (kept inside the round dial) instead of showing the
  dark/brown nothing past the map; only the map's own part of the ground
  canvas is drawn. Indoors it centres on where you went in. The full map
  (drawFullMapBase()) uses the current world's size too.

## Citizen_P — farmer townsperson

- assets/npc/Citizen_P/: black hair (sides down to and hugging the ear in
  side view), white long-sleeve shirt, brown overalls with gold strap
  buttons, dark brown boots. Same file set as Citizen_F: idle/ (Idle,
  Idle_Left, Idle_Down, Idle_Up), walk/ (Walk, Walk_Left, Walk_Down,
  Walk_Up), sit/ (Sit, Sit_Left, Sit_Front, Eat_{Meat,Spoon,Mug},
  Eat_Front_{Meat,Spoon,Mug}), sleep/Sleep_Face.png.
- Idle/walk are painted straight onto the bald Body_A base sheets
  (assets/pixelcrawler/source/Entities/Characters/Body_A/Animations/), so
  every frame keeps the base pose; sit/eat are the player's sitv/sith/
  Sit_Eat sheets recoloured into this outfit with the top knot removed.
  _Left files are per-frame flips of the right-facing ones.
- Registered like the other front/back citizens: "P" added to the citizen
  art loop + CITIZENS_WITH_FRONT_BACK (js/assets.js), CITIZEN_IDS
  (js/citizens.js) and CUSTOMER_NPC_LOOKS (js/customers.js) — so it
  wanders, sits, goes home at night, shops, and can show up as a tavern
  customer, all through the existing citizen code.

## Player wears the farmer look too

- Every player sheet in assets/sprites/ (idle, walk, run, collect, crush,
  slice, pierce, fishing, watering, hit, death, carry_*, Carry_Order, sit,
  Sit_Eat) is now the same farmer as Citizen_P: black hair, white shirt,
  brown overalls (straps + gold buttons from the front), dark boots. The
  player's old shirt/pants/shoe colours were mapped straight onto the new
  outfit, the top knot removed, and the new hair drawn on the head found in
  each frame (matched against the bald head outline) — arms, hands, tools
  and food in front of the head are left alone. Death's lying frames only
  get recoloured. Sizes, frame counts and positions are unchanged, so no
  code changed.
- Side-view hair: the back now follows the head's curve and tucks in
  toward the nape behind the ear instead of a straight vertical edge (same
  for Citizen_P).
- assets/interior/asesprite/bigbed-sheet.png: the sleeping head in the big
  bed got the same hair.

## Baggy clothes (player + Citizen_P)

- The farmer outfit is loose now: in every frame the sleeve outline is
  pushed 2px and the overall legs 1px outward, always away from the body's
  centre line (so the gap between the legs and between arm and body never
  closes); the new edge takes the cloth's shadow tone, and the pant leg
  row resting on a boot gets a dark fold so the legs bunch over the boots.
  Hips/torso keep their shape. Same frame sizes and positions.

- Side view fix: the chest and back no longer bulge — in side frames only
  the arms (outside the torso columns L+4..L+10) get the loose sleeve, 1px.
  The overalls show from the side again: a bib over the FRONT of the chest
  (L+7..L+10 from k = 3 below the chin line), a strap running over the
  shoulder ((k1, L+6), (k2, L+7)) and a gold button at (k3, L+8); the back
  of the shirt stays white down to the waist.

## Citizen_Q — the player's old look as a townsperson

- assets/npc/Citizen_Q/: the player's original red shirt, grey pants and
  shoes exactly as drawn, but with the new black hair (top knot removed,
  same hair as the player/Citizen_P, curved back in side view). Built from
  the ORIGINAL player sheets (Idle, Walk, sitv/sith, Sit_Eat); same file
  set as Citizen_F/P incl. sleep/Sleep_Face.png. Registered as "Q" in the
  citizen art loop + CITIZENS_WITH_FRONT_BACK (js/assets.js), CITIZEN_IDS
  (js/citizens.js) and CUSTOMER_NPC_LOOKS (js/customers.js).

- bigbed-sheet.png redone: the bed's own head art is a different (smaller)
  head than Body_A, so the drawn-on hair didn't line up. Now each frame is
  the bald bed (bigbed-sheet_bald.png) with the player's EXACT front-idle
  head (new Idle_Down frame 0, rows 0..31) pasted in, eyes aligned
  (dx -8, dy -14, +1 when the bald head sits a row lower), clipped at the
  blanket's top row so the blanket stays over the chin; frames whose bald
  head has its eyes shut get the closed-eye version of the head.

## Chopping keeps the tree solid; stones shake; pebbles always underfoot

- No see-through on the tree being chopped: isTreeBeingChopped(col, row)
  (js/camera.js) makes shouldFadeForOcclusion() — which now also takes
  col,row from both callers (drawObjectLayerItemRaw() and the relight
  occluder list) — return false for the tree that is player.harvestTarget
  mid-swing, or player.chopTree (set on every slice at a tree in
  updatePlayer(), js/player.js) while you stand still within
  CHOP_KEEP_SOLID_MS (1.5 s, counted from the end of the last swing).
  Moving off clears it and the normal fade applies again. Every other
  tree behaviour (fade on other trees, shake, cracks, felling and its
  fade-out after landing) is unchanged.
- Stone shake: resolveHarvestHit() (js/resources.js) calls
  triggerStoneShake() for `breakAnim: "crush"` resources on every pickaxe
  hit — plantWobbles kind "stone" (js/plantfx.js): STONE_SHAKE_PX 1.5,
  STONE_SHAKE_FREQ 70, STONE_SHAKE_SECONDS 0.32, a sideways tremble of the
  whole rock through applyPlantFxTransform(); its ground shadow follows
  (plantFxShadowShift()).
- Pebbles: stoneXXS and stoneDecor1-5 carry `pebble: true`
  (js/inventory.js); renderWorldObjectsSorted() sorts them at -Infinity,
  so the player, NPCs and animals always draw over them.
- index.html script versions bumped to ?v=20261008n.

## Felled trees end as an L; bushes never see-through

- js/plantfx.js treeFellGeometry(type): the cut is now the TOP of the stump
  the tree turns into (its resource.replaceWith art: top opaque row, and its
  width over the top 3 rows), capped at 60% of the tree's height; falls back
  to treeTrunkSpot() if the art can't be read. startTreeFall() hinges the
  falling part on the stump's top OUTER corner on the side it falls to
  (pivotX = centre + dir * half-width, pivotY = ground - stump height), draws
  only the art above that cut (srcH), and fellDrop() sinks it by the stump's
  height as it swings flat (cubic in the angle), so it lands on the ground
  straight out from the stump's side — stump up, log flat: an L. Nothing of
  the falling part overlaps the stump any more. landingBurst() (snow puff,
  leaves, chips, wood drop) uses the ground line (f.groundY). Applies to every
  choppable tree (every non-stump with breakAnim "slice": thin/tiny/medium/
  big, green/light green/orange/red/yellow, no-leaves, and their snow art).
- shouldFadeForOcclusion() (js/camera.js): any `bush*` item never fades.
- index.html script versions -> ?v=20261008o.

- Felling revised (stump ring was showing next to the log): the hinge is
  now the stump's top corner on the side AWAY from the fall
  (pivotX = centre - dir * half-width), with no drop — the log comes to rest
  lying across the stump's top, its square-cut end flush with the stump's
  far edge, drawn in front of the stump (sortY +0.5) so the stump's round
  cut face is hidden until the log fades. Effects land on the log's centre
  line (groundY = cut + half-width). index.html -> ?v=20261008p.

- Felling revised again: it now falls the OTHER way (dir = -fellDirection(),
  i.e. toward the side the player chops from), still hinged on the stump's
  top corner away from the fall; and the falling part starts `ring` px BELOW
  the stump's top (ring = the stump's round cut face, ~min(1.5 x half-width,
  9) px, kept under cutUp - 2), so its trunk covers that face the whole way
  down and the ring only shows once the log has faded. index.html ->
  ?v=20261008q.
  As it comes flat it rises back by the same `ring` (drop: -ring through
  fellDrop()), so the resting log lies exactly over the stump's top and the
  cut face stays hidden at the end too.

## Felling reverted; dirt pebbles under everyone; animals overlap feet-to-feet

- Per request ("ok na siguro yung dati balik mo na dun") the tree-felling
  animation in js/plantfx.js is back to the ORIGINAL (pivot at the trunk
  spot, falls away from the player, same landing burst) — the L / far-edge
  hinge / ring-cover experiments above (treeFellGeometry(), fellDrop()) are
  gone. The stone pickaxe shake stays. The chopped tree still never fades
  (isTreeBeingChopped(), js/camera.js) and bushes still never fade.
- Small Pixel Crawler Rocks (js/townBuildings.js, TOWN_ART.pc group "Rocks",
  art 16x14 or smaller: the brown "dirt pebbles" pcRocks03/04/09/11/13/17-21
  and their grey twins 07/08/10/12/14) get `alwaysBehindPlayer` (sorted at
  -Infinity, so the player and every NPC/animal draw over them, and skipped
  by the night relight occluders) and `noOcclusionFade`. Their collision
  (art.solid) is unchanged.
- Animals vs characters (js/camera.js drawableOrder(), used by
  renderWorldObjectsSorted()): an animal entry (`animal: true`,
  js/animals.js) and a character entry (player / Maria / customers marked
  `character: true`, citizens carrying `feetY: c.fy`) are compared feet to
  feet — once a character's feet are below the animal's feet, the character
  draws over it. Everything else still sorts on plain sortY (citizens keep
  their 25%-up line against the player and objects).
- index.html -> ?v=20261008r.

- Fix: the feet-to-feet rule now uses the characters' VISIBLE feet. Their
  usual sort point (SPRITE_FEET_FRACTION 0.62) is ~6.2 world px above the
  soles (lowest foot pixel = row 47 of 64), so an animal or bush whose base
  was above the shoes still drew over them. drawableOrder() adds
  CHARACTER_VISIBLE_FEET_EXTRA = (48/64 - SPRITE_FEET_FRACTION) * DRAW_SIZE
  to a character's feet when comparing with an animal (`animal`) or a bush
  (objectLayer `bush*` entries flagged `bush`, sorted on the tile's bottom
  edge). The night relight occluders follow the same rule
  (animalRelightOccluders(), and bushes in relightOccluders()).
  Everything else (trees, houses, stones...) keeps the old sort point.
  index.html -> ?v=20261008s.

## Old terrain tiles merge with newly laid ones

- js/autotile.js: AUTOTILE_MERGE_OLD (terrainGrass, terrainSnow,
  terrainBricks, port) — for these sets autotileCell() no longer skips
  tiles that aren't in autotileOwned, so laying/picking up a tile re-tiles
  the map's own / older neighbours too and their edge pieces join the new
  tile (a filled-in dirt patch no longer keeps a ring of old edges).
  Mountain keeps the old "never touch the map's own tiles" rule.
- autotileFilledFor(): for grass, a neighbour counts as grass if it's a
  grass_tile piece, an old-style grass tile (OLD_GRASS_RE), port land, or
  the painted lawn (isGroundFilled && no groundLayer tile) — same test as
  migrateOldGrass() — so new grass next to the lawn joins it instead of
  growing an edge. Other sets: same-prefix tiles only, as before.
- index.html -> ?v=20261008t.
- Guard: an old (non-owned) tile only re-tiles if its current piece is one
  of the set's own auto-tile candidates — the map's open-water port squares
  (portTL/TR/BR), the shaded grass fills (enter-grass-4..6), snow 6-part
  fills etc. are never swapped. index.html -> ?v=20261008u.

## Mountain rim collision uses the soles

- js/player.js isBodyBlockedAt(): besides the usual feet-line tile test,
  the row under the drawn SOLES (feet line + BRIDGE_SOLE_DROP, ~6 world px
  lower) is tested against solid mountain tiles (isSolidMountainAt():
  terrainMountain* with `collides`, either terrain layer). Walking down onto
  the plateau's top rim / corner the shoes now stop at the tile's top edge
  instead of standing on it. Stairs and bridge tiles are exempt; if the
  soles are already inside a solid mountain row (old save / spawn) moving
  within it is allowed so the player can't get stuck. Player only (NPCs path
  by whole tiles). index.html -> ?v=20261008v.

## Front hair: curved, thinner sides

- Front (Down) hair template redone: full at the temples, then both sides
  curve in onto the head's outline from 6 rows below the top and end as a
  thin 1px lock beside the face (2 rows), instead of a straight 2px-wide
  column down to the cheeks. Fringe gaps filled so no skin speckles show on
  the base-body NPC. Rebuilt with it: every player sheet (assets/sprites),
  Citizen_P, Citizen_Q (incl. Sleep_Face) and bigbed-sheet.png (the exact
  new front-idle head pasted on the bald bed again).

## Grey neck line

- The black chin/neck line between the face and the shirt is now the
  shirt's darkest grey (140,136,142) — neck_grey() in the sprite build:
  only black pixels on the chin row with cloth (shirt/overalls) right below
  change, so hands, tools and the head's side outline stay black. Applied
  to every player sheet (front, side, back, all actions), Citizen_P, and
  the big-bed sleep head (pasted from the new front idle). Citizen_Q (red
  shirt, old look) keeps its black line.
- Revised: instead of one flat grey line, the chin row over the shirt now
  copies the shirt pixel right under it (white / grey / dark grey, and the
  overalls' brown where a strap runs up), with the two end pixels in the
  shirt's dark grey — it reads as the top of the shirt, straps carried up to
  the collar. Same sheets as above rebuilt.

## Tilled soil (Dirt Rake) auto-tiles

- assets/items/vegetables/dirtrake_auto.png: 16 pieces of 24x24 (tile +
  4px rim all round), built from dirtrake.png by quadrants — a quadrant with
  both its sides open is the clod's own corner, one side open uses the clod's
  matching edge band, both closed uses a seamless fill (art rows 8-15 x2).
  Index = N 1 | E 2 | S 4 | W 8 (sides with tilled soil too).
- js/farm.js dirtRakeMask()/drawDirtRakeAuto(): drawDirtLayer() (js/camera.js)
  draws every `dirtRake` with its piece (offset -4,-4) instead of the single
  22x20 clod; the wet overlay (drawFarmSoil()) draws the same piece darkened
  (wetRakeAutoArt()). A lone tile still looks like the old clod; neighbours
  join straight, open sides keep the lumpy edge and rounded corners. Falls
  back to the old art if the sheet isn't loaded. index.html -> ?v=20261008w.

## The mines: 10 cave levels with mobs, combat and click-to-pick-up drops

- Levels: tools/build_mine_levels.py -> js/mineLevels.data.js (loaded right
  after townBuildings.data.js). mine1_room..mine10_room join
  TOWN_ART.caveLayouts (same cave format; each has `depth`, `far`, `path`),
  and TOWN_ROOM_BLUEPRINTS gets a caveBlueprint() for each
  (js/townBuildings.js). Long serpentine caves (3 corridors + 4 caverns +
  a far chamber), 56x40 tiles at level 1 growing to 74x43 at level 10,
  lit with post lights, rocks/mushrooms as decor. The tunnel's deep chamber
  gets a new opening C (MINE_TUNNEL_LINK; tunnel_room's version changes so
  a saved tunnel room is rebuilt with it). Openings: tunnel C <-> mine1 UP,
  mineN DOWN <-> mine(N+1) UP (CAVE_LINKS, js/mines.js). Each level's
  doormat still leads outside the tunnel entrance.
- Mob art (original, not the Mobs pack — only its frame sizes/counts were a
  guide): tools/mobs/*.py -> assets/mobs/<type>/{idle,move,attack,death}.png
  (square frames, strips; 32px: slime, bat, shroom, beetle; 48px: golem,
  golemBoss = recoloured crystal golem) and assets/mobs/icons/*.png.
- js/mines.js: MINE_TYPES (stats, art foot row, fps, drops), MINE_SPAWNS
  per level (deeper = more and tougher; hp +12%/dmg +10% per level, boss
  fixed). Mobs spawn >10 tiles from the start, wander, chase within
  `aggro`, attack in `reach` (the hit lands on hitFrame if still in reach,
  0.6s invulnerability after a hit, red flash + red number). At 0 health:
  toast, half health, faded out of the cave.
- Combat: mineIndoorUpdate() (called from updatePlayer's indoor branch,
  js/player.js) — F in a mine swings Pierce with the Cave Sword (itemDefs
  caveSword, weapon.damage 12) or a bare Hit (5); resolved half-way through
  the swing on every mob in front (±15% damage, 12% crits x1.8 in yellow),
  knockback + white flash. Health bar (small text "hp/max", boss shows its
  name) under each mob's feet; damage numbers rise over the mob.
- Drops (MINE_TYPES[..].drops: slimeGel, batWing, glowCap, crystalShard,
  golemCore, stoneChunk, goldCoin): tossed and bounced twice like tree wood,
  then they WAIT. A left click on one (capture-phase listener, within
  MINE_PICKUP_RANGE) starts its vacuum into the player; then grantItem() /
  player.gold. Items are in itemDefs (startCount 0) so they're in the
  inventory. Drops vanish after 5 min; killed mobs respawn after 2 min once
  you're 12+ tiles from their spot. Mobs/drops aren't saved.
- Drawing hooks in renderInteriorScene() (js/camera.js): mobs + resting
  drops join the depth sort (mineIndoorDrawables()); drawMineOverlay() after
  the light washes draws flying drops, numbers and the hurt flash.
- index.html -> ?v=20261008x (+ js/mineLevels.data.js, js/mines.js).

## Cave floors get texture

- js/roomCustomizer.js decorateCaveFloor(): every room with floor "cave"
  (the old caves, the tunnel and all ten mine levels) gets, baked into its
  picture: patches of raked dirt (random-walk clusters ~1 per 45 floor tiles,
  plus lone clods) drawn with the farm's auto-tiled Dirt Rake pieces
  (assets.dirtRakeAuto) recoloured to the cave's redder brown
  (caveRakeArt()), pebbles and hairline cracks. Seeded from the room's tile
  set, so a cave always looks the same; paint only (no collision). Keeps
  clear of the doorway and the row under the back wall. If the rake art
  isn't loaded yet when a cave is built, the caves are repainted once it is.
  index.html -> ?v=20261008y.

## Mobs lit like the animals, weapons, shops, stamina everywhere

- js/mines.js: each mob has `lit` (0..1) eased toward how far it stands in
  the player's light (r 96) or a postLightLit's (r 80); mineRelightList()
  joins drawCharacterNightRelights() (js/camera.js) and paints its colours
  back by night * lit, like the farm animals. mineRelightOccluders() cuts
  mobs in front out of the player's relight. Mobs sort at
  m.y - CHARACTER_VISIBLE_FEET_EXTRA (same visible-feet rule as animals).
- Tougher mobs (x2.5 hp: slime 55, bat 35, shroom 80, beetle 120, golem
  280, boss 1100). Damage = equipped weapon.damage, bare hands 3.
- Weapons (js/inventory.js): woodSword 6 (start with 1, the old wood_sword
  art), ironSword 12, goldSword 20 (icons in assets/mobs/icons; caveSword
  removed). Potions: potionHealth (+40% hp), potionStamina (+60%),
  potionElixir (full hp + stamina, +30 food); consumeItem() now also takes
  consumable.staminaPercent.
- Shops (js/shops.data.js + js/shops.js, art: tools/build_shop_buildings.py):
  equipShop / potionShop houses (TOWN_HOUSE_INFO, rooms equip_room /
  potion_room — ready-made 10x6 floor with a counter). ensureShopsBuilt()
  puts them on the main map at SHOP_SITES (door tiles 8,38 and 24,38, over
  the west road) if missing, clearing trees/bushes/stones/decor in the spot
  (post lights kept). Keepers Smith / Alchemist (assets/npc/Shop_*/
  Idle_Down.png, recoloured farmer) stand behind the counter day and night;
  clicking them opens openNpcShop() with EQUIP_STOCK / POTION_STOCK (both
  also buy mob drops). The popup opens on the click, not the mousedown.
- js/npc.js enterNpcHouse(): only closes the shop popup if it's Maria's own
  (it was closing every shop each time she walked home).
- js/interior.js: running (Shift) and the stamina drain/regen/exhaustion
  work indoors (rooms, caves) exactly like outdoors; food already drains
  everywhere (updatePlayerStats(), main loop).
- index.html -> ?v=20261008z (+ js/shops.data.js, js/shops.js).

## East worlds, outdoor mobs, EXP / levels, level-locked weapons

- tools/build_east_worlds.py -> js/eastWorlds.data.js (EAST_WORLDS.east1 /
  east2, 80x46 like the wild world): mountain ring with a west pass (and an
  east pass on east1), mesas inside, dirt trails, a light scatter of trees,
  bushes, stones; lamps at the passes. js/worlds.js now has WORLD_DEFS /
  EXTRA_WORLDS (wild, east1, east2): worldW/H, switchWorld defaults and the
  save (d.worlds.<id>) work for any of them. Portals: town east edge
  (MAIN_EAST_PORTAL, cols 186-187 rows 63-65, walk right) -> east1 west pass;
  east1 east pass -> east2; west passes lead back. js/shops.js keeps the
  town gate clear and puts a lamp either side of it.
- js/mines.js works on ZONES (currentMineRoom() now returns a zone: a mine
  room or an east world, key "world:<id>"): MOB_WORLDS east1 "Highlands"
  mobs Lv 3-6, east2 "Crystal Ridge" Lv 7-11; mine N = Lv N..N+1. Mob level
  scales hp +15%/lvl, dmg +10%/lvl, exp +35%/lvl (boss fixed Lv 15). The
  health bar text shows "Lv N hp/max". Outdoors mobs collide like the player
  (isBodyBlockedAt), spawn off the cliffs and away from the passes, are lit
  by animalLightSources(), and F only swings at them when one is within
  40px (otherwise F still chops/breaks). mobOutdoorUpdate() is called near
  the top of updatePlayer(); drawables/overlay hooked into the outdoor
  render. Blacking out outdoors sends you to the town's east gate.
- EXP: every kill gives the mob's exp (+N EXP floats up); maxExp 100 x1.35
  per level; level up = +8 max health, +4 max stamina, full heal, toast that
  names any weapon unlocked. The HUD exp bar reads "Lv N exp/max". level,
  maxExp, maxHealth, maxStamina are saved (save wrappers in js/mines.js).
- Weapons have weapon.reqLevel: wood 1, iron 5, gold 10, crystalSword
  (new, dmg 32, 1300 gold) 15. equipWeapon()/buyFromNpc() refuse locked
  ones, the shop row shows "🔒 Lv N", and a locked weapon hits like bare
  hands. index.html -> ?v=20261009a (+ js/eastWorlds.data.js).

## Cave lighting, lit Wall Candles, bluer night

- assets/buildings/furniture/bldWallCandle.png now has a flame (12x16 ->
  12x20, bottom-anchored as before) and itemDefs.bldWallCandle.lightGlow
  (small) is set in js/shops.js.
- js/camera.js drawIndoorLampGlows(room, strength): indoors every decor
  piece with a lightGlow (postLightLit, Wall Candles) adds its circle to the
  shared light buffer (postGlowCanvas; no shadows), at
  getIndoorLighting().candle — before flushSceneLights() in
  renderInteriorScene(). (Before, room lamps never shone at all.)
- Caves (any room whose custom.floor is "cave": tunnel, old caves, mines):
  getIndoorLighting() is wrapped to a fixed { ownerDark: CAVE_DARKNESS 0.78,
  relight 0.78, candle 1 } — always the same blue-ish dark with every lamp,
  wall candle and the player's own candle lit, day or night.
- Night colour bluer, Stardew-like: SKY_KEYFRAMES night (18,30,86) at
  NIGHT_SKY_ALPHA 0.6 (was (10,15,40) @0.63), ROOM_NIGHT_SKY_COLOR to match,
  NIGHT_BLUE_TINT (52,86,200,0.2) (was (40,70,160,0.16)).
  index.html -> ?v=20261009b.

## Cave camera + fog

- renderInteriorScene(): in a cave (custom.floor "cave") the camera stays
  centred on the player (no clamping to the cave's edge); the room picture
  is drawn only where it's on screen and everything beyond it is black.
- drawCaveFog(): after the lights and relights, a radial fog round the
  player — clear to CAVE_FOG_CLEAR (46 world px), a dark silhouette by
  CAVE_FOG_SILHOUETTE (92, 50%), 82% by CAVE_FOG_DARK (140), black by
  CAVE_FOG_BLACK (185); outside the cave's picture is filled black. Damage
  numbers / flying drops (drawMineOverlay()) are drawn after it.
  index.html -> ?v=20261009c.

## Road to the east worlds

- js/shops.js ensureEastRoad(): once, on the main map, lays a 2-wide dirt
  road (EAST_ROAD: cols 140-187, rows 63-64) from the town's north-south road
  to the east gate (MAIN_EAST_PORTAL), using the same corner rule as the world
  builders: road cells = groundFill off + no tile; border cells get the
  matching terrainGrass edge piece (ROAD_EDGE), diagonal-only touches filled
  in, the junction with the old road recomputed. Trees/bushes/stones/tufts
  on the road are cleared (post lights kept). Skipped if already laid.
  index.html -> ?v=20261009d.

## Regrowth knows its world

- pendingRespawns entries carry `world` (js/resources.js); updateResources()
  only regrows entries of the current world (older entries = "main") and
  runs in every world now (the mainWorldOnly wrap in js/worlds.js removed).
  Before, a stump cleared in the wild world could regrow its tree at the same
  col,row in the TOWN. A regrowth whose tile is taken by then is dropped.
  index.html -> ?v=20261009e.

## Town trees protected, fewer cave rocks, tall flowers overlap

- js/resources.js findHarvestableTarget(): in the town (currentWorld
  "main") trees and stumps are skipped (isProtectedTownTree()), with a toast;
  stones still break. Trees are cut in the wild world and the east worlds.
- Fewer big rocks in caves: tools/build_mine_levels.py now puts 1-2
  stoneBig and one tall pcRocks per mine level (was 3-6 + 6); the old caves
  (cave_room, tunnel_room, cave2_room) keep one stoneBig and one tall rock
  each (filtered in js/mineLevels.data.js; their versions change so saved
  caves are rebuilt).
- The tall flowers (decoFlower1/2, "Flower (Tall)", on groundOverlayLayer)
  are no longer drawn flat under everyone (drawGroundOverlay() skips them):
  they join the depth sort with the bushes' visible-feet rule (drawableOrder()
  `bush` flag) and the night relight occluders. index.html -> ?v=20261009f.

## Far worlds (to Lv 80), new mobs, gear + stats, profile (P), click-to-attack

- tools/build_east_worlds.py now also builds east3-east6 (closed rings, no
  passes) and `portals` (warpPortal items placed off to one side, area kept
  clear): east2 "next" -> east3 "back" ... east5 "next" -> east6 "back".
  WORLD_DEFS/worldStore include them; js/gear.js checkWarpPortals() (W on the
  step in front of an arch) links them (WARP_LINKS) and ensureWarpPortals()
  adds a missing portal to a saved world (east2). Portal art:
  assets/buildings/exterior/warpPortal.png (tools/mobs/gear.py).
- MOB_WORLDS: east3 Wolfpine Woods Lv 12-22, east4 Spirit Glade 23-38, east5
  Sunscar Barrens 39-58, east6 Ember Peaks 59-80. New mobs (original art,
  tools/mobs/newmobs.py): wolf, wisp (flying), scorpion, imp. Mobs have DEF
  (armor = 0.6 x level); gold drops scale with level.
- Gear (js/inventory.js): GEAR_TIERS leather/iron/gold/mythril/dragon
  (req Lv 1/10/25/40/60) x Helmet/Gauntlet/Ring/Shield/Boots with `gear`
  {kind, atk, def, spd, crit}; swords add mythril (Lv30, 55), dragon (Lv50,
  90), celestial (Lv70, 140). All sold at the Equipment Shop, locked by
  level (shop shows 🔒, buy/equip refused).
- js/gear.js playerStats(): ATK (weapon or 3 + gauntlets + rings), DEF
  (blocks 0.6 per point of each mob hit), SPD (attacks/s, base 1, +boots,
  wood sword 1.15; also speeds the swing), CRIT (12% + rings, x1.8).
  player.equipment {helmet, gauntletL/R, ringL/R, shield, boots} saved.
- Profile: P toggles a window — idle front sprite in the middle, helmet
  above, gauntlet/ring/shield on the left, gauntlet/ring/sword on the right,
  boots below; stats with descriptions beside it. Click a slot to pick an
  owned item or take it off.
- Click-to-attack: left-click a mob -> player.autoTarget; autoAttackTick()
  (called from mineIndoorUpdate) walks up to it (held movement keys) and
  attacks every 1/SPD seconds until it dies; a red ring marks the target;
  any movement key cancels. index.html -> ?v=20261009h (+ js/gear.js).

## Bosses + Demon set, armour slot, bows, Blacksmith, animated portal, compact profile

- World bosses (js/mines.js, one per east world, fixed level, big, dark
  violet-pink recolours from tools/mobs/demon.py): bossSlime "Slime King"
  Lv10 (east1), bossGolem "Shadow Golem" Lv18 (east2), bossWolf "Shadow Fang"
  Lv28 (east3), bossWisp "Wraith" Lv45 (east4), bossScorpion "Venom Queen"
  Lv65 (east5), bossImp "Demon Lord" Lv85 (east6). Respawn 10-20 min.
  They're the ONLY source of the Demon set (4-8% per piece): demonRing,
  demonBoots, demonGauntlet, demonBow, demonHelmet, demonShield, demonArmor,
  demonSword (itemDefs bossDrop, reqLevel 12-70; never sold).
- Magic: wisp, imp, Shadow Golem, Wraith, Demon Lord hit with magic —
  reduced by MAGIC RES (mres/(mres+100)); physical hits by DEF RES
  (def/(def+100)). Gear gained mres (helmet, armor, shield, demon pieces).
- Slots: the left gauntlet is now the body ARMOR slot (armor kind, 5 tiers
  + demon). Old saves' gauntletR -> gauntlet.
- Bows (weapon.ranged): wood/iron/gold + demon; reach 44 from a point 40px
  in front, an arrow flies to the target (mineArrows); F outdoors swings at
  a mob up to 110px away with a bow.
- Blacksmith house (blacksmithShop, js/townBuildings.js smith_room; art
  tools/mobs/demon.py) at SHOP_SITES 36,38 in town; keeper "Blacksmith"
  (assets/npc/Shop_Blacksmith) sells swords, bows, shields (SMITH_STOCK). The
  Equipment Shop's keeper is now "Armorer": helmets, armour, gauntlets,
  rings, boots (EQUIP_STOCK).
- Portal animates: warpPortal's icon is a canvas redrawn from
  warpPortal_anim.png (8 frames, 10 fps); canvas.src = the still picture for
  the inventory UI.
- Profile (P) is compact (250px): slots round the sprite, then side-by-side
  bars (Health, Stamina, Food, Lv/EXP), then ATK, DEF, MAGIC RES, ATK SPEED,
  DEF RES, CRIT (hover for the description).
- EXP curve: expForLevel(l) = 50 x l^1.5 (recomputed on load).
  index.html -> ?v=20261009i.

## Boss swords, 32px with a violet aura

- tools/mobs/swords32.py: original 32x32 swords (blade built along the
  diagonal, shaded, gold guard, outlined) — Demon Sword (obsidian, hooked
  back spikes, eye gem), Void Cleaver (violet steel cleaver, gold inlay,
  runes), Soul Reaver (leaf-shaped violet crystal). Each: <id>.png (the
  inventory picture, aura frozen) + <id>_anim.png (6-frame pulsing aura +
  drifting sparkles). itemDefs.animStrip names the strip; drawMineDrop()
  animates it for a sword lying on the ground. Drops: Soul Reaver (Wraith,
  4%, Lv40, atk 95), Void Cleaver (Venom Queen, 3%, Lv55, atk 130), Demon
  Sword (Demon Lord, 4%, Lv70, atk 170). index.html -> ?v=20261009j.

## Storm Greatsword replaces the three boss swords; held in the hand

- Removed demonSword / voidCleaver / soulReaver (and their drops/art).
  tools/mobs/stormsword.py: an original 40x40 greatsword (broad steel blade,
  fuller, violet guard and gems), violet aura, lightning cracking both off the
  edges and right across the blade; stormSword.png (inventory, aura only) +
  stormSword_anim.png (8 frames). itemDefs.stormSword: Lv70, atk 170,
  bossDrop (Demon Lord 4%), animStrip, holdSprite.
- js/gear.js: drawPlayer() is wrapped — a weapon with holdSprite is drawn in
  the screen-right hand (HAND_AT per idle/walk/run frame, measured off the
  sheets; mirrored when facing left, exactly like drawPlayer();
  behind the body facing up) while idle/walking/running, only in a mob zone
  (mine level or mob world), never mid-swing. index.html -> ?v=20261009k.

## Boss gear: violet + lightning, and it crackles when worn

- tools/mobs/demongear.py: demonHelmet/Armor/Gauntlet/Boots/Ring/Shield/Bow
  redrawn at 24x24 in the Storm Greatsword's style (violet metal, lavender
  trim, pink gem, aura) — <id>.png (inventory, aura only) + <id>_anim.png (6
  frames with lightning); itemDefs.animStrip set, so a dropped piece animates.
- js/gear.js: drawPlayer() wrapped again — every worn bossDrop piece adds a
  violet aura behind the player and lightning bolts (re-rolled every 90ms) at
  its body part (WORN_SPOTS: head, chest, hand, feet, sides). Everywhere.
  index.html -> ?v=20261009l.

## Boss gear changes the look; Storm Greatsword swing arc; try-out set

- assets/sprites_gear/{helmet,armor,gauntlet,boots}/<same path as every
  player sheet> (tools/sprites/gear_overlays.py, needs the farmer paint.py
  helpers + the original sheets for head detection): a Spartan helm (dome,
  T-shaped face opening / open side, brow band, tall pink plume front to
  back), a violet muscle cuirass on the torso (abs, pecs, collar gem;
  sleeves stay cloth), armoured violet forearms/hands, violet boots with a
  pink trim. js/gear.js wraps drawPlayerSprite() to draw the overlay frame
  of each worn bossDrop piece over the matching sheet frame (mirrored like
  the body; also in the night relight).
- Storm Greatsword: weapon.attackAnim "hit" + swingArc — drawSwordSwing()
  sweeps the sword from over the shoulder down past the front (SWING_ARCS
  per facing, eased), with a violet crescent trail and a tip spark.
- Try-out: grantGearTrial() gives one of each boss piece + the Storm
  Greatsword once (player.gearTrialGiven) and player.gearTrial makes boss
  gear wearable at any level (itemLocked/weaponLocked wrapped); both saved.
  Set gearTrial false to put the level locks back. index.html -> ?v=20261009m.

## One target per hit, attributes (STR/STA/AGI/ACC), hit chance, bows, exp/gold

- js/mines.js resolveMineSwing(): ONE target per swing — player.autoTarget
  (the clicked mob) if in reach, else the nearest in front. Hit chance =
  playerHitChance(m) (js/gear.js): 82% + 1.2%/ACC, -2.5% per level the mob is
  over you (35-99%); a miss shows MISS. Melee lands at once
  (landMineHit()); a bow's arrow flies (updateMineArrows(), drawn in the
  overlay with shaft/head/fletching) and lands on arrival.
- Attributes: player.attrs {str, sta, agi, acc}, player.statPoints (+3 per
  level; older saves get (level-1)*3). STR +2 ATK; STA +8 max health (when
  spent), +1 DEF, +0.8 MAGIC RES; AGI +0.02 attacks/s; ACC +1.2% hit. Spent
  with the + buttons in the profile (spendStat()); saved. The profile also
  shows HIT.
- EXP/gold: mob exp = base x (1 + 0.5 x (lvl-1)), x(1 + 8% per level the mob
  is over you, 0.25..1.6); gold x(1 + (lvl-1)/5). expForLevel = 50 x l^1.75.
- Bows: attackAnim "hit", holdSprite (held upright in the hand in mob
  zones); drawBowShot() raises the bow toward the facing, pulls the string
  with a nocked arrow, then releases. index.html -> ?v=20261009n.

## Metal sets (bronze / iron / emerald / diamond), bow range 3 tiles

- tools/mobs/metalsets.py: helmet/armor/gauntlet/boots (24px, the boss set's
  shapes, plain — no aura/lightning) and a 40px sword per set (the Storm
  Greatsword's blade recoloured), plus worn looks: assets/sprites_gear_<set>/
  <piece>/<sheet path>, recoloured from the boss overlays. iron* gear reuses
  its ids (new art, lookSet "iron"); bronze (Lv5, x1.8), emerald (Lv30, x7),
  diamond (Lv50, x12) are new (lookSet). Swords: bronze 9 (Lv3), iron 12
  (Lv5, now held + swing), emerald 42 (Lv22), diamond 75 (Lv42) — holdSprite,
  swingArc, single-frame animStrip. Sold at the Equipment Shop / Blacksmith.
  wornLookPieces() returns [slot, set] (boss gear: no suffix).
- Bows hit any mob within BOW_RANGE = 3 tiles of the player (js/gear.js;
  resolveMineSwing() ranged branch); click-to-attack stops 3 tiles away; F
  outdoors fires at a mob up to 3 tiles + 8px. index.html -> ?v=20261009o.

## One town portal, side passages, click fix, hover cursor/outline, bow 5 tiles

- Warp portals: only ONE, in the town's top-right among the rocks
  (TOWN_PORTAL 176,12, js/gear.js ensureTownPortal() builds it + a ring of
  rocks, removes any other portal anywhere) -> walk up into it (W) -> east3
  (Wolfpine Woods) at its north passage.
- The far worlds use walk-through side passages instead (tools/build_east_
  worlds.py `passes`, off-centre gaps in the ring + a trail in; layoutVersion
  "v2-<seed>" so a saved far world from the old layout is dropped):
  east2 S(60-63) <-> east3 N(16-19); east3 E(rows 34-36) <-> east4 W(11-13);
  east4 S(16-19) <-> east5 N(60-63); east5 W(31-33) <-> east6 E(13-15).
  js/worlds.js checkSidePasses()/SIDE_LINKS/passSpawn() (arrive 6 tiles in).
- Bug fix: clicking a mob again no longer resets the attack timer (spam-
  clicking sped the swings up).
- Hovering a mob: a sword cursor (SWORD_CURSOR) and a light outline round the
  mob (drawMob(), white silhouette offset 1px each way).
- Bows: BOW_RANGE 5 tiles; the shot plays 1.7x faster; arrows fly faster.
  index.html -> ?v=20261009p.

## Cursor fixes, close-range pickup, wizards + soldiers, world map

- Sword cursor mirrored (tip up-left = hotspot 4,4). Hovering a resting drop
  shows a hand (pointer); MINE_PICKUP_RANGE is now 2.5 tiles (walk up to it).
- New mobs (tools/mobs/humanmobs.py, original art): wizard "Dark Wizard"
  (ranged + magic: on its hit frame it throws a homing violet bolt —
  mobShots — that hits when it reaches you) and soldier "Iron Soldier"
  (armoured spearman). In east3 (soldiers), east4 (wizards), east5/east6
  (both).
- js/worldmap.js: "🗺 Map" in the top bar opens a window with two tabs —
  Map (the map you're on drawn from its tiles: grass, dirt, water, mountain,
  trees, rocks, buildings, the portal, you blinking; inside: the room/cave's
  floor plan) and World (every map and how they connect, the town portal's
  dashed link, the caves box, the one you're in highlighted). The minimap's
  own click still opens the picture map (js/hud.js openFullMap()).
  index.html -> ?v=20261009q (+ js/worldmap.js).

## Mobile controls + Capacitor

- js/mobile.js (from the "AdventureNgani Mobile Controls" mockup): on a
  touch screen (or ?mobile=1; ?mobile=0 turns it off) — joystick (8 dirs,
  holds W/A/S/D), Takbo (Shift toggle), ATTACK (F; label/icon follows the
  equipped weapon: ESPADA/PANA), Kuha (E), Hagis (T), Itago (R), weather
  bubble on the minimap (circle, top right; tap = full map as before), Menu
  under it dropping Profile (P) / Bag (B) / Settings (Map, Save, Export,
  Import — the top toolbar is hidden on mobile and these click its buttons).
  All buttons dispatch the same keyboard events, so behaviour is identical.
  Hotbar zoomed to 0.66; no scroll/zoom/long-press.
- Capacitor 7: package.json (scripts build:web / cap:sync / android / ios),
  capacitor.config.json (com.adventurengani.game, webDir www),
  scripts/build-web.mjs (copies index.html, style.css, js, assets into www,
  skipping .aseprite etc.), android/ (generated by `npx cap add android`;
  sensorLandscape, MainActivity full screen + keep screen on). See
  CAPACITOR.md. node_modules/ and www/ are not shipped in the zip.
  index.html -> ?v=20261009r (+ js/mobile.js).

## Shop keepers lit, counter never lit, bright caves, crystals + hidden chests

- js/shops.js: the keepers (Armorer, Blacksmith, Alchemist) carry the same
  candle circle as the player (drawCharacterGlow() in their draw) and get
  their colours back at night (shopKeeperRelightList(), joined into
  drawCharacterNightRelights(); the counter in front is cut out of it).
- js/camera.js: the counter (bartender* pieces) throws no candle shadow
  (collectLightOccluders()) and is cut out of every candle / room lamp
  (counterLightCutouts() -> addSceneLight cutouts) — the bright wedge on the
  counter top is gone.
- Caves lit all over, day or night: CAVE_DARKNESS 0.2 (was 0.78), lamps and
  candles at CAVE_CANDLE 0.45; drawCaveFog() now only blacks out beyond the
  cave's picture (the radial fog round the player is gone).
- js/treasure.js (new, before main.js): every cave (old caves, tunnel, mine
  levels) and Crystal Ridge (east2) get glowing crystal clusters (pcRocks22-24,
  blue light in the shared buffer, twinkles) and 1-3 treasure chests in the
  far ends, among the crystals. Seeded per place (+ refill count); every
  crystal is flood-fill checked so no path is ever cut off; nothing stands on
  wall-edge tiles. Chests are invisible beyond ~2.2 tiles (fade over 1.2 more),
  a faint glint within 4.5 tiles is the only clue. E / click opens: gold +
  2-4 rolls (potions, Crystal Shard, Iron/Gold Ingot, rare swords/bows/armour
  by place level). player.treasure.zones[key] = { gen, opened } saved; all
  opened + 30 min -> a fresh set in new spots. Crystals/chests are solid
  (isInteriorBodyBlockedAt / isBodyBlockedAt wrapped). Art:
  tools/treasure_art.py (assets/treasure/chest_*.png, ironIngot/goldIngot
  icons). New items ironIngot / goldIngot (sold to the shops).
  index.html -> ?v=20261012a (+ js/treasure.js).

## Drops auto-pickup, gear looks off, weapon slung on the back

- js/mines.js updateDrops(): a resting drop within MINE_AUTO_PICKUP (2 tiles,
  feet to drop) flies into the player by itself; clicking still works.
- js/gear.js: GEAR_LOOKS_ON = false — worn helmet/armor/gauntlet/boots (boss
  and metal sets) no longer change the character's look; the boss pieces keep
  only the violet aura + lightning. Flip the flag to bring the looks back.
- js/gear.js: idle / walk / run in a mob zone, the equipped sword or bow is
  slung across the back (BACK_SLING per facing: grip point + blade direction;
  behind the body facing down/sideways, over it facing up), every sword now,
  not only the holdSprite ones. The swing during an attack is unchanged.
  Picture: sword-sa-likod-idle-walk.png in the delivery.
  index.html -> ?v=20261012b. Sword grip lowered 4px (BACK_SLING) -> ?v=20261012c.

## Back sword everywhere, chest window, Blacksmith upgrades +1..+10 with auras, centred arrows

- js/gear.js heldSwordStrip(): the slung weapon shows everywhere (no mob-zone
  rule). drawHeldSword() records the blade's screen line (backWeaponLine) for
  the auras.
- js/treasure.js: opening a chest rolls its loot once into st.loot[i] (saved)
  and opens a 6x3 chest window (#chest-overlay); click a slot -> inventory
  (gold -> player.gold), "Kunin lahat" takes all; leftovers stay; E again /
  Esc / outside click / walking away closes it.
- js/upgrades.js (new, before treasure.js): the Blacksmith's shop popup gets
  an "⚒ Upgrade" button -> #upgrade-overlay. Swords, bows, helmet, armor,
  gauntlet, boots go +0..+10 (player.upgrades[type] = { lvl, el }, per item
  type; saved). Cost upgradeCost(): gold 40 x n^2 x (1 + reqLevel/12), Iron
  Ingot ceil(1.5n), Gold Ingot n-2 (from +4), Crystal Shard n-4 (+6), Golem
  Core n-7 (+9); always succeeds. Bonus upgradeBonus(): +10% of the piece's
  ATK/DEF/MRES per level (+1 DEF per 2 levels on gear), added in a
  playerStats() wrapper. From +4 an element aura (lightning / fire / holy /
  ice / wind, picked in the window, free to change), stronger at +7 and +10:
  glow behind at the body part + particles in front (drawPlayer wrapper);
  the weapon's along the slung blade. Rock mobs / soldiers / golem bosses now
  drop ingots sometimes.
- js/mines.js: a bow's arrow starts at the middle of the drawn bow
  (drawBowShot()), not above it.
  index.html -> ?v=20261013a (+ js/upgrades.js).

## Item info tooltips, spinning gold coin, tougher mobs, 3 sword attacks, hit effects

- js/itemInfo.js (new): hover anything with data-item-type (inventory and
  hotbar slots — set in renderInventory()/renderHotbar(), chest slots, the
  upgrade list) for #item-tip: name (+upgrade), category, description
  (ITEM_DESC or a generic one by kind), stats (damage/ATK/DEF/MRES/SPD/CRIT,
  upgrade bonus, required level, potion/food effects) and, if any shop buys
  it, "Benta: N gold" at the bottom (sell entries of the shop stocks +
  CROP_SELL_PRICE). Touch: shown for 2.2 s.
- tools/coin_art.py: new goldCoin.png icon + goldCoin_spin.png (8 frames).
  js/combat.js: drawMineDrop() draws gold drops as a spinning coin (a little
  pile for 5+), drawMariaPayFx() (js/waiter.js) uses the same coin + glint.
  The HUD's gold_coins.png is unchanged.
- js/combat.js makeMob wrapper: hp x(1 + 0.22(L-1) + 0.004(L-1)^2), dmg
  x(1 + 0.14(L-1)), DEF 0.7L; bosses hp x1.6 x(1 + 0.02(L-1)), dmg
  x(1 + 0.03(L-1)), DEF 1.2L.
- Swords: every sword now plays the body "hit" and one of three attacks at
  random (startMineSwing wrapper, mineSwing.style): overhead slash, wide
  horizontal sweep (squashed ellipse through the front), lunging thrust.
  drawSwordSwing() replaced (swordPose(), SWORD_PIVOT); the trail takes the
  upgrade aura's colour (violet for boss gear, silver otherwise).
- Hit effects (combatFx, drawn after drawMineOverlay()): mob hit = impact
  ring, white flash, sparks, slash mark (swords); crit = orange, bigger,
  screen shake; kill = burst; miss = puff. Player hit = red ring + shards,
  red tint on the sprite (0.3 s), screen shake.
  index.html -> ?v=20261014a (+ js/combat.js, js/itemInfo.js).

## Death + fishing animations, moving water, skills (Slash / Stun / Teleport) + passives

- js/fishing.js (new): player.special = { kind: "death" | "fishing" } runs
  instead of updatePlayer() (wrapper) using the player's own Death / Fishing
  sheets (assets/sprites/Death, /Fishing; already in ONE_SHOT_ACTION_SHEETS).
  Death: playerBlackout() wrapped — fall (8 frames @6fps), lie 0.9 s, then the
  old blackout. Fishing: equip the Fishing Rod (itemDefs.fishingRod, start
  with 1, grocery sells it for 30), F facing water (isWaterTile(): a water*
  tile on groundLayer, no overlay / solid object, 0.6-3.2 tiles ahead) ->
  cast (frames 0-4), wait 2.5-7 s, bite ("!", bobber dips, 1.1 s / koi 0.75 s)
  -> F reels (frames 5-7), the fish flies to you. Moving or getting hit
  cancels; mobs keep updating. Line/bobber/ripples drawn in a drawPlayer
  wrapper (FISH_TIP = rod tip per facing, measured). Fish (tools/fish_art.py,
  assets/items/fish): Tilapia / Bangus / Lapu-Lapu / Golden Koi (4%), edible,
  sold to the grocery 8 / 14 / 28 / 120.
- Moving water: drawWaterAnim() after drawFlatGroundItems() — rolling
  shimmer bands, drifting glints (2 per tile, hashed), foam along shores.
- js/skills.js (new): skill bar (#skill-bar, right, above the hotbar; mobile:
  centred above the hotbar) + Skills window (K / ✦). Z Slash (mobs only, 4 s,
  15 stamina, x2.2 ATK to every mob in a ~3-tile front arc, crescent wave),
  X Stun (mobs only, 8 s, 20 stamina, bolt, x0.9 ATK, stunUntil 2.5 s / boss
  1.2 s: updateMob wrapper freezes it, drawMob wrapper draws orbiting stars),
  C Teleport (anywhere, 6 s, 12 stamina, up to 4 tiles along the held
  direction / facing, stops at walls, afterimage + puffs, 0.35 s safe).
  Passives Power (+4% ATK), Swiftness (+3% attack speed), Guard (+5% DEF +1)
  up to 10 ranks, 1 point per level after 1 (player.passives, saved),
  applied in a playerStats() wrapper.
  index.html -> ?v=20261015a (+ js/fishing.js, js/skills.js).

## Long swords two-handed, ground-plunge Stun (AoE), skill levels, 2-click attack

- js/combat.js: isLongSword() — the 40px blades (iron, bronze, emerald,
  diamond, Storm Greatsword) swing in BOTH hands (SWORD_PIVOT_2H, two fists
  drawn on the grip — drawGripHands(), hidden facing up), 15% slower, longer
  reach (R 27); the 16px short swords one-handed (R 17). New swing style
  "plunge": raised in both hands, driven point-first into the ground in
  front. The item tooltip says Long Sword (2 kamay) / Short Sword (1 kamay).
- js/skills.js: Stun is now an AoE: plunge -> shockwave ring, cracks and dust
  ("quake" fx) + screen shake; every mob within the radius takes damage and
  is stunned. Slash / Stun / Teleport level 1 -> 10 (player.skillLv, saved),
  same skill points as the passives (1 per level after 1):
  Slash x2.2 +0.18/lvl ATK, range 3 +0.1/lvl tiles, cd 4 -0.1/lvl;
  Stun x0.9 +0.1/lvl, radius 2.5 +0.1/lvl, 2 s +0.15/lvl (boss 1 s +0.06),
  cd 8 -0.25/lvl; Teleport 4 +0.25/lvl tiles, cd 6 -0.25/lvl. The window
  shows each level and the next one.
- js/gear.js + js/skills.js: clicking a mob first only SELECTS it
  (player.selectedMob: dashed gold ring, outline, arrow, "Lv N Name",
  "I-click ulit para umatake"); clicking the same mob again attacks it.
  index.html -> ?v=20261016a.

## Skills aimed at a mob, jump-plunge-pull Stun, dissolving Teleport, butterflies + fireflies

- js/skills.js: Slash / Stun go at the highlighted (1-click) or attacked mob;
  with none, the key/button starts aiming (body.skill-aim crosshair, glowing
  button) and the next click on a mob picks it (window capture listener;
  Esc / empty click cancels). Out of reach you walk up first
  (skillPending, handled in an autoAttackTick wrapper; movement cancels).
  The skill counts as the 2nd click: afterwards you keep attacking it.
- Stun (player.skillAnim kind "stun", STUN_T): leap at the mob (jumpZ arc,
  ground shadow), sword point-down in both hands, driven into the ground on
  landing (quake: every mob in the radius damaged + stunned 3 s +0.15/lvl,
  boss 1.5 s), held in the earth (blade clipped at the ground, glow), then
  wrenched out with earth thrown up; mobs keep updating meanwhile. Stunned
  mobs sway, a daze swirl + 4 stars orbit, a small timer bar.
- Teleport (kind "teleport", TP_T): the character's own pixels fly apart
  and fade at the start (playerPixels() -> "mote" fx), you're hidden, then
  specks gather into your shape at the end ("gather" fx).
- js/critters.js (new) + tools/butterfly_art.py (assets/critters/
  butterflies.png, 4 looks x 4 frames): butterflies wander round the trees on
  screen by day (not in rain/snow); fireflies drift among them at night,
  blinking, adding a little light (shared buffer) and glowing over the dark.
  index.html -> ?v=20261017a (+ js/critters.js).

## Shop furniture repair, sword always behind, effects only from upgrades (+1..+10), new water

- js/shops.js repairShopRoom(): a shop room with no counter left (a save from
  when its furniture was lost) gets its blueprint's pieces back on empty
  tiles; checked every second while inside.
- js/gear.js BACK_SLING: front:false for every facing (facing up: hilt over
  the left shoulder), so the slung weapon is always behind the body.
  BOSS_INNATE_FX = false: the boss gear's own violet aura + lightning is
  off; boss blades draw their plain icon (not the baked aura strip) on the
  back, in the swing and in the Stun (js/combat.js, js/skills.js).
- js/upgrades.js: UPGRADE_AURA_FROM = 1 — the aura starts faint at +1 and
  grows every level (glow alpha/radius by lvl/10, particles 1/2/3, flickers
  only part of the time at low levels, constant at +10). Upgrading with no
  element picked defaults to Lightning. grantWornPlus10(): once
  (player.plus10Given, saved), on loading a save, the worn helmet / armor /
  gauntlet / boots, the equipped weapon and every owned bow become +10.
- js/fishing.js drawWaterAnim() rewritten: looping seamless caustics
  (WATER_FRAMES x 48px tile from interfering integer sine waves, two-tone
  pixel art) in two drifting layers, a slow swell gradient, pre-drawn
  breathing shore foam (16 frames, rotated per side, out of step per tile)
  and daytime sun glints; clipped to the water tiles on screen.
  index.html -> ?v=20261018a.

## +N badge on items, upgrade success rates + ores

- An upgraded item shows "+N" at its top right (green, gold at +10) in the
  Profile slots (js/gear.js renderProfile()), inventory and hotbar
  (js/inventory.js, .slot-plus); profile slots also get the hover info.
- js/upgrades.js: UPGRADE_RATE +1..+5 100%, +6 80, +7 65, +8 50, +9 35,
  +10 25. One ore per try (picked in the window, from +6): Luck Ore +20%,
  Fortune Ore +50%, Divine Ore = 100% (tools/ore_art.py, assets/mobs/icons/
  ore*.png; itemDefs in inventory.js). A fail spends gold/mats/ore, keeps
  the level, shakes the window red; success flashes green. Ores: Blacksmith
  sells Luck 250 / Fortune 1200; chests (Luck, Fortune Lv4+, Divine Lv8+,
  rare) and bosses (Fortune 50%, Divine 12%) drop them.
  index.html -> ?v=20261019a.

## One glowing body aura, element bursts only now and then

- js/upgrades.js: the per-body-part sparks are replaced by bodyAura(): the
  character's own silhouette, tinted the main element (most upgrade levels),
  blurred into a breathing halo + bright rim + ground glow behind the sprite
  (drawBodyAuraGlow()); strength = best piece's level (75%) + all upgraded
  levels together (25%). The slung blade glows along its line
  (drawBladeGlow()). The element itself only bursts now and then
  (drawAuraBursts(): every 2.6 s at +1 down to 0.8 s at +10, 1-3 at once,
  round the outline): lightning arcs, embers, holy sparkles, frost shards, a
  gust ring. index.html -> ?v=20261020a.
