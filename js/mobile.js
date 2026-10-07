"use strict";

/* =================================================================
   MOBILE CONTROLS — the layout from the "AdventureNgani Mobile Controls"
   mockup, made real. Turns on by itself on a touch screen (or with
   ?mobile=1 in the address):
     - bottom left: the joystick (drag = W A S D) and Takbo (Shift on/off)
     - bottom right: ATTACK (F; its label follows what you hold: ESPADA,
       PANA), Kuha (E), Hagis (T), Itago (R)
     - top right: the minimap as a circle (tap = the full map), the round
       day/night monitor under it (tap = today's weather), and left of it two
       small buttons, Menu and Bag (B) — tap Menu and Profile (P) and Settings
       (Map, Save, Export, Import) drop down
     - top left: the bars (a bit smaller), with the time/date/weather card
       under them (the game's own HUD)
   Every button just presses the same key the keyboard would, so nothing
   behaves differently from the desktop. Tapping a mob attacks it (a tap is
   a click). The page doesn't scroll or zoom.
================================================================= */
const MOBILE_ON = (() => {
  try {
    if (/[?&]mobile=0\b/.test(location.search)) return false;
    if (/[?&]mobile=1\b/.test(location.search)) return true;
    return !!(window.matchMedia && matchMedia("(pointer: coarse)").matches) || "ontouchstart" in window || navigator.maxTouchPoints > 0;
  } catch (e) { return false; }
})();

// Settings > Quality: "Sharp" (full resolution — the default, per request) or "Smooth" (half, faster).
let MOBILE_RENDER_SCALE = 1;
try { const q = localStorage.getItem("agn-render-scale"); if (q === "0.5") MOBILE_RENDER_SCALE = 0.5; } catch (e) { /* private mode */ }
function mobileKey(key, down) {
  window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key, bubbles: true }));
}
function mobileTap(key) { mobileKey(key, true); setTimeout(() => mobileKey(key, false), 60); }

