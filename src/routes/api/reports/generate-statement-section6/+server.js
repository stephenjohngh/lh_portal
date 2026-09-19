// src/routes/api/reports/generate-statement-section6/+server.js
// §6 of the Periodic Obligations Statement — the register — generated from the
// register held in this system. R4 of the Register-In-The-App build plan.
//
// ⛔ THIS IS THE STATEMENT'S OWN SECTION, NOT AN EXTRACT. The sibling route
// `generate-register-extract` produces a filtered Word document that is labelled
// an extract on its first page precisely so it cannot be mistaken for the
// statement. This one is the opposite: it is the real §6, it is never filtered,
// and it is meant to replace the hand-maintained section in the document.
//
// Thin on purpose. The section is built by `$lib/server/statementSection6.js`:
// a `+server.js` may only export HTTP verbs, so a builder living here could
// never be unit-tested — and this one carries the assertion that every
// applicable row reached the page, which is the single most important thing in
// it. Nine entries were once absent from every version of the statement ever
// produced, including the copy an external reviewer assessed.

import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
import { getLogger } from '$lib/utils/logger';
import { buildStatementSection6 } from '$lib/server/statementSection6.js';

const logger = getLogger('reports:generate-statement-section6');

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    const markdown = buildStatementSection6(payload);

    logger('✅ statement §6:', (payload.entries ?? []).length, 'entries from', payload.source);

    const dateSlug = new Date().toISOString().slice(0, 10);
    return new Response(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="Statement_Section_6_${dateSlug}.md"`,
      },
    });
  } catch (/** @type {any} */ err) {
    // ⚠ A refusal here is the system working. `buildStatementSection6` throws on
    // an empty register and on any row that would be silently absent from the
    // page, and both are far better as a visible error than as a document.
    logger('❌ statement §6 failed:', err?.message, err?.stack);
    return json({ error: err?.message ?? 'Failed to generate the section' }, { status: 500 });
  }
}
