"use strict";

/* =================================================================
   UPGRADES — the Blacksmith raises swords, bows, helmets, armour,
   gauntlets and boots from +0 to +10, and an upgraded piece glows with
   an element aura.

   Per request ("yung sword or armor or helmet gaunlet at boots sa
   blacksmith dapat may upgrade at need ng mats para mag upgrade 1 to 10
   max para mag aura ng ganyan like lightning or fire or yellow or ice or
   wind"):
   - Click the Blacksmith -> the shop popup has an "⚒ Upgrade" button ->
     the upgrade window: pick an item you own, see the cost (gold + mats)
     and what it adds, press Upgrade. Always succeeds. Max +10.
   - Each + adds 10% of the piece's own ATK / DEF / MAGIC RES (+10 =
     double), gear also gets +1 DEF per 2 levels.
   - From +4 the piece gets an aura of the element you pick (Lightning,
     Fire, Holy/yellow, Ice, Wind — change it any time, free). It grows at
     +7 and again at +10. Worn gear glows at its body part; the sword glows
     along the blade (slung on the back, js/gear.js) or at the hand.
   - Mats: Iron Ingot, Gold Ingot (+4 on), Crystal Shard (+6 on), Golem
     Core (+9 on). Ingots come from the hidden chests (js/treasure.js) and
     now also drop, rarely, from the rock mobs.
   Upgrades are per item TYPE (the inventory stacks by type), saved as
   player.upgrades = { [type]: { lvl, el } }.
================================================================= */

const UPGRADE_MAX = 10;
// Per request ("gagana lang yun or konti konting umiilaw ... depende sa ups pinaka malakas ... +10"): the
// glow starts faint at +1 and grows every level; +10 is the strongest.
const UPGRADE_AURA_FROM = 1;
const UPGRADE_ELEMENTS = {
  lightning: { name: "Lightning", icon: "⚡", glow: [120, 170, 255], core: "#eef6ff", edge: "rgba(110,150,255,0.85)" },
  fire:      { name: "Fire",      icon: "🔥", glow: [255, 110, 30],  core: "#ffe08a", edge: "rgba(255,90,20,0.9)" },
  holy:      { name: "Holy",      icon: "✨", glow: [255, 214, 70],  core: "#fff6c2", edge: "rgba(255,200,40,0.9)" },
  ice:       { name: "Ice",       icon: "❄️", glow: [120, 220, 255], core: "#f0fdff", edge: "rgba(120,210,255,0.9)" },
  wind:      { name: "Wind",      icon: "🌪️", glow: [140, 255, 190], core: "#f2fff6", edge: "rgba(150,255,200,0.85)" },
};
const UPGRADE_GEAR_KINDS = new Set(["helmet", "armor", "gauntlet", "boots"]);
const UPGRADE_SPOTS = { helmet: [[32, 18]], armor: [[29, 34], [35, 34]], gauntlet: [[37, 39]], boots: [[29, 47], [35, 47]] }; // 64px frame coords

function isUpgradable(type) {
  const d = itemDefs[type];
  if (!d) return false;
  if (d.weapon && /Sword|Bow/.test(type) && d.weapon.damage) return true;
  return !!(d.gear && UPGRADE_GEAR_KINDS.has(d.gear.kind));
}
function upgradeOf(type) {
  const u = player.upgrades && player.upgrades[type];
  return u ? u : { lvl: 0, el: null };
}
function upgradeLevel(type) { return type ? upgradeOf(type).lvl || 0 : 0; }

// Rock mobs drop ingots now and then too, so the mats aren't only in the hidden chests.
if (typeof MINE_TYPES !== "undefined") {
  const add = (mob, drop) => { if (MINE_TYPES[mob] && MINE_TYPES[mob].drops && !MINE_TYPES[mob].drops.some((d) => d[0] === drop[0])) MINE_TYPES[mob].drops.push(drop); };
  add("beetle", ["ironIngot", 1, 1, 0.15]);
  add("golem", ["ironIngot", 1, 2, 0.3]); add("golem", ["goldIngot", 1, 1, 0.1]);
  add("golemBoss", ["goldIngot", 2, 4, 1]);
  add("bossGolem", ["goldIngot", 2, 3, 1]);
  add("soldier", ["ironIngot", 1, 1, 0.2]);
}

/* ---------------- success rate + ores ----------------
   Per request ("kapag 1-5 100% yung success kapag 6-10 medyo bumababa na yung success rate dapat
   may kailangan na ore para dagdag percent may 100% meron 50% meron 20%"):
     +1..+5 always succeed; +6 80%, +7 65%, +8 50%, +9 35%, +10 25%.
     One ore per try raises it: Luck Ore +20%, Fortune Ore +50%, Divine Ore = 100% (sure).
   A failed try uses up the gold, mats and ore; the item keeps its level (never goes down).
   Ores: the Blacksmith sells Luck (250) and Fortune (1200); chests and bosses drop them;
   Divine only from bosses and the rarest chests. */
