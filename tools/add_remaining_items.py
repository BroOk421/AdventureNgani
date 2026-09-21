#!/usr/bin/env python3
"""
One-time content pass: wires up every leftover art asset that had no
itemDefs entry yet (bushes, interior furniture, outdoor furniture,
vegetables, a couple of alternate house skins and medium tree variants),
and removes the current wood weapons from the inventory for now, per
request ("lagay mo na rin yung iba pang mga pixel na wala pa sa
inventory except sa mga weapon alisin mo muna sa inventory").

Run once from the project root: python tools/add_remaining_items.py
Safe to re-run — it's idempotent (checks itemDefs keys already present).

Skipped on purpose (not single icons — see NOT_ADDED below):
  - assets/interior/backchair.png, assets/interior/base4.png (608x384 —
    a whole uncropped contact sheet, not this one chair/cabinet's icon)
  - assets/interior/asesprite/bigbed-sheet.png (1380x54 raw multi-frame
    strip; assets/interior/bigbed.png is the actual single-icon version)
  - assets/outdoor/port_bridge_wall_strock.png (800x864 — a texture
    sheet, not a placeable icon)
  - assets/items/vegetables/wet.png (48x16, two glued-together variants,
    unclear which is which)
  - the entire assets/particles/ tree — exact duplicates of assets/
    bushes, assets/interior (as "inside"), assets/outdoor (as "outside"),
    assets/items/vegetables, assets/items/house, assets/items/trees;
    left alone rather than double-adding the same art under two ids.
  - assets/tiles/dirt.png — the old pre-split sheet; dirt1/2/3 (already
    in itemDsefs) replaced it.
  - the 6 vegetable "growth strip" sheets (onion.png, petchay.png,
    cabbage.png, brocolli.png, brocolli_flower.png, carrots.png,
    dragonfruit.png) are multi-stage strips, not single icons — the
    mature/last stage was cropped out into *_mature.png (see
    tools/add_remaining_items.py's own crop step, already applied) and
    THAT is what's registered below.
"""
import re

ROOT = "/home/claude/AdventureNgani/AdventureNgani"
ASSETS_JS = f"{ROOT}/js/assets.js"
INVENTORY_JS = f"{ROOT}/js/inventory.js"

# (assetKey, itemId, displayName, srcPath, flat, extraFlags)
# extraFlags is a dict merged into the itemDefs entry (e.g. collides).
NEW_ITEMS = []

def add(asset_key, item_id, name, src, flat, **extra):
    NEW_ITEMS.append((asset_key, item_id, name, src, flat, extra))

# --- bushes / small flora (assets/bushes/) — decorative, Y-sorted, no collision ---
add("bushBigGreen", "bushBigGreen", "Big Green Bush", "assets/bushes/biggreenbush.png", False)
add("bushBigLightGreen", "bushBigLightGreen", "Big Light Green Bush", "assets/bushes/biglightgreenbush.png", False)
add("bushBigRed", "bushBigRed", "Big Red Bush", "assets/bushes/bigredbush.png", False)
add("bushBigYellow", "bushBigYellow", "Big Yellow Bush", "assets/bushes/bigyellowbush.png", False)
add("bushMediumGreen", "bushMediumGreen", "Medium Green Bush", "assets/bushes/mediumgreenbush.png", False)
add("bushMediumLightGreen", "bushMediumLightGreen", "Medium Light Green Bush", "assets/bushes/mediumlightgreenbush.png", False)
add("bushMediumRed", "bushMediumRed", "Medium Red Bush", "assets/bushes/mediumredbush.png", False)
add("bushMediumYellow", "bushMediumYellow", "Medium Yellow Bush", "assets/bushes/mediumyellowbush.png", False)
add("bushSmallGreen", "bushSmallGreen", "Small Green Bush", "assets/bushes/smallgreenbush.png", False)
add("bushSmallLightGreen", "bushSmallLightGreen", "Small Light Green Bush", "assets/bushes/smalllightgreenbush.png", False)
add("bushSmallRed", "bushSmallRed", "Small Red Bush", "assets/bushes/smallredbush.png", False)
add("bushSmallYellow", "bushSmallYellow", "Small Yellow Bush", "assets/bushes/smallyellowbush.png", False)
add("bushXSGreen", "bushXSGreen", "XS Green Bush", "assets/bushes/xsgreenbush.png", False)
add("bushXSLightGreen", "bushXSLightGreen", "XS Light Green Bush", "assets/bushes/xslightgreenbush.png", False)
add("bushXSRed", "bushXSRed", "XS Red Bush", "assets/bushes/xsredbush.png", False)
add("bushXSYellow", "bushXSYellow", "XS Yellow Bush", "assets/bushes/xsyellowbush.png", False)
add("bushFlowerA", "bushFlowerA", "Flowering Bush (A)", "assets/bushes/flower.png", False)
add("bushFlowerB", "bushFlowerB", "Flowering Bush (B)", "assets/bushes/flower2.png", False)
add("bushFlowerC", "bushFlowerC", "Flowering Bush (C)", "assets/bushes/flower3.png", False)
add("bushFlowerD", "bushFlowerD", "Flowering Bush (D)", "assets/bushes/flower4.png", False)
add("bushMushroom1", "bushMushroom1", "Mushroom (A)", "assets/bushes/mushroom.png", False)
add("bushMushroom2", "bushMushroom2", "Mushroom (B)", "assets/bushes/mushroom2.png", False)
add("leavesFloor", "leavesFloor", "Fallen Leaves (Ground)", "assets/bushes/leaves_floor.png", True)

