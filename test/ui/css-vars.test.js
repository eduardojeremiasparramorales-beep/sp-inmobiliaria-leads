// Defensa contra el bug real que reportó un asesor en producción: "Mis comisiones"
// (y otras 5 pantallas) se abrían con el fondo TOTALMENTE TRANSPARENTE, dejando ver
// todo el contenido de atrás encimado. Causa: `background:var(--bg)` en public/m/app.js,
// y --bg NO EXISTE en ninguna hoja que carga /m/ (los tokens reales son --bg-0.._4).
// `var()` con una variable indefinida y sin fallback es *invalid at computed-value
// time*: el navegador no ignora la regla, la computa a `transparent` — sin error en
// consola, sin nada visible hasta que alguien mira la pantalla exacta donde pasa.
// Este test recolecta toda `var(--x)` SIN fallback usada en cada "bundle" de páginas
// (las hojas que esa página realmente carga) y falla si alguna no está definida en
// ESE MISMO bundle — agrupar por página, no por proyecto entero, es a propósito: si
// se comparara contra TODAS las definiciones del repo, una variable que solo existe
// en login.html (standalone, su propio sistema) taparía el mismo bug en /m/.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Sin esto, un comentario que MENCIONE "var(--bg)" como ejemplo de código roto (como
// el que documenta el propio arreglo de este bug en app.css) se contaría como un uso
// real y el test se falsopositivaría contra su propia documentación.
function sinComentariosDeBloque(contenido) {
  return contenido.replace(/\/\*[\s\S]*?\*\//g, '');
}

// --safe-t/--safe-b/--kb además de en :root de app.css (línea 3-5) los reescribe en
// caliente public/os/safe-area.js con setProperty — cuentan como "definidas" igual.
function definidas(...contenidos) {
  const set = new Set();
  for (const c of contenidos) {
    for (const m of sinComentariosDeBloque(c).matchAll(/(--[\w-]+)\s*:/g)) set.add(m[1]);
  }
  return set;
}

// Solo var(--x) SIN segundo argumento (fallback) es peligroso — var(--x, #000) nunca
// puede quedar transparent aunque --x no exista, así que esos son inofensivos y se excluyen.
function usosSinFallback(contenido) {
  const usos = new Map(); // variable -> primera coincidencia (para el mensaje de error)
  for (const m of sinComentariosDeBloque(contenido).matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
    if (!usos.has(m[1])) usos.set(m[1], m.index);
  }
  return usos;
}

function huerfanas(bundleContenidos, ...archivosAEscanear) {
  const def = definidas(...bundleContenidos);
  const problemas = [];
  for (const { nombre, contenido } of archivosAEscanear) {
    for (const [variable] of usosSinFallback(contenido)) {
      if (!def.has(variable)) problemas.push(`${nombre}: var(${variable}) sin fallback y sin definir en este bundle`);
    }
  }
  return problemas;
}

describe('variables CSS huérfanas', () => {
  it('/m/ — panel móvil del asesor: toda var(--x) usada está definida en sp-os.css, app.css o index.html', () => {
    const spOs = read('public/os/sp-os.css');
    const appCss = read('public/m/app.css');
    const indexHtml = read('public/m/index.html');
    const appJs = read('public/m/app.js');

    const problemas = huerfanas(
      [spOs, appCss, indexHtml],
      { nombre: 'public/os/sp-os.css', contenido: spOs },
      { nombre: 'public/m/app.css', contenido: appCss },
      { nombre: 'public/m/index.html', contenido: indexHtml },
      { nombre: 'public/m/app.js', contenido: appJs },
    );
    expect(problemas).toEqual([]);
  });

  it('panel admin (/os/ y /supervisor/) — toda var(--x) usada está definida en sp-os.css o en la propia página', () => {
    const spOs = read('public/os/sp-os.css');
    const dirs = ['public/os', 'public/supervisor'];
    const archivos = [];
    for (const dir of dirs) {
      for (const f of fs.readdirSync(path.join(ROOT, dir))) {
        if (f.endsWith('.html')) archivos.push({ nombre: `${dir}/${f}`, contenido: read(`${dir}/${f}`) });
      }
    }
    // El bundle de definiciones es sp-os.css + CADA página individual (no todas juntas):
    // una variable que solo define la página A no debe tapar un uso huérfano en la página B.
    const problemas = [];
    for (const archivo of archivos) {
      problemas.push(...huerfanas([spOs, archivo.contenido], archivo));
    }
    expect(problemas).toEqual([]);
  });
});
