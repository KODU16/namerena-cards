from PIL import Image

SRC = r'C:\Users\xiong\.dsh\attachments\v1\objects\a0\a0b4586beb683cbbb86742de3b32e58bd2eebf9d557da4a88b3b31c2bc435314'
OUT = r'C:\Program Files (x86)\360\360PT\namerena-ladder\namerena-cards\assets\grade-%d.png'

im = Image.open(SRC).convert('RGBA')
w, h = im.size
cw = w // 3
for i in range(3):
    crop = im.crop((i * cw, 0, (i + 1) * cw, h)).convert('RGBA')
    px = crop.load()
    for y in range(crop.size[1]):
        for x in range(crop.size[0]):
            r, g, b, a = px[x, y]
            if r > 235 and g > 235 and b > 235:
                px[x, y] = (r, g, b, 0)
    crop.save(OUT % (i + 1))
    print('saved grade-%d' % (i + 1), crop.size)
