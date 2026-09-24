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

function setBar(fillEl, textEl, current, max) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  fillEl.style.width = pct + "%";
  textEl.textContent = Math.round(current) + "/" + max;
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

  durationHudTextEl.textContent = formatDuration(player.playTimeSeconds);

  const tile = getPlayerTile();
  positionHudColEl.textContent = tile.col;
  positionHudRowEl.textContent = tile.row;

  dayHudNumberEl.textContent = getGameDay();

  const date = getCalendarDate(); // js/calendar.js
  calendarHudDateEl.textContent = date.monthAbbr + " " + date.dayOfMonth;
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

function drawMinimap() {
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  const radius = Math.min(w, h) / 2;

  // World window the dial covers, centred on the player. Height follows
  // the canvas's own proportions so nothing is stretched.
  const spanW = MINIMAP_WORLD_SPAN;
  const spanH = (spanW * h) / w;
  const originX = player.x - spanW / 2;
  const originY = player.y - spanH / 2;
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
  minimapCtx.drawImage(worldCanvas, originX, originY, spanW, spanH, 0, 0, w, h);

  // Everything placed on top of it — same bottom-centre anchor
  // camera.js draws the real thing with, so the dial lines up with what
  // you actually see. Only tiles inside the window are considered, so
  // this stays cheap however much has been built elsewhere.
  const margin = 8; // tiles — big sprites anchor well below/right of where their art starts
  const minCol = Math.floor(originX / TILE) - margin;
  const maxCol = Math.ceil((originX + spanW) / TILE) + margin;
  const minRow = Math.floor(originY / TILE) - margin;
  const maxRow = Math.ceil((originY + spanH) / TILE) + margin;

  for (const layer of ALL_LAYERS) {
    for (const [key, type] of layer) {
      const comma = key.indexOf(",");
      const col = +key.slice(0, comma);
      const row = +key.slice(comma + 1);
      if (col < minCol || col > maxCol || row < minRow || row > maxRow) continue;
      const def = itemDefs[type];
      if (!def || !def.icon || !def.icon.width) continue; // stale/removed type, or art not loaded yet
      const icon = def.icon;
      // Grown from the BASE of the tile it stands on, not from its
      // middle — so an enlarged house/tree still sits exactly where it
      // really is and only gets taller, the same way the real sprite is
      // anchored. Scaling about the centre would drift everything
      // down-right of its true spot.
      const bump = def.flat ? 1 : MINIMAP_ITEM_SCALE;
      const dw = icon.width * scale * bump;
      const dh = icon.height * scale * bump;
      // `artRoot` items (lamp posts) hang off to one side of their tile
      // rather than sitting centred on it, so the dial has to apply the
      // same shift the world does or they'd show up a tile or two out.
      const root = def.artRoot;
      const dx = toX((col + 0.5) * TILE) - dw / 2 - (root ? root.x * scale : 0);
      const dy = toY((row + 1) * TILE) - dh - (root ? root.y * scale : 0);
      minimapCtx.drawImage(icon, dx, dy, dw, dh);
    }
  }

  // Camera viewport outline — the slice of this window the main view is
  // currently showing.
  const viewWorldW = view.width / zoom;
  const viewWorldH = view.height / zoom;
  minimapCtx.strokeStyle = "rgba(255,255,255,0.8)";
  minimapCtx.lineWidth = 1;
  minimapCtx.strokeRect(toX(camX), toY(camY), viewWorldW * scale, viewWorldH * scale);

  // NPC dot (only when they're actually inside the window)
  const npcX = toX(npc.x), npcY = toY(npc.y);
  if (npcX >= 0 && npcX <= w && npcY >= 0 && npcY <= h) {
    minimapCtx.fillStyle = "#e0c56c";
    minimapCtx.beginPath();
    minimapCtx.arc(npcX, npcY, 2.5, 0, Math.PI * 2);
    minimapCtx.fill();
  }

  // Player dot — always dead centre now, drawn last so nothing covers it.
  minimapCtx.fillStyle = "#ffffff";
  minimapCtx.strokeStyle = "rgba(0,0,0,0.6)";
  minimapCtx.lineWidth = 1;
  minimapCtx.beginPath();
  minimapCtx.arc(w / 2, h / 2, 3, 0, Math.PI * 2);
  minimapCtx.fill();
  minimapCtx.stroke();

  minimapCtx.restore();

  // Rim, drawn outside the clip so it isn't shaved in half by it.
  minimapCtx.save();
  minimapCtx.beginPath();
  minimapCtx.arc(w / 2, h / 2, radius - 0.5, 0, Math.PI * 2);
  minimapCtx.strokeStyle = "rgba(255,255,255,0.3)";
  minimapCtx.lineWidth = 1;
  minimapCtx.stroke();
  minimapCtx.restore();
}


