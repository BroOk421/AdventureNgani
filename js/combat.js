"use strict";

/* =================================================================
   COMBAT polish — per request ("yung mga mobs is lumalaki yung health at
   damage base sa level yung bosses medyo makunat tapos gawa ka pa ng
   animation ng pag hit ng character using sword siguro 3 animation ...
   random ... lagyan mo ng effects kapag na hit yung mobs at character" +
   "yung drop na gold is baguhin mo itsura na parang coin ... ganun na din
   yung nag pop up na coin kapag nagbabayad kay maria"):
   - Mob HP / damage / DEF grow faster with level; bosses are tougher.
   - Every sword swings one of THREE attacks, picked at random each swing:
     an overhead slash, a wide horizontal sweep, and a lunging thrust.
     The trail takes the colour of the sword's upgrade aura (js/upgrades.js).
   - Hit effects: a mob that's hit gets an impact ring, sparks and a slash
     mark (bigger and orange on a crit, a burst on the kill); the player
     flashes red, throws red shards and the screen shakes a little.
   - Gold: a spinning coin (tools/coin_art.py) for the gold mobs drop and
     the coin that rises over Maria when a customer pays.
================================================================= */

assets.goldCoinSpin = new Image();
assets.goldCoinSpin.src = "assets/mobs/icons/goldCoin_spin.png";

/* ---------------- tougher mobs ---------------- */
{
  const base = makeMob;
  makeMob = function () {
    const m = base.apply(this, arguments);
    const def = m.def, k = Math.max(0, m.level - 1);
    if (def.boss) {
      // bosses: a lot more health, a harder hide, hit a bit harder the higher they are
      m.maxHp = m.hp = Math.round(def.hp * 1.6 * (1 + 0.02 * k));
      m.dmg = Math.round(def.dmg * (1 + 0.03 * k));
      m.armor = Math.round(m.level * 1.2);
    } else {
      m.maxHp = m.hp = Math.round(def.hp * (1 + 0.22 * k + 0.004 * k * k));
      m.dmg = Math.round(def.dmg * (1 + 0.14 * k));
      m.armor = Math.round(m.level * 0.7);
    }
    return m;
  };
}

/* ---------------- three sword attacks ---------------- */
function isSwordWeapon(type) {
  const d = type && itemDefs[type];
  return !!(d && d.weapon && d.weapon.damage && !d.weapon.ranged && /Sword|Cleaver|Reaver/.test(type));
}
// Per request ("palitan mo ng animation yung atk ... kasing bilis at effect ng pag putol ng puno o
// gamit ang axe pero gawin mo sa tatlong animation"): three CHOP-style swings, timed like the axe —
// a short wind-up, then a snap through the strike with a solid white crescent (the axe's swoosh),
// the hit landing mid-snap: an overhead chop, a side cleave and a rising backhand.
const SWORD_STYLES = ["overhead", "sweep", "rising"];
const SWORD_SWING_SPEED = 1.15;      // x the "hit" animation (4 frames @ ANIM_FPS.hit) — ~0.35 s a swing
const SWORD_ATTACK_INTERVAL = 0.55;  // s between auto-attack swings at SPD 1 (was 1 s) — js/gear.js autoAttackTick()
// Swing progress 0..1 -> blade position, shaped like the axe chop: pull back a little (wind-up),
// SNAP through (most of the arc in ~a fifth of the swing), then hold the follow-through.
const CHOP_WINDUP_END = 0.36, CHOP_STRIKE_END = 0.56, CHOP_PULLBACK = 0.12;
function chopCurve(t) {
  if (t < CHOP_WINDUP_END) return -CHOP_PULLBACK * Math.sin((t / CHOP_WINDUP_END) * Math.PI / 2);
  if (t < CHOP_STRIKE_END) { const u = (t - CHOP_WINDUP_END) / (CHOP_STRIKE_END - CHOP_WINDUP_END); return -CHOP_PULLBACK + (1 + CHOP_PULLBACK) * (1 - Math.pow(1 - u, 3)); }
  return 1;
}
// Per request ("gusto ko yung hawak niya is 2 handed kasi mabigat kapag 1 handed isahan lang short
// sword"): the big 40px blades (iron, bronze, emerald, diamond, the Storm Greatsword) are LONG
// swords — held in both hands, swung a little slower and wider; the 16px ones are SHORT swords,
// one hand, quick.
function isLongSword(type) {
  const d = type && itemDefs[type];
  if (!d || !isSwordWeapon(type)) return false;
  const strip = d.animStrip && assets[d.animStrip];
  const S = strip && strip.height ? strip.height : (d.icon && d.icon.height) || 16;
  return S >= 32;
}
let lastSwordStyle = null;
/* Per request ("kapag pinpindot yung espada or yung malaking button na yun is mga 2 tiles away is yun
   yung ma hit niya tapos bow 3 tiles"): F / the ATTACK button aims by itself — the nearest mob within
   2 tiles (a bow: 3) is turned to and hit, wherever it stands round you. */
