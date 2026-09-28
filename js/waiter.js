"use strict";

/* =================================================================
   WAITER JOB — per request: apply to Maria as a waiter, then serve her
   tavern's customers yourself.

     1. Click Maria inside the tavern -> "I want to apply as a waiter."
        -> a contract (the work, the hours, the pay) -> Confirm / Cancel.
     2. While hired, on shift (Mon-Fri during her working hours) and
        inside the tavern, customers who sit down WAIT for their food
        instead of it appearing on its own (js/customers.js, "waitFood"),
        with their order bubble over their head.
     3. Click a stove to pick the food up — Stove (A) is drinks (beer),
        Stove (B) is salad or grilled meat — and the character carries it
        (Carry_Order pose facing down, the normal carry pose otherwise).
     4. Click the customer to hand it over. The right order -> they eat;
        the wrong one -> nothing, try again.
     5. They pay Maria at the counter when they order (and can only order
        while she's there). Once they've eaten they leave an empty plate
        or mug on the table — carry the Tray over and click it to clear
        it onto the Tray, then click the indoor open crate (the bin) to
        tip the Tray out. (Replaces the old gold-on-the-table tips.)
     6. Every evening after work, when Maria heads to bed, she pays the
        day's salary: hours you actually spent in the tavern on shift x
        the hourly rate.
   Not hired, or away from the tavern? Maria serves everyone herself,
   exactly as before.

   THE TRAY (later request): put the Tray (was "Tabletop Clutter 1") on
   the bartender table. Click it while holding a beer / salad / grilled
   meat (from a stove, or held from the inventory) to put it on — up to
   3 of each. Its picture follows what's on it (solo / x2 / x3 of one
   food, a combo "no beer / no salad / no grilled" picture when one of
   the three is missing, all three). Click the Tray with empty hands to
   pick it up, then click a waiting customer (or their chair) to hand
   them their order off it. Hold Alt to see how many of each are left.
   When it's empty it goes back to its spot on its own.
================================================================= */

const WAITER_HOURLY_PAY = 10;        // gold per in-game hour on shift
const WAITER_FOOD_PATIENCE = 60;     // real seconds a seated customer waits for their food before walking out
const WAITER_REACH_TILES = 2;        // how close the player must be to a customer / a dirty table
// Per request, 1 tile: the bin crate, picking up / filling the Tray, and
// taking food from a stove.
const WAITER_NEAR_TILES = 1;
// Which stove makes what. One option = picked up straight away; more
// than one = a small menu to choose from.
const WAITER_STOVES = {
  cookerStove1: { label: "Stove (A) — Drinks", orders: ["foodBeer"] },
  cookerStove2: { label: "Stove (B) — Kitchen", orders: ["foodSalad", "meatItem"] },
};

// Saved (js/save.js). `day`/`hoursToday` are the shift being counted,
// `paidDay` the last day Maria paid out, so she never pays twice.
const waiterJob = {
  employed: false, day: null, hoursToday: 0, paidDay: null,
  // Performance for the day — per request, pay follows how well you did.
  servedToday: 0,    // orders handed over correctly
  walkoutsToday: 0,  // customers who gave up waiting for their food
  payslip: null,     // the day's pay, worked out after work, waiting to be claimed from Maria
};

// Performance: starts every day at WAITER_PERF_START, goes up for every
// order served and down (harder) for every customer who walks out.
// Where it ends decides a bonus or a deduction on the hourly pay.
const WAITER_PERF_START = 70;
const WAITER_PERF_PER_SERVE = 5;
const WAITER_PERF_PER_WALKOUT = 15;
const WAITER_PERF_TIERS = [ // first match wins
  { min: 90, mult: 1.2, label: "Excellent", note: "+20% bonus" },
  { min: 70, mult: 1.0, label: "Good", note: "full pay" },
  { min: 50, mult: 0.9, label: "Fair", note: "-10% deduction" },
  { min: 0, mult: 0.75, label: "Poor", note: "-25% deduction" },
];
let waiterLastHour = null; // not saved — the clock reading last frame

// Gold left on tables after served meals: { roomId, col, row, amount }.
// Not saved — collect it before you go.
// Empty plates and mugs left on tables after a meal the player served:
// { roomId, col, row, type } (type = what was eaten — its eating strip's
// last frame is what's drawn). Saved (js/save.js).
let tableLeftovers = [];

const TRAY_FOODS = ["foodBeer", "foodSalad", "meatItem"];
const TRAY_MAX_PER_FOOD = 3; // the pictures go up to 3 of a food
// Cleared dishes — per request, up to 5 mugs and 5 plates. A tray holds
// food OR dishes, never both (there's no picture for a mix).
const TRAY_DISHES = ["mug", "plate"];
const TRAY_MAX_DISHES = 5;
const TRAY_ALL = TRAY_FOODS.concat(TRAY_DISHES);

// What's on each Tray, by "roomId|col,row" — saved (js/save.js).
const trayContents = new Map();
let trayInfoOn = false; // Alt held

/* ---------------- state ---------------- */

function waiterTavern() {
  return typeof customerTavern === "function" ? customerTavern() : null; // js/customers.js
}

function isPlayerInTavern() {
  const t = waiterTavern();
  return !!t && player.scene === "inside" && player.activeRoomId === t.roomId;
}

