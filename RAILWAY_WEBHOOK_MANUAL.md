# 🚀 SP CRM — Guía Manual: Railway + Webhook Meta

**Fecha:** Junio 28, 2026  
**Estado:** Proyecto desplegado en Railway — Falta vincular webhook  
**Duración:** ~10 minutos

---

## ✅ Lo Que Ya Está Hecho

- ✅ CRM auditado y corregido
- ✅ Credenciales Meta obtenidas automáticamente
- ✅ .env configurado con valores reales
- ✅ Proyecto desplegado en Railway (ONLINE)
- ✅ Database (Postgres) conectada
- ✅ Cache (Redis) configurado

---

## 📋 Credenciales Que Ya Tienes

```
WHATSAPP_TOKEN=EAAkAKq5U2xQBRZCxy8ZB2c7HT8Yp0EqSbv0EtdgzZBk7ahOMqAkU4zymWOjJ2M54IGCxEZBsl0qA1e7oA7U4X1yHDvcvtzrnNxQGsDxNajANxIW1YVqo6fCQyPoVrly9i5uZCgycFQKOEPwO2bB9kvuOV41PdOL2Ch81dklDMtwNe9SEHRwx3kuB3gTEBImiIgtZAZBZAwA5sC4FYugOegZDZD

PHONE_NUMBER_ID=119056413747250

WHATSAPP_BUSINESS_ACCOUNT_ID=2292669058229593

VERIFY_TOKEN=spInmobiliaria2026SecureVerifyToken

API_TOKEN=sp_api_secret_2026_secure_token_xyz_cryptographic
```

---

## 🔧 PASO 1 — Obtener URL de Railway

### 1.1 Acceder a Railway

1. Ve a: https://railway.app
2. Inicia sesión (ya tienes cuenta)
3. Haz clic en proyecto: **sp-inmobiliaria-leads**

### 1.2 Obtener el dominio público

En el dashboard de Railway:

**Opción A — Desde el servicio "main":**
1. Haz clic en servicio **"main"** (donde dice "Online")
2. Ve a pestaña **"Deployments"**
3. Busca la URL que empieza con `https://`
4. Ejemplo: `https://sp-crm-production-abc123.railway.app`
5. **COPIA esa URL**

