"use strict";

/* =================================================================
   FARMING — per request:
     - Hoe (F, or left-click a tile in reach): the ground becomes a
       Dirt Rake (tilled soil) — `dirtRake` on the dirt layer.
     - Watering Can (F / click): the Watering animation, the soil turns
       wet for one in-game day. Crops only grow while their soil is wet.
     - Seeds (bought at the grocery): hold them and click tilled soil.
       Each crop takes its own time (FARM_CROPS.hours, in-game hours of
       wet soil) through 4 growth stages to its final, ripe form.
     - Harvest: one click on a ripe crop in reach — the Collect animation,
       then the crop pops out and flies to you like wood from a tree.
       Left FARM_ROT_HOURS after ripening it rots: still clickable, no loot.
     - White tile borders only on the tiles you can use right now, within
       FARM_RANGE tiles of the character.
     - Planting Sockets (sacks, open/closed): an open sack takes harvested
       crops, SOCKET_CAPACITY each. Click: deposit; when it's full (or you
       have nothing to put in) a pop-up offers Close + Hold; a closed sack
       offers Open + Hold.
     - Tuesday, Thursday and Saturday at COLLECT_HOUR a collector walks to
       every Plant Drawer and empties the sacks sitting on it, paying gold
       (FARM_CROPS.sell each).
   Data lives per world ("main" town / "wild"), saved under `farm`
   (js/save.js). Times are absolute in-game seconds (farmNow()), so crops
   keep growing while the game is closed, exactly like the clock does.
================================================================= */

const FARM_HARVEST_YIELD = "2-4"; // per request: every harvest gives 2-4 (FARM_CROPS.yield)
const FARM_RANGE = 2;             // tiles from the character you can farm
const SOCKET_CAPACITY = 20;
const FARM_WET_HOURS = 26;        // one watering keeps the soil wet a little over a day, so "water once a day" always works
const FARM_ROT_HOURS = 36;        // ripe crops rot after this long (1.5 days)
const FARM_REGROW_HOURS = 24;     // a tilled hole left with nothing planted grows back to its old ground after this long
const FARM_DRY_DIE_HOURS = 12;    // a growing crop left on dry soil this long withers (in-game hours, ~7.5 real minutes)
const COLLECT_DAYS = [1, 3, 5];   // getWeekdayIndex(): 0 = Mon -> Tue, Thu, Sat
const COLLECT_HOUR = 15;
const COLLECTOR_ID = "I";         // which townsperson's art the collector uses (js/citizens.js)
const COLLECTOR_NAME = "Mang Ador";
const COLLECTOR_SPEED = 42;       // world px / s

const FARM_CROPS = {
  carrots:         { seed: "seedCarrots",        crop: "cropCarrots",        hours: 24, sell: 12, yield: [2, 4] },
  petchay:         { seed: "seedPetchay",        crop: "cropPetchay",        hours: 24, sell: 11, yield: [2, 4] },
  onion:           { seed: "seedOnion",          crop: "cropOnion",          hours: 36, sell: 18, yield: [2, 4] },
  cabbage:         { seed: "seedCabbage",        crop: "cropCabbage",        hours: 48, sell: 24, yield: [2, 4] },
  brocolli:        { seed: "seedBrocolli",       crop: "cropBrocolli",       hours: 48, sell: 28, yield: [2, 4] },
  brocolli_flower: { seed: "seedBrocolliFlower", crop: "cropBrocolliFlower", hours: 60, sell: 32, yield: [2, 4] },
  dragonfruit:     { seed: "seedDragonfruit",    crop: "cropDragonfruit",    hours: 72, sell: 50, yield: [2, 4] },
};
const FARM_GROW_SHEETS = {};
for (const v of Object.keys(FARM_CROPS)) {
  FARM_GROW_SHEETS[v] = new Image();
  FARM_GROW_SHEETS[v].src = "assets/items/vegetables/" + v + "/" + v + ".png";
}
const CROP_SELL_PRICE = Object.fromEntries(Object.values(FARM_CROPS).map((c) => [c.crop, c.sell]));

/* ---------------- state ---------------- */
const farmWorlds = {};            // world -> { plots: Map key -> plot, sockets: Map key -> { type: count } }
let farmLastCollectDay = 0;
let farmPendingSocket = null;     // contents of a sack being carried
let collector = null;

function farmWorld(w = currentWorld) {
  if (!farmWorlds[w]) farmWorlds[w] = { plots: new Map(), sockets: new Map() };
  return farmWorlds[w];
}
function farmNow() { return ((Date.now() - dayNightEpoch) / 1000) * TIME_SCALE; } // absolute in-game seconds
const fkey = (c, r) => c + "," + r;
const fpos = (k) => k.split(",").map(Number);

let farmToastAt = 0;
function farmToast(msg) {
  const now = performance.now();
  if (now - farmToastAt < 900) return;
  farmToastAt = now;
  if (typeof showToast === "function") showToast(msg);
}

