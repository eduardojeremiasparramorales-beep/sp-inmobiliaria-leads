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

# Copia fuera de la VM (Fase 1.3, docs/AUDITORIA_2026-08.md 3.3): hasta aquí, la BD y
# todos sus backups viven en el mismo disco de la misma e2-micro — si se pierde la VM
# (disco, borrado accidental, facturación), se pierde todo a la vez. Si GCS_BACKUP_BUCKET
# está configurado (export en el entorno del cron, o en /etc/environment) y `gsutil` está
# disponible, sube el backup de esta corrida a un bucket de Google Cloud Storage. Falla
# en silencio (best-effort) para no romper el backup local, que es lo prioritario.
if [ -n "$GCS_BACKUP_BUCKET" ] && command -v gsutil >/dev/null 2>&1; then
  gsutil -q cp "$BACKUP_DIR/sp-leads-$TIMESTAMP.db.gz" "gs://$GCS_BACKUP_BUCKET/sp-leads/" \
    && echo "[$(date)] Subido a gs://$GCS_BACKUP_BUCKET/sp-leads/" >> "$BACKUP_DIR/backup.log" \
    || echo "[$(date)] ERROR subiendo sp-leads-$TIMESTAMP.db.gz a GCS" >> "$BACKUP_DIR/backup.log"
  if [ -f "$BACKUP_DIR/sp-media-$TIMESTAMP.tar.gz" ]; then
    gsutil -q cp "$BACKUP_DIR/sp-media-$TIMESTAMP.tar.gz" "gs://$GCS_BACKUP_BUCKET/sp-media/" \
      || echo "[$(date)] ERROR subiendo sp-media-$TIMESTAMP.tar.gz a GCS" >> "$BACKUP_DIR/backup.log"
  fi
fi

echo "[$(date)] Backup completado: sp-leads-$TIMESTAMP.db.gz + sp-media-$TIMESTAMP.tar.gz" >> "$BACKUP_DIR/backup.log"
