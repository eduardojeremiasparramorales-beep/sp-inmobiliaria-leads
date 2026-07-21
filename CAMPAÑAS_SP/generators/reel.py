import os
from PIL import Image, ImageDraw
from .brand import Brand
from .renderer import (
    load_and_crop, add_gradient, add_logo, text_with_shadow,
    draw_badge, make_radial_bg
)

def generar_todas(project, out_dir):
    generar_guion(project, out_dir)
    generar_frames(project, out_dir)

def generar_guion(project, out_dir):
    lines = [
        f"# REEL — {project.name}",
        f"**Proyecto:** {project.name}",
        f"**Ubicación:** {project.location}",
        f"**Precio:** {project.price} {project.price_currency}",
        f"**Área:** {project.area}",
        "",
        "---",
        "## ESCENA 1 — HOOK (0:00 - 0:03)",
        "**Visual:** Toma área del proyecto, entrada, marcadores",
        "**Texto en pantalla:** ¿Buscas tu lote propio?",
        "**Audio:** Música instrumental corporativa - tono inspirador",
        "",
        "## ESCENA 2 — PROYECTO (0:03 - 0:08)",
        "**Visual:** Drone sobre el proyecto completo, amenities, zonas verdes",
        "**Texto en pantalla:** Conoce {project.name}",
        f"**Locución:** Descubre {project.name}, ubicado en {project.location}.",
        "",
        "## ESCENA 3 — UBICACIÓN (0:08 - 0:14)",
        "**Visual:** Carretera/vía de acceso, paisaje, montañas",
        "**Texto en pantalla:** Ubicación estratégica",
        "**Locución:** Con excelente acceso y una ubicación privilegiada.",
        "",
        "## ESCENA 4 — BENEFICIOS (0:14 - 0:20)",
        "**Visual:** Beneficios en cards",
        "**Texto en pantalla:** Todo incluido",
    ]
    for feat in (project.features or ["Urbanizado", "Vías pavimentadas", "Servicios"]):
        lines.append(f"• {feat}")
    lines += [
        "",
        "## ESCENA 5 — PRECIO Y CTA (0:20 - 0:25)",
        "**Visual:** Fondo oscuro con logo SP + precio",
        f"**Texto en pantalla:** Desde {project.price}",
        "**Locución:** Separación inmediata. Escríbenos ahora.",
        f"**CTA:** {project.whatsapp}",
        "",
        "---",
        "## ESPECIFICACIONES TÉCNICAS",
        "- Formato: 1080x1920 (9:16 vertical)",
        "- Duración: 25 segundos",
        "- Transiciones: Crossfade 0.3s",
        "- Música: Corporate ambient / instrumental premium",
        "- Tipografía en pantalla: Cinzel (títulos), Inter (texto)",
        "- Colores: #0A0A0A (fondo), #C8A45A (acentos), #F5F2EB (texto)",
    ]
    content = "\n".join(lines)
    with open(os.path.join(out_dir, "REEL_GUION.md"), "w", encoding="utf-8") as f:
        f.write(content)

def generar_frames(project, out_dir):
    frames = [
        ("frame-01-hook", gen_hook),
        ("frame-02-proyecto", gen_proyecto),
        ("frame-03-ubicacion", gen_ubicacion),
        ("frame-04-beneficios", gen_beneficios),
        ("frame-05-cta", gen_cta),
    ]
    for name, func in frames:
        img = func(project)
        if img:
            img.save(os.path.join(out_dir, f"{name}.png"), "PNG", quality=95)

W, H = 1080, 1920

def gen_hook(project):
    path = project.get_image("destacado")
    if not path:
        return None
    img = load_and_crop(path, W, H)
    img = add_gradient(img, 0.2, 0.35)
    draw = ImageDraw.Draw(img)
    add_logo(img, 80, 40, 40)
    text_with_shadow(draw, "¿Buscas tu", (60, 700), Brand.font_cinzel(64))
    text_with_shadow(draw, "lote propio?", (60, 780), Brand.font_cinzel(64))
    text_with_shadow(draw, project.location or "", (60, 880), Brand.font_inter(24), Brand.ORO)
    return img

