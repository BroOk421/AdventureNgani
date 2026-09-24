"use strict";

/* =================================================================
   SAVE / LOAD / EXPORT / IMPORT — persists progress in the browser's
   localStorage so whatever you do (items placed, inventory counts,
   hotbar assignments, where you are) is still there next time you open
   the game, instead of resetting. Export/Import let you move that save
   to a different PC/browser as a plain JSON file, since localStorage
   itself never leaves the browser it was written in.

   What's saved: terrainLayer + groundLayer + decorLayer + objectLayer
   (placed items, see the four-layer split in js/inventory.js), interiorCollisions
   (Collision Blocks placed inside interior rooms, js/interior.js), interiorDecor
   (ordinary items placed indoors, js/interior.js), pendingRespawns (broken
   stones waiting to come back, js/resources.js), pendingConstructions
   (house builds in progress, js/inventory.js), inventory counts,
   hotbar assignments, selectedHotbarIndex, equippedWeapon, grabbedType
   (the E-key grabbed world object, js/inventory.js's
   tryGrabOrPlaceInFront() — saved, unlike heldItem below, because it's
   already been removed from the world the moment it's grabbed, so
   forgetting it on reload would just delete it), gold, the health/
   stamina/food/exp stats and accumulated playTimeSeconds (js/hud.js),
   and the player's position.
   What's NOT saved (deliberately reset each load): heldItem (whether
   you're mid-hold from the INVENTORY — nothing's been removed from the
   world yet at that point, so there's nothing to lose by resetting it),
   resourceHits (in-progress hit counts on a not-yet-broken stone/tree),
   wildgrassSway (js/wildgrass.js — a live animation, not progress),
   weather (js/hud.js — cosmetic, resets to "Clear" on reload), and
   whether the inventory panel/action menu is open — those are momentary
   state, not "progress".

   IMPORTANT — inventory/hotbar are saved and restored by item TYPE, not
   by array index. The inventory's slot layout comes entirely from
   itemDefs (js/inventory.js) and has shifted several times as items were
   added/removed/reordered there. Saving/restoring the raw `inventory`
   array by index used to mean: loading an old save (or importing an old
   exported file) would overwrite the freshly-built, correct inventory
   with whatever shorter/differently-shaped array the old save had —
   which is exactly what made newly-added items "disappear" after an
   import. Keying by type instead is stable no matter how itemDefs
   changes shape later; applySaveData() always rebuilds the inventory
   fresh from the current itemDefs first, then only layers saved COUNTS
   on top by type, ignoring any saved type that no longer exists.
================================================================= */
const SAVE_KEY = "rpg-prototype-save-v1";

