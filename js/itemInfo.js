"use strict";

/* =================================================================
   ITEM INFO — hover any item (inventory, hotbar, chest window, upgrade
   list) for its name, a short description, its stats and, if a shop
   buys it, its sell price under the description.

   Per request ("dapat yung mga item or object na nasa inventory is dapat
   may name at description tapos yung ibang sellable is nasa baba ng
   description yung gold price"). Elements opt in with
   data-item-type="<itemDefs id>" (js/inventory.js renderInventory() /
   renderHotbar(), js/treasure.js, js/upgrades.js). A phone shows it for a
   moment on touch.
================================================================= */

const ITEM_DESC = {
  goldCoin: "The town's money. Spend it in the shops and at the Blacksmith.",
  woodSword: "A light wooden sword. A beginner's blade, but quick to strike.",
  bronzeSword: "Espadang bronze — mas matalas kaysa kahoy.",
  ironSword: "A sturdy iron sword. A favourite of new adventurers.",
  goldSword: "Espadang ginto — kumikinang at malakas tumama.",
  crystalSword: "A blade cut from cave crystal. Cold and sharp.",
  emeraldSword: "A sword with an emerald edge.",
  diamondSword: "A diamond edge — almost nothing can stop it.",
  mythrilSword: "Mythril — magaan pero napakatibay.",
  dragonSword: "Tempered in dragon fire.",
  celestialSword: "A sword from the heavens. Only for the strongest.",
  stormSword: "The Storm Greatsword (retired).",
  woodBow: "A wooden bow. Strikes from a distance.",
  ironBow: "An iron-reinforced bow — hits harder.",
  goldBow: "Gintong pana — malayo at malakas.",
  potionHealth: "A red potion. Restores health.",
  potionStamina: "A green potion. Restores stamina.",
  potionElixir: "A rare elixir — full health and stamina, and it fills you up too.",
  slimeGel: "Sticky gel from a slime. Shops buy it.",
  batWing: "A bat's wing.",
  glowCap: "A glowing mushroom. A potion ingredient.",
  crystalShard: "A shard of crystal. Needed for upgrades (+6 and up).",
  golemCore: "A Rock Golem's heart. Needed for upgrades (+9 and up).",
  ironIngot: "An iron ingot. The Blacksmith's main upgrade material.",
  goldIngot: "A gold ingot. Needed for upgrades (+4 and up).",
  woodLog: "Wood from a felled tree. The grocery buys it.",
  stoneChunk: "Stone from a broken rock. The grocery buys it.",
  farmHoe: "Tills the soil so you can plant.",
  farmCan: "Waters your crops.",
  warpPortal: "A portal to faraway lands.",
};
const ITEM_KIND_NAMES = { helmet: "Helmet", armor: "Armor", gauntlet: "Gauntlet", boots: "Boots", ring: "Ring", shield: "Shield" };

