// src/hooks.server.js
// Global server hooks: Sentry error tracking + security headers on every
// response.
//
// The Content-Security-Policy is NOT set here: it lives in svelte.config.js
// (kit.csp) so SvelteKit can nonce its own inline hydration scripts. The
// Sentry ingest origin is allowed there under connect-src.

import { sequence } from '@sveltejs/kit/hooks';
import * as Sentry from '@sentry/sveltekit';
// Public env via $env/dynamic/public — NOT import.meta.env, which doesn't
// expose PUBLIC_* vars in SvelteKit (Vite envPrefix is VITE_).
import { env } from '$env/dynamic/public';

const SENTRY_DSN = env.PUBLIC_SENTRY_DSN ?? '';

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  environment: env.PUBLIC_ENV_LABEL || 'development',
  // Errors-only: no performance tracing. tracesSampleRate 0 means no
  // per-request transactions are sent (no transaction-quota use, no idle
  // overhead) — this is a low-traffic app where errors are the only signal
  // worth capturing.
  tracesSampleRate: 0,
});

/** @type {import('@sveltejs/kit').Handle} */
async function securityHeaders({ event, resolve }) {
  // Keep SvelteKit's default asset preloading (js + css). We previously dropped
  // CSS preload hints to silence Firefox's cosmetic "preloaded … was not used
  // within a few seconds" warnings — but on the Northflank (adapter-node) deploy,
  // whose static assets are served by the app server rather than an edge CDN,
  // that delayed CSS enough to trigger "Layout was forced before the page was
  // fully loaded" (a real FOUC risk). The default preload is what prevents that;
  // the "not used" warnings are benign false positives and are left alone.
  const response = await resolve(event);

  // Stop MIME-sniffing of responses (e.g. uploaded files served via the
  // media proxy being interpreted as HTML).
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Belt-and-braces with CSP frame-ancestors 'none' for older browsers.
  // No exception: nothing in the portal frames its own content. Dossier briefly
  // needed SAMEORIGIN for an inline PDF viewer, which was abandoned in favour
  // of an open-in-new-tab card (see dossier/utils/assetPreview.js), so the
  // stricter blanket DENY is back.
  response.headers.set('X-Frame-Options', 'DENY');

  // Don't leak portal URLs (which include case ids etc.) to external sites.
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // The portal uses none of these — the inspection apps take photos via
  // <input type="file" capture>, which is not gated by Permissions-Policy.
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // The site is HTTPS-only on both deploy targets (Netlify and Northflank);
  // pin that for a year.
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // ── An HTML page must never be cached, and adapter-node will not say so ────
  // Symptom this fixes, which is bewildering until you know the cause:
  //
  //   TypeError: can't access property "env", globalThis.__sveltekit_1vouhui
  //   is undefined
  //
  // SvelteKit namespaces that global with a hash of the app VERSION. The
  // document's inline hydration script defines it and the JS chunks read it, so
  // the error means the browser is running HTML from one build against
  // JavaScript from another. Immutable chunks are content-hashed and safe to
  // cache for ever; the HTML that names them is not, and a stale copy of it is
  // a broken page rather than an old one.
  //
  // Netlify sets `must-revalidate` on HTML itself, which is why only the
  // Northflank (adapter-node) deploy broke: a bare node server behind a proxy
  // sends no cache directive at all, so the document is fair game for the
  // browser and anything in between. Say it explicitly and both targets behave
  // the same.
  //
  // Only documents. Everything else — /_app/immutable, the media proxy's own
  // `private, max-age=3600`, API responses — keeps whatever it set.
  if ((response.headers.get('content-type') ?? '').includes('text/html')) {
    response.headers.set('Cache-Control', 'no-cache, must-revalidate');
  }

  return response;
}

export const handle = sequence(Sentry.sentryHandle(), securityHeaders);

/**
 * Custom error handler for Sentry's wrapper. Sentry already skips *capturing*
 * 4xx errors, but its built-in default handler still `console.error`s every
 * error's stack — including expected 404s for non-existent routes (e.g. a user
 * or bot hitting /api/media/ when only /api/media/file/[id] exists). Log only
 * genuine server errors (5xx / unknown status); the client still receives the
 * correct status code either way.
 *
 * @type {import('@sveltejs/kit').HandleServerError}
 */
function logServerErrors({ error, status }) {
  if (!status || status >= 500) {
    console.error(error);
  }
}

export const handleError = Sentry.handleErrorWithSentry(logServerErrors);
