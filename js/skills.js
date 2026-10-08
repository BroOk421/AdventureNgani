"use strict";

/* =================================================================
   SKILLS — three active skills and three passives.

   Per request ("gawa ka rin ng skills na slash magagamit lang sa mobs may
   cooldown 4s stamina deduction din tapos teleport tapos add ka ng passive
   for atk, atk speed at defence lagay ka rin animation ng stun at skills
   na stun para sa enemy"):
   Actives (skill bar, bottom-right — click it or press the key):
     Z  Slash     — a wide crescent wave in front: x2.2 ATK to every mob it
                    reaches (about 3 tiles). Mobs only. 4 s, 15 stamina.
     X  Stun      — a jolt at your target (or the nearest mob, 3.5 tiles):
                    x0.9 ATK and the mob is stunned (stars round its head,
                    can't move or attack) for 2.5 s (bosses 1.2 s).
                    Mobs only. 8 s, 20 stamina.
     C  Teleport  — blink up to 4 tiles the way you face (stops at walls),
                    a moment of safety on arrival. Anywhere. 6 s, 12 stamina.
   Passives (K, or the ✦ button): 1 skill point per level after 1. Each up
   to rank 10:
     Power     +4% ATK per rank
     Swiftness +3% attack speed per rank
     Guard     +5% DEF per rank (+1 DEF per rank)
   player.passives = { atk, aspd, def } — saved.
================================================================= */

const SKILLS = {
  slash:    { key: "z", name: "Slash",    cd: 4, stamina: 15, mobsOnly: true },
  stun:     { key: "x", name: "Stun",     cd: 8, stamina: 20, mobsOnly: true },
  teleport: { key: "c", name: "Teleport", cd: 6, stamina: 12, mobsOnly: false },
};
// Per request ("yung slash stun at teleport is na uups din max 10"): each active skill levels up
// 1 -> 10 with the same skill points as the passives. What a level gives:
const SKILL_MAX = 10;
function skillLevels() { return Object.assign({ slash: 1, stun: 1, teleport: 1 }, player.skillLv || {}); }
function skillLevel(id) { return Math.max(1, Math.min(SKILL_MAX, skillLevels()[id] || 1)); }
function skillStats(id, L) {
  L = L || skillLevel(id);
  const n = L - 1;
  // Per request ("medyo layuan pa yung sakop na tiles ng slash"): reach 3 -> 4.5 tiles (+0.15 a level)
  if (id === "slash") return { mult: 2.2 + 0.18 * n, range: 4.5 + 0.15 * n, cd: Math.round((4 - 0.1 * n) * 10) / 10 };
  if (id === "stun") return { mult: 0.9 + 0.1 * n, radius: 2.5 + 0.1 * n, dur: Math.round((3 + 0.15 * n) * 100) / 100, bossDur: Math.round((1.5 + 0.06 * n) * 100) / 100, cd: Math.round((8 - 0.25 * n) * 100) / 100 };
  return { dist: 4 + 0.25 * n, cd: Math.round((6 - 0.25 * n) * 100) / 100 };
}
function skillCd(id) { return skillStats(id).cd; }
function skillDesc(id, L) {
  const st = skillStats(id, L);
  if (id === "slash") return "A wide slash in front — hits every mob in reach (" + st.range.toFixed(1) + " tiles). x" + st.mult.toFixed(2) + " ATK.";
  if (id === "stun") return "Leaps at the enemy and drives the sword into the ground — every mob around (" + st.radius.toFixed(1) + " tiles) takes x" + st.mult.toFixed(2) + " ATK and is stunned for " + st.dur + "s (boss " + st.bossDur + "s).";
  return "Blink up to " + st.dist.toFixed(2) + " tiles ahead (stops at walls).";
}
const PASSIVES = {
  atk:  { name: "Power",     per: "+4% ATK",          desc: "Every hit is stronger." },
  aspd: { name: "Swiftness", per: "+3% attack speed", desc: "Attack faster." },
  def:  { name: "Guard",     per: "+5% DEF, +1 DEF",  desc: "Take less damage." },
};
const PASSIVE_MAX = 10;
const skillReadyAt = {}; // id -> seconds (performance clock)
const skillNow = () => performance.now() / 1000;

/* ---------------- passives ---------------- */
function passiveRanks() { return Object.assign({ atk: 0, aspd: 0, def: 0 }, player.passives || {}); }
function skillPointsLeft() {
  const r = passiveRanks(), sl = skillLevels();
  const spentSkills = (sl.slash - 1) + (sl.stun - 1) + (sl.teleport - 1);
  return Math.max(0, (player.level || 1) - 1 - (r.atk + r.aspd + r.def) - spentSkills);
}
{
  const base = playerStats;
  playerStats = function () {
    const s = base.apply(this, arguments);
    const r = passiveRanks();
    s.atk = Math.round(s.atk * (1 + 0.04 * r.atk));
    s.spd = Math.round(s.spd * (1 + 0.03 * r.aspd) * 100) / 100;
    s.def = Math.round(s.def * (1 + 0.05 * r.def)) + r.def;
    s.defPct = s.def / (s.def + 100);
    return s;
  };
  const saveBase = buildSaveData;
  buildSaveData = function () { const d = saveBase.apply(this, arguments); d.passives = passiveRanks(); d.skillLv = skillLevels(); return d; };
  const loadBase = applySaveData;
  applySaveData = function (data) {
    const r = loadBase.apply(this, arguments);
    player.passives = data && data.passives ? Object.assign({ atk: 0, aspd: 0, def: 0 }, data.passives) : { atk: 0, aspd: 0, def: 0 };
    player.skillLv = data && data.skillLv ? Object.assign({ slash: 1, stun: 1, teleport: 1 }, data.skillLv) : { slash: 1, stun: 1, teleport: 1 };
    return r;
  };
}

