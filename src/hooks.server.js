// src/hooks.server.js
// Global server hooks: Sentry error tracking + security headers on every
// response.
//
// The Content-Security-Policy is NOT set here: it lives in svelte.config.js
// (kit.csp) so SvelteKit can nonce its own inline hydration scripts. The
// Sentry ingest origin is allowed there under connect-src.

import { sequence } from '@sveltejs/kit/hooks';
import * as Sentry from '@sentry/sveltekit';

const SENTRY_DSN = import.meta.env.PUBLIC_SENTRY_DSN ?? '';

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  environment: import.meta.env.PUBLIC_ENV_LABEL || 'development',
  // Errors-only: no performance tracing. tracesSampleRate 0 means no
  // per-request transactions are sent (no transaction-quota use, no idle
  // overhead) — this is a low-traffic app where errors are the only signal
  // worth capturing.
  tracesSampleRate: 0,
});

/** @type {import('@sveltejs/kit').Handle} */
async function securityHeaders({ event, resolve }) {
  const response = await resolve(event);

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
export const handleError = Sentry.handleErrorWithSentry();
