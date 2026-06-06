// src/lib/apps/mor/utils/morHelpers.js
// Status labels, colours, SLA clock calculations for the MOR app.

// ── Status ────────────────────────────────────────────────────────────────────

export const STATUS_LABEL = {
  submitted:        'Submitted',
  acknowledged:     'Acknowledged',
  in_triage:        'In Triage',
  in_assessment:    'In Assessment',
  decision_pending: 'Decision Pending',
  bsr_notice:       'BSR Notice',
  bsr_report:       'BSR Report',
  in_remediation:   'In Remediation',
  awaiting_reporter:'Awaiting Reporter',
  awaiting_bsr:     'Awaiting BSR',
  remediated:       'Remediated',
  closed:           'Closed',
  reclassified:     'Reclassified',
  reopened:         'Reopened',
};

// Tailwind classes for Badge component
export const STATUS_COLOUR = {
  submitted:        'bg-blue-700',
  acknowledged:     'bg-blue-600',
  in_triage:        'bg-amber-600',
  in_assessment:    'bg-purple-600',
  decision_pending: 'bg-amber-500',
  bsr_notice:       'bg-orange-600',
  bsr_report:       'bg-orange-500',
  in_remediation:   'bg-yellow-600',
  awaiting_reporter:'bg-slate-500',
  awaiting_bsr:     'bg-slate-500',
  remediated:       'bg-teal-600',
  closed:           'bg-emerald-700',
  reclassified:     'bg-slate-600',
  reopened:         'bg-red-600',
};

// Whether a status is on the BSR track (10-day clock visible)
export const BSR_TRACK_STATUSES = new Set([
  'bsr_notice', 'bsr_report', 'in_remediation', 'awaiting_bsr', 'remediated',
]);

// All non-terminal statuses (i.e. the case is still being worked)
export const OPEN_STATUSES = [
  'submitted', 'acknowledged', 'in_triage', 'in_assessment',
  'decision_pending', 'bsr_notice', 'bsr_report',
  'in_remediation', 'awaiting_reporter', 'awaiting_bsr',
  'remediated', 'reopened',
];

// Workflow display order for status breakdown
export const STATUS_ORDER = [
  'submitted', 'acknowledged', 'in_triage', 'in_assessment',
  'decision_pending', 'bsr_notice', 'bsr_report',
  'awaiting_bsr', 'in_remediation', 'awaiting_reporter',
  'remediated', 'reopened', 'closed', 'reclassified',
];

// ── Mechanism ─────────────────────────────────────────────────────────────────

export const MECHANISM_LABEL = {
  structural: 'Structural',
  fire_smoke: 'Fire / Smoke',
  both:       'Structural + Fire',
  unknown:    'Unknown',
};

export const MECHANISM_COLOUR = {
  structural: 'bg-orange-700',
  fire_smoke: 'bg-red-700',
  both:       'bg-red-800',
  unknown:    'bg-slate-600',
};

// ── Channel / Reporter type ───────────────────────────────────────────────────

export const CHANNEL_LABEL = {
  staff_logged: 'Logged by staff',
  email:        'Email',
  phone:        'Phone',
  in_person:    'In person',
  paper:        'Paper form',
  online:       'Online form',
};

export const REPORTER_TYPE_LABEL = {
  resident:    'Resident',
  contractor:  'Contractor',
  staff:       'Staff',
  ap:          'Accountable Person',
  visitor:     'Visitor',
  anonymous:   'Anonymous',
  unknown:     'Unknown',
};

// ── Decision / triage ─────────────────────────────────────────────────────────

export const DECISION_LABEL = {
  bsr:       'Report to BSR',
  internal:  'Internal remediation',
  no_action: 'No further action',
};

export const TRIAGE_LABEL = {
  clearly_reportable:   'Clearly reportable',
  possibly_reportable:  'Possibly reportable',
  not_reportable:       'Not reportable as MOR',
};

export const TRIAGE_COLOUR = {
  clearly_reportable:   'bg-red-600',
  possibly_reportable:  'bg-amber-600',
  not_reportable:       'bg-emerald-700',
};

// ── Clock UI helpers (shared by SlaClocks, MorDashboard, CaseCard) ────────────