// Hired, it's a working weekday hour, and the player is actually there.
function isWaiterOnDuty() {
  if (!waiterJob.employed || !isPlayerInTavern()) return false;
  return isNpcWorkingHours(player.activeRoomId); // js/npc.js — also false on weekends
}

function waiterMaxDailyPay(roomId) {
  const w = npcWorkHours(roomId);
  return (w.end - w.start) * WAITER_HOURLY_PAY;
}

function fmtHours(h) {
  return (Math.round(h * 10) / 10).toString();
}

/* ---------------- per frame (main.js) ---------------- */

function waiterPerformance() {
  const p = WAITER_PERF_START + waiterJob.servedToday * WAITER_PERF_PER_SERVE - waiterJob.walkoutsToday * WAITER_PERF_PER_WALKOUT;
  return Math.max(0, Math.min(100, p));
}
function waiterPerfTier(p) { return WAITER_PERF_TIERS.find((t) => p >= t.min); }

// Called from js/customers.js.
function noteOrderServed() { waiterJob.servedToday++; }
function noteCustomerWalkout() { waiterJob.walkoutsToday++; }

// Works out the day's pay and holds it for Maria to hand over.
function makePayslip() {
  if (waiterJob.hoursToday <= 0 || waiterJob.paidDay === waiterJob.day) return;
  const perf = waiterPerformance();
  const tier = waiterPerfTier(perf);
  const base = Math.floor(waiterJob.hoursToday * WAITER_HOURLY_PAY);
  const total = Math.max(0, Math.round(base * tier.mult));
  const slip = {
    day: waiterJob.day, hours: waiterJob.hoursToday,
    served: waiterJob.servedToday, walkouts: waiterJob.walkoutsToday,
    perf, label: tier.label, note: tier.note, base, total,
  };
  // An older unclaimed slip isn't lost — the amounts add up.
  if (waiterJob.payslip) {
    const o = waiterJob.payslip;
    slip.hours += o.hours; slip.served += o.served; slip.walkouts += o.walkouts;
    slip.base += o.base; slip.total += o.total;
  }
  waiterJob.payslip = slip;
  waiterJob.paidDay = waiterJob.day;
  saveGame();
}

function updateWaiterJob() {
  const day = getGameDay();
  const h = getGameHour();

  if (waiterJob.day !== day) {
    // A shift from an earlier day that never got its payslip (slept,
    // closed the tab...) — work it out now; Maria still pays it.
    if (waiterJob.employed && waiterJob.day !== null) makePayslip();
    waiterJob.day = day;
    waiterJob.hoursToday = 0;
    waiterJob.servedToday = 0;
    waiterJob.walkoutsToday = 0;
  }

  if (waiterLastHour !== null && isWaiterOnDuty()) {
    const delta = h - waiterLastHour;
    if (delta > 0 && delta < 0.5) waiterJob.hoursToday += delta; // ignore clock jumps (sleeping, loading)
  }
  waiterLastHour = h;

  // After work: the day's pay is worked out, and Maria comes to find you
  // with it (waiterMariaSeeksPlayer(), called from js/npc.js).
  const t = waiterTavern();
  if (waiterJob.employed && t && !isNpcWeekend() && h >= npcWorkHours(t.roomId).end &&
      waiterJob.paidDay !== day && waiterJob.hoursToday > 0) {
    makePayslip();
  }

  // The order stays in the tavern — walk out with it and it's gone.
  if (player.carryOrder && !isPlayerInTavern()) {
    player.carryOrder = null;
    showToast("You left the order behind in the tavern.");
  }
  if (player.carryTray && !isPlayerInTavern()) returnTray(isDishTray() ? "You left the dirty dishes behind." : "You left the tray on the counter.");
}

/* ---------------- payday: Maria brings your pay ---------------- */

const waiterPayEl = document.getElementById("waiter-pay-overlay");
let waiterPayOpen = false;

function openWaiterPay() {
  const slip = waiterJob.payslip;
  if (!slip || !waiterPayEl) return;
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set("waiter-pay-hours", fmtHours(slip.hours) + " hrs x " + WAITER_HOURLY_PAY + " gold = " + slip.base + " gold");
  set("waiter-pay-served", String(slip.served));
  set("waiter-pay-walkouts", String(slip.walkouts));
  set("waiter-pay-perf", slip.perf + "% — " + slip.label + " (" + slip.note + ")");
  const diff = slip.total - slip.base;
  set("waiter-pay-adjust", diff === 0 ? "none" : (diff > 0 ? "+" : "") + diff + " gold");
  set("waiter-pay-total", slip.total + " gold");
  const msg = slip.perf >= 90 ? "Congratulations — that was a wonderful shift! The customers loved you. Here's a little extra."
    : slip.perf >= 70 ? "Congratulations on finishing your shift! Great work today — here's your pay."
    : slip.perf >= 50 ? "Thanks for working today. A few customers had to wait too long, so I've taken a little off."
    : "Thanks for coming in. Too many customers left without their food today, so your pay is lower. Let's do better tomorrow!";
  set("waiter-pay-message", msg);
  const perfEl = document.getElementById("waiter-pay-perf");
  if (perfEl) perfEl.dataset.tier = slip.label.toLowerCase();
  waiterPayEl.classList.remove("hidden");
  waiterPayOpen = true;
}

