"""Bronze / Iron / Emerald / Diamond sets in the boss gear's style, but plain (no aura, no lightning):
24px helmet/armor/gauntlet/boots icons, a 40px sword each, and worn-look overlays for every player sheet
(recoloured from the boss set's overlays in assets/sprites_gear/<piece>/)."""
import os, glob, math
from PIL import Image
import demongear as DG
import stormsword as SS
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IC=os.path.join(ROOT,'assets','mobs','icons')
SETS={ # metal dark..light (5), trim (3), gem/accent
 'bronze': ([(70,38,16),(112,64,28),(156,96,44),(198,136,70),(236,186,120)], [(130,80,36),(190,130,66),(240,196,130)], (90,200,160)),
 'iron':   ([(46,50,60),(78,84,98),(116,124,140),(160,168,184),(214,220,232)], [(96,102,116),(150,158,174),(220,226,238)], (90,150,255)),
 'emerald':([(14,60,40),(22,100,64),(36,150,96),(80,200,140),(170,240,200)], [(150,110,40),(214,170,70),(250,222,140)], (240,250,120)),
 'diamond':([(40,90,120),(70,140,180),(120,190,226),(180,230,250),(240,252,255)], [(170,180,200),(214,222,236),(255,255,255)], (120,240,255)),
}
for name,(met,trim,gem) in SETS.items():
    DG.MET[:] = met; DG.TRIM[:] = trim; DG.GEMC = gem
    for piece,fn in (('Helmet',DG.helmet),('Armor',DG.armor),('Gauntlet',DG.gauntlet),('Boots',DG.boots)):
        parts,det=fn()
        det=[(pts,(gem if c==(255,120,230) else c)) for pts,c in det]
        DG.render(DG.S,DG.S,parts,DG.OUT,det).save(os.path.join(IC,name+piece+'.png'))
    # the sword: the Storm Greatsword's blade in this metal, plain
    steel=[met[0],met[1],met[2],met[3],met[4]]
    SS.STEEL[:] = steel
    b=SS.base()
    px=b.load()
    for y in range(b.height):            # guard / fuller / gems recoloured from the violet ones
        for x in range(b.width):
            r,g,bb,a=px[x,y]
            if not a: continue
            if (r,g,bb) in ((84,60,120),(120,90,170),(180,150,230)): px[x,y]=trim[[(84,60,120),(120,90,170),(180,150,230)].index((r,g,bb))]+(a,)
            elif (r,g,bb) in ((150,90,240),(230,200,255),(170,110,255)): px[x,y]=gem+(a,)
            elif (r,g,bb)==(46,34,84): px[x,y]=met[0]+(a,)
            elif (r,g,bb)==(176,156,236): px[x,y]=met[4]+(a,)
    b.save(os.path.join(IC,name+'Sword.png'))
# worn looks: recolour the boss overlays
G=os.path.join(ROOT,'assets','sprites_gear')
DMET=[(30,14,52),(52,28,90),(82,50,138),(120,88,190),(176,150,240),(226,212,255)]
DCREST=[(120,20,90),(190,50,150),(250,110,210)]
for name,(met,trim,gem) in SETS.items():
    M=[met[0],met[0],met[1],met[2],met[3],met[4]]
    MAP={c:M[i] for i,c in enumerate(DMET)}; MAP.update({DCREST[0]:trim[0],DCREST[1]:trim[1],DCREST[2]:trim[2]})
    n=0
    for f in glob.glob(os.path.join(G,'*','*','*.png')):
        piece=f.split(os.sep)[-3]
        if piece not in ('helmet','armor','gauntlet','boots'): continue
        im=Image.open(f).convert('RGBA'); p=im.load()
        for y in range(im.height):
            for x in range(im.width):
                r,g,bb,a=p[x,y]
                if a and (r,g,bb) in MAP: p[x,y]=MAP[(r,g,bb)]+(a,)
        out=os.path.join(ROOT,'assets','sprites_gear_'+name,piece,os.path.relpath(f,os.path.join(G,piece)))
        os.makedirs(os.path.dirname(out),exist_ok=True); im.save(out); n+=1
    print(name,n)
# preview
pv=Image.new('RGBA',(4*26+44+8,4*42),(46,42,50,255))
for j,name in enumerate(SETS):
    for i,piece in enumerate(('Helmet','Armor','Gauntlet','Boots')): pv.alpha_composite(Image.open(os.path.join(IC,name+piece+'.png')),(4+i*26,4+j*42))
    pv.alpha_composite(Image.open(os.path.join(IC,name+'Sword.png')),(4*26+6,j*42))
pv.resize((pv.width*4,pv.height*4),Image.NEAREST).save('/tmp/metalsets.png')