function buildSaveData() {
  // Counts keyed by item type, not by slot index — see the note above.
  const itemCounts = {};
  inventory.forEach((slot) => {
    if (slot) itemCounts[slot.type] = slot.count;
  });

  // Hotbar assignments keyed by item type too, for the same reason: a
  // raw inventory index only means something for the itemDefs shape it
  // was saved under.
  const hotbarTypes = hotbar.map((idx) => (idx !== null && inventory[idx]) ? inventory[idx].type : null);

  return {
    // Every layer in one array. The layer an item belongs to is decided
    // by layerForType() (js/inventory.js) and re-derived on load, so the
    // save never has to name them — which is also why the 4-layer saves
    // written before the six-layer split still load correctly: their
    // entries just get re-sorted into today's layers.
    placedItems: ALL_LAYERS.flatMap((layer) => Array.from(layer.entries())),
    pendingRespawns: Array.from(pendingRespawns.entries()), // [[ "col,row", {type, respawnAt} ], ...]
    pendingConstructions: Array.from(pendingConstructions.entries()), // [[ "col,row", {type, col, row, startAt, finishAt} ], ...]
    // Every interior room's own Collision Block placements (js/interior.
    // js's `INTERIOR_ROOMS[roomId].collisions`), keyed by roomId so each
    // room layout keeps its own set — { roomId: [["col,row", type], ...] }.
    interiorCollisions: Object.fromEntries(
      Object.keys(INTERIOR_ROOMS).map((roomId) => [roomId, Array.from(INTERIOR_ROOMS[roomId].collisions.entries())])
    ),
    // Every interior room's ordinary placed decor (js/interior.js's
    // `INTERIOR_ROOMS[roomId].decor` — doors, picture frames, windows,
    // furniture placed indoors via placeInteriorDecorAt()), saved the
    // same shape/reasoning as interiorCollisions above, just a separate
    // map since the two are independent layers.
    interiorDecor: Object.fromEntries(
      Object.keys(INTERIOR_ROOMS).map((roomId) => [roomId, Array.from(INTERIOR_ROOMS[roomId].decor.entries())])
    ),
    itemCounts,
    hotbarTypes,
    selectedHotbarIndex: selectedHotbarIndex,
    equippedWeapon: player.equippedWeapon, // type string, or null
    grabbedType: player.grabbedType, // type string, or null — the E-key grabbed world object (js/inventory.js); saved, unlike heldItem, since it's already removed from the world the moment it's grabbed
    gold: player.gold, // currency, spent at the NPC shop (js/npc.js)
    // Stats (js/hud.js's bars) — real character state, so all four are
    // saved just like gold. health/exp don't change yet (no damage/
    // leveling system exists), but saving them now means nothing needs
    // to change here once those are wired up later.
    health: player.health,
    stamina: player.stamina,
    food: player.food,
    exp: player.exp,
    playTimeSeconds: player.playTimeSeconds, // accumulated across sessions — the HUD's "Duration" readout
    // While inside an interior scene (js/interior.js), player.x/y are in
    // that room's own small coordinate space, not the outdoor map —
    // saving those directly would spawn the player near the outdoor
    // map's top-left corner on reload (scene always resets to
    // "outside" below, since a room can be re-entered any time by
    // walking back up to the same door). Save `outsideReturn` (where
    // they were standing right before they went in) instead whenever
    // that's the case, so a reload while indoors still comes back
    // outside in the right spot.
    //
    // Same idea for sitting on a chair/bench (js/furniture.js): while
    // seated, player.x/y is the SEAT's tile, which is part of the
    // furniture's own solid footprint — reloading into it would drop the
    // player inside a collider. `sitPreX/Y` (where they were standing
    // when they clicked to sit — the front tile) is the safe spot, and
    // it's exactly where standing up would have put them anyway.
    player: player.scene === "inside" && player.outsideReturn
      ? { x: player.outsideReturn.x, y: player.outsideReturn.y }
      : player.sitting
        ? { x: player.sitPreX, y: player.sitPreY }
        : { x: player.x, y: player.y }
  };
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildSaveData()));
  } catch (e) {
    console.error("Failed to save game:", e);
  }
}

// Shared by loadGame() (from localStorage) and importSaveFromFile() (from
// a file) — applies a parsed save object to the live game state in place,
// so every other file's references to inventory/groundLayer/decorLayer/
// objectLayer/hotbar/player stay valid (nothing gets replaced wholesale,
// just mutated).
/* ---------------- renamed item types ----------------
   The three buildings were renamed (house1 -> house, house2 -> tavern,
   house3 -> abandonHouse) and their interiors split one-per-building
   (smallInterior -> house_room, and the one shared "sharedHouse" layout
   into tavern_room and abandon_room). A save written before that still
   says the old names everywhere it stores a type, and every one of those
   lookups goes through itemDefs — so without translating them on load,
   every house already placed in the world would be dropped as an
   "unknown item type" and its interior would go with it.

   Applied to layers, construction/respawn timers, inventory counts,
   hotbar slots and whatever's in hand. New saves never contain the old
   names, so this quietly does nothing from here on. */
