"use strict";

/* =================================================================
   TITLE SCREEN — per request ("gawa ka ng parang parallax na intro may
   mount everest na may snow tapos yung town na may mga puno tyaka lalabas
   yung mismong name ng game tapos sa baba may mga buttons play, load,
   settings at exit ...").

   - The intro: the layers (assets/title/, tools/build_title_art.py) rise into
     place at different speeds — the snowy summit barely moves, the town and
     the trees in front a lot — then the name drops in and the buttons come
     up. Afterwards the scene keeps drifting slowly (parallax with the mouse /
     the phone's tilt), snow blows off the summit, chimneys smoke, lamps glow,
     birds cross, a few flakes fall. Tap during the intro to skip it.
   - Play: fades to black and starts the game where it was left (the last
     slot played; a new game in slot 1 if there's none).
   - Load: the save slots (SAVE_SLOT_COUNT) — place, level, gold, play time,
     quest, when saved; Load / New Game, Export, Delete; Import (top right)
     puts a save file into the slot you pick.
   - Settings: graphics (renderer, quality, FPS limit, view), music (volume,
     on/off), language (English / Filipino — the menus), controls.
   - Exit: closes the app (Capacitor App plugin); in a browser tab, a note.
   Loaded before everything else (index.html), so it shows while the game's
   images load. Skipped with ?notitle=1 and in automated browsers (tests).
================================================================= */

const SAVE_SLOT_COUNT = 3;
function saveSlotKey(n) { return n === 1 ? "rpg-prototype-save-v1" : "rpg-prototype-save-v1-slot" + n; }
function getActiveSlot() { try { const n = +localStorage.getItem("agn-active-slot"); return n >= 1 && n <= SAVE_SLOT_COUNT ? n : 1; } catch (e) { return 1; } }
function setActiveSlot(n) {
  try { localStorage.setItem("agn-active-slot", String(n)); } catch (e) { /* ignore */ }
  try { if (typeof SAVE_KEY !== "undefined") SAVE_KEY = saveSlotKey(n); } catch (e) { console.warn("save slots need the newer js/save.js", e); } // eslint-disable-line no-global-assign
}
function readSlotRaw(n) { try { return localStorage.getItem(saveSlotKey(n)); } catch (e) { return null; } }

/* ---------------- language ---------------- */
const TITLE_STRINGS = {
  en: {
    play: "Play", load: "Load", settings: "Settings", exit: "Exit", newGame: "New Game", continueFrom: "Continue",
    loading: "Loading…", loadTitle: "Load Game", import: "Import", close: "Close", slot: "Slot", empty: "Empty slot",
    loadBtn: "Load", del: "Delete", sure: "Sure?", exportBtn: "Export", pickSlot: "Choose a slot for the imported save", cancel: "Cancel",
    imported: "Imported into slot", importBad: "That file isn't a save file", storageFull: "Not enough space — delete a slot or export it first",
    settingsTitle: "Settings", graphics: "Graphics", audio: "Music", language: "Language", controls: "Controls",
    renderer: "Renderer", quality: "Quality", sharp: "Sharp", smooth: "Smooth", fps: "FPS limit", view: "View distance", full: "Full",
    sun: "Sun & shadows", sunNote: "Long shadows and warm light outside", music: "Music", volume: "Volume", on: "On", off: "Off", phoneOnly: "phone only", restart: "Restarts the game screen",
    exitMsg: "You can close this tab now.", lv: "Lv", gold: "gold", saved: "Saved", quest: "Quest", active: "last played",
    mainMenu: "Main Menu", inside: "inside", langNote: "Menus and buttons. The story text stays in English for now.",
    tips: [["WASD / Arrows", "Move (Shift = run)"], ["E", "Pick up / put down"], ["F", "Attack / use tool"], ["B / G / P", "Bag / Equipment / Profile"],
      ["J / K", "Quests / Skills"], ["Z X C", "Skills"], ["1-9, 0", "Hotbar"], ["Mouse wheel", "Zoom"]],
    deleted: "Slot deleted", newConfirm: "Start a new game in this slot?",
  },
  fil: {
    play: "Laro", load: "I-load", settings: "Settings", exit: "Lumabas", newGame: "Bagong Laro", continueFrom: "Ituloy",
    loading: "Naglo-load…", loadTitle: "I-load ang Laro", import: "Import", close: "Isara", slot: "Slot", empty: "Walang laman",
    loadBtn: "I-load", del: "Burahin", sure: "Sigurado?", exportBtn: "Export", pickSlot: "Pumili ng slot para sa ini-import na save", cancel: "Kanselahin",
    imported: "Na-import sa slot", importBad: "Hindi save file ang file na iyan", storageFull: "Kulang ang space — magbura o mag-export muna ng slot",
    settingsTitle: "Settings", graphics: "Graphics", audio: "Musika", language: "Wika", controls: "Kontrol",
    renderer: "Renderer", quality: "Kalidad", sharp: "Malinaw", smooth: "Magaan", fps: "FPS limit", view: "Layo ng tanaw", full: "Buo",
    sun: "Araw at anino", sunNote: "Mahahabang anino at mainit na liwanag sa labas", music: "Musika", volume: "Lakas", on: "On", off: "Off", phoneOnly: "sa phone lang", restart: "Magre-restart ang screen",
    exitMsg: "Puwede mo nang isara ang tab na ito.", lv: "Lv", gold: "gold", saved: "Na-save", quest: "Quest", active: "huling nilaro",
    mainMenu: "Main Menu", inside: "sa loob", langNote: "Mga menu at button. English pa rin muna ang kuwento sa laro.",
    tips: [["WASD / Arrows", "Lakad (Shift = takbo)"], ["E", "Pulot / lapag"], ["F", "Atake / gamitin ang tool"], ["B / G / P", "Bag / Gamit / Profile"],
      ["J / K", "Quests / Skills"], ["Z X C", "Skills"], ["1-9, 0", "Hotbar"], ["Mouse wheel", "Zoom"]],
    deleted: "Nabura ang slot", newConfirm: "Magsimula ng bagong laro sa slot na ito?",
  },
};
let titleLang = "en";
try { if (localStorage.getItem("agn-lang") === "fil") titleLang = "fil"; } catch (e) { /* ignore */ }
function tt(k) { return (TITLE_STRINGS[titleLang] && TITLE_STRINGS[titleLang][k]) || TITLE_STRINGS.en[k] || k; }

const TITLE_ON = !(/[?&]notitle=1\b/.test(location.search) || (navigator.webdriver && !/[?&]title=1\b/.test(location.search)));
let titleGameAssetsReady = false, titlePendingStart = null, titleStarted = false;

