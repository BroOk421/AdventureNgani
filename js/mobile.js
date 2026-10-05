"use strict";

/* =================================================================
   MOBILE CONTROLS — the layout from the "AdventureNgani Mobile Controls"
   mockup, made real. Turns on by itself on a touch screen (or with
   ?mobile=1 in the address):
     - bottom left: the joystick (drag = W A S D) and Takbo (Shift on/off)
     - bottom right: ATTACK (F; its label follows what you hold: ESPADA,
       PANA), Kuha (E), Hagis (T), Itago (R)
     - top right: the minimap as a circle (tap = the full map), a weather
       bubble on it (tap = today's weather), and under it Menu — tap it and
       Profile (P), Bag (B) and Settings (Map, Save, Export, Import) drop down
     - top left: the bars, with the time/date/weather card under them (the
       game's own HUD)
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

function mobileKey(key, down) {
  window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key, bubbles: true }));
}
function mobileTap(key) { mobileKey(key, true); setTimeout(() => mobileKey(key, false), 60); }

if (MOBILE_ON) {
  document.body.classList.add("mobile");
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
  const css = document.createElement("style");
  css.textContent = `
  body.mobile { overscroll-behavior: none; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  body.mobile #top-toolbar { display: none !important; }
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
  #mb-run { left: 160px; bottom: 30px; width: 54px; height: 54px; }
  #mb-run.on { background: #4a6b2e; }
  #mb-attack { right: 30px; bottom: 30px; width: 88px; height: 88px; background: #b23a32; border-color: #f3e2c3; box-shadow: 0 4px 0 #5a1612; color: #fff; font-size: 11px; font-weight: 700; }
  #mb-attack:active { background: #8e2c26; }
  #mb-grab { right: 128px; bottom: 26px; width: 58px; height: 58px; }
  #mb-throw { right: 120px; bottom: 98px; width: 50px; height: 50px; }
  #mb-keep { right: 58px; bottom: 128px; width: 50px; height: 50px; }
  #mb-weather { right: 86px; top: 4px; width: 50px; height: 50px; color: #e8c84a; box-shadow: 0 2px 0 #1a110a; z-index: 47; }
  #mb-menu-col { right: 38px; top: 114px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  #mb-menu-col .mb-btn { width: 48px; height: 48px; }
  #mb-drop { display: none; flex-direction: column; gap: 6px; }
  #mb-drop.open { display: flex; }
  #mb-settings { right: 96px; top: 114px; display: none; flex-direction: column; gap: 6px; padding: 8px; background: #2a1d14; border: 2px solid #a8743e; border-radius: 10px; }
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
  let stickId = null;
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
  };
  stick.addEventListener("pointerdown", (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); e.preventDefault(); });
  stick.addEventListener("pointermove", (e) => { if (e.pointerId === stickId) moveStick(e); });
  const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; knob.style.left = "37px"; knob.style.top = "37px"; setDirs(new Set()); };
  stick.addEventListener("pointerup", endStick); stick.addEventListener("pointercancel", endStick);

  // buttons that press a key once
  const tapBtn = (id, cls, inner, key, label) => {
    const b = add(`<button id="${id}" class="mb mb-btn ${cls}" aria-label="${label}">${inner}</button>`);
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); if (typeof key === "function") key(); else mobileTap(key); });
    return b;
  };
  const runBtn = tapBtn("mb-run", "mb-round", ICON.run + "<span>Takbo</span>", () => {
    const on = !runBtn.classList.contains("on");
    runBtn.classList.toggle("on", on); runBtn.querySelector("span").textContent = on ? "Takbo ON" : "Takbo";
    mobileKey("Shift", on);
  }, "Run");
  const attackBtn = tapBtn("mb-attack", "mb-round", ICON.sword + "<span>ATTACK</span>", "f", "Attack");
  tapBtn("mb-grab", "mb-round", ICON.hand + "<span>Kuha</span>", "e", "Interact");
  tapBtn("mb-throw", "mb-round", ICON.throw + "<span>Hagis</span>", "t", "Throw");
  tapBtn("mb-keep", "mb-round", ICON.keep + "<span>Itago</span>", "r", "Keep");
  // the attack button follows what's equipped
  let lastWeaponKind = "";
  setInterval(() => {
    const d = player.equippedWeapon && itemDefs[player.equippedWeapon];
    const kind = d && d.weapon ? (d.weapon.ranged ? "bow" : "sword") : "none";
    if (kind === lastWeaponKind) return;
    lastWeaponKind = kind;
    attackBtn.innerHTML = (kind === "bow" ? ICON.bow : ICON.sword) + "<span>" + (kind === "bow" ? "PANA" : kind === "sword" ? "ESPADA" : "ATTACK") + "</span>";
  }, 300);

  // weather bubble on the minimap
  const weatherBtn = tapBtn("mb-weather", "mb-round", ICON.sun, () => {
    const w = typeof currentWeather !== "undefined" ? currentWeather : null;
    if (typeof showToast === "function") showToast("Panahon ngayon: " + (w ? (w.name || w.id || w) : "—"));
  }, "Weather");
  setInterval(() => {
    const w = typeof currentWeather !== "undefined" && currentWeather ? String(currentWeather.id || currentWeather.name || currentWeather).toLowerCase() : "";
    const icon = /rain/.test(w) ? ICON.rain : /snow/.test(w) ? ICON.snow : ICON.sun;
    if (weatherBtn.dataset.icon !== icon) { weatherBtn.innerHTML = icon; weatherBtn.dataset.icon = icon; }
  }, 1000);

  // Menu -> Profile, Bag, Settings (drop down)
  const col = add(`<div id="mb-menu-col" class="mb">
    <button class="mb-btn" data-a="menu" aria-label="Menu" aria-expanded="false">${ICON.menu}<span>Menu</span></button>
    <div id="mb-drop">
      <button class="mb-btn" data-a="profile" aria-label="Profile">${ICON.profile}<span>Profile</span></button>
      <button class="mb-btn" data-a="bag" aria-label="Bag">${ICON.bag}<span>Bag</span></button>
      <button class="mb-btn" data-a="settings" aria-label="Settings">${ICON.gear}<span>Settings</span></button>
    </div></div>`);
  const drop = col.querySelector("#mb-drop"), menuBtn = col.querySelector('[data-a="menu"]');
  const settings = add(`<div id="mb-settings" class="mb">
    <button data-s="map">Map</button><button data-s="save">Save</button><button data-s="export">Export</button><button data-s="import">Import</button></div>`);
  const clickToolbar = (re) => { for (const b of document.querySelectorAll("#top-toolbar button")) if (re.test(b.textContent)) { b.click(); return true; } return false; };
  col.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const a = b.dataset.a;
    if (a === "menu") { const open = !drop.classList.contains("open"); drop.classList.toggle("open", open); menuBtn.classList.toggle("on", open); menuBtn.setAttribute("aria-expanded", String(open)); if (!open) settings.classList.remove("open"); }
    else if (a === "profile") mobileTap("p");
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
    settings.classList.remove("open");
  });

  // no page scroll / pinch zoom / long-press menus while playing
  document.addEventListener("touchmove", (e) => { if (!e.target.closest || !e.target.closest("#inventory, #npc-shop-overlay, #profile-overlay, .scroll-ok")) e.preventDefault(); }, { passive: false });
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("gesturestart", (e) => e.preventDefault());
}
