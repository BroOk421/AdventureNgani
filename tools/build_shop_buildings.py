"""Equipment shop + potion shop exteriors (assets/buildings/exterior/equipShop.png, potionShop.png).
Made from the town cottages: the roof recoloured and a hanging sign with the shop's item."""
import colorsys, os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EX = os.path.join(ROOT, "assets", "buildings", "exterior")
def recolor_roof(img, hue, sat_mult=1.0, val_mult=1.0, ymax=96, min_sat=0.25):
    px = img.load(); w, h = img.size
    for y in range(min(h, ymax)):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a: continue
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < min_sat: continue
            r2, g2, b2 = colorsys.hsv_to_rgb(hue, min(1, s * sat_mult), min(1, v * val_mult))
            px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
    return img
def sign(icon_path, board=((92, 60, 38), (128, 86, 52), (60, 38, 24))):
    ic = Image.open(icon_path).convert("RGBA")
    ic.thumbnail((14, 14), Image.NEAREST)
    s = Image.new("RGBA", (20, 22)); p = s.load()
    for x in (3, 16):
        for y in range(0, 5): p[x, y] = (40, 30, 26, 255)
    for y in range(5, 22):
        for x in range(0, 20):
            edge = x in (0, 19) or y in (5, 21)
            p[x, y] = board[2] + (255,) if edge else (board[1] if (y // 3) % 2 else board[0]) + (255,)
    s.alpha_composite(ic, (10 - ic.width // 2, 13 - ic.height // 2 + 1))
    return s
eq = Image.open(os.path.join(EX, "cottageBrick.png")).convert("RGBA")
recolor_roof(eq, 0.60, 0.55, 0.85)        # slate-blue iron roof
eq.alpha_composite(sign(os.path.join(ROOT, "assets", "mobs", "icons", "caveSword.png")), (8, 92))
eq.save(os.path.join(EX, "equipShop.png"))
po = Image.open(os.path.join(EX, "cottagePlaster.png")).convert("RGBA")
recolor_roof(po, 0.78, 0.9, 0.95)         # purple roof
po.alpha_composite(sign(os.path.join(ROOT, "assets", "buildings", "furniture", "bldPotionRed.png")), (100, 92))
po.save(os.path.join(EX, "potionShop.png"))
print(eq.size, po.size)
