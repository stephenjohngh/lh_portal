// src/routes/api/reports/generate-register-extract/+server.js
// The periodic activity register, as filtered, as a Word document.
//
// ⚠ Named "extract" throughout — route, filename and first page — because the
// thing it must never be mistaken for is the obligations statement, which is a
// hand-maintained document that has been through fourteen review rounds.
//
// Thin on purpose. The document is built by `$lib/server/registerDocx.js`: a
// `+server.js` may only export HTTP verbs, so a builder living here could never
// be unit-tested — and document generation is exactly the kind of code that
// fails at runtime on something static analysis cannot see.
//
// The rows arrive PRE-FILTERED AND PRE-SORTED from the screen that asked for
// them, and nothing here re-derives any of it, so the document can never
// disagree with the list the user was looking at.

import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
import { getLogger } from '$lib/utils/logger';
import { buildRegisterExtract, Packer } from '$lib/server/registerDocx.js';

const logger = getLogger('reports:generate-register-extract');

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    const doc = buildRegisterExtract(payload);
    const buf = await Packer.toBuffer(doc);

    logger('✅ register extract:', (payload.rows ?? []).length, 'of', payload.total, 'rows');

    const dateSlug = new Date().toISOString().slice(0, 10);
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="Register_Extract_${dateSlug}.docx"`,
      },
    });
  } catch (/** @type {any} */ err) {
    logger('❌ register extract failed:', err?.message, err?.stack);
    return json({ error: err?.message ?? 'Failed to generate the document' }, { status: 500 });
  }
}
