"use strict";

/* =================================================================
   TAVERN CUSTOMERS — per request: a batch of stand-in NPCs (for now
   drawn with the player's own sprites) who, on weekdays while Maria's
   tavern is open, keep coming from around the map to eat:

     away          -> not in the world at all, waiting for their next visit
     toTavern      -> walking from somewhere out on the map to the tavern door
     toCounter     -> inside, walking up to Maria's counter
     queued        -> at the counter, waiting their turn (no bubble yet)
     ordering      -> their turn: order bubble showing (5 s) — only ONE
                      customer orders at a time; the next in line starts
                      once this one's done
     waitSeat      -> no free table seat yet — waits a bit, then gives up
     toSeat        -> walking to a free chair that has a table in front of it
     eating        -> sitting; the food on the table plays full -> empty
                      over 40-50 s
     toExit        -> walking back out to the main door
     leaveOutside  -> out of the door and walking away across the map
                      -> away again, until the next visit

   WHEN they come is a daily plan on the GAME clock (buildCustomerDay()
   below), per request ("ontime yung pag punta... minsan konti lang...
   minsan malakas... sa monday at friday"):
     - every weekday gets its own list of arrival times; Monday and
       Friday are usually busy, the other days are random — sometimes
       quiet, sometimes normal, sometimes busy — with a small lunch rush
     - each customer sets off early enough to reach the door AT their
       time, whether or not the player is anywhere near the tavern
     - the last arrival is early enough that the whole visit is over
       before closing (a 40-50 s meal is over an hour of game time), and
       anyone still inside just before closing stands up and leaves —
       so nobody is left sitting in a closed tavern
   A visit whose time has already passed (the tab was in the background,
   or the game was opened mid-day) is simply skipped rather than
   everyone piling in at once to catch up.

   Swapping in real NPC art later: every customer's look comes from
   customerSprites() below — point it at other sheets (walk down/up/
   side, idle down/up/side, sit front/side, same 64x64-frame layout as
   the player's) and nothing else needs to change.

   Customers don't collide with the player or each other (same as
   Maria), but they walk around everything solid via the same A*
   pathfinding Maria uses (findNpcTilePath(), js/npc.js).
================================================================= */

const CUSTOMER_COUNT = 20;
const CUSTOMER_ORDER_SECONDS = 5;                 // order bubble on screen
const CUSTOMER_EAT_MIN = 40, CUSTOMER_EAT_MAX = 50; // seconds eating
const CUSTOMER_WAIT_SEAT_SECONDS = 25;            // give up waiting for a seat after this
// Rough length of a whole visit in REAL seconds (walk in, queue, order,
// find a seat, eat, walk out) — used to stop new arrivals early enough
// that everyone's done before closing.
const CUSTOMER_VISIT_REAL_SECONDS = 100;
const CUSTOMER_CLOSING_WRAPUP_HOURS = 0.15; // this long before closing, anyone still inside gets up and leaves
const CUSTOMER_LATE_SKIP_HOURS = 0.3;       // a planned arrival this late (tab was hidden, etc.) is skipped
// How many visits a day brings, by how busy it is.
const CUSTOMER_DAY_VISITS = { quiet: [4, 8], normal: [10, 16], busy: [20, 30] };
const CUSTOMER_SPEED_MIN = 38, CUSTOMER_SPEED_MAX = 52;     // world px/s (Maria walks 45)
const CUSTOMER_SPAWN_MIN_TILES = 18, CUSTOMER_SPAWN_MAX_TILES = 30; // how far out on the map they come from
const CUSTOMER_LAST_ORDER_HOURS = 0.5;            // no new arrivals in the last half hour of the shift
const CUSTOMER_BUBBLE_SCALE = 0.8;                // order bubble size relative to its art
const CUSTOMER_LOWER_ROOM_MIN_ROW = 18;           // they stay downstairs — Maria's bedroom is off limits

// What can be ordered: the item, its full->empty strip (16x16 frames)
// and its order bubble.
const CUSTOMER_MENU = [
  { type: "meatItem", strip: assets.stripGrilledMeat, bubble: assets.orderGrilledMeat },
  { type: "foodSalad", strip: assets.stripSalad, bubble: assets.orderSalad },
  { type: "foodBeer", strip: assets.stripBeer, bubble: assets.orderBeer },
];

// Per request ("palitan mo yung ibang customer ng npc"): every other
// customer comes in looking like one of the townsfolk (Citizen B-E) instead
// of the player's placeholder look.
// Now every customer is one of the townsfolk — the player's own look is
// the player's (sample outfit #2), so the old placeholder customers became
// the new F and G (outfits #1 and #3).
const CUSTOMER_NPC_LOOKS = ["B", "C", "D", "E", "F", "G", "I", "J", "K", "L", "M", "N", "O", "P", "Q"];
function customerLookFor(i) {
  return CUSTOMER_NPC_LOOKS[i % CUSTOMER_NPC_LOOKS.length];
}