/** Tailwind border/background class for a clock card based on its status. */
export function clockBgClass(status) {
  if (status === 'breach')   return 'bg-red-900/60 border-red-700';
  if (status === 'critical') return 'bg-red-900/40 border-red-600';
  if (status === 'warning')  return 'bg-amber-900/40 border-amber-600';
  return 'bg-slate-700/40 border-slate-600';
}

/** Tailwind text-colour class for clock numbers based on status. */
export function clockTextClass(status) {
  if (status === 'breach')   return 'text-red-300 font-bold';
  if (status === 'critical') return 'text-red-300 font-semibold';
  if (status === 'warning')  return 'text-amber-300';
  return 'text-slate-300';
}

// ── SLA clock helpers ─────────────────────────────────────────────────────────

/**
 * The statutory 10-day BSR report clock.
 * Anchors on identification_date (NOT received_date or created_at).
 * Returns null when no identification date is set.
 */
export function bsrReportClock(identificationDate) {
  if (!identificationDate) return null;
  const identified = new Date(identificationDate);
  const deadline   = new Date(identified);
  deadline.setDate(deadline.getDate() + 10);

  const now         = new Date();
  const msRemaining = deadline - now;
  const daysLeft    = msRemaining / (1000 * 60 * 60 * 24);
  const hoursLeft   = Math.floor(msRemaining / (1000 * 60 * 60));

  let status, label;
  if (daysLeft < 0) {
    status = 'breach';
    label  = 'BREACHED';
  } else if (daysLeft <= 1) {
    status = 'critical';
    label  = `${hoursLeft}h remaining`;
  } else if (daysLeft <= 3) {
    status = 'warning';
    label  = `${Math.ceil(daysLeft)}d remaining`;
  } else {
    status = 'ok';
    label  = `${Math.ceil(daysLeft)}d remaining`;
  }

  // msRemaining is exposed for stable sorting (Math.ceil(daysLeft) collapses
  // anything between two day boundaries into the same bucket).
  return {
    deadline,
    msRemaining,
    daysLeft: Math.ceil(daysLeft),
    hoursLeft,
    status,
    label,
  };
}

/**
 * Generic SLA clock given start time and target hours.
 */
export function genericClock(startDate, targetHours, label = '') {
  if (!startDate) return null;
  const start    = new Date(startDate);
  const deadline = new Date(start.getTime() + targetHours * 60 * 60 * 1000);
  const now      = new Date();
  const msLeft   = deadline - now;
  const hoursLeft = msLeft / (1000 * 60 * 60);

  let status;
  if (hoursLeft < 0)   status = 'breach';
  else if (hoursLeft <= targetHours * 0.1) status = 'critical';
  else if (hoursLeft <= targetHours * 0.25) status = 'warning';
  else status = 'ok';

  return {
    deadline,
    hoursLeft: Math.ceil(hoursLeft),
    status,
    label: hoursLeft < 0
      ? `${label} BREACHED`
      : `${label} ${Math.ceil(hoursLeft)}h left`,
  };
}

// SLA clock definitions (startDate field, targetHours, display label)
export function allSlaClocks(c) {
  return [
    {
      id: 'acknowledgement',
      label: 'Acknowledge',
      clock: c.acknowledged_at ? null : genericClock(c.received_date, 24, 'Ack'),
      done: !!c.acknowledged_at,
      doneAt: c.acknowledged_at,
    },
    {
      id: 'triage',
      label: 'Triage',
      clock: c.triaged_at ? null : genericClock(c.received_date, 24, 'Triage'),
      done: !!c.triaged_at,
      doneAt: c.triaged_at,
    },
    {
      id: 'decision',
      label: 'Decision',
      clock: c.decision_at ? null : genericClock(c.received_date, 5 * 24, 'Decision'),
      done: !!c.decision_at,
      doneAt: c.decision_at,
    },
    {
      id: 'bsr_report',
      label: '10-day BSR',
      clock: c.bsr_report_submitted_at ? null : bsrReportClock(c.identification_date),
      done: !!c.bsr_report_submitted_at,
      doneAt: c.bsr_report_submitted_at,
      statutory: true,
    },
  ];
}

