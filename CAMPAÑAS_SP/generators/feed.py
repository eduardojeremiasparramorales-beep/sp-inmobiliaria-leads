import os
from PIL import Image, ImageDraw
from .brand import Brand
from .renderer import (
    load_and_crop, add_gradient, add_logo, text_with_shadow,
    draw_badge, draw_cta, draw_gold_lines, draw_diagonal_gold
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

def base_con_fondo(project, img_key):
    path = project.get_image(img_key)
    if not path:
        return None
    img = load_and_crop(path, W, H)
    img = add_gradient(img, 0.3, 0.45)
    draw = ImageDraw.Draw(img)
    add_logo(img, 70, 40, 35)
    draw_gold_lines(draw, img.size)
    return img, draw

def gen_destacado(project):
    r = base_con_fondo(project, "destacado")
    if not r: return None
    img, draw = r
    y = H - 340
    draw_badge(draw, "PROYECTO DESTACADO", (60, y), Brand.font_cinzel(14))
    y += 45
    text_with_shadow(draw, project.name.upper(), (60, y), Brand.font_cinzel(60), shadow_blur=6)
    y += 75
    if project.location:
        text_with_shadow(draw, project.location.upper(), (60, y), Brand.font_cinzel(22), Brand.ORO, shadow_blur=3)
        y += 35
    y += 10
    if project.price:
        text_with_shadow(draw, project.price, (60, y), Brand.font_cinzel(56), Brand.ORO, shadow_blur=5)
        y += 72
    if project.area:
        text_with_shadow(draw, f"LOTES DESDE {project.area}", (60, y), Brand.font_inter(18))
        y += 35
    y += 10
    if project.highlights:
        text_with_shadow(draw, "  ·  ".join(project.highlights), (60, y), Brand.font_inter(14), Brand.GRIS)
        y += 35
    draw_cta(draw, project.cta or "SOLICITA INFORMACIÓN", (60, y))
    return img

def gen_inversionistas(project):
    r = base_con_fondo(project, "inversionistas")
    if not r: return None
    img, draw = r
    y = H - 300
    draw_badge(draw, "INVERSIONISTAS", (60, y), Brand.font_cinzel(14))
    y += 50
    text_with_shadow(draw, "Invertir en tierra", (60, y), Brand.font_cinzel(48), shadow_blur=6)
    y += 58
    text_with_shadow(draw, "nunca pasa de moda", (60, y), Brand.font_cinzel(48), shadow_blur=6)
    y += 70
    draw_gold_lines(draw, (W, H), top=y - 10, right=60)
    y += 10
    text_with_shadow(draw, "Precios desde " + (project.price or "consultar"), (60, y), Brand.font_inter(20), Brand.ORO)
    y += 50
    draw_cta(draw, project.cta_secondary or "CONOCE EL PROYECTO", (60, y))
    return img

def gen_familias(project):
    r = base_con_fondo(project, "familias")
    if not r: return None
    img, draw = r
    y = H - 320
    draw_badge(draw, "FAMILIAS", (60, y), Brand.font_cinzel(14))
    y += 45
    text_with_shadow(draw, "El lugar donde crecerán", (60, y), Brand.font_cinzel(44), shadow_blur=6)
    y += 54
    text_with_shadow(draw, "tus mejores recuerdos", (60, y), Brand.font_cinzel(44), shadow_blur=6)
    y += 70
    specs = f"{project.area or 'Área por definir'} · Desde {project.price or 'consultar'}"
    text_with_shadow(draw, specs.upper(), (60, y), Brand.font_inter(16), Brand.ORO)
    y += 40
    draw_cta(draw, "MÁS INFORMACIÓN", (60, y))
    return img

def gen_confianza(project):
    r = base_con_fondo(project, "confianza")
    if not r: return None
    img, draw = r
    y = H - 320
    draw_badge(draw, "CONFIANZA", (60, y), Brand.font_cinzel(14))
    y += 45
    text_with_shadow(draw, "Ellos ya confiaron", (60, y), Brand.font_cinzel(48), shadow_blur=6)
    y += 58
    text_with_shadow(draw, "en nosotros", (60, y), Brand.font_cinzel(48), shadow_blur=6)
    y += 70
    specs = "  ·  ".join((project.highlights or ["Obra activa", "Escritura pública", "Respaldo"])[:3])
    text_with_shadow(draw, specs, (60, y), Brand.font_inter(16))
    y += 40
    draw_cta(draw, project.cta_secondary or "SOLICITA INFORMACIÓN", (60, y))
    return img

def gen_precio(project):
    r = base_con_fondo(project, "precio")
    if not r: return None
    img, draw = r
    y = H - 350
    draw_badge(draw, "OFERTA / PRECIO", (60, y), Brand.font_cinzel(14))
    y += 55
    text_with_shadow(draw, project.price or "CONSULTA PRECIO", (60, y), Brand.font_cinzel(80), Brand.ORO, shadow_blur=7)
    y += 100
    text_with_shadow(draw, "Separación inmediata", (60, y), Brand.font_inter(22))
    y += 35
    if project.area:
        text_with_shadow(draw, f"Lotes desde {project.area}", (60, y), Brand.font_inter(16), Brand.GRIS)
        y += 30
    y += 10
    if project.highlights:
        text_with_shadow(draw, "  ·  ".join(project.highlights), (60, y), Brand.font_inter(14), Brand.GRIS)
        y += 35
    draw_cta(draw, project.cta or "SOLICITA INFORMACIÓN", (60, y))
    return img

def gen_escasez(project):
    r = base_con_fondo(project, "escasez")
    if not r: return None
    img, draw = r
    y = H - 350
    draw_badge(draw, "ESCASEZ", (60, y), Brand.font_cinzel(14), bg=Brand.ORO, fg=Brand.NEGRO)
    y += 50
    text_with_shadow(draw, "Últimas unidades", (60, y), Brand.font_cinzel(52), shadow_blur=6)
    y += 62
    text_with_shadow(draw, "disponibles", (60, y), Brand.font_cinzel(52), shadow_blur=6)
    y += 75
    if project.price:
        text_with_shadow(draw, project.price, (60, y), Brand.font_cinzel(56), Brand.ORO, shadow_blur=5)
        y += 70
    text_with_shadow(draw, "Separación inmediata · No dejes pasar esta oportunidad", (60, y), Brand.font_inter(15))
    y += 40
    draw_cta(draw, "AGENDA TU VISITA", (60, y), Brand.font_inter(17), bg=Brand.ORO, fg=Brand.NEGRO)
    return img
