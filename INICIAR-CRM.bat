@echo off
REM ============================================================
REM  SP Inmobiliaria - Lanzador del CRM + Tunel Cloudflare
REM  Arranca el servidor en localhost:3000 y lo expone por HTTPS.
REM  La URL publica queda en C:\Sp Inmobiliaria\tunnel-url.log
REM ============================================================

set "APP=C:\Sp Inmobiliaria\sp-inmobiliaria-leads-UPDATED"
set "TUNNEL=C:\Sp Inmobiliaria\cloudflared.exe"
set "TLOG=C:\Sp Inmobiliaria\tunnel-url.log"

cd /d "%APP%"

REM 1) Arrancar el CRM (Node) en ventana minimizada
start "SP-CRM" /min cmd /c "node src\index.js >> data\crm-runtime.log 2>&1"

REM 2) Esperar a que el servidor levante
timeout /t 4 /nobreak >nul

REM 3) Arrancar el tunel; cloudflared escribe sus logs (con la URL) en --logfile
if exist "%TLOG%" del "%TLOG%"
start "SP-Tunnel" /min "%TUNNEL%" tunnel --url http://localhost:3000 --logfile "%TLOG%"

echo.
echo  CRM y tunel iniciados. La URL publica aparece en:
echo  %TLOG%
echo.