def gen_proyecto(project):
    path = project.get_image("portada")
    if not path:
        return None
    img = load_and_crop(path, W, H)
    img = add_gradient(img, 0.2, 0.35)
    draw = ImageDraw.Draw(img)
    add_logo(img, 80, 40, 40)
    draw_badge(draw, "CONOCE", (60, 700))
    text_with_shadow(draw, project.name, (60, 760), Brand.font_cinzel(56))
    if project.area:
        text_with_shadow(draw, f"Lotes desde {project.area}", (60, 830), Brand.font_inter(22), Brand.ORO)
    specs = "  ·  ".join(project.highlights[:3] if project.highlights else ["Urbanizado", "Valorización", "Escritura"])
    text_with_shadow(draw, specs, (60, 900), Brand.font_inter(18))
    return img

def gen_ubicacion(project):
    path = project.get_image("ubicacion") or project.get_image("destacado")
    if not path:
        return None
    img = load_and_crop(path, W, H)
    img = add_gradient(img, 0.2, 0.35)
    draw = ImageDraw.Draw(img)
    add_logo(img, 80, 40, 40)
    draw_badge(draw, "UBICACIÓN", (60, 700))
    text_with_shadow(draw, "Estratégica", (60, 760), Brand.font_cinzel(56))
    text_with_shadow(draw, project.location or "", (60, 830), Brand.font_inter(24), Brand.ORO)
    text_with_shadow(draw, "Excelente acceso y conectividad", (60, 890), Brand.font_inter(20))
    return img

def gen_beneficios(project):
    img = Image.new("RGB", (W, H), Brand.NEGRO)
    draw = ImageDraw.Draw(img)
    for r in range(400, 0, -2):
        a = int(10 * (r / 400))
        draw.ellipse([W // 2 - r, 150 - r, W // 2 + r, 150 + r], fill=(200, 164, 90, a))
    add_logo(img, 60, 40, 40)
    draw_badge(draw, "INCLUYE", (60, 200))
    text_with_shadow(draw, "Tu lote con", (60, 270), Brand.font_cinzel(48))
    text_with_shadow(draw, "todo incluido", (60, 330), Brand.font_cinzel(48))
    features = project.features[:6] if project.features else [
        "Urbanización completa", "Vías pavimentadas",
        "Servicios públicos", "Zonas verdes",
        "Seguridad", "Valorización"
    ]
    y = 430
    for feat in features:
        draw.rounded_rectangle([60, y, W - 60, y + 60], radius=10,
                               fill=(200, 164, 90, 25), outline=Brand.ORO)
        text_with_shadow(draw, f"  ✓  {feat}", (90, y + 14), Brand.font_inter(22))
        y += 72
    return img

def gen_cta(project):
    img = Image.new("RGB", (W, H), Brand.NEGRO)
    draw = ImageDraw.Draw(img)
    for r in range(450, 0, -2):
        a = int(18 * (r / 450))
        draw.ellipse([W // 2 - r, 700 - r, W // 2 + r, 700 + r], fill=(200, 164, 90, a))
    logo_img = Image.open(Brand.LOGO_PATH).convert("RGBA")
    logo_img = logo_img.resize((120, 120), Image.LANCZOS)
    img.paste(logo_img, ((W - 120) // 2, 120), logo_img)
    text_with_shadow(draw, "Desde", (W // 2 - 100, 300), Brand.font_inter(28), Brand.ORO)
    text_with_shadow(draw, project.price, (W // 2 - 300, 360), Brand.font_cinzel(100), Brand.ORO)
    text_with_shadow(draw, project.area or "", (W // 2 - 100, 480), Brand.font_inter(24))
    draw.rounded_rectangle([W // 2 - 200, 560, W // 2 + 200, 630], radius=35, fill=(37, 211, 102))
    text_with_shadow(draw, "ESCRÍBENOS", (W // 2 - 140, 572), Brand.font_inter(24), (255, 255, 255))
    text_with_shadow(draw, project.whatsapp, (W // 2 - 200, 690), Brand.font_inter(28))
    text_with_shadow(draw, project.name, (W // 2 - 150, 760), Brand.font_inter(20), Brand.ORO)
    return img
