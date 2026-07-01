@echo off
chcp 65001 >nul
cls

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║  SP CRM - Obtener URL de Railway                           ║
echo ║  Junio 28, 2026                                            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

echo INSTRUCCIONES PARA OBTENER URL DE RAILWAY:
echo.
echo 1. Abre tu navegador y ve a: https://railway.app
echo 2. Inicia sesión (si es necesario)
echo 3. Haz clic en proyecto: sp-inmobiliaria-leads
echo 4. Haz clic en servicio: "main" (donde dice "Online")
echo 5. Ve a pestaña: "Deployments"
echo 6. Busca la URL que empieza con https://
echo.
echo EJEMPLO: https://sp-crm-production-abc123.railway.app
echo.
echo Una vez que tengas la URL, cópiala (Ctrl+C) cuando te lo pida.
echo.
pause

echo.
echo Ahora ejecutaremos el configurador:
echo.

cd /d "%~dp0"
node configurar-webhook.js

echo.
pause
