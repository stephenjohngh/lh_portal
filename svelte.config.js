import adapterNetlify from '@sveltejs/adapter-netlify';
import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// 1. Select the function (do NOT add () here)
const selectedAdapter = process.env.DEPLOYMENT_TARGET === 'northflank' 
  ? adapterNode 
  : adapterNetlify;

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // 2. Execute the selected adapter with conditional options
    adapter: selectedAdapter(
      process.env.DEPLOYMENT_TARGET === 'northflank'
        ? { out: 'build' } // Node options
        : { edge: false, split: false } // Netlify options
    ),

    // Content-Security-Policy. Declared here (not in hooks.server.js) so
    // SvelteKit nonces its own inline hydration scripts automatically —
    // a hand-written script-src 'self' header would break hydration.
    // The non-CSP security headers live in src/hooks.server.js.
    csp: {
      mode: 'auto',
      directives: {
        'default-src':     ['self'],
        'script-src':      ['self'],                    // + per-response nonce added by kit
        // 'unsafe-inline' is required for style: Svelte transitions and the
        // many dynamic style="" attributes (plan view positioning etc.).
        'style-src':       ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
        'font-src':        ['self', 'data:', 'https://fonts.gstatic.com'],
        // Photos may be served from Supabase storage or other provider URLs
        // stored in media_attachments; Drive goes via the same-origin proxy.
        'img-src':         ['self', 'data:', 'blob:', 'https:'],
        // Sentry: EU-region ingest (DSN host oXXXX.ingest.de.sentry.io)
        'connect-src':     ['self', 'https://*.supabase.co', 'wss://*.supabase.co', 'https://*.ingest.de.sentry.io'],
        'worker-src':      ['self'],
        'object-src':      ['none'],
        'base-uri':        ['self'],
        'form-action':     ['self'],
        'frame-ancestors': ['none'],
      }
    }
  }
};

export default config;
