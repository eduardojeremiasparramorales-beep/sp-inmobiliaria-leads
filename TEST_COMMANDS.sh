#!/bin/bash
################################################################################
# COMANDOS DE TESTING - SP Inmobiliaria CRM
#
# Copia-pega estos comandos para probar el CRM localmente
# Reemplaza:
#   <API_TOKEN> con tu valor real
#   <PHONE_ID> con tu PHONE_NUMBER_ID
#   <VENDEDOR_PHONE> con el teléfono de un vendedor
################################################################################

# CONFIGURACIÓN (REEMPLAZA ESTOS VALORES)
API_TOKEN="sp_api_token_abc123def456ghi789"
SERVER="http://localhost:3000"
PHONE_ID="1224496694078803"
VENDEDOR_PHONE="+5718112345601"

echo "=================================="
echo "SP INMOBILIARIA CRM - TEST COMMANDS"
echo "=================================="
echo ""
echo "Configuración:"
echo "  API_TOKEN: $API_TOKEN"
echo "  SERVER: $SERVER"
echo ""

# ============================================================================
# 1. VERIFICAR SERVIDOR ESTÁ CORRIENDO
# ============================================================================

echo "1. Verificar que servidor está corriendo..."
echo "Command:"
echo "  curl $SERVER"
echo ""
echo "Esperado: {\"status\":\"ok\",\"service\":\"SP Inmobiliaria CRM\",\"version\":\"1.0\"}"
echo ""

curl "$SERVER" | jq .
echo ""
echo "---"
echo ""

# ============================================================================
# 2. CREAR VENDEDORES DE PRUEBA (SOLO EN DEVELOPMENT)
# ============================================================================

echo "2. Crear 5 vendedores de prueba (NODE_ENV=development)"
echo "Command:"
echo "  curl -X POST $SERVER/api/seed \\"
echo "    -H \"Authorization: Bearer $API_TOKEN\" \\"
echo "    -H \"Content-Type: application/json\""
echo ""
echo "Esperado: {\"ok\":true,\"vendedoresCreados\":5}"
echo ""

curl -X POST "$SERVER/api/seed" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" | jq .
echo ""
echo "---"
echo ""

# ============================================================================
# 3. LISTAR VENDEDORES
# ============================================================================

echo "3. Listar todos los vendedores"
echo "Command:"
echo "  curl -H \"Authorization: Bearer $API_TOKEN\" \\"
echo "    \"$SERVER/api/vendedores\" | jq ."
echo ""
echo "Esperado: Array de vendedores con id, nombre, telefono, estado, etc."
echo ""

curl -H "Authorization: Bearer $API_TOKEN" \
  "$SERVER/api/vendedores" | jq .
echo ""
echo "---"
echo ""

# ============================================================================
# 4. OBTENER ESTADÍSTICAS
# ============================================================================

echo "4. Obtener estadísticas generales"
echo "Command:"
echo "  curl -H \"Authorization: Bearer $API_TOKEN\" \\"
echo "    \"$SERVER/api/stats\" | jq ."
echo ""
echo "Esperado: totalVendedores, vendedoresActivos, leadsRegistrados"
echo ""

curl -H "Authorization: Bearer $API_TOKEN" \
  "$SERVER/api/stats" | jq .
echo ""
echo "---"
echo ""

# ============================================================================
# 5. SIMULAR WEBHOOK DE CLIENTE (NUEVO LEAD)
# ============================================================================

echo "5. Simular webhook: Cliente envía mensaje"
echo "Command:"
echo "  curl -X POST $SERVER/api/test-webhook \\"
echo "    -H \"Authorization: Bearer $API_TOKEN\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{..."
echo ""
echo "Esperado: Lead creado y asignado a vendedor"
echo ""

curl -X POST "$SERVER/api/test-webhook" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+5718112345000",
    "name": "Juan Pérez García",
    "message": "Hola, me interesa un lote en Tocaima con 500m2"
  }' | jq .
echo ""
echo "---"
echo ""

# ============================================================================
# 6. VER LEADS CREADOS
# ============================================================================

echo "6. Ver todos los leads"
echo "Command:"
echo "  curl -H \"Authorization: Bearer $API_TOKEN\" \\"
echo "    \"$SERVER/api/leads\" | jq ."
echo ""
echo "Esperado: Array de leads con customer_phone, assigned_to, status, etc."
echo ""

curl -H "Authorization: Bearer $API_TOKEN" \
  "$SERVER/api/leads" | jq .
echo ""
echo "---"
echo ""

