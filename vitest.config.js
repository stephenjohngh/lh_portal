// vitest.config.js
// Two kinds of tests live here (see CLAUDE.md "Testing"):
//   1. Pure-logic unit tests (.js) — run in the default `node` environment.
//   2. Component tests (.svelte rendered via @testing-library/svelte) — each
//      such file opts into jsdom with a top docblock: `// @vitest-environment jsdom`.
// The svelte() plugin compiles .svelte imports; svelteTesting() adds the
// `browser` resolve condition + auto-cleanup between tests. $app/$env are not
// wired (no SvelteKit plugin) — tests mock those module specifiers directly.
import { defineConfig } from 'vitest/config';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  // preprocess is passed here because svelte.config.js no longer exists
  // (SvelteKit 3); #lib resolves through package.json "imports".
  plugins: [svelte({ preprocess: vitePreprocess() }), svelteTesting()],
  test: {
    include: ['src/**/*.test.js'],
    environment: 'node',           // component test files override via docblock
    setupFiles: ['./vitest-setup.js'],
  },
});
