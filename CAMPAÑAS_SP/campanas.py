#!/usr/bin/env python3
"""
Campañas SP — Generador completo de campañas Meta Ads
Entrada: imágenes + nombre + descripción del proyecto
Salida: feed, carrusel, historias, banners, reel frames + guion
"""

import os
import sys
import json
import shutil
import glob
from datetime import datetime
from generators.project import Project
from generators.feed import generar_todas as gen_feed
from generators.carousel import generar_todas as gen_carousel
from generators.stories import generar_todas as gen_stories
from generators.banners import generar_todas as gen_banners
from generators.reel import generar_todas as gen_reel

BASE = os.path.dirname(os.path.abspath(__file__))
PROJECTS_DIR = os.path.join(BASE, "projects")
OUTPUT_DIR = os.path.join(BASE, "output")

def print_header():
    os.system("cls" if os.name == "nt" else "clear")
    print("=" * 60)
    print("  CAMPAÑAS SP — Generador Inteligente de Campañas")
    print("  Sp Leons Group - asesores Comerciales")
    print("=" * 60)
    print()

def print_menu():
    print("1)  Crear campaña nueva (desde carpeta de imágenes)")
    print("2)  Regenerar campaña existente")
    print("3)  Listar campañas guardadas")
    print("4)  Ver estructura de salida")
    print("5)  Salir")
    print()

def list_campaigns():
    if not os.path.isdir(PROJECTS_DIR):
        return []
    return [d for d in os.listdir(PROJECTS_DIR) if os.path.isdir(os.path.join(PROJECTS_DIR, d))]

def interactive_create():
    print("\n--- NUEVA CAMPAÑA ---")
    name = input("Nombre del proyecto: ").strip()
    if not name:
        print("[ERROR] El nombre es obligatorio")
        return
    slug = name.lower().replace(" ", "-").replace("ñ", "n").replace("í", "i").replace("ó", "o").replace("é", "e").replace("á", "a")
    campaign_dir = os.path.join(PROJECTS_DIR, slug)
    if os.path.exists(campaign_dir):
        print(f"[ERROR] Ya existe una campaña con slug '{slug}'")
        return
    os.makedirs(campaign_dir)
    os.makedirs(os.path.join(campaign_dir, "images"))
    print()
    print("Ahora copia TODAS las imágenes del proyecto en:")
    print(f"  {os.path.join(campaign_dir, 'images')}")
    print()
    input("Presiona ENTER cuando hayas copiado las imágenes...")
    images_dir = os.path.join(campaign_dir, "images")
    files = [f for f in os.listdir(images_dir) if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))]
    if not files:
        print("[ERROR] No hay imágenes en la carpeta")
        shutil.rmtree(campaign_dir)
        return
    print(f"\n[OK] {len(files)} imágenes detectadas")
    print()
    location = input("Ubicación (ej: Tocaima, Cundinamarca): ").strip()
    description = input("Descripción del proyecto: ").strip()
    price = input("Precio (ej: $12.000.000): ").strip()
    area = input("Área (ej: 98m²): ").strip()
    features_raw = input("Beneficios separados por coma (ej: Urbanizado, Vía pavimentada, Escritura): ").strip()
    features = [f.strip() for f in features_raw.split(",") if f.strip()]
    highlights_raw = input("Destacados separados por coma (ej: Urbanizado, Escritura, Valorización): ").strip()
    highlights = [h.strip() for h in highlights_raw.split(",") if h.strip()]
    whatsapp = input(f"WhatsApp [ENTER = {Project().whatsapp}]: ").strip() or Project().whatsapp
    cta = input(f"CTA principal [ENTER = {Project().cta}]: ").strip() or Project().cta
    proj = Project()
    proj.name = name
    proj.location = location
    proj.description = description
    proj.price = price
    proj.area = area
    proj.features = features
    proj.highlights = highlights
    proj.whatsapp = whatsapp
    proj.cta = cta
    proj.assign_images_auto(images_dir)
    config_path = os.path.join(campaign_dir, "config.json")
    proj.save(config_path)
    print(f"\n[OK] Campaña '{name}' creada")
    generate_all(proj, slug)

def generate_all(project, slug):
    out_dir = os.path.join(OUTPUT_DIR, slug)
    dirs = {
        "feed": os.path.join(out_dir, "feed"),
        "carousel": os.path.join(out_dir, "carousel"),
        "stories": os.path.join(out_dir, "stories"),
        "banners": os.path.join(out_dir, "banners"),
        "reel": os.path.join(out_dir, "reel"),
    }
    for d in dirs.values():
        os.makedirs(d, exist_ok=True)
    print(f"\n{'='*50}")
    print(f"  Generando campaña: {project.name}")
    print(f"  Slug: {slug}")
    print(f"  Salida: {out_dir}")
    print(f"{'='*50}\n")
    print("[1/5] Generando anuncios Feed (1080x1080)...")
    gen_feed(project, dirs["feed"])
    print("      [OK] 6 anuncios de feed")
    print("[2/5] Generando Carrusel (1080x1080)...")
    gen_carousel(project, dirs["carousel"])
    print("      [OK] 6 slides de carrusel")
    print("[3/5] Generando Historias (1080x1920)...")
    gen_stories(project, dirs["stories"])
    print("      [OK] 5 historias")
    print("[4/5] Generando Banners...")
    gen_banners(project, dirs["banners"])
    print("      [OK] Banners generados")
    print("[5/5] Generando Reel (guion + frames)...")
    gen_reel(project, dirs["reel"])
    print("      [OK] Guion + 5 frames clave")
    print(f"\n{'='*50}")
    print(f"  [COMPLETA] CAMPAÑA GENERADA")
    print(f"  Directorio: {out_dir}")
    print(f"{'='*50}")
    total = sum(len(os.listdir(d)) for d in dirs.values() if os.path.isdir(d))
    print(f"  Total de assets: {total} archivos")
    print()