// ── Aggregate helpers used by the dashboard widgets ──────────────────────────

/**
 * Summarise the SLA position of one case for dashboard aggregation.
 * Returns { breached, critical, warning, worst } where each list is the
 * SlaClocks entries currently in that state and `worst` is the highest-
 * severity one (used to drive the chip colour).
 */
export function caseSlaSummary(c) {
  const live = allSlaClocks(c).filter(cl => !cl.done && cl.clock);
  const breached = live.filter(cl => cl.clock.status === 'breach');
  const critical = live.filter(cl => cl.clock.status === 'critical');
  const warning  = live.filter(cl => cl.clock.status === 'warning');
  return {
    breached, critical, warning,
    worst: breached[0] ?? critical[0] ?? warning[0] ?? null,
  };
}

const OPEN_SET_INTERNAL = new Set(OPEN_STATUSES);

/** Returns true if the case is in any non-terminal status. */
export function isOpenCase(c) {
  return !!c && OPEN_SET_INTERNAL.has(c.status);
}

/**
 * Personal-queue predicates. Each returns true if the named user should
 * see this case in their "needs my attention" widget.
 */
export function isAwaitingMyApproval(c, userId, isAdmin) {
  return !!isAdmin
    && c?.status === 'decision_pending'
    && !!c.decision_outcome
    && c.decision_proposed_by !== userId
    && c.decision_approved_by == null;
}

export function isMyProposalAwaitingApproval(c, userId) {
  return c?.status === 'decision_pending'
    && !!c.decision_outcome
    && c.decision_proposed_by === userId
    && c.decision_approved_by == null;
}

export function isMineAndOpen(c, userId) {
  return isOpenCase(c) && c.created_by === userId;
}

// ── Timeline entry helpers ────────────────────────────────────────────────────

export const ENTRY_TYPE_LABEL = {
  status_change:    'Status changed',
  note:             'Note added',
  triage:           'Triage recorded',
  decision:         'Decision proposed',
  approval:         'Decision approved',
  rejection:        'Decision rejected',
  bsr_notice:       'BSR notice recorded',
  bsr_report:       'BSR report recorded',
  mitigation:       'Mitigation added',
  assessment:       'Assessment recorded',
  sla_pause:        'SLA paused',
  sla_resume:       'SLA resumed',
  reopened:         'Case reopened',
  closure:          'Case closed',
  reporter_contact: 'Reporter contact',
};

export const ENTRY_TYPE_ICON_COLOUR = {
  status_change:    'text-blue-400',
  note:             'text-slate-400',
  triage:           'text-amber-400',
  decision:         'text-purple-400',
  approval:         'text-emerald-400',
  rejection:        'text-red-400',
  bsr_notice:       'text-orange-400',
  bsr_report:       'text-orange-300',
  mitigation:       'text-yellow-400',
  assessment:       'text-purple-300',
  closure:          'text-emerald-300',
  reopened:         'text-red-400',
  sla_pause:        'text-slate-500',
  sla_resume:       'text-slate-400',
  reporter_contact: 'text-sky-400',
};

// ── Reporter-contact kinds (Phase 2c) ─────────────────────────────────────────

/** Friendly label per contact_kind. */
export const CONTACT_KIND_LABEL = {
  bsr_notified:             'Reporter notified of BSR escalation',
  bsr_notified_skipped:     'BSR-step contact skipped',
  closure_reporter:         'Closure letter sent to reporter',
  closure_reporter_skipped: 'Closure contact skipped',
  closure_residents:        'Residents block notice issued',
  holding:                  'Holding update sent to reporter',
  holding_snooze:           'Holding nudge snoozed',
  other:                    'Other contact recorded',
};

const HAS_REPORTER_CONTACT_INFO = (c) =>
  !!c && !c.is_anonymous && typeof c.reporter_contact === 'string' && c.reporter_contact.trim().length > 0;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Latest timeline entry of entry_type='reporter_contact' matching `kind`. */
export function latestReporterContact(timeline, kind) {
  if (!Array.isArray(timeline)) return null;
  for (let i = timeline.length - 1; i >= 0; i--) {
    const t = timeline[i];
    if (t.entry_type === 'reporter_contact' && (!kind || t.contact_kind === kind)) return t;
  }
  return null;
}