/* ---------------- crops ---------------- */
// Per request: a crop only grows while its soil is wet. Once the soil dries
// out the growth stops and a dry clock runs instead (`dry`, in-game
// seconds); left dry for FARM_DRY_DIE_HOURS it withers and dies (clickable,
// no loot). Every watering sets the dry clock back to 0 and growth carries on.
function advancePlot(plot, now) {
  const c = plot.crop;
  if (!c || c.ripeAt != null || c.dead) return;
  const total = FARM_CROPS[c.veg].hours * 3600;
  const wetUntil = plot.wetUntil || 0;
  const wetEnd = Math.min(now, wetUntil);
  if (wetEnd > c.lastT) c.growth += wetEnd - c.lastT;
  const dryFrom = Math.max(c.lastT, wetUntil);
  if (now > dryFrom) c.dry = (c.dry || 0) + (now - dryFrom);
  c.lastT = now;
  if (c.growth >= total) { c.ripeAt = wetEnd - (c.growth - total); c.growth = total; c.dry = 0; }
  else if ((c.dry || 0) >= FARM_DRY_DIE_HOURS * 3600) c.dead = true;
}
function cropState(plot, now) {
  const c = plot.crop;
  if (!c) return null;
  advancePlot(plot, now);
  if (c.dead) return "dead";
  if (c.ripeAt != null) return now - c.ripeAt > FARM_ROT_HOURS * 3600 ? "rotten" : "ripe";
  return "growing";
}
function plotAt(col, row) {
  if (dirtLayer.get(fkey(col, row)) !== "dirtRake") return null;
  const w = farmWorld();
  let p = w.plots.get(fkey(col, row));
  if (!p) { p = { wetUntil: 0, crop: null }; w.plots.set(fkey(col, row), p); }
  return p;
}
function isPlotWet(p, now) { return (p.wetUntil || 0) > now; }

/* ---------------- what can be done where ---------------- */
function farmBounds(col, row) { return col >= 0 && row >= 0 && col < Math.ceil(worldW() / TILE) && row < Math.ceil(worldH() / TILE); }
function inFarmRange(col, row) {
  const p = getPlayerTile();
  return Math.max(Math.abs(col - p.col), Math.abs(row - p.row)) <= FARM_RANGE;
}
function isTillable(col, row) {
  if (!farmBounds(col, row)) return false;
  const k = fkey(col, row);
  if (dirtLayer.has(k)) return false;
  const g = groundLayer.get(k);
  if (g && !/^(grass|terrainGrass)/.test(g)) return false; // water, port, bricks, mountain...
  for (const L of [groundOverlayLayer, objectLayer, upperLayer, wildgrassLayer, bridgeLayer]) if (L.has(k)) return false;
  if (isTileBlocked(col, row)) return false;
  if (typeof pendingConstructions !== "undefined" && pendingConstructions.has && pendingConstructions.has(k)) return false;
  return true;
}
function isPlantable(col, row) { const p = plotAt(col, row); return !!p && !p.crop; }
function isHarvestable(col, row) { const p = plotAt(col, row); return !!p && !!p.crop && cropState(p, farmNow()) !== "growing"; }

/* ---------------- actions ---------------- */
function faceTile(col, row) {
  const p = getPlayerTile();
  const dx = col - p.col, dy = row - p.row;
  if (dx === 0 && dy === 0) return;
  player.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
}
function startFarmAction(kind, anim, col, row) {
  faceTile(col, row);
  player.action = anim;
  player.frame = 0;
  player.frameTimer = 0;
  player.harvestTarget = null;
  player.farmAction = { kind, col, row, world: currentWorld };
}

// F (tile = null -> the tile in front) or a click (tile given) with the hoe
// or the watering can equipped. True when it took the input.
function farmTryToolAction(tile) {
  if (player.scene !== "outside" || heldItem || player.grabbedType) return false;
  const tool = player.equippedWeapon;
  if (tool !== "farmHoe" && tool !== "farmCan") return false;
  const t = tile || getTileInFrontOfPlayer();
  if (tool === "farmHoe") {
    if (!isTillable(t.col, t.row)) {
      if (tile) farmToast(plotAt(t.col, t.row) ? "Naararo na ito" : "Hindi ma-araro ang lupa dito");
      return !!tile;
    }
    startFarmAction("till", "crush", t.col, t.row);
    return true;
  }
  if (!plotAt(t.col, t.row)) {
    if (tile) farmToast("Diligan ang naararong lupa (Dirt Rake)");
    else { startFarmAction("water", "watering", t.col, t.row); } // just a splash at nothing
    return true;
  }
  startFarmAction("water", "watering", t.col, t.row);
  return true;
}

function farmResolveAction(fa) {
  if (fa.world !== currentWorld || player.scene !== "outside") return;
  const { col, row } = fa;
  const k = fkey(col, row);
  const now = farmNow();
  if (fa.kind === "till") {
    if (!isTillable(col, row)) return;
    // remember what the ground was, so an unused hole can grow back
    const orig = { fill: typeof isGroundFilled === "function" && isGroundFilled(col, row), ground: groundLayer.get(k) || null };
    if (typeof setGroundFill === "function") setGroundFill(col, row, false);
    if (/^(grass|terrainGrass)/.test(groundLayer.get(k) || "")) groundLayer.delete(k);
    dirtLayer.set(k, "dirtRake");
    farmWorld().plots.set(k, { wetUntil: 0, crop: null, orig, emptySince: now });
    saveGame();
  } else if (fa.kind === "water") {
    const p = plotAt(col, row);
    if (!p) return;
    if (p.crop) { advancePlot(p, now); if (!p.crop.dead) p.crop.dry = 0; } // every watering: dry clock back to 0
    p.wetUntil = now + FARM_WET_HOURS * 3600;
    saveGame();
  } else if (fa.kind === "harvest") {
    const p = plotAt(col, row);
    if (!p || !p.crop) return;
    const st = cropState(p, now);
    if (st === "growing") return;
    const info = FARM_CROPS[p.crop.veg];
    p.crop = null;
    p.emptySince = now; // an empty hole grows back over after a while (farmRegrowEmptyPlots())
    if (st === "ripe") {
      const n = info.yield[0] + Math.floor(Math.random() * (info.yield[1] - info.yield[0] + 1));
      grantItem(info.crop, n);
      spawnFloatingPickups((col + 0.5) * TILE, (row + 0.5) * TILE, info.crop, n);
      // per request: its seeds drop too — 2 seeds 60%, 1 seed 25%, 3 seeds 15%
      const roll = Math.random(), seeds = roll < 0.6 ? 2 : roll < 0.85 ? 1 : 3;
      grantItem(info.seed, seeds);
      spawnFloatingPickups((col + 0.5) * TILE, (row + 0.5) * TILE - 4, info.seed, seeds);
    } else {
      farmToast(st === "dead" ? "Natuyo na ang tanim — walang naani" : "Bulok na — walang naani");
    }
    saveGame();
  }
}

