#!/usr/bin/env python3
"""
Campañas SP — API Bridge
Lee JSON de stdin, ejecuta los generadores, imprime JSON con resultados.
"""

import sys
import os
import json
import time
import shutil
from generators.project import Project
from generators.feed import generar_todas as gen_feed
from generators.carousel import generar_todas as gen_carousel
from generators.stories import generar_todas as gen_stories
from generators.banners import generar_todas as gen_banners
from generators.reel import generar_todas as gen_reel
from generators.portada import generar_con_template as gen_portada

def main():
    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "error": f"JSON invalido: {e}"}))
        sys.exit(1)

    project_data = data.get("project", {})
    images_dir = data.get("images_dir", "")
    output_dir = data.get("output_dir", "")
    template = data.get("template", "premium")

    if not images_dir or not os.path.isdir(images_dir):
        print(json.dumps({"ok": False, "error": "images_dir no existe"}))
        sys.exit(1)

    if not output_dir:
        print(json.dumps({"ok": False, "error": "output_dir requerido"}))
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    proj = Project()
    proj.name = project_data.get("name", "Proyecto")
    proj.location = project_data.get("location", "")
    proj.description = project_data.get("description", "")
    proj.price = project_data.get("price", "")
    proj.price_currency = project_data.get("price_currency", "COP")
    proj.area = project_data.get("area", "")
    proj.features = project_data.get("features", [])
    proj.highlights = project_data.get("highlights", [])
    proj.whatsapp = project_data.get("whatsapp", "+57 321 462 5618")
    proj.cta = project_data.get("cta", "SOLICITA INFORMACIÓN")
    proj.cta_secondary = project_data.get("cta_secondary", "CONOCE EL PROYECTO")
    proj.assign_images_auto(images_dir)
    proj.image_dir = images_dir

    start = time.time()
    errors = []

    subdirs = {
        "portada": os.path.join(output_dir, "portada"),
        "feed": os.path.join(output_dir, "feed"),
        "carousel": os.path.join(output_dir, "carousel"),
        "stories": os.path.join(output_dir, "stories"),
        "banners": os.path.join(output_dir, "banners"),
        "reel": os.path.join(output_dir, "reel"),
    }
    for d in subdirs.values():
        os.makedirs(d, exist_ok=True)

    try:
        gen_portada(proj, subdirs["portada"], template)
    except Exception as e:
        errors.append(f"portada: {e}")

    try:
        gen_feed(proj, subdirs["feed"])
    except Exception as e:
        errors.append(f"feed: {e}")

    try:
        gen_carousel(proj, subdirs["carousel"])
    except Exception as e:
        errors.append(f"carousel: {e}")

    try:
        gen_stories(proj, subdirs["stories"])
    except Exception as e:
        errors.append(f"stories: {e}")

    try:
        gen_banners(proj, subdirs["banners"])
    except Exception as e:
        errors.append(f"banners: {e}")

    try:
        gen_reel(proj, subdirs["reel"])
    except Exception as e:
        errors.append(f"reel: {e}")

    elapsed = int((time.time() - start) * 1000)

    def list_files(dirpath):
        if not os.path.isdir(dirpath):
            return []
        return sorted(os.listdir(dirpath))

    result = {
        "ok": len(errors) == 0 or len(errors) < 6,
        "time_ms": elapsed,
        "errors": errors if errors else None,
        "project_slug": proj.slug,
        "assets": {
            "portada": list_files(subdirs["portada"]),
            "feed": list_files(subdirs["feed"]),
            "carousel": list_files(subdirs["carousel"]),
            "stories": list_files(subdirs["stories"]),
            "banners": list_files(subdirs["banners"]),
            "reel": [f for f in list_files(subdirs["reel"]) if f.endswith(".md")],
            "reel_frames": [f for f in list_files(subdirs["reel"]) if f.endswith(".png")],
        },
        "total": sum(len(list_files(d)) for d in subdirs.values())
    }

    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()
