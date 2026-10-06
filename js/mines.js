"use strict";

/* =================================================================
   THE MINES — ten cave levels under the wild tunnel, with mobs.

   Per request ("mag add ng iba pang cave layer sa loob ng tunnel ...
   mahaba ... kahit 10 ... lagyan mo ng mobs ... professional na pixel
   art ... animation na pang atk ... health bar sa babang paa nila maliit
   lang yung text ... dmg nasa taas ng mobs kapag na hit ... may drop ...
   mag animate parang item sa pag cut ng puno pero di automatic na na
   vaccum, pupulutin pa, i click lang ... tyaka mag animate na vaccum"):

   LEVELS  js/mineLevels.data.js (tools/build_mine_levels.py): mine1_room
           .. mine10_room, long winding caves that grow each level. The
           tunnel's deep chamber has a new opening (C) down into mine 1;
           every level has an UP opening near its start and a DOWN one in
           its far chamber (mine 10's far chamber holds the boss). Walk up
           into an opening to use it (js/worlds.js checkCaveLinks()); each
           level's doormat still takes you straight outside.
   MOBS    assets/mobs/<type>/{idle,move,attack,death}.png — original art
           (tools/mobs/). Slime, Bat, Shroomling, Crystal Beetle, Rock
           Golem, and the Crystal Golem boss. Deeper = more, tougher mobs.
           They wander, notice you inside `aggro` px, chase, and attack
           with their own attack animation; the hit lands on its hitFrame
           if you're still in reach.
   COMBAT  F inside a mine swings: Pierce with the Cave Sword (12 dmg),
           a bare-handed Hit otherwise (5). The hit resolves half-way
           through the swing against every mob in front of you. Damage
           numbers pop over the mob (yellow = critical); your own damage
           pops red over you. A tiny health bar with small text sits under
           every mob's feet. At 0 health you black out and wake up outside
           the tunnel with half your health.
   DROPS   A killed mob tosses its drops like a felled tree's wood (arc,
           two bounces) — but they then WAIT on the floor. Click one and
           only then does it fly into you (the vacuum) and go into the
           inventory (gold straight into your purse).
   Not saved: mobs and drops are rolled fresh when you come back.
================================================================= */

