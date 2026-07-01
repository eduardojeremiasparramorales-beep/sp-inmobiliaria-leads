# Checklist Pre-Producción - SP Inmobiliaria CRM

**Fecha de auditoría:** 2026-06-28  
**Versión CRM:** 1.0.0

---

## CRÍTICO - Bloquean despliegue

### 1. Seguridad de Variables de Entorno

- [ ] WHATSAPP_TOKEN está configurado y es válido
  - [ ] Validar en Meta App que el token tiene permisos correctos
  - [ ] Token NO es temporal (usar System User Token para prod)
  - [ ] NO está hardcodeado en el código

- [ ] PHONE_NUMBER_ID está configurado
  - [ ] Número es válido (solo dígitos)
  - [ ] Número está verificado en Meta Business

- [ ] VERIFY_TOKEN está configurado
  - [ ] Token es único y seguro (mínimo 32 caracteres)
  - [ ] Coincide entre .env y configuración en Meta App
  - [ ] NO es el valor por defecto `spInmobiliaria2026`

- [ ] API_TOKEN está configurado en .env
  - [ ] Token es único y seguro
  - [ ] Se distribuye SOLO a aplicaciones/personas autorizadas
  - [ ] Se rotará periódicamente

- [ ] .env NO está en git
  - [ ] Verificar `.gitignore` contiene `.env`
  - [ ] Ejecutar: `git status | grep '.env'` (no debe aparecer)

### 2. Endpoints de Test Deshabilitados en Producción

- [ ] NODE_ENV está configurado como `production`
- [ ] Endpoints `/api/seed`, `/api/test-webhook`, `/api/test-reply` devuelven 403 en producción
- [ ] Verificar: `curl -X POST http://localhost:3000/api/seed` devuelve error

### 3. Autenticación en Endpoints Sensibles

- [ ] Todos los endpoints de API requieren `Authorization: Bearer <API_TOKEN>`
  - [ ] GET /api/stats
  - [ ] GET /api/leads
  - [ ] GET /api/vendedores
  - [ ] POST /api/vendedores
  - [ ] POST /api/vendedores/:id/estado
  - [ ] GET /api/logs

- [ ] Solicitud SIN token devuelve 401:
  ```bash
  curl http://localhost:3000/api/leads
  # Esperado: {"error":"Token de autenticación inválido"}
  ```

- [ ] Solicitud CON token incorrecto devuelve 401:
  ```bash
  curl -H "Authorization: Bearer wrong_token" http://localhost:3000/api/leads
  # Esperado: {"error":"Token de autenticación inválido"}
  ```

### 4. Validación de Payload de Webhook

- [ ] Webhook acepta payloads malformados sin crash
- [ ] Payload sin `entry` no causa error
- [ ] Payload sin `messages` no causa error
- [ ] Mensaje sin `text.body` se ignora silenciosamente

Test:
```bash
# Payload mal formado
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"objeto":"algo"}'
# No debe crashear el servidor
```

### 5. Manejo de Errores en Base de Datos

- [ ] Si fs.writeFileSync falla, se registra error:
  ```bash
  grep "ERROR CRÍTICO al guardar base de datos" logs/app.log
  ```

- [ ] Base de datos está en volumen persistente (no en contenedor efímero)
  - [ ] En Railway: volumen configurado en `data/sp-leads.db`
  - [ ] En Docker: `-v sp-data:/app/data` en docker-compose.yml

### 6. Credenciales y Tokens NO en Código

- [ ] Búsqueda: `grep -r "spInmobiliaria2026" src/` (no debe aparecer)
- [ ] Búsqueda: `grep -r "your_whatsapp_token" src/` (no debe aparecer)
- [ ] Búsqueda: `grep -r "Bearer " src/` (no debe aparecer en hardcode)

---

## IMPORTANTE - Antes de 48 horas en producción

### 7. Logging y Monitoreo

- [ ] Logs se envían a servicio externo (CloudWatch, Datadog, LogRocket, etc.)
  - [ ] NO solo a stdout (se pierden en Railway)

- [ ] Alertas configuradas para:
  - [ ] Error en webhook
  - [ ] Error al guardar base de datos
  - [ ] 5+ escalaciones en 1 hora
  - [ ] API_TOKEN usado incorrectamente 5+ veces

- [ ] Dashboard muestra:
  - [ ] Últimas 24h de leads
  - [ ] Vendedores activos vs inactivos
  - [ ] Tiempo promedio de respuesta

### 8. Base de Datos

- [ ] Índices están creados (consulta: `.indices` en sqlite3)
  - [ ] idx_leads_customer_phone
  - [ ] idx_leads_assigned_to_id
  - [ ] idx_leads_status
  - [ ] idx_vendedores_telefono
  - [ ] idx_vendedores_estado

