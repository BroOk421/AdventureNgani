"use strict";

/* =================================================================
   STORAGE CHESTS + tools only in the Equipment list

   Per request ("nandito na lang sa list yung kahit wala na sa inventory
   para bawas sa space tapos lagyan mo pala ng function yung chest nabibili
   sa indoor na npc kapag lapag na click ... pag click open chest tapos
   lalabas yung mga slots na pop up same ng rows at column sa inventory
   kapag may iba pang chest different chest naman yun"):
   - Weapons and tools (anything equipped as a weapon: the Hoe, Axe,
     Pickaxe, Fishing Rod, Watering Can, swords, bows) no longer take up
     inventory slots: they're picked from the Equipment list (G) — and
     the hotbar.
   - A placed Chest (bldChest — Lita sells it; the houses have some too)
     is a storage box: click it (within reach) and a window opens with its
     slots (8 x 7, like the inventory) above your bag. Click a bag item to
     put the whole stack in (Shift = just one), click a chest slot to take
     it back. Every chest keeps its own things (by room / world and tile).
     Picking a chest up carries its contents along: put it down again and
     they're inside the new spot.
   Saved as player.chests = { "<in|room|key or out|world|key>": [slot...] }
   and player.carriedChests = [[slot...], ...].
================================================================= */

const STORAGE_COLS = 8, STORAGE_ROWS = 7, STORAGE_SIZE = STORAGE_COLS * STORAGE_ROWS;
const STORAGE_TYPES = new Set(["bldChest"]);
const STORAGE_REACH = 3 * TILE;

/* ---------------- weapons and tools: in the Equipment list, not the bag ---------------- */
{
  const shown = inventorySlotShown;
  inventorySlotShown = function (slot) {
    const d = slot && itemDefs[slot.type];
    if (d && d.equipSlot === "weapon" && !isDevMode()) return false;
    return shown.apply(this, arguments);
  };
}

// ...and not on the hotbar either (per request, "alisin mo rin sa slot yung mga default na weapon"):
// a weapon / tool put on a hotbar slot is taken off it again — the Equipment list (G) is where they live.
function purgeWeaponsFromHotbar() {
  if (isDevMode() || typeof hotbar === "undefined") return;
  let changed = false;
  for (let i = 0; i < hotbar.length; i++) {
    const s = hotbar[i] !== null ? inventory[hotbar[i]] : null;
    if (s && itemDefs[s.type] && itemDefs[s.type].equipSlot === "weapon") { hotbar[i] = null; changed = true; }
  }
  if (changed && typeof renderHotbar === "function") renderHotbar();
}
setInterval(purgeWeaponsFromHotbar, 700);

/* ---------------- the data ---------------- */
function storageState() {
  if (!player.chests || typeof player.chests !== "object") player.chests = {};
  if (!Array.isArray(player.carriedChests)) player.carriedChests = [];
  return player.chests;
}
function chestHasItems(list) { return Array.isArray(list) && list.some((s) => s && s.count > 0); }
function chestSlots(key) {
  const all = storageState();
  let list = all[key];
  if (!Array.isArray(list)) list = all[key] = [];
  while (list.length < STORAGE_SIZE) list.push(null);
  return list;
}
function indoorPrefix() { return "in|" + player.activeRoomId + "|"; }
function outdoorPrefix() { return "out|" + (typeof currentWorld !== "undefined" ? currentWorld : "main") + "|"; }
// a chest picked up takes its things with it; the next chest put down gets them
function watchChestMap(map, prefixFn) {
  if (!map || map.__chestWatch) return;
  map.__chestWatch = true;
  const set = map.set, del = map.delete;
  map.delete = function (k) {
    if (STORAGE_TYPES.has(this.get(k))) {
      const all = storageState(), key = prefixFn() + k;
      if (chestHasItems(all[key])) { player.carriedChests.push(all[key]); if (typeof showToast === "function") showToast("The chest's things come with it"); }
      delete all[key];
    }
    return del.apply(this, arguments);
  };
  map.set = function (k, v) {
    const r = set.apply(this, arguments);
    if (STORAGE_TYPES.has(v) && player.carriedChests && player.carriedChests.length && (player.grabbedType || (typeof heldItem !== "undefined" && heldItem))) {
      storageState()[prefixFn() + k] = player.carriedChests.pop();
    }
    return r;
  };
}
watchChestMap(objectLayer, outdoorPrefix);
setInterval(() => { // the rooms' furniture maps (made as rooms load)
  if (typeof INTERIOR_ROOMS === "undefined") return;
  for (const [id, room] of Object.entries(INTERIOR_ROOMS)) if (room && room.decor) watchChestMap(room.decor, () => "in|" + id + "|");
}, 500);

