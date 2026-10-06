"use strict";

/* =================================================================
   LEGENDARY — the Inferno set; the old mythical boss set retired.

   Per request ("alisin mo na rin yun mga mythical na weapon at gear dapat
   gawa ka rin legendary na gear at sword umaapoy ... drop din siya ng
   bosses ... level 50-60 mobs na bosses"):
   - The Demon set (helmet, armor, gauntlet, boots, ring, shield, bow) and
     the Storm Greatsword are retired: no boss drops them, they're never
     listed, and anything of theirs still worn is taken off.
   - The Inferno set (tools/inferno_art.py): Inferno Helmet / Armor /
     Gauntlet / Boots / Ring / Shield and the Inferno Blade (a two-handed
     long sword whose blade burns — a 6-frame flame strip, on your back and
     in the swing). Lv 55. Worn, every piece burns: a fire aura of its own
     (at least +5 strength, more if it's upgraded higher).
   - Dropped only by the bosses of the Lv 50-60 lands: the Venom Queen
     (Sunscar Barrens, Lv 39-58) — helmet, shield, boots, ring — and the
     Demon Lord (Ember Peaks, Lv 59-80) — armor, gauntlet, the Blade.
================================================================= */

const RETIRED_ITEMS = ["demonRing", "demonBoots", "demonGauntlet", "demonBow", "demonHelmet", "demonShield", "demonArmor", "stormSword"];
for (const t of RETIRED_ITEMS) if (itemDefs[t]) itemDefs[t].retired = true;

const LEGENDARY_SET = [
  ["infernoHelmet", "Inferno Helmet", { kind: "helmet", def: 36, mres: 22 }],
  ["infernoArmor", "Inferno Armor", { kind: "armor", def: 68, mres: 28 }],
  ["infernoGauntlet", "Inferno Gauntlet", { kind: "gauntlet", atk: 22, def: 16 }],
  ["infernoBoots", "Inferno Boots", { kind: "boots", def: 18, spd: 0.18 }],
  ["infernoRing", "Inferno Ring", { kind: "ring", atk: 34, crit: 0.07 }],
  ["infernoShield", "Inferno Shield", { kind: "shield", def: 52, mres: 32 }],
];
const LEGENDARY_REQ = 55;
for (const [id, name, gear] of LEGENDARY_SET) {
  assets["mob_" + id] = new Image(); assets["mob_" + id].src = "assets/mobs/icons/" + id + ".png";
  itemDefs[id] = { id, name, icon: assets["mob_" + id], startCount: 0, reqLevel: LEGENDARY_REQ, gear, legendary: true };
}
assets.mob_infernoSword = new Image(); assets.mob_infernoSword.src = "assets/mobs/icons/infernoSword.png";
assets.anim_infernoSword = new Image(); assets.anim_infernoSword.src = "assets/mobs/icons/infernoSword_anim.png";
itemDefs.infernoSword = {
  id: "infernoSword", name: "Inferno Blade", icon: assets.mob_infernoSword, startCount: 0, legendary: true,
  equipSlot: "weapon", holdSprite: true, animStrip: "anim_infernoSword",
  weapon: { attackAnim: "hit", damage: 130, reqLevel: LEGENDARY_REQ, swingArc: true },
};

// boss drops: the old set out, the Inferno set in (the Lv 50-60 bosses only)
if (typeof MINE_TYPES !== "undefined") {
  for (const m of Object.values(MINE_TYPES)) if (m.drops) m.drops = m.drops.filter((d) => !RETIRED_ITEMS.includes(d[0]));
  if (MINE_TYPES.bossScorpion) MINE_TYPES.bossScorpion.drops.unshift(["infernoHelmet", 1, 1, 0.06], ["infernoShield", 1, 1, 0.06], ["infernoBoots", 1, 1, 0.06], ["infernoRing", 1, 1, 0.05]);
  if (MINE_TYPES.bossImp) MINE_TYPES.bossImp.drops.unshift(["infernoArmor", 1, 1, 0.05], ["infernoGauntlet", 1, 1, 0.05], ["infernoSword", 1, 1, 0.04]);
}

// names, descriptions, category in the hover info (js/itemInfo.js) — those live in a later script
setTimeout(() => {
  if (typeof ITEM_DESC === "undefined") return;
  for (const [id] of LEGENDARY_SET) ITEM_DESC[id] = "LEGENDARY — burns when worn. Dropped only by the Venom Queen and the Demon Lord (the Lv 50-60 lands).";
  ITEM_DESC.infernoSword = "LEGENDARY — the burning sword. Two-handed. Dropped only by the Demon Lord in Ember Peaks.";
  if (typeof itemCategory === "function") {
    const base = itemCategory;
    itemCategory = function (type, d) { const c = base.apply(this, arguments); return d && d.legendary ? "🔥 LEGENDARY · " + c : c; };
  }
}, 0);

// retired items: never shown, never worn
{
  const shown = inventorySlotShown;
  inventorySlotShown = function (slot) { const d = slot && itemDefs[slot.type]; if (d && d.retired) return false; return shown.apply(this, arguments); };
  const load = applySaveData;
  applySaveData = function () {
    const r = load.apply(this, arguments);
    if (player.equippedWeapon && itemDefs[player.equippedWeapon] && itemDefs[player.equippedWeapon].retired) player.equippedWeapon = null;
    if (player.equipment) for (const [s, t] of Object.entries(player.equipment)) if (t && itemDefs[t] && itemDefs[t].retired) delete player.equipment[s];
    return r;
  };
}

// worn legendary pieces burn: a fire aura of their own (stronger if upgraded past it)
const LEGENDARY_AURA_LVL = 5;
{
  const base = upgradeAuras;
  upgradeAuras = function () {
    const out = base.apply(this, arguments);
    const worn = [["weapon", player.equippedWeapon]];
    for (const s of ["helmet", "armor", "gauntlet", "boots"]) worn.push([s, player.equipment && player.equipment[s]]);
    for (const [slot, t] of worn) {
      const d = t && itemDefs[t];
      if (!d || !d.legendary) continue;
      const have = out.find((a) => a.slot === slot);
      if (have && have.lvl >= LEGENDARY_AURA_LVL) continue;
      if (have) out.splice(out.indexOf(have), 1);
      const lv = LEGENDARY_AURA_LVL;
      out.push({ slot, el: "fire", lvl: lv, f: lv / 10, q: 1 + 2 * (lv - 1) / 9, n: 2 });
    }
    return out;
  };
}
