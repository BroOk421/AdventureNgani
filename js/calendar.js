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

let currentWeather = WEATHER_STATES[0]; // placeholder — corrected by the forced first roll below
let lastWeatherRollDay = -1; // -1 never matches a real getGameDay() (always >= 1), forcing a real roll on the first updateWeather() call

// Called every frame (main.js's loop, same call site js/hud.js's old
// updateWeather() used to occupy) — cheap: only actually rerolls weather
// when the in-game day counter has changed, not every frame.
function updateWeather() {
  const day = getGameDay();
  if (day === lastWeatherRollDay) return;
  lastWeatherRollDay = day;
  currentWeather = pickWeightedWeather(getCalendarDate().monthIndex);
}

function getCurrentWeather() {
  return currentWeather;
}
