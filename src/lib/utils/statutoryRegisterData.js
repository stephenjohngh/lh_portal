// src/lib/utils/statutoryRegisterData.js
//
// THE PERIODIC ACTIVITY REGISTER — every recurring check identified for a
// higher-risk residential building in England, from every source we hold.
// Data only; the logic that reads it is in statutoryTemplate.js.
//
// ── Sources merged here ─────────────────────────────────────────────────────
// · docs/requirements/BSA_Periodic_Activities_and_Checks.docx — the fullest
//   list, and the source of some of the FSER regulation numbers and the
//   governance/BSA cycles.
//
//   ⚠⚠ **SIX FSER CITATIONS HERE WERE WRONG — verified against
//   legislation.gov.uk, 2026-09-11. THREE WERE OURS AND THREE WERE ITS.**
//   The split matters; do not repeat the version of this note that blamed the
//   document for all six.
//     **Ours, invented here and not in that document at all:** both fire-door
//     checks cited reg 10(1)/(2) — the *information to residents* paragraphs —
//     when the checks are reg 10(4) and 10(6); and the monthly equipment check
//     cited reg 6, which is floor plans, when it is reg 7. (That document
//     cites the fire-door row as "Practice; BS 8214" and has no monthly
//     equipment row.)
//     **Its, and copied here unchecked:** the premises information box at
//     reg 11 (it is reg 4), and resident fire safety information at reg 4 (it
//     is reg 9).
//   **Check any citation against the instrument before trusting it** — from
//   that document OR from us.
//   ⚠ It is also written for **Lancaster House,
//   Manchester**, not Lonsdale House — the only supplied document that names a
//   building. Its building-specific §5 items (basement Acrow-prop monitoring,
//   fire-alarm coverage-gap monitoring, the stair-core regime) are NOT included
//   here: they are interim mitigations tied to that building's own open
//   findings, not a general register.
// · docs/requirements/Commercial_Landscape_and_Gaps.md §4.4 / §4.5 — our own
//   FSER cadence table and certificate register.
// · docs/inspection_user_guide.md — corroborates FSER reg 6.
//
// ⚠ THE REGULATION-NUMBER TRAP. The BSA documents cite **SI 2023/907** at
// reg 6 (MOR) and reg 10 (engagement strategy). Those are DIFFERENT regs 6 and
// 10 from the Fire Safety (England) Regulations 2022 ones below — same numbers,
// different instrument, unrelated subject. Never cross-reference the two.
//
// ⛔ DELIBERATELY EXCLUDED: the CONTENT of PEEPs / PCFRAs. Decided 2026-09-10.
// Resident personal data stays out of this portal (Resident_System_Interface.md),
// and a personal evacuation plan is special-category health data about a named
// person. Do not re-add the content.
//
// ⚠ BUT THE DUTIES ARE IN, and the distinction is the whole point — added
// 2026-09-13 after external review found this the single biggest omission.
// The Fire Safety (Residential Evacuation Plans) (England) Regulations 2025
// (SI 2025/797) came into force **6 April 2026** and bind this building (reg 3:
// two or more sets of domestic premises and at least seven storeys — we have
// eight above ground). Excluding the DATA is a decision about where records
// live. Excluding the DUTY would have been a hole in the register, and a
// register that omits a live statutory duty is exactly what it exists to
// prevent. See `evac_building_plan_review` and `evac_person_centred_review`:
// the first holds no personal data at all, the second is recorded as an
// interface to the responsible person's own process.
//
// ── The four fields that make an entry legible ──────────────────────────────
// `basis`         WHERE THE REQUIREMENT COMES FROM — see BASIS in the logic
//                 module. Legislation / standard / contract / management.
// `intervalBasis` whether the INTERVAL is set by that source ('stated') or is
//                 established practice around a qualitative duty ('practice').
// `handledBy`     WHICH SUB-APP deals with it today, or 'none' where nothing in
//                 the portal does. 'none' is the honest answer for several, and
//                 the register is more useful for saying so.
// `evidencedBy`   how the obligation library SCHEDULES it: an inspection walk,
//                 a maintenance job, or `null` where another app owns its own
//                 cycle and creating an obligation would duplicate it.
//
// A maintenance job does not require a contractor, so it is the route for any
// dated task with an owner — including desk reviews.

// ── When a requirement is WITHDRAWN ────────────────────────────────────────
// A repealed or superseded requirement is FLAGGED, never deleted:
//
//   supersededOn:   'YYYY-MM-DD'   the date it stopped being required
//   supersededBy:   'other_key'    the entry that replaced it, if one did
//   supersededNote: 'why'          the instrument that repealed it
//
// It stays in the register forever. Three reasons, and the third is the one
// that matters most:
//   1. Work done under it BEFORE that date is still valid evidence, and the
//      history report must still be able to describe what it was for.
//   2. An assessor looking at a 2027 report of 2026 work needs the requirement
//      to still exist to make sense of it.
//   3. Deleting the entry would strand every obligation carrying its
//      `template_key`, silently turning discharged work into an orphan.
//
// This is a fact about the LAW, not about this building — which is why it
// lives here in version control rather than in `statutory_exclusions`, where a
// second building would need its own row repeating it.

// ══ WHAT MAY BE WRITTEN IN THIS FILE ════════════════════════════════════════
//
// Settled with the duty holder on 2026-09-14, after the register was found to
// be encoding this building's CURRENT position in several places.
//
//   This file is a CATALOGUE: what CAN apply to a building of this kind.
//   What applies TODAY is data — the applied obligations, and the append-only
//   statutory_exclusions decision log.
//
// Three rules, and the distinction between the first two is the whole point:
//
//   1. DELETE only for NEVER. Gas was deleted because this building will never
//      have a gas supply — a permanent fact about the building. It is the only
//      deletion this register has made, and the bar stays that high.
//
//   2. CONDITION, do not assert, for NOT TODAY. An entry whose applicability
//      turns on a building feature states that condition in appliesWhen and
//      stays here whether or not the feature exists. It is switched off by a
//      recorded, reasoned, attributed decision carrying a review date, and
//      switched back on the same way. NO CODE CHANGE either way — that is what
//      the exclusion log being append-only and reversible is for.
//
//      The worked example is smoke ventilation. A stair is ventilated
//      mechanically (an AOV) or naturally (openable windows). BOTH rows are
//      here permanently; the decision log says which is live. This building
//      relies on windows today and expects an AOV, and that transition will be
//      two recorded decisions and no edit to this file.
//
//   3. NEVER encode a transient position. "Acrow props to the basement
//      mezzanine" and "the cracked mezzanine columns" describe what is wrong
//      with the building this month. Repair them and the rows describe nothing.
//      The durable entry is the general one — monitoring of temporary
//      structural support, monitoring of a defect under an engineer's
//      specification — with WHICH prop and WHICH column living in the applied
//      obligation's scope and the job record.
//
// ⚠ THE TEST, applied to every word of a new entry:
//   WOULD THIS STILL BE TRUE IF THE BUILDING WERE REPAIRED, OR ALTERED,
//   TOMORROW?  If not, it belongs in the data and not in this file.
//
// The corollary matters too: a row being currently inapplicable is NOT a
// reason to leave it out. A register holding only what applies today cannot
// tell you what you stopped doing, or what you would need to start.

/** Defaults so an entry only states what is true of it. */
function entry(e) {
  return {
    maxIntervalDays: null,
    // Is `maxIntervalDays` a ceiling the SOURCE imposes, or our own control
    // limit? Default false — i.e. the source imposes it — because most rows
    // carrying a maximum cite an instrument that states a period ("within each
    // period of 12 months", "at intervals of no more than 5 years").
    //
    // Set TRUE where the day count is OUR arithmetic on a word. FSER reg 7 says
    // "monthly routine checks" and expresses no permitted maximum, so calling
    // our 31-day limit a "maximum permitted interval" would convert our own
    // scheduling rule into law — the exact confusion this register exists to
    // prevent. Declared per row, because only the citation can settle which it
    // is and nothing can infer it.
    maxIsSchedulingTolerance: false,
    // A row that is not yet a usable control — an interim mitigation with no
    // escalation threshold and no end condition, say. TRUE renders a visible
    // "Completion action" line in the outward-facing statement, and that line
    // says NOT ASSIGNED until `completionAction` is filled in.
    //
    // The point of the pair is that a warning written in prose reads the same
    // on the day it is written and two years later, whereas an unassigned
    // action is conspicuous every time the document is produced. Do not clear
    // `operationallyIncomplete` to tidy the output; clear it by assigning the
    // action and populating the fields the row says it lacks.
    operationallyIncomplete: false,
    /** @type {string|null} Action id, owner, technical authority, due date, interim risk owner, status. */
    completionAction: null,
    competencyRequired: null,
    retentionPeriodMonths: 36,
    trigger: null,
    frequencyDays: null,
    handlingNote: '',
    supersededOn: null,
    supersededBy: null,
    supersededNote: '',
    ...e,
  };
}

