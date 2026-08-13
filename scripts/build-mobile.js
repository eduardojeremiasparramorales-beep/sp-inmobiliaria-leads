// Fase 2 del plan de modernización — build de public/m/ (panel móvil, 400KB antes de
// dividirse en app.css/app.js). Genera versiones minificadas en dist/m/ sin tocar los
// fuentes en public/m/ (esos siguen siendo la copia legible que se edita a mano).
//
// IMPORTANTE — por qué esbuild en modo "minify-whitespace + minify-syntax" y NO un
// bundle completo (Vite/Rollup) ni --minify-identifiers: public/m/app.js es un script
// clásico (no ES module) que depende de que sus funciones de nivel superior queden en
// el scope global — la app las llama desde cientos de atributos onclick="..." generados
// dinámicamente en las plantillas HTML (string), y algunas se exponen explícitamente
// via window.X=function(){...}. Un bundle (que envuelve todo en un IIFE/módulo) o el
// renombrado de identificadores rompe esas referencias en tiempo de ejecución porque
// el minificador no puede ver los usos "por nombre de texto" dentro de los strings HTML.
// Verificado empíricamente: con --minify (todas las pasadas) funciones como cardHTML,
// renderList o eqCancelReply desaparecían del output; sin --minify-identifiers sobreviven.
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist', 'm');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const jsResult = await esbuild.build({
    entryPoints: [path.join(ROOT, 'public', 'm', 'app.js')],
    outfile: path.join(OUT_DIR, 'app.js'),
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false, // ver nota arriba — NUNCA activar esto para este archivo
    bundle: false,
    metafile: true,
  });

  const cssResult = await esbuild.build({
    entryPoints: [path.join(ROOT, 'public', 'm', 'app.css')],
    outfile: path.join(OUT_DIR, 'app.css'),
    minify: true, // CSS no tiene el problema de scope global — minificado completo es seguro
    bundle: false,
    metafile: true,
  });

  const jsBefore = fs.statSync(path.join(ROOT, 'public', 'm', 'app.js')).size;
  const jsAfter = fs.statSync(path.join(OUT_DIR, 'app.js')).size;
  const cssBefore = fs.statSync(path.join(ROOT, 'public', 'm', 'app.css')).size;
  const cssAfter = fs.statSync(path.join(OUT_DIR, 'app.css')).size;

  console.log(`app.js:  ${(jsBefore / 1024).toFixed(1)}KB -> ${(jsAfter / 1024).toFixed(1)}KB (${Math.round((1 - jsAfter / jsBefore) * 100)}% menos)`);
  console.log(`app.css: ${(cssBefore / 1024).toFixed(1)}KB -> ${(cssAfter / 1024).toFixed(1)}KB (${Math.round((1 - cssAfter / cssBefore) * 100)}% menos)`);
  console.log(`Salida: ${OUT_DIR}`);
}

main().catch((e) => { console.error('build-mobile falló:', e); process.exit(1); });