// The look. Player-look customers use the player's own sheets (down/up/side).
// NPC-look customers only have SIDE art (right-facing, flipped for left like
// the player's), so `sideOnly`: walking up/down keeps their last side
// facing, and they only take seats that face left or right (freeSeatFor()).
function customerSprites(c) {
  if (c.look) {
    const L = "citizen" + c.look;
    // B..E only have side art; F..K have front/back too.
    const full = !!(assets[L + "WalkDown"] && assets[L + "WalkDown"].width);
    const walkS = assets[L + "WalkRight"], idleS = assets[L + "IdleRight"], sitS = assets[L + "SitRight"];
    return {
      sideOnly: !full,
      walk: { down: full ? assets[L + "WalkDown"] : walkS, up: full ? assets[L + "WalkUp"] : walkS, side: walkS },
      idle: { down: full ? assets[L + "IdleDown"] : idleS, up: full ? assets[L + "IdleUp"] : idleS, side: idleS },
      sit: { front: full ? assets[L + "SitFront"] : sitS, side: sitS },
    };
  }
  return {
    walk: { down: assets.walkDown, up: assets.walkUp, side: assets.walkSide },
    idle: { down: assets.idleDown, up: assets.idleUp, side: assets.idleSide },
    sit: { front: assets.sitFront, side: assets.sitSide },
  };
}

// What a seated customer holds while eating each dish (see drawCustomer()).
const CUSTOMER_EAT_HELD = { meatItem: "Meat", foodSalad: "Spoon", foodBeer: "Mug" };
function customerEatSheets(orderType, look) {
  const what = CUSTOMER_EAT_HELD[orderType];
  if (!what) return null;
  if (look) return { front: assets["citizen" + look + "EatFront" + what], side: assets["citizen" + look + "EatSide" + what] };
  return { front: assets["sitEatFront" + what], side: assets["sitEatSide" + what] };
}

const customers = [];
let customerQueueTicket = 0; // increasing number handed out on reaching the counter — first come, first served
const rand = (a, b) => a + Math.random() * (b - a);

function initCustomers() {
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    customers.push({
      id: i,
      look: customerLookFor(i), // null = the player's look, else a citizen's ("B".."E")
      side: "right",            // last left/right facing — what side-only looks show when walking up/down
      scene: "away", state: "away",
      fx: 0, fy: 0,           // FEET position — world px outside, room px inside
      facing: "down", anim: "idle", frame: 0, frameTimer: 0,
      speed: rand(CUSTOMER_SPEED_MIN, CUSTOMER_SPEED_MAX),
      path: null, pathIdx: 0, goalX: 0, goalY: 0, replanT: 0, bestDist: Infinity, noProgressT: 0, replans: 0,
      timer: 0,
      insideT: 0, // seconds spent inside on this visit — a safety net against anyone getting stuck
      order: null, seat: null, counterSpot: null,
      eatDur: 0, eatT: 0,
    });
  }
}

/* ---------------- where things are ---------------- */

function customerTavern() {
  const roomId = npcHomeRoomId(); // js/npc.js — Maria's tavern, or null
  if (!roomId) return null;
  const door = findNpcHomeDoor();
  const room = getOrCreateInteriorRoom(roomId);
  if (!room || !room.npcSchedule) return null;
  return { roomId, room, door, doorSpot: npcDoorApproachSpot(door) };
}

// Open for customers right now? Weekdays during Maria's shift.
function isTavernTakingCustomers(forNewArrivals) {
  if (isNpcWeekend()) return false;
  const t = customerTavern();
  if (!t) return false;
  const h = getGameHour();
  const s = t.room.npcSchedule;
  const end = forNewArrivals ? s.workEndHour - CUSTOMER_LAST_ORDER_HOURS : s.workEndHour;
  return h >= s.workStartHour && h < end;
}

