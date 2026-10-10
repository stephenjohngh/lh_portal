// src/lib/server/dbRules/dbRulesParity.test.js
//
// ⛔ THE CODE'S COPIES OF THE DATABASE'S RULES MUST AGREE WITH IT.
//
// ── Why there are two copies at all (decided 2026-10-03, §6ccc item 5) ───────
// The two copies do different jobs, and neither can do the other's:
//   · the DATABASE copy ENFORCES. A CHECK constraint or a lifecycle trigger is
//     what stops a direct API call doing what the screen would not allow, and
//     every permission in this portal rests on that. It cannot move to the code.
//   · the CODE copy PREDICTS. It decides which buttons to show and says WHY a
//     step is not allowed before anyone presses anything — and the offline
//     inspection walk cannot ask the database at all.
//
// ── Why not keep only one copy ───────────────────────────────────────────────
// Considered and declined. "One copy" can only mean one DEFINITION both sides
// read. That works for the simple parts — the allowed moves could be rows in a
// table both read, the value lists lookup tables — but not for the conditional
// rules (MOR's approver is not the proposer; a reference cannot change once
// set; Parking's deposit and device rules; the bay-overlap exclusion), which
// are logic, not data, and would still be written twice or force the screen to
// ask the database every time: a round trip, and a new way to fail, where a
// failed question shows no actions at all — the "failure that reads as
// success" fault of item 2. And it meant rewriting four working triggers on
// live data, MOR's 14-state machine among them, for rules that rarely change.
//
// ── What this does instead ───────────────────────────────────────────────────
// The real risk is narrow: somebody edits one copy and not the other. So the
// database's rules are exported, read-only, into dbRules.snapshot.json (see
// export-db-rules.sql beside this file), and this test holds every code copy
// to that snapshot. It is refreshed by `npm run db:rules`, which
// `npm run db:push:prod` runs after every push; after applying SQL any other
// way, run it yourself and commit the snapshot if it changed.
// If one rule turns out to change often, it can move to a table on its own.
//
// Where the code holds no copy (the waiting list's moves, a register action's
// status, a Golden Thread person's status), the database is already the only
// copy and there is nothing to compare.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as complaintLifecycle from '#lib/apps/complaints/utils/complaintLifecycle.js';
import * as complaintOptions   from '#lib/apps/complaints/utils/complaintOptions.js';
import * as mor                from '#lib/apps/mor/utils/morHelpers.js';
import * as gtLifecycle        from '#lib/apps/golden_thread/utils/gtLifecycle.js';
import * as gtRiskLifecycle    from '#lib/apps/golden_thread/utils/gtRiskLifecycle.js';
import * as gtRiskScoring      from '#lib/apps/golden_thread/utils/gtRiskScoring.js';
import * as gtConstants        from '#lib/apps/golden_thread/utils/gtConstants.js';
import * as agreementModel     from '#lib/apps/parking/utils/agreementModel.js';
import * as waitingListModel   from '#lib/apps/parking/utils/waitingListModel.js';
import * as tariffModel        from '#lib/apps/parking/utils/tariffModel.js';
import * as results            from '#lib/utils/resultConstants.js';
import * as registerKinds      from '#lib/utils/registerKinds.js';
import * as obligationEvidence from '#lib/utils/obligationEvidence.js';
import * as worksSchedule      from '#lib/apps/building_assets/utils/worksSchedule.js';
import * as datasetTemplates   from '#lib/apps/dossier/utils/datasetTemplates.js';
import * as spaceTypeOptions   from '#lib/apps/building_assets/utils/spaceTypeOptions.js';
import { ISSUE_STATUS }        from '#lib/utils/constants.js';
import { AVAILABLE_APPS }      from '#lib/apps/apps.js';
import { RATE_LIMIT_WINDOWS }  from '#lib/utils/policies.js';

const SNAP = JSON.parse(readFileSync(join(process.cwd(), 'src/lib/server/dbRules/dbRules.snapshot.json'), 'utf8'));

