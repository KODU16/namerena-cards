"""绘制与现有 32 像素资产相同边距和硬边透明度的遗物图标。"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / 'assets' / 'icons32'


def canvas():
    image = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)


def save(name, image):
    image.save(OUT / (name + '.png'), optimize=True)


# 终端外壳沿用 CPU 图标的深色描边与蓝绿色高光。
image, d = canvas()
d.rounded_rectangle((3, 5, 28, 25), radius=3, fill='#203344', outline='#101c28', width=2)
d.rectangle((5, 7, 26, 21), fill='#172531', outline='#77a8b7')
d.line((8, 10, 13, 14, 8, 18), fill='#64dc8f', width=2)
d.line((15, 18, 22, 18), fill='#a1ecbc', width=2)
d.rectangle((10, 26, 22, 27), fill='#576c78')
save('relic-pl-tester', image)

# 四叶风扇置于方形 CPU 框内，亮部保持旧图标的青绿配色。
image, d = canvas()
d.rounded_rectangle((3, 3, 28, 28), radius=4, fill='#283c49', outline='#111e27', width=2)
d.ellipse((6, 6, 25, 25), fill='#577585', outline='#a1c7ce')
for box in ((14, 7, 19, 15), (18, 14, 25, 19), (13, 18, 18, 25), (7, 13, 15, 18)):
    d.ellipse(box, fill='#71c8ba', outline='#315e65')
d.ellipse((13, 13, 19, 19), fill='#d4eeca', outline='#315e65')
save('relic-cpu-fan', image)

# 灰色气团用不规则硬边像素块表示，避免与白底地图融在一起。
image, d = canvas()
for box, color in [((4, 15, 23, 26), '#697782'), ((7, 9, 27, 22), '#8b969d'), ((12, 5, 25, 16), '#aeb5b9'), ((6, 17, 19, 25), '#b9c0c4')]:
    d.ellipse(box, fill=color)
d.ellipse((12, 12, 27, 24), outline='#4b5b64', width=2)
save('relic-heavy-spite', image)

# 乱码碎片以深蓝芯片和交错字符组成，缩至 32 像素仍可辨认。
image, d = canvas()
d.polygon([(5, 5), (25, 3), (29, 23), (10, 28), (4, 19)], fill='#314458', outline='#132533')
d.line((8, 9, 23, 7), fill='#a7d8d2', width=2)
d.line((8, 15, 13, 11, 16, 18, 22, 13), fill='#7dd6ae', width=2)
d.line((10, 21, 17, 20, 23, 23), fill='#e3c777', width=2)
d.point((6, 6), fill='#f6e4aa')
save('relic-constructor-shard', image)
# 握手纸张沿用像素描边与浅色纸面，32px 原尺寸绘制。
image, d = canvas()
d.polygon([(6, 3), (22, 3), (27, 8), (27, 28), (6, 28)], fill='#f4edce', outline='#263944')
d.polygon([(22, 3), (22, 8), (27, 8)], fill='#bac4b9', outline='#263944')
d.line((9, 10, 18, 10), fill='#899fa7')
d.polygon([(8, 16), (12, 13), (16, 15), (20, 13), (25, 17), (21, 22), (18, 23), (12, 20)], fill='#d9a372', outline='#5d4439')
d.polygon([(8, 14), (11, 15), (10, 20), (7, 19)], fill='#4c94bb', outline='#263944')
d.polygon([(23, 14), (26, 16), (25, 20), (22, 19)], fill='#4c94bb', outline='#263944')
d.line((13, 16, 16, 14, 19, 17, 17, 19, 15, 17), fill='#5d4439')
d.line((10, 25, 22, 25), fill='#899fa7')
save('relic-help-test-post', image)
# 战力币叠加真实佘山表情，金币与其余图标共用像素描边。
image, d = canvas()
d.ellipse((3, 3, 28, 28), fill='#a86e22', outline='#263944', width=2)
d.ellipse((5, 5, 25, 25), fill='#f1ca55', outline='#fff0a0', width=2)
d.line((8, 8, 12, 6), fill='#fff5bb', width=2)
badge = Image.open(OUT.parents[1] / 'tools' / 'relic-sheshan-reference.png').convert('RGBA')
badge.thumbnail((19, 19), Image.Resampling.NEAREST)
image.alpha_composite(badge, ((32-badge.width)//2, (32-badge.height)//2))
save('relic-battle-coin', image)

# tswn 的蓝底框、灰色内框与白色像素字符。
image, d = canvas()
d.rectangle((3, 4, 28, 27), fill='#2585b5', outline='#263944', width=2)
d.rectangle((6, 8, 25, 23), fill='#707c87', outline='#b4c8cf')
for x, bits in [(8, ['111','010','010']), (13,['101','111','101']), (18,['101','111','010'])]:
    for y,row in enumerate(bits):
        for dx,bit in enumerate(row):
            if bit=='1': d.rectangle((x+dx,12+y*2,x+dx,13+y*2),fill='#ffffff')
save('relic-language-pack', image)

# 依附图的蓝底、顶部白色弧面与悬垂白色圆形，以原生像素形状重绘。
image, d = canvas()
d.rectangle((3, 3, 28, 28), fill='#bfd3f7', outline='#597796')
d.polygon([(4,4),(27,4),(25,7),(22,9),(18,10),(18,12),(15,14),(13,11),(9,10),(6,7)],fill='#ffffff')
d.ellipse((12,12,22,24),fill='#ffffff')
save('relic-box-opener', image)
# 耗子尾汁保留指定名字图标，同其它遗物统一裁掉透明外边并居中缩放。
image = Image.open(OUT.parents[1] / 'tools' / 'relic-rat-tail-reference.png').convert('RGBA')
save('relic-rat-tail', image)
for path in OUT.glob('relic-*.png'):
    sprite = Image.open(path).convert('RGBA')
    bounds = sprite.getbbox()
    if bounds:
        sprite = sprite.crop(bounds)
        sprite.thumbnail((28, 28), Image.Resampling.NEAREST)
        normalized = Image.new('RGBA', (32, 32))
        normalized.alpha_composite(sprite, ((32-sprite.width)//2, (32-sprite.height)//2))
        normalized.save(path, optimize=True)
