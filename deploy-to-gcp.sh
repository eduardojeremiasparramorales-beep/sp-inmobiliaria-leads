#!/bin/bash
# Script de deployment automático a Google Cloud
# Uso: ./deploy-to-gcp.sh PROJECT_ID INSTANCE_NAME ZONE

set -e

PROJECT_ID="${1:-}"
INSTANCE_NAME="${2:-}"
ZONE="${3:-}"

if [ -z "$PROJECT_ID" ] || [ -z "$INSTANCE_NAME" ] || [ -z "$ZONE" ]; then
  echo "❌ Error: Faltan parámetros"
  echo "Uso: ./deploy-to-gcp.sh <PROJECT_ID> <INSTANCE_NAME> <ZONE>"
  echo "Ejemplo: ./deploy-to-gcp.sh mi-proyecto sp-crm-server us-central1-a"
  exit 1
fi

echo "🚀 Iniciando deployment a Google Cloud..."
echo "   Proyecto: $PROJECT_ID"
echo "   Instancia: $INSTANCE_NAME"
echo "   Zona: $ZONE"

# PASO 1: Verificar git
echo "📦 Paso 1/4: Verificando cambios en git..."
if ! git diff-index --quiet HEAD --; then
  echo "⚠️  Hay cambios sin commit. Haciendo commit..."
  git add .
  git commit -m "chore: actualización automática $(date +%Y-%m-%d)" || true
fi

# PASO 2: Push a GitHub
echo "📤 Paso 2/4: Push a GitHub..."
git push origin main || echo "⚠️  Push falló, continuando..."

# PASO 3: Conectarse a servidor GCP y actualizar
echo "📡 Paso 3/4: Actualizando código en Google Cloud..."
gcloud compute ssh "$INSTANCE_NAME" \
  --project="$PROJECT_ID" \
  --zone="$ZONE" \
  --command="
    cd /home/\$(whoami)/sp-crm/app 2>/dev/null || cd /root/sp-crm/app
    echo '  → Git pull...'
    git pull origin main
    echo '  → Cambios completados'
  "

# PASO 4: Reconstruir y reiniciar
echo "🔄 Paso 4/4: Reconstruyendo Docker..."
gcloud compute ssh "$INSTANCE_NAME" \
  --project="$PROJECT_ID" \
  --zone="$ZONE" \
  --command="
    cd /home/\$(whoami)/sp-crm/app 2>/dev/null || cd /root/sp-crm/app
    echo '  → Deteniendo contenedor anterior...'
    docker compose down || true
    echo '  → Construyendo nueva imagen...'
    docker compose up -d --build
    echo '  → Esperando a que el CRM inicie...'
    sleep 5
    echo '  → Verificando logs...'
    docker compose logs --tail 10 crm
  "

echo ""
echo "✅ Deployment completado!"
echo ""
echo "📊 Pasos siguientes:"
echo "  1. Obtén la IP externa:"
echo "     gcloud compute instances describe $INSTANCE_NAME --project=$PROJECT_ID --zone=$ZONE --format='get(networkInterfaces[0].accessConfigs[0].natIp)'"
echo "  2. Accede a: https://<TU_IP_EXTERNA>"
echo "  3. Revisa logs: gcloud compute ssh $INSTANCE_NAME --project=$PROJECT_ID --zone=$ZONE"
echo "     Luego: cd /home/\$(whoami)/sp-crm/app && docker compose logs -f crm"
