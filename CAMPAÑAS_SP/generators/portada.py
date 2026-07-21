import os
import json
from PIL import Image, ImageDraw
from .brand import Brand
from .renderer import (
    load_and_crop, add_gradient, add_logo, text_with_shadow,
    draw_badge, draw_cta, draw_gold_line_center
)

def generar_todas(project, out_dir, template=None):
    gen_vertical(project, out_dir, template)
    gen_horizontal(project, out_dir, template)

def load_template(name):
    path = os.path.join(os.path.dirname(__file__), "templates.json")
    if os.path.exists(path):
        with open(path, "r") as f:
            tpls = json.load(f)
        if name in tpls:
            return tpls[name]
    return None

def apply_template_colors(template, draw, project):
    if not template:
        return Brand.ORO, Brand.VERDE, Brand.MARFIL, Brand.NEGRO, Brand.GRIS
    c = template["colors"]
    return tuple(c["oro"]), tuple(c["verde"]), tuple(c["marfil"]), tuple(c["negro"]), tuple(c["gris"])

def get_font(template, key, size):
    if template:
        fname = template["fonts"].get(key, "Cinzel.ttf")
        return Brand.get_font(fname, size)
    return Brand.font_cinzel(size)

def gen_vertical(project, out_dir, template_name=None):
    W, H = 1080, 1350
    tpl = load_template(template_name) if template_name else None
    ORO, VERDE, MARFIL, NEGRO, GRIS = apply_template_colors(tpl, None, project)

    path = project.get_image("portada") or project.get_image("destacado")
    if not path:
        img = Image.new("RGB", (W, H), tuple(tpl["colors"]["negro"]) if tpl else Brand.NEGRO)
    else:
        img = load_and_crop(path, W, H)
    img = add_gradient(img, 0.2, 0.5)
    draw = ImageDraw.Draw(img)

    add_logo(img, 100, (W - 100) // 2, 50, center=True)

    cx = W // 2
    draw_gold_line_center(draw, cx, 175, 80)

    text_with_shadow(draw, project.name, (60, 200), get_font(tpl, "titulo", 56), MARFIL)
    if project.location:
        text_with_shadow(draw, project.location, (60, 270), get_font(tpl, "subtitulo", 26), ORO)

    draw_gold_line_center(draw, cx, 330, 120)

    y = 370
    if project.price:
        text_with_shadow(draw, project.price, (60, y), get_font(tpl, "titulo", 72), ORO)
        y += 85
    if project.area:
        text_with_shadow(draw, project.area, (60, y), get_font(tpl, "cuerpo", 22), MARFIL)
        y += 35

    if project.highlights:
        text_with_shadow(draw, "  |  ".join(project.highlights), (60, y), get_font(tpl, "cuerpo", 16), GRIS)
        y += 50

    y += 30
    draw_gold_line_center(draw, cx, y, 60)
    y += 30
    text_with_shadow(draw, "BENEFICIOS", (60, y), get_font(tpl, "subtitulo", 16), ORO)
    y += 35

    features = project.features[:6] if project.features else [
        "Urbanización completa", "Vías pavimentadas",
        "Servicios públicos", "Ubicación privilegiada",
        "Alta valorización", "Escritura pública"
    ]
    col_x = [60, 60 + W // 2]
    for i, feat in enumerate(features):
        x = col_x[i % 2]
        fy = y + (i // 2) * 55
        draw.rounded_rectangle([x, fy, x + W // 2 - 30, fy + 42], radius=8,
                               fill=(*ORO[:3], 25) if tpl else (200, 164, 90, 25),
                               outline=ORO)
        text_with_shadow(draw, f"  {feat}", (x + 10, fy + 10), get_font(tpl, "cuerpo", 18), MARFIL)

    y_bottom = H - 110
    draw_gold_line_center(draw, cx, y_bottom, 200)
    y_bottom += 20
    draw_cta(draw, project.cta, (cx - 160, y_bottom), get_font(tpl, "cuerpo", 20),
             bg=VERDE, fg=MARFIL)
    y_bottom += 50
    text_with_shadow(draw, project.whatsapp, (cx - 140, y_bottom), get_font(tpl, "cuerpo", 18), ORO)

    img.convert("RGB").save(os.path.join(out_dir, "portada-vertical.png"), "PNG", quality=95)

def gen_horizontal(project, out_dir, template_name=None):
    W, H = 1920, 1080
    tpl = load_template(template_name) if template_name else None
    ORO, VERDE, MARFIL, NEGRO, GRIS = apply_template_colors(tpl, None, project)

    path = project.get_image("portada") or project.get_image("destacado")
    if not path:
        img = Image.new("RGB", (W, H), tuple(tpl["colors"]["negro"]) if tpl else Brand.NEGRO)
    else:
        img = load_and_crop(path, W, H)
    from .renderer import add_gradient_left
    img = add_gradient_left(img, 800, 220)
    draw = ImageDraw.Draw(img)

    add_logo(img, 90, 60, 40)

    text_with_shadow(draw, project.name, (60, 160), get_font(tpl, "titulo", 50), MARFIL)
    if project.location:
        text_with_shadow(draw, project.location, (60, 225), get_font(tpl, "subtitulo", 24), ORO)

    y = 310
    if project.price:
        text_with_shadow(draw, project.price, (60, y), get_font(tpl, "titulo", 64), ORO)
        y += 80
    if project.area:
        text_with_shadow(draw, f"Desde {project.area}", (60, y), get_font(tpl, "cuerpo", 20), MARFIL)
        y += 35

    if project.highlights:
        text_with_shadow(draw, "  ·  ".join(project.highlights), (60, y), get_font(tpl, "cuerpo", 16), GRIS)

    y_bottom = H - 100
    draw_cta(draw, project.cta, (60, y_bottom), get_font(tpl, "cuerpo", 20), bg=VERDE, fg=MARFIL)
    text_with_shadow(draw, project.whatsapp, (350, y_bottom + 8), get_font(tpl, "cuerpo", 18), ORO)

    img.convert("RGB").save(os.path.join(out_dir, "portada-horizontal.png"), "PNG", quality=95)

def generar_con_template(project, out_dir, template_name="premium"):
    return generar_todas(project, out_dir, template_name)