if (MOBILE_ON) {
  document.body.classList.add("mobile");
  if (typeof BOW_RANGE !== "undefined") BOW_RANGE = 3 * TILE; // the phone's bow reach (per request); the desktop keeps 5
  zoom = MOBILE_ZOOM; // phone camera (js/config.js)
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
  const css = document.createElement("style");
  css.textContent = `
  body.mobile { overscroll-behavior: none; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  body.mobile #top-toolbar { display: none !important; }
  body.mobile #vignette-blur { display: none !important; } /* a full-screen backdrop blur: very heavy on a phone */
  body.mobile #hotbar { zoom: 0.66; } /* the 10 slots fit between the joystick and the action buttons */
  body.mobile #minimap { position: fixed !important; right: 14px !important; top: 10px !important; left: auto !important; bottom: auto !important;
    width: 96px !important; height: 96px !important; border-radius: 50%; border: 3px solid #a8743e; box-shadow: 0 3px 0 #3b2a1e; z-index: 45; }
  .mb { position: fixed; z-index: 46; font-family: 'Pixelify Sans', ui-monospace, monospace; color: #f3e2c3; -webkit-tap-highlight-color: transparent; }
  .mb-btn { background: #3b2a1e; border: 2px solid #a8743e; border-radius: 10px; color: #f3e2c3; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 2px; font: 9px 'Pixelify Sans', ui-monospace, monospace; padding: 0; touch-action: none; }
  .mb-btn:active, .mb-btn.on { background: #6b4a2e; }
  .mb-round { border-radius: 50%; border-width: 3px; }
  .mb-btn svg { pointer-events: none; }
  #mb-stick { left: 22px; bottom: 22px; width: 128px; height: 128px; border-radius: 50%; background: rgba(26,17,10,0.45); border: 3px solid rgba(243,226,195,0.55); touch-action: none; }
  #mb-knob { position: absolute; left: 37px; top: 37px; width: 54px; height: 54px; border-radius: 50%; background: #f3e2c3; border: 3px solid #a8743e; box-shadow: 0 2px 0 #3b2a1e; pointer-events: none; box-sizing: border-box; }
  #mb-run { display: none !important; } /* per request: no run button — hold the stick 3 s to run */
  #mb-map { right: 98px; top: 84px; width: 28px; height: 28px; border-radius: 50%; z-index: 47; }
  #mb-map svg { width: 15px; height: 15px; }
  #mb-run.on { background: #4a6b2e; }
  #mb-attack { right: 30px; bottom: 30px; width: 88px; height: 88px; background: #b23a32; border-color: #f3e2c3; box-shadow: 0 4px 0 #5a1612; color: #fff; font-size: 11px; font-weight: 700; }
  #mb-attack:active { background: #8e2c26; }
  /* Per request: icons only; ONE Hold button (E) — Throw (T) and Keep (R) only show while something is held,
     right beside it; the three skills sit where Throw / Keep used to be, round the ATTACK button. */
  #mb-grab { right: 132px; bottom: 22px; width: 54px; height: 54px; }
  #mb-throw { right: 196px; bottom: 74px; width: 44px; height: 44px; display: none; }
  #mb-keep { right: 196px; bottom: 22px; width: 44px; height: 44px; display: none; }
  body.mobile.holding #mb-throw, body.mobile.holding #mb-keep { display: flex; }
  #mb-run span, #mb-attack span, #mb-grab span { display: none; }
  /* the skills (js/skills.js #skill-bar) as round buttons in the cluster */
  body.mobile #skill-bar { display: contents; }
  body.mobile #skill-bar .skill-btn[data-skill] { position: fixed; z-index: 46; width: 50px; height: 50px; border-radius: 50%; border-width: 3px; }
  body.mobile #skill-bar .skill-btn[data-skill] img { width: 28px; height: 28px; margin-top: 0; }
  body.mobile #skill-bar .skill-btn[data-skill] .cd { border-radius: 50%; }
  body.mobile #skill-bar .skill-btn .key, body.mobile #skill-bar .skill-btn .st { display: none; }
  body.mobile #skill-bar .skill-btn[data-skill="slash"] { right: 124px; bottom: 92px; }
  body.mobile #skill-bar .skill-btn[data-skill="stun"] { right: 78px; bottom: 140px; }
  body.mobile #skill-bar .skill-btn[data-skill="teleport"] { right: 16px; bottom: 150px; }
  body.mobile #skill-bar .skill-more { display: none; } /* the skills window: in the top row now */
  /* the round day/night monitor sits under the minimap, centred on it */
  body.mobile #daycycle-hud { position: fixed; right: 30px; top: 112px; width: 64px !important; height: 69px !important; z-index: 48; pointer-events: auto; touch-action: none; }
  /* Equipment (G) button, right under the day/night circle, centred on it */
  #mb-equip { right: 44px; top: 186px; width: 36px; height: 36px; z-index: 48; }
  #mb-equip .mb-key { position: absolute; right: -5px; bottom: -5px; min-width: 14px; height: 14px; line-height: 14px; font-size: 9px; font-weight: 700; background: #a8743e; color: #2a1d14; border-radius: 7px; text-align: center; pointer-events: none; }
  /* top left: just the bars now, a bit smaller */
  body.mobile #left-hud { top: 8px; left: 8px; gap: 4px; }
  body.mobile #stat-section { width: 128px; box-sizing: border-box; padding: 4px 6px; gap: 3px; }
  body.mobile .stat-bar { height: 12px; border-radius: 4px; }
  body.mobile .stat-bar-label { font-size: 8.5px; }
  body.mobile #calendar-section, body.mobile #position-section { width: 128px; padding: 3px 6px; }
  body.mobile .hud-row, body.mobile #clock-hud { font-size: 9.5px; }
  /* the full-screen blur on sunny days is very heavy on a phone GPU */
  body.mobile #vignette-blur { display: none !important; }
  /* Menu + Bag: small, side by side, left of the minimap (where the monitor was).
     The icons are 15x15; the buttons stay 30x30 so a thumb can still hit them. */
  #mb-menu-col { right: 122px; top: 10px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  #mb-top-row { display: flex; flex-direction: row; gap: 8px; }
  #mb-top-row .mb-btn { width: 26px; height: 26px; border-radius: 7px; position: relative; }
  #mb-top-row .mb-btn svg { width: 14px; height: 14px; }
  #mb-top-row { gap: 6px; }
  #mb-top-row .pts { position: absolute; right: -4px; top: -4px; min-width: 12px; font-size: 9px; line-height: 12px; background: #e04040; color: #fff; border-radius: 6px; padding: 0 2px; }
  #mb-top-row .pts:empty { display: none; }
  #mb-drop .mb-btn { width: 44px; height: 44px; }
  #mb-drop { display: none; flex-direction: column; gap: 6px; }
  #mb-drop.open { display: flex; }
  #mb-settings { right: 122px; top: 42px; display: none; flex-direction: column; gap: 6px; padding: 8px; background: #2a1d14; border: 2px solid #a8743e; border-radius: 10px; }
  #mb-settings.open { display: flex; }
  #mb-settings button { min-width: 120px; min-height: 40px; background: #3b2a1e; border: 2px solid #a8743e; border-radius: 8px; color: #f3e2c3; font: 12px 'Pixelify Sans', ui-monospace, monospace; }
  `;
  document.head.appendChild(css);
  const font = document.createElement("link");
  font.rel = "stylesheet"; font.href = "https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&display=swap";
  document.head.appendChild(font);

  const ICON = {
    sword: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3.5L20 3l-.5 5.5L9 19l-4-4z"/><path d="M5 15l-2 2 4 4 2-2"/><path d="M12 7l5 5"/></svg>',
    bow: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3c8 3 8 15 0 18"/><path d="M6 3v18"/><path d="M4 12h14"/><path d="M15 9l3 3-3 3"/></svg>',
    hand: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11V5a1.5 1.5 0 0 1 3 0v5"/><path d="M11 10V4a1.5 1.5 0 0 1 3 0v6"/><path d="M14 10V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.5-1.5L8 14"/></svg>',
    throw: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18c4-8 10-12 16-12"/><path d="M15 3l5 3-3 5"/></svg>',
    keep: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16v11H4z"/><path d="M3 5h18v4H3z"/><path d="M10 13h4"/></svg>',
    run: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="4" r="2"/><path d="M8 21l3-6 3 2v4"/><path d="M6 12l3-4h5l3 4"/></svg>',
    menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>',
    profile: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
    bag: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M4.9 4.9L7 7"/><path d="M17 17l2.1 2.1"/><path d="M4.9 19.1L7 17"/><path d="M17 7l2.1-2.1"/></svg>',
    sun: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M5 5l1.5 1.5"/><path d="M17.5 17.5L19 19"/><path d="M5 19l1.5-1.5"/><path d="M17.5 6.5L19 5"/></svg>',
    rain: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14a4 4 0 0 1 1-7.9A5 5 0 0 1 17 7a3.5 3.5 0 0 1 1 7z"/><path d="M8 18l-1 3"/><path d="M12 18l-1 3"/><path d="M16 18l-1 3"/></svg>',
    snow: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20"/><path d="M4 7l16 10"/><path d="M20 7L4 17"/></svg>',
  };
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };
  const add = (html) => { const n = el(html); document.body.appendChild(n); return n; };

  // joystick
  const stick = add('<div id="mb-stick" class="mb" aria-label="Joystick"><div id="mb-knob"></div></div>');
  const knob = stick.querySelector("#mb-knob");
  const held = new Set();
  const setDirs = (want) => {
    for (const k of held) if (!want.has(k)) { mobileKey(k, false); held.delete(k); }
    for (const k of want) if (!held.has(k)) { mobileKey(k, true); held.add(k); }
  };
  let stickId = null, stickHasDir = false;
  const moveStick = (e) => {
    const r = stick.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2;
    let dx = e.clientX - r.left - cx, dy = e.clientY - r.top - cy;
    const d = Math.hypot(dx, dy), max = 42;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    knob.style.left = (37 + dx) + "px"; knob.style.top = (37 + dy) + "px";
    const want = new Set();
    if (d > 10) { // 8 directions
      const a = Math.atan2(dy, dx);
      if (Math.cos(a) > 0.38) want.add("d"); else if (Math.cos(a) < -0.38) want.add("a");
      if (Math.sin(a) > 0.38) want.add("s"); else if (Math.sin(a) < -0.38) want.add("w");
    }
    setDirs(want);
    stickHasDir = want.size > 0;
  };
  stick.addEventListener("pointerdown", (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); e.preventDefault(); });
  stick.addEventListener("pointermove", (e) => { if (e.pointerId === stickId) moveStick(e); });
  const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; stickHasDir = false; knob.style.left = "37px"; knob.style.top = "37px"; setDirs(new Set()); };
  // Per request: no run button — keep the stick held (in any direction) for 3 seconds and you start
  // running, easing up from walking to running speed (MOBILE_RUN_BLEND, js/config.js mobileSpeedMult());
  // let go (or stop pushing) and it's back to walking.
  let stickHeld = 0, runOn = false, lastRunT = performance.now();
  const runTick = (now) => {
    const dt = Math.min(0.1, (now - lastRunT) / 1000); lastRunT = now;
    if (stickHasDir) stickHeld += dt; else stickHeld = 0;
    const want = stickHeld >= 3;
    if (want && !runOn) { runOn = true; mobileKey("Shift", true); }
    if (!want && runOn) { runOn = false; mobileKey("Shift", false); }
    const target = want ? 1 : 0;
    MOBILE_RUN_BLEND += Math.sign(target - MOBILE_RUN_BLEND) * Math.min(Math.abs(target - MOBILE_RUN_BLEND), dt / 0.7); // ~0.7 s from walk to full run
    requestAnimationFrame(runTick);
  };
  requestAnimationFrame(runTick);
  stick.addEventListener("pointerup", endStick); stick.addEventListener("pointercancel", endStick);

  // buttons that press a key once
  const tapBtn = (id, cls, inner, key, label) => {
    const b = add(`<button id="${id}" class="mb mb-btn ${cls}" aria-label="${label}">${inner}</button>`);
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); if (typeof key === "function") key(); else mobileTap(key); });
    return b;
  };
  const runBtn = tapBtn("mb-run", "mb-round", ICON.run + "<span></span>", () => {
    const on = !runBtn.classList.contains("on");
    runBtn.classList.toggle("on", on);
    mobileKey("Shift", on);
  }, "Run");
  const attackBtn = tapBtn("mb-attack", "mb-round", ICON.sword, "f", "Attack");
  // a little map button on the minimap: the full map of where you are (you blinking on it) + the World tab
  const ICON_MAP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>';
  tapBtn("mb-map", "mb-round", ICON_MAP, () => { if (typeof toggleMap === "function") toggleMap(true, "map"); }, "Map");
  tapBtn("mb-grab", "mb-round", ICON.hand, "e", "Hold");
  tapBtn("mb-throw", "mb-round", ICON.throw, "t", "Throw");
  tapBtn("mb-keep", "mb-round", ICON.keep, "r", "Keep");
  // Equipment (G) — under the day/night circle; presses G, same as the keyboard
  const ICON_EQUIP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 3l-5 3 2 5 2-1v11h10V10l2 1 2-5-5-3a4 4 0 0 1-8 0z"/></svg>';
  tapBtn("mb-equip", "mb-round", ICON_EQUIP + '<b class="mb-key">G</b>', "g", "Equipment");
  // Throw / Keep only while something is held (grabbed with E, or picked up to place)
  setInterval(() => { document.body.classList.toggle("holding", !!(player.grabbedType || player.mode === "carrying" || (typeof heldItem !== "undefined" && heldItem))); }, 150);
  // the attack button follows what's equipped
  let lastWeaponKind = "";
  setInterval(() => {
    const d = player.equippedWeapon && itemDefs[player.equippedWeapon];
    const kind = d && d.weapon ? (d.weapon.ranged ? "bow" : "sword") : "none";
    if (kind === lastWeaponKind) return;
    lastWeaponKind = kind;
    attackBtn.innerHTML = kind === "bow" ? ICON.bow : ICON.sword;
  }, 300);

  // the day/night monitor (top right, under the minimap): tap = today's weather
  const dayMon = document.getElementById("daycycle-hud");
  // out of #left-hud (its z-index 30 would keep the monitor under the minimap)
  if (dayMon) document.body.appendChild(dayMon);
  if (dayMon) dayMon.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    const w = typeof currentWeather !== "undefined" ? currentWeather : null;
    if (typeof showToast === "function") showToast("Weather today: " + (w ? (w.name || w.id || w) : "—"));
  });

  // Menu -> Profile, Bag, Settings (drop down)
  // Per request: no Menu drop-down any more — Profile, Bag, Skills and Settings side by side in the top row, smaller
  const ICON_QUEST = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6"/><path d="M6 3a2 2 0 0 0-2 2v2h4"/><path d="M6 21a2 2 0 0 1-2-2v-2h4"/><path d="M10 8h6"/><path d="M10 12h6"/><path d="M10 16h4"/></svg>';
  const ICON_SKILL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.6 6.6L21 9l-5 4.4L17.6 21 12 17.3 6.4 21 8 13.4 3 9l6.4-.4z"/></svg>';
  const col = add(`<div id="mb-menu-col" class="mb">
    <div id="mb-top-row">
      <button class="mb-btn" data-a="profile" aria-label="Profile">${ICON.profile}</button>
      <button class="mb-btn" data-a="bag" aria-label="Bag">${ICON.bag}</button>
      <button class="mb-btn" data-a="quests" aria-label="Quests">${ICON_QUEST}<span class="pts qpts"></span></button>
      <button class="mb-btn" data-a="skills" aria-label="Skills">${ICON_SKILL}<span class="pts"></span></button>
      <button class="mb-btn" data-a="settings" aria-label="Settings">${ICON.gear}</button>
    </div></div>`);
  setInterval(() => { const q = col.querySelector(".qpts"); if (q && typeof QUESTS !== "undefined") { const n = QUESTS.filter((x) => (questActive(x.id) && x.turnIn && questObjectivesMet(x))).length; q.textContent = n ? "?" : ""; } }, 600);
  setInterval(() => { const p = col.querySelector(".pts:not(.qpts)"); if (p && typeof skillPointsLeft === "function") { const n = skillPointsLeft(); p.textContent = n > 0 ? n : ""; } }, 500);
  const settings = add(`<div id="mb-settings" class="mb">
    <button data-s="map">Map</button><button data-s="save">Save</button><button data-s="export">Export</button><button data-s="import">Import</button><button data-s="fps">FPS</button><button data-s="quality" id="mb-quality">Quality: ${MOBILE_RENDER_SCALE < 1 ? "Smooth" : "Sharp"}</button><button data-s="view" id="mb-view">View: ${typeof MOBILE_RENDER_TILES !== "undefined" && MOBILE_RENDER_TILES > 0 ? MOBILE_RENDER_TILES + "x" + MOBILE_RENDER_TILES : "Full"}</button></div>`);
  const clickToolbar = (re) => { for (const b of document.querySelectorAll("#top-toolbar button")) if (re.test(b.textContent)) { b.click(); return true; } return false; };
  col.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const a = b.dataset.a;
    if (a === "profile") mobileTap("p");
    else if (a === "skills") { if (typeof toggleSkillWindow === "function") toggleSkillWindow(); }
    else if (a === "quests") { if (typeof toggleQuestPanel === "function") toggleQuestPanel(); }
    else if (a === "bag") mobileTap("b");
    else if (a === "settings") settings.classList.toggle("open");
  });
  settings.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const s = b.dataset.s;
    if (s === "map") { if (typeof toggleMap === "function") toggleMap(true, "world"); else clickToolbar(/Map/); }
    else if (s === "save") clickToolbar(/Save/);
    else if (s === "export") clickToolbar(/Export/);
    else if (s === "import") clickToolbar(/Import/);
    else if (s === "fps") toggleFps();
    else if (s === "quality") {
      MOBILE_RENDER_SCALE = MOBILE_RENDER_SCALE < 1 ? 1 : 0.5;
      try { localStorage.setItem("agn-render-scale", String(MOBILE_RENDER_SCALE)); } catch (e) { /* ignore */ }
      b.textContent = "Quality: " + (MOBILE_RENDER_SCALE < 1 ? "Smooth" : "Sharp");
      resizeCanvas();
    }
    else if (s === "view") {
      // Settings > View: the render window (js/renderwindow.js) — 10x10 / 16x16 / 20x20 tiles round you,
      // or Full (the whole screen + 4 tiles). Each tap goes to the next one.
      const VIEWS = [10, 16, 20, 0];
      MOBILE_RENDER_TILES = VIEWS[(VIEWS.indexOf(MOBILE_RENDER_TILES) + 1) % VIEWS.length];
      try { localStorage.setItem("agn-view-tiles", String(MOBILE_RENDER_TILES)); } catch (e) { /* ignore */ }
      b.textContent = "View: " + (MOBILE_RENDER_TILES > 0 ? MOBILE_RENDER_TILES + "x" + MOBILE_RENDER_TILES : "Full");
    }
    if (s !== "view") settings.classList.remove("open"); // View: stay open so you can tap through the sizes
  });

  // FPS readout (Settings > FPS) — top centre, to see how smooth it runs on this phone
  let fpsEl = null, fpsOn = false, fpsFrames = 0, fpsLast = 0;
  function toggleFps() {
    fpsOn = !fpsOn;
    if (!fpsEl) {
      fpsEl = add('<div id="mb-fps" class="mb" style="left:50%;top:6px;transform:translateX(-50%);padding:2px 8px;background:rgba(26,17,10,0.7);border:1px solid #a8743e;border-radius:6px;font-size:12px;pointer-events:none"></div>');
    }
    fpsEl.style.display = fpsOn ? "block" : "none";
    if (fpsOn) { fpsFrames = gameFrames(); fpsLast = performance.now(); requestAnimationFrame(fpsTick); }
  }
  // Counts the frames the game actually DREW (js/main.js), not screen refreshes —
  // with the 60 FPS cap a 120 Hz screen would otherwise read 120.
  const gameFrames = () => (typeof gameFrameCount !== "undefined" ? gameFrameCount : 0);
  function fpsTick(now) {
    if (!fpsOn) return;
    if (now - fpsLast >= 500) { const f = gameFrames(); fpsEl.textContent = Math.round((f - fpsFrames) * 1000 / (now - fpsLast)) + " FPS"; fpsFrames = f; fpsLast = now; }
    requestAnimationFrame(fpsTick);
  }

  // no page scroll / pinch zoom / long-press menus while playing
  document.addEventListener("touchmove", (e) => { if (!e.target.closest || !e.target.closest("#inventory, #npc-shop-overlay, #profile-overlay, .scroll-ok")) e.preventDefault(); }, { passive: false });
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("gesturestart", (e) => e.preventDefault());
}
