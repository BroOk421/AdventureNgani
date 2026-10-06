"use strict";

/* =================================================================
   CALENDAR — Jan-Dec months grouped into 4 seasons, plus the weather
   system (Sunny/Cloudy/Rainy/Thunderstorm/Snow).

   Built entirely on top of js/daynight.js's existing getGameDay() (a
   plain 1-indexed day counter, already persisted/derived from the
   real-world clock — see daynight.js's own comments) instead of adding
   a second date counter: CALENDAR_DAYS_PER_MONTH (js/config.js, 30)
   just reinterprets that single number as month / day-of-month / year /
   season. Nothing about how days themselves advance changes.

   Weather is re-rolled once per in-game day (not every frame, not on a
   real-time timer like the old cosmetic HUD rotation this replaces),
   weighted by the CURRENT MONTH via js/config.js's
   MONTH_WEATHER_WEIGHTS — snow only falls in November and January, and
   most days land on Sunny or Cloudy. js/weatherfx.js reads
   getCurrentWeather() to decide whether to render rain (Rainy and
   Thunderstorm, the storm heavier and with lightning), snow, or neither.

   Entry points:
     getCalendarDate()   -> { year, monthIndex, monthName, monthAbbr,
                              dayOfMonth, season, seasonIcon }
                            called from js/hud.js every frame, cheap
                            (pure arithmetic on getGameDay()).
     getCurrentSeason()  -> "Spring" | "Summer" | "Fall" | "Winter"
     updateWeather()      called every frame from main.js's loop() —
                           same call site js/hud.js used to own for its
                           old cosmetic rotation; only rerolls when
                           getGameDay() has actually ticked over.
     getCurrentWeather()  -> { name, icon } — one of WEATHER_STATES
================================================================= */

/* --- day of the week ---
   Per request (Maria works Monday-Friday and only goes outside on the
   weekend). Day 1 of the save is a Monday, and it simply counts on from
   there in sevens off the same getGameDay() counter as everything else. */
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// 0 = Monday ... 6 = Sunday
function getWeekdayIndex() {
  return (getGameDay() - 1) % 7;
}

// Saturday or Sunday
function isWeekendDay() {
  return getWeekdayIndex() >= 5;
}

function getCalendarDate() {
  const dayIndex0 = getGameDay() - 1; // 0-indexed total in-game days elapsed
  const daysPerYear = CALENDAR_DAYS_PER_MONTH * 12;
  const year = Math.floor(dayIndex0 / daysPerYear) + 1;
  const dayOfYear = dayIndex0 % daysPerYear;
  const monthIndex = Math.floor(dayOfYear / CALENDAR_DAYS_PER_MONTH);
  const dayOfMonth = (dayOfYear % CALENDAR_DAYS_PER_MONTH) + 1;
  const season = CALENDAR_MONTH_SEASON[monthIndex];
  return {
    year,
    monthIndex,
    monthName: CALENDAR_MONTH_NAMES[monthIndex],
    monthAbbr: CALENDAR_MONTH_ABBR[monthIndex],
    dayOfMonth,
    season,
    seasonIcon: CALENDAR_SEASON_ICONS[season],
    weekdayIndex: dayIndex0 % 7,
    weekdayName: WEEKDAY_NAMES[dayIndex0 % 7],
    weekdayAbbr: WEEKDAY_ABBR[dayIndex0 % 7],
  };
}

function getCurrentSeason() {
  return getCalendarDate().season;
}

// --- Weather: rerolled once per in-game day, weighted by MONTH ---------
// Keyed by month rather than season — per request, snow has to land in
// November and January specifically, which a season-wide table can't
// express (Winter would drag December in with them). See
// MONTH_WEATHER_WEIGHTS in js/config.js for the actual odds.
function pickWeightedWeather(monthIndex) {
  const weights = MONTH_WEATHER_WEIGHTS[monthIndex] || MONTH_WEATHER_WEIGHTS[0];
  const roll = Math.random();
  let acc = 0;
  for (const state of WEATHER_STATES) {
    acc += weights[state.name] || 0;
    if (roll < acc) return state;
  }
  return WEATHER_STATES[0]; // fallback in case a month's weights don't sum to exactly 1
}