// main.js: whenAssetsReady(...) -> this. Without the title, the game starts as before.
function titleOnAssetsReady() {
  titleGameAssetsReady = true;
  if (!TITLE_ON) { titleStarted = true; start(); if (typeof Music !== "undefined") Music.play("day"); return; }
  if (titlePendingStart) { const f = titlePendingStart; titlePendingStart = null; f(); }
  titleRefreshPlayLabel();
}

/* ---------------- slot info ---------------- */
function slotInfo(n) {
  const raw = readSlotRaw(n);
  if (!raw) return null;
  let d;
  try { d = JSON.parse(raw); } catch (e) { return { broken: true }; }
  const r = d.resume || {};
  const w = r.world || "wild";
  let place = typeof worldLabel === "function" ? worldLabel(w)[0] : w;
  if (r.scene === "inside" && r.room) {
    const room = String(r.room).split("@")[0].replace(/_room$/, "").replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/_/g, " ");
    place += " · " + room.charAt(0).toUpperCase() + room.slice(1);
  }
  const q = d.quests && d.quests.tracked && typeof QUEST_BY_ID !== "undefined" && QUEST_BY_ID[d.quests.tracked];
  const secs = Math.max(0, +d.playTimeSeconds || 0);
  return { place, level: d.level || 1, gold: d.gold || 0, time: Math.floor(secs / 3600) + "h " + String(Math.floor(secs / 60) % 60).padStart(2, "0") + "m",
    quest: q ? q.title : "", savedAt: d.savedAt || 0, size: raw.length };
}
// The slot Play continues: the last one played, or (if that one's empty) the latest save.
function bestSlot() {
  const a = getActiveSlot();
  if (readSlotRaw(a)) return a;
  let best = 0, at = -1;
  for (let i = 1; i <= SAVE_SLOT_COUNT; i++) { const s = slotInfo(i); if (s && !s.broken && s.savedAt > at) { at = s.savedAt; best = i; } }
  return best || a;
}
function anySlotUsed() { for (let i = 1; i <= SAVE_SLOT_COUNT; i++) if (readSlotRaw(i)) return true; return false; }
function fmtSaved(ts) {
  if (!ts) return "—";
  const d = new Date(ts), p = (x) => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

/* ---------------- DOM ---------------- */
const TITLE_CSS = `
#agn-title { position: fixed; inset: 0; z-index: 100000; background: #10131f; overflow: hidden; user-select: none; -webkit-user-select: none; touch-action: none; }
#agn-title canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; image-rendering: crisp-edges; }
#agn-title .ttl-menu { position: absolute; left: 50%; top: 41%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: stretch; gap: 9px; }
.agn-btn { position: relative; width: 250px; padding: 6px 18px 7px; border: 3px solid #a8743e; border-radius: 10px; color: #ffe7b0;
  background: linear-gradient(#5a3d26, #3b2818); box-shadow: 0 3px 0 #23170d, inset 0 2px 0 rgba(255,220,160,.25), 0 6px 16px rgba(0,0,0,.45);
  font: 700 19px 'Pixelify Sans', ui-monospace, monospace; letter-spacing: 1px; text-shadow: 0 2px 0 #1d120a; cursor: pointer;
  opacity: 0; transform: translateY(18px); transition: transform .12s, filter .12s, opacity .45s; }
.agn-btn.show { opacity: 1; transform: none; }
.agn-btn:hover, .agn-btn:focus-visible { filter: brightness(1.18); outline: none; transform: translateY(-2px); }
.agn-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 #23170d; }
.agn-btn .sub { display: block; font-size: 11px; font-weight: 500; color: #e9c98f; letter-spacing: 0; margin-top: 2px; white-space: nowrap; }
.agn-btn.play { background: linear-gradient(#7a5226, #4f3216); border-color: #e0a84e; color: #fff1c8; }
#agn-title-fade { position: fixed; inset: 0; z-index: 100003; background: #000; opacity: 0; pointer-events: none; transition: opacity .7s ease; }
#agn-title-fade.on { opacity: 1; pointer-events: auto; }
#agn-title-fade .msg { position: absolute; left: 0; right: 0; bottom: 8vh; text-align: center; color: #d9c49a; font: 600 15px 'Pixelify Sans', ui-monospace, monospace; letter-spacing: 2px; }
.agn-modal { position: fixed; inset: 0; z-index: 100002; display: none; align-items: center; justify-content: center; background: rgba(5,6,12,.62); }
.agn-modal.open { display: flex; }
.agn-panel { width: min(640px, 94vw); max-height: 92vh; display: flex; flex-direction: column; background: #2a1d14; border: 3px solid #a8743e; border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,.7), inset 0 0 0 2px #3f2b1b; color: #f3e2c3; font: 14px 'Pixelify Sans', ui-monospace, monospace; }
.agn-panel .hd { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 2px solid #4a3220; }
.agn-panel .hd h2 { margin: 0; flex: 1; font-size: 19px; color: #ffd98a; letter-spacing: 1px; }
.agn-panel .bd { overflow-y: auto; padding: 10px 12px 12px; scrollbar-width: thin; scrollbar-color: #c9973f #2a1d14; }
.agn-sm { padding: 6px 11px; border: 2px solid #a8743e; border-radius: 7px; background: #3b2a1e; color: #f3e2c3; font: 600 13px 'Pixelify Sans', ui-monospace, monospace; cursor: pointer; }
.agn-sm:hover { filter: brightness(1.2); } .agn-sm.gold { background: #6b4a1f; border-color: #e0a84e; color: #fff1c8; } .agn-sm.red { background: #5a2018; border-color: #c0584a; }
.agn-sm.sel { background: #a8743e; color: #20140b; } .agn-sm:disabled { opacity: .45; cursor: default; filter: none; }
.agn-slot { display: flex; align-items: center; gap: 10px; padding: 9px 10px; margin-bottom: 8px; background: #33241a; border: 2px solid #5a3e27; border-radius: 9px; }
.agn-slot.cur { border-color: #e0a84e; } .agn-slot.pick { cursor: pointer; border-style: dashed; border-color: #e0a84e; } .agn-slot.pick:hover { background: #3f2c1e; }
.agn-slot .no { width: 46px; text-align: center; font-size: 12px; color: #c9a873; } .agn-slot .no b { display: block; font-size: 24px; color: #ffd98a; }
.agn-slot .info { flex: 1; min-width: 0; line-height: 1.35; } .agn-slot .info .t { font-size: 15px; color: #fff1c8; } .agn-slot .info .m { font-size: 12px; color: #d8bd8c; }
.agn-slot .info .e { color: #8d7556; font-style: italic; } .agn-slot .acts { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
.agn-banner { padding: 7px 10px; margin-bottom: 9px; border-radius: 7px; background: #4b3a14; border: 2px dashed #e0a84e; color: #ffe2a0; display: flex; gap: 8px; align-items: center; }
.agn-tabs { display: flex; gap: 5px; padding: 8px 12px 0; flex-wrap: wrap; }
.agn-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #3f2b1b; flex-wrap: wrap; }
.agn-row .l { flex: 1; min-width: 130px; } .agn-row .l small { display: block; color: #a98c60; font-size: 11px; }
.agn-row .seg { display: flex; gap: 4px; flex-wrap: wrap; }
.agn-row input[type=range] { width: 180px; accent-color: #e0a84e; }
.agn-keys { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; } .agn-keys b { color: #ffd98a; }
#agn-exit-note { position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%); padding: 14px 20px; background: rgba(20,14,9,.88); border: 2px solid #a8743e; border-radius: 10px;
  color: #ffe7b0; font: 600 16px 'Pixelify Sans', ui-monospace, monospace; display: none; }
html.agn-mobile #agn-title .ttl-menu { top: 39%; gap: 6px; }
html.agn-mobile .agn-btn { width: 200px; padding: 3px 12px 4px; font-size: 14px; border-width: 2px; }
html.agn-mobile .agn-btn .sub { font-size: 9px; }
html.agn-mobile .agn-panel { font-size: 12px; } html.agn-mobile .agn-panel .hd h2 { font-size: 16px; }
html.agn-booting body > #save-toast { z-index: 100010; }
`;

function titleEl(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }

/* ---------------- the scene ---------------- */
const TITLE_H = 360;
const TITLE_ART = {};
let titleLayers = null; // layers.json
function titleLoadArt(done) {
  const names = ["everest", "range", "hills", "town", "town_front", "fore_left", "fore_right", "cloud1", "cloud2", "cloud3", "cloud4", "cloud5", "cloud6"];
  let left = names.length + 1;
  const fin = () => { if (--left === 0) done(); };
  for (const n of names) { const im = new Image(); im.onload = fin; im.onerror = fin; im.src = "assets/title/" + n + ".png?v=3"; TITLE_ART[n] = im; }
  fetch("assets/title/layers.json?v=2").then((r) => r.json()).then((j) => {
    titleLayers = j;
    // the townsfolk walking along the road (half-size walk strips, tools/build_title_art.py)
    for (const id of j.walkers || []) for (const d of ["r", "l"]) { const im = new Image(); im.src = "assets/title/walk_" + id + "_" + d + ".png?v=2"; TITLE_ART["walk_" + id + "_" + d] = im; }
    fin();
  }).catch(() => { titleLayers = { w: 1100, h: 360, summit: [560, 46], smoke: [], lamps: [] }; fin(); });
  setTimeout(() => { if (left > 0) { left = 1; fin(); } }, 4000); // never wait forever
}

// the game's name in chunky 5x7 pixel letters
const TITLE_GLYPHS = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"], D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."], E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"], T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."], R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."], I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
};
const LOGO_ROWS = ["#fff6cf", "#ffe590", "#ffd060", "#f8b143", "#e8902d", "#cd6f21", "#a9531b"];
function buildLogo() {
  const lines = [["ADVENTURE", 4], ["NGANI", 7]];
  const gap = 6, pad = 4;
  const wOf = (s, k) => s.length * 6 * k - k;
  const W = Math.max(...lines.map(([s, k]) => wOf(s, k))) + pad * 2, H = lines.reduce((a, [, k]) => a + 7 * k, 0) + gap + pad * 2 + 4;
  const mask = document.createElement("canvas"); mask.width = W; mask.height = H;
  const mg = mask.getContext("2d");
  const fill = document.createElement("canvas"); fill.width = W; fill.height = H;
  const fg = fill.getContext("2d");
  let y = pad;
  const blocks = [];
  for (const [s, k] of lines) {
    let x = Math.round((W - wOf(s, k)) / 2);
    for (const ch of s) {
      const g = TITLE_GLYPHS[ch];
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === "#") {
        const bx = x + c * k, by = y + r * k;
        mg.fillStyle = "#000"; mg.fillRect(bx, by, k, k);
        fg.fillStyle = LOGO_ROWS[r]; fg.fillRect(bx, by, k, k);
        fg.fillStyle = "rgba(255,255,255,.28)"; fg.fillRect(bx, by, k, 1);
        fg.fillStyle = "rgba(90,30,0,.22)"; fg.fillRect(bx, by + k - 1, k, 1);
        const above = r === 0 || g[r - 1][c] !== "#";
        if (above) blocks.push([bx, by, k]);
      }
      x += 6 * k;
    }
    y += 7 * k + gap;
  }
  // snow on the tops of the letters, a drip here and there
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [bx, by, k] of blocks) {
    const h = Math.max(2, Math.round(k * 0.45));
    fg.fillStyle = "#ffffff"; fg.fillRect(bx, by - 1, k, h);
    fg.fillStyle = "#cfe0f5"; fg.fillRect(bx, by - 1 + h, k, 1);
    if (rnd() < 0.35) { const dx = bx + Math.floor(rnd() * k); fg.fillStyle = "#ffffff"; fg.fillRect(dx, by + h - 1, 1, 2 + Math.floor(rnd() * 2)); }
    mg.fillRect(bx, by - 1, k, h);
  }
  // outline (2px) + drop shadow
  const out = document.createElement("canvas"); out.width = W + 8; out.height = H + 10;
  const og = out.getContext("2d");
  const tint = (color) => { const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); g.drawImage(mask, 0, 0); g.drawImage(fill, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = color; g.fillRect(0, 0, W, H); return c; };
  const sh = tint("rgba(10,6,20,.55)"), ol = tint("#2b140a");
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3) og.drawImage(sh, 4 + dx, 8 + dy);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3) og.drawImage(ol, 4 + dx, 4 + dy);
  og.drawImage(fill, 4, 4);
  return out;
}

