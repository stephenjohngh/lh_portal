// src/lib/utils/statutoryTemplate.js
//
// M4 · the statutory PPM template — a recommended set of the recurring safety
// obligations a higher-risk residential building in England is expected to
// hold, so a mandated service cannot be silently absent.
// (docs/requirements/Maintenance_Review.md §M4.)
//
// Pure data + pure functions, no I/O — Type-1 testable.
//
// ── What this is, and what it is NOT ────────────────────────────────────────
// This is a CHECKLIST, not a legal opinion. Two things follow from that, and
// both are load-bearing:
//
// 1. `basis` separates a duty imposed by an INSTRUMENT ('statute') from the
//    recommended practice of a BRITISH STANDARD ('standard'). Both matter — a
//    standard is the accepted standard of care and departing from it needs a
//    reason — but they are not the same kind of obligation, and a compliance
//    tool that blurs them is teaching its users something false. The UI must
//    show which is which.
//
// 2. `intervalBasis` says whether the INTERVAL comes from the instrument
//    ('stated') or is established practice around a duty whose wording is
//    qualitative ('practice'). A fire risk assessment must be reviewed
//    "regularly"; annual is the norm, not the letter of art 9. Recording the
//    difference stops "12 months" being quoted back as though the Order says
//    so.
//
// Intervals here are the CONVENTIONAL ones. They are a starting point for the
// building's own risk assessment, which may require more often — never less
// where an interval is `stated`. `maxIntervalDays` carries the ceiling where
// one genuinely exists, and `planExceedsCeiling` in obligationSchedule.js
// catches a plan set looser than it.
//
// ── Deliberate omissions ───────────────────────────────────────────────────
// · The BSA s.83/85 SAFETY CASE REPORT review is owned by the Golden Thread
//   app (gtSafetyCase.js, and the s.86 revision notification log added with
//   migration 202). Listing it here too would create two places each claiming
//   to track the same duty.
// · Residential PEEPs (in force 6 April 2026) are absent because they are
//   blocked on the resident-data interface, X1 — see
//   Commercial_Landscape_and_Gaps.md §4.1 and Resident_System_Interface.md.
//   They are a per-resident record, not a recurring building service, so they
//   would not fit this shape even once that is resolved.
// · Monthly VISUAL checks of extinguishers and similar fold into the Fire
//   Safety (England) Regulations 2022 reg 6 monthly check below, rather than
//   being listed separately, so one walk discharges one obligation.

/**
 * @typedef {object} TemplateEntry
 * @property {string} key                 Stable id — written to statutory_obligations.template_key
 * @property {string} name
 * @property {string} description
 * @property {string} statutoryRef
 * @property {'statute'|'standard'} basis
 * @property {'stated'|'practice'} intervalBasis
 * @property {number} frequencyDays
 * @property {number|null} maxIntervalDays
 * @property {string} responsibleParty
 * @property {string} competencyRequired
 * @property {string} evidenceRequired
 * @property {number} retentionPeriodMonths
 * @property {'inspection'|'maintenance_job'} evidencedBy
 * @property {string} appliesWhen         Plain-English test for "does this building have one?"
 */

