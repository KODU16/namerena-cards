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


accept()
attribute_modifier()
say_and_do()