const RENAMED_ITEM_TYPES = {
  house1: "house",
  house2: "tavern",
  house3: "abandonHouse",
};

function migrateItemType(type) {
  return RENAMED_ITEM_TYPES[type] || type;
}

/* The room-layout half of the same rename. An interior id is
   `blueprint@col,row` (js/interior.js), so only the blueprint part
   changes — the building's tile stays as it is.

   "sharedHouse" is the awkward one: it was ONE layout used by both the
   tavern and the abandoned house, so which of the two new layouts a
   saved room becomes can't be read off its id. It's resolved from the
   world instead — whatever building actually stands on that tile decides
   it. `placedTypeAt` is a "col,row" -> type map of the already-restored
   outdoor layers. Falling back to tavern_room keeps the old art if the
   building has since been removed. */
function migrateRoomBlueprintId(roomId, placedTypeAt) {
  const at = roomId.indexOf("@");
  const blueprint = at === -1 ? roomId : roomId.slice(0, at);
  const suffix = at === -1 ? "" : roomId.slice(at);
  if (blueprint === "smallInterior") return "house_room" + suffix;
  if (blueprint === "sharedHouse") {
    const type = at === -1 ? null : placedTypeAt[roomId.slice(at + 1)];
    return (type === "abandonHouse" ? "abandon_room" : "tavern_room") + suffix;
  }
  return roomId;
}