# --- extra tree variants + trunk stumps (assets/items/trees/) — "tree" prefix auto-joins the Trees group ---
add("treeMediumGreen", "treeMediumGreen", "Medium Tree (Green)", "assets/items/trees/green/mediumgreentree.png", False, collides=True)
add("treeMediumLightGreen", "treeMediumLightGreen", "Medium Tree (Light Green)", "assets/items/trees/lightgreen/mediumlightgreentree.png", False, collides=True)
add("treeMediumRed", "treeMediumRed", "Medium Tree (Red)", "assets/items/trees/red/mediumredtree.png", False, collides=True)
add("treeMediumYellow", "treeMediumYellow", "Medium Tree (Yellow)", "assets/items/trees/yellow/mediumyellowtree.png", False, collides=True)
add("treeMediumGreenTrunk", "treeMediumGreenTrunk", "Medium Trunk (Green)", "assets/items/trees/trunks/mediumgreentrunk.png", False, collides=True)
add("treeMediumRedYellowTrunk", "treeMediumRedYellowTrunk", "Medium Trunk (Red/Yellow)", "assets/items/trees/trunks/mediumredyellowtrunk.png", False, collides=True)

# --- alternate house skins (assets/items/house/) — same treatment as house1 ---
add("house2", "house2", "House (Alt. 1)", "assets/items/house/house2.png", False,
    collides=True, multiTileFootprint=True, footprintExcludeBackRows=2, fadeOnlyWhenBehind=True)
add("house3", "house3", "House (Alt. 2)", "assets/items/house/house3.png", False,
    collides=True, multiTileFootprint=True, footprintExcludeBackRows=2, fadeOnlyWhenBehind=True)

