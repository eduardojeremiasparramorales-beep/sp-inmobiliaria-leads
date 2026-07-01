# 🚀 SP CRM — Guía de Inicio Rápido

**Estado:** ✅ Sistema auditado y listo para producción  
**Fecha:** Junio 28, 2026  
**Duración estimada:** ~3 horas (paso a paso)

---

## 📋 ¿Qué es lo que está pasando?

Tu CRM está **completamente auditorado y corregido**. Faltan solo tus credenciales de Meta para que arranque.

**Lo que ya está hecho:**
- ✅ 6 problemas críticos de seguridad corregidos
- ✅ Documentación completa generada (9 archivos)
- ✅ Base de datos lista
- ✅ Código validado
- ✅ Dockerfile y Railway configurados

**Lo que necesitas hacer:**
- 🔐 Obtener credenciales Meta (30 min)
- 📝 Configurar .env local (5 min)
- 🧪 Prueba local (10 min)
- ☁️ Desplegar en Railway (15 min)
- ✅ Validar en producción (10 min)

---

## 🎯 Paso 1 — Obtener Credenciales Meta (30 min)

### Opción A: Usar el Formulario Interactivo (RECOMENDADO)

**Archivo:** `FORMULARIO_CREDENCIALES.html`

1. Abre este archivo en tu navegador (doble clic)
2. Ingresa tus credenciales de Meta paso a paso
3. El formulario valida en tiempo real
4. Al final, copia o descarga tu `.env`

### Opción B: Manual (si prefieres)

**Archivo de referencia:** `SETUP_META_WEBHOOK.md`

1. Ve a https://business.facebook.com
2. Inicia sesión
3. Ve a **Herramientas → WhatsApp**
4. Copia `WHATSAPP_TOKEN` (Token de acceso)
5. Copia `PHONE_NUMBER_ID` (ID del número)
6. Copia `WHATSAPP_BUSINESS_ACCOUNT_ID` (ID de cuenta)
7. Genera dos tokens propios (puedes usar cualquier string fuerte > 20 caracteres):
   - `VERIFY_TOKEN` (para Meta)
   - `API_TOKEN` (para tus endpoints internos)

---

## 📄 Paso 2 — Configurar .env Local

### Si usaste el Formulario Interactivo:

1. Ya tienes tu `.env` listo
2. Ve a: `C:\Sp Inmobiliaria\sp-inmobiliaria-leads-UPDATED\`
3. Copia el contenido que bajaste → pega en archivo `.env`
4. Guarda

### Si lo hiciste manual:

1. Abre: `C:\Sp Inmobiliaria\sp-inmobiliaria-leads-UPDATED\.env.example`
2. Guarda como: `.env` (en la misma carpeta)
3. Edita los valores:

```
# Reemplaza "TU_VALOR_AQUI" con tus credenciales reales:

WHATSAPP_TOKEN=EAAz4k6qL9xxx... [tu token de Meta]
PHONE_NUMBER_ID=1234567890123 [tu ID de número]
WHATSAPP_BUSINESS_ACCOUNT_ID=wa_0123456789 [tu ID de cuenta]
VERIFY_TOKEN=spInmobiliaria2026Secret [tu token de webhook]
API_TOKEN=sp_api_secret_xyz [tu token de API]

NODE_ENV=production
PORT=3000
DATABASE_PATH=./data/database.sqlite
LOG_LEVEL=info
```

4. Guarda el archivo

---

## ✅ Paso 3 — Validar tu .env

Ejecuta el validador para asegurarte de que todo está correcto:

```bash
# Abre terminal en la carpeta del proyecto y ejecuta:
node validate-env.js
```

**Esperado:**
```
✓ WHATSAPP_TOKEN: OK
✓ PHONE_NUMBER_ID: OK
✓ WHATSAPP_BUSINESS_ACCOUNT_ID: OK
✓ VERIFY_TOKEN: OK
✓ API_TOKEN: OK

