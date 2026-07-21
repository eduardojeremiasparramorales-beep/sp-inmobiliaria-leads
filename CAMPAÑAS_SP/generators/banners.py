import os
from PIL import Image, ImageDraw
from .brand import Brand
from .renderer import (
    load_and_crop, add_gradient_left, add_logo, text_with_shadow,
    draw_badge, draw_cta
)

W, H = 1200, 628

def generar_todas(project, out_dir):
    banners = [
        ("banner-facebook", gen_facebook),
        ("banner-instagram", gen_instagram),
    ]
    for name, func in banners:
        img = func(project)
        if img:
            img.save(os.path.join(out_dir, f"{name}.png"), "PNG", quality=95)

def gen_facebook(project):
    path = project.get_image("portada") or project.get_image("destacado")
    if not path:
        return None
    img = load_and_crop(path, W, H)
    img = add_gradient_left(img, 600, 230)
    draw = ImageDraw.Draw(img)
    add_logo(img, 60, 50, 30)
    draw_badge(draw, "SP INMOBILIARIA", (50, 100))
    text_with_shadow(draw, "Lotes desde", (50, 150), Brand.font_cinzel(36))
    text_with_shadow(draw, project.price, (50, 200), Brand.font_cinzel(48), Brand.ORO)
    if project.location:
        text_with_shadow(draw, f"en {project.location.split(',')[0]}", (50, 260), Brand.font_cinzel(36))
    specs = f"Desde {project.area}  |  Financiación  |  Excelente ubicación"
    text_with_shadow(draw, specs, (50, 330), Brand.font_inter(16))
    draw.rounded_rectangle([50, 390, 380, 440], radius=8, fill=(37, 211, 102))
    text_with_shadow(draw, project.whatsapp, (80, 400), Brand.font_inter(18), (255, 255, 255))
    return img

def gen_instagram(project):
    img = Image.new("RGB", (W, H), Brand.NEGRO)
    draw = ImageDraw.Draw(img)
    for r in range(400, 0, -2):
        a = int(15 * (r / 400))
        draw.ellipse([600 - r, 200 - r, 600 + r, 200 + r], fill=(200, 164, 90, a))
    add_logo(img, 100, (W - 100) // 2, 60, center=True)
    text_with_shadow(draw, project.name, (100, 200), Brand.font_cinzel(44))
    if project.location:
        text_with_shadow(draw, project.location, (100, 260), Brand.font_inter(22), Brand.ORO)
    text_with_shadow(draw, project.price, (100, 330), Brand.font_cinzel(56), Brand.ORO)
    text_with_shadow(draw, project.area, (100, 400), Brand.font_inter(24))
    features = " | ".join(project.highlights[:3] if project.highlights else ["Urbanizado", "Escritura", "Valorización"])
    text_with_shadow(draw, features, (100, 460), Brand.font_inter(16), Brand.GRIS)
    draw_cta(draw, project.cta, (100, 520))
    return img
