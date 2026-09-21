"use strict";

/* =================================================================
   CONFIG — all the tunable numbers for the game live here
================================================================= */
const TILE = 16; // ground tile size (px)
const MAP_W = 3000; // world width (px)
const MAP_H = 1640; // world height (px)
const COLS = Math.ceil(MAP_W / TILE); // ground tile columns
const ROWS = Math.ceil(MAP_H / TILE); // ground tile rows

const FRAME_SIZE = 64; // every character sprite frame is 64x64
const DRAW_SIZE = 48; // character size in WORLD px (scales with zoom)

// Measured from the actual sprite sheets: across every idle/walk/run frame,
// the feet pixels sit at y ≈ 47–48 out of the 64px frame (there's empty
// padding above the head and below the feet baked into the art). Used to
// anchor the shadow exactly at the feet instead of guessing.
const SPRITE_FEET_FRACTION = 0.62;

// Measured the same way SPRITE_FEET_FRACTION was (Python/PIL alpha-channel
// bounding boxes across every sheet): there's real transparent padding
// baked in above the head too, not just below the feet. The head's actual
// visible top sits at y ≈ 16-18 out of the 64px frame (~0.28), not y = 0.
// Used to anchor the held-item icon to the real head, not the sprite's
// full (mostly-empty) bounding box.
const SPRITE_HEAD_FRACTION = 0.28;

// Nudge the shadow left/right relative to the character's feet.
// In WORLD px (same units as DRAW_SIZE) — negative = shift left, positive = shift right.
const SHADOW_OFFSET_X = 6;

// Which side the shadow leans/slants toward is no longer a fixed constant —
// it now sweeps left → right over the course of the in-game day, driven by
// js/daynight.js (see SHADOW_LEAN_MAX / SHADOW_SQUASH_MIN/MAX below) to
// mimic the real sun's arc. The old fixed `SHADOW_LEAN` has been replaced
// by that dynamic calculation in `getShadowParams()`.

// --- Day / night cycle ---
// Real-world time it takes for one full in-game 24-hour day to pass.
// 15 real minutes per full day, split evenly: 7.5 min of in-game day
// (06:00–18:00) + 7.5 min of in-game night (18:00–06:00).
const REAL_SECONDS_PER_DAY_CYCLE = 15 * 60;
const GAME_SECONDS_PER_DAY = 24 * 60 * 60;
// How many in-game seconds pass per real second (48x at the 30-min setting).
const TIME_SCALE = GAME_SECONDS_PER_DAY / REAL_SECONDS_PER_DAY_CYCLE;

const SUNRISE_HOUR = 6;  // 06:00 military time — day begins
const SUNSET_HOUR = 18;  // 18:00 military time — night begins
// How many in-game hours the fade in/out at sunrise/sunset takes — this is
// what makes the shadow (and the sky tint) ease in/out instead of just
// popping on/off the instant the clock crosses 06:00 or 18:00.
const TWILIGHT_HOURS = 1;

// Shadow shape range across the day, driven by the sun's position — this is
// a LEAN/LENGTH flip, not the shadow sliding sideways across the ground:
// long, low, sharply-leaning-left shadow at sunrise -> short, compact,
// centered ("on top of"/right under the character) shadow at solar noon ->
// long, sharply-leaning-right shadow at sunset. Character position and
// SHADOW_OFFSET_X are untouched; only the lean/squash of the shadow shape
// itself changes.
const SHADOW_LEAN_MAX = 1.3;    // max horizontal lean at sunrise/sunset
const SHADOW_SQUASH_MIN = 0.18; // shortest/most-compact shadow (solar noon)
const SHADOW_SQUASH_MAX = 0.9;  // longest shadow (sunrise/sunset)

