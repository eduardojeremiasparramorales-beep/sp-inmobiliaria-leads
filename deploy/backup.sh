#!/bin/bash
# Backup diario del SQLite — agregar al cron
# crontab -e → 0 3 * * * /home/ubuntu/sp-crm/app/deploy/backup.sh

DB_PATH="/home/ubuntu/sp-crm/app/data/sp-leads.db"
BACKUP_DIR="/home/ubuntu/sp-crm/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
cp "$DB_PATH" "$BACKUP_DIR/sp-leads-$DATE.db"

# Mantener solo los últimos 30 backups
ls -t "$BACKUP_DIR"/*.db | tail -n +31 | xargs -r rm

echo "Backup completado: $BACKUP_DIR/sp-leads-$DATE.db"
