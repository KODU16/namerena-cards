"""皇冠沿用共用图集的颜色和深色描边，先绘制 128px 再缩为 32px。"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
palette = Image.open(ROOT / 'assets/icons-32.png').getpalette()
colors = [tuple(palette[i:i+3]) for i in range(3, len(palette), 3)]


def color(rgb):
    # 沿用已有调色板，图集重建不引入额外颜色。
    return min(colors, key=lambda c: sum((a-b)**2 for a,b in zip(c,rgb))) + (255,)


im = Image.new('RGBA', (128, 128))
d = ImageDraw.Draw(im)
C = {k: color(v) for k,v in {'edge':(33,30,35),'shadow':(135,74,22),'gold':(235,170,36),'shine':(255,224,107),'light':(255,248,205),'red':(213,55,53),'blue':(45,129,177)}.items()}


def polygon(points, fill):
    d.polygon([(x*4,y*4) for x,y in points], fill=C[fill])


def rect(box, fill):
    x,y,r,b=box
    d.rectangle((x*4,y*4,(r+1)*4-1,(b+1)*4-1), fill=C[fill])


# 三座冠尖、金色冠带和红蓝宝石，保留两像素透明边距。
polygon([(3,8),(8,12),(12,8),(15,3),(17,3),(20,8),(24,12),(28,8),(26,24),(24,28),(7,28),(5,24)],'edge')
polygon([(5,10),(9,15),(13,11),(16,6),(19,11),(23,15),(26,11),(24,23),(7,23)],'gold')
polygon([(5,10),(9,15),(13,11),(16,6),(16,18),(7,20)],'shine')
rect((7,22,24,25),'shadow')
rect((8,22,23,23),'gold')
rect((8,26,23,26),'shine')
rect((15,16,17,20),'edge')
rect((15,16,16,19),'red')
rect((15,16,15,16),'light')
rect((8,18,10,20),'blue')
rect((22,18,24,20),'blue')
rect((15,4,16,5),'shine')
im.resize((32,32), Image.Resampling.NEAREST).save(ROOT/'assets/icons32/crown.png', optimize=True)