/** @type {TemplateEntry[]} */
export const STATUTORY_TEMPLATE = [
  // ── Fire Safety (England) Regulations 2022 — the HRB-specific duties ──────
  {
    key: 'fser_communal_fire_doors',
    name: 'Fire door checks — communal doors',
    description: 'Check all fire doors in the common parts, including self-closing devices.',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 10(2)',
    basis: 'statute',
    intervalBasis: 'stated',
    frequencyDays: 90,
    maxIntervalDays: 92,
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person trained in fire door inspection; formal certification not required by the regulation',
    evidenceRequired: 'Dated check record per door, with defects and remedial action',
    retentionPeriodMonths: 36,
    evidencedBy: 'inspection',
    appliesWhen: 'Building is over 11 metres in height (always true for an HRB)',
  },
  {
    key: 'fser_flat_entrance_doors',
    name: 'Fire door checks — flat entrance doors',
    description: 'Best endeavours to check every flat entrance door opening onto a common part.',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 10(1)',
    basis: 'statute',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person trained in fire door inspection',
    evidenceRequired: 'Dated check record per door, plus a record of access attempts where entry was refused',
    retentionPeriodMonths: 36,
    evidencedBy: 'inspection',
    appliesWhen: 'Building is over 11 metres and has flat entrance doors onto common parts',
  },
  {
    key: 'fser_monthly_equipment_check',
    name: 'Monthly check — firefighting equipment and facilities',
    description:
      'Monthly check of firefighting lifts, evacuation lifts, and other firefighting equipment and facilities. '
      + 'A fault that cannot be fixed within 24 hours must be reported to the fire and rescue authority.',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 6(2)-(4)',
    basis: 'statute',
    intervalBasis: 'stated',
    frequencyDays: 30,
    maxIntervalDays: 31,
    responsibleParty: 'Responsible person',
    competencyRequired: 'Competent person familiar with the installed equipment',
    evidenceRequired: 'Monthly check record; separate record of any 24-hour fault report made to the fire and rescue authority',
    retentionPeriodMonths: 36,
    evidencedBy: 'inspection',
    appliesWhen: 'Building is over 11 metres (always true for an HRB)',
  },

  {
    key: 'fser_wayfinding_signage',
    name: 'Wayfinding signage — check',
    description:
      'Check that wayfinding signage identifying floor numbers and flat numbers is in place, '
      + 'legible and visible in low light or smoky conditions.',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 5',
    basis: 'statute',
    // The regulation requires the signage to be installed and maintained; it
    // does not name a checking interval. Annual is practice.
    intervalBasis: 'practice',
    frequencyDays: 365,
    maxIntervalDays: null,
    responsibleParty: 'Responsible person',
    competencyRequired: 'Briefed site staff',
    evidenceRequired: 'Dated check record per floor, with any missing or illegible signs',
    retentionPeriodMonths: 36,
    evidencedBy: 'inspection',
    appliesWhen: 'Building is over 11 metres in height (always true for an HRB)',
  },

  // ── Fire detection and alarm ─────────────────────────────────────────────
  {
    key: 'fire_alarm_weekly_test',
    name: 'Fire alarm — weekly test',
    description: 'Operate one manual call point (a different one each week) and confirm the alarm sounds.',
    statutoryRef: 'BS 5839-1, weekly testing by the user',
    basis: 'standard',
    intervalBasis: 'stated',
    frequencyDays: 7,
    maxIntervalDays: 7,
    responsibleParty: 'Responsible person or site staff',
    competencyRequired: 'Briefed site staff; no formal qualification required',
    evidenceRequired: 'Logbook entry naming the call point tested and the result',
    retentionPeriodMonths: 36,
    evidencedBy: 'inspection',
    appliesWhen: 'Building has a fire detection and alarm system',
  },
  {
    key: 'fire_alarm_service',
    name: 'Fire alarm — periodic inspection and service',
    description: 'Periodic inspection and servicing of the fire detection and alarm system by a competent engineer.',
    statutoryRef: 'BS 5839-1, periodic inspection and servicing',
    basis: 'standard',
    intervalBasis: 'stated',
    frequencyDays: 182,
    maxIntervalDays: 183,
    responsibleParty: 'Fire alarm service contractor',
    competencyRequired: 'Competent fire alarm engineer; third-party certificated firm (e.g. BAFE SP203-1) recommended',
    evidenceRequired: 'Servicing certificate listing devices tested and any non-compliances',
    retentionPeriodMonths: 36,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a fire detection and alarm system',
  },

  // ── Emergency lighting ───────────────────────────────────────────────────
  {
    key: 'emergency_lighting_monthly',
    name: 'Emergency lighting — monthly function test',
    description: 'Short-duration function test of every emergency luminaire and exit sign.',
    statutoryRef: 'BS 5266-1 / BS EN 50172, monthly function test',
    basis: 'standard',
    intervalBasis: 'stated',
    frequencyDays: 30,
    maxIntervalDays: 31,
    responsibleParty: 'Responsible person or site staff',
    competencyRequired: 'Briefed site staff',
    evidenceRequired: 'Logbook entry per test, with any failed luminaires identified',
    retentionPeriodMonths: 36,
    evidencedBy: 'inspection',
    appliesWhen: 'Building has emergency escape lighting',
  },
  {
    key: 'emergency_lighting_annual',
    name: 'Emergency lighting — annual full-duration test',
    description: 'Full rated-duration discharge test (normally three hours), with luminaires recharged afterwards.',
    statutoryRef: 'BS 5266-1, annual full-duration test',
    basis: 'standard',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    responsibleParty: 'Emergency lighting contractor',
    competencyRequired: 'Competent electrical contractor',
    evidenceRequired: 'Annual test certificate recording the duration achieved per luminaire',
    retentionPeriodMonths: 36,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has emergency escape lighting',
  },

  // ── Fixed firefighting installations ─────────────────────────────────────
  {
    key: 'extinguishers_annual_service',
    name: 'Fire extinguishers — annual basic service',
    description: 'Basic service of every portable extinguisher by a competent technician.',
    statutoryRef: 'BS 5306-3, basic service',
    basis: 'standard',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    responsibleParty: 'Extinguisher service contractor',
    competencyRequired: 'Competent extinguisher technician (e.g. BAFE SP101 registered)',
    evidenceRequired: 'Service certificate and per-unit service labels',
    retentionPeriodMonths: 36,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has portable fire extinguishers in the common parts',
  },
  {
    key: 'dry_riser_annual_test',
    name: 'Dry riser — annual pressure test',
    description: 'Annual wet pressure test of the riser main, landing valves and inlet breeching.',
    statutoryRef: 'BS 9990, annual test',
    basis: 'standard',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    responsibleParty: 'Riser service contractor',
    competencyRequired: 'Competent dry riser engineer',
    evidenceRequired: 'Annual test certificate recording pressure held and duration',
    retentionPeriodMonths: 36,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a dry (or wet) riser',
  },
  {
    key: 'dry_riser_visual',
    name: 'Dry riser — six-monthly visual inspection',
    description: 'Visual inspection of inlets, outlets, cabinets and padlocks between annual tests.',
    statutoryRef: 'BS 9990, six-monthly visual inspection',
    basis: 'standard',
    intervalBasis: 'stated',
    frequencyDays: 182,
    maxIntervalDays: 183,
    responsibleParty: 'Responsible person or riser contractor',
    competencyRequired: 'Briefed site staff or riser engineer',
    evidenceRequired: 'Inspection record noting condition and any missing components',
    retentionPeriodMonths: 36,
    evidencedBy: 'inspection',
    appliesWhen: 'Building has a dry (or wet) riser',
  },
  {
    key: 'sprinkler_annual_service',
    name: 'Suppression system — annual service',
    description: 'Annual service and test of the sprinkler or residential suppression system.',
    statutoryRef: 'BS 9251 (residential) / BS EN 12845 (commercial), annual service',
    basis: 'standard',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    responsibleParty: 'Suppression system contractor',
    competencyRequired: 'Competent sprinkler engineer (e.g. LPCB or BAFE SP203-4 certificated)',
    evidenceRequired: 'Annual service certificate, and pump test results where a pump is fitted',
    retentionPeriodMonths: 36,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a sprinkler or other fixed suppression system',
  },
  {
    key: 'smoke_control_service',
    name: 'Smoke control / AOV system — service',
    description: 'Service and functional test of the smoke control system, including AOVs and any smoke shafts.',
    statutoryRef: 'BS EN 12101 / BS 7346-8, periodic servicing',
    basis: 'standard',
    intervalBasis: 'practice',
    frequencyDays: 182,
    maxIntervalDays: 366,
    responsibleParty: 'Smoke control contractor',
    competencyRequired: 'Competent smoke control engineer (Smoke Control Association member firm recommended)',
    evidenceRequired: 'Service certificate recording each vent and control panel tested',
    retentionPeriodMonths: 36,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a smoke control system, smoke shaft or automatic opening vents',
  },

  // ── Lifts ────────────────────────────────────────────────────────────────
  {
    key: 'lift_loler_examination',
    name: 'Lift — LOLER thorough examination',
    description: 'Thorough examination of each passenger lift by a competent person.',
    statutoryRef: 'Lifting Operations and Lifting Equipment Regulations 1998, reg 9(3)',
    basis: 'statute',
    intervalBasis: 'stated',
    frequencyDays: 182,
    maxIntervalDays: 183,
    responsibleParty: 'Insurance inspection body or independent examiner',
    competencyRequired:
      'Competent person INDEPENDENT of the maintenance contractor — a lift service visit is not a thorough examination',
    evidenceRequired: 'Report of thorough examination, with any defect notified to the duty holder',
    retentionPeriodMonths: 36,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a lift carrying people',
  },
  {
    key: 'lift_maintenance',
    name: 'Lift — routine maintenance service',
    description: 'Routine preventive maintenance visit under the lift service contract.',
    statutoryRef: 'BS EN 13015, planned maintenance',
    basis: 'standard',
    intervalBasis: 'practice',
    frequencyDays: 90,
    maxIntervalDays: null,
    responsibleParty: 'Lift maintenance contractor',
    competencyRequired: 'Competent lift engineer',
    evidenceRequired: 'Service visit report / lift logbook entry',
    retentionPeriodMonths: 36,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a lift',
  },

  // ── Building services ────────────────────────────────────────────────────
  {
    key: 'gas_safety_check',
    name: 'Gas safety check',
    description: 'Annual safety check of gas appliances and flues for which the landlord is responsible.',
    statutoryRef: 'Gas Safety (Installation and Use) Regulations 1998, reg 36(3)',
    basis: 'statute',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    responsibleParty: 'Gas Safe registered engineer',
    competencyRequired: 'Gas Safe registered, with the correct appliance categories',
    evidenceRequired: 'Landlord gas safety record (CP12); copy to each affected tenant',
    retentionPeriodMonths: 24,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Landlord is responsible for any gas appliance, flue or pipework',
  },
  {
    key: 'eicr_common_parts',
    name: 'EICR — common parts and landlord supply',
    description: 'Periodic inspection and testing of the common-parts electrical installation.',
    statutoryRef: 'BS 7671, periodic inspection and testing',
    basis: 'standard',
    intervalBasis: 'practice',
    frequencyDays: 1825,
    maxIntervalDays: 1826,
    responsibleParty: 'Electrical contractor',
    competencyRequired: 'Qualified and competent electrician; scheme-registered firm recommended',
    evidenceRequired: 'Electrical Installation Condition Report with observation codes and remedial actions',
    retentionPeriodMonths: 120,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a common-parts or landlord electrical supply (always true in practice)',
  },
  {
    key: 'eicr_dwellings',
    name: 'EICR — rented dwellings',
    description: 'Five-yearly inspection and testing of the electrical installation in each rented dwelling.',
    statutoryRef: 'Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020, reg 3',
    basis: 'statute',
    intervalBasis: 'stated',
    frequencyDays: 1825,
    maxIntervalDays: 1826,
    responsibleParty: 'Electrical contractor',
    competencyRequired: 'Qualified and competent electrician',
    evidenceRequired: 'EICR per dwelling; copy to the tenant within 28 days',
    retentionPeriodMonths: 120,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Any dwelling is let on a relevant tenancy — long leases alone do NOT trigger this',
  },
  {
    key: 'lightning_protection',
    name: 'Lightning protection — test and inspection',
    description: 'Inspection and earth-resistance testing of the lightning protection system.',
    statutoryRef: 'BS EN 62305-3, periodic inspection and testing',
    basis: 'standard',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    responsibleParty: 'Lightning protection contractor',
    competencyRequired: 'Competent lightning protection engineer (ATLAS member firm recommended)',
    evidenceRequired: 'Test certificate recording earth resistance readings per down conductor',
    retentionPeriodMonths: 60,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a lightning protection system',
  },

  // ── Assessments that must be kept current ────────────────────────────────
  {
    key: 'fire_risk_assessment_review',
    name: 'Fire risk assessment — review',
    description: 'Review the fire risk assessment and record it in full.',
    statutoryRef: 'Regulatory Reform (Fire Safety) Order 2005, art 9',
    basis: 'statute',
    intervalBasis: 'practice',
    frequencyDays: 365,
    maxIntervalDays: null,
    responsibleParty: 'Responsible person, via a competent fire risk assessor',
    competencyRequired: 'Competent fire risk assessor; third-party certificated assessor recommended for an HRB',
    evidenceRequired: 'Reviewed and dated fire risk assessment, recorded in full, with an action plan',
    retentionPeriodMonths: 120,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always — art 9 applies to every building with common parts',
  },
  {
    key: 'legionella_risk_review',
    name: 'Legionella risk assessment — review',
    description: 'Review the water system risk assessment and confirm the written control scheme is still valid.',
    statutoryRef: 'Health and Safety at Work etc. Act 1974 / COSHH, via ACOP L8 and HSG274',
    basis: 'statute',
    intervalBasis: 'practice',
    frequencyDays: 730,
    maxIntervalDays: null,
    responsibleParty: 'Duty holder, via a competent water hygiene assessor',
    competencyRequired: 'Competent legionella risk assessor (e.g. Legionella Control Association registered)',
    evidenceRequired: 'Reviewed risk assessment and written control scheme',
    retentionPeriodMonths: 60,
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a water system the duty holder controls — including communal tanks or boosted mains',
  },
  {
    key: 'legionella_monitoring',
    name: 'Water temperature monitoring',
    description: 'Routine monitoring of hot and cold water temperatures at sentinel outlets.',
    statutoryRef: 'ACOP L8 / HSG274 Part 2, routine monitoring',
    basis: 'standard',
    intervalBasis: 'practice',
    frequencyDays: 30,
    maxIntervalDays: 31,
    responsibleParty: 'Responsible person or water hygiene contractor',
    competencyRequired: 'Briefed site staff working to the written control scheme',
    evidenceRequired: 'Monitoring log with temperatures and outlets, and action taken on out-of-range readings',
    retentionPeriodMonths: 60,
    evidencedBy: 'inspection',
    appliesWhen: 'Building has a communal hot or cold water system',
  },
];

