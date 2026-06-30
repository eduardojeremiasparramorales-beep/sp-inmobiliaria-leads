# Guía de Despliegue — Oracle Cloud Free Tier

## PASO 1 — Crear cuenta Oracle Cloud (tú)
1. Ir a https://cloud.oracle.com/
2. Clic en "Start for free"
3. Usar email: eduardojeremiasparramorales@gmail.com
4. País: Colombia
5. Piden tarjeta de crédito para verificar (NO cobran)
6. Al terminar registro → ir al dashboard

## PASO 2 — Crear la VM (tú en la consola Oracle)
1. Menú hamburguesa → Compute → Instances → Create Instance
2. Configuración:
   - Name: `sp-crm-server`
   - Image: Ubuntu 22.04
   - Shape: `VM.Standard.A1.Flex` (Always Free)
   - OCPUs: 2 | Memory: 12 GB
3. En "Add SSH keys" → pegar tu llave pública SSH
   - Si no tienes, generar con: `ssh-keygen -t ed25519 -C "sp-crm"`
   - La pública está en: `~/.ssh/id_ed25519.pub`
4. Clic Create → esperar ~3 minutos

## PASO 3 — Abrir puertos en Oracle (tú)
1. En la instancia creada → clic en la VCN → Security Lists → Default
2. Add Ingress Rules:
   - Puerto 80 (HTTP): Source 0.0.0.0/0, TCP, Port 80
   - Puerto 443 (HTTPS): Source 0.0.0.0/0, TCP, Port 443
3. Copiar la IP Pública de la instancia

## PASO 4 — Dominio gratis DuckDNS (tú)
1. Ir a https://www.duckdns.org/
2. Login con Google
3. Crear subdominio: `sp-crm` → apuntar a la IP de Oracle
4. Tu dominio será: `sp-crm.duckdns.org`

## PASO 5 — Conectarse al servidor y ejecutar setup
```bash
# En tu PC, conectarse al servidor Oracle
ssh ubuntu@<TU_IP_ORACLE>

# Subir el script de setup (desde tu PC)
scp deploy/setup-oracle.sh ubuntu@<TU_IP>:/home/ubuntu/
ssh ubuntu@<TU_IP> "chmod +x setup-oracle.sh && ./setup-oracle.sh"
```

## PASO 6 — Subir el proyecto
```bash
# Desde tu PC (en la carpeta sp-inmobiliaria-leads-UPDATED)
scp -r . ubuntu@<TU_IP>:/home/ubuntu/sp-crm/app/
scp .env ubuntu@<TU_IP>:/home/ubuntu/sp-crm/app/

# En el servidor
ssh ubuntu@<TU_IP>
cd /home/ubuntu/sp-crm/app
docker compose up -d --build
```

## PASO 7 — Configurar Caddy con tu dominio
```bash
# En el servidor
sudo nano /etc/caddy/Caddyfile
# Reemplazar TU_DOMINIO por: sp-crm.duckdns.org
# Copiar contenido de deploy/Caddyfile

sudo systemctl reload caddy
```

## PASO 8 — Actualizar webhook en Meta (tú)
1. Ir a https://developers.facebook.com/
2. Tu App → WhatsApp → Configuration → Webhooks
3. Callback URL: `https://sp-crm.duckdns.org/webhook`
4. Verify Token: el valor de VERIFY_TOKEN en tu .env
5. Suscribirse a: `messages`

## PASO 9 — Configurar backup automático
```bash
# En el servidor Oracle
crontab -e
# Agregar:
0 3 * * * /home/ubuntu/sp-crm/app/deploy/backup.sh
```

## PASO 10 — Agregar vendedores al CRM
```bash
curl -X POST https://sp-crm.duckdns.org/api/vendedores \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Nombre Vendedor", "telefono": "+573XXXXXXXXX"}'
```

## URLs finales
- CRM Panel: https://sp-crm.duckdns.org
- Webhook Meta: https://sp-crm.duckdns.org/webhook
- API Stats: https://sp-crm.duckdns.org/api/stats