// placeHeldItemAt() (js/inventory.js) hands seeds and crops here first.
function farmHandleHeldPlacement(col, row) {
  if (!heldItem || player.scene !== "outside") return false;
  const def = itemDefs[heldItem.type];
  if (def.seedOf) {
    if (!inFarmRange(col, row)) return true;
    if (!isPlantable(col, row)) { if (!plotAt(col, row)) farmToast("Itanim sa naararong lupa (Dirt Rake)"); return true; }
    const slot = inventory[heldItem.fromSlot];
    if (!slot || slot.count <= 0) return true;
    const plot = plotAt(col, row);
    plot.crop = { veg: def.seedOf, growth: 0, lastT: farmNow(), ripeAt: null };
    plot.emptySince = null;
    commitPlacementUse(heldItem.fromSlot); // takes one seed, saves
    return true;
  }
  if (def.cropOf && /^plotSocket/.test(upperLayer.get(fkey(col, row)) || "")) {
    socketDeposit(col, row, heldItem.type);
    return true;
  }
  return false;
}

/* ---------------- sacks (Planting Sockets) ---------------- */
function socketTotal(items) { let n = 0; for (const v of Object.values(items || {})) n += v; return n; }
function socketItems(key) {
  const w = farmWorld();
  if (!w.sockets.has(key)) w.sockets.set(key, {});
  return w.sockets.get(key);
}
function socketDeposit(col, row, onlyType) {
  const key = fkey(col, row);
  if (upperLayer.get(key) !== "plotSocketOpen") { farmToast("Sarado ang sako — buksan muna"); return 0; }
  const items = socketItems(key);
  let room = SOCKET_CAPACITY - socketTotal(items), moved = 0;
  const movedTypes = [];
  for (const slot of inventory) {
    if (room <= 0) break;
    if (!slot || !itemDefs[slot.type] || !itemDefs[slot.type].cropOf || slot.count <= 0) continue;
    if (onlyType && slot.type !== onlyType) continue;
    const n = Math.min(room, slot.count);
    slot.count -= n; room -= n; moved += n; movedTypes.push(slot.type);
    items[slot.type] = (items[slot.type] || 0) + n;
  }
  if (moved) {
    socketDepositFx(col, row, movedTypes, moved);
    if (heldItem && inventory[heldItem.fromSlot] && inventory[heldItem.fromSlot].count <= 0) cancelHeldItem();
    renderHotbar(); renderInventory();
    farmToast("+" + moved + " sa sako (" + socketTotal(items) + "/" + SOCKET_CAPACITY + ")");
    saveGame();
  }
  return moved;
}

/* Deposit effects (per request): every time crops go into a sack it puffs
   up (a quick squash-and-grow), the crops fly into it from you in little
   arcs, a few sparkles pop out of its mouth and a "+N" floats up. */
const socketFx = [];   // { key, col, row, t } — the sack's pulse
const cropFlights = []; // { type, x0, y0, x1, y1, t, delay }
const socketSparks = []; // { x, y, vx, vy, t, life, color }
const socketPlusText = []; // { x, y, text, t }
function socketDepositFx(col, row, types, n) {
  const key = fkey(col, row);
  const old = socketFx.find((f) => f.key === key);
  if (old) old.t = 0; else socketFx.push({ key, col, row, t: 0 });
  const tx = (col + 0.5) * TILE, ty = row * TILE + 6;
  const fy = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE - 10;
  for (let i = 0; i < Math.min(8, n); i++) {
    cropFlights.push({ type: types[i % types.length], x0: player.x + (Math.random() - 0.5) * 6, y0: fy, x1: tx, y1: ty, t: 0, delay: i * 0.06 });
  }
  socketPlusText.push({ x: tx, y: row * TILE - 4, text: "+" + n, t: 0 });
}
function socketSparkBurst(x, y) {
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8, sp = 18 + Math.random() * 22;
    socketSparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.35 + Math.random() * 0.25,
      color: ["#fff6c8", "#ffe07a", "#ffffff"][i % 3] });
  }
}
function updateSocketFx(dt) {
  for (let i = socketFx.length - 1; i >= 0; i--) if ((socketFx[i].t += dt) > 0.45) socketFx.splice(i, 1);
  for (let i = cropFlights.length - 1; i >= 0; i--) {
    const f = cropFlights[i];
    f.t += dt;
    if (f.t - f.delay >= 0.42) { socketSparkBurst(f.x1, f.y1); cropFlights.splice(i, 1); }
  }
  for (let i = socketSparks.length - 1; i >= 0; i--) {
    const p = socketSparks[i];
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt;
    if (p.t > p.life) socketSparks.splice(i, 1);
  }
  for (let i = socketPlusText.length - 1; i >= 0; i--) if ((socketPlusText[i].t += dt) > 1.0) socketPlusText.splice(i, 1);
}
function drawSocketFx() {
  const z = zoom;
  // the sack puffing up: redrawn bigger over itself, squashing back
  for (const f of socketFx) {
    const type = upperLayer.get(f.key);
    const icon = type && itemDefs[type] && itemDefs[type].icon;
    if (!icon || !icon.width) continue;
    const k = f.t / 0.45, s = 1 + 0.3 * Math.sin(k * Math.PI); // grows, then settles back
    const w = icon.width * s * z, h = icon.height * s * z;
    const cx = ((f.col + 0.5) * TILE - camX) * z, by = ((f.row + 1) * TILE - camY) * z;
    ctx.drawImage(icon, cx - w / 2, by - h, w, h);
  }
  // crops flying in
  for (const f of cropFlights) {
    const u = Math.max(0, Math.min(1, (f.t - f.delay) / 0.42));
    if (u <= 0) continue;
    const icon = itemDefs[f.type] && itemDefs[f.type].icon;
    if (!icon || !icon.width) continue;
    const e = u * u * (3 - 2 * u);
    const x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e - Math.sin(u * Math.PI) * 18;
    const sz = 10 * (1 - 0.45 * u);
    ctx.drawImage(icon, (x - sz / 2 - camX) * z, (y - sz / 2 - camY) * z, sz * z, sz * z);
  }
  for (const p of socketSparks) {
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round((p.x - camX) * z), Math.round((p.y - camY) * z), Math.ceil(z), Math.ceil(z));
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.font = "bold " + Math.max(11, Math.round(3.4 * z)) + "px sans-serif";
  for (const t of socketPlusText) {
    const a = Math.min(1, 2 * (1 - t.t));
    const x = (t.x - camX) * z, y = (t.y - t.t * 10 - camY) * z;
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillText(t.text, x + 1, y + 1);
    ctx.fillStyle = "#ffe07a"; ctx.fillText(t.text, x, y);
  }
  ctx.globalAlpha = 1;
}

