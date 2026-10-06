"use strict";

/* =================================================================
   SHOPS — an Equipment Shop and a Potion Shop at the west end of the
   town (main map), each with its own keeper, open day and night.

   Per request ("yung isang npc dapat nag bebenta din nun night and day
   open siya ... bagong bahay sa bandang left ng main map ... bilihan ng
   equipment tapos meron pang isang bahay para naman sa mga pots pang heal
   or dagdag stamina"):
   - Buildings: equipShop / potionShop (js/townBuildings.js, art from
     tools/build_shop_buildings.py). If the main map doesn't have them yet
     they're built at SHOP_SITES — on the north side of the west road —
     clearing the trees/bushes/stones in their spot (the post lights stay).
   - Keepers: Smith (equipment) and Alchemist (potions) stand behind the
     counter of their shop all the time (they never leave). Click them to
     open the shop — the same buy/sell popup the grocery uses
     (openNpcShop(), js/npc.js).
   - Stock: swords (Wood/Iron/Gold — damage 6/12/20, js/mines.js) and the
     potions (Health +40% HP, Stamina +60%, Elixir: full HP + stamina +30
     food). Both shops also buy what the cave mobs drop.
================================================================= */

const TIERS_ = ["leather", "iron", "gold", "mythril", "dragon"], TIER_PRICE = [30, 140, 480, 1500, 4000];
const SELL_DROPS = [
  { type: "slimeGel", price: 4, sell: true }, { type: "batWing", price: 5, sell: true },
  { type: "crystalShard", price: 14, sell: true }, { type: "golemCore", price: 30, sell: true },
  { type: "ironIngot", price: 22, sell: true }, { type: "goldIngot", price: 60, sell: true }, // from the hidden cave chests (js/treasure.js)
];
// Armour, rings, boots (the Demon set is never sold — bosses only).
const EQUIP_STOCK = [
  ...TIERS_.flatMap((t, i) => [["Helmet", 1], ["Armor", 1.6], ["Gauntlet", 0.8], ["Ring", 1.2], ["Boots", 0.9]].map(([k, m]) => ({ type: t + k, price: Math.round(TIER_PRICE[i] * m) }))),
  // the metal sets (they change your look when worn)
  ...[["bronze", 60], ["emerald", 2200], ["diamond", 6000]].flatMap(([t, p]) => [["Helmet", 1], ["Armor", 1.6], ["Gauntlet", 0.8], ["Boots", 0.9]].map(([k, m]) => ({ type: t + k, price: Math.round(p * m) }))),
  ...SELL_DROPS,
];
// The Blacksmith: swords, bows and shields.
const SMITH_STOCK = [
  { type: "woodSword", price: 25 }, { type: "bronzeSword", price: 70 }, { type: "ironSword", price: 160 }, { type: "emeraldSword", price: 2600 }, { type: "diamondSword", price: 7800 }, { type: "goldSword", price: 480 }, { type: "crystalSword", price: 1300 },
  { type: "mythrilSword", price: 4200 }, { type: "dragonSword", price: 11000 }, { type: "celestialSword", price: 26000 },
  { type: "woodBow", price: 30 }, { type: "ironBow", price: 220 }, { type: "goldBow", price: 700 },
  ...TIERS_.map((t, i) => ({ type: t + "Shield", price: Math.round(TIER_PRICE[i] * 1.1) })),
  ...SELL_DROPS,
];
const POTION_STOCK = [
  { type: "potionHealth", price: 18 }, { type: "potionStamina", price: 14 }, { type: "potionElixir", price: 75 },
  { type: "slimeGel", price: 4, sell: true }, { type: "glowCap", price: 7, sell: true }, { type: "batWing", price: 5, sell: true },
];
const SHOP_KEEPERS = {
  equip_room: { name: "Armorer", title: "Equipment Shop — Armorer", stock: EQUIP_STOCK, look: "Shop_Smith", col: 5.5, row: 5 },
  smith_room: { name: "Blacksmith", title: "Blacksmith — swords, bows, shields", stock: SMITH_STOCK, look: "Shop_Blacksmith", col: 5.5, row: 5 },
  potion_room: { name: "Alchemist", title: "Potion Shop — Alchemist", stock: POTION_STOCK, look: "Shop_Alchemist", col: 5.5, row: 5 },
};
for (const k of Object.values(SHOP_KEEPERS)) {
  assets["keeper_" + k.look] = new Image();
  assets["keeper_" + k.look].src = "assets/npc/" + k.look + "/Idle_Down.png";
}

