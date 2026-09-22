"use strict";

/* =================================================================
   NPC — a shopkeeper standing in the world: idle animation (4 frames)
   most of the day, and actually WALKS a short loop around its spawn
   point (6-frame walk sheet) during a morning window, both from
   assets/npc/; auto-flips which way it's facing every few minutes
   while idle, and opens a buy-list popup when left-clicked with empty
   hands.

   - `npc.facing` picks between separate PRE-FLIPPED sheets
     (npcIdleRight/npcIdleLeft, npcWalkRight/npcWalkLeft — assets.js)
     rather than the ctx.scale(-1,1) runtime-mirroring the player uses
     for its own side sprites — per request ("gawa ka ng left version
     din" for both sheets), actual left-facing files were wanted, not
     just a mirrored draw. There's no up/down NPC art, so facing only
     ever reflects horizontal movement (see moveNpcTowardTarget()) —
     purely vertical steps leave whichever of left/right it already had.
   - `npc.isWalking` (set once per frame in updateNPC(), read by both it
     and drawNPC() rather than recomputing `isNpcWalkingTime()` twice) is
     true during `NPC_WALK_START_HOUR`-`NPC_WALK_END_HOUR` (6:00-7:59,
     per request — `getGameHour()`, js/daynight.js, is a fractional 0-24
     value, so `< 8` correctly covers up to 7:59:59 without also
     matching 8:00 itself), idle (in place, wherever it ended up) the
     rest of the day. Switching between the two resets `npc.frame`/
     `npc.frameTimer` to 0 — idle (4 frames) and walk (6 frames) have
     different lengths, so carrying over an index from one into the
     other could read past the end of the shorter animation.
   - Movement/collision (per request): the NPC does NOT add any
     collision of its own — the player can walk right through it, and
     nothing checks its tile as blocked. But while it's roaming, IT
     still respects every OTHER collider — trees, stones, the house,
     any placed item with `collides` set — via the exact same
     isTileBlocked() (js/player.js) the player's own movement uses, so
     it can't wander through a wall of stones or straight through the
     house. See pickNewNpcTarget()/moveNpcTowardTarget() below.
   - Left-clicking the NPC (setupNpcClickHandler() below, wired up from
     main.js's start() the same way js/inventory.js's placement handler
     is) only opens the shop when BOTH hold mechanisms are empty
     (`heldItem` and `player.grabbedType`) — clicking the NPC while
     mid-placing something instead places it, same as clicking any other
     tile would, rather than fighting over what a click means. Works
     the same whether the NPC is currently idle or mid-stroll, since
     isPointOnNPC() always reads its live npc.x/npc.y.
   - The shop itself is a flat, no-scarcity buy list: every item here is
     already `unlimited: true` elsewhere in the game (nothing stops you
     from just placing more of anything for free), so buying isn't about
     acquiring an item you couldn't otherwise get — it's the actual gold
     economy this project didn't have before now. `player.gold` (js/
     player.js) is spent per purchase and IS saved (js/save.js), same
     treatment as inventory counts.
================================================================= */

const NPC_IDLE_FRAME_COUNT = 4;   // matches the idle sheet (256x64 = 4x 64x64 frames)
const NPC_IDLE_FPS = ANIM_FPS.idle; // reuse the player's own idle speed rather than inventing a separate constant
const NPC_WALK_FRAME_COUNT = 6;   // matches the walk sheet (384x64 = 6x 64x64 frames)
const NPC_WALK_FPS = ANIM_FPS.walk; // reuse the player's own walk speed
const NPC_DRAW_SIZE = DRAW_SIZE;  // same on-screen size as the player, for visual consistency standing next to them
const NPC_FACING_SWITCH_MS = 3 * 60 * 1000; // per request — flips idle facing every 3 minutes
const NPC_CLICK_RADIUS = 26;      // world px — how close a click needs to land to the NPC's center to count as clicking it
const NPC_WALK_START_HOUR = 6;    // per request — walks from 6:00...
const NPC_WALK_END_HOUR = 8;      // ...up to (not including) 8:00, then idles in place

