import os
from PIL import Image, ImageDraw, ImageFilter
from .brand import Brand
from .renderer import (
    load_and_crop, add_gradient, add_logo, text_with_shadow,
    draw_badge, draw_cta, draw_gold_line_center, draw_gold_lines,
    make_radial_bg, draw_feature_card
)

W, H = 1080, 1080

def generar_todas(project, out_dir):
    slides = [
        ("slide-01-portada", gen_slide_portada),
        ("slide-02-ubicacion", gen_slide_ubicacion),
        ("slide-03-beneficios", gen_slide_beneficios),
        ("slide-04-precio", gen_slide_precio),
        ("slide-05-caracteristicas", gen_slide_caracteristicas),
        ("slide-06-cta", gen_slide_cta),
    ]
    total = len(slides)
    for i, (name, func) in enumerate(slides, 1):
        img = func(project, i, total)
        if img:
            img.save(os.path.join(out_dir, f"{name}.png"), "PNG", quality=95)

def add_pagination(draw, current, total):
    text_with_shadow(draw, f"{current} / {total}", (W - 120, H - 50), Brand.font_inter(14), Brand.GRIS)

def gen_slide_portada(project, idx, total):
    path = project.get_image("destacado")
    if path:
        img = load_and_crop(path, W, H)
        img = add_gradient(img, 0.25, 0.4)
    else:
        img = make_radial_bg((W, H), (W // 2, H // 2 - 100), 450, 18)
    draw = ImageDraw.Draw(img)
    add_logo(img, 130, (W - 130) // 2, 140, center=True)
    draw_gold_line_center(draw, W // 2, 350, 80)
    text_with_shadow(draw, project.name.upper(), (80, 380), Brand.font_cinzel(56), shadow_blur=6)
    if project.location:
        lines = project.location.split(",")
        y = 460
        for line in lines:
            text_with_shadow(draw, line.strip(), (80, y), Brand.font_cinzel(28), Brand.ORO, shadow_blur=3)
            y += 40
        y += 10
        draw_gold_line_center(draw, W // 2, y, 80)
        y += 20
        text_with_shadow(draw, "SP LEONS GROUP", (W // 2 - 130, y), Brand.font_inter(16), Brand.ORO)
    add_pagination(draw, idx, total)
    return img

def gen_slide_ubicacion(project, idx, total):
    path = project.get_image("ubicacion") or project.get_image("destacado")
    if not path:
        return None
    img = load_and_crop(path, W, H)
    img = add_gradient(img, 0.3, 0.35)
    draw = ImageDraw.Draw(img)
    add_logo(img, 65, 40, 35)
    draw_gold_lines(draw, img.size)
    y = H - 200
    draw_badge(draw, "UBICACIÓN", (60, y), Brand.font_cinzel(14))
    y += 50
    text_with_shadow(draw, project.location or "UBICACIÓN PRIVILEGIADA", (60, y), Brand.font_cinzel(38), shadow_blur=6)
    y += 50
    if project.highlights:
        text_with_shadow(draw, "  ·  ".join(project.highlights[:2]), (60, y), Brand.font_inter(15), Brand.GRIS)
        y += 30
    draw_cta(draw, "CONOCE LA UBICACIÓN", (60, y + 10), Brand.font_inter(15), max_y=H - 40)
    add_pagination(draw, idx, total)
    return img

def gen_slide_beneficios(project, idx, total):
    path = project.get_image("beneficios") or project.get_image("destacado")
    if path:
        img = load_and_crop(path, W, H)
        img = add_gradient(img, 0.2, 0.5)
    else:
        img = make_radial_bg((W, H), (W // 2, 150), 400, 12)
    draw = ImageDraw.Draw(img)
    add_logo(img, 60, 40, 30)
    draw_gold_lines(draw, img.size)
    y = 120
    draw_badge(draw, "BENEFICIOS", (60, y), Brand.font_cinzel(14))
    y += 50
    text_with_shadow(draw, "¿Por qué invertir aquí?", (60, y), Brand.font_cinzel(36), shadow_blur=6)
    features = (project.features or ["Urbanizado", "Vía pavimentada", "Escritura pública", "Portería"])[:4]
    y = 240
    for feat in features:
        draw.rounded_rectangle([60, y, W - 60, y + 55], radius=10,
                               fill=(10, 10, 10, 160), outline=Brand.ORO)
        text_with_shadow(draw, f"  {feat}", (90, y + 14), Brand.font_inter(18))
        y += 70
    draw_cta(draw, project.cta_secondary or "MÁS BENEFICIOS", (60, y + 10), Brand.font_inter(15), max_y=H - 40)
    add_pagination(draw, idx, total)
    return img

def gen_slide_precio(project, idx, total):
    path = project.get_image("precio") or project.get_image("destacado")
    if not path:
        return None
    img = load_and_crop(path, W, H)
    img = add_gradient(img, 0.25, 0.45)
    draw = ImageDraw.Draw(img)
    add_logo(img, 65, 40, 35)
    cx = W // 2
    draw_badge(draw, "PRECIO", (60, 140), Brand.font_cinzel(14))
    text_with_shadow(draw, project.price or "CONSULTA PRECIO", (60, 210), Brand.font_cinzel(72), Brand.ORO, shadow_blur=7)
    y = 310
    text_with_shadow(draw, "Separación inmediata", (60, y), Brand.font_inter(20))
    if project.area:
        y += 40
        text_with_shadow(draw, f"Lotes desde {project.area}", (60, y), Brand.font_inter(16), Brand.GRIS)
    y += 50
    if project.highlights:
        text_with_shadow(draw, "  ·  ".join(project.highlights[:3]), (60, y), Brand.font_inter(14), Brand.GRIS)
    add_pagination(draw, idx, total)
    return img

def gen_slide_caracteristicas(project, idx, total):
    path = project.get_image("beneficios") or project.get_image("destacado")
    if not path:
        return None
    img = load_and_crop(path, W, H)
    img = add_gradient(img, 0.2, 0.3)
    draw = ImageDraw.Draw(img)
    add_logo(img, 65, 40, 35)
    draw_gold_lines(draw, img.size)
    y = 140
    draw_badge(draw, "CARACTERÍSTICAS", (60, y), Brand.font_cinzel(14))
    if project.area:
        y += 55
        text_with_shadow(draw, project.area, (60, y), Brand.font_cinzel(56), Brand.ORO, shadow_blur=5)
        y += 65
        text_with_shadow(draw, "de tu lote", (60, y), Brand.font_inter(22))
        y += 35
    else:
        y += 10
    highlights = (project.highlights or ["Urbanizado", "Vía pavimentada", "Escritura pública"])[:3]
    gap = 10
    card_h = 65
    for h in highlights:
        draw.rounded_rectangle([60, y, W - 60, y + card_h], radius=10,
                               fill=(10, 10, 10, 150), outline=Brand.ORO)
        text_with_shadow(draw, f"✓  {h}", (90, y + 16), Brand.font_inter(20))
        y += card_h + gap
    draw_cta(draw, project.cta or "SOLICITA INFORMACIÓN", (60, y + 15), Brand.font_inter(15), max_y=H - 40)
    add_pagination(draw, idx, total)
    return img

def gen_slide_cta(project, idx, total):
    path = project.get_image("destacado")
    if path:
        img = load_and_crop(path, W, H)
        img = img.filter(ImageFilter.GaussianBlur(radius=15))
        img = add_gradient(img, 0.3, 0.5)
    else:
        img = make_radial_bg((W, H), (W // 2, H // 2 - 50), 450, 18)
    draw = ImageDraw.Draw(img)
    add_logo(img, 100, (W - 100) // 2, 120, center=True)
    y = 310
    text_with_shadow(draw, "Agenda tu Visita", (200, y), Brand.font_cinzel(48), shadow_blur=6)
    y += 60
    text_with_shadow(draw, "Conoce el proyecto en persona.", (180, y), Brand.font_inter(18))
    y += 35
    text_with_shadow(draw, "Un asesor te espera.", (360, y), Brand.font_inter(18))
    y += 60
    draw_cta(draw, "ESCRÍBENOS AHORA", (W // 2 - 170, y), Brand.font_inter(17), bg=(37, 211, 102), fg=(255, 255, 255), max_y=H - 40)
    y += 80
    draw_gold_line_center(draw, W // 2, y, 200)
    y += 20
    text_with_shadow(draw, project.whatsapp or "+57 321 462 5618", (W // 2 - 200, y), Brand.font_inter(24), Brand.ORO)
    y += 40
    text_with_shadow(draw, project.name.upper(), (W // 2 - 150, y), Brand.font_inter(16), Brand.GRIS)
    add_pagination(draw, idx, total)
    return img
