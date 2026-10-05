from px import *
OUT=(26,14,22)
CAP=[(92,24,52),(140,38,70),(188,62,88),(226,110,118),(250,180,170)]
SPOT=(246,226,196)
STEM=[(150,120,92),(190,160,120),(222,198,156),(240,224,186)]
FOOT=[(90,60,46),(120,84,62)]
def shroom(bx, bottom, bob=0, step=0, lean=0, captilt=0, mouth=False, spores=0, alpha=255, capoff=None, squash=0, eyes='angry'):
    W=H=32; parts=[]; det=[]
    # feet
    fy=bottom
    lf=(bx-3+(step if step>0 else 0), fy); rf=(bx+2-(step if step<0 else 0)+ (0), fy)
    if step: lf=(bx-3+step,fy); rf=(bx+2-step,fy)
    for (x,y) in (lf,rf):
        parts.append(Part(rect(x,y-1,x+2,y),FOOT,z=0,flat=1))
    # stem body
    sb=bottom-2; st=bottom-11+squash+bob
    stem=ellipse(bx+lean*0.5,(sb+st)/2,4.6,(sb-st)/2+0.8)
    parts.append(Part(stem,STEM,z=1))
    # cap
    ccx=bx+lean+captilt*0.6; ccy=st-2+bob*0.3
    if capoff: ccx+=capoff[0]; ccy+=capoff[1]
    cap={p for p in ellipse(ccx,ccy,10.5,7) if p[1]<=ccy+2}
    capb={p for p in ellipse(ccx,ccy+2,10,2.2)}  # underside lip
    parts.append(Part(capb,[STEM[0],STEM[1],STEM[1]],z=2,flat=0))
    parts.append(Part(cap,CAP,ccx-2,ccy-2,11,8,z=3))
    for (sx,sy,r) in ((-5,-3,1.6),(1,-5,1.4),(5,-1,1.2),(-1,0,1.0)):
        det.append(({p for p in ellipse(ccx+sx,ccy+sy,r,r*0.9) if p in cap},SPOT))
    # face (on stem, facing right)
    if capoff is None or capoff[1]<4:
        fx=int(bx+lean*0.5)+1; fy2=int(sb-5+bob*0.5)
        if eyes=='angry':
            for ox in (0,3):
                det.append(({(fx+ox,fy2),(fx+ox,fy2+1)},(30,18,22)))
                det.append(({(fx+ox,fy2)},(255,250,240)))
            det.append(({(fx-1,fy2-1),(fx,fy2-1),(fx+3,fy2-1),(fx+4,fy2-1)},(90,56,44)))
        elif eyes=='x':
            for ox in (0,3): det.append(({(fx+ox-1,fy2-1),(fx+ox+1,fy2+1),(fx+ox,fy2),(fx+ox+1,fy2-1),(fx+ox-1,fy2+1)},(30,18,22)))
        if mouth: det.append((rect(fx,fy2+3,fx+3,fy2+3),(60,20,30)))
    for i in range(spores):
        import math
        a=i*1.7; r=4+i*1.5
        det.append(({(int(ccx+8+math.cos(a)*r),int(ccy+2+math.sin(a)*r*0.6))},(190,240,140)))
    return render(W,H,parts,OUT,det,alpha=alpha)
B=29
idle=[shroom(15,B,0),shroom(15,B,1),shroom(15,B,1,squash=1),shroom(15,B,0)]
move=[shroom(15,B,0,step=2),shroom(15,B,-1,step=1),shroom(15,B,0,step=-1),shroom(17,B,0,step=-2),shroom(17,B,-1,step=-1),shroom(15,B,0,step=1)]
attack=[shroom(15,B,1,lean=-2,squash=1),shroom(15,B,1,lean=-3,captilt=-2,squash=2),shroom(15,B,-1,lean=3,captilt=3,mouth=True),shroom(17,B,0,lean=4,captilt=4,mouth=True,spores=4),shroom(15,B,0,lean=2,captilt=2,spores=6),shroom(15,B,0,spores=3)]
death=[shroom(15,B,1,squash=1,eyes='x'),shroom(15,B,1,squash=3,eyes='x',captilt=3),shroom(15,B,2,squash=4,eyes='x',capoff=(2,2)),shroom(15,B,2,squash=5,eyes='x',capoff=(3,4),alpha=220),shroom(15,B,2,squash=6,eyes='x',capoff=(4,5),alpha=150),shroom(15,B,2,squash=6,eyes='x',capoff=(4,5),alpha=80)]
SHEETS={'idle':idle,'move':move,'attack':attack,'death':death}
