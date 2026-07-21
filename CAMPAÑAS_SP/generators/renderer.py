import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from .brand import Brand

def load_and_crop(path, width, height):
    img = Image.open(path).convert("RGB")
    ratio = max(width / img.width, height / img.height)
    img = img.resize((int(img.width * ratio), int(img.height * ratio)), Image.LANCZOS)
    left = (img.width - width) // 2
    top = (img.height - height) // 2
    return img.crop((left, top, left + width, top + height))

def add_gradient(img, top_intensity=0.25, bottom_intensity=0.4):
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    h = img.size[1]
    for y in range(h):
        p = y / h
        if p < top_intensity:
            a = int(220 * (1 - p / top_intensity))
        elif p < 0.5:
            a = int(50 * (1 - (p - top_intensity) / (0.5 - top_intensity)))
        elif p < 1 - bottom_intensity:
            a = int(50 + 80 * ((p - 0.5) / (1 - bottom_intensity - 0.5)))
        else:
            a = int(130 + 120 * ((p - (1 - bottom_intensity)) / bottom_intensity))
        draw.line([(0, y), (img.size[0], y)], fill=(10, 10, 10, a))
    return Image.alpha_composite(img.convert("RGBA"), overlay)

def add_gradient_left(img, width=600, max_alpha=230):
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for x in range(min(width, img.size[0])):
        a = int(max_alpha * (1 - x / width))
        draw.line([(x, 0), (x, img.size[1])], fill=(10, 10, 10, a))
    return Image.alpha_composite(img.convert("RGBA"), overlay)

def add_logo(img, size=80, x=40, y=40, center=False):
    logo = Image.open(Brand.LOGO_PATH).convert("RGBA")
    ratio = size / max(logo.width, logo.height)
    logo = logo.resize((int(logo.width * ratio), int(logo.height * ratio)), Image.LANCZOS)
    if center:
        x = (img.size[0] - logo.width) // 2
    img.paste(logo, (x, y), logo)
    return img

def text_with_shadow(draw, text, pos, font, color=Brand.MARFIL):
    x, y = pos
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            draw.text((x + dx, y + dy), text, font=font, fill=(0, 0, 0, 180))
    draw.text((x, y), text, font=font, fill=color)

def draw_badge(draw, text, pos, font=None, bg=Brand.ORO, fg=Brand.NEGRO, radius=4):
    font = font or Brand.font_cinzel(14)
    bb = draw.textbbox((0, 0), text, font=font)
    w = bb[2] - bb[0] + 24
    h = bb[3] - bb[1] + 12
    x, y = pos
    draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=bg)
    draw.text((x + 12, y + 4), text, font=font, fill=fg)
    return h

def draw_cta(draw, text, pos, font=None, bg=Brand.VERDE, fg=Brand.MARFIL, radius=8):
    font = font or Brand.font_inter(18)
    bb = draw.textbbox((0, 0), text, font=font)
    w = bb[2] - bb[0] + 48
    h = bb[3] - bb[1] + 24
    x, y = pos
    draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=bg)
    tw = draw.textbbox((0, 0), text, font=font)
    tx = x + (w - (tw[2] - tw[0])) // 2
    ty = y + (h - (tw[3] - tw[1])) // 2
    draw.text((tx, ty), text, font=font, fill=fg)
    return h

def draw_gold_lines(draw, img_size, top=40, right=40):
    draw.line([(img_size[0] - 100, top), (img_size[0] - right - 20, top)], fill=Brand.ORO, width=2)
    draw.line([(img_size[0] - right, top), (img_size[0] - right, top + 60)], fill=Brand.ORO, width=2)

def draw_gold_line_center(draw, cx, y, width=100):
    draw.line([(cx - width // 2, y), (cx + width // 2, y)], fill=Brand.ORO, width=2)

def make_radial_bg(size, center=None, max_radius=400, alpha=15):
    img = Image.new("RGB", size, Brand.NEGRO)
    draw = ImageDraw.Draw(img)
    cx, cy = center or (size[0] // 2, size[1] // 2)
    for r in range(max_radius, 0, -2):
        a = int(alpha * (r / max_radius))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(200, 164, 90, a))
    return img

def wrap_text(text, font, max_width, draw):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = current + " " + word if current else word
        w = draw.textbbox((0, 0), test, font=font)[2]
        if w <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines

def multi_text(draw, text, pos, font, color=Brand.MARFIL, max_width=None, line_spacing=8):
    x, y = pos
    lines = wrap_text(text, font, max_width, draw) if max_width else [text]
    for line in lines:
        text_with_shadow(draw, line, (x, y), font, color)
        y += font.size + line_spacing
    return y
