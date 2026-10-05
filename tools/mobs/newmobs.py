"""Four more mobs for the far worlds: Dire Wolf, Wisp, Sand Scorpion, Ember Imp (original art)."""
from px import *
import math
from PIL import Image
# ---------- Dire Wolf ----------
WF=[(40,40,52),(62,62,78),(92,92,110),(132,132,150),(190,190,206)]
WB=[(30,30,40),(46,46,58)]
def wolf(bx,bottom,leg=0,bob=0,head=0,mouth=0,alpha=255,dead=False):
    parts=[];det=[]
    by=bottom-9+bob
    for i,(lx,ph) in enumerate(((-7,leg),(-4,-leg),(5,-leg),(8,leg))):
        x=bx+lx; parts.append(Part(line(x,by+2,x+ph,bottom)|line(x+1,by+2,x+1+ph,bottom),WB,z=0 if i%2 else 1,flat=1))
    body=ellipse(bx,by,10,4.6); parts.append(Part(body,WF,z=2))
    tail=poly([(bx-9,by-2),(bx-15,by-6+bob),(bx-14,by-3),(bx-9,by+1)]); parts.append(Part(tail,WF,z=1))
    hx=bx+10+head; hy=by-4+bob*0.5
    parts.append(Part(ellipse(hx,hy,4.5,3.8),WF,z=3))
    snout=poly([(hx+2,hy-1),(hx+8,hy+1),(hx+8,hy+2+mouth),(hx+2,hy+3)]); parts.append(Part(snout,WF,z=4))
    ear=poly([(hx-2,hy-3),(hx-1,hy-8),(hx+1,hy-3)]); parts.append(Part(ear,WF,z=4,flat=1))
    det.append(({(hx+8,hy+1)},(20,16,18)))
    if not dead: det.append(({(hx+2,hy-1),(hx+3,hy-1)},(255,214,80)))
    else: det.append(({(hx+2,hy-1),(hx+3,hy-1)},(30,26,30)))
    if mouth: det.append((line(hx+3,hy+2+mouth,hx+7,hy+2+mouth),(240,240,236)))
    det.append((line(bx-6,by-4,bx+6,by-4),WF[3]))
    return render(32,32,parts,(16,16,22),det,alpha=alpha)
B=30
wolf_s={'idle':[wolf(14,B,0,0),wolf(14,B,0,1),wolf(14,B,0,1),wolf(14,B,0,0)],
 'move':[wolf(14,B,3,0),wolf(15,B,1,-1),wolf(15,B,-1,0),wolf(16,B,-3,0),wolf(16,B,-1,-1),wolf(15,B,1,0)],
 'attack':[wolf(13,B,0,1,-1),wolf(12,B,1,1,-2,1),wolf(15,B,3,-1,1,2),wolf(17,B,2,-1,2,3),wolf(16,B,1,0,1,1),wolf(14,B,0,0)],
 'death':[wolf(14,B,0,1,0,1,dead=True)]+[wolf(14,B,0,2+i,0,0,alpha=max(60,255-i*45),dead=True).rotate(-18*min(i,3),resample=Image.NEAREST,center=(14,B)) for i in range(1,6)]}
# ---------- Wisp ----------
WI=[(40,90,160),(70,150,220),(130,210,250),(210,245,255),(255,255,255)]
def wisp(cx,cy,ph=0,big=1.0,alpha=255,eyes=True,mouth=False):
    parts=[];det=[]
    tail=poly([(cx-5*big,cy+1),(cx-2+math.sin(ph)*2,cy+11),(cx+1,cy+6),(cx+3+math.cos(ph)*2,cy+12),(cx+5*big,cy+1)])
    parts.append(Part(tail,WI[:4],z=0,light=(0,-1)))
    parts.append(Part(ellipse(cx,cy-1,6*big,6*big),WI,z=1))
    if eyes:
        det.append(({(int(cx)-2,int(cy)-2),(int(cx)+2,int(cy)-2),(int(cx)-2,int(cy)-1),(int(cx)+2,int(cy)-1)},(20,30,70)))
    if mouth: det.append((rect(int(cx)-1,int(cy)+1,int(cx)+1,int(cy)+2),(20,30,70)))
    for i in range(3):
        a=ph+i*2.1; det.append(({(int(cx+math.cos(a)*9),int(cy-2+math.sin(a)*6))},WI[3]))
    return render(32,32,parts,(20,40,90),det,alpha=alpha)
Y=14
wisp_s={'idle':[wisp(15,Y+math.sin(i*1.57),i*1.57) for i in range(4)],
 'move':[wisp(15+(i%2),Y+math.sin(i)*1.5,i) for i in range(6)],
 'attack':[wisp(15,Y,0,1.1),wisp(15,Y,0.5,1.2,mouth=True),wisp(18,Y+1,1,1.3,mouth=True),wisp(20,Y+2,1.5,1.3,mouth=True),wisp(17,Y+1,2,1.1),wisp(15,Y,2.5)],
 'death':[wisp(15,Y-i,i,1+i*0.12,alpha=max(40,255-i*45),eyes=i<2) for i in range(6)]}
