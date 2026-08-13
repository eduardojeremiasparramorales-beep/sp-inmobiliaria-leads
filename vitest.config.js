const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // Vitest 4 no permite require('vitest') dentro de un test CommonJS (el proyecto
    // entero es CJS, sin "type":"module") — con globals:true, describe/it/expect quedan
    // disponibles como ambientales y los tests siguen siendo archivos .js normales que
    // hacen require() de los módulos propios, igual que el resto del código.
    globals: true,
    // Los tests de store.js abren su propia conexión sql.js por archivo — con hilos
    // paralelos por defecto, varios workers cargan sql.js (WASM) a la vez y compiten
    // por CPU en la e2-micro/CI. Forzar un solo proceso evita eso a cambio de un poco
    // más de tiempo total — aceptable dado el tamaño actual de la suite.
    pool: 'forks',
    fileParallelism: false,
  },
});
