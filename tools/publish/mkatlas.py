import json,os,sys
from PIL import Image
src,tag,MAXH=sys.argv[1],sys.argv[2],int(sys.argv[3])
m=json.load(open(src))
items=sorted(m.items(),key=lambda kv:(-Image.open(kv[1]).size[1],kv[0]))
W=4096;atl=[];cur=[];x=y=rowh=0;idx={}
for k,p in items:
    w,h=Image.open(p).size
    if x+w>W: x=0;y+=rowh;rowh=0
    if y+h>MAXH:
        atl.append(cur);cur=[];x=y=rowh=0
    cur.append((k,p,x,y,w,h));x+=w;rowh=max(rowh,h)
if cur: atl.append(cur)
os.makedirs('packs',exist_ok=True)
names=[]
for i,a in enumerate(atl):
    H=max(e[3]+e[5] for e in a)
    im=Image.new('RGBA',(W,H),(0,0,0,0))
    for k,p,x,y,w,h in a:
        im.paste(Image.open(p).convert('RGBA'),(x,y)); idx[k]=[i,x,y,w,h]
    fn=f'packs/atlas{tag}_{i}.png'; im.save(fn,optimize=True); names.append(f'assets/packs/atlas{tag}_{i}.png')
    print(fn,im.size,os.path.getsize(fn))
json.dump({'atlases':names,'files':idx},open(f'packs/pack{tag}.json','w'))
print(len(idx))