Conexión a Meta API exitosa

✓ ¡TODO CORRECTO!
```

Si hay errores, verifica que copiaste bien los valores.

---

## 🧪 Paso 4 — Prueba Local

### Instalación de dependencias:

```bash
cd C:\Sp Inmobiliaria\sp-inmobiliaria-leads-UPDATED
npm install
```

### Arrancar servidor local:

```bash
npm start
```

**Esperado:**
```
✓ Base de datos lista
✓ Servidor escuchando en puerto 3000
✓ Webhook verificado
```

Abre en navegador: http://localhost:3000/dashboard

Deberías ver el panel principal del CRM.

**Para detener:** Presiona `Ctrl + C`

---

## ☁️ Paso 5 — Desplegar en Railway

### 5.1 Crear cuenta en Railway (si no tienes)

1. Ve a https://railway.app
2. Crea cuenta con GitHub
3. Conecta tu GitHub

### 5.2 Crear proyecto nuevo

1. Dashboard de Railway → "New Project"
2. Selecciona "Deploy from GitHub"
3. Conecta tu repo: `sp-inmobiliaria-leads`
4. Railway detectará `railway.json` automáticamente

### 5.3 Configurar variables de entorno

En Railway, ve a **Variables**:

```
WHATSAPP_TOKEN = [tu token de Meta]
PHONE_NUMBER_ID = [tu ID de número]
WHATSAPP_BUSINESS_ACCOUNT_ID = [tu ID de cuenta]
VERIFY_TOKEN = [tu token de webhook]
API_TOKEN = [tu token de API]
NODE_ENV = production
PORT = 3000
```

### 5.4 Desplegar

Railway desplegará automáticamente. Espera ~3 minutos.

Verás un dominio público, ej: `https://sp-crm.railway.app`

---

## 🔗 Paso 6 — Vincular Webhook en Meta

**Archivo de referencia:** `SETUP_META_WEBHOOK.md`

1. Ve a https://developers.facebook.com
2. Tu app → WhatsApp → Configuración
3. En **Webhook**, configura:

   - **URL del callback:** `https://tu-railway-domain.railway.app/webhook`
   - **Token de verificación:** [tu VERIFY_TOKEN]
   - **Suscribirse a:** messages

4. Guarda
5. Meta hará un GET a tu webhook para verificar — **debe responder 200**

---

## 👥 Paso 7 — Agregar Vendedores

Ahora agrega tus vendedores al sistema.

**Archivo:** `SETUP_VENDEDORES.md` (instrucciones detalladas)

### Datos de cada vendedor:

```
- Nombre: "Juan Pérez"
- Teléfono WhatsApp: "+57 322 431 2518"
- Email: "juan@spinmobiliaria.com"
```

### Agregar vía API (más rápido):

```bash
curl -X POST https://tu-railway-domain.railway.app/api/vendedores \
  -H "Authorization: Bearer [tu API_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Pérez",
    "telefono": "+57 322 431 2518",
    "email": "juan@spinmobiliaria.com",
    "estado": "activo"
  }'
```

---

## 🧪 Paso 8 — Prueba Completa

### 8.1 Enviar un lead de prueba

1. Ve a Meta Ads Manager
2. Configura un anuncio simple (o usa uno existente)
3. Desactiva leads para hacerlo manual:
   - Audience: pequeña
   - Budget: $1
   - Crear lead

2. El sistema debe:
   - Recibir el mensaje en tu webhook
   - Asignar a un vendedor (round-robin)
   - Reenviar al teléfono del vendedor

### 8.2 Monitorear

Abre: `https://tu-railway-domain.railway.app/dashboard`

Deberías ver:
- Lead recibido
- Asignado a vendedor
- Estado: "pendiente respuesta"

---

## ✅ Paso 9 — Validación Pre-Lanzamiento

**Archivo:** `PRODUCTION_CHECKLIST.md`

