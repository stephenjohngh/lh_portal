import adapterNetlify from '@sveltejs/adapter-netlify';
import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

/**
 * The build's identity, shown in the footer as `v…`.
 *
 * ⚠ This used to be SvelteKit's default for `version.name`, which is
 * `Date.now()` — a build timestamp with nothing in it derived from the source.
 * Two platforms building the SAME commit produced two different numbers, so the
 * one question the footer is there to answer — "are these running the same
 * code?" — could not be answered by it, and a stale deploy was indistinguishable
 * from a fresh one. A commit SHA answers it exactly.
 *
 * Order: an explicit override, then whatever the platform already knows, then
 * git itself. The env vars matter because a build that starts from an exported
 * tarball has no `.git` to ask.
 */
function buildVersion() {
  const fromEnv =
    process.env.PUBLIC_BUILD_SHA        // set this by hand if all else fails
    ?? process.env.COMMIT_REF           // Netlify
    ?? process.env.NF_GIT_COMMIT_SHA    // Northflank
    ?? process.env.GIT_COMMIT
    ?? process.env.SOURCE_VERSION;      // Render, Heroku

  if (fromEnv) return String(fromEnv).slice(0, 7);

  try {
    const sha = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();

    // Uncommitted changes mean the SHA alone is a lie about what is running —
    // which matters most locally, where that is the normal state.
    const dirty = execSync('git status --porcelain', {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim().length > 0;

    return dirty ? `${sha}-dirty` : sha;
  } catch {
    // ⚠ MUST BE DETERMINISTIC. Never Date.now() here, which is what this
    // fell back to at first and is a hydration bomb: SvelteKit namespaces
    // `globalThis.__sveltekit_<hash>` with a hash of THIS STRING, the inline
    // script in the SSR'd HTML defines it and the client chunks read it. If the
    // value differs between two evaluations in one build — which a timestamp
    // does by definition — the two halves look for different globals and every
    // page dies on load with:
    //
    //   TypeError: can't access property "env", globalThis.__sveltekit_… is
    //   undefined
    //
    // A constant costs only SvelteKit's "app updated" detection, which is
    // cosmetic. Getting it wrong costs the whole application.
    return `nogit-${packageVersion()}`;
  }
}

/** The version from package.json — stable across evaluations, unlike a clock. */
function packageVersion() {
  try {
    return JSON.parse(readFileSync('./package.json', 'utf8')).version ?? '0';
  } catch {
    return '0';
  }
}

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

    // The footer's `v…`, read by the app from $app/environment.
    version: { name: buildVersion() },

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
