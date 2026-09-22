"use strict";

/* =================================================================
   WILDGRASS — the "walk through tall grass" effect: wild grass (and
   flowers, which share the same "decor" layer/treatment — see
   layerForType() in inventory.js) sways as the player passes through it.

   - `decorLayer` (declared in js/inventory.js, alongside groundLayer/
     objectLayer) holds wild grass placements — its own layer so placing
     grass never replaces the ground tile underneath (see layerForType()
     in inventory.js).
   - The character is ALWAYS drawn fully in front while standing on a
     decor tile — no part of any wild grass/flower renders in front of
     them, no matter how tall the art is (drawPlayerStandingDecor(),
     camera.js, draws the whole plant behind the player, full stop).
     Earlier versions tried a front/back split — a fixed fraction of the
     tile, then a fraction sized to the character's own height, with only
     the part of a plant actually taller than the character staying in
     front — but per feedback that still read as "still overlapping" for
     tall art (a bush, a tall flower), so the split was dropped entirely
     in favor of this simpler, unambiguous rule.
   - `wildgrassSway` tracks a small damped-spring simulation per grass
     tile: { angle, velocity }. NOT saved — purely a live animation, no
     different from `resourceHits` being transient. An entry only exists
     while a tile is mid-sway; it's deleted once fully settled, so this
     map stays small regardless of how much grass exists on the map.
   - The 100%/50%/25%/0% decay mentioned in the original request is
     approximated by a real damped spring (stiffness pulls the blade
     toward whichever way the player's walking, damping bleeds off
     energy) rather than hardcoded discrete steps — a spring naturally
     overshoots and oscillates with shrinking amplitude (lean one way,
     swing back the other, smaller each time, settle), which is what
     "left then right then left and right hanggang tumigil" describes,
     and reads more natural in motion than snapping between 4 fixed
     values would.
================================================================= */

const wildgrassSway = new Map(); // "col,row" -> { angle, velocity } — not saved

const WILDGRASS_SWAY_STIFFNESS = 90;  // how hard it's pulled toward the target lean
const WILDGRASS_SWAY_DAMPING = 6;     // how fast the oscillation loses energy
const WILDGRASS_SWAY_SETTLE_EPSILON = 0.01; // below this (angle AND velocity), treat it as fully at rest
const WILDGRASS_MAX_SKEW_PX = 5;       // world px the very tip leans at full (angle = ±1) sway

// Called every frame (main.js's loop) — advances the sway simulation for
// every placed wild grass tile. Only the tile the player is CURRENTLY
// standing on gets pushed (a real "target" lean); every other tile with
// an in-progress sway just keeps springing back toward upright.
function updateWildgrassSway(dt) {
  if (decorLayer.size === 0 && wildgrassSway.size === 0) return;

  const playerTile = getPlayerTile();
  const playerKey = tileKey(playerTile.col, playerTile.row);

  // Only the player's own tile can get a nonzero target, so we only need
  // to look up itemDefs/facing once, not per grass tile. `noSway` items
  // sharing this same decorLayer (XXS Stone, Pebbles 1-5 — per request,
  // "dapat mas angat sila ng layer sa grass" — placed here just so they
  // can sit on top of a Ground tile instead of fighting it for the same
  // groundLayer slot, itemDefs) never count as "on grass" for this: real
  // pebbles don't bend in the wind the way wild grass/flowers do.
  const playerOnGrass = decorLayer.has(playerKey) && !itemDefs[decorLayer.get(playerKey)].noSway;
  let target = 0;
  if (playerOnGrass) {
    if (player.facing === "left") target = -1;
    else if (player.facing === "right") target = 1;
    // facing "up"/"down" leaves target at 0 — no horizontal push
  }

  // Advance every tile that either IS the player's (to receive the
  // target above) or already has an in-progress sway (settling back).
  const keysToUpdate = new Set(wildgrassSway.keys());
  if (playerOnGrass) keysToUpdate.add(playerKey);

  keysToUpdate.forEach((key) => {
    const isPlayerTile = key === playerKey;
    const thisTarget = isPlayerTile ? target : 0;
    let sway = wildgrassSway.get(key) || { angle: 0, velocity: 0 };

    // Damped spring: pull toward thisTarget, bleed energy via damping.
    const force = (thisTarget - sway.angle) * WILDGRASS_SWAY_STIFFNESS;
    sway.velocity += force * dt;
    sway.velocity *= Math.max(0, 1 - WILDGRASS_SWAY_DAMPING * dt);
    sway.angle += sway.velocity * dt;

    const atRest = thisTarget === 0 &&
      Math.abs(sway.angle) < WILDGRASS_SWAY_SETTLE_EPSILON &&
      Math.abs(sway.velocity) < WILDGRASS_SWAY_SETTLE_EPSILON;

    if (atRest) {
      wildgrassSway.delete(key);
    } else {
      wildgrassSway.set(key, sway);
    }
  });
}
