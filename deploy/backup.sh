#!/bin/bash
# backup.sh — Backup automático de DB y .env del CRM
# Instalar en cron: 0 3 * * * /home/ubuntu/sp-crm/app/deploy/backup.sh
set -euo pipefail

SRC="/home/ubuntu/sp-crm/app"
DST="/home/ubuntu/sp-crm/backups"
RETENTION=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$DST"

# Backup de la base de datos
if [ -f "$SRC/data/sp-leads.db" ]; then
    cp "$SRC/data/sp-leads.db" "$DST/sp-leads_$TIMESTAMP.db"
    gzip "$DST/sp-leads_$TIMESTAMP.db"
    echo "DB backed up: sp-leads_$TIMESTAMP.db.gz"
fi

# Backup del .env (sin token real por seguridad, solo estructura)
if [ -f "$SRC/.env" ]; then
    grep -v '^WHATSAPP_TOKEN=' "$SRC/.env" > "$DST/env_$TIMESTAMP.txt"
    echo "Config backed up (token excluded)"
fi

# Limpiar backups viejos
find "$DST" -name "sp-leads_*.db.gz" -mtime +$RETENTION -delete
find "$DST" -name "env_*.txt" -mtime +$RETENTION -delete
echo "Cleaned backups older than $RETENTION days"
