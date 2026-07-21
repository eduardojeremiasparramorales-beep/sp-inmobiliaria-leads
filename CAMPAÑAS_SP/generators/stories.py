import os
from PIL import Image, ImageDraw
from .brand import Brand
from .renderer import (
    load_and_crop, add_gradient, add_logo, text_with_shadow,
    draw_badge, draw_gold_line_center, make_radial_bg
)

W, H = 1080, 1920

def generar_todas(project, out_dir):
    stories = [
        ("story-01-bienvenido", gen_bienvenido),
        ("story-02-area", gen_area),
        ("story-03-precio", gen_precio),
        ("story-04-beneficios", gen_beneficios),
        ("story-05-cta", gen_cta),
    ]
    for name, func in stories:
        img = func(project)
        if img:
            img.save(os.path.join(out_dir, f"{name}.png"), "PNG", quality=95)

def load_story_bg(project, img_key):
    path = project.get_image(img_key)
    if not path:
        return None
    img = load_and_crop(path, W, H)
    return add_gradient(img, 0.2, 0.35)

def gen_bienvenido(project):
    img = load_story_bg(project, "portada")
    if not img:
        return None
    draw = ImageDraw.Draw(img)
    add_logo(img, 100, (W - 100) // 2, 60, center=True)
    cx = W // 2
    draw_badge(draw, "SP INMOBILIARIA", (cx - 90, 680))
    text_with_shadow(draw, "Bienvenido a", (cx - 220, 740), Brand.font_cinzel(60))
    text_with_shadow(draw, "tu próximo", (cx - 200, 810), Brand.font_cinzel(60))
    text_with_shadow(draw, "proyecto", (cx - 180, 880), Brand.font_cinzel(60))
    if project.location:
        text_with_shadow(draw, project.location, (cx - 200, 960), Brand.font_inter(24), Brand.ORO)
    return img

def gen_area(project):
    img = load_story_bg(project, "destacado")
    if not img:
        return None
    draw = ImageDraw.Draw(img)
    add_logo(img, 100, (W - 100) // 2, 60, center=True)
    cx = W // 2
    area_num = "".join(c for c in project.area if c.isdigit() or c in ".,")
    area_label = project.area.replace(area_num, "").strip() if area_num else project.area
    text_with_shadow(draw, area_num or "98", (cx - 120, 750), Brand.font_cinzel(180), Brand.ORO)
    text_with_shadow(draw, f"{area_label.upper()} CUADRADOS" if area_label else "METROS CUADRADOS",
                     (cx - 250, 960), Brand.font_cinzel(32))
    if project.highlights:
        text_with_shadow(draw, "  ·  ".join(project.highlights[:2]),
                         (cx - 230, 1020), Brand.font_inter(20))
    return img

def gen_precio(project):
    img = load_story_bg(project, "precio")
    if not img:
        return None
    draw = ImageDraw.Draw(img)
    add_logo(img, 100, (W - 100) // 2, 60, center=True)
    cx = W // 2
    text_with_shadow(draw, "DESDE", (cx - 80, 720), Brand.font_inter(22))
    text_with_shadow(draw, project.price, (cx - 300, 770), Brand.font_cinzel(80), Brand.ORO)
    text_with_shadow(draw, project.price_currency, (cx - 40, 870), Brand.font_inter(22), Brand.GRIS)
    loc = f"{project.location}  ·  {project.area}" if project.location else project.area
    text_with_shadow(draw, f"{loc}  ·  Separación inmediata",
                     (cx - 300, 940), Brand.font_inter(18))
    return img

def gen_beneficios(project):
    img = load_story_bg(project, "beneficios")
    if not img:
        return None
    draw = ImageDraw.Draw(img)
    add_logo(img, 100, (W - 100) // 2, 60, center=True)
    draw_badge(draw, "BENEFICIOS", (60, 650))
    text_with_shadow(draw, "Tu lote con", (60, 720), Brand.font_cinzel(50))
    text_with_shadow(draw, "todo incluido", (60, 780), Brand.font_cinzel(50))
    features = project.features[:5] if project.features else [
        "Proyecto urbanizado", "Vías pavimentadas",
        "Servicios públicos", "Ubicación privilegiada", "Alta valorización"
    ]
    y = 870
    for feat in features:
        draw.rounded_rectangle([60, y, W - 60, y + 60], radius=10,
                               fill=(200, 164, 90, 40), outline=Brand.ORO)
        text_with_shadow(draw, feat, (90, y + 12), Brand.font_cinzel(22), Brand.ORO)
        y += 75
    return img

def gen_cta(project):
    img = Image.new("RGB", (W, H), Brand.NEGRO)
    draw = ImageDraw.Draw(img)
    for r in range(500, 0, -2):
        a = int(20 * (r / 500))
        draw.ellipse([W // 2 - r, 800 - r, W // 2 + r, 800 + r], fill=(200, 164, 90, a))
    logo_img = Image.open(Brand.LOGO_PATH).convert("RGBA")
    logo_img = logo_img.resize((140, 140), Image.LANCZOS)
    img.paste(logo_img, ((W - 140) // 2, 200), logo_img)
    text_with_shadow(draw, "Escríbenos", (280, 420), Brand.font_cinzel(56))
    text_with_shadow(draw, "por WhatsApp", (240, 490), Brand.font_cinzel(56))
    text_with_shadow(draw, "Un asesor te atenderá en minutos.", (180, 590), Brand.font_inter(20))
    text_with_shadow(draw, "Resuelve todas tus dudas sin compromiso.", (160, 620), Brand.font_inter(20))
    draw.rounded_rectangle([290, 700, 790, 770], radius=35, fill=(37, 211, 102))
    text_with_shadow(draw, "ENVIAR MENSAJE", (340, 715), Brand.font_inter(22), (255, 255, 255))
    draw_gold_line_center(draw, W // 2, 830, 200)
    text_with_shadow(draw, project.whatsapp, (W // 2 - 200, 860), Brand.font_inter(26))
    text_with_shadow(draw, project.name, (W // 2 - 150, 920), Brand.font_inter(18), Brand.ORO)
    text_with_shadow(draw, "SP INMOBILIARIA", (360, 1750), Brand.font_cinzel(18), Brand.ORO)
    return img