const feetToCentreY = (fy) => fy - (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
const tileCentre = (t) => ({ x: (t.col + 0.5) * TILE, y: (t.row + 0.5) * TILE }); // feet on the tile's middle

// Outdoor blocked tiles, shared by every customer and rebuilt at most
// once a second — buildNpcBlockedTiles() walks every placed item.
let customerBlockedCache = null, customerBlockedAt = 0;
function customerOutdoorBlocked() {
  const now = Date.now();
  if (!customerBlockedCache || now - customerBlockedAt > 1000) {
    customerBlockedCache = buildNpcBlockedTiles();
    customerBlockedAt = now;
  }
  return customerBlockedCache;
}

function isCustomerIndoorBlocked(room, col, row) {
  if (row < CUSTOMER_LOWER_ROOM_MIN_ROW) return true;
  return isNpcInteriorTileBlocked(room, col, row, true);
}

// A random free spot some way out from the tavern door.
function pickFarOutdoorSpot(fromX, fromY) {
  const blocked = customerOutdoorBlocked();
  for (let i = 0; i < 30; i++) {
    const ang = Math.random() * Math.PI * 2;
    const d = rand(CUSTOMER_SPAWN_MIN_TILES, CUSTOMER_SPAWN_MAX_TILES) * TILE;
    const x = fromX + Math.cos(ang) * d, y = fromY + Math.sin(ang) * d;
    if (x < TILE || y < TILE || x > MAP_W - TILE || y > MAP_H - TILE) continue;
    const col = Math.floor(x / TILE), row = Math.floor(y / TILE);
    if (blocked.has(col + "," + row)) continue;
    return tileCentre({ col, row });
  }
  return { x: fromX, y: fromY + 4 * TILE };
}

/* ---------------- seats and the counter ---------------- */

const FACING_STEP = { down: [0, 1], up: [0, -1], right: [1, 0], left: [-1, 0] };

// Every seat in the room that has a TABLE right in front of it (the way
// the seat faces), on the customers' side of the tavern. Per request:
// they go to a chair facing a table and eat there.
function findTableSeats(room) {
  const tableTiles = new Map(); // "col,row" -> true
  for (const [key, type] of room.decor) {
    if (!itemDefs[type] || !itemDefs[type].isTable) continue; // real tables only — not Tabletop Clutter
    const [c, r] = key.split(",").map(Number);
    const def = itemDefs[type];
    const tiles = def.collides ? getObjectFootprintBlockedTiles(type, c, r) : [{ col: c, row: r }];
    for (const t of tiles) tableTiles.set(t.col + "," + t.row, true);
  }
  const seats = [];
  for (const [key, type] of room.decor) {
    const def = itemDefs[type];
    if (!def || !def.sittable) continue;
    const [ac, ar] = key.split(",").map(Number);
    def.sittable.seats.forEach((s, i) => {
      const col = ac + s.col, row = ar + s.row;
      if (row < CUSTOMER_LOWER_ROOM_MIN_ROW) return;
      const step = FACING_STEP[s.facing] || FACING_STEP.down;
      const tc = col + step[0], tr = row + step[1];
      if (!tableTiles.has(tc + "," + tr)) return;
      seats.push({ key: key + "#" + i, anchorCol: ac, anchorRow: ar, col, row, facing: s.facing,
        tableCol: tc, tableRow: tr, poseX: s.poseOffsetX || 0, poseY: s.poseOffsetY || 0 });
    });
  }
  return seats;
}

function freeSeatFor(room, who) {
  const taken = new Set(customers.filter((c) => c.seat).map((c) => c.seat.key));
  const tv = customerTavern();
  const sideOnly = !!(who && who.look && customerSprites(who).sideOnly); // B..E: no front sit art
  const seats = findTableSeats(room).filter((s) => !taken.has(s.key) &&
    !(sideOnly && s.facing !== "left" && s.facing !== "right") &&
    !(player.sitting && player.scene === "inside" && player.sitAnchorCol === s.anchorCol && player.sitAnchorRow === s.anchorRow) &&
    // Dirty dishes still on that table (js/waiter.js) — sit somewhere else.
    !(tv && typeof tableHasLeftovers === "function" && tableHasLeftovers(tv.roomId, s.tableCol, s.tableRow)));
  if (!seats.length) return null;
  return seats[Math.floor(Math.random() * seats.length)];
}

// Where to stand to order: in front of (below) Maria's work spot, spreading
// out sideways when someone's already there.
function pickCounterSpot(room) {
  const w = room.npcSchedule.workSpot;
  const taken = new Set(customers.filter((c) => c.counterSpot).map((c) => c.counterSpot.col + "," + c.counterSpot.row));
  const offsets = [[0, 2], [-1, 2], [1, 2], [-2, 2], [2, 2], [0, 3], [-1, 3], [1, 3], [-2, 3], [2, 3]];
  for (const [dc, dr] of offsets) {
    const t = { col: w.col + dc, row: w.row + dr };
    if (taken.has(t.col + "," + t.row)) continue;
    if (isCustomerIndoorBlocked(room, t.col, t.row)) continue;
    return t;
  }
  return { col: w.col, row: w.row + 2 }; // everything taken — queue up behind
}

/* ---------------- walking ---------------- */

function planCustomerPath(c, gx, gy) {
  const sc = Math.floor(c.fx / TILE), sr = Math.floor(c.fy / TILE);
  const gc = Math.floor(gx / TILE), gr = Math.floor(gy / TILE);
  let tiles;
  if (c.scene === "inside") {
    const t = customerTavern();
    if (!t) { c.path = [{ x: gx, y: gy }]; c.pathIdx = 0; return; }
    const room = t.room;
    tiles = findNpcTilePath(sc, sr, gc, gr, (col, row) => isCustomerIndoorBlocked(room, col, row), {
      minCol: 0, maxCol: Math.ceil(room.width / TILE) - 1, minRow: 0, maxRow: Math.ceil(room.height / TILE) - 1,
    });
  } else {
    const blocked = customerOutdoorBlocked();
    tiles = findNpcTilePath(sc, sr, gc, gr, (col, row) => blocked.has(col + "," + row), {
      minCol: Math.max(0, Math.min(sc, gc) - NPC_PATH_MARGIN_TILES),
      maxCol: Math.min(COLS - 1, Math.max(sc, gc) + NPC_PATH_MARGIN_TILES),
      minRow: Math.max(0, Math.min(sr, gr) - NPC_PATH_MARGIN_TILES),
      maxRow: Math.min(ROWS - 1, Math.max(sr, gr) + NPC_PATH_MARGIN_TILES),
    });
  }
  const pts = (tiles ? simplifyNpcTilePath(tiles) : []).map(tileCentre);
  if (pts.length) pts[pts.length - 1] = { x: gx, y: gy };
  else pts.push({ x: gx, y: gy });
  c.path = pts;
  c.pathIdx = 0;
  c.replanT = 0;
}

function setCustomerGoal(c, gx, gy) {
  c.goalX = gx; c.goalY = gy;
  c.bestDist = Infinity; c.noProgressT = 0; c.replans = 0;
  planCustomerPath(c, gx, gy);
}

// One step toward the goal along the planned path. Returns true on arrival.
function walkCustomer(c, dt) {
  const toGoal = Math.hypot(c.goalX - c.fx, c.goalY - c.fy);
  if (toGoal <= 3) { c.fx = c.goalX; c.fy = c.goalY; c.anim = "idle"; return true; }

  // Re-plan now and then (the world may have changed), and if a whole
  // few seconds pass without getting any closer. After a few failed
  // re-plans they simply arrive — better than someone stuck forever
  // behind a wall of trees.
  c.replanT += dt;
  if (toGoal < c.bestDist - 4) { c.bestDist = toGoal; c.noProgressT = 0; }
  else c.noProgressT += dt;
  if (c.noProgressT > 4) {
    c.noProgressT = 0; c.replans++;
    if (c.replans > 3) { c.fx = c.goalX; c.fy = c.goalY; c.anim = "idle"; return true; }
    planCustomerPath(c, c.goalX, c.goalY);
  } else if (c.replanT > 4) {
    planCustomerPath(c, c.goalX, c.goalY);
  }

  if (!c.path || c.pathIdx >= c.path.length) planCustomerPath(c, c.goalX, c.goalY);
  const wp = c.path[c.pathIdx];
  const dx = wp.x - c.fx, dy = wp.y - c.fy;
  const d = Math.hypot(dx, dy);
  const step = c.speed * dt;
  if (d <= step) {
    c.fx = wp.x; c.fy = wp.y;
    c.pathIdx++;
  } else {
    c.fx += (dx / d) * step;
    c.fy += (dy / d) * step;
  }
  if (d > 0.01) c.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  if (c.facing === "left" || c.facing === "right") c.side = c.facing;
  c.anim = "walk";
  return false;
}

/* ---------------- the visit ---------------- */

function goInside(c, t) {
  const start = t.room.npcRoute && t.room.npcRoute.length ? t.room.npcRoute[0] : { col: 12, row: 29 };
  const p = tileCentre(start);
  c.scene = "inside";
  c.fx = p.x; c.fy = p.y;
  c.facing = "up";
  c.counterSpot = pickCounterSpot(t.room);
  const cs = tileCentre(c.counterSpot);
  c.state = "toCounter";
  setCustomerGoal(c, cs.x, cs.y);
}

function headForExit(c, t) {
  c.counterSpot = null;
  c.state = "toExit";
  const ex = tileCentre(t.room.npcExitTile || { col: 12, row: 30 });
  setCustomerGoal(c, ex.x, ex.y);
}

function goOutside(c, t) {
  c.scene = "outside";
  c.fx = t.doorSpot.x;
  c.fy = t.doorSpot.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE; // door spot is a CENTRE y; we track feet
  c.facing = "down";
  c.anim = "idle";
  c.seat = null; c.order = null;
  c.state = "leaveOutside";
  const far = pickFarOutdoorSpot(c.fx, c.fy);
  setCustomerGoal(c, far.x, far.y);
}

function sendAway(c) {
  c.scene = "away";
  c.state = "away";
  c.anim = "idle";
  c.path = null;
  c.seat = null; c.order = null; c.counterSpot = null;
  c.insideT = 0;
}

function advanceCustomerAnim(c, dt) {
  const count = c.anim === "sit" ? FRAME_COUNTS.sit : c.anim === "walk" ? FRAME_COUNTS.walk : FRAME_COUNTS.idle;
  const fps = c.anim === "sit" ? ANIM_FPS.sit : c.anim === "walk" ? ANIM_FPS.walk : ANIM_FPS.idle;
  if (c.frame >= count) c.frame = 0;
  c.frameTimer += dt;
  if (c.frameTimer >= 1 / fps) {
    c.frameTimer = 0;
    c.frame = (c.frame + 1) % count;
  }
}

function updateCustomer(c, dt, t) {
  const open = isTavernTakingCustomers(false);
  const arrivals = isTavernTakingCustomers(true);

  switch (c.state) {
    case "away":
      return; // started by the day plan (dispatchCustomerVisits() below)

    case "toTavern":
      if (!open || !t) { // closed on the way there — turn around
        c.state = "leaveOutside";
        const far = pickFarOutdoorSpot(c.fx, c.fy);
        setCustomerGoal(c, far.x, far.y);
        break;
      }
      if (walkCustomer(c, dt)) goInside(c, t);
      break;

    case "toCounter":
      if (!open) { headForExit(c, t); break; }
      if (walkCustomer(c, dt)) {
        // Per request: one order at a time. Line up; the pop-up only
        // shows when it's their turn (the "queued" case below).
        c.state = "queued";
        c.ticket = ++customerQueueTicket;
        c.facing = "up";
        c.anim = "idle";
      }
      break;

    case "queued": {
      c.anim = "idle";
      if (!open) { headForExit(c, t); break; }
      const someoneOrdering = customers.some((o) => o.state === "ordering");
      if (someoneOrdering) break;
      // Per request: nobody orders until Maria's actually at the counter
      // — they just wait in line (js/waiter.js isMariaAtCounter()).
      if (typeof isMariaAtCounter === "function" && t && !isMariaAtCounter(t.roomId)) break;
      const next = customers
        .filter((o) => o.state === "queued")
        .reduce((a, b) => (a.ticket < b.ticket ? a : b));
      if (next === c) {
        c.state = "ordering";
        c.timer = CUSTOMER_ORDER_SECONDS;
      }
      break;
    }

    case "ordering":
      c.anim = "idle";
      if (!open) { headForExit(c, t); break; }
      // Maria stepped away mid-order — they wait for her to come back.
      if (typeof isMariaAtCounter === "function" && t && !isMariaAtCounter(t.roomId)) break;
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = "waitSeat";
        c.timer = CUSTOMER_WAIT_SEAT_SECONDS;
        // Per request, they pay Maria at the counter — no gold on tables.
        if (typeof showMariaPaid === "function" && player.scene === "inside" && t && player.activeRoomId === t.roomId) showMariaPaid();
      }
      break;

    case "waitSeat": {
      c.anim = "idle";
      if (!open) { headForExit(c, t); break; }
      const seat = freeSeatFor(t.room, c);
      if (seat) {
        c.seat = seat;
        c.counterSpot = null;
        c.state = "toSeat";
        const p = tileCentre(seat);
        setCustomerGoal(c, p.x, p.y);
        break;
      }
      c.timer -= dt;
      if (c.timer <= 0) headForExit(c, t); // no free table — takes it elsewhere
      break;
    }

    case "toSeat":
      if (walkCustomer(c, dt)) {
        c.anim = "sit";
        c.frame = 0;
        c.facing = c.seat.facing;
        c.servedByWaiter = false;
        // The player is Maria's waiter and on shift (js/waiter.js): wait
        // at the table for them to bring the food. Otherwise Maria
        // serves, and the food is simply there.
        if (typeof isWaiterOnDuty === "function" && isWaiterOnDuty()) {
          c.state = "waitFood";
          c.timer = WAITER_FOOD_PATIENCE;
        } else {
          startEating(c);
        }
      }
      break;

    case "waitFood":
      c.anim = "sit";
      if (!open) { c.anim = "idle"; c.frame = 0; c.seat = null; headForExit(c, t); break; }
      // The waiter left (walked out, clocked off) — Maria takes over.
      if (typeof isWaiterOnDuty === "function" && !isWaiterOnDuty()) { startEating(c); break; }
      c.timer -= dt;
      if (c.timer <= 0) {
        c.anim = "idle";
        c.frame = 0;
        c.seat = null;
        headForExit(c, t);
        if (typeof noteCustomerWalkout === "function") noteCustomerWalkout(); // performance goes down (js/waiter.js)
        if (player.scene === "inside" && t && player.activeRoomId === t.roomId) {
          showToast("A customer got tired of waiting and left.");
        }
      }
      break;

    case "eating":
      c.anim = "sit";
      c.eatT += dt;
      if (c.eatT >= c.eatDur) {
        // Stand up FIRST: the seat is cleared here, and the drawing code
        // must never see "sitting" without a seat (that was the crash —
        // anim stayed "sit" for one frame after the seat was gone).
        // Served by the player (js/waiter.js)? The empty plate / mug stays
        // on the table for them to clear.
        if (c.servedByWaiter && c.seat && t && typeof leaveTableLeftover === "function") {
          leaveTableLeftover(t.roomId, c.seat.tableCol, c.seat.tableRow, c.order.type);
        }
        // Per request the empty mug appears once the drinker has gone — even
        // when Maria served (nobody clears those, so it goes after a while).
        else if (c.seat && t && c.order && c.order.type === "foodBeer" && typeof leaveTableLeftover === "function") {
          leaveTableLeftover(t.roomId, c.seat.tableCol, c.seat.tableRow, c.order.type);
          tableLeftovers[tableLeftovers.length - 1].clearAt = Date.now() + LEFTOVER_AUTO_CLEAR_MS;
        }
        c.servedByWaiter = false;
        c.anim = "idle";
        c.frame = 0;
        c.seat = null; // stands up from the seat tile and walks out from there
        headForExit(c, t);
      }
      break;

    case "toExit":
      if (walkCustomer(c, dt)) goOutside(c, t);
      break;

    case "leaveOutside":
      if (walkCustomer(c, dt)) sendAway(c);
      break;
  }
}