// --- roaming movement (real movement now, not just an in-place animation) ---
const NPC_MOVE_SPEED = 45;        // world px/sec — noticeably slower than the player's own walk (110), reads as an unhurried stroll
const NPC_ROAM_RADIUS = 130;      // world px — how far from its spawn point the NPC will wander
const NPC_TARGET_REACH_DIST = 4;  // world px — "close enough" to a target to pick a new one
const NPC_MAX_STUCK_SECONDS = 1;  // if genuinely blocked on both axes this long, give up on the current target and pick another rather than vibrating against an obstacle forever
const NPC_TARGET_PICK_ATTEMPTS = 12; // random tries to find an unblocked spot before just giving up for this frame

const npc = {
  // Placed a short distance from the player's spawn point (MAP_W/2,
  // MAP_H/2, see player.js) — move it by changing these two numbers.
  // Doubles as the center of its roam loop (see homeX/homeY below).
  x: MAP_W / 2 + 90,
  y: MAP_H / 2 + 115,
  homeX: MAP_W / 2 + 90, // roam anchor — pickNewNpcTarget() never wanders more than NPC_ROAM_RADIUS from here
  homeY: MAP_H / 2 + 115,
  targetX: null, // world px — where it's currently walking toward; null while idle
  targetY: null,
  stuckSeconds: 0, // how long it's been unable to make progress toward targetX/Y on either axis
  facing: "right", // "right" | "left"
  isWalking: false, // set each frame by updateNPC() from the in-game clock — read by drawNPC() to pick idle vs walk sheets
  frame: 0,
  frameTimer: 0,
  lastFacingSwitchAt: Date.now(), // wall-clock based, same convention as day/night and resource respawns — keeps "ticking" even if the tab isn't focused, rather than pausing
};

// True from NPC_WALK_START_HOUR up to (not including) NPC_WALK_END_HOUR
// — see the header comment above for why the fractional getGameHour()
// makes the "< 8" boundary work out to "up to 7:59:59".
function isNpcWalkingTime() {
  const h = getGameHour();
  return h >= NPC_WALK_START_HOUR && h < NPC_WALK_END_HOUR;
}

// Picks a new random point within NPC_ROAM_RADIUS of the NPC's home spot
// for it to walk toward next, retrying a handful of times if a candidate
// lands on a blocked tile (inside a tree, a stone, the house, ...) or
// off the edge of the map. If every attempt this call happens to land on
// something blocked, it just tries again next frame (targetX/Y stays
// whatever it was) rather than forcing a bad target through.
function pickNewNpcTarget() {
  for (let attempt = 0; attempt < NPC_TARGET_PICK_ATTEMPTS; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * NPC_ROAM_RADIUS;
    const candidateX = clamp(npc.homeX + Math.cos(angle) * dist, NPC_DRAW_SIZE / 2, MAP_W - NPC_DRAW_SIZE / 2);
    const candidateY = clamp(npc.homeY + Math.sin(angle) * dist, NPC_DRAW_SIZE / 2, MAP_H - NPC_DRAW_SIZE / 2);
    if (!isBodyBlockedAt(candidateX, candidateY)) { // js/player.js — same collision check the player's own movement uses
      npc.targetX = candidateX;
      npc.targetY = candidateY;
      return;
    }
  }
}

