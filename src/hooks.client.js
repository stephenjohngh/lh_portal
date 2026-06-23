// src/hooks.client.js
// Client-side Sentry error tracking.
//
// Public env vars MUST be read via $env/dynamic/public — SvelteKit does NOT
// expose PUBLIC_*-prefixed vars on import.meta.env (Vite's envPrefix is VITE_).
// dynamic/public returns undefined gracefully when unset, so a build/run
// without PUBLIC_SENTRY_DSN simply runs with Sentry disabled. Errors-only on
// the client: no tracing or replay integrations, keeping the bundle minimal.

import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/public';

const SENTRY_DSN = env.PUBLIC_SENTRY_DSN ?? '';

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  environment: env.PUBLIC_ENV_LABEL || 'development',
  // Route events through a same-origin endpoint instead of *.ingest.sentry.io
  // so host-based ad/tracker blockers (uBlock, Privacy Badger, …) can't drop
  // them. The relay (src/routes/api/monitoring/+server.js) forwards to Sentry
  // server-side. Path avoids the word "sentry" on purpose (some lists match it).
  tunnel: '/api/monitoring',
  // @sentry/sveltekit adds BrowserTracing by default, which patches
  // history.pushState/replaceState for navigation spans. We set no
  // tracesSampleRate, so it produces nothing — but the history patch makes
  // SvelteKit's client router log "Avoid using history.pushState(...)" on every
  // load. Drop it (errors-only client SDK); keep all other default integrations.
  integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserTracing'),
  // Drop benign, non-actionable noise so real errors aren't buried. These are
  // dominated by user-side conditions, not app bugs:
  //   • transient connectivity — laptops waking from sleep, Wi-Fi reconnects,
  //     and tab-resume token refreshes (Supabase /auth/v1/token) that fail once
  //     then self-heal on retry. One message per browser engine.
  //   • fetches cancelled by a navigation (AbortError).
  //   • the harmless ResizeObserver loop notice browsers emit under layout churn.
  // Trade-off: a genuine backend outage that surfaces only as "Failed to fetch"
  // won't reach Sentry — acceptable for an internal portal, and our own /api
  // errors still report via their JSON error paths. Dial back here if needed.
  ignoreErrors: [
    'NetworkError when attempting to fetch resource', // Firefox
    'Failed to fetch',                                // Chromium
    'Load failed',                                    // Safari/WebKit
    'AbortError',
    'The operation was aborted',
    /ResizeObserver loop (limit exceeded|completed)/,
  ],
});

export const handleError = Sentry.handleErrorWithSentry();
