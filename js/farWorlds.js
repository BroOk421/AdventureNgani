"use strict";

/* =================================================================
   THE VOLCANO (east7) AND THE AZURE COAST (east8)

   Per request ("lagyan mo pa ng iba pang map na volcano tapos isang map na
   merong ocean na may port tiles tapos may mga trees din tapos ... falls na
   may mountain may mga bagong mobs din"). The maps themselves come from
   tools/build_east_worlds.py (js/eastWorlds.data.js); this file makes them
   come alive:
   - lava (lava1..3) churns and glows — molten caustics, a slow pulse, and
     at night it lights its surroundings;
   - the Volcano has a hot red haze and embers drifting up, and never gets
     snow on the ground;
   - the waterfall (waterfall tiles in the cliff face) streams down, with
     foam and mist where it lands;
   - you can fish in the open sea (the port set's full-water pieces).
   Ember Peaks (S pass) -> Volcano (S pass) -> Azure Coast. Mobs: js/mines.js.
================================================================= */

const isLavaType = (t) => !!t && /^lava\d/.test(t);
let lavaFrames = null;
function buildLavaFrames() {
  if (typeof buildWaterArt === "function" && !waterCaustics) buildWaterArt();
  lavaFrames = waterCaustics.map((src) => {
    const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
    const g = c.getContext("2d"); g.drawImage(src, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      if (d[i + 2] > 150) { d[i] = 255; d[i + 1] = 200; d[i + 2] = 90; d[i + 3] = Math.min(255, d[i + 3] * 1.3); } // the bright web: molten yellow
      else { d[i] = 60; d[i + 1] = 6; d[i + 2] = 2; d[i + 3] = Math.min(255, d[i + 3] * 4); } // the troughs: cooling crust
    }
    g.putImageData(img, 0, 0);
    return c;
  });
}
function drawLavaAndFalls() {
  if (player.scene !== "outside") return;
  const vw = view.width / zoom, vh = view.height / zoom;
  const c0 = Math.floor(camX / TILE) - 1, c1 = Math.ceil((camX + vw) / TILE) + 1;
  const r0 = Math.floor(camY / TILE) - 1, r1 = Math.ceil((camY + vh) / TILE) + 1;
  const lava = [], falls = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const t = groundLayer.get(c + "," + r);
    if (!t) continue;
    if (isLavaType(t)) lava.push([c, r]); else if (t === "waterfall") falls.push([c, r]);
  }
  const t = performance.now() / 1000, T = TILE * zoom;
  if (lava.length) {
    if (!lavaFrames) buildLavaFrames();
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    for (const [c, r] of lava) ctx.rect(Math.round((c * TILE - camX) * zoom), Math.round((r * TILE - camY) * zoom), Math.ceil(T) + 1, Math.ceil(T) + 1);
    ctx.clip();
    const sx0 = (c0 * TILE - camX) * zoom, sy0 = (r0 * TILE - camY) * zoom, sw = (c1 - c0 + 1) * T, sh = (r1 - r0 + 1) * T;
    const layer = (scale, speed, dx, dy, alpha, off) => {
      const fr = Math.floor(((t * speed / 6 + off) % 1) * lavaFrames.length);
      const pat = ctx.createPattern(lavaFrames[fr], "repeat");
      pat.setTransform(new DOMMatrix().translate(-camX * zoom + t * dx * zoom, -camY * zoom + t * dy * zoom).scale(zoom * scale));
      ctx.globalAlpha = alpha; ctx.fillStyle = pat; ctx.fillRect(sx0, sy0, sw, sh);
    };
    layer(3, 0.35, 1.2, 0.5, 0.5, 0);
    layer(2, 0.6, -1.8, 0.9, 0.4, 0.4);
    ctx.globalAlpha = 0.04 + 0.04 * Math.sin(t * 1.7);
    ctx.fillStyle = "#ffb040"; ctx.fillRect(sx0, sy0, sw, sh); // the slow breathing glow
    // bubbles popping now and then
    ctx.globalAlpha = 1;
    for (const [c, r] of lava) {
      const h = waterHash(c, r), k = ((t * 0.5 + (h % 97) / 97) % 1);
      if (h % 5) continue;
      const x = (c * TILE + 4 + (h >> 4) % 8 - camX) * zoom, y = (r * TILE + 4 + (h >> 8) % 8 - camY) * zoom;
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
      ctx.fillStyle = "#ffe6a0";
      ctx.beginPath(); ctx.arc(x, y, (0.6 + k * 1.4) * zoom, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  if (falls.length) {
    ctx.save();
    for (const [c, r] of falls) {
      const x = Math.round((c * TILE - camX) * zoom), y = Math.round((r * TILE - camY) * zoom);
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, Math.ceil(T) + 1, Math.ceil(T) + 1); ctx.clip();
      // streaks rushing down
      for (let i = 0; i < 6; i++) {
        const sx = x + (i * 2.7 + 0.8) * zoom, sp = 60 + (i * 13) % 25, ph = ((t * sp + i * 37) % 22) * zoom;
        ctx.fillStyle = i % 2 ? "rgba(235,248,255,0.85)" : "rgba(170,215,250,0.7)";
        for (let yy = -22 * zoom + ph; yy < T; yy += 11 * zoom) ctx.fillRect(sx, y + yy, Math.max(1, zoom * 0.9), 5 * zoom);
      }
      ctx.restore();
      // where it lands: foam and mist
      if (groundLayer.get(c + "," + (r + 1)) !== "waterfall") {
        const by = y + T;
        for (let j = 0; j < 3; j++) {
          const k = (t * 1.6 + j / 3 + c * 0.13) % 1;
          ctx.globalAlpha = (1 - k) * 0.8;
          ctx.fillStyle = "#f4fbff";
          ctx.beginPath(); ctx.ellipse(x + T / 2 + Math.sin(c + j * 2) * 2 * zoom, by - k * 5 * zoom, (3 + k * 6) * zoom, (1.4 + k * 2) * zoom, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
}
{
  const base = drawFlatGroundItems;
  drawFlatGroundItems = function () { const r = base.apply(this, arguments); try { drawLavaAndFalls(); } catch (e) { /* never break the frame */ } return r; };
}
// lava lights the night
let lavaGlowCanvas = null;
{
  const base = drawPostLightGlows;
  drawPostLightGlows = function () {
    try {
      if (player.scene === "outside" && currentWorld === "east7") {
        if (!lavaGlowCanvas) {
          const c = lavaGlowCanvas = document.createElement("canvas"); c.width = c.height = 32;
          const g = c.getContext("2d"), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
          gr.addColorStop(0, "rgba(255,160,60,0.9)"); gr.addColorStop(1, "rgba(255,90,20,0)");
          g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
        }
        const vw = view.width / zoom, vh = view.height / zoom;
        const c0 = Math.floor(camX / TILE) - 2, c1 = Math.ceil((camX + vw) / TILE) + 2, r0 = Math.floor(camY / TILE) - 2, r1 = Math.ceil((camY + vh) / TILE) + 2;
        const size = 70 * zoom;
        for (let r = r0; r <= r1; r += 2) for (let c = c0; c <= c1; c += 2) {
          if (!isLavaType(groundLayer.get(c + "," + r))) continue;
          addSceneLight(lavaGlowCanvas, ((c + 0.5) * TILE - camX) * zoom - size / 2, ((r + 0.5) * TILE - camY) * zoom - size / 2, size, size, 0.5, [255, 140, 60]);
        }
      }
    } catch (e) { /* ignore */ }
    return base.apply(this, arguments);
  };
}
// at night the lava still burns bright: its glow drawn again after the night washes
{
  const base = drawLampNightRelight;
  drawLampNightRelight = function () {
    const r = base.apply(this, arguments);
    try {
      if (player.scene === "outside" && currentWorld === "east7") {
        const night = typeof getRelightStrength === "function" ? getRelightStrength() : 0;
        if (night > 0.05) {
          const vw = view.width / zoom, vh = view.height / zoom, T = TILE * zoom, t = performance.now() / 1000;
          const c0 = Math.floor(camX / TILE) - 1, c1 = Math.ceil((camX + vw) / TILE) + 1, r0 = Math.floor(camY / TILE) - 1, r1 = Math.ceil((camY + vh) / TILE) + 1;
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = night * (0.22 + 0.06 * Math.sin(t * 1.7));
          ctx.fillStyle = "#ff7a28";
          for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
            if (isLavaType(groundLayer.get(cc + "," + rr))) ctx.fillRect(Math.round((cc * TILE - camX) * zoom), Math.round((rr * TILE - camY) * zoom), Math.ceil(T) + 1, Math.ceil(T) + 1);
          }
          ctx.restore();
        }
      }
    } catch (e) { /* ignore */ }
    return r;
  };
}
// the Volcano: a red haze and embers drifting up (before the sky tint), and no snow on its ground
const volcanoEmbers = [];
{
  const base = drawFloatingPickups;
  drawFloatingPickups = function () {
    try {
      if (player.scene === "outside" && currentWorld === "east7") {
        ctx.save();
        ctx.globalAlpha = 1; ctx.fillStyle = "rgba(130,30,8,0.14)"; ctx.fillRect(0, 0, view.width, view.height);
        const vw = view.width / zoom, vh = view.height / zoom, now = performance.now() / 1000;
        while (volcanoEmbers.length < 60) volcanoEmbers.push({ x: camX + Math.random() * vw, y: camY + vh * (0.3 + Math.random() * 0.8), t0: now - Math.random() * 6, life: 4 + Math.random() * 4, sway: Math.random() * 6 });
        for (let i = volcanoEmbers.length - 1; i >= 0; i--) {
          const e = volcanoEmbers[i], k = (now - e.t0) / e.life;
          if (k >= 1 || e.x < camX - 40 || e.x > camX + vw + 40) { volcanoEmbers.splice(i, 1); continue; }
          const x = (e.x + Math.sin(now * 1.3 + e.sway) * 6 - camX) * zoom, y = (e.y - k * 70 - camY) * zoom;
          ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
          ctx.fillStyle = k < 0.5 ? "#ffd27a" : "#ff7a2a";
          const s = Math.max(1, zoom * (0.9 - k * 0.4));
          ctx.fillRect(x, y, s, s);
        }
        ctx.restore();
      }
    } catch (e) { /* ignore */ }
    return base.apply(this, arguments);
  };
}
if (typeof isSnowGroundActive === "function") {
  const base = isSnowGroundActive;
  isSnowGroundActive = function () { return typeof currentWorld !== "undefined" && currentWorld === "east7" ? false : base.apply(this, arguments); };
}
// fishing in the open sea (the port set's full-water pieces)
if (typeof isWaterTile === "function") {
  const base = isWaterTile;
  isWaterTile = function (c, r) {
    if (base.apply(this, arguments)) return true;
    if (player.scene !== "outside") return false;
    const t = groundLayer.get(c + "," + r);
    return (t === "portBR" || t === "portTL" || t === "portTR") && !objectLayer.has(c + "," + r);
  };
}