function startEating(c) {
  c.state = "eating";
  c.anim = "sit";
  c.eatDur = rand(CUSTOMER_EAT_MIN, CUSTOMER_EAT_MAX);
  c.eatT = 0;
}

// The player handed over the right order (js/waiter.js).
function serveCustomer(c) {
  if (c.state !== "waitFood") return;
  startEating(c);
  c.servedByWaiter = true;
  if (typeof noteOrderServed === "function") noteOrderServed(); // performance (js/waiter.js)
}

/* ---------------- the day's plan ---------------- */

// Small seeded random generator, so a given game day always gets the same
// plan (reloading mid-day doesn't reshuffle who's coming when).
function customerRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function customerVisitGameHours() {
  return (CUSTOMER_VISIT_REAL_SECONDS * TIME_SCALE) / 3600;
}

let customerPlanDay = -1;
let customerPlan = [];      // [{ hour, started }], sorted by hour — arrival time AT THE DOOR
let customerPlanLevel = ""; // "quiet" | "normal" | "busy" — handy for testing/debugging

function buildCustomerDay(day, room) {
  const rng = customerRng(day * 9973 + 17);
  const wd = (day - 1) % 7; // 0 = Monday (js/calendar.js)
  let level;
  if (wd === 0 || wd === 4) level = rng() < 0.8 ? "busy" : "normal"; // Monday & Friday: usually busy
  else {
    const r = rng();
    level = r < 0.35 ? "quiet" : r < 0.8 ? "normal" : "busy";
  }
  const [lo, hi] = CUSTOMER_DAY_VISITS[level];
  const n = lo + Math.floor(rng() * (hi - lo + 1));
  const s = room.npcSchedule;
  const open = s.workStartHour;
  const lastArrival = s.workEndHour - customerVisitGameHours() - CUSTOMER_CLOSING_WRAPUP_HOURS;
  const plan = [];
  // A couple of people waiting right at opening — "on time".
  const early = level === "quiet" ? 1 : 2 + Math.floor(rng() * 2);
  for (let i = 0; i < Math.min(early, n); i++) plan.push(open + rng() * 0.25);
  for (let i = plan.length; i < n; i++) {
    // Mostly spread across the day, with a lunch rush around noon.
    let h = rng() < 0.35 ? 12 + (rng() + rng() + rng() - 1.5) * 1.2 : open + rng() * (lastArrival - open);
    plan.push(Math.max(open, Math.min(lastArrival, h)));
  }
  plan.sort((a, b) => a - b);
  customerPlan = plan.map((hour) => ({ hour, started: false }));
  customerPlanLevel = level;
  customerPlanDay = day;
}