/** Every template key, in template order. */
export const TEMPLATE_KEYS = STATUTORY_TEMPLATE.map(e => e.key);

const BY_KEY = new Map(STATUTORY_TEMPLATE.map(e => [e.key, e]));

/** @param {string} key */
export function templateEntry(key) {
  return BY_KEY.get(key) ?? null;
}

export const BASIS_LABEL = {
  statute:  'Statutory',
  standard: 'British Standard',
};

/**
 * Short note on where the interval comes from — shown next to the frequency so
 * a conventional interval is never read as a legal one.
 * @param {TemplateEntry|null} entry
 */
export function intervalNote(entry) {
  if (!entry) return '';
  return entry.intervalBasis === 'stated'
    ? 'Interval set by the reference above.'
    : 'Interval is established practice; the reference sets the duty, not the frequency.';
}

/**
 * Form data for creating an obligation from a template entry — the same shape
 * `inspectionDefinitionsStore.create` takes, so the template writes exactly
 * what the editor would have written by hand.
 *
 * `scope` is deliberately left EMPTY. Scope is the one thing the template
 * cannot know: which types, systems or floors an obligation covers is a fact
 * about this building. An empty scope matches everything, which is the safe
 * direction to be wrong in — visible and over-broad rather than silently
 * covering nothing.
 *
 * @param {TemplateEntry|null} entry
 * @param {{ presentationOrder?: number }} [opts]
 */
