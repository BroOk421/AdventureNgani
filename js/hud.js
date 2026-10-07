"use strict";

/* =================================================================
   HUD — everything in the new stat/status readout added per request:
   health/stamina/food/exp bars, a playtime "Duration" counter, the
   player's current Col/Row, the day counter + Jan-Dec calendar date/
   season, the current weather (Sunny/Rainy/Snow), and the minimap. All
   of it lives in the unified `#left-hud` flex column (index.html)
   except the minimap (top-right) — see index.html's comment for the
   full layout reasoning.

   - Health/EXP have no real gameplay hooked up yet (no damage source, no
     way to gain EXP) — they're foundations for later, always full/empty
     respectively, not fully wired systems. Stamina and Food ARE real:
     stamina drains while running and gates whether Shift actually lets
     you run (see updatePlayer(), player.js); food slowly depletes over
     real playtime with no way to refill it yet (also a foundation, but
     an active one — it actually goes down).
   - Weather (Sunny/Rainy/Snow) and the Jan-Dec calendar/season it's
     drawn from now live in js/calendar.js, re-rolled once per in-game
     day rather than on a real-time timer, and DO have a real effect on
     what's drawn: js/weatherfx.js only renders rain during "Rainy" and
     snow during "Snow", and nudges cloud cover/sun-ray strength by the
     current state. This HUD file just reads and displays the result
     (updateStatsHUD() below) — no weather logic of its own anymore.
   - The minimap redraws every frame (called from render(), camera.js) —
     cheap at this scale (a filled rect + a couple of dots + one stroked
     rect), no need to throttle it the way something like the clock HUD
     text update is.
================================================================= */

/* ---------------- food depletion + playtime (real, not cosmetic) ---------------- */

// Called every frame (main.js's loop). Food drains at a rate tied to the
// IN-GAME clock (FOOD_DRAIN_PER_GAME_HOUR, config.js — a full 100 lasts
// exactly one in-game day), so it keeps pace with the day/night cycle
// rather than real seconds directly; playtime just accumulates real dt.
function updatePlayerStats(dt) {
  const gameHoursElapsed = (dt * TIME_SCALE) / 3600;
  player.food = Math.max(0, player.food - FOOD_DRAIN_PER_GAME_HOUR * gameHoursElapsed);
  player.playTimeSeconds += dt;
}

/* ---------------- DOM refs ---------------- */

const healthBarFillEl = document.getElementById("health-bar-fill");
const healthBarTextEl = document.getElementById("health-bar-text");
const staminaBarFillEl = document.getElementById("stamina-bar-fill");
const staminaBarTextEl = document.getElementById("stamina-bar-text");
const foodBarFillEl = document.getElementById("food-bar-fill");
const foodBarTextEl = document.getElementById("food-bar-text");
const expBarFillEl = document.getElementById("exp-bar-fill");
const expBarTextEl = document.getElementById("exp-bar-text");
const durationHudTextEl = document.getElementById("duration-hud-text");
const positionHudColEl = document.getElementById("position-hud-col");
const positionHudRowEl = document.getElementById("position-hud-row");
const dayHudNumberEl = document.getElementById("day-hud-number");
const calendarHudDateEl = document.getElementById("calendar-hud-date");
const seasonHudEl = document.getElementById("season-hud-text");
const weatherHudEl = document.getElementById("weather-hud-text");
const minimapCanvas = document.getElementById("minimap");
const minimapCtx = minimapCanvas.getContext("2d");

// "HH:MM:SS" — used for the Duration readout, `player.playTimeSeconds`
// (accumulated in updatePlayerStats() above).
function formatDuration(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
}

