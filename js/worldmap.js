"use strict";

/* =================================================================
   FULL MAP + WORLD MAP — per request ("dapat nakikita yung full map buong
   map kapag click ng minimap ... tapos may view full map button sa taas para
   makita kung san na siyang map").
   - Click the minimap: the full picture map of the outdoor map you're on
     (js/hud.js openFullMap()). "🗺 Map" in the top bar opens this window:
     its Map tab draws the map you're on from its tiles — grass, dirt, water, mountains, trees, rocks,
     buildings, the portal — with you as a blinking marker. Inside a room or
     a cave: that room's floor plan.
   - The "World" tab: every map and how they connect (the town in the middle,
     the wild west of it, the mob worlds east, the caves under the wild's
     tunnel), with the one you're in highlighted.
================================================================= */
let mapEl = null, mapCanvas = null, mapTab = "map", mapBase = null, mapBaseKey = "";
const ATLAS = [ // [world, col, row] on the world map grid
  ["wild", 0, 1], ["main", 1, 1], ["east1", 2, 1], ["east2", 3, 1], ["east3", 3, 2], ["east4", 4, 2], ["east5", 4, 3], ["east6", 3, 3], ["east7", 3, 4], ["east8", 2, 4], ["forest", 0, 2],
];
const ATLAS_LINKS = [["wild", "main"], ["main", "east1"], ["east1", "east2"], ["east2", "east3"], ["east3", "east4"], ["east4", "east5"], ["east5", "east6"], ["east6", "east7"], ["east7", "east8"], ["wild", "forest"]];
function worldLabel(w) {
  if (w === "main") return ["Town", "the town, the shops"];
  if (w === "wild") return ["Wild", "your house, the caves"];
  if (w === "forest") return ["Greenwood", "animals to hunt, the falls, the sea"];
  const Z = typeof MOB_WORLDS !== "undefined" && MOB_WORLDS[w];
  return Z ? [Z.name, "mobs Lv " + Z.level[0] + "-" + Z.level[1]] : [w, ""];
}
function buildMapUI() {
  mapEl = document.createElement("div");
  mapEl.style.cssText = "position:fixed;inset:0;z-index:62;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font-family:monospace";
  mapEl.innerHTML = `<div style="background:#2a1d14;border:3px solid #a8743e;border-radius:10px;padding:8px;color:#f3e2c3;box-shadow:0 8px 30px rgba(0,0,0,.6)">
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <button data-tab="map" style="background:#6b4a2e;color:#f3e2c3;border:1px solid #a8743e;border-radius:4px;cursor:pointer;padding:2px 8px">Map</button>
      <button data-tab="world" style="background:#6b4a2e;color:#f3e2c3;border:1px solid #a8743e;border-radius:4px;cursor:pointer;padding:2px 8px">World</button>
      <b id="map-title" style="margin-left:8px;font-size:13px"></b>
      <span style="flex:1"></span>
      <button id="map-close" style="background:#6b4a2e;color:#f3e2c3;border:1px solid #a8743e;border-radius:4px;cursor:pointer">✕</button>
    </div>
    <canvas id="map-canvas" style="image-rendering:pixelated;display:block;border-radius:4px"></canvas>
  </div>`;
  document.body.appendChild(mapEl);
  mapCanvas = mapEl.querySelector("#map-canvas");
  mapEl.addEventListener("mousedown", (e) => { if (e.target === mapEl) toggleMap(false); });
  mapEl.querySelector("#map-close").addEventListener("click", () => toggleMap(false));
  for (const b of mapEl.querySelectorAll("[data-tab]")) b.addEventListener("click", () => { mapTab = b.dataset.tab; mapBaseKey = ""; drawMap(); });
}
function toggleMap(show, tab) {
  if (!mapEl) buildMapUI();
  const on = show === undefined ? mapEl.style.display === "none" : show;
  if (tab) mapTab = tab;
  mapEl.style.display = on ? "flex" : "none";
  mapBaseKey = "";
  if (on) drawMap();
}
function tileColor(c, r) {
  const k = c + "," + r;
  const o = objectLayer.get(k);
  if (o) {
    if (/^tree/.test(o)) return "#2c5226";
    if (/^(stone|pcRocks)/.test(o)) return "#8d8d96";
    if (o === "warpPortal") return "#b060ff";
    if (/^bush/.test(o)) return "#467a34";
    const d = itemDefs[o];
    if (d && (d.multiTileFootprint || d.interior)) return "#c8583c";
    if (/postLight/.test(o)) return "#ffd95a";
  }
  const g = groundOverlayLayer.get(k) || groundLayer.get(k) || dirtLayer.get(k) || "";
  if (g.startsWith("terrainMountain")) return /Wall/.test(g) ? "#5a4a3e" : "#7d6c58";
  if (/^(water|port)/.test(g)) return /^portI/.test(g) ? "#5d9a3c" : "#3a78c8";
  if (g.startsWith("terrainGrass")) return "#5d9a3c";
  if (g.startsWith("terrainBricks")) return "#a06a48";
  if (g.startsWith("terrainSnow")) return "#e6eef6";
  if (typeof isGroundFilled === "function" && isGroundFilled(c, r)) return "#5d9a3c";
  return "#a07848";
}
function drawMap() {
  if (!mapEl || mapEl.style.display === "none") return;
  const maxW = Math.floor(window.innerWidth * 0.86), maxH = Math.floor(window.innerHeight * 0.78);
  const g = mapCanvas.getContext("2d");
  const title = mapEl.querySelector("#map-title");
  if (mapTab === "world") return drawAtlas(g, maxW, maxH, title);
  if (player.scene === "inside") { // a room / cave: its floor plan
    const room = INTERIOR_ROOMS[player.activeRoomId];
    if (!room || !room.floorTiles) { title.textContent = "Loob"; return; }
    let mc = 0, mr = 0;
    for (const k of room.floorTiles) { const [c, r] = k.split(",").map(Number); mc = Math.max(mc, c); mr = Math.max(mr, r); }
    const cell = Math.max(2, Math.floor(Math.min(maxW / (mc + 3), maxH / (mr + 3))));
    mapCanvas.width = (mc + 3) * cell; mapCanvas.height = (mr + 3) * cell;
    g.fillStyle = "#0c0806"; g.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
    g.fillStyle = "#b08a62";
    for (const k of room.floorTiles) { const [c, r] = k.split(",").map(Number); g.fillRect(c * cell, r * cell, cell, cell); }
    const L = typeof mineLayoutFor === "function" && mineLayoutFor(room);
    title.textContent = L ? "Mine " + L.depth : (room.blueprintId || "Loob").replace(/_room$/, "").replace(/_/g, " ");
    drawPlayerDot(g, player.x / TILE * cell, (player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE) / TILE * cell, cell);
    return;
  }
  const cols = Math.round(worldW() / TILE), rows = Math.round(worldH() / TILE);
  const cell = Math.max(2, Math.floor(Math.min(maxW / cols, maxH / rows)));
  const key = currentWorld + "|" + cell + "|" + (typeof layerVersion !== "undefined" ? layerVersion : 0);
  if (key !== mapBaseKey) { // the tiles change rarely: draw them once
    mapBase = document.createElement("canvas"); mapBase.width = cols * cell; mapBase.height = rows * cell;
    const b = mapBase.getContext("2d");
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { b.fillStyle = tileColor(c, r); b.fillRect(c * cell, r * cell, cell, cell); }
    mapBaseKey = key;
  }
  mapCanvas.width = mapBase.width; mapCanvas.height = mapBase.height;
  g.drawImage(mapBase, 0, 0);
  const [name, sub] = worldLabel(currentWorld);
  title.textContent = name + (sub ? " — " + sub : "");
  drawPlayerDot(g, player.x / TILE * cell, (player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE) / TILE * cell, cell);
}
function drawPlayerDot(g, x, y, cell) {
  const blink = Math.floor(performance.now() / 400) % 2;
  g.beginPath(); g.arc(x, y, Math.max(3, cell * 1.2), 0, Math.PI * 2);
  g.fillStyle = blink ? "#ffe24a" : "#ffffff"; g.fill();
  g.lineWidth = 2; g.strokeStyle = "#1a1208"; g.stroke();
}
function drawAtlas(g, maxW, maxH, title) {
  const W = Math.min(maxW, 760), H = Math.min(maxH, 470);
  mapCanvas.width = W; mapCanvas.height = H;
  g.fillStyle = "#1c140e"; g.fillRect(0, 0, W, H);
  const cw = W / 5.2, ch = H / 4.6, bw = cw * 0.82, bh = ch * 0.62;
  const at = (col, row) => [cw * 0.25 + col * cw, ch * 0.2 + row * ch];
  const pos = {}; for (const [w, c, r] of ATLAS) pos[w] = at(c, r);
  const here = player.scene === "inside" ? null : currentWorld;
  g.lineWidth = 3; g.strokeStyle = "#a8743e";
  for (const [a, b] of ATLAS_LINKS) {
    const [ax, ay] = pos[a], [bx, by] = pos[b];
    g.beginPath(); g.moveTo(ax + bw / 2, ay + bh / 2); g.lineTo(bx + bw / 2, by + bh / 2); g.stroke();
  }
  // the town's portal -> Wolfpine Woods (dashed)
  g.setLineDash([6, 5]); g.strokeStyle = "#b060ff";
  g.beginPath(); g.moveTo(pos.main[0] + bw / 2, pos.main[1] + bh); g.lineTo(pos.east3[0] + bw / 2, pos.east3[1] + bh / 2); g.stroke();
  g.setLineDash([]);
  // the caves under the wild's tunnel
  const [cx, cy] = at(0, 2.3);
  g.strokeStyle = "#a8743e"; g.beginPath(); g.moveTo(pos.wild[0] + bw / 2, pos.wild[1] + bh); g.lineTo(cx + bw / 2, cy); g.stroke();
  const inMine = player.scene === "inside" && typeof currentMineRoom === "function" && currentMineRoom();
  const inCave = player.scene === "inside";
  g.fillStyle = inCave ? "#5a3e7a" : "#3a2a1e"; g.fillRect(cx, cy, bw, bh * 1.9);
  g.strokeStyle = inCave ? "#ffe24a" : "#a8743e"; g.lineWidth = inCave ? 3 : 2; g.strokeRect(cx, cy, bw, bh * 1.9);
  g.fillStyle = "#f3e2c3"; g.font = "bold 12px monospace"; g.textAlign = "center";
  g.fillText("Tunnel & Caves", cx + bw / 2, cy + 16);
  g.font = "11px monospace"; g.fillText("Mine 1 - 10", cx + bw / 2, cy + 32);
  if (inMine) { g.fillStyle = "#ffe24a"; g.fillText("ikaw: " + inMine.name, cx + bw / 2, cy + 48); }
  for (const [w] of ATLAS) {
    const [x, y] = pos[w], cur = w === here;
    g.fillStyle = cur ? "#4e6b2e" : "#3a2a1e"; g.fillRect(x, y, bw, bh);
    g.strokeStyle = cur ? "#ffe24a" : "#a8743e"; g.lineWidth = cur ? 3 : 2; g.strokeRect(x, y, bw, bh);
    const [name, sub] = worldLabel(w);
    g.fillStyle = "#f3e2c3"; g.font = "bold 12px monospace"; g.textAlign = "center";
    g.fillText(name, x + bw / 2, y + bh / 2 - 2);
    g.font = "10px monospace"; g.fillStyle = "#c8b8a0"; g.fillText(sub, x + bw / 2, y + bh / 2 + 12);
    if (cur) { g.fillStyle = "#ffe24a"; g.fillText("● ikaw", x + bw / 2, y + bh - 4); }
  }
  title.textContent = "World — where you are";
}
setInterval(() => { try { drawMap(); } catch (e) { /* not ready */ } }, 300);
// open it: the minimap, a top-bar button, or M
{
  // (the minimap's own click already opens the full picture map of the outdoors, js/hud.js openFullMap())
  const mm = document.getElementById("minimap");
  if (mm) { mm.style.cursor = "pointer"; mm.title = "Click to see the whole map"; }
  const bar = document.getElementById("top-toolbar");
  if (bar) {
    const b = document.createElement("button");
    b.textContent = "🗺 Map"; b.title = "Buong map at world map (M)";
    b.addEventListener("click", (e) => { e.stopPropagation(); toggleMap(true, "world"); });
    bar.insertBefore(b, bar.firstChild);
  }
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && mapEl && mapEl.style.display !== "none") toggleMap(false); });
}
