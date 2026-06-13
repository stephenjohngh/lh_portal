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
});

export const handleError = Sentry.handleErrorWithSentry();
