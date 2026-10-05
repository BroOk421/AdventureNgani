"""Overlays drawn over the player's sheets when boss gear is worn (assets/sprites_gear/<piece>/<sheet path>).
helmet: a Spartan helm with a crest; armor: a muscle cuirass (abs); gauntlet: armoured forearms/hands; boots."""
import sys, os, glob, colorsys
sys.path.insert(0, '/home/claude/farmer')
from paint import *
from PIL import Image
G='/home/claude/AdventureNgani/assets/sprites/'; O='/home/claude/orig/AdventureNgani/assets/sprites/'
OUT='/home/claude/AdventureNgani/assets/sprites_gear/'
MET=[(30,14,52),(52,28,90),(82,50,138),(120,88,190),(176,150,240),(226,212,255)]
CREST=[(120,20,90),(190,50,150),(250,110,210)]
HAIRSET=set(HAIR.values())-{BLACK}
SKINSET={(217,160,102),(162,101,67),(250,200,149),(190,130,84),(255,206,150)}
def shade(c):  # brightness -> metal tone
    r,g,b=c[:3]; v=(r*0.3+g*0.59+b*0.11)/255
    return MET[min(5,max(0,int(v*6.5)))]
def view_of(n): return 'Side' if ('Side' in n or 'sitv' in n) else ('Up' if ('_Up' in n or 'Top' in n) else 'Down')
def frame_overlays(fr, of, view):
    """fr: dressed frame, of: original frame (for head detection) -> dict piece -> overlay image"""
    (L,T),_=find_head(of,view); N=T+13
    p=fr.load(); out={k:Image.new('RGBA',(64,64)) for k in ('helmet','armor','gauntlet','boots')}
    H,A,Gt,B=(out[k].load() for k in ('helmet','armor','gauntlet','boots'))
    # --- helmet: a Spartan helm over the whole head — dome, a T-shaped face
    #     opening (front) / the face side open (side), cheek plates, and a tall
    #     plume crest running front to back.
    cx, cy = L + 5.5, T + 6.5
    def in_dome(x, y): return ((x + 0.5 - cx) / 7.6) ** 2 + ((y + 0.5 - cy) / 7.2) ** 2 <= 1 and y <= T + 13
    def opening(x, y):
        if view == 'Down':
            return (T + 9 <= y <= T + 10 and L + 2 <= x <= L + 9) or (T + 11 <= y <= T + 16 and L + 4 <= x <= L + 7)
        if view == 'Side':
            return T + 9 <= y <= T + 15 and x >= L + 7
        return False
    dome = {(x, y) for y in range(max(0, T - 3), T + 14) for x in range(max(0, L - 3), min(64, L + 15)) if in_dome(x, y) and not opening(x, y)}
    for (x, y) in dome:
        nx = (x + 0.5 - cx) / 7.6; ny = (y + 0.5 - cy) / 7.2
        lit = -0.6 * nx - 0.8 * ny
        H[x, y] = MET[5 if lit > 0.75 else 4 if lit > 0.35 else 3 if lit > -0.1 else 2 if lit > -0.5 else 1] + (255,)
    for (x, y) in dome:                       # outline
        if any((x + a, y + b) not in dome for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))): H[x, y] = MET[0] + (255,)
    for x in range(L - 1, L + 13):            # a brow band
        y = T + 8
        if (x, y) in dome and view != 'Up': H[x, y] = MET[2] + (255,)
    tops = {}
    for (x, y) in dome: tops[x] = min(tops.get(x, 99), y)
    if view in ('Down', 'Up'):
        c0 = int(cx) - 1
        for x in range(c0, c0 + 3):
            y0 = tops.get(x, T - 3)
            for k in range(8):
                y = y0 - 1 - k
                if y >= 0: H[x, y] = CREST[2 if x == c0 + 1 and k < 6 else 1 if k < 6 else 0] + (255,)
        for x in (c0 - 1, c0 + 3):
            y = tops.get(x, T - 3) - 1
            if y >= 0: H[x, y] = CREST[0] + (255,)
    else:                                     # side: the plume sweeps from the brow over the top to the back
        xs = sorted(tops)
        for x in xs[1:-1]:
            y0 = tops[x]; hgt = 3 + (2 if xs[0] + 2 < x < xs[-1] - 3 else 0)
            for k in range(hgt):
                if y0 - 1 - k >= 0: H[x, y0 - 1 - k] = CREST[2 if k == hgt - 1 else 1 if k else 0] + (255,)
        if xs:
            for k in range(6):                # the tail of the plume hangs at the back
                y = tops[xs[0]] + k
                if 0 <= xs[0] - 1 < 64: H[xs[0] - 1, y] = CREST[1 if k < 4 else 0] + (255,)
    # --- armor: the torso's cloth becomes a muscle cuirass
    x0,x1=(L+3,L+10) if view=='Side' else (L+2,L+9)   # the torso only — the sleeves stay cloth
    for y in range(N+1,min(64,N+12)):
        for x in range(max(0,x0),min(64,x1+1)):
            c=p[x,y]
            if c[3] and c[:3] in CLOTH: A[x,y]=MET[max(1,MET.index(shade(c))-1)]+(255,)
    if view=='Down':
        cx=L+5.5
        for y in range(N+3,N+10):
            for dx in (-0.5,0.5):
                x=int(cx+dx)
                if A[x,y][3]: A[x,y]=MET[1]+(255,)            # the centre line
        for y in (N+4,N+6,N+8):
            for x in range(int(cx)-3,int(cx)+4):
                if A[x,y][3] and abs(x-cx)>0.6: A[x,y]=MET[1]+(255,)  # abs rows
        for y in (N+3,N+5,N+7):
            for x in (int(cx)-2,int(cx)+2):
                if A[x,y][3]: A[x,y]=MET[4]+(255,)              # lit tops of the abs
        for x in (int(cx)-3,int(cx)+3):                          # pecs
            if A[x,N+2][3]: A[x,N+2]=MET[4]+(255,)
        for x in range(int(cx)-1,int(cx)+2):                     # a pink gem at the collar
            if A[x,N+1][3]: A[x,N+1]=CREST[2]+(255,)
    elif view=='Side':
        for y in (N+4,N+6,N+8):
            for x in range(L+5,L+10):
                if A[x,y][3]: A[x,y]=MET[1]+(255,)
    # --- gauntlets: skin below the shoulders (forearms, hands)
    for y in range(N+3,min(64,N+16)):
        for x in range(64):
            c=p[x,y]
            if c[3] and c[:3] in SKINSET:
                Gt[x,y]=shade((c[0]*0.8,c[1]*0.8,c[2]*0.8))+(255,)
    # --- boots
    BOOTSET=set(MAT['boots'])
    for y in range(N+10,64):
        for x in range(64):
            c=p[x,y]
            if c[3] and c[:3] in BOOTSET:
                B[x,y]=shade(c)+(255,)
                if y>0 and not (p[x,y-1][3] and p[x,y-1][:3] in BOOTSET): B[x,y]=CREST[1]+(255,)   # pink trim on top
    return out