// Steps the NPC toward npc.targetX/Y at NPC_MOVE_SPEED, one axis at a
// time (same separate-axis approach updatePlayer() uses — js/player.js
// — so grazing the corner of an obstacle on one axis doesn't also stop
// progress on the other). Picks a fresh target once it arrives, or once
// it's been stuck making no progress at all for NPC_MAX_STUCK_SECONDS
// (e.g. its target ended up surrounded after something got placed near
// it mid-stroll).
function moveNpcTowardTarget(dt) {
  if (npc.targetX === null) {
    pickNewNpcTarget();
    return;
  }

  const dx = npc.targetX - npc.x;
  const dy = npc.targetY - npc.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= NPC_TARGET_REACH_DIST) {
    pickNewNpcTarget();
    return;
  }

  const vx = dx / dist, vy = dy / dist;
  const wantX = clamp(npc.x + vx * NPC_MOVE_SPEED * dt, NPC_DRAW_SIZE / 2, MAP_W - NPC_DRAW_SIZE / 2);
  const wantY = clamp(npc.y + vy * NPC_MOVE_SPEED * dt, NPC_DRAW_SIZE / 2, MAP_H - NPC_DRAW_SIZE / 2);

  let moved = false;
  if (!isBodyBlockedAt(wantX, npc.y)) {
    npc.x = wantX;
    moved = true;
  }
  if (!isBodyBlockedAt(npc.x, wantY)) { // uses the (possibly just-updated) npc.x
    npc.y = wantY;
    moved = true;
  }

  // No up/down NPC art — only ever flip facing off horizontal movement,
  // same convention the player's own diagonal movement uses (player.js).
  if (vx > 0.05) npc.facing = "right";
  else if (vx < -0.05) npc.facing = "left";

  if (moved) {
    npc.stuckSeconds = 0;
  } else {
    npc.stuckSeconds += dt;
    if (npc.stuckSeconds >= NPC_MAX_STUCK_SECONDS) {
      npc.stuckSeconds = 0;
      pickNewNpcTarget();
    }
  }
}

// Called every frame (main.js's loop) — advances whichever animation is
// currently active, actually walks it around during the morning window
// (moveNpcTowardTarget() above), and flips facing on its own timer while
// idle. No player-proximity gating: the NPC roams/idles and looks around
// whether or not anyone's nearby.
function updateNPC(dt) {
  const walking = isNpcWalkingTime();
  if (walking !== npc.isWalking) {
    // Just switched animations — reset so the frame index never carries
    // over from one animation's length into the other's.
    npc.isWalking = walking;
    npc.frame = 0;
    npc.frameTimer = 0;
    if (walking) {
      npc.targetX = null; // force a fresh target now that the walking window has started
      npc.stuckSeconds = 0;
    }
  }

  if (walking) moveNpcTowardTarget(dt);

  const frameCount = walking ? NPC_WALK_FRAME_COUNT : NPC_IDLE_FRAME_COUNT;
  const fps = walking ? NPC_WALK_FPS : NPC_IDLE_FPS;
  npc.frameTimer += dt;
  if (npc.frameTimer >= 1 / fps) {
    npc.frameTimer = 0;
    npc.frame = (npc.frame + 1) % frameCount;
  }

  // Idle facing-flip timer only matters while actually idle — while
  // walking, facing is driven by movement direction instead (see
  // moveNpcTowardTarget()), so there's nothing for this timer to do.
  if (!walking && Date.now() - npc.lastFacingSwitchAt >= NPC_FACING_SWITCH_MS) {
    npc.lastFacingSwitchAt = Date.now();
    npc.facing = npc.facing === "right" ? "left" : "right";
  }
}

// Whether a WORLD-space point (screenToWorld(), inventory.js) is close
// enough to the NPC's center to count as clicking them — a simple
// circular hit-test rather than an exact sprite-bounds one, generous
// enough to click comfortably without needing pixel precision.
function isPointOnNPC(worldX, worldY) {
  const dx = worldX - npc.x;
  const dy = worldY - npc.y;
  return dx * dx + dy * dy <= NPC_CLICK_RADIUS * NPC_CLICK_RADIUS;
}

/* ---------------- shop stock (prices decided here, per request "ikaw na bahala sa price") ---------------- */

const NPC_SHOP_STOCK = [
  { type: "woodSword", price: 15 },
  { type: "woodDagger", price: 10 },
  { type: "woodAxe", price: 20 },
  { type: "woodPickaxe", price: 18 },
  { type: "woodBow", price: 30 },
  { type: "woodShieldSmall", price: 12 },
  { type: "woodLog", price: 3 },
  { type: "stoneChunk", price: 3 },
];

