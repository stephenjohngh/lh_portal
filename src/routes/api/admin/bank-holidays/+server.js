// src/routes/api/admin/bank-holidays/+server.js
//
// GET — GOV.UK's published bank holidays for England and Wales, passed on to an
// admin so Admin → Non-working days can offer the ones the list lacks. Read
// only: nothing is written here, and the browser adds days through its own
// (admin-only) table policy. Admin only because it is a call out to a third
// party made on the portal's behalf.

import { json } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/requireAuth.js';
import { getLogger } from '#lib/utils/logger.js';

const logger = getLogger('BankHolidaysAPI');
const FEED_URL = 'https://www.gov.uk/bank-holidays.json';

export async function GET({ request, fetch }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } });
    if (!res.ok) return json({ error: `GOV.UK answered ${res.status}.` }, { status: 502 });
    const feed = await res.json();
    const events = (feed?.['england-and-wales']?.events ?? [])
      .filter((e) => e && typeof e.date === 'string' && typeof e.title === 'string')
      .map((e) => ({ date: e.date, title: e.title }));
    if (!events.length) return json({ error: 'GOV.UK’s list had no England and Wales days in it.' }, { status: 502 });
    return json({ events });
  } catch (err) {
    logger('⚠ could not read the GOV.UK bank holidays —', err);
    return json({ error: 'GOV.UK could not be reached just now.' }, { status: 502 });
  }
}