function claimWaiterPay() {
  const slip = waiterJob.payslip;
  if (slip) {
    player.gold += slip.total;
    renderGoldDisplays(); // js/npc.js
    showToast("+" + slip.total + " gold — your pay from Maria.");
    waiterJob.payslip = null;
    saveGame();
  }
  if (waiterPayEl) waiterPayEl.classList.add("hidden");
  waiterPayOpen = false;
}

if (waiterPayEl) {
  const btn = document.getElementById("waiter-pay-claim");
  if (btn) btn.addEventListener("click", claimWaiterPay);
}

// Called from js/npc.js after work (and at bedtime, before she lies
// down): with a payslip waiting and you in the tavern, Maria walks over
// to you and hands it over. true = she's busy with this, skip the rest
// of her schedule this frame.
function waiterMariaSeeksPlayer(room, dt) {
  if (!waiterJob.payslip || npc.sleeping) return false;
  if (player.scene !== "inside" || player.activeRoomId !== npc.roomId) return false;
  npc.working = false;
  if (waiterPayOpen) { npc.isWalking = false; return true; } // standing with you while you read it
  const dist = Math.hypot(player.x - npc.inX, player.y - npc.inY);
  if (dist <= 22) {
    npc.isWalking = false;
    clearNpcInsidePath();
    if (typeof npcStopWandering === "function") npcStopWandering();
    openWaiterPay();
    return true;
  }
  const feet = interiorFeetTileAt(player.x, player.y);
  npcRouteWalkTo(room, (feet.col + 0.5) * TILE, centerYForFeetRow(feet.row), dt);
  return true;
}

/* ---------------- Maria's menu (js/npc.js npcTalkMainMenu()) ---------------- */

// The extra line in her talk menu — apply, or check on the job.
function waiterTalkOption() {
  if (waiterJob.payslip) {
    return { label: "I'm here for my pay.", onClick: () => { closeNpcTalk(); openWaiterPay(); } };
  }
  if (!waiterJob.employed) {
    return { label: "I want to apply as a waiter.", onClick: () => { closeNpcTalk(); openWaiterContract(); } };
  }
  return { label: "About my waiter job...", onClick: waiterJobStatus };
}

function waiterJobStatus() {
  const roomId = npc.roomId;
  const w = npcWorkHours(roomId);
  const perf = waiterPerformance();
  const tier = waiterPerfTier(perf);
  const paid = waiterJob.paidDay === getGameDay();
  const text = "Today: " + fmtHours(waiterJob.hoursToday) + " hrs, " + waiterJob.servedToday + " served, " +
    waiterJob.walkoutsToday + " walked out — performance " + perf + "% (" + tier.label + "). " +
    (paid ? "Today's pay is already done." : "I'll bring your pay after work.") +
    " Shift: Mon-Fri, " + w.start + ":00-" + w.end + ":00.";
  setNpcTalk(text, [
    { label: "I want to quit.", onClick: () => setNpcTalk("Are you sure? You'll still get paid for today's hours tonight.", [
      { label: "Yes, I quit.", onClick: () => {
        // What's owed is paid right away, so quitting never loses a shift.
        makePayslip();
        waiterJob.employed = false;
        player.carryOrder = null;
        returnTray(null);
        saveGame();
        if (waiterJob.payslip) { closeNpcTalk(); openWaiterPay(); }
        else npcTalkMainMenu("Alright. Thanks for your help — come back any time.");
      } },
      { label: "No, I'll stay.", onClick: () => npcTalkMainMenu("Great! Back to work, then.") },
    ]) },
    { label: "Back", onClick: () => npcTalkMainMenu("Anything else?") },
  ]);
}

/* ---------------- the contract ---------------- */

const waiterContractEl = document.getElementById("waiter-contract-overlay");

function openWaiterContract() {
  if (!waiterContractEl) return;
  const roomId = (waiterTavern() || {}).roomId || npc.roomId;
  const w = npcWorkHours(roomId);
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set("waiter-contract-hours", "Mon-Fri, " + w.start + ":00 - " + w.end + ":00");
  set("waiter-contract-hourly", WAITER_HOURLY_PAY + " gold / hour");
  set("waiter-contract-daily", "up to " + waiterMaxDailyPay(roomId) + " gold / day");

  waiterContractEl.classList.remove("hidden");
}

function closeWaiterContract() {
  if (waiterContractEl) waiterContractEl.classList.add("hidden");
}

function confirmWaiterContract() {
  waiterJob.employed = true;
  if (waiterJob.day !== getGameDay()) { waiterJob.day = getGameDay(); waiterJob.hoursToday = 0; }
  closeWaiterContract();
  saveGame();
  showToast("You're hired! Serve the customers during Maria's shift.");
}

if (waiterContractEl) {
  const confirmBtn = document.getElementById("waiter-contract-confirm");
  const cancelBtn = document.getElementById("waiter-contract-cancel");
  if (confirmBtn) confirmBtn.addEventListener("click", confirmWaiterContract);
  if (cancelBtn) cancelBtn.addEventListener("click", closeWaiterContract);
  waiterContractEl.addEventListener("click", (e) => { if (e.target === waiterContractEl) closeWaiterContract(); });
}

