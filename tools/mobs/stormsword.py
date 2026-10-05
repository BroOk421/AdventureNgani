"""An original storm greatsword (40x40): broad steel blade with a fuller, violet aura, crackling lightning."""
import math, os, random
from PIL import Image
S=40; R2=math.sqrt(2)
CX,CY=10.5,29.5
def to_uv(x,y): dx,dy=x-CX,CY-y; return (dx+dy)/R2,(dy-dx)/R2
def to_px(u,v): return CX+(u-v)/R2, CY-(u+v)/R2
STEEL=[(52,58,78),(78,86,110),(112,122,150),(150,160,188),(196,206,230)]
OUT=(12,8,22)
def base():
    img=Image.new('RGBA',(S,S)); px=img.load(); L=31
    for y in range(S):
        for x in range(S):
            u,v=to_uv(x+0.5,y+0.5); c=None
            if 0<=u<=L:
                t=u/L
                half=3.4 if t<0.84 else 3.4*(1-t)/0.16+0.4      # broad, then an angled tip
                lo,hi=-half,(half if t<0.9 else half*0.5)
                if lo<=v<=hi:
                    k=(v-lo)/(hi-lo)
                    c=STEEL[min(4,int(k*5))]
                    if abs(v+0.3)<0.6 and 1.5<u<L-4: c=(40,30,70)          # the fuller (a dark groove)
                    if abs(v+0.3-1.0)<0.45 and 1.5<u<L-4: c=(170,150,230)    # its lit edge
                    if v>hi-0.7: c=(226,232,250)                            # bright cutting edge
            if -2<=u<0 and abs(v)<=4.6: c=(84,60,120) if v<0 else (120,90,170)   # guard
            if -2<=u<0 and 3.6<abs(v)<=4.6: c=(180,150,230)
            if -9<=u<-2 and abs(v)<=1.2: c=[(34,26,40),(56,44,66)][int((u*1.4)%2)]   # grip
            if -11.5<=u<-9 and abs(v)<=2.0: c=(150,90,240)                         # pommel gem
            if c: px[x,y]=c+(255,)
    for k in range(30):
        u=2+k*0.85
        x,y=to_px(u,-0.4); px[int(x),int(y)]=(46,34,84,255)
        x,y=to_px(u,0.55); px[int(x),int(y)]=(176,156,236,255)
    # a gem set in the guard
    x,y=to_px(-1,0); px[int(x),int(y)]=(230,200,255,255); px[int(x)+1,int(y)]=(170,110,255,255)
    solid={(x,y) for x in range(S) for y in range(S) if px[x,y][3]}
    for (x,y) in list(solid):
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            q=(x+dx,y+dy)
            if 0<=q[0]<S and 0<=q[1]<S and q not in solid: px[q]=OUT+(255,)
    return img
def bolt_path(rnd, x, y, ang, steps):
    pts=[(x,y)]
    for i in range(steps):
        a=ang+rnd.choice((-1,1))*rnd.uniform(0.6,1.3)          # sharp zig-zag about the main heading
        L=rnd.uniform(1.8,3.0); x+=math.cos(a)*L; y+=math.sin(a)*L; pts.append((x,y))
    return pts
def bolt(px, rnd, solid):
    # starts on the blade's edge and cracks outward, with one branch
    u=rnd.uniform(4,28); side=rnd.choice((-1,1))
    x,y=to_px(u,side*3.6)
    ang=math.atan2(-side,-side) + rnd.uniform(-0.6,0.6)          # roughly away from the blade
    main=bolt_path(rnd,x,y,ang,rnd.randint(4,6))
    br=main[rnd.randint(1,len(main)-2)]
    paths=[main, bolt_path(rnd,br[0],br[1],ang+rnd.choice((-1,1))*0.9,rnd.randint(2,3))]
    for pts in paths:
        draw_bolt(px, pts, solid)
def draw_bolt(px, pts, solid):
    for (x0,y0),(x1,y1) in zip(pts,pts[1:]):
        n=int(max(abs(x1-x0),abs(y1-y0)))+1
        for j in range(n+1):
            xx=int(round(x0+(x1-x0)*j/n)); yy=int(round(y0+(y1-y0)*j/n))
            if 0<=xx<S and 0<=yy<S and (xx,yy) not in solid:
                for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    q=(xx+dx,yy+dy)
                    if 0<=q[0]<S and 0<=q[1]<S and q not in solid and px[q][3]<200: px[q]=(140,110,255,200)
    for (x0,y0),(x1,y1) in zip(pts,pts[1:]):
        n=int(max(abs(x1-x0),abs(y1-y0)))+1
        for j in range(n+1):
            xx=int(round(x0+(x1-x0)*j/n)); yy=int(round(y0+(y1-y0)*j/n))
            if 0<=xx<S and 0<=yy<S and (xx,yy) not in solid: px[xx,yy]=(250,248,255,255)
def frame(b, i, bolts=True):
    out=Image.new('RGBA',(S,S)); o=out.load(); bp=b.load()
    solid={(x,y) for x in range(S) for y in range(S) if bp[x,y][3]}
    ph=i*0.785
    for y in range(S):
        for x in range(S):
            if (x,y) in solid: continue
            d=min((abs(x-sx)+abs(y-sy) for (sx,sy) in solid if abs(x-sx)<=4 and abs(y-sy)<=4), default=9)
            if d<=4:
                a=(0.62-0.14*d)*(0.6+0.4*math.sin(ph+(x-y)*0.35))
                if a>0.04: o[x,y]=(170,90,255,int(255*a))
    out.alpha_composite(b); o=out.load()
    if bolts:
        rnd=random.Random(1000+i)
        for _ in range(1 if i%3==2 else 2): bolt(o, rnd, solid)
        # and one crackling right across the blade, in front of it
        u=rnd.uniform(6,26); x,y=to_px(u,-4.2); ang=math.atan2(-1,1)*-1 + rnd.uniform(-0.4,0.4)
        draw_bolt(o, bolt_path(rnd,x,y,-0.785+rnd.uniform(-0.5,0.5),rnd.randint(4,5)), set())
    # a flicker of light along the edge
    u=((i/8)*31); x,y=to_px(u,2.8)
    if 0<=int(x)<S and 0<=int(y)<S: o[int(x),int(y)]=(255,255,255,255)
    return out
b=base()
frames=[frame(b,i) for i in range(8)]
OUTDIR='/mnt/user-data/outputs'
GAME=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),'assets','mobs','icons')
static=frame(b,0,bolts=False); static.save(os.path.join(OUTDIR,'storm_sword_inventory.png'))
static.resize((S*8,S*8),Image.NEAREST).save(os.path.join(OUTDIR,'storm_sword_inventory_big.png'))
st=Image.new('RGBA',(S*8,S))
for i,f in enumerate(frames): st.paste(f,(i*S,0))
st.save(os.path.join(OUTDIR,'storm_sword_anim_strip.png')); st.save(os.path.join(GAME,'stormSword_anim.png')); static.save(os.path.join(GAME,'stormSword.png'))
bg=(46,42,50)
gif=[]
for f in frames:
    c=Image.new('RGBA',(S,S),bg+(255,)); c.alpha_composite(f); gif.append(c.convert('RGB').resize((S*8,S*8),Image.NEAREST))
gif[0].save(os.path.join(OUTDIR,'storm_sword_anim.gif'),save_all=True,append_images=gif[1:],duration=90,loop=0)
gif[0].save('/tmp/storm0.png'); gif[3].save('/tmp/storm3.png')
