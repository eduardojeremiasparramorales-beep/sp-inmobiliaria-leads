# 🧪 SP CRM — Guía de Prueba Local

**Objetivo:** Probar que el CRM funciona correctamente agregando un vendedor y simulando un lead.

**Duración:** ~15 minutos

---

## 📍 PASO 1 — Agregar Vendedor de Prueba

### Opción A — Automática (Recomendado)

1. **Abre terminal en la carpeta del proyecto:**
   ```
   C:\Sp Inmobiliaria\sp-inmobiliaria-leads-UPDATED\
   ```

2. **Ejecuta el script:**
   ```
   AGREGAR-VENDEDOR-PRUEBA.bat
   ```

3. **Espera a que diga "✅ Vendedor de prueba agregado"**

### Opción B — Manual

1. Abre terminal
2. Ve a: `cd C:\Sp Inmobiliaria\sp-inmobiliaria-leads-UPDATED`
3. Instala: `npm install sql.js`
4. Ejecuta: `node agregar-vendedor.js`

---

## 📍 PASO 2 — Iniciar Servidor Local

```bash
npm start
```

**Esperado:**
```
✓ Base de datos lista
✓ Servidor escuchando en puerto 3000
✓ Webhook verificado
```

---

## 📍 PASO 3 — Abre el Dashboard

Abre en tu navegador:
```
http://localhost:3000/dashboard
```

Deberías ver:
- ✅ Panel principal del CRM
- ✅ Sección de vendedores
- ✅ El "Vendedor Prueba" que acabas de agregar
- ✅ Sección de leads (vacía por ahora)

---

## 📍 PASO 4 — Simular un Lead Manual

Si no tienes WhatsApp oficial configurado, puedes simular un lead manualmente:

### Opción A — Desde Terminal (cURL)

```bash
curl -X POST "http://localhost:3000/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "573001234567",
            "text": {"body": "Hola, me interesa un lote"},
            "id": "test-msg-123"
          }]
        }
      }]
    }]
  }'
```

### Opción B — Desde Postman

1. **URL:** `POST http://localhost:3000/webhook`
2. **Headers:** `Content-Type: application/json`
3. **Body (raw JSON):**

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "573001234567",
          "text": {"body": "Hola, me interesa un lote"},
          "id": "test-msg-123"
        }]
      }
    }]
  }]
}
```

---

## 📍 PASO 5 — Validar que Funciona

**Después de simular el lead:**

1. **Actualiza el dashboard:**
   ```
   http://localhost:3000/dashboard
   ```

2. **Deberías ver:**
   - ✅ Un nuevo lead en la lista
   - ✅ Teléfono: `+57 300 123 4567`
   - ✅ Asignado a: "Vendedor Prueba"
   - ✅ Estado: "Activo"

3. **Si ves esto, el sistema funciona correctamente** ✅

---

## 🐛 Troubleshooting

### ❌ "Servidor no inicia"

```bash
npm install
npm start
```

Si sigue fallando, verifica que el puerto 3000 no esté en uso:

```bash
netstat -ano | findstr :3000
```

Si está en uso, mata el proceso o usa otro puerto:

```bash
npm start -- --port 3001
```

### ❌ "No aparece el lead en el dashboard"

1. Actualiza la página (F5)
2. Verifica los logs del servidor (debe decir "Lead recibido")
3. Intenta simular nuevamente el lead

### ❌ "No puedo simular el lead con cURL"

1. Asegúrate de tener cURL instalado
2. Usa Postman en su lugar (más fácil)
3. O usa este script Python:

```python
import requests
import json

url = "http://localhost:3000/webhook"
payload = {
    "object": "whatsapp_business_account",
    "entry": [{
        "changes": [{
            "value": {
                "messages": [{
                    "from": "573001234567",
                    "text": {"body": "Hola, me interesa un lote"},
                    "id": "test-msg-123"
                }]
            }
        }]
    }]
}

response = requests.post(url, json=payload)
print(f"Status: {response.status_code}")
print(f"Response: {response.text}")
```

---

## ✅ Checklist de Prueba

```
PREPARACIÓN:
☐ Carpeta del proyecto abierta
☐ Terminal lista

PASO 1 — Vendedor:
☐ Script ejecutado
☐ Vendedor agregado correctamente

PASO 2 — Servidor:
☐ npm start ejecutado
☐ Servidor escucha en puerto 3000
☐ Logs muestran "Webhook verificado"

PASO 3 — Dashboard:
☐ Dashboard abierto en http://localhost:3000/dashboard
☐ Vendedor visible en la lista
☐ Sistema responde normalmente

PASO 4 — Simulación:
☐ Lead simulado correctamente
☐ Lead aparece en el dashboard
☐ Asignado al vendedor

PASO 5 — Validación:
☐ Lead tiene teléfono correcto
☐ Vendedor asignado correctamente
☐ Estado es "Activo"
☐ Timestamp registrado correctamente

RESULTADO FINAL:
☐ SISTEMA FUNCIONANDO CORRECTAMENTE ✅
```

---

## 📊 Lo Que Testea Este Flujo

1. ✅ **Base de datos funciona** — Se puede agregar vendedor
2. ✅ **API funciona** — Endpoint /webhook recibe leads
3. ✅ **Lógica de asignación funciona** — Lead asignado automáticamente
4. ✅ **Dashboard funciona** — Se ven datos en tiempo real
5. ✅ **Sistema completo funciona** — Flujo end-to-end correcto

---

## 🎉 ¿Qué Significa Si Todo Funciona?

Si completas todos los pasos y ves el lead en el dashboard asignado al vendedor, significa que:

✅ El CRM está **100% operativo**  
✅ Puede recibir leads de Meta Ads  
✅ Asigna automáticamente a vendedores  
✅ El dashboard funciona en tiempo real  

**¡Tu sistema está listo para producción!** 🚀

---

## 📞 Próximos Pasos

Una vez validado localmente:

1. **Despliegue en Railway ya está HECHO** (step anterior)
2. **Webhook ya está vinculado con Meta** (step anterior)
3. **Sistema está en vivo** — Listo para recibir leads reales

Solo falta:
- Agregar tus vendedores reales (con teléfonos reales)
- Empezar a enviar leads desde Meta Ads

---

**Documento creado:** Junio 28, 2026  
**SP CRM — Sistema de Leads Inmobiliario Profesional**