const MINE_FEET_OFF = (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE; // player.y -> feet y

// art: frame size (square) and the art row the feet stand on; scale = world px per art px
const MINE_TYPES = {
  slime:     { name: "Slime",          size: 32, foot: 30, scale: 1,    hp: 55,  dmg: 4,  speed: 24, aggro: 90,  reach: 15, cd: 1.4, hitFrame: 3, r: 9,
               fps: { idle: 5, move: 9, attack: 10, death: 9 },
               drops: [["slimeGel", 1, 2, 0.9], ["goldCoin", 1, 3, 0.6]] },
  bat:       { name: "Bat",            size: 32, foot: 26, scale: 1,    hp: 35,  dmg: 3,  speed: 48, aggro: 120, reach: 16, cd: 1.1, hitFrame: 3, r: 8, fly: true,
               fps: { idle: 10, move: 14, attack: 12, death: 9 },
               drops: [["batWing", 1, 2, 0.85], ["goldCoin", 1, 2, 0.5]] },
  shroom:    { name: "Shroomling",     size: 32, foot: 30, scale: 1,    hp: 80,  dmg: 6,  speed: 26, aggro: 95,  reach: 17, cd: 1.6, hitFrame: 3, r: 9,
               fps: { idle: 5, move: 9, attack: 10, death: 8 },
               drops: [["glowCap", 1, 2, 0.9], ["goldCoin", 2, 4, 0.6]] },
  beetle:    { name: "Crystal Beetle", size: 32, foot: 30, scale: 1,    hp: 120,  dmg: 8,  speed: 34, aggro: 110, reach: 18, cd: 1.5, hitFrame: 3, r: 10,
               fps: { idle: 5, move: 11, attack: 11, death: 8 },
               drops: [["crystalShard", 1, 2, 0.85], ["goldCoin", 2, 5, 0.7]] },
  golem:     { name: "Rock Golem",     size: 48, foot: 46, scale: 1,    hp: 280, dmg: 13, speed: 18, aggro: 120, reach: 24, cd: 2.0, hitFrame: 3, r: 14,
               fps: { idle: 4, move: 7, attack: 8, death: 7 },
               drops: [["golemCore", 1, 1, 0.8], ["stoneChunk", 2, 4, 0.9], ["goldCoin", 5, 10, 1]] },
  // the far worlds' own mobs (tools/mobs/newmobs.py)
  wolf:      { name: "Dire Wolf",      size: 32, foot: 31, scale: 1,    hp: 70,  dmg: 7,  speed: 54, aggro: 135, reach: 18, cd: 1.2, hitFrame: 3, r: 11,
               fps: { idle: 5, move: 12, attack: 11, death: 8 },
               drops: [["batWing", 1, 2, 0.6], ["goldCoin", 3, 6, 0.8]] },
  wisp:      { name: "Wisp",           size: 32, foot: 27, scale: 1,    hp: 50,  dmg: 8,  speed: 42, aggro: 140, reach: 18, cd: 1.3, hitFrame: 3, r: 9, fly: true, magic: true,
               fps: { idle: 6, move: 9, attack: 10, death: 8 },
               drops: [["glowCap", 1, 2, 0.7], ["crystalShard", 1, 1, 0.4], ["goldCoin", 3, 6, 0.8]] },
  scorpion:  { name: "Sand Scorpion",  size: 32, foot: 30, scale: 1,    hp: 90,  dmg: 10, speed: 32, aggro: 115, reach: 19, cd: 1.5, hitFrame: 3, r: 11,
               fps: { idle: 5, move: 10, attack: 10, death: 8 },
               drops: [["crystalShard", 1, 2, 0.7], ["goldCoin", 4, 8, 0.85]] },
  imp:       { name: "Ember Imp",      size: 32, foot: 31, scale: 1,    hp: 80,  dmg: 12, speed: 40, aggro: 140, reach: 18, cd: 1.3, hitFrame: 3, r: 9, magic: true,
               fps: { idle: 6, move: 10, attack: 11, death: 8 },
               drops: [["golemCore", 1, 1, 0.4], ["crystalShard", 1, 2, 0.6], ["goldCoin", 5, 10, 0.9]] },
  // people: a caster that hurls magic from range, and an armoured spearman
  wizard:    { name: "Dark Wizard",    size: 32, foot: 31, scale: 1,    hp: 60,  dmg: 11, speed: 28, aggro: 160, reach: 80, cd: 2.0, hitFrame: 3, r: 9, magic: true, ranged: true,
               fps: { idle: 5, move: 8, attack: 9, death: 8 },
               drops: [["glowCap", 1, 2, 0.6], ["crystalShard", 1, 1, 0.4], ["goldCoin", 5, 9, 0.9]] },
  soldier:   { name: "Iron Soldier",   size: 32, foot: 31, scale: 1,    hp: 110, dmg: 10, speed: 30, aggro: 130, reach: 20, cd: 1.5, hitFrame: 3, r: 10,
               fps: { idle: 5, move: 9, attack: 10, death: 8 },
               drops: [["golemCore", 1, 1, 0.3], ["goldCoin", 5, 10, 0.9]] },
  // world bosses (one per map, Lv fixed) — dark violet-pink versions; the only source of the Demon set
  bossSlime:    { name: "Slime King",   size: 32, foot: 30, scale: 2.0, hp: 1500,  dmg: 18,  speed: 22, aggro: 150, reach: 26, cd: 1.6, hitFrame: 3, r: 18, boss: true, bossLevel: 10, respawn: 600,
                  fps: { idle: 5, move: 8, attack: 9, death: 8 }, drops: [["demonRing", 1, 1, 0.08], ["slimeGel", 4, 8, 1], ["goldCoin", 60, 90, 1]] },
  bossGolem:    { name: "Shadow Golem", size: 48, foot: 46, scale: 1.6, hp: 3000,  dmg: 30,  speed: 20, aggro: 160, reach: 34, cd: 1.9, hitFrame: 3, r: 22, boss: true, bossLevel: 18, respawn: 600, magic: true,
                  fps: { idle: 4, move: 7, attack: 8, death: 6 }, drops: [["demonBoots", 1, 1, 0.07], ["demonRing", 1, 1, 0.05], ["golemCore", 3, 5, 1], ["goldCoin", 120, 180, 1]] },
  bossWolf:     { name: "Shadow Fang",  size: 32, foot: 31, scale: 1.9, hp: 6000,  dmg: 50,  speed: 50, aggro: 170, reach: 28, cd: 1.3, hitFrame: 3, r: 20, boss: true, bossLevel: 28, respawn: 720,
                  fps: { idle: 5, move: 12, attack: 11, death: 8 }, drops: [["demonGauntlet", 1, 1, 0.07], ["demonBoots", 1, 1, 0.05], ["goldCoin", 250, 350, 1]] },
  bossWisp:     { name: "Wraith",       size: 32, foot: 27, scale: 2.0, hp: 12000, dmg: 80,  speed: 40, aggro: 180, reach: 28, cd: 1.4, hitFrame: 3, r: 18, boss: true, bossLevel: 45, respawn: 720, fly: true, magic: true,
                  fps: { idle: 6, move: 9, attack: 10, death: 8 }, drops: [["demonBow", 1, 1, 0.06], ["demonGauntlet", 1, 1, 0.05], ["goldCoin", 500, 700, 1]] },
  bossScorpion: { name: "Venom Queen",  size: 32, foot: 30, scale: 2.0, hp: 25000, dmg: 120, speed: 30, aggro: 170, reach: 30, cd: 1.6, hitFrame: 3, r: 20, boss: true, bossLevel: 65, respawn: 900,
                  fps: { idle: 5, move: 10, attack: 10, death: 8 }, drops: [["demonHelmet", 1, 1, 0.06], ["demonShield", 1, 1, 0.06], ["goldCoin", 900, 1300, 1]] },
  bossImp:      { name: "Demon Lord",   size: 32, foot: 31, scale: 2.2, hp: 50000, dmg: 180, speed: 38, aggro: 190, reach: 30, cd: 1.4, hitFrame: 3, r: 20, boss: true, bossLevel: 85, respawn: 1200, magic: true,
                  fps: { idle: 6, move: 10, attack: 11, death: 8 }, drops: [["demonArmor", 1, 1, 0.05], ["stormSword", 1, 1, 0.04], ["goldCoin", 2000, 3000, 1]] },
  golemBoss: { name: "Crystal Golem",  size: 48, foot: 46, scale: 1.4,  hp: 1100, dmg: 20, speed: 22, aggro: 170, reach: 32, cd: 1.8, hitFrame: 3, r: 20, boss: true,
               fps: { idle: 4, move: 7, attack: 8, death: 6 },
               drops: [["golemCore", 3, 5, 1], ["crystalShard", 3, 6, 1], ["goldCoin", 25, 45, 1]] },
};
// Per request ("lagyan mo pa ng iba pang map na volcano ... ocean ... may mga bagong mobs din"): the
// Volcano's and the Azure Coast's mobs (tools/far_worlds_art.py — recoloured from the older sheets).
Object.assign(MINE_TYPES, {
  lavaSlime: Object.assign({}, MINE_TYPES.slime, { name: "Lava Slime", hp: 70, dmg: 6, magic: true, drops: [["golemCore", 1, 1, 0.2], ["oreLuck", 1, 1, 0.04], ["goldCoin", 30, 60, 0.7]] }),
  magmaGolem: Object.assign({}, MINE_TYPES.golem, { name: "Magma Golem", hp: 320, dmg: 15, drops: [["golemCore", 1, 2, 0.5], ["goldIngot", 1, 1, 0.25], ["oreFortune", 1, 1, 0.02], ["goldCoin", 50, 90, 0.8]] }),
  fireBat: Object.assign({}, MINE_TYPES.bat, { name: "Fire Bat", hp: 45, dmg: 5, magic: true, drops: [["batWing", 1, 2, 0.5], ["goldCoin", 25, 50, 0.6]] }),
  bossTitan: Object.assign({}, MINE_TYPES.bossGolem, { name: "Volcano Titan", hp: 80000, dmg: 220, bossLevel: 95, respawn: 1500, magic: true,
    drops: [["oreDivine", 1, 1, 0.2], ["oreFortune", 1, 3, 0.8], ["goldIngot", 3, 6, 1], ["goldCoin", 3000, 4500, 1]] }),
  seaCrab: Object.assign({}, MINE_TYPES.scorpion, { name: "Sea Crab", hp: 110, dmg: 11, drops: [["crystalShard", 1, 2, 0.3], ["oreLuck", 1, 1, 0.04], ["goldCoin", 40, 70, 0.7]] }),
  jellySlime: Object.assign({}, MINE_TYPES.slime, { name: "Jelly Slime", hp: 65, dmg: 5, magic: true, drops: [["slimeGel", 1, 3, 0.6], ["goldCoin", 30, 60, 0.7]] }),
  seaWisp: Object.assign({}, MINE_TYPES.wisp, { name: "Sea Spirit", hp: 60, dmg: 9, drops: [["glowCap", 1, 2, 0.4], ["oreFortune", 1, 1, 0.02], ["goldCoin", 40, 80, 0.7]] }),
  // from the user's sprite sheet (tools/mobs/extract_sheet.py): the Ember Dragon (the Volcano's boss),
  // the Siren (the Azure Coast) and the Snake (Wolfpine Woods / Spirit Glade)
  bossDragon: { name: "Ember Dragon", size: 80, foot: 79, scale: 1.6, hp: 90000, dmg: 230, speed: 30, aggro: 200, reach: 44, cd: 1.6, hitFrame: 2, r: 28, boss: true, bossLevel: 96, respawn: 1500, magic: true,
    fps: { idle: 5, move: 7, attack: 6, death: 5 }, drops: [["oreDivine", 1, 2, 0.25], ["oreFortune", 1, 3, 0.8], ["goldIngot", 3, 6, 1], ["goldCoin", 3500, 5000, 1]] },
  siren: { name: "Siren", size: 64, foot: 63, scale: 1, hp: 95, dmg: 12, speed: 30, aggro: 170, reach: 90, cd: 2.0, hitFrame: 2, r: 11, magic: true, ranged: true,
    fps: { idle: 5, move: 7, attack: 6, death: 6 }, drops: [["glowCap", 1, 2, 0.4], ["crystalShard", 1, 2, 0.3], ["oreFortune", 1, 1, 0.03], ["goldCoin", 50, 90, 0.8]] },
  snake: { name: "Snake", size: 64, foot: 63, scale: 0.9, hp: 75, dmg: 9, speed: 30, aggro: 120, reach: 18, cd: 1.4, hitFrame: 1, r: 10,
    fps: { idle: 5, move: 7, attack: 7, death: 6 }, drops: [["slimeGel", 1, 1, 0.3], ["glowCap", 1, 1, 0.2], ["goldCoin", 8, 18, 0.6]] },
  bossLeviathan: Object.assign({}, MINE_TYPES.bossScorpion, { name: "Leviathan", hp: 120000, dmg: 260, bossLevel: 100, respawn: 1800, magic: true,
    drops: [["oreDivine", 1, 2, 0.3], ["oreFortune", 2, 4, 1], ["crystalShard", 5, 10, 1], ["goldCoin", 4000, 6000, 1]] }),
});
// what lives on each level: [type, count]
const MINE_SPAWNS = {
  1: [["slime", 7], ["bat", 2]],
  2: [["slime", 6], ["bat", 4]],
  3: [["slime", 4], ["bat", 3], ["shroom", 4]],
  4: [["bat", 4], ["shroom", 5], ["beetle", 2]],
  5: [["shroom", 5], ["beetle", 5], ["bat", 2]],
  6: [["beetle", 5], ["shroom", 4], ["bat", 3], ["golem", 1]],
  7: [["beetle", 6], ["golem", 2], ["bat", 3]],
  8: [["golem", 3], ["beetle", 5], ["bat", 4]],
  9: [["golem", 4], ["beetle", 5], ["shroom", 4]],
  10: [["golem", 3], ["beetle", 4], ["bat", 4], ["golemBoss", 1]],
};
const MINE_ANIMS = ["idle", "move", "attack", "death"];
const MINE_RESPAWN_SEC = 120;      // a killed mob comes back this long after, once you're away from its spot
const MINE_DROP_LIFE_SEC = 300;    // drops left lying around vanish after this
const MINE_PICKUP_RANGE = 2.5 * TILE; // world px — per request you have to be close to pick a drop up (click)
const MINE_AUTO_PICKUP = 2 * TILE;    // world px — a resting drop this close (feet to drop) is picked up by itself
const PLAYER_HURT_INVULN = 0.6;    // seconds of safety after a hit

for (const id of Object.keys(MINE_TYPES)) {
  for (const a of MINE_ANIMS) {
    const key = "mobsheet_" + id + "_" + a;
    assets[key] = new Image();
    assets[key].src = "assets/mobs/" + id + "/" + a + ".png";
  }
}

// ---- the passages: tunnel C <-> mine 1, and each level to the next ----
if (typeof CAVE_LINKS !== "undefined") {
  CAVE_LINKS.tunnel_room.C = { type: "tunnelEntrance", room: "mine1_room", link: "UP" };
  for (let k = 1; k <= 10; k++) {
    const links = {};
    links.UP = k === 1 ? { type: "tunnelEntrance", room: "tunnel_room", link: "C" } : { type: "tunnelEntrance", room: "mine" + (k - 1) + "_room", link: "DOWN" };
    if (k < 10) links.DOWN = { type: "tunnelEntrance", room: "mine" + (k + 1) + "_room", link: "UP" };
    CAVE_LINKS["mine" + k + "_room"] = links;
  }
}

/* ---------------- per-room state ---------------- */
const mineStates = {}; // roomId -> { mobs, drops, numbers }
const mineNumbers = []; // floating damage / pickup numbers (room coords)
const mineArrows = []; // bow shots in flight
const mobShots = [];   // a wizard's bolts flying at you
let mineHurtFlash = 0;
let mineLastRoom = null;

function mineLayoutFor(room) {
  const L = room && TOWN_ART.caveLayouts && TOWN_ART.caveLayouts[room.blueprintId];
  return L && L.depth ? L : null;
}
/* A ZONE is where mobs live: a mine level (indoors) or an east world
   (outdoors). Everything below works on the current zone:
     { key, kind: "room" | "world", room?, layout?, level: [lo, hi], spawns } */
const MOB_WORLDS = {
  east1: { name: "Highlands", level: [3, 6], spawns: [["slime", 7], ["bat", 6], ["shroom", 6], ["beetle", 2], ["bossSlime", 1]] },
  east2: { name: "Crystal Ridge", level: [7, 11], spawns: [["beetle", 7], ["golem", 4], ["bat", 6], ["shroom", 4], ["bossGolem", 1]] },
  // the far worlds (warp portals, js/gear.js) — climbing to level 80
  east3: { name: "Wolfpine Woods", level: [12, 22], spawns: [["wolf", 8], ["snake", 5], ["soldier", 4], ["beetle", 2], ["bat", 3], ["bossWolf", 1]] },
  east4: { name: "Spirit Glade", level: [23, 38], spawns: [["wisp", 7], ["wizard", 5], ["snake", 4], ["wolf", 3], ["shroom", 2], ["bossWisp", 1]] },
  east5: { name: "Sunscar Barrens", level: [39, 58], spawns: [["scorpion", 8], ["soldier", 5], ["wizard", 4], ["golem", 3], ["bossScorpion", 1]] },
  east6: { name: "Ember Peaks", level: [59, 80], spawns: [["imp", 9], ["wizard", 5], ["soldier", 4], ["golem", 3], ["bossImp", 1]] },
  east7: { name: "Volcano", level: [80, 92], spawns: [["lavaSlime", 8], ["magmaGolem", 5], ["fireBat", 6], ["imp", 3], ["bossDragon", 1]] },
  east8: { name: "Azure Coast", level: [88, 100], spawns: [["seaCrab", 7], ["jellySlime", 5], ["siren", 6], ["seaWisp", 3], ["bossLeviathan", 1]] },
};
let mineZoneCache = null;
function currentMineRoom() {
  if (player.scene === "inside") {
    const room = INTERIOR_ROOMS[player.activeRoomId];
    const L = mineLayoutFor(room);
    if (!L) return null;
    const key = player.activeRoomId;
    if (mineZoneCache && mineZoneCache.key === key) return mineZoneCache;
    return mineZoneCache = { key, kind: "room", room, layout: L, level: [L.depth, L.depth + 1], spawns: MINE_SPAWNS[L.depth] || [], name: "Mine " + L.depth };
  }
  if (player.scene === "outside" && typeof currentWorld !== "undefined" && MOB_WORLDS[currentWorld]) {
    const key = "world:" + currentWorld;
    if (mineZoneCache && mineZoneCache.key === key) return mineZoneCache;
    const W = MOB_WORLDS[currentWorld];
    return mineZoneCache = { key, kind: "world", world: currentWorld, def: WORLD_DEFS[currentWorld], level: W.level, spawns: W.spawns, name: W.name };
  }
  return null;
}
function mobZoneKey() { const z = currentMineRoom(); return z ? z.key : null; }
const mineRand = (a, b) => a + Math.random() * (b - a);
const mineRandInt = (a, b) => Math.floor(mineRand(a, b + 1));

function mineFeetBlocked(zone, fx, fy) {
  if (zone.kind === "room") return isInteriorBodyBlockedAt(zone.room, fx, fy - MINE_FEET_OFF);
  if (fx < 8 || fy < 8 || fx > worldW() - 8 || fy > worldH() - 8) return true;
  return isBodyBlockedAt(fx, fy - MINE_FEET_OFF);
}

const MOB_EXP = { bossDragon: 32000, siren: 36, snake: 15, lavaSlime: 30, magmaGolem: 40, fireBat: 28, bossTitan: 30000, seaCrab: 34, jellySlime: 30, seaWisp: 32, bossLeviathan: 40000, wizard: 20, soldier: 18, bossSlime: 300, bossGolem: 700, bossWolf: 1500, bossWisp: 3500, bossScorpion: 8000, bossImp: 18000, slime: 6, bat: 5, shroom: 9, beetle: 14, golem: 30, golemBoss: 400, wolf: 16, wisp: 18, scorpion: 22, imp: 26 };
function makeMob(type, level, fx, fy) {
  const def = MINE_TYPES[type];
  // tougher at a higher level; the boss has its own fixed numbers
  const lvl = def.boss ? (def.bossLevel || 15) : Math.max(1, Math.round(level));
  const hpMult = def.boss ? 1 : 1 + 0.15 * (lvl - 1), dmgMult = def.boss ? 1 : 1 + 0.1 * (lvl - 1);
  const maxHp = Math.round(def.hp * hpMult);
  return {
    type, def, level: lvl, exp: Math.round((MOB_EXP[type] || 5) * (def.boss ? 1 + lvl / 20 : 1 + 0.5 * (lvl - 1))),
    x: fx, y: fy, homeX: fx, homeY: fy, hp: maxHp, maxHp, dmg: Math.round(def.dmg * dmgMult),
    armor: Math.round(lvl * 0.6), // its DEF: knocked off each hit you land (js/gear.js stats)
    state: "idle", anim: "idle", frame: Math.floor(Math.random() * 4), ft: Math.random() * 0.2,
    facing: Math.random() < 0.5 ? 1 : -1, wanderT: mineRand(0.5, 3), goal: null, atkCd: mineRand(0.5, 1.5),
    flash: 0, kx: 0, ky: 0, didHit: false, deadT: 0, gone: false, spawnSpot: { x: fx, y: fy },
  };
}

function zoneLevel(zone) { return zone.level[0] + Math.floor(Math.random() * (zone.level[1] - zone.level[0] + 1)); }
function spawnMobsFor(zone, st) {
  const used = [];
  let tiles, avoid, farSpot = null;
  if (zone.kind === "room") {
    const L = zone.layout;
    tiles = (L.tiles || []).map((k) => k.split(",").map(Number));
    avoid = [[L.links.UP.col, L.links.UP.row], [L.door[0], L.door[1]]];
    if (L.far) farSpot = [L.far.col, L.far.row + 1];
  } else {
    const D = zone.def;
    tiles = [];
    for (let r = 6; r < D.rows - 6; r++) for (let c = 6; c < D.cols - 6; c++) {
      const k = c + "," + r;
      const g = groundOverlayLayer.get(k) || groundLayer.get(k) || "";
      if (g.startsWith("terrainMountain")) continue; // not up on the cliffs
      tiles.push([c, r]);
    }
    avoid = [D.spawnWest, D.spawnEast];
  }
  const ok = (c, r) => avoid.every(([ac, ar]) => Math.hypot(c - ac, r - ar) > 11);
  for (const [type, count] of zone.spawns) {
    for (let n = 0; n < count; n++) {
      let spot = null;
      if (MINE_TYPES[type].boss && farSpot) spot = farSpot;
      for (let tries = 0; !spot && tries < 300; tries++) {
        const [c, r] = tiles[Math.floor(Math.random() * tiles.length)];
        if (!ok(c, r)) continue;
        if (used.some(([uc, ur]) => Math.hypot(uc - c, ur - r) < 4)) continue;
        if (mineFeetBlocked(zone, (c + 0.5) * TILE, (r + 0.6) * TILE)) continue;
        spot = [c, r];
      }
      if (!spot) continue;
      used.push(spot);
      st.mobs.push(makeMob(type, zoneLevel(zone), (spot[0] + 0.5) * TILE, (spot[1] + 0.6) * TILE));
    }
  }
}

function mineStateFor(room) {
  const id = room.key;
  let st = mineStates[id];
  if (!st) {
    st = mineStates[id] = { mobs: [], drops: [] };
    spawnMobsFor(room, st);
  }
  return st;
}

/* ---------------- mobs ---------------- */
function mobFrameCount(m, anim) {
  const sh = assets["mobsheet_" + m.type + "_" + anim];
  return sh && sh.width && sh.height ? Math.max(1, Math.round(sh.width / sh.height)) : (anim === "idle" ? 4 : 6);
}
function setMobAnim(m, anim) {
  if (m.anim === anim) return;
  m.anim = anim; m.frame = 0; m.ft = 0;
}

function moveMob(room, m, dx, dy, dt) {
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return false;
  const sp = m.def.speed * dt;
  const nx = m.x + dx / len * sp, ny = m.y + dy / len * sp;
  let moved = false;
  if (!mineFeetBlocked(room, nx, m.y)) { m.x = nx; moved = true; }
  if (!mineFeetBlocked(room, m.x, ny)) { m.y = ny; moved = true; }
  if (Math.abs(dx) > 0.3) m.facing = dx > 0 ? 1 : -1;
  return moved;
}

function updateMob(room, st, m, dt) {
  const def = m.def;
  m.flash = Math.max(0, m.flash - dt);
  // knockback
  if (m.kx || m.ky) {
    const nx = m.x + m.kx * dt, ny = m.y + m.ky * dt;
    if (!mineFeetBlocked(room, nx, m.y)) m.x = nx;
    if (!mineFeetBlocked(room, m.x, ny)) m.y = ny;
    m.kx *= Math.pow(0.02, dt); m.ky *= Math.pow(0.02, dt);
    if (Math.abs(m.kx) + Math.abs(m.ky) < 2) { m.kx = 0; m.ky = 0; }
  }
  // animation clock
  const fps = def.fps[m.anim] || 8;
  m.ft += dt;
  const n = mobFrameCount(m, m.anim);
  while (m.ft >= 1 / fps) {
    m.ft -= 1 / fps;
    m.frame++;
    if (m.anim === "death") { if (m.frame >= n) { m.frame = n - 1; m.gone = true; } }
    else if (m.anim === "attack") {
      if (m.frame >= n) { m.frame = 0; m.state = "idle"; setMobAnim(m, "idle"); m.atkCd = def.cd; }
    } else m.frame %= n;
  }
  if (m.state === "dead") return;

  const pfx = player.x, pfy = player.y + MINE_FEET_OFF;
  const dist = Math.hypot(pfx - m.x, pfy - m.y);
  m.atkCd -= dt;

  if (m.state === "attack") {
    m.facing = pfx >= m.x ? 1 : -1;
    if (!m.didHit && m.frame >= def.hitFrame) {
      m.didHit = true;
      if (def.ranged) { if (dist <= def.reach + 16 && !playerBusyElsewhere()) mobShots.push({ x: m.x + m.facing * 6, y: m.y - 20, dmg: m.dmg, magic: !!def.magic, t: 0 }); }
      else if (dist <= def.reach + 10 && !playerBusyElsewhere()) damagePlayer(m.dmg, !!def.magic);
    }
    return;
  }
  // in reach -> attack
  if (dist <= def.reach && m.atkCd <= 0 && !playerBusyElsewhere()) {
    m.state = "attack"; m.didHit = false; setMobAnim(m, "attack");
    m.facing = pfx >= m.x ? 1 : -1;
    return;
  }
  // noticed you -> chase
  if (dist <= def.aggro && !playerBusyElsewhere()) {
    if (dist > def.reach * 0.8) {
      const moved = moveMob(room, m, pfx - m.x, pfy - m.y, dt);
      setMobAnim(m, moved ? "move" : "idle");
    } else { setMobAnim(m, "idle"); m.facing = pfx >= m.x ? 1 : -1; }
    return;
  }
  // wander near home
  m.wanderT -= dt;
  if (m.wanderT <= 0) {
    m.wanderT = mineRand(2, 5);
    m.goal = Math.random() < 0.6 ? { x: m.homeX + mineRand(-40, 40), y: m.homeY + mineRand(-28, 28) } : null;
  }
  if (m.goal) {
    const dx = m.goal.x - m.x, dy = m.goal.y - m.y;
    if (Math.hypot(dx, dy) < 3) { m.goal = null; setMobAnim(m, "idle"); }
    else {
      const sp = def.speed; def.speed = sp * 0.45;
      const moved = moveMob(room, m, dx, dy, dt);
      def.speed = sp;
      if (!moved) m.goal = null;
      setMobAnim(m, moved ? "move" : "idle");
    }
  } else setMobAnim(m, "idle");
}

// Mobs keep apart a little so they don't stack into one sprite.
function separateMobs(room, mobs) {
  for (let i = 0; i < mobs.length; i++) {
    const a = mobs[i]; if (a.state === "dead") continue;
    for (let j = i + 1; j < mobs.length; j++) {
      const b = mobs[j]; if (b.state === "dead") continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = (a.def.r + b.def.r) * 0.8;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2, ux = dx / d, uy = dy / d;
        if (!mineFeetBlocked(room, a.x - ux * push, a.y - uy * push)) { a.x -= ux * push; a.y -= uy * push; }
        if (!mineFeetBlocked(room, b.x + ux * push, b.y + uy * push)) { b.x += ux * push; b.y += uy * push; }
      }
    }
  }
}

