"use strict";

/* =================================================================
   MAIN — entry point. Waits for assets, sets everything up, and
   runs the game loop (update -> render -> repeat).
================================================================= */
let last = performance.now();

// Only touch the DOM when the displayed text actually changes (clock ticks
// once per in-game minute, not every frame).
let lastClockText = "";
function updateClockHUD() {
  const el = document.getElementById("clock-hud");
  if (!el) return;
  const text = formatMilitaryTime() + (isDaytime() ? " ☀️" : " 🌙");
  if (text !== lastClockText) {
    lastClockText = text;
    el.textContent = text;
  }
}

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  updateDayNight(); // wall-clock based — doesn't need dt, see js/daynight.js
  updateResources(); // wall-clock based too — restores respawned stones (js/resources.js)
  updateFloatingPickups(dt); // throw/bounce/rest/vacuum physics for resource-drop popups (js/resources.js)
  updateThrownTosses(); // clears out finished T-key throw arcs (js/resources.js)
  updateWildgrassSway(dt); // grass-bending sim as the player walks through it (js/wildgrass.js)
  updateNPC(dt); // idle animation + facing auto-switch for the shopkeeper (js/npc.js)
  updatePlayerStats(dt); // food depletion + playtime accumulation (js/hud.js)
  updateWeather(); // re-rolls Sunny/Rainy/Snow once per in-game day, weighted by season (js/calendar.js)
  updateWeatherFX(dt); // rain/snow/cloud/fog particles + god rays, gated/nudged by that weather (js/weatherfx.js)
  updatePlayer(dt);
  updateHeldItemPlacement(); // keeps placing while the mouse is held (js/inventory.js)
  render();
  updateClockHUD();
  updateStatsHUD(); // health/stamina/food/exp bars, duration, col/row, day, calendar date/season, weather (js/hud.js)
  requestAnimationFrame(loop);
}

function start() {
  resizeCanvas();
  initWeatherFX(); // needs resizeCanvas()'s view/zoom to already be set (js/weatherfx.js)
  buildWorld();
  loadGame(); // restore placed items / inventory / position from last time, if any
  setupPlacementClickHandler();
  setupNpcClickHandler(); // left-click-the-shopkeeper-to-shop (js/npc.js)
  renderGoldDisplays(); // shows the starting/restored gold total right away, not just after the first purchase
  updateStatsHUD(); // shows the starting/restored stat values right away too, same reasoning
  last = performance.now();
  requestAnimationFrame(loop);
}

whenAssetsReady(start);
