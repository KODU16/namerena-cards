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