const SWORD_AUTO_RANGE = 2 * TILE, BOW_AUTO_RANGE = 3 * TILE;
function autoAimMob() {
  const zone = typeof currentMineRoom === "function" ? currentMineRoom() : null;
  const st = zone && mineStates[mobZoneKey()];
  if (!st) return null;
  const w = player.equippedWeapon && itemDefs[player.equippedWeapon];
  const range = w && w.weapon && w.weapon.ranged ? BOW_AUTO_RANGE : SWORD_AUTO_RANGE;
  const fx = player.x, fy = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  let best = null, bd = 1e9;
  for (const m of st.mobs) {
    if (m.state === "dead" || m.gone) continue;
    const d = Math.hypot(m.x - fx, m.y - fy) - m.def.r * 0.5;
    if (d <= range && d < bd) { bd = d; best = m; }
  }
  return best;
}
{
  const base = startMineSwing;
  startMineSwing = function () {
    // the mob to hit: the one you're attacking (clicked), else the nearest in reach
    const aim = !isMobileMode() || window.skillSwingNoAim || (player.autoTarget && player.autoTarget.state !== "dead") ? null : autoAimMob(); // a skill picks its own target (js/skills.js)
    if (aim) {
      const fx = player.x, fy = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE, dx = aim.x - fx, dy = aim.y - fy;
      player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    }
    const r = base.apply(this, arguments);
    if (aim && player.mineSwing) player.mineSwing.aim = aim;
    if (player.mineSwing && isSwordWeapon(player.equippedWeapon)) {
      // the body plays the plain swing; the sword itself is drawn by drawSwordSwing() below
      player.action = "hit"; player.frame = 0; player.frameTimer = 0;
      let style = SWORD_STYLES[Math.floor(Math.random() * SWORD_STYLES.length)];
      if (style === lastSwordStyle && Math.random() < 0.6) style = SWORD_STYLES[(SWORD_STYLES.indexOf(style) + 1 + Math.floor(Math.random() * 2)) % 3];
      lastSwordStyle = style;
      player.mineSwing.style = style;
      player.mineSwing.sword = true;
      player.mineSwing.speed = (player.mineSwing.speed || 1) * SWORD_SWING_SPEED * (isLongSword(player.equippedWeapon) ? 0.92 : 1); // long swords: a touch heavier
    }
    return r;
  };
}
// Blade direction (screen, facing right; left is mirrored) at swing progress e (0..1):
// returns [angle, length factor, forward offset].
function swordPose(style, facing, e) {
  const lerp = (a, b) => a + (b - a) * e;
  const squash = (b, q, lift) => { const vx = Math.cos(b), vy = Math.sin(b) * q + (lift || 0); return [Math.atan2(vy, vx), Math.min(1, Math.hypot(vx, vy)), 0]; };
  if (style === "overhead") {
    const A = { right: [-2.2, 0.75], down: [-2.6, 0.4], up: [-0.9, -3.6] }[facing];
    return [lerp(A[0], A[1]), 1, 0];
  }
  if (style === "rising") {
    // low in front, up and over — the overhead chop run backwards
    const A = { right: [1.0, -2.3], down: [0.6, -2.7], up: [-0.6, -3.7] }[facing];
    return [lerp(A[0], A[1]), 1, 0];
  }
  if (style === "sweep") {
    if (facing === "right") return squash(lerp(3.5, 0.5), 0.45, 0.1);
    if (facing === "down") return squash(lerp(3.6, -0.45), 0.5, 0.05);
    return squash(lerp(-0.3, -2.85), 0.5, 0);
  }
  // thrust: straight out along the facing, lunging forward and back
  const a = { right: 0.12, down: Math.PI / 2, up: -Math.PI / 2 }[facing];
  const reach = e < 0.45 ? e / 0.45 : 1 - (e - 0.45) / 0.55 * 0.7;
  return [a, 0.75 + 0.25 * reach, reach];
}
const SWORD_PIVOT = { right: [5, 6], down: [4, 8], up: [-4, 4] }; // the hand, sprite px from the sprite's centre
const SWORD_PIVOT_2H = { right: [3, 7], down: [0, 9], up: [0, 5] }; // both hands together in front of the chest
const SKIN = "#e7b48b", SKIN_DARK = "#5a3424";
// the two fists on a two-handed grip, drawn in the sword's own (rotated) frame: along -x from the guard
function drawGripHands(k, count) {
  for (let i = 0; i < count; i++) {
    const x = -(1.2 + i * 3.1) * k;
    ctx.fillStyle = SKIN_DARK; ctx.fillRect(x - 1.7 * k, -1.7 * k, 3.4 * k, 3.4 * k);
    ctx.fillStyle = SKIN; ctx.fillRect(x - 1.2 * k, -1.2 * k, 2.4 * k, 2.4 * k);
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(x - 1.2 * k, -1.2 * k, 2.4 * k, 0.7 * k);
  }
}
function swordTrailColor() {
  const t = player.equippedWeapon;
  if (typeof upgradeOf === "function" && t) {
    const u = upgradeOf(t);
    if ((u.lvl || 0) >= (typeof UPGRADE_AURA_FROM !== "undefined" ? UPGRADE_AURA_FROM : 4) && u.el && UPGRADE_ELEMENTS[u.el]) return UPGRADE_ELEMENTS[u.el].glow;
  }
  if (itemDefs[t] && itemDefs[t].bossDrop) return [190, 120, 255];
  return [225, 232, 245];
}
// Replaces gear.js's Storm-Greatsword-only swing: every sword, three styles.
drawSwordSwing = function (screenX, screenY, z) {
  const t0 = player.equippedWeapon, d = t0 && itemDefs[t0];
  if (!player.mineSwing || !player.action || !isSwordWeapon(t0)) return;
  const strip = (!d.bossDrop && d.animStrip && assets[d.animStrip] && assets[d.animStrip].width) ? assets[d.animStrip] : d.icon; // boss blades: plain art, effects from upgrades
  if (!strip || !strip.width) return;
  const style = player.mineSwing.style || "overhead";
  const n = FRAME_COUNTS[player.action] || 4;
  const t = Math.min(1, (player.frame + Math.min(1, player.frameTimer * (ANIM_FPS[player.action] || 10) * (player.mineSwing.speed || 1))) / n);
  const chop = style !== "plunge" && style !== "thrust";
  const e = chop ? chopCurve(t) : (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2); // chop-style snap (skills' own moves keep the old ease)
  const k = (DRAW_SIZE / 64) * z, flip = player.facing === "left";
  const facing = flip ? "right" : (SWORD_PIVOT[player.facing] ? player.facing : "down");
  const S = strip.height, big = S >= 32, twoH = big || style === "plunge";
  const pv = (twoH ? SWORD_PIVOT_2H : SWORD_PIVOT)[facing];
  const R = (big ? 27 : 17) * z; // a long sword reaches further than a short one
  const grip = big ? HOLD_GRIP : [S * 0.16, S * 0.84];
  const tipArt = big ? [35, 5] : [S * 0.88, S * 0.12]; // where the point really is in the art
  const artLen = Math.hypot(tipArt[0] - grip[0], grip[1] - tipArt[1]);
  let [ang, lenF, fwd] = style === "plunge" ? [Math.PI / 2, 1, 0] : swordPose(style, facing, e);
  const lunge = style === "thrust" ? fwd * 4 * k : 0;
  let hx = screenX + (flip ? -pv[0] : pv[0]) * k, hy = screenY + pv[1] * k;
  if (style === "plunge") {
    // raised high in both hands, then driven point-first into the ground in front
    const up = t < 0.45 ? t / 0.45 : 1, down = t < 0.45 ? 0 : Math.min(1, (t - 0.45) / 0.15);
    const front = { right: [9, 0], down: [0, 4], up: [0, -6] }[facing];
    hx += (flip ? -front[0] : front[0]) * k;
    hy += front[1] * k - 14 * k * up * (1 - down) + 2 * k * down;
    lenF = 0.95;
  }
  const [cr, cg, cb] = swordTrailColor();
  ctx.save();
  ctx.translate(hx, hy);
  if (flip) ctx.scale(-1, 1);
  ctx.translate(Math.cos(ang) * lunge, Math.sin(ang) * lunge);
  // the trail
  if (style === "plunge") {
    // nothing trailing — the impact is drawn by the skill (js/skills.js)
  } else if (style === "thrust") {
    if (fwd > 0.15) {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 2.2 * k, len = R * lenF * (0.9 + 0.5 * fwd);
        const g = ctx.createLinearGradient(0, 0, Math.cos(ang) * len, Math.sin(ang) * len);
        g.addColorStop(0, "rgba(" + cr + "," + cg + "," + cb + ",0)"); g.addColorStop(1, "rgba(" + cr + "," + cg + "," + cb + "," + (0.55 * fwd) + ")");
        ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, (i === 1 ? 1.6 : 0.8) * k);
        ctx.beginPath();
        ctx.moveTo(-Math.sin(ang) * off - Math.cos(ang) * 10 * k * fwd, Math.cos(ang) * off - Math.sin(ang) * 10 * k * fwd);
        ctx.lineTo(Math.cos(ang) * len - Math.sin(ang) * off, Math.sin(ang) * len + Math.cos(ang) * off);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }
  } else if (t >= CHOP_WINDUP_END && t < 0.85) {
    // The axe's swoosh: a SOLID white crescent along the arc the blade just
    // swept — full right as it snaps through, thinning and fading on the
    // follow-through. Edged with the sword's aura colour (upgrades).
    const fade = t < CHOP_STRIKE_END ? 1 : 1 - (t - CHOP_STRIKE_END) / (0.85 - CHOP_STRIKE_END);
    const e0 = Math.max(-CHOP_PULLBACK, e - 0.95), steps = 14;
    const outer = [], inner = [];
    for (let i = 0; i <= steps; i++) {
      const q = i / steps, ee = e0 + (e - e0) * q;
      const [a2, l2] = swordPose(style, facing, ee);
      const thick = Math.sin(q * Math.PI) * 0.75 + 0.25 * q; // a crescent: thick in the middle, pointed at the tail
      const ro = R * l2 * 1.08, ri = R * l2 * (1.08 - 0.5 * thick * (0.55 + 0.45 * fade));
      outer.push([Math.cos(a2) * ro, Math.sin(a2) * ro]);
      inner.push([Math.cos(a2) * ri, Math.sin(a2) * ri]);
    }
    ctx.beginPath();
    outer.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
    ctx.closePath();
    ctx.globalAlpha = 0.95 * fade;
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.globalAlpha = 0.7 * fade;
    ctx.strokeStyle = "rgb(" + cr + "," + cg + "," + cb + ")";
    ctx.lineWidth = Math.max(1, 0.9 * k);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // the sword itself
  const s = (R * lenF / artLen);
  const fr = Math.floor(performance.now() / 90) % Math.max(1, Math.round(strip.width / S));
  ctx.save();
  ctx.rotate(ang + Math.PI / 4);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(strip, fr * S, 0, S, S, -grip[0] * s, -grip[1] * s, S * s, S * s);
  ctx.restore();
  // both hands on the grip (not when the body hides them: facing away)
  if (twoH && player.facing !== "up") { ctx.save(); ctx.rotate(ang); drawGripHands(k, 2); ctx.restore(); }
  // a glint at the tip
  const tx = Math.cos(ang) * R * lenF, ty = Math.sin(ang) * R * lenF;
  ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fillRect(tx - k, ty - k, 2 * k, 2 * k);
  ctx.restore();
};