let socketPopupEl = null;
function closeSocketPopup() { if (socketPopupEl) socketPopupEl.style.display = "none"; }
function showSocketPopup(clientX, clientY, col, row) {
  if (!socketPopupEl) {
    socketPopupEl = document.createElement("div");
    socketPopupEl.style.cssText = "position:fixed;z-index:60;padding:6px;background:rgba(30,20,12,.94);border:2px solid #6b4a2b;border-radius:8px;color:#f3e2c3;font:12px monospace;display:none";
    socketPopupEl.addEventListener("mousedown", (e) => e.stopPropagation());
    document.body.appendChild(socketPopupEl);
    window.addEventListener("mousedown", closeSocketPopup);
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSocketPopup(); });
  }
  const key = fkey(col, row);
  const type = upperLayer.get(key);
  const open = type === "plotSocketOpen";
  socketPopupEl.innerHTML = "";
  const title = document.createElement("div");
  title.textContent = "Sako " + socketTotal(socketItems(key)) + "/" + SOCKET_CAPACITY;
  title.style.cssText = "margin:0 2px 4px;opacity:.8";
  socketPopupEl.appendChild(title);
  const btn = (label, fn) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "display:block;width:100%;margin:2px 0;padding:4px 10px;border:1px solid #6b4a2b;border-radius:4px;background:#3b2717;color:#f3e2c3;font:inherit;cursor:pointer";
    b.addEventListener("click", (e) => { e.stopPropagation(); closeSocketPopup(); fn(); });
    socketPopupEl.appendChild(b);
  };
  if (open) btn("Close", () => { upperLayer.set(key, "plotSocketClosed"); saveGame(); });
  else btn("Open", () => { upperLayer.set(key, "plotSocketOpen"); saveGame(); });
  btn("Hold", () => {
    if (heldItem || player.grabbedType) { farmToast("Puno ang kamay mo"); return; }
    farmPendingSocket = socketItems(key);
    farmWorld().sockets.delete(key);
    upperLayer.delete(key);
    player.grabbedType = type;
    player.mode = "carrying";
    saveGame();
  });
  socketPopupEl.style.left = Math.min(clientX + 8, window.innerWidth - 120) + "px";
  socketPopupEl.style.top = Math.min(clientY + 8, window.innerHeight - 110) + "px";
  socketPopupEl.style.display = "block";
}
function socketClick(e, col, row) {
  const key = fkey(col, row);
  if (upperLayer.get(key) === "plotSocketOpen") {
    const items = socketItems(key);
    if (socketTotal(items) < SOCKET_CAPACITY && socketDeposit(col, row) > 0) return;
  }
  showSocketPopup(e.clientX, e.clientY, col, row);
}

// Sacks follow their contents: picked up (E or Hold) -> carried; put down
// again -> the contents go with it; gone any other way -> back to the bag.
function farmSocketUpkeep() {
  const w = farmWorld();
  const carryingSack = player.grabbedType && /^plotSocket/.test(player.grabbedType);
  for (const [key, items] of w.sockets) {
    if (/^plotSocket/.test(upperLayer.get(key) || "")) continue;
    w.sockets.delete(key);
    if (!socketTotal(items)) continue;
    if (carryingSack && !farmPendingSocket) farmPendingSocket = items;
    else for (const [t, n] of Object.entries(items)) grantItem(t, n);
  }
  if (farmPendingSocket && !carryingSack) {
    const here = getPlayerTile();
    let best = null, bd = 1e9;
    if (player.scene === "outside") {
      for (const [key, type] of upperLayer) {
        if (!/^plotSocket/.test(type) || w.sockets.has(key)) continue;
        const [c, r] = fpos(key);
        const d = Math.abs(c - here.col) + Math.abs(r - here.row);
        if (d < bd && d <= 8) { bd = d; best = key; }
      }
    }
    if (best) w.sockets.set(best, farmPendingSocket);
    else for (const [t, n] of Object.entries(farmPendingSocket)) grantItem(t, n);
    farmPendingSocket = null;
    saveGame();
  }
}

