"use strict";

/* =================================================================
   DAY / NIGHT CYCLE
   ------------------------------------------------------------------
   - One full in-game day (24 military hours) takes REAL_SECONDS_PER_DAY_CYCLE
     real seconds (15 real minutes by default): 7.5 real minutes of in-game
     day (06:00-18:00) + 7.5 real minutes of in-game night (18:00-06:00).
   - The clock is anchored to a persisted real-world timestamp (see
     `loadOrInitDayNightEpoch()` below), not a counter that advances by `dt`
     each frame — so refreshing or reopening the page later resumes at the
     correct time instead of resetting to sunrise.
   - The clock is plain military time (00:00-23:59), always shown as HH:MM.
   - The shadow's look is entirely driven by the sun's position — this is a
     LEAN/LENGTH flip, not the shadow physically sliding sideways:
       * At sunrise the sun is low in the east, so the shadow is long and
         leans hard to the left.
       * At solar noon the sun is directly overhead, so the shadow shrinks
         to a short, compact shape right under/"on top of" the character
         (no lean either way).
       * At sunset the sun is low in the west, so the shadow is long again
         but now leans hard to the right.
     So over the day it goes left -> (compact, centered) -> right, flipping
     sides through that short centered point at noon, matching how a real
     shadow moves as the sun crosses the sky from east to west.
   - The shadow doesn't just pop on/off at 06:00/18:00 — it eases in/out
     over TWILIGHT_HOURS of in-game time (see getDayFactor()), same as the
     sky tint below.
================================================================= */

// In-game clock, in seconds since 00:00.
//
// Persisted across refreshes: instead of storing `gameSeconds` itself (which
// would freeze while the tab is closed), we store the real-world timestamp
// that corresponds to in-game 00:00 ("epoch") in localStorage, and derive
// `gameSeconds` from how much real time has passed since then. That means
// the clock keeps flowing exactly as if it never stopped — refreshing, or
// even closing the browser and coming back later, picks up at the correct
// time instead of resetting to sunrise.
const DAYNIGHT_STORAGE_KEY = "rpg-prototype-daynight-epoch-v1";

function loadOrInitDayNightEpoch() {
  try {
    const stored = localStorage.getItem(DAYNIGHT_STORAGE_KEY);
    if (stored !== null && !Number.isNaN(Number(stored))) return Number(stored);
  } catch (e) {
    // localStorage unavailable (e.g. file:// in some browsers) — fall through
  }
  // First time ever: pick an epoch so "right now" lands at sunrise (06:00),
  // same as the old fixed starting point, then remember it.
  const epoch = Date.now() - (SUNRISE_HOUR * 3600 * 1000) / TIME_SCALE;
  try {
    localStorage.setItem(DAYNIGHT_STORAGE_KEY, String(epoch));
  } catch (e) {
    // ignore — clock will just re-anchor to sunrise every load if storage
    // isn't available, no worse than before
  }
  return epoch;
}

let dayNightEpoch = loadOrInitDayNightEpoch();
let gameSeconds = SUNRISE_HOUR * 3600; // overwritten on the very first updateDayNight() call
let gameDay = 1; // overwritten on the very first updateDayNight() call too — see getGameDay()

function updateDayNight() {
  const realElapsedSeconds = (Date.now() - dayNightEpoch) / 1000;
  const gameElapsedSeconds = realElapsedSeconds * TIME_SCALE;
  // Proper positive modulo (realElapsedSeconds is always >= 0 in practice,
  // but this keeps it safe regardless).
  gameSeconds = ((gameElapsedSeconds % GAME_SECONDS_PER_DAY) + GAME_SECONDS_PER_DAY) % GAME_SECONDS_PER_DAY;
  // Whole days elapsed since the epoch, 1-indexed ("Day 1" is the first
  // day, not "Day 0") — same anchor as gameSeconds above, so it advances
  // in lockstep with the clock and survives a refresh the same way.
  gameDay = Math.max(1, Math.floor(gameElapsedSeconds / GAME_SECONDS_PER_DAY) + 1);
}

// Current in-game hour, fractional (0-24).
function getGameHour() {
  return gameSeconds / 3600;
}

// Current in-game day number, 1-indexed — for the "Day N" HUD readout.
function getGameDay() {
  return gameDay;
}

// Jumps the clock forward to the NEXT SUNRISE_HOUR (06:00) — today's if
// it hasn't happened yet, otherwise tomorrow's — by shifting the
// persisted epoch backward so the very next updateDayNight() call lands
// exactly there. Used by the Big Bed sleep sequence (js/resources.js's
// trySleepInBed()/updateSleeping()) to "wake up at 6am" — called from
// inside a beginSceneFade() onMidpoint, same as every other interior.js
// scene transition, so the jump itself is never visible on screen.
function skipToNextSunrise() {
  const targetDayElapsed = SUNRISE_HOUR * 3600;
  const currentDayElapsed = gameSeconds;
  const delta = currentDayElapsed < targetDayElapsed
    ? targetDayElapsed - currentDayElapsed
    : (GAME_SECONDS_PER_DAY - currentDayElapsed) + targetDayElapsed;
  dayNightEpoch -= (delta / TIME_SCALE) * 1000;
  try {
    localStorage.setItem(DAYNIGHT_STORAGE_KEY, String(dayNightEpoch));
  } catch (e) {
    // localStorage unavailable — the jump still works for this session,
    // just won't survive a reload any better than the clock normally does
  }
  updateDayNight(); // refresh gameSeconds/gameDay immediately, don't wait for next frame
}

