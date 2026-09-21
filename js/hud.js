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

/* ---------------- minimap ---------------- */

// Draws a scaled-down overview of the WHOLE map (not just what the
// camera currently sees) — a flat background rect standing in for the
// terrain (actual per-tile detail would be far too fine-grained to read
// at this size, so it's intentionally simplified), a dot for the player,
// a dot for the NPC, and a stroked rectangle outlining the camera's
// current viewport, so "naka-zoom" (what's actually zoomed into right
// now) is visible against the whole-map overview. Called every frame
// from render() (camera.js) — cheap enough at this scale not to need
// throttling.
function drawMinimap() {
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  const scaleX = w / MAP_W;
  const scaleY = h / MAP_H;

  minimapCtx.clearRect(0, 0, w, h);
  minimapCtx.fillStyle = "#2f5233"; // a flat stand-in for the map's general grass tone
  minimapCtx.fillRect(0, 0, w, h);

  // Camera viewport outline — what the main view is currently "zoomed"
  // into, against the whole-map overview.
  const viewWorldW = view.width / zoom;
  const viewWorldH = view.height / zoom;
  minimapCtx.strokeStyle = "rgba(255,255,255,0.8)";
  minimapCtx.lineWidth = 1;
  minimapCtx.strokeRect(camX * scaleX, camY * scaleY, viewWorldW * scaleX, viewWorldH * scaleY);

  // NPC dot
  minimapCtx.fillStyle = "#e0c56c";
  minimapCtx.beginPath();
  minimapCtx.arc(npc.x * scaleX, npc.y * scaleY, 2.5, 0, Math.PI * 2);
  minimapCtx.fill();

  // Player dot (drawn last/on top, and a little bigger, so it's always
  // the easiest of the two to spot)
  minimapCtx.fillStyle = "#ffffff";
  minimapCtx.beginPath();
  minimapCtx.arc(player.x * scaleX, player.y * scaleY, 3.5, 0, Math.PI * 2);
  minimapCtx.fill();
}