{
  // the aimed mob is the one hit (it may stand beside or behind the old "in front" box)
  const base = resolveMineSwing;
  resolveMineSwing = function (room, st, swing) {
    const m = swing && swing.aim;
    if (m && m.state !== "dead" && st.mobs.includes(m) && !player.autoTarget) {
      const keep = player.autoTarget;
      player.autoTarget = m;
      const reach = swing.reach;
      if (!swing.ranged) swing.reach = Math.max(swing.reach || 0, SWORD_AUTO_RANGE);
      try { return base.apply(this, arguments); } finally { player.autoTarget = keep; swing.reach = reach; }
    }
    return base.apply(this, arguments);
  };
}

/* Per request ("yung sa atk na espada na button kahit 4 tiles na pala ang sakop na range malapitan niya
   yung mobs at espadahin"): F / ATTACK with no mob in reach but one within 4 tiles — the character runs
   up to it and attacks (the same as clicking it twice: player.autoTarget, js/gear.js autoAttackTick()). */
const ATTACK_SEEK_RANGE = 4 * TILE;
{
  const base = mineIndoorUpdate;
  mineIndoorUpdate = function (dt) {
    if (isMobileMode() && harvestRequested && !player.autoTarget && !player.action && !player.mineSwing && !player.skillAnim &&
        !(typeof isRoomTool === "function" && isRoomTool(player.equippedWeapon)) && player.equippedWeapon !== "fishingRod") {
      const zone = currentMineRoom(), st = zone && mineStates[mobZoneKey()];
      if (st && !autoAimMob()) {
        const fx = player.x, fy = player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
        let best = null, bd = 1e9;
        for (const m of st.mobs) {
          if (m.state === "dead" || m.gone) continue;
          const d = Math.hypot(m.x - fx, m.y - fy) - m.def.r * 0.5;
          if (d <= ATTACK_SEEK_RANGE && d < bd) { bd = d; best = m; }
        }
        if (best) { harvestRequested = false; player.autoTarget = best; player.selectedMob = best; }
      }
    }
    return base.apply(this, arguments);
  };
}

