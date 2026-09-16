// src/lib/utils/statutoryRegisterData.js
//
// THE PERIODIC ACTIVITY REGISTER — every recurring check identified for a
// higher-risk residential building in England, from every source we hold.
// Data only; the logic that reads it is in statutoryTemplate.js.
//
// ── Sources merged here ─────────────────────────────────────────────────────
// · docs/requirements/supplied/BSA_Periodic_Activities_and_Checks.docx — the fullest
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
// · docs/requirements/registers/Commercial_Landscape_and_Gaps.md §4.4 / §4.5 — our own
//   FSER cadence table and certificate register.
// · docs/guides/inspection_user_guide.md — corroborates FSER reg 6.
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
    // ⚠ WHERE A ROW CARRIES BOTH `sourceIntervalWords` AND `maxIntervalDays`, THE DAY
    // COUNT MUST BE THE SHORTEST REAL CALENDAR REALISATION OF THE PERIOD.
    //
    // "At least every 3 months" is not 92 days. Measured across real months it
    // is anything from 89 to 92 — so a scheduler adding 92 days to 1 February
    // produces 4 May, three days past the statutory 1 May. The same held for
    // six months (183 against a shortest 181) and twelve (366 against 365).
    // Each ceiling is now the SHORTEST realisation, so a day-counting scheduler
    // cannot overshoot whatever date the last completion fell on.
    //
    // Being a few days early is a scheduling cost. Being one day late is a
    // breach, and the register must not be the thing that causes it.
    // The PERIOD AS THE INSTRUMENT EXPRESSES IT — "at least every 3 months",
    // "within each period of 12 months". Verbatim, not converted.
    //
    // Why this field exists, and it is the register's own principle turned on
    // itself: no instrument anywhere says 92 days, or 366, or 183. Those are
    // OUR arithmetic on a calendar word, and printing one under the heading
    // "Maximum permitted interval" told the reader the legislation contained a
    // 92-day ceiling. It does not. A document built to stop a convention being
    // read as law had been dressing its own arithmetic as law.
    //
    // So where this is set, the statutory period is shown IN WORDS, and the day
    // count moves to "Our scheduling tolerance" where it belongs — the two are
    // then impossible to confuse, and the day count stays available for a
    // scheduler that can only count days.
    /** @type {string|null} The interval in the instrument's own words, verbatim. */
    sourceIntervalWords: null,
    // ⛔ THIS ROW IS AN ASSURANCE PASS, NOT THE DUTY — and the table must say
    // so, not only the note beneath it.
    //
    // The register has split six duties now into an event-driven statutory row
    // and an annual confirmation over it. The split is correct, but a reader
    // skimming the annual row sees "Calendar / Annual" and concludes that the
    // statutory process is checked annually. It is not: the duty fires when a
    // resident is identified, or requests an assessment, or circumstances
    // change. The annual pass exists to catch what nobody noticed at the time.
    //
    // Set this to a short phrase naming the OPERATIVE control. It changes the
    // two table lines a skimmer actually reads, so the qualification cannot be
    // missed by anyone who does not reach the note.
    /** @type {string|null} What the operative duty is, where this row is only assurance over it. */
    assuranceOnly: null,
    // ⛔ WHO BEARS THE DUTY IN LAW — which is NOT who performs the task.
    //
    // The register carried one "Responsible" field doing both jobs, and on
    // eight rows it read "Site staff". A reader could take that as the
    // Responsible Person's statutory duty having been transferred to a cleaner.
    // It cannot be: the duty stays where the instrument puts it, however the
    // work is arranged. That is a misstatement the register was making, not a
    // field it was missing.
    //
    // ⚠ THIS FIELD IS DERIVABLE AND THE OTHER FOUR ARE NOT. Who bears a duty in
    // law follows from the instrument, so a catalogue can hold it. Who arranges
    // it, who holds the evidence, who assures it and who escalates a failure
    // are facts about THIS BUILDING's arrangements — they belong to the live
    // obligation, not here, and inventing them would be fiction.
    /** @type {string|null} Who bears the duty in law, from the instrument cited. */
    statutoryDutyHolder: null,
    // ⛔ WHAT NOTICES THE EVENT — the half of every event row that was missing.
    //
    // The register named what FIRES each duty and never named what DETECTS it,
    // so a perfectly-described trigger still rested on somebody remembering to
    // notice. That is not a control; it is a hope with a citation.
    //
    // ⚠ Where the honest answer is "nothing, today", SAY SO. A row reading
    // "NO SOURCE" is worth more than a plausible one, because it is the finding.
    /** @type {string|null} The system or process that must generate the event. */
    triggerSource: null,
    // Why a record is kept for as long as it is. Without this, a bare "10
    // years" reads as a statutory minimum — and no instrument cited anywhere in
    // this register sets a retention period at all.
    /** @type {string|null} Legislation, regulator guidance, contract/insurer, golden thread, or internal policy. */
    retentionBasis: null,
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
  // ⚠ ADDED 2026-09-15 on review, and it is the answer to a gap this register
  // itself reported. The FRA review row said, honestly, that NOTHING WATCHES for
  // art 9(3)(a)'s "reason to suspect the assessment is no longer valid". A
  // finding is not a final state: an honest note that nobody is watching is
  // still nobody watching.
  //
  // The reviewer's framing is the right one — the system does not have to
  // automate the legal judgement, it has to guarantee the concern REACHES a
  // competent decision-maker. That is a control, and it is this row.
  entry({
    key: 'fire_safety_concern_triage',
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it feeds is the responsible person’s review of the fire risk assessment under art 9(3)(a)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '⛔ THIS ROW EXISTS BECAUSE THE REGISTER REPORTED ITS OWN BLIND SPOT. FSO art 9(3)(a) fires the '
      + 'fire risk assessment review on "reason to suspect that it is no longer valid" — and nothing '
      + 'generates that. A defect, an incident, a complaint, a contractor\u2019s remark, a fire and rescue '
      + 'service observation, a change of occupancy or use, an occurrence report or a safety case '
      + 'finding can each BE that reason, and each arrives somewhere different. '
      + '⚠ THE POINT IS THE QUEUE, NOT THE JUDGEMENT. Nothing here decides whether the assessment is '
      + 'still valid — that is the fire risk assessor\u2019s. What this guarantees is that the concern '
      + 'reaches a competent decision-maker and that the decision, including a decision that NO review '
      + 'is needed, is recorded with its reasoning. ⚠ An unrecorded "we considered it and it was '
      + 'nothing" is indistinguishable afterwards from never having considered it. '
      + '⚠ The existing triage rows are NOT this. Occurrence triage asks whether something is '
      + 'reportable to the regulator; complaint triage asks whether a complaint concerns a building '
      + 'safety risk. Both are narrower, and a contractor mentioning a propped-open door on the way '
      + 'out fits neither. '
      + '❓ Confirm the routes in: site staff, contractors, residents, the managing agent, the fire and '
      + 'rescue service, and the assessor. A route nobody knows about is not a route.',
    name: 'Fire safety concern — intake, triage and routing to the FRA trigger',
    description:
      'Receive any fire safety concern by any route — defect, incident, complaint, contractor or fire '
      + 'and rescue service observation, change of occupancy or use, occurrence report, safety case '
      + 'finding, or information that contradicts the fire risk assessment — log it, route it to a '
      + 'competent decision-maker, and record the decision on whether it gives reason to suspect the '
      + 'assessment is no longer valid, including where the decision is that it does not.',
    group: 'fire_safety',
    basis: 'management',
    statutoryRef: 'Our own control, and the route by which the statutory trigger at Regulatory Reform (Fire Safety) Order 2005 art 9(3)(a) — "reason to suspect that it is no longer valid" — can actually be raised. Nothing in the Order says how a responsible person is to become aware of such a reason; that is left to the arrangements art 11 requires for the effective planning, organisation, control, monitoring and review of the preventive and protective measures. ⚠ No interval is stated anywhere, because this is a queue rather than a cycle: the working figure below is how often an empty queue is confirmed to be genuinely empty',
    intervalBasis: 'practice',
    frequencyDays: 30,
    triggerType: 'event',
    trigger: 'Any fire safety concern arising by any route, at the moment it arises',
    triggerSource: 'Every route a concern can arrive by, converging on one queue: occurrence triage, complaint triage, the building work change-control screen, inspection and walk findings, contractor reports, resident contact, and correspondence from the fire and rescue service. ⛔ NONE OF THOSE IS WIRED TO A SINGLE QUEUE TODAY — building the queue is the action, and it is what makes the fire risk assessment\u2019s statutory trigger capable of firing at all',
    responsibleParty: 'Building safety lead, escalating to the fire risk assessor',
    competencyRequired: 'Person able to recognise which concerns may bear on the validity of the fire risk assessment, and to escalate rather than resolve where that is in doubt',
    evidenceRequired: 'Per concern: what was raised, by whom, when, how it arrived, who decided, the decision and its reasoning — including a reasoned record where the decision is that no review is required',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⚠ No home. The nearest things are MOR and complaints intake, and both are narrower than this by design.',
    evidencedBy: null,
    appliesWhen: 'Always — wherever the premises are subject to the Fire Safety Order',
  }),
  entry({
    key: 'fra_review_on_trigger',
    triggerSource: 'The building work change-control screen, the occurrence triage, and the fire risk assessor’s own reporting. ⛔ NOTHING WATCHES FOR "reason to suspect" — that limb has no source at all and depends on a person raising it',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    sourceIntervalWords: 'at least every 3 months (FSER reg 10(6))',
    name: 'Fire door checks — communal doors',
    description: 'Check all fire doors in the common parts, including self-closing devices.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 10(6); self-closing devices reg 10(7)',
    intervalBasis: 'stated',
    frequencyDays: 84,
    maxIntervalDays: 89,
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    sourceIntervalWords: 'at least every 12 months (FSER reg 10(4))',
    name: 'Fire door checks — flat entrance doors',
    reviewerNote:
      'The flat entrance fire door forms part of the COMPARTMENT BOUNDARY and affects the COMMON '
      + 'ESCAPE ROUTE, and FSER reg 10(4) places the specified duty on the RESPONSIBLE PERSON rather '
      + 'than on the occupier. ⚠ That is the accurate framing, and deliberately not "it is a common '
      + 'parts measure" — the inside face of the door and the leaseholder\u2019s repairing obligations '
      + 'are a separate question this register does not need to answer in order to hold the duty. '
      + '⛔ DO NOT CONFLATE THE TWO ACCESS ROUTES. The reg 10(4) duty is best endeavours with reg '
      + '10(5) requiring a record of the ATTEMPTS where access is not obtained; the Building Safety '
      + 'Act s.97 power is a separate mechanism with its own purpose test, written request, 48 hours '
      + '\u2019 notice and county court route. A refused door check evidences reg 10(5); it does not '
      + 'automatically become an s.97 case, and an s.97 request is not a substitute for best '
      + 'endeavours. ❓ Record which route is used when, and how the two records are kept apart. '
      + '⚠ "Best endeavours" is the statutory standard and it is not a lower one. Reg 10(5) requires '
      + 'the ATTEMPTS to be recorded, so a door that could not be reached produces a record rather '
      + 'than a blank — and a year of unrecorded refusals is exactly the failure this row exists to '
      + 'make visible.',
    description: 'Best endeavours to check every flat entrance door opening onto a common part.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 10(4); record of access attempts reg 10(5); self-closing devices reg 10(7)',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 365,
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
    statutoryDutyHolder: 'None — binding by agreement rather than by law',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
  // ⚠ ADDED 2026-09-14, eighth review round, and it is the largest single gap
  // any round has found: the word "compartment" appeared nowhere in 103 rows.
  // The register inspected fire DOORS and never the walls, floors, risers and
  // service penetrations the doors sit in — that is, the measure the doors are
  // part of. Compartmentation is the primary passive measure and the one that
  // degrades invisibly: every cable pull, every new pipe, every re-route leaves
  // a hole, and nothing about a breached compartment line is visible from the
  // corridor. A safety case that cannot evidence its condition has a hole in it
  // in both senses.
  entry({
    key: 'compartmentation_inspection',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '⚠ THE MEASURE THE FIRE DOORS ARE PART OF. This register checked the doors quarterly and '
      + 'annually and never checked the compartment lines they close — walls, floors, risers, ceiling '
      + 'and service voids, and the fire-stopping around every cable, pipe and duct that crosses them. '
      + 'The failure mode is what makes it worth a row: compartmentation is breached by ordinary, '
      + 'authorised work by competent trades who are not thinking about fire, it is concealed above a '
      + 'ceiling or behind a riser door as soon as it is done, and nothing downstream ever reveals it. '
      + '⛔ PRECONDITION, not an improvement: this row needs a compartmentation drawing or schedule to '
      + 'inspect AGAINST. Without one there is no datum, and a report saying "compartmentation '
      + 'inspected" records an opinion rather than a finding. '
      + '⚠ It is a SAMPLING regime — nobody opens every void every year — so the sample basis has to be '
      + 'recorded too: what proportion, chosen how, and on what cycle the whole building is covered. '
      + 'An unrecorded sample cannot be built on by the next survey. '
      + '❓ Confirm whether a compartmentation survey has ever been done, whether the drawings exist, '
      + 'and how a contractor penetration is permitted, recorded and reinstated today — that last one '
      + 'is the control that decides how fast this degrades between surveys.',
    name: 'Compartmentation — periodic inspection',
    description:
      'Inspect the compartment walls and floors and the fire-stopping of the service penetrations, '
      + 'risers, ceiling voids and cavity barriers that cross them, sampling behind access panels and '
      + 'in risers, against the compartmentation drawings; record every breach found, its reinstatement '
      + 'and the sample the survey covered.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Regulatory Reform (Fire Safety) Order 2005, art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" must be "subject to a suitable system of maintenance" and "maintained in an efficient state, in efficient working order and in good repair"; art 9 (the fire risk assessment, which sets the scope and the cycle). Compartmentation is also load-bearing evidence for the safety case under Building Safety Act 2022 s.85 and for the reasonable steps duty at s.84. ⚠ No instrument states an interval — annual sampling is ours, and the fire risk assessment is what should set it',
    intervalBasis: 'practice',
    frequencyDays: 365,
    triggerType: 'calendar',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Competent passive fire protection surveyor, third-party certificated (FIRAS, IFC or equivalent)',
    evidenceRequired: 'Survey report identifying each compartment line sampled and the basis of the sample, with photographs, defects, risk rating and the reinstatement record for each breach',
    retentionPeriodMonths: 120,
    handledBy: 'maintenance',
    handlingNote: 'A contractor survey. ⚠ The permit-to-work half belongs with the building-work change control row — a survey every twelve months cannot keep up with penetrations made weekly. See docs/requirements/unbuilt/Compartments_and_Zones_Spec.md for the unbuilt data model.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always — the building is compartmented and the fire strategy relies on it',
  }),
  // Dampers are where compartmentation and ventilation meet, and they are the
  // part of both that nobody sees. Added with the compartmentation row because
  // a breach and a failed damper are the same failure wearing different labels.
  //
  // ⚠ THE REVIEWER'S REASON DOES NOT HOLD HERE, THE ROW STILL DOES. They
  // inferred dampers from "a two-level basement car park will have mechanical
  // ventilation" — this car park is naturally ventilated and has none. The row
  // is conditional on ducted ventilation actually crossing a compartment line,
  // which is a question nobody has answered either way.
  // ⚠ ADDED 2026-09-14 on review, and the reviewer put it better than the
  // question did: an annual sample finds historic damage; only a control at the
  // point of work prevents new damage. The compartmentation row could only ASK
  // how penetrations are permitted and reinstated. This is that control.
  entry({
    key: 'compartmentation_penetration_control',
    triggerSource: '⛔ NO SOURCE EXISTS TODAY. There is no permit gate, so nothing generates this event. Until one exists the row describes a control that cannot fire — see the actions schedule',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '⚠ THE ANNUAL SURVEY FINDS; THIS PREVENTS. Compartmentation is not breached by neglect, it is '
      + 'breached by authorised work carried out competently by trades who are not thinking about '
      + 'fire — a cable pulled through a riser wall, a pipe re-routed, a duct enlarged. The hole is '
      + 'concealed the same day, and nothing downstream reveals it. A survey once a year cannot keep '
      + 'pace with work carried out weekly, so the two controls are not alternatives and the survey is '
      + 'not the primary one. '
      + '⛔ THIS ROW IS ONLY AS GOOD AS ITS REACH. It has to bind every route by which someone puts a '
      + 'hole in a compartment line — the managing agent\u2019s own contractors, utility and telecoms '
      + 'providers, a leaseholder\u2019s fit-out, and emergency repairs out of hours, which is the route '
      + 'that most often escapes a permit system. A control that covers only planned works records the '
      + 'penetrations that were least likely to be wrong. '
      + '❓ Confirm what exists today: is there a permit-to-work or similar gate, who may authorise a '
      + 'penetration, what proprietary system and installer certification is required for reinstatement, '
      + 'who verifies it before the opening is closed up, and where the record goes. If no gate exists, '
      + 'that is the finding — and it is a more urgent one than any defect the annual survey will find.',
    name: 'Compartmentation — penetration permit and reinstatement',
    description:
      'Before any penetration, alteration or service installation affecting a compartment wall, floor, '
      + 'riser or cavity barrier: authorise it against the compartmentation drawings, specify the '
      + 'proprietary fire-stopping system and the installer certification required, verify and '
      + 'photograph the reinstatement before the opening is closed up, and record it against the '
      + 'compartment line so the next survey inherits it rather than rediscovering it.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair"; art 11 (arrangements for the effective planning, organisation, control, monitoring and review of the preventive and protective measures). Building Safety Act 2022 s.84 — all reasonable steps to prevent a building safety risk materialising, and s.84\u2019s prescribed principles at SI 2023/907 reg 4(c), combating risks "at source ... at the earliest opportunity". ⚠ No instrument states a method or a form; the permit gate and the reinstatement standard are ours to set',
    intervalBasis: 'stated',
    trigger: 'Any penetration, alteration or service installation affecting a compartment wall, floor, riser or cavity barrier — planned or emergency, by any party, including utilities, telecoms and leaseholder fit-out',
    triggerType: 'event',
    responsibleParty: 'Responsible person, through whoever controls access for works',
    competencyRequired: 'Authoriser able to read the compartmentation drawings and specify a tested system; reinstatement by a third-party certificated fire-stopping installer',
    evidenceRequired: 'Per-penetration record: location against the compartment line, who authorised it, the proprietary system and its tested application, installer certification, photographs before closing up, and the verification signature',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⚠ No home. This is the half of compartmentation control that nothing in the portal touches — the works screen catches building work, not a contractor drilling a riser wall.',
    evidencedBy: null,
    appliesWhen: 'Always — the building is compartmented and the fire strategy relies on it',
  }),
  entry({
    key: 'fire_damper_test',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '✅ PARTLY ANSWERED 2026-09-15: ONE DAMPER IS CONFIRMED, AT THE FOOT OF THE REFUSE CHUTE in '
      + 'the upper basement. ✅ ANNUAL, CONFIRMED 2026-09-15, by the same company that services the '
      + 'chute and in the same visit — which satisfies DW145, whose annual is the minimum frequency. '
      + '⚠ ONE VISIT, TWO ACTIVITIES, DIFFERENT COMPONENTS: the damper is one component in the upper '
      + 'basement; the chute service covers eight hoppers and the shaft. Scope each row to its own '
      + 'components and the records cannot merge — a single certificate covering "the chute" is how a '
      + 'clean ends up standing as evidence that a damper was tested. That alone makes '
      + 'this row apply — a single damper is a regime, not an exception. ⚠ Whether there are OTHERS '
      + 'remains open and is expressly held for the next fire strategy survey; the asset register is '
      + 'evidence of what has been recorded, never of what exists. '
      + '⚠ The bin chute damper is worth noting in its own right: it sits between a refuse store, '
      + 'which is among the most common ignition points in a residential block, and the rest of the '
      + 'building. It is exactly the damper you would least want to find seized. '
      + '⚠ AN UNTESTED DAMPER LOOKS EXACTLY LIKE A WORKING ONE, from both sides of the wall, for its '
      + 'whole life. There is no symptom, no alarm and no degraded performance to notice — it either '
      + 'closes on the day or it does not, and the day is the fire. '
      + '⛔ ACCESS IS A FINDING, NOT AN EXEMPTION. The most common outcome of a first damper inspection '
      + 'is that a proportion cannot be reached at all; "no access" recorded against a damper is an '
      + 'open defect requiring an access panel, not a line item that can be repeated annually. BESA '
      + 'revised DW145 in 2024–25 precisely because inspections were finding dampers damaged, wrongly '
      + 'installed against the manufacturer’s instructions, never tested, or impossible to access. '
      + '⚠ Requires an asset register of every damper with location, type and orientation. Without one, '
      + '"all dampers tested" cannot be verified by anybody, including the person who signs it. '
      + '❓ WHAT REMAINS OPEN is whether there are OTHERS, which is held for the next fire strategy '
      + 'survey: any further ducted ventilation, smoke extract or pressurisation crossing a '
      + 'compartment line. ⚠ The row applies either way now — one damper is a regime — so the question '
      + 'is no longer whether to keep the row but how many assets it covers. ⚠ "Not known" is still '
      + 'not the same as "none": the asset register records what has been surveyed, never what exists.'
      + ' ⚠ INTERNAL SCHEDULING LIMIT. The day figure on this row is OUR arithmetic on the period the standard states in words, not a figure the standard contains. It exists so a scheduler that can only count days has something to count, and it does not alter what the standard requires.',
    name: 'Fire and smoke dampers — test and inspection',
    description:
      'Manually test and inspect every fire and smoke damper — drop-test the blade, confirm the fusible '
      + 'link or actuator and any control signal, reinstate and prove reset, clean the housing, and '
      + 'record the condition of each damper by location against the damper asset register.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BESA DW145 (2nd edition, 2025) — fire and smoke dampers to be manually tested and inspected at least annually, more frequently where the risk assessment requires; BS 9999:2017 aligns. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    maxIsSchedulingTolerance: true,
    sourceIntervalWords: 'at least annually (BESA DW145, 2nd ed. 2025)',
    triggerType: 'calendar',
    responsibleParty: 'Ventilation or fire damper contractor',
    competencyRequired: 'Competent damper engineer as defined by DW145',
    evidenceRequired: 'Test record per damper — reference, location, type, result, defects, and the reason recorded against any damper that could not be accessed',
    retentionPeriodMonths: 120,
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Ducted ventilation, smoke extract or pressurisation crosses a compartment line, or the fire strategy relies on dampers at a compartment boundary',
  }),
  entry({
    key: 'fire_alarm_weekly_test',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    name: 'Fire alarm — weekly test',
    description:
      'Carry out the weekly user test required by the adopted fire alarm standard and the system’s '
      + 'cause-and-effect arrangement — normally operating a manual call point and rotating the point '
      + 'tested so that all are covered over an appropriate period.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 5839-1, weekly testing by the user — the precise test follows the system’s category, design and log book, and the edition of the standard adopted for this installation. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 7,
    maxIntervalDays: 7,
    maxIsSchedulingTolerance: true,
    sourceIntervalWords: 'weekly (BS 5839-1)',
    reviewerNote: '⚠ INTERNAL SCHEDULING LIMIT. The day figure on this row is OUR arithmetic on the period the standard states in words, not a figure the standard contains. It exists so a scheduler that can only count days has something to count, and it does not alter what the standard requires.',
    responsibleParty: 'Responsible person or site staff',
    competencyRequired: 'Briefed site staff; no formal qualification required',
    evidenceRequired: 'Logbook entry naming the call point tested and the result',
    handledBy: 'inspection',
    evidencedBy: 'inspection',
    appliesWhen: 'Building has a fire detection and alarm system',
  }),
  entry({
    key: 'fire_alarm_service',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    name: 'Fire alarm — periodic inspection and service',
    description:
      'Periodic inspection and servicing of the fire detection and alarm system by a competent '
      + 'engineer, INCLUDING the standby power supply the system depends on — battery condition, '
      + 'charger operation and the fault alarms — which BS 5839-1 covers within servicing but which '
      + 'is easy to leave unstated and therefore unverified.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 5839-1, periodic inspection and servicing. ⚠ SIX-MONTHLY IS NOT TO BE TREATED AS A UNIVERSAL INTERVAL. THE ADOPTED BS 5839-1 EDITION AND SYSTEM CATEGORY ARE NOT RECORDED, and until they are, the most that can honestly be said is that six-monthly is the conventional period between service visits and the one we schedule to: the edition, the system category and the installation’s own documentation are what determine the permitted interval, and BS 5839-1 contemplates the fire risk assessment calling for more frequent attendance — for a higher-risk building with systems linked to smoke control that is a live possibility rather than a theoretical one. ❓ Confirm the edition adopted, the system category, the cause-and-effect schedule, whether the installation includes detectors linked to smoke control, who carries testing responsibility and how defects escalate. ⚠ This servicing does NOT discharge the statutory monthly reg 7 check, nor the weekly user test. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all',
    intervalBasis: 'stated',
    frequencyDays: 182,
    maxIntervalDays: 183,
    maxIsSchedulingTolerance: true,
    sourceIntervalWords: 'six months between service visits (BS 5839-1)',
    reviewerNote: '⚠ INTERNAL SCHEDULING LIMIT. The day figure on this row is OUR arithmetic on the period the standard states in words, not a figure the standard contains. It exists so a scheduler that can only count days has something to count, and it does not alter what the standard requires.',
    responsibleParty: 'Fire alarm service contractor',
    competencyRequired: 'Competent fire alarm engineer; BAFE SP203-1 certificated firm recommended',
    evidenceRequired: 'Servicing certificate listing devices tested and any non-compliances',
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a fire detection and alarm system',
  }),
  entry({
    key: 'emergency_lighting_monthly',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    name: 'Emergency lighting — monthly function test',
    description: 'Short-duration function test of every emergency luminaire and exit sign.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 5266-1 / BS EN 50172, monthly function test. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 30,
    maxIntervalDays: 31,
    maxIsSchedulingTolerance: true,
    sourceIntervalWords: 'monthly (BS 5266-1 / BS EN 50172)',
    reviewerNote: '⚠ INTERNAL SCHEDULING LIMIT. The day figure on this row is OUR arithmetic on the period the standard states in words, not a figure the standard contains. It exists so a scheduler that can only count days has something to count, and it does not alter what the standard requires.',
    responsibleParty: 'Responsible person or site staff',
    competencyRequired: 'Briefed site staff',
    evidenceRequired: 'Logbook entry per test, with any failed luminaires identified',
    handledBy: 'inspection',
    evidencedBy: 'inspection',
    appliesWhen: 'Building has emergency escape lighting',
  }),
  entry({
    key: 'emergency_lighting_annual',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    name: 'Emergency lighting — annual full-duration test',
    description:
      'Full rated-duration discharge test (normally three hours), with luminaires recharged '
      + 'afterwards. ⚠ Where the supply is a CENTRAL battery system, this proves the outcome on the '
      + 'day but is not its maintenance — that has its own row, and the two do not substitute for '
      + 'one another.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 5266-1, annual full-duration test. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    maxIsSchedulingTolerance: true,
    sourceIntervalWords: 'annual full-duration test (BS 5266-1)',
    reviewerNote: '⚠ INTERNAL SCHEDULING LIMIT. The day figure on this row is OUR arithmetic on the period the standard states in words, not a figure the standard contains. It exists so a scheduler that can only count days has something to count, and it does not alter what the standard requires.',
    responsibleParty: 'Emergency lighting contractor',
    competencyRequired: 'Competent electrical contractor',
    evidenceRequired: 'Annual test certificate recording the duration achieved per luminaire',
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has emergency escape lighting',
  }),
  entry({
    key: 'emergency_lighting_central_battery',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '⚠ THIS IS NOT DISCHARGED BY THE ANNUAL LIGHTING TEST, and it is easy to believe it is. The '
      + 'full-duration test proves the system delivered its rated duration on the day; it does not '
      + 'check the charger, the individual cell or block voltages, terminal condition, the battery '
      + 'room temperature and ventilation, or that the fault alarms still work. A battery can pass a '
      + 'discharge test while months from failing. '
      + 'The reason to treat it separately is the failure mode: with self-contained luminaires a '
      + 'failed battery loses ONE light, and with a central system it loses EVERY light at once. '
      + '❓ Confirm the manufacturer\'s service schedule for the installed system, whether the cells '
      + 'are sealed or vented — vented cells need battery-room ventilation and electrolyte checks '
      + 'that sealed ones do not — and the design duration the system is supposed to deliver.',
    name: 'Emergency lighting central battery system — inspection and maintenance',
    description:
      'Inspect and maintain the central power supply system feeding the emergency lighting: the '
      + 'charger and its operation, battery condition and cell or block voltages, terminals and '
      + 'connections, the battery enclosure or room including its temperature and ventilation, and '
      + 'the fault and mains-failure alarms.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS EN 50171 (central power supply systems) with BS 5266-1 and BS EN 50172 for the emergency lighting regime it serves; the interval follows the manufacturer\'s service schedule, commonly six-monthly. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all',
    intervalBasis: 'practice',
    frequencyDays: 182,
    triggerType: 'calendar',
    responsibleParty: 'Emergency lighting or central battery contractor',
    competencyRequired: 'Engineer competent in central battery systems — not the same skill as testing self-contained luminaires',
    evidenceRequired: 'Service record showing charger operation, measured cell or block voltages against the expected values, connection and enclosure condition, and alarms proved',
    retentionPeriodMonths: 60,
    handledBy: 'maintenance',
    handlingNote: 'A distinct asset from the luminaires, and worth scheduling as one. The annual duration test stays where it is — this does not replace it either.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Emergency lighting is fed from a central battery or central power supply system rather than from self-contained luminaires',
  }),
  entry({
    key: 'standby_power_supply_check',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      'Written generally because the asset varies and the building is expected to gain one: a '
      + 'standby generator, a UPS, a second incoming supply, or a battery serving a lift. What they '
      + 'have in common is that a life safety system depends on them and nothing exercises them in '
      + 'normal use — so the failure is silent until the day it matters. '
      + '❓ TWO THINGS TO ESTABLISH, and the first may already apply: whether any lift here is a '
      + 'firefighters\' or evacuation lift, because those require a secondary power supply and its '
      + 'regime comes with them; and whether the lift emergency communication unit has its own '
      + 'battery, since it has to work during exactly the power failure that traps someone. '
      + 'A passenger lift battery is expected in due course, at which point this switches on.',
    name: 'Secondary and standby power supplies — test and maintain',
    description:
      'Test and maintain each secondary or standby power supply on which a life safety system '
      + 'depends — standby generator, uninterruptible supply, second incoming supply or dedicated '
      + 'battery — including a load test proving it carries the load it exists for, the changeover, '
      + 'the fuel or battery condition, and the alarms that report its failure.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 9999 and the design basis of the system being supported set what the secondary supply must achieve; BS EN 50171 where it is a central power supply, and the manufacturer\'s schedule otherwise. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1), which reaches the facilities and equipment a fire safety measure depends on as much as the measure itself',
    intervalBasis: 'practice',
    frequencyDays: 182,
    triggerType: 'calendar',
    responsibleParty: 'Contractor for the supply concerned',
    competencyRequired: 'Engineer competent in the supply type — a generator, a UPS and a lift battery are three different regimes',
    evidenceRequired: 'Test record per supply showing the changeover proved, the load carried and for how long, and the fault alarms proved',
    retentionPeriodMonths: 60,
    handledBy: 'maintenance',
    handlingNote: 'Nothing to schedule until such a supply exists. Record the not-applicable decision with a review date — this is one that is expected to change.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'A life safety system depends on a standby generator, an uninterruptible supply, a second incoming supply or a dedicated battery',
  }),
  entry({
    key: 'sprinkler_weekly_test',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy, with a contract or insurer requirement on top — confirm the policy condition, which may be longer',
    name: 'Suppression system — weekly test',
    description: 'Weekly test routine on the sprinkler or suppression system, including any pump run.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'The weekly routine is specified by the suppression standard itself (BS EN 12845 or BS 9251, per the installed design basis), with the LPC Rules and the insurance policy condition on top. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 7,
    maxIntervalDays: 7,
    maxIsSchedulingTolerance: true,
    sourceIntervalWords: 'weekly (BS EN 12845 or BS 9251, per the installed design basis)',
    reviewerNote: 'Reclassified from "Contract or scheme" to "Standard" on review, and the reasoning is worth keeping: the insurance condition is real, but it is not why the test has to happen. The suppression standards specify the weekly routine, and a suppression system is a fire safety measure, so art 17(1) applies to it. An insurer can waive its own policy condition; art 17 is not waivable.'
      + ' ⚠ INTERNAL SCHEDULING LIMIT. The day figure on this row is OUR arithmetic on the period the standard states in words, not a figure the standard contains. It exists so a scheduler that can only count days has something to count, and it does not alter what the standard requires.',
    responsibleParty: 'Site staff',
    competencyRequired: 'Briefed site staff working to the system’s own test routine',
    evidenceRequired: 'Weekly test log with sign-off',
    handledBy: 'inspection',
    handlingNote: 'A weekly inspection walk; the insurer’s condition is what makes it binding.',
    evidencedBy: 'inspection',
    appliesWhen: 'Building has a sprinkler or other fixed suppression system',
  }),
  // ⚠ ADDED 2026-09-14 on review. The register held a weekly test and an annual
  // service and nothing between, while both candidate standards set a TIERED
  // programme. The reviewer proposed quarterly from BS EN 12845; the duty
  // holder confirmed the installed regime is six-monthly and that this is
  // considered right for a car park system. Both can be true — which is why the
  // row records the adopted interval AND the condition that would change it,
  // rather than a figure from a standard we have not yet identified.
  entry({
    key: 'sprinkler_periodic_service',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy, with a contract or insurer requirement on top — confirm the policy condition, which may be longer',
    reviewerNote:
      '⛔ INTERIM ADOPTED CONTROL, PENDING CONFIRMATION OF THE GOVERNING DESIGN AND MAINTENANCE '
      + 'BASIS — an adopted interval, not a confirmed regime, and not to be presented as one. '
      + 'The weekly test and the annual service were the whole regime, and neither candidate standard '
      + 'works that way — each sets cycles inside the year for the pump, the water supply, the tanks, '
      + 'the valves and the alarm and flow devices. '
      + '⚠ THE ADOPTED SIX MONTHS REFLECTS SUPPRESSION IN THE CAR PARK ONLY (confirmed by the duty '
      + 'holder, 2026-09-14), and that is the judgement to revisit rather than the interval to copy. '
      + '⛔ If suppression is ever extended to residential accommodation, this interval and the annual '
      + 'row both have to be re-derived from the governing standard rather than carried across — the '
      + 'consequence of a dormant defect is different where people sleep. '
      + '❓ The standing question is the same one the annual row asks: identify the governing standard, '
      + 'and this row can state its tiers instead of our adopted figure.',
    name: 'Suppression system — intermediate periodic service',
    description:
      'The servicing the governing suppression standard sets between annual visits — pump run and '
      + 'performance against the design duty, water supply and tank condition, valve and alarm tests, '
      + 'gauges and flow switches, and the trace-heating or antifreeze arrangements where the system '
      + 'is exposed.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS EN 12845 or BS 9251 per the installed design basis, each of which sets a tiered servicing programme rather than a single annual visit, with any LPC Rules requirement on top. ⚠ WHICH GOVERNS IS NOT RECORDED, so the tier structure cannot be stated here and six-monthly is the interval adopted for this installation. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all',
    intervalBasis: 'practice',
    frequencyDays: 182,
    triggerType: 'calendar',
    responsibleParty: 'Suppression system contractor',
    competencyRequired: 'Competent sprinkler engineer (LPCB or BAFE SP203-4 certificated)',
    evidenceRequired: 'Service report per visit recording the pump run, water supply and valve tests, with any defect and its rectification',
    retentionPeriodMonths: 120,
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a sprinkler or other fixed suppression system',
  }),
  entry({
    key: 'sprinkler_annual_service',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy, with a contract or insurer requirement on top — confirm the policy condition, which may be longer',
    name: 'Suppression system — annual service',
    description: 'Annual service and test of the sprinkler or residential suppression system.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: '⚠ THE INSTALLED DESIGN BASIS IS NOT RECORDED, SO THE INTERVAL SOURCE IS UNKNOWN RATHER THAN STATED. One of BS 9251 (residential sprinkler) or BS EN 12845 will govern, with any LPC Rules requirement on top — which applies here depends on how the system was designed and commissioned, and alternatives must not be left in a live row. Annual is therefore OUR adopted cycle until the governing standard is identified, not a figure read out of it — and each candidate standard sets a TIERED programme with shorter cycles inside the year, so identifying the standard is more likely to add cycles than to confirm this one. ❓ Confirm the standard used for design and commissioning, the pump and tank arrangement, the servicing regime it sets, any insurer requirement, and whether any part falls within the statutory monthly reg 7 check. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all.',
    intervalBasis: 'practice',
    frequencyDays: 365,
    reviewerNote: '⛔ INTERIM ADOPTED CONTROL, PENDING CONFIRMATION OF THE GOVERNING DESIGN AND MAINTENANCE BASIS. Technically unverified: this row records what we do, not a regime anyone has confirmed is the right one for this installation, and it must not be presented as a technically complete one. The interval is ours, and it cannot be the reference’s while the governing standard is unrecorded — the row said both things at once until this was corrected. ⚠ Both candidate standards set a tiered servicing programme rather than a single annual visit; the paired intermediate-service row is where that detail lands once the design basis is confirmed.',
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy, with a contract or insurer requirement on top — confirm the policy condition, which may be longer',
    reviewerNote: '⛔ TECHNICALLY UNVERIFIED, and it matters more here than for most rows because the dry riser is expressly within the STATUTORY monthly check as essential fire-fighting equipment under FSER reg 6(7), so four rows touch one asset and the relationship between them has never been settled. What is unresolved: the BS 9990 edition adopted · whether an annual wet pressure test is the correct test for THIS installation and at what pressure and duration · what the six-monthly visual adds to it · and what, if anything, the fire and rescue service or the insurer requires on top. Until that is answered the servicing regime is what we inherited rather than what was specified.'
      + ' ⚠ INTERNAL SCHEDULING LIMIT. The day figure on this row is OUR arithmetic on the period the standard states in words, not a figure the standard contains. It exists so a scheduler that can only count days has something to count, and it does not alter what the standard requires.',
    name: 'Dry riser — annual test, method and interval pending confirmation',
    description: 'Annual wet pressure test of the riser main, landing valves and inlet breeching.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 9990, annual test. ⚠ THE ADOPTED EDITION AND SYSTEM-SPECIFIC METHOD ARE NOT RECORDED. ❓ Confirm the BS 9990 edition adopted for this installation, whether the annual test is correctly described as a wet pressure test and at what pressure and duration, the treatment of landing valves and the inlet breeching, the visual inspection interval, any fire and rescue service expectation, and the relationship to the statutory monthly reg 7 check — the riser is reg 6(7) key fire-fighting equipment, so the same asset is touched by both rows. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    maxIsSchedulingTolerance: true,
    sourceIntervalWords: 'annual (BS 9990)',
    responsibleParty: 'Riser service contractor',
    competencyRequired: 'Competent dry riser engineer',
    evidenceRequired: 'Annual test certificate recording pressure held and duration',
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Building has a dry (or wet) riser',
  }),
  entry({
    key: 'dry_riser_visual',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    name: 'Dry riser — six-monthly visual inspection',
    description: 'Visual inspection of inlets, outlets, cabinets and padlocks between annual tests.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 9990, six-monthly visual inspection. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 182,
    maxIntervalDays: 183,
    maxIsSchedulingTolerance: true,
    sourceIntervalWords: 'six-monthly (BS 9990)',
    reviewerNote: '⚠ INTERNAL SCHEDULING LIMIT. The day figure on this row is OUR arithmetic on the period the standard states in words, not a figure the standard contains. It exists so a scheduler that can only count days has something to count, and it does not alter what the standard requires.',
    responsibleParty: 'Responsible person or riser contractor',
    competencyRequired: 'Briefed site staff or riser engineer',
    evidenceRequired: 'Inspection record noting condition and any missing components',
    handledBy: 'inspection',
    evidencedBy: 'inspection',
    appliesWhen: 'Building has a dry (or wet) riser',
  }),
  entry({
    key: 'extinguishers_annual_service',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    name: 'Fire extinguishers — annual basic service',
    description: 'Basic service of every portable extinguisher by a competent technician.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 5306-3, basic service. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all.',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 366,
    maxIsSchedulingTolerance: true,
    sourceIntervalWords: 'annual basic service (BS 5306-3)',
    reviewerNote: '⚠ INTERNAL SCHEDULING LIMIT. The day figure on this row is OUR arithmetic on the period the standard states in words, not a figure the standard contains. It exists so a scheduler that can only count days has something to count, and it does not alter what the standard requires.',
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    name: 'Stair smoke control / AOV system — service',
    description:
      'Service and functional test of a mechanical smoke control or automatic opening vent system '
      + 'serving a STAIRCASE — the vents or dampers, the smoke shaft, the fans where the system is '
      + 'powered, the control panel, the fire-mode changeover, and the cause-and-effect proved '
      + 'against the fire strategy.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS EN 12101 (product and system series) and BS 7346-8 (smoke control), periodic servicing. ⚠ Neither alone prescribes the service interval for a particular installation — six-monthly is the building’s adopted interval, to be confirmed against the design specification, the commissioning information, the manufacturer’s requirements and the fire strategy. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all.',
    intervalBasis: 'practice',
    frequencyDays: 182,
    // ⚠ `maxIntervalDays: 366` removed 2026-09-13 on external review, which
    // caught the contradiction: a six-monthly chosen cycle cannot have a
    // twelve-month "maximum permitted interval" — nothing permits it, because
    // no instrument sets one. A servicing standard is not a legal ceiling, and
    // printing one invented a limit that does not exist.
    triggerType: 'calendar',
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
    reviewerNote: 'Six-monthly servicing is the technical regime and is not a legal maximum. Separately, any detectors linked to this system fall within the MONTHLY statutory check — servicing does not discharge that. ⚠ THIS ROW IS THE STAIRCASE PROVISION ONLY. Smoke control elsewhere in the building has its own rows and must not be folded in here — the corridors and lobbies, and the car park — because they are separate installations, commissioned separately, and a single row would let one of them be serviced and all of them reported as done. PAIRED WITH the openable-window row: a stair is smoke-ventilated mechanically or naturally, and this register carries both so that either can be switched on. ⚠ No mechanical smoke control system is installed at present, so this row is currently recorded as not applicable; that decision carries a review date and is reversed — not re-written — when a system is commissioned. Six-monthly servicing is our adopted interval and not a figure either standard sets for every installation; confirm it against the system’s design, commissioning record, manufacturer requirements and the fire strategy at that point.',
    appliesWhen: 'A mechanical smoke control or automatic opening vent system serves a STAIRCASE. ⚠ Not the case today — recorded as not applicable, to be reinstated when a system is commissioned',
  }),
  // ⚠ ADDED 2026-09-13. It emerged from a fact rather than from a review: the
  // second staircase is ventilated by OPENABLE WINDOWS, and that is accepted as
  // sufficient. A provision that is relied on has to be verified, and nothing
  // in this register verified it. A window painted shut, obstructed, locked or restricted
  // is a failed smoke ventilation provision that looks like a window.
  entry({
    key: 'stair_openable_vent_check',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      'This row exists because a staircase is ventilated by openable windows rather than by a mechanical system, '
      + 'and that arrangement is accepted as sufficient. Acceptance is conditional on the windows '
      + 'still opening. ⚠ The failure modes are quiet and cumulative — paint, sealant, a replaced '
      + 'handle, a security restrictor fitted in good faith, furniture or stored items in front of '
      + 'the opening, a stiff mechanism nobody reports because nobody opens it in the ordinary way. '
      + 'None of them announces itself, and none is visible in a check that only looks at the stair. '
      + '⛔ THE WINDOWS ARE NOT YET MODELLED AS COMPONENTS (confirmed 2026-09-15 — they were not '
      + 'considered important when the asset register was built, and are to be added). Until they are, '
      + 'this row has nothing to be scheduled against and no per-window record can exist. ⚠ That is an '
      + 'asset-data gap rather than a compliance one, but it has the same effect: the provision this '
      + 'building relies on for stair smoke ventilation is currently checked by nothing. '
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
      + '⚠ Six-monthly matches the interval a mechanical system would carry deliberately — the two provisions '
      + 'do the same job and there is no reason to verify one more often than the other. The interval '
      + 'is ours; nothing sets it.',
    evidencedBy: 'inspection',
    appliesWhen: 'A staircase relies on openable windows for smoke ventilation. ⚠ True of both staircases today; reconsider per stair if a mechanical system is commissioned for either',
  }),
  // ⚠ ADDED 2026-09-14, and the question behind it is unanswered rather than
  // answered. §2 of the statement described smoke ventilation of the two STAIRS
  // and said nothing about the residential CORRIDORS; the reviewer noticed the
  // silence. A corridor smoke control system is a separate installation from
  // stair ventilation, and it is the one a firefighting operation in a lobby
  // depends on. The row states the condition and asks the question — it does
  // not assert a system, because nobody has confirmed one either way.
  entry({
    key: 'corridor_smoke_control_service',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '⚠ RAISED ON REVIEW AND NOT YET ANSWERED. This register described the ventilation of the two '
      + 'staircases and was silent about the residential corridors and lobbies — and a silence in a '
      + 'register reads as "nothing here" when it may mean "nobody asked". A corridor system is a '
      + 'separate installation with its own shaft, per-floor dampers, extract fans, control panel, '
      + 'cause-and-effect and standby power; it is not covered by the stair rows and it would not be '
      + 'caught by any of them. '
      + '❓ Confirm from the APPROVED FIRE STRATEGY what the residential corridors are provided with. '
      + 'If the answer is that they have no mechanical system, that is itself a fire strategy '
      + 'statement — record it as the reason this row does not apply, so the absence reads as a '
      + 'decision. ⚠ If there IS a system, it does not arrive alone: it brings the damper row, the '
      + 'secondary and standby power row, and the FSER reg 7 monthly check, which reaches smoke '
      + 'control located within the common parts.',
    name: 'Corridor and lobby smoke control — system service',
    description:
      'Service and functional test of a mechanical smoke ventilation system serving the residential '
      + 'corridors or lobbies — the extract fans, the shaft, the per-floor dampers, the control panel '
      + 'and its fire-mode changeover, the standby power supply, and the cause-and-effect proved '
      + 'against the fire strategy rather than against the panel’s own configuration.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 7346-8 and the BS EN 12101 series (smoke and heat control systems), periodic servicing; Smoke Control Association guidance for the method. ⚠ Neither prescribes the interval for a particular installation — six-monthly is our adopted interval, to be confirmed against the design specification, the commissioning record, the manufacturer’s requirements and the fire strategy. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all',
    intervalBasis: 'practice',
    frequencyDays: 182,
    triggerType: 'calendar',
    responsibleParty: 'Smoke control contractor',
    competencyRequired: 'Competent smoke control engineer (Smoke Control Association member firm recommended)',
    evidenceRequired: 'Service certificate recording each fan, damper and control tested, the fire-mode changeover proved, and the cause-and-effect verified against the fire strategy',
    retentionPeriodMonths: 120,
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'A mechanical smoke control system serves the residential corridors or lobbies. ⚠ Not established either way — confirm against the approved fire strategy and record the answer as a decision rather than leaving it silent',
  }),
  entry({
    key: 'fser_monthly_equipment_check',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    // ⚠ Reg 7(4) is UNCONDITIONAL — "must make a record ... and make that record
    // accessible to the residents of the building". Not on request. Verified
    // against legislation.gov.uk 2026-09-14. The record is made and is not
    // accessible, which is a control deficiency rather than an open question,
    // and it is tracked as an action rather than as something we would like to
    // know. The METHOD is ours to choose; the duty is not.
    sourceIntervalWords: 'monthly routine checks (FSER reg 7(1)) — the Regulations state no permitted maximum',
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
      'Monthly routine check of each INSTALLED item of key fire-fighting equipment listed in reg 6(7) '
      + 'and brought into the monthly routine-check duty through reg 7(1) and reg 7(5) — the '
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    sourceIntervalWords: 'monthly routine checks (FSER reg 7(1)) — the Regulations state no permitted maximum',
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryRef: 'BS 7346-7 (smoke control in car parks) and the system’s design and commissioning basis, which set the servicing regime. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all',
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryRef: 'Regulatory Reform (Fire Safety) Order 2005, art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" must be "subject to a suitable system of maintenance" and "maintained in an efficient state, in efficient working order and in good repair". The free area and its locations come from the fire strategy and the Building Regulations approval, not from the Order, and the interval is ours',
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
    key: 'evacuation_alert_system_service',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      'NOT INSTALLED, and there is no duty to install one. An evacuation alert system is the secure '
      + 'means by which the FIRE AND RESCUE SERVICE evacuates chosen floors or cores — it is their '
      + 'tool, not a building alarm, and it exists because a building operating stay-put has no other '
      + 'way to move part of itself. Approved Document B has required one in NEW high-rise '
      + 'residential buildings over 18 metres in England since December 2022; government considered '
      + 'and DECLINED to mandate retrofit to existing buildings. BS 8629 treats existing buildings as '
      + 'best practice. '
      + '⚠ WHETHER ONE IS NEEDED HERE FOLLOWS FROM THE EVACUATION STRATEGY, and that is a fire risk '
      + 'assessment question rather than a register one. Under stay-put, the alert system is how a '
      + 'floor gets evacuated. Under simultaneous evacuation the common alarm does that job — which '
      + 'is a coherent reason not to have one, and is worth recording as the reason rather than '
      + 'leaving the absence unexplained. '
      + '❓ Record the decision against the strategy actually in force. If one is ever installed this '
      + 'row switches on, and it also joins the STATUTORY monthly check automatically — reg 7(5)(b) '
      + 'names evacuation alert systems in the common parts, so no separate decision is needed there.',
    name: 'Evacuation alert system — inspection and servicing',
    description:
      'Inspection, testing and servicing of the evacuation alert system used by the fire and rescue '
      + 'service to signal evacuation of selected floors or cores, including the alert panel, its '
      + 'secure enclosure and the circuits to each floor.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 8629 (design, installation, commissioning and maintenance of evacuation alert systems in buildings containing flats), which sets the servicing regime. ⚠ THE UNDERLYING DUTY IS STATUTORY where a system exists: Regulatory Reform (Fire Safety) Order 2005 art 17(1) requires it, "where necessary in order to safeguard the safety of relevant persons", to be "subject to a suitable system of maintenance" and "maintained in an efficient state, in efficient working order and in good repair", and FSER 2022 reg 7(5)(b) brings it into the monthly routine check when located in the common parts',
    intervalBasis: 'practice',
    frequencyDays: 182,
    triggerType: 'calendar',
    responsibleParty: 'Fire alarm or evacuation alert contractor',
    competencyRequired: 'Engineer competent in BS 8629 — an evacuation alert system is not a fire alarm and is not serviced as one',
    evidenceRequired: 'Service certificate covering the panel, its security, and the alert circuit to every floor',
    retentionPeriodMonths: 60,
    handledBy: 'maintenance',
    handlingNote: 'Nothing to schedule — no system is installed. Record the not-applicable decision against the evacuation strategy rather than leaving the row unanswered.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'An evacuation alert system to BS 8629 is installed. ⚠ Not the case today, and no duty requires one to be retrofitted to an existing building',
  }),
  entry({
    key: 'fser_wayfinding_signage',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    name: 'Secure information box — monthly check',
    description: 'Check the box is present, secure and accessible, and that the lock works.',
    group: 'fire_safety',
    basis: 'statute',
    reviewerNote:
      '✅ THE BOX IS MODELLED as a component (confirmed 2026-09-15). ⚠ But it shares a component type '
      + 'with the resident fire safety information and the fire alarm zone plan, and an obligation '
      + 'scope cannot name an individual component — so scoping this row to that type would attribute '
      + 'a "secure information box check" to a notice board and a zone plan as well. '
      + '⛔ The evidence would read as compliant and be about the wrong asset, which is worse than no '
      + 'evidence. Give the box a type or an attribute of its own before scheduling this row. '
      + '⚠ Worth noting the three are genuinely three duties: the box is FSER reg 4, the resident '
      + 'information is reg 9, and the zone plan belongs to the detection and alarm system. The type '
      + 'is doing the work of a category and is too coarse for any of them.',
    statutoryRef: 'MONTHLY IS OUR INTERNAL CHECK FREQUENCY. Fire Safety (England) Regulations 2022 reg 4(5) requires the responsible person to inspect the secure information box AT LEAST ANNUALLY and ensure it continues to meet reg 4(2) — that is the statutory duty and the statutory interval. We check monthly because a box that has been forced, blocked or re-keyed is discovered by looking at it, and an annual cycle can leave that unnoticed for eleven months. Reg 4(2) sets what the box must be: readily accessible to the fire and rescue authority, capable of holding the documents these Regulations require in it, and reasonably secure against unauthorised access and vandalism',
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
    reviewerNote: '⚠ "BOX INSPECTED" IS NOT EVIDENCE THAT ITS CONTENTS ARE CURRENT, and the two must be separate records. The monthly row looks at the box — present, secure, accessible, lock working, which is reg 4(2) and reg 4(5). This row looks at what is INSIDE it, and the contents come from two different places: reg 4(3) prescribes the contact information and requires the box to hold such documents as the Regulations require, while what those plans must SHOW comes from reg 6, and reg 6(5) is what puts the hard copies there. ⛔ A box that passes inspection while holding last year\u2019s floor plans passes nothing that matters.',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
    name: 'Secure information box — content review',
    description: 'Confirm the contents are current: the responsible person’s contact details and hard-copy floor plans.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (England) Regulations 2022 — reg 4(3) prescribes the CONTENTS of the box: the responsible person’s name, UK address and telephone number, the names and contact information of such other persons permitted to access the building as the responsible person considers appropriate, and such documents as these Regulations require to be placed in it. Reg 4(4) requires the fire and rescue authority to be given whatever it needs to open the box, and anything further as soon as reasonably practicable when that changes. Reg 4(5) is the at-least-annual inspection duty. ⚠ THE PLANS IN THE BOX ARE NOT PRESCRIBED BY REG 4 — their content comes from reg 6, and reg 6(5) is what puts the hard copies in the box. Reg 4 says the box must hold what the Regulations require; reg 6 says what those plans must show. Do not read reg 4 as the source of the plan content',
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
    triggerSource: 'Building Assets — a change to floor plans, component locations or a lift designation. ⚠ A layout change made on site and not drawn generates nothing',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      'This is the statutory duty; the annual confirmation on the next row is our own assurance net and '
      + 'must not be mistaken for the trigger. ⚠ Reg 11 requires the reg 6 plans to be provided to the '
      + 'fire and rescue authority by electronic means. '
      + '⛔ WHAT FOLLOWS IS OUR LEGAL INTERPRETATION AND CONTROL DECISION, NOT THE EXPRESS WORDS OF THE '
      + 'INSTRUMENT, and it is labelled so that nobody later cites it back as statute. Reg 6(6) '
      + 'requires the plans to be UPDATED after the specified change; reg 11 requires the prescribed '
      + 'information to be PROVIDED to the fire and rescue authority electronically. Reg 11 does not IN '
      + 'TERMS spell out re-provision of a revised version. OUR CONTROL is to re-issue each revised '
      + 'plan electronically and retain proof of transmission — because an authority holding a '
      + 'SUPERSEDED plan is worse placed than one holding none, and the safe course costs an email. '
      + '❓ Obtain legal confirmation before adopting any narrower reading.',
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
    trigger: 'Any change to the layout of the building, or to the location of key fire-fighting equipment — rising main inlets and outlets, smoke control, suppression — and any change that makes what the plans must SHOW inaccurate, including the installation, removal or re-designation of a lift, since reg 6(2) requires the plans to identify all lifts and note which are firefighters’ or evacuation lifts',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    assuranceOnly: 'the update-on-change row — FSER reg 6(6) fires on a change to the layout or to the location of key fire-fighting equipment',
    reviewerNote: 'This annual pass is OUR control, not a statutory cycle — the statutory duty is the event-driven update on the preceding row. It exists to catch a change nobody told us about. ⚠ Deliberately framed as confirming what WE sent and what the box holds, not what the fire and rescue authority currently holds: we cannot see their records, and nothing requires them to reconfirm annually. Writing it the other way would invent a duty for them and a dependency for us.',
    name: 'Fire and rescue service plans — annual confirmation',
    description:
      'OUR ASSURANCE CONTROL OVER THE PRECEDING DUTY, NOT A DUTY IN ITSELF. '
      + 'Confirm that the current floor plans and building plan have been provided to the fire and '
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    assuranceOnly: 'the event and request row — SI 2025/797 regs 5 and 6 fire on identification and on a resident\u2019s request, not on a date',
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    assuranceOnly: 'the event and request row — SI 2025/797 regs 7 and 8 follow an assessment, not a calendar',
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    assuranceOnly: 'the event and request row — SI 2025/797 reg 10 follows consent being given, changed or withdrawn',
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
  // ⚠ ADDED 2026-09-14, ninth review round — and this is the SIXTH time the
  // same shape has been found in this register. The five before it: FSER reg
  // 6(6) plans, the MOR and complaints workflows our annual rows audited, the
  // fire risk assessment's art 9(3) triggers, and the KBI 28-day notification.
  //
  // The irony is the sharp part of the finding. Rounds 3 and 4 added four
  // interface rows for SI 2025/797 precisely BECAUSE the regime was reduced to
  // an annual review — and then gave three of them frequencyDays 365 and a
  // calendar trigger. The duties were captured and the control mechanism
  // reproduced the very defect it was added to cure.
  //
  // Verified against the instrument 2026-09-14:
  //   reg 6(a)  offer a PCFRA to each relevant resident identified under reg 5
  //   reg 6(b)  MUST carry one out for each relevant resident who REQUESTS one
  //   reg 9(4)  review earlier than the 12 months where there is reason to
  //             believe the assessment or statement requires amending, OR at
  //             the reasonable request of the relevant resident
  //   reg 9     an earlier triggered review RESETS the 12-month clock
  //
  // None of that is a date. The annual rows stay as the assurance pass; this
  // row is the duty.
  entry({
    key: 'evac_process_events',
    triggerSource: '⛔ NO SOURCE IN THIS SYSTEM. The events arise in the responsible person’s person-centred process, which is deliberately held elsewhere; today they reach us only if that party relays them. The interface needs a defined route, not goodwill',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '⛔ THE ANNUAL INTERFACE ROWS ARE THE ASSURANCE PASS. THIS ROW IS THE DUTY. SI 2025/797 runs on '
      + 'events and requests, not on a calendar: a resident may REQUEST a person-centred assessment '
      + 'and one must then be carried out (reg 6(b)); a review must happen earlier than the twelve '
      + 'months wherever there is reason to believe the assessment or statement needs amending, or at '
      + 'the resident\u2019s reasonable request (reg 9(4)). An annual pass cannot discharge either, and '
      + 'must not be allowed to look as though it does. '
      + '⚠ A DETAIL THAT IS EASY TO LOSE: an earlier triggered review RESETS the twelve months. A '
      + 'scheduler that keeps the original anniversary will show the next review as due too early and, '
      + 'worse, will make the triggered review look like an extra rather than the duty discharged. '
      + '⛔ THIS DOES NOT REOPEN THE RESIDENT-DATA DECISION. Like the other four, this is an INTERFACE '
      + 'row: what crosses to us is that an event occurred, that the process ran, who owns it and when '
      + 'it was confirmed. The assessments, the statements and the residents they concern stay in the '
      + 'system that governs health data — which is what reg 12 is for. '
      + '❓ The question this row asks of the arrangements is not "who does the assessment" but "by '
      + 'what route does a resident\u2019s request reach the responsible person at all, and what starts '
      + 'the clock when it does?" A duty that fires on a request fails silently if nobody can receive '
      + 'one.',
    name: 'Residential evacuation — event and request interface',
    description:
      'On any event in the residential evacuation process, confirm through the owning system that the '
      + 'required step was taken and recorded: a new relevant resident identified · a resident '
      + 'requesting a person-centred fire risk assessment · an assessment completed · mitigating '
      + 'measures required or put in place · an emergency evacuation statement agreed, amended or '
      + 'withdrawn · a resident requesting a review · reason arising to believe an assessment or '
      + 'statement needs amending · consent for the fire and rescue authority information given or '
      + 'withdrawn · a relevant resident\u2019s status changing or the resident leaving.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (Residential Evacuation Plans) (England) Regulations 2025 (SI 2025/797) — reg 5 (identification, by reasonable endeavours), reg 6(a) (offer an assessment to each relevant resident identified) and reg 6(b) ("ensure a person-centred fire risk assessment is carried out for each relevant resident who requests one"), reg 7 (mitigation of risks), reg 8 (emergency evacuation statement, by reasonable endeavours to agree), reg 9(4) (review where there is reason to believe amendment is required, or at the reasonable request of the relevant resident), reg 10 (information to the local fire and rescue authority, with consent), reg 11 (relevant resident\u2019s representative). ⚠ None of these is a calendar duty. Reg 9(3)\u2019s twelve months is the only period the instrument states, and an earlier triggered review under reg 9(4) restarts it',
    intervalBasis: 'stated',
    trigger: 'Any event or request in the residential evacuation process — identification, a request for an assessment, an assessment or mitigation completed, a statement agreed, amended or withdrawn, a request for review, reason to believe amendment is required, consent given or withdrawn, or a change in a resident\u2019s relevant status',
    triggerType: 'event',
    responsibleParty: 'Responsible person, through the system that owns the person-centred process',
    competencyRequired: 'Person able to recognise which events start a statutory step, and to confirm the step was taken without holding the personal data behind it',
    evidenceRequired: 'Per-event record: what occurred, the date it became known, which regulation it engaged, that the required step was taken and by whom, and the date — with no personal or health data crossing into this register',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⚠ No home. The 2025 regime is held as an interface and nothing in the portal receives these events, so today this depends on a person relaying them.',
    evidencedBy: null,
    appliesWhen: 'Always — the building is a specified residential building within SI 2025/797',
  }),
  entry({
    key: 'evac_building_plan_prepare',
    triggerSource: 'Golden Thread document control, on first issue and on each amendment arising from a review',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
    reviewerNote: 'Distinct from the annual review: reg 13 first requires the plan to be PREPARED, provided to the local fire and rescue authority, and a copy placed in the secure information box where the building has one. ⚠ REG 13(2) ALSO PRESCRIBES WHAT THE PLAN MUST CONTAIN, so a plan that is prepared, issued and boxed can still be non-compliant on its face. Three things: the instructions to residents relating to the EVACUATION STRATEGY for the building required by FSER reg 9 · confirmation of WHETHER OR NOT there are relevant residents, the negative being as much a required statement as the positive · and information about ANY OTHER ARRANGEMENTS for evacuating the building. ⛔ THE FIRST IS BLOCKED HERE: this building\u2019s evacuation strategy is not settled, and a plan cannot state instructions relating to a strategy nobody has determined. That makes the strategy a dependency of a statutory document rather than a question that can wait, which is why it now heads the actions schedule instead of sitting in a list of things we would like to know.',
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
    appliesWhen: 'The building is a "specified residential building" under SI 2025/797 reg 3: two or more sets of domestic premises, AND ANY ONE OF (a) at least 18 metres, (b) at least seven storeys, or (c) more than 11 metres with a simultaneous evacuation strategy. ⚠ The three are ALTERNATIVES. This building qualifies under (a) and (b) on height and storeys alone, so limb (c) is not relied on and a simultaneous evacuation strategy is NOT a precondition of these Regulations applying here',
  }),
  entry({
    key: 'evac_building_plan_review',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
    sourceIntervalWords: 'within 12 months of the plan first being prepared, and every 12 months thereafter (SI 2025/797 reg 13)',
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
    maxIntervalDays: 365,
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
    appliesWhen: 'The building is a "specified residential building" under SI 2025/797 reg 3: two or more sets of domestic premises, AND ANY ONE OF (a) at least 18 metres, (b) at least seven storeys, or (c) more than 11 metres with a simultaneous evacuation strategy. ⚠ The three are ALTERNATIVES. This building qualifies under (a) and (b) on height and storeys alone, so limb (c) is not relied on and a simultaneous evacuation strategy is NOT a precondition of these Regulations applying here',
  }),
  entry({
    key: 'evac_person_centred_review',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    sourceIntervalWords: 'no later than 12 months after the emergency evacuation statement was first recorded, and every 12 months thereafter (SI 2025/797 reg 9(3))',
    reviewerNote: 'INTERFACE ONLY — an RP-controlled record, deliberately not held in this system; what crosses is the dated confirmation that the review happened. ⚠ THIS ROW IS THE ANNUAL PASS AT REG 9(3) AND NOTHING MORE. Reg 9(4) requires a review EARLIER wherever there is reason to believe an assessment or statement needs amending, or at the reasonable request of the resident — those live on the event and request row, because a calendar cannot raise them. An early review RESTARTS the 12 months rather than sitting alongside them: a scheduler anchored to the original date will call the next review early and will log the triggered one as an extra, when it was the duty being discharged.',
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
    maxIntervalDays: 365,
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
    triggerSource: 'The building work change-control screen, on completion of any works touching the external walls. ⚠ It is the ONLY source, so works that bypass the screen bypass this duty',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
    reviewerNote:
      'Reg 5(3) fires on a significant change to the external walls. Nothing detects that automatically '
      + '— it depends on someone raising it when works complete. ⚠ The record is not just a description '
      + 'of the build-up: reg 5(2) requires it to carry the level of risk the fire risk assessment '
      + 'identifies from that design and those materials, and the mitigating steps taken. A record '
      + 'without those two is incomplete as a matter of law. '
      + '⚠ ASKED ON REVIEW, AND THE ANSWER IS DELIBERATE: there is NO periodic external wall fire '
      + 'appraisal in this register because no instrument imposes one. A PAS 9980 appraisal (an FRAEW) '
      + 'is commissioned to answer a question, not on a cycle — once it is done, what brings it back '
      + 'is a change, and the change is caught here and by the art 9(3) fire risk assessment trigger, '
      + 'which since the Fire Safety Act 2021 expressly reaches the external walls. Adding a periodic '
      + 'row would invent a duty and, worse, would imply the trigger rows were not enough. ⚠ Two things '
      + 'do carry forward from an appraisal and belong elsewhere: any interim measure it recommends is '
      + 'a conditional row with an end condition, and the risk level and mitigating steps it produces '
      + 'are what reg 5(2) requires this record to carry.',
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    sourceIntervalWords: 'within each period of 12 months (FSER reg 9(3)(b)) — and to a new resident as soon as reasonably practicable after they move in',
    name: 'Fire safety instructions to residents — refresh',
    description: 'Re-issue the fire safety instructions and evacuation information to all residents.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Fire Safety (England) Regulations 2022, reg 9(3) — "within each period of 12 months"',
    intervalBasis: 'stated',
    frequencyDays: 365,
    maxIntervalDays: 365,
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    sourceIntervalWords: 'within each period of 12 months (FSER reg 10(3)) — and to a new resident as soon as reasonably practicable after they move in',
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
    maxIntervalDays: 365,
    triggerType: 'calendar',
    responsibleParty: 'Responsible person',
    competencyRequired: 'Person issuing resident communications',
    evidenceRequired: 'Per issue: the content given, the audience it reached, the date, the delivery method, and how it was made accessible to any resident who needs it in another form — plus a separate record of issue to each new resident, dated against when they became a resident',
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
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
  // ⚠ ADDED 2026-09-14 on review. The reviewer said "refuse appears four times
  // and there is no bin store row" — the four hits are the word "refused" (a
  // refused access request, a refused consent), so their evidence was a false
  // positive and their conclusion was right anyway: there was no row.
  entry({
    key: 'refuse_store_check',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      'Bin stores are among the most common ignition points in residential blocks — deliberate '
      + 'ignition and discarded smoking materials both — and they usually sit against or beneath the '
      + 'building, so a fire that starts in one starts OUTSIDE the compartmentation the strategy '
      + 'relies on and works inwards. '
      + '⚠ The recurring failure is not the store, it is what is left outside it: bags stacked against '
      + 'the wall on collection day, a bulky item nobody will take, a bin wheeled under a window or up '
      + 'against a ventilation opening. That is why this is a frequent walk rather than a service. '
      + '✅ CONFIRMED 2026-09-15: THERE IS A REFUSE CHUTE, with access hoppers on every floor from '
      + 'the ground to the seventh, a vent stack, and a fire damper at its foot in the upper basement. '
      + '⚠ THE CHUTE IS A VERTICAL SHAFT BREACHING EIGHT COMPARTMENT FLOORS and ending in a refuse '
      + 'store. That is what makes the damper at its foot the one you would least want to find seized, '
      + 'and why the HOPPERS belong in this check rather than beside it: a hopper propped, damaged or '
      + 'missing its seal is an open route between a dwelling floor and a fire in the bins. '
      + '❓ Confirm where the stores are, whether any is within or beneath the building, whether the '
      + 'chute has a sprinkler head as well as the damper, and what separation distance the '
      + 'fire strategy assumed — the last one is what decides whether bins against the wall are '
      + 'untidy or dangerous.',
    name: 'Refuse and bin stores — fire safety check',
    description:
      'Check each refuse store, chute room and external bin enclosure: that it is secure against '
      + 'casual access, that its door self-closes and latches, that combustible material is not '
      + 'accumulating outside the containers or against the building, that bins stand where the fire '
      + 'strategy assumes and not under openings, and that any chute, damper or sprinkler head is '
      + 'clear and undamaged.',
    group: 'fire_safety',
    basis: 'statute',
    statutoryRef: 'Regulatory Reform (Fire Safety) Order 2005 — art 9 (the fire risk assessment, which sets the control and the separation assumed), art 11 (fire safety arrangements for the effective planning and review of preventive and protective measures), and art 17(1) for the store enclosure, its door and any chute damper as fire safety measures that must be maintained. ⚠ No interval is stated anywhere — weekly is ours, chosen against the rate at which the hazard actually accumulates',
    intervalBasis: 'practice',
    frequencyDays: 7,
    triggerType: 'calendar',
    responsibleParty: 'Site staff',
    competencyRequired: 'Briefed site staff who know what the fire strategy assumes about bin positions and separation',
    evidenceRequired: 'Check record per store, with an exception report on anything found and what was done about it',
    retentionPeriodMonths: 36,
    handledBy: 'inspection',
    handlingNote: 'Suits an inspection walk, and sits naturally alongside the escape route obstruction round.',
    evidencedBy: 'inspection',
    appliesWhen: 'The building has a refuse store, bin chute or external bin enclosure',
  }),
  // ⚠ ADDED 2026-09-15. The refuse chute had no service row at all: the weekly
  // walk looks at the store, the damper row tests the damper, and nothing
  // covered the hoppers or the chute itself. Confirmed by the duty holder that
  // the hoppers and damper ARE inspected and serviced — the interval is what is
  // not yet known.
  entry({
    key: 'refuse_chute_service',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '✅ ANNUAL, CONFIRMED BY THE DUTY HOLDER 2026-09-15. The interval is the contract\u2019s and ours '
      + 'rather than any standard\u2019s — neither BS 5906 nor BS 1703 sets one for a particular '
      + 'installation — so it is recorded as established practice and would change if the contract did. '
      + '⚠ THIS ROW AND THE DAMPER ROW ARE ONE VISIT BY ONE COMPANY AND TWO SEPARATE ACTIVITIES ON '
      + 'DIFFERENT COMPONENTS, which is what keeps them separable. The damper test is DW145 on ONE '
      + 'component in the upper basement — drop the blade, prove the fusible link, reinstate. This row '
      + 'is the chute system across NINE: eight hopper doors with their seals and self-closing action, '
      + 'and the chute interior with the cleaning that stops residue accumulating in a shaft running '
      + 'past eight floors. '
      + '⚠ Scope each row to ITS OWN components rather than to "the chute system", and the records '
      + 'cannot merge by accident. One visit, one invoice and one certificate covering both is the way '
      + 'a chute clean ends up standing as evidence that a fire damper was tested. '
      + '⚠ THE HOPPERS ARE THE FIRE-SAFETY PART. Each is an opening into a shaft that breaches eight '
      + 'compartment floors and ends at the bins. A hopper that no longer closes, or whose seal has '
      + 'gone, is an open route from a dwelling floor to a fire in the store. '
      + '❓ Confirm the contracted interval, what the service covers, whether the chute is cleaned as '
      + 'well as inspected, and the BS 1703 edition being worked to.',
    name: 'Refuse chute, hoppers and chute damper — inspection and service',
    description:
      'Inspect and service the refuse chute system: each hopper door, its seal and self-closing '
      + 'action, the chute interior and its cleaning, the discharge into the store, and the condition '
      + 'of the chute damper — recording each hopper separately, floor by floor.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 5906:2005, Waste management in buildings — Code of practice, which refers to BS 1703 for the cleaning of chutes. ⚠ NEITHER SETS A SERVICING INTERVAL THAT APPLIES TO EVERY INSTALLATION, so the ANNUAL cycle is the contract’s and ours rather than either standard’s — confirmed by the duty holder 2026-09-15. ❓ The BS 1703 edition being worked to is still not recorded. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". A hopper that no longer closes is a failed fire safety measure, whatever the waste code says about cleaning',
    intervalBasis: 'practice',
    frequencyDays: 365,
    triggerType: 'calendar',
    responsibleParty: 'Refuse chute service contractor',
    competencyRequired: 'Competent chute service engineer; the damper element requires a competent damper engineer as defined by DW145',
    evidenceRequired: 'Service record per hopper by floor, the chute cleaning record, and the damper condition — kept separately from the DW145 damper test record even where one visit produces both',
    retentionPeriodMonths: 120,
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'The building has a refuse chute',
  }),
  entry({
    key: 'tabletop_fire_exercise',
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'The duty holder under the Electricity at Work Regulations 1989 — the employer, self-employed person or manager, to the extent of their control',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
  // ⛔ DELETED 2026-09-14 — 'eicr_dwellings', the five-yearly EICR for privately
  // rented dwellings under SI 2020/312 reg 3. The SECOND deletion this register
  // has ever made, after gas, and directed by the duty holder for the same kind
  // of reason: not a duty this building's register can ever hold.
  //
  // THE SCOPE IS COMMUNAL. The duty is real, but it sits with the landlord of
  // each individually let flat, separately and one by one — not with the
  // accountable person or the managing agent, neither of whom can discharge it
  // or evidence that it was discharged.
  //
  // ⚠ DO NOT RE-ADD IT, and do not add any other inspection inside a private
  // dwelling. A reviewer listing what is missing is looking at the BUILDING,
  // where these duties genuinely exist; this register's remit is the common
  // parts, the structure and the building's own systems. The stated scope is
  // the answer — the document does not justify individual absences, and adding
  // a row in order to explain why it does not apply is the same mistake in
  // reverse. `check-register-claims.mjs` guards this.
  //
  // ⚠ The flat ENTRANCE DOOR is not an exception to this: it is the compartment
  // boundary onto the common escape route and FSER reg 10(4) puts the duty on
  // the responsible person. The line falls at the door.
  entry({
    key: 'ev_charging_inspection',
    statutoryDutyHolder: 'The duty holder under the Electricity at Work Regulations 1989 — the employer, self-employed person or manager, to the extent of their control',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'The duty holder under the Electricity at Work Regulations 1989 — the employer, self-employed person or manager, to the extent of their control',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'The employer, or the person who has control of the premises or work equipment, to the extent of that control',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    sourceIntervalWords: 'at least every 6 months (LOLER reg 9(3)(a)(i))',
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
    frequencyDays: 175,
    maxIntervalDays: 181,
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
    key: 'firefighting_lift_weekly_test',
    statutoryDutyHolder: 'Responsible person (Regulatory Reform (Fire Safety) Order 2005, art 3)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '⚠ THIS IS NOT THE STATUTORY MONTHLY CHECK, AND NEITHER REPLACES THE OTHER. FSER reg 7 asks '
      + 'whether the lift is in efficient working order and good repair; a lift running normally '
      + 'passes that. This asks whether it still responds to the FIRE CONTROL — the one function '
      + 'nobody exercises in ordinary use, and the only one that matters on the day. A lift can '
      + 'carry passengers faultlessly for a year with a dead firefighting switch. '
      + '⚠ FOUR THINGS ARRIVE WITH THE DESIGNATION, and they are easy to miss because each belongs '
      + 'to a different row: the lift needs a SECONDARY POWER SUPPLY, which switches on the standby '
      + 'supply row · the FSER reg 6(2) FLOOR PLANS must identify which lifts are firefighters\' or '
      + 'evacuation lifts, so plans showing the old arrangement become wrong and have to be re-issued '
      + 'to the fire and rescue authority and replaced in the secure information box · the reg 7 '
      + 'monthly check already names both designations, so no separate decision is needed there · '
      + 'and installing or re-designating a lift is a significant change, which fires the fire risk '
      + 'assessment review trigger and goes through the building-work screen. '
      + '❓ Confirm from the installation which designation applies, and take the detailed weekly '
      + 'schedule from BS 8899 clause 8 rather than from this row — it is more specific than a '
      + 'register entry should be.'
      + ' ⚠ INTERNAL SCHEDULING LIMIT. The day figure on this row is OUR arithmetic on the period the standard states in words, not a figure the standard contains. It exists so a scheduler that can only count days has something to count, and it does not alter what the standard requires.',
    name: 'Firefighting or evacuation lift — weekly operational test under fire control',
    description:
      'Weekly test that a designated lift still operates under fire or evacuation control: operate '
      + 'the landing interface switch at the fire service access level, confirm the car answers the '
      + 'call and comes under firefighter or evacuation control, and confirm the car communication '
      + 'works. Record any failure as an immediate defect, not as a note for the next service.',
    group: 'fire_safety',
    basis: 'standard',
    statutoryRef: 'BS 9999:2017 Annex I (weekly, monthly and annual checks for lifts under fire or evacuation control) and BS 8899:2016 clause 8 (routine inspection, maintenance and thorough examination of lifts for use by firefighters and evacuation lifts), with BS EN 81-72 for the firefighters\' lift itself. ⚠ THE UNDERLYING DUTY IS STATUTORY: Regulatory Reform (Fire Safety) Order 2005 art 17(1) — "where necessary in order to safeguard the safety of relevant persons", the premises and any facilities, equipment and devices "provided in respect of the premises" under the Order or any other enactment must be "subject to a suitable system of maintenance and are maintained in an efficient state, in efficient working order and in good repair". The standard supplies the METHOD and the INTERVAL — subject to the edition adopted, the system’s design, category and configuration, the manufacturer’s requirements and the building’s fire risk assessment; art 17 is why the measure must work at all',
    intervalBasis: 'stated',
    frequencyDays: 7,
    maxIntervalDays: 7,
    maxIsSchedulingTolerance: true,
    sourceIntervalWords: 'weekly (BS 9999:2017 Annex I; BS 8899:2016 clause 8)',
    triggerType: 'calendar',
    responsibleParty: 'Site staff or lift contractor',
    competencyRequired: 'Briefed person who knows what correct fire-control behaviour looks like for this installation — not simply that the lift moved',
    evidenceRequired: 'Weekly log per designated lift recording the switch operated, the behaviour observed and any defect raised',
    retentionPeriodMonths: 36,
    handledBy: 'inspection',
    handlingNote: 'Suits an inspection walk. ⚠ Nothing to schedule until a lift carries the designation — record the not-applicable decision with a review date. Replacing a lift, or re-designating one, switches this on.',
    evidencedBy: 'inspection',
    appliesWhen: 'A lift is designated as a firefighters\' lift or an evacuation lift. ⚠ Not the case today',
  }),
  entry({
    key: 'lift_maintenance',
    statutoryDutyHolder: 'None — binding by agreement rather than by law',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
  // ⚠ ADDED 2026-09-14 on review, as a conditional row: a two-level basement
  // car park usually has a powered gate, barrier or shutter, and nothing in the
  // register mentioned one. Whether this one does is not recorded either way.
  entry({
    key: 'powered_gate_inspection',
    statutoryDutyHolder: 'The employer, or the person who has control of the premises or work equipment, to the extent of that control',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '✅ CONFIRMED BY THE DUTY HOLDER 2026-09-15: THIS ROW APPLIES. The site has four gate-like '
      + 'assets and they are not equally in scope — **the powered CAR PARK gate is the one this row '
      + 'is about**. The second gate is manual and decorative, so it is not machinery and carries no '
      + 'force-limitation duty. The shutters are recorded as existing but unused. '
      + '⚠ "UNUSED" IS NOT "OUT OF SCOPE" WHILE IT CAN STILL BE OPERATED. A shutter nobody uses is a '
      + 'shutter nobody maintains, and the duty attaches to equipment that could be put into service, '
      + 'not to equipment somebody intends to use. Either confirm it is permanently immobilised and '
      + 'record that, or keep it in the regime. '
      + '⚠ A POWERED GATE IS MACHINERY, and it has a recognised history of killing residents and '
      + 'children in exactly this setting. It is also the asset most likely to have been installed '
      + 'without a force test and never tested since, because it goes on working perfectly while '
      + 'being unsafe — the two are unrelated. '
      + '⚠ The control is NOT "does it open and close". It is whether the closing and crushing forces '
      + 'are within the permitted limits when measured, whether every safety edge and photocell still '
      + 'stops and reverses it, and whether the manual release works and someone on site knows where '
      + 'it is. '
      + '❓ WHAT REMAINS OPEN is not whether the gate exists but what is known about it: whether a '
      + 'force-test record exists at all and when the forces were last measured, who holds the '
      + 'installation\u2019s risk assessment, and whether the shutters are permanently immobilised or '
      + 'merely unused. ⚠ A gate in service with no force-test record is the normal finding, not an '
      + 'unusual one.',
    name: 'Powered gates, barriers and doors — safety inspection',
    description:
      'Inspect and test each powered gate, barrier, shutter or automatic door: closing and crushing '
      + 'forces measured against the permitted limits, safety edges and photocells proved to stop and '
      + 'reverse, obstacle detection confirmed, manual release proved and its location known on site, '
      + 'and the installation’s risk assessment and force-test records confirmed current.',
    group: 'other_statutory',
    basis: 'statute',
    statutoryRef: 'Provision and Use of Work Equipment Regulations 1998, reg 5 (maintenance) and reg 6 (inspection); Health and Safety at Work etc. Act 1974 s.3 (the duty to persons not at work — here residents, visitors and children); Supply of Machinery (Safety) Regulations 2008 for the equipment as supplied and for the responsibilities that follow a modification. BS EN 12453 and BS EN 12604 with the Door and Hardware Federation code of practice supply the method and the force measurements. ⚠ No instrument states an interval — six-monthly is ours',
    intervalBasis: 'practice',
    frequencyDays: 182,
    triggerType: 'calendar',
    responsibleParty: 'Automatic gate contractor',
    competencyRequired: 'Competent automatic gate engineer, DHF or equivalent scheme trained, with calibrated force-measuring equipment',
    evidenceRequired: 'Service and force-test record per installation, with the measured forces at the specified points, the safety devices proved, and any defect and its rectification',
    retentionPeriodMonths: 120,
    handledBy: 'maintenance',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'The site has a powered gate, barrier, roller shutter or automatic pedestrian door',
  }),
  entry({
    key: 'water_temperature_monitoring',
    statutoryDutyHolder: 'The employer, or the person who has control of the premises or work equipment, to the extent of that control',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
  // ⚠ ADDED 2026-09-14 on review, and the gap is specific rather than general:
  // the register had temperature monitoring, tank inspection and the risk
  // assessment review — three controls, none of which reaches water standing
  // still in a dead leg. The word "flush" appeared nowhere.
  entry({
    key: 'legionella_outlet_flushing',
    statutoryDutyHolder: 'The employer, or the person who has control of the premises or work equipment, to the extent of that control',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '⚠ TEMPERATURE MONITORING DOES NOT COVER THIS. Monitoring proves the system is running hot and '
      + 'cold where it is measured; it says nothing about an outlet nobody has opened for a month, '
      + 'which is the specific condition legionella needs. The three water rows already in this '
      + 'register all miss it in the same direction. '
      + '⛔ THE LIST OF LITTLE-USED OUTLETS IS A PRECONDITION, AND IT IS A LIVING LIST. A flat that '
      + 'falls vacant, a cleaners’ cupboard that stopped being used when a cleaning contract '
      + 'changed, a tap installed for a works project and left in place, a guest suite between '
      + 'bookings — each creates a dead leg that no monitoring regime will reveal, and none of them '
      + 'announces itself to whoever maintains the list. '
      + '❓ Confirm that the written scheme names the little-used outlets, who keeps that list '
      + 'current, and what flush duration and temperature it specifies. '
      + '⛔ THIS ROW REACHES THE COMMUNAL SYSTEM ONLY, up to each dwelling’s point of supply — which '
      + 'the flushing round needs to know, because the boundary is not obvious at the tap. '
      + '⚠ A flat standing empty for months is still a dead leg hanging off that communal system; '
      + 'where the risk assessment identifies one, the control belongs in the written scheme, not on '
      + 'this row.',
    name: 'Little-used outlets — flushing',
    description:
      'Flush the outlets the written scheme identifies as little-used IN THE COMMUNAL SYSTEM — '
      + 'cleaners’ cupboards and sluices, plant room, guest and landlord’s taps, communal showers '
      + 'and hose bibs — running each to temperature for the period the scheme specifies, and '
      + 'recording it per outlet rather than per round.',
    group: 'other_statutory',
    basis: 'statute',
    statutoryRef: 'Health and Safety at Work etc. Act 1974 ss.2 and 3; Control of Substances Hazardous to Health Regulations 2002, reg 7 (prevention or control of exposure); ACOP L8 and HSG274 Part 2 supply the method, and HSE guidance is to flush infrequently used outlets at least weekly. ⚠ The BINDING document is this building’s own written scheme — it names the outlets and sets the frequency and duration, and weekly is the guidance figure we have adopted pending confirmation of what the scheme says',
    intervalBasis: 'practice',
    frequencyDays: 7,
    triggerType: 'calendar',
    responsibleParty: 'Site staff or water hygiene contractor',
    competencyRequired: 'Person briefed to the written scheme, working from the current list of little-used outlets',
    evidenceRequired: 'Flushing record per outlet, with date, duration and temperature achieved, and a dated record of any change to the list of outlets',
    retentionPeriodMonths: 60,
    handledBy: 'inspection',
    evidencedBy: 'inspection',
    appliesWhen: 'The written scheme identifies outlets that are used infrequently',
  }),
  entry({
    key: 'legionella_risk_review',
    statutoryDutyHolder: 'The employer, or the person who has control of the premises or work equipment, to the extent of that control',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'The employer, or the person who has control of the premises or work equipment, to the extent of that control',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'The duty holder under reg 4 of the Control of Asbestos Regulations 2012 — the person with an obligation for the maintenance or repair of the premises',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    triggerSource: '⛔ NO AUTOMATED SOURCE. Every work order must be gated against the asbestos register by the person raising it; nothing in the portal enforces that today',
    statutoryDutyHolder: 'The duty holder under reg 4 of the Control of Asbestos Regulations 2012 — the person with an obligation for the maintenance or repair of the premises',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'The employer, or the person who has control of the premises or work equipment, to the extent of that control',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '⛔ THE SYSTEM PROTECTING THIS BUILDING BELONGS TO THE ADJOINING ONE (confirmed by the duty '
      + 'holder, 2026-09-15), and that changes who can act on it rather than whether it matters. We '
      + 'rely on a protective measure we do not own, cannot unilaterally maintain, and would not be '
      + 'told about if it were altered or removed. '
      + '⚠ THE FAILURE MODE HERE IS LEGAL AND ADMINISTRATIVE RATHER THAN TECHNICAL. The likeliest way '
      + 'this protection is lost is not a failed earth test — it is the neighbour reroofing, '
      + 'redeveloping, or simply decommissioning a system they have no reason to think anyone else '
      + 'depends on. No inspection regime detects that. '
      + '❓ Confirm who owns and maintains it · whether any agreement, easement or lease term secures '
      + 'it · whether the test results reach us · who would tell us if it changed · and what this '
      + 'building would need if it were withdrawn. ⚠ Until then the row can be scheduled but the duty '
      + 'behind it cannot be discharged by us alone, which is a different kind of gap from an overdue '
      + 'test. '
      + '❓ OPEN: annual is our selected interval, and it should be confirmed against the installed '
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
  // ⚠ ADDED 2026-09-14 on review. The register had a roof and façade visual
  // check and nothing about the equipment people rely on to get up there.
  //
  // ⚠ THE REVIEWER'S CITATION IS WRONG AND THE DUTY IS REAL — verified against
  // legislation.gov.uk 2026-09-14. They cited Work at Height Regs 2005 reg 12;
  // reg 12 applies to "work equipment to which regulation 8 and Schedules 2 to
  // 6 apply" — working platforms and the like — and states no 12-month period.
  // What actually carries it is Schedule 5, which makes each anchor's strength
  // and suitability the duty, and PUWER reg 6, which is the inspection
  // obligation for equipment exposed to conditions causing deterioration.
  entry({
    key: 'roof_anchor_inspection',
    statutoryDutyHolder: 'The employer, or the person who has control of the premises or work equipment, to the extent of that control',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '✅ CONFIRMED BY THE DUTY HOLDER 2026-09-15: there are NO roof anchors, lifelines or man-safe '
      + 'systems here. The row was WIDENED rather than excluded, on the duty holder\u2019s direction, and '
      + 'that is the better answer — the hazard was never "anchors", it was reaching the roof safely, '
      + 'and the fixed ladders and steps that do exist are work equipment under PUWER reg 6 exactly as '
      + 'an eyebolt would be. An excluded row would have left them inspected by nobody. '
      + '⚠ THE ONE ASSET ON A ROOF THAT NOBODY OWNS. Anchors are installed by a roofing or façade '
      + 'contractor, used by window cleaners, aerial engineers and anyone surveying the roof, and '
      + 'inspected by nobody unless somebody schedules it — while sitting in exactly the exposure '
      + 'PUWER reg 6 is written about. The person who trusts it is rarely the person who could have '
      + 'checked it. '
      + '⚠ ON THE LEGAL ROUTE, because it is commonly mis-cited: Work at Height Regulations 2005 '
      + 'Schedule 5 makes the anchor’s suitability and strength the duty, and PUWER reg 6 is the '
      + 'inspection obligation. Regulation 12 of the Work at Height Regulations, sometimes offered for '
      + 'this, applies to the work equipment in reg 8 and Schedules 2 to 6 and does not carry it. '
      + '❓ WHAT REMAINS OPEN, now that the answer on anchors is "none": what fixed access equipment '
      + 'there is and where, its condition and fixings, who installed it and whether any load or '
      + 'stability test was ever done, and how the roof is reached for each job that needs it. ⚠ If '
      + 'anchors, a lifeline or a man-safe system are ever installed, the BS 7883 regime and its '
      + 'shorter intervals for rope access or rescue use come with them — the row already covers that '
      + 'case and does not need rewriting.',
    name: 'Roof access equipment — inspection and recertification',
    description:
      'Inspect the fixed means of getting onto and around the roof — access ladders, step-overs, '
      + 'walkways, handrails and guarding — together with any permanent anchor devices, horizontal '
      + 'lifelines and man-safe systems '
      + 'on the roof and any façade access they serve — each anchor tested or inspected by the method '
      + 'the standard sets, the structural fixing and its substrate examined, and the system record, '
      + 'user information and rescue arrangements confirmed current.',
    group: 'other_statutory',
    basis: 'statute',
    statutoryRef: 'Work at Height Regulations 2005, Schedule 5 — "each anchor and the means of attachment thereto shall be suitable and of sufficient strength and stability for the purpose of supporting any foreseeable loading"; Provision and Use of Work Equipment Regulations 1998, reg 5 (maintenance) and reg 6 (inspection at suitable intervals where the equipment is exposed to conditions causing deterioration liable to result in dangerous situations). BS 7883:2019 supplies the method and the interval, and sets them by risk rather than as one fixed period. ⚠ Twelve months is the common cycle and is ours; a manufacturer’s requirement or rope-access use can make it shorter',
    intervalBasis: 'practice',
    frequencyDays: 365,
    triggerType: 'calendar',
    responsibleParty: 'Height safety contractor',
    competencyRequired: 'Competent person for the equipment in question — for fixed ladders, step-overs, walkways and guarding, someone able to assess the fixings and the substrate as well as the ladder; and where anchor devices, lifelines or man-safe systems exist, a competent person as defined by BS 7883:2019, independent of the installer where practicable',
    evidenceRequired: 'Record per item of access equipment and per anchor or system, identifying each by location, the inspection or test applied, its condition and fixings, the result, and the date the next inspection falls due',
    retentionPeriodMonths: 120,
    handledBy: 'maintenance',
    handlingNote: '⚠ Nobody currently owns this asset class in the portal — it is neither a building component nor a lift. It needs a home before it can be scheduled properly.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'The roof is reached by fixed access equipment — a ladder, steps, a walkway or guarding — or permanent anchor devices, lifelines or man-safe systems are installed on the roof or façade',
  }),
  entry({
    key: 'drainage_gutter_clearance',
    statutoryDutyHolder: 'None — binding by agreement rather than by law',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
  // ⚠ ADDED 2026-09-14, tenth review round, and it is the most telling omission
  // any round has produced: THE PORTAL HAS BUILT A DISPLAY REGISTER FOR THIS
  // DUTY (Admin → Display Register, migrations 199–200, three guaranteed
  // statutory slots) AND THE REGISTER NEVER LISTED THE DUTY AT ALL. The software
  // knew about a statutory obligation the compliance register did not.
  //
  // Verified against legislation.gov.uk 2026-09-14. There are TWO display
  // duties and they are not the same one:
  //   BSA 2022 s.82 — the PAP must display, TOGETHER in a conspicuous position,
  //     a notice in the PRESCRIBED FORM about accountable persons, the most
  //     recent building assessment certificate, and any relevant compliance
  //     notice. Failure without reasonable excuse is an OFFENCE carrying up to
  //     two years' imprisonment on indictment.
  //   SI 2023/907 reg 8 — the identity, address, telephone number and email of
  //     the PAP and of each other accountable person must be displayed in the
  //     common parts, in plain English.
  entry({
    key: 'display_prescribed_information',
    statutoryDutyHolder: 'Principal accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '⛔ THIS IS THE ONLY ROW IN THE REGISTER WHOSE BREACH IS AN IMPRISONABLE OFFENCE ON ITS OWN '
      + 'TERMS — s.82(6) makes failing to comply, without reasonable excuse, punishable by up to two '
      + 'years on indictment. It is also the cheapest duty here to discharge and the easiest to lose: '
      + 'a notice is taken down during redecoration, a certificate is superseded and not swapped, a '
      + 'compliance notice is withdrawn and the old one stays up. None of that announces itself. '
      + '⚠ TWO DUTIES, NOT ONE. s.82 requires the accountable-persons notice, the most recent building '
      + 'assessment certificate and any relevant compliance notice to be displayed TOGETHER in ONE '
      + 'conspicuous position. SI 2023/907 reg 8 separately requires the PAP\u2019s and each AP\u2019s '
      + 'identity, address, telephone number and email to be displayed in the common parts, in plain '
      + 'English. Satisfying one does not satisfy the other. '
      + '⚠ A SPECIAL MEASURES ORDER CHANGES WHAT MAY BE DISPLAYED: while one is in force the building '
      + 'assessment certificate must NOT be displayed and the notice requirement falls away. A row '
      + 'that only ever adds things to a wall will get this backwards. '
      + '❓ Confirm where the PRESCRIBED FORM of the s.82 notice is prescribed — it is not in '
      + 'SI 2023/907 reg 8, and a notice in the wrong form is a notice not given. Confirm also the '
      + 'display location against "conspicuous", and who replaces the certificate when a new one '
      + 'issues.',
    name: 'Displayed information — accountable persons, certificate and compliance notices',
    description:
      'Keep displayed, together in a conspicuous position in the building, the notice in the '
      + 'prescribed form about the accountable persons, the most recent building assessment '
      + 'certificate, and any relevant compliance notice — replacing each when it is superseded, '
      + 'removing the certificate while a special measures order is in force, and separately keeping '
      + 'the accountable persons\u2019 contact details displayed in the common parts. Confirm at each '
      + 'routine pass that all of it is present, current and legible.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Building Safety Act 2022, s.82 — the principal accountable person must display, together in a conspicuous position in the building, (a) a notice in the prescribed form containing prescribed information about accountable persons, (b) the most recent building assessment certificate, and (c) any relevant compliance notice; while a special measures order is in force the certificate must not be displayed and the notice duty does not apply. Failure to comply without reasonable excuse is an OFFENCE. Separately, Higher-Risk Buildings (Management of Safety Risks etc.) (England) Regulations 2023 (SI 2023/907) reg 8 requires the identity, address, telephone number and email address of the PAP and of each other accountable person to be displayed in the common parts, in plain English. ⚠ NEITHER STATES AN INTERVAL — the duty is continuous, and the monthly confirmation is ours',
    intervalBasis: 'practice',
    frequencyDays: 30,
    triggerType: 'calendar',
    responsibleParty: 'Principal accountable person',
    competencyRequired: 'Person who knows which certificate is current, which compliance notices are live, and that a special measures order REMOVES the certificate from display',
    evidenceRequired: 'Dated photograph or record of what is displayed and where, retained on each change, with the date each item went up and each superseded item came down',
    retentionPeriodMonths: 120,
    handledBy: 'admin',
    handlingNote: '⚠ The portal HAS this: Admin → Other Config → Display Register, with the three statutory items as guaranteed slots (migrations 199–200). The register did not list the duty until now, which is the wrong way round.',
    evidencedBy: 'inspection',
    appliesWhen: 'Always for an occupied higher-risk building',
  }),
  entry({
    key: 'scr_review',
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
    triggerSource: 'Golden Thread document approval — the safety case report reaching approved status, on first preparation and on every revision',
    statutoryDutyHolder: 'Principal accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    assuranceOnly: 'the change-notification row — SI 2023/396 reg 21 runs 28 days from AWARENESS of a change',
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
    // Re-based 2026-09-14 on external review, for the same reason the fire and
    // rescue service plans row was re-based a round earlier: SI 2023/396 reg 21
    // states no calendar interval, so a "Legislation" badge on an annual pass
    // let the annual date read as the obligation. The duty is the event-driven
    // row that follows; this is the assurance control over it.
    basis: 'management',
    // ⚠ Instrument corrected 2026-09-13 on external review — and this is the
    // second time this row has been wrong. It cited SI 2024/41 reg 5 (provision
    // of information to the regulator), which is a real provision but not the
    // KBI regime. KBI is its own instrument: SI 2023/396, whose reg 21 sets the
    // 28-day clock. The statutory duty is a CHANGE notification, not a review.
    statutoryRef: 'Our own assurance control over the duty at SI 2023/396 reg 21; the Regulations state no review interval, and the annual cycle is ours',
    intervalBasis: 'practice',
    frequencyDays: 365,
    triggerType: 'calendar',
    reviewerNote: 'This annual pass is OUR control, not a statutory cycle — the statutory duty is the event-driven notification on the row that follows, and it fires on the accountable person becoming AWARE of a change, not on a date. ⛔ An annual review cannot discharge a 28-day clock and must not be allowed to look as though it does: if this pass is the thing that finds a change, the duty was already late. It exists to catch what nobody noticed at the time, and to prove that nothing went unnotified.',
    responsibleParty: 'Principal accountable person',
    evidenceRequired: 'KBI submission record, and the dated confirmation that no unnotified change exists',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⚠ No home. KBI is not modelled anywhere in the portal.',
    evidencedBy: 'maintenance_job',
    appliesWhen: 'Always for an HRB',
  }),
  // ⚠ ADDED 2026-09-14, eighth review round — and this is the FIFTH time the
  // same shape has been found in this register: a calendar row standing where a
  // statutory trigger belongs. The others were FSER reg 6(6) plans, the 2025
  // evacuation process, the MOR and complaints workflows our annual rows
  // audited, and the fire risk assessment's art 9(3) triggers. A register
  // assembled from periodic activities is structurally blind to this, so the
  // question to keep asking of every calendar row is "where is the trigger?"
  entry({
    key: 'kbi_update_on_change',
    triggerSource: '⛔ NO SOURCE. KBI is not modelled anywhere in the portal, so neither the dataset nor the moment of awareness has a home. The 28 days run from awareness, which is precisely what nothing here can evidence',
    statutoryDutyHolder: 'Principal accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '⛔ AN ANNUAL ASSURANCE REVIEW CANNOT DISCHARGE THIS AND MUST NOT LOOK AS THOUGH IT DOES. The '
      + 'clock is 28 days from AWARENESS, so if the annual pass on the preceding row is what finds a '
      + 'change, the duty expired months earlier and the pass records the breach rather than '
      + 'preventing it. '
      + '⚠ The real control is upstream of this row: a change to the key building information is '
      + 'almost never announced as one. It arrives as a completed works order, a new energy supply, a '
      + 'changed use of a floor, a lift replacement or re-designation, a structural alteration — and '
      + 'the person who knows it happened is usually not the person who owes the notification. '
      + '❓ Confirm who in the chain, from contractor to managing agent to accountable person, is '
      + 'required to raise a change that might be KBI-relevant, by what route, and how the date '
      + 'awareness arose is captured. That date is what proves the 28 days were met, and it is the '
      + 'one thing nobody records by habit.',
    name: 'Key building information — notify a change',
    description:
      'On becoming aware of a change to the key building information, notify the regulator within 28 '
      + 'days, and record both the change and the date awareness of it arose.',
    group: 'bsa_cycle',
    basis: 'statute',
    statutoryRef: 'Higher-Risk Buildings (Key Building Information etc.) (England) Regulations 2023 (SI 2023/396), reg 21 — notify the regulator of any change to the key building information within 28 days of the principal accountable person becoming aware of the change',
    intervalBasis: 'stated',
    trigger: 'The principal accountable person becomes aware of a change to the key building information — the 28 days run from awareness, not from the change itself',
    triggerType: 'event',
    responsibleParty: 'Principal accountable person',
    competencyRequired: 'Person who knows what the key building information dataset contains, and can therefore recognise a change to it in an ordinary works record',
    evidenceRequired: 'The submission record AND the dated record of when awareness arose — the second is what evidences the 28 days, and it is the half that is routinely missing',
    retentionPeriodMonths: 120,
    handledBy: 'none',
    handlingNote: '⚠ No home. KBI is not modelled anywhere in the portal, so neither the dataset nor the awareness date has anywhere to live.',
    evidencedBy: null,
    appliesWhen: 'Always for an HRB',
  }),
  // ⚠ ADDED 2026-09-13, third review round. The reviewer's point is the one  // ⚠ ADDED 2026-09-13, third review round. The reviewer's point is the one
  // that makes this worth a row of its own: registration information and key
  // building information are DIFFERENT datasets with DIFFERENT clocks, and
  // treating them as one is exactly how the shorter of the two gets lost. KBI
  // is 28 days under SI 2023/396 reg 21; registration information is 14
  // relevant days under SI 2023/315 reg 4. Verified against legislation.gov.uk.
  entry({
    key: 'hrb_registration_information_update',
    triggerSource: '⛔ NO SOURCE. As with KBI, and on a shorter clock — 14 relevant days',
    statutoryDutyHolder: 'Principal accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    triggerSource: 'Golden Thread accountable-persons register, on any change to who holds an AP or PAP role',
    statutoryDutyHolder: 'Principal accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
    triggerSource: 'Golden Thread — an inbound request from a prescribed person, or a statutory trigger raised against a document',
    statutoryDutyHolder: 'Accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
    statutoryDutyHolder: 'Principal accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'Accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
    triggerSource: 'Golden Thread review-due tick (api/cron/review-tick)',
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
    triggerSource: 'MOR intake — the public reporting form, and any occurrence raised internally by any route',
    statutoryDutyHolder: 'Principal accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'Principal accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    triggerSource: 'Complaints intake, by any route the building safety complaints procedure recognises',
    statutoryDutyHolder: 'Principal accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None under the instruments in this register — the Housing Ombudsman Complaint Handling Code binds member landlords. The STATUTORY complaints duty is the principal accountable person’s under Building Safety Act 2022 s.93, and it has its own row',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None under the instruments in this register — the Housing Ombudsman Complaint Handling Code binds member landlords. The STATUTORY complaints duty is the principal accountable person’s under Building Safety Act 2022 s.93, and it has its own row',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',

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
    statutoryDutyHolder: 'Principal accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    sourceIntervalWords: 'at least every two years (SI 2023/907 reg 10(a))',
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
    triggerSource: '⛔ NO SOURCE. The need for access arises from the risk assessment or an apparent resident-duty contravention; nothing raises it automatically',
    statutoryDutyHolder: 'Accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    reviewerNote:
      '⚠ A POWER EXERCISED FOR A PURPOSE — NEVER A PERIODIC INSPECTION, and the distinction decides '
      + 'the shape of this whole register. Checked against the instruments 2026-09-14, because '
      + '"management can enter a flat" is easily misread as "management should be inspecting flats". '
      + 'Nothing imposes a periodic duty to inspect the interior of a dwelling on the accountable '
      + 'person or the managing agent: s.83 requires the risk assessment to be made at regular '
      + 'intervals, but only "as regards the part of the building for which they are responsible"; '
      + 'SI 2023/907 reg 4 requires systems for the inspection, testing and maintenance of THE '
      + 'MEASURES TAKEN, not of dwellings; and that instrument contains no dwelling-inspection '
      + 'regulation at all. What s.97 gives is a keyed power — it opens on suspicion, on a complaint, '
      + 'on a change, or on a resident duty apparently contravened, and it opens for one stated '
      + 'purpose at a time. '
      + '⚠ THE ONE PERIODIC DUTY THAT DOES REACH THROUGH A FRONT DOOR IS THE FLAT ENTRANCE DOOR — '
      + 'FSER 2022 reg 10(4), best endeavours at least every 12 months — and it is held on its own '
      + 'row. It is a common parts measure reached through a door, not an inspection of the home '
      + 'behind it. '
      + 'Distinct from information provision. What makes this worth a row is the failure case rather '
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
    statutoryRef: 'Building Safety Act 2022, s.97 (access to premises) — verified against legislation.gov.uk 2026-09-14. The power arises only for a stated PURPOSE: facilitating performance of a duty under s.83 or s.84 (assessment and management of building safety risks), or determining whether a duty under s.95 (duties on residents and owners) has been contravened. s.97(2) sets the form: the request must be IN WRITING, state the purpose, explain why entry is necessary for it, propose a reasonable time, and be given at least 48 HOURS before that time. Where entry is not given, s.97(3) allows an application to the county court for an order requiring access, which under s.97(4) may be made only where the court is satisfied entry is necessary for that purpose, and may authorise measurements, photographs, recordings or samples. s.97(5) defines "relevant premises" as premises in the part of the building for which the accountable person is responsible that are occupied or controlled by residents or owners of residential units',
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
    triggerSource: '⛔ NO SOURCE. It depends on whoever takes a building safety decision recognising that it requires consultation — which is the judgement most likely to be missed',
    statutoryDutyHolder: 'Principal accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'Principal accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    triggerSource: '⛔ NO SOURCE. Certificate expiry dates are not tracked anywhere in the portal',
    statutoryDutyHolder: 'None — binding by agreement rather than by law',
    retentionBasis: 'Internal policy, with a contract or insurer requirement on top — confirm the policy condition, which may be longer',
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
    statutoryDutyHolder: 'Accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
    triggerSource: '⛔ NO SOURCE, AND IT IS THE MOST LOAD-BEARING OF ALL OF THEM. Four other rows name this screen as THEIR trigger source, so anything that bypasses it bypasses them too',
    statutoryDutyHolder: 'Accountable person (Building Safety Act 2022, Part 4)',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'Shared: the accountable person under Building Safety Act 2022 Part 4, AND the responsible person under art 22 of the Fire Safety Order — each to the extent of their own role. Neither discharges the other’s duty',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Golden thread — kept while it remains the CURRENT record (SI 2023/907 reg 7), with superseded versions retained in the change history. The year figure is a floor, not the rule',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None — binding by agreement rather than by law',
    retentionBasis: 'Internal policy, with a contract or insurer requirement on top — confirm the policy condition, which may be longer',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    operationallyIncomplete: true,
    reviewerNote: 'Also specify: the acceptable position and tolerance, what counts as prohibited movement or damage, what triggers immediate isolation or evacuation, whether every finding goes to a structural engineer, whether photographs are date-stamped, and how long the props may remain before a permanent repair decision is forced. ⛔ OPERATIONALLY INCOMPLETE — this row is not yet a complete control. §5 sets out, once, the seven things every row in this group still lacks and why a frequent check standing beside an open defect is not assurance. The Completion action line below is the one that has to change.',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    operationallyIncomplete: true,
    reviewerNote: 'Also specify: the crack-width measurement method, the reference datum, the measurement tolerance, the corrosion progression criteria and the trigger values. ⚠ A monthly visual comparison is not a monitoring regime unless it is tied to the structural engineer’s specification — a photograph that shows change with no stated trigger value leaves the decision to whoever is looking. ⛔ OPERATIONALLY INCOMPLETE — this row is not yet a complete control. §5 sets out, once, the seven things every row in this group still lacks and why a frequent check standing beside an open defect is not assurance. The Completion action line below is the one that has to change.',
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
    triggerSource: 'The structural engineer’s monitoring specification, at the interval it sets',
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    operationallyIncomplete: true,
    reviewerNote: 'Also specify: the reading method, the datum, and the trigger value at which a reading escalates rather than simply being recorded. ⛔ OPERATIONALLY INCOMPLETE — this row is not yet a complete control. §5 sets out, once, the seven things every row in this group still lacks and why a frequent check standing beside an open defect is not assurance. The Completion action line below is the one that has to change.',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    operationallyIncomplete: true,
    reviewerNote: 'Also specify: what the interim measures are protecting against, and the condition on which they end. ⛔ OPERATIONALLY INCOMPLETE — this row is not yet a complete control. §5 sets out, once, the seven things every row in this group still lacks and why a frequent check standing beside an open defect is not assurance. The Completion action line below is the one that has to change.',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
      + 'ventilation. The building has two stairs and both are ventilated, by openable windows. '
      + '⚠ Daily is retained pending a decision, because relaxing a safety cadence '
      + 'is not a documentation change; but nothing in this register now justifies it.',
    evidencedBy: 'inspection',
    reviewerNote: '⚠ THE DAILY CADENCE HAS NO STATED REASON, and is deliberately left in place anyway. It was set on the basis of a single protected route with no smoke ventilation and no second chance. The building has TWO staircases, both ventilated by openable windows accepted as sufficient (confirmed by the duty holder, 2026-09-13; a mechanical system is expected but is not installed), so **nothing written in this register now supports a daily walk**. It has not been reduced here because relaxing a safety cadence belongs to whoever owns the fire risk assessment, not to a documentation exercise — but a control nobody can state a reason for is a cost as well as a comfort, and we would like the reason recorded or the cadence changed. Also specify the escalation triggers, so a finding is not left to judgement: doors wedged or propped open, failed self-closers, smoke leakage, damaged seals, obstructions, water ingress, and fire-stopping defects. ⛔ OPERATIONALLY INCOMPLETE — this row is not yet a complete control. §5 sets out, once, the seven things every row in this group still lacks and why a frequent check standing beside an open defect is not assurance. The Completion action line below is the one that has to change.',
    appliesWhen: 'The fire risk assessment or fire strategy calls for checks of an escape stair beyond the statutory escape-route and fire-door rounds',
  }),
  entry({
    key: 'lobby_to_stair_door_check',
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    reviewerNote: 'The weekly cadence was set assuming a single unventilated route, and that assumption does not hold — there are two staircases, both with openable windows accepted as sufficient (confirmed 2026-09-13). What can still be said for weekly is general rather than specific to this building: the quarterly statutory round alone would leave a wedged door or a failed closer unseen for up to three months. Whether that justifies weekly is a judgement for the fire risk assessment. Also specify the escalation triggers — wedged or propped doors, failed self-closers, damaged seals, smoke leakage — and who may take a door out of service. ⛔ OPERATIONALLY INCOMPLETE — this row is not yet a complete control. §5 sets out, once, the seven things every row in this group still lacks and why a frequent check standing beside an open defect is not assurance. The Completion action line below is the one that has to change.',
    appliesWhen: 'The fire risk assessment or fire strategy calls for checks of an escape stair beyond the statutory escape-route and fire-door rounds',
  }),
  entry({
    key: 'stair_lighting_check',
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
    reviewerNote: 'Two staircases, both ventilated by openable windows accepted as sufficient (confirmed 2026-09-13) — see the stair-core row on what that does to the cadence. Also specify what happens when a failure is found in the protected route, and whether temporary lighting or a compensatory control is required until it is fixed. ⛔ OPERATIONALLY INCOMPLETE — this row is not yet a complete control. §5 sets out, once, the seven things every row in this group still lacks and why a frequent check standing beside an open defect is not assurance. The Completion action line below is the one that has to change.',
    appliesWhen: 'The fire risk assessment or fire strategy calls for checks of an escape stair beyond the statutory escape-route and fire-door rounds',
  }),
  entry({
    key: 'alarm_coverage_gap_monitoring',
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    operationallyIncomplete: true,
    reviewerNote: '⚠ This row ages an open action; it does not close one. It must be tied to the specific open finding: the action owner, the original finding, the survey required, its due date, the interim mitigation relied on meanwhile, the decision-maker, the target completion date, the residual risk accepted, and what follows if the survey slips. A monthly ageing log is not a mitigation for a coverage gap that is safety-critical. ⛔ OPERATIONALLY INCOMPLETE — this row is not yet a complete control. §5 sets out, once, the seven things every row in this group still lacks and why a frequent check standing beside an open defect is not assurance. The Completion action line below is the one that has to change.',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
    operationallyIncomplete: true,
    reviewerNote: '⚠ Same as the coverage row: this is an ageing log over an open finding, not a substitute for the survey. Tie it to the action, its owner and its date. ⛔ OPERATIONALLY INCOMPLETE — this row is not yet a complete control. §5 sets out, once, the seven things every row in this group still lacks and why a frequent check standing beside an open defect is not assurance. The Completion action line below is the one that has to change.',
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
    statutoryDutyHolder: 'None — this is our own control, not a statutory duty. The statutory duty it assures sits elsewhere in this register',
    retentionBasis: 'Internal policy. ⚠ No instrument cited on this row sets any retention period',
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
