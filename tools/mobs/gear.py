"""Equipment icons (5 tiers x helmet/gauntlet/ring/shield/boots), 3 more swords, and the warp portal."""
from px import *
import os, colorsys
from PIL import Image
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT=os.path.join(ROOT,'assets','mobs','icons'); os.makedirs(OUT,exist_ok=True)
TIERS={ # name: metal palette (dark..light), outline
 'leather':[(70,40,22),(110,66,36),(150,96,56),(190,134,84),(226,184,130)],
 'iron':[(60,64,74),(96,102,116),(140,148,162),(190,198,210),(240,244,250)],
 'gold':[(120,74,10),(180,120,20),(228,170,40),(250,214,90),(255,244,190)],
 'mythril':[(20,70,90),(30,120,140),(60,180,190),(130,226,226),(220,255,250)],
 'dragon':[(80,10,20),(140,24,30),(196,48,40),(236,96,60),(255,190,140)],
}
GEM={'leather':(120,200,120),'iron':(120,170,255),'gold':(255,80,80),'mythril':(200,120,255),'dragon':(255,220,80)}
def helmet(p,g):
    dome={q for q in ellipse(8,8,6,6) if q[1]<=9}|rect(2,9,13,10)
    parts=[Part(dome,p)]
    det=[(rect(5,10,10,11),p[0]),(rect(7,3,8,9),p[3]),({(8,12)},p[1])]
    return render(16,16,parts,(20,16,14),det)
def gauntlet(p,g):
    hand=poly([(4,4),(11,4),(12,10),(10,14),(5,14),(3,10)])
    parts=[Part(hand,p)]
    det=[(line(5,7,10,7),p[0]),(line(5,10,10,10),p[0]),({(7,5),(8,5)},p[4])]
    return render(16,16,parts,(20,16,14),det)
def ring(p,g):
    band={q for q in ellipse(8,9,5,5)}-{q for q in ellipse(8,9,3,3)}
    parts=[Part(band,p)]
    gem=ellipse(8,4,2.4,2.2)
    parts.append(Part(gem,[tuple(max(0,c-80) for c in g),tuple(max(0,c-30) for c in g),g,(255,255,255)],z=1))
    return render(16,16,parts,(20,16,14))
def shield(p,g):
    sh=poly([(3,2),(13,2),(13,8),(8,14),(3,8)])
    parts=[Part(sh,p)]
    det=[(line(8,3,8,12),p[0]),(line(4,6,12,6),p[0]),({(8,6)},g)]
    return render(16,16,parts,(20,16,14),det)
def boots(p,g):
    b1=poly([(2,3),(6,3),(6,11),(8,12),(8,14),(2,14)]); b2=poly([(9,3),(13,3),(13,11),(15,12),(15,14),(9,14)])
    parts=[Part(b1,p),Part(b2,p,z=1)]
    det=[(line(2,5,6,5),p[0]),(line(9,5,13,5),p[0])]
    return render(16,16,parts,(20,16,14),det)
KINDS={'Helmet':helmet,'Gauntlet':gauntlet,'Ring':ring,'Shield':shield,'Boots':boots}
for t,p in TIERS.items():
    for k,f in KINDS.items():
        f(p,GEM[t]).save(os.path.join(OUT,t+k+'.png'))
# more swords: recolour the iron sword's blade
base=Image.open(os.path.join(OUT,'caveSword.png')).convert('RGBA')
for name,h,s in (('mythrilSword',0.47,0.55),('dragonSword',0.0,0.75),('celestialSword',0.75,0.45)):
    im=base.copy(); px=im.load()
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a=px[x,y]
            if not a: continue
            hh,ss,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
            if ss<0.25 and v>0.3:
                r2,g2,b2=colorsys.hsv_to_rgb(h,s,min(1,v*1.05)); px[x,y]=(int(r2*255),int(g2*255),int(b2*255),a)
    im.save(os.path.join(OUT,name+'.png'))
# the warp portal: a standing-stone arch with a swirling glow (48x56), for the far worlds
def portal():
    W,H=48,56; parts=[]; det=[]
    ST=[(54,52,66),(80,78,96),(112,110,130),(150,148,170),(196,194,214)]
    left=rect(4,14,11,54); right=rect(36,14,43,54); top=poly([(2,16),(10,6),(24,2),(38,6),(46,16),(40,18),(24,10),(8,18)])
    parts += [Part(left,ST),Part(right,ST),Part(top,ST,z=1)]
    inner={q for q in ellipse(24,32,12,20)}
    parts.append(Part(inner,[(60,20,110),(100,40,170),(150,80,220),(200,150,255),(240,220,255)],z=0,light=(0,0)))
    import math
    for i in range(40):
        a=i*0.5; r=2+i*0.42
        x=int(24+math.cos(a)*r*0.55); y=int(32+math.sin(a)*r)
        if (x,y) in inner: det.append(({(x,y)},(235,215,255)))
    det.append((rect(2,54,45,55),(40,38,50)))
    for (x,y) in ((7,24),(40,30),(8,40),(39,44),(24,5)): det.append(({(x,y),(x+1,y)},(150,240,255)))
    return render(W,H,parts,(20,18,28),det)
os.makedirs(os.path.join(ROOT,'assets','buildings','exterior'),exist_ok=True)
portal().save(os.path.join(ROOT,'assets','buildings','exterior','warpPortal.png'))
# preview
from glob import glob
fs=[os.path.join(OUT,t+k+'.png') for t in TIERS for k in KINDS]+[os.path.join(OUT,n+'.png') for n in ('mythrilSword','dragonSword','celestialSword')]
c=Image.new('RGBA',(5*20+60,6*20+60),(54,48,54,255))
for i,f in enumerate(fs): c.alpha_composite(Image.open(f),((i%5)*20+2,(i//5)*20+2))
c.alpha_composite(portal(),(105,2))
c.resize((c.width*5,c.height*5),Image.NEAREST).save('/tmp/gear.png')