/* ---------------- the collector ---------------- */
function drawersIn(world) {
  const out = [];
  const each = (key, type) => {
    if (type !== "plantDrawer") return;
    const [c, r] = fpos(key);
    out.push({ key, rect: getMultiTileFootprintRect("plantDrawer", c, r) });
  };
  if (world === currentWorld) for (const [k, t] of objectLayer) each(k, t);
  else if (typeof worldStore !== "undefined" && worldStore[world]) for (const [k, t] of worldStore[world].placedItems || []) each(k, t);
  return out;
}
function socketsOnDrawer(world, rect) {
  const out = [];
  for (const [key, items] of farmWorld(world).sockets) {
    const [c, r] = fpos(key);
    if (c >= rect.leftCol && c <= rect.rightCol && r >= rect.topRow && r <= rect.bottomRow && socketTotal(items) > 0) out.push(key);
  }
  return out;
}
function emptySockets(world, keys) {
  let gold = 0, count = 0;
  for (const key of keys) {
    const items = farmWorld(world).sockets.get(key);
    if (!items) continue;
    for (const [t, n] of Object.entries(items)) { gold += (CROP_SELL_PRICE[t] || 0) * n; count += n; }
    farmWorld(world).sockets.set(key, {});
  }
  if (gold) { player.gold += gold; renderGoldDisplays(); }
  return { gold, count };
}
function payToast(r) {
  if (r.count) showToast(COLLECTOR_NAME + " kinuha ang " + r.count + " na ani: +" + r.gold + " gold");
}

function startCollection() {
  farmLastCollectDay = getGameDay();
  let total = { gold: 0, count: 0 };
  const add = (r) => { total.gold += r.gold; total.count += r.count; };
  // other worlds: straight from the data
  for (const w of Object.keys(farmWorlds)) {
    if (w === currentWorld) continue;
    for (const d of drawersIn(w)) add(emptySockets(w, socketsOnDrawer(w, d.rect)));
  }
  const here = drawersIn(currentWorld).filter((d) => socketsOnDrawer(currentWorld, d.rect).length);
  if (here.length && player.scene === "outside") {
    if (total.count) payToast(total);
    spawnCollector(here);
  } else {
    for (const d of here) add(emptySockets(currentWorld, socketsOnDrawer(currentWorld, d.rect)));
    payToast(total);
  }
  saveGame();
}

function freeTile(c, r) { return farmBounds(c, r) && !isTileBlocked(c, r); }
function standTileFor(rect) {
  const mid = Math.round((rect.leftCol + rect.rightCol) / 2);
  const cands = [[mid, rect.bottomRow + 1], [mid - 1, rect.bottomRow + 1], [mid + 1, rect.bottomRow + 1],
    [rect.leftCol - 1, rect.bottomRow], [rect.rightCol + 1, rect.bottomRow], [mid, rect.topRow - 1]];
  for (const [c, r] of cands) if (freeTile(c, r)) return { col: c, row: r };
  return { col: mid, row: rect.bottomRow + 1 };
}
function findPath(from, to) {
  const pad = 14;
  const c0 = Math.min(from.col, to.col) - pad, c1 = Math.max(from.col, to.col) + pad;
  const r0 = Math.min(from.row, to.row) - pad, r1 = Math.max(from.row, to.row) + pad;
  const prev = new Map(), start = fkey(from.col, from.row), goal = fkey(to.col, to.row);
  const q = [from]; prev.set(start, null);
  while (q.length) {
    const cur = q.shift();
    const k = fkey(cur.col, cur.row);
    if (k === goal) {
      const path = []; let p = k;
      while (p) { const [c, r] = fpos(p); path.unshift({ col: c, row: r }); p = prev.get(p); }
      return path;
    }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = cur.col + dc, r = cur.row + dr, nk = fkey(c, r);
      if (c < c0 || c > c1 || r < r0 || r > r1 || prev.has(nk)) continue;
      if (nk !== goal && !freeTile(c, r)) continue;
      prev.set(nk, k); q.push({ col: c, row: r });
    }
  }
  return null;
}
function spawnCollector(drawers) {
  const first = standTileFor(drawers[0].rect);
  let start = null;
  for (let rad = 12; rad >= 5 && !start; rad--) {
    for (let i = 0; i < 40 && !start; i++) {
      const a = Math.random() * Math.PI * 2;
      const c = first.col + Math.round(Math.cos(a) * rad), r = first.row + Math.round(Math.sin(a) * rad);
      if (freeTile(c, r) && findPath({ col: c, row: r }, first)) start = { col: c, row: r };
    }
  }
  if (!start) { // nowhere to walk from — collect straight away
    let total = { gold: 0, count: 0 };
    for (const d of drawers) { const r = emptySockets(currentWorld, socketsOnDrawer(currentWorld, d.rect)); total.gold += r.gold; total.count += r.count; }
    payToast(total); return;
  }
  collector = {
    world: currentWorld, x: (start.col + 0.5) * TILE, y: (start.row + 0.5) * TILE, home: start,
    targets: drawers.slice(), path: findPath(start, first) || [], state: "walk", t: 0,
    facing: "down", anim: "walk", frame: 0, frameT: 0, paid: { gold: 0, count: 0 },
  };
}
function finishCollectorNow() {
  if (!collector) return;
  for (const d of collector.targets) {
    const r = emptySockets(collector.world, socketsOnDrawer(collector.world, d.rect));
    collector.paid.gold += r.gold; collector.paid.count += r.count;
  }
  payToast(collector.paid);
  collector = null;
  saveGame();
}
function updateCollector(dt) {
  const k = collector;
  if (!k) return;
  if (k.world !== currentWorld || player.scene !== "outside") { finishCollectorNow(); return; }
  if (k.state === "walk" || k.state === "leave") {
    const next = k.path[0];
    if (!next) {
      if (k.state === "leave") { collector = null; return; }
      k.state = "collect"; k.t = 2.2; k.anim = "idle"; k.facing = "up";
    } else {
      const tx = (next.col + 0.5) * TILE, ty = (next.row + 0.5) * TILE;
      const dx = tx - k.x, dy = ty - k.y, d = Math.hypot(dx, dy);
      const step = COLLECTOR_SPEED * dt;
      if (d <= step) { k.x = tx; k.y = ty; k.path.shift(); }
      else { k.x += (dx / d) * step; k.y += (dy / d) * step; }
      if (d > 0.01) k.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      k.anim = "walk";
    }
  } else if (k.state === "collect") {
    k.t -= dt;
    if (k.t <= 0) {
      const d = k.targets.shift();
      const r = emptySockets(k.world, socketsOnDrawer(k.world, d.rect));
      k.paid.gold += r.gold; k.paid.count += r.count;
      saveGame();
      const here = { col: Math.floor(k.x / TILE), row: Math.floor(k.y / TILE) };
      if (k.targets.length) { k.path = findPath(here, standTileFor(k.targets[0].rect)) || []; k.state = "walk"; }
      else { payToast(k.paid); k.path = findPath(here, k.home) || []; k.state = "leave"; }
    }
  }
  const frames = k.anim === "walk" ? 6 : 4;
  k.frameT += dt * (k.anim === "walk" ? ANIM_FPS.walk : ANIM_FPS.idle);
  k.frame = Math.floor(k.frameT) % frames;
}
function drawCollector() {
  const k = collector;
  const s = citizenSheets(COLLECTOR_ID);
  let sheet;
  if (k.facing === "down" || k.facing === "up") sheet = k.anim === "walk" ? (k.facing === "down" ? s.walkDown : s.walkUp) : (k.facing === "down" ? s.idleDown : s.idleUp);
  if (!sheet || !sheet.width) sheet = k.anim === "walk" ? (k.facing === "left" ? s.walkLeft : s.walkRight) : (k.facing === "left" ? s.idleLeft : s.idleRight);
  if (!sheet || !sheet.width) return;
  const size = DRAW_SIZE * zoom;
  const cy = k.y - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  const px = (k.x - camX) * zoom, py = (cy - camY) * zoom;
  const sx = (k.frame % Math.max(1, Math.floor(sheet.width / FRAME_SIZE))) * FRAME_SIZE;
  if (typeof drawShadow === "function") drawShadow(px, py - size / 2 + size * SPRITE_FEET_FRACTION, size, sheet, sx);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, sx, 0, FRAME_SIZE, FRAME_SIZE, px - size / 2, py - size / 2, size, size);
  ctx.save();
  ctx.font = Math.max(10, Math.round(3.2 * zoom)) + "px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,.6)";
  ctx.fillText(COLLECTOR_NAME, px + 1, py - size * 0.32 + 1);
  ctx.fillStyle = "#ffe9b0";
  ctx.fillText(COLLECTOR_NAME, px, py - size * 0.32);
  ctx.restore();
}