Completa el checklist de ~90 items. Solo toma 20 minutos.

Incluye:
- ✓ Credenciales verificadas
- ✓ Webhook funcionando
- ✓ Vendedores registrados
- ✓ Lead de prueba fluye correctamente
- ✓ Dashboard accesible
- ✓ Logs limpios (sin errores)

---

## 🎉 ¡Sistema en Vivo!

Una vez completado el checklist, tu CRM está **100% operativo**.

### Qué sucede ahora:

1. **Meta Ads envía leads** → Tu webhook recibe en tiempo real
2. **Asignación automática** → Round-robin a vendedores
3. **Escalamiento automático** → 30 min: alerta | 60 min: reasignación
4. **Dashboard en vivo** → Monitorea todo en tiempo real
5. **WhatsApp automático** → Respuestas del vendedor se reenvían al cliente

---

## 📞 Si Algo Falla

### 1. Consulta la documentación específica:

- **Problemas con .env?** → `SETUP_META_WEBHOOK.md`
- **Problemas con webhook?** → `SETUP_META_WEBHOOK.md` → "Troubleshooting"
- **Problemas con vendedores?** → `SETUP_VENDEDORES.md`
- **Problemas generales?** → `README_AUDITORÍA.md`

### 2. Valida tu .env:

```bash
node validate-env.js
```

### 3. Revisa los logs:

En Railway: **Logs** (pestaña)

### 4. Test de endpoint:

```bash
curl -X GET https://tu-railway-domain.railway.app/api/test/whatsapp \
  -H "Authorization: Bearer [tu API_TOKEN]"
```

### 5. Contacta:

- **Email:** eduardojeremiasparramorales@gmail.com
- **WhatsApp:** +57 322 431 2518
- **Instagram:** @sp.inmobiliaria

---

## 📚 Documentación Completa

| Archivo | Propósito | Leer si... |
|---------|-----------|-----------|
| `COMIENZA_AQUÍ.txt` | Visión general | Quieres entender rápido |
| `README_AUDITORÍA.md` | Qué se auditó | Quieres saber qué cambió |
| `SETUP_META_WEBHOOK.md` | Configurar Meta | Necesitas obtener credenciales |
| `SETUP_VENDEDORES.md` | Agregar vendedores | Necesitas registrar vendedores |
| `CONFIGURATION.md` | Instalación y despliegue | Necesitas instrucciones detalladas |
| `PRODUCTION_CHECKLIST.md` | Validación final | Antes de lanzar a producción |
| `ARQUITECTURA.txt` | Diagramas técnicos | Quieres entender la arquitectura |
| `DATOS_REQUERIDOS.txt` | Formulario de datos | Necesitas una lista de datos |
| `FORMULARIO_CREDENCIALES.html` | Recopilador interactivo | Prefieres un formulario visual |

---

## ⏱️ Resumen de Tiempo

- **Paso 1** (Credenciales): 30 min
- **Paso 2** (.env): 5 min
- **Paso 3** (Validar): 5 min
- **Paso 4** (Local): 10 min
- **Paso 5** (Railway): 20 min
- **Paso 6** (Webhook): 10 min
- **Paso 7** (Vendedores): 10 min
- **Paso 8** (Test): 15 min
- **Paso 9** (Checklist): 20 min

**TOTAL: ~2.5 horas**

---

## 🎯 Tu Próximo Paso

👇 **Haz esto AHORA:**

1. Abre `FORMULARIO_CREDENCIALES.html` en tu navegador
2. O lee `SETUP_META_WEBHOOK.md` si prefieres hacerlo manual
3. Obtén tus credenciales Meta
4. Pega en `.env`
5. Ejecuta `node validate-env.js`

¡Eso es todo lo que necesitas para comenzar!

---

**SP CRM — Sistema de Leads Inmobiliario**  
© 2026 Sergio Parra Inversiones & Finca Raíz
