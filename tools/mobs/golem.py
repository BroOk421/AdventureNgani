from px import *
OUT=(20,16,18)
ROCK=[(52,46,50),(78,70,72),(108,98,96),(142,130,122),(186,174,160)]
DARK=[(40,34,38),(58,52,56),(80,72,74),(104,96,94)]
MOSS=[(46,82,46),(70,118,58),(104,150,76)]
GLOW=(255,170,70); GLOW2=(255,230,150)
def golem(bx, bottom, step=0, bob=0, arm=0, crumble=0, eyes=True, alpha=255, dust=0):
    """arm: 0 rest, 1 raised, 2 high, 3 slam forward-down"""
    W=H=48; parts=[]; det=[]
    c=crumble
    # legs
    ly=bottom
    lleg=rect(bx-8+step, ly-6, bx-3+step, ly)
    rleg=rect(bx+3-step, ly-6, bx+8-step, ly)
    parts.append(Part(lleg,DARK,z=0))
    parts.append(Part(rleg,ROCK,z=1))
    # back arm
    ty=bottom-24+bob+c
    parts.append(Part(ellipse(bx-12,ty+9+c,4,7),DARK,z=1))
    # torso boulder
    torso=poly([(bx-11,ty+4),(bx-7,ty-2),(bx+3,ty-4),(bx+11,ty),(bx+13,ty+9),(bx+10,ty+17),(bx-9,ty+18),(bx-13,ty+11)])
    parts.append(Part(torso,ROCK,bx-2,ty+5,14,12,z=2))
    # head
    hy=ty-5+c*1.5
    head=poly([(bx-2,hy-5),(bx+6,hy-6),(bx+10,hy-1),(bx+8,hy+4),(bx-1,hy+4),(bx-4,hy)])
    parts.append(Part(head,ROCK,bx+2,hy-2,8,6,z=3))
    # moss on shoulders/head
    det.append(({(x,y) for (x,y) in ellipse(bx-5,ty-1,5,1.6)} & torso, MOSS[1]))
    det.append(({(bx-4,ty-2),(bx-2,ty-2),(bx-6,ty-1)}, MOSS[2]))
    det.append(({(bx,hy-5),(bx+2,hy-6),(bx+1,hy-5)}, MOSS[1]))
    # glowing cracks
    det.append((line(bx-3,ty+6,bx+1,ty+10)|line(bx+1,ty+10,bx-1,ty+14), GLOW))
    det.append((line(bx+5,ty+3,bx+8,ty+7), GLOW))
    if eyes:
        det.append(({(bx+5,hy),(bx+6,hy),(bx+8,hy)}, GLOW2))
        det.append(({(bx+5,hy+1),(bx+6,hy+1),(bx+8,hy+1)}, GLOW))
    # front arm (big)
    if arm==0: ax,ay,fx,fy=bx+10,ty+4,bx+12,ty+17
    elif arm==1: ax,ay,fx,fy=bx+10,ty+3,bx+15,ty-3
    elif arm==2: ax,ay,fx,fy=bx+9,ty+2,bx+12,ty-9
    else: ax,ay,fx,fy=bx+11,ty+5,bx+20,ty+16
    upper=poly([(ax-3,ay-2),(ax+3,ay-2),(fx+3,fy-2),(fx-3,fy-2)]) | ellipse(ax,ay,4,4)
    parts.append(Part(upper,ROCK,z=4))
    parts.append(Part(ellipse(fx,fy+1,5,4.5),ROCK,z=5))
    det.append(({(fx-1,fy),(fx+1,fy+1)},ROCK[4]))
    for i in range(dust):
        det.append(({(fx-6+i*3,bottom),(fx-5+i*3,bottom-1)},(150,140,128)))
    if crumble:
        for i,(ox,oy) in enumerate(((-14,0),(-8,-2),(12,-1),(16,0),(4,-1))):
            if i < crumble+1:
                det.append((ellipse(bx+ox,bottom-1+oy*0.2,2.2,1.6),ROCK[2]))
    return render(W,H,parts,OUT,det,alpha=alpha)
B=45
idle=[golem(22,B,0,0),golem(22,B,0,1),golem(22,B,0,1),golem(22,B,0,0)]
move=[golem(22,B,2,0),golem(22,B,1,1),golem(23,B,0,0),golem(23,B,-2,0),golem(23,B,-1,1),golem(22,B,0,0)]
attack=[golem(22,B,0,0,arm=1),golem(22,B,0,-1,arm=2),golem(22,B,0,-1,arm=2),golem(23,B,0,2,arm=3,dust=3),golem(23,B,0,1,arm=3,dust=5),golem(22,B,0,0,arm=0)]
death=[golem(22,B,0,1,eyes=False),golem(22,B,0,2,crumble=1,eyes=False),golem(22,B,0,3,crumble=2,eyes=False),golem(22,B,0,4,crumble=3,eyes=False,alpha=220),golem(22,B,0,5,crumble=4,eyes=False,alpha=150),golem(22,B,0,6,crumble=4,eyes=False,alpha=80)]
SHEETS={'idle':idle,'move':move,'attack':attack,'death':death}
