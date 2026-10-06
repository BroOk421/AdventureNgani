"use strict";

/* =================================================================
   FRESH START — a new beginning for every player.

   Per request ("lahat ng item sa inventory alisin mo na tapos nakasuot sa
   profile para panibagong simula 0 gold at level 1 ... default item na
   pwede suotin ng character is hoe, axe, pickaxe, fishing ... reset mo yung
   sa new world na may bahay gawin mong puro puno lang tapos bahay tapos
   kahit isang cave door na lang iwan mo yung nasa top left"):
   - Once per save (player.freshStartV, saved) — and for every new game —
     the progress is wiped: nothing in the inventory but the starter pack
     (Hoe, Axe, Pickaxe, Fishing Rod, Watering Can — the can so the hoe's
     fields can be watered), nothing worn, 0 gold, level 1 (levels now come
     only from mobs and quests, up to 100 — js/mines.js LEVEL_MAX), no
     upgrades / skills / passives, no free boss gear.
   - The wild world (the one with your House) keeps only its ground, the
     trees, the House and the west cave (top left). The tunnel is gone; the
     caves still join underground (js/worlds.js), so the mines are reached
     through the west cave.
   - Furniture is bought now (js/shops.js Furniture Shop): every piece it
     sells is a normal item (counted, used up when placed, given back when
     picked up). The other building-mode tiles stay out of the inventory —
     dev mode (?dev=1, js/config.js isDevMode()) brings everything back,
     unlimited, for editing the map.
   - Trees need the Axe equipped, stones the Pickaxe.
================================================================= */

const FRESH_START_VERSION = 1;
const STARTER_PACK = ["farmHoe", "woodAxe", "woodPickaxe", "fishingRod", "farmCan"];

/* ---------------- furniture is bought, not free ---------------- */
function applyShopItemRules() {
  if (isDevMode()) return;
  const stocks = typeof furnitureStock === "function" ? [...furnitureStock("indoor"), ...furnitureStock("outdoor")] : [];
  for (const { type } of stocks) {
    const d = itemDefs[type];
    if (d) { d.unlimited = false; d.startCount = 0; }
  }
  for (const t of ["farmHoe", "farmCan"]) if (itemDefs[t]) { itemDefs[t].unlimited = false; itemDefs[t].startCount = 1; }
}
applyShopItemRules();

/* ---------------- the wild world: ground, trees, the House, the west cave ---------------- */
function isGroundPiece(t) { return /^(terrain|grass|dirt|water|port(?!Bridge)|bridgeTile|mountain)/.test(t); }
function keepInFreshWild(t) {
  if (isGroundPiece(t)) return true;
  if (t === "house" || t === "caveEntranceB") return true;
  return /^(tree(Medium|Thin|Tiny|Big)|pcTree)/.test(t) && !/Stump/.test(t);
}
function cleanWildWorld(store) {
  if (!store || !Array.isArray(store.placedItems)) return store;
  store.placedItems = store.placedItems.filter(([, t]) => keepInFreshWild(t));
  return store;
}

/* ---------------- wiping the progress ---------------- */
function applyFreshStart() {
  // the inventory: every slot empty, then the starter pack
  for (let i = 0; i < inventory.length; i++) {
    const s = inventory[i];
    if (s) s.count = itemDefs[s.type] && itemDefs[s.type].unlimited ? s.count : 0;
  }
  for (const t of STARTER_PACK) {
    const s = inventory.find((x) => x && x.type === t);
    if (s) s.count = 1; else if (typeof grantItem === "function") grantItem(t, 1);
  }
  // the hotbar: the starter tools, the rest empty
  for (let i = 0; i < hotbar.length; i++) hotbar[i] = null;
  // (the starter tools stay off the hotbar — they're picked from the Equipment list, G: js/storage.js)
  selectedHotbarIndex = 0;
  if (typeof heldItem !== "undefined" && heldItem) heldItem = null;
  // nothing worn, no money, level 1
  player.equippedWeapon = null;
  player.equipment = {};
  player.gold = 0;
  player.level = 1; player.exp = 0;
  player.maxExp = typeof expForLevel === "function" ? expForLevel(1) : 50;
  player.maxHealth = 100; player.health = 100;
  player.maxStamina = 100; player.stamina = 100;
  player.attrs = { str: 0, sta: 0, agi: 0, acc: 0 }; player.statPoints = 0;
  player.upgrades = {}; player.passives = { atk: 0, aspd: 0, def: 0 }; player.skillLv = { slash: 1, stun: 1, teleport: 1 };
  player.gearTrialGiven = true; player.gearTrial = false; // no free boss set
  player.plus10Given = true;
  player.treasure = { zones: {} };
  player.autoTarget = null; player.selectedMob = null;
  // the wild world
  if (typeof worldStore !== "undefined") {
    if (worldStore.wild) cleanWildWorld(worldStore.wild);
    else if (typeof WILD_WORLD_DEFAULT !== "undefined") worldStore.wild = cleanWildWorld({ placedItems: WILD_WORLD_DEFAULT.placedItems.slice(), groundFill: WILD_WORLD_DEFAULT.groundFill });
    if (typeof currentWorld !== "undefined" && currentWorld === "wild") { // already in it: clear the live layers too
      for (const L of ALL_LAYERS) for (const [k, t] of [...L]) if (!keepInFreshWild(t)) L.delete(k);
    }
  }
  player.freshStartV = FRESH_START_VERSION;
  if (typeof renderHotbar === "function") renderHotbar();
  if (typeof renderInventory === "function") renderInventory();
  if (typeof renderGoldDisplays === "function") renderGoldDisplays();
  if (typeof renderEquippedWeaponHUD === "function") renderEquippedWeaponHUD();
  if (typeof updateStatsHUD === "function") updateStatsHUD();
}
{
  const saveBase = buildSaveData;
  buildSaveData = function () { const d = saveBase.apply(this, arguments); d.freshStartV = player.freshStartV || 0; d.gearTrialGiven = !!player.gearTrialGiven; d.gearTrial = !!player.gearTrial; return d; };
  const loadBase = applySaveData;
  applySaveData = function (data) {
    const r = loadBase.apply(this, arguments);
    player.freshStartV = data && data.freshStartV || 0;
    if (player.freshStartV < FRESH_START_VERSION && !isDevMode()) {
      applyFreshStart();
      setTimeout(() => { if (typeof showToast === "function") showToast("A fresh start! Starter pack: Hoe, Axe, Pickaxe, Fishing Rod, Watering Can"); }, 1500);
    }
    return r;
  };
}

/* ---------------- the right tool ---------------- */
{
  const base = findHarvestableTarget;
  let toastAt = 0;
  findHarvestableTarget = function () {
    const t = base.apply(this, arguments);
    if (!t) return t;
    const res = itemDefs[t.type] && itemDefs[t.type].resource;
    const need = res && res.breakAnim === "slice" ? "woodAxe" : res && res.breakAnim === "crush" ? "woodPickaxe" : null;
    if (need && player.equippedWeapon !== need) {
      if (performance.now() - toastAt > 2500 && typeof showToast === "function") {
        toastAt = performance.now();
        showToast(need === "woodAxe" ? "You need the Axe — equip it first" : "You need the Pickaxe — equip it first");
      }
      return null;
    }
    return t;
  };
}