/* ---------------- hit effects ---------------- */
const combatFx = []; // { kind, x, y, t0, crit, color, zone, ang }
let playerHurtAt = -1;
function fxZone() { return typeof mobZoneKey === "function" ? mobZoneKey() : null; }
function shakeScreen(px, ms) {
  const t0 = performance.now();
  const step = () => {
    const k = (performance.now() - t0) / ms;
    if (k >= 1) { view.style.transform = ""; return; }
    const a = px * (1 - k);
    view.style.transform = "translate(" + ((Math.random() * 2 - 1) * a).toFixed(1) + "px," + ((Math.random() * 2 - 1) * a).toFixed(1) + "px)";
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
{
  const base = landMineHit;
  landMineHit = function (st, m, dmg, crit, missed) {
    const wasDead = m.state === "dead";
    const r = base.apply(this, arguments);
    if (wasDead) return r;
    const cy = typeof mobTopY === "function" ? (mobTopY(m) + m.y) / 2 : m.y - 8;
    const now = performance.now() / 1000, zone = fxZone();
    if (missed) { combatFx.push({ kind: "miss", x: m.x, y: cy, t0: now, zone }); return r; }
    const color = player.mineSwing && player.mineSwing.ranged ? [255, 236, 190] : swordTrailColor();
    const killed = m.state === "dead" || m.hp <= 0;
    // Per request ("baguhin mo effects same sa pag putol ng puno"): a hit
    // now reads like an axe biting a tree — the mob shakes, a quick white
    // nick flashes where the blade landed, and bits fly out of it, fall
    // and bounce on the ground; the killing blow throws a big shower, like
    // a tree coming down.
    m.chopShakeAt = now;
    combatFx.push({ kind: "hit", x: m.x, y: cy, t0: now, crit, color, zone, ang: Math.random() * Math.PI, sword: isSwordWeapon(player.equippedWeapon) });
    spawnChopChips(m, cy, killed ? (m.def.boss ? 34 : 22) : crit ? 12 : 7, crit, zone);
    if (killed) combatFx.push({ kind: "kill", x: m.x, y: cy, t0: now, color, zone, big: !!m.def.boss });
    if (crit) shakeScreen(3, 140);
    return r;
  };
  const hurtBase = damagePlayer;
  damagePlayer = function () {
    const before = player.health;
    const r = hurtBase.apply(this, arguments);
    if (player.health < before) {
      const now = performance.now() / 1000;
      playerHurtAt = now;
      combatFx.push({ kind: "hurt", x: player.x, y: player.y + 2, t0: now, zone: fxZone() });
      shakeScreen(4, 180);
    }
    return r;
  };
}
function drawCombatFx() {
  const now = performance.now() / 1000, zone = fxZone();
  for (let i = combatFx.length - 1; i >= 0; i--) {
    const f = combatFx[i], life = f.kind === "kill" ? 0.6 : f.kind === "miss" ? 0.35 : 0.42, k = (now - f.t0) / life;
    if (k >= 1 || f.zone !== zone) { combatFx.splice(i, 1); continue; }
    const x = (f.x - camX) * zoom, y = (f.y - camY) * zoom, Z = zoom;
    ctx.save();
    if (f.kind === "hit") {
      const [r, g, b] = f.crit ? [255, 170, 60] : f.color, big = f.crit ? 1.5 : 1;
      // the nick: a short, sharp white crescent across the mob (the chop mark)
      if (k < 0.55) {
        const kk = k / 0.55, L = 8 * big * Z, a0 = f.ang - 0.9;
        ctx.translate(x, y); ctx.rotate(a0);
        ctx.globalAlpha = 1 - kk;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(-L, 0);
        ctx.quadraticCurveTo(0, -3.2 * big * Z * (1 - kk * 0.6), L, 0);
        ctx.quadraticCurveTo(0, -1.0 * big * Z, -L, 0);
        ctx.fill();
        ctx.strokeStyle = "rgb(" + r + "," + g + "," + b + ")"; ctx.lineWidth = Math.max(1, 0.5 * Z); ctx.globalAlpha = (1 - kk) * 0.8;
        ctx.stroke();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      // a tiny white pop in the first instant
      if (k < 0.18) {
        ctx.globalAlpha = 1 - k / 0.18;
        ctx.fillStyle = "#ffffff";
        const sz = 3 * big * Z * (1 - k / 0.18 * 0.5);
        ctx.fillRect(Math.round(x - sz / 2), Math.round(y - sz / 2), Math.ceil(sz), Math.ceil(sz));
      }
    } else if (f.kind === "kill") {
      const [r, g, b] = f.color, big = f.big ? 2.2 : 1.2;
      for (let s = 0; s < 12; s++) {
        const a = s / 12 * Math.PI * 2 + s * 0.3, d = (4 + 16 * k) * big * Z;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = s % 3 ? "rgb(" + r + "," + g + "," + b + ")" : "#ffffff";
        const sz = (1 - k) * 2 * Z;
        ctx.fillRect(x + Math.cos(a) * d - sz / 2, y + Math.sin(a) * d * 0.8 - sz / 2 - k * 6 * Z, sz, sz);
      }
    } else if (f.kind === "miss") {
      ctx.globalAlpha = (1 - k) * 0.6;
      ctx.fillStyle = "#cfd6e0";
      for (let s = 0; s < 4; s++) ctx.fillRect(x + (s - 1.5) * 3 * Z, y - k * 5 * Z - (s % 2) * Z, 1.4 * Z, 1.4 * Z);
    } else if (f.kind === "hurt") {
      const cy = y - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE * Z * 0.2;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = "#ff4a4a"; ctx.lineWidth = Math.max(1, (1 - k) * 1.8 * Z);
      ctx.beginPath(); ctx.ellipse(x, cy, (5 + 12 * k) * Z, (4 + 9 * k) * Z, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#ff3030";
      for (let s = 0; s < 8; s++) {
        const a = s / 8 * Math.PI * 2 + 0.4, d = (4 + 12 * k) * Z, sz = (1 - k) * 1.8 * Z;
        ctx.save(); ctx.translate(x + Math.cos(a) * d, cy + Math.sin(a) * d); ctx.rotate(a);
        ctx.fillRect(-sz, -sz / 3, sz * 2, sz * 0.7); ctx.restore();
      }
    }
    ctx.restore();
  }
  drawChopChips(zone);
}

/* --- chop chips: bits knocked out of a mob, like wood chips off a tree ---
   Coloured from the mob's own sprite (its most common colours, read once
   per sheet on a CPU-side canvas), plus a few white flecks. They pop out
   away from you, fall, bounce once on the ground at the mob's feet and
   fade. World px, so they stay put when the camera moves. */
const chopChips = [];
const CHOP_CHIP_MAX = 160;
const mobChipColorCache = new Map();
function mobChipColors(m) {
  const sheet = assets["mobsheet_" + m.type + "_idle"] || assets["mobsheet_" + m.type + "_" + m.anim];
  if (!sheet || !sheet.width) return ["#8a8a8a", "#5a5a5a"];
  let c = mobChipColorCache.get(sheet);
  if (c) return c;
  c = ["#8a8a8a", "#5a5a5a"];
  try {
    const S = m.def.size || sheet.height, cv = document.createElement("canvas");
    cv.width = S; cv.height = S;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(sheet, 0, 0, S, S, 0, 0, S, S);
    const d = g.getImageData(0, 0, S, S).data, count = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      const lum = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      if (lum < 35) continue; // skip the dark outline
      const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      count.set(key, (count.get(key) || 0) + 1);
    }
    const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key]) => {
      const r = ((key >> 8) & 15) * 17, gg = ((key >> 4) & 15) * 17, b = (key & 15) * 17;
      return "rgb(" + r + "," + gg + "," + b + ")";
    });
    if (top.length) c = top;
  } catch (e) { /* tainted (file://): grey chips */ }
  mobChipColorCache.set(sheet, c);
  return c;
}
function spawnChopChips(m, cy, n, crit, zone) {
  const cols = mobChipColors(m);
  const away = m.x >= player.x ? 1 : -1; // knocked away from you, like chips out of the cut
  const now = performance.now() / 1000;
  for (let i = 0; i < n; i++) {
    const white = Math.random() < 0.25;
    chopChips.push({
      x: m.x + (Math.random() - 0.5) * 4, y: cy + (Math.random() - 0.5) * 4,
      vx: away * (8 + Math.random() * 34) + (Math.random() - 0.5) * 18, vy: -18 - Math.random() * 26,
      floorY: m.y + (Math.random() - 0.5) * 6, bounced: false,
      t0: now, life: 0.55 + Math.random() * 0.4,
      color: white ? "#ffffff" : crit && Math.random() < 0.3 ? "#ffb84a" : cols[Math.floor(Math.random() * cols.length)],
      size: Math.random() < 0.3 ? 1.5 : 1, zone,
    });
  }
  if (chopChips.length > CHOP_CHIP_MAX) chopChips.splice(0, chopChips.length - CHOP_CHIP_MAX);
}
let chopChipsLast = 0;
function drawChopChips(zone) {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, chopChipsLast ? now - chopChipsLast : 0);
  chopChipsLast = now;
  if (!chopChips.length) return;
  ctx.save();
  for (let i = chopChips.length - 1; i >= 0; i--) {
    const c = chopChips[i], age = now - c.t0;
    if (age >= c.life || c.zone !== zone) { chopChips.splice(i, 1); continue; }
    c.vy += 140 * dt; c.x += c.vx * dt; c.y += c.vy * dt;
    if (c.y >= c.floorY && c.vy > 0) {
      c.y = c.floorY;
      if (!c.bounced) { c.vy *= -0.35; c.vx *= 0.5; c.bounced = true; } else { c.vy = 0; c.vx *= 0.8; }
    }
    const fade = age > c.life * 0.6 ? 1 - (age - c.life * 0.6) / (c.life * 0.4) : 1;
    ctx.globalAlpha = Math.max(0, fade);
    ctx.fillStyle = c.color;
    const sz = Math.max(1, Math.round(c.size * zoom));
    ctx.fillRect(Math.round((c.x - camX) * zoom), Math.round((c.y - camY) * zoom), sz, sz);
  }
  ctx.restore();
}

