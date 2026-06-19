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
	},
	// Pre-bundle heavy/lazily-imported deps at dev-server start instead of
	// lazily on first use, so navigating to a feature that pulls one in doesn't
	// trigger a one-off "optimized dependencies changed. reloading" full-page
	// refresh. These are deps only imported inside code-split feature chunks
	// (editor, error reporting, image upload), so Vite can't see them at boot
	// until listed here. Dev-only ergonomics — no effect on the production build.
	optimizeDeps: {
		include: [
			'@tiptap/core',
			'@tiptap/starter-kit',
			'@tiptap/extension-link',
			'@sentry/sveltekit',
			'@supabase/supabase-js',
			'debug',
			'dompurify',
			'browser-image-compression'
		]
	}
});
