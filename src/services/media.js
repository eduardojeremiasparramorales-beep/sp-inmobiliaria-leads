// Almacenamiento de archivos multimedia en disco (data/media/).
const fs = require('fs');
const path = require('path');

const MEDIA_DIR = path.join(__dirname, '..', '..', 'data', 'media');

function ensureDir() {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// Extensión a partir del mime (fallback .bin)
const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/amr': 'amr', 'audio/aac': 'aac',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
};

function extFor(mime, originalFilename) {
  if (originalFilename && originalFilename.includes('.')) return originalFilename.split('.').pop().toLowerCase();
  const base = (mime || '').split(';')[0].trim();
  return MIME_EXT[base] || 'bin';
}

// Guarda el buffer y devuelve el nombre de archivo almacenado
function saveMessageMedia(mediaId, buffer, mime, originalFilename) {
  ensureDir();
  const ext = extFor(mime, originalFilename);
  const filename = `${mediaId}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, filename), buffer);
  return filename;
}

// Guarda un buffer ya subido por el vendedor (genera nombre único)
function saveOutgoingMedia(buffer, mime, originalFilename) {
  ensureDir();
  const ext = extFor(mime, originalFilename);
  const filename = `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, filename), buffer);
  return filename;
}

function getMediaPath(filename) {
  // Evita path traversal: solo el basename
  const safe = path.basename(String(filename || ''));
  return path.join(MEDIA_DIR, safe);
}

module.exports = { saveMessageMedia, saveOutgoingMedia, getMediaPath, MEDIA_DIR };
