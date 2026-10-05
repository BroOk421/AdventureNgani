"""Demon set (boss-only drops), tier armours, bows, animated portal, boss recolours, blacksmith art."""
from px import *
import os, math, colorsys, glob
from PIL import Image, ImageDraw
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IC=os.path.join(ROOT,'assets','mobs','icons')
OBS=[(16,8,22),(30,14,40),(48,22,62),(70,34,88),(104,58,124)]       # obsidian / shadow
CORE=[(150,30,120),(210,60,170),(255,110,210),(255,190,240),(255,240,255)]  # violet-pink glow
OUT=(8,2,10)
def glow(pts): return Part(pts,CORE,light=(0,0),rim=False)
def d_sword():
    blade=poly([(4,12),(12,2),(14,3),(5,13)]); edge=line(5,12,13,3)
    guard=poly([(1,10),(4,8),(8,12),(6,15)]); horn=poly([(1,10),(0,6),(3,9)])|poly([(6,15),(10,16),(7,13)])
    return render(16,16,[Part(blade,OBS,light=(-0.6,-0.6)),Part(guard|horn,OBS,z=1)],OUT,[(edge,CORE[2]),(line(7,9,11,5),CORE[3]),({(4,12),(5,11)},CORE[4]),(line(2,14,3,13),(60,20,60))])
def d_helmet():
    dome={q for q in ellipse(8,9,6,6) if q[1]<=10}|rect(2,10,13,11); horns=poly([(3,6),(0,0),(5,4)])|poly([(13,6),(16,0),(11,4)])
    return render(16,16,[Part(dome,OBS),Part(horns,OBS,z=1,flat=3)],OUT,[(rect(4,9,6,10)|rect(9,9,11,10),CORE[2]),({(5,9),(10,9)},CORE[4]),(line(8,4,8,7),CORE[1])])
def d_armor():
    body=poly([(3,2),(6,4),(10,4),(13,2),(14,7),(12,15),(4,15),(2,7)])
    return render(16,16,[Part(body,OBS)],OUT,[(poly([(8,6),(11,9),(8,13),(5,9)]),CORE[1]),(poly([(8,7),(10,9),(8,12),(6,9)]),CORE[2]),({(8,9)},CORE[4]),(line(3,3,1,1)|line(13,3,15,1),OBS[3])])
def d_gauntlet():
    hand=poly([(4,4),(11,4),(12,10),(10,14),(5,14),(3,10)]); claws=line(4,14,3,16)|line(7,14,7,16)|line(10,14,11,16)
    return render(16,16,[Part(hand,OBS),Part(claws,OBS,z=1,flat=4)],OUT,[(line(5,8,10,8),CORE[2]),({(7,6),(8,6)},CORE[4]),(line(4,4,2,1),OBS[3])])
def d_ring():
    band={q for q in ellipse(8,10,5,4.6)}-{q for q in ellipse(8,10,3,2.8)}
    gem=poly([(8,0),(11,4),(8,8),(5,4)])
    return render(16,16,[Part(band,OBS),Part(gem,CORE,z=1,light=(-0.5,-0.7))],OUT,[({(7,3)},CORE[4]),(line(4,6,2,4)|line(12,6,14,4),OBS[3])])
def d_boots():
    b1=poly([(2,3),(6,3),(6,11),(8,12),(8,14),(2,14)]); b2=poly([(9,3),(13,3),(13,11),(15,12),(15,14),(9,14)])
    return render(16,16,[Part(b1,OBS),Part(b2,OBS,z=1)],OUT,[(line(2,6,6,6)|line(9,6,13,6),CORE[2]),({(4,9),(11,9)},CORE[4]),(line(2,3,1,1)|line(13,3,14,1),OBS[3])])
def d_shield():
    sh=poly([(3,1),(13,1),(14,7),(8,15),(2,7)])
    return render(16,16,[Part(sh,OBS)],OUT,[(poly([(8,4),(11,7),(8,11),(5,7)]),CORE[2]),({(8,7)},CORE[4]),(line(3,1,1,-1)|line(13,1,15,-1),OBS[3]),(line(4,3,12,3),OBS[3])])
def d_bow():
    arc=set()
    for i in range(0,15):
        t=i/14; x=int(4+math.sin(t*math.pi)*7); arc.add((x,1+i)); arc.add((x+1,1+i))
    string=line(4,1,4,15)
    return render(16,16,[Part(arc,OBS,light=(-0.7,0))],OUT,[(string,CORE[3]),({(10,8),(11,7),(11,9)},CORE[2]),({(4,8)},CORE[4])])
DEMON={'demonSword':d_sword,'demonHelmet':d_helmet,'demonArmor':d_armor,'demonGauntlet':d_gauntlet,'demonRing':d_ring,'demonBoots':d_boots,'demonShield':d_shield,'demonBow':d_bow}
for k,f in DEMON.items(): f().save(os.path.join(IC,k+'.png'))
# tier chest armours (match gear.py palettes)
from gear import TIERS
for t,p in TIERS.items():
    body=poly([(3,2),(6,4),(10,4),(13,2),(14,7),(12,15),(4,15),(2,7)])
    render(16,16,[Part(body,p)],(20,16,14),[(line(8,5,8,14),p[0]),(line(4,8,12,8),p[1])]).save(os.path.join(IC,t+'Armor.png'))
