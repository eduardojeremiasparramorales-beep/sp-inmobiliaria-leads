# 🚨 ARREGLAR RAILWAY INMEDIATAMENTE

## El Problema
En Railway hay **n8n corriendo** donde debería estar el **CRM Node.js**. Por eso Meta no puede validar el webhook.

## Solución (5 minutos)

### Paso 1: Abre Railway
```
https://railway.app/project/sp-inmobiliaria-leads
```

### Paso 2: Elimina n8n (si está)
- En el proyecto, busca si hay un servicio de "n8n"
- Si existe, haz click derecho → "Delete service"
- Confirma la eliminación

### Paso 3: Verifica que el CRM está desplegado
- Debe haber un servicio llamado "main" o "app"
- Si NO existe, necesitas hacer push del código

Si NO existe, abre terminal y ejecuta:
```bash
cd C:\Sp Inmobiliaria\sp-inmobiliaria-leads-UPDATED
railway link
railway up
```

### Paso 4: Configura las variables (MUY IMPORTANTE)
En el servicio MAIN, click en "Variables":

```
NODE_ENV=production
PORT=3000
VERIFY_TOKEN=spInmobiliaria2026SecureVerifyToken
WHATSAPP_TOKEN=EAAkAKq5U2xQBRZCxy8ZB2c7HT8Yp0EqSbv0EtdgzZBk7ahOMqAkU4zymWOjJ2M54IGCxEZBsl0qA1e7oA7U4X1yHDvcvtzrnNxQGsDxNajANxIW1YVqo6fCQyPoVrly9i5uZCgycFQKOEPwO2bB9kvuOV41PdOL2Ch81dklDMtwNe9SEHRwx3kuB3gTEBImiIgtZAZBZAwA5sC4FYugOegZDZD
PHONE_NUMBER_ID=119056413747250
WHATSAPP_BUSINESS_ACCOUNT_ID=2292669058229593
META_APP_ID=2533458103819028
```

### Paso 5: Despliega
- Click en "Deploy" o reinicia el servicio
- Espera a que diga "Active" (verde)
- Abre: https://main-production-063e.up.railway.app/
- Deberías ver JSON: `{"status":"ok","service":"SP Inmobiliaria CRM"}`

### Paso 6: Valida en Meta
- Ve a: https://developers.facebook.com/apps/2533458103819028/whatsapp/
- Click en "Verify and Save"
- Debería decir ✓ Verified

---

## ✅ Una vez hecho esto, TODO funciona automáticamente

- Meta enviará los leads al webhook
- El CRM los recibirá
- Se asignarán a tu vendedor
- Tú recibirás los mensajes en tu celular
- Respondes y el cliente recibe tu respuesta

**¡Listo!**
