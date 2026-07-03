#!/bin/bash
# backup.sh — Backup diario de la base de datos del CRM
# Ejecutar con cron: 0 3 * * * /home/ubuntu/sp-crm/app/deploy/backup.sh

set -e

BACKUP_DIR="/home/ubuntu/backups"
APP_DIR="/home/ubuntu/sp-crm/app"
DB_PATH="$APP_DIR/data/sp-leads.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

# Backup con timestamp
cp "$DB_PATH" "$BACKUP_DIR/sp-leads-$TIMESTAMP.db"

# Comprimir
gzip -f "$BACKUP_DIR/sp-leads-$TIMESTAMP.db"

# Limpiar backups antiguos
find "$BACKUP_DIR" -name "sp-leads-*.db.gz" -mtime +$RETENTION_DAYS -delete

# Mantener solo los últimos 60 backups
ls -t "$BACKUP_DIR"/sp-leads-*.db.gz 2>/dev/null | tail -n +61 | xargs rm -f 2>/dev/null

echo "[$(date)] Backup completado: sp-leads-$TIMESTAMP.db.gz" >> "$BACKUP_DIR/backup.log"