/* ---------------- stove menu (Stove (B) has two dishes) ---------------- */

const stoveMenuEl = document.getElementById("stove-menu");

function closeStoveMenu() {
  if (stoveMenuEl) stoveMenuEl.classList.add("hidden");
}

function openStoveMenu(stove, clientX, clientY) {
  if (!stoveMenuEl) return;
  stoveMenuEl.innerHTML = "";
  const title = document.createElement("div");
  title.className = "stove-menu-title";
  title.textContent = stove.label;
  stoveMenuEl.appendChild(title);
  for (const type of stove.orders) {
    const def = itemDefs[type];
    const b = document.createElement("button");
    b.className = "stove-menu-option";
    const img = document.createElement("img");
    img.src = def.icon.src;
    img.alt = "";
    b.appendChild(img);
    b.appendChild(document.createTextNode(def.name));
    b.addEventListener("click", () => { closeStoveMenu(); pickUpOrder(type); });
    stoveMenuEl.appendChild(b);
  }
  stoveMenuEl.style.left = Math.min(clientX + 8, window.innerWidth - 180) + "px";
  stoveMenuEl.style.top = Math.min(clientY + 8, window.innerHeight - 140) + "px";
  stoveMenuEl.classList.remove("hidden");
}

window.addEventListener("mousedown", (e) => {
  if (stoveMenuEl && !stoveMenuEl.classList.contains("hidden") && !stoveMenuEl.contains(e.target)) closeStoveMenu();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeStoveMenu(); closeWaiterContract(); }
});

function pickUpOrder(type) {
  // Carrying the Tray? The food goes straight onto it.
  if (player.carryTray) {
    if (trayAdd(player.carryTray.roomId, player.carryTray.key, type)) showToast(itemDefs[type].name + " added to your tray.");
    return;
  }
  player.carryOrder = type;
  showToast("Carrying " + itemDefs[type].name + " — put it on the tray, or click the customer who ordered it.");
}

/* ---------------- the Tray ---------------- */

function trayId(roomId, key) { return roomId + "|" + key; }

function trayGet(roomId, key) {
  const id = trayId(roomId, key);
  let c = trayContents.get(id);
  if (!c) { c = { foodBeer: 0, foodSalad: 0, meatItem: 0, mug: 0, plate: 0 }; trayContents.set(id, c); }
  for (const k of TRAY_ALL) if (typeof c[k] !== "number") c[k] = 0;
  return c;
}

function trayTotal(c) {
  return TRAY_ALL.reduce((n, t) => n + (c[t] || 0), 0);
}
function trayFoodCount(c) { return TRAY_FOODS.reduce((n, t) => n + (c[t] || 0), 0); }
function trayDishCount(c) { return TRAY_DISHES.reduce((n, t) => n + (c[t] || 0), 0); }

function trayIsAway(roomId, key) {
  return !!player.carryTray && player.carryTray.roomId === roomId && player.carryTray.key === key;
}

// The picture for what's on it — per request, named after the files.
function trayImageFor(roomId, key) {
  const c = trayGet(roomId, key);
  const present = TRAY_FOODS.filter((t) => c[t] > 0);
  if (present.length === 0) {
    // Cleared dishes (assets/.../orderlist/empty/). "max" once both are
    // on it and there are 5 or more altogether.
    if (c.mug > 0 && c.plate > 0) return (c.mug + c.plate >= 5) ? assets.trayMugsPlatesMax : assets.trayMugsPlates;
    if (c.mug > 0) return assets.trayMugs;
    if (c.plate > 0) return assets.trayPlates;
    return assets.trayEmpty;
  }
  if (present.length === 3) return assets.trayComboAll;
  if (present.length === 2) {
    const missing = TRAY_FOODS.find((t) => !present.includes(t));
    return { foodBeer: assets.trayComboNoBeer, foodSalad: assets.trayComboNoSalad, meatItem: assets.trayComboNoMeat }[missing];
  }
  const t = present[0], n = c[t];
  const pics = {
    foodBeer: [assets.traySoloBeer, assets.trayBeer2, assets.trayBeer3],
    foodSalad: [assets.traySoloSalad, assets.traySalad2, assets.traySalad3],
    meatItem: [assets.traySoloMeat, assets.trayMeat2, assets.trayMeat3],
  }[t];
  return pics[Math.min(n, 3) - 1];
}

// E (js/interior.js) won't lift a Tray that has food on it or is out.
function trayBlocksGrab(roomId, key) {
  const room = INTERIOR_ROOMS[roomId];
  const type = room && room.tableTop && room.tableTop.get(key);
  if (!type || !itemDefs[type].isTray) return false;
  if (trayIsAway(roomId, key) || trayTotal(trayGet(roomId, key)) > 0) {
    showToast("Serve what's on the tray first.");
    return true;
  }
  return false;
}

// Every Tray in the room: { key, col, row, rect } in room px.
function traysInRoom(room) {
  const out = [];
  for (const map of [room.tableTop, room.decor]) {
    if (!map) continue;
    for (const [key, type] of map) {
      if (!itemDefs[type] || !itemDefs[type].isTray) continue;
      const [col, row] = key.split(",").map(Number);
      const icon = assets.trayEmpty;
      const w = icon.width || 32, h = icon.height || 16;
      const cy = tableTopCentreY(room, col, row);
      out.push({ key, col, row, rect: { x: (col + 0.5) * TILE - w / 2, y: cy - h / 2, w, h } });
    }
  }
  return out;
}

