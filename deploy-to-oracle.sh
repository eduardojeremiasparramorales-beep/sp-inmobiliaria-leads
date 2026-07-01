#!/bin/bash
# Script de deployment automático a Oracle Cloud
# Uso: ./deploy-to-oracle.sh <IP_ORACLE>

set -e

IP_ORACLE="${1:-}"

if [ -z "$IP_ORACLE" ]; then
  echo "❌ Error: Falta la IP de Oracle"
  echo "Uso: ./deploy-to-oracle.sh 123.456.789.101"
  exit 1
fi

echo "🚀 Iniciando deployment a Oracle Cloud..."
echo "   IP: $IP_ORACLE"

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

# PASO 3: Conectarse al servidor y actualizar
echo "📡 Paso 3/4: Actualizando código en servidor..."
ssh "ubuntu@$IP_ORACLE" << 'REMOTE_COMMANDS'
  set -e
  cd /home/ubuntu/sp-crm/app
  echo "  → Git pull..."
  git pull origin main
  echo "  → Cambios completados"
REMOTE_COMMANDS

# PASO 4: Reconstruir y reiniciar
echo "🔄 Paso 4/4: Reconstruyendo Docker..."
ssh "ubuntu@$IP_ORACLE" << 'REMOTE_COMMANDS'
  set -e
  cd /home/ubuntu/sp-crm/app
  echo "  → Deteniendo contenedor anterior..."
  docker compose down || true
  echo "  → Construyendo nueva imagen..."
  docker compose up -d --build
  echo "  → Esperando a que el CRM inicie..."
  sleep 5
  echo "  → Verificando logs..."
  docker compose logs --tail 10 crm
REMOTE_COMMANDS

echo ""
echo "✅ Deployment completado!"
echo ""
echo "📊 Pasos siguientes:"
echo "  1. Verifica https://sp-crm.duckdns.org"
echo "  2. Revisa logs: ssh ubuntu@$IP_ORACLE 'cd /home/ubuntu/sp-crm/app && docker compose logs -f crm'"
echo "  3. Test API: curl https://sp-crm.duckdns.org/api/stats -H 'Authorization: Bearer TU_TOKEN'"