function playerBusyElsewhere() {
  return typeof sceneFade !== "undefined" && sceneFade;
}

/* ---------------- the player getting hurt ---------------- */
function damagePlayer(n, magic) {
  const now = performance.now() / 1000;
  if (player.mineInvulnUntil && now < player.mineInvulnUntil) return;
  player.mineInvulnUntil = now + PLAYER_HURT_INVULN;
  if (typeof playerStats === "function") { const S = playerStats(); n = Math.max(1, Math.round(n * (1 - (magic ? S.mresPct : S.defPct)))); } // DEF / MAGIC RES (js/gear.js)
  player.health = Math.max(0, player.health - n);
  mineHurtFlash = 0.35;
  pushMineNumber(player.x, player.y - DRAW_SIZE * 0.28, "-" + n, "#ff5a5a");
  if (player.health <= 0) playerBlackout();
}
function playerBlackout() {
  player.health = Math.ceil(player.maxHealth * 0.5);
  player.action = null; player.mineSwing = null;
  if (typeof showToast === "function") showToast(player.scene === "inside" ? "You passed out... you were carried out of the cave" : "You passed out... you were carried back to town");
  if (player.scene === "inside") { if (typeof beginSceneFade === "function") beginSceneFade(() => exitInterior()); }
  else if (typeof beginSceneFade === "function") beginSceneFade(() => switchWorld("main", MAIN_EAST_PORTAL.spawn, "left")); // back to the town's east gate
}