function trayAt(room, x, y) {
  return traysInRoom(room).find((t) =>
    !trayIsAway(player.activeRoomId, t.key) &&
    x >= t.rect.x && x < t.rect.x + t.rect.w && y >= t.rect.y && y < t.rect.y + t.rect.h) || null;
}

// Adds one food to a tray; false (with a toast) if there's no room.
function trayAdd(roomId, key, type) {
  const c = trayGet(roomId, key);
  if (trayDishCount(c) > 0) {
    showToast("Empty the dirty dishes into the open crate first.");
    return false;
  }
  if (c[type] >= TRAY_MAX_PER_FOOD) {
    showToast("The tray already has " + TRAY_MAX_PER_FOOD + " " + itemDefs[type].name + ".");
    return false;
  }
  c[type]++;
  saveGame();
  return true;
}

// A cleared plate/mug onto the carried tray; false (with a toast) if not.
function trayAddDish(c, dish) {
  if (trayFoodCount(c) > 0) { showToast("Serve the food on your tray first."); return false; }
  if (c[dish] >= TRAY_MAX_DISHES) { showToast("The tray can't hold more than " + TRAY_MAX_DISHES + " " + dish + "s."); return false; }
  c[dish]++;
  return true;
}

// Empty tray -> it goes back to its spot by itself (per request). Also
// used when you walk out of the tavern with it.
function returnTray(msg) {
  if (!player.carryTray) return;
  // The dish tray isn't a real one from the counter — it just goes away
  // (with whatever was on it).
  if (player.carryTray.key === DISH_TRAY_KEY) {
    const c = trayGet(player.carryTray.roomId, DISH_TRAY_KEY);
    for (const k of TRAY_ALL) c[k] = 0;
  }
  player.carryTray = null;
  if (msg) showToast(msg);
  saveGame();
}

// Per request: clearing tables uses its OWN tray that appears in your
// hands when you click the first dirty plate/mug, and disappears once
// it's tipped into the open crate — the real Tray stays on the counter.
const DISH_TRAY_KEY = "dishes";
function isDishTray() { return !!player.carryTray && player.carryTray.key === DISH_TRAY_KEY; }

/* ---------------- Alt: what's on the trays ---------------- */

window.addEventListener("keydown", (e) => {
  if (e.key === "Alt") { trayInfoOn = true; e.preventDefault(); }
});
window.addEventListener("keyup", (e) => {
  if (e.key === "Alt") { trayInfoOn = false; e.preventDefault(); }
});
window.addEventListener("blur", () => { trayInfoOn = false; });

// A small card per Tray (and one over the player for the carried tray):
// each food's icon and how many are left. Called from camera.js.
function drawTrayInfo(room) {
  if (!trayInfoOn || player.scene !== "inside") return;
  const cards = [];
  for (const t of traysInRoom(room)) {
    if (trayIsAway(player.activeRoomId, t.key)) continue;
    cards.push({ x: t.rect.x + t.rect.w / 2, y: t.rect.y, c: trayGet(player.activeRoomId, t.key) });
  }
  if (player.carryTray && player.carryTray.roomId === player.activeRoomId) {
    const headY = player.y - DRAW_SIZE / 2 + DRAW_SIZE * SPRITE_HEAD_FRACTION;
    cards.push({ x: player.x, y: headY - 4, c: trayGet(player.carryTray.roomId, player.carryTray.key), carried: true });
  }
  for (const card of cards) drawTrayCard(card);
}

