"use strict";

/* =================================================================
   POPUPS on the phone — per request ("sa mobile yung skill button need pa
   diinan para di mawala dapat 1 click mag stay lang yung pop up kahit yung
   press g na pop up ... inventory quest kapag click sa labas mag close na").

   1. A tap on a phone button opens a popup on pointerdown; the browser then
      fires its own "click" (and on some phones a "mousedown") for that same
      tap, which lands on the popup's dark backdrop — and the backdrop closes
      the popup at once. Unless the finger was held down long enough. Now,
      for 450 ms after a phone button is pressed, those follow-up events are
      swallowed, so one tap opens it and it stays.
   2. Every popup closes when you tap / click outside its panel (the dark
      backdrop): Bag (B), Equipment (G), Skills (K), Quests (J), Profile (P),
      the map. Not in the first 300 ms after it opened (the same tap again).
================================================================= */
(() => {
  let tapAt = 0, tapEl = null;
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest && e.target.closest(".mb-btn, .mb button, #mb-settings button, #skill-bar .skill-btn, .skill-more, #daycycle-hud");
    if (b) { tapAt = performance.now(); tapEl = b; }
  }, true);
  const swallow = (e) => {
    if (performance.now() - tapAt > 450) return;
    if (tapEl && tapEl.contains(e.target)) return; // the button's own click still works
    e.stopPropagation(); e.preventDefault();
  };
  for (const ev of ["click", "mousedown", "mouseup"]) window.addEventListener(ev, swallow, true);

  // backdrop -> close
  const openedAt = new Map();
  const visible = (el) => el && getComputedStyle(el).display !== "none" && !el.classList.contains("hidden");
  const POPUPS = [
    ["inventory-overlay", () => { if (typeof inventoryOpen !== "undefined" && inventoryOpen) toggleInventory(); }],
    ["equipment-overlay", () => { if (typeof equipmentOpen !== "undefined" && equipmentOpen) toggleEquipment(); }],
    ["skill-overlay", () => { if (typeof toggleSkillWindow === "function") toggleSkillWindow(false); }],
    ["quest-overlay", () => { if (typeof toggleQuestPanel === "function") toggleQuestPanel(false); }],
    ["profile-overlay", () => { if (typeof toggleProfile === "function") toggleProfile(false); }],
  ];
  // note when each one becomes visible
  setInterval(() => {
    for (const [id] of POPUPS) {
      const el = document.getElementById(id);
      const v = visible(el);
      if (v && !openedAt.has(id)) openedAt.set(id, performance.now());
      if (!v) openedAt.delete(id);
    }
  }, 100);
  document.addEventListener("pointerdown", (e) => {
    for (const [id, close] of POPUPS) {
      const el = document.getElementById(id);
      if (!el || e.target !== el || !visible(el)) continue;
      const t = openedAt.get(id);
      if (t !== undefined && performance.now() - t < 300) continue;
      close();
      e.stopPropagation(); e.preventDefault();
    }
  }, true);
})();
