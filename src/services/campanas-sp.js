const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const store = require('../db/store');

const PYTHON = process.env.PYTHON_PATH || path.join(process.env.LOCALAPPDATA || 'C:\\Users\\eduar\\AppData\\Local',
  'hermes', 'hermes-agent', 'venv', 'Scripts', 'python.exe');
const ROOT = 'C:\\Sp Inmobiliaria'; // fallback hardcoded — usaremos deteccion
const CAMPAÑAS_SP_DIR = path.join(
  fs.existsSync('C:\\Sp Leons') ? 'C:\\Sp Leons' : 'C:\\Sp Inmobiliaria',
  'CAMPAÑAS_SP'
);
const RUN_API = path.join(CAMPAÑAS_SP_DIR, 'run_api.py');
const PROJECTS_DIR = path.join(CAMPAÑAS_SP_DIR, 'projects');

function detectRoot() {
  if (fs.existsSync('C:\\Sp Leons')) return 'C:\\Sp Leons';
  return 'C:\\Sp Inmobiliaria';
}

function getCampanasSpDir() {
  return path.join(detectRoot(), 'CAMPAÑAS_SP');
}

function getRunApiPath() {
  return path.join(getCampanasSpDir(), 'run_api.py');
}

async function generateAssets(projectId) {
  const project = store.getCampanasSpProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  store.updateCampanasSpProject(projectId, { status: 'generating' });

  const imagesDir = project.images_dir;
  const outputDir = project.output_dir || path.join(PROJECTS_DIR, project.slug, 'generated');
  fs.mkdirSync(outputDir, { recursive: true });

  const input = {
    project: {
      name: project.name,
      location: project.location,
      description: project.description,
      price: project.price,
      price_currency: project.price_currency,
      area: project.area,
      features: safeParse(project.features),
      highlights: safeParse(project.highlights),
      whatsapp: project.whatsapp,
      cta: project.cta,
    },
    images_dir: imagesDir,
    output_dir: outputDir,
    template: project.template || 'premium',
  };

  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [getRunApiPath()], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString('utf-8'); });
    proc.stderr.on('data', (data) => { stderr += data.toString('utf-8'); });

    proc.on('close', (code) => {
      if (code !== 0) {
        const errMsg = `Python exit code ${code}: ${stderr.slice(0, 500)}`;
        store.updateCampanasSpProject(projectId, { status: 'error', error: errMsg });
        return reject(new Error(errMsg));
      }
      try {
        const result = JSON.parse(stdout.trim());
        store.updateCampanasSpProject(projectId, {
          status: result.ok ? 'ready' : 'error',
          assets_result: JSON.stringify(result),
          error: result.errors ? result.errors.join('; ') : '',
          output_dir: outputDir,
        });
        resolve(result);
      } catch (e) {
        const errMsg = `JSON parse error: ${e.message}. Output: ${stdout.slice(0, 500)}`;
        store.updateCampanasSpProject(projectId, { status: 'error', error: errMsg });
        reject(new Error(errMsg));
      }
    });

    proc.on('error', (err) => {
      store.updateCampanasSpProject(projectId, { status: 'error', error: err.message });
      reject(err);
    });

    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  });
}

function safeParse(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); }
  catch (e) { return []; }
}

function getProjectDir(slug) {
  return path.join(PROJECTS_DIR, slug);
}

function scanProjectImages(slug) {
  const dir = path.join(getProjectDir(slug), 'images');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
}

function getAssetsBaseUrl(project) {
  const assets = safeParse(project.assets_result || '{}');
  return assets;
}

module.exports = {
  generateAssets,
  getProjectDir,
  scanProjectImages,
  getAssetsBaseUrl,
  detectRoot,
  getCampanasSpDir,
};
