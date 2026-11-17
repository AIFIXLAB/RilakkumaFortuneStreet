import json, numpy as np
from PIL import Image, ImageDraw
U='/mnt/user-data/uploads/'; Z='/home/claude/view/'
OUT='/home/claude/game/assets/'
S={
 'chars':(U+'932b51d8-image.png',0.5,('grid',4,2)),
 'cozy':(Z+'z10.png',0.5,('grid',4,2)),
 'extra':(Z+'z9.png',0.5,('grid',4,2)),
 'lvl':(U+'b1b615a3-image.png',0.6,('proj',)),
 'bld':(U+'a829e798-image.png',0.5,('proj',)),
 'dice':(U+'7dd8d54e-image.png',0.4,('proj',)),
 'ui':(U+'70f52d7b-image.png',0.6,('proj',)),
 'spc':(Z+'z5.png',0.6,('proj',)),
 'deco':(Z+'z6.png',0.8,('proj',)),
 'rec':(Z+'z8.png',0.6,('proj',)),
 'items':(Z+'z11.png',0.7,('proj',)),
 'card1':(Z+'z1.png',0.5,('grid',5,5)),'card2':(Z+'z2.png',0.5,('grid',5,5)),
 'card3':(Z+'z3.png',0.5,('grid',5,5)),'card4':(Z+'z4.png',0.5,('grid',5,5)),
}
def runs(v,gap=2):
    out=[];s=None;z=0
    for i,x in enumerate(v):
        if x:
            if s is None: s=i
            z=0
        else:
            if s is not None:
                z+=1
                if z>=gap: out.append((s,i-z+1)); s=None; z=0
    if s is not None: out.append((s,len(v)))
    return out
def trim(a,x0,y0,x1,y1):
    sub=a[y0:y1,x0:x1]
    ys=np.where(sub.any(1))[0]; xs=np.where(sub.any(0))[0]
    if len(ys)==0: return None
    return [x0+xs[0],y0+ys[0],xs[-1]-xs[0]+1,ys[-1]-ys[0]+1]
atlas={}
for key,(p,sc,m) in S.items():
    im=Image.open(p).convert('RGBA'); W,H=im.size
    a=np.array(im)[:,:,3]>160
    a2=np.array(im)[:,:,3]>250
    boxes=[]
    if m[0]=='grid':
        c,r=m[1],m[2]
        for j in range(r):
            for i in range(c):
                X0,Y0,X1,Y1=int(i*W/c),int(j*H/r),int((i+1)*W/c),int((j+1)*H/r)
                b=trim(a,X0,Y0,X1,Y1)
                if not key.startswith('card'):
                    from scipy import ndimage as ndi
                    sub=ndi.binary_dilation(a[Y0:Y1,X0:X1],iterations=3); lab,nl=ndi.label(sub)
                    if nl>1:
                        sizes=ndi.sum(sub,lab,range(1,nl+1)); keep=[k+1 for k,v in enumerate(sizes) if v>=sizes.max()*0.08 and ndi.find_objects(lab)[k][0].start>2 or v==sizes.max()]
                        m=np.isin(lab,keep); ys=np.where(m.any(1))[0]; xs=np.where(m.any(0))[0]
                        b=[X0+xs[0],Y0+ys[0],xs[-1]-xs[0]+1,ys[-1]-ys[0]+1]
                if key.startswith('card'): b=[int(i*W/c),int(j*H/r),int(W/c),int(H/r)]
                boxes.append(b)
    else:
        for (y0,y1) in runs(a2.sum(1)>W*0.02,3):
            for (x0,x1) in runs(a2[y0:y1].sum(0)>(y1-y0)*0.04,3):
                b=trim(a,x0,y0,x1,y1)
                # second pass vertical split inside
                for (yy0,yy1) in runs(a2[b[1]:b[1]+b[3],b[0]:b[0]+b[2]].sum(1)>b[2]*0.04,3):
                    bb=trim(a,b[0],b[1]+yy0,b[0]+b[2],b[1]+yy1)
                    if bb: boxes.append(bb)
        ar=np.array([b[2]*b[3] for b in boxes]); med=np.median(ar)
        boxes=[b for b in boxes if b[2]*b[3]>med*0.25]
    sm=im.resize((int(W*sc),int(H*sc)),Image.LANCZOS); sm.save(OUT+key+'.webp','WEBP',quality=86)
    atlas[key]={'url':'assets/'+key+'.webp','W':sm.size[0],'H':sm.size[1],'b':[[int(round(v*sc)) for v in b] for b in boxes]}
    d=Image.new('RGB',im.size,'white'); d.paste(im,mask=im.split()[3]); dr=ImageDraw.Draw(d)
    for i,b in enumerate(boxes):
        dr.rectangle([b[0],b[1],b[0]+b[2],b[1]+b[3]],outline='red',width=2); dr.text((b[0]+3,b[1]+3),str(i),fill='blue',font_size=max(20,int(W/55)))
    d.thumbnail((1600,1600)); d.save(Z+'c_'+key+'.png'); print(key,len(boxes))
json.dump(atlas,open('/home/claude/game/atlas.json','w'))
# ---- manual fixes
def trimrect(path,rects,sc):
    im=Image.open(path).convert('RGBA'); a=np.array(im)[:,:,3]>160
    return [[int(round(v*sc)) for v in trim(a,*r)] for r in rects]
uin={'roll':(10,140,285,300),'manage':(285,140,475,300),'stock':(475,140,650,300),'bankb':(650,140,815,300),'event':(815,140,1015,300),'casino':(1020,140,1195,300),'endturn':(1200,100,1470,300)}
bx=trimrect(U+'70f52d7b-image.png',[ (r[0],r[1],r[2],r[3]) for r in uin.values()],0.6)
atlas['ui']['n']=dict(zip(uin.keys(),bx))
# deco grid rows 0-4
ys=[(0,145),(145,285),(285,405),(405,535),(535,675)]
rects=[]
W=1536
for (y0,y1) in ys:
    for i in range(10): rects.append((int(i*W/10),y0,int((i+1)*W/10),y1))
atlas['deco']['b']=trimrect(Z+'z6.png',rects,0.8)
json.dump(atlas,open('/home/claude/game/atlas.json','w'))
print(atlas['ui']['n'])
