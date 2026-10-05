"""Winter versions of the leafy trees and the cut stumps/trunks
(assets/items/trees/snow/<name>_snow.png) — per request, a heavier snow than
the run-time cap (js/snowground.js still does the bare noLeaves trees):
  - every clump of leaves gets snow on its OWN top (found from the dark
    outline between clumps), not only on the tree's outer silhouette;
  - a 1px snow lip sits above the outer outline, so the snow rests on top;
  - the canopy is frosted a little and dotted with flakes;
  - a cut stump's flat top (the light cut face) is covered in snow.
Run: python3 tools/build_snow_trees.py"""
import os, random
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = os.path.join(ROOT, "assets", "items", "trees")
OUT = os.path.join(T, "snow"); os.makedirs(OUT, exist_ok=True)
LEAFY = ["green/mediumgreentree", "green/thintree_green", "green/tinytree_green", "lightgreen/mediumlightgreentree",
         "orange/bigtree_orange", "orange/thintree_orange", "red/mediumredtree", "yellow/mediumyellowtree"]
CUT = ["noLeaves/bigtreecutted", "noLeaves/thintreecutted", "noLeaves/tinytreecutted",
       "trunks/mediumgreentrunk", "trunks/mediumredyellowtrunk"]
SNOW = np.array([246, 250, 255, 255]); SHADE = np.array([206, 222, 238, 255]); LIP = np.array([236, 243, 252, 255])

def lum(a): return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]

def snowy(path, cap, frost, flakes, cut_face):
    im = np.array(Image.open(path).convert("RGBA")).astype(float)
    h, w = im.shape[:2]
    op = im[..., 3] > 0
    L = lum(im)
    outline = op & (L < np.percentile(L[op], 12))
    body = op & ~outline
    out = im.copy()
    # frost over everything that isn't outline
    out[body, :3] = out[body, :3] * (1 - frost) + 255 * frost
    # snow on the top of every clump: run down from each "top" (transparent or outline above)
    snow = np.zeros((h, w), bool); shade = np.zeros((h, w), bool)
    for x in range(w):
        n = 0
        for y in range(h):
            # a clump's top: open air or outline above, or a clearly darker
            # (shadowed) pixel above — the shading between leaf clumps
            open_top = y == 0 or not op[y - 1, x] or outline[y - 1, x]
            shade_top = y < h * 0.78 and L[y - 1, x] < L[y, x] * 0.7
            if body[y, x] and n == 0 and (open_top or shade_top):
                n = cap if open_top else max(1, cap - 1)
            if body[y, x] and n > 0:
                (snow if n > 1 else shade)[y, x] = True
                n -= 1
            elif not body[y, x]:
                n = 0
    # a lip above the outer silhouette so the snow sits on top
    lip = np.zeros((h, w), bool)
    for y in range(1, h):
        lip[y - 1] |= op[y] & ~op[y - 1] & (snow[min(y + 1, h - 1)] | snow[y] | outline[y])
    if cut_face:
        # the flat cut face: the light pixels in the top third
        top = np.zeros((h, w), bool); top[: max(3, h // 3)] = True
        face = body & top & (L > np.percentile(L[body], 70))
        snow |= face
    out[shade] = SHADE; out[snow] = SNOW; out[lip & ~op] = LIP
    rnd = random.Random(path)
    ys, xs = np.nonzero(body & ~snow)
    for i in rnd.sample(range(len(ys)), min(len(ys), int(len(ys) * flakes))):
        out[ys[i], xs[i]] = SNOW
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))

# Leafy trees (per request: not snow pasted on top — the leaves themselves
# change): every leaf pixel is re-shaded by its brightness — the lit tops
# of the clumps turn to snow (a white/ice-blue ramp), the shaded undersides
# keep the tree's own colour cooled down, so each tree still reads as
# itself. The trunk is frosted a little; the outline turns a touch bluer.
def lum(a): return 0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2]
# winter ramp: deep shadow -> highlight
RAMP=np.array([[54,62,84],[86,104,132],[128,150,178],[176,196,218],[222,233,245],[250,252,255]],float)
def ramp(t):
    t=np.clip(t,0,1)*(len(RAMP)-1); i=np.floor(t).astype(int); i=np.minimum(i,len(RAMP)-2); f=(t-i)[...,None]
    return RAMP[i]*(1-f)+RAMP[i+1]*f