// what a shop pays for one
let itemSellPriceMap = null;
function itemSellPrice(type) {
  if (!itemSellPriceMap) {
    itemSellPriceMap = {};
    const lists = [];
    for (const name of ["SELL_DROPS", "POTION_STOCK", "EQUIP_STOCK", "SMITH_STOCK", "GROCERY_STOCK", "NPC_SHOP_STOCK"]) {
      try { const L = eval(name); if (Array.isArray(L)) lists.push(L); } catch (e) { /* not loaded */ }
    }
    for (const L of lists) for (const e of L) if (e && e.sell && e.type) itemSellPriceMap[e.type] = Math.max(itemSellPriceMap[e.type] || 0, e.price);
    if (typeof CROP_SELL_PRICE !== "undefined") for (const [t, p] of Object.entries(CROP_SELL_PRICE)) if (!itemSellPriceMap[t]) itemSellPriceMap[t] = p;
  }
  return itemSellPriceMap[type] || 0;
}
function itemCategory(type, d) {
  if (type === "goldCoin") return "Pera";
  if (d.weapon) {
    if (d.weapon.ranged) return "Bow";
    if (/Sword|Cleaver|Reaver/.test(type)) return typeof isLongSword === "function" && isLongSword(type) ? "Long Sword — 2 kamay, mabigat" : "Short Sword — 1 kamay, mabilis";
    return "Tool";
  }
  if (d.gear) return ITEM_KIND_NAMES[d.gear.kind] || "Gear";
  if (d.consumable) return /potion|elixir/i.test(type) ? "Potion" : "Food";
  if (d.seedOf) return "Seed";
  if (d.cropOf) return "Crop";
  if (d.mobDrop) return "Material";
  if (d.interior) return "Building";
  if (d.lightGlow) return "Light";
  return "Decoration";
}
function itemDescription(type, d) {
  if (ITEM_DESC[type]) return ITEM_DESC[type];
  if (d.bossDrop) return "A rare boss drop. Upgrade it at the Blacksmith to give it an aura.";
  if (d.gear) return "Wear it from the Profile (P) for more defence or attack.";
  if (d.weapon && d.weapon.ranged) return "A bow — strikes from a distance.";
  if (d.weapon && d.weapon.damage) return "For fighting mobs.";
  if (d.weapon) return "A tool — equip it and press F.";
  if (d.seedOf) return "Plant it in tilled soil, water it, and wait for it to grow.";
  if (d.cropOf) return "Harvested from the field. It can be sold.";
  if (d.consumable) return "Click to eat / drink.";
  if (d.interior) return "Place it on the map — you can go inside.";
  if (d.lightGlow) return "Lights up at night.";
  if (d.mobDrop) return "Dropped by mobs. Shops buy it.";
  if (d.unlimited) return "A map-building piece — place it anywhere.";
  return "Place it in your house or outside as decoration.";
}
function itemStatLines(type, d) {
  const out = [];
  const up = typeof upgradeOf === "function" ? upgradeOf(type) : { lvl: 0 };
  const bonus = typeof upgradeBonus === "function" ? upgradeBonus(type, up.lvl || 0) : { atk: 0, def: 0, mres: 0 };
  const plus = (v, b) => v + (b ? ' <span class="up">(+' + b + ")</span>" : "");
  if (d.weapon && d.weapon.damage) out.push("Damage: " + plus(d.weapon.damage, bonus.atk) + (d.weapon.ranged ? " · malayo" : ""));
  const g = d.gear;
  if (g) {
    if (g.atk) out.push("ATK: " + plus(g.atk, bonus.atk));
    if (g.def) out.push("DEF: " + plus(g.def, bonus.def));
    if (g.mres) out.push("Magic RES: " + plus(g.mres, bonus.mres));
    if (g.spd) out.push("Attack speed: +" + Math.round(g.spd * 100) + "%");
    if (g.crit) out.push("Crit: +" + Math.round(g.crit * 100) + "%");
  }
  const c = d.consumable;
  if (c) {
    if (c.healthPercent) out.push("Health: +" + c.healthPercent + "%");
    if (c.staminaPercent) out.push("Stamina: +" + c.staminaPercent + "%");
    if (c.food) out.push("Busog: +" + c.food);
  }
  const req = (d.weapon && d.weapon.reqLevel) || d.reqLevel;
  if (req && req > 1) out.push('<span class="' + ((player.level || 1) >= req ? "ok" : "no") + '">Requires: Level ' + req + "</span>");
  return out;
}
function itemTipHtml(type) {
  const d = itemDefs[type] || (type === "goldCoin" ? { name: "Gold" } : null);
  if (!d) return "";
  const up = typeof upgradeOf === "function" && itemDefs[type] ? upgradeOf(type) : { lvl: 0 };
  const el = up.el && typeof UPGRADE_ELEMENTS !== "undefined" && UPGRADE_ELEMENTS[up.el];
  let h = '<div class="tip-name">' + (type === "goldCoin" ? "Gold" : d.name) + (up.lvl ? ' <span class="plus">+' + up.lvl + "</span>" : "") + "</div>";
  h += '<div class="tip-cat">' + itemCategory(type, d) + (el && up.lvl >= (typeof UPGRADE_AURA_FROM !== "undefined" ? UPGRADE_AURA_FROM : 4) ? " · " + el.icon + " " + el.name + " aura" : "") + "</div>";
  h += '<div class="tip-desc">' + itemDescription(type, d) + "</div>";
  const stats = itemStatLines(type, d);
  if (stats.length) h += '<div class="tip-stats">' + stats.join("<br>") + "</div>";
  const price = itemSellPrice(type);
  if (price) h += '<div class="tip-price"><img src="' + (assets.mob_goldCoin ? assets.mob_goldCoin.src : "") + '"> Benta: ' + price + " gold</div>";
  return h;
}

let itemTipEl = null, itemTipTimer = 0;
function ensureItemTip() {
  if (itemTipEl) return itemTipEl;
  itemTipEl = document.createElement("div");
  itemTipEl.id = "item-tip";
  itemTipEl.className = "hidden";
  document.body.appendChild(itemTipEl);
  return itemTipEl;
}
function showItemTip(type, x, y) {
  const el = ensureItemTip(), html = itemTipHtml(type);
  if (!html) return hideItemTip();
  el.innerHTML = html;
  el.classList.remove("hidden");
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = x + 16, top = y + 14;
  if (left + w > window.innerWidth - 6) left = x - w - 12;
  if (top + h > window.innerHeight - 6) top = y - h - 10;
  el.style.left = Math.max(6, left) + "px";
  el.style.top = Math.max(6, top) + "px";
}
function hideItemTip() { if (itemTipEl) itemTipEl.classList.add("hidden"); }
document.addEventListener("mousemove", (e) => {
  const t = e.target && e.target.closest ? e.target.closest("[data-item-type]") : null;
  if (!t) { hideItemTip(); return; }
  showItemTip(t.dataset.itemType, e.clientX, e.clientY);
}, true);
document.addEventListener("mousedown", hideItemTip, true);
document.addEventListener("touchstart", (e) => {
  const t = e.target && e.target.closest ? e.target.closest("[data-item-type]") : null;
  if (!t) { hideItemTip(); return; }
  const p = e.touches[0];
  showItemTip(t.dataset.itemType, p.clientX, p.clientY - 60);
  clearTimeout(itemTipTimer);
  itemTipTimer = setTimeout(hideItemTip, 2200);
}, { capture: true, passive: true });
