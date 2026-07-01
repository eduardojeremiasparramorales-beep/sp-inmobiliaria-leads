# Script de deployment automático a Oracle Cloud (PowerShell)
# Uso: .\deploy-to-oracle.ps1 -IP 123.456.789.101

param(
    [Parameter(Mandatory=$true, HelpMessage="IP pública del servidor Oracle")]
    [string]$IP
)

$ErrorActionPreference = "Continue"
$WarningPreference = "SilentlyContinue"

function Write-Success { Write-Host "✅ $args" -ForegroundColor Green }
function Write-Warning-Custom { Write-Host "⚠️  $args" -ForegroundColor Yellow }
function Write-Error-Custom { Write-Host "❌ $args" -ForegroundColor Red }
function Write-Info { Write-Host "📢 $args" -ForegroundColor Cyan }

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║        🚀 DEPLOYMENT CRM HACIA ORACLE CLOUD                    ║" -ForegroundColor Magenta
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""
Write-Info "Servidor Oracle: $IP"
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

# PASO 3: Actualizar código en servidor
Write-Info "PASO 3/4: Actualizando código en servidor..."

Write-Host "  → Conectando a servidor..."
$sshCmd = @"
cd /home/ubuntu/sp-crm/app
echo "  → Verificando rama..."
git branch
echo "  → Git pull..."
git pull origin main
echo "  → Última referencia:"
git log -1 --oneline
"@

ssh "ubuntu@$IP" $sshCmd
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "SSH falló. Verifica:"
    Write-Host "  1. La IP es correcta: $IP"
    Write-Host "  2. Puedes conectarte: ssh ubuntu@$IP"
    Write-Host "  3. Tu llave SSH está en ~/.ssh/id_ed25519"
    exit 1
}

Write-Success "Código actualizado en servidor"

# PASO 4: Reconstruir Docker
Write-Info "PASO 4/4: Reconstruyendo contenedores Docker..."

Write-Host "  → Deteniendo contenedor..."
ssh "ubuntu@$IP" "cd /home/ubuntu/sp-crm/app && docker compose down" 2>&1 | Out-Null

Write-Host "  → Construyendo imagen (esto puede tomar 2-3 minutos)..."
ssh "ubuntu@$IP" "cd /home/ubuntu/sp-crm/app && docker compose up -d --build" 2>&1 | Out-Null

Write-Host "  → Esperando que el CRM inicie..."
Start-Sleep -Seconds 5

Write-Host "  → Verificando logs..."
$logs = ssh "ubuntu@$IP" "cd /home/ubuntu/sp-crm/app && docker compose logs --tail 15 crm"
Write-Host $logs

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                   ✅ DEPLOYMENT COMPLETADO                     ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

Write-Info "Pasos siguientes:"
Write-Host "  1️⃣  Verifica el CRM: https://sp-crm.duckdns.org"
Write-Host ""
Write-Host "  2️⃣  Ver logs en vivo:"
Write-Host "      ssh ubuntu@$IP"
Write-Host "      cd /home/ubuntu/sp-crm/app && docker compose logs -f crm"
Write-Host ""
Write-Host "  3️⃣  Test API:"
Write-Host "      curl https://sp-crm.duckdns.org/"
Write-Host ""
Write-Host "  4️⃣  Si hay errores:"
Write-Host "      ssh ubuntu@$IP"
Write-Host "      cd /home/ubuntu/sp-crm/app && docker compose logs crm"
Write-Host ""
Write-Info "Documentación: C:\Sp Inmobiliaria\CHECKLIST_ACTUALIZACION.md"
Write-Host ""