const UPGRADE_RATE = { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 80, 7: 65, 8: 50, 9: 35, 10: 25 };
const UPGRADE_ORES = { oreLuck: { add: 20, name: "Luck Ore" }, oreFortune: { add: 50, name: "Fortune Ore" }, oreDivine: { add: 100, name: "Divine Ore", sure: true } };
let upgradeOre = null; // the ore picked in the window for the next try
function upgradeChance(toLvl, ore) {
  const base = UPGRADE_RATE[toLvl] || 100;
  const O = ore && UPGRADE_ORES[ore];
  if (!O) return base;
  return O.sure ? 100 : Math.min(100, base + O.add);
}
if (typeof SMITH_STOCK !== "undefined") {
  if (!SMITH_STOCK.some((e) => e.type === "oreLuck")) SMITH_STOCK.splice(0, 0, { type: "oreLuck", price: 250 }, { type: "oreFortune", price: 1200 });
}
setTimeout(() => { // these live in scripts loaded after this one
  if (typeof TREASURE_LOOT !== "undefined") TREASURE_LOOT.push(["oreLuck", 1, 2, 5, 1], ["oreFortune", 1, 1, 1.6, 4], ["oreDivine", 1, 1, 0.35, 8]);
if (typeof MINE_TYPES !== "undefined") for (const m of Object.values(MINE_TYPES)) {
  if (!m.boss || !m.drops) continue;
  if (!m.drops.some((d) => d[0] === "oreFortune")) m.drops.push(["oreFortune", 1, 2, 0.5]);
  if (!m.drops.some((d) => d[0] === "oreDivine")) m.drops.push(["oreDivine", 1, 1, 0.12]);
}
if (typeof ITEM_DESC !== "undefined") {
  ITEM_DESC.oreLuck = "+20% success sa isang upgrade (+6 pataas) sa Blacksmith.";
  ITEM_DESC.oreFortune = "+50% success sa isang upgrade (+6 pataas) sa Blacksmith.";
  ITEM_DESC.oreDivine = "Siguradong 100% success sa isang upgrade. Napakabihira — galing sa boss.";
}
}, 0);

/* ---------------- cost + stats ---------------- */
function upgradeCost(type, toLvl) {
  const d = itemDefs[type];
  const req = (d && (d.reqLevel || (d.weapon && d.weapon.reqLevel))) || 1;
  const f = 1 + req / 12;
  const mats = [["ironIngot", Math.ceil(toLvl * 1.5)]];
  if (toLvl >= 4) mats.push(["goldIngot", toLvl - 2]);
  if (toLvl >= 6) mats.push(["crystalShard", toLvl - 4]);
  if (toLvl >= 9) mats.push(["golemCore", toLvl - 7]);
  return { gold: Math.round(40 * toLvl * toLvl * f), mats };
}
// What +lvl adds on top of the piece's own numbers.
function upgradeBonus(type, lvl) {
  const d = itemDefs[type], out = { atk: 0, def: 0, mres: 0 };
  if (!d || !lvl) return out;
  if (d.weapon && d.weapon.damage) out.atk += Math.round(d.weapon.damage * 0.1 * lvl);
  const g = d.gear;
  if (g) {
    out.atk += Math.round((g.atk || 0) * 0.1 * lvl);
    out.def += Math.round((g.def || 0) * 0.1 * lvl) + (g.def ? Math.floor(lvl / 2) : 0);
    out.mres += Math.round((g.mres || 0) * 0.1 * lvl);
  }
  return out;
}
function wornUpgradables() {
  const out = [];
  if (player.equippedWeapon && isUpgradable(player.equippedWeapon) && !itemLocked(player.equippedWeapon)) out.push(["weapon", player.equippedWeapon]);
  for (const slot of ["helmet", "armor", "gauntlet", "boots"]) {
    const t = player.equipment && player.equipment[slot];
    if (t && isUpgradable(t) && !itemLocked(t)) out.push([slot, t]);
  }
  return out;
}
{
  const base = playerStats;
  playerStats = function () {
    const s = base.apply(this, arguments);
    for (const [, t] of wornUpgradables()) {
      const b = upgradeBonus(t, upgradeLevel(t));
      s.atk += b.atk; s.def += b.def; s.mres += b.mres;
    }
    s.defPct = s.def / (s.def + 100); s.mresPct = s.mres / (s.mres + 100);
    return s;
  };
}

/* ---------------- save ---------------- */
{
  const saveBase = buildSaveData;
  buildSaveData = function () { const d = saveBase.apply(this, arguments); if (player.upgrades) d.upgrades = player.upgrades; d.plus10Given = !!player.plus10Given; return d; };
  const loadBase = applySaveData;
  applySaveData = function (data) {
    const r = loadBase.apply(this, arguments);
    player.upgrades = data && data.upgrades && typeof data.upgrades === "object" ? data.upgrades : {};
    player.plus10Given = !!(data && data.plus10Given);
    grantWornPlus10();
    return r;
  };
}