// Starts whichever planned visits are due, so each customer reaches the
// tavern door at their planned time.
function dispatchCustomerVisits(t) {
  const day = getGameDay();
  if (isNpcWeekend()) { customerPlan = []; customerPlanDay = day; customerPlanLevel = "closed"; return; }
  if (day !== customerPlanDay) buildCustomerDay(day, t.room);
  const h = getGameHour();
  const doorFeetY = t.doorSpot.y + (SPRITE_FEET_FRACTION - 0.5) * DRAW_SIZE;
  for (const v of customerPlan) {
    if (v.started) continue;
    if (h > v.hour + CUSTOMER_LATE_SKIP_HOURS) { v.started = true; v.skipped = true; continue; } // missed — don't pile in late
    const c = customers.find((o) => o.state === "away");
    if (!c) break; // everyone's already out — the rest wait for someone to free up
    // Where they'd come from, and how long the walk takes, decides when
    // they need to set off to arrive on time.
    const from = pickFarOutdoorSpot(t.doorSpot.x, doorFeetY);
    const walkHours = ((Math.hypot(from.x - t.doorSpot.x, from.y - doorFeetY) * 1.3) / c.speed) * TIME_SCALE / 3600;
    if (h < v.hour - walkHours) break; // not time to leave home yet (plan is sorted, so later ones aren't either)
    v.started = true;
    c.scene = "outside";
    c.fx = from.x; c.fy = from.y;
    c.order = CUSTOMER_MENU[Math.floor(Math.random() * CUSTOMER_MENU.length)];
    c.state = "toTavern";
    c.insideT = 0;
    c.plannedArrival = v.hour;
    setCustomerGoal(c, t.doorSpot.x, doorFeetY);
  }
}

