// src/lib/apps/mor/utils/morWorkflow.js
//
// The MOR workflow as it ships (migration 263, 2026-10-19) — a SEED, saved by
// the app the first time an administrator opens MOR, and from then on edited
// in Admin → Workflows like any other.
//
// ⛔ Four things hold it to the MOR machine (BSA 2022 s.87):
//   · its STEP KEYS ARE THE CASE STATUSES, each with a fixed kind
//     (workflowContracts.js + workflow_app_problem());
//   · every move must be one mor_is_valid_transition() allows, and the case's
//     own trigger (migration 137) still refuses any other;
//   · no move may be made by a timer — a person decides every MOR step;
//   · it ships MARKED as needing a full review before any change.
// The rules a form carries are the database's, in mor_case_after_move(): a
// triage move needs its triage recorded (mor_triage), an approval needs a
// proposed decision of that outcome and an approver who is not the proposer,
// and the BSR report move needs the report's reference (mor_record_bsr_report).
//
// MOR's statutory clocks (the 10-day BSR report, counted from identification)
// stay MOR's own (morHelpers.js bsrReportClock) — no step deadlines ship.
// Moves are the ones the case screen offered before the conversion; the rest
// of the machine (triage straight to closed, back to triage while awaiting the
// reporter, …) can be added in Admin → Workflows.

export const MOR_WORKFLOW_KEY = 'mor_case';

export const DEFAULT_MOR_WORKFLOW = Object.freeze({
  key: MOR_WORKFLOW_KEY,
  name: 'Mandatory occurrence report',
  appId: 'mor',
  description: 'An occurrence reported under the Building Safety Act 2022 s.87: acknowledged, triaged, decided by two people, reported to the Building Safety Regulator where it must be, remediated and closed.',
  reviewRequired: true,
  reviewReason: 'Statutory process — Building Safety Act 2022 s.87 (mandatory occurrence reporting)',
  steps: [
    { key: 'submitted',         name: 'Submitted',          public_name: null, kind: 'start' },
    { key: 'acknowledged',      name: 'Acknowledged',       public_name: null, kind: 'open' },
    { key: 'in_triage',         name: 'In triage',          public_name: null, kind: 'open' },
    { key: 'in_assessment',     name: 'In assessment',      public_name: null, kind: 'open' },
    { key: 'decision_pending',  name: 'Decision pending',   public_name: null, kind: 'open' },
    { key: 'bsr_notice',        name: 'BSR notice',         public_name: null, kind: 'open' },
    { key: 'bsr_report',        name: 'BSR report',         public_name: null, kind: 'open' },
    { key: 'in_remediation',    name: 'In remediation',     public_name: null, kind: 'open' },
    { key: 'awaiting_reporter', name: 'Awaiting reporter',  public_name: null, kind: 'open' },
    { key: 'awaiting_bsr',      name: 'Awaiting BSR',       public_name: null, kind: 'open' },
    { key: 'remediated',        name: 'Remediated',         public_name: null, kind: 'open' },
    { key: 'closed',            name: 'Closed',             public_name: null, kind: 'done' },
    { key: 'reclassified',      name: 'Reclassified',       public_name: null, kind: 'declined' },
    { key: 'reopened',          name: 'Reopened',           public_name: null, kind: 'open' },
  ],
  moves: [
    { from_key: 'submitted',         to_key: 'acknowledged',     label: 'Mark acknowledged' },
    { from_key: 'acknowledged',      to_key: 'in_triage',        label: 'Begin triage' },
    // Triage: the form records the outcome and its reasons, and makes the move.
    { from_key: 'in_triage',         to_key: 'decision_pending', label: 'Clearly reportable' },
    { from_key: 'in_triage',         to_key: 'in_assessment',    label: 'Possibly reportable — get an assessment' },
    { from_key: 'in_triage',         to_key: 'reclassified',     label: 'Not reportable — reclassify' },
    { from_key: 'in_assessment',     to_key: 'decision_pending', label: 'Record the assessment' },
    // The two-step decision: proposed on the case, approved here by someone else.
    { from_key: 'decision_pending',  to_key: 'bsr_notice',       label: 'Approve — report to the BSR', admin_only: true },
    { from_key: 'decision_pending',  to_key: 'in_remediation',   label: 'Approve — internal remediation', admin_only: true },
    { from_key: 'decision_pending',  to_key: 'closed',           label: 'Approve — no further action', admin_only: true },
    { from_key: 'decision_pending',  to_key: 'in_triage',        label: 'Reject the decision', admin_only: true, note_required: true },
    { from_key: 'bsr_notice',        to_key: 'bsr_report',       label: 'Record the BSR report' },
    { from_key: 'bsr_report',        to_key: 'in_remediation',   label: 'Start remediation' },
    { from_key: 'bsr_report',        to_key: 'awaiting_bsr',     label: 'Pause — awaiting the BSR' },
    { from_key: 'in_remediation',    to_key: 'remediated',       label: 'Mark remediation complete' },
    { from_key: 'in_remediation',    to_key: 'awaiting_reporter', label: 'Pause — awaiting the reporter' },
    { from_key: 'awaiting_reporter', to_key: 'in_remediation',   label: 'Resume' },
    { from_key: 'awaiting_bsr',      to_key: 'bsr_report',       label: 'Resume' },
    { from_key: 'remediated',        to_key: 'closed',           label: 'Close the case' },
    { from_key: 'closed',            to_key: 'reopened',         label: 'Reopen', admin_only: true, note_required: true },
    { from_key: 'reopened',          to_key: 'in_triage',        label: 'Begin triage' },
  ],
});

/** The moves whose data a form records first (the case screen hands them off). */
export const TRIAGE_OUTCOME_FOR = Object.freeze({
  decision_pending: 'clearly_reportable',
  in_assessment: 'possibly_reportable',
  reclassified: 'not_reportable',
});

/** Where an approved decision takes the case. */
export const APPROVAL_TARGET = Object.freeze({ bsr: 'bsr_notice', internal: 'in_remediation', no_action: 'closed' });
