#!/usr/bin/env python3
"""
Generador AI para Campañas SP.
Usa Google Gemini (gratis) para:
1. Analizar imágenes de proyecto → extraer nombre, ubicación, features
2. Generar fondos publicitarios para assets

GOOGLE_API_KEY debe estar en el .env del CRM.
"""

import os
import sys
import json
import base64
import io
import time

IMAGENES_PERMITIDAS = {'.png', '.jpg', '.jpeg', '.webp'}

def _client():
    from google import genai
    from google.genai import types
    api_key = os.environ.get('GOOGLE_API_KEY')
    if not api_key:
        # Try reading from .env file
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
        if os.path.exists(env_path):
            for line in open(env_path):
                if line.startswith('GOOGLE_API_KEY='):
                    api_key = line.strip().split('=', 1)[1].strip().strip('"').strip("'")
                    break
    if not api_key:
        raise ValueError("GOOGLE_API_KEY no configurada en .env ni en variables de entorno")
    return genai.Client(api_key=api_key), types

def analyze_images(image_paths):
    """Analiza imágenes de proyecto y devuelve JSON estructurado."""
    client, types = _client()
    model = "gemini-2.0-flash-001"

    # Cargar imágenes como partes
    parts = []
    for path in image_paths[:5]:  # máximo 5 imágenes
        if not os.path.exists(path):
            continue
        ext = os.path.splitext(path)[1].lower()
        if ext not in IMAGENES_PERMITIDAS:
            continue
        mime = 'image/png' if ext == '.png' else 'image/jpeg'
        with open(path, 'rb') as f:
            data = f.read()
        parts.append(types.Part.from_bytes(data=data, mime_type=mime))

    if not parts:
        return {"error": "No se pudieron cargar imágenes"}

    prompt = (
        "Eres un experto en proyectos inmobiliarios colombianos. Analiza estas imágenes "
        "y devuelve SOLO JSON sin explicaciones con esta estructura exacta:\n"
        "{\n"
        '  "nombre_sugerido": "Nombre del proyecto",\n'
        '  "ubicacion": "Ciudad, Departamento",\n'
        '  "tipo": "urbanizacion|finca|lote|edificio",\n'
        '  "features": ["Feature 1", "Feature 2", "Feature 3", "Feature 4"],\n'
        '  "precio_visible": null o "Desde $X",\n'
        '  "area_visible": null o "XXm2",\n'
        '  "mejor_imagen_portada": nombre del archivo que mejor sirve como portada,\n'
        '  "categorias": {\n'
        '    "portada": ["archivo1.jpg"],\n'
        '    "destacado": ["archivo2.jpg"],\n'
        '    "ubicacion": [],\n'
        '    "beneficios": [],\n'
        '    "amenidades": []\n'
        "  }\n"
        "}\n"
        "Categoriza cada imagen según su contenido (vista aérea, ubicación, amenities, etc).\n"
        "Si no puedes determinar un valor, pon null o array vacío."
    )

    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=model,
                contents=[prompt] + parts,
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=1024,
                ),
            )
            text = response.text.strip()
            # Extraer JSON del texto
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text)
        except Exception as e:
            if attempt < 2:
                time.sleep(2)
                continue
            return {"error": str(e), "nombre_sugerido": None}

def generate_background(prompt, output_path, width=1080, height=1080, ref_image_path=None):
    """Genera un fondo publicitario con Gemini."""
    client, types = _client()
    model = "gemini-2.5-flash-image"

    # Determinar aspect ratio para Gemini
    aspect_map = {
        (1080, 1080): "1:1",
        (1080, 1350): "4:5",
        (1920, 1080): "16:9",
        (1080, 1920): "9:16",
        (1200, 628): "16:9",
    }
    aspect = aspect_map.get((width, height), "1:1")

    parts = []

    # Si hay imagen de referencia, pasarla para estilo
    if ref_image_path and os.path.exists(ref_image_path):
        ext = os.path.splitext(ref_image_path)[1].lower()
        mime = 'image/png' if ext == '.png' else 'image/jpeg'
        with open(ref_image_path, 'rb') as f:
            data = f.read()
        parts.append(types.Part.from_bytes(data=data, mime_type=mime))
        full_prompt = (
            f"Genera un fondo publicitario de alta calidad para un proyecto inmobiliario "
            f"colombiano que coincida con el estilo visual de la imagen de referencia. "
            f"{prompt}"
        )
    else:
        full_prompt = prompt

    parts.append(full_prompt)

    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=model,
                contents=parts,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(
                        aspect_ratio=aspect,
                    ),
                ),
            )
            for part in response.candidates[0].content.parts:
                if hasattr(part, "inline_data") and part.inline_data:
                    img_bytes = part.inline_data.data
                    os.makedirs(os.path.dirname(output_path), exist_ok=True)
                    with open(output_path, 'wb') as f:
                        f.write(img_bytes)
                    return output_path
            raise RuntimeError("No image data in Gemini response")
        except Exception as e:
            if attempt < 2:
                time.sleep(3)
                continue
            raise

def main():
    """CLI: recibe JSON por stdin y ejecuta la acción solicitada."""
    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "error": f"JSON invalido: {e}"}))
        sys.exit(1)

    action = data.get("action", "analyze")

    if action == "analyze":
        image_paths = data.get("images", [])
        result = analyze_images(image_paths)
        print(json.dumps(result, ensure_ascii=False))

    elif action == "generate_background":
        prompt = data.get("prompt", "Fondo oscuro premium para proyecto inmobiliario")
        output_path = data.get("output_path", "")
        width = data.get("width", 1080)
        height = data.get("height", 1080)
        ref_image = data.get("ref_image")
        try:
            result_path = generate_background(prompt, output_path, width, height, ref_image)
            print(json.dumps({"ok": True, "path": result_path}))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            sys.exit(1)

    else:
        print(json.dumps({"ok": False, "error": f"Acción desconocida: {action}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
