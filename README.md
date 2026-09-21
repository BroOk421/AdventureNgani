# RPG Prototype

A fullscreen dirt map (randomly tiled from 3 dirt variants) with a
WASD-controlled character that has idle / walk / run animations, and a
zoomable camera.

## Folder structure

```
rpg-game/
├── index.html
├── style.css
├── js/
│   ├── config.js    ← tunable constants (map size, zoom range, anim speeds…)
│   ├── daynight.js  ← day/night clock, sky tint, shadow angle
│   ├── assets.js    ← loads the sprite/tile/item images
│   ├── input.js     ← keyboard + mouse-wheel state, zoom value
│   ├── inventory.js  ← inventory grid, hotbar, held item, ground placement
│   ├── resources.js  ← harvesting (stones/trees), floating pickups, throw toss
│   ├── wildgrass.js  ← wild grass sway simulation
│   ├── save.js        ← autosave/load progress via localStorage
│   ├── world.js      ← randomly tiles the map from the 3 dirt variants
│   ├── player.js     ← player state + movement/animation-state logic
│   ├── npc.js        ← NPC shopkeeper: idle animation, facing timer, shop UI
│   ├── camera.js     ← canvas sizing, zoom-aware rendering, ground items, placement highlight
│   └── main.js       ← entry point: starts the game loop
└── assets/
    └── sprites/
        ├── Idle/
        │   ├── Idle_Down-Sheet.png       (4 frames)
        │   ├── Idle_Up-Sheet.png         (4 frames)
        │   └── Idle_Side-Sheet.png       (4 frames, faces right — flipped for left)
        ├── Walk/
        │   ├── Walk_Down-Sheet.png       (6 frames)
        │   ├── Walk_Up-Sheet.png         (6 frames)
        │   └── Walk_Side-Sheet.png       (6 frames, faces right — flipped for left)
        ├── Run/
        │   ├── Run_Down-Sheet.png        (6 frames)
        │   ├── Run_Up-Sheet.png          (6 frames)
        │   └── Run_Side-Sheet.png        (6 frames, faces right — flipped for left)
        ├── Collect/
        │   ├── Collect_Down-Sheet.png    (8 frames, one-shot pickup/put-down)
        │   ├── Collect_Up-Sheet.png      (8 frames)
        │   └── Collect_Side-Sheet.png    (8 frames, faces right — flipped for left)
        ├── Crush/        (8 frames each — F on a stone, see "Harvesting")
        ├── Slice/        (8 frames each — F on a tree, see "Harvesting")
        ├── Death/        (8 frames each — loaded, not wired to anything yet)
        ├── Fishing/      (8 frames each — loaded, not wired to anything yet)
        ├── Hit/          (4 frames each — loaded, not wired to anything yet)
        ├── Pierce/       (8 frames each, Down/Side/Top — loaded, not wired to anything yet)
        ├── Watering/     (8 frames each — loaded, not wired to anything yet)
        ├── Carry_Idle/
        │   ├── Carry_Idle_Down-Sheet.png (4 frames)
        │   ├── Carry_Idle_Up-Sheet.png   (4 frames)
        │   └── Carry_Idle_Side-Sheet.png (4 frames, faces right — flipped for left)
        ├── Carry_Walk/
        │   ├── Carry_Walk_Down-Sheet.png (6 frames)
        │   ├── Carry_Walk_Up-Sheet.png   (6 frames)
        │   └── Carry_Walk_Side-Sheet.png (6 frames, faces right — flipped for left)
        └── Carry_Run/
            ├── Carry_Run_Down-Sheet.png  (6 frames)
            ├── Carry_Run_Up-Sheet.png    (6 frames)
            └── Carry_Run_Side-Sheet.png  (6 frames, faces right — flipped for left)
    └── items/
        ├── tile/         (36 files — the base ground tileset (10, flat,
        │                   "Ground"), the 3 dirt terrain variants (also
        │                   placeable as "Dirt 1/2/3" now, not just the
        │                   background world.js tiles the map with), the
        │                   20-file port/island edge-and-corner tileset
        │                   ("Port ..."), and the 3 plain water variants
        │                   ("Water 1-3") — everything ground-level lives
        │                   here together
        ├── stones/       (10 files — Big/Medium/Small collide + harvestable,
        │                   XS collides only, XXS + Pebbles are decor)
        ├── trees/
        │   ├── noLeaves/     (5 files — bare/cut variants, all collide)
        │   ├── green/        (2 files, renamed from the source pack to
        │   │                  avoid a same-name clash with orange/)
        │   └── orange/       (2 files, same reason)
        ├── house/        (house1.png)
        ├── wood/         (19 files — 14 equippable weapons + 5 decor,
        │                   see "Equipping weapons")
        └── wood_drops/   (3 files — Wood Log/Plank/Stick materials,
                            granted from chopping trees, see "Harvesting")
assets/flowers/       (flower1.png, flower2.png — their own folder,
                        separate from the ground tileset they sit on top
                        of; part of the same "decor" layer as wildgrass,
                        see "Wild grass" below)
assets/wildgrass/     (8 files — Wild Grass 1-8, its own layer + sway
                        effect, see "Wild grass" below)
assets/npc/           (4 files — npc_idle_right.png/npc_walk_right.png
                        as uploaded, npc_idle_left.png/npc_walk_left.png
                        each a per-frame-flipped copy; see "NPC shop"
                        below)
```

