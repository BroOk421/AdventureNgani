"use strict";

/* =================================================================
   GEAR, STATS, PROFILE (P), CLICK-TO-ATTACK and the WARP PORTALS.

   Per request ("pag atk gawin sa mobs is 1 click tapos automatic ng mag
   atk depende sa atk speed dmg def ... press P pang profile ... nakapaligid
   sa kanya yung armor weapon ... sa gitna is yung idle na front sa taas
   nun helmet sa left side 1 gauntlet sa baba nun 1 ring at baba nun is
   shield ... sa right same lang gauntlet ... ring ... sword ... sa ilalim
   ng paa ng idle is boots ... stats nasa gilid nun ... health, stamina,
   foods, exp at level ... descriptions ng stats"; and "dagdag ka pa map ...
   parang cross portal ... medyo gilid ... hanggang level 80"):

   STATS (playerStats()): ATK = 3 bare / the weapon's damage + gauntlets +
   rings; DEF = every armour piece (each point blocks 0.6 of a mob's hit);
   SPD = attacks per second (1.0, +boots, Wood Sword a little quicker),
   which also speeds up the swing; CRIT = 12% + rings (x1.8 damage). Mobs
   have DEF too (0.6 per level, half of it blocked from each of your hits).
   EQUIPMENT: player.equipment = { helmet, gauntletL, gauntletR, ringL,
   ringR, shield, boots } (+ the weapon, player.equippedWeapon). Items carry
   reqLevel; locked ones can't be bought or worn. Saved with the game.
   PROFILE: P (or the window's ✕ / Esc) — the idle front sprite in the
   middle, the slots round it, stats with descriptions beside it. Click a
   slot to pick from what you own (or take it off).
   CLICK-TO-ATTACK: left-click a mob — the player walks up to it and keeps
   attacking at their attack speed until it dies; any movement key stops.
   PORTALS: the far worlds (east3-east6, Lv 12-80) have no passes — a warp
   portal set off to one side of each leads on (and one back). Walk up into
   it (W) to use it.
================================================================= */

// Per request the left gauntlet became the body ARMOR slot.
const GEAR_SLOTS = [
  { id: "helmet", kind: "helmet", label: "Helmet" },
  { id: "armor", kind: "armor", label: "Armor" },
  { id: "gauntlet", kind: "gauntlet", label: "Gauntlet" },
  { id: "ringL", kind: "ring", label: "Ring" },
  { id: "ringR", kind: "ring", label: "Ring" },
  { id: "shield", kind: "shield", label: "Shield" },
  { id: "boots", kind: "boots", label: "Boots" },
];
if (!player.equipment) player.equipment = {};

function itemReqLevel(type) {
  const d = itemDefs[type];
  return d ? (d.weapon && d.weapon.reqLevel) || d.reqLevel || 1 : 1;
}
function itemLocked(type) { return itemReqLevel(type) > (player.level || 1); }
function ownedCount(type) { const s = inventory.find((x) => x && x.type === type); return s ? s.count : 0; }

/* ATTRIBUTES — per request ("kada level na uups like str, sta, agi, acc"):
   3 points per level, spent in the profile (P) with the + buttons.
   STR: +2 ATK each.  STA: +8 max health, +1 DEF, +0.8 MAGIC RES each.
   AGI: +0.02 attacks/second each.  ACC: +1.2% hit chance each (a mob above
   your level dodges more: -2.5% per level it's over you). */
if (!player.attrs) player.attrs = { str: 0, sta: 0, agi: 0, acc: 0 };
if (typeof player.statPoints !== "number") player.statPoints = Math.max(0, ((player.level || 1) - 1) * 3);
function playerHitChance(m) {
  const over = Math.max(0, (m ? m.level : player.level) - (player.level || 1));
  return Math.max(0.35, Math.min(0.99, 0.82 + player.attrs.acc * 0.012 - over * 0.025));
}
function spendStat(key) {
  if ((player.statPoints || 0) <= 0 || !(key in player.attrs)) return;
  player.statPoints--; player.attrs[key]++;
  if (key === "sta") { player.maxHealth += 8; player.health = Math.min(player.maxHealth, player.health + 8); }
  if (typeof saveGame === "function") saveGame();
  renderProfile();
}
function playerStats() {
  const w = player.equippedWeapon && itemDefs[player.equippedWeapon];
  const wOk = w && w.weapon && w.weapon.damage && !itemLocked(player.equippedWeapon);
  const s = { atk: wOk ? w.weapon.damage : 3, def: 0, mres: 0, spd: player.equippedWeapon === "woodSword" ? 1.15 : 1.0, crit: 0.12 };
  for (const slot of GEAR_SLOTS) {
    const t = player.equipment[slot.id], g = t && itemDefs[t] && itemDefs[t].gear;
    if (!g || itemLocked(t)) continue;
    s.atk += g.atk || 0; s.def += g.def || 0; s.mres += g.mres || 0; s.spd += g.spd || 0; s.crit += g.crit || 0;
  }
  const lv = Math.max(0, (player.level || 1) - 1); // the per-level bonus (js/mines.js LEVEL_ATK / LEVEL_DEF)
  s.atk += lv * (typeof LEVEL_ATK !== "undefined" ? LEVEL_ATK : 1); s.def += lv * (typeof LEVEL_DEF !== "undefined" ? LEVEL_DEF : 1);
  const A = player.attrs || { str: 0, sta: 0, agi: 0, acc: 0 };
  s.atk += A.str * 2; s.def += A.sta; s.mres += Math.round(A.sta * 0.8); s.spd += A.agi * 0.02;
  s.spd = Math.round(s.spd * 100) / 100; s.crit = Math.min(0.6, s.crit);
  s.hit = playerHitChance(null);
  // DEF RES / MAGIC RES: the share of a physical / magic hit that's blocked (diminishing, never 100%)
  s.defPct = s.def / (s.def + 100); s.mresPct = s.mres / (s.mres + 100);
  return s;
}
function equipGear(slotId, type) {
  const slot = GEAR_SLOTS.find((s) => s.id === slotId);
  if (!slot) return;
  if (type) {
    const d = itemDefs[type];
    if (!d || !d.gear || d.gear.kind !== slot.kind) return;
    if (itemLocked(type)) { showToast("Naka-lock pa — kailangan Level " + itemReqLevel(type)); return; }
    const twin = slot.id.endsWith("L") ? slot.id.slice(0, -1) + "R" : slot.id.endsWith("R") ? slot.id.slice(0, -1) + "L" : null;
    if (twin && player.equipment[twin] === type && ownedCount(type) < 2) { showToast("You only have one " + d.name + " — you need two"); return; }
    if (ownedCount(type) < 1) return;
  }
  player.equipment[slotId] = type || null;
  if (typeof saveGame === "function") saveGame();
  renderProfile();
}
// Selling / losing your last one takes it off.
setInterval(() => {
  for (const slot of GEAR_SLOTS) {
    const t = player.equipment[slot.id];
    if (t && ownedCount(t) < 1) player.equipment[slot.id] = null;
  }
}, 1500);