// Performance: only touch the page when what's shown actually changes. Every
// HUD change makes the phone redraw that part of the page and send it to the
// screen again — the food bar crept a hair narrower EVERY frame (food drains
// continuously) and the EXP text was written twice a frame (here, then again
// with the level by js/mines.js), so the HUD was redrawn every single frame.
function setHudText(el, text) {
  if (!el || el._hudText === text) return;
  el._hudText = text;
  el.textContent = text;
}
function setBar(fillEl, textEl, current, max) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const w = (Math.round(pct * 2) / 2) + "%"; // half-percent steps: invisible on a ~70px bar
  if (fillEl._hudWidth !== w) { fillEl._hudWidth = w; fillEl.style.width = w; }
  // the EXP bar shows the level too (js/mines.js) — formatted here so it's written once
  const text = textEl === expBarTextEl && typeof player.level === "number"
    ? "Lv " + player.level + "  " + Math.floor(current) + "/" + max
    : Math.round(current) + "/" + max;
  setHudText(textEl, text);
}

// Called every frame (main.js's loop) — updates every left-hud stat
// readout except the clock (already handled by main.js's own
// updateClockHUD(), untouched) and gold (renderGoldDisplays(), npc.js,
// only called when gold actually changes rather than every frame).
function updateStatsHUD() {
  setBar(healthBarFillEl, healthBarTextEl, player.health, player.maxHealth);
  setBar(staminaBarFillEl, staminaBarTextEl, player.stamina, player.maxStamina);
  setBar(foodBarFillEl, foodBarTextEl, player.food, player.maxFood);
  setBar(expBarFillEl, expBarTextEl, player.exp, player.maxExp);

  if (durationHudTextEl) durationHudTextEl.textContent = formatDuration(player.playTimeSeconds); // timer removed from the HUD

  const tile = getPlayerTile();
  positionHudColEl.textContent = tile.col;
  positionHudRowEl.textContent = tile.row;

  if (dayHudNumberEl) dayHudNumberEl.textContent = getGameDay(); // "Day N" replaced by the clock

  const date = getCalendarDate(); // js/calendar.js
  calendarHudDateEl.textContent = date.weekdayAbbr + ", " + date.monthAbbr + " " + date.dayOfMonth; // weekday shown so Maria's work/weekend schedule (js/npc.js) is readable
  seasonHudEl.textContent = date.seasonIcon + " " + date.season;

  const w = getCurrentWeather(); // js/calendar.js
  weatherHudEl.textContent = w.icon + " " + w.name;
}

/* ---------------- minimap ----------------
   A round dial showing the real map, zoomed in around the player — per
   request ("gawin mong circle", then "i-zoom in mo, yung kitang kita na
   yung bahay").

   It used to fit the WHOLE 3000x1640 world into a 110px circle. At that
   scale a house was about 7px across and a tile was half a pixel, so the
   dial was a green smudge that told you nothing. Now it covers a fixed
   MINIMAP_WORLD_SPAN window centred on the player, which puts a house at
   a third of the dial's width — actually recognisable.

   Being zoomed in is also what lets it draw straight from the sources
   every frame instead of from a cached thumbnail: the ground comes from
   world.js's full-resolution `worldCanvas` (one drawImage, cropped to
   the window), and only the handful of placed items inside that window
   are drawn on top. A cache would just be a blurrier copy of the same
   thing, since the window is now higher-resolution than any thumbnail
   worth keeping in memory. */
const MINIMAP_WORLD_SPAN = 640; // world px across the dial — 40 tiles; lower = more zoomed in
// Standing objects (houses, trees, stones) are drawn oversized on the
// dial — per request ("medyo lakihan mo pa yung mga bahay at objects sa
// minimap, mga trees"). At true scale a house is only a third of the
// dial and a tree half that, so they read as specks rather than the
// landmarks you actually navigate by.
//
// Done as an icon multiplier rather than by zooming the dial in further:
// zooming would have pushed the camera-viewport box past the rim at zoom
// 4 (the main view is 480 world px wide there, already three quarters of
// the window) and shown less of your surroundings. This keeps the same
// area visible and just draws the landmarks bigger on top of it.
//
// FLAT items are deliberately excluded. Ground tiles — paths, dirt,
// water, floor — butt up against each other seamlessly, so scaling each
// one up would make a laid path overlap itself into a lumpy, misplaced
// smear. Only things that stand up get the boost.
const MINIMAP_ITEM_SCALE = 1.5;