`index.html` loads the `js/` files in that exact order because each one
depends on the globals defined by the ones before it (plain `<script>`
tags, no bundler needed — this keeps it double-click-able with no build
step).

## How to run

**Option A — VS Code Live Server (recommended)**
1. Open the `rpg-game` folder in VS Code.
2. Install the "Live Server" extension if you don't have it.
3. Right-click `index.html` → "Open with Live Server".

**Option B — just open the file**
Double-click `index.html` to open it directly in your browser.

## Controls

- **W A S D** — walk (arrow keys also work)
- **Shift** (held while moving) — run
- **E** — grab/place: picks up whatever's on your own tile (Wild Grass,
  Flower, Ground/Dirt/Water) or, for anything that blocks movement (a
  Tree, a Stone, a Port tile), directly in front of you (plays a one-shot
  animation first); pressing it again puts back down whatever you're
  currently holding, the same way (see "Grab and place" below)
- **T** (while holding something grabbed via E) — throws it away for
  good: arcs it out 2 tiles, then blinks and destroys it on landing
- **R** (while holding something grabbed via E) — keeps it, adding it to
  your inventory instead of setting it back down in the world
- **Left-click the NPC shopkeeper** (with empty hands) — opens their shop
  (see "NPC shop" below)
- **F** — attack: swings your equipped weapon (or bare-handed if nothing's
  equipped — see "Equipping weapons" below). If a harvestable stone or
  tree is in range, the swing also counts as a hit toward breaking it
  (see "Harvesting" below); otherwise it's just a swing.
- **1-7** — select/use whatever's assigned to that hotbar slot (holds it
  to place, or equips it directly if it's a weapon)
- **B** — open/close the full inventory panel
- **G** — open/close the Equipment screen (see "Equipping weapons" below)
- **Click** an item in the full inventory panel — uses it directly: holds
  it to place if it's placeable, or equips it immediately if it's a
  weapon
