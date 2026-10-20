"""Render original typographic sharing assets using the licensed portfolio font."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / 'app/fonts/CabinetGrotesk-Variable.woff2'

def font(size, weight=b'Regular'):
    result = ImageFont.truetype(str(FONT), size)
    result.set_variation_by_name(weight)
    return result

card = Image.new('RGB', (1200, 630), '#0d0e0c')
draw = ImageDraw.Draw(card)
draw.text((80, 135), 'Akeem Adeyemi', font=font(80, b'Medium'), fill='#edeee8')
draw.text((83, 245), 'Senior full-stack engineer', font=font(34), fill='#a4a89c')
draw.text((83, 325), 'Web, mobile & SaaS products.', font=font(40), fill='#edeee8')
draw.text((83, 505), 'Frontend  /  Backend  /  Mobile', font=font(25), fill='#9aaed7')
card.save(ROOT / 'app/opengraph-image.png', optimize=True)
card.save(ROOT / 'app/twitter-image.png', optimize=True)
icon = Image.new('RGBA', (180, 180), '#0d0e0c')
draw = ImageDraw.Draw(icon)
draw.text((90, 90), 'A', font=font(120, b'Medium'), fill='#edeee8', anchor='mm')
icon.save(ROOT / 'app/apple-icon.png', optimize=True)
icon.save(ROOT / 'app/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
