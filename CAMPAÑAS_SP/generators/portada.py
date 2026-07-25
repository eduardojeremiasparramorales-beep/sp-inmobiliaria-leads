import os
import json
from PIL import Image, ImageDraw, ImageFilter
from .brand import Brand
from .renderer import (
    load_and_crop, add_gradient, add_gradient_left, add_logo, text_with_shadow,
    draw_badge, draw_cta, draw_gold_line_center, draw_diagonal_gold,
    draw_feature_card
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

def get_colors(template):
    if template:
        c = template["colors"]
        return tuple(c["oro"]), tuple(c["verde"]), tuple(c["marfil"]), tuple(c["negro"]), tuple(c["gris"])
    return Brand.ORO, Brand.VERDE, Brand.MARFIL, Brand.NEGRO, Brand.GRIS

def get_font(template, key, size):
    if template:
        fname = template["fonts"].get(key, "Cinzel.ttf")
        return Brand.get_font(fname, size)
    if key == "titulo":
        return Brand.font_cinzel(size)
    elif key == "subtitulo":
        return Brand.font_cinzel(size)
    return Brand.font_inter(size)

def gen_vertical(project, out_dir, template_name=None):
    W, H = 1080, 1350
    tpl = load_template(template_name) if template_name else None
    ORO, VERDE, MARFIL, NEGRO, GRIS = get_colors(tpl)

    # Fondo: foto del proyecto con gradiente sutil
    path = project.get_image("portada") or project.get_image("destacado")
    if path:
        img = load_and_crop(path, W, H)
        img = add_gradient(img, 0.3, 0.45)
    else:
        img = Image.new("RGB", (W, H), NEGRO)

    # Línea diagonal dorada (estilo Porvenir)
    img = draw_diagonal_gold(img, ORO, width=3)

    draw = ImageDraw.Draw(img)

    # Logo arriba-centro
    add_logo(img, 80, (W - 80) // 2, 35, center=True)

    # Badge de respaldo de marca, arriba-derecha — ancho calculado (no fijo) para que
    # el nombre de la marca nunca se desborde del lienzo, sea cual sea su longitud.
    badge_font = Brand.font_cinzel(11)
    badge_text = "RESPALDO LEONS GROUP"
    badge_w = draw.textbbox((0, 0), badge_text, font=badge_font)[2] + 24
    badge_x = W - badge_w - 50
    badge_y = 35
    draw_badge(draw, badge_text, (badge_x, badge_y), badge_font, bg=ORO, fg=NEGRO, radius=12)

    cx = W // 2

    # Línea dorada decorativa
    draw_gold_line_center(draw, cx, 160, 60)

    # Nombre del proyecto — grande y dorado
    title_font = get_font(tpl, "titulo", 72)
    text_with_shadow(draw, project.name.upper(), (60, 185), title_font, MARFIL, shadow_blur=6)

    # Subtítulo
    if project.location:
        sub_font = get_font(tpl, "subtitulo", 24)
        text_with_shadow(draw, project.location.upper(), (60, 275), sub_font, ORO, shadow_blur=3)

    # Línea separadora
    draw_gold_line_center(draw, cx, 320, 100)

    # Precio — grande
    y = 350
    if project.price:
        price_font = get_font(tpl, "titulo", 64)
        text_with_shadow(draw, project.price, (60, y), price_font, ORO, shadow_blur=5)
        y += 80

    # Área
    if project.area:
        area_font = get_font(tpl, "cuerpo", 22)
        text_with_shadow(draw, f"LOTES DESDE {project.area}", (60, y), area_font, MARFIL)
        y += 35

    # Highlights como texto
    if project.highlights:
        hl_font = get_font(tpl, "cuerpo", 16)
        text_with_shadow(draw, "  ·  ".join(project.highlights), (60, y), hl_font, GRIS)
        y += 45

    # Features como cards estilo Porvenir (fila de 4)
    y += 20
    features = project.features[:4] if project.features else [
        "URBANIZADO", "VÍAS PAVIMENTADAS", "ESCRITURAS", "AMENIDADES"
    ]
    icon_symbols = ["●", "■", "◆", "★"]
    card_w = (W - 120 - 30) // 4  # 4 cards con gaps
    for i, feat in enumerate(features[:4]):
        x = 60 + i * (card_w + 10)
        draw_feature_card(draw, feat, (x, y), Brand.font_inter(12), icon_symbols[i], card_w, 70)

    # Sección inferior oscura
    y_bottom = H - 200
    draw.line([(0, y_bottom), (W, y_bottom)], fill=ORO, width=1)

    # Tagline
    tagline_font = get_font(tpl, "cuerpo", 16)
    tagline = "UN ESPACIO DISEÑADO PARA TU TRANQUILIDAD,\nTU INVERSIÓN Y TU FUTURO."
    for i, line in enumerate(tagline.split("\n")):
        text_with_shadow(draw, line, (60, y_bottom + 25 + i * 24), tagline_font, MARFIL)

    # Logo grande abajo-centro
    logo_y = y_bottom + 90
    add_logo(img, 100, (W - 100) // 2, logo_y, center=True)

    # Sub-logo text
    sublogo_font = get_font(tpl, "cuerpo", 12)
    text_with_shadow(draw, "ASESORES COMERCIALES", (cx - 85, logo_y + 110), sublogo_font, GRIS)

    # CTAs abajo
    cta_y = H - 60
    # WhatsApp izquierda
    wa_font = get_font(tpl, "cuerpo", 13)
    text_with_shadow(draw, "AGENDA TU VISITA", (60, cta_y - 25), wa_font, MARFIL)
    text_with_shadow(draw, "Y CONOCE " + project.name.upper(), (60, cta_y - 5), wa_font, GRIS)

    # Instagram derecha
    text_with_shadow(draw, "ASESORÍA PERSONALIZADA", (W - 280, cta_y - 25), wa_font, MARFIL)
    text_with_shadow(draw, "DURANTE TODO EL PROCESO.", (W - 280, cta_y - 5), wa_font, GRIS)

    # Iconos de WhatsApp e Instagram
    icon_font = get_font(tpl, "cuerpo", 18)
    text_with_shadow(draw, "✉", (40, cta_y - 15), icon_font, MARFIL)
    text_with_shadow(draw, "◎", (W - 50, cta_y - 15), icon_font, MARFIL)

    img.convert("RGB").save(os.path.join(out_dir, "portada-vertical.png"), "PNG", quality=95)

def gen_horizontal(project, out_dir, template_name=None):
    W, H = 1920, 1080
    tpl = load_template(template_name) if template_name else None
    ORO, VERDE, MARFIL, NEGRO, GRIS = get_colors(tpl)

    # Fondo: foto del proyecto con gradiente izquierda
    path = project.get_image("portada") or project.get_image("destacado")
    if path:
        img = load_and_crop(path, W, H)
        img = add_gradient_left(img, 800, 220)
    else:
        img = Image.new("RGB", (W, H), NEGRO)

    draw = ImageDraw.Draw(img)

    # Logo arriba-izquierda
    add_logo(img, 70, 50, 30)

    # Badge de respaldo — ancho calculado, ver nota en gen_vertical.
    badge_font_h = Brand.font_cinzel(11)
    badge_text_h = "RESPALDO LEONS GROUP"
    badge_w_h = draw.textbbox((0, 0), badge_text_h, font=badge_font_h)[2] + 24
    draw_badge(draw, badge_text_h, (W - badge_w_h - 50, 30), badge_font_h, bg=ORO, fg=NEGRO, radius=12)

    # Nombre del proyecto
    title_font = get_font(tpl, "titulo", 64)
    text_with_shadow(draw, project.name.upper(), (60, 140), title_font, MARFIL, shadow_blur=6)

    # Ubicación
    if project.location:
        sub_font = get_font(tpl, "subtitulo", 26)
        text_with_shadow(draw, project.location.upper(), (60, 220), sub_font, ORO)

    # Precio
    y = 300
    if project.price:
        price_font = get_font(tpl, "titulo", 72)
        text_with_shadow(draw, project.price, (60, y), price_font, ORO, shadow_blur=5)
        y += 85

    # Área
    if project.area:
        area_font = get_font(tpl, "cuerpo", 22)
        text_with_shadow(draw, f"LOTES DESDE {project.area}", (60, y), area_font, MARFIL)

    # Features abajo
    y_feat = H - 180
    features = project.features[:4] if project.features else ["URBANIZADO", "VÍAS", "ESCRITURAS", "AMENIDADES"]
    icon_symbols = ["●", "■", "◆", "★"]
    card_w = 250
    for i, feat in enumerate(features[:4]):
        x = 60 + i * (card_w + 15)
        draw_feature_card(draw, feat, (x, y_feat), Brand.font_inter(13), icon_symbols[i], card_w, 65)

    # CTA
    cta_y = H - 70
    draw_cta(draw, project.cta or "SOLICITA INFORMACIÓN", (60, cta_y), get_font(tpl, "cuerpo", 18), bg=VERDE, fg=MARFIL, max_y=H - 15)
    wa_font = get_font(tpl, "cuerpo", 18)
    text_with_shadow(draw, project.whatsapp or "+57 321 462 5618", (320, cta_y + 8), wa_font, ORO)

    img.convert("RGB").save(os.path.join(out_dir, "portada-horizontal.png"), "PNG", quality=95)

def generar_con_template(project, out_dir, template_name="premium"):
    return generar_todas(project, out_dir, template_name)
