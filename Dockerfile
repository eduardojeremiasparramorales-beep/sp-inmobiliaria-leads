FROM node:20-alpine

# ffmpeg: conversión de notas de voz (webm/mp4 → ogg/opus) para WhatsApp
# python3 + pillow: generador de creativos de Campañas SP (CAMPAÑAS_SP/, spawn desde Node)
# google-genai: análisis de fotos y fondos con IA (CAMPAÑAS_SP/generators/ai_generator.py)
RUN apk add --no-cache tzdata ffmpeg python3 py3-pillow py3-pip \
  && pip install --no-cache-dir --break-system-packages google-genai \
  && cp /usr/share/zoneinfo/America/Bogota /etc/localtime \
  && echo "America/Bogota" > /etc/timezone
ENV TZ=America/Bogota

WORKDIR /app

COPY package*.json ./

# Instalación completa (incluye devDependencies) porque el build de abajo necesita
# esbuild -- se recorta a solo producción después de construir (ver npm prune más abajo).
RUN npm ci

COPY . .

# Fase 2 del plan de modernización: minifica public/m/app.js|css (panel móvil) y
# sobreescribe esas dos copias DENTRO DE LA IMAGEN — el repo real en disco nunca se
# toca, esto solo afecta lo que termina en el contenedor. Ver scripts/build-mobile.js
# para por qué es minify-only (sin bundle ni renombrado de identificadores).
RUN npm run build:mobile \
  && cp dist/m/app.js public/m/app.js \
  && cp dist/m/app.css public/m/app.css \
  && rm -rf dist

RUN npm prune --omit=dev

RUN mkdir -p public logs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {let d='';r.on('data',c=>d+=c);r.on('end',()=>{const j=JSON.parse(d);if(j.status!=='ok'||!j.db)process.exit(1)})})"

CMD ["npm", "start"]
