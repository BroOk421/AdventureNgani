from px import *
from slime import BODY as SL
from bat import WING as BW, BODY as BB
from shroom import CAP as SC, SPOT
from beetle import CRYS
from golem import ROCK, GLOW, GLOW2
def gel():
    p=Part({q for q in ellipse(8,9.5,5,4.5)}|poly([(5,8),(8,2),(11,8)]),SL,8,8,5.5,6)
    return render(16,16,[p],(14,28,40),[({(6,6),(6,7),(7,5)},SL[4])])
def wing():
    pts=poly([(2,10),(6,4),(14,3),(12,7),(13,10),(9,9),(8,12),(5,10)])
    return render(16,16,[Part(pts,BW)],(18,10,24),[(line(2,10,14,3),BW[0]),(line(6,4,8,12),BW[0])])
def cap():
    c={q for q in ellipse(8,9,6.5,5) if q[1]<=10}
    st=rect(7,10,9,13)
    return render(16,16,[Part(st,[(150,120,92),(190,160,120),(222,198,156)],z=0),Part(c,SC,z=1)],(26,14,22),[({(5,6),(6,6),(10,5),(9,8)},SPOT),({(12,4)},(200,255,160))])
def shard():
    pts=poly([(8,1),(12,6),(10,14),(6,14),(4,6)])
    return render(16,16,[Part(pts,CRYS,light=(-0.8,-0.4))],(10,30,44),[(line(8,2,8,13),CRYS[3])])
def core():
    pts=poly([(4,5),(8,2),(12,4),(13,9),(10,13),(5,13),(3,9)])
    return render(16,16,[Part(pts,ROCK)],(20,16,18),[(line(6,6,9,9)|line(9,9,7,12),GLOW),({(9,6),(10,7)},GLOW2)])
def sword():
    blade=line(4,12,12,4)|line(5,12,13,4)|line(4,11,12,3)
    det=[(line(5,11,12,4),(235,240,248)),(line(2,11,6,15),(110,70,40)),(line(3,10,7,14),(150,100,60)),({(1,15),(2,15),(1,14)},(220,180,80))]
    guard=line(2,10,7,15)
    return render(16,16,[Part(blade,[(90,100,118),(140,150,168),(190,200,214),(240,244,250)],light=(-0.6,-0.6)),Part(guard,[(140,100,40),(200,160,60),(240,210,110)],z=1,flat=1)],(20,20,28),det)
def coin():
    pts=ellipse(8,8,5,5)
    return render(16,16,[Part(pts,[(150,96,20),(200,140,30),(240,190,60),(255,230,130),(255,250,210)])],(70,40,10),[(rect(7,6,8,10),(170,110,25)),({(6,5)},(255,250,210))])
ICONS={'slimeGel':gel,'batWing':wing,'glowCap':cap,'crystalShard':shard,'golemCore':core,'caveSword':sword,'goldCoin':coin}