/** The values a code list holds, whatever shape it takes. */
function values(list) {
  if (list instanceof Set) return [...list];
  if (Array.isArray(list)) return list.map((x) => (typeof x === 'string' ? x : (x.value ?? x.key ?? x.code ?? x.id)));
  return Object.keys(list);
}
const sorted = (xs) => [...new Set(xs)].sort();

// table.column  →  the code copy of its value list.
const VALUE_LISTS = {
  'complaint_cases.status':           () => Object.values(complaintLifecycle.STATUS),
  'complaint_cases.category':         () => values(complaintOptions.CATEGORIES),
  'complaint_cases.channel':          () => values(complaintOptions.CHANNELS),
  'complaint_cases.complainant_type': () => values(complaintOptions.COMPLAINANT_TYPES),
  'complaint_cases.outcome':          () => values(complaintOptions.OUTCOMES),
  'mor_cases.status':                 () => values(mor.STATUS_LABEL),
  'mor_cases.mechanism':              () => values(mor.MECHANISM_LABEL),
  'mor_cases.channel':                () => values(mor.CHANNEL_LABEL),
  'mor_cases.reporter_type':          () => values(mor.REPORTER_TYPE_LABEL),
  'mor_cases.decision_outcome':       () => values(mor.DECISION_LABEL),
  'mor_cases.triage_outcome':         () => values(mor.TRIAGE_LABEL),
  'gt_documents.status':              () => values(gtLifecycle.GT_STATUSES),
  'gt_risks.status':                  () => values(gtRiskLifecycle.RISK_STATUSES),
  'gt_risks.domain':                  () => values(gtRiskScoring.RISK_DOMAINS),
  'gt_risks.source':                  () => values(gtRiskScoring.RISK_SOURCES),
  'gt_accountable_persons.role':      () => values(gtConstants.AP_ROLES),
  'gt_risk_links.relation':           () => values(gtConstants.RISK_LINK_RELATIONS),
  'gt_risk_links.target_type':        () => values(gtConstants.LINK_TARGET_TYPES),
  'parking_agreements.status':        () => values(agreementModel.STATUSES),
  'parking_agreements.basis':         () => values(agreementModel.BASES),
  'parking_agreements.fee_period':    () => values(agreementModel.FEE_PERIODS),
  'parking_agreements.vat_treatment': () => values(agreementModel.VAT_TREATMENTS),
  'parking_tariffs.vat_treatment':    () => values(agreementModel.VAT_TREATMENTS),
  'parking_tariffs.period':           () => values(agreementModel.FEE_PERIODS),
  'parking_holders.holder_type':      () => values(agreementModel.HOLDER_TYPES),
  'parking_applications.status':      () => values(waitingListModel.APPLICATION_STATUSES),
  'parking_tariffs.holder_class':     () => values(tariffModel.HOLDER_CLASSES),
  'parking_tariffs.bay_size':         () => values(spaceTypeOptions.PARKING_BAY_TYPES),
  'components.status':                () => values(results.STATUSES),
  'component_inspections.inspection_result': () => values(results.RESULT_LABELS),
  'statutory_register.kind':          () => values(registerKinds.REGISTER_KINDS),
  'statutory_register.action_category': () => values(registerKinds.ACTION_CATEGORIES),
  'statutory_register.priority':      () => values(registerKinds.ACTION_PRIORITIES),
  'statutory_obligations.evidenced_by': () => values(obligationEvidence.EVIDENCE_ROUTES),
  'works_schedule_items.action':      () => values(worksSchedule.WORKS_ACTIONS),
  'works_schedules.status':           () => values(worksSchedule.SCHEDULE_STATUS),
  'works_schedules.purpose':          () => values(worksSchedule.SCHEDULE_PURPOSE),
  'dossier_datasets.key':             () => values(datasetTemplates.TEMPLATE_KEYS),
  'issues.status':                    () => Object.values(ISSUE_STATUS),
};