def winter(path, keep=0.22, bias=0.08, has_trunk=True):
    im=np.array(Image.open(path).convert('RGBA')).astype(float); h,w=im.shape[:2]
    op=im[...,3]>0; L=lum(im)
    outline=op&(L<np.percentile(L[op],10))
    # trunk palette: colours used in the bottom rows
    base=im[int(h*0.85):][op[int(h*0.85):]][:,:3]
    trunkcols=set(map(tuple,base.astype(int)))
    cols=im[...,:3].astype(int)
    trunk=np.zeros((h,w),bool)
    ys,xs=np.nonzero(op) if has_trunk else ([], [])
    for y,x in zip(ys,xs):
        c=tuple(cols[y,x])
        if c in trunkcols and c[0]>=c[1] and c[0]>c[2]+12: trunk[y,x]=True
    leaf=op&~outline&~trunk
    lv=L[leaf]; lo,hi=np.percentile(lv,3),np.percentile(lv,97)
    t=(L-lo)/max(1,hi-lo)+bias
    out=im.copy()
    rgb=ramp(t)
    # snow sits on the lit tops of the clumps; the shaded undersides keep the
    # tree's own leaf colour (cooled down), so each tree still reads as itself
    wgt=np.clip((t-0.38)/0.34,0,1); wgt=wgt*wgt*(3-2*wgt)
    cool=im[...,:3]*0.82+np.array([30,40,62])*0.18
    mix=cool*(1-wgt[...,None])+(rgb*(1-keep)+im[...,:3]*keep)*wgt[...,None]
    out[leaf,:3]=mix[leaf]
    # outline a touch bluer
    out[outline,:3]=im[outline,:3]*0.7+np.array([40,48,70])*0.3
    # trunk a bit cooler / frosted
    out[trunk&~outline,:3]=im[trunk&~outline,:3]*0.85+np.array([200,210,225])*0.15
    return Image.fromarray(out.clip(0,255).astype(np.uint8))

for name in LEAFY:
    winter(os.path.join(T, name + ".png")).save(os.path.join(OUT, os.path.basename(name) + "_snow.png"))
for name in CUT:
    snowy(os.path.join(T, name + ".png"), cap=2, frost=0.06, flakes=0.0, cut_face=True).save(os.path.join(OUT, os.path.basename(name) + "_snow.png"))
print("ok", len(LEAFY) + len(CUT))

# Bushes get the same winter leaves as the trees; flower bushes, flowers and
# mushrooms keep their colours with snow on their tops (so the flowers still
# show), all into assets/bushes/snow/ and assets/flowers/snow/.
B = os.path.join(ROOT, "assets", "bushes"); F = os.path.join(ROOT, "assets", "flowers")
os.makedirs(os.path.join(B, "snow"), exist_ok=True); os.makedirs(os.path.join(F, "snow"), exist_ok=True)
n = 0
for f in sorted(os.listdir(B)):
    if not f.endswith(".png"): continue
    src = os.path.join(B, f); dst = os.path.join(B, "snow", f[:-4] + "_snow.png")
    if f.startswith("flower") or f.startswith("mushroom"):
        tiny = Image.open(src).height < 12  # the little flowers: a thin cap, so the petals still show
        snowy(src, cap=1 if tiny else 2, frost=0.05, flakes=0.0, cut_face=False).save(dst)
    elif f.startswith("leaves"):
        snowy(src, cap=1, frost=0.15, flakes=0.0, cut_face=False).save(dst)
    else:
        winter(src, has_trunk=False).save(dst)  # bushes: all leaves, no trunk
    n += 1
for f in sorted(os.listdir(F)):
    if not f.endswith(".png"): continue
    snowy(os.path.join(F, f), cap=2, frost=0.05, flakes=0.0, cut_face=False).save(os.path.join(F, "snow", f[:-4] + "_snow.png")); n += 1
print("bushes/flowers", n)
