// src/lib/apps/complaints/utils/complaintWorkflow.js
//
// The Complaints workflow as it ships (migration 252, 2026-10-18) — a SEED,
// saved by the app the first time an administrator opens Complaints, and from
// then on edited in Admin → Workflows like any other.
//
// ⛔ Three things hold it to s.93's machine:
//   · its STEP KEYS ARE THE COMPLAINT STATUSES — complaint_after_move() sets
//     the case's status to the step's key and refuses any other key;
//   · the case's own trigger (migration 187) still refuses a transition the
//     machine in complaintLifecycle.js does not allow, so a move added in Admin
//     that s.93 does not allow fails when made;
//   · it ships MARKED as needing a full review before any change (migration
//     249), with the reason saying why.
// A test holds these moves to complaintLifecycle.js's transitions, so the two
// cannot disagree out of the box.
//
// The two clocks of the design (§4): ACKNOWLEDGE within 5 working days of
// receipt, RESPOND within 20 — step deadlines counted from the start, so they
// reach the Planner and the overdue display like any other deadline.

export const COMPLAINT_WORKFLOW_KEY = 'complaint';

const W5 = { deadline_days: 5, deadline_basis: 'working', deadline_from: 'started' };
const W20 = { deadline_days: 20, deadline_basis: 'working', deadline_from: 'started' };

export const DEFAULT_COMPLAINT_WORKFLOW = Object.freeze({
  key: COMPLAINT_WORKFLOW_KEY,
  name: 'Building safety complaint',
  appId: 'complaints',
  description: 'A relevant complaint under the Building Safety Act 2022 s.93: acknowledged, investigated, responded to, and closed or escalated to the Building Safety Regulator.',
  reviewRequired: true,
  reviewReason: 'Statutory process — Building Safety Act 2022 s.93 (relevant complaints)',
  steps: [
    { key: 'received',         name: 'Received',         public_name: null, kind: 'start', ...W5 },
    { key: 'acknowledged',     name: 'Acknowledged',     public_name: null, kind: 'open', ...W20 },
    { key: 'investigating',    name: 'Investigating',    public_name: null, kind: 'open', ...W20 },
    // ⛔ Not the end: the complainant's route onwards (the BSR) must stay
    // visible, so a responded complaint stays open, with no deadline.
    { key: 'responded',        name: 'Responded',        public_name: null, kind: 'open' },
    { key: 'closed',           name: 'Closed',           public_name: null, kind: 'done' },
    { key: 'escalated_to_bsr', name: 'Escalated to BSR', public_name: null, kind: 'done' },
    { key: 'withdrawn',        name: 'Withdrawn',        public_name: null, kind: 'declined' },
  ],
  moves: [
    { from_key: 'received',      to_key: 'acknowledged',     label: 'Acknowledge' },
    { from_key: 'received',      to_key: 'withdrawn',        label: 'Withdrawn', note_required: true },
    { from_key: 'acknowledged',  to_key: 'investigating',    label: 'Start investigating' },
    { from_key: 'acknowledged',  to_key: 'withdrawn',        label: 'Withdrawn', note_required: true },
    { from_key: 'investigating', to_key: 'responded',        label: 'Respond' },
    { from_key: 'investigating', to_key: 'withdrawn',        label: 'Withdrawn', note_required: true },
    { from_key: 'responded',     to_key: 'closed',           label: 'Close', admin_only: true },
    { from_key: 'responded',     to_key: 'escalated_to_bsr', label: 'Escalated to BSR', admin_only: true },
    { from_key: 'responded',     to_key: 'withdrawn',        label: 'Withdrawn', note_required: true },
    // Reopening (migration 252 allows a move out of a finished step).
    { from_key: 'closed',        to_key: 'investigating',    label: 'Reopen', note_required: true },
    { from_key: 'closed',        to_key: 'escalated_to_bsr', label: 'Escalated to BSR', admin_only: true },
  ],
});