/* ---------------- using a skill ---------------- */
function skillBusy() {
  return !!(player.action || player.special || player.skillAnim || player.sleeping || player.sitting || (typeof sceneFade !== "undefined" && sceneFade) || (typeof inventoryOpen !== "undefined" && inventoryOpen));
}
function skillToast(t) { if (typeof showToast === "function") showToast(t); }
function skillReady(id, quiet) {
  const S = SKILLS[id], now = skillNow();
  if ((skillReadyAt[id] || 0) > now) { if (!quiet) skillToast(S.name + " — " + Math.ceil(skillReadyAt[id] - now) + "s left"); return false; }
  if ((player.stamina || 0) < S.stamina) { if (!quiet) skillToast("Not enough stamina for " + S.name); return false; }
  return true;
}
function spendSkill(id) {
  player.stamina = Math.max(0, player.stamina - SKILLS[id].stamina);
  skillReadyAt[id] = skillNow() + skillCd(id);
}
function mobZoneState() {
  const zone = typeof currentMineRoom === "function" ? currentMineRoom() : null;
  const st = zone && mineStates[mobZoneKey()];
  return zone && st ? { zone, st } : null;
}
const FACE_VEC = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
function skillDamage(mult, m) {
  const S = playerStats();
  const crit = Math.random() < (S.crit || 0.12);
  const dmg = Math.max(1, Math.round(S.atk * mult * (0.9 + Math.random() * 0.2) * (crit ? 1.8 : 1) - (m.armor || 0) * 0.5));
  return { dmg, crit };
}
// a sword-style body swing whose own hit is skipped (the skill deals the damage)
function skillSwing(style) {
  window.skillSwingNoAim = true;
  try { startMineSwing(); } finally { window.skillSwingNoAim = false; }
  if (player.mineSwing) { player.mineSwing.hitDone = true; player.mineSwing.style = style; player.mineSwing.skill = true; }
}
const skillFx = []; // { kind, ..., t0 }
const playerFeet = () => ({ x: player.x, y: player.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE });
function faceToward(m) {
  const f = playerFeet(), dx = m.x - f.x, dy = m.y - f.y;
  player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
}
function mobAlive(m, st) { return !!(m && m.state !== "dead" && !m.gone && (!st || st.mobs.includes(m))); }

/* ---------------- aiming: the skill is pointed at a mob ----------------
   Per request ("1 click highlight yung pang 2 pwede rin gamitin yung skill ... click ng skills tapos
   need i click sa kalaban para ma specific"): a mob skill (Slash, Stun) goes at
     - the mob you've highlighted (one click) or are already attacking, or else
     - the mob you click next: pressing the skill with nothing selected starts aiming (crosshair) —
       click a mob to use it on that one (Esc / click empty ground cancels).
   Out of reach, you walk up to it first, then the skill fires (any movement key cancels). The
   skill counts as the second click: afterwards you keep attacking that mob. */
let skillAiming = null;        // skill id waiting for a mob click
let skillPending = null;       // { id, m } walking into range
const SKILL_SEEK_RANGE = 7 * TILE; // phone: how far a skill looks for a mob by itself
function skillReach(id) { return id === "slash" ? skillStats("slash").range * TILE * 0.8 : 3.5 * TILE; }
function requestSkill(id) {
  const S = SKILLS[id];
  if (!S) return;
  if (!skillReady(id)) return;
  if (skillBusy()) return;
  if (id === "teleport") { if (castTeleport()) spendSkill(id); return; }
  const z = mobZoneState();
  if (!z) { skillToast(S.name + " — only usable against mobs"); return; }
  let m = mobAlive(player.selectedMob, z.st) ? player.selectedMob : mobAlive(player.autoTarget, z.st) ? player.autoTarget : null;
  // Per request ("kahit yung sa skills niya pag click highlight at lalapit sa mobs tyaka gagana yung
  // skills"): on a phone there's no aiming click — the skill picks the nearest / weakest mob itself
  // (same rule as the ATTACK button, js/combat.js pickMobileTarget()), highlights it, walks up, fires.
  if (!m && isMobileMode() && typeof pickMobileTarget === "function") {
    m = pickMobileTarget(SKILL_SEEK_RANGE);
    if (!m) { skillToast(S.name + " — no enemy nearby"); return; }
  }
  if (m) { beginSkillOn(id, m); return; }
  setAiming(id);
}
function setAiming(id) {
  skillAiming = id;
  document.body.classList.toggle("skill-aim", !!id);
  if (skillBarEl) for (const b of skillBarEl.querySelectorAll(".skill-btn[data-skill]")) b.classList.toggle("aiming", b.dataset.skill === id);
  if (id) skillToast(SKILLS[id].name + ": click an enemy (Esc = cancel)");
}
function beginSkillOn(id, m) {
  player.selectedMob = m;
  if (typeof stopAutoAttack === "function" && player.autoTarget && player.autoTarget !== m) stopAutoAttack();
  skillPending = { id, m };
}
// walking into range + firing, every frame in a mob zone (autoAttackTick() is called from mineIndoorUpdate())
{
  const base = autoAttackTick;
  autoAttackTick = function (zone, st, dt) {
    const P = skillPending;
    if (P) {
      if (!mobAlive(P.m, st)) { skillPending = null; if (typeof releaseAutoKeys === "function") releaseAutoKeys(); return false; }
      if (player.mineSwing || player.action) return false;
      const f = playerFeet(), dx = P.m.x - f.x, dy = P.m.y - f.y, dist = Math.hypot(dx, dy);
      if (dist > skillReach(P.id) + P.m.def.r * 0.5) {
        const want = new Set();
        if (dx > 4) want.add("d"); else if (dx < -4) want.add("a");
        if (dy > 4) want.add("s"); else if (dy < -4) want.add("w");
        for (const k of autoKeysHeld) if (!want.has(k)) keys[k] = false;
        for (const k of want) keys[k] = true;
        autoKeysHeld = want;
        if (dist > 400) { skillPending = null; releaseAutoKeys(); }
        return false;
      }
      releaseAutoKeys();
      skillPending = null;
      if (!skillReady(P.id)) return false;
      const ok = P.id === "slash" ? castSlash(st, P.m) : castStun(st, P.m);
      if (ok) {
        spendSkill(P.id);
        // the skill was the "second click": keep attacking it afterwards
        if (P.id === "slash") player.autoTarget = P.m;
      }
      return ok;
    }
    return base.apply(this, arguments);
  };
}
// a movement key cancels the walk-up
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (skillPending && ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k) && !autoKeysHeld.has(k)) { skillPending = null; releaseAutoKeys(); }
}, true);
// the click that picks the mob while aiming — window capture runs before the view's own handlers
function mobUnderPointer(e, st) {
  const { x, y } = screenToWorld(e.clientX, e.clientY);
  let best = null, bd = 1e9;
  for (const m of st.mobs) {
    if (m.state === "dead" || m.gone) continue;
    const top = mobTopY(m), r = m.def.r + 5;
    if (x < m.x - r || x > m.x + r || y < top - 5 || y > m.y + 5) continue;
    const d = Math.hypot(m.x - x, (m.y + top) / 2 - y);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}
window.addEventListener("mousedown", (e) => {
  if (!skillAiming || e.button !== 0 || e.target !== view) return;
  const id = skillAiming;
  const z = mobZoneState();
  e.stopImmediatePropagation(); e.preventDefault();
  setAiming(null);
  if (!z) return;
  const m = mobUnderPointer(e, z.st);
  if (!m) { skillToast(SKILLS[id].name + " — cancelled"); return; }
  if (skillReady(id)) beginSkillOn(id, m);
}, true);
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && skillAiming) setAiming(null); });

