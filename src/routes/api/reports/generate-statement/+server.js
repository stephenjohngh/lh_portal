// src/routes/api/reports/generate-statement/+server.js
// The Periodic Obligations Statement, as a Word document. R5.
//
// ⭐ THE ARTEFACT THE BUILD PLAN EXISTS FOR — the whole document, produced by
// the deployed app rather than by one particular laptop.
//
// ⛔ NOT the sibling `generate-register-extract`, which is a filtered table
// labelled an extract on its first page precisely so it cannot be mistaken for
// this. This one is never filtered: it is every register entry and every prose
// section, or it refuses.
//
// Thin on purpose. The document is built by `$lib/server/statementDocx.js`: a
// `+server.js` may only export HTTP verbs, so a builder living here could never
// be unit-tested, and document generation is exactly the kind of code that
// fails at runtime on something static analysis cannot see.

import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
import { getLogger } from '$lib/utils/logger';
import { buildStatementDocx, Packer } from '$lib/server/statementDocx.js';

const logger = getLogger('reports:generate-statement');

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    const doc = buildStatementDocx(payload);
    const buf = await Packer.toBuffer(doc);

    logger('✅ statement:', (payload.entries ?? []).length, 'entries,',
      (payload.prose ?? []).length, 'prose sections,',
      `register=${payload.registerSource} prose=${payload.proseSource}`);

    const dateSlug = new Date().toISOString().slice(0, 10);
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="Safety_Obligations_Statement_${dateSlug}.docx"`,
      },
    });
  } catch (/** @type {any} */ err) {
    // ⚠ A refusal is the system working, and it is not caught any earlier on
    // purpose. The assembler throws when a register row would be silently
    // absent or a prose section is missing, and a statement short one duty is
    // the worst thing this endpoint could return — it would look entirely
    // normal to whoever received it.
    logger('❌ statement failed:', err?.message, err?.stack);
    return json({ error: err?.message ?? 'Failed to generate the statement' }, { status: 500 });
  }
}