- **Right-click** an item in the full inventory panel — opens a small
  menu: **Hold** it (non-weapons only) or **Equip**/**Unequip** (weapons
  only), plus assign it to hotkey **1-7** (overwrites whatever was on
  that hotkey before)
- **Click** a hotbar slot — uses its item immediately (same as clicking
  it in the inventory)
- **Left-click (or hold)** the game world while holding an item — places it
  on that tile; holding the button down keeps placing as you drag the
  cursor over new tiles, no repeated clicking needed (if it's a valid tile
  — see "Inventory & placement" below)
- **Esc** — cancel the currently held item
- **Mouse wheel** — zoom in / out
- **[ / ]** — zoom out / in (keyboard alternative to the wheel)

## HUD

Top-left is a stack of separate bordered sections (top to bottom):

1. **Health / Stamina / Food / EXP bars.** Health and EXP are
   placeholders for now — nothing in the game currently damages you or
   grants experience, so they just sit full/empty. Stamina and Food are
   real: running drains stamina (and you can't run at all once it hits
   0 — you just walk until it's regenerated back up to 30% of max, not
   the instant it ticks above 0, which used to cause a run/walk
   flickering bug right at empty), and food slowly ticks down over
   time, paced to the in-game clock so a full bar lasts exactly one
   in-game day. There's no way to eat yet, so it's a one-way drain for
   now.
2. **Day/date**, **Season**, and **Weather** — a Jan-Dec calendar built on
   top of the day counter (30 in-game days per month, so a year is 360
   days / 12 months), grouped into the 4 real seasons (Winter: Dec-Feb,
   Spring: Mar-May, Summer: Jun-Aug, Fall: Sep-Nov). Weather is one of
   **Sunny / Rainy / Snow**, re-rolled once per in-game day and weighted
   by the current season (Winter mostly snows, Summer is mostly sunny,
   Spring/Fall are a mix with a chance of the "wrong" one). This is no
   longer just cosmetic: it only rains during Rainy, only snows during
   Snow, and sunny days get thinner clouds + stronger sun-rays while
   rainy/snowy days get thicker cloud cover and duller light. See
   `js/calendar.js` and the weather section of `js/config.js` to retune
   the odds or month length.
3. **Duration** (total time you've spent playing, added up across every
   session, shown as `HH:MM:SS`) and your current **Col / Row**.
4. The clock (time of day) and your **Gold**.
5. Only while a weapon's equipped — that weapon's name/icon and an
   Unequip button.

Top-right is the **minimap** — the whole map, scaled down to fit, with a
white dot for you, a gold dot for the NPC shopkeeper, and a thin outline
showing exactly what the main view is currently zoomed into.

## Inventory & placement

- The inventory is a 10-row × 9-column grid (90 slots, scrollable — see
  "Inventory & placement" below) — press **B** to open/close it.
- The hotbar (always visible, bottom of screen) is a set of 7 *pointers*
  into the inventory, not fixed to the first row — **any** inventory item
  can be put on **any** of the 7 hotkeys. Right-click an item in the
  inventory panel to bring up the Hold / 1-7 menu, then click a number to
  assign it there. By default, hotkeys 1-7 point at inventory slots 0-6
  (Ground, then the Top-Left/Top/Top-Right/Left/Inner/Right tileset pieces).
- **Similar/same-purpose items are grouped into ONE slot.** Grass's 3×3
  autotile pieces, the 3 Dirt variants, the 3 Water variants, the Port
  tileset's ~20 pieces, the 10 Stones (Big/Medium/Small/XS/XXS + the 5
  Pebbles), and the 9 Trees/stumps each show as a single slot with a
  small side-by-side preview of their member icons, instead of one slot
  per variant. Click (or right-click) that slot to open a picker listing
  every variant at normal size; clicking one of those brings up the
  same Hold / 1-7 menu any other item uses. Fence has only one sprite,
  so it isn't part of this — there's no variant set to group. Stone
  Chunk (the crafting material dropped by breaking a stone) is also
  excluded from the Stones group on purpose — it's a material, not a
  kind of stone tile to place.
- Slot 0 (top-left of the inventory) starts with 99 Ground — the base
  terrain tile, part of the grouped Ground Tiles family described above.
- The inventory **auto-fills from the item list itself** (one slot per
  item, in the order they're defined) instead of a hand-numbered list, so
  slot numbers can shift slightly as items are added/removed — the
  categories below are still grouped together, just not pinned to fixed
  numbers. 89 items total now — see the folder listing above for the
  breakdown. (The tile-family grouping above only changes how these show
  up in the panel — the underlying slot count/order is unaffected.)
- **Terrain, ground tiles, wild grass, and placed objects are FOUR
  independent layers, stacked bottom to top.** Placing a tree, stone, or
  house on a tile that already has ground beneath it doesn't remove or
  replace that ground — they coexist, terrain/ground beneath and the
  object on top. It goes one level deeper than that, too: Dirt and Water
  are their own base "terrain" layer, UNDER the Ground tileset and Port
  tiles — planting Water somewhere doesn't erase a Port tile already
  there, or vice versa, they're just stacked. Wild grass/Flowers work
  the same way, one layer up from that (see "Wild grass" below).
  Replacing only ever happens **within** the same layer (a second Dirt
  tile over an existing one, a second Ground tile over an existing one, a
  second patch of wild grass over existing wild grass, or a second object
  over an existing object) — and even then, per a recent change, an
  occupied tile now just BLOCKS the new placement rather than replacing
  what's there (see "Grab and place" below for where this matters most).
- **Big, Medium, and Small Stone all block movement**, and are
  harvestable (see "Harvesting" below); **XS Stone** blocks movement too
  but isn't harvestable — just a solid obstacle. Every tree blocks
  movement. XXS Stone and every Pebble variant are just walk-through
  decoration. The collision is always exactly the one tile the item sits
  on, even for the taller sprites (a big tree's shape visually overhangs
  neighboring tiles but doesn't block them) — except the Big Tree and Big
  Stone, which block a wider strip (see below).
- **Most Port tiles block movement too**, each one individually — the
  same single-tile collision a Stone gets, no special footprint. Three of
  them — the plain grass "inner" tiles with no visible edge (Port Inner
  1/2/6) — are walkable, same as the rest of the ground tileset. For any
  Port tile that DOES collide, since you can never be standing on one,
  grabbing or placing it with E always happens on the tile in front of
  you, not your own (see "Grab and place" below).
- **The house blocks movement too, but across its whole footprint** —
  unlike trees/stones, its collision covers the full multi-tile area its
  art actually occupies (about 8×8 tiles), except for **2 walkable rows
  at the back** (the far edge from where it was placed), so you're not
  fully walled out of the space directly behind it.
- **Tall objects (trees, stones, the house) occlude the character
  properly** — walking behind one draws it in front of you, and walking
  in front of it draws you on top, based on depth (Y-position), not just
  placement order. The ground tileset and flora stay flat ground
  decoration and never take part in this — they always render beneath
  the character, no matter where you're standing.
- **...and fade instead of fully hiding you.** Since every one of these
  is taller than the single tile it's placed on, walking behind one can
  put you entirely under its canopy/silhouette with no way to see
  yourself. When that happens, the object fades to about half-opacity
  instead — only while you're actually behind AND visually covered by
  it; walking past without overlapping it, or in front of it, leaves it
  fully solid.
- **Every item is currently unlimited** (shows `∞` instead of a count) —
  this is a temporary setting (an `unlimited` flag per item in
  `itemDefs`, `js/inventory.js`), not a removal of the stacking system;
  a specific item can be made limited again by removing that flag and
  giving it a real starting count.
- Clicking an item (or a hotbar slot) picks it up to hold — unless it's a
  weapon, which equips instead (see "Equipping weapons"). While holding
  an item, its icon appears above your character's head in the world, and
  a small panel above the hotbar shows what you're holding with an
  **Unhold** button (does the same thing as pressing **Esc**). Also, every
  tile within **1 tile** of the character (in every
  direction — a square range, not a circle) is outlined:
  - **light/white border** — empty, valid to place on
  - **red border** — already has something there, or (for anything that
    blocks movement) it's your own tile — placing is blocked either way
  The highlighted area is recalculated every frame around your *current*
  position, so it moves with you while you're still holding the item.
- Clicking a highlighted tile places the held item there and uses up 1
  from the stack; once the stack hits 0 the slot empties and you stop
  holding. A tile that already has anything on it (in that item's layer)
  just refuses the click — nothing gets replaced. Placing something that
  blocks movement (a Port tile, a Stone) on your OWN tile is refused too
  — otherwise you'd trap yourself with nowhere left to step. If the item
  you're placing happens to be on the hotbar, the hotbar's highlighted/
  selected slot follows along automatically. **Esc** cancels holding
  without placing anything.
- This is a general-purpose system, not ground-tile-specific — see
  `itemDefs` in `js/inventory.js` to register more item types later (each
  just needs a `name` and an `icon` — an entry in `assets.js`).

## Saving

Your progress — placed items (both the ground layer and the object
layer), inventory counts, hotbar assignments, and where your character is
standing — autosaves to your browser's `localStorage` every couple of
seconds, and right before the tab closes. Reopening `index.html` restores
it automatically, so whatever you build stays there instead of resetting
each time.

Inventory counts and hotbar assignments are saved **by item type**, not
by slot number — so importing an older save (or one made before new
items existed) only restores counts for items that still exist; it can't
wipe out items added to the game since that save was made.

The top-right toolbar also has:
- **💾 Save** — saves immediately (autosave already covers this, but this
  gives an explicit "definitely saved right now" moment).
- **⬇ Export** — downloads your current save as `rpg-save.json`.
- **⬆ Import** — loads a previously exported `rpg-save.json` (from this
  browser or a different PC) and makes it the active save here.

This is per-browser, local to your computer only — Export/Import is how
you move a save between different browsers or computers. To wipe it and
start over from the defaults without a file, open the browser console
and run `clearSave()`.

## Wild grass

Wild Grass (8 variants) and both Flowers are their own thing, separate
from the ground tileset — placing them never clears the ground tile
underneath, and vice versa, the same way stones/trees just sit on top of
the ground instead of replacing it. Two effects make it feel like actual
tall grass instead of a flat decal:

- **It sways as you walk through it.** Standing on a wild grass (or
  flower) tile bends it in the direction you're facing — facing left
  leans it left, facing right leans it right (facing up/down doesn't push
  it); leaving lets it spring back, overshooting a little and settling
  with a couple of smaller wobbles rather than snapping straight up.
- **You're always fully visible while standing on it — it never covers
  you.** The whole plant draws behind you, no matter how tall it is. The
  moment you step off that tile it goes back to being drawn as one whole
  sprite, sorted normally against everything else by position (sometimes
  in front of you, sometimes behind, depending on where you are) — that
  normal sorting is the only time a patch of wild grass/flowers you're
  not standing on might appear in front of you, same as any other
  scenery.

## Equipping weapons

Click a weapon anywhere (inventory panel, hotbar, or a 1-7 hotkey) to
equip it directly — no more "Hold" step for weapons, since they're used,
not placed on the ground. You can also right-click one in the inventory
and choose **Equip** from the popup, or press **G** to open the Equipment
screen and pick one from its weapon slot. All three do the same thing.
Once equipped:
- A persistent panel appears top-left (under the clock) confirming what's
  equipped, and the Equipment screen's weapon slot shows its icon too —
  both stay in sync with each other.
- Pressing **F** swings that weapon's animation *when there's nothing to
  harvest in range* — see "Harvesting" below for what happens when there
  is.
- Only one weapon can be equipped at a time; equipping a different one
  replaces it. Nothing is lost — the old one just goes back to being an
  unequipped inventory item.
- The weapon isn't shown on the character in the world — equipping only
  affects the HUD/Equipment screen and which animation F plays.

**Weapons and what they swing (when nothing's in range to harvest):**
Wood Sword, Wood Dagger, Wood Dagger (Small), Wood Hook Staff, Wood Club
(Wrapped), Wood Tongs → **Hit**. Wood Rapier, Wood Javelin, Wood Bow →
**Pierce**. Wood Axe, Wood Sickle → **Slice**. Wood Pickaxe, Wood
Mattock, Wood Hammer → **Crush**. (Wood Crate, Wood Plaque, and the three
Wood Shields are decoration only — not equippable.)

### Equipment screen

Press **G** to open it: your character (a static preview — just the
first frame of the Idle-facing-down pose) appears centered, with a
Weapon slot beside them. Click the slot to pick a weapon from everything
you're carrying, or to Unequip. Right now there's only the one slot,
since weapon is the only equip category this prototype has — the layout
leaves room to add more (armor, accessories, etc.) the same way later.

## Harvesting

Press **F** to attack. If a stone or tree is in range, the animation
matches THAT resource — Crush for stones, Slice for any tree — no matter
what's equipped; cutting a tree always looks like cutting a tree.
Swinging at nothing plays your equipped weapon's animation instead (or a
bare-handed `Hit`), just for flavor. Either way, a hit on something in
range counts toward harvesting it:

- **Stones (Big, Medium, and Small Stone)** — 3 hits breaks one, granting
  **Stone Chunks**: 5 for Big, 3 for Medium, 2 for Small (the same 5/3/2
  big/medium/small split the trees use for wood). The same stone tile
  comes back on its own **5 real minutes** later.
- **Living trees (the 4 leafed ones — Thin/Tiny Tree Green, Big/Thin Tree
  Orange)** — 3 hits permanently replaces one with its matching cut stump
  (named the way the source art was: "Thin Tree" → "Thin Tree Stump",
  etc.) — no respawn at this stage, the stump sticks around. Also grants
  **Wood Logs**: 5 for the Big Tree, 3 for either Thin Tree, 2 for the
  Tiny Tree — each one tossed out, bouncing twice on the ground, pausing
  for a second, then flying into you like it's being vacuumed up (one
  after another for a multi-log drop, not all at once).
- **Stumps (the ones left behind above) clear in 2 hits**, and **5 real
  minutes** later grow back into the LIVING tree again (completing the
  full cycle — cut it down, the stump regrows into a tree). They also
  grant Wood Logs when cleared — fewer than their living form, since
  there's less tree left: 3 for Big, 2 for Thin, 1 for Tiny.
- **The two bare "no leaves" trees take 3 hits** (not 2, like the
  stumps) since they have no separate living form to cut down to first —
  they just grow back as themselves 5 real minutes later, and grant 2
  Wood Logs, matching the Thin Tree Stump's amount.
- **XS Stone blocks movement but isn't harvestable** — a solid obstacle,
  swinging at it does nothing. XXS Stone and every Pebble variant are
  just walk-through decoration.
- The Big Tree (living or stump) blocks a **4-tile-wide** strip — 2 tiles
  to the left of where it's planted, the tile itself, and 1 tile to the
  right. Big Stone blocks a **3-tile-wide** strip the same way — 1 tile
  to each side. Every other tree/stone just uses the usual single-tile
  collision.

Respawn timers are based on the real clock, so they keep counting even if
you close the tab. Partial hit progress (1 hit into a not-yet-broken
stone/tree) isn't saved — it resets if you reload before finishing it
off; a broken/cleared tile's respawn timer, however, is saved and
survives a reload.

## Grab and place

Pressing **E** plays the `Collect` animation once (locks movement while it
plays), then, once it finishes:
- **If your hands are empty**, it checks a tile for something to pick up —
  WHICH tile depends on what's there: a Tree, a collidable Stone, or a
  Port tile is checked on the tile directly in front of you (you can't be
  standing on one of those, so it has to be next to you), while anything
  walkable — Wild Grass, a Flower, or the ground/terrain itself (Dirt,
  Water, a Ground tile) — is checked on your OWN tile instead, since
  that's where you'd actually be standing on it. Whatever's found is
  pulled straight out of the world and into your hands: your idle/walk/run
  switch to the `Carry_Idle` / `Carry_Walk` / `Carry_Run` sheets, and the
  grabbed thing shows above your head, same as holding something from the
  inventory does.
- **If you're already holding something**, pressing E sets it back down
  the same way — a colliding item (a Tree, a Stone) goes down on the tile
  in front of you, anything else goes down under your own feet — and you
  switch back to the normal sheets. If that exact tile already has
  anything on it, though, placing is blocked — you keep holding it and
  have to find somewhere empty.
- The house isn't grabbable — it's a structure, not something you'd pick
  up and carry off. The Big Tree's wider footprint doesn't need any
  special handling here: it's still grabbed/placed by the single tile it
  was planted on, same as placing one from the inventory already works.

This is a genuine world-object mechanic, separate from the inventory
entirely — it doesn't touch your item counts or hotbar. Since it actually
removes something from the world the moment you grab it, what you're
holding is saved (unlike an inventory hold-in-progress) so refreshing
mid-carry doesn't quietly delete whatever you picked up.

While you're holding something grabbed via E, two more options open up
(these don't apply to an inventory hold — only to a live E-grab):
- **T** throws it away for good — it arcs out 2 tiles in whichever
  direction you're facing, and once it lands, it blinks 3 times and is
  destroyed. It's not placed anywhere; there's nothing left to find
  afterward.
- **R** keeps it — adds it to your inventory instead of setting it back
  down anywhere.

## NPC shop

A shopkeeper stands a short distance from where you spawn (tile col 99,
row 58, if you want the exact number — the position's easy to change in
`js/npc.js`, near the top of the file). They block movement, one tile,
same as a Stone. Idle animation most of the day;
between **6:00 and 7:59** in-game they play a walking animation instead
(still standing in the same spot — it's a time-of-day animation change,
not an actual patrol), switching back to idle at 8:00. Every 3 real
minutes they also turn to face the other way (left/right), just for a bit
of life. Left-click them (with empty hands — if you're holding or
grabbing something, the click places/grabs instead) to open their shop.

The shop is a straightforward buy list: each row shows an item's icon,
name, and price, with a **Buy** button that's grayed out if you can't
afford it. Buying spends **Gold** (the number shown top-left, under the
clock) and adds the item straight to your inventory. Every item the shop
sells is already unlimited elsewhere in this prototype, so buying isn't
about *getting* something you couldn't otherwise place for free — it's
just the game's first real currency loop, something to spend gold on.
Currently stocked:

| Item | Price |
|---|---|
| Wood Sword | 15 |
| Wood Dagger | 10 |
| Wood Axe | 20 |
| Wood Pickaxe | 18 |
| Wood Bow | 30 |
| Wood Shield (Small) | 12 |
| Wood Log | 3 |
| Stone Chunk | 3 |

You start with 100 gold. Click outside the panel, or press **Esc**, to
close the shop.

## What changed this round

- **Random ground tiles.** 3 separate 16x16 dirt variants
  (`assets/items/tile/dirt1/2/3.png`). `world.js` picks a random one for
  every tile across the whole map (seeded, so the layout is stable across
  reloads) instead of repeating a single tile.
- **Idle / Walk / Run animations.** The player now has a real `anim` state
  (`idle`, `walk`, `run`) in `player.js`. It's idle when standing still,
  walks when moving, and runs when moving with Shift held — each state
  uses its own sheet and its own frame count/speed (idle: 4 frames @ 4fps,
  walk: 6 frames @ 8fps, run: 6 frames @ 12fps — see `config.js`).
- **Left-facing, still via flip.** All three *Side sheets face right; for
  every state (idle, walk, run), facing left reuses that same sheet and
  flips it horizontally at draw time (`ctx.scale(-1, 1)` in
  `camera.js`) rather than needing separate left-facing art. This is now
  consistent across all three animations, which is what was missing
  before (only walk had it).
- **Removed the smoothing on the character.** Turning `imageSmoothingEnabled`
  on for the sprite (from the previous round) was what made it look soft /
  blurry — bilinear smoothing softens edges. It's now drawn with the same
  crisp, no-smoothing setting as the ground tiles, which is the correct,
  sharp look for pixel art at this resolution. Worth knowing: the source
  art itself is a small 64×64 frame, so at 4–6x zoom you're always going to
  see the individual pixels rather than smooth curves — that's inherent to
  the resolution of the art, not something scaling settings can fix. Crisp
  visible pixels (current setting) reads as "clear pixel art"; smoothing
  it instead reads as "blurry," which is why it's off.

- **Diagonal movement now faces left/right.** Moving diagonally (top-left,
  top-right, bottom-left, bottom-right) now shows the left/right side
  sprite instead of sometimes snapping to up/down — the logic in
  `player.js` picks left/right whenever there's any horizontal input at
  all, and only falls back to up/down for purely vertical movement (since
  there's no separate diagonal artwork).

- **Character-shaped shadow, not a blob.** The shadow is built from the
  actual sprite frame that's currently playing — `buildSilhouette()` in
  `camera.js` draws the current frame onto a scratch canvas and tints
  every opaque pixel a soft dark tone, so the shadow keeps the real head/
  arms/body/legs shape instead of being a plain circle or ellipse.
- **Feet glued to feet — properly this time.** The shadow is drawn
  upside-down (mirrored vertically) and flattened, like a real cast
  shadow. It's anchored using `SPRITE_FEET_FRACTION` in `config.js` — a
  value measured directly from the sprite sheets (the feet pixels sit at
  ~75% down the 64px frame, not at the very bottom edge — there's empty
  padding baked into the art). The earlier version guessed a rough
  fraction and anchored too low, which is why the shadow looked far away;
  anchoring at the *measured* feet row fixes that gap. Since that row is
  essentially the same across every idle/walk/run frame (47–48px out of
  64, checked across all sheets), the shadow no longer visibly shifts
  position as the animation plays — it always meets the feet at the same
  spot and the same angle.
- **Lighter and blurred.** The shadow's tint is a softer, lower-opacity
  dark brown instead of near-black, and `ctx.filter = "blur(3px)"` is
  applied while drawing it so the edges are soft rather than hard pixel
  edges — tweak the color/alpha in `buildSilhouette()` and the blur amount
  in `drawShadow()`, both in `camera.js`.

## Key constants — all in `js/config.js`

| Constant | Purpose |
|---|---|
| `MAP_W`, `MAP_H`, `TILE` | World size and ground tile size |
| `DRAW_SIZE` | Character size in world px (scales with zoom automatically) |
| `ZOOM_MIN`, `ZOOM_MAX`, `ZOOM_STEP` | Camera zoom range and sensitivity |
| `FRAME_COUNTS`, `ANIM_FPS` | Frame count and playback speed per animation state |
| `SPRITE_FEET_FRACTION` | How far down the 64px sprite frame the feet sit — anchors the shadow |
| `SHADOW_OFFSET_X` | Shifts the shadow left/right relative to the feet (world px; negative = left, positive = right) |
| `SHADOW_LEAN_MAX` | Max horizontal lean at sunrise/sunset — see "Day/night cycle" below |
| `SHADOW_SQUASH_MIN`, `SHADOW_SQUASH_MAX` | Shortest (solar noon) and longest (sunrise/sunset) the shadow gets |

The shadow's shape isn't fixed — it's entirely driven by the in-game
clock (see "Day/night cycle" below): a long shadow pointing down-left at
sunrise, rotating through a short compact one at solar noon, to a long
shadow pointing up-right at sunset, fading out through the night. That
math lives in `getShadowParams()` in `js/daynight.js`; `drawShadow()` in
`js/camera.js` just reads whatever it returns each frame. The pose mirror
(`ctx.scale(-1, 1)` when facing left) is separate from all of this — it
only flips the silhouette's arms/legs to match a left-facing pose, it
doesn't affect the shadow's lean/rotation.

`player.speed` / `player.runMult` (walk vs. run speed) live in `player.js`.
