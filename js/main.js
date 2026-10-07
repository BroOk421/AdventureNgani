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

// One error in a single frame used to stop the whole game: the exception
// fired before requestAnimationFrame() at the bottom was reached, so no
// next frame was ever scheduled and everything froze. Now the next frame
// is always scheduled first, and an error is logged (once per distinct
// message, so the console isn't flooded 60 times a second) while the
// game keeps running.
const loggedLoopErrors = new Set();
let gameFrameCount = 0; // frames actually drawn (the phone FPS readout counts these, js/mobile.js)
let lastDrawnAt = 0;
function loop(now) {
  requestAnimationFrame(loop);
  // Phones: at most MOBILE_MAX_FPS frames a second (js/config.js). The 2 ms
  // slack keeps a 60 Hz screen from skipping frames on timer jitter.
  if (typeof MOBILE_ON !== "undefined" && MOBILE_ON && typeof MOBILE_MAX_FPS !== "undefined" && MOBILE_MAX_FPS > 0) {
    // Keeps the leftover time, so 90 on a 120 Hz screen really draws 3 of every 4 frames.
    const interval = 1000 / MOBILE_MAX_FPS, elapsed = now - lastDrawnAt;
    if (elapsed < interval - 1.5) return;
    lastDrawnAt = elapsed >= interval && elapsed < interval * 3 ? now - (elapsed % interval) : now;
  }
  gameFrameCount++;
  try {
    loopFrame(now);
  } catch (err) {
    const key = String(err && err.message);
    if (!loggedLoopErrors.has(key)) {
      loggedLoopErrors.add(key);
      console.error("Frame error (the game keeps running):", err);
    }
    // Put the canvas back to a clean state in case the error happened
    // halfway through a transformed/faded draw.
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.filter = "none";
    } catch (e) { /* nothing more to do */ }
  }
}

function loopFrame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  updateDayNight(); // wall-clock based — doesn't need dt, see js/daynight.js
  updateResources(); // wall-clock based too — restores respawned stones (js/resources.js)
  updatePlantFx(); // bushes swaying as you walk through, trees shaking when chopped (js/plantfx.js)
  updateConstructions(); // wall-clock based too — finishes timed house builds (js/inventory.js)
  updateFloatingPickups(dt); // throw/bounce/rest/vacuum physics for resource-drop popups (js/resources.js)
  updateThrownTosses(); // clears out finished T-key throw arcs (js/resources.js)
  updateWildgrassSway(dt); // grass-bending sim as the player walks through it (js/wildgrass.js)
  updateNPC(dt); // idle animation + facing auto-switch for the shopkeeper (js/npc.js)
  updateCustomers(dt); // tavern customers coming, ordering, eating, leaving (js/customers.js)
  updateCitizens(dt); // Citizen B-E strolling around the map, avoiding collisions (js/citizens.js)
  updateAnimals(dt); // chickens, pigs, cows, sheep wandering near their spots (js/animals.js)
  updateBirds(dt); // flocks of 1-3 birds crossing the sky on sunny days (js/birds.js)
  updateWaiterJob(); // waiter shift hours, Maria's evening payday (js/waiter.js)
  updatePlayerStats(dt); // food depletion + playtime accumulation (js/hud.js)
  updateWeather(); // re-rolls Sunny/Rainy/Snow once per in-game day, weighted by season (js/calendar.js)
  updateWeatherFX(dt); // rain/snow/cloud/fog particles + god rays, gated/nudged by that weather (js/weatherfx.js)
  updateSceneFade(); // js/interior.js — advances the enter/exit fade-to-black, before movement reads its frozen state
  updatePlayer(dt);
  if (typeof updateFarm === "function") updateFarm(); // crops, sacks, the harvest collector (js/farm.js)
  updateHeldItemPlacement(); // keeps placing while the mouse is held (js/inventory.js)
  updateBenchHover(); // which sittable item (if any) the cursor is over right now (js/furniture.js) — before render() so the highlight is current this frame
  render();
  updateClockHUD();
  updateStatsHUD(); // health/stamina/food/exp bars, duration, col/row, day, calendar date/season, weather (js/hud.js)
}

function start() {
  resizeCanvas();
  initWeatherFX(); // needs resizeCanvas()'s view/zoom to already be set (js/weatherfx.js)
  buildWorld();
  loadGame(); // restore placed items / inventory / position from last time, if any
  ensureGroundFillInitialized(); // layer 2 all grass, on tiles nothing was placed on (js/world.js) — no-op if the save already had it
  updateDayNight(); // make sure the clock is current before placing anyone by it
  placePlayerAtHomeDoor(); // always start in front of your own house's door, if you have one (js/interior.js)
  placeNpcForCurrentTime(); // Maria starts wherever her schedule has her right now (js/npc.js)
  startInDefaultWorld(); // the wild world is home now — you start at your House there (js/worlds.js)
  setupPlacementClickHandler();
  setupNpcClickHandler(); // left-click-the-shopkeeper-to-shop (js/npc.js)
  setupBedClickHandler(); // left-click a placed Big Bed at night to sleep (js/resources.js)
  setupBenchClickHandler(); // left-click a placed bench to sit (js/furniture.js)
  setupWaiterClickHandler(); // stoves, serving customers, picking up tips (js/waiter.js) — capture phase, runs first
  renderGoldDisplays(); // shows the starting/restored gold total right away, not just after the first purchase
  updateStatsHUD(); // shows the starting/restored stat values right away too, same reasoning
  last = performance.now();
  requestAnimationFrame(loop);
  revealGameWhenSettled();
}

// The loading screen (index.html, html.agn-booting) comes off only once the
// window has stopped changing size — on Android the app goes full screen a
// moment after it opens, which used to show the game big first and then
// shrink it — and the HUD font is in. Then one resize at the final size and
// a short fade in, so the first thing you see is already the right size.
function revealGameWhenSettled() {
  const root = document.documentElement;
  if (!root.classList.contains("agn-booting")) return;
  const t0 = performance.now();
  let w = window.innerWidth, h = window.innerHeight, sameFor = 0;
  let fontsIn = !(document.fonts && document.fonts.ready);
  if (!fontsIn) document.fonts.ready.then(() => { fontsIn = true; }, () => { fontsIn = true; });
  const tick = () => {
    const nw = window.innerWidth, nh = window.innerHeight;
    if (nw === w && nh === h && nw > 0 && nh > 0) sameFor++; else { sameFor = 0; w = nw; h = nh; }
    const waited = performance.now() - t0;
    const settled = sameFor >= 12 && waited >= 250 && (fontsIn || waited > 1500);
    if (!settled && waited < 2500) { requestAnimationFrame(tick); return; }
    resizeCanvas();
    root.classList.add("agn-revealing");
    root.classList.remove("agn-booting");
    setTimeout(() => root.classList.remove("agn-revealing"), 450);
  };
  requestAnimationFrame(tick);
}

whenAssetsReady(start);
