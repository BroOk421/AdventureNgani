"""Boss-drop gear in the Storm Greatsword's style: violet metal, violet aura, lightning (24x24).
<id>.png = inventory picture (aura only); <id>_anim.png = 6 frames with lightning."""
import math, os, random
from px import *
from PIL import Image
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IC=os.path.join(ROOT,'assets','mobs','icons')
S=24
MET=[(40,20,70),(66,38,112),(98,62,156),(140,104,206),(196,170,248)]
TRIM=[(120,90,170),(176,150,230),(230,214,255)]
GEMC=(255,120,230)
OUT=(12,6,22)
def sc(pts,k=1.3,o=1.6): return [(x*k+o,y*k+o) for x,y in pts]
def helmet():
    dome={q for q in ellipse(12,13,8,8) if q[1]<=14}|rect(3,14,20,16)
    horns=poly(sc([(3,6),(0,0),(5,4)]))|poly(sc([(13,6),(16,0),(11,4)]))
    det=[(rect(6,13,9,14)|rect(14,13,17,14),GEMC),(line(12,6,12,11),TRIM[1]),(line(4,16,19,16),TRIM[0])]
    return [Part(dome,MET),Part(horns,MET,z=1,flat=3)],det
def armor():
    body=poly(sc([(3,2),(6,4),(10,4),(13,2),(14,7),(12,15),(4,15),(2,7)]))
    det=[(poly([(12,9),(15,13),(12,18),(9,13)]),GEMC),({(12,13)},(255,240,255)),(line(5,4,2,1)|line(19,4,22,1),TRIM[1]),(line(7,20,17,20),TRIM[0])]
    return [Part(body,MET)],det
def gauntlet():
    hand=poly(sc([(4,4),(11,4),(12,10),(10,14),(5,14),(3,10)]))
    claws=line(6,21,5,23)|line(11,21,11,23)|line(15,21,16,23)
    det=[(line(7,12,15,12),TRIM[1]),({(11,9),(12,9)},GEMC),(line(6,6,3,2),TRIM[1])]
    return [Part(hand,MET),Part(claws,MET,z=1,flat=4)],det
def boots():
    b1=poly(sc([(2,3),(6,3),(6,11),(8,12),(8,14),(2,14)])); b2=poly(sc([(9,3),(13,3),(13,11),(15,12),(15,14),(9,14)]))
    det=[(line(3,8,9,8)|line(14,8,20,8),TRIM[1]),({(6,14),(17,14)},GEMC),(line(3,4,1,1)|line(19,4,21,1),TRIM[1])]
    return [Part(b1,MET),Part(b2,MET,z=1)],det
def ring():
    band={q for q in ellipse(12,15,7,6.5)}-{q for q in ellipse(12,15,4.5,4)}
    gem=poly([(12,1),(16,6),(12,11),(8,6)])
    return [Part(band,MET),Part(gem,[(150,30,120),(210,60,170),(255,120,230),(255,220,250)],z=1,light=(-0.5,-0.7))],[({(11,4)},(255,250,255))]
def shield():
    sh=poly(sc([(3,1),(13,1),(14,7),(8,15),(2,7)]))
    return [Part(sh,MET)],[(poly([(12,6),(16,11),(12,16),(8,11)]),GEMC),({(12,11)},(255,240,255)),(line(5,3,19,3),TRIM[1])]
def bow():
    arc=set()
    for i in range(0,22):
        t=i/21; x=int(6+math.sin(t*math.pi)*10); arc.add((x,1+i)); arc.add((x+1,1+i))
    return [Part(arc,MET,light=(-0.7,0))],[(line(6,1,6,22),(230,214,255)),({(15,11),(16,10),(16,12)},GEMC)]
ITEMS={'demonHelmet':helmet,'demonArmor':armor,'demonGauntlet':gauntlet,'demonBoots':boots,'demonRing':ring,'demonShield':shield,'demonBow':bow}
def bolt(o,rnd,solid,cross=False):
    pts=list(solid); sx,sy=rnd.choice(pts)
    ang=rnd.uniform(0,6.283); x,y=sx+0.5,sy+0.5; path=[(x,y)]
    for _ in range(rnd.randint(3,5)):
        a=ang+rnd.choice((-1,1))*rnd.uniform(0.6,1.3); L=rnd.uniform(1.6,2.6); x+=math.cos(a)*L; y+=math.sin(a)*L; path.append((x,y))
    for layer in (0,1):
        for (x0,y0),(x1,y1) in zip(path,path[1:]):
            n=int(max(abs(x1-x0),abs(y1-y0)))+1
            for j in range(n+1):
                xx=int(round(x0+(x1-x0)*j/n)); yy=int(round(y0+(y1-y0)*j/n))
                if not (0<=xx<S and 0<=yy<S): continue
                if layer==0:
                    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                        q=(xx+dx,yy+dy)
                        if 0<=q[0]<S and 0<=q[1]<S and o[q][3]<200 and (cross or q not in solid): o[q]=(140,110,255,200)
                elif cross or (xx,yy) not in solid: o[xx,yy]=(250,248,255,255)
def frame(base,i,bolts=True):
    out=Image.new('RGBA',(S,S)); o=out.load(); b=base.load()
    solid={(x,y) for x in range(S) for y in range(S) if b[x,y][3]}
    ph=i*1.047
    for y in range(S):
        for x in range(S):
            if (x,y) in solid: continue
            d=min((abs(x-sx)+abs(y-sy) for (sx,sy) in solid if abs(x-sx)<=3 and abs(y-sy)<=3), default=9)
            if d<=3:
                a=(0.58-0.15*d)*(0.6+0.4*math.sin(ph+(x-y)*0.4))
                if a>0.04: o[x,y]=(170,90,255,int(255*a))
    out.alpha_composite(base); o=out.load()
    if bolts:
        rnd=random.Random(77+i*13)
        bolt(o,rnd,solid); bolt(o,rnd,solid,cross=(i%2==0))
    return out
pv=Image.new('RGBA',(S*7+8,S*len(ITEMS)+8),(46,42,50,255))
for j,(k,f) in enumerate(ITEMS.items()):
    parts,det=f(); base=render(S,S,parts,OUT,det)
    frame(base,0,bolts=False).save(os.path.join(IC,k+'.png'))
    st=Image.new('RGBA',(S*6,S))
    for i in range(6): st.paste(frame(base,i),(i*S,0))
    st.save(os.path.join(IC,k+'_anim.png'))
    pv.alpha_composite(frame(base,0,bolts=False),(4,4+j*S)); pv.alpha_composite(st,(4+S,4+j*S))
pv.resize((pv.width*4,pv.height*4),Image.NEAREST).save('/tmp/demongear.png')
