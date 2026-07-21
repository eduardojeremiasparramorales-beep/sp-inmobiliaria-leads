import os
from PIL import ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def _detect_root():
    if os.path.isdir('/home/ubuntu/sp-crm/app'):
        return '/home/ubuntu/sp-crm/app'
    if os.path.isdir(r'C:\Sp Leons'):
        return r'C:\Sp Leons'
    if os.path.isdir(r'C:\Sp Inmobiliaria'):
        return r'C:\Sp Inmobiliaria'
    return os.path.join(BASE, '..')

PROJECT_ROOT = _detect_root()

def _find_font_dir():
    # First: CAMPAÑAS_SP/assets (bundled in repo)
    local = os.path.join(BASE, 'assets')
    if os.path.isdir(local):
        return local
    # Fallback: CAMPAÑA_PRINCIPAL/fonts in project root
    campana = os.path.join(PROJECT_ROOT, 'CAMPAÑA_PRINCIPAL', 'fonts')
    if os.path.isdir(campana):
        return campana
    return local

class Brand:
    NEGRO = (10, 10, 10)
    ORO = (200, 164, 90)
    VERDE = (78, 123, 70)
    MARFIL = (245, 242, 235)
    GRIS = (109, 109, 109)

    NEGRO_HEX = "#0A0A0A"
    ORO_HEX = "#C8A45A"
    VERDE_HEX = "#4E7B46"
    MARFIL_HEX = "#F5F2EB"
    GRIS_HEX = "#6D6D6D"

    LOGO_PATH = os.path.join(BASE, 'assets', 'logo.png')
    FONT_DIR = _find_font_dir()
    FONT_FALLBACK = None  # Will try system fonts dynamically

    WHATSAPP = "+57 321 462 5618"
    INSTAGRAM = "@sp.leons.group"
    FACEBOOK = "Sp Leons Group"

    @staticmethod
    def get_font(name, size):
        # Try exact name in FONT_DIR
        path = os.path.join(Brand.FONT_DIR, name)
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except:
                pass
        # Try system fonts
        system_fonts = [
            r"C:\Windows\Fonts\arialbd.ttf",
            r"C:\Windows\Fonts\arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        ]
        for sf in system_fonts:
            if os.path.exists(sf):
                try:
                    return ImageFont.truetype(sf, size)
                except:
                    pass
        return ImageFont.load_default()

    @staticmethod
    def font_cinzel(size):
        return Brand.get_font("Cinzel.ttf", size)

    @staticmethod
    def font_inter(size):
        return Brand.get_font("Inter.ttf", size)

    @staticmethod
    def font_cormorant(size):
        return Brand.get_font("CormorantGaramond.ttf", size)
