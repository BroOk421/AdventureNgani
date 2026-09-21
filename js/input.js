"use strict";

/* =================================================================
   INPUT — keyboard state (WASD / arrows / shift) and zoom controls
   (mouse wheel, or [ / ]). `zoom` is read by camera.js each frame.

   `collectRequested` is a one-shot "just pressed E" flag, and
   `harvestRequested` is the same for "just pressed F" (hit a nearby
   stone/tree — see js/resources.js) — neither is part of the
   continuously-held `keys` state, so player.js reads and clears each one
   every frame and holding the key down doesn't retrigger the action.
   `throwRequested`/`keepRequested` ("T"/"R") are the same one-shot
   pattern, for throwing away or stashing into the inventory whatever's
   currently grabbed via E (see tryThrowGrabbedItem()/
   tryKeepGrabbedItem(), js/inventory.js) — both are no-ops if nothing's
   currently grabbed.
================================================================= */
const keys = {};
let zoom = ZOOM_MIN;
let collectRequested = false;
let harvestRequested = false;
let throwRequested = false;
let keepRequested = false;

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  // one-shot: ignore the browser's OS-level key-repeat events while E/F
  // is held, so holding it down doesn't keep re-triggering the action.
  if (k === "e" && !e.repeat) collectRequested = true;
  if (k === "f" && !e.repeat) harvestRequested = true;
  if (k === "t" && !e.repeat) throwRequested = true;
  if (k === "r" && !e.repeat) keepRequested = true;
  if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
});

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

window.addEventListener("wheel", (e) => {
  // Let the browser handle the wheel event normally (scrolling the
  // inventory grid) while the panel's open, instead of always hijacking
  // it for camera zoom — `inventoryOpen` is declared in inventory.js,
  // loaded after this file, but that's fine since this only reads it
  // when an actual wheel event fires (well after every script has run),
  // not at parse time. Bug this fixes: scrolling the inventory grid
  // (style.css's #inventory-grid) never worked before, because this
  // listener's unconditional preventDefault() blocked the browser's own
  // scroll on ANY element, everywhere on the page, all the time.
  if (inventoryOpen) return;
  e.preventDefault();
  zoom = clamp(zoom - Math.sign(e.deltaY) * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
}, { passive: false });

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