// The mob shakes under the hit, like a tree under the axe (js/plantfx.js TREE_SHAKE_*).
const MOB_CHOP_SHAKE_SECONDS = 0.28, MOB_CHOP_SHAKE_PX = 1.4, MOB_CHOP_SHAKE_FREQ = 55;
{
  const base = drawMob;
  drawMob = function (m) {
    const age = m.chopShakeAt != null ? performance.now() / 1000 - m.chopShakeAt : 99;
    if (age >= MOB_CHOP_SHAKE_SECONDS || m.state === "dead") return base.apply(this, arguments);
    const off = MOB_CHOP_SHAKE_PX * Math.sin(age * MOB_CHOP_SHAKE_FREQ) * (1 - age / MOB_CHOP_SHAKE_SECONDS);
    m.x += off;
    try { return base.apply(this, arguments); } finally { m.x -= off; }
  };
}
{
  const base = drawMineOverlay;
  drawMineOverlay = function () {
    const r = base.apply(this, arguments);
    if (currentMineRoom()) drawCombatFx();
    return r;
  };
}
// the player flashes red for a moment when hit
const hurtTintCanvas = document.createElement("canvas");
{
  const base = drawPlayer;
  drawPlayer = function (screenX, screenY, z) {
    const r = base.apply(this, arguments);
    const k = (performance.now() / 1000 - playerHurtAt) / 0.3;
    if (k >= 0 && k < 1 && !player.sleeping && !player.sitting) {
      const size = DRAW_SIZE * z, w = Math.ceil(size * 1.5), h = Math.ceil(size * 1.5);
      if (hurtTintCanvas.width !== w || hurtTintCanvas.height !== h) { hurtTintCanvas.width = w; hurtTintCanvas.height = h; }
      const g = hurtTintCanvas.getContext("2d");
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = false;
      drawPlayerSprite(w / 2, h / 2, z, g);
      g.globalCompositeOperation = "source-in"; g.fillStyle = "#ff2a2a"; g.fillRect(0, 0, w, h);
      ctx.save(); ctx.globalAlpha = 0.6 * (1 - k); ctx.drawImage(hurtTintCanvas, Math.round(screenX - w / 2), Math.round(screenY - h / 2)); ctx.restore();
    }
    return r;
  };
}

