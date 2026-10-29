"""Shrink generated originals to padded transparent 32px icons, then share a compact palette."""
import argparse,json,colorsys
from pathlib import Path
from collections import deque
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
ORDER=json.loads((ROOT/'tools/icon-manifest.json').read_text(encoding='utf-8'))['keys']
OUT=ROOT/'assets/icons32'

def optimize_palette():
    # Share 255 opaque colors across the pixel-art set; retain binary transparency separately.
    manifest=json.loads((ROOT/'tools/icon-manifest.json').read_text(encoding='utf-8'))
    keys=manifest['keys'];atlas=Image.new('RGB',(32*8,32*((len(keys)+7)//8)))
    for i,key in enumerate(keys):atlas.paste(Image.open(OUT/(key+'.png')).convert('RGB'),(i%8*32,i//8*32))
    palette=atlas.quantize(colors=255,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    for key in keys:
        source=Image.open(OUT/(key+'.png')).convert('RGBA');alpha=source.getchannel('A')
        img=source.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE).convert('RGBA');img.putalpha(alpha)
        img.save(OUT/(key+'.png'),optimize=True)

def variants(folder):
    # Change only red liquid pixels, keeping cork, glass, outline and alpha identical.
    colors={'atk':0.055,'def':0.60,'spd':0.36,'agi':0.14,'mag':0.77,'res':0.49,'wis':0.10,'mp':0.66}
    for key,hue in colors.items():
        img=Image.open(folder/'potion-hp.png').convert('RGBA');pixels=img.load()
        for y in range(img.height):
            for x in range(img.width):
                r,g,b,a=pixels[x,y];h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
                if a and (h<0.035 or h>0.91) and s>0.32 and r>g*1.35:
                    rgb=colorsys.hsv_to_rgb(hue,s,v);pixels[x,y]=tuple(round(c*255) for c in rgb)+(a,)
        img.save(folder/('potion-'+key+'.png'),optimize=True)
    # Charm shares the readable heart silhouette with HP, using a pink palette.
    img=Image.open(folder/'hp.png').convert('RGBA');pixels=img.load()
    for y in range(img.height):
        for x in range(img.width):
            r,g,b,a=pixels[x,y];h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
            if a and (h<0.06 or h>0.91) and s>0.25:
                rgb=colorsys.hsv_to_rgb(0.89,s*.75,v);pixels[x,y]=tuple(round(c*255) for c in rgb)+(a,)
    img.save(folder/'sklcharm.png',optimize=True)
def clean(img):
    img=img.convert('RGBA');w,h=img.size;alpha=img.getchannel('A').point(lambda a:255 if a>=128 else 0);img.putalpha(alpha)
    # Keep real black outline pixels; reject only isolated alpha specks and thin cell-edge seams.
    mask=alpha.load();seen=set();parts=[]
    for y in range(h):
        for x in range(w):
            if not mask[x,y] or (x,y) in seen:continue
            q=deque([(x,y)]);seen.add((x,y));part=[]
            while q:
                px,py=q.popleft();part.append((px,py))
                for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
                    if 0<=nx<w and 0<=ny<h and mask[nx,ny] and (nx,ny) not in seen:seen.add((nx,ny));q.append((nx,ny))
            parts.append(part)
    largest=max((len(p) for p in parts),default=0)
    for part in parts:
        xs=[p[0] for p in part];ys=[p[1] for p in part];pw=max(xs)-min(xs)+1;ph=max(ys)-min(ys)+1
        seam=(ph>pw*20 or pw>ph*20) and (min(xs)<8 or min(ys)<8 or max(xs)>w-9 or max(ys)>h-9)
        if len(part)<max(16,largest*.0015) or seam:
            for x,y in part:mask[x,y]=0
    img.putalpha(alpha);box=img.getbbox()
    if not box:raise ValueError('Empty sprite')
    img=img.crop(box);img.thumbnail((28,28),Image.Resampling.NEAREST)
    out=Image.new('RGBA',(32,32));out.alpha_composite(img,((32-img.width)//2,(32-img.height)//2))
    return out

def save(key,img):
    OUT.mkdir(parents=True,exist_ok=True);image=clean(img);image.save(OUT/(key+'.png'),optimize=True)
    if any(image.getpixel((x,y))[3] for x,y in [(x,0) for x in range(32)]+[(x,31) for x in range(32)]+[(0,y) for y in range(32)]+[(31,y) for y in range(32)]):raise ValueError('Nontransparent border: '+key)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--generated-dir',type=Path);p.add_argument('--variants-dir',type=Path);p.add_argument('--key');p.add_argument('--source',type=Path);a=p.parse_args()
    if a.variants_dir:variants(a.variants_dir)
    if a.generated_dir:
        for source in a.generated_dir.glob('*.png'):
            if source.stem in ORDER and not source.stem.startswith('t-'):save(source.stem,Image.open(source))
        print('Generated icons resized',flush=True)
        optimize_palette()
    if not any((a.generated_dir,a.variants_dir,a.key)):optimize_palette()
    if a.key:
        if a.key not in ORDER:p.error('Unknown icon key')
        save(a.key,Image.open(a.source));print(a.key,flush=True)
