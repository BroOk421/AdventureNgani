from px import *
OUT=(10,14,26)
SHELL=[(22,30,56),(36,52,92),(56,82,130),(92,124,176),(170,200,236)]
CRYS=[(26,110,140),(52,176,200),(120,232,240),(220,255,255)]
LEG=[(18,22,38),(34,40,62)]
HEAD=[(20,26,46),(32,42,72),(50,64,104)]
def beetle(bx, bottom, step=0, bob=0, lunge=0, jaw=0, glow=0, flip=False, alpha=255, legs=True):
    W=H=32; parts=[]; det=[]
    cy=bottom-8+bob
    # legs (3 visible), alternate
    if legs:
        for i,(lx) in enumerate((-6,-1,4)):
            ph = step if i%2==0 else -step
            x0=bx+lx; 
            kx,ky=x0+ph+2,cy+5
            parts.append(Part(line(x0,cy+3,kx,ky)|line(kx,ky,x0+ph+1,bottom)|{(x0+ph+2,bottom)},LEG,z=0,flat=1))
    shell=ellipse(bx+lunge*0.5,cy,10.5,5.5)
    parts.append(Part(shell,SHELL,z=2))
    # head + mandibles at right
    hx=bx+9+lunge; hy=cy+1
    parts.append(Part(ellipse(hx,hy,3.5,3),HEAD,z=3))
    jw=jaw
    det.append((line(hx+3,hy-1,hx+6,hy-2-jw)|line(hx+3,hy+1,hx+6,hy+2+jw),(200,210,230)))
    det.append(({(hx+1,hy-1)},(120,240,255) if not glow else (230,255,255)))
    det.append((line(hx,hy-3,hx+3,hy-7),(60,76,120)))
    # shell seam
    det.append((line(bx-6+lunge*0.5,cy-1,bx+7+lunge*0.5,cy-1),SHELL[1]))
    # crystals on back
    for (ox,h,wd) in ((-5,7,2.5),(-1,9,3),(4,6,2.3)):
        x=bx+ox+lunge*0.5; top=cy-5-h
        pts=poly([(x-wd,cy-4),(x,top),(x+wd,cy-4)])
        parts.append(Part(pts,CRYS,z=4,light=(-0.8,-0.4)))
        if glow: det.append(({(int(x),int(top)+2),(int(x),int(top)+3)},CRYS[3]))
    img=render(W,H,parts,OUT,det,alpha=alpha)
    if flip:
        from PIL import Image
        img=img.transpose(Image.FLIP_TOP_BOTTOM).transform(img.size, Image.AFFINE,(1,0,0,0,1,-((H-1)-bottom) - (bottom-cy) + 2))
    return img
B=29
idle=[beetle(14,B,0,0),beetle(14,B,0,1),beetle(14,B,0,1,glow=1),beetle(14,B,0,0)]
move=[beetle(14,B,2),beetle(15,B,1,1),beetle(15,B,-1),beetle(16,B,-2),beetle(16,B,-1,1),beetle(15,B,1)]
attack=[beetle(13,B,0,0,lunge=-1,jaw=2),beetle(13,B,0,1,lunge=-2,jaw=3,glow=1),beetle(15,B,2,0,lunge=3,jaw=3,glow=1),beetle(16,B,1,0,lunge=5,jaw=0,glow=1),beetle(15,B,0,0,lunge=3,jaw=1),beetle(14,B,0,0)]
death=[beetle(14,B,2,0,jaw=3),beetle(14,B,-2,1,jaw=3),beetle(14,B,0,0,flip=True),beetle(14,B,2,0,flip=True,alpha=220),beetle(14,B,-2,0,flip=True,alpha=150),beetle(14,B,0,0,flip=True,alpha=80,legs=False)]
SHEETS={'idle':idle,'move':move,'attack':attack,'death':death}