export function templateToObligation(entry, opts = {}) {
  if (!entry) return null;
  return {
    name:                    entry.name,
    description:             entry.description,
    active:                  true,
    mode:                    'standard',
    scope:                   {},
    checklist_mode:          'type_driven',
    checklist_attr_ids:      [],
    pass_fail_rule:          'manual',
    frequency_days:          entry.frequencyDays,
    presentation_order:      opts.presentationOrder ?? 0,
    evidenced_by:            entry.evidencedBy,
    statutory_ref:           entry.statutoryRef,
    max_interval_days:       entry.maxIntervalDays,
    responsible_party:       entry.responsibleParty,
    competency_required:     entry.competencyRequired,
    evidence_required:       entry.evidenceRequired,
    retention_period_months: entry.retentionPeriodMonths,
    template_key:            entry.key,
  };
}

/**
 * Coverage of the template by the obligations actually held.
 *
 * Coverage is decided ONLY by `template_key`, never by matching names or
 * references — see migration 207's header for why a heuristic is the wrong
 * tool here. An obligation that duplicates a template entry but carries no key
 * is offered as a SUGGESTION (see `suggestMatches`) for a person to confirm.
 *
 * An INACTIVE obligation covers nothing: switching an obligation off is
 * exactly the state this report exists to surface.
 *
 * @param {Array<{template_key?: string|null, active?: boolean}>} obligations
 * @param {{ dismissedKeys?: string[] }} [opts] keys marked not applicable to this building
 */
