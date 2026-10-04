// src/env.js — every environment variable the app reads (SvelteKit 3).
//
// SvelteKit 3 exports only the variables declared here; the old `$env/*`
// modules are deprecated aliases of `$app/env/*` and export nothing that is
// not listed. Each entry mirrors how the code read it under SvelteKit 2:
//   $env/static/public   → public, static  (inlined at build)
//   $env/dynamic/public  → public          (read when the app starts)
//   $env/dynamic/private → private         (read when the app starts)
//
// ⚠ Every one is OPTIONAL (`optional` returns the value, undefined included),
// because that is how the code treats them: a missing variable was undefined
// before, and the code already falls back (`?? ''`, a provider not chosen).
// Without a schema SvelteKit refuses to start when a variable is unset.
// A new variable must be added here, or it reads as undefined.
import { defineEnvVars } from '@sveltejs/kit/env';

/** @param {string | undefined} v */
const optional = (v) => v;

const publicStatic  = { public: true, static: true, schema: optional };
const publicDynamic = { public: true, schema: optional };
const privateDynamic = { schema: optional };

export const variables = defineEnvVars({
  PUBLIC_SUPABASE_URL:      publicStatic,
  PUBLIC_SUPABASE_ANON_KEY: publicStatic,

  PUBLIC_SENTRY_DSN: publicDynamic,
  PUBLIC_ENV_LABEL:  publicDynamic,

  SUPABASE_SERVICE_ROLE_KEY: privateDynamic,
  ANTHROPIC_API_KEY:         privateDynamic,
  DOSSIER_LINK_SECRET:       privateDynamic,
  GT_CRON_SECRET:            privateDynamic,

  STORAGE_PROVIDER:                privateDynamic,
  STORAGE_WITHIN_ROOT_ONLY:        privateDynamic,
  STORAGE_DELETE_WITHIN_ROOT_ONLY: privateDynamic,
  GOOGLE_DRIVE_ROOT_FOLDER_ID:     privateDynamic,
  GOOGLE_OAUTH_CLIENT_ID:          privateDynamic,
  GOOGLE_OAUTH_CLIENT_SECRET:      privateDynamic,
  GOOGLE_OAUTH_REFRESH_TOKEN:      privateDynamic,
  GOOGLE_DRIVE_CLIENT_EMAIL:       privateDynamic,
  GOOGLE_DRIVE_PRIVATE_KEY:        privateDynamic,
  ONEDRIVE_TENANT_ID:      privateDynamic,
  ONEDRIVE_CLIENT_ID:      privateDynamic,
  ONEDRIVE_CLIENT_SECRET:  privateDynamic,
  ONEDRIVE_DRIVE_ID:       privateDynamic,
  ONEDRIVE_ROOT_FOLDER_ID: privateDynamic,

  // The deployed commit, for the footer (+layout.server.js).
  NF_DEPLOYMENT_SHA: privateDynamic,
  COMMIT_REF:        privateDynamic,
  PUBLIC_BUILD_SHA:  privateDynamic,
  GIT_COMMIT:        privateDynamic,
});
