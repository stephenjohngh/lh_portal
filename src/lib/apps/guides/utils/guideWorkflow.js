// src/lib/apps/guides/utils/guideWorkflow.js
//
// The workflow of a GUIDE (migration 272) — a SEED, saved by the app the first time an
// administrator opens Guides → Manage, then edited in Admin → Workflows like any other.
//
// Its STEP KEYS ARE THE GUIDE STATUSES (guides.status): guide_after_move() writes the step
// reached back as the status, and Publish freezes the next version (the same frozen copy
// readers and walks see). The four keys and their kinds are fixed (workflowContracts.js and
// workflow_app_problem()); the names, moves, notes and conditions are the administrator's.
//
// ⭐ In review is OPTIONAL: Draft → Published is a move too, for a deployment with one
// administrator. Add four-eyes to Publish (Admin → Workflows) where a second person must
// approve. Every move is administrator-only, as every write to a guide is.
//
// The deadline is the guide's REVIEW DUE date, once it is published. Publishing a CHANGE to
// an already-published guide is not a move ("Publish changes" in the editor makes the next
// version).

export const GUIDE_WORKFLOW_KEY = 'guide';

/** The guide statuses, in order — the database's CHECK (parity-tested). */
export const GUIDE_STATUSES_IN_WORKFLOW = Object.freeze(['draft', 'in_review', 'published', 'retired']);

export const DEFAULT_GUIDE_WORKFLOW = Object.freeze({
  key: GUIDE_WORKFLOW_KEY,
  name: 'Guide',
  appId: 'guides',
  description: 'A how-to guide from draft to published, with an optional review step, and retired when it is out of date. Publishing freezes the version readers and inspection walks see.',
  reviewRequired: false,
  reviewReason: null,
  steps: [
    { key: 'draft',     name: 'Draft',     public_name: null, kind: 'start' },
    { key: 'in_review', name: 'In review', public_name: null, kind: 'open' },
    { key: 'published', name: 'Published', public_name: null, kind: 'open' },
    { key: 'retired',   name: 'Retired',   public_name: null, kind: 'done' },
  ],
  moves: [
    { from_key: 'draft',     to_key: 'in_review', label: 'Submit for review', admin_only: true },
    { from_key: 'draft',     to_key: 'published', label: 'Publish', admin_only: true },
    { from_key: 'in_review', to_key: 'draft',     label: 'Return to draft', note_required: true, admin_only: true },
    { from_key: 'in_review', to_key: 'published', label: 'Publish', admin_only: true },
    { from_key: 'published', to_key: 'retired',   label: 'Retire', note_required: true, admin_only: true },
    { from_key: 'retired',   to_key: 'draft',     label: 'Reopen as a draft', note_required: true, admin_only: true },
  ],
});
