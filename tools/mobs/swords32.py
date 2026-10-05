"""Boss-drop swords, 32x32, violet with a pulsing aura (original designs; the user's reference was only a style guide).
Writes for each: <id>.png (the inventory picture) and <id>_anim.png (6-frame aura strip)."""
import math, os
from PIL import Image
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IC=os.path.join(ROOT,'assets','mobs','icons')
S=32; R2=math.sqrt(2)
def to_px(u,v,cx=8.5,cy=23.5):   # blade axis runs bottom-left -> top-right
    return cx+(u-v)/R2, cy-(u+v)/R2
def to_uv(x,y,cx=8.5,cy=23.5):
    dx,dy=x-cx,cy-y
    return (dx+dy)/R2,(dy-dx)/R2
OUT=(10,4,16)
def sword(profile, blade_pal, ridge, guard_w, guard_pal, grip_pal, gem, extra=None, length=27):
    img=Image.new('RGBA',(S,S)); px=img.load()
    for y in range(S):
        for x in range(S):
            u,v=to_uv(x+0.5,y+0.5)
            c=None
            if 0<=u<=length:                       # blade
                lo,hi=profile(u/length)
                if lo<=v<=hi:
                    t=(v-lo)/max(0.01,hi-lo)
                    mid=(lo+hi)/2
                    if abs(v-mid)<0.55 and u<length-2: c=ridge
                    else: c=blade_pal[min(len(blade_pal)-1,int(t*len(blade_pal)))]
            if -1.6<=u<0 and abs(v)<=guard_w: c=guard_pal[1] if v>0 else guard_pal[0]  # guard
            if -1.6<=u<0 and abs(v)>guard_w-1.2 and abs(v)<=guard_w: c=guard_pal[2]
            if -7.5<=u<-1.6 and abs(v)<=1.1: c=grip_pal[int((u*1.3)%2)]               # grip wrap
            if -9.6<=u<-7.5 and abs(v)<=1.8: c=gem                                   # pommel
            if c: px[x,y]=c+(255,)
    if extra: extra(px)
    # outline
    solid={(x,y) for x in range(S) for y in range(S) if px[x,y][3]}
    for (x,y) in list(solid):
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            q=(x+dx,y+dy)
            if 0<=q[0]<S and 0<=q[1]<S and q not in solid: px[q]=OUT+(255,)
    return img
def aura(base, ph, col=(190,90,255)):
    out=Image.new('RGBA',(S,S)); o=out.load(); b=base.load()
    solid={(x,y) for x in range(S) for y in range(S) if b[x,y][3]}
    for y in range(S):
        for x in range(S):
            if (x,y) in solid: continue
            d=min((abs(x-sx)+abs(y-sy) for (sx,sy) in solid if abs(x-sx)<=3 and abs(y-sy)<=3), default=9)
            if d<=3:
                a=(0.55-0.15*d)*(0.65+0.35*math.sin(ph+(x+y)*0.45))
                if a>0.04: o[x,y]=col+(int(255*a),)
    out.alpha_composite(base)
    o=out.load()
    for i in range(3):                       # sparkles drifting up the blade
        u=((ph/6.283+i/3)%1)*26; v=math.sin(ph*2+i*2)*3
        x,y=to_px(u,v); x,y=int(x),int(y)
        if 0<=x<S and 0<=y<S: o[x,y]=(255,230,255,255)
        if 0<=x+1<S and 0<=y<S and i==0: o[x+1,y]=(230,170,255,220)
    return out
OBS=[(28,12,40),(46,20,66),(70,34,98),(104,58,140),(150,96,190)]
VIO=[(72,22,120),(110,40,170),(150,70,210),(196,120,245),(236,200,255)]
GOLD=[(150,96,30),(214,160,52),(250,214,110)]
GRIP=[(60,20,40),(96,36,62)]
# 1. Demon Sword: jagged obsidian blade, violet core, an eye in the guard
def demon_profile(t):
    edge=-(2.4-1.4*t)                                   # the cutting edge: smooth, tapering
    k=(t*7)%1                                           # the back: hooked spikes, bigger near the guard
    back=1.3+(2.4*(1-t))*max(0,1-k*1.6) if t<0.86 else 1.3*(1-t)/0.14
    return edge, back
def demon_eye(px):
    x,y=to_px(3.2,-0.4); x,y=int(x),int(y)
    for (dx,dy,c) in ((0,0,(255,60,200)),(1,0,(255,140,230)),(0,1,(150,20,120)),(1,1,(255,60,200))): px[x+dx,y+dy]=c+(255,)
demon=sword(demon_profile,OBS,(210,100,250),4.2,[VIO[1],VIO[2],VIO[0]],GRIP,(255,80,200),demon_eye)
# 2. Void Cleaver: broad cleaver, flat back, a gold inlay and violet runes
def cleaver_profile(t):
    back=1.3; edge=-(1.6+3.4*min(1,t*1.6)) if t<0.86 else -(5.0*(1-t)/0.14)
    return edge, back if t<0.94 else back*(1-t)/0.06
def cleaver_runes(px):
    for u in (6,11,16):
        x,y=to_px(u,-1.8); px[int(x),int(y)]=(220,140,255,255)
    for u in range(3,22):
        x,y=to_px(u,0.6); px[int(x),int(y)]=GOLD[1]+(255,)
cleaver=sword(cleaver_profile,[(44,26,70),(70,44,108),(104,70,150),(148,108,196),(196,160,236)],(220,190,250),3.4,GOLD,GRIP,(180,90,255),cleaver_runes,length=25)
# 3. Soul Reaver: a leaf-shaped crystal blade with a bright rib, gold guard
def leaf_profile(t):
    w=1.2+2.8*math.sin(min(1,t)*math.pi*0.92)
    return -w, w
def soul_vein(px):
    for u in range(2,24,3):
        for side in (-1,1):
            x,y=to_px(u,side*1.6); px[int(x),int(y)]=(120,40,180,255)
soul=sword(leaf_profile,[(60,18,104)]+VIO,(250,230,255),3.8,GOLD,GRIP,(120,255,230),soul_vein)
for name,base in (('demonSword',demon),('voidCleaver',cleaver),('soulReaver',soul)):
    frames=[aura(base,i*1.047) for i in range(6)]
    frames[0].save(os.path.join(IC,name+'.png'))          # the inventory picture (with its aura)
    st=Image.new('RGBA',(S*6,S))
    for i,f in enumerate(frames): st.paste(f,(i*S,0))
    st.save(os.path.join(IC,name+'_anim.png'))
pv=Image.new('RGBA',(S*6+8,S*3+8),(70,64,72,255))
for j,name in enumerate(('demonSword','voidCleaver','soulReaver')):
    pv.alpha_composite(Image.open(os.path.join(IC,name+'_anim.png')),(4,4+j*S))
pv.resize((pv.width*5,pv.height*5),Image.NEAREST).save('/tmp/swords32.png')