n=0
for f in sorted(glob.glob(G+'*/*.png')):
    rel=os.path.relpath(f,G); name=os.path.basename(f); view=view_of(name)
    if not os.path.exists(O+rel): continue
    im=Image.open(f).convert('RGBA'); om=Image.open(O+rel).convert('RGBA')
    sheets={k:Image.new('RGBA',im.size) for k in ('helmet','armor','gauntlet','boots')}
    for i in range(im.width//64):
        if name.startswith('Death_') and i>=6: continue
        ov=frame_overlays(im.crop((i*64,0,i*64+64,64)), om.crop((i*64,0,i*64+64,64)), view)
        for k,v in ov.items(): sheets[k].paste(v,(i*64,0))
    for k,v in sheets.items():
        os.makedirs(os.path.dirname(OUT+k+'/'+rel),exist_ok=True); v.save(OUT+k+'/'+rel); n+=1
print(n,'overlay sheets')
# preview: idle down/side/up, walk, with all four pieces
pv=Image.new('RGBA',(64*6,64),(70,90,70,255))
for i,(rel,fr) in enumerate([('Idle/Idle_Down-Sheet.png',0),('Idle/Idle_Side-Sheet.png',0),('Idle/Idle_Up-Sheet.png',0),('Walk/Walk_Down-Sheet.png',2),('Walk/Walk_Side-Sheet.png',3),('Pierce/Pierce_Down-Sheet.png',4)]):
    base=Image.open(G+rel).convert('RGBA').crop((fr*64,0,fr*64+64,64))
    for k in ('boots','armor','gauntlet','helmet'): base.alpha_composite(Image.open(OUT+k+'/'+rel).convert('RGBA').crop((fr*64,0,fr*64+64,64)))
    pv.alpha_composite(base,(i*64,0))
pv.crop((0,8,384,56)).resize((384*4,48*4),Image.NEAREST).save('/tmp/armored.png')
