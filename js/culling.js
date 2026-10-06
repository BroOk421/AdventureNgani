"use strict";

/* =================================================================
   CULLING — only what's on screen (plus 3 tiles round it) is worked on.

   Per request ("yung nasa screen lang mag render mag render lang yung iba
   kapag nasa view na ng screen ... lagpas lang ng screen 3 tiles pa"):
   most passes already skipped what's off screen (the ground chunks, the
   flat layers, citizens, animals, lights, critters, chests). The rest now
   follow the same rule, with a CULL_MARGIN of 3 tiles past the screen:
     - placed objects (trees, rocks, houses...): drawn only when their art
       rectangle reaches the screen + 3 tiles (was a looser box);
     - mobs: drawn only on screen + 3 tiles; a mob that's off screen AND
       too far away to notice you only "thinks" 4 times a second instead of
       every frame (its time is saved up, so it still wanders the same).
     - drops lying off screen aren't drawn.
================================================================= */

const CULL_MARGIN = 3 * TILE; // world px past the screen edge
function cullView() {
  return { x0: camX - CULL_MARGIN, y0: camY - CULL_MARGIN, x1: camX + view.width / zoom + CULL_MARGIN, y1: camY + view.height / zoom + CULL_MARGIN };
}
// a world-px rectangle against the screen + margin
function rectInView(x0, y0, x1, y1) {
  const v = cullView();
  return x1 >= v.x0 && x0 <= v.x1 && y1 >= v.y0 && y0 <= v.y1;
}

/* ---------------- placed objects ---------------- */
itemOffscreen = function (type, col, row) {
  const d = itemDefs[type];
  const ic = d && d.icon;
  if (!ic || !ic.width) return false;
  const root = d.artRoot || { x: 0, y: 0 };
  // a night-swapped / snowy picture can be a little bigger: allow a tile of slack round the art
  const left = (col + 0.5) * TILE - ic.width / 2 - root.x - TILE, right = left + ic.width + 2 * TILE;
  const bottom = (row + 1) * TILE - root.y + TILE, top = bottom - ic.height - 2 * TILE;
  return !rectInView(left, top, right, bottom);
};

/* ---------------- mobs ---------------- */
function mobOnScreen(m) {
  const S = (m.def.size || 32) * (m.def.scale || 1);
  return rectInView(m.x - S / 2, m.y - S, m.x + S / 2, m.y + 8);
}
{
  const draw = drawMob;
  drawMob = function (m) { if (!mobOnScreen(m)) return; return draw.apply(this, arguments); };
  const drop = drawMineDrop;
  drawMineDrop = function (d) { if (d.phase === "rest" && !rectInView(d.x - 10, d.y - 20, d.x + 10, d.y + 4)) return; return drop.apply(this, arguments); };
  const upd = updateMob;
  updateMob = function (room, st, m, dt) {
    if (m.state === "dead" || m.state === "attack" || (m.stunUntil && m.stunUntil > performance.now() / 1000) || player.autoTarget === m || mobOnScreen(m)) {
      if (m._idleDt) { dt += m._idleDt; m._idleDt = 0; }
      return upd.call(this, room, st, m, Math.min(dt, 0.25));
    }
    const fy = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
    if (Math.hypot(player.x - m.x, fy - m.y) <= (m.def.aggro || 120) + 24) return upd.apply(this, arguments); // close enough to notice you: full speed
    m._idleDt = (m._idleDt || 0) + dt;
    if (m._idleDt < 0.25) return;
    const big = m._idleDt; m._idleDt = 0;
    return upd.call(this, room, st, m, big);
  };
}