def interactive_regenerate():
    campaigns = list_campaigns()
    if not campaigns:
        print("\n[!] No hay campañas guardadas")
        input("Presiona ENTER para continuar...")
        return
    print("\n--- CAMPAÑAS DISPONIBLES ---")
    for i, c in enumerate(campaigns, 1):
        config_path = os.path.join(PROJECTS_DIR, c, "config.json")
        if os.path.exists(config_path):
            proj = Project(config_path)
            print(f"  {i}) {proj.name} ({proj.location or 'sin ubicación'})")
        else:
            print(f"  {i}) {c} (sin config)")
    print()
    try:
        idx = int(input("Selecciona el número: ")) - 1
        if 0 <= idx < len(campaigns):
            slug = campaigns[idx]
            config_path = os.path.join(PROJECTS_DIR, slug, "config.json")
            if os.path.exists(config_path):
                proj = Project(config_path)
                generate_all(proj, slug)
            else:
                print("[ERROR] Campaña sin config.json")
        else:
            print("[ERROR] Número inválido")
    except ValueError:
        print("[ERROR] Entrada inválida")
    input("Presiona ENTER para continuar...")

def fast_create(image_dir, name, description, price, area, features, location="", highlights=None):
    """Fast-create a campaign from command-line arguments"""
    slug = name.lower().replace(" ", "-").replace("ñ", "n")
    campaign_dir = os.path.join(PROJECTS_DIR, slug)
    if not os.path.exists(campaign_dir):
        os.makedirs(campaign_dir)
        images_target = os.path.join(campaign_dir, "images")
        if os.path.isdir(image_dir) and os.path.abspath(image_dir) != os.path.abspath(images_target):
            shutil.copytree(image_dir, images_target, dirs_exist_ok=True)
    proj = Project()
    proj.name = name
    proj.location = location
    proj.description = description
    proj.price = price
    proj.area = area
    proj.features = features if isinstance(features, list) else [f.strip() for f in features.split(",")]
    proj.highlights = highlights if isinstance(highlights, list) else [h.strip() for h in (highlights or "Urbanizado, Escritura, Valorización").split(",")]
    images_dir = os.path.join(campaign_dir, "images") if os.path.isdir(os.path.join(campaign_dir, "images")) else image_dir
    proj.assign_images_auto(images_dir)
    config_path = os.path.join(campaign_dir, "config.json")
    proj.save(config_path)
    generate_all(proj, slug)

def show_structure():
    print("\n--- ESTRUCTURA DE SALIDA ---")
    print("""
output/<slug>/
├── feed/           ← 6 anuncios 1080x1080 para Meta Ads
│   ├── 01-proyecto-destacado.png
│   ├── 02-inversionistas.png
│   ├── 03-familias.png
│   ├── 04-confianza.png
│   ├── 05-oferta-precio.png
│   └── 06-escasez.png
├── carousel/       ← 6 slides 1080x1080
│   ├── slide-01-portada.png
│   ├── slide-02-ubicacion.png
│   ├── slide-03-beneficios.png
│   ├── slide-04-precio.png
│   ├── slide-05-caracteristicas.png
│   └── slide-06-cta.png
├── stories/        ← 5 historias 1080x1920
│   ├── story-01-bienvenido.png
│   ├── story-02-area.png
│   ├── story-03-precio.png
│   ├── story-04-beneficios.png
│   └── story-05-cta.png
├── banners/        ← Banners 1200x628
│   ├── banner-facebook.png
│   └── banner-instagram.png
└── reel/           ← Guion + frames 1080x1920
    ├── REEL_GUION.md
    ├── frame-01-hook.png
    ├── frame-02-proyecto.png
    ├── frame-03-ubicacion.png
    ├── frame-04-beneficios.png
    └── frame-05-cta.png
""")
    input("Presiona ENTER para continuar...")

def main():
    while True:
        print_header()
        print_menu()
        opt = input("Selecciona una opción: ").strip()
        if opt == "1":
            interactive_create()
        elif opt == "2":
            interactive_regenerate()
        elif opt == "3":
            campaigns = list_campaigns()
            if campaigns:
                print("\n--- CAMPAÑAS GUARDADAS ---")
                for c in campaigns:
                    config_path = os.path.join(PROJECTS_DIR, c, "config.json")
                    if os.path.exists(config_path):
                        proj = Project(config_path)
                        print(f"  * {proj.name} -- {proj.location or 'sin ubicacion'} ({len(proj.available_images())} imagenes)")
                    else:
                        print(f"  * {c} (sin config.json)")
            else:
                print("\n[!] No hay campañas guardadas")
            print()
            input("Presiona ENTER para continuar...")
        elif opt == "4":
            show_structure()
        elif opt == "5":
            print("\n¡Hasta pronto!\n")
            sys.exit(0)
        else:
            print("\n[!] Opción inválida")
            input("Presiona ENTER para continuar...")

if __name__ == "__main__":
    # Fast mode: python campanas.py <image_dir> <name> <price> <area> [features]
    if len(sys.argv) >= 5 and sys.argv[1] != "--menu":
        fast_create(
            image_dir=sys.argv[1],
            name=sys.argv[2],
            description=sys.argv[3] if len(sys.argv) > 3 else "",
            price=sys.argv[4] if len(sys.argv) > 4 else "",
            area=sys.argv[5] if len(sys.argv) > 5 else "",
            features=sys.argv[6] if len(sys.argv) > 6 else "",
            location=sys.argv[7] if len(sys.argv) > 7 else "",
        )
    else:
        main()
