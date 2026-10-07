"use strict";

/* =================================================================
   TWO TOWNS — per request ("kapag yung mga bahay naman sa town is di
   magkasya or siksik na sila gawa ka pa isang town para sa ibang bahay
   pagsamahin mo sa isang town yung blacksmith, grocery, at iba pang may
   nagbebenta tavern sama mo tapos yung iba sa kabilang town na").

   The town ("main", TOWN_MAP) keeps the tavern and the shops; the cottages,
   the cabin, the Abandoned House and the Guard House are in the homes town
   ("town2", TOWN2_MAP), down the town's south road (js/worlds.js portals).
   Both built by tools/build_town_small.py.

   The townsfolk still live their day in the town (js/citizens.js runs in the
   main world only). Their homes are in the other town now, so going home
   means walking down the south road and out of sight (a "virtual" house at
   the road's end, below); in the morning they come back up it.
================================================================= */

const TOWN2_HOME_ID = "__town2"; // the townsfolk's "house" while they're in the homes town

function town2RoadShelter() {
  if (typeof TOWN_MAP === "undefined" || !TOWN_MAP.southPass || typeof TOWN2_MAP === "undefined") return null;
  const col = TOWN_MAP.southPass[0], row = TOWN_ROWS - 2;
  return {
    col, row, roomId: TOWN2_HOME_ID, kind: "town", capacity: 99, virtual: true,
    doorX: (col + 1) * TILE, // between the road's two columns
    doorFeetY: (row + 0.5) * TILE,
  };
}
{
  // The homes are elsewhere: once the town has no house of a citizen's kind,
  // the road south counts as one (soldiers too — their Guard House moved).
  const base = citizenShelters;
  citizenShelters = function () {
    const list = base.apply(this, arguments);
    if (currentWorld !== "main") return list;
    if (list.some((s) => s.virtual)) return list;
    const road = town2RoadShelter();
    if (road && !list.some((s) => s.kind === "town")) list.push(road);
    return list;
  };
  const enterBase = citizenEnterShelter;
  citizenEnterShelter = function (c, shelter) {
    if (!shelter || !shelter.virtual) return enterBase.apply(this, arguments);
    c.scene = "inside"; // "inside" = not in the town (not drawn, not on the maps)
    c.roomId = TOWN2_HOME_ID;
    c.shelter = shelter;
    c.fx = shelter.doorX; c.fy = shelter.doorFeetY;
    c.state = "idle"; c.anim = "idle"; c.timer = 999;
    c.path = null; c.goal = null; c.errand = null; c.sleepSlot = null;
  };
  const tickBase = citizenScheduleTick;
  citizenScheduleTick = function (c) {
    if (c.roomId !== TOWN2_HOME_ID) return tickBase.apply(this, arguments);
    c.state = "idle"; c.timer = 999;
    const h = getGameHour();
    if (isCitizenNight()) return; // home for the night
    if (c.visitUntil != null && h < c.visitUntil) return; // a daytime visit home
    if (c.visitUntil == null && h < CITIZEN_WAKE_HOUR + 0.25 && Math.random() > 0.02) return; // they come back up the road over the first quarter hour
    citizenLeaveShelter(c);
    c.facing = "up";
  };
}