// The Wall Candle is lit now (a flame on top, js/camera.js drawIndoorLampGlows()):
// a small warm circle of light round it, like a lamp's but smaller.
if (itemDefs.bldWallCandle) itemDefs.bldWallCandle.lightGlow = { offsetX: 0, offsetY: -17, groundOffsetY: -12, small: true };

/* ---------------- the buildings on the main map ---------------- */
// Bottom-centre (door) tiles, right above the west road (rows 39-42 are road).
const SHOP_SITES = [{ type: "equipShop", col: 8, row: 38 }, { type: "potionShop", col: 24, row: 38 }, { type: "blacksmithShop", col: 36, row: 38 }];
const SHOP_KEEP_TYPES = new Set(["postLight", "postLightLit"]);
function ensureShopsBuilt() {
  if (typeof currentWorld !== "undefined" && currentWorld !== "main") return;
  if (player.scene !== "outside" && player.scene !== "inside") return;
  let changed = false;
  for (const site of SHOP_SITES) {
    let exists = false;
    for (const t of objectLayer.values()) if (t === site.type) { exists = true; break; }
    if (exists) continue;
    // clear the spot: the house's 7x9 footprint plus a tile round it, and the doorstep below
    for (let r = site.row - 9; r <= site.row; r++) {
      for (let c = site.col - 4; c <= site.col + 4; c++) {
        const k = c + "," + r;
        for (const layer of [objectLayer, wildgrassLayer, upperLayer, groundOverlayLayer]) {
          const t = layer.get(k);
          if (!t || SHOP_KEEP_TYPES.has(t) || t.startsWith("terrain")) continue;
          layer.delete(k);
        }
      }
    }
    objectLayer.set(site.col + "," + site.row, site.type);
    changed = true;
  }
  // the gate east (js/worlds.js MAIN_EAST_PORTAL): a lamp either side, the way kept clear
  if (typeof MAIN_EAST_PORTAL !== "undefined") {
    for (let r = MAIN_EAST_PORTAL.rows[0] - 1; r <= MAIN_EAST_PORTAL.rows[1] + 1; r++) {
      for (let c = MAIN_EAST_PORTAL.cols[0] - 4; c <= MAIN_EAST_PORTAL.cols[1]; c++) {
        const k = c + "," + r, t = objectLayer.get(k);
        if (t && !SHOP_KEEP_TYPES.has(t) && itemDefs[t] && itemDefs[t].collides) { objectLayer.delete(k); changed = true; }
      }
    }
    for (const r of [MAIN_EAST_PORTAL.rows[0] - 2, MAIN_EAST_PORTAL.rows[1] + 2]) {
      const k = (MAIN_EAST_PORTAL.cols[0] - 1) + "," + r;
      if (!objectLayer.has(k)) { objectLayer.set(k, "postLight"); changed = true; }
    }
  }
  if (changed && typeof saveGame === "function") saveGame();
}
setInterval(() => { try { ensureShopsBuilt(); ensureEastRoad(); } catch (e) { console.error("shops:", e); } }, 2000);

/* ---------------- the road east ----------------
   Per request ("sa town map ... lagyan mo ng path way papunta dun sa ibang
   mapa"): a 2-wide dirt road from the town's north-south road (cols
   140-141) straight east to the gate (js/worlds.js MAIN_EAST_PORTAL, rows
   63-65), edged with the same grass corner pieces as every other path (the
   corner rule the world builders use, tools/build_wild_world.py). Laid once;
   whatever stood on it (trees, bushes, stones, tufts) is cleared. */