let currentWeather = WEATHER_STATES[0]; // placeholder — corrected by the first updateWeather() call
let lastWeatherRollDay = -1; // -1 never matches a real getGameDay() (always >= 1), forcing a real pick on the first updateWeather() call

/* --- The weather keeps going (per request: "dapat continues lang kahit
   mag exit at mag open ... hindi basta basta nagpapalit, kung mag palit
   man smooth transition"):
   - Today's weather is remembered (localStorage, WEATHER_SAVE_KEY) with
     the day it belongs to. Closing and opening the app, reloading, or
     going in and out of rooms gives back the SAME weather for that day —
     before, every launch rolled a brand-new one.
   - A new day keeps yesterday's weather now and then
     (WEATHER_KEEP_CHANCE), so it doesn't flip every single day.
   - When it does change while you're playing, the old weather fades out
     and the new one fades in over WEATHER_FADE_SEC (weatherWeight(),
     used by js/weatherfx.js and js/snowground.js) instead of switching
     in one frame. */
const WEATHER_SAVE_KEY = "agn-weather-v1";
const WEATHER_FADE_SEC = 15;
const WEATHER_KEEP_CHANCE = 0.45;
let weatherPrev = null;     // the weather fading out (null = no transition running)
let weatherFadeStart = 0;   // performance.now() when the transition began

function readSavedWeather() {
  try {
    const o = JSON.parse(localStorage.getItem(WEATHER_SAVE_KEY) || "null");
    if (!o || typeof o.day !== "number") return null;
    const state = WEATHER_STATES.find((w) => w.name === o.name);
    return state ? { day: o.day, state } : null;
  } catch (e) { return null; }
}
function writeSavedWeather(day, state) {
  try { localStorage.setItem(WEATHER_SAVE_KEY, JSON.stringify({ day, name: state.name })); } catch (e) { /* private mode */ }
}

function seasonalWeather(season) {
  const name = (typeof SEASON_WEATHER !== "undefined" && SEASON_WEATHER[season]) || "Sunny";
  return WEATHER_STATES.find((w) => w.name === name) || WEATHER_STATES[0];
}

// Called every frame (main.js's loop) — cheap: only does anything when
// the in-game day counter has changed.
function updateWeather() {
  const day = getGameDay();
  if (day === lastWeatherRollDay) return;
  const firstCall = lastWeatherRollDay === -1;
  lastWeatherRollDay = day;

  // Per request ("dapat seasonal lang kapag refresh ng page ganun parin"):
  // the weather now simply follows the SEASON (SEASON_WEATHER, js/config.js)
  // — no daily random roll any more. The season comes from the in-game
  // date, which is itself kept across reloads (js/daynight.js), so a
  // refresh, closing the app or going in and out of rooms always gives
  // the same weather; it only changes when the season does (with the
  // fade below while you're playing).
  const next = seasonalWeather(getCurrentSeason());
  writeSavedWeather(day, next);

  // On launch the weather is simply there; a change while playing fades.
  if (!firstCall && next !== currentWeather) {
    weatherPrev = weatherPrev && weatherFadeT() < 0.5 ? weatherPrev : currentWeather;
    weatherFadeStart = performance.now();
  }
  currentWeather = next;
}

// 0 -> 1 progress of the running transition (1 = none running), eased.
function weatherFadeT() {
  if (!weatherPrev) return 1;
  const t = (performance.now() - weatherFadeStart) / 1000 / WEATHER_FADE_SEC;
  if (t >= 1) { weatherPrev = null; return 1; }
  return t * t * (3 - 2 * t);
}

// How much of a weather is showing right now, 0..1 — the current one
// fading in while the previous one fades out. js/weatherfx.js scales the
// rain / snow / clouds / sun rays by this.
function weatherWeight(name) {
  const cur = getCurrentWeather();
  if (FORCE_WEATHER) return cur.name === name ? 1 : 0;
  const t = weatherFadeT();
  let w = cur.name === name ? t : 0;
  if (weatherPrev && weatherPrev.name === name) w += 1 - t;
  return w;
}

function getCurrentWeather() {
  // FORCE_WEATHER (js/config.js): a name there wins; null = the daily roll
  if (FORCE_WEATHER) {
    const forced = WEATHER_STATES.find((w) => w.name.toLowerCase() === String(FORCE_WEATHER).toLowerCase());
    if (forced) return forced;
  }
  return currentWeather;
}