/* ---------------- save ---------------- */
{
  const saveBase = buildSaveData;
  buildSaveData = function () { const d = saveBase.apply(this, arguments); d.equipment = Object.assign({}, player.equipment); d.attrs = Object.assign({}, player.attrs); d.statPoints = player.statPoints; return d; };
  const loadBase = applySaveData;
  applySaveData = function (data) {
    const r = loadBase.apply(this, arguments);
    player.equipment = data && data.equipment && typeof data.equipment === "object" ? Object.assign({}, data.equipment) : {};
    if (player.equipment.gauntletR && !player.equipment.gauntlet) player.equipment.gauntlet = player.equipment.gauntletR; // old two-gauntlet layout
    delete player.equipment.gauntletL; delete player.equipment.gauntletR;
    player.attrs = data && data.attrs ? Object.assign({ str: 0, sta: 0, agi: 0, acc: 0 }, data.attrs) : { str: 0, sta: 0, agi: 0, acc: 0 };
    player.statPoints = data && typeof data.statPoints === "number" ? data.statPoints : Math.max(0, ((player.level || 1) - 1) * 3); // older saves: the points for the levels already gained
    return r;
  };
}

/* ---------------- the profile window (P) ----------------
   Per request (revised): smaller; the slots round the idle sprite (helmet
   above; armor, ring, shield on the left; gauntlet, ring, sword on the
   right; boots under the feet); UNDER the boots, side-by-side progress bars
   (Health, Stamina, Food, Level progress) and under those ATK, DEF,
   MAGIC RES, ATK SPEED and DEF RES (+ CRIT). Hover a stat for what it does. */