# --- interior: floor/wall/structural pieces — flat, sit flush like ground tiles ---
add("floorBrown", "floorBrown", "Floor (Brown)", "assets/interior/floorbrown.png", True)
add("floorDarkGreen", "floorDarkGreen", "Floor (Dark Green)", "assets/interior/floordarkgreen.png", True)
add("floorGreen", "floorGreen", "Floor (Green)", "assets/interior/floorgreen.png", True)
add("interiorWall", "interiorWall", "Interior Wall", "assets/interior/interior_wall.png", True)
add("ceilingTile", "ceilingTile", "Ceiling", "assets/interior/ceiling.png", True)
add("windowPlain1", "windowPlain1", "Window (A)", "assets/interior/window.png", True)
add("windowPlain2", "windowPlain2", "Window (B)", "assets/interior/window2.png", True)
add("windowLight1", "windowLight1", "Lit Window (A)", "assets/interior/window_light.png", True)
add("windowLight2", "windowLight2", "Lit Window (B)", "assets/interior/window_light2.png", True)
add("windowLight3", "windowLight3", "Lit Window (C)", "assets/interior/window_light3.png", True)
add("doorPlain1", "doorPlain1", "Door (A)", "assets/interior/door.png", True)
add("doorPlain2", "doorPlain2", "Door (B)", "assets/interior/door2.png", True)
add("doorPlain3", "doorPlain3", "Door (C)", "assets/interior/door3.png", True)
add("chimneyRedDoor", "chimneyRedDoor", "Chimney Flue (Red)", "assets/interior/chimnyreddoor.png", True)
add("wallPoster", "wallPoster", "Wall Poster", "assets/interior/wall_poster.png", True)
add("pictureFrame", "pictureFrame", "Picture Frame", "assets/interior/pictureframe.png", True)
add("boardA", "boardA", "Board (A)", "assets/interior/board.png", True)
add("boardB", "boardB", "Board (B)", "assets/interior/board2.png", True)
add("wallFurniture1", "wallFurniture1", "Wall Decor 1", "assets/interior/wall_furniture.png", True)
add("wallFurniture2", "wallFurniture2", "Wall Decor 2", "assets/interior/wall_furniture2.png", True)
add("wallFurniture3", "wallFurniture3", "Wall Decor 3", "assets/interior/wall_furniture3.png", True)
add("wallFurniture4", "wallFurniture4", "Wall Decor 4", "assets/interior/wall_furniture4.png", True)
add("wallFurniture5", "wallFurniture5", "Wall Decor 5", "assets/interior/wall_furniture5.png", True)
add("wallFurniture6", "wallFurniture6", "Wall Decor 6", "assets/interior/wall_furniture6.png", True)
add("wallFurniture7", "wallFurniture7", "Wall Decor 7", "assets/interior/wall_furniture7.png", True)
add("cookerExtension1", "cookerExtension1", "Stove Extension (A)", "assets/interior/cooker_extension.png", True)
add("cookerExtension2", "cookerExtension2", "Stove Extension (B)", "assets/interior/cooker2_extension.png", True)
add("tableFurniture1", "tableFurniture1", "Tabletop Clutter 1", "assets/interior/table_furniture.png", True)
add("tableFurniture2", "tableFurniture2", "Tabletop Clutter 2", "assets/interior/table_furniture2.png", True)
add("tableFurniture3", "tableFurniture3", "Tabletop Clutter 3", "assets/interior/table_furniture3.png", True)
add("tableFurniture4", "tableFurniture4", "Tabletop Clutter 4", "assets/interior/table_furniture4.png", True)
add("mugFull", "mugFull", "Mug (Full)", "assets/interior/mug_drink.png", True)
add("mugEmpty", "mugEmpty", "Mug (Empty)", "assets/interior/mug_empty.png", True)
add("plateEmpty", "plateEmpty", "Plate (Empty)", "assets/interior/plate_empty.png", True)
add("plateFood", "plateFood", "Plate (With Food)", "assets/interior/plate_food.png", True)
add("meatItem", "meatItem", "Meat", "assets/interior/meat.png", True)

