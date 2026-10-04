// src/lib/utils/aiSwitch.js
//
// Whether Management's AI suggestions are on: an admin setting, Admin → Other
// Config → Portal (2026-10-04, PROJECT_STATUS §6ccc item 10, D). It was the
// PUBLIC_AI_SUGGESTIONS_ENABLED environment flag, which meant a redeploy to
// switch it.
//
// ⭐ ON unless an admin has switched it off. Stored in portal_settings under
// `ai_enabled` only as `false`/`true` once somebody chooses; no row means on,
// which is what the environment flag said on the deployment this replaced.
// The API key stays in the deploy environment — a secret is not a setting —
// and without one nothing can be suggested whatever this says.
//
// Pure: imports nothing.

export const AI_ENABLED_KEY = 'ai_enabled';

/** What a stored value means. @param {unknown} value */
export function aiEnabledFrom(value) {
  return value !== false;
}
