# Script de deployment automático a Google Cloud (PowerShell)
# Uso: .\deploy-to-gcp.ps1 -Project <PROJECT_ID> -Instance <INSTANCE_NAME> -Zone <ZONE>

param(
    [Parameter(Mandatory=$true, HelpMessage="Google Cloud Project ID")]
    [string]$Project,

    [Parameter(Mandatory=$true, HelpMessage="Nombre de la instancia VM")]
    [string]$Instance,

    [Parameter(Mandatory=$true, HelpMessage="Zona (ej: us-central1-a)")]
    [string]$Zone
)

$ErrorActionPreference = "Continue"
$WarningPreference = "SilentlyContinue"

function Write-Success { Write-Host "✅ $args" -ForegroundColor Green }
function Write-Warning-Custom { Write-Host "⚠️  $args" -ForegroundColor Yellow }
function Write-Error-Custom { Write-Host "❌ $args" -ForegroundColor Red }
function Write-Info { Write-Host "📢 $args" -ForegroundColor Cyan }

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║        🚀 DEPLOYMENT CRM HACIA GOOGLE CLOUD                    ║" -ForegroundColor Magenta
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""
Write-Info "Google Cloud Project: $Project"
Write-Info "Instancia: $Instance"
Write-Info "Zona: $Zone"
Write-Info "Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# PASO 0: Verificar que estamos en la carpeta correcta
if (-not (Test-Path ".git")) {
    Write-Error-Custom "No estamos en el directorio del repositorio"
    Write-Info "Por favor ejecutar desde: C:\Sp Inmobiliaria\sp-inmobiliaria-leads-UPDATED"
    exit 1
}

Write-Success "Directorio correcto detectado"

# PASO 1: Verificar git
Write-Info "PASO 1/4: Verificando cambios en git..."

$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Warning-Custom "Hay cambios sin commit"
    Write-Host $gitStatus
    Write-Info "Haciendo commit automático..."
    git add . 2>&1 | Out-Null
    $commitDate = Get-Date -Format "yyyy-MM-dd"
    git commit -m "chore: actualización automática $commitDate" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Cambios comprometidos"
    }
} else {
    Write-Success "Sin cambios pendientes"
}

# PASO 2: Push a GitHub
Write-Info "PASO 2/4: Push a GitHub..."
git push origin main 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Success "Push completado"
} else {
    Write-Warning-Custom "Push falló (continuando...)"
}

# PASO 3: Actualizar código en servidor GCP
Write-Info "PASO 3/4: Actualizando código en Google Cloud..."

Write-Host "  → Conectando a instancia GCP..."

$gcloudCmd = @"
cd /home/\$(whoami)/sp-crm/app 2>/dev/null || cd /root/sp-crm/app
echo "  → Verificando rama..."
git branch
echo "  → Git pull..."
git pull origin main
echo "  → Última referencia:"
git log -1 --oneline
"@

# Ejecutar comando en GCP usando gcloud
gcloud compute ssh `
    "$Instance" `
    --project="$Project" `
    --zone="$Zone" `
    --command=$gcloudCmd `
    2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "gcloud ssh falló. Verifica:"
    Write-Host "  1. Google Cloud CLI instalado: gcloud --version"
    Write-Host "  2. Autenticación: gcloud auth login"
    Write-Host "  3. Project ID correcto: $Project"
    Write-Host "  4. Instance name correcto: $Instance"
    Write-Host "  5. Zone correcta: $Zone"
    Write-Host ""
    Write-Host "  Alternativa: Usa Cloud Shell en la consola de GCP"
    exit 1
}

Write-Success "Código actualizado en GCP"

# PASO 4: Reconstruir Docker
Write-Info "PASO 4/4: Reconstruyendo contenedores Docker..."

Write-Host "  → Deteniendo contenedor..."
gcloud compute ssh "$Instance" --project="$Project" --zone="$Zone" `
    --command="cd /home/\$(whoami)/sp-crm/app 2>/dev/null || cd /root/sp-crm/app; docker compose down" 2>&1 | Out-Null

Write-Host "  → Construyendo imagen (esto puede tomar 2-3 minutos)..."
gcloud compute ssh "$Instance" --project="$Project" --zone="$Zone" `
    --command="cd /home/\$(whoami)/sp-crm/app 2>/dev/null || cd /root/sp-crm/app; docker compose up -d --build" 2>&1 | Out-Null

Write-Host "  → Esperando que el CRM inicie..."
Start-Sleep -Seconds 5

Write-Host "  → Verificando logs..."
$logs = gcloud compute ssh "$Instance" --project="$Project" --zone="$Zone" `
    --command="cd /home/\$(whoami)/sp-crm/app 2>/dev/null || cd /root/sp-crm/app; docker compose logs --tail 15 crm"

Write-Host $logs

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                   ✅ DEPLOYMENT COMPLETADO                     ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

Write-Info "Pasos siguientes:"
Write-Host "  1️⃣  Obtén la IP externa de tu instancia:"
Write-Host "      gcloud compute instances describe $Instance --project=$Project --zone=$Zone --format='get(networkInterfaces[0].accessConfigs[0].natIp)'"
Write-Host ""
Write-Host "  2️⃣  Verifica el CRM: https://<TU_IP_EXTERNA>"
Write-Host ""
Write-Host "  3️⃣  Ver logs en vivo (desde Cloud Shell o gcloud):"
Write-Host "      gcloud compute ssh $Instance --project=$Project --zone=$Zone"
Write-Host "      cd /home/\$(whoami)/sp-crm/app && docker compose logs -f crm"
Write-Host ""
Write-Host "  4️⃣  Si hay errores:"
Write-Host "      gcloud compute ssh $Instance --project=$Project --zone=$Zone"
Write-Host "      cd /home/\$(whoami)/sp-crm/app && docker compose logs crm"
Write-Host ""
Write-Info "Documentación: C:\Sp Inmobiliaria\ACTUALIZACION_GCP.md"
Write-Host ""