export const REGISTER = [

  // ══ 1 · Statutory fire safety ═══════════════════════════════════════════
  entry({
    key: 'fra_refresh',
    name: 'Fire risk assessment — refresh',
    description: 'Refresh the fire risk assessment and record it in full.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Regulatory Reform (Fire Safety) Order 2005, art 9. THE DUTY is to make and keep up to date a suitable and sufficient assessment, reviewing it regularly and whenever there is reason to suspect it is no longer valid or there has been a significant change. THE ANNUAL FREQUENCY shown here is our adopted control — art 9 states no interval',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Responsible person, via a competent fire risk assessor',
    competencyRequired: 'Competent fire risk assessor; third-party certificated (e.g. BAFE SP205) recommended for an HRB',
    evidenceRequired: 'Reviewed and dated FRA, recorded in full, with an action plan',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    handlingNote: 'The FRA itself is a Golden Thread document with its own review-due date.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Wherever the premises are subject to the Regulatory Reform (Fire Safety) Order 2005 and we are the responsible person or have an agreed role supporting that duty. ⚠ The accountable person, the managing agent and the responsible person are NOT automatically the same party',
  }),
  entry({
    key: 'fra_review_on_trigger',
    reviewerNote:
      'The statutory trigger, as distinct from our annual pass on the next row. Art 9(3) requires the '
      + 'assessment to be reviewed "regularly so as to keep it up to date and particularly if — (a) '
      + 'there is reason to suspect that it is no longer valid; or (b) there has been a significant '
      + 'change", including where the premises, the technical or organisational measures, or the '
      + 'organisation of the work undergo significant changes, extensions or conversions. ⚠ Neither '
      + 'limb is a date, and an annual refresh standing alone lets a calendar read as the trigger. '
      + 'Note also that the fire safety order reaches the STRUCTURE, the EXTERNAL WALLS and the FLAT '
      + 'ENTRANCE DOORS of a building of this kind, by the amendment made by the Fire Safety Act 2021 '
      + '— so a change to any of those can be the significant change that fires this row.',
    name: 'Fire risk assessment — review on trigger',
    description:
      'Review the fire risk assessment as soon as there is reason to suspect it is no longer valid, '
      + 'or after any significant change — to the premises, the structure, the external walls, the '
      + 'flat entrance doors, the fire safety measures, the occupancy or the way the building is '
      + 'used — and make any change to the assessment that the review shows is needed.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Regulatory Reform (Fire Safety) Order 2005, art 9(3) — review "regularly so as to keep it up to date and particularly if (a) there is reason to suspect that it is no longer valid; or (b) there has been a significant change". The Order applies to the structure, external walls and flat entrance doors of a building containing two or more sets of domestic premises, by the amendment made by the Fire Safety Act 2021',
    intervalBasis: 'stated',
    frequencyDays: null,
    trigger: 'Reason to suspect the assessment is no longer valid, or a significant change to the premises, the structure, the external walls, the fire safety measures, the occupancy or the organisation of the work',
    triggerType: 'event',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person competent to judge whether a change is significant, escalating to the fire risk assessor where it may be',
    evidenceRequired: 'Record of what triggered the review, when awareness arose, who judged it, the review carried out and any change made to the assessment — including a reasoned record where a change was judged NOT significant',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote:
      '⚠ No home, and nothing detects the trigger. The building-work screening row should catch a '
      + 'planned change; an unplanned one — an incident, a new occupancy pattern, a defect found on '
      + 'another check — depends on a person raising it.',
    evidencedBy: null,
    appliesWhen: 'Wherever the premises are subject to the Regulatory Reform (Fire Safety) Order 2005 and we are the responsible person or have an agreed role supporting that duty',
  }),
  entry({
    key: 'fra_action_plan_review',
    name: 'FRA action plan — review',
    description: 'Review progress against the fire risk assessment’s action plan and re-prioritise what is open.',
    group: 'fire_safety',
    basis: 'management',
    statutoryRef: 'Self-imposed; supports BSA 2022 s.84 reasonable steps',
    intervalBasis: 'practice',
    frequencyDays: 90,
    responsibleParty: 'Building safety lead',
    evidenceRequired: 'Meeting record and an updated action register',
    handledBy: 'management',
    handlingNote: 'FRA actions live as Management issues/actions; this is the recurring review of them.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'A fire risk assessment exists with open actions',
  }),
  entry({
    key: 'fser_communal_fire_doors',
    name: 'Fire door checks — communal doors',
    description: 'Check all fire doors in the common parts, including self-closing devices.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 10(6); self-closing devices reg 10(7)',
    intervalBasis: 'stated',
    frequencyDays: 90,
    maxIntervalDays: 92,
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person trained in fire door inspection; formal certification not required by the regulation',
    evidenceRequired: 'Dated check record per door, with defects and remedial action',
    handledBy: 'inspection',
    handlingNote: 'An inspection walk scoped to communal fire doors.',
    evidencedBy: 'inspection',
    appliesWhen: 'Always — the building is above 11 metres, the threshold in reg 10 itself',
  }),
  entry({
    key: 'fser_flat_entrance_doors',
    name: 'Fire door checks — flat entrance doors',
    description: 'Best endeavours to check every flat entrance door opening onto a common part.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 10(4); record of access attempts reg 10(5); self-closing devices reg 10(7)',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person trained in fire door inspection',
    evidenceRequired: 'Dated check record per door, plus a record of access attempts where entry was refused',
    handledBy: 'inspection',
    handlingNote: 'The walk’s “No access” outcome exists for this duty — best endeavours, evidenced.',
    evidencedBy: 'inspection',
    appliesWhen: 'Always — the building is above 11 metres (the reg 10 threshold) and has flat entrance doors onto common parts',
  }),
  entry({
    key: 'fdis_scheme_inspection',
    name: 'Fire door inspection — certificated scheme round',
    description:
      'Third-party certificated fire door inspection. Distinct from the responsible person’s own reg 10 check: '
      + 'a different person, to a scheme standard, producing a per-door report.',
    group: 'fire_safety',
    basis: 'contract',
    statutoryRef: 'FDIS scheme; BS 8214',
    intervalBasis: 'practice',
    frequencyDays: 90,
    responsibleParty: 'Managing agent, commissioned to an FDIS inspector',
    competencyRequired: 'FDIS certificated inspector',
    evidenceRequired: 'Per-door inspection report',
    handledBy: 'maintenance',
    handlingNote: 'A contractor job; the report registers to the Golden Thread on completion.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'The building commissions scheme inspections in addition to its own checks',
  }),
  entry({
    key: 'fire_alarm_weekly_test',
    name: 'Fire alarm — weekly test',
    description:
      'Carry out the weekly user test required by the adopted fire alarm standard and the system’s '
      + 'cause-and-effect arrangement — normally operating a manual call point and rotating the point '
      + 'tested so that all are covered over an appropriate period.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 5839-1, weekly testing by the user — the precise test follows the system’s category, design and log book, and the edition of the standard adopted for this installation. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) requires the premises and any facilities, equipment and devices provided in respect of them to be "maintained in an efficient state, in efficient working order and in good repair", under a suitable system of maintenance. The standard supplies the METHOD and the INTERVAL; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 7,
    maxIntervalDays: 7,
    responsibleParty: 'Responsible person or site staff',
    competencyRequired: 'Briefed site staff; no formal qualification required',
    evidenceRequired: 'Logbook entry naming the call point tested and the result',
    handledBy: 'inspection',
    evidencedBy: 'inspection',
    appliesWhen: 'Building has a fire detection and alarm system',
  }),
  entry({
    key: 'fire_alarm_service',
    name: 'Fire alarm — periodic inspection and service',
    description: 'Periodic inspection and servicing of the fire detection and alarm system by a competent engineer.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 5839-1, periodic inspection and servicing. ⚠ THE ADOPTED EDITION AND SYSTEM CATEGORY ARE NOT RECORDED. ❓ Confirm the BS 5839-1 edition adopted, the system category, the cause-and-effect schedule, whether the installation includes detectors linked to smoke control, who carries testing responsibility and how defects escalate. ⚠ This servicing does NOT discharge the statutory monthly reg 7 check, nor the weekly user test. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) requires the premises and any facilities, equipment and devices provided in respect of them to be "maintained in an efficient state, in efficient working order and in good repair", under a suitable system of maintenance. The standard supplies the METHOD and the INTERVAL; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 182,
    maxIntervalDays: 183,
    responsibleParty: 'Fire alarm service contractor',
    competencyRequired: 'Competent fire alarm engineer; BAFE SP203-1 certificated firm recommended',
    evidenceRequired: 'Servicing certificate listing devices tested and any non-compliances',
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a fire detection and alarm system',
  }),
  entry({
    key: 'emergency_lighting_monthly',
    name: 'Emergency lighting — monthly function test',
    description: 'Short-duration function test of every emergency luminaire and exit sign.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 5266-1 / BS EN 50172, monthly function test. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) requires the premises and any facilities, equipment and devices provided in respect of them to be "maintained in an efficient state, in efficient working order and in good repair", under a suitable system of maintenance. The standard supplies the METHOD and the INTERVAL; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 30,
    maxIntervalDays: 31,
    responsibleParty: 'Responsible person or site staff',
    competencyRequired: 'Briefed site staff',
    evidenceRequired: 'Logbook entry per test, with any failed luminaires identified',
    handledBy: 'inspection',
    evidencedBy: 'inspection',
    appliesWhen: 'Building has emergency escape lighting',
  }),
  entry({
    key: 'emergency_lighting_annual',
    name: 'Emergency lighting — annual full-duration test',
    description: 'Full rated-duration discharge test (normally three hours), with luminaires recharged afterwards.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 5266-1, annual full-duration test. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) requires the premises and any facilities, equipment and devices provided in respect of them to be "maintained in an efficient state, in efficient working order and in good repair", under a suitable system of maintenance. The standard supplies the METHOD and the INTERVAL; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    responsibleParty: 'Emergency lighting contractor',
    competencyRequired: 'Competent electrical contractor',
    evidenceRequired: 'Annual test certificate recording the duration achieved per luminaire',
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has emergency escape lighting',
  }),
  entry({
    key: 'sprinkler_weekly_test',
    name: 'Suppression system — weekly test',
    description: 'Weekly test routine on the sprinkler or suppression system, including any pump run.',
    group: 'fire_safety',
    basis: 'contract',
    statutoryRef: 'LPC Rules; insurance policy condition',
    intervalBasis: 'stated',
    frequencyDays: 7,
    maxIntervalDays: 7,
    responsibleParty: 'Site staff',
    competencyRequired: 'Briefed site staff working to the system’s own test routine',
    evidenceRequired: 'Weekly test log with sign-off',
    handledBy: 'inspection',
    handlingNote: 'A weekly inspection walk; the insurer’s condition is what makes it binding.',
    evidencedBy: 'inspection',
    appliesWhen: 'Building has a sprinkler or other fixed suppression system',
  }),
  entry({
    key: 'sprinkler_annual_service',
    name: 'Suppression system — annual service',
    description: 'Annual service and test of the sprinkler or residential suppression system.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: '⚠ THE INSTALLED DESIGN BASIS IS NOT RECORDED. One of BS 9251 (residential sprinkler) or BS EN 12845 will govern, with any LPC Rules requirement on top — which applies here depends on how the system was designed and commissioned, and alternatives must not be left in a live row. ❓ Confirm the standard used for design and commissioning, the pump and tank arrangement, the servicing regime it sets, any insurer requirement, and whether any part falls within the statutory monthly reg 7 check. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) requires the premises and any facilities, equipment and devices provided in respect of them to be "maintained in an efficient state, in efficient working order and in good repair", under a suitable system of maintenance. The standard supplies the METHOD and the INTERVAL; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    responsibleParty: 'Suppression system contractor',
    competencyRequired: 'Competent sprinkler engineer (LPCB or BAFE SP203-4 certificated)',
    evidenceRequired: 'Annual service certificate, and pump test results where a pump is fitted',
    handledBy: 'maintenance',
    handlingNote: 'Insurance usually requires the LPC pass certificate as well as the service report.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a sprinkler or other fixed suppression system',
  }),
  entry({
    key: 'dry_riser_annual_test',
    name: 'Dry riser — annual pressure test',
    description: 'Annual wet pressure test of the riser main, landing valves and inlet breeching.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 9990, annual test. ⚠ THE ADOPTED EDITION AND SYSTEM-SPECIFIC METHOD ARE NOT RECORDED. ❓ Confirm the BS 9990 edition adopted for this installation, whether the annual test is correctly described as a wet pressure test and at what pressure and duration, the treatment of landing valves and the inlet breeching, the visual inspection interval, any fire and rescue service expectation, and the relationship to the statutory monthly reg 7 check — the riser is reg 6(7) key fire-fighting equipment, so the same asset is touched by both rows. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) requires the premises and any facilities, equipment and devices provided in respect of them to be "maintained in an efficient state, in efficient working order and in good repair", under a suitable system of maintenance. The standard supplies the METHOD and the INTERVAL; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    responsibleParty: 'Riser service contractor',
    competencyRequired: 'Competent dry riser engineer',
    evidenceRequired: 'Annual test certificate recording pressure held and duration',
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a dry (or wet) riser',
  }),
  entry({
    key: 'dry_riser_visual',
    name: 'Dry riser — six-monthly visual inspection',
    description: 'Visual inspection of inlets, outlets, cabinets and padlocks between annual tests.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 9990, six-monthly visual inspection. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) requires the premises and any facilities, equipment and devices provided in respect of them to be "maintained in an efficient state, in efficient working order and in good repair", under a suitable system of maintenance. The standard supplies the METHOD and the INTERVAL; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 182,
    maxIntervalDays: 183,
    responsibleParty: 'Responsible person or riser contractor',
    competencyRequired: 'Briefed site staff or riser engineer',
    evidenceRequired: 'Inspection record noting condition and any missing components',
    handledBy: 'inspection',
    evidencedBy: 'inspection',
    appliesWhen: 'Building has a dry (or wet) riser',
  }),
  entry({
    key: 'extinguishers_annual_service',
    name: 'Fire extinguishers — annual basic service',
    description: 'Basic service of every portable extinguisher by a competent technician.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 5306-3, basic service. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) requires the premises and any facilities, equipment and devices provided in respect of them to be "maintained in an efficient state, in efficient working order and in good repair", under a suitable system of maintenance. The standard supplies the METHOD and the INTERVAL; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    responsibleParty: 'Extinguisher service contractor',
    competencyRequired: 'Competent extinguisher technician (BAFE SP101 registered)',
    evidenceRequired: 'Service certificate and per-unit service labels',
    handledBy: 'maintenance',
    handlingNote: 'Absent from the Lancaster register — worth feeding back to its author.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has portable fire extinguishers in the common parts',
  }),
  entry({
    key: 'smoke_control_service',
    name: 'Smoke control / AOV system — service',
    description:
      'Service and functional test of the AOV smoke control system serving the staircase, including the '
      + 'vents, the control panel and any smoke shaft.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS EN 12101 (product and system series) and BS 7346-8 (smoke control), periodic servicing. ⚠ Neither alone prescribes the service interval for a particular installation — six-monthly is the building’s adopted interval, to be confirmed against the design specification, the commissioning information, the manufacturer’s requirements and the fire strategy. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) requires the premises and any facilities, equipment and devices provided in respect of them to be "maintained in an efficient state, in efficient working order and in good repair", under a suitable system of maintenance. The standard supplies the METHOD and the INTERVAL; art 17 is why the measure must work at all.',
    intervalBasis: 'practice',
    frequencyDays: 182,
    // ⚠ `maxIntervalDays: 366` removed 2026-09-13 on external review, which
    // caught the contradiction: a six-monthly chosen cycle cannot have a
    // twelve-month "maximum permitted interval" — nothing permits it, because
    // no instrument sets one. A servicing standard is not a legal ceiling, and
    // printing one invented a limit that does not exist.
    triggerType: 'calendar',
    reviewerNote: 'Six-monthly servicing is the technical regime and is not a legal maximum. Separately, the detectors linked to this system fall within the MONTHLY statutory check — servicing does not discharge that.',
    responsibleParty: 'Smoke control contractor',
    competencyRequired: 'Competent smoke control engineer (Smoke Control Association member firm recommended)',
    evidenceRequired: 'Service certificate recording each vent and control panel tested',
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    // ⚠ NOT INSTALLED TODAY. The building's two staircases are ventilated by
    // openable windows; a mechanical smoke control system is expected but is
    // not in place. This row therefore states the CONDITION and is switched off
    // by a recorded exclusion, not deleted and not asserted — see the paired
    // row for openable windows, and the header of this file on why.
    reviewerNote: 'PAIRED WITH the openable-window row: a stair is smoke-ventilated mechanically or naturally, and this register carries both so that either can be switched on. ⚠ No mechanical smoke control system is installed at present, so this row is currently recorded as not applicable; that decision carries a review date and is reversed — not re-written — when a system is commissioned. Six-monthly servicing is our adopted interval and not a figure either standard sets for every installation; confirm it against the system’s design, commissioning record, manufacturer requirements and the fire strategy at that point.',
    appliesWhen: 'A mechanical smoke control or automatic opening vent system serves a stair, lobby or corridor. ⚠ Not the case today — recorded as not applicable, to be reinstated when a system is commissioned',
  }),
  // ⚠ ADDED 2026-09-13. It emerged from a fact rather than from a review: the
  // second staircase is ventilated by OPENABLE WINDOWS, and that is accepted as
  // sufficient. A provision that is relied on has to be verified, and nothing
  // in this register verified it — the smoke control row covers the AOV on the
  // other stair only. A window painted shut, obstructed, locked or restricted
  // is a failed smoke ventilation provision that looks like a window.
  entry({
    key: 'stair_openable_vent_check',
    reviewerNote:
      'This row exists because one staircase is ventilated by openable windows rather than by an AOV, '
      + 'and that arrangement is accepted as sufficient. Acceptance is conditional on the windows '
      + 'still opening. ⚠ The failure modes are quiet and cumulative — paint, sealant, a replaced '
      + 'handle, a security restrictor fitted in good faith, furniture or stored items in front of '
      + 'the opening, a stiff mechanism nobody reports because nobody opens it in the ordinary way. '
      + 'None of them announces itself, and none is visible in a check that only looks at the stair. '
      + '⛔ PRECONDITION, not an improvement: this row cannot be relied on until the approved fire '
      + 'strategy’s requirements are recorded — which storeys carry the windows, the free area and the '
      + 'opening each must achieve, whether they are manual or automatic, how they operate in a fire, '
      + 'who has access to them, what counts as a failure, who accepted the arrangement and on what '
      + 'evidence, and the responsible technical authority. Checking that a window "opens" is not a '
      + 'check until "open" has a defined value to test against. '
      + '❓ Separately: whether these windows fall within the FSER reg 7 monthly check as part of the '
      + 'smoke control provision. ⛔ Do NOT classify them as reg 7 equipment until the responsible '
      + 'person or a competent fire engineer has made and recorded that determination.',
    name: 'Stair smoke ventilation — natural, by openable windows',
    description:
      'Check that the openable windows relied on for smoke ventilation of the staircase still open '
      + 'fully and freely, are not painted, sealed or locked shut, are not obstructed, and achieve the '
      + 'opening the fire strategy requires. Record any restrictor fitted and whether it prevents the '
      + 'required opening.',
    group: 'fire_safety',
    // Legislation, not a standard. Art 17 of the fire safety order imposes the
    // duty to maintain a fire safety measure in efficient working order; the
    // fire strategy determines WHAT the measure is and what it must achieve.
    // Classing it as a standard because the method comes from the strategy
    // confuses the method with the duty — and this register exists to keep
    // those apart. The six-monthly interval remains ours: nothing prescribes it.
    basis: 'statute',
    statutoryRef: 'Regulatory Reform (Fire Safety) Order 2005, art 17 — the duty to keep a fire safety measure in efficient working order and good repair. The building’s approved fire strategy accepts natural ventilation by openable windows for this staircase in place of a mechanical system, and determines what the measure must achieve. ⚠ Neither prescribes a check interval',
    intervalBasis: 'practice',
    frequencyDays: 182,
    triggerType: 'calendar',
    responsibleParty: 'Site staff or fire safety contractor',
    competencyRequired: 'Person who knows what opening the fire strategy requires — not simply that the window moves',
    evidenceRequired: 'Per-window record of the opening achieved, any obstruction or restrictor found, and the rectification',
    retentionPeriodMonths: 60,
    handledBy: 'inspection',
    handlingNote:
      'Suits an inspection walk scoped to the stair windows, alongside the existing stair checks. '
      + '⚠ Six-monthly matches the AOV servicing on the other stair deliberately — the two provisions '
      + 'do the same job and there is no reason to verify one more often than the other. The interval '
      + 'is ours; nothing sets it.',
    evidencedBy: 'inspection',
    appliesWhen: 'A staircase relies on openable windows for smoke ventilation. ⚠ True of both staircases today; reconsider per stair if a mechanical system is commissioned for either',
  }),
  entry({
    key: 'fser_monthly_equipment_check',
    reviewerNote:
      'Reg 7(1) is ONE statutory duty over three things — firefighters’ lifts, evacuation lifts and '
      + '"essential fire-fighting equipment". It is carried on two rows here because two different walks '
      + 'do it, NOT because there are two legal cycles. This row names the reg 6(7) equipment explicitly '
      + 'so that "show me the monthly statutory check for the dry riser" has one unambiguous answer. '
      + 'Two things attach to the check and are easy to lose: the record must be made ACCESSIBLE TO '
      + 'RESIDENTS (reg 7(4)), and a fault not rectified within 24 hours must be reported to the fire and '
      + 'rescue authority electronically — AND its rectification reported when it is fixed (reg 7(3)).'
      + ' ⚠ The 31-day figure is an INTERNAL SCHEDULING LIMIT and does not alter the statutory requirement, which is to carry out the check monthly. Do not copy it into a procedure as though it were the legal interval.',
    name: 'Monthly check — firefighters’ lifts, evacuation lifts, rising mains, smoke control and suppression',
    description:
      'Monthly routine check of each INSTALLED item falling within the reg 6(7) key fire-fighting '
      + 'equipment definition, together with each lift for use by firefighters and each evacuation '
      + 'lift. The asset schedule must name the precise reg 6(7) sub-paragraph for every item it '
      + 'lists — (a) to (f) — with its asset identifier and location, so that scope is settled by '
      + 'the '
      + 'definition rather than by a general description of what seems important. Where a fault '
      + 'cannot be rectified within 24 hours it must be reported to the fire and rescue authority by '
      + 'electronic means, and its rectification reported in the same way once fixed.',
    group: 'fire_safety',
    basis: 'statute',
    // Named per reg 6(7) after the third review round. "Essential fire-fighting
    // equipment" at reg 7(5) is key fire-fighting equipment as defined by
    // reg 6(7) — rising main inlets and outlets, smoke control, suppression —
    // PLUS the common-parts systems on the next row. Verified against
    // legislation.gov.uk 2026-09-13; reg 7(1)(a)–(b) alone did not reach them.
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 7(1). "Essential fire-fighting equipment" is defined at reg 7(5) by reference to reg 6(7), which reads: "In this regulation \'key fire-fighting equipment\' INCLUDES — (a) inlets for dry-rising mains; (b) inlets for wet-rising mains; (c) outlets for dry-rising mains; (d) outlets for wet-rising mains; (e) smoke control systems; (f) suppression systems." ⚠ "Includes" — the list is a floor, not a ceiling. Fault reporting reg 7(3); record and resident access reg 7(4)',
    intervalBasis: 'stated',
    frequencyDays: 30,
    maxIntervalDays: 31,
    // ⚠ 31 days is OUR control limit, not a statutory ceiling. Reg 7(1) says
    // "monthly routine checks" and expresses no permitted maximum in days.
    maxIsSchedulingTolerance: true,
    triggerType: 'calendar',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Competent person familiar with the installed equipment',
    evidenceRequired:
      'Monthly check record naming each item checked, made accessible to residents (reg 7(4)); separate '
      + 'record of any 24-hour fault report to the fire and rescue authority AND of the rectification '
      + 'report that closes it',
    handledBy: 'inspection',
    handlingNote:
      '⚠ Two things attached to this check have NO home in the portal: the 24-hour FAULT REPORT and the '
      + 'RECTIFICATION report that closes it (both event-driven deadlines, not cycles), and the duty to '
      + 'make the record accessible to residents — the Info app could publish it, nothing does today. '
      + 'Still open.',
    evidencedBy: 'inspection',
    appliesWhen: 'Always — the building is a high-rise residential building for these Regulations',
  }),
  // ⚠ SPLIT OUT 2026-09-13 on external review, which called this the largest
  // operational omission — and it was right. One row named "firefighting
  // equipment and facilities" read as though reg 7 covered lifts and hose
  // reels. It does not: reg 7(5) defines essential fire-fighting equipment as
  // key fire-fighting equipment (reg 6(7)) PLUS, in the common parts, fire
  // detection and alarm systems including detectors linked to smoke control,
  // evacuation alert systems, and automatic door release mechanisms.
  //
  // ⚠ AND THE TRAP THE REVIEWER NAMED: the weekly alarm test, the six-monthly
  // alarm service and the six-monthly smoke-control service DO NOT discharge
  // this. They are maintenance under their own standards. The monthly check is
  // a separate statutory duty on the responsible person.
  entry({
    key: 'fser_monthly_systems_check',
    name: 'Monthly check — detection, alarm and linked systems',
    description:
      'Monthly routine check that the fire detection and alarm system, any detectors linked to smoke '
      + 'control, evacuation alert systems and automatic door release mechanisms in the common parts are '
      + 'in efficient working order and good repair.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 7(1); reg 7(5) defines "essential fire-fighting equipment" as key fire-fighting equipment (reg 6(7)) "and any of the following located within the common parts of the building — (a) fire detection and fire alarm systems including any detectors linked to ancillary equipment such as smoke control systems, (b) evacuation alert systems, (c) automatic door release mechanisms linked to fire alarm systems"; "routine check" is defined in the same paragraph as a check that the equipment is in efficient working order and good repair, carried out in accordance with the relevant industry standard or the manufacturer\'s recommendations; fault reporting reg 7(3); record and resident access reg 7(4)',
    intervalBasis: 'stated',
    frequencyDays: 30,
    maxIntervalDays: 31,
    // See the preceding row: our control limit, not a statutory ceiling.
    maxIsSchedulingTolerance: true,
    triggerType: 'calendar',
    reviewerNote:
      'The other half of the single reg 7(1) duty — see the preceding row; two walks, not two legal '
      + 'cycles. This does NOT replace the weekly alarm test or the six-monthly alarm and smoke-control '
      + 'servicing, and they do not replace it — those are maintenance under their own standards, this '
      + 'is a statutory monthly check by the responsible person. The record must be made accessible to '
      + 'residents (reg 7(4)); a fault not rectified within 24 hours must be reported to the fire and '
      + 'rescue authority, and its rectification reported when fixed (reg 7(3)). '
      + '⚠ These three systems belong to the STATUTORY check, not to a separate standards-based one: '
      + 'reg 7(5)(a)–(c) names all three expressly. The qualifier that does apply is narrower and is '
      + 'in the applicability — the definition reaches them "located within the common parts of the '
      + 'building", so it is the location of each installed system that decides, not how '
      + 'safety-critical it is.'
      + ' ⚠ The 31-day figure is an INTERNAL SCHEDULING LIMIT and does not alter the statutory requirement, which is to carry out the check monthly. Do not copy it into a procedure as though it were the legal interval.',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Competent person familiar with the installed systems',
    evidenceRequired:
      'Monthly check record per system, made accessible to residents (reg 7(4)); separate record of any '
      + '24-hour fault report AND of the rectification report that closes it',
    handledBy: 'inspection',
    handlingNote: 'An inspection walk scoped to the alarm panel, linked detectors, evacuation alert and door releases.',
    evidencedBy: 'inspection',
    appliesWhen: 'Where each system is located within the COMMON PARTS — that is the test in reg 7(5), applied per installed system. The building has a detection and alarm system in the common parts',
  }),
  entry({
    key: 'carpark_smoke_ventilation_service',
    reviewerNote:
      'PAIRED WITH the natural-ventilation row below: a car park is ventilated mechanically or '
      + 'naturally, and the register carries both so that either can be switched on. ⚠ This building '
      + 'has NO mechanical car park ventilation — the basement is open to outside air — so this row '
      + 'is one to record as not applicable, with that reason. It is here so the absence reads as a '
      + 'decision rather than an oversight, and so it can be switched on without re-drafting if the '
      + 'perimeter is ever enclosed.',
    name: 'Car park smoke ventilation — mechanical system service',
    description:
      'Service and functional test of a mechanical car park smoke ventilation system — impulse or '
      + 'ducted fans, dampers, the control panel and the fire-mode changeover — against the design '
      + 'and commissioning basis.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 7346-7 (smoke control in car parks) and the system’s design and commissioning basis, which set the servicing regime. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) requires the premises and any facilities, equipment and devices to be "maintained in an efficient state, in efficient working order and in good repair"',
    intervalBasis: 'practice',
    frequencyDays: 182,
    triggerType: 'calendar',
    responsibleParty: 'Smoke control contractor',
    competencyRequired: 'Competent smoke control engineer familiar with car park systems',
    evidenceRequired: 'Service certificate recording each fan, damper and control tested, and the fire-mode changeover proved',
    retentionPeriodMonths: 60,
    handledBy: 'maintenance',
    handlingNote: 'Nothing to schedule while the car park is naturally ventilated. Record the not-applicable decision rather than leaving the row unanswered.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'The car park has a mechanical smoke ventilation system. ⚠ Not the case today — the basement is open to outside air',
  }),
  entry({
    key: 'carpark_natural_ventilation_check',
    reviewerNote:
      '⚠ IF THE OPENINGS ARE THE PROVISION, THE OPENINGS ARE THE FIRE SAFETY MEASURE — the same '
      + 'point as the staircase windows, and the same failure mode. Being "open to outside air" is a '
      + 'designed free area at designed locations, not a general impression: it is lost by degrees, '
      + 'to stored items and bin stores and bike racks against a grille, to security mesh or '
      + 'hoarding, to a later enclosure of the perimeter, or to a cladding or landscaping change that '
      + 'nobody connected with ventilation. None of that announces itself. '
      + '❓ Confirm what the fire strategy or the Building Regulations approval actually requires — '
      + 'the free area, at which locations, and whether the car park qualifies as open-sided — '
      + 'because "unobstructed" cannot be checked until there is a figure to check against. If the '
      + 'openings are permanent structural voids that genuinely cannot be obstructed, record that as '
      + 'the reason and exclude the row.',
    name: 'Car park natural ventilation — openings remain as designed',
    description:
      'Confirm that the permanent ventilation openings the car park relies on remain open, '
      + 'unobstructed and of the free area the design requires, and that nothing stored, built or '
      + 'fixed has reduced them.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Regulatory Reform (Fire Safety) Order 2005, art 17(1) — the premises and any facilities, equipment and devices provided in respect of them must be "maintained in an efficient state, in efficient working order and in good repair". The free area and its locations come from the fire strategy and the Building Regulations approval, not from the Order, and the interval is ours',
    intervalBasis: 'practice',
    frequencyDays: 182,
    triggerType: 'calendar',
    responsibleParty: 'Site staff or fire safety contractor',
    competencyRequired: 'Person who knows the required free area and its locations — not simply that the space feels open',
    evidenceRequired: 'Record per opening of what was found and of any obstruction cleared, against the designed free area',
    retentionPeriodMonths: 60,
    handledBy: 'inspection',
    handlingNote: 'Suits an inspection walk of the basement perimeter. Six-monthly matches the service interval a mechanical system would carry — the two provisions do the same job.',
    evidencedBy: 'inspection',
    appliesWhen: 'The car park relies on permanent openings to outside air for its ventilation rather than on a mechanical system',
  }),
  entry({
    key: 'fser_wayfinding_signage',
    name: 'Wayfinding signage — check',
    description: 'Check wayfinding signage identifying floor and flat numbers is present, legible and visible in low light.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 8; BS ISO 7010',
    intervalBasis: 'practice',
    frequencyDays: 30,
    responsibleParty: 'Responsible person or site staff',
    competencyRequired: 'Briefed site staff',
    evidenceRequired: 'Walk-around log per floor, with any missing or illegible signs',
    handledBy: 'inspection',
    evidencedBy: 'inspection',
    appliesWhen: 'Always — the building is a high-rise residential building (FSER 2022 reg 3: at least 18 metres or at least 7 storeys, with two or more sets of domestic premises)',
  }),
  entry({
    key: 'pib_monthly_check',
    name: 'Premises information box — monthly check',
    description: 'Check the box is present, secure and accessible, and that the lock works.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 4(5) (annual minimum); reg 4(2) for what the box must be',
    intervalBasis: 'practice',
    frequencyDays: 30,
    responsibleParty: 'Responsible person or site staff',
    competencyRequired: 'Briefed site staff',
    evidenceRequired: 'Monthly inspection log',
    handledBy: 'inspection',
    handlingNote:
      'Reg 4(5) sets the statutory floor at “at least annually”. Monthly is our own choice and exceeds it — '
      + 'the annual duty is discharged by the content review below.',
    evidencedBy: 'inspection',
    appliesWhen: 'Always — the building is a high-rise residential building (FSER 2022 reg 3: at least 18 metres or at least 7 storeys, with two or more sets of domestic premises)',
  }),
  entry({
    key: 'pib_content_review',
    name: 'Premises information box — content review',
    description: 'Confirm the contents are current: the responsible person’s contact details and hard-copy floor plans.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 4(5); contents reg 4(3); access for the fire and rescue authority reg 4(4)',
    intervalBasis: 'stated',
    frequencyDays: 365,
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person who can confirm the plans against the building as built',
    evidenceRequired: 'Content version record; superseded contents withdrawn',
    handledBy: 'golden_thread',
    handlingNote: 'The plans and contact sheet are controlled documents; the box holds the current version.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always — the building is a high-rise residential building (FSER 2022 reg 3: at least 18 metres or at least 7 storeys, with two or more sets of domestic premises)',
  }),
  // ⚠ SPLIT INTO TWO 2026-09-13, third review round, and the reviewer's reason
  // is the important part: an annual confirmation must not be allowed to read
  // as the trigger. Reg 6(6) requires the plans to be updated as soon as
  // reasonably practicable after a change to the LAYOUT of the building or the
  // LOCATION of key fire-fighting equipment. That is the duty. The annual pass
  // is ours, and it is a net for a change nobody told us about — not the
  // obligation itself. This also connects visibly to the building-work
  // screening control, which exists to catch such changes before they happen.
  entry({
    key: 'frs_plans_update_on_change',
    reviewerNote:
      'This is the statutory duty; the annual confirmation on the next row is our own assurance net and '
      + 'must not be mistaken for the trigger. ⚠ Reg 11 requires the reg 6 plans to be provided to the '
      + 'fire and rescue authority by electronic means. Read with reg 6(6) an updated plan is the reg 6 '
      + 'plan and so goes the same way — but note that reg 11 does not in terms spell out re-provision '
      + 'of a revised version, so we treat re-issue as required rather than relying on it being stated.',
    name: 'Fire and rescue service plans — update on change',
    description:
      'Update the floor plans and the building plan as soon as reasonably practicable after any change '
      + 'to the layout of the building or to the location of key fire-fighting equipment, place the '
      + 'revised hard copies in the secure information box, and re-issue to the fire and rescue '
      + 'authority by electronic means.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 6(6) (update as soon as reasonably practicable after a change of layout or of the location of key fire-fighting equipment); reg 6(5) (hard copies in the secure information box); reg 11 (provide to the fire and rescue authority by electronic means)',
    intervalBasis: 'stated',
    frequencyDays: null,
    trigger: 'Any change to the layout of the building, or to the location of key fire-fighting equipment — rising main inlets and outlets, smoke control, suppression',
    triggerType: 'event',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person who can confirm the plans against the building as built',
    evidenceRequired: 'The revised plans, dated; proof of electronic re-issue to the fire and rescue authority; record of the hard copies placed in the secure information box',
    retentionPeriodMonths: 120,
    handledBy: 'building_assets',
    handlingNote:
      '⚠ Nothing detects the trigger. The plans are Building Assets floor plans and the building-work '
      + 'screening control is meant to catch layout changes before they happen — but the two are not '
      + 'wired together, so this depends on a person raising it.',
    evidencedBy: null,
    appliesWhen: 'Always — the building is a high-rise residential building (FSER 2022 reg 3: at least 18 metres or at least 7 storeys, with two or more sets of domestic premises)',
  }),
  entry({
    key: 'frs_plans_current',
    reviewerNote: 'This annual pass is OUR control, not a statutory cycle — the statutory duty is the event-driven update on the preceding row. It exists to catch a change nobody told us about. ⚠ Deliberately framed as confirming what WE sent and what the box holds, not what the fire and rescue authority currently holds: we cannot see their records, and nothing requires them to reconfirm annually. Writing it the other way would invent a duty for them and a dependency for us.',
    name: 'Fire and rescue service plans — annual confirmation',
    description:
      'Confirm that the current floor plans and building plan have been provided to the fire and '
      + 'rescue authority, that the transmission was acknowledged where an acknowledgement is '
      + 'obtainable, and that the hard copies in the secure information box match the current approved '
      + 'versions.',
    group: 'fire_safety',
    // Re-based 2026-09-13: reg 6 states no calendar interval, so calling this
    // row "statute" put a legal badge on a cycle we invented. The duty is the
    // event-driven row above; this is the assurance control over it.
    basis: 'management',
    statutoryRef: 'Our own assurance control over the duty at FSER 2022 reg 6(6); no interval is stated anywhere in the Regulations',
    intervalBasis: 'practice',
    frequencyDays: 365,
    triggerType: 'calendar',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person who can confirm the plans against the building as built',
    evidenceRequired: 'Record of the check and of any re-issue to the fire and rescue service',
    handledBy: 'building_assets',
    handlingNote: 'The plans themselves are Building Assets floor plans; re-issue is a manual step.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always — the building is a high-rise residential building (FSER 2022 reg 3: at least 18 metres or at least 7 storeys, with two or more sets of domestic premises)',
  }),
  // ── The 2025 residential evacuation regime (SI 2025/797, in force 6 Apr 2026)
  // Added 2026-09-13 after external review. See the header note on why the
  // PEEP-content exclusion does NOT exclude these duties.
  //
  // ⚠ WIDENED in the third review round, and the reviewer's framing was exact:
  // "your current row starts at step 6." SI 2025/797 is a PROCESS, not a pair
  // of annual reviews. Verified against the instrument's own contents page:
  //
  //   reg 5  identification of relevant residents
  //   reg 6  person-centred fire risk assessment
  //   reg 7  mitigation of risks
  //   reg 8  emergency evacuation statement
  //   reg 9  review by the responsible person        ← we had only this
  //   reg 10 provision of information to the local fire and rescue authority
  //   reg 11 relevant resident's representative
  //   reg 12 data protection
  //   reg 13 building emergency evacuation plan      ← and the review half of this
  //
  // The four rows below close regs 5–8, 10 and 13's preparation duty.
  //
  // ⛔ THEY DO NOT REOPEN THE RESIDENT-DATA DECISION, and must not be built as
  // if they did. Each is an INTERFACE row: this system holds only whether the
  // process exists, whether it is current, who owns it, the date it was last
  // confirmed, and any recorded exception. The assessments themselves, the
  // statements, the residents they concern and the flat/floor/assistance
  // details that reg 10 puts into the fire and rescue authority's hands stay in
  // the system that governs health data — which is the whole point of reg 12.
  entry({
    key: 'evac_resident_identification',
    reviewerNote:
      'The duty begins long before the annual review: reasonable endeavours to identify relevant '
      + 'residents (reg 5), an offer of a person-centred fire risk assessment, and one carried out where '
      + 'the resident asks (reg 6). We confirm the process is operated; we do not hold its contents.',
    name: 'Residential evacuation — identification and assessment interface',
    description:
      'Confirm that the responsible person operates the statutory process for identifying relevant '
      + 'residents and for offering and carrying out person-centred fire risk assessments. What crosses '
      + 'to this system is that the process exists, is current, who owns it and the date last confirmed '
      + '— never who the residents are or what any assessment says.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (Residential Evacuation Plans) (England) Regulations 2025 (SI 2025/797), reg 5 (identification of relevant residents) and reg 6 (person-centred fire risk assessment)',
    intervalBasis: 'practice',
    frequencyDays: 365,
    triggerType: 'calendar',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person able to confirm the process is operated, without seeing its contents',
    evidenceRequired: 'Dated confirmation from the responsible person that the process is operated — NOT the resident list and NOT any assessment',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote:
      '⛔ INTERFACE ONLY — see Resident_System_Interface.md. No home in the portal: it needs the '
      + 'confirmation channel, which is X1/X2 work, not code here. The annual cadence is OURS — the '
      + 'Regulations state no interval for regs 5–6, the duty is continuous.',
    evidencedBy: null,
    appliesWhen: 'The building is a "specified residential building" under SI 2025/797 reg 3. The building-level duty applies throughout the period the building is a specified residential building; the resident-specific steps arise when the statutory identification, request, assessment or review conditions apply',
  }),
  entry({
    key: 'evac_mitigation_statements',
    reviewerNote:
      'Regs 7 and 8 are where the process produces something: mitigating measures that are reasonable '
      + 'and proportionate, and an emergency evacuation statement agreed and recorded where that is '
      + 'possible. A register that jumps from "assessment offered" to "reviewed annually" skips the part '
      + 'that actually protects the resident.',
    name: 'Residential evacuation — mitigation and evacuation statement interface',
    description:
      'Confirm that required mitigating measures and emergency evacuation statements are being '
      + 'determined, recorded and kept current by the responsible person. This system holds the fact and '
      + 'the date, not the measures or the statements.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (Residential Evacuation Plans) (England) Regulations 2025 (SI 2025/797), reg 7 (mitigation of risks) and reg 8 (emergency evacuation statement)',
    intervalBasis: 'practice',
    frequencyDays: 365,
    triggerType: 'calendar',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person able to confirm the process is operated, without seeing its contents',
    evidenceRequired: 'Dated confirmation that measures and statements are in place and current, with any recorded exception — NOT the measures or the statements',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⛔ INTERFACE ONLY. No home in the portal; the annual cadence is ours, the underlying duty is continuous.',
    evidencedBy: null,
    appliesWhen: 'The building is a "specified residential building" under SI 2025/797 reg 3. The building-level duty applies throughout the period the building is a specified residential building; the resident-specific steps arise when the statutory identification, request, assessment or review conditions apply',
  }),
  entry({
    key: 'evac_frs_information',
    reviewerNote:
      '⚠ CONSENT IS PART OF THE DUTY, not a courtesy — but it does not gate everything equally, and '
      + 'the workflow has to tell the limbs apart. It must identify which prescribed information the '
      + 'responsible person must provide, which may be provided ONLY with the resident’s explicit '
      + 'consent, what happens where consent is refused or later withdrawn, and the lawful basis for '
      + 'any other processing — and it must PREVENT disclosure where the required consent is absent. '
      + 'This register holds interface evidence, never the prescribed personal details. '
      + '❓ Reg 10(2) and reg 12 should be read by the responsible person’s privacy adviser before '
      + 'this is operated; we have not taken that advice and are not substituting for it.',
    name: 'Residential evacuation — fire and rescue authority information interface',
    description:
      'Confirm that the statutory information-sharing process with the fire and rescue authority is '
      + 'operated, including obtaining and recording the resident’s explicit consent where the '
      + 'information can only be provided with it. This system records that the process runs and when it '
      + 'was last confirmed; the prescribed resident details never enter it.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (Residential Evacuation Plans) (England) Regulations 2025 (SI 2025/797), reg 10 (provision of information to the local fire and rescue authority), with reg 12 (data protection)',
    intervalBasis: 'practice',
    frequencyDays: 365,
    triggerType: 'calendar',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person able to confirm the process is operated, without seeing its contents',
    evidenceRequired: 'Dated confirmation that the information-sharing process is operated and that consent is obtained and recorded where required — NOT the information itself',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⛔ INTERFACE ONLY. No home in the portal; the annual cadence is ours, the underlying duty is continuous.',
    evidencedBy: null,
    appliesWhen: 'The building is a "specified residential building" under SI 2025/797 reg 3. The building-level duty applies throughout the period the building is a specified residential building; the resident-specific steps arise when the statutory identification, request, assessment or review conditions apply',
  }),
  // The PREPARATION half of reg 13. The review half is the row after it. These
  // are separated because the reviewer was right that a review row alone reads
  // as though the plan already exists — and for a building that has not yet
  // prepared one, the first duty is not a review.
  entry({
    key: 'evac_building_plan_prepare',
    reviewerNote: 'Distinct from the annual review: reg 13 first requires the plan to be PREPARED, provided to the local fire and rescue authority, and a copy placed in the secure information box where the building has one.',
    name: 'Building emergency evacuation plan — prepare and issue',
    description:
      'Prepare the building emergency evacuation plan, provide it to the local fire and rescue '
      + 'authority, and place a copy in the secure information box. The same steps follow every '
      + 'amendment made as a result of a review.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (Residential Evacuation Plans) (England) Regulations 2025 (SI 2025/797), reg 13 — prepare the plan, provide it to the local fire and rescue authority, and place a copy in the secure information box',
    intervalBasis: 'stated',
    frequencyDays: null,
    trigger: 'First preparation of the plan, and every amendment arising from a review',
    triggerType: 'event',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person competent to write the plan against the building’s evacuation strategy',
    evidenceRequired: 'The plan itself, dated; proof of issue to the fire and rescue authority; record of the copy placed in the secure information box',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    handlingNote: 'A controlled document — it belongs in the Golden Thread register alongside its reviews. It holds no resident personal data.',
    evidencedBy: null,
    appliesWhen: 'The building is a "specified residential building" under SI 2025/797 reg 3 — two or more sets of domestic premises AND at least 18 metres, or at least seven storeys, or more than 11 metres with a simultaneous evacuation strategy',
  }),
  entry({
    key: 'evac_building_plan_review',
    reviewerNote: 'Reg 13 also requires a review whenever there is reason to believe the plan needs amending — the 12-month cycle is a floor, not the only trigger. The plan holds no resident personal data.',
    name: 'Building emergency evacuation plan — review',
    description:
      'Review the building-level emergency evacuation plan and confirm it remains consistent with the '
      + 'current evacuation strategy and the information held by the fire and rescue authority. Amended '
      + 'plans go to the fire and rescue authority and into the secure information box.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (Residential Evacuation Plans) (England) Regulations 2025 (SI 2025/797), reg 13 — "no later than 12 months after the date on which the plan is first prepared, and before the end of every period of 12 months thereafter"',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    triggerType: 'calendar',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person able to confirm the plan against the current fire strategy',
    evidenceRequired: 'Dated reviewed plan; proof of issue to the fire and rescue authority and of the copy placed in the secure information box',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    handlingNote:
      'A controlled document — it belongs in the register with its own review date. **It holds no resident '
      + 'personal data**: it records whether relevant residents exist, not who they are. '
      + '⚠ Reg 13 also requires a review whenever there is reason to believe the plan needs amending — the '
      + '12-month cycle is a floor, not the only trigger.',
    evidencedBy: null,
    appliesWhen: 'The building is a "specified residential building" under SI 2025/797 reg 3 — two or more sets of domestic premises AND at least 18 metres, or at least seven storeys, or more than 11 metres with a simultaneous evacuation strategy',
  }),
  entry({
    key: 'evac_person_centred_review',
    reviewerNote: 'INTERFACE ONLY — an RP-controlled record, deliberately not held in this system; what crosses is the dated confirmation that the review happened. Reg 9 also triggers on reason to believe an assessment needs amending and at the reasonable request of the resident, and an early review restarts the 12 months.',
    name: 'Person-centred evacuation arrangements — review',
    description:
      'Confirm that the responsible person has reviewed each person-centred fire risk assessment, the '
      + 'mitigating measures required with it, and each emergency evacuation statement.',
    group: 'fire_safety',
    basis: 'statute',
    // Narrowed 2026-09-13: this row used to cite "regs 5–10", which claimed
    // coverage of the whole process while describing only the review. Regs 5–8
    // and reg 10 now have their own rows; this is reg 9 and nothing else.
    statutoryRef: 'Fire Safety (Residential Evacuation Plans) (England) Regulations 2025 (SI 2025/797), reg 9 — review by the responsible person, every 12 months',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    triggerType: 'calendar',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person competent to carry out a person-centred fire risk assessment',
    evidenceRequired: 'Confirmation that the review happened and when — NOT the assessments themselves',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote:
      '⛔ INTERFACE ONLY — an RP-controlled record, deliberately not held in this system. What crosses is '
      + 'the fact that the review is due, and the dated confirmation that it happened; the assessments, the '
      + 'statements and the residents they concern stay in the system that governs health data. '
      + '⚠ Reg 9 also triggers on reason to believe an assessment needs amending and **at the reasonable '
      + 'request of the resident**, and an early review restarts the 12 months. Nothing here detects either.',
    evidencedBy: null,
    appliesWhen: 'The building is a "specified residential building" under SI 2025/797 reg 3. The building-level duty applies throughout the period the building is a specified residential building; the resident-specific steps arise when the statutory identification, request, assessment or review conditions apply',
  }),
  // Found 2026-09-11 while verifying the FSER citations against
  // legislation.gov.uk — the register held no entry for reg 5 at all. It is
  // event-driven rather than a cycle, which is presumably why it was missed:
  // the register was built from a list of *periodic* activities. A duty that
  // recurs on an event is still a duty, and an absent one is indistinguishable
  // from one nobody thought of.
  entry({
    key: 'fser_external_wall_record',
    reviewerNote:
      'Reg 5(3) fires on a significant change to the external walls. Nothing detects that automatically '
      + '— it depends on someone raising it when works complete. ⚠ The record is not just a description '
      + 'of the build-up: reg 5(2) requires it to carry the level of risk the fire risk assessment '
      + 'identifies from that design and those materials, and the mitigating steps taken. A record '
      + 'without those two is incomplete as a matter of law.',
    name: 'External wall record — revise after significant change',
    description:
      'Maintain the record of the external walls’ design and materials, INCLUDING the level of risk that '
      + 'the fire risk assessment identifies as arising from that design and those materials and the '
      + 'steps taken to mitigate it, and prepare a revised record after any significant change to them. '
      + 'The record goes to the fire and rescue authority by electronic means.',
    group: 'fire_safety',
    basis: 'statute',
    // The risk level and mitigating steps are reg 5(2) and were missing until
    // the third review round — a content omission, not a wording one. Verified
    // against legislation.gov.uk 2026-09-13: 5(1) the record, 5(2) what it must
    // contain, 5(3) revision on significant change, reg 11 provision to the
    // fire and rescue authority by electronic means.
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 5(1) (the record), reg 5(2) (risk level from the FRA and mitigating steps), reg 5(3) (revision on significant change), reg 11 (provide to the fire and rescue authority by electronic means)',
    intervalBasis: 'stated',
    trigger: 'Any significant change to the external walls — recladding, balcony works, insulation, render',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person able to describe the wall build-up and materials accurately, working from the current fire risk assessment',
    evidenceRequired: 'The record itself, dated, carrying the design and materials, the FRA risk level and the mitigating steps, with each revision retained and proof of electronic provision to the fire and rescue authority',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    handlingNote:
      'The record is a controlled document and belongs in the Golden Thread register. '
      + '⚠ Nothing detects the trigger — reg 5(3) fires on a change to the building, and no part of '
      + 'the portal watches for one. The building-work screening row is where it must be caught: '
      + 'whoever proposes or approves work to the external walls has to decide whether it is a '
      + 'significant change and route the completed work to this record and to the re-provision to '
      + 'the fire and rescue authority. Until those two rows are wired together it depends on a '
      + 'person remembering.',
    evidencedBy: null,
    appliesWhen: 'Always — every high-rise residential building has external walls',
  }),
  entry({
    key: 'resident_fire_safety_info',
    name: 'Fire safety instructions to residents — refresh',
    description: 'Re-issue the fire safety instructions and evacuation information to all residents.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 9(3) — "within each period of 12 months"',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    responsibleParty: 'Responsible person',
    evidenceRequired: 'Distribution record and communications log; also issued to new residents on move-in',
    handledBy: 'info',
    handlingNote: 'Published through the Info app; per-resident issue on move-in has no home (resident data is out of scope).',
    evidencedBy: 'maintenance_job',
    // reg 9 has NO height threshold — it binds any building with two or more
    // sets of domestic premises and common parts. Applying the high-rise test
    // here would have narrowed a duty that is in fact wider.
    appliesWhen: 'Always — reg 9 applies to any building with two or more sets of domestic premises and common parts, with no height threshold',
  }),
  // ⚠ SPLIT OUT 2026-09-13, third review round. This used to be four words
  // appended to the reg 9(3) row's citation ("fire door information reg
  // 10(1)–(3)") while that row's task said only "re-issue the fire safety
  // instructions" — the citation was doing work the task did not describe,
  // which is how a duty gets cited and then not done. Reg 10(1)–(3) is its own
  // duty with its own content and its own timing, so it is its own row.
  entry({
    key: 'fire_door_resident_information',
    reviewerNote:
      'Three specific things must be conveyed, and a general fire safety leaflet does not do it: fire '
      + 'doors are to be kept shut when not in use, self-closing devices are not to be tampered with, '
      + 'and faults or damage are to be reported immediately. Reg 10(3) also requires it to reach a new '
      + 'resident on becoming a resident, not only on the annual cycle.',
    name: 'Fire door information to residents',
    description:
      'Give every resident the prescribed fire door information: that fire doors should be kept shut '
      + 'when not in use, that self-closing devices must not be tampered with, and that any fault or '
      + 'damage to a fire door should be reported immediately. Issued at least every 12 months, and to '
      + 'each new resident on becoming a resident.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 10(1)–(2) (the information) and reg 10(3) (when it must be given)',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    triggerType: 'calendar',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person issuing resident communications',
    evidenceRequired: 'The issued wording, dated, with the distribution record; separate record of issue to each new resident',
    retentionPeriodMonths: 36,
    handledBy: 'info',
    handlingNote:
      'Publishable through the Info app alongside the reg 9 instructions. ⚠ The per-resident issue on '
      + 'becoming a resident has no home — it needs the resident system, not this one.',
    evidencedBy: 'maintenance_job',
    // Same reasoning as reg 9: reg 10(1) keys on a building containing two or
    // more sets of domestic premises, not on a height threshold. The 11 m test
    // in reg 10(8) governs the CHECKS at 10(4)/10(6), not this information.
    appliesWhen: 'Always — reg 10(1) applies to a building with two or more sets of domestic premises; the 11-metre test governs the door checks, not the information',
  }),
  entry({
    key: 'escape_route_obstruction',
    name: 'Escape routes — obstruction check',
    description: 'Walk the escape routes and stair cores and clear anything obstructing them.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Regulatory Reform (Fire Safety) Order 2005, art 14',
    intervalBasis: 'practice',
    frequencyDays: 7,
    responsibleParty: 'Site staff',
    competencyRequired: 'Briefed site staff',
    evidenceRequired: 'Walk-around log, with an exception report on anything found',
    handledBy: 'inspection',
    handlingNote: 'A single-staircase building should consider daily rather than weekly.',
    evidencedBy: 'inspection',
    appliesWhen: 'Always — art 14 applies wherever there are escape routes',
  }),
  entry({
    key: 'tabletop_fire_exercise',
    name: 'Tabletop fire exercise',
    description: 'Desktop exercise walking a fire scenario through with those who would have to act.',
    group: 'fire_safety',
    basis: 'management',
    statutoryRef: 'Self-imposed; supports BSA 2022 s.84 reasonable steps',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Building safety lead',
    evidenceRequired: 'Exercise log and lessons learned',
    handledBy: 'planner',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always — a cheap and well-regarded discipline',
  }),

  // ══ 2 · Other statutory checks ══════════════════════════════════════════
  entry({
    key: 'eicr_common_parts',
    name: 'EICR — common parts and landlord supply',
    description: 'Periodic inspection and testing of the common-parts electrical installation.',
    group: 'other_statutory',
    // The DUTY is statutory; the FIVE YEARS is not. EAWR 1989 requires the
    // installation to be maintained so as to prevent danger and says nothing
    // about intervals — HSE is explicit that no inspection frequency is set in
    // law. BS 7671 supplies the recommended period. `intervalBasis: practice`
    // already said this; the reference now says it too, because the badge on
    // its own read as though five-yearly were the legal requirement.
    basis: 'statute',
    statutoryRef: 'Electricity at Work Regulations 1989 (the duty — maintain so as to prevent danger; NO interval in law). Five years is the interval ADOPTED for this building, informed by BS 7671 and by the installation’s characteristics, environment, use, age and condition — the previous inspection’s recommended date governs, and it can be shorter',
    intervalBasis: 'practice',
    frequencyDays: 1825,
    // Deliberately NULL. Nothing permits five years, so there is no maximum
    // permitted interval to state — carrying one contradicted this row's own
    // reference and put a legal ceiling on an interval we chose. Third review
    // round. ⚠ Do NOT apply this to eicr_dwellings: SI 2020/312 reg 3 really
    // does set a five-year statutory maximum for a rented dwelling.
    maxIntervalDays: null,
    triggerType: 'calendar',
    responsibleParty: 'Electrical contractor',
    competencyRequired: 'Qualified electrician; NICEIC / NAPIT registered firm recommended',
    evidenceRequired: 'Electrical Installation Condition Report with observation codes and remedial actions',
    retentionPeriodMonths: 120,
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a common-parts or landlord electrical supply (always true in practice)',
  }),
  entry({
    key: 'eicr_dwellings',
    name: 'EICR — rented dwellings',
    description: 'Five-yearly inspection and testing of the electrical installation in each rented dwelling.',
    group: 'other_statutory',
    basis: 'statute',
    statutoryRef: 'Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020, reg 3',
    intervalBasis: 'stated',
    frequencyDays: 1825,
    maxIntervalDays: 1826,
    responsibleParty: 'Electrical contractor',
    competencyRequired: 'Qualified and competent electrician',
    evidenceRequired: 'EICR per dwelling; copy to the tenant within 28 days',
    retentionPeriodMonths: 120,
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Any dwelling is let on a relevant tenancy — long leases alone do NOT trigger this',
  }),
  entry({
    key: 'ev_charging_inspection',
    reviewerNote:
      'No charge points are installed today; they are expected. The row is here so that installing '
      + 'them is a recorded switch-on rather than a gap nobody notices. '
      + '⚠ THREE THINGS THAT FOLLOW ON INSTALLATION, and are easy to miss because they belong to '
      + 'other rows: it is a significant change, so it fires the fire risk assessment review trigger '
      + '· it goes through the building-work screen, which carries the consequential record updates '
      + '· and EV charging in a car park is a live fire-safety question in its own right — the '
      + 'assessment has to address the location of the points, separation, detection and the '
      + 'fire service’s access to them, which is a matter for the fire risk assessor and not for '
      + 'this row. '
      + '❓ The interval is ours: BS 7671 prescribes none, and the IET Code of Practice points at '
      + 'roughly annual for commercial and shared installations against five-yearly for a domestic '
      + 'one. Confirm it against the equipment actually installed, its duty cycle and the '
      + 'manufacturer’s requirements when the time comes.',
    name: 'EV charging equipment — periodic inspection and test',
    description:
      'Periodic inspection and testing of the electric vehicle charging equipment and the circuits '
      + 'supplying it — protective devices, earthing arrangement and the charge points themselves — '
      + 'separately from the general installation report, because the duty cycle and the environment '
      + 'are not those of the rest of the installation.',
    group: 'other_statutory',
    basis: 'statute',
    statutoryRef: 'Electricity at Work Regulations 1989 (the duty — maintain so as to prevent danger; NO interval in law); BS 7671 section 722 (requirements for electric vehicle charging installations) and the IET Code of Practice for Electric Vehicle Charging Equipment Installation supply the method and the recommended periodicity',
    intervalBasis: 'practice',
    frequencyDays: 365,
    triggerType: 'calendar',
    responsibleParty: 'Competent electrical contractor',
    competencyRequired: 'Electrician competent in BS 7671 section 722 — EV charging has its own earthing and protection requirements',
    evidenceRequired: 'Inspection and test report per charge point and its circuit, with any remedial work recorded',
    retentionPeriodMonths: 60,
    handledBy: 'maintenance',
    handlingNote: 'Nothing to schedule until charge points exist. Record the not-applicable decision with a review date rather than leaving the row unanswered — this is one that WILL change.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Electric vehicle charging equipment is installed in the car park or elsewhere on the premises. ⚠ Not the case today, and expected to change',
  }),
  entry({
    key: 'communal_electrics_visual',
    name: 'Communal electrics — annual visual inspection',
    description: 'Visual inspection of communal electrical installations between full EICRs.',
    group: 'other_statutory',
    basis: 'standard',
    statutoryRef: 'IET Code of Practice, as a visual regime between full inspections. The interval is ADOPTED for this building from its use and condition; nothing prescribes it',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Managing agent',
    competencyRequired: 'Competent person',
    evidenceRequired: 'Inspection log',
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has communal electrical installations',
  }),
  entry({
    key: 'pat_testing',
    reviewerNote: 'OPEN QUESTION: annual testing should follow from a risk-based judgement about these appliances in this environment. If no such judgement has been made, the options are to make one and record it, lengthen the interval, or record a decision that it does not apply here.',
    name: 'Portable appliance testing',
    description: 'In-service inspection and testing of portable appliances in the common parts.',
    group: 'other_statutory',
    // ⚠ Re-referenced 2026-09-13 after external review. HSE is unusually blunt
    // here: the Regulations "don't make inspection or testing of electrical
    // appliances a legal requirement, nor do they make it a legal requirement
    // to undertake this annually." The duty is to maintain equipment so it does
    // not give rise to danger; frequency is risk-based.
    // Re-based 2026-09-13, third review round, and the reviewer was plainly
    // right: the row's own text said there is NO legal requirement to PAT test
    // and none to do so annually, while the badge said Legislation. The
    // underlying duty — maintain electrical equipment so as to prevent danger —
    // is statutory and is named in the reference. The testing PROGRAMME is our
    // risk-based choice, so that is what the basis now says.
    basis: 'management',
    statutoryRef: 'Our own risk-based control. Underlying duty: Electricity at Work Regulations 1989 / PUWER 1998 — maintain equipment so as to prevent danger. Method: IET Code of Practice. ⚠ There is NO legal requirement to PAT test, and none to do so annually',
    intervalBasis: 'practice',
    frequencyDays: 365,
    triggerType: 'risk',
    responsibleParty: 'Managing agent',
    competencyRequired: 'Competent person for in-service testing',
    evidenceRequired: 'PAT log per appliance',
    handledBy: 'maintenance',
    handlingNote:
      '❓ OPEN QUESTION, raised by the external reviewer and not yet answered: annual testing should follow '
      + 'from a risk-based judgement about these appliances in this environment. If no such judgement has '
      + 'been made, the honest options are to make one and record it, lengthen the interval, or record a '
      + 'decision that this does not apply here — not to keep an annual cycle because it sounds prudent.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'There are portable appliances in the common parts — concierge desk, communal kitchen, plant room',
  }),
  // ── Gas: REMOVED 2026-09-13 on the user's explicit instruction.
  //
  // There is no gas in this building, so there is no landlord gas duty to hold.
  // Noted because it is a deliberate departure from this register's usual rule
  // (identified requirements are kept and excluded by a recorded decision,
  // never deleted): the user directed removal for this one, having considered
  // that rule. If gas is ever installed, the entry comes back — Gas Safety
  // (Installation and Use) Regulations 1998 reg 36(3), annual, Gas Safe
  // registered engineer, CP12 record.
  entry({
    key: 'lift_loler_examination',
    reviewerNote:
      'APPLICABILITY SETTLED 2026-09-13 on the duty holder’s facts: the lift is provided primarily for residents, but cleaners, the caretaker and contractors use it in the course of their work. **LOLER applies.** The test is not who the lift is mainly FOR — it is whether it is provided for, or used by, people at work; HSE’s example of a lift outside LOLER is a stair lift in a private dwelling, one nobody works with. A residents’ lift that staff and contractors work from is work equipment under PUWER reg 3, and the company controlling it holds the duty to the extent of that control. Reg 9(3)(a)(i) then sets SIX MONTHS as a statutory maximum for equipment used to lift persons, not as an adopted interval — and the examiner must be independent of the maintenance contractor, because a service visit is not a thorough examination. ⚠ RE-TEST THIS if the arrangements change so that nobody uses the lift in the course of work: the answer turns on that fact and nothing else. The alternative to the fixed six months is an examination scheme drawn up by a competent person under reg 9(3)(a)(iii) — available, and not currently used.',
    name: 'Lift — thorough examination',
    description:
      'Thorough examination of each passenger lift by a competent person, independent of the '
      + 'maintenance contractor.',
    group: 'other_statutory',
    basis: 'statute',
    // Re-based 2026-09-13. The previous row asserted LOLER reg 9(3)(a)(i) and a
    // stated six-month interval for a residents' lift, which is very likely
    // wrong for this building — see reviewerNote. The duty is real either way;
    // which instrument supplies it, and therefore whether six months is a legal
    // maximum or our adopted interval, is an open question.
    statutoryRef: 'Lifting Operations and Lifting Equipment Regulations 1998, reg 9(3)(a)(i) — thorough examination at least every 6 months for lifting equipment used to lift persons. LOLER applies because the lift is used by people at work (see the note), so this is a statutory maximum rather than an adopted interval. Reg 9(3)(a)(iii) permits an examination scheme drawn up by a competent person instead of the fixed interval',
    intervalBasis: 'stated',
    frequencyDays: 182,
    maxIntervalDays: 183,
    triggerType: 'calendar',
    responsibleParty: 'Insurance inspection body or independent examiner',
    competencyRequired:
      'Competent person INDEPENDENT of the maintenance contractor — a lift service visit is not a thorough examination',
    evidenceRequired: 'Report of thorough examination, with any defect notified to the duty holder',
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always — the building has a lift carrying people, and it is used by people at work (cleaners, the caretaker and contractors), which is what brings it within LOLER',
  }),
  entry({
    key: 'lift_maintenance',
    name: 'Lift — routine maintenance service',
    description: 'Routine preventive maintenance visit under the lift service contract.',
    group: 'other_statutory',
    basis: 'contract',
    statutoryRef: 'PUWER 1998; BS EN 13015; manufacturer recommendations',
    intervalBasis: 'practice',
    frequencyDays: 30,
    responsibleParty: 'Lift maintenance contractor',
    competencyRequired: 'Competent lift engineer',
    evidenceRequired: 'Service visit report / lift logbook entry',
    handledBy: 'maintenance',
    handlingNote: 'Monthly is typical; the binding interval is whatever the service contract says.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a lift',
  }),
  entry({
    key: 'water_temperature_monitoring',
    name: 'Water temperature monitoring',
    description: 'Routine monitoring of hot and cold water temperatures at sentinel outlets.',
    group: 'other_statutory',
    basis: 'standard',
    statutoryRef: 'HSE ACOP L8 / HSG274 Part 2, routine monitoring — HSG274 gives monthly for the sentinel hot and cold checks, but the monitoring programme follows the system and the risk assessment, so the interval is ours',
    intervalBasis: 'practice',
    frequencyDays: 30,
    // NULL for the same reason as the EICR row: nothing sets 31 days as a
    // ceiling, and printing one made an adopted interval look prescribed.
    maxIntervalDays: null,
    responsibleParty: 'Site staff or water hygiene contractor',
    competencyRequired: 'Briefed staff working to the written control scheme',
    evidenceRequired: 'Monitoring log with temperatures and outlets, and action on out-of-range readings',
    retentionPeriodMonths: 60,
    handledBy: 'inspection',
    evidencedBy: 'inspection',
    appliesWhen: 'Building has a communal hot or cold water system',
  }),
  entry({
    key: 'legionella_risk_review',
    name: 'Legionella risk assessment — review',
    description: 'Review the water system risk assessment and confirm the written control scheme is still valid.',
    group: 'other_statutory',
    basis: 'statute',
    // ⚠ Corrected 2026-09-13 on external review. The two years was presented as
    // though it came from the guidance. It does not: ACOP L8 says review
    // "regularly" and particularly where there is reason to suspect the
    // assessment is no longer valid or the system has changed. Two-yearly is
    // OUR adopted interval, and the real trigger is change.
    statutoryRef: 'Health and Safety at Work etc. Act 1974 / COSHH, via ACOP L8 and HSG274 — review "regularly" and on change; no fixed interval is prescribed',
    intervalBasis: 'practice',
    frequencyDays: 730,
    triggerType: 'risk',
    reviewerNote: 'Two-yearly is this building’s adopted interval, not a prescribed one. The governing trigger is change to the water system, or reason to suspect the assessment is no longer valid — either can require a review sooner.',
    responsibleParty: 'Duty holder, via a competent water hygiene assessor',
    competencyRequired: 'Competent legionella risk assessor (Legionella Control Association registered)',
    evidenceRequired: 'Reviewed risk assessment and written control scheme',
    retentionPeriodMonths: 60,
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a water system the duty holder controls — communal tanks or boosted mains',
  }),
  entry({
    key: 'water_tank_inspection',
    name: 'Water tanks — inspection and clean',
    description: 'Inspect and, where required, clean and disinfect cold water storage tanks.',
    group: 'other_statutory',
    basis: 'standard',
    statutoryRef: 'HSE ACOP L8 / HSG274 Part 2',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Water hygiene contractor',
    competencyRequired: 'Competent water hygiene technician',
    evidenceRequired: 'Inspection report; cleaning and disinfection certificate where carried out',
    retentionPeriodMonths: 60,
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has cold water storage tanks',
  }),
  entry({
    key: 'asbestos_reinspection',
    name: 'Asbestos — re-inspection',
    description: 'Re-inspect known and presumed asbestos-containing materials and update the register.',
    group: 'other_statutory',
    basis: 'statute',
    statutoryRef: 'Control of Asbestos Regulations 2012, reg 4. THE DUTY is to manage the risk from asbestos, which includes keeping the assessment and management plan under review and monitoring the condition of known or presumed asbestos-containing materials. THE ANNUAL FREQUENCY shown here is our adopted control — reg 4 states no interval',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Asbestos surveyor',
    competencyRequired: 'Competent asbestos surveyor',
    evidenceRequired: 'Re-inspection report and an updated asbestos register',
    retentionPeriodMonths: 120,
    handledBy: 'maintenance',
    handlingNote: 'The duty to manage is continuous; the register is the artefact the safety case needs.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building may contain asbestos — anything built or refurbished before 2000',
  }),
  entry({
    key: 'asbestos_register_on_works',
    name: 'Asbestos register — check before works',
    description: 'Consult and annotate the asbestos register before any work that could disturb the fabric.',
    group: 'other_statutory',
    basis: 'statute',
    statutoryRef: 'Control of Asbestos Regulations 2012, reg 4',
    intervalBasis: 'stated',
    trigger: 'Before every intrusive work order or disturbance of the fabric',
    responsibleParty: 'Managing agent',
    competencyRequired: 'Person raising the works order',
    evidenceRequired: 'Register annotation and a method statement reference on the works order',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote:
      '⚠ No home. Event-driven, not a cycle — it belongs on the Works Schedules flow as a pre-issue check.',
    evidencedBy: null,
    appliesWhen: 'Building may contain asbestos and works are ever carried out',
  }),
  entry({
    key: 'lightning_protection',
    reviewerNote:
      '❓ OPEN: annual is our selected interval, and it should be confirmed against the installed '
      + 'system. BS EN 62305-3 sets inspection periodicity by protection level and LPS classification; '
      + 'annual VISUAL inspection is common, but the complete inspection and test interval is not '
      + 'universally annual. Record the LPS class for this building and the reason annual was chosen.',
    name: 'Lightning protection — test and inspection',
    description: 'Inspection and earth-resistance testing of the lightning protection system.',
    group: 'other_statutory',
    basis: 'standard',
    statutoryRef: 'BS EN 62305-3, periodic inspection and testing — the periodicity depends on the protection level and the classification of the installed LPS, so the annual cycle is our selection, not a figure the standard states for every system',
    intervalBasis: 'practice',
    frequencyDays: 365,
    maxIntervalDays: null,
    responsibleParty: 'Lightning protection contractor',
    competencyRequired: 'Competent lightning protection engineer (ATLAS member firm recommended)',
    evidenceRequired: 'Test certificate recording earth resistance readings per down conductor',
    retentionPeriodMonths: 60,
    handledBy: 'maintenance',
    handlingNote: 'Often run on an 11-month rolling cycle so the test season varies year to year.',
    evidencedBy: 'maintenance_job',
    // Confirmed applicable 2026-09-13 — the building has a lightning protection
    // system. This was an open question in revision 2 and is now settled.
    appliesWhen: 'Always — the building has a lightning protection system',
  }),
  entry({
    key: 'structural_inspection',
    name: 'Structural inspection — visual',
    description: 'Visual structural inspection by a structural engineer or competent surveyor.',
    group: 'other_statutory',
    basis: 'management',
    statutoryRef: 'Self-imposed',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Structural engineer or competent surveyor',
    competencyRequired: 'Chartered structural engineer for anything beyond a visual walk',
    evidenceRequired: 'Inspection report',
    retentionPeriodMonths: 120,
    handledBy: 'maintenance',
    handlingNote: 'A building with known structural concerns needs a shorter interim cycle until it is fixed.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always for an HRB; more often where there are known structural findings',
  }),
  entry({
    key: 'roof_facade_check',
    name: 'Roof and façade — visual check',
    description: 'Visual check of roof and façade condition, repeated after any severe weather.',
    group: 'other_statutory',
    basis: 'management',
    statutoryRef: 'Self-imposed',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Managing agent',
    evidenceRequired: 'Walk-around report with photographs',
    handledBy: 'maintenance',
    handlingNote: 'Also triggered by storms — the calendar cycle is the floor, not the whole duty.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always',
  }),
  entry({
    key: 'drainage_gutter_clearance',
    name: 'Drainage and gutter clearance',
    description: 'Clear gutters, hoppers and drainage runs.',
    group: 'other_statutory',
    basis: 'contract',
    statutoryRef: 'Maintenance contract',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Managing agent',
    evidenceRequired: 'Service record',
    retentionPeriodMonths: 24,
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always',
  }),

  // ══ 3 · BSA-specific cycles ═════════════════════════════════════════════
  entry({
    key: 'scr_review',
    reviewerNote: 'This annual cycle must not displace the statutory trigger: a further risk assessment can be required at any time there is reason to suspect the current one is no longer valid, or at the regulator’s direction.',
    name: 'Safety case report — annual governance review',
    description:
      'Our own scheduled review of the safety case report, recording “no material change” where that is '
      + 'the finding. This is an assurance control, not a statutory cycle.',
    group: 'bsa_cycle',
    // ⚠ Corrected 2026-09-13 after external review. This cited s.83 and read as
    // a statutory annual cycle. Both were wrong:
    //   · s.83 is "Assessment of building safety risks" — the risk-assessment
    //     duty, not the safety case report. The report is s.85.
    //   · NOTHING prescribes an annual SCR review. s.83(2) requires further
    //     assessment "at regular intervals", on reason to suspect the current
    //     assessment is no longer valid, and on the regulator's direction —
    //     event- and risk-driven, not a calendar year.
    // The annual review is a good control. It is OURS, and is labelled so.
    basis: 'management',
    statutoryRef: 'Self-imposed governance cycle over the BSA 2022 ss.83–85 duties; no statutory annual review exists',
    intervalBasis: 'practice',
    frequencyDays: 365,
    triggerType: 'calendar',
    responsibleParty: 'Principal accountable person',
    evidenceRequired: 'Reviewed safety case report and the review record',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    handlingNote:
      'The Safety Case tab builds the report on demand; migration 202 logs each revision. '
      + '⚠ Do not let this annual cycle displace the statutory trigger: s.83(2) can require a further '
      + 'assessment at any time, and the report must be revised when the risk picture changes.',
    evidencedBy: null,
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'scr_resubmission',
    name: 'Safety case report — notify the regulator on preparation or revision',
    description:
      'Notify the regulator as soon as reasonably practicable after preparing OR revising the safety case '
      + 'report, and record the reference given.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Building Safety Act 2022, s.86 — "as soon as reasonably practicable after preparing or revising a safety case report"',
    intervalBasis: 'stated',
    // ⚠ Corrected 2026-09-13. The trigger read "on material change, or on BSR
    // direction", which is narrower than the section and would have let a
    // revision go unnotified: s.86 fires on ANY preparation or revision,
    // whether or not we judged the change material and whether or not the
    // regulator asked. A separate duty at s.86(2) supplies a copy on request.
    trigger: 'Whenever the safety case report is prepared or revised — not only on a change we judge material',
    responsibleParty: 'Principal accountable person',
    evidenceRequired: 'BSR receipt and the safety case version record',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    handlingNote: 'Built: the s.86 notification log (migration 202) — pending until marked notified.',
    evidencedBy: null,
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'kbi_update',
    name: 'Key building information — assurance review',
    // ⚠ Reworded 2026-09-13 after external review. The statutory duty is to
    // notify a CHANGE within the required period — there is no statutory
    // annual KBI review. Our annual pass is the control that catches a change
    // nobody noticed at the time, so it is described as checking our own record
    // and confirming notifications went out, not as reviewing the regulator's.
    description:
      'Review the key building information held in our own controlled record, and confirm that any change '
      + 'has been identified and notified to the regulator within the required period.',
    group: 'bsa_cycle',
    basis: 'statute',
    // ⚠ Instrument corrected 2026-09-13 on external review — and this is the
    // second time this row has been wrong. It cited SI 2024/41 reg 5 (provision
    // of information to the regulator), which is a real provision but not the
    // KBI regime. KBI is its own instrument: SI 2023/396, whose reg 21 sets the
    // 28-day clock. The statutory duty is a CHANGE notification, not a review.
    statutoryRef: 'Higher-Risk Buildings (Key Building Information etc.) (England) Regulations 2023 (SI 2023/396), reg 21 — "notify the regulator of any change to the key building information within 28 days of the PAP becoming aware of the change"',
    intervalBasis: 'practice',
    frequencyDays: 365,
    triggerType: 'calendar',
    reviewerNote: 'The statutory duty is a 28-day change notification, not an annual review. The annual pass is our assurance control — it exists to catch a change nobody noticed at the time, and it does not extend the 28 days.',
    responsibleParty: 'Principal accountable person',
    evidenceRequired: 'KBI submission record, and the dated confirmation that no unnotified change exists',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⚠ No home. KBI is not modelled anywhere in the portal.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always for an HRB',
  }),
  // ⚠ ADDED 2026-09-13, third review round. The reviewer's point is the one
  // that makes this worth a row of its own: registration information and key
  // building information are DIFFERENT datasets with DIFFERENT clocks, and
  // treating them as one is exactly how the shorter of the two gets lost. KBI
  // is 28 days under SI 2023/396 reg 21; registration information is 14
  // relevant days under SI 2023/315 reg 4. Verified against legislation.gov.uk.
  entry({
    key: 'hrb_registration_information_update',
    reviewerNote:
      'Do not fold this into the key building information duty. They are separate datasets with '
      + 'separate deadlines — 14 relevant days here, 28 days for KBI — and the shorter one is the one '
      + 'that gets missed when they are treated as a single submission.',
    name: 'Higher-risk building registration — notify a change',
    description:
      'Notify the regulator of any change to the registration information, and provide any certificate '
      + 'more recent than the one already given, within 14 relevant days of the principal accountable '
      + 'person becoming aware of it.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Building Safety (Registration of Higher-Risk Buildings and Review of Decisions) (England) Regulations 2023 (SI 2023/315), reg 4 — "within the period of 14 relevant days beginning with the day that the PAP becomes aware of a change"',
    intervalBasis: 'stated',
    frequencyDays: null,
    trigger: 'Becoming aware of any change to the registration information, or a more recent certificate becoming available',
    triggerType: 'event',
    responsibleParty: 'Principal accountable person',
    competencyRequired: 'Person who holds the registration account with the regulator',
    evidenceRequired: 'The submission to the regulator, dated, with the date awareness arose so the 14 relevant days can be evidenced',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⚠ No home. Nothing in the portal models registration information or watches for a change to it — and the clock is short.',
    evidencedBy: null,
    appliesWhen: 'Always for a registered HRB',
  }),
  // ⚠ ADDED 2026-09-13, third review round. A change of accountable person is
  // not merely a notification — SI 2024/41 reg 13 governs the handover of
  // information and documents on a change in AP, and the registration regime
  // captures the change too. Without this row a handover could be completed
  // with nothing recording that the incoming AP actually received the
  // prescribed information.
  entry({
    key: 'ap_change_handover',
    reviewerNote:
      'The failure this guards against is a silent one: an AP changes, the notification is made, and '
      + 'nobody records that the incoming AP received the prescribed information. An incoming '
      + 'confirmation is the strongest evidence and the one to aim for — but it is not the statutory '
      + 'test, and a transfer is not undischarged merely because the incoming party never signed '
      + 'anything. Acknowledgement, or other reliable evidence of receipt, also serves.',
    name: 'Accountable person change — notification and golden thread handover',
    description:
      'On any change of accountable person or principal accountable person: identify the outgoing and '
      + 'incoming parties, notify or update the regulator, hand over the prescribed information and '
      + 'documents, record the date responsibility changes, and obtain the incoming party’s confirmation '
      + 'that the information has been received.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Higher-Risk Buildings (Keeping and Provision of Information etc.) (England) Regulations 2024 (SI 2024/41), reg 13 (provision of information and documents etc on change in AP); registration change notified under SI 2023/315 reg 4',
    intervalBasis: 'stated',
    frequencyDays: null,
    trigger: 'Any change to who is an accountable person or the principal accountable person',
    triggerType: 'event',
    responsibleParty: 'Outgoing and incoming accountable persons',
    competencyRequired: 'Person able to identify the full prescribed information set and confirm its transfer',
    evidenceRequired: 'Transfer record identifying the information and documents provided, the date, the sender and the recipient, the date responsibility changed, the regulator notification, and acknowledgement or other reliable evidence of receipt — the incoming party’s written confirmation is the preferred control, not the only evidence capable of discharging the duty',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    handlingNote: 'The Golden Thread register holds the AP records and the document set; the handover itself is a manual, evidenced step with no built workflow.',
    evidencedBy: null,
    appliesWhen: 'Always — the duty exists whether or not a change is currently in prospect',
  }),
  // ⚠ ADDED 2026-09-13, third review round. SI 2024/41 is not only about
  // KEEPING information — Part 3 is a set of duties to PROVIDE it, each to a
  // different person and in different circumstances. One controlled row rather
  // than eight: the shape of the obligation is identical every time (a request
  // or trigger arrives, a route applies, information is supplied or withheld
  // for a stated reason, and the whole thing is recorded), and eight rows would
  // read as eight cycles when none of them is a cycle at all.
  entry({
    key: 'gt_information_provision',
    reviewerNote:
      'Regs 5–12 and 14 of SI 2024/41 cover provision to the regulator, another accountable person, '
      + 'residents, owners of residential units, a relevant landlord, a client, the relevant responsible '
      + 'person, and a fire and rescue authority, plus resident requests for further information. '
      + 'Regs 15–19 set the limitations and exemptions — WITHHOLDING is a decision that has to be '
      + 'recorded with its ground, not a silence. ⚠ This is a CONTROL HEADING, not one uniform legal '
      + 'workflow: the trigger, the recipient, the information category, the deadline, the format and '
      + 'the applicable limitation all differ by regulation, and each request has to be classified '
      + 'against the specific one rather than handled generically.',
    name: 'Golden thread information — provision on request or trigger',
    description:
      'Respond to each statutory trigger or request for golden thread information and documents. Record '
      + 'the request, who it came from, the route that applies, what was supplied or withheld and on '
      + 'what ground, the date, and the recipient.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Higher-Risk Buildings (Keeping and Provision of Information etc.) (England) Regulations 2024 (SI 2024/41), regs 5–12 (provision to the regulator, another AP, residents, owners, a relevant landlord, a client, the relevant RP, a fire and rescue authority), reg 14 (resident requests for further information), regs 15–19 (limitations)',
    intervalBasis: 'stated',
    frequencyDays: null,
    trigger: 'A statutory trigger or a request from any prescribed person',
    triggerType: 'event',
    responsibleParty: 'Accountable person',
    competencyRequired: 'Person able to identify the applicable route and any limitation that applies',
    evidenceRequired: 'Per-request record: requester, route, date, what was provided or withheld, and the ground for any withholding',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    handlingNote:
      '⚠ Partially homed. The Golden Thread app holds the documents and can produce a share pack, but '
      + 'there is no register of REQUESTS — who asked, what was sent, what was withheld and why. That '
      + 'record is the evidence, and it does not exist yet.',
    evidencedBy: null,
    appliesWhen: 'Always for an HRB in occupation',
  }),
  entry({
    key: 'bac_renewal',
    reviewerNote: 'Track the certificate by its validity, its conditions, any direction and the correspondence with the regulator — NOT by an assumed cycle. What starts a reassessment is a direction, which can come sooner after significant change, a safety-management concern, an incident, or completed improvement work. A five-year planning reminder may be carried where that is consistent with current regulator guidance; it is not a statutory deadline and it is not a substitute for a direction.',
    name: 'Building assessment certificate — track validity and reassessment',
    description:
      'Track the current building assessment certificate and any direction or reassessment request '
      + 'from the regulator, and apply when directed. A five-year planning reminder may be carried '
      + 'where that is consistent with current regulator guidance, but it is not a statutory maximum '
      + 'and it is not a substitute for a direction.',
    group: 'bsa_cycle',
    // ⚠ Corrected 2026-09-13 after external review. Three things were wrong:
    //   · it cited s.86, which is safety-case-report notification. The BAC is
    //     ss.79–81 (79 duty to apply, 80 applications, 81 certificates).
    //   · "renewal" implies we drive it. We do not — **the regulator DIRECTS a
    //     PAP to apply; a PAP cannot self-nominate.** The duty at s.79 is to
    //     apply when directed.
    //   · the five years is **regulator policy, not a statutory maximum.** The
    //     reviewer described it as provided by the regulations; that could not
    //     be verified — s.81 leaves the period to regulations and sets none,
    //     and SI 2023/907 reg 3 does not state one. BSR states it aims to
    //     reassess at least every five years, sooner where circumstances
    //     warrant. So the cycle is a planning assumption, not a deadline.
    basis: 'statute',
    statutoryRef: 'Building Safety Act 2022, ss.79–81. ⚠ NO statutory reassessment period exists — s.81 leaves it to regulations and SI 2023/907 reg 3 sets none. Any five-year figure is a regulator planning cycle, carried here only as a reminder',
    intervalBasis: 'practice',
    // ⚠ NO interval. A five-year figure printed as this row's cycle read as a
    // formal one however the note was worded, which is the exact confusion this
    // register exists to prevent. What starts a reassessment is a direction
    // from the regulator, so the row is event-driven and the five years lives
    // in the note as a planning reminder.
    frequencyDays: null,
    maxIntervalDays: null,
    trigger: 'A direction or reassessment request from the regulator',
    triggerType: 'direction',
    responsibleParty: 'Principal accountable person',
    evidenceRequired: 'BAC certificate and regulator correspondence, including any direction to apply',
    retentionPeriodMonths: 120,
    handledBy: 'admin',
    handlingNote:
      'The BAC is one of the s.82 display register’s guaranteed slots. '
      + '⚠ NO LONGER SCHEDULABLE, and that followed from removing the five-year interval on '
      + '2026-09-13: a scheduler needs a frequency and this row no longer has one, because nothing '
      + 'recurs — it waits on a direction. A test caught the inconsistency the moment the interval '
      + 'went. What the row needs is a WATCH on validity, conditions, directions and regulator '
      + 'correspondence, which is not a cycle and has no home in the portal today.',
    // Was 'maintenance_job'. With no frequency there is nothing for the
    // scheduler to compute a due date from, and a schedulable obligation that
    // can never fall due reads as "never run" forever — the same defect that
    // made `evidenced_by` mandatory in the first place.
    evidencedBy: null,
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'reasonable_steps_register_review',
    name: 'Reasonable steps register — review',
    description: 'Review the record of reasonable steps taken to manage building safety risks.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Building Safety Act 2022, s.84',
    intervalBasis: 'practice',
    frequencyDays: 90,
    responsibleParty: 'Building safety lead',
    evidenceRequired: 'Reviewed register and meeting minutes',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⚠ No home. Closest thing is the Golden Thread risk register, which is not the same artefact.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'persons_register_review',
    name: 'Competence register — review',
    description: 'Review each person’s competence record, limitations and reassessment triggers.',
    group: 'bsa_cycle',
    basis: 'management',
    statutoryRef: 'Self-imposed; competence under BS 8670',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Building safety lead',
    evidenceRequired: 'Updated competence register entries',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    handlingNote: 'Built: gt_persons, with limitations / supervision / reassessment triggers (migration 201).',
    evidencedBy: null,
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'gt_register_audit',
    reviewerNote:
      'Keep the two apart. The STATUTORY duty is to keep the prescribed golden thread information to '
      + 'the prescribed standards — kept electronically in a form capable of being transferred to '
      + 'others without the data being lost or corrupted, accurate, intelligible with any key needed '
      + 'to understand it, accessible as soon as reasonably practicable on request, secure from '
      + 'unauthorised access, and changed ONLY under procedures that record who made the change and '
      + 'when. Nothing in law requires a quarterly audit of the register. The quarterly audit is OUR '
      + 'control for demonstrating those standards are met, and its interval is ours to change.',
    name: 'Golden Thread document register — audit',
    description:
      'Audit the document register for completeness, currency and correct classification — our control '
      + 'for demonstrating that the golden thread information is being kept to the prescribed standards.',
    group: 'bsa_cycle',
    // Re-based 2026-09-13: "statute" put a legal badge on a quarterly cycle we
    // invented. The duty underneath is statutory and is named in the reference;
    // the audit is the assurance control over it.
    basis: 'management',
    statutoryRef: 'Our own assurance control. Underlying duty: keep golden thread information to the prescribed standards — SI 2024/41 reg 4 (what the information is) and SI 2023/907 reg 7 (the standards). Neither states an audit interval',
    intervalBasis: 'practice',
    frequencyDays: 90,
    triggerType: 'calendar',
    responsibleParty: 'Information manager',
    evidenceRequired: 'Register audit report',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'gt_cyclical_document_review',
    reviewerNote: 'The statutory duty is that the information is KEPT to the prescribed standards and is accurate — not that every document carries a review date. Some golden thread information is event-driven, some is current-state, and some is better kept current through a risk or management process than by an arbitrary calendar. A universal document-review calendar is our control for achieving currency, so the row asks for an APPROPRIATE currency trigger per record rather than imposing one shape on all of them.',
    name: 'Golden Thread — currency of each controlled record',
    description:
      'Each controlled record has an appropriate currency trigger — an event, a review date, a change '
      + 'in the underlying facts, or a risk-based review — and on that trigger is confirmed, revised '
      + 'or superseded.',
    group: 'bsa_cycle',
    // Our control, not a statutory calendar. The duty underneath is named in
    // the reference; the shape of the review is ours.
    basis: 'management',
    statutoryRef: 'Our own control for keeping records current. Underlying duty: SI 2024/41 reg 4 (what the golden thread information IS — Schedule 1) and SI 2023/907 reg 7 (the standards for keeping it, including accuracy). ⚠ Neither requires a review date on every document',
    intervalBasis: 'practice',
    trigger: 'Each document’s own review date',
    responsibleParty: 'Information manager',
    evidenceRequired: 'Per-document supersession records',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    handlingNote:
      'Built: gtReview.js computes review-due per document. Not a single building-wide cycle. '
      + '⚠ RE-CITED 2026-09-11. It read "SI 2024/41 reg 6", which is provision of information to ANOTHER AP on '
      + 'handover — unrelated. Neither instrument states a review interval, so the cycle itself remains our own '
      + 'practice; the statute says the information must be kept to a standard, not how often to look at it.',
    evidencedBy: null,
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'audit_chain_verification',
    name: 'Audit chain — verification',
    description: 'Verify the hash-chained audit log has not been altered.',
    group: 'bsa_cycle',
    basis: 'management',
    statutoryRef: 'Self-imposed; safety case integrity',
    intervalBasis: 'practice',
    frequencyDays: 30,
    responsibleParty: 'Information manager',
    evidenceRequired: 'Verification result log',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    handlingNote: 'Built: /api/golden-thread/verify-audit. Run on demand — no scheduled run exists.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'mor_reportability_triage',
    reviewerNote:
      'Our other MOR rows are assurance controls over the workflow — open-case review, lessons '
      + 'learned, annual system effectiveness. This is the duty itself, and it was missing: on each '
      + 'occurrence, decide whether it is reportable, record the reasoning either way, and report in '
      + 'time if it is. ⚠ A decision NOT to report is the one most worth evidencing, because it is the '
      + 'one that will be questioned.',
    name: 'Safety occurrence — triage and reportability decision',
    description:
      'On becoming aware of a safety occurrence: log it promptly, assess whether it is reportable, '
      + 'record the reasoned decision either way with the competent person who made it, start the '
      + 'statutory reporting clock where it is reportable, and carry the outcome into remediation, the '
      + 'golden thread and any safety case revision.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Building Safety Act 2022 s.87 and the mandatory occurrence reporting regime — the duty arises on the occurrence, not on a cycle',
    intervalBasis: 'stated',
    frequencyDays: null,
    trigger: 'Becoming aware of any safety occurrence, however it arrives — report, complaint, inspection finding, contractor, resident',
    triggerType: 'event',
    responsibleParty: 'Principal accountable person',
    competencyRequired: 'Person competent to judge reportability, with escalation where the judgement is finely balanced',
    evidenceRequired: 'Per-occurrence record: what was reported, when awareness arose, the reportability decision AND its reasoning, who made it, and the resulting report or the recorded reason for not reporting',
    retentionPeriodMonths: 120,
    handledBy: 'mor',
    handlingNote: 'The MOR app holds the case lifecycle and the 10-day clock. What it does not hold is the decision NOT to open a case — an occurrence judged non-reportable leaves no record at all today.',
    evidencedBy: null,
    appliesWhen: 'Always for an HRB in occupation',
  }),
  entry({
    key: 'mor_open_case_review',
    name: 'MOR — open case review',
    description: 'Review every open mandatory occurrence report against its statutory clocks.',
    group: 'bsa_cycle',
    basis: 'management',
    statutoryRef: 'Self-imposed; supports the s.87 reporting duties',
    intervalBasis: 'practice',
    frequencyDays: 7,
    responsibleParty: 'Building safety lead',
    evidenceRequired: 'Review log and case timeline notes',
    retentionPeriodMonths: 120,
    handledBy: 'mor',
    handlingNote: 'The MOR app tracks the clocks per case; this is the recurring look at all of them.',
    evidencedBy: null,
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'mor_lessons_learned',
    name: 'MOR — closed case review (lessons learned)',
    description: 'Review closed occurrences for systemic causes and revise procedures where indicated.',
    group: 'bsa_cycle',
    basis: 'management',
    statutoryRef: 'Self-imposed; supports BSA 2022 s.84 reasonable steps',
    intervalBasis: 'practice',
    frequencyDays: 90,
    responsibleParty: 'Building safety lead',
    evidenceRequired: 'Meeting minutes and revised procedures',
    retentionPeriodMonths: 120,
    handledBy: 'mor',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'mor_system_effectiveness_review',
    name: 'MOR system — effectiveness review',
    description: 'Review the mandatory occurrence reporting system itself, to confirm it remains effective and accessible.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Higher-Risk Buildings (Management of Safety Risks etc.) Regs 2023 (SI 2023/907), reg 6(4)',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Principal accountable person',
    evidenceRequired: 'Review record covering accessibility to residents and other users',
    retentionPeriodMonths: 120,
    handledBy: 'mor',
    handlingNote: 'A duty on the SYSTEM, not on a case — surfaced by BSA_V2_Mapping.md EXT-12.R1.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'complaint_intake_triage',
    reviewerNote:
      'The two annual complaints rows are assurance controls. This is the per-complaint duty, and the '
      + 'part that matters most is the link outward: does this complaint indicate a BUILDING SAFETY '
      + 'RISK, and does it therefore reach mandatory occurrence reporting, the risk assessment or the '
      + 'safety case? A complaints process that only answers the complainant satisfies the resident '
      + 'and misses the signal.',
    name: 'Building safety complaint — receive, classify and escalate',
    description:
      'On each building safety complaint: receive and acknowledge it, classify it, investigate, '
      + 'respond, and decide explicitly whether it indicates a building safety risk — and therefore '
      + 'whether it requires a mandatory occurrence report, a revision to the risk assessment or the '
      + 'safety case, or escalation to the regulator. Record recurrence analysis across complaints.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Building Safety Act 2022 s.93 — the duty to operate a complaints system, applied per complaint rather than as a cycle',
    intervalBasis: 'stated',
    frequencyDays: null,
    trigger: 'Receipt of a building safety complaint by any route',
    triggerType: 'event',
    responsibleParty: 'Principal accountable person',
    competencyRequired: 'Person able to judge whether a complaint discloses a building safety risk, with escalation where it may',
    evidenceRequired: 'Per-case record: receipt date, classification, investigation, response, the building-safety-risk determination and its consequences, and any escalation to the regulator',
    retentionPeriodMonths: 120,
    handledBy: 'complaints',
    handlingNote:
      'The Complaints app holds the seven-state case lifecycle. ⚠ Two things it does not hold: the two '
      + 'SLA clocks (columns exist, no code reads them) and the building-safety-risk determination that '
      + 'links a complaint to MOR or the safety case.',
    evidencedBy: null,
    appliesWhen: 'Always for an HRB in occupation',
  }),
  entry({
    key: 'complaints_self_assessment',
    name: 'Complaints — annual performance self-assessment',
    description: 'Self-assess complaint handling against the Complaint Handling Code.',
    group: 'bsa_cycle',
    basis: 'standard',
    statutoryRef: 'Housing Ombudsman Complaint Handling Code 2024',
    intervalBasis: 'stated',
    frequencyDays: 365,
    responsibleParty: 'Building safety lead',
    evidenceRequired: 'Completed self-assessment',
    retentionPeriodMonths: 120,
    handledBy: 'complaints',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always',
  }),
  entry({
    key: 'complaints_report_publication',

    name: 'Complaints — annual performance report',
    description: 'Publish the annual complaints performance report to residents.',
    group: 'bsa_cycle',
    // 'standard', not 'management': the register reserves management for things
    // WE chose with no external source, and this has one — an approved code
    // that sets both the duty and the interval. A test enforces that
    // distinction and caught this when it was first mis-filed as management.
    basis: 'standard',
    statutoryRef: 'Housing Ombudsman Complaint Handling Code — annual complaints performance and service improvement report',
    intervalBasis: 'stated',
    frequencyDays: 365,
    responsibleParty: 'Principal accountable person',
    evidenceRequired: 'Published report and the resident communications record',
    retentionPeriodMonths: 120,
    handledBy: 'complaints',
    handlingNote:
      '⚠ RE-BASED 2026-09-11 after checking the citation. It read "SI 2023/909 reg 12" — but SI 2023/909 is the '
      + 'Building (Higher-Risk Buildings Procedures) Regs, a construction/gateway instrument whose reg 12 is about '
      + 'building control approval applications. The complaints instrument is SI 2023/907, and ITS reg 12 (PAP '
      + 'complaints procedures) sets out how complaints must be handled but does NOT require an annual performance '
      + 'report. The annual report is a Housing Ombudsman Code duty, so this is recorded as a management cycle. '
      + 'Closed as a question 2026-09-13 — not being pursued with the reviewer. '
      + '⚠ The ENTRY stays. If the Code does not bind a private leasehold company, that is a compliance '
      + 'decision and belongs in the append-only exclusion log with a reason and a name against it, recorded '
      + 'in the app. Do not delete the row, and do not promote it back to statute without an answer.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'The building is within the scope of the Housing Ombudsman Complaint Handling Code',
  }),
  entry({
    key: 'res_strategy_review',
    name: 'Residents’ engagement strategy — review',
    description:
      'Review the residents’ engagement strategy at least every two years, and earlier where an event '
      + 'calls for it — after a mandatory occurrence report, after significant material alterations, '
      + 'or where a consultation shows the strategy is not working. Record why resident views were '
      + 'not adopted where they were not.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Building Safety Act 2022, s.91; SI 2023/907 reg 10 — "at least every two years", which is a FLOOR and not the only trigger',
    intervalBasis: 'stated',
    frequencyDays: 730,
    maxIntervalDays: 730,
    responsibleParty: 'Principal accountable person',
    evidenceRequired: 'Reviewed strategy and the engagement record',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⚠ No home. Also triggered by a submitted MOR and by significant alterations.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'dwelling_access_request',
    reviewerNote:
      'Distinct from information provision. What makes this worth a row is the failure case rather '
      + 'than the success case: a REFUSAL has to be evidenced — what '
      + 'was requested, what endeavours were made, what could not be inspected as a result, and what '
      + 'that unexamined part of the building means for the safety case. An access request that is '
      + 'quietly dropped leaves a hole in the evidence that nobody can later see.',
    name: 'Access to a dwelling — request, refusal and escalation',
    description:
      'Where access to a dwelling is needed to assess or manage a building safety risk: make the '
      + 'request in the required form and with the required notice, record refusals and repeated '
      + 'attempts, escalate where the law allows, and record what could not be examined and its effect '
      + 'on the risk assessment and the safety case.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Building Safety Act 2022 — the accountable person’s rights and duties of entry to assess and manage building safety risks, with escalation where access is refused',
    intervalBasis: 'stated',
    frequencyDays: null,
    trigger: 'Needing access to a dwelling to assess or manage a building safety risk',
    triggerType: 'event',
    responsibleParty: 'Accountable person',
    competencyRequired: 'Person able to serve a request in the required form and to judge when escalation is warranted',
    evidenceRequired: 'Per-request record: what was requested and why, the notice given, the response, repeated attempts, any escalation, and what remained unexamined with its consequence for the safety case',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⛔ INTERFACE — resident identity and addressing belong to the resident system (X1 R12). What this register needs back is the request, its outcome and what stayed unexamined.',
    evidencedBy: null,
    appliesWhen: 'Always for an HRB in occupation',
  }),
  entry({
    key: 'res_consultation',
    name: 'Residents’ engagement — consultation on a building safety decision',
    description: 'Consult residents on a building safety decision, for no less than three weeks.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Building Safety Act 2022, s.91; SI 2023/907 reg 10',
    intervalBasis: 'stated',
    trigger: 'Per building safety decision requiring consultation',
    responsibleParty: 'Building safety lead',
    evidenceRequired: 'Consultation record and a “you said, we did” response',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⚠ No home. The three-week minimum is statutory and must not be closable early.',
    evidencedBy: null,
    appliesWhen: 'A building safety decision affecting residents is taken',
  }),
  entry({
    key: 'res_bulletin',
    name: 'Residents’ safety bulletin',
    description: 'Regular safety bulletin to residents.',
    group: 'bsa_cycle',
    basis: 'management',
    statutoryRef: 'Self-imposed; supports the engagement strategy',
    intervalBasis: 'practice',
    frequencyDays: 30,
    responsibleParty: 'Building safety lead',
    evidenceRequired: 'Issued bulletin and readership record',
    retentionPeriodMonths: 36,
    handledBy: 'info',
    handlingNote: 'The Info app publishes to residents; readership is not measured.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always',
  }),
  entry({
    key: 'engagement_effectiveness',
    name: 'Engagement effectiveness — measurement',
    description: 'Measure and report whether resident engagement is actually working.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Building Safety Act 2022, s.91(3)(d)',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Building safety lead',
    evidenceRequired: 'Effectiveness report',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⚠ No home.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'contractor_certification_refresh',
    name: 'Approved contractors — certification refresh',
    description: 'Confirm each approved contractor’s scheme certification and insurance are still in date.',
    group: 'bsa_cycle',
    basis: 'contract',
    statutoryRef: 'Self-imposed; insurance-driven',
    intervalBasis: 'practice',
    trigger: 'Per certificate expiry',
    responsibleParty: 'Managing agent procurement',
    evidenceRequired: 'Refreshed register entries with certificate copies',
    handledBy: 'none',
    handlingNote: '⚠ No home. Contractors exist as profiles; their certification is not tracked.',
    evidencedBy: null,
    appliesWhen: 'Contractors are engaged on safety-critical work',
  }),
  // ➕ Added 2026-09-13 on external review. Both answer the same criticism:
  // the register was overwhelmingly calendar-driven, and a calendar cannot
  // raise the things that actually change a building's risk picture. These two
  // sit ABOVE the individual inspection rows — they are the catch-alls that
  // stop "not due yet" being mistaken for "nothing to do".
  entry({
    key: 'bsa_risk_assessment_trigger',
    name: 'Building safety risk assessment — event and risk trigger',
    description:
      'Assess whether a further building safety risk assessment is required, and carry one out where it is. '
      + 'This is the standing control over every other row: it fires on circumstance, not on a date.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Building Safety Act 2022, s.83(2) — further assessment at regular intervals, at any time there is reason to suspect the current assessment is no longer valid, and at the regulator’s direction',
    intervalBasis: 'stated',
    trigger:
      'Significant change, incident, newly identified hazard, significant defect, change of evacuation '
      + 'strategy, material building work, new information, or any reason to believe the current assessment '
      + 'may no longer be valid — or a direction from the regulator',
    triggerType: 'risk',
    reviewerNote: 'Two of the three statutory triggers are not calendar events, and no schedule will raise them. A completed inspection cycle is not evidence that this duty has been discharged.',
    responsibleParty: 'Accountable person',
    competencyRequired: 'Competent person for the risk in question',
    evidenceRequired: 'The decision on whether a further assessment was required, its reasoning, and the assessment where one was made',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    handlingNote: '⚠ Nothing detects these triggers automatically. It depends on somebody raising it.',
    evidencedBy: null,
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'building_work_change_control',
    name: 'Building work — screen for the regime, and update every record it touches',
    // ⚠ WIDENED 2026-09-13, fourth review. It asked for a general change-control
    // row alongside the gateway screen. Made it one row instead: both fire on
    // the same event and are completed by the same person, so two rows would
    // produce two records of one decision and a gap between them. The screen
    // now owns the consequential updates, which is where they were being lost.
    description:
      'Before work begins, determine whether it engages the higher-risk building work regime and its '
      + 'gateway procedures, follow the applicable route, and capture the outcome in the building '
      + 'safety record. The same screen carries the consequential updates, because they all fall due '
      + 'on the same event: the effect on fire and structural risk, on key building information, on '
      + 'the golden thread, on the fire risk assessment, on the evacuation strategy and plans, on the '
      + 'external wall record where the walls are touched, on the plans held by the fire and rescue '
      + 'authority where layout or key equipment moves, on resident engagement, and whether the work '
      + 'is itself a reportable occurrence. Record contractor competence, the approval, and the '
      + 'post-completion verification that each affected record was actually updated.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'The higher-risk building work regime under the Building Safety Act 2022 and the Building (Higher-Risk Buildings Procedures) (England) Regulations 2023 (SI 2023/909)',
    intervalBasis: 'stated',
    trigger: 'Any proposed building work, before it starts',
    triggerType: 'event',
    reviewerNote: 'The control is screen → determine applicability → follow the applicable route → record the outcome. It does NOT mean every maintenance job is a gateway project; it means the question is asked and the answer is recorded.',
    responsibleParty: 'Principal accountable person',
    competencyRequired: 'Person able to judge whether work is in scope; competent advice where it is',
    evidenceRequired: 'The screening decision and its reasoning, and any gateway correspondence',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⚠ No home. Event-driven, and it belongs at the point work is instructed.',
    evidencedBy: null,
    appliesWhen: 'Whenever building work is contemplated',
  }),
  entry({
    key: 'cooperation_arrangements_review',
    name: 'Cooperation and information-sharing arrangements — review',
    description:
      'Review the arrangements for cooperation and information-sharing between accountable persons, and '
      + 'with the responsible person under the fire safety order.',
    group: 'bsa_cycle',
    // ⚠ Corrected 2026-09-13 on external review. This cited s.156, which is
    // principally an amendment to the Fire Safety Order — not a general duty to
    // review cooperation arrangements annually. The duties are spread across
    // BSA Part 4 and the Fire Safety Order's own cooperation provisions, and
    // the annual review over them is ours.
    basis: 'statute',
    statutoryRef: 'Cooperation and information-sharing duties in BSA 2022 Part 4, and the cooperation duties in the Regulatory Reform (Fire Safety) Order 2005',
    intervalBasis: 'practice',
    frequencyDays: 365,
    reviewerNote: 'The annual cycle is our own. The real trigger is event-driven: any change to the accountable-person structure, to responsibilities, or to what has to be shared.',
    responsibleParty: 'Principal accountable person',
    evidenceRequired: 'Reviewed cooperation arrangement document',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    handlingNote: 'The AP register records who is accountable for which part (migration 201).',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'There is more than one accountable person, or a duty holder changes',
  }),

  // ══ 4 · Governance and review cycles ════════════════════════════════════
  entry({
    key: 'board_safety_standing_item',
    name: 'Board meeting — building safety standing item',
    description: 'Building safety as a standing item on the board agenda.',
    group: 'governance',
    basis: 'management',
    statutoryRef: 'Self-imposed; demonstrates accountability',
    intervalBasis: 'practice',
    frequencyDays: 30,
    responsibleParty: 'Directors collectively',
    evidenceRequired: 'Board minutes',
    retentionPeriodMonths: 120,
    handledBy: 'management',
    handlingNote: 'Meetings and minutes live in the Management app.',
    evidencedBy: null,
    appliesWhen: 'Always',
  }),
  entry({
    key: 'quarterly_safety_review',
    name: 'Quarterly safety review',
    description: 'Operational review of what is open and what is closing — the first line of assurance.',
    group: 'governance',
    basis: 'management',
    statutoryRef: 'Self-imposed (three-line assurance model)',
    intervalBasis: 'practice',
    frequencyDays: 90,
    responsibleParty: 'Building safety lead with the managing agent',
    evidenceRequired: 'Meeting record and action register update',
    retentionPeriodMonths: 120,
    handledBy: 'management',
    evidencedBy: null,
    appliesWhen: 'Always',
  }),
  entry({
    key: 'annual_safety_case_review',
    name: 'Annual safety case review (full)',
    description: 'Governance review of whether the operational picture still supports the safety case as a whole.',
    group: 'governance',
    basis: 'management',
    statutoryRef: 'Self-imposed (second line); supports BSA 2022 s.83',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Principal accountable person with an independent reviewer',
    evidenceRequired: 'Review report; safety case update where there is material change',
    retentionPeriodMonths: 120,
    handledBy: 'golden_thread',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always for an HRB',
  }),
  entry({
    key: 'external_audit',
    name: 'External audit — third-line assurance',
    description: 'Independent check that what is being claimed is what is actually happening.',
    group: 'governance',
    basis: 'management',
    statutoryRef: 'Self-imposed (three-line assurance model)',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Principal accountable person, commissioned externally',
    competencyRequired: 'Competent third party independent of the operation',
    evidenceRequired: 'External audit report',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⚠ No home. No legal duty requires it in this form; it is what makes the case defensible.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always — recommended, not required',
  }),
  entry({
    key: 'agm_safety_report',
    name: 'Annual residents’ safety meeting / AGM safety report',
    description: 'Report on building safety to residents at the AGM or an equivalent meeting.',
    group: 'governance',
    basis: 'management',
    statutoryRef: 'Self-imposed; supports the engagement strategy',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Principal accountable person',
    evidenceRequired: 'Meeting record and AGM minutes',
    retentionPeriodMonths: 120,
    handledBy: 'planner',
    handlingNote: 'The AGM is exactly the kind of expected annual event the Planner exists for.',
    evidencedBy: null,
    appliesWhen: 'Always',
  }),
  entry({
    key: 'insurance_renewal_briefing',
    name: 'Insurance renewal — safety case briefing',
    description: 'Brief the insurer or broker on the building safety position at renewal.',
    group: 'governance',
    basis: 'contract',
    statutoryRef: 'Insurer requirement',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Principal accountable person with the broker',
    evidenceRequired: 'Renewal briefing pack',
    retentionPeriodMonths: 84,
    handledBy: 'planner',
    handlingNote: 'Insurance renewal is a Planner event; the briefing pack is not produced by the portal.',
    evidencedBy: null,
    appliesWhen: 'Always',
  }),
  entry({
    key: 'bsl_performance_review',
    name: 'Building safety lead — performance review',
    description: 'Annual review of the named building safety lead’s performance and continued competence.',
    group: 'governance',
    basis: 'management',
    statutoryRef: 'Self-imposed',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Principal accountable person',
    evidenceRequired: 'Review record',
    retentionPeriodMonths: 84,
    handledBy: 'none',
    handlingNote: '⚠ No home, and it should probably stay that way — it is an HR record, not a building record.',
    evidencedBy: null,
    appliesWhen: 'A building safety lead has been appointed',
  }),
  entry({
    key: 'regulator_informal_contact',
    name: 'Regulator — informal contact',
    description: 'Keep a line open to the Building Safety Regulator outside formal submissions.',
    group: 'governance',
    basis: 'management',
    statutoryRef: 'Self-imposed; no statutory requirement',
    intervalBasis: 'practice',
    frequencyDays: 90,
    responsibleParty: 'Principal accountable person',
    evidenceRequired: 'Correspondence log',
    retentionPeriodMonths: 84,
    handledBy: 'none',
    handlingNote: '⚠ No home.',
    evidencedBy: null,
    appliesWhen: 'Always — optional discipline',
  }),
  // ══ 5 · Building-specific cycles ════════════════════════════════════════
  // Cycles this building needs because of its own characteristics and its own
  // open findings. From BSA_Periodic_Activities_and_Checks §5.
  //
  // ⚠ READ THIS BEFORE TOUCHING ANY STAIR ROW BELOW.
  //
  // The supplied source document described a SINGLE protected staircase with no
  // smoke ventilation, and three rows below were written from it — which is
  // where their daily and weekly cadences come from. The fourth review round
  // caught that this contradicted the building description.
  //
  // SETTLED 2026-09-13 by the duty holder: there are TWO staircases, and only
  // ONE has an AOV. The source was wrong about the count and right about the
  // ventilation, for one of the two stairs.
  //
  // Corrected again the same day: the second stair is ventilated by OPENABLE
  // WINDOWS, accepted as sufficient. So both stairs are ventilated, differing
  // in kind rather than in whether they are.
  //
  // ⚠ THE PREMISE BEHIND THE DAILY CADENCE IS NOW GONE ENTIRELY, not merely
  // weakened. Daily was chosen for a single route with no ventilation; there
  // are two routes and both are ventilated. On this register's own reasoning a
  // daily stair walk is no longer justified by anything written here, and a
  // control nobody can justify is a cost as well as a comfort.
  //
  // It is STILL not relaxed here, because relaxing a safety cadence belongs to
  // whoever owns the fire risk assessment, not to a documentation pass. But the
  // question is now sharper than "is this proportionate" — it is "what is the
  // reason for this, given both stairs are ventilated and two routes exist?"
  // Record the answer when it comes, either way.
  //
  // These are the items that distinguish this building's safety case from a
  // generic one, so they belong in the register — but several are INTERIM,
  // running only until a permanent fix lands. When one does, the honest move is
  // to record an 'applicable' → excluded decision with the fix as the reason,
  // not to quietly delete the entry.
  entry({
    key: 'acrow_prop_check',
    operationallyIncomplete: true,
    reviewerNote: 'Also specify: the acceptable position and tolerance, what counts as prohibited movement or damage, what triggers immediate isolation or evacuation, whether every finding goes to a structural engineer, whether photographs are date-stamped, and how long the props may remain before a permanent repair decision is forced. ⛔ OPERATIONAL READINESS: INCOMPLETE — do not rely on this row as sole assurance until the fields below are populated. A frequent inspection creates false assurance while the underlying defect stays open, which is precisely the risk here. What it does NOT yet carry: the underlying hazard and the finding it comes from · the risk it reduces and the residual risk accepted · the named technical authority · the threshold that forces escalation rather than another observation · who may declare the situation unsafe and stop occupation or use · the permanent solution and its target date · whether the measure is a condition of the safety case or the fire risk assessment · and whether residents, contractors and the fire and rescue service have been told. ⚠ Without an escalation threshold and an end condition, a frequent check can run for years beside an open defect and make the register look controlled.',
    name: 'Temporary structural support — position and integrity check',
    description:
      'Check that every item of temporary structural support — props, shoring, needling or falsework '
      + '— is in its designed position, plumb, undamaged, correctly loaded and undisturbed. What is '
      + 'supported, where, and to whose design belongs to the applied obligation and the engineer’s '
      + 'specification, not to this entry.',
    group: 'building_specific',
    basis: 'management',
    statutoryRef: 'Our own control, on a structural engineer’s recommendation, for as long as temporary support remains in place',
    intervalBasis: 'practice',
    frequencyDays: 7,
    responsibleParty: 'Site staff',
    competencyRequired: 'Briefed site staff; anything found escalates to the structural engineer',
    evidenceRequired: 'Inspection log with photographs',
    retentionPeriodMonths: 120,
    handledBy: 'inspection',
    handlingNote:
      'INTERIM — runs until the permanent structural fix is delivered and certified. '
      + 'The single most important operational discipline in the building while the props are in place.',
    evidencedBy: 'inspection',
    appliesWhen: 'Temporary propping is in place anywhere in the building',
  }),
  entry({
    key: 'cracked_column_check',
    operationallyIncomplete: true,
    reviewerNote: 'Also specify: the crack-width measurement method, the reference datum, the measurement tolerance, the corrosion progression criteria and the trigger values. ⚠ A monthly visual comparison is not a monitoring regime unless it is tied to the structural engineer’s specification — a photograph that shows change with no stated trigger value leaves the decision to whoever is looking. ⛔ OPERATIONAL READINESS: INCOMPLETE — do not rely on this row as sole assurance until the fields below are populated. A frequent inspection creates false assurance while the underlying defect stays open, which is precisely the risk here. What it does NOT yet carry: the underlying hazard and the finding it comes from · the risk it reduces and the residual risk accepted · the named technical authority · the threshold that forces escalation rather than another observation · who may declare the situation unsafe and stop occupation or use · the permanent solution and its target date · whether the measure is a condition of the safety case or the fire risk assessment · and whether residents, contractors and the fire and rescue service have been told. ⚠ Without an escalation threshold and an end condition, a frequent check can run for years beside an open defect and make the register look controlled.',
    name: 'Structural defect — visual comparison check',
    description:
      'Visual check of each structural element under monitoring against the engineer’s reference '
      + 'record — dated comparison photographs or an equivalent datum — looking for change in a '
      + 'crack, a deflection, corrosion or a bearing. Which elements, and what counts as change, '
      + 'come from the monitoring specification.',
    group: 'building_specific',
    basis: 'management',
    statutoryRef: 'Our own control, under a structural engineer’s monitoring specification, for as long as the defect is under monitoring',
    intervalBasis: 'practice',
    frequencyDays: 30,
    responsibleParty: 'Structural engineer or competent surveyor',
    competencyRequired: 'Competent surveyor; a chartered structural engineer for any change found',
    evidenceRequired: 'Inspection report with comparison photographs',
    retentionPeriodMonths: 120,
    handledBy: 'maintenance',
    handlingNote: 'INTERIM — until the permanent structural fix is delivered.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'There are known structural defects under monitoring',
  }),
  entry({
    key: 'crack_monitoring',
    operationallyIncomplete: true,
    reviewerNote: 'Also specify: the reading method, the datum, and the trigger value at which a reading escalates rather than simply being recorded. ⛔ OPERATIONAL READINESS: INCOMPLETE — do not rely on this row as sole assurance until the fields below are populated. A frequent inspection creates false assurance while the underlying defect stays open, which is precisely the risk here. What it does NOT yet carry: the underlying hazard and the finding it comes from · the risk it reduces and the residual risk accepted · the named technical authority · the threshold that forces escalation rather than another observation · who may declare the situation unsafe and stop occupation or use · the permanent solution and its target date · whether the measure is a condition of the safety case or the fire risk assessment · and whether residents, contractors and the fire and rescue service have been told. ⚠ Without an escalation threshold and an end condition, a frequent check can run for years beside an open defect and make the register look controlled.',
    name: 'Structural movement — instrumented monitoring',
    description:
      'Read and record any crack monitoring devices fitted, at the interval the structural engineer’s '
      + 'monitoring specification sets, and immediately where an event calls for it. Record the '
      + 'measurement method, the reference datum and the trigger value at which the reading escalates.',
    group: 'building_specific',
    basis: 'management',
    statutoryRef: 'Our own control, under a structural engineer’s monitoring specification which sets the device, the datum, the reading interval and the trigger value',
    intervalBasis: 'practice',
    trigger: 'The interval set by the structural engineer’s monitoring specification; and, separately, any event calling for an immediate reading — movement, a new crack, works nearby, or a reading outside the trigger value',
    responsibleParty: 'Structural engineer or their appointed monitor',
    evidenceRequired: 'Monitoring data series',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote:
      '⚠ No home. A reading series is measurement data, not a pass/fail check — the closest fit is the '
      + 'inspection `readings` jsonb (migration 169), which nothing currently drives on a schedule.',
    evidencedBy: null,
    appliesWhen: 'Crack monitoring devices have been fitted',
  }),
  entry({
    key: 'structural_interim_review',
    operationallyIncomplete: true,
    reviewerNote: 'Also specify: what the interim measures are protecting against, and the condition on which they end. ⛔ OPERATIONAL READINESS: INCOMPLETE — do not rely on this row as sole assurance until the fields below are populated. A frequent inspection creates false assurance while the underlying defect stays open, which is precisely the risk here. What it does NOT yet carry: the underlying hazard and the finding it comes from · the risk it reduces and the residual risk accepted · the named technical authority · the threshold that forces escalation rather than another observation · who may declare the situation unsafe and stop occupation or use · the permanent solution and its target date · whether the measure is a condition of the safety case or the fire risk assessment · and whether residents, contractors and the fire and rescue service have been told. ⚠ Without an escalation threshold and an end condition, a frequent check can run for years beside an open defect and make the register look controlled.',
    name: 'Structural engineer — review of interim measures',
    description:
      'The engineer reviews the monitoring record and confirms whether the interim measures remain '
      + 'adequate, states what would change that, and says whether the permanent remedy is still on '
      + 'the timescale assumed when the measures were accepted.',
    group: 'building_specific',
    basis: 'management',
    statutoryRef: 'Our own control, for as long as interim structural measures stand in place of a permanent remedy',
    intervalBasis: 'practice',
    frequencyDays: 90,
    responsibleParty: 'Structural engineer',
    competencyRequired: 'Chartered structural engineer',
    evidenceRequired: 'Engineer review report',
    retentionPeriodMonths: 120,
    handledBy: 'maintenance',
    handlingNote: 'INTERIM — reverts to the annual structural inspection once the permanent fix is certified.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Interim structural measures are in place',
  }),
  entry({
    key: 'stair_core_walk_around',
    operationallyIncomplete: true,
    name: 'Stair core — walk-around',
    description: 'Walk the stair core end to end, looking for anything that compromises the protected route.',
    group: 'building_specific',
    basis: 'management',
    statutoryRef: 'Self-imposed; protection of the stair core as an escape route',
    intervalBasis: 'practice',
    frequencyDays: 1,
    responsibleParty: 'Site staff',
    competencyRequired: 'Briefed site staff',
    evidenceRequired: 'Walk-around log, with an exception report on anything found',
    handledBy: 'inspection',
    handlingNote:
      'Inherited a DAILY cadence from a source document that assumed one stair and no smoke '
      + 'ventilation. The building has two stairs and both are ventilated — one by AOV, one by '
      + 'openable windows. ⚠ Daily is retained pending a decision, because relaxing a safety cadence '
      + 'is not a documentation change; but nothing in this register now justifies it.',
    evidencedBy: 'inspection',
    reviewerNote: '⚠ THE DAILY CADENCE HAS NO STATED REASON, and is deliberately left in place anyway. It was set on the basis of a single protected route with no smoke ventilation and no second chance. The building has TWO staircases, one ventilated by an AOV and the other by openable windows accepted as sufficient (confirmed by the duty holder, 2026-09-13), so **nothing written in this register now supports a daily walk**. It has not been reduced here because relaxing a safety cadence belongs to whoever owns the fire risk assessment, not to a documentation exercise — but a control nobody can state a reason for is a cost as well as a comfort, and we would like the reason recorded or the cadence changed. Also specify the escalation triggers, so a finding is not left to judgement: doors wedged or propped open, failed self-closers, smoke leakage, damaged seals, obstructions, water ingress, and fire-stopping defects. ⛔ OPERATIONAL READINESS: INCOMPLETE — do not rely on this row as sole assurance until the fields below are populated. A frequent inspection creates false assurance while the underlying defect stays open, which is precisely the risk here. What it does NOT yet carry: the underlying hazard and the finding it comes from · the risk it reduces and the residual risk accepted · the named technical authority · the threshold that forces escalation rather than another observation · who may declare the situation unsafe and stop occupation or use · the permanent solution and its target date · whether the measure is a condition of the safety case or the fire risk assessment · and whether residents, contractors and the fire and rescue service have been told. ⚠ Without an escalation threshold and an end condition, a frequent check can run for years beside an open defect and make the register look controlled.',
    appliesWhen: 'The fire risk assessment or fire strategy calls for checks of an escape stair beyond the statutory escape-route and fire-door rounds',
  }),
  entry({
    key: 'lobby_to_stair_door_check',
    operationallyIncomplete: true,
    name: 'Lobby-to-stair doors — visual check',
    description: 'Visual check of the doors protecting the stair core, between the quarterly full door rounds.',
    group: 'building_specific',
    basis: 'management',
    statutoryRef: 'Self-imposed; supplements the quarterly fire door round',
    intervalBasis: 'practice',
    frequencyDays: 7,
    responsibleParty: 'Site staff',
    competencyRequired: 'Briefed site staff',
    evidenceRequired: 'Visual check log',
    handledBy: 'inspection',
    handlingNote: 'Weekly, between the quarterly statutory door rounds. ⚠ See the stair-core row: the reason for exceeding the statutory round has weakened considerably now that both stairs are ventilated.',
    evidencedBy: 'inspection',
    reviewerNote: 'The weekly cadence was set assuming a single unventilated route, and that assumption does not hold — there are two staircases, one AOV-ventilated and one with openable windows accepted as sufficient (confirmed 2026-09-13). What can still be said for weekly is general rather than specific to this building: the quarterly statutory round alone would leave a wedged door or a failed closer unseen for up to three months. Whether that justifies weekly is a judgement for the fire risk assessment. Also specify the escalation triggers — wedged or propped doors, failed self-closers, damaged seals, smoke leakage — and who may take a door out of service. ⛔ OPERATIONAL READINESS: INCOMPLETE — do not rely on this row as sole assurance until the fields below are populated. A frequent inspection creates false assurance while the underlying defect stays open, which is precisely the risk here. What it does NOT yet carry: the underlying hazard and the finding it comes from · the risk it reduces and the residual risk accepted · the named technical authority · the threshold that forces escalation rather than another observation · who may declare the situation unsafe and stop occupation or use · the permanent solution and its target date · whether the measure is a condition of the safety case or the fire risk assessment · and whether residents, contractors and the fire and rescue service have been told. ⚠ Without an escalation threshold and an end condition, a frequent check can run for years beside an open defect and make the register look controlled.',
    appliesWhen: 'The fire risk assessment or fire strategy calls for checks of an escape stair beyond the statutory escape-route and fire-door rounds',
  }),
  entry({
    key: 'stair_lighting_check',
    operationallyIncomplete: true,
    name: 'Stair lighting — check',
    description: 'Check normal and emergency lighting in the stair core is working.',
    group: 'building_specific',
    basis: 'management',
    statutoryRef: 'Self-imposed; supplements BS 5266 monthly testing',
    intervalBasis: 'practice',
    frequencyDays: 7,
    responsibleParty: 'Site staff',
    competencyRequired: 'Briefed site staff',
    evidenceRequired: 'Walk-around log',
    handledBy: 'inspection',
    evidencedBy: 'inspection',
    reviewerNote: 'Two staircases, one ventilated by an AOV and the other by openable windows accepted as sufficient (confirmed 2026-09-13) — see the stair-core row on what that does to the cadence. Also specify what happens when a failure is found in the protected route, and whether temporary lighting or a compensatory control is required until it is fixed. ⛔ OPERATIONAL READINESS: INCOMPLETE — do not rely on this row as sole assurance until the fields below are populated. A frequent inspection creates false assurance while the underlying defect stays open, which is precisely the risk here. What it does NOT yet carry: the underlying hazard and the finding it comes from · the risk it reduces and the residual risk accepted · the named technical authority · the threshold that forces escalation rather than another observation · who may declare the situation unsafe and stop occupation or use · the permanent solution and its target date · whether the measure is a condition of the safety case or the fire risk assessment · and whether residents, contractors and the fire and rescue service have been told. ⚠ Without an escalation threshold and an end condition, a frequent check can run for years beside an open defect and make the register look controlled.',
    appliesWhen: 'The fire risk assessment or fire strategy calls for checks of an escape stair beyond the statutory escape-route and fire-door rounds',
  }),
  entry({
    key: 'alarm_coverage_gap_monitoring',
    operationallyIncomplete: true,
    reviewerNote: '⚠ This row ages an open action; it does not close one. It must be tied to the specific open finding: the action owner, the original finding, the survey required, its due date, the interim mitigation relied on meanwhile, the decision-maker, the target completion date, the residual risk accepted, and what follows if the survey slips. A monthly ageing log is not a mitigation for a coverage gap that is safety-critical. ⛔ OPERATIONAL READINESS: INCOMPLETE — do not rely on this row as sole assurance until the fields below are populated. A frequent inspection creates false assurance while the underlying defect stays open, which is precisely the risk here. What it does NOT yet carry: the underlying hazard and the finding it comes from · the risk it reduces and the residual risk accepted · the named technical authority · the threshold that forces escalation rather than another observation · who may declare the situation unsafe and stop occupation or use · the permanent solution and its target date · whether the measure is a condition of the safety case or the fire risk assessment · and whether residents, contractors and the fire and rescue service have been told. ⚠ Without an escalation threshold and an end condition, a frequent check can run for years beside an open defect and make the register look controlled.',
    name: 'Fire alarm coverage — gap monitoring',
    description: 'Review the open action to establish fire alarm coverage, and age it.',
    group: 'building_specific',
    basis: 'management',
    statutoryRef: 'Self-imposed pending a coverage assessment',
    intervalBasis: 'practice',
    frequencyDays: 30,
    responsibleParty: 'Building safety lead',
    evidenceRequired: 'Review log and the ageing of the open action',
    retentionPeriodMonths: 120,
    handledBy: 'management',
    handlingNote:
      'INTERIM — until the coverage report lands. Where coverage is unknown, the safety case has a gap about '
      + 'what is NOT in scope of the six-monthly service, which is the thing being monitored.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Fire alarm coverage has not been established by survey',
  }),
  entry({
    key: 'alarm_audibility_spot_check',
    operationallyIncomplete: true,
    reviewerNote: '⚠ Same as the coverage row: this is an ageing log over an open finding, not a substitute for the survey. Tie it to the action, its owner and its date. ⛔ OPERATIONAL READINESS: INCOMPLETE — do not rely on this row as sole assurance until the fields below are populated. A frequent inspection creates false assurance while the underlying defect stays open, which is precisely the risk here. What it does NOT yet carry: the underlying hazard and the finding it comes from · the risk it reduces and the residual risk accepted · the named technical authority · the threshold that forces escalation rather than another observation · who may declare the situation unsafe and stop occupation or use · the permanent solution and its target date · whether the measure is a condition of the safety case or the fire risk assessment · and whether residents, contractors and the fire and rescue service have been told. ⚠ Without an escalation threshold and an end condition, a frequent check can run for years beside an open defect and make the register look controlled.',
    name: 'Fire alarm audibility — per-floor spot check',
    description: 'Spot-check audibility on each floor during the alarm test.',
    group: 'building_specific',
    basis: 'management',
    statutoryRef: 'Self-imposed pending a coverage assessment',
    intervalBasis: 'practice',
    frequencyDays: 90,
    responsibleParty: 'Site staff',
    competencyRequired: 'Briefed site staff',
    evidenceRequired: 'Spot-check log per floor',
    handledBy: 'inspection',
    handlingNote: 'INTERIM — a partial substitute for a proper coverage assessment, not a replacement for one.',
    evidencedBy: 'inspection',
    appliesWhen: 'Fire alarm coverage has not been established by survey',
  }),

  entry({
    key: 'leaseholder_safety_update',
    name: 'Leaseholder safety update',
    description: 'Written update to leaseholders on the building safety position.',
    group: 'governance',
    basis: 'management',
    statutoryRef: 'Self-imposed; supports the engagement strategy',
    intervalBasis: 'practice',
    frequencyDays: 365,
    responsibleParty: 'Principal accountable person',
    evidenceRequired: 'Communication issued; readership record',
    retentionPeriodMonths: 84,
    handledBy: 'info',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always',
  }),
];
