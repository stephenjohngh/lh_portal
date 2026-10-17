// src/routes/api/parking/apply/+server.js
// POST /api/parking/apply — the public parking application form (no login,
// 2026-10-17, migration 247). Same-site only, rate limited per address (an
// admin policy, `parking_apply`), a hidden field bots fill in, and the form
// checked again here (never trusted from the page). Saved through
// parking_request_submit() with the service role; returns the reference and
// the code for the status page. Nothing about the applicant is logged.

import { json } from '@sveltejs/kit';
import { isSameOrigin } from '#lib/server/verifyOrigin.js';
import { checkRateLimit } from '#lib/server/publicRateLimit.js';
import { submitApplication } from '#lib/server/parkingApply.js';

export async function POST({ request, url }) {
  if (!isSameOrigin(request, url)) return json({ error: 'Cross-origin requests are not permitted.' }, { status: 403 });
  if (!(await checkRateLimit(request, 'parking_apply'))) {
    return json({ error: 'Too many applications from here. Please wait an hour and try again.' }, { status: 429 });
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return json({ error: 'Invalid request.' }, { status: 400 });
  // A bot fills the hidden field: answer as if it worked, and keep nothing.
  if (typeof body.website === 'string' && body.website.trim()) {
    return json({ reference: 'PKR-0000-000000', code: '000-000' });
  }
  try {
    return json(await submitApplication(body));
  } catch (/** @type {any} */ err) {
    return json({ error: err.message, fields: err.fields }, { status: err.status ?? 500 });
  }
}