// Each animation state has its own frame count (from the sheets you gave)
// and its own playback speed (frames per second).
// "collect", "crush", and "slice" are one-shot actions (see js/player.js
// and js/resources.js) — "collect" toggles carry mode; "crush"/"slice"
// are the harvest-hit animations (F key) for stones and trees
// respectively. "death", "fishing", "hit", "pierce", and "watering" are
// new sheets added this round but not wired to any key/action yet — just
// available (loaded, with frame timing defined) for a future feature to
// use, same way "collect" started as an unwired demo hook before the
// inventory/placement system gave it a real purpose.
// The carry* ones are used instead of idle/walk/run while player.mode === "carrying".
const FRAME_COUNTS = {
  idle: 4, walk: 6, run: 6,
  collect: 8,
  crush: 8, slice: 8,
  death: 8, fishing: 8, hit: 4, pierce: 8, watering: 8,
  carryIdle: 4, carryWalk: 6, carryRun: 6
};
const ANIM_FPS = {
  idle: 4, walk: 8, run: 12,
  collect: 10,
  crush: 10, slice: 10,
  death: 6, fishing: 6, hit: 10, pierce: 10, watering: 8,
  carryIdle: 4, carryWalk: 8, carryRun: 12
};

const ZOOM_MIN = 4;
const ZOOM_MAX = 6;
const ZOOM_STEP = 0.15;

// --- Player stats (health/stamina/food/exp HUD, js/hud.js) ---
const STAMINA_DRAIN_PER_SEC = 20; // full 100 stamina lasts 5 real seconds of running
const STAMINA_REGEN_PER_SEC = 12; // slower than drain, so sprinting everywhere isn't free — recovers in a little over 8 seconds from empty
// Once stamina fully empties out while sprinting, it has to regenerate
// back up to this fraction of max before Shift is allowed to trigger
// running again — see the staminaExhausted latch in updatePlayer()
// (js/player.js). Without this, checking plain `stamina > 0` flickered
// run/walk rapidly right at the boundary (drains to exactly 0 one
// frame, regen ticks it a hair above 0 the next, which re-armed
// running immediately, draining it right back to 0 again).
const STAMINA_RUN_RECOVER_PCT = 0.3;
const FOOD_DRAIN_PER_GAME_HOUR = 100 / 24; // a full 100 food lasts exactly one in-game day with nothing eaten — no way to refill it yet, see js/hud.js

// --- Inventory / hotbar / placement ---
const INVENTORY_ROWS = 10;     // bumped from 8 as items grew past 72 — see #inventory-grid's scroll in style.css, which is what actually keeps the panel itself from growing endlessly
const INVENTORY_COLS = 9;      // 10x9 = 90 slots total
const HOTBAR_SIZE = 7;         // hotbar = the first 7 slots of inventory row 0
const PLACEMENT_RANGE = 1;     // tiles around the player where items can be placed (Chebyshev distance)
const HARVEST_RANGE = 1;       // tiles around the player where F can hit a resource (stone/tree) — see js/resources.js

// =====================================================================
//  WEATHER FX — rain, drifting clouds (+ ground shadows), low fog, and
//  sun/god-rays (see js/weatherfx.js). Ported over from another build of
//  this project and re-wired to run off THIS project's own day/night
//  clock (js/daynight.js) instead of bringing in a second clock system.
// =====================================================================

// --- Rain --------------------------------------------------------------
// World-space, same convention as the cloud/fog particles below: each
// drop has a fixed (wx, wy) on the map, so walking around gives real
// parallax instead of the rain looking like it's pinned to the screen.
const RAIN_DROP_COUNT = 50;
const RAIN_FRAME_W = 8, RAIN_FRAME_H = 8, RAIN_FRAME_COUNT = 3; // assets/particles/Rain.png
const SPLASH_FRAME_W = 8, SPLASH_FRAME_H = 8, SPLASH_FRAME_COUNT = 3; // assets/particles/RainOnFloor.png
const RAIN_WORLD_SIZE = 7;
const SPLASH_WORLD_SIZE = 3;
const SPLASH_LIFETIME = 0.35; // seconds a ground-splash animation plays for
const RAIN_FALL_SPEED_MIN = 160, RAIN_FALL_SPEED_MAX = 70; // world px/sec, straight down
const WEATHER_SPAWN_MARGIN = 50; // world px outside the visible camera area used for pop-in/out