// ⛔ MOR's timeline: migration 139 (reporter contact) was never applied, so the
// database refused every 'reporter_contact' entry and had no contact_kind at
// all until migration 234 (2026-10-04, §6ccc item 6). Held both ways now.
describe('MOR timeline', () => {
  it('accepts every entry type and contact kind the code writes, and no other', () => {
    expect(sorted(SNAP.checks['mor_timeline_entries.entry_type'] ?? [])).toEqual(sorted(values(mor.ENTRY_TYPE_LABEL)));
    expect(sorted(SNAP.checks['mor_timeline_entries.contact_kind'] ?? [])).toEqual(sorted(values(mor.CONTACT_KIND_LABEL)));
  });
});

// ⛔ The rate-limit actions must all be accepted by public_upload_attempts, or
// their attempts are never recorded and the limit never limits — which is what
// the four Dossier actions did until migration 233 (§6ccc item 10, 2026-10-04).
describe('rate limits', () => {
  it('every rate-limited action is one the attempts table accepts, and no other', () => {
    const accepted = SNAP.checks['public_upload_attempts.action'];
    expect(sorted(Object.keys(RATE_LIMIT_WINDOWS)),
      'a rate limit the attempts table does not accept never counts — widen its CHECK in a migration, then npm run db:rules')
      .toEqual(sorted(accepted));
  });
});

// App ids are compared one way round on purpose: every app that can be GRANTED
// must be accepted, or granting it fails. The database also accepts 'settings'
// — always visible, never granted, a harmless leftover in the CHECK.
describe('app grants', () => {
  it('every grantable app is accepted, and the only extra is settings', () => {
    const grantable = AVAILABLE_APPS.filter((a) => !a.alwaysVisible).map((a) => a.id);
    const accepted  = SNAP.checks['app_permissions.app_id'];
    expect(grantable.filter((id) => !accepted.includes(id))).toEqual([]);
    expect(accepted.filter((id) => !grantable.includes(id))).toEqual(['settings']);
  });
});

/** table.column → a predicate over (from, to): the code's copy of the moves. */
const TRANSITIONS = {
  'complaint_cases.status': complaintLifecycle.isValidTransition,
  'mor_cases.status':       mor.isValidTransition,
  'gt_documents.status':    gtLifecycle.isValidTransition,
  'gt_risks.status':        gtRiskLifecycle.isValidRiskTransition,
};

/** Every (from, to) pair a predicate allows, over the database's statuses. */
function allowedPairs(statuses, allows) {
  const out = [];
  for (const a of statuses) for (const b of statuses) if (a !== b && allows(a, b)) out.push(`${a} -> ${b}`);
  return out.sort();
}
const pairs = (moves) => moves.map(([a, b]) => `${a} -> ${b}`).sort();

describe('the database rules snapshot', () => {
  it('holds what it should (an export that matched nothing would pass every check below)', () => {
    expect(Object.keys(SNAP.checks).length).toBeGreaterThan(80);
    expect(Object.keys(SNAP.transitions).sort()).toEqual(Object.keys(TRANSITIONS).sort());
    expect(SNAP.parkingTransitions.parking_agreement_rules.length).toBeGreaterThan(5);
  });
});

describe('value lists: the code holds exactly what the database accepts', () => {
  for (const [col, read] of Object.entries(VALUE_LISTS)) {
    it(col, () => {
      expect(SNAP.checks[col], `no CHECK list for ${col} in the snapshot`).toBeDefined();
      expect(sorted(read())).toEqual(sorted(SNAP.checks[col]));
    });
  }
});

describe('lifecycles: the code allows exactly the moves the database allows', () => {
  for (const [col, allows] of Object.entries(TRANSITIONS)) {
    it(col, () => {
      expect(allowedPairs(SNAP.checks[col], allows)).toEqual(pairs(SNAP.transitions[col]));
    });
  }

  it('parking_agreements.status', () => {
    expect(allowedPairs(SNAP.checks['parking_agreements.status'], agreementModel.canTransition))
      .toEqual(pairs(SNAP.parkingTransitions.parking_agreement_rules));
  });
});
