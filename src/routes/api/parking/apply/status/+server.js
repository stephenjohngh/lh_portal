// src/routes/api/parking/apply/status/+server.js
// POST /api/parking/apply/status — where a public parking application has got
// to (2026-10-17, migration 247). Needs the reference AND the code given when
// it was sent; answers with the step's public name only — nothing about the
// applicant. Same-site only and rate limited (`status_lookup`, shared with
// MOR's status page). A wrong pair and a missing application read the same.

import { json } from '@sveltejs/kit';
import { isSameOrigin } from '#lib/server/verifyOrigin.js';
import { checkRateLimit } from '#lib/server/publicRateLimit.js';
import { applicationStatus } from '#lib/server/parkingApply.js';

export async function POST({ request, url }) {
  if (!isSameOrigin(request, url)) return json({ error: 'Cross-origin requests are not permitted.' }, { status: 403 });
  if (!(await checkRateLimit(request, 'status_lookup'))) {
    return json({ error: 'Too many look-ups from here. Please wait a few minutes and try again.' }, { status: 429 });
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, { status: 400 }); }
  try {
    const status = await applicationStatus(body?.reference, body?.code);
    if (!status) return json({ error: 'No application matches that reference and code.' }, { status: 404 });
    return json(status);
  } catch {
    return json({ error: 'This cannot be checked just now. Please try again later.' }, { status: 500 });
  }
}
