// src/lib/offline/syncErrors.js
//
// Whether a queued op that failed should be RETRIED later or SKIPPED, for every
// offline queue (2026-10-17; was written once in Inspection and once in
// Parking). Skipped means marked an error the person can Retry — it is never
// thrown away, but it no longer holds up the ops behind it.
//
//   permanent — the server looked at it and said no: a database rejection
//               (PostgREST carries a `.code`, e.g. 23514 CHECK, 42501 RLS), or
//               an HTTP 4xx other than 408 timeout and 429 rate limit;
//   transient — anything else: no network, a 5xx, a timeout, a rate limit, an
//               expired session (sign in again and it goes).

import { SESSION_EXPIRED } from '#lib/utils/sessionExpired.js';
import { errMessage } from '#lib/utils/errors.js';

/**
 * @param {any} e  what the op threw
 * @returns {{ ok: false, permanent: boolean, error: string }}
 */
export function classifySyncError(e) {
  const status = e?.status;
  const refusedByServer = e?.message !== SESSION_EXPIRED && typeof status === 'number'
    && status >= 400 && status < 500 && status !== 408 && status !== 429;
  const permanent = !!(e && e.code != null) || refusedByServer;
  return { ok: false, permanent, error: errMessage(e) };
}