function drawTrayCard({ x, y, c, carried }) {
  const s = Math.max(1.5, zoom * 0.6); // screen px per card unit — readable, not huge
  const rowH = 11 * s, iconS = 9 * s, pad = 4 * s, w = 44 * s;
  const title = carried ? (isDishTray() ? "Dishes" : "Your tray") : "Tray";
  const rows = TRAY_ALL;
  const h = pad * 2 + 8 * s + rows.length * rowH;
  const sx = (x - camX) * zoom - w / 2;
  const sy = (y - camY) * zoom - h - 2 * s;
  ctx.save();
  ctx.fillStyle = "rgba(25, 18, 12, 0.92)";
  ctx.strokeStyle = "rgba(224, 197, 108, 0.8)";
  ctx.lineWidth = Math.max(1, s * 0.6);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(sx, sy, w, h, 3 * s); else ctx.rect(sx, sy, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e0c56c";
  ctx.font = "600 " + Math.round(6.5 * s) + "px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.fillText(title, sx + w / 2, sy + pad - s);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "600 " + Math.round(7 * s) + "px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  rows.forEach((t, i) => {
    const ry = sy + pad + 8 * s + i * rowH;
    const n = c[t] || 0;
    ctx.globalAlpha = n > 0 ? 1 : 0.4;
    const icon = t === "mug" ? assets.mugEmpty : t === "plate" ? assets.plateEmpty : itemDefs[t].icon;
    if (icon && icon.width) ctx.drawImage(icon, sx + pad, ry + (rowH - iconS) / 2, iconS, iconS);
    ctx.fillStyle = "#f3e9dc";
    ctx.fillText("x" + n, sx + pad + iconS + 3 * s, ry + rowH / 2);
  });
  ctx.restore();
}

/* ---------------- clicking things in the tavern ---------------- */

function waiterWithinReach(tiles, reach = WAITER_REACH_TILES) {
  const feet = playerFeetTiles(); // js/furniture.js
  return tiles.some((t) => feet.some((f) =>
    Math.abs(f.col - t.col) <= reach && Math.abs(f.row - t.row) <= reach));
}

// A stove in the tavern under this room-space point.
function stoveAt(room, x, y) {
  for (const [key, type] of room.decor) {
    if (!WAITER_STOVES[type]) continue;
    const def = itemDefs[type];
    const [col, row] = key.split(",").map(Number);
    const root = def.artRoot || { x: 0, y: 0 };
    const left = (col + 0.5) * TILE - def.icon.width / 2 - root.x;
    const top = (row + 1) * TILE - def.icon.height - root.y;
    if (x >= left && x < left + def.icon.width && y >= top && y < top + def.icon.height) {
      return { type, col, row, stove: WAITER_STOVES[type] };
    }
  }
  return null;
}

// Where a seated customer's body is drawn (js/customers.js drawCustomer()).
function customerBodyCentre(c) {
  let x = c.fx, fy = c.fy;
  if (c.seat) {
    x += (c.facing === "left" ? -c.seat.poseX : c.seat.poseX);
    fy += c.seat.poseY;
  }
  return { x, y: fy - 10 };
}

// The waiting customer clicked — their body, or the chair they're on
// (per request, "i click parin sa chair").
function waitingCustomerAt(x, y) {
  let best = null, bestD = 14 * 14;
  for (const c of customers) {
    if (c.scene !== "inside" || c.state !== "waitFood") continue;
    const b = customerBodyCentre(c);
    const d = (b.x - x) ** 2 + (b.y - y) ** 2;
    if (d <= bestD) { best = c; bestD = d; }
  }
  if (best) return best;
  for (const c of customers) {
    if (c.scene !== "inside" || c.state !== "waitFood" || !c.seat) continue;
    const sc = c.seat.anchorCol, sr = c.seat.anchorRow;
    if (x >= sc * TILE && x < (sc + 1) * TILE && y >= (sr - 1) * TILE && y < (sr + 1) * TILE) return c;
  }
  return null;
}

function leftoverDish(type) { return type === "foodBeer" ? "mug" : "plate"; }

function leftoverAt(roomId, x, y) {
  return tableLeftovers.find((k) => k.roomId === roomId &&
    x >= k.col * TILE && x < (k.col + 1) * TILE && y >= k.row * TILE - 6 && y < (k.row + 1) * TILE) || null;
}

// Called from customers.js when a customer the player served finishes.
function leaveTableLeftover(roomId, col, row, type) {
  tableLeftovers.push({ roomId, col, row, type });
  saveGame();
}

// A seat at a table with dirty dishes still on it isn't free
// (js/customers.js freeSeatFor()).
function tableHasLeftovers(roomId, col, row) {
  return tableLeftovers.some((k) => k.roomId === roomId && k.col === col && k.row === row);
}

// The indoor open crate (the bin) under this room-space point.
function trashCrateAt(room, x, y) {
  for (const [key, type] of room.decor) {
    const def = itemDefs[type];
    // The indoor open crate, and the outdoor "Crate (Open)" too if that's
    // the one that got put in the tavern.
    if (!def || !(def.isTrash || type === "vegCrateOpen")) continue;
    const [col, row] = key.split(",").map(Number);
    const root = def.artRoot || { x: 0, y: 0 };
    const left = (col + 0.5) * TILE - def.icon.width / 2 - root.x;
    const top = (row + 1) * TILE - def.icon.height - root.y;
    if (x >= left && x < left + def.icon.width && y >= top && y < top + def.icon.height) return { type, col, row };
  }
  return null;
}

// Registered in the CAPTURE phase and stops the event when it's used, so
// clicking a seated customer never also sits you down on their chair
// (js/furniture.js) or opens anything else.
function setupWaiterClickHandler() {
  view.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (player.grabbedType || player.sitting) return;
    if (!isPlayerInTavern()) return;
    const t = waiterTavern();
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    const handled = () => { e.stopImmediatePropagation(); e.preventDefault(); };

    // Holding something from the inventory: only a beer / salad / grilled
    // meat clicked onto a Tray is ours — anything else is normal placing.
    if (heldItem) {
      if (!TRAY_FOODS.includes(heldItem.type)) return;
      const tray = trayAt(t.room, x, y);
      if (!tray) return;
      handled();
      if (!waiterJob.employed) { showToast("Only Maria's staff can use the tray. Ask her about a job."); return; }
      if (!waiterWithinReach([{ col: tray.col, row: tray.row }], WAITER_NEAR_TILES)) { showTooFarToast("Get closer to the tray."); return; }
      if (trayAdd(t.roomId, tray.key, heldItem.type)) {
        showToast(itemDefs[heldItem.type].name + " put on the tray.");
        commitPlacementUse(heldItem.fromSlot); // uses one up (unless it's unlimited)
      }
      return;
    }

    // The bin (indoor open crate): tip the carried Tray out.
    const bin = trashCrateAt(t.room, x, y);
    if (bin && !player.carryTray && !player.carryOrder) {
      handled();
      showToast("Bring the tray here to empty it.");
      return;
    }
    if (bin) {
      handled();
      const tiles = getMultiTileFootprintTiles(bin.type, bin.col, bin.row);
      if (!waiterWithinReach(tiles, WAITER_NEAR_TILES)) { showTooFarToast("Get closer to the crate."); return; }
      if (player.carryOrder) {
        showToast("You threw the " + itemDefs[player.carryOrder].name + " away.");
        player.carryOrder = null;
        return;
      }
      const tc = trayGet(player.carryTray.roomId, player.carryTray.key);
      if (trayTotal(tc) === 0) { showToast("The tray is already empty."); return; }
      const wasDishTray = isDishTray();
      for (const k of TRAY_ALL) tc[k] = 0;
      returnTray(wasDishTray ? "Dishes thrown into the crate." : "You emptied the tray into the crate — it's back on the counter.");
      return;
    }

    // Dirty dishes on a table: onto the carried Tray.
    const k = leftoverAt(t.roomId, x, y);
    if (k) {
      handled();
      if (!waiterWithinReach([{ col: k.col, row: k.row }])) { showTooFarToast("Get closer to the table."); return; }
      // Per request: no need to fetch the tray — clearing a dish puts a
      // separate dish tray in your hands; the counter's Tray stays put.
      if (!player.carryTray) {
        if (player.carryOrder) { showToast("Your hands are full — serve or bin the " + itemDefs[player.carryOrder].name + " first."); return; }
        const dc = trayGet(t.roomId, DISH_TRAY_KEY);
        for (const kk of TRAY_ALL) dc[kk] = 0;
        player.carryTray = { roomId: t.roomId, key: DISH_TRAY_KEY };
      }
      const tc = trayGet(player.carryTray.roomId, player.carryTray.key);
      const dish = leftoverDish(k.type);
      if (!trayAddDish(tc, dish)) return;
      tableLeftovers = tableLeftovers.filter((o) => o !== k);
      showToast("Empty " + dish + " on the tray (" + tc.mug + " mugs, " + tc.plate + " plates).");
      saveGame();
      return;
    }

    // Handing an order to a waiting customer.
    const c = waitingCustomerAt(x, y);
    if (c && waiterJob.employed) {
      handled();
      if (!waiterWithinReach([{ col: Math.floor(c.fx / TILE), row: Math.floor(c.fy / TILE) }])) {
        showTooFarToast("Get closer to the customer.");
        return;
      }
      if (player.carryTray) {
        const tc = trayGet(player.carryTray.roomId, player.carryTray.key);
        if (!(tc[c.order.type] > 0)) {
          showToast("There's no " + itemDefs[c.order.type].name + " on your tray.");
          return;
        }
        tc[c.order.type]--;
        serveCustomer(c); // js/customers.js
        if (trayTotal(tc) === 0) returnTray("The tray's empty — it's back on the counter.");
        else saveGame();
        return;
      }
      if (!player.carryOrder) { showToast("They ordered " + itemDefs[c.order.type].name + " — get it from the stove."); return; }
      if (player.carryOrder !== c.order.type) {
        showToast("That's not their order — they want " + itemDefs[c.order.type].name + ".");
        return;
      }
      player.carryOrder = null;
      serveCustomer(c); // js/customers.js
      return;
    }

    // The Tray: put your food on it, pick it up, or put it back.
    if (player.carryTray && player.carryTray.roomId === t.roomId) {
      const home = traysInRoom(t.room).find((o) => o.key === player.carryTray.key);
      if (home && x >= home.rect.x && x < home.rect.x + home.rect.w && y >= home.rect.y && y < home.rect.y + home.rect.h) {
        handled();
        returnTray("You put the tray back.");
        return;
      }
    }
    const tray = trayAt(t.room, x, y);
    if (tray) {
      handled();
      if (!waiterJob.employed) { showToast("Only Maria's staff can use the tray. Ask her about a job."); return; }
      if (!waiterWithinReach([{ col: tray.col, row: tray.row }], WAITER_NEAR_TILES)) { showTooFarToast("Get closer to the tray."); return; }
      if (player.carryTray) { showToast("You're already carrying a tray."); return; }
      if (player.carryOrder) {
        if (trayAdd(t.roomId, tray.key, player.carryOrder)) {
          showToast(itemDefs[player.carryOrder].name + " put on the tray.");
          player.carryOrder = null;
        }
        return;
      }
      // Empty or not, it can be picked up — an empty one is for
      // clearing the tables.
      const c = trayGet(t.roomId, tray.key);
      player.carryTray = { roomId: t.roomId, key: tray.key };
      showToast(trayTotal(c) === 0
        ? "Carrying the empty tray — click the empty plates and mugs to clear them."
        : "Carrying the tray — click a customer's chair to serve. Hold Alt to see what's left.");
      return;
    }

    // Picking up food from a stove.
    const s = stoveAt(t.room, x, y);
    if (s) {
      handled();
      if (!waiterJob.employed) { showToast("Only Maria's staff can use the stove. Ask her about a job."); return; }
      if (!isNpcWorkingHours(t.roomId)) { showToast("The kitchen is closed right now."); return; }
      const tiles = getMultiTileFootprintTiles(s.type, s.col, s.row); // js/inventory.js
      if (!waiterWithinReach(tiles, WAITER_NEAR_TILES)) { showTooFarToast("Get closer to the stove."); return; }
      if (player.carryOrder && !player.carryTray) {
        showToast("You put the " + itemDefs[player.carryOrder].name + " back.");
        player.carryOrder = null;
        return;
      }
      if (s.stove.orders.length === 1) pickUpOrder(s.stove.orders[0]);
      else openStoveMenu(s.stove, e.clientX, e.clientY);
    }
  }, { capture: true });
}