export function templateCoverage(obligations, opts = {}) {
  const dismissed = new Set(opts.dismissedKeys ?? []);
  const byKey = new Map();
  for (const o of obligations ?? []) {
    const key = o?.template_key;
    if (!key || !BY_KEY.has(key)) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(o);
  }

  const covered = [];
  const missing = [];
  const notApplicable = [];

  for (const entry of STATUTORY_TEMPLATE) {
    const linked = byKey.get(entry.key) ?? [];
    const active = linked.filter(o => o.active !== false);
    if (active.length > 0) {
      covered.push({ entry, obligations: linked, activeCount: active.length });
    } else if (dismissed.has(entry.key)) {
      notApplicable.push({ entry, obligations: linked });
    } else {
      // Linked but all inactive still reads as a gap — deliberately.
      missing.push({ entry, obligations: linked, inactiveOnly: linked.length > 0 });
    }
  }

  const applicableCount = covered.length + missing.length;
  return {
    covered,
    missing,
    notApplicable,
    coveredCount: covered.length,
    applicableCount,
    // The percentage is over what the building says applies to it, so marking
    // a lift-less building's LOLER entry not applicable moves it towards 100%
    // rather than leaving a permanent shortfall nobody can ever clear.
    percent: applicableCount === 0 ? 100 : Math.round((covered.length / applicableCount) * 100),
  };
}

