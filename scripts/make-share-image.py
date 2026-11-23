# The 1200 x 630 share image for Open Graph and Twitter cards (public/og/rtarium-share.jpg): the façade render, darkened
# on its left under the RTARIUM logo and a line. Run once when the picture or the line changes (needs Pillow):
#   python scripts/make-share-image.py
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630

photo = Image.open(ROOT / 'public/img/client/h2.webp').convert('RGB')
scale = max(W / photo.width, H / photo.height)
photo = photo.resize((round(photo.width * scale), round(photo.height * scale)), Image.LANCZOS)
left, top = (photo.width - W) // 2, (photo.height - H) // 2
card = photo.crop((left, top, left + W, top + H))

# a dark wash from the left, so the logo and the line read over any picture
shade = Image.new('L', (W, 1))
for x in range(W):
    shade.putpixel((x, 0), int(245 * max(0.0, 1 - (x / (W * 0.78)) ** 2.5)))
card.paste(Image.new('RGB', (W, H), (8, 8, 8)), (0, 0), shade.resize((W, H)))

logo = Image.open(ROOT / 'public/brand/rtarium-logo.png').convert('RGBA')
logo = logo.resize((520, round(logo.height * 520 / logo.width)), Image.LANCZOS)
card.paste(logo, (72, 210), logo)

draw = ImageDraw.Draw(card)


def font(size):
    for name in ('arialbd.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


y = 210 + logo.height + 36
draw.rectangle((72, y, 72 + 56, y + 5), fill=(253, 208, 1))
draw.text((72, y + 26), '3D basalt reinforcement mesh', font=font(38), fill=(242, 240, 233))
draw.text((72, y + 80), 'for thin, high-performance concrete', font=font(28), fill=(242, 240, 233, 200))
draw.text((72, H - 72), 'BY HEMISPHERE ONE', font=font(20), fill=(253, 208, 1))

out = ROOT / 'public/og/rtarium-share.jpg'
out.parent.mkdir(parents=True, exist_ok=True)
card.save(out, 'JPEG', quality=86, optimize=True, progressive=True)
print(out, card.size, out.stat().st_size, 'bytes')
