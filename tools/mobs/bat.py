from px import *
import math
OUT=(18,10,24)
BODY=[(40,24,52),(66,38,84),(96,58,116),(134,90,150),(180,140,190)]
WING=[(46,22,58),(72,36,86),(98,54,112),(120,70,130)]
BONE=[(30,16,38)]
def wing(ax, ay, phase, side):
    # phase: -1 up, 0 spread, 1 down ; side -1 back wing (left), +1 front (right)
    s=side
    tipx=ax+s*11; tipy=ay-7+phase*9
    midx=ax+s*6; midy=ay-5+phase*6
    pts=[(ax,ay-1),(midx,midy-1),(tipx,tipy),(ax+s*9,ay+2+phase*3),(ax+s*6,ay+1+phase*2),(ax+s*4,ay+3+phase*1),(ax,ay+3)]
    return poly(pts),[ (ax,ay),(midx,midy),(tipx,tipy) ]
def bat(cx, cy, phase, mouth=False, tilt=0, alpha=255, dead=False, eyes=True):
    W=H=32
    parts=[]; det=[]
    wb,boneb=wing(cx-1,cy,phase*0.8,-1)
    wf,bonef=wing(cx+1,cy,phase,1)
    parts.append(Part(wb,WING,z=0,light=(0.2,-0.9)))
    body=ellipse(cx+tilt*0.5,cy+1,4.2,4.6)
    parts.append(Part(body,BODY,z=2))
    # ears
    ears=poly([(cx-3,cy-2),(cx-3,cy-7),(cx-0.5,cy-3)])|poly([(cx+1,cy-3),(cx+3,cy-7),(cx+3.5,cy-2)])
    parts.append(Part(ears,BODY,z=3,flat=2))
    parts.append(Part(wf,WING,z=4,light=(-0.3,-0.9)))
    # wing bones
    for (a,b) in zip(bonef,bonef[1:]): det.append((line(*a,*b),WING[0]))
    if eyes:
        ex=int(cx+tilt*0.5)+1; ey=int(cy)
        if dead:
            det.append(({(ex-2,ey),(ex,ey)},(30,16,38)))
        else:
            det.append(({(ex-2,ey),(ex+1,ey)},(255,90,70)))
            det.append(({(ex-2,ey-1),(ex+1,ey-1)},(255,190,150)))
        if mouth:
            det.append((rect(ex-1,ey+2,ex,ey+3),(30,10,20)))
            det.append(({(ex-1,ey+4),(ex,ey+4)},(240,240,230)))
        else:
            det.append(({(ex-1,ey+2)},(240,240,230)))
    # feet
    det.append(({(int(cx)-1,int(cy)+6),(int(cx)+1,int(cy)+6)},BODY[0]))
    img=render(W,H,parts,OUT,det,alpha=alpha)
    return img
Y=16
idle=[bat(15,Y,-1),bat(15,Y+1,0),bat(15,Y+2,1),bat(15,Y+1,0)]
move=[bat(15,Y,-1,tilt=1),bat(16,Y+1,0,tilt=1),bat(16,Y+2,1,tilt=1),bat(16,Y+1,0,tilt=1),bat(15,Y,-1,tilt=1),bat(15,Y+1,0,tilt=1)]
attack=[bat(14,Y-1,-1),bat(15,Y,-1,mouth=True,tilt=1),bat(18,Y+3,0,mouth=True,tilt=2),bat(20,Y+5,1,mouth=True,tilt=2),bat(18,Y+3,0,tilt=1),bat(15,Y+1,0)]
def falling(i):
    from PIL import Image
    yy=Y+2+min(i,3)*3
    img=bat(15,yy,0.6,dead=True,alpha=max(60,255-i*35))
    return img.rotate(-25*min(i,4), resample=Image.NEAREST, center=(15,yy))
death=[falling(i) for i in range(6)]
SHEETS={'idle':idle,'move':move,'attack':attack,'death':death}
