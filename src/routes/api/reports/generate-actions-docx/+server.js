// src/routes/api/reports/generate-actions-docx/+server.js
// The actions Word report. Accepts grouped data:
// { groups: [{ issue, actions }], selectedUser, userName, sortMode }.
// The document is built in #lib/server/managementDocx.js, where it can be tested.

import { json } from '@sveltejs/kit';
import { requireAuth } from '#lib/server/requireAuth.js';
import { getLogger } from '#lib/utils/logger.js';
import { today } from '#lib/utils/dates.js';
import { buildActionsReport, reportDocument, packReport } from '#lib/server/managementDocx.js';

const logger = getLogger('GenerateActionsDocx');

export async function POST({ request }) {
  // Authenticated users only — these endpoints render caller-supplied data
  // into official-looking documents and burn server compute; neither should
  // be reachable anonymously.
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const { groups, selectedUser, userName, sortMode } = await request.json();
    if (!groups || !Array.isArray(groups)) {
      return json({ error: 'No groups provided' }, { status: 400 });
    }
    const total = groups.reduce((n, g) => n + (g.actions?.length ?? 0), 0);
    if (total === 0) return new Response('', { status: 204 });

    const suffix = selectedUser === 'all'         ? 'All_Users'
                 : selectedUser === 'unallocated' ? 'Unallocated'
                 : (userName ?? '').replace(/\s+/g, '_');
    const doc = reportDocument('Actions Report', buildActionsReport({ groups, userName, sortMode }));
    logger('✅ Actions report:', total, 'actions');
    return await packReport(doc, `Actions_Report_${suffix}_${today()}.docx`);
  } catch (/** @type {any} */ err) {
    logger('❌ Error generating the actions report:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