function TitleScene(canvas) {
  const g = canvas.getContext("2d");
  let W = 640, H = TITLE_H, S = 1, sky = null, logo = null, shine = null;
  // positions snap to the screen's own pixels (not to the 360-px art grid), so slow parallax glides instead of stepping
  const sn = (v) => Math.round(v * S) / S;
  const rnd = Math.random;
  const stars = Array.from({ length: 70 }, () => ({ x: rnd(), y: rnd() * 0.45, p: rnd() * 6, s: rnd() < 0.15 ? 2 : 1 }));
  const flakes = Array.from({ length: 46 }, () => ({ x: rnd(), y: rnd(), v: 6 + rnd() * 10, a: rnd() * 6, s: rnd() < 0.2 ? 2 : 1 }));
  const plume = [], smoke = [], birds = [];
  // pixel-art cumulus (assets/title/cloud1-6): four far ones behind the summit, two nearer and faster
  const clouds = Array.from({ length: 6 }, (_, i) => ({ i: i + 1, x: rnd() * 1100, y: i < 4 ? 14 + rnd() * 70 : 120 + rnd() * 40, v: i < 4 ? 1.5 + rnd() * 2.5 : 5 + rnd() * 3, near: i >= 4 }));
  const walkers = [];
  let birdTimer = 2;
  function resize() {
    const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    H = TITLE_H; S = canvas.height / H; W = canvas.width / S;
    sky = g.createLinearGradient(0, 0, 0, H);
    for (const [o, c] of [[0, "#141a3c"], [0.22, "#2c3368"], [0.42, "#5d5a96"], [0.58, "#b77892"], [0.68, "#ee9474"], [0.78, "#ffc98d"], [1, "#ffe3ac"]]) sky.addColorStop(o, c);
  }
  resize();
  window.addEventListener("resize", resize);

  let tiltX = 0, tiltY = 0, aimX = 0, aimY = 0;
  // a little parallax with the mouse (no phone tilt: its sensor noise made the scene shake)
  window.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") return; aimX = (e.clientX / window.innerWidth - 0.5) * 2; aimY = (e.clientY / window.innerHeight - 0.5) * 2; });

  const ease = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
  const INTRO = 3.4;
  let time = 0;
  function layer(img, depth, rise, sway, y0 = 0) {
    if (!img || !img.width) return;
    const x = sn((W - img.width) / 2 + sway * depth * 60 + tiltX * depth * 14);
    const y = sn(y0 + rise * depth * H * 0.95 + tiltY * depth * 4);
    g.drawImage(img, x, y);
    return { x, y };
  }

  this.walkers = walkers;
  this.skip = () => { if (time < INTRO + 1.2) time = INTRO + 1.2; };
  this.introDone = () => time >= INTRO + 0.6;
  this.logoAt = () => time;
  this.frame = (dt) => {
    time += dt;
    tiltX += (aimX - tiltX) * Math.min(1, dt * 1.5); tiltY += (aimY - tiltY) * Math.min(1, dt * 1.5);
    const p = ease(time / INTRO), rise = 1 - p;
    const sway = Math.sin(time * 0.07) * (0.4 + 0.6 * p);
    g.setTransform(S, 0, 0, S, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // sun glow behind the mountains
    const sun = g.createRadialGradient(W * 0.5, H * 0.66 + rise * 60, 4, W * 0.5, H * 0.66 + rise * 60, H * 0.55);
    sun.addColorStop(0, "rgba(255,240,200,.75)"); sun.addColorStop(0.35, "rgba(255,190,140,.28)"); sun.addColorStop(1, "rgba(255,170,140,0)");
    g.fillStyle = sun; g.fillRect(0, 0, W, H);
    // stars, fading as the dawn comes up
    const sa = 0.85 - 0.55 * p;
    for (const s of stars) { const a = sa * (0.5 + 0.5 * Math.sin(time * 1.7 + s.p)); if (a <= 0.02) continue; g.fillStyle = "rgba(255,250,235," + a.toFixed(2) + ")"; g.fillRect(Math.round(s.x * W), Math.round(s.y * H + rise * 30), s.s, s.s); }
    // far clouds
    const drawClouds = (near) => {
      for (const c of clouds) {
        if (c.near !== near) continue;
        const im = TITLE_ART["cloud" + c.i]; if (!im || !im.width) continue;
        c.x += c.v * dt; if (c.x > 1120) c.x = -im.width - 20;
        g.globalAlpha = near ? 0.92 : 0.85;
        g.drawImage(im, sn(c.x - (1100 - W) / 2 + sway * (near ? 30 : 8) + tiltX * (near ? 8 : 3)), sn(c.y + rise * H * (near ? 0.4 : 0.15)));
        g.globalAlpha = 1;
      }
    };
    drawClouds(false);
    const ev = layer(TITLE_ART.everest, 0.22, rise, sway);
    // snow blowing off the summit
    if (ev && titleLayers) {
      const sx = ev.x + titleLayers.summit[0], sy = ev.y + titleLayers.summit[1];
      if (rnd() < dt * 26) plume.push({ x: sx + rnd() * 3, y: sy + 1 + rnd() * 4, vx: 10 + rnd() * 16, vy: -1 - rnd() * 3, life: 0, max: 2.5 + rnd() * 2.5 });
      for (let i = plume.length - 1; i >= 0; i--) {
        const q = plume[i]; q.life += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 1.2 * dt;
        if (q.life > q.max) { plume.splice(i, 1); continue; }
        g.fillStyle = "rgba(255,255,255," + (0.75 * (1 - q.life / q.max)).toFixed(2) + ")"; g.fillRect(Math.round(q.x), Math.round(q.y), q.life < 1 ? 1 : 2, 1);
      }
    }
    layer(TITLE_ART.range, 0.35, rise, sway);
    drawClouds(true);
    // a band of mist in the valley
    const mist = g.createLinearGradient(0, 205 + rise * 120, 0, 262 + rise * 120);
    mist.addColorStop(0, "rgba(232,196,206,0)"); mist.addColorStop(0.55, "rgba(232,196,206,.42)"); mist.addColorStop(1, "rgba(232,196,206,0)");
    g.fillStyle = mist; g.fillRect(0, 0, W, H);
    layer(TITLE_ART.hills, 0.55, rise, sway);
    // birds crossing the sky
    birdTimer -= dt;
    if (birdTimer <= 0 && p > 0.6) {
      birdTimer = 7 + rnd() * 9;
      const dir = rnd() < 0.5 ? 1 : -1, n = 3 + Math.floor(rnd() * 4), by = 60 + rnd() * 70;
      for (let i = 0; i < n; i++) birds.push({ x: dir > 0 ? -10 - i * 7 : W + 10 + i * 7, y: by + Math.abs(i - n / 2) * 4, v: dir * (26 + rnd() * 4), f: rnd() * 6 });
    }
    for (let i = birds.length - 1; i >= 0; i--) {
      const b = birds[i]; b.x += b.v * dt; b.f += dt * 9;
      if (b.x < -60 || b.x > W + 60) { birds.splice(i, 1); continue; }
      const up = Math.sin(b.f) > 0, x = Math.round(b.x), y = Math.round(b.y + Math.sin(b.f * 0.3) * 2);
      g.fillStyle = "#2b2338";
      g.fillRect(x, y, 1, 1);
      if (up) { g.fillRect(x - 2, y - 1, 2, 1); g.fillRect(x + 1, y - 1, 2, 1); } else { g.fillRect(x - 2, y + 1, 2, 1); g.fillRect(x + 1, y + 1, 2, 1); }
    }
    const tw = layer(TITLE_ART.town, 0.8, rise, sway);
    if (tw && titleLayers) {
      // chimney smoke
      for (const [cx, cy] of titleLayers.smoke) if (rnd() < dt * 3) smoke.push({ x: tw.x + cx, y: tw.y + cy, life: 0, max: 3 + rnd() * 2, dx: 2 + rnd() * 3 });
      for (let i = smoke.length - 1; i >= 0; i--) {
        const s = smoke[i]; s.life += dt;
        if (s.life > s.max) { smoke.splice(i, 1); continue; }
        const t = s.life / s.max, r = 1 + t * 4;
        g.fillStyle = "rgba(230,226,232," + (0.5 * (1 - t)).toFixed(2) + ")";
        g.beginPath(); g.arc(s.x + s.dx * s.life * 2 + Math.sin(s.life * 2) * 1.5, s.y - s.life * 7, r, 0, Math.PI * 2); g.fill();
      }
      // townsfolk walking along the road, two lanes, now and then stopping for a moment
      if (!walkers.length && titleLayers.walkers && titleLayers.walkers.length) {
        const ids = titleLayers.walkers;
        for (let i = 0; i < 9; i++) walkers.push({ id: ids[i % ids.length], dir: rnd() < 0.5 ? 1 : -1, x: rnd() * 1100, lane: i % 2, v: 9 + rnd() * 7, f: rnd() * 6, wait: 0 });
      }
      walkers.sort((a, b) => a.lane - b.lane);
      for (const w of walkers) {
        if (w.wait > 0) w.wait -= dt;
        else {
          w.x += w.dir * w.v * dt; w.f += dt * w.v * 0.55;
          if (rnd() < dt * 0.06) w.wait = 1 + rnd() * 2.5;
          if (w.x > 1130) w.x = -30; if (w.x < -30) w.x = 1130;
        }
        const im = TITLE_ART["walk_" + w.id + "_" + (w.dir > 0 ? "r" : "l")];
        if (!im || !im.width) continue;
        const feet = titleLayers.road[w.lane], sx = sn(tw.x + w.x), sy = sn(tw.y + feet);
        if (sx < -40 || sx > W + 40) continue;
        g.fillStyle = "rgba(20,30,10,.28)"; g.fillRect(sx - 4, sy - 1, 8, 2); g.fillRect(sx - 3, sy - 2, 6, 1);
        const fr = w.wait > 0 ? 0 : Math.floor(w.f) % 6;
        g.drawImage(im, fr * 32, 0, 32, 32, sx - 16, sy - 24, 32, 32);
      }
      // the trees in front of the road go over the walkers
      if (TITLE_ART.town_front && TITLE_ART.town_front.width) g.drawImage(TITLE_ART.town_front, tw.x, tw.y);
      // lamps still lit at dawn
      for (const [lx, ly] of titleLayers.lamps) {
        const x = tw.x + lx, y = tw.y + ly, f = 0.8 + 0.2 * Math.sin(time * 9 + lx);
        const gl = g.createRadialGradient(x, y, 0, x, y, 14);
        gl.addColorStop(0, "rgba(255,214,140," + (0.55 * f).toFixed(2) + ")"); gl.addColorStop(1, "rgba(255,190,110,0)");
        g.fillStyle = gl; g.fillRect(x - 14, y - 14, 28, 28);
      }
    }
    // trees framing the edges, in front
    const fl = TITLE_ART.fore_left, fr = TITLE_ART.fore_right;
    if (fl && fl.width) g.drawImage(fl, sn(-40 + sway * 70 + tiltX * 18), sn(rise * H * 1.05 + tiltY * 5));
    if (fr && fr.width) g.drawImage(fr, sn(W - fr.width + 40 + sway * 70 + tiltX * 18), sn(rise * H * 1.05 + tiltY * 5));
    // a few flakes drifting down
    for (const f of flakes) {
      f.y += f.v * dt / H; f.a += dt;
      if (f.y > 1) { f.y = 0; f.x = rnd(); }
      g.fillStyle = "rgba(255,255,255,.75)"; g.fillRect(Math.round(f.x * W + Math.sin(f.a) * 6), Math.round(f.y * H), f.s, f.s);
    }
    // darker bottom so the buttons read, darker top for the name
    const vg = g.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, "rgba(10,10,30,.35)"); vg.addColorStop(0.3, "rgba(10,10,30,0)"); vg.addColorStop(0.72, "rgba(10,8,6,0)"); vg.addColorStop(1, "rgba(10,8,6,.55)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // the name
    const lt = time - (INTRO - 0.9);
    if (lt > 0) {
      if (!logo) logo = buildLogo();
      const k = ease(lt / 0.7);
      const bounce = lt < 1.1 ? Math.sin(Math.min(1, lt / 1.1) * Math.PI) * (1 - k) * 0 : 0;
      const sc = 1 + (1 - k) * 0.6 + bounce;
      const lw = Math.round(logo.width * sc), lh = Math.round(logo.height * sc);
      const ly = sn(H * 0.07 - (1 - k) * 30 + Math.sin(time * 1.3) * 1.5);
      g.globalAlpha = Math.min(1, lt / 0.45);
      g.drawImage(logo, sn((W - lw) / 2), ly, lw, lh);
      g.globalAlpha = 1;
      // a shine sweeping across now and then
      const st = (time % 5.5) / 1.1;
      if (st < 1 && k >= 1) { // a diagonal shine over the letters only
        if (!shine) { shine = document.createElement("canvas"); shine.width = logo.width; shine.height = logo.height; }
        const s = shine.getContext("2d"), sx = -50 + st * (logo.width + 100);
        s.globalCompositeOperation = "copy"; s.drawImage(logo, 0, 0);
        s.globalCompositeOperation = "source-atop";
        const sg = s.createLinearGradient(sx - 22, 0, sx + 22, logo.height * 0.4);
        sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(0.5, "rgba(255,252,230,.55)"); sg.addColorStop(1, "rgba(255,255,255,0)");
        s.fillStyle = sg; s.fillRect(0, 0, logo.width, logo.height);
        s.globalCompositeOperation = "destination-in"; s.drawImage(logo, 0, 0);
        g.drawImage(shine, sn((W - logo.width) / 2), ly);
      }
    }
  };
}

/* ---------------- the overlay, menu and panels ---------------- */
let titleRoot = null, titleScene = null, titleFade = null, titleLoadPanel = null, titleSettingsPanel = null, titleImportText = null;

function titleRefreshPlayLabel() {
  if (!titleRoot) return;
  const b = titleRoot.querySelector(".agn-btn.play");
  if (!b) return;
  const n = bestSlot(), info = slotInfo(n);
  b.textContent = tt("play");
  b.title = info && !info.broken ? tt("slot") + " " + n + " · " + info.place + " · " + tt("lv") + " " + info.level : tt("newGame");
  titleRoot.querySelector('[data-t="load"]').textContent = tt("load");
  titleRoot.querySelector('[data-t="settings"]').textContent = tt("settings");
  titleRoot.querySelector('[data-t="exit"]').textContent = tt("exit");
}

function buildTitle() {
  const st = document.createElement("style"); st.textContent = TITLE_CSS; document.head.appendChild(st);
  titleRoot = titleEl(`<div id="agn-title" class="agn-front"><canvas></canvas>
    <div class="ttl-menu">
      <button class="agn-btn play" data-t="play"></button>
      <button class="agn-btn" data-t="load"></button>
      <button class="agn-btn" data-t="settings"></button>
      <button class="agn-btn" data-t="exit"></button>
    </div><div id="agn-exit-note"></div></div>`);
  document.body.appendChild(titleRoot);
  titleFade = titleEl('<div id="agn-title-fade" class="agn-front"><div class="msg"></div></div>');
  document.body.appendChild(titleFade);
  titleRefreshPlayLabel();
  titleScene = new TitleScene(titleRoot.querySelector("canvas"));
  let last = 0, shown = false, skipIntro = false;
  try { skipIntro = sessionStorage.getItem("agn-skip-intro") === "1"; sessionStorage.removeItem("agn-skip-intro"); } catch (e) { /* ignore */ }
  const frame = (now) => {
    if (!titleRoot) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
    titleScene.frame(dt);
    if (!shown && titleScene.introDone()) {
      shown = true;
      titleRoot.querySelectorAll(".agn-btn").forEach((b, i) => setTimeout(() => b.classList.add("show"), i * 110));
    }
    requestAnimationFrame(frame);
  };
  titleLoadArt(() => { if (skipIntro) titleScene.skip(); requestAnimationFrame(frame); });
  titleRoot.addEventListener("pointerdown", (e) => { if (!e.target.closest("button")) titleScene.skip(); });
  titleRoot.querySelector(".ttl-menu").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || !b.classList.contains("show")) return;
    const k = b.dataset.t;
    if (k === "play") titlePlay(bestSlot());
    else if (k === "load") openLoadPanel();
    else if (k === "settings") openSettingsPanel();
    else if (k === "exit") titleExit();
  });
  window.addEventListener("keydown", (e) => {
    if (!titleRoot || titleStarted) return;
    if (document.querySelector(".agn-modal.open")) { if (e.key === "Escape") document.querySelectorAll(".agn-modal.open").forEach((m) => m.classList.remove("open")); return; }
    if (e.key === "Enter" || e.key === " ") { if (titleScene.introDone()) titlePlay(bestSlot()); else titleScene.skip(); }
  });
  if (typeof Music !== "undefined") Music.play("title");
}

