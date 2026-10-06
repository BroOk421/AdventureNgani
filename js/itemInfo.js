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
  goldCoin: "Pera ng bayan. Pambili sa mga shop at pambayad sa Blacksmith.",
  woodSword: "Magaan na espada na gawa sa kahoy. Pang-umpisa, pero mabilis tumama.",
  bronzeSword: "Espadang bronze — mas matalas kaysa kahoy.",
  ironSword: "Matibay na espadang bakal. Paborito ng mga bagong adventurer.",
  goldSword: "Espadang ginto — kumikinang at malakas tumama.",
  crystalSword: "Talim na gawa sa crystal ng kweba. Malamig at matalas.",
  emeraldSword: "Espadang may talim na emerald.",
  diamondSword: "Diamond na talim — halos walang nakakaharang dito.",
  mythrilSword: "Mythril — magaan pero napakatibay.",
  dragonSword: "Hinasa sa apoy ng dragon.",
  celestialSword: "Espada mula sa langit. Para sa pinakamalalakas lang.",
  stormSword: "Ang Storm Greatsword — drop lang ng Demon Lord. I-upgrade para lumabas ang aura.",
  woodBow: "Pana na gawa sa kahoy. Tumatama mula sa malayo.",
  ironBow: "Panang may bakal — mas malakas ang tira.",
  goldBow: "Gintong pana — malayo at malakas.",
  potionHealth: "Pulang potion. Nagbabalik ng buhay.",
  potionStamina: "Berdeng potion. Nagbabalik ng stamina.",
  potionElixir: "Bihirang elixir — buo ang buhay at stamina, may kasama pang busog.",
  slimeGel: "Malagkit na gel mula sa slime. Binibili ng mga shop.",
  batWing: "Pakpak ng paniki.",
  glowCap: "Kabuteng umiilaw. Sangkap sa mga potion.",
  crystalShard: "Piraso ng crystal. Kailangan sa upgrade (+6 pataas).",
  golemCore: "Puso ng Rock Golem. Kailangan sa upgrade (+9 pataas).",
  ironIngot: "Bakal na ingot. Pangunahing materyales sa upgrade ng Blacksmith.",
  goldIngot: "Gintong ingot. Kailangan sa upgrade (+4 pataas).",
  woodLog: "Kahoy mula sa pinutol na puno. Binibili ng grocery.",
  stoneChunk: "Bato mula sa binasag na bato. Binibili ng grocery.",
  farmHoe: "Pang-araro ng lupa para makapagtanim.",
  farmCan: "Pandilig ng mga tanim.",
  warpPortal: "Portal papunta sa malalayong mundo.",
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
    if (d.weapon.ranged) return "Pana (Bow)";
    if (/Sword|Cleaver|Reaver/.test(type)) return typeof isLongSword === "function" && isLongSword(type) ? "Long Sword — 2 kamay, mabigat" : "Short Sword — 1 kamay, mabilis";
    return "Gamit (Tool)";
  }
  if (d.gear) return ITEM_KIND_NAMES[d.gear.kind] || "Gear";
  if (d.consumable) return /potion|elixir/i.test(type) ? "Potion" : "Pagkain";
  if (d.seedOf) return "Binhi (Seed)";
  if (d.cropOf) return "Ani (Crop)";
  if (d.mobDrop) return "Materyales";
  if (d.interior) return "Gusali";
  if (d.lightGlow) return "Ilaw";
  return "Bagay / Dekorasyon";
}
function itemDescription(type, d) {
  if (ITEM_DESC[type]) return ITEM_DESC[type];
  if (d.bossDrop) return "Bihirang gamit mula sa isang boss. I-upgrade sa Blacksmith para magka-aura.";
  if (d.gear) return "Isuot sa Profile (P) para lumakas ang depensa o atake.";
  if (d.weapon && d.weapon.ranged) return "Pana — tumatama mula sa malayo.";
  if (d.weapon && d.weapon.damage) return "Pang-laban sa mga mob.";
  if (d.weapon) return "Gamit — i-equip at pindutin ang F.";
  if (d.seedOf) return "Itanim sa naararong lupa, diligan, at hintaying tumubo.";
  if (d.cropOf) return "Inani mula sa bukid. Pwedeng ibenta.";
  if (d.consumable) return "I-click para kainin / inumin.";
  if (d.interior) return "Ilagay sa mapa — pwedeng pasukan.";
  if (d.lightGlow) return "Umiilaw sa gabi.";
  if (d.mobDrop) return "Nakuha sa mga mob. Binibili ng mga shop.";
  if (d.unlimited) return "Pangbuo ng mapa — ilagay kung saan mo gusto.";
  return "Ilagay sa bahay o sa labas bilang dekorasyon.";
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
  if (req && req > 1) out.push('<span class="' + ((player.level || 1) >= req ? "ok" : "no") + '">Kailangan: Level ' + req + "</span>");
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