function applySaveData(data) {
  // Every placed-item entry, regardless of which array it came from
  // (current 4-layer format, the 3-layer format before terrainLayer
  // existed, the 2-layer format before that, or the original single
  // `groundItems` array from before any layer split) — merged into one
  // list and then re-sorted into the CURRENT layer for each type via
  // layerForType(), rather than trusting whichever bucket the save
  // happened to file it under. This matters because itemDefs' flat/layer
  // flags have shifted more than once as this project grew (stones
  // gaining/losing `flat`, wild grass moving to its own layer, Dirt/
  // Water moving to their own layer, etc.) — re-deriving on load means an
  // old save always ends up with today's correct layering instead of
  // stale data just being copied into today's map of the same name.
  const incomingEntries = []
    .concat(data.placedItems || [])   // current format: one flat list
    .concat(data.terrainLayer || [])  // 4-layer format
    .concat(data.groundLayer || [])
    .concat(data.decorLayer || [])
    .concat(data.objectLayer || [])
    .concat(data.groundItems || []); // oldest, pre-layer-split format

  if (incomingEntries.length > 0 || Array.isArray(data.placedItems) || Array.isArray(data.terrainLayer) || Array.isArray(data.groundLayer) || Array.isArray(data.decorLayer) || Array.isArray(data.objectLayer) || Array.isArray(data.groundItems)) {
    ALL_LAYERS.forEach((layer) => layer.clear());
    incomingEntries.forEach(([key, rawType]) => {
      const type = migrateItemType(rawType);
      if (!itemDefs[type]) return; // stale/removed item type — drop it, don't crash on it
      layerForType(type).set(key, type);
    });
  }

  // Broken-stone respawn timers (js/resources.js) — restored as-is; a
  // timer whose respawnAt has already passed just gets caught by the next
  // updateResources() call right after loading, same as if the tab had
  // stayed open the whole time.
  pendingRespawns.clear();
  if (Array.isArray(data.pendingRespawns)) {
    data.pendingRespawns.forEach(([key, info]) => {
      if (!info) return;
      const migrated = Object.assign({}, info, { type: migrateItemType(info.type) });
      if (itemDefs[migrated.type]) pendingRespawns.set(key, migrated); // skip a stale/removed type
    });
  }

  // In-progress house builds (js/inventory.js's pendingConstructions) —
  // restored as-is; one whose finishAt already passed just gets caught by
  // the next updateConstructions() call right after loading, same as if
  // the tab had stayed open the whole time (updateConstructions()'s own
  // "don't trap the player" check applies then too).
  pendingConstructions.clear();
  if (Array.isArray(data.pendingConstructions)) {
    data.pendingConstructions.forEach(([key, info]) => {
      if (!info) return;
      const migrated = Object.assign({}, info, { type: migrateItemType(info.type) });
      if (itemDefs[migrated.type]) pendingConstructions.set(key, migrated);
    });
  }

  // --- migrating saves made before rooms became one-per-building ---
  // Interiors used to be keyed by LAYOUT ("sharedHouse"), shared by every
  // house of that kind; they're now keyed per building
  // ("sharedHouse@col,row" — js/interior.js). A save written before that
  // change carries the old bare id, and nothing would ever look it up
  // again, so everything the player had put inside their house would
  // silently vanish on the first load after updating.
  //
  // So an old bare id is re-pointed at a building that's actually placed
  // and uses that layout. The outdoor layers are restored further up, so
  // they can be searched here. With more than one candidate the first is
  // taken: the contents were one shared room, so there's no information
  // left about which house they "belonged" to — putting them in a real
  // house beats dropping them. If no such building exists at all the id
  // is left alone, and the room simply sits unused rather than erroring.
  //
  // Runs alongside the blueprint RENAME (migrateRoomBlueprintId() above),
  // which needs to know what building stands on a given tile to tell a
  // tavern's old shared room from an abandoned house's — hence this map,
  // built from the outdoor layers restored just above.
  const placedTypeAt = {};
  for (const layer of ALL_LAYERS) {
    for (const [key, type] of layer) placedTypeAt[key] = type;
  }
  const migrateLegacyRoomId = (roomId) => {
    let id = roomId;
    if (!id.includes("@")) {
      // Pre-per-building id: point it at a building that's actually
      // placed and uses that layout.
      for (const layer of ALL_LAYERS) {
        let hit = null;
        for (const [key, type] of layer) {
          const def = itemDefs[type];
          if (!def || !def.interior) continue;
          // Compare against the OLD blueprint name the save would have
          // used for this building, not today's.
          const oldName = { house_room: "smallInterior", tavern_room: "sharedHouse", abandon_room: "sharedHouse" }[def.interior.roomId];
          if (def.interior.roomId !== id && oldName !== id) continue;
          const [col, row] = key.split(",").map(Number);
          hit = interiorRoomId(id, col, row);
          break;
        }
        if (hit) { id = hit; break; }
      }
    }
    return migrateRoomBlueprintId(id, placedTypeAt);
  };

  // Every interior room's Collision Block placements (js/interior.js) —
  // restored per-room by roomId, same defensive "drop it if the type no
  // longer exists" treatment as every other layer above. Always clears
  // every known room first (even one with nothing saved for it), so an
  // old save made before this feature existed just leaves every room
  // with an empty map instead of crashing on a missing key.
  //
  // Rooms are now one-per-building (js/interior.js's INTERIOR_ROOMS),
  // created the first time that building is walked into — so on a fresh
  // load NONE of them exist yet and every saved room would otherwise be
  // silently dropped, wiping the contents of every house on reload.
  // getOrCreateInteriorRoom() rebuilds each one from its id instead,
  // which is exactly what the `blueprint@col,row` id format is for. It
  // returns null for an id whose blueprint no longer exists, and that
  // room's saved contents are then dropped on purpose.
  Object.keys(INTERIOR_ROOMS).forEach((roomId) => {
    INTERIOR_ROOMS[roomId].collisions.clear();
  });
  if (data.interiorCollisions && typeof data.interiorCollisions === "object") {
    Object.entries(data.interiorCollisions).forEach(([roomId, entries]) => {
      if (!Array.isArray(entries)) return;
      const room = getOrCreateInteriorRoom(migrateLegacyRoomId(roomId));
      if (!room) return;
      entries.forEach(([key, type]) => {
        if (itemDefs[type]) room.collisions.set(key, type);
      });
    });
  }

  // Same restore, same defensive treatment, for the interior `decor` map
  // (ordinary items placed indoors — js/interior.js's
  // placeInteriorDecorAt()) — independent of collisions above, so it
  // gets its own clear + restore pass.
  Object.keys(INTERIOR_ROOMS).forEach((roomId) => {
    INTERIOR_ROOMS[roomId].decor.clear();
  });
  if (data.interiorDecor && typeof data.interiorDecor === "object") {
    Object.entries(data.interiorDecor).forEach(([roomId, entries]) => {
      if (!Array.isArray(entries)) return;
      const room = getOrCreateInteriorRoom(migrateLegacyRoomId(roomId));
      if (!room) return;
      entries.forEach(([key, type]) => {
        if (itemDefs[type]) room.decor.set(key, type);
      });
    });
  }

  // Every interior room's Collision Block placements (js/interior.js) —
  // restored per-room by roomId, same defensive "drop it if the type no
  // longer exists" treatment as every other layer above. Always clears
  // every known room first (even one with nothing saved for it), so an
  // old save made before this feature existed just leaves every room
  // with an empty map instead of crashing on a missing key.
  Object.keys(INTERIOR_ROOMS).forEach((roomId) => {
    INTERIOR_ROOMS[roomId].collisions.clear();
  });
  if (data.interiorCollisions && typeof data.interiorCollisions === "object") {
    Object.entries(data.interiorCollisions).forEach(([roomId, entries]) => {
      const room = INTERIOR_ROOMS[roomId];
      if (!room || !Array.isArray(entries)) return;
      entries.forEach(([key, type]) => {
        if (itemDefs[type]) room.collisions.set(key, type);
      });
    });
  }

  // Same restore, same defensive treatment, for the interior `decor` map
  // (ordinary items placed indoors — js/interior.js's
  // placeInteriorDecorAt()) — independent of collisions above, so it
  // gets its own clear + restore pass.
  Object.keys(INTERIOR_ROOMS).forEach((roomId) => {
    INTERIOR_ROOMS[roomId].decor.clear();
  });
  if (data.interiorDecor && typeof data.interiorDecor === "object") {
    Object.entries(data.interiorDecor).forEach(([roomId, entries]) => {
      const room = INTERIOR_ROOMS[roomId];
      if (!room || !Array.isArray(entries)) return;
      entries.forEach(([key, type]) => {
        if (itemDefs[type]) room.decor.set(key, type);
      });
    });
  }

  // Always rebuild the inventory fresh from the CURRENT itemDefs first —
  // never from whatever shape/length an old save's array says — then
  // layer saved counts on top by item type. This is what stops an old
  // save (or an old exported file) from wiping out items added to the
  // game after that save was made.
  resetInventoryFromItemDefs();

  let itemCounts = data.itemCounts || legacyItemCountsFromOldInventoryArray(data.inventory);
  if (itemCounts) {
    // Counts are keyed BY TYPE, so a renamed building's stack would
    // otherwise be filed under a name no slot has any more.
    const remapped = {};
    Object.entries(itemCounts).forEach(([type, n]) => { remapped[migrateItemType(type)] = n; });
    itemCounts = remapped;
  }
  if (itemCounts) {
    inventory.forEach((slot) => {
      if (slot && Object.prototype.hasOwnProperty.call(itemCounts, slot.type)) {
        slot.count = itemCounts[slot.type];
      }
    });
  }

  if (Array.isArray(data.hotbarTypes)) {
    const typeToIndex = {};
    inventory.forEach((slot, i) => {
      if (slot) typeToIndex[slot.type] = i;
    });
    for (let i = 0; i < hotbar.length && i < data.hotbarTypes.length; i++) {
      const type = migrateItemType(data.hotbarTypes[i]);
      hotbar[i] = (type !== null && Object.prototype.hasOwnProperty.call(typeToIndex, type)) ? typeToIndex[type] : null;
    }
  } else if (Array.isArray(data.hotbar)) {
    // legacy save format (raw inventory indices) — best effort; may not
    // line up perfectly if itemDefs' order changed since, but won't crash
    for (let i = 0; i < hotbar.length && i < data.hotbar.length; i++) {
      hotbar[i] = data.hotbar[i];
    }
  }

  if (typeof data.selectedHotbarIndex === "number") {
    selectedHotbarIndex = data.selectedHotbarIndex;
  }

  // Only restore an equipped weapon if that type still exists AND is
  // still actually a weapon (defensive against a stale save referencing
  // an item that got removed/reclassified since) — otherwise leave it
  // unequipped rather than risk itemDefs[type].weapon being undefined
  // later when something tries to read attackAnim from it.
  player.equippedWeapon = (
    typeof data.equippedWeapon === "string" &&
    itemDefs[data.equippedWeapon] &&
    itemDefs[data.equippedWeapon].equipSlot === "weapon"
  ) ? data.equippedWeapon : null;

  // Same defensive pattern for the E-key grabbed object — only restore
  // it if that type still exists in the current itemDefs. `player.mode`
  // is derived from this rather than saved separately, so the carrying
  // pose always matches whether something's actually in hand.
  const grabbed = migrateItemType(data.grabbedType);
  player.grabbedType = (typeof grabbed === "string" && itemDefs[grabbed])
    ? grabbed
    : null;
  player.mode = player.grabbedType ? "carrying" : "normal";

  // Defensive against a corrupted/negative value the same way the other
  // restores here guard against a stale type — falls back to the
  // starting amount rather than trusting an unexpected value outright.
  player.gold = (typeof data.gold === "number" && data.gold >= 0) ? data.gold : player.gold;
  renderGoldDisplays();

  // Same defensive "trust it only if it's a sane number" pattern as
  // gold above, clamped to each stat's max so a corrupted/edited save
  // can't push a bar over 100% either.
  if (typeof data.health === "number") player.health = Math.max(0, Math.min(player.maxHealth, data.health));
  if (typeof data.stamina === "number") player.stamina = Math.max(0, Math.min(player.maxStamina, data.stamina));
  if (typeof data.food === "number") player.food = Math.max(0, Math.min(player.maxFood, data.food));
  if (typeof data.exp === "number") player.exp = Math.max(0, Math.min(player.maxExp, data.exp));
  if (typeof data.playTimeSeconds === "number" && data.playTimeSeconds >= 0) player.playTimeSeconds = data.playTimeSeconds;

  if (data.player && typeof data.player.x === "number" && typeof data.player.y === "number") {
    player.x = data.player.x;
    player.y = data.player.y;
  }
  // Always resume outside (see buildSaveData()'s matching comment above)
  // — a room is only ever a door-tile away, so there's nothing lost by
  // not resuming indoors, and it sidesteps ever restoring `scene:
  // "inside"` without a matching valid `activeInteriorType`/room.
  player.scene = "outside";
  player.activeInteriorType = null;
  player.activeRoomId = null;
  player.outsideReturn = null;

  renderHotbar();
  renderInventory();
  renderEquippedWeaponHUD();
}