/**
 * Nudge 1 — Reporter notification of BSR escalation.
 * Fires after the case enters the BSR track and stays visible until the
 * staff member records that the reporter has been notified (or chosen to
 * skip the step with a reason).
 */
export function shouldShowBsrNotifyNudge(c, timeline) {
  if (!HAS_REPORTER_CONTACT_INFO(c)) return false;
  if (!['bsr_notice','bsr_report','awaiting_bsr','in_remediation','remediated'].includes(c.status)) return false;
  if (latestReporterContact(timeline, 'bsr_notified'))         return false;
  if (latestReporterContact(timeline, 'bsr_notified_skipped')) return false;
  return true;
}

/**
 * Nudge 2 — Closure letters.
 * Reporter half hidden when there's no contact info or it's already
 * actioned; residents half is independent.
 */
export function shouldShowClosureNudge(c, timeline) {
  if (!c || c.status !== 'closed') return { reporter: false, residents: false };
  const reporterDone =
    !!latestReporterContact(timeline, 'closure_reporter') ||
    !!latestReporterContact(timeline, 'closure_reporter_skipped');
  const residentsDone = !!latestReporterContact(timeline, 'closure_residents');
  return {
    reporter:  HAS_REPORTER_CONTACT_INFO(c) && !reporterDone,
    residents: !residentsDone,
  };
}

/**
 * Nudge 3 — Staleness (>14d without reporter contact).
 * Respects a 7-day snooze. Suppressed when the case is itself awaiting the
 * reporter (separate UI handles that conversation).
 */
export function shouldShowStalenessNudge(c, timeline, now = new Date()) {
  if (!HAS_REPORTER_CONTACT_INFO(c)) return false;
  if (!c.status || c.status === 'closed' || c.status === 'reclassified') return false;
  if (c.status === 'awaiting_reporter') return false;

  // Snooze check — most recent snooze within last 7 days suppresses.
  const snooze = latestReporterContact(timeline, 'holding_snooze');
  if (snooze && (now - new Date(snooze.created_at)) < 7 * DAY_MS) return false;

  // Last reporter contact (any kind that represents actual outreach).
  const OUTREACH_KINDS = new Set([
    'bsr_notified', 'closure_reporter', 'holding', 'other',
  ]);
  let lastOutreach = null;
  for (let i = timeline.length - 1; i >= 0; i--) {
    const t = timeline[i];
    if (t.entry_type === 'reporter_contact' && OUTREACH_KINDS.has(t.contact_kind)) {
      lastOutreach = t;
      break;
    }
  }

  // If no outreach yet, fall back to acknowledged_at (or received_date) as
  // the clock start. If the case was just acknowledged, the BSM may not yet
  // be expected to have written a holding update.
  const anchorIso = lastOutreach?.created_at ?? c.acknowledged_at ?? c.received_date;
  if (!anchorIso) return false;
  return (now - new Date(anchorIso)) > 14 * DAY_MS;
}

// ── Permitted transitions ─────────────────────────────────────────────────────
// IMPORTANT: this map MUST match the mor_is_valid_transition() SQL function in
// migration 137. If you change one, change both — the DB trigger will reject
// any transition that doesn't appear here.

const TRANSITIONS = {
  submitted:        ['acknowledged'],
  acknowledged:     ['in_triage'],
  in_triage:        ['in_assessment', 'decision_pending', 'reclassified', 'closed'],
  in_assessment:    ['decision_pending'],
  // decision_pending → in_triage covers rejectDecision()
  decision_pending: ['bsr_notice', 'in_remediation', 'closed', 'in_triage'],
  bsr_notice:       ['bsr_report'],
  bsr_report:       ['in_remediation', 'awaiting_bsr'],
  in_remediation:   ['remediated', 'awaiting_reporter'],
  awaiting_reporter:['in_remediation', 'in_triage'],
  awaiting_bsr:     ['bsr_report', 'in_remediation'],
  remediated:       ['closed'],
  closed:           ['reopened'],
  reopened:         ['in_triage'],
  reclassified:     [],
};

export function isValidTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}
