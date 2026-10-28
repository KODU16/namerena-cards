# 按素材实际像素边界提取评级图标，保留透明度及图标内部的白色细节。
from pathlib import Path
import argparse
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
# 素材左侧有 2px 留白，三枚图标的宽度和步长均为 19px。
BOXES = ((2, 0, 21, 20), (21, 0, 40, 20), (40, 0, 59, 20))


def main():
    parser = argparse.ArgumentParser(description="Extract the three grade icons without adjacent pixels")
    parser.add_argument("--source", type=Path, default=ROOT / "assets" / "grade-sprite.png")
    args = parser.parse_args()
    with Image.open(args.source) as source:
        if source.size != (60, 20):
            raise ValueError(f"Expected a 60x20 sprite, got {source.size}")
        source = source.convert("RGBA")
        for index, box in enumerate(BOXES, 1):
            # 精确裁切即可；不重采样、不去白色，避免损坏像素细节。
            icon = source.crop(box)
            target = ROOT / "assets" / f"grade-{index}.png"
            icon.save(target, optimize=True)
            print(f"Saved {target.name}: {icon.size}")


if __name__ == "__main__":
    main()