// --- Snow ------------------------------------------------------------
// Same world-space convention as rain above, but slower/gentler and with
// a side-to-side drift instead of falling straight down (see
// spawnSnowFlake()/updateSnow(), js/weatherfx.js). Only drawn while
// js/calendar.js's getCurrentWeather() reports "Snow".
const SNOW_FLAKE_COUNT = 90;
const SNOW_FRAME_W = 8, SNOW_FRAME_H = 8, SNOW_FRAME_COUNT = 7; // assets/particles/Snow.png
const SNOW_WORLD_SIZE = 6;
const SNOW_FALL_SPEED_MIN = 16, SNOW_FALL_SPEED_MAX = 38; // world px/sec, straight down — much gentler than rain
const SNOW_DRIFT_AMPLITUDE_MIN = 6, SNOW_DRIFT_AMPLITUDE_MAX = 18; // world px of side-to-side sway
const SNOW_DRIFT_SPEED_MIN = 0.5, SNOW_DRIFT_SPEED_MAX = 1.4; // sway cycles/sec-ish

// --- Clouds --------------------------------------------------------------
// Drift right across the map and wrap around; each casts a soft shadow on
// the ground beneath it (see drawCloudShadows(), js/weatherfx.js).
const CLOUD_COUNT = 115;
const CLOUD_SRC_W = 80; // shared width across all 3 cloud sprite variants
const CLOUD_VARIANT_HEIGHTS = [36, 70, 70]; // assets/particles/Clouds.png, Clouds2.png, Clouds3.png
const CLOUD_SPEED_MIN = 4, CLOUD_SPEED_MAX = 10; // world px/sec drift
const CLOUD_SCALE_MIN = 1.6, CLOUD_SCALE_MAX = 2.8;
const CLOUD_OPACITY_MIN = 0.1, CLOUD_OPACITY_MAX = 0.85;
const CLOUD_SHADOW_OPACITY = 1.3; // darkness of the ground patch beneath a cloud
const CLOUD_SHADOW_BLUR_PX = 22; // in SCREEN px
const CLOUD_SHADOW_BUFFER_SCALE = 4;
const CLOUD_HEIGHT = 70; // world px "above the ground" — how far a cloud's shadow offsets from the cloud
const CLOUD_SHADOW_NIGHT = 0.35; // cloud shadow strength at night relative to day
const SHADOW_COLOR = [26, 22, 44]; // cool dark violet used for cloud shadows (not the character's own shadow)

// --- Fog -----------------------------------------------------------------
// Low, ground-hugging patches drifting slower than the clouds; each one
// independently rolls whether it renders in front of or behind the player.
const FOG_COUNT = 22;
const FOG_SRC_W = 150, FOG_SRC_H = 80; // assets/particles/fog.png, fog2.png, fog3.png — all the same size
const FOG_SPEED_MIN = 3, FOG_SPEED_MAX = 9;
const FOG_SCALE_MIN = 1.4, FOG_SCALE_MAX = 2.4;
const FOG_OPACITY_MIN = 0.12, FOG_OPACITY_MAX = 0.4;

// --- Sun direction (drives cloud-shadow placement + god-ray angle) --------
// Reuses this project's own SUNRISE_HOUR/SUNSET_HOUR above; only the
// direction/elevation numbers are new. Same convention as the shadow
// system: 0deg = right, 90deg = straight down, 180deg = left.
const SUN_DIR_MORNING_DEG = 150;
const SUN_DIR_EVENING_DEG = 38;
const SUN_MAX_ELEVATION_DEG = 62;
const MOON_DIR_DEG = 120;
const SHADOW_LENGTH_SCALE = 0.6;
const SHADOW_LENGTH_MIN = 0.42, SHADOW_LENGTH_MAX = 2.1;

