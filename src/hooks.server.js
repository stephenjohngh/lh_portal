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
  const response = await resolve(event, {
    // SvelteKit's default preloads js + css. The shell (src/routes/+page.svelte)
    // dynamically imports all ~10 sub-apps, so every page's dependency set pulls
    // in the scoped CSS of every app AND every shared component (Modal,
    // ProtectedButton, LoadingSpinner, …). On the initial home view almost none
    // of that CSS is used immediately, so the browser preloads stylesheets it
    // won't apply for a while — surfaced on the deployed builds as Firefox's
    // "preloaded … was not used within a few seconds" warnings.
    //
    // Drop CSS preload hints (keep js modulepreload, which has real value and
    // doesn't warn). Each <link rel="stylesheet"> is still emitted in <head> and
    // is render-blocking, so the CSS still loads with no flash-of-unstyled
    // content — we only remove the redundant parallel preload hint.
    preload: ({ type }) => type === 'js',
  });

  // Stop MIME-sniffing of responses (e.g. uploaded files served via the
  // media proxy being interpreted as HTML).
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Belt-and-braces with CSP frame-ancestors 'none' for older browsers.
  response.headers.set('X-Frame-Options', 'DENY');

  // Don't leak portal URLs (which include case ids etc.) to external sites.
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // The portal uses none of these — the inspection apps take photos via
  // <input type="file" capture>, which is not gated by Permissions-Policy.
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // The site is HTTPS-only on both deploy targets (Netlify and Northflank);
  // pin that for a year.
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

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