const EAST_ROAD = { c0: 140, c1: 187, r0: 63, r1: 64 };
const ROAD_EDGE = {
  "1,1,0,0": ["TopGrass2"], "0,0,1,1": ["BottomGrass4"], "1,0,1,0": ["LeftGrass2"], "0,1,0,1": ["RightGrass2"],
  "1,0,0,0": ["TopGrass4"], "0,1,0,0": ["TopGrass5"], "0,0,1,0": ["BottomGrass1"], "0,0,0,1": ["BottomGrass2"],
  "1,1,1,0": ["TopGrass1"], "1,1,0,1": ["TopGrass3"], "1,0,1,1": ["BottomGrass3"], "0,1,1,1": ["BottomGrass5"],
};
function ensureEastRoad() {
  if (typeof currentWorld === "undefined" || currentWorld !== "main" || typeof isGroundFilled !== "function") return;
  const R = EAST_ROAD;
  const mid = Math.floor((R.c0 + R.c1) / 2);
  const isDirtTile = (c, r) => {
    if (isGroundFilled(c, r)) return false;
    const t = groundLayer.get(c + "," + r);
    return !t || !t.startsWith("terrainGrass");
  };
  if (isDirtTile(mid, R.r0) && isDirtTile(mid, R.r1)) return; // already laid
  // the dirt: what's already dirt round here, plus the new road
  const D = new Set();
  const key = (c, r) => c + "," + r;
  for (let r = R.r0 - 4; r <= R.r1 + 4; r++) for (let c = R.c0 - 4; c <= R.c1; c++) if (isDirtTile(c, r)) D.add(key(c, r));
  for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) D.add(key(c, r));
  const cornerDirt = (vc, vr) => D.has(key(vc, vr)) || D.has(key(vc - 1, vr)) || D.has(key(vc, vr - 1)) || D.has(key(vc - 1, vr - 1));
  for (let pass = 0; pass < 6; pass++) { // no diagonal-only touches (no piece for those): fill them in
    const add = [];
    for (let r = R.r0 - 2; r <= R.r1 + 2; r++) for (let c = R.c0 - 2; c <= R.c1; c++) {
      if (D.has(key(c, r))) continue;
      const g = [!cornerDirt(c, r), !cornerDirt(c + 1, r), !cornerDirt(c, r + 1), !cornerDirt(c + 1, r + 1)];
      if ((g[0] && !g[1] && !g[2] && g[3]) || (!g[0] && g[1] && g[2] && !g[3])) add.push(key(c, r));
    }
    if (!add.length) break;
    for (const k of add) D.add(k);
  }
  const clearAt = (c, r) => {
    const k = key(c, r);
    for (const layer of [objectLayer, wildgrassLayer, upperLayer]) {
      const t = layer.get(k);
      if (t && !SHOP_KEEP_TYPES.has(t)) layer.delete(k);
    }
  };
  for (let r = R.r0 - 2; r <= R.r1 + 2; r++) {
    for (let c = R.c0 - 2; c <= R.c1; c++) {
      const k = key(c, r);
      if (D.has(k)) { // plain dirt
        if (r >= R.r0 && r <= R.r1 && c >= R.c0) clearAt(c, r);
        const t = groundLayer.get(k);
        if (t && t.startsWith("terrainGrass")) groundLayer.delete(k);
        setGroundFill(c, r, false);
        continue;
      }
      const g = [!cornerDirt(c, r), !cornerDirt(c + 1, r), !cornerDirt(c, r + 1), !cornerDirt(c + 1, r + 1)].map(Number).join(",");
      if (g === "1,1,1,1") continue; // grass all round: untouched
      const piece = ROAD_EDGE[g];
      if (!piece) continue;
      clearAt(c, r);
      setGroundFill(c, r, false);
      groundLayer.set(k, "terrainGrass" + piece[0]);
    }
  }
  if (typeof repaintAllGroundFill === "function") repaintAllGroundFill();
  if (typeof saveGame === "function") saveGame();
}

/* ---------------- the shop furniture comes back ----------------
   Per request ("nawala yung mga object sa blacksmith"): a shop room that was saved with its
   furniture missing (no counter at all) gets its blueprint's pieces put back — only on tiles that
   are empty, so nothing you placed is touched. Checked whenever you're in a shop. */
function repairShopRoom(room) {
  if (!room || !room.decor || !SHOP_KEEPERS[room.blueprintId]) return false;
  for (const t of room.decor.values()) if (/^bartender/.test(t)) return false; // the counter is there: fine
  const bp = (typeof INTERIOR_ROOM_BLUEPRINTS !== "undefined" ? INTERIOR_ROOM_BLUEPRINTS : TOWN_ROOM_BLUEPRINTS)[room.blueprintId];
  if (!bp || !bp.defaultDecor) return false;
  let n = 0;
  for (const [col, row, type] of bp.defaultDecor) {
    if (!itemDefs[type]) continue;
    const key = col + "," + row;
    const floor = typeof isInteriorFloorType === "function" && isInteriorFloorType(type);
    const map = floor ? (room.floorDecor || (room.floorDecor = new Map())) : room.decor;
    if (map.has(key)) continue;
    map.set(key, type); n++;
  }
  if (n && typeof interiorTopStripsCache !== "undefined") try { interiorTopStripsCache.delete(room); } catch (e) { /* none */ }
  return n > 0;
}
setInterval(() => {
  if (player.scene !== "inside") return;
  const room = INTERIOR_ROOMS[player.activeRoomId];
  if (room && repairShopRoom(room) && typeof saveGame === "function") saveGame();
}, 1000);