// "HH:MM" in 24-hour military time.
function formatMilitaryTime() {
  const totalMinutes = Math.floor(gameSeconds / 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function isDaytime() {
  const h = getGameHour();
  return h >= SUNRISE_HOUR && h < SUNSET_HOUR;
}

// 0 = full night, 1 = full day, easing smoothly through TWILIGHT_HOURS on
// either side of sunrise/sunset. This drives both the shadow's opacity and
// the sky overlay's darkness, so nothing snaps on/off abruptly.
function getDayFactor() {
  const h = getGameHour();
  if (h < SUNRISE_HOUR || h > SUNSET_HOUR) return 0; // full night
  const intoDay = h - SUNRISE_HOUR;      // 0 right at sunrise, grows through the morning
  const untilNight = SUNSET_HOUR - h;    // 0 right at sunset, grows earlier in the day
  const ramp = Math.min(intoDay, untilNight, TWILIGHT_HOURS) / TWILIGHT_HOURS;
  return Math.max(0, Math.min(1, ramp));
}

// 0 at sunrise, 1 at sunset — where the sun currently is along its daytime arc.
function getSunProgress() {
  const h = getGameHour();
  const span = SUNSET_HOUR - SUNRISE_HOUR;
  return Math.max(0, Math.min(1, (h - SUNRISE_HOUR) / span));
}

// Shadow shape for the current moment: how visible it is, which way (and
// how hard) it leans, and how squashed/long it is.
function getShadowParams() {
  const alpha = getDayFactor();
  if (alpha <= 0) {
    return { alpha: 0, skew: 0, squashY: SHADOW_SQUASH_MIN };
  }

  const t = getSunProgress();                    // 0 (sunrise) -> 1 (sunset)
  const elevation = Math.sin(t * Math.PI);        // 0 at edges, 1 at solar noon
  const lowSun = 1 - elevation;                   // 1 at edges, 0 at solar noon

  const squashMagnitude = SHADOW_SQUASH_MIN + (SHADOW_SQUASH_MAX - SHADOW_SQUASH_MIN) * lowSun;
  // Positive skew leans left, negative leans right (matches the project's
  // existing convention). Left at sunrise, sweeping through 0 at noon,
  // to right at sunset.
  const skewSign = t < 0.5 ? 1 : -1;
  const skew = SHADOW_LEAN_MAX * lowSun * skewSign;
  // `squashY` carries the SAME sign as skew (not just a magnitude) so the
  // shadow's far tip rotates as a whole, not just leans sideways: at
  // sunrise (skewSign +1) it points down-LEFT (the sign camera.js's
  // drawShadow() expects for "down"); at sunset (skewSign -1) that flips
  // to up-RIGHT, the mirror image, instead of always pointing down no
  // matter the time of day. Per request — the shadow used to only ever
  // swing left/right while always extending downward on screen.
  const squashY = squashMagnitude * skewSign;

  return { alpha, skew, squashY };
}

// --- Sky tint -------------------------------------------------------
// A handful of (hour -> color) keyframes, interpolated smoothly across the
// day: deep night blue, a warm sunrise/sunset glow, and clear/transparent
// through the middle of the day.
const SKY_KEYFRAMES = [
  { h: 0, r: 10, g: 15, b: 40, a: 0.55 },
  { h: SUNRISE_HOUR - TWILIGHT_HOURS, r: 10, g: 15, b: 40, a: 0.55 },
  { h: SUNRISE_HOUR, r: 255, g: 150, b: 80, a: 0.30 },
  { h: SUNRISE_HOUR + TWILIGHT_HOURS, r: 255, g: 150, b: 80, a: 0 },
  { h: SUNSET_HOUR - TWILIGHT_HOURS, r: 255, g: 140, b: 70, a: 0 },
  { h: SUNSET_HOUR, r: 255, g: 140, b: 70, a: 0.30 },
  { h: SUNSET_HOUR + TWILIGHT_HOURS, r: 10, g: 15, b: 40, a: 0.55 },
  { h: 24, r: 10, g: 15, b: 40, a: 0.55 },
];

function getSkyOverlayColor() {
  const h = getGameHour();
  let a = SKY_KEYFRAMES[0], b = SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1];
  for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
    if (h >= SKY_KEYFRAMES[i].h && h <= SKY_KEYFRAMES[i + 1].h) {
      a = SKY_KEYFRAMES[i];
      b = SKY_KEYFRAMES[i + 1];
      break;
    }
  }
  const span = b.h - a.h || 1;
  const t = (h - a.h) / span;
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  const al = a.a + (b.a - a.a) * t;
  return `rgba(${r},${g},${bl},${al.toFixed(3)})`;
}
