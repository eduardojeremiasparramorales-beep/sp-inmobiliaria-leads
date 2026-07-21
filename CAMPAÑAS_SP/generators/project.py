import os
import json
import shutil

class Project:
    def __init__(self, config_path=None):
        self.name = ""
        self.location = ""
        self.description = ""
        self.price = ""
        self.price_currency = "COP"
        self.area = ""
        self.features = []
        self.highlights = []
        self.whatsapp = "+57 321 462 5618"
        self.cta = "SOLICITA INFORMACIÓN"
        self.cta_secondary = "CONOCE EL PROYECTO"
        self.hashtags = []
        self.images = {}
        self.image_dir = ""
        self.config_path = config_path
        if config_path and os.path.exists(config_path):
            self.load(config_path)

    def load(self, path):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        proj = data.get("project", data)
        self.name = proj.get("name", self.name)
        self.location = proj.get("location", self.location)
        self.description = proj.get("description", self.description)
        self.price = proj.get("price", self.price)
        self.price_currency = proj.get("price_currency", self.price_currency)
        self.area = proj.get("area", self.area)
        self.features = proj.get("features", self.features)
        self.highlights = proj.get("highlights", self.highlights)
        self.whatsapp = proj.get("whatsapp", self.whatsapp)
        self.cta = proj.get("cta", self.cta)
        self.cta_secondary = proj.get("cta_secondary", self.cta_secondary)
        self.hashtags = proj.get("hashtags", self.hashtags)
        self.images = data.get("images", {})
        base_dir = os.path.dirname(path)
        self.image_dir = os.path.join(base_dir, "images") if os.path.isdir(os.path.join(base_dir, "images")) else base_dir
        self.config_path = path

    def get_image(self, key):
        if key in self.images:
            candidate = os.path.join(self.image_dir, self.images[key])
            if os.path.exists(candidate):
                return candidate
        return None

    def assign_images_auto(self, directory):
        self.image_dir = directory
        exts = (".jpg", ".jpeg", ".png", ".webp")
        files = sorted([f for f in os.listdir(directory) if f.lower().endswith(exts)])
        keys = ["portada", "destacado", "inversionistas", "familias",
                "confianza", "precio", "escasez", "ubicacion", "beneficios"]
        for i, key in enumerate(keys):
            if i < len(files):
                self.images[key] = files[i]

    def save(self, path=None):
        path = path or self.config_path
        data = {
            "project": {
                "name": self.name,
                "location": self.location,
                "description": self.description,
                "price": self.price,
                "price_currency": self.price_currency,
                "area": self.area,
                "features": self.features,
                "highlights": self.highlights,
                "whatsapp": self.whatsapp,
                "cta": self.cta,
                "cta_secondary": self.cta_secondary,
                "hashtags": self.hashtags
            },
            "images": self.images
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return path

    def available_images(self):
        return [k for k, v in self.images.items() if self.get_image(k)]

    @property
    def slug(self):
        return self.name.lower().replace(" ", "-").replace("ñ", "n")
