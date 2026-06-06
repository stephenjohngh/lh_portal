// src/routes/api/mor/status/[reference]/+server.js
// POST /api/mor/status/<reference>
//
// Phase 2b — resident status lookup. The reference comes in the URL path;
// the verification code comes in the JSON body so it never lands in
// browser history, server access logs, or Referer headers.
//
// Body (JSON):
//   code   string  6-char verification code (with or without dashes/spaces)
//
// Returns a sanitised public view of the case status — never any internal
// rationale, BSR refs, reporter contact, lessons learned, mitigations, or
// timeline. Uses the service role to bypass RLS; the endpoint shapes the
// response itself.

import { json }                       from '@sveltejs/kit';
import { createClient }               from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL }        from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY }  from '$env/static/private';
import { checkRateLimit }             from '$lib/server/publicRateLimit.js';
import { isSameOrigin }               from '$lib/server/verifyOrigin.js';
import { normalizeVerificationCode }  from '$lib/utils/morVerificationCode';
import { getLogger }                  from '$lib/utils/logger';

const logger = getLogger('mor/status');

// Map the 14 internal statuses to 5 resident-facing phases. The phase + step
// number drive the progress bar on /mor/status.
const PHASE_MAP = {
  submitted:         { phase: 'received',       step: 1 },
  acknowledged:      { phase: 'received',       step: 1 },
  in_triage:         { phase: 'reviewing',      step: 2 },
  in_assessment:     { phase: 'reviewing',      step: 2 },
  decision_pending:  { phase: 'reviewing',      step: 2 },
  bsr_notice:        { phase: 'reported',       step: 3 },
  bsr_report:        { phase: 'reported',       step: 3 },
  awaiting_bsr:      { phase: 'reported',       step: 3 },
  in_remediation:    { phase: 'fixing',         step: 4 },
  awaiting_reporter: { phase: 'fixing',         step: 4 },
  remediated:        { phase: 'fixing',         step: 4 },
  closed:            { phase: 'closed',         step: 5 },
  reclassified:      { phase: 'not_proceeding', step: 5 },
  reopened:          { phase: 'reviewing',      step: 2 },
};

const PHASE_LABEL = {
  received:       "We've received your report",
  reviewing:      'Our safety team is reviewing it',
  reported:       'Reported to the Building Safety Regulator',
  fixing:         "We're putting fixes in place",
  closed:         'This case is closed',
  not_proceeding: 'Not proceeding as a mandatory occurrence report',
};

const PHASE_DESCRIPTION = {
  received:       'A building safety officer will assess your report. We aim to acknowledge new reports within one working day.',
  reviewing:      "Our safety team is reviewing the concern against the building safety threshold. We'll let you know what we decide.",
  reported:       "Because of the level of potential risk, we've notified the Building Safety Regulator. The investigation continues.",
  fixing:         "We're carrying out the repairs or works needed. We'll close the case once the work is verified complete.",
  closed:         'This case is now closed. Thank you for raising it.',
  not_proceeding: "This concern doesn't meet the threshold for mandatory occurrence reporting. The building team will look into it through our normal repairs and complaints process.",
};

// A single error message regardless of whether the reference or the code
// was wrong. Same wording, same shape, same status — prevents enumeration.
const NOT_FOUND_MESSAGE =
  'We could not find a report matching that reference and verification code. Please check both and try again.';
const NOT_FOUND_RESPONSE = json({ error: NOT_FOUND_MESSAGE }, { status: 404 });

const REFERENCE_RE = /^MOR-\d{4}-\d{6}$/;

let _svc = null;
function getSvc() {
  _svc ??= createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return _svc;
}

export async function POST({ params, request, url }) {

  // ── CSRF defence ─────────────────────────────────────────────────────────
  if (!isSameOrigin(request, url)) {
    return json({ error: 'Cross-origin requests are not permitted.' }, { status: 403 });
  }

  // ── Rate limiting ────────────────────────────────────────────────────────
  const allowed = await checkRateLimit(request, 'status_lookup');
  if (!allowed) {
    return json(
      { error: 'Too many lookups. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid request body' }, { status: 400 }); }

  const reference = (params.reference || '').trim().toUpperCase();
  const code      = normalizeVerificationCode(body?.code);

  // Basic shape check. Returning 404 (not 400) for malformed input prevents
  // an attacker from telling "shape wrong" apart from "no such case".
  if (!REFERENCE_RE.test(reference) || code.length === 0) {
    return NOT_FOUND_RESPONSE;
  }

  // ── Look up ──────────────────────────────────────────────────────────────
  const svc = getSvc();

  const { data, error } = await svc
    .from('mor_cases')
    .select(`
      reference,
      status,
      urgency,
      identification_date,
      received_date,
      acknowledged_at,
      triaged_at,
      decision_at,
      closed_at,
      updated_at
    `)
    .eq('reference', reference)
    .eq('verification_code', code)
    .maybeSingle();

  if (error) {
    logger('❌ status lookup error:', error.message);
    return json({ error: 'Lookup is temporarily unavailable. Please try again.' }, { status: 500 });
  }

  if (!data) {
    // Constant-time comparison isn't really applicable here because the
    // database does the match. But we don't reveal which half mismatched.
    return NOT_FOUND_RESPONSE;
  }

  const phaseInfo = PHASE_MAP[data.status] ?? { phase: 'reviewing', step: 2 };

  return json({
    reference:           data.reference,
    urgency:             !!data.urgency,
    submitted_at:        data.received_date,
    last_updated_at:     data.updated_at,
    phase:               phaseInfo.phase,
    step:                phaseInfo.step,
    phase_label:         PHASE_LABEL[phaseInfo.phase],
    phase_description:   PHASE_DESCRIPTION[phaseInfo.phase],
    milestones: {
      received:     data.received_date,
      acknowledged: data.acknowledged_at,
      reviewed:     data.triaged_at,
      decided:      data.decision_at,
      closed:       data.closed_at,
    },
  });
}