/* ---------------- drawing (js/camera.js) ---------------- */

// The sheet to use while carrying an order: Carry_Order facing down (the
// only direction that art exists for), the normal carry pose otherwise.
// Returns null when not carrying one.
function carryOrderSheet(animKey, facing) {
  if (!player.carryOrder && !player.carryTray) return null;
  if (ONE_SHOT_ACTION_SHEETS[animKey]) return null; // js/player.js — actions keep their own sheets
  if (facing === "down" && assets.carryOrderDown.width) return assets.carryOrderDown;
  return spriteForFacing(animKey, facing, "carrying");
}

// The dish itself: in the hands (facing down, Carry_Order), above the
// head like any other carried thing otherwise.
function drawCarriedOrder(px, py, size, scale, g = ctx) {
  if (player.sitting) return;
  if (player.carryTray) {
    // The Tray, showing what's on it.
    const img = trayImageFor(player.carryTray.roomId, player.carryTray.key);
    if (!img || !img.width) return;
    const w = 22 * scale, h = w * img.height / img.width;
    const y = player.facing === "down"
      ? py - size / 2 + size * (36 / 64) - h * 0.4                            // in the hands
      : py - size / 2 + size * SPRITE_HEAD_FRACTION - h - 4 * scale;         // over the head
    g.drawImage(img, px - w / 2, y, w, h);
    return;
  }
  if (!player.carryOrder) return;
  const icon = itemDefs[player.carryOrder].icon;
  if (!icon || !icon.width) return;
  const s = 10 * scale;
  if (player.facing === "down") {
    // Carry_Order's hands meet at about y 36/64 of the frame — the dish
    // sits on them, below the chin.
    const handsY = py - size / 2 + size * (36 / 64);
    g.drawImage(icon, px - s / 2, handsY - s * 0.45, s, s);
  } else {
    const headY = py - size / 2 + size * SPRITE_HEAD_FRACTION;
    g.drawImage(icon, px - s / 2, headY - s - 5, s, s);
  }
}

