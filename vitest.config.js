// vitest.config.js
// Standalone vitest config — deliberately does NOT load the SvelteKit vite
// plugin: unit tests target pure utility modules only (no components, no
// $app/* imports), so all they need is the $lib alias.
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.js'],
    environment: 'node',
  },
});