// Converts a very old save's raw `inventory` array (before counts were
// keyed by type) into a type->count map, so it can go through the same
// overlay path as the current format instead of needing its own branch.
function legacyItemCountsFromOldInventoryArray(oldInventory) {
  if (!Array.isArray(oldInventory)) return null;
  const counts = {};
  oldInventory.forEach((slot) => {
    if (slot && slot.type) counts[slot.type] = slot.count;
  });
  return counts;
}

function loadGame() {
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    console.error("Failed to read save data:", e);
    return;
  }
  if (!raw) return; // nothing saved yet — keep the defaults as-is

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error("Save data was corrupt, ignoring it:", e);
    return;
  }

  applySaveData(data);
}

// Wipes the save and reloads the page back to the original defaults —
// not bound to a key on purpose (nothing asked for a "reset" button),
// but callable from the browser console: clearSave()
function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    console.error("Failed to clear save:", e);
  }
  location.reload();
}

/* ---------------- export / import ---------------- */

function exportSave() {
  const blob = new Blob([JSON.stringify(buildSaveData(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rpg-save.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Exported!");
}

function importSaveFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (e) {
      console.error("That file isn't valid save data:", e);
      showToast("Import failed — not a valid save file");
      return;
    }
    applySaveData(data);
    saveGame(); // persist the imported data as this browser's save too
    showToast("Imported!");
  };
  reader.onerror = () => {
    console.error("Failed to read the file:", reader.error);
    showToast("Import failed — couldn't read the file");
  };
  reader.readAsText(file);
}

/* ---------------- small "Saved!" / "Imported!" toast ---------------- */

let toastTimer = null;
function showToast(message) {
  let toast = document.getElementById("save-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "save-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 1500);
}

/* ---------------- toolbar wiring ---------------- */

document.getElementById("btn-save").addEventListener("click", () => {
  saveGame();
  showToast("Saved!");
});
document.getElementById("btn-export").addEventListener("click", exportSave);

/* ---------------- interior contents report (console) ----------------
   Rooms changed from one-per-LAYOUT to one-per-BUILDING, and a save
   written before that keeps its contents under the old bare layout id
   until migrateLegacyRoomId() (above) moves them across on load. If a
   house ever looks emptier than it should, this says exactly where
   everything currently is, straight from the save in storage rather than
   from memory — run `reportInteriors()` in the browser console.

   It only reads and prints; it never writes. If it shows contents under
   a bare id like "sharedHouse", they're still there and just need a
   reload with a build new enough to migrate them. If it shows nothing
   anywhere, they really are gone and no amount of loading will bring
   them back. */
function reportInteriors() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
  } catch (e) {
    console.log("save is unreadable:", e);
    return;
  }
  if (!data) {
    console.log("no save in storage at all");
    return;
  }
  const show = (label, obj) => {
    const rooms = Object.entries(obj || {});
    if (!rooms.length) {
      console.log("  " + label + ": (none)");
      return;
    }
    rooms.forEach(([roomId, entries]) => {
      const n = Array.isArray(entries) ? entries.length : 0;
      const kind = roomId.includes("@") ? "per-building" : "OLD shared id";
      console.log("  " + label + " [" + roomId + "] " + kind + ": " + n + " item(s)");
      if (n) console.log("      ", entries.map(([k, t]) => t + "@" + k).join(", "));
    });
  };
  console.log("--- interiors in the saved file ---");
  show("decor", data.interiorDecor);
  show("collisions", data.interiorCollisions);
  const houses = (data.objectLayer || []).filter(([, t]) => itemDefs[t] && itemDefs[t].interior);
  console.log("  buildings with an interior, currently placed:",
    houses.length ? houses.map(([k, t]) => t + "@" + k).join(", ") : "(none)");
  console.log("--- rooms live in memory right now ---");
  Object.keys(INTERIOR_ROOMS).forEach((id) => {
    console.log("  " + id + ": " + INTERIOR_ROOMS[id].decor.size + " decor, " +
      INTERIOR_ROOMS[id].collisions.size + " collision block(s)");
  });
}
document.getElementById("btn-import").addEventListener("click", () => {
  document.getElementById("import-file-input").click();
});
document.getElementById("import-file-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importSaveFromFile(file);
  e.target.value = ""; // allow importing the same file again later if needed
});

// Autosave: periodically (catches player movement) and right before the
// tab/window closes or reloads (catches anything since the last tick).
setInterval(saveGame, 2000);
window.addEventListener("beforeunload", saveGame);