// Closing (or the tavern gone, or the weekend): nobody stays inside.
// If the player is in there watching, they get up and walk out; if not,
// they're simply gone — no one left frozen in a chair.
function clearCustomersOut(t, instantly) {
  for (const c of customers) {
    if (c.state === "away") continue;
    if (c.scene === "inside") {
      if (instantly || !t) { sendAway(c); continue; }
      if (c.state !== "toExit") {
        c.anim = "idle";
        c.seat = null;
        headForExit(c, t);
      }
    } else if (c.state === "toTavern") {
      c.state = "leaveOutside";
      const far = pickFarOutdoorSpot(c.fx, c.fy);
      setCustomerGoal(c, far.x, far.y);
    }
  }
}

function updateCustomers(dt) {
  if (!customers.length) initCustomers();
  const t = customerTavern();

  if (t) {
    const s = t.room.npcSchedule;
    const h = getGameHour();
    const closingSoon = isNpcWeekend() || h >= s.workEndHour - CUSTOMER_CLOSING_WRAPUP_HOURS || h < s.workStartHour;
    const playerWatching = player.scene === "inside" && player.activeRoomId === t.roomId;
    if (closingSoon) {
      clearCustomersOut(t, !playerWatching);
      if (isNpcWeekend()) { customerPlan = []; customerPlanLevel = "closed"; customerPlanDay = getGameDay(); }
    } else dispatchCustomerVisits(t);
  } else {
    clearCustomersOut(null, true);
  }

  for (const c of customers) {
    if (c.state === "away") continue;
    if (c.scene === "inside") {
      // Safety net: nobody spends more than a few minutes inside.
      c.insideT += dt;
      if (c.insideT > CUSTOMER_VISIT_REAL_SECONDS * 2.5 && c.state !== "toExit" && t) {
        c.anim = "idle"; c.seat = null; headForExit(c, t);
      }
    }
    updateCustomer(c, dt, t);
    if (c.state !== "away") advanceCustomerAnim(c, dt);
  }
}