/* ---------------- the player attacking ---------------- */
function playerMineDamage() {
  const w = player.equippedWeapon && itemDefs[player.equippedWeapon];
  if (w && w.weapon && (w.weapon.reqLevel || 1) > player.level) return 3; // locked: no better than bare hands
  return w && w.weapon && w.weapon.damage ? w.weapon.damage : 3; // bare hands
}
function startMineSwing() {
  const w = player.equippedWeapon && itemDefs[player.equippedWeapon];
  const anim = w && w.weapon && w.weapon.damage ? w.weapon.attackAnim : "hit";
  player.action = anim; player.frame = 0; player.frameTimer = 0;
  const S = typeof playerStats === "function" ? playerStats() : null;
  const isBow = !!(w && w.weapon && w.weapon.ranged);
  player.mineSwing = { hitDone: false, dmg: S ? S.atk : playerMineDamage(), crit: S ? S.crit : 0.12, speed: (S ? Math.max(1, S.spd) : 1) * (isBow ? 1.7 : 1), // a bow draws and looses quicker
    reach: w && w.weapon && w.weapon.ranged ? 44 : w && w.weapon && w.weapon.damage ? 24 : 16, ranged: !!(w && w.weapon && w.weapon.ranged) };
}
/* One target per swing — per request ("kung ano lang i click yun lang ma
   hit niya"): the mob you clicked (player.autoTarget) if it's in reach,
   otherwise the nearest one in front. Hit chance comes from ACC against the
   mob's level (js/gear.js playerStats().hit); a miss shows MISS. A bow's
   damage lands when its arrow arrives. */
