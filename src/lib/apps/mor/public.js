// src/lib/apps/mor/public.js
//
// MOR app's cross-app interface (stateless). Other apps read MOR-owned cases
// through these accessors rather than querying mor_cases directly — e.g. the
// Golden Thread citation picker lists cases here to link a register document to
// the occurrence report it evidences. See docs/design/Inter_App_Interfaces.md.

import { api } from '$lib/utils/api';
import { bsrReportClock, OPEN_STATUSES } from './utils/morHelpers.js';

// Lightweight case shape for pickers / cross-app references — never the full row.
const CASE_REF_SELECT = 'id, reference, status, mechanism, description, location_text, identification_date';

/**
 * MOR cases as lightweight references, newest first. For cross-app pickers.
 * @returns {Promise<Array<{id:string,reference:string,status:string,mechanism:string,description:string,location_text:string,identification_date:string}>>}
 */
export function listCases() {
  return api.get('mor_cases', {
    select: CASE_REF_SELECT,
    orderBy: 'identification_date',
    ascending: false,
  });
}

/** A single case as a lightweight reference, or null. */
export function getCase(id) {
  return api.getById('mor_cases', id, CASE_REF_SELECT);
}

/**
 * Human-readable one-line label for a case reference — `MOR-xxxx — <detail>`,
 * the detail being the first non-empty of description / location / mechanism,
 * truncated. Shared so cross-app displays don't drift.
 * @param {{reference?:string, description?:string, location_text?:string, mechanism?:string}|null} c
 */
export function morCaseLabel(c) {
  if (!c) return 'Unknown case';
  const detail = (c.description || c.location_text || c.mechanism || '').trim();
  const short = detail.length > 60 ? detail.slice(0, 57) + '…' : detail;
  return short ? `${c.reference} — ${short}` : c.reference;
}


/**
 * The statutory 10-day BSR full-report deadline, for every case it can still
 * apply to — for the Planner.
 *
 * The deadline is `bsrReportClock` — the SAME function the MOR case screen uses,
 * anchored on identification_date — so the two cannot disagree about the date.
 *
 * Which cases:
 *   · open (not closed or reclassified),
 *   · full report not yet submitted,
 *   · and NOT decided as internal remediation or no action. ⚠ A case still in
 *     triage IS included: the clock runs from identification whether or not
 *     anybody has decided yet, and a deadline shown that turns out not to apply
 *     is the safe direction to be wrong in.
 *
 * @returns {Promise<Array<{ id: string, reference: string, deadline: string,
 *   status: string, decided: boolean, label: string }>>}  deadline YYYY-MM-DD
 */
export async function listBsrReportDeadlines() {
  const rows = await api.get('mor_cases', {
    select: 'id, reference, status, identification_date, decision_outcome, '
          + 'bsr_report_submitted_at, description, location_text, mechanism',
  });
  const open = new Set(OPEN_STATUSES);
  return (rows ?? [])
    .filter((c) => open.has(c.status) && !c.bsr_report_submitted_at && c.identification_date
      && c.decision_outcome !== 'internal' && c.decision_outcome !== 'no_action')
    .map((c) => {
      const clock = bsrReportClock(c.identification_date);
      // UTC date of the deadline, like the portal's own `today()`. Near
      // midnight in BST that can read a day EARLY — the safe direction for a
      // statutory deadline, and never late.
      return {
        id: c.id,
        reference: c.reference,
        deadline: clock.deadline.toISOString().slice(0, 10),
        status: c.status,
        decided: c.decision_outcome === 'bsr',
        label: morCaseLabel(c),
      };
    });
}