// Per request ("yung naka suot sakin lagyan mo na ng +10 each tyaka weapon at bow"): once, everything
// you're wearing (helmet, armor, gauntlet, boots), your equipped weapon and every bow you own go to +10.
function grantWornPlus10() {
  if (player.plus10Given) return;
  player.plus10Given = true;
  player.upgrades = player.upgrades || {};
  const give = new Set();
  for (const slot of ["helmet", "armor", "gauntlet", "boots"]) { const t = player.equipment && player.equipment[slot]; if (t && isUpgradable(t)) give.add(t); }
  if (player.equippedWeapon && isUpgradable(player.equippedWeapon)) give.add(player.equippedWeapon);
  for (const t of Object.keys(itemDefs)) if (/Bow$/.test(t) && isUpgradable(t) && ownedCount(t) > 0) give.add(t);
  for (const t of give) player.upgrades[t] = { lvl: 10, el: (player.upgrades[t] && player.upgrades[t].el) || "lightning" };
  if (give.size && typeof showToast === "function") setTimeout(() => showToast("+10 na ang suot mong gear, weapon at mga bow!"), 1500);
}

/* ---------------- the upgrade window ---------------- */
let upgradeOverlay = null, upgradeSelected = null;
function iconSrc(type) {
  const ic = type === "goldCoin" ? assets.mob_goldCoin : itemDefs[type] && itemDefs[type].icon;
  if (!ic) return "";
  if (ic.src) return ic.src;
  try { return ic.toDataURL(); } catch (e) { return ""; }
}
function buildUpgradeWindow() {
  upgradeOverlay = document.createElement("div");
  upgradeOverlay.id = "upgrade-overlay";
  upgradeOverlay.className = "hidden";
  upgradeOverlay.innerHTML =
    '<div id="upgrade-panel">' +
    '<div class="upg-title">⚒ Blacksmith — Upgrade <span class="hint">(click outside to close)</span></div>' +
    '<div class="upg-gold">Your gold: <span id="upg-gold">0</span> 💰</div>' +
    '<div id="upg-list"></div>' +
    '<div id="upg-detail"></div>' +
    "</div>";
  document.body.appendChild(upgradeOverlay);
  upgradeOverlay.addEventListener("click", (e) => { if (e.target === upgradeOverlay) closeUpgradeWindow(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeUpgradeWindow(); });
}
function openUpgradeWindow() {
  if (!upgradeOverlay) buildUpgradeWindow();
  upgradeOverlay.classList.remove("hidden");
  renderUpgradeWindow();
}
function closeUpgradeWindow() { if (upgradeOverlay) upgradeOverlay.classList.add("hidden"); }
function upgradeCandidates() {
  const worn = new Set(wornUpgradables().map(([, t]) => t));
  return Object.keys(itemDefs).filter((t) => isUpgradable(t) && (ownedCount(t) > 0 || worn.has(t)))
    .sort((a, b) => (worn.has(b) - worn.has(a)) || (upgradeLevel(b) - upgradeLevel(a)));
}
function renderUpgradeWindow() {
  if (!upgradeOverlay) return;
  document.getElementById("upg-gold").textContent = player.gold || 0;
  const list = document.getElementById("upg-list"), det = document.getElementById("upg-detail");
  const items = upgradeCandidates();
  if (!upgradeSelected || !items.includes(upgradeSelected)) upgradeSelected = items[0] || null;
  const worn = new Set(wornUpgradables().map(([, t]) => t));
  list.innerHTML = "";
  if (!items.length) list.innerHTML = '<div class="upg-empty">Wala kang sword, bow, helmet, armor, gauntlet o boots na pwedeng i-upgrade.</div>';
  for (const t of items) {
    const u = upgradeOf(t), el = u.el && UPGRADE_ELEMENTS[u.el];
    const row = document.createElement("div");
    row.className = "upg-row" + (t === upgradeSelected ? " sel" : "");
    row.dataset.itemType = t;
    row.innerHTML = '<img src="' + iconSrc(t) + '"><span class="n">' + itemDefs[t].name + (worn.has(t) ? ' <i>(suot)</i>' : "") +
      '</span><span class="lv">' + (el && u.lvl >= UPGRADE_AURA_FROM ? el.icon + " " : "") + "+" + (u.lvl || 0) + "</span>";
    row.addEventListener("click", () => { upgradeSelected = t; renderUpgradeWindow(); });
    list.appendChild(row);
  }
  det.innerHTML = "";
  if (!upgradeSelected) return;
  const t = upgradeSelected, u = upgradeOf(t), lvl = u.lvl || 0, d = itemDefs[t];
  const now = upgradeBonus(t, lvl), next = upgradeBonus(t, Math.min(UPGRADE_MAX, lvl + 1));
  const statLine = (b) => [b.atk && "ATK +" + b.atk, b.def && "DEF +" + b.def, b.mres && "MRES +" + b.mres].filter(Boolean).join(", ") || "—";
  let html = '<div class="upg-head"><img src="' + iconSrc(t) + '"><div><b>' + d.name + " +" + lvl + "</b>" +
    (lvl < UPGRADE_MAX ? ' → <b class="up">+' + (lvl + 1) + "</b>" : ' <b class="up">(MAX)</b>') +
    '<div class="sub">Bonus ngayon: ' + statLine(now) + (lvl < UPGRADE_MAX ? "<br>Sa +" + (lvl + 1) + ": " + statLine(next) : "") + "</div></div></div>";
  let can = lvl < UPGRADE_MAX;
  if (lvl < UPGRADE_MAX) {
    const c = upgradeCost(t, lvl + 1);
    html += '<div class="upg-cost">';
    const okG = (player.gold || 0) >= c.gold; if (!okG) can = false;
    html += '<span class="' + (okG ? "ok" : "no") + '"><img src="' + iconSrc("goldCoin") + '"> ' + (player.gold || 0) + "/" + c.gold + "</span>";
    for (const [m, n] of c.mats) {
      const have = ownedCount(m), ok = have >= n; if (!ok) can = false;
      html += '<span class="' + (ok ? "ok" : "no") + '" title="' + (itemDefs[m] ? itemDefs[m].name : m) + '"><img src="' + iconSrc(m) + '"> ' + have + "/" + n + "</span>";
    }
    html += "</div>";
  }
  if (lvl < UPGRADE_MAX) {
    const base = UPGRADE_RATE[lvl + 1] || 100;
    if (upgradeOre && ownedCount(upgradeOre) < 1) upgradeOre = null;
    const ch = upgradeChance(lvl + 1, upgradeOre);
    html += '<div class="upg-rate">Success rate: <b class="' + (ch >= 100 ? "ok" : ch >= 50 ? "mid" : "low") + '">' + ch + "%</b>" + (upgradeOre ? ' <span class="hint">(base ' + base + "% + " + UPGRADE_ORES[upgradeOre].name + ")</span>" : "") + "</div>";
    if (base < 100) {
      html += '<div class="upg-ores"><button data-ore="" class="' + (!upgradeOre ? "on" : "") + '">Walang ore</button>';
      for (const [id, O] of Object.entries(UPGRADE_ORES)) {
        const have = ownedCount(id);
        html += '<button data-ore="' + id + '" data-item-type="' + id + '" class="' + (upgradeOre === id ? "on" : "") + '"' + (have ? "" : " disabled") + '><img src="' + iconSrc(id) + '"> ' + (O.sure ? "100%" : "+" + O.add + "%") + ' <span class="have">x' + have + "</span></button>";
      }
      html += "</div>";
    } else html += '<div class="upg-rate hint">+1 hanggang +5: laging successful.</div>';
  }
  html += '<div class="upg-el-label">Aura — mahina sa +1, lumalakas bawat level, pinakamalakas sa +10:</div><div class="upg-els">';
  for (const [id, e] of Object.entries(UPGRADE_ELEMENTS)) html += '<button data-el="' + id + '" class="' + (u.el === id ? "on" : "") + '">' + e.icon + " " + e.name + "</button>";
  html += "</div>";
  html += '<button id="upg-go"' + (can ? "" : " disabled") + ">" + (lvl >= UPGRADE_MAX ? "MAX na" : "⚒ Upgrade to +" + (lvl + 1)) + "</button>";
  det.innerHTML = html;
  det.querySelectorAll(".upg-els button").forEach((b) => b.addEventListener("click", () => {
    player.upgrades = player.upgrades || {};
    const cur = upgradeOf(t);
    player.upgrades[t] = { lvl: cur.lvl || 0, el: b.dataset.el };
    if (typeof saveGame === "function") saveGame();
    renderUpgradeWindow();
  }));
  det.querySelectorAll(".upg-ores button").forEach((b) => b.addEventListener("click", () => { upgradeOre = b.dataset.ore || null; renderUpgradeWindow(); }));
  const go = document.getElementById("upg-go");
  if (go) go.addEventListener("click", () => doUpgrade(t));
}
function upgradeFlash(kind) {
  const p = document.getElementById("upgrade-panel");
  if (!p) return;
  p.classList.remove("flash-ok", "flash-fail"); void p.offsetWidth; p.classList.add(kind === "ok" ? "flash-ok" : "flash-fail");
}
function takeItems(type, n) {
  const slot = inventory.find((s) => s && s.type === type);
  if (!slot || slot.count < n) return false;
  slot.count -= n;
  return true;
}
function doUpgrade(t) {
  const u = upgradeOf(t), lvl = u.lvl || 0;
  if (lvl >= UPGRADE_MAX) return;
  const c = upgradeCost(t, lvl + 1);
  if ((player.gold || 0) < c.gold || c.mats.some(([m, n]) => ownedCount(m) < n)) { if (typeof showToast === "function") showToast("Kulang ang gold o materials"); return; }
  const ore = (UPGRADE_RATE[lvl + 1] || 100) < 100 && upgradeOre && ownedCount(upgradeOre) > 0 ? upgradeOre : null;
  const chance = upgradeChance(lvl + 1, ore);
  player.gold -= c.gold;
  for (const [m, n] of c.mats) takeItems(m, n);
  if (ore) { takeItems(ore, 1); if (ownedCount(ore) < 1) upgradeOre = null; }
  player.upgrades = player.upgrades || {};
  if (Math.random() * 100 >= chance) { // failed: everything spent, the level stays
    if (typeof renderGoldDisplays === "function") renderGoldDisplays();
    if (typeof renderHotbar === "function") renderHotbar();
    if (typeof renderInventory === "function") renderInventory();
    if (typeof showToast === "function") showToast("Nabigo ang upgrade (" + chance + "%)... nanatili sa +" + lvl + " ang " + itemDefs[t].name);
    upgradeFlash("fail");
    if (typeof saveGame === "function") saveGame();
    renderUpgradeWindow();
    return;
  }
  upgradeFlash("ok");
  player.upgrades[t] = { lvl: lvl + 1, el: u.el || "lightning" };
  if (typeof renderGoldDisplays === "function") renderGoldDisplays();
  if (typeof renderHotbar === "function") renderHotbar();
  if (typeof renderInventory === "function") renderInventory();
  if (typeof showToast === "function") showToast(itemDefs[t].name + " ay +" + (lvl + 1) + " na!" + (lvl + 1 === 1 ? " May mahinang aura na siya." : lvl + 1 === 10 ? " MAX — pinakamalakas na aura!" : ""));
  if (typeof saveGame === "function") saveGame();
  renderUpgradeWindow();
}
// The "⚒ Upgrade" button in the Blacksmith's shop popup.
{
  const base = openNpcShop;
  openNpcShop = function () {
    const r = base.apply(this, arguments);
    const panel = document.getElementById("npc-shop-panel");
    if (panel) {
      let btn = document.getElementById("npc-shop-upgrade");
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "npc-shop-upgrade";
        btn.textContent = "⚒ Upgrade (sword, bow, helmet, armor, gauntlet, boots)";
        btn.addEventListener("click", () => { closeNpcShop(); openUpgradeWindow(); });
        const grid = document.getElementById("npc-shop-grid");
        panel.insertBefore(btn, grid);
      }
      const k = typeof shopKeeperHere === "function" ? shopKeeperHere() : null;
      btn.style.display = k && k.name === "Blacksmith" ? "" : "none";
    }
    return r;
  };
}

