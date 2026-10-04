import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapterNetlify from '@sveltejs/adapter-netlify';
import adapterNode from '@sveltejs/adapter-node';
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ⭐ SvelteKit 3 reads its configuration from the sveltekit() plugin here;
// svelte.config.js is no longer used (and is an error if present).
//
// Two deploy targets from the same `main`, chosen at build time:
//   • Netlify (default)              → adapter-netlify (serverless functions)
//   • Northflank (DEPLOYMENT_TARGET=northflank) → adapter-node, run as `node build`
//
// ⚠ @sveltejs/adapter-node is pinned EXACT in package.json. 5.5.5 shipped a
// server entry that hung in `await server.init()` (exit code 13, "unsettled
// top-level await"); a release can break `node build` while `npm run build`
// still passes, so a version is only taken after building for Northflank and
// starting `node build` locally. CLAUDE.md has the method.
const northflank = process.env.DEPLOYMENT_TARGET === 'northflank';

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
  // ⚠ Every source here must be BUILD-time. This file is evaluated by Vite
  // during the build, so a variable a platform injects only into the running
  // container is invisible and falls through to the constant below.
  const fromEnv =
    process.env.PUBLIC_BUILD_SHA        // set this by hand if all else fails
    ?? process.env.COMMIT_REF           // Netlify
    ?? process.env.NF_DEPLOYMENT_SHA    // Northflank
    ?? process.env.NF_GIT_COMMIT_SHA    // Northflank, older naming
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

/**
 * buildVersion(), said out loud in the build log.
 *
 * Worth a line of output because the value being invisible is what made a bad
 * one expensive: the fallback fired silently on one platform and the only
 * symptom was every page failing to hydrate. If this prints `nogit-…` in a
 * deploy log, that build could not identify itself and the footer will not
 * distinguish it from any other — set PUBLIC_BUILD_SHA (or make the platform's
 * own commit variable available to the BUILD, not just the container).
 */
function announcedVersion() {
  const name = buildVersion();
  console.log(`[build] app version: ${name}`);
  return name;
}

/** The version from package.json — stable across evaluations, unlike a clock. */
function packageVersion() {
  try {
    return JSON.parse(readFileSync('./package.json', 'utf8')).version ?? '0';
  } catch {
    return '0';
  }
}

// Format today's date as "25 May 2026" at build time.
const buildDate = new Date().toLocaleDateString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric'
});

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),

			adapter: northflank
				? adapterNode({ out: 'build' })
				: adapterNetlify({ edge: false, split: false, publish: 'build' }),

			// The footer's `v…`, read by the app from $app/env.
			version: { name: announcedVersion() },

			// adapter-node no longer reads an ORIGIN variable at run time: it takes
			// the host from the Host header and assumes https. Set ORIGIN in the
			// BUILD environment only if the proxy in front of `node build` does not
			// pass the public host through.
			...(process.env.ORIGIN ? { paths: { origin: process.env.ORIGIN } } : {}),

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
		})
	],
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