function resolveMineSwing(room, st, swing) {
  const dirs = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
  const [dx, dy] = dirs[player.facing] || [0, 1];
  const fx = player.x, fy = player.y + MINE_FEET_OFF;
  const ranged = !!swing.ranged;
  const cx = fx + dx * 14, cy = fy - 4 + dy * 12;
  // a bow: anything within 3 tiles of you (BOW_RANGE, js/gear.js); melee: the swing in front
  const inReach = ranged
    ? (m) => m && m.state !== "dead" && st.mobs.includes(m) && Math.hypot(m.x - fx, m.y - fy) <= (typeof BOW_RANGE !== "undefined" ? BOW_RANGE : 48) + m.def.r * 0.5
    : (m) => m && m.state !== "dead" && st.mobs.includes(m) && Math.hypot(m.x - cx, m.y - (m.def.fly ? 10 : 4) - cy) <= swing.reach + m.def.r + (m === player.autoTarget ? 10 : 0);
  let target = inReach(player.autoTarget) ? player.autoTarget : null;
  if (!target) {
    let bd = 1e9;
    for (const m of st.mobs) { if (!inReach(m)) continue; const d = Math.hypot(m.x - fx, m.y - fy); if (d < bd) { bd = d; target = m; } }
  }
  if (!target) return false;
  const m = target, my = m.y - (m.def.fly ? 10 : 4);
  const hitChance = typeof playerHitChance === "function" ? playerHitChance(m) : 0.95;
  const missed = Math.random() > hitChance;
  const crit = !missed && Math.random() < (swing.crit || 0.12);
  const dmg = missed ? 0 : Math.max(1, Math.round(swing.dmg * mineRand(0.85, 1.15) * (crit ? 1.8 : 1) - (m.armor || 0) * 0.5));
  // Per request ("yung arrow nun is i center mo pagka tira kasi nasa taas ng bow nanggagaling"):
  // the arrow leaves from the middle of the bow as drawBowShot() (js/gear.js) draws it —
  // 7 sprite px out along the facing (5 vertically) and 4 below the sprite's centre.
  if (ranged) {
    const k = DRAW_SIZE / 64;
    mineArrows.push({ x0: player.x + dx * 7 * k, y0: player.y + 4 * k + dy * 5 * k, m, st, dmg, crit, missed, t: 0, fx, fy });
  }
  else landMineHit(st, m, dmg, crit, missed, fx, fy);
  return true;
}
function landMineHit(st, m, dmg, crit, missed, fx, fy) {
  if (m.state === "dead") return;
  if (missed) { pushMineNumber(m.x, mobTopY(m) - 2, "MISS", "#9aa6b8"); return; }
  m.hp -= dmg;
  m.flash = 0.14;
  const kd = Math.hypot(m.x - fx, m.y - fy) || 1;
  const kb = m.def.boss ? 30 : 90;
  m.kx = (m.x - fx) / kd * kb; m.ky = (m.y - fy) / kd * kb;
  pushMineNumber(m.x, mobTopY(m) - 2, String(dmg), crit ? "#ffd84a" : "#ffffff", crit);
  if (m.hp <= 0) killMob(st, m);
  else if (m.state !== "attack") { m.facing = fx >= m.x ? 1 : -1; m.atkCd = Math.min(m.atkCd, 0.4); }
}
// arrows fly to the mob they were shot at; the hit lands on arrival
function updateMineArrows(dt) {
  for (let i = mineArrows.length - 1; i >= 0; i--) {
    const a = mineArrows[i];
    a.t += dt * 8; // a fast arrow
    a.x1 = a.m.x; a.y1 = a.m.y - (a.m.def.fly ? 10 : 6);
    if (a.t >= 1) { landMineHit(a.st, a.m, a.dmg, a.crit, a.missed, a.fx, a.fy); mineArrows.splice(i, 1); }
  }
}
function killMob(st, m) {
  m.hp = 0; m.state = "dead"; setMobAnim(m, "death"); m.kx *= 0.3; m.ky *= 0.3;
  // above your level: up to +60% more; far below: down to a quarter
  const gap = m.level - (player.level || 1);
  gainExp(Math.max(1, Math.round(m.exp * Math.max(0.25, Math.min(1.6, 1 + gap * 0.08)))), m);
  m.diedAt = performance.now() / 1000;
  for (const [type, lo, hi, chance] of m.def.drops) {
    if (Math.random() > chance) continue;
    const amount = Math.round(mineRandInt(lo, hi) * (type === "goldCoin" ? 1 + (m.level - 1) / 5 : 1));
    // gold comes out as a few coins; items as one icon carrying the amount
    if (type === "goldCoin") {
      const pieces = Math.min(amount, 4), per = Math.floor(amount / pieces);
      for (let i = 0; i < pieces; i++) spawnMineDrop(st, type, i === pieces - 1 ? amount - per * (pieces - 1) : per, m.x, m.y);
    } else spawnMineDrop(st, type, amount, m.x, m.y);
  }
}

/* ---------------- floating numbers ---------------- */
function pushMineNumber(x, y, text, color, big) {
  mineNumbers.push({ x: x + mineRand(-3, 3), y, text, color, big: !!big, t: 0, life: big ? 1.0 : 0.8, room: mobZoneKey() });
}
const MOB_TOP = { bossDragon: 40, siren: 34, snake: 24, lavaSlime: 15, magmaGolem: 40, fireBat: 22, bossTitan: 40, seaCrab: 20, jellySlime: 15, seaWisp: 22, bossLeviathan: 20, wizard: 26, soldier: 22, bossSlime: 15, bossGolem: 40, bossWolf: 18, bossWisp: 22, bossScorpion: 20, bossImp: 24, slime: 15, bat: 22, shroom: 22, beetle: 22, golem: 40, golemBoss: 40, wolf: 18, wisp: 22, scorpion: 20, imp: 24 }; // art px from the feet up to the head
function mobTopY(m) {
  return m.y - (MOB_TOP[m.type] || 20) * m.def.scale;
}

/* ---------------- drops ---------------- */
function spawnMineDrop(st, type, amount, x, y) {
  const ang = Math.random() * Math.PI * 2, sp = mineRand(26, 52);
  st.drops.push({ type, amount, x, y, z: 6, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.6, vz: mineRand(90, 130),
    bounces: 0, phase: "throw", t: 0, born: performance.now() / 1000 });
}
function updateDrops(room, st, dt) {
  const now = performance.now() / 1000;
  for (let i = st.drops.length - 1; i >= 0; i--) {
    const d = st.drops[i];
    d.t += dt;
    if (d.phase === "throw") {
      d.vz -= 380 * dt; d.z += d.vz * dt;
      const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
      if (!mineFeetBlocked(room, nx, d.y)) d.x = nx; else d.vx = -d.vx * 0.4;
      if (!mineFeetBlocked(room, d.x, ny)) d.y = ny; else d.vy = -d.vy * 0.4;
      if (d.z <= 0) {
        d.z = 0; d.bounces++;
        if (d.bounces >= 2) { d.phase = "rest"; d.vx = d.vy = d.vz = 0; }
        else { d.vz = -d.vz * 0.45; d.vx *= 0.55; d.vy *= 0.55; }
      }
    } else if (d.phase === "rest") {
      if (now - d.born > MINE_DROP_LIFE_SEC) { st.drops.splice(i, 1); continue; }
      // Per request ("kapag lumapit na lang yung character sa loot 2 tiles ang layo"):
      // walk within MINE_AUTO_PICKUP of a resting drop and it flies into you — no click.
      if (d.t > 0.25 && !player.sleeping && Math.hypot(d.x - player.x, d.y - (player.y + MINE_FEET_OFF)) <= MINE_AUTO_PICKUP) {
        d.phase = "vacuum"; d.vacT0 = d.t; d.fromX = d.x; d.fromY = d.y;
      }
    } else if (d.phase === "vacuum") {
      const k = Math.min(1, (d.t - d.vacT0) / 0.35), e = k * k;
      d.x = d.fromX + (player.x - d.fromX) * e;
      d.y = d.fromY + (player.y + MINE_FEET_OFF - 6 - d.fromY) * e;
      d.z = (1 - e) * 4;
      if (k >= 1) { collectMineDrop(d); st.drops.splice(i, 1); }
    }
  }
}
function collectMineDrop(d) {
  if (d.type === "goldCoin") {
    player.gold += d.amount;
    if (typeof renderGoldDisplays === "function") renderGoldDisplays();
    pushMineNumber(player.x, player.y - DRAW_SIZE * 0.32, "+" + d.amount + " gold", "#ffd84a");
  } else {
    grantItem(d.type, d.amount);
    pushMineNumber(player.x, player.y - DRAW_SIZE * 0.32, "+" + d.amount + " " + (itemDefs[d.type] ? itemDefs[d.type].name : d.type), "#9cf59a");
  }
  if (typeof saveGame === "function") saveGame();
}
// Click a resting drop: it flies into you (only then). Captured before the other click handlers.
view.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const room = currentMineRoom();
  if (!room) return;
  const st = mineStates[mobZoneKey()];
  if (!st || !st.drops.length) return;
  const { x, y } = screenToWorld(e.clientX, e.clientY);
  let best = null, bd = 1e9;
  for (const d of st.drops) {
    if (d.phase !== "rest") continue;
    const dd = Math.hypot(d.x - x, (d.y - 6) - y);
    if (dd < 11 && dd < bd) { bd = dd; best = d; }
  }
  if (!best) return;
  e.stopImmediatePropagation(); e.preventDefault();
  if (Math.hypot(best.x - player.x, best.y - (player.y + MINE_FEET_OFF)) > MINE_PICKUP_RANGE) {
    if (typeof showToast === "function") showToast("Too far — get closer first");
    return;
  }
  best.phase = "vacuum"; best.vacT0 = best.t; best.fromX = best.x; best.fromY = best.y;
}, true);

