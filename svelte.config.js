import adapterNetlify from '@sveltejs/adapter-netlify';
import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Two deploy targets from the same `main`, chosen at build time:
//   • Netlify (default)        → adapter-netlify (serverless functions)
//   • Northflank (env=northflank) → adapter-node, run as `node build` (npm start)
//
// ⚠️ @sveltejs/adapter-node is pinned to EXACT 5.5.4 in package.json (not a
// caret). 5.5.5 is broken: its generated entry hangs in `await server.init()`,
// so `node build` exits with code 13 ("Detected unsettled top-level await") —
// this breaks the Northflank deploy only (Netlify never runs that bootstrap).
// 5.5.5 is not even tagged `latest` in the registry. A plain `npm install`
// re-resolves a caret to 5.5.5, so keep the exact pin until a version newer
// than 5.5.5 ships, then bump to ^5.5.6. Fixed in commit a357566.

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
        // Sentry events go same-origin to /api/monitoring (the tunnel), which
        // relays to ingest server-side — so no ingest host is needed here.
        'connect-src':     ['self', 'https://*.supabase.co', 'wss://*.supabase.co'],
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