- [ ] Backup automático configurado:
  - [ ] Diario a las 02:00 UTC
  - [ ] Retención mínima 7 días
  - [ ] Prueba de restore cada semana

- [ ] Query performance:
  - [ ] GET /api/leads con 1000 leads < 500ms
  - [ ] GET /api/stats con 50 vendedores < 100ms

### 9. Escalación de Leads

- [ ] checkEscalation corre cada 60 segundos
- [ ] Leads sin respuesta en 30min reciben alerta al vendedor
- [ ] Leads sin respuesta en 60min se marcan para reasignación
- [ ] Logging detallado de cada escalación

Test:
```bash
# Verificar logs
tail -f logs/app.log | grep "ESCALATION"
```

### 10. Testing End-to-End

- [ ] Flujo completo de lead (cliente → servidor → vendedor):
  1. Enviar webhook simulado desde cliente
  2. Verificar que aparece en /api/leads
  3. Verificar que se asignó a vendedor
  4. Simular respuesta del vendedor
  5. Verificar que cliente recibe respuesta

### 11. Documentación

- [ ] CONFIGURATION.md está actualizado con pasos reales
- [ ] .env.example tiene comentarios explicativos
- [ ] README principal explica cómo lanzar
- [ ] Runbook para incidentes creado

### 12. Dependencias

- [ ] npm audit no tiene vulnerabilidades críticas:
  ```bash
  npm audit
  # Si hay críticas: npm audit fix
  ```

- [ ] Versiones de dependencias están pinned en package-lock.json

---

## DEPLOYMENT - Últimas 24 horas

### 13. Infraestructura

- [ ] Railway configurado:
  - [ ] Memoria: mínimo 256MB, recomendado 512MB
  - [ ] Disco: volumen persistente de mínimo 1GB
  - [ ] Auto-deploy desde main branch habilitado

- [ ] Webhooks en Meta apuntan a URL correcta:
  - [ ] URL: `https://tu-app.up.railway.app/webhook`
  - [ ] Método: POST
  - [ ] Verify Token coincide con .env

- [ ] DNS/HTTPS:
  - [ ] Certificado SSL válido
  - [ ] Dominio personalizado (si aplica)
  - [ ] HTTPS obligatorio (redirigir HTTP → HTTPS)

### 14. Rollout

- [ ] Dark mode ON (0% tráfico) por 1 hora
  - [ ] Logs limpios
  - [ ] CPU/Memory estable
  - [ ] Base de datos se guarda correctamente

- [ ] Rollout 10% tráfico
  - [ ] Monitorear 30 min
  - [ ] Sin errores o alertas

- [ ] Rollout 50% tráfico
  - [ ] Monitorear 1 hora
  - [ ] Performance estable

- [ ] Rollout 100% tráfico
  - [ ] Monitorear 2 horas
  - [ ] Tener plan de rollback listo

### 15. Comunicación

- [ ] Equipo de vendedores notificado:
  - [ ] API_TOKEN distribuido de forma segura
  - [ ] Cómo usar /api/logs para debugging
  - [ ] Escalation process explicado

- [ ] Runbook compartido:
  - [ ] Qué hacer si webhook no funciona
  - [ ] Cómo reestablecer un lead
  - [ ] Contacto de soporte (Eduardo)

---

## POST-DEPLOYMENT - Primeras 2 semanas

### 16. Monitoreo Activo

- [ ] Diario:
  - [ ] Revisar logs por errores
  - [ ] Confirmar que leads se crean correctamente
  - [ ] Confirmar que escalaciones funcionan

- [ ] Semanal:
  - [ ] Resumen de métricas (leads/día, respuestas promedio)
  - [ ] Base de datos creciendo a ritmo esperado
  - [ ] Plan de escalado si necesario

### 17. Feedback y Mejoras

- [ ] Recopilar feedback de vendedores:
  - [ ] ¿Mensajes llegan rápido?
  - [ ] ¿Interfaz es clara?
  - [ ] ¿Hay problemas de escalación?

- [ ] Issues encontrados:
  - [ ] Registrar en GitHub
  - [ ] Prioridad: crítico/alto/bajo
  - [ ] Timeline de solución

### 18. Optimizaciones Pendientes

- [ ] Implementar reasignación automática en escalación 60min
- [ ] Agregar templates de respuesta predefinidos
- [ ] Crear panel de analytics visual
- [ ] Integración con CRM externo (Leadsales, etc.)

---

## Firma de Aprobación

| Rol | Nombre | Fecha | Firma |
|-----|--------|-------|-------|
| Desarrollador | Eduardo J. Parra | ___/___/_____ | _____ |
| Product Owner | Sergio Parra | ___/___/_____ | _____ |
| DevOps/Infra | _____ | ___/___/_____ | _____ |

---

## Notas

```
[Espacio para notas adicionales, issues encontrados, cambios de último minuto]


```