function titlePlay(slot, isNew) {
  if (titleStarted) return;
  titleStarted = true;
  setActiveSlot(slot);
  if (isNew) { try { localStorage.removeItem(saveSlotKey(slot)); } catch (e) { /* ignore */ } }
  const fresh = !readSlotRaw(slot);
  document.querySelectorAll(".agn-modal.open").forEach((m) => m.classList.remove("open"));
  titleFade.classList.add("on");
  if (typeof Music !== "undefined") Music.play("day");
  const go = () => {
    titleFade.querySelector(".msg").textContent = "";
    const alreadyRunning = typeof saveGameReady !== "undefined" && saveGameReady; // an older main.js started it by itself
    if (fresh && typeof dayNightEpoch !== "undefined") { // a new game starts on a fresh morning
      dayNightEpoch = playNow() - (SUNRISE_HOUR * 3600 * 1000) / TIME_SCALE;
      try { localStorage.setItem(DAYNIGHT_STORAGE_KEY, String(dayNightEpoch)); } catch (e) { /* ignore */ }
    }
    if (!alreadyRunning) { try { start(); } catch (e) { console.error("Game failed to start:", e); } }
    const wait = () => {
      const r = document.documentElement;
      if (r.classList.contains("agn-booting") || r.classList.contains("agn-revealing")) { requestAnimationFrame(wait); return; }
      if (titleRoot) { titleRoot.remove(); titleRoot = null; }
      setTimeout(() => { titleFade.classList.remove("on"); }, 80);
      setTimeout(() => { if (typeof saveGame === "function") saveGame(); }, 1500);
    };
    requestAnimationFrame(wait);
  };
  setTimeout(() => {
    if (titleGameAssetsReady || (typeof saveGameReady !== "undefined" && saveGameReady)) go();
    else {
      titleFade.querySelector(".msg").textContent = tt("loading"); titlePendingStart = go;
      // also ask the loader directly (it calls back at once if everything is already in)
      // (only once main.js is in too — start() lives there; otherwise main.js calls titleOnAssetsReady() itself)
      if (typeof whenAssetsReady === "function") whenAssetsReady(() => {
        if (typeof start !== "function") return;
        titleGameAssetsReady = true;
        if (titlePendingStart) { const f = titlePendingStart; titlePendingStart = null; f(); }
      });
    }
  }, 750);
}