let profileEl = null, profileCanvas = null, profilePicker = null;
const STAT_ROWS = [
  ["ATK", () => playerStats().atk, "Hit strength: weapon + gauntlet + rings. Reduced by the mob's DEF."],
  ["DEF", () => playerStats().def, "Armour defence against physical hits."],
  ["MAGIC RES", () => playerStats().mres, "Defence against magic hits (wisps, imps, some bosses). From helmet, armour, shield, rings."],
  ["ATK SPEED", () => playerStats().spd.toFixed(2) + "/s", "Attacks per second. Boots add to it."],
  ["DEF RES", () => Math.round(playerStats().defPct * 100) + "%", "How much of a physical hit your DEF takes off."],
  ["CRIT", () => Math.round(playerStats().crit * 100) + "%", "Chance of a x1.8 hit. Rings add to it."],
  ["HIT", () => Math.round(playerStats().hit * 100) + "%", "Chance to hit (from ACC). Lower against mobs above your level."],
];
const ATTR_ROWS = [
  ["str", "STR", "Strength: +2 ATK per point."],
  ["sta", "STA", "Stamina: +8 max health, +1 DEF and +0.8 MAGIC RES per point."],
  ["agi", "AGI", "Agility: +0.02 ATK SPEED per point."],
  ["acc", "ACC", "Accuracy: +1.2% HIT per point."],
];
function buildProfile() {
  profileEl = document.createElement("div");
  profileEl.id = "profile-overlay";
  profileEl.style.cssText = "position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.35);font-family:monospace";
  profileEl.innerHTML = `
  <div style="background:#3b2a1e;border:3px solid #a8743e;border-radius:10px;padding:8px 10px;color:#f3e2c3;box-shadow:0 8px 30px rgba(0,0,0,.6);width:250px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><b style="font-size:13px">Profile</b><button id="profile-close" style="background:#6b4a2e;color:#f3e2c3;border:1px solid #a8743e;border-radius:4px;cursor:pointer;font-size:11px">✕</button></div>
    <div id="profile-grid" style="display:grid;grid-template-columns:44px 104px 44px;grid-template-rows:44px 80px 44px;gap:4px;align-items:center;justify-items:center;justify-content:center"></div>
    <div id="profile-bars" style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;margin-top:6px;font-size:10px"></div>
    <div id="profile-attrs" style="margin-top:6px;font-size:11px"></div>
    <div id="profile-stats" style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;margin-top:6px;font-size:11px"></div>
  </div>`;
  document.body.appendChild(profileEl);
  profileEl.addEventListener("mousedown", (e) => { if (e.target === profileEl) toggleProfile(false); });
  profileEl.querySelector("#profile-close").addEventListener("click", () => toggleProfile(false));
  const grid = profileEl.querySelector("#profile-grid");
  // Per request: compact — Armor / Helmet / Gauntlet, then Ring / you / Ring, then Shield / Boots / Sword
  const layout = [["helmet", 2, 1], ["armor", 1, 1], ["gauntlet", 3, 1], ["ringL", 1, 2], ["ringR", 3, 2], ["shield", 1, 3], ["boots", 2, 3], ["weapon", 3, 3]];
  for (const [id, col, row] of layout) {
    const b = document.createElement("div");
    b.dataset.slot = id;
    b.style.cssText = `grid-column:${col};grid-row:${row};width:40px;height:40px;border:2px solid #a8743e;border-radius:6px;background:#26190f;display:flex;align-items:center;justify-content:center;cursor:pointer`;
    b.addEventListener("click", (e) => { e.stopPropagation(); openSlotPicker(id, b); });
    grid.appendChild(b);
  }
  profileCanvas = document.createElement("canvas");
  profileCanvas.width = 96; profileCanvas.height = 108; // the body only (frame px 16..48 x 14..50), drawn at 3x
  profileCanvas.style.cssText = "grid-column:2;grid-row:2;height:80px;width:auto;image-rendering:pixelated";
  grid.appendChild(profileCanvas);
}
function profileBar(label, val, max, color) {
  const k = Math.max(0, Math.min(1, max ? val / max : 0));
  return `<div><div style="display:flex;justify-content:space-between"><span>${label}</span><span>${Math.floor(val)}/${Math.floor(max)}</span></div>
    <div style="height:7px;background:#1a110a;border:1px solid #6b4a2e;border-radius:3px;overflow:hidden"><div style="height:100%;width:${(k * 100).toFixed(1)}%;background:${color}"></div></div></div>`;
}
function slotItem(id) { return id === "weapon" ? player.equippedWeapon : player.equipment[id]; }
function slotLabel(id) { return id === "weapon" ? "Sword" : GEAR_SLOTS.find((s) => s.id === id).label; }
function renderProfile() {
  if (!profileEl || profileEl.style.display === "none") return;
  for (const b of profileEl.querySelectorAll("[data-slot]")) {
    const t = slotItem(b.dataset.slot), d = t && itemDefs[t];
    b.innerHTML = d && d.icon ? `<img src="${d.icon.src}" style="width:28px;height:28px;image-rendering:pixelated;object-fit:contain">` : `<span style="font-size:8px;opacity:.6">${slotLabel(b.dataset.slot)}</span>`;
    b.title = d ? d.name : slotLabel(b.dataset.slot) + " (wala)";
    // its upgrade level, top right (js/upgrades.js)
    b.style.position = "relative";
    if (t) b.dataset.itemType = t; else delete b.dataset.itemType;
    const lv = t && typeof upgradeLevel === "function" ? upgradeLevel(t) : 0;
    if (lv > 0) b.insertAdjacentHTML("beforeend", '<span class="slot-plus' + (lv >= 10 ? " max" : "") + '">+' + lv + "</span>");
  }
  profileEl.querySelector("#profile-bars").innerHTML =
    profileBar("Health", player.health, player.maxHealth, "#e05050") + profileBar("Stamina", player.stamina, player.maxStamina, "#e8c84a") +
    profileBar("Food", player.food, player.maxFood, "#d08a3a") + profileBar("Lv " + player.level + " EXP", player.exp, player.maxExp, "#a070ff");
  const pts = player.statPoints || 0;
  const attrsEl = profileEl.querySelector("#profile-attrs");
  attrsEl.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:2px"><b>Attributes</b><span style="color:${pts ? "#9cf59a" : "#c8b8a0"}">Points: ${pts}</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px">` + ATTR_ROWS.map(([k, name, desc]) =>
      `<div title="${desc}" style="display:flex;justify-content:space-between;align-items:center;cursor:help"><b style="color:#9fd0ff">${name}</b><span>${player.attrs[k]}${pts ? ` <button data-attr="${k}" style="padding:0 4px;font-size:10px;background:#4a6b2e;color:#fff;border:1px solid #7fae4e;border-radius:3px;cursor:pointer">+</button>` : ""}</span></div>`).join("") + "</div>";
  for (const btn of attrsEl.querySelectorAll("[data-attr]")) btn.addEventListener("click", (e) => { e.stopPropagation(); spendStat(btn.dataset.attr); });
  profileEl.querySelector("#profile-stats").innerHTML = STAT_ROWS.map(([name, val, desc]) =>
    `<div title="${desc}" style="display:flex;justify-content:space-between;cursor:help"><b style="color:#ffd88a">${name}</b><span>${val()}</span></div>`).join("");
}
function openSlotPicker(id, anchor) {
  if (profilePicker) profilePicker.remove();
  const kind = id === "weapon" ? null : GEAR_SLOTS.find((s) => s.id === id).kind;
  // (rings: two slots, same kind)
  const owned = inventory.filter((s) => s && s.count > 0 && itemDefs[s.type] && (kind ? itemDefs[s.type].gear && itemDefs[s.type].gear.kind === kind : itemDefs[s.type].weapon && itemDefs[s.type].weapon.damage));
  profilePicker = document.createElement("div");
  profilePicker.style.cssText = "position:fixed;z-index:61;background:#26190f;border:2px solid #a8743e;border-radius:8px;padding:6px;color:#f3e2c3;font:12px monospace;min-width:190px";
  const r = anchor.getBoundingClientRect();
  profilePicker.style.left = Math.min(window.innerWidth - 210, r.right + 6) + "px";
  profilePicker.style.top = Math.min(window.innerHeight - 220, r.top) + "px";
  const row = (html, fn, locked) => {
    const el = document.createElement("div");
    el.innerHTML = html;
    el.style.cssText = "padding:4px 6px;cursor:" + (locked ? "not-allowed" : "pointer") + ";opacity:" + (locked ? 0.5 : 1) + ";display:flex;gap:6px;align-items:center";
    if (!locked) el.addEventListener("click", () => { fn(); profilePicker.remove(); profilePicker = null; });
    el.addEventListener("mouseenter", () => { if (!locked) el.style.background = "#4a3220"; });
    el.addEventListener("mouseleave", () => { el.style.background = ""; });
    profilePicker.appendChild(el);
  };
  if (!owned.length) row("<i>You don't have a " + slotLabel(id).toLowerCase() + " yet — buy one at the Equipment Shop</i>", () => {}, true);
  for (const s of owned) {
    const d = itemDefs[s.type], locked = itemLocked(s.type);
    const g = d.gear || {}, info = d.weapon ? "atk " + d.weapon.damage : [g.atk && "atk +" + g.atk, g.def && "def +" + g.def, g.spd && "spd +" + Math.round(g.spd * 100) + "%", g.crit && "crit +" + Math.round(g.crit * 100) + "%"].filter(Boolean).join(", ");
    row(`<img src="${d.icon.src}" style="width:20px;height:20px;image-rendering:pixelated;object-fit:contain"> ${d.name} <span style="opacity:.7">(${locked ? "🔒 Lv " + itemReqLevel(s.type) : info})</span>`,
      () => { if (id === "weapon") { equipWeapon(s.type); renderProfile(); } else equipGear(id, s.type); }, locked);
  }
  if (slotItem(id)) row("<span style='color:#ff9a8a'>✕ Alisin</span>", () => { if (id === "weapon") { unequipWeapon(); renderProfile(); } else equipGear(id, null); });
  document.body.appendChild(profilePicker);
}
document.addEventListener("mousedown", (e) => { if (profilePicker && !profilePicker.contains(e.target)) { profilePicker.remove(); profilePicker = null; } });
function toggleProfile(show) {
  if (!profileEl) buildProfile();
  const on = show === undefined ? profileEl.style.display === "none" : show;
  profileEl.style.display = on ? "flex" : "none";
  if (!on && profilePicker) { profilePicker.remove(); profilePicker = null; }
  renderProfile();
}
window.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  if ((e.key === "p" || e.key === "P") && !e.repeat) toggleProfile();
  else if (e.key === "Escape" && profileEl && profileEl.style.display !== "none") toggleProfile(false);
});
// the idle front sprite, animated, and live stat numbers
setInterval(() => {
  if (!profileEl || profileEl.style.display === "none") return;
  const sheet = typeof spriteForFacing === "function" ? spriteForFacing("idle", "down", "normal") : null;
  const g = profileCanvas.getContext("2d");
  g.clearRect(0, 0, profileCanvas.width, profileCanvas.height);
  if (sheet && sheet.width) {
    const f = Math.floor(performance.now() / 250) % Math.max(1, Math.round(sheet.width / 64));
    g.imageSmoothingEnabled = false;
    g.drawImage(sheet, f * 64 + 16, 14, 32, 36, 0, 0, 96, 108); // per request: the idle body fills the box (no shadow)
  }
  if (!profileEl.matches(":hover")) renderProfile();
}, 250);

/* ---------------- click a mob: walk up and keep attacking ---------------- */
let BOW_RANGE = 5 * TILE; // a bow hits a mob up to 5 tiles away; on the phone 3 (set in js/mobile.js, per request)
player.autoTarget = null;
let autoKeysHeld = new Set(), attackCooldown = 0;
function releaseAutoKeys() { for (const k of autoKeysHeld) keys[k] = false; autoKeysHeld.clear(); }
function stopAutoAttack() { player.autoTarget = null; releaseAutoKeys(); }
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (player.autoTarget && ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k) && !autoKeysHeld.has(k)) stopAutoAttack();
}, true);
view.addEventListener("mousedown", (e) => {
  if (e.button !== 0 || heldItem || player.grabbedType) return;
  const zone = typeof currentMineRoom === "function" ? currentMineRoom() : null;
  const st = zone && mineStates[zone.key];
  if (!st) return;
  const { x, y } = screenToWorld(e.clientX, e.clientY);
  let best = null, bd = 1e9;
  for (const m of st.mobs) {
    if (m.state === "dead") continue;
    const top = mobTopY(m), r = m.def.r + 4;
    if (x < m.x - r || x > m.x + r || y < top - 4 || y > m.y + 4) continue;
    const d = Math.hypot(m.x - x, (m.y + top) / 2 - y);
    if (d < bd) { bd = d; best = m; }
  }
  if (!best) return;
  e.stopImmediatePropagation();
  // Per request (a bug: spam-clicking a mob sped the swings up): a click only
  // picks the target — the attack timer keeps running, so it's one swing per
  // 1/ATK SPEED however often you click.
  // Per request ("2 click 1 click view palang or highlight after click ulit atk
  // na"): the FIRST click only selects the mob (highlighted, its name / level /
  // HP shown — js/skills.js drawSelectedMob()); clicking the SAME mob again
  // attacks it. Clicking another mob selects that one instead.
  if (player.autoTarget === best) return;
  if (player.selectedMob === best) { player.autoTarget = best; return; }
  if (player.autoTarget) stopAutoAttack();
  player.selectedMob = best;
}, true);
// Hovering a mob: a sword cursor, and the mob gets an outline (drawMob(), js/mines.js).
const SWORD_CURSOR = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 24;
  const x = c.getContext("2d");
  x.lineCap = "round";
  x.strokeStyle = "#1b1220"; x.lineWidth = 5; x.beginPath(); x.moveTo(21, 21); x.lineTo(4, 4); x.stroke();
  x.strokeStyle = "#e6e9f2"; x.lineWidth = 3; x.beginPath(); x.moveTo(17, 17); x.lineTo(4, 4); x.stroke();
  x.strokeStyle = "#d9a840"; x.lineWidth = 3; x.beginPath(); x.moveTo(20, 14); x.lineTo(14, 20); x.stroke();
  x.strokeStyle = "#6a3a2a"; x.lineWidth = 3; x.beginPath(); x.moveTo(21, 21); x.lineTo(18, 18); x.stroke();
  return "url(" + c.toDataURL() + ") 4 4, crosshair"; // the tip (top-left) is the hotspot
})();
player.hoverMob = null;
view.addEventListener("mousemove", (e) => {
  const zone = typeof currentMineRoom === "function" ? currentMineRoom() : null;
  const st = zone && mineStates[zone.key];
  let best = null;
  if (st && !heldItem && !player.grabbedType) {
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    let bd = 1e9;
    for (const m of st.mobs) {
      if (m.state === "dead") continue;
      const top = mobTopY(m), r = m.def.r + 4;
      if (x < m.x - r || x > m.x + r || y < top - 4 || y > m.y + 4) continue;
      const d = Math.hypot(m.x - x, (m.y + top) / 2 - y);
      if (d < bd) { bd = d; best = m; }
    }
  }
  player.hoverMob = best;
  // a drop lying there: a hand
  let overDrop = false;
  if (!best && st) {
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    overDrop = st.drops.some((d) => d.phase === "rest" && Math.hypot(d.x - x, (d.y - 6) - y) < 11);
  }
  view.style.cursor = best ? SWORD_CURSOR : overDrop ? "pointer" : "";
});
// Called from mineIndoorUpdate() (js/mines.js) every frame in a mob zone. true = the swing took this frame.
function autoAttackTick(zone, st, dt) {
  attackCooldown = Math.max(0, attackCooldown - dt);
  const m = player.autoTarget;
  if (!m) return false;
  if (m.state === "dead" || !st.mobs.includes(m)) { stopAutoAttack(); return false; }
  const fx = player.x, fy = player.y + MINE_FEET_OFF;
  const dx = m.x - fx, dy = m.y - fy, dist = Math.hypot(dx, dy);
  const W = player.equippedWeapon && itemDefs[player.equippedWeapon] && itemDefs[player.equippedWeapon].weapon;
  const reach = W && W.ranged ? BOW_RANGE - 4 : (W ? 24 : 16) + m.def.r * 0.6; // a bow shoots from 3 tiles
  if (dist > reach) { // walk up to it (held movement keys, so every collision rule still applies)
    const want = new Set();
    if (dx > 4) want.add("d"); else if (dx < -4) want.add("a");
    if (dy > 4) want.add("s"); else if (dy < -4) want.add("w");
    for (const k of autoKeysHeld) if (!want.has(k)) keys[k] = false;
    for (const k of want) keys[k] = true;
    autoKeysHeld = want;
    if (dist > 400) stopAutoAttack(); // lost it
    return false;
  }
  releaseAutoKeys();
  player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  if (attackCooldown <= 0 && !player.mineSwing) {
    startMineSwing();
    // swords: the quick chop-style cadence (SWORD_ATTACK_INTERVAL, js/combat.js); bows and the rest as before
    const iv = typeof isSwordWeapon === "function" && isSwordWeapon(player.equippedWeapon) && typeof SWORD_ATTACK_INTERVAL !== "undefined" ? SWORD_ATTACK_INTERVAL : 1;
    attackCooldown = iv / Math.max(0.3, playerStats().spd);
    return true;
  }
  return false;
}
// leaving the zone drops the target
setInterval(() => { if (player.autoTarget && !(typeof currentMineRoom === "function" && currentMineRoom())) stopAutoAttack(); }, 300);

/* ---------------- the one warp portal ----------------
   Per request ("isa lang itira mo ... lagay mo na lang sa town map bandang
   top right sa mga bato tapos ako lang pwede makapasok"): a single warp
   portal in the town's top-right corner, among the rocks (TOWN_PORTAL; built
   there by ensureTownPortal(), its spot cleared). Only you use it (nobody
   else walks there). Walk up into it (W) -> Wolfpine Woods (east3), coming in
   at its north passage. The far worlds have no portals any more — side
   passages (js/worlds.js) — so any old portal left in a saved world is removed. */
const TOWN_PORTAL = typeof TOWN_MAP !== "undefined" ? TOWN_MAP.portal : { col: 176, row: 12 };
let warpCooldown = 0;
function ensureTownPortal() {
  if (typeof currentWorld === "undefined") return;
  if (currentWorld !== "main") { // the far worlds: no portals any more
    for (const [k, t] of objectLayer) if (t === "warpPortal") objectLayer.delete(k);
    return;
  }
  for (const [k, t] of objectLayer) if (t === "warpPortal" && k !== TOWN_PORTAL.col + "," + TOWN_PORTAL.row) objectLayer.delete(k);
  const k = TOWN_PORTAL.col + "," + TOWN_PORTAL.row;
  if (objectLayer.get(k) === "warpPortal") return;
  for (let r = TOWN_PORTAL.row - 4; r <= TOWN_PORTAL.row + 2; r++) for (let c = TOWN_PORTAL.col - 2; c <= TOWN_PORTAL.col + 2; c++) {
    const kk = c + "," + r, t = objectLayer.get(kk);
    if (t && !/^stone|^pcRocks/.test(t)) objectLayer.delete(kk); // keep the rocks round it, clear the arch's own spot
    if (Math.abs(c - TOWN_PORTAL.col) <= 1 && r >= TOWN_PORTAL.row - 3) objectLayer.delete(kk);
  }
  objectLayer.set(k, "warpPortal");
  // a ring of rocks round it, if there's room
  for (const [dc, dr, t] of [[-3, 0, "stoneMedium"], [3, 0, "stoneMedium"], [-3, -2, "stoneSmall"], [3, -2, "stoneBig"], [-2, 2, "stoneSmall"], [2, 2, "stoneXS"]]) {
    const kk = (TOWN_PORTAL.col + dc) + "," + (TOWN_PORTAL.row + dr);
    if (!objectLayer.has(kk)) objectLayer.set(kk, t);
  }
  if (typeof saveGame === "function") saveGame();
}
function checkWarpPortals() {
  if (player.scene !== "outside" || sceneFade || performance.now() < warpCooldown) return;
  if (currentWorld !== "main" || !(keys["w"] || keys["arrowup"])) return;
  const feetY = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  const col = Math.floor(player.x / TILE), row = Math.floor(feetY / TILE);
  if (Math.abs(col - TOWN_PORTAL.col) > 1 || row !== TOWN_PORTAL.row + 1) return;
  const D = WORLD_DEFS.east3, p = D && (D.passes || []).find((q) => q.name === "back");
  if (!p) return;
  const sp = passSpawn(D, p);
  warpCooldown = performance.now() + 2000;
  if (typeof worldPortalCooldown !== "undefined") worldPortalCooldown = performance.now() + 3000; // don't walk straight on out through east3's passage
  beginSceneFade(() => {
    switchWorld("east3", { col: sp.col, row: sp.row }, "down");
    if (typeof showToast === "function") showToast(MOB_WORLDS.east3.name + " — mobs Lv " + MOB_WORLDS.east3.level[0] + "-" + MOB_WORLDS.east3.level[1]);
  });
}
{
  const upd = updatePlayer;
  updatePlayer = function (dt) { upd(dt); try { checkWarpPortals(); } catch (e) { console.error(e); } };
}
setInterval(() => { try { if (player.scene === "outside") ensureTownPortal(); } catch (e) { /* not loaded yet */ } }, 2000);

// Locked gear can't be bought (the shop shows the lock).
{
  const buy = buyFromNpc;
  buyFromNpc = function (type, price) {
    if (itemLocked(type)) { showToast("Naka-lock pa — kailangan Level " + itemReqLevel(type)); return; }
    return buy.apply(this, arguments);
  };
}


/* ---------------- the portal's swirl ----------------
   Per request ("dapat naka animate din yung portal"): warpPortal's icon is a
   canvas, redrawn from assets/buildings/exterior/warpPortal_anim.png (8
   frames) ~10 times a second, so every place that draws the item animates. */
{
  const strip = new Image();
  strip.src = "assets/buildings/exterior/warpPortal_anim.png";
  const cv = document.createElement("canvas");
  cv.width = 48; cv.height = 56;
  cv.src = "assets/buildings/exterior/warpPortal.png"; // the inventory/hotbar show the still picture (they read icon.src)
  const g = cv.getContext("2d");
  let f = 0;
  strip.onload = () => {
    g.drawImage(strip, 0, 0, 48, 56, 0, 0, 48, 56);
    if (itemDefs.warpPortal) itemDefs.warpPortal.icon = cv;
    setInterval(() => { f = (f + 1) % 8; g.clearRect(0, 0, 48, 56); g.drawImage(strip, f * 48, 0, 48, 56, 0, 0, 48, 56); }, 100);
  };
}


/* ---------------- the Storm Greatsword in the hand ----------------
   Per request ("bigay ka ng hawak ng character na animation yung sword
   kapag walk or idle gagana lang yun kapag nasa cave room at mga map ng mga
   mobs"): a weapon with `holdSprite` is drawn in the player's hand while
   idle / walking / running, only in a mob zone (a mine level or a mob
   world). The hand follows the sprite's frames (HAND_AT, measured off the
   player sheets); facing up it's drawn behind the body; the aura and
   lightning animate. Hidden during a swing (the attack sheet has its own). */
const HAND_AT = { // 64px frame coords of the screen-right hand: idle / walk / run
  idle: [[37, 38], [37, 39], [37, 39], [37, 39]],
  walk: [[37, 38], [37, 39], [37, 38], [37, 38], [37, 39], [37, 38]],
  run: [[36, 37], [36, 38], [37, 39], [38, 37], [37, 38], [36, 38]],
};
const HOLD_GRIP = [7, 33]; // where the grip sits in the 40px sword art
const HOLD_SCALE = 0.55;   // world px per art px
/* The Wood Sword's art is the only upright one (12x43, tip up) — every other sword lies on the
   40px diagonal (grip bottom-left at HOLD_GRIP, tip top-right). Drawn as if it were square, it came
   out sideways (over the head on the back). A diagonal 40x40 copy is made once and used as its
   animStrip, so the back sling, the swings and the Stun all place it like the other long swords. */
(function makeUprightSwordsDiagonal() {
  const fix = (id) => {
    const d = itemDefs[id], img = d && d.icon;
    if (!img || d.animStrip) return;
    const go = () => {
      if (!img.width || img.width >= img.height * 0.6) return;
      const c = document.createElement("canvas"); c.width = c.height = 40;
      const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
      // its handle sits at ~84% of the height, centred; tip at the top
      g.translate(HOLD_GRIP[0], HOLD_GRIP[1]); g.rotate(Math.PI / 4);
      g.drawImage(img, -img.width / 2, -Math.round(img.height * 0.84));
      assets[id + "Diag"] = c;
      d.animStrip = id + "Diag";
    };
    if (img.complete && img.width) go(); else img.addEventListener("load", go, { once: true });
  };
  fix("woodSword");
})();
/* Per request ("yung sa sword naman kapag idle or walk is dapat nasa likod niya
   hindi niya hawak pero kapag hit sa kalaban same parin"): while idle / walking /
   running the weapon is slung across the BACK instead of held — hilt up over a
   shoulder, blade down the back. The swing (drawSwordSwing(), the attack sheets)
   is unchanged: during an attack nothing is drawn here. Every sword shows now,
   not only the holdSprite ones (the 16px icons are slung too); bows go on the
   back upright. Shown everywhere (town, rooms, caves, every world). */
function heldSwordStrip() {
  // Per request ("kahit wala dapat mobs kapag equip niya nasusuot na sa likod"): everywhere now, not just mob zones.
  if (player.action || player.sleeping || player.sitting) return null;
  if (!HAND_AT[player.anim]) return null;
  const d = player.equippedWeapon && itemDefs[player.equippedWeapon];
  if (!d || !d.weapon || d.weapon.attackAnim === "crush" || d.weapon.attackAnim === "watering" || itemLocked(player.equippedWeapon)) return null;
  if (!/Sword|Bow|Cleaver|Reaver/.test(player.equippedWeapon)) return null; // swords and bows only (not the hoe, axe, pickaxe...)
  // effects only come from upgrades now (js/upgrades.js): a boss weapon's baked-in aura strip isn't used
  const strip = d.weapon.ranged || !d.animStrip || d.bossDrop ? d.icon : assets[d.animStrip];
  return strip && strip.width ? strip : null;
}
// Per facing: where the grip sits (64px frame coords) and which way the blade points
// (grip -> tip, degrees, 0 = right, 90 = down), and whether it's in front of the body.
// Per request ("parang nasa harap yung sword dapat nasa likod ng character"): always BEHIND the
// body — the hilt shows over a shoulder and the point below the other hip, whichever way you face.
// Per request ("yung sa pag talikod ng character napupunta kasi sa harap dapat sa likod ng
// character"): facing UP we look at the character's back, so the slung sword is drawn OVER the
// body (front: true) — hilt over the left shoulder, blade across the back to the right hip.
// Facing down / sideways it stays behind the body. Every sword (wood, bronze, iron, ...) and bow.
const BACK_SLING = {
  up:    { grip: [26, 28], dir: 60,  front: true },  // seen from behind: on the back, over the body
  down:  { grip: [39, 25], dir: 118, front: false }, // the hilt peeks over the right shoulder, the tip by the left leg
  right: { grip: [27, 26], dir: 104, front: false }, // the back is on the left of a right-facing sprite
};
const BACK_SWORD_LEN = 20; // world px, hilt to tip
function drawHeldSword(strip, screenX, screenY, z) {
  const hs = HAND_AT[player.anim], h = hs[player.frame % hs.length] || hs[0];
  const bob = h[1] - 38; // the body's bob, off the measured hand
  const k = (DRAW_SIZE / 64) * z;                       // sprite px -> screen px
  const facing = player.facing === "left" ? "right" : player.facing;
  const flip = player.facing === "left"; // the side sheets face right, facing left is mirrored
  const L = BACK_SLING[facing] || BACK_SLING.down;
  const gx = screenX + (flip ? 32 - L.grip[0] : L.grip[0] - 32) * k, gy = screenY + (L.grip[1] + bob - 32) * k;
  const S = strip.height, frames = Math.max(1, Math.round(strip.width / S)), fr = Math.floor(performance.now() / 90) % frames;
  const bow = !!(itemDefs[player.equippedWeapon].weapon || {}).ranged;
  // the blade's line on screen, for the upgrade auras (js/upgrades.js)
  if (typeof backWeaponLine !== "undefined") {
    const ux = Math.cos(L.dir * Math.PI / 180) * (flip ? -1 : 1), uy = Math.sin(L.dir * Math.PI / 180);
    const len = (bow ? 16 : BACK_SWORD_LEN) * z, off = bow ? -len / 2 + 7 * z : 0;
    backWeaponLine = { x0: gx + ux * off, y0: gy + uy * off, x1: gx + ux * (off + len), y1: gy + uy * (off + len), at: performance.now() };
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(gx), Math.round(gy));
  if (flip) ctx.scale(-1, 1);
  if (bow) {
    const s = (16 / S) * z; // ~16 world px tall, by its middle, tilted along the back
    ctx.rotate((L.dir - 90) * Math.PI / 180);
    ctx.translate(0, 7 * z);
    ctx.drawImage(strip, fr * S, 0, S, S, -S * 0.45 * s, -S * 0.5 * s, S * s, S * s);
  } else {
    // the art lies on the diagonal, grip bottom-left, tip top-right (-45 deg)
    const grip = S >= 32 ? HOLD_GRIP : [S * 0.16, S * 0.84];
    const artLen = Math.hypot(S - grip[0], grip[1]); // grip -> top-right corner
    const s = (BACK_SWORD_LEN / artLen) * z;
    ctx.rotate((L.dir + 45) * Math.PI / 180);
    ctx.drawImage(strip, fr * S, 0, S, S, -grip[0] * s, -grip[1] * s, S * s, S * s);
  }
  ctx.restore();
}
{
  const base = drawPlayer;
  drawPlayer = function (screenX, screenY, z) {
    const strip = heldSwordStrip();
    const facing = player.facing === "left" ? "right" : player.facing;
    const front = !!(BACK_SLING[facing] || {}).front;
    if (strip && !front) drawHeldSword(strip, screenX, screenY, z); // behind the body
    const r = base.apply(this, arguments);
    if (strip && front) drawHeldSword(strip, screenX, screenY, z);  // seen from behind: over the back
    return r;
  };
  // At night the character is repainted in its own colours over the dark wash (drawPlayerNightRelight,
  // js/camera.js) — that repaint would cover a sword worn over the back, so it's added to the repaint too.
  const relBase = drawPlayerNightRelight;
  drawPlayerNightRelight = function () {
    const strip = heldSwordStrip();
    const facing = player.facing === "left" ? "right" : player.facing;
    if (!strip || !(BACK_SLING[facing] || {}).front) return relBase.apply(this, arguments);
    const sprBase = drawPlayerSprite;
    drawPlayerSprite = function (px, py, z, g) {
      const r = sprBase.apply(this, arguments);
      if (g) { const keep = ctx; ctx = g; try { drawHeldSword(strip, px, py, z); } finally { ctx = keep; } }
      return r;
    };
    try { return relBase.apply(this, arguments); } finally { drawPlayerSprite = sprBase; }
  };
}


/* ---------------- boss gear crackles when worn ----------------
   Per request ("yung drop na gear like helmet, armor gauntlet at boots dapat
   ganun din violet tapos nag lilightning kapag suot"): each worn boss piece
   (bossDrop gear, or the Storm Greatsword) adds a soft violet aura behind the
   player and little lightning bolts at the part it covers — helmet at the
   head, armor at the chest, gauntlet at the hand, boots at the feet, ring and
   shield at the sides. Bolts re-roll every ~90ms. Everywhere, not just in the
   mob areas. */
const BOSS_INNATE_FX = false;
const WORN_SPOTS = { helmet: [[32, 18]], armor: [[29, 34], [35, 34]], gauntlet: [[37, 39]], boots: [[29, 47], [35, 47]], ringL: [[27, 39]], ringR: [[37, 40]], shield: [[26, 36]] };
function wornBossSpots() {
  const out = [];
  for (const [slot, spots] of Object.entries(WORN_SPOTS)) {
    const t = player.equipment[slot], d = t && itemDefs[t];
    if (d && d.bossDrop && !itemLocked(t)) out.push(...spots);
  }
  return out;
}
function drawWornLightning(screenX, screenY, z, spots, behind) {
  const k = (DRAW_SIZE / 64) * z, flip = player.facing === "left";
  const P = (sx, sy) => [screenX + (flip ? 32 - sx : sx - 32) * k, screenY + (sy - 32) * k];
  ctx.save();
  if (behind) { // the aura
    const [cx, cy] = P(32, 34);
    const g = ctx.createRadialGradient(cx, cy, 2 * k, cx, cy, 22 * k);
    const a = 0.12 + 0.04 * spots.length + 0.05 * Math.sin(performance.now() / 200);
    g.addColorStop(0, "rgba(180,100,255," + Math.min(0.5, a) + ")"); g.addColorStop(1, "rgba(150,80,255,0)");
    ctx.fillStyle = g; ctx.fillRect(cx - 24 * k, cy - 26 * k, 48 * k, 52 * k);
    ctx.restore(); return;
  }
  let seed = Math.floor(performance.now() / 90) * 977;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const [sx, sy] of spots) {
    if (rnd() < 0.45) continue; // not every spot every flicker
    let [x, y] = P(sx + (rnd() - 0.5) * 6, sy + (rnd() - 0.5) * 6);
    let ang = rnd() * Math.PI * 2;
    const pts = [[x, y]];
    for (let i = 0; i < 4; i++) { const a = ang + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.7); const L = (1.6 + rnd()) * k; x += Math.cos(a) * L; y += Math.sin(a) * L; pts.push([x, y]); }
    ctx.lineJoin = "miter";
    ctx.strokeStyle = "rgba(150,110,255,0.75)"; ctx.lineWidth = Math.max(1.5, k * 1.6);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.stroke();
    ctx.strokeStyle = "rgba(250,248,255,0.95)"; ctx.lineWidth = Math.max(1, k * 0.7);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.stroke();
  }
  ctx.restore();
}
{
  const base = drawPlayer;
  drawPlayer = function (screenX, screenY, z) {
    // Per request: no built-in aura/lightning on boss gear any more — every glow comes from its upgrade level (js/upgrades.js).
    const spots = BOSS_INNATE_FX && !(player.sleeping || player.sitting) ? wornBossSpots() : [];
    if (spots.length) drawWornLightning(screenX, screenY, z, spots, true);
    const r = base.apply(this, arguments);
    if (spots.length) drawWornLightning(screenX, screenY, z, spots, false);
    return r;
  };
}


/* ---------------- the boss gear changes how you look ----------------
   Per request ("kapag worn ibahin mo appearance ng character ... helmet is
   parang pang spartan ... armor chest na may mga abs ... gauntlet ... boots"):
   assets/sprites_gear/<piece>/<the same path as each player sheet> are
   overlays (tools: /farmer/gear_overlays.py — a Spartan helm with a plume, a
   muscle cuirass, armoured forearms, violet boots with a pink trim) drawn over
   the matching frame whenever that boss piece is worn. drawPlayerSprite() is
   wrapped, so the night relight shows them too. */
const GEAR_LOOKS_ON = false;
const GEAR_LOOK_SLOTS = ["boots", "armor", "gauntlet", "helmet"]; // drawn in this order
const gearOverlayCache = new Map();
function gearOverlayFor(piece, sheet, set) {
  const src = sheet && sheet.src ? sheet.src : "";
  const i = src.indexOf("assets/sprites/");
  if (i < 0) return null;
  const rel = src.slice(i + "assets/sprites/".length).split("?")[0];
  const dir = set ? "assets/sprites_gear_" + set + "/" : "assets/sprites_gear/"; // the boss set has no suffix
  const key = dir + piece + "/" + rel;
  let img = gearOverlayCache.get(key);
  if (!img) { img = new Image(); img.src = key; gearOverlayCache.set(key, img); }
  return img.complete && img.naturalWidth ? img : null;
}
// [slot, set] for every worn piece that changes the look (boss gear: set null; the metal sets: their name)
function wornLookPieces() {
  // Per request ("yung armor, helmet, gauntlet boots is alisin mo na yung itsura
  // yung iwan mo na lang is aura at yung lightning"): worn gear no longer changes
  // how the character looks — the boss pieces keep only their aura + lightning
  // (drawWornLightning() above). Return the pieces again to bring the looks back.
  if (!GEAR_LOOKS_ON) return [];
  const out = [];
  for (const slot of GEAR_LOOK_SLOTS) {
    const t = player.equipment[slot], d = t && itemDefs[t];
    if (!d || itemLocked(t)) continue;
    if (d.bossDrop) out.push([slot, null]); else if (d.lookSet) out.push([slot, d.lookSet]);
  }
  return out;
}
{
  const base = drawPlayerSprite;
  drawPlayerSprite = function (px, py, scale, g = ctx) {
    const r = base.apply(this, arguments);
    if (player.sitting) return r;
    const pieces = wornLookPieces();
    if (!pieces.length) return r;
    const sheet = currentPlayerSheet(), size = DRAW_SIZE * scale, sx = player.frame * FRAME_SIZE;
    for (const [piece, set] of pieces) {
      const ov = gearOverlayFor(piece, sheet, set);
      if (!ov) continue;
      g.save();
      if (player.facing === "left") { g.translate(px, py); g.scale(-1, 1); g.drawImage(ov, sx, 0, FRAME_SIZE, FRAME_SIZE, -size / 2, -size / 2, size, size); }
      else g.drawImage(ov, sx, 0, FRAME_SIZE, FRAME_SIZE, px - size / 2, py - size / 2, size, size);
      g.restore();
    }
    return r;
  };
}

/* ---------------- the Storm Greatsword's swing ----------------
   Per request ("lagyan ng swing effects di lang yung tusok ... parang dun sa
   pag axe ng tree ganung swing"): the weapon's attackAnim is the body's
   "hit" swing, and the sword itself sweeps an arc from over the shoulder down
   past the front, leaving a violet crescent trail with a spark at the tip. */
const SWING_ARCS = { right: [-2.2, 0.75], left: [-2.2, 0.75], down: [-2.6, 0.4], up: [-0.9, -3.6] }; // radians, from / to
function drawSwordSwing(screenX, screenY, z) {
  const d = player.equippedWeapon && itemDefs[player.equippedWeapon];
  if (!d || !d.weapon || !d.weapon.swingArc || !player.mineSwing || !player.action) return;
  const strip = assets[d.animStrip];
  if (!strip || !strip.width) return;
  const n = FRAME_COUNTS[player.action] || 4;
  const t = Math.min(1, (player.frame + Math.min(1, player.frameTimer * (ANIM_FPS[player.action] || 10) * (player.mineSwing.speed || 1))) / n);
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out
  const k = (DRAW_SIZE / 64) * z, flip = player.facing === "left";
  const [a0, a1] = SWING_ARCS[player.facing] || SWING_ARCS.right;
  const a = a0 + (a1 - a0) * e;
  const hx = screenX + (flip ? -5 : 5) * k, hy = screenY + 6 * k;      // the shoulder/hand pivot
  const R = 30 * k;
  ctx.save();
  ctx.translate(hx, hy);
  if (flip) ctx.scale(-1, 1);
  // the trail: a crescent from where the swing started to where the blade is now
  if (e > 0.05) {
    const from = a0 + (a1 - a0) * Math.max(0, e - 0.55), steps = 10;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) { const b = from + (a - from) * i / steps; ctx.lineTo(Math.cos(b) * R, Math.sin(b) * R); }
    for (let i = steps; i >= 0; i--) { const b = from + (a - from) * i / steps; const rr = R * (0.55 + 0.35 * i / steps); ctx.lineTo(Math.cos(b) * rr, Math.sin(b) * rr); }
    ctx.closePath();
    const gr = ctx.createRadialGradient(0, 0, R * 0.4, 0, 0, R);
    gr.addColorStop(0, "rgba(150,80,255,0)"); gr.addColorStop(0.7, "rgba(190,120,255," + (0.55 * (1 - t * 0.6)) + ")"); gr.addColorStop(1, "rgba(250,240,255," + (0.85 * (1 - t * 0.5)) + ")");
    ctx.fillStyle = gr; ctx.fill();
  }
  // the sword along the swing (its art points up-right at 45 degrees: rotate it onto the angle)
  const S = strip.height, s = HOLD_SCALE * z * 1.1, fr = Math.floor(performance.now() / 90) % Math.max(1, Math.round(strip.width / S));
  ctx.save();
  ctx.rotate(a + Math.PI / 4);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(strip, fr * S, 0, S, S, -HOLD_GRIP[0] * s, -HOLD_GRIP[1] * s, S * s, S * s);
  ctx.restore();
  // a spark at the tip
  const tx = Math.cos(a) * R, ty = Math.sin(a) * R;
  ctx.fillStyle = "rgba(255,250,255,0.95)"; ctx.fillRect(tx - k, ty - k, 2 * k, 2 * k);
  ctx.restore();
}
/* ---------------- shooting a bow ----------------
   Per request ("kapag gumamit naman ng bow ano itsura niya tapos pag atk?"):
   held upright in the hand while walking (above); when you attack, the body
   plays its "hit" pose and the bow is raised toward where you face, the string
   pulled back over the first half, then released — the arrow (js/mines.js)
   flies to the mob and the hit lands when it arrives. */
function drawBowShot(screenX, screenY, z) {
  const d = player.equippedWeapon && itemDefs[player.equippedWeapon];
  if (!d || !d.weapon || !d.weapon.ranged || !player.mineSwing || !player.action) return;
  const img = d.icon;
  if (!img || !img.width) return;
  const n = FRAME_COUNTS[player.action] || 4;
  const t = Math.min(1, (player.frame + Math.min(1, player.frameTimer * (ANIM_FPS[player.action] || 10) * (player.mineSwing.speed || 1))) / n);
  const pull = t < 0.5 ? t / 0.5 : Math.max(0, 1 - (t - 0.5) / 0.15); // draw back, then snap forward
  const k = (DRAW_SIZE / 64) * z;
  const ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[player.facing] || 0;
  const S = img.height, s = (16 / S) * z;
  ctx.save();
  ctx.translate(screenX + Math.cos(ang) * 7 * k, screenY + 4 * k + Math.sin(ang) * 5 * k);
  ctx.rotate(ang);
  ctx.imageSmoothingEnabled = false;
  // the bow's art is upright with its string on the left: as drawn, it shoots to the right
  ctx.drawImage(img, 0, 0, img.width, S, -S * 0.4 * s, -S * 0.5 * s, img.width * s, S * s);
  // the pulled string + a nocked arrow while drawing
  const top = [-S * 0.4 * s + 1 * s, -S * 0.5 * s + 1 * s], bot = [-S * 0.4 * s + 1 * s, S * 0.5 * s - 1 * s], back = -S * 0.4 * s - pull * 7 * k;
  ctx.strokeStyle = "rgba(240,236,220,0.95)"; ctx.lineWidth = Math.max(1, 0.6 * k);
  ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(back, 0); ctx.lineTo(bot[0], bot[1]); ctx.stroke();
  if (t < 0.5) {
    ctx.fillStyle = "#e9dcc0"; ctx.fillRect(back, -0.4 * k, 12 * k, 0.8 * k);
    ctx.fillStyle = "#cfd6e0"; ctx.fillRect(back + 12 * k, -1 * k, 2 * k, 2 * k);
  }
  ctx.restore();
}
{
  const base = drawPlayer;
  drawPlayer = function (screenX, screenY, z) {
    const back = player.facing === "up";
    if (back) { drawSwordSwing(screenX, screenY, z); drawBowShot(screenX, screenY, z); }
    const r = base.apply(this, arguments);
    if (!back) { drawSwordSwing(screenX, screenY, z); drawBowShot(screenX, screenY, z); }
    return r;
  };
}

/* ---------------- try-out set ----------------
   Per request ("lagay ka tag iisa niyan sa inventory para ma try"): once,
   one of every boss piece + the Storm Greatsword goes into the inventory,
   and while `player.gearTrial` is on the boss gear can be worn at any level
   (so it can be tried). Saved; turn it off by setting gearTrial false. */
function grantGearTrial() {
  if (player.gearTrialGiven) return;
  player.gearTrialGiven = true; player.gearTrial = true;
  for (const id of ["demonHelmet", "demonArmor", "demonGauntlet", "demonBoots", "demonRing", "demonShield", "demonBow", "stormSword"]) if (itemDefs[id] && ownedCount(id) < 1) grantItem(id, 1);
  if (typeof showToast === "function") showToast("Try-out: a set of boss gear is in your inventory — press P to wear it");
  if (typeof saveGame === "function") saveGame();
}
{
  const lockBase = itemLocked;
  itemLocked = function (type) { return player.gearTrial && itemDefs[type] && itemDefs[type].bossDrop ? false : lockBase(type); };
  const wl = weaponLocked;
  weaponLocked = function (type) { return player.gearTrial && itemDefs[type] && itemDefs[type].bossDrop ? false : wl(type); };
  const saveBase = buildSaveData;
  buildSaveData = function () { const d = saveBase.apply(this, arguments); d.gearTrialGiven = !!player.gearTrialGiven; d.gearTrial = !!player.gearTrial; return d; };
  const loadBase = applySaveData;
  applySaveData = function (data) {
    const r = loadBase.apply(this, arguments);
    player.gearTrialGiven = !!(data && data.gearTrialGiven); player.gearTrial = !!(data && data.gearTrial);
    return r;
  };
}
// only once a save has been loaded (the title screen can keep the game waiting)
{
  const t = setInterval(() => {
    if (typeof saveGameReady === "undefined" || !saveGameReady) return;
    clearInterval(t);
    setTimeout(() => { try { grantGearTrial(); } catch (e) { console.error(e); } }, 2000);
  }, 500);
}

/* ---------------- buying gear: equipped straight away ----------------
   Per request ("yung mga nabibili pala sa shop ... equip na lang tapos
   mapunta sa profile"): a sword, bow or piece of armour bought from a
   shop is put on right away (if your level allows it) and shows in the
   Profile (P); it doesn't go to the Equipment list (G) — that one is just
   the starting kit (isDefaultKitItem(), js/inventory.js). */
{
  const base = buyFromNpc;
  buyFromNpc = function (type, price) {
    const before = player.gold;
    const r = base.apply(this, arguments);
    if (player.gold >= before) return r; // nothing was bought
    const d = itemDefs[type];
    if (!d || itemLocked(type)) return r;
    let equipped = false;
    if (d.weapon && d.weapon.damage && d.equipSlot === "weapon") {
      equipWeapon(type); equipped = true;
    } else if (d.gear && d.gear.kind) {
      const slots = GEAR_SLOTS.filter((s) => s.kind === d.gear.kind);
      const free = slots.find((s) => !player.equipment[s.id]) || slots[0];
      if (free) { equipGear(free.id, type); equipped = player.equipment[free.id] === type; }
    }
    if (equipped) {
      if (typeof showToast === "function") showToast("Equipped: " + d.name + " — see your Profile (P)");
      if (typeof renderProfile === "function") renderProfile();
      if (typeof saveGame === "function") saveGame();
    }
    return r;
  };
}
