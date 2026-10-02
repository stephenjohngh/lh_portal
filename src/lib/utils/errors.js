// src/lib/utils/errors.js
//
// A thrown value as text for a person to read — ONE helper (2026-10-02).
//
// It was written out 38 times as `err instanceof Error ? err.message :
// String(err)`, five of them as local `errMessage` functions, and every copy
// had the same gap: Supabase and PostgREST errors are often PLAIN OBJECTS with
// a `message`, not Error instances, so they printed "[object Object]".
//
// For a log line keep the value itself — `logger(..., err)` — and never
// "fix" a `catch (err)` to String(err): that changes what gets logged when
// the throw is not an Error (CLAUDE.md, Type checking).

/**
 * @param {unknown} err       whatever was thrown
 * @param {string} [fallback] text when the value carries no message of its own
 * @returns {string}
 */
export function errMessage(err, fallback) {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && typeof (/** @type {any} */ (err).message) === 'string'
      && /** @type {any} */ (err).message) {
    return /** @type {any} */ (err).message;
  }
  if (fallback !== undefined) return fallback;
  if (err instanceof Error) return err.name || 'Error';
  return String(err);
}