# --- interior: standing furniture — real presence, Y-sorted, no collision (footprint not designed yet) ---
add("chairFront", "chairFront", "Chair (Front-facing)", "assets/interior/frontchair.png", False)
add("chairRight", "chairRight", "Chair (Side-facing)", "assets/interior/rightchair.png", False)
add("cabinetBaseA", "cabinetBaseA", "Cabinet Base (A)", "assets/interior/base.png", False)
add("cabinetBaseB", "cabinetBaseB", "Cabinet Base (B)", "assets/interior/base2.png", False)
add("cabinetBaseC", "cabinetBaseC", "Cabinet Base (C)", "assets/interior/base3.png", False)
add("cabinetBaseD", "cabinetBaseD", "Cabinet Base (D)", "assets/interior/base5.png", False)
add("basket1", "basket1", "Basket (A)", "assets/interior/basket.png", False)
add("basket2", "basket2", "Basket (B)", "assets/interior/basket2.png", False)
add("bedBig", "bedBig", "Big Bed", "assets/interior/bigbed.png", False)
add("bedSmall", "bedSmall", "Small Bed", "assets/interior/smallbed.png", False)
add("tableBig", "tableBig", "Big Table (A)", "assets/interior/bigtable.png", False)
add("tableBig1", "tableBig1", "Big Table (B)", "assets/interior/bigtable1.png", False)
add("tableBig2", "tableBig2", "Big Table (C)", "assets/interior/bigtable2.png", False)
add("tableCircle", "tableCircle", "Round Table", "assets/interior/circletable.png", False)
add("tableKitchen", "tableKitchen", "Kitchen Table", "assets/interior/kitchen_table.png", False)
add("tableSmall", "tableSmall", "Small Table", "assets/interior/smalltable.png", False)
add("cookerStove1", "cookerStove1", "Stove (A)", "assets/interior/cooker.png", False)
add("cookerStove2", "cookerStove2", "Stove (B)", "assets/interior/cooker2.png", False)
add("cookerStove3", "cookerStove3", "Stove (C)", "assets/interior/cooker3.png", False)
add("couch", "couch", "Couch", "assets/interior/couch.png", False)
add("drawerFurniture", "drawerFurniture", "Drawer", "assets/interior/drawer.png", False)
add("broom", "broom", "Broom (Walis)", "assets/interior/walis.png", False)
add("barrelInterior", "barrelInterior", "Barrel", "assets/interior/barrel.png", False)
add("crateInterior", "crateInterior", "Wooden Crate", "assets/interior/box.png", False)
add("chimneyPlain", "chimneyPlain", "Chimney", "assets/interior/chimny.png", False)
add("chimneyRed", "chimneyRed", "Chimney (Red)", "assets/interior/chimnyred.png", False)

# --- outdoor (assets/outdoor/) ---
add("benchHorizontal", "benchHorizontal", "Bench (Horizontal)", "assets/outdoor/benchh.png", False)
add("benchVertical", "benchVertical", "Bench (Vertical)", "assets/outdoor/benchv.png", False)
add("chairOutdoorFront", "chairOutdoorFront", "Outdoor Chair (Front)", "assets/outdoor/chairfront.png", False)
add("chairOutdoorSide", "chairOutdoorSide", "Outdoor Chair (Side)", "assets/outdoor/chairside.png", False)
add("fence", "fence", "Fence", "assets/outdoor/fence.png", False)
add("floorMat", "floorMat", "Floor Mat", "assets/outdoor/floormat.png", True)
add("longTableHorizontal", "longTableHorizontal", "Long Table (Horizontal)", "assets/outdoor/longtableh.png", False)
add("longTableVertical", "longTableVertical", "Long Table (Vertical)", "assets/outdoor/longtablev.png", False)
add("portBridge", "portBridge", "Port Bridge", "assets/outdoor/port_bridge.png", False)
add("portBridgeDecor", "portBridgeDecor", "Port Bridge Decor", "assets/outdoor/port_bridge_decor.png", False)
add("portBridgeFront1", "portBridgeFront1", "Port Bridge Front (A)", "assets/outdoor/port_bridge_front.png", True)
add("portBridgeFront2", "portBridgeFront2", "Port Bridge Front (B)", "assets/outdoor/port_bridge_front2.png", True)
add("portBridgeFront3", "portBridgeFront3", "Port Bridge Front (C)", "assets/outdoor/port_bridge_front3.png", True)
add("portBridgeFront4", "portBridgeFront4", "Port Bridge Front (D)", "assets/outdoor/port_bridge_front4.png", True)
add("portBridgeWall1", "portBridgeWall1", "Port Bridge Wall (A)", "assets/outdoor/port_bridge_wall.png", True)
add("portBridgeWall2", "portBridgeWall2", "Port Bridge Wall (B)", "assets/outdoor/port_bridge_wall2.png", True)
add("postPlain", "postPlain", "Post", "assets/outdoor/post.png", False)
add("postLight", "postLight", "Lamp Post", "assets/outdoor/postlight.png", False)
add("postHandleLight", "postHandleLight", "Handheld Lamp", "assets/outdoor/posthandlelight.png", True)
add("tableOutdoorSmall", "tableOutdoorSmall", "Small Outdoor Table", "assets/outdoor/table.png", True)

