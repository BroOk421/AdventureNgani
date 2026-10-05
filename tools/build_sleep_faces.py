"""Closed-eye frames for the townsfolk sleeping in bed (js/citizens.js
drawSleepingCitizen()): frame 0 of each citizen's front idle (or side idle
for B-E, who only have side art) with the eyes shut — the green eye pixels
and the white beside them painted over with the face's skin, and a dark
lid line along the bottom of each eye.
Writes assets/npc/Citizen_<X>/sleep/Sleep_Face.png. Run: python3 tools/build_sleep_faces.py"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NPC = os.path.join(ROOT, "assets", "npc")
for cid in "BCDEFGIJK":
    base = os.path.join(NPC, "Citizen_" + cid, "idle")
    src = os.path.join(base, "Idle_Down.png")
    if not os.path.exists(src): src = os.path.join(base, "Idle.png")
    a = np.array(Image.open(src).convert("RGBA").crop((0, 0, 64, 64))).astype(int)
    op = a[..., 3] > 0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    face = np.zeros(op.shape, bool); face[16:31] = True
    eye = op & face & (g > r + 40) & (g > b + 15)
    white = op & face & (abs(r - g) < 20) & (abs(g - b) < 20) & (r > 140)  # white + the grey of the eye
    warm = op & face & (r > g + 15) & (g > b + 5) & (r > 150)
    cols_, cnt_ = np.unique(a[warm][:, :3], axis=0, return_counts=True) if warm.any() else (np.zeros((0, 3), int), np.zeros(0, int))
    keep_ = set(map(tuple, cols_[cnt_ >= 4]))  # the face's own skin tones (an iris colour only shows in a pixel or two)
    skin = warm & np.array([[tuple(a[y, x, :3]) in keep_ for x in range(64)] for y in range(64)])
    if not eye.any() and skin.any():
        # side-view faces whose eyes aren't green (D, E): the eye is the
        # coloured / white pixels right under the black lash line
        blk = op & face & (r < 30) & (g < 30) & (b < 30)
        lash = np.zeros(op.shape, bool)
        for y in range(18, 30):
            for x in range(1, 63):
                if blk[y, x] and op[y, x - 1] and op[y, x + 1] and not blk[y, x + 1] or (blk[y, x] and blk[y, x + 1] and op[y, x + 2] if x < 62 else False):
                    if op[y + 1, x] and not blk[y + 1, x]: lash[y, x] = True
        skinset = set(map(tuple, a[skin][:, :3]))
        for y, x in zip(*np.nonzero(lash)):
            for dy in (1, 2):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= xx < 64 and op[yy, xx] and not blk[yy, xx] and tuple(a[yy, xx, :3]) not in skinset:
                        eye[yy, xx] = True
    if not eye.any() or not skin.any():
        print("skip", cid); continue
    vals, counts = np.unique(a[skin][:, :3], axis=0, return_counts=True)
    skin_c = vals[counts.argmax()]
    L = 0.299 * r + 0.587 * g + 0.114 * b
    dark_c = a[op & face][L[op & face].argmin()][:3]
    lab, n = ndimage.label(eye, structure=np.ones((3, 3)))
    out = a.copy()
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        box = np.zeros(op.shape, bool); box[max(0, y0 - 1):y1 + 1, max(0, x0 - 1):x1 + 2] = True
        paint = box & (eye | white)
        out[paint, :3] = skin_c
        for x in range(x0, x1 + 1):
            out[y0, x, :3] = dark_c  # the shut lid, along the top of where the eye was
    dst = os.path.join(NPC, "Citizen_" + cid, "sleep"); os.makedirs(dst, exist_ok=True)
    Image.fromarray(out.astype(np.uint8)).save(os.path.join(dst, "Sleep_Face.png"))
    print("ok", cid, n)