# bows: wood (the old art squeezed), iron, gold
BOWP={'woodBow':[(70,40,22),(110,66,36),(150,96,56),(190,134,84)],'ironBow':[(60,64,74),(96,102,116),(140,148,162),(200,206,218)],'goldBow':[(120,74,10),(180,120,20),(228,170,40),(255,226,120)]}
for k,p in BOWP.items():
    arc=set()
    for i in range(0,15):
        t=i/14; x=int(4+math.sin(t*math.pi)*7); arc.add((x,1+i)); arc.add((x+1,1+i))
    render(16,16,[Part(arc,p,light=(-0.7,0))],(20,14,10),[(line(4,1,4,15),(230,226,210))]).save(os.path.join(IC,k+'.png'))
# animated portal: 8 frames 48x56 (the swirl turns, the runes pulse)
def portal_frame(ph):
    W,H=48,56; parts=[]; det=[]
    ST=[(54,52,66),(80,78,96),(112,110,130),(150,148,170),(196,194,214)]
    parts += [Part(rect(4,14,11,54),ST),Part(rect(36,14,43,54),ST),Part(poly([(2,16),(10,6),(24,2),(38,6),(46,16),(40,18),(24,10),(8,18)]),ST,z=1)]
    inner={q for q in ellipse(24,32,12,20)}
    parts.append(Part(inner,[(60,20,110),(100,40,170),(150,80,220),(200,150,255),(240,220,255)],z=0,light=(0,0)))
    for arm in range(3):
        for i in range(26):
            a=ph+arm*2.094+i*0.32; r=1+i*0.44
            x=int(24+math.cos(a)*r*0.55); y=int(32+math.sin(a)*r)
            if (x,y) in inner: det.append(({(x,y)},(235,215,255) if i%3 else (255,255,255)))
    pulse=(150,240,255) if int(ph*2)%2 else (90,170,220)
    for (x,y) in ((7,24),(40,30),(8,40),(39,44),(24,5)): det.append(({(x,y),(x+1,y)},pulse))
    det.append((rect(2,54,45,55),(40,38,50)))
    return render(W,H,parts,(20,18,28),det)
frames=[portal_frame(i*0.785) for i in range(8)]
strip(frames).save(os.path.join(ROOT,'assets','buildings','exterior','warpPortal_anim.png'))
# bosses: dark violet-pink recolours of existing mobs, saved as their own types
def demonize(img):
    px=img.load()
    for y in range(img.height):
        for x in range(img.width):
            r,g,b,a=px[x,y]
            if not a: continue
            h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
            if v>0.82 or (s>0.5 and v>0.6): r2,g2,b2=colorsys.hsv_to_rgb(0.88,0.55,min(1,v*1.05))   # glow -> pink
            else: r2,g2,b2=colorsys.hsv_to_rgb(0.78,0.45,v*0.55)                          # body -> shadow violet
            px[x,y]=(int(r2*255),int(g2*255),int(b2*255),a)
    return img
MOBS=os.path.join(ROOT,'assets','mobs')
for src,dst in (('slime','bossSlime'),('golem','bossGolem'),('wolf','bossWolf'),('wisp','bossWisp'),('scorpion','bossScorpion'),('imp','bossImp')):
    os.makedirs(os.path.join(MOBS,dst),exist_ok=True)
    for a in ('idle','move','attack','death'):
        demonize(Image.open(os.path.join(MOBS,src,a+'.png')).convert('RGBA')).save(os.path.join(MOBS,dst,a+'.png'))
# blacksmith house: the brick cottage, dark roof, an anvil sign, smoke-dark chimney
import sys
sys.path.insert(0,os.path.join(ROOT,'tools'))
from build_shop_buildings import recolor_roof, sign
EX=os.path.join(ROOT,'assets','buildings','exterior')
bs=Image.open(os.path.join(EX,'cottageBrick.png')).convert('RGBA')
recolor_roof(bs,0.05,0.35,0.55)
anvil=Image.new('RGBA',(16,16)); d=ImageDraw.Draw(anvil)
d.polygon([(2,5),(14,5),(12,8),(10,8),(10,11),(13,13),(3,13),(6,11),(6,8),(4,8)],fill=(70,74,86,255),outline=(20,20,26,255))
d.line([(3,6),(13,6)],fill=(150,156,170,255))
anvil.save('/tmp/anvil.png')
bs.alpha_composite(sign('/tmp/anvil.png',board=((70,46,30),(98,66,40),(40,26,18))),(8,92))
bs.save(os.path.join(EX,'blacksmithShop.png'))
# preview
c=Image.new('RGBA',(8*20+20,80+70),(54,48,54,255))
for i,k in enumerate(DEMON): c.alpha_composite(Image.open(os.path.join(IC,k+'.png')),(i*20+2,2))
for i,t in enumerate(TIERS): c.alpha_composite(Image.open(os.path.join(IC,t+'Armor.png')),(i*20+2,22))
for i,k in enumerate(BOWP): c.alpha_composite(Image.open(os.path.join(IC,k+'.png')),(i*20+2,42))
for i in (0,3): c.alpha_composite(frames[i],(110+i*20,64))
c=c.resize((c.width*4,c.height*4),Image.NEAREST); c.save('/tmp/demon.png')
g=Image.new('RGBA',(32*6,32),(54,48,54,255))
for i,b in enumerate(('bossSlime','bossGolem','bossWolf','bossWisp','bossScorpion','bossImp')):
    im=Image.open(os.path.join(MOBS,b,'idle.png')).convert('RGBA'); s=im.height; fr=im.crop((0,0,s,s)).resize((32,32),Image.NEAREST); g.alpha_composite(fr,(i*32,0))
g.resize((g.width*4,g.height*4),Image.NEAREST).save('/tmp/bosses.png')
