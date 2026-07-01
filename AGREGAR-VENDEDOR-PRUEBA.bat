@echo off
chcp 65001 >nul
cls

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║  SP CRM - Agregar Vendedor de Prueba                       ║
echo ║  Junio 28, 2026                                            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

echo ✓ Instalando sql.js (dependencia)...
echo.
call npm install sql.js --silent

if %errorlevel% neq 0 (
  echo ❌ Error al instalar sql.js
  echo.
  pause
  exit /b 1
)

echo.
echo ✓ Agregando vendedor de prueba a la base de datos...
echo.

node agregar-vendedor.js

if %errorlevel% equ 0 (
  echo.
  echo ╔════════════════════════════════════════════════════════════╗
  echo ║  ✅ Vendedor de prueba agregado                             ║
  echo ╚════════════════════════════════════════════════════════════╝
  echo.
  echo Próximos pasos:
  echo.
  echo 1. Inicia el servidor local:
  echo    npm start
  echo.
  echo 2. Abre el dashboard:
  echo    http://localhost:3000/dashboard
  echo.
  echo 3. Deberías ver el vendedor en la lista
  echo.
  echo El sistema está listo para recibir leads y asignarlos.
  echo.
) else (
  echo.
  echo ❌ Error al agregar vendedor
  echo.
)

pause