function titleExit() {
  try { localStorage.setItem("agn-active-slot", String(getActiveSlot())); } catch (e) { /* ignore */ }
  const C = window.Capacitor;
  const App = C && C.Plugins && C.Plugins.App;
  if (App && App.exitApp) { App.exitApp(); return; }
  try { window.close(); } catch (e) { /* ignore */ }
  setTimeout(() => {
    const n = document.getElementById("agn-exit-note");
    if (n) { n.textContent = tt("exitMsg"); n.style.display = "block"; setTimeout(() => (n.style.display = "none"), 2600); }
  }, 250);
}

/* ---------------- Load ---------------- */
function openLoadPanel(fromGame) {
  if (!titleLoadPanel) {
    titleLoadPanel = titleEl(`<div class="agn-modal agn-front" id="agn-load"><div class="agn-panel">
      <div class="hd"><h2></h2><button class="agn-sm gold" data-a="import"></button><button class="agn-sm" data-a="close">✕</button>
      <input type="file" accept="application/json,.json" style="display:none"></div><div class="bd"></div></div></div>`);
    document.body.appendChild(titleLoadPanel);
    titleLoadPanel.addEventListener("pointerdown", (e) => { if (e.target === titleLoadPanel) titleLoadPanel.classList.remove("open"); });
    titleLoadPanel.querySelector(".hd").addEventListener("click", (e) => {
      const a = e.target.closest("button") && e.target.closest("button").dataset.a;
      if (a === "close") titleLoadPanel.classList.remove("open");
      if (a === "import") titleLoadPanel.querySelector("input").click();
    });
    titleLoadPanel.querySelector("input").addEventListener("change", (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        let d = null;
        try { d = JSON.parse(r.result); } catch (err) { /* below */ }
        if (!d || typeof d !== "object" || !(d.placedItems || d.player || d.itemCounts)) { titleToast(tt("importBad")); return; }
        titleImportText = JSON.stringify(d);
        renderLoadPanel();
      };
      r.readAsText(f);
    });
    titleLoadPanel.querySelector(".bd").addEventListener("click", onLoadPanelClick);
  }
  titleImportText = null;
  renderLoadPanel();
  titleLoadPanel.classList.add("open");
}
let titleDelArm = 0;
function renderLoadPanel() {
  const P = titleLoadPanel;
  P.querySelector("h2").textContent = tt("loadTitle");
  P.querySelector('[data-a="import"]').textContent = "⬆ " + tt("import");
  const cur = getActiveSlot();
  let h = titleImportText ? `<div class="agn-banner"><span style="flex:1">${tt("pickSlot")}</span><button class="agn-sm" data-a="cancelimp">${tt("cancel")}</button></div>` : "";
  for (let n = 1; n <= SAVE_SLOT_COUNT; n++) {
    const info = slotInfo(n);
    const used = info && !info.broken;
    h += `<div class="agn-slot ${n === cur && used ? "cur" : ""} ${titleImportText ? "pick" : ""}" data-slot="${n}">
      <div class="no">${tt("slot")}<b>${n}</b></div><div class="info">`;
    if (used) {
      h += `<div class="t">${info.place}${n === cur ? ' <span style="color:#e0a84e;font-size:11px">★ ' + tt("active") + "</span>" : ""}</div>
        <div class="m">${tt("lv")} ${info.level} · ${info.gold} ${tt("gold")} · ⏱ ${info.time}</div>
        <div class="m">${info.quest ? "📜 " + info.quest + " · " : ""}${tt("saved")} ${fmtSaved(info.savedAt)}</div>`;
    } else h += `<div class="e">${info && info.broken ? "(?)" : tt("empty")}</div>`;
    h += `</div><div class="acts">`;
    if (!titleImportText) {
      const running = titleStarted && n === cur; // the game being played right now: no Load / Delete
      if (used) h += `<button class="agn-sm" data-a="export" title="${tt("exportBtn")}">⬇ ${tt("exportBtn")}</button>` + (running ? "" : `<button class="agn-sm gold" data-a="load">▶ ${tt("play")}</button><button class="agn-sm red" data-a="del">${titleDelArm === n ? tt("sure") : "🗑"}</button>`);
      else h += `<button class="agn-sm gold" data-a="new">${tt("newGame")}</button>`;
    }
    h += `</div></div>`;
  }
  P.querySelector(".bd").innerHTML = h;
}
function onLoadPanelClick(e) {
  const btn = e.target.closest("button"), row = e.target.closest(".agn-slot");
  const a = btn && btn.dataset.a;
  if (a === "cancelimp") { titleImportText = null; renderLoadPanel(); return; }
  if (!row) return;
  const n = +row.dataset.slot;
  if (titleImportText) {
    try { localStorage.setItem(saveSlotKey(n), titleImportText); } catch (err) { titleToast(tt("storageFull")); return; }
    titleImportText = null; titleToast(tt("imported") + " " + n); renderLoadPanel(); titleRefreshPlayLabel();
    return;
  }
  if (a !== "del") titleDelArm = 0;
  if (a === "load") { titleLoadPanel.classList.remove("open"); titleLoadSlot(n); }
  else if (a === "new") { titleLoadPanel.classList.remove("open"); titleLoadSlot(n, true); }
  else if (a === "export") titleExportSlot(n);
  else if (a === "del") {
    if (titleDelArm !== n) { titleDelArm = n; renderLoadPanel(); return; }
    titleDelArm = 0;
    try { localStorage.removeItem(saveSlotKey(n)); } catch (err) { /* ignore */ }
    titleToast(tt("deleted")); renderLoadPanel(); titleRefreshPlayLabel();
  } else renderLoadPanel();
}
// From the title: start that slot. From inside the game: save, set the slot and restart into it.
function titleLoadSlot(n, isNew) {
  if (titleRoot && !titleStarted) { titlePlay(n, isNew); return; }
  if (typeof saveGame === "function") saveGame();
  if (typeof saveGameReady !== "undefined") saveGameReady = false; // nothing may write the running game into the other slot now
  if (isNew) { try { localStorage.removeItem(saveSlotKey(n)); } catch (e) { /* ignore */ } }
  setActiveSlot(n);
  try { sessionStorage.setItem("agn-autoplay", "1"); } catch (e) { /* ignore */ }
  location.reload();
}
function titleExportSlot(n) {
  const raw = readSlotRaw(n);
  if (!raw) return;
  let text = raw;
  try { text = JSON.stringify(JSON.parse(raw), null, 2); } catch (e) { /* keep raw */ }
  if (typeof capPlugin === "function" && capPlugin("Filesystem") && typeof exportSaveNative === "function") { exportSaveNative(text); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = "adventurengani-slot" + n + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function titleToast(msg) { if (typeof showToast === "function") showToast(msg); else console.log(msg); }

/* ---------------- Settings ---------------- */
let settingsTab = "graphics";
function openSettingsPanel() {
  if (!titleSettingsPanel) {
    titleSettingsPanel = titleEl(`<div class="agn-modal agn-front" id="agn-settings"><div class="agn-panel">
      <div class="hd"><h2></h2><button class="agn-sm" data-a="close">✕</button></div><div class="agn-tabs"></div><div class="bd"></div></div></div>`);
    document.body.appendChild(titleSettingsPanel);
    titleSettingsPanel.addEventListener("pointerdown", (e) => { if (e.target === titleSettingsPanel) titleSettingsPanel.classList.remove("open"); });
    titleSettingsPanel.addEventListener("click", onSettingsClick);
    titleSettingsPanel.addEventListener("input", (e) => {
      if (e.target.dataset.a === "vol" && typeof Music !== "undefined") { Music.setVolume(+e.target.value / 100); const o = titleSettingsPanel.querySelector(".volval"); if (o) o.textContent = e.target.value + "%"; }
    });
  }
  renderSettingsPanel();
  titleSettingsPanel.classList.add("open");
}
function setPref(key, val) { try { localStorage.setItem(key, String(val)); } catch (e) { /* ignore */ } }
function getPref(key, def) { try { const v = localStorage.getItem(key); return v === null ? def : v; } catch (e) { return def; } }
function renderSettingsPanel() {
  const P = titleSettingsPanel;
  P.querySelector("h2").textContent = "⚙ " + tt("settingsTitle");
  P.querySelector(".agn-tabs").innerHTML = ["graphics", "audio", "language", "controls"].map((k) => `<button class="agn-sm ${settingsTab === k ? "sel" : ""}" data-tab="${k}">${tt(k)}</button>`).join("");
  const mob = document.documentElement.classList.contains("agn-mobile");
  const seg = (a, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button class="agn-sm ${String(cur) === String(v) ? "sel" : ""}" data-a="${a}" data-v="${v}">${l}</button>`).join("")}</div>`;
  const note = mob ? "" : `<small>${tt("phoneOnly")}</small>`;
  let h = "";
  if (settingsTab === "graphics") {
    const glOn = typeof GL2D !== "undefined" && GL2D.active;
    const rend = getPref("agn-renderer", "") || (glOn ? "webgl" : "canvas");
    h += `<div class="agn-row"><div class="l">${tt("renderer")}<small>${tt("restart")}</small></div>${seg("renderer", [["webgl", "WebGL"], ["canvas", "Canvas"]], rend)}</div>`;
    h += `<div class="agn-row"><div class="l">${tt("sun")}<small>${tt("sunNote")}</small></div>${seg("sun", [["1", tt("on")], ["0", tt("off")]], getPref("agn-sun", "1") === "0" ? "0" : "1")}</div>`;
    h += `<div class="agn-row"><div class="l">${tt("quality")}${note}</div>${seg("quality", [["1", tt("sharp")], ["0.5", tt("smooth")]], getPref("agn-render-scale", "1") === "0.5" ? "0.5" : "1")}</div>`;
    h += `<div class="agn-row"><div class="l">${tt("fps")}${note}</div>${seg("fps", [[30, "30"], [60, "60"], [90, "90"], [120, "120"]], getPref("agn-max-fps", "60"))}</div>`;
    h += `<div class="agn-row"><div class="l">${tt("view")}${note}</div>${seg("view", [[16, "16×16"], [20, "20×20"], [0, tt("full")]], getPref("agn-view-tiles", "16"))}</div>`;
  } else if (settingsTab === "audio") {
    const on = typeof Music === "undefined" || Music.isEnabled(), vol = Math.round((typeof Music !== "undefined" ? Music.getVolume() : 0.5) * 100);
    h += `<div class="agn-row"><div class="l">${tt("music")}</div>${seg("music", [["1", tt("on")], ["0", tt("off")]], on ? "1" : "0")}</div>`;
    h += `<div class="agn-row"><div class="l">${tt("volume")}</div><input type="range" min="0" max="100" step="5" value="${vol}" data-a="vol"><span class="volval">${vol}%</span></div>`;
  } else if (settingsTab === "language") {
    h += `<div class="agn-row"><div class="l">${tt("language")}<small>${tt("langNote")}</small></div>${seg("lang", [["en", "English"], ["fil", "Filipino"]], titleLang)}</div>`;
  } else {
    h += `<div class="agn-keys">${tt("tips").map(([k, d]) => `<b>${k}</b><span>${d}</span>`).join("")}</div>`;
  }
  P.querySelector(".bd").innerHTML = h;
}
function onSettingsClick(e) {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.a === "close") { titleSettingsPanel.classList.remove("open"); return; }
  if (b.dataset.tab) { settingsTab = b.dataset.tab; renderSettingsPanel(); return; }
  const a = b.dataset.a, v = b.dataset.v;
  if (a === "renderer") {
    const was = getPref("agn-renderer", "");
    setPref("agn-renderer", v);
    if (was !== v) {
      if (typeof saveGame === "function" && typeof saveGameReady !== "undefined" && saveGameReady) saveGame();
      try { sessionStorage.setItem(titleRoot && !titleStarted ? "agn-skip-intro" : "agn-autoplay", "1"); } catch (err) { /* ignore */ }
      setTimeout(() => location.reload(), 120);
    }
  } else if (a === "quality") {
    setPref("agn-render-scale", v);
    if (typeof MOBILE_RENDER_SCALE !== "undefined") { MOBILE_RENDER_SCALE = +v; if (typeof resizeCanvas === "function" && titleStarted) resizeCanvas(); }
  } else if (a === "fps") { setPref("agn-max-fps", v); if (typeof MOBILE_MAX_FPS !== "undefined") MOBILE_MAX_FPS = +v; }
  else if (a === "view") { setPref("agn-view-tiles", v); if (typeof MOBILE_RENDER_TILES !== "undefined") MOBILE_RENDER_TILES = +v; }
  else if (a === "sun") { setPref("agn-sun", v); if (typeof setSunlight === "function") setSunlight(v === "1"); }
  else if (a === "music") { if (typeof Music !== "undefined") Music.setEnabled(v === "1"); }
  else if (a === "lang") { titleLang = v; setPref("agn-lang", v); titleRefreshPlayLabel(); if (typeof applyMenuLanguage === "function") applyMenuLanguage(); }
  renderSettingsPanel();
}

/* ---------------- in the game: Main Menu / Settings ---------------- */
function goToMainMenu() {
  if (typeof saveGame === "function") saveGame();
  try { sessionStorage.setItem("agn-skip-intro", "1"); } catch (e) { /* ignore */ }
  location.reload();
}
function applyMenuLanguage() {
  const m = document.getElementById("btn-mainmenu"); if (m) m.textContent = "☰ " + tt("mainMenu");
  const s = document.getElementById("btn-settings"); if (s) s.textContent = "⚙ " + tt("settings");
  const ml = document.querySelector('#mb-settings [data-s="mainmenu"]'); if (ml) ml.textContent = tt("mainMenu");
  const ms = document.querySelector('#mb-settings [data-s="settings2"]'); if (ms) ms.textContent = tt("settings") + "…";
}
window.addEventListener("DOMContentLoaded", () => {
  const bar = document.getElementById("top-toolbar");
  if (bar && !document.getElementById("btn-mainmenu")) {
    const s = document.createElement("button"); s.id = "btn-settings"; s.title = "Settings"; s.addEventListener("click", openSettingsPanel);
    const m = document.createElement("button"); m.id = "btn-mainmenu"; m.title = "Save and go to the main menu"; m.addEventListener("click", goToMainMenu);
    const l = document.createElement("button"); l.id = "btn-loadslots"; l.textContent = "📂 " + tt("load"); l.title = "Save slots"; l.addEventListener("click", () => openLoadPanel(true));
    bar.appendChild(l); bar.appendChild(s); bar.appendChild(m);
    applyMenuLanguage();
  }
});

/* ---------------- boot ---------------- */
if (TITLE_ON) {
  let auto = false;
  try { auto = sessionStorage.getItem("agn-autoplay") === "1"; sessionStorage.removeItem("agn-autoplay"); } catch (e) { /* ignore */ }
  const boot = () => {
    buildTitle();
    if (auto) { titleRoot.style.visibility = "hidden"; titleFade.style.transition = "none"; titlePlay(getActiveSlot()); }
  };
  if (document.body) boot(); else window.addEventListener("DOMContentLoaded", boot);
}
