// src/hooks.server.js
// Global server hook — attaches security headers to every response.
//
// The Content-Security-Policy is NOT set here: it lives in svelte.config.js
// (kit.csp) so SvelteKit can nonce its own inline hydration scripts. This
// hook carries everything else.

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
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
