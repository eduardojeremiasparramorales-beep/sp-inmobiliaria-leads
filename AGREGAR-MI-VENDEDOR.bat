@echo off
chcp 65001 >nul
cls

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║  SP CRM - Agregar tu Primer Vendedor                       ║
echo ║                                                            ║
echo ║  Teléfono: +57 3224312518                                  ║
echo ║  Nombre: Vendedor Principal                                ║
echo ║                                                            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

echo Verificando dependencias...
echo.

REM Verificar si sql.js está instalado
if not exist "node_modules\sql.js" (
  echo Instalando sql.js...
  call npm install sql.js --silent
  if %errorlevel% neq 0 (
    echo.
    echo ❌ Error al instalar sql.js
    echo Intenta manualmente:
    echo   npm install sql.js
    echo.
    pause
    exit /b 1
  )
  echo ✓ sql.js instalado
  echo.
)

echo Agregando vendedor...
echo.

node agregar-vendedor-real.js

if %errorlevel% equ 0 (
  echo.
  echo ╔════════════════════════════════════════════════════════════╗
  echo ║  ✅ Vendedor agregado correctamente                         ║
  echo ╚════════════════════════════════════════════════════════════╝
  echo.
  echo 📍 Próximo paso:
  echo.
  echo   1. Abre terminal en esta carpeta
  echo   2. Ejecuta: npm start
  echo   3. Abre: http://localhost:3000/dashboard
  echo   4. Verifica que ves tu vendedor en la lista
  echo.
  echo El teléfono +57 3224312518 está registrado en el sistema.
  echo Cuando recibas leads en ese número, se asignarán automáticamente.
  echo.
) else (
  echo.
  echo ❌ Error al agregar vendedor
  echo.
)

pause
