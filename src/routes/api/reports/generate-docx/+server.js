// src/routes/api/reports/generate-docx/+server.js
// The issues Word report. The document is built in $lib/server/managementDocx.js,
// where it can be tested; this route checks the caller, reads the request and
// sends the file.

import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
import { getLogger } from '$lib/utils/logger';
import { today } from '$lib/utils/dates';
import { buildIssuesReport, reportDocument, packReport } from '$lib/server/managementDocx.js';

const logger = getLogger('GenerateDocx');

export async function POST({ request }) {
  // Authenticated users only — these endpoints render caller-supplied data
  // into official-looking documents and burn server compute; neither should
  // be reachable anonymously.
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    if (!body?.issues?.length) return new Response('', { status: 204 });

    const doc = reportDocument('Issues Report', buildIssuesReport(body));
    logger('✅ Issues report:', body.issues.length, 'issues');
    return await packReport(doc, `Issues_Report_${today()}.docx`);
  } catch (/** @type {any} */ err) {
    // ⚠ The message only. This used to send the server's stack trace to the
    // browser, which tells a caller how the server is laid out.
    logger('❌ Error generating the issues report:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
