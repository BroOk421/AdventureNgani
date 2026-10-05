# Grass on the mountain tops: plateau cells inside the rim become grass_tile
# patches. The plateau overlay is removed there; the grass tiles' open
# corners show the bare earth, which reads as the mountain's own soil.
import random
GT={(1,1,0,0):['TopGrass2'],(0,0,1,1):['BottomGrass4'],(1,0,1,0):['LeftGrass2'],(0,1,0,1):['RightGrass2'],
 (1,0,0,0):['TopGrass4'],(0,1,0,0):['TopGrass5'],(0,0,1,0):['BottomGrass1'],(0,0,0,1):['BottomGrass2'],
 (1,1,1,0):['TopGrass1','LeftGrass1'],(1,1,0,1):['TopGrass3','RightGrass1'],(1,0,1,1):['BottomGrass3','LeftGrass3'],(0,1,1,1):['BottomGrass5','RightGrass3']}
def plateau_grass(plateau, blocked, seed, coverage=0.55, blobs=None, margin=2):
    """plateau: set of walkable plateau cells. blocked: cells that must stay mountain (stairs, bridges...).
    Returns (cell -> terrain type) for every cell that becomes grass/grass edge."""
    rng=random.Random(seed)
    rng_m=range(-margin,margin+1)
    inner={(c,r) for (c,r) in plateau if all((c+a,r+b) in plateau for a in rng_m for b in rng_m) and (c,r) not in blocked}
    G=set()
    cells=sorted(inner)
    if not cells: return {}
    n=blobs or max(3,len(cells)//60)
    for _ in range(n*3):
        if len(G)>=coverage*len(inner): break
        cx,cy=rng.choice(cells); rx,ry=rng.randint(3,8),rng.randint(2,5)
        for r in range(cy-ry,cy+ry+1):
            for c in range(cx-rx,cx+rx+1):
                if ((c-cx)/rx)**2+((r-cy)/ry)**2<=1+rng.random()*0.3 and (c,r) in inner: G.add((c,r))
    # grass corners: a corner is grass when all four cells round it are grass
    def gc(vc,vr): return all((vc-a,vr-b) in G for a in (0,1) for b in (0,1))
    for _ in range(12):
        bad=[]
        for (c,r) in {(c+a,r+b) for (c,r) in G for a in (-1,0,1) for b in (-1,0,1)}:
            g=(gc(c,r),gc(c+1,r),gc(c,r+1),gc(c+1,r+1))
            if g in ((True,False,False,True),(False,True,True,False)): bad.append((c,r))
        bad=[b for b in bad if b in inner]
        if not bad: break
        G|=set(bad)
    out={}
    for (c,r) in {(c+a,r+b) for (c,r) in G for a in (-1,0,1) for b in (-1,0,1)}:
        if (c,r) not in plateau or (c,r) in blocked: continue
        g=tuple(int(gc(*v)) for v in [(c,r),(c+1,r),(c,r+1),(c+1,r+1)])
        if g==(0,0,0,0): continue
        if g==(1,1,1,1): out[(c,r)]='terrainGrassEnterGrass'+str(rng.randint(1,3))  # the lighter three — the darker ones checker
        elif g in GT: out[(c,r)]='terrainGrass'+rng.choice(GT[g])
    return out