/* ---------------- shop UI ---------------- */

const npcShopOverlayEl = document.getElementById("npc-shop-overlay");
const npcShopGridEl = document.getElementById("npc-shop-grid");
const npcShopGoldAmountEl = document.getElementById("npc-shop-gold-amount");
const goldHudAmountEl = document.getElementById("gold-hud-amount");

// Keeps the top-left gold HUD and (if open) the shop panel's own gold
// readout in sync — called after every purchase, and once at startup.
function renderGoldDisplays() {
  if (goldHudAmountEl) goldHudAmountEl.textContent = player.gold;
  if (npcShopGoldAmountEl) npcShopGoldAmountEl.textContent = player.gold;
}

// Rebuilds the shop's item grid from NPC_SHOP_STOCK. Called each time the
// shop opens (not continuously) — the stock list is static, and gold
// changes are handled by renderGoldDisplays()/re-rendering the buy
// buttons' disabled state after each purchase instead of a full rebuild.
function renderNpcShopGrid() {
  npcShopGridEl.innerHTML = "";
  NPC_SHOP_STOCK.forEach(({ type, price }) => {
    const def = itemDefs[type];
    if (!def) return; // defensive — skip silently if a type ever gets renamed/removed later

    const row = document.createElement("div");
    row.className = "npc-shop-row";

    const icon = document.createElement("img");
    icon.src = def.icon.src;
    icon.alt = def.name;
    icon.className = "npc-shop-icon";
    row.appendChild(icon);

    const name = document.createElement("span");
    name.className = "npc-shop-name";
    name.textContent = def.name;
    row.appendChild(name);

    const priceEl = document.createElement("span");
    priceEl.className = "npc-shop-price";
    priceEl.textContent = `${price} 💰`;
    row.appendChild(priceEl);

    const buyBtn = document.createElement("button");
    buyBtn.className = "npc-shop-buy";
    buyBtn.textContent = "Buy";
    buyBtn.disabled = player.gold < price;
    buyBtn.addEventListener("click", () => buyFromNpc(type, price));
    row.appendChild(buyBtn);

    npcShopGridEl.appendChild(row);
  });
}

// Spends `price` gold and grants 1 of `type` to the inventory
// (grantItem(), resources.js — the same "add to an existing slot by
// type" function harvesting drops already use). Re-renders the grid
// afterward so every Buy button's disabled state reflects the new gold
// total immediately (buying one thing can price you out of another).
function buyFromNpc(type, price) {
  if (player.gold < price) return; // shouldn't happen (button's disabled), but never trust just the UI
  player.gold -= price;
  grantItem(type, 1);
  renderGoldDisplays();
  renderNpcShopGrid();
  saveGame();
}

function openNpcShop() {
  renderNpcShopGrid();
  renderGoldDisplays();
  npcShopOverlayEl.classList.remove("hidden");
}

function closeNpcShop() {
  npcShopOverlayEl.classList.add("hidden");
}

// Click-outside-to-close, same convention every other popup in this
// project uses (the item action menu, the weapon picker).
npcShopOverlayEl.addEventListener("click", (e) => {
  if (e.target === npcShopOverlayEl) closeNpcShop();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeNpcShop();
});

// Called once from main.js's start(), after the canvas exists — wires up
// left-click-the-NPC-to-shop. A separate listener from
// js/inventory.js's setupPlacementClickHandler() (rather than folding
// this into that one) since the two react to opposite conditions —
// empty-handed here, holding-something there — and keeping them apart
// keeps each file's click behavior self-contained.
function setupNpcClickHandler() {
  view.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // left button only
    if (heldItem || player.grabbedType) return; // hands full — a click places/grabs instead, see inventory.js
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    if (isPointOnNPC(x, y)) openNpcShop();
  });
}