/* ---------------- per frame / periodic ---------------- */
let farmTickAcc = 0, farmLastT = performance.now();
function updateFarm() {
  const t = performance.now();
  const dt = Math.min(0.05, (t - farmLastT) / 1000);
  farmLastT = t;
  updateCollector(dt);
  updateSocketFx(dt);
  farmTickAcc += dt;
  if (farmTickAcc < 0.5) return;
  farmTickAcc = 0;
  // tilled soil that's gone (grabbed, built over...) takes its crop with it
  const w = farmWorld();
  for (const key of w.plots.keys()) if (dirtLayer.get(key) !== "dirtRake") w.plots.delete(key);
  farmRegrowEmptyPlots(w);
  farmSocketUpkeep();
  if (!collector && COLLECT_DAYS.includes(getWeekdayIndex()) && getGameHour() >= COLLECT_HOUR && farmLastCollectDay !== getGameDay()) {
    startCollection();
  }
}

// Per request: a hole that's never planted (or left empty after a harvest)
// for FARM_REGROW_HOURS goes back to the ground it was dug from — the grass
// tile / painted grass it had, or plain earth.
function farmRegrowEmptyPlots(w) {
  const now = farmNow();
  for (const [key, p] of w.plots) {
    if (p.crop) continue;
    if (p.emptySince == null) p.emptySince = now; // older saves: start the clock now
    if (now - p.emptySince < FARM_REGROW_HOURS * 3600) continue;
    const [c, r] = fpos(key);
    if ((player.scene === "outside") && c === getPlayerTile().col && r === getPlayerTile().row) continue; // not under your feet
    dirtLayer.delete(key);
    const o = p.orig || {};
    if (o.ground && !groundLayer.has(key)) groundLayer.set(key, o.ground);
    if (o.fill && typeof setGroundFill === "function") setGroundFill(c, r, true);
    w.plots.delete(key);
    if (typeof saveGame === "function") saveGame();
  }
}

/* ---------------- drawing ---------------- */
/* Tilled soil joins up like the grass tiles — per request ("kapag nag hoe
   ako sa ground ... may corner din ... simula sa solo tile dapat parang sa
   grass na may mga corner"): a lone tilled tile is the whole lumpy clod;
   every side that touches more tilled soil goes straight and seamless, the
   open sides keep the rounded edge and the corners round off. The pieces
   are assets.dirtRakeAuto (16 x 24x24, built from the Dirt Rake art). */
