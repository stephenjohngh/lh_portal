// Tailwind runs as a Vite plugin (vite.config.js), not through PostCSS: under
// Vite 8 the PostCSS route failed, because Vite resolves `@import "tailwindcss"`
// itself before any PostCSS plugin sees it (2026-10-04, SvelteKit 3 upgrade).
export default {
  plugins: {
    autoprefixer: {},
  },
}