**Opción B — Desde Settings:**
1. Haz clic en **"Project Settings"**
2. Ve a **"Domains"**
3. Verás algo como: `sp-crm-production-abc123.railway.app`
4. **COPIA esa URL** (sin https://, lo agregarás después)

### 1.3 Preparar la URL del webhook

Tu URL webhook será:

```
https://[TU_RAILWAY_DOMAIN]/webhook
```

**Ejemplo real:**
```
https://sp-crm-production-abc123.railway.app/webhook
```

**⚠️ IMPORTANTE:** La URL DEBE terminar en `/webhook` (exactamente así)

---

## 🔗 PASO 2 — Vincular Webhook en Meta

### 2.1 Acceder a Meta Developer Console

1. Ve a: https://developers.facebook.com
2. Inicia sesión con tu cuenta de Meta
3. Ve a tu app WhatsApp

### 2.2 Buscar configuración de Webhook

En tu app:

1. **Sección izquierda:** Busca **"WhatsApp"** → **"Configuración"**
   - O directamente ve a: https://developers.facebook.com/apps/[TU_APP_ID]/whatsapp/

2. Busca la sección **"Webhook"** o **"Webhook Settings"**

3. Verás 3 campos:

   ```
   ┌─────────────────────────────────────────┐
   │ Webhook URL                             │
   │ [                                      ]│ ← Campo 1
   └─────────────────────────────────────────┘
   
   ┌─────────────────────────────────────────┐
   │ Verify Token                            │
   │ [                                      ]│ ← Campo 2
   └─────────────────────────────────────────┘
   
   ☐ messages                                  ← Campo 3
   ☐ message_template_status_update
   ```

### 2.3 Llenar los campos

**Campo 1 — Webhook URL:**
```
https://[TU_RAILWAY_DOMAIN]/webhook
```
Ejemplo: `https://sp-crm-production-abc123.railway.app/webhook`

**Campo 2 — Verify Token:**
```
spInmobiliaria2026SecureVerifyToken
```

**Campo 3 — Suscribirse a eventos:**
- ☑️ Marca **"messages"** (obligatorio)
- Los demás puedes dejarlos sin marcar por ahora

### 2.4 Guardar cambios

1. Haz clic en botón **"Save"** o **"Guardar"**
2. Meta intentará **verificar tu webhook** automáticamente
3. Espera ~5 segundos a que valide

### 2.5 Validación exitosa

Si todo va bien, verás:
- ✅ **"Webhook verified"** o **"Webhook verificado"**
- Color verde indicando que está conectado

Si hay error:
- ❌ **"Webhook could not be verified"**
- Ver sección "Troubleshooting" abajo

---

## ✅ PASO 3 — Verificar que Funciona

### 3.1 Revisar logs en Railway

1. Ve a tu proyecto en Railway
2. Haz clic en servicio **"main"**
3. Ve a pestaña **"Logs"**
4. Busca mensajes como:

```
✓ Webhook verificado por Meta
✓ Base de datos conectada
✓ Server escuchando puerto 3000
```

Si ves `✓ Webhook verificado`, ¡**TODO ESTÁ LISTO!** 🎉

### 3.2 Prueba manual (Opcional)

Para verificar que el webhook funciona:

**Desde terminal:**
```bash
curl -X GET "https://[TU_RAILWAY_DOMAIN]/webhook?hub.mode=subscribe&hub.challenge=test_challenge&hub.verify_token=spInmobiliaria2026SecureVerifyToken"
```

Esperado: La respuesta debe ser `test_challenge`

---

## 🎯 PASO 4 — Sistema en Vivo

Una vez que el webhook esté verificado:

1. **Meta Ads enviará leads automáticamente** a tu webhook
2. **El CRM recibirá en tiempo real**
3. **Asignará automáticamente a vendedores**
4. **Escalamiento automático comenzará**

---

## 🐛 Troubleshooting

### ❌ "Webhook could not be verified"

**Causa más común:** URL incorrecta

**Solución:**
1. Verifica que la URL es exacta: `https://[DOMAIN]/webhook`
2. Verifica que Railway está ONLINE (status verde)
3. El webhook debe responder en menos de 5 segundos

**Para testear:**
```bash
curl -i https://[TU_RAILWAY_DOMAIN]/webhook
```

Debe responder con `HTTP 200` (no error)

---

### ❌ "SSL certificate error"

Railway genera certificado SSL automático. Si ves error de certificado:

1. Espera 5 minutos (SSL tarda en propagarse)
2. Intenta de nuevo

---

### ❌ "Connection timeout"

**Causa:** Railway está apagado o no responde

**Solución:**
1. Ve a Railway dashboard
2. Verifica que "main" service dice "Online"
3. Si dice "Crashed", haz clic en "Redeploy"
4. Espera ~2 minutos

---

## 📊 Checklist Final

Completa esta lista para confirmar que todo funciona:

```
CONFIGURACIÓN RAILWAY:
☐ Proyecto "sp-inmobiliaria-leads" online
☐ Service "main" status: Online (verde)
☐ Database Postgres: Online
☐ Cache Redis: Online
☐ Logs sin errores críticos

CONFIGURACIÓN META:
☐ Webhook URL ingresada correctamente
☐ Verify Token ingresado correctamente
☐ "messages" marcado en suscripciones
☐ Webhook verificado (✓ checkmark verde)

VALIDACIÓN:
☐ curl test devuelve HTTP 200
☐ Logs en Railway muestran "Webhook verificado"
☐ Pueden acceder a http://[DOMAIN]/dashboard

PRODUCCIÓN:
☐ Enviar lead de prueba desde Meta Ads
☐ Verificar que llega al dashboard
☐ Verificar que se asigna a vendedor
☐ Sistema 100% operativo ✅
```

---

## 🎉 ¡LISTO!

Una vez completados los 4 pasos, tu CRM estará:

✅ **Recibiendo leads** desde Meta Ads automáticamente  
✅ **Asignando** a vendedores en tiempo real  
✅ **Escalando** leads no respondidos  
✅ **Dashboard activo** para monitoreo  
✅ **WhatsApp automático** a clientes  

---

## 📞 Si Algo Falla

1. **Revisa los logs** en Railway
2. **Verifica la URL** webhook (debe terminar en `/webhook`)
3. **Confirma el VERIFY_TOKEN** (debe ser exacto)
4. **Espera 2-3 minutos** — a veces tarda en propagarse

---

**Documento creado:** Junio 28, 2026  
**Estado:** Listo para uso manual  
**Estimación:** ~10 minutos para completar

¡Adelante! 🚀