// --- Sun rays / god rays (world-space, see js/weatherfx.js) ---------------
const SUNRAYS_ENABLED = true;
const SUNRAY_SEED = 9001;
const SUNRAY_ANGLE_JITTER_DEG = 3;
const SUNRAY_INTENSITY = 2.0;
const SUNRAY_LANE_GAP_MIN = 26, SUNRAY_LANE_GAP_MAX = 80;
const SUNRAY_LENGTH_MIN = 420, SUNRAY_LENGTH_MAX = 900;
const SUNRAY_SEGMENT_GAP_MIN = -200, SUNRAY_SEGMENT_GAP_MAX = 160;
const SUNRAY_HEAD_FADE = 0.18;
const SUNRAY_TAIL_FADE = 0.6;
const SUNRAY_HEAD_WIDTH = 0.5;
const SUNRAY_KINDS = {
  streak: { chance: 0.1, widthMin: 6, widthMax: 11, alphaMin: 0.16, alphaMax: 0.28 },
  beam: { chance: 0.5, widthMin: 30, widthMax: 70, alphaMin: 0.22, alphaMax: 0.4 },
  haze: { chance: 0.4, widthMin: 110, widthMax: 230, alphaMin: 0.14, alphaMax: 0.26 },
};
const SUNRAY_FADE_MIN = 0.3;
const SUNRAY_FADE_PERIOD_MIN = 4, SUNRAY_FADE_PERIOD_MAX = 13;
const SUNRAY_CLOUD_OCCLUSION = true;
const SUNRAY_SHAFT_LENGTH = 190;
const SUNRAY_SHAFT_SAMPLES = 14;
const SUNRAY_OCCLUSION_CONTRAST = 2;
const SUNRAY_CLOUD_DENSITY = 0.6;
const SUNRAY_AIR_GLOW = 0.05;
const SUNRAY_BLUR_PX = 9;
const SUNRAY_BUFFER_SCALE = 4;

// =====================================================================
//  CALENDAR — months/seasons/weather (see js/calendar.js). Built on top
//  of js/daynight.js's existing getGameDay() (a plain incrementing day
//  counter, already persisted across refreshes); this just turns that
//  single number into a month/day-of-month/year/season, and re-rolls a
//  weather state once per in-game day, weighted by the current season.
// =====================================================================

// A "month" is this many in-game days; 12 of them make one in-game year.
// At the default 15-real-minutes-per-day clock (REAL_SECONDS_PER_DAY_CYCLE
// above) that's 7.5 real hours per month, ~3.75 real days per year.
const CALENDAR_DAYS_PER_MONTH = 30;

const CALENDAR_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const CALENDAR_MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
// Meteorological (Northern-hemisphere) grouping: Dec/Jan/Feb = Winter,
// Mar/Apr/May = Spring, Jun/Jul/Aug = Summer, Sep/Oct/Nov = Fall.
const CALENDAR_MONTH_SEASON = [
  "Winter", "Winter", "Spring", "Spring", "Spring", "Summer",
  "Summer", "Summer", "Fall", "Fall", "Fall", "Winter",
];
const CALENDAR_SEASON_ICONS = { Spring: "🌸", Summer: "☀️", Fall: "🍂", Winter: "❄️" };

// Weather states actually rendered by js/weatherfx.js (Rainy -> rain,
// Snow -> snow, Sunny -> neither, just brighter sun rays/thinner clouds).
const WEATHER_STATES = [
  { name: "Sunny", icon: "☀️" },
  { name: "Rainy", icon: "🌧️" },
  { name: "Snow", icon: "❄️" },
];
// Each season's odds of rolling into each state (must sum to ~1 per row).
const SEASON_WEATHER_WEIGHTS = {
  Spring: { Sunny: 0.45, Rainy: 0.50, Snow: 0.05 },
  Summer: { Sunny: 0.80, Rainy: 0.20, Snow: 0.00 },
  Fall: { Sunny: 0.45, Rainy: 0.45, Snow: 0.10 },
  Winter: { Sunny: 0.30, Rainy: 0.05, Snow: 0.65 },
};

// How the current weather nudges the ambient effects that already exist
// for time-of-day (js/weatherfx.js): sunny days get thinner clouds and
// stronger god-rays, rainy/snowy days get thicker cloud cover and duller
// (sun-blocked) rays.
const WEATHER_CLOUD_OPACITY_MULT = { Sunny: 0.55, Rainy: 1.3, Snow: 1.0 };
const WEATHER_SUNRAY_MULT = { Sunny: 1.2, Rainy: 0.15, Snow: 0.5 };