/* ---------------- the coin ---------------- */
function drawSpinCoin(cx, bottomY, size, phase) {
  const strip = assets.goldCoinSpin;
  if (!strip || !strip.width) return false;
  const frames = Math.round(strip.width / strip.height), S = strip.height;
  const fr = Math.floor(phase * 12) % frames;
  ctx.drawImage(strip, fr * S, 0, S, S, Math.round(cx - size / 2), Math.round(bottomY - size), size, size);
  return true;
}
{
  const base = drawMineDrop;
  drawMineDrop = function (d) {
    if (d.type !== "goldCoin" || !assets.goldCoinSpin.width) return base.apply(this, arguments);
    const now = performance.now() / 1000;
    const bob = d.phase === "rest" ? Math.sin((now - d.born) * 3) * 0.8 : 0;
    const x = (d.x - camX) * zoom, y = (d.y - d.z - camY) * zoom;
    const size = 9 * zoom;
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(x, (d.y - camY) * zoom, 3.5 * zoom, 1.3 * zoom, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
    drawSpinCoin(x, y - bob * zoom, size, now + (d.born || 0));
    if (d.amount > 4) drawSpinCoin(x + 3 * zoom, y - bob * zoom + 1.5 * zoom, size * 0.85, now + 0.4 + (d.born || 0)); // a little pile for bigger amounts
    ctx.restore();
  };
}
// Maria getting paid: the same spinning coin rises over her head, with a glint.
if (typeof drawMariaPayFx === "function") {
  drawMariaPayFx = function (dt) {
    mariaPayFx.forEach((f) => { f.t += dt; });
    mariaPayFx = mariaPayFx.filter((f) => f.t < 1.2);
    if (!mariaPayFx.length || player.scene !== "inside" || npc.scene !== "inside" || npc.roomId !== player.activeRoomId) return;
    const headY = npc.inY - DRAW_SIZE / 2 + DRAW_SIZE * SPRITE_HEAD_FRACTION;
    for (const f of mariaPayFx) {
      const x = (npc.inX - camX) * zoom;
      const y = (headY - camY) * zoom - f.t * 10 * zoom;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
      if (!drawSpinCoin(x, y, 10 * zoom, f.t)) { const icon = assets.goldCoins; if (icon.width) ctx.drawImage(icon, x - 5 * zoom, y - 10 * zoom, 10 * zoom, 10 * zoom); }
      if (f.t < 0.5) { // a glint
        const g = Math.sin(f.t / 0.5 * Math.PI) * 2.2 * zoom;
        ctx.fillStyle = "#fffbe0";
        ctx.fillRect(x + 2.5 * zoom - g / 2, y - 7 * zoom - g * 0.15, g, g * 0.3);
        ctx.fillRect(x + 2.5 * zoom - g * 0.15, y - 7 * zoom - g / 2, g * 0.3, g);
      }
      ctx.restore();
    }
  };
}