/* ---------------- Slash ---------------- */
function castSlash(st, target) {
  faceToward(target);
  const [dx, dy] = FACE_VEC[player.facing] || [0, 1];
  const f = playerFeet(), SS = skillStats("slash"), R = SS.range * TILE;
  const hits = st.mobs.filter((m) => {
    if (!mobAlive(m)) return false;
    if (m === target) return true;
    const vx = m.x - f.x, vy = m.y - f.y, d = Math.hypot(vx, vy);
    if (d > R + m.def.r) return false;
    if (d < 14) return true;
    return (vx * dx + vy * dy) / d > 0.05; // inside the front arc (a wide half-circle in front)
  });
  skillSwing("sweep");
  skillFx.push({ kind: "wave", x: f.x, y: f.y - 8, dx, dy, range: R, t0: skillNow() });
  setTimeout(() => {
    for (const m of hits) { if (m.state === "dead") continue; const h = skillDamage(SS.mult, m); landMineHit(st, m, h.dmg, h.crit, false, f.x, f.y); }
  }, 90);
  return true;
}

/* ---------------- Stun: jump, plunge the sword, pull it out ----------------
   Per request ("yung tumatalon tapos itutusok yung sword sa lupa tapos may animation din na
   binubunot niya yung sword pataas"): a leap at the mob (landing just in front of it), the sword
   driven point-first into the ground on landing — the quake stuns every mob round it for 3 s — a
   moment with the blade stuck in the earth, then it's wrenched back up out of the ground. */
const STUN_T = { jump: 0.36, slam: 0.46, hold: 0.82, pull: 1.12, end: 1.26 };
function castStun(st, target) {
  faceToward(target);
  const f = playerFeet();
  const dx = target.x - f.x, dy = target.y - f.y, d = Math.hypot(dx, dy) || 1;
  const land = Math.max(0, d - (target.def.r + 10)); // stop just short of it
  let lx = f.x + dx / d * land, ly = f.y + dy / d * land;
  const blocked = (x, y) => (player.scene === "inside" ? isInteriorBodyBlockedAt(INTERIOR_ROOMS[player.activeRoomId], x, y - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE) : isBodyBlockedAt(x, y - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE));
  for (let i = 0; i < 10 && blocked(lx, ly); i++) { lx = f.x + (lx - f.x) * 0.75; ly = f.y + (ly - f.y) * 0.75; }
  if (blocked(lx, ly)) { lx = f.x; ly = f.y; }
  player.skillAnim = { kind: "stun", t: 0, x0: player.x, y0: player.y, x1: lx, y1: ly - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE, m: target, st, done: {} };
  player.mineInvulnUntil = Math.max(player.mineInvulnUntil || 0, skillNow() + STUN_T.end + 0.2);
  player.mineSwing = null;
  return true;
}
function stunImpact(A) {
  const SS = skillStats("stun"), [dx, dy] = FACE_VEC[player.facing] || [0, 1];
  const f = playerFeet(), R = SS.radius * TILE;
  const ix = f.x + dx * 9, iy = f.y + (dy > 0 ? 4 : dy < 0 ? -6 : 1);
  skillFx.push({ kind: "quake", x: ix, y: iy, R, t0: skillNow(), seed: Math.random() * 1000 });
  if (typeof shakeScreen === "function") shakeScreen(6, 300);
  for (const m of A.st.mobs) {
    if (!mobAlive(m) || Math.hypot(m.x - f.x, m.y - f.y) > R + m.def.r) continue;
    const h = skillDamage(SS.mult, m);
    landMineHit(A.st, m, h.dmg, h.crit, false, f.x, f.y);
    if (m.state !== "dead") {
      m.stunUntil = skillNow() + (m.def.boss ? SS.bossDur : SS.dur);
      m.kx = 0; m.ky = 0;
      skillFx.push({ kind: "stunburst", m, t0: skillNow() });
    }
  }
  A.ix = ix; A.iy = iy;
}
function stunPose(t) { // [player "hit" frame, jump height (world px)]
  if (t < STUN_T.jump) { const p = t / STUN_T.jump; return [1, Math.sin(p * Math.PI) * 20]; }
  if (t < STUN_T.slam) return [3, 0];
  if (t < STUN_T.hold) return [3, 0];
  if (t < STUN_T.pull) return [t < (STUN_T.hold + STUN_T.pull) / 2 ? 2 : 1, 0];
  return [0, 0];
}

/* ---------------- Teleport: dissolve into particles, gather again ---------------- */
const TP_T = { vanish: 0.16, swap: 0.22, form: 0.42 };
function teleportBlocked(x, y) {
  if (player.scene === "inside") {
    const room = INTERIOR_ROOMS[player.activeRoomId];
    return !room || isInteriorBodyBlockedAt(room, x, y);
  }
  if (typeof worldW === "function" && (x < 8 || y < 8 || x > worldW() - 8 || y > worldH() - 8)) return true;
  return isBodyBlockedAt(x, y);
}
// the character's own pixels in this frame, as world points + colours (for the particles)
function playerPixels(x, y, max) {
  const sheet = currentPlayerSheet(), out = [];
  const size = DRAW_SIZE, k = size / FRAME_SIZE, flip = player.facing === "left";
  try {
    const c = document.createElement("canvas"); c.width = c.height = FRAME_SIZE;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (flip) { g.translate(FRAME_SIZE, 0); g.scale(-1, 1); }
    g.drawImage(sheet, player.frame * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE, 0, 0, FRAME_SIZE, FRAME_SIZE);
    const d = g.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE).data, pts = [];
    for (let py = 0; py < FRAME_SIZE; py += 2) for (let px = 0; px < FRAME_SIZE; px += 2) {
      const i = (py * FRAME_SIZE + px) * 4;
      if (d[i + 3] > 100) pts.push([px, py, d[i], d[i + 1], d[i + 2]]);
    }
    for (let n = 0; n < Math.min(max, pts.length); n++) {
      const p = pts[Math.floor(Math.random() * pts.length)];
      out.push({ x: x + (p[0] - 32) * k, y: y + (p[1] - 32) * k, c: "rgb(" + p[2] + "," + p[3] + "," + p[4] + ")" });
    }
  } catch (e) {
    for (let n = 0; n < max; n++) out.push({ x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.3) * 24, c: "#cfe0ff" });
  }
  return out;
}
function castTeleport() {
  if (skillBusy()) return false;
  let dx = 0, dy = 0;
  if (keys["w"] || keys["arrowup"]) dy -= 1;
  if (keys["s"] || keys["arrowdown"]) dy += 1;
  if (keys["a"] || keys["arrowleft"]) dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;
  if (!dx && !dy) [dx, dy] = FACE_VEC[player.facing] || [0, 1];
  const L = Math.hypot(dx, dy); dx /= L; dy /= L;
  const x0 = player.x, y0 = player.y;
  let bx = x0, by = y0;
  const maxD = skillStats("teleport").dist * TILE;
  for (let d = 2; d <= maxD; d += 2) {
    const x = x0 + dx * d, y = y0 + dy * d;
    if (teleportBlocked(x, y)) break;
    bx = x; by = y;
  }
  if (Math.hypot(bx - x0, by - y0) < 8) { skillToast("Can't get through — something's in the way"); return false; }
  const now = skillNow();
  // out: every pixel of you flies apart and fades
  for (const p of playerPixels(x0, y0, 90)) skillFx.push({ kind: "mote", x: p.x, y: p.y, c: p.c, vx: (Math.random() - 0.5) * 30 + dx * 20, vy: -10 - Math.random() * 30, t0: now + Math.random() * 0.08, life: 0.5 + Math.random() * 0.3 });
  player.skillAnim = { kind: "teleport", t: 0, x0, y0, x1: bx, y1: by, dx, dy };
  player.mineInvulnUntil = Math.max(player.mineInvulnUntil || 0, now + 0.6);
  return true;
}

