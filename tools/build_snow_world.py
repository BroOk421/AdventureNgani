"""Winter art for houses, lamp posts, flowers and mushrooms (per request:
the snow is painted INTO the drawing — no outline / stroke laid on top):
  - roofs: every roof pixel (found from the top of each column down, in the
    roof's own colours) is re-shaded into snow by its own brightness, so
    the plank / tile lines and shading stay and the roof reads as snowed on;
  - chimneys, gable peaks, lamp heads, flower and mushroom tops: the top few
    pixels of each upward-facing surface are re-shaded the same way — no
    pixels are added outside the drawing.
Writes <folder>/snow/<name>_snow.png next to each source.
Run: python3 tools/build_snow_world.py"""
import os
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAMP = np.array([[96, 112, 140], [140, 160, 188], [184, 202, 224], [222, 233, 245], [250, 252, 255]], float)

def lum(a): return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
def ramp(t):
    t = np.clip(t, 0, 1) * (len(RAMP) - 1); i = np.minimum(np.floor(t).astype(int), len(RAMP) - 2); f = (t - i)[..., None]
    return RAMP[i] * (1 - f) + RAMP[i + 1] * f

def snow_colour(a, mask, lo=0.35, keep=0.12):
    """Re-shade the masked pixels into snow, keeping their own light/dark."""
    L = lum(a); v = L[mask]
    if not len(v): return
    t = lo + (1 - lo) * (L - v.min()) / max(1.0, v.max() - v.min())
    col = ramp(t) * (1 - keep) + a[..., :3] * keep
    a[mask, :3] = col[mask]

def parts(a):
    op = a[..., 3] > 0; L = lum(a)
    dark = op & (L < np.percentile(L[op], 12))
    return op, dark

def top_caps(a, depth, rows=None):
    """The top `depth` pixels under open air of every column run (outline excluded)."""
    op, dark = parts(a); h, w = op.shape
    m = np.zeros((h, w), bool)
    lim = h if rows is None else rows
    for x in range(w):
        n = 0
        for y in range(lim):
            if op[y, x] and not dark[y, x] and (y == 0 or not op[y - 1, x] or (dark[y - 1, x] and (y < 2 or not op[y - 2, x]))):
                n = depth
            if op[y, x] and not dark[y, x] and n > 0:
                m[y, x] = True; n -= 1
            elif not op[y, x]:
                n = 0
    return m

def roof_mask(a):
    op, dark = parts(a); h, w = op.shape
    pal = set()
    for x in range(w):
        for y in np.nonzero(op[:, x])[0][:10]:
            if not dark[y, x]: pal.add(tuple(a[y, x, :3].astype(int)))
    m = np.zeros((h, w), bool)
    for x in range(w):
        started = False
        for y in range(h):
            if not op[y, x]:
                if started: break
                continue
            c = tuple(a[y, x, :3].astype(int))
            if c in pal or dark[y, x]: m[y, x] = True; started = True
            elif started: break
    return m & ~dark

def out_path(src):
    d, f = os.path.split(src)
    os.makedirs(os.path.join(d, "snow"), exist_ok=True)
    return os.path.join(d, "snow", f[:-4] + "_snow.png")

def house(src):
    a = np.array(Image.open(src).convert("RGBA")).astype(float)
    roof = roof_mask(a)
    snow_colour(a, roof, lo=0.3, keep=0.16)
    caps = top_caps(a, 2, rows=int(a.shape[0] * 0.5)) & ~roof  # chimney tops, gable peaks
    snow_colour(a, caps, lo=0.55)
    Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(out_path(src))

def capped(src, depth, lo=0.5):
    a = np.array(Image.open(src).convert("RGBA")).astype(float)
    snow_colour(a, top_caps(a, depth), lo=lo)
    Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(out_path(src))

n = 0
for f in ["cottageLog", "cottagePlaster", "cottageBrick", "guardHouse", "groceryStore"]:
    house(os.path.join(ROOT, "assets", "buildings", "exterior", f + ".png")); n += 1
for f in ["house1", "house2", "house3"]:
    house(os.path.join(ROOT, "assets", "items", "house", f + ".png")); n += 1
for f in ["postlight", "postlight-light", "postlight_left", "postlight-light_left"]:
    capped(os.path.join(ROOT, "assets", "outdoor", f + ".png"), 2); n += 1
B = os.path.join(ROOT, "assets", "bushes")
for f in ["flower", "flower2", "flower3", "flower4"]:
    capped(os.path.join(B, f + ".png"), 1, lo=0.6); n += 1
for f in ["mushroom", "mushroom2"]:
    capped(os.path.join(B, f + ".png"), 2, lo=0.45); n += 1
for f in ["flower1", "flower2"]:
    capped(os.path.join(ROOT, "assets", "flowers", f + ".png"), 1, lo=0.6); n += 1
print("ok", n)

# Port (island) tiles: their grass becomes snow — the grass pixels take the
# snow tile's own pixels at the same spot, the sand and water stay.
TILE = os.path.join(ROOT, "assets", "items", "tile")
SNOWTEX = np.array(Image.open(os.path.join(ROOT, "assets", "tiles", "snow_tile", "center-snow-3.png")).convert("RGBA")).astype(float)
for f in sorted(os.listdir(TILE)):
    if not (f.startswith("port_") and f.endswith(".png")): continue
    a = np.array(Image.open(os.path.join(TILE, f)).convert("RGBA")).astype(float)
    g = (a[..., 3] > 0) & (a[..., 1] > a[..., 0] + 30) & (a[..., 1] > a[..., 2] + 30)
    a[g, :3] = SNOWTEX[: a.shape[0], : a.shape[1]][g, :3]
    Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(out_path(os.path.join(TILE, f))); n += 1
print("with port tiles", n)