/* ---------------- finding the chest under the pointer ---------------- */
function chestAtPoint(x, y) {
  const inside = player.scene === "inside";
  const room = inside ? INTERIOR_ROOMS[player.activeRoomId] : null;
  const map = inside ? room && room.decor : objectLayer;
  if (!map) return null;
  const pc = Math.floor(x / TILE), pr = Math.floor(y / TILE);
  for (let r = pr + 2; r >= pr - 1; r--) for (let c = pc - 1; c <= pc + 1; c++) {
    const k = c + "," + r, t = map.get(k);
    if (!STORAGE_TYPES.has(t)) continue;
    const ic = itemDefs[t] && itemDefs[t].icon, w = ic && ic.width ? ic.width : 32, h = ic && ic.height ? ic.height : 32;
    const cx = (c + 0.5) * TILE, by = (r + 1) * TILE;
    if (x >= cx - w / 2 && x <= cx + w / 2 && y >= by - h && y <= by + 2) return { key: (inside ? "in|" + player.activeRoomId + "|" : outdoorPrefix()) + k, x: cx, y: by - 4 };
  }
  return null;
}
let storageClickPending = null;
view.addEventListener("mousedown", (e) => {
  storageClickPending = null;
  if (e.button !== 0 || (typeof heldItem !== "undefined" && heldItem) || player.grabbedType) return;
  const { x, y } = screenToWorld(e.clientX, e.clientY);
  const hit = chestAtPoint(x, y);
  if (!hit) return;
  const fy = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  if (Math.hypot(hit.x - player.x, hit.y - fy) > STORAGE_REACH) { if (typeof showToast === "function") showToast("Too far — get closer to the chest"); e.stopImmediatePropagation(); return; }
  storageClickPending = hit;
  e.stopImmediatePropagation();
}, true);
view.addEventListener("click", (e) => {
  const hit = storageClickPending;
  storageClickPending = null;
  if (!hit) return;
  e.stopImmediatePropagation();
  openStorage(hit.key);
}, true);

/* ---------------- the window ---------------- */
let storageEl = null, storageKey = null;
function openStorage(key) {
  if (!storageEl) {
    storageEl = document.createElement("div");
    storageEl.id = "storage-overlay";
    storageEl.innerHTML = '<div id="storage-panel"><div id="storage-head"><b>📦 Chest</b><span class="hint">click to move · Shift = one</span><button id="storage-close">✕</button></div>' +
      '<div id="storage-grid" class="storage-grid"></div><div class="storage-sec">Your bag</div><div id="storage-bag" class="storage-grid scroll-ok"></div></div>';
    document.body.appendChild(storageEl);
    storageEl.addEventListener("pointerdown", (e) => { if (e.target === storageEl) closeStorage(); });
    storageEl.querySelector("#storage-close").addEventListener("click", closeStorage);
    window.addEventListener("keydown", (e) => { if (storageKey && (e.key === "Escape" || e.key.toLowerCase() === "e")) { e.stopImmediatePropagation(); closeStorage(); } }, true);
  }
  storageKey = key;
  storageEl.style.display = "flex";
  renderStorage();
}
function closeStorage() { storageKey = null; if (storageEl) storageEl.style.display = "none"; if (typeof saveGame === "function") saveGame(); }
function storageSlotEl(slot, onClick) {
  const b = document.createElement("div");
  b.className = "storage-slot" + (slot ? "" : " empty");
  if (slot && itemDefs[slot.type]) {
    b.dataset.itemType = slot.type; // hover info (js/itemInfo.js)
    b.innerHTML = '<img src="' + itemDefs[slot.type].icon.src + '"><span class="n">' + slot.count + "</span>";
    b.addEventListener("click", (e) => onClick(e.shiftKey));
  }
  return b;
}
function bagSlots() {
  const worn = new Set(Object.values(player.equipment || {}));
  if (player.equippedWeapon) worn.add(player.equippedWeapon);
  return inventory.map((s, i) => [s, i]).filter(([s]) => s && s.count > 0 && itemDefs[s.type] && !itemDefs[s.type].unlimited && !worn.has(s.type) && itemDefs[s.type].equipSlot !== "weapon");
}
function renderStorage() {
  if (!storageKey) return;
  const list = chestSlots(storageKey);
  const G = storageEl.querySelector("#storage-grid"), B = storageEl.querySelector("#storage-bag");
  G.innerHTML = ""; B.innerHTML = "";
  list.forEach((slot, i) => G.appendChild(storageSlotEl(slot && slot.count > 0 ? slot : null, (one) => takeFromChest(i, one))));
  const bag = bagSlots();
  for (const [slot, i] of bag) B.appendChild(storageSlotEl(slot, (one) => putInChest(i, one)));
  if (!bag.length) B.innerHTML = '<div class="storage-empty">Nothing to store.</div>';
}
function putInChest(invIndex, one) {
  const slot = inventory[invIndex];
  if (!slot || slot.count <= 0) return;
  const n = one ? 1 : slot.count;
  const list = chestSlots(storageKey);
  let dest = list.find((s) => s && s.type === slot.type);
  if (!dest) {
    const i = list.findIndex((s) => !s || s.count <= 0);
    if (i < 0) { if (typeof showToast === "function") showToast("The chest is full"); return; }
    dest = list[i] = { type: slot.type, count: 0 };
  }
  dest.count += n; slot.count -= n;
  if (typeof renderInventory === "function") renderInventory();
  if (typeof renderHotbar === "function") renderHotbar();
  renderStorage();
}
function takeFromChest(i, one) {
  const list = chestSlots(storageKey), s = list[i];
  if (!s || s.count <= 0) return;
  const n = one ? 1 : s.count;
  grantItem(s.type, n);
  s.count -= n;
  if (s.count <= 0) list[i] = null;
  renderStorage();
}

/* ---------------- saving ---------------- */
{
  const saveBase = buildSaveData;
  buildSaveData = function () { const d = saveBase.apply(this, arguments); d.chests = storageState(); d.carriedChests = player.carriedChests || []; return d; };
  const loadBase = applySaveData;
  applySaveData = function (data) {
    const r = loadBase.apply(this, arguments);
    purgeWeaponsFromHotbar();
    player.chests = data && data.chests && typeof data.chests === "object" ? data.chests : {};
    player.carriedChests = data && Array.isArray(data.carriedChests) ? data.carriedChests : [];
    return r;
  };
}
