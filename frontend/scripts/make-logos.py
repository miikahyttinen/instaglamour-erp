"""Generate the committed logo PNGs and favicons from the local (gitignored) source JPGs.

Not part of the build. Needs Pillow, for example:

    python3 -m venv /tmp/logo-venv && /tmp/logo-venv/bin/pip install Pillow
    /tmp/logo-venv/bin/python frontend/scripts/make-logos.py [source-dir]

Reads  <source-dir>/Instaglamour-Some-1080x1080px-{white,black}.jpg
       (default source-dir: frontend/assets/, gitignored; never commit the JPGs)
Writes frontend/src/assets/brand/logo-{white,black}{,-large}.png
       frontend/public/favicon.png, frontend/public/apple-touch-icon.png
"""

import sys
from pathlib import Path

from PIL import Image, ImageOps

FRONTEND = Path(__file__).resolve().parent.parent
SRC_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else FRONTEND / 'assets'
OUT = FRONTEND / 'src' / 'assets' / 'brand'
PUBLIC = FRONTEND / 'public'

BBOX = (50, 414, 1030, 666)  # logo bounding box in the 1080x1080 source
PAD = 4  # keep anti-aliased edges
HEADER_H = 64  # 2x of a 32 px header logo
LARGE_H = 160  # 2x of an 80 px sign-in logo


def alpha_mask(variant: str) -> Image.Image:
    """Logo shape as an 8-bit alpha mask (255 = logo), with JPEG noise clipped."""
    img = Image.open(SRC_DIR / f'Instaglamour-Some-1080x1080px-{variant}.jpg').convert('L')
    if variant == 'black':
        img = ImageOps.invert(img)  # black logo on white -> bright logo on dark
    x0, y0, x1, y1 = BBOX
    img = img.crop((x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD))
    lo, hi = 24, 232
    return img.point(
        lambda p: 0 if p <= lo else 255 if p >= hi else round((p - lo) * 255 / (hi - lo))
    )


def coloured(mask: Image.Image, grey: int) -> Image.Image:
    """Flat grey (0 = black, 255 = white) + alpha, stored as a compact LA PNG."""
    return Image.merge('LA', (Image.new('L', mask.size, grey), mask))


def resize_h(img: Image.Image, height: int) -> Image.Image:
    width = round(img.width * height / img.height)
    return img.resize((width, height), Image.LANCZOS)


def favicon(mask: Image.Image, size: int) -> Image.Image:
    """White logo centred on a near-black square (wide logo, so it fills the width)."""
    square = Image.new('RGBA', (size, size), (10, 10, 10, 255))
    logo = coloured(mask, 255).convert('RGBA')
    inner = size - max(2, size // 16) * 2
    logo = logo.resize((inner, round(logo.height * inner / logo.width)), Image.LANCZOS)
    square.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    return square.convert('RGB')


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for variant, grey in (('white', 255), ('black', 0)):
        logo = coloured(alpha_mask(variant), grey)
        resize_h(logo, HEADER_H).save(OUT / f'logo-{variant}.png', optimize=True)
        resize_h(logo, LARGE_H).save(OUT / f'logo-{variant}-large.png', optimize=True)
    mask = alpha_mask('white')
    favicon(mask, 64).save(PUBLIC / 'favicon.png', optimize=True)
    favicon(mask, 180).save(PUBLIC / 'apple-touch-icon.png', optimize=True)


if __name__ == '__main__':
    main()