/* ---------------- the auras ---------------- */
let backWeaponLine = null; // set by drawHeldSword() (js/gear.js) each frame it draws: the blade, screen px
function upgradeAuras() {
  if (player.sleeping || player.sitting) return [];
  const out = [];
  for (const [slot, t] of wornUpgradables()) {
    const u = upgradeOf(t);
    if ((u.lvl || 0) < UPGRADE_AURA_FROM || !u.el || !UPGRADE_ELEMENTS[u.el]) continue;
    const lv = Math.min(10, u.lvl);
    out.push({ slot, el: u.el, lvl: lv, f: lv / 10, q: 1 + 2 * (lv - 1) / 9, n: lv <= 3 ? 1 : lv <= 7 ? 2 : 3 });
  }
  return out;
}
function auraPoints(a, screenX, screenY, z) {
  const k = (DRAW_SIZE / 64) * z, flip = player.facing === "left";
  const P = (sx, sy) => [screenX + (flip ? 32 - sx : sx - 32) * k, screenY + (sy - 32) * k];
  if (a.slot === "weapon") {
    const L = backWeaponLine;
    if (L && performance.now() - L.at < 120) {
      const pts = [];
      for (let i = 0; i <= 2; i++) pts.push([L.x0 + (L.x1 - L.x0) * (0.25 + i * 0.35), L.y0 + (L.y1 - L.y0) * (0.25 + i * 0.35)]);
      return pts;
    }
    return [P(37, 39)];
  }
  return (UPGRADE_SPOTS[a.slot] || []).map(([x, y]) => P(x, y));
}
function upgRand(seed) { let s = seed | 0; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
function drawAuraBehind(auras, screenX, screenY, z) {
  const k = (DRAW_SIZE / 64) * z, t = performance.now() / 1000;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const a of auras) {
    const E = UPGRADE_ELEMENTS[a.el], [r, g, b] = E.glow;
    const pts = auraPoints(a, screenX, screenY, z);
    const rad = (a.slot === "armor" ? 10 + 8 * a.f : 5 + 6 * a.f) * (a.lvl >= 10 ? 1.3 : 1) * k;
    for (const [x, y] of pts) {
      const al = (0.025 + 0.13 * a.f) * (0.85 + 0.15 * Math.sin(t * 3 + x));
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, "rgba(" + r + "," + g + "," + b + "," + al + ")"); gr.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)");
      ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  ctx.restore();
}
function drawAuraFront(auras, screenX, screenY, z) {
  const k = (DRAW_SIZE / 64) * z, t = performance.now() / 1000;
  ctx.save();
  for (const a of auras) {
    const E = UPGRADE_ELEMENTS[a.el];
    const pts = auraPoints(a, screenX, screenY, z);
    pts.forEach(([x, y], pi) => {
      const n = a.n; // particles per point (1 / 2 / 3)
      // low levels: the effect only flickers now and then; at +10 it never stops
      if (((t * 0.7 + pi * 0.37 + a.slot.length * 0.11) % 1) > 0.2 + 0.8 * a.f) return;
      ctx.globalAlpha = 0.35 + 0.65 * a.f;
      if (a.el === "lightning") {
        const rnd = upgRand(Math.floor(t * 11) * 977 + pi * 131 + a.slot.length * 17);
        for (let i = 0; i < n; i++) {
          if (rnd() < 0.85 - 0.35 * a.f) continue;
          let px = x + (rnd() - 0.5) * 6 * k, py = y + (rnd() - 0.5) * 6 * k, ang = rnd() * Math.PI * 2;
          const pts2 = [[px, py]];
          for (let j = 0; j < 3 + a.q; j++) { const aa = ang + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.8); const L = (1.4 + rnd()) * k; px += Math.cos(aa) * L; py += Math.sin(aa) * L; pts2.push([px, py]); }
          ctx.strokeStyle = E.edge; ctx.lineWidth = Math.max(1.4, k * 1.4);
          ctx.beginPath(); pts2.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
          ctx.strokeStyle = E.core; ctx.lineWidth = Math.max(1, k * 0.6);
          ctx.beginPath(); pts2.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
        }
      } else if (a.el === "fire") {
        for (let i = 0; i < n; i++) {
          const ph = (t * 1.4 + i / n + pi * 0.31) % 1;
          const fx = x + Math.sin((ph * 6 + i * 2 + pi) * 1.3) * 2.2 * k, fy = y - ph * (8 + a.q * 2) * k;
          const sz = (1 - ph) * (1.4 + a.q * 0.5) * k;
          ctx.globalAlpha = 1 - ph;
          ctx.fillStyle = ph < 0.35 ? E.core : ph < 0.7 ? "#ff9a2e" : "#d8381c";
          ctx.fillRect(fx - sz / 2, fy - sz / 2, sz, sz * 1.3);
        }
      } else if (a.el === "holy") {
        for (let i = 0; i < n; i++) {
          const ph = (t * 0.8 + i / n + pi * 0.43) % 1;
          const sx = x + Math.cos(i * 2.4 + pi) * 4 * k, sy = y - ph * 7 * k;
          const r = Math.sin(ph * Math.PI) * (0.9 + a.q * 0.35) * k;
          ctx.globalAlpha = Math.sin(ph * Math.PI);
          ctx.fillStyle = E.core;
          ctx.beginPath(); ctx.moveTo(sx, sy - r * 1.6); ctx.lineTo(sx + r * 0.4, sy); ctx.lineTo(sx, sy + r * 1.6); ctx.lineTo(sx - r * 0.4, sy); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(sx - r * 1.6, sy); ctx.lineTo(sx, sy + r * 0.4); ctx.lineTo(sx + r * 1.6, sy); ctx.lineTo(sx, sy - r * 0.4); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#ffd640"; ctx.fillRect(sx + 3 * k * Math.sin(ph * 9), sy + 2 * k, 0.8 * k, 0.8 * k);
        }
      } else if (a.el === "ice") {
        for (let i = 0; i < n; i++) {
          const ph = (t * 0.7 + i / n + pi * 0.37) % 1;
          const sx = x + Math.sin(i * 1.9 + pi + t) * 4 * k, sy = y - 3 * k + ph * 8 * k;
          const r = (0.6 + a.q * 0.25) * k;
          ctx.globalAlpha = Math.sin(ph * Math.PI);
          ctx.fillStyle = E.core; ctx.strokeStyle = "rgba(110,200,255,0.9)"; ctx.lineWidth = Math.max(1, k * 0.4);
          ctx.beginPath(); ctx.moveTo(sx, sy - r * 1.5); ctx.lineTo(sx + r, sy); ctx.lineTo(sx, sy + r * 1.5); ctx.lineTo(sx - r, sy); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      } else if (a.el === "wind") {
        ctx.lineWidth = Math.max(1, k * 0.6);
        for (let i = 0; i < n; i++) {
          const rot = t * (3 + i) + i * 2.1 + pi;
          const rr = (3 + i * 1.6) * k;
          ctx.globalAlpha = 0.75;
          ctx.strokeStyle = i % 2 ? E.core : E.edge;
          ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.45, 0, rot, rot + 1.6); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    });
  }
  ctx.restore();
}
{
  const base = drawPlayer;
  drawPlayer = function (screenX, screenY, z) {
    const auras = upgradeAuras();
    const A = auras.length ? bodyAura(auras) : null;
    if (A) { drawBodyAuraGlow(A, screenX, screenY, z); drawBladeGlow(A, auras, z); }
    const r = base.apply(this, arguments);
    if (A) drawAuraBursts(A, screenX, screenY, z);
    return r;
  };
}

/* ---------------- the body aura ----------------
   Per request ("kahit minsanan lang mag lightning yung sa character pangit tignan mas ok kung aura
   tapos kumikidlat minsan yung aura is nag glowglow ganun din sa iba"): instead of loose sparks at
   each body part, the whole character now wears ONE glowing aura — its own silhouette, tinted the
   element's colour, blurred and breathing behind it — and the element's effect only flashes now and
   then over it (lightning arcs, embers, sparkles, frost, a gust). Stronger with the upgrades:
   the glow's size/brightness follow the best piece, every extra upgraded piece adds a little, and
   +10 glows the most and bursts the most often. The slung sword glows along its blade too. */
function bodyAura(auras) {
  const byEl = {};
  let best = auras[0];
  for (const a of auras) { byEl[a.el] = (byEl[a.el] || 0) + a.lvl; if (a.lvl > best.lvl) best = a; }
  const el = Object.entries(byEl).sort((x, y) => y[1] - x[1])[0][0];
  const total = auras.reduce((s, a) => s + a.lvl, 0);
  const f = Math.min(1, best.lvl / 10 * 0.75 + Math.min(1, total / 50) * 0.25); // 0..1
  return { el, f, lvl: best.lvl };
}
const auraSilCanvas = document.createElement("canvas");
function drawBodyAuraGlow(A, screenX, screenY, z) {
  if (player.sleeping || player.sitting) return;
  const E = UPGRADE_ELEMENTS[A.el], [r, g, b] = E.glow, t = performance.now() / 1000;
  const size = DRAW_SIZE * z, W = Math.ceil(size * 1.6), H = Math.ceil(size * 1.6);
  if (auraSilCanvas.width !== W || auraSilCanvas.height !== H) { auraSilCanvas.width = W; auraSilCanvas.height = H; }
  const sg = auraSilCanvas.getContext("2d");
  sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalCompositeOperation = "source-over"; sg.clearRect(0, 0, W, H); sg.imageSmoothingEnabled = false;
  drawPlayerSprite(W / 2, H / 2, z, sg);
  sg.globalCompositeOperation = "source-in"; sg.fillStyle = "rgb(" + r + "," + g + "," + b + ")"; sg.fillRect(0, 0, W, H);
  const breathe = 0.75 + 0.25 * Math.sin(t * 2.6) + 0.08 * Math.sin(t * 7.3);
  const k = (DRAW_SIZE / 64) * z;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // a wide soft halo, then a tighter bright rim
  const spread = 1.06 + 0.1 * A.f;
  ctx.filter = "blur(" + Math.max(1, (2.5 + 4 * A.f) * k).toFixed(1) + "px)";
  ctx.globalAlpha = Math.min(1, (0.25 + 0.55 * A.f) * breathe);
  ctx.drawImage(auraSilCanvas, screenX - W * spread / 2, screenY - H * spread / 2 - 1.5 * k, W * spread, H * spread);
  ctx.filter = "blur(" + Math.max(0.6, 1.2 * k).toFixed(1) + "px)";
  ctx.globalAlpha = Math.min(1, (0.2 + 0.5 * A.f) * breathe);
  ctx.drawImage(auraSilCanvas, screenX - W / 2, screenY - H / 2, W, H);
  ctx.filter = "none";
  // a faint glow on the ground
  const gy = screenY + (SPRITE_FEET_FRACTION - 0.5) * size;
  const gr = ctx.createRadialGradient(screenX, gy, 0, screenX, gy, (10 + 8 * A.f) * k);
  gr.addColorStop(0, "rgba(" + r + "," + g + "," + b + "," + (0.25 * A.f * breathe).toFixed(3) + ")"); gr.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)");
  ctx.globalAlpha = 1; ctx.fillStyle = gr;
  ctx.beginPath(); ctx.ellipse(screenX, gy, (10 + 8 * A.f) * k, (4 + 3 * A.f) * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// the slung blade glows in the weapon's own element (behind the body, like the sword)
function drawBladeGlow(A, auras, z) {
  const w = auras.find((a) => a.slot === "weapon");
  const L = backWeaponLine;
  if (!w || !L || performance.now() - L.at > 150) return;
  const E = UPGRADE_ELEMENTS[w.el], [r, g, b] = E.glow, t = performance.now() / 1000, k = (DRAW_SIZE / 64) * z;
  ctx.save();
  ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
  ctx.filter = "blur(" + Math.max(1, 2 * k).toFixed(1) + "px)";
  ctx.strokeStyle = "rgba(" + r + "," + g + "," + b + "," + ((0.3 + 0.5 * w.f) * (0.8 + 0.2 * Math.sin(t * 3.4))).toFixed(3) + ")";
  ctx.lineWidth = (2 + 3 * w.f) * k;
  ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(L.x1, L.y1); ctx.stroke();
  ctx.restore();
}
// the element flashing over the aura now and then
function drawAuraBursts(A, screenX, screenY, z) {
  if (player.sleeping || player.sitting) return;
  const E = UPGRADE_ELEMENTS[A.el], t = performance.now() / 1000, k = (DRAW_SIZE / 64) * z;
  const every = 2.6 - 1.8 * A.f;            // seconds between bursts: +1 ~2.5s, +10 ~0.8s
  const slot = Math.floor(t / every), into = t - slot * every, len = 0.18 + 0.25 * A.f;
  if (into > len) return;
  const p = into / len;                       // 0..1 through the burst
  const rnd = upgRand(slot * 7919 + A.el.length * 31);
  // points round the body's outline (64px frame coords)
  const RING = [[24, 20], [40, 20], [21, 32], [43, 32], [23, 42], [41, 42], [32, 13], [28, 47], [36, 47]];
  const P = (sx, sy) => [screenX + (sx - 32) * k, screenY + (sy - 32) * k];
  const n = 1 + Math.round(2 * A.f);
  ctx.save();
  ctx.globalAlpha = Math.sin(p * Math.PI) * (0.55 + 0.45 * A.f);
  for (let i = 0; i < n; i++) {
    const [sx, sy] = RING[Math.floor(rnd() * RING.length)];
    const [x, y] = P(sx, sy);
    const out = Math.atan2(sy - 32, sx - 32);
    if (A.el === "lightning") {
      let px = x, py = y, ang = out + (rnd() - 0.5) * 1.2;
      const pts = [[px, py]];
      const seg = 4 + Math.round(2 * A.f);
      for (let j = 0; j < seg; j++) { ang += (rnd() - 0.5) * 1.4; const Ls = (1.6 + rnd() * 1.4) * k; px += Math.cos(ang) * Ls; py += Math.sin(ang) * Ls; pts.push([px, py]); }
      ctx.lineJoin = "miter";
      ctx.strokeStyle = E.edge; ctx.lineWidth = Math.max(1.5, k * 1.5);
      ctx.beginPath(); pts.forEach((q, j) => (j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
      ctx.strokeStyle = E.core; ctx.lineWidth = Math.max(1, k * 0.6);
      ctx.beginPath(); pts.forEach((q, j) => (j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
    } else if (A.el === "fire") {
      for (let e = 0; e < 3; e++) {
        const ex = x + (rnd() - 0.5) * 5 * k, ey = y - p * (6 + 6 * A.f) * k - e * 2 * k, sz = (1.6 - p) * (1 + A.f * 0.6) * k;
        ctx.fillStyle = e === 0 ? E.core : e === 1 ? "#ff9a2e" : "#d8381c";
        ctx.fillRect(ex - sz / 2, ey - sz / 2, sz, sz * 1.3);
      }
    } else if (A.el === "holy") {
      const r = (1 + A.f) * k * Math.sin(p * Math.PI) * 1.4;
      ctx.fillStyle = E.core;
      ctx.beginPath(); ctx.moveTo(x, y - r * 1.7); ctx.lineTo(x + r * 0.35, y); ctx.lineTo(x, y + r * 1.7); ctx.lineTo(x - r * 0.35, y); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - r * 1.7, y); ctx.lineTo(x, y + r * 0.35); ctx.lineTo(x + r * 1.7, y); ctx.lineTo(x, y - r * 0.35); ctx.closePath(); ctx.fill();
    } else if (A.el === "ice") {
      const r = (0.8 + 0.5 * A.f) * k, dy = p * 5 * k;
      ctx.fillStyle = E.core; ctx.strokeStyle = "rgba(110,200,255,0.9)"; ctx.lineWidth = Math.max(1, k * 0.4);
      for (let e = 0; e < 2; e++) {
        const ix = x + (e ? 3 : -2) * k, iy = y + dy + e * 2 * k;
        ctx.beginPath(); ctx.moveTo(ix, iy - r * 1.6); ctx.lineTo(ix + r, iy); ctx.lineTo(ix, iy + r * 1.6); ctx.lineTo(ix - r, iy); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else if (A.el === "wind") {
      ctx.strokeStyle = i % 2 ? E.core : E.edge; ctx.lineWidth = Math.max(1, k * 0.7);
      const rr = (5 + 6 * A.f) * k, rot = out + p * 2.5;
      ctx.beginPath(); ctx.ellipse(screenX, screenY + 4 * k, rr * 1.6, rr * 0.5, 0, rot, rot + 1.8); ctx.stroke();
    }
  }
  ctx.restore();
}
