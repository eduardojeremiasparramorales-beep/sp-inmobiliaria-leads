FROM node:20-alpine

# ffmpeg: conversión de notas de voz (webm/mp4 → ogg/opus) para WhatsApp
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

RUN mkdir -p public logs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {let d='';r.on('data',c=>d+=c);r.on('end',()=>{const j=JSON.parse(d);if(j.status!=='ok'||!j.db)process.exit(1)})})"

CMD ["npm", "start"]
