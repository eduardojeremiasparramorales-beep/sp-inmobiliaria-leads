#!/bin/bash
# backup.sh — Backup diario de la base de datos del CRM + archivos multimedia
# Ejecutar con cron: 0 3 * * * /home/ubuntu/sp-crm/app/deploy/backup.sh

set -e

BACKUP_DIR="/home/ubuntu/backups"
APP_DIR="/home/ubuntu/sp-crm/app"
DB_PATH="$APP_DIR/data/sp-leads.db"
MEDIA_DIR="$APP_DIR/data/media"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

# Checkpoint del WAL antes de copiar: en modo WAL, escrituras recientes pueden vivir
# solo en sp-leads.db-wal y no en el .db — sin esto, un backup por simple cp puede
# omitir mensajes/leads guardados justo antes del backup.
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" || true
fi

# Backup de la base de datos
cp "$DB_PATH" "$BACKUP_DIR/sp-leads-$TIMESTAMP.db"
gzip -f "$BACKUP_DIR/sp-leads-$TIMESTAMP.db"

# Backup de media (fotos, notas de voz, documentos adjuntos): sin esto, restaurar
# la DB deja todos los mensajes con media apuntando a archivos que ya no existen.
if [ -d "$MEDIA_DIR" ] && [ "$(ls -A "$MEDIA_DIR" 2>/dev/null)" ]; then
  tar -czf "$BACKUP_DIR/sp-media-$TIMESTAMP.tar.gz" -C "$APP_DIR/data" media
fi

# Limpiar backups antiguos (DB y media)
find "$BACKUP_DIR" -name "sp-leads-*.db.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "sp-media-*.tar.gz" -mtime +$RETENTION_DAYS -delete

# Mantener solo los últimos 60 backups de cada tipo
ls -t "$BACKUP_DIR"/sp-leads-*.db.gz 2>/dev/null | tail -n +61 | xargs rm -f 2>/dev/null
ls -t "$BACKUP_DIR"/sp-media-*.tar.gz 2>/dev/null | tail -n +61 | xargs rm -f 2>/dev/null

echo "[$(date)] Backup completado: sp-leads-$TIMESTAMP.db.gz + sp-media-$TIMESTAMP.tar.gz" >> "$BACKUP_DIR/backup.log"
