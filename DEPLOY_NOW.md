# 🚀 ACTUALIZACIÓN CRM — Oracle Cloud (Ahora)

**Fecha:** 2026-07-01  
**Cambios:** Refactorización DB, seguridad, validaciones, filtros avanzados

---

## 📋 CAMBIOS INCLUIDOS

### Backend (src/)
- ✅ **store.js**: Refactorización queries SQL (parameterizado, mejor performance)
- ✅ **index.js**: 
  - Validación de teléfono colombiano (+57)
  - Seguridad: session fixation prevention
  - Proxy trust: `app.set('trust proxy', 1)`
  - Filtros avanzados en `/api/leads`
  - Límite de carga de archivos (18MB)

### DevOps
- ✅ **docker-compose.yml**: Limpieza (eliminado `version: '3.8'`)
- ✅ **deploy/Caddyfile**: Actualizado HTTPS
- ✅ **deploy/setup-oracle.sh**: Mejoras
- ✅ **deploy/backup.sh**: Script de backup mejorado
- ✅ **Eliminado**: railway.json (ya no se usa)

### Frontend
- ✅ **public/dashboard.html**: Pequeñas mejoras
- ✅ **public/index.html**: UI refinada
- ✅ **public/vendedor.html**: Mejor UX

---

## 🔧 PASO 1 — Preparar cambios localmente

```bash
cd C:\Sp Inmobiliaria\sp-inmobiliaria-leads-UPDATED

# Ver todos los cambios
git diff --stat

# Hacer commit de los cambios
git add .
git commit -m "chore: optimizaciones DB, seguridad y filtros avanzados"

# Push a GitHub
git push origin main
```

**Estado esperado:**
```
[main a1b2c3d] chore: optimizaciones DB, seguridad y filtros avanzados
 13 files changed, 312 insertions(+), 244 deletions(-)
```

---

## 📡 PASO 2 — Conectarse al servidor Oracle

```bash
# Reemplazar TU_IP con la IP pública de tu VM Oracle
ssh ubuntu@TU_IP

# Verificar que Docker está corriendo
docker ps
```

---

## 🔄 PASO 3 — Actualizar el código en el servidor

```bash
# En el servidor Oracle
cd /home/ubuntu/sp-crm/app

# Hacer pull del repositorio
git pull origin main

# O si prefieres actualizar completamente
git fetch origin
git reset --hard origin/main
```

---

## 🐳 PASO 4 — Reconstruir y reiniciar los contenedores

```bash
# En el servidor Oracle
cd /home/ubuntu/sp-crm/app

# Opción A: Reconstrucción limpia (recomendado)
docker compose down
docker compose up -d --build

# Opción B: Actualización sin perder datos (más rápido)
docker compose up -d --build --no-deps

# Verificar que el CRM está corriendo
docker ps
docker compose logs -f crm
```

**Espera hasta ver:**
```
✅ CRM iniciado en puerto 3000
✅ Base de datos inicializada
✅ Webhooks en espera
```

---

## ✅ PASO 5 — Verificar que todo funciona

```bash
# En tu PC, desde PowerShell

# Test 1: API Health Check
curl https://sp-crm.duckdns.org/api/stats \
  -H "Authorization: Bearer TU_TOKEN"

# Test 2: Ver logs en vivo
ssh ubuntu@TU_IP "cd /home/ubuntu/sp-crm/app && docker compose logs -f crm"

# Test 3: Verificar DB
ssh ubuntu@TU_IP "ls -lh /home/ubuntu/sp-crm/data/sp-leads.db"
```

---

## 🚨 PASO 6 — En caso de problemas

### Si el contenedor no inicia:
```bash
ssh ubuntu@TU_IP
docker compose logs crm
```

### Si hay error de conexión a Base de Datos:
```bash
ssh ubuntu@TU_IP
sudo chown -R ubuntu:ubuntu /home/ubuntu/sp-crm/data/
docker compose restart crm
```

### Si los cambios no se ven:
```bash
ssh ubuntu@TU_IP
cd /home/ubuntu/sp-crm/app
git status
git log -1 --oneline  # Debe mostrar el commit nuevo
```

### Rollback (volver a versión anterior si falla):
```bash
ssh ubuntu@TU_IP
cd /home/ubuntu/sp-crm/app
git revert HEAD  # Revierte el commit
docker compose up -d --build
```

---

## 📊 MONITOREO POST-ACTUALIZACIÓN

Dentro de 10 minutos de actualizar, verifica que:

- [ ] ✅ CRM accesible en https://sp-crm.duckdns.org
- [ ] ✅ Admin puede ver dashboard
- [ ] ✅ Vendedores pueden hacer login con PIN
- [ ] ✅ No hay errores en logs: `docker compose logs crm | grep ERROR`
- [ ] ✅ Backup automático configurado: `crontab -l | grep backup.sh`

---

## 🔐 IMPORTANTE: Variables de entorno

**El `.env` en el servidor NO debe cambiar**, pero verifica que tenga estas variables:

```bash
ssh ubuntu@TU_IP "cat /home/ubuntu/sp-crm/app/.env | grep -E '(ADMIN_EMAIL|ADMIN_PASSWORD|VERIFY_TOKEN|WHATSAPP_TOKEN)'"
```

Si faltan variables, edita:
```bash
ssh ubuntu@TU_IP "nano /home/ubuntu/sp-crm/app/.env"
```

Luego reinicia:
```bash
docker compose restart crm
```

---

## 📞 Resumen de URLs

| Servicio | URL |
|----------|-----|
| **CRM Panel** | https://sp-crm.duckdns.org |
| **Webhook** | https://sp-crm.duckdns.org/webhook |
| **API Health** | https://sp-crm.duckdns.org/api/stats |
| **SSH Admin** | `ssh ubuntu@<TU_IP>` |

---

## ⏱️ Tiempo estimado
- Checkout: **30 seg**
- Build: **2-3 min** (depende del build cache)
- Restart: **30 seg**
- **Total: 3-4 min de downtime**

---

**¿Listo? Ejecuta los pasos 1-4 arriba. Éxito! 🚀**