/* ---------------- per-frame (called from the indoor branch of updatePlayer, js/player.js) ----------------
   Returns true when the player is mid-swing / just started one (movement waits). */
function mineIndoorUpdate(dt) {
  const room = currentMineRoom();
  if (!room) { mineLastRoom = null; return false; }
  const st = mineStateFor(room);
  if (mineLastRoom !== room.key) {
    mineLastRoom = room.key;
    if (typeof showToast === "function") showToast(room.name + " — mobs Lv " + room.level[0] + "-" + room.level[1] + (room.layout && room.layout.depth === 10 ? " — careful, there's a boss!" : ""));
    respawnMobs(room, st);
  }
  for (const m of st.mobs) updateMob(room, st, m, dt);
  updateMobLight(room, st, dt);
  separateMobs(room, st.mobs);
  for (let i = st.mobs.length - 1; i >= 0; i--) {
    const m = st.mobs[i];
    if (m.gone && !m.waitingRespawn) { m.waitingRespawn = true; }
  }
  updateDrops(room, st, dt);
  updateMineArrows(dt);
  for (let i = mobShots.length - 1; i >= 0; i--) { // wizard bolts home in on you
    const b = mobShots[i], tx = player.x, ty = player.y + MINE_FEET_OFF - 12;
    const d = Math.hypot(tx - b.x, ty - b.y), sp = 170 * dt;
    b.t += dt;
    if (d <= sp + 4) { damagePlayer(b.dmg, b.magic); mobShots.splice(i, 1); continue; }
    if (b.t > 2.5) { mobShots.splice(i, 1); continue; }
    b.x += (tx - b.x) / d * sp; b.y += (ty - b.y) / d * sp;
  }
  mineHurtFlash = Math.max(0, mineHurtFlash - dt);

  // the player's swing
  if (player.action && player.mineSwing) {
    const n = FRAME_COUNTS[player.action] || 4;
    player.frameTimer += dt;
    if (player.frameTimer >= 1 / ((ANIM_FPS[player.action] || 10) * (player.mineSwing.speed || 1))) {
      player.frameTimer = 0;
      player.frame++;
      if (!player.mineSwing.hitDone && player.frame >= Math.floor(n / 2)) {
        player.mineSwing.hitDone = true;
        resolveMineSwing(room, st, player.mineSwing);
      }
      if (player.frame >= n) { player.action = null; player.mineSwing = null; player.frame = 0; }
    }
    return true;
  }
  if (typeof autoAttackTick === "function" && autoAttackTick(room, st, dt)) return true; // click-to-attack (js/gear.js)
  if (harvestRequested && !(typeof isRoomTool === "function" && isRoomTool(player.equippedWeapon))) {
    // outdoors F still chops trees / breaks stones unless a mob is right there
    const wpn = player.equippedWeapon && itemDefs[player.equippedWeapon];
    if (room.kind === "world" && !mobInFront(st, isMobileMode() ? (wpn && wpn.weapon && wpn.weapon.ranged ? 3 : 2) * TILE + 8 : (wpn && wpn.weapon && wpn.weapon.ranged ? 5 * TILE + 8 : 40))) return false; // phone: a mob within 2 tiles (bow 3); desktop as before — otherwise F still chops / breaks
    harvestRequested = false;
    startMineSwing();
    return true;
  }
  return false;
}
function mobInFront(st, range) {
  const fx = player.x, fy = player.y + MINE_FEET_OFF;
  return st.mobs.some((m) => m.state !== "dead" && Math.hypot(m.x - fx, m.y - fy) < range);
}
// Outdoors (east worlds) — called near the top of updatePlayer() (js/player.js).
function mobOutdoorUpdate(dt) { return player.scene === "outside" ? mineIndoorUpdate(dt) : false; }

// Dead mobs come back after a while, but never right where you're standing.
function respawnMobs(room, st) {
  const now = performance.now() / 1000;
  for (let i = 0; i < st.mobs.length; i++) {
    const m = st.mobs[i];
    if (!m.gone || now - (m.diedAt || now) < (m.def.respawn || MINE_RESPAWN_SEC)) continue;
    if (Math.hypot(m.spawnSpot.x - player.x, m.spawnSpot.y - player.y) < 12 * TILE) continue;
    st.mobs[i] = makeMob(m.type, zoneLevel(room), m.spawnSpot.x, m.spawnSpot.y);
  }
}
setInterval(() => { const room = currentMineRoom(); if (room && mineStates[mobZoneKey()]) respawnMobs(room, mineStates[mobZoneKey()]); }, 5000);

/* ---------------- light: like the farm animals ----------------
   Per request ("medyo madilim ... dapat same lang sa mga animals na kapag
   lapit ko biglang liliwanag sila"): each mob has `lit` (0..1) — how far
   into your light (or a lamp post's) it stands — easing in and out, and its
   true colours are painted back by that much after the room's darkening
   (mineRelightList(), drawCharacterNightRelights(), js/camera.js). */
