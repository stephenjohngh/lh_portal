export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      // Override the purple palette with the LH portal teal accent.
      // Base colour: RGB(60, 150, 131) = #3c9683 (maps to the 500 shade).
      // Lighter shades interpolated toward white; darker toward black.
      colors: {
        purple: {
          50:  '#f1f8f6',
          100: '#e2efec',
          200: '#bbdad4',
          300: '#94c5bb',
          400: '#6db0a2',
          500: '#3c9683',
          600: '#307869',
          700: '#245a4f',
          800: '#183c34',
          900: '#0c1e1a',
          950: '#060f0d',
        },
      },
    },
  },
  plugins: [],
}