# ---------- Sand Scorpion ----------
SC=[(96,56,24),(146,92,40),(196,136,64),(232,182,104),(250,226,170)]
def scorp(bx,bottom,leg=0,tail=0,claw=0,alpha=255,dead=False):
    parts=[];det=[]
    by=bottom-5
    for i,lx in enumerate((-6,-3,0,3)):
        ph=leg if i%2 else -leg
        parts.append(Part(line(bx+lx,by+1,bx+lx-2+ph,bottom),[(70,40,18),(90,52,22)],z=0,flat=1))
    parts.append(Part(ellipse(bx,by,8,3.5),SC,z=2))
    # tail segments arching over the back
    pts=[(bx-7,by-1),(bx-11,by-5-tail),(bx-10,by-11-tail*2),(bx-5,by-14-tail*2),(bx-1+tail*2,by-12-tail)]
    for (x,y) in pts[1:]: parts.append(Part(ellipse(x,y,2.4,2.2),SC,z=3))
    sx,sy=pts[-1]; det.append((line(sx,sy,sx+3,sy+2+tail),(60,30,14)))
    # claws
    cx=bx+8+claw; parts.append(Part(ellipse(cx,by-1,3,2.2),SC,z=4)); parts.append(Part(poly([(cx+1,by-3),(cx+5,by-4-claw),(cx+3,by-1)]),SC,z=4,flat=2))
    if not dead: det.append(({(bx+5,by-2),(bx+6,by-2)},(30,10,6)))
    return render(32,32,parts,(40,20,8),det,alpha=alpha)
B=29
scorp_s={'idle':[scorp(16,B,0,0),scorp(16,B,0,1),scorp(16,B,0,1),scorp(16,B,0,0)],
 'move':[scorp(16,B,2),scorp(17,B,1,1),scorp(17,B,-1),scorp(18,B,-2),scorp(18,B,-1,1),scorp(17,B,1)],
 'attack':[scorp(15,B,0,1,0),scorp(15,B,0,2,1),scorp(16,B,1,-2,2),scorp(17,B,1,-3,3),scorp(16,B,0,-1,1),scorp(16,B,0,0)],
 'death':[scorp(16,B,2,0,dead=True)]+[scorp(16,B,(-1)**i*2,0,alpha=max(50,255-i*45),dead=True).transpose(Image.FLIP_TOP_BOTTOM).transform((32,32),Image.AFFINE,(1,0,0,0,1,-6)) for i in range(1,6)]}
# ---------- Ember Imp ----------
IM=[(90,20,20),(150,36,30),(206,64,40),(240,110,60),(255,200,120)]
def imp(bx,bottom,leg=0,bob=0,arm=0,flame=0,alpha=255,dead=False):
    parts=[];det=[]
    by=bottom-10+bob
    parts.append(Part(line(bx-2,by+4,bx-2-leg,bottom)|line(bx+2,by+4,bx+2+leg,bottom),[(60,14,14),(90,20,20)],z=0,flat=1))
    wing=poly([(bx-2,by-3),(bx-11,by-9),(bx-9,by-2),(bx-12,by+1),(bx-3,by+1)]); parts.append(Part(wing,[(70,16,24),(110,26,34),(140,40,44)],z=0))
    parts.append(Part(ellipse(bx,by,4.5,5),IM,z=2))
    hy=by-7+bob*0.3; parts.append(Part(ellipse(bx+1,hy,4.5,4),IM,z=3))
    parts.append(Part(poly([(bx-2,hy-2),(bx-4,hy-8),(bx,hy-3)])|poly([(bx+3,hy-3),(bx+5,hy-8),(bx+5,hy-2)]),[(50,20,20),(80,30,26)],z=4,flat=1))
    if not dead: det.append(({(bx+2,hy),(bx+4,hy)},(255,240,120)))
    ax,ay=bx+5+arm,by-1-arm; det.append((line(bx+3,by,ax,ay),IM[1]))
    if flame:
        f=poly([(ax,ay-1),(ax+2,ay-5-flame),(ax+4,ay-1),(ax+2,ay+1)]); parts.append(Part(f,[(220,90,30),(255,170,50),(255,230,120),(255,255,220)],z=5,light=(0,-1)))
    det.append((line(bx-4,by+3,bx-8,by+6)|{(bx-9,by+5)},IM[1]))
    return render(32,32,parts,(40,6,8),det,alpha=alpha)
B=30
imp_s={'idle':[imp(15,B,0,0,0,1),imp(15,B,0,-1,0,2),imp(15,B,0,-1,0,1),imp(15,B,0,0,0,2)],
 'move':[imp(15,B,2,0,0,1),imp(16,B,1,-1,0,1),imp(16,B,-1,0,0,2),imp(17,B,-2,0,0,1),imp(17,B,-1,-1,0,2),imp(16,B,1,0,0,1)],
 'attack':[imp(15,B,0,0,1,2),imp(15,B,0,-1,3,3),imp(16,B,1,-1,4,4),imp(17,B,1,0,5,2),imp(16,B,0,0,2,1),imp(15,B,0,0,0,1)],
 'death':[imp(15,B,0,1,dead=True)]+[imp(15,B,0,1+i,alpha=max(50,255-i*45),dead=True) for i in range(1,6)]}
ALL={'wolf':wolf_s,'wisp':wisp_s,'scorpion':scorp_s,'imp':imp_s}
if __name__=='__main__':
    import os
    OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),'assets','mobs')
    rows=[]
    for k,sh in ALL.items():
        os.makedirs(os.path.join(OUT,k),exist_ok=True)
        for a,fr in sh.items():
            st=strip(fr); st.save(os.path.join(OUT,k,a+'.png')); rows.append(st)
    W=max(r.width for r in rows); H=sum(r.height for r in rows)
    c=Image.new('RGBA',(W,H),(54,48,54,255)); y=0
    for r in rows: c.alpha_composite(r,(0,y)); y+=r.height
    c.resize((W*3,H*3),Image.NEAREST).save('/tmp/newmobs.png')