# --- vegetables / farming (assets/items/vegetables/) ---
add("vegOnion", "vegOnion", "Onion", "assets/items/vegetables/onion/onion_mature.png", True)
add("vegOnionBox", "vegOnionBox", "Onion Crate", "assets/items/vegetables/onion/onionbox.png", False)
add("vegPetchay", "vegPetchay", "Petchay", "assets/items/vegetables/petchay/petchay_mature.png", True)
add("vegPetchayBox", "vegPetchayBox", "Petchay Crate", "assets/items/vegetables/petchay/petchaybox.png", False)
add("vegCabbage", "vegCabbage", "Cabbage", "assets/items/vegetables/cabbage/cabbage_mature.png", True)
add("vegCabbageBox", "vegCabbageBox", "Cabbage Crate", "assets/items/vegetables/cabbage/cabbagebox.png", False)
add("vegBrocolli", "vegBrocolli", "Broccoli", "assets/items/vegetables/brocolli/brocolli_mature.png", True)
add("vegBrocolliBox", "vegBrocolliBox", "Broccoli Crate", "assets/items/vegetables/brocolli/brocollibox.png", False)
add("vegBrocolliFlower", "vegBrocolliFlower", "Broccoli Flower", "assets/items/vegetables/brocolli_flower/brocolli_flower_mature.png", True)
add("vegBrocolliFlowerBox", "vegBrocolliFlowerBox", "Broccoli Flower Crate", "assets/items/vegetables/brocolli_flower/brocolli_flowerbox.png", False)
add("vegCarrots", "vegCarrots", "Carrots", "assets/items/vegetables/carrots/carrots_mature.png", True)
add("vegCarrotBox", "vegCarrotBox", "Carrot Crate", "assets/items/vegetables/carrots/carrotbox.png", False)
add("vegDragonfruit", "vegDragonfruit", "Dragonfruit", "assets/items/vegetables/dragonfruit/dragonfruit_mature.png", True)
add("vegDragonfruitBox", "vegDragonfruitBox", "Dragonfruit Crate", "assets/items/vegetables/dragonfruit/dragonfruitbox.png", False)
add("vegCrate", "vegCrate", "Crate (Closed)", "assets/items/vegetables/box.png", False)
add("vegCrateOpen", "vegCrateOpen", "Crate (Open)", "assets/items/vegetables/boxopen.png", False)
add("dirtRake", "dirtRake", "Dirt Rake", "assets/items/vegetables/dirtrake.png", True)
add("dirtWet", "dirtWet", "Wet Dirt Patch", "assets/items/vegetables/dirtwet.png", True)
add("plantDrawer", "plantDrawer", "Plant Drawer", "assets/items/vegetables/plantdrawer.png", False)
add("plotSocketOpen", "plotSocketOpen", "Planting Socket (Open)", "assets/items/vegetables/socketopen.png", True)
add("plotSocketClosed", "plotSocketClosed", "Planting Socket (Closed)", "assets/items/vegetables/socketclose.png", True)
add("waterCrateHorizontal", "waterCrateHorizontal", "Water Crate (Horizontal)", "assets/items/vegetables/waterboxh.png", False)
add("waterCrateVertical", "waterCrateVertical", "Water Crate (Vertical)", "assets/items/vegetables/waterboxv.png", False)

NOT_ADDED = [
    "assets/interior/backchair.png", "assets/interior/base4.png",
    "assets/interior/asesprite/bigbed-sheet.png",
    "assets/outdoor/port_bridge_wall_strock.png",
    "assets/items/vegetables/wet.png",
]

WEAPON_IDS = [
    "woodSword", "woodDagger", "woodDaggerSmall", "woodRapier", "woodJavelin",
    "woodAxe", "woodSickle", "woodPickaxe", "woodMattock", "woodHammer",
    "woodHookStaff", "woodClubWrapped", "woodTongs", "woodBow",
]