/* ---------------- the keepers ----------------
   A shop room has one keeper (SHOP_KEEPERS[room]) or several ({ list: [...] } — the Furniture Shop's
   two). Each stands behind the counter at its own col and opens its own stock when clicked. */
let lastShopKeeper = null; // the keeper whose shop was opened last (js/upgrades.js shows the Upgrade button for the Blacksmith)
function shopKeepersHere() {
  if (player.scene !== "inside" || typeof player.activeRoomId !== "string") return [];
  const k = SHOP_KEEPERS[player.activeRoomId.split("@")[0]];
  return !k ? [] : k.list ? k.list : [k];
}
function shopKeeperHere() {
  const ks = shopKeepersHere();
  return ks.includes(lastShopKeeper) ? lastShopKeeper : ks[0] || null;
}
function keeperFeet(k) { return { x: k.col * TILE, y: (k.row + 1) * TILE - 2 }; }
function shopKeeperDrawables() {
  const out = [];
  for (const k of shopKeepersHere()) {
    const sheet = assets["keeper_" + k.look];
    if (!sheet || !sheet.width) continue;
    const f = keeperFeet(k);
    out.push({
      sortY: f.y, character: true,
      draw: () => {
        const frames = Math.max(1, Math.round(sheet.width / sheet.height));
        const fr = Math.floor(performance.now() / 250) % frames;
        const s = (DRAW_SIZE / 64) * zoom, size = 64 * s;
        const x = (f.x - camX) * zoom - size / 2;
        const y = (f.y - camY) * zoom - SPRITE_FEET_FRACTION * size; // same feet line as every character
        // Their own candle circle, like the player's and Maria's — per request ("yung mga
        // npc ... dapat may circle light din parang character").
        if (typeof drawCharacterGlow === "function") {
          const cy = f.y - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
          drawCharacterGlow(x + size / 2, (cy - camY) * zoom, size, f.x, cy);
        }
        ctx.save(); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sheet, fr * 64, 0, 64, 64, Math.round(x), Math.round(y), size, size);
        // a little name tag
        const fs = Math.max(8, Math.round(4.5 * zoom));
        ctx.font = "bold " + fs + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.lineWidth = Math.max(2, fs / 4); ctx.strokeStyle = "rgba(0,0,0,0.85)";
        const ty = y + size * 0.22;
        ctx.strokeText(k.name, x + size / 2, ty); ctx.fillStyle = "#ffe6a8"; ctx.fillText(k.name, x + size / 2, ty);
        ctx.restore();
      },
    });
  }
  return out;
}
// At night the keepers get their own colours back after the washes, like the player.
function shopKeeperRelightList() {
  if (typeof drawMaskedRelight !== "function") return [];
  const night = getRelightStrength();
  if (night <= 0.01) return [];
  const out = [];
  for (const k of shopKeepersHere()) {
    const sheet = assets["keeper_" + k.look];
    if (!sheet || !sheet.width) continue;
    const f = keeperFeet(k);
    out.push({
      sortY: f.y,
      draw: () => {
        const frames = Math.max(1, Math.round(sheet.width / sheet.height));
        const fr = Math.floor(performance.now() / 250) % frames;
        const s = (DRAW_SIZE / 64) * zoom, size = 64 * s;
        const x = Math.round((f.x - camX) * zoom - size / 2), y = Math.round((f.y - camY) * zoom - SPRITE_FEET_FRACTION * size);
        drawMaskedRelight((g) => g.drawImage(sheet, fr * 64, 0, 64, 64, x, y, size, size), x + size / 2, y + size / 2, size, f.y, night, false);
      },
    });
  }
  return out;
}
// Click a keeper to shop (any time of day). The popup opens on the CLICK
// (after the button is released) — opened on mousedown, the click that
// follows lands on the popup's own backdrop and closes it straight away.
let shopClickPending = null;
function keeperUnderPointer(e) {
  const { x, y } = screenToWorld(e.clientX, e.clientY);
  for (const k of shopKeepersHere()) {
    const f = keeperFeet(k);
    if (Math.abs(x - f.x) < 11 && y > f.y - 34 && y < f.y + 6) return k;
  }
  return null;
}
view.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const k = keeperUnderPointer(e);
  shopClickPending = k;
  if (k) e.stopImmediatePropagation();
}, true);
view.addEventListener("click", (e) => {
  const k = shopClickPending;
  shopClickPending = null;
  if (!k || keeperUnderPointer(e) !== k) return;
  e.stopImmediatePropagation();
  lastShopKeeper = k;
  openNpcShop(typeof k.stock === "function" ? k.stock() : k.stock, k.title);
}, true);
// a hint while you're in the shop
setInterval(() => {
  const ks = shopKeepersHere();
  if (ks.length && typeof roomToast === "function" && !ks[0].hinted) {
    ks[0].hinted = true;
    roomToast(ks.length > 1 ? "Click " + ks.map((k) => k.name).join(" or ") + " to shop" : "Click " + ks[0].name + " to buy / sell");
  }
}, 1000);