const MOB_LIGHT_EASE = 4;
const MOB_LIGHT_PLAYER_R = 96, MOB_LIGHT_LAMP_R = 80;
function mineLightSources(zone) {
  if (zone.kind === "world") return typeof animalLightSources === "function" ? animalLightSources() : [];
  const room = zone.room;
  const out = [{ x: player.x, y: player.y + MINE_FEET_OFF - 8, r: MOB_LIGHT_PLAYER_R }];
  if (room.decor) for (const [key, type] of room.decor) {
    if (type !== "postLightLit") continue;
    const [c, r] = key.split(",").map(Number);
    out.push({ x: (c + 0.5) * TILE, y: (r + 1) * TILE - 10, r: MOB_LIGHT_LAMP_R });
  }
  return out;
}
function updateMobLight(room, st, dt) {
  const lights = mineLightSources(room), ease = 1 - Math.exp(-MOB_LIGHT_EASE * dt);
  for (const m of st.mobs) {
    const bx = m.x, by = m.y - 10;
    let best = 0;
    for (const L of lights) {
      const d = Math.hypot(bx - L.x, by - L.y) / L.r;
      if (d >= 1) continue;
      let t = d <= 0.55 ? 1 : 1 - (d - 0.55) / 0.45;
      t = t * t * (3 - 2 * t);
      if (t > best) best = t;
    }
    m.lit = (m.lit || 0) + (best - (m.lit || 0)) * ease;
  }
}
// Mobs standing in front of someone being relit cover them (relightOccluders(), js/camera.js).
const mobFrameCanvasCache = new Map();
function mobFrameCanvas(sheet, f, S, flip) {
  const key = sheet.src + "#" + f + (flip ? "f" : "");
  let c = mobFrameCanvasCache.get(key);
  if (!c) {
    c = document.createElement("canvas"); c.width = S; c.height = S;
    const g = c.getContext("2d");
    if (flip) { g.translate(S, 0); g.scale(-1, 1); }
    g.drawImage(sheet, f * S, 0, S, S, 0, 0, S, S);
    c.lightSig = key;
    mobFrameCanvasCache.set(key, c);
  }
  return c;
}
function mineRelightOccluders(feetY) {
  const st = currentMineRoom() && mineStates[mobZoneKey()];
  if (!st) return [];
  const out = [];
  for (const m of st.mobs) {
    if (m.gone || m.y - CHARACTER_VISIBLE_FEET_EXTRA <= feetY) continue;
    const sheet = assets["mobsheet_" + m.type + "_" + m.anim];
    if (!sheet || !sheet.width) continue;
    const def = m.def, S = def.size, s = def.scale * zoom, f = Math.min(m.frame, mobFrameCount(m, m.anim) - 1);
    const x = (m.x - camX) * zoom - S / 2 * s, y = (m.y - camY) * zoom - def.foot * s;
    out.push({ icon: mobFrameCanvas(sheet, f, S, m.facing < 0), x, y, w: S * s, h: S * s, alpha: 1 });
  }
  return out;
}
function mineRelightList() {
  const room = currentMineRoom();
  const st = room && mineStates[mobZoneKey()];
  if (!st) return [];
  const night = typeof getRelightStrength === "function" ? getRelightStrength() : 0;
  const out = [];
  if (night <= 0.01) return out;
  for (const m of st.mobs) {
    if (m.gone || (m.lit || 0) <= 0.01) continue;
    const sheet = assets["mobsheet_" + m.type + "_" + m.anim];
    if (!sheet || !sheet.width) continue;
    const def = m.def, S = def.size, s = def.scale * zoom, f = Math.min(m.frame, mobFrameCount(m, m.anim) - 1);
    const px = Math.round((m.x - camX) * zoom), py = Math.round((m.y - camY) * zoom);
    const size = S * s;
    out.push({
      sortY: m.y - CHARACTER_VISIBLE_FEET_EXTRA,
      draw: () => drawMaskedRelight((g) => {
        g.save(); g.imageSmoothingEnabled = false; g.translate(px, py); if (m.facing < 0) g.scale(-1, 1);
        g.drawImage(sheet, f * S, 0, S, S, -S / 2 * s, -def.foot * s, size, size); g.restore();
      }, px, py - def.foot * s + size / 2, size, m.y, night * m.lit, false),
    });
  }
  return out;
}

