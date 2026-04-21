// tailwind.config.js
// Imports the accent palette from the single source of truth in theme.js.
// To rebrand: edit src/lib/theme.js ACCENT_PALETTE and CSS vars in app.css.
import { ACCENT_PALETTE } from './src/lib/theme.js';

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      // Override Tailwind's default purple palette with the LH portal teal accent.
      // Every purple-* Tailwind class in the portal renders in teal — no class renaming needed.
      colors: {
        purple: ACCENT_PALETTE,
      },
    },
  },
  plugins: [],
}
