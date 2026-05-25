import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Format today's date as "25 May 2026" at build time.
const buildDate = new Date().toLocaleDateString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric'
});

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__BUILD_DATE__: JSON.stringify(buildDate)
	}
});