// Empty plates / mugs on the tables — the last frame of what was eaten
// (the same strip, same spot, the customer ate it from).
function drawTableLeftovers() {
  if (player.scene !== "inside") return;
  const seen = new Map(); // two on one table: nudge the second aside
  for (const k of tableLeftovers) {
    if (k.roomId !== player.activeRoomId) continue;
    const m = CUSTOMER_MENU.find((o) => o.type === k.type); // js/customers.js
    const strip = m && m.strip;
    if (!strip || !strip.width) continue;
    const frames = Math.max(1, Math.floor(strip.width / 16));
    const tk = k.col + "," + k.row;
    const n = seen.get(tk) || 0;
    seen.set(tk, n + 1);
    const w = 16 * zoom, h = strip.height * zoom;
    const x = ((k.col + 0.5) * TILE - camX) * zoom - w / 2 + (n % 2 ? 6 : 0) * zoom * (n > 0 ? 1 : 0);
    const y = ((k.row + 1) * TILE - camY) * zoom - h - Math.floor(n / 2) * 3 * zoom;
    ctx.drawImage(strip, (frames - 1) * 16, 0, 16, strip.height, x, y, w, h);
  }
}

// A customer paying Maria at the counter: a gold coin rising over her head.
let mariaPayFx = []; // { t } seconds since paid
function showMariaPaid() { mariaPayFx.push({ t: 0 }); }

function drawMariaPayFx(dt) {
  mariaPayFx.forEach((f) => { f.t += dt; });
  mariaPayFx = mariaPayFx.filter((f) => f.t < 1.2);
  if (!mariaPayFx.length || player.scene !== "inside" || npc.scene !== "inside" || npc.roomId !== player.activeRoomId) return;
  const icon = assets.goldCoins;
  if (!icon.width) return;
  const w = 10 * zoom, h = 10 * zoom;
  const headY = npc.inY - DRAW_SIZE / 2 + DRAW_SIZE * SPRITE_HEAD_FRACTION;
  for (const f of mariaPayFx) {
    const x = (npc.inX - camX) * zoom - w / 2;
    const y = (headY - camY) * zoom - h - f.t * 10 * zoom;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
    ctx.drawImage(icon, x, y, w, h);
    ctx.restore();
  }
}

let waiterFxLast = performance.now();
function drawWaiterTableThings() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - waiterFxLast) / 1000);
  waiterFxLast = now;
  drawTableLeftovers();
  drawMariaPayFx(dt);
}

// Maria is at her spot behind the counter — customers only order then.
function isMariaAtCounter(roomId) {
  return npc.scene === "inside" && npc.roomId === roomId && !!npc.working && !npc.sleeping;
}
