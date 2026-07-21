import os
from PIL import Image, ImageDraw
from .brand import Brand
from .renderer import (
    load_and_crop, add_gradient, add_logo, text_with_shadow,
    draw_badge, draw_cta, draw_gold_lines
)

W, H = 1080, 1080

def generar_todas(project, out_dir):
    ads = [
        ("01-proyecto-destacado", gen_destacado),
        ("02-inversionistas", gen_inversionistas),
        ("03-familias", gen_familias),
        ("04-confianza", gen_confianza),
        ("05-oferta-precio", gen_precio),
        ("06-escasez", gen_escasez),
    ]
    for name, func in ads:
        img = func(project)
        if img:
            img.save(os.path.join(out_dir, f"{name}.png"), "PNG", quality=95)

def base_con_fondo(project, img_key, grad=0.7):
    path = project.get_image(img_key)
    if not path:
        return None
    img = load_and_crop(path, W, H)
    img = add_gradient(img, 0.25, 0.4)
    draw = ImageDraw.Draw(img)
    add_logo(img, 80, 40, 40)
    draw_gold_lines(draw, img.size)
    return img, draw

def gen_destacado(project):
    r = base_con_fondo(project, "destacado")
    if not r: return None
    img, draw = r
    y = H - 320
    draw_badge(draw, "PROYECTO DESTACADO", (60, y))
    y += 40
    text_with_shadow(draw, project.name, (60, y), Brand.font_cinzel(48))
    y += 60
    if project.location:
        text_with_shadow(draw, f"en {project.location}", (60, y), Brand.font_cinzel(36))
        y += 60
    y += 20
    text_with_shadow(draw, project.price, (60, y), Brand.font_cinzel(64), Brand.ORO)
    text_with_shadow(draw, project.price_currency, (60 + len(project.price) * 10, y + 20), Brand.font_inter(24), Brand.MARFIL)
    y += 90
    if project.highlights:
        text_with_shadow(draw, "  ·  ".join(project.highlights), (60, y), Brand.font_inter(16))
    y += 40
    draw_cta(draw, project.cta, (60, y))
    return img

def gen_inversionistas(project):
    r = base_con_fondo(project, "inversionistas")
    if not r: return None
    img, draw = r
    y = H - 280
    draw_badge(draw, "INVERSIONISTAS", (60, y))
    y += 40
    text_with_shadow(draw, "La tierra sigue siendo", (60, y), Brand.font_cinzel(44))
    y += 54
    text_with_shadow(draw, "la inversión más sólida", (60, y), Brand.font_cinzel(44))
    y += 70
    text_with_shadow(draw, "Invierte hoy. Gana mañana.", (60, y), Brand.font_inter(20), Brand.ORO)
    y += 50
    draw_cta(draw, project.cta_secondary, (60, y))
    return img

def gen_familias(project):
    r = base_con_fondo(project, "familias")
    if not r: return None
    img, draw = r
    y = H - 320
    draw_badge(draw, "FAMILIAS", (60, y))
    y += 40
    text_with_shadow(draw, "El lugar donde comenzará", (60, y), Brand.font_cinzel(42))
    y += 52
    text_with_shadow(draw, "la historia de tu familia", (60, y), Brand.font_cinzel(42))
    y += 70
    specs = f"{project.area}  ·  Desde {project.price}"
    if project.features:
        specs += f"  ·  {project.features[0].split(' ')[0]}"
    text_with_shadow(draw, specs, (60, y), Brand.font_inter(16))
    y += 40
    draw_cta(draw, "MÁS INFORMACIÓN", (60, y))
    return img

def gen_confianza(project):
    r = base_con_fondo(project, "confianza")
    if not r: return None
    img, draw = r
    y = H - 320
    draw_badge(draw, "CONFIANZA", (60, y))
    y += 40
    text_with_shadow(draw, "Ellos ya hicieron", (60, y), Brand.font_cinzel(44))
    y += 54
    text_with_shadow(draw, "realidad su inversión", (60, y), Brand.font_cinzel(44))
    y += 70
    specs = "  ·  ".join(project.highlights[:3] if project.highlights else ["Obra activa", "Escritura pública", "Respaldo"])
    text_with_shadow(draw, specs, (60, y), Brand.font_inter(16))
    y += 40
    draw_cta(draw, project.cta_secondary, (60, y))
    return img

def gen_precio(project):
    r = base_con_fondo(project, "precio")
    if not r: return None
    img, draw = r
    y = H - 340
    draw_badge(draw, "OFERTA / PRECIO", (60, y))
    y += 50
    text_with_shadow(draw, project.price, (60, y), Brand.font_cinzel(80), Brand.ORO)
    y += 100
    text_with_shadow(draw, "Separación inmediata", (60, y), Brand.font_inter(22))
    y += 40
    if project.highlights:
        text_with_shadow(draw, "  ·  ".join(project.highlights), (60, y), Brand.font_inter(16))
    y += 40
    draw_cta(draw, project.cta, (60, y))
    return img

def gen_escasez(project):
    r = base_con_fondo(project, "escasez")
    if not r: return None
    img, draw = r
    y = H - 340
    draw_badge(draw, "ESCASEZ", (60, y))
    y += 40
    text_with_shadow(draw, "Últimas unidades", (60, y), Brand.font_cinzel(48))
    y += 58
    text_with_shadow(draw, "disponibles", (60, y), Brand.font_cinzel(48))
    y += 70
    text_with_shadow(draw, project.price, (60, y), Brand.font_cinzel(48), Brand.ORO)
    text_with_shadow(draw, project.price_currency, (60 + len(project.price) * 8, y + 15), Brand.font_inter(20))
    y += 70
    text_with_shadow(draw, "Separación inmediata · No dejes pasar esta oportunidad", (60, y), Brand.font_inter(16))
    y += 40
    draw_cta(draw, "AGENDA TU VISITA", (60, y), bg=Brand.ORO, fg=Brand.NEGRO)
    return img