# ============================================================================
# 7. SIMULAR RESPUESTA DEL VENDEDOR
# ============================================================================

echo "7. Simular respuesta del vendedor"
echo "Command:"
echo "  curl -X POST $SERVER/api/test-reply \\"
echo "    -H \"Authorization: Bearer $API_TOKEN\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{..."
echo ""
echo "Esperado: Mensaje reenviado al cliente"
echo ""

curl -X POST "$SERVER/api/test-reply" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"vendedorPhone\": \"$VENDEDOR_PHONE\",
    \"message\": \"¡Hola Juan! Claro, ese lote está disponible. ¿Te gustaría que te envíe fotos?\"
  }" | jq .
echo ""
echo "---"
echo ""

# ============================================================================
# 8. VER LOGS DE MENSAJES
# ============================================================================

echo "8. Ver últimos 50 mensajes procesados"
echo "Command:"
echo "  curl -H \"Authorization: Bearer $API_TOKEN\" \\"
echo "    \"$SERVER/api/logs\" | jq ."
echo ""
echo "Esperado: Array de mensajes con from_number, to_number, body, timestamp"
echo ""

curl -H "Authorization: Bearer $API_TOKEN" \
  "$SERVER/api/logs" | jq .
echo ""
echo "---"
echo ""

# ============================================================================
# 9. CREAR NUEVO VENDEDOR MANUALMENTE
# ============================================================================

echo "9. Crear nuevo vendedor"
echo "Command:"
echo "  curl -X POST $SERVER/api/vendedores \\"
echo "    -H \"Authorization: Bearer $API_TOKEN\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"nombre\":\"María González\", \"telefono\":\"+5718112345602\"}'"
echo ""
echo "Esperado: {\"ok\":true}"
echo ""

curl -X POST "$SERVER/api/vendedores" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"María González","telefono":"+5718112345602"}' | jq .
echo ""
echo "---"
echo ""

# ============================================================================
# 10. CAMBIAR ESTADO DE VENDEDOR
# ============================================================================

echo "10. Cambiar estado de vendedor (ej: id=1 a 'ocupado')"
echo "Command:"
echo "  curl -X POST $SERVER/api/vendedores/1/estado \\"
echo "    -H \"Authorization: Bearer $API_TOKEN\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"estado\":\"ocupado\"}'"
echo ""
echo "Estados válidos: activo, ocupado, inactivo, vacaciones, suspendido"
echo ""
echo "Esperado: {\"ok\":true}"
echo ""

curl -X POST "$SERVER/api/vendedores/1/estado" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"estado":"ocupado"}' | jq .
echo ""
echo "---"
echo ""

# ============================================================================
# PRUEBAS DE SEGURIDAD
# ============================================================================

echo "====== PRUEBAS DE SEGURIDAD ======"
echo ""

echo "11. Request SIN token → debe devolver 401"
echo "Command:"
echo "  curl $SERVER/api/leads"
echo ""
echo "Esperado: {\"error\":\"Token de autenticación inválido\"}"
echo ""

curl "$SERVER/api/leads" | jq .
echo ""
echo "---"
echo ""

echo "12. Request CON token incorrecto → debe devolver 401"
echo "Command:"
echo "  curl -H \"Authorization: Bearer wrong_token\" \\"
echo "    $SERVER/api/leads"
echo ""
echo "Esperado: {\"error\":\"Token de autenticación inválido\"}"
echo ""

curl -H "Authorization: Bearer wrong_token" \
  "$SERVER/api/leads" | jq .
echo ""
echo "---"
echo ""

echo "13. Endpoint de test en PRODUCCIÓN → debe devolver 403"
echo "(Solo funciona si NODE_ENV=development)"
echo "Command:"
echo "  curl -X POST $SERVER/api/seed \\"
echo "    -H \"Authorization: Bearer $API_TOKEN\""
echo ""
echo "En producción esperado: {\"error\":\"Endpoint disponible solo en development\"}"
echo ""

# Este no lo ejecutamos porque depende de NODE_ENV
echo "(Este test depende de NODE_ENV - saltar si NODE_ENV=production)"
echo ""

echo "=================================="
echo "FIN DE TESTS"
echo "=================================="
echo ""
echo "Si todos los comandos funcionaron, el CRM está listo para producción."
echo "Próximos pasos:"
echo "  1. Completar CONFIGURATION.md"
echo "  2. Completar PRODUCTION_CHECKLIST.md"
echo "  3. Desplegar en Railway"
echo "  4. Configurar webhook en Meta"
echo ""
