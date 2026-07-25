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

def add_gradient(img, top_intensity=0.35, bottom_intensity=0.5):
    """Gradiente vertical suave: oscuro arriba, translúcido en medio, oscuro abajo."""
    h, w = img.size[1], img.size[0]
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    # Parte superior: de fuerte a suave
    top_stop = int(h * 0.35)
    for y in range(top_stop):
        p = y / top_stop
        a = int(200 * (1 - p) ** 1.5)
        draw.line([(0, y), (w, y)], fill=(10, 10, 10, min(a, 220)))
    # Zona central: translúcida
    mid_start = int(h * 0.35)
    mid_end = int(h * 0.55)
    for y in range(mid_start, mid_end):
        p = (y - mid_start) / (mid_end - mid_start)
        a = int(20 + 30 * p)
        draw.line([(0, y), (w, y)], fill=(10, 10, 10, a))
    # Parte inferior: de suave a fuerte
    bot_start = int(h * 0.55)
    for y in range(bot_start, h):
        p = (y - bot_start) / (h - bot_start)
        a = int(50 + 200 * p ** 1.3)
        draw.line([(0, y), (w, y)], fill=(10, 10, 10, min(a, 240)))
    return Image.alpha_composite(img.convert("RGBA"), overlay)

def add_gradient_left(img, width=700, max_alpha=210):
    """Gradiente horizontal izquierda→derecha para formatos landscape."""
    w, h = img.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for x in range(min(width, w)):
        p = x / width
        a = int(max_alpha * (1 - p) ** 1.2)
        draw.line([(x, 0), (x, h)], fill=(10, 10, 10, a))
    return Image.alpha_composite(img.convert("RGBA"), overlay)

def add_logo(img, size=80, x=40, y=40, center=False):
    logo = Image.open(Brand.LOGO_PATH).convert("RGBA")
    ratio = size / max(logo.width, logo.height)
    logo = logo.resize((int(logo.width * ratio), int(logo.height * ratio)), Image.LANCZOS)
    if center:
        x = (img.size[0] - logo.width) // 2
    img.paste(logo, (x, y), logo)
    return img

def text_with_shadow(draw, text, pos, font, color=Brand.MARFIL, shadow_blur=4, shadow_offset=(2, 3)):
    """Texto con sombra suave."""
    x, y = pos
    # Sombra: offset con color negro translúcido
    for dx in range(-shadow_offset[0], shadow_offset[0] + 1):
        for dy in range(-shadow_offset[1], shadow_offset[1] + 1):
            if dx == 0 and dy == 0:
                continue
            draw.text((x + dx, y + dy), text, font=font, fill=(0, 0, 0, 140))
    # Texto principal
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

def draw_diagonal_gold(img, color=Brand.ORO, width=3):
    """Línea diagonal dorada estilo Porvenir — de arriba-centro a abajo-derecha."""
    draw = ImageDraw.Draw(img)
    w, h = img.size
    # Diagonal desde arriba-derecha hacia abajo-izquierda
    x1, y1 = int(w * 0.65), 0
    x2, y2 = int(w * 0.35), h
    draw.line([(x1, y1), (x2, y2)], fill=color, width=width)
    return img

def draw_gold_lines(draw, img_size, top=40, right=40):
    draw.line([(img_size[0] - 100, top), (img_size[0] - right - 20, top)], fill=Brand.ORO, width=2)
    draw.line([(img_size[0] - right, top), (img_size[0] - right, top + 60)], fill=Brand.ORO, width=2)

def draw_gold_line_center(draw, cx, y, width=100):
    draw.line([(cx - width // 2, y), (cx + width // 2, y)], fill=Brand.ORO, width=2)

def draw_feature_card(draw, text, pos, font=None, icon_text="", card_w=220, card_h=60):
    """Card de feature estilo Porvenir: fondo oscuro translúcido, borde dorado, icono + texto."""
    font = font or Brand.font_inter(14)
    x, y = pos
    # Fondo translúcido con borde dorado
    draw.rounded_rectangle([x, y, x + card_w, y + card_h], radius=8,
                           fill=(10, 10, 10, 180), outline=Brand.ORO, width=1)
    # Icono (carácter dorado)
    if icon_text:
        icon_font = Brand.font_inter(18)
        draw.text((x + 14, y + 18), icon_text, font=icon_font, fill=Brand.ORO)
    # Texto
    tx = x + 40 if icon_text else x + 15
    draw.text((tx, y + 20), text.upper(), font=font, fill=Brand.MARFIL)

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