def js_str(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'


def main():
    with open(ASSETS_JS, "rb") as f:
        assets_src = f.read().decode("utf-8")
    with open(INVENTORY_JS, "rb") as f:
        inv_src = f.read().decode("utf-8")

    already = set(re.findall(r"^\s{2}(\w+):\s*new Image\(\)", assets_src, re.M))
    to_add = [item for item in NEW_ITEMS if item[0] not in already]
    if not to_add:
        print("Nothing to add — assets.js already has every key (re-run is a no-op).")
    else:
        decl_lines = []
        src_lines = []
        current_section = None
        for asset_key, item_id, name, src, flat, extra in to_add:
            decl_lines.append(f"  {asset_key}: new Image(),")
            src_lines.append(f'assets.{asset_key}.src = "{src}";')

        marker = "\r\n// ==== added by tools/add_remaining_items.py — new items pass ====\r\n"
        # Insert declarations right before the closing `};` of the `assets` object.
        close_idx = assets_src.index("\r\n};", assets_src.index("const assets = {"))
        assets_src = (assets_src[:close_idx] + marker +
                      "\r\n".join(decl_lines) + "\r\n" + assets_src[close_idx:])
        # Append .src assignments at the end of the file.
        assets_src = assets_src.rstrip("\r\n") + "\r\n" + marker + "\r\n".join(src_lines) + "\r\n"

    already_items = set(re.findall(r"^\s{2}(\w+):\s*\{\s*id:", inv_src, re.M))
    item_lines = []
    for asset_key, item_id, name, src, flat, extra in NEW_ITEMS:
        if item_id in already_items:
            continue
        fields = [f"id: {js_str(item_id)}", f"name: {js_str(name)}", f"icon: assets.{asset_key}", "unlimited: true"]
        if flat:
            fields.append("flat: true")
        for k, v in extra.items():
            if isinstance(v, bool):
                fields.append(f"{k}: {str(v).lower()}")
            else:
                fields.append(f"{k}: {v}")
        item_lines.append(f"  {item_id}: {{ {', '.join(fields)} }},")

    if item_lines:
        marker = ('\r\n  // ==== added by tools/add_remaining_items.py — bushes, interior/outdoor\r\n'
                   '  // furniture, vegetables, alt. house skins, extra tree variants. All\r\n'
                   '  // default to no collision / no footprint design yet (except trees and\r\n'
                   '  // the two alt. houses, which match their existing siblings) — add\r\n'
                   '  // `collides: true` / `fixedFootprint` per item later as needed.\r\n')
        close_idx = inv_src.index("\r\n};", inv_src.index("const itemDefs = {"))
        inv_src = inv_src[:close_idx] + marker + "\r\n".join(item_lines) + "\r\n" + inv_src[close_idx:]

    # Remove the current weapons from the inventory for now (keep the
    # loaded Image assets and npc.js shop stock — renderNpcShopGrid()
    # already skips shop rows whose itemDefs entry is missing, so the
    # shop just quietly drops those rows instead of breaking).
    removed = 0
    for wid in WEAPON_IDS:
        pattern = re.compile(r'  ' + re.escape(wid) + r':\s*\{[^\r\n]*\},\r\n')
        new_inv_src, n = pattern.subn('', inv_src)
        if n == 1:
            inv_src = new_inv_src
            removed += 1
        elif wid not in inv_src:
            pass  # already removed by an earlier run
        else:
            print(f"WARNING: couldn't cleanly remove {wid} — check inventory.js by hand")

    with open(ASSETS_JS, "wb") as f:
        f.write(assets_src.encode("utf-8"))
    with open(INVENTORY_JS, "wb") as f:
        f.write(inv_src.encode("utf-8"))

    print(f"assets.js: +{len(to_add)} image declarations/sources")
    print(f"inventory.js: +{len(item_lines)} itemDefs entries, -{removed} weapon entries")
    print(f"Skipped (see NOT_ADDED): {len(NOT_ADDED)} files")


if __name__ == "__main__":
    main()
