// src/routes/api/status/+server.js
// POST /api/status — where an item of any process has got to (migration 261),
// for someone with no login who holds its reference and code. Answers only
// for a process an administrator has switched on (Admin → Workflows); the
// step's public name, the process's name and two dates — nothing else.
// Same-site only and rate limited (`status_lookup`, shared with the other
// status pages). A wrong pair, a missing item and a process switched off all
// read the same.

import { json } from '@sveltejs/kit';
import { isSameOrigin } from '#lib/server/verifyOrigin.js';
import { checkRateLimit } from '#lib/server/publicRateLimit.js';
import { publicStatus } from '#lib/server/publicStatus.js';

export async function POST({ request, url }) {
  if (!isSameOrigin(request, url)) return json({ error: 'Cross-origin requests are not permitted.' }, { status: 403 });
  if (!(await checkRateLimit(request, 'status_lookup'))) {
    return json({ error: 'Too many look-ups from here. Please wait a few minutes and try again.' }, { status: 429 });
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, { status: 400 }); }
  try {
    const status = await publicStatus(body?.reference, body?.code);
    if (!status) return json({ error: 'Nothing matches that reference and code.' }, { status: 404 });
    return json(status);
  } catch {
    return json({ error: 'This cannot be checked just now. Please try again later.' }, { status: 500 });
  }
}
