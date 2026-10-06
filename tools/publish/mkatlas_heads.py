# 画像を透明の外側で切り詰めてアトラスに詰める。files[k] = [atlas, x, y, w, h, ox, oy, W, H]（元の大きさ W×H の中の ox,oy に置き直す）
import json,os,sys,glob
from PIL import Image
root,tag,out=sys.argv[1],sys.argv[2],sys.argv[3]
paths=sorted(glob.glob(os.path.join(root,'assets/sprites/heads/**/*.png'),recursive=True))
ents=[]
for p in paths:
    im=Image.open(p).convert('RGBA'); bb=im.split()[3].getbbox() or (0,0,1,1)
    bb=(max(0,bb[0]-1),max(0,bb[1]-1),min(im.width,bb[2]+1),min(im.height,bb[3]+1))
    k=os.path.relpath(p,root).replace(os.sep,'/')
    ents.append((k,im.crop(bb),bb[0],bb[1],im.width,im.height))
ents.sort(key=lambda e:(-e[1].height,e[0]))
W=4096;MAXH=4096;atl=[];cur=[];x=y=rowh=0
for e in ents:
    w,h=e[1].size
    if x+w>W: x=0;y+=rowh;rowh=0
    if y+h>MAXH: atl.append(cur);cur=[];x=y=rowh=0
    cur.append((e,x,y));x+=w;rowh=max(rowh,h)
if cur: atl.append(cur)
os.makedirs(out,exist_ok=True); idx={}; names=[]
for i,a in enumerate(atl):
    H=max(y+e[1].height for e,x,y in a)
    im=Image.new('RGBA',(W,H),(0,0,0,0))
    for e,x,y in a:
        im.paste(e[1],(x,y)); idx[e[0]]=[i,x,y,e[1].width,e[1].height,e[2],e[3],e[4],e[5]]
    fn=os.path.join(out,f'atlas{tag}_{i}.png'); im.save(fn,optimize=True); names.append(f'assets/packs/atlas{tag}_{i}.png')
    print(fn,im.size,os.path.getsize(fn))
json.dump({'atlases':names,'files':idx,'lazy':True},open(os.path.join(out,f'pack{tag}.json'),'w'))
print(len(idx))
