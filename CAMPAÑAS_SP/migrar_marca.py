#!/usr/bin/env python3
"""
Migracion de marca: Sp Inmobiliaria -> Sp Leons Group
Ejecutar desde C:\Sp Inmobiliaria
NO modifica contenido del CRM, solo renombra la carpeta
"""

import os

BASE = r"C:\Sp Leons"
SKIP_DIRS = {".git", "__pycache__", "fonts", "Apk Vendedores", "ADN Visual Sp",
             "sp-inmobiliaria-leads-UPDATED", "node_modules", ".env", "data"}
SKIP_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".ico", ".webp", ".woff", ".woff2", ".ttf", ".pdf", ".apk"}

REPLACEMENTS = [
    ("Sp Leons Group - asesores Comerciales", "Sp Leons Group - asesores Comerciales"),
    ("Sergio Parra Inversiones & Finca Ra\xedz", "Sp Leons Group - asesores Comerciales"),
    ("Sergio Parra Inversiones &amp; Finca Ra\xedz", "Sp Leons Group - asesores Comerciales"),
    ("Sp Leons Group - asesores Comerciales", "Sp Leons Group - asesores Comerciales"),
    ("Inversiones & Finca Ra\xedz", "Sp Leons Group - asesores Comerciales"),
    ("Inversiones &amp; Finca Ra\xedz", "Sp Leons Group - asesores Comerciales"),
    ("@sp.leons.group", "@sp.leons.group"),
    ("Sp Leons Group", "Sp Leons Group"),
]

def should_skip(path):
    parts = path.replace(BASE, "").lstrip("\\/").split(os.sep)
    for skip in SKIP_DIRS:
        if skip in parts:
            return True
    ext = os.path.splitext(path)[1].lower()
    if ext in SKIP_EXTS:
        return True
    return False

total_files = 0

for root, dirs, files in os.walk(BASE):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith("sp-inmobiliaria")]
    for fname in files:
        path = os.path.join(root, fname)
        if should_skip(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
        except:
            try:
                with open(path, "r", encoding="latin-1") as f:
                    content = f.read()
            except:
                continue
        original = content
        for old, new in REPLACEMENTS:
            content = content.replace(old, new)
        if content != original:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            total_files += 1
            print(f"[OK] {os.path.relpath(path, BASE)}")

print(f"\n[DONE] {total_files} archivos modificados")

# Now handle "SP Inmobiliaria" -> "Sp Leons Group" in non-CRM text files
print("\n--- FASE 2: SP Inmobiliaria -> Sp Leons Group ---")
fase2 = 0
for root, dirs, files in os.walk(BASE):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith("sp-inmobiliaria") and "CAMPAÑAS_SP" not in d]
    for fname in files:
        path = os.path.join(root, fname)
        if should_skip(path):
            continue
        ext = os.path.splitext(path)[1].lower()
        if ext not in (".md", ".html", ".txt", ".json", ".css", ".js"):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
        except:
            continue
        original = content
        # Replace "SP Inmobiliaria" when it's text content, not in a path
        content = content.replace("SP Inmobiliaria", "Sp Leons Group")
        content = content.replace("SP_INMOBILIARIA", "SP_LEONS_GROUP")
        if content != original:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            fase2 += 1
            if fase2 <= 20:
                print(f"[OK] {os.path.relpath(path, BASE)}")

print(f"Fase 2: {fase2} archivos modificados")

# Update logo path references
print("\n--- FASE 3: Actualizar rutas de logo ---")
for root, dirs, files in os.walk(BASE):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for fname in files:
        path = os.path.join(root, fname)
        if should_skip(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
        except:
            continue
        original = content
        content = content.replace("logo Sp Leons Group.png", "logo Sp Leons Group.png")
        if content != original:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"[OK] {os.path.relpath(path, BASE)} [logo]")

print("\n[MIGRACION COMPLETADA]")
