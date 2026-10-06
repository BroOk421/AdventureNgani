"""Original art for the Furniture Shop (js/shops.js) and the starter tools (js/freshStart.js):
   assets/buildings/exterior/furnitureShop.png (the log cottage, green roof, a chair sign),
   assets/items/tools/woodAxe.png, woodPickaxe.png (16x16),
   assets/npc/Shop_FurnitureIn|Out/Idle_Down.png (two recoloured townsfolk)."""
from PIL import Image, ImageDraw
import os, sys, colorsys
ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "tools"))
from build_shop_buildings import recolor_roof, sign
EX = os.path.join(ROOT, "assets", "buildings", "exterior")
O = (26, 18, 14, 255)
# the shop: log cottage, green roof, chair sign
fs = Image.open(os.path.join(EX, "cottageLog.png")).convert("RGBA")
recolor_roof(fs, 0.30, 0.7, 0.9)
chair = Image.new("RGBA", (16, 16)); d = ImageDraw.Draw(chair)
d.rectangle([4, 2, 11, 8], fill=(150, 98, 52, 255), outline=O)       # back
d.rectangle([3, 8, 12, 10], fill=(176, 118, 64, 255), outline=O)     # seat
d.line([(4, 11), (4, 14)], fill=O, width=2); d.line([(11, 11), (11, 14)], fill=O, width=2)
chair.save("/tmp/chair_sign.png")
fs.alpha_composite(sign("/tmp/chair_sign.png", board=((86, 58, 34), (122, 84, 50), (54, 36, 22))), (8, 92))
fs.save(os.path.join(EX, "furnitureShop.png"))
print("shop", fs.size)
# tools
def tool(head, light, dark, kind):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); px = im.load()
    for i in range(11):  # handle, bottom-left to top-right
        x, y = 2 + i, 14 - i
        px[x, y] = (128, 84, 44, 255); px[x + 1, y] = (92, 58, 30, 255)
    px[2, 14] = O; px[3, 15] = O
    if kind == "axe":
        for (x, y) in [(10, 2), (11, 2), (12, 2), (9, 3), (10, 3), (11, 3), (12, 3), (13, 3), (9, 4), (10, 4), (11, 4), (12, 4), (13, 4), (14, 4), (10, 5), (11, 5), (12, 5), (13, 5), (14, 5), (11, 6), (12, 6), (13, 6)]:
            px[x, y] = head
        for (x, y) in [(13, 4), (14, 4), (14, 5), (13, 5)]: px[x, y] = light
        for (x, y) in [(9, 3), (9, 4), (10, 5)]: px[x, y] = dark
    else:
        for (x, y) in [(6, 3), (7, 2), (8, 2), (9, 2), (10, 2), (11, 2), (12, 3), (13, 4), (14, 5), (5, 4), (4, 5), (12, 2), (13, 3), (14, 4)]:
            px[x, y] = head
        for (x, y) in [(8, 2), (9, 2), (10, 2)]: px[x, y] = light
        for (x, y) in [(4, 5), (14, 5)]: px[x, y] = dark
    # outline
    out = im.copy(); po = out.load()
    for y in range(16):
        for x in range(16):
            if px[x, y][3]: continue
            if any(0 <= x + dx < 16 and 0 <= y + dy < 16 and px[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): po[x, y] = O
    return out
TD = os.path.join(ROOT, "assets", "items", "tools")
tool((160, 168, 182, 255), (220, 226, 236, 255), (100, 106, 120, 255), "axe").save(os.path.join(TD, "woodAxe.png"))
tool((150, 156, 170, 255), (210, 216, 228, 255), (96, 100, 114, 255), "pick").save(os.path.join(TD, "woodPickaxe.png"))
# keepers: two townsfolk recoloured (clothes/hair hue shifted, skin kept)
def recolor(src, dst, shift):
    im = Image.open(src).convert("RGBA"); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a: continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < 0.28 or 0.02 < h < 0.11: continue  # greys / skin stay
            h = (h + shift) % 1
            r2, g2, b2 = colorsys.hsv_to_rgb(h, s, v)
            px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
    os.makedirs(os.path.dirname(dst), exist_ok=True); im.save(dst)
NPC = os.path.join(ROOT, "assets", "npc")
recolor(os.path.join(NPC, "Citizen_K", "idle", "Idle_Down.png"), os.path.join(NPC, "Shop_FurnitureIn", "Idle_Down.png"), 0.33)
recolor(os.path.join(NPC, "Citizen_Q", "idle", "Idle_Down.png"), os.path.join(NPC, "Shop_FurnitureOut", "Idle_Down.png"), 0.55)
print("ok")
