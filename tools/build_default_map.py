"""Builds js/defaultMap.data.js (the map a NEW game starts on) from an exported save.

Usage:  python tools/build_default_map.py <rpg-save.json>

Only the map is kept — placed items, ground, worlds, rooms, tilled soil, the start spot and the
"this map change was already made" flags. None of the progress (inventory, gold, level, exp, gear,
quests, upgrades, skills, chests' contents, crops) is copied, so a new player starts from zero.
"""
import json
import os
import sys

MAP_KEYS = [
    "placedItems", "groundFill", "worlds", "townVersion",
    "interiorCollisions", "interiorFloorDecor", "interiorDecor", "interiorCustom", "interiorTableTop",
    "npcAvoidTiles", "autotileOwned", "farm", "pendingRespawns",
    "player", "elevated", "resume",
    # one-time map edits / candles already applied to this map (or they'd be applied a second time)
    "wildPassV2", "wildCornersV2", "homeCandlesV1", "roomCandles",
]


def strip_farm(farm):
    """Tilled soil stays; the crops on it (and how wet it is) don't — those are a player's progress."""
    out = {"worlds": {}}
    for wid, w in ((farm or {}).get("worlds") or {}).items():
        plots = []
        for key, p in w.get("plots") or []:
            plots.append([key, {"wetUntil": 0, "crop": None, "orig": p.get("orig"), "emptySince": None}])
        sockets = []
        for key, s in w.get("sockets") or []:
            s = dict(s)
            if "items" in s: s["items"] = {}
            if "count" in s: s["count"] = 0
            sockets.append([key, s])
        out["worlds"][wid] = {"plots": plots, "sockets": sockets}
    return out


def main():
    src = sys.argv[1]
    with open(src, encoding="utf-8") as f:
        save = json.load(f)
    data = {k: save[k] for k in MAP_KEYS if k in save}
    if "farm" in data: data["farm"] = strip_farm(data["farm"])
    out = os.path.join(os.path.dirname(__file__), "..", "js", "defaultMap.data.js")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write('"use strict";\n')
        f.write("// The default map for a NEW game (no save yet), built by tools/build_default_map.py from\n")
        f.write("// " + os.path.basename(src) + ": only the map (placed items, ground, worlds, rooms, start spot),\n")
        f.write("// none of the progress (items, gold, level, gear). js/save.js loadGame() applies it when nothing\n")
        f.write("// is saved; js/freshStart.js then gives the starting pack.\n")
        f.write("const DEFAULT_MAP_SAVE = ")
        f.write(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
        f.write(";\n")
    print("wrote", out, "keys:", list(data.keys()))


if __name__ == "__main__":
    main()