/** Normalise a reference for loose comparison: case, punctuation and spacing. */
function normaliseRef(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The leading standard or instrument name, e.g. 'bs 5839 1' from a fuller ref. */
function refHead(s) {
  const n = normaliseRef(s);
  const m = n.match(/^bs(?: en)?(?: iso)?(?: \d+)+/);
  return m ? m[0] : n.split(/\s+/).slice(0, 4).join(' ');
}

// Words that say how a thing is done rather than what it is. Dropping them is
// what lets an existing "Fire Doors" match "Fire door checks — communal doors":
// substring matching does not, because of the plural and the inserted verb.
const NAME_NOISE = new Set([
  'check', 'checks', 'checking', 'test', 'tests', 'testing', 'service',
  'servicing', 'inspection', 'inspections', 'review', 'monitoring',
  'annual', 'monthly', 'weekly', 'quarterly', 'periodic', 'routine', 'basic',
  'full', 'duration', 'function', 'and', 'the', 'of', 'for', 'system', 'systems',
]);

/** Significant, singularised words of a name. */
function nameTokens(s) {
  return new Set(
    normaliseRef(s)
      .split(/\s+/)
      .filter(Boolean)
      .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))   // doors -> door
      .filter(w => w.length > 1 && !NAME_NOISE.has(w)),
  );
}

