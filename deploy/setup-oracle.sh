#!/bin/bash
# =============================================================================
# setup-oracle.sh — SP Inmobiliaria CRM
# Setup completo para VM Ubuntu 22.04 en Oracle Cloud Free Tier
# Uso: sudo ./setup-oracle.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step() { echo -e "\n${BLUE}▶ $1${NC}"; }
log_ok()   { echo -e "${GREEN}✔ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
log_info() { echo -e "${CYAN}  $1${NC}"; }

if [[ "$EUID" -ne 0 ]]; then
    echo -e "${RED}✖ Ejecutar como root: sudo ./setup-oracle.sh${NC}"
    exit 1
fi

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║     SP Inmobiliaria — Oracle Cloud VM Setup          ║"
echo "║     Ubuntu 22.04 LTS — Docker + Caddy + CRM         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# =============================================================================
# PASO 1 — ACTUALIZAR SISTEMA
# =============================================================================

log_step "PASO 1/6 — Actualizando paquetes del sistema..."

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq \
    -o Dpkg::Options::="--force-confdef" \
    -o Dpkg::Options::="--force-confold"

apt-get install -y -qq \
    curl wget gnupg ca-certificates lsb-release \
    apt-transport-https software-properties-common \
    ufw fail2ban unzip jq

log_ok "Sistema actualizado."

# =============================================================================
# PASO 2 — DOCKER
# =============================================================================

log_step "PASO 2/6 — Instalando Docker..."

if command -v docker &>/dev/null; then
    log_warn "Docker ya instalado: $(docker --version)"
else
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        | tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    log_ok "Docker instalado: $(docker --version)"
fi

if ! command -v docker-compose &>/dev/null; then
    COMPOSE_VER=$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest \
        | grep '"tag_name"' | cut -d'"' -f4 || echo "v2.27.0")
    curl -fsSL \
        "https://github.com/docker/compose/releases/download/${COMPOSE_VER}/docker-compose-linux-$(uname -m)" \
        -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    log_ok "docker-compose instalado: $(docker-compose --version)"
fi

id ubuntu &>/dev/null && usermod -aG docker ubuntu
systemctl enable docker --quiet && systemctl start docker
log_ok "Docker en ejecución."

# =============================================================================
# PASO 3 — CADDY
# =============================================================================

log_step "PASO 3/6 — Instalando Caddy (HTTPS automático)..."

if command -v caddy &>/dev/null; then
    log_warn "Caddy ya instalado: $(caddy version)"
else
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
        | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
    apt-get update -qq && apt-get install -y -qq caddy
    log_ok "Caddy instalado: $(caddy version)"
fi

CADDYFILE="/etc/caddy/Caddyfile"
[[ -f "$CADDYFILE" ]] && cp "$CADDYFILE" "${CADDYFILE}.backup.$(date +%s)"

cat > "$CADDYFILE" <<'EOF'
# =============================================================================
# Caddyfile — SP Inmobiliaria CRM
# Reemplaza TU_DOMINIO por tu dominio real (ej: sp-crm.duckdns.org)
# SSL automático via Let's Encrypt — no necesitas hacer nada más.
# =============================================================================

# Con dominio (producción):
# TU_DOMINIO {
#     reverse_proxy localhost:3000
#     encode gzip
# }

# Sin dominio (prueba por IP):
:80 {
    reverse_proxy localhost:3000
}
EOF

mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy
systemctl enable caddy --quiet
systemctl restart caddy || log_warn "Caddy iniciará cuando el dominio esté configurado."
log_ok "Caddy configurado."

# =============================================================================
# PASO 4 — DIRECTORIOS
# =============================================================================

log_step "PASO 4/6 — Creando estructura de directorios..."

CRM_BASE="/home/ubuntu/sp-crm"
for DIR in "$CRM_BASE/data" "$CRM_BASE/logs" "$CRM_BASE/backups"; do
    mkdir -p "$DIR" && log_ok "Creado: $DIR"
done

id ubuntu &>/dev/null && chown -R ubuntu:ubuntu "$CRM_BASE"

log_ok "Directorios listos en $CRM_BASE"

# =============================================================================
# PASO 5 — FIREWALL (UFW + iptables Oracle)
# =============================================================================

log_step "PASO 5/6 — Configurando firewall..."

# UFW
ufw --force reset > /dev/null 2>&1 || true
ufw default deny incoming > /dev/null 2>&1
ufw default allow outgoing > /dev/null 2>&1
for PORT in 22 80 443 3000; do
    ufw allow "${PORT}/tcp" > /dev/null 2>&1
done
ufw --force enable > /dev/null 2>&1
log_ok "UFW configurado: puertos 22, 80, 443, 3000"

# iptables (Oracle Cloud los bloquea por defecto)
for PORT in 22 80 443 3000; do
    if ! iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null; then
        iptables -I INPUT -p tcp --dport "$PORT" -j ACCEPT
    fi
done

DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iptables-persistent
netfilter-persistent save > /dev/null 2>&1
log_ok "iptables persistido para Oracle Cloud."

# =============================================================================
# PASO 6 — HABILITAR SERVICIOS + CRON
# =============================================================================

log_step "PASO 6/6 — Habilitando servicios al inicio + backup automático..."

for SVC in docker caddy fail2ban; do
    systemctl enable "$SVC" --quiet 2>/dev/null && log_ok "$SVC habilitado."
done

# Backup automático diario (3 AM)
(crontab -l 2>/dev/null | grep -v 'backup.sh'; echo "0 3 * * * /home/ubuntu/sp-crm/app/deploy/backup.sh") | crontab -
log_ok "Backup automático configurado (diario 3 AM)"

# =============================================================================
# VERIFICACIÓN FINAL
# =============================================================================

PUBLIC_IP=$(curl -fsSL --connect-timeout 5 https://ipv4.icanhazip.com 2>/dev/null || echo "VERIFICAR_EN_ORACLE")

echo ""
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              SETUP COMPLETADO — SP Inmobiliaria CRM         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "  IP pública: ${CYAN}$PUBLIC_IP${NC}"
echo ""
echo -e "${YELLOW}PRÓXIMOS PASOS:${NC}"
echo ""
echo "  1. Clonar el CRM:"
echo "     git clone https://github.com/eduardojeremiasparramorales-beep/sp-inmobiliaria-leads.git /home/ubuntu/sp-crm/app"
echo ""
echo "  2. Configurar .env:"
echo "     cp /home/ubuntu/sp-crm/app/.env.example /home/ubuntu/sp-crm/app/.env"
echo "     nano /home/ubuntu/sp-crm/app/.env"
echo ""
echo "  3. Lanzar el CRM:"
echo "     cd /home/ubuntu/sp-crm/app && docker compose up -d --build"
echo ""
echo "  4. Apuntar DuckDNS a esta IP: $PUBLIC_IP"
echo "     Luego editar /etc/caddy/Caddyfile con tu dominio"
echo "     systemctl reload caddy"
echo ""
echo -e "  ${RED}IMPORTANTE — Oracle Console:${NC} Abrir puertos 80 y 443 en:"
echo "  OCI Console → Networking → VCN → Security Lists → Default → Ingress Rules"
echo ""
