"""Draw the three 32px relic sprites with the repository's opaque pixel palette."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'icons32'
TRANSPARENT = (0, 0, 0, 0)
INK = (32, 57, 72, 255)


def sprite(name):
    image = Image.new('RGBA', (32, 32), TRANSPARENT)
    return image, ImageDraw.Draw(image), OUT / name


def pixel_text(draw, text, x, y, color, scale=3):
    glyphs = {
        'A': ('0110', '1001', '1001', '1111', '1001'),
        'C': ('0111', '1000', '1000', '1000', '0111'),
    }
    for letter in text:
        for row, line in enumerate(glyphs[letter]):
            for col, bit in enumerate(line):
                if bit == '1':
                    draw.rectangle((x + col * scale, y + row * scale, x + (col + 1) * scale - 1, y + (row + 1) * scale - 1), fill=color)
        x += 5 * scale


def accept():
    image, draw, path = sprite('relic-accept.png')
    draw.rectangle((3, 4, 28, 27), fill=INK)
    draw.rectangle((5, 6, 26, 25), fill=(212, 238, 202, 255))
    draw.rectangle((7, 8, 24, 23), fill=(167, 216, 210, 255))
    pixel_text(draw, 'AC', 9, 11, (2, 57, 34, 255), 2)
    draw.rectangle((5, 24, 26, 25), fill=(70, 207, 144, 255))
    image.save(path)


def attribute_modifier():
    image, draw, path = sprite('relic-attribute-modifier.png')
    shield = [(10, 3), (21, 3), (26, 7), (24, 19), (16, 28), (7, 19), (5, 7)]
    draw.polygon(shield, fill=INK)
    left = [(11, 5), (15, 5), (15, 23), (9, 18), (7, 8)]
    right = [(16, 5), (20, 5), (24, 8), (22, 18), (16, 25)]
    draw.polygon(left, fill=(191, 211, 247, 255))
    draw.polygon(right, fill=(174, 181, 185, 255))
    red = (238, 18, 24, 255)
    for offset in range(0, 18, 3):
        draw.rectangle((7 + offset, 8 + offset, 10 + offset, 11 + offset), fill=red)
    draw.rectangle((8, 24, 24, 26), fill=red)
    image.save(path)


def say_and_do():
    image, draw, path = sprite('relic-say-and-do.png')
    # Blue translucent clone silhouette behind the name portrait.
    clone = (76, 148, 187, 255)
    pale = (191, 211, 247, 255)
    draw.rectangle((5, 5, 13, 13), fill=INK)
    draw.rectangle((7, 7, 11, 11), fill=pale)
    draw.rectangle((4, 15, 14, 25), fill=INK)
    draw.rectangle((6, 16, 12, 23), fill=clone)
    draw.rectangle((15, 10, 25, 20), fill=INK)
    draw.rectangle((17, 12, 23, 18), fill=pale)
    # Portrait card layered over the clone icon, with a distinct cyan name marker.
    draw.rectangle((13, 4, 28, 17), fill=INK)
    draw.rectangle((15, 6, 26, 15), fill=(252, 252, 252, 255))
    draw.rectangle((17, 7, 24, 10), fill=(124, 169, 230, 255))
    draw.rectangle((18, 11, 20, 13), fill=(49, 68, 88, 255))
    draw.rectangle((22, 11, 24, 13), fill=(49, 68, 88, 255))
    draw.rectangle((18, 14, 24, 14), fill=(49, 68, 88, 255))
    draw.rectangle((17, 20, 27, 27), fill=INK)
    draw.rectangle((19, 22, 25, 25), fill=(124, 169, 230, 255))
    image.save(path)


def extra_relics():
    """Draw the four new opaque 32px relic sprites in the same dark-outline palette."""
    image, draw, path = sprite('relic-red-underwear.png')
    draw.rectangle((5, 10, 26, 25), fill=INK); draw.rectangle((7, 12, 24, 23), fill=(201, 43, 47, 255))
    draw.rectangle((7, 10, 13, 13), fill=(255, 125, 110, 255)); draw.rectangle((18, 10, 24, 13), fill=(255, 125, 110, 255))
    draw.rectangle((14, 18, 17, 23), fill=(250, 240, 225, 255)); image.save(path)
    image, draw, path = sprite('relic-jade-hairpin.png')
    draw.line((6, 26, 24, 5), fill=INK, width=5); draw.line((7, 25, 23, 7), fill=(238, 185, 51, 255), width=2)
    draw.ellipse((16, 3, 28, 15), fill=INK); draw.ellipse((18, 5, 26, 13), fill=(76, 180, 126, 255)); image.save(path)
    image, draw, path = sprite('relic-thanks.png')
    draw.ellipse((10, 3, 22, 15), fill=INK); draw.ellipse((12, 5, 20, 13), fill=(255, 205, 64, 255))
    draw.rectangle((10, 15, 22, 22), fill=INK); draw.rectangle((12, 16, 20, 21), fill=(255, 205, 64, 255))
    draw.line((12, 18, 6, 24), fill=INK, width=4); draw.line((20, 18, 26, 24), fill=INK, width=4); image.save(path)
    image, draw, path = sprite('relic-inequality.png')
    draw.rectangle((3, 3, 24, 27), fill=INK); draw.rectangle((5, 5, 22, 25), fill=(241, 238, 232, 255))
    draw.rectangle((8, 8, 19, 14), fill=(174, 68, 70, 255)); draw.rectangle((10, 15, 17, 21), fill=(51, 57, 68, 255))
    draw.rectangle((20, 20, 30, 29), fill=INK); draw.rectangle((22, 22, 28, 27), fill=(117, 191, 151, 255)); image.save(path)


accept()
attribute_modifier()
say_and_do()
extra_relics()
