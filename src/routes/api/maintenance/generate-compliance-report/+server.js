// src/routes/api/maintenance/generate-compliance-report/+server.js
// The periodic compliance position as a Word document.
//
// POST body: { building, generatedAt, report, rows, history, historyWindow,
//              summary, options }
//
// Thin on purpose. The document itself is built by
// `$lib/server/complianceDocx.js`: a `+server.js` may only export HTTP verbs, so
// builders living here could never be unit-tested — and document generation is
// exactly the kind of code that fails at runtime on something static analysis
// cannot see.
//
// The rows arrive PRE-FILTERED AND PRE-SORTED from the screen that asked for
// them, and nothing here re-derives any of it, so the document can never
// disagree with the report the user was looking at.

import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
import { getLogger } from '$lib/utils/logger';
import { buildComplianceDocument, printedRows, Packer } from '$lib/server/complianceDocx.js';

const logger = getLogger('maintenance:generate-compliance-report');

export async function POST({ request }) {
  const authed = await requireAuth(request);
  if (authed instanceof Response) return authed;

  try {
    const payload = await request.json();
    const doc = buildComplianceDocument(payload);
    const buf = await Packer.toBuffer(doc);

    logger('✅ compliance report:',
      printedRows(payload.rows, payload.options).length, 'rows,',
      (payload.history ?? []).length, 'occurrences');

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="Compliance_Position.docx"',
      },
    });
  } catch (/** @type {any} */ err) {
    logger('❌ compliance report failed:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