const DIRT_RAKE_AUTO = 24, DIRT_RAKE_PAD = 4;
function isRakeAt(col, row) { return dirtLayer.get(fkey(col, row)) === "dirtRake"; }
function dirtRakeMask(col, row) {
  return (isRakeAt(col, row - 1) ? 1 : 0) | (isRakeAt(col + 1, row) ? 2 : 0) | (isRakeAt(col, row + 1) ? 4 : 0) | (isRakeAt(col - 1, row) ? 8 : 0);
}
function drawRakePiece(sheet, col, row) {
  const m = dirtRakeMask(col, row), S = DIRT_RAKE_AUTO;
  const x = Math.round((col * TILE - DIRT_RAKE_PAD - camX) * zoom), y = Math.round((row * TILE - DIRT_RAKE_PAD - camY) * zoom);
  ctx.drawImage(sheet, m * S, 0, S, S, x, y, Math.ceil(S * zoom), Math.ceil(S * zoom));
}
// Called from drawDirtLayer() (js/camera.js); false = art not loaded, draw the plain tile.
function drawDirtRakeAuto(col, row) {
  const sheet = assets.dirtRakeAuto;
  if (!sheet || !sheet.complete || !sheet.naturalWidth) return false;
  drawRakePiece(sheet, col, row);
  return true;
}
let wetRakeAutoCanvas = null;
function wetRakeAutoArt() {
  const a = assets.dirtRakeAuto;
  if (!a || !a.complete || !a.naturalWidth) return null;
  if (wetRakeAutoCanvas) return wetRakeAutoCanvas;
  const cv = document.createElement("canvas");
  cv.width = a.naturalWidth; cv.height = a.naturalHeight;
  const g = cv.getContext("2d");
  g.drawImage(a, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "rgba(38, 20, 8, 0.45)";
  g.fillRect(0, 0, cv.width, cv.height);
  wetRakeAutoCanvas = cv;
  return cv;
}
let wetRakeCanvas = null;
function wetRakeArt() {
  const a = assets.dirtRake;
  if (!a || !a.width) return null;
  if (wetRakeCanvas) return wetRakeCanvas;
  const cv = document.createElement("canvas");
  cv.width = a.width; cv.height = a.height;
  const g = cv.getContext("2d");
  g.drawImage(a, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "rgba(38, 20, 8, 0.45)";
  g.fillRect(0, 0, cv.width, cv.height);
  wetRakeCanvas = cv;
  return cv;
}
// Wet soil: the Dirt Rake drawn darker on top of itself (js/camera.js, right after the dirt layer).
function drawFarmSoil() {
  if (player.scene !== "outside") return;
  const now = farmNow();
  const auto = wetRakeAutoArt();
  if (auto) { // the same auto-tiled piece as the dry soil, darker
    ctx.imageSmoothingEnabled = false;
    for (const [key, p] of farmWorld().plots) {
      if (!isPlotWet(p, now)) continue;
      const [c, r] = fpos(key);
      if (!isRakeAt(c, r)) continue;
      const x = (c * TILE - camX) * zoom, y = (r * TILE - camY) * zoom;
      if (x > view.width + 8 * zoom || y > view.height + 8 * zoom || x < -24 * zoom || y < -24 * zoom) continue;
      drawRakePiece(auto, c, r);
    }
    return;
  }
  const art = wetRakeArt();
  if (!art) return;
  for (const [key, p] of farmWorld().plots) {
    if (!isPlotWet(p, now)) continue;
    const [c, r] = fpos(key);
    const x = ((c + 0.5) * TILE - art.width / 2 - camX) * zoom, y = ((r + 1) * TILE - art.height - camY) * zoom;
    if (x > view.width || y > view.height || x + art.width * zoom < 0 || y + art.height * zoom < 0) continue;
    ctx.drawImage(art, x, y, art.width * zoom, art.height * zoom);
  }
}
function drawCrop(key, p, now) {
  const st = cropState(p, now);
  const [c, r] = fpos(key);
  const sheet = FARM_GROW_SHEETS[p.crop.veg];
  if (!sheet || !sheet.width) return;
  const z = zoom;
  if (st === "growing" && p.crop.growth <= 0) { // just sown: a few seeds in the soil
    ctx.fillStyle = "#e8d6a8";
    for (const [dx, dy] of [[5, 9], [9, 7], [10, 11], [6, 12]]) ctx.fillRect(Math.round((c * TILE + dx - camX) * z), Math.round((r * TILE + dy - camY) * z), Math.ceil(z), Math.ceil(z));
    return;
  }
  let frame;
  if (st === "ripe") frame = 3;
  else if (st === "rotten" || st === "dead") frame = 4;
  else { const f = p.crop.growth / (FARM_CROPS[p.crop.veg].hours * 3600); frame = f < 0.34 ? 0 : f < 0.67 ? 1 : 2; }
  const fw = 16, sw = Math.min(fw, sheet.width - frame * fw), h = sheet.height;
  const x = (c * TILE + (TILE - sw) / 2 - camX) * z, y = ((r + 1) * TILE - h - 2 - camY) * z;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, frame * fw, 0, sw, h, x, y, sw * z, h * z);
  // thirsty: a water drop over a growing crop on dry soil, going from blue to
  // red as the dry clock runs out
  if (st === "growing" && !isPlotWet(p, now)) {
    const k = Math.min(1, (p.crop.dry || 0) / (FARM_DRY_DIE_HOURS * 3600));
    const bob = Math.sin(performance.now() / 300) * 0.6;
    const dx = (c * TILE + TILE / 2 - camX) * z, dy = ((r + 1) * TILE - h - 6 + bob - camY) * z;
    ctx.fillStyle = k > 0.75 ? "#e0563c" : k > 0.4 ? "#e0a83c" : "#5cb4ff";
    ctx.beginPath();
    ctx.moveTo(dx, dy - 2.2 * z);
    ctx.quadraticCurveTo(dx + 1.6 * z, dy, dx, dy + 1.4 * z);
    ctx.quadraticCurveTo(dx - 1.6 * z, dy, dx, dy - 2.2 * z);
    ctx.fill();
  }
}
// Depth-sorted with everything else outdoors (renderWorldObjectsSorted(), js/camera.js).
function farmDrawables() {
  const out = [];
  if (player.scene !== "outside") return out;
  const now = farmNow();
  const c0 = Math.floor(camX / TILE) - 2, r0 = Math.floor(camY / TILE) - 2;
  const c1 = Math.ceil((camX + view.width / zoom) / TILE) + 2, r1 = Math.ceil((camY + view.height / zoom) / TILE) + 2;
  for (const [key, p] of farmWorld().plots) {
    if (!p.crop) continue;
    const [c, r] = fpos(key);
    if (c < c0 || c > c1 || r < r0 || r > r1) continue;
    out.push({ sortY: (r + 1) * TILE - 3, draw: () => drawCrop(key, p, now) });
  }
  if (collector && collector.world === currentWorld) out.push({ sortY: collector.y, draw: drawCollector });
  return out;
}

function strokeTile(c, r, strong) {
  const s = TILE * zoom;
  const x = Math.round((c * TILE - camX) * zoom), y = Math.round((r * TILE - camY) * zoom);
  ctx.strokeStyle = strong ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)";
  ctx.lineWidth = strong ? 2 : 1;
  ctx.strokeRect(x + (strong ? 1 : 0.5), y + (strong ? 1 : 0.5), s - (strong ? 2 : 1), s - (strong ? 2 : 1));
}
// The white borders: only the tiles that can be used right now, in reach.
function drawFarmHighlights() {
  if (player.scene !== "outside") return;
  const p = getPlayerTile();
  const tool = player.equippedWeapon;
  const seed = heldItem && itemDefs[heldItem.type].seedOf;
  const empty = !heldItem && !player.grabbedType;
  const mouse = screenToTile(lastMouseClientX, lastMouseClientY);
  const mouseIn = inFarmRange(mouse.col, mouse.row);
  ctx.save();
  for (let r = p.row - FARM_RANGE; r <= p.row + FARM_RANGE; r++) {
    for (let c = p.col - FARM_RANGE; c <= p.col + FARM_RANGE; c++) {
      let ok = false;
      if (seed) ok = isPlantable(c, r);
      else if (empty && tool === "farmHoe") ok = isTillable(c, r);
      else if (empty && tool === "farmCan") ok = !!plotAt(c, r);
      if (empty && isHarvestable(c, r)) ok = true;
      if (!ok) continue;
      strokeTile(c, r, mouseIn && mouse.col === c && mouse.row === r);
    }
  }
  // how full the sacks nearby are: a small badge "count/20" with a fill bar
  ctx.textAlign = "center";
  ctx.font = "bold " + Math.max(10, Math.round(2.9 * zoom)) + "px sans-serif";
  for (const [key, type] of upperLayer) {
    if (!/^plotSocket/.test(type)) continue;
    const [c, r] = fpos(key);
    if (Math.max(Math.abs(c - p.col), Math.abs(r - p.row)) > 3) continue;
    const n = socketTotal(farmWorld().sockets.get(key));
    const label = n + " / " + SOCKET_CAPACITY + (type === "plotSocketClosed" ? " (sarado)" : "");
    const x = ((c + 0.5) * TILE - camX) * zoom, y = (r * TILE - 3 - camY) * zoom;
    const tw = ctx.measureText(label).width + 10, th = Math.max(13, 4.2 * zoom);
    ctx.fillStyle = "rgba(20,14,8,.78)";
    ctx.fillRect(x - tw / 2, y - th, tw, th + 3);
    ctx.fillStyle = n >= SOCKET_CAPACITY ? "#e0563c" : "#7bd36a";
    ctx.fillRect(x - tw / 2, y + 1, tw * (n / SOCKET_CAPACITY), 2);
    ctx.fillStyle = n >= SOCKET_CAPACITY ? "#ffb070" : "#ffffff";
    ctx.fillText(label, x, y - th * 0.22);
  }
  drawSocketFx();
  ctx.restore();
}

