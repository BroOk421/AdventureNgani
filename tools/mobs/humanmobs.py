"""Two more mob kinds: Dark Wizard (robed caster, staff with an orb) and Iron Soldier (helm, shield, spear). Original art."""
from px import *
import os, math
from PIL import Image
ROBE=[(30,20,60),(52,34,96),(80,56,140),(116,90,180),(160,140,220)]
SKN=[(150,110,90),(200,150,120),(230,190,160)]
STAFF=[(70,44,24),(110,72,40)]
ORB=[(120,40,160),(190,80,230),(240,170,255),(255,240,255)]
def wizard(bx,bottom,step=0,bob=0,cast=0,orb=1.0,alpha=255,dead=False):
    parts=[];det=[]
    hy=bottom-17+bob
    robe=poly([(bx-5,bottom),(bx-3,hy+3),(bx+3,hy+3),(bx+6,bottom)]); parts.append(Part(robe,ROBE,z=1))
    det.append((line(bx-4+step,bottom,bx-2+step,bottom)|line(bx+3-step,bottom,bx+5-step,bottom),ROBE[0]))
    parts.append(Part(ellipse(bx,hy,3.2,3.2),SKN,z=2))
    hat=poly([(bx-6,hy-1),(bx+6,hy-1),(bx+2,hy-4),(bx-1,hy-11+cast),(bx-3,hy-4)]); parts.append(Part(hat,ROBE,z=3))
    det.append(({(bx+1,hy),(bx-1,hy)},(255,220,90) if not dead else (40,30,50)))
    sx=bx+6+cast; parts.append(Part(line(sx,hy-3-cast,sx,bottom)|line(sx+1,hy-3-cast,sx+1,bottom),STAFF,z=0,flat=1))
    if orb>0: parts.append(Part(ellipse(sx+0.5,hy-5-cast,2.2*orb+0.5,2.2*orb+0.5),ORB,z=4,light=(-0.5,-0.7)))
    if cast>=2:
        for i in range(4): a=i*1.57+cast; det.append(({(int(sx+math.cos(a)*5),int(hy-5-cast+math.sin(a)*5))},ORB[3]))
    return render(32,32,parts,(14,8,24),det,alpha=alpha)
B=30
wiz={'idle':[wizard(14,B,0,0,0,1),wizard(14,B,0,-1,0,1.1),wizard(14,B,0,-1,0,1.2),wizard(14,B,0,0,0,1.1)],
 'move':[wizard(14,B,1,0),wizard(14,B,0,-1),wizard(15,B,-1,0),wizard(15,B,1,0),wizard(15,B,0,-1),wizard(14,B,-1,0)],
 'attack':[wizard(14,B,0,0,1,1.2),wizard(14,B,0,-1,2,1.5),wizard(14,B,0,-1,3,1.8),wizard(14,B,0,0,3,0.6),wizard(14,B,0,0,2,0.8),wizard(14,B,0,0,0,1)],
 'death':[wizard(14,B,0,1,0,0.6,dead=True)]+[wizard(14,B,0,1+i,0,0,alpha=max(50,255-i*45),dead=True) for i in range(1,6)]}
ARM=[(50,56,68),(84,92,108),(126,136,154),(172,182,198),(222,228,238)]
CLOTH_R=[(110,24,30),(160,40,44),(200,70,64)]
def soldier(bx,bottom,step=0,bob=0,thrust=0,alpha=255,dead=False):
    parts=[];det=[]
    hy=bottom-17+bob
    parts.append(Part(rect(bx-3+step,bottom-5,bx-1+step,bottom)|rect(bx+1-step,bottom-5,bx+3-step,bottom),ARM,z=0))
    parts.append(Part(rect(bx-4,hy+3,bx+4,bottom-5),ARM,z=1))
    det.append((rect(bx-4,bottom-7,bx+4,bottom-6),CLOTH_R[1]))          # tabard hem
    det.append((line(bx,hy+4,bx,bottom-8),CLOTH_R[0]))
    helm={q for q in ellipse(bx,hy,4,4) if q[1]<=hy+2}; parts.append(Part(helm,ARM,z=2))
    det.append((line(bx-2,hy,bx+3,hy),(20,20,26)))                       # visor slit
    det.append((line(bx,hy-4,bx,hy-6)|{(bx+1,hy-6)},CLOTH_R[2]))        # plume
    sh=poly([(bx-7,hy+3),(bx-3,hy+3),(bx-3,hy+10),(bx-5,hy+12),(bx-7,hy+10)]); parts.append(Part(sh,[CLOTH_R[0],CLOTH_R[1],CLOTH_R[2]],z=3))
    det.append(({(bx-5,hy+6)},(240,210,90)))
    sx=bx+5+thrust; parts.append(Part(line(sx-6,hy+6,sx+5,hy+6),STAFF,z=4,flat=1))
    parts.append(Part(poly([(sx+5,hy+4),(sx+9,hy+6),(sx+5,hy+8)]),ARM,z=4))
    if dead: det.append((line(bx-2,hy,bx+3,hy),(60,60,70)))
    return render(32,32,parts,(12,12,18),det,alpha=alpha)
sol={'idle':[soldier(13,B,0,0),soldier(13,B,0,1),soldier(13,B,0,1),soldier(13,B,0,0)],
 'move':[soldier(13,B,2,0),soldier(14,B,1,-1),soldier(14,B,-1,0),soldier(15,B,-2,0),soldier(15,B,-1,-1),soldier(14,B,1,0)],
 'attack':[soldier(13,B,0,0,-2),soldier(13,B,0,0,-3),soldier(14,B,1,0,3),soldier(14,B,1,0,5),soldier(13,B,0,0,2),soldier(13,B,0,0,0)],
 'death':[soldier(13,B,0,1,dead=True)]+[soldier(13,B,0,1,alpha=max(50,255-i*45),dead=True).rotate(-15*min(i,4),resample=Image.NEAREST,center=(13,B)) for i in range(1,6)]}
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),'assets','mobs')
rows=[]
for k,sh in (('wizard',wiz),('soldier',sol)):
    os.makedirs(os.path.join(OUT,k),exist_ok=True)
    for a,fr in sh.items(): st=strip(fr); st.save(os.path.join(OUT,k,a+'.png')); rows.append(st)
W=max(r.width for r in rows); H=sum(r.height for r in rows)
c=Image.new('RGBA',(W,H),(54,48,54,255)); y=0
for r in rows: c.alpha_composite(r,(0,y)); y+=r.height
c.resize((W*3,H*3),Image.NEAREST).save('/tmp/humanmobs.png')