/* ---------------- running the skill animations (instead of updatePlayer) ---------------- */
function tickSkillAnim(dt) {
  const A = player.skillAnim;
  A.t += dt;
  if (A.kind === "stun") {
    const t = A.t;
    const [fr, z] = stunPose(t);
    player.action = "hit"; player.frame = fr; player.frameTimer = 0;
    player.jumpZ = z;
    if (t < STUN_T.jump) { const p = t / STUN_T.jump; player.x = A.x0 + (A.x1 - A.x0) * p; player.y = A.y0 + (A.y1 - A.y0) * p; }
    else { player.x = A.x1; player.y = A.y1; }
    if (t >= STUN_T.jump + 0.05 && !A.done.impact) { A.done.impact = true; stunImpact(A); }
    if (t >= STUN_T.hold && !A.done.pull) { // the blade comes out: earth thrown up
      A.done.pull = true;
      const now = skillNow();
      for (let i = 0; i < 12; i++) skillFx.push({ kind: "mote", x: A.ix + (Math.random() - 0.5) * 4, y: A.iy, c: i % 3 ? "#8a6a48" : "#cdb38a", vx: (Math.random() - 0.5) * 50, vy: -40 - Math.random() * 40, g: 160, t0: now, life: 0.5 });
    }
    if (t >= STUN_T.end) {
      player.skillAnim = null; player.jumpZ = 0; player.action = null; player.frame = 0;
      if (mobAlive(A.m, A.st)) player.autoTarget = A.m; // keep at it
    }
    return;
  }
  if (A.kind === "teleport") {
    if (A.t >= TP_T.swap && !A.swapped) {
      A.swapped = true;
      player.x = A.x1; player.y = A.y1;
      // in: motes gather from all round into your shape
      const now = skillNow();
      for (const p of playerPixels(A.x1, A.y1, 90)) {
        const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 18;
        skillFx.push({ kind: "gather", x: p.x, y: p.y, sx: p.x + Math.cos(a) * r, sy: p.y + Math.sin(a) * r - 6, c: p.c, t0: now, life: TP_T.form - TP_T.swap });
      }
      skillFx.push({ kind: "puff", x: A.x1, y: A.y1, t0: now, arrive: true });
    }
    if (A.t >= TP_T.form) player.skillAnim = null;
  }
}
{
  const base = updatePlayer;
  updatePlayer = function (dt) {
    if (player.skillAnim) {
      tickSkillAnim(dt);
      // mobs keep going meanwhile
      const z = mobZoneState();
      if (z && player.skillAnim && player.skillAnim.kind === "stun" || z && !player.skillAnim) {
        const keep = player.autoTarget; player.autoTarget = null; harvestRequested = false;
        try { mineIndoorUpdate(dt); } catch (e) { /* ignore */ }
        if (!player.autoTarget) player.autoTarget = keep;
      }
      return;
    }
    return base.apply(this, arguments);
  };
}
// hidden while dissolved
function playerHiddenByTeleport() {
  const A = player.skillAnim;
  return !!(A && A.kind === "teleport" && A.t >= TP_T.vanish * 0.6 && A.t < TP_T.form - 0.04);
}
// the sword during Stun, both hands, point down
function stunSwordArt() {
  const t = player.equippedWeapon, d = t && itemDefs[t];
  if (!d || !d.weapon || d.weapon.ranged || !/Sword|Cleaver|Reaver/.test(t)) return null;
  const strip = !d.bossDrop && d.animStrip && assets[d.animStrip] && assets[d.animStrip].width ? assets[d.animStrip] : d.icon;
  if (!strip || !strip.width) return null;
  const S = strip.height, big = S >= 32;
  const grip = big ? HOLD_GRIP : [S * 0.16, S * 0.84], tip = big ? [35, 5] : [S * 0.88, S * 0.12];
  return { strip, S, grip, artLen: Math.hypot(tip[0] - grip[0], grip[1] - tip[1]), len: big ? 24 : 18 };
}
function drawStunSword(screenX, screenY, z) {
  const A = player.skillAnim, art = stunSwordArt();
  if (!A || A.kind !== "stun" || !art) return;
  const t = A.t, k = (DRAW_SIZE / 64) * z, flip = player.facing === "left";
  const face = flip ? "right" : FACE_VEC[player.facing] ? player.facing : "down";
  const front = { right: [9, 0], down: [0, 5], up: [0, -6] }[face];
  const groundY = screenY + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE * z + front[1] * k + 2 * k; // where the point meets the ground
  let gripY; // the grip's height above the ground, screen px
  const L = art.len * z;
  if (t < STUN_T.jump) gripY = L * 0.72 + 4 * k;                              // held point-down in both hands through the leap
  else if (t < STUN_T.slam) { const p = (t - STUN_T.jump) / (STUN_T.slam - STUN_T.jump); gripY = L * 0.72 + 4 * k - (L * 0.17 + 4 * k) * p * p; } // driven down
  else if (t < STUN_T.hold) gripY = L * 0.55;                                   // stuck in the earth
  else if (t < STUN_T.pull) { const p = (t - STUN_T.hold) / (STUN_T.pull - STUN_T.hold), e = 1 - Math.pow(1 - p, 3); gripY = L * 0.55 + (L * 0.7 + 18 * k) * e; } // wrenched out
  else gripY = L * 1.25 + 18 * k;
  const gx = screenX + (flip ? -front[0] : front[0]) * k, gy = groundY - gripY - (player.jumpZ || 0) * zoom;
  const s = L / art.artLen, fr = Math.floor(performance.now() / 90) % Math.max(1, Math.round(art.strip.width / art.S));
  ctx.save();
  // only what's above the ground shows while it's in the earth
  if (t >= STUN_T.jump && t < STUN_T.pull) { ctx.beginPath(); ctx.rect(gx - 60 * k, gy - 80 * k, 120 * k, groundY - (gy - 80 * k)); ctx.clip(); }
  ctx.translate(gx, gy);
  if (flip) ctx.scale(-1, 1);
  ctx.save(); ctx.rotate(Math.PI / 2 + Math.PI / 4); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art.strip, fr * art.S, 0, art.S, art.S, -art.grip[0] * s, -art.grip[1] * s, art.S * s, art.S * s);
  ctx.restore();
  if (player.facing !== "up" && typeof drawGripHands === "function") { ctx.save(); ctx.rotate(Math.PI / 2); drawGripHands(k, 2); ctx.restore(); }
  ctx.restore();
  // a glow round the blade where it's buried
  if (t >= STUN_T.slam && t < STUN_T.pull) {
    ctx.save(); ctx.globalAlpha = 0.5 * (1 - (t - STUN_T.slam) / (STUN_T.pull - STUN_T.slam));
    const g = ctx.createRadialGradient(gx, groundY, 0, gx, groundY, 9 * zoom);
    g.addColorStop(0, "rgba(255,236,140,0.9)"); g.addColorStop(1, "rgba(255,236,140,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(gx, groundY, 9 * zoom, 4 * zoom, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}
{
  const base = drawPlayer;
  drawPlayer = function (screenX, screenY, z) {
    if (playerHiddenByTeleport()) return;
    const A = player.skillAnim, jz = (player.jumpZ || 0) * zoom;
    if (A && A.kind === "stun") {
      // the shadow stays on the ground under the leap
      if (jz > 0) { ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(screenX, screenY + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE * z, 7 * zoom * (1 - jz / (40 * zoom)), 2.4 * zoom, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      if (player.facing === "up") drawStunSword(screenX, screenY, z);
      const r = base.call(this, screenX, screenY - jz, z);
      if (player.facing !== "up") drawStunSword(screenX, screenY, z);
      return r;
    }
    return base.apply(this, arguments);
  };
  const relBase = drawPlayerNightRelight;
  drawPlayerNightRelight = function () {
    if (playerHiddenByTeleport()) return;
    if (player.jumpZ) { const y = player.y; player.y -= player.jumpZ; try { return relBase.apply(this, arguments); } finally { player.y = y; } }
    return relBase.apply(this, arguments);
  };
}
window.addEventListener("keydown", (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  const k = e.key.toLowerCase();
  for (const [id, S] of Object.entries(SKILLS)) if (S.key === k) { requestSkill(id); return; }
  if (k === "k") toggleSkillWindow();
});

/* ---------------- stun: frozen mobs + stars ---------------- */
{
  const base = updateMob;
  updateMob = function (room, st, m, dt) {
    if (m.stunUntil && m.stunUntil > skillNow() && m.state !== "dead") {
      if (m.kx || m.ky) {
        const nx = m.x + m.kx * dt, ny = m.y + m.ky * dt;
        if (!mineFeetBlocked(room, nx, m.y)) m.x = nx;
        if (!mineFeetBlocked(room, m.x, ny)) m.y = ny;
        m.kx *= Math.pow(0.02, dt); m.ky *= Math.pow(0.02, dt);
        if (Math.abs(m.kx) + Math.abs(m.ky) < 2) { m.kx = 0; m.ky = 0; }
      }
      if (m.anim !== "idle") { m.state = "idle"; setMobAnim(m, "idle"); }
      m.goal = null; m.atkCd = Math.max(m.atkCd || 0, 0.6);
      m.flash = Math.max(0, (m.flash || 0) - dt);
      const fps = (m.def.fps && m.def.fps.idle) || 5, n = mobFrameCount(m, "idle");
      m.ft += dt * 0.4; // a slow, dazed idle
      while (m.ft >= 1 / fps) { m.ft -= 1 / fps; m.frame = (m.frame + 1) % n; }
      return;
    }
    return base.apply(this, arguments);
  };
  const drawBase = drawMob;
  drawMob = function (m) {
    const sel = player.selectedMob === m && player.autoTarget !== m && m.state !== "dead" && !m.gone;
    // phone: the mob the ATTACK button / a skill picked is highlighted the whole time (outline + arrow)
    const mobTgt = isMobileMode() && m.state !== "dead" && !m.gone && !sel &&
      (player.autoTarget === m || (skillPending && skillPending.m === m));
    if (sel || mobTgt) drawSelectRing(m);
    const hov = player.hoverMob;
    if (sel || mobTgt) player.hoverMob = m; // the selected mob keeps its outline
    // stunned: it sways, dazed
    const stunned = m.stunUntil && m.stunUntil > skillNow() && m.state !== "dead" && !m.gone;
    const wob = stunned ? Math.sin(skillNow() * 11) * 0.9 : 0;
    m.x += wob;
    let r;
    try { r = drawBase.apply(this, arguments); } finally { m.x -= wob; }
    player.hoverMob = hov;
    if (m.stunUntil && m.stunUntil > skillNow() && m.state !== "dead" && !m.gone) drawStunStars(m);
    if (sel) drawSelectMarker(m);
    else if (mobTgt) drawSelectMarker(m, "");
    return r;
  };
}
// The selected (first-clicked) mob: a pulsing gold ring, a bouncing arrow and its name / level / HP.
function drawSelectRing(m) {
  const t = skillNow(), px = (m.x - camX) * zoom, py = (m.y - camY) * zoom, r = m.def.r * zoom * (1.15 + 0.08 * Math.sin(t * 6));
  ctx.save();
  ctx.strokeStyle = "rgba(255,216,74,0.95)"; ctx.lineWidth = Math.max(1.5, zoom * 0.7);
  ctx.setLineDash([4 * zoom, 2.5 * zoom]); ctx.lineDashOffset = -t * 12 * zoom;
  ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
function drawSelectMarker(m, hintText) {
  const t = skillNow(), top = typeof mobTopY === "function" ? mobTopY(m) : m.y - 20;
  const px = (m.x - camX) * zoom, py = (top - 9 - camY) * zoom - Math.abs(Math.sin(t * 5)) * 2 * zoom;
  ctx.save();
  ctx.fillStyle = "#ffd84a"; ctx.strokeStyle = "#3a2600"; ctx.lineWidth = Math.max(1, zoom * 0.4);
  ctx.beginPath(); ctx.moveTo(px - 2.6 * zoom, py - 3 * zoom); ctx.lineTo(px + 2.6 * zoom, py - 3 * zoom); ctx.lineTo(px, py); ctx.closePath(); ctx.fill(); ctx.stroke();
  const fs = Math.max(9, Math.round(3.8 * zoom));
  ctx.font = "bold " + fs + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  const label = "Lv " + m.level + " " + m.def.name, hint = hintText === undefined ? "Click again to attack" : hintText;
  ctx.lineWidth = Math.max(2, fs / 4); ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.strokeText(label, px, py - 4 * zoom); ctx.fillStyle = "#ffe6a8"; ctx.fillText(label, px, py - 4 * zoom);
  if (hint) {
    ctx.font = Math.max(8, Math.round(3 * zoom)) + "px sans-serif";
    ctx.strokeText(hint, px, py - 4 * zoom - fs); ctx.fillStyle = "#cfe6ff"; ctx.fillText(hint, px, py - 4 * zoom - fs);
  }
  ctx.restore();
}
// a selection that died or was left behind is cleared
setInterval(() => {
  const m = player.selectedMob;
  if (!m) return;
  const z = mobZoneState();
  if (!z || m.state === "dead" || m.gone || !z.st.mobs.includes(m)) player.selectedMob = null;
}, 300);
function drawStar(g, x, y, r, rot, fill) {
  g.save(); g.translate(x, y); g.rotate(rot); g.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = Math.max(1, r * 0.25); g.strokeStyle = "rgba(90,60,0,0.9)"; g.stroke(); g.restore();
}
function drawStunStars(m) {
  const t = skillNow();
  const top = typeof mobTopY === "function" ? mobTopY(m) : m.y - 20;
  const cx = (m.x - camX) * zoom, cy = (top - 3 - camY) * zoom;
  const rx = Math.max(6, m.def.r * 0.95) * zoom, ry = rx * 0.36;
  const left = Math.max(0, m.stunUntil - t);
  ctx.save();
  // a spinning daze swirl
  ctx.strokeStyle = "rgba(255,244,176,0.75)"; ctx.lineWidth = Math.max(1, 0.55 * zoom);
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) { const a = t * 6 + i / 28 * Math.PI * 3.2, rr = rx * (0.25 + 0.75 * i / 28); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.36); }
  ctx.stroke();
  // four stars and a little bird going round
  for (let i = 0; i < 4; i++) {
    const a = t * 4.2 + i / 4 * Math.PI * 2;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry - Math.abs(Math.sin(t * 8 + i)) * zoom;
    const behind = Math.sin(a) < 0;
    ctx.globalAlpha = behind ? 0.5 : 1;
    drawStar(ctx, x, y, (behind ? 1.7 : 2.5) * zoom, t * 4 + i, i % 2 ? "#ffffff" : "#ffd84a");
  }
  // a tiny timer bar under it
  ctx.globalAlpha = 0.9;
  const w = 12 * zoom, frac = Math.min(1, left / 3);
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(cx - w / 2, cy - 5 * zoom, w, 1.4 * zoom);
  ctx.fillStyle = "#ffd84a"; ctx.fillRect(cx - w / 2, cy - 5 * zoom, w * frac, 1.4 * zoom);
  ctx.restore();
}
/* ---------------- skill effects ---------------- */
function drawSkillFx() {
  const now = skillNow();
  for (let i = skillFx.length - 1; i >= 0; i--) {
    const f = skillFx[i];
    const life = f.life || { wave: 0.45, bolt: 0.16, stunburst: 0.5, ghost: 0.45, puff: 0.4, quake: 0.7 }[f.kind] || 0.4;
    const k = (now - f.t0) / life;
    if (k >= 1) { skillFx.splice(i, 1); continue; }
    if (k < 0) continue;
    ctx.save();
    if (f.kind === "wave") {
      // a big crescent rushing forward
      // Per request ("yung animation nun is medyo dagdagan pa ng opacity to 100%"): fully opaque,
      // only fading out at the very end; it travels the skill's whole reach and is a bit bigger.
      const reach = f.range || 4.5 * TILE;
      const dist = 6 + k * (reach - 6), ang = Math.atan2(f.dy, f.dx);
      const x = (f.x + f.dx * dist - camX) * zoom, y = (f.y + f.dy * dist - camY) * zoom;
      const R = (18 + k * 14) * zoom;
      const [cr, cg, cb] = typeof swordTrailColor === "function" ? swordTrailColor() : [220, 235, 255];
      ctx.translate(x, y); ctx.rotate(ang);
      ctx.globalAlpha = k < 0.75 ? 1 : Math.max(0, (1 - k) / 0.25);
      const g = ctx.createRadialGradient(-R * 0.6, 0, R * 0.2, -R * 0.6, 0, R * 1.2);
      g.addColorStop(0, "rgba(" + cr + "," + cg + "," + cb + ",0.35)"); g.addColorStop(0.55, "rgba(" + cr + "," + cg + "," + cb + ",1)"); g.addColorStop(1, "rgba(255,255,255,1)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(-R * 0.6, 0, R, -1.25, 1.25); ctx.arc(-R * 0.95, 0, R * 0.92, 1.15, -1.15, true); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,1)"; ctx.lineWidth = Math.max(1.5, zoom * 1.1);
      ctx.beginPath(); ctx.arc(-R * 0.6, 0, R, -1.15, 1.15); ctx.stroke();
    } else if (f.kind === "bolt") {
      const tx = f.m.x, ty = (typeof mobTopY === "function" ? (mobTopY(f.m) + f.m.y) / 2 : f.m.y - 8);
      const e = Math.min(1, k * 1.4);
      let x = f.x0, y = f.y0;
      const ex = f.x0 + (tx - f.x0) * e, ey = f.y0 + (ty - f.y0) * e;
      ctx.strokeStyle = "#fff6a0"; ctx.lineWidth = Math.max(1.5, zoom * 1.1); ctx.shadowColor = "#ffd84a"; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo((x - camX) * zoom, (y - camY) * zoom);
      for (let s = 1; s <= 6; s++) {
        const p = s / 6; x = f.x0 + (ex - f.x0) * p + (s < 6 ? (Math.random() - 0.5) * 6 : 0); y = f.y0 + (ey - f.y0) * p + (s < 6 ? (Math.random() - 0.5) * 6 : 0);
        ctx.lineTo((x - camX) * zoom, (y - camY) * zoom);
      }
      ctx.stroke();
    } else if (f.kind === "mote") { // a speck flying off and fading (teleport out, earth from the stun)
      const tt = now - f.t0, g = f.g || -10;
      const x = f.x + f.vx * tt, y = f.y + f.vy * tt + 0.5 * g * tt * tt * (f.g ? 1 : -1);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = k < 0.35 ? f.c : (f.g ? f.c : "#bfe8ff");
      const sz = Math.max(1, (f.g ? 1.4 : 1.1) * zoom * (1 - k * 0.5));
      ctx.fillRect((x - camX) * zoom - sz / 2, (y - camY) * zoom - sz / 2, sz, sz);
      if (!f.g && k > 0.2) { ctx.globalAlpha = (1 - k) * 0.5; ctx.fillStyle = "#e6f6ff"; ctx.fillRect((x - camX) * zoom - sz, (y - camY) * zoom - sz, sz * 2, sz * 2); }
    } else if (f.kind === "gather") { // specks closing in to form you at the far end
      const e = k * k * (3 - 2 * k), x = f.sx + (f.x - f.sx) * e, y = f.sy + (f.y - f.sy) * e;
      ctx.globalAlpha = 0.4 + 0.6 * k;
      ctx.fillStyle = k > 0.6 ? f.c : "#bfe8ff";
      const sz = Math.max(1, 1.1 * zoom);
      ctx.fillRect((x - camX) * zoom - sz / 2, (y - camY) * zoom - sz / 2, sz, sz);
    } else if (f.kind === "quake") {
      const cx = (f.x - camX) * zoom, cy = (f.y - camY) * zoom, Rs = f.R * zoom;
      // the shockwave ring, flattened onto the ground
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = "#fff2a8"; ctx.lineWidth = Math.max(1.5, (1 - k) * 3 * zoom);
      ctx.beginPath(); ctx.ellipse(cx, cy, Rs * (0.2 + 0.8 * Math.min(1, k * 1.6)), Rs * 0.5 * (0.2 + 0.8 * Math.min(1, k * 1.6)), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.35;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rs);
      g.addColorStop(0, "rgba(255,230,120,0.8)"); g.addColorStop(1, "rgba(255,230,120,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, Rs, Rs * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      // cracks running out from the blade
      let seed = Math.floor(f.seed);
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      ctx.globalAlpha = Math.min(1, (1 - k) * 1.6);
      ctx.strokeStyle = "#2a1a10"; ctx.lineWidth = Math.max(1, 0.9 * zoom);
      for (let c = 0; c < 7; c++) {
        let a = c / 7 * Math.PI * 2 + rnd() * 0.5, x = cx, y = cy;
        const len = Rs * (0.45 + rnd() * 0.4) * Math.min(1, k * 3);
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let sgm = 0; sgm < 4; sgm++) { a += (rnd() - 0.5) * 0.8; x += Math.cos(a) * len / 4; y += Math.sin(a) * len / 4 * 0.5; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      // dust and stones thrown up
      for (let p = 0; p < 14; p++) {
        const a = p / 14 * Math.PI * 2 + f.seed, d = (4 + 22 * k) * zoom * (0.6 + (p % 3) * 0.25);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = p % 2 ? "#cdb38a" : "#8a6a48";
        const sz = (1.6 - k) * zoom;
        ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.5 - Math.sin(k * Math.PI) * 8 * zoom * ((p % 4) / 3), sz, sz);
      }
    } else if (f.kind === "stunburst") {
      const top = typeof mobTopY === "function" ? mobTopY(f.m) : f.m.y - 20;
      const cx = (f.m.x - camX) * zoom, cy = (top - 2 - camY) * zoom;
      for (let s = 0; s < 6; s++) {
        const a = s / 6 * Math.PI * 2, d = (3 + 12 * k) * zoom;
        ctx.globalAlpha = 1 - k;
        drawStar(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 2 * zoom * (1 - k * 0.5), a + k * 4, "#ffd84a");
      }
    } else if (f.kind === "ghost") {
      // the afterimage left where you were
      const size = DRAW_SIZE * zoom, sx = f.frame * FRAME_SIZE;
      if (f.sheet && f.sheet.width) {
        const c = skillGhostCanvas(f.sheet, sx, f.facing === "left");
        ctx.globalAlpha = 0.55 * (1 - k);
        ctx.drawImage(c, (f.x - camX) * zoom - size / 2, (f.y - camY) * zoom - size / 2 - k * 4 * zoom, size, size);
      }
    } else if (f.kind === "puff") {
      const cx = (f.x - camX) * zoom, cy = (f.y + 4 - camY) * zoom;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.arrive ? "#c6a8ff" : "#8fe8ff"; ctx.lineWidth = Math.max(1, (1 - k) * 1.5 * zoom);
      ctx.beginPath(); ctx.ellipse(cx, cy + 4 * zoom, (4 + 12 * k) * zoom, (2 + 5 * k) * zoom, 0, 0, Math.PI * 2); ctx.stroke();
      for (let s = 0; s < 10; s++) {
        const a = s / 10 * Math.PI * 2 + s, d = (2 + 10 * k) * zoom;
        ctx.fillStyle = s % 2 ? "#e9e0ff" : (f.arrive ? "#a77bff" : "#5fd8ff");
        ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6 - k * 10 * zoom * ((s % 3) / 2), 1.2 * zoom, 1.2 * zoom);
      }
    }
    ctx.restore();
  }
}
const skillGhostCache = new Map();
function skillGhostCanvas(sheet, sx, flip) {
  const key = sheet.src + "#" + sx + (flip ? "f" : "");
  let c = skillGhostCache.get(key);
  if (c) return c;
  c = document.createElement("canvas"); c.width = FRAME_SIZE; c.height = FRAME_SIZE;
  const g = c.getContext("2d");
  if (flip) { g.translate(FRAME_SIZE, 0); g.scale(-1, 1); }
  g.drawImage(sheet, sx, 0, FRAME_SIZE, FRAME_SIZE, 0, 0, FRAME_SIZE, FRAME_SIZE);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-in"; g.fillStyle = "rgba(140,200,255,1)"; g.fillRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  if (skillGhostCache.size > 60) skillGhostCache.clear();
  skillGhostCache.set(key, c);
  return c;
}
{
  const base = drawSceneFadeOverlay;
  drawSceneFadeOverlay = function () {
    try { drawSkillFx(); } catch (e) { /* ignore */ }
    return base.apply(this, arguments);
  };
}

/* ---------------- icons ---------------- */
function skillIcon(id) {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d");
  g.lineCap = "round";
  if (id === "slash") {
    g.strokeStyle = "#7fb8ff"; g.lineWidth = 6; g.beginPath(); g.arc(10, 16, 14, -1.1, 1.1); g.stroke();
    g.strokeStyle = "#ffffff"; g.lineWidth = 2.5; g.beginPath(); g.arc(10, 16, 14, -1.0, 1.0); g.stroke();
  } else if (id === "stun") {
    drawStar(g, 16, 16, 12, 0, "#ffd84a");
    g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.moveTo(17, 7); g.lineTo(13, 16); g.lineTo(19, 16); g.lineTo(15, 25); g.stroke();
  } else if (id === "teleport") {
    g.strokeStyle = "#b48cff"; g.lineWidth = 3;
    g.beginPath(); for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 4, r = 2 + i * 0.3; g.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r); } g.stroke();
    g.fillStyle = "#e0f6ff"; for (const [x, y] of [[5, 6], [27, 9], [25, 26], [7, 25]]) g.fillRect(x, y, 3, 3);
  } else if (id === "atk") {
    g.strokeStyle = "#ff7d6a"; g.lineWidth = 4; g.beginPath(); g.moveTo(7, 25); g.lineTo(25, 7); g.stroke();
    g.strokeStyle = "#ffd84a"; g.lineWidth = 3; g.beginPath(); g.moveTo(6, 18); g.lineTo(14, 26); g.stroke();
  } else if (id === "aspd") {
    g.strokeStyle = "#7dffa8"; g.lineWidth = 3.5;
    for (const x of [8, 17]) { g.beginPath(); g.moveTo(x, 7); g.lineTo(x + 8, 16); g.lineTo(x, 25); g.stroke(); }
  } else if (id === "def") {
    g.fillStyle = "#6ab4ff"; g.beginPath(); g.moveTo(16, 4); g.lineTo(27, 8); g.lineTo(25, 20); g.lineTo(16, 28); g.lineTo(7, 20); g.lineTo(5, 8); g.closePath(); g.fill();
    g.strokeStyle = "#e8f4ff"; g.lineWidth = 2; g.stroke();
  }
  return c.toDataURL();
}

/* ---------------- the skill bar + window ---------------- */
let skillBarEl = null, skillWinEl = null;
function buildSkillBar() {
  skillBarEl = document.createElement("div");
  skillBarEl.id = "skill-bar";
  for (const [id, S] of Object.entries(SKILLS)) {
    const b = document.createElement("button");
    b.className = "skill-btn"; b.dataset.skill = id;
    b.title = S.name + " (" + S.key.toUpperCase() + ")";
    b.innerHTML = '<img src="' + skillIcon(id) + '"><span class="cd"></span><span class="key">' + S.key.toUpperCase() + '</span><span class="st">' + S.stamina + "</span>";
    b.addEventListener("click", (e) => { e.stopPropagation(); requestSkill(id); });
    skillBarEl.appendChild(b);
  }
  const more = document.createElement("button");
  more.className = "skill-btn skill-more"; more.title = "Skills & passives (K)";
  more.innerHTML = '✦<span class="pts"></span>';
  more.addEventListener("click", (e) => { e.stopPropagation(); toggleSkillWindow(); });
  skillBarEl.appendChild(more);
  document.body.appendChild(skillBarEl);
  const tick = () => {
    const now = skillNow();
    for (const b of skillBarEl.querySelectorAll(".skill-btn[data-skill]")) {
      const id = b.dataset.skill, S = SKILLS[id], left = Math.max(0, (skillReadyAt[id] || 0) - now), cdNow = skillCd(id);
      const cd = b.querySelector(".cd");
      if (left > 0) { const p = Math.min(1, left / cdNow) * 360; cd.style.background = "conic-gradient(rgba(0,0,0,0.65) " + p + "deg, transparent " + p + "deg)"; cd.textContent = Math.ceil(left); }
      else { cd.style.background = "transparent"; cd.textContent = ""; }
      b.classList.toggle("nost", (player.stamina || 0) < S.stamina);
      b.classList.toggle("nozone", S.mobsOnly && !mobZoneState());
    }
    const pts = skillPointsLeft();
    const pe = skillBarEl.querySelector(".pts");
    if (pe) pe.textContent = pts > 0 ? pts : "";
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function toggleSkillWindow(show) {
  if (!skillWinEl) {
    skillWinEl = document.createElement("div");
    skillWinEl.id = "skill-overlay"; skillWinEl.className = "hidden";
    skillWinEl.innerHTML = '<div id="skill-panel"><div class="sk-title">✦ Skills <span class="hint">(K / click outside to close)</span></div><div id="sk-body"></div></div>';
    document.body.appendChild(skillWinEl);
    skillWinEl.addEventListener("click", (e) => { if (e.target === skillWinEl) toggleSkillWindow(false); });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") toggleSkillWindow(false); });
  }
  const open = show === undefined ? skillWinEl.classList.contains("hidden") : show;
  skillWinEl.classList.toggle("hidden", !open);
  if (open) renderSkillWindow();
}
function renderSkillWindow() {
  const body = skillWinEl.querySelector("#sk-body"), r = passiveRanks(), pts = skillPointsLeft();
  const sl = skillLevels();
  let h = '<div class="sk-col"><div class="sk-sec">Active <span class="pts">Skill points: ' + pts + '</span> <span class="hint">(1 per level)</span></div>';
  for (const [id, S] of Object.entries(SKILLS)) {
    const L = sl[id];
    let pips = "";
    for (let i = 0; i < SKILL_MAX; i++) pips += '<i class="' + (i < L ? "on" : "") + '"></i>';
    h += '<div class="sk-row"><img src="' + skillIcon(id) + '"><div class="sk-txt"><b>' + S.name + " Lv " + L + "/" + SKILL_MAX + ' <span class="k">[' + S.key.toUpperCase() + "]</span></b><br>" + skillDesc(id, L) +
      (L < SKILL_MAX ? '<div class="sk-next">Lv ' + (L + 1) + ": " + skillDesc(id, L + 1) + "</div>" : "") +
      '<div class="sk-meta">⏱ ' + skillStats(id, L).cd + "s · ⚡ " + S.stamina + " stamina" + (S.mobsOnly ? " · mobs only" : "") + '</div><div class="pips">' + pips + "</div></div>" +
      '<button class="sk-plus" data-s="' + id + '"' + (pts > 0 && L < SKILL_MAX ? "" : " disabled") + ">+</button></div>";
  }
  h += '</div><div class="sk-col"><div class="sk-sec">Passive</div>';
  for (const [id, P] of Object.entries(PASSIVES)) {
    let pips = "";
    for (let i = 0; i < PASSIVE_MAX; i++) pips += '<i class="' + (i < r[id] ? "on" : "") + '"></i>';
    h += '<div class="sk-row"><img src="' + skillIcon(id) + '"><div class="sk-txt"><b>' + P.name + " " + r[id] + "/" + PASSIVE_MAX + "</b> — " + P.per + " per rank<br>" + P.desc +
      '<div class="pips">' + pips + "</div></div><button class=\"sk-plus\" data-p=\"" + id + "\"" + (pts > 0 && r[id] < PASSIVE_MAX ? "" : " disabled") + ">+</button></div>";
  }
  body.innerHTML = h + "</div>";
  body.querySelectorAll(".sk-plus[data-s]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.s, L = skillLevels();
    if (skillPointsLeft() <= 0 || L[id] >= SKILL_MAX) return;
    L[id]++; player.skillLv = L;
    if (typeof saveGame === "function") saveGame();
    renderSkillWindow();
  }));
  body.querySelectorAll(".sk-plus[data-p]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.p, rr = passiveRanks();
    if (skillPointsLeft() <= 0 || rr[id] >= PASSIVE_MAX) return;
    rr[id]++; player.passives = rr;
    if (typeof saveGame === "function") saveGame();
    if (typeof renderProfile === "function") try { renderProfile(); } catch (e) { /* closed */ }
    renderSkillWindow();
  }));
}
buildSkillBar();