/* ---------------- drawing (called from js/camera.js) ---------------- */

// Which customer (if any) is sitting on this indoor seat anchor — the
// chair is then drawn just BEHIND them, the same trick the player's own
// sitting uses, or the chair would cover the person sitting on it.
function customerSittingAt(roomId, col, row) {
  const t = customerTavern();
  if (!t || t.roomId !== roomId) return null;
  for (const c of customers) {
    if ((c.state === "eating" || c.state === "waitFood") && c.seat && c.seat.anchorCol === col && c.seat.anchorRow === row) return c;
  }
  return null;
}

function drawCustomer(c) {
  const sp = customerSprites(c);
  const size = DRAW_SIZE * zoom;
  let x = c.fx, fy = c.fy;
  let sheet;
  // Side-only looks facing up/down are drawn on their last left/right side.
  const face = sp.sideOnly && (c.facing === "up" || c.facing === "down") ? c.side : c.facing;
  // Sitting needs a seat to sit on — guarded so a customer caught
  // between states can never crash the frame.
  if (c.anim === "sit" && c.seat) {
    sheet = (face === "left" || face === "right") ? sp.sit.side : sp.sit.front;
    // Eating: same seated pose, a hand going to the mouth with what they
    // ordered — meat, a spoon for the salad, a mug for the beer.
    const eat = c.state === "eating" && c.order ? customerEatSheets(c.order.type, c.look) : null;
    if (eat) {
      const e = (face === "left" || face === "right") ? eat.side : eat.front;
      if (e && e.width) sheet = e;
    }
    x += (face === "left" ? -c.seat.poseX : c.seat.poseX);
    fy += c.seat.poseY;
  } else {
    const set = c.anim === "walk" ? sp.walk : sp.idle; // (a "sit" with no seat falls back to standing)
    sheet = face === "up" ? set.up : face === "down" ? set.down : set.side;
  }
  if (!sheet || !sheet.width) return;
  const px = (x - camX) * zoom;
  const py = (feetToCentreY(fy) - camY) * zoom;
  const sx = c.frame * FRAME_SIZE;
  if (c.anim !== "sit") drawShadow(px, py - size / 2 + size * SPRITE_FEET_FRACTION, size, sheet, sx);
  ctx.save();
  if (face === "left") {
    ctx.translate(px, py);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet, sx, 0, FRAME_SIZE, FRAME_SIZE, -size / 2, -size / 2, size, size);
  } else {
    ctx.drawImage(sheet, sx, 0, FRAME_SIZE, FRAME_SIZE, px - size / 2, py - size / 2, size, size);
  }
  ctx.restore();
}

