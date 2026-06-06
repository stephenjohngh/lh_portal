// src/routes/api/mor/[caseId]/draft-letter/+server.js
// Phase 2c — Reporter-contact draft letter generator.
//
// POST /api/mor/<caseId>/draft-letter
//
// Body (JSON):
//   { template: 'reporter_bsr' | 'reporter_closure' | 'reporter_holding' | 'residents_closure' }
//
// Returns: streamed .docx with Content-Disposition: attachment.
//
// Auth: requireAuth + MOR app access (no admin requirement — any editor on
// the MOR app can draft a letter). The endpoint never *sends* anything; it
// produces a draft document for the staff member to edit and send manually.

import { Packer } from 'docx';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL }       from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { requireAuth }   from '$lib/server/requireAuth';
import { getLogger }     from '$lib/utils/logger';
import {
  LETTER_BUILDERS,
  LETTER_FILENAME_SUFFIX,
} from '$lib/server/morLetterTemplates.js';

const logger = getLogger('mor/draft-letter');

let _svc = null;
function getSvc() {
  _svc ??= createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return _svc;
}

function jsonErr(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST({ params, request }) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  // ── Parse body ──────────────────────────────────────────────────────────
  let body;
  try { body = await request.json(); }
  catch { return jsonErr('Invalid request body', 400); }

  const template = body?.template;
  const builder  = LETTER_BUILDERS[template];
  if (!builder) {
    return jsonErr('Unknown letter template.', 400);
  }

  // ── Fetch the case row ──────────────────────────────────────────────────
  // Service-role read so a misconfigured app_permissions row doesn't block
  // letter generation (the user is already authenticated and the endpoint
  // never reveals the case data over the wire — it's encoded in a .docx
  // streamed back to them).
  const svc = getSvc();
  const { data: caseRow, error: cErr } = await svc
    .from('mor_cases')
    .select(`
      id, reference, status,
      description, location_text,
      identification_date, received_date, closed_at,
      reporter_name, reporter_contact, is_anonymous,
      bsr_notice_ref, bsr_notice_submitted_at,
      bsr_report_ref, bsr_report_submitted_at,
      triage_outcome, decision_outcome,
      lessons_learned
    `)
    .eq('id', params.caseId)
    .maybeSingle();

  if (cErr) {
    logger('❌ case fetch error:', cErr.message);
    return jsonErr('Could not load case.', 500);
  }
  if (!caseRow) return jsonErr('Case not found.', 404);

  // ── Guard rails per template ────────────────────────────────────────────
  // Reporter-facing templates only make sense when there's someone to write to.
  if (template.startsWith('reporter_') && caseRow.is_anonymous) {
    return jsonErr('Reporter is anonymous — no letter to generate.', 422);
  }

  // ── Build and stream the .docx ──────────────────────────────────────────
  let doc;
  try {
    doc = builder(caseRow);
  } catch (err) {
    logger('❌ template builder failed:', err.message);
    return jsonErr('Could not build the letter.', 500);
  }

  const buffer = await Packer.toBuffer(doc);

  const suffix   = LETTER_FILENAME_SUFFIX[template] ?? template;
  const filename = `${caseRow.reference}-${suffix}.docx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}
