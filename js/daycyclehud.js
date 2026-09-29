"use strict";

/* =================================================================
   DAY / NIGHT MONITOR (top-left HUD)

   Per request: the round framed scene (assets/asset/sunny_cycle_monitoring
   and night_cycle_monitoring — 36 frames each, from dayandnightmonitoring
   .aseprite) sits in the top-left corner, and its animation follows the
   GAME CLOCK: the sun (or moon) climbs from the right, across the top and
   sets on the left over the course of the day (or night).
     SUNRISE_HOUR..SUNSET_HOUR (06:00-18:00)  -> the sunny sheet, frames 0-35
     SUNSET_HOUR..next SUNRISE (18:00-06:00)  -> the night sheet, frames 0-35
   i.e. one frame per 20 game minutes. The *_hud.png copies are the same
   frames scaled to 264x283 (the full-size sheets are 31716px wide — about
   120 MB each once decoded, far more than a 124px HUD widget needs).
================================================================= */

const DAYCYCLE_FRAMES = 36;
const DAYCYCLE_FRAME_W = 264, DAYCYCLE_FRAME_H = 283;

const daycycleSheets = { day: new Image(), night: new Image() };
daycycleSheets.day.src = "assets/asset/sunny_cycle_monitoring_hud.png";
daycycleSheets.night.src = "assets/asset/night_cycle_monitoring_hud.png";

const daycycleCanvas = document.getElementById("daycycle-hud");
const daycycleCtx = daycycleCanvas.getContext("2d");
let daycycleShown = ""; // "day:12" — only redraw when it changes

// Which sheet and frame the current game time falls on.
function daycycleFrameNow() {
  const h = getGameHour(); // 0..24, fractional (js/daynight.js)
  const dayLen = SUNSET_HOUR - SUNRISE_HOUR;
  const nightLen = 24 - dayLen;
  let sheet, t;
  if (h >= SUNRISE_HOUR && h < SUNSET_HOUR) {
    sheet = "day";
    t = (h - SUNRISE_HOUR) / dayLen;
  } else {
    sheet = "night";
    t = (h >= SUNSET_HOUR ? h - SUNSET_HOUR : h + 24 - SUNSET_HOUR) / nightLen;
  }
  const frame = Math.min(DAYCYCLE_FRAMES - 1, Math.max(0, Math.floor(t * DAYCYCLE_FRAMES)));
  return { sheet, frame };
}

function updateDayCycleHud() {
  const { sheet, frame } = daycycleFrameNow();
  const img = daycycleSheets[sheet];
  if (!img.complete || !img.naturalWidth) return;
  const key = sheet + ":" + frame;
  if (key === daycycleShown) return;
  daycycleShown = key;
  daycycleCtx.clearRect(0, 0, DAYCYCLE_FRAME_W, DAYCYCLE_FRAME_H);
  daycycleCtx.drawImage(img, frame * DAYCYCLE_FRAME_W, 0, DAYCYCLE_FRAME_W, DAYCYCLE_FRAME_H,
    0, 0, DAYCYCLE_FRAME_W, DAYCYCLE_FRAME_H);
}

daycycleSheets.day.addEventListener("load", () => { daycycleShown = ""; updateDayCycleHud(); });
daycycleSheets.night.addEventListener("load", () => { daycycleShown = ""; updateDayCycleHud(); });
setInterval(updateDayCycleHud, 250); // a frame lasts 20 game minutes; this is plenty
