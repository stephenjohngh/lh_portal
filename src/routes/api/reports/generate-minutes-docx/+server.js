// src/routes/api/reports/generate-minutes-docx/+server.js
// Meeting minutes as a Word document. The document is built in
// #lib/server/managementDocx.js from the same grouping the minutes screens use
// (management/utils/meetingMinutes.js).

import { json } from '@sveltejs/kit';
import { requireAuth } from '#lib/server/requireAuth.js';
import { getLogger } from '#lib/utils/logger.js';
import { today } from '#lib/utils/dates.js';
import { buildMinutesReport, reportDocument, packReport } from '#lib/server/managementDocx.js';

const logger = getLogger('GenerateMinutesDocx');

export async function POST({ request }) {
  // Authenticated users only — these endpoints render caller-supplied data
  // into official-looking documents and burn server compute; neither should
  // be reachable anonymously.
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const { meeting, issues, attendees } = await request.json();
    if (!meeting) return json({ error: 'No meeting provided' }, { status: 400 });

    const doc = reportDocument('Meeting Minutes',
      buildMinutesReport({ meeting, issues: issues || [], attendees: attendees || [] }));
    const safe = (meeting.title ?? 'Minutes').replace(/[^a-zA-Z0-9]+/g, '_');
    logger('✅ Minutes:', meeting.title);
    return await packReport(doc, `Minutes_${safe}_${today()}.docx`);
  } catch (/** @type {any} */ err) {
    logger('❌ Error generating the minutes:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
