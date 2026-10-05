import os, importlib
from px import strip
from PIL import Image
import os as _os
OUT=_os.path.join(_os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))),'assets','mobs')+'/'
os.makedirs(OUT+'icons',exist_ok=True)
for mod,mid in [('slime','slime'),('bat','bat'),('shroom','shroom'),('beetle','beetle'),('golem','golem')]:
    m=importlib.import_module(mod)
    os.makedirs(OUT+mid,exist_ok=True)
    for k,frames in m.SHEETS.items(): strip(frames).save(OUT+mid+'/'+k+'.png')
# boss: crystal golem = golem art recoloured
import golem as G
def recolor(img):
    px=img.load(); w,h=img.size
    rock={c:i for i,c in enumerate(G.ROCK)}; dark={c:i for i,c in enumerate(G.DARK)}
    NR=[(40,30,70),(64,48,108),(94,76,150),(130,112,190),(196,180,240)]
    ND=[(30,22,52),(46,34,80),(64,50,108),(86,72,140)]
    MAP={G.GLOW:(110,240,255),G.GLOW2:(220,255,255),G.MOSS[1]:(90,210,230),G.MOSS[2]:(170,250,255),G.OUT:(14,10,26)}
    for y in range(h):
        for x in range(w):
            r,g,b,a=px[x,y]
            if not a: continue
            c=(r,g,b)
            if c in rock: px[x,y]=NR[rock[c]]+(a,)
            elif c in dark: px[x,y]=ND[dark[c]]+(a,)
            elif c in MAP: px[x,y]=MAP[c]+(a,)
    return img
os.makedirs(OUT+'golemBoss',exist_ok=True)
for k,frames in G.SHEETS.items(): strip([recolor(f.copy()) for f in frames]).save(OUT+'golemBoss/'+k+'.png')
import icons
for k,f in icons.ICONS.items(): f().save(OUT+'icons/'+k+'.png')
print(sorted(os.listdir(OUT)))