/* ---------------- map icons ----------------
   Per request: instead of plain dots, the minimap and the world map show
   each townsperson's own HEAD (cropped from their sprite — the front view
   when they have one, else their side view) and each animal's head, and
   the player is an arrow pointing the way they face. Each icon is cut
   once from the loaded art and cached. */
const MAP_ICON_PX = 12; // drawn size on the 110px dial
const mapIconCache = new Map();

// Crops the opaque part of `rows` (frame rows) of frame 0 of a sheet.
function cropMapIcon(key, sheet, fw, fh, y0, y1, x0 = 0, x1 = fw) {
  if (mapIconCache.has(key)) return mapIconCache.get(key);
  if (!sheet || !sheet.width) return null;
  const c = document.createElement("canvas");
  c.width = fw; c.height = fh;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(sheet, 0, 0, fw, fh, 0, 0, fw, fh);
  let d;
  try { d = g.getImageData(0, 0, fw, fh).data; } catch (e) { mapIconCache.set(key, null); return null; }
  let minX = fw, minY = fh, maxX = -1, maxY = -1;
  for (let y = Math.max(0, y0); y < Math.min(fh, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(fw, x1); x++) {
      if (d[(y * fw + x) * 4 + 3] > 40) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) { mapIconCache.set(key, null); return null; }
  const w = maxX - minX + 1, h = maxY - minY + 1, sz = Math.max(w, h);
  const out = document.createElement("canvas");
  out.width = sz; out.height = sz;
  out.getContext("2d").drawImage(c, minX, minY, w, h, Math.floor((sz - w) / 2), Math.floor((sz - h) / 2), w, h);
  mapIconCache.set(key, out);
  return out;
}

// A townsperson's head: the 64x64 character frame, rows from the top of the
// hair down to the chin (the collar line sits at about row 31).
function citizenMapIcon(id) {
  const down = assets["citizen" + id + "IdleDown"];
  const sheet = down && down.width ? down : assets["citizen" + id + "IdleRight"];
  return cropMapIcon("cit" + id, sheet, FRAME_SIZE, FRAME_SIZE, 0, 31);
}
function mariaMapIcon() { return cropMapIcon("maria", assets.npcIdleRight, FRAME_SIZE, FRAME_SIZE, 0, 31); }

// An animal's head, from its front (idle, facing down) frame: the top part
// for the big ones (cow: head and horns, sheep: face and wool cap, pig:
// face), the whole little chicken.
const ANIMAL_HEAD_ROWS = { chicken: [0, 1], pig: [0.15, 0.8], cow: [0, 0.68], sheep_white: [0.1, 0.78], sheep_blackface: [0.1, 0.78], sheep_cream: [0.1, 0.78] };
function animalMapIcon(id) {
  const sheet = assets["animal_" + id + "_idle_down"];
  if (!sheet || !sheet.width) return null;
  const fw = Math.floor(sheet.width / 4), fh = sheet.height;
  const r = ANIMAL_HEAD_ROWS[id] || [0, 1];
  return cropMapIcon("ani" + id, sheet, fw, fh, Math.floor(fh * r[0]), Math.ceil(fh * r[1]));
}

function drawMapIcon(g, icon, x, y, size) {
  if (!icon) { // art can't be read (e.g. a file:// page taints the canvas) — a plain dot instead
    g.beginPath(); g.arc(x, y, Math.max(2, size * 0.2), 0, Math.PI * 2);
    g.fillStyle = "#ffffff"; g.fill(); g.lineWidth = 1; g.strokeStyle = "rgba(0,0,0,0.6)"; g.stroke();
    return true;
  }
  g.imageSmoothingEnabled = false;
  g.drawImage(icon, Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  return true;
}

// The player: an arrow pointing the way they face.
function drawPlayerArrow(g, x, y, size) {
  const ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[player.facing] ?? -Math.PI / 2;
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(size * 0.6, 0);
  g.lineTo(-size * 0.45, -size * 0.42);
  g.lineTo(-size * 0.18, 0);
  g.lineTo(-size * 0.45, size * 0.42);
  g.closePath();
  g.fillStyle = "#ffffff";
  g.fill();
  g.lineWidth = Math.max(1, size * 0.14);
  g.strokeStyle = "rgba(0,0,0,0.85)";
  g.lineJoin = "round";
  g.stroke();
  g.restore();
}

// Performance: the dial is its own small canvas and keeps its picture
// between draws, so it's only redrawn every MINIMAP_EVERY frames (the dots
// still move at ~20 fps) — it walks every placed item in its window.
// The items layer of the dial, for the whole map, at the dial's scale.
const MINIMAP_BAKE_PAD = 256; // world px of margin round the map — tall art pokes above row 0
let minimapBake = null;
function minimapItemsCanvas(scale) {
  const ver = typeof layerVersion !== "undefined" ? layerVersion : 0;
  const b = minimapBake;
  // also refreshed every few seconds while art is still loading in
  if (b && b.scale === scale && b.version === ver && (b.complete || performance.now() - b.at < 3000)) return b;
  let maxCol = 0, maxRow = 0;
  for (const layer of ALL_LAYERS) for (const key of layer.keys()) {
    const comma = key.indexOf(",");
    maxCol = Math.max(maxCol, +key.slice(0, comma)); maxRow = Math.max(maxRow, +key.slice(comma + 1));
  }
  const W = Math.ceil(((maxCol + 1) * TILE + MINIMAP_BAKE_PAD * 2) * scale);
  const H = Math.ceil(((maxRow + 1) * TILE + MINIMAP_BAKE_PAD * 2) * scale);
  const cv = b && b.canvas.width === W && b.canvas.height === H ? b.canvas : document.createElement("canvas");
  cv.width = W; cv.height = H; // also clears it
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  let complete = true;
  for (const layer of ALL_LAYERS) {
    for (const [key, type] of layer) {
      const comma = key.indexOf(",");
      const col = +key.slice(0, comma);
      const row = +key.slice(comma + 1);
      const def = itemDefs[type];
      if (!def || !def.icon) continue;
      if (!def.icon.width) { complete = false; continue; } // art not loaded yet
      const icon = def.icon;
      // Grown from the BASE of its tile (so a bigger tree only gets taller),
      // shifted by `artRoot` like the real sprite — same as camera.js.
      const bump = def.flat ? 1 : MINIMAP_ITEM_SCALE;
      const dw = icon.width * scale * bump;
      const dh = icon.height * scale * bump;
      const root = def.artRoot;
      const dx = ((col + 0.5) * TILE + MINIMAP_BAKE_PAD) * scale - dw / 2 - (root ? root.x * scale : 0);
      const dy = ((row + 1) * TILE + MINIMAP_BAKE_PAD) * scale - dh - (root ? root.y * scale : 0);
      g.drawImage(icon, dx, dy, dw, dh);
    }
  }
  minimapBake = { canvas: cv, scale, version: ver, at: performance.now(), complete };
  return minimapBake;
}

const MINIMAP_EVERY = 3;
// Phones: by time, ~8 times a second, not every 3rd frame — the minimap is
// its own canvas on the page, and every redraw is another picture the phone
// has to send to the screen.
const MINIMAP_PHONE_MS = 120;
let minimapFrame = 0, minimapDrawnAt = 0;
function drawMinimap() {
  if (typeof isMobileMode === "function" && isMobileMode()) {
    const now = performance.now();
    if (now - minimapDrawnAt < MINIMAP_PHONE_MS) return;
    minimapDrawnAt = now;
  } else if (++minimapFrame % MINIMAP_EVERY !== 0) return;
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  const radius = Math.min(w, h) / 2;

  // World window the dial covers, centred on the player. Height follows
  // the canvas's own proportions so nothing is stretched.
  const spanW = MINIMAP_WORLD_SPAN;
  const spanH = (spanW * h) / w;
  // Per request: the dial only ever shows the map itself — near an edge it
  // stops at the border (the player's arrow moves off-centre instead) rather
  // than showing the dark/brown nothing past it. Uses the CURRENT world's
  // size (the wild world is smaller than the town).
  const mapW = typeof worldW === "function" ? worldW() : MAP_W;
  const mapH = typeof worldH === "function" ? worldH() : MAP_H;
  const clampTo = (v, span, size) => (size <= span ? (size - span) / 2 : Math.max(0, Math.min(size - span, v)));
  const at = player.scene === "inside" && player.outsideReturn ? player.outsideReturn : player; // indoors: where you went in
  const originX = clampTo(at.x - spanW / 2, spanW, mapW);
  const originY = clampTo(at.y - spanH / 2, spanH, mapH);
  const scale = w / spanW; // world px -> minimap px
  const toX = (wx) => (wx - originX) * scale;
  const toY = (wy) => (wy - originY) * scale;

  minimapCtx.clearRect(0, 0, w, h);
  minimapCtx.save();
  // Round dial: the map, the items, the viewport box and the dots are
  // all clipped to the circle together, so they stop at the rim as one.
  minimapCtx.beginPath();
  minimapCtx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
  minimapCtx.clip();

  minimapCtx.fillStyle = "#14100a"; // shows through past the map edges
  minimapCtx.fillRect(0, 0, w, h);

  // Baked ground, cropped to the window. A source rect that runs off the
  // edge of the map is fine — the browser draws the overlapping part and
  // scales the destination to match, which is exactly the "dark past the
  // border" look we want near a map edge.
  minimapCtx.imageSmoothingEnabled = false;
  // only the part of the ground canvas that is this world's map
  {
    const sx = Math.max(0, originX), sy = Math.max(0, originY);
    const ex = Math.min(mapW, originX + spanW), ey = Math.min(mapH, originY + spanH);
    if (ex > sx && ey > sy) minimapCtx.drawImage(worldCanvas, sx, sy, ex - sx, ey - sy, toX(sx), toY(sy), (ex - sx) * scale, (ey - sy) * scale);
  }

  // Everything placed on top of it — same bottom-centre anchor
  // camera.js draws the real thing with, so the dial lines up with what
  // you actually see. Only tiles inside the window are considered, so
  // this stays cheap however much has been built elsewhere.
  const margin = 8; // tiles — big sprites anchor well below/right of where their art starts
  const minCol = Math.floor(originX / TILE) - margin;
  const maxCol = Math.ceil((originX + spanW) / TILE) + margin;
  const minRow = Math.floor(originY / TILE) - margin;
  const maxRow = Math.ceil((originY + spanH) / TILE) + margin;

  // PERFORMANCE: every placed item used to be redrawn into the dial on
  // every refresh (~1,700 drawImage calls). They're now baked ONCE into a
  // whole-map canvas at the dial's scale (minimapItemsCanvas() below) and
  // the dial just crops it — rebuilt only when a layer changes
  // (layerVersion, js/player.js) or the dial is resized.
  const baked = minimapItemsCanvas(scale);
  if (baked) {
    minimapCtx.drawImage(baked.canvas, (originX + MINIMAP_BAKE_PAD) * scale, (originY + MINIMAP_BAKE_PAD) * scale, w, h, 0, 0, w, h);
  }
  void minCol; void maxCol; void minRow; void maxRow;

  // (The white camera-viewport box that used to be drawn here was
  // removed per request — "alisin mo na yung mismong border na white".)

  // Heads instead of dots (map icons above): animals first, then the
  // townsfolk and tavern customers outside, Maria, and the player's arrow
  // last so nothing covers it.
  const inDial = (x, y) => x >= -6 && x <= w + 6 && y >= -6 && y <= h + 6;
  if (typeof animals !== "undefined") {
    for (const a of animals) {
      const ax = toX(a.fx), ay = toY(a.fy);
      if (inDial(ax, ay)) drawMapIcon(minimapCtx, animalMapIcon(a.id), ax, ay, a.id === "cow" ? MAP_ICON_PX : MAP_ICON_PX - 2);
    }
  }
  const townPeople = typeof currentWorld === "undefined" || currentWorld === "main"; // they live in the town map only
  for (const c of citizens) {
    if (c.scene !== "outside" || !townPeople) continue;
    const cx = toX(c.fx), cy = toY(c.fy);
    if (inDial(cx, cy)) drawMapIcon(minimapCtx, citizenMapIcon(c.id), cx, cy, MAP_ICON_PX);
  }
  if (typeof customers !== "undefined") {
    for (const cu of customers) {
      if (cu.scene !== "outside" || cu.state === "away" || !cu.look || !townPeople) continue;
      const cx = toX(cu.fx), cy = toY(cu.fy);
      if (inDial(cx, cy)) drawMapIcon(minimapCtx, citizenMapIcon(cu.look), cx, cy, MAP_ICON_PX);
    }
  }
  if (npc.scene === "outside" && townPeople) {
    const npcX = toX(npc.x), npcY = toY(npc.y);
    if (inDial(npcX, npcY)) drawMapIcon(minimapCtx, mariaMapIcon(), npcX, npcY, MAP_ICON_PX);
  }

  // The player — an arrow, always dead centre.
  {
    // off-centre near a map edge (the dial stops at the border); kept inside the round dial
    let ax = toX(at.x) - w / 2, ay = toY(at.y) - h / 2;
    const d = Math.hypot(ax, ay), lim = radius - 8;
    if (d > lim) { ax *= lim / d; ay *= lim / d; }
    drawPlayerArrow(minimapCtx, w / 2 + ax, h / 2 + ay, 12);
  }

  minimapCtx.restore();

  // (The white rim that used to be stroked around the dial was removed
  // per request, along with the viewport box above.)
}



/* ---------------- full world map (click the minimap) ----------------
   Per request ("clickable mag appear yung buong map"): clicking the
   minimap opens the WHOLE world, scaled to fit the screen — the same
   baked ground and placed items the dial draws, plus where you and Maria
   are. Click anywhere, press Esc or M to close it. The ground and items
   are drawn once when it opens; only the two dots are refreshed while
   it's open, so it costs nothing to leave up. */
const fullMapOverlayEl = document.createElement("div");
fullMapOverlayEl.id = "fullmap-overlay";
fullMapOverlayEl.className = "hidden";
fullMapOverlayEl.innerHTML =
  '<div id="fullmap-panel"><div id="fullmap-title">World Map <span class="hint">(click anywhere or press Esc to close)</span></div>' +
  '<div id="fullmap-stack"><canvas id="fullmap-base"></canvas><canvas id="fullmap-dots"></canvas></div></div>';
document.body.appendChild(fullMapOverlayEl);
const fullMapBaseEl = fullMapOverlayEl.querySelector("#fullmap-base");
const fullMapDotsEl = fullMapOverlayEl.querySelector("#fullmap-dots");
let fullMapScale = 1;
let fullMapTimer = null;

function isFullMapOpen() {
  return !fullMapOverlayEl.classList.contains("hidden");
}

function drawFullMapBase() {
  // only this world's map (the wild world is smaller than the town)
  const MW = typeof worldW === "function" ? worldW() : MAP_W, MH = typeof worldH === "function" ? worldH() : MAP_H;
  const s = Math.min((window.innerWidth * 0.9) / MW, (window.innerHeight * 0.8) / MH);
  fullMapScale = s;
  const w = Math.max(1, Math.round(MW * s));
  const h = Math.max(1, Math.round(MH * s));
  for (const c of [fullMapBaseEl, fullMapDotsEl]) { c.width = w; c.height = h; }
  const g = fullMapBaseEl.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.fillStyle = "#14100a";
  g.fillRect(0, 0, w, h);
  g.drawImage(worldCanvas, 0, 0, MW, MH, 0, 0, w, h);
  for (const layer of ALL_LAYERS) {
    for (const [key, type] of layer) {
      const def = itemDefs[type];
      if (!def || !def.icon || !def.icon.width) continue;
      const comma = key.indexOf(",");
      const col = +key.slice(0, comma), row = +key.slice(comma + 1);
      const bump = def.flat ? 1 : MINIMAP_ITEM_SCALE; // same landmark boost the dial uses
      const dw = def.icon.width * s * bump, dh = def.icon.height * s * bump;
      const root = def.artRoot;
      const dx = (col + 0.5) * TILE * s - dw / 2 - (root ? root.x * s : 0);
      const dy = (row + 1) * TILE * s - dh - (root ? root.y * s : 0);
      g.drawImage(def.icon, dx, dy, dw, dh);
    }
  }
}

function drawFullMapDots() {
  const g = fullMapDotsEl.getContext("2d");
  const s = fullMapScale;
  g.clearRect(0, 0, fullMapDotsEl.width, fullMapDotsEl.height);
  const dot = (x, y, r, fill) => {
    g.beginPath();
    g.arc(x * s, y * s, r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = "rgba(0,0,0,0.7)";
    g.stroke();
  };
  const icon = (ic, x, y, sz) => { if (!drawMapIcon(g, ic, x * s, y * s, sz)) dot(x, y, 3, "#ffffff"); };
  if (typeof animals !== "undefined") for (const a of animals) icon(animalMapIcon(a.id), a.fx, a.fy, a.id === "cow" ? 16 : 13); // farm animals (js/animals.js)
  const townPeople = typeof currentWorld === "undefined" || currentWorld === "main";
  if (townPeople) for (const c of citizens) if (c.scene === "outside") icon(citizenMapIcon(c.id), c.fx, c.fy, 16); // townsfolk (js/citizens.js)
  if (townPeople && typeof customers !== "undefined") for (const cu of customers) if (cu.scene === "outside" && cu.state !== "away" && cu.look) icon(citizenMapIcon(cu.look), cu.fx, cu.fy, 16);
  if (townPeople && npc.scene === "outside") icon(mariaMapIcon(), npc.x, npc.y, 16);
  // Indoors, player.x/y are room coordinates — show where they went in.
  const p = player.scene === "inside" && player.outsideReturn ? player.outsideReturn : player;
  drawPlayerArrow(g, p.x * s, p.y * s, 14);
}

function openFullMap() {
  drawFullMapBase();
  drawFullMapDots();
  fullMapOverlayEl.classList.remove("hidden");
  clearInterval(fullMapTimer);
  fullMapTimer = setInterval(drawFullMapDots, 200);
}

function closeFullMap() {
  fullMapOverlayEl.classList.add("hidden");
  clearInterval(fullMapTimer);
  fullMapTimer = null;
}

minimapCanvas.addEventListener("click", openFullMap);
fullMapOverlayEl.addEventListener("click", closeFullMap);
window.addEventListener("keydown", (e) => {
  if (!isFullMapOpen()) return;
  if (e.key === "Escape" || e.key === "m" || e.key === "M") closeFullMap();
});
window.addEventListener("resize", () => { if (isFullMapOpen()) { drawFullMapBase(); drawFullMapDots(); } });
