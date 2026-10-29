"""Draw exact 32px merchant/chest sprites using only the existing atlas palette."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PALETTE = Image.open(ROOT / 'assets/icons-32.png').getpalette()
COLORS = [tuple(PALETTE[i:i + 3]) for i in range(3, len(PALETTE), 3)]

def color(rgb):
    # Reuse palette colors without modifying any of the existing sprites.
    return min(COLORS, key=lambda c: sum((a - b) ** 2 for a, b in zip(c, rgb))) + (255,)

C = {key: color(rgb) for key, rgb in {
    'edge': (24, 17, 26), 'shadow': (57, 28, 36), 'wood': (121, 55, 21),
    'brown': (177, 84, 27), 'light': (216, 126, 36), 'gold': (238, 171, 38),
    'shine': (255, 224, 107), 'white': (255, 248, 205), 'blue': (53, 66, 114),
    'violet': (84, 72, 135), 'cloth': (109, 95, 155), 'skin': (201, 135, 87),
    'steel': (142, 182, 213), 'silver': (215, 234, 241),
}.items()}

def canvas():
    image = Image.new('RGBA', (32, 32))
    return image, ImageDraw.Draw(image)

def chest(opened):
    image, d = canvas()
    if opened:
        d.polygon([(4, 7), (7, 4), (22, 2), (26, 5), (27, 12), (5, 15)], fill=C['edge'])
        d.polygon([(6, 7), (9, 5), (22, 4), (24, 6), (25, 10), (7, 13)], fill=C['wood'])
        d.line([(7, 7), (22, 5), (24, 7)], fill=C['light'])
        d.line([(8, 6), (9, 12)], fill=C['gold'], width=2)
        d.line([(22, 5), (23, 11)], fill=C['shine'], width=2)
        d.line([(6, 13), (25, 11)], fill=C['gold'])
    else:
        d.polygon([(3, 13), (5, 8), (8, 6), (23, 6), (27, 9), (28, 15), (3, 16)], fill=C['edge'])
        d.polygon([(5, 12), (7, 9), (10, 8), (22, 8), (25, 10), (26, 14), (5, 14)], fill=C['brown'])
        d.line([(9, 9), (22, 9)], fill=C['light'])
        d.rectangle((8, 9, 10, 14), fill=C['gold'])
        d.rectangle((22, 10, 24, 14), fill=C['gold'])
        d.point((8, 9), fill=C['white'])
    d.polygon([(3, 17), (6, 14), (25, 14), (28, 17), (28, 25), (25, 29), (6, 29), (3, 26)], fill=C['edge'])
    d.polygon([(5, 18), (7, 16), (24, 16), (26, 18), (25, 20), (7, 20)], fill=C['shadow'])
    if opened:
        for x, y in [(8, 17), (13, 16), (19, 17), (23, 16)]:
            d.rectangle((x, y, x + 3, y + 2), fill=C['gold'])
            d.line((x, y, x + 2, y), fill=C['shine'])
    d.polygon([(5, 20), (24, 20), (24, 27), (7, 27), (5, 25)], fill=C['brown'])
    d.polygon([(25, 19), (27, 18), (27, 25), (25, 27)], fill=C['wood'])
    d.line((6, 22, 23, 22), fill=C['wood'])
    d.line((7, 25, 23, 25), fill=C['wood'])
    d.line((6, 21, 23, 21), fill=C['light'])
    for x in (8, 21):
        d.rectangle((x - 1, 20, x + 2, 27), fill=C['edge'])
        d.rectangle((x, 20, x + 1, 27), fill=C['gold'])
        d.line((x, 20, x, 25), fill=C['shine'])
    d.line((7, 28, 24, 28), fill=C['gold'])
    d.rectangle((14, 19, 18, 24), fill=C['edge'])
    d.rectangle((15, 19, 17, 23), fill=C['gold'])
    d.line((15, 19, 17, 19), fill=C['white'])
    d.point((16, 21), fill=C['shadow'])
    return image

def merchant():
    image, d = canvas()
    d.polygon([(11, 4), (17, 3), (21, 7), (20, 13), (24, 17), (24, 26), (19, 29), (7, 29), (6, 24), (8, 15), (8, 8)], fill=C['edge'])
    d.polygon([(12, 5), (17, 5), (19, 8), (18, 13), (10, 13), (10, 8)], fill=C['blue'])
    d.line([(10, 9), (13, 6), (17, 6)], fill=C['cloth'])
    d.rectangle((12, 9, 17, 13), fill=C['shadow'])
    d.rectangle((12, 10, 17, 11), fill=C['skin'])
    d.point((13, 10), fill=C['edge'])
    d.point((17, 10), fill=C['edge'])
    d.polygon([(10, 14), (18, 14), (22, 18), (22, 26), (18, 27), (9, 27), (8, 23)], fill=C['violet'])
    d.line([(12, 15), (11, 21), (10, 26)], fill=C['cloth'], width=2)
    d.rectangle((9, 22, 22, 24), fill=C['wood'])
    d.rectangle((15, 22, 17, 24), fill=C['gold'])
    d.rectangle((10, 28, 13, 29), fill=C['shadow'])
    d.rectangle((18, 28, 21, 29), fill=C['shadow'])
    # Sword, whetstone and satchel make the merchant recognisable at map size.
    d.line((25, 3, 25, 23), fill=C['edge'], width=4)
    d.line((25, 4, 25, 17), fill=C['steel'], width=2)
    d.line((24, 5, 24, 16), fill=C['silver'])
    d.rectangle((22, 17, 28, 19), fill=C['edge'])
    d.line((23, 18, 27, 18), fill=C['gold'])
    d.line((25, 20, 25, 24), fill=C['brown'])
    d.polygon([(4, 19), (8, 18), (12, 21), (12, 27), (9, 29), (4, 28), (2, 25), (2, 22)], fill=C['edge'])
    d.polygon([(4, 21), (8, 20), (10, 22), (10, 26), (8, 27), (4, 26)], fill=C['brown'])
    d.line((4, 22, 9, 22), fill=C['light'])
    d.rectangle((6, 22, 7, 24), fill=C['gold'])
    return image

if __name__ == '__main__':
    for key, image in [('chest', chest(False)), ('chest-open', chest(True)), ('weaponMerchant', merchant())]:
        image.save(ROOT / 'assets/icons32' / (key + '.png'), optimize=True)
        print(key + ': 32x32 RGBA')
