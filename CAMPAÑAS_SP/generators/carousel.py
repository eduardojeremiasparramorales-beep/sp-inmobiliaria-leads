import os
from PIL import Image, ImageDraw
from .brand import Brand
from .renderer import (
    load_and_crop, add_gradient, add_logo, text_with_shadow,
    draw_badge, draw_cta, draw_gold_line_center, make_radial_bg
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
    img = make_radial_bg((W, H), (W // 2, H // 2 - 100), 400, 15)
    draw = ImageDraw.Draw(img)
    add_logo(img, 160, (W - 160) // 2, 180, center=True)
    draw_gold_line_center(draw, W // 2, 380, 100)
    text_with_shadow(draw, project.name, (100, 420), Brand.font_cinzel(52))
    if project.location:
        lines = project.location.split(",")
        y = 490
        for line in lines:
            text_with_shadow(draw, line.strip(), (100, y), Brand.font_cinzel(40))
            y += 50
    draw_gold_line_center(draw, W // 2, y + 20, 100)
    text_with_shadow(draw, "SP INMOBILIARIA", (W // 2 - 150, y + 60), Brand.font_inter(18), Brand.ORO)
    add_pagination(draw, idx, total)
    return img

def gen_slide_ubicacion(project, idx, total):
    path = project.get_image("ubicacion") or project.get_image("destacado")
    if not path:
        return None
    img = load_and_crop(path, W, H)
    img = add_gradient(img, 0.25, 0.4)
    draw = ImageDraw.Draw(img)
    add_logo(img, 70, 40, 40)
    draw_badge(draw, "UBICACIÓN", (60, 900))
    text_with_shadow(draw, "Estratégica", (60, 950), Brand.font_cinzel(48))
    text_with_shadow(draw, project.location or "", (60, 1010), Brand.font_inter(18))
    if project.highlights:
        text_with_shadow(draw, project.highlights[0], (60, 1040), Brand.font_inter(16))
    add_pagination(draw, idx, total)
    return img

def gen_slide_beneficios(project, idx, total):
    img = make_radial_bg((W, H), (W // 2, 150), 400, 10)
    draw = ImageDraw.Draw(img)
    add_logo(img, 60, 40, 40)
    draw_badge(draw, "BENEFICIOS", (60, 130))
    text_with_shadow(draw, "Todo lo que necesitas", (60, 180), Brand.font_cinzel(44))
    features = project.features or [
        "Proyecto urbanizado con vías internas",
        "Vías pavimentadas de acceso",
        "Servicios públicos disponibles",
        "Ubicación privilegiada",
        "Alta valorización garantizada"
    ]
    y = 270
    for feat in features:
        draw.rounded_rectangle([60, y, W - 60, y + 55], radius=10,
                               fill=(200, 164, 90, 25), outline=Brand.ORO)
        text_with_shadow(draw, feat, (90, y + 14), Brand.font_inter(20))
        y += 70
    add_pagination(draw, idx, total)
    return img

def gen_slide_precio(project, idx, total):
    path = project.get_image("precio") or project.get_image("destacado")
    if not path:
        return None
    img = load_and_crop(path, W, H)
    img = add_gradient(img, 0.25, 0.4)
    draw = ImageDraw.Draw(img)
    add_logo(img, 70, 40, 40)
    cx = W // 2
    draw_badge(draw, "PRECIO", (cx - 50, 850))
    text_with_shadow(draw, project.price, (180, 900), Brand.font_cinzel(80), Brand.ORO)
    text_with_shadow(draw, "Separación inmediata", (cx - 180, 1000), Brand.font_inter(20))
    cols = [
        f"{project.area} Urbanizado",
        "15 días Escritura",
        "Fácil Financiación"
    ]
    x = 120
    for col in cols:
        parts = col.split(" ", 1)
        text_with_shadow(draw, parts[0], (x, 1040), Brand.font_cinzel(24), Brand.ORO)
        if len(parts) > 1:
            text_with_shadow(draw, parts[1], (x, 1070), Brand.font_inter(14), Brand.GRIS)
        x += 320
    add_pagination(draw, idx, total)
    return img

def gen_slide_caracteristicas(project, idx, total):
    path = project.get_image("beneficios") or project.get_image("destacado")
    if not path:
        return None
    img = load_and_crop(path, W, H)
    img = add_gradient(img, 0.25, 0.3)
    draw = ImageDraw.Draw(img)
    add_logo(img, 70, 40, 40)
    draw_badge(draw, "CARACTERÍSTICAS", (60, 200))
    text_with_shadow(draw, f"{project.area}", (60, 260), Brand.font_cinzel(60), Brand.ORO)
    text_with_shadow(draw, "de tu lote", (60, 330), Brand.font_inter(24))
    highlights = project.highlights or ["Urbanizado", "Vía pavimentada", "Escritura pública"]
    y = 420
    for h in highlights:
        draw.rounded_rectangle([60, y, W - 60, y + 70], radius=10,
                               fill=(200, 164, 90, 20), outline=Brand.ORO)
        text_with_shadow(draw, f"✓  {h}", (90, y + 20), Brand.font_inter(22))
        y += 85
    add_pagination(draw, idx, total)
    return img

def gen_slide_cta(project, idx, total):
    img = make_radial_bg((W, H), (W // 2, H // 2 - 50), 400, 15)
    draw = ImageDraw.Draw(img)
    add_logo(img, 140, (W - 140) // 2, 150, center=True)
    text_with_shadow(draw, "Agenda tu Visita", (200, 350), Brand.font_cinzel(52))
    text_with_shadow(draw, "Conoce el proyecto en persona.", (180, 430), Brand.font_inter(20))
    text_with_shadow(draw, "Un asesor te espera.", (300, 460), Brand.font_inter(20))
    draw_cta(draw, "ESCRÍBENOS AHORA", (W // 2 - 170, 530), bg=(37, 211, 102), fg=(255, 255, 255))
    draw_gold_line_center(draw, W // 2, 660, 200)
    text_with_shadow(draw, project.whatsapp, (W // 2 - 200, 690), Brand.font_inter(26))
    text_with_shadow(draw, project.name, (W // 2 - 150, 750), Brand.font_inter(18), Brand.ORO)
    add_pagination(draw, idx, total)
    return img
