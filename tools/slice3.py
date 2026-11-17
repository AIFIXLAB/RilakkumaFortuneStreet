# Component-aware sprite extraction: each sprite is cut along its own alpha outline (no rectangular chops,
# no neighbour leakage) and re-packed into new atlas sheets.
import json, re, numpy as np, sys
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
U='/mnt/user-data/uploads/'; Z='/home/claude/view/'; OUT='/home/claude/game/assets/'
SRC={'chars':(U+'932b51d8-image.png',0.5),'cozy':(Z+'z10.png',0.5),'extra':(Z+'z9.png',0.5),'lvl':(U+'b1b615a3-image.png',0.6),
 'bld':(U+'a829e798-image.png',0.5),'dice':(U+'7dd8d54e-image.png',0.45),'ui':(U+'70f52d7b-image.png',0.6),'spc':(Z+'z5.png',0.6),
 'deco':(Z+'z6.png',0.8),'rec':(Z+'z8.png',0.6),'items':(Z+'z11.png',0.7),
 'card1':(Z+'z1.png',0.5),'card2':(Z+'z2.png',0.5),'card3':(Z+'z3.png',0.5),'card4':(Z+'z4.png',0.5)}
old=json.loads(re.search(r'var ATLAS=(\{.*\});',open('/home/claude/game/atlas.js').read()).group(1))
def refine(a, lab, box, keepfrac=0.5):
    x,y,w,h=box; sub=lab[y:y+h,x:x+w]; ids,cnt=np.unique(sub[sub>0],return_counts=True)
    keep=[]
    for i,c in zip(ids,cnt):
        tot=(lab==i).sum() if True else 0
        if (c/tot>=keepfrac or c>0.25*w*h) and c>40: keep.append(i)
    if not keep: return None
    m=np.isin(lab,keep)&a
    ys=np.where(m.any(1))[0]; xs=np.where(m.any(0))[0]
    bb=[xs[0],ys[0],xs[-1]+1,ys[-1]+1]
    if (bb[2]-bb[0])>w*1.3+20 or (bb[3]-bb[1])>h*1.3+20:   # sprites touch each other: stay inside the box
        m2=np.zeros_like(a); m2[y:y+h,x:x+w]=a[y:y+h,x:x+w]
        return m2,[x,y,x+w,y+h]
    return m, bb
def run(keys, extra_boxes=None, debug=False):
    sprites={}
    for key in keys:
        p,sc=SRC[key]; im=Image.open(p).convert('RGBA'); A=np.array(im); a=A[:,:,3]>30
        lab,n=ndi.label(ndi.binary_dilation(a,iterations=1 if key=='ui' else 3))
        labA=np.where(a,lab,0)
        osc=old[key]['W']/im.size[0]
        boxes=[[int(round(v/osc)) for v in b] for b in old[key]['b']]
        if key=='ui':
            NAMED=json.load(open('/home/claude/view/ui_named.json')); NK=list(NAMED); boxes=boxes+[NAMED[k] for k in NK]
        out=[]
        for b in boxes:
            r=refine(a,lab,b)
            if r is None: out.append(None); continue
            m,(x0,y0,x1,y1)=r
            crop=A[y0:y1,x0:x1].copy(); crop[:,:,3]=np.where(m[y0:y1,x0:x1],crop[:,:,3],0)
            img=Image.fromarray(crop).resize((max(1,int((x1-x0)*sc)),max(1,int((y1-y0)*sc))),Image.LANCZOS)
            out.append(img)
        sprites[key]=out
        if debug:
            d=Image.new('RGB',im.size,'white'); d.paste(im,mask=im.split()[3]); dr=ImageDraw.Draw(d)
            for i,b in enumerate(boxes): dr.rectangle([b[0],b[1],b[0]+b[2],b[1]+b[3]],outline='red',width=2); dr.text((b[0]+3,b[1]+3),str(i),fill='blue',font_size=24)
            d.thumbnail((1600,1600)); d.save(Z+'c3_'+key+'.png')
    return sprites
def pack(name, imgs, maxw=2048, pad=4):
    x=y=rowh=0; pos=[]
    for im in imgs:
        if im is None: pos.append(None); continue
        w,h=im.size
        if x+w+pad>maxw: x=0; y+=rowh+pad; rowh=0
        pos.append([x,y,w,h]); x+=w+pad; rowh=max(rowh,h)
    H=y+rowh; sheet=Image.new('RGBA',(maxw,H),(0,0,0,0))
    for im,pp in zip(imgs,pos):
        if pp: sheet.paste(im,(pp[0],pp[1]))
    sheet.save(OUT+name+'.webp','WEBP',quality=88,method=6)
    return {'url':'assets/'+name+'.webp','W':maxw,'H':H,'b':[pp if pp else [0,0,1,1] for pp in pos]}
if __name__=='__main__':
    keys=sys.argv[1].split(',') if len(sys.argv)>1 else list(SRC)
    sp=run(keys)
    atlas=dict(old)
    for k,v in sp.items():
        atlas[k]=pack(k,v)
        if k=='ui':
            NAMED=json.load(open('/home/claude/view/ui_named.json')); nb=len(old['ui']['b'])
            atlas[k]['n']={name:atlas[k]['b'][nb+i] for i,name in enumerate(NAMED)}
            atlas[k]['b']=atlas[k]['b'][:nb]
            atlas[k]['n'].update({kk:atlas[k]['n'][vv] for kk,vv in {'manage':'manage','stock':'stockmkt','bankb':'bank','event':'eventcard','casino':'casino','endturn':'endturn'}.items()})
        print(k,len(v),atlas[k]['H'])
    open('/home/claude/game/atlas.js','w').write('var ATLAS='+json.dumps(atlas,separators=(',',':'))+';if(typeof module!=="undefined")module.exports.ATLAS=ATLAS;')