// Depth-sortable draw entries for whichever scene the player is looking at.
function customerDrawables() {
  const out = [];
  const inside = player.scene === "inside";
  const t = inside ? customerTavern() : null;
  for (const c of customers) {
    if (c.state === "away") continue;
    if (inside) {
      if (c.scene !== "inside" || !t || t.roomId !== player.activeRoomId) continue;
    } else if (c.scene !== "outside") continue;
    out.push({ sortY: c.fy, character: true, draw: () => drawCustomer(c) });
  }
  return out;
}

// The food on the tables (drawn with things-on-top-of-furniture) and the
// order bubbles (drawn over everything) — indoors only.
function drawCustomerFoodAndBubbles() {
  if (player.scene !== "inside") return;
  const t = customerTavern();
  if (!t || t.roomId !== player.activeRoomId) return;
  const size = DRAW_SIZE * zoom;
  for (const c of customers) {
    if (c.scene !== "inside") continue;
    // The beer mug is in their hand the whole time they drink (the seated
    // eating animation holds it), so it isn't on the table at all; the empty
    // mug shows up there once they've left (leftovers, js/waiter.js).
    if (c.state === "eating" && c.order && c.order.type === "foodBeer") continue;
    if (c.state === "eating" && c.seat && c.order && c.order.strip.width) {
      const strip = c.order.strip;
      const frames = Math.max(1, Math.floor(strip.width / 16));
      // The Grilled Meat is in their hand while they eat it (the seated eating
      // animation holds it), so the plate shows empty — its last frame.
      const frame = c.order.type === "meatItem" ? frames - 1
        : Math.min(frames - 1, Math.floor((c.eatT / c.eatDur) * frames));
      const w = 16 * zoom, h = strip.height * zoom;
      const x = ((c.seat.tableCol + 0.5) * TILE - camX) * zoom - w / 2;
      const y = ((c.seat.tableRow + 1) * TILE - camY) * zoom - h;
      ctx.drawImage(strip, frame * 16, 0, 16, strip.height, x, y, w, h);
    }
    if (c.state === "ordering" && c.order && c.order.bubble.width) {
      const b = c.order.bubble;
      const shown = CUSTOMER_ORDER_SECONDS - c.timer;
      const pop = Math.min(1, shown / 0.25); // quick pop-in
      const bw = b.width * zoom * CUSTOMER_BUBBLE_SCALE * (0.6 + 0.4 * pop);
      const bh = b.height * zoom * CUSTOMER_BUBBLE_SCALE * (0.6 + 0.4 * pop);
      const px = (c.fx - camX) * zoom;
      const py = (feetToCentreY(c.fy) - camY) * zoom;
      const headY = py - size / 2 + size * SPRITE_HEAD_FRACTION;
      ctx.save();
      ctx.globalAlpha = Math.min(1, pop, c.timer / 0.3);
      ctx.drawImage(b, px - bw / 2, headY - bh - 2, bw, bh);
      ctx.restore();
    }
    // Seated and waiting for the waiter (js/waiter.js): the same bubble
    // stays up, bobbing gently, so you can see who wants what. It blinks
    // for the last 10 seconds of their patience.
    if (c.state === "waitFood" && c.seat && c.order && c.order.bubble.width) {
      if (c.timer < 10 && Math.floor(c.timer * 3) % 2 === 0) continue;
      const b = c.order.bubble;
      const bw = b.width * zoom * CUSTOMER_BUBBLE_SCALE;
      const bh = b.height * zoom * CUSTOMER_BUBBLE_SCALE;
      const x = c.fx + (c.facing === "left" ? -c.seat.poseX : c.seat.poseX);
      const px = (x - camX) * zoom;
      const py = (feetToCentreY(c.fy + c.seat.poseY) - camY) * zoom;
      const headY = py - size / 2 + size * SPRITE_HEAD_FRACTION + Math.sin(performance.now() / 300) * zoom;
      ctx.drawImage(b, px - bw / 2, headY - bh - 2, bw, bh);
    }
  }
}