/**
 * Does the obligation's name describe this entry? True when every significant
 * word of the obligation's name appears in the entry's — "Fire Doors" describes
 * "Fire door checks — communal doors", but "Apartment Doors" does not, because
 * "apartment" is not in it.
 *
 * Deliberately one-directional: a SHORTER, vaguer existing name matching a
 * fuller template name is the realistic case (the seeded definitions are called
 * "Fire Doors" and "Emergency Lighting"). Going the other way would match
 * almost everything to almost everything.
 */
function nameDescribes(obligationName, entryName) {
  const o = nameTokens(obligationName);
  const e = nameTokens(entryName);
  if (o.size === 0 || e.size === 0) return false;
  for (const w of o) if (![...e].some(x => tokensAgree(w, x))) return false;
  return true;
}

/**
 * Two words naming the same thing. Equality, or one a prefix of the other with
 * at least four characters — so "sign" agrees with "signage" (the seeded
 * definition is "Wayfinding Sign Check"; the regulation says signage). The
 * four-character floor and the all-tokens-must-agree rule above are what stop
 * this being a licence to match anything to anything.
 */
function tokensAgree(a, b) {
  if (a === b) return true;
  if (SYNONYM.get(a) === SYNONYM.get(b) && SYNONYM.has(a)) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

/**
 * UK housing vocabulary for the same thing — NOT a general thesaurus, and it
 * should stay this short. The regulation says "flat entrance door"; the
 * building's own seeded definition is called "Apartment Doors", and that is
 * the single most important door check there is, so failing to offer the link
 * would invite a duplicate for exactly the obligation you least want two of.
 */
const SYNONYM = new Map([
  ['flat', 'dwelling'], ['apartment', 'dwelling'], ['dwelling', 'dwelling'],
]);

const SUGGESTION_RANK = {
  'Same statutory reference': 0,
  'Same standard and evidence route': 1,
  'Similar name': 2,
};

/**
 * Unlinked obligations that LOOK like they satisfy a template entry, so a
 * person can confirm the link rather than creating a duplicate.
 *
 * Suggestions never count as coverage. They are ranked, not decided: an exact
 * reference match outranks a shared standard, which outranks a name match.
 *
 * @param {Array<{id?: string, name?: string, statutory_ref?: string|null, template_key?: string|null, evidenced_by?: string|null}>} obligations
 * @returns {Map<string, Array<{obligation: object, reason: string}>>} template key -> candidates
 */
export function suggestMatches(obligations) {
  const out = new Map();
  const unlinked = (obligations ?? []).filter(o => !o?.template_key);
  if (unlinked.length === 0) return out;

  for (const entry of STATUTORY_TEMPLATE) {
    const entryRef  = normaliseRef(entry.statutoryRef);
    const entryHead = refHead(entry.statutoryRef);
    const candidates = [];

    for (const o of unlinked) {
      const oRef   = normaliseRef(o.statutory_ref);
      const oRoute = o.evidenced_by ?? 'inspection';
      let reason = null;

      if (oRef && oRef === entryRef) {
        reason = 'Same statutory reference';
      } else if (oRef && entryHead && refHead(o.statutory_ref) === entryHead
                 && oRoute === entry.evidencedBy) {
        // Several entries share a standard (BS 5839-1 covers both the weekly
        // test and the service), so the evidence route has to agree too.
        reason = 'Same standard and evidence route';
      } else if (oRoute === entry.evidencedBy && nameDescribes(o.name, entry.name)) {
        // The route must agree here too. Without it, an inspection-route
        // "Emergency Lighting" is offered against the annual full-duration
        // test, which is a contractor job it can never discharge — an
        // inviting, wrong answer.
        reason = 'Similar name';
      }

      if (reason) candidates.push({ obligation: o, reason });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => SUGGESTION_RANK[a.reason] - SUGGESTION_RANK[b.reason]);
      out.set(entry.key, candidates);
    }
  }
  return out;
}
