// src/hooks.client.js
// Client-side Sentry error tracking.
//
// PUBLIC_SENTRY_DSN is read via import.meta.env (undefined-safe — same
// pattern as PUBLIC_ENV_LABEL) so dev and CI builds without the variable
// simply run with Sentry disabled. Errors-only on the client: no tracing
// or replay integrations, keeping the bundle cost minimal.

import * as Sentry from '@sentry/sveltekit';

const SENTRY_DSN = import.meta.env.PUBLIC_SENTRY_DSN ?? '';

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  environment: import.meta.env.PUBLIC_ENV_LABEL || 'development',
});

export const handleError = Sentry.handleErrorWithSentry();