/* ---------------- clicks ---------------- */
function farmOnMouseDown(e) {
  if (e.button !== 0) return;
  // the grocery keeper: click to shop
  if (player.scene === "inside" && typeof isInGrocery === "function" && isInGrocery() && !heldItem && !player.grabbedType) {
    const k = groceryKeeperHere();
    if (!k) return;
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    if (Math.abs(x - k.fx) < 10 && y > k.fy - 34 && y < k.fy + 4) { e.stopImmediatePropagation(); openGroceryShop(); }
    return;
  }
  if (player.scene !== "outside" || player.sitting || player.action || heldItem || player.grabbedType) return;
  const { col, row } = screenToTile(e.clientX, e.clientY);
  const handled = () => { e.stopImmediatePropagation(); e.preventDefault(); };
  const reach = Math.max(Math.abs(col - getPlayerTile().col), Math.abs(row - getPlayerTile().row));
  if (/^plotSocket/.test(upperLayer.get(fkey(col, row)) || "")) {
    handled();
    if (reach <= PLACEMENT_RANGE) socketClick(e, col, row); else farmToast("Lumapit pa sa sako");
    return;
  }
  if (reach <= FARM_RANGE && isHarvestable(col, row)) {
    handled(); startFarmAction("harvest", "collect", col, row); return;
  }
  if ((player.equippedWeapon === "farmHoe" || player.equippedWeapon === "farmCan") && reach <= FARM_RANGE) {
    if (farmTryToolAction({ col, row })) handled();
  }
}
view.addEventListener("mousedown", farmOnMouseDown, true);

/* ---------------- save ---------------- */
function serializeFarm() {
  const worlds = {};
  for (const [w, d] of Object.entries(farmWorlds)) {
    worlds[w] = { plots: Array.from(d.plots.entries()), sockets: Array.from(d.sockets.entries()).filter(([, v]) => socketTotal(v) > 0) };
  }
  return { worlds, lastCollectDay: farmLastCollectDay, pendingSocket: farmPendingSocket };
}
function loadFarm(data) {
  if (!data || typeof data !== "object") return;
  for (const [w, d] of Object.entries(data.worlds || {})) {
    const fw = farmWorld(w);
    fw.plots = new Map((d.plots || []).filter(([, p]) => p && typeof p === "object"));
    fw.sockets = new Map((d.sockets || []).filter(([, v]) => v && typeof v === "object"));
  }
  farmLastCollectDay = Number(data.lastCollectDay) || 0;
  farmPendingSocket = data.pendingSocket && typeof data.pendingSocket === "object" ? data.pendingSocket : null;
}

