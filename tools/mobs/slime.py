from px import *
OUT=(16,28,40)
BODY=[(22,58,74),(32,96,110),(48,140,140),(86,190,170),(190,250,220)]
CORE=[(20,48,64),(28,74,90),(36,92,104)]
def slime(cx, bottom, rx, ry, mouth=0, eyes=True, alpha=255, splat=0, squint=False):
    W=H=32
    cy=bottom-ry+1
    dome={p for p in ellipse(cx,cy,rx,ry) if p[1]<=bottom}
    # flat-ish base: widen bottom 2 rows
    base={(x,y) for (x,y) in ellipse(cx,bottom-1,rx+0.6,2.2) if y<=bottom}
    body=Part(dome|base,BODY,cx-1,cy-1,rx+1,ry+1,z=0)
    core=Part({p for p in ellipse(cx+1,cy+ry*0.35,rx*0.45,ry*0.32) if p in dome},CORE,flat=1,z=1,rim=False)
    det=[]
    # bubbles / gloss
    hx,hy=int(cx-rx*0.5),int(cy-ry*0.55)
    det.append(({(hx,hy+1),(hx+1,hy),(hx+2,hy)},BODY[4]))
    det.append(({(int(cx-rx*0.55),int(cy-ry*0.15))},BODY[3]))
    det.append(({(int(cx+rx*0.2),int(cy+ry*0.45))},BODY[3]))
    if eyes:
        ex=int(cx+rx*0.25); ey=int(cy-ry*0.05)
        for ox in (0,4):
            if squint: det.append(({(ex+ox,ey+1),(ex+ox+1,ey+1),(ex+ox+2,ey)},(10,20,26)))
            else:
                det.append((rect(ex+ox,ey-1,ex+ox+1,ey+1),(236,250,240)))
                det.append(({(ex+ox+1,ey),(ex+ox+1,ey+1)},(12,22,30)))
                det.append(({(ex+ox,ey-1)},(255,255,255)))
        if mouth:
            mw=2+mouth
            det.append((rect(ex,ey+3,ex+mw,ey+3+min(2,mouth)),(12,22,30)))
            det.append(({(ex+1,ey+3+min(2,mouth))},(180,60,70)))
    if splat:
        for sx in (-rx-2-splat, rx+1+splat):
            det.append(({(int(cx+sx),bottom),(int(cx+sx)+1,bottom)},BODY[2]))
    return render(W,H,[body,core],OUT,det,alpha=alpha)
B=29
idle=[slime(15,B,10,8),slime(15,B,10.5,7.5),slime(15,B,11,7),slime(15,B,10.5,7.5)]
move=[slime(15,B,11.5,6.5),slime(15,B,8.5,10),slime(16,B-4,9,9),slime(17,B-5,9.5,8.5),slime(17,B-2,9,9.5),slime(17,B,12,6)]
attack=[slime(14,B,12,6,squint=True),slime(15,B,11,7.5,mouth=1),slime(18,B,12,7,mouth=2),slime(20,B,13,7,mouth=3),slime(18,B,11.5,7.5,mouth=1),slime(16,B,10.5,7.5)]
death=[slime(15,B,12,6,squint=True),slime(15,B,13,5,squint=True),slime(15,B,14,4,eyes=False,splat=1),slime(15,B,15,3,eyes=False,splat=2,alpha=220),slime(15,B,15.5,2.4,eyes=False,splat=3,alpha=150),slime(15,B,16,2,eyes=False,splat=3,alpha=80)]
SHEETS={'idle':idle,'move':move,'attack':attack,'death':death}