/* ---------------- the Furniture Shop ----------------
   Per request ("gawa ka rin ng bahay pa para sa mga furnitures pang loob at pang labas ng bahay na pwede
   bilhin ... 2 tao nasa loob ... ikaw na bahala sa prices"): every decoration in the item list is
   sorted into INDOOR (furniture, beds, tables, shelves, rugs, floor tiles, wall pieces, lamps for
   inside...) or OUTDOOR (bushes, trees, flowers, fences, benches, lamp posts, planters, rocks...),
   and priced by the size of its picture (bigger = dearer), lights a little more. The rest of the
   building-mode tiles (ground, terrain, buildings, collision blocks) are not for sale. */
const FURN_INDOOR_RE = /^(bld(?!Planter|BenchWood|BenchStone|LampPost)|pcFurniture|pcEsoteric|pcDungeon|bed|tableBig|tableCircle|tableKitchen|tableSmall|tableLong$|chairFront|chairRight|chairLeft|cabinet|basket|cooker|couch|drawer|broom|barrelInterior|crateInterior|crateOpenInterior|wallPoster|pictureFrame|board[AB]|wallFurniture|windowPlain|windowLight|tableFurniture|mug|plate|floorMat|floor(Brown|DarkGreen|Green)Tile|bartender|roomPickaxe|roomHammer)/;
const FURN_OUTDOOR_RE = /^(bush|tree(Medium|Thin|Tiny|Big)(?!.*Stump)|stone(Big|Medium|Small|XS|XXS|Decor)|pcRocks|pcVegetation|pcTree|pcFarm|pcResources|decoFlower|wildGrass|leavesFloor|fenceTile|bench(Horizontal|Vertical)|chairOutdoor|tableOutdoor|longTable|post(Plain|HandleLight|Light)|portBridge(Decor|Front|Wall)|bldPlanter|bldBenchWood|bldBenchStone|bldLampPost|woodCrate|woodPlaque|woodShield|veg|waterCrate)/;
function furniturePrice(type) {
  const d = itemDefs[type], ic = d && d.icon;
  if (type === "roomPickaxe" || type === "roomHammer") return 400;
  const area = ic && ic.width ? ic.width * ic.height : 256;
  let p = 10 + area / 14;
  if (d.lightGlow) p += 60;
  if (/^tree/.test(type) || /^pcTree/.test(type)) p = Math.max(p, 120);
  return Math.max(5, Math.min(900, Math.round(p / 5) * 5));
}
let furnitureStocks = null;
function buildFurnitureStocks() {
  const indoor = [], outdoor = [];
  for (const t of Object.keys(itemDefs)) {
    const d = itemDefs[t];
    if (!d || d.interior || d.equipSlot && t !== "roomPickaxe" && t !== "roomHammer" || d.consumable || d.mobDrop || d.seedOf || d.cropOf || d.fish) continue;
    if (FURN_INDOOR_RE.test(t)) indoor.push({ type: t, price: furniturePrice(t) });
    else if (FURN_OUTDOOR_RE.test(t)) outdoor.push({ type: t, price: furniturePrice(t) });
  }
  indoor.sort((a, b) => a.price - b.price); outdoor.sort((a, b) => a.price - b.price);
  return furnitureStocks = { indoor, outdoor };
}
function furnitureStock(which) { return (furnitureStocks || buildFurnitureStocks())[which]; }
SHOP_KEEPERS.furniture_room = { list: [
  { name: "Lita", title: "Furniture Shop — Indoor (Lita)", stock: () => furnitureStock("indoor"), look: "Shop_FurnitureIn", col: 3.5, row: 5 },
  { name: "Berto", title: "Furniture Shop — Outdoor (Berto)", stock: () => furnitureStock("outdoor"), look: "Shop_FurnitureOut", col: 7.5, row: 5 },
] };
for (const k of SHOP_KEEPERS.furniture_room.list) {
  assets["keeper_" + k.look] = new Image();
  assets["keeper_" + k.look].src = "assets/npc/" + k.look + "/Idle_Down.png";
}
SHOP_SITES.push({ type: "furnitureShop", col: 44, row: 38 });
