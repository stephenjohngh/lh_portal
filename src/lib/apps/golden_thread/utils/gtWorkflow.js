// src/lib/apps/golden_thread/utils/gtWorkflow.js
//
// Golden Thread's two workflows as they ship (migration 264, 2026-10-19) —
// SEEDS, saved by the app the first time an administrator opens Golden Thread,
// and from then on edited in Admin → Workflows like any other.
//
// ⛔ THE HASH CHAIN IS UNTOUCHED (user: "i wouldnt like it even if some
// compromise with hash chain security"). A move changes the document or risk
// with one ordinary UPDATE of its row, so gt_write_audit() chains exactly the
// rows it always did, against the person who made the move. The workflow's
// own history is a second, ordinary record; the chain stays the evidence.
//
// ⛔ What holds them to the register (workflowContracts.js KEY_CONTRACTS +
// workflow_key_problem()):
//   · their STEP KEYS ARE THE STATUSES, each with a fixed kind;
//   · every move must be one the state machine allows (gtLifecycle.js /
//     gtRiskLifecycle.js, mirrored from gt_is_valid_transition and
//     gt_risk_is_valid_transition), and the row's own trigger still refuses
//     any other;
//   · NO MOVE MAY BE MADE BY A TIMER — the audit chain names who did it;
//   · Current → Superseded is KEPT and never pressed: accepting the successor
//     makes it, through workflow_move(), in the same transaction — so it has
//     no conditions of its own and is the only move into Superseded;
//   · both ship MARKED as needing a full review before any change (s.88).

export const GT_DOCUMENT_WORKFLOW_KEY = 'gt_document';
export const GT_RISK_WORKFLOW_KEY = 'gt_risk';

const REVIEW_REASON = 'Statutory record — Building Safety Act 2022 s.88 (the golden thread); every change is in the hash-chained audit';

export const DEFAULT_GT_DOCUMENT_WORKFLOW = Object.freeze({
  key: GT_DOCUMENT_WORKFLOW_KEY,
  name: 'Document review',
  appId: 'golden_thread',
  description: 'A golden thread document from draft to the register: submitted for review, then accepted as current (superseding the version it replaces) or returned to its author.',
  reviewRequired: true,
  reviewReason: REVIEW_REASON,
  steps: [
    { key: 'draft',              name: 'Draft',              public_name: null, kind: 'start' },
    { key: 'under_review',       name: 'Under review',       public_name: null, kind: 'open' },
    { key: 'current',            name: 'Current',            public_name: null, kind: 'done' },
    { key: 'superseded',         name: 'Superseded',         public_name: null, kind: 'done' },
    { key: 'returned_to_author', name: 'Returned to author', public_name: null, kind: 'declined' },
    { key: 'withdrawn',          name: 'Withdrawn',          public_name: null, kind: 'declined' },
  ],
  moves: [
    { from_key: 'draft',        to_key: 'under_review',       label: 'Submit for review' },
    { from_key: 'draft',        to_key: 'withdrawn',          label: 'Withdraw the draft', note_required: true, admin_only: true },
    { from_key: 'under_review', to_key: 'current',            label: 'Accept — make current' },
    { from_key: 'under_review', to_key: 'returned_to_author', label: 'Return to author', note_required: true },
    { from_key: 'current',      to_key: 'withdrawn',          label: 'Withdraw', note_required: true, admin_only: true },
    // Made only by accepting the successor — the screen says so instead of offering it.
    { from_key: 'current',      to_key: 'superseded',         label: 'Superseded by its successor' },
    { from_key: 'superseded',   to_key: 'current',            label: 'Reactivate' },
  ],
});

export const DEFAULT_GT_RISK_WORKFLOW = Object.freeze({
  key: GT_RISK_WORKFLOW_KEY,
  name: 'Risk',
  appId: 'golden_thread',
  description: 'A building safety risk from identification through assessment, control and monitoring to closure (ISO 19650-6).',
  reviewRequired: true,
  reviewReason: REVIEW_REASON,
  steps: [
    { key: 'identified', name: 'Identified', public_name: null, kind: 'start' },
    { key: 'assessed',   name: 'Assessed',   public_name: null, kind: 'open' },
    { key: 'controlled', name: 'Controlled', public_name: null, kind: 'open' },
    { key: 'monitored',  name: 'Monitored',  public_name: null, kind: 'open' },
    { key: 'closed',     name: 'Closed',     public_name: null, kind: 'done' },
    { key: 'superseded', name: 'Superseded', public_name: null, kind: 'declined' },
  ],
  // Every move the risk machine allows, as the risk screen offered them.
  moves: [
    { from_key: 'identified', to_key: 'assessed',   label: 'Mark assessed' },
    { from_key: 'identified', to_key: 'closed',     label: 'Close', note_required: true },
    { from_key: 'assessed',   to_key: 'controlled', label: 'Mark controlled' },
    { from_key: 'assessed',   to_key: 'monitored',  label: 'Monitor' },
    { from_key: 'assessed',   to_key: 'identified', label: 'Back to identified' },
    { from_key: 'assessed',   to_key: 'closed',     label: 'Close', note_required: true },
    { from_key: 'assessed',   to_key: 'superseded', label: 'Supersede', note_required: true },
    { from_key: 'controlled', to_key: 'monitored',  label: 'Monitor' },
    { from_key: 'controlled', to_key: 'assessed',   label: 'Re-assess' },
    { from_key: 'controlled', to_key: 'closed',     label: 'Close', note_required: true },
    { from_key: 'controlled', to_key: 'superseded', label: 'Supersede', note_required: true },
    { from_key: 'monitored',  to_key: 'assessed',   label: 'Re-assess' },
    { from_key: 'monitored',  to_key: 'controlled', label: 'Back to controlled' },
    { from_key: 'monitored',  to_key: 'closed',     label: 'Close', note_required: true },
    { from_key: 'monitored',  to_key: 'superseded', label: 'Supersede', note_required: true },
    { from_key: 'closed',     to_key: 'monitored',  label: 'Reopen', note_required: true },
  ],
});