/* ---------------- drawing ---------------- */
const mobWhiteCache = new Map();
function mobWhiteSheet(sheet) {
  let c = mobWhiteCache.get(sheet);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = sheet.width; c.height = sheet.height;
  const g = c.getContext("2d");
  g.drawImage(sheet, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
  mobWhiteCache.set(sheet, c);
  return c;
}
function drawMob(m) {
  const def = m.def;
  const sheet = assets["mobsheet_" + m.type + "_" + m.anim];
  if (!sheet || !sheet.width) return;
  const S = def.size, n = mobFrameCount(m, m.anim), f = Math.min(m.frame, n - 1);
  const s = def.scale * zoom;
  const px = (m.x - camX) * zoom, py = (m.y - camY) * zoom;
  // ground shadow
  if (m.state !== "dead" || !m.gone) {
    ctx.save();
    ctx.globalAlpha = m.state === "dead" ? 0.12 : 0.28;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(px, py, def.r * zoom * 0.9, def.r * zoom * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (player.autoTarget === m && m.state !== "dead") { // the mob you clicked (js/gear.js)
    ctx.save(); ctx.strokeStyle = "rgba(255,80,60,0.9)"; ctx.lineWidth = Math.max(1, zoom * 0.6);
    ctx.beginPath(); ctx.ellipse(px, py, def.r * zoom * 1.1, def.r * zoom * 0.42, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(px), Math.round(py));
  if (m.facing < 0) ctx.scale(-1, 1);
  const dx = -S / 2 * s, dy = -def.foot * s;
  if (player.hoverMob === m && m.state !== "dead") { // hovered: a light border round it, like the ground highlight
    const wht = mobWhiteSheet(sheet), o = Math.max(1, Math.round(zoom * 0.7));
    ctx.globalAlpha = 0.95;
    for (const [ox, oy] of [[o, 0], [-o, 0], [0, o], [0, -o]]) ctx.drawImage(wht, f * S, 0, S, S, dx + ox, dy + oy, S * s, S * s);
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(sheet, f * S, 0, S, S, dx, dy, S * s, S * s);
  if (m.flash > 0) {
    ctx.globalAlpha = Math.min(1, m.flash / 0.14) * 0.85;
    ctx.drawImage(mobWhiteSheet(sheet), f * S, 0, S, S, dx, dy, S * s, S * s);
  }
  ctx.restore();
  if (m.state !== "dead") drawMobHealth(m);
}
// The little bar under the feet, with its numbers in small text.
function drawMobHealth(m) {
  const w = (m.def.boss ? 50 : m.def.size >= 48 ? 30 : 20) * zoom, h = Math.max(2, (m.def.boss ? 3 : 2.2) * zoom);
  const x = Math.round((m.x - camX) * zoom - w / 2), y = Math.round((m.y - camY) * zoom + 3 * zoom);
  const k = Math.max(0, m.hp / m.maxHp);
  ctx.save();
  ctx.fillStyle = "rgba(10,8,12,0.85)";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = k > 0.5 ? "#5fd36a" : k > 0.25 ? "#e8c84a" : "#e8504a";
  ctx.fillRect(x, y, Math.round(w * k), h);
  const fs = Math.max(7, Math.round(4.2 * zoom));
  ctx.font = "bold " + fs + "px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.lineWidth = Math.max(2, fs / 4); ctx.strokeStyle = "rgba(0,0,0,0.85)";
  const label = (m.def.boss ? m.def.name + " " : "") + "Lv" + m.level + " " + m.hp + "/" + m.maxHp;
  ctx.strokeText(label, x + w / 2, y + h + 1);
  ctx.fillStyle = "#f2f2f2";
  ctx.fillText(label, x + w / 2, y + h + 1);
  ctx.restore();
}
// Depth-sorted with the player and the room's furniture (renderInteriorScene(), js/camera.js).
function mineIndoorDrawables() {
  const st = mineStates[mobZoneKey()];
  if (!st || !currentMineRoom()) return [];
  const out = [];
  // Sorted like the animals (drawableOrder(), js/camera.js): the player's sort point is ~6px above
  // the drawn soles, so a mob sorts that much higher — the moment your shoes pass its feet you're in front.
  for (const m of st.mobs) if (!m.gone) out.push({ sortY: m.y - CHARACTER_VISIBLE_FEET_EXTRA + (m.def.fly ? 4 : 0), draw: () => drawMob(m) });
  for (const d of st.drops) if (d.phase !== "vacuum") out.push({ sortY: d.y - 0.5, draw: () => drawMineDrop(d) });
  return out;
}
function drawMineDrop(d) {
  const icon = assets["mob_" + d.type];
  if (!icon || !icon.width) return;
  const strip = itemDefs[d.type] && itemDefs[d.type].animStrip && assets[itemDefs[d.type].animStrip];
  const size = (strip ? (strip.height >= 32 ? 16 : 13) : 11) * zoom;
  if (strip && strip.width) { // the boss swords: their aura pulses (6 frames)
    const S = strip.height, fr = Math.floor(performance.now() / 120) % Math.max(1, Math.round(strip.width / S));
    const bob = d.phase === "rest" ? Math.sin((performance.now() / 1000 - d.born) * 3) * 0.8 : 0;
    const x = (d.x - camX) * zoom, y = (d.y - d.z - camY) * zoom;
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(x, (d.y - camY) * zoom, 6 * zoom, 2 * zoom, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(strip, fr * S, 0, S, S, Math.round(x - size / 2), Math.round(y - size - bob * zoom), size, size);
    ctx.restore();
    return;
  }
  const bob = d.phase === "rest" ? Math.sin((performance.now() / 1000 - d.born) * 3) * 0.8 : 0;
  const x = (d.x - camX) * zoom, y = (d.y - d.z - camY) * zoom;
  ctx.save();
  ctx.globalAlpha = 0.25; ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.ellipse(x, (d.y - camY) * zoom, 4 * zoom, 1.5 * zoom, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(icon, Math.round(x - size / 2), Math.round(y - size - bob * zoom), size, size);
  if (d.phase === "rest") { // a little glint so it reads as "pick me up"
    const g = (Math.sin((performance.now() / 1000 - d.born) * 4) + 1) / 2;
    ctx.globalAlpha = 0.35 + 0.4 * g;
    ctx.fillStyle = "#fffbe0";
    ctx.fillRect(Math.round(x + size * 0.18), Math.round(y - size * 0.9 - bob * zoom), Math.max(1, zoom), Math.max(1, zoom));
    if (d.amount > 1) {
      ctx.globalAlpha = 1;
      const fs = Math.max(7, Math.round(4 * zoom));
      ctx.font = "bold " + fs + "px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.lineWidth = 2; ctx.strokeStyle = "#000"; ctx.strokeText("x" + d.amount, x + size * 0.25, y - size * 0.35);
      ctx.fillStyle = "#fff"; ctx.fillText("x" + d.amount, x + size * 0.25, y - size * 0.35);
    }
  }
  ctx.restore();
}
// Drops in mid-vacuum, the floating numbers and the hurt flash — over everything (after the room's light washes).
function drawMineOverlay() {
  const room = currentMineRoom();
  if (!room) return;
  const st = mineStates[mobZoneKey()];
  if (st) for (const d of st.drops) if (d.phase === "vacuum") drawMineDrop(d);
  const nowT = performance.now(), dt = isMobileMode() ? Math.min(0.05, (nowT - (drawMineOverlay.lastT || nowT)) / 1000) : 1 / 60; // phone: real frame time (30-120 fps); desktop as before
  drawMineOverlay.lastT = nowT;
  for (let i = mineNumbers.length - 1; i >= 0; i--) {
    const n = mineNumbers[i];
    if (n.room !== mobZoneKey()) { mineNumbers.splice(i, 1); continue; }
    n.t += dt;
    if (n.t >= n.life) { mineNumbers.splice(i, 1); continue; }
    const k = n.t / n.life;
    const x = (n.x - camX) * zoom, y = (n.y - camY) * zoom - k * 16 * zoom;
    const fs = Math.max(8, Math.round((n.big ? 7 : 5.5) * zoom * (k < 0.15 ? 1 + (0.15 - k) * 2 : 1)));
    ctx.save();
    ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    ctx.font = "bold " + fs + "px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.lineWidth = Math.max(2, fs / 3.5); ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(n.text, x, y);
    ctx.fillStyle = n.color; ctx.fillText(n.text, x, y);
    ctx.restore();
  }
  for (let i = mineArrows.length - 1; i >= 0; i--) { // arrows
    const a = mineArrows[i];
    if (a.x1 === undefined) continue;
    const x = a.x0 + (a.x1 - a.x0) * a.t, y = a.y0 + (a.y1 - a.y0) * a.t, ang = Math.atan2(a.y1 - a.y0, a.x1 - a.x0);
    ctx.save(); ctx.translate((x - camX) * zoom, (y - camY) * zoom); ctx.rotate(ang);
    ctx.fillStyle = "#e9dcc0"; ctx.fillRect(-5 * zoom, -0.4 * zoom, 9 * zoom, 0.8 * zoom);           // shaft
    ctx.fillStyle = "#cfd6e0"; ctx.beginPath(); ctx.moveTo(6 * zoom, 0); ctx.lineTo(3.5 * zoom, -1.4 * zoom); ctx.lineTo(3.5 * zoom, 1.4 * zoom); ctx.fill(); // head
    ctx.fillStyle = "#c85a5a"; ctx.fillRect(-6 * zoom, -1.2 * zoom, 2 * zoom, 0.8 * zoom); ctx.fillRect(-6 * zoom, 0.4 * zoom, 2 * zoom, 0.8 * zoom); // fletching
    ctx.restore();
  }
  for (const b of mobShots) { // a violet orb with a bright core
    const x = (b.x - camX) * zoom, y = (b.y - camY) * zoom;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 5 * zoom);
    g.addColorStop(0, "rgba(255,240,255,1)"); g.addColorStop(0.35, "rgba(200,110,255,0.9)"); g.addColorStop(1, "rgba(140,60,220,0)");
    ctx.fillStyle = g; ctx.fillRect(x - 5 * zoom, y - 5 * zoom, 10 * zoom, 10 * zoom);
  }
  if (mineHurtFlash > 0) {
    ctx.save();
    ctx.globalAlpha = mineHurtFlash / 0.35 * 0.28;
    ctx.fillStyle = "#c01818";
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.restore();
  }
}


/* =================================================================
   EXP + LEVELS — per request ("kada kill ng mobs may exp at nag level yung
   character ... weapon na naka lock pa tyaka lang ma unlock kapag na reach
   yung level"). Each kill gives the mob's exp (higher level = more). The
   bar fills to maxExp (100 at level 1, x1.35 each level); a level up gives
   +8 max health, +4 max stamina and a full heal. Weapons carry
   weapon.reqLevel: the shop won't sell them (and you can't equip them)
   until you reach it. Saved with the game.
================================================================= */
if (typeof player.level !== "number") player.level = 1;
// 50 x level^1.75 (Lv1 50, Lv20 ~9.5k, Lv80 ~110k)
function expForLevel(l) { return Math.max(50, Math.round(50 * Math.pow(l, 1.75))); } // steeper: every level takes longer than the last
const LEVEL_MAX = 100; // per request: level 1 -> 100, only from killing mobs and quests
function gainExp(n, m) {
  if ((player.level || 1) >= LEVEL_MAX) { player.exp = 0; return; }
  player.exp += n;
  if (m) pushMineNumber(m.x + 8, mobTopY(m) - 8, "+" + n + " EXP", "#c79bff");
  while (player.exp >= player.maxExp && player.level < LEVEL_MAX) {
    player.exp -= player.maxExp;
    player.level++;
    if (player.level >= LEVEL_MAX) player.exp = 0;
    player.maxExp = expForLevel(player.level);
    player.maxHealth += 8; player.health = player.maxHealth;
    player.maxStamina += 4; player.stamina = player.maxStamina;
    player.statPoints = (player.statPoints || 0) + 3; // spend them in the profile (P): STR / STA / AGI / ACC
    pushMineNumber(player.x, player.y - DRAW_SIZE * 0.4, "LEVEL UP!  Lv " + player.level, "#ffd84a", true);
    const unlocked = Object.values(itemDefs).filter((d) => d.weapon && d.weapon.reqLevel === player.level).map((d) => d.name);
    if (typeof showToast === "function") showToast("Level " + player.level + "!" + (unlocked.length ? " Na-unlock: " + unlocked.join(", ") : ""));
  }
  if (typeof saveGame === "function") saveGame();
}
function weaponLocked(type) {
  const d = itemDefs[type];
  return !!(d && d.weapon && (d.weapon.reqLevel || 1) > player.level);
}
{
  const equipBase = equipWeapon;
  equipWeapon = function (type) {
    if (weaponLocked(type)) {
      if (typeof showToast === "function") showToast("Naka-lock pa — kailangan Level " + itemDefs[type].weapon.reqLevel);
      return;
    }
    return equipBase.apply(this, arguments);
  };
  const buyBase = buyFromNpc;
  buyFromNpc = function (type, price) {
    if (weaponLocked(type)) { if (typeof showToast === "function") showToast("Naka-lock pa — kailangan Level " + itemDefs[type].weapon.reqLevel); return; }
    return buyBase.apply(this, arguments);
  };
  const hudBase = updateStatsHUD;
  updateStatsHUD = function () {
    hudBase.apply(this, arguments);
    if (typeof expBarTextEl !== "undefined" && expBarTextEl) expBarTextEl.textContent = "Lv " + player.level + "  " + Math.floor(player.exp) + "/" + player.maxExp;
  };
  const saveBase = buildSaveData;
  buildSaveData = function () {
    const d = saveBase.apply(this, arguments);
    d.level = player.level; d.maxExp = player.maxExp; d.maxHealth = player.maxHealth; d.maxStamina = player.maxStamina; d.exp = player.exp;
    return d;
  };
  const loadBase = applySaveData;
  applySaveData = function (data) {
    if (data) {
      if (typeof data.level === "number") player.level = Math.max(1, data.level);
      player.maxExp = expForLevel(player.level); // always from the current curve
      if (typeof data.maxHealth === "number") player.maxHealth = data.maxHealth;
      if (typeof data.maxStamina === "number") player.maxStamina = data.maxStamina;
    }
    const r = loadBase.apply(this, arguments);
    if (data && typeof data.exp === "number") player.exp = Math.max(0, Math.min(player.maxExp - 1, data.exp));
    if (data && typeof data.health === "number") player.health = Math.min(player.maxHealth, data.health);
    return r;
  };
}
